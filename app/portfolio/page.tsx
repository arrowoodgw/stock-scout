'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { currencyFormatter } from '@/utils/formatters';
import { PortfolioHolding } from '@/lib/portfolio';

type PriceState = {
  price: number | null;
  error: string | null;
};

async function fetchPortfolio(): Promise<{ holdings: PortfolioHolding[] }> {
  const response = await fetch('/api/portfolio', { cache: 'no-store' });
  const payload = (await response.json()) as { holdings?: PortfolioHolding[]; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? 'Could not load portfolio.');
  }

  return { holdings: Array.isArray(payload.holdings) ? payload.holdings : [] };
}

async function fetchPrice(ticker: string): Promise<number> {
  const response = await fetch(`/api/market/quote?ticker=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
  const payload = (await response.json()) as { price?: number; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Could not fetch price for ${ticker}.`);
  }

  if (payload.price == null || !Number.isFinite(payload.price)) {
    throw new Error(`Invalid price returned for ${ticker}.`);
  }

  return payload.price;
}

function gainColor(gain: number): string {
  if (gain > 0) return '#15803d';
  if (gain < 0) return '#b42318';
  return 'inherit';
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrices = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    setIsPriceLoading(true);

    const results = await Promise.allSettled(tickers.map((ticker) => fetchPrice(ticker)));

    const next: Record<string, PriceState> = {};
    tickers.forEach((ticker, i) => {
      const result = results[i];
      if (result.status === 'fulfilled') {
        next[ticker] = { price: result.value, error: null };
      } else {
        const message = result.reason instanceof Error ? result.reason.message : `Could not load price for ${ticker}.`;
        next[ticker] = { price: null, error: message };
      }
    });

    setPrices(next);
    setIsPriceLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const portfolio = await fetchPortfolio();

        if (!isMounted) return;

        setHoldings(portfolio.holdings);

        // Unique tickers only
        const uniqueTickers = [...new Set(portfolio.holdings.map((h) => h.ticker))];
        void loadPrices(uniqueTickers);
      } catch (loadError) {
        if (!isMounted) return;
        const message = loadError instanceof Error ? loadError.message : 'Could not load portfolio.';
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [loadPrices]);

  const handleRefresh = () => {
    const uniqueTickers = [...new Set(holdings.map((h) => h.ticker))];
    void loadPrices(uniqueTickers);
  };

  const rows = useMemo(() => {
    return holdings.map((holding) => {
      const costBasis = holding.shares * holding.purchasePrice;
      const priceState = prices[holding.ticker];
      const currentPrice = priceState?.price ?? null;
      const currentValue = currentPrice !== null ? holding.shares * currentPrice : null;
      const gainDollar = currentValue !== null ? currentValue - costBasis : null;
      const gainPercent = gainDollar !== null ? (gainDollar / costBasis) * 100 : null;

      return { holding, costBasis, currentPrice, currentValue, gainDollar, gainPercent, priceError: priceState?.error ?? null };
    });
  }, [holdings, prices]);

  const totals = useMemo(() => {
    const totalCost = rows.reduce((sum, r) => sum + r.costBasis, 0);
    const totalValue = rows.reduce((sum, r) => sum + (r.currentValue ?? r.costBasis), 0);
    const totalGain = totalValue - totalCost;
    const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    return { totalCost, totalValue, totalGain, totalGainPercent };
  }, [rows]);

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Portfolio</h1>
          <p>Holdings with live price data and gain/loss tracking.</p>
        </header>

        {isLoading ? <p className="status">Loading portfolio...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="refreshButton"
                style={{ border: 'none', borderRadius: '10px', cursor: 'pointer', padding: '0.55rem 1rem', fontWeight: 600 }}
                onClick={handleRefresh}
                disabled={isPriceLoading}
              >
                {isPriceLoading ? 'Refreshing...' : 'Refresh Prices'}
              </button>
            </div>

            <div className="backtestStats" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <div>
                <p className="subtle">Total Cost Basis</p>
                <p className="priceLine">{currencyFormatter.format(totals.totalCost)}</p>
              </div>
              <div>
                <p className="subtle">Total Current Value</p>
                <p className="priceLine">{currencyFormatter.format(totals.totalValue)}</p>
              </div>
              <div>
                <p className="subtle">Total Gain/Loss</p>
                <p className="priceLine" style={{ color: gainColor(totals.totalGain) }}>
                  {totals.totalGain >= 0 ? '+' : ''}{currencyFormatter.format(totals.totalGain)}
                </p>
              </div>
              <div>
                <p className="subtle">Total Gain/Loss %</p>
                <p className="priceLine" style={{ color: gainColor(totals.totalGainPercent) }}>
                  {totals.totalGainPercent >= 0 ? '+' : ''}{totals.totalGainPercent.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="tableWrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Shares</th>
                    <th>Purchase Price</th>
                    <th>Cost Basis</th>
                    <th>Current Price</th>
                    <th>Current Value</th>
                    <th>Gain/Loss $</th>
                    <th>Gain/Loss %</th>
                    <th>Purchase Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.holding.ticker}-${row.holding.purchaseDate}-${index}`}>
                      <td>{row.holding.ticker}</td>
                      <td>{row.holding.shares}</td>
                      <td>{currencyFormatter.format(row.holding.purchasePrice)}</td>
                      <td>{currencyFormatter.format(row.costBasis)}</td>
                      <td>
                        {row.priceError ? (
                          <span title={row.priceError} style={{ color: '#b42318' }}>— (error)</span>
                        ) : row.currentPrice !== null ? (
                          currencyFormatter.format(row.currentPrice)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{row.currentValue !== null ? currencyFormatter.format(row.currentValue) : '—'}</td>
                      <td style={{ color: row.gainDollar !== null ? gainColor(row.gainDollar) : 'inherit', fontWeight: 600 }}>
                        {row.gainDollar !== null
                          ? `${row.gainDollar >= 0 ? '+' : ''}${currencyFormatter.format(row.gainDollar)}`
                          : '—'}
                      </td>
                      <td style={{ color: row.gainPercent !== null ? gainColor(row.gainPercent) : 'inherit', fontWeight: 600 }}>
                        {row.gainPercent !== null
                          ? `${row.gainPercent >= 0 ? '+' : ''}${row.gainPercent.toFixed(2)}%`
                          : '—'}
                      </td>
                      <td>{row.holding.purchaseDate}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9}>No holdings yet. Use the Buy button on the Home or Rankings page.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
