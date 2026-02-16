'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFundamentalsDataProvider } from '@/providers';
import { StockFundamentals } from '@/providers/types';
import { calculateValueScore } from '@/scoring/calculateValueScore';
import { defaultUniverse } from '@/universe/defaultUniverse';

const fundamentalsProvider = getFundamentalsDataProvider();

type Pick = {
  ticker: string;
  valueScore: number;
};

export default function HomePage() {
  const router = useRouter();
  const [inputTicker, setInputTicker] = useState('AAPL');
  const [topPicks, setTopPicks] = useState<Pick[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadTopPicks = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const fundamentals = await Promise.all(
          defaultUniverse.map((ticker) => fundamentalsProvider.getFundamentals(ticker))
        );

        if (!isMounted) {
          return;
        }

        const ranked = fundamentals
          .map((item: StockFundamentals) => ({ ticker: item.ticker, valueScore: calculateValueScore(item) }))
          .sort((a, b) => b.valueScore - a.valueScore)
          .slice(0, 5);

        setTopPicks(ranked);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Could not load top picks.';
        setError(message);
        setTopPicks([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadTopPicks();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticker = inputTicker.trim().toUpperCase();
    if (!ticker) {
      return;
    }

    router.push(`/ticker?ticker=${encodeURIComponent(ticker)}`);
  };

  return (
    <main className="page">
      <section className="card">
        <header className="header">
          <h1>Today&apos;s Top Picks</h1>
          <p>Top 5 Value Score names from the default mocked universe.</p>
        </header>

        <form className="searchForm" onSubmit={handleSubmit}>
          <label htmlFor="homeTicker" className="srOnly">
            Search ticker
          </label>
          <input
            id="homeTicker"
            name="homeTicker"
            value={inputTicker}
            onChange={(event) => setInputTicker(event.target.value.toUpperCase())}
            placeholder="Search any ticker (e.g., AAPL, SHOP, XYZ)"
            autoComplete="off"
          />
          <button type="submit">Open Ticker</button>
        </form>

        {isLoading ? <p className="status">Loading today&apos;s top picks...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error ? (
          <ol className="topPicksList">
            {topPicks.map((pick) => (
              <li key={pick.ticker}>
                <span>{pick.ticker}</span>
                <strong>{pick.valueScore}/100</strong>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </main>
  );
}
