# Specification: Multi-Agent Comprehensive Codebase Audit Remediation

**Date:** 2026-11-19  
**Auditors:** 4 Domain Subagents (Security/Auth, Quant/Microstructure, Frontend/Lifecycle, Data/Storage)  
**Execution Gate:** Strict TDD (RED $\to$ GREEN $\to$ Static Sentinel $\to$ Full Regression $\to$ Production Build)

---

## 1. Security, Auth, Vault & Proxy Hardening
- **SEC-01 (TestSuite Test Profile Storage Leak):**  
  In `src/components/TestSuite.jsx:125`, `localStorage.removeItem('nepse_meroshare_profiles_enc_test_user')` cleans up the wrong key. Update cleanup to delete `nepse_hub_test_user_profiles` (the actual key written by `saveEncryptedUserProfiles(..., 'test_user')`) and clean up all test vault entries.
- **SEC-02 (Unauthenticated Admin Route Protection):**  
  In `proxy/routes/radarRoutes.js:1106`, `router.get("/admin/backfill-status", handleBackfillStatus)` is exposed without middleware. Attach `requireAdminSecret`.
- **SEC-03 (Sensitive Route Private No-Store Enforcement):**  
  Enforce `Cache-Control: private, no-store, no-cache, must-revalidate` and `Pragma: no-cache` across MeroShare and personal portfolio proxy routes (`proxy/meroshare.js`, `proxy/syncRouter.mjs`, `proxy/server.mjs` reverse proxy and tracked-holdings).
- **SEC-04 (Promoter Suffix Separator Normalization):**  
  In `src/services/meroShareWaccService.js:18`, `clean.replace(/[^A-Z0-9_]/g, '')` strips hyphens and spaces so `GBIME-PO` or `GBIME PO` turns into `GBIMEPO`, breaking lookup against `GBIME_PO`. Normalize hyphens/spaces to underscore (`clean.replace(/[-\s]+/g, '_').replace(/[^A-Z0-9_]/g, '')`).
- **SEC-05 (Portfolio Fallback Contract Harmonization):**  
  In `src/services/meroShareService.js:705-720`, if auth succeeds but portfolio fetch fails, ensure the returned payload includes `cachedFallback: Boolean(account.holdings?.length)` and `isLive: false`.

---

## 2. Quantitative Mechanics & Statutory Limits
- **QUANT-01 (Calendar Alignment in Stock Information Hub Modal):**  
  In `src/components/StockInformationHubModal.tsx:480-487`, remove the inline `isMarketOpen` with the legacy `day === 5 || day === 6` check. Import and use `isMarketOpen` from `@/utils/nepseCalendar` to observe Friday trading and Sunday closure.
- **QUANT-02 (Graham Intrinsic Value Loss-Maker Guard):**  
  In `src/utils/quantEngine.js:124-142`, when `eps <= 0`, return `grahamNumber: null`, `isUndervalued: false`, `marginOfSafetyPct: 0` instead of calculating a tangible book floor as an undervalued Graham number.
- **QUANT-03 (Inverted Stop-Loss Guard in RRR Engine):**  
  In `src/utils/quantEngine.js:1312-1320`, if `stopLossPrice >= entryPrice`, return `{ isViable: false, rrr: 0, verdict: 'Inverted Stop Loss' }` rather than clamping risk to 0.1 and reporting an inflated 150:1 RRR.
- **QUANT-04 (Promoter Lock-In Supply Cliff 120-Day Alignment):**  
  Align promoter lock-in supply cliff across all modules to the statutory 120-day rule: `src/utils/dynamicCalculationEngine.js:340`, `src/utils/quantEngine.js:2970`, `src/utils/swingGateEvaluator.js:308`, and `src/components/AlphaPlaybookService.tsx:547`.
- **QUANT-05 (Order Execution Preview CGT & Label Correction):**  
  In `src/views/OrderExecution.jsx`, include Capital Gains Tax deduction in sell calculations and change the output summary label from "Total Payable:" to "Net Receivable:".
- **QUANT-06 (Paper Trading T+2 Settlement Calendar):**  
  In `src/utils/paperTrading.js:112`, enforce trading-session days rather than 48 real-time calendar hours for T+2 Demat clearance.
- **QUANT-07 (Circuit Near Threshold Alignment):**  
  In `src/components/services.tsx:1891, 1939`, update circuit near threshold to `pCh >= 12.5%` for the ±15% band.

---

## 3. Frontend UI, React Lifecycle, Charts & Stitch Views
- **UI-01 (Android APK Relative Fetch Fix in AI Guru Card):**  
  In `src/components/AiGuruQuantitativeCard.tsx:61`, prefix bare `fetch("/api/ai-guru/assess")` with `${getProxyBase()}` to prevent connection failures on Capacitor Android APK.
- **UI-02 (Watchlist Screener Sector Matching for 'Mfg'):**  
  In `src/views/WatchlistScreener.jsx:145, 206`, handle sector abbreviations so `'Mfg'` matches `"Manufacturing and Processing"`.
- **UI-03 (Fullscreen Cleanup on Advanced Chart Modal Unmount):**  
  In `src/components/AdvancedChartModal.jsx:55-63`, ensure `document.exitFullscreen()` is safely invoked on unmount if fullscreen was engaged.
- **UI-04 (Ticker Switching Cross-Contamination in AI Guru Card):**  
  In `src/components/AiGuruQuantitativeCard.tsx`, immediately reset `assessment` to `null` and clear markdown when switching symbols so the previous stock's scores and headers do not linger.
- **UI-05 (Ticker Switching Cross-Contamination in StockBrokerAnalysisTab):**  
  In `src/components/StockBrokerAnalysisTab.jsx:524-529, 620-629`, verify `brokerData.symbol === symbol` before adopting parent props.
- **UI-06 (MeroShare Fallback CSV Import WACC Distortion):**  
  In `src/components/Portfolio.jsx:751-773`, call `parseMeroShareCsv(textToParse)` first before naive token index splitting so Free Balance is never mistaken for purchase rate.
- **UI-07 (Broker Display Deduplication):**  
  In `src/components/StockBrokerAnalysisTab.jsx:2653, 2699, 3355`, wrap raw `#{b.id} {b.name}` renders with `formatBrokerDisplay(b.id, b.name)`.
- **UI-08 (Surrogate Pair Emoji Splitting in PredictorHub):**  
  In `src/components/PredictorHub.jsx:2558-2560`, replace naive `.slice(0, 2)` with `Array.from(badgeStr)` code point splitting.
- **UI-09 (Unguarded .toFixed Formatting):**  
  Guard `.toFixed(2)` in `LiveMarketDashboard.jsx:367`, `Dashboard.jsx:362`, and `WatchlistScreener.jsx:110, 262`.

---

## 4. Data Layer, Storage & Scraping Invariants
- **DATA-01 (Ticker Alias Disambiguation in News Scorer):**  
  In `src/utils/newsImpactScorer.js:142`, remove `'gblbs'` from `GBBL` aliases and add dedicated entity `{ id: 'GBLBS', aliases: ['ग्रामीण विकास', 'gblbs'] }`.
- **DATA-02 (Equity Ingestion Leak in Floorsheet Ledger):**  
  In `proxy/db/ledgerStore.js:440`, add `PROTECTED_ORDINARY_EQUITIES` (`NMBMF`, `SWMF`, `CITY`, `HATHY`, `SANIMA`, `SHIVM`, `NADEP`) to `isNonEquityScrip` so they are not dropped from floorsheet ingestion.
- **DATA-03 (Bikram Sambat Year Threshold):**  
  In `src/utils/servicesApi.js:296, 318`, update `year > 2060` check to `year >= 2050`.
- **DATA-04 (Fallback Broker Contact Scrubbing):**  
  In `src/components/services.tsx:4548, 4558`, replace fake contact numbers with `'—'`.
- **DATA-05 (Broker #77 Legal Name):**  
  In `proxy/server.mjs:7529`, output `"Nabil Stock Dealer Ltd."` (public limited company).
- **DATA-06 (IndexedDB Connection Resiliency):**  
  In `src/utils/indexedDb.js`, add `db.onclose` handler resetting `dbPromise = null;` and store `{ value, expiresAt }` in `localStorage` fallback.
