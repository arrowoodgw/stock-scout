/**
 * src/components/PriceCard.tsx
 *
 * Small presentational card that displays the latest price for a stock.
 * Shown at the top of the Ticker Detail view, above the historical chart.
 *
 * aria-live="polite" causes screen readers to announce price changes when
 * the user switches tickers or clicks "Refresh data".
 */

import { StockQuote } from '@/providers/types';

type PriceCardProps = {
  /** The quote to display, containing ticker, price, and updatedAt timestamp. */
  quote: StockQuote;
};

export function PriceCard({ quote }: PriceCardProps) {
  return (
    <section className="priceCard" aria-live="polite">
      <p className="subtle">Latest price</p>
      <p className="priceLine">
        {quote.ticker} · ${quote.price.toFixed(2)}
      </p>
      <p className="subtle">Updated: {new Date(quote.updatedAt).toLocaleString()}</p>
    </section>
  );
}
