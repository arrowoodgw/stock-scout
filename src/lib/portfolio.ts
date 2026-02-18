import { promises as fs } from 'fs';
import path from 'path';

export type PortfolioHolding = {
  ticker: string;
  shares: number;
  purchasePrice: number;
  purchaseDate: string; // ISO date string
};

export type Portfolio = {
  holdings: PortfolioHolding[];
};

const portfolioFile = path.join(process.cwd(), 'data', 'portfolio.json');

async function ensureDataDir() {
  await fs.mkdir(path.dirname(portfolioFile), { recursive: true });
}

export async function readPortfolio(): Promise<Portfolio> {
  try {
    const content = await fs.readFile(portfolioFile, 'utf8');
    const payload = JSON.parse(content) as { holdings?: PortfolioHolding[] };
    return { holdings: Array.isArray(payload.holdings) ? payload.holdings : [] };
  } catch {
    return { holdings: [] };
  }
}

export async function writePortfolio(portfolio: Portfolio) {
  await ensureDataDir();

  // Preserve any other keys already in the file (e.g. legacy 'trades')
  let existing: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(portfolioFile, 'utf8');
    existing = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // file does not exist yet — start fresh
  }

  await fs.writeFile(
    portfolioFile,
    JSON.stringify({ ...existing, holdings: portfolio.holdings }, null, 2),
    'utf8'
  );
}
