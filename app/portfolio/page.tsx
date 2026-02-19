'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { currencyFormatter } from '@/utils/formatters';
import { EnrichedPortfolioHolding } from '@/types';

type PortfolioResponse = {
  holdings: EnrichedPortfolioHolding[];
  error?: string;
};

async function fetchPortfolio(): Promise<EnrichedPortfolioHolding[]> {
  const response = await fetch('/api/portfolio', { cache: 'no-store' });
  const payload = (await response.json()) as PortfolioResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? 'Could not load portfolio.');
  }

  return Array.isArray(payload.holdings) ? payload.holdings : [];
}

async function fetchIndividualPrice(ticker: string): Promise<number> {
  const response = await fetch(`/api/market/quote?ticker=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
  const payload = (await response.json()) as { price?: number; error?: string };

  if (!response.ok || payload.price == null || !Number.isFinite(payload.price)) {
    throw new Error(payload.error ?? `Could not fetch price for ${ticker}.`);
  }

  return payload.price;
}

async function postHolding(data: {
  ticker: string;
  companyName: string;
  shares: number;
  purchasePrice: number;
  purchaseDate: string;
  notes?: string;
}): Promise<void> {
  const response = await fetch('/api/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? 'Could not save holding.');
  }
}

async function deleteHolding(ticker: string): Promise<void> {
  const response = await fetch(`/api/portfolio/${encodeURIComponent(ticker)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? 'Could not remove holding.');
  }
}

function gainClass(value: number | null): string {
  if (value === null) return '';
  if (value > 0) return 'gain';
  if (value < 0) return 'loss';
  return '';
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<EnrichedPortfolioHolding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [formTicker, setFormTicker] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formShares, setFormShares] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Remove state
  const [removingTicker, setRemovingTicker] = useState<string | null>(null);

  const loadPortfolio = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let enriched = await fetchPortfolio();

      // Fallback: fetch individual prices for holdings without currentPrice
      const needPrice = enriched.filter((h) => h.currentPrice === null);
      if (needPrice.length > 0) {
        const uniqueTickers = [...new Set(needPrice.map((h) => h.ticker))];
        const priceResults = await Promise.allSettled(
          uniqueTickers.map((t) => fetchIndividualPrice(t))
        );

        const fallbackPrices = new Map<string, number>();
        uniqueTickers.forEach((t, i) => {
          const result = priceResults[i];
          if (result.status === 'fulfilled') {
            fallbackPrices.set(t, result.value);
          }
        });

        enriched = enriched.map((h) => {
          if (h.currentPrice !== null) return h;
          const price = fallbackPrices.get(h.ticker) ?? null;
          if (price === null) return h;
          const costBasis = h.shares * h.purchasePrice;
          const currentValue = h.shares * price;
          const gainLossDollar = currentValue - costBasis;
          const gainLossPercent = costBasis > 0 ? (gainLossDollar / costBasis) * 100 : null;
          return { ...h, currentPrice: price, currentValue, gainLossDollar, gainLossPercent };
        });
      }

      setHoldings(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load portfolio.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const totals = useMemo(() => {
    const totalInvested = holdings.reduce((sum, h) => sum + h.shares * h.purchasePrice, 0);
    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? h.shares * h.purchasePrice), 0);
    const totalGain = totalValue - totalInvested;
    const totalGainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
    return { totalInvested, totalValue, totalGain, totalGainPercent };
  }, [holdings]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setIsAdding(true);

    try {
      await postHolding({
        ticker: formTicker.trim().toUpperCase(),
        companyName: formCompany.trim() || formTicker.trim().toUpperCase(),
        shares: Number(formShares),
        purchasePrice: Number(formPrice),
        purchaseDate: formDate,
        notes: formNotes.trim() || undefined,
      });

      // Reset form
      setFormTicker('');
      setFormCompany('');
      setFormShares('');
      setFormPrice('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormNotes('');

      // Reload
      await loadPortfolio();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add holding.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (ticker: string) => {
    setRemovingTicker(ticker);
    try {
      await deleteHolding(ticker);
      await loadPortfolio();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove holding.');
    } finally {
      setRemovingTicker(null);
    }
  };

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Portfolio</h1>
          <p>Track your holdings with live price data and gain/loss calculations.</p>
        </header>

        {isLoading ? <p className="status">Loading portfolio...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error ? (
          <>
            {/* Summary cards */}
            <div className="summaryGrid">
              <div className="summaryCard">
                <p className="subtle">Total Invested</p>
                <p className="priceLine">{currencyFormatter.format(totals.totalInvested)}</p>
              </div>
              <div className="summaryCard">
                <p className="subtle">Current Value</p>
                <p className="priceLine">{currencyFormatter.format(totals.totalValue)}</p>
              </div>
              <div className="summaryCard">
                <p className="subtle">Overall Gain/Loss</p>
                <p className={`priceLine ${gainClass(totals.totalGain)}`}>
                  {totals.totalGain >= 0 ? '+' : ''}{currencyFormatter.format(totals.totalGain)}
                </p>
              </div>
              <div className="summaryCard">
                <p className="subtle">Overall Gain/Loss %</p>
                <p className={`priceLine ${gainClass(totals.totalGainPercent)}`}>
                  {totals.totalGainPercent >= 0 ? '+' : ''}{totals.totalGainPercent.toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Holdings table */}
            <div className="tableWrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Company</th>
                    <th>Shares</th>
                    <th>Purchase Price</th>
                    <th>Current Price</th>
                    <th>Gain/Loss ($)</th>
                    <th>Gain/Loss (%)</th>
                    <th>Total Value</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, index) => (
                    <tr key={`${h.ticker}-${h.purchaseDate}-${index}`}>
                      <td><strong>{h.ticker}</strong></td>
                      <td>{h.companyName || '\u2014'}</td>
                      <td>{h.shares}</td>
                      <td>{currencyFormatter.format(h.purchasePrice)}</td>
                      <td>
                        {h.currentPrice !== null
                          ? currencyFormatter.format(h.currentPrice)
                          : '\u2014'}
                      </td>
                      <td className={gainClass(h.gainLossDollar)}>
                        {h.gainLossDollar !== null
                          ? `${h.gainLossDollar >= 0 ? '+' : ''}${currencyFormatter.format(h.gainLossDollar)}`
                          : '\u2014'}
                      </td>
                      <td className={gainClass(h.gainLossPercent)}>
                        {h.gainLossPercent !== null
                          ? `${h.gainLossPercent >= 0 ? '+' : ''}${h.gainLossPercent.toFixed(2)}%`
                          : '\u2014'}
                      </td>
                      <td>
                        {h.currentValue !== null
                          ? currencyFormatter.format(h.currentValue)
                          : '\u2014'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="removeBtn"
                          onClick={() => void handleRemove(h.ticker)}
                          disabled={removingTicker === h.ticker}
                        >
                          {removingTicker === h.ticker ? '...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {holdings.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                        No holdings yet. Use the form below to add your first position.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Add holding form */}
            <h2 style={{ marginTop: '1.5rem', marginBottom: '0.25rem' }}>Add Holding</h2>
            <form className="addHoldingForm" onSubmit={(e) => void handleAdd(e)}>
              <label>
                Ticker
                <input
                  type="text"
                  value={formTicker}
                  onChange={(e) => setFormTicker(e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  required
                />
              </label>
              <label>
                Company Name
                <input
                  type="text"
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  placeholder="Apple Inc."
                />
              </label>
              <label>
                Shares
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={formShares}
                  onChange={(e) => setFormShares(e.target.value)}
                  placeholder="10"
                  required
                />
              </label>
              <label>
                Purchase Price
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="195.50"
                  required
                />
              </label>
              <label>
                Purchase Date
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Notes (optional)
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Added on dip"
                />
              </label>
              <button type="submit" disabled={isAdding}>
                {isAdding ? 'Adding...' : 'Add Holding'}
              </button>
            </form>
            {addError ? <p className="status error" style={{ marginTop: '0.5rem' }}>{addError}</p> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
