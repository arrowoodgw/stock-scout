import { StockQuote } from '@/providers/types';

type PriceCardProps = {
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
