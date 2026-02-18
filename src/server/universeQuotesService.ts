import { top50MarketCap } from '@/universe/top50MarketCap';
import { readFileCache, writeFileCache } from './fileCache';

const QUOTE_TTL_MS = 10 * 60 * 1000;
const UNIVERSE_CACHE_KEY = 'universe_quotes';
// Polygon free tier: 5 requests per minute
const MIN_REQUEST_INTERVAL_MS = 12 * 1000;

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

type PolygonSnapshotTicker = {
  ticker: string;
  day?: { c?: number };
  prevDay?: { c?: number };
  lastTrade?: { p?: number };
  lastQuote?: { P?: number };
  updated?: number;
};

type PolygonSnapshotResponse = {
  status: string;
  tickers?: PolygonSnapshotTicker[];
  error?: string;
};

type PolygonPrevResponse = {
  status: string;
  results?: Array<{ c: number; t: number }>;
  error?: string;
};

let cacheEntry: QuoteCacheEntry | null = null;
let inFlightRefresh: Promise<UniverseQuoteMap> | null = null;
let lastRequestAt = 0;

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

async function rateLimitedFetch(url: string): Promise<Response> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
  return fetch(url, { cache: 'no-store' });
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

async function fetchPolygonSnapshot(tickers: string[]): Promise<UniverseQuoteMap> {
  const apiKey = getPolygonApiKey();
  const tickerList = tickers.join(',');
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(tickerList)}&apiKey=${apiKey}`;

  const response = await rateLimitedFetch(url);
  if (!response.ok) {
    throw new Error(`Polygon snapshot request failed (${response.status}).`);
  }

  const payload = (await response.json()) as PolygonSnapshotResponse;

  if (payload.status === 'ERROR') {
    throw new Error(payload.error ?? 'Polygon snapshot returned an error.');
  }

  const asOf = new Date().toISOString();
  const result: UniverseQuoteMap = {};

  for (const item of payload.tickers ?? []) {
    const ticker = item.ticker?.trim().toUpperCase();
    if (!ticker) continue;

    // Use day close, then prevDay close, then lastTrade price, then lastQuote ask
    const price = item.day?.c ?? item.prevDay?.c ?? item.lastTrade?.p ?? item.lastQuote?.P;

    if (price != null && Number.isFinite(price) && price > 0) {
      result[ticker] = {
        price,
        asOf: item.updated ? new Date(Math.floor(item.updated / 1_000_000)).toISOString() : asOf,
        source: 'Polygon snapshot'
      };
    }
  }

  return result;
}

async function fetchPolygonPrev(ticker: string): Promise<UniverseQuote | null> {
  const apiKey = getPolygonApiKey();
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?apiKey=${apiKey}`;

  const response = await rateLimitedFetch(url);
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

  // Try snapshot endpoint first (one request for all tickers)
  let quotes: UniverseQuoteMap = {};
  try {
    quotes = await fetchPolygonSnapshot(tickers);
  } catch {
    // snapshot failed, will fill missing tickers below
  }

  // Fall back to per-ticker prev endpoint for missing tickers
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
