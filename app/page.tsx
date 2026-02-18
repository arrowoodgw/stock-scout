'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type UniverseQuote = {
  price: number;
  asOf: string;
  source: string;
};

type UniverseQuotesResponse = {
  tickers: string[];
  asOf: string;
  source: string;
  quotes: Record<string, UniverseQuote>;
};

type Pick = {
  ticker: string;
  price: number;
};

async function fetchUniverseQuotes(forceRefresh = false): Promise<UniverseQuotesResponse> {
  const params = forceRefresh ? '?refresh=1' : '';
  const response = await fetch(`/api/market/universe-quotes${params}`, { cache: 'no-store' });
  const payload = (await response.json()) as UniverseQuotesResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? 'Could not load universe quotes.');
  }

  return payload;
}

export default function HomePage() {
  const router = useRouter();
  const [inputTicker, setInputTicker] = useState('AAPL');
  const [universe, setUniverse] = useState<UniverseQuotesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUniverse = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const payload = await fetchUniverseQuotes();

        if (!isMounted) {
          return;
        }

        setUniverse(payload);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Could not load universe quotes.';
        setError(message);
        setUniverse(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadUniverse();

    return () => {
      isMounted = false;
    };
  }, []);

  const topPicks: Pick[] = useMemo(() => {
    if (!universe) {
      return [];
    }

    return Object.entries(universe.quotes)
      .map(([ticker, quote]) => ({ ticker, price: quote.price }))
      .sort((a, b) => b.price - a.price)
      .slice(0, 5);
  }, [universe]);

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
          <p>Top 50 U.S. market-cap universe (as of {universe?.asOf ?? '—'}).</p>
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

        {isLoading ? <p className="status">Loading universe quotes...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error ? (
          <>
            <p className="status">Source: {universe?.source}</p>
            <ol className="topPicksList">
              {topPicks.map((pick) => (
                <li key={pick.ticker}>
                  <span>{pick.ticker}</span>
                  <strong>${pick.price.toFixed(2)}</strong>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>
    </main>
  );
}
