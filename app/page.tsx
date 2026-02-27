/**
 * app/page.tsx
 *
 * M5.1 – Async React Server Component (no 'use client').
 *
 * Calls getCacheSnapshot() which awaits the preload if the cache is still
 * warming up, then passes the fully enriched dataset to RankingsClient as
 * props.  All ranking data is therefore embedded in the initial HTML —
 * zero client-side fetch on first paint.
 *
 * RankingsClient (a 'use client' component) seeds its state from those props
 * and only hits the network again when the user explicitly clicks "Refresh data".
 */

import { getCacheSnapshot } from '@/lib/dataCache';
import RankingsClient from '@/components/RankingsClient';

export default async function RankingsPage() {
  // M5.1: await the cache so all EnrichedTicker data is in the HTML on first paint.
  // If the preload is already in flight (triggered by instrumentation.ts at startup),
  // this joins that promise — no duplicate work.
  const snapshot = await getCacheSnapshot();

  return (
    <RankingsClient
      initialData={snapshot.tickers}
      lastUpdated={snapshot.lastUpdated}
      initialStatus={snapshot.status}
      initialError={snapshot.error}
    />
  );
}
