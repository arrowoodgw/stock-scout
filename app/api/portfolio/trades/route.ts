import { NextRequest, NextResponse } from 'next/server';
import { readPortfolioTrades, writePortfolioTrades } from '@/portfolio/storage';
import { PortfolioTrade } from '@/portfolio/types';

function normalizeTrade(input: PortfolioTrade): PortfolioTrade {
  return {
    ticker: input.ticker.trim().toUpperCase(),
    shares: Number(input.shares),
    priceAtBuy: Number(input.priceAtBuy),
    date: input.date,
    valueScoreAtBuy: input.valueScoreAtBuy === null ? null : Number(input.valueScoreAtBuy)
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
    const body = (await request.json()) as { trade?: PortfolioTrade };
    if (!body.trade) {
      return NextResponse.json({ error: 'Missing trade payload.' }, { status: 400 });
    }

    const trade = normalizeTrade(body.trade);

    if (!trade.ticker || !Number.isFinite(trade.shares) || trade.shares <= 0 || !Number.isFinite(trade.priceAtBuy)) {
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
