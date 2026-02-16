'use client';

import { FormEvent, useEffect, useState } from 'react';
import { HistoricalChart } from '@/components/HistoricalChart';
import { PriceCard } from '@/components/PriceCard';
import { getStockDataProvider } from '@/providers';
import { HistoricalPoint, PriceRange, StockQuote } from '@/providers/types';

const provider = getStockDataProvider();
const ranges: PriceRange[] = ['1M', '6M', '1Y'];

export default function HomePage() {
  const [inputTicker, setInputTicker] = useState('AAPL');
  const [activeTicker, setActiveTicker] = useState('AAPL');
  const [selectedRange, setSelectedRange] = useState<PriceRange>('1M');
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [nextQuote, nextHistory] = await Promise.all([
          provider.getLatestQuote(activeTicker),
          provider.getHistoricalPrices(activeTicker, selectedRange)
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
        setError(message);
        setQuote(null);
        setHistory([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [activeTicker, selectedRange]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTicker = inputTicker.trim().toUpperCase();
    if (!nextTicker) {
      return;
    }

    setActiveTicker(nextTicker);
  };

  return (
    <main className="page">
      <section className="card">
        <header className="header">
          <h1>Stock Scout</h1>
          <p>Track the latest stock price and historical trend.</p>
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
        </form>

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

        {isLoading ? <p className="status">Loading stock data...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error && quote ? (
          <>
            <PriceCard quote={quote} />
            <HistoricalChart data={history} ticker={quote.ticker} range={selectedRange} />
          </>
        ) : null}
      </section>
    </main>
  );
}
