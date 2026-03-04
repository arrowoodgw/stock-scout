/**
 * app/api/market/quote/route.ts
 *
 * GET /api/market/quote?ticker=AAPL[&refresh=1]
 *
 * Returns the latest (or previous-close) price for a single ticker.
 * Delegates to the active StockDataProvider (Polygon in real mode, mock otherwise).
 *
 * Used by the Portfolio page to fill in prices for out-of-universe tickers
 * that are not covered by the main cache.
 *
 * Query parameters:
 *   ticker   (required) — stock symbol, e.g. AAPL
 *   refresh  (optional) — pass "1" to bypass the provider's internal cache
 *
 * Response: StockQuote { ticker, price, updatedAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStockDataProvider } from '@/providers';

const stockProvider = getStockDataProvider();

export async function GET(request: NextRequest) {
  const ticker = (request.nextUrl.searchParams.get('ticker') ?? '').trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: 'Missing ticker parameter.' }, { status: 400 });
  }

  try {
    const quote = await stockProvider.getLatestQuote(ticker, {
      forceRefresh: request.nextUrl.searchParams.get('refresh') === '1'
    });

    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load latest quote.';
    if (message.includes('Missing POLYGON_API_KEY')) {
      return NextResponse.json({ error: 'Service configuration error.' }, { status: 500 });
    }
    const status = message.includes('Invalid') ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
