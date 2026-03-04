/**
 * src/providers/cachedMockFundamentalsDataProvider.ts
 *
 * Caching wrapper around MockFundamentalsDataProvider.
 *
 * Adds two performance optimisations on top of the base mock:
 *   1. In-memory TTL cache (24 hours) — avoids regenerating mock data on
 *      every call to getFundamentals().
 *   2. In-flight deduplication — if two concurrent callers request the same
 *      ticker at the same time, only one mock fetch runs; both share the result.
 *
 * This mirrors the caching pattern used by SecFundamentalsDataProvider (real mode),
 * so the two providers behave identically from the callers' perspective.
 */

import { MockFundamentalsDataProvider } from './mockFundamentalsDataProvider';
import { FundamentalsDataProvider, RequestOptions, StockFundamentals } from './types';

/** How long a cached fundamentals result stays valid (24 hours). */
const FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  value: StockFundamentals;
};

export class CachedMockFundamentalsDataProvider implements FundamentalsDataProvider {
  private readonly baseProvider = new MockFundamentalsDataProvider();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<StockFundamentals>>();

  async getFundamentals(ticker: string, options?: RequestOptions): Promise<StockFundamentals> {
    const normalizedTicker = ticker.trim().toUpperCase();
    const forceRefresh = options?.forceRefresh ?? false;

    if (!forceRefresh) {
      const cached = this.cache.get(normalizedTicker);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }

      const existingRequest = this.inFlight.get(normalizedTicker);
      if (existingRequest) {
        return existingRequest;
      }
    }

    const request = this.baseProvider.getFundamentals(normalizedTicker).then((fundamentals) => {
      this.cache.set(normalizedTicker, {
        value: fundamentals,
        expiresAt: Date.now() + FUNDAMENTALS_TTL_MS
      });
      return fundamentals;
    });

    this.inFlight.set(normalizedTicker, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(normalizedTicker);
    }
  }
}
