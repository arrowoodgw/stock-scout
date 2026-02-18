import { StockFundamentals } from '@/providers/types';
import { ValueScoreBreakdown, calculateValueScore } from '@/scoring/calculateValueScore';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

type FundamentalsPanelProps = {
  fundamentals: StockFundamentals;
  scoreBreakdown?: ValueScoreBreakdown | null;
};

function renderNumber(value: number | null) {
  return value === null ? '—' : numberFormatter.format(value);
}

function renderPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function renderCurrency(value: number | null) {
  return value === null ? '—' : currencyFormatter.format(value);
}

function renderLargeCurrency(value: number | null) {
  return value === null ? '—' : formatLargeCurrency(value);
}

export function FundamentalsPanel({ fundamentals, scoreBreakdown }: FundamentalsPanelProps) {
  const scoreResult = calculateValueScore(fundamentals);
  const breakdown = scoreBreakdown ?? scoreResult.breakdown;

  const rows = [
    { label: 'Market Cap', value: renderLargeCurrency(fundamentals.marketCap) },
    { label: 'P/E (TTM)', value: renderNumber(fundamentals.peTtm) },
    { label: 'P/S', value: renderNumber(fundamentals.ps) },
    { label: 'EPS (TTM)', value: renderCurrency(fundamentals.epsTtm) },
    { label: 'Revenue (TTM)', value: renderLargeCurrency(fundamentals.revenueTtm) },
    { label: 'Revenue Year-over-Year Growth (%)', value: renderPercent(fundamentals.revenueGrowthYoY) },
    { label: 'Operating Margin (%)', value: renderPercent(fundamentals.operatingMargin) }
  ];

  return (
    <section className="fundamentalsPanel" aria-live="polite">
      <div className="fundamentalsHeader">
        <h2>Fundamentals</h2>
        <p className="subtle">
          {fundamentals.ticker} snapshot{fundamentals.asOf ? ` · As of ${new Date(fundamentals.asOf).toLocaleDateString()}` : ''}
        </p>
      </div>

      <dl className="fundamentalsGrid">
        {rows.map((row) => (
          <div key={row.label} className="fundamentalRow">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="valueScoreBox">
        <p className="subtle">Value Score</p>
        <p className="valueScore">{scoreResult.total}/100</p>

        <dl className="scoreBreakdown">
          <div className="scoreBreakdownRow">
            <dt>P/E</dt>
            <dd>{breakdown.peScore}/25</dd>
          </div>
          <div className="scoreBreakdownRow">
            <dt>P/S</dt>
            <dd>{breakdown.psScore}/25</dd>
          </div>
          <div className="scoreBreakdownRow">
            <dt>Revenue Growth</dt>
            <dd>{breakdown.growthScore}/25</dd>
          </div>
          <div className="scoreBreakdownRow">
            <dt>Operating Margin</dt>
            <dd>{breakdown.marginScore}/25</dd>
          </div>
        </dl>

        <p className="scoreExplanation">
          Each of four components contributes 0–25 points to a 0–100 total.
        </p>
      </div>
    </section>
  );
}
