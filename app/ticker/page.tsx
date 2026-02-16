import { TickerDetailView } from '@/components/TickerDetailView';

type TickerPageProps = {
  searchParams: {
    ticker?: string;
  };
};

export default function TickerPage({ searchParams }: TickerPageProps) {
  const initialTicker = searchParams.ticker?.trim().toUpperCase() || 'AAPL';

  return (
    <main className="page">
      <TickerDetailView initialTicker={initialTicker} />
    </main>
  );
}
