import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { listFiles } from '../architecture/rules'

describe('time zone source of truth', () => {
  it('hard-codes a zone name only in src/lib/dates.ts', () => {
    const offenders = listFiles('src', /\.(ts|tsx)$/).filter(
      (f) =>
        f !== 'src/lib/dates.ts' &&
        /America\/New_York|Asia\/Manila/.test(readFileSync(path.resolve(__dirname, '../..', f), 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
