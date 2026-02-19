/**
 * app/api/ticker/route.ts
 *
 * GET /api/ticker?ticker=AAPL
 *
 * Returns an EnrichedTicker for the requested symbol.
 *
 * Strategy:
 * 1. If the ticker is in the pre-loaded cache → return from cache immediately.
 * 2. If the cache is still loading → return status: 'loading' so the UI can wait.
 * 3. If the ticker is NOT in the universe (user typed an arbitrary symbol) →
 *    fall back to on-demand fetching via the existing /api/fundamentals route
 *    and synthesise an EnrichedTicker with scores calculated server-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCacheSnapshot, triggerPreload } from '@/lib/dataCache';
import { calculateValueScore } from '@/lib/valueScore';
import { EnrichedTicker } from '@/types';

// We re-use the existing fundamentals + stock providers for out-of-universe tickers
import { getFundamentalsDataProvider, getStockDataProvider } from '@/providers';

const fundamentalsProvider = getFundamentalsDataProvider();
const stockProvider = getStockDataProvider();

export async function GET(request: NextRequest) {
  const tickerParam = request.nextUrl.searchParams.get('ticker') ?? '';
  const ticker = tickerParam.trim().toUpperCase();
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  if (!ticker) {
    return NextResponse.json({ error: 'Missing ticker parameter.' }, { status: 400 });
  }

  const snapshot = getCacheSnapshot();

  // Auto-warm the cache if cold
  if (snapshot.status === 'cold') {
    void triggerPreload(false);
  }

  // If cache is loading and user wants a refresh, signal that
  if (snapshot.status === 'loading' && !forceRefresh) {
    return NextResponse.json({ status: 'loading', ticker }, { status: 202 });
  }

  // 1. Happy path: serve from cache for universe tickers
  if (!forceRefresh && (snapshot.status === 'ready' || snapshot.status === 'error')) {
    const cached = snapshot.tickers.find((t) => t.ticker === ticker);
    if (cached) {
      return NextResponse.json({ status: 'ready', ticker: cached });
    }
  }

  // 2. Ticker not in universe (or forceRefresh) — fetch on-demand
  try {
    const [fundamentalsRaw, quote] = await Promise.all([
      fundamentalsProvider.getFundamentals(ticker, { forceRefresh }),
      stockProvider.getLatestQuote(ticker, { forceRefresh }).catch(() => null)
    ]);

    const latestPrice = quote?.price ?? null;

    // Compute price-dependent fields
    const peTtm =
      latestPrice !== null && fundamentalsRaw.epsTtm !== null && fundamentalsRaw.epsTtm !== 0
        ? latestPrice / fundamentalsRaw.epsTtm
        : fundamentalsRaw.peTtm;

    const marketCap =
      latestPrice !== null && fundamentalsRaw.sharesOutstanding != null
        ? latestPrice * fundamentalsRaw.sharesOutstanding
        : fundamentalsRaw.marketCap;

    const ps =
      marketCap !== null && fundamentalsRaw.revenueTtm !== null && fundamentalsRaw.revenueTtm !== 0
        ? marketCap / fundamentalsRaw.revenueTtm
        : fundamentalsRaw.ps;

    const { total: valueScore, breakdown: scoreBreakdown } = calculateValueScore({
      peTtm,
      ps,
      revenueGrowthYoY: fundamentalsRaw.revenueGrowthYoY,
      operatingMargin: fundamentalsRaw.operatingMargin
    });

    const enriched: EnrichedTicker = {
      ticker,
      companyName: null,
      latestPrice,
      marketCap,
      peTtm,
      ps,
      epsTtm: fundamentalsRaw.epsTtm,
      revenueTtm: fundamentalsRaw.revenueTtm,
      revenueGrowthYoY: fundamentalsRaw.revenueGrowthYoY,
      operatingMargin: fundamentalsRaw.operatingMargin,
      valueScore,
      scoreBreakdown,
      fundamentalsAsOf: fundamentalsRaw.asOf
    };

    return NextResponse.json({ status: 'ready', ticker: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load ticker data.';
    const status =
      message.includes('Please provide') ? 400
      : message.includes('Missing') ? 500
      : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
