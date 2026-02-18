import { HistoricalPoint, PriceRange, RequestOptions, StockDataProvider, StockQuote } from './types';

const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const QUOTE_TTL_MS = 5 * 60 * 1000;
// Polygon free tier: 5 requests per minute → enforce at least 12 s between requests
const MIN_REQUEST_INTERVAL_MS = 12 * 1000;

type PolygonAggResult = {
  c: number;  // close price
  t: number;  // timestamp in ms
};

type PolygonAggsResponse = {
  status: string;
  resultsCount?: number;
  results?: PolygonAggResult[];
  error?: string;
};

type CachedHistory = {
  expiresAt: number;
  history: HistoricalPoint[];
};

type CachedQuote = {
  expiresAt: number;
  quote: StockQuote;
};

const historyCache = new Map<string, CachedHistory>();
const inFlightHistory = new Map<string, Promise<CachedHistory>>();
const quoteCache = new Map<string, CachedQuote>();
const inFlightQuote = new Map<string, Promise<StockQuote>>();

let lastRequestAt = 0;

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

function getApiKey() {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) {
    throw new Error('Missing POLYGON_API_KEY environment variable.');
  }
  return key;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function rangeToFromDate(range: PriceRange): string {
  const now = new Date();
  if (range === '1M') {
    now.setMonth(now.getMonth() - 1);
  } else if (range === '6M') {
    now.setMonth(now.getMonth() - 6);
  } else {
    now.setFullYear(now.getFullYear() - 1);
  }
  return formatDate(now);
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
  return fetch(url, { method: 'GET', cache: 'no-store' });
}

async function fetchPolygonHistory(ticker: string, from: string, to: string): Promise<HistoricalPoint[]> {
  const apiKey = getApiKey();
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`Polygon request failed (${response.status}).`);
  }

  const payload = (await response.json()) as PolygonAggsResponse;

  if (payload.status === 'ERROR') {
    throw new Error(payload.error ?? 'Polygon returned an error.');
  }

  if (!payload.results || payload.results.length === 0) {
    return [];
  }

  return payload.results
    .map((result) => ({
      date: new Date(result.t).toISOString(),
      price: result.c
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0);
}

async function fetchPolygonPrev(ticker: string): Promise<number> {
  const apiKey = getApiKey();
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?apiKey=${apiKey}`;

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`Polygon prev request failed (${response.status}).`);
  }

  const payload = (await response.json()) as PolygonAggsResponse;

  if (payload.status === 'ERROR') {
    throw new Error(payload.error ?? 'Polygon returned an error.');
  }

  const result = payload.results?.[0];
  if (!result || !Number.isFinite(result.c) || result.c <= 0) {
    throw new Error('No valid previous close returned by Polygon.');
  }

  return result.c;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'GET', cache: 'no-store' });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status}).`);
  }
  return payload;
}

type UniverseQuotesResponse = {
  quotes: Record<string, { price: number; asOf: string }>;
  error?: string;
};

export class PolygonStockDataProvider implements StockDataProvider {
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
      // Fetch ~1 year of history; range slicing is done in memory
      const to = formatDate(new Date());
      const from = rangeToFromDate('1Y');

      const history = await fetchPolygonHistory(ticker, from, to);

      if (history.length === 0) {
        throw new Error('No valid historical price points returned by Polygon.');
      }

      const next: CachedHistory = {
        expiresAt: Date.now() + HISTORY_TTL_MS,
        history
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

    if (isBrowser()) {
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

      // Fall back to history API for non-universe tickers in browser
      const params = new URLSearchParams({ ticker, range: '1M' });
      if (options?.forceRefresh) {
        params.set('refresh', '1');
      }
      const history = await fetchJson<HistoricalPoint[]>(`/api/market/history?${params.toString()}`);
      const latest = history[history.length - 1];
      if (!latest) {
        throw new Error('No historical data returned for ticker.');
      }
      return { ticker, price: latest.price, updatedAt: latest.date };
    }

    // Server-side: use previous close from Polygon with a short-lived cache
    if (!options?.forceRefresh) {
      const cached = quoteCache.get(ticker);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.quote;
      }

      const activeRequest = inFlightQuote.get(ticker);
      if (activeRequest) {
        return activeRequest;
      }
    }

    const request = (async () => {
      const price = await fetchPolygonPrev(ticker);
      const quote: StockQuote = {
        ticker,
        price,
        updatedAt: new Date().toISOString()
      };
      quoteCache.set(ticker, { expiresAt: Date.now() + QUOTE_TTL_MS, quote });
      return quote;
    })();

    inFlightQuote.set(ticker, request);
    try {
      return await request;
    } finally {
      inFlightQuote.delete(ticker);
    }
  }

  async getHistoricalPrices(tickerInput: string, range: PriceRange, options?: RequestOptions): Promise<HistoricalPoint[]> {
    const ticker = normalizeTicker(tickerInput);

    if (isBrowser()) {
      const params = new URLSearchParams({ ticker, range });
      if (options?.forceRefresh) {
        params.set('refresh', '1');
      }
      return fetchJson<HistoricalPoint[]>(`/api/market/history?${params.toString()}`);
    }

    // Server-side: fetch directly from Polygon for the requested range
    const to = formatDate(new Date());
    const from = rangeToFromDate(range);

    if (!options?.forceRefresh) {
      const cached = historyCache.get(`${ticker}:${range}`);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.history;
      }

      const activeRequest = inFlightHistory.get(`${ticker}:${range}`);
      if (activeRequest) {
        return (await activeRequest).history;
      }
    }

    const request = (async () => {
      const history = await fetchPolygonHistory(ticker, from, to);

      const next: CachedHistory = {
        expiresAt: Date.now() + HISTORY_TTL_MS,
        history
      };

      historyCache.set(`${ticker}:${range}`, next);
      return next;
    })();

    inFlightHistory.set(`${ticker}:${range}`, request);

    try {
      return (await request).history;
    } finally {
      inFlightHistory.delete(`${ticker}:${range}`);
    }
  }
}
