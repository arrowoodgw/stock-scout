import { NextRequest, NextResponse } from 'next/server';
import { getStockDataProvider } from '@/providers';
import { PriceRange } from '@/providers/types';

const stockProvider = getStockDataProvider();
const ranges = new Set<PriceRange>(['1M', '6M', '1Y']);

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? '';
  const rangeParam = request.nextUrl.searchParams.get('range') ?? '1M';

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
    const status = message.includes('Invalid') ? 400 : message.includes('Missing ALPHAVANTAGE_API_KEY') ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
