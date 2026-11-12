/**
 * In-app game sync schedule. `src/instrumentation.ts` starts it once when the Next.js
 * server boots, so syncing lives and dies with the app instead of an external cron.
 * Every app instance runs its own schedule; that is safe because syncGames never
 * overwrites FINAL/SETTLED/VOID games and settlement is idempotent.
 */

type Log = {
  info: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

type SchedulerState = { timer: ReturnType<typeof setInterval>; running: boolean }

// Kept on globalThis so a dev-server module reload doesn't start a second timer.
const KEY = Symbol.for('lastdigit.syncScheduler')
const store = globalThis as typeof globalThis & { [KEY]?: SchedulerState }

const MAX_MINUTES = 1440

/** `SYNC_INTERVAL_MINUTES` → interval in ms, or null (disabled) unless it is a whole number 1–1440. */
export function parseSyncIntervalMinutes(raw: string | undefined): number | null {
  const value = raw?.trim() ?? ''
  if (!/^\d+$/.test(value)) return null
  const minutes = Number(value)
  if (minutes < 1 || minutes > MAX_MINUTES) return null
  return minutes * 60_000
}

/**
 * Runs `run` now and then every `intervalMs`. A tick is skipped while the previous run is
 * still in flight; a failed run is logged and the schedule continues.
 * Returns false (and does nothing) if a schedule is already running.
 */
export function startSyncScheduler({
  intervalMs,
  run,
  log = console,
}: {
  intervalMs: number
  run: () => Promise<unknown>
  log?: Log
}): boolean {
  if (store[KEY]) return false

  const tick = async () => {
    const state = store[KEY]
    if (!state || state.running) return
    state.running = true
    try {
      const result = await run()
      log.info('scheduled sync done', result)
    } catch (e) {
      log.error('scheduled sync failed', e)
    } finally {
      state.running = false
    }
  }

  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()
  store[KEY] = { timer, running: false }
  void tick()
  return true
}

export function stopSyncScheduler(): void {
  const state = store[KEY]
  if (!state) return
  clearInterval(state.timer)
  delete store[KEY]
}
