# Stock Scout

Stock Scout is a milestone-based project for exploring stock analysis workflows.

This repository currently implements **Milestone 1 (M1)** only:
- Enter a stock ticker (e.g., `AAPL`)
- View the latest price
- View a simple historical chart with `1M / 6M / 1Y` ranges

## Milestone 1 Notes

- Built with **Next.js + TypeScript**
- Uses a **mock data provider** (no API keys required)
- Data provider logic is separated from UI logic so real APIs can be swapped in later
- Includes loading and error states

Supported mock tickers:
- `AAPL`
- `MSFT`
- `TSLA`
- `NVDA`

Entering any other ticker will show an error state in M1.

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
  page.tsx                # UI and state handling for M1
  layout.tsx              # root layout
src/
  components/
    PriceCard.tsx         # latest price display
    HistoricalChart.tsx   # simple SVG line chart
  providers/
    types.ts              # provider interface + shared types
    mockStockDataProvider.ts
    index.ts              # provider factory (swappable later)
```

## Out of Scope (Not Implemented Yet)

- Milestone 2 fundamentals/valuation score
- Milestone 3 news ingestion and sentiment
- Milestone 4 alerts/backtesting/portfolio simulation
