/**
 * src/providers/types.ts
 *
 * Shared interfaces and data shapes for all data providers.
 *
 * The app has two provider slots:
 *   - StockDataProvider      — prices and historical price series
 *   - FundamentalsDataProvider — financial fundamentals (EPS, revenue, margins, etc.)
 *
 * Two concrete implementations exist for each slot:
 *   - Mock:  deterministic seeded data for local development (no API keys needed)
 *   - Real:  live data from Polygon.io (prices) and SEC EDGAR (fundamentals)
 *
 * The active implementation is selected at module init time via DATA_MODE env var
 * (see src/providers/index.ts).
 */

/** Supported historical price window lengths. Used by charts and the history API. */
export type PriceRange = '1M' | '6M' | '1Y';

/** Options passed through to provider methods to bypass in-flight deduplication or caches. */
export type RequestOptions = {
  /** When true, bypass any in-memory or file-system cache and fetch fresh data. */
  forceRefresh?: boolean;
};

/** A single real-time (or previous-close) price for one ticker. */
export type StockQuote = {
  ticker: string;
  /** Price in USD. */
  price: number;
  /** ISO timestamp of the data point. */
  updatedAt: string;
};

/** One daily closing price data point for use in historical charts. */
export type HistoricalPoint = {
  /** ISO date string (YYYY-MM-DD or ISO timestamp). */
  date: string;
  /** Adjusted closing price in USD. */
  price: number;
};

/**
 * Raw fundamentals data for one ticker as returned by a FundamentalsDataProvider.
 * Note: marketCap, peTtm, and ps are NOT populated here — they require the
 * latest price, which is fetched separately. The dataCache combines both sources.
 */
export type StockFundamentals = {
  ticker: string;
  /** Always null from providers — computed in dataCache using latestPrice × sharesOutstanding. */
  marketCap: number | null;
  /** Always null from providers — computed in dataCache using latestPrice / epsTtm. */
  peTtm: number | null;
  /** Always null from providers — computed in dataCache using marketCap / revenueTtm. */
  ps: number | null;
  /** Diluted earnings per share (TTM) in USD from SEC filings. */
  epsTtm: number | null;
  /** Total revenue trailing twelve months in USD from SEC filings. */
  revenueTtm: number | null;
  /** Revenue year-over-year growth in percentage points (most recent FY vs prior FY). */
  revenueGrowthYoY: number | null;
  /** Operating margin as a percentage (operatingIncome / revenue × 100). */
  operatingMargin: number | null;
  /** ISO timestamp of the most recent underlying data point. */
  asOf: string | null;
  /** Shares outstanding from SEC EDGAR; used server-side to compute P/S. Not rendered in UI. */
  sharesOutstanding?: number | null;
};

/** Contract for fetching stock price quotes and historical price series. */
export interface StockDataProvider {
  /** Fetch the latest (or previous-close) price for a ticker. */
  getLatestQuote(ticker: string, options?: RequestOptions): Promise<StockQuote>;
  /** Fetch daily closing prices for a ticker over the requested range. */
  getHistoricalPrices(ticker: string, range: PriceRange, options?: RequestOptions): Promise<HistoricalPoint[]>;
}

/** Contract for fetching financial fundamentals for a ticker. */
export interface FundamentalsDataProvider {
  /** Fetch SEC fundamentals (EPS, revenue, margins) for a ticker. */
  getFundamentals(ticker: string, options?: RequestOptions): Promise<StockFundamentals>;
}
