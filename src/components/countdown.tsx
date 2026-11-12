'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { formatCountdown } from '@/lib/format'

/** Live countdown to tip-off; calls router.refresh() once when it reaches 0 (spec §3.4). */
export function Countdown({ to }: { to: string }) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const ms = new Date(to).getTime() - now
  const closed = ms <= 0

  useEffect(() => {
    if (closed) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [closed])

  useEffect(() => {
    if (closed) router.refresh()
  }, [closed, router])

  if (closed) return <span className="text-muted-foreground">Betting closed</span>
  return (
    <span className="num" suppressHydrationWarning>
      {formatCountdown(ms)}
    </span>
  )
}
