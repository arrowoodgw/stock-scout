/**
 * src/lib/valueScore.ts
 *
 * Calculates the composite Value Score (0–100) and its four sub-scores.
 *
 * This function is the SINGLE authoritative implementation of the scoring formula.
 * It is called ONCE per ticker at preload time and stored in the cache.
 * No component, page, or route should call this function — they read from the cache.
 *
 * Formula overview (v1 – default)
 * ────────────────────────────────
 * Value Score = P/E Score + P/S Score + Revenue Growth Score + Operating Margin Score
 *
 * Each component is clamped to [0, 25] and rounded to the nearest integer.
 * The total is clamped to [0, 100].
 *
 * Why these four factors?
 *   • P/E  — traditional valuation relative to earnings
 *   • P/S  — valuation relative to revenue (useful when earnings are thin/negative)
 *   • Revenue Growth  — momentum; rewards companies growing their top line
 *   • Operating Margin — quality and efficiency; rewards profitable business models
 *
 * M5.4 additions (v2 – opt-in via SCORE_VERSION=v2)
 * ────────────────────────────────────────────────────
 * Set SCORE_VERSION=v2 in the server environment to enable v2 scoring.
 * The default is "v1", which preserves the original behavior exactly.
 *
 * v2 changes:
 *
 *   1. Sector-relative P/E
 *      A P/E of 25 means different things across sectors — cheap for high-multiple tech,
 *      expensive for low-multiple banks.  In v2 the raw P/E is normalised against the
 *      ticker's sector median before scoring:
 *
 *        adjustedPe = pe × (GLOBAL_REFERENCE_PE / sectorMedianPe)
 *
 *      A tech stock (sector median 30) with PE 25 gets adjustedPe = 25×(20/30) ≈ 16.7,
 *      scoring much better than the same PE 25 for a bank (sector median 12),
 *      which gets adjustedPe = 25×(20/12) ≈ 41.7.
 *
 *   2. Sector-relative Operating Margin
 *      Same idea — 10% margin is outstanding for retail but ordinary for software:
 *
 *        adjustedMargin = margin × (GLOBAL_REFERENCE_MARGIN / sectorMedianMargin)
 *
 *   3. Configurable component weights
 *      Each component contributes up to SCORE_WEIGHTS.X points (instead of always 25).
 *      Weights must sum to 100 for the total to remain on a 0–100 scale.
 *      Default v2 weights tilt toward quality/growth: { pe:20, ps:20, growth:30, margin:30 }.
 *
 *   4. scoreVersion is stamped on every EnrichedTicker for transparent audit.
 *      The scoreWeights are also stored so the UI knows the right denominator per component
 *      without importing server-only config.
 */

import { ScoreWeights, ValueScoreBreakdown } from '@/types';

// ---------------------------------------------------------------------------
// M5.4 – Scoring configuration
// ---------------------------------------------------------------------------

/**
 * Active score version — driven by the SCORE_VERSION environment variable.
 * "v1" (default): equal 25-point weights, no sector adjustment (current behavior unchanged).
 * "v2": configurable weights + sector-relative P/E and margin normalisation.
 *
 * Because this is read at module-init time on the server, changing SCORE_VERSION
 * requires a server restart (or redeploy) to take effect.
 */
export const SCORE_VERSION: 'v1' | 'v2' =
  process.env.SCORE_VERSION?.toLowerCase() === 'v2' ? 'v2' : 'v1';

/**
 * Max-point contribution per component.
 * Weights must sum to 100 so the composite score stays on a 0–100 scale.
 *
 * v1 (default): equal weights — identical to all pre-M5.4 behaviour.
 * v2 default: tilt toward quality/growth (margin + revenue get 30 pts each).
 */
export const SCORE_WEIGHTS: ScoreWeights =
  SCORE_VERSION === 'v2'
    ? { pe: 20, ps: 20, growth: 30, margin: 30 }   // v2: quality-tilted
    : { pe: 25, ps: 25, growth: 25, margin: 25 };   // v1: equal (default)

// ---------------------------------------------------------------------------
// M5.4 – Sector medians (v2 only)
// ---------------------------------------------------------------------------

/**
 * Approximate GICS-sector median trailing P/E ratios (2024–2025 consensus).
 * Used in v2 to normalise each ticker's P/E before scoring.
 * Tickers without a sector entry fall back to GLOBAL_REFERENCE_PE.
 */
export const SECTOR_PE_MEDIANS: Record<string, number> = {
  'Technology':                30,
  'Health Care':               22,
  'Financials':                12,
  'Consumer Discretionary':    20,
  'Consumer Staples':          22,
  'Industrials':               20,
  'Energy':                    12,
  'Materials':                 15,
  'Utilities':                 17,
  'Real Estate':               35,   // REITs trade at elevated P/E (use P/FFO in practice)
  'Communication Services':    22,
};

/** Cross-sector reference P/E — the normalisation target in v2. */
const GLOBAL_REFERENCE_PE = 20;

/**
 * Approximate GICS-sector median operating margins (%) (2024–2025 consensus).
 * Used in v2 to normalise each ticker's margin before scoring.
 * Tickers without a sector entry fall back to GLOBAL_REFERENCE_MARGIN.
 */
export const SECTOR_MARGIN_MEDIANS: Record<string, number> = {
  'Technology':                25,
  'Health Care':               15,
  'Financials':                22,   // net margin proxy (operating margin is less standard for banks)
  'Consumer Discretionary':     8,
  'Consumer Staples':           8,
  'Industrials':               12,
  'Energy':                    10,
  'Materials':                 12,
  'Utilities':                 15,
  'Real Estate':               30,
  'Communication Services':    15,
};

/** Cross-sector reference operating margin (%) for normalisation in v2. */
const GLOBAL_REFERENCE_MARGIN = 15;

// ---------------------------------------------------------------------------
// M5.4 – Ticker → GICS sector map (top-50 universe)
// ---------------------------------------------------------------------------

/**
 * Hardcoded GICS sector for each ticker in the top-50 universe.
 * Used in v2 to look up sector medians.  Tickers not present here receive
 * no sector-relative adjustment (global reference values are used instead).
 *
 * Update this map when the universe changes (M5.3 expansion).
 */
export const TICKER_SECTOR_MAP: Record<string, string> = {
  AAPL:  'Technology',
  MSFT:  'Technology',
  NVDA:  'Technology',
  AMZN:  'Consumer Discretionary',
  GOOGL: 'Communication Services',
  META:  'Communication Services',
  'BRK.B': 'Financials',
  TSM:   'Technology',
  TSLA:  'Consumer Discretionary',
  LLY:   'Health Care',
  AVGO:  'Technology',
  WMT:   'Consumer Staples',
  JPM:   'Financials',
  V:     'Financials',
  XOM:   'Energy',
  MA:    'Financials',
  UNH:   'Health Care',
  ORCL:  'Technology',
  COST:  'Consumer Staples',
  PG:    'Consumer Staples',
  JNJ:   'Health Care',
  HD:    'Consumer Discretionary',
  BAC:   'Financials',
  ABBV:  'Health Care',
  KO:    'Consumer Staples',
  MRK:   'Health Care',
  NFLX:  'Communication Services',
  CRM:   'Technology',
  CVX:   'Energy',
  AMD:   'Technology',
  ASML:  'Technology',
  SAP:   'Technology',
  PEP:   'Consumer Staples',
  ADBE:  'Technology',
  TMUS:  'Communication Services',
  MCD:   'Consumer Discretionary',
  NVO:   'Health Care',
  CSCO:  'Technology',
  AZN:   'Health Care',
  ACN:   'Technology',
  LIN:   'Materials',
  DIS:   'Communication Services',
  ABT:   'Health Care',
  WFC:   'Financials',
  INTU:  'Technology',
  TXN:   'Technology',
  DHR:   'Health Care',
  CMCSA: 'Communication Services',
  QCOM:  'Technology',
  PM:    'Consumer Staples',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a value to [0, 25] and round to the nearest integer. */
function clamp25(value: number): number {
  return Math.min(25, Math.max(0, Math.round(value)));
}

/** Clamp a value to [0, 100] and round to the nearest integer. */
function clamp100(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Clamp a value to [0, max] and round to the nearest integer (v2 weight-aware). */
function clampW(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

// ---------------------------------------------------------------------------
// v1 Sub-score functions (each returns an integer in [0, 25])
// These preserve the original pre-M5.4 behaviour exactly.
// ---------------------------------------------------------------------------

/**
 * P/E Score v1 (0–25)
 *
 * Lower P/E = better value.
 *   P/E ≤ 10  → 25 (full score)
 *   P/E = 40  →  0
 *   Linear interpolation between 10 and 40.
 *   P/E ≤ 0 or null → 0 (negative earnings, no score)
 */
export function calcPeScore(peTtm: number | null): number {
  if (peTtm == null || peTtm <= 0) return 0;
  // 25 * (1 - (pe - 10) / 30)  →  25 when pe=10, 0 when pe=40
  return clamp25(25 * (1 - (peTtm - 10) / 30));
}

/**
 * P/S Score v1 (0–25)
 *
 * Lower P/S = better value.
 *   P/S ≤ 1   → 25 (full score)
 *   P/S = 10  →  0
 *   Linear interpolation between 1 and 10.
 *   null → 0
 */
export function calcPsScore(ps: number | null): number {
  if (ps == null) return 0;
  // 25 * (1 - (ps - 1) / 9)  →  25 when ps=1, 0 when ps=10
  return clamp25(25 * (1 - (ps - 1) / 9));
}

/**
 * Revenue Growth Score v1 (0–25)
 *
 * Higher YoY growth = higher score.
 *   Growth ≥ 20% → 25 (full score)
 *   Growth ≤  0% →  0
 *   Linear interpolation between 0 and 20.
 *   Negative growth or null → 0
 */
export function calcRevenueGrowthScore(revenueGrowthYoY: number | null): number {
  if (revenueGrowthYoY == null || revenueGrowthYoY <= 0) return 0;
  // 25 * (growth / 20)  →  25 when growth=20, 0 when growth=0
  return clamp25((revenueGrowthYoY / 20) * 25);
}

/**
 * Operating Margin Score v1 (0–25)
 *
 * Higher margin = higher score.
 *   Margin ≥ 25% → 25 (full score)
 *   Margin ≤  0% →  0
 *   Linear interpolation between 0 and 25.
 *   Negative margin or null → 0
 */
export function calcOperatingMarginScore(operatingMargin: number | null): number {
  if (operatingMargin == null || operatingMargin <= 0) return 0;
  // 25 * (margin / 25)  →  25 when margin=25, 0 when margin=0
  return clamp25((operatingMargin / 25) * 25);
}

// ---------------------------------------------------------------------------
// v2 Sub-score functions (sector-relative, weight-scaled)
// Only called when SCORE_VERSION === "v2".
// ---------------------------------------------------------------------------

/**
 * P/E Score v2 (0–weight)
 *
 * Same linear ramp as v1, but applied to a sector-normalised P/E:
 *   adjustedPe = pe × (GLOBAL_REFERENCE_PE / sectorMedianPe)
 *
 * This makes a PE of 25 score ~17 pts (out of 20) for a tech stock
 * (sector median 30) but only ~2 pts for a bank stock (sector median 12),
 * reflecting that 25× earnings is cheap in tech and expensive in banking.
 *
 * Falls back to GLOBAL_REFERENCE_PE when the sector is unknown.
 */
function calcPeScoreV2(pe: number | null, sector: string | null, weight: number): number {
  if (pe == null || pe <= 0) return 0;
  const sectorMedian = sector != null ? (SECTOR_PE_MEDIANS[sector] ?? GLOBAL_REFERENCE_PE) : GLOBAL_REFERENCE_PE;
  const adjustedPe = pe * (GLOBAL_REFERENCE_PE / sectorMedian);
  // Same ramp as v1 (full score at 10, zero at 40), scaled to the component weight.
  return clampW(weight * (1 - (adjustedPe - 10) / 30), weight);
}

/**
 * P/S Score v2 (0–weight)
 *
 * No sector adjustment (P/S is already reasonably cross-sector comparable).
 * Same ramp as v1, scaled to the component weight.
 */
function calcPsScoreV2(ps: number | null, weight: number): number {
  if (ps == null) return 0;
  return clampW(weight * (1 - (ps - 1) / 9), weight);
}

/**
 * Revenue Growth Score v2 (0–weight)
 *
 * No sector adjustment — growth is rewarded uniformly regardless of sector.
 * Same ramp as v1 (full score at 20% growth), scaled to the component weight.
 */
function calcGrowthScoreV2(growth: number | null, weight: number): number {
  if (growth == null || growth <= 0) return 0;
  return clampW((growth / 20) * weight, weight);
}

/**
 * Operating Margin Score v2 (0–weight)
 *
 * Same idea as P/E v2 — margin is normalised against the sector median:
 *   adjustedMargin = margin × (GLOBAL_REFERENCE_MARGIN / sectorMedianMargin)
 *
 * A 10% margin scores ~15 pts (out of 30) for a retailer (sector median 8%)
 * but only ~6 pts for a software company (sector median 25%), because 10% is
 * impressive in retail yet below par in SaaS.
 */
function calcMarginScoreV2(margin: number | null, sector: string | null, weight: number): number {
  if (margin == null || margin <= 0) return 0;
  const sectorMedian = sector != null ? (SECTOR_MARGIN_MEDIANS[sector] ?? GLOBAL_REFERENCE_MARGIN) : GLOBAL_REFERENCE_MARGIN;
  const adjustedMargin = margin * (GLOBAL_REFERENCE_MARGIN / sectorMedian);
  // Full score at 25% adjusted margin, zero at 0% — same ramp as v1, weight-scaled.
  return clampW((adjustedMargin / 25) * weight, weight);
}

// ---------------------------------------------------------------------------
// Composite scorer — the only public entry point for scoring
// ---------------------------------------------------------------------------

export type ValueScoreResult = {
  /** Composite score 0–100. */
  total: number;
  /**
   * Breakdown of the four sub-scores.
   * Upper bound per component = weights.X (25 in v1, configurable in v2).
   */
  breakdown: ValueScoreBreakdown;
  /** Score formula version applied. */
  scoreVersion: 'v1' | 'v2';
  /** Component weights used — stamp these on EnrichedTicker for the UI. */
  weights: ScoreWeights;
};

/**
 * Calculate the full Value Score for one ticker.
 *
 * Called ONCE per ticker at preload time.  Result is stored in the cache.
 * Never call this from a component or on page navigation.
 *
 * M5.4: accepts an optional `sector` for v2 sector-relative adjustments.
 * In v1 mode (default), `sector` is ignored and behavior is identical to
 * the pre-M5.4 implementation.
 */
export function calculateValueScore(params: {
  peTtm: number | null;
  ps: number | null;
  revenueGrowthYoY: number | null;
  operatingMargin: number | null;
  /** M5.4 – ticker's GICS sector; used only when SCORE_VERSION === "v2". */
  sector?: string | null;
}): ValueScoreResult {
  const w = SCORE_WEIGHTS;

  let peScore: number;
  let psScore: number;
  let revenueGrowthScore: number;
  let operatingMarginScore: number;

  if (SCORE_VERSION === 'v2') {
    // v2: sector-relative P/E and margin, weight-scaled components.
    // See function-level JSDoc above for the normalisation rationale.
    const sector = params.sector ?? null;
    peScore           = calcPeScoreV2(params.peTtm, sector, w.pe);
    psScore           = calcPsScoreV2(params.ps, w.ps);
    revenueGrowthScore  = calcGrowthScoreV2(params.revenueGrowthYoY, w.growth);
    operatingMarginScore = calcMarginScoreV2(params.operatingMargin, sector, w.margin);
  } else {
    // v1 (default): identical to pre-M5.4 behaviour — no sector adjustment,
    // equal 25-point weights.  This branch must never change.
    peScore           = calcPeScore(params.peTtm);
    psScore           = calcPsScore(params.ps);
    revenueGrowthScore  = calcRevenueGrowthScore(params.revenueGrowthYoY);
    operatingMarginScore = calcOperatingMarginScore(params.operatingMargin);
  }

  return {
    total: clamp100(peScore + psScore + revenueGrowthScore + operatingMarginScore),
    breakdown: { peScore, psScore, revenueGrowthScore, operatingMarginScore },
    scoreVersion: SCORE_VERSION,
    weights: w,
  };
}
