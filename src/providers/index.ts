import { CachedMockFundamentalsDataProvider } from './cachedMockFundamentalsDataProvider';
import { MockStockDataProvider } from './mockStockDataProvider';
import { PolygonStockDataProvider } from './polygonStockDataProvider';
import { FundamentalsDataProvider, StockDataProvider } from './types';

const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? process.env.DATA_MODE ?? 'mock').toLowerCase();

const stockProvider: StockDataProvider = dataMode === 'real' ? new PolygonStockDataProvider() : new MockStockDataProvider();

// M7.3 – SEC provider removed. Polygon fundamentals provider arrives in M7.1.
const fundamentalsProvider: FundamentalsDataProvider = new CachedMockFundamentalsDataProvider();

export function getStockDataProvider(): StockDataProvider {
  return stockProvider;
}

export function getFundamentalsDataProvider(): FundamentalsDataProvider {
  return fundamentalsProvider;
}
