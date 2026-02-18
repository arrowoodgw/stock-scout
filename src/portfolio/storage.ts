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

  // Preserve any other keys already in the file (e.g. new 'holdings' key)
  let existing: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(portfolioFile, 'utf8');
    existing = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // file does not exist yet
  }

  await fs.writeFile(portfolioFile, JSON.stringify({ ...existing, trades }, null, 2), 'utf8');
}
