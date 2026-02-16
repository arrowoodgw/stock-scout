# Stock Scout

Stock Scout is a web application for tracking stock performance and identifying potentially undervalued investment opportunities over time.

The project is intentionally built in stages to support iterative development and learning.

---

## 🎯 Vision

Stock Scout will evolve into a tool that:

- Tracks historical stock price performance
- Displays key financial fundamentals
- Incorporates external news signals
- Generates simple valuation and opportunity scores
- Eventually supports watchlists and alerts

The focus is clarity, extensibility, and learning — not building a trading platform.

---

## 🚀 Roadmap

### Milestone 1 (M1)
- Enter a stock ticker (e.g., AAPL)
- View latest price
- View 1M / 6M / 1Y historical chart

### Milestone 2 (M2)
- Display core fundamentals:
  - P/E ratio
 - Revenue growth
  - Margins
  - Price-to-sales
- Introduce a simple “undervaluation score”

### Milestone 3 (M3)
- Ingest recent news articles
- Tag sentiment/topics
- Surface notable watchlist events

### Milestone 4 (Future)
- Alerts
- Backtesting
- Portfolio simulation

---

## 🏗 Architecture Principles

- Use TypeScript
- Separate data providers from UI
- Make APIs swappable (mock first, real later)
- Keep each milestone independently functional
- Prefer simple, understandable structure over premature complexity

---

## ⚙️ Development

Initial milestone (M1) will not require authentication, database storage, or API keys.

Future integrations may introduce:
- Market data APIs
- Financial fundamentals APIs
- News APIs

Environment setup and run instructions will be added after the first scaffold is implemented.

---

## 📌 Disclaimer

This project is for educational and exploratory purposes only.  
It is not investment advice.
