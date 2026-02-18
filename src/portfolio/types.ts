export type PortfolioTrade = {
  ticker: string;
  shares: number;
  priceAtBuy: number;
  date: string;
  valueScoreAtBuy: number | null;
};
