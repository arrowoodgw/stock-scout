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
  const { scoreBreakdown: breakdown, scoreWeights: weights, scoreVersion } = enriched;
  const isV2 = scoreVersion === 'v2';

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
          {enriched.sector ? ` · ${enriched.sector}` : ''}
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
        <p className="subtle">
          Value Score
          {/* M5.4 – show version badge when v2 is active */}
          {isV2 && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.7rem',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(99,102,241,0.25)',
              color: 'rgb(165,180,252)',
              verticalAlign: 'middle',
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}>
              v2
            </span>
          )}
        </p>
        <p className="valueScore">{enriched.valueScore}/100</p>

        {/*
          M5.4 – Breakdown denominators are dynamic:
            • v1: each component is out of 25 (equal weights)
            • v2: each component is out of its configured weight (pe/ps/growth/margin)
          The weights are stamped on the EnrichedTicker at enrichment time so the
          client never needs to import server-only config.
        */}
        <dl className="scoreBreakdown">
          <div className="scoreBreakdownRow">
            <dt>P/E{isV2 && enriched.sector ? ' (sector-adj.)' : ''}</dt>
            <dd>{breakdown.peScore}/{weights.pe}</dd>
          </div>
          <div className="scoreBreakdownRow">
            <dt>P/S</dt>
            <dd>{breakdown.psScore}/{weights.ps}</dd>
          </div>
          <div className="scoreBreakdownRow">
            <dt>Revenue Growth</dt>
            <dd>{breakdown.revenueGrowthScore}/{weights.growth}</dd>
          </div>
          <div className="scoreBreakdownRow">
            <dt>Operating Margin{isV2 && enriched.sector ? ' (sector-adj.)' : ''}</dt>
            <dd>{breakdown.operatingMarginScore}/{weights.margin}</dd>
          </div>
        </dl>

        <p className="scoreExplanation">
          {isV2 ? (
            <>
              <strong>Score v2:</strong> P/E and Operating Margin are normalised against{' '}
              {enriched.sector ? `the ${enriched.sector} sector median` : 'the cross-sector median'}{' '}
              before scoring, so a P/E of 25 scores differently in tech (sector median ~30×)
              vs. banking (median ~12×). Weights: P/E&nbsp;{weights.pe} · P/S&nbsp;{weights.ps}{' '}
              · Growth&nbsp;{weights.growth} · Margin&nbsp;{weights.margin} pts.
              All scores are pre-calculated at startup.
            </>
          ) : (
            <>
              Each of four components contributes 0–25 points to a 0–100 total.
              All scores are pre-calculated at startup.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
