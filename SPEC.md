# Stock Scout SPEC v2.0 (February 2026)

## Goal
A web app that tracks stock price performance and identifies potentially undervalued buys using fundamentals, price history, and a transparent Value Score.  
**New hard requirements for M5:**
- All data + every calculated value (valueScore, scoreBreakdown, etc.) must be in the frontend **on first paint** (zero client-side fetch for the main rankings table).
- Support scaling beyond Top 50 (target: Top 200 easily configurable).
- Improve the Value Score based on the critique below while keeping it deterministic and pre-computed on the server.

## Current State (M4 – live code)
- Universe: static Top 50 in `src/universe/top50MarketCap.ts`
- Data: full preload at startup (`instrumentation.ts` → `dataCache.triggerPreload()`)
- Cache: singleton `EnrichedTicker[]` in `src/lib/dataCache.ts` (states: cold/loading/ready/error)
- All calculations in `src/lib/valueScore.ts` (4 equal components: PE, PS, Revenue Growth, Operating Margin)
- APIs (`/api/rankings`, `/api/ticker`) are cache-only
- Frontend: still does client-side `fetch` on mount (the gap we are fixing)

## Value Score Critique (basis for M5.4)
Strengths: clean, transparent, linear ramps, conservative (null/negative = 0).  
Weaknesses to address:
- No sector relativity (P/E 25 is cheap for banks, expensive for tech).
- Equal weighting may undervalue growth/quality.
- Linear ramps vs S-curve.
- Missing FCF yield / balance sheet / momentum (keep simple for now).

## M5 Milestones (implement sequentially)

### M5.1 – Zero-Client-Fetch via React Server Components
**Acceptance Criteria**
- `app/page.tsx` (and any other main pages) is an async Server Component.
- Calls new `getCacheSnapshot()` that awaits preload if needed.
- Passes `{ initialData: EnrichedTicker[], lastUpdated: string }` to a `'use client'` component (e.g. `RankingsClient`).
- Client component uses `useState(initialData)` – **no fetch/SWR on mount**.
- Loading state only shows if cache is still cold (very brief on cold start).
- All existing sorting/filtering still works on the in-memory array.
- Other pages (ticker detail, portfolio) updated the same way where possible.

**Files to change**
- `src/lib/dataCache.ts` (add `getCacheSnapshot()`)
- `app/page.tsx`
- Any client components that currently fetch `/api/rankings` on mount
- Update README with new architecture note

### M5.2 – Persistent Cache Snapshot
**Acceptance Criteria**
- After successful preload, write full snapshot to `data/cache-snapshot.json` (gitignored).
- On cold start, attempt to load snapshot first (instant "ready" state), then refresh in background.
- Add `CACHE_SNAPSHOT_ENABLED=true` env var (default true).

**Files to change**
- `src/lib/dataCache.ts`
- (optional) `.gitignore`

### M5.3 – Dynamic Top-N Universe (200+ stocks)
**Acceptance Criteria**
- Replace static `top50MarketCap.ts` with `getTopNMarketCap(n: number)` (default 200).
- Support `UNIVERSE_SIZE` env var (default 200).
- Provide an updated ticker list for Top 200 (or a script to generate it).
- Preload still completes in reasonable time (Polygon grouped-daily handles 500+ easily; SEC is the bottleneck – note it).
- Rankings page shows "Top {universeSize} by Value Score".

**Files to change**
- `src/universe/` (new or refactored file)
- `src/lib/dataCache.ts`
- `app/page.tsx` (use the new size in title)
- Add Top-200 ticker array (I can provide it if needed)

### M5.4 – Value Score v2 (sector-relative + weights)
**Acceptance Criteria**
- Keep backward-compatible (existing scores unchanged unless opted in).
- Add optional sector-relative adjustment for PE and Margin (hardcoded sector medians map is fine).
- Make component weights configurable via a const object in `valueScore.ts` (or env).
- Add `scoreVersion: "v1" | "v2"` to `EnrichedTicker`.
- Update breakdown display to show the new logic.
- Keep all calculations server-side only.

**Files to change**
- `src/lib/valueScore.ts`
- `src/types/index.ts`
- (optional) UI to show "v2" badge or tooltip

## Non-goals for M5
- Real database (Supabase etc.)
- Forward estimates
- User-defined universes
- New data providers (FMP etc.) – keep Polygon + SEC for now

## Implementation Rules
- Preserve all existing behavior when flags are off/default.
- Add clear comments referencing this SPEC.
- No breaking changes to portfolio or out-of-universe tickers.
- Test in both `DATA_MODE=mock` and `real`.

Implement one milestone at a time. After each, run `npm run dev`, verify the acceptance criteria, then commit with message "M5.X – description".