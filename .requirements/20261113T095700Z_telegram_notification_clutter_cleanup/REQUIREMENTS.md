# Requirements: Telegram Bot Notification Clutter Cleanup & Precision Routing

**Feature Name:** `telegram_notification_clutter_cleanup`  
**Created:** 2026-11-13T09:57:00Z  
**Context:** Based on audit of user-provided recording `screen-20261113-152301-1794562474240.mp4` on 2026-11-13.

---

## 1. As Is (Current State)
1. **Phantom / Test Alert Bombardment:**
   - In `proxy/data/smart_alert_history.json`, stale test entries for `$NABIL` (`status: "ACTIVE"`, entry `Rs. 269.50`, target `Rs. 325`) exist from earlier test runs.
   - `runMarketAlertScanCycle` in `proxy/smartAlertEngine.mjs` checks every item in `alertHistory` regardless of whether `alert.isUserHolding === true`.
   - Because live market price of NABIL is Rs. 549, it triggered repeated Target 1 & Target 2 exit alerts (~10 messages in 4 hours).
2. **Stale Session Date in Morning Alert:**
   - `proxy/telegramNotifier.mjs:2106` has hardcoded `📅 Session: 2026-11-03 | Market Regime: NEPSE 2,695.60 (+31.54)`.
   - `run5StepSwingSelectionAndDispatch` blasts 4 stocks (`RFPL`, `JBBL`, `NIMB`, `HPPL`) with outdated legacy parameters (-5% SL, +7.5% T1) rather than the unified Upgraded Flowchart v2.0 parameters (-3.5% SL, dynamic ratchet, +8% T1, +15% T2).
3. **Duplicate Intraday Ignition Alerts:**
   - Early Ignition alert for Broker #58 accumulation has in-memory cooldown (`B58_STATE_FILE` not persistent across Render container redeployments).
   - This caused `$SGHC` to be alerted 3 times and `$GHL` to be alerted 3 times in a single trading session.
4. **Notification Fatigue & Lack of Precision:**
   - The user received 19 messages in 4 hours, obscuring actionable high-conviction setups.

---

## 2. To Be (Target State)
1. **Strict Holdings-Only Exit Monitoring:**
   - Stop-Loss and Target alerts (`STOP_LOSS_HIT`, `TARGET_REACHED`, `TARGET_2_REACHED`) are strictly evaluated **ONLY** for confirmed user holdings (`alert.isUserHolding === true` or registered in `userTrackedSymbolsSet`).
   - Unheld historical scanner alerts or test entries in `alertHistory` are NEVER checked for live profit/loss exit triggers.
   - Stale/mock alerts are purged from `smart_alert_history.json`.
   - Once an exit condition fires for a held position, its status is updated and saved so it does NOT re-fire in subsequent polling cycles.
2. **Dynamic Session Date & Flowchart v2.0 Morning Pick:**
   - The morning dispatch (`run5StepSwingSelectionAndDispatch` / `selectPlaybookMidStagePick`) dynamically retrieves the verified active trading session date (e.g. `2026-11-13`) and live NEPSE index change.
   - The morning dispatch produces exactly **ONE** single curated top pick passing all Flowchart v2.0 filters (Limit Buy Zone, -3.5% Stop-Loss, Dynamic Breakeven Ratchet, +8% Target 1, +15% Target 2). If no stock passes, it outputs an explicit "Hold Cash" signal.
3. **Persistent Session Lock for Intraday Alerts (Max 1 Ping Per Stock Per Session):**
   - Intraday alerts are locked by calendar date and symbol (e.g. `2026-11-13_SGHC`).
   - Even if the server process or container restarts on Render, the system checks whether the symbol has already been alerted on that trading day. If yes, it is silenced.
   - Total daily budget: Maximum 1 Early Ignition alert per day total across the market.
4. **Clean, High-Signal Telegram Feed:**
   - Total messages per day capped at 2 to 3 high-value notifications.

---

## 3. Functional Requirements
1. **FR-1: Gate Exit Scan by User Holdings:** In `smartAlertEngine.mjs`, the active position evaluation loop must skip any alert where `!alert.isUserHolding && !userTrackedSymbolsSet.has(alert.symbol)`.
2. **FR-2: Dynamic Date in Morning Dispatches:** In `telegramNotifier.mjs`, remove all hardcoded session date strings like `Session: 2026-11-03` and compute the live session date from `getDetailedMarketStatus().targetSessionDate` or the database.
3. **FR-3: Flowchart v2.0 Single Pick Alignment:** Unify the morning swing selection in `run5StepSwingSelectionAndDispatch` to send exactly 1 winner formatted with Flowchart v2.0 parameters.
4. **FR-4: Persistent Intraday Session Deduplication:** In `smartAlertEngine.mjs` and `telegramNotifier.mjs`, create a persistent date-keyed dispatch record (e.g. in `proxy/data/daily_dispatched_alerts.json` or `drabyashree_ledger.db`) that prevents re-alerting the same symbol on the same trading day.
5. **FR-5: History Cleanup:** Clean out invalid mock/test records (like `alert_NABIL_*`) from `proxy/data/smart_alert_history.json`.

---

## 4. Acceptance Criteria
- **AC-1:** Running `runMarketAlertScanCycle` with unheld stock alerts in `alertHistory` produces zero Telegram exit messages.
- **AC-2:** Running `runMarketAlertScanCycle` with a valid user-held stock (`isUserHolding: true`) correctly evaluates and triggers exit alert only when SL or Target thresholds are crossed.
- **AC-3:** `run5StepSwingSelectionAndDispatch` outputs the current trading session date (not `2026-11-03`) and formats a single Flowchart v2.0 pick.
- **AC-4:** Calling `processBroker58AlertTrigger` twice for the same symbol on the same calendar day returns `{ triggered: false, reason: 'Already alerted in session ...' }` and sends zero duplicate messages.
- **AC-5:** Full test suite passes without regressions.

---

## 5. Testing Plan
1. **Unit Test (`tests/auditTelegramClutterGate.test.mjs`):**
   - Test that unheld alerts in `alertHistory` are completely ignored by exit evaluation.
   - Test that user holdings (`isUserHolding: true`) are properly evaluated and once triggered, do not loop-spam.
   - Test session deduplication lock for Broker #58 Early Ignition alerts across mock restarts.
   - Test that morning slate HTML contains dynamic session date and Flowchart v2.0 levels.
2. **Integration Verification:**
   - Execute test with node test runner: `node --test tests/auditTelegramClutterGate.test.mjs`.
   - Run existing suite: `node tests/liveNotificationAndNewsAudit.test.mjs` and `node tests/testBroker58EarlyIgnition.mjs`.

---

## 6. Implementation Plan
1. **Step 1:** Create failing unit test file `tests/auditTelegramClutterGate.test.mjs`.
2. **Step 2:** Update `proxy/smartAlertEngine.mjs`:
   - Add holdings-only filter in `runMarketAlertScanCycle`.
   - Implement persistent session-locked deduplication for intraday alerts.
3. **Step 3:** Update `proxy/telegramNotifier.mjs`:
   - Eliminate hardcoded `2026-11-03` and dynamicize session date.
   - Align morning dispatch to Flowchart v2.0 single-winner format.
4. **Step 4:** Clean `proxy/data/smart_alert_history.json` to purge historical test artifacts.
5. **Step 5:** Run tests, verify green, run CodeRabbit review, commit and push.
