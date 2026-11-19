# Batch 5: P1 Whole-App Bug Remediation Specification

**Execution Date:** 2026-11-19
**Scope:** 90 P1 Bugs across Sub-Groups 5A, 5B, 5C, 5D, 5E
**Guiding Rules:** `.agent/rules/architecture-guard.md`, `.agents/skills/tdd`, `.agents/skills/gravitas`

---

## 1. Sub-Group 5A: Statutory Math, Core Quant/Alpha/Master Engines, Indicators & Metrics (16 Bugs)
- **BUG-033 (`src/utils/calculations.js`, `src/utils/setupAnalyzer.js`, `src/utils/masterProfitEngine.ts`):**
  - Deduct Buy DP fee Rs. 25 in `calculateNepseNetTrade` (`calculations.js:222`) to match `calculateBuyDetails` and `calculateExactStatutoryTrade`.
  - Fix CGT rate in `setupAnalyzer.js:548`: change hardcoded `0.10` (10%) to `0.075` (7.5% short-term individual CGT).
  - Long-term CGT boundary in `calculations.js:233`: change `>= 365` to `> 365`.
  - `calculateWacc` (`calculations.js:620-622`): use rounded `finalQty = Math.round(totalQty)` consistently for both `totalQuantity` and `wacc` division.
- **BUG-035 (`src/utils/masterProfitEngine.ts`, `src/utils/signals/stockScoringEngine.js`):**
  - `masterProfitEngine.ts:700-702`: `netRewardPerShare` must divide `netRealizedGain` by actual position shares (not fixed 100) and net risk per share must incorporate statutory fees. Do not clamp negative rewards to `+0.5`.
  - `stockScoringEngine.js:276`: Return `0` (or `safeShares = 0`) when affordable shares < 10 kitta board lot instead of forcing 10 kitta above available capital.
- **BUG-036 (`src/utils/quantEngine.js`, `src/utils/signals/stockScoringEngine.js`):**
  - `quantEngine.js:2084-2096` (`detectWyckoffPhase`): reorder UTAD (`currentPos >= 85 && netChg >= 35`) before Markup Breakout (`currentPos >= 80 && netChg >= 15`) so UTAD is reachable.
  - `quantEngine.js:3251` (`calculateKellyCriterion`): return `recommendationPct: 0` when `rawKelly <= 0` (remove 5.0% fallback).
  - `quantEngine.js:3863-3869` (`runStockScanners` large/mid/small cap): normalize `marketCap` (convert >1e6 Rupees to Millions NPR) so 4,000M (4 Arba) to 15,000M (15 Arba) works correctly.
  - `quantEngine.js:2930`: label effectiveBreadth as `% above 50-DMA` when calculated from `countAbove50 / totalWithEma`.
  - `stockScoringEngine.js:255-256`: do not clamp multi-week swing Target 2 to single-day 15% circuit ceiling.
- **BUG-037 (`src/utils/masterAlphaPipeline.js`):**
  - Compute `statutoryBreakevenPrice` with iterative friction including min Rs. 10 broker fee.
  - Divide `netRRR1` by net risk after sell friction.
  - Filter `isPureNepseEquity(s)` in `computeSectorRelativeStrengthRanks`.
  - Fix 40%/30%/30% 10-lot integer scale-out rounding.
- **BUG-099 (`src/utils/stockMetrics.js`):**
  - Line 153: Fix 1 Arba conversion from `1e10` to `1e9`.
  - Lines 68, 71, 106: Return `null` for `avg120d`, `avg180d`, and `ath` when historical candles are absent (remove `ltp * 0.95`, `ltp * 0.93`, `ltp * 1.6` fakes).
- **BUG-108 (`src/utils/technicalAnalysisEngine.js`, `src/utils/stockSignals.js`, `src/utils/indicators.js`):**
  - `technicalAnalysisEngine.js:114, 118`: Guard against `null` in EMA array comparisons so false Golden/Death Crosses are not emitted during warm-up.
  - `stockSignals.js:90, 93`: Strict `>` and `<` comparisons for streaks so flat 0% days do not increment streak counter.
  - `indicators.js:98-116`: Pad `signalArray` with nulls matching `macdLine` length so MACD signal series index aligns with candle timestamps.
- **BUG-148 (`src/utils/riskManagement.js`):**
  - Return `0` shares when `rawShares < 10` or capital insufficient.
  - Fix `kellyCaptital` typo (support both `kellyCapital` and `kellyCaptital`).
  - True statutory breakeven calculation.
- **BUG-149 (`src/utils/liveSectorMedians.js`):**
  - Normalize sector keys to snake_case (`commercial_bank`, `development_bank`, `finance`, `microfinance`, `hydropower`, `life_insurance`, `non_life_insurance`, `manufacturing`, `hotel_tourism`, `investment`, `others`) matching `fundamentals.js:176`.
  - Filter `isPureNepseEquity` and preserve valid negative/zero ROEs.
- **BUG-038 & BUG-057 (`src/services/aiGuru/runAiQuantitativeAssessment.ts`, `src/hooks/useUnifiedStockTelemetry.ts`):**
  - Prepend `getProxyBase()` to `/api/...` fetch endpoints for Capacitor Android and external client origins.
- **BUG-039 (`proxy/brokerVault.mjs`):**
  - Wash-deflate `dailyFlow` BCR3 and cap percentage at `100.0`.
- **BUG-040 (`proxy/server.mjs`):**
  - In `/api/smart-money/broker-heatmap`, trigger `downloadAndArchiveDailyFloorsheet` asynchronously/non-blocking and bound aggregations.
- **BUG-169 (`proxy/routes/stockTelemetryRoutes.mjs`):**
  - Compute authentic ticket size from `buy_vol + sell_vol` divided by `trades` (or null if trades=0), rather than hardcoded `/ 10` and fake `anomalyScore: 1.0`.
- **BUG-170 (`proxy/nepseClientManager.mjs`, `src/utils/servicesApi.js`, `proxy/server.mjs`):**
  - Forward actual `payload` in `requestPOSTAPI` instead of literal `'general'`.
  - In `servicesApi.js:58-60`, remove 10-minute floor on short-TTL queries.
  - In `proxy/server.mjs:3938-3951`, return 404 for missing subfiles instead of defaulting to Day-1.
- **BUG-171 (`proxy/utils/todayDataEngine.mjs`, `proxy/utils/historicalSubfilesEngine.mjs`, `proxy/utils/microstructureEngine.js`, `proxy/utils/promoterLockinEngine.mjs`):**
  - Fix `todayDataEngine.mjs` SMA labeling, real EMA/SMA values, remove fake `eps=15`/`bv=150`.
  - Fix `historicalSubfilesEngine.mjs` flat price RSI to 50.0.
  - Fix `microstructureEngine.js:270-275` `bAmt`/`sAmt` short-circuit bug.
- **BUG-173 (`proxy/utils/dailyFloorsheetCollector.mjs`, `proxy/db/ledgerStore.js`):**
  - Replace `bBroker > sBroker ? 'BUY' : 'SELL'` side heuristic with tick rule / `'UNKNOWN'`.
  - In `ledgerStore.js`, remove `|| 100` rate fallback, use `.tmp` + `renameSync` for atomic writes.

---

## 2. Sub-Group 5B: Dashboard, App Shell, Charts & UI Lifecycle (13 Bugs)
- **BUG-058 (`src/components/Dashboard.jsx`, `src/App.jsx`):**
  - Drop `lastSyncTime` from `loadHeroHistory` dependencies to stop 1.5s–5s polling storm.
  - Consolidate conflicting 350ms vs 1500ms auth resolution fallback in `App.jsx`.
- **BUG-059 (`src/App.jsx`, `src/components/Dashboard.jsx`):**
  - Dispatch `'stealth-accumulation-tracker'` service ID instead of deprecated `'stealth-accumulation'`.
  - Pass authentic `selectedDate`/`sessionDate` in `StockDetailModal` invocation even when `isHistoricalSession` is falsey.
- **BUG-060 (`src/context/NavigationContext.jsx`):**
  - Ref-stabilize `goBack` so Capacitor `backButton` and `popstate` listeners mount once with `[]` deps.
- **BUG-061 (`src/components/ErrorBoundary.jsx`):**
  - "Return to Market" button directly calls `this.handleReset()` before navigating.
- **BUG-062 (`src/components/Dashboard.jsx`):**
  - Filter `isPureNepseEquity(s)` across `gainers`, `losers`, `turnoverLeaders`, `slowAccumulationStocks`, `distributionTrapStocks`, `filteredBreadthStocks`, and `ChangeSummaryModal`.
- **BUG-063 (`src/components/Dashboard.jsx`):**
  - Pass `.symbol || .key` to `AdvancedChartModal` and `ShareHubChart` instead of human `.name`.
  - Remove fake `174.35` float index fallback and `1.25` rvol fallback.
  - Strict `> 0` comparison for `isHeroBull`.
- **BUG-064 (`src/components/charts/StockCandlestickChart.tsx`):**
  - Hoist `EMPTY_CANDLES` static reference and attach `ResizeObserver` to container for hidden-tab visibility transitions.
- **BUG-065 (`src/components/ShareHubChart.jsx`):**
  - Remove leaked `setLoading(false)` from unmount cleanups.
  - Only overwrite latest point with `stock.ltp` during live today session (`activeTf === '1D' && !stock?.isHistoricalSession`).
- **BUG-066 (`src/components/InstitutionalAlertCardModal.tsx`):**
  - Add `onClick={onClose}` to backdrop container.
  - Check `concentration >= 50` for Condition 2 badge.
  - Guard `ltp > 0` before computing percentage risk/reward.
- **BUG-067 (`src/components/BreakoutAlertDialog.jsx`):**
  - Remove `stock` from `useEffect` dependencies so user input is not wiped every 2.5s.
  - Remove fake `100` LTP fallback.
- **BUG-068 (`src/components/SmartAlertBanner.jsx`):**
  - Track auto-dismiss timer in `useRef` and clean up on unmount or re-trigger.
- **BUG-069 (`src/components/SessionFreshnessBadge.jsx`, `src/components/Dashboard.jsx`):**
  - Render "Syncing..." when `lastUpdatedMs` is null/0 instead of claiming `"LIVE"`.
  - Pass active session date during open market instead of `lastClosedSessionDate`.
- **BUG-070 (`src/components/NRBMacroWidget.jsx`):**
  - Static fallback defaults stamp `'NRB Baseline'` rather than today's date.
  - Abort active controller on component unmount.

---

## 3. Test Plan & Regression Gates
1. Create `tests/atBatch5P1Remediation.test.mjs` (Sub-Group 5A) and `tests/auBatch5BRemediation.test.mjs` (Sub-Group 5B).
2. Register both test files in `tests/runAll.mjs`.
3. Verify 100% passing tests via `node tests/runAll.mjs` and `node tests/testDailyStockSelectionGuide.test.mjs`.
4. Run `node scripts/sentinelStaticAudit.cjs` (0 errors).
5. Run `npm run build` (0 errors).
6. Verify via Playwright MCP.

---

## Sub-Group 5C: StockDetailModal & Sub-Tabs (`BUG-009`, `BUG-015`, `BUG-016`, `BUG-080`–`BUG-089` — 13 Bugs) — [COMPLETED & VERIFIED ✅]

### Scope & Verified Fixes:
1. `BUG-009`:
   - `src/utils/accumulationDistributionEngine.ts`: Added liquidity floor (`volume >= 500 && turnover >= 100000`) to `calculateSectorAccumulationChampions` so micro-volume illiquid stocks cannot become Sector Champions.
   - `src/components/StockDetailModal.jsx`: In Action Banner, only attribute avoid reasons to `Order Flow Veto Law Active` when `overviewOrderFlowVeto?.isVetoed` is actually true, avoiding false whale dump claims on ordinary consolidation.
2. `BUG-015`:
   - `src/components/StockDetailModal.jsx`: Prioritized `entryExitPlan?.levels?.stopLoss` and `entryExitPlan?.levels?.target1` in `overviewStopLoss` and `overviewTarget1`, unifying numbers with BeginnerConfidenceCard; rendered `'—'` for missing RVOL instead of `'1.00x'`.
3. `BUG-016`:
   - `src/components/StockDetailModal.jsx`: Guarded `rawPromoterPct` against defaulting to `0` when null; rendered `Promoter & Public float distribution: Unverified / Not Disclosed in Filings` when promoter data is absent.
   - `src/utils/fundamentals.js`: Formatted `bench.medianPBV` (`.toFixed(2)`), `medianPE` (`.toFixed(1)`), `medianROE` (`.toFixed(1)`), and `medianEPS` (`.toFixed(2)`) in evaluation reason strings.
4. `BUG-080`:
   - `src/components/StockDetailModal.jsx`: In `BeginnerConfidenceCard`, passed statutory purchase WACC (`buyCalc.costPerShare`) including commissions, SEBON fee, and DP fee to `calculateSellDetails` instead of raw `buyPrice`, ensuring accurate taxable CGT and net profit.
5. `BUG-081`:
   - `src/components/StockDetailModal.jsx`: Removed fake `+14.8%` 1Y return fallback, dynamic float check replacing hardcoded `'35% Public'`, dynamic `${piotroskiScore.score} / ${piotroskiScore.totalCriteria}` preventing `10/9` overflow, removed peer P/E fallback `|| 22`, and prepended `getProxyBase()` to `/api/stocks/${sym}/ledger-telemetry`.
6. `BUG-082`:
   - `src/utils/floorsheetExport.js` & `src/components/StockDetailModal.jsx`: Exported canonical `BULK_DEAL_MIN_QTY = 500` and `BULK_DEAL_MIN_AMOUNT = 250000` constants, unifying transaction sheet and export tables.
7. `BUG-083`:
   - `src/components/StockBrokerAnalysisTab.jsx`: Removed `/ 420` synthetic trade count estimation, removed fallback to gross `b.buyQty` when net holding was requested, and formatted `effectiveDays === 'all'` as `'All-Time'`.
8. `BUG-084`:
   - `src/components/stock/BrokerSmartMoneyCard.tsx`: Computed `retentionRatePct` on each holder item, removed `/ 80` synthetic trade count estimation, and cleared `cached1DPayload` on `cleanSymbol` change.
9. `BUG-085`:
   - `src/components/StockSeasonalityCard.jsx` & `src/components/StockInformationHubModal.tsx`: Reconciled Poush monthly return (-1.25%) and labeled card as `NEPSE Index Macro Baseline` when multi-year symbol history is pending.
10. `BUG-086`:
    - `src/components/StockInformationHubModal.tsx`: Rendered `'—'` when peer `ltp` is missing instead of substituting target stock's own LTP; added Friday/Saturday weekend guards in `isMarketOpen()` to avoid weekend polling storms.
11. `BUG-087`:
    - `src/components/StockYanAnalyticsCard.jsx`: Handled `< 5` bars without fabricating `±5%` S/R, guarded `ltp > 0` against `NaN%`, and aligned card header with title (`Breakable Resistance` vs `Overhead Supply Barrier`).
12. `BUG-088`:
    - `src/components/StockDetailModal.jsx`: Synchronized calculator `priceInput` and `waccInput` on `[d?.symbol, d?.ltp]` updates, and removed static `350` and `'Nov 6'` defaults.
13. `BUG-089`:
    - `src/utils/candlestickPatterns.js`: Added authentic computation of RSI (14), MACD (12, 26, 9), and RVOL (20D) from `history` candles when precomputed fields on `stock` are absent, eliminating `'—'` oscillators.
