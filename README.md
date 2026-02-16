# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows, ranking systems, and portfolio evaluation concepts.

This repository currently implements **Milestone 2 (M2)**:
- Enter a stock ticker (e.g., `AAPL`)
- View the latest price
- View a historical chart with `1M / 6M / 1Y` ranges
- View a fundamentals panel below the chart
- View a deterministic Value Score (0–100) with a short formula explanation

The project is intentionally built in stages to support experimentation and architectural clarity.

---

## Roadmap

- **M1 (Complete)**: Price chart + ticker detail view  
- **M2 (Complete)**: Fundamentals panel + deterministic Value Score  
- **M3 (Next)**:  
  - Home page with “Today's Top Picks”  
  - Rankings view across a stock universe  
  - Backtest Lite (Top N simulation vs benchmark using mocked data)  
- **M4**: News ingestion + sentiment/topic tagging  
- **M5**: Alerts + expanded backtesting + portfolio simulation  
- **M6 (Future)**: Optional signal integration such as 13F filing analysis  

---

## Architecture Principles

- Built with **Next.js + TypeScript**
- Uses separate, swappable **data provider interfaces**
- UI logic is separated from data providers
- Scoring logic is deterministic and transparent
- All current data is mocked (no external APIs yet)

This structure allows:
- Replacing mock providers with real APIs later
- Adding ranking/backtesting without rewriting core logic
- Integrating new signals (e.g., news, 13F filings) cleanly

---

## Milestone 2 Details

### Fundamentals Panel Fields

- Market Cap
- P/E (TTM)
- P/S
- EPS (TTM)
- Revenue (TTM)
- Revenue Year-over-Year Growth (%)
- Operating Margin (%)

### Value Score

- Deterministic score between 0–100
- Based on fundamentals (e.g., lower P/E, positive revenue growth, stronger margins)
- Transparent and explainable (no machine learning)

---

## Mock Data Behavior

### Stock Price Provider
- Historical data is generated deterministically
- Supports `1M / 6M / 1Y` ranges
- Async loading simulated

### Fundamentals Provider
- Fundamentals data is **mocked** and **not real financial data**
- Known tickers (`AAPL`, `MSFT`) return fixed deterministic values
- Unknown tickers return deterministic defaults derived from the ticker string
- Async loading simulated with a small delay

---

## Run Locally

### 1) Install dependencies

```bash
npm install
```

### 2) Start the development server

```bash
npm run dev
```

### 3) Open the app

Visit:

http://localhost:3000

---

## Scripts

```bash
npm run dev    # start local dev server
npm run build  # create production build
npm run start  # run production server
npm run lint   # run Next.js lint checks
```

---

## Project Structure

```text
app/
  page.tsx                         # ticker detail UI
  layout.tsx                       # root layout
src/
  components/
    PriceCard.tsx
    HistoricalChart.tsx
    FundamentalsPanel.tsx
  providers/
    types.ts
    mockStockDataProvider.ts
    mockFundamentalsDataProvider.ts
    index.ts
```

---

## Out of Scope (Not Implemented Yet)

- Rankings across a stock universe
- Backtest Lite simulation
- News ingestion and sentiment analysis
- Alerts
- Authentication
- Database storage
- Real financial APIs
- 13F filing ingestion

---

## Disclaimer

This project is for educational and exploratory purposes only.  
It is not investment advice.
