import { HistoricalPoint, PriceRange, StockQuote } from '@/providers/types';

const API_BASE = 'https://www.alphavantage.co/query';
const QUOTE_TTL_MS = 10 * 60 * 1000;
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const VALID_TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const quoteCache = new Map<string, CacheEntry<StockQuote>>();
const historyCache = new Map<string, CacheEntry<HistoricalPoint[]>>();

const inFlightQuote = new Map<string, Promise<StockQuote>>();
const inFlightHistory = new Map<string, Promise<HistoricalPoint[]>>();

type AlphaVantageResponse = {
  Note?: string;
  Information?: string;
  'Error Message'?: string;
};

type QuoteResponse = AlphaVantageResponse & {
  'Global Quote'?: {
    '01. symbol'?: string;
    '05. price'?: string;
    '07. latest trading day'?: string;
  };
};

type DailyAdjustedResponse = AlphaVantageResponse & {
  'Time Series (Daily)'?: Record<string, { '4. close'?: string }>;
};

function getApiKey(): string {
  const key = process.env.ALPHAVANTAGE_API_KEY?.trim();

  if (!key) {
    throw new Error('Missing ALPHAVANTAGE_API_KEY environment variable.');
  }

  return key;
}

function normalizeTicker(rawTicker: string): string {
  const ticker = rawTicker.trim().toUpperCase();

  if (!VALID_TICKER.test(ticker)) {
    throw new Error('Invalid ticker format. Use letters/numbers with optional . or -.');
  }

  return ticker;
}

function assertApiResponse(payload: AlphaVantageResponse) {
  if (payload.Note || payload.Information) {
    throw new Error('Market data rate limit reached. Please try again shortly.');
  }

  if (payload['Error Message']) {
    throw new Error('Ticker was not found by the market data provider.');
  }
}

async function alphaFetch<T extends AlphaVantageResponse>(params: URLSearchParams): Promise<T> {
  params.set('apikey', getApiKey());

  const response = await fetch(`${API_BASE}?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Market data request failed (${response.status}).`);
  }

  const payload = (await response.json()) as T;
  assertApiResponse(payload);
  return payload;
}

function sliceRange(points: HistoricalPoint[], range: PriceRange): HistoricalPoint[] {
  if (range === '1M') {
    return points.slice(-21);
  }

  if (range === '6M') {
    return points.slice(-126);
  }

  return points.slice(-252);
}

export async function getLatestQuote(tickerInput: string, forceRefresh = false): Promise<StockQuote> {
  const ticker = normalizeTicker(tickerInput);
  const cacheKey = ticker;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = quoteCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const existing = inFlightQuote.get(cacheKey);
    if (existing) {
      return existing;
    }
  }

  const request = (async () => {
    const params = new URLSearchParams({ function: 'GLOBAL_QUOTE', symbol: ticker });
    const payload = await alphaFetch<QuoteResponse>(params);
    const quote = payload['Global Quote'];

    if (!quote?.['05. price']) {
      throw new Error('No quote data returned for ticker.');
    }

    const price = Number(quote['05. price']);
    if (!Number.isFinite(price)) {
      throw new Error('Quote price was invalid.');
    }

    const latestTradingDay = quote['07. latest trading day'];
    const updatedAt = latestTradingDay ? new Date(`${latestTradingDay}T16:00:00.000Z`).toISOString() : new Date().toISOString();

    const result: StockQuote = {
      ticker,
      price,
      updatedAt
    };

    quoteCache.set(cacheKey, { value: result, expiresAt: Date.now() + QUOTE_TTL_MS });
    return result;
  })();

  inFlightQuote.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlightQuote.delete(cacheKey);
  }
}

export async function getHistoricalPrices(
  tickerInput: string,
  range: PriceRange,
  forceRefresh = false
): Promise<HistoricalPoint[]> {
  const ticker = normalizeTicker(tickerInput);
  const cacheKey = `${ticker}:${range}`;
  const now = Date.now();

  if (!forceRefresh) {
    const cached = historyCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const existing = inFlightHistory.get(cacheKey);
    if (existing) {
      return existing;
    }
  }

  const request = (async () => {
    const params = new URLSearchParams({
      function: 'TIME_SERIES_DAILY',
      symbol: ticker,
      outputsize: 'full'
    });

    const payload = await alphaFetch<DailyAdjustedResponse>(params);
    const series = payload['Time Series (Daily)'];

    if (!series || Object.keys(series).length === 0) {
      throw new Error('No historical data returned for ticker.');
    }

    const sorted = Object.entries(series)
      .map(([day, values]) => {
        const close = Number(values['4. close']);
        return {
          date: new Date(`${day}T00:00:00.000Z`).toISOString(),
          price: close
        };
      })
      .filter((point) => Number.isFinite(point.price) && point.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sorted.length === 0) {
      throw new Error('Historical data payload was empty.');
    }

    const result = sliceRange(sorted, range);
    historyCache.set(cacheKey, { value: result, expiresAt: Date.now() + HISTORY_TTL_MS });
    return result;
  })();

  inFlightHistory.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlightHistory.delete(cacheKey);
  }
}
