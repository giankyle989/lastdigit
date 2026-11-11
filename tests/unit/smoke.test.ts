import { describe, expect, it } from 'vitest'

describe('test setup', () => {
  it('loads the test env', () => {
    expect(process.env.DATABASE_URL).toContain('lastdigit_test')
  })
})
