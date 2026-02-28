/**
 * src/types/index.ts
 *
 * Single source of truth for all shared data model types.
 * Used by the cache, API routes, pages, and components.
 * No field is ever omitted — missing values are explicitly null.
 */

// ---------------------------------------------------------------------------
// M5.4 – Score weights (max points each component can contribute)
// ---------------------------------------------------------------------------

/**
 * Maximum point contribution for each Value Score component.
 * v1 default: equal 25 pts each (sum = 100).
 * v2 default: quality-tilted 20/20/30/30 (sum = 100).
 */
export type ScoreWeights = {
  pe: number;
  ps: number;
  growth: number;
  margin: number;
};

// ---------------------------------------------------------------------------
// Value Score breakdown — one sub-score per component
// ---------------------------------------------------------------------------

export type ValueScoreBreakdown = {
  /**
   * P/E component. Upper bound = ScoreWeights.pe (25 in v1, 20 in v2).
   * Lower P/E → higher score. 0 if P/E ≤ 0 or unavailable.
   * In v2, the raw P/E is first sector-adjusted before scoring.
   */
  peScore: number;
  /**
   * P/S component. Upper bound = ScoreWeights.ps (25 in v1, 20 in v2).
   * Lower P/S → higher score. 0 if unavailable.
   */
  psScore: number;
  /**
   * Revenue YoY growth component. Upper bound = ScoreWeights.growth (25 in v1, 30 in v2).
   * Higher growth → higher score.
   */
  revenueGrowthScore: number;
  /**
   * Operating margin component. Upper bound = ScoreWeights.margin (25 in v1, 30 in v2).
   * Higher margin → higher score.
   * In v2, the raw margin is first sector-adjusted before scoring.
   */
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
  /** Breakdown of the four sub-scores (upper bound per component = scoreWeights.X). */
  scoreBreakdown: ValueScoreBreakdown;
  /** M5.4 – Scoring formula version used. "v1" = equal weights, no sector adjustment (default). */
  scoreVersion: 'v1' | 'v2';
  /**
   * M5.4 – Max point contribution for each component.
   * Stamped at enrichment time so the UI always knows the right denominator
   * without importing server-only config.
   */
  scoreWeights: ScoreWeights;

  // --- Sector (M5.4) ---
  /**
   * M5.4 – GICS sector for this ticker, resolved from the hardcoded TICKER_SECTOR_MAP.
   * Null for tickers not in the map. Used by v2 scoring for sector-relative adjustments.
   */
  sector: string | null;

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

// ---------------------------------------------------------------------------
// Portfolio types
// ---------------------------------------------------------------------------

export type PortfolioHolding = {
  ticker: string;
  companyName: string;
  shares: number;
  purchasePrice: number;
  /** ISO date string YYYY-MM-DD */
  purchaseDate: string;
  notes?: string;
};

/** Portfolio holding enriched with current market data for display. */
export type EnrichedPortfolioHolding = PortfolioHolding & {
  currentPrice: number | null;
  currentValue: number | null;
  gainLossDollar: number | null;
  gainLossPercent: number | null;
};
