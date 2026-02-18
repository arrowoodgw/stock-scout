import { NextRequest, NextResponse } from 'next/server';
import { getFundamentalsDataProvider, getStockDataProvider } from '@/providers';
import { getUniverseQuotes } from '@/server/universeQuotesService';

const fundamentalsProvider = getFundamentalsDataProvider();
const stockProvider = getStockDataProvider();

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? '';
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  try {
    const [fundamentalsRaw, universeQuotes] = await Promise.all([
      fundamentalsProvider.getFundamentals(ticker, { forceRefresh }),
      // Universe quotes are cached in memory / on disk — usually no extra Polygon call needed.
      // This is the primary price source to avoid burning a rate-limited request per ticker.
      getUniverseQuotes({ forceRefresh: false }).catch(() => null)
    ]);

    // Shallow copy so we never mutate the cached provider object
    const fundamentals = { ...fundamentalsRaw };

    // Prefer the cached universe quote price; fall back to a direct Polygon call only for
    // tickers not in the universe (e.g. a user typed a ticker manually in Ticker Detail).
    const universePrice = universeQuotes?.[ticker.trim().toUpperCase()]?.price ?? null;
    let price: number | null = universePrice;

    if (price === null) {
      const quote = await stockProvider.getLatestQuote(ticker, { forceRefresh }).catch(() => null);
      price = quote?.price ?? null;
    }

    if (price !== null) {
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
