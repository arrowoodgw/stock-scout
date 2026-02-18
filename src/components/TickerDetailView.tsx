'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FundamentalsPanel } from '@/components/FundamentalsPanel';
import { HistoricalChart } from '@/components/HistoricalChart';
import { PriceCard } from '@/components/PriceCard';
import { getFundamentalsDataProvider, getStockDataProvider } from '@/providers';
import { HistoricalPoint, PriceRange, StockFundamentals, StockQuote } from '@/providers/types';
import { calculateValueScore, ValueScoreResult } from '@/scoring/calculateValueScore';

const stockDataProvider = getStockDataProvider();
const fundamentalsProvider = getFundamentalsDataProvider();
const ranges: PriceRange[] = ['1M', '6M', '1Y'];

type TickerDetailViewProps = {
  initialTicker?: string;
};

function quoteFromHistory(ticker: string, points: HistoricalPoint[]): StockQuote {
  const latest = points[points.length - 1];

  if (!latest) {
    throw new Error('No historical points available for ticker.');
  }

  return {
    ticker,
    price: latest.price,
    updatedAt: latest.date
  };
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
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [fundamentals, setFundamentals] = useState<StockFundamentals | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(true);
  const [isFundamentalsLoading, setIsFundamentalsLoading] = useState(true);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [fundamentalsError, setFundamentalsError] = useState<string | null>(null);
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

  useEffect(() => {
    let isMounted = true;

    const loadPriceData = async () => {
      setIsPriceLoading(true);
      setPriceError(null);

      try {
        const forceRefresh = refreshKey > 0;
        const nextHistory = await stockDataProvider.getHistoricalPrices(activeTicker, selectedRange, { forceRefresh });

        if (!isMounted) {
          return;
        }

        setHistory(nextHistory);
        setQuote(quoteFromHistory(activeTicker, nextHistory));
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Could not load stock data.';
        setPriceError(message);
        setQuote(null);
        setHistory([]);
      } finally {
        if (isMounted) {
          setIsPriceLoading(false);
        }
      }
    };

    void loadPriceData();

    return () => {
      isMounted = false;
    };
  }, [activeTicker, selectedRange, refreshKey]);

  useEffect(() => {
    let isMounted = true;

    const loadFundamentals = async () => {
      setIsFundamentalsLoading(true);
      setFundamentalsError(null);

      try {
        const forceRefresh = refreshKey > 0;
        const nextFundamentals = await fundamentalsProvider.getFundamentals(activeTicker, { forceRefresh });

        if (!isMounted) {
          return;
        }

        setFundamentals(nextFundamentals);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Could not load fundamentals.';
        setFundamentalsError(message);
        setFundamentals(null);
      } finally {
        if (isMounted) {
          setIsFundamentalsLoading(false);
        }
      }
    };

    void loadFundamentals();

    return () => {
      isMounted = false;
    };
  }, [activeTicker, refreshKey]);

  useEffect(() => {
    if (!isPriceLoading && !isFundamentalsLoading && !priceError && !fundamentalsError) {
      setLastUpdatedAt(new Date().toISOString());
    }
  }, [isPriceLoading, isFundamentalsLoading, priceError, fundamentalsError]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTicker = inputTicker.trim().toUpperCase();
    if (!nextTicker) {
      return;
    }

    setBuyModalOpen(false);
    setBuySuccess(null);
    setActiveTicker(nextTicker);
    router.push(`/ticker?ticker=${encodeURIComponent(nextTicker)}`);
  };

  const valueScore = useMemo((): ValueScoreResult | null => {
    if (!fundamentals) {
      return null;
    }

    return calculateValueScore(fundamentals);
  }, [fundamentals]);

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
        <label htmlFor="ticker" className="srOnly">
          Stock ticker
        </label>
        <input
          id="ticker"
          name="ticker"
          value={inputTicker}
          onChange={(event) => setInputTicker(event.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
          autoComplete="off"
        />
        <button type="submit">Load</button>
        <button type="button" className="refreshButton" onClick={() => setRefreshKey((value) => value + 1)}>
          Refresh data
        </button>
      </form>

      {lastUpdatedAt ? <p className="status">Last refreshed: {new Date(lastUpdatedAt).toLocaleString()}</p> : null}

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

      {isPriceLoading ? <p className="status">Loading stock data...</p> : null}
      {!isPriceLoading && priceError ? <p className="status error">{priceError}</p> : null}

      {!isPriceLoading && !priceError && quote ? (
        <>
          <PriceCard quote={quote} />
          <div className="actionRow">
            <button type="button" onClick={handleOpenBuy}>
              Buy
            </button>
          </div>
          <HistoricalChart data={history} ticker={quote.ticker} range={selectedRange} />
        </>
      ) : null}

      {isFundamentalsLoading ? <p className="status">Loading fundamentals...</p> : null}
      {!isFundamentalsLoading && fundamentalsError ? <p className="status error">{fundamentalsError}</p> : null}
      {!isFundamentalsLoading && !fundamentalsError && fundamentals ? (
        <FundamentalsPanel fundamentals={fundamentals} scoreBreakdown={valueScore?.breakdown ?? null} />
      ) : null}

      {buyModalOpen && quote ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={`Buy ${quote.ticker}`}>
          <div className="modal">
            <h2>Buy {quote.ticker}</h2>
            <p>Current price: <strong>${quote.price.toFixed(2)}</strong></p>

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
              Total: <strong>${(buyShares * quote.price).toFixed(2)}</strong>
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
    </section>
  );
}
