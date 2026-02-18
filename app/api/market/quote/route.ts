import { NextRequest, NextResponse } from 'next/server';
import { getStockDataProvider } from '@/providers';

const stockProvider = getStockDataProvider();

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? '';

  try {
    const quote = await stockProvider.getLatestQuote(ticker, {
      forceRefresh: request.nextUrl.searchParams.get('refresh') === '1'
    });

    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load latest quote.';
    const status = message.includes('Invalid') ? 400 : message.includes('Missing POLYGON_API_KEY') ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
