import { NextRequest, NextResponse } from 'next/server';
import { PriceRange } from '@/providers/types';
import { getHistoricalPrices } from '@/server/alphaVantageStockService';

const ranges = new Set<PriceRange>(['1M', '6M', '1Y']);

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? '';
  const rangeParam = request.nextUrl.searchParams.get('range') ?? '1M';
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  if (!ranges.has(rangeParam as PriceRange)) {
    return NextResponse.json({ error: 'Invalid range supplied.' }, { status: 400 });
  }

  try {
    const prices = await getHistoricalPrices(ticker, rangeParam as PriceRange, forceRefresh);
    return NextResponse.json(prices);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load historical prices.';
    const status = message.includes('Invalid ticker') ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
