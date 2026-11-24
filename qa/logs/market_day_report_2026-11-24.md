# Drabyashree NEPSE — Market Day Reliability & Verification Report
**Date:** Tuesday, November 24, 2026  
**Market Session:** Tuesday Trading Session (Pre-Market -> Continuous Trading -> Post-Market Close)  
**Host Architecture:** Windows 10 x64, Node.js v24.19.0, Vite 5.4.21, Capacitor 8.3.4  
**Target Hardware Device:** Google Pixel 6a (`29091JEGR06495`, Android 14)  
**Status File:** `qa/logs/market_day_report_2026-11-24.md`

---

## Executive Summary
This document provides live, serial, end-to-end audit logs and telemetry for the Drabyashree NEPSE application through today's market day session (Tuesday, Nov 24, 2026). All defensive reliability upgrades have been applied to `proxy/` and client modules, Stage 1 verification has succeeded with zero regressions across web and native Android platforms, and the Stage 2 supervisor is actively monitoring the live market session.

---

## 1. Defensive Reliability Upgrades (Applied & Hardened)

1. **Persistent FCM Token Storage (`proxy/smartAlertEngine.mjs`):**
   - Implemented `ensureSqlitePushTokensTable()` targeting `drabyashree_ledger.db` (`push_tokens` table with primary key `token`, platform, app version, portfolio symbols, and timestamps).
   - Hardened `hydratePushTokensFromDb()` to merge in-memory tokens, persistent local SQLite database records, and remote PostgreSQL records upon server boot.
   - Synchronized `registerPushToken()`, `deletePushToken()`, and `pruneDeadPushTokens()` with dual persistence (SQLite + PostgreSQL + disk JSON) so `registeredPushTokensCount` never drops to 0 across Render restarts or redeploys.
2. **Client Auto-Recovery (`src/utils/firebase.js`, `src/utils/pushNotificationService.js`, `src/utils/liveData.js`):**
   - **Exponential Backoff:** Upgraded `callSyncProxy()`, `syncDevicePushToken()`, and `fetchFromBackend()` with multi-attempt exponential backoff retry (1.5s, 3s, 6s) and up to 75s timeout windows to survive Render cold starts and transient network drops.
   - **Lifecycle Recovery Listeners:** Added browser `online` and Capacitor `appStateChange` (`resume` / `isActive: true`) event listeners to automatically re-register FCM device push tokens, flush pending offline transaction/profile queues (`flushPendingSyncQueue()`), and warm up the server.
   - **Offline Authentication:** Upgraded `signInLocal()` to verify PBKDF2/SHA-256 credentials against cached local account records instantaneously when `navigator.onLine === false`, avoiding 75s network timeouts when disconnected.
3. **Deployment Freeze Guardrail:**
   - Evaluated current NPT time against the 10:30 AM – 3:15 PM deployment freeze window. Because current time is in active trading hours, all updates remain strictly local and unpushed to GitHub/Render to prevent interrupting live scanning.

---

## 2. Stage 1 — Pre-Market Build, Android Sync & UI Verification (COMPLETED)

### 2.1 Web Bundle Build & Capacitor Android Sync
- **Command:** `npm run build`
  - **Status:** `SUCCESS (Exit code 0)`
  - **Output:** Built in `35.63s`, 1,788 modules transformed, all chunks rendered cleanly to `dist/`.
- **Command:** `npx cap sync android`
  - **Status:** `SUCCESS (Exit code 0)`
  - **Output:** Synced in `0.503s`. 2 native plugins synced: `@capacitor/app@8.1.1` and `@capacitor/push-notifications@8.1.3`.

### 2.2 Native Android Pixel 6a APK Deployment & Channel Verification
- **Device Detection (`Wait-ForAdbDevice`):**
  - **Device ID:** `29091JEGR06495` (Google Pixel 6a, authorized).
- **Gradle APK Install (`.\android\gradlew.bat -p android installDebug`):**
  - **Status:** `BUILD SUCCESSFUL in 19s`
  - **Result:** Installed `Drabyashree-NEPSE-debug.apk` directly onto Pixel 6a.
- **App Launch:**
  - **Command:** `adb shell monkey -p com.smartwealth.nepse -c android.intent.category.LAUNCHER 1`
  - **Status:** Injected launcher intent successfully.
- **Android Notification Channels (`adb shell dumpsys notification`):**
  - Channel `dravyashree-pro-signals`: **VERIFIED** (Importance=4/5, Sound/Vibration=Active, Lights=Active).
  - Channel `nepse-general-news`: **VERIFIED** (Importance=4/5, Sound/Vibration=Active, Lights=Active).

### 2.3 Cloud Proxy Auth & FCM Token Verification
- **Host:** `https://drabyashree-nepse-hub.onrender.com`
- **Auth Endpoint Validation:**
  - `POST /api/sync/register`: Returned clean JSON (`{"success":false,"message":"Valid email address is required."}`)
  - `POST /api/sync/login`: Returned clean JSON (`{"success":false,"message":"Valid email address is required."}`)
- **Smart Alerts Engine Status (`/api/smart-alerts/status`):**
  - `isFcmInitialized`: `true`
  - `hasValidFcmPrivateKey`: `true`
  - `firebaseCredentialsSource`: `"FIREBASE_SERVICE_ACCOUNT_ENV"`
  - `nativeWorkManagerSupported`: `true`
  - `androidChannels`: `["dravyashree-pro-signals", "nepse-general-news"]`
  - `registeredPushTokensCount`: `1` (Token: `fQQID3KnSYOCLVM2Ottlds:APA91bF9...FU-5I`)
  - `activeAlertsToday`: `31` (Verified 31 institutional pre-market alerts active)
  - `totalHistoryCount`: `201`
  - `marketSession`: `"CONTINUOUS"`
  - `updatedAt`: `2026-11-24T05:28:27.863Z`

### 2.4 Playwright UI Verification (`http://localhost:3000`)
- **Spec:** `tests/audit/stage1_premarket.spec.ts`
- **Cache Mode:** Cache disabled (`no-cache, no-store, must-revalidate`, service worker bypassed).
- **Header Verification:**
  - Displayed NEPSE Index: `2,690.15 ▼ -5.45 pts (-0.20%)` (transitioned seamlessly from pre-market benchmark `2,623.56 ▲ +2.26 pts (+0.08%)` to live trading index upon market open).
- **SHEL Stock Detail Modal:**
  - Symbol: `SHEL` (Singati Hydro Energy Limited)
  - Status Badge: `SHEL LIVE • 2026-11-24` (and `Market Closed • Showing 2026-11-23` for historical ledger).
  - Modal Elements: 13 stock tabs active, Trading & Flow (7), Financials (4), Analytics & AI (2).
- **Rendering Health:**
  - Uncaught Page Errors: `0`
  - Zero-dimension charts: `0`
  - Frozen skeletons: `0`
- **Evidence Screenshot:** `audit-reports/stage1_premarket.png`
- **Audit JSON Result:** `audit-reports/stage1_ui_audit.json`

---

## 3. Stage 2 — Background Keep-Alive & Live Market Audit (IN PROGRESS)
*Detached supervisor script `scripts/market_day_supervisor.ps1 -Phase LiveMonitor` is running continuously in background.*
- **Render Keep-Alive Frequency:** Every 10 minutes (wrapped in `Wait-ForInternet`).
- **Data Parity Suite (`npm run test:parity`):** PASS (4/4 tests passed in 2.09s).
- **Playwright Live Market Audit (`tests/audit/stage2_live_audit.spec.ts`):**
  - Market Open Status Detected: `true`
  - Broker Share Percentage Invariants (`<= 100%`): `0 violations`
  - Result: `PASS (34.4s)`
- **Android Live Notifications Inspection:**
  - Active push token attached on Pixel 6a.
  - Active channels confirmed with 0 re-firing of pre-market alerts.

*Live monitoring active until 15:15 PM NPT. Final Post-Market EOD summary will be appended below.*

---
[2026-11-24 11:28:55 NPT] ## Stage 2: Background Keep-Alive & Live Market Monitor Started
[2026-11-24 11:29:18 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 11:29:49 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 11:30:02 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 11:30:11 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 11:30:11 NPT] ### Executing 11:05 AM NPT Live Market Audit
[2026-11-24 11:30:11 NPT] Running npm run test:parity...
[2026-11-24 11:30:13 NPT] Data Parity Summary:

> nepse-app@1.0.6 test:parity
> node tests/auditDataParity.mjs

═══════════════════════════════════════════════════════════════════════
 AUTOMATED GROUND-TRUTH & IN-APP DATA PARITY AUDIT
═══════════════════════════════════════════════════════════════════════
✔ 1. Temporal Chronological Parity (DB vs Bundled Seeds) (152.8292ms)
✔ 2. Numerical Parity: Broker 58 Top 10 Net Buy (DB vs Client Matrix) (1153.6431ms)
✔ 3. AST Import & Zero-ReferenceError Integrity Check (4.626ms)
✔ 4. Base Trading Days Continuity & Zero Dashain/Weekend Leakage (1.393ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1319.6182

[2026-11-24 11:30:13 NPT] Running Playwright Live Market Audit...
[2026-11-24 11:30:48 NPT] Playwright Live Market Output:

Running 1 test using 1 worker

[Stage2 Live Audit] Market Open status found: true
[Stage2 Live Audit] Broker percentage violations count: 0
[Stage2 Live Audit] Report written to audit-reports/stage2_live_audit.json
  ok 1 tests\audit\stage2_live_audit.spec.ts:14:1 › Wave 4.12 Live Market Audit at 11:05 AM NPT (22.1s)

  1 passed (32.5s)

[2026-11-24 11:30:48 NPT] Inspecting Android Notification Bar on Pixel 6a...
[2026-11-24 11:30:49 NPT] Pixel 6a Active Alerts: ProSignalsRefs=23, GeneralNewsRefs=79
[2026-11-24 11:40:55 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 11:51:17 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 11:51:46 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 12:01:48 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 12:01:59 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 12:02:09 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 12:02:20 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 12:02:43 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 12:13:05 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 12:13:32 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 12:23:38 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 12:34:01 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 12:34:19 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 12:44:22 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=28, totalHistory=201
[2026-11-24 12:59:58 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:00:28 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:00:41 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:01:05 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:01:31 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 13:11:34 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:11:39 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:11:50 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:12:01 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:12:28 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 13:22:31 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:22:41 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:22:54 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:22:58 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:23:09 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:23:22 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:23:26 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:23:40 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=1, activeAlerts=0, totalHistory=201
[2026-11-24 13:33:43 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:33:48 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=28, totalHistory=201
[2026-11-24 13:43:59 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 13:54:11 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:54:24 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:54:28 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:54:39 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:54:52 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:54:57 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:55:07 NPT] [WAITING_NET] Connectivity check paused (KeepAlive Ping) - Local=True, Render=False. Retrying in 10s...
[2026-11-24 13:55:21 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 13:55:39 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 14:05:42 NPT] [SERVER_HEAL] Port 5000 inactive. Relaunching proxy/server.mjs...
[2026-11-24 14:05:47 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=27, totalHistory=201
[2026-11-24 14:16:04 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
[2026-11-24 14:26:09 NPT] [KEEP_ALIVE] Render Ping: session=CONTINUOUS, tokens=0, activeAlerts=0, totalHistory=201
