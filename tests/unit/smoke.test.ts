import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('loads the test env', () => {
    expect(process.env.DATABASE_URL).toContain('lastdigit_test')
  })
})
