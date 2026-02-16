export type PriceRange = '1M' | '6M' | '1Y';

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
  marketCap: number;
  peTtm: number;
  ps: number;
  epsTtm: number;
  revenueTtm: number;
  revenueGrowthYoY: number;
  operatingMargin: number;
};

export interface StockDataProvider {
  getLatestQuote(ticker: string): Promise<StockQuote>;
  getHistoricalPrices(ticker: string, range: PriceRange): Promise<HistoricalPoint[]>;
}

export interface FundamentalsDataProvider {
  getFundamentals(ticker: string): Promise<StockFundamentals>;
}
