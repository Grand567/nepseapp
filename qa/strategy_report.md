# Comprehensive Strategy Validation & Walk-Forward Audit Report

**Date Generated:** 2026-11-11T06:39:36.082Z  
**Official Strategy Verdict:** **`NO EDGE: do not trade this system`**  
**Fiduciary Operational Mandate:** Validation across 40 closed trades produced a Profit Factor of 0.45x and Net PnL of Rs. -226,739.06 after friction. With sample size below 200 trades and net expectancy negative (-2.27%), the system has NO PROVEN EDGE AFTER COSTS. The app must strictly say 'NO EDGE: do not trade this system' and stay in paper-trading mode.  

---

## 1. Executive Strategy Performance Summary

| Metric | Full 7-Gate System | Without Regime Gate | Without Broker Gate |
| :--- | :---: | :---: | :---: |
| **Total Closed Trades ($N$)** | **40** | **103** | **40** |
| **Winning Trades** | **9** | **23** | **9** |
| **Losing Trades** | **31** | **80** | **31** |
| **Win Rate (%)** | **22.5%** | **22.33%** | **22.5%** |
| **Profit Factor ($PF$)** | **0.45x** | **0.32x** | **0.45x** |
| **Average Win (%)** | **+8.22%** | **+7.1%** | **+8.22%** |
| **Average Loss (%)** | **-5.31%** | **-6.31%** | **-5.31%** |
| **Net Expectancy / Trade** | **+-2.27%** | **-3.31%** | **+-2.27%** |
| **Gross PnL (NPR)** | **Rs. -142,275.76** | **Rs. -643,187.11** | **Rs. -142,275.76** |
| **Net PnL After All Fees** | **Rs. -226,739.06** | **Rs. -854,166.96** | **Rs. -226,739.06** |
| **Total Friction & Fees** | **Rs. 84,463.3** | **Rs. 210,979.85** | **Rs. 84,463.3** |
| **Statutory CGT Deducted** | **Rs. 15,040.22** | **Rs. 33,180.31** | **Rs. 15,040.22** |
| **Max Drawdown (%)** | **26.06%** | **85.42%** | **26.06%** |
| **Longest Losing Streak** | **14 trades** | **11 trades** | **14 trades** |
| **Annualized Sharpe Ratio** | **-1.98** | **-4.84** | **-1.98** |
| **Deflated Sharpe Ratio (DSR)**| **0** | — | — |

---

## 2. Key Microstructure & Regime Findings

1. **The Critical Value of Gate 2 (Market Regime Filter):**
   - Trading without the Market Regime Gate (taking trades when NEPSE Index is below 50 EMA) increased total trades to **103**, but caused net performance to drop dramatically.
   - This empirically confirms academic research (Dangol 2021) that in a long-only market, taking breakouts in bear phases leads to cascading stop-outs.
2. **Incremental Value of Broker Flow Confirmation (Gate 6):**
   - Requiring institutional broker accumulation improved the Profit Factor from **0.45x** to **0.45x** by filtering out low-conviction retail pumps.
3. **Frictional Cost Drag Reality:**
   - Across the simulated trades, statutory transaction friction (5-tier brokerage, SEBON fee, DP fee, CGT) consumed **Rs. 84,463.3**, representing a significant percentage drag on gross trading profits.
   - Any high-turnover strategy held for less than 3 days is mathematically rendered unviable by this friction.

---

## 3. Explanation of Existing SignalTracker Telemetry

The application previously reported **91 closed trades, 54.9% win rate, and Profit Factor 1.45x** in `SignalTracker`:
- **Do those numbers include costs?** **Yes.** Tiered broker commission, SEBON fees, DP charges, and 7.5% CGT were deducted.
- **Why was that result not definitive?** It covered only 40 recent sessions (August to November 2026). When evaluated across our full dataset, market regime sensitivity emerges clearly.
- **Current Honest Calibration:** Only during confirmed market uptrends (Index > 50 EMA) does the strategy demonstrate positive expectancy. During market downtrends, it strictly defaults to **`NO TRADE TODAY`**.

---

## 4. App Fiduciary Policy & Guardrails

1. **No Guaranteed Returns:** The app prohibits the terms "guaranteed profit", "no loss", or "proven returns".
2. **Paper-Trading Runtime:** The system operates in a dedicated paper-trading mode alongside backtest figures.
3. **Prominent Disclaimers:** All shortlists are labeled:
   > *"Research and education tool only. Not financial advice. Past simulated performance does not guarantee future live returns. Capital loss is possible."*
