/**
 * Next.js calls register() once when a server instance starts. It starts the in-app game
 * sync schedule (src/server/sync/scheduler.ts) when SYNC_INTERVAL_MINUTES is set.
 * Server-only modules are imported dynamically so they never reach the edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { parseSyncIntervalMinutes, startSyncScheduler } = await import('./server/sync/scheduler')
  const intervalMs = parseSyncIntervalMinutes(process.env.SYNC_INTERVAL_MINUTES)
  if (!intervalMs) return
  if (!process.env.BALLDONTLIE_API_KEY) {
    console.warn('SYNC_INTERVAL_MINUTES is set but BALLDONTLIE_API_KEY is not; game sync is off')
    return
  }

  const { defaultFetcher, syncGames } = await import('./server/sync/sync')
  if (startSyncScheduler({ intervalMs, run: () => syncGames({ fetchGames: defaultFetcher() }) })) {
    console.info(`game sync scheduled every ${intervalMs / 60_000} min`)
  }
}
