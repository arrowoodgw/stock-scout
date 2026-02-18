'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFundamentalsDataProvider } from '@/providers';
import { StockFundamentals } from '@/providers/types';
import { calculateValueScore } from '@/scoring/calculateValueScore';
import { top50MarketCap } from '@/universe/top50MarketCap';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

const fundamentalsProvider = getFundamentalsDataProvider();

type UniverseQuote = {
  price: number;
  asOf: string;
  source: string;
};

type UniverseQuotesResponse = {
  quotes: Record<string, UniverseQuote>;
};

type Row = {
  ticker: string;
  valueScore: number;
  marketCap: number | null;
  peTtm: number | null;
  ps: number | null;
  revenueGrowthYoY: number | null;
  operatingMargin: number | null;
  latestPrice: number;
};

type SortField = 'valueScore' | 'marketCap';

type BuyModalState = {
  ticker: string;
  price: number;
} | null;

async function fetchUniverseQuotes() {
  const response = await fetch('/api/market/universe-quotes', { cache: 'no-store' });
  const payload = (await response.json()) as UniverseQuotesResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? 'Could not load universe quotes.');
  }

  return payload;
}

async function postBuy(ticker: string, shares: number, purchasePrice: number): Promise<void> {
  const response = await fetch('/api/portfolio/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, shares, purchasePrice })
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? 'Could not save purchase.');
  }
}

export default function RankingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('valueScore');

  const [buyModal, setBuyModal] = useState<BuyModalState>(null);
  const [buyShares, setBuyShares] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRows = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [fundamentalsList, universeQuotes] = await Promise.all([
          Promise.all(top50MarketCap.tickers.map((ticker) => fundamentalsProvider.getFundamentals(ticker))),
          fetchUniverseQuotes()
        ]);

        if (!isMounted) {
          return;
        }

        const tableRows = fundamentalsList.map((fundamentals: StockFundamentals) => ({
          ticker: fundamentals.ticker,
          valueScore: calculateValueScore(fundamentals).total,
          marketCap: fundamentals.marketCap,
          peTtm: fundamentals.peTtm,
          ps: fundamentals.ps,
          revenueGrowthYoY: fundamentals.revenueGrowthYoY,
          operatingMargin: fundamentals.operatingMargin,
          latestPrice: universeQuotes.quotes[fundamentals.ticker]?.price ?? 0
        }));

        setRows(tableRows);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Could not load rankings.';
        setError(message);
        setRows([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadRows();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenBuy = (ticker: string, price: number) => {
    setBuyModal({ ticker, price });
    setBuyShares(1);
    setBuySuccess(null);
  };

  const handleCloseBuy = () => {
    setBuyModal(null);
    setBuySuccess(null);
  };

  const handleConfirmBuy = async () => {
    if (!buyModal) return;
    setIsBuying(true);
    try {
      await postBuy(buyModal.ticker, buyShares, buyModal.price);
      setBuySuccess(`Purchased ${buyShares} share${buyShares !== 1 ? 's' : ''} of ${buyModal.ticker} at ${currencyFormatter.format(buyModal.price)}.`);
    } catch (err) {
      setBuySuccess(`Error: ${err instanceof Error ? err.message : 'Could not save purchase.'}`);
    } finally {
      setIsBuying(false);
    }
  };

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    const base = normalizedQuery ? rows.filter((row) => row.ticker.includes(normalizedQuery)) : rows;

    return [...base].sort((a, b) => {
      if (sortBy === 'marketCap') {
        return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      }

      return b.valueScore - a.valueScore;
    });
  }, [query, rows, sortBy]);

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Rankings</h1>
          <p>Top 50 market-cap universe ranking by deterministic Value Score.</p>
        </header>

        <div className="toolbar">
          <label>
            Filter ticker
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
            />
          </label>
          <label>
            Sort by
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortField)}>
              <option value="valueScore">Value Score (desc)</option>
              <option value="marketCap">Market Cap (desc)</option>
            </select>
          </label>
        </div>

        {isLoading ? <p className="status">Loading rankings...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Value Score</th>
                  <th>Market Cap</th>
                  <th>P/E</th>
                  <th>P/S</th>
                  <th>Revenue YoY Growth</th>
                  <th>Operating Margin</th>
                  <th>Latest Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.ticker}>
                    <td>{row.ticker}</td>
                    <td>{row.valueScore}/100</td>
                    <td>{row.marketCap === null ? '—' : formatLargeCurrency(row.marketCap)}</td>
                    <td>{row.peTtm === null ? '—' : numberFormatter.format(row.peTtm)}</td>
                    <td>{row.ps === null ? '—' : numberFormatter.format(row.ps)}</td>
                    <td>{row.revenueGrowthYoY === null ? '—' : `${row.revenueGrowthYoY.toFixed(1)}%`}</td>
                    <td>{row.operatingMargin === null ? '—' : `${row.operatingMargin.toFixed(1)}%`}</td>
                    <td>{currencyFormatter.format(row.latestPrice)}</td>
                    <td>
                      <button
                        type="button"
                        className="buyBtn"
                        onClick={() => handleOpenBuy(row.ticker, row.latestPrice)}
                      >
                        Buy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {buyModal ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={`Buy ${buyModal.ticker}`}>
          <div className="modal">
            <h2>Buy {buyModal.ticker}</h2>
            <p>Current price: <strong>{currencyFormatter.format(buyModal.price)}</strong></p>

            <label style={{ display: 'block', marginTop: '1rem' }}>
              <span style={{ color: '#5f6a80', fontSize: '0.9rem' }}>Number of shares</span>
              <input
                type="number"
                min={1}
                value={buyShares}
                onChange={(e) => setBuyShares(Math.max(1, Number(e.target.value)))}
                style={{ display: 'block', width: '100%', marginTop: '0.35rem', padding: '0.6rem 0.75rem', border: '1px solid #d4daea', borderRadius: '10px', fontSize: '1rem' }}
              />
            </label>

            <p style={{ marginTop: '0.75rem', color: '#43506a' }}>
              Total: <strong>{currencyFormatter.format(buyShares * buyModal.price)}</strong>
            </p>

            {buySuccess ? (
              <p className="modalSuccess">{buySuccess}</p>
            ) : null}

            <div className="modalActions">
              {!buySuccess ? (
                <>
                  <button
                    type="button"
                    className="confirmBtn"
                    onClick={() => void handleConfirmBuy()}
                    disabled={isBuying}
                  >
                    {isBuying ? 'Saving...' : 'Confirm Purchase'}
                  </button>
                  <button type="button" className="cancelBtn" onClick={handleCloseBuy}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="cancelBtn" style={{ flex: 1 }} onClick={handleCloseBuy}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
