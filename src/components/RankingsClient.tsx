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

import { useCallback, useMemo, useState } from 'react';
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
  /** M5.3: number of tickers in the active universe (from UNIVERSE_SIZE env var). */
  universeSize: number;
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

export default function RankingsClient({ initialData, lastUpdated, initialStatus, initialError, universeSize }: RankingsClientProps) {
  // M5.1: seeded from server — no fetch on mount
  const [tickers, setTickers] = useState<EnrichedTicker[]>(initialData);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(lastUpdated);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>(initialStatus);
  const [cacheError, setCacheError] = useState<string | undefined>(initialError);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('valueScore');

  const [buyModal, setBuyModal] = useState<BuyModalState>(null);
  const [buyShares, setBuyShares] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

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
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not load rankings.');
      setIsRefreshing(false);
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setFetchError(null);
    try {
      await triggerRefresh();
      await pollUntilReady();
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
  // Show the table whenever we have data, even while a refresh is in flight
  const showTable = tickers.length > 0;

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Rankings</h1>
          {/* M5.3: title reflects the active UNIVERSE_SIZE */}
          <p>Top {universeSize} by market cap — ranked by pre-calculated Value Score.</p>
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

        {lastUpdatedAt ? (
          <p className="status">Data as of {new Date(lastUpdatedAt).toLocaleString()}</p>
        ) : null}

        {isCacheLoading ? <p className="status">Loading\u2014pre-calculating scores for all 50 tickers\u2026</p> : null}
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
