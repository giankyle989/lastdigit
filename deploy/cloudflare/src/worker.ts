/**
 * Cloudflare Worker in front of Cloud Run (docs/deploy.md). Every request is forwarded to
 * ORIGIN_URL with:
 * - x-origin-secret: proves to the app (src/middleware.ts) that the request came through here;
 * - x-lastdigit-client-ip: the visitor's real IP from Cloudflare, overwriting anything they sent;
 * - x-forwarded-host/proto: the public host, used by Auth.js and Next's server-action origin check.
 * Next's fingerprinted /_next/static files are cached at Cloudflare's edge.
 */

export type Env = { ORIGIN_URL: string; ORIGIN_SECRET: string }

export type CfRequestInit = RequestInit & { cf?: { cacheEverything?: boolean; cacheTtl?: number } }
type Fetch = (input: Request, init?: CfRequestInit) => Promise<Response>

const CLIENT_IP_HEADER = 'x-lastdigit-client-ip' // must match src/app/request-info.ts
const ORIGIN_SECRET_HEADER = 'x-origin-secret' // must match src/lib/origin-gate.ts
const YEAR_SECONDS = 31_536_000

export async function forward(req: Request, env: Env, fetchFn: Fetch): Promise<Response> {
  const publicUrl = new URL(req.url)
  const origin = new URL(env.ORIGIN_URL)
  const target = new URL(publicUrl.pathname + publicUrl.search, origin)

  const headers = new Headers(req.headers)
  headers.set(CLIENT_IP_HEADER, req.headers.get('cf-connecting-ip') || 'unknown')
  headers.set(ORIGIN_SECRET_HEADER, env.ORIGIN_SECRET)
  headers.set('x-forwarded-host', publicUrl.host)
  headers.set('x-forwarded-proto', publicUrl.protocol.replace(':', ''))

  const upstream = new Request(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    redirect: 'manual',
    // Needed to stream a request body; the Workers runtime and Node both accept it.
    ...({ duplex: 'half' } as object),
  })

  const isStatic =
    (req.method === 'GET' || req.method === 'HEAD') && publicUrl.pathname.startsWith('/_next/static/')
  const res = await fetchFn(
    upstream,
    isStatic ? { cf: { cacheEverything: true, cacheTtl: YEAR_SECONDS } } : undefined,
  )

  // Redirects that name Cloud Run's host must send the browser back to the public host.
  const location = res.headers.get('location')
  if (!location) return res
  const to = new URL(location, origin)
  if (to.host !== origin.host || !/^https?:/i.test(location)) return res
  const out = new Response(res.body, res)
  out.headers.set('location', `${publicUrl.origin}${to.pathname}${to.search}${to.hash}`)
  return out
}

const worker = {
  fetch(req: Request, env: Env): Promise<Response> {
    return forward(req, env, (input, init) => fetch(input, init))
  },
}

export default worker
