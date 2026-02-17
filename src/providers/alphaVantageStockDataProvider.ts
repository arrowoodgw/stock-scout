import { HistoricalPoint, PriceRange, RequestOptions, StockDataProvider, StockQuote } from './types';

const API_BASE = 'https://www.alphavantage.co/query';
const CACHE_TTL_MS = 12 * 60 * 1000;
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

type CachedSeries = {
  expiresAt: number;
  quote: StockQuote;
  history: HistoricalPoint[];
};

const rangeCache = new Map<string, CachedSeries>();
const inFlight = new Map<string, Promise<CachedSeries>>();

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

function buildCachedSeries(ticker: string, points: HistoricalPoint[], range: PriceRange): CachedSeries {
  const history = points.slice(-RANGE_DAYS[range]);
  const latest = points[points.length - 1];

  if (!latest) {
    throw new Error('No historical data returned for ticker.');
  }

  return {
    expiresAt: Date.now() + CACHE_TTL_MS,
    quote: {
      ticker,
      price: latest.price,
      updatedAt: latest.date
    },
    history
  };
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
  private async loadSeriesRange(tickerInput: string, range: PriceRange, options?: RequestOptions): Promise<CachedSeries> {
    const ticker = normalizeTicker(tickerInput);

    if (isBrowser()) {
      const params = new URLSearchParams({ ticker, range });

      if (options?.forceRefresh) {
        params.set('refresh', '1');
      }

      const [history, quote] = await Promise.all([
        fetchJson<HistoricalPoint[]>(`/api/market/history?${params.toString()}`),
        fetchJson<StockQuote>(`/api/market/quote?ticker=${encodeURIComponent(ticker)}${options?.forceRefresh ? '&refresh=1' : ''}`)
      ]);

      return {
        expiresAt: Date.now() + CACHE_TTL_MS,
        history,
        quote
      };
    }

    const cacheKey = `${ticker}:${range}`;
    const now = Date.now();

    if (!options?.forceRefresh) {
      const cached = rangeCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached;
      }

      const activeRequest = inFlight.get(cacheKey);
      if (activeRequest) {
        return activeRequest;
      }
    }

    const request = (async () => {
      const series = await fetchAlphaVantageSeries(ticker);
      const parsed = parseSeries(series);

      if (parsed.length === 0) {
        throw new Error('No valid historical price points returned by Alpha Vantage.');
      }

      const next = buildCachedSeries(ticker, parsed, range);
      rangeCache.set(cacheKey, next);
      return next;
    })();

    inFlight.set(cacheKey, request);

    try {
      return await request;
    } finally {
      inFlight.delete(cacheKey);
    }
  }

  async getLatestQuote(ticker: string, options?: RequestOptions): Promise<StockQuote> {
    const data = await this.loadSeriesRange(ticker, '1Y', options);
    return data.quote;
  }

  async getHistoricalPrices(ticker: string, range: PriceRange, options?: RequestOptions): Promise<HistoricalPoint[]> {
    const data = await this.loadSeriesRange(ticker, range, options);
    return data.history;
  }
}
