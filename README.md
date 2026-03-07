# Stock Scout

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Fundamentals](https://img.shields.io/badge/Fundamentals-Polygon.io-6200ea)
![Data Pipeline](https://img.shields.io/badge/Data%20refresh-daily%20at%2006%3A00%20UTC-brightgreen)
![Mode](https://img.shields.io/badge/DATA_MODE-mock%20%7C%20real-blue)

Stock Scout is a production-oriented stock scouting app that ranks a curated U.S. equity universe using a deterministic **Value Score v2** and serves results from a server-side cache designed for fast, stable UI rendering.

This repo reflects the complete **M5 + M6 + M7** architecture:
- **M5**: zero-client-fetch initial rankings load, persistent snapshotting, dynamic universe sizing, Value Score v2.
- **M6**: scheduled daily refresh via Vercel Cron, manual/admin refresh controls, freshness indicators, health monitoring, and structured preload logging.
- **M7**: Polygon.io bulk Fundamentals API replaces SEC EDGAR; pluggable provider system; preload now completes in **<15 s** even at 500 tickers.

---

## Table of Contents

- [What You Get](#what-you-get)
- [Architecture](#architecture)
- [Data Providers](#data-providers)
- [Data Freshness Pipeline](#data-freshness-pipeline)
- [Value Score v2](#value-score-v2)
- [API Surface](#api-surface)
- [Vercel Deployment](#vercel-deployment)
- [All Environment Variables](#all-environment-variables)
- [Local Development](#local-development)
- [Monitoring](#monitoring)
- [Data Sources](#data-sources)
- [Portfolio Storage](#portfolio-storage)
- [Rate Limits & Operational Notes](#rate-limits--operational-notes)
- [Disclaimer](#disclaimer)

---

## What You Get

### Rankings (`/`)
- Top universe ranked by Value Score v2.
- Server-rendered initial dataset (no client fetch on first paint).
- Client-side sort/filter interactions.
- Manual "Refresh Data" workflow that triggers server refresh and polls readiness.
- Freshness metadata (`lastUpdated`, cache age) surfaced by API/UI.

### Ticker Detail (`/ticker?ticker=...`)
- Price and fundamentals view with Value Score breakdown.
- Historical chart (1M / 6M / 1Y).
- Buy action integration for portfolio simulation.
- Cache-backed data for in-universe tickers; provider fallback for out-of-universe lookups.

### Portfolio (`/portfolio`)
- Local simulated holdings with P/L calculations.
- Current pricing enriched from cache (with fallback fetch when needed).
- Add/remove holdings and quick-buy integration.

---

## Architecture

### 1) Zero-client-fetch first paint (M5.1)
- `app/page.tsx` is an async server component that calls `getCacheSnapshot()`.
- If preload is in-flight, requests join the same promise rather than duplicating work.
- Initial rankings payload is serialized into HTML and hydrated into `RankingsClient` state.

### 2) Shared server cache + snapshot persistence (M5.2)
- `src/lib/dataCache.ts` owns singleton cache state (`cold | loading | ready | error`).
- Cache writes are atomic and persisted to `data/cache/rankings-snapshot.json`.
- All rankings/ticker endpoints read cache state rather than recomputing at render time.

### 3) Dynamic universe sizing (M5.3)
- Universe list is currently the curated Top-50 set from `src/universe/top50MarketCap.ts`.
- Base universe list is maintained in `src/universe/top50MarketCap.ts`.

### 4) Value Score v2 (M5.4)
- Sector-aware relative scoring and configurable weights.
- Composite score remains deterministic and server-side.

### 5) Automated refresh pipeline (M6)
- Scheduled refresh via Vercel Cron at **06:00 UTC daily**.
- Dedicated cron endpoint with Bearer token auth via `CRON_SECRET`.
- Manual/admin refresh path retained (`/api/preload`) with optional hardening.
- Health endpoint with cache-state visibility.
- Structured JSON logs for preload lifecycle events.

### 6) Polygon fundamentals data layer (M7)
- Fundamentals fetched via Polygon.io **bulk Fundamentals API** (TTM income statement, key ratios, cash flow).
- Pluggable provider system: `FUNDAMENTALS_PROVIDER=polygon` (default).
- Preload completes in **<15 s** for the full Top-50 universe, up from ~1–2 min.
- Identical `EnrichedFundamentals` shape — Value Score v2 requires no changes.
- Active provider surfaced in health endpoint and structured logs (`fundamentals.provider=polygon`).

---

## Data Providers

Stock Scout separates **market data** (prices, history) from **fundamentals** into two pluggable provider layers, both defined under `src/providers/`.

### Market data providers

| Provider | Class | Used when |
|---|---|---|
| Mock | `MockStockDataProvider` | `DATA_MODE=mock` |
| Polygon.io | `PolygonStockDataProvider` | `DATA_MODE=real` |

### Fundamentals providers

| Provider | Class | Used when |
|---|---|---|
| Mock (cached) | `CachedMockFundamentalsDataProvider` | `DATA_MODE=mock` |
| Polygon.io | `PolygonFundamentalsDataProvider` | `DATA_MODE=real`, `FUNDAMENTALS_PROVIDER=polygon` (default) |

Switch the active fundamentals provider with `FUNDAMENTALS_PROVIDER` in `.env.local`:

```bash
# .env.local
FUNDAMENTALS_PROVIDER=polygon   # default — Polygon.io bulk fundamentals
```

> **Mock mode** works with zero API keys. Both mock providers use deterministic seeded data so local development is always fast and predictable.

### Provider resolution

Provider selection lives in `src/providers/index.ts`. The exported `getStockDataProvider()` and `getFundamentalsDataProvider()` functions are the single injection points used by `src/lib/dataCache.ts` and every API route.

---

## Data Freshness Pipeline

Stock Scout keeps UI fast and stable by moving expensive work into a centralized refresh pipeline.

### Startup preload
1. `instrumentation.ts` triggers preload at app boot.
2. Cache transitions to `loading`.
3. Universe quotes + fundamentals are fetched in bulk and enriched.
4. Value scores are computed.
5. Atomic snapshot write completes.
6. Cache transitions to `ready` and `lastUpdated` is set.

### Scheduled refresh (production)
- Vercel Cron invokes `POST /api/cron/refresh` daily (`0 6 * * *`).
- Request must include `Authorization: Bearer <CRON_SECRET>`.
- Endpoint calls `triggerRefresh()` (force refresh path).
- On success, response includes current status, lastUpdated, tickerCount.

### Manual refresh (dev/admin)
- `POST /api/preload?refresh=1` triggers force refresh.
- Optional protection: set `PRELOAD_REQUIRE_ADMIN=1` and send cron-style bearer auth.
- Client can poll `/api/rankings` or `/api/preload` for readiness.

### Cache health states
- `cold`: startup, preload not yet initiated.
- `loading`: refresh in progress.
- `ready`: cache populated, serving stable data.
- `error`: refresh failed; details available in health payload/logs.

---

## Value Score v2

Value Score v2 is computed server-side from enriched fundamentals and valuation metrics.

- Components include valuation, growth, and quality factors.
- Sector-relative normalization is applied where configured.
- Weights are configurable through environment variables.
- UI renders precomputed scores; browser does not perform scoring math.

Reference implementations:
- `src/lib/valueScore.ts`
- `src/scoring/calculateValueScore.ts`

---

## API Surface

### Market & rankings
- `GET /api/rankings` → cached ranked dataset + cache metadata.
- `GET /api/market/universe-quotes` → universe quote view.
- `GET /api/market/quote?ticker=...` → single quote.
- `GET /api/market/history?ticker=...&range=...` → chart history.
- `GET /api/fundamentals?ticker=...` → fundamentals panel data.
- `GET /api/ticker?ticker=...` → enriched ticker detail.

### Refresh & health
- `GET /api/preload` → current preload/cache status.
- `POST /api/preload` → starts preload; add `?refresh=1` for force refresh.
- `POST /api/cron/refresh` → authenticated cron refresh endpoint.
- `GET /api/health` → status, lastUpdated, universeSize, scoreVersion, dataMode, cacheState, fundamentalsProvider.

### Portfolio
- `GET /api/portfolio` → holdings + current valuation.
- `POST /api/portfolio` → add holding.
- `DELETE /api/portfolio/[ticker]` → remove holdings by ticker.
- `POST /api/portfolio/buy` → quick-buy helper endpoint.
- `GET /api/portfolio/trades` → raw trade history view.

---

## Vercel Deployment

### 1) Create project + set environment variables
Configure production env vars in Vercel (see full table below), including:
- `DATA_MODE`
- `NEXT_PUBLIC_DATA_MODE`
- `POLYGON_API_KEY` (required in real mode — covers both quotes and fundamentals)
- `FUNDAMENTALS_PROVIDER` (defaults to `polygon`; explicit in production)
- `CRON_SECRET` (required for cron auth)

### 2) Cron schedule
`vercel.json` already defines:

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

### 3) Recommended production settings
- Keep `PRELOAD_REQUIRE_ADMIN=1` to harden manual refresh endpoint.
- Use a strong random `CRON_SECRET`.
- Set `FUNDAMENTALS_PROVIDER=polygon` explicitly so behavior is never ambiguous.
- Monitor `/api/health` and preload logs after each deploy.

---

## All Environment Variables

Copy and edit:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `DATA_MODE` | No (defaults to `mock`) | `mock` / `real` | Server data source mode for preload and API routes. |
| `NEXT_PUBLIC_DATA_MODE` | Yes (must match `DATA_MODE`) | `mock` / `real` | Client-visible mode flag used by providers. |
| `POLYGON_API_KEY` | Yes in `real` mode | `pk_xxx` | Polygon.io key — used for quotes, history, **and** fundamentals. |
| `FUNDAMENTALS_PROVIDER` | No (defaults to `polygon`) | `polygon` | Selects the fundamentals provider class. Currently only `polygon` is supported in real mode. |
| `CRON_SECRET` | Yes for cron + protected refresh | long random string | Bearer secret for `/api/cron/refresh` and optional admin preload gating. |
| `PRELOAD_REQUIRE_ADMIN` | Optional | `1` | If set to `1`, `POST /api/preload` requires bearer auth. |
| `SCORE_VERSION` | Optional | `v1` / `v2` | Selects score algorithm version (`v1` default, `v2` sector-relative). |

> Note: Keep `.env.local` out of source control. `.env.local.example` is the canonical template.

---

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Useful scripts

```bash
npm run dev    # start Next.js in development mode
npm run build  # production build
npm run start  # run production server
npm run lint   # lint project
```

### Real mode quick start

```bash
# .env.local
DATA_MODE=real
NEXT_PUBLIC_DATA_MODE=real
POLYGON_API_KEY=your_polygon_key
FUNDAMENTALS_PROVIDER=polygon
CRON_SECRET=your_long_random_secret
PRELOAD_REQUIRE_ADMIN=1
```

No additional seed scripts or external files needed — Polygon.io serves everything.

---

## Monitoring

### Health endpoint
`GET /api/health` response shape:

```json
{
  "status": "ready",
  "lastUpdated": "2026-03-07T06:00:01.234Z",
  "universeSize": 50,
  "scoreVersion": "v2",
  "dataMode": "real",
  "fundamentalsProvider": "polygon",
  "cacheState": {
    "status": "ready",
    "error": null,
    "inFlight": false
  }
}
```

### Structured preload logs
Refresh lifecycle emits JSON logs with timestamps and event keys, e.g.:
- `preload.started`
- `preload.join_in_flight`
- `preload.skip_already_ready`
- `preload.succeeded` — includes `durationMs` and `fundamentals.provider=polygon`
- `preload.failed`

Use these logs to detect slow refreshes, startup failures, and repeated reload churn.

### Operational checks
- Verify `lastUpdated` moves after manual/cron refresh.
- Alert when `status=error` persists.
- Track refresh duration (`durationMs`) from preload logs — expect **<15 s** in production.
- Confirm `fundamentalsProvider: "polygon"` in health response.

---

## Data Sources

| Data | Source |
|---|---|
| Universe list | `src/universe/top50MarketCap.ts` |
| Market prices & history | Polygon.io APIs |
| Fundamentals (TTM income stmt, ratios, cash flow) | Polygon.io bulk Fundamentals API |

All live data flows through a single `POLYGON_API_KEY`. No additional credentials or seed files required.

---

## Portfolio Storage

Portfolio simulation data is stored locally in `data/portfolio.json` (gitignored). This keeps user-entered holdings private and easy to inspect/edit during local use.

---

## Rate Limits & Operational Notes

- Polygon free-tier limits are strict; the bulk Fundamentals API dramatically reduces per-ticker fan-out vs. sequential calls.
- In `real` mode, full preload completes in **<15 s** for the Top-50 universe (down from ~1–2 min with sequential requests).
- Cache-first serving keeps UI responsive even when upstream providers are slow or rate-limited.
- In `mock` mode, preload is near-instant with zero network calls.

---

## Disclaimer

For educational and exploratory use only. This project is **not** investment advice.
