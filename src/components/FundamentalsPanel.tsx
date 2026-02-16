import { StockFundamentals } from '@/providers/types';

type FundamentalsPanelProps = {
  fundamentals: StockFundamentals;
};

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function calculateValueScore(fundamentals: StockFundamentals) {
  const peComponent = Math.max(0, 35 - fundamentals.peTtm) * 1.2;
  const psComponent = Math.max(0, 12 - fundamentals.ps) * 1.5;
  const growthComponent = Math.max(0, fundamentals.revenueGrowthYoY) * 1.7;
  const marginComponent = Math.max(0, fundamentals.operatingMargin) * 1.3;

  return clampScore(peComponent + psComponent + growthComponent + marginComponent);
}

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

function formatLargeCurrency(value: number) {
  if (value >= 1_000_000_000_000) {
    return `${currencyFormatter.format(value / 1_000_000_000_000)}T`;
  }

  if (value >= 1_000_000_000) {
    return `${currencyFormatter.format(value / 1_000_000_000)}B`;
  }

  return currencyFormatter.format(value);
}

export function FundamentalsPanel({ fundamentals }: FundamentalsPanelProps) {
  const valueScore = calculateValueScore(fundamentals);

  const rows = [
    { label: 'Market Cap', value: formatLargeCurrency(fundamentals.marketCap) },
    { label: 'P/E (TTM)', value: numberFormatter.format(fundamentals.peTtm) },
    { label: 'P/S', value: numberFormatter.format(fundamentals.ps) },
    { label: 'EPS (TTM)', value: currencyFormatter.format(fundamentals.epsTtm) },
    { label: 'Revenue (TTM)', value: formatLargeCurrency(fundamentals.revenueTtm) },
    { label: 'Revenue Year-over-Year Growth (%)', value: `${fundamentals.revenueGrowthYoY.toFixed(1)}%` },
    { label: 'Operating Margin (%)', value: `${fundamentals.operatingMargin.toFixed(1)}%` }
  ];

  return (
    <section className="fundamentalsPanel" aria-live="polite">
      <div className="fundamentalsHeader">
        <h2>Fundamentals</h2>
        <p className="subtle">{fundamentals.ticker} snapshot (mocked)</p>
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
