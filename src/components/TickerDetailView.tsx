'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FundamentalsPanel } from '@/components/FundamentalsPanel';
import { HistoricalChart } from '@/components/HistoricalChart';
import { PriceCard } from '@/components/PriceCard';
import { getFundamentalsDataProvider, getStockDataProvider } from '@/providers';
import { HistoricalPoint, PriceRange, StockFundamentals, StockQuote } from '@/providers/types';

const stockDataProvider = getStockDataProvider();
const fundamentalsProvider = getFundamentalsDataProvider();
const ranges: PriceRange[] = ['1M', '6M', '1Y'];

type TickerDetailViewProps = {
  initialTicker?: string;
};

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
        const [nextQuote, nextHistory] = await Promise.all([
          stockDataProvider.getLatestQuote(activeTicker, { forceRefresh }),
          stockDataProvider.getHistoricalPrices(activeTicker, selectedRange, { forceRefresh })
        ]);

        if (!isMounted) {
          return;
        }

        setQuote(nextQuote);
        setHistory(nextHistory);
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

    setActiveTicker(nextTicker);
    router.push(`/ticker?ticker=${encodeURIComponent(nextTicker)}`);
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
          <HistoricalChart data={history} ticker={quote.ticker} range={selectedRange} />
        </>
      ) : null}

      {isFundamentalsLoading ? <p className="status">Loading fundamentals...</p> : null}
      {!isFundamentalsLoading && fundamentalsError ? <p className="status error">{fundamentalsError}</p> : null}
      {!isFundamentalsLoading && !fundamentalsError && fundamentals ? (
        <FundamentalsPanel fundamentals={fundamentals} />
      ) : null}
    </section>
  );
}
