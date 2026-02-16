import { StockFundamentals } from '@/providers/types';

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateValueScore(fundamentals: StockFundamentals) {
  const peComponent = Math.max(0, 35 - fundamentals.peTtm) * 1.2;
  const psComponent = Math.max(0, 12 - fundamentals.ps) * 1.5;
  const growthComponent = Math.max(0, fundamentals.revenueGrowthYoY) * 1.7;
  const marginComponent = Math.max(0, fundamentals.operatingMargin) * 1.3;

  return clampScore(peComponent + psComponent + growthComponent + marginComponent);
}
