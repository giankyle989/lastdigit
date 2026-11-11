import type { TransactionType } from '@prisma/client'
import { Gift, ShieldMinus, ShieldPlus, Ticket, Trophy, Undo2 } from 'lucide-react'

const ICONS = {
  BET: Ticket,
  PAYOUT: Trophy,
  REFERRAL_BONUS: Gift,
  ADMIN_GRANT: ShieldPlus,
  ADMIN_DEDUCT: ShieldMinus,
  REFUND: Undo2,
} satisfies Record<TransactionType, unknown>

export function TxIcon({ type }: { type: TransactionType }) {
  const Icon = ICONS[type]
  return (
    <span className="bg-surface-2 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
      <Icon aria-hidden className="size-4" />
    </span>
  )
}
