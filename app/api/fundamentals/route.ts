import { NextRequest, NextResponse } from 'next/server';
import { getFundamentalsDataProvider, getStockDataProvider } from '@/providers';

const fundamentalsProvider = getFundamentalsDataProvider();
const stockProvider = getStockDataProvider();

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? '';
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  try {
    const [fundamentalsRaw, quote] = await Promise.all([
      fundamentalsProvider.getFundamentals(ticker, { forceRefresh }),
      stockProvider.getLatestQuote(ticker, { forceRefresh }).catch(() => null)
    ]);

    // Shallow copy so we never mutate the cached provider object
    const fundamentals = { ...fundamentalsRaw };

    if (quote) {
      const { price } = quote;

      fundamentals.peTtm =
        fundamentals.epsTtm !== null && fundamentals.epsTtm !== 0
          ? price / fundamentals.epsTtm
          : null;

      fundamentals.ps =
        fundamentals.sharesOutstanding != null &&
        fundamentals.revenueTtm !== null &&
        fundamentals.revenueTtm !== 0
          ? (price * fundamentals.sharesOutstanding) / fundamentals.revenueTtm
          : null;
    }

    // DEBUG: confirm scoring inputs are flowing through — remove once verified
    console.log('DEBUG fundamentals:', JSON.stringify({
      ticker: fundamentals.ticker,
      peTtm: fundamentals.peTtm,
      ps: fundamentals.ps,
      epsTtm: fundamentals.epsTtm,
      revenueTtm: fundamentals.revenueTtm,
      revenueGrowthYoY: fundamentals.revenueGrowthYoY,
      operatingMargin: fundamentals.operatingMargin,
      sharesOutstanding: fundamentals.sharesOutstanding
    }));

    return NextResponse.json(fundamentals);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load fundamentals.';
    const status =
      message.includes('Invalid') || message.includes('Please provide')
        ? 400
        : message.includes('Missing SEC_USER_AGENT')
          ? 500
          : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
