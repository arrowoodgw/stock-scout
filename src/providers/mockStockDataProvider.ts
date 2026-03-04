/**
 * src/providers/mockStockDataProvider.ts
 *
 * Mock implementation of StockDataProvider for local development.
 * Generates deterministic, seeded price histories — no API keys required.
 *
 * How it works:
 *   • A full year (252 trading days) of daily prices is computed on demand
 *     using a linear congruential generator (LCG) seeded by the ticker string.
 *   • The price model is: price = base + (day × trend) + noise + sine-wave
 *     This produces a visually plausible chart that looks different per ticker.
 *   • Well-known tickers (AAPL, MSFT, NVDA, TSLA, SPY) have curated base
 *     prices and volatility so they feel realistic in the UI.
 *   • All other tickers generate a config deterministically from the ticker
 *     string's character codes, ensuring repeatability across restarts.
 *
 * Artificial delays (450–500 ms) are added to simulate network latency.
 */

import { HistoricalPoint, PriceRange, StockDataProvider, StockQuote } from './types';

/** Parameters for the price simulation model for one ticker. */
type SeedConfig = {
  /** Starting price in USD. */
  base: number;
  /** Daily upward drift in USD per trading day. */
  trend: number;
  /** Peak amplitude of noise and sine-wave components. */
  volatility: number;
};

/** Curated configs for well-known tickers — makes the mock UI feel realistic. */
const knownTickers: Record<string, SeedConfig> = {
  AAPL: { base: 190, trend: 0.09, volatility: 2.8 },
  MSFT: { base: 420, trend: 0.11, volatility: 3.1 },
  TSLA: { base: 220, trend: 0.07, volatility: 6.2 },
  NVDA: { base: 840, trend: 0.2, volatility: 9.4 },
  SPY: { base: 510, trend: 0.08, volatility: 2.3 }
};

/** Number of trading days to simulate (approx. 1 calendar year). */
const tradingDays = 252;

/** Simulates async network delay to make the mock feel like a real API. */
function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Linear congruential generator (LCG) seeded with a numeric value.
 * Returns a function that produces the next pseudo-random number in [0, 1)
 * on each call.  The same seed always produces the same sequence.
 */
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/** Convert a ticker string to a numeric seed by summing ASCII char codes. */
function tickerToSeed(ticker: string) {
  return ticker.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

/** Generate a plausible SeedConfig for any ticker not in knownTickers. */
function buildDefaultConfig(ticker: string): SeedConfig {
  const seed = tickerToSeed(ticker);

  return {
    base: 30 + (seed % 900),
    trend: 0.03 + (seed % 12) * 0.01,
    volatility: 1.8 + (seed % 50) * 0.08
  };
}

/**
 * Build a full year of mock daily price history for a ticker.
 * Each call with the same ticker produces identical results (deterministic).
 *
 * Price formula per day:
 *   drift = day_index × trend           (slow upward drift)
 *   noise = (random - 0.5) × volatility (random day-to-day noise)
 *   wave  = sin(day / 8) × volatility   (smooth cyclical pattern)
 *   price = max(5, base + drift + noise + wave)
 */
function buildYearHistory(ticker: string): HistoricalPoint[] {
  const normalizedTicker = ticker.toUpperCase();
  const config = knownTickers[normalizedTicker] ?? buildDefaultConfig(normalizedTicker);

  const random = seededRandom(tickerToSeed(normalizedTicker));
  const today = new Date();

  return Array.from({ length: tradingDays }).map((_, index) => {
    const drift = index * config.trend;
    const noise = (random() - 0.5) * config.volatility;
    const wave = Math.sin(index / 8) * config.volatility;
    const price = Math.max(5, Number((config.base + drift + noise + wave).toFixed(2)));

    const date = new Date(today);
    date.setDate(today.getDate() - (tradingDays - 1 - index));

    return {
      date: date.toISOString(),
      price
    };
  });
}

/**
 * Slice the full year of history down to the requested range.
 *   1M → last 21 trading days (~1 calendar month)
 *   6M → last 126 trading days (~6 calendar months)
 *   1Y → all 252 trading days
 */
function sliceRange(points: HistoricalPoint[], range: PriceRange): HistoricalPoint[] {
  if (range === '1M') {
    return points.slice(-21);
  }

  if (range === '6M') {
    return points.slice(-126);
  }

  return points;
}

export class MockStockDataProvider implements StockDataProvider {
  /** Returns the most recent simulated day's price as the "latest" quote. */
  async getLatestQuote(ticker: string): Promise<StockQuote> {
    await delay(450);
    const history = buildYearHistory(ticker);
    const latest = history[history.length - 1];

    return {
      ticker: ticker.toUpperCase(),
      price: latest.price,
      updatedAt: latest.date
    };
  }

  /** Returns the simulated price history sliced to the requested range. */
  async getHistoricalPrices(ticker: string, range: PriceRange): Promise<HistoricalPoint[]> {
    await delay(500);
    const history = buildYearHistory(ticker);
    return sliceRange(history, range);
  }
}
