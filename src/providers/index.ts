import { CachedMockFundamentalsDataProvider } from './cachedMockFundamentalsDataProvider';
import { MockStockDataProvider } from './mockStockDataProvider';
import { AlphaVantageStockDataProvider } from './alphaVantageStockDataProvider';
import { FundamentalsDataProvider, StockDataProvider } from './types';
import { SecFundamentalsDataProvider } from './secFundamentalsDataProvider';

const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? process.env.DATA_MODE ?? 'mock').toLowerCase();

const stockProvider: StockDataProvider = dataMode === 'real' ? new AlphaVantageStockDataProvider() : new MockStockDataProvider();

const fundamentalsProvider: FundamentalsDataProvider =
  dataMode === 'real' ? new SecFundamentalsDataProvider() : new CachedMockFundamentalsDataProvider();

export function getStockDataProvider(): StockDataProvider {
  return stockProvider;
}

export function getFundamentalsDataProvider(): FundamentalsDataProvider {
  return fundamentalsProvider;
}
