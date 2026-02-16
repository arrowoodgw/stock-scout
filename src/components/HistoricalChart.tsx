import { HistoricalPoint, PriceRange } from '@/providers/types';

type HistoricalChartProps = {
  data: HistoricalPoint[];
  ticker: string;
  range: PriceRange;
};

const chartWidth = 700;
const chartHeight = 280;
const padding = 24;

export function HistoricalChart({ data, ticker, range }: HistoricalChartProps) {
  if (data.length === 0) {
    return <p className="status">No chart data available.</p>;
  }

  const prices = data.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spread = maxPrice - minPrice || 1;

  const points = data
    .map((point, index) => {
      const x = padding + (index / Math.max(data.length - 1, 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - ((point.price - minPrice) / spread) * (chartHeight - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <section className="chartWrap">
      <h2 className="chartTitle">
        {ticker} · {range} Trend
      </h2>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart" role="img" aria-label={`${ticker} ${range} chart`}>
        <polyline fill="none" stroke="#1d4ed8" strokeWidth="3" points={points} />
      </svg>
      <div className="chartMeta">
        <span>Low: ${minPrice.toFixed(2)}</span>
        <span>High: ${maxPrice.toFixed(2)}</span>
      </div>
    </section>
  );
}
