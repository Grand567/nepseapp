# DRABYASHREE NEPSE — SCOPE OF UNTESTED VECTORS & OPERATIONAL ROADMAP

**Document Date:** 2026-11-17 (Tuesday, November 17, 2026 NPT)  
**Auditor:** Senior QA Engineer, Data Engineer & Quantitative Analyst  
**Scope:** Complete enumeration of items, environments, or edge conditions that could not be verified in the current post-market localhost session, along with root rationale and exact verification protocols.

---

## 1. Untested Vectors Roster

| Vector ID | Component / Capability | Rationale for Untested State | Prerequisite / What is Needed to Test | Risk Rating |
| :--- | :--- | :--- | :--- | :---: |
| **NT-01** | **Live Intraday Tick Streaming (Real Exchange Hours)** | Current audit executed at 21:30 NPT (Tuesday, Nov 17, 2026), post-market close. Market hours are strictly 11:00–15:00 NPT. Intraday live merging was validated using synthetic session replay (`tests/replayHarness.mjs`), but real-time rate-limited polling against NEPSE/NOTS exchange servers during active trading could not be tested on live exchange sockets. | Scheduled live market audit on Wednesday, November 18, 2026 between 11:00 AM and 3:00 PM NPT using `qa/scripts/recordLiveSession.mjs`. | Medium |
| **NT-02** | **Live C-ASBA IPO Bank Balance Debit (Real Bank Funds)** | Submitting live C-ASBA IPO applications with real bank accounts debits actual money (Rs. 1,000+ per application). Tested thoroughly via `meroShareService.js` unit tests, offline mock responses, and pre-validation schemas (`validateCasbaApplicationPayload`), but live submission of real user funds was deliberately omitted to prevent unauthorized financial debits. | User-supervised live application on an open public issue using a dedicated micro-balance test bank account (e.g., Rs. 1,000 balance). | Low (Safety Mandate) |
| **NT-03** | **Real TMS Broker Order Placement (Real Capital)** | The app contains paper trading and TMS trade-book import parsers. Real-money automated order execution via unofficial broker TMS APIs was not executed to prevent unintended market orders or financial exposure. | Paper trading engine (`src/components/swing/SwingTradeSelectorView.tsx` Sub-view 3) provides complete sandbox tracking. Live trading should remain manual via official broker TMS. | Low (Safety Mandate) |
| **NT-04** | **Exchange-Wide Circuit Breaker Trading Halt (Index-Level 4%/5%/6%)** | While statutory ±15% individual scrip circuit ceilings and floors were validated mathematically (`tests/anBatchStatutoryCircuitRules.test.mjs`), an actual market-wide index halt (4% halt for 20m, 5% halt for 40m, 6% halt for rest of day) occurs rarely and cannot be induced on the real exchange. | Replay harness synthetic injection of a -4% index plunge to verify UI banner and countdown timer responsiveness. | Low |
| **NT-05** | **Physical Android / iOS Device Biometrics & Native Background Wakeup** | Audited via Chromium at 390x844 mobile viewport and Capacitor 8 build inspection. Physical hardware biometric authentication (Fingerprint / FaceID) and Android OS background app-freeze behavior require a physical APK deployment on hardware. | Build release APK via `npx cap build android` and run physical device test suite on an Android 14+ physical handset. | Low |
| **NT-06** | **Cloud Firestore Multi-Device Concurrent Sync Race Condition** | Single-node cloud sync was verified (`[Firebase Sync] Active User (guest_local)`). Concurrent write conflicts from two devices updating the portfolio at the exact same millisecond were simulated with mutex locks, but live multi-device concurrent conflict resolution requires two live authenticated client sessions connected to Firebase Cloud Firestore. | Two physical devices logging into the same Firebase UID and editing transactions simultaneously. | Low |

---

## 2. Mitigation & Safety Verification Completed
Even though the above vectors could not be safely or physically exercised on live capital/exchange sockets today:
1. **Deterministic Fixture Coverage:** All statutory financial formulas, WACC computations, CGT deductions, broker commissions, and SEBON fees were verified against 43/43 independent hand-calculated mathematical proofs (`qa/oracle/oracleFixtures.test.mjs`).
2. **Synthetic Clock Replay:** Time-travel engine verified pre-open (10:30–11:00 NPT), continuous market open (11:00 NPT), mid-session tick ingestion, market close (15:00 NPT), and post-market settlement (`tests/replayHarness.mjs` 35/35 passing).
3. **Ledger Parity:** 50 exchange spot-check vectors across 10 stocks and 5 dates confirmed 100% volume conservation and zero-sum parity.
