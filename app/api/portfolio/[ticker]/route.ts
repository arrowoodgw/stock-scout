import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio, writePortfolio } from '@/lib/portfolio';

type RouteContext = {
  params: Promise<{ ticker: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { ticker } = await context.params;
    const normalizedTicker = ticker.trim().toUpperCase();

    if (!normalizedTicker) {
      return NextResponse.json({ error: 'Missing ticker.' }, { status: 400 });
    }

    const portfolio = await readPortfolio();
    const before = portfolio.holdings.length;

    portfolio.holdings = portfolio.holdings.filter((h) => h.ticker !== normalizedTicker);

    if (portfolio.holdings.length === before) {
      return NextResponse.json({ error: `No holding found for ${normalizedTicker}.` }, { status: 404 });
    }

    await writePortfolio(portfolio);

    return NextResponse.json({ ok: true, removed: normalizedTicker });
  } catch {
    return NextResponse.json({ error: 'Could not remove holding.' }, { status: 500 });
  }
}
