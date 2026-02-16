# Stock Scout

## Goal
A web app that tracks stock price performance and, over time, identifies potentially undervalued buys using fundamentals and news.

## Milestones
M1 (now): View stock prices + historical chart for a ticker.
M2: Basic fundamentals (P/E, P/S, margins, revenue growth) + simple “undervaluation” score.
M3: News ingestion + sentiment/topic tagging + “watchlist events.”
M4: Alerts + backtesting + portfolio simulation.

## M1 requirements (Definition of Done)
- User can enter a ticker (e.g., AAPL) and see:
  - latest price
  - 1M / 6M / 1Y chart
- Works end-to-end in Codex Cloud.
- No API keys required for M1 (use mock data or free endpoint).
- Clean UI, minimal but professional.

## Constraints
- Use TypeScript.
- No authentication.
- No database in M1.
- Add basic error handling.
- Include README with run instructions.

## Architecture Guideline
Use a separate data provider module so we can swap in real APIs later without rewriting the app.

## M2 requirements (Definition of Done)

Add a Fundamentals panel for the selected ticker.

### User Experience
- When a user selects or enters a ticker, they should see:
  - Market Cap
  - P/E (TTM)
  - P/S
  - EPS (TTM)
  - Revenue (TTM)
  - Revenue YoY Growth (%)
  - Operating Margin (%)
- Fundamentals should appear below the price chart in a clean, readable panel.
- Loading and error states must be handled gracefully.
- Layout should remain minimal and consistent with M1 styling.

### Architecture
- Introduce a separate Fundamentals data provider interface.
- Follow the same swappable provider pattern used for stock price data.
- Implement a mock fundamentals provider (no external APIs or API keys).
- Mock data should:
  - Return deterministic values for known tickers (e.g., AAPL, MSFT).
  - Return reasonable default values for unknown tickers.
  - Simulate async loading with a small delay.

### Value Score
- Add a simple "Value Score" (0–100).
- The score must be deterministic and transparent.
- Display a short explanation of how the score is calculated.
- Keep scoring logic simple and explainable (e.g., lower P/E increases score, positive revenue growth increases score, higher margins increase score).
- Do not use machine learning or external signals.

### Constraints
- Do not integrate real financial APIs yet.
- Do not implement news ingestion.
- Do not add authentication or database storage.
- Do not refactor unrelated M1 code.
- Keep changes limited to fundamentals + scoring.

### Documentation
- Update README to reflect M2 functionality.
- Clearly state that fundamentals data is mocked.

## M3 requirements (Definition of Done)

Add a Home page with "Today's Top Picks", plus Rankings and Backtest Lite views powered by mocked data.

### Home ("Today's Top Picks")
- Add a Home page that shows "Today's Top Picks" = Top 5 tickers by Value Score from a default universe list.
- Include a ticker search input that navigates to the ticker detail view (the existing single-ticker page).
- Provide clear navigation links to: Home, Ticker Detail, Rankings, Backtest Lite.

### Stock Universe + Rankings
- Create a default stock universe (20–50 tickers).
- Compute Value Score and display a Rankings table containing:
  - Ticker
  - Value Score
  - Market Cap, P/E, P/S, Revenue YoY Growth, Operating Margin
  - Latest price
- Default sort: Value Score descending.
- Allow searching/filtering by ticker and sorting by at least Value Score and Market Cap.

### Backtest Lite (evaluation)
- Add a Backtest Lite view that answers: "How would the Top N picks have performed over a selected period?"
- Inputs/controls:
  - Period: 3M / 6M / 1Y
  - Top N: 5 / 10 / 20
- Simulation rules:
  - At the start of the selected period, rank the universe by Value Score and select the Top N.
  - Allocate equally across selected stocks (equal-weight).
  - Compute portfolio performance from start to end using the existing price history provider.
  - Compare against a benchmark ticker "SPY" (mocked).
- Output:
  - Portfolio total return (%)
  - Benchmark total return (%)
  - List of selected tickers
  - A simple chart showing portfolio vs benchmark over time
- Include clear disclaimers: mocked data, no transaction costs, educational only.

### Architecture
- Refactor scoring into a pure function (e.g., calculateValueScore(fundamentals) -> number) and use it everywhere consistently.
- Add a "universe" module that provides the ticker list and can be swapped later.
- Continue using swappable provider interfaces; for M3, all data must remain mocked/deterministic (no external APIs, no keys).
- Maintain loading and error states for all new views.

### Constraints
- Do not implement real backtesting (date-based historical fundamentals) yet.
- Do not implement news ingestion in M3.
- Do not add authentication or a database.
- Keep scope limited to Home + Search + Rankings + Backtest Lite + required refactors.

### Documentation
- Update README to reflect new pages (Home/Rankings/Backtest Lite) and how Backtest Lite works.
- Clearly state that rankings and backtest-lite use mocked/generated data at this stage.

