/**
 * scripts/bench-preload.js
 *
 * M7.4 – Preload performance benchmark: sequential vs. concurrent.
 *
 * Simulates per-ticker fundamentals fetching with a configurable artificial
 * network delay so the comparison is meaningful without needing live API keys.
 *
 * Run with:
 *   node scripts/bench-preload.js
 *   node scripts/bench-preload.js --tickers=500 --latency=400
 *
 * Environment equivalents (override via CLI flags or env vars):
 *   BENCH_TICKERS      Universe size (default: 50)
 *   BENCH_LATENCY_MS   Simulated round-trip per ticker in ms (default: 800)
 *   BENCH_CONCURRENCY  Concurrency limit for the "after" run (default: 20)
 */

// ---------------------------------------------------------------------------
// CLI / env config
// ---------------------------------------------------------------------------

function parseFlag(name, envKey, defaultValue) {
  const cliFlag = process.argv
    .map((a) => a.match(new RegExp(`^--${name}=(\\d+)$`)))
    .find(Boolean);
  if (cliFlag) return parseInt(cliFlag[1], 10);
  const envVal = parseInt(process.env[envKey] ?? '', 10);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : defaultValue;
}

const TICKER_COUNT  = parseFlag('tickers',     'BENCH_TICKERS',     50);
const LATENCY_MS    = parseFlag('latency',      'BENCH_LATENCY_MS',  800);
const CONCURRENCY   = parseFlag('concurrency',  'BENCH_CONCURRENCY', 20);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mock per-ticker fetch — sleeps to simulate real network I/O. */
async function fetchFundamentals(ticker) {
  await sleep(LATENCY_MS);
  return { ticker, epsTtm: 1.0 };
}

// ---------------------------------------------------------------------------
// Sequential baseline (BEFORE M7.4)
// ---------------------------------------------------------------------------

async function runSequential(tickers) {
  const start = Date.now();
  for (const ticker of tickers) {
    await fetchFundamentals(ticker);
  }
  return Date.now() - start;
}

// ---------------------------------------------------------------------------
// Concurrent pool (AFTER M7.4 — mirrors pLimit in dataCache.ts exactly)
// ---------------------------------------------------------------------------

async function pLimit(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function runConcurrent(tickers, concurrency) {
  const start = Date.now();
  await pLimit(tickers, concurrency, (ticker) => fetchFundamentals(ticker));
  return Date.now() - start;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tickers = Array.from({ length: TICKER_COUNT }, (_, i) => `TICK${String(i).padStart(3, '0')}`);

  console.log('');
  console.log('=================================================');
  console.log('  M7.4 Preload Performance Benchmark');
  console.log('=================================================');
  console.log(`  Universe size      : ${TICKER_COUNT} tickers`);
  console.log(`  Simulated latency  : ${LATENCY_MS} ms / ticker`);
  console.log(`  Concurrency (after): ${CONCURRENCY} workers`);
  console.log('');

  // ── BEFORE ──────────────────────────────────────────────────────────────
  process.stdout.write('  [BEFORE] Sequential fetch ... ');
  const seqMs = await runSequential(tickers);
  const seqS  = (seqMs / 1000).toFixed(1);
  console.log(`${seqMs} ms  (${seqS} s)`);

  // ── AFTER ───────────────────────────────────────────────────────────────
  process.stdout.write(`  [AFTER ] Concurrent fetch  ... `);
  const conMs = await runConcurrent(tickers, CONCURRENCY);
  const conS  = (conMs / 1000).toFixed(1);
  console.log(`${conMs} ms  (${conS} s)`);

  // ── Summary ─────────────────────────────────────────────────────────────
  const speedup = (seqMs / conMs).toFixed(1);
  const saved   = ((1 - conMs / seqMs) * 100).toFixed(0);
  const target  = conMs < 15_000 ? 'PASS (<15 s)' : 'FAIL (>=15 s)';

  console.log('');
  console.log('-------------------------------------------------');
  console.log(`  Speedup   : ${speedup}x faster`);
  console.log(`  Time saved: ${saved}%  (${seqMs} ms → ${conMs} ms)`);
  console.log(`  <15s goal : ${target}`);
  console.log('=================================================');
  console.log('');

  // Theoretical times at different universe sizes for reference
  const tickerSizes = [50, 100, 200, 500];
  const batchTime   = (n) => Math.ceil(n / CONCURRENCY) * LATENCY_MS;
  console.log('  Projected concurrent preload times');
  console.log('  (at current latency + concurrency):');
  for (const n of tickerSizes) {
    const ms   = batchTime(n);
    const s    = (ms / 1000).toFixed(1);
    const pass = ms < 15_000 ? '✓' : '✗';
    console.log(`    ${String(n).padStart(4)} tickers → ~${s}s  ${pass}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
