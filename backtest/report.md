# Drabyashree NEPSE Quantitative Backtest Report
**Target Symbol:** NABIL (Commercial Banks)  
**Report Generated:** 2026-11-08  
**Simulation Period:** 57 trading sessions  
**Initial Capital:** Rs. 1,000,000  
**Ending Equity:** Rs. 995,245.53 (Net: Rs. -4,754.47 / -0.48%)

---

> [!CAUTION]
> **STATISTICAL SAMPLE SIZE WARNING**
> ⚠️ CAUTION: Sample size (N = 1 trades across 57 sessions) is statistically underpowered (< 30 trades / < 100 sessions). Results cannot be trusted for live capital allocation without longer walk-forward validation.



## 1. Key Quantitative Performance Metrics

| Performance Metric | Simulated Value | Institutional Benchmark / Target |
| :--- | :--- | :--- |
| **Win Rate** | **0%** (0W / 1L) | > 55.0% |
| **Profit Factor** | **0x** | > 1.75x |
| **Expectancy Per Trade** | **Rs. -5,370.65** | Positive (> Rs. 0) |
| **Average Win vs Loss** | **+0% / -3.57%** (Ratio: 0x) | > 1.50x |
| **Max Drawdown** | **-0.88%** (22 sessions) | < 12.0% |
| **Sharpe Ratio (Annualized)** | **-5.14** | > 1.20 |
| **Sortino Ratio (Downside)** | **-5.37** | > 1.50 |
| **Total Trades Executed** | **1** | >= 30 for significance |

---

## 2. Market Regime Performance Attribution

| Market Regime | Trade Count | Win Rate % | Net Realized PnL |
| :--- | :--- | :--- | :--- |
| **Bullish Trend** | 0 | 0% | Rs. 0 |
| **Neutral / Sideways** | 1 | 0% | Rs. -5,370.65 |
| **Bearish Trend** | 0 | 0% | Rs. 0 |

---

## 3. Statutory NEPSE Frictions & Transaction Costs Subtracted

- **Broker Commission (5-Tier SEBON):** Total Rs. 480.03 deducted.
- **SEBON Regulatory Fee:** 0.015% per transaction leg deducted.
- **DP Charge:** Rs. 25 per sell Demat transfer deducted.
- **Capital Gains Tax (CGT):** 7.5% short-term CGT deducted automatically on profitable sales (Total Rs. 0).
- **Mandatory T+2 Settlement Lock:** All positions held for a minimum of 2 business sessions before exit eligibility.
- **Thin Liquidity Slippage:** Execution price penalized based on order size vs daily turnover.

---

## 4. Trade Execution Journal (Sample)

| Entry Date | Exit Date | Shares | Entry Price | Exit Price | Return % | Realized PnL | Hold | Exit Reason |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2025-02-12 | 2025-02-26 | 270 | Rs. 556.69 | Rs. 538.75 | -3.57% | Rs. -5370.65 | 8d | Stop-Loss Hit |

---

## 5. Risk Warnings & Disclaimers
1. **Survivorship Bias:** ⚠️ Survivorship Bias: Analysis performed on actively listed securities. Failed/delisted securities from prior historical cycles are excluded.
2. **Circuit Limit Execution Traps:** Stop-losses are subject to exchange ±15% circuit limits. On consecutive limit-down gap days, execution cannot occur until buy liquidity reappears.
3. **No Profit Guarantee:** Past simulated performance does not guarantee future live trading results.
