'use client'

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { shortDayLabel } from '@/lib/dates'

export type VolumePoint = { date: string; volume: number; houseTake: number }

/** Last 14 PHT days: BET volume and house take (spec §5.1). */
export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const rows = data.map((d) => ({ ...d, day: shortDayLabel(d.date) }))
  return (
    <figure className="h-72" aria-label="Bet volume and house take per day, last 14 days">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
          <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--foreground)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="volume" name="Volume" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="houseTake" name="House take" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
