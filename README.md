# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows, deterministic ranking, and simple portfolio simulation concepts.

This repository now implements **Milestone 3 (M3)** with a **real-data option for single-ticker price data**.

---

## Current Functionality

- **Home** page with “Today's Top Picks” (Top 5 by Value Score)
- **Ticker Detail** page for single-ticker analysis
  - Latest quote + 1M/6M/1Y chart
  - Fundamentals panel + deterministic Value Score
  - **Refresh data** button to bypass cache and force re-fetch
  - Last refreshed timestamp
  - In `real` mode, fundamentals come from SEC EDGAR/XBRL company facts
- **Rankings** page across a default stock universe (still mocked quote data)
- **Backtest Lite** page (mocked) with explicit **Run Backtest** action

---

## Data Modes

Set `DATA_MODE` (server) and/or `NEXT_PUBLIC_DATA_MODE` (client bundle):

- `mock` (default): deterministic mocked stock data
- `real`: stock quote/history use `AlphaVantageStockDataProvider` (daily series) and fundamentals use `SecFundamentalsDataProvider`

Example `.env.local`:

```bash
DATA_MODE=real
NEXT_PUBLIC_DATA_MODE=real
ALPHAVANTAGE_API_KEY=your_key_here
SEC_USER_AGENT="YourName your@email.com"
```

> Do not commit `.env.local` or secrets.

---

## Environment Variables

- `ALPHAVANTAGE_API_KEY`
  - Required when `DATA_MODE=real`
  - Read by `AlphaVantageStockDataProvider` on the server
- `DATA_MODE`
  - Server/provider selector: `mock | real`
- `NEXT_PUBLIC_DATA_MODE`
  - Client-visible provider selector: `mock | real`
- `SEC_USER_AGENT`
  - Required when `DATA_MODE=real` for SEC EDGAR/XBRL requests
  - Example: `"YourName your@email.com"`

---

## Caching, Refresh, and Request De-duplication

When `DATA_MODE=real`, stock quote/history use Alpha Vantage daily time series with a small in-memory cache and in-flight de-duplication:

- Stock data TTL: **~12 minutes**
- Cache key: `ticker + range`
- Fundamentals TTL: **24 hours** (SEC company facts cached in-memory per ticker)
- SEC ticker mapping cache: in-memory and reused across requests
- In-flight de-duplication: concurrent requests for the same ticker share one fetch promise

### Refresh behavior

On Ticker Detail, clicking **Refresh data** sends `refresh=1` and bypasses cache for both quote/history and fundamentals.

---

## Rate Limits and Safety Notes

- Alpha Vantage free tiers are rate-limited (commonly 5 requests/minute and 500/day on free keys); cache helps reduce repeat calls.
- SEC APIs require a descriptive `User-Agent` and fair access behavior; Stock Scout sends `SEC_USER_AGENT`, caches fundamentals for 24h, and de-duplicates in-flight requests.
- App surfaces clear errors for missing `ALPHAVANTAGE_API_KEY` / `SEC_USER_AGENT`, invalid symbols, and upstream API failures.
- Rankings and Backtest remain mocked for prices to keep broad-universe fan-out controlled.

---

## Backtest Lite: How It Works

### Inputs
- **Period**: `3M`, `6M`, `1Y`
- **Top N**: `5`, `10`, `20`

### Rules
1. Rank the default universe by deterministic Value Score.
2. Select the Top N tickers.
3. Allocate equally across selected tickers.
4. Run a buy-and-hold simulation over the chosen period using mocked historical prices.
5. Compare portfolio return vs benchmark ticker `SPY` (mocked).

### Execution behavior
- Simulation runs **only when user clicks `Run Backtest`**.

### Assumptions / Limitations
- Uses mocked/generated data for universe/backtest.
- Does **not** include transaction costs, slippage, taxes, dividends, or rebalancing.
- Uses current mocked fundamentals for ranking (not point-in-time historical fundamentals).
- Educational only; not investment advice.

---

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

---

## Scripts

```bash
npm run dev    # start local dev server
npm run build  # create production build
npm run start  # run production build
npm run lint   # run lint checks
```

---

## Disclaimer

This project is for educational and exploratory purposes only. It is not investment advice.
