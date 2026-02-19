import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio, writePortfolio } from '@/lib/portfolio';
import { getCacheSnapshot } from '@/lib/dataCache';
import { EnrichedPortfolioHolding } from '@/types';

export async function GET() {
  try {
    const portfolio = await readPortfolio();
    const cache = getCacheSnapshot();

    // Build a ticker -> latestPrice lookup from cache
    const priceMap = new Map<string, number>();
    for (const t of cache.tickers) {
      if (t.latestPrice !== null) {
        priceMap.set(t.ticker, t.latestPrice);
      }
    }

    const enriched: EnrichedPortfolioHolding[] = portfolio.holdings.map((h) => {
      const currentPrice = priceMap.get(h.ticker) ?? null;
      const costBasis = h.shares * h.purchasePrice;
      const currentValue = currentPrice !== null ? h.shares * currentPrice : null;
      const gainLossDollar = currentValue !== null ? currentValue - costBasis : null;
      const gainLossPercent = gainLossDollar !== null && costBasis > 0
        ? (gainLossDollar / costBasis) * 100
        : null;

      return {
        ...h,
        currentPrice,
        currentValue,
        gainLossDollar,
        gainLossPercent,
      };
    });

    return NextResponse.json({ holdings: enriched });
  } catch {
    return NextResponse.json({ error: 'Could not read portfolio.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      ticker?: unknown;
      companyName?: unknown;
      shares?: unknown;
      purchasePrice?: unknown;
      purchaseDate?: unknown;
      notes?: unknown;
    };

    const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const shares = Number(body.shares);
    const purchasePrice = Number(body.purchasePrice);
    const purchaseDate = typeof body.purchaseDate === 'string' ? body.purchaseDate.trim() : new Date().toISOString().split('T')[0];
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : undefined;

    if (!ticker) {
      return NextResponse.json({ error: 'Missing ticker.' }, { status: 400 });
    }

    if (!Number.isFinite(shares) || shares <= 0) {
      return NextResponse.json({ error: 'shares must be a positive number.' }, { status: 400 });
    }

    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      return NextResponse.json({ error: 'purchasePrice must be a positive number.' }, { status: 400 });
    }

    const portfolio = await readPortfolio();

    portfolio.holdings.push({
      ticker,
      companyName: companyName || ticker,
      shares,
      purchasePrice,
      purchaseDate,
      ...(notes ? { notes } : {}),
    });

    await writePortfolio(portfolio);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not save holding.' }, { status: 500 });
  }
}
