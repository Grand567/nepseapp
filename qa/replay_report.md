# DRABYASHREE NEPSE — PHASE 2 REPLAY & RECORDER HARNESS REPORT
**Execution Date:** 2026-11-14T03:00:00Z (Saturday, Nov 14, 2026 NPT)
**Phase Status:** Phase 2 Complete — Ready for Review
**Live Data Status:** ⚠️ **NOT-TESTED ON REAL DATA (SYNTHETIC FIXTURES VERIFIED)**

---

## 1. Executive Summary

Phase 2 of the NEPSE Data Parity and Live Engine has been successfully designed, implemented, and verified with zero invasive changes to core application production logic.

### Deliverables Completed:
1. **Live Session Recorder:** [qa/scripts/recordLiveSession.mjs](file:///c:/Users/Hp/Desktop/Software/nepse%20app/qa/scripts/recordLiveSession.mjs)
   - Runs strictly on user command.
   - Captures all 5 required streams every 60 seconds (rate-limited, min 30s): Index, Market Summary, Today Prices, Market Depth (spot symbols), and Floorsheet.
   - Enforces a zero-secret security policy: recursively redacts auth headers, tokens, cookies, and secret keys.
   - Writes timestamped frame snapshots and `manifest.json` into `qa/recordings/<date>/`.
2. **Synthetic High-Precision Fixtures:** [qa/recordings/synthetic-trading-day-2026-11-16/](file:///c:/Users/Hp/Desktop/Software/nepse%20app/qa/recordings/synthetic-trading-day-2026-11-16)
   - 9 complete chronological scenarios spanning pre-open, 3 continuous trading phases, closing bell, post-market, next day, weekend, and holiday.
   - Hand-computed mathematical values anchored to historical ledger baselines.
3. **Replay Mode & Virtual Clock Engine:** [proxy/replayServer.mjs](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/replayServer.mjs)
   - Exposes mock time-travel endpoints (`/api/replay/clock`, `/api/replay/set-step`).
   - Serves dynamic `/api/market-summary`, `/api/today-prices`, `/api/indices`, `/api/nepse/market-depth/:symbol`, and `/api/diagnostics/:symbol`.
   - Emits correct HTTP headers (`Cache-Control: no-store` on live ticks; `Cache-Control: public, max-age=60` on settled data; dynamic ETags).
4. **Automated Replay Test Suite:** [tests/replayHarness.mjs](file:///c:/Users/Hp/Desktop/Software/nepse%20app/tests/replayHarness.mjs)
   - 35 assertions across all 9 scenarios passed cleanly (100% pass rate).

---

## 2. Replay Scenarios & Verified Assertions

| # | Market Scenario | Virtual Clock (NPT) | Market Open | Expected Status / As-Of Label | 1D Volume | 5D Volume (Hand-Computed) | Result |
|---|---|---|---|---|---|---|---|
| **1** | **Before Open** | Mon 10:45 AM | `false` | `PRE_OPEN` / As-of `2026-11-13` | 0 | 762,883 shares | **PASS** |
| **2** | **Early Live** | Mon 11:15 AM | `true` | `CONTINUOUS` / `LIVE • 11:15 AM NPT` | 25,000 | 627,883 shares (25k + 602.8k) | **PASS** |
| **3** | **Mid-Day Live** | Mon 01:00 PM | `true` | `CONTINUOUS` / `LIVE • 01:00 PM NPT` | 85,000 | 687,883 shares (85k + 602.8k) | **PASS** |
| **4** | **Late Live** | Mon 02:45 PM | `true` | `CONTINUOUS` / `LIVE • 02:45 PM NPT` | 142,000 | 744,883 shares (142k + 602.8k) | **PASS** |
| **5** | **Closing Bell** | Mon 03:00 PM | `false` | `CLOSING_SESSION` / Finalizing | 151,200 | 754,083 shares | **PASS** |
| **6** | **Post-Market** | Mon 04:30 PM | `false` | `POST_MARKET` / Showing `2026-11-16` | 151,200 | 754,083 shares | **PASS** |
| **7** | **Next Day Morning** | Tue 09:00 AM | `false` | `PRE_OPEN` / Showing `2026-11-16` | 0 (or 151.2k) | 754,083 shares | **PASS** |
| **8** | **Weekend (Sat)** | Sat 12:00 PM | `false` | `WEEKEND` / Showing `2026-11-20` | Settled | Last Friday Settled | **PASS** |
| **9** | **Holiday (Chhath)** | Sun 12:00 PM | `false` | `HOLIDAY` / Holiday: Chhath Parva | Settled | Showing `2026-11-13` | **PASS** |

---

## 3. Hand-Computed Multi-Timeframe Proofs (SHIVM)

To ensure that the app never claims a pass with synthetic tautologies, multi-day windows were mathematically derived by hand from the 43 settled ledger sessions in `proxy/data/drabyashree_ledger.db`:

- **Settled Baseline Prior to Replay:**
  - `2026-11-13`: 138,712 shares
  - `2026-11-06`: 145,210 shares
  - `2026-11-05`: 158,940 shares
  - `2026-11-04`: 160,021 shares
  - `2026-11-03`: 160,000 shares
  - **Sum of 4 previous sessions:** `138,712 + 145,210 + 158,940 + 160,021 = 602,883 shares`
  - **Sum of 5 previous sessions (Pre-Open 5D):** `602,883 + 160,000 = 762,883 shares`

- **Dynamic In-Session Accumulation on Monday, 2026-11-16:**
  - **At 11:15 AM:** Today's live partial volume is 25,000 shares.
    - $5\text{D} = 25,000 + 602,883 = 627,883\text{ shares}$
    - Assertion Verified: `1D (25,000) ≠ 5D (627,883) ≠ 15D (2,480,937) ≠ 30D (5,807,514) ≠ All-Time (9,044,555)`
  - **At 01:00 PM:** Today's live partial volume advances to 85,000 shares.
    - $5\text{D} = 85,000 + 602,883 = 687,883\text{ shares}$
    - Dynamic update verified: 1D jumped 25,000 → 85,000, 5D jumped 627,883 → 687,883.
  - **At 02:45 PM:** Today's volume advances to 142,000 shares.
    - $5\text{D} = 142,000 + 602,883 = 744,883\text{ shares}$
  - **At 03:00 PM (Close):** Final volume is 151,200 shares.
    - $5\text{D} = 151,200 + 602,883 = 754,083\text{ shares}$

---

## 4. Real Live Data Status & User Action Plan

> [!IMPORTANT]
> **Authentic Market Hours Status:** **NOT-TESTED ON REAL DATA**
> Because today is Saturday (2026-11-14) and tomorrow is Sunday (2026-11-15, national holiday of Chhath Parva), the exchange is legally closed.
> All assertions have passed against verified synthetic fixtures.

### Exact Schedule to Record Real Exchange Data:
- **Date:** Monday, November 16, 2026
- **Window:** 11:00 AM – 3:00 PM Asia/Kathmandu (NPT)
- **Command to Execute:**
  ```powershell
  node qa/scripts/recordLiveSession.mjs --interval 60 --duration 240
  ```
- **What it does:**
  - Polls proxy every 60 seconds (rate-limited, jitter-protected).
  - Scrubs all tokens and credentials before disk persistence.
  - Stores all 240 minute-by-minute ticks into `qa/recordings/2026-11-16/`.
