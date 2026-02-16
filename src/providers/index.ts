import { MockFundamentalsDataProvider } from './mockFundamentalsDataProvider';
import { MockStockDataProvider } from './mockStockDataProvider';
import { FundamentalsDataProvider, StockDataProvider } from './types';

export function getStockDataProvider(): StockDataProvider {
  return new MockStockDataProvider();
}

export function getFundamentalsDataProvider(): FundamentalsDataProvider {
  return new MockFundamentalsDataProvider();
}
