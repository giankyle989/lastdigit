'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/action-state'

type Confirm = { title: string; description: string; actionLabel: string }

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  children?: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  /** Called after a successful submit (e.g. to close the surrounding Dialog). */
  onSuccess?: () => void
  /** Ask for confirmation in an AlertDialog before submitting. */
  confirm?: Confirm
  destructive?: boolean
}

/** Success shows as a toast; errors stay inline under the fields (spec §3.6). */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  confirm,
  destructive,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)
  const onSuccessRef = useRef(onSuccess)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (!state.ok) return
    toast.success(state.ok)
    if (resetOnSuccess) ref.current?.reset()
    onSuccessRef.current?.()
  }, [state, resetOnSuccess])

  const variant = destructive ? 'destructive' : 'default'
  return (
    <form ref={ref} action={formAction} className={className ?? 'space-y-3'}>
      {children}
      {confirm ? (
        <Button
          type="button"
          variant={variant}
          disabled={pending}
          onClick={() => {
            if (ref.current?.reportValidity()) setConfirming(true)
          }}
        >
          {pending ? 'Working…' : submitLabel}
        </Button>
      ) : (
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? 'Working…' : submitLabel}
        </Button>
      )}
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {confirm && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => ref.current?.requestSubmit()}>
                {confirm.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </form>
  )
}
