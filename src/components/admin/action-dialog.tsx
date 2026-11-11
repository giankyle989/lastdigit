'use client'

import { useState } from 'react'

import { ActionForm } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ActionState } from '@/lib/action-state'

type Props = {
  triggerLabel: string
  title: string
  description?: string
  submitLabel: string
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  /** Second step: an AlertDialog asking to confirm before the form is submitted. */
  confirm?: { title: string; description: string; actionLabel: string }
  destructive?: boolean
  children?: React.ReactNode
}

/** A trigger button that opens a Dialog holding an ActionForm; closes itself on success. */
export function ActionDialog({
  triggerLabel,
  title,
  description,
  submitLabel,
  action,
  confirm,
  destructive,
  children,
}: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={destructive ? 'destructive' : 'outline'} size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={action}
          submitLabel={submitLabel}
          confirm={confirm}
          destructive={destructive}
          onSuccess={() => setOpen(false)}
          className="grid gap-3"
        >
          {children}
        </ActionForm>
      </DialogContent>
    </Dialog>
  )
}
