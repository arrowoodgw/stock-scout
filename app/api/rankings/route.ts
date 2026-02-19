/**
 * app/api/rankings/route.ts
 *
 * GET /api/rankings
 *
 * Returns the fully enriched and pre-scored Top-50 dataset from the in-memory cache.
 * If the cache is cold (app just started), kicks off a preload in the background
 * and returns status: 'loading' immediately so the UI can show a loading state.
 *
 * No data fetching or score calculation happens in this route — it only reads the cache.
 */

import { NextResponse } from 'next/server';
import { getCacheSnapshot, triggerPreload } from '@/lib/dataCache';

export async function GET() {
  const snapshot = getCacheSnapshot();

  // Auto-start preload if cache hasn't been populated yet
  if (snapshot.status === 'cold') {
    void triggerPreload(false);
  }

  return NextResponse.json(snapshot);
}
