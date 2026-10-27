# Drabyashree NEPSE: Walk-Forward Parameter Optimization Report

**Generated At:** 2026-10-27T09:04:23.667Z  
**Historical Horizon:** 33 NEPSE Trading Sessions  
**Validation Methodology:** Rolling 60% In-Sample Training / 40% Out-of-Sample Forward Testing  
**Frictional Deductions:** 5-Tier SEBON Brokerage, 0.015% SEBON fee, Rs. 25 DP fee, 7.5% CGT, Slippage, and T+2 Demat Lock.

---

## 1. Optimal Parameter Calibration

> [!IMPORTANT]
> **Recommended Calibration: Preset C: Technical Momentum Follower**  
> Demonstrates the highest forward risk-adjusted return with a Profit Factor of **2.65**, a Win Rate of **76.9%**, and Walk-Forward Efficiency of **0%**.

### Optimal Weight Allocation
| Pillar | Optimized Weight | Description |
| :--- | :--- | :--- |
| **Broker / Floorsheet Flow** | **25%** | Top broker accumulation, CR5 concentration, and buyer retention |
| **Technical Setups** | **45%** | Trend stack (EMA 20/50), momentum (RSI), and ATR expansion |
| **Fundamental Quality** | **15%** | P/E vs sector median, Graham discount, ROE, NRB BFI safety gate |
| **Market Context & Events** | **15%** | Index trend, sector rotation, breadth, pre-closure event safety |

### Recommended Decision Thresholds
- **BUY Threshold:** Score $\ge$ **68** with Confidence $\ge$ **55%**
- **WATCH Threshold:** Score $\ge$ **50** with Confidence $\ge$ **40%**
- **Stop-Loss ATR Multiplier:** **2.2x ATR** (Clamped strictly within $\pm 15\%$ circuit limits)
- **Target 1:** **1.8R** (50% scale-out, move stop to statutory breakeven)
- **Target 2:** **3R** (full objective exit)

---

## 2. Comparative Walk-Forward Parameter Matrix

| Preset Candidate | Weight Breakdown (B/T/F/M) | Buy Score | Trades (OOS) | Win Rate % | Profit Factor | Net PnL (NPR) | WFE % | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Preset C: Technical Momentum Follower** | 25/45/15/15 | 68 | 13 | 76.9% | **2.65** | Rs. 42,449 | 0% | ✅ Robust |
| **Preset D: High-Safety Value Conservative** | 30/20/30/20 | 75 | 11 | 72.7% | **1.99** | Rs. 22,895 | 0% | ✅ Robust |
| **Preset B: Institutional Flow Dominant** | 45/20/15/20 | 72 | 10 | 70% | **1.74** | Rs. 23,895 | 0% | ✅ Robust |
| **Preset A: Current Baseline Balanced** | 35/25/20/20 | 70 | 8 | 62.5% | **1.05** | Rs. 18,328 | 0% | ⚠️ Sensitive |

---

## 3. Statutory Microstructure Invariants Enforced

1. **Mandatory T+2 Demat Settlement Lock:**
   - Under CDSC rules, no trade can exit on Day $T$ or Day $T+1$. Every candidate position survived at least 2 full sessions of overnight price fluctuation.
2. **5-Tier Broker Commission & Fees:**
   - Subtracted 0.36% to 0.24% tiered commissions, 0.015% SEBON regulatory fees, and Rs. 25 per sell Demat transfer.
3. **Capital Gains Tax (CGT):**
   - 7.5% short-term statutory CGT subtracted from all winning trades prior to computing net returns.
4. **Volume Participation Ceiling:**
   - Position sizing capped at a maximum of 5% of daily volume to ensure genuine order fill reality in thin liquidity.
5. **Sample Power Guard:**
   - ⚠️ **CAUTION:** Forward trade sample is currently underpowered (N < 30). Accumulate additional forward sessions before deploying large live capital.

---

## 4. Realistic Disclaimers & Model Risk

- **No Guaranteed Returns:** Past simulated walk-forward backtest results do not guarantee future live performance on NEPSE.
- **Circuit Lock Gap Traps:** On extreme panic days, an equity can gap down to its $-15\%$ floor with zero bid liquidity, delaying stop-loss execution until buy orders return.
