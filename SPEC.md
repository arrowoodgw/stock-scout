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

