/**
 * scripts/seedSecCikMap.ts
 *
 * Fetches the official SEC company-ticker mapping and writes a flat
 * ticker → CIK lookup to data/sec_cik_map.json.
 *
 * Run via:  npm run seed:sec
 *
 * The output file is keyed by UPPERCASE ticker symbol.
 * CIK values are zero-padded to 10 digits (the format SEC APIs expect).
 *
 * Source: https://www.sec.gov/files/company_tickers.json
 */

import { promises as fs } from 'fs';
import path from 'path';

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'sec_cik_map.json');

type SecTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecCompanyTickersResponse = Record<string, SecTickerEntry>;

/** sec_cik_map.json schema: ticker → { cik, name } */
export type SecCikMap = Record<string, { cik: string; name: string }>;

async function main() {
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  if (!userAgent) {
    console.error('ERROR: SEC_USER_AGENT environment variable is required.');
    console.error('  Set it to your name and email, e.g.: "Jane Doe jane@example.com"');
    process.exit(1);
  }

  console.log(`Fetching SEC ticker map from ${SEC_TICKERS_URL} …`);

  const response = await fetch(SEC_TICKERS_URL, {
    method: 'GET',
    headers: {
      'User-Agent': userAgent,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    console.error(`ERROR: SEC request failed with status ${response.status}.`);
    process.exit(1);
  }

  const payload = (await response.json()) as SecCompanyTickersResponse;

  const map: SecCikMap = {};

  for (const entry of Object.values(payload)) {
    const ticker = entry.ticker?.trim().toUpperCase();
    if (!ticker || !Number.isFinite(entry.cik_str)) continue;

    const cik = String(Math.trunc(entry.cik_str)).padStart(10, '0');
    const name = entry.title?.trim() ?? ticker;

    map[ticker] = { cik, name };
  }

  const count = Object.keys(map).length;
  console.log(`  → Parsed ${count} ticker entries.`);

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(map, null, 2), 'utf8');

  console.log(`  → Written to ${OUTPUT_PATH}`);
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
