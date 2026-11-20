import { type NextRequest, NextResponse } from 'next/server'

import { ORIGIN_SECRET_HEADER, originAllowed } from '@/lib/origin-gate'

/** In production every request must come through the Cloudflare Worker (src/lib/origin-gate.ts). */
export function middleware(req: NextRequest) {
  if (!originAllowed(process.env.ORIGIN_SECRET, req.headers.get(ORIGIN_SECRET_HEADER))) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  // Node.js runtime, so ORIGIN_SECRET is read when the server runs, not inlined at build time.
  runtime: 'nodejs',
  matcher: '/:path*',
}
