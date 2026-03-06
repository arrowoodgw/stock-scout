/**
 * src/providers/index.ts
 *
 * Provider factory — central place that reads env vars and hands back the
 * correct provider implementations.  All other modules import from here;
 * none of them instantiate providers directly.
 *
 * Stock provider selection (DATA_MODE)
 * ─────────────────────────────────────
 * DATA_MODE=real   → PolygonStockDataProvider  (live Polygon quotes + history)
 * DATA_MODE=mock   → MockStockDataProvider      (deterministic seeded data)
 *
 * Fundamentals provider selection (DATA_MODE + FUNDAMENTALS_PROVIDER)
 * ─────────────────────────────────────────────────────────────────────
 * In mock mode the fundamentals provider is always CachedMockFundamentalsDataProvider
 * regardless of FUNDAMENTALS_PROVIDER (no API keys needed in development).
 *
 * In real mode FUNDAMENTALS_PROVIDER chooses the backend:
 *   FUNDAMENTALS_PROVIDER=polygon  → PolygonFundamentalsDataProvider  (default)
 *   FUNDAMENTALS_PROVIDER=sec      → SecFundamentalsDataProvider       (legacy)
 *
 * Switching providers at runtime requires restarting the server (env vars are
 * read once at module-load time and the singleton is reused for the process
 * lifetime).
 */

import { CachedMockFundamentalsDataProvider } from './cachedMockFundamentalsDataProvider';
import { MockStockDataProvider } from './mockStockDataProvider';
import { PolygonFundamentalsDataProvider } from './polygonFundamentalsDataProvider';
import { PolygonStockDataProvider } from './polygonStockDataProvider';
import { SecFundamentalsDataProvider } from './secFundamentalsDataProvider';
import { FundamentalsDataProvider, StockDataProvider } from './types';

// ---------------------------------------------------------------------------
// Read env vars once at startup
// ---------------------------------------------------------------------------

/** "real" or anything else (treated as mock). */
const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? process.env.DATA_MODE ?? 'mock').toLowerCase();

/**
 * Active fundamentals backend when DATA_MODE=real.
 *   "polygon" → Polygon.io /vX/reference/financials  (default)
 *   "sec"     → SEC EDGAR  /api/xbrl/companyfacts    (legacy, backward-compat)
 */
const fundamentalsProviderKey = (process.env.FUNDAMENTALS_PROVIDER ?? 'polygon').toLowerCase();

// ---------------------------------------------------------------------------
// Singleton provider instances — one per process lifetime
// ---------------------------------------------------------------------------

const stockProvider: StockDataProvider =
  dataMode === 'real' ? new PolygonStockDataProvider() : new MockStockDataProvider();

function buildFundamentalsProvider(): FundamentalsDataProvider {
  // Mock mode: always use the cached mock — no API keys required.
  if (dataMode !== 'real') {
    return new CachedMockFundamentalsDataProvider();
  }

  // Real mode: pick the backend specified by FUNDAMENTALS_PROVIDER.
  if (fundamentalsProviderKey === 'sec') {
    return new SecFundamentalsDataProvider();
  }

  // Default: Polygon.io
  return new PolygonFundamentalsDataProvider();
}

const fundamentalsProvider: FundamentalsDataProvider = buildFundamentalsProvider();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getStockDataProvider(): StockDataProvider {
  return stockProvider;
}

export function getFundamentalsDataProvider(): FundamentalsDataProvider {
  return fundamentalsProvider;
}

/**
 * Human-readable name of the active fundamentals provider.
 * Used by health endpoints and structured preload logs.
 *
 *   mock    — DATA_MODE !== "real"
 *   polygon — DATA_MODE=real, FUNDAMENTALS_PROVIDER=polygon (or unset)
 *   sec     — DATA_MODE=real, FUNDAMENTALS_PROVIDER=sec
 */
export function getFundamentalsProviderName(): 'mock' | 'polygon' | 'sec' {
  if (dataMode !== 'real') return 'mock';
  return fundamentalsProviderKey === 'sec' ? 'sec' : 'polygon';
}
