/**
 * src/universe/top50MarketCap.ts
 *
 * Defines the curated "universe" of stocks that Stock Scout tracks.
 *
 * This is the Top 50 U.S. equities by market capitalisation as of the date below.
 * All 50 tickers are fetched, scored, and stored in the server-side cache at
 * every preload.  The rankings page shows this full set.
 *
 * To update the universe:
 *   1. Edit the `tickers` array below.
 *   2. Update TICKER_SECTOR_MAP in src/lib/valueScore.ts for any new tickers.
 *   3. Run `npm run seed:sec` to regenerate data/sec_cik_map.json.
 *   4. Restart the server (or trigger a manual refresh) to pick up the changes.
 *
 * `as const` ensures TypeScript treats each element as a literal string type,
 * enabling exhaustive checks in TICKER_SECTOR_MAP.
 */

export const tickers = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'META',
  'BRK.B',
  'TSM',
  'TSLA',
  'LLY',
  'AVGO',
  'WMT',
  'JPM',
  'V',
  'XOM',
  'MA',
  'UNH',
  'ORCL',
  'COST',
  'PG',
  'JNJ',
  'HD',
  'BAC',
  'ABBV',
  'KO',
  'MRK',
  'NFLX',
  'CRM',
  'CVX',
  'AMD',
  'ASML',
  'SAP',
  'PEP',
  'ADBE',
  'TMUS',
  'MCD',
  'NVO',
  'CSCO',
  'AZN',
  'ACN',
  'LIN',
  'DIS',
  'ABT',
  'WFC',
  'INTU',
  'TXN',
  'DHR',
  'CMCSA',
  'QCOM',
  'PM'
] as const;

export const asOf = '2026-02-17';
export const source = 'CompaniesMarketCap (updated daily)';

export const top50MarketCap = {
  tickers,
  asOf,
  source
};
