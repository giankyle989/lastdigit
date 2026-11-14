import { describe, expect, it, vi } from 'vitest'

import {
  canAdd,
  EMPTY_SLIP,
  endingKey,
  maxStakeFor,
  newPickCount,
  parseStakeInput,
  parseStoredSlip,
  parseTotalInput,
  planMultiAdd,
  type Slip,
  slipReducer,
  slipRoom,
  slipStorageKey,
  slipTotal,
  splitStake,
} from '@/lib/slip'

const pick = (gameId: string, a = 9, h = 6) => ({ gameId, awayDigit: a, homeDigit: h, matchup: 'LAL @ GSW' })
const add = (slip: Slip, p = pick('g1')) => slipReducer(slip, { type: 'add', pick: p })

describe('slipReducer', () => {
  it('adds a pick at the last-used stake (default 100)', () => {
    const s = add(EMPTY_SLIP)
    expect(s.picks).toEqual([{ ...pick('g1'), stake: 100 }])
  })

  it('merges the same game and ending by adding the stake', () => {
    const s = add(add(EMPTY_SLIP))
    expect(s.picks).toHaveLength(1)
    expect(s.picks[0]?.stake).toBe(200)
    expect(add(s, pick('g1', 1, 2)).picks).toHaveLength(2)
  })

  it('removes, sets and bumps stakes; typed and bumped stakes become the last-used stake', () => {
    let s = add(add(EMPTY_SLIP), pick('g2'))
    s = slipReducer(s, { type: 'setStake', index: 0, stake: 40 })
    expect(s.picks[0]?.stake).toBe(40)
    expect(s.lastStake).toBe(40)
    s = slipReducer(s, { type: 'addStake', index: 1, amount: 50 })
    expect(s.picks[1]?.stake).toBe(150)
    expect(s.lastStake).toBe(150)
    s = slipReducer(s, { type: 'setStake', index: 0, stake: 0 }) // cleared input
    expect(s.picks[0]?.stake).toBe(0)
    expect(s.lastStake).toBe(150)
    s = slipReducer(s, { type: 'remove', index: 0 })
    expect(s.picks.map((p) => p.gameId)).toEqual(['g2'])
    expect(slipReducer(s, { type: 'setStake', index: 7, stake: 5 })).toBe(s) // unknown index: no-op
    expect(slipReducer(s, { type: 'clear' }).picks).toEqual([])
  })

  it('sets Max to the balance minus the other picks, never below 0', () => {
    let s = add(add(EMPTY_SLIP), pick('g2')) // 100 + 100
    s = slipReducer(s, { type: 'setMax', index: 1, balance: 350 })
    expect(s.picks[1]?.stake).toBe(250)
    s = slipReducer(s, { type: 'setMax', index: 1, balance: 50 })
    expect(s.picks[1]?.stake).toBe(0)
    expect(maxStakeFor([], 0, -10)).toBe(0)
  })

  it('caps the slip at 100 picks but still merges into existing ones', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 100; i++) s = add(s, pick(`g${i}`))
    expect(s.picks).toHaveLength(100)
    expect(canAdd(s, pick('g100'))).toBe(false)
    expect(add(s, pick('g100'))).toBe(s)
    expect(canAdd(s, pick('g3'))).toBe(true)
    expect(add(s, pick('g3')).picks[3]?.stake).toBe(200)
    expect(slipTotal(s.picks)).toBe(10_000)
  })
})

describe('removePicks', () => {
  it('removes only the listed picks and keeps ones added later', () => {
    let s = add(add(EMPTY_SLIP), pick('g2'))
    s = add(s, pick('g3'))
    s = slipReducer(s, { type: 'removePicks', picks: [pick('g1'), pick('g2')] })
    expect(s.picks.map((p) => p.gameId)).toEqual(['g3'])
  })
})

describe('slip input and storage', () => {
  it('parses stake input as whole numbers only', () => {
    expect(parseStakeInput('250')).toBe(250)
    expect(parseStakeInput(' 7 ')).toBe(7)
    for (const bad of ['', '-5', '1.5', '1e3', 'abc']) expect(parseStakeInput(bad)).toBe(0)
    expect(parseStakeInput('99999999999')).toBe(0)
  })

  it('parses a split total as whole digits without the per-ending cap', () => {
    expect(parseTotalInput('250')).toBe(250)
    expect(parseTotalInput(' 3500000 ')).toBe(3500000)
    for (const bad of ['', '-5', '1.5', '1e3', 'abc', '99999999999']) expect(parseTotalInput(bad)).toBe(0)
  })

  it('round-trips a saved slip and treats missing or broken values as empty', () => {
    const s = add(EMPTY_SLIP)
    expect(parseStoredSlip(JSON.stringify(s))).toEqual(s)
    expect(parseStoredSlip(null)).toEqual(EMPTY_SLIP)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(parseStoredSlip('{not json')).toEqual(EMPTY_SLIP)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
    expect(
      parseStoredSlip(JSON.stringify({ picks: [{ gameId: 'g', awayDigit: 12 }], lastStake: 1 })),
    ).toEqual(EMPTY_SLIP)
    expect(parseStoredSlip('[]')).toEqual(EMPTY_SLIP)
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ ...pick(`g${i}`), stake: 1 }))
    expect(parseStoredSlip(JSON.stringify({ picks: tooMany, lastStake: 100 }))).toEqual(EMPTY_SLIP)
    const full = Array.from({ length: 100 }, (_, i) => ({ ...pick(`g${i}`), stake: 1 }))
    expect(parseStoredSlip(JSON.stringify({ picks: full, lastStake: 100 })).picks).toHaveLength(100)
    expect(slipStorageKey('u1')).toBe('lastdigit.slip.u1')
  })
})

describe('splitStake', () => {
  it('splits evenly and gives the remainder to the first endings', () => {
    expect(splitStake(600, 6)).toEqual([100, 100, 100, 100, 100, 100])
    expect(splitStake(100, 6)).toEqual([17, 17, 17, 17, 16, 16])
    expect(splitStake(5, 1)).toEqual([5])
    expect(splitStake(3, 3)).toEqual([1, 1, 1])
  })

  it('rejects fewer points than endings, or no endings', () => {
    expect(() => splitStake(2, 3)).toThrow()
    expect(() => splitStake(5, 0)).toThrow()
  })
})

describe('addMany and the multi-add plan', () => {
  const base = { gameId: 'g1', matchup: 'LAL @ GSW' }
  const e = (a: number, h: number) => ({ awayDigit: a, homeDigit: h })
  const plan = (
    slip: Slip,
    endings: { awayDigit: number; homeDigit: number }[],
    mode: 'perEnding' | 'splitTotal',
    stake: number,
  ) => planMultiAdd({ slip, ...base, endings, mode, stake })

  it('per ending: every ending at the stake, in grid order', () => {
    const p = plan(EMPTY_SLIP, [e(3, 1), e(0, 9), e(0, 2)], 'perEnding', 50)
    expect(p.blocked).toBeNull()
    expect(p.picks.map((x) => endingKey(x))).toEqual(['0-2', '0-9', '3-1'])
    expect(p.picks.every((x) => x.stake === 50 && x.gameId === 'g1' && x.matchup === 'LAL @ GSW')).toBe(true)
    expect(p).toMatchObject({ total: 150, perEnding: { min: 50, max: 50 }, lastStake: 50 })
  })

  it('split total: shares follow splitStake and last stake is the smallest share', () => {
    const p = plan(EMPTY_SLIP, [e(0, 0), e(0, 1), e(0, 2)], 'splitTotal', 301)
    expect(p.picks.map((x) => x.stake)).toEqual([101, 100, 100])
    expect(p).toMatchObject({ total: 301, perEnding: { min: 100, max: 101 }, lastStake: 100, blocked: null })
  })

  it('blocks with the spec hints', () => {
    expect(plan(EMPTY_SLIP, [e(0, 0)], 'perEnding', 0).blocked).toBe('Enter a stake')
    expect(plan(EMPTY_SLIP, [e(0, 0)], 'perEnding', parseStakeInput('1e3')).blocked).toBe('Enter a stake')
    expect(plan(EMPTY_SLIP, [e(0, 0), e(0, 1), e(0, 2)], 'splitTotal', 2).blocked).toBe(
      'At least 1 pt per ending',
    )
    expect(plan(EMPTY_SLIP, [e(0, 0), e(0, 1)], 'splitTotal', 2_000_001).blocked).toBe(
      'At most 1,000,000 pts per ending',
    )
    expect(plan(EMPTY_SLIP, [e(0, 0)], 'perEnding', 1_000_010).blocked).toBe(
      'At most 1,000,000 pts per ending',
    )
  })

  it('counts room only for endings not already in the slip', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 99; i++) s = add(s, pick(`x${i}`))
    s = add(s, pick('g1', 0, 0))
    expect(slipRoom(s)).toBe(0)
    expect(
      newPickCount(s, [
        { gameId: 'g1', ...e(0, 0) },
        { gameId: 'g1', ...e(0, 1) },
      ]),
    ).toBe(1)
    expect(plan(s, [e(0, 0)], 'perEnding', 10).blocked).toBeNull() // merges, needs no room
    expect(plan(s, [e(0, 0), e(0, 1)], 'perEnding', 10).blocked).toBe('The slip has room for 0 more endings')
  })

  it('says "1 more ending" when exactly one slot is left', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 99; i++) s = add(s, pick(`x${i}`))
    expect(plan(s, [e(0, 0), e(0, 1)], 'perEnding', 10).blocked).toBe('The slip has room for 1 more ending')
  })

  it('addMany merges and appends all picks and sets the last stake', () => {
    const s0 = add(EMPTY_SLIP, pick('g1', 0, 0)) // 100 on 0-0
    const p = plan(s0, [e(0, 0), e(0, 1)], 'perEnding', 30)
    const s = slipReducer(s0, { type: 'addMany', picks: p.picks, lastStake: p.lastStake })
    expect(s.picks.map((x) => [endingKey(x), x.stake])).toEqual([
      ['0-0', 130],
      ['0-1', 30],
    ])
    expect(s.lastStake).toBe(30)
  })

  it('addMany adds nothing when the slip lacks room', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 99; i++) s = add(s, pick(`x${i}`))
    const p = plan(EMPTY_SLIP, [e(0, 0), e(0, 1)], 'perEnding', 10) // planned against an emptier slip
    expect(slipReducer(s, { type: 'addMany', picks: p.picks, lastStake: 10 })).toBe(s)
  })
})
