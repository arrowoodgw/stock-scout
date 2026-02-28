'use client';

/**
 * src/components/RankingsClient.tsx
 *
 * M5.1 – Client-side shell for the Rankings page.
 *
 * Receives pre-computed data from the async Server Component (app/page.tsx) via
 * props and seeds local state with it — no fetch/SWR on mount.  The "Refresh
 * data" button still works by POSTing to /api/preload and polling /api/rankings
 * until the cache is ready again, then updating local state.
 *
 * All sorting and filtering operate on the in-memory array — zero network round-
 * trips for those interactions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CacheStatus, EnrichedTicker } from '@/types';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

type SortField = 'valueScore' | 'marketCap';

type BuyModalState = {
  ticker: string;
  price: number;
} | null;

type RankingsClientProps = {
  /** Pre-computed ticker data injected by the Server Component on first paint. */
  initialData: EnrichedTicker[];
  /** ISO timestamp when the cache was last fully populated. Null if unavailable. */
  lastUpdated: string | null;
  /** Cache status at render time — normally 'ready'; 'error' if preload failed. */
  initialStatus: CacheStatus;
  /** Error message when initialStatus === 'error'. */
  initialError?: string;
};

/** Poll interval while a user-triggered refresh is in progress (ms). */
const POLL_INTERVAL_MS = 3_000;

async function fetchRankings(): Promise<{ tickers: EnrichedTicker[]; lastUpdated: string | null; status: CacheStatus; error?: string }> {
  const response = await fetch('/api/rankings', { cache: 'no-store' });
  const payload = (await response.json()) as { tickers: EnrichedTicker[]; lastUpdated: string | null; status: CacheStatus; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Could not load rankings.');
  }
  return payload;
}

async function triggerRefresh(): Promise<void> {
  const response = await fetch('/api/preload?refresh=1', { method: 'POST', cache: 'no-store' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? 'Could not trigger refresh.');
  }
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

function getDataAgeLabel(lastUpdatedAt: string | null, nowMs: number): string {
  if (!lastUpdatedAt) return 'Data age: unavailable';
  const updatedMs = Date.parse(lastUpdatedAt);
  if (Number.isNaN(updatedMs)) return 'Data age: unavailable';

  const deltaMs = Math.max(0, nowMs - updatedMs);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'Data age: <1 min';
  if (minutes < 60) return `Data age: ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Data age: ${hours}h ${minutes % 60}m`;
}

export default function RankingsClient({ initialData, lastUpdated, initialStatus, initialError }: RankingsClientProps) {
  // M5.1: seeded from server — no fetch on mount
  const [tickers, setTickers] = useState<EnrichedTicker[]>(initialData);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(lastUpdated);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>(initialStatus);
  const [cacheError, setCacheError] = useState<string | undefined>(initialError);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('valueScore');

  const [buyModal, setBuyModal] = useState<BuyModalState>(null);
  const [buyShares, setBuyShares] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!refreshToast) return;
    const timeout = setTimeout(() => setRefreshToast(null), 3_000);
    return () => clearTimeout(timeout);
  }, [refreshToast]);

  // Polls /api/rankings until the cache is ready after a user-triggered refresh.
  const pollUntilReady = useCallback(async () => {
    try {
      const data = await fetchRankings();
      setTickers(data.tickers);
      setLastUpdatedAt(data.lastUpdated);
      setCacheStatus(data.status);
      setCacheError(data.error);
      setFetchError(null);
      if (data.status === 'loading' || data.status === 'cold') {
        setTimeout(() => void pollUntilReady(), POLL_INTERVAL_MS);
      } else {
        setIsRefreshing(false);
        setNowMs(Date.now());
        setRefreshToast('✅ Data refresh completed.');
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not load rankings.');
      setIsRefreshing(false);
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setFetchError(null);
    setRefreshToast(null);
    try {
      await triggerRefresh();
      await pollUntilReady();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not trigger refresh.');
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

  const filteredRows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = q
      ? tickers.filter((r) => r.ticker.includes(q) || (r.companyName ?? '').toUpperCase().includes(q))
      : tickers;
    return [...base].sort((a, b) => {
      if (sortBy === 'marketCap') return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      return b.valueScore - a.valueScore;
    });
  }, [query, tickers, sortBy]);

  const isCacheLoading = cacheStatus === 'loading' || cacheStatus === 'cold';
  const isCacheError = cacheStatus === 'error';
  const dataAgeLabel = getDataAgeLabel(lastUpdatedAt, nowMs);
  // Show the table whenever we have data, even while a refresh is in flight
  const showTable = tickers.length > 0;

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
          <div className="refreshGroup">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing || isCacheLoading}
            >
              {isRefreshing ? (
                <span className="btnInlineStatus">
                  <span className="spinner" aria-hidden="true" />
                  Refreshing data...
                </span>
              ) : 'Refresh Data Now'}
            </button>
            <span className="dataAgeBadge" aria-live="polite">{dataAgeLabel}</span>
          </div>
        </div>

        {refreshToast ? <p className="status success">{refreshToast}</p> : null}
        {lastUpdatedAt ? (
          <p className="status">Data as of {new Date(lastUpdatedAt).toLocaleString()}</p>
        ) : null}

        {isCacheLoading ? <p className="status">Loading—pre-calculating scores for all 50 tickers…</p> : null}
        {fetchError ? <p className="status error">{fetchError}</p> : null}
        {isCacheError ? <p className="status error">Cache error: {cacheError ?? 'Unknown error.'}</p> : null}

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
                    <td>{row.companyName ?? '—'}</td>
                    <td>{row.valueScore}/100</td>
                    <td>{row.marketCap === null ? '—' : formatLargeCurrency(row.marketCap)}</td>
                    <td>{row.peTtm === null ? '—' : numberFormatter.format(row.peTtm)}</td>
                    <td>{row.ps === null ? '—' : numberFormatter.format(row.ps)}</td>
                    <td>{row.revenueGrowthYoY === null ? '—' : `${row.revenueGrowthYoY.toFixed(1)}%`}</td>
                    <td>{row.operatingMargin === null ? '—' : `${row.operatingMargin.toFixed(1)}%`}</td>
                    <td>{row.latestPrice === null ? '—' : currencyFormatter.format(row.latestPrice)}</td>
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
              <span className="labelText">Number of shares</span>
              <input
                type="number"
                min={1}
                value={buyShares}
                onChange={(e) => setBuyShares(Math.max(1, Number(e.target.value)))}
                className="modalInput"
              />
            </label>
            <p className="modalTotal">
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
