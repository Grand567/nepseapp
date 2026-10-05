# NEPSE Stock Analysis App — README

> **DISCLAIMER — READ FIRST**  
> This app is for **informational and educational purposes only**. It is **not financial advice**. Every indicator, score, and signal carries uncertainty. Investing in NEPSE involves **risk of loss**, including loss of principal. Always do your own research and consult a SEBON-registered investment advisor before making decisions.

---

## What This App Does

A React/Node.js analysis dashboard for Nepal Stock Exchange (NEPSE) listed equities. It aggregates live market data, computes technical and fundamental indicators, and provides risk management tools — helping you ask better questions before investing, not providing guaranteed answers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, Capacitor (mobile) |
| **Backend/Proxy** | Express 5, Node.js 22, deployed on Render free tier |
| **Data sources** | MeroLagani, ShareSansar, NEPSE API (via CORS proxy) |
| **Storage** | localStorage + IndexedDB (client-side cache) |
| **Auth** | Firebase Authentication |

---

## How to Run

### Prerequisites
- Node.js ≥ 18
- A running instance of the proxy (locally or via Render)

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Start the proxy server (port 5000)
node proxy/server.mjs

# 3. In a separate terminal, start the frontend (port 5173)
npm run dev
```

### Production Build
```bash
npm run build
# Output: dist/
```

### Run Tests
```bash
node tests/comparativeVerification.test.mjs   # Original 62 tests
node tests/bBatchIndicators.test.mjs          # 26 indicator tests
node tests/cBatchPriceAdjustment.test.mjs     # 42 data pipeline tests
node tests/dBatchFundamentals.test.mjs        # 42 fundamental analysis tests
node tests/eBatchRiskManagement.test.mjs      # 68 risk management tests
node tests/fBatchBacktest.test.mjs            # 27 backtest tests
```

---

## Feature Reference

### Data Layer (`src/utils/liveData.js`)

| Feature | Data Source | Limitations |
|---|---|---|
| **Live quotes** | MeroLagani allorigins proxy + NOTS API race | 15–30s delay; proxy wakes in 45–60s after inactivity (Render free tier) |
| **Price history** | NEPSE backend `/api/price-history/:symbol` | Up to 365 days; MeroLagani fallback for equities |
| **Market summary** | MeroLagani / NEPSE API | Updated every fetch cycle |
| **Dividend/bonus history** | ShareSansar + MeroLagani scraping | Not always complete; may miss older actions |

**Data freshness indicator:** The dashboard shows "Data as of HH:MM AM/PM NPT" when live data is loaded. If the banner says "Simulated Data", the proxy hasn't responded yet — wait 60 seconds and refresh.

**Corporate action adjustment (C1):** When price history is fetched, the app attempts to back-adjust historical OHLCV prices for bonus shares, rights issues, and cash dividends. This prevents false RSI/MACD signals on ex-dates.

> ⚠️ Adjusted prices are for **technical analysis only**. They are NOT real traded prices. P&L calculations always use raw (unadjusted) prices.

---

### Technical Indicators (`src/utils/indicators.js`)

All indicators return `null` instead of synthetic values when there is insufficient data.

| Indicator | Implementation | Notes |
|---|---|---|
| **EMA** | SMA-seeded exponential moving average | `isApproximate: true` when fewer candles than period |
| **SMA** | Simple moving average | Returns `null` for warm-up positions |
| **MACD** | EMA(12) − EMA(26), signal EMA(9) | Returns `null` fields + `isInsufficient: true` when < 26 candles |
| **RSI** | Wilder's smoothing, 14-period default | Returns `null` when < 14 candles |
| **Bollinger Bands** | 20-period SMA ± 2σ | Returns `squeeze: true` when bandwidth near zero |
| **ATR** | Wilder's smoothed true range | Returns `null` when < 2 candles |

**Limitation:** All indicators are computed on available cached history. With fewer than 30–60 candles, results are approximate. Label `isApproximate: true` is surfaced in the UI.

---

### Fundamental Analysis (`src/utils/fundamentals.js`)

Sector-aware comparison of PE, PBV, ROE, EPS against NEPSE sector medians.

| Feature | Detail |
|---|---|
| **Sector benchmarks** | 10 NEPSE sectors with median PE/PBV/ROE calibrated to FY2080/81 data |
| **Valuation verdict** | `UNDERVALUED / FAIR / OVERVALUED` with confidence level and plain-English explanation |
| **Fundamental score** | Composite [0–100] → `Strong Buy / Buy / Hold / Underperform / Avoid` |
| **Peer comparison** | Ranks stock vs sector peers on PE, PBV, EPS, ROE, dividend yield |
| **Bank-specific** | NRB CAR and NPL thresholds flagged if breached |

> ⚠️ Sector medians are **estimates** based on FY2080/81 NEPSE publications. They will drift as markets change. Verify all figures with current company financial statements and NEPSE/SEBON publications before acting on them.

---

### Risk Management (`src/utils/riskManagement.js`)

| Feature | Detail |
|---|---|
| **Position sizing (E1)** | Fixed-% risk model: risk `R%` of capital per trade, rounded to 10-share NEPSE lots. Optional Half-Kelly sizing when win rate and payoff ratio are known. |
| **Stop-loss/targets (E2)** | ATR-based (preferred), support/resistance, or % fallback. All prices clamped to ±15% NEPSE circuit limits. Returns risk-per-share and R:R ratios. |
| **Net profit calculator (E3)** | Full NEPSE cost breakdown: tiered broker commission + SEBON fee (0.015%) + DP charge (Rs.25 per sell) + CGT (7.5% short / 5% long / 10% institutional). |
| **R:R formatter (E4)** | Colour-coded quality: Excellent ≥3.0 / Good ≥2.0 / Acceptable ≥1.5 / Poor < 1.5. |

**NEPSE transaction cost schedule (as of FY2081/82):**

| Cost | Rate |
|---|---|
| Broker commission | 0.36% (≤50k) / 0.33% (≤500k) / 0.31% (≤20L) / 0.27% (≤1Cr) / 0.24% (>1Cr) |
| SEBON regulatory fee | 0.015% of transaction value |
| DP charge | Rs. 25 per sell transaction |
| CGT — individual short-term (≤365d) | 7.5% of profit |
| CGT — individual long-term (>365d) | 5.0% of profit |
| CGT — institutional | 10.0% of profit |

> ⚠️ Verify current rates with your broker and SEBON before use. Rates change with each Finance Act.

---

### Backtesting (`src/utils/backtest.js`)

| Feature | Detail |
|---|---|
| **Entry model** | Next-day open (T+1 fill) — no look-ahead bias |
| **Exit model** | Intraday stop-loss (Low ≤ stop) and take-profit (High ≥ target) before signal check |
| **Circuit guard** | Rejects entries when next-day open > prevClose × 1.149 (≥15% upper circuit) |
| **Full cost model (F1)** | Tiered broker commission + SEBON fee (0.015%) + DP charge (Rs.25) + CGT (7.5% short / 5% long) per trade |
| **Sharpe ratio (F2)** | Annualised, using Nepal treasury risk-free rate (6.5% default) |
| **Benchmark comparison (F3)** | Buy-and-hold of NEPSE index or the stock itself over the same period, with alpha calculation |

**Available strategies:**
- `macdCrossoverStrategy` — MACD histogram zero-line crossover
- `rsiStrategy` — RSI oversold/overbought (30/70)
- `quantMultiFactorStrategy` — EMA golden-cross + MACD + RSI composite

> ⚠️ Backtest results are **hypothetical**. They assume perfect execution at the stated prices, which is not possible in real trading. Results are shown for strategy evaluation only and must **not** be used as profit forecasts.

---

### Security (`proxy/server.mjs`)

| Control | Implementation |
|---|---|
| **CORS** | Restricted to explicit allowlist via `ALLOWED_ORIGINS` environment variable |
| **Rate limiting** | 200 req/min general; 30 req/min scraping endpoints |
| **Symbol sanitization** | `sanitizeSymbol()` applied to all `:symbol` route parameters — strips non-alphanumeric, 1-12 char limit |
| **API keys** | No API keys bundled in the frontend; all keys are server-side environment variables |

---

## Environment Variables

### Server (`proxy/.env` or Render dashboard)
```
OPENROUTER_API_KEY=sk-or-...   # AI features
ALLOWED_ORIGINS=https://your-frontend.com,http://localhost:5173
```

### Frontend (`.env`)
```
VITE_PROXY_URL=https://your-proxy.onrender.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# etc. (see Firebase console)
```

> Never commit `.env` files to version control.

---

## What Is Still Unverified / Needs Live Data

| Item | Status |
|---|---|
| Corporate action dates | Scraped from ShareSansar/MeroLagani — **verify against NEPSE official announcements** |
| Sector PE/PBV medians | Estimated from FY2080/81 — **re-calibrate annually** |
| SEBON/broker fee rates | Coded from FY2081/82 rules — **verify each Finance Act** |
| NRB CAR/NPL thresholds | 11% CAR, 5% NPL — **verify current NRB directives** |
| Holiday calendar | Maintained in `nepseCalendar.js` — **update for each Gregorian/BS year** |
| Backtest signal quality | Not yet validated on a full year of live data — treat all signals as **experimental** |
| Right-share adjustment | Theoretical ex-right price formula used — **verify against NEPSE official adjustment** |

---

## Suggested Next Steps

1. **Live data validation** — Run the app on a live trading day (Mon–Fri 11:00 AM–3:00 PM NPT), compare displayed prices with NEPSE website, log any discrepancies.
2. **Backtest on full history** — Obtain 3–5 years of daily OHLCV for 10–20 stocks and re-run all strategies. Discard signals that don't survive realistic cost assumptions.
3. **Sector median update** — Fetch quarterly fundamental data from MeroLagani/ShareSansar API and recompute sector medians dynamically.
4. **Code splitting** — The main JS bundle is 2.1 MB (543 kB gzip). Use `React.lazy` + `Suspense` to lazy-load heavy panels (PredictorHub, StrategyLab, etc.) and cut first-load time.
5. **Alert system** — Implement price/RSI/MACD alerts using a server-side WebSocket or polling job.
6. **Portfolio tracker** — Wire the WACC calculator into a persistent portfolio view showing unrealized P&L, sector concentration, and CGT estimate.
