# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows, deterministic ranking, and simple portfolio simulation concepts.

This repository implements M3 with a **Top 50 U.S. stocks by market cap universe** and a **real-data mode**.

## Universe Definition

- Universe: **Top 50 U.S. stocks by market cap**
- As of: **2026-02-17**
- Source: **CompaniesMarketCap (updated daily)**

Defined in `src/universe/top50MarketCap.ts`.

## Current Functionality

- **Home** page
  - Initial load performs one browser request to `GET /api/market/universe-quotes`
  - Shows Top picks from cached universe quotes
- **Ticker Detail** page
  - 1M / 6M / 1Y chart
  - Latest price derived from the cached/on-demand history response (no separate quote call)
  - Fundamentals panel + deterministic Value Score
  - **Refresh data** button bypasses cache
  - **Buy** action records local trades
- **Rankings** page
  - Uses Top 50 universe and cached universe quotes
- **Backtest Lite** page
  - Runs over the Top 50 universe
- **Portfolio** page
  - Reads trades from `/data/portfolio.json` when filesystem is available
  - Falls back to browser `localStorage` when filesystem writes are unavailable
  - Uses cached universe quotes for current value

## Real Mode Environment Variables

Use `.env.local`:

```bash
DATA_MODE=real
NEXT_PUBLIC_DATA_MODE=real
ALPHAVANTAGE_API_KEY=your_key_here
SEC_USER_AGENT="YourName your@email.com"
```

- `ALPHAVANTAGE_API_KEY`: required for real market data
- `DATA_MODE`: server mode (`mock | real`)
- `NEXT_PUBLIC_DATA_MODE`: client mode (`mock | real`)
- `SEC_USER_AGENT`: required for SEC company facts requests

## Caching + Refresh Behavior

- **Universe quotes cache** (`/api/market/universe-quotes`)
  - key: ticker -> `{ price, asOf, source }`
  - TTL: ~10 minutes
  - concurrent refreshes are coalesced to one in-flight request
- **History cache** (Alpha Vantage daily series)
  - full daily series cached per ticker
  - TTL: ~12 hours
  - range selection (1M/6M/1Y) slices in memory, without a new Alpha Vantage fetch
- **Fundamentals cache** (SEC company facts)
  - ticker -> CIK mapping cached in-memory
  - fundamentals cached for 24 hours
  - fetched on demand only (e.g., ticker detail / explicit page load)
- **Refresh buttons**
  - Ticker Detail `Refresh data` sends `refresh=1` and bypasses caches

## Rate Limits and Safety Notes

- Alpha Vantage free tiers are rate-limited; caching and de-duplication reduce fan-out.
- Universe quote fetch attempts the Alpha Vantage batch quote endpoint first; missing tickers fall back to per-symbol quote requests.
- SEC APIs require a descriptive `User-Agent`; set `SEC_USER_AGENT`.

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Disclaimer

Educational and exploratory use only. Not investment advice.
