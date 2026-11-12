import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseSyncIntervalMinutes, startSyncScheduler, stopSyncScheduler } from '@/server/sync/scheduler'

const MIN = 60_000

describe('parseSyncIntervalMinutes', () => {
  it.each([undefined, '', '0', '-5', 'abc', '1.5', '1e3', '1441'])('treats %s as disabled', (raw) => {
    expect(parseSyncIntervalMinutes(raw)).toBeNull()
  })

  it.each([
    ['1', 1 * MIN],
    ['5', 5 * MIN],
    [' 15 ', 15 * MIN],
    ['1440', 1440 * MIN],
  ])('parses %s minutes', (raw, ms) => {
    expect(parseSyncIntervalMinutes(raw)).toBe(ms)
  })
})

describe('startSyncScheduler', () => {
  const log = { info: vi.fn(), error: vi.fn() }

  beforeEach(() => {
    vi.useFakeTimers()
    log.info.mockReset()
    log.error.mockReset()
  })

  afterEach(() => {
    stopSyncScheduler()
    vi.useRealTimers()
  })

  it('runs once at start, then every interval', async () => {
    const run = vi.fn().mockResolvedValue({ settled: 0 })
    startSyncScheduler({ intervalMs: 5 * MIN, run, log })
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5 * MIN)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('skips a tick while the previous run is still going', async () => {
    let finish: () => void = () => {}
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    startSyncScheduler({ intervalMs: 5 * MIN, run, log })
    await vi.advanceTimersByTimeAsync(15 * MIN)
    expect(run).toHaveBeenCalledTimes(1)

    finish()
    await vi.advanceTimersByTimeAsync(5 * MIN)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('logs a failed run and keeps going', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('api down')).mockResolvedValue({})
    startSyncScheduler({ intervalMs: 5 * MIN, run, log })
    await vi.advanceTimersByTimeAsync(0)
    expect(log.error).toHaveBeenCalledWith('scheduled sync failed', expect.any(Error))

    await vi.advanceTimersByTimeAsync(5 * MIN)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('keeps a single timer when started twice (e.g. dev reloads)', async () => {
    const first = vi.fn().mockResolvedValue({})
    const second = vi.fn().mockResolvedValue({})
    expect(startSyncScheduler({ intervalMs: 5 * MIN, run: first, log })).toBe(true)
    expect(startSyncScheduler({ intervalMs: 5 * MIN, run: second, log })).toBe(false)

    await vi.advanceTimersByTimeAsync(5 * MIN)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).not.toHaveBeenCalled()
  })

  it('stops running after stopSyncScheduler', async () => {
    const run = vi.fn().mockResolvedValue({})
    startSyncScheduler({ intervalMs: 5 * MIN, run, log })
    await vi.advanceTimersByTimeAsync(0)
    stopSyncScheduler()

    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(run).toHaveBeenCalledTimes(1)
    expect(startSyncScheduler({ intervalMs: 5 * MIN, run, log })).toBe(true)
  })
})
