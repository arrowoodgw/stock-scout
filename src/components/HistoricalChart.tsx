/**
 * src/components/HistoricalChart.tsx
 *
 * SVG line chart for a ticker's historical daily closing prices.
 *
 * Rendering approach:
 *   - Pure SVG polyline — no charting library dependency.
 *   - X axis: trading days evenly spaced across the full chart width.
 *   - Y axis: price normalised to fill the chart height (min→bottom, max→top).
 *   - A 24px padding on all sides prevents clipping at the edges.
 *
 * The chart is responsive via the SVG viewBox attribute (scales to its
 * container width without JavaScript).
 */

import { HistoricalPoint, PriceRange } from '@/providers/types';

type HistoricalChartProps = {
  /** Array of daily price data points from /api/market/history. */
  data: HistoricalPoint[];
  /** Ticker symbol — displayed in the chart heading. */
  ticker: string;
  /** Selected time range — displayed next to the ticker in the heading. */
  range: PriceRange;
};

/** SVG coordinate space dimensions (pixels). */
const chartWidth = 700;
const chartHeight = 280;
/** Inset from all four edges so the line never touches the SVG border. */
const padding = 24;

export function HistoricalChart({ data, ticker, range }: HistoricalChartProps) {
  if (data.length === 0) {
    return <p className="status">No chart data available.</p>;
  }

  const prices = data.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  // Prevent division by zero when all prices are identical.
  const spread = maxPrice - minPrice || 1;

  // Convert each (index, price) pair to an SVG "x,y" coordinate string.
  const points = data
    .map((point, index) => {
      // X: evenly distribute data points across the padded width.
      const x = padding + (index / Math.max(data.length - 1, 1)) * (chartWidth - padding * 2);
      // Y: invert because SVG y=0 is at the top; higher price → smaller y.
      const y = chartHeight - padding - ((point.price - minPrice) / spread) * (chartHeight - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <section className="chartWrap">
      <h2 className="chartTitle">
        {ticker} · {range} Trend
      </h2>
      {/* viewBox makes the chart scale to its container width automatically. */}
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart" role="img" aria-label={`${ticker} ${range} chart`}>
        <polyline fill="none" stroke="#2962ff" strokeWidth="3" points={points} />
      </svg>
      <div className="chartMeta">
        <span>Low: ${minPrice.toFixed(2)}</span>
        <span>High: ${maxPrice.toFixed(2)}</span>
      </div>
    </section>
  );
}
