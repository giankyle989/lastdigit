'use client'

import './globals.css'

import { ErrorState } from '@/components/error-state'

/** Last-resort boundary for errors thrown in the root layout or the admin/player layouts. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-screen items-center justify-center p-4">
        <ErrorState error={error} reset={reset} />
      </body>
    </html>
  )
}
