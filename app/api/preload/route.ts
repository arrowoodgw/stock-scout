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
import { getCacheSnapshot, triggerPreload, triggerRefresh } from '@/lib/dataCache';

export async function GET() {
  return NextResponse.json(await getCacheSnapshot());
}

export async function POST(request: NextRequest) {
  const requireAdmin = (process.env.PRELOAD_REQUIRE_ADMIN ?? '').trim() === '1';
  const isAdmin = request.nextUrl.searchParams.get('admin') === '1';
  if (requireAdmin && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  // Fire-and-forget: don't block the response waiting for all 50 SEC calls.
  // The client can poll GET /api/preload for status, or GET /api/rankings.
  if (forceRefresh) {
    void triggerRefresh();
  } else {
    void triggerPreload(false);
  }

  return NextResponse.json({ started: true, forceRefresh });
}
