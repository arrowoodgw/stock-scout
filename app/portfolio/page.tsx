'use client';

import { useEffect, useMemo, useState } from 'react';
import { PortfolioTrade } from '@/portfolio/types';
import { currencyFormatter } from '@/utils/formatters';

const LOCAL_STORAGE_KEY = 'stock-scout-portfolio-trades';

type UniverseQuotesResponse = {
  quotes: Record<string, { price: number }>;
};

async function fetchUniverseQuotes() {
  const response = await fetch('/api/market/universe-quotes', { cache: 'no-store' });
  const payload = (await response.json()) as UniverseQuotesResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? 'Could not load universe quotes.');
  }

  return payload;
}

export default function PortfolioPage() {
  const [trades, setTrades] = useState<PortfolioTrade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setError(null);

      try {
        const [tradeResponse, universe] = await Promise.all([
          fetch('/api/portfolio/trades', { cache: 'no-store' }),
          fetchUniverseQuotes()
        ]);

        const tradePayload = (await tradeResponse.json()) as { trades?: PortfolioTrade[]; error?: string };

        if (!isMounted) {
          return;
        }

        const localTradesRaw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        const localTrades = localTradesRaw ? ((JSON.parse(localTradesRaw) as PortfolioTrade[]) ?? []) : [];
        const fileTrades = tradeResponse.ok && Array.isArray(tradePayload.trades) ? tradePayload.trades : [];

        setTrades([...fileTrades, ...localTrades]);
        setQuotes(universe.quotes);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Could not load portfolio.';
        setError(message);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    return trades.reduce(
      (acc, trade) => {
        const currentPrice = quotes[trade.ticker]?.price ?? trade.priceAtBuy;
        acc.cost += trade.shares * trade.priceAtBuy;
        acc.currentValue += trade.shares * currentPrice;
        return acc;
      },
      { cost: 0, currentValue: 0 }
    );
  }, [quotes, trades]);

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Portfolio</h1>
          <p>Local trades with current value from cached universe quotes.</p>
        </header>

        {error ? <p className="status error">{error}</p> : null}

        <div className="backtestStats">
          <div>
            <p className="subtle">Cost basis</p>
            <p className="priceLine">{currencyFormatter.format(totals.cost)}</p>
          </div>
          <div>
            <p className="subtle">Current value</p>
            <p className="priceLine">{currencyFormatter.format(totals.currentValue)}</p>
          </div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Shares</th>
                <th>Buy Price</th>
                <th>Current Price</th>
                <th>Buy Date</th>
                <th>Value Score at Buy</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, index) => (
                <tr key={`${trade.ticker}-${trade.date}-${index}`}>
                  <td>{trade.ticker}</td>
                  <td>{trade.shares}</td>
                  <td>{currencyFormatter.format(trade.priceAtBuy)}</td>
                  <td>{currencyFormatter.format(quotes[trade.ticker]?.price ?? trade.priceAtBuy)}</td>
                  <td>{new Date(trade.date).toLocaleDateString()}</td>
                  <td>{trade.valueScoreAtBuy === null ? '—' : `${trade.valueScoreAtBuy}/100`}</td>
                </tr>
              ))}
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={6}>No trades yet. Use Buy on a ticker detail page.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
