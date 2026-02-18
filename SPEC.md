# Stock Scout

## Goal
A web app that tracks stock price performance and identifies potentially undervalued buys using fundamentals and price history.

## Current Implementation Focus

### Universe
- Default universe is **Top 50 U.S. stocks by market cap**.
- Source metadata is maintained in `src/universe/top50MarketCap.ts`:
  - `tickers`
  - `asOf` (currently `2026-02-17`)
  - `source` (`CompaniesMarketCap (updated daily)`)

### Market data flow
- Initial Home load fetches only `GET /api/market/universe-quotes`.
- `/api/market/universe-quotes` fetches and caches quotes for only the Top 50 universe.
- Universe quote cache:
  - key: ticker -> `{ price, asOf, source }`
  - TTL: 5–15 minutes (implemented: 10 minutes)
  - concurrent refresh requests are coalesced.

### Alpha Vantage constraints
- Daily time series is per symbol; full daily history is fetched on-demand per ticker.
- History cache stores full daily series per ticker and slices in memory for 1M/6M/1Y.
- Range changes do not trigger new upstream calls while cache is valid.
- For many-ticker current prices, app attempts Alpha Vantage batch quotes first, then fallback quotes for missing symbols.

### Fundamentals (SEC)
- Uses `SecFundamentalsDataProvider`.
- Fundamentals are fetched on-demand per ticker/company facts and cached for 24h.
- Ticker-to-CIK mapping is cached in-memory.
- SEC requests require `SEC_USER_AGENT`.

### Portfolio (local)
- “Buy” action stores trades with:
  - `{ ticker, shares, priceAtBuy, date, valueScoreAtBuy }`
- Primary storage: `/data/portfolio.json` when filesystem is available.
- Fallback storage: browser `localStorage`.
- Portfolio page computes current value using cached universe quotes.

## Environment Variables
- `DATA_MODE=mock|real`
- `NEXT_PUBLIC_DATA_MODE=mock|real`
- `ALPHAVANTAGE_API_KEY` (required for real market data)
- `SEC_USER_AGENT` (required for SEC company facts)
