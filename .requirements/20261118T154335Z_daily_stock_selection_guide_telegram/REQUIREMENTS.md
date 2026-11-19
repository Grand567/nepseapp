# Requirements: Daily 4-Gate Stock Selection Guide Telegram Notification

**Feature Name:** `daily_stock_selection_guide_telegram`  
**Created:** 2026-11-18T15:43:35Z  
**Reference:** `NEPSE_Stock_Selection_Guide.md` (5-Year NEPSE Ledger Research, 2022–2026)

---

## 1. As Is (Current State)

1. `proxy/telegramNotifier.mjs` has an incomplete draft of `runDailyStockSelectionGuideAndDispatch()` added inline with critical defects:
   - Queries non-existent columns (`pe_ratio, roe, book_value`) on SQLite table `scrip_fundamentals` (actual columns: `eps_ttm, roe_pct, book_value_per_share, npl_pct, car_pct`), causing silent fallback to 0 points on Factor 2.7.
   - Uses unweighted `AVG(close_price)` across `daily_stock_summary` as a market index proxy instead of the actual NEPSE Index baseline/live series (`src/data/nepse_index_baseline.json` + `last_known_market.json` / Chukul/NOTS).
   - Misses `nepse_fundamentals_latest.json` and `stockmap.json` enrichment (sector quality and fundamentals for scrips whose SQLite `scrip_fundamentals` rows have nulls/legacy sector labels).
   - Fails to exclude non-equity/promoter instruments like `HIDCLP` via `isExcludedInstrument`.
   - Uses global module-level `auditMultiSessionTrapRisk` (ignoring `targetDate` inside `auditAntiDematDumpGuard`), breaking historical/date-parameterized evaluation and unit testability.
   - Misses sector-specific adjustments from the Guide (BFI Asymmetry ≥ 1.50x & -2.5% SL, Hydro VDU ≤ 0.70x & -4.0% SL, Microfinance Asymmetry ≥ 1.80x, Insurance 3% max position cap) and Gate 1 `Cautious Bull` / Score `7` 50% position sizing reduction.
   - Has no automated daily scheduler integration (`proxy/workers.mjs`), no persistent per-session deduplication lock, no Telegram command routing (`/selection`, `/select`, `/guide`, `/dailyguide`), and no protected API preview/dispatch endpoints in `proxy/server.mjs`.
2. `/guide` in `handleTelegramCommand` currently routes to static educational text (`sendTelegramInvestorPlaybook`) rather than the live 4-Gate Stock Selection Guide report.

---

## 2. To Be (Desired Behavior)

1. A dedicated, pure, testable engine module `proxy/stockSelectionGuideEngine.mjs` implements the complete **4-Gate NEPSE Stock Selection Guide** (`evaluateMarketRegimeGate`, `scoreGate2AccumulationQuality`, `evaluateGate3IgnitionTiming`, `computeGate4RiskPlan`, `evaluateDailySelectionGuide`, `formatDailySelectionGuideHtml`):
   - **Gate 1 (Market Regime Filter):** Evaluates real NEPSE Index close against 50-day EMA and 200-day EMA, 5-day return (> -3.0%), and circuit-breaker panic check (> -4.0%). Distinguishes `STRONG_BULL` (1.0x size), `CAUTIOUS_BULL` (0.5x size), and `BEAR` (0x — STOP, zero trades).
   - **Gate 2 (Accumulation Quality Score / 10):** Evaluates all 7 weighted factors (Asymmetry up to 3 pts, 5D Retention up to 2 pts, 10D Retention 1 pt, Lead Size ≥ 20K kitta 1 pt, ≥ 2 Top-5 Buyers ≥ 70% retention 1 pt, Sector Quality 1 pt, Fundamental Floor P/E < 40 & (ROE > 8% or P/B < 1.5) 1 pt) using accurate SQLite `scrip_fundamentals` + `nepse_fundamentals_latest.json` + `stockmap.json`. Enforces sector-specific minimums (BFIs CAR ≥ 11% / NPL < 5% / Asym ≥ 1.50x; Microfinance ROE > 10% / NPL < 5% / Asym ≥ 1.80x) and excludes non-common equities via `isExcludedInstrument`. Requires Gate 2 score ≥ 7/10.
   - **Gate 3 (Ignition Timing Checklist — 5/5 Triggers on T₀):**
     1. Test Shot 2–4 sessions ago (RVOL ≥ 1.4x, change within [-2%, +5%]); uses highest qualifying Test Shot volume.
     2. Volume Dry-Up on T₀ (`VDU ≤ sectorVduMax` [0.60x default, 0.70x Hydro] AND `RVOL ≤ 0.80x`).
     3. Volatility Compression (`(High - Low) / Close * 100 ≤ 3.2%`, flagging Ideal ≤ 2.5% and NR7; ignores zero-volume halted bars).
     4. Price at Operator's Cost Floor (5D Buyer VWAP distance in `[-1.5%, +2.0%]`).
     5. Date-aware Anti-Dump Guards CLEAN (Lead 5D accumulator not net selling > 500 kitta today; NO past 10D accumulator with ≥ 5,000 net kitta dumping > 3,000 kitta today; NO unabsorbed single-seller > 15% domination).
   - **Gate 4 (Risk Management & Position Sizing):** Computes T₀+1 entry limit (+1% max, >+3% gap abort warning), sector-adjusted Stop-Loss (-2.5% BFI, -4.0% Hydro, -3.0% standard), Target (+7.0%, breakeven stop trigger at +5.0%, 5-day time stop), and portfolio sizing (5% base cap, 3% Insurance cap, halved on Cautious Bull or Gate 2 score = 7, plus exact shares per Rs. 1,00,000).
2. **Every-Day Telegram Notification (Selected Stock OR Explicit "No Stock At All"):**
   - Formats HTML-escaped mobile-ready Telegram message for all 3 outcomes:
     - Gate 1 Bear Regime: `NO STOCK SELECTED TODAY — HOLD CASH` with NEPSE Index vs 50/200 EMA stats.
     - Gate 1 Pass, 0 Qualified Stocks: `NO STOCK SELECTED TODAY — HOLD CASH` (explicitly stating 0 stocks passed; distinguishes whether Gate-2 watchlist candidates exist vs literally ZERO watchlist/selected stocks).
     - Gate 1 Pass, ≥1 Qualified Stocks: Selected Stock Cards (top 5 max) + Near-Miss Watchlist (up to 3) + Risk/Expectancy disclaimer.
   - Splits oversized messages safely via `sendTelegramMessage`.
3. **Automated Daily Schedule + Persistent Deduplication:**
   - Runs automatically once every active NEPSE trading day after post-market ingestion (`15:15+ NPT` in `runPostMarketCloseAnalysis` + startup EOD catch-up check in `workers.mjs`).
   - Persists last dispatched trading date in `proxy/data/daily_selection_guide_state.json` (plus in-flight lock and optional PostgreSQL mirror if configured) so Render container restarts never send duplicate alerts for the same session.
   - Always delivers even when 0 stocks qualify (`sendTelegramMessage` ALWAYS runs in automated daily worker).
4. **Interactive Telegram Commands & Secure Admin/Preview API Endpoints:**
   - `/selection`, `/select`, `/guide`, `/dailyguide` invoke the live Stock Selection Guide report for that chat on demand 24/7.
   - `/playbook` remains wired to `sendTelegramInvestorPlaybook`.
   - `POST /api/telegram/dispatch-selection-guide` protected by `requireAdminSecret`.
   - `GET /api/telegram/preview-selection-guide` returns JSON + HTML preview (`dryRun: true`) without dispatching.

---

## 3. Functional Requirements & Acceptance Criteria

- **FR-1:** `evaluateMarketRegimeGate` accurately computes 50 EMA, 200 EMA, 5D return, and day return from NEPSE index closes and distinguishes `STRONG_BULL`, `CAUTIOUS_BULL`, and `BEAR`.
  - *AC-1:* Given index close < 50 EMA OR < 200 EMA, returns `gate1Pass: false`, `regime: 'BEAR'`, `positionScale: 0`. Given close > both EMAs and 5D return ≤ -3.0% or dayPct ≤ -4.0%, returns `gate1Pass: true`, `regime: 'CAUTIOUS_BULL'`, `positionScale: 0.5`. Given all 4 pass, returns `STRONG_BULL` with `positionScale: 1.0`.
- **FR-2:** `scoreGate2AccumulationQuality` scores all 7 factors (0–10) using real schema columns (`eps_ttm`, `roe_pct`, `book_value_per_share`, `npl_pct`, `car_pct`) merged with JSON fundamentals & `stockmap.json`, enforcing `isExcludedInstrument` and sector gates.
  - *AC-2:* `HIDCLP` (Promoter Share) and mutual funds are excluded; valid stocks earn accurate points matching all 7 factor thresholds including Factor 2.7 (`P/E < 40` and `ROE > 8%` or `P/B < 1.5`); stocks below score 7 or failing sector asymmetry/fundamental minimums are rejected.
- **FR-3:** `evaluateGate3IgnitionTiming` checks all 5 triggers on `targetDate` (Test Shot `[T-4..T-2]`, VDU on T₀, Spread ≤ 3.2%, Cost Floor within `[-1.5%, +2.0%]` of 5D VWAP, and Date-Aware Anti-Dump Guards).
  - *AC-3:* Returns `triggerCount === 5` when all 5 fire simultaneously; vetoes any stock where lead broker dumped > 500 kitta today OR any 10D past accumulator (≥ 5,000 kitta) dumped > 3,000 kitta on `targetDate` OR an unabsorbed > 15% single-seller exits.
- **FR-4:** `computeGate4RiskPlan` applies sector SL (`-2.5%` BFI, `-4.0%` Hydro, `-3.0%` others), `3%` Insurance cap, and `0.5x` multiplier for Cautious Bull or Score 7.
  - *AC-4:* Exact prices & portfolio % reflect sector, regime, and Gate 2 tier.
- **FR-5:** `formatDailySelectionGuideHtml` produces explicit "Selected Stock(s)" HTML when `qualified.length > 0`, explicit "No Stock Selected Today — Hold Cash" HTML when `BEAR` or `qualified.length === 0`, and HTML-escapes dynamic strings.
  - *AC-5:* Output never throws Telegram parse errors and contains explicit cash-preservation banner on empty/bear days.
- **FR-6:** `dispatchScheduledDailySelectionGuide` guarantees at most 1 automatic push per trading session via persistent disk state, while manual `/guide`, `/selection`, `/select`, `/dailyguide` respond on demand and `/playbook` stays intact.
  - *AC-6:* Calling `dispatchScheduledDailySelectionGuide` twice on the same `sessionDate` sends only 1 Telegram message (`skipped: true, reason: 'already_dispatched'` on second call).
- **FR-7:** HTTP endpoints in `proxy/server.mjs` expose preview (GET, dry-run) and admin-authenticated dispatch (POST with `requireAdminSecret`).
  - *AC-7:* Unauthenticated POST to `/api/telegram/dispatch-selection-guide` is rejected by `requireAdminSecret` (401/403).

---

## 4. Testing Plan (TDD)

Create `tests/testDailyStockSelectionGuide.test.mjs` testing:
1. Gate 1 Regime Classification: `STRONG_BULL`, `CAUTIOUS_BULL` (0.5x size), `BEAR` (< 200 EMA -> Bear veto + "No Stock Selected" alert).
2. Gate 2 Scoring & Schema Fidelity: Verifies SQLite `scrip_fundamentals` (`eps_ttm`, `roe_pct`, `book_value_per_share`) + JSON fallback scores Factor 2.7 cleanly, excludes `HIDCLP` promoter/MF scrips, and enforces sector asymmetry/BFI CAR/NPL vetoes.
3. Gate 3 Ignition Triggers & Date-Aware Anti-Dump Veto: Synthetic `:memory:` DB with qualifying stock (passes all 5 triggers), near-miss stock (no VDU -> Watchlist only), and Demat Dump trap stock (past accumulator dumps > 3,000 kitta on `targetDate` -> VETOED on T₀!).
4. Gate 4 Position Sizing & Sector Adjustments: Verifies BFI `-2.5%` SL, Hydro `-4.0%` SL + `0.70` VDU, Insurance `3%` cap, and `CAUTIOUS_BULL` / Score `7` 50% size reduction.
5. Formatter Outcomes & XSS/HTML Escaping: Selected Pick message vs Bull Zero-Match ("No Stock Selected") vs Bear Regime ("No Stock Selected") messages; HTML special characters safely escaped.
6. Persistent Daily Deduplication: `dispatchScheduledDailySelectionGuide` dispatches once for a `targetDate` and suppresses second automatic dispatch even after state reload.
7. Telegram Command Routing: `/selection` and `/guide` invoke the 4-Gate Stock Selection Guide dispatcher and `/playbook` remains working.
8. Live Read-Only Integration Check: Runs `evaluateDailySelectionGuide` against actual `proxy/data/drabyashree_ledger.db` cleanly without errors.

---

## 5. Implementation Plan

1. Write failing TDD suite `tests/testDailyStockSelectionGuide.test.mjs` and confirm failure.
2. Create `proxy/stockSelectionGuideEngine.mjs` implementing Gates 1–4, NEPSE index baseline + LKM/live loader, fundamentals merger, date-aware dump guard, and HTML formatter.
3. Wire `runDailyStockSelectionGuideAndDispatch` and `dispatchScheduledDailySelectionGuide` cleanly in `proxy/telegramNotifier.mjs`, add `/selection`, `/select`, `/guide`, `/dailyguide` routing, and update menus (`/help`, `hi`, fallback).
4. Schedule daily automatic EOD execution in `proxy/workers.mjs` inside `runPostMarketCloseAnalysis` + EOD startup check (keeping existing clutter-gate invariants intact).
5. Add `/api/telegram/dispatch-selection-guide` (`requireAdminSecret`) and `/api/telegram/preview-selection-guide` in `proxy/server.mjs`.
6. Run new test suite + all existing Telegram/clutter/schedule test suites + CodeRabbit review on uncommitted diff, fixing any findings before reporting.
