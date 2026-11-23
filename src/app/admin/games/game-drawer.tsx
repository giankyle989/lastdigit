import Link from 'next/link'

import { ActionDialog } from '@/components/admin/action-dialog'
import { Field } from '@/components/admin/field'
import { Amount, SplitAmount } from '@/components/amount'
import { EndingHeatmap } from '@/components/games/ending-heatmap'
import { GameHeader } from '@/components/games/game-header'
import { Input } from '@/components/ui/input'
import { splitReturn } from '@/lib/funding'
import { formatEnding, winningEnding } from '@/lib/game/ending'
import type { getGameDetail } from '@/server/admin/queries'

import { voidGameAction } from '../actions'

type Detail = NonNullable<Awaited<ReturnType<typeof getGameDetail>>>

export function GameDrawer({
  detail,
  now,
  canManageGames,
}: {
  detail: Detail
  now: Date
  canManageGames: boolean
}) {
  const { game, stakes, winners } = detail
  return (
    <>
      <GameHeader game={game} winners={winners.length} now={now} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">House take</dt>
          <dd>
            <Amount kind="pool" value={game.houseTake} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">External id</dt>
          <dd className="num">{game.externalId}</dd>
        </div>
      </dl>
      <section aria-label="Pool breakdown" className="space-y-2">
        <h3 className="text-sm font-semibold">Pool breakdown</h3>
        <EndingHeatmap
          awayTeam={game.awayTeam}
          homeTeam={game.homeTeam}
          cells={stakes.cells}
          winning={winningEnding(game)}
        />
      </section>
      <section aria-label="Winning bets" className="space-y-2">
        <h3 className="text-sm font-semibold">Winning bets ({winners.length})</h3>
        {winners.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {winners.map((b) => (
              <li key={b.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 py-2">
                <Link href={`/admin/players?player=${b.user.id}`} className="hover:underline">
                  {b.user.username}
                </Link>
                <span className="num">{formatEnding(b)}</span>
                <SplitAmount wallet={b.stake - b.pointsStake} points={b.pointsStake} />
                <SplitAmount {...splitReturn(b.payout, b.pointsStake)} signed />
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* Stays mounted (hidden, not removed) so the success toast is not lost when the revalidated
          render flips the game to VOID. */}
      {canManageGames && (
        <div className={game.status === 'VOID' ? 'hidden' : 'contents'}>
          <ActionDialog
            triggerLabel="Void game"
            title="Void this game"
            description="Every stake is refunded and any payouts are reversed."
            submitLabel="Void game"
            destructive
            action={voidGameAction.bind(null, game.id)}
            confirm={{
              title: `Void ${game.awayTeam} @ ${game.homeTeam}?`,
              description: 'This cannot be undone.',
              actionLabel: 'Void game',
            }}
          >
            <Field id="reason" label="Reason">
              <Input id="reason" name="reason" maxLength={200} required />
            </Field>
          </ActionDialog>
        </div>
      )}
    </>
  )
}
