/**
 * app/api/health/route.ts
 *
 * GET /api/health
 *
 * Lightweight health-check endpoint for monitoring and deployment verification.
 * Returns a snapshot of the current cache state without triggering any new work.
 *
 * Example response:
 * {
 *   "status": "ready",
 *   "lastUpdated": "2026-02-18T06:00:01.234Z",
 *   "universeSize": 50,
 *   "scoreVersion": "v2",
 *   "dataMode": "real",
 *   "cacheState": {
 *     "status": "ready",
 *     "error": null,
 *     "inFlight": false
 *   }
 * }
 *
 * Use this endpoint to:
 *   - Confirm the server started successfully and the preload completed.
 *   - Verify that the daily cron job refreshed the cache (check lastUpdated).
 *   - Alert when status=error persists (preload pipeline failure).
 */

import { NextResponse } from 'next/server';
import { getCacheHealth } from '@/lib/dataCache';

export async function GET() {
  return NextResponse.json(getCacheHealth());
}
