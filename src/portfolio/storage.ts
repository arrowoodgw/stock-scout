import { promises as fs } from 'fs';
import path from 'path';
import { PortfolioTrade } from './types';

const portfolioFile = path.join(process.cwd(), 'data', 'portfolio.json');

async function ensureDataDir() {
  await fs.mkdir(path.dirname(portfolioFile), { recursive: true });
}

export async function readPortfolioTrades(): Promise<PortfolioTrade[]> {
  try {
    const content = await fs.readFile(portfolioFile, 'utf8');
    const payload = JSON.parse(content) as { trades?: PortfolioTrade[] };
    return Array.isArray(payload.trades) ? payload.trades : [];
  } catch {
    return [];
  }
}

export async function writePortfolioTrades(trades: PortfolioTrade[]) {
  await ensureDataDir();
  await fs.writeFile(portfolioFile, JSON.stringify({ trades }, null, 2), 'utf8');
}
