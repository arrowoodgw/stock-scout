import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio, writePortfolio } from '@/lib/portfolio';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      ticker?: unknown;
      companyName?: unknown;
      shares?: unknown;
      purchasePrice?: unknown;
    };

    const ticker = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const shares = Number(body.shares);
    const purchasePrice = Number(body.purchasePrice);

    if (!ticker) {
      return NextResponse.json({ error: 'Missing ticker.' }, { status: 400 });
    }

    if (!Number.isFinite(shares) || shares < 1) {
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
      purchaseDate: new Date().toISOString().split('T')[0]
    });

    await writePortfolio(portfolio);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not save holding.' }, { status: 500 });
  }
}
