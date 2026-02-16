# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows, deterministic ranking, and simple portfolio simulation concepts.

This repository now implements **Milestone 3 (M3)**:
- **Home** page with “Today's Top Picks” (Top 5 by Value Score)
- **Ticker Detail** page for single-ticker analysis
- **Rankings** page across a default stock universe
- **Backtest Lite** for Top N buy-and-hold simulation vs `SPY`

All data remains mocked and deterministic.

---

## Roadmap

- **M1 (Complete)**: Ticker detail with latest price + historical chart (`1M/6M/1Y`)
- **M2 (Complete)**: Fundamentals panel + deterministic Value Score
- **M3 (Complete)**:
  - Home page with Top Picks + ticker search
  - Rankings page with sorting/filtering
  - Backtest Lite (Top N simulation vs SPY)
- **M4 (Future)**: News ingestion + sentiment/topic tagging + watchlist events
- **M5 (Future)**: Alerts + expanded backtesting + portfolio simulation

---

## Pages

- `/` → **Home**
  - Shows “Today's Top Picks” (Top 5 by Value Score) from the default universe
  - Includes ticker search that navigates to ticker detail
- `/ticker` → **Ticker Detail**
  - Existing M1/M2 functionality: latest quote, chart range controls, fundamentals, value score
- `/rankings` → **Rankings**
  - Computes Value Score + key fundamentals + latest price for each ticker in the default universe
  - Default sort: Value Score descending
  - Includes ticker filter and sorting by Value Score / Market Cap
- `/backtest` → **Backtest Lite**
  - Simulates Top N Value Score picks over selected period and compares with SPY

---

## Backtest Lite: How It Works

### Inputs
- **Period**: `3M`, `6M`, `1Y`
- **Top N**: `5`, `10`, `20`

### Rules
1. Rank the default universe by deterministic Value Score.
2. Select the Top N tickers.
3. Allocate equally across selected tickers.
4. Run a buy-and-hold simulation over the chosen period using mocked historical prices.
5. Compare portfolio return vs benchmark ticker `SPY` (mocked).

### Output
- Portfolio total return (%)
- Benchmark total return (%)
- Selected tickers list
- Simple chart (portfolio vs benchmark, normalized)

### Assumptions / Limitations
- Uses mocked/generated data, not live market data.
- Does **not** include transaction costs, slippage, taxes, dividends, or rebalancing.
- Uses current mocked fundamentals for ranking (not point-in-time historical fundamentals).
- Educational only; not investment advice.

---

## Architecture Principles

- Built with **Next.js + TypeScript**
- Uses separate, swappable data providers (`stock` and `fundamentals`)
- Scoring is centralized in a pure function: `calculateValueScore(fundamentals)`
- Default stock universe is isolated in a dedicated module
- No external APIs, API keys, authentication, or database

---

## Mock Data Behavior

### Stock Price Provider
- Deterministic mocked history and quotes
- Supports `1M / 6M / 1Y` range retrieval
- Supports known and unknown tickers deterministically
- Async loading simulated

### Fundamentals Provider
- Deterministic mocked fundamentals
- Known tickers (e.g., `AAPL`, `MSFT`) return fixed values
- Unknown tickers derive repeatable defaults from ticker string
- Async loading simulated

---

## Run Locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

---

## Scripts

```bash
npm run dev    # start local dev server
npm run build  # create production build
npm run start  # run production build
npm run lint   # run lint checks
```

---

## Out of Scope (Not Implemented Yet)

- Real external financial APIs or paid data sources
- News ingestion and sentiment tagging (M4)
- Authentication
- Database storage
- Full institutional-grade backtesting

---

## Disclaimer

This project is for educational and exploratory purposes only. It is not investment advice.
