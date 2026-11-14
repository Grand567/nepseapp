# DRABYASHREE NEPSE — VIRTUAL CLOCK TIME-TRAVEL VERIFICATION REPORT (PHASE 3)

**Audit Execution Date:** 2026-11-14 (NPT)  
**Harness:** Universal Dual-Layer Fake Clock (`POST /api/test/fake-clock` & `window.__APP_FAKE_NOW__`)  
**Scope:** Validation of live vs. closed session transitions, Nepal Government Chhath public holiday handling, intraday tick ingestion, and post-market reconciliation.  
**Screenshots:** Stored in `qa/screenshots/phase3/` (dual viewports: 1440x900 Desktop and 390x844 Mobile).

---

## 1. Executive Summary & Transition Matrix

| Moment | Simulated Clock (NPT) | Calendar Category | Expected Session State | Observed Status Label | Reopening Schedule | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Moment 1** | Sat 2026-11-14 12:00 | Saturday Weekend | Closed (Last Session: 2026-11-13) | `Market Closed` (Weekend Closed) | Reopens Tue 2026-11-17 at 10:30 AM | ✅ PASS |
| **Moment 2** | Mon 2026-11-16 10:59 | Public Holiday (Chhath) | Closed (Last Session: 2026-11-13) | `Market Closed` (Holiday: Chhath Parva) | Reopens Tue 2026-11-17 at 10:30 AM | ✅ PASS |
| **Moment 3** | Tue 2026-11-17 10:59 | Pre-Open Matching | Pre-Open Freeze (Last: 2026-11-13) | `Pre-Open` (Freeze 10:45–11:00 AM) | Continuous opens at 11:00 AM | ✅ PASS |
| **Moment 4** | Tue 2026-11-17 11:00 | Session Open | Continuous Live Trading (Today: 2026-11-17) | `Market Open` (Live Trading) | Active until 15:00 NPT | ✅ PASS |
| **Moment 5** | Tue 2026-11-17 12:00 | Mid-Session Trading | Live Stream & Broker Inflow Active | `Market Open` (Live Stream Active) | Active until 15:00 NPT | ✅ PASS |
| **Moment 6** | Tue 2026-11-17 15:00 | Session Close | Post-Market (Last Session: 2026-11-17) | `Market Closed` (Post-Market Closed) | EOD Reconciliation complete | ✅ PASS |
| **Moment 7** | Wed 2026-11-18 10:59 | Next Morning Pre-Open | Pre-Open (Last Session: 2026-11-17) | `Pre-Open` (Pre-Open Match) | Continuous opens at 11:00 AM | ✅ PASS |

---

## 2. Forensic Moment-by-Moment Verification

### Moment 1: Saturday 2026-11-14 12:00 NPT (Closed Weekend)
- **Simulated Timestamp:** `2026-11-14T12:00:00+05:45` (२८ कार्तिक २०८३, शनिबार)
- **Market Status Assertion:** `isOpen: false`, `isWeekend: true`, `statusLabel: "Weekend Closed"`
- **Message Dispatched:** `"Market Closed — Saturday Weekend (२८ कार्तिक) • Reopens Tuesday, 2026-11-17 at 10:30 AM"`
- **Session Reference:** Correctly points to `2026-11-13` as the last completed session.
- **Screenshots:**
  - [Desktop 1440x900](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment1_sat_closed_1440.png)
  - [Mobile 390x844](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment1_sat_closed_390.png)
  - [Stock Detail Modal (RFPL)](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment1_sat_closed_RFPL_1440.png)

---

### Moment 2: Monday 2026-11-16 10:59 NPT (Closed Public Holiday — Chhath Parva)
- **Simulated Timestamp:** `2026-11-16T10:59:00+05:45` (३० कार्तिक २०८३, सोमबार)
- **Market Status Assertion:** `isOpen: false`, `isHoliday: true`, `statusLabel: "Holiday: Chhath Parva (Morning Arghya / Kartik 30)"`
- **Reopening Schedule:** `"Chhath Parva (Morning Arghya / Kartik 30) • Reopens Tuesday, 2026-11-17 at 10:30 AM"`
- **Session Reference:** Remains strictly `2026-11-13` as the last completed session. Monday is completely protected from accidental live trade execution or false open states.
- **Screenshots:**
  - [Desktop 1440x900](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment2_mon_chhath_1440.png)
  - [Mobile 390x844](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment2_mon_chhath_390.png)
  - [Stock Detail Modal (RFPL)](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment2_mon_chhath_RFPL_1440.png)

---

### Moment 3: Tuesday 2026-11-17 10:59 NPT (Pre-Open on Next Trading Day)
- **Simulated Timestamp:** `2026-11-17T10:59:00+05:45` (१ मंसिर २०८३, मंगलबार)
- **Market Status Assertion:** `isOpen: false`, `session: "PRE_OPEN_MATCH"`, `statusLabel: "Pre-Open Match"`
- **Message Dispatched:** `"Pre-Open Matching Freeze (10:45–11:00 AM) — Continuous opens at 11:00 AM"`
- **Session Reference:** Displays `Market Closed • Showing 2026-11-13` until continuous trading officially triggers at 11:00 AM.
- **Screenshots:**
  - [Desktop 1440x900](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment3_tue_preopen_1440.png)
  - [Mobile 390x844](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment3_tue_preopen_390.png)
  - [Stock Detail Modal (RFPL)](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment3_tue_preopen_RFPL_1440.png)

---

### Moment 4: Tuesday 2026-11-17 11:00 NPT (Market Opens)
- **Simulated Timestamp:** `2026-11-17T11:00:00+05:45` (१ मंसिर २०८३, मंगलबार)
- **Market Status Assertion:** `isOpen: true`, `session: "CONTINUOUS"`, `statusLabel: "Market Open"`
- **Message Dispatched:** `"Market is OPEN (Live Trading) — १ मंसिर"`
- **Session Reference:** Live 1D view transitions cleanly to today's active trading session (`2026-11-17`). The 5D rolling window dynamically overlays today's live workspace on top of the preceding 4 verified historical trading days (`2026-11-04`, `2026-11-05`, `2026-11-06`, `2026-11-13`).
- **Screenshots:**
  - [Desktop 1440x900](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment4_tue_open_1440.png)
  - [Mobile 390x844](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment4_tue_open_390.png)
  - [Stock Detail Modal (RFPL)](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment4_tue_open_RFPL_1440.png)

---

### Moment 5: Tuesday 2026-11-17 12:00 NPT (Continuous Live Trading & Tick Ingestion)
- **Simulated Timestamp:** `2026-11-17T12:00:00+05:45`
- **Simulated Feed Action:** Injected 17 simulated live trade contracts via `POST /api/today/tick` across all 10 target equities:
  - `NABIL`: 5,000 shares accumulated by Broker #65 across Rs. 552–555
  - `RFPL`: 7,000 shares accumulated by Brokers #49 & #58 across Rs. 376–379
  - `SHIVM`: 13,000 shares accumulated by Broker #81 across Rs. 680–685
  - `HRL`: 15,000 shares accumulated by Brokers #35 & #51 across Rs. 498–502
- **Reactive UI Verification:** The live tick stream and broker accumulation calculations updated without full page reloads, showing real-time price updates and live VWAP calculations.
- **Screenshots:**
  - [Desktop 1440x900](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment5_tue_live_trading_1440.png)
  - [Mobile 390x844](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment5_tue_live_trading_390.png)
  - [Stock Detail Modal (NABIL)](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment5_tue_live_trading_NABIL_1440.png)

---

### Moment 6: Tuesday 2026-11-17 15:00 NPT (Market Close)
- **Simulated Timestamp:** `2026-11-17T15:00:00+05:45`
- **Market Status Assertion:** `isOpen: false`, `session: "POST_MARKET"`, `statusLabel: "Market Closed"`
- **Session Transition:** The session closes gracefully. Tuesday `2026-11-17` becomes the newly completed 'last session', and static analytics are compiled via `compileTodayStaticAnalytics()`.
- **Screenshots:**
  - [Desktop 1440x900](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment6_tue_close_1440.png)
  - [Mobile 390x844](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment6_tue_close_390.png)
  - [Stock Detail Modal (NABIL)](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment6_tue_close_NABIL_1440.png)

---

### Moment 7: Wednesday 2026-11-18 10:59 NPT (Next Morning Pre-Open)
- **Simulated Timestamp:** `2026-11-18T10:59:00+05:45` (२ मंसिर २०८३, बुधबार)
- **Market Status Assertion:** `isOpen: false`, `session: "PRE_OPEN_MATCH"`, `statusLabel: "Pre-Open Match"`
- **Session Reference:** Accurately displays `2026-11-17` as the last completed trading session. 5D rolling window includes `2026-11-05`, `2026-11-06`, `2026-11-13`, `2026-11-17`.
- **Screenshots:**
  - [Desktop 1440x900](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment7_wed_preopen_1440.png)
  - [Mobile 390x844](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment7_wed_preopen_390.png)
  - [Stock Detail Modal (NABIL)](file:///C:/Users/Hp/Desktop/Software/nepse%20app/qa/screenshots/phase3/moment7_wed_preopen_NABIL_1440.png)

---

## 3. Phase 3 Audit Verdict: 100% PASS
All 7 key time-travel moments executed with 100% precision. The platform correctly handles:
1. Weekend and government public holiday (Chhath) schedule overrides.
2. Next valid trading day resolution to Tuesday, November 17, 2026.
3. Pre-open freezing and live market transition at 11:00 AM NPT.
4. Intraday tick ingestion without full page reloads.
5. Post-market session closing and automated rotation into the historical 5D ledger.
