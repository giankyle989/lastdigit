import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'

describe('permanent redirects for moved pages', () => {
  it('maps every old URL to its new home', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    expect(redirects.map(({ source, destination, permanent }) => [source, destination, permanent])).toEqual([
      ['/referral', '/more/referral', true],
      ['/inquiries', '/more/support', true],
      ['/inquiries/:id', '/more/support/:id', true],
    ])
  })
})
