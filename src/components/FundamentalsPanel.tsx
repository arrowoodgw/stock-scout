import { EnrichedTicker } from '@/types';
import { currencyFormatter, formatLargeCurrency, numberFormatter } from '@/utils/formatters';

type FundamentalsPanelProps = {
  enriched: EnrichedTicker;
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

export function FundamentalsPanel({ enriched }: FundamentalsPanelProps) {
  const { scoreBreakdown: breakdown } = enriched;

  const rows = [
    { label: 'Market Cap', value: renderLargeCurrency(enriched.marketCap) },
    { label: 'P/E (TTM)', value: renderNumber(enriched.peTtm) },
    { label: 'P/S', value: renderNumber(enriched.ps) },
    { label: 'EPS (TTM)', value: renderCurrency(enriched.epsTtm) },
    { label: 'Revenue (TTM)', value: renderLargeCurrency(enriched.revenueTtm) },
    { label: 'Revenue Year-over-Year Growth (%)', value: renderPercent(enriched.revenueGrowthYoY) },
    { label: 'Operating Margin (%)', value: renderPercent(enriched.operatingMargin) }
  ];

  return (
    <section className="fundamentalsPanel" aria-live="polite">
      <div className="fundamentalsHeader">
        <h2>Fundamentals</h2>
        <p className="subtle">
          {enriched.ticker}{enriched.companyName ? ` · ${enriched.companyName}` : ''}
          {enriched.fundamentalsAsOf ? ` · As of ${new Date(enriched.fundamentalsAsOf).toLocaleDateString()}` : ''}
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
        <p className="valueScore">{enriched.valueScore}/100</p>

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
            <dd>{breakdown.revenueGrowthScore}/25</dd>
          </div>
          <div className="scoreBreakdownRow">
            <dt>Operating Margin</dt>
            <dd>{breakdown.operatingMarginScore}/25</dd>
          </div>
        </dl>

        <p className="scoreExplanation">
          Each of four components contributes 0–25 points to a 0–100 total. All scores are pre-calculated at startup.
        </p>
      </div>
    </section>
  );
}
