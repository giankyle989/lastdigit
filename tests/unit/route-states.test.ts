import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { listFiles } from '../architecture/rules'

const ROOT = path.resolve(__dirname, '..', '..')
const GROUPS = ['src/app/(player)', 'src/app/admin']
const pages = GROUPS.flatMap((g) => listFiles(g, /^page\.tsx$/))
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** The page's own folder, or a parent folder inside its group, holds `file`. */
function covered(page: string, file: string): boolean {
  const group = GROUPS.find((g) => page.startsWith(`${g}/`)) ?? ''
  for (let dir = path.dirname(page); dir.startsWith(group); dir = path.dirname(dir)) {
    if (existsSync(path.join(ROOT, dir, file))) return true
  }
  return false
}

describe('route segment states (spec §3.6)', () => {
  it('every page has an error.tsx (message + Retry)', () => {
    expect(pages.filter((p) => !covered(p, 'error.tsx'))).toEqual([])
  })

  // Next 15.5.29 production builds: a loading.tsx or <Suspense> boundary in a page makes client
  // transitions (search-param links, drawers, server-action refreshes) hang intermittently —
  // reproduced while planning the redesign. Pages render without streaming boundaries.
  it('uses no loading.tsx and no <Suspense> in pages', () => {
    expect(GROUPS.flatMap((g) => listFiles(g, /^loading\.tsx$/))).toEqual([])
    expect(pages.filter((p) => read(p).includes('<Suspense'))).toEqual([])
  })
})
