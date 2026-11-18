import { describe, expect, it } from 'vitest'

import { CLIENT_IP_HEADER, clientIpFrom, stampClientIp } from '../../server.mjs'

const req = (remoteAddress: string | undefined, headers: Record<string, string | string[]> = {}) => ({
  socket: { remoteAddress },
  headers: { ...headers },
})

describe('clientIpFrom', () => {
  it('uses the socket peer and ignores X-Forwarded-For by default', () => {
    expect(clientIpFrom(req('192.168.1.20', { 'x-forwarded-for': '6.6.6.6' }), false)).toBe('192.168.1.20')
  })

  it('strips the IPv4-mapped prefix', () => {
    expect(clientIpFrom(req('::ffff:192.168.1.20'), false)).toBe('192.168.1.20')
  })

  it('behind a trusted proxy, takes the right-most X-Forwarded-For entry', () => {
    expect(clientIpFrom(req('127.0.0.1', { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), true)).toBe(
      '203.0.113.9',
    )
  })

  it('falls back to the socket when a trusted proxy sent no header, then to unknown', () => {
    expect(clientIpFrom(req('127.0.0.1'), true)).toBe('127.0.0.1')
    expect(clientIpFrom(req(undefined), false)).toBe('unknown')
  })
})

describe('stampClientIp', () => {
  it('overwrites a client-sent header', () => {
    const r = req('192.168.1.20', { [CLIENT_IP_HEADER]: '1.2.3.4' })
    stampClientIp(r, false)
    expect(r.headers[CLIENT_IP_HEADER]).toBe('192.168.1.20')
  })
})
