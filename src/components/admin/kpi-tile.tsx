import { cn } from '@/lib/utils'

type Props = { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'danger' }

export function KpiTile({ label, value, sub, tone }: Props) {
  return (
    <div
      className={cn('bg-card border-border rounded-xl border p-4', tone === 'danger' && 'border-danger/60')}
    >
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className={cn('num mt-1 text-2xl font-bold', tone === 'danger' && 'text-danger')}>{value}</div>
      {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
    </div>
  )
}
