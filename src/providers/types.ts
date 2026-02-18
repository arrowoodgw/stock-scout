export type PriceRange = '1M' | '6M' | '1Y';

export type RequestOptions = {
  forceRefresh?: boolean;
};

export type StockQuote = {
  ticker: string;
  price: number;
  updatedAt: string;
};

export type HistoricalPoint = {
  date: string;
  price: number;
};

export type StockFundamentals = {
  ticker: string;
  marketCap: number | null;
  peTtm: number | null;
  ps: number | null;
  epsTtm: number | null;
  revenueTtm: number | null;
  revenueGrowthYoY: number | null;
  operatingMargin: number | null;
  asOf: string | null;
  /** Shares outstanding from SEC EDGAR; used server-side to compute P/S. Not rendered in UI. */
  sharesOutstanding?: number | null;
};

export interface StockDataProvider {
  getLatestQuote(ticker: string, options?: RequestOptions): Promise<StockQuote>;
  getHistoricalPrices(ticker: string, range: PriceRange, options?: RequestOptions): Promise<HistoricalPoint[]>;
}

export interface FundamentalsDataProvider {
  getFundamentals(ticker: string, options?: RequestOptions): Promise<StockFundamentals>;
}
