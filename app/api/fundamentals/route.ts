import { NextRequest, NextResponse } from 'next/server';
import { getFundamentalsDataProvider } from '@/providers';

const fundamentalsProvider = getFundamentalsDataProvider();

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? '';

  try {
    const fundamentals = await fundamentalsProvider.getFundamentals(ticker, {
      forceRefresh: request.nextUrl.searchParams.get('refresh') === '1'
    });

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
