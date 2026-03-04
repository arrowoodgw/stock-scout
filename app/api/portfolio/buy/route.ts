/**
 * app/api/portfolio/buy/route.ts
 *
 * POST /api/portfolio/buy
 *
 * Quick-buy helper — simplified version of POST /api/portfolio tailored
 * for the "Buy" modal on the Rankings and Ticker Detail pages.
 *
 * Differences from the full POST /api/portfolio endpoint:
 *   - No purchaseDate or notes fields (purchaseDate defaults to today).
 *   - shares must be a whole number ≥ 1 (modal uses an integer input).
 *
 * Request body: { ticker, companyName?, shares, purchasePrice }
 * Response on success: { ok: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { readPortfolio, writePortfolio } from '@/lib/portfolio';

const MAX_TICKER_LEN = 10;
const MAX_NAME_LEN = 200;

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

    if (ticker.length > MAX_TICKER_LEN) {
      return NextResponse.json({ error: 'ticker is too long.' }, { status: 400 });
    }

    if (companyName.length > MAX_NAME_LEN) {
      return NextResponse.json({ error: 'companyName is too long.' }, { status: 400 });
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
