import { top50MarketCap } from '@/universe/top50MarketCap';
import { polygonRateLimitedFetch } from './polygonRateLimit';
import { readFileCache, writeFileCache } from './fileCache';

const QUOTE_TTL_MS = 10 * 60 * 1000;
const UNIVERSE_CACHE_KEY = 'universe_quotes';

type UniverseQuote = {
  price: number;
  asOf: string;
  source: string;
};

type UniverseQuoteMap = Record<string, UniverseQuote>;

type QuoteCacheEntry = {
  expiresAt: number;
  quotes: UniverseQuoteMap;
};

type PolygonGroupedResult = {
  T: string;   // ticker
  c: number;   // close price
  t: number;   // timestamp in ms
};

type PolygonGroupedResponse = {
  status: string;
  resultsCount?: number;
  results?: PolygonGroupedResult[];
  error?: string;
};

type PolygonPrevResponse = {
  status: string;
  results?: Array<{ c: number; t: number }>;
  error?: string;
};

let cacheEntry: QuoteCacheEntry | null = null;
let inFlightRefresh: Promise<UniverseQuoteMap> | null = null;

function isRealMode() {
  return (process.env.DATA_MODE ?? 'mock').toLowerCase() === 'real';
}

function getPolygonApiKey() {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) {
    throw new Error('Missing POLYGON_API_KEY environment variable.');
  }
  return key;
}

function mockPrice(ticker: string) {
  const seed = ticker.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = 30 + (seed % 900);
  const drift = (seed % 37) * 0.33;
  return Number((base + drift).toFixed(2));
}

function buildMockQuotes(): UniverseQuoteMap {
  const asOf = new Date().toISOString();
  return Object.fromEntries(
    top50MarketCap.tickers.map((ticker) => [
      ticker,
      {
        price: mockPrice(ticker),
        asOf,
        source: 'Mock deterministic universe quote'
      }
    ])
  );
}

/**
 * Returns an ISO date string for a recent weekday, going back `daysBack` calendar days.
 * Skips weekends (markets are closed Saturday/Sunday).
 */
function recentTradingDate(daysBack: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  // Walk backwards past any weekend
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

/**
 * Fetch the entire market's daily OHLCV for a single date in one Polygon request.
 * This endpoint is available on the free tier and returns all tickers at once.
 */
async function fetchPolygonGroupedDaily(
  tickers: string[],
  date: string
): Promise<UniverseQuoteMap> {
  const apiKey = getPolygonApiKey();
  const tickerSet = new Set(tickers.map((t) => t.trim().toUpperCase()));
  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${apiKey}`;

  const response = await polygonRateLimitedFetch(url);
  if (!response.ok) {
    throw new Error(`Polygon grouped daily request failed (${response.status}).`);
  }

  const payload = (await response.json()) as PolygonGroupedResponse;
  if (payload.status === 'ERROR') {
    throw new Error(payload.error ?? 'Polygon grouped daily returned an error.');
  }

  const result: UniverseQuoteMap = {};
  const asOf = `${date}T00:00:00.000Z`;

  for (const item of payload.results ?? []) {
    const ticker = item.T?.trim().toUpperCase();
    if (!ticker || !tickerSet.has(ticker)) continue;

    const price = item.c;
    if (price != null && Number.isFinite(price) && price > 0) {
      result[ticker] = {
        price,
        asOf: item.t ? new Date(item.t).toISOString() : asOf,
        source: 'Polygon grouped daily'
      };
    }
  }

  return result;
}

async function fetchPolygonPrev(ticker: string): Promise<UniverseQuote | null> {
  const apiKey = getPolygonApiKey();
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?apiKey=${apiKey}`;

  const response = await polygonRateLimitedFetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as PolygonPrevResponse;
  if (payload.status === 'ERROR' || !payload.results?.length) return null;

  const result = payload.results[0];
  if (!result || !Number.isFinite(result.c) || result.c <= 0) return null;

  return {
    price: result.c,
    asOf: new Date(result.t).toISOString(),
    source: 'Polygon prev'
  };
}

async function fetchRealQuotes(): Promise<UniverseQuoteMap> {
  const tickers: string[] = [...top50MarketCap.tickers];

  // Try the grouped daily endpoint for recent trading days (free tier, single request).
  // Start from yesterday and work back up to 5 trading days.
  let quotes: UniverseQuoteMap = {};
  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const date = recentTradingDate(daysBack);
    try {
      const result = await fetchPolygonGroupedDaily(tickers, date);
      if (Object.keys(result).length > 0) {
        quotes = result;
        break;
      }
    } catch {
      // Try the next date
    }
  }

  // Fill in any tickers still missing with per-ticker prev calls
  const missingTickers = tickers.filter((ticker) => !quotes[ticker]);
  for (const ticker of missingTickers) {
    const quote = await fetchPolygonPrev(ticker).catch(() => null);
    if (quote) {
      quotes[ticker] = quote;
    }
  }

  return quotes;
}

async function refreshQuotes() {
  const quotes = isRealMode() ? await fetchRealQuotes() : buildMockQuotes();

  cacheEntry = {
    quotes,
    expiresAt: Date.now() + QUOTE_TTL_MS
  };

  // Persist to disk so the cache survives server restarts
  await writeFileCache(UNIVERSE_CACHE_KEY, quotes, QUOTE_TTL_MS);

  return quotes;
}

export async function getUniverseQuotes(options?: { forceRefresh?: boolean }) {
  const forceRefresh = options?.forceRefresh ?? false;

  if (!forceRefresh) {
    // 1. Check in-memory cache
    if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
      return cacheEntry.quotes;
    }

    // 2. Deduplicate concurrent requests
    if (inFlightRefresh) {
      return inFlightRefresh;
    }

    // 3. Check file cache (survives process restarts)
    const fromFile = await readFileCache<UniverseQuoteMap>(UNIVERSE_CACHE_KEY);
    if (fromFile) {
      cacheEntry = { quotes: fromFile, expiresAt: Date.now() + QUOTE_TTL_MS };
      return fromFile;
    }
  }

  inFlightRefresh = refreshQuotes();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}
