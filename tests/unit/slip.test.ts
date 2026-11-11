import { describe, expect, it, vi } from 'vitest'

import {
  canAdd,
  EMPTY_SLIP,
  maxStakeFor,
  parseStakeInput,
  parseStoredSlip,
  type Slip,
  slipReducer,
  slipStorageKey,
  slipTotal,
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

  it('caps the slip at 20 picks but still merges into existing ones', () => {
    let s = EMPTY_SLIP
    for (let i = 0; i < 20; i++) s = add(s, pick(`g${i}`))
    expect(s.picks).toHaveLength(20)
    expect(canAdd(s, pick('g20'))).toBe(false)
    expect(add(s, pick('g20'))).toBe(s)
    expect(canAdd(s, pick('g3'))).toBe(true)
    expect(add(s, pick('g3')).picks[3]?.stake).toBe(200)
    expect(slipTotal(s.picks)).toBe(2000)
  })
})

describe('slip input and storage', () => {
  it('parses stake input as whole numbers only', () => {
    expect(parseStakeInput('250')).toBe(250)
    expect(parseStakeInput(' 7 ')).toBe(7)
    for (const bad of ['', '-5', '1.5', '1e3', 'abc']) expect(parseStakeInput(bad)).toBe(0)
    expect(parseStakeInput('99999999999')).toBe(0)
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
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ ...pick(`g${i}`), stake: 1 }))
    expect(parseStoredSlip(JSON.stringify({ picks: tooMany, lastStake: 100 }))).toEqual(EMPTY_SLIP)
    expect(slipStorageKey('u1')).toBe('lastdigit.slip.u1')
  })
})
