# Adaptive Regime Flowchart v2.0 — 6-Month Back-Date Audit Report

**Generated At:** 2026-11-16T07:10:06.804Z  
**Scan Window:** 2026-05-15 to 2026-11-02 (111 NEPSE sessions; resolved through 2026-11-13)  
**Execution Model:** Next-day Open entry (`Day T+1`), Pre-Open Gap Veto (`+1.8%`), CDSC `T+2` Demat Lock, `+5.5%` MFE Early Impulse Ratchet (`+2.2%` BE lock after Day 4/5), `+7.5%` Target 1 (50% scale-out + `+2.5%` trail), `+15.0%` Target 2, `-3.5%` Stop-Loss, `15`-session max hold, Rs. 200,000 sizing, 5-tier SEBON brokerage + 0.015% SEBON fee + Rs. 25 DP fee + 7.5% CGT.

---

## 1. Executive Summary & Adaptive Win Rate

| Metric | Adaptive Regime Flowchart v2.0 | Previous Legacy Baseline |
| :--- | :--- | :--- |
| **Total Executed Trades** | **17 trades** (2.8 trades / month) | 16 trades (~2.5 trades / month) |
| **Strict Net Win Rate %** *(after fees & 7.5% CGT)* | **64.7%** (11 Wins / 6 Losses) | 56.3% (9 Wins / 7 Losses) |
| **Profit Factor** | **2.39x** | 1.00x |
| **Net Expectancy per Trade** | **+1.47% per trade** | +0.00% per trade |
| **Average Win / Average Loss** | +3.90% / -2.99% | +3.32% / -4.27% |
| **Realized Risk-Reward (R:R)** | **1.31 : 1** | 0.78 : 1 |
| **Period Portfolio Return (20% sizing)** | **+5.05%** | -0.10% |

---

## 2. Per-Track & Regime Performance Breakdown

| Strategy Track | Regime Active | Trades | Wins / Losses | Net Win Rate % | Profit Factor | Net Expectancy |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Track B: Post-T+2 Retest** | Bull + Chop Sniper | 13 | 9W / 4L | **69.2%** | **2.58x** | **+1.60%** |
| **Track A: Coiled Ignitions** | Bull Only (Muted in Chop) | 4 | 2W / 2L | **50.0%** | **1.87x** | **+1.04%** |

---

## 3. Chronological Trade-by-Trade Performance Audit

| # | Symbol | Signal Date | Entry Date | Exit Date | Market Regime | Setup Archetype | Lead Broker | Entry (Rs.) | Exit (Rs.) | Peak Upside (MFE %) | Max Drawdown (MAE %) | Held | Net Return % | Outcome & Exit Trigger |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | **GBBL** | 2026-05-19 | 2026-05-20 | 2026-06-02 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #20 | 416 | 420 | +7.19% | -0.12% | 8d | **+0.24%** | ✅ WIN (RATCHET_BE (+2.2%)) |
| 2 | **SBL** | 2026-06-10 | 2026-06-11 | 2026-06-24 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #14 | 403 | 388.9 | +2.88% | -4.22% | 10d | **-4.17%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 3 | **UAIL** | 2026-06-19 | 2026-06-22 | 2026-06-29 | 🟢 Bull | `SMC_SWEEP_MSS_FVG` | #32 | 468 | 451.6 | +2.12% | -5.98% | 6d | **-4.18%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 4 | **MEN** | 2026-07-27 | 2026-07-28 | 2026-08-17 | 🔴 Chop | `SNIPER_BREAK_AND_RETEST` | #92 | 595.1 | 628.2 | +7.71% | -1.51% | 15d | **+4.45%** | ✅ WIN (T1_SPLIT_TIME) |
| 5 | **GBBL** | 2026-07-30 | 2026-07-31 | 2026-08-20 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #44 | 412.5 | 423.5 | +3.52% | 0% | 15d | **+1.8%** | ✅ WIN (TIME_EXIT) |
| 6 | **EBL** | 2026-07-31 | 2026-08-03 | 2026-08-21 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #92 | 728.6 | 737 | +1.26% | -2% | 15d | **+0.41%** | ✅ WIN (TIME_EXIT) |
| 7 | **SHL** | 2026-07-31 | 2026-08-03 | 2026-08-21 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #16 | 500 | 500.2 | +3.82% | -2.1% | 15d | **-0.66%** | ❌ LOSS (TIME_EXIT) |
| 8 | **NBL** | 2026-08-05 | 2026-08-06 | 2026-08-26 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #65 | 255.5 | 277.4 | +10.84% | 0% | 15d | **+7.23%** | ✅ WIN (T1_SPLIT_TIME) |
| 9 | **MEN** | 2026-08-10 | 2026-08-11 | 2026-08-20 | 🟢 Bull | `STEALTH_FLOOR` | #92 | 609 | 622.4 | +6.81% | -0.85% | 8d | **+1.37%** | ✅ WIN (RATCHET_BE (+2.2%)) |
| 10 | **NABIL** | 2026-08-11 | 2026-08-12 | 2026-08-27 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #92 | 551 | 531.7 | +0.91% | -3.81% | 12d | **-4.18%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 11 | **MBJC** | 2026-09-10 | 2026-09-11 | 2026-10-05 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #33 | 275.1 | 298.2 | +10.51% | -1.13% | 15d | **+7.07%** | ✅ WIN (T1_SPLIT_TIME) |
| 12 | **MBJC** | 2026-09-28 | 2026-09-29 | 2026-10-26 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #33 | 290 | 320.9 | +14.83% | -0.34% | 15d | **+9.13%** | ✅ WIN (T1_SPLIT_TIME) |
| 13 | **GCIL** | 2026-10-06 | 2026-10-07 | 2026-11-02 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #58 | 386 | 394.5 | +7.25% | -3.32% | 14d | **+1.38%** | ✅ WIN (RATCHET_BE (+2.2%)) |
| 14 | **SANIMA** | 2026-10-06 | 2026-10-07 | 2026-11-03 | 🟢 Bull | `SMC_SWEEP_MSS_FVG` | #75 | 370 | 402.9 | +13.57% | -1.62% | 15d | **+7.51%** | ✅ WIN (T1_SPLIT_TIME) |
| 15 | **KSBBL** | 2026-10-27 | 2026-10-28 | 2026-11-13 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #66 | 465 | 480 | +5.14% | -1.08% | 9d | **+2.32%** | ✅ WIN (OPEN_AT_DATA_END) |
| 16 | **RADHI** | 2026-10-27 | 2026-10-28 | 2026-11-05 | 🟢 Bull | `STEALTH_FLOOR` | #81 | 719 | 720 | +7.09% | -2.64% | 7d | **-0.56%** | ❌ LOSS (RATCHET_BE (+2.2%)) |
| 17 | **SARBTM** | 2026-10-28 | 2026-10-29 | 2026-11-06 | 🟢 Bull | `SMC_BREAK_AND_RETEST` | #39 | 814 | 785.5 | +1.94% | -4.26% | 7d | **-4.18%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
