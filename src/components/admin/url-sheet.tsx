'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type Props = {
  /** URL of the current page without the drawer param; closing navigates here. */
  closeHref: string
  title: string
  description?: string
  children: React.ReactNode
}

/**
 * A right-hand drawer bound to a search param (`?player=`, `?game=`, `?ticket=`). The page renders
 * it only while the param is present (key it by the id); Esc, the close button and the overlay
 * remove the param, and the browser back button pops it (spec §5.2).
 */
export function UrlSheet({ closeHref, title, description, children }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        setOpen(false)
        router.replace(closeHref, { scroll: false })
      }}
    >
      <SheetContent
        side="right"
        {...(description ? {} : { 'aria-describedby': undefined })}
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
