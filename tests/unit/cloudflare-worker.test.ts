import { describe, expect, it, vi } from 'vitest'

import { type CfRequestInit, type Env, forward } from '../../deploy/cloudflare/src/worker'

const env: Env = { ORIGIN_URL: 'https://lastdigit-abc.a.run.app', ORIGIN_SECRET: 'origin-secret' }

function call(req: Request, response: Response = new Response('ok')) {
  const fetchFn = vi.fn<(input: Request, init?: CfRequestInit) => Promise<Response>>(async () => response)
  return { fetchFn, result: forward(req, env, fetchFn) }
}

async function sent(req: Request) {
  const { fetchFn, result } = call(req)
  await result
  const [upstream, init] = fetchFn.mock.calls[0] ?? []
  if (!upstream) throw new Error('nothing forwarded')
  return { upstream, init }
}

describe('Cloudflare Worker', () => {
  it('forwards to Cloud Run with the path and query', async () => {
    const { upstream } = await sent(new Request('https://lastdigit.example/games/abc?tab=bets'))
    expect(upstream.url).toBe('https://lastdigit-abc.a.run.app/games/abc?tab=bets')
  })

  it('sets the real client IP and the origin secret, overwriting what the visitor sent', async () => {
    const { upstream } = await sent(
      new Request('https://lastdigit.example/login', {
        headers: {
          'cf-connecting-ip': '203.0.113.7',
          'x-lastdigit-client-ip': '1.2.3.4',
          'x-origin-secret': 'guess',
        },
      }),
    )
    expect(upstream.headers.get('x-lastdigit-client-ip')).toBe('203.0.113.7')
    expect(upstream.headers.get('x-origin-secret')).toBe('origin-secret')
  })

  it('marks the IP unknown when Cloudflare gives none', async () => {
    const { upstream } = await sent(
      new Request('https://lastdigit.example/login', { headers: { 'x-lastdigit-client-ip': '1.2.3.4' } }),
    )
    expect(upstream.headers.get('x-lastdigit-client-ip')).toBe('unknown')
  })

  it('passes the public host so Auth.js URLs and the server-action origin check use it', async () => {
    const { upstream } = await sent(new Request('https://lastdigit.example/login'))
    expect(upstream.headers.get('x-forwarded-host')).toBe('lastdigit.example')
    expect(upstream.headers.get('x-forwarded-proto')).toBe('https')
  })

  it('forwards form posts with their body and method', async () => {
    const { upstream } = await sent(
      new Request('https://lastdigit.example/login', { method: 'POST', body: 'username=a' }),
    )
    expect(upstream.method).toBe('POST')
    expect(await upstream.text()).toBe('username=a')
  })

  it("returns redirects to the browser, pointing at the public host, not Cloud Run's", async () => {
    const { fetchFn, result } = call(
      new Request('https://lastdigit.example/'),
      new Response(null, {
        status: 307,
        headers: { location: 'https://lastdigit-abc.a.run.app/login?next=%2F' },
      }),
    )
    const res = await result
    expect(fetchFn.mock.calls[0]?.[0].redirect).toBe('manual')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://lastdigit.example/login?next=%2F')
  })

  it('leaves relative redirects alone', async () => {
    const { result } = call(
      new Request('https://lastdigit.example/'),
      new Response(null, { status: 303, headers: { location: '/games' } }),
    )
    expect((await result).headers.get('location')).toBe('/games')
  })

  it("caches Next's fingerprinted static files at the edge, and nothing else", async () => {
    const asset = await sent(new Request('https://lastdigit.example/_next/static/chunks/app.js'))
    expect(asset.init).toMatchObject({ cf: { cacheEverything: true } })
    const page = await sent(new Request('https://lastdigit.example/games'))
    expect(page.init?.cf).toBeUndefined()
    const post = await sent(
      new Request('https://lastdigit.example/_next/static/x.js', { method: 'POST', body: 'x' }),
    )
    expect(post.init?.cf).toBeUndefined()
  })
})
