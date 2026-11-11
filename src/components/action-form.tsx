'use client'

import { useActionState, useEffect, useRef } from 'react'

import type { ActionState } from '@/lib/action-state'

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  children?: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
}

export function ActionForm({ action, submitLabel, children, className, resetOnSuccess }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form ref={ref} action={formAction} className={className ?? 'space-y-3'}>
      {children}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Working…' : submitLabel}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  )
}
