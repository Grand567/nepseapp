# Drabyashree NEPSE — Full Verification & Audit Report

**Audit Date:** 2026-11-26 (`2083 Mangsir 10 BS`, Post-Market Closed Session `2026-11-25`)
**Target:** `c:\Users\Hp\Desktop\Software\nepse app` (`http://127.0.0.1:3005` preview + `http://127.0.0.1:5000` Express proxy + `proxy/data/drabyashree_ledger.db`)

---

## 1. Executive Verification Summary

| Verification Suite | Outcome | Observed Coverage & Result |
| :--- | :--- | :--- |
| **Playwright Full E2E Crawler (`tests/audit/*.spec.ts`)** | **17 / 17 Passed (`0` UI failures)** | Audited `flowchart-v3`, `Market Dashboard`, `Portfolio & Bulk IPO`, `Predictor Hub` (7 sub-tabs), `Guru AI` (5 sub-tabs), **all 128 services across 8 categories**, and **all 13 stock modal tabs across `AKJCL`, `NABIL`, `CHCL`, and `CBBL`** (`audit-reports/ui-failures.json` = `[]`, runtime `4.3m`). |
| **Backend & SQLite Parity (`npx tsx scripts/audit-pipeline.ts`)** | **62 / 62 Endpoints + 8 / 8 Integrity Checks** | `0` duplicate keys/OHLCV/price/kitta/broker sign violations; exact rollup parity on latest unquarantined full-tape session `2026-11-24`; `1` expected off-market warning (`/api/ledger/live-today` session `2026-11-26`, `stocks: 0`); `3` holiday calendar continuity notes (`violations=3`). |
| **Semantic Invariant Audit (`npm run audit:semantic`)** | **232,855 / 232,855 + 15 / 15 Passed** | `0` static pattern violations across `309` files (`src/` & `proxy/`); `15/15` dynamic mathematical & semantic invariants passed (`audit-reports/semantic-invariants-report.json`). |
| **Static Sentinel Audit (`npm run audit:static`)** | **212 / 212 Clean** | `0` syntax errors, `0` missing import files, `0` undeclared identifier occurrences. |
| **Cross-Module & Root Hub Verification** | **Passed (`0` Failures)** | `tests/audit5RootHubsVerification.test.mjs` (`6/6`), `tests/audit13TabsVerification.test.mjs` (`14/14`), and `tests/auditCrossModuleConsistency.test.mjs` (`20/20`) all exited `0`. |
| **Phase 5 TDD Suite (`tests/phase5DashboardStockAndServices.test.mjs`)** | **7 / 7 Passed** | Verified `[P5-01]` through `[P5-07]` (including `brokerVault`, `dailyFloorsheetCollector`, and `historicalSubfilesEngine` guards). |
| **Broker Floorsheet & Batch 2 Suites** | **Passed (`0` Failures)** | `tests/adBrokerFloorsheetAudit.test.mjs` (`17/17`, incl. Test 17 contract parity) and `tests/aqBatch2DataParityAndMicrostructure.test.mjs` (`20/20`, incl. `[BUG-005 & BUG-032]`). |
| **Production Build (`npm run build`)** | **Passed (`16.36s`)** | Clean Vite + TypeScript production build (`dist/`, `1789` modules transformed), with browser-safe dynamic cumulative broker ledger loading and zero duplicate 10 MB `.json` raw asset emission. |
| **Full Node Unit Matrix (`npm run test`)** | **78 / 80 in Sandbox; 2 / 2 Passed Outside Sandbox (`80 / 80` Verified)** | `78` suites passed inside the sandbox (`phase1`–`phase5`, `adBrokerFloorsheetAudit` `17/17`, `aqBatch2DataParityAndMicrostructure` `20/20`, `arBatch3`, `asBatch4`, `lBatchShareHubParity`). The remaining `2` sandbox-blocked suites (`replayHarness.mjs` `35/35`, `ajBatchCdscTlsVerification.test.mjs` `5/5`) both passed outside the sandbox (details in Section 3). |

---

## 2. Root Causes Diagnosed & Fixed in This Pass

1. **Zero-Broker Masked Matrix Contamination & Auto-Archiver Freeze (`proxy/server.mjs`, `proxy/data/*`, `src/data/*`, `scripts/audit-pipeline.ts`)**
   - Restored unmasked `2026-11-24` broker matrices (`91` brokers, `50,669` trades) in `proxy/data/broker_matrix_latest.json`, `src/data/broker_matrix_latest.json`, and `src/data/broker_matrices_historical.json`.
   - Guarded `runPostMarketFloorsheetCollector` (`proxy/server.mjs`) with `_archiverInFlight`, 15-minute cooldown `_archiverAttemptCooldown`, and `archivedCount >= 1000 && aggData.matrix.length > 0` before compiling subfiles or overwriting broker matrices. Configured `server.keepAliveTimeout = 65000` and `server.headersTimeout = 66000`.
   - Updated `scripts/audit-pipeline.ts` integrity checks 2.7 & 2.8 to reconcile floorsheet completeness/volume rollup against the latest unquarantined full-tape session (`2026-11-24`) while noting newer OHLCV-only `TODAY_PRICES` sessions (`2026-11-25`).

2. **Express Synchronous Event-Loop Freezes (`proxy/utils/historicalSubfilesEngine.mjs`, `proxy/brokerVault.mjs`, `proxy/utils/dailyFloorsheetCollector.mjs`)**
   - Fixed `readHistoricalSubfile()` and `readHistoricalSubfilesIndex()` (`historicalSubfilesEngine.mjs`) so missing/uncompiled dates (`2026-11-25`) when the index already exists return `null` in `< 1ms` instead of synchronously running `compileHistoricalSubfiles()` (`~10.5s` event-loop block).
   - Fixed string `"0"` truthiness bypasses in `proxy/brokerVault.mjs` (`getFullSessionFloorsheet` & fallback paths) using `hasValidUnmaskedBrokers()` (`parseInt(...) > 0 && rows.length >= 1000`), preventing repeated `ingestDailyFloorsheetTransaction()` + `rebuildHotCache()` (`~2.4s`) + 1.3M-row SQLite audit scans on masked `floorsheet-2026-11-25.json`.
   - Added 5-minute failure cooldown `getShareSansarSession._cooldownUntil` in `proxy/brokerVault.mjs` and masked-batch persistence rejection in `proxy/utils/dailyFloorsheetCollector.mjs`.

3. **Bikram Sambat Date Parsing TypeError in `Master100ProfitWorkstation` (`src/utils/bikramSambat.js`, `src/utils/masterProfitEngine.ts`)**
   - Fixed `bsToAd` signature mismatch where a single template string caused `yIdx = NaN` and `YEAR_DAYS_MAP[NaN].passed` TypeError; updated `masterProfitEngine.ts` to pass numeric `(bsYear, bsMonth, bsDay)` and hardened `bsToAd` / `getDaysInBsMonth` against string, non-integer, and out-of-range inputs.

4. **Strict MIME Error on Dynamic JSON Import (`src/utils/historyCache.js`)**
   - Removed `{ with: { type: 'json' } }` from browser dynamic `import('../data/nepse_cumulative_broker_ledger.json')` in `ensureCumulativeBrokerLoaded()` while using `globalThis.process?.getBuiltinModule` (`fs/promises`, `path`, `url`) for Node CLI/test execution — compatible with Vite/Chromium, Node 24, and `esbuild` browser test bundles.

5. **Market Index `NaN` & Cold-Boot `NEPSE Index 0` Race (`src/utils/liveData.js`, `src/components/services.tsx`, `src/App.jsx`, `src/components/Dashboard.jsx`)**
   - Updated `tryFastBackend()` in `liveData.js` to prioritize complete `/api/market-indices` & `/api/indices` payloads over partial `/api/market/summary`, and filtered null/non-positive index rows in `fetchIndices()` and `MarketSummaryService` (`services.tsx`), rendering `'—'` instead of `'NaN'` / `'0'`.
   - Guarded `coldBootSettled` & `<DashboardSkeleton />` (`App.jsx`) until both `stocks` and `indices.nepse.value > 1000` hydrate (or initial boot settles), and guarded `NEPSE Index` hero display (`Dashboard.jsx`) against `0`.

6. **HTTP/1.1 Connection-Pool Starvation & Zero-LTP Operator Targets (`src/components/Dashboard.jsx`, `src/components/services.tsx`, `src/components/StockDetailModal.jsx`, `tests/audit/audit-helpers.ts`)**
   - Added shared `mapWithConcurrency()` (`liveData.js`), staggered and throttled `Dashboard.jsx` background warming (`2` at a time, capped to `10` candidates) and prime-pick candidate evaluation (`BATCH_SIZE = 1`), and throttled `services.tsx` timeframe pre-warming loops.
   - Guarded Institutional Operator Radar (`StockDetailModal.jsx`) when `ltp <= 0` so it never displays synthetic `Rs. 100`-derived targets, and stripped UTF-8 BOM when appending `audit-reports/ui-failures.json` in `tests/audit/audit-helpers.ts`.

7. **Broker Vault `latestDate` Preservation & Quarantine Parity (`proxy/brokerVault.mjs`, `tests/adBrokerFloorsheetAudit.test.mjs`)**
   - Updated `persistVaultObj()` inside `loadAndSyncSymbolVault()` (`proxy/brokerVault.mjs`) to preserve and update `latestDate` (`populatedDates[0] || obj.latestDate || null`) across `proxy/data/broker_vault/<SYM>.json`, filtered `getMarketWideBrokerSummaryMap()` queries with `COALESCE(is_quarantined, 0) = 0`, and re-synced `130` vault files (`latestDate: "2026-11-24"` preserved across live Playwright requests).
   - Updated `tests/adBrokerFloorsheetAudit.test.mjs` Test 17 to filter `COALESCE(is_quarantined, 0) = 0` (and `buyer_broker > 0 AND seller_broker > 0` for `distinctDates`), resolving the false variance failure from the `193` quarantined `2026-11-25` contracts.

---

## 3. Sandbox-Blocked Suites & Environment Checks (`2 / 80` Verified Outside Sandbox)

- `tests/replayHarness.mjs`: Failed inside the sandbox with Axios `HTTP 403` (`Port 54037 not allowed for HTTP`); **passed `35 / 35` assertions** across all 9 session scenarios when executed outside the sandbox (`BypassSandbox: true`).
- `tests/ajBatchCdscTlsVerification.test.mjs`: Failed Test 1 (`2 passed, 3 failed`) inside the offline sandbox reaching `webbackend.cdsc.com.np`; **passed `5 / 5` assertions** (TLS connection, trusted CA/wildcard `*.cdsc.com.np`, and scoped agent isolation) when executed outside the sandbox (`BypassSandbox: true`).
- Local CodeRabbit CLI pre-commit audit: Sandboxed `PATH` lookup for `coderabbit` / `cr` did not find an executable (`CODERABBIT_CLI_NOT_FOUND`), so CodeRabbit CLI availability on this host is unknown from `PATH` alone and no CodeRabbit CLI review could be executed automatically.
