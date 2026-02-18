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

type BuyModalState = {
  ticker: string;
  price: number;
} | null;

async function fetchUniverseQuotes(forceRefresh = false): Promise<UniverseQuotesResponse> {
  const params = forceRefresh ? '?refresh=1' : '';
  const response = await fetch(`/api/market/universe-quotes${params}`, { cache: 'no-store' });
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

export default function HomePage() {
  const router = useRouter();
  const [inputTicker, setInputTicker] = useState('AAPL');
  const [universe, setUniverse] = useState<UniverseQuotesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buyModal, setBuyModal] = useState<BuyModalState>(null);
  const [buyShares, setBuyShares] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

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
        `Purchased ${buyShares} share${buyShares !== 1 ? 's' : ''} of ${buyModal.ticker} at $${buyModal.price.toFixed(2)}.`
      );
    } catch (err) {
      setBuySuccess(`Error: ${err instanceof Error ? err.message : 'Could not save purchase.'}`);
    } finally {
      setIsBuying(false);
    }
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
                  <button
                    type="button"
                    className="buyBtn"
                    onClick={() => handleOpenBuy(pick.ticker, pick.price)}
                  >
                    Buy
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>

      {buyModal ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={`Buy ${buyModal.ticker}`}>
          <div className="modal">
            <h2>Buy {buyModal.ticker}</h2>
            <p>Current price: <strong>${buyModal.price.toFixed(2)}</strong></p>

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
              Total: <strong>${(buyShares * buyModal.price).toFixed(2)}</strong>
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
