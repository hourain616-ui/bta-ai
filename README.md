# BTA AI — Complete Starter

This is a Cloudflare Worker + static frontend starter for a trading analyzer.

## Features
- Gold + major FX symbol selector
- Multiple timeframes
- Live OHLC data through Twelve Data
- EMA 20/50/200
- RSI 14
- ATR 14
- Trend/structure scoring
- BUY / SELL / WAIT signal engine
- Entry / SL / TP1 / TP2 / TP3
- Confidence score
- Market scanner
- Chart upload UI placeholder
- News/macro endpoint placeholder
- Settings page for API status

## Setup
1. Install Node.js.
2. Install dependencies: `npm install`
3. Add Twelve Data key as a Cloudflare secret:
   `npx wrangler secret put TWELVE_DATA_API_KEY`
4. Run locally: `npm run dev`
5. Deploy: `npm run deploy`

Important:
- Never put API keys in `public/` JavaScript.
- The confidence score is a model score, not a guaranteed probability.
- Real accuracy must be established with historical backtesting.
