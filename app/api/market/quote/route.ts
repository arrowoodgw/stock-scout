import { NextRequest, NextResponse } from 'next/server';
import { getLatestQuote } from '@/server/alphaVantageStockService';

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? '';
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  try {
    const quote = await getLatestQuote(ticker, forceRefresh);
    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load latest quote.';
    const status = message.includes('Invalid ticker') ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
