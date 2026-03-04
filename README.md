# Stock Scout

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![React](https://img.shields.io/badge/React-18-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![Data refresh](https://img.shields.io/badge/Data%20refresh-daily%20at%2006%3A00%20UTC-brightgreen)
![Mode](https://img.shields.io/badge/DATA_MODE-mock%20%7C%20real-blue)

Stock Scout is a stock scouting web application that ranks the **Top 50 U.S. equities by market cap** using a deterministic **Value Score** algorithm. It is built with Next.js 14 and React 18, and is designed so that the full ranked dataset is embedded directly in the initial HTML — no client-side data fetching on first page load.

---

## Table of Contents

- [What It Does](#what-it-does)
- [How It Works (Architecture)](#how-it-works-architecture)
- [Value Score Explained](#value-score-explained)
- [Pages](#pages)
- [API Reference](#api-reference)
- [Getting Started (Local Development)](#getting-started-local-development)
- [Running in Real Mode](#running-in-real-mode)
- [Deploying to Vercel](#deploying-to-vercel)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Data Sources](#data-sources)
- [Monitoring & Health](#monitoring--health)
- [Disclaimer](#disclaimer)

---

## What It Does

Stock Scout pulls financial data for the 50 largest U.S. stocks and assigns each one a **Value Score from 0 to 100**. The score combines four fundamental factors: Price-to-Earnings (P/E), Price-to-Sales (P/S), Revenue Growth, and Operating Margin. All scoring happens server-side at startup — the browser never runs any calculation logic.

**Key features:**
- **Rankings page** — All 50 stocks ranked by Value Score, sortable and filterable. Data is embedded in the initial HTML for instant display.
- **Ticker Detail page** — Drill into any stock (including out-of-universe tickers) to see fundamentals, a Value Score breakdown, and a 1M/6M/1Y price chart.
- **Portfolio page** — Track simulated stock holdings with live gain/loss calculations.
- **Mock mode** — Works out of the box with no API keys. Uses deterministic seeded data so results are consistent across restarts.
- **Real mode** — Pulls live prices from Polygon.io and fundamentals from SEC EDGAR.
- **Daily refresh** — A Vercel Cron job rebuilds the cache every day at 06:00 UTC.

---

## How It Works (Architecture)

### The Cache Pipeline

The core of Stock Scout is a **server-side singleton cache** (`src/lib/dataCache.ts`). All the expensive work — fetching prices, fetching SEC filings, computing scores — happens here, once, at startup. Every page and API route reads from this cache; nothing is recalculated at request time.

**Pipeline steps (run at startup and on each daily refresh):**

1. Load `data/sec_cik_map.json` → company names and SEC CIK identifiers per ticker.
2. Fetch all 50 stock prices in a single Polygon.io grouped-daily request.
3. Fetch SEC EDGAR "company facts" for each ticker (parallel requests).
4. Parse the SEC filings to extract TTM (trailing twelve months) EPS, revenue, operating income, and shares outstanding.
5. Calculate P/E, P/S, market cap, operating margin, and revenue growth.
6. Run the Value Score algorithm for each ticker.
7. Write the complete dataset to `data/cache/rankings-snapshot.json` (atomic write via temp file rename).
8. Update the in-memory cache state to `ready`.

**Cache states:**
- `cold` — Server just started; preload hasn't begun yet.
- `loading` — Pipeline is running; queries will wait for it to finish.
- `ready` — Full dataset available; all requests are served instantly.
- `error` — Preload failed; the error message is surfaced via the health endpoint.

### Zero Client-Side Fetch on First Paint

`app/page.tsx` is an async React Server Component. It calls `getCacheSnapshot()`, which waits for the pipeline if needed, then passes the complete dataset to `RankingsClient` as props. The full list of 50 ranked tickers is serialized into the initial HTML response. The browser hydrates without ever making a data request.

### Data Flow Diagram

```
App start
  └─ instrumentation.ts triggers triggerPreload() in background
       └─ dataCache.runPreload()
            1. Load sec_cik_map.json
            2. Fetch Polygon grouped quotes (1 request → 50 prices)
            3. Fetch SEC facts per ticker (parallel)
            4. Calculate scores
            5. Write rankings-snapshot.json
            6. state.status = 'ready'

Browser visits /
  └─ app/page.tsx (Server Component, async)
       └─ getCacheSnapshot() → awaits preload if needed
            └─ Returns { tickers: EnrichedTicker[50], lastUpdated, status }
                 └─ Passed to RankingsClient as props
                      └─ HTML contains all 50 tickers → instant render

User clicks "Refresh Data Now"
  └─ POST /api/preload?refresh=1 (fire and forget)
  └─ Client polls GET /api/rankings every 3 seconds
  └─ When status=ready → update UI with new data

Daily at 06:00 UTC (Vercel Cron)
  └─ POST /api/cron/refresh with Authorization: Bearer <CRON_SECRET>
       └─ triggerRefresh() → full pipeline re-runs
```

---

## Value Score Explained

Each ticker receives a composite **Value Score from 0 to 100** based on four components. All scoring is server-side; the browser only displays pre-computed numbers.

### Score Version v1 (default)

Each component contributes 0–25 points. Lower valuation multiples and higher quality metrics earn more points.

| Component | Full Score | Zero Score | Formula |
|---|---|---|---|
| P/E (TTM) | P/E ≤ 10 → 25 pts | P/E ≥ 40 → 0 pts | `25 × (1 - (PE - 10) / 30)` |
| P/S | P/S ≤ 1 → 25 pts | P/S ≥ 10 → 0 pts | `25 × (1 - (PS - 1) / 9)` |
| Revenue Growth | Growth ≥ 20% → 25 pts | Growth ≤ 0% → 0 pts | `25 × (growth / 20)` |
| Operating Margin | Margin ≥ 25% → 25 pts | Margin ≤ 0% → 0 pts | `25 × (margin / 25)` |

**Total = sum of four components, clamped to [0, 100].**

All scores are integers. Null values (missing data) score 0 for that component.

### Score Version v2 (opt-in via `SCORE_VERSION=v2`)

v2 adds two sector-relative adjustments to make comparisons fairer across industries:

1. **Sector-adjusted P/E** — A P/E of 25 is "cheap" for a tech stock (sector median ~30×) but "expensive" for a bank (sector median ~12×). The raw P/E is normalised against the sector median before scoring:
   ```
   adjustedPE = PE × (20 / sectorMedianPE)
   ```

2. **Sector-adjusted Operating Margin** — A 10% margin is outstanding for retail but below par for software. Same normalisation approach.

3. **Different component weights** — v2 tilts toward quality and growth:
   - v1 weights: P/E 25 · P/S 25 · Growth 25 · Margin 25
   - v2 weights: P/E 20 · P/S 20 · Growth 30 · Margin 30

Sector assignments and medians are defined in `src/lib/valueScore.ts` and cover all 50 tickers in the universe.

---

## Pages

### `/` — Rankings

The main page. Displays all 50 tickers ranked by Value Score (default) or Market Cap. Features:
- Filter input — search by ticker symbol or company name.
- Sort toggle — Value Score descending or Market Cap descending.
- "Refresh Data Now" button — triggers a server-side cache rebuild and polls until complete.
- Data freshness badge — shows how old the cached data is (e.g. "Data age: 2h 14m").
- "Buy" button per row — opens a quick-buy modal that saves a holding to the portfolio.

### `/ticker?ticker=AAPL` — Ticker Detail

Detailed view for any stock symbol (not just the Top 50). Shows:
- Current price card with last-updated timestamp.
- Historical price chart — switch between 1 month, 6 months, and 1 year.
- Full fundamentals table: Market Cap, P/E, P/S, EPS, Revenue TTM, Revenue YoY Growth, Operating Margin.
- Value Score breakdown showing each component's score against its maximum points.
- "Buy" button to add the stock to the portfolio.

For universe tickers (the Top 50), data is served from the pre-built cache. For any other ticker, data is fetched on demand from the active providers.

### `/portfolio` — Portfolio

Simulated portfolio tracker. Features:
- Holdings table with current price, total value, dollar gain/loss, and percentage gain/loss.
- Summary row: total invested, current value, overall gain/loss.
- "Add Holding" form with fields for ticker, company name, shares, purchase price, date, and notes.
- "Remove" button per holding.
- Holdings are stored locally in `data/portfolio.json` (gitignored).

---

## API Reference

### Rankings & Data

| Endpoint | Method | Description |
|---|---|---|
| `/api/rankings` | GET | Full enriched Top-50 dataset from the cache. Returns `{ tickers, lastUpdated, status }`. |
| `/api/ticker?ticker=AAPL` | GET | Enriched data for one ticker (from cache or fetched on demand). Add `&refresh=1` to bypass cache. |
| `/api/market/quote?ticker=AAPL` | GET | Latest price for one ticker. |
| `/api/market/history?ticker=AAPL&range=1M` | GET | Historical daily prices. Range: `1M`, `6M`, or `1Y`. |

### Cache Control

| Endpoint | Method | Description |
|---|---|---|
| `/api/preload` | GET | Current cache status (no side effects). |
| `/api/preload` | POST | Start a preload. Add `?refresh=1` to force a full refresh even if cache is ready. |
| `/api/cron/refresh` | POST | Authenticated daily refresh. Requires `Authorization: Bearer <CRON_SECRET>`. |
| `/api/health` | GET | Returns cache state, lastUpdated, universeSize, scoreVersion, dataMode. |

### Portfolio

| Endpoint | Method | Description |
|---|---|---|
| `/api/portfolio` | GET | All holdings enriched with current prices and gain/loss calculations. |
| `/api/portfolio` | POST | Add a holding. Body: `{ ticker, companyName?, shares, purchasePrice, purchaseDate?, notes? }` |
| `/api/portfolio/[ticker]` | DELETE | Remove all holdings for a ticker. |
| `/api/portfolio/buy` | POST | Quick-buy (from modal). Body: `{ ticker, companyName?, shares, purchasePrice }` |

---

## Getting Started (Local Development)

**Prerequisites:** Node.js 18+ and npm.

```bash
# 1. Clone the repository
git clone <repo-url>
cd stock-scout

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.local.example .env.local
# The defaults in .env.local.example use mock mode — no API keys needed.

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app starts in **mock mode** by default. It generates realistic-looking seeded data for all 50 tickers with no API keys required. The mock prices and fundamentals are fully deterministic — they produce the same results on every restart.

### Available Scripts

```bash
npm run dev       # Start Next.js development server (hot reload)
npm run build     # Create a production build
npm run start     # Run the production build locally
npm run lint      # Run ESLint
npm run seed:sec  # Regenerate data/sec_cik_map.json from SEC EDGAR
```

---

## Running in Real Mode

Real mode connects to live data sources: Polygon.io for prices and SEC EDGAR for fundamentals.

**Step 1 — Get API credentials:**
- [Polygon.io](https://polygon.io) — A free account works. Copy your API key from the dashboard.
- SEC EDGAR — No registration. You only need to set a descriptive `User-Agent` string (SEC EDGAR policy requirement).

**Step 2 — Configure `.env.local`:**

```bash
DATA_MODE=real
NEXT_PUBLIC_DATA_MODE=real
POLYGON_API_KEY=your_polygon_api_key_here
SEC_USER_AGENT=Your Name your@email.com
CRON_SECRET=replace_with_a_long_random_secret
PRELOAD_REQUIRE_ADMIN=1
```

**Step 3 — Seed the SEC CIK map (one time only):**

```bash
npm run seed:sec
```

This generates `data/sec_cik_map.json`, which maps each ticker to its SEC CIK (Central Index Key) and company name. The preload pipeline reads this file at startup to avoid a live SEC lookup for every ticker on each refresh.

**Step 4 — Start the server:**

```bash
npm run dev
```

The preload pipeline runs in the background. A full real-mode preload takes approximately 1–3 minutes depending on SEC response times. Check `/api/health` to see when the cache is `ready`.

---

## Deploying to Vercel

### Step 1 — Set environment variables in Vercel

In your Vercel project settings → Environment Variables, add all the variables listed in the [Environment Variables](#environment-variables) table below. For production, use `DATA_MODE=real` and real credentials.

### Step 2 — Cron is pre-configured

`vercel.json` already contains the cron schedule:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh",
      "schedule": "0 6 * * *"
    }
  ]
}
```

Vercel automatically calls `POST /api/cron/refresh` at 06:00 UTC every day and sends your `CRON_SECRET` as `Authorization: Bearer <secret>`.

### Step 3 — Recommended production settings

- Set `PRELOAD_REQUIRE_ADMIN=1` so that only authenticated callers can trigger a manual refresh.
- Use a strong, randomly-generated `CRON_SECRET` (e.g. output of `openssl rand -hex 32`).
- Set `SCORE_VERSION=v2` to use sector-relative scoring if desired.
- After each deploy, check `/api/health` to confirm the preload completed.

---

## Environment Variables

Copy `.env.local.example` to `.env.local` as your starting point.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATA_MODE` | No | `mock` | Server data source: `mock` (seeded data, no API keys) or `real` (live APIs). |
| `NEXT_PUBLIC_DATA_MODE` | Yes | `mock` | Must match `DATA_MODE`. This value is included in the browser bundle so that client-side provider code knows which mode is active. |
| `POLYGON_API_KEY` | In real mode | — | Polygon.io API key for live stock prices and historical price data. |
| `SEC_USER_AGENT` | In real mode | — | User-Agent string for SEC EDGAR API requests. Required by SEC policy. Format: `"Your Name your@email.com"`. |
| `CRON_SECRET` | For cron & protected refresh | — | Bearer token used to authenticate the Vercel Cron endpoint and optionally the manual preload endpoint. |
| `PRELOAD_REQUIRE_ADMIN` | No | — | Set to `1` to require `Authorization: Bearer <CRON_SECRET>` on `POST /api/preload`. |
| `SCORE_VERSION` | No | `v1` | Scoring algorithm: `v1` = equal 25-point weights, `v2` = sector-relative P/E/margin with 20/20/30/30 weights. |

> Keep `.env.local` out of source control. The `.env.local.example` file is the canonical template — it is safe to commit.

---

## Project Structure

```
stock-scout/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # Rankings page (async server component)
│   ├── layout.tsx                    # Root layout: CSS + navigation bar
│   ├── globals.css                   # Dark Bloomberg-style theme
│   ├── rankings/page.tsx             # Redirects /rankings → /
│   ├── ticker/page.tsx               # Ticker Detail page shell
│   ├── portfolio/page.tsx            # Portfolio simulation page
│   └── api/
│       ├── rankings/route.ts         # GET /api/rankings
│       ├── preload/route.ts          # GET|POST /api/preload
│       ├── cron/refresh/route.ts     # POST /api/cron/refresh (Vercel Cron)
│       ├── health/route.ts           # GET /api/health
│       ├── ticker/route.ts           # GET /api/ticker?ticker=X
│       ├── portfolio/
│       │   ├── route.ts              # GET|POST /api/portfolio
│       │   ├── [ticker]/route.ts     # DELETE /api/portfolio/[ticker]
│       │   └── buy/route.ts          # POST /api/portfolio/buy
│       └── market/
│           ├── quote/route.ts        # GET /api/market/quote?ticker=X
│           ├── history/route.ts      # GET /api/market/history?ticker=X&range=1M
│           └── universe-quotes/route.ts
│
├── src/
│   ├── types/index.ts                # All shared TypeScript types
│   ├── lib/
│   │   ├── dataCache.ts              # Singleton cache + preload pipeline
│   │   ├── valueScore.ts             # Value Score v1/v2 algorithm
│   │   └── portfolio.ts              # Read/write data/portfolio.json
│   ├── components/
│   │   ├── RankingsClient.tsx        # Rankings table (sort/filter/refresh/buy)
│   │   ├── TickerDetailView.tsx      # Ticker detail: price, chart, fundamentals
│   │   ├── FundamentalsPanel.tsx     # Fundamentals + score breakdown display
│   │   ├── HistoricalChart.tsx       # SVG line chart
│   │   ├── PriceCard.tsx             # Latest price card
│   │   └── AppNav.tsx                # Top navigation bar
│   ├── providers/
│   │   ├── types.ts                  # Provider interfaces
│   │   ├── index.ts                  # Provider factory (mock vs real)
│   │   ├── mockStockDataProvider.ts  # Seeded deterministic prices
│   │   ├── mockFundamentalsDataProvider.ts
│   │   ├── cachedMockFundamentalsDataProvider.ts
│   │   ├── polygonStockDataProvider.ts   # Live prices from Polygon.io
│   │   └── secFundamentalsDataProvider.ts # Live fundamentals from SEC EDGAR
│   ├── universe/
│   │   └── top50MarketCap.ts         # The 50 ticker symbols being tracked
│   ├── server/
│   │   └── polygonRateLimit.ts       # Rate-limited fetch wrapper for Polygon
│   └── utils/
│       └── formatters.ts             # Currency and number format helpers
│
├── scripts/
│   └── seedSecCikMap.ts              # Generates data/sec_cik_map.json
│
├── data/                             # Runtime-generated files (gitignored)
│   ├── cache/rankings-snapshot.json  # Persisted cache snapshot
│   ├── portfolio.json                # User portfolio holdings
│   └── sec_cik_map.json              # Ticker → CIK + company name map
│
├── instrumentation.ts                # Next.js startup hook: triggers preload
├── next.config.mjs                   # Next.js config: security headers
├── vercel.json                       # Vercel Cron schedule
├── tsconfig.json                     # TypeScript (@/* → src/*)
└── .env.local.example                # Environment variable template
```

---

## Data Sources

| Data | Source | Notes |
|---|---|---|
| Stock prices (latest + history) | [Polygon.io](https://polygon.io) | Real mode only. Uses grouped-daily endpoint (1 request = all 50 prices). |
| Financial fundamentals (EPS, revenue, margins) | [SEC EDGAR Company Facts API](https://data.sec.gov/api/xbrl/companyfacts) | Real mode only. Parses XBRL filings to compute TTM figures. |
| Ticker → CIK mapping + company names | SEC EDGAR (cached in `data/sec_cik_map.json`) | Regenerate with `npm run seed:sec`. |
| All data | Deterministic seeded generation | Mock mode (default). No API keys needed. |

**SEC EDGAR:** The SEC asks automated tools to set a descriptive `User-Agent` header (your name and email) and to stay under 10 requests/second. The preload pipeline respects this by fetching each ticker sequentially.

**Polygon free tier:** The grouped-daily endpoint lets the pipeline fetch all 50 stock prices in a single API call, making it practical within free-tier rate limits.

---

## Monitoring & Health

### Health endpoint

`GET /api/health` returns the current state of the cache:

```json
{
  "status": "ready",
  "lastUpdated": "2026-03-04T06:00:01.234Z",
  "universeSize": 50,
  "scoreVersion": "v1",
  "dataMode": "real",
  "cacheState": {
    "status": "ready",
    "error": null,
    "inFlight": false
  }
}
```

### Structured log events

The preload pipeline writes JSON log lines to stdout. Each line contains a timestamp, level, and event key:

| Event | When emitted |
|---|---|
| `preload.started` | Pipeline begins. Includes `tickerTarget` and `dataMode`. |
| `preload.join_in_flight` | A second caller joined an already-running preload. |
| `preload.skip_already_ready` | Preload skipped because the cache is already ready. |
| `preload.succeeded` | Pipeline completed. Includes `durationMs` and `tickerCount`. |
| `preload.failed` | Pipeline threw an error. Includes the error message. |

Example:
```json
{"ts":"2026-03-04T06:00:01.234Z","level":"info","source":"dataCache","event":"preload.succeeded","durationMs":87432,"tickerCount":50,"lastUpdated":"2026-03-04T06:00:01.234Z"}
```

### Operational checks

- After a deploy, `GET /api/health` should return `status: "ready"` within a few minutes.
- After the daily cron, `lastUpdated` should advance to within minutes of 06:00 UTC.
- If `status: "error"` persists, check server logs for a `preload.failed` event.
- Track `durationMs` in `preload.succeeded` to detect slow refreshes (SEC can be slow during peak hours).

---

## Disclaimer

For educational and exploratory use only. Stock Scout is **not** investment advice. All scores are based on a simplified algorithm and publicly available data. Past fundamentals are not a guarantee of future performance. Do your own research before making any investment decisions.
