'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/** Body of every error.tsx: message + Retry (spec §3.6). */
export function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('route error', error)
  }, [error])
  return (
    <div role="alert" className="bg-card border-danger/50 mx-auto max-w-md rounded-xl border p-6 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        The page could not be loaded. {error.digest ? `(ref ${error.digest})` : ''}
      </p>
      <Button type="button" className="mt-4" onClick={reset}>
        Retry
      </Button>
    </div>
  )
}
