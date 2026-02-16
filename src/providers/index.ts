import { MockStockDataProvider } from './mockStockDataProvider';
import { StockDataProvider } from './types';

export function getStockDataProvider(): StockDataProvider {
  return new MockStockDataProvider();
}
