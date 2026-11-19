# Batch 4 — Fabricated Fundamentals, Reports, News, Macro, Telegram & Backend Fallbacks

- **Timestamp:** `2026-11-19T09:00:00Z`
- **Bug Scope (`12` P0/P1 Bugs):** `BUG-023`, `BUG-024`, `BUG-031`, `BUG-075`, `BUG-076`, `BUG-077`, `BUG-094`, `BUG-137`, `BUG-140`, `BUG-166`, `BUG-167`, `BUG-172`
- **Protected Boundaries (DO NOT TOUCH):** `proxy/stockSelectionGuideEngine.mjs`, `proxy/db.mjs`, `tests/testDailyStockSelectionGuide.test.mjs`, and selection-guide wiring in `proxy/server.mjs`, `proxy/telegramNotifier.mjs`, `proxy/workers.mjs`.

## Requirements & Acceptance Criteria

1. **`BUG-023` — Canonical Equity Filter Enforcement:**
   - Unify `isTradableOrdinaryEquity` / `isPureNepseEquity` in `src/utils/nepseEquityFilter.js` (excluding Mutual Funds, Debentures, Bonds, Promoter & Preference shares including `*P`/`*PO`/`*PR`/`Rinpatra`/`Perpetual`/`Investment Fund`/`Yojana`, while preserving ordinary equities `CITY`, `HATHY`, `NMBMF`, `SWMF`, `SANIMA`, `SHIVM`, `NADEP`).
   - Enforce `isPureNepseEquity` across `accumulationDistributionEngine.ts` (`isDisqualifiedNonEquityOrBond`), `masterProfitEngine.ts` (`evaluateMasterStock`, `evaluateMaster100Universe`, and float gate without fake `55%`/`10M` pass), `masterAlphaPipeline.js`, `guruEngine.js` (main loop + nullable `eps`), `quantEngine.js` (`runAmalgamatedBreakoutPipeline` excluding debentures/MFs and `eps === null || eps <= 0`), `ServicesHub.tsx` (`pe-ranking`), and `services.tsx` (`UniversalScreener` unless `includeNonEquities`, and `TopPerformersService`).

2. **`BUG-024` — Eliminate Fabricated NRB, Fundamental, Ownership & Broker Defaults:**
   - `quantEngine.js`: `evaluateNrbRegulatorySafety` preserves `null` when `npl`/`car`/`cdRatio`/`roe` absent (`passSafetyGate: false`, `isVerified: false`, `'Unverified / Data Unavailable'`); `calculateFundamentalScore` preserves nullable metrics and awards no `+5` CAR or bank `PB < 1` NPL bonus on nulls; `calculateTradeLabRankScore` never fabricates `0.45`/`0.20` BCR3 from `pChange`.
   - `fundamentals.js`: `evaluateValuation` & `calculateFundamentalSummary` preserve `null` for `npl`, `car`, `eps`, `roe`, never label `eps === null` as loss-making or deduct `-8` ROE when `roe === null`, and require `npl !== null && npl <= 3` for bank PBV bonus.
   - `fundamentalSignals.js`: `evaluateOwnershipStructure` returns `null` percentages/free-float when both `promoterPercentage` and `publicPercentage` are missing/zero (`isOwnershipVerified: false`); `evaluateFundamentalConfluence` awards `0` ownership points when unverified.
   - `ServicesHub.tsx`: `nrb-safety-shield` rejects `null` solvency/ROE fields; `float-analytics` prints `'—'` instead of `'51.0%'`.
   - `liveData.js` & `proxy/server.mjs`: preserve `null` for missing ownership/share counts instead of coercing to `0` or `1000000000 / 100`.

3. **`BUG-031`, `BUG-075`, `BUG-076`, `BUG-077` — Zero Fabricated Reports, Fundamentals, Right Shares, News & Track Records:**
   - `StockFundamentalsTab.jsx`: Reset state + cancel async requests on `sym` switch; render verified `backendQuarterData.quarters` only, showing honest unavailable notice without fake multi-quarter multipliers, `'85.99 Lkh'`, `'6.45 Cr'`, `'2.15%'` NPL, or scaled `baseEps * (0.85 + idx * 0.08)` peer ratios.
   - `StockRightShareCard.jsx`: Render explicit empty state unless verified right-share fields exist (no `Muktinath Capital Limited`, `1:1`, `11,000,000`, `26 Nov 2023`).
   - `StockReportsAnnouncementsCard.jsx`: Reset + monotonic sequence refs on switch; word-boundary ticker matching; remove hardcoded `2082/2083` reports, `fallbackCompanyNews`, and `staticAnnouncements`.
   - `AlgorithmicSignalTrackRecord.tsx`: Remove `DEFAULT_AUDITED_FALLBACK_SIGNALS` swap; surface empty unavailable state cleanly.
   - `StockDetailModal.jsx`: Replace hardcoded `'74.5%'`–`'38.4%'` win-rate lookup table with verified tier label / backend telemetry status.

4. **`BUG-094`, `BUG-137`, `BUG-140` — Macro, Regulatory Hub & News Halt Safeguard:**
   - `PredictorHub.jsx`: Remove static `CATALYST_MAP` and `2026-11-08` macro/news defaults; compute macro badges dynamically from numeric values (`Unavailable` when absent).
   - `RegulatoryHub.tsx`: Accept unwrapped `res.monetaryPolicy` & `res.fineGold24k` payloads, replace `'5.14%'`/`'5.75%'`/`'2.75%'`/`'4.00%'`/`'168,500'`/`'2,015'` fallbacks with `'—'`/`'Unavailable'`, and link `item.url || item.href`.
   - `merolaganiNewsService.js`: Return `[]` on fetch error (so `detectMarketHaltFromNews` preserves active halts); fix Nepali ticker mappings (`GFCL`, `RLFL`, `RHPL`, `UAIL`); whitelist regex symbols against `stockmap.json` so acronyms like `NEPSE`/`NRB` never match as stocks.

5. **`BUG-166`, `BUG-167`, `BUG-172` — Backend Route Honesty, Proxy Alert Engines & AI Views:**
   - `proxy/server.mjs`: Remove fake `isMockData: false` / `'nepse-live'` / static index & commodity/forex/fund/fundamental/technical-indicator fallbacks across `/api/scanner/bulk`, `/api/predictor/:symbol`, `/api/macro/ibor`, `/api/mutual-funds`, `/api/market/summary`, `/api/forex/rates`, `/api/commodities/bullion`, `generateLocalGuruResponse`, `/api/ai/predict`, `/api/guru/analyze`, `/api/guru/market-outlook`, `/api/scanner/technical-ratings`, and `/api/company/:symbol/industry-comparison`.
   - `proxy/workers.mjs`, `proxy/telegramNotifier.mjs`, `proxy/smartAlertEngine.mjs`, `proxy/institutionalAlertEngine.mjs`, `proxy/quant/featureEngine.mjs`: Remove fabricated OBIR (`25k`/`18k`/`+0.16`), fake `2695.60`, optimistic auto-passing BCR3/retention/VDU/ATSR/fundamental defaults, widen lock-in cliff to `-30..180` days, fail closed on trap audit error, and preserve genuine `RSI === 50.0`.
   - `verifySignalTrackRecord.ts`, `AiAnalyst.jsx`, `NepseAgentDashboard.jsx`: Remove `0% -> 63.5%` win-rate override, hardcoded NEPSE index/stocks/LTP defaults, `'Commercial Banks'` fallback, `'20-EMA base'` / `80` / `75` / `1.0x`, and `"Rs. undefined"` scenario strings.

## Verification Gates
- Strict Red-Green TDD via `tests/asBatch4FundamentalsNewsMacroBackend.test.mjs`
- Full suite `node tests/runAll.mjs` (`67/67`) + `node tests/testDailyStockSelectionGuide.test.mjs`
- `node scripts/sentinelStaticAudit.cjs` (`0` errors) + `npm run build` (`vite build`)
- Live Playwright MCP verification against `vite preview` + `git diff` audit.
