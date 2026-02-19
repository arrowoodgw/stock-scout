/**
 * src/types/index.ts
 *
 * Single source of truth for all shared data model types.
 * Used by the cache, API routes, pages, and components.
 * No field is ever omitted — missing values are explicitly null.
 */

// ---------------------------------------------------------------------------
// Value Score breakdown (one sub-score per component, 0–25 each)
// ---------------------------------------------------------------------------

export type ValueScoreBreakdown = {
  /** P/E component (0–25). Lower P/E → higher score. 0 if P/E ≤ 0 or unavailable. */
  peScore: number;
  /** P/S component (0–25). Lower P/S → higher score. 0 if unavailable. */
  psScore: number;
  /** Revenue YoY growth component (0–25). Higher growth → higher score. */
  revenueGrowthScore: number;
  /** Operating margin component (0–25). Higher margin → higher score. */
  operatingMarginScore: number;
};

// ---------------------------------------------------------------------------
// Enriched ticker — the canonical in-cache data model for one ticker
// ---------------------------------------------------------------------------

export type EnrichedTicker = {
  // --- Identity ---
  /** Uppercase ticker symbol, e.g. "AAPL" */
  ticker: string;
  /** Company name from SEC mapping, e.g. "Apple Inc." */
  companyName: string | null;

  // --- Market data ---
  /** Latest price in USD from Polygon (previous close). Null if unavailable. */
  latestPrice: number | null;
  /** Market capitalisation in USD. Null if unavailable. */
  marketCap: number | null;

  // --- Fundamentals (TTM from SEC EDGAR) ---
  /** P/E ratio (TTM) = latestPrice / epsTtm. Null if either is unavailable. */
  peTtm: number | null;
  /** P/S ratio (TTM) = marketCap / revenueTtm. Null if either is unavailable. */
  ps: number | null;
  /** Earnings per share diluted (TTM) in USD. Null if unavailable. */
  epsTtm: number | null;
  /** Revenue (TTM) in USD. Null if unavailable. */
  revenueTtm: number | null;
  /** Revenue year-over-year growth in percentage points. Null if unavailable. */
  revenueGrowthYoY: number | null;
  /** Operating margin in percentage points. Null if unavailable. */
  operatingMargin: number | null;

  // --- Pre-calculated scores (calculated at preload time, never at render) ---
  /** Composite value score 0–100. */
  valueScore: number;
  /** Breakdown of the four sub-scores. */
  scoreBreakdown: ValueScoreBreakdown;

  // --- Metadata ---
  /** ISO timestamp of the most recent fundamental data point, or null. */
  fundamentalsAsOf: string | null;
};

// ---------------------------------------------------------------------------
// Cache state shape returned by /api/preload and /api/rankings
// ---------------------------------------------------------------------------

export type CacheStatus = 'cold' | 'loading' | 'ready' | 'error';

export type DataCachePayload = {
  status: CacheStatus;
  tickers: EnrichedTicker[];
  /** ISO timestamp when the cache was last fully populated. Null if never. */
  lastUpdated: string | null;
  /** Error message if status === 'error'. */
  error?: string;
};
