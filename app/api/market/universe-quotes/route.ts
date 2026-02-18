import { NextRequest, NextResponse } from 'next/server';
import { getUniverseQuotes } from '@/server/universeQuotesService';
import { top50MarketCap } from '@/universe/top50MarketCap';

export async function GET(request: NextRequest) {
  try {
    const quotes = await getUniverseQuotes({
      forceRefresh: request.nextUrl.searchParams.get('refresh') === '1'
    });

    return NextResponse.json({
      tickers: top50MarketCap.tickers,
      asOf: top50MarketCap.asOf,
      source: top50MarketCap.source,
      quotes
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load universe quotes.';
    const status = message.includes('Missing POLYGON_API_KEY') ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
