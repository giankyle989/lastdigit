import { cn } from '@/lib/utils'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

type Props = {
  team: string
  value: number | null
  onChange: (digit: number) => void
  disabled?: boolean
}

/** One row of large 0–9 buttons for a team's last digit; each is labelled e.g. "LAL digit 9". */
export function DigitPicker({ team, value, onChange, disabled }: Props) {
  return (
    <div role="group" aria-label={`${team} last digit`}>
      <div className="text-muted-foreground mb-1.5 text-xs font-medium">{team} last digit</div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            aria-label={`${team} digit ${d}`}
            aria-pressed={value === d}
            disabled={disabled}
            onClick={() => onChange(d)}
            className={cn(
              'num h-12 rounded-lg border text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              value === d
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface-2 hover:border-primary/60',
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}
