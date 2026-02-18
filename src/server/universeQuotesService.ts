import { top50MarketCap } from '@/universe/top50MarketCap';
import { readFileCache, writeFileCache } from './fileCache';

const ALPHA_BASE = 'https://www.alphavantage.co/query';
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

type AlphaBatchResponse = {
  Note?: string;
  Information?: string;
  'Error Message'?: string;
  'Stock Quotes'?: Array<Record<string, string>>;
};

type AlphaGlobalResponse = {
  Note?: string;
  Information?: string;
  'Error Message'?: string;
  'Global Quote'?: Record<string, string>;
};

let cacheEntry: QuoteCacheEntry | null = null;
let inFlightRefresh: Promise<UniverseQuoteMap> | null = null;

function isRealMode() {
  return (process.env.DATA_MODE ?? 'mock').toLowerCase() === 'real';
}

function getApiKey() {
  const key = process.env.ALPHAVANTAGE_API_KEY?.trim();
  if (!key) {
    throw new Error('Missing ALPHAVANTAGE_API_KEY environment variable.');
  }
  return key;
}

function validateAlphaPayload(payload: { Note?: string; Information?: string; 'Error Message'?: string }) {
  if (payload.Note || payload.Information) {
    throw new Error('Alpha Vantage rate limit reached. Please wait and try again.');
  }

  if (payload['Error Message']) {
    throw new Error('Alpha Vantage returned an error for quote request.');
  }
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

function parseBatchQuotes(payload: AlphaBatchResponse): UniverseQuoteMap {
  const rows = payload['Stock Quotes'] ?? [];

  return rows.reduce<UniverseQuoteMap>((acc, row) => {
    const ticker = row['1. symbol']?.trim().toUpperCase();
    const price = Number(row['2. price']);
    const asOf = row['4. timestamp'];

    if (!ticker || !Number.isFinite(price) || price <= 0 || !asOf) {
      return acc;
    }

    acc[ticker] = {
      price,
      asOf: new Date(`${asOf}T00:00:00.000Z`).toISOString(),
      source: 'Alpha Vantage BATCH_STOCK_QUOTES'
    };

    return acc;
  }, {});
}

async function fetchBatchQuotes(): Promise<UniverseQuoteMap> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    function: 'BATCH_STOCK_QUOTES',
    symbols: top50MarketCap.tickers.join(','),
    apikey: apiKey
  });

  const response = await fetch(`${ALPHA_BASE}?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Alpha Vantage batch quote request failed (${response.status}).`);
  }

  const payload = (await response.json()) as AlphaBatchResponse;
  validateAlphaPayload(payload);
  return parseBatchQuotes(payload);
}

async function fetchGlobalQuote(ticker: string): Promise<UniverseQuote | null> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ function: 'GLOBAL_QUOTE', symbol: ticker, apikey: apiKey });
  const response = await fetch(`${ALPHA_BASE}?${params.toString()}`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Alpha Vantage global quote request failed (${response.status}).`);
  }

  const payload = (await response.json()) as AlphaGlobalResponse;
  validateAlphaPayload(payload);

  const quote = payload['Global Quote'];
  const price = Number(quote?.['05. price']);
  const latestDay = quote?.['07. latest trading day'];

  if (!Number.isFinite(price) || price <= 0 || !latestDay) {
    return null;
  }

  return {
    price,
    asOf: new Date(`${latestDay}T00:00:00.000Z`).toISOString(),
    source: 'Alpha Vantage GLOBAL_QUOTE'
  };
}

async function fetchRealQuotes(): Promise<UniverseQuoteMap> {
  const batchQuotes = await fetchBatchQuotes().catch(() => ({}));
  const missingTickers = top50MarketCap.tickers.filter((ticker) => !batchQuotes[ticker]);

  if (missingTickers.length === 0) {
    return batchQuotes;
  }

  const fallbackEntries = await Promise.all(
    missingTickers.map(async (ticker) => {
      const quote = await fetchGlobalQuote(ticker);
      return quote ? ([ticker, quote] as const) : null;
    })
  );

  const fallbackMap = Object.fromEntries(fallbackEntries.filter((entry): entry is readonly [string, UniverseQuote] => entry !== null));

  return {
    ...batchQuotes,
    ...fallbackMap
  };
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
