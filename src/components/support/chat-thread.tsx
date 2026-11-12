import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  body: string
  createdAt: Date
  author: { username: string; role: 'PLAYER' | 'ADMIN' }
}

/** Ticket thread as chat bubbles: the viewer's side on the right, the other side on the left (spec §4.6). */
export function ChatThread({ messages, viewer }: { messages: Message[]; viewer: 'PLAYER' | 'ADMIN' }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m) => {
        const mine = m.author.role === viewer
        return (
          <li key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-surface-2 rounded-bl-sm',
              )}
            >
              {m.body}
            </div>
            <div className="text-muted-foreground mt-1 text-[11px]">
              {m.author.role === 'ADMIN' ? 'Support' : m.author.username} · {formatDateTime(m.createdAt)}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
