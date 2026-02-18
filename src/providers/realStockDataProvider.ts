import { top50MarketCap } from '@/universe/top50MarketCap';
import { HistoricalPoint, PriceRange, RequestOptions, StockDataProvider, StockQuote } from './types';

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store'
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    const message = (payload as { error?: string }).error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function quoteFromHistory(ticker: string, history: HistoricalPoint[]): StockQuote {
  const latest = history[history.length - 1];

  if (!latest) {
    throw new Error('No historical data available for ticker.');
  }

  return {
    ticker,
    price: latest.price,
    updatedAt: latest.date
  };
}

export class RealStockDataProvider implements StockDataProvider {
  async getLatestQuote(tickerInput: string, options?: RequestOptions): Promise<StockQuote> {
    const ticker = tickerInput.toUpperCase();
    const refreshQuery = options?.forceRefresh ? '?refresh=1' : '';

    try {
      if (top50MarketCap.tickers.includes(ticker as (typeof top50MarketCap.tickers)[number])) {
        const payload = await fetchJson<{ quotes: Record<string, { price: number; asOf: string }> }>(
          `/api/market/universe-quotes${refreshQuery}`
        );
        const quote = payload.quotes[ticker];

        if (quote) {
          return {
            ticker,
            price: quote.price,
            updatedAt: quote.asOf
          };
        }
      }

      const historyParams = new URLSearchParams({ ticker, range: '1Y' });
      if (options?.forceRefresh) {
        historyParams.set('refresh', '1');
      }

      const history = await fetchJson<HistoricalPoint[]>(`/api/market/history?${historyParams.toString()}`);
      return quoteFromHistory(ticker, history);
    } catch (error) {
      throw new Error(toErrorMessage(error, 'Could not load latest quote.'));
    }
  }

  async getHistoricalPrices(
    ticker: string,
    range: PriceRange,
    options?: RequestOptions
  ): Promise<HistoricalPoint[]> {
    const params = new URLSearchParams({ ticker: ticker.toUpperCase(), range });

    if (options?.forceRefresh) {
      params.set('refresh', '1');
    }

    try {
      return await fetchJson<HistoricalPoint[]>(`/api/market/history?${params.toString()}`);
    } catch (error) {
      throw new Error(toErrorMessage(error, 'Could not load historical prices.'));
    }
  }
}
