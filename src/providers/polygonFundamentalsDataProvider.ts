/**
 * src/providers/polygonFundamentalsDataProvider.ts
 *
 * Polygon.io Financials API implementation of FundamentalsDataProvider.
 *
 * Architecture
 * ─────────────
 * • Calls GET /vX/reference/financials?ticker=X&timeframe=quarterly&limit=5
 * • Sums the four most-recent standalone quarterly periods to get TTM figures
 *   for revenue, operating income, and diluted EPS.
 * • Returns the same StockFundamentals shape as SecFundamentalsDataProvider so
 *   either provider can be swapped in via FUNDAMENTALS_PROVIDER with zero changes
 *   to call sites.
 * • Per-ticker in-memory cache with a 24-hour TTL (matching SEC provider).
 * • Browser requests are proxied through /api/fundamentals (same as SEC provider).
 *
 * Env vars required
 * ─────────────────
 * POLYGON_API_KEY — your Polygon.io key (free tier works for reference data).
 *
 * NOTE: This is the M7.2 stub wiring layer.  M7.1 will extend it with:
 *   - revenueGrowthYoY  (annual comparison via a second financials call)
 *   - sharesOutstanding (from the balance_sheet sub-object)
 *   - Polygon company name (eliminating the need for sec_cik_map.json)
 */

import { FundamentalsDataProvider, RequestOptions, StockFundamentals } from './types';

const POLYGON_FINANCIALS_BASE = 'https://api.polygon.io/vX/reference/financials';
const FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — match SEC provider TTL

// ---------------------------------------------------------------------------
// Polygon /vX/reference/financials response types
// ---------------------------------------------------------------------------

type PolygonFinancialValue = {
  value: number;
  unit?: string;
  label?: string;
};

type PolygonIncomeStatement = {
  revenues?: PolygonFinancialValue;
  operating_income_loss?: PolygonFinancialValue;
  diluted_earnings_per_share?: PolygonFinancialValue;
  basic_earnings_per_share?: PolygonFinancialValue;
};

type PolygonFilingResult = {
  ticker: string;
  period_of_report_date?: string;  // YYYY-MM-DD
  fiscal_year?: string;
  fiscal_period?: string;           // "Q1" | "Q2" | "Q3" | "Q4" | "FY" | "TTM"
  financials?: {
    income_statement?: PolygonIncomeStatement;
  };
};

type PolygonFinancialsResponse = {
  status?: string;
  results?: PolygonFilingResult[];
  next_url?: string;
};

// ---------------------------------------------------------------------------
// In-memory cache — mirrors SecFundamentalsDataProvider pattern
// ---------------------------------------------------------------------------

type CacheEntry = {
  expiresAt: number;
  value: StockFundamentals;
};

const fundamentalsCache = new Map<string, CacheEntry>();
const fundamentalsInFlight = new Map<string, Promise<StockFundamentals>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPolygonApiKey(): string {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) throw new Error('Missing POLYGON_API_KEY environment variable.');
  return key;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function normalizeTicker(input: string): string {
  const ticker = input.trim().toUpperCase();
  if (!ticker) throw new Error('Please provide a ticker symbol.');
  return ticker;
}

/** Proxy fetch used by the browser-side path (same pattern as SEC provider). */
async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'GET', cache: 'no-store' });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status}).`);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// TTM calculation helpers
// ---------------------------------------------------------------------------

/**
 * Returns the four most-recent standalone quarterly filings from a results
 * array, sorted newest-first.  Filters to fp values Q1–Q4 only; FY/TTM
 * periods are excluded so we never double-count.
 */
function latestFourQuarters(results: PolygonFilingResult[]): PolygonFilingResult[] {
  return results
    .filter((r) => /^Q[1-4]$/i.test(r.fiscal_period ?? ''))
    .sort((a, b) => {
      // Sort descending by period_of_report_date so [0] is the most recent.
      const aDate = a.period_of_report_date ?? '';
      const bDate = b.period_of_report_date ?? '';
      return bDate.localeCompare(aDate);
    })
    .slice(0, 4);
}

/**
 * Sums a specific income-statement field across the provided quarterly
 * periods.  Returns null if any of the four values are missing or non-finite.
 */
function sumQuarterly(
  quarters: PolygonFilingResult[],
  field: keyof PolygonIncomeStatement
): number | null {
  if (quarters.length < 4) return null;

  let sum = 0;
  for (const q of quarters) {
    const raw = q.financials?.income_statement?.[field]?.value;
    if (raw == null || !Number.isFinite(raw)) return null;
    sum += raw;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Core fetch + computation
// ---------------------------------------------------------------------------

async function fetchPolygonFinancials(ticker: string): Promise<PolygonFilingResult[]> {
  const apiKey = getPolygonApiKey();
  // Fetch the 5 most-recent quarterly periods (one extra in case the newest is
  // partial/TTM and needs to be dropped by the quarterly filter).
  const url =
    `${POLYGON_FINANCIALS_BASE}` +
    `?ticker=${encodeURIComponent(ticker)}&timeframe=quarterly&limit=5&apiKey=${apiKey}`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      `Polygon financials fetch failed for ${ticker} (${response.status}).`
    );
  }

  const payload = (await response.json()) as PolygonFinancialsResponse;
  if (!payload.results?.length) return [];
  return payload.results;
}

async function computeFundamentals(ticker: string): Promise<StockFundamentals> {
  const allResults = await fetchPolygonFinancials(ticker);

  // No data — return null fundamentals so the ticker still appears in rankings.
  if (!allResults.length) {
    return nullFundamentals(ticker);
  }

  const quarters = latestFourQuarters(allResults);

  // TTM aggregates
  const revenueTtm = sumQuarterly(quarters, 'revenues');
  const opIncomeTtm = sumQuarterly(quarters, 'operating_income_loss');
  const epsTtm =
    sumQuarterly(quarters, 'diluted_earnings_per_share') ??
    sumQuarterly(quarters, 'basic_earnings_per_share');

  // Operating margin — only when both revenue and operating income are known.
  const operatingMargin =
    revenueTtm !== null && opIncomeTtm !== null && revenueTtm !== 0
      ? (opIncomeTtm / revenueTtm) * 100
      : null;

  // Use the most-recent period's report date as the fundamentals timestamp.
  const latestDate =
    quarters[0]?.period_of_report_date ??
    allResults[0]?.period_of_report_date ??
    null;

  // NOTE: revenueGrowthYoY and sharesOutstanding require additional API calls
  // or the annual timeframe endpoint — these are wired up fully in M7.1.
  return {
    ticker,
    marketCap: null,          // computed downstream in dataCache (price × shares)
    peTtm: null,              // computed downstream in dataCache (price / epsTtm)
    ps: null,                 // computed downstream in dataCache (marketCap / revenue)
    epsTtm,
    revenueTtm,
    revenueGrowthYoY: null,   // TODO M7.1: annual-over-annual comparison
    operatingMargin,
    sharesOutstanding: null,  // TODO M7.1: from balance_sheet.common_stock_shares_outstanding
    asOf: latestDate ? `${latestDate}T00:00:00.000Z` : null
  };
}

/** Convenience — a fully-null StockFundamentals for error/no-data paths. */
function nullFundamentals(ticker: string): StockFundamentals {
  return {
    ticker,
    marketCap: null,
    peTtm: null,
    ps: null,
    epsTtm: null,
    revenueTtm: null,
    revenueGrowthYoY: null,
    operatingMargin: null,
    asOf: null
  };
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

export class PolygonFundamentalsDataProvider implements FundamentalsDataProvider {
  /**
   * Returns TTM fundamentals for `tickerInput` via the Polygon Financials API.
   *
   * Cache strategy (server-side):
   * 1. Return a cached result if it hasn't expired (24 h TTL).
   * 2. Coalesce concurrent requests for the same ticker into a single in-flight
   *    promise — no stampede even under parallel preload calls.
   * 3. Cache the result on success; propagate errors on failure.
   */
  async getFundamentals(tickerInput: string, options?: RequestOptions): Promise<StockFundamentals> {
    const ticker = normalizeTicker(tickerInput);

    // Browser path — proxy through Next.js API route (avoids CORS + key exposure).
    if (isBrowser()) {
      return fetchJson<StockFundamentals>(
        `/api/fundamentals?ticker=${encodeURIComponent(ticker)}${options?.forceRefresh ? '&refresh=1' : ''}`
      );
    }

    // Server path — check in-memory cache first.
    if (!options?.forceRefresh) {
      const cached = fundamentalsCache.get(ticker);
      if (cached && cached.expiresAt > Date.now()) return cached.value;

      const inFlight = fundamentalsInFlight.get(ticker);
      if (inFlight) return inFlight;
    }

    const request = computeFundamentals(ticker).then((value) => {
      fundamentalsCache.set(ticker, {
        value,
        expiresAt: Date.now() + FUNDAMENTALS_TTL_MS
      });
      return value;
    });

    fundamentalsInFlight.set(ticker, request);
    try {
      return await request;
    } finally {
      fundamentalsInFlight.delete(ticker);
    }
  }
}
