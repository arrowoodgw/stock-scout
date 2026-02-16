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
