/**
 * src/universe/tickerUniverse.ts
 *
 * M5.3 – Dynamic Top-N Universe
 *
 * Single source of truth for the ranked ticker universe.
 * Replaces the static top50MarketCap list with a 200-entry array and a
 * configurable slice function so UNIVERSE_SIZE can be changed without
 * touching code.
 *
 * Ordering: approximately descending U.S. market cap as of February 2026.
 * Source: CompaniesMarketCap (public, updated daily). Includes major U.S.-
 * listed ADRs (TSM, ASML, SAP, NVO, AZN) that appear in the global top ranks.
 *
 * To extend beyond 200 stocks:
 *   1. Append tickers to TICKER_UNIVERSE below (keep descending-cap order).
 *   2. Set UNIVERSE_SIZE= in .env.local (or leave at 200 for the full list).
 * SEC EDGAR is the throughput bottleneck in real mode (~2 s/ticker).
 */

/** Full ticker universe, approximately ordered by descending market cap. */
export const TICKER_UNIVERSE: readonly string[] = [
  // ── 1–51 (original universe, preserved in order) ─────────────────────────
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META',  'BRK.B','TSM',  'TSLA', 'LLY',
  'AVGO', 'WMT',  'JPM',  'V',    'XOM',   'MA',    'UNH',  'ORCL', 'COST', 'PG',
  'JNJ',  'HD',   'BAC',  'ABBV', 'KO',    'MRK',   'NFLX', 'CRM',  'CVX',  'AMD',
  'ASML', 'SAP',  'PEP',  'ADBE', 'TMUS',  'MCD',   'NVO',  'CSCO', 'AZN',  'ACN',
  'LIN',  'DIS',  'ABT',  'WFC',  'INTU',  'TXN',   'DHR',  'CMCSA','QCOM', 'PM',

  // ── 52–61 ─────────────────────────────────────────────────────────────────
  'GS',   'RTX',  'NOW',  'CAT',  'IBM',   'AMGN',  'GE',   'ISRG', 'BKNG', 'HON',

  // ── 62–71 ─────────────────────────────────────────────────────────────────
  'SPGI', 'AXP',  'MS',   'BLK',  'SYK',   'LOW',   'UBER', 'VRTX', 'PLD',  'ELV',

  // ── 72–81 ─────────────────────────────────────────────────────────────────
  'BSX',  'GILD', 'MDT',  'CB',   'ADI',   'PANW',  'SCHW', 'MU',   'LRCX', 'KLAC',

  // ── 82–91 ─────────────────────────────────────────────────────────────────
  'REGN', 'SO',   'ETN',  'PH',   'BA',    'COP',   'MMC',  'UPS',  'NEE',  'DE',

  // ── 92–101 ────────────────────────────────────────────────────────────────
  'ICE',  'HCA',  'CI',   'WM',   'DUK',   'ZTS',   'TJX',  'AMAT', 'AON',  'CME',

  // ── 102–111 ───────────────────────────────────────────────────────────────
  'SHW',  'CTAS', 'APH',  'MCO',  'MSI',   'SNPS',  'CDNS', 'FCX',  'FI',   'MAR',

  // ── 112–121 ───────────────────────────────────────────────────────────────
  'EMR',  'ITW',  'TT',   'GD',   'NSC',   'FDX',   'USB',  'ECL',  'CARR', 'ORLY',

  // ── 122–131 ───────────────────────────────────────────────────────────────
  'PCAR', 'AZO',  'NOC',  'APO',  'KKR',   'BX',    'GM',   'ADSK', 'ROST', 'CL',

  // ── 132–141 ───────────────────────────────────────────────────────────────
  'STZ',  'RCL',  'MPC',  'MCHP', 'DXCM',  'TEL',   'FAST', 'VLO',  'PSA',  'A',

  // ── 142–151 ───────────────────────────────────────────────────────────────
  'YUM',  'GWW',  'KMB',  'SRE',  'ODFL',  'MNST',  'CPRT', 'IDXX', 'VEEV', 'HWM',

  // ── 152–161 ───────────────────────────────────────────────────────────────
  'LHX',  'IRM',  'CEG',  'VST',  'MPWR',  'ON',    'TDG',  'KEYS', 'RMD',  'AXON',

  // ── 162–171 ───────────────────────────────────────────────────────────────
  'TTD',  'GEHC', 'HES',  'EW',   'NXPI',  'IQV',   'COIN', 'PWR',  'OXY',  'ROK',

  // ── 172–181 ───────────────────────────────────────────────────────────────
  'VRSK', 'EA',   'NUE',  'HPQ',  'PAYX',  'GLW',   'LVS',  'FANG', 'DOV',  'BR',

  // ── 182–191 ───────────────────────────────────────────────────────────────
  'VLTO', 'WAB',  'TTWO', 'APP',  'PLTR',  'CRWD',  'SNOW', 'TEAM', 'WDAY', 'DDOG',

  // ── 192–200 ───────────────────────────────────────────────────────────────
  'NET',  'ZS',   'HUBS', 'OKTA', 'TFC',   'FITB',  'FTNT', 'ALL',  'AFL',
];

/**
 * Returns the first `n` tickers from TICKER_UNIVERSE (descending market-cap order).
 * `n` is clamped so callers never receive an empty or oversized slice.
 */
export function getTopNMarketCap(n: number): string[] {
  const clamped = Math.min(Math.max(1, Math.trunc(n)), TICKER_UNIVERSE.length);
  return TICKER_UNIVERSE.slice(0, clamped) as string[];
}

/**
 * Reads the UNIVERSE_SIZE environment variable and returns the configured size.
 * Defaults to 200 (the full list). Clamped to [1, TICKER_UNIVERSE.length].
 *
 * Set UNIVERSE_SIZE=50 in .env.local to run with the original top-50 for fast
 * local development, or UNIVERSE_SIZE=100 to test mid-range behaviour.
 */
export function getUniverseSize(): number {
  const raw = process.env.UNIVERSE_SIZE;
  if (!raw) return Math.min(200, TICKER_UNIVERSE.length);
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(200, TICKER_UNIVERSE.length);
  return Math.min(Math.trunc(parsed), TICKER_UNIVERSE.length);
}
