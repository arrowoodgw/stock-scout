/**
 * app/api/cron/refresh/route.ts
 *
 * POST /api/cron/refresh
 *
 * Vercel Cron endpoint — invoked automatically on the schedule defined in
 * vercel.json ("0 6 * * *" = daily at 06:00 UTC).
 *
 * Authentication:
 *   Vercel sends: Authorization: Bearer <CRON_SECRET>
 *   The CRON_SECRET env var must match exactly.  timingSafeEqual() is used to
 *   prevent timing-based secret enumeration attacks.
 *
 * What it does:
 *   1. Validates the Bearer token.
 *   2. Calls triggerRefresh() — forces a full cache rebuild (quotes + SEC facts
 *      + scoring) even if the cache is already populated.
 *   3. Awaits getCacheSnapshot() to block until the refresh completes.
 *   4. Returns the new cache status, lastUpdated timestamp, and ticker count.
 *
 * This endpoint can also be called manually (e.g. with curl) for testing:
 *   curl -X POST https://<your-domain>/api/cron/refresh \
 *        -H "Authorization: Bearer <CRON_SECRET>"
 */

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCacheSnapshot, triggerRefresh } from '@/lib/dataCache';

/**
 * Constant-time Bearer token comparison.
 * Returns true only when the Authorization header matches "Bearer <CRON_SECRET>".
 * Rejects immediately if CRON_SECRET is not configured.
 */
function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  try {
    const a = Buffer.from(authHeader);
    const b = Buffer.from(expected);
    // Length check is required before timingSafeEqual — different-length buffers throw.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Force a full cache refresh (ignores any existing ready cache).
  await triggerRefresh();
  // Block until the refresh settles, then read the result.
  const snapshot = await getCacheSnapshot();

  return NextResponse.json({
    ok: true,
    refreshed: true,
    status: snapshot.status,
    lastUpdated: snapshot.lastUpdated,
    tickerCount: snapshot.tickers.length
  });
}
