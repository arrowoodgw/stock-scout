import { NextRequest, NextResponse } from 'next/server';
import { readPortfolioTrades, writePortfolioTrades } from '@/portfolio/storage';
import { PortfolioTrade } from '@/portfolio/types';

const MAX_TICKER_LEN = 10;

function normalizeTrade(input: unknown): PortfolioTrade {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid trade payload.');
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.ticker !== 'string' || !raw.ticker.trim()) {
    throw new Error('Invalid trade: ticker must be a non-empty string.');
  }

  const ticker = raw.ticker.trim().toUpperCase();
  if (ticker.length > MAX_TICKER_LEN) {
    throw new Error('Invalid trade: ticker is too long.');
  }

  return {
    ticker,
    shares: Number(raw.shares),
    priceAtBuy: Number(raw.priceAtBuy),
    date: typeof raw.date === 'string' ? raw.date : new Date().toISOString().split('T')[0],
    valueScoreAtBuy: raw.valueScoreAtBuy === null || raw.valueScoreAtBuy === undefined
      ? null
      : Number(raw.valueScoreAtBuy)
  };
}

export async function GET() {
  try {
    const trades = await readPortfolioTrades();
    return NextResponse.json({ trades, storage: 'filesystem' });
  } catch {
    return NextResponse.json({ error: 'Filesystem portfolio storage unavailable.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { trade?: unknown };
    if (!body.trade) {
      return NextResponse.json({ error: 'Missing trade payload.' }, { status: 400 });
    }

    let trade: PortfolioTrade;
    try {
      trade = normalizeTrade(body.trade);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid trade payload.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!Number.isFinite(trade.shares) || trade.shares <= 0 || !Number.isFinite(trade.priceAtBuy)) {
      return NextResponse.json({ error: 'Invalid trade payload.' }, { status: 400 });
    }

    const trades = await readPortfolioTrades();
    trades.push(trade);
    await writePortfolioTrades(trades);

    return NextResponse.json({ ok: true, storage: 'filesystem' });
  } catch {
    return NextResponse.json({ error: 'Filesystem portfolio storage unavailable.' }, { status: 503 });
  }
}
