'use client';

import { useMemo, useState } from 'react';
import { ComparisonChart, ComparisonPoint } from '@/components/ComparisonChart';
import { getFundamentalsDataProvider } from '@/providers';
import { MockStockDataProvider } from '@/providers/mockStockDataProvider';
import { calculateValueScore } from '@/scoring/calculateValueScore';
import { top50MarketCap } from '@/universe/top50MarketCap';

const fundamentalsProvider = getFundamentalsDataProvider();
const stockDataProvider = new MockStockDataProvider();

const periodToDays = {
  '3M': 63,
  '6M': 126,
  '1Y': 252
} as const;

type Period = keyof typeof periodToDays;
type TopN = 5 | 10 | 20;

type Result = {
  portfolioReturn: number;
  benchmarkReturn: number;
  selectedTickers: string[];
  chartData: ComparisonPoint[];
};

function totalReturn(points: number[]) {
  if (points.length < 2) {
    return 0;
  }

  const start = points[0];
  const end = points[points.length - 1];
  return ((end - start) / start) * 100;
}

export default function BacktestPage() {
  const [period, setPeriod] = useState<Period>('6M');
  const [topN, setTopN] = useState<TopN>(5);
  const [result, setResult] = useState<Result | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const fundamentalsList = await Promise.all(top50MarketCap.tickers.map((ticker) => fundamentalsProvider.getFundamentals(ticker)));

      const selectedTickers = fundamentalsList
        .map((item) => ({ ticker: item.ticker, score: calculateValueScore(item) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN)
        .map((item) => item.ticker);

      const histories = await Promise.all(
        [...selectedTickers, 'SPY'].map((ticker) => stockDataProvider.getHistoricalPrices(ticker, '1Y'))
      );

      const requestedDays = periodToDays[period];
      const slicedHistories = histories.map((points) => points.slice(-requestedDays));
      const dayCount = Math.min(...slicedHistories.map((points) => points.length));

      const portfolioSeries = Array.from({ length: dayCount }).map((_, index) => {
        const normalizedReturns = slicedHistories
          .slice(0, -1)
          .map((points) => points[index].price / points[0].price);
        return normalizedReturns.reduce((sum, value) => sum + value, 0) / normalizedReturns.length;
      });

      const benchmarkSeries = slicedHistories[slicedHistories.length - 1]
        .slice(0, dayCount)
        .map((point) => point.price / slicedHistories[slicedHistories.length - 1][0].price);

      const normalizedPortfolio = portfolioSeries.map((value) => value * 100);
      const normalizedBenchmark = benchmarkSeries.map((value) => value * 100);

      const chartData: ComparisonPoint[] = Array.from({ length: dayCount }).map((_, index) => ({
        label: `${index + 1}`,
        portfolio: normalizedPortfolio[index],
        benchmark: normalizedBenchmark[index]
      }));

      setResult({
        portfolioReturn: totalReturn(normalizedPortfolio),
        benchmarkReturn: totalReturn(normalizedBenchmark),
        selectedTickers,
        chartData
      });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : 'Could not run backtest.';
      setError(message);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const periodLabel = useMemo(() => {
    if (period === '3M') {
      return '3 months';
    }

    if (period === '6M') {
      return '6 months';
    }

    return '1 year';
  }, [period]);

  return (
    <main className="page">
      <section className="card wideCard">
        <header className="header">
          <h1>Backtest Lite</h1>
          <p>Equal-weight buy-and-hold simulation of Top N Value Score picks from the Top 50 market-cap universe vs SPY.</p>
        </header>

        <div className="toolbar">
          <label>
            Period
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              <option value="3M">3M</option>
              <option value="6M">6M</option>
              <option value="1Y">1Y</option>
            </select>
          </label>
          <label>
            Top N
            <select value={topN} onChange={(event) => setTopN(Number(event.target.value) as TopN)}>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </label>
          <button type="button" onClick={() => void runSimulation()}>
            Run Backtest
          </button>
        </div>

        {isLoading ? <p className="status">Running simulation...</p> : null}
        {!isLoading && error ? <p className="status error">{error}</p> : null}

        {!isLoading && !error && result ? (
          <>
            <div className="backtestStats">
              <div>
                <p className="subtle">Portfolio return ({periodLabel})</p>
                <p className="priceLine">{result.portfolioReturn.toFixed(2)}%</p>
              </div>
              <div>
                <p className="subtle">SPY return ({periodLabel})</p>
                <p className="priceLine">{result.benchmarkReturn.toFixed(2)}%</p>
              </div>
            </div>

            <p className="status">Selected tickers: {result.selectedTickers.join(', ')}</p>
            <ComparisonChart data={result.chartData} />
          </>
        ) : null}

        <div className="disclaimerBox">
          <p>
            Disclaimer: This Backtest Lite uses mocked/generated data and simplified assumptions. It excludes transaction
            costs, slippage, taxes, and rebalancing effects.
          </p>
          <p>For educational use only. Not investment advice.</p>
        </div>
      </section>
    </main>
  );
}
