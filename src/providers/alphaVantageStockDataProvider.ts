import { top50MarketCap } from '@/universe/top50MarketCap';
import { HistoricalPoint, PriceRange, RequestOptions, StockDataProvider, StockQuote } from './types';

const API_BASE = 'https://www.alphavantage.co/query';
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const RANGE_DAYS: Record<PriceRange, number> = {
  '1M': 21,
  '6M': 126,
  '1Y': 252
};

type AlphaVantageResponse = {
  Note?: string;
  Information?: string;
  'Error Message'?: string;
  'Time Series (Daily)'?: Record<string, Record<string, string>>;
};

type CachedHistory = {
  expiresAt: number;
  history: HistoricalPoint[];
};

type UniverseQuotesResponse = {
  quotes: Record<string, { price: number; asOf: string }>;
  error?: string;
};

const historyCache = new Map<string, CachedHistory>();
const inFlightHistory = new Map<string, Promise<CachedHistory>>();
const universeTickerSet = new Set<string>(top50MarketCap.tickers);

function isBrowser() {
  return typeof window !== 'undefined';
}

function normalizeTicker(input: string) {
  const ticker = input.trim().toUpperCase();

  if (!ticker) {
    throw new Error('Please provide a ticker symbol.');
  }

  return ticker;
}

function validateAlphaVantageResponse(payload: AlphaVantageResponse) {
  if (payload.Note || payload.Information) {
    throw new Error('Alpha Vantage rate limit reached. Please wait and try again.');
  }

  if (payload['Error Message']) {
    throw new Error('Ticker was not found by Alpha Vantage.');
  }
}

function getApiKey() {
  const key = process.env.ALPHAVANTAGE_API_KEY?.trim();

  if (!key) {
    throw new Error('Missing ALPHAVANTAGE_API_KEY environment variable.');
  }

  return key;
}

function parseSeries(series: Record<string, Record<string, string>>): HistoricalPoint[] {
  return Object.entries(series)
    .map(([date, values]) => {
      const adjusted = values['5. adjusted close'];
      const close = values['4. close'];
      const value = Number(adjusted ?? close);

      return {
        date: new Date(`${date}T00:00:00.000Z`).toISOString(),
        price: value
      };
    })
    .filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sliceRange(points: HistoricalPoint[], range: PriceRange): HistoricalPoint[] {
  return points.slice(-RANGE_DAYS[range]);
}

async function fetchAlphaVantageSeries(ticker: string): Promise<Record<string, Record<string, string>>> {
  const apiKey = getApiKey();
  const baseParams = new URLSearchParams({ symbol: ticker, outputsize: 'full', apikey: apiKey });
  const functionsToTry = ['TIME_SERIES_DAILY_ADJUSTED', 'TIME_SERIES_DAILY'];

  for (const alphaFunction of functionsToTry) {
    const params = new URLSearchParams(baseParams);
    params.set('function', alphaFunction);

    const response = await fetch(`${API_BASE}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Alpha Vantage request failed (${response.status}).`);
    }

    const payload = (await response.json()) as AlphaVantageResponse;
    validateAlphaVantageResponse(payload);

    const series = payload['Time Series (Daily)'];
    if (series && Object.keys(series).length > 0) {
      return series;
    }
  }

  throw new Error('No daily series data returned by Alpha Vantage.');
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    cache: 'no-store'
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }

  return payload;
}

export class AlphaVantageStockDataProvider implements StockDataProvider {
  private async loadFullHistory(tickerInput: string, options?: RequestOptions): Promise<HistoricalPoint[]> {
    const ticker = normalizeTicker(tickerInput);
    const now = Date.now();

    if (!options?.forceRefresh) {
      const cached = historyCache.get(ticker);
      if (cached && cached.expiresAt > now) {
        return cached.history;
      }

      const activeRequest = inFlightHistory.get(ticker);
      if (activeRequest) {
        return (await activeRequest).history;
      }
    }

    const request = (async () => {
      const series = await fetchAlphaVantageSeries(ticker);
      const parsed = parseSeries(series);

      if (parsed.length === 0) {
        throw new Error('No valid historical price points returned by Alpha Vantage.');
      }

      const next = {
        expiresAt: Date.now() + HISTORY_TTL_MS,
        history: parsed
      };

      historyCache.set(ticker, next);
      return next;
    })();

    inFlightHistory.set(ticker, request);

    try {
      return (await request).history;
    } finally {
      inFlightHistory.delete(ticker);
    }
  }

  async getLatestQuote(tickerInput: string, options?: RequestOptions): Promise<StockQuote> {
    const ticker = normalizeTicker(tickerInput);

    if (isBrowser() && universeTickerSet.has(ticker)) {
      const payload = await fetchJson<UniverseQuotesResponse>(
        `/api/market/universe-quotes${options?.forceRefresh ? '?refresh=1' : ''}`
      );

      const universeQuote = payload.quotes[ticker];
      if (universeQuote) {
        return {
          ticker,
          price: universeQuote.price,
          updatedAt: universeQuote.asOf
        };
      }
    }

    const history = await this.loadFullHistory(ticker, options);
    const latest = history[history.length - 1];

    if (!latest) {
      throw new Error('No historical data returned for ticker.');
    }

    return {
      ticker,
      price: latest.price,
      updatedAt: latest.date
    };
  }

  async getHistoricalPrices(ticker: string, range: PriceRange, options?: RequestOptions): Promise<HistoricalPoint[]> {
    if (isBrowser()) {
      const params = new URLSearchParams({ ticker: ticker.toUpperCase(), range });
      if (options?.forceRefresh) {
        params.set('refresh', '1');
      }

      return fetchJson<HistoricalPoint[]>(`/api/market/history?${params.toString()}`);
    }

    const fullHistory = await this.loadFullHistory(ticker, options);
    return sliceRange(fullHistory, range);
  }
}
