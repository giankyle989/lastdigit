'use client'

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

// Customized: dark-only theme (no next-themes), colors from the theme tokens.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="text-primary size-4" />,
        info: <InfoIcon className="text-info size-4" />,
        warning: <TriangleAlertIcon className="text-live size-4" />,
        error: <OctagonXIcon className="text-danger size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'bg-popover! text-popover-foreground! border-border! rounded-lg!',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
