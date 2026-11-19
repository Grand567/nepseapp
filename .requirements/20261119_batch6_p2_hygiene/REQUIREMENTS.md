# Batch 6: P2 Platform Hygiene, UI Polish, CSS/DOM & Test Isolation Spec

## 1. Overview
Batch 6 addresses the final 15 P2-priority bugs across the Drabyashree NEPSE application, covering platform hygiene, UI polish, edge cases, date normalization, and test execution isolation:
- `BUG-017`: Radar stamps `*Est.` / `⚡ Est.` under "100% Real Records".
- `BUG-018`: `AiGuruQuantitativeCard.tsx` shows zero telemetry (`+0.00% / 0.00%`, `Avg Ticket 0 kitta`) when ledger data is unavailable.
- `BUG-019`: `AccumulationDistributionRadar.tsx` hardcodes 32 sessions banner instead of dynamic session count.
- `BUG-020`: Duplicate broker label `#94 Broker #94` and global spinner `"Scanning all 346 NEPSE listed securities…"` on single-item fetch.
- `BUG-021`: Mobile horizontal table overflow / clipping without responsive scroll cues.
- `BUG-043`: Hardcoded stale literals `346`, `350+`, static dates & stale fallback arrays.
- `BUG-044`: Raw float interpolations (`NaN%`) and unguarded async `useEffect` lifecycle cleanups.
- `BUG-045`: `runAll.mjs` test isolation: test runs mutating `proxy/data/` or `backtest/` working tree files.
- `BUG-071`: `Dashboard.jsx` & `AdvancedChartModal.jsx`: dynamic `colSpan`, `animate-spin`, `.slice` emoji bug, vacuous `[].every()`, resize & timeframe sync.
- `BUG-090`: `StockDetailModal.jsx`: tab overflow/clipping, scroll restoration, and unmounted listener cleanup.
- `BUG-109`: `FestivalSeasonalityCard.tsx` `0 -> 1.0` RVOL coercion; `SmartMoneyBrokerFlowCard.tsx` `netKitta` fallback & flat-day trap bug.
- `BUG-134`: `SeasonalityAnalyticsService.tsx` dynamic months count; `TradingViewChartService.tsx` remove `ltp: 500` fallback & race guard.
- `BUG-150`: `dynamicCapitalEngine.js` deduplicate turnover line in dual-mode execution ticket text; `dynamicCalculationEngine.js` input bounds.
- `BUG-151`: `RegulatoryHub.tsx` Forex div/0 guard & abort; `dividendHistory.js` Right share drop formula & 12mo FY range.
- `BUG-164`: Platform Hygiene: `watchlistAlerts.js` NPT midnight date calculation, `indexedDb.js` sticky null / reset failed `dbPromise`, `Resources.jsx` open links via `openExternalUrl`.

## 2. Target Files
1. `src/components/AccumulationDistributionRadar.tsx`
2. `src/components/AiGuruQuantitativeCard.tsx`
3. `src/services/aiGuru/runAiQuantitativeAssessment.ts`
4. `src/components/ui.tsx`
5. `src/components/services.tsx`
6. `src/components/StockBrokerAnalysisTab.jsx`
7. `src/components/Dashboard.jsx`
8. `src/components/AdvancedChartModal.jsx`
9. `src/components/SessionDateDropdown.jsx`
10. `src/components/PullToRefresh.jsx`
11. `src/components/analyzer/FestivalSeasonalityCard.tsx`
12. `src/components/analyzer/SmartMoneyBrokerFlowCard.tsx`
13. `src/components/SeasonalityAnalyticsService.tsx`
14. `src/components/TradingViewChartService.tsx`
15. `src/utils/dynamicCapitalEngine.js`
16. `src/components/RegulatoryHub.tsx`
17. `src/utils/dividendHistory.js`
18. `src/utils/watchlistAlerts.js`
19. `src/utils/indexedDb.js`
20. `src/components/Resources.jsx`
21. `tests/runAll.mjs`

## 3. Verification Protocol
- Author comprehensive TDD test suite `tests/azBatch6P2Remediation.test.mjs`.
- Execute RED phase (`azBatch6P2Remediation.test.mjs` failing on unedited code).
- Apply surgical edits across all 20 files.
- Execute GREEN phase (`azBatch6P2Remediation.test.mjs` passing 100%).
- Run sentinel static audit (`node scripts/sentinelStaticAudit.cjs` -> 0 errors across 210 files).
- Run production build (`npm run build` -> 0 errors).
- Run full regression suite (`node tests/runAll.mjs` -> 74/74 passed).
- Run CodeRabbit code-reviewer subagent audit.
