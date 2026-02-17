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

export class RealStockDataProvider implements StockDataProvider {
  async getLatestQuote(ticker: string, options?: RequestOptions): Promise<StockQuote> {
    const params = new URLSearchParams({ ticker: ticker.toUpperCase() });

    if (options?.forceRefresh) {
      params.set('refresh', '1');
    }

    try {
      return await fetchJson<StockQuote>(`/api/market/quote?${params.toString()}`);
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
