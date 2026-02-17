import { FundamentalsDataProvider, StockFundamentals } from './types';

type FundamentalsConfig = Omit<StockFundamentals, 'ticker' | 'asOf'>;

const knownFundamentals: Record<string, FundamentalsConfig> = {
  AAPL: {
    marketCap: 2_950_000_000_000,
    peTtm: 29.4,
    ps: 7.5,
    epsTtm: 6.43,
    revenueTtm: 383_300_000_000,
    revenueGrowthYoY: 2.8,
    operatingMargin: 30.1
  },
  MSFT: {
    marketCap: 3_120_000_000_000,
    peTtm: 35.2,
    ps: 12.6,
    epsTtm: 11.8,
    revenueTtm: 236_600_000_000,
    revenueGrowthYoY: 15.4,
    operatingMargin: 44.6
  }
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function tickerToSeed(ticker: string) {
  return ticker.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildDefaultFundamentals(ticker: string): FundamentalsConfig {
  const seed = tickerToSeed(ticker.toUpperCase());

  return {
    marketCap: 8_000_000_000 + (seed % 300) * 1_000_000_000,
    peTtm: 12 + (seed % 35),
    ps: 1 + (seed % 10) * 0.45,
    epsTtm: 1.2 + (seed % 80) / 10,
    revenueTtm: 6_000_000_000 + (seed % 220) * 900_000_000,
    revenueGrowthYoY: -4 + (seed % 18) * 1.5,
    operatingMargin: 5 + (seed % 26) * 1.2
  };
}

export class MockFundamentalsDataProvider implements FundamentalsDataProvider {
  async getFundamentals(ticker: string): Promise<StockFundamentals> {
    await delay(380);

    const normalizedTicker = ticker.toUpperCase();
    const known = knownFundamentals[normalizedTicker];

    return {
      ticker: normalizedTicker,
      asOf: new Date().toISOString(),
      ...(known ?? buildDefaultFundamentals(normalizedTicker))
    };
  }
}
