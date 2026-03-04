/**
 * src/providers/index.ts
 *
 * Provider factory — selects the correct implementation for each provider slot
 * based on the DATA_MODE environment variable.
 *
 *   DATA_MODE=mock  (default)
 *     StockDataProvider      → MockStockDataProvider
 *       Generates deterministic seeded prices; no API keys required.
 *     FundamentalsDataProvider → CachedMockFundamentalsDataProvider
 *       Returns realistic static fundamentals; no API keys required.
 *
 *   DATA_MODE=real
 *     StockDataProvider      → PolygonStockDataProvider
 *       Fetches live quotes and history from Polygon.io (requires POLYGON_API_KEY).
 *     FundamentalsDataProvider → SecFundamentalsDataProvider
 *       Fetches company facts from SEC EDGAR (requires SEC_USER_AGENT).
 *
 * Providers are instantiated once at module load time (singletons), so caches
 * and in-flight deduplication inside each provider are shared across all callers.
 *
 * NEXT_PUBLIC_DATA_MODE is the client-visible copy of the same flag (required
 * for Next.js to include it in the browser bundle).  Both must match.
 */

import { CachedMockFundamentalsDataProvider } from './cachedMockFundamentalsDataProvider';
import { MockStockDataProvider } from './mockStockDataProvider';
import { PolygonStockDataProvider } from './polygonStockDataProvider';
import { FundamentalsDataProvider, StockDataProvider } from './types';
import { SecFundamentalsDataProvider } from './secFundamentalsDataProvider';

// Prefer NEXT_PUBLIC_DATA_MODE (visible to browser), fall back to server-only DATA_MODE.
const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? process.env.DATA_MODE ?? 'mock').toLowerCase();

// Singleton provider instances — shared across all API routes and pages.
const stockProvider: StockDataProvider = dataMode === 'real' ? new PolygonStockDataProvider() : new MockStockDataProvider();

const fundamentalsProvider: FundamentalsDataProvider =
  dataMode === 'real' ? new SecFundamentalsDataProvider() : new CachedMockFundamentalsDataProvider();

/** Returns the active stock price provider (Polygon or mock). */
export function getStockDataProvider(): StockDataProvider {
  return stockProvider;
}

/** Returns the active fundamentals provider (SEC EDGAR or mock). */
export function getFundamentalsDataProvider(): FundamentalsDataProvider {
  return fundamentalsProvider;
}
