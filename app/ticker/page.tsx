/**
 * app/ticker/page.tsx
 *
 * Ticker Detail page — accessible at /ticker?ticker=AAPL (or any symbol).
 *
 * This is a thin server-rendered shell: it reads the ?ticker= query parameter
 * from the URL and passes it down to TickerDetailView, which is a 'use client'
 * component that handles all data fetching and interactivity.
 *
 * Defaults to AAPL when no ticker is provided so the page is never blank on
 * first visit.
 */

import { TickerDetailView } from '@/components/TickerDetailView';

type TickerPageProps = {
  searchParams: {
    /** Ticker symbol from the URL query string, e.g. ?ticker=MSFT */
    ticker?: string;
  };
};

export default function TickerPage({ searchParams }: TickerPageProps) {
  // Normalise the ticker to uppercase; default to AAPL if missing.
  const initialTicker = searchParams.ticker?.trim().toUpperCase() || 'AAPL';

  return (
    <main className="page">
      <TickerDetailView initialTicker={initialTicker} />
    </main>
  );
}
