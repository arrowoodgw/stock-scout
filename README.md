# Stock Scout

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Data Pipeline](https://img.shields.io/badge/Data%20refresh-daily%20at%2006%3A00%20UTC-brightgreen)
![Mode](https://img.shields.io/badge/DATA_MODE-mock%20%7C%20real-blue)

Stock Scout is a production-oriented stock scouting app that ranks a curated U.S. equity universe using a deterministic **Value Score v2** and serves results from a server-side cache designed for fast, stable UI rendering.

This repo now reflects the complete M5 + M6 architecture:
- **M5**: zero-client-fetch initial rankings load, persistent snapshotting, dynamic universe sizing, Value Score v2.
- **M6**: scheduled daily refresh via Vercel Cron, manual/admin refresh controls, freshness indicators, health monitoring, and structured preload logging.

---

## Table of Contents

- [What You Get](#what-you-get)
- [Architecture (M5 + M6)](#architecture-m5--m6)
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
- Manual “Refresh Data” workflow that triggers server refresh and polls readiness.
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

## Architecture (M5 + M6)

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

---

## Data Freshness Pipeline

Stock Scout keeps UI fast and stable by moving expensive work into a centralized refresh pipeline.

### Startup preload
1. `instrumentation.ts` triggers preload at app boot.
2. Cache transitions to `loading`.
3. Universe quotes + fundamentals are fetched and enriched.
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
- `GET /api/health` → status, lastUpdated, universeSize, scoreVersion, dataMode, cacheState.

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
- `POLYGON_API_KEY` (real mode)
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
- Run real mode only when Polygon credentials are configured.
- Monitor `/api/health` and preload logs after each deploy.

---

## All Environment Variables

Copy and edit:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `DATA_MODE` | No (defaults to mock) | `mock` / `real` | Server data source mode for preload and API routes. |
| `NEXT_PUBLIC_DATA_MODE` | Yes (should match `DATA_MODE`) | `mock` / `real` | Client-visible mode flag used by providers. |
| `POLYGON_API_KEY` | Yes in `real` mode | `pk_xxx` | Polygon quote/history API authentication. |
| `CRON_SECRET` | Yes for cron + protected refresh | long random string | Bearer secret for `/api/cron/refresh` and optional admin preload gating. |
| `PRELOAD_REQUIRE_ADMIN` | Optional | `1` | If set to `1`, `POST /api/preload` requires bearer auth. |
| `SCORE_VERSION` | Optional | `v1` / `v2` | Selects score algorithm version (`v1` default, `v2` sector-relative). |
| `ALPHAVANTAGE_API_KEY` | Optional (legacy provider paths) | `demo_or_real_key` | Used only by Alpha Vantage service/provider modules. |

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
npm run dev       # start Next.js in development mode
npm run build     # production build
npm run start     # run production server
npm run lint      # lint project
```

### Real mode quick start

```bash
# .env.local
DATA_MODE=real
NEXT_PUBLIC_DATA_MODE=real
POLYGON_API_KEY=your_polygon_key
CRON_SECRET=your_long_random_secret
PRELOAD_REQUIRE_ADMIN=1
```

---

## Monitoring

### Health endpoint
`GET /api/health` response shape:

```json
{
  "status": "ready",
  "lastUpdated": "2026-02-18T06:00:01.234Z",
  "universeSize": 50,
  "scoreVersion": "v2",
  "dataMode": "real",
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
- `preload.succeeded`
- `preload.failed`

Use these logs to detect slow refreshes, startup failures, and repeated reload churn.

### Operational checks
- Verify `lastUpdated` moves after manual/cron refresh.
- Alert when `status=error` persists.
- Track refresh duration (`durationMs`) from preload logs.

---

## Data Sources

- **Universe list**: `src/universe/top50MarketCap.ts`
- **Market prices/history**: Polygon.io APIs
- **Fundamentals**: Polygon.io Fundamentals API

---

## Portfolio Storage

Portfolio simulation data is stored locally in `data/portfolio.json` (gitignored). This keeps user-entered holdings private and easy to inspect/edit during local use.

---

## Rate Limits & Operational Notes

- Polygon free-tier limits are strict; grouped endpoints reduce fan-out.
- Cache-first serving keeps UI responsive even when upstream providers are slow.

---

## Disclaimer

For educational and exploratory use only. This project is **not** investment advice.
