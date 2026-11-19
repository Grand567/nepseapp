# Requirements — Batch 3: Dead/Inverted Trading Engines, Paper Trading & Cache Locks

- **Timestamp (UTC):** 2026-11-19T08:00:00Z
- **Scope:** Remediate all `21` open Batch 3 bugs (`BUG-026`, `BUG-072`–`BUG-074`, `BUG-078`, `BUG-079`, `BUG-091`–`BUG-093`, `BUG-095`–`BUG-097`, `BUG-110`–`BUG-117`, `BUG-152`) plus Batch 2 registry/Playwright catch-up (`BUG-098` already fixed in Batch 1).
- **Governing Protocol:** `.agent/rules/architecture-guard.md` (Spec-First, Strict Red-Green TDD, Layer Isolation, Sentinel Static Audit, `vite build`, Playwright MCP UI Verification).

---

## Functional & Correctness Requirements

1. **`BUG-091` (`src/utils/priceActionEngine.js`):**
   - `analyzePriceAction` / `analyzeBreakout` must evaluate resistance breakouts, breakout retests, and support breakdowns against S/R levels derived from prior completed candles (`candles.slice(0, -1)`), eliminating the self-defeating `currentPrice * 1.002` / `0.998` filter that made breakouts and breakdowns mathematically unreachable.
2. **`BUG-152` (`src/utils/paperTrading.js`):**
   - `executePaperBuy` must reject `< 10` kitta orders instead of silently clamping up to `10`.
   - `executePaperBuy` and `validateAndExecutePaperOrder` must normalize lot properties (`qty ?? quantity`, `waccPerShare ?? wacc`) so `executePaperSell` executes cleanly and updates cash, positions, and closed trades accurately.
3. **`BUG-093` (`src/utils/signalArbitrationEngine.js`):**
   - Normalize `technical.trend.direction` case-insensitively (`.toUpperCase()`) and read `technical.momentum.condition || technical.momentum.state`.
   - Enforce `isVetoed` / `isBrokerDistribution` precedence BEFORE `WYCKOFF_SPRING_ABSORPTION` so vetoed stocks can never emit actionable accumulation signals.
4. **`BUG-026` (`src/utils/guruEngine.js`, `src/utils/masterProfitEngine.ts`, `src/components/services.tsx`):**
   - `selectMasterPrimePick` must never fall back to `isCircuitTrap` / `isT2CircuitExhaustion` / vetoed plans, and must never override `cashDefenseActive: true`.
   - `runMasterGuideAudit` must only crown a winner when `isFullyCleared && kellyShares >= 10 && !hasHardReject`, must include Chase Cap in `disqualificationReason`, must use `computeMasterPositionSizing`, and must zero out `compoundSimulation` when `crownedWinner === null`.
   - `PrimePickService` must remove fabricated RVOL (`1 + vol/50000 * 0.5`) and pass `sym` to `calculateMultiHorizonTargets`.
5. **`BUG-096` (`src/utils/swingGateEvaluator.js`):**
   - Enforce `aboveEma20` in `evaluateMarketRegimeGate`.
   - Never fabricate `ema20`, `ema50`, `rvol`, `bookValue`, `eps`, or `promoterLockinDays` when missing; fail corresponding gates honestly.
   - Require `transactions >= minTxns` (disallow `transactions === 0` bypass).
   - Score Gate 7 net R:R using dynamic `recommendedQuantity` instead of hardcoded `100` (and return `0` when `< 10` shares are affordable/permissible).
6. **`BUG-095` (`src/utils/nepseEquityFilter.js`, `src/components/ShortTermProfitPlan.jsx`):**
   - Extract canonical `isMutualFundOrDebenture` and `isPureNepseEquity` filtering out all mutual funds (`*F`, `*Y`, `C30MF`, `NBF*`, `SIGS*`, `MNMF*`, `KSY`, `RSY`, `CSY`, `NSY`, `GSY`), debentures (`*D8x`, digits), and promoter shares while preserving real equities (`CITY`, `HATHY`, `NMBMF`, `SWMF`).
   - Remove `|| ltp >= 150` liquidity bypass, default `bookValue = 100`, and fake `{ ltp: 300, sector: 'Commercial Bank' }` fallback from `ShortTermProfitPlan.jsx`.
7. **`BUG-112` (`src/services/floorsheet/floorsheetHubEngine.ts`):**
   - Return `source: 'DEPTH_UNAVAILABLE'` with empty `bids: []` and `asks: []` when live L2 depth is absent (remove `FLOORSHEET_VAP_DEPTH` / `isSyntheticVap: true` fabrication).
   - Use newest candles (`fallbackCandles.slice(-10)`) without synthetic `0.52`/`0.48` buy/sell splitting in `buildVolumeProfileFromFloorsheet`.
8. **`BUG-113` (`src/utils/signals/backtestEngine.js`, `src/components/BacktestReportScreen.tsx`):**
   - Include `buyCommission`, `buySebon`, and buy `dpCharge` in `costBasis`, `commissionPaid`, and `realizedPnl`; evaluate long-term CGT strictly via calendar days `> 365`.
   - Bootstrap `BacktestReportScreen` once on mount (`[]`), add `AbortController` / request sequence guard, stop snapping user-selected symbol back to `'NABIL'`, and remove `FALLBACK_METRICS` silent swap.
9. **`BUG-072`, `BUG-073`, `BUG-074`, `BUG-079` (`src/components/StockDetailModal.jsx`, `src/components/StockBrokerAnalysisTab.jsx`):**
   - Display `-` sign on negative `%` change badges in StockDetailModal hero header.
   - Wire `ALL_TIME` Overview mode to `allTimeBrokerAnalysis` distributors and BCR3 with dynamic session counts.
   - Fetch real 365-day OHLCV history for comparison peers and remove fabricated `1.2x..12.0x` return multipliers (`'—'` if unavailable).
   - Reset symbol-scoped state on stock switch, hoist `pollTimer` cleanup out of `.then()`, and guard async callbacks with `active` + monotonic sequence IDs.
10. **`BUG-078` (`src/components/StockInformationHubModal.tsx`):**
    - Compute circuits against `dailyPrevClose` (not `ltp`), prefix `/api/...` calls with `getProxyBase()`, reset symbol-scoped state with async cancellation, and pass verified fundamentals instead of fabricated `eps = 22` / `bookValue = 180` / `volume = 25000`.
11. **`BUG-092` (`src/components/swing/SwingTradeSelectorView.tsx`, `src/components/ServicesHub.tsx`):**
    - Import `STATUTORY_CHARGES` (fixing non-existent `STATUTORY_FRICTIONS`), derive market regime from live `indices` + equity breadth, remove 5-stock mock array and `2615.4` hardcodes, and bind Paper Trading tab to live `getPaperState()`.
12. **`BUG-097` (`src/components/EntryExitAnalyzer.tsx`):**
    - Retain today's completed closing bar post-3:00 PM NPT (only slice when pre-open, holiday, weekend, halt, or 0 volume); clear `fundamentals` on symbol switch and enforce monotonic request ID guard.
13. **`BUG-110` (`src/components/BrokerFlowDominanceService.tsx`):**
    - In `net_sellers` fallback, require `netKitta < 0` (never promote net buyers via `Math.abs`) and prioritize `avgSellRate` in sell modes.
14. **`BUG-111` (`src/components/MinerviniLeaderboard.tsx`):**
    - Filter via `isPureNepseEquity`, require verified `high52w`/`low52w` instead of auto-passing `1.15x`/`0.75x`/`0.70x` bounds, match OAMI footer (`35%/30%/20%/15%`), and show `'—'` when `dpi` is absent.
15. **`BUG-114` (`src/components/PaperTradingJournalScreen.tsx`):**
    - Prefix `/api/paper-trading/*` calls with `getProxyBase()`, surface HTTP/network errors instead of swallowing `.catch(() => null)`, and cancel on unmount.
16. **`BUG-115` (`src/components/FibonacciCalculatorService.tsx`):**
    - Branch Golden Pocket, in-zone detection, stop-loss guidance, and target labels on `trend === 'up'` vs `'down'`, and guard division against `currentLtp <= 0`.
17. **`BUG-116` & `BUG-117` (`src/components/services.tsx`):**
    - Never store `isHistoryPending: true` results in `tfMetricsCache` `WeakMap`; support `activeDate` truncation in `computeStockTimeframeMetrics`.
    - Pass `stocks` prop to `CompareStocks`'s `StockSearchSelect` inputs, handle `isHistoryPending` honestly, and null-guard `technicalScore`, `dpi`, and `marketCap`.
    - Filter `SectorHeatmapService` via `isPureNepseEquity`, pass `activeDate`, batch-warm sector equities, exclude pending/extrapolated stocks from multi-TF sector averages, and add monotonic sequence guards.

---

## Verification Plan
1. **Red TDD:** `node tests/arBatch3TradingEnginesPaperAndCache.test.mjs` fails on pre-fix code.
2. **Green TDD:** `node tests/arBatch3TradingEnginesPaperAndCache.test.mjs` passes `100%` after fixes.
3. **Full Suite:** `node tests/runAll.mjs` passes all suites (`0` failed); tracked test side-effect files restored.
4. **Static Audit & Build:** `node scripts/sentinelStaticAudit.cjs` (`0` errors) and `npm run build` (`0` errors).
5. **Playwright MCP:** Live click-through verification on `vite preview` across Batch 2 catch-up + Batch 3 views with `0` non-proxy JS errors in console log.
