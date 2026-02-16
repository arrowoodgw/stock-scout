# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows.

This repository currently implements **Milestone 2 (M2)**:
- Enter a stock ticker (e.g., `AAPL`)
- View the latest price
- View a historical chart with `1M / 6M / 1Y` ranges
- View a fundamentals panel below the chart
- View a deterministic Value Score (0–100) with a short formula explanation

## Milestone 2 Notes

- Built with **Next.js + TypeScript**
- Uses a **mock stock price provider** and a **separate mock fundamentals provider**
- Provider logic is separated from UI logic so real APIs can be swapped in later
- Includes loading and error states for both price/chart data and fundamentals

### Fundamentals panel fields

- Market Cap
- P/E (TTM)
- P/S
- EPS (TTM)
- Revenue (TTM)
- Revenue Year-over-Year Growth (%)
- Operating Margin (%)

### Mock fundamentals provider behavior

- Fundamentals data is **mocked** and **not real financial data**.
- Known tickers (currently `AAPL`, `MSFT`) return fixed deterministic values.
- Unknown tickers return deterministic defaults derived from the ticker string.
- Async loading is simulated with a small delay.

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

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev    # start local dev server
npm run build  # create production build
npm run start  # run production server
npm run lint   # run Next.js lint checks
```

## Project Structure

```text
app/
  page.tsx                         # UI and state handling
  layout.tsx                       # root layout
src/
  components/
    PriceCard.tsx                  # latest price display
    HistoricalChart.tsx            # simple SVG line chart
    FundamentalsPanel.tsx          # fundamentals metrics + value score
  providers/
    types.ts                       # shared types + provider interfaces
    mockStockDataProvider.ts       # mock quote/history provider
    mockFundamentalsDataProvider.ts# mock fundamentals provider
    index.ts                       # provider factory (swappable later)
```

## Out of Scope (Not Implemented Yet)

- Milestone 3 news ingestion and sentiment
- Milestone 4 alerts/backtesting/portfolio simulation
- Authentication
- Database storage
