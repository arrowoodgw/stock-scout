/**
 * app/api/preload/route.ts
 *
 * POST  /api/preload           — trigger a full cache refresh (used by startup & Refresh button)
 * GET   /api/preload           — return current cache status without triggering a reload
 *
 * The Rankings page and Ticker Detail page should never call this directly for data;
 * they call /api/rankings which reads from the already-populated cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCacheSnapshot, triggerPreload } from '@/lib/dataCache';

export async function GET() {
  return NextResponse.json(getCacheSnapshot());
}

export async function POST(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  // Fire-and-forget: don't block the response waiting for all 50 SEC calls.
  // The client can poll GET /api/preload for status, or GET /api/rankings.
  void triggerPreload(forceRefresh);

  return NextResponse.json({ started: true, forceRefresh });
}
