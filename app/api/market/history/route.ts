/**
 * app/api/market/history/route.ts
 *
 * GET /api/market/history?ticker=AAPL&range=1M[&refresh=1]
 *
 * Returns an array of daily closing prices (HistoricalPoint[]) for the requested
 * ticker and time range.  Used by the HistoricalChart component on the Ticker
 * Detail page.
 *
 * Delegates to the active StockDataProvider:
 *   - Real mode:  Polygon.io daily aggregate bars
 *   - Mock mode:  deterministic seeded price series
 *
 * Query parameters:
 *   ticker   (required) — stock symbol, e.g. AAPL
 *   range    (required) — "1M", "6M", or "1Y"
 *   refresh  (optional) — pass "1" to bypass provider-level caching
 *
 * Response: HistoricalPoint[] (array of { date: string; price: number })
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockDataProvider } from '@/providers';
import { PriceRange } from '@/providers/types';

const stockProvider = getStockDataProvider();
/** Allowed range values — used to validate the query parameter. */
const ranges = new Set<PriceRange>(['1M', '6M', '1Y']);

export async function GET(request: NextRequest) {
  const ticker = (request.nextUrl.searchParams.get('ticker') ?? '').trim().toUpperCase();
  const rangeParam = request.nextUrl.searchParams.get('range') ?? '1M';

  if (!ticker) {
    return NextResponse.json({ error: 'Missing ticker parameter.' }, { status: 400 });
  }

  if (!ranges.has(rangeParam as PriceRange)) {
    return NextResponse.json({ error: 'Invalid range supplied.' }, { status: 400 });
  }

  try {
    const prices = await stockProvider.getHistoricalPrices(ticker, rangeParam as PriceRange, {
      forceRefresh: request.nextUrl.searchParams.get('refresh') === '1'
    });

    return NextResponse.json(prices);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load historical prices.';
    if (message.includes('Missing POLYGON_API_KEY')) {
      return NextResponse.json({ error: 'Service configuration error.' }, { status: 500 });
    }
    const status = message.includes('Invalid') ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
