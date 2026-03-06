# Stock Scout SPEC v4.0 (March 2026)

## Goal
Modernize the data layer: replace slow sequential SEC EDGAR fundamentals with Polygon.io bulk Fundamentals API.  
Keep the beautiful provider abstraction, make the switch seamless, and remove all SEC dependencies.

## M6 Status – COMPLETE (live on main)
- Daily Vercel Cron + manual refresh + health endpoint + persistent snapshot + freshness UI
- Provider layer already in place (`src/providers/`)

## Current Fundamentals (to be replaced)
- `src/providers/secFundamentalsDataProvider.ts` (sequential EDGAR facts + CIK map)
- Requires `SEC_USER_AGENT`, `npm run seed:sec`, `data/sec_cik_map.json`

## M7 Milestones – Polygon Fundamentals Migration

### M7.1 – New PolygonFundamentalsDataProvider
**Acceptance Criteria**
- Create `src/providers/polygonFundamentalsDataProvider.ts` (bulk call, TTM income-statement + ratios + cash-flow).
- Returns exactly the same shape as the old SEC provider (`EnrichedFundamentals`).
- Respects `DATA_MODE=mock` (use existing mock).
- Heavily commented (match your style).

**Files**
- `src/providers/polygonFundamentalsDataProvider.ts` (new)

### M7.2 – Pluggable Provider System
**Acceptance Criteria**
- Update `src/providers/index.ts` to support `FUNDAMENTALS_PROVIDER=polygon|sec` (default: polygon).
- Env var `FUNDAMENTALS_PROVIDER` added to `.env.local.example`.
- `dataCache.ts` and preload use the selected provider.
- Backward-compatible (SEC still works if set).

**Files**
- `src/providers/index.ts`
- `src/lib/dataCache.ts`
- `.env.local.example`

### M7.3 – Remove SEC Dependencies
**Acceptance Criteria**
- Delete `src/providers/secFundamentalsDataProvider.ts`
- Remove `data/sec_cik_map.json`, `npm run seed:sec` script, CIK logic.
- Remove `SEC_USER_AGENT` from all env/docs.
- Update package.json scripts (remove seed:sec).
- Health endpoint no longer mentions SEC.

**Files**
- Delete: `src/providers/secFundamentalsDataProvider.ts`, `data/sec_cik_map.json`
- Update: `package.json`, `README.md` (partial), any remaining references

### M7.4 – Preload, Cache & Value Score Updates
**Acceptance Criteria**
- Preload now <15s even at 500 tickers.
- Update health endpoint to show active provider.
- Add structured log: `fundamentals.provider=polygon`.
- Value Score v2 continues to work unchanged (same data shape).

**Files**
- `src/lib/dataCache.ts`
- `app/api/health/route.ts`
- `src/scoring/calculateValueScore.ts` (if any tweaks needed)

### M7.5 – Full Documentation & Cleanup
**Acceptance Criteria**
- README fully updated: new “Data Providers” section, removed all SEC mentions, new env table, performance note (“Preload now <15s”).
- Add badge: “Fundamentals powered by Polygon.io”.
- Update SPEC-v3.md top note pointing to v4.

**Files**
- `README.md`
- `SPEC-v3.md` (minor note)

## Non-goals for M7
- FMP provider (optional M8)
- Database migration
- Forward estimates

## Implementation Rules
- Leverage existing provider abstraction (no duplication).
- Keep every comment style you added.
- Test: mock + real (both providers), cold start, cron, manual refresh.
- Claude updates README in final milestone.
- Commit after each: “M7.X – description”

Implement one at a time.