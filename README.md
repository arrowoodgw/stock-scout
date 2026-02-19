# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows, deterministic ranking, and simple portfolio simulation concepts.

This repository implements M4 with a **Top 50 U.S. stocks by market cap universe**, a **real-data mode** powered by Polygon.io and SEC EDGAR, a normalized **Value Score** breakdown, and a full **Portfolio** feature.

## Universe Definition

- Universe: **Top 50 U.S. stocks by market cap**
- As of: **2026-02-17**
- Source: **CompaniesMarketCap (updated daily)**

Defined in `src/universe/top50MarketCap.ts`.

## Current Functionality

- **Rankings** page (landing page at `/`)
  - Top 50 universe ranked by Value Score with **Buy** buttons per row
  - Filter by ticker/company name, sort by Value Score or Market Cap
  - Reads exclusively from the server-side preload cache — zero per-request fetching
- **Ticker Detail** page
  - 1M / 6M / 1Y chart
  - Fundamentals panel with Value Score and component breakdown (P/E, P/S, Revenue Growth, Operating Margin — each 0–25 pts)
  - **Refresh data** button forces a cache re-fetch
  - **Buy** action records local trades
- **Portfolio** page
  - Displays holdings with current prices, gain/loss calculations, and a portfolio summary
  - Table: Ticker | Company | Shares | Purchase Price | Current Price | Gain/Loss ($) | Gain/Loss (%) | Total Value
  - Summary cards: Total Invested, Current Value, Overall Gain/Loss ($), Overall Gain/Loss (%)
  - **Add Holding** form with ticker, company name, shares, purchase price, purchase date, and optional notes
  - **Remove** button per holding
  - Current prices read from the server-side cache; individual fetch as fallback for out-of-universe tickers

---

## Data Sources & Data Model

### SEC CIK Mapping

The SEC provides an official mapping of ticker symbols to CIK (Central Index Key) numbers, which are required to look up a company's financial filings.

- **Source URL:** `https://www.sec.gov/files/company_tickers.json`
- **Local file:** `data/sec_cik_map.json`
- **Schema:** `{ [TICKER]: { cik: string, name: string } }` — uppercase ticker keys, zero-padded 10-digit CIK strings
- **Regenerate:** `npm run seed:sec` (requires `SEC_USER_AGENT` to be set in `.env.local`)

The file is committed to the repository so the app has company names available even before the seed script is run.

### Data Model — `EnrichedTicker`

The canonical type is defined in `src/types/index.ts` and is shared across the entire app.

| Field | Type | Source | Notes |
|---|---|---|---|
| `ticker` | `string` | Universe list | Uppercase, e.g. `"AAPL"` |
| `companyName` | `string \| null` | `data/sec_cik_map.json` | Full legal name from SEC |
| `latestPrice` | `number \| null` | Polygon.io (prev close) | USD |
| `marketCap` | `number \| null` | Computed: `latestPrice x sharesOutstanding` | USD |
| `peTtm` | `number \| null` | Computed: `latestPrice / epsTtm` | Price-to-earnings TTM |
| `ps` | `number \| null` | Computed: `marketCap / revenueTtm` | Price-to-sales TTM |
| `epsTtm` | `number \| null` | SEC EDGAR company facts | Earnings per share diluted, TTM sum of 4 quarters |
| `revenueTtm` | `number \| null` | SEC EDGAR company facts | USD, TTM sum of 4 quarters |
| `revenueGrowthYoY` | `number \| null` | SEC EDGAR company facts | % change, most recent vs prior fiscal year |
| `operatingMargin` | `number \| null` | SEC EDGAR company facts | %, computed from operating income / revenue |
| `valueScore` | `number` | Calculated at startup | 0-100 composite score |
| `scoreBreakdown.peScore` | `number` | Calculated at startup | 0-25 P/E sub-score |
| `scoreBreakdown.psScore` | `number` | Calculated at startup | 0-25 P/S sub-score |
| `scoreBreakdown.revenueGrowthScore` | `number` | Calculated at startup | 0-25 growth sub-score |
| `scoreBreakdown.operatingMarginScore` | `number` | Calculated at startup | 0-25 margin sub-score |
| `fundamentalsAsOf` | `string \| null` | SEC EDGAR | ISO timestamp of most recent reported period |

If any field is unavailable for a given ticker, it is stored as `null` — never omitted. This makes rendering predictable and eliminates conditional checks for missing keys.

### Preload / Cache System

All data fetching and all score calculations happen **at server startup**, never at render time.

**How it works:**

1. When the Next.js server starts, `instrumentation.ts` calls `triggerPreload()` from `src/lib/dataCache.ts`
2. The preload pipeline runs in the background:
   - Loads `data/sec_cik_map.json` for company names and CIK numbers
   - Fetches all universe quotes from Polygon.io in a single grouped-daily call
   - Fetches SEC EDGAR company facts per ticker to extract TTM fundamentals
   - Computes `peTtm`, `ps`, `marketCap`, `valueScore`, and `scoreBreakdown` for all 50 tickers
3. Results are stored in a server-side singleton (`src/lib/dataCache.ts`) with a `lastUpdated` timestamp
4. `GET /api/rankings` and `GET /api/ticker?ticker=XXX` read exclusively from this cache — no additional fetching occurs on page navigation

**Cache states:**

| Status | Meaning |
|---|---|
| `cold` | App just started, preload not yet triggered |
| `loading` | Preload is in progress |
| `ready` | Cache is fully populated; all pages serve data instantly |
| `error` | Preload encountered a fatal error |

**Manual refresh:**

- The **Refresh data** button on the Rankings page sends `POST /api/preload?refresh=1`
- This triggers a full re-fetch and re-calculation of all 50 tickers
- The UI polls `GET /api/rankings` every 3 seconds until status returns to `ready`

**Out-of-universe tickers** (e.g., a user types an arbitrary symbol in Ticker Detail):
- These fall back to on-demand fetching via the existing provider system
- Scores are calculated server-side in `GET /api/ticker` before the response is sent — never in the browser

---

## Value Score Methodology

The Value Score is a composite 0-100 metric built from four equally-weighted components (0-25 each). All scores are **pre-calculated at startup** by `src/lib/valueScore.ts` and stored in the cache. The UI performs no calculations — it only renders the stored values.

### Components

#### P/E Score (0-25) — Valuation relative to earnings
Lower P/E = better value. Rewards companies trading at a reasonable multiple of earnings.

| P/E | Score |
|---|---|
| <= 10 | 25 (max) |
| 25 | ~12-13 |
| >= 40 | 0 |
| Negative or null | 0 |

Formula: `25 x (1 - (P/E - 10) / 30)`, clamped to [0, 25]

#### P/S Score (0-25) — Valuation relative to revenue
Lower P/S = better value. Useful for companies with thin or negative earnings where P/E is uninformative.

| P/S | Score |
|---|---|
| <= 1 | 25 (max) |
| 5.5 | ~12 |
| >= 10 | 0 |
| null | 0 |

Formula: `25 x (1 - (P/S - 1) / 9)`, clamped to [0, 25]

#### Revenue Growth Score (0-25) — Momentum
Higher year-over-year revenue growth = higher score. Rewards companies growing their top line.

| YoY Growth | Score |
|---|---|
| >= 20% | 25 (max) |
| 10% | ~12-13 |
| <= 0% | 0 |
| Negative or null | 0 |

Formula: `25 x (growth / 20)`, clamped to [0, 25]

#### Operating Margin Score (0-25) — Quality and efficiency
Higher operating margin = higher score. Rewards profitable, capital-efficient business models.

| Operating Margin | Score |
|---|---|
| >= 25% | 25 (max) |
| 12.5% | ~12-13 |
| <= 0% | 0 |
| Negative or null | 0 |

Formula: `25 x (margin / 25)`, clamped to [0, 25]

### Why these four factors?

- **P/E and P/S** measure valuation from two angles: earnings-based and revenue-based. Using both prevents gaming the score with thin margins (P/E) or expensive revenue multiples (P/S).
- **Revenue Growth** captures momentum — a fast-growing company may be expensive today but justified by future earnings.
- **Operating Margin** captures quality and efficiency — it distinguishes durable businesses from high-revenue-but-low-profit operations.

### Key guarantee

> All scores are pre-calculated at server startup and served from the in-memory cache.
> The UI never performs arithmetic — it only renders numbers it received from the server.

---

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

## Portfolio

Holdings are stored locally in `data/portfolio.json`. The file is created automatically on first use and is excluded from git via `.gitignore` to keep personal financial data private.

### JSON Structure

The file is human-readable and can be manually edited between sessions:

```json
{
  "holdings": [
    {
      "ticker": "AAPL",
      "companyName": "Apple Inc.",
      "shares": 10,
      "purchasePrice": 195.50,
      "purchaseDate": "2024-11-15",
      "notes": "Added on dip"
    }
  ]
}
```

Each holding has:
- `ticker` — uppercase stock symbol
- `companyName` — display name for the company
- `shares` — number of shares held
- `purchasePrice` — price per share at time of purchase (USD)
- `purchaseDate` — date of purchase in `YYYY-MM-DD` format
- `notes` — (optional) free-text annotation

**Purchase price and quantity are never auto-updated** — the user controls these values manually, which is intentional. To adjust a position, edit the JSON file directly or remove and re-add via the UI.

### API Routes

- `GET /api/portfolio` — returns all holdings enriched with current price and calculated gain/loss from the data cache
- `POST /api/portfolio` — adds a new holding; body: `{ ticker, companyName, shares, purchasePrice, purchaseDate, notes? }`
- `DELETE /api/portfolio/:ticker` — removes all holdings for a ticker
- `POST /api/portfolio/buy` — legacy quick-buy endpoint used by Rankings/Ticker Detail pages

## Rate Limits

- Polygon free tier: 5 requests per minute. Universe quotes use the grouped-daily endpoint (single request for all tickers) to minimise API fan-out.
- SEC APIs require a descriptive `User-Agent`; set `SEC_USER_AGENT`.
- In real mode, preloading all 50 tickers from SEC EDGAR is sequential to respect rate limits. Expect ~1-2 minutes for a full preload.

## Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

```bash
npm run dev          # Start development server (triggers preload in background)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run seed:sec     # Regenerate data/sec_cik_map.json from SEC EDGAR
```

## Disclaimer

Educational and exploratory use only. Not investment advice.
