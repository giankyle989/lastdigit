import { EmptyState } from '@/components/empty-state'
import { DateStrip } from '@/components/games/date-strip'
import { GameCard } from '@/components/games/game-card'
import { etDateStrip, parseStripDate } from '@/lib/dates'
import { groupIntoSections } from '@/lib/game/sections'
import type { SearchParams } from '@/lib/table-params'
import { listGamesForDate } from '@/server/queries/player'
import { requireUser } from '@/server/session'

export default async function GamesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser()
  const now = new Date()
  const date = parseStripDate((await searchParams).date, now)
  const sections = groupIntoSections(await listGamesForDate(date, user.id), now)
  return (
    <div className="space-y-5">
      <h1 className="sr-only">Games</h1>
      <DateStrip days={etDateStrip(now)} selected={date} />
      {sections.length === 0 ? (
        <EmptyState>No games on this day</EmptyState>
      ) : (
        sections.map((s) => (
          <section key={s.key} aria-labelledby={`section-${s.key}`} className="space-y-2">
            <h2 id={`section-${s.key}`} className="text-muted-foreground text-xs font-semibold uppercase">
              {s.title}
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {s.games.map((g) => (
                <li key={g.id}>
                  <GameCard game={g} now={now} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
