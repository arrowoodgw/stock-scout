import { CachedMockFundamentalsDataProvider } from './cachedMockFundamentalsDataProvider';
import { MockStockDataProvider } from './mockStockDataProvider';
import { RealStockDataProvider } from './realStockDataProvider';
import { FundamentalsDataProvider, StockDataProvider } from './types';

const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? process.env.DATA_MODE ?? 'mock').toLowerCase();

const stockProvider: StockDataProvider = dataMode === 'real' ? new RealStockDataProvider() : new MockStockDataProvider();

const fundamentalsProvider: FundamentalsDataProvider = new CachedMockFundamentalsDataProvider();

export function getStockDataProvider(): StockDataProvider {
  return stockProvider;
}

export function getFundamentalsDataProvider(): FundamentalsDataProvider {
  return fundamentalsProvider;
}
