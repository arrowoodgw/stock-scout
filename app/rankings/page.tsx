'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFundamentalsDataProvider } from '@/providers';
import { MockStockDataProvider } from '@/providers/mockStockDataProvider';
import { StockFundamentals } from '@/providers/types';
import { calculateValueScore } from '@/scoring/calculateValueScore';
import { defaultUniverse } from '@/universe/defaultUniverse';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

const fundamentalsProvider = getFundamentalsDataProvider();
const stockDataProvider = new MockStockDataProvider();

type Row = {
  ticker: string;
  valueScore: number;
  marketCap: number | null;
  peTtm: number | null;
  ps: number | null;
  revenueGrowthYoY: number | null;
  operatingMargin: number | null;
  latestPrice: number;
};

type SortField = 'valueScore' | 'marketCap';

export default function RankingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('valueScore');

  useEffect(() => {
    let isMounted = true;

    const loadRows = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [fundamentalsList, quotes] = await Promise.all([
          Promise.all(defaultUniverse.map((ticker) => fundamentalsProvider.getFundamentals(ticker))),
          Promise.all(defaultUniverse.map((ticker) => stockDataProvider.getLatestQuote(ticker)))
        ]);

        if (!isMounted) {
          return;
        }

        const quoteByTicker = Object.fromEntries(quotes.map((quote) => [quote.ticker, quote.price]));
        const tableRows = fundamentalsList.map((fundamentals: StockFundamentals) => ({
          ticker: fundamentals.ticker,
          valueScore: calculateValueScore(fundamentals),
          marketCap: fundamentals.marketCap,
          peTtm: fundamentals.peTtm,
          ps: fundamentals.ps,
          revenueGrowthYoY: fundamentals.revenueGrowthYoY,
          operatingMargin: fundamentals.operatingMargin,
          latestPrice: quoteByTicker[fundamentals.ticker] ?? 0
        }));

        setRows(tableRows);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : 'Could not load rankings.';
        setError(message);
        setRows([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadRows();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    const base = normalizedQuery ? rows.filter((row) => row.ticker.includes(normalizedQuery)) : rows;

    return [...base].sort((a, b) => {
      if (sortBy === 'marketCap') {
        return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      }

      return b.valueScore - a.valueScore;
    });
  }, [query, rows, sortBy]);

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Rankings</h1>
          <p>Universe-wide ranking by deterministic Value Score.</p>
        </header>

        <div className="toolbar">
          <label>
            Filter ticker
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
            />
          </label>
          <label>
            Sort by
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortField)}>
              <option value="valueScore">Value Score (desc)</option>
              <option value="marketCap">Market Cap (desc)</option>
            </select>
          </label>
        </div>

        {isLoading ? <p className="status">Loading rankings...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Value Score</th>
                  <th>Market Cap</th>
                  <th>P/E</th>
                  <th>P/S</th>
                  <th>Revenue YoY Growth</th>
                  <th>Operating Margin</th>
                  <th>Latest Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.ticker}>
                    <td>{row.ticker}</td>
                    <td>{row.valueScore}/100</td>
                    <td>{row.marketCap === null ? '—' : formatLargeCurrency(row.marketCap)}</td>
                    <td>{row.peTtm === null ? '—' : numberFormatter.format(row.peTtm)}</td>
                    <td>{row.ps === null ? '—' : numberFormatter.format(row.ps)}</td>
                    <td>{row.revenueGrowthYoY === null ? '—' : `${row.revenueGrowthYoY.toFixed(1)}%`}</td>
                    <td>{row.operatingMargin === null ? '—' : `${row.operatingMargin.toFixed(1)}%`}</td>
                    <td>{currencyFormatter.format(row.latestPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
