# DRABYASHREE NEPSE — PHASE 3 ROOT CAUSES REPORT
**Execution Date:** 2026-11-14T03:15:00Z (Saturday, Nov 14, 2026 NPT)
**Scope:** Forensic Codebase Audit of 13 Data Staleness, Parity, and Timeframe Divergence Vulnerabilities
**Target Codebase:** `src/` (Frontend React) and `proxy/` (Node Express Server & SQLite Ledger)

---

## 1. Executive Summary & Forensic Scorecard

Every symptom reported by the system owner and verified in Phase 1 has been traced to concrete lines of code.

| # | Diagnostic Hypothesis | Verdict | Primary File & Line Citation |
|---|---|---|---|
| **1** | 'Today' / 'latest session' taken from ledger newest date instead of live session | **PRESENT** | [proxy/db/ledgerStore.js#L412-L417](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L412-L417) |
| **2** | UTC instead of Asia/Kathmandu (NPT) | **PRESENT** | [proxy/server.mjs#L8157](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L8157), [L8947](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L8947), [L9863](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L9863) |
| **3** | Live feed not merged into 1D | **PRESENT** | [src/components/StockBrokerAnalysisTab.jsx#L285](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx#L285), [src/utils/historyCache.js#L188-L194](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/historyCache.js#L188-L194) |
| **4** | One dataset, query, or cache reused across timeframes | **PRESENT** | [proxy/server.mjs#L4998-L5001](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L4998-L5001), [StockBrokerAnalysisTab.jsx#L579-L586](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx#L579-L586) |
| **5** | Timeframe parameter ignored by endpoint, SQL query, or hook | **PRESENT** | [proxy/server.mjs#L4965](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L4965), [StockDetailModal.jsx#L1433-L1452](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L1433-L1452) |
| **6** | Windows counted in calendar days instead of trading days | **PRESENT** | [src/utils/paperTrading.js#L112](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/paperTrading.js#L112), [proxy/server.mjs#L8948](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L8948) |
| **7** | Hot cache (1D/3D/5D/15D/30D) built for old session date / not invalidated | **PRESENT** | [proxy/db/ledgerStore.js#L1345-L1356](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L1345-L1356), [proxy/routes/radarRoutes.js#L112](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/radarRoutes.js#L112) |
| **8** | EOD job not running, not scheduled on Mon-Fri week, or missed due to sleep | **PRESENT** | [proxy/workers.mjs#L774-L788](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/workers.mjs#L774-L788), [proxy/utils/kathmanduTime.mjs#L122](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/kathmanduTime.mjs#L122) |
| **9** | React state, memoisation, useEffect deps, or localStorage returning old values | **PRESENT** | [src/components/StockDetailModal.jsx#L1433-L1452](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L1433-L1452), [src/utils/historyCache.js#L451](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/historyCache.js#L451) |
| **10** | No polling/SSE refresh during market hours | **PRESENT** | [src/components/StockBrokerAnalysisTab.jsx](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx) (0 polling hooks), [StockDetailModal.jsx#L1663](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L1663) |
| **11** | Service-worker or HTTP caching serving old responses | **PRESENT** | [proxy/server.mjs#L4945](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L4945), Smart Money endpoints (Missing `Cache-Control`) |
| **12** | Partial intraday data mixed with, or overwritten by, final data | **PRESENT** | [proxy/db/ledgerStore.js#L689-L706](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L689-L706) |
| **13** | Broker Cornering reading a date with no processed rows | **PRESENT** | [proxy/server.mjs#L7060-L7074](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L7060-L7074), [L7093](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L7093) |

---

## 2. Deep-Dive Forensic Findings (File & Line Evidence)

### 1. 'Today' / 'latest session' taken from ledger newest date
- **Status:** **PRESENT**
- **File & Line:** [proxy/db/ledgerStore.js#L412-L417](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L412-L417)
- **Code Evidence:**
  ```javascript
  export function getStoredDates(limit = 40) {
    return db
      .prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary WHERE calendar_status != 'PARTIAL_SESSION' ORDER BY trade_date DESC LIMIT ?`)
      .all(limit)
      .map(r => r.trade_date);
  }
  ```
- **Mechanism:** When market is open (Mon–Fri 11:00–15:00), today's active session is not yet finalized in `daily_stock_summary`. All endpoints calling `getStoredDates()` resolve the *previous* session (e.g. `2026-11-13`) as the latest date, completely unaware of the active live trading day.

---

### 2. UTC instead of Asia/Kathmandu (NPT)
- **Status:** **PRESENT**
- **File & Line:** [proxy/server.mjs#L8157](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L8157), [L8325](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L8325), [L8947](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L8947), [L9863](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L9863), [src/services/whaleDailyArchive.js#L116](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/services/whaleDailyArchive.js#L116)
- **Code Evidence:**
  ```javascript
  const today = new Date().toISOString().split('T')[0];
  ```
- **Mechanism:** On containerized cloud hosts (Render, Docker, Vercel) running in UTC:
  Between 00:00 UTC and 05:45 UTC (5:45 AM to 11:30 AM NPT), `new Date().toISOString().split('T')[0]` produces **yesterday's date**. At 11:15 AM NPT (05:30 UTC), queries looking for today evaluate to yesterday, leading to stale session tags.

---

### 3. Live feed not merged into 1D
- **Status:** **PRESENT**
- **File & Line:** [src/components/StockBrokerAnalysisTab.jsx#L284-L286](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx#L284-L286) & [src/utils/historyCache.js#L188-L194](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/historyCache.js#L188-L194)
- **Code Evidence:**
  ```javascript
  // StockBrokerAnalysisTab.jsx line 284:
  const flow = Array.from(combinedFlowMap.values())
    .filter(f => !isOngoingMarketSession || f?.date !== todayNpt)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  ```
  ```javascript
  // historyCache.js line 188:
  export const BUNDLED_BROKER_DATE = latestBrokerMatrix?.businessDate || '2026-11-02';
  for (const [sym, analysis] of Object.entries(bundledBrokerMap)) {
    memBrokerCache.set(`nepse_real_broker_${symU}_d1_latest__`, analysis);
  }
  ```
- **Mechanism:** Line 285 explicitly filters out `todayNpt` during market hours (`f?.date !== todayNpt`). Furthermore, `historyCache.js` synchronously loads the static bundled matrix (`2026-11-13`) and serves it for 1D, ignoring the active live feed.

---

### 4. One dataset, query, or cache reused across timeframes
- **Status:** **PRESENT**
- **File & Line:** [proxy/server.mjs#L4998-L5001](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L4998-L5001) & [StockBrokerAnalysisTab.jsx#L579-L586](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx#L579-L586)
- **Code Evidence:**
  ```javascript
  // proxy/server.mjs line 4998:
  let fastSnapshot = getFastVaultSnapshot(symbol, days);
  if (!fastSnapshot || (!fastSnapshot.brokers?.length && !fastSnapshot.totalVolume)) {
    fastSnapshot = getFastVaultSnapshot(symbol, 1); // <-- FALLS BACK TO 1-DAY SNAPSHOT FOR 15D/30D!
  }
  ```
  ```javascript
  // StockBrokerAnalysisTab.jsx line 579:
  if (internalBrokerData && (
    (Array.isArray(internalBrokerData.brokers) && internalBrokerData.brokers.length > 0) ||
    (Array.isArray(internalBrokerData.dailyFlow) && internalBrokerData.dailyFlow.length > 0)
  )) {
    return internalBrokerData; // <-- Returns previous timeframe without checking timeframeDays!
  }
  ```
- **Mechanism:** In the backend, if a 15D or 30D snapshot is not found within the timeout ceiling, line 5000 falls back to the 1-day snapshot (`getFastVaultSnapshot(symbol, 1)`). In the frontend, `activeBrokerData` returns `internalBrokerData` without verifying that its timeframe matches the newly selected `effectiveDays`.

---

### 5. Timeframe parameter ignored by endpoint, SQL query, or hook
- **Status:** **PRESENT**
- **File & Line:** [proxy/server.mjs#L4955-L4966](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L4955-L4966) & [StockDetailModal.jsx#L1433-L1452](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L1433-L1452)
- **Code Evidence:**
  ```javascript
  // proxy/server.mjs line 4955:
  const fullHistory = getSymbolHistoryFromDb(symbol, Math.max(days, 40));
  let filteredHistory = fullHistory;
  if (date) {
    filteredHistory = fullHistory.filter(d => (d.date || d.trade_date) <= date).slice(0, days);
  } else if (fromDate && toDate) {
    ...
  } else {
    filteredHistory = fullHistory.slice(0, days);
  }
  ```
- **Mechanism:** In `StockDetailModal.jsx`, `useState` initializers on line 1433 never re-run when `stock` changes, leaving `realBrokerAnalysis` bound to the first stock and timeframe that opened.

---

### 6. Windows counted in calendar days instead of trading days
- **Status:** **PRESENT**
- **File & Line:** [src/utils/paperTrading.js#L112](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/paperTrading.js#L112) & [proxy/server.mjs#L8948](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L8948)
- **Code Evidence:**
  ```javascript
  // src/utils/paperTrading.js:
  settledAtMs: orderTimestamp + (2 * 24 * 60 * 60 * 1000) // T+2 Settlement Lockup
  ```
- **Mechanism:** Adding $2 \times 24\text{ hours}$ (calendar time) unlocks a Thursday trade on Saturday (when NEPSE is closed), instead of Tuesday (skipping Saturday, Sunday, and holidays). Similarly, `/api/history` computes 180 calendar days (`180 * 86400 * 1000`) instead of 180 trading sessions.

---

### 7. Hot cache built for old session date / not invalidated
- **Status:** **PRESENT**
- **File & Line:** [proxy/db/ledgerStore.js#L1345-L1356](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L1345-L1356), [L1526](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L1526), & [proxy/routes/radarRoutes.js#L112](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/radarRoutes.js#L112)
- **Code Evidence:**
  ```javascript
  HOT_CACHE.lastUpdatedDate = dates[0];
  HOT_CACHE.radarByTimeframe = nextRadar;
  HOT_CACHE.stockDiagnostics = nextDiagnostics;
  ```
- **Mechanism:** `HOT_CACHE` is initialized once at proxy boot. During market hours (11:00–15:00), incoming ticks do NOT invalidate `HOT_CACHE`. Endpoints `/api/smart-money/*` and `/api/radar/*` serve yesterday's precomputed hot cache all day long.

---

### 8. EOD job not running, not scheduled on Mon-Fri week, or missed due to sleep
- **Status:** **PRESENT**
- **File & Line:** [proxy/workers.mjs#L774-L788](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/workers.mjs#L774-L788) & [proxy/utils/kathmanduTime.mjs#L122](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/kathmanduTime.mjs#L122)
- **Code Evidence:**
  ```javascript
  // workers.mjs line 782:
  if (kt.isEodWindow) {
    if (lastPostMarketSessionAnalyzed !== sessionDate) {
      runPostMarketCloseAnalysis();
    }
  }
  ```
- **Mechanism:** On hosting environments where instances sleep (e.g. Render Free Tier idling after 15 minutes of inactivity), if the container sleeps at 15:15 NPT and wakes up the next morning at 08:00 AM, `isEodWindow` is `false` (`nptTotalMinutes < 915`). The EOD job for the previous day is permanently skipped because there is no startup catch-up engine.

---

### 9. React state, memoisation, useEffect deps, or localStorage returning old values
- **Status:** **PRESENT**
- **File & Line:** [src/components/StockDetailModal.jsx#L1433-L1452](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L1433-L1452) & [src/utils/historyCache.js#L451](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/historyCache.js#L451)
- **Code Evidence:**
  ```javascript
  // historyCache.js line 451:
  if (!isAll && brokerDataCache.has(rawSym) && numDays === 1 && (!options?.date || options.date === BUNDLED_BROKER_DATE) && !fromKey && !toKey) {
    return brokerDataCache.get(rawSym);
  }
  ```
- **Mechanism:** Initial modal state locks onto the first stock clicked. `memBrokerCache` and `brokerDataCache` synchronously return stale records seeded from Nov 13, without checking whether a live session is currently open.

---

### 10. No polling/SSE refresh during market hours
- **Status:** **PRESENT**
- **File & Line:** [src/components/StockBrokerAnalysisTab.jsx](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx) (0 polling hooks) & [StockDetailModal.jsx#L1663](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L1663)
- **Mechanism:** In [StockBrokerAnalysisTab.jsx](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx), data is fetched once when the tab mounts. No `setInterval`, no polling timer, and no SSE listener exists. The numbers on screen remain static for the entire trading session unless the user manually refreshes the page.

---

### 11. Service-worker or HTTP caching serving old responses
- **Status:** **PRESENT** (HTTP caching; Service Worker absent)
- **File & Line:** [proxy/server.mjs#L4945](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L4945) & Smart Money routes ([proxy/server.mjs#L7057-L7120](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L7057-L7120))
- **Evidence:**
  - `/api/diagnostics/:symbol` sets `Cache-Control: public, max-age=60`, forcing browsers and CDNs to serve a 60-second-old cached snapshot during active live trading.
  - Smart money endpoints (`/api/smart-money/accumulation`, `/api/smart-money/distribution`, `/api/smart-money/cornering`) return `Cache-Control: NONE`, allowing browser and edge proxies to cache arbitrary responses.

---

### 12. Partial intraday data mixed with, or overwritten by, final data
- **Status:** **PRESENT**
- **File & Line:** [proxy/db/ledgerStore.js#L692-L706](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L692-L706)
- **Code Evidence:**
  ```sql
  INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(trade_date, symbol) DO UPDATE SET ...
  ```
- **Mechanism:** `ingestDailyStockPrices` does not tag rows with `calendar_status = 'PARTIAL_SESSION'`. If an intraday snapshot is saved mid-session and the EOD bhavpasal scraper fails, the mid-day partial volume is permanently preserved as the final daily close.

---

### 13. Broker Cornering reading a date with no processed rows
- **Status:** **PRESENT**
- **File & Line:** [proxy/server.mjs#L7060-L7074](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L7060-L7074) & [L7093](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/server.mjs#L7093)
- **Code Evidence:**
  ```sql
  SELECT bl.symbol, bl.broker_id as brokerId,
         SUM(bl.buy_vol) as buyVol,
         SUM(ss.total_volume) as totalVol,
         ROUND(SUM(bl.buy_vol) * 1.0 / NULLIF(SUM(ss.total_volume), 0) * 100, 2) as concentrationPct
  FROM daily_broker_ledger bl
  JOIN daily_stock_summary ss ON ss.symbol = bl.symbol AND ss.trade_date = bl.trade_date
  WHERE bl.trade_date >= ?
  ```
- **Mechanism:** If `daily_broker_ledger` has partial floorsheet entries for today, but `daily_stock_summary` has not yet been populated for today, the strict `INNER JOIN` drops all of today's rows. For `days=1`, the query returns an empty array (`[]`), causing Broker Cornering to render blank or fallback to stale data.
