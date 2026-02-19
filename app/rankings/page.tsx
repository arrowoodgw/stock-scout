'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataCachePayload, EnrichedTicker } from '@/types';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

type SortField = 'valueScore' | 'marketCap';

type BuyModalState = {
  ticker: string;
  price: number;
} | null;

/** Poll interval while cache is still warming up (ms). */
const POLL_INTERVAL_MS = 3_000;

async function fetchRankings(): Promise<DataCachePayload> {
  const response = await fetch('/api/rankings', { cache: 'no-store' });
  const payload = (await response.json()) as DataCachePayload & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Could not load rankings.');
  }
  return payload;
}

async function triggerRefresh(): Promise<void> {
  await fetch('/api/preload?refresh=1', { method: 'POST', cache: 'no-store' });
}

async function postBuy(ticker: string, shares: number, purchasePrice: number): Promise<void> {
  const response = await fetch('/api/portfolio/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, shares, purchasePrice })
  });
  if (!response.ok) {
    const p = (await response.json()) as { error?: string };
    throw new Error(p.error ?? 'Could not save purchase.');
  }
}

export default function RankingsPage() {
  const [payload, setPayload] = useState<DataCachePayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('valueScore');

  const [buyModal, setBuyModal] = useState<BuyModalState>(null);
  const [buyShares, setBuyShares] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  const loadRankings = useCallback(async () => {
    try {
      const data = await fetchRankings();
      setPayload(data);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not load rankings.');
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadRankings();
  }, [loadRankings]);

  // Poll while the cache is still warming up
  useEffect(() => {
    if (!payload || payload.status === 'ready' || payload.status === 'error') return;
    const timer = setInterval(() => { void loadRankings(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [payload, loadRankings]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await triggerRefresh();
      const poll = async () => {
        const data = await fetchRankings();
        setPayload(data);
        if (data.status === 'loading' || data.status === 'cold') {
          setTimeout(() => void poll(), POLL_INTERVAL_MS);
        } else {
          setIsRefreshing(false);
        }
      };
      await poll();
    } catch {
      setIsRefreshing(false);
    }
  };

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
      setBuySuccess(
        `Purchased ${buyShares} share${buyShares !== 1 ? 's' : ''} of ${buyModal.ticker} at ${currencyFormatter.format(buyModal.price)}.`
      );
    } catch (err) {
      setBuySuccess(`Error: ${err instanceof Error ? err.message : 'Could not save purchase.'}`);
    } finally {
      setIsBuying(false);
    }
  };

  const rows: EnrichedTicker[] = payload?.tickers ?? [];

  const filteredRows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = q
      ? rows.filter((r) => r.ticker.includes(q) || (r.companyName ?? '').toUpperCase().includes(q))
      : rows;
    return [...base].sort((a, b) => {
      if (sortBy === 'marketCap') return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      return b.valueScore - a.valueScore;
    });
  }, [query, rows, sortBy]);

  const isConnecting = !payload && !fetchError;
  const isCacheLoading = payload?.status === 'loading' || payload?.status === 'cold';
  const isCacheError = payload?.status === 'error';
  const showTable = payload?.status === 'ready' && rows.length > 0;

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Rankings</h1>
          <p>Top 50 market-cap universe ranked by pre-calculated Value Score.</p>
        </header>

        <div className="toolbar">
          <label>
            Filter
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL or Apple"
            />
          </label>
          <label>
            Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortField)}>
              <option value="valueScore">Value Score (desc)</option>
              <option value="marketCap">Market Cap (desc)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || isCacheLoading}
          >
            {isRefreshing ? 'Refreshing\u2026' : 'Refresh data'}
          </button>
        </div>

        {payload?.lastUpdated ? (
          <p className="status">Data as of {new Date(payload.lastUpdated).toLocaleString()}</p>
        ) : null}

        {isConnecting ? <p className="status">Connecting to data cache\u2026</p> : null}
        {isCacheLoading ? <p className="status">Loading\u2014pre-calculating scores for all 50 tickers\u2026</p> : null}
        {fetchError ? <p className="status error">{fetchError}</p> : null}
        {isCacheError ? <p className="status error">Cache error: {payload?.error ?? 'Unknown error.'}</p> : null}

        {showTable ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Company</th>
                  <th>Value Score</th>
                  <th>Market Cap</th>
                  <th>P/E</th>
                  <th>P/S</th>
                  <th>Revenue YoY</th>
                  <th>Op. Margin</th>
                  <th>Latest Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.ticker}>
                    <td><strong>{row.ticker}</strong></td>
                    <td>{row.companyName ?? '\u2014'}</td>
                    <td>{row.valueScore}/100</td>
                    <td>{row.marketCap === null ? '\u2014' : formatLargeCurrency(row.marketCap)}</td>
                    <td>{row.peTtm === null ? '\u2014' : numberFormatter.format(row.peTtm)}</td>
                    <td>{row.ps === null ? '\u2014' : numberFormatter.format(row.ps)}</td>
                    <td>{row.revenueGrowthYoY === null ? '\u2014' : `${row.revenueGrowthYoY.toFixed(1)}%`}</td>
                    <td>{row.operatingMargin === null ? '\u2014' : `${row.operatingMargin.toFixed(1)}%`}</td>
                    <td>{row.latestPrice === null ? '\u2014' : currencyFormatter.format(row.latestPrice)}</td>
                    <td>
                      {row.latestPrice !== null ? (
                        <button
                          type="button"
                          className="buyBtn"
                          onClick={() => handleOpenBuy(row.ticker, row.latestPrice as number)}
                        >
                          Buy
                        </button>
                      ) : null}
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
            {buySuccess ? <p className="modalSuccess">{buySuccess}</p> : null}
            <div className="modalActions">
              {!buySuccess ? (
                <>
                  <button type="button" className="confirmBtn" onClick={() => void handleConfirmBuy()} disabled={isBuying}>
                    {isBuying ? 'Saving...' : 'Confirm Purchase'}
                  </button>
                  <button type="button" className="cancelBtn" onClick={handleCloseBuy}>Cancel</button>
                </>
              ) : (
                <button type="button" className="cancelBtn" style={{ flex: 1 }} onClick={handleCloseBuy}>Close</button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
