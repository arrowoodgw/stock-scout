import { HistoricalPoint, PriceRange, StockDataProvider, StockQuote } from './types';

type SeedConfig = {
  base: number;
  trend: number;
  volatility: number;
};

const knownTickers: Record<string, SeedConfig> = {
  AAPL: { base: 190, trend: 0.09, volatility: 2.8 },
  MSFT: { base: 420, trend: 0.11, volatility: 3.1 },
  TSLA: { base: 220, trend: 0.07, volatility: 6.2 },
  NVDA: { base: 840, trend: 0.2, volatility: 9.4 },
  SPY: { base: 510, trend: 0.08, volatility: 2.3 }
};

const tradingDays = 252;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function tickerToSeed(ticker: string) {
  return ticker.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildDefaultConfig(ticker: string): SeedConfig {
  const seed = tickerToSeed(ticker);

  return {
    base: 30 + (seed % 900),
    trend: 0.03 + (seed % 12) * 0.01,
    volatility: 1.8 + (seed % 50) * 0.08
  };
}

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

  async getHistoricalPrices(ticker: string, range: PriceRange): Promise<HistoricalPoint[]> {
    await delay(500);
    const history = buildYearHistory(ticker);
    return sliceRange(history, range);
  }
}
