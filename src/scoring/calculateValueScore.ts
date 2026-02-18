import { StockFundamentals } from '@/providers/types';

export type ValueScoreBreakdown = {
  peScore: number;
  psScore: number;
  growthScore: number;
  marginScore: number;
};

export type ValueScoreResult = {
  total: number;
  breakdown: ValueScoreBreakdown;
};

function clampComponent(value: number) {
  return Math.min(25, Math.max(0, Math.round(value)));
}

function clampTotal(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateValueScore(fundamentals: StockFundamentals): ValueScoreResult {
  const pe = fundamentals.peTtm;
  const peScore = pe == null || pe <= 0
    ? 0
    : clampComponent(25 * (1 - (pe - 10) / 30));

  const psScore = clampComponent(25 * (1 - ((fundamentals.ps ?? 10) - 1) / 9));

  const growthScore = clampComponent((Math.max(0, fundamentals.revenueGrowthYoY ?? 0) / 30) * 25);

  const marginScore = clampComponent((Math.max(0, fundamentals.operatingMargin ?? 0) / 25) * 25);

  return {
    total: clampTotal(peScore + psScore + growthScore + marginScore),
    breakdown: { peScore, psScore, growthScore, marginScore }
  };
}
