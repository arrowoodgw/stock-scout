'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FundamentalsPanel } from '@/components/FundamentalsPanel';
import { HistoricalChart } from '@/components/HistoricalChart';
import { PriceCard } from '@/components/PriceCard';
import { getStockDataProvider } from '@/providers';
import { HistoricalPoint, PriceRange, StockQuote } from '@/providers/types';
import { EnrichedTicker } from '@/types';

const stockDataProvider = getStockDataProvider();
const ranges: PriceRange[] = ['1M', '6M', '1Y'];

/** Response shape from GET /api/ticker */
type TickerApiResponse =
  | { status: 'ready'; ticker: EnrichedTicker }
  | { status: 'loading'; ticker: string }
  | { error: string };

type TickerDetailViewProps = {
  initialTicker?: string;
};

async function fetchTickerData(ticker: string, forceRefresh = false): Promise<TickerApiResponse> {
  const params = new URLSearchParams({ ticker });
  if (forceRefresh) params.set('refresh', '1');
  const response = await fetch(`/api/ticker?${params.toString()}`, { cache: 'no-store' });
  return (await response.json()) as TickerApiResponse;
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

export function TickerDetailView({ initialTicker = 'AAPL' }: TickerDetailViewProps) {
  const router = useRouter();
  const normalizedInitial = initialTicker.toUpperCase();

  const [inputTicker, setInputTicker] = useState(normalizedInitial);
  const [activeTicker, setActiveTicker] = useState(normalizedInitial);
  const [selectedRange, setSelectedRange] = useState<PriceRange>('1M');

  const [enriched, setEnriched] = useState<EnrichedTicker | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(true);
  const [fundamentalsError, setFundamentalsError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  // Buy modal state
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyShares, setBuyShares] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  useEffect(() => {
    setInputTicker(normalizedInitial);
    setActiveTicker(normalizedInitial);
  }, [normalizedInitial]);

  // Load enriched fundamentals + scores from cache via /api/ticker
  useEffect(() => {
    let isMounted = true;
    const forceRefresh = refreshKey > 0;

    setFundamentalsLoading(true);
    setFundamentalsError(null);

    const load = async () => {
      try {
        const result = await fetchTickerData(activeTicker, forceRefresh);

        if (!isMounted) return;

        if ('error' in result) {
          setFundamentalsError(result.error);
          setEnriched(null);
          return;
        }

        if (result.status === 'loading') {
          // Cache is warming — retry after a short delay
          setTimeout(() => { if (isMounted) void load(); }, 3_000);
          return;
        }

        setEnriched(result.ticker);
      } catch (err) {
        if (!isMounted) return;
        setFundamentalsError(err instanceof Error ? err.message : 'Could not load fundamentals.');
        setEnriched(null);
      } finally {
        if (isMounted) setFundamentalsLoading(false);
      }
    };

    void load();
    return () => { isMounted = false; };
  }, [activeTicker, refreshKey]);

  // Load historical price chart
  useEffect(() => {
    let isMounted = true;
    const forceRefresh = refreshKey > 0;

    setPriceLoading(true);
    setPriceError(null);

    const load = async () => {
      try {
        const nextHistory = await stockDataProvider.getHistoricalPrices(activeTicker, selectedRange, { forceRefresh });
        if (!isMounted) return;
        setHistory(nextHistory);
        const latest = nextHistory[nextHistory.length - 1];
        if (latest) {
          setQuote({ ticker: activeTicker, price: latest.price, updatedAt: latest.date });
        }
      } catch (err) {
        if (!isMounted) return;
        setPriceError(err instanceof Error ? err.message : 'Could not load stock data.');
        setQuote(null);
        setHistory([]);
      } finally {
        if (isMounted) setPriceLoading(false);
      }
    };

    void load();
    return () => { isMounted = false; };
  }, [activeTicker, selectedRange, refreshKey]);

  useEffect(() => {
    if (!priceLoading && !fundamentalsLoading && !priceError && !fundamentalsError) {
      setLastUpdatedAt(new Date().toISOString());
    }
  }, [priceLoading, fundamentalsLoading, priceError, fundamentalsError]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = inputTicker.trim().toUpperCase();
    if (!next) return;
    setBuyModalOpen(false);
    setBuySuccess(null);
    setActiveTicker(next);
    router.push(`/ticker?ticker=${encodeURIComponent(next)}`);
  };

  const handleOpenBuy = () => {
    setBuyShares(1);
    setBuySuccess(null);
    setBuyModalOpen(true);
  };

  const handleCloseBuy = () => {
    setBuyModalOpen(false);
    setBuySuccess(null);
  };

  const handleConfirmBuy = async () => {
    if (!quote) return;
    setIsBuying(true);
    try {
      await postBuy(quote.ticker, buyShares, quote.price);
      setBuySuccess(
        `Purchased ${buyShares} share${buyShares !== 1 ? 's' : ''} of ${quote.ticker} at $${quote.price.toFixed(2)}.`
      );
    } catch (err) {
      setBuySuccess(`Error: ${err instanceof Error ? err.message : 'Could not save purchase.'}`);
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <section className="card">
      <header className="header">
        <h1>Ticker Detail</h1>
        <p>Track stock performance and fundamentals for quick value checks.</p>
      </header>

      <form className="searchForm" onSubmit={handleSubmit}>
        <label htmlFor="ticker" className="srOnly">Stock ticker</label>
        <input
          id="ticker"
          name="ticker"
          value={inputTicker}
          onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
          autoComplete="off"
        />
        <button type="submit">Load</button>
        <button type="button" className="refreshButton" onClick={() => setRefreshKey((v) => v + 1)}>
          Refresh data
        </button>
      </form>

      {lastUpdatedAt ? (
        <p className="status">Last refreshed: {new Date(lastUpdatedAt).toLocaleString()}</p>
      ) : null}

      <div className="rangeButtons" role="group" aria-label="Historical range">
        {ranges.map((range) => (
          <button
            key={range}
            type="button"
            className={range === selectedRange ? 'selected' : ''}
            onClick={() => setSelectedRange(range)}
          >
            {range}
          </button>
        ))}
      </div>

      {priceLoading ? <p className="status">Loading stock data...</p> : null}
      {!priceLoading && priceError ? <p className="status error">{priceError}</p> : null}

      {!priceLoading && !priceError && quote ? (
        <>
          <PriceCard quote={quote} />
          <div className="actionRow">
            <button type="button" onClick={handleOpenBuy}>Buy</button>
          </div>
          <HistoricalChart data={history} ticker={quote.ticker} range={selectedRange} />
        </>
      ) : null}

      {fundamentalsLoading ? <p className="status">Loading fundamentals...</p> : null}
      {!fundamentalsLoading && fundamentalsError ? (
        <p className="status error">{fundamentalsError}</p>
      ) : null}
      {!fundamentalsLoading && !fundamentalsError && enriched ? (
        <FundamentalsPanel enriched={enriched} />
      ) : null}

      {buyModalOpen && quote ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={`Buy ${quote.ticker}`}>
          <div className="modal">
            <h2>Buy {quote.ticker}</h2>
            <p>Current price: <strong>${quote.price.toFixed(2)}</strong></p>
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
              Total: <strong>${(buyShares * quote.price).toFixed(2)}</strong>
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
    </section>
  );
}
