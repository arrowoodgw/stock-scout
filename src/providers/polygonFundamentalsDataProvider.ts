/**
 * src/providers/polygonFundamentalsDataProvider.ts
 *
 * Fetches fundamental data from Polygon.io's Financials API and returns the
 * exact same StockFundamentals shape used by the old SEC EDGAR provider.
 *
 * Why Polygon instead of SEC?
 * ─────────────────────────────
 * • One bulk API call per ticker replaces ~3 sequential SEC fact-page fetches.
 * • No CIK resolution step — Polygon accepts ticker symbols directly.
 * • Polygon normalises the XBRL concepts so we don't need to chase aliases
 *   (e.g. "Revenues" vs "RevenueFromContractWithCustomerExcludingAssessedTax").
 * • Includes operating income, EPS, and share counts in a single payload.
 *
 * Data pipeline (per ticker, server-side)
 * ────────────────────────────────────────
 * 1. GET /vX/reference/financials?timeframe=quarterly&limit=5  → last 5 quarters
 *    • Pick the 4 most-recent non-overlapping quarters.
 *    • Sum revenues, operating income, diluted EPS → TTM figures.
 *    • Most-recent diluted_average_shares → sharesOutstanding proxy.
 * 2. GET /vX/reference/financials?timeframe=annual&limit=2     → last 2 FY reports
 *    • Revenue YoY growth = (FY0 − FY1) / |FY1| × 100.
 * 3. Operating margin = (TTM operating income / TTM revenue) × 100.
 * 4. marketCap / peTtm / ps remain null here — dataCache.ts derives them
 *    from latestPrice × sharesOutstanding after this provider returns.
 *
 * Caching strategy
 * ─────────────────
 * • 24-hour in-memory cache keyed by uppercase ticker (same as SEC provider).
 * • In-flight deduplication: concurrent calls for the same ticker share one
 *   Promise and settle together — no duplicate Polygon requests.
 * • forceRefresh=true bypasses both layers.
 *
 * Browser behaviour
 * ──────────────────
 * When running client-side (typeof window !== 'undefined') this class proxies
 * the request through /api/fundamentals — the same Next.js route used by the
 * SEC provider — so no API key is ever shipped to the browser.
 */

import { FundamentalsDataProvider, RequestOptions, StockFundamentals } from './types';
import { polygonRateLimitedFetch } from '@/server/polygonRateLimit';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache lifetime: fundamentals don't change intra-day; 24 h is safe. */
const FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Polygon Financials API base URL (vX = experimental, stable in practice).
 * Docs: https://polygon.io/docs/stocks/get_vx_reference_financials
 */
const FINANCIALS_BASE = 'https://api.polygon.io/vX/reference/financials';

/**
 * Fetch the 5 most-recent quarterly periods so we always have 4 good
 * quarters even when the latest filing is partial or missing one metric.
 */
const QUARTERLY_LIMIT = 5;

/** Two annual periods is all we need for a single year-over-year delta. */
const ANNUAL_LIMIT = 2;

// ---------------------------------------------------------------------------
// Polygon API response types
// ---------------------------------------------------------------------------

/**
 * A single numeric line item inside a Polygon financial statement.
 * `value` is always in the base unit specified by `unit`
 * (e.g. "USD", "USD/shares", "shares").
 */
type PolygonFinancialValue = {
  value: number;   // raw numeric amount in `unit`
  unit: string;    // "USD" | "USD/shares" | "shares" | …
  label?: string;  // human-readable label (e.g. "Revenues") — informational only
};

/**
 * Income-statement section from Polygon.
 * We only reference the fields we actually use; the API returns more.
 */
type PolygonIncomeStatement = {
  /** Total revenues / net sales for the period. */
  revenues?: PolygonFinancialValue;
  /** Operating income (loss) — revenue minus COGS and operating expenses. */
  operating_income_loss?: PolygonFinancialValue;
  /**
   * Diluted earnings per share.
   * Preferred over basic because it accounts for dilutive securities
   * (options, convertible notes, etc.) — more conservative.
   */
  diluted_earnings_per_share?: PolygonFinancialValue;
  /** Basic EPS — used as fallback when diluted is unavailable. */
  basic_earnings_per_share?: PolygonFinancialValue;
  /**
   * Weighted-average diluted shares outstanding for the period.
   * We take the most-recent quarter's value as a proxy for current
   * sharesOutstanding (dataCache.ts uses it to derive marketCap and P/S).
   */
  diluted_average_shares?: PolygonFinancialValue;
};

/** Container for all financial statements in one filing period. */
type PolygonFinancials = {
  income_statement: PolygonIncomeStatement;
  // balance_sheet and cash_flow_statement are present in the API but unused in M7.1.
};

/**
 * One reporting period returned by the Polygon Financials API.
 * A "quarterly" timeframe call returns four of these (one per quarter);
 * an "annual" timeframe call returns one per fiscal year.
 */
type PolygonFinancialPeriod = {
  /** Period start date in YYYY-MM-DD format. */
  start_date: string;
  /** Period end date in YYYY-MM-DD format — used as the asOf timestamp. */
  end_date: string;
  /** "quarterly" | "annual" | "ttm" — matches the timeframe we requested. */
  timeframe: 'quarterly' | 'annual' | 'ttm';
  /**
   * Polygon fiscal period label: "Q1" | "Q2" | "Q3" | "Q4" | "FY".
   * We use this to confirm a period is quarterly (not a stub annual entry
   * that sometimes appears in quarterly result sets).
   */
  fiscal_period: string;
  /** Fiscal year as a four-digit string, e.g. "2024". */
  fiscal_year: string;
  /** Ticker symbols this filing covers (usually one). */
  tickers: string[];
  /** The actual financial statement data. */
  financials: PolygonFinancials;
};

/** Top-level response envelope from /vX/reference/financials. */
type PolygonFinancialsResponse = {
  status: string;               // "OK" on success, "ERROR" on failure
  results?: PolygonFinancialPeriod[];
  error?: string;               // present when status === "ERROR"
  next_url?: string;            // pagination — we never need page 2 with limit=5
};

// ---------------------------------------------------------------------------
// In-memory cache and in-flight deduplication
// ---------------------------------------------------------------------------

type CacheEntry = {
  expiresAt: number;       // Date.now() + FUNDAMENTALS_TTL_MS
  value: StockFundamentals;
};

/** 24-hour in-memory store. One entry per uppercase ticker. */
const fundamentalsCache = new Map<string, CacheEntry>();

/**
 * In-flight map: if two callers request the same ticker simultaneously, the
 * second one joins the first one's Promise instead of firing a duplicate request.
 */
const fundamentalsInFlight = new Map<string, Promise<StockFundamentals>>();

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when running in a browser context.
 * Used to decide whether to hit the Polygon API directly (server) or proxy
 * through /api/fundamentals (browser — avoids leaking the API key).
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Reads and validates POLYGON_API_KEY from the environment. */
function getApiKey(): string {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) {
    throw new Error('Missing POLYGON_API_KEY environment variable.');
  }
  return key;
}

/** Normalises a ticker to uppercase and guards against empty strings. */
function normalizeTicker(input: string): string {
  const ticker = input.trim().toUpperCase();
  if (!ticker) {
    throw new Error('Please provide a ticker symbol.');
  }
  return ticker;
}

// ---------------------------------------------------------------------------
// Browser proxy helper (identical pattern to polygonStockDataProvider)
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'GET', cache: 'no-store' });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status}).`);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Polygon Financials API fetch helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Polygon Financials URL for a given ticker and timeframe.
 *
 * @param ticker     - Uppercase ticker symbol (e.g. "AAPL")
 * @param timeframe  - "quarterly" or "annual"
 * @param limit      - Number of periods to return (sorted newest-first)
 */
function buildFinancialsUrl(ticker: string, timeframe: 'quarterly' | 'annual', limit: number): string {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    ticker,
    timeframe,
    limit: String(limit),
    sort: 'period_of_report_date', // sort field
    order: 'desc',                 // newest period first
    apiKey
  });
  return `${FINANCIALS_BASE}?${params.toString()}`;
}

/**
 * Fetches financial periods from the Polygon Financials API.
 *
 * Uses polygonRateLimitedFetch so this module shares the global Polygon rate
 * limiter with polygonStockDataProvider and universeQuotesService — preventing
 * accidental bursts when several providers run concurrently during preload.
 *
 * @throws when the HTTP response is not OK or Polygon returns status "ERROR".
 */
async function fetchFinancialPeriods(
  ticker: string,
  timeframe: 'quarterly' | 'annual',
  limit: number
): Promise<PolygonFinancialPeriod[]> {
  const url = buildFinancialsUrl(ticker, timeframe, limit);
  const response = await polygonRateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`Polygon Financials request failed for ${ticker} (${response.status}).`);
  }

  const payload = (await response.json()) as PolygonFinancialsResponse;

  if (payload.status === 'ERROR') {
    throw new Error(payload.error ?? `Polygon Financials returned an error for ${ticker}.`);
  }

  return payload.results ?? [];
}

// ---------------------------------------------------------------------------
// TTM computation helpers
// ---------------------------------------------------------------------------

/**
 * Safely extracts the numeric value from a PolygonFinancialValue, returning
 * null when the field is missing or its value is not a finite number.
 */
function safeValue(field: PolygonFinancialValue | undefined): number | null {
  if (!field) return null;
  return Number.isFinite(field.value) ? field.value : null;
}

/**
 * Determines whether a period is a genuine standalone quarter.
 *
 * Polygon occasionally returns a stub "FY" entry inside a quarterly result
 * set (e.g. for companies that file 52/53-week years).  We explicitly
 * require fiscal_period to be one of Q1-Q4 to exclude those stubs.
 *
 * Additionally, we guard on the calendar span of the period so that
 * cumulative YTD filings — where Q2 covers January through June (≈180 days)
 * instead of a standalone ~90-day quarter — are excluded automatically.
 * A genuine standalone quarter spans 45–120 calendar days.
 */
function isValidQuarterlyPeriod(period: PolygonFinancialPeriod): boolean {
  const fp = period.fiscal_period?.toUpperCase();
  if (fp !== 'Q1' && fp !== 'Q2' && fp !== 'Q3' && fp !== 'Q4') {
    return false; // not a quarterly label
  }

  // Guard on calendar span when both dates are present
  if (period.start_date && period.end_date) {
    const startMs = new Date(`${period.start_date}T00:00:00.000Z`).getTime();
    const endMs   = new Date(`${period.end_date}T00:00:00.000Z`).getTime();
    const days    = (endMs - startMs) / 86_400_000;
    if (Number.isFinite(days) && (days < 45 || days > 120)) {
      return false; // spans too few or too many days — likely a cumulative YTD entry
    }
  }

  return true;
}

/**
 * Extracts a numeric metric from a quarterly period's income statement.
 * Returns null when the value is absent or non-finite.
 *
 * EPS is handled with a diluted-then-basic fallback because some smaller
 * companies only report basic EPS in their Polygon data.
 */
function extractQuarterlyMetric(
  period: PolygonFinancialPeriod,
  metric: 'revenues' | 'operating_income_loss' | 'eps' | 'diluted_average_shares'
): number | null {
  const is = period.financials.income_statement;

  switch (metric) {
    case 'revenues':
      return safeValue(is.revenues);

    case 'operating_income_loss':
      return safeValue(is.operating_income_loss);

    case 'eps': {
      // Prefer diluted; fall back to basic when diluted is missing
      const diluted = safeValue(is.diluted_earnings_per_share);
      if (diluted !== null) return diluted;
      return safeValue(is.basic_earnings_per_share);
    }

    case 'diluted_average_shares':
      return safeValue(is.diluted_average_shares);
  }
}

/**
 * Sums a metric across the 4 most-recent valid quarterly periods.
 *
 * Algorithm:
 * 1. Filter to periods that pass isValidQuarterlyPeriod().
 * 2. Sort by end_date descending (newest first).
 * 3. De-duplicate on (fiscal_year, fiscal_period, end_date) — Polygon
 *    occasionally emits restated filings alongside originals.
 * 4. Take the first 4 unique quarters and sum the chosen metric.
 * 5. If any quarter is missing the metric, return null (partial TTM is
 *    worse than no TTM — callers degrade gracefully on null).
 *
 * @returns The trailing-twelve-month sum, or null if < 4 quarters available
 *          or any quarter is missing the requested metric.
 */
function computeTtmSum(
  periods: PolygonFinancialPeriod[],
  metric: 'revenues' | 'operating_income_loss' | 'eps'
): number | null {
  // Filter to genuine standalone quarters and sort newest-first
  const quarters = periods
    .filter(isValidQuarterlyPeriod)
    .sort((a, b) => {
      const aMs = new Date(`${a.end_date}T00:00:00.000Z`).getTime();
      const bMs = new Date(`${b.end_date}T00:00:00.000Z`).getTime();
      return bMs - aMs; // descending: newest first
    });

  // De-duplicate restated filings using (fiscal_year, fiscal_period, end_date)
  const seen = new Set<string>();
  const unique: PolygonFinancialPeriod[] = [];

  for (const q of quarters) {
    const key = `${q.fiscal_year}-${q.fiscal_period}-${q.end_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
    if (unique.length === 4) break;
  }

  // Need exactly 4 quarters for a full TTM
  if (unique.length < 4) return null;

  // Sanity check: 4 independent quarters should span 270–430 calendar days
  const newestMs = new Date(`${unique[0].end_date}T00:00:00.000Z`).getTime();
  const oldestMs = new Date(`${unique[3].end_date}T00:00:00.000Z`).getTime();
  const spanDays = (newestMs - oldestMs) / 86_400_000;
  if (!Number.isFinite(spanDays) || spanDays > 430) {
    // Span is implausibly wide — something is off with the data; bail out
    return null;
  }

  // Sum the metric across all 4 quarters; null-out if any quarter is missing it
  let total = 0;
  for (const q of unique) {
    const val = extractQuarterlyMetric(q, metric);
    if (val === null) return null; // partial TTM is unreliable
    total += val;
  }

  return total;
}

// ---------------------------------------------------------------------------
// YoY revenue growth (from annual filings)
// ---------------------------------------------------------------------------

/**
 * Computes year-over-year revenue growth from the two most-recent annual
 * periods returned by Polygon.
 *
 * Formula: (FY0.revenue − FY1.revenue) / |FY1.revenue| × 100
 *
 * Returns null when fewer than 2 annual periods are available or when the
 * prior-year revenue is zero (avoid division-by-zero).
 */
function computeRevenueGrowthYoY(annualPeriods: PolygonFinancialPeriod[]): number | null {
  // Filter to genuine annual filings and sort newest-first
  const annuals = annualPeriods
    .filter((p) => p.fiscal_period?.toUpperCase() === 'FY')
    .sort((a, b) => {
      const aMs = new Date(`${a.end_date}T00:00:00.000Z`).getTime();
      const bMs = new Date(`${b.end_date}T00:00:00.000Z`).getTime();
      return bMs - aMs; // descending
    });

  if (annuals.length < 2) return null;

  const currentRevenue = safeValue(annuals[0].financials.income_statement.revenues);
  const priorRevenue   = safeValue(annuals[1].financials.income_statement.revenues);

  if (currentRevenue === null || priorRevenue === null || priorRevenue === 0) {
    return null;
  }

  return ((currentRevenue - priorRevenue) / Math.abs(priorRevenue)) * 100;
}

// ---------------------------------------------------------------------------
// asOf date helper
// ---------------------------------------------------------------------------

/**
 * Returns the ISO timestamp of the most-recent quarterly period's end date,
 * which represents how fresh the TTM fundamentals are.
 * Falls back to null if no valid quarterly periods exist.
 */
function getMostRecentEndDate(quarterlyPeriods: PolygonFinancialPeriod[]): string | null {
  const validQuarters = quarterlyPeriods.filter(isValidQuarterlyPeriod);
  if (validQuarters.length === 0) return null;

  // Already sorted newest-first during TTM computation; find the max manually
  // here so this function is self-contained and order-independent.
  let latestMs = -Infinity;
  for (const q of validQuarters) {
    const ms = new Date(`${q.end_date}T00:00:00.000Z`).getTime();
    if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
  }

  return latestMs === -Infinity ? null : new Date(latestMs).toISOString();
}

// ---------------------------------------------------------------------------
// Core fetch-and-parse logic
// ---------------------------------------------------------------------------

/**
 * Fetches both quarterly (TTM) and annual (YoY) data from Polygon in two
 * concurrent bulk calls, then assembles a StockFundamentals object.
 *
 * The two calls are fired in parallel with Promise.all to minimise latency.
 * Each call is still funnelled through polygonRateLimitedFetch, which queues
 * them 12 seconds apart to respect the free-tier 5 req/min cap.
 *
 * Fields left null (computed downstream in dataCache.ts):
 * • marketCap — requires latestPrice × sharesOutstanding
 * • peTtm     — requires latestPrice / epsTtm
 * • ps        — requires marketCap / revenueTtm
 *
 * @param ticker - Uppercase ticker symbol
 */
async function fetchAndParseFundamentals(ticker: string): Promise<StockFundamentals> {
  // Fire both bulk API calls in parallel — Polygon rate limiter will queue
  // them internally if necessary.
  const [quarterlyPeriods, annualPeriods] = await Promise.all([
    fetchFinancialPeriods(ticker, 'quarterly', QUARTERLY_LIMIT),
    fetchFinancialPeriods(ticker, 'annual', ANNUAL_LIMIT)
  ]);

  // ── TTM figures (sum of last 4 standalone quarters) ──────────────────────

  const revenueTtm        = computeTtmSum(quarterlyPeriods, 'revenues');
  const operatingIncomeTtm = computeTtmSum(quarterlyPeriods, 'operating_income_loss');
  const epsTtm            = computeTtmSum(quarterlyPeriods, 'eps');

  // ── Operating margin ─────────────────────────────────────────────────────

  // Expressed as a percentage (e.g. 29.5 means 29.5 %).
  // Null when either TTM figure is missing or revenue is zero.
  const operatingMargin =
    revenueTtm !== null && operatingIncomeTtm !== null && revenueTtm !== 0
      ? (operatingIncomeTtm / revenueTtm) * 100
      : null;

  // ── Revenue growth YoY ────────────────────────────────────────────────────

  const revenueGrowthYoY = computeRevenueGrowthYoY(annualPeriods);

  // ── Shares outstanding ────────────────────────────────────────────────────

  // Use the most-recent quarter's diluted_average_shares as a proxy for
  // current shares outstanding.  dataCache.ts multiplies this by latestPrice
  // to derive marketCap and P/S — same pattern as the SEC provider.
  const validQuarters = quarterlyPeriods
    .filter(isValidQuarterlyPeriod)
    .sort((a, b) => {
      const aMs = new Date(`${a.end_date}T00:00:00.000Z`).getTime();
      const bMs = new Date(`${b.end_date}T00:00:00.000Z`).getTime();
      return bMs - aMs;
    });

  const sharesOutstanding =
    validQuarters.length > 0
      ? extractQuarterlyMetric(validQuarters[0], 'diluted_average_shares')
      : null;

  // ── asOf ──────────────────────────────────────────────────────────────────

  const asOf = getMostRecentEndDate(quarterlyPeriods);

  return {
    ticker,
    // Derived price-based fields — left null; dataCache.ts computes them
    // from (latestPrice, sharesOutstanding) after this provider returns.
    marketCap: null,
    peTtm: null,
    ps: null,
    // Core fundamentals from the Polygon Financials API
    epsTtm,
    revenueTtm,
    revenueGrowthYoY,
    operatingMargin,
    asOf,
    /** Diluted average shares from most-recent quarter — used by dataCache.ts. */
    sharesOutstanding
  };
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

/**
 * PolygonFundamentalsDataProvider
 *
 * Drop-in replacement for SecFundamentalsDataProvider that uses the
 * Polygon.io Financials API instead of SEC EDGAR.
 *
 * Implements FundamentalsDataProvider so it can be swapped in via index.ts
 * without any changes to callers (dataCache.ts, API routes, etc.).
 *
 * Thread-safety / Next.js edge notes:
 * • The module-level Maps (fundamentalsCache, fundamentalsInFlight) are
 *   process-level singletons in Node.js.  In Vercel's serverless model each
 *   function instance is isolated, so the cache is local to that instance.
 * • forceRefresh=true bypasses the cache for the cron / manual-refresh flows.
 */
export class PolygonFundamentalsDataProvider implements FundamentalsDataProvider {
  async getFundamentals(tickerInput: string, options?: RequestOptions): Promise<StockFundamentals> {
    const ticker = normalizeTicker(tickerInput);

    // ── Browser: proxy through the Next.js API route ──────────────────────
    // The API key must never appear in client-side bundles.
    if (isBrowser()) {
      return fetchJson<StockFundamentals>(
        `/api/fundamentals?ticker=${encodeURIComponent(ticker)}${options?.forceRefresh ? '&refresh=1' : ''}`
      );
    }

    // ── Server: check the 24-hour in-memory cache ─────────────────────────

    if (!options?.forceRefresh) {
      const cached = fundamentalsCache.get(ticker);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value; // cache hit
      }

      // If another concurrent call is already fetching this ticker, join it
      // instead of issuing a duplicate API request.
      const inFlight = fundamentalsInFlight.get(ticker);
      if (inFlight) {
        return inFlight;
      }
    }

    // ── Server: fetch from Polygon (two bulk calls) ───────────────────────

    const request = (async () => {
      const fundamentals = await fetchAndParseFundamentals(ticker);

      // Populate cache — future calls within the TTL window skip the API
      fundamentalsCache.set(ticker, {
        value: fundamentals,
        expiresAt: Date.now() + FUNDAMENTALS_TTL_MS
      });

      return fundamentals;
    })();

    // Register as in-flight so concurrent callers can join
    fundamentalsInFlight.set(ticker, request);

    try {
      return await request;
    } finally {
      // Always clean up the in-flight entry regardless of success or failure
      fundamentalsInFlight.delete(ticker);
    }
  }
}
