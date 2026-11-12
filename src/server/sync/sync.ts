import { addDays, localDateOf } from '@/lib/dates'
import { prisma } from '@/lib/db'

import { setLastSyncAt } from '../settings'
import { settleGame } from '../settlement'
import { createBalldontlieFetcher, type GamesFetcher, mapApiGame } from './balldontlie'

export type SyncResult = {
  fetched: number
  created: number
  updated: number
  skipped: number
  settled: number
  errors: number
}

/**
 * balldontlie `dates[]` are US game dates; a US evening game lands on the next PHT day. The feed
 * strip shows PHT yesterday..today+6 and Overview needs yesterday, so query PHT today-2..today+7.
 */
export function syncDates(now: Date): string[] {
  const today = localDateOf(now)
  const dates: string[] = []
  for (let offset = -2; offset <= 7; offset++) dates.push(addDays(today, offset))
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
  const result: SyncResult = {
    fetched: apiGames.length,
    created: 0,
    updated: 0,
    skipped: 0,
    settled: 0,
    errors: 0,
  }

  for (const apiGame of apiGames) {
    try {
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
      // The WHERE guards terminal states: an admin may have voided (or settlement
      // finished) since `existing` was read, and sync must never overwrite that.
      const { count } = await prisma.game.updateMany({
        where: { id: existing.id, status: { in: ['SCHEDULED', 'LIVE', 'POSTPONED'] } },
        data: {
          status: mapped.status,
          awayTeam: mapped.awayTeam,
          homeTeam: mapped.homeTeam,
          awayScore: mapped.awayScore,
          homeScore: mapped.homeScore,
          ...(reschedulable ? { startsAt: mapped.startsAt } : {}),
        },
      })
      if (count === 0) continue
      result.updated++
    } catch (e) {
      console.error('sync: failed game', apiGame?.id, e)
      result.errors++
    }
  }

  const finals = await prisma.game.findMany({ where: { status: 'FINAL' }, select: { id: true } })
  for (const g of finals) {
    try {
      if ((await settleGame(g.id, now)).settled) result.settled++
    } catch (e) {
      console.error('sync: settle failed', g.id, e)
      result.errors++
    }
  }

  await setLastSyncAt(now)
  return result
}
