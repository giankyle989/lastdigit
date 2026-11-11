import { prisma } from '@/lib/db'
import { setLastSyncAt } from '../settings'
import { settleGame } from '../settlement'
import { createBalldontlieFetcher, mapApiGame, type GamesFetcher } from './balldontlie'

export type SyncResult = { fetched: number; created: number; updated: number; skipped: number; settled: number }

const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function syncDates(now: Date): string[] {
  const today = easternDate.format(now) // YYYY-MM-DD
  const base = new Date(`${today}T12:00:00Z`)
  const dates: string[] = []
  for (let offset = -1; offset <= 7; offset++) {
    dates.push(new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10))
  }
  return dates
}

export function defaultFetcher(): GamesFetcher {
  const key = process.env.BALLDONTLIE_API_KEY
  if (!key) throw new Error('BALLDONTLIE_API_KEY is not set')
  return createBalldontlieFetcher(key)
}

export async function syncGames({
  fetchGames,
  now = new Date(),
}: {
  fetchGames: GamesFetcher
  now?: Date
}): Promise<SyncResult> {
  const apiGames = await fetchGames(syncDates(now))
  const result: SyncResult = { fetched: apiGames.length, created: 0, updated: 0, skipped: 0, settled: 0 }

  for (const apiGame of apiGames) {
    const mapped = mapApiGame(apiGame)
    if (!mapped) {
      result.skipped++
      console.warn('sync: skipped unusable game', apiGame.id, apiGame.status)
      continue
    }
    const existing = await prisma.game.findUnique({ where: { externalId: mapped.externalId } })
    if (!existing) {
      await prisma.game.upsert({ where: { externalId: mapped.externalId }, create: mapped, update: {} })
      result.created++
      continue
    }
    // FINAL is awaiting settlement; SETTLED/VOID are terminal. Never move these.
    if (existing.status === 'FINAL' || existing.status === 'SETTLED' || existing.status === 'VOID') continue

    const reschedulable = existing.status === 'SCHEDULED' || existing.status === 'POSTPONED'
    await prisma.game.update({
      where: { id: existing.id },
      data: {
        status: mapped.status,
        awayTeam: mapped.awayTeam,
        homeTeam: mapped.homeTeam,
        awayScore: mapped.awayScore,
        homeScore: mapped.homeScore,
        ...(reschedulable ? { startsAt: mapped.startsAt } : {}),
      },
    })
    result.updated++
  }

  const finals = await prisma.game.findMany({ where: { status: 'FINAL' }, select: { id: true } })
  for (const g of finals) {
    if ((await settleGame(g.id, now)).settled) result.settled++
  }

  await setLastSyncAt(now)
  return result
}
