# Drabyashree NEPSE: Walk-Forward Parameter Optimization Report

**Generated At:** 2026-11-20T03:17:16.130Z  
**Historical Horizon:** 40 NEPSE Trading Sessions  
**Validation Methodology:** Rolling 60% In-Sample Training / 40% Out-of-Sample Forward Testing  
**Frictional Deductions:** 5-Tier SEBON Brokerage, 0.015% SEBON fee, Rs. 25 DP fee, 7.5% CGT, Slippage, and T+2 Demat Lock.

---

## 1. Optimal Parameter Calibration

> [!IMPORTANT]
> **Recommended Calibration: Preset C: Technical Momentum Follower**  
> Demonstrates the highest forward risk-adjusted return with a Profit Factor of **1.17**, a Win Rate of **57.8%**, and Walk-Forward Efficiency of **-40.1%**.

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
| **Preset C: Technical Momentum Follower** | 25/45/15/15 | 68 | 64 | 57.8% | **1.17** | Rs. 14,752 | -40.1% | ⚠️ Sensitive |
| **Preset D: High-Safety Value Conservative** | 30/20/30/20 | 75 | 44 | 43.2% | **0.85** | Rs. -28,806 | -155% | ⚠️ Sensitive |
| **Preset A: Current Baseline Balanced** | 35/25/20/20 | 70 | 45 | 44.4% | **0.79** | Rs. -36,007 | -232.4% | ⚠️ Sensitive |
| **Preset B: Institutional Flow Dominant** | 45/20/15/20 | 72 | 50 | 40% | **0.71** | Rs. -54,494 | -366.4% | ⚠️ Sensitive |

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
   - ✓ Forward sample meets minimum statistical viability (N >= 30).

---

## 4. Realistic Disclaimers & Model Risk

- **No Guaranteed Returns:** Past simulated walk-forward backtest results do not guarantee future live performance on NEPSE.
- **Circuit Lock Gap Traps:** On extreme panic days, an equity can gap down to its $-15\%$ floor with zero bid liquidity, delaying stop-loss execution until buy orders return.
