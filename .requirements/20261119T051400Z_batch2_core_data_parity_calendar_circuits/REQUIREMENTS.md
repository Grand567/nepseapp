# Batch 2 — Core Data Parity, SQLite/Vaults, Calendar, Circuits, Non-Equity & Settlement

**Timestamp:** `2026-11-19T05:14:00Z` (`2026-11-19T10:59:00+05:45`)
**Batch Scope:** Phase 3 — Batch 2 (`23` bugs: `BUG-001`–`BUG-007`, `BUG-010`, `BUG-011`, `BUG-022`, `BUG-025`, `BUG-027`–`BUG-030`, `BUG-032`, `BUG-034`, `BUG-135`, `BUG-136`, `BUG-138`, `BUG-139`, `BUG-165`, `BUG-168`)

---

## 1. Objectives & Verifiable Requirements

### 1.1 Broker, Microstructure & Cumulative Ledger Parity (`BUG-001`–`BUG-006`, `BUG-028`, `BUG-029`, `BUG-032`)
1. **`BUG-001` (Stale Session Date vs Payload Date Parity):**
   - `StockDetailModal.jsx` (`StockTechnicalGaugeCard` at `L4501`, `L5289`) and `candlestickPatterns.js` (`L853`) MUST pass explicit `brokerData` to `StockTechnicalGaugeCard` so `evaluateOrderFlowVeto` evaluates the modal's active session broker payload rather than stale in-memory cache.
   - `BrokerFlowDominanceService.tsx` (`sessionDate` at `L262-272`) and `AccumulationDistributionRadar.tsx` (`handleStockPress` at `L991` and header date badges) MUST prioritize the actual payload `businessDate` / `asOfDate` when no explicit historical date filter is locked or when fallback data is served.
2. **`BUG-002` & `BUG-029` (Top Seller Brokers Volume/Amount/Pct Mapping & Concentration Bounds):**
   - `sharedBrokerAggregationEngine.js` (`L739-795`, `L1090-1095`) MUST populate `sellPct` (`sellVol / totalVolume * 100`) on broker profiles, and on `topSellerBrokers` / `topGrossSellers` / `topSellers` MUST map `volume: s.sellVol`, `amount: s.sellAmt`, `pct: s.sellPct`, `nonCrossVolume: s.nonCrossSellVol` so `AccumulationDistributionRadar.tsx` (`-{s.volume}`) and `whaleDailyArchive.js` (`b.pct`) render authentic seller volumes, amounts, and percentages (never `-0` or `0%` when a seller bought `0`).
   - `historyCache.js` (`buildPrecomputedBrokerMap`, `L140-180`) MUST set both `.pct` and `.sharePct` on buyers/sellers and compute exact `bcr5BuyPct` (`top5BuyQty / totalBuyQty * 100`, capped at `100`).
3. **`BUG-003` & `BUG-029` (Concentration Percentage Caps & Gross/Net Separation):**
   - `sharedBrokerAggregationEngine.js` (`L813-819`, `L845-848`) MUST cap `bcr3BuyPct`, `bcr5BuyPct`, `scr3SellPct`, `bcr3NetPct`, `bcr5NetPct`, `scr3NetPct`, `scr3GrossSellPct` strictly within `[0, 100]` (`Math.min(100, Math.max(0, ...))`).
   - `AccumulationDistributionRadar.tsx` (`L705`, `L904`) MUST assign `bcr5BuyPct: Math.min(100, Number(st.bcr5BuyPct ?? st.grossBuyConcentrationPct ?? st.bcr5NetPct ?? 0))` instead of overwriting `bcr5BuyPct` with net flow `st.bcr5NetPct`.
   - `quantEngine.js` (`runStockScanners`, `L3856-3867`) MUST normalize `bcr3` whether provided on a `0–1` or `0–100` scale (`const bcr3Pct = (s.bcr3BuyPct ?? ((s.bcr3 || 0) <= 1 ? (s.bcr3 || 0) * 100 : s.bcr3))`) and require real broker concentration/distribution rather than falling back to pure 1-day price change.
4. **`BUG-004` (Broker Top 10 Async Race Guard):**
   - `BrokerFlowDominanceService.tsx` (`loadData`, `loadBrokerRetention`, `loadStockRetention`) MUST use monotonic sequence ID counters (`loadDataSeqRef`, `brokerRetSeqRef`, `stockRetSeqRef`) so stale out-of-order responses never overwrite a newer timeframe or date selection, and `loadData` only sets seed heatmap when `histSeed.businessDate === effDate` or `!targetDate`.
5. **`BUG-005` & `BUG-032` (All-Time Broker Holdings, Vaults, Subfiles, Cache Keys & L2 Depth Persistence):**
   - Reconcile `src/data/broker_holdings_alltime.json`, `src/data/nepse_cumulative_broker_ledger.json`, `proxy/data/broker_alltime/*.json` (`GHL` through `2026-11-18` with SQLite 45D `netQty: +2,811,301`), `proxy/data/broker_vault/*.json` (`latestDate: "2026-11-18"`), `proxy/data/historical_4days_ledger.json` & `historical_5days_ledger.json` (`2026-11-18`), and `proxy/data/last_known_market.json` (`date: "2026-11-18"`).
   - `proxy/workers.mjs` (`runPostMarketCloseAnalysis`) and `proxy/utils/dailyFloorsheetCollector.mjs` MUST also export `src/data/broker_holdings_alltime.json` and update `broker_alltime` / `broker_vault` `latestDate` on post-market close.
   - `src/utils/setupAnalyzer.js` (`getSafeCachedBrokerData`, `L80-89`) MUST query `getCachedBrokerData(sym)` from `historyCache.js` in addition to `localStorage` keys (`nepse_real_broker_${sym}_d1_latest__`, `nepse_real_broker_${sym}`, `broker_cache_${sym}`).
   - `proxy/server.mjs` (`saveMarketDepthSnapshot`) and `proxy/db/ledgerStore.js` MUST persist verified L2 depth snapshots into SQLite `market_depth_cache`.
6. **`BUG-006` (StockBrokerAnalysisTab Cumulative Holding Column):**
   - `src/components/StockBrokerAnalysisTab.jsx` (`L904`) MUST NOT override `effectiveCumHold` (`cumHoldQty`, rendered under `TOTAL HELD TILL TODAY` at `L2548`) with 1-day `holdQty` when `isSingleSession` is true; `cumHoldQty` MUST always reflect cumulative multi-session holdings when `cumulativeHoldingMap` has data (or `null` when unavailable), while `holdQty` represents the session net hold.
7. **`BUG-028` (Complete `#1–#101` Broker Registry & Canonical `getBrokerName`):**
   - `src/utils/sharedBrokerAggregationEngine.js` (`TOP_NEPSE_BROKERS`) MUST include all active NEPSE brokers `#1` through `#101` (matching `proxy/brokerVault.mjs`, with `#58` = `Naasa Securities (#58)` and `#77` = `Nabil Stock Dealer (#77)`).
   - `src/utils/localLedgerManager.ts` (`L784, 802, 886, 916, 1028, 1054, 1138`) MUST resolve broker names via `getBrokerName(id)` instead of hardcoding ``Broker #${id}``.

### 1.2 Honest Off-Market Level-2 Order Book Fallback (`BUG-007`)
8. **`BUG-007` (No Fabricated Geometric L2 Order Book):**
   - `src/utils/liveData.js` (`fetchMarketDepth`, `L3789-3831`) MUST NOT synthesize geometric stepped bids/asks (`vol * 0.035 * ...`) and mislabel them `"Closing Session Snapshot (3:00 PM NPT)"` with `source: 'client_closing_snapshot'`. When the backend has no verified live or cached closing order book, it MUST return `bids: []`, `asks: []`, `isSynthetic: false`, `isUnavailable: true`, `source: 'unavailable_off_market'`, and `sessionLabel: 'Order Book Unavailable Outside Live Trading Hours'`.

### 1.3 Calendar, Pre-Market Future Date Leak, Holiday Filter & T+2/T+3 Settlement (`BUG-010`, `BUG-011`, `BUG-027`, `BUG-034`, `BUG-168`)
9. **`BUG-010` (Holiday Filter in Radar Session Date Dropdown):**
   - `src/components/AccumulationDistributionRadar.tsx` (`radarAvailableDates`, `L831-861`) MUST filter all candidate dates through `isNepseTradingDay(new Date(d + 'T12:00:00+05:45'))` so official public holidays (e.g. Tihar Bhai Tika `2026-11-11`) and weekends never appear.
10. **`BUG-011` (Dashboard Post-Close Frozen Session Date):**
    - `src/components/Dashboard.jsx` (`L4462-4486`) MUST render `getDetailedMarketStatus().lastClosedSessionDate || getDetailedMarketStatus().targetSessionDate` when `!getDetailedMarketStatus().isOpen` so post-close frozen headers show the last concluded session (`2026-11-18`) rather than tomorrow's upcoming session (`2026-11-19`).
11. **`BUG-027` (Pre-Market Future Date Leak in `/api/trading-dates` & `fetchAvailableTradingDates`):**
    - `proxy/server.mjs` (`getMarketTradingDates`, `L4145-4207`) and `src/utils/liveData.js` (`fetchAvailableTradingDates`, `L2868-2930`) MUST NOT inject Synthetic `generateTradingDaysSequence()` dates or `todayIso` into available session dates unless `todayIso` actually exists in SQLite (`hasTradeDate(todayIso)` / `daily_stock_summary` / `floorsheet_contracts`) OR current NPT time is during/after market open (`>= 10:30 AM NPT` on a valid trading day).
12. **`BUG-034` & `BUG-168` (Canonical Demat Sellability `SELLABLE_DAYS = 3` / T+3 & NPT-Safe Date Math):**
    - `src/utils/nepseCalendar.js` (`countNepseTradingSessionsBetween` at `L759-760` and `generateTradingDaysSequence` at `L810-835`) MUST use `formatNptDateIso` instead of UTC `.toISOString().slice(0, 10)` and step dates safely without local-timezone drift.
    - Standardize NEPSE T+2 rolling settlement Demat unlock (`SELLABLE_DAYS: 3`, i.e., bought on Day `T` / `entryIdx`, settles `T+2` night, first sellable session is `T+3` / `holdSessions >= 3` / `daysHeld >= 3` / `j >= entryIdx + 3` = `i + 4`):
      - `proxy/db/signalTrackerStore.js` (`L649, L688`): `entryIdx = i + 1`; Demat sellable on `j >= entryIdx + 3` (`i + 4`), `holdingDays = j - entryIdx`.
      - `proxy/utils/exitRatchetEngine.mjs` (`L23, L126`): `T_PLUS_2_DEMAT_LOCK: 3` (`sessionIndex >= 3` where `0 = entry bar`).
      - `src/utils/setupAnalyzer.js` (`L476`): `canExit = daysHeld >= 3`.
      - `src/utils/signals/backtestEngine.js` (`L129`): `isSettledInDemat = holdSessions >= 3`.
      - `src/services/signalTracker.js` (`L295-296, L558-563, L619-622`): use `countNepseTradingSessionsBetween(sig.signalDate, exitDateStr) >= 3` before allowing target/stop exit in both `updateSignalStatus` and `evaluateOpenSignals`.

### 1.4 Non-Equity Classification, Fixture Purge, Corporate Actions, Statutory Rules & Backend Stability (`BUG-022`, `BUG-025`, `BUG-030`, `BUG-135`, `BUG-136`, `BUG-138`, `BUG-139`, `BUG-165`)
13. **`BUG-022` (Reclassify 114 Non-Equity Instruments in `stockmap.json` & `nepseUniverse`):**
    - Reclassify all Mutual Funds, Corporate Debentures/Bonds, and Promoter/Preference Shares in `proxy/stockmap.json`, `src/utils/stockmap.json`, `src/data/nepseUniverse.js`, and `src/data/nepseUniverse.ts` out of equity sectors (`Commercial Banks`, `Development Banks`, `Finance`, `Life Insurance`, `Investment`, etc.) into `"Mutual Fund"`, `"Corporate Debenture"`, or `"Promoter Share"`.
    - Update `normalizeSectorName` in `src/data/nepseUniverse.ts` so `"Corporate Debenture"` and `"Promoter Share"` are preserved (never collapsed into `"Others"` or `"Life Insurance"`).
14. **`BUG-025` (Purge Unit-Test Fixtures `PIT_TEST_SCRIP` & `PIT_NO_REL` & Isolate Test):**
    - Remove `"PIT_TEST_SCRIP"` and `"PIT_NO_REL"` from `src/data/nepse_fundamentals_latest.json`, `proxy/data/nepse_fundamentals_latest.json` (if present), and SQLite `scrip_fundamentals` in `proxy/data/drabyashree_ledger.db`.
    - Update `tests/acItem1LookAheadFix.test.mjs` so it cleans up any test symbols (`PIT_TEST_SCRIP`, `PIT_NO_REL`) in a `finally` block and never leaves dirty rows in SQLite or JSON.
15. **`BUG-030` (Date-Bounded Corporate-Action Price Normalization Under `±15%` Circuit):**
    - `src/utils/quantEngine.js` (`normalizeCorporateActionPrices`, `L2220-2243`) and `src/utils/setupAnalyzer.js` (`adjustForCorporateActionsWithConfirmation`, `L153-189`) MUST bound corporate-action matching to the actual `bookCloseDate` / `bookClosureDate` / `exDate` window (`±5` calendar days when date is present, or strict fiscal-year window with `dropPct > 15.2` when post-April-2026 `2026-04-20` candles have no explicit `bookCloseDate`) so normal `-10%` to `-15%` market drops under the `±15%` daily circuit are never misclassified as historical bonus adjustments.
16. **`BUG-135` (`PromoterSharesService.tsx` Null Ownership Guard & `'MSL'` -> `'MSHL'` Typo):**
    - `src/components/PromoterSharesService.tsx` (`L74-180`, `L265-288`) MUST NOT fabricate `51%` Promoter / `49%` Public when `promoterPct == null` or render literal `null%` while computing `avgPromoterHolding` over null entries; display `'N/A'` when unverified and average only verified rows.
    - Fix `'MSL'` -> `'MSHL'` (`Mid Solu Hydropower Limited`) in `proxy/data/promoter_lockin_registry.json`.
17. **`BUG-136` (`PreferencesSettingsService.tsx` `503` Health JSON Parsing & NPT Date in `monitoringService.mjs`):**
    - `src/components/PreferencesSettingsService.tsx` (`fetchMonitoringHealth`, `L41-54`) MUST parse JSON even when HTTP status is `503` (`res.ok || res.status === 503`), and set an explicit degraded/offline state on network failure instead of falling back to fake all-green `'HEALTHY'` / `100%` defaults.
    - `proxy/utils/monitoringService.mjs` (`L49`) MUST format `expectedDate` with `formatNptDateIso(lastTradingDayObj)` instead of UTC `.toISOString().split('T')[0]`.
18. **`BUG-138` (Canonical Statutory Rules Across `marketRules.js`, `RegulatoryHub.tsx` & `proxy/server.mjs`):**
    - `src/constants/marketRules.js`: Update `CIRCUIT_LIMITS.indexCircuitBreakers` to the two-tier post-April 2026 model (`5.0%` 15-min halt, `8.0%` full-day suspension, matching `proxy/utils/nepseRules.mjs`), update `SETTLEMENT_CYCLE` (`sellableDays: 3`), update `CAPITAL_GAINS_TAX` (`holdingDays > 365` for 5.0% long-term retail CGT, `<= 365` for 7.5% short-term), and include Rs. `25` CDSC DP fee on both buy and sell legs in `calculateRoundTripNetReturn`.
    - `src/components/RegulatoryHub.tsx` (`L461-466`) and `proxy/server.mjs` (`L10218-10222`): Update displayed broker commission slabs from obsolete `0.40%–0.27%` to statutory `0.36% / 0.33% / 0.31% / 0.27% / 0.24%`.
19. **`BUG-139` (`scanners.js` `0–89` Day Imminent Lock-In Cliff Guard & Unverified Defaults):**
    - `src/utils/scanners.js` (`L23, L131`) MUST flag lock-in expiry cliffs for `days >= -30 && days <= 180` (catching imminent `0–89` day expirations and recently unlocked `-30..0` day overhang, not just `90..180` days), and MUST NOT inject fake passing defaults (`npl = 0`, `distEps = 16`, `epsGrowth = 26`, `costPerMW = 18`, `bv = 115`, `pe = 22`, `invGrowth = 5`) when fundamental fields are null/missing.
20. **`BUG-165` (`runMacroScraper` Missing Imports & Unclosed SQLite Handles in Subfile Compilers):**
    - `proxy/server.mjs`: Import `getMacroCache` from `./quant/macroCache.mjs` and replace `pool.query` in `runMacroScraper` (`L13338-13350`) with `query(...)` from `./db.mjs`.
    - `proxy/utils/todayDataEngine.mjs` (`compileTodayStaticAnalytics`) and `proxy/utils/historicalSubfilesEngine.mjs` (`compileHistoricalSubfiles`): Check `sqlite_master` before querying `scrip_fundamentals`, and always close self-opened `db` handles in a `finally` block (`if (!options.db && db) db.close()`).
