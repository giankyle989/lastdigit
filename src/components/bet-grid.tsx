'use client'

import { useActionState, useState } from 'react'

import type { ActionState } from '@/lib/action-state'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  open: boolean
  awayTeam: string
  homeTeam: string
  myStakes: Record<string, number>
  winning?: string
}

export function BetGrid({ action, open, awayTeam, homeTeam, myStakes, winning }: Props) {
  const [sel, setSel] = useState<{ a: number; h: number } | null>(null)
  const [state, formAction, pending] = useActionState(action, {})

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left text-gray-500">
                {awayTeam} ↓ / {homeTeam} →
              </th>
              {DIGITS.map((h) => (
                <th key={h} className="w-9 p-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIGITS.map((a) => (
              <tr key={a}>
                <th className="p-1">{a}</th>
                {DIGITS.map((h) => {
                  const key = `${a}-${h}`
                  const mine = myStakes[key]
                  const active = sel?.a === a && sel?.h === h
                  const win = winning === key
                  const color = active
                    ? 'bg-orange-600 text-white'
                    : win
                      ? 'bg-green-500 text-white'
                      : mine
                        ? 'bg-orange-100'
                        : 'bg-white'
                  return (
                    <td key={h} className="p-0.5">
                      <button
                        type="button"
                        disabled={!open}
                        onClick={() => setSel({ a, h })}
                        aria-label={`Ending ${key}`}
                        aria-pressed={active}
                        className={`h-9 w-9 rounded border border-gray-200 text-[10px] ${color} disabled:cursor-not-allowed`}
                      >
                        {mine ?? key}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Rows: {awayTeam} last digit. Columns: {homeTeam} last digit. Numbers show your stake.
      </p>

      {open && (
        <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="awayDigit" value={sel?.a ?? ''} />
          <input type="hidden" name="homeDigit" value={sel?.h ?? ''} />
          <div>
            <span className="label">Ending</span>
            <div className="font-mono text-lg">{sel ? `${sel.a}-${sel.h}` : '—'}</div>
          </div>
          <div>
            <label htmlFor="stake" className="label">
              Stake
            </label>
            <input id="stake" name="stake" type="number" min={1} step={1} required className="input w-32" />
          </div>
          <button className="btn" disabled={!sel || pending}>
            {pending ? 'Placing…' : 'Place bet'}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.ok && <p className="mt-2 text-sm text-green-700">{state.ok}</p>}
    </div>
  )
}
