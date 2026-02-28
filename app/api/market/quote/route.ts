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
