import { defaultFetcher, syncGames } from '@/server/sync/sync'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await syncGames({ fetchGames: defaultFetcher() })
    return Response.json(result)
  } catch (e) {
    console.error('sync failed', e)
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
