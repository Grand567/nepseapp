# Drabyashree NEPSE Swing Strategy Engineering Progress

**Last Updated:** 2026-11-11T07:15:00.000Z  
**Status:** All Stages (1 through 6) Successfully Engineered, Empirically Validated & Verified  

---

### Implementation Milestones & Gates

- [x] **Stage 1: Canonical Market Rules & Statutory Frictions**
  - Created `src/constants/marketRules.js` with verified trading hours (Mon–Fri 11:00–15:00 Asia/Kathmandu), 15% circuit bands, T+2 settlement, 5-tier broker commissions ($0.36\% - 0.24\%$), SEBON fee ($0.015\%$), flat CDSC DP fee (Rs. 25.00), and Capital Gains Tax ($7.5\%$ short-term, $5.0\%$ long-term, $10.0\%$ corporate).
  - Verified with `tests/marketRules.test.mjs` (38 passing tests).

- [x] **Stage 2: Academic Research Citations & Audit**
  - Created `qa/research_basis.md` citing Shrestha & Subedi (2022 fee drag), Dangol & Pradhan (failure of contrarian dip-buying), Karki (risk-adjusted volatility control), Poudel & Shrestha (weekly non-random persistence vs. daily noise), and Gautam (value anomalies).
  - Explicitly marked verified regulatory parameters and identified unverified claims requiring current empirical testing.
  - Verified with `tests/researchBasis.test.mjs` (12 passing tests).

- [x] **Stage 3: Zero-Lookahead Multi-Year Backtest Engine**
  - Created `backtest/swingEngine.mjs` enforcing zero look-ahead (signal at Close of Day $T$, fill at Day $T+1$ Open with $0.35\%$ liquidity slippage), strict CDSC $T+2$ Demat lockout, $\pm 15\%$ circuit-lock checks (skipping $+15\%$ upper circuit gaps and trapping at $-15\%$ lower circuit floors until liquidity returns), full statutory fee deduction, and Deflated Sharpe Ratio calculation via Abramowitz & Stegun approximation.
  - Verified with `tests/swingEngine.test.mjs` (16 passing tests).

- [x] **Stage 4: Validation Strategy Report & Official Verdict**
  - Executed `scripts/runFullSwingBacktest.mjs` across 66,317 daily stock summary records and 489,376 broker ledger records.
  - Candidate 1 (Full 7-Gate System): 40 closed trades, Win Rate: **22.5%**, Profit Factor: **0.45x**, Net PnL: **-Rs. 226,739.06**, Total statutory friction paid: **Rs. 84,463.30**.
  - Candidate 2 (Without Market Regime Gate): 103 closed trades, Win Rate: **22.33%**, Profit Factor: **0.32x**, Net PnL: **-Rs. 854,166.96** (empirically proving that omitting Gate 2 multiplies losses by 4x).
  - Official Fiduciary Verdict declared: **`NO EDGE: do not trade this system`**.
  - Generated `qa/strategy_report.md` and exported `src/data/swingBacktestResults.json`.

- [x] **Stage 5: Selector UI & Honest Display Integration**
  - Created `src/utils/swingGateEvaluator.js` evaluating all 7 canonical gates: Multi-Timeframe Alignment, Market Regime (>50 EMA), Liquidity & Circuit Check, Breakout & RVOL Momentum, Quality & Corporate Actions, Broker Flow Confirmation, and Net R:R $\ge 2:1$ after statutory fees.
  - Created `src/components/swing/SwingTradeSelectorView.tsx`:
    - Displays prominent Official Fiduciary Verdict banner: **`🔴 NO EDGE: do not trade this system`** (or `🛡️ NO TRADE TODAY: Capital Defense Active`).
    - Badge: `🔬 PAPER-TRADING MODE ONLY (Simulation Active)`.
    - Mandatory educational disclaimer: `⚠️ Research and education tool only. Not financial advice. Past simulated performance does not guarantee future live returns. Real capital losses are possible.`
    - Sub-view 1: **Top Picks (Live 7-Gate Shortlist)** with real-time gate inspection and risk plan calculation.
    - Sub-view 2: **Backtest Audit & Walk-Forward Metrics** with 40-trade metrics, ablation comparison table, and interactive **Stock History Deep-Dive Inspector** to check historical trades for any stock.
    - Sub-view 3: **Paper-Trading Ledger (4–8 Weeks Simulation)** with Rs. 1,000,000 virtual equity, holding counters, and T+2 lockout.
  - Wired into `src/components/ServicesHub.tsx` (`swing-trade-selector`) and linked from `src/components/Dashboard.jsx`.
  - Retained all existing Market Movers, Radars, and Screener tools completely intact on the Dashboard.
  - Verified with `tests/swingGateEvaluator.test.mjs` (11 passing tests) and `tests/swingTradeSelectorView.test.mjs` (9 passing tests).

- [x] **Stage 6: End-to-End Verification & Browser Telemetry**
  - Verified in Chromium via Playwright MCP at `http://localhost:4173/` with **0 console errors and 0 network failures**.
  - Captured visual verification screenshots: `qa/swing_selector_backtest_audit.png` and `qa/swing_selector_paper_trading.png`.
  - Full master test suite: **54 passed, 0 failed out of 54 test suites** (`node tests/runAll.mjs`).
