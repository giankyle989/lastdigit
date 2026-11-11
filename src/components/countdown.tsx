'use client'

import { useEffect, useState } from 'react'

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(to).getTime() - now
  if (ms <= 0) return <span>Betting closed</span>
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return (
    <span suppressHydrationWarning>
      Closes in {h}h {m}m {s % 60}s
    </span>
  )
}
