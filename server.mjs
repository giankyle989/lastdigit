// server.mjs — production entry point. Wraps Next.js so every request carries the real client
// IP in CLIENT_IP_HEADER. Next.js only fills X-Forwarded-For when the client did not send one,
// so that header cannot be trusted for rate limits or account flags.
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const CLIENT_IP_HEADER = 'x-lastdigit-client-ip'

/** The socket peer, or behind a trusted proxy the right-most X-Forwarded-For entry. */
export function clientIpFrom(req, trustProxy) {
  let ip
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for']
    const raw = Array.isArray(xff) ? xff.join(',') : (xff ?? '')
    ip = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1)
  }
  ip ??= req.socket.remoteAddress
  if (!ip) return 'unknown'
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
}

/** Replaces whatever the client sent in CLIENT_IP_HEADER with the real address. */
export function stampClientIp(req, trustProxy) {
  req.headers[CLIENT_IP_HEADER] = clientIpFrom(req, trustProxy)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: next } = await import('next')
  const port = Number(process.env.PORT ?? 3000)
  const hostname = process.env.HOST ?? '0.0.0.0'
  const trustProxy = process.env.TRUSTED_PROXY === '1'
  const app = next({ dev: false, hostname, port })
  const handle = app.getRequestHandler()
  await app.prepare()
  createServer((req, res) => {
    stampClientIp(req, trustProxy)
    void handle(req, res)
  }).listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
}
