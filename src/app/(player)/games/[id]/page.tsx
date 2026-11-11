import { notFound } from 'next/navigation'

import { BetResult } from '@/components/bet-result'
import { EndingPicker } from '@/components/games/ending-picker'
import { GameHeader } from '@/components/games/game-header'
import { PointsAmount } from '@/components/points-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatEnding } from '@/lib/game/ending'
import { isBettingOpen } from '@/lib/game/status'
import { getGameForPlayer } from '@/server/queries/player'
import { getEndingStakes } from '@/server/queries/stakes'
import { requireUser } from '@/server/session'

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const data = await getGameForPlayer(id, user.id)
  if (!data) notFound()
  const { game, myBets, winners } = data
  const stakes = await getEndingStakes(game.id)
  const now = new Date()

  return (
    <div className="space-y-4">
      <GameHeader game={game} winners={winners} now={now} />
      <Card>
        <CardHeader>
          <CardTitle>Pick an ending</CardTitle>
        </CardHeader>
        <CardContent>
          <EndingPicker
            gameId={game.id}
            awayTeam={game.awayTeam}
            homeTeam={game.homeTeam}
            open={isBettingOpen(game, now)}
            pool={stakes.pool}
            cells={stakes.cells}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>My bets on this game</CardTitle>
        </CardHeader>
        <CardContent>
          {myBets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bets yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {myBets.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="num text-base font-semibold">{formatEnding(b)}</span>
                  <PointsAmount value={b.stake} unit className="text-muted-foreground" />
                  <BetResult result={b.result} payout={b.payout} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
