'use client'

import { formatAmount } from '@/lib/format'
import type { BetAccount } from '@/lib/funding'
import { cn } from '@/lib/utils'

type Props = {
  account: BetAccount
  wallet: number
  points: number
  disabled?: boolean
  onChange: (account: BetAccount) => void
}

/** "Pay from" radio group: a slip is paid from one balance only (wallet-or-points spec §3). */
export function PayFrom({ account, wallet, points, disabled, onChange }: Props) {
  const options: { value: BetAccount; label: string; amount: string }[] = [
    { value: 'WALLET', label: 'Wallet', amount: formatAmount('wallet', wallet) },
    { value: 'POINTS', label: 'Points', amount: formatAmount('points', points) },
  ]
  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="text-muted-foreground mb-1 text-sm">Pay from</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'border-border flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-3 py-1.5 text-sm',
              'has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2',
              account === o.value && 'border-primary ring-primary/40 ring-2',
            )}
          >
            <input
              type="radio"
              name="pay-from"
              value={o.value}
              aria-label={o.label}
              checked={account === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="font-medium">{o.label}</span>
            <span className="num text-muted-foreground text-xs">{o.amount}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
