# DRABYASHREE NEPSE — PHASE 1: ONE-MONTH HISTORICAL DATA & DATABASE AUDIT REPORT

**Generated At:** `2026-10-30T23:20:00+05:45` (Nepal Standard Time)  
**Target Workspace:** `C:\Users\Hp\Desktop\Software\nepse app`  
**Database Audited:** `proxy/data/nepse_ledger.sqlite` (~517 MB, `better-sqlite3` WAL mode)  
**Audit Scope:** One-Month Rolling Window (`2026-09-30` to `2026-10-30`, 31 calendar days / 18 active NEPSE trading sessions) + Complete 38-Date Historical Ledger (`2026-08-27` to `2026-10-30`)  
**Audit Mode:** Strictly Read-Only Code, Disk Archive, and SQLite Verification  

---

## 1. EXECUTIVE SUMMARY & AUTHORITATIVE NEPSE TRADING CALENDAR

### 1.1 NEPSE Trading Schedule & Holiday Verification (`2026-09-30` to `2026-10-30`)
Under Nepal Stock Exchange (NEPSE) operating rules implemented in [`src/utils/nepseCalendar.js`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/nepseCalendar.js#L16-L152) and [`proxy/db/ledgerStore.js`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L430-L470):
- **Standard Trading Days:** **Monday through Friday** (`11:00 AM – 03:00 PM NST`).
- **Weekly Exchange Holidays:** **Saturday** (`day === 6`) and **Sunday** (`day === 0`).
- **Public & Festival Exchange Closures in the 1-Month Window (`2026-09-30` to `2026-10-30`):**
  - `2026-10-10` (Saturday): Ghatasthapana (falls on weekly Saturday closure).
  - `2026-10-17` (Saturday): Dashain — Phulpati (falls on weekly Saturday closure).
  - `2026-10-18` (Sunday): Dashain — Phulpati / Maha Ashtami Eve (falls on weekly Sunday closure).
  - `2026-10-19` (Monday): **Dashain — Maha Ashtami** (Exchange Holiday).
  - `2026-10-20` (Tuesday): **Dashain — Maha Navami** (Exchange Holiday).
  - `2026-10-21` (Wednesday): **Dashain — Vijaya Dashami** (Exchange Holiday).
  - `2026-10-22` (Thursday): **Dashain — Ekadashi** (Exchange Holiday).
  - `2026-10-23` (Friday): **Dashain — Dwadashi / Kojagrat Purnima** (Exchange Holiday).

Across the **31 calendar days** from `2026-09-30` to `2026-10-30`:
- **8 calendar days** were weekend closures (Saturdays & Sundays).
- **5 weekday calendar days** (`2026-10-19` through `2026-10-23`) were official Dashain exchange closures.
- **18 calendar days** were active NEPSE trading sessions (`2026-09-30`, `2026-10-01`, `2026-10-02`, `2026-10-05`, `2026-10-06`, `2026-10-07`, `2026-10-08`, `2026-10-09`, `2026-10-12`, `2026-10-13`, `2026-10-14`, `2026-10-15`, `2026-10-16`, `2026-10-26`, `2026-10-27`, `2026-10-28`, `2026-10-29`, `2026-10-30`).

### 1.2 High-Level Completeness Verdict
| Metric | 1-Month Window (`2026-09-30` – `2026-10-30`) | Full Ledger Span (`2026-08-27` – `2026-10-30`) |
|---|---|---|
| **Expected Active Trading Days** | **18** | **38** |
| **Trading Days Present in SQLite (`floorsheet_contracts`)** | **18 / 18 (100%)** | **37 / 38 (97.4%)** (`2026-09-21` MISSING) |
| **Non-Trading Days Falsely Stored in `daily_stock_summary`** | **1** (`2026-10-25` Sunday — 2 synthetic rows) | **2** (`2026-10-25` Sunday + `2026-08-27` Janai Purnima holiday) |
| **Valid Trading Days Quarantined in `daily_stock_summary`** | **1** (`2026-10-16` Friday — all 348 rows `is_quarantined = 1`) | **1** (`2026-10-16` Friday) |
| **Dates Classified `COMPLETE` (Verified Against Official PDF)** | **1** (`2026-10-26`) | **1** (`2026-10-26`) |
| **Dates Classified `COMPLETE` (100% 3-Table Parity & NOTS Count Match)** | **3** (`2026-10-30`, `2026-10-28`, `2026-10-27`) | **3** (`2026-10-30`, `2026-10-28`, `2026-10-27`) |
| **Dates Classified `PARTIAL` (Proven Missing Contracts / Parity Drift)** | **7** (`2026-10-29`, `2026-10-16` [quarantined], `2026-10-14`, `2026-10-13`, `2026-10-12`, `2026-10-08`, `2026-10-01`) | **8** (adds `2026-09-28`) |
| **Dates Classified `UNVERIFIABLE` (3-Table Parity Intact, Circular Benchmark)** | **7** (`2026-10-15`, `2026-10-09`, `2026-10-07`, `2026-10-06`, `2026-10-05`, `2026-10-02`, `2026-09-30`) | **25** |
| **Dates Classified `MISSING`** | **0** | **1** (`2026-09-21` Monday) |

---

## 2. PART A — FLOORSHEET COLLECTION MECHANISM AUDIT

We inspected the complete floorsheet retrieval and ingestion stack across [`proxy/nepseClientManager.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/nepseClientManager.mjs), [`proxy/brokerVault.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs), [`proxy/utils/dailyFloorsheetCollector.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs), and [`proxy/db/ledgerStore.js`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js). Below are the verified answers to all 14 audit criteria:

### A.1 Is the source accessible?
- **YES (Multi-Tier Architecture):**
  - **Tier 1 (Primary Live Source — Official NEPSE NOTS API):** [`proxy/utils/dailyFloorsheetCollector.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs#L276-L353) and [`proxy/brokerVault.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs#L569-L760) connect directly to `https://nepalstock.com.np/api/nots/nepse-data/floorsheet` using WASM-obfuscated salted tokens (`nepse-api-helper` in `nepseClientManager.mjs`) with TLS verification disabled (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`). Verified accessible on `2026-10-30` (`74,054` contracts downloaded at `2026-10-30T10:54:11Z`).
  - **Tier 2 (Secondary Scraper — ShareSansar AJAX):** [`fetchShareSansarFloorsheet()`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs#L422-L547) queries `https://www.sharesansar.com/floorsheet` via CSRF-authenticated DataTables POST requests.
  - **Tier 3 (Tertiary Scraper — Chukul / Merolagani):** [`fetchChukulFloorsheet()`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs#L367-L420) queries `https://chukul.com/api/data/v2/floorsheet/bydate/` and [`fetchMerolaganiFloorsheet()`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs#L789-L905) scrapes `https://merolagani.com/Floorsheet.aspx`.
  - **Tier 4 (Historical Archive — NepseAlpha FloorSheet Archive):** Historical backfill scripts (`backfill_30days.mjs`, `download_archive_floorsheets.mjs`) pull full-day historical floorsheets into `proxy/data/floorsheet-full-YYYY-MM-DD.json`.

### A.2 Is historical floorsheet retrieval supported?
- **PARTIALLY (By Tier):**
  - **Official NEPSE NOTS API (`POST /api/nots/nepse-data/floorsheet`):** Only serves the **latest active trading session's** floorsheet (`page=0..N&size=500`). It ignores date parameters for historical sessions; once NEPSE opens a new session, previous sessions are no longer retrievable from NOTS.
  - **ShareSansar (`fetchShareSansarFloorsheet`) & Chukul (`fetchChukulFloorsheet`):** Accept a `targetDate` (`YYYY-MM-DD`) parameter, supporting date-specific historical retrieval, but suffer from pagination caps (see A.4).
  - **Local Disk Archives (`proxy/data/floorsheet-full-YYYY-MM-DD.json` & `proxy/data/daily_floorsheets/floorsheet-YYYY-MM-DD.json.gz`):** Support full offline historical replay into SQLite (`36` full JSON files and `34` daily JSON/GZ archives currently on disk).

### A.3 Is the application requesting every available page?
- **YES in `dailyFloorsheetCollector.mjs`, NO in `brokerVault.mjs` fallback scrapers:**
  - In [`dailyFloorsheetCollector.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs#L294-L353), the collector reads `totalPages` and `totalElements` from Page 0 (`size=500`) and requests every remaining page (`page = 1 .. totalPages - 1`) in concurrent batches of `BATCH_CONCURRENCY = 5`.
  - However, in [`dailyFloorsheetCollector.mjs` line 326](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs#L326), if any page inside a batch throws an error after 3 retries, `fetchPage()` returns `null` (line 289) and is silently skipped (`if (!res) continue;`), resulting in missing 500-row blocks (which occurred on `2026-10-29`, where 66,500 of 69,619 trades were stored).

### A.4 Is pagination implemented correctly? Are page limits or record limits truncating the results?
- **DEFECTIVE IN TIER 2 & TIER 3 FALLBACKS (Bug P1-9):**
  1. **`dailyFloorsheetCollector.mjs` (`MAX_PAGES_SAFETY = 300`, `PAGE_SIZE = 500`):** Supports up to `150,000` trades/day (sufficient for NEPSE's typical `38,000–80,000` trades).
  2. **`brokerVault.mjs` `fetchFullNepseFloorsheet` (`maxPages = Math.min(totalPages, 250)`, `pageSize = 500`):** Supports up to `125,000` trades/day, **except** when `fullMarket` is false (`maxRecords = 25,000` default at line 569, which caps `totalPages` at `Math.ceil(25000 / 500) = 50` pages!).
  3. **`brokerVault.mjs` `fetchShareSansarFloorsheet` (Hard Cap at 8,000 rows):** At [`proxy/brokerVault.mjs` line 450](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs#L450), the loop is hardcoded to `for (let draw = 1; draw <= 16; draw++)` with `batchSize = 500`. Even when `maxRecords = 50000` is passed, `16 * 500 = 8,000` rows maximum are fetched—truncating 80–90% of a market-wide trading day!
  4. **`brokerVault.mjs` `getOrFetchBrokerDeskAnalysis` (Hard Cap at 15,000 rows):** At [`proxy/brokerVault.mjs` line 3006](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs#L3006), per-broker pagination stops at `pBuy < 30` and `pSell < 30` (`15,000` rows).

### A.5 Are all trading sessions collected?
- Within the most recent 1-month window (`2026-09-30` to `2026-10-30`), all **18 / 18** trading sessions were collected.
- Within the extended 38-session window (`2026-08-27` to `2026-10-30`), Monday **`2026-09-21`** was **missed completely** (Bug P1-1).

### A.6 Are broker transactions being omitted?
- **Zero broker omissions on raw contracts:** Across all `1,880,145` rows in `floorsheet_contracts`, `missing_broker_rows = 0` (`buyer_broker <= 0` or `seller_broker <= 0` is `0`) and `synthetic_999_rows = 0` in `daily_broker_ledger`.
- **HOWEVER, scrip-level omissions exist on 6 `VAULT` dates (Bug P1-6) and 1 partial date (`2026-10-29`, Bug P1-5):**
  - On `2026-10-29`, `3,119` contracts (`1,083,895` kitta) were dropped during NOTS pagination failure.
  - On `2026-10-14`, `2026-10-13`, `2026-10-12`, `2026-10-08`, `2026-10-01`, and `2026-09-28`, `floorsheet_contracts` contains trades for 7 to 11 scrips (including equities `GMLI`, `SHLB`, `SMPDA`, `TSHL`, `UNL`, `USHL`) that are **omitted** from `daily_broker_ledger` and `daily_stock_summary`.

### A.7 Are buy-side and sell-side records represented correctly?
- **YES for Volume & Turnover Conservation:** In `daily_broker_ledger`, every single contract increments both the buyer broker (`buy_volume`, `buy_amount`) and the seller broker (`sell_volume`, `sell_amount`). Across all 37 dates in `daily_broker_ledger`, `SUM(buy_volume) == SUM(sell_volume)` and `SUM(buy_amount) == SUM(sell_amount)` to the exact rupee/paisa.
- **NO for `aggressor_side` (Buy/Sell Order Initiation Bias — Bug P1-7):**
  - [`ledgerStore.js` (`ingestDailyFloorsheetTransaction`, lines 526–548)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L526-L548) sorts contracts chronologically by `contractId` and applies the standard **Chronological Tick Test** (`rate > prevPrice => BUY`, `rate < prevPrice => SELL`, `rate == prevPrice => prevSide`).
  - Conversely, [`dailyFloorsheetCollector.mjs` (`ingestContractsToLedger`, line 142)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs#L142) does **NOT** run a tick test; it executes:
    ```js
    const agg = t.aggressor || (bBroker > sBroker ? 'BUY' : 'SELL');
    ```
    Since raw NEPSE NOTS records do not have a `t.aggressor` field, **every trade ingested by `dailyFloorsheetCollector.mjs` is labeled `BUY` if the buyer's broker number is numerically larger than the seller's broker number (e.g., Broker 58 buying from Broker 45 = `'BUY'`, Broker 14 buying from Broker 58 = `'SELL'`)!** This corrupts `aggressor_side` in `floorsheet_contracts` on all `DAILY_COLLECTOR` dates (`2026-10-30`, `2026-10-29`, `2026-10-27`, `2026-10-26`, etc.).

### A.8 Are transaction IDs preserved?
- **YES (100% Authentic 16-Digit NEPSE Contract IDs):** Every single one of the `1,880,145` rows in `floorsheet_contracts` has a valid, non-null 16-digit NEPSE `contract_no` (`YYYYMMDD` + 8-digit sequence, e.g., `2026103001000001` to `2026103005021196`). Zero synthetic (`SYN_`) or hyphenated fallback IDs exist in the database.

### A.9 Are stock symbols and quantities mapped correctly?
- **Stock Symbols & Quantities:** All `1,880,145` rows have valid uppercase `symbol`, positive integer `quantity > 0`, positive `rate > 0`, and `ABS(quantity * rate - amount) <= 1.0` (`math_mismatch_rows = 0`).
- **CRITICAL DEFECT — Non-Equity Leakage & Unsorted Open/Close Prices in `dailyFloorsheetCollector.mjs` (Bug P1-7):**
  1. `ingestDailyFloorsheetTransaction()` in [`proxy/db/ledgerStore.js` (line 499)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L499) filters out Mutual Funds, Debentures, and Promoter shares via `isNonEquityScrip(sym, name)`.
  2. `ingestContractsToLedger()` in [`proxy/utils/dailyFloorsheetCollector.mjs` (lines 74–203)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs#L74-L203) **never calls `isNonEquityScrip()`**! Consequently, **95 Mutual Funds and Corporate Debentures** (`NICSF`, `RBBF40`, `EBLD85`, `SBLD89`, `SBID89`, etc.) are ingested into `floorsheet_contracts`, `daily_broker_ledger`, and `daily_stock_summary` on `DAILY_COLLECTOR` dates (348–360 scrips/day) but excluded on `NOTS_FULL_DUMP` dates (`2026-10-28` has 290 scrips).
  3. Furthermore, `ingestContractsToLedger()` in `dailyFloorsheetCollector.mjs` (lines 111–116) sets `s.open = rate` on the first loop iteration and `s.close = rate` on every subsequent iteration **without sorting `trades` chronologically first**. Because NEPSE NOTS returns pages in descending contract order (newest trade first on page 0), `open_price` and `close_price` in `daily_stock_summary` can be inverted unless overwritten by `/today-price`.

### A.10 Are transaction dates parsed correctly?
- **Mostly Yes, with 2 Historical Exceptions:**
  - `extractRealTradeDate()` in [`ledgerStore.js` (lines 384–420)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L384-L420) extracts the `YYYYMMDD` prefix from the 16-digit `contractId` (`^(\d{4})(\d{2})(\d{2})\d{6,}$`), which is authoritative.
  - Across all `1,880,145` rows in `floorsheet_contracts`, `0` rows have a mismatch between `SUBSTR(contract_no, 1, 8)` and `REPLACE(trade_date, '-', '')`.
  - **Exceptions:**
    - `2026-10-25` (Sunday): 2 synthetic rows (`NABIL`, `SHPC`) were inserted directly into `daily_stock_summary` with `trade_date = '2026-10-25'` (Bug P1-3).
    - `2026-10-16` (Friday): All 348 rows in `daily_stock_summary` were stamped with `calendar_status = 'QUARANTINED_NON_TRADING_WEEKDAY'` and `is_quarantined = 1` by an outdated Friday-weekend check (Bug P1-4).

### A.11 Are records silently rejected because of validation errors?
- In [`dailyFloorsheetCollector.mjs` (line 89)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs#L89), records with `!sym || qty <= 0 || rate <= 0` are silently skipped (`if (!sym || qty <= 0 || rate <= 0) continue;`) without incrementing a `rejectedCount` metric.
- In [`ledgerStore.js` (lines 499–505)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L499-L505), non-equity scrips and zero-qty rows are silently filtered via `return false` without logging the count of filtered non-equity trades vs malformed rows.

### A.12 Are API failures being recorded?
- Partial/failed collections are logged to `daily_ingestion_log` via `recordIngestionAudit()` ([`ledgerStore.js` line 739](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L739)), **but** `daily_ingestion_log` currently contains only **5 rows** (`2026-10-25` through `2026-10-29`) and was **not** updated during the `2026-10-30` collection run by `dailyFloorsheetCollector.mjs` because `dailyFloorsheetCollector.mjs` writes to `archive_index.json` instead of `daily_ingestion_log`!

### A.13 Is there any incomplete or partially downloaded dataset?
- **YES — `2026-10-29` (Thursday) is provably incomplete in `floorsheet_contracts` and `daily_broker_ledger` (Bug P1-5):**
  - `daily_ingestion_log` for `2026-10-29` states: `exchange_reported_count = 69619`, `stored_row_count = 67119`, `completeness_pct = 96.41%`, `status = 'PARTIAL_WARNING'`.
  - In `floorsheet_contracts`, `2026-10-29` has `66,500` contracts (`22,162,299` kitta, `Rs 8,170,665,469.85`), starting at `min_cid = 2026102901000023` (missing contracts `01`..`22` and ~3,119 contracts across the day).
  - Meanwhile, `daily_stock_summary` for `2026-10-29` has `23,246,194` kitta (`Rs 8,567,942,726.15`), which is **1,083,895 kitta (+Rs 397.28M) higher** than `floorsheet_contracts` and `daily_broker_ledger`!

---

## 3. PART B — DATE-BY-DATE COMPLETENESS REPORT

### 3.1 Classification Criteria Applied
In strict compliance with the Phase 1 audit specification:
1. **`COMPLETE`**: Trading day where all 3 SQLite tables (`floorsheet_contracts`, `daily_broker_ledger`, `daily_stock_summary`) are in 100% mathematical parity, `min_cid` starts at `01000001`, and total records match either an independent official exchange bulletin (`2026-10-26`) or verified 100% live NOTS `totalElements` (`2026-10-27`, `2026-10-28`, `2026-10-30`).
2. **`PARTIAL`**: Trading day where records exist, but there is proven truncation (`2026-10-29` missing 3,119 trades), table-level quarantine (`2026-10-16` quarantined in `daily_stock_summary`), or scrip/volume parity drift between `floorsheet_contracts` and `daily_stock_summary`/`daily_broker_ledger` (`2026-10-14`, `2026-10-13`, `2026-10-12`, `2026-10-08`, `2026-10-01`, `2026-09-28`).
3. **`MISSING`**: Valid NEPSE trading day with zero records collected (`2026-09-21`).
4. **`FAILED`**: Collection attempted and resulted in 0 usable records.
5. **`NOT A TRADING DAY`**: Official weekend (Saturday/Sunday) or NEPSE public holiday. (If polluted by stray DB records, explicitly flagged as `NOT A TRADING DAY (DB POLLUTED)`).
6. **`UNVERIFIABLE`**: Trading day where all 3 SQLite tables are in 100% internal parity and start at contract `01000001`, **but** `official_exchange_benchmarks` was self-populated from `daily_stock_summary` (`source = "Aggregated from daily_stock_summary (proxy DB)"`) and `daily_ingestion_log` has no independent `exchange_reported_count` from NOTS.

### 3.2 Complete One-Month Calendar & Trading Completeness Matrix (`2026-09-30` to `2026-10-30` — All 31 Calendar Days)

| Date | Day | NEPSE Open? | Attempted? | Ingestion Status / Source | Contracts Retrieved / Stored (`fc`) | Pages (500/pg) | `dbl` Rows (Buy=Sell Vol) | `dss` Scrips / Vol | Dup / Rej / Missing Records | Benchmark / API Status | Last Collection Timestamp | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **2026-10-30** | Fri | **YES** | YES | `DAILY_COLLECTOR` (`archive_index`: COMPLETE) | `74,054` / `74,054` (`22,862,554` kitta) | 149 | `14,080` (`22,862,554`) | `348` (`22,862,554`) | 0 dup / 0 miss (`01000001`..`05021196`) | HTTP 200 NOTS (100% match `74,054`) | `2026-10-30T10:54:11Z` | **COMPLETE** *(Note: includes 95 non-equities)* |
| **2026-10-29** | Thu | **YES** | YES | `DAILY_COLLECTOR` (`PARTIAL_WARNING` 96.41%) | `67,119` ret / `66,500` stored (`22,162,299` kitta) | 135 / 140 | `13,480` (`22,162,299`) | `350` (`23,246,194` — **+1,083,895 drift**) | **3,119 contracts (`1,083,895` kitta) MISSING** (`min_cid` `...000023`) | NOTS reported `69,619` trades; `floorsheet-full` missing | `2026-10-29T13:50:14Z` | **PARTIAL** |
| **2026-10-28** | Wed | **YES** | YES | `NOTS_FULL_DUMP` (`COMPLETE` 100%) | `63,744` ret / `63,037` equity stored (`18,820,937` kitta) | 128 | `12,655` (`18,820,937`) | `290` (`18,820,937`) | 0 dup / 707 non-equity filtered / 0 miss | HTTP 200 NOTS (`63,744` raw -> `63,037` equity) | `2026-10-29T13:46:30Z` | **COMPLETE** |
| **2026-10-27** | Tue | **YES** | YES | `DAILY_COLLECTOR` (`COMPLETE` 100%) | `53,030` / `53,030` (`15,346,226` kitta) | 107 | `11,720` (`15,346,226`) | `360` (`15,346,226`) | 0 dup / 0 miss (`01000001`..`05019104`) | HTTP 200 NOTS (`53,030` exact match) | `2026-10-28T02:56:12Z` | **COMPLETE** *(Note: includes non-equities)* |
| **2026-10-26** | Mon | **YES** | YES | `DAILY_COLLECTOR` (Verified vs Official PDF) | `38,788` / `38,788` (`10,343,709` kitta) | 78 | `10,508` (`10,343,709`) | `341` (`10,343,709`) | 0 dup / 0 miss (`01000001`..`05012548`) | Verified 100% vs **NEPSE Official PDF Bulletin** (`38,788` trades, `10,343,709` vol) | `2026-10-30T01:24:22Z` | **COMPLETE** |
| **2026-10-25** | Sun | **NO** *(Weekend)* | Erroneous | Polluted in `dss` & `daily_ingestion_log` | `0` in `fc` | 0 | `0` in `dbl` | **`2` rows (`125,000` vol: `NABIL`, `SHPC`)** | **2 synthetic rows in `dss` (`is_quarantined=0`)** | `daily_ingestion_log` falsely logs `38,788` rows | `2026-10-30T11:32:33Z` | **NOT A TRADING DAY (DB POLLUTED)** |
| **2026-10-24** | Sat | **NO** *(Weekend)* | No | Idle (raw backup file exists on disk) | `0` | 0 | `0` | `0` | 0 (`floorsheet-raw-2026-10-24.json.gz` on disk) | Market Closed (Saturday) | N/A | **NOT A TRADING DAY** |
| **2026-10-23** | Fri | **NO** *(Dashain)* | No | Skipped (Holiday: Kojagrat Purnima) | `0` | 0 | `0` | `0` | 0 | Market Closed (Dashain Holiday) | N/A | **NOT A TRADING DAY** |
| **2026-10-22** | Thu | **NO** *(Dashain)* | No | Skipped (Holiday: Ekadashi) | `0` | 0 | `0` | `0` | 0 | Market Closed (Dashain Holiday) | N/A | **NOT A TRADING DAY** |
| **2026-10-21** | Wed | **NO** *(Dashain)* | No | Skipped (Holiday: Vijaya Dashami) | `0` | 0 | `0` | `0` | 0 | Market Closed (Dashain Holiday) | N/A | **NOT A TRADING DAY** |
| **2026-10-20** | Tue | **NO** *(Dashain)* | No | Skipped (Holiday: Maha Navami) | `0` | 0 | `0` | `0` | 0 | Market Closed (Dashain Holiday) | N/A | **NOT A TRADING DAY** |
| **2026-10-19** | Mon | **NO** *(Dashain)* | No | Skipped (Holiday: Maha Ashtami) | `0` | 0 | `0` | `0` | 0 | Market Closed (Dashain Holiday) | N/A | **NOT A TRADING DAY** |
| **2026-10-18** | Sun | **NO** *(Weekend/Dashain)* | No | Skipped (Sunday / Phulpati) | `0` | 0 | `0` | `0` | 0 | Market Closed | N/A | **NOT A TRADING DAY** |
| **2026-10-17** | Sat | **NO** *(Weekend/Dashain)* | No | Skipped (Saturday / Phulpati) | `0` | 0 | `0` | `0` | 0 | Market Closed | N/A | **NOT A TRADING DAY** |
| **2026-10-16** | Fri | **YES** | YES | `NOTS_FULL_DUMP` (**Quarantined in `dss`**) | `38,795` / `38,795` (`13,226,556` kitta) | 78 | `10,446` (`13,226,556`) | `348` (`13,226,556` — **ALL 348 `is_quarantined=1`**) | **348 rows wrongly quarantined in `dss`** | Self-benchmark only; `floorsheet-2026-10-16.json` missing in `daily_floorsheets` | `2026-10-30T01:24:22Z` | **PARTIAL (Quarantined in `dss`)** |
| **2026-10-15** | Thu | **YES** | YES | `NOTS_FULL_DUMP` | `38,861` / `38,861` (`13,624,407` kitta) | 78 | `10,494` (`13,624,407`) | `349` (`13,624,407`) | 0 dup (`01000001`..`05009691`) | Self-referential benchmark (`daily_stock_summary`) | `2026-10-30T01:24:22Z` | **UNVERIFIABLE** *(100% 3-table parity)* |
| **2026-10-14** | Wed | **YES** | YES | `VAULT` | `38,719` / `38,719` (`10,974,481` kitta) | 78 | `10,213` (`10,904,347`) | `276` (`10,904,347` vs `287` scrips in `fc`) | **11 scrips (`70,134` kitta) in `fc` missing from `dss`/`dbl`** | Parity drift between `fc` (`10.97M`) and `dss` (`10.90M`) | `2026-10-30T01:24:22Z` | **PARTIAL** |
| **2026-10-13** | Tue | **YES** | YES | `VAULT` | `46,156` / `46,156` (`12,376,858` kitta) | 93 | `10,977` (`12,369,509`) | `278` (`12,369,509` vs `289` scrips in `fc`) | **11 scrips (`7,349` kitta) in `fc` missing from `dss`/`dbl`** | Parity drift between `fc` (`12.376M`) and `dss` (`12.369M`) | `2026-10-30T01:24:22Z` | **PARTIAL** |
| **2026-10-12** | Mon | **YES** | YES | `VAULT` | `49,174` / `49,174` (`12,084,044` kitta) | 99 | `11,128` (`12,073,264`) | `275` (`12,073,264` vs `282` scrips in `fc`) | **7 scrips (`10,780` kitta) in `fc` missing from `dss`/`dbl`** | Parity drift between `fc` (`12.084M`) and `dss` (`12.073M`) | `2026-10-30T01:24:22Z` | **PARTIAL** |
| **2026-10-11** | Sun | **NO** *(Weekend)* | No | Skipped (Sunday) | `0` | 0 | `0` | `0` | 0 | Market Closed | N/A | **NOT A TRADING DAY** |
| **2026-10-10** | Sat | **NO** *(Weekend/Holiday)* | No | Skipped (Saturday / Ghatasthapana) | `0` | 0 | `0` | `0` | 0 | Market Closed | N/A | **NOT A TRADING DAY** |
| **2026-10-09** | Fri | **YES** | YES | `DAILY_COLLECTOR` | `51,477` / `51,477` (`12,378,191` kitta) | 103 | `11,916` (`12,378,191`) | `288` (`12,378,191`) | 0 dup (`01000001`..`05014645`) | Self-referential benchmark (`daily_stock_summary`) | `2026-10-30T01:24:22Z` | **UNVERIFIABLE** *(100% 3-table parity)* |
| **2026-10-08** | Thu | **YES** | YES | `VAULT` | `43,083` / `43,083` (`10,537,826` kitta) | 87 | `10,894` (`10,485,974`) | `276` (`10,485,974` vs `285` scrips in `fc`) | **9 scrips (`51,852` kitta) in `fc` missing from `dss`/`dbl`** | Parity drift between `fc` (`10.537M`) and `dss` (`10.485M`) | `2026-10-30T01:24:22Z` | **PARTIAL** |
| **2026-10-07** | Wed | **YES** | YES | `DAILY_COLLECTOR` | `38,856` / `38,856` (`9,273,901` kitta) | 78 | `10,640` (`9,273,901`) | `291` (`9,273,901`) | 0 dup (`01000001`..`05010608`) | Self-referential benchmark (`daily_stock_summary`) | `2026-10-30T01:24:22Z` | **UNVERIFIABLE** *(100% 3-table parity)* |
| **2026-10-06** | Tue | **YES** | YES | `DAILY_COLLECTOR` | `41,002` / `41,002` (`8,218,881` kitta) | 83 | `11,050` (`8,218,881`) | `291` (`8,218,881`) | 0 dup (`01000001`..`05010719`) | Self-referential benchmark (`daily_stock_summary`) | `2026-10-30T01:24:22Z` | **UNVERIFIABLE** *(100% 3-table parity)* |
| **2026-10-05** | Mon | **YES** | YES | `DAILY_COLLECTOR` | `43,988` / `43,988` (`8,171,866` kitta) | 88 | `11,324` (`8,171,866`) | `289` (`8,171,866`) | 0 dup (`01000001`..`05011491`) | Self-referential benchmark (`daily_stock_summary`) | `2026-10-30T01:24:22Z` | **UNVERIFIABLE** *(100% 3-table parity)* |
| **2026-10-04** | Sun | **NO** *(Weekend)* | No | Skipped (Sunday) | `0` | 0 | `0` | `0` | 0 | Market Closed | N/A | **NOT A TRADING DAY** |
| **2026-10-03** | Sat | **NO** *(Weekend)* | No | Skipped (Saturday) | `0` | 0 | `0` | `0` | 0 | Market Closed | N/A | **NOT A TRADING DAY** |
| **2026-10-02** | Fri | **YES** | YES | `DAILY_COLLECTOR` | `42,943` / `42,943` (`9,927,368` kitta) | 86 | `11,197` (`9,927,368`) | `290` (`9,927,368`) | 0 dup (`01000001`..`05011735`) | Self-referential benchmark (`daily_stock_summary`) | `2026-10-30T01:24:22Z` | **UNVERIFIABLE** *(100% 3-table parity)* |
| **2026-10-01** | Thu | **YES** | YES | `VAULT` | `50,782` / `50,782` (`11,583,453` kitta) | 102 | `11,324` (`11,577,016`) | `276` (`11,577,016` vs `286` scrips in `fc`) | **10 scrips (`6,437` kitta) in `fc` missing from `dss`/`dbl`** | Parity drift between `fc` (`11.583M`) and `dss` (`11.577M`) | `2026-10-30T01:24:22Z` | **PARTIAL** |
| **2026-09-30** | Wed | **YES** | YES | `DAILY_COLLECTOR` | `47,240` / `47,240` (`11,281,325` kitta) | 95 | `11,253` (`11,281,325`) | `288` (`11,281,325`) | 0 dup (`01000001`..`05014115`) | Self-referential benchmark (`daily_stock_summary`) | `2026-10-30T01:24:22Z` | **UNVERIFIABLE** *(100% 3-table parity)* |

### 3.3 Extended Ledger Completeness Matrix (`2026-08-27` to `2026-09-29` — Prior 20 Trading Sessions)

| Date | Day | NEPSE Open? | Source | Contracts (`fc`) | Pages (500/pg) | `fc` Volume (Kitta) | `dbl` Volume (Buy=Sell) | `dss` Scrips / Volume | Parity / Anomaly | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| **2026-09-29** | Tue | **YES** | `DAILY_COLLECTOR` | `50,146` | 101 | `9,886,336` | `9,886,336` | `289` / `9,886,336` | 100% 3-table parity (`01000001`..`05015133`) | **UNVERIFIABLE** |
| **2026-09-28** | Mon | **YES** | `VAULT` | `57,031` | 115 | `11,674,482` | `11,665,920` | `276` / `11,665,920` | **9 scrips (`8,562` kitta) missing in `dss`/`dbl`** | **PARTIAL** |
| **2026-09-25** | Fri | **NO** *(Indra Jatra)* | Holiday | `0` | 0 | `0` | `0` | `0` | Official Holiday (`इन्द्रजात्रा` in `nepseCalendar.js`) | **NOT A TRADING DAY** |
| **2026-09-24** | Thu | **YES** | `DAILY_COLLECTOR` | `51,015` | 103 | `11,573,243` | `11,573,243` | `286` / `11,573,243` | 100% 3-table parity (`01000001`..`05016843`) | **UNVERIFIABLE** |
| **2026-09-23** | Wed | **YES** | `DAILY_COLLECTOR` | `57,324` | 115 | `14,593,661` | `14,593,661` | `287` / `14,593,661` | 100% 3-table parity (`01000001`..`05015557`) | **UNVERIFIABLE** |
| **2026-09-22** | Tue | **YES** | `DAILY_COLLECTOR` | `69,910` | 140 | `16,954,527` | `16,954,527` | `289` / `16,954,527` | 100% 3-table parity (`01000001`..`05019465`) | **UNVERIFIABLE** |
| **2026-09-21** | Mon | **YES** | **NONE** | **`0`** | **0** | **`0`** | **`0`** | **`0`** | **COMPLETELY MISSING TRADING SESSION (Bug P1-1)** | **MISSING** |
| **2026-09-18** | Fri | **YES** | `DAILY_COLLECTOR` | `63,490` | 127 | `17,351,589` | `17,351,589` | `285` / `17,351,589` | 100% 3-table parity (`01000001`..`05015039`) | **UNVERIFIABLE** |
| **2026-09-17** | Thu | **YES*** | `DAILY_COLLECTOR` | `51,197` | 103 | `12,672,736` | `12,672,736` | `282` / `12,672,736` | *Flagged in `ledgerStore.js` as Indra Jatra, but valid in `nepseCalendar.js` (`2026-09-25` is Indra Jatra) | **UNVERIFIABLE** |
| **2026-09-16** | Wed | **YES** | `DAILY_COLLECTOR` | `55,271` | 111 | `13,322,047` | `13,322,047` | `290` / `13,322,047` | 100% 3-table parity (`01000001`..`05012435`) | **UNVERIFIABLE** |
| **2026-09-15** | Tue | **YES** | `DAILY_COLLECTOR` | `78,184` | 157 | `19,498,515` | `19,498,515` | `286` / `19,498,515` | 100% 3-table parity (`01000001`..`05019541`) | **UNVERIFIABLE** |
| **2026-09-14** | Mon | **YES** | `DAILY_COLLECTOR` | `48,621` | 98 | `10,788,635` | `10,788,635` | `281` / `10,788,635` | 100% 3-table parity (`01000001`..`05012277`) | **UNVERIFIABLE** |
| **2026-09-11** | Fri | **YES** | `DAILY_COLLECTOR` | `48,475` | 97 | `10,957,230` | `10,957,230` | `286` / `10,957,230` | 100% 3-table parity (`01000001`..`05010923`) | **UNVERIFIABLE** |
| **2026-09-10** | Thu | **YES** | `DAILY_COLLECTOR` | `43,633` | 88 | `9,744,138` | `9,744,138` | `288` / `9,744,138` | 100% 3-table parity (`01000001`..`05009543`) | **UNVERIFIABLE** |
| **2026-09-09** | Wed | **YES** | `DAILY_COLLECTOR` | `49,958` | 100 | `8,104,225` | `8,104,225` | `285` / `8,104,225` | 100% 3-table parity (`01000001`..`05012172`) | **UNVERIFIABLE** |
| **2026-09-08** | Tue | **NO** *(Rishi Panchami)* | Holiday | `0` | 0 | `0` | `0` | `0` | Official Holiday (`ऋषि पञ्चमी / हरितालिका तीज`) | **NOT A TRADING DAY** |
| **2026-09-07** | Mon | **YES** | `DAILY_COLLECTOR` | `50,184` | 101 | `8,048,057` | `8,048,057` | `287` / `8,048,057` | 100% 3-table parity (`01000001`..`05011090`) | **UNVERIFIABLE** |
| **2026-09-04** | Fri | **NO** *(Gaura Parwa)* | Holiday | `0` | 0 | `0` | `0` | `0` | Official Holiday (`गौरा पर्व` in `nepseCalendar.js`) | **NOT A TRADING DAY** |
| **2026-09-03** | Thu | **YES** | `DAILY_COLLECTOR` | `39,921` | 80 | `7,021,937` | `7,021,937` | `284` / `7,021,937` | 100% 3-table parity (`01000001`..`05010014`) | **UNVERIFIABLE** |
| **2026-09-02** | Wed | **YES** | `DAILY_COLLECTOR` | `39,180` | 79 | `6,740,099` | `6,740,099` | `283` / `6,740,099` | 100% 3-table parity (`01000001`..`05010473`) | **UNVERIFIABLE** |
| **2026-09-01** | Tue | **YES** | `DAILY_COLLECTOR` | `47,675` | 96 | `6,766,321` | `6,766,321` | `281` / `6,766,321` | 100% 3-table parity (`01000001`..`05011294`) | **UNVERIFIABLE** |
| **2026-08-31** | Mon | **YES** | `DAILY_COLLECTOR` | `67,323` | 135 | `8,170,764` | `8,170,764` | `280` / `8,170,764` | 100% 3-table parity (`01000001`..`05016221`) | **UNVERIFIABLE** |
| **2026-08-27** | Thu | **CONFLICT*** | `DAILY_COLLECTOR` | `51,912` | 104 | `9,123,717` | `9,123,717` | `277` / `9,123,717` | *Marked as `'Janai Purnima'` holiday in `ledgerStore.js` & `nepseCalendar.js`, yet 51,912 real NEPSE contracts (`2026082701000001`..) exist! | **UNVERIFIABLE (Holiday Table Conflict)** |

---

## 4. PART C — DATABASE VERIFICATION & DATE-WISE RECONCILIATION

### 4.1 Schema & Field-Level Integrity Verification (`proxy/data/nepse_ledger.sqlite`)

We executed automated SQLite verification queries (`audit_phase1.mjs` and `audit_phase1_deep.mjs`) across all `1,880,145` rows in `floorsheet_contracts`, `436,053` rows in `daily_broker_ledger`, and `11,015` rows in `daily_stock_summary`:

| Verification Check | SQL Assertion / Condition Tested | Empirical Result | Verdict |
|---|---|---|---|
| **1. Every record has a trading date** | `WHERE trade_date IS NULL OR trade_date = ''` across `fc`, `dbl`, `dss` | `fc: 0`, `dbl: 0`, `dss: 0` | **PASS** |
| **2. Every record has a valid stock symbol** | `WHERE symbol IS NULL OR symbol = ''` across `fc`, `dbl`, `dss` | `fc: 0`, `dbl: 0`, `dss: 0` (Note: 95 non-equity symbols present on `DAILY_COLLECTOR` dates) | **PARTIAL (Non-equity leakage)** |
| **3. Transaction IDs are stored** | `WHERE contract_no IS NULL OR contract_no = ''` in `floorsheet_contracts` | `0` nulls; `1,880,145 / 1,880,145` rows have authentic 16-digit NEPSE `contract_no` (`0` `SYN_`, `0` hyphenated) | **PASS** |
| **4. Quantity and price are correctly typed** | `WHERE quantity <= 0 OR rate <= 0 OR amount <= 0 OR ABS(quantity*rate - amount) > 1.0` | `invalid_qty_rate_rows = 0`, `math_mismatch_rows = 0` across all 37 dates | **PASS** |
| **5. Broker information is preserved** | `WHERE buyer_broker <= 0 OR seller_broker <= 0 OR buyer_broker IS NULL OR seller_broker IS NULL` | `missing_broker_rows = 0` in `fc`; `synthetic_999_rows = 0` across all 37 dates in `dbl` | **PASS** |
| **6. Duplicate transaction handling** | `PRIMARY KEY (contract_no)` on `floorsheet_contracts`; `PRIMARY KEY (trade_date, symbol, broker_id)` on `dbl`; `PRIMARY KEY (trade_date, symbol)` on `dss` | `INSERT OR REPLACE` enforces strict uniqueness by `contract_no` | **PASS** |
| **7. Historical records remain accessible** | Query all 37 historical trading dates (`2026-08-27` to `2026-10-30`) | All 37 dates queryable in `< 15ms` | **PASS** |
| **8. Records not overwritten by latest day** | Verify prior dates remain intact after `2026-10-30` ingestion | Prior 36 dates untouched; partitioned by `trade_date` | **PASS** |
| **9. Records from different dates not mixed** | `SELECT contract_no, trade_date FROM floorsheet_contracts WHERE SUBSTR(contract_no, 1, 8) != REPLACE(trade_date, '-', '')` | **`0` mismatched rows** across `1,880,145` contracts | **PASS** |

---

### 4.2 Index & Query Performance Audit

We inspected `sqlite_master` (`WHERE type = 'index'`) on `nepse_ledger.sqlite`:

| Query Dimension | Target Table | Existing Index(es) | Performance / Gap Analysis |
|---|---|---|---|
| **By Trading Date** | `daily_stock_summary` | `idx_stock_summary_date (trade_date DESC)` + `PRIMARY KEY (trade_date, symbol)` | **OPTIMAL** (`< 1 ms`) |
| **By Trading Date** | `daily_broker_ledger` | `PRIMARY KEY (trade_date, symbol, broker_id)` (leading column `trade_date`) | **OPTIMAL** (`< 5 ms`) |
| **By Trading Date** | `floorsheet_contracts` | `idx_fs_contracts_date_amount (trade_date DESC, amount DESC)` | **OPTIMAL** (`< 10 ms`) |
| **By Stock Symbol** | `daily_stock_summary` | `idx_stock_date (symbol, trade_date DESC)` | **OPTIMAL** (`< 1 ms`) |
| **By Stock Symbol** | `daily_broker_ledger` | `idx_broker_symbol_date (symbol, trade_date DESC)` | **OPTIMAL** (`< 2 ms`) |
| **By Stock Symbol** | `floorsheet_contracts` | `idx_fs_contracts_symbol_date (UPPER(symbol), trade_date DESC)` | **SUB-OPTIMAL** — Queries using `WHERE symbol = ?` (without `UPPER(symbol)`) cannot use the expression index `UPPER(symbol)` and fall back to scanning! |
| **By Broker ID** | `daily_broker_ledger` | **NONE** (`PRIMARY KEY` has `broker_id` as 3rd column `(trade_date, symbol, broker_id)`) | **MISSING INDEX (Bug P1-10)** — Queries filtering `WHERE broker_id = ?` across all dates or `WHERE trade_date = ? AND broker_id = ?` must scan all symbols for that date. |
| **By Broker ID** | `floorsheet_contracts` | **NONE** (`buyer_broker` and `seller_broker` are unindexed) | **MISSING INDEX (Bug P1-10)** — Queries filtering `floorsheet_contracts` by `buyer_broker = ?` or `seller_broker = ?` require a full table/date scan. |
| **By Transaction ID** | `floorsheet_contracts` | `PRIMARY KEY (contract_no)` | **OPTIMAL** (`O(log N)` B-tree lookup) |

---

### 4.3 Deep Dive into Database Reconciliation Anomalies (Bugs P1-1 through P1-10)

#### Anomaly 1 (Bug P1-3): Non-Trading Sunday `2026-10-25` Polluting `daily_stock_summary`
- **Empirical Evidence:** `2026-10-25` was a **Sunday** (weekly exchange holiday). `floorsheet_contracts` and `daily_broker_ledger` have `0` rows for `2026-10-25`. However, `daily_stock_summary` contains **2 unquarantined rows**:
  ```json
  [
    { "trade_date": "2026-10-25", "symbol": "NABIL", "open_price": 515, "high_price": 525, "low_price": 510, "close_price": 522, "total_volume": 45000, "total_turnover": 23490000, "is_quarantined": 0, "calendar_status": "VALID", "source": "NOTS_FULL_DUMP" },
    { "trade_date": "2026-10-25", "symbol": "SHPC",  "open_price": 288, "high_price": 295, "low_price": 285, "close_price": 292, "total_volume": 80000, "total_turnover": 23200000, "is_quarantined": 0, "calendar_status": "VALID", "source": "NOTS_FULL_DUMP" }
  ]
  ```
- **Downstream Impact:** Because `getStoredDates()` in [`proxy/db/ledgerStore.js` (line 868)](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L868) executes:
  ```sql
  SELECT DISTINCT trade_date FROM daily_stock_summary
  WHERE calendar_status != 'PARTIAL_SESSION' OR calendar_status IS NULL
  ORDER BY trade_date DESC
  ```
  `2026-10-25` is returned as one of the 38 valid trading dates! Any rolling 5D or 10D window that slices `getStoredDates()` includes Sunday `2026-10-25` as a trading day.

#### Anomaly 2 (Bug P1-4): Valid Friday Trading Session `2026-10-16` Quarantined in `daily_stock_summary`
- **Empirical Evidence:** Friday `2026-10-16` was the final valid trading day before Dashain (`38,795` contracts, `13,226,556` kitta, `Rs 4.82B` turnover).
- However, all `348` rows for `2026-10-16` in `daily_stock_summary` have:
  - `is_quarantined = 1`
  - `calendar_status = 'QUARANTINED_NON_TRADING_WEEKDAY'`
- **Downstream Impact:** Any query on `daily_stock_summary` that filters `WHERE (is_quarantined = 0 OR is_quarantined IS NULL)` (such as `/api/floorsheet-hub/available-dates` at [`proxy/routes/floorsheetHubRoutes.mjs` line 127](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/floorsheetHubRoutes.mjs#L127)) **completely drops `2026-10-16`**!

#### Anomaly 3 (Bug P1-5): `2026-10-29` Partial Ingestion & 1.08M Kitta Drift Between `daily_stock_summary` and `floorsheet_contracts`
- **Empirical Evidence:** On `2026-10-29`:
  - `daily_stock_summary` has `350` scrips, `23,246,194` kitta, `Rs 8,567,942,726.15` turnover.
  - `floorsheet_contracts` has `350` scrips, `66,500` contracts, `22,162,299` kitta, `Rs 8,170,665,469.85` turnover.
  - `daily_broker_ledger` has `350` scrips, `22,162,299` buy/sell kitta, `Rs 8,170,665,469.85` turnover.
  - Across **314 out of 350 scrips**, `daily_stock_summary.total_volume > SUM(floorsheet_contracts.quantity)` (for example: `NIMB` is missing `100,253` kitta in `floorsheet_contracts`; `GBIME` is missing `38,559` kitta; `GHL` is missing `28,706` kitta; `JBBL` is missing `28,173` kitta; `BARUN` is missing `14,724` kitta — `143,789` in `dss` vs `129,065` in `fc`/`dbl`).
- **Root Cause:** During `2026-10-29` collection, ~6 pages (`3,119` contracts = `1,083,895` kitta) failed to download from NEPSE NOTS (`daily_ingestion_log` recorded `PARTIAL_WARNING: 96.41%`), and subsequently `ingestDailyStockPrices()` overwrote `daily_stock_summary` with the full-day market summary from `/today-price`, leaving `floorsheet_contracts` and `daily_broker_ledger` at 96.41% while `daily_stock_summary` has 100% volume! Furthermore, neither `floorsheet-full-2026-10-29.json` nor `floorsheet-2026-10-29.json` exists on disk (even though `archive_index.json` points to `data/daily_floorsheets/floorsheet-2026-10-29.json`).

#### Anomaly 4 (Bug P1-6): 6 `VAULT` Historical Dates Have Extra Scrips in `floorsheet_contracts` Missing from `daily_stock_summary` & `daily_broker_ledger`
- On `2026-10-14`, `2026-10-13`, `2026-10-12`, `2026-10-08`, `2026-10-01`, and `2026-09-28` (`source = 'VAULT'`), `floorsheet_contracts` was populated from `floorsheet-full-YYYY-MM-DD.json`, whereas `daily_stock_summary` and `daily_broker_ledger` were populated earlier from `VAULT` with fewer scrips:
  - **`2026-10-14`:** `fc` has `287` scrips (`10,974,481` kitta) vs `dss`/`dbl` `276` scrips (`10,904,347` kitta) — **11 scrips (`70,134` kitta)** missing from `dss`/`dbl`: `EBLD85` (165), `GMLI` (395), `KSY` (1,300), `PBLD84` (25), `SBLD89` (64,870), `SHINED` (225), `SHLB` (80), `SMPDA` (607), `TSHL` (1,807), `UNL` (50), `USHL` (610).
  - **`2026-10-13`:** `fc` has `289` scrips (`12,376,858` kitta) vs `dss`/`dbl` `278` scrips (`12,369,509` kitta) — **11 scrips (`7,349` kitta)** missing from `dss`/`dbl`.
  - **`2026-10-12`:** `fc` has `282` scrips (`12,084,044` kitta) vs `dss`/`dbl` `275` scrips (`12,073,264` kitta) — **7 scrips (`10,780` kitta)** missing from `dss`/`dbl`.
  - **`2026-10-08`:** `fc` has `285` scrips (`10,537,826` kitta) vs `dss`/`dbl` `276` scrips (`10,485,974` kitta) — **9 scrips (`51,852` kitta)** missing from `dss`/`dbl`.
  - **`2026-10-01`:** `fc` has `286` scrips (`11,583,453` kitta) vs `dss`/`dbl` `276` scrips (`11,577,016` kitta) — **10 scrips (`6,437` kitta)** missing from `dss`/`dbl`.
  - **`2026-09-28`:** `fc` has `285` scrips (`11,674,482` kitta) vs `dss`/`dbl` `276` scrips (`11,665,920` kitta) — **9 scrips (`8,562` kitta)** missing from `dss`/`dbl`.

---

## 5. COMPLETE INVENTORY OF BUGS DISCOVERED IN PHASE 1

| Bug ID | Severity | Component / File | Description & Empirical Proof |
|---|---|---|---|
| **P1-1** | **HIGH** | Historical Archive / SQLite (`nepse_ledger.sqlite`) | **Missing Valid Trading Day `2026-09-21` (Monday):** Between Friday `2026-09-18` and Tuesday `2026-09-22`, Monday `2026-09-21` was an open NEPSE trading day (`isTradingDay: true`), but has `0` records across all SQLite tables and disk archives. |
| **P1-2** | **MEDIUM** | [`src/utils/nepseCalendar.js`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/nepseCalendar.js#L50-L60) & [`proxy/db/ledgerStore.js`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L430-L450) | **Holiday Calendar Conflict on `2026-08-27` and `2026-09-17`:** Both files list `2026-08-27` as `'Janai Purnima'` (holiday), yet `51,912` real NEPSE contracts (`2026082701000001`..) were traded and stored. Meanwhile `ledgerStore.js` lists `2026-09-17` as `'Indra Jatra'` while `nepseCalendar.js` lists `2026-09-25` as `'Indra Jatra'` (and had to add `LEGACY_SCRAPE_DATE_ALLOWLIST` as a workaround). |
| **P1-3** | **CRITICAL** | `daily_stock_summary` & `daily_ingestion_log` (`nepse_ledger.sqlite`) | **Non-Trading Sunday `2026-10-25` Polluting Database:** `daily_stock_summary` contains 2 synthetic test rows (`NABIL` 45,000 vol, `SHPC` 80,000 vol) on Sunday `2026-10-25` with `is_quarantined = 0` and `calendar_status = 'VALID'`. `getStoredDates()` returns `2026-10-25` as a valid trading session across the application. |
| **P1-4** | **HIGH** | `daily_stock_summary` (`nepse_ledger.sqlite`) | **Valid Trading Friday `2026-10-16` Quarantined:** All `348` rows on `2026-10-16` in `daily_stock_summary` have `is_quarantined = 1` and `calendar_status = 'QUARANTINED_NON_TRADING_WEEKDAY'`, causing endpoints that filter `is_quarantined = 0` (such as `/api/floorsheet-hub/available-dates`) to hide `2026-10-16`. |
| **P1-5** | **CRITICAL** | `2026-10-29` Dataset (`nepse_ledger.sqlite` & `proxy/data/`) | **Partial Floorsheet on `2026-10-29` (96.41%) & 1.08M Kitta Parity Drift:** `floorsheet_contracts` and `daily_broker_ledger` have `66,500` trades (`22,162,299` kitta), missing `3,119` trades (`1,083,895` kitta) compared to `daily_stock_summary` (`23,246,194` kitta). Furthermore, `floorsheet-2026-10-29.json` and `floorsheet-full-2026-10-29.json` are missing from disk despite being listed in `archive_index.json`. |
| **P1-6** | **HIGH** | `VAULT` Historical Dates (`2026-10-14`, `13`, `12`, `08`, `01`, `09-28`) | **Table Desynchronization on 6 `VAULT` Dates:** `floorsheet_contracts` was re-ingested from `floorsheet-full-*.json` (`282–289` scrips), but `daily_stock_summary` and `daily_broker_ledger` retain older `VAULT` rows (`275–278` scrips), omitting 7–11 scrips (including equities `GMLI`, `SHLB`, `SMPDA`, `TSHL`, `UNL`, `USHL`). |
| **P1-7** | **CRITICAL** | [`proxy/utils/dailyFloorsheetCollector.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/utils/dailyFloorsheetCollector.mjs#L74-L203) | **Dual Ingestion Logic Divergence (`ingestContractsToLedger` vs `ingestDailyFloorsheetTransaction`):** `dailyFloorsheetCollector.mjs` (1) fails to filter out 95 non-equity Mutual Funds/Debentures (`isNonEquityScrip` missing), (2) fails to sort trades chronologically before assigning `open_price` and `close_price`, and (3) sets `aggressor_side` using `buyer_broker > seller_broker ? 'BUY' : 'SELL'` instead of a chronological tick test! |
| **P1-8** | **MEDIUM** | `official_exchange_benchmarks` (`nepse_ledger.sqlite`) | **Circular Verification Benchmark Table:** 35 of 36 rows in `official_exchange_benchmarks` have `source = 'Aggregated from daily_stock_summary (proxy DB)'` (copied from `daily_stock_summary` on `2026-10-30T00:51:47Z`), creating a false 100% reconciliation pass whenever `daily_stock_summary` is compared against `official_exchange_benchmarks`. |
| **P1-9** | **HIGH** | [`proxy/brokerVault.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/brokerVault.mjs#L450) | **Pagination Truncation Caps in Fallback Scrapers:** `fetchShareSansarFloorsheet()` hardcodes `draw <= 16` (`8,000` rows max), and `getOrFetchBrokerDeskAnalysis()` hardcodes `pBuy < 30` (`15,000` rows max), truncating fallback collection on 40,000–75,000 trade NEPSE sessions. |
| **P1-10** | **MEDIUM** | [`proxy/db/ledgerStore.js`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/db/ledgerStore.js#L60-L190) | **Missing SQLite Indexes for Broker-Centric & Direct Symbol Queries:** `floorsheet_contracts` lacks indexes on `(trade_date, buyer_broker)`, `(trade_date, seller_broker)`, and plain `(symbol, trade_date DESC)` (only `UPPER(symbol)` is indexed), and `daily_broker_ledger` lacks an index on `(broker_id, trade_date DESC)`. |
