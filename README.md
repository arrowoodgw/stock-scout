# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows, deterministic ranking, and simple portfolio simulation concepts.

This repository implements M4 with a **Top 50 U.S. stocks by market cap universe**, a **real-data mode** powered by Polygon.io and SEC EDGAR, a normalized **Value Score** breakdown, and a full **Portfolio** feature.

## Universe Definition

- Universe: **Top 50 U.S. stocks by market cap**
- As of: **2026-02-17**
- Source: **CompaniesMarketCap (updated daily)**

Defined in `src/universe/top50MarketCap.ts`.

## Current Functionality

- **Home** page
  - Initial load performs one browser request to `GET /api/market/universe-quotes`
  - Shows Top 5 picks with **Buy** buttons (opens purchase modal)
- **Ticker Detail** page
  - 1M / 6M / 1Y chart
  - Fundamentals panel with Value Score and component breakdown (P/E, P/S, Revenue Growth, Operating Margin — each 0–25 pts)
  - **Refresh data** button bypasses cache
  - **Buy** action records local trades
- **Rankings** page
  - Top 50 universe ranked by Value Score with **Buy** buttons per row
- **Backtest Lite** page
  - Runs over the Top 50 universe
- **Portfolio** page
  - Loads holdings from `data/portfolio.json` via `GET /api/portfolio`
  - Fetches current prices per ticker in parallel from the provider
  - Table: Ticker | Shares | Purchase Price | Cost Basis | Current Price | Current Value | Gain/Loss $ | Gain/Loss %
  - Summary totals and **Refresh Prices** button
  - Gains colored green, losses red; price errors shown inline without failing the page

## Setting Up `.env.local`

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`. Never commit that file — it is in `.gitignore`.

## Environment Variables

| Variable | Required for real mode | Description |
|---|---|---|
| `POLYGON_API_KEY` | Yes | Polygon.io API key for live price data. Sign up free at https://polygon.io |
| `SEC_USER_AGENT` | Yes | Your name and email for SEC EDGAR fair-use policy, e.g. `Jane Doe jane@example.com` |
| `DATA_MODE` | No | `mock` (default) or `real` (server-side) |
| `NEXT_PUBLIC_DATA_MODE` | No | Must match `DATA_MODE` (client-side) |

See `.env.local.example` for a fully documented example.

## Real Mode Setup

```bash
# .env.local
DATA_MODE=real
NEXT_PUBLIC_DATA_MODE=real
POLYGON_API_KEY=your_polygon_api_key_here
SEC_USER_AGENT=Your Name your@email.com
```

## Value Score Algorithm

Each stock is scored 0–100 based on four equally-weighted components (0–25 each):

| Component | Metric | Max when |
|---|---|---|
| P/E | `peTtm` | P/E ≤ 10 |
| P/S | `ps` | P/S ≤ 1 |
| Revenue Growth | `revenueGrowthYoY` | Growth ≥ 30% |
| Operating Margin | `operatingMargin` | Margin ≥ 25% |

The breakdown is shown on the Ticker Detail fundamentals panel.

## Portfolio Data File

Holdings are stored locally at `data/portfolio.json` (created automatically; excluded from git via `.gitignore`).

- `GET /api/portfolio` — returns `{ holdings: PortfolioHolding[] }`
- `POST /api/portfolio/buy` — body `{ ticker, shares, purchasePrice }`, appends a holding with today's date

## Caching + Refresh Behavior

- **Universe quotes cache** (`/api/market/universe-quotes`)
  - key: ticker → `{ price, asOf, source }`
  - TTL: ~10 minutes; concurrent refreshes coalesced
- **History cache** (Polygon daily series)
  - Full daily series cached per ticker; range sliced in memory
  - TTL: ~12 hours
- **Fundamentals cache** (SEC company facts)
  - ticker → CIK cached in-memory; fundamentals cached 24 hours
- **Refresh buttons**
  - Ticker Detail `Refresh data` sends `refresh=1` and bypasses caches

## Rate Limits

- Polygon free tier: 5 requests per minute. The provider enforces a 12-second minimum interval between requests; caching and in-flight deduplication reduce API fan-out.
- Universe quote fetch uses Polygon's snapshot endpoint (single request for all tickers) with per-ticker fallback.
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
