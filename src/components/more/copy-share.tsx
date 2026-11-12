'use client'

import { Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch (e) {
    console.error('copy failed', e)
    toast.error('Could not copy — select the text and copy it manually')
  }
}

/** Copy the code; Share the signup link via navigator.share when available, else copy it (spec §4.6). */
export function CopyShare({ code, link }: { code: string; link: string }) {
  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Join me on LastDigit', url: link })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return // user closed the share sheet
        console.error('share failed', e)
      }
    }
    await copy(link, 'Invite link')
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={() => copy(code, 'Code')}>
        <Copy aria-hidden /> Copy
      </Button>
      <Button type="button" onClick={share}>
        <Share2 aria-hidden /> Share
      </Button>
    </div>
  )
}
