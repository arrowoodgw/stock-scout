/**
 * src/lib/dataCache.ts
 *
 * Server-side singleton cache for the enriched Top-50 dataset.
 *
 * Architecture
 * ─────────────
 * • One in-memory object holds the fully enriched, fully scored dataset.
 * • Populated at app startup via the /api/preload route (called by instrumentation.ts).
 * • Pages and routes call getCacheSnapshot() to read — they never fetch or calculate.
 * • A manual refresh repopulates the cache from scratch (forceRefresh=true).
 *
 * Data pipeline (runs at preload time only)
 * ──────────────────────────────────────────
 * 1. Load sec_cik_map.json → company name per ticker (optional; falls back to null)
 * 2. Fetch universe quotes from Polygon      → latestPrice per ticker
 * 3. Fetch fundamentals via active provider  → epsTtm, revenueTtm, revenueGrowthYoY,
 *                                              operatingMargin, sharesOutstanding
 *    Active provider is selected by FUNDAMENTALS_PROVIDER env var (see src/providers/index.ts):
 *      polygon (default) → Polygon.io /vX/reference/financials
 *      sec               → SEC EDGAR /api/xbrl/companyfacts
 * 4. Compute peTtm = latestPrice / epsTtm
 * 5. Compute marketCap = latestPrice × sharesOutstanding  (or provider value as fallback)
 * 6. Compute ps = marketCap / revenueTtm                  (or provider value as fallback)
 * 7. Calculate ValueScore breakdown via lib/valueScore.ts
 * 8. Store EnrichedTicker[] in cache with lastUpdated timestamp
 */

import { promises as fs } from 'fs';
import path from 'path';
import { top50MarketCap } from '@/universe/top50MarketCap';
import { calculateValueScore, TICKER_SECTOR_MAP } from '@/lib/valueScore';
import { CacheStatus, DataCachePayload, EnrichedTicker } from '@/types';
import { getFundamentalsDataProvider, getFundamentalsProviderName } from '@/providers';

// ---------------------------------------------------------------------------
// SEC CIK map type (matches scripts/seedSecCikMap.ts output)
// Used for company names regardless of which fundamentals provider is active.
// Removed entirely in M7.3.
// ---------------------------------------------------------------------------

type SecCikMap = Record<string, { cik: string; name: string }>;

// ---------------------------------------------------------------------------
// Polygon quote types (used for the price layer — always Polygon)
// ---------------------------------------------------------------------------

type PolygonGroupedResult = { T: string; c: number; t: number };
type PolygonGroupedResponse = {
  status: string;
  results?: PolygonGroupedResult[];
  error?: string;
};
type PolygonPrevResponse = {
  status: string;
  results?: Array<{ c: number; t: number }>;
  error?: string;
};

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

type CacheState = {
  status: CacheStatus;
  tickers: EnrichedTicker[];
  lastUpdated: string | null;
  error: string | undefined;
};

type CacheSnapshotFile = {
  tickers: EnrichedTicker[];
  lastUpdated: string;
};

type PreloadLogLevel = 'info' | 'error';

const state: CacheState = {
  status: 'cold',
  tickers: [],
  lastUpdated: null,
  error: undefined
};

/** True while a preload is in progress — prevents concurrent preloads. */
let preloadInFlight: Promise<void> | null = null;
const snapshotPath = path.join(process.cwd(), 'data', 'cache', 'rankings-snapshot.json');

function logPreloadEvent(level: PreloadLogLevel, event: string, details: Record<string, unknown> = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    source: 'dataCache',
    event,
    ...details
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a snapshot of the current cache state.
 *
 * M5.1 – Now async: if the cache is cold or loading, awaits the in-flight (or
 * newly started) preload before returning so that async Server Components get
 * fully populated data on first paint — zero client-side fetch needed.
 * If the cache is already ready or errored, returns immediately.
 */
export async function getCacheSnapshot(): Promise<DataCachePayload> {
  // Await preload only when the cache hasn't settled yet (cold or mid-load).
  if (state.status !== 'ready' && state.status !== 'error') {
    await triggerPreload(false);
  }

  return {
    status: state.status,
    tickers: state.tickers,
    lastUpdated: state.lastUpdated,
    ...(state.error ? { error: state.error } : {})
  };
}

/**
 * Trigger a cache preload.
 * If a preload is already in flight, returns the same promise (no double-fetch).
 * If `forceRefresh` is true, always starts a fresh load even if cache is ready.
 */
export function triggerPreload(forceRefresh = false): Promise<void> {
  if (!forceRefresh && state.status === 'ready') {
    logPreloadEvent('info', 'preload.skip_already_ready', {
      status: state.status,
      lastUpdated: state.lastUpdated
    });
    return Promise.resolve();
  }

  if (preloadInFlight) {
    logPreloadEvent('info', 'preload.join_in_flight', {
      status: state.status
    });
    return preloadInFlight;
  }

  preloadInFlight = runPreload().finally(() => {
    preloadInFlight = null;
  });

  return preloadInFlight;
}

/** Force a fresh cache refresh (used by cron and manual admin refresh flows). */
export function triggerRefresh(): Promise<void> {
  return triggerPreload(true);
}

/** Returns the cache age in whole minutes, or null if cache has never been populated. */
export function getCacheAgeMinutes(now = new Date()): number | null {
  if (!state.lastUpdated) return null;
  const lastUpdatedMs = Date.parse(state.lastUpdated);
  if (Number.isNaN(lastUpdatedMs)) return null;
  const diffMs = Math.max(0, now.getTime() - lastUpdatedMs);
  return Math.floor(diffMs / 60_000);
}

export function getCacheHealth() {
  return {
    status: state.status,
    lastUpdated: state.lastUpdated,
    universeSize: state.tickers.length,
    scoreVersion: 'v2' as const,
    dataMode: isRealMode() ? 'real' : 'mock',
    fundamentalsProvider: getFundamentalsProviderName(),
    cacheState: {
      status: state.status,
      error: state.error ?? null,
      inFlight: preloadInFlight !== null
    }
  };
}

// ---------------------------------------------------------------------------
// Preload pipeline
// ---------------------------------------------------------------------------

async function runPreload(): Promise<void> {
  const startedAtMs = Date.now();

  state.status = 'loading';
  state.error = undefined;

  logPreloadEvent('info', 'preload.started', {
    tickerTarget: top50MarketCap.tickers.length,
    dataMode: isRealMode() ? 'real' : 'mock',
    fundamentalsProvider: getFundamentalsProviderName()
  });

  try {
    const tickers = [...top50MarketCap.tickers];

    // Step 1 — load SEC CIK map for company names (optional; falls back to null)
    const secMap = await loadSecCikMap();

    // Step 2 — fetch all universe quotes in as few Polygon calls as possible
    const quotes = await fetchUniverseQuotes(tickers);

    // Steps 3–7 — fetch fundamentals via the active provider, enrich, and score
    const enriched = await enrichAllTickers(tickers, secMap, quotes);

    const refreshedAt = new Date().toISOString();

    await writeSnapshotFile({
      tickers: enriched,
      lastUpdated: refreshedAt
    });

    state.tickers = enriched;
    state.lastUpdated = refreshedAt;
    state.status = 'ready';

    logPreloadEvent('info', 'preload.succeeded', {
      durationMs: Date.now() - startedAtMs,
      tickerCount: enriched.length,
      lastUpdated: refreshedAt,
      fundamentalsProvider: getFundamentalsProviderName()
    });
  } catch (err) {
    state.status = 'error';
    state.error = err instanceof Error ? err.message : 'Preload failed.';

    logPreloadEvent('error', 'preload.failed', {
      durationMs: Date.now() - startedAtMs,
      error: state.error
    });
  }
}

async function writeSnapshotFile(snapshot: CacheSnapshotFile): Promise<void> {
  const dir = path.dirname(snapshotPath);
  const tmpPath = `${snapshotPath}.tmp`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(snapshot), 'utf8');
  await fs.rename(tmpPath, snapshotPath);
}

// ---------------------------------------------------------------------------
// Step 1: Load sec_cik_map.json (company names only — not used for CIK lookup)
// ---------------------------------------------------------------------------

async function loadSecCikMap(): Promise<SecCikMap> {
  const filePath = path.join(process.cwd(), 'data', 'sec_cik_map.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as SecCikMap;
  } catch {
    // If the file doesn't exist yet (seed hasn't run, or Polygon provider active),
    // return an empty map — company names will be null.
    return {};
  }
}

// ---------------------------------------------------------------------------
// Step 2: Fetch Polygon universe quotes (price layer — always Polygon)
// ---------------------------------------------------------------------------

function getPolygonApiKey(): string {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) throw new Error('Missing POLYGON_API_KEY environment variable.');
  return key;
}

function isRealMode(): boolean {
  return (process.env.DATA_MODE ?? 'mock').toLowerCase() === 'real';
}

/** Returns a recent weekday date string (YYYY-MM-DD), stepping backwards past weekends. */
function recentTradingDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

type QuoteMap = Record<string, { price: number; asOf: string }>;

async function fetchPolygonGroupedDaily(tickers: string[], date: string): Promise<QuoteMap> {
  const apiKey = getPolygonApiKey();
  const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
  const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${apiKey}`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return {};

  const payload = (await response.json()) as PolygonGroupedResponse;
  if (payload.status === 'ERROR' || !payload.results) return {};

  const result: QuoteMap = {};
  for (const item of payload.results) {
    const ticker = item.T?.trim().toUpperCase();
    if (!ticker || !tickerSet.has(ticker)) continue;
    if (item.c != null && Number.isFinite(item.c) && item.c > 0) {
      result[ticker] = {
        price: item.c,
        asOf: item.t ? new Date(item.t).toISOString() : `${date}T00:00:00.000Z`
      };
    }
  }
  return result;
}

async function fetchPolygonPrevSingle(ticker: string): Promise<{ price: number; asOf: string } | null> {
  const apiKey = getPolygonApiKey();
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?apiKey=${apiKey}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return null;
  const payload = (await response.json()) as PolygonPrevResponse;
  if (payload.status === 'ERROR' || !payload.results?.length) return null;
  const r = payload.results[0];
  if (!r || !Number.isFinite(r.c) || r.c <= 0) return null;
  return { price: r.c, asOf: new Date(r.t).toISOString() };
}

function mockPrice(ticker: string): number {
  const seed = ticker.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return Number((30 + (seed % 900) + (seed % 37) * 0.33).toFixed(2));
}

async function fetchUniverseQuotes(tickers: string[]): Promise<QuoteMap> {
  if (!isRealMode()) {
    const asOf = new Date().toISOString();
    return Object.fromEntries(tickers.map((t) => [t, { price: mockPrice(t), asOf }]));
  }

  // Try grouped daily for recent trading days (one request covers all tickers)
  let quotes: QuoteMap = {};
  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const date = recentTradingDate(daysBack);
    try {
      const result = await fetchPolygonGroupedDaily(tickers, date);
      if (Object.keys(result).length > 0) {
        quotes = result;
        break;
      }
    } catch {
      // try next day
    }
  }

  // Fill gaps with per-ticker prev calls
  const missing = tickers.filter((t) => !quotes[t]);
  for (const ticker of missing) {
    const q = await fetchPolygonPrevSingle(ticker).catch(() => null);
    if (q) quotes[ticker] = q;
  }

  return quotes;
}

// ---------------------------------------------------------------------------
// Steps 3–7: Fetch fundamentals via provider, enrich, and score
// ---------------------------------------------------------------------------

async function enrichAllTickers(
  tickers: string[],
  secMap: SecCikMap,
  quotes: QuoteMap
): Promise<EnrichedTicker[]> {
  // Grab whichever provider is active (polygon or sec, depending on env vars).
  const provider = getFundamentalsDataProvider();
  const results: EnrichedTicker[] = [];

  for (const ticker of tickers) {
    const quote = quotes[ticker] ?? null;
    const latestPrice = quote?.price ?? null;

    // Company name — sourced from sec_cik_map.json today; M7.1 will add a
    // Polygon company-name lookup so the CIK map becomes unnecessary.
    const companyName = secMap[ticker]?.name ?? null;

    // -----------------------------------------------------------------------
    // Step 3 — fetch fundamentals via the active provider
    // -----------------------------------------------------------------------
    let fundamentals;
    try {
      fundamentals = await provider.getFundamentals(ticker);
    } catch {
      // Non-fatal: keep the ticker in rankings with null fundamentals.
      fundamentals = {
        ticker,
        marketCap: null,
        peTtm: null,
        ps: null,
        epsTtm: null,
        revenueTtm: null,
        revenueGrowthYoY: null,
        operatingMargin: null,
        sharesOutstanding: null,
        asOf: null
      };
    }

    // -----------------------------------------------------------------------
    // Steps 4–6 — derive price-sensitive ratios from live quote + fundamentals
    //
    // sharesOutstanding comes from the provider when available (SEC provides it;
    // Polygon will add it in M7.1).  marketCap and ps fall back to the provider's
    // pre-computed values when shares are absent (e.g. mock provider).
    // -----------------------------------------------------------------------
    const sharesOutstanding = fundamentals.sharesOutstanding ?? null;

    const peTtm =
      latestPrice !== null && fundamentals.epsTtm !== null && fundamentals.epsTtm !== 0
        ? latestPrice / fundamentals.epsTtm
        : null;

    const marketCap =
      latestPrice !== null && sharesOutstanding !== null
        ? latestPrice * sharesOutstanding
        : (fundamentals.marketCap ?? null);

    const ps =
      marketCap !== null && fundamentals.revenueTtm !== null && fundamentals.revenueTtm !== 0
        ? marketCap / fundamentals.revenueTtm
        : (fundamentals.ps ?? null);

    // -----------------------------------------------------------------------
    // Step 7 — score; sector is used for v2 sector-relative scoring only
    // -----------------------------------------------------------------------
    const sector = TICKER_SECTOR_MAP[ticker] ?? null;

    const {
      total: valueScore,
      breakdown: scoreBreakdown,
      scoreVersion,
      weights: scoreWeights
    } = calculateValueScore({
      peTtm,
      ps,
      revenueGrowthYoY: fundamentals.revenueGrowthYoY,
      operatingMargin: fundamentals.operatingMargin,
      sector
    });

    results.push({
      ticker,
      companyName,
      latestPrice,
      marketCap,
      peTtm,
      ps,
      epsTtm: fundamentals.epsTtm,
      revenueTtm: fundamentals.revenueTtm,
      revenueGrowthYoY: fundamentals.revenueGrowthYoY,
      operatingMargin: fundamentals.operatingMargin,
      valueScore,
      scoreBreakdown,
      scoreVersion,
      scoreWeights,
      sector,
      fundamentalsAsOf: fundamentals.asOf
    });
  }

  return results;
}
