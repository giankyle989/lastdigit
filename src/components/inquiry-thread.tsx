import { formatDateTime } from '@/lib/format'

type Thread = {
  subject: string
  status: string
  messages: { id: string; body: string; createdAt: Date; author: { username: string; role: string } }[]
}

export function InquiryThread({ thread }: { thread: Thread }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{thread.subject}</h1>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{thread.status}</span>
      </div>
      {thread.messages.map((m) => (
        <div
          key={m.id}
          className={`card ${m.author.role === 'ADMIN' ? 'border-orange-200 bg-orange-50' : ''}`}
        >
          <div className="mb-1 text-xs text-gray-500">
            {m.author.role === 'ADMIN' ? 'Support' : m.author.username} · {formatDateTime(m.createdAt)}
          </div>
          <p className="text-sm whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
    </div>
  )
}
