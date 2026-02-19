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
 * 1. Load sec_cik_map.json → company name per ticker
 * 2. Fetch universe quotes from Polygon  → latestPrice per ticker
 * 3. Fetch SEC company facts per ticker → epsTtm, revenueTtm, revenueGrowthYoY, operatingMargin, sharesOutstanding
 * 4. Compute peTtm = latestPrice / epsTtm
 * 5. Compute ps    = (latestPrice × sharesOutstanding) / revenueTtm
 * 6. Compute marketCap = latestPrice × sharesOutstanding
 * 7. Calculate ValueScore breakdown via lib/valueScore.ts
 * 8. Store EnrichedTicker[] in cache with lastUpdated timestamp
 */

import { promises as fs } from 'fs';
import path from 'path';
import { top50MarketCap } from '@/universe/top50MarketCap';
import { calculateValueScore } from '@/lib/valueScore';
import { CacheStatus, DataCachePayload, EnrichedTicker } from '@/types';

// ---------------------------------------------------------------------------
// SEC CIK map type (matches scripts/seedSecCikMap.ts output)
// ---------------------------------------------------------------------------

type SecCikMap = Record<string, { cik: string; name: string }>;

// ---------------------------------------------------------------------------
// Polygon types
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
// SEC EDGAR types
// ---------------------------------------------------------------------------

type FactPoint = {
  start?: string;
  end?: string;
  filed?: string;
  form?: string;
  fp?: string;
  fy?: number;
  val?: number;
};

type CompanyFactsResponse = {
  facts?: Record<string, Record<string, { units?: Record<string, FactPoint[]> }>>;
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

const state: CacheState = {
  status: 'cold',
  tickers: [],
  lastUpdated: null,
  error: undefined
};

/** True while a preload is in progress — prevents concurrent preloads. */
let preloadInFlight: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns a snapshot of the current cache state. Non-blocking, always instant. */
export function getCacheSnapshot(): DataCachePayload {
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
    return Promise.resolve();
  }

  if (preloadInFlight) {
    return preloadInFlight;
  }

  preloadInFlight = runPreload().finally(() => {
    preloadInFlight = null;
  });

  return preloadInFlight;
}

// ---------------------------------------------------------------------------
// Preload pipeline
// ---------------------------------------------------------------------------

async function runPreload(): Promise<void> {
  state.status = 'loading';
  state.error = undefined;

  try {
    const tickers = [...top50MarketCap.tickers];

    // Step 1 — load SEC CIK map for company names and CIKs
    const secMap = await loadSecCikMap();

    // Step 2 — fetch all universe quotes in as few Polygon calls as possible
    const quotes = await fetchUniverseQuotes(tickers);

    // Step 3–7 — fetch SEC fundamentals per ticker, enrich, and score
    const enriched = await enrichAllTickers(tickers, secMap, quotes);

    state.tickers = enriched;
    state.lastUpdated = new Date().toISOString();
    state.status = 'ready';
  } catch (err) {
    state.status = 'error';
    state.error = err instanceof Error ? err.message : 'Preload failed.';
  }
}

// ---------------------------------------------------------------------------
// Step 1: Load sec_cik_map.json
// ---------------------------------------------------------------------------

async function loadSecCikMap(): Promise<SecCikMap> {
  const filePath = path.join(process.cwd(), 'data', 'sec_cik_map.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as SecCikMap;
  } catch {
    // If the file doesn't exist yet (seed hasn't run), return an empty map.
    // Company names will be null; CIKs will be fetched from the live SEC endpoint.
    return {};
  }
}

// ---------------------------------------------------------------------------
// Step 2: Fetch Polygon universe quotes
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
// Steps 3–7: Fetch SEC fundamentals and enrich per ticker
// ---------------------------------------------------------------------------

const SEC_FACTS_BASE = 'https://data.sec.gov/api/xbrl/companyfacts';
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

function getSecUserAgent(): string {
  const ua = process.env.SEC_USER_AGENT?.trim();
  if (!ua) throw new Error('Missing SEC_USER_AGENT environment variable.');
  return ua;
}

/** Fetch live SEC ticker→CIK map as fallback when sec_cik_map.json is missing entries. */
let liveCikMap: Map<string, string> | null = null;
let liveCikMapInFlight: Promise<Map<string, string>> | null = null;

async function getLiveCikMap(): Promise<Map<string, string>> {
  if (liveCikMap) return liveCikMap;
  if (liveCikMapInFlight) return liveCikMapInFlight;

  liveCikMapInFlight = (async () => {
    const response = await fetch(SEC_TICKERS_URL, {
      cache: 'no-store',
      headers: { 'User-Agent': getSecUserAgent(), Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`SEC tickers fetch failed (${response.status}).`);
    const payload = (await response.json()) as Record<string, { cik_str: number; ticker: string }>;
    const map = new Map<string, string>();
    for (const entry of Object.values(payload)) {
      const t = entry.ticker?.trim().toUpperCase();
      if (t && Number.isFinite(entry.cik_str)) {
        map.set(t, String(Math.trunc(entry.cik_str)).padStart(10, '0'));
      }
    }
    liveCikMap = map;
    return map;
  })();

  try {
    return await liveCikMapInFlight;
  } finally {
    liveCikMapInFlight = null;
  }
}

// --- SEC fact parsing helpers (same logic as secFundamentalsDataProvider) ---

function asTimestamp(value?: string): number {
  if (!value) return Number.NaN;
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

function hasValidValue(p: FactPoint): p is FactPoint & { val: number; end: string } {
  return typeof p.val === 'number' && Number.isFinite(p.val) && !!p.end;
}

function periodLengthDays(p: FactPoint): number | null {
  if (!p.start || !p.end) return null;
  const days = (asTimestamp(p.end) - asTimestamp(p.start)) / 86_400_000;
  return Number.isFinite(days) ? days : null;
}

function isStandaloneQuarter(p: FactPoint): boolean {
  const fp = p.fp?.toUpperCase();
  if (fp !== 'Q1' && fp !== 'Q2' && fp !== 'Q3' && fp !== 'Q4') return false;
  const days = periodLengthDays(p);
  return days === null || (days >= 45 && days <= 120);
}

function pickUnit(units: Record<string, FactPoint[]> | undefined, preferred: string[]): FactPoint[] {
  if (!units) return [];
  for (const u of preferred) if (units[u]?.length) return units[u];
  return Object.values(units).find((r) => r.length > 0) ?? [];
}

function getFactPoints(payload: CompanyFactsResponse, concepts: string[], units: string[]): FactPoint[] {
  const gaap = payload.facts?.['us-gaap'];
  if (!gaap) return [];
  for (const concept of concepts) {
    const pts = pickUnit(gaap[concept]?.units, units);
    if (pts.length) return pts;
  }
  return [];
}

function computeTtmFromQuarters(points: FactPoint[]): number | null {
  const quarters = points
    .filter((p): p is FactPoint & { val: number; end: string } => isStandaloneQuarter(p) && hasValidValue(p))
    .sort((a, b) => asTimestamp(b.end) - asTimestamp(a.end));

  const seen = new Set<string>();
  const unique: Array<FactPoint & { val: number; end: string }> = [];
  for (const p of quarters) {
    const key = `${p.fy ?? ''}-${p.fp ?? ''}-${p.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length === 4) break;
  }

  if (unique.length < 4) return null;
  const spanDays = (asTimestamp(unique[0].end) - asTimestamp(unique[3].end)) / 86_400_000;
  if (!Number.isFinite(spanDays) || spanDays > 430) return null;
  return unique.reduce((s, p) => s + p.val, 0);
}

function computeAnnualFallback(points: FactPoint[]): number | null {
  const annual = points
    .filter((p): p is FactPoint & { val: number; end: string } => p.fp?.toUpperCase() === 'FY' && hasValidValue(p))
    .sort((a, b) => asTimestamp(b.end) - asTimestamp(a.end));
  return annual[0]?.val ?? null;
}

function computeTtm(points: FactPoint[]): number | null {
  return computeTtmFromQuarters(points) ?? computeAnnualFallback(points);
}

function computeRevenueGrowthYoY(points: FactPoint[]): number | null {
  const annual = points
    .filter((p): p is FactPoint & { val: number; end: string } => p.fp?.toUpperCase() === 'FY' && hasValidValue(p))
    .sort((a, b) => asTimestamp(b.end) - asTimestamp(a.end));
  if (annual.length < 2) return null;
  const current = annual[0].val;
  const prior = annual[1].val;
  if (!prior) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function getLatestEndDate(...pointSets: FactPoint[][]): string | null {
  const ts = pointSets
    .flat()
    .filter(hasValidValue)
    .map((p) => asTimestamp(p.end))
    .filter((v) => Number.isFinite(v));
  if (!ts.length) return null;
  return new Date(Math.max(...ts)).toISOString();
}

type SecFacts = {
  epsTtm: number | null;
  revenueTtm: number | null;
  revenueGrowthYoY: number | null;
  operatingMargin: number | null;
  sharesOutstanding: number | null;
  asOf: string | null;
};

function parseCompanyFacts(payload: CompanyFactsResponse): SecFacts {
  const revenuePoints = getFactPoints(
    payload,
    ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
    ['USD']
  );
  const opIncomePoints = getFactPoints(payload, ['OperatingIncomeLoss'], ['USD']);
  const epsPoints = getFactPoints(
    payload,
    ['EarningsPerShareDiluted', 'EarningsPerShareBasic'],
    ['USD/shares']
  );
  const sharesPoints = getFactPoints(payload, ['CommonStockSharesOutstanding'], ['shares']);

  const revenueTtm = computeTtm(revenuePoints);
  const opIncomeTtm = computeTtm(opIncomePoints);
  const epsTtm = computeTtm(epsPoints);

  const operatingMargin =
    revenueTtm !== null && opIncomeTtm !== null && revenueTtm !== 0
      ? (opIncomeTtm / revenueTtm) * 100
      : null;

  const revenueGrowthYoY = computeRevenueGrowthYoY(revenuePoints);

  const sharesOutstanding =
    sharesPoints
      .filter(hasValidValue)
      .sort((a, b) => asTimestamp(b.end) - asTimestamp(a.end))[0]?.val ?? null;

  return {
    epsTtm,
    revenueTtm,
    revenueGrowthYoY,
    operatingMargin,
    sharesOutstanding,
    asOf: getLatestEndDate(revenuePoints, opIncomePoints, epsPoints)
  };
}

async function fetchSecFacts(cik: string): Promise<SecFacts> {
  const ua = getSecUserAgent();
  const url = `${SEC_FACTS_BASE}/CIK${cik}.json`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': ua, Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`SEC facts fetch failed for CIK ${cik} (${response.status}).`);
  const payload = (await response.json()) as CompanyFactsResponse;
  return parseCompanyFacts(payload);
}

function buildMockFacts(ticker: string): SecFacts {
  const seed = ticker.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const revenueTtm = 6_000_000_000 + (seed % 220) * 900_000_000;
  const opIncomeTtm = revenueTtm * (0.05 + (seed % 26) * 0.012);
  const priorRevenue = revenueTtm / (1 + (-0.04 + (seed % 18) * 0.015));
  return {
    epsTtm: 1.2 + (seed % 80) / 10,
    revenueTtm,
    revenueGrowthYoY: ((revenueTtm - priorRevenue) / Math.abs(priorRevenue)) * 100,
    operatingMargin: (opIncomeTtm / revenueTtm) * 100,
    sharesOutstanding: 500_000_000 + (seed % 200) * 10_000_000,
    asOf: new Date().toISOString()
  };
}

// Known mock fundamentals for AAPL and MSFT (mirrors mockFundamentalsDataProvider)
const knownMockFacts: Record<string, Partial<SecFacts>> = {
  AAPL: { epsTtm: 6.43, revenueTtm: 383_300_000_000, revenueGrowthYoY: 2.8, operatingMargin: 30.1, sharesOutstanding: 15_400_000_000 },
  MSFT: { epsTtm: 11.8, revenueTtm: 236_600_000_000, revenueGrowthYoY: 15.4, operatingMargin: 44.6, sharesOutstanding: 7_440_000_000 }
};

async function enrichAllTickers(
  tickers: string[],
  secMap: SecCikMap,
  quotes: QuoteMap
): Promise<EnrichedTicker[]> {
  const real = isRealMode();

  // In real mode we need the live CIK map as fallback for tickers not in sec_cik_map.json
  let cikFallback: Map<string, string> | null = null;
  if (real) {
    try {
      cikFallback = await getLiveCikMap();
    } catch {
      // Non-fatal; we'll skip tickers whose CIK we can't resolve
    }
  }

  const results: EnrichedTicker[] = [];

  for (const ticker of tickers) {
    const quote = quotes[ticker] ?? null;
    const latestPrice = quote?.price ?? null;
    const secEntry = secMap[ticker] ?? null;
    const companyName = secEntry?.name ?? null;

    let facts: SecFacts;

    if (real) {
      const cik = secEntry?.cik ?? cikFallback?.get(ticker) ?? null;
      if (!cik) {
        // Can't resolve CIK — emit null fundamentals but keep the ticker
        facts = { epsTtm: null, revenueTtm: null, revenueGrowthYoY: null, operatingMargin: null, sharesOutstanding: null, asOf: null };
      } else {
        try {
          facts = await fetchSecFacts(cik);
        } catch {
          facts = { epsTtm: null, revenueTtm: null, revenueGrowthYoY: null, operatingMargin: null, sharesOutstanding: null, asOf: null };
        }
      }
    } else {
      // Mock mode: use known values or generate deterministic ones
      const base = buildMockFacts(ticker);
      const known = knownMockFacts[ticker];
      facts = known ? { ...base, ...known, asOf: new Date().toISOString() } : base;
    }

    // Derived fields
    const peTtm =
      latestPrice !== null && facts.epsTtm !== null && facts.epsTtm !== 0
        ? latestPrice / facts.epsTtm
        : null;

    const marketCap =
      latestPrice !== null && facts.sharesOutstanding !== null
        ? latestPrice * facts.sharesOutstanding
        : null;

    const ps =
      marketCap !== null && facts.revenueTtm !== null && facts.revenueTtm !== 0
        ? marketCap / facts.revenueTtm
        : null;

    // Score calculation — happens here, once, never at render time
    const { total: valueScore, breakdown: scoreBreakdown } = calculateValueScore({
      peTtm,
      ps,
      revenueGrowthYoY: facts.revenueGrowthYoY,
      operatingMargin: facts.operatingMargin
    });

    results.push({
      ticker,
      companyName,
      latestPrice,
      marketCap,
      peTtm,
      ps,
      epsTtm: facts.epsTtm,
      revenueTtm: facts.revenueTtm,
      revenueGrowthYoY: facts.revenueGrowthYoY,
      operatingMargin: facts.operatingMargin,
      valueScore,
      scoreBreakdown,
      fundamentalsAsOf: facts.asOf
    });
  }

  return results;
}
