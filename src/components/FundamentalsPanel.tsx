import { StockFundamentals } from '@/providers/types';
import { calculateValueScore } from '@/scoring/calculateValueScore';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

type FundamentalsPanelProps = {
  fundamentals: StockFundamentals;
};

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
