/**
 * src/universe/top50MarketCap.ts
 *
 * M5.3 backward-compatibility shim.
 *
 * The canonical universe data now lives in tickerUniverse.ts.
 * This file re-exports the same shape (`top50MarketCap.tickers`) so any code
 * that still imports from here continues to compile unchanged.
 * New code should import getTopNMarketCap / getUniverseSize from tickerUniverse.ts.
 */

import { getTopNMarketCap, TICKER_UNIVERSE } from './tickerUniverse';

export const asOf = '2026-02-17';
export const source = 'CompaniesMarketCap (updated daily)';

/** @deprecated Use getTopNMarketCap(n) from tickerUniverse.ts instead. */
export const tickers = getTopNMarketCap(Math.min(51, TICKER_UNIVERSE.length));

/** @deprecated Use getTopNMarketCap(n) from tickerUniverse.ts instead. */
export const top50MarketCap = { tickers, asOf, source };
