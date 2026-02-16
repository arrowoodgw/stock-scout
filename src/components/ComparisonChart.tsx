export type ComparisonPoint = {
  label: string;
  portfolio: number;
  benchmark: number;
};

type ComparisonChartProps = {
  data: ComparisonPoint[];
};

const chartWidth = 700;
const chartHeight = 280;
const padding = 24;

function buildPath(values: number[], minValue: number, maxValue: number) {
  const spread = maxValue - minValue || 1;

  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - ((value - minValue) / spread) * (chartHeight - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

export function ComparisonChart({ data }: ComparisonChartProps) {
  if (!data.length) {
    return <p className="status">No comparison data available.</p>;
  }

  const allValues = data.flatMap((point) => [point.portfolio, point.benchmark]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  const portfolioPath = buildPath(
    data.map((point) => point.portfolio),
    minValue,
    maxValue
  );
  const benchmarkPath = buildPath(
    data.map((point) => point.benchmark),
    minValue,
    maxValue
  );

  return (
    <section className="chartWrap">
      <h2 className="chartTitle">Portfolio vs SPY (normalized to 100)</h2>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart" role="img" aria-label="Portfolio vs benchmark chart">
        <polyline fill="none" stroke="#1d4ed8" strokeWidth="3" points={portfolioPath} />
        <polyline fill="none" stroke="#7c3aed" strokeWidth="3" points={benchmarkPath} />
      </svg>
      <div className="chartLegend">
        <span className="portfolio">Portfolio</span>
        <span className="benchmark">SPY</span>
      </div>
      <div className="chartMeta">
        <span>Min: {minValue.toFixed(2)}</span>
        <span>Max: {maxValue.toFixed(2)}</span>
      </div>
    </section>
  );
}
