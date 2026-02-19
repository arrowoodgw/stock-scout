/**
 * src/lib/valueScore.ts
 *
 * Calculates the composite Value Score (0–100) and its four sub-scores (0–25 each).
 *
 * This function is the SINGLE authoritative implementation of the scoring formula.
 * It is called ONCE per ticker at preload time and stored in the cache.
 * No component, page, or route should call this function — they read from the cache.
 *
 * Formula overview
 * ────────────────
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
 */

import { ValueScoreBreakdown } from '@/types';

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

// ---------------------------------------------------------------------------
// Sub-score functions (each returns an integer in [0, 25])
// ---------------------------------------------------------------------------

/**
 * P/E Score (0–25)
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
 * P/S Score (0–25)
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
 * Revenue Growth Score (0–25)
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
 * Operating Margin Score (0–25)
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
// Composite scorer — the only public entry point for scoring
// ---------------------------------------------------------------------------

export type ValueScoreResult = {
  /** Composite score 0–100. */
  total: number;
  /** Breakdown of the four sub-scores (each 0–25). */
  breakdown: ValueScoreBreakdown;
};

/**
 * Calculate the full Value Score for one ticker.
 *
 * Called ONCE per ticker at preload time. Result is stored in the cache.
 * Never call this from a component or on page navigation.
 */
export function calculateValueScore(params: {
  peTtm: number | null;
  ps: number | null;
  revenueGrowthYoY: number | null;
  operatingMargin: number | null;
}): ValueScoreResult {
  const peScore = calcPeScore(params.peTtm);
  const psScore = calcPsScore(params.ps);
  const revenueGrowthScore = calcRevenueGrowthScore(params.revenueGrowthYoY);
  const operatingMarginScore = calcOperatingMarginScore(params.operatingMargin);

  return {
    total: clamp100(peScore + psScore + revenueGrowthScore + operatingMarginScore),
    breakdown: { peScore, psScore, revenueGrowthScore, operatingMarginScore }
  };
}
