# Stock Scout SPEC v3.0 (February 2026)

> **Superseded by [SPEC-v4.md](./SPEC-v4.md)** — M7 migrates fundamentals from SEC EDGAR to Polygon.io and is tracked there. This document covers M5 and M6 (both complete).

## Goal
Production-ready stock scouting app with fully automated data pipeline.

## M5 Status – COMPLETE (local implementation)
- M5.1 Zero-Client-Fetch via React Server Components → done (public)
- M5.2 Persistent Cache Snapshot → done (local)
- M5.3 Dynamic Top-N Universe (`UNIVERSE_SIZE` env var) → done (local)
- M5.4 Value Score v2 (sector-relative + weights) → done (local)
- Manual refresh via /api/preload already exists

## M6 Milestones – Production Automated Refresh Pipeline

### M6.1 – Vercel Cron Job for Daily Preload
**Acceptance Criteria**
- Vercel Cron runs daily at 06:00 UTC (configurable).
- New route `/api/cron/refresh` (POST only) that reuses existing preload logic.
- Protected by `CRON_SECRET` env var (Vercel auto-sets it).
- Works with both `DATA_MODE=mock` and `real`.
- Atomic cache replace + snapshot JSON update.

**Files**
- `vercel.json` (new)
- `app/api/cron/refresh/route.ts` (new)
- `src/lib/dataCache.ts` (expose `triggerRefresh()`)
- `.env.local.example`

### M6.2 – Enhance Existing Manual Refresh + Freshness UI
**Acceptance Criteria**
- Keep `/api/preload` but add optional `?admin=1` protection (or just keep open for dev).
- Add “Refresh Data Now” button + live “Data age: X min” badge on rankings page (uses existing polling).
- Show lastUpdated from cache.
- Success toast + spinner.

**Files**
- `src/components/RankingsClient.tsx` (enhance existing button)
- `src/lib/dataCache.ts`

### M6.3 – Cache Health Endpoint & Better Logging
**Acceptance Criteria**
- `GET /api/health` → `{ status, lastUpdated, universeSize, scoreVersion: "v2", dataMode, cacheState }`
- Structured logs with timestamps for preload events.
- Error state visible in health check.

**Files**
- `app/api/health/route.ts` (new)
- `src/lib/dataCache.ts`

### M6.4 – Full README Refresh
**Acceptance Criteria**
- README now shows complete M5 + M6 architecture.
- New sections: “Data Freshness Pipeline”, “Vercel Deployment”, “All Environment Variables”, “Monitoring”.
- Badges: “Data refreshed daily at 06:00 UTC”.

**Files**
- `README.md`

## Implementation Rules
- Reuse existing preload code (no duplication).
- Test in mock + real mode.
- Claude updates README in final step.
- Commit after each milestone: “M6.X – description”

Implement one at a time.