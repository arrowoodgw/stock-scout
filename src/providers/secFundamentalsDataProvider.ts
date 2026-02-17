import { FundamentalsDataProvider, RequestOptions, StockFundamentals } from './types';

const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const COMPANY_FACTS_BASE = 'https://data.sec.gov/api/xbrl/companyfacts';
const FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000;

type SecTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecCompanyTickersResponse = Record<string, SecTickerEntry>;

type FactPoint = {
  end?: string;
  filed?: string;
  form?: string;
  fp?: string;
  fy?: number;
  val?: number;
};

type CompanyFactsResponse = {
  facts?: Record<string, Record<string, { units?: Record<string, FactPoint[]> }>>;
};

type CacheEntry = {
  expiresAt: number;
  value: StockFundamentals;
};

const fundamentalsCache = new Map<string, CacheEntry>();
const fundamentalsInFlight = new Map<string, Promise<StockFundamentals>>();

let tickerToCik: Map<string, string> | null = null;
let tickerMapInFlight: Promise<Map<string, string>> | null = null;

function isBrowser() {
  return typeof window !== 'undefined';
}

function normalizeTicker(input: string) {
  const ticker = input.trim().toUpperCase();
  if (!ticker) {
    throw new Error('Please provide a ticker symbol.');
  }
  return ticker;
}

function getSecUserAgent() {
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  if (!userAgent) {
    throw new Error('Missing SEC_USER_AGENT environment variable.');
  }
  return userAgent;
}

async function fetchSecJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'User-Agent': getSecUserAgent(),
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

async function getTickerMap(): Promise<Map<string, string>> {
  if (tickerToCik) {
    return tickerToCik;
  }

  if (tickerMapInFlight) {
    return tickerMapInFlight;
  }

  tickerMapInFlight = fetchSecJson<SecCompanyTickersResponse>(COMPANY_TICKERS_URL).then((payload) => {
    const map = new Map<string, string>();

    for (const entry of Object.values(payload)) {
      const ticker = entry.ticker?.trim().toUpperCase();
      if (!ticker || !Number.isFinite(entry.cik_str)) {
        continue;
      }

      map.set(ticker, String(Math.trunc(entry.cik_str)).padStart(10, '0'));
    }

    tickerToCik = map;
    return map;
  });

  try {
    return await tickerMapInFlight;
  } finally {
    tickerMapInFlight = null;
  }
}

function pickUnit(units: Record<string, FactPoint[]> | undefined, preferred: string[]) {
  if (!units) {
    return [] as FactPoint[];
  }

  for (const unit of preferred) {
    if (units[unit]?.length) {
      return units[unit];
    }
  }

  const first = Object.values(units).find((rows) => rows.length > 0);
  return first ?? [];
}

function getFactPoints(payload: CompanyFactsResponse, conceptNames: string[], preferredUnits: string[]) {
  const gaap = payload.facts?.['us-gaap'];
  if (!gaap) {
    return [] as FactPoint[];
  }

  for (const concept of conceptNames) {
    const points = pickUnit(gaap[concept]?.units, preferredUnits);
    if (points.length > 0) {
      return points;
    }
  }

  return [] as FactPoint[];
}

function asTimestamp(value?: string) {
  if (!value) {
    return Number.NaN;
  }

  return new Date(`${value}T00:00:00.000Z`).getTime();
}

function isQuarterlyPoint(point: FactPoint) {
  const fp = point.fp?.toUpperCase();
  return fp === 'Q1' || fp === 'Q2' || fp === 'Q3' || fp === 'Q4';
}

function hasValidValue(point: FactPoint): point is FactPoint & { val: number; end: string } {
  return typeof point.val === 'number' && Number.isFinite(point.val) && !!point.end;
}

function computeTtmFromQuarterlies(points: FactPoint[]): number | null {
  const quarterlies = points
    .filter((point): point is FactPoint & { val: number; end: string } => isQuarterlyPoint(point) && hasValidValue(point))
    .sort((a, b) => asTimestamp(b.end) - asTimestamp(a.end));

  const uniqueByPeriod: Array<FactPoint & { val: number; end: string }> = [];
  const seen = new Set<string>();

  for (const point of quarterlies) {
    const key = `${point.fy ?? ''}-${point.fp ?? ''}-${point.end}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueByPeriod.push(point);

    if (uniqueByPeriod.length === 4) {
      break;
    }
  }

  if (uniqueByPeriod.length < 4) {
    return null;
  }

  const newest = asTimestamp(uniqueByPeriod[0].end);
  const oldest = asTimestamp(uniqueByPeriod[3].end);
  const spanDays = (newest - oldest) / (1000 * 60 * 60 * 24);

  if (!Number.isFinite(spanDays) || spanDays > 430) {
    return null;
  }

  return uniqueByPeriod.reduce((sum, point) => sum + point.val, 0);
}

function computeAnnualFallback(points: FactPoint[]): number | null {
  const annual = points
    .filter((point): point is FactPoint & { val: number; end: string } => point.fp?.toUpperCase() === 'FY' && hasValidValue(point))
    .sort((a, b) => asTimestamp(b.end) - asTimestamp(a.end));

  if (annual.length === 0) {
    return null;
  }

  return annual[0].val;
}

function computeTtm(points: FactPoint[]) {
  const quarterly = computeTtmFromQuarterlies(points);
  if (quarterly !== null) {
    return quarterly;
  }

  return computeAnnualFallback(points);
}

function getLatestEndDate(...pointSets: FactPoint[][]) {
  const timestamps = pointSets
    .flat()
    .filter(hasValidValue)
    .map((point) => asTimestamp(point.end))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function toFundamentals(ticker: string, payload: CompanyFactsResponse): StockFundamentals {
  const revenuePoints = getFactPoints(payload, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'], ['USD']);
  const operatingIncomePoints = getFactPoints(payload, ['OperatingIncomeLoss'], ['USD']);
  const epsPoints = getFactPoints(payload, ['EarningsPerShareDiluted', 'EarningsPerShareBasic'], ['USD/shares']);

  const revenueTtm = computeTtm(revenuePoints);
  const operatingIncomeTtm = computeTtm(operatingIncomePoints);
  const epsTtm = computeTtm(epsPoints);

  const operatingMargin =
    revenueTtm !== null && operatingIncomeTtm !== null && revenueTtm !== 0
      ? (operatingIncomeTtm / revenueTtm) * 100
      : null;

  return {
    ticker,
    marketCap: null,
    peTtm: null,
    ps: null,
    epsTtm,
    revenueTtm,
    revenueGrowthYoY: null,
    operatingMargin,
    asOf: getLatestEndDate(revenuePoints, operatingIncomePoints, epsPoints)
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    cache: 'no-store'
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }

  return payload;
}

export class SecFundamentalsDataProvider implements FundamentalsDataProvider {
  async getFundamentals(tickerInput: string, options?: RequestOptions): Promise<StockFundamentals> {
    const ticker = normalizeTicker(tickerInput);

    if (isBrowser()) {
      return fetchJson<StockFundamentals>(`/api/fundamentals?ticker=${encodeURIComponent(ticker)}${options?.forceRefresh ? '&refresh=1' : ''}`);
    }

    if (!options?.forceRefresh) {
      const cached = fundamentalsCache.get(ticker);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }

      const inFlight = fundamentalsInFlight.get(ticker);
      if (inFlight) {
        return inFlight;
      }
    }

    const request = (async () => {
      const tickerMap = await getTickerMap();
      const cik = tickerMap.get(ticker);

      if (!cik) {
        throw new Error('Ticker was not found in SEC company mapping.');
      }

      const facts = await fetchSecJson<CompanyFactsResponse>(`${COMPANY_FACTS_BASE}/CIK${cik}.json`);
      const fundamentals = toFundamentals(ticker, facts);

      fundamentalsCache.set(ticker, {
        value: fundamentals,
        expiresAt: Date.now() + FUNDAMENTALS_TTL_MS
      });

      return fundamentals;
    })();

    fundamentalsInFlight.set(ticker, request);

    try {
      return await request;
    } finally {
      fundamentalsInFlight.delete(ticker);
    }
  }
}
