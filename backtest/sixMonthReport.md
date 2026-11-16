# Drabyashree NEPSE — 6-Month Flowchart v2.0 Back-Date Test Report

**Generated At:** 2026-11-16T05:35:16.241Z  
**Signal Scan Window:** 2026-05-15 to 2026-11-02 (111 NEPSE trading sessions)  
**Price Resolution Horizon:** 2026-05-15 to 2026-11-13 (116 sessions across 402 scrips)  
**Execution & Cost Model:** Next-day Open entry (`Day T+1`), CDSC `T+2` Demat lock, `+5.5%` MFE Early Impulse Ratchet (`+2.2%` BE lock after Day 5), `+8.0%` T1 (50% scale-out + `+2.5%` trail), `+15.0%` T2, `-3.5%` Stop-Loss, `15`-session max hold, Rs. 2,00,000 position sizing, 5-tier SEBON brokerage + 0.015% SEBON fee + Rs. 25 DP fee + 7.5% CGT.

---

## 1. Executive Summary & Overall Win Rate

| Metric | All Executed Trades | Closed-Only Subset |
| :--- | :--- | :--- |
| **Total Trades** | **16** (9 Wins / 7 Losses) | **15** (8 Wins / 7 Losses) |
| **Strict Net Win Rate %** *(after all fees + 7.5% CGT)* | **56.3%** | **53.3%** |
| **Gross Win Rate %** *(before frictions)* | **56.3%** | **53.3%** |
| **Average Win / Average Loss (Net)** | +3.32% / -4.27% | +3.7% / -4.27% |
| **Realized Risk-Reward Ratio (R:R)** | **0.78 : 1** | **0.87 : 1** |
| **Profit Factor** | **1x** | **0.99x** |
| **Net Expectancy per Trade** | **+0%** | **-0.02%** |
| **Simulated 6M Return** *(20% portfolio allocation/trade)* | **-0.1%** (~-0.2% annualized) | **-0.1%** |

- **Unique Stocks Selected:** 15 stocks (CHCL, GBBL, GRDBL, KSBBL, MBJC, MEN, NABIL, PCBL, RADHI, RFPL, SANIMA, SBI, SBL, SKHL, UAIL)
- **Deduplication:** 22 raw signal-days reduced to 16 non-overlapping trades using a 5-session per-symbol cooldown (16 entered with valid next-session opens).

---

## 2. Per-Track Win Rate Breakdown

### Dual-Track Horizon Performance
| Dual-Track Tier | Trades | Wins / Losses | Strict Net Win Rate % | Gross Win Rate % | Profit Factor | Net Expectancy / Trade |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Track B: Post-T+2 Cleared Continuation** | 6 | 5W / 1L | **83.3%** | 83.3% | 3.54x | +1.77% |
| **Track A: Coiled 2-3D Ignition** | 10 | 4W / 6L | **40%** | 40% | 0.59x | -1.06% |

### Sub-Track Microstructure Archetype Performance
| Sub-Track Archetype | Trades | Wins / Losses | Strict Net Win Rate % | Gross Win Rate % | Profit Factor | Net Expectancy / Trade |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `STEALTH_FLOOR` | 7 | 3W / 4L | **42.9%** | 42.9% | 0.44x | -1.35% |
| `SMC_BREAK_AND_RETEST` | 6 | 5W / 1L | **83.3%** | 83.3% | 3.54x | +1.77% |
| `T2_CLEARED_CONTINUATION` | 0 | 0W / 0L | **0%** | 0% | 0x | +0% |
| `SMC_SWEEP_MSS_FVG` | 3 | 1W / 2L | **33.3%** | 33.3% | 0.87x | -0.37% |
| `COIL_IGNITION` | 0 | 0W / 0L | **0%** | 0% | 0x | +0% |

---

## 3. Funnel & Trap-Veto Audit Summary

- **Total Symbol-Days Evaluated:** 31,581
- **Excluded (Non-Equities / LTP < Rs. 100 / Turnover < Rs. 25L / Vol < 8,000):** 14,766
- **Insufficient Pre-Signal History (< 30 sessions):** 254
- **Rejected by Multi-Window BCR3 & Wash-Churn Filters:** 16,161
- **Vetoed by 5-Day Demat Dump & Multi-Session Trap Guards:** 135
  - `THREE_CONSECUTIVE_RED_DAYS`: 103
  - `UNABSORBED_MASSIVE_DUMP`: 26
  - `UPPER_WICK_DISTRIBUTION`: 3
  - `PAST_ACCUMULATOR_DEMAT_DUMP`: 2
  - `ACTIVE_DISTRIBUTION_TODAY`: 1
- **Rejected by Candle Squeeze / SMC / VDU / CMF Microstructure Filters:** 243
- **Qualified Flowchart v2.0 Signal-Days:** 22 (16 after 5-day cooldown)

---

## 4. Complete 6-Month Selected Stocks & Trade-by-Trade Audit

| # | Symbol | Signal Date | Entry Date | Exit Date | Dual-Track / Sub-Track | Lead Broker | BCR3 Buy / Sell (Spread) | 10D/5D Ret % (Churn) | CLV % | Entry (Rs.) | Exit (Rs.) | MFE % (Peak) | MAE % (Trough) | Held | Gross % | Net % | Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **CHCL** | 2026-05-22 | 2026-05-25 | 2026-06-16 | Track A (STEALTH_FLOOR) | #52 | 41.5% / 31.3% (+10.2%) | 92.8% / 94.3% (7.2%) | 100% | 482.5 | 481.9 | +5.76% (Rs. 510.3) | -0.7% (Rs. 479.1) | 15d | -0.12% | **-0.82%** | ❌ LOSS (TIME_EXIT) |
| 2 | **SBL** | 2026-06-11 | 2026-06-12 | 2026-06-24 | Track A (STEALTH_FLOOR) | #14 | 41.6% / 31.8% (+9.9%) | 93.7% / 90.8% (9.2%) | 50% | 400.0 | 386.0 | +3.65% (Rs. 414.6) | -3.5% (Rs. 386) | 9d | -3.50% | **-4.18%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 3 | **UAIL** | 2026-06-18 | 2026-06-19 | 2026-06-24 | Track A (SMC_SWEEP_MSS_FVG) | #32 | 55.2% / 18.9% (+36.3%) | 74.7% / 74.2% (25.8%) | 81% | 475.0 | 456.0 | +1.05% (Rs. 480) | -4% (Rs. 456) | 4d | -4.00% | **-4.67%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 4 | **SKHL** | 2026-07-07 | 2026-07-08 | 2026-07-10 | Track A (STEALTH_FLOOR) | #62 | 50.4% / 17.4% (+33%) | 79.5% / 82.1% (20.5%) | 88% | 971.0 | 871.0 | +0% (Rs. 971) | -10.81% (Rs. 866) | 3d | -10.30% | **-10.93%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 5 | **MEN** | 2026-07-29 | 2026-07-30 | 2026-08-13 | Track B (SMC_BREAK_AND_RETEST) | #92 | 57.5% / 30.5% (+27%) | 88.1% / 92% (11.9%) | 88% | 598.9 | 612.1 | +7.03% (Rs. 641) | -2.14% (Rs. 586.1) | 11d | +2.20% | **+1.38%** | ✅ WIN (RATCHET_BE (+2.2%)) |
| 6 | **SBI** | 2026-07-29 | 2026-07-30 | 2026-08-11 | Track B (SMC_BREAK_AND_RETEST) | #44 | 73.9% / 26% (+47.8%) | 73.8% / 77.1% (26.2%) | 79% | 389.5 | 398.1 | +7.8% (Rs. 419.9) | -0.39% (Rs. 388) | 9d | +2.21% | **+1.38%** | ✅ WIN (RATCHET_BE (+2.2%)) |
| 7 | **GBBL** | 2026-07-30 | 2026-07-31 | 2026-08-20 | Track B (SMC_BREAK_AND_RETEST) | #44 | 42.1% / 20.5% (+21.7%) | 92.9% / 92.1% (7.9%) | 19% | 412.5 | 423.5 | +3.52% (Rs. 427) | 0% (Rs. 412.5) | 15d | +2.67% | **+1.80%** | ✅ WIN (TIME_EXIT) |
| 8 | **GRDBL** | 2026-07-31 | 2026-08-03 | 2026-08-19 | Track A (SMC_SWEEP_MSS_FVG) | #60 | 49.7% / 24.8% (+24.9%) | 86.7% / 93.6% (13.3%) | 65% | 1051.0 | 1014.2 | +6.66% (Rs. 1121) | -4.85% (Rs. 1000) | 13d | -3.50% | **-4.18%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 9 | **MEN** | 2026-08-10 | 2026-08-11 | 2026-08-20 | Track A (STEALTH_FLOOR) | #92 | 47.3% / 27.4% (+19.9%) | 97.9% / 97.7% (2.3%) | 86% | 609.0 | 622.4 | +6.81% (Rs. 650.5) | -0.85% (Rs. 603.8) | 8d | +2.20% | **+1.37%** | ✅ WIN (RATCHET_BE (+2.2%)) |
| 10 | **NABIL** | 2026-08-11 | 2026-08-12 | 2026-08-27 | Track B (SMC_BREAK_AND_RETEST) | #92 | 42.3% / 17% (+25.3%) | 73.2% / 74.6% (26.8%) | 29% | 551.0 | 531.7 | +0.91% (Rs. 556) | -3.81% (Rs. 530) | 12d | -3.50% | **-4.18%** | ❌ LOSS (STOP_LOSS (-3.5%)) |
| 11 | **PCBL** | 2026-08-20 | 2026-08-21 | 2026-09-10 | Track A (STEALTH_FLOOR) | #65 | 40.7% / 32.7% (+7.9%) | 97.9% / 99.2% (2.1%) | 68% | 240.0 | 239.5 | +6.67% (Rs. 256) | -3.33% (Rs. 232) | 12d | -0.21% | **-0.91%** | ❌ LOSS (RATCHET_BE (+2.2%)) |
| 12 | **RFPL** | 2026-09-02 | 2026-09-03 | 2026-09-16 | Track A (STEALTH_FLOOR) | #82 | 41.8% / 19.6% (+22.2%) | 80.6% / 96.8% (19.4%) | 92% | 327.0 | 334.2 | +6.42% (Rs. 348) | -2.14% (Rs. 320) | 8d | +2.20% | **+1.38%** | ✅ WIN (RATCHET_BE (+2.2%)) |
| 13 | **MBJC** | 2026-09-30 | 2026-10-01 | 2026-10-27 | Track B (SMC_BREAK_AND_RETEST) | #33 | 56.1% / 25.4% (+30.7%) | 84.9% / 86.1% (15.1%) | 88% | 294.0 | 327.8 | +15.65% (Rs. 340) | -1.36% (Rs. 290) | 14d | +11.50% | **+9.90%** | ✅ WIN (T1_SPLIT_T2 (+15%)) |
| 14 | **SANIMA** | 2026-10-06 | 2026-10-07 | 2026-11-03 | Track A (SMC_SWEEP_MSS_FVG) | #75 | 40.3% / 16.2% (+24.1%) | 92.6% / 93.8% (7.4%) | 97% | 370.0 | 403.8 | +13.57% (Rs. 420.2) | -1.62% (Rs. 364) | 15d | +9.14% | **+7.73%** | ✅ WIN (T1_SPLIT_TIME) |
| 15 | **RADHI** | 2026-10-15 | 2026-10-16 | 2026-10-30 | Track A (STEALTH_FLOOR) | #81 | 44.2% / 22.8% (+21.3%) | 75.2% / 81.7% (24.8%) | 51% | 706.1 | 746.8 | +9.05% (Rs. 770) | -0.85% (Rs. 700.1) | 6d | +5.77% | **+4.64%** | ✅ WIN (T1_SPLIT_TRAIL) |
| 16 | **KSBBL** | 2026-10-29 | 2026-10-30 | 2026-11-13 | Track B (SMC_BREAK_AND_RETEST) | #75 | 48.7% / 27.1% (+21.5%) | 96.2% / 96.1% (3.9%) | 98% | 475.0 | 480.0 | +2.93% (Rs. 488.9) | -2.11% (Rs. 465) | 7d | +1.05% | **+0.32%** | ✅ WIN (OPEN_AT_DATA_END) |
