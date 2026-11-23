import { describe, expect, it, vi } from 'vitest'

import {
  addBlockReason,
  bestCaseReturn,
  bestCaseSplit,
  canAdd,
  EMPTY_SLIP,
  endingKey,
  estimatePickReturns,
  maxStakeFor,
  newPickCount,
  parseStakeInput,
  parseStoredSlip,
  parseTotalInput,
  planMultiAdd,
  resolveAccount,
  returnSplit,
  type Slip,
  slipReducer,
  slipRoom,
  slipShortfall,
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

  it('caps one game at 20 endings but still merges and allows other games', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 20; i++) s = add(s, pick('g1', Math.floor(i / 10), i % 10))
    expect(s.picks).toHaveLength(20)
    expect(addBlockReason(s, pick('g1', 5, 5))).toBe('At most 20 endings per game (0 left)')
    expect(canAdd(s, pick('g1', 5, 5))).toBe(false)
    expect(add(s, pick('g1', 5, 5))).toBe(s)
    expect(canAdd(s, pick('g1', 0, 0))).toBe(true) // merge
    expect(canAdd(s, pick('g2', 5, 5))).toBe(true)
    expect(addBlockReason(s, pick('g2', 5, 5))).toBeNull()
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
      'At least 1 per ending',
    )
    expect(plan(EMPTY_SLIP, [e(0, 0), e(0, 1)], 'splitTotal', 2_000_001).blocked).toBe(
      'At most 1,000,000 per ending',
    )
    expect(plan(EMPTY_SLIP, [e(0, 0)], 'perEnding', 1_000_010).blocked).toBe('At most 1,000,000 per ending')
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

  it('blocks a selection that would put more than 20 endings on one game', () => {
    let s = EMPTY_SLIP
    for (let h = 0; h < 10; h++) s = add(s, pick('g1', 0, h))
    for (let h = 0; h < 5; h++) s = add(s, pick('g1', 1, h)) // 15 endings on g1
    for (let h = 0; h < 30; h++) s = add(s, pick(`x${h}`)) // other games don't count
    const six = [e(2, 0), e(2, 1), e(2, 2), e(2, 3), e(2, 4), e(2, 5)]
    expect(plan(s, six, 'perEnding', 10).blocked).toBe('At most 20 endings per game (5 left)')
    expect(plan(s, six.slice(0, 5), 'perEnding', 10).blocked).toBeNull()
    expect(plan(s, [e(0, 0), ...six.slice(0, 5)], 'perEnding', 10).blocked).toBeNull() // 0-0 merges
    const p = plan(EMPTY_SLIP, six, 'perEnding', 10) // planned against an emptier slip
    expect(slipReducer(s, { type: 'addMany', picks: p.picks, lastStake: 10 })).toBe(s)
  })

  it('addMany adds nothing when the slip lacks room', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 99; i++) s = add(s, pick(`x${i}`))
    const p = plan(EMPTY_SLIP, [e(0, 0), e(0, 1)], 'perEnding', 10) // planned against an emptier slip
    expect(slipReducer(s, { type: 'addMany', picks: p.picks, lastStake: 10 })).toBe(s)
  })
})

describe('clear and restore', () => {
  const full: Slip = {
    picks: [
      { ...pick('g1'), stake: 100 },
      { ...pick('g2'), stake: 50 },
    ],
    lastStake: 50,
    account: null,
  }

  it('clear empties the picks and keeps the last stake', () => {
    expect(slipReducer(full, { type: 'clear' })).toEqual({ picks: [], lastStake: 50, account: null })
  })

  it('restore puts the cleared picks back into an empty slip', () => {
    const cleared = slipReducer(full, { type: 'clear' })
    expect(slipReducer(cleared, { type: 'restore', picks: full.picks })).toEqual(full)
  })

  it('restore does nothing once the slip has new picks', () => {
    const fresh = add(slipReducer(full, { type: 'clear' }), pick('g3'))
    expect(slipReducer(fresh, { type: 'restore', picks: full.picks })).toBe(fresh)
  })
})

describe('estimated returns', () => {
  const picks = [
    { ...pick('g1', 9, 6), stake: 100 },
    { ...pick('g1', 0, 0), stake: 100 },
    { ...pick('g2', 3, 4), stake: 100 },
  ]
  const pools: Record<string, { pool: number; endingStake: number }> = {
    'g1:9-6': { pool: 1000, endingStake: 300 },
    'g1:0-0': { pool: 1000, endingStake: 0 },
    'g2:3-4': { pool: 0, endingStake: 0 },
  }
  const poolOf = (p: { gameId: string; awayDigit: number; homeDigit: number }) =>
    pools[`${p.gameId}:${p.awayDigit}-${p.homeDigit}`]

  it("counts the player's other picks on the same game as losing stake in the pool", () => {
    // 9-6: pool 1000 + 100 (the 0-0 pick) + 100 = 1200, 90% = 1080, split over 400 → 270
    // 0-0: same pool, only this stake on the ending → 1080
    // g2: nobody else, the stake comes back → 100
    expect(estimatePickReturns(picks, poolOf)).toEqual([270, 1080, 100])
  })

  it('returns null for a pick whose pool is not known yet', () => {
    expect(estimatePickReturns(picks, () => undefined)).toEqual([null, null, null])
  })

  it('the best case takes only the best pick of each game, since one ending wins per game', () => {
    expect(bestCaseReturn(picks, [270, 1080, 100])).toBe(1180)
    expect(bestCaseReturn(picks, [270, null, null])).toBe(270)
    expect(bestCaseReturn([], [])).toBe(0)
  })
})

describe('pay from', () => {
  const b = { wallet: 700, points: 40 }

  it('defaults to points when the player has any, else the wallet', () => {
    expect(resolveAccount(null, b)).toBe('POINTS')
    expect(resolveAccount(null, { wallet: 700, points: 0 })).toBe('WALLET')
    expect(resolveAccount(null, { wallet: 700, points: -5 })).toBe('WALLET')
    expect(resolveAccount('WALLET', b)).toBe('WALLET')
  })

  it('reports a shortfall in the chosen balance and offers the other when it covers the slip', () => {
    expect(slipShortfall('POINTS', b, 40)).toBeNull()
    expect(slipShortfall('POINTS', b, 100)).toEqual({
      message: 'Not enough points (40 pts).',
      switchTo: 'WALLET',
    })
    expect(slipShortfall('POINTS', b, 800)).toEqual({
      message: 'Not enough points (40 pts).',
      switchTo: null,
    })
    expect(slipShortfall('WALLET', { wallet: -25, points: 40 }, 50)).toEqual({
      message: 'Not enough in the wallet (₱0).',
      switchTo: null,
    })
  })

  it('splits a points return into the stake back as points and the rest as wallet', () => {
    expect(returnSplit('WALLET', 100, 310)).toEqual({ wallet: 310, points: 0 })
    expect(returnSplit('POINTS', 100, 310)).toEqual({ wallet: 210, points: 100 })
    // a crowded ending: the estimate is at or below the stake, so no ₱ part
    expect(returnSplit('POINTS', 100, 100)).toEqual({ wallet: 0, points: 100 })
    expect(returnSplit('POINTS', 100, 80)).toEqual({ wallet: 0, points: 80 })
  })

  it('splits the best case per game', () => {
    const picks = [
      { gameId: 'g1', awayDigit: 1, homeDigit: 2, stake: 100, matchup: 'A @ B' },
      { gameId: 'g1', awayDigit: 3, homeDigit: 4, stake: 50, matchup: 'A @ B' },
      { gameId: 'g2', awayDigit: 0, homeDigit: 0, stake: 20, matchup: 'C @ D' },
    ]
    // best of g1 is the first pick (300), g2's pick returns 60
    expect(bestCaseSplit(picks, [300, 200, 60], 'POINTS')).toEqual({ wallet: 240, points: 120 })
    expect(bestCaseSplit(picks, [300, 200, 60], 'WALLET')).toEqual({ wallet: 360, points: 0 })
    expect(bestCaseSplit(picks, [null, null, null], 'POINTS')).toEqual({ wallet: 0, points: 0 })
  })

  it('stores the choice', () => {
    const s = slipReducer(
      { picks: [], lastStake: 100, account: null },
      { type: 'setAccount', account: 'WALLET' },
    )
    expect(s.account).toBe('WALLET')
  })

  it('loads a slip saved before the choice existed, keeping its picks', () => {
    const old = JSON.stringify({
      picks: [{ gameId: 'g1', awayDigit: 1, homeDigit: 2, stake: 100, matchup: 'A @ B' }],
      lastStake: 100,
    })
    const s = parseStoredSlip(old)
    expect(s.picks).toHaveLength(1)
    expect(s.account).toBeNull()
  })

  it('drops an unknown saved account instead of the whole slip', () => {
    const odd = JSON.stringify({ picks: [], lastStake: 50, account: 'BITCOIN' })
    expect(parseStoredSlip(odd)).toEqual({ picks: [], lastStake: 50, account: null })
  })
})
