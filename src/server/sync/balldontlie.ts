export type ApiGame = {
  id: number
  date: string // YYYY-MM-DD (US date of the game)
  datetime?: string | null // ISO tip-off time (newer API versions)
  status: string // "Final", "3rd Qtr", "Halftime", "7:00 pm ET", ISO time, "Postponed"
  period: number // 0 before tip-off
  home_team_score: number
  visitor_team_score: number
  home_team: { abbreviation: string }
  visitor_team: { abbreviation: string }
}

export type MappedGame = {
  externalId: number
  startsAt: Date
  awayTeam: string
  homeTeam: string
  awayScore: number | null
  homeScore: number | null
  status: 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED'
}

export type GamesFetcher = (dates: string[]) => Promise<ApiGame[]>

function parseIso(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}T/.test(s)) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Returns null when the record is unusable (logged by the caller as skipped). */
export function mapApiGame(g: ApiGame): MappedGame | null {
  const s = g.status.trim()
  let status: MappedGame['status']
  if (/^final/i.test(s)) status = 'FINAL'
  else if (/postpon|cancel|suspend/i.test(s)) status = 'POSTPONED'
  else if (g.period > 0) status = 'LIVE'
  else status = 'SCHEDULED'

  if (status === 'FINAL' && (!(g.home_team_score > 0) || !(g.visitor_team_score > 0))) return null

  const tipoff = parseIso(g.datetime) ?? parseIso(s)
  if (!tipoff && status === 'SCHEDULED') return null // never open betting without a real tip-off time
  const startsAt = tipoff ?? new Date(`${g.date}T00:00:00Z`)

  const hasScores = status === 'LIVE' || status === 'FINAL'
  return {
    externalId: g.id,
    startsAt,
    awayTeam: g.visitor_team.abbreviation,
    homeTeam: g.home_team.abbreviation,
    awayScore: hasScores ? g.visitor_team_score : null,
    homeScore: hasScores ? g.home_team_score : null,
    status,
  }
}

export function createBalldontlieFetcher(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl = 'https://api.balldontlie.io/v1',
): GamesFetcher {
  return async (dates) => {
    const out: ApiGame[] = []
    let cursor: number | null | undefined
    do {
      const url = new URL(`${baseUrl}/games`)
      for (const d of dates) url.searchParams.append('dates[]', d)
      url.searchParams.set('per_page', '100')
      if (cursor) url.searchParams.set('cursor', String(cursor))
      const res = await fetchImpl(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`balldontlie ${res.status}: ${await res.text()}`)
      const json = (await res.json()) as { data: ApiGame[]; meta?: { next_cursor?: number | null } }
      out.push(...json.data)
      cursor = json.meta?.next_cursor
    } while (cursor)
    return out
  }
}
