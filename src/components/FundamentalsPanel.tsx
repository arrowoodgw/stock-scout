import { StockFundamentals } from '@/providers/types';
import { calculateValueScore } from '@/scoring/calculateValueScore';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

type FundamentalsPanelProps = {
  fundamentals: StockFundamentals;
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

export function FundamentalsPanel({ fundamentals }: FundamentalsPanelProps) {
  const valueScore = calculateValueScore(fundamentals);

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
        <p className="valueScore">{valueScore}/100</p>
        <p className="scoreExplanation">
          Score formula: lower P/E and P/S increase the score, while stronger revenue growth and operating margin add points.
        </p>
      </div>
    </section>
  );
}
