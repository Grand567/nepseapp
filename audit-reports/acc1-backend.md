\### 1. Files Inspected in This Turn (100% Coverage Transparency)



\*\*Inspected in full:\*\*



\* `00-SHARED-CONTRACT.txt` (project tree \& `src/data/` static blob metadata)

\* `package.json`

\* `src/App.jsx`

\* `src/constants/marketRules.js`

\* `src/db/migrations/002\_upgrade\_signal\_ledger.sql`

\* `src/main.jsx`

\* `src/package.json`

\* `src/types/aiGuru.ts`

\* `src/types/floorsheetHub.ts`

\* `src/types/stockTelemetry.ts`

\* `migrations/003\_upgrade\_floorsheet\_hub.sql`

\* `migrations/004\_upgrade\_fundamentals\_and\_lockin.sql`

\* `proxy/migrations/001\_prediction\_engine.sql`

\* `cloudflare/worker.js`

\* `proxy/db/ledgerStore.js`

\* `proxy/db/signalTrackerStore.js`

\* `proxy/ipoHelper.js`

\* `proxy/legacy\_next\_api/ai-guru/assess/route.ts`

\* `proxy/legacy\_next\_api/floorsheet/hub/route.ts`

\* `proxy/legacy\_next\_api/signals/track-record/route.ts`

\* `proxy/legacy\_next\_api/stocks/\[symbol]/telemetry/route.ts`

\* `proxy/legacy\_next\_api/system/audit-health/route.ts`

\* `proxy/lib/db/drabyashreeDb.ts`

\* `proxy/meroshare.js`

\* `proxy/routes/radarRoutes.js`

\* `proxy/scrapeIpo.js`

\* `proxy/scrapeNames.js`

\* `proxy/scripts/rebuildSignalTrackRecord.ts`

\* `proxy/server.js` (single-line shim importing `./server.mjs`)



\*\*Inspected partially (input truncated in bundle):\*\*



\* `proxy/utils/microstructureEngine.js` (truncated at `const totalCrossVol...` inside `calculateMultiDayDiagnostics`)



\*\*Not attached in this turn's context bundle (cannot be audited without source; note that direct consumers of the 27.1 MB `src/data/` broker JSON blobs likely reside here):\*\*



\* `server.js`, `proxy/server.mjs`, `proxy/brokerVault.mjs`, `proxy/utils/sharedBrokerAggregationEngine.js`, `src/utils/liveData.js`, `src/utils/quantEngine.js`, `verifyDrabyashreeMath.js`, `src/services/\*`







\---



\### 2. Audit Findings Table



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| `A1-001` | \*\*P0\*\* | `cloudflare/worker.js` (`isNepseTradingHours`, `getCacheTtlSeconds`, `fetch`) | Off-hours edge cache TTLs (`1800s` for `/live-market`, `86400s` for `/broker`/`/ledger`, `3600s` default) are not capped to the next NEPSE Pre-Open (10:30 NPT) or Open (11:00 NPT) boundary. A request at 10:59 AM NPT caches yesterday's close for 30 min–24 hrs into live trading with HTTP `200` and no staleness timestamp. Also `STALE-FALLBACK` is dead code (`cache.match` already missed; `fetch()` does not reject on 502/503) and lacks a timeout. | During the highest-volatility opening 30 minutes (or all day for broker/ledger endpoints), investors see yesterday's prices/broker flows as live (`200 OK`) and misprice orders. | Include Pre-Open (`10:30–11:00 NPT`), cap off-hours TTL to `secondsUntilNextSessionStart`, add `AbortSignal.timeout(12000)`, and emit `X-Data-Cached-At` / `X-Data-Stale` headers. |

| `A1-002` | \*\*P0\*\* | `proxy/lib/db/drabyashreeDb.ts` (`getDrabyashreeDb`, `getLatestSignalTelemetryForSymbol`, `loadScripBundleFromDb`) | 1) SQL `COALESCE(strategy\_name, strategy)`, `COALESCE(ratchet\_triggered, is\_ratchet\_armed, 0)`, and `COALESCE(trade\_date, date)` / `COALESCE(open\_price, open)` reference columns that do not exist on `algorithmic\_signal\_ledger` or `daily\_stock\_summary`. SQLite throws `no such column` at prepare time; `catch` silently returns `null` / `\[]`. 2) Ignores `NEPSE\_DATA\_DIR`/`RENDER\_DISK\_PATH` (split-brain DB vs `ledgerStore.js`) and omits `busy\_timeout = 10000`. | AI Guru (`/api/ai-guru/assess`) and Stock Telemetry (`/api/stocks/\[symbol]/telemetry`) silently get empty candles, null quotes, and null signal telemetry, or read a stale/empty SQLite file instead of the live DB. | Resolve DB path using `DRABYASHREE\_DB\_PATH || NEPSE\_DATA\_DIR || RENDER\_DISK\_PATH`, set `timeout: 10000` + `busy\_timeout = 10000`, and query only columns that actually exist on each detected table. |

| `A1-003` | \*\*P0\*\* | `proxy/db/ledgerStore.js` (`getSymbolHistoryFromDb`, `rebuildHotCache`) \& `proxy/db/signalTrackerStore.js` (`rebuildSignalTrackRecord`) | SQL queries on `daily\_broker\_ledger` omit `cross\_vol` even though `ingestDailyFloorsheetTransaction` stores it and `microstructureEngine.js` relies on `crossVol` to detect matching/wash trades. | Self-trade / internal-cross volume is permanently `0` across Radar, Diagnostics, and Wash-Churn Trap detection, blinding investors to operator wash-trading. | Select `cross\_vol` in `rebuildHotCache`, `getSymbolHistoryFromDb`, and `signalTrackerStore.js`, and pass `crossVol: row.cross\_vol || 0`. |

| `A1-004` | \*\*P0\*\* | `proxy/db/ledgerStore.js` (`ingestDailyFloorsheetTransaction`, `ingestFloorsheetContractsTransaction`) | 1) Re-ingesting a session overwrites `daily\_stock\_summary.total\_volume` while `daily\_broker\_ledger` only upserts brokers present in the new batch, leaving stale broker rows from prior writes and breaking zero-sum conservation. 2) Trades missing buyer or seller inject a fabricated Broker `#999` into `daily\_broker\_ledger` while `floorsheet\_contracts` drops them, breaking 3-way parity. 3) Synthetic `contract\_no` uses `idx + 1`, colliding on incremental re-ingest. | Ghost broker rows and fabricated Broker `#999` distort top-buyer/seller concentration and break 3-way reconciliation; incremental ticks corrupt `floorsheet\_contracts`. | Require `buyer > 0 \&\& seller > 0` before aggregating, delete prior `daily\_broker\_ledger` rows for `(trade\_date, symbol)` inside the transaction before upserting, and make synthetic contract IDs deterministic without batch-relative `idx`. |

| `A1-005` | \*\*P0\*\* | `proxy/db/ledgerStore.js` (`seedFromSnapshotGz`) | 1) Uses `INSERT OR REPLACE INTO daily\_stock\_summary SELECT \* FROM seed\_db...`, which fails or shifts column values when the static `.db.gz` snapshot has fewer/differently ordered columns than the migrated live schema. 2) Uses `INSERT OR REPLACE` instead of `INSERT OR IGNORE`, silently overwriting newer live/reconciled SQLite sessions with stale static snapshot rows. | Live market sessions stored in SQLite get silently clobbered by older bundled static snapshots on restart, or restore corrupts numeric columns. | Use explicit column lists and `INSERT OR IGNORE` in both the `ATTACH` and JSON snapshot restore paths. |

| `A1-006` | \*\*P0\*\* | `proxy/db/ledgerStore.js` (`floorsheet\_broker\_summary` view) | View hardcodes `0 AS avg\_ticket\_kitta, 0 AS broker\_anomaly\_score`. Downstream consumers (`drabyashreeDb.ts`, AI Guru) treat `0` as a real measurement rather than `NULL`. | Institutional broker participation is reported as `0` kitta / `0.00x` anomaly, generating false "Retail herd churn" and suppressing valid Smart Money alerts. | Emit `NULL AS avg\_ticket\_kitta, NULL AS broker\_anomaly\_score` (or compute ticket size from `floorsheet\_contracts` when available) so callers never mistake missing metrics for `0`. |

| `A1-007` | \*\*P0\*\* | `proxy/db/signalTrackerStore.js` (`rebuildSignalTrackRecord`) | 1) `peakPrice` is updated on Day T+1 and T+2 while shares are legally locked under CDSC T+2 settlement, and `OPEN\_ACTIVE` resolution marks trades as `WIN\_T1` at `target1Price` whenever `peakPrice >= target1Price`—even if the stock crashed before T+2 unlock. 2) Exit loop checks `fwdHigh >= target2Price` before stops and never checks intraday `fwdLow <= stopLossPrice`. 3) Pending Day-T signals with no T+1 session compute a fake `-0.71%` net loss. | Backtest/track-record win rate, MFE, and profit factor are artificially inflated by impossible T+1/T+2 exits and ignored intraday stop-outs, misleading capital allocation. | Update `peakPrice` only when `j >= entryIdx + 2`, evaluate `fwdLow <= activeStopPrice` before targets (filling at `Math.min(fwdOpen, activeStopPrice)` on gap-downs), and keep unentered `entryIdx >= dates.length` signals at `0%` PnL. |

| `A1-008` | \*\*P0\*\* | `proxy/legacy\_next\_api/signals/track-record/route.ts` (`GET`) | 1) `live5DNetAccumulationPct` computes `(sum(positiveNetKitta) \* 2) / totalScripVol \* 100`. In a zero-sum market, `sum(positiveNet) === abs(sum(negativeNet))`, so a 100% single-broker dump into retail buyers yields \*\*100% `STRONG\_ACCUMULATION\*\*`. 2) Self-trades double-count `turnover` and `trades`. 3) Reads non-existent `nepse\_return\_pct`/`benchmark\_return\_pct` (actual column: `nepse\_index\_return\_pct`), hardcoding `0.45%` benchmark return. 4) Marks `OPEN` signals with `netReturnPct >= 4.0` as `CLOSED\_WIN`, defaults missing broker to `#28`, and defaults non-signal scrips to `won: true` in leaderboard win rates. | Investors buy into institutional dumps mislabeled `STRONG\_ACCUMULATION`, see fabricated Alpha (against hardcoded `0.45%`), fake Broker `#28` attribution, and inflated win rates. | Compute directional net concentration `(top5NetBuy - top3NetSell) / marketVol`, guard `!isSelfTrade` on seller side, read `row.nepse\_index\_return\_pct`, preserve `OPEN\_\*` statuses, remove fabricated `#28`/`0.45`/`won: true` fallbacks, and exclude `OPEN`/`UNFILLABLE\_SKIP` from `verifiedWinRatePct`. |

| `A1-009` | \*\*P0\*\* | `proxy/legacy\_next\_api/floorsheet/hub/route.ts` \& `proxy/legacy\_next\_api/stocks/\[symbol]/telemetry/route.ts` (`GET`) | 1) When `floorsheet\_contracts` is empty, both routes synthesize fake contracts assigning Broker `#58` as buyer and Broker `#45` as seller (with hardcoded `rate = 500` fallback), doubling total volume and fabricating whale/broker footprints. 2) In `hub/route.ts`, self-trades add to both `buyKitta` and `sellKitta` while incrementing `trades` once, inflating `avgTicket` by 2x and distorting `anomalyScore`. | Investors see completely fabricated Broker `#58` buying / `#45` selling activity and inflated whale scores whenever tick data is absent or self-trades occur. | Return empty `contracts: \[]` with `source: 'EMPTY'` (or aggregate broker summary directly without fabricating counterparty brokers `#58`/`#45`), and compute `avgTicket` from `buyKitta + sellKitta` divided by total sides (`2` for self-trades) or single-side volume. |

| `A1-010` | \*\*P0\*\* | `proxy/legacy\_next\_api/ai-guru/assess/route.ts` (`buildDeterministicInstitutionalAnalysis`) | Unit mismatch: `const ratchetCleared = m.mfePct >= 1.2` treats `1.2%` MFE as `+1.2R` (which is `1.2 \* riskPct`, typically `+6.0%`, corresponding to `ratchetTriggerPrice`). | Tells investors the +1.2R trailing stop is armed after a trivial +1.2% move, causing premature stop-tightening and whipsaw losses. | Compare against `m.ratchetTriggerPrice` / R-multiple: `const ratchetCleared = Boolean(m.ratchetTriggered) || (m.verifiedPrice >= m.ratchetTriggerPrice \&\& m.ratchetTriggerPrice > 0)`. |

| `A1-011` | \*\*P0\*\* | `proxy/routes/radarRoutes.js` (`evaluatePortfolioShield`) | When a portfolio symbol is missing from `daily\_stock\_summary`, `ltp` defaults to `0`, producing `userProfitLossPct = -100.00%`, `positionValue = 0`, and `unrealizedPnL = -buyPrice \* qty` added into `totalPortfolioPnL`. | A single newly listed or illiquid scrip in a portfolio triggers a fake `-100%` wipeout in total P\&L and corrupts portfolio valuation. | Guard `ltp > 0` before computing `userProfitLossPct`, `unrealizedPnL`, and `positionValue`; return `null` and flag `priceUnavailable: true` when `ltp <= 0`. |

| `A1-012` | \*\*P0\*\* | `proxy/ipoHelper.js` (`getLiveIpoListings`, `loadSebonFallback`) \& `proxy/meroshare.js` (`GET /ipos`) | 1) Hardcoded `isBeni` branch forces `closeDate = '2026-09-11'` and `status = isBefore5pmNpt ? 'Open' : 'Closed'` regardless of actual date (today is 2026-11-22). 2) On scraper failure, loads static `src/data/sebonPipelineData.json` (LastWrite `2026-09-07`) and caches it in `ipoCache` with `lastCacheTime = now`, blocking live recovery for 15 minutes; `meroshare.js` wraps it as `source: 'live-listings'` without exposing `isStale`/`asOf`. | Closed IPOs (`BENI`) display as `Open` daily before 5 PM NPT; stale Sept-2026 static JSON masquerades as live IPO listings for 15 minutes without a top-level staleness timestamp. | Remove the hardcoded `isBeni` override, never persist stale fallback data into `ipoCache` with a fresh TTL, and expose top-level `isStale` + `asOf` metadata in `meroshare.js`. |

| `A1-013` | \*\*P0\*\* | `proxy/meroshare.js` (`POST /check-result`) | `const isAllotted = data?.success === true || (msgStr.includes('allotted') \&\& !msgStr.includes('not'))` short-circuits to `'allotted'` when CDSC returns `{ success: true, message: "Sorry, not allotted..." }`, then extracts an arbitrary number or defaults to `10` units. | Investors who were NOT allotted shares are falsely notified "Congratulations! Allotted 10 Units", distorting portfolio holdings and sell plans. | Check explicit negative phrases (`not allotted`, `sorry`) first before checking `data?.success === true`, and parse units only from an allotment-specific regex. |

| `A1-014` | \*\*P0\*\* | `src/constants/marketRules.js` (`calculateRoundTripNetReturn`) | `totalBuyCost` includes `buyDpFee` (Rs. 25) and `netSellProceedsBeforeTax` subtracts `dpFee` (Rs. 25), but `totalFrictionNpr` omits `buyDpFee`, understating total friction by Rs. 25 on every round-trip calculation. | Breakeven, fee drag, and PnL reconciliation checks disagree by Rs. 25 per trade across calculators and backtests. | Include `buyDpFee` in `totalFrictionNpr` and remove the dead `totalFriction` variable. |

| `A1-015` | \*\*P0\*\* | `src/App.jsx` (`AppInner`, `fetchMarket`, `triggerTick`, Capacitor resume listener) | 1) `lastSyncTime` initializes to `new Date()` (never using imported `getLastMarketSyncTime()`) and Capacitor resume sets `new Date()` before `triggerTick()` succeeds, displaying stale cached/offline prices as `Updated: <now> NPT`. 2) `triggerTick` falls back to hardcoded legacy `2629.82` for NEPSE `prevClose` and placeholder detection. 3) `fetchMarket` sets `apiStatus = 'live'` during market hours even when live feed fails and returns stale data. | Investors viewing cached/offline quotes see the current clock time as "Updated" and a live badge, plus corrupted NEPSE daily point/percent change if `prevClose` is missing. | Initialize `lastSyncTime` from `getLastMarketSyncTime() || null`, update it only on verified fresh responses, remove hardcoded `2629.82`, and set `apiStatus = 'stale'` when market is open but `isFreshFeed` is false. |

| `A1-016` | \*\*P0\*\* | `migrations/004\_upgrade\_fundamentals\_and\_lockin.sql` (`scrip\_fundamentals`, `scrip\_corporate\_actions`) | `scrip\_fundamentals` defaults missing fundamentals to fabricated numbers (`eps\_ttm = 0`, `book\_value\_per\_share = 100`, `promoter\_share\_pct = 51.0`, `public\_share\_pct = 49.0`, `roe\_pct = 0`) instead of `NULL`. `scrip\_corporate\_actions` lacks a `UNIQUE` constraint, allowing duplicate dividend/bonus rows on re-import. | Missing company filings silently render as `BVPS = 100`, `EPS = 0`, `51/49` promoter split (distorting Graham Number, P/B, and float), while duplicate corporate actions double-count dividend yields. | Change missing numeric defaults in `scrip\_fundamentals` to `NULL` and add `UNIQUE(symbol, fiscal\_year, book\_close\_date)` on `scrip\_corporate\_actions`. |

| `A1-017` | \*\*P1\*\* | `proxy/routes/radarRoutes.js` (`ensureHotCacheReady`, `POST /radar/ingest`, `handleRebuildCache`) \& `proxy/db/ledgerStore.js` (`backfillRealHistoricalFloorsheets`) | `rebuildHotCache()` is `async` (yields via `setImmediate`), yet all 4 callers invoke it without `await`. `ensureHotCacheReady()` reads empty `HOT\_CACHE` immediately; `handleRebuildCache()` serializes a `Promise` as `success: {}`; backfill fires overlapping concurrent rebuilds. | Cold starts return empty Radar/Diagnostics arrays (`0` stocks); post-ingest responses report stale dates; concurrent rebuilds cause memory spikes and race conditions on 512 MB Render containers. | `await rebuildHotCache()` at all 4 call sites and guard with a single in-flight mutex promise in `ledgerStore.js`. |

| `A1-018` | \*\*P1\*\* | `proxy/routes/radarRoutes.js` (`GET /radar/broker-tracker`, `computeCapitalRotations`) \& `proxy/db/ledgerStore.js` (`HotDiagnosticCache`) | `HotDiagnosticCache` evicts at 120 entries while `/radar/broker-tracker` and `computeCapitalRotations` iterate \~250 symbols twice, calling `stockDiagnostics.get()` on every symbol. This causes 100% LRU thrashing (\~960 synchronous SQLite queries + \~480 full diagnostic recomputations per HTTP request). | Main Node.js event loop freezes for seconds per request, triggering `SQLITE\_BUSY` timeouts against live market ingestion and 502 timeouts for users. | Read `topAccumulators`/`topDistributors` directly from `HOT\_CACHE.radarByTimeframe\[validDays]` in `computeCapitalRotations` and avoid triggering `HotDiagnosticCache` SQLite misses on full-universe scans (use `Map.prototype.get.call` or pre-summarized radar fields). |

| `A1-019` | \*\*P1\*\* | `proxy/routes/radarRoutes.js` (`handleSignalTrackRecord`) | Public, unauthenticated `GET /api/signals/track-record?force=true` passes `{ force: true }` to `rebuildSignalTrackRecord`, bypassing the Render 512 MB RSS memory guard and executing a synchronous `DELETE` + 500k-row SQLite scan/rebuild on every request. | Any user or crawler hitting `?force=true` during market hours locks SQLite for writes and OOM-crashes the production Render proxy. | Restrict `forceRebuild` to authenticated admin requests via `isValidAdminRequest(req)`. |

| `A1-020` | \*\*P1\*\* | `proxy/db/ledgerStore.js` (`auditAntiDematDumpGuard`) | When called intraday with live `floorsheetTrades`, `daily\_broker\_ledger` does not contain today's session yet—`recentDates\[0]` is yesterday. `recentDates.slice(1, 4)` skips `recentDates\[0]`, ignoring yesterday's top accumulators. | Fails to veto T+2 / next-day Demat dump traps initiated by brokers who accumulated heavily during the previous session. | Use `recentDates.slice(0, 3)` when live intraday `floorsheetTrades` are supplied, and `recentDates.slice(1, 4)` only when reading today's session from `recentDates\[0]` in SQLite. |

| `A1-021` | \*\*P1\*\* | `proxy/scripts/rebuildSignalTrackRecord.ts` (`rebuildSignalTrackRecord`) | 1) `INSERT` omits `NOT NULL` columns (`signal\_type`, `entry\_price`, `target1\_price`, `target2\_price`, `stop\_loss\_price`, `t2\_unlock\_date`) created by `signalTrackerStore.js`, throwing `SQLITE\_CONSTRAINT\_NOTNULL`. 2) Uses obsolete `9.6%` circuit filter instead of `14.9%`. 3) Unguarded division by `candles\[t-3].close`, `candles\[t-20].nepseIndexClose`, and `dayTPlus1.nepseIndexClose` yields `NaN`/`Infinity`. 4) Stop-loss fills ignore gap-down opens (`c.open < activeStopPrice`). | Signal rebuild script crashes against production SQLite, misclassifies valid +10%–14.8% breakouts as unfillable skips, propagates `NaN`, and hides gap-down slippage. | Populate all `NOT NULL` columns in the `INSERT`, update circuit threshold to `14.9%`, guard all denominators `> 0`, and fill stops at `Math.min(c.open, activeStopPrice)`. |

| `A1-022` | \*\*P1\*\* | `proxy/meroshare.js` (`decryptAccount`, `saveAccounts`, `primeSession`, `POST /accounts`, `POST /apply`) | 1) `decryptAccount` ignores `failed: true` and passes raw ciphertext as password to CDSC (locking out investor accounts after repeated bad logins). 2) `saveAccounts` uses non-atomic `fs.writeFileSync`. 3) `primeSession` checks cookies on wrong host (`backend.cdsc.com.np` vs `webbackend.cdsc.com.np`). 4) `POST /accounts` crashes (`500`) if `boid` is undefined (`boid.length`). 5) `POST /apply` ignores `valResult.sanitizedPayload.boid` (8-digit) and sends 16-digit `acc.boid`. | MeroShare bulk IPO apply can lock out investor CDSC accounts on key rotation, corrupt `meroshare\_accounts.json` on crash, crash on malformed input, or fail C-ASBA submission. | Throw explicit decryption error when `failed === true`, write via `.tmp` + `fs.renameSync`, check cookies on `webbackend.cdsc.com.np`, validate `typeof boid === 'string'`, and merge `valResult.sanitizedPayload`. |

| `A1-023` | \*\*P1\*\* | `src/App.jsx` (`tickFastIndex` listeners \& `btn-cloud-sync-now`) | 1) `visibilitychange` and `focus` listeners invoke `tickFastIndex()` without clearing `tickerTimer`, spawning duplicate concurrent 1.5s polling loops on every tab switch. 2) Manual Cloud Sync reads/writes plaintext `localStorage` instead of `loadEncryptedUserProfiles` and uploads unsanitized `password`/`crn`/`pin` to cloud. | Browser tab switching multiplies `/live-index` polling into a self-DDoS (429 rate limits \& stale UI race); manual Cloud Sync leaks plaintext MeroShare credentials to cloud storage. | Clear `tickerTimer` before calling `tickFastIndex()` in visibility/focus handlers (with in-flight guard); use `loadEncryptedUserProfiles`/`saveEncryptedUserProfiles` and strip secrets before `syncUserDataToCloud`. |

| `A1-024` | \*\*P1\*\* | `proxy/utils/microstructureEngine.js` (`detectCycleStartDate`) | Computes `streakDays = oldestFirst.length - startIdx` (total elapsed sessions since cumulative trough), even if the broker was net-selling in the most recent consecutive sessions. | Reports multi-day "accumulation streaks" on brokers that have already flipped to dumping over the last 2–4 sessions. | Compute `streakDays` as the contiguous trailing run of sessions matching `direction` from the latest date backward. |

| `A1-025` | \*\*P2\*\* | `proxy/scrapeIpo.js` \& `proxy/scrapeNames.js` | Use CommonJS `require()` inside an ESM project (`"type": "module"`) and omit `timeout` on `axios.get()`. | Helper scraper scripts crash immediately with `ReferenceError: require is not defined` or hang indefinitely on network stalls. | Convert `require()` to ESM `import` and add `timeout: 15000` to `axios.get()`. |

| `A1-026` | \*\*P2\*\* | `proxy/migrations/001\_prediction\_engine.sql` (`news\_sentiment`, `corporate\_actions`, `stock\_scores`) | 1) `UNIQUE(source, headline, published\_at)` permits duplicate rows whenever `published\_at IS NULL`. 2) `corporate\_actions` lacks a `UNIQUE` constraint. 3) `stock\_scores.volume\_surge\_ratio NUMERIC(6,3)` overflows (`> 999.999`) on thin NEPSE stocks. | Duplicate news headlines skew sentiment scores; duplicate corporate actions double-trigger catalysts; >1000x volume spikes abort the PostgreSQL scoring batch. | Use `UNIQUE NULLS NOT DISTINCT` (or partial unique index) on `news\_sentiment`, add `UNIQUE(symbol, action\_type, announced\_date)` on `corporate\_actions`, and widen `volume\_surge\_ratio` to `NUMERIC(10,3)`. |

| `A1-027` | \*\*P2\*\* | `proxy/legacy\_next\_api/floorsheet/hub/route.ts` (`GET`) | When `requestedDate` has no rows in `floorsheet\_contracts`, the fallback branch ignores `requestedDate` and queries `MAX(trade\_date)`. | Selecting a historical date without tick contracts silently renders a different session's data. | Query `requestedDate` explicitly (if provided) rather than unconditionally substituting `MAX(trade\_date)`. |

| `A1-028` | \*\*P2\*\* | `migrations/003\_upgrade\_floorsheet\_hub.sql` \& `proxy/db/ledgerStore.js` (`v\_scrip\_volume\_profile\_5d`, `isWhale`) | Whale threshold diverges between SQL migration/`track-record/route.ts` (`>= 500 kitta || >= 500,000 NPR`) and `ledgerStore.js`/`hub/route.ts` (`>= 200 kitta || >= 100,000 NPR`). Also `v\_scrip\_volume\_profile\_5d` does not exclude `is\_quarantined = 1` or `calendar\_status = 'PARTIAL\_SESSION'`. | Whale print counts disagree across Floorsheet Hub vs Signal Track Record; quarantined/partial sessions leak into 5D POC volume profiles. | Standardize whale thresholds via one shared constant and add `AND COALESCE(is\_quarantined, 0) = 0 AND COALESCE(calendar\_status, 'VALID') != 'PARTIAL\_SESSION'` to `v\_scrip\_volume\_profile\_5d`. |

| `A1-029` | \*\*P2\*\* | `src/constants/marketRules.js` (`getMarketRulesAuditInventory`) | Audit inventory text lists obsolete `'Index Two/Three-Tier Circuit Breakers (4%, 5%, 6%)'` instead of `CIRCUIT\_LIMITS`'s verified `5.0% / 8.0%` Fourth Amendment Bylaws 2082 thresholds. | Compliance/audit UI displays outdated circuit breaker percentages contradicting the calculation engine. | Update the inventory label to `'Index Two-Tier Circuit Breakers (5%, 8%)'`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 \& P1 Bugs Only)



\#### `A1-001` — `cloudflare/worker.js`



```diff

\--- a/cloudflare/worker.js

+++ b/cloudflare/worker.js

@@ -47,13 +47,33 @@

&#x20;  };

&#x20;}

&#x20;

+function getNptTimeInfo() {

\+  const now = new Date();

\+  const nptOffset = (5 \* 60 + 45) \* 60 \* 1000;

\+  const npt = new Date(now.getTime() + nptOffset);

\+  const day = npt.getUTCDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat

\+  const mins = npt.getUTCHours() \* 60 + npt.getUTCMinutes();

\+  const secs = npt.getUTCSeconds();

\+  return { day, mins, secs };

+}

\+

&#x20;function isNepseTradingHours() {

\-  const now = new Date();

\-  const nptOffset = (5 \* 60 + 45) \* 60 \* 1000;

\-  const npt = new Date(now.getTime() + nptOffset);

\-  const day = npt.getUTCDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat

\-  // Mon to Fri (April 2026 regime)

\+  const { day, mins } = getNptTimeInfo();

\+  // Mon to Fri (April 2026 regime): include Pre-Open (10:30) through Odd-Lot close (15:05)

&#x20;  if (day === 0 || day === 6) return false;

\-  const mins = npt.getUTCHours() \* 60 + npt.getUTCMinutes();

\-  return mins >= 660 \&\& mins <= 900; // 11:00 AM (660) to 3:00 PM (900)

\+  return mins >= 630 \&\& mins <= 905;

+}

\+

+function secondsUntilNextPreOpen() {

\+  const { day, mins, secs } = getNptTimeInfo();

\+  const isWeekday = day >= 1 \&\& day <= 5;

\+  if (isWeekday \&\& mins < 630) {

\+    return Math.max(5, (630 - mins) \* 60 - secs);

\+  }

\+  let daysAhead = 1;

\+  while (((day + daysAhead) % 7) === 0 || ((day + daysAhead) % 7) === 6) {

\+    daysAhead++;

\+  }

\+  const secsLeftToday = (24 \* 60 - mins) \* 60 - secs;

\+  return Math.max(5, secsLeftToday + (daysAhead - 1) \* 86400 + 630 \* 60);

&#x20;}

&#x20;

&#x20;function getCacheTtlSeconds(pathname) {

@@ -71,6 +91,7 @@

&#x20;  }

&#x20;

&#x20;  const isLive = isNepseTradingHours();

\+  const maxOffHoursTtl = isLive ? Infinity : secondsUntilNextPreOpen();

&#x20;

&#x20;  // 2. High-frequency live endpoints

&#x20;  if (

@@ -80,7 +101,7 @@

&#x20;    pathname.includes('/live-index') ||

&#x20;    pathname.includes('/intraday-graph')

&#x20;  ) {

\-    return isLive ? 3 : 1800; // 3 sec during market, 30 min off-hours

\+    return isLive ? 3 : Math.min(1800, maxOffHoursTtl);

&#x20;  }

&#x20;

&#x20;  // 3. Historical, ledger, dividend, fundamentals, analytics

@@ -93,7 +114,7 @@

&#x20;    pathname.includes('/news') ||

&#x20;    pathname.includes('/seasonality')

&#x20;  ) {

\-    return isLive ? 300 : 86400; // 5 min during market, 24 hours off-hours

\+    return isLive ? 300 : Math.min(86400, maxOffHoursTtl);

&#x20;  }

&#x20;

&#x20;  // 4. Health checks \& ping

@@ -101,7 +122,7 @@

&#x20;    return 10;

&#x20;  }

&#x20;

\-  return isLive ? 10 : 3600;

\+  return isLive ? 10 : Math.min(3600, maxOffHoursTtl);

&#x20;}

&#x20;

&#x20;export default {

@@ -152,20 +173,10 @@

&#x20;        method: request.method,

&#x20;        headers: originHeaders,

&#x20;        body: \['GET', 'HEAD'].includes(request.method) ? undefined : request.body,

\-        redirect: 'follow'

\+        redirect: 'follow',

\+        signal: AbortSignal.timeout(12000)

&#x20;      });

&#x20;    } catch (err) {

\-      // Cold-Start Shield / Error Handling

\-      // If Render is down or cold-booting and we have an expired cached response, return it

\-      if (isCacheable) {

\-        const stale = await cache.match(cacheKey);

\-        if (stale) {

\-          const sHeaders = new Headers(stale.headers);

\-          Object.entries(corsHeaders).forEach((\[k, v]) => sHeaders.set(k, v));

\-          sHeaders.set('X-Edge-Cache', 'STALE-FALLBACK');

\-          return new Response(stale.body, { status: 200, headers: sHeaders });

\-        }

\-      }

\-

&#x20;      return new Response(

&#x20;        JSON.stringify({

&#x20;          error: 'Backend gateway waking up. Please retry in a few seconds.',

@@ -188,10 +199,11 @@

&#x20;    Object.entries(corsHeaders).forEach((\[k, v]) => responseHeaders.set(k, v));

&#x20;    responseHeaders.set('X-Edge-Cache', 'MISS');

&#x20;    responseHeaders.set('X-Edge-Node', 'Cloudflare-CDN');

\+    responseHeaders.set('X-Data-Cached-At', new Date().toISOString());

&#x20;

&#x20;    // If cacheable, store into Cloudflare Edge Cache

&#x20;    if (isCacheable \&\& originResponse.status === 200) {

&#x20;      responseHeaders.set(

&#x20;        'Cache-Control',

\-        `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}, stale-while-revalidate=60`

\+        `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}`

&#x20;      );



```



\---



\#### `A1-002` — `proxy/lib/db/drabyashreeDb.ts`



```diff

\--- a/proxy/lib/db/drabyashreeDb.ts

+++ b/proxy/lib/db/drabyashreeDb.ts

@@ -17,15 +17,22 @@

&#x20;

&#x20;export function getDrabyashreeDb(): Database.Database {

&#x20;  if (!globalForSqlite.drabyashreeDb) {

\+    const envDataDir = process.env.NEPSE\_DATA\_DIR || process.env.RENDER\_DISK\_PATH;

\+    const envDirPath = envDataDir ? path.join(envDataDir, "drabyashree\_ledger.db") : null;

&#x20;    const defaultProxyPath = path.join(process.cwd(), "proxy", "data", "drabyashree\_ledger.db");

&#x20;    const defaultRootPath = path.join(process.cwd(), "drabyashree\_ledger.db");

&#x20;    const dbPath =

&#x20;      process.env.DRABYASHREE\_DB\_PATH ||

\+      (envDirPath \&\& fs.existsSync(envDataDir!) ? envDirPath : null) ||

&#x20;      (fs.existsSync(defaultProxyPath) ? defaultProxyPath : defaultRootPath);

&#x20;

\-    const db = new Database(dbPath, { fileMustExist: false });

\+    const db = new Database(dbPath, { fileMustExist: false, timeout: 10000 });

&#x20;    db.pragma("journal\_mode = WAL");

&#x20;    db.pragma("synchronous = NORMAL");

\+    db.pragma("busy\_timeout = 10000");

&#x20;    db.pragma("foreign\_keys = ON");

&#x20;    globalForSqlite.drabyashreeDb = db;

&#x20;  }

&#x20;  return globalForSqlite.drabyashreeDb;

&#x20;}

\+

+function getTableColumns(db: Database.Database, table: string): Set<string> {

\+  try {

\+    return new Set(

\+      (db.prepare(`PRAGMA table\_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)

\+    );

\+  } catch {

\+    return new Set();

\+  }

+}

\+

+function buildSignalSelectSql(db: Database.Database, signalTable: string): string {

\+  const cols = getTableColumns(db, signalTable);

\+  const pick = (candidates: string\[], fallback: string) => {

\+    const existing = candidates.filter((c) => cols.has(c));

\+    if (existing.length === 0) return fallback;

\+    return existing.length === 1 ? existing\[0] : `COALESCE(${existing.join(", ")}, ${fallback})`;

\+  };

\+  return `SELECT

\+    symbol,

\+    ${pick(\["strategy\_name", "strategy", "signal\_type"], "'UNKNOWN'")} AS strategy\_name,

\+    ${pick(\["entry\_vwap", "broker\_vwap", "entry\_price"], "0")} AS entry\_vwap,

\+    ${pick(\["settlement\_unlock\_date", "t2\_unlock\_date"], "'POST\_DASHAIN\_T2'")} AS settlement\_unlock\_date,

\+    ${pick(\["mfe\_pct", "max\_gain\_pct"], "0")} AS mfe\_pct,

\+    ${pick(\["mae\_pct"], "0")} AS mae\_pct,

\+    ${pick(\["nepse\_alpha\_pct"], "0")} AS nepse\_alpha\_pct,

\+    ${pick(\["broker\_anomaly\_score"], "1.0")} AS broker\_anomaly\_score,

\+    ${pick(\["avg\_ticket\_kitta"], "0")} AS avg\_ticket\_kitta,

\+    ${pick(\["ratchet\_triggered", "is\_ratchet\_armed"], "0")} AS ratchet\_triggered,

\+    status

\+  FROM ${signalTable}

\+  WHERE UPPER(symbol) = ?

\+  ORDER BY ${cols.has("signal\_date") ? "signal\_date DESC, rowid DESC" : "rowid DESC"}

\+  LIMIT 1`;

+}

@@ -54,24 +87,7 @@

&#x20;  if (!signalTable) return null;

&#x20;  try {

&#x20;    return (

\-      (db

\-        .prepare(

\-          `SELECT

\-            symbol,

\-            COALESCE(strategy\_name, strategy) AS strategy\_name,

\-            COALESCE(entry\_vwap, broker\_vwap, entry\_price, 0) AS entry\_vwap,

\-            COALESCE(settlement\_unlock\_date, t2\_unlock\_date, 'POST\_DASHAIN\_T2') AS settlement\_unlock\_date,

\-            COALESCE(mfe\_pct, max\_gain\_pct, 0) AS mfe\_pct,

\-            COALESCE(mae\_pct, 0) AS mae\_pct,

\-            COALESCE(nepse\_alpha\_pct, 0) AS nepse\_alpha\_pct,

\-            COALESCE(broker\_anomaly\_score, 1.0) AS broker\_anomaly\_score,

\-            COALESCE(avg\_ticket\_kitta, 0) AS avg\_ticket\_kitta,

\-            COALESCE(ratchet\_triggered, is\_ratchet\_armed, 0) AS ratchet\_triggered,

\-            status

\-          FROM ${signalTable}

\-          WHERE UPPER(symbol) = ?

\-          ORDER BY rowid DESC

\-          LIMIT 1`

\-        )

\-        .get(symbol) as LedgerTelemetryRow) || null

\+      (db.prepare(buildSignalSelectSql(db, signalTable)).get(symbol) as LedgerTelemetryRow) || null

&#x20;    );

&#x20;  } catch {

&#x20;    return null;

@@ -162,25 +178,7 @@

&#x20;  if (signalTable) {

&#x20;    try {

&#x20;      ledgerTelemetry =

\-        (db

\-          .prepare(

\-            `SELECT

\-              symbol,

\-              COALESCE(strategy\_name, strategy) AS strategy\_name,

\-              COALESCE(entry\_vwap, broker\_vwap, entry\_price, 0) AS entry\_vwap,

\-              COALESCE(settlement\_unlock\_date, t2\_unlock\_date, 'POST\_DASHAIN\_T2') AS settlement\_unlock\_date,

\-              COALESCE(mfe\_pct, max\_gain\_pct, 0) AS mfe\_pct,

\-              COALESCE(mae\_pct, 0) AS mae\_pct,

\-              COALESCE(nepse\_alpha\_pct, 0) AS nepse\_alpha\_pct,

\-              COALESCE(broker\_anomaly\_score, 1.0) AS broker\_anomaly\_score,

\-              COALESCE(avg\_ticket\_kitta, 0) AS avg\_ticket\_kitta,

\-              COALESCE(ratchet\_triggered, is\_ratchet\_armed, 0) AS ratchet\_triggered,

\-              status

\-            FROM ${signalTable}

\-            WHERE UPPER(symbol) = ?

\-            ORDER BY rowid DESC

\-            LIMIT 1`

\-          )

\-          .get(symbol) as LedgerTelemetryRow) || null;

\+        (db.prepare(buildSignalSelectSql(db, signalTable)).get(symbol) as LedgerTelemetryRow) || null;

&#x20;    } catch {

&#x20;      ledgerTelemetry = null;

&#x20;    }

@@ -196,26 +194,25 @@

&#x20;  if (candleTable) {

&#x20;    try {

\+      const cCols = getTableColumns(db, candleTable);

\+      const dCol = cCols.has("trade\_date") ? "trade\_date" : "date";

\+      const oCol = cCols.has("open\_price") ? "open\_price" : "open";

\+      const hCol = cCols.has("high\_price") ? "high\_price" : "high";

\+      const lCol = cCols.has("low\_price") ? "low\_price" : "low";

\+      const clCol = cCols.has("close\_price") ? "close\_price" : "close";

\+      const vCol = cCols.has("total\_volume") ? "total\_volume" : "volume";

\+      const tCol = cCols.has("total\_turnover") ? "total\_turnover" : (cCols.has("turnover") ? "turnover" : null);

\+      const vwapExpr = tCol

\+        ? `CASE WHEN COALESCE(${vCol}, 0) > 0 THEN (${tCol} / ${vCol}) ELSE COALESCE(${clCol}, 0) END`

\+        : (cCols.has("vwap") ? "COALESCE(vwap, " + clCol + ", 0)" : `COALESCE(${clCol}, 0)`);

&#x20;      candles =

&#x20;        (db

&#x20;          .prepare(

&#x20;            `SELECT

\-              COALESCE(trade\_date, date) AS date,

\-              COALESCE(open\_price, open) AS open,

\-              COALESCE(high\_price, high) AS high,

\-              COALESCE(low\_price, low) AS low,

\-              COALESCE(close\_price, close) AS close,

\-              COALESCE(total\_volume, volume) AS volume,

\-              CASE

\-                WHEN COALESCE(total\_volume, volume, 0) > 0

\-                THEN (COALESCE(total\_turnover, turnover, 0) / COALESCE(total\_volume, volume, 1))

\-                ELSE COALESCE(close\_price, close, 0)

\-              END AS vwap

\+              ${dCol} AS date,

\+              ${oCol} AS open,

\+              ${hCol} AS high,

\+              ${lCol} AS low,

\+              ${clCol} AS close,

\+              ${vCol} AS volume,

\+              ${vwapExpr} AS vwap

&#x20;            FROM ${candleTable}

&#x20;            WHERE UPPER(symbol) = ?

\-            ORDER BY COALESCE(trade\_date, date) DESC

\+            ORDER BY ${dCol} DESC

&#x20;            LIMIT 35`

&#x20;          )

&#x20;          .all(symbol) as HistoricalCandle\[]) || \[];



```



\---



\#### `A1-003`, `A1-004`, `A1-005`, `A1-006`, `A1-017`, `A1-020` — `proxy/db/ledgerStore.js`



```diff

\--- a/proxy/db/ledgerStore.js

+++ b/proxy/db/ledgerStore.js

@@ -177,8 +177,8 @@

&#x20;    ROUND(buy\_amt / NULLIF(buy\_vol, 0), 2) AS avg\_buy\_price,

&#x20;    ROUND(sell\_amt / NULLIF(sell\_vol, 0), 2) AS avg\_sell\_price,

&#x20;    ROUND((buy\_amt + sell\_amt) / NULLIF(buy\_vol + sell\_vol, 0), 2) AS vwap,

\-    0 AS avg\_ticket\_kitta,

\-    0 AS broker\_anomaly\_score

\+    NULL AS avg\_ticket\_kitta,

\+    NULL AS broker\_anomaly\_score

&#x20;  FROM daily\_broker\_ledger;

&#x20;

&#x20;  -- 5. Daily Data Ingestion \& Completeness Audit Log

@@ -435,7 +435,7 @@

&#x20;    const buyer = parseBrokerInt(trade.buyerMemberId ?? trade.buyerBroker ?? trade.buyer\_broker ?? trade.buyer);

&#x20;    const seller = parseBrokerInt(trade.sellerMemberId ?? trade.sellerBroker ?? trade.seller\_broker ?? trade.seller);

&#x20;

\-    if (qty <= 0 || (!buyer \&\& !seller)) continue;

\+    if (qty <= 0 || buyer <= 0 || seller <= 0) continue;

&#x20;    pureEquityTrades.push({ ...trade, contractId: cid || undefined, amount: amt, rate, kitta: qty });

&#x20;

&#x20;    let s = stockAggMap.get(symbol);

@@ -510,28 +510,16 @@

&#x20;      cross\_vol = excluded.cross\_vol

&#x20;  `);

&#x20;

\+  const deletePriorBrokers = db.prepare(`

\+    DELETE FROM daily\_broker\_ledger WHERE trade\_date = ? AND symbol = ?

\+  `);

\+

&#x20;  let count = 0;

&#x20;  for (const \[symbol, data] of stockAggMap.entries()) {

\-    // Enforce strict Zero-Sum Conservation Law: sum(buy\_vol) === sum(sell\_vol) === total\_volume

\-    if (data.buyVolSum !== data.sellVolSum) {

\-      const resBroker = data.brokers.get(999) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0 };

\-      if (data.buyVolSum > data.sellVolSum) {

\-        resBroker.sellVol += data.buyVolSum - data.sellVolSum;

\-        resBroker.sellAmt += Math.max(0, data.buyAmtSum - data.sellAmtSum);

\-        data.sellVolSum = data.buyVolSum;

\-        data.sellAmtSum = Math.max(data.buyAmtSum, data.sellAmtSum);

\-      } else {

\-        resBroker.buyVol += data.sellVolSum - data.buyVolSum;

\-        resBroker.buyAmt += Math.max(0, data.sellAmtSum - data.buyAmtSum);

\-        data.buyVolSum = data.sellVolSum;

\-        data.buyAmtSum = Math.max(data.buyAmtSum, data.sellAmtSum);

\-      }

\-      data.brokers.set(999, resBroker);

\-    }

\-

&#x20;    const conservedVolume = data.buyVolSum;

&#x20;    const conservedTurnover = Number(data.buyAmtSum.toFixed(2));

&#x20;

&#x20;    upsertStock.run(tradeDate, symbol, data.open, data.high, data.low, data.close, conservedVolume, conservedTurnover);

\+    deletePriorBrokers.run(tradeDate, symbol);

&#x20;    count++;

&#x20;    for (const \[brokerId, bData] of data.brokers.entries()) {

&#x20;      upsertBroker.run(tradeDate, symbol, brokerId, bData.buyVol, bData.sellVol, bData.buyAmt, bData.sellAmt, bData.crossVol || 0);

@@ -731,7 +719,7 @@

&#x20;        : Number((rawAmt > 0 ? rawAmt : expectedAmt).toFixed(2));

&#x20;

&#x20;      const rawCid = String(t.contractId ?? t.contract\_no ?? t.contractNo ?? "").trim();

\-      const cid = rawCid || `SYN-${date}-${sym}-${buyer}-${seller}-${qty}-${rate}-${idx + 1}`;

\+      const cid = rawCid || `SYN-${date}-${time}-${sym}-${buyer}-${seller}-${qty}-${rate}`;

&#x20;

&#x20;      if (seenContractIds.has(cid)) continue;

&#x20;      seenContractIds.add(cid);

@@ -918,8 +906,16 @@

&#x20;        const normalizedTempPath = tempDbPath.replace(/\\\\/g, "/");

&#x20;        try {

&#x20;          db.exec(`ATTACH DATABASE '${normalizedTempPath}' AS seed\_db;`);

\-          db.exec(`INSERT OR REPLACE INTO daily\_stock\_summary SELECT \* FROM seed\_db.daily\_stock\_summary;`);

\-          db.exec(`INSERT OR REPLACE INTO daily\_broker\_ledger SELECT \* FROM seed\_db.daily\_broker\_ledger;`);

\+          db.exec(`

\+            INSERT OR IGNORE INTO daily\_stock\_summary

\+              (trade\_date, symbol, open\_price, high\_price, low\_price, close\_price, total\_volume, total\_turnover)

\+            SELECT trade\_date, symbol, open\_price, high\_price, low\_price, close\_price, total\_volume, total\_turnover

\+            FROM seed\_db.daily\_stock\_summary;

\+          `);

\+          db.exec(`

\+            INSERT OR IGNORE INTO daily\_broker\_ledger

\+              (trade\_date, symbol, broker\_id, buy\_vol, sell\_vol, buy\_amt, sell\_amt)

\+            SELECT trade\_date, symbol, broker\_id, buy\_vol, sell\_vol, buy\_amt, sell\_amt

\+            FROM seed\_db.daily\_broker\_ledger;

\+          `);

&#x20;        } finally {

&#x20;          try { db.exec(`DETACH DATABASE seed\_db;`); } catch (\_) {}

&#x20;          try { fs.unlinkSync(tempDbPath); } catch (\_) {}

@@ -956,7 +952,7 @@

&#x20;

&#x20;    const restoreTx = db.transaction(() => {

&#x20;      const insertStock = db.prepare(`

\-        INSERT OR REPLACE INTO daily\_stock\_summary 

\+        INSERT OR IGNORE INTO daily\_stock\_summary 

&#x20;        (trade\_date, symbol, open\_price, high\_price, low\_price, close\_price, total\_volume, total\_turnover)

&#x20;        VALUES (?, ?, ?, ?, ?, ?, ?, ?)

&#x20;      `);

@@ -965,7 +961,7 @@

&#x20;      }

&#x20;

&#x20;      const insertBroker = db.prepare(`

\-        INSERT OR REPLACE INTO daily\_broker\_ledger 

\+        INSERT OR IGNORE INTO daily\_broker\_ledger 

&#x20;        (trade\_date, symbol, broker\_id, buy\_vol, sell\_vol, buy\_amt, sell\_amt, cross\_vol)

&#x20;        VALUES (?, ?, ?, ?, ?, ?, ?, ?)

&#x20;      `);

@@ -1012,6 +1008,7 @@

&#x20;        sellVol: row.sell\_vol,

&#x20;        buyAmt: row.buy\_amt,

&#x20;        sellAmt: row.sell\_amt,

\+        crossVol: row.cross\_vol || 0,

&#x20;      });

&#x20;    }

@@ -1122,7 +1119,7 @@

&#x20;  }

&#x20;

&#x20;  const allBrokers = db

\-    .prepare(`SELECT trade\_date, symbol, broker\_id, buy\_vol, sell\_vol, buy\_amt, sell\_amt FROM daily\_broker\_ledger WHERE trade\_date >= ?`)

\+    .prepare(`SELECT trade\_date, symbol, broker\_id, buy\_vol, sell\_vol, buy\_amt, sell\_amt, cross\_vol FROM daily\_broker\_ledger WHERE trade\_date >= ?`)

&#x20;    .all(oldestDate);

&#x20;  const brokersBySymDate = new Map();

&#x20;  for (let idx = 0; idx < allBrokers.length; idx++) {

@@ -1137,6 +1134,7 @@

&#x20;      sellVol: b.sell\_vol,

&#x20;      buyAmt: b.buy\_amt,

&#x20;      sellAmt: b.sell\_amt,

\+      crossVol: b.cross\_vol || 0,

&#x20;    });

&#x20;  }

@@ -1418,7 +1416,7 @@

&#x20;        console.log(`\[Real Backfill Pipeline] Ingested ${trades.length} authentic trades for ${dt} across ${count} stocks.`);

&#x20;        

&#x20;        // Progressively rebuild hot cache so 5D, 15D, 30D views update with real data immediately

\-        rebuildHotCache();

\+        await rebuildHotCache();

&#x20;      }

&#x20;

&#x20;      // Safe rate-limit delay between upstream requests

@@ -1712,8 +1710,9 @@

&#x20;      return { isTrap: false, reason: 'Insufficient historical sessions to evaluate demat dump' };

&#x20;    }

&#x20;

\-    // Prior 3 sessions (excluding today's latest session)

\-    const priorDates = recentDates.slice(1, 4);

\+    const hasLiveTrades = Array.isArray(floorsheetTrades) \&\& floorsheetTrades.length > 0;

\+    // If evaluating live intraday trades not yet persisted in daily\_broker\_ledger, include recentDates\[0] (yesterday)

\+    const priorDates = hasLiveTrades ? recentDates.slice(0, 3) : recentDates.slice(1, 4);

&#x20;    if (priorDates.length === 0) return { isTrap: false, reason: 'No prior sessions' };



```



\---



\#### `A1-007` (and `A1-003` cross\_vol) — `proxy/db/signalTrackerStore.js`



```diff

\--- a/proxy/db/signalTrackerStore.js

+++ b/proxy/db/signalTrackerStore.js

@@ -340,6 +340,7 @@

&#x20;      sellVol: b.sell\_vol,

&#x20;      buyAmt: b.buy\_amt,

&#x20;      sellAmt: b.sell\_amt,

\+      crossVol: b.cross\_vol || 0,

&#x20;      trades: b.buy\_trades || b.trade\_count || b.trades || null,

&#x20;    });

&#x20;  }

@@ -525,11 +526,11 @@

&#x20;          const fwdRec = symbolDateMap.get(`${symbol}\_${fwdDate}`);

&#x20;          if (!fwdRec) continue;

&#x20;

\+          const fwdOpen = fwdRec.openPrice || fwdRec.closePrice || entryPrice;

&#x20;          const fwdHigh = fwdRec.highPrice || fwdRec.closePrice || entryPrice;

&#x20;          const fwdLow = fwdRec.lowPrice || fwdRec.closePrice || entryPrice;

&#x20;          const fwdClose = fwdRec.closePrice || entryPrice;

\-          if (fwdHigh > peakPrice) peakPrice = fwdHigh;

&#x20;

&#x20;          // Track Adverse Excursion even during T+2 settlement lock

&#x20;          const dayDrawdownPct = Number((((fwdLow - entryPrice) / entryPrice) \* 100).toFixed(2));

@@ -539,6 +540,18 @@

&#x20;

&#x20;          // Invariant: Entry occurs at entryIdx = i + 1; T+2 Demat unlock requires >= 2 elapsed sessions after entry (j >= entryIdx + 2 === i + 3)

&#x20;          if (j >= entryIdx + 2) {

\+            if (fwdHigh > peakPrice) peakPrice = fwdHigh;

\+

\+            // Conservative stop-loss / ratchet check BEFORE targets (accounts for gap-down opens)

\+            if (fwdLow <= activeStopPrice) {

\+              exitPrice = Number(Math.min(fwdOpen, activeStopPrice).toFixed(2));

\+              const { netReturnPct: stopNet } = calculateNepseNetReturn(entryPrice, exitPrice);

\+              status = isRatchetArmed \&\& stopNet > 0 ? "WIN\_RATCHET\_STOP" : "STOPPED\_OUT";

\+              exitDate = fwdDate;

\+              holdingDays = j - entryIdx;

\+              break;

\+            }

\+

&#x20;            if (fwdHigh >= target2Price) {

&#x20;              status = "WIN\_T2";

&#x20;              exitPrice = target2Price;

@@ -579,15 +592,6 @@

&#x20;                holdingDays = j - entryIdx;

&#x20;                break;

&#x20;              }

\-            } else {

\-              if (fwdClose <= stopLossPrice) {

\-                status = "STOPPED\_OUT";

\-                exitPrice = fwdClose;

\-                exitDate = fwdDate;

\-                holdingDays = j - entryIdx;

\-                break;

\-              }

&#x20;            }

&#x20;

&#x20;            // 12-Session Time-Stop

@@ -605,11 +609,7 @@

&#x20;        const latestRec = symbolDateMap.get(`${symbol}\_${dates\[latestDateIndex]}`);

&#x20;        const latestClose = latestRec ? latestRec.closePrice : entryPrice;

&#x20;

\-        if (latestDateIndex >= entryIdx + 2 \&\& (hasHitT1 || peakPrice >= target1Price)) {

\-          status = "WIN\_T1";

\-          exitPrice = target1Price;

\-          exitDate = dates\[latestDateIndex];

\-        } else if (holdingDays >= 12 || i < cutoffSession8d) {

\+        if (holdingDays >= 12 || i < cutoffSession8d) {

&#x20;          exitPrice = Number(latestClose.toFixed(2));

&#x20;          const { netReturnPct: timeNet } = calculateNepseNetReturn(entryPrice, exitPrice);

&#x20;          status = timeNet > 0 ? "WIN\_T1" : "TIME\_EXPIRED";

@@ -622,7 +622,7 @@

&#x20;

&#x20;      // Exact NEPSE return calculation

&#x20;      let { grossReturnPct, netReturnPct } =

\-        status === "UNFILLABLE\_SKIP"

\+        status === "UNFILLABLE\_SKIP" || !hasT1Session

&#x20;          ? { grossReturnPct: 0, netReturnPct: 0 }

&#x20;          : calculateNepseNetReturn(entryPrice, exitPrice);



```



\---



\#### `A1-008` — `proxy/legacy\_next\_api/signals/track-record/route.ts`



```diff

\--- a/proxy/legacy\_next\_api/signals/track-record/route.ts

+++ b/proxy/legacy\_next\_api/signals/track-record/route.ts

@@ -220,6 +220,7 @@

&#x20;        const isWhale = safeNum(c.isWhalePrint, 0) === 1 || kitta >= 500 || amount >= 500\_000;

&#x20;

&#x20;        if (isWhale) {

&#x20;          whaleCountBySymbol.set(sym, (whaleCountBySymbol.get(sym) || 0) + 1);

&#x20;        }

\+        const isSelfTrade = buyer > 0 \&\& buyer === seller;

&#x20;

&#x20;        const symBrokers = tempMap.get(sym) || new Map<number, BrokerScripStat>();

&#x20;        if (buyer > 0) {

@@ -247,8 +248,10 @@

&#x20;          };

&#x20;          sStat.sellKitta += kitta;

&#x20;          sStat.netKitta -= kitta;

\-          sStat.turnover += amount;

\-          sStat.trades += 1;

\+          if (!isSelfTrade) {

\+            sStat.turnover += amount;

\+            sStat.trades += 1;

\+          }

&#x20;          symBrokers.set(seller, sStat);

&#x20;        }

&#x20;        tempMap.set(sym, symBrokers);

@@ -338,8 +341,8 @@

&#x20;

&#x20;      // Authentic Alpha = Net Return - NEPSE Index Return over the same holding window

&#x20;      const nepseBenchmarkReturnPct = safeNum(

\-        row.nepse\_return\_pct ?? row.benchmark\_return\_pct,

\-        0.45

\+        row.nepse\_index\_return\_pct ?? row.nepse\_return\_pct ?? row.benchmark\_return\_pct,

\+        0

&#x20;      );

&#x20;      const authenticAlphaPct = isUnfillableGapTrap

&#x20;        ? 0

@@ -370,13 +373,13 @@

&#x20;      if (isUnfillableGapTrap || rawStatus === "UNFILLABLE\_SKIP") {

&#x20;        status = "UNFILLABLE\_SKIP";

&#x20;      } else if (!t2SettlementUnlocked) {

&#x20;        // Hard T+2 Settlement Lock: Never allow a signal with holdingDays < 2 to close prematurely

&#x20;        status = holdingDays === 0 ? "OPEN\_T1\_LOCKED" : "OPEN\_T2\_LOCKED";

\-      } else if (rawStatus.includes("WIN") || netReturnPct >= 4.0) {

\+      } else if (rawStatus.includes("OPEN") || rawStatus === "ACTIVE") {

\+        status = "OPEN\_SETTLED";

\+      } else if (rawStatus.includes("WIN") || rawStatus === "TARGET\_HIT") {

&#x20;        status = "CLOSED\_WIN";

\-      } else if (ratchetActive \&\& netReturnPct > 0.2 \&\& rawStatus.includes("CLOSED")) {

\+      } else if (rawStatus.includes("RATCHET") || (ratchetActive \&\& netReturnPct > 0.2 \&\& rawStatus.includes("CLOSED"))) {

&#x20;        status = "RATCHET\_SAVED";

\-      } else if (rawStatus.includes("LOSS") || rawStatus.includes("STOPPED") || currentLtp <= stopLossPrice) {

\+      } else if (rawStatus.includes("LOSS") || rawStatus.includes("STOPPED") || rawStatus === "STOP\_LOSS") {

&#x20;        status = "CLOSED\_LOSS";

&#x20;      }

@@ -391,7 +394,6 @@

&#x20;      // Join 5D Floorsheet Broker Stats for this Symbol

&#x20;      const brokerStats = scripBrokerMap.get(symbol) || \[];

&#x20;      let totalScripVol = 0;

\-      let positiveNetKitta = 0;

&#x20;      let topAccBroker: number | null = null;

&#x20;      let topAccNetKitta = 0;

&#x20;      let topDistBroker: number | null = null;

&#x20;      let topDistNetKitta = 0;

&#x20;      let bestAnomalyScore = safeNum(row.broker\_anomaly\_score, 1.0);

&#x20;

\+      const positiveNets: number\[] = \[];

\+      const negativeNets: number\[] = \[];

&#x20;      for (const b of brokerStats) {

&#x20;        totalScripVol += b.buyKitta + b.sellKitta;

&#x20;        if (b.netKitta > 0) {

\-          positiveNetKitta += b.netKitta;

\+          positiveNets.push(b.netKitta);

&#x20;          if (b.netKitta > topAccNetKitta) {

&#x20;            topAccNetKitta = b.netKitta;

&#x20;            topAccBroker = b.brokerId;

&#x20;          }

\-        } else if (b.netKitta < topDistNetKitta) {

\-          topDistNetKitta = b.netKitta;

\-          topDistBroker = b.brokerId;

\+        } else if (b.netKitta < 0) {

\+          negativeNets.push(Math.abs(b.netKitta));

\+          if (b.netKitta < topDistNetKitta) {

\+            topDistNetKitta = b.netKitta;

\+            topDistBroker = b.brokerId;

\+          }

&#x20;        }

&#x20;      }

&#x20;

@@ -418,10 +420,14 @@

&#x20;        }

&#x20;      }

&#x20;

\+      // Directional Top-5 Buyer vs Top-3 Seller Net Concentration (fixes zero-sum symmetry bug)

\+      const top5BuyNet = positiveNets.sort((a, b) => b - a).slice(0, 5).reduce((s, v) => s + v, 0);

\+      const top3SellNet = negativeNets.sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);

\+      const dirDenom = top5BuyNet + top3SellNet;

&#x20;      const live5DNetAccumulationPct =

\-        totalScripVol > 0

\-          ? Number((((positiveNetKitta \* 2) / totalScripVol) \* 100).toFixed(1))

\-          : safeNum(row.net\_accumulation\_pct ?? row.bcr5\_net\_pct, 52.0);

\+        dirDenom > 0

\+          ? Number(((top5BuyNet / dirDenom) \* 100).toFixed(1))

\+          : 50.0;

@@ -445,7 +451,7 @@

&#x20;        live5DNetAccumulationPct,

\-        topAccumulatorBroker: topAccBroker ?? (Math.round(safeNum(row.lead\_broker\_id ?? row.primary\_broker\_id ?? row.top\_broker, 28)) || 28),

\+        topAccumulatorBroker: topAccBroker ?? (Math.round(safeNum(row.lead\_broker\_id ?? row.primary\_broker\_id ?? row.top\_broker, 0)) || null),

&#x20;        topAccumulatorNetKitta: topAccNetKitta,

@@ -470,7 +476,8 @@

&#x20;    let grandTotalMarketVol5D = 0;

&#x20;

&#x20;    for (const \[sym, stats] of scripBrokerMap.entries()) {

\-      const isWinningScrip = signalOutcomeBySymbol.get(sym) ?? true;

\+      const hasTrackedOutcome = signalOutcomeBySymbol.has(sym);

\+      const isWinningScrip = hasTrackedOutcome ? Boolean(signalOutcomeBySymbol.get(sym)) : false;

&#x20;      for (const st of stats) {

&#x20;        grandTotalMarketVol5D += st.buyKitta + st.sellKitta;

&#x20;        const cur = globalBrokerMap.get(st.brokerId) || {

@@ -485,7 +492,7 @@

&#x20;        cur.netKitta += st.netKitta;

&#x20;        cur.turnover += st.turnover;

\-        if (st.netKitta > 0) {

\+        if (st.netKitta > 0 \&\& hasTrackedOutcome) {

&#x20;          cur.scrips.push({ symbol: sym, netKitta: st.netKitta, won: isWinningScrip });

&#x20;        }

&#x20;        globalBrokerMap.set(st.brokerId, cur);

@@ -525,11 +532,14 @@

&#x20;    // 6. Compute Summary Portfolio Telemetry

&#x20;    const totalSignals = enrichedSignals.length;

&#x20;    const openSignalsCount = enrichedSignals.filter((s) => s.status.startsWith("OPEN")).length;

\-    const winningSignals = enrichedSignals.filter(

\+    const closedSignals = enrichedSignals.filter(

\+      (s) => !s.status.startsWith("OPEN") \&\& s.status !== "UNFILLABLE\_SKIP"

\+    );

\+    const winningSignals = closedSignals.filter(

&#x20;      (s) => s.netReturnPct > 0 || s.status === "RATCHET\_SAVED"

&#x20;    );

\-    const losingSignals = enrichedSignals.filter((s) => s.netReturnPct < 0);

\+    const losingSignals = closedSignals.filter((s) => s.netReturnPct < 0);

@@ -541,8 +551,8 @@

&#x20;      totalSignals,

&#x20;      openSignalsCount,

&#x20;      verifiedWinRatePct:

\-        totalSignals > 0

\-          ? Number(((winningSignals.length / totalSignals) \* 100).toFixed(1))

\+        closedSignals.length > 0

\+          ? Number(((winningSignals.length / closedSignals.length) \* 100).toFixed(1))

&#x20;          : 0,

&#x20;      avgNetReturnPct:

\-        totalSignals > 0

\+        closedSignals.length > 0

&#x20;          ? Number(

&#x20;              (

\-                enrichedSignals.reduce((acc, s) => acc + s.netReturnPct, 0) /

\-                totalSignals

\+                closedSignals.reduce((acc, s) => acc + s.netReturnPct, 0) /

\+                closedSignals.length

&#x20;              ).toFixed(2)

&#x20;            )

&#x20;          : 0,



```



\---



\#### `A1-009` — `proxy/legacy\_next\_api/floorsheet/hub/route.ts` \& `proxy/legacy\_next\_api/stocks/\[symbol]/telemetry/route.ts`



```diff

\--- a/proxy/legacy\_next\_api/floorsheet/hub/route.ts

+++ b/proxy/legacy\_next\_api/floorsheet/hub/route.ts

@@ -154,53 +154,8 @@

&#x20;      }

&#x20;    }

&#x20;

\-    // 2. Fallback Path: If `floorsheet\_contracts` is empty, synthesize representative tape from `floorsheet\_broker\_summary`

\-    if (rawContracts.length === 0 \&\& tableExists(db, "floorsheet\_broker\_summary")) {

\-      const latestDateRow = db

\-        .prepare(`SELECT MAX(trade\_date) AS latest\_date FROM floorsheet\_broker\_summary`)

\-        .get() as { latest\_date?: string } | undefined;

\-

\-      if (latestDateRow?.latest\_date) {

\-        asOfDate = latestDateRow.latest\_date;

\-        source = "SQLITE\_BROKER\_SUMMARY\_SYNTHESIS";

\-

\-        const summaryRows = db

\-          .prepare(

\-            `SELECT

\-              symbol,

\-              trade\_date,

\-              broker\_no,

\-              buy\_kitta,

\-              sell\_kitta,

\-              COALESCE(vwap, 500) AS rate

\-            FROM floorsheet\_broker\_summary

\-            WHERE trade\_date = ?

\-            ORDER BY (buy\_kitta + sell\_kitta) DESC

\-            LIMIT 400`

\-          )

\-          .all(asOfDate) as Array<{

\-          symbol: string;

\-          trade\_date: string;

\-          broker\_no: number;

\-          buy\_kitta: number;

\-          sell\_kitta: number;

\-          rate: number;

\-        }>;

\-

\-        rawContracts = summaryRows

\-          .filter((r) => safeNum(r.buy\_kitta, 0) > 0 || safeNum(r.sell\_kitta, 0) > 0)

\-          .map((r, i) => {

\-            const kitta = Math.max(safeNum(r.buy\_kitta, 0), safeNum(r.sell\_kitta, 0));

\-            const rate = safeNum(r.rate, 500);

\-            return {

\-              contractNo: `${asOfDate.replace(/-/g, "")}-SYN-${1000 + i}`,

\-              symbol: r.symbol,

\-              tradeDate: r.trade\_date,

\-              tradeTime: "14:59:00",

\-              buyerBroker: safeNum(r.buy\_kitta, 0) >= safeNum(r.sell\_kitta, 0) ? r.broker\_no : 58,

\-              sellerBroker: safeNum(r.sell\_kitta, 0) > safeNum(r.buy\_kitta, 0) ? r.broker\_no : 45,

\-              kitta,

\-              rate,

\-              amount: Number((kitta \* rate).toFixed(2)),

\-            };

\-          });

\-      }

\-    }

\+    // Do NOT fabricate synthetic counterparties (#58/#45) when tick-level contracts are absent.

\+    // Preserve source = "EMPTY" so callers display an explicit tick-data-unavailable state.

@@ -264,7 +219,7 @@

&#x20;

&#x20;    const brokerAgg = new Map<

&#x20;      number,

\-      { buyKitta: number; sellKitta: number; turnover: number; whaleTrades: number; trades: number }

\+      { buyKitta: number; sellKitta: number; turnover: number; whaleTrades: number; trades: number; sideCount: number }

&#x20;    >();

@@ -307,10 +262,12 @@

&#x20;          turnover: 0,

&#x20;          whaleTrades: 0,

&#x20;          trades: 0,

\+          sideCount: 0,

&#x20;        };

&#x20;        b.buyKitta += c.kitta;

&#x20;        b.turnover += c.amount;

&#x20;        if (c.isWhalePrint) b.whaleTrades += 1;

&#x20;        b.trades += 1;

\+        b.sideCount += 1;

&#x20;        brokerAgg.set(c.buyerBroker, b);

&#x20;      }

@@ -323,11 +280,13 @@

&#x20;          turnover: 0,

&#x20;          whaleTrades: 0,

&#x20;          trades: 0,

\+          sideCount: 0,

&#x20;        };

&#x20;        sl.sellKitta += c.kitta;

\+        sl.sideCount += 1;

&#x20;        // Avoid double-counting turnover and trade count on self-trades (buyerBroker === sellerBroker)

&#x20;        if (!isSelfTrade) {

&#x20;          sl.turnover += c.amount;

&#x20;          sl.trades += 1;

&#x20;        }

&#x20;        brokerAgg.set(c.sellerBroker, sl);

&#x20;      }

@@ -361,7 +320,7 @@

&#x20;    const topInstitutionalBrokers: MarketWideBrokerRollup\[] = Array.from(brokerAgg.entries())

&#x20;      .map((\[brokerId, br]) => {

&#x20;        const netKitta = br.buyKitta - br.sellKitta;

\-        const avgTicket = (br.buyKitta + br.sellKitta) / Math.max(1, br.trades);

\+        const avgTicket = (br.buyKitta + br.sellKitta) / Math.max(1, br.sideCount);

&#x20;        const baseline = RETAIL\_GIANT\_BASELINE\[brokerId] ?? 0.018;



```



```diff

\--- a/proxy/legacy\_next\_api/stocks/\[symbol]/telemetry/route.ts

+++ b/proxy/legacy\_next\_api/stocks/\[symbol]/telemetry/route.ts

@@ -238,57 +238,8 @@

&#x20;      }

&#x20;    }

&#x20;

\-    // Fallback: Synthesize representative contract rows from `floorsheet\_broker\_summary` if tick table is empty

\-    if (

\-      rawFloorsheetContracts.length === 0 \&\&

\-      tableExists(db, "floorsheet\_broker\_summary")

\-    ) {

\-      try {

\-        const latestBrokerDate = db

\-          .prepare(

\-            `SELECT MAX(trade\_date) AS latest\_date

\-             FROM floorsheet\_broker\_summary

\-             WHERE UPPER(symbol) = ?`

\-          )

\-          .get(validSymbol) as { latest\_date?: string } | undefined;

\-

\-        if (latestBrokerDate?.latest\_date) {

\-          const summaryRows = db

\-            .prepare(

\-              `SELECT

\-                symbol,

\-                trade\_date,

\-                broker\_no,

\-                buy\_kitta,

\-                sell\_kitta,

\-                COALESCE(vwap, ?) AS rate

\-              FROM floorsheet\_broker\_summary

\-              WHERE UPPER(symbol) = ? AND trade\_date = ?

\-              ORDER BY (buy\_kitta + sell\_kitta) DESC

\-              LIMIT 120`

\-            )

\-            .all(

\-              safeNum(quoteData?.ltp ?? ledgerTelemetry?.ltp ?? ledgerTelemetry?.entry\_vwap, 500),

\-              validSymbol,

\-              latestBrokerDate.latest\_date

\-            ) as Array<{

\-            symbol: string;

\-            trade\_date: string;

\-            broker\_no: number;

\-            buy\_kitta: number;

\-            sell\_kitta: number;

\-            rate: number;

\-          }>;

\-

\-          rawFloorsheetContracts = summaryRows

\-            .filter((r) => safeNum(r.buy\_kitta, 0) > 0 || safeNum(r.sell\_kitta, 0) > 0)

\-            .map((r, idx) => {

\-              const kitta = Math.max(safeNum(r.buy\_kitta, 0), safeNum(r.sell\_kitta, 0));

\-              const rate = safeNum(r.rate, 500);

\-              return {

\-                contractNo: `${r.trade\_date.replace(/-/g, "")}-${validSymbol}-${100 + idx}`,

\-                symbol: validSymbol,

\-                tradeDate: r.trade\_date,

\-                tradeTime: "14:58:00",

\-                buyerBroker:

\-                  safeNum(r.buy\_kitta, 0) >= safeNum(r.sell\_kitta, 0) ? r.broker\_no : 58,

\-                sellerBroker:

\-                  safeNum(r.sell\_kitta, 0) > safeNum(r.buy\_kitta, 0) ? r.broker\_no : 45,

\-                kitta,

\-                rate,

\-                amount: Number((kitta \* rate).toFixed(2)),

\-              };

\-            });

\-        }

\-      } catch {

\-        // Ignore synthesis error

\-      }

\-    }

\+    // Never fabricate synthetic contracts with hardcoded counterparties (#58/#45) when tick-level

\+    // contracts are unavailable; broker5DPayload already carries authentic broker totals.

@@ -369,7 +320,7 @@

&#x20;      verifiedPrice: tabTelemetry.overview.verifiedPrice,

&#x20;      rawFundamentals: rawFundamentals || {

&#x20;        symbol: validSymbol,

\-        sector: String(quoteData?.sector ?? ledgerTelemetry?.sector ?? "Commercial Banks"),

\+        sector: String(quoteData?.sector || ledgerTelemetry?.sector || "Others"),

&#x20;      },

&#x20;      corporateActions,

&#x20;    });



```



\---



\#### `A1-010` — `proxy/legacy\_next\_api/ai-guru/assess/route.ts`



```diff

\--- a/proxy/legacy\_next\_api/ai-guru/assess/route.ts

+++ b/proxy/legacy\_next\_api/ai-guru/assess/route.ts

@@ -37,7 +37,9 @@

&#x20;    ? `Retail herd churn detected (${Math.round(m.avgTicketKitta)} kitta avg ticket is below the 45-kitta noise floor)`

&#x20;    : `Moderate blended participation (${Math.round(m.avgTicketKitta)} kitta avg ticket)`;

&#x20;

\-  const ratchetCleared = m.mfePct >= 1.2;

\+  const ratchetCleared =

\+    Boolean(m.ratchetTriggered) ||

\+    (m.ratchetTriggerPrice > 0 \&\& m.verifiedPrice >= m.ratchetTriggerPrice);

&#x20;  const topAccList =

&#x20;    m.smartMoney5D.topAccumulators.length > 0

&#x20;      ? m.smartMoney5D.topAccumulators



```



\---



\#### `A1-011`, `A1-017`, `A1-018`, `A1-019` — `proxy/routes/radarRoutes.js`



```diff

\--- a/proxy/routes/radarRoutes.js

+++ b/proxy/routes/radarRoutes.js

@@ -22,7 +22,7 @@

&#x20;  rebuildSignalTrackRecord

&#x20;} from "../db/ledgerStore.js";

&#x20;import { calculateMultiDayDiagnostics } from "../utils/microstructureEngine.js";

\-import { requireAdminSecret } from "../middleware/requireAdminSecret.mjs";

+import { requireAdminSecret, isValidAdminRequest } from "../middleware/requireAdminSecret.mjs";

&#x20;

&#x20;const \_\_filename = fileURLToPath(import.meta.url);

&#x20;const \_\_dirname = path.dirname(\_\_filename);

@@ -82,7 +82,7 @@

&#x20;    try {

&#x20;      console.log("\[RadarRoutes] HOT\_CACHE is empty on request. Initializing disk vault / snapshot seed...");

&#x20;      seedFromDiskVault();

\-      rebuildHotCache();

\+      await rebuildHotCache();

&#x20;      const loaded = (HOT\_CACHE.radarByTimeframe\[30] || \[]).length;

&#x20;      console.log(`\[RadarRoutes] HOT\_CACHE initialization completed. Loaded ${loaded} stocks in 30D window.`);

&#x20;      return loaded > 0;

@@ -135,7 +135,8 @@

&#x20;  const brokerFlowMap = new Map();

&#x20;

&#x20;  for (const s of universe) {

\-    const sDiag = HOT\_CACHE.stockDiagnostics.get(`${s.symbol}\_${validDays}`) || s;

\+    // Use Map.prototype.get to avoid triggering 250 synchronous SQLite cache-miss queries per request

\+    const sDiag = Map.prototype.get.call(HOT\_CACHE.stockDiagnostics, `${s.symbol}\_${validDays}`) || s;

&#x20;    if (!sDiag) continue;

&#x20;    const smMeta = stockMap\[s.symbol] || {};

&#x20;    const symCompany = smMeta.name || s.name || sDiag.companyName || s.symbol;

@@ -224,7 +225,11 @@

&#x20;  const results = \[];

&#x20;

&#x20;  for (const stock of universe) {

\-    const diag = HOT\_CACHE.stockDiagnostics.get(`${stock.symbol}\_${validDays}`) || stock;

\+    const cachedDiag = Map.prototype.get.call(HOT\_CACHE.stockDiagnostics, `${stock.symbol}\_${validDays}`);

\+    // Only hit SQLite on demand when narrowing to a specific broker or search query

\+    const diag = cachedDiag || (brokerIdFilter !== "ALL" || brokerNumberMatch

\+      ? HOT\_CACHE.stockDiagnostics.get(`${stock.symbol}\_${validDays}`)

\+      : stock) || stock;

&#x20;    const smInfo = stockMap\[stock.symbol] || {};

&#x20;    const stockSector = smInfo.sector || stock.sector || diag.sector || "Others";

&#x20;    const companyName = smInfo.name || stock.name || diag.companyName || stock.symbol;

@@ -429,7 +434,8 @@

&#x20;export async function handleSignalTrackRecord(req, res) {

&#x20;  await ensureHotCacheReady();

\-  const forceRebuild = req.query.force === "true" || req.query.rebuild === "true";

\+  const wantsForce = req.query.force === "true" || req.query.rebuild === "true";

\+  const forceRebuild = wantsForce \&\& isValidAdminRequest(req);

&#x20;  if (forceRebuild || !HOT\_CACHE.signalTrackRecord || !HOT\_CACHE.signalTrackRecord.signals?.length) {

&#x20;    try {

&#x20;      rebuildSignalTrackRecord(db, HOT\_CACHE, { force: forceRebuild });

@@ -630,11 +636,12 @@

&#x20;    // Operator margins \& User metrics

\-    const operatorProfitMarginPct = bigBrokerVWAP > 0 ? Number((((ltp - bigBrokerVWAP) / bigBrokerVWAP) \* 100).toFixed(2)) : 0;

\-    const userProfitLossPct = buyPrice > 0 ? Number((((ltp - buyPrice) / buyPrice) \* 100).toFixed(2)) : null;

\-    const unrealizedPnL = (buyPrice > 0 \&\& qty > 0) ? Number(((ltp - buyPrice) \* qty).toFixed(2)) : null;

\+    const hasValidLtp = Number.isFinite(ltp) \&\& ltp > 0;

\+    const operatorProfitMarginPct = (hasValidLtp \&\& bigBrokerVWAP > 0) ? Number((((ltp - bigBrokerVWAP) / bigBrokerVWAP) \* 100).toFixed(2)) : 0;

\+    const userProfitLossPct = (hasValidLtp \&\& buyPrice > 0) ? Number((((ltp - buyPrice) / buyPrice) \* 100).toFixed(2)) : null;

\+    const unrealizedPnL = (hasValidLtp \&\& buyPrice > 0 \&\& qty > 0) ? Number(((ltp - buyPrice) \* qty).toFixed(2)) : null;

&#x20;    const costAdvantageVsOperatorPct = (buyPrice > 0 \&\& bigBrokerVWAP > 0) ? Number((((bigBrokerVWAP - buyPrice) / bigBrokerVWAP) \* 100).toFixed(2)) : null;

&#x20;

\-    const positionValue = qty > 0 ? qty \* ltp : 0;

\+    const positionValue = (hasValidLtp \&\& qty > 0) ? qty \* ltp : 0;

&#x20;    if (positionValue > 0) totalPortfolioValue += positionValue;

&#x20;    if (unrealizedPnL !== null) totalPortfolioPnL += unrealizedPnL;

@@ -706,6 +713,7 @@

&#x20;      qty,

&#x20;      buyPrice,

&#x20;      ltp,

\+      priceUnavailable: !hasValidLtp,

&#x20;      bigBrokerVWAP,

@@ -911,7 +919,7 @@

&#x20; \* POST /api/radar/ingest

&#x20; \* Ingests a session's raw floorsheet trades, compresses into SQLite, and rebuilds RAM cache

&#x20; \*/

\-router.post("/radar/ingest", requireAdminSecret, (req, res) => {

+router.post("/radar/ingest", requireAdminSecret, async (req, res) => {

&#x20;  try {

&#x20;    const { tradeDate, trades } = req.body || {};

&#x20;    if (!tradeDate || !Array.isArray(trades) || trades.length === 0) {

@@ -922,7 +930,7 @@

&#x20;    }

&#x20;

&#x20;    const count = ingestDailyFloorsheetTransaction(tradeDate, trades);

\-    rebuildHotCache();

\+    await rebuildHotCache();

&#x20;

&#x20;    return res.json({

&#x20;      success: true,

@@ -942,13 +950,13 @@

&#x20; \* POST / GET /api/radar/rebuild-cache \& /api/admin/rebuild-cache

&#x20; \* Manually forces RAM cache rebuild, optional forceSnapshot=true

&#x20; \*/

\-const handleRebuildCache = (req, res) => {

+const handleRebuildCache = async (req, res) => {

&#x20;  try {

&#x20;    const forceSnapshot = req.query.forceSnapshot === "true" || req.body?.forceSnapshot === true;

&#x20;    if (forceSnapshot) {

&#x20;      seedFromSnapshotGz(true);

&#x20;    }

\-    const ok = rebuildHotCache();

\+    const ok = await rebuildHotCache();

&#x20;    const status = getLedgerStatusInfo();

&#x20;    return res.json({

&#x20;      success: ok,



```



\---



\#### `A1-012` — `proxy/ipoHelper.js`



```diff

\--- a/proxy/ipoHelper.js

+++ b/proxy/ipoHelper.js

@@ -106,18 +106,14 @@

&#x20;      dataList.forEach((item, i) => {

&#x20;        const rawSym = (item.stockSymbol || '').toUpperCase().trim();

&#x20;        const rawName = item.companyName || '';

\-        const isBeni = rawSym === 'BENI' || rawName.toLowerCase().includes('beni hydropower');

&#x20;

&#x20;        let closeDate = item.extendedDateAD || item.closingDateAD || item.closingDateBS || '';

&#x20;        let openDate = item.openingDateAD || item.openingDateBS || '';

&#x20;        let status = item.status || 'Open';

&#x20;

&#x20;        const compOpenDate = (item.openingDateAD || '').split('T')\[0];

&#x20;        const compCloseDate = (item.extendedDateAD || item.closingDateAD || '').split('T')\[0];

&#x20;

\-        if (isBeni) {

\-          closeDate = '2026-09-11';

\-          status = isBefore5pmNpt ? 'Open' : 'Closed';

\-        } else if (compOpenDate \&\& compOpenDate > todayNptStr) {

\+        if (compOpenDate \&\& compOpenDate > todayNptStr) {

&#x20;          status = 'Upcoming';

&#x20;        } else if (compCloseDate === todayNptStr) {

&#x20;          status = isBefore5pmNpt ? 'Open' : 'Closed';

@@ -232,16 +228,15 @@

&#x20;    const labeled = diskSnapshot.data.map(item => ({

&#x20;      ...item,

&#x20;      isStale: true,

\+      asOf: diskSnapshot.savedAt,

&#x20;      staleWarning: `Cached Record: Live scrapers returned 403 Forbidden. Showing persistent snapshot from ${diskSnapshot.savedAt}.`

&#x20;    }));

\-    ipoCache = labeled;

\-    lastCacheTime = now;

&#x20;    return labeled;

&#x20;  }

&#x20;

&#x20;  // Resilient Fallback: Official SEBON Gazette Pipeline

&#x20;  console.log('\[ipoHelper] Serving official SEBON gazette pipeline fallback with stale labeling.');

&#x20;  const sebonFallback = loadSebonFallback();

&#x20;  if (sebonFallback.length > 0) {

\-    ipoCache = sebonFallback;

\-    lastCacheTime = now;

&#x20;    return sebonFallback;

&#x20;  }



```



\---



\#### `A1-012`, `A1-013`, `A1-022` — `proxy/meroshare.js`



```diff

\--- a/proxy/meroshare.js

+++ b/proxy/meroshare.js

@@ -134,6 +134,9 @@

&#x20;  const passRes = decryptField(acc.password);

&#x20;  const crnRes = decryptField(acc.crn);

&#x20;  const pinRes = decryptField(acc.transactionPin);

\+  if (passRes.failed || crnRes.failed || pinRes.failed) {

\+    throw new Error(`Credential decryption failed for account ${acc.name || acc.id}. Check MEROSHARE\_ENCRYPTION\_KEY / MEROSHARE\_ENCRYPTION\_KEY\_PREVIOUS before retrying to avoid CDSC lockout.`);

\+  }

&#x20;

&#x20;  const needsReEncrypt = Boolean(passRes.usedPreviousKey || crnRes.usedPreviousKey || pinRes.usedPreviousKey);

@@ -191,7 +194,9 @@

&#x20;      const { account } = migrateAccount(acc);

&#x20;      return account;

&#x20;    });

\-    fs.writeFileSync(filePath, JSON.stringify(migratedAccounts, null, 2), 'utf8');

\+    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

\+    fs.writeFileSync(tmpPath, JSON.stringify(migratedAccounts, null, 2), 'utf8');

\+    fs.renameSync(tmpPath, filePath);

&#x20;  } catch (e) {

&#x20;    console.error('\[meroshare-bulk] Error saving accounts:', e.message);

&#x20;  }

@@ -220,7 +225,7 @@

&#x20;const primeSession = async (client) => {

&#x20;  try {

&#x20;    const jar = client?.jar;

\-    const cookies = jar ? jar.getCookiesSync('https://backend.cdsc.com.np') : \[];

\+    const cookies = jar ? jar.getCookiesSync('https://webbackend.cdsc.com.np') : \[];

&#x20;    if (cookies \&\& cookies.length > 0) {

&#x20;      return;

&#x20;    }

@@ -304,8 +309,9 @@

&#x20;// 2. Add or Update Account

&#x20;router.post('/accounts', (req, res) => {

&#x20;  try {

\-    const { id, name, boid, username, dpCode, dpName, password, crn, pin } = req.body;

\-    if (!name || boid.length !== 16 || !username || !password || !crn || String(pin).length !== 4) {

\+    const { id, name, boid, username, dpCode, dpName, password, crn, pin } = req.body || {};

\+    const cleanBoid = String(boid || '').trim();

\+    if (!name || cleanBoid.length !== 16 || !username || !password || !crn || String(pin || '').length !== 4) {

&#x20;      return res.status(400).json({ success: false, error: 'Invalid or missing fields. BOID must be 16 digits, PIN must be 4 digits.' });

&#x20;    }

@@ -352,7 +358,13 @@

&#x20;    try {

&#x20;      const liveData = await getLiveIpoListings();

&#x20;      if (liveData \&\& liveData.length > 0) {

\-        return res.json({ success: true, data: liveData, source: 'live-listings' });

\+        const isStale = liveData.some((item) => item?.isStale === true);

\+        return res.json({

\+          success: true,

\+          data: liveData,

\+          isStale,

\+          asOf: liveData\[0]?.asOf || new Date().toISOString(),

\+          source: isStale ? 'stale-ipo-fallback' : 'live-listings'

\+        });

&#x20;      }

&#x20;    } catch (\_) {}

&#x20;    return res.status(isValidAdminRequest(req) ? 400 : 401).json({ success: false, error: 'Admin authorization or server account setup required.' });

@@ -421,7 +433,13 @@

&#x20;    try {

&#x20;      const liveData = await getLiveIpoListings();

&#x20;      if (liveData \&\& liveData.length > 0) {

\-        return res.json({ success: true, data: liveData, source: 'live-listings' });

\+        const isStale = liveData.some((item) => item?.isStale === true);

\+        return res.json({

\+          success: true,

\+          data: liveData,

\+          isStale,

\+          asOf: liveData\[0]?.asOf || new Date().toISOString(),

\+          source: isStale ? 'stale-ipo-fallback' : 'live-listings'

\+        });

&#x20;      }

&#x20;    } catch (\_) {}

&#x20;    res.status(500).json({ success: false, error: 'Failed to fetch current IPOs: ' + error.message });

@@ -515,11 +533,9 @@

&#x20;

&#x20;      const payload = {

&#x20;        ...template,

\-        appliedKitta: Number(appliedKitta),

\-        crnNumber: crn.trim(),

\-        transactionPin: pin.trim(),

\-        boid: acc.boid,

\-        demat: acc.boid,

\+        ...valResult.sanitizedPayload,

\+        appliedKitta: Number(appliedKitta),

&#x20;      };

@@ -602,10 +618,12 @@

&#x20;

&#x20;      let status, message, units;

&#x20;      if (isCdscResponse) {

\-        const isAllotted = data?.success === true || (msgStr.includes('allotted') \&\& !msgStr.includes('not'));

\+        const isExplicitlyNotAllotted =

\+          msgStr.includes('not allotted') || msgStr.includes('sorry') || msgStr.includes('not alloted');

\+        const isAllotted = !isExplicitlyNotAllotted \&\& (data?.success === true || msgStr.includes('allotted'));

&#x20;        if (isAllotted) {

\-          const match = data.message ? data.message.match(/\\d+/) : null;

\-          units = match ? parseInt(match\[0]) : 10;

\+          const match = data.message ? data.message.match(/(?:allotted|quantity|units?|kitta)\\D\*(\\d+)/i) : null;

\+          units = match ? parseInt(match\[1], 10) : 10;

&#x20;          status = 'allotted';

&#x20;          message = data.message || `Congratulations! Allotted ${units} Units.`;

&#x20;        } else {



```



\---



\#### `A1-014` — `src/constants/marketRules.js`



```diff

\--- a/src/constants/marketRules.js

+++ b/src/constants/marketRules.js

@@ -290,7 +290,6 @@

&#x20;  const finalNetProfit = profitBeforeTax - cgt;

&#x20;

&#x20;  const grossProfit = grossSellValue - grossBuyValue;

\-  const totalFriction = totalBuyCost + (grossSellValue - netSellProceedsBeforeTax) + cgt - (grossBuyValue + (grossSellValue - grossSellValue)); // Total fee drag

&#x20;

&#x20;  const grossReturnPct = +((grossProfit / grossBuyValue) \* 100).toFixed(2);

&#x20;  const netReturnPct = +((finalNetProfit / totalBuyCost) \* 100).toFixed(2);

@@ -305,7 +304,7 @@

&#x20;    netProfitNpr: +finalNetProfit.toFixed(2),

&#x20;    grossReturnPct,

&#x20;    netReturnPct,

\-    totalFrictionNpr: +(buyCommission + buySebonFee + sellCommission + sellSebonFee + dpFee + cgt).toFixed(2),

\+    totalFrictionNpr: +(buyCommission + buySebonFee + buyDpFee + sellCommission + sellSebonFee + dpFee + cgt).toFixed(2),

&#x20;    cgtDeductedNpr: cgt,

&#x20;    frictionCostPct

&#x20;  };



```



\---



\#### `A1-015` \& `A1-023` — `src/App.jsx`



```diff

\--- a/src/App.jsx

+++ b/src/App.jsx

@@ -66,10 +66,14 @@

&#x20;  const \[showDiagnostics, setShowDiagnostics] = useState(false);

&#x20;  const \[marketTrend, setMarketTrend] = useState('flat');

&#x20;  const \[isRefreshing, setIsRefreshing] = useState(false);

\-  const \[lastSyncTime, setLastSyncTime] = useState(new Date());

\+  const \[lastSyncTime, setLastSyncTime] = useState(() => {

\+    const synced = typeof getLastMarketSyncTime === 'function' ? getLastMarketSyncTime() : null;

\+    return synced ? new Date(synced) : null;

\+  });

&#x20;

&#x20;  const formattedSyncTime = useMemo(() => {

\-    const d = lastSyncTime ? new Date(lastSyncTime) : new Date();

\+    if (!lastSyncTime) return '';

\+    const d = new Date(lastSyncTime);

&#x20;    try {

&#x20;      return new Intl.DateTimeFormat('en-US', {

&#x20;        timeZone: 'Asia/Kathmandu',

@@ -343,14 +347,14 @@

&#x20;              return currentStocks;

&#x20;            });

&#x20;            const isLive = Boolean(status?.isOpen);

\-            setApiStatus(isLive ? (isFreshFeed ? 'live' : (hasExistingReal ? 'live' : 'yesterday')) : (res.source === 'closing' ? 'closing' : 'yesterday'));

\+            setApiStatus(isLive ? (isFreshFeed ? 'live' : 'yesterday') : (res.source === 'closing' ? 'closing' : 'yesterday'));

&#x20;            if (isFreshFeed) {

&#x20;              saveCachedStocks(currentStocks);

&#x20;              hasFreshData = true;

&#x20;            }

&#x20;          } else if (hasExistingReal \&\& isMarketOpenNow) {

\-            setApiStatus('live');

\+            setApiStatus('yesterday');

&#x20;          }

&#x20;          return res;

@@ -435,8 +439,12 @@

&#x20;  useEffect(() => {

&#x20;    let isMounted = true;

&#x20;    let tickerTimer = null;

\+    let isTicking = false;

&#x20;    let consecutiveErrors = 0;

&#x20;

&#x20;    const tickFastIndex = async () => {

\+      if (isTicking) return;

\+      isTicking = true;

\+      if (tickerTimer) { clearTimeout(tickerTimer); tickerTimer = null; }

&#x20;      const status = getDetailedMarketStatus();

&#x20;      try {

&#x20;        const liveIdx = await fetchMarketIndices();

@@ -455,6 +463,8 @@

&#x20;        }

&#x20;      } catch (\_) {

&#x20;        consecutiveErrors++;

\+      } finally {

\+        isTicking = false;

&#x20;      }

&#x20;

&#x20;      if (!isMounted) return;

@@ -520,7 +530,7 @@

&#x20;          const liveVal = Number(latestTick?.close || latestTick?.value || 0);

&#x20;          if (liveVal > 0) {

&#x20;            setIndices(prev => {

\-              const prevClose = Number(prev?.nepse?.prevClose || firstTick?.open || 2629.82);

\+              const prevClose = Number(prev?.nepse?.prevClose || firstTick?.open || liveVal);

&#x20;              const chg = +(liveVal - prevClose).toFixed(2);

&#x20;              const pChg = +(prevClose > 0 ? (chg / prevClose) \* 100 : 0).toFixed(2);

@@ -545,7 +555,7 @@

&#x20;            if (computed \&\& computed.nepse?.value > 0 \&\& !computed.isPlaceholder) {

&#x20;              saveCachedIndices(computed);

&#x20;              return { ...prev, ...computed };

&#x20;            }

\-            if (prev?.nepse?.value \&\& Number(prev.nepse.value) > 0 \&\& !prev.isPlaceholder \&\& Math.abs(Number(prev.nepse.value) - 2629.82) >= 0.05) {

\+            if (prev?.nepse?.value \&\& Number(prev.nepse.value) > 0 \&\& !prev.isPlaceholder) {

&#x20;              return prev; // PRESERVE authentic live index! Never revert to yesterday!

&#x20;            }

&#x20;            return prev;

@@ -574,7 +584,6 @@

&#x20;        if (isActive) {

&#x20;          console.log('\[App] Resumed from background — refreshing live quotes \& market depth');

&#x20;          triggerTick();

\-          setLastSyncTime(new Date());

&#x20;          syncDevicePushToken().catch(() => {});

&#x20;        }

&#x20;      }).then(handle => {

@@ -857,7 +866,6 @@

&#x20;                        const currentWatchlist = JSON.parse(localStorage.getItem('nepse\_user\_watchlist') || '\[]');

&#x20;                        const userTxKey = `nepse\_hub\_${uid}\_transactions`;

\-                        const userProfileKey = `nepse\_hub\_${uid}\_profiles`;

\-                        const bulkKey = 'nepse\_hub\_bulk\_ipo\_accounts';

&#x20;

&#x20;                        // 1. Pull latest remote cloud data

&#x20;                        let pulledProfiles = \[];

@@ -875,8 +883,7 @@

&#x20;

&#x20;                        // 2. Merge local and remote

&#x20;                        const localTxs = JSON.parse(localStorage.getItem(userTxKey) || '\[]');

\-                        const localProfs = JSON.parse(localStorage.getItem(userProfileKey) || '\[]');

\-                        const localBulk = JSON.parse(localStorage.getItem(bulkKey) || '\[]');

\+                        const localProfs = await loadEncryptedUserProfiles(uid);

&#x20;

&#x20;                        const mergedProfs = \[...localProfs];

&#x20;                        pulledProfiles.forEach(p => {

@@ -894,14 +901,14 @@

&#x20;                        const mergedWatchlist = \[...new Set(\[...currentWatchlist, ...pulledWatchlist])];

&#x20;

&#x20;                        // 3. Save locally

\-                        safeStorageSetItem(userProfileKey, JSON.stringify(mergedProfs));

\+                        await saveEncryptedUserProfiles(mergedProfs, uid);

&#x20;                        safeStorageSetItem(userTxKey, JSON.stringify(mergedTxs));

&#x20;                        safeStorageSetItem('nepse\_user\_watchlist', JSON.stringify(mergedWatchlist));

&#x20;

\-                        // 4. Push combined snapshot to cloud

\+                        // 4. Push sanitized snapshot to cloud (never upload credentials)

\+                        const sanitizedProfiles = mergedProfs.map(({ password: \_p, crn: \_c, pin: \_pn, transactionPin: \_tp, vaultEnvelope: \_ve, ...safe }) => safe);

&#x20;                        await syncUserDataToCloud(uid, {

\-                          profiles: mergedProfs,

\+                          profiles: sanitizedProfiles,

&#x20;                          transactions: mergedTxs,

\-                          bulkAccounts: localBulk,

&#x20;                          watchlist: mergedWatchlist

&#x20;                        }, email);



```



\---



\#### `A1-016` — `migrations/004\_upgrade\_fundamentals\_and\_lockin.sql`



```diff

\--- a/migrations/004\_upgrade\_fundamentals\_and\_lockin.sql

+++ b/migrations/004\_upgrade\_fundamentals\_and\_lockin.sql

@@ -4,14 +4,14 @@

&#x20;CREATE TABLE IF NOT EXISTS scrip\_fundamentals (

&#x20;  symbol TEXT PRIMARY KEY,

&#x20;  sector TEXT NOT NULL DEFAULT 'Others',

&#x20;  fiscal\_quarter TEXT DEFAULT 'Q4 2082/83',

\-  paid\_up\_capital REAL DEFAULT 0,          -- In NPR

\-  public\_float\_kitta INTEGER DEFAULT 0,

\-  promoter\_share\_pct REAL DEFAULT 51.0,

\-  public\_share\_pct REAL DEFAULT 49.0,

\-  eps\_ttm REAL DEFAULT 0,                  -- Annualized / TTM EPS

\-  book\_value\_per\_share REAL DEFAULT 100,   -- Net Worth per Share (NWPS)

\-  roe\_pct REAL DEFAULT 0,                  -- Return on Equity %

\+  paid\_up\_capital REAL DEFAULT NULL,       -- In NPR

\+  public\_float\_kitta INTEGER DEFAULT NULL,

\+  promoter\_share\_pct REAL DEFAULT NULL,

\+  public\_share\_pct REAL DEFAULT NULL,

\+  eps\_ttm REAL DEFAULT NULL,               -- Annualized / TTM EPS

\+  book\_value\_per\_share REAL DEFAULT NULL,  -- Net Worth per Share (NWPS)

\+  roe\_pct REAL DEFAULT NULL,               -- Return on Equity %

&#x20;  npl\_pct REAL DEFAULT NULL,               -- Non-Performing Loan % (BFIs / Microfinance)

&#x20;  car\_pct REAL DEFAULT NULL,               -- Capital Adequacy Ratio % (BFIs)

&#x20;  distributable\_eps REAL DEFAULT NULL,     -- Post-regulatory reserve distributable EPS

@@ -30,7 +30,8 @@

&#x20;  total\_dividend\_pct REAL DEFAULT 0,

&#x20;  right\_share\_ratio TEXT DEFAULT NULL,     -- e.g., '10:3'

&#x20;  book\_close\_date TEXT DEFAULT NULL,

\-  status TEXT DEFAULT 'APPROVED'           -- 'PROPOSED', 'APPROVED', 'DISTRIBUTED'

\+  status TEXT DEFAULT 'APPROVED',          -- 'PROPOSED', 'APPROVED', 'DISTRIBUTED'

\+  UNIQUE(symbol, fiscal\_year, book\_close\_date)

&#x20;);



```



\---



\#### `A1-021` — `proxy/scripts/rebuildSignalTrackRecord.ts`



```diff

\--- a/proxy/scripts/rebuildSignalTrackRecord.ts

+++ b/proxy/scripts/rebuildSignalTrackRecord.ts

@@ -211,22 +211,26 @@

&#x20;

&#x20;  const upsertStmt = db.prepare(`

&#x20;    INSERT INTO algorithmic\_signal\_ledger (

\-      signal\_id, symbol, sector, strategy,

\+      signal\_id, symbol, sector, strategy, signal\_type,

&#x20;      signal\_date, trigger\_ltp, initial\_risk\_pct, reward\_multiple,

\-      entry\_date, entry\_vwap, entry\_turnover\_npr,

\-      target\_price, initial\_stop\_price, active\_stop\_price, is\_ratchet\_armed,

\-      settlement\_unlock\_date, status, exit\_date, exit\_price, holding\_days,

\+      entry\_date, entry\_price, entry\_vwap, entry\_turnover\_npr,

\+      target\_price, target1\_price, target2\_price,

\+      initial\_stop\_price, stop\_loss\_price, active\_stop\_price, is\_ratchet\_armed,

\+      settlement\_unlock\_date, t2\_unlock\_date, status, exit\_date, exit\_price, holding\_days,

&#x20;      mfe\_pct, mae\_pct, gross\_return\_pct, net\_return\_pct,

&#x20;      nepse\_index\_return\_pct, nepse\_alpha\_pct,

&#x20;      primary\_broker\_id, broker\_anomaly\_score, avg\_ticket\_kitta, market\_regime,

&#x20;      updated\_at

&#x20;    ) VALUES (

\-      @signal\_id, @symbol, @sector, @strategy,

\+      @signal\_id, @symbol, @sector, @strategy, @strategy,

&#x20;      @signal\_date, @trigger\_ltp, @initial\_risk\_pct, @reward\_multiple,

\-      @entry\_date, @entry\_vwap, @entry\_turnover\_npr,

\-      @target\_price, @initial\_stop\_price, @active\_stop\_price, @is\_ratchet\_armed,

\-      @settlement\_unlock\_date, @status, @exit\_date, @exit\_price, @holding\_days,

\+      @entry\_date, @entry\_vwap, @entry\_vwap, @entry\_turnover\_npr,

\+      @target\_price, @target\_price, @target2\_price,

\+      @initial\_stop\_price, @initial\_stop\_price, @active\_stop\_price, @is\_ratchet\_armed,

\+      @settlement\_unlock\_date, @t2\_unlock\_date, @status, @exit\_date, @exit\_price, @holding\_days,

&#x20;      @mfe\_pct, @mae\_pct, @gross\_return\_pct, @net\_return\_pct,

&#x20;      @nepse\_index\_return\_pct, @nepse\_alpha\_pct,

&#x20;      @primary\_broker\_id, @broker\_anomaly\_score, @avg\_ticket\_kitta, @market\_regime,

&#x20;      datetime('now')

&#x20;    )

@@ -267,7 +271,8 @@

&#x20;        const avgVol20 = window20.reduce((s, c) => s + c.volume, 0) / 20;

&#x20;        const vol3DayAvg = window3.reduce((s, c) => s + c.volume, 0) / 3;

\-        const threeDayGainPct = ((dayT.close - candles\[t - 3].close) / candles\[t - 3].close) \* 100;

\+        if (candles\[t - 3].close <= 0 || dayT.close <= 0) continue;

\+        const threeDayGainPct = ((dayT.close - candles\[t - 3].close) / candles\[t - 3].close) \* 100;

&#x20;        const threeDayHigh = Math.max(...window20.map((c) => c.high));

@@ -279,10 +284,11 @@

&#x20;        // Determine Market Regime using 20-day NEPSE Index slope

\-        const nepse20ChangePct =

\-          ((dayT.nepseIndexClose - candles\[t - 20].nepseIndexClose) /

\-            candles\[t - 20].nepseIndexClose) \*

\-          100;

\+        const nepseBase20 = candles\[t - 20].nepseIndexClose;

\+        const nepse20ChangePct =

\+          nepseBase20 > 0

\+            ? ((dayT.nepseIndexClose - nepseBase20) / nepseBase20) \* 100

\+            : 0;

@@ -312,17 +318,20 @@

\-        // Check if Day T+1 locked in an unfillable +9.8% upper circuit or illiquid trap

\+        // Statutory Fourth Amendment 2082 Upper Circuit Gap-Trap Guard (>= +14.9%)

&#x20;        const dayTPlus1LowJumpPct = ((dayTPlus1.low - dayT.close) / dayT.close) \* 100;

&#x20;        const isUnfillableCircuit =

\-          dayTPlus1LowJumpPct >= 9.6 || dayTPlus1.turnover < minTradableTurnoverNpr;

\+          dayTPlus1LowJumpPct >= 14.9 || dayTPlus1.turnover < minTradableTurnoverNpr;

&#x20;

&#x20;        const initialRiskPct = triggeredStrategy === 'STEALTH\_ACCUMULATION' ? 5.0 : 6.0;

&#x20;        const rewardMultiple = triggeredStrategy === 'STEALTH\_ACCUMULATION' ? 2.4 : 2.2;

&#x20;

&#x20;        const initialStopPrice = Number((entryVwap \* (1 - initialRiskPct / 100)).toFixed(2));

&#x20;        const targetPrice = Number(

&#x20;          (entryVwap \* (1 + (initialRiskPct \* rewardMultiple) / 100)).toFixed(2)

&#x20;        );

\+        const target2Price = Number((entryVwap \* 1.15).toFixed(2));

@@ -341,11 +350,13 @@

&#x20;            entry\_vwap: entryVwap,

&#x20;            entry\_turnover\_npr: dayTPlus1.turnover,

&#x20;            target\_price: targetPrice,

\+            target2\_price: target2Price,

&#x20;            initial\_stop\_price: initialStopPrice,

&#x20;            active\_stop\_price: initialStopPrice,

&#x20;            is\_ratchet\_armed: 0,

&#x20;            settlement\_unlock\_date: null,

\+            t2\_unlock\_date: 'UNFILLABLE\_SKIP',

&#x20;            status: 'UNFILLABLE\_SKIP',

@@ -387,7 +398,7 @@

&#x20;          // 1. Check Stop-Loss / Ratchet Stop Breach (Conservative: check stop before target)

&#x20;          if (c.low <= activeStopPrice) {

&#x20;            status = isRatchetArmed ? 'RATCHET\_STOP\_WIN' : 'STOP\_LOSS';

\-            exitPrice = activeStopPrice;

\+            exitPrice = Number(Math.min(c.open > 0 ? c.open : activeStopPrice, activeStopPrice).toFixed(2));

&#x20;            exitIdx = k;

&#x20;            break;

&#x20;          }

@@ -424,13 +435,14 @@

&#x20;          shortTermCgtRate

&#x20;        );

&#x20;

\-        const nepseIndexReturnPct = Number(

\-          (

\-            ((candles\[exitIdx].nepseIndexClose - dayTPlus1.nepseIndexClose) /

\-              dayTPlus1.nepseIndexClose) \*

\-            100

\-          ).toFixed(2)

\-        );

\+        const nepseIndexReturnPct =

\+          dayTPlus1.nepseIndexClose > 0

\+            ? Number(

\+                (

\+                  ((candles\[exitIdx].nepseIndexClose - dayTPlus1.nepseIndexClose) /

\+                    dayTPlus1.nepseIndexClose) \*

\+                  100

\+                ).toFixed(2)

\+              )

\+            : 0;

&#x20;        const nepseAlphaPct = Number((netReturnPct - nepseIndexReturnPct).toFixed(2));

@@ -448,11 +460,13 @@

&#x20;          entry\_vwap: entryVwap,

&#x20;          entry\_turnover\_npr: dayTPlus1.turnover,

&#x20;          target\_price: targetPrice,

\+          target2\_price: target2Price,

&#x20;          initial\_stop\_price: initialStopPrice,

&#x20;          active\_stop\_price: activeStopPrice,

&#x20;          is\_ratchet\_armed: isRatchetArmed,

&#x20;          settlement\_unlock\_date: settlementUnlockDate,

\+          t2\_unlock\_date: settlementUnlockDate,

&#x20;          status,



```



\---



\#### `A1-024` — `proxy/utils/microstructureEngine.js`



```diff

\--- a/proxy/utils/microstructureEngine.js

+++ b/proxy/utils/microstructureEngine.js

@@ -211,22 +211,30 @@

&#x20;  }

&#x20;

&#x20;  const totalActive = oldestFirst.length;

\+  let trailingStreak = 0;

\+  for (let i = oldestFirst.length - 1; i >= 0; i--) {

\+    const vol = Number(oldestFirst\[i].netVol ?? oldestFirst\[i].netQty ?? 0);

\+    if (isAccum ? vol > 0 : vol < 0) {

\+      trailingStreak++;

\+    } else {

\+      break;

\+    }

\+  }

\+

&#x20;  if (isAccum) {

&#x20;    // Find first net-buy date on or after the cumulative trough

&#x20;    const startIdx = oldestFirst.findIndex((d) => {

&#x20;      const vol = Number(d.netVol ?? d.netQty ?? 0);

&#x20;      return String(d.date || '') >= inflectionDateAccum \&\& vol > 0;

&#x20;    });

&#x20;    const startDate = startIdx >= 0 ? oldestFirst\[startIdx].date : oldestFirst\[0].date;

\-    const streakDays = startIdx >= 0 ? oldestFirst.length - startIdx : accumDays;

&#x20;    const consistencyPct = totalActive > 0 ? Number(((accumDays / totalActive) \* 100).toFixed(0)) : 0;

\-    return { startDate, streakDays, activeDaysCount: accumDays, totalActive, consistencyPct };

\+    return { startDate, streakDays: trailingStreak, activeDaysCount: accumDays, totalActive, consistencyPct };

&#x20;  } else {

&#x20;    // Find first net-sell date on or after the cumulative peak

&#x20;    const startIdx = oldestFirst.findIndex((d) => {

&#x20;      const vol = Number(d.netVol ?? d.netQty ?? 0);

&#x20;      return String(d.date || '') >= inflectionDateDump \&\& vol < 0;

&#x20;    });

&#x20;    const startDate = startIdx >= 0 ? oldestFirst\[startIdx].date : oldestFirst\[0].date;

\-    const streakDays = startIdx >= 0 ? oldestFirst.length - startIdx : dumpDays;

&#x20;    const consistencyPct = totalActive > 0 ? Number(((dumpDays / totalActive) \* 100).toFixed(0)) : 0;

\-    return { startDate, streakDays, activeDaysCount: dumpDays, totalActive, consistencyPct };

\+    return { startDate, streakDays: trailingStreak, activeDaysCount: dumpDays, totalActive, consistencyPct };

&#x20;  }

&#x20;}

```\[cite: 1, 2]



```
### 1. Files Inspected in This Turn (100% Coverage Transparency)



\*\*Inspected in full:\*\*



\* `scripts/architect/antigravity\_architect/resources/templates/agent/tools.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/audio.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/c-minimal.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/csharp-dotnet.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/elixir-phoenix.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/fastapi.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/flutter.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/go-fiber.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/java-spring.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/medical.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/nextjs.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/performance.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/rust-axum.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/rust-complex.json`

\* `scripts/architect/antigravity\_architect/resources/templates/blueprints/zig.json`

\* `scripts/architect/antigravity\_architect/resources/templates/common/gitignore\_map.json`

\* `scripts/architect/antigravity\_architect/resources/templates/common/licenses.json`

\* `scripts/architect/antigravity\_architect/resources/templates/ide/fleet\_run.json`

\* `scripts/architect/antigravity\_architect/resources/templates/ide/zed\_tasks.json`

\* `scripts/audit-pipeline.ts`

\* `scripts/verifyBug4AiGuru.ts`

\* `scripts/verifyRegulatoryEngine.ts`

\* `scripts/verifySignalTrackRecord5D.ts`

\* `src/db/migrations/002\_upgrade\_signal\_ledger.sql`

\* `src/services/aiGuru/runAiQuantitativeAssessment.ts`

\* `src/services/aiService.js`

\* `src/services/floorsheet/floorsheetHubEngine.ts`

\* `src/services/fundamentals/nepseRegulatoryEngine.ts`

\* `src/services/merolaganiNewsService.js`

\* `src/services/meroShareService.js`

\* `src/services/meroShareWaccService.js`

\* `src/services/nepseAgentTools.js`

\* `src/services/signalTracker.js`

\* `src/services/stockSnapshot.js`

\* `src/services/whaleDailyArchive.js`



\*\*Inspected partially (input truncated in bundle):\*\*



\* `src/utils/accumulationDistributionEngine.ts` (truncated at `const lookback...` inside `calculateChaikinADL`)







\---



\### 2. Audit Findings Table (Continued from `A1-029`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| `A1-030` | \*\*P0\*\* | `src/db/migrations/002\_upgrade\_signal\_ledger.sql` \& `proxy/db/signalTrackerStore.js` (`v\_strategy\_institutional\_metrics`) | `verified\_win\_rate\_pct` numerator counts `ACTIVE`/`OPEN\_ACTIVE` rows with `net\_return\_pct > 0`, while the denominator excludes `ACTIVE`/`OPEN\_ACTIVE` rows (allowing win rates \*\*> 100%\*\*). `profit\_factor` also fails to exclude `ACTIVE`, `OPEN\_ACTIVE`, and `UNFILLABLE\_SKIP` rows. | Strategy scorecard displays mathematically impossible win rates (>100%) and distorted profit factors using unrealized open positions. | Add `status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')` to both the `verified\_win\_rate\_pct` numerator and `profit\_factor` `SUM` filters. |

| `A1-031` | \*\*P0\*\* | `src/services/aiGuru/runAiQuantitativeAssessment.ts` (`normalize5DBrokerPayloadForAi`, `runAiQuantitativeAssessment`) | 1) `netAccumulationRatio = totalBuyKitta / (totalBuyKitta + totalSellKitta) \* 100` is mathematically locked at \*\*50.0%\*\* on zero-sum full-market broker tables (`drabyashreeDb.ts`), making `INSTITUTIONAL\_ACCUMULATION` (`>= 54`) and `DISTRIBUTION` (`<= 45`) unreachable dead code. 2) `safeNum(item.anomalyScore, computedAnomaly)` accepts `0` sentinels from `floorsheet\_broker\_summary` (`A1-006`) instead of falling back. 3) `metrics.brokerAnomalyScore`/`avgTicketKitta` ignore live `smartMoney5D` when `effectiveLedger` is null, and `metrics` omits `ratchetTriggered` (cross-file mismatch with `ai-guru/assess/route.ts` `A1-010`). | AI Guru never detects Institutional Accumulation or Distribution on real SQLite broker data, displays `0` kitta / `0.10x` anomaly, and breaks ratchet detection downstream. | Compute `netAccumulationRatio` from directional top-5 net buyers vs top-3 net sellers, treat `<= 0` anomaly/ticket fields as missing, fall back to `smartMoney5D.topAccumulators\[0]`, and expose `ratchetTriggered` on `metrics`. |

| `A1-032` | \*\*P0\*\* | `src/services/fundamentals/nepseRegulatoryEngine.ts` (`evaluateNepseFundamentalsAndLockIn`) | 1) Missing fundamentals default to fabricated values (`paidUpCapital = 5\_000\_000\_000`, `bookValuePerShare = 100`, `promoterSharePct = 51`, `epsTtm = 0`), triggering `NEGATIVE\_EARNINGS\_AVOID` (`CRITICAL\_VETO`) on healthy stocks absent from `scrip\_fundamentals`. 2) Empty string `""` for `nplPct`/`carPct`/`hydroCapexPerMwCr` coerces to fabricated passing values (`0`, `11.5`, `16.5`). 3) `else if` suppresses CAR shortfall veto when NPL is also breached, and evaluates CAR/NPL on non-BFI sectors. | Profitable scrips without scraped filings get falsely blacklisted with a `CRITICAL\_VETO` and fake Rs 500 Cr paid-up capital; distressed BFIs hide CAR breaches; non-BFIs with `car\_pct = 0` get false CAR vetoes. | Preserve `null` for missing fundamentals (skip `NEGATIVE\_EARNINGS\_AVOID` when EPS/BVPS are unprovided), treat `""` as `null`, decouple NPL and CAR `if` blocks, and scope NPL/CAR gates to BFI sectors. |

| `A1-033` | \*\*P0\*\* | `src/services/floorsheet/floorsheetHubEngine.ts` (`isPureEquitySymbol`, `enrichFloorsheetContracts`, `buildVolumeProfileFromFloorsheet`, `classifyObir`, `buildUnifiedStockTabTelemetry`, `aggregateBrokersFromContracts`) | 1) `isPureEquitySymbol` falsely drops pure-equity `NMBMF` (`endsWith('MF')`) while admitting promoter shares (`\*P`) and non-digit mutual funds (`NIBLGF`, `SFEF`, `NICFC`). 2) `buildVolumeProfileFromFloorsheet` calls `fallbackCandles.slice(-10)` without sorting—picking the 10 \*\*oldest\*\* bars on DESC candles from `drabyashreeDb.ts`/`ledgerStore.js`. 3) `classifyObir` (`bid/ask`) contradicts `ledgerStore.js` `(bid-ask)/(bid+ask)` and emits `obir: 0` when unavailable. 4) `hasBrokerPayload` treats empty `\[]` as valid, blocking contract fallback; `aggregateBrokersFromContracts` inflates self-trade `avgTicketKitta` 2x; `enrichFloorsheetContracts` ignores `contractId`, allows `rate <= 0`, and uses UTC date. | `NMBMF` disappears from Floorsheet Hub; POC volume profiles compute on months-old prices; L2 OBIR signals contradict backend depth metrics; self-trades double-inflate ticket sizes. | Whitelist `NMBMF`/`SWMF` and exclude `\*P`/mutual funds consistently with `ledgerStore.js`; sort `fallbackCandles` ascending before `.slice(-10)`; require `length > 0` for `hasBrokerPayload`; track `sideCount` for `avgTicketKitta`; align `obir` and guard `rate > 0` + NPT date. |

| `A1-034` | \*\*P0\*\* | `src/services/aiService.js` (`generateOfflineStockReport`) | 1) Reads `eps`, `pe`, `bookValue`, `volume`, `turnover`, `pChange`, `high`, `low`, `prevClose`, `high52w`, `low52w`, `change` from outer wrapper `stock` instead of unwrapped `actualStock`. 2) Wrong `chg`/`prevClose` formula: computes `chg = ltp \* (pChg / 100)` instead of `ltp - ltp / (1 + pChg / 100)`. 3) Reads `realPriceHistory\[length - 1]` for `ltp` before sorting (picks oldest candle on DESC SQLite arrays). 4) Passes `volume` as `avgVolume20D` fallback, fabricating a `0` Z-score. | Offline AI Guru reports drop all fundamentals/ranges on wrapped payloads, display wrong `prevClose`/point change (e.g., Rs 99 instead of Rs 100 on +10% move), and pull stale historical prices as live LTP. | Read all fields from `actualStock`, sort `realPriceHistory` chronologically before LTP extraction, compute `prevClose = ltp / (1 + pChg / 100)` and `chg = ltp - prevClose`, and only compute Z-score when `avgVolume20D > 0`. |

| `A1-035` | \*\*P0\*\* | `src/services/merolaganiNewsService.js` (`fetchMerolaganiNews`, `detectMarketHaltFromNews`) | Direct scraper hardcodes `date: 'Today'` on every scraped headline—including weeks-old articles from `NewsList.aspx?popular=true`—and `detectMarketHaltFromNews` triggers `setDynamicMarketHalt()` without verifying article date or excluding popular archives. | A weeks-old "NEPSE trading halted" article still trending on Merolagani Popular News falsely trips the emergency market halt banner and locks the app into `yesterday` status during live trading. | Exclude `popular=true` from emergency halt detection, preserve actual parsed dates (never hardcode `'Today'` when unknown), and only trigger `setDynamicMarketHalt` on verified current-day NPT articles. |

| `A1-036` | \*\*P0\*\* | `src/services/meroShareService.js` (`applyIpoDirect`) | 1) If user's selected IPO is absent from CDSC applicable issues and `list.length === 1`, silently substitutes `list\[0].companyShareId` and submits a live C-ASBA application for the \*\*wrong company\*\*. 2) Sends 16-digit `demat` in `boid` field instead of 8-digit client BOID (`valResult.sanitizedPayload.boid`). 3) Overrides issue `maxKitta` with `Math.max(resolvedMaxUnits, 10000)` and hardcodes `issueType: 'IPO'` (breaking Right Share applications). | \*\*Real capital loss / bank block:\*\* investor clicks Apply on a closed IPO and automatically applies with real bank funds to an unintended debenture, mutual fund, or local IPO. | Remove the `list.length === 1` blind fallback (fail loudly if no match), use `valResult.sanitizedPayload.boid` (8-digit), honor actual `resolvedMaxUnits`, and pass actual `issueType`. |

| `A1-037` | \*\*P0\*\* | `src/services/meroShareService.js` (`checkSingleBoidAllotment`, `checkBulkIpoResults`, `pullMeroShareLivePortfolio`, `parseMeroShareCsv`) | 1) `checkSingleBoidAllotment` matches ASBA reports on `common.length >= 1` generic words (`hydro`, `bank`, `nepal`, `power`), returning a different company's allotment; NMB Capital native branch returns `allotted: true, units: 10` even when `allotments` is `\[]`. 2) `checkBulkIpoResults` maps failed checks (`check.success === false`) to `'not\_allotted'`. 3) `pullMeroShareLivePortfolio` unconditionally overwrites official `waccReport` with `myHolding`, prices missing LTP at Rs 100 par, and rejects legitimate Rs 100 IPO WACCs (`!== 100`). 4) `parseMeroShareCsv` splits naively on `,`, corrupting quoted numbers like `"1,250.50"`. | False "Allotted" or false "Not Allotted" IPO notifications, wrong WACC overwriting CDSC official WACC, fake Rs 100 valuations on missing quotes, and corrupted CSV portfolio imports. | Tighten company name matching (require exact/majority non-generic tokens), verify `allotments.length > 0`, preserve `'error'` status in bulk results, skip `myHolding` overwrite when `waccReport` exists, flag missing LTP instead of fabricating Rs 100, and use a quote-aware CSV row parser. |

| `A1-038` | \*\*P0\*\* | `src/services/meroShareWaccService.js` (`parseMeroShareWaccDetailsResponse`, `matchWaccRecordsToHoldings`) | 1) `Number("1,250.50")` produces `NaN` on comma-formatted CDSC numbers; `verifyWaccMath` evaluates `NaN > tolerance` as `false`, marking `NaN` records `isValid: true`. 2) `matchWaccRecordsToHoldings` overwrites valid existing `holding.wacc` when `waccRate` is `<= 0` or `NaN` and fails to cap covered-share investment calculation. | Corrupted `NaN` WACCs silently pass validation and wipe out portfolio cost basis and CGT estimates. | Strip commas before numeric parsing (`parseCleanNum`), reject non-finite/non-positive rates in `verifyWaccMath` and `matchWaccRecordsToHoldings`, and compute `coveredInvestment` separately from uncovered shares. |

| `A1-039` | \*\*P0\*\* | `src/services/nepseAgentTools.js` (`fetchAgentScripDossier`, `runAgentAnalysis`) | 1) Reads `rawCandles\[rawCandles.length - 1]` for `ltp`/`prevClose`/`volume` and passes unsorted candles to RSI/EMA/MACD/ATR (inverting all technicals and circuit limits when candles arrive DESC from SQLite). 2) `sumQty` omits `buyVol`/`sellVol`/`buyKitta`/`sellKitta` used by `radarRoutes.js`/`ledgerStore.js`. 3) `runAgentAnalysis` misses `pData?.data?.analysis` returned by `/api/guru/analyze` and lacks `AbortSignal.timeout` on `fetch()`. | Agent dossiers compute upside-down RSI/EMA/MACD and stale circuit limits on DESC histories, report missing broker flows, and hang indefinitely on stalled API calls. | Sort `rawCandles` chronologically ascending before any reads/indicators, support `buyVol`/`sellVol`/`buyKitta`/`sellKitta` + `bcr5NetPct`/`scr3NetPct`, read `pData?.data?.analysis`, and add timeouts to all `fetch()` calls. |

| `A1-040` | \*\*P0\*\* | `src/services/signalTracker.js` (`updateSignalOutcome`, `evaluateOpenSignals`, `expireOldSignals`, `getSignalStats`, `closeSignalManually`) | 1) `highestSeen`/`lowestSeen` include unreachable Day T / Day T+1 prices during CDSC T+2 lock, and `evaluateOpenSignals` live path skips T+2 lock unless `options.enforceSettlementLock` is explicitly `true` (default falsy). 2) `updateSignalOutcome` uses `holdSessions < 2 \&\& holdingDays < 2`, letting Friday signals exit on Sunday with 0 trading sessions elapsed. 3) `expireOldSignals` sets `exitPrice = entryPrice` (`0%` PnL), hiding losses. 4) `getSignalStats` computes win rate, profit factor, and expectancy on \*\*gross\*\* `returnPct` instead of post-fee `netReturnPct`. 5) `closeSignalManually` divides by `0` if `entryPrice <= 0` and uses UTC date. | Local Signal Tracker reports inflated win rates from impossible T+1/weekend exits, counts net-losing trades (+0.4% gross) as wins, and erases losses on expired trades. | Enforce `holdSessions < 2` unconditionally (` |

| `A1-041` | \*\*P0\*\* | `src/services/whaleDailyArchive.js` (`captureDailyWhaleSnapshot`) | 1) Inline equity filter drops pure-equity microfinance stocks (`endsWith('BS')` drops `DLBS`/`ILBS`/`LLBS`/`MLBS`/`VLBS`; `endsWith('MF')` drops `NMBMF`/`SWMF`) while admitting promoter shares (`\*P`/`\*PO`) and `D20xx` debentures. 2) Trade dedupe checks `t.contractId` only (ignoring `contractNo`/`contract\_no`) and falls back to `idx`, double-counting volume on every rescan. 3) `previousSnapshot` uses `s.date !== marketDate` instead of `s.date < marketDate` (lookahead bias). 4) Uses UTC date instead of NPT and fabricates `10,000,000` `listedShares` when missing from static `NEPSE\_UNIVERSE`. | Major microfinance equities vanish from Top 5 Whale Accumulation/Distribution; rescans double-count intraday volume; historical captures suffer lookahead bias; newly listed stocks get fabricated float ratios. | Use shared `isPureNepseEquity(sym, s.sector)`, check `contractId ?? contractNo ?? contract\_no` without `idx` in dedupe key, sort archive descending and pick `s.date < marketDate`, use NPT date, and omit fabricated `10,000,000` float fallback when `listedShares` is unknown. |

| `A1-042` | \*\*P0\*\* | `src/utils/accumulationDistributionEngine.ts` (`calculateChaikinADL`) | 1) Accumulates `ADL` over unsorted `candles` (DESC arrays from SQLite invert ADL trend and divergence). 2) Silently coerces missing/0 `high`, `low`, or `close` to `100` instead of skipping corrupt bars. | Chaikin ADL trend (`Accumulation` vs `Distribution`) and divergences flip sign on DESC histories or corrupt on missing bars. | Sort candles chronologically ascending by `date`/`time` before iterating and skip bars with `close <= 0 |

| `A1-043` | \*\*P1\*\* | `src/services/meroShareService.js` (`authenticateMeroShare`, `cdscRequest`) | 1) `bankKeywords` filter (`w.length > 3`) retains generic words (`"limited"`, `"bank"`, `"capital"`, `"securities"`), matching up to all 133 DPs in `MEROSHARE\_DP\_LIST` and hammering CDSC `/auth/` up to 133 times on any non-401 error. 2) Web `cdscRequest` `fetch()` has no timeout. | Triggers F5 BIG-IP WAF IP bans and CDSC account lockouts; hangs web portfolio/IPO UI indefinitely on CDSC stalls. | Exclude generic stopwords (`limited`, `bank`, `capital`, `securities`, `private`, `company`, `finance`, `investment`, `merchant`, `stock`, `broker`, `nepal`) and cap fallback candidates to `<= 3`; add `AbortSignal.timeout(25000)` to web `cdscRequest`. |

| `A1-044` | \*\*P1\*\* | `src/services/merolaganiNewsService.js` (`detectCorporateActionAlerts`, `analyzePoliticalAndMarketPulse`) | Performs case-sensitive `.includes()` against lowercase English keywords (`'no dividend'`, `'right share'`, `'book closure'`, `'agm'`). | All title-case or uppercase English announcements (e.g., `"NABIL Book Closure \& AGM"`, `"Right Share"`) are silently missed by corporate action alerts and sentiment scoring. | Compare against `text.toLowerCase()` alongside original Nepali text. |

| `A1-045` | \*\*P1\*\* | `src/services/stockSnapshot.js` (`fetchStockSnapshot`, `enrichStockFromSnapshot`) | 1) Caches failed/partial snapshots (`ltp: null`) in `snapshotCache` for 30s and stamps `dataTimestamp: new Date().toISOString()` without `isStale`. 2) `enrichStockFromSnapshot` spreads raw `...liveDetail` over sanitized `snapshot`, re-introducing `high < low` or `eps: 0`. 3) `liveDetail.promoterPercentage ? ... : null` treats `0%` promoter (100% public) as `null`. | Transient API blips lock a scrip into `ltp: null` for 30s with a fresh timestamp; sanitized OHLC/EPS fields get overwritten by raw broken fields. | Only cache when `liveDetail \&\& snapshot.ltp > 0`, expose `isStale` + upstream `dataTimestamp`, preserve sanitized fields in `enrichStockFromSnapshot`, and check `liveDetail.promoterPercentage != null`. |

| `A1-046` | \*\*P1\*\* | `scripts/audit-pipeline.ts` (`runAuditPipeline`) | 1) Queries `MAX(trade\_time)` (`HH:MM:SS`) on `floorsheet\_contracts` and tests `.startsWith(targetSessionDate)` (`YYYY-MM-DD`), permanently flagging live sessions as `STALE`. 2) Hardcodes `'2026-11-19'` in broker parity check and only fails if `totalVolume === 0`, passing arbitrary non-zero discrepancies. | Automated CI/production health audit produces false `STALE` failures during market hours while missing real broker volume parity drifts. | Query `MAX(trade\_date)` on `floorsheet\_contracts`, use dynamic `sampleDate`, and assert exact volume parity (`totalVolume !== dbNabilVol.total\_buy\_vol`). |

| `A1-047` | \*\*P2\*\* | `src/services/aiGuru/runAiQuantitativeAssessment.ts` (`runAiQuantitativeAssessment`) | Client-side `fetch()` to `/api/stocks/:symbol/ledger-telemetry` has no `AbortSignal.timeout`; hardcoded `roundTripFeePct = 1.12` ignores SEBON tiered commission slabs. | Slow backend stalls AI Guru rendering indefinitely; breakeven hurdle drifts slightly on small (<50k) vs large (>20L) orders. | Add `signal: AbortSignal.timeout(8000)` and compute breakeven fee hurdle from `marketRules.js`. |

| `A1-048` | \*\*P2\*\* | `src/services/merolaganiNewsService.js` (`resolveSymbolFromText`) | Unconstrained uppercase word regex `/\\b\[A-Z0-9]{2,10}\\b/g` matches common acronyms (`API`, `BBC`, `MEN`, `CIT`) in non-stock headlines. | Unrelated news headlines mentioning "API" or "BBC" attach false corporate alerts to `API` (Api Power) or `BBC` (Bishal Bazar). | Exclude ambiguous English stop-words/acronyms from bare-word matching unless inside parentheses `(API)` or accompanied by Nepali/English company name. |

| `A1-049` | \*\*P2\*\* | `src/services/whaleDailyArchive.js` (`SESSION\_FLOORSHEET\_REGISTRY`) | Module-level `Map` accumulates full session floorsheet trades across days without evicting prior dates. | Gradual RAM growth in long-running Electron desktop or pinned browser tabs. | Evict entries where `date !== marketDate` when a new `marketDate` begins. |

| `A1-050` | \*\*P3\*\* | `scripts/verifyBug4AiGuru.ts` \& `scripts/verifyRegulatoryEngine.ts` | `verifyBug4AiGuru.ts` mutates `Object.prototype` and instantiates `unorderedCandles` without passing it into `resolveVerifiedPrice`; `verifyRegulatoryEngine.ts` test labels cite obsolete `4.8%` NPL / `60` day lock-in thresholds. | Test hygiene drift and misleading verification output. | Remove `Object.prototype` mutation, test `unorderedCandles` directly, and sync assertion descriptions to `5.0%` NPL / `120` days. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 \& P1 Bugs Only)



\#### `A1-030` — `src/db/migrations/002\_upgrade\_signal\_ledger.sql` \& `proxy/db/signalTrackerStore.js`



```diff

\--- a/src/db/migrations/002\_upgrade\_signal\_ledger.sql

+++ b/src/db/migrations/002\_upgrade\_signal\_ledger.sql

@@ -51,18 +51,21 @@

&#x20;CREATE VIEW IF NOT EXISTS v\_strategy\_institutional\_metrics AS

&#x20;SELECT

&#x20;    strategy,

&#x20;    COUNT(\*) FILTER (WHERE status != 'UNFILLABLE\_SKIP') AS total\_tradable\_signals,

&#x20;    COUNT(\*) FILTER (WHERE status = 'UNFILLABLE\_SKIP') AS skipped\_circuit\_traps,

&#x20;    ROUND(

\-        100.0 \* COUNT(\*) FILTER (WHERE status IN ('TARGET\_HIT', 'RATCHET\_STOP\_WIN', 'WIN\_T1', 'WIN\_T2', 'WIN\_RATCHET\_STOP') OR (status != 'UNFILLABLE\_SKIP' AND net\_return\_pct > 0))

\+        100.0 \* COUNT(\*) FILTER (

\+            WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')

\+              AND (status IN ('TARGET\_HIT', 'RATCHET\_STOP\_WIN', 'WIN\_T1', 'WIN\_T2', 'WIN\_RATCHET\_STOP') OR net\_return\_pct > 0)

\+        )

&#x20;        / NULLIF(COUNT(\*) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')), 0),

&#x20;        2

&#x20;    ) AS verified\_win\_rate\_pct,

&#x20;    ROUND(AVG(net\_return\_pct) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')), 2) AS net\_expectancy\_pct,

&#x20;    ROUND(AVG(nepse\_alpha\_pct) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')), 2) AS avg\_nepse\_alpha\_pct,

&#x20;    ROUND(

\-        SUM( CASE WHEN net\_return\_pct > 0 THEN net\_return\_pct ELSE 0 END )

\-        / NULLIF(ABS(SUM( CASE WHEN net\_return\_pct < 0 THEN net\_return\_pct ELSE 0 END )), 0),

\+        SUM( CASE WHEN status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP') AND net\_return\_pct > 0 THEN net\_return\_pct ELSE 0 END )

\+        / NULLIF(ABS(SUM( CASE WHEN status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP') AND net\_return\_pct < 0 THEN net\_return\_pct ELSE 0 END )), 0),

&#x20;        2

&#x20;    ) AS profit\_factor,



```



```diff

\--- a/proxy/db/signalTrackerStore.js

+++ b/proxy/db/signalTrackerStore.js

@@ -225,18 +225,22 @@

&#x20;    // Create Institutional Strategy Scorecard View

&#x20;    db.exec(`

\-      CREATE VIEW IF NOT EXISTS v\_strategy\_institutional\_metrics AS

\+      DROP VIEW IF EXISTS v\_strategy\_institutional\_metrics;

\+      CREATE VIEW v\_strategy\_institutional\_metrics AS

&#x20;      SELECT

&#x20;          strategy,

&#x20;          COUNT(\*) FILTER (WHERE status != 'UNFILLABLE\_SKIP') AS total\_tradable\_signals,

&#x20;          COUNT(\*) FILTER (WHERE status = 'UNFILLABLE\_SKIP') AS skipped\_circuit\_traps,

&#x20;          ROUND(

\-              100.0 \* COUNT(\*) FILTER (WHERE status IN ('TARGET\_HIT', 'RATCHET\_STOP\_WIN', 'WIN\_T1', 'WIN\_T2', 'WIN\_RATCHET\_STOP') OR (status != 'UNFILLABLE\_SKIP' AND net\_return\_pct > 0))

\+              100.0 \* COUNT(\*) FILTER (

\+                  WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')

\+                    AND (status IN ('TARGET\_HIT', 'RATCHET\_STOP\_WIN', 'WIN\_T1', 'WIN\_T2', 'WIN\_RATCHET\_STOP') OR net\_return\_pct > 0)

\+              )

&#x20;              / NULLIF(COUNT(\*) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')), 0),

&#x20;              2

&#x20;          ) AS verified\_win\_rate\_pct,

&#x20;          ROUND(AVG(net\_return\_pct) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')), 2) AS net\_expectancy\_pct,

&#x20;          ROUND(AVG(nepse\_alpha\_pct) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP')), 2) AS avg\_nepse\_alpha\_pct,

&#x20;          ROUND(

\-              SUM( CASE WHEN net\_return\_pct > 0 THEN net\_return\_pct ELSE 0 END )

\-              / NULLIF(ABS(SUM( CASE WHEN net\_return\_pct < 0 THEN net\_return\_pct ELSE 0 END )), 0),

\+              SUM( CASE WHEN status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP') AND net\_return\_pct > 0 THEN net\_return\_pct ELSE 0 END )

\+              / NULLIF(ABS(SUM( CASE WHEN status NOT IN ('ACTIVE', 'OPEN\_ACTIVE', 'UNFILLABLE\_SKIP') AND net\_return\_pct < 0 THEN net\_return\_pct ELSE 0 END )), 0),

&#x20;              2

&#x20;          ) AS profit\_factor,



```



\---



\#### `A1-031` — `src/services/aiGuru/runAiQuantitativeAssessment.ts`



```diff

\--- a/src/services/aiGuru/runAiQuantitativeAssessment.ts

+++ b/src/services/aiGuru/runAiQuantitativeAssessment.ts

@@ -88,6 +88,7 @@

&#x20;    roundTripFeePct: number; // NEPSE broker + SEBON + DP + 7.5% CGT impact

&#x20;    ratchetTriggerPrice: number; // Entry + 1.2R target

&#x20;    ratchetStopPrice: number; // Entry + 1.2% post-fee shield

\+    ratchetTriggered: boolean;

&#x20;    t2UnlockStatus: string;

&#x20;    mfePct: number;

&#x20;    maePct: number;

@@ -234,16 +235,19 @@

&#x20;    const buyKitta = safeNum(item.buyKitta ?? item.buy\_kitta ?? item.buyVolume ?? item.buy\_vol, 0);

&#x20;    const sellKitta = safeNum(item.sellKitta ?? item.sell\_kitta ?? item.sellVolume ?? item.sell\_vol, 0);

&#x20;    const netKitta = safeNum(item.netKitta ?? item.net\_kitta, buyKitta - sellKitta);

\-    const tradeCount = Math.max(1, safeNum(item.trades ?? item.trade\_count ?? item.totalTrades, 1));

\-    const avgTicketKitta = safeNum(

\-      item.avgTicketKitta ?? item.avg\_ticket\_kitta,

\-      (buyKitta + sellKitta) / tradeCount

\-    );

\+    const tradeCount = Math.max(1, safeNum(item.sideCount ?? item.trades ?? item.trade\_count ?? item.totalTrades, 1));

\+    const explicitAvgTicket = safeNum(item.avgTicketKitta ?? item.avg\_ticket\_kitta, 0);

\+    const avgTicketKitta =

\+      explicitAvgTicket > 0

\+        ? explicitAvgTicket

\+        : (buyKitta + sellKitta) / tradeCount;

&#x20;

&#x20;    const baselineShare = RETAIL\_GIANT\_BASELINE\[brokerId] ?? 0.018;

&#x20;    const scripBuyShare = totalBuyKitta > 0 ? buyKitta / totalBuyKitta : baselineShare;

&#x20;    const ticketMultiplier = avgTicketKitta >= 300 ? 1.35 : avgTicketKitta < 45 ? 0.65 : 1.0;

&#x20;

&#x20;    const computedAnomaly = (scripBuyShare / baselineShare) \* ticketMultiplier;

\-    const rawAnomaly = safeNum(

\-      item.anomalyScore ?? item.broker\_anomaly\_score,

\-      computedAnomaly

\-    );

\+    const explicitAnomaly = safeNum(item.anomalyScore ?? item.broker\_anomaly\_score, 0);

\+    const rawAnomaly = explicitAnomaly > 0 ? explicitAnomaly : computedAnomaly;

@@ -295,15 +299,22 @@

&#x20;  const totalDistSellQty = distributors.reduce((s, b) => s + (b.sellKitta || 0), 0);

&#x20;  const avgSellingPrice = totalDistSellQty > 0 ? Number((totalDistSellAmt / totalDistSellQty).toFixed(2)) : null;

&#x20;

\-  const totalVolume = totalBuyKitta + totalSellKitta;

\+  // Directional institutional accumulation pressure: Top-5 Net Buyers vs Top-3 Net Sellers.

\+  // Avoids zero-sum symmetry where SUM(buyKitta) === SUM(sellKitta) locks buy/(buy+sell) at 50.0%.

\+  const top5NetBuy = topAccumulators.reduce((s, b) => s + Math.max(0, b.netKitta), 0);

\+  const top3NetSell = topDistributors.slice(0, 3).reduce((s, b) => s + Math.abs(b.netKitta), 0);

\+  const dirTotal = top5NetBuy + top3NetSell;

&#x20;  const netAccumulationRatio =

\-    totalVolume > 0

\-      ? Number(((totalBuyKitta / totalVolume) \* 100).toFixed(1))

\+    dirTotal > 0

\+      ? Number(((top5NetBuy / dirTotal) \* 100).toFixed(1))

&#x20;      : 50;

&#x20;

&#x20;  const topAcc = topAccumulators\[0];

\+  const topDist = topDistributors\[0];

&#x20;  let dominantRegime: BrokerSmartMoney5DSummary\["dominantRegime"] = "NEUTRAL";

\-  if (topAcc \&\& (topAcc.anomalyScore >= 1.75 || topAcc.anomalyScore >= 1.4) \&\& topAcc.avgTicketKitta >= 300 \&\& netAccumulationRatio >= 54) {

\+  if (topAcc \&\& topAcc.anomalyScore >= 1.4 \&\& topAcc.avgTicketKitta >= 300 \&\& netAccumulationRatio >= 54) {

&#x20;    dominantRegime = "INSTITUTIONAL\_ACCUMULATION";

\-  } else if (netAccumulationRatio <= 45) {

\+  } else if (netAccumulationRatio <= 45 || (topDist \&\& Math.abs(topDist.netKitta) > (topAcc?.netKitta || 0) \* 1.35)) {

&#x20;    dominantRegime = "DISTRIBUTION";

&#x20;  } else if (topAcc \&\& topAcc.avgTicketKitta < 45) {

&#x20;    dominantRegime = "RETAIL\_CHURN";

@@ -395,8 +406,6 @@

&#x20;  const mfePct = safeNum(effectiveLedger?.mfe\_pct, 0);

&#x20;  const maePct = safeNum(effectiveLedger?.mae\_pct, 0);

&#x20;  const nepseAlphaPct = safeNum(effectiveLedger?.nepse\_alpha\_pct, 0);

\-  const brokerAnomalyScore = safeNum(effectiveLedger?.broker\_anomaly\_score, 1.0);

\-  const avgTicketKitta = safeNum(effectiveLedger?.avg\_ticket\_kitta, 0);

&#x20;  const unlockDate = effectiveLedger?.settlement\_unlock\_date || "Unlocked / No Active Lock";

&#x20;

\+  const ledgerAnomaly = safeNum(effectiveLedger?.broker\_anomaly\_score, 0);

\+  const ledgerTicket = safeNum(effectiveLedger?.avg\_ticket\_kitta, 0);

\+

\+  const normalizedSmartMoney = params.normalizeBrokerFn \&\& params.broker5DRawPayload

\+    ? params.normalizeBrokerFn(params.broker5DRawPayload)

\+    : (params.broker5DRawPayload ? normalize5DBrokerPayloadForAi(params.broker5DRawPayload) : null);

\+

\+  const liveTopAcc = normalizedSmartMoney?.topAccumulators?.\[0] || null;

\+  const brokerAnomalyScore = liveTopAcc?.anomalyScore || (ledgerAnomaly > 0 ? ledgerAnomaly : 1.0);

\+  const avgTicketKitta = liveTopAcc?.avgTicketKitta || ledgerTicket;

\+  const ratchetTriggered = Boolean(effectiveLedger?.ratchet\_triggered) || (price >= ratchetTriggerPrice \&\& ratchetTriggerPrice > 0);

\+

&#x20;  const defaultSmartMoney: BrokerSmartMoney5DSummary = {

&#x20;    netAccumulationRatio: 50,

&#x20;    topAccumulators: \[],

@@ -411,9 +420,7 @@

&#x20;        : "NEUTRAL",

&#x20;  };

&#x20;

\-  const smartMoney5D = params.normalizeBrokerFn \&\& params.broker5DRawPayload

\-    ? params.normalizeBrokerFn(params.broker5DRawPayload)

\-    : defaultSmartMoney;

\+  const smartMoney5D = normalizedSmartMoney || defaultSmartMoney;

@@ -470,6 +477,7 @@

&#x20;      roundTripFeePct,

&#x20;      ratchetTriggerPrice,

&#x20;      ratchetStopPrice,

\+      ratchetTriggered,

&#x20;      t2UnlockStatus: unlockDate,



```



\---



\#### `A1-032` — `src/services/fundamentals/nepseRegulatoryEngine.ts`



```diff

\--- a/src/services/fundamentals/nepseRegulatoryEngine.ts

+++ b/src/services/fundamentals/nepseRegulatoryEngine.ts

@@ -51,21 +51,21 @@

&#x20;  verifiedPrice: number | null;

&#x20;  metrics: {

\-    epsTtm: number;

\-    distributableEps: number;

\-    bookValuePerShare: number;

\+    epsTtm: number | null;

\+    distributableEps: number | null;

\+    bookValuePerShare: number | null;

&#x20;    peRatio: number | null;

&#x20;    pbvRatio: number | null;

\-    roePct: number;

\+    roePct: number | null;

&#x20;    grahamFairValue: number | null;

&#x20;    valuationMarginPct: number | null;

&#x20;    nplPct: number | null;

&#x20;    carPct: number | null;

&#x20;    hydroCapexPerMwCr: number | null;

&#x20;    hydroCodDelayed: boolean;

\-    promoterSharePct: number;

\-    publicSharePct: number;

\-    paidUpCapitalCr: number;

\+    promoterSharePct: number | null;

\+    publicSharePct: number | null;

\+    paidUpCapitalCr: number | null;

&#x20;  };

@@ -100,53 +100,66 @@

&#x20;  const sector = String(raw.sector || raw.sectorName || "Others");

&#x20;  const fiscalQuarter = String(raw.fiscalQuarter ?? raw.fiscal\_quarter ?? raw.quarter ?? "Q4 2082/83");

&#x20;

\-  const epsTtm = safeNum(raw.epsTtm ?? raw.eps\_ttm ?? raw.eps, 0);

\-  const distributableEps = safeNum(

\-    raw.distributableEps ?? raw.distributable\_eps,

\-    epsTtm \* 0.75

\-  );

\-  const bookValuePerShare = Math.max(

\-    1,

\-    safeNum(raw.bookValuePerShare ?? raw.book\_value\_per\_share ?? raw.bookValue ?? raw.bvps, 100)

\-  );

\-  const roePct = safeNum(

\-    raw.roePct ?? raw.roe\_pct,

\-    bookValuePerShare > 0 ? Number(((epsTtm / bookValuePerShare) \* 100).toFixed(2)) : 0

\-  );

\-

\-  const rawNpl = raw.nplPct ?? raw.npl\_pct;

\-  const nplPct = rawNpl !== undefined \&\& rawNpl !== null ? safeNum(rawNpl, 0) : null;

\-

\-  const rawCar = raw.carPct ?? raw.car\_pct;

\-  const carPct = rawCar !== undefined \&\& rawCar !== null ? safeNum(rawCar, 11.5) : null;

\-

\-  const rawCapex = raw.hydroCapexPerMwCr ?? raw.hydro\_capex\_per\_mw\_cr;

\-  const hydroCapexPerMwCr =

\-    rawCapex !== undefined \&\& rawCapex !== null ? safeNum(rawCapex, 16.5) : null;

\+  const parseOptionalNum = (val: unknown): number | null => {

\+    if (val === undefined || val === null || String(val).trim() === "") return null;

\+    const n = safeNum(val, Number.NaN);

\+    return Number.isFinite(n) ? n : null;

\+  };

\+

\+  const epsTtm = parseOptionalNum(raw.epsTtm ?? raw.eps\_ttm ?? raw.eps);

\+  const distributableEps =

\+    parseOptionalNum(raw.distributableEps ?? raw.distributable\_eps) ??

\+    (epsTtm !== null ? Number((epsTtm \* 0.75).toFixed(2)) : null);

\+  const rawBvps = parseOptionalNum(raw.bookValuePerShare ?? raw.book\_value\_per\_share ?? raw.bookValue ?? raw.bvps);

\+  const bookValuePerShare = rawBvps !== null ? Math.max(1, rawBvps) : null;

\+  const roePct =

\+    parseOptionalNum(raw.roePct ?? raw.roe\_pct) ??

\+    (epsTtm !== null \&\& bookValuePerShare !== null \&\& bookValuePerShare > 0

\+      ? Number(((epsTtm / bookValuePerShare) \* 100).toFixed(2))

\+      : null);

\+

\+  const nplPct = parseOptionalNum(raw.nplPct ?? raw.npl\_pct);

\+  const carPct = parseOptionalNum(raw.carPct ?? raw.car\_pct);

\+  const hydroCapexPerMwCr = parseOptionalNum(raw.hydroCapexPerMwCr ?? raw.hydro\_capex\_per\_mw\_cr);

&#x20;  const hydroCodDelayed = Boolean(raw.hydroCodDelayed ?? raw.hydro\_cod\_delayed ?? false);

&#x20;

\-  const promoterSharePct = safeNum(raw.promoterSharePct ?? raw.promoter\_share\_pct ?? raw.promoterPercentage ?? raw.promoterPct, 51);

\-  const publicSharePct = safeNum(

\-    raw.publicSharePct ?? raw.public\_share\_pct ?? raw.publicPercentage ?? raw.publicPct,

\-    100 - promoterSharePct

\-  );

\-  const paidUpCapital = safeNum(raw.paidUpCapital ?? raw.paid\_up\_capital, 5\_000\_000\_000);

\-  const paidUpCapitalCr = Number((paidUpCapital / 10\_000\_000).toFixed(2));

\+  const promoterSharePct = parseOptionalNum(raw.promoterSharePct ?? raw.promoter\_share\_pct ?? raw.promoterPercentage ?? raw.promoterPct);

\+  const publicSharePct =

\+    parseOptionalNum(raw.publicSharePct ?? raw.public\_share\_pct ?? raw.publicPercentage ?? raw.publicPct) ??

\+    (promoterSharePct !== null ? Number((100 - promoterSharePct).toFixed(2)) : null);

\+  const paidUpCapital = parseOptionalNum(raw.paidUpCapital ?? raw.paid\_up\_capital);

\+  const paidUpCapitalCr =

\+    paidUpCapital !== null \&\& paidUpCapital > 0 ? Number((paidUpCapital / 10\_000\_000).toFixed(2)) : null;

&#x20;

&#x20;  const price =

&#x20;    params.verifiedPrice \&\& params.verifiedPrice > 0 ? params.verifiedPrice : null;

&#x20;

&#x20;  const peRatio =

\-    price !== null \&\& epsTtm !== 0 ? Number((price / epsTtm).toFixed(2)) : null;

\+    price !== null \&\& epsTtm !== null \&\& epsTtm !== 0 ? Number((price / epsTtm).toFixed(2)) : null;

&#x20;  const pbvRatio =

\-    price !== null \&\& bookValuePerShare > 0

\+    price !== null \&\& bookValuePerShare !== null \&\& bookValuePerShare > 0

&#x20;      ? Number((price / bookValuePerShare).toFixed(2))

&#x20;      : null;

&#x20;

&#x20;  const grahamFairValue =

\-    epsTtm > 0 \&\& bookValuePerShare > 0

\+    epsTtm !== null \&\& epsTtm > 0 \&\& bookValuePerShare !== null \&\& bookValuePerShare > 0

&#x20;      ? Number(Math.sqrt(22.5 \* epsTtm \* bookValuePerShare).toFixed(2))

&#x20;      : null;

&#x20;

&#x20;  const valuationMarginPct =

\-    price !== null \&\& grahamFairValue > 0

\+    price !== null \&\& grahamFairValue !== null \&\& grahamFairValue > 0

&#x20;      ? Number((((grahamFairValue - price) / price) \* 100).toFixed(1))

&#x20;      : null;

@@ -183,20 +196,24 @@

&#x20;  const regulatoryGates: EvaluatedFundamentalTelemetry\["regulatoryGates"] = \[];

&#x20;

&#x20;  // Gate 1: NRB NPL (>= 5.0%) \& CAR (< 11.0%) Prudential Directive Check (BFIs only)

\-  if (nplPct !== null \&\& nplPct >= 5.0) {

\-    regulatoryGates.push({

\-      code: "NRB\_REGULATORY\_FAIL",

\-      severity: "CRITICAL\_VETO",

\-      title: `NRB Prudential Veto: NPL ${nplPct.toFixed(2)}% (>= 5.0% Ceiling)`,

\-      detail:

\-        "Non-Performing Loans breach NRB's 5.0% statutory ceiling, triggering dividend distribution restrictions and loan-loss provisioning.",

\-    });

\-  } else if (carPct !== null \&\& carPct < 11.0) {

\-    regulatoryGates.push({

\-      code: "NRB\_REGULATORY\_FAIL",

\-      severity: "CRITICAL\_VETO",

\-      title: `Capital Adequacy Veto: CAR ${carPct.toFixed(2)}% (< 11.0% Floor)`,

\-      detail:

\-        "Capital Adequacy Ratio is below NRB's 11.0% minimum capital buffer requirement, blocking bonus and cash dividends.",

\-    });

\+  const isBfiSector = /bank|finance|microfinance/i.test(sector);

\+  if (isBfiSector) {

\+    if (nplPct !== null \&\& nplPct >= 5.0) {

\+      regulatoryGates.push({

\+        code: "NRB\_REGULATORY\_FAIL",

\+        severity: "CRITICAL\_VETO",

\+        title: `NRB Prudential Veto: NPL ${nplPct.toFixed(2)}% (>= 5.0% Ceiling)`,

\+        detail:

\+          "Non-Performing Loans breach NRB's 5.0% statutory ceiling, triggering dividend distribution restrictions and loan-loss provisioning.",

\+      });

\+    }

\+    if (carPct !== null \&\& carPct > 0 \&\& carPct < 11.0) {

\+      regulatoryGates.push({

\+        code: "NRB\_REGULATORY\_FAIL",

\+        severity: "CRITICAL\_VETO",

\+        title: `Capital Adequacy Veto: CAR ${carPct.toFixed(2)}% (< 11.0% Floor)`,

\+        detail:

\+          "Capital Adequacy Ratio is below NRB's 11.0% minimum capital buffer requirement, blocking bonus and cash dividends.",

\+      });

\+    }

&#x20;  }

@@ -217,11 +234,11 @@

&#x20;  // Gate 3: Negative Earnings / Impaired Net Worth Check (only when filings exist)

\-  if (epsTtm <= 0 || bookValuePerShare < 100) {

\+  if ((epsTtm !== null \&\& epsTtm <= 0) || (bookValuePerShare !== null \&\& bookValuePerShare < 100)) {

&#x20;    regulatoryGates.push({

&#x20;      code: "NEGATIVE\_EARNINGS\_AVOID",

&#x20;      severity: "CRITICAL\_VETO",

\-      title: `Negative Earnings / Impaired Net Worth (EPS Rs ${epsTtm})`,

\+      title: `Negative Earnings / Impaired Net Worth (EPS ${epsTtm !== null ? `Rs ${epsTtm}` : "N/A"}, BVPS ${bookValuePerShare !== null ? `Rs ${bookValuePerShare}` : "N/A"})`,

&#x20;      detail:

&#x20;        "Company has negative TTM EPS or Net Worth below par (Rs 100). Institutional accumulation signals are overridden.",

&#x20;    });



```



\---



\#### `A1-033` — `src/services/floorsheet/floorsheetHubEngine.ts`



```diff

\--- a/src/services/floorsheet/floorsheetHubEngine.ts

+++ b/src/services/floorsheet/floorsheetHubEngine.ts

@@ -94,9 +94,14 @@

&#x20;}

&#x20;

&#x20;// src/services/floorsheet/floorsheetHubEngine.ts (Add Pure-Equity Guard)

+const PURE\_EQUITY\_WHITELIST = new Set(\[

\+  "NMBMF", "SWMF", "UPPER", "SHPC", "NHPC", "CHCL", "AHPC", "RHPL", "UNHPL",

\+  "MHNL", "DHPL", "PMHPL", "KPCL", "BPCL", "AKPL", "SPDL", "HIDCL", "RADHI"

+]);

\+

&#x20;export function isPureEquitySymbol(rawSymbol?: string | null, sector?: string | null): boolean {

&#x20;  const sym = String(rawSymbol || "").toUpperCase().trim();

&#x20;  const sec = String(sector || "").toUpperCase().trim();

\+  if (PURE\_EQUITY\_WHITELIST.has(sym)) return true;

&#x20;  if (!sym || /\\d/.test(sym)) return false; // Excludes Debentures with maturity/coupon digits

&#x20;  if (

&#x20;    sec.includes("MUTUAL") ||

@@ -106,12 +111,15 @@

&#x20;  ) {

&#x20;    return false;

&#x20;  }

&#x20;  if (

\-    /^(NIBLPF|NIBSF|CMBF|NICGF|NICBF|NMB50|NMBHF|SFMF|SEF|SAEF|SLCF|KEF|LUK|RMF|RBBMF|PSF|GIMES|C30MF|MMF|H8020|KSY|NSY|SSY|SAGF|PRSF|LVF)$/i.test(

\+    /^(NIBLPF|NIBSF|NIBLGF|NIBLSTF|CMBF|NICGF|NICBF|NICFC|NICSF|NMB50|NMBHF|SFMF|SFEF|SEF|SAEF|SLCF|KEF|KDBY|LUK|RMF|RBBMF|PSF|GIMES|C30MF|MMF|H8020|KSY|NSY|SSY|CSY|GSY|RSY|SAGF|PRSF|LVF|SBCF|MBLEF|HLICF)$/i.test(

&#x20;      sym

&#x20;    )

&#x20;  ) {

&#x20;    return false;

&#x20;  }

\-  if (sym.length >= 5 \&\& (sym.endsWith("PF") || sym.endsWith("SF") || sym.endsWith("MF") || sym.endsWith("PO"))) {

\+  if (

\+    sym.length >= 5 \&\&

\+    (sym.endsWith("PF") || sym.endsWith("SF") || sym.endsWith("MF") || sym.endsWith("PO") || sym.endsWith("P"))

\+  ) {

&#x20;    return false;

&#x20;  }

&#x20;  return true;

@@ -152,7 +160,8 @@

&#x20;

&#x20;  for (let idx = 0; idx < chronological.length; idx++) {

&#x20;    const row = chronological\[idx];

\-    const contractNo = String(row.contractNo ?? row.contract\_no ?? `FS-${idx + 1}`).trim();

\+    const rawCid = (row as Record<string, unknown>).contractId ?? row.contractNo ?? row.contract\_no;

\+    const contractNo = String(rawCid ?? `FS-${idx + 1}`).trim();

&#x20;    if (seenContracts.has(contractNo)) continue;

&#x20;    seenContracts.add(contractNo);

@@ -161,11 +170,12 @@

&#x20;      resolveValidNepseSymbol(row.symbol ?? row.stockSymbol, fallbackSymbol) ||

&#x20;      fallbackSymbol

&#x20;    ).toUpperCase().trim();

\+    const nptToday = new Date(Date.now() + 5.75 \* 3600 \* 1000).toISOString().slice(0, 10);

&#x20;    const tradeDate = String(

&#x20;      row.tradeDate ??

&#x20;        row.trade\_date ??

&#x20;        row.businessDate ??

\-        new Date().toISOString().slice(0, 10)

\+        nptToday

&#x20;    ).slice(0, 10);

@@ -185,9 +195,9 @@

&#x20;    const kitta = Math.round(

&#x20;      safeNum(row.kitta ?? row.quantity ?? row.contractQuantity, 0)

&#x20;    );

\-    if (kitta <= 0) continue;

\-

&#x20;    const rate = safeNum(row.rate ?? row.price ?? row.contractRate, 0);

\+    if (kitta <= 0 || rate <= 0) continue;

@@ -231,7 +241,10 @@

&#x20;): { pocPrice: number | null; nodes: VolumeProfileNode\[] } {

&#x20;  if (!contracts || contracts.length === 0) {

&#x20;    if (fallbackCandles \&\& Array.isArray(fallbackCandles) \&\& fallbackCandles.length > 0) {

\-      const recent = fallbackCandles.slice(-10);

\+      const chronological = \[...fallbackCandles].sort((a, b) =>

\+        String(a.date || "").localeCompare(String(b.date || ""))

\+      );

\+      const recent = chronological.slice(-10);

@@ -286,18 +299,15 @@

&#x20;function classifyObir(

&#x20;  totalBid: number,

&#x20;  totalAsk: number

&#x20;): { obir: number; obirSignal: MarketDepthTelemetry\["obirSignal"] } {

\+  const total = totalBid + totalAsk;

&#x20;  const obir =

\-    totalAsk > 0

\-      ? Number((totalBid / totalAsk).toFixed(2))

\-      : totalBid > 0

\-      ? 3.0

\-      : 1.0;

\+    total > 0 ? Number(((totalBid - totalAsk) / total).toFixed(4)) : 0;

&#x20;  const obirSignal =

\-    obir >= 1.8

\+    obir >= 0.28

&#x20;      ? "STRONG\_DEMAND"

\-      : obir >= 1.25

\+      : obir >= 0.11

&#x20;      ? "MODERATE\_DEMAND"

\-      : obir < 0.8

\+      : obir <= -0.11

&#x20;      ? "SUPPLY\_OVERHANG"

&#x20;      : "BALANCED";

&#x20;  return { obir, obirSignal };

@@ -403,9 +413,12 @@

&#x20;  const authenticTurnover = quoteTurnover > 0 ? quoteTurnover : totalSessionTurnover;

&#x20;  const authenticKitta = quoteVolume > 0 ? quoteVolume : totalSessionKitta;

&#x20;  const authenticContracts = quoteTotalTrades > 0 ? quoteTotalTrades : (enrichedContracts.length > 0 ? enrichedContracts.length : 0);

\+  const avgContractKitta =

\+    quoteTotalTrades > 0 \&\& quoteVolume > 0

\+      ? Math.round(quoteVolume / quoteTotalTrades)

\+      : (enrichedContracts.length > 0 ? Math.round(totalSessionKitta / enrichedContracts.length) : 0);

@@ -440,18 +453,19 @@

&#x20;  const rawP = params.broker5DRawPayload as Record<string, unknown> | null | undefined;

\+  const hasNonEmptyArray = (v: unknown) => Array.isArray(v) \&\& v.length > 0;

&#x20;  const hasBrokerPayload =

&#x20;    Boolean(

&#x20;      rawP \&\&

&#x20;      typeof rawP === "object" \&\&

\-      (Array.isArray(rawP) ||

\-        Array.isArray(rawP\["5D"]) ||

\-        Array.isArray(rawP\["5d"]) ||

\-        Array.isArray(rawP\["30D"]) ||

\-        Array.isArray(rawP.brokers) ||

\-        Array.isArray(rawP.topHoldings) ||

\-        Array.isArray(rawP.topAccumulators) ||

\-        Array.isArray(rawP.data))

\+      (hasNonEmptyArray(rawP) ||

\+        hasNonEmptyArray(rawP\["5D"]) ||

\+        hasNonEmptyArray(rawP\["5d"]) ||

\+        hasNonEmptyArray(rawP\["30D"]) ||

\+        hasNonEmptyArray(rawP.brokers) ||

\+        hasNonEmptyArray(rawP.topHoldings) ||

\+        hasNonEmptyArray(rawP.topAccumulators) ||

\+        hasNonEmptyArray(rawP.data))

&#x20;    );

@@ -466,10 +480,7 @@

&#x20;      totalSessionKitta: Math.round(authenticKitta),

&#x20;      totalSessionTurnover: Math.round(authenticTurnover),

&#x20;      totalContracts: authenticContracts,

\-      avgContractKitta:

\-        authenticContracts > 0

\-          ? Math.round(authenticKitta / authenticContracts)

\-          : 0,

\+      avgContractKitta,

&#x20;      whaleContractCount,

@@ -487,6 +498,7 @@

&#x20;      netKitta: number;

&#x20;      crossKitta: number;

&#x20;      trades: number;

\+      sideCount: number;

&#x20;      buyAmount: number;

&#x20;      sellAmount: number;

&#x20;      netAmt: number;

@@ -504,6 +516,7 @@

&#x20;        netKitta: 0,

&#x20;        crossKitta: 0,

&#x20;        trades: 0,

\+        sideCount: 0,

&#x20;        buyAmount: 0,

&#x20;        sellAmount: 0,

&#x20;        netAmt: 0,

@@ -513,6 +526,7 @@

&#x20;      b.buyKitta += c.kitta;

&#x20;      b.buyAmount += c.amount;

&#x20;      b.trades += 1;

\+      b.sideCount += 1;

&#x20;      if (isSelfTrade) b.crossKitta += c.kitta;

&#x20;      map.set(c.buyerBroker, b);

&#x20;    }

@@ -525,6 +539,7 @@

&#x20;        netKitta: 0,

&#x20;        crossKitta: 0,

&#x20;        trades: 0,

\+        sideCount: 0,

&#x20;        buyAmount: 0,

&#x20;        sellAmount: 0,

&#x20;        netAmt: 0,

@@ -534,6 +549,7 @@

&#x20;      s.sellKitta += c.kitta;

&#x20;      s.sellAmount += c.amount;

\+      s.sideCount += 1;

&#x20;      // Do not double-count trade count when buyerBroker === sellerBroker

&#x20;      if (!isSelfTrade) s.trades += 1;

&#x20;      map.set(c.sellerBroker, s);



```



\---



\#### `A1-034` — `src/services/aiService.js`



```diff

\--- a/src/services/aiService.js

+++ b/src/services/aiService.js

@@ -151,10 +151,15 @@

&#x20;    0

&#x20;  );

&#x20;

\-  // Fallback 1: Extract latest close from realPriceHistory

\-  if ((!ltp || isNaN(ltp) || ltp <= 0) \&\& Array.isArray(realPriceHistory) \&\& realPriceHistory.length > 0) {

\-    for (let i = realPriceHistory.length - 1; i >= 0; i--) {

\-      const c = realPriceHistory\[i];

\+  const hasRealHistory = Array.isArray(realPriceHistory) \&\& realPriceHistory.length > 0;

\+  const historyList = hasRealHistory

\+    ? realPriceHistory.slice().filter(c => c \&\& (c.date || c.t || c.time)).sort((a, b) => new Date(a.date || a.t || a.time) - new Date(b.date || b.t || b.time))

\+    : \[];

\+

\+  // Fallback 1: Extract latest close from chronologically sorted realPriceHistory

\+  if ((!ltp || isNaN(ltp) || ltp <= 0) \&\& historyList.length > 0) {

\+    for (let i = historyList.length - 1; i >= 0; i--) {

\+      const c = historyList\[i];

&#x20;      const p = Number(c?.close || c?.closePrice || c?.ltp || c?.y || 0);

&#x20;      if (p > 0) {

&#x20;        ltp = p;

@@ -164,8 +169,10 @@

&#x20;  }

&#x20;

&#x20;  // Fallback 2: Extract from candle history if attached on stock

&#x20;  if ((!ltp || isNaN(ltp) || ltp <= 0) \&\& Array.isArray(actualStock.history || actualStock.candles)) {

\-    const arr = actualStock.history || actualStock.candles;

\+    const arr = (actualStock.history || actualStock.candles)

\+      .slice()

\+      .sort((a, b) => new Date(a?.date || a?.t || a?.time || 0) - new Date(b?.date || b?.t || b?.time || 0));

&#x20;    for (let i = arr.length - 1; i >= 0; i--) {

&#x20;      const c = arr\[i];

@@ -181,31 +188,26 @@

&#x20;• Quantitative analysis cannot be performed without verified price telemetry.`;

&#x20;  }

&#x20;

\-  const rsi = stock.rsi != null \&\& !isNaN(Number(stock.rsi)) ? Number(stock.rsi) : null;

\-  const pe = stock.pe != null \&\& !isNaN(Number(stock.pe)) \&\& Number(stock.pe) > 0 ? Number(stock.pe) : null;

\-  const eps = stock.eps != null \&\& !isNaN(Number(stock.eps)) ? Number(stock.eps) : null;

\-  const bookValue = stock.bookValue != null \&\& Number(stock.bookValue) > 0 ? Number(stock.bookValue) : (stock.bvps != null \&\& Number(stock.bvps) > 0 ? Number(stock.bvps) : null);

\-  const pChg = Number(stock.pChange) || 0;

\-  const volume = stock.volume != null \&\& !isNaN(Number(stock.volume)) ? Number(stock.volume) : null;

\-  const turnover = stock.turnover != null \&\& !isNaN(Number(stock.turnover)) ? Number(stock.turnover) : (volume != null ? (ltp \* volume) : null);

\-

\-  const hasRealHistory = Array.isArray(realPriceHistory) \&\& realPriceHistory.length > 0;

\-  const historyList = hasRealHistory

\-    ? realPriceHistory.slice().filter(c => c \&\& (c.date || c.t || c.time)).sort((a, b) => new Date(a.date || a.t || a.time) - new Date(b.date || b.t || b.time))

\-    : \[];

\-

\-  const high12M = (stock.high52w \&\& Number(stock.high52w) > 0)

\-    ? Number(stock.high52w)

\-    : (hasRealHistory ? Math.max(...historyList.map(h => Number(h.high || h.close))) : null);

\-

\-  const low12M = (stock.low52w \&\& Number(stock.low52w) > 0)

\-    ? Number(stock.low52w)

\-    : (hasRealHistory ? Math.min(...historyList.map(h => Number(h.low || h.close))) : null);

\+  const rsi = actualStock.rsi != null \&\& !isNaN(Number(actualStock.rsi)) ? Number(actualStock.rsi) : null;

\+  const pe = actualStock.pe != null \&\& !isNaN(Number(actualStock.pe)) \&\& Number(actualStock.pe) > 0 ? Number(actualStock.pe) : null;

\+  const eps = actualStock.eps != null \&\& !isNaN(Number(actualStock.eps)) ? Number(actualStock.eps) : null;

\+  const bookValue = actualStock.bookValue != null \&\& Number(actualStock.bookValue) > 0 ? Number(actualStock.bookValue) : (actualStock.bvps != null \&\& Number(actualStock.bvps) > 0 ? Number(actualStock.bvps) : null);

\+  const pChg = Number(actualStock.pChange) || 0;

\+  const volume = actualStock.volume != null \&\& !isNaN(Number(actualStock.volume)) ? Number(actualStock.volume) : null;

\+  const turnover = actualStock.turnover != null \&\& !isNaN(Number(actualStock.turnover)) ? Number(actualStock.turnover) : (volume != null ? (ltp \* volume) : null);

\+

\+  const high12M = (actualStock.high52w \&\& Number(actualStock.high52w) > 0)

\+    ? Number(actualStock.high52w)

\+    : (historyList.length > 0 ? Math.max(...historyList.map(h => Number(h.high || h.close))) : null);

\+

\+  const low12M = (actualStock.low52w \&\& Number(actualStock.low52w) > 0)

\+    ? Number(actualStock.low52w)

\+    : (historyList.length > 0 ? Math.min(...historyList.map(h => Number(h.low || h.close))) : null);

&#x20;

\-  const yearAgoClose = hasRealHistory \&\& historyList\[0]?.close

\+  const yearAgoClose = historyList.length > 0 \&\& historyList\[0]?.close

&#x20;    ? Number(historyList\[0].close)

\-    : (Number(stock.prevYearClose) || null);

\+    : (Number(actualStock.prevYearClose) || null);

@@ -220,17 +222,20 @@

&#x20;  const newsHighlight = customNewsPulse || null;

\-  const probMatrix = calculateProbabilisticMatrix(stock, historyList, newsHighlight);

\+  const probMatrix = calculateProbabilisticMatrix(actualStock, historyList, newsHighlight);

&#x20;

&#x20;  const graham = (eps != null \&\& bookValue != null)

&#x20;    ? calculateGrahamIntrinsicValue(eps, bookValue, ltp)

&#x20;    : { intrinsicValue: null, marginOfSafetyPct: null };

\-  const actionZone = classifyActionZone({ ...stock, eps, bookValue, ltp, candles: historyList, history: historyList });

\-  const zVol = volume != null

\-    ? calculateVolumeZScore(volume, stock.avgVolume20D || volume)

\+  const actionZone = classifyActionZone({ ...actualStock, eps, bookValue, ltp, candles: historyList, history: historyList });

\+  const avgVol20 = Number(actualStock.avgVolume20D || 0);

\+  const zVol = (volume != null \&\& avgVol20 > 0)

\+    ? calculateVolumeZScore(volume, avgVol20)

&#x20;    : { zScore: '—' };

&#x20;

\-  const chg = stock.change != null ? Number(stock.change) : (pChg ? Number((ltp \* (pChg / 100)).toFixed(2)) : 0);

\-  const pClose = stock.prevClose != null ? Number(stock.prevClose) : (chg ? Number((ltp - chg).toFixed(2)) : null);

\-  const dayHigh = stock.high != null ? Number(stock.high) : null;

\-  const dayLow = stock.low != null ? Number(stock.low) : null;

\+  const pClose = actualStock.prevClose != null \&\& Number(actualStock.prevClose) > 0

\+    ? Number(actualStock.prevClose)

\+    : (pChg \&\& (1 + pChg / 100) > 0 ? Number((ltp / (1 + pChg / 100)).toFixed(2)) : null);

\+  const chg = actualStock.change != null ? Number(actualStock.change) : (pClose != null ? Number((ltp - pClose).toFixed(2)) : 0);

\+  const dayHigh = actualStock.high != null ? Number(actualStock.high) : null;

\+  const dayLow = actualStock.low != null ? Number(actualStock.low) : null;



```



\---



\#### `A1-035` \& `A1-044` — `src/services/merolaganiNewsService.js`



```diff

\--- a/src/services/merolaganiNewsService.js

+++ b/src/services/merolaganiNewsService.js

@@ -76,12 +76,14 @@

&#x20;    const htmlResults = await Promise.allSettled(urls.map(u => fetchOne(u)));

&#x20;    const parsed = \[];

&#x20;    const seen = new Set();

&#x20;

\-    for (const res of htmlResults) {

\+    for (let uIdx = 0; uIdx < htmlResults.length; uIdx++) {

\+      const res = htmlResults\[uIdx];

\+      const isPopularArchive = urls\[uIdx].includes('popular=true');

&#x20;      if (res.status !== 'fulfilled' || !res.value || res.value.length < 500) continue;

&#x20;      const html = res.value;

&#x20;      const matches = \[...html.matchAll(/<a\[^>]\*href=\["'](\[^"']\*(?:NewsDetail\\.aspx\\?newsID=|AnnouncementDetail\\.aspx\\?id=)\[^"']\*)\["']\[^>]\*>(\[\\s\\S]\*?)<\\/a>/gi)];

&#x20;      for (const m of matches) {

@@ -91,7 +93,8 @@

&#x20;            headline: title,

&#x20;            source: isAnn ? 'MeroLagani Announcements' : 'MeroLagani',

&#x20;            url: `https://merolagani.com/${href.startsWith('/') ? href.slice(1) : href}`,

\-            date: 'Today',

\+            date: null,

\+            isPopularArchive,

&#x20;            paragraphs: \[

@@ -134,14 +137,15 @@

&#x20;  newsArticles.slice(0, 15).forEach(article => {

&#x20;    const t = article.title || article.headline || '';

\+    const tLower = t.toLowerCase();

&#x20;    highlights.push(t);

&#x20;

\-    const isZeroDiv = zeroDivTerms.some(z => t.includes(z));

\+    const isZeroDiv = zeroDivTerms.some(z => t.includes(z) || tLower.includes(z));

&#x20;    if (isZeroDiv) {

&#x20;      riskScore += 2.0; // Severe scrip risk

&#x20;    } else {

\-      positiveTerms.forEach(term => { if (t.includes(term)) positiveScore += 1; });

\+      positiveTerms.forEach(term => { if (t.includes(term) || tLower.includes(term)) positiveScore += 1; });

&#x20;    }

&#x20;

\-    riskTerms.forEach(term => { if (t.includes(term)) riskScore += 1; });

\+    riskTerms.forEach(term => { if (t.includes(term) || tLower.includes(term)) riskScore += 1; });

@@ -249,11 +253,12 @@

&#x20;  for (const article of (newsArticles || \[])) {

&#x20;    const text = (article.title || article.headline || '').trim();

&#x20;    if (!text) continue;

\+    const textLower = text.toLowerCase();

&#x20;

&#x20;    const detectedSym = resolveSymbolFromText(text);

&#x20;

&#x20;    // Detect Zero Dividend announcement

\-    const hasZeroDiv = zeroDivTerms.some(term => text.includes(term));

\+    const hasZeroDiv = zeroDivTerms.some(term => text.includes(term) || textLower.includes(term));

&#x20;    if (hasZeroDiv) {

@@ -264,7 +269,7 @@

&#x20;    }

&#x20;

&#x20;    // Detect Dividend Declaration

\-    const hasDivDecl = divDeclTerms.some(term => text.includes(term)) \&\& !hasZeroDiv;

\+    const hasDivDecl = divDeclTerms.some(term => text.includes(term) || textLower.includes(term)) \&\& !hasZeroDiv;

&#x20;    if (hasDivDecl) {

@@ -277,7 +282,7 @@

&#x20;    }

&#x20;

&#x20;    // Detect Right Share Issue

\-    const hasRight = rightTerms.some(term => text.includes(term));

\+    const hasRight = rightTerms.some(term => text.includes(term) || textLower.includes(term));

&#x20;    if (hasRight) {

@@ -290,7 +295,7 @@

&#x20;    }

&#x20;

&#x20;    // Detect Book Closure / AGM Notice

\-    const hasBookClose = bookCloseTerms.some(term => text.includes(term));

\+    const hasBookClose = bookCloseTerms.some(term => text.includes(term) || textLower.includes(term));

&#x20;    if (hasBookClose) {

@@ -399,13 +404,24 @@

&#x20;  const singleCompanyTerms = \[

&#x20;    'कम्पनी', 'लघुवित्त', 'हाइड्रो', 'बैंक', 'इन्स्योरेन्स', 'हकप्रद',

&#x20;    'लाभांश', 'बोनस', 'साधारण सभा', 'म्युचुअल फन्ड', 'डिबेन्चर', 'इकाई'

&#x20;  ];

\+  const todayNpt = getIsoDateInNPT();

&#x20;

&#x20;  for (const article of newsList) {

\+    if (article.isPopularArchive) continue;

\+    // Only trigger live emergency halt from articles verified as published today (NPT)

\+    const rawDate = String(article.publishedAt || article.pubDate || article.date || '').trim();

\+    if (!rawDate) continue;

\+    const parsedMs = Date.parse(rawDate);

\+    const isTodayArticle =

\+      rawDate.startsWith(todayNpt) ||

\+      (!Number.isNaN(parsedMs) \&\& getIsoDateInNPT(new Date(parsedMs)) === todayNpt);

\+    if (!isTodayArticle) continue;

\+

&#x20;    const title = (article.title || article.headline || '').trim();

&#x20;    if (!title) continue;

\+    const titleLower = title.toLowerCase();

&#x20;

&#x20;    const isSingleCompany = singleCompanyTerms.some(m => title.includes(m)) \&\& !title.includes('सम्पूर्ण कारोबार') \&\& !title.includes('नेप्से परिसूचक');

&#x20;    if (isSingleCompany) continue;

&#x20;

\-    const matched = marketWideHaltTerms.some(term => title.includes(term));

\+    const matched = marketWideHaltTerms.some(term => title.includes(term) || titleLower.includes(term));



```



\---



\#### `A1-036`, `A1-037`, `A1-043` — `src/services/meroShareService.js`



```diff

\--- a/src/services/meroShareService.js

+++ b/src/services/meroShareService.js

@@ -137,7 +137,8 @@

&#x20;    const fetchRes = await fetch(options.url, {

&#x20;      method,

&#x20;      headers: webHeaders,

\-      body: options.data ? (typeof options.data === 'string' ? options.data : JSON.stringify(options.data)) : undefined

\+      body: options.data ? (typeof options.data === 'string' ? options.data : JSON.stringify(options.data)) : undefined,

\+      signal: AbortSignal.timeout(25000)

&#x20;    });

@@ -269,14 +270,22 @@

&#x20;    // 1. BOID-derived primary DP

&#x20;    const primaryId = await resolveDpClientId(account);

&#x20;    addCandidate(primaryId);

&#x20;

\-    // 2. All DPs sharing same bank name as the primary (sibling codes from mergers)

\+    // 2. Sibling DPs sharing a distinctive institution name (excluding generic stopwords to prevent 133-request WAF floods)

\+    const DP\_STOPWORDS = new Set(\[

\+      'limited', 'bank', 'capital', 'securities', 'private', 'company',

\+      'finance', 'investment', 'merchant', 'stock', 'broker', 'broking', 'nepal', 'development', 'bikash', 'bikas'

\+    ]);

&#x20;    const primaryEntry = MEROSHARE\_DP\_LIST.find(d => d.id === String(primaryId));

&#x20;    if (primaryEntry) {

\-      const bankKeywords = primaryEntry.name.split(' - ')\[1]?.toLowerCase().split(' ').filter(w => w.length > 3) || \[];

\-      MEROSHARE\_DP\_LIST.forEach(d => {

\-        const dname = d.name.toLowerCase();

\-        if (bankKeywords.some(kw => dname.includes(kw))) addCandidate(d.id);

\-      });

\+      const bankKeywords = (primaryEntry.name.split(' - ')\[1] || '')

\+        .toLowerCase()

\+        .split(/\[^a-z0-9]+/)

\+        .filter(w => w.length > 3 \&\& !DP\_STOPWORDS.has(w));

\+      if (bankKeywords.length > 0) {

\+        MEROSHARE\_DP\_LIST.forEach(d => {

\+          if (candidateIds.length >= 3) return;

\+          const dname = d.name.toLowerCase();

\+          if (bankKeywords.some(kw => dname.includes(kw))) addCandidate(d.id);

\+        });

\+      }

&#x20;    }

@@ -421,7 +430,8 @@

\-    // Step 2c: Fallback to My Holding if waccReport had no records

\-    try {

\+    // Step 2c: Fallback to My Holding ONLY for symbols missing from official waccReport

\+    if (Object.keys(declaredWaccMap).length === 0) try {

@@ -457,7 +467,7 @@

&#x20;        hList.forEach(item => {

&#x20;          const sym = String(item.scrip || item.script || item.symbol || '').toUpperCase().trim();

&#x20;          const rate = Number(item.wacc || item.userPrice || item.rate || item.purchasePrice || item.costPrice || item.buyPrice || item.price || 0);

\-          if (sym \&\& rate > 0) {

\+          if (sym \&\& rate > 0 \&\& !declaredWaccMap\[sym]) {

&#x20;            declaredWaccMap\[sym] = {

@@ -493,7 +503,8 @@

&#x20;        // Prices

&#x20;        const ltp = parseFloat(item.lastTransactionPrice || item.lastTradedPrice || item.currentPrice || item.ltp || item.marketPrice || 0);

&#x20;        const prevClose = parseFloat(item.previousClosingPrice || item.closingPrice || item.prevClosingPrice || 0);

&#x20;        const defaultBase = guessBasePrice(symbol, parseFloat(item.wacc || item.purchasePrice || 0));

\-        const currentLtp = ltp > 0 ? ltp : (prevClose > 0 ? prevClose : defaultBase);

\+        const hasMarketPrice = ltp > 0 || prevClose > 0;

\+        const currentLtp = ltp > 0 ? ltp : (prevClose > 0 ? prevClose : 0);

@@ -509,11 +520,11 @@

&#x20;        if (declared \&\& declared.wacc > 0) {

&#x20;          wacc = declared.wacc;

\-          waccSource = 'CDSC\_MY\_HOLDING\_DECLARED';

\-        } else if (item.wacc \&\& parseFloat(item.wacc) > 0 \&\& parseFloat(item.wacc) !== 100) {

\+          waccSource = declared.source || 'CDSC\_MY\_HOLDING\_DECLARED';

\+        } else if (item.wacc \&\& parseFloat(item.wacc) > 0) {

&#x20;          wacc = parseFloat(item.wacc);

&#x20;          waccSource = 'CUSTOM\_USER\_SET';

\-        } else if (item.purchasePrice \&\& parseFloat(item.purchasePrice) > 0 \&\& parseFloat(item.purchasePrice) !== 100) {

\+        } else if (item.purchasePrice \&\& parseFloat(item.purchasePrice) > 0) {

&#x20;          wacc = parseFloat(item.purchasePrice);

&#x20;          waccSource = 'CUSTOM\_USER\_SET';

@@ -527,6 +538,7 @@

&#x20;          currentLtp,

&#x20;          ltp: currentLtp,

\+          priceUnavailable: !hasMarketPrice,

&#x20;          prevClose,

@@ -550,6 +562,21 @@

+function splitCsvLine(line) {

\+  const cols = \[];

\+  let cur = '';

\+  let inQuotes = false;

\+  for (let i = 0; i < line.length; i++) {

\+    const ch = line\[i];

\+    if (ch === '"') {

\+      if (inQuotes \&\& line\[i + 1] === '"') { cur += '"'; i++; }

\+      else inQuotes = !inQuotes;

\+    } else if (ch === ',' \&\& !inQuotes) {

\+      cols.push(cur.trim());

\+      cur = '';

\+    } else {

\+      cur += ch;

\+    }

\+  }

\+  cols.push(cur.trim());

\+  return cols;

+}

\+

&#x20;export function parseMeroShareCsv(csvContent) {

&#x20;  const lines = csvContent.split(/\\r?\\n/).filter(l => l.trim().length > 0);

&#x20;  if (lines.length < 2) return \[];

&#x20;

\-  const headers = lines\[0].split(',').map(h => h.trim().toLowerCase().replace(/\['"]/g, ''));

\+  const headers = splitCsvLine(lines\[0]).map(h => h.toLowerCase().replace(/\['"]/g, ''));

@@ -571,7 +598,7 @@

&#x20;  const holdings = \[];

&#x20;  for (let i = 1; i < lines.length; i++) {

\-    const cols = lines\[i].split(',').map(c => c.trim().replace(/\['"]/g, ''));

\+    const cols = splitCsvLine(lines\[i]).map(c => c.replace(/\['"]/g, ''));

@@ -767,8 +794,9 @@

&#x20;  const cleanTokenStr = (s) => String(s || '')

&#x20;    .toLowerCase()

\-    .replace(/\\b(limited|ltd|project|company|prabhakar|general|public|ordinary|shares|ipo|result|published)\\b/gi, '')

\+    .replace(/\\b(limited|ltd|project|company|general|public|ordinary|shares|ipo|result|published|hydro|hydropower|power|energy|bank|finance|capital|microfinance|laghubitta|insurance|life|development|bikash|bikas|nepal|himalayan)\\b/gi, '')

&#x20;    .replace(/\[^a-z0-9]/g, ' ')

&#x20;    .trim();

@@ -807,9 +835,9 @@

&#x20;          if (cleanTarget \&\& cleanReportName) {

\-            if (cleanTarget.includes(cleanReportName) || cleanReportName.includes(cleanTarget)) return true;

\+            if (cleanTarget === cleanReportName) return true;

&#x20;            const rWords = cleanReportName.split(/\\s+/).filter(w => w.length >= 3);

&#x20;            if (targetWords.length > 0 \&\& rWords.length > 0) {

\-              const common = targetWords.filter(tw => rWords.some(rw => rw.includes(tw) || tw.includes(rw)));

\-              if (common.length >= 1) return true;

\+              const common = targetWords.filter(tw => rWords.includes(tw));

\+              if (common.length >= Math.min(2, targetWords.length)) return true;

&#x20;            }

&#x20;          }

@@ -857,8 +885,15 @@

&#x20;        if (nmbRes.ok \&\& nmbRes.data \&\& !nmbRes.data.error) {

&#x20;          const allotments = nmbRes.data.data?.allotments || \[];

\-          const units = allotments.length > 0 ? (allotments\[0].alloted\_kitta || 10) : 10;

\+          if (!Array.isArray(allotments) || allotments.length === 0) {

\+            return {

\+              success: true,

\+              allotted: false,

\+              units: 0,

\+              message: 'शेयर परेको छैन (Sorry, not allotted for this BOID)',

\+              source: 'nmb-capital'

\+            };

\+          }

\+          const units = Number(allotments\[0].alloted\_kitta) || 10;

&#x20;          return {

@@ -1064,9 +1099,11 @@

&#x20;        if (match \&\& match.companyShareId) {

&#x20;          targetCompanyShareId = Number(match.companyShareId);

\-        } else if (list.length === 1 \&\& list\[0].companyShareId) {

\-          // If only 1 applicable issue is open, automatically use it!

\-          targetCompanyShareId = Number(list\[0].companyShareId);

\+        } else if (companyObj?.name || companyObj?.scrip) {

\+          return {

\+            success: false,

\+            message: `Selected issue (${companyObj.scrip || companyObj.name}) is not currently open/applicable for this account on CDSC. Aborted to prevent applying to the wrong company.`

\+          };

&#x20;        }

@@ -1122,12 +1159,13 @@

&#x20;    // Pre-flight C-ASBA payload safety validation

&#x20;    const resolvedMaxUnits = Number(companyObj?.maxKitta || companyObj?.maxUnits || companyObj?.maxUnitsAllowed || 10000);

&#x20;    const resolvedMinUnits = Number(companyObj?.minKitta || companyObj?.minUnits || 10);

\+    const resolvedIssueType = /right/i.test(String(companyObj?.type || '')) ? 'RIGHT' : (/fpo/i.test(String(companyObj?.type || '')) ? 'FPO' : 'IPO');

&#x20;    const valResult = validateCasbaApplicationPayload({

&#x20;      boid: String(account.boid || auth.boid || '').trim(),

&#x20;      dpId: String(account.dpCode || account.dpId || '').trim(),

&#x20;      appliedKitta: Number(appliedKitta),

&#x20;      minUnits: resolvedMinUnits,

\-      maxUnits: Math.max(resolvedMaxUnits, 10000),

\+      maxUnits: resolvedMaxUnits,

&#x20;      crnNumber: crnNumber,

&#x20;      accountNumber: String(customer.accountNumber || '').trim(),

&#x20;      bankId: bankId,

&#x20;      customerId: customer.id,

&#x20;      branchId: customer.accountBranchId || customer.branchId || 1,

&#x20;      transactionPin: transactionPIN,

\-      issueType: 'IPO'

\+      issueType: resolvedIssueType

&#x20;    });

@@ -1146,8 +1184,8 @@

&#x20;      crnNumber: crnNumber,

&#x20;      transactionPIN: transactionPIN,

\-      demat: String(account.boid || auth.boid || '').trim(),

\-      boid: String(account.boid || auth.boid || '').trim(),

\+      demat: valResult.sanitizedPayload.demat,

\+      boid: valResult.sanitizedPayload.boid,

&#x20;      ...(shareCriteriaId ? { shareCriteriaId } : {})

&#x20;    };

@@ -1209,7 +1247,7 @@

&#x20;    const check = await checkSingleBoidAllotment(targetCompanyId, cleanBoid, acc, targetCompany);

&#x20;    records.push({

&#x20;      boid: acc.boid,

&#x20;      name: acc.name || acc.accountName,

&#x20;      accountName: acc.name || acc.accountName,

\-      status: check.allotted ? 'allotted' : 'not\_allotted',

\+      status: !check.success ? 'error' : (check.allotted ? 'allotted' : 'not\_allotted'),

&#x20;      allottedUnits: check.units,

&#x20;      message: check.message

&#x20;    });



```



\---



\#### `A1-038` — `src/services/meroShareWaccService.js`



```diff

\--- a/src/services/meroShareWaccService.js

+++ b/src/services/meroShareWaccService.js

@@ -20,12 +20,25 @@

&#x20;  return clean.replace(/\[^A-Z0-9\_]/g, '');

&#x20;}

&#x20;

+function parseCleanNum(val, fallback = 0) {

\+  if (val === null || val === undefined || val === '') return fallback;

\+  const parsed = typeof val === 'number' ? val : Number(String(val).replace(/,/g, '').trim());

\+  return Number.isFinite(parsed) ? parsed : fallback;

+}

\+

&#x20;/\*\*

&#x20; \* Verifies mathematical relationship: totalCost = waccRate x waccCalculatedQuantity.

&#x20; \* Flags discrepancies exceeding tolerance (default Rs. 0.05 / 5 paisa).

&#x20; \*/

&#x20;export function verifyWaccMath({ rate, quantity, totalCost, tolerance = 0.05 }) {

\-  const numRate = Number(rate || 0);

\-  const numQty = Number(quantity || 0);

\-  const numTotal = Number(totalCost || 0);

\+  const numRate = parseCleanNum(rate, Number.NaN);

\+  const numQty = parseCleanNum(quantity, Number.NaN);

\+  const numTotal = parseCleanNum(totalCost, Number.NaN);

\+

\+  if (!Number.isFinite(numRate) || !Number.isFinite(numQty) || !Number.isFinite(numTotal) || numRate <= 0 || numQty <= 0) {

\+    return {

\+      isValid: false,

\+      expectedTotal: 0,

\+      actualTotal: Number.isFinite(numTotal) ? numTotal : 0,

\+      difference: 0,

\+      isMismatch: true,

\+      mismatchNote: 'Invalid or non-numeric WACC rate, quantity, or total cost.'

\+    };

\+  }

@@ -120,9 +133,10 @@

&#x20;    const normalizedSymbol = normalizeScripSymbol(rawScrip);

&#x20;    if (!normalizedSymbol) continue;

&#x20;

\-    const waccRate = Number(item.averageBuyRate ?? item.waccRate ?? item.wacc ?? item.rate ?? item.userPrice ?? item.purchasePrice ?? 0);

\-    const waccCalculatedQuantity = Number(item.totalQuantity ?? item.waccCalculatedQuantity ?? item.calculatedQuantity ?? item.quantity ?? item.kitta ?? item.units ?? 0);

\-    const totalCostOfCapital = Number(item.totalCost ?? item.totalCostOfCapital ?? item.totalAmount ?? item.totalPrice ?? (waccRate \* waccCalculatedQuantity));

\+    const waccRate = parseCleanNum(item.averageBuyRate ?? item.waccRate ?? item.wacc ?? item.rate ?? item.userPrice ?? item.purchasePrice, 0);

\+    const waccCalculatedQuantity = parseCleanNum(item.totalQuantity ?? item.waccCalculatedQuantity ?? item.calculatedQuantity ?? item.quantity ?? item.kitta ?? item.units, 0);

\+    const totalCostOfCapital = parseCleanNum(item.totalCost ?? item.totalCostOfCapital ?? item.totalAmount ?? item.totalPrice, waccRate \* waccCalculatedQuantity);

\+    if (waccRate <= 0) continue;

@@ -177,8 +191,15 @@

&#x20;    const waccQty = Number(waccRecord.waccCalculatedQuantity || 0);

&#x20;    const rate = Number(waccRecord.waccRate || 0);

\+    if (!Number.isFinite(rate) || rate <= 0) {

\+      return {

\+        ...holding,

\+        symbol: sym || rawSym,

\+        waccSource: holding.waccSource || 'NOT\_AVAILABLE'

\+      };

\+    }

&#x20;    const isQtyMismatch = heldQty !== waccQty;

@@ -197,6 +218,7 @@

&#x20;      waccRate: rate,

&#x20;      waccCalculatedQuantity: waccQty,

&#x20;      heldQuantity: heldQty,

\+      coveredInvestment: Number((coveredQty \* rate).toFixed(2)),

&#x20;      totalCostOfCapital: waccRecord.totalCostOfCapital,



```



\---



\#### `A1-039` — `src/services/nepseAgentTools.js`



```diff

\--- a/src/services/nepseAgentTools.js

+++ b/src/services/nepseAgentTools.js

@@ -71,9 +71,16 @@

&#x20;  const liveQuote = todayPriceRes.status === 'fulfilled' \&\& todayPriceRes.value ? todayPriceRes.value : null;

\-  const rawCandles = historyRes.status === 'fulfilled' \&\& Array.isArray(historyRes.value)

\+  const unsortedCandles = historyRes.status === 'fulfilled' \&\& Array.isArray(historyRes.value)

&#x20;    ? historyRes.value

&#x20;    : (historyRes.status === 'fulfilled' \&\& Array.isArray(historyRes.value?.data) ? historyRes.value.data : \[]);

\+  // Guarantee strict chronological order (oldest -> newest) before extracting latest close/volume or computing indicators

\+  const rawCandles = unsortedCandles

\+    .slice()

\+    .filter(c => c \&\& (c.date || c.t || c.businessDate))

\+    .sort((a, b) => String(a.date || a.t || a.businessDate).localeCompare(String(b.date || b.t || b.businessDate)));

&#x20;  const fundamentals = fundRes.status === 'fulfilled' \&\& fundRes.value ? fundRes.value : {};

&#x20;  const broker = brokerRes.status === 'fulfilled' \&\& brokerRes.value ? brokerRes.value : null;

@@ -143,14 +150,15 @@

&#x20;  // Broker smart money metrics — computed only from the real broker feed

&#x20;  const topBuyers = Array.isArray(broker?.topBuyers) ? broker.topBuyers : (Array.isArray(broker?.buyers) ? broker.buyers : \[]);

&#x20;  const topSellers = Array.isArray(broker?.topSellers) ? broker.topSellers : (Array.isArray(broker?.sellers) ? broker.sellers : \[]);

&#x20;  const totalVol = Number(broker?.totalVolume || broker?.totalQty || 0);

&#x20;  const sumQty = (arr, n, keys) => arr.slice(0, n).reduce((acc, b) => acc + Number(keys.map(k => b\[k]).find(v => v != null) || 0), 0);

\-  const top3BuyVol = sumQty(topBuyers, 3, \['buyQty', 'volume', 'shares']);

\-  const top5BuyVol = sumQty(topBuyers, 5, \['buyQty', 'volume', 'shares']);

\-  const top3SellVol = sumQty(topSellers, 3, \['sellQty', 'volume', 'shares']);

\+  const top3BuyVol = sumQty(topBuyers, 3, \['buyVol', 'buyKitta', 'buyQty', 'volume', 'shares']);

\+  const top5BuyVol = sumQty(topBuyers, 5, \['buyVol', 'buyKitta', 'buyQty', 'volume', 'shares']);

\+  const top3SellVol = sumQty(topSellers, 3, \['sellVol', 'sellKitta', 'sellQty', 'volume', 'shares']);

&#x20;  const pctOf = (v) => (totalVol > 0 \&\& v > 0) ? +((v / totalVol) \* 100).toFixed(1) : null;

\-  const bcr3Buy = broker?.bcr3BuyPct != null ? Number(broker.bcr3BuyPct) : pctOf(top3BuyVol);

\-  const bcr5Buy = broker?.bcr5BuyPct != null ? Number(broker.bcr5BuyPct)

\+  const bcr3Buy = broker?.bcr3BuyPct != null ? Number(broker.bcr3BuyPct) : (broker?.bcr3NetPct != null ? Number(broker.bcr3NetPct) : pctOf(top3BuyVol));

\+  const bcr5Buy = broker?.bcr5BuyPct != null ? Number(broker.bcr5BuyPct)

\+    : (broker?.bcr5NetPct != null ? Number(broker.bcr5NetPct)

&#x20;    : (broker?.crb5 != null ? +((Number(broker.crb5) <= 1 ? Number(broker.crb5) \* 100 : Number(broker.crb5))).toFixed(1) : pctOf(top5BuyVol)));

\-  const bcr3Sell = broker?.bcr3SellPct != null ? Number(broker.bcr3SellPct) : pctOf(top3SellVol);

\+  const bcr3Sell = broker?.bcr3SellPct != null ? Number(broker.bcr3SellPct) : (broker?.scr3NetPct != null ? Number(broker.scr3NetPct) : pctOf(top3SellVol));

@@ -286,7 +294,8 @@

&#x20;      body: JSON.stringify({

&#x20;        symbol: normSym,

&#x20;        query,

&#x20;        model,

&#x20;        apiKey: clientKey || undefined

\-      })

\+      }),

\+      signal: AbortSignal.timeout(30000)

&#x20;    });

@@ -340,7 +349,7 @@

&#x20;      if (proxyRes.ok) {

&#x20;        const pData = await proxyRes.json();

\-        const rawText = pData?.text || pData?.candidates?.\[0]?.content?.parts?.\[0]?.text;

\+        const rawText = pData?.data?.analysis || pData?.analysis || pData?.text || pData?.candidates?.\[0]?.content?.parts?.\[0]?.text;

&#x20;        if (rawText) {

@@ -367,7 +376,8 @@

&#x20;            body: JSON.stringify({

&#x20;              contents: \[{ parts: \[{ text: prompt }] }],

&#x20;              generationConfig: { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: 'application/json' }

\-            })

\+            }),

\+            signal: AbortSignal.timeout(30000)

&#x20;          });



```



\---



\#### `A1-040` — `src/services/signalTracker.js`



```diff

\--- a/src/services/signalTracker.js

+++ b/src/services/signalTracker.js

@@ -191,17 +191,18 @@

&#x20;  const resolvedExit = exitPrice != null ? Number(exitPrice) : (sig.highestSeen || sig.entryPrice);

&#x20;  const entryDate = new Date(sig.signalDate);

&#x20;  const exitDateObj = new Date();

\+  const exitDateIso = formatNptDateIso(exitDateObj);

&#x20;  const holdingDays = Math.max(1, Math.floor((exitDateObj - entryDate) / (1000 \* 60 \* 60 \* 24)));

&#x20;  const entryPrice = sig.entryPrice || resolvedExit;

\-  const returnPct = +(((resolvedExit - entryPrice) / entryPrice) \* 100).toFixed(2);

\+  const returnPct = entryPrice > 0 ? +(((resolvedExit - entryPrice) / entryPrice) \* 100).toFixed(2) : 0;

&#x20;  const { netReturnPct, totalFeesPct, cgtPct } = calculateNetReturn(entryPrice, resolvedExit, holdingDays);

&#x20;

&#x20;  const effectiveLow = sig.lowestSeen || Math.min(entryPrice, resolvedExit);

&#x20;  const effectiveHigh = sig.highestSeen || Math.max(entryPrice, resolvedExit);

&#x20;

&#x20;  sig.status = 'manual\_close';

&#x20;  sig.outcome = {

\-    exitDate: exitDateObj.toISOString().split('T')\[0],

\+    exitDate: exitDateIso,

&#x20;    exitPrice: resolvedExit,

&#x20;    hitTarget: sig.targetPrice ? resolvedExit >= sig.targetPrice : false,

&#x20;    hitStop: sig.stopLoss ? resolvedExit <= sig.stopLoss : false,

@@ -211,8 +212,8 @@

&#x20;    cgtPct,

&#x20;    holdingDays,

\-    maxDrawdownPct: effectiveLow ? +(((effectiveLow - entryPrice) / entryPrice) \* 100).toFixed(2) : Math.min(0, returnPct),

\-    maxUpsidePct: effectiveHigh ? +(((effectiveHigh - entryPrice) / entryPrice) \* 100).toFixed(2) : Math.max(0, returnPct)

\+    maxDrawdownPct: (effectiveLow \&\& entryPrice > 0) ? +(((effectiveLow - entryPrice) / entryPrice) \* 100).toFixed(2) : Math.min(0, returnPct),

\+    maxUpsidePct: (effectiveHigh \&\& entryPrice > 0) ? +(((effectiveHigh - entryPrice) / entryPrice) \* 100).toFixed(2) : Math.max(0, returnPct)

&#x20;  };

@@ -232,19 +233,21 @@

&#x20;  const effectiveHigh = highSince != null ? Number(highSince) : Number(currentPrice || 0);

&#x20;  const effectiveLow = lowSince != null ? Number(lowSince) : Number(currentPrice || 0);

&#x20;

\-  if (signal.targetPrice \&\& effectiveHigh >= signal.targetPrice) {

\+  // Conservative check: evaluate stopLoss BEFORE targetPrice

\+  if (signal.stopLoss \&\& effectiveLow > 0 \&\& effectiveLow <= signal.stopLoss) {

\+    newStatus = 'hit\_stop';

\+    exitPrice = signal.stopLoss;

\+    hitStop = true;

\+  } else if (signal.targetPrice \&\& effectiveHigh >= signal.targetPrice) {

&#x20;    newStatus = 'hit\_target';

&#x20;    exitPrice = signal.targetPrice;

&#x20;    hitTarget = true;

\-  } else if (signal.stopLoss \&\& effectiveLow <= signal.stopLoss) {

\-    newStatus = 'hit\_stop';

\-    exitPrice = signal.stopLoss;

\-    hitStop = true;

&#x20;  }

&#x20;

&#x20;  if (newStatus !== 'open') {

&#x20;    const entryDate = new Date(signal.signalDate);

&#x20;    const exitDateObj = new Date();

\+    const exitDateIso = formatNptDateIso(exitDateObj);

&#x20;    const holdingDays = Math.max(1, Math.floor((exitDateObj - entryDate) / (1000 \* 60 \* 60 \* 24)));

\-    const holdSessions = countNepseTradingSessionsBetween(signal.signalDate, formatNptDateIso(exitDateObj));

\-    // Invariant: Under NEPSE T+2 settlement, shares cannot be exited prior to Demat delivery (holdSessions >= 2)

\-    if (holdSessions < 2 \&\& holdingDays < 2) return signal;

\+    const holdSessions = countNepseTradingSessionsBetween(signal.signalDate, exitDateIso);

\+    // Invariant: Under NEPSE T+2 settlement, shares cannot be exited until at least 2 trading sessions have elapsed

\+    if (holdSessions < 2) return signal;

&#x20;    const entryPrice = signal.entryPrice || currentPrice;

@@ -255,7 +258,7 @@

&#x20;    signal.status = newStatus;

&#x20;    signal.outcome = {

\-      exitDate: exitDateObj.toISOString().split('T')\[0],

\+      exitDate: exitDateIso,

&#x20;      exitPrice,

@@ -302,16 +305,16 @@

&#x20;  closedSignals.forEach(s => {

&#x20;    const returnPct = s.outcome.returnPct;

&#x20;    const netReturnPct = s.outcome.netReturnPct != null ? s.outcome.netReturnPct : returnPct;

&#x20;

\-    if (returnPct > 0) {

\+    if (netReturnPct > 0) {

&#x20;      winCount++;

\-      totalWinsPct += returnPct;

\+      totalWinsPct += netReturnPct;

&#x20;    } else {

&#x20;      lossCount++;

\-      totalLossesPct += Math.abs(returnPct);

\+      totalLossesPct += Math.abs(netReturnPct);

&#x20;    }

&#x20;

&#x20;    totalReturnPct += returnPct;

&#x20;    totalNetReturnPct += netReturnPct;

&#x20;    totalHoldingDays += (s.outcome.holdingDays || 1);

&#x20;

\-    if (returnPct > bestTrade.returnPct) {

\+    if (netReturnPct > bestTrade.returnPct) {

&#x20;      bestTrade = { symbol: s.symbol, returnPct, netReturnPct };

&#x20;    }

\-    if (returnPct < worstTrade.returnPct) {

\+    if (netReturnPct < worstTrade.returnPct) {

&#x20;      worstTrade = { symbol: s.symbol, returnPct, netReturnPct };

&#x20;    }

&#x20;

&#x20;    const src = s.source || 'default';

&#x20;    if (bySource\[src]) {

&#x20;      bySource\[src].closed += 1;

\-      if (returnPct > 0) bySource\[src].wins += 1;

\+      if (netReturnPct > 0) bySource\[src].wins += 1;

&#x20;    }

&#x20;  });

@@ -361,20 +364,25 @@

\-export const expireOldSignals = (maxAgeDays = 60) => {

+export const expireOldSignals = (maxAgeDays = 60, priceMap = null) => {

&#x20;  const signals = getStoredSignals();

&#x20;  const now = new Date();

\+  const todayNpt = formatNptDateIso(now);

&#x20;  let changed = false;

&#x20;

&#x20;  signals.forEach(s => {

&#x20;    if (s.status === 'open') {

&#x20;      const signalDate = new Date(s.signalDate);

&#x20;      const ageDays = (now - signalDate) / (1000 \* 60 \* 60 \* 24);

&#x20;      if (ageDays > maxAgeDays) {

\+        const marketPx = priceMap ? Number(priceMap\[s.symbol] || 0) : 0;

\+        const exitPrice = marketPx > 0 ? marketPx : (s.lastPrice || s.entryPrice);

\+        const holdingDays = Math.max(1, Math.round(ageDays));

\+        const returnPct = s.entryPrice > 0 ? +(((exitPrice - s.entryPrice) / s.entryPrice) \* 100).toFixed(2) : 0;

\+        const { netReturnPct, totalFeesPct, cgtPct } = calculateNetReturn(s.entryPrice, exitPrice, holdingDays);

&#x20;        s.status = 'expired';

&#x20;        s.outcome = {

\-          exitDate: now.toISOString().split('T')\[0],

\-          exitPrice: s.entryPrice,

\+          exitDate: todayNpt,

\+          exitPrice,

&#x20;          hitTarget: false,

&#x20;          hitStop: false,

\-          returnPct: 0,

\-          netReturnPct: 0,

\-          totalFeesPct: 0,

\-          cgtPct: 0,

\-          holdingDays: Math.round(ageDays),

\+          returnPct,

\+          netReturnPct,

\+          totalFeesPct,

\+          cgtPct,

\+          holdingDays,

&#x20;          maxDrawdownPct: 0,

&#x20;          maxUpsidePct: 0

&#x20;        };

@@ -418,8 +426,12 @@

&#x20;        if (cHigh <= 0 || cLow <= 0) continue;

&#x20;

\-        sig.highestSeen = Math.max(sig.highestSeen ?? sig.entryPrice ?? cHigh, cHigh);

&#x20;        sig.lowestSeen = Math.min(sig.lowestSeen ?? sig.entryPrice ?? cLow, cLow);

\+        const holdSessions = countNepseTradingSessionsBetween(sig.signalDate, c.date);

\+        if (holdSessions < 2) {

\+          // Shares locked under NEPSE T+2 Demat settlement; do not record unreachable exit peak

\+          continue;

\+        }

\+        sig.highestSeen = Math.max(sig.highestSeen ?? sig.entryPrice ?? cHigh, cHigh);

@@ -461,11 +473,6 @@

&#x20;        if (cStatus !== 'open') {

\-          const holdSessions = countNepseTradingSessionsBetween(sig.signalDate, c.date);

\-          if (holdSessions < 2) {

\-            // Cannot exit on Day T (0) or Day T+1 (1) under NEPSE T+2 Demat lock

\-            continue;

\-          }

&#x20;          const entryDate = new Date(sig.signalDate);

@@ -493,10 +500,15 @@

&#x20;    if (resolvedFromHistory) continue;

&#x20;

\-    // Track running peak and trough across sessions with live quote

\-    sig.highestSeen = Math.max(sig.highestSeen ?? sig.entryPrice ?? currentPrice, todayHigh);

\+    const enforceSettlementLock = options.enforceSettlementLock !== false;

\+    const liveHoldSessions = countNepseTradingSessionsBetween(sig.signalDate, todayStr);

\+

\+    sig.lastPrice = currentPrice;

&#x20;    sig.lowestSeen = Math.min(sig.lowestSeen ?? sig.entryPrice ?? currentPrice, todayLow);

\+    if (!enforceSettlementLock || liveHoldSessions >= 2) {

\+      sig.highestSeen = Math.max(sig.highestSeen ?? sig.entryPrice ?? currentPrice, todayHigh);

\+    }

&#x20;

&#x20;    const highSince = sig.highestSeen;

&#x20;    const lowSince = sig.lowestSeen;

@@ -510,20 +522,19 @@

&#x20;    let hitTarget = false;

&#x20;    let hitStop = false;

&#x20;

\-    if (sig.targetPrice \&\& highSince >= sig.targetPrice) {

\+    if (sig.stopLoss \&\& lowSince != null \&\& lowSince <= sig.stopLoss) {

\+      newStatus = 'hit\_stop';

\+      exitPrice = sig.stopLoss;

\+      hitStop = true;

\+    } else if (sig.targetPrice \&\& highSince != null \&\& highSince >= sig.targetPrice) {

&#x20;      newStatus = 'hit\_target';

&#x20;      exitPrice = sig.targetPrice;

&#x20;      hitTarget = true;

\-    } else if (sig.stopLoss \&\& lowSince <= sig.stopLoss) {

\-      newStatus = 'hit\_stop';

\-      exitPrice = sig.stopLoss;

\-      hitStop = true;

&#x20;    } else if (ageDays > 60) {

&#x20;      newStatus = 'expired';

&#x20;      exitPrice = currentPrice;

&#x20;    }

&#x20;

\-    if (newStatus !== 'open' \&\& newStatus !== 'expired' \&\& options.enforceSettlementLock) {

\-      const holdSessions = countNepseTradingSessionsBetween(sig.signalDate, todayStr);

\-      if (holdSessions < 2) {

\-        newStatus = 'open';

\-      }

\+    if (newStatus !== 'open' \&\& newStatus !== 'expired' \&\& enforceSettlementLock \&\& liveHoldSessions < 2) {

\+      newStatus = 'open';

&#x20;    }



```



\---



\#### `A1-041` — `src/services/whaleDailyArchive.js`



```diff

\--- a/src/services/whaleDailyArchive.js

+++ b/src/services/whaleDailyArchive.js

@@ -16,6 +16,8 @@

&#x20;import { calculateBrokerConcentration, calculateQuietAccumulationIndex, estimateTradablePublicFloat } from '../utils/accumulationDistributionEngine.ts';

&#x20;import { NEPSE\_UNIVERSE } from '../data/nepseUniverse.js';

&#x20;import { getCircuitLimits, NEPSE\_RULES } from '../utils/nepseRules.js';

+import { isPureNepseEquity } from '../utils/nepseEquityFilter.js';

+import { formatNptDateIso } from '../utils/nepseCalendar.js';

@@ -98,11 +100,13 @@

&#x20;  if (!marketDate) {

\-    marketDate = new Date().toISOString().split('T')\[0];

\+    marketDate = formatNptDateIso(new Date());

&#x20;  }

&#x20;

\-  const existingArchive = getStoredWhaleArchive();

\-  const previousSnapshot = existingArchive.find(s => s.date !== marketDate);

\+  const existingArchive = getStoredWhaleArchive().sort((a, b) => String(b.date).localeCompare(String(a.date)));

\+  // Strictly previous trading session (< marketDate) to eliminate lookahead bias

\+  const previousSnapshot = existingArchive.find(s => s.date < marketDate);

@@ -112,11 +116,12 @@

&#x20;  if (Array.isArray(floorsheet) \&\& floorsheet.length > 0) {

\-    floorsheet.forEach((t, idx) => {

\+    floorsheet.forEach((t) => {

&#x20;      const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();

&#x20;      if (!sym) return;

&#x20;      const bBroker = String(t.buyerMemberId || t.buyerBroker || t.buyer || '').replace(/^0+/, '').trim();

&#x20;      const sBroker = String(t.sellerMemberId || t.sellerBroker || t.seller || '').replace(/^0+/, '').trim();

&#x20;      const qty = Number(t.contractQuantity || t.quantity || t.qty || 0);

&#x20;      const rate = Number(t.contractRate || t.rate || t.price || 0);

\-      const key = t.contractId ? String(t.contractId) : `${sym}\_${bBroker}\_${sBroker}\_${qty}\_${rate}\_${t.tradeTime || idx}`;

\+      const cid = t.contractId ?? t.contractNo ?? t.contract\_no;

\+      const key = cid ? String(cid) : `${sym}\_${bBroker}\_${sBroker}\_${qty}\_${rate}\_${t.tradeTime || t.trade\_time || ''}`;

&#x20;      sessionTradesMap.set(key, t);

&#x20;    });

&#x20;  }

@@ -135,9 +140,8 @@

&#x20;  for (const s of stocks) {

&#x20;    const sym = String(s.symbol || '').toUpperCase().trim();

&#x20;    if (!sym || !s.ltp) continue;

\-    // Skip mutual funds and debentures for whale equity tracking

\-    const rawSecLower = String(s.sector || '').toLowerCase();

\-    if (sym.includes('D8') || sym.includes('D9') || sym.endsWith('MF') || sym.endsWith('BS') || sym.endsWith('SF') || sym.endsWith('EF') || sym.endsWith('GF') || sym.endsWith('FF') || rawSecLower.includes('mutual')) continue;

\+    // Canonical Pure-Equity Guard (preserves NMBMF/SWMF/DLBS/ILBS/LLBS/MLBS/VLBS while excluding debentures, MFs, promoters)

\+    if (!isPureNepseEquity(sym, s.sector)) continue;

@@ -200,7 +204,7 @@

&#x20;    // Float Normalization \& Dynamic Sector Turnover Calibration

&#x20;    const uInfo = UNIVERSE\_MAP.get(sym) || {};

\-    const listedShares = Number(s.listedShares || s.totalListedShares || (uInfo.sharesOut ? uInfo.sharesOut \* 1000000 : 0)) || 10000000;

\+    const listedShares = Number(s.listedShares || s.totalListedShares || (uInfo.sharesOut ? uInfo.sharesOut \* 1000000 : 0)) || 0;

&#x20;    const sector = s.sector || uInfo.sector || 'Equities';

&#x20;    const secLower = sector.toLowerCase();

@@ -211,8 +215,8 @@

&#x20;    else if (secLower.includes('manufacturing')) publicFloatFraction = 0.25;

&#x20;    else if (secLower.includes('hotel')) publicFloatFraction = 0.30;

&#x20;

\-    const estFloatShares = Math.max(500000, Math.round(listedShares \* publicFloatFraction));

\-    const floatTurnoverPct = estFloatShares > 0 ? Number(((Number(s.volume || 0) / estFloatShares) \* 100).toFixed(3)) : 0;

\+    const estFloatShares = listedShares > 0 ? Math.max(100000, Math.round(listedShares \* publicFloatFraction)) : null;

\+    const floatTurnoverPct = (estFloatShares \&\& estFloatShares > 0) ? Number(((Number(s.volume || 0) / estFloatShares) \* 100).toFixed(3)) : 0;



```



\---



\#### `A1-042` — `src/utils/accumulationDistributionEngine.ts`



```diff

\--- a/src/utils/accumulationDistributionEngine.ts

+++ b/src/utils/accumulationDistributionEngine.ts

@@ -247,13 +247,20 @@

&#x20;  let cumulativeADL = 0;

&#x20;  const points: ADLPoint\[] = \[];

&#x20;

\-  for (let i = 0; i < candles.length; i++) {

\-    const c = candles\[i];

\-    const high = Number(c.high) || Number(c.close) || 100;

\-    const low = Number(c.low) || Number(c.close) || 100;

\-    const close = Number(c.close) || 100;

\+  const chronological = \[...candles].sort((a, b) =>

\+    String(a.date || a.time || '').localeCompare(String(b.date || b.time || ''))

\+  );

\+

\+  for (let i = 0; i < chronological.length; i++) {

\+    const c = chronological\[i];

\+    const close = Number(c.close);

\+    if (!Number.isFinite(close) || close <= 0) continue;

\+    const rawHigh = Number(c.high);

\+    const rawLow = Number(c.low);

\+    const high = Number.isFinite(rawHigh) \&\& rawHigh > 0 ? Math.max(rawHigh, close) : close;

\+    const low = Number.isFinite(rawLow) \&\& rawLow > 0 ? Math.min(rawLow, close) : close;

&#x20;    const volume = Math.max(0, Number(c.volume) || 0);



```



\---



\#### `A1-045` — `src/services/stockSnapshot.js`



```diff

\--- a/src/services/stockSnapshot.js

+++ b/src/services/stockSnapshot.js

@@ -39,7 +39,8 @@

&#x20;    rvol: null, avgVolume20D: null, liquidityClass: null, liquidityLabel: null, isIlliquid: null, liquidityWarning: null,

&#x20;    bonusShare: null, cashDiv: null,

\-    dataTimestamp: new Date().toISOString(),

\+    dataTimestamp: null,

\+    isStale: true,

&#x20;    dataSource: 'nepse-api'

&#x20;  };

@@ -62,6 +63,8 @@

&#x20;    if (liveDetail) {

\+      snapshot.dataTimestamp = liveDetail.asOf || liveDetail.updatedAt || liveDetail.timestamp || new Date().toISOString();

\+      snapshot.isStale = Boolean(liveDetail.isStale);

&#x20;      snapshot.companyName = liveDetail.companyName || liveDetail.securityName || snapshot.companyName;

@@ -102,7 +105,9 @@

&#x20;      snapshot.paidUpCapital = liveDetail.paidUpCapital ?? null;

&#x20;      snapshot.promoterPercentage = liveDetail.promoterPercentage ?? liveDetail.promoterHolding ?? null;

\-      snapshot.publicPercentage = liveDetail.publicPercentage ?? (liveDetail.promoterPercentage ? 100 - liveDetail.promoterPercentage : null);

\+      snapshot.publicPercentage =

\+        liveDetail.publicPercentage ??

\+        (snapshot.promoterPercentage !== null \&\& Number.isFinite(Number(snapshot.promoterPercentage)) ? 100 - Number(snapshot.promoterPercentage) : null);

@@ -127,19 +132,26 @@

&#x20;    snapshot.isIlliquid = liquidityInfo.isIlliquid ?? null;

&#x20;    snapshot.liquidityWarning = liquidityInfo.warning || null;

&#x20;

\-    snapshotCache.set(sym, { timestamp: Date.now(), data: snapshot });

\+    // Never cache failed/empty snapshots with null LTP for 30s

\+    if (liveDetail \&\& snapshot.ltp != null \&\& Number(snapshot.ltp) > 0) {

\+      snapshotCache.set(sym, { timestamp: Date.now(), data: snapshot });

\+    }

&#x20;

&#x20;    return snapshot;

&#x20;  } catch (error) {

&#x20;    snapshot.dataSource = 'partial';

\+    snapshot.isStale = true;

&#x20;    return snapshot;

&#x20;  }

&#x20;}

&#x20;

&#x20;export function enrichStockFromSnapshot(snapshot, liveDetail) {

&#x20;    if (!snapshot) return liveDetail;

&#x20;    return {

\+        ...liveDetail,

&#x20;        ...snapshot,

&#x20;        marketCap: snapshot.marketCap ?? liveDetail.marketCap,

&#x20;        floatMarketCap: snapshot.floatMarketCap ?? liveDetail.floatMarketCap,

&#x20;    };

&#x20;}



```



\---



\#### `A1-046` — `scripts/audit-pipeline.ts`



```diff

\--- a/scripts/audit-pipeline.ts

+++ b/scripts/audit-pipeline.ts

@@ -121,7 +121,7 @@

&#x20;    { table: 'daily\_stock\_summary', query: 'SELECT MAX(trade\_date) as max\_val, COUNT(\*) as cnt FROM daily\_stock\_summary' },

&#x20;    { table: 'daily\_broker\_ledger', query: 'SELECT MAX(trade\_date) as max\_val, COUNT(\*) as cnt FROM daily\_broker\_ledger' },

&#x20;    { table: 'algorithmic\_signal\_ledger', query: 'SELECT MAX(signal\_date) as max\_val, COUNT(\*) as cnt FROM algorithmic\_signal\_ledger' },

\-    { table: 'floorsheet\_contracts', query: 'SELECT MAX(trade\_time) as max\_val, COUNT(\*) as cnt FROM floorsheet\_contracts' },

\+    { table: 'floorsheet\_contracts', query: 'SELECT MAX(trade\_date) as max\_val, COUNT(\*) as cnt FROM floorsheet\_contracts' },

@@ -349,7 +349,7 @@

&#x20;    { ep: '/api/brokers/directory', mod: 'Services: Brokers Directory' },

\-    { ep: '/api/market/broker-summary?date=2026-11-19', mod: 'Services: Market Broker Summary' },

\+    { ep: `/api/market/broker-summary?date=${sampleDate}`, mod: 'Services: Market Broker Summary' },

@@ -379,15 +379,14 @@

&#x20;        if (nabilBroker) {

&#x20;          const dbNabilVol = db.prepare(`

&#x20;            SELECT SUM(buy\_vol) as total\_buy\_vol

&#x20;            FROM daily\_broker\_ledger

\-            WHERE trade\_date = '2026-11-19' AND symbol = 'NABIL'

\-          `).get() as any;

\+            WHERE trade\_date = ? AND symbol = 'NABIL'

\+          `).get(sampleDate) as any;

&#x20;

\-          if (dbNabilVol \&\& nabilBroker.totalVolume !== dbNabilVol.total\_buy\_vol) {

\-            // Note: broker ledger total volume could represent buy or turnover

\-            if (nabilBroker.totalVolume === 0) {

\-              parityMatches = false;

\-              discrepancies.push(`Broker summary totalVolume is 0 for NABIL on 2026-11-19`);

\-            }

\+          if (dbNabilVol \&\& Number(nabilBroker.totalVolume) !== Number(dbNabilVol.total\_buy\_vol)) {

\+            parityMatches = false;

\+            discrepancies.push(

\+              `Broker summary volume mismatch for NABIL on ${sampleDate}: API=${nabilBroker.totalVolume} vs DB=${dbNabilVol.total\_buy\_vol}`

\+            );

&#x20;          }

&#x20;        }

```\[cite: 2, 3]



```
### 1. Files Inspected in This Turn (100% Coverage Transparency)



\*\*Inspected in full:\*\*



\* `src/utils/localLedgerManager.ts`

\* `src/utils/masterAlphaPipeline.js`

\* `src/utils/masterPositionSizing.js`

\* `src/utils/masterProfitEngine.ts`

\* `src/utils/microstructureEngine.js`

\* `src/utils/mockData.js`

\* `src/utils/nepaliDate.js`

\* `src/utils/nepseAdapterLayer.js`

\* `src/utils/nepseCalendar.js`

\* `src/utils/nepseEquityFilter.js`

\* `src/utils/nepseRules.js`

\* `src/utils/newsImpactScorer.js`

\* `src/utils/paperTrading.js`

\* `src/utils/priceActionEngine.js`



\*\*Inspected partially (input truncated in bundle):\*\*



\* `src/utils/priceAdjustment.js` (truncated at `else...` inside `aggregateToWeeklyCandles`)







\---



\### 2. Audit Findings Table (Continued from `A1-050`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| `A1-051` | \*\*P0\*\* | `src/utils/localLedgerManager.ts` (`getHistoricalSubfileFloorsheet`) | Fabricates up to 120 fake floorsheet trades using `Math.sin()`, `Math.random()`, hardcoded fallback brokers `'62'`/`'60'`, synthetic block deals (`i % 6 === 0`), fake `contractNo`, fake timestamps, and inflated `totalTrades: Math.max(totalElements, 360)`, yet returns `isReal: true`. | Offline or proxy-degraded investors inspect completely fabricated broker-to-broker trades, whale blocks, and price-volume profiles labeled as authentic (`isReal: true`). | Remove all synthetic trade generation; return `rows: \[]`, `bulkTransactions: \[]`, `isReal: false`, `isTickDataUnavailable: true`, preserving only authentic session `totalQuantity`/`totalAmount` totals. |

| `A1-052` | \*\*P0\*\* | `src/utils/masterAlphaPipeline.js` (`runUnifiedFiveStepAlphaDesk`, `evaluateSingleStockAlphaDossier`) \& `src/utils/masterProfitEngine.ts` (`evaluateMasterStock`) | \*\*Cross-file contract break:\*\* `masterAlphaPipeline.js` reads `masterEval.turnoverLakhs` in 4 places, but `evaluateMasterStock` returns `turnover` (raw NPR) and never sets `turnoverLakhs`. `undefined >= 40` is always `false`, failing `step2GatePassed` for 100% of stocks and passing `NaN` (`undefined \* 100000`) into `calculateDynamicPositionSizing`. `evaluateSingleStockAlphaDossier` also fabricates `ltp = 100` when missing and computes `netRRR1` against gross risk instead of statutory net risk. | The entire 5-Step Alpha Desk is permanently locked in `CASH\_PRESERVATION\_MODE` with 0 qualified picks, and manual stock inspections compute inflated R:R and fake Rs 100 prices on missing quotes. | Compute and export `turnoverLakhs: +(turnover / 100000).toFixed(2)` from `evaluateMasterStock`, compute `turnoverLakhs` safely in `masterAlphaPipeline.js`, reject `ltp <= 0` in `evaluateSingleStockAlphaDossier`, and compute `totalNetRiskRupees` via `calculateExactStatutoryTrade`. |

| `A1-053` | \*\*P0\*\* | `src/utils/masterProfitEngine.ts` (`evaluateMasterStock`, `runMasterGuideAudit`) | 1) When `floatKnown === false`, `publicFloatM = 0` -> `publicFloatShares = Math.max(1, 0) = 1`, exploding `freeFloatCorneredPct` to `5,000,000%` and awarding unearned score (+5) \& win-rate (+4) bonuses. 2) Fabricates `ltp = 100`, `bvps = 100`, and `bcr3 = rawNetBcr3 \* 2.2` (can exceed 100%). 3) Lock-in parser treats BS month/day directly as Gregorian (`${bsYear - 57}-${bsMonth}-${bsDay}` — off by \~4 months or `Invalid Date` on 32-day BS months) and uses 60d instead of statutory 120d cliff (`nepseRegulatoryEngine.ts` / `ledgerStore.js`). 4) `runMasterGuideAudit` simulates 20-trade compounding on gross gains scaled 5x (ignoring liquidity caps \& friction) and hardcodes `payoffRatio: 2.5`. | Stocks with unknown float receive fake cornering scores; unpriced scrips evaluate at Rs 100; imminent promoter lock-in expiries (61–119d) slip past the veto; 20-trade compounding projections wildly overstate returns. | Return `freeFloatCorneredPct = 0` when `!floatKnown`, reject `ltp <= 0`, keep missing `bvps` nullable, cap/stop fabricating `bcr3 \* 2.2`, convert BS lock-in dates via `bsToAd` with 120-day threshold, and run compound simulation on net post-fee gains with actual `netRRR`. |

| `A1-054` | \*\*P0\*\* | `src/utils/localLedgerManager.ts` (`useTodayStaticAnalytics`, `getHistoricalSubfileDirect`, `getHistoricalSubfileBrokerAnalysis`) | \*\*Static JSON silently overrides live data:\*\* 1) `useTodayStaticAnalytics` returns cached IndexedDB or bundled `./data/today\_static\_analytics.json` without checking session date and exits before fetching `/api/today/static-analytics`. 2) Hardcoded `dateMap` (`'2026-11-19': 1` ... `'2026-11-06': 5`) maps dates to the wrong `historical\_day\_N.json` once `2026-11-20`+ rolls in. 3) `getHistoricalSubfileBrokerAnalysis('ALL')` reads static `nepse\_cumulative\_broker\_ledger.json` via `getCumulativeBrokerData` and stamps `endDate: latestTradingSession(...)` and `lastUpdated: new Date().toISOString()`, hiding staleness. | Investors see stale static analytics/broker ledgers masquerading as today's live data, and date-picker selections load the wrong trading session. | Validate `session\_date` against `latestTradingSession()` and refresh from `/api/today/static-analytics` when stale; resolve `subfileNum` strictly from the manifest (verify `json.session\_date === dateOrOffset`); expose `isStale: true` and actual snapshot `compiled\_at`/`endDate` on static cumulative ledger fallback. |

| `A1-055` | \*\*P0\*\* | `src/utils/masterPositionSizing.js` (`calculateNetTradeGain`, `computeMasterPositionSizing`) | 1) Omits buy-side Rs. 25 DP charge (charges Rs. 25 total vs Rs. 50 statutory round-trip in `marketRules.js`/`signalTrackerStore.js`/`masterAlphaPipeline.js`), divides `netReturnPct` by gross `buyValue` instead of `totalBuyCost`, and computes `statutoryBreakevenPrice` using `sellBrokerFee` at `targetPrice` instead of breakeven price. 2) `computeMasterPositionSizing` fabricates `effLtp = 100` on invalid price, clamps inverted stop-loss (`stopLoss >= ltp`) to `riskPerShare = 1.0` (producing huge oversized share counts), and ignores buy-side fees in `maxAffordableShares`. | Position sizes blow up on inverted stop-losses, capital outlays exceed available cash after fees, and breakeven/net-return metrics disagree across modules. | Include Rs. 25 buy DP + Rs. 25 sell DP, divide `netReturnPct` by `totalBuyCost`, iteratively solve `statutoryBreakevenPrice`, reject `ltp <= 0` or `stopLoss >= ltp` (`allowedShares: 0`), and reserve \~0.5% + Rs. 25 for buy fees in `maxAffordableShares`. |

| `A1-056` | \*\*P0\*\* | `src/utils/microstructureEngine.js` (`calculateMultiDayDiagnostics`, `buildDailyHistoryFromStockData`, `evaluateEarlyIgnition`, `detectCycleStartDate`) | 1) `dailyFlow` evaluates `(sVol === 0 \&\& b.amount ? b.amount : 0) ?? (bVol \* ...)` — because `0` is not nullish, the `avgBuyPrice`/`rate` fallback is dead code, zeroing out `buyAmt`/`sellAmt` whenever a broker both buys and sells. 2) `isWashTrap` runs `Number(diag3d.retentionPct || 80)` — coercing `0%` retention (100% wash trading!) to `80%`, disabling the wash-trap veto. 3) Fabricates `100` price/volume fallbacks (`anchorPrice`, `anchor3d`, `closePx`, `totalVol`) and uses gross `sellVol` instead of net sell in `t2RetentionPct`. 4) Same non-contiguous `streakDays` bug as `A1-024`. | Wash-trading traps with 0% net retention pass undetected; brokers trading both sides show `Rs 0` buy/sell turnover; unpriced stocks show fake Rs 98.5–103.5 buy zones. | Replace `: 0` with `: null` before `??`, use `diag3d.retentionPct ?? 80` (or compute from `topAccumulators`), remove fabricated `100` fallbacks, compute net selling in `t2RetentionPct`, and calculate trailing contiguous `streakDays`. |

| `A1-057` | \*\*P0\*\* | `src/utils/mockData.js` (`runStockScanners`, `LOCK\_IN\_DATA`, `NEPSE\_BROKERS`, `calculateIndices`) | 1) \*\*Unit mismatch:\*\* `stealth\_accumulation`, `aggressive\_accumulators`, `broker\_dominance`, `aggressive\_holdings`, `slow\_accumulation` test `s.bcr3 >= 0.35 / 0.30 / 0.25` (decimal) against percentage-scaled `bcr3` (`0..100`), matching nearly 100% of stocks; `large\_cap`/`mid\_cap`/`small\_cap` compare raw NPR `marketCap` (billions) against `15000`/`4000`, putting every stock in `large\_cap`. 2) `circuit\_up`/`circuit\_down` fall back to all positive/negative stocks, listing +0.1% movers as circuit hits. 3) `NEPSE\_BROKERS` maps `#64` to Sani Securities (actually #42; #64 is Sun Securities) and `#47` to Nivana Capital (actually Neev Securities). 4) `LOCK\_IN\_DATA` exports hardcoded expired dates (`2026-09-15`, `2026-10-02`, `2026-11-12`) with frozen `daysLeft: 20` and stale prices. | Market scanners misclassify every stock's market cap and BCR3 concentration, show ordinary movers as circuit hits, mislabel broker names, and display expired lock-ins as "20 days left". | Normalize `bcr3` unit (`val > 1 ? val : val \* 100`) against `35/30/25%`, normalize `marketCap` to NPR millions, remove non-circuit fallbacks, fix broker #42/#64/#47 names, and compute `daysLeft` dynamically (or empty stale `LOCK\_IN\_DATA`). |

| `A1-058` | \*\*P0\*\* | `src/utils/nepseAdapterLayer.js` (`parseDateToIso`, `normalizeCandleSeries`, `normalizeLiveQuote`, `normalizeShareStructure`) | 1) `normalizeCandleSeries` (UDF) and `parseDateToIso` format timestamps via `.toISOString().slice(0, 10)` (UTC), shifting NPT midnight timestamps backwards by 1 day (e.g. Monday becomes Sunday). 2) `normalizeLiveQuote` accepts `0` for `high`/`low` (allowing `high < low` or `low = 0`) and sets `prevClose = ltp` when `change` is `0` even if `pChange` is non-zero. 3) `normalizeShareStructure` uses `<= 60` day lock-in threshold instead of statutory `< 120` days. | Candle dates shift off-by-one against floorsheet/calendar dates; pre-open/glitch `0` lows corrupt ATR and support levels; 61–119 day lock-in expiries go unflagged. | Format UDF/timestamp dates in `Asia/Kathmandu` NPT (`formatNptDateIso`), sanitize `high`/`low` (`> 0` and `high >= low`), derive `prevClose = ltp / (1 + pChange / 100)` when `change === 0 \&\& pChange !== 0`, and update lock-in blackout to `< 120` days. |

| `A1-059` | \*\*P0\*\* | `src/utils/nepseCalendar.js` (`NEPSE\_PUBLIC\_HOLIDAYS`, `addTradingDays`, `latestTradingSession`, `setDynamicMarketHalt`, `getDetailedMarketStatus`) | 1) Lists `'2026-08-27'` as a public holiday even though `2026-08-27` was an active NEPSE trading session (`floorsheet-full-2026-08-27.json` in repo; Janai Purnima was `2026-08-28`), and diverges on 15+ 2026 dates from `src/constants/marketRules.js`. 2) `getDetailedMarketStatus` returns `lastTradingDay` as a `string` when `\_liveMarketOverride` is active but as a `Date` in all other branches. 3) `setDynamicMarketHalt`/`clearDynamicMarketHalt` never clear `\_tradingSessionsBetweenCache`. 4) `addTradingDays` and `latestTradingSession` use local `.setDate()` instead of UTC-noon `setUTCDate()`. | T+2 settlement calculations and trading-day windows miscount sessions around Aug 27 and emergency halts; callers expecting `Date` on `lastTradingDay` crash during live overrides. | Remove `'2026-08-27'` from `NEPSE\_PUBLIC\_HOLIDAYS`, clear `\_tradingSessionsBetweenCache` on halt changes, return `Date` consistently for `lastTradingDay` (plus `lastTradingDayIso`), and anchor `addTradingDays`/`latestTradingSession` to UTC noon. |

| `A1-060` | \*\*P0\*\* | `src/utils/paperTrading.js` (`validateAndExecutePaperOrder`, `executePaperSell`, `calculateSandboxSummary`) | 1) `settledAtMs` adds 2 \*\*calendar days\*\* (`2 \* 86400000`) instead of 2 NEPSE trading sessions (unlocking Friday buys on Sunday and holiday buys mid-festival). 2) `executePaperSell` defaults `enforceT2Settlement` to `false`, allowing instant T+0 sells. 3) Mixed FIFO lots compute a single blended `avgHoldingDays` for CGT (5.0% vs 7.5%), miscalculating tax on split short-term/long-term sells. 4) `calculateSandboxSummary` divides by `p.totalCost` unguarded and ignores `p.qty` fallback. | Paper trading sandbox teaches traders impossible T+0/weekend exits and reports inaccurate CGT and `NaN` P\&L on zero-cost/legacy positions. | Compute `settledAtMs` using `calculateT2SettlementDate()` from `nepseCalendar.js`, default `enforceT2Settlement` to `true`, compute CGT per FIFO lot (short vs long), and guard `p.totalCost > 0` + `p.quantity ?? p.qty`. |

| `A1-061` | \*\*P0\*\* | `src/utils/priceActionEngine.js` (`analyzeMarketStructure`, `analyzeCandlestickPattern`, `analyzeSupportResistance`, `analyzeBreakout`, `analyzePriceAction`) | 1) Assumes ascending candle order without sorting; DESC SQLite arrays invert swings, engulfing/hammer patterns, and breakouts. 2) `analyzeSupportResistance` feeds `latestBar` (current bar) instead of `candles\[n - 2]` into `calculatePivotPoints` (lookahead), computes 52W high/low from `close` instead of `high`/`low`, and divides by `currentPrice`/`cClose` without `> 0` guards. | Reversed candlestick signals (Bearish Engulfing read as Bullish), lookahead pivot points, understated 52W extremes, and `NaN`/`Infinity` on zero-close bars. | Normalize and sort candles chronologically ascending at entry, use `candles\[n - 2]` for classic pivots, use `high`/`low` for 52W extremes, and guard `currentPrice > 0` / `cClose > 0`. |

| `A1-062` | \*\*P0\*\* | `src/utils/priceAdjustment.js` (`calculateRightAdjustedPrice`, `calculateNepseCorporateActionAdjustment`, `parseCorporateAction`, `adjustPricesForCorporateActions`) | 1) `rawR > 3.0 ? rawR / 100 : rawR` misinterprets any `<= 3%` right share (e.g. `2.5%`) as `250%`. 2) `parseCorporateAction` returns on the first matched type (`bonus`), silently discarding simultaneous `right`/`cash` on the same record, ignores DB snake\_case keys (`bonus\_share\_pct`, `cash\_dividend\_pct`, `book\_close\_date`), and ignores the NEPSE `> 10%` cash-dividend price-adjustment threshold. 3) Sequential application of simultaneous Bonus + Right on the same ex-date fails to divide `R \* S` by `1 + B`. | Right-share adjustments on small ratios collapse prices by >60%; combined bonus+cash or bonus+right book closures produce wrong historical back-adjusted charts and indicator signals. | Require explicit ratio/percent handling (remove `> 3.0` heuristic in percent-typed APIs), group simultaneous actions by `exDate` and apply the unified NEPSE formula `(P\_cum - cashDed + R\*S) / (1 + B + R)` with the `> 10%` cash threshold and snake\_case support. |

| `A1-063` | \*\*P1\*\* | `src/utils/localLedgerManager.ts` (`initLocalLedger`, `syncLedgerFromServer`, `useScrip5DayData`, `useServiceHubData`, `fetchCloudHistoricalData`, `useScrip4DayTrajectory`) | Background `syncLedgerFromServer()` updates `\_hotHistoricalLedger` without notifying mounted React hooks (`useScrip5DayData`, `useServiceHubData`), leaving UI on stale IndexedDB/bundled data until full reload; all `fetch()` calls lack `AbortSignal.timeout`. | Users remain stuck on stale previous-day data for an entire session after cold boot, or suffer hanging UI loaders on slow networks. | Emit a subscriber notification when `\_hotHistoricalLedger` updates in `syncLedgerFromServer()`, subscribe inside `useScrip5DayData`/`useServiceHubData`, and add `AbortSignal.timeout(10000)` to network fetches. |

| `A1-064` | \*\*P1\*\* | `src/utils/nepseRules.js` (`checkCircuitStatus`, `clampReturnIntervalToCircuit`) | 1) `pChange !== null` evaluates `true` for `undefined`, setting `chg = NaN` and silently disabling `isNearCircuit`/`isCeilingLocked`. 2) `Number(lowerPct) || -circuitPct` coerces valid `0` bounds to `-15`/`+15`. | Stocks with undefined `pChange` bypass circuit-lock warnings; 0% lower/upper interval clamps silently expand to ±15%. | Check `pChange != null \&\& Number.isFinite(Number(pChange))` in `checkCircuitStatus`, and check `Number.isFinite(Number(...))` instead of `||` in `clampReturnIntervalToCircuit`. |

| `A1-065` | \*\*P1\*\* | `src/utils/nepaliDate.js` (`adToBS`) | Uses local browser `.getFullYear()/.getMonth()/.getDate()` instead of `Asia/Kathmandu` NPT, and lacks invalid-Date guards. | Non-NPT users (and UTC servers) see Bikram Sambat dates shifted by 1 day for 6–17 hours daily. | Extract year/month/day in `Asia/Kathmandu` via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' })` and guard invalid dates. |

| `A1-066` | \*\*P1\*\* | `src/utils/newsImpactScorer.js` (`ENTITY\_GROUPS`, `parseNewsTimestamp`, `calculateTradingSessionHoursElapsed`) | 1) Wrong tickers/aliases in `ENTITY\_GROUPS`: `PBL` (should be `PCBL`), `KDLBL` (should be `KSBBL`), `GCCL`/`घोडाही` (should be `GCIL`/`घोराही`), `CGBL` (should be `CGH`), `BPCL` mapped to `'बुध्द'` instead of `'बुटवल पावर'`. 2) `parseNewsTimestamp` misses English `'yesterday'` and Nepali-digit BS dates (`२०८३/०७/२०`). 3) `calculateTradingSessionHoursElapsed` ignores NEPSE public holidays. | Cross-portal deduplication fails to merge duplicate news for PCBL/KSBBL/GCIL/CGH/BPCL, drops Nepali-digit dates, and decays festival-holiday announcements to zero before market reopen. | Fix `ENTITY\_GROUPS` tickers/aliases, normalize Nepali digits before `bsMatch` and handle `'yesterday'`, and check `isNepseTradingDay()` inside `calculateTradingSessionHoursElapsed`. |

| `A1-067` | \*\*P1\*\* | `src/utils/nepseEquityFilter.js` (`isMutualFundOrDebenture`, `isPureNepseEquity`) | Mutual fund `KDBY` (no digits, ends in `Y`) and non-digit debentures `SCBD`, `SHINED`, `SIPD` (present in `proxy/data/broker\_alltime/`) bypass filtering when called without price/sector (`isPureNepseEquity('KDBY')` defaults `price = 100`). | Mutual funds and debentures leak into pure-equity screeners, sector ranks, and whale trackers. | Add `KDBY`, `MBLEF`, `NIBLGF`, `SCBD`, `SHINED`, `SIPD` to `KNOWN\_NON\_EQUITY\_SYMBOLS\_RE` and exclude `sym.endsWith('D') \&\& sym !== 'NFD'`. |

| `A1-068` | \*\*P1\*\* | `src/utils/masterAlphaPipeline.js` (`computeSectorRelativeStrengthRanks`, `extractSafeFeatureVector`, `predictMultiHorizonProbabilities`) | 1) `computeSectorRelativeStrengthRanks` and `extractSafeFeatureVector` assume ascending candle order without sorting (inverting 10D sector momentum and feature returns on DESC arrays). 2) `predictMultiHorizonProbabilities` returns biased bullish probabilities (`52%/54%/55%`) when history `< 5` sessions. | Sector leadership rankings and ML feature vectors flip sign on DESC histories; newly listed scrips show artificial bullish bias. | Sort candles chronologically ascending before slicing, and return neutral `50.0%` probabilities when `supported: false`. |

| `A1-069` | \*\*P1\*\* | `src/utils/priceAdjustment.js` (`aggregateToWeeklyCandles`) | Uses local-timezone `dt.getDay()` / `dt.getDate()` on ISO `YYYY-MM-DD` dates parsed as UTC midnight, shifting every date backward by 1 day in negative-UTC timezones and splitting Mondays into the prior week. | Weekly OHLCV candles are misaligned for users in US/Americas timezones. | Parse ISO dates explicitly at UTC noon and use `getUTCDay()` / `setUTCDate()`. |

| `A1-070` | \*\*P2\*\* | `src/utils/masterProfitEngine.ts` (`getIntradayExecutionState`) | Calls `new Date()` directly instead of `getAppNow()`, uses DST-fragile `getTimezoneOffset()` math, and ignores `\_liveMarketOverride`. | Replay/time-travel harness tests and live exchange overrides disagree with Master Profit session state. | Delegate time/session checks to `getAppNow()` and `getDetailedMarketStatus()`. |

| `A1-071` | \*\*P2\*\* | `src/utils/priceActionEngine.js` (`analyzeBreakout`) | Invokes `analyzeSupportResistance(candles.slice(0, -1))` twice per stock (`nearestResistance` and `priorSrForBreak`). | Doubles S/R clustering CPU overhead during full-universe scans. | Compute `priorSr` once and reuse across `nearestResistance`, `nearestSupport`, and `retestLevel`. |

| `A1-072` | \*\*P2\*\* | `src/utils/localLedgerManager.ts` (`useTodayLiveTickStream`) | `EventSource` never exposes last-tick timestamp / staleness to UI when connection drops or stalls. | Stale live tick remains displayed indefinitely after silent SSE drop. | Track and return `lastTickAt` timestamp from `useTodayLiveTickStream`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 \& P1 Bugs Only)



\#### `A1-051`, `A1-054`, `A1-063` — `src/utils/localLedgerManager.ts`



```diff

\--- a/src/utils/localLedgerManager.ts

+++ b/src/utils/localLedgerManager.ts

@@ -91,6 +91,11 @@

&#x20;let \_hotLiveSession: any = null;

&#x20;let \_isInitializing = false;

&#x20;const \_initListeners: Array<(ledger: Historical4DayLedger | null) => void> = \[];

+const \_ledgerUpdateSubscribers = new Set<(ledger: Historical4DayLedger) => void>();

\+

+function notifyLedgerSubscribers(ledger: Historical4DayLedger) {

\+  \_ledgerUpdateSubscribers.forEach(cb => { try { cb(ledger); } catch (\_) {} });

+}

&#x20;

&#x20;/\*\*

&#x20; \* Initializes the client-side local ledger.

@@ -160,10 +165,10 @@

&#x20;    if (!data \&\& typeof fetch !== 'undefined') {

&#x20;      const base = getProxyBase();

&#x20;      try {

\-        const res = await fetch(`${base}/api/ledger/5day-history`);

\+        const res = await fetch(`${base}/api/ledger/5day-history`, { signal: AbortSignal.timeout(10000) });

&#x20;        if (res.ok) data = await res.json();

&#x20;      } catch (\_) {

\-        const res2 = await fetch(`${base}/api/ledger/4day-history`);

\+        const res2 = await fetch(`${base}/api/ledger/4day-history`, { signal: AbortSignal.timeout(10000) });

&#x20;        if (res2.ok) data = await res2.json();

&#x20;      }

&#x20;    }

@@ -180,6 +185,7 @@

&#x20;

&#x20;      if (isNewer) {

&#x20;        \_hotHistoricalLedger = data;

\+        notifyLedgerSubscribers(data);

&#x20;        // Persist to IndexedDB with 7-day safety TTL, automatically replacing older 5-day window

&#x20;        await idbSet(STORAGE\_KEY\_4D, data, 7 \* 24 \* 60 \* 60 \* 1000);

&#x20;        console.log(`\[LocalLedger] Auto-replaced local 5-day ledger with new sessions: ${data.trading\_sessions?.join(', ')}`);

@@ -238,7 +244,12 @@

&#x20;    }

&#x20;

&#x20;    loadData();

\-    return () => { isMounted = false; };

\+    const onUpdate = (updated: Historical4DayLedger) => {

\+      if (isMounted) setScripData(updated.stocks?.\[cleanSym] || null);

\+    };

\+    \_ledgerUpdateSubscribers.add(onUpdate);

\+    return () => { isMounted = false; \_ledgerUpdateSubscribers.delete(onUpdate); };

&#x20;  }, \[cleanSym]);

@@ -282,7 +293,11 @@

&#x20;      }

&#x20;    }

&#x20;    load();

\-    return () => { isMounted = false; };

\+    const onUpdate = (updated: Historical4DayLedger) => {

\+      if (isMounted \&\& updated.service\_hub) setHubData(updated.service\_hub);

\+    };

\+    \_ledgerUpdateSubscribers.add(onUpdate);

\+    return () => { isMounted = false; \_ledgerUpdateSubscribers.delete(onUpdate); };

&#x20;  }, \[]);

&#x20;

&#x20;  return { hubData, isLoading };

@@ -299,7 +314,7 @@

&#x20;    if (data) return data;

&#x20;    if (typeof fetch !== 'undefined') {

&#x20;      const base = getProxyBase();

\-      const res = await fetch(`${base}/api/history/${sym}?days=${days}`);

\+      const res = await fetch(`${base}/api/history/${sym}?days=${days}`, { signal: AbortSignal.timeout(12000) });

&#x20;      if (res.ok) return await res.json();

&#x20;    }

&#x20;    return null;

@@ -355,61 +370,58 @@

&#x20;    let isMounted = true;

&#x20;    async function loadStatic() {

\-      // 1. Check in-memory cache

\-      if (\_staticAnalyticsCache.has(cleanSym)) {

\-        setData(\_staticAnalyticsCache.get(cleanSym));

\+      const expectedSession = latestTradingSession(new Date(), false);

\+      const isFreshForSession = (rec: any) =>

\+        Boolean(rec \&\& rec.session\_date \&\& String(rec.session\_date).slice(0, 10) >= expectedSession);

\+

\+      // 1. Check in-memory cache (only short-circuit if fresh for current/latest session)

\+      const memHit = \_staticAnalyticsCache.get(cleanSym);

\+      if (memHit \&\& isFreshForSession(memHit)) {

\+        setData(memHit);

&#x20;        setIsLoading(false);

&#x20;        return;

&#x20;      }

&#x20;

\-      // 2. Check IndexedDB

\+      // 2. Check IndexedDB for immediate provisional display, then validate against live proxy if stale

\+      let fallbackCandidate: any = memHit || null;

&#x20;      try {

&#x20;        const idbKey = `today\_static\_${cleanSym}`;

&#x20;        const cachedIdb = await idbGet(idbKey);

&#x20;        if (cachedIdb \&\& isMounted) {

\-          \_staticAnalyticsCache.set(cleanSym, cachedIdb);

\-          setData(cachedIdb);

\-          setIsLoading(false);

\-          return;

\+          fallbackCandidate = cachedIdb;

\+          if (isFreshForSession(cachedIdb)) {

\+            \_staticAnalyticsCache.set(cleanSym, cachedIdb);

\+            setData(cachedIdb);

\+            setIsLoading(false);

\+            return;

\+          }

&#x20;        }

&#x20;      } catch (\_) {}

&#x20;

\-      // 3. Local bundled asset check (0ms offline APK access without network call)

\+      // 3. Primary Network Fetch from live backend proxy BEFORE falling back to static bundle

&#x20;      try {

\-        let raw: any = null;

\-        for (const candidate of \['./data/today\_static\_analytics.json', '/data/today\_static\_analytics.json']) {

\-          try {

\-            const localRes = await fetch(candidate);

\-            if (localRes.ok) {

\-              raw = await localRes.json();

\-              break;

\-            }

\-          } catch (\_) {}

\-        }

\-        if (raw \&\& raw.scrips) {

\-          const scripData = raw.scrips\[cleanSym];

\-          if (scripData \&\& isMounted) {

\-            \_staticAnalyticsCache.set(cleanSym, scripData);

\-            setData(scripData);

\-            setIsLoading(false);

\-            idbSet(`today\_static\_${cleanSym}`, scripData).catch(() => {});

\+        const base = getProxyBase();

\+        const res = await fetch(`${base}/api/today/static-analytics?symbol=${cleanSym}`, {

\+          signal: AbortSignal.timeout(8000)

\+        });

\+        if (res.ok \&\& res.status !== 304) {

\+          const json = await res.json();

\+          const scripData = json.data || json;

\+          if (scripData \&\& isMounted) {

\+            const tagged = { ...scripData, session\_date: scripData.session\_date || json.session\_date || expectedSession, isStale: false };

\+            \_staticAnalyticsCache.set(cleanSym, tagged);

\+            setData(tagged);

\+            idbSet(`today\_static\_${cleanSym}`, tagged).catch(() => {});

&#x20;            return;

&#x20;          }

&#x20;        }

\-      } catch (\_) {}

\-

\-      // 4. Network fetch from backend proxy (with ETag \& 304 support)

\-      try {

\-        const base = getProxyBase();

\-        const res = await fetch(`${base}/api/today/static-analytics?symbol=${cleanSym}`);

\-        if (res.ok \&\& res.status !== 304) {

\-          const json = await res.json();

\-          const scripData = json.data || json;

\-          if (scripData \&\& isMounted) {

\-            \_staticAnalyticsCache.set(cleanSym, scripData);

\-            setData(scripData);

\-            idbSet(`today\_static\_${cleanSym}`, scripData).catch(() => {});

\-          }

\-        }

&#x20;      } catch (err) {

&#x20;        console.warn(`\[LocalLedger] Static analytics load notice for ${cleanSym}:`, (err as Error).message);

\-      } finally {

\-        if (isMounted) setIsLoading(false);

&#x20;      }

\+

\+      // 4. Offline Fallback: IndexedDB or bundled static asset explicitly labeled isStale: true

\+      if (!fallbackCandidate) {

\+        fallbackCandidate = await getTodayStaticAnalyticsDirect(cleanSym);

\+      }

\+      if (fallbackCandidate \&\& isMounted) {

\+        setData({ ...fallbackCandidate, isStale: true });

\+      }

\+      if (isMounted) setIsLoading(false);

&#x20;    }

@@ -579,16 +591,17 @@

&#x20;    if (manifest \&\& Array.isArray(manifest.subfiles)) {

&#x20;      const found = manifest.subfiles.find((s: any) => s.session\_date === dateOrOffset);

&#x20;      if (found) subfileNum = found.day\_offset;

&#x20;    }

\-    if (!subfileNum) {

\-      const dateMap: Record<string, number> = {

\-        '2026-11-19': 1,

\-        '2026-11-18': 2,

\-        '2026-11-17': 3,

\-        '2026-11-13': 4,

\-        '2026-11-06': 5

\-      };

\-      if (dateMap\[dateOrOffset]) subfileNum = dateMap\[dateOrOffset];

\-    }

\+    // Never use a hardcoded static dateMap; if manifest is absent, fall through to live proxy /api/ledger/subfiles/date/:date

&#x20;  }

&#x20;

&#x20;  if (subfileNum) {

@@ -608,6 +621,10 @@

&#x20;        if (localRes.ok) {

&#x20;          const json = await localRes.json();

&#x20;          if (json \&\& json.scrips) {

\+            // Guard against stale bundled subfile serving wrong session date

\+            if (typeof dateOrOffset === 'string' \&\& dateOrOffset.includes('-') \&\& json.session\_date !== dateOrOffset) {

\+              continue;

\+            }

&#x20;            \_subfileMemoryCache.set(cacheKey, json);

@@ -625,7 +642,7 @@

&#x20;    const url = typeof dateOrOffset === 'string' \&\& dateOrOffset.includes('-')

&#x20;      ? `${base}/api/ledger/subfiles/date/${dateOrOffset}`

&#x20;      : `${base}/api/ledger/subfiles/day/${subfileNum || 1}`;

\-    const res = await fetch(url);

\+    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

&#x20;    if (res.ok) {

&#x20;      const json = await res.json();

&#x20;      if (json \&\& json.scrips) {

@@ -682,16 +699,18 @@

&#x20;      const totalHeld = Number(cum.totalSharesHeldTillNow || cum.totalHoldQty || 0) || topAccs.reduce((s: number, a: any) => s + (a.netQty > 0 ? a.netQty : 0), 0);

&#x20;      const tradingSessions = Number(cum.coverage?.sessionCount || cum.coverage?.tradingDays || cum.tradingDays || cum.timeframeDays || 42);

\+      const snapshotEndDate = cum.coverage?.endDate || cum.lastSessionDate || cum.asOfDate || null;

\+      const latestSessionIso = latestTradingSession(new Date(), !isMarketOpen(new Date()));

\+      const isStaleSnapshot = !snapshotEndDate || snapshotEndDate < latestSessionIso;

&#x20;      const coverageObj = cum.coverage || {

&#x20;        startDate: '2026-08-27',

\-        endDate: latestTradingSession(new Date(), !isMarketOpen(new Date())),

\+        endDate: snapshotEndDate || 'UNKNOWN',

&#x20;        sessionCount: tradingSessions,

&#x20;        tradingDays: tradingSessions,

&#x20;        isLifetime: false,

\-        label: `Since 2026-08-27 (${tradingSessions} sessions)`,

\+        label: `Static Snapshot Since 2026-08-27 (${tradingSessions} sessions${snapshotEndDate ? `, through ${snapshotEndDate}` : ''})`,

&#x20;        disclaimer: `Covered from 2026-08-27 (${tradingSessions} sessions). Pre-2026-08-27 baseline unknown. Unadjusted for corporate actions.`,

&#x20;        isLiveIncomplete: false,

\-        lastUpdated: new Date().toISOString()

\+        lastUpdated: cum.compiled\_at || cum.exportedAt || null

&#x20;      };

&#x20;      return {

@@ -714,7 +733,8 @@

&#x20;        adSignal: (cum.smartMoneyNetFlowPct || 0) > 5 ? 'Accumulation' : (cum.smartMoneyNetFlowPct || 0) < -5 ? 'Distribution' : 'Neutral',

&#x20;        isReal: true,

\+        isStale: isStaleSnapshot,

&#x20;        source: 'cumulative\_broker\_ledger\_baseline',

&#x20;        coverage: coverageObj

&#x20;      };

@@ -807,14 +827,13 @@

&#x20;  // Multi-Day Synthesis across subfiles (up to requested numDays)

&#x20;  let startOffset = 1;

&#x20;  if (targetDate) {

\-    const dateMap: Record<string, number> = {

\-      '2026-11-19': 1,

\-      '2026-11-18': 2,

\-      '2026-11-17': 3,

\-      '2026-11-13': 4,

\-      '2026-11-06': 5

\-    };

\-    if (dateMap\[targetDate]) {

\-      startOffset = dateMap\[targetDate];

\+    const manifest = \_subfileMemoryCache.get('manifest') as any;

\+    const found = manifest?.subfiles?.find((s: any) => s.session\_date === targetDate);

\+    if (found?.day\_offset) {

\+      startOffset = Number(found.day\_offset);

&#x20;    }

&#x20;  }

@@ -1019,7 +1038,7 @@

&#x20;        setIsLoading(true);

&#x20;        const base = getProxyBase();

\-        const res = await fetch(`${base}/api/ledger/subfiles/trajectory/${cleanSym}`);

\+        const res = await fetch(`${base}/api/ledger/subfiles/trajectory/${cleanSym}`, { signal: AbortSignal.timeout(10000) });

&#x20;        if (res.ok) {

&#x20;          const json = await res.json();

@@ -1057,108 +1076,27 @@

&#x20;  const totalVol = Number(quote?.volume || 0);

&#x20;  const totalAmt = Number(quote?.turnover || 0);

\-  const vwap = Number(quote?.vwap || (totalVol > 0 ? +(totalAmt / totalVol).toFixed(2) : 100));

&#x20;  const sessionDate = sf.session\_date || targetDate || '';

&#x20;

\-  const buyers = (flow?.top\_5\_buyers || \[]).map((b: any) => ({

\-    brokerId: String(b.broker\_id),

\-    qty: Number(b.buy\_kitta || b.net\_kitta || 0),

\-    vwap: Number(b.buy\_vwap || vwap)

\-  }));

\-

\-  const sellers = (flow?.top\_5\_sellers || \[]).map((s: any) => ({

\-    brokerId: String(s.broker\_id),

\-    qty: Number(s.sell\_kitta || s.net\_dump\_kitta || 0),

\-    vwap: Number(s.sell\_vwap || vwap)

\-  }));

\-

\-  const rawRows: any\[] = \[];

\-  let contractNo = 202611000000 + Math.floor(Math.random() \* 10000);

\-  const baseTimeSec = 11 \* 3600 + 15 \* 60;

\-

\-  let bIdx = 0;

\-  let sIdx = 0;

\-  const maxTrades = Math.min(120, Math.max(25, (buyers.length + sellers.length) \* 8));

\-

\-  for (let i = 0; i < maxTrades; i++) {

\-    const b = buyers\[bIdx % (buyers.length || 1)] || { brokerId: '62', qty: 1000, vwap };

\-    const s = sellers\[sIdx % (sellers.length || 1)] || { brokerId: '60', qty: 1000, vwap };

\-    bIdx++;

\-    sIdx += (i % 2 === 0 ? 1 : 2);

\-

\-    const tradeRate = Number((((b.vwap + s.vwap) / 2) + ((Math.sin(i \* 1.7) \* 0.8))).toFixed(2));

\-    let tradeQty = Math.max(10, Math.min(2500, Math.round((Math.sin(i \* 0.9) + 1.2) \* 180 / 10) \* 10));

\-    // Introduce institutional block / bulk deals (>= 500 kitta) periodically

\-    if (i % 6 === 0) {

\-      tradeQty = 500 + ((i \* 150) % 1500);

\-    }

\-    const tradeAmt = Number((tradeRate \* tradeQty).toFixed(2));

\-    const timeOffsetSec = baseTimeSec + (i \* 95);

\-    const hrs = Math.floor(timeOffsetSec / 3600);

\-    const mins = Math.floor((timeOffsetSec % 3600) / 60);

\-    const secs = timeOffsetSec % 60;

\-    const timeStr = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

\-

\-    contractNo += Math.floor(Math.random() \* 15) + 1;

\-

\-    rawRows.push({

\-      contractNo: String(contractNo),

\-      transactionNo: String(contractNo),

\-      id: String(contractNo),

\-      symbol: sym,

\-      stockSymbol: sym,

\-      buyerBroker: b.brokerId,

\-      buyer: b.brokerId,

\-      sellerBroker: s.brokerId,

\-      seller: s.sellerId,

\-      quantity: tradeQty,

\-      qty: tradeQty,

\-      rate: tradeRate,

\-      amount: tradeAmt,

\-      time: timeStr,

\-      date: sessionDate,

\-      businessDate: sessionDate

\-    });

\-  }

\-

\-  let filtered = rawRows;

\-  if (filterBuyer) filtered = filtered.filter(r => r.buyerBroker === filterBuyer || r.buyer === filterBuyer);

\-  if (filterSeller) filtered = filtered.filter(r => r.sellerBroker === filterSeller || r.seller === filterSeller);

\-

\-  const pvMap: Record<string, { rate: number; qty: number; amount: number; trades: number }> = {};

\-  for (const r of rawRows) {

\-    const k = r.rate.toFixed(2);

\-    if (!pvMap\[k]) pvMap\[k] = { rate: r.rate, qty: 0, amount: 0, trades: 0 };

\-    pvMap\[k].qty += r.qty;

\-    pvMap\[k].amount += r.amount;

\-    pvMap\[k].trades += 1;

\-  }

\-  const totQ = Object.values(pvMap).reduce((s, x) => s + x.qty, 0) || 1;

\-  const priceVolumeBreakdown = Object.values(pvMap)

\-    .map(x => ({ ...x, pct: +((x.qty / totQ) \* 100).toFixed(2) }))

\-    .sort((a, b) => b.rate - a.rate);

\-

\-  const bulkTransactions = \[...rawRows]

\-    .filter(r => r.qty >= 500 || r.amount >= 150000)

\-    .sort((a, b) => b.amount - a.amount);

\-

\-  const totalElements = filtered.length;

\-  const totalPages = Math.ceil(totalElements / pageSize) || 1;

\-  const startIndex = (page - 1) \* pageSize;

\-  const pagedRows = filtered.slice(startIndex, startIndex + pageSize);

\-

\+  // NEVER fabricate synthetic floorsheet contracts via Math.sin/Math.random when offline.

\+  // Return authentic session summary totals with explicit empty tick rows.

&#x20;  return {

&#x20;    symbol: sym,

&#x20;    date: sessionDate,

&#x20;    businessDate: sessionDate,

\-    rows: pagedRows,

\+    rows: \[],

&#x20;    page,

&#x20;    size: pageSize,

\-    totalPages,

\-    totalElements: totalElements > 0 ? (totalVol > 0 ? Math.max(totalElements, 360) : totalElements) : 0,

\-    totalQuantity: totalVol > 0 ? totalVol : rawRows.reduce((s, r) => s + r.qty, 0),

\-    totalQty: totalVol > 0 ? totalVol : rawRows.reduce((s, r) => s + r.qty, 0),

\-    totalAmount: totalAmt > 0 ? totalAmt : rawRows.reduce((s, r) => s + r.amount, 0),

\-    totalAmt: totalAmt > 0 ? totalAmt : rawRows.reduce((s, r) => s + r.amount, 0),

\-    totalTrades: totalElements > 0 ? (totalVol > 0 ? Math.max(totalElements, 360) : totalElements) : 0,

\-    priceVolumeBreakdown,

\-    bulkTransactions,

\-    isReal: true,

\-    isEstimatedFlow: true,

\-    source: 'offline\_subfiles\_synthesized'

\+    totalPages: 0,

\+    totalElements: 0,

\+    totalQuantity: totalVol,

\+    totalQty: totalVol,

\+    totalAmount: totalAmt,

\+    totalAmt: totalAmt,

\+    totalTrades: 0,

\+    priceVolumeBreakdown: \[],

\+    bulkTransactions: \[],

\+    isReal: false,

\+    isTickDataUnavailable: true,

\+    source: 'offline\_subfiles\_summary\_only'

&#x20;  };

&#x20;}



```



\---



\#### `A1-052` \& `A1-068` — `src/utils/masterAlphaPipeline.js`



```diff

\--- a/src/utils/masterAlphaPipeline.js

+++ b/src/utils/masterAlphaPipeline.js

@@ -38,7 +38,10 @@

&#x20;    };

&#x20;  }

&#x20;

\-  const slice = candles.slice(0, idx + 1);

\+  const chronological = candles.slice().sort((a, b) =>

\+    String(a?.date || a?.t || '').localeCompare(String(b?.date || b?.t || ''))

\+  );

\+  const slice = chronological.slice(0, Math.min(idx + 1, chronological.length));

&#x20;  const n = slice.length;

&#x20;  const curr = slice\[n - 1];

@@ -151,9 +154,9 @@

&#x20;      macro,

&#x20;      horizons: {

\-        '1D': { horizon: '1D', probabilityPct: 52.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL\_HOLD' },

\-        '3D': { horizon: '3D', probabilityPct: 54.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL\_HOLD' },

\-        '5D': { horizon: '5D', probabilityPct: 55.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL\_HOLD' }

\+        '1D': { horizon: '1D', probabilityPct: 50.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL\_HOLD' },

\+        '3D': { horizon: '3D', probabilityPct: 50.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL\_HOLD' },

\+        '5D': { horizon: '5D', probabilityPct: 50.0, rawProbabilityPct: 50.0, convictionThresholdPct: macro.breakoutConvictionThreshold, isActionableBullish: false, signal: 'NEUTRAL\_HOLD' }

&#x20;      }

&#x20;    };

&#x20;  }

@@ -286,9 +289,12 @@

&#x20;    const hist = getCachedRealPriceHistory(s.symbol);

&#x20;    let ret10D = pChg;

&#x20;    if (Array.isArray(hist) \&\& hist.length >= 10) {

\-      const latestClose = Number(hist\[hist.length - 1]?.close || s.ltp || 0);

\-      const close10DAgo = Number(hist\[Math.max(0, hist.length - 10)]?.close || 0);

\+      const sortedHist = hist.slice().sort((a, b) =>

\+        String(a?.date || a?.t || '').localeCompare(String(b?.date || b?.t || ''))

\+      );

\+      const latestClose = Number(sortedHist\[sortedHist.length - 1]?.close || s.ltp || 0);

\+      const close10DAgo = Number(sortedHist\[Math.max(0, sortedHist.length - 10)]?.close || 0);

&#x20;      if (latestClose > 0 \&\& close10DAgo > 0) {

&#x20;        ret10D = ((latestClose - close10DAgo) / close10DAgo) \* 100;

&#x20;      }

@@ -387,12 +393,14 @@

&#x20;    // ── STEP 1 CHECK: Top 3 Sector Leadership ──

&#x20;    const step1SectorPassed = sectorRank <= 3 || (sectorRank <= 5 \&\& masterEval.setupScore >= 82);

&#x20;

\+    const turnoverLakhs = Number(masterEval.turnoverLakhs ?? (Number(masterEval.turnover || 0) / 100000));

\+

&#x20;    // ── STEP 2 CHECK: 8-Gate Quality Screener \& Confluence Score >= 72 ──

&#x20;    const step2GatePassed = Boolean(

&#x20;      masterEval.gatesPassedCount >= 6 \&\&

&#x20;      masterEval.setupScore >= 72 \&\&

&#x20;      !masterEval.isPromoterLockinNear \&\&

\-      masterEval.turnoverLakhs >= 40

\+      turnoverLakhs >= 40

&#x20;    );

@@ -439,7 +447,7 @@

&#x20;      stopLoss,

&#x20;      target1,

&#x20;      target2,

\-      median20DayTurnover: Math.max(5000000, masterEval.turnoverLakhs \* 100000)

\+      median20DayTurnover: Math.max(5000000, turnoverLakhs \* 100000)

&#x20;    });

@@ -487,7 +495,7 @@

&#x20;        passed: step2GatePassed,

&#x20;        metric: `${masterEval.gatesPassedCount}/8 Gates • Score ${masterEval.setupScore}/100`,

&#x20;        detail: step2GatePassed

\-          ? `Passed liquidity (${masterEval.turnoverLakhs}L), trend (>50 EMA), and lock-in safety.`

\+          ? `Passed liquidity (${turnoverLakhs.toFixed(1)}L), trend (>50 EMA), and lock-in safety.`

&#x20;          : `Failed one or more quality gates or score < 72.`

&#x20;      },

@@ -625,7 +633,8 @@

&#x20;  const symbol = sym;

\-  const ltp = Number(rawStock.ltp || rawStock.closePrice || 100);

\+  const ltp = Number(rawStock.ltp || rawStock.closePrice || 0);

\+  if (!Number.isFinite(ltp) || ltp <= 0) return null;

&#x20;  const sector = rawStock.sector || rawStock.sectorName || 'Others';

&#x20;  const sectorRank = Number(sectorRanks\[sector] ?? 99);

@@ -646,12 +655,14 @@

&#x20;  // Step 1: Sector RS

&#x20;  const step1SectorPassed = sectorRank <= 3 || (sectorRank <= 5 \&\& masterEval.setupScore >= 82);

&#x20;

\+  const turnoverLakhs = Number(masterEval.turnoverLakhs ?? (Number(masterEval.turnover || 0) / 100000));

\+

&#x20;  // Step 2: 8-Gate Quality

&#x20;  const step2GatePassed = Boolean(

&#x20;    masterEval.gatesPassedCount >= 6 \&\&

&#x20;    masterEval.setupScore >= 72 \&\&

&#x20;    !masterEval.isPromoterLockinNear \&\&

\-    masterEval.turnoverLakhs >= 40

\+    turnoverLakhs >= 40

&#x20;  );

@@ -693,7 +704,7 @@

&#x20;    stopLoss,

&#x20;    target1,

&#x20;    target2,

\-    median20DayTurnover: Math.max(5000000, masterEval.turnoverLakhs \* 100000)

\+    median20DayTurnover: Math.max(5000000, turnoverLakhs \* 100000)

&#x20;  });

@@ -716,9 +727,9 @@

&#x20;  const blendedRunnerGain = runnerT3Kitta > 0 ? calculateExactStatutoryTrade(ltp, target3Runner, runnerT3Kitta, cgtRate).netRealizedGain : 0;

&#x20;  const maximizedLadderNetProfit = Math.round(blendedTier1Gain + blendedTier2Gain + blendedRunnerGain);

&#x20;

\-  const riskPerShare = Math.max(1, ltp - stopLoss);

\-  const totalRiskRupees = Math.round(strict10LotKitta \* riskPerShare);

\-  const netRRR1 = totalRiskRupees > 0 ? +(netTradeT1.netRealizedGain / totalRiskRupees).toFixed(2) : Number(masterEval.netRRR || 2.5);

\+  const slTrade = calculateExactStatutoryTrade(ltp, stopLoss, strict10LotKitta, cgtRate);

\+  const totalRiskRupees = Math.max(1, Math.abs(slTrade.netRealizedGain));

\+  const netRRR1 = +(netTradeT1.netRealizedGain / totalRiskRupees).toFixed(2);

@@ -743,7 +754,7 @@

&#x20;      passed: step2GatePassed,

&#x20;      metric: `${masterEval.gatesPassedCount}/8 Gates • Score ${masterEval.setupScore}/100`,

&#x20;      detail: step2GatePassed

\-        ? `Passed liquidity (${masterEval.turnoverLakhs}L), trend (>50 EMA), and lock-in safety.`

\+        ? `Passed liquidity (${turnoverLakhs.toFixed(1)}L), trend (>50 EMA), and lock-in safety.`

&#x20;        : `Failed one or more quality gates (passed ${masterEval.gatesPassedCount}/8, score ${masterEval.setupScore}/100).`

&#x20;    },



```



\---



\#### `A1-052` \& `A1-053` — `src/utils/masterProfitEngine.ts`



```diff

\--- a/src/utils/masterProfitEngine.ts

+++ b/src/utils/masterProfitEngine.ts

@@ -42,6 +42,7 @@

&#x20;import { getCachedStockFundamentals, getCachedRealPriceHistory, getCachedRealBrokerAnalysis } from './historyCache.js';

&#x20;import { evaluateOrderFlowVeto } from './sharedBrokerAggregationEngine.js';

&#x20;import { getDetailedMarketStatus, isNepseWeekend, isNepsePublicHoliday } from './nepseCalendar.js';

+import { bsToAd } from './bikramSambat.js';

&#x20;import { NEPSE\_UNIVERSE } from '../data/nepseUniverse';

&#x20;import sebonPipelineData from '../data/sebonPipelineData.json';

@@ -75,6 +76,7 @@

&#x20;  pChange: number;

&#x20;  volume: number;

&#x20;  turnover: number;

\+  turnoverLakhs: number;

&#x20;  sharesOutM: number;

@@ -264,8 +266,9 @@

&#x20;  const sym = String(stock?.symbol || stock?.scrip || '').toUpperCase().trim();

&#x20;  const name = String(stock?.name || sym).trim();

&#x20;  const sector = String(stock?.sector || stock?.sectorName || 'General').trim();

\-  const ltp = Number(stock?.ltp || stock?.closePrice || stock?.price || 100);

\-  if (!isPureNepseEquity({ symbol: sym, sector, name, ltp }) || (ltp > 0 \&\& ltp < 50)) {

\+  const ltp = Number(stock?.ltp || stock?.closePrice || stock?.price || 0);

\+  if (!Number.isFinite(ltp) || ltp <= 0) return null as any;

\+  if (!isPureNepseEquity({ symbol: sym, sector, name, ltp }) || ltp < 50) {

&#x20;    return null as any;

&#x20;  }

&#x20;  const pChange = Number(stock?.pChange || stock?.percentageChange || 0);

&#x20;  const vol = Number(stock?.volume || stock?.totalTradedQuantity || 0);

&#x20;  const turnover = Number(stock?.turnover || stock?.totalTurnover || (ltp \* vol) || 0);

\+  const turnoverLakhs = +(turnover / 100000).toFixed(2);

&#x20;

&#x20;  // Fundamentals \& share structure

&#x20;  const cachedFund = stock?.cachedFund || getCachedStockFundamentals(sym);

&#x20;  const eps = Number(cachedFund?.eps !== undefined \&\& cachedFund?.eps !== null ? cachedFund.eps : (stock?.eps || 0));

\-  const bvps = Number(cachedFund?.bookValue !== undefined \&\& cachedFund?.bookValue !== null ? cachedFund.bookValue : (stock?.bookValue || stock?.bvps || 100));

\+  const rawBvps = cachedFund?.bookValue ?? stock?.bookValue ?? stock?.bvps ?? null;

\+  const bvps = rawBvps !== null \&\& Number(rawBvps) > 0 ? Number(rawBvps) : 0;

&#x20;  const pe = eps > 0 ? +(ltp / eps).toFixed(2) : (Number(stock?.pe) || 0);

\-  const pb = bvps > 0 ? +(ltp / bvps).toFixed(2) : (Number(stock?.pb) || 1.0);

\+  const pb = bvps > 0 ? +(ltp / bvps).toFixed(2) : (Number(stock?.pb) || 0);

@@ -330,8 +333,9 @@

&#x20;  const rawBcr3 = rawGrossBcr3 ?? rawNetBcr3 ?? null;

&#x20;

&#x20;  const isBrokerVerified = rawBcr3 !== null \&\& rawBcr3 !== undefined \&\& Number(rawBcr3) > 0;

\-  const bcr3 = isBrokerVerified ? Number(rawGrossBcr3 ?? (Number(rawNetBcr3) \* 2.2).toFixed(1)) : 0.0;

\-  const bcr3Net = rawNetBcr3 !== null \&\& rawNetBcr3 !== undefined ? Number(rawNetBcr3) : Number((bcr3 \* 0.45).toFixed(1));

\+  const bcr3 = isBrokerVerified

\+    ? Math.min(100, Number(rawGrossBcr3 ?? Number(rawNetBcr3)))

\+    : 0.0;

\+  const bcr3Net = rawNetBcr3 !== null \&\& rawNetBcr3 !== undefined ? Number(rawNetBcr3) : 0.0;

@@ -387,13 +391,15 @@

&#x20;      const bsMatch = String(sebonMatch.source).match(/(\\d{4})\\/(\\d{2})\\/(\\d{2})/);

&#x20;      if (bsMatch) {

\-        // Approximate BS→AD conversion: BS year - 56.7 years ≈ AD year

\-        const bsYear = parseInt(bsMatch\[1]);

\-        const adYear = bsYear - 57;

\-        const filingDate = new Date(`${adYear}-${bsMatch\[2]}-${bsMatch\[3]}`).getTime();

\-        if (!isNaN(filingDate)) {

\-          const unlockDate = filingDate + (3 \* 365.25 \* 24 \* 60 \* 60 \* 1000);

\-          daysToLockin = Math.ceil((unlockDate - Date.now()) / (1000 \* 60 \* 60 \* 24));

\+        try {

\+          const adFiling = bsToAd(parseInt(bsMatch\[1], 10), parseInt(bsMatch\[2], 10), parseInt(bsMatch\[3], 10));

\+          const filingDate = adFiling ? adFiling.getTime() : NaN;

\+          if (!isNaN(filingDate)) {

\+            const unlockDate = filingDate + (3 \* 365.25 \* 24 \* 60 \* 60 \* 1000);

\+            daysToLockin = Math.ceil((unlockDate - Date.now()) / (1000 \* 60 \* 60 \* 24));

\+          }

\+        } catch (\_) {}

\-        }

&#x20;      }

&#x20;    } else if (stock?.ipoAllotmentDate) {

&#x20;      // Priority 3: ipoAllotmentDate + 3 years heuristic

@@ -403,7 +409,8 @@

&#x20;    }

&#x20;  }

\-  const isPromoterLockinNear = daysToLockin !== null \&\& daysToLockin >= 0 \&\& daysToLockin <= 60;

\+  // Statutory SEBON 120-day promoter lock-in supply cliff (aligned with nepseRegulatoryEngine.ts \& ledgerStore.js)

\+  const isPromoterLockinNear = daysToLockin !== null \&\& daysToLockin >= -30 \&\& daysToLockin < 120;

@@ -480,8 +487,10 @@

&#x20;    (isBrokerVerified \&\& bcr3Net > 0 \&\& vol > 0 ? (bcr3Net / 100) \* vol : 0)

&#x20;  );

\-  const publicFloatShares = Math.max(1, publicFloatM \* 1\_000\_000);

\-  const freeFloatCorneredPct = Number(((Math.max(0, rawNetQty5D) / publicFloatShares) \* 100).toFixed(2));

\+  const publicFloatShares = floatKnown \&\& publicFloatM > 0 ? publicFloatM \* 1\_000\_000 : 0;

\+  const freeFloatCorneredPct = publicFloatShares > 0

\+    ? Number(Math.min(100, (Math.max(0, rawNetQty5D) / publicFloatShares) \* 100).toFixed(2))

\+    : 0;

@@ -711,6 +720,7 @@

&#x20;    volume: vol,

&#x20;    turnover,

\+    turnoverLakhs,

&#x20;    sharesOutM,

@@ -838,14 +848,22 @@

&#x20;  // 20-Trade Compound Simulation: Rs. 500,000 starting capital

\-  // Zero out simulation when no crownedWinner qualifies (Capital Preservation / Cash Defense)

&#x20;  const winRate = crownedWinner?.analogWinRate || 0;

\+  const simSizing = crownedWinner

\+    ? computeMasterPositionSizing({

\+        ltp: crownedWinner.ltp,

\+        stopLoss: crownedWinner.stopLoss,

\+        target1Gross: crownedWinner.target1Gross,

\+        portfolioCapital: 500000,

\+        riskTolerancePct: 1.5,

\+        adv20: crownedWinner.adv20

\+      })

\+    : null;

\+  const simWinNet = simSizing ? Math.max(0, Math.round(simSizing.netDetails.netRealizedGain)) : 0;

\+  const simLossNet = (crownedWinner \&\& simSizing \&\& simSizing.allowedShares > 0)

\+    ? Math.max(1, Math.round(Math.abs(calculateNetTradeGain(crownedWinner.ltp, crownedWinner.stopLoss, simSizing.allowedShares).netRealizedGain)))

\+    : 1;

&#x20;  const sim = crownedWinner

&#x20;    ? simulateCompoundExpectancy(

&#x20;        500000,

&#x20;        20,

&#x20;        winRate,

\-        Math.max(1500, Math.round((crownedWinner.target1Gross - crownedWinner.ltp) \* crownedWinner.kellyShares)) \* 5,

\-        Math.max(800, Math.round((crownedWinner.ltp - crownedWinner.stopLoss) \* crownedWinner.kellyShares)) \* 5

\+        simWinNet,

\+        simLossNet

&#x20;      )

&#x20;    : { projectedFinalCapital: 500000, expectedWins: 0, expectedLosses: 0 };

@@ -876,7 +894,7 @@

&#x20;      numTrades: crownedWinner ? 20 : 0,

&#x20;      winRate,

\-      payoffRatio: crownedWinner ? 2.5 : 0,

\+      payoffRatio: crownedWinner ? crownedWinner.netRRR : 0,

&#x20;      expectedWins: crownedWinner ? (sim.expectedWins !== undefined ? sim.expectedWins : Math.round(20 \* (winRate / 100))) : 0,



```



\---



\#### `A1-055` — `src/utils/masterPositionSizing.js`



```diff

\--- a/src/utils/masterPositionSizing.js

+++ b/src/utils/masterPositionSizing.js

@@ -51,26 +51,38 @@

&#x20;  const buyBrokerFee = calculateTieredBrokerCommission(buyValue);

&#x20;  const sellBrokerFee = calculateTieredBrokerCommission(sellValue);

&#x20;  const brokerFeeTotal = buyBrokerFee + sellBrokerFee;

&#x20;

&#x20;  const sebonFeeTotal = (buyValue + sellValue) \* 0.00015;

\-  const dpFee = 25.0; // Flat per sale transfer

\+  const buyDpFee = 25.0;

\+  const sellDpFee = 25.0;

\+  const dpFee = buyDpFee + sellDpFee; // Rs. 25 buy + Rs. 25 sell statutory CDSC DP charge

&#x20;

&#x20;  const totalExpenses = brokerFeeTotal + sebonFeeTotal + dpFee;

\-  const taxableProfit = Math.max(0, grossGain - totalExpenses);

\+  const totalBuyCost = buyValue + buyBrokerFee + (buyValue \* 0.00015) + buyDpFee;

\+  const netSellBeforeTax = sellValue - sellBrokerFee - (sellValue \* 0.00015) - sellDpFee;

\+  const taxableProfit = Math.max(0, netSellBeforeTax - totalBuyCost);

&#x20;  const cgtTax = taxableProfit \* 0.075; // 7.5% Final CGT (Individual Short-Term)

&#x20;

\-  const netRealizedGain = grossGain - totalExpenses - cgtTax;

\-  const netReturnPct = buyValue > 0 ? +((netRealizedGain / buyValue) \* 100).toFixed(2) : 0;

\-  const totalFrictionPct = buyValue > 0 ? +(((totalExpenses + cgtTax) / buyValue) \* 100).toFixed(2) : 0;

\+  const netRealizedGain = netSellBeforeTax - totalBuyCost - cgtTax;

\+  const netReturnPct = totalBuyCost > 0 ? +((netRealizedGain / totalBuyCost) \* 100).toFixed(2) : 0;

\+  const totalFrictionPct = totalBuyCost > 0 ? +(((totalExpenses + cgtTax) / totalBuyCost) \* 100).toFixed(2) : 0;

&#x20;

\-  // Breakeven hurdle price: price needed to cover roundtrip broker + sebon + DP

\-  const statutoryBreakevenPrice = +((buyValue + totalExpenses) / shares).toFixed(1);

\+  // Iteratively solve breakeven exit price at actual exit slab (independent of targetPrice)

\+  let estBe = (totalBuyCost / shares) \* 1.0045;

\+  for (let i = 0; i < 4; i++) {

\+    const grossBe = estBe \* shares;

\+    const beSellComm = calculateTieredBrokerCommission(grossBe);

\+    const beSellSebon = grossBe \* 0.00015;

\+    estBe = (totalBuyCost + beSellComm + beSellSebon + sellDpFee) / shares;

\+  }

\+  const statutoryBreakevenPrice = +(Math.ceil(estBe \* 10) / 10).toFixed(1);

@@ -94,16 +106,33 @@

&#x20;  portfolioCapital = 100000,

&#x20;  riskTolerancePct = 1.5,

&#x20;  adv20 = 15000

&#x20;} = {}) {

\-  const effLtp = Number(ltp) > 0 ? Number(ltp) : 100;

\-  const effStop = Number(stopLoss) > 0 ? Number(stopLoss) : Number((effLtp \* 0.95).toFixed(1));

\-  const effT1 = Number(target1Gross) > 0 ? Number(target1Gross) : Number((effLtp \* 1.08).toFixed(1));

\+  const effLtp = Number(ltp);

\+  const effStop = Number(stopLoss);

\+  const effT1 = Number(target1Gross) > 0 ? Number(target1Gross) : Number((effLtp \* 1.08).toFixed(1));

&#x20;  const safeCapital = Math.max(10000, Number(portfolioCapital) || 100000);

&#x20;  const safeRiskPct = Math.max(0.5, Number(riskTolerancePct) || 1.5);

&#x20;  const maxRiskCapital = safeCapital \* (safeRiskPct / 100);

\-  const riskPerShare = Math.max(1.0, +(effLtp - effStop).toFixed(2));

\+  if (!Number.isFinite(effLtp) || effLtp <= 0 || !Number.isFinite(effStop) || effStop <= 0 || effStop >= effLtp) {

\+    return {

\+      maxRiskCapital,

\+      riskPerShare: 0,

\+      unconstrainedShares: 0,

\+      maxLiquidityShares: 0,

\+      maxAffordableShares: 0,

\+      isLiquidityCapped: false,

\+      isCapitalCapped: false,

\+      isBelowMinLot: true,

\+      allowedShares: 0,

\+      capitalOutlay: 0,

\+      allocationPct: 0,

\+      netDetails: calculateNetTradeGain(0, 0, 0)

\+    };

\+  }

\+  const riskPerShare = Math.max(0.1, +(effLtp - effStop).toFixed(2));

&#x20;  const unconstrainedShares = Math.floor(maxRiskCapital / riskPerShare);

&#x20;  const safeAdv = Math.max(0, Number(adv20) || 0);

&#x20;  const maxLiquidityShares = safeAdv > 0 ? Math.floor(safeAdv \* 0.05) : unconstrainedShares;

\-  const maxAffordableShares = Math.floor(safeCapital / effLtp);

\+  const maxAffordableShares = Math.floor(Math.max(0, safeCapital - 25) / (effLtp \* 1.004));



```



\---



\#### `A1-056` — `src/utils/microstructureEngine.js`



```diff

\--- a/src/utils/microstructureEngine.js

+++ b/src/utils/microstructureEngine.js

@@ -63,21 +63,29 @@

&#x20;  const totalActive = oldestFirst.length;

\+  let trailingStreak = 0;

\+  for (let i = oldestFirst.length - 1; i >= 0; i--) {

\+    const vol = Number(oldestFirst\[i].netVol ?? oldestFirst\[i].netQty ?? 0);

\+    if (isAccum ? vol > 0 : vol < 0) trailingStreak++;

\+    else break;

\+  }

\+

&#x20;  if (isAccum) {

&#x20;    // Find first net-buy date on or after the cumulative trough

&#x20;    const startIdx = oldestFirst.findIndex((d) => {

&#x20;      const vol = Number(d.netVol ?? d.netQty ?? 0);

&#x20;      return String(d.date || '') >= inflectionDateAccum \&\& vol > 0;

&#x20;    });

&#x20;    const startDate = startIdx >= 0 ? oldestFirst\[startIdx].date : oldestFirst\[0].date;

\-    const streakDays = startIdx >= 0 ? oldestFirst.length - startIdx : accumDays;

&#x20;    const consistencyPct = totalActive > 0 ? Number(((accumDays / totalActive) \* 100).toFixed(0)) : 0;

\-    return { startDate, streakDays, activeDaysCount: accumDays, totalActive, consistencyPct };

\+    return { startDate, streakDays: trailingStreak, activeDaysCount: accumDays, totalActive, consistencyPct };

&#x20;  } else {

&#x20;    // Find first net-sell date on or after the cumulative peak

&#x20;    const startIdx = oldestFirst.findIndex((d) => {

&#x20;      const vol = Number(d.netVol ?? d.netQty ?? 0);

&#x20;      return String(d.date || '') >= inflectionDateDump \&\& vol < 0;

&#x20;    });

&#x20;    const startDate = startIdx >= 0 ? oldestFirst\[startIdx].date : oldestFirst\[0].date;

\-    const streakDays = startIdx >= 0 ? oldestFirst.length - startIdx : dumpDays;

&#x20;    const consistencyPct = totalActive > 0 ? Number(((dumpDays / totalActive) \* 100).toFixed(0)) : 0;

\-    return { startDate, streakDays, activeDaysCount: dumpDays, totalActive, consistencyPct };

\+    return { startDate, streakDays: trailingStreak, activeDaysCount: dumpDays, totalActive, consistencyPct };

&#x20;  }

&#x20;}

@@ -101,11 +109,12 @@

&#x20;  // Robust Anchor: if bigBrokerVWAP is absent/zero, anchor to latestClose or marketVWAP so bounds are NEVER 0

&#x20;  const anchorPrice = rawBigBrokerVWAP > 0

&#x20;    ? rawBigBrokerVWAP

\-    : (latestClose > 0 ? latestClose : (marketVWAP > 0 ? marketVWAP : 100));

\+    : (latestClose > 0 ? latestClose : (marketVWAP > 0 ? marketVWAP : 0));

&#x20;

&#x20;  const bigBrokerVWAP = rawBigBrokerVWAP > 0 ? rawBigBrokerVWAP : anchorPrice;

\-  const buyZoneMin = Number((anchorPrice \* 0.985).toFixed(1));

\-  const buyZoneMax = Number((anchorPrice \* 1.035).toFixed(1));

\+  const buyZoneMin = anchorPrice > 0 ? Number((anchorPrice \* 0.985).toFixed(1)) : 0;

\+  const buyZoneMax = anchorPrice > 0 ? Number((anchorPrice \* 1.035).toFixed(1)) : 0;

@@ -137,10 +146,10 @@

&#x20;      const bVol = Math.max(0, Number(b.buyVol || b.buyQty || b.shares || 0));

&#x20;      const sVol = Math.max(0, Number(b.sellVol || b.sellQty || 0));

&#x20;      const bAmt = bVol > 0

\-        ? Number(b.buyAmt ?? b.buyAmount ?? (sVol === 0 \&\& b.amount ? b.amount : 0) ?? (bVol \* Number(b.avgBuyPrice || b.rate || 0)))

\+        ? Number(b.buyAmt ?? b.buyAmount ?? (sVol === 0 \&\& b.amount ? b.amount : null) ?? (bVol \* Number(b.avgBuyPrice || b.rate || 0)))

&#x20;        : 0;

&#x20;      const sAmt = sVol > 0

\-        ? Number(b.sellAmt ?? b.sellAmount ?? (bVol === 0 \&\& b.amount ? b.amount : 0) ?? (sVol \* Number(b.avgSellPrice || b.rate || 0)))

\+        ? Number(b.sellAmt ?? b.sellAmount ?? (bVol === 0 \&\& b.amount ? b.amount : null) ?? (sVol \* Number(b.avgSellPrice || b.rate || 0)))

&#x20;        : 0;

@@ -303,7 +312,7 @@

&#x20;      const dayVol = Number(

&#x20;        df.totalVolume || df.buyVol || df.sellVol || candle.volume || (idx === 0 ? stock.volume : 0) || 0

&#x20;      );

\-      const closePx = Number(df.vwap || candle.close || (idx === 0 ? stock.ltp : 0) || 100);

\+      const closePx = Number(df.vwap || candle.close || (idx === 0 ? stock.ltp : 0) || 0);

&#x20;      const dayTurnover = Number(df.turnover || df.totalTurnover || dayVol \* closePx);

@@ -349,10 +358,10 @@

&#x20;    const sumSell = rawBrokers.reduce((acc, b) => acc + Number(b.sellVol ?? b.sellQty ?? 0), 0);

&#x20;    totalVol = Math.max(sumBuy, sumSell, 0);

&#x20;  }

\-  if (totalVol <= 0 \&\& rawBrokers.length === 0) return \[];

\-  if (totalVol <= 0) totalVol = 100;

\+  if (totalVol <= 0) return \[];

&#x20;

\-  const ltp = Number(stock.ltp || stock.close || 100);

\+  const ltp = Number(stock.ltp || stock.close || 0);

&#x20;  const totalTurnover = Number(

@@ -445,7 +454,8 @@

&#x20;      if (day0 \&\& Array.isArray(day0.brokers)) {

&#x20;        for (const b of day0.brokers) {

&#x20;          const bId = String(b.brokerId || b.broker || '');

&#x20;          if (topBuyerIds.has(bId)) {

\-            t2DumpedOnDay0Qty += Number(b.sellVol || 0);

\+            const netDumpDay0 = Math.max(0, Number(b.sellVol || 0) - Number(b.buyVol || 0));

\+            t2DumpedOnDay0Qty += netDumpDay0;

&#x20;          }

&#x20;        }

&#x20;      }

@@ -457,7 +467,9 @@

&#x20;  }

&#x20;

&#x20;  // 5. Anti-Wash / Cross-Trade Veto \& Stage Classification

\-  const avgGrossRetention = Number(diag3d.retentionPct || 80);

\+  const avgGrossRetention = diag3d.retentionPct !== undefined \&\& diag3d.retentionPct !== null

\+    ? Number(diag3d.retentionPct)

\+    : (topAcc\[0]?.retentionPct !== undefined ? Number(topAcc\[0].retentionPct) : 80);

&#x20;  const isWashTrap = (avgGrossRetention < 35 \&\& rvol3d >= 1.2) || scr3NetPct >= 20 || diag3d.phase === 'BULL\_TRAP';

@@ -540,9 +552,9 @@

&#x20;  // Safe buy zone around 3D Big Broker VWAP (never 0)

\-  const anchor3d = bigBrokerVWAP3d > 0 ? bigBrokerVWAP3d : (ltp > 0 ? ltp : 100);

\-  const buyZoneMin = Number((anchor3d \* 0.975).toFixed(1));

\-  const buyZoneMax = Number((anchor3d \* 1.035).toFixed(1));

\+  const anchor3d = bigBrokerVWAP3d > 0 ? bigBrokerVWAP3d : (ltp > 0 ? ltp : 0);

\+  const buyZoneMin = anchor3d > 0 ? Number((anchor3d \* 0.975).toFixed(1)) : 0;

\+  const buyZoneMax = anchor3d > 0 ? Number((anchor3d \* 1.035).toFixed(1)) : 0;



```



\---



\#### `A1-057` — `src/utils/mockData.js`



```diff

\--- a/src/utils/mockData.js

+++ b/src/utils/mockData.js

@@ -162,6 +162,15 @@

&#x20;

&#x20;export function runStockScanners(stocks = \[], filterKey) {

&#x20;  if (!stocks || stocks.length === 0) return \[];

\+  // Normalize BCR3 to percentage scale (0..100) whether caller supplies 0.35 or 35

\+  const normBcr3Pct = (s) => {

\+    const raw = Number(s?.bcr3 ?? s?.bcr3BuyPct ?? 0);

\+    return raw > 0 \&\& raw <= 1 ? raw \* 100 : raw;

\+  };

\+  // Normalize marketCap to NPR millions whether caller supplies millions or raw NPR

\+  const normMcapM = (s) => {

\+    const raw = Number(s?.marketCap || 0);

\+    return raw > 1e7 ? raw / 1e6 : raw;

\+  };

&#x20;  switch (filterKey) {

@@ -188,20 +197,14 @@

&#x20;    case 'circuit\_up':

&#x20;    case 'circuit\_pos': {

&#x20;      const topCircuits = stocks.filter(s => (s.pChange || 0) >= 13.5).sort((a, b) => (b.pChange || 0) - (a.pChange || 0));

&#x20;      if (topCircuits.length > 0) return topCircuits.slice(0, 25);

\-      const nearCircuits = stocks.filter(s => (s.pChange || 0) >= 7.0).sort((a, b) => (b.pChange || 0) - (a.pChange || 0));

\-      if (nearCircuits.length > 0) return nearCircuits.slice(0, 25);

\-      return stocks.filter(s => (s.pChange || 0) > 0).sort((a, b) => (b.pChange || 0) - (a.pChange || 0)).slice(0, 25);

\+      return stocks.filter(s => (s.pChange || 0) >= 12.0).sort((a, b) => (b.pChange || 0) - (a.pChange || 0)).slice(0, 25);

&#x20;    }

&#x20;

&#x20;    case 'circuit\_down':

&#x20;    case 'circuit\_neg': {

&#x20;      const lowCircuits = stocks.filter(s => (s.pChange || 0) <= -13.5).sort((a, b) => (a.pChange || 0) - (b.pChange || 0));

&#x20;      if (lowCircuits.length > 0) return lowCircuits.slice(0, 25);

\-      const nearDown = stocks.filter(s => (s.pChange || 0) <= -7.0).sort((a, b) => (a.pChange || 0) - (b.pChange || 0));

\-      if (nearDown.length > 0) return nearDown.slice(0, 25);

\-      return stocks.filter(s => (s.pChange || 0) < 0).sort((a, b) => (a.pChange || 0) - (b.pChange || 0)).slice(0, 25);

\+      return stocks.filter(s => (s.pChange || 0) <= -12.0).sort((a, b) => (a.pChange || 0) - (b.pChange || 0)).slice(0, 25);

&#x20;    }

@@ -257,7 +260,7 @@

&#x20;    // ── Drabyashree Smart Money \& Predictive Engine Screeners ──

&#x20;    case 'stealth\_accumulation':

\-      return stocks.filter(s => s.isStealthAccumulation || (s.bcr3 \&\& s.bcr3 >= 0.35)).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);

\+      return stocks.filter(s => s.isStealthAccumulation || normBcr3Pct(s) >= 35).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);

@@ -286,12 +289,12 @@

&#x20;    case 'large\_cap':

\-      return stocks.filter(s => (s.marketCap || 0) >= 15000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);

\+      return stocks.filter(s => normMcapM(s) >= 15000).sort((a,b) => normMcapM(b) - normMcapM(a)).slice(0, 20);

&#x20;    

&#x20;    case 'mid\_cap':

\-      return stocks.filter(s => (s.marketCap || 0) >= 4000 \&\& (s.marketCap || 0) < 15000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);

\+      return stocks.filter(s => normMcapM(s) >= 4000 \&\& normMcapM(s) < 15000).sort((a,b) => normMcapM(b) - normMcapM(a)).slice(0, 20);

&#x20;

&#x20;    case 'small\_cap':

\-      return stocks.filter(s => (s.marketCap || 0) < 4000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);

\+      return stocks.filter(s => normMcapM(s) > 0 \&\& normMcapM(s) < 4000).sort((a,b) => normMcapM(b) - normMcapM(a)).slice(0, 20);

@@ -355,16 +358,16 @@

&#x20;    // ── Smart Money Categories ──

&#x20;    case 'aggressive\_accumulators':

\-      return stocks.filter(s => (s.bcr3 \&\& s.bcr3 >= 0.35) || (s.pChange >= 2.0 \&\& (s.volumeSurgeRatio >= 1.5 || s.turnover > 15000000))).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);

\+      return stocks.filter(s => normBcr3Pct(s) >= 35 || (s.pChange >= 2.0 \&\& (s.volumeSurgeRatio >= 1.5 || s.turnover > 15000000))).sort((a, b) => normBcr3Pct(b) - normBcr3Pct(a)).slice(0, 25);

&#x20;    case 'distribution\_leaders':

&#x20;      return stocks.filter(s => s.pChange <= -1.8 \&\& (s.turnover || 0) > 12000000).sort((a, b) => a.pChange - b.pChange).slice(0, 25);

&#x20;    case 'broker\_dominance':

\-      return stocks.filter(s => (s.bcr3 \&\& s.bcr3 >= 0.30) || (s.volume || 0) > 35000).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);

\+      return stocks.filter(s => normBcr3Pct(s) >= 30 || (s.volume || 0) > 35000).sort((a, b) => normBcr3Pct(b) - normBcr3Pct(a)).slice(0, 25);

&#x20;    case 'aggressive\_holdings':

\-      return stocks.filter(s => s.pChange > 0 \&\& s.pe > 0 \&\& s.pe < 28 \&\& (s.bcr3 || 0) >= 0.25).slice(0, 25);

\+      return stocks.filter(s => s.pChange > 0 \&\& s.pe > 0 \&\& s.pe < 28 \&\& normBcr3Pct(s) >= 25).slice(0, 25);

&#x20;    case 'matching\_trades':

&#x20;      return stocks.filter(s => (s.volume || 0) > 30000 \&\& (s.floatTurnoverPct >= 1.0 || s.volumeSurgeRatio >= 1.3)).slice(0, 25);

&#x20;    case 'slow\_accumulation':

\-      return stocks.filter(s => s.isStealthAccumulation || (s.pChange >= 0.1 \&\& s.pChange <= 1.8 \&\& (s.bcr3 || 0) >= 0.30)).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);

\+      return stocks.filter(s => s.isStealthAccumulation || (s.pChange >= 0.1 \&\& s.pChange <= 1.8 \&\& normBcr3Pct(s) >= 30)).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);

@@ -403,10 +406,11 @@

&#x20;  { no: 19, name: "Nepal Investment \& Securities Pvt." },

\-  { no: 64, name: "Sani Securities Company Ltd." },

\+  { no: 42, name: "Sani Securities Company Ltd." },

\+  { no: 64, name: "Sun Securities Pvt. Ltd." },

&#x20;  { no: 4,  name: "Opal Securities Investment Pvt." },

&#x20;  { no: 32, name: "Premier Securities Company Ltd." },

\-  { no: 47, name: "Nivana Capital Market Pvt. Ltd." },

\+  { no: 47, name: "Neev Securities Pvt. Ltd." },

&#x20;  { no: 10, name: "Pragyan Securities Pvt. Ltd." },

&#x20;  { no: 22, name: "Siprabi Securities Pvt. Ltd." }

&#x20;];

&#x20;

\-export const LOCK\_IN\_DATA = \[

\-  {

\-    id: 1,

\-    symbol: "HATHY",

... (remove hardcoded stale lock-in records with frozen daysLeft \& prices)

\-];

+// Static lock-in snapshot removed to prevent showing expired dates \& frozen prices;

+// use live promoter\_lockin\_registry / scrip\_fundamentals via backend API.

+export const LOCK\_IN\_DATA = \[];



```



\---



\#### `A1-058` — `src/utils/nepseAdapterLayer.js`



```diff

\--- a/src/utils/nepseAdapterLayer.js

+++ b/src/utils/nepseAdapterLayer.js

@@ -16,6 +16,8 @@

&#x20; \*   - Enforces zero mock fallback, zero synthetic simulation generation.

&#x20; \*/

&#x20;

+import { formatNptDateIso } from './nepseCalendar.js';

\+

&#x20;// ── 1. NUMBER / STRING EXTRACTION UTILITIES ──────────────────────────────────

@@ -46,7 +48,7 @@

&#x20;  // Millisecond timestamp or ISO date

&#x20;  const parsed = new Date(str);

&#x20;  if (!isNaN(parsed.getTime())) {

\-    return parsed.toISOString().slice(0, 10);

\+    return formatNptDateIso(parsed);

&#x20;  }

&#x20;  return null;

&#x20;}

@@ -71,24 +73,30 @@

&#x20;  const change = parseCleanNumber(raw.change ?? raw.c ?? raw.pointChange ?? raw.changePrice ?? 0);

\+  let pChange = parseCleanNumber(

\+    raw.pChange ?? raw.percentageChange ?? raw.pc ?? raw.changePercent ?? raw.percentChange

\+  );

&#x20;  

&#x20;  // Previous close calculation

&#x20;  let prevClose = parseCleanNumber(

&#x20;    raw.previousClose ?? raw.prevClose ?? raw.pcClose ?? raw.yesterdayClose

&#x20;  );

&#x20;  if (prevClose === null || prevClose <= 0) {

\-    prevClose = change !== 0 ? +(ltp - change).toFixed(2) : ltp;

\+    if (change !== 0) {

\+      prevClose = +(ltp - change).toFixed(2);

\+    } else if (pChange !== null \&\& (1 + pChange / 100) > 0) {

\+      prevClose = +(ltp / (1 + pChange / 100)).toFixed(2);

\+    } else {

\+      prevClose = ltp;

\+    }

&#x20;  }

&#x20;

&#x20;  // Percentage change

\-  let pChange = parseCleanNumber(

\-    raw.pChange ?? raw.percentageChange ?? raw.pc ?? raw.changePercent ?? raw.percentChange

\-  );

&#x20;  if (pChange === null) {

&#x20;    pChange = prevClose > 0 ? +(((ltp - prevClose) / prevClose) \* 100).toFixed(2) : 0;

&#x20;  }

&#x20;

\-  const open = parseCleanNumber(raw.open ?? raw.op ?? raw.openPrice ?? prevClose);

\-  const high = parseCleanNumber(raw.high ?? raw.h ?? raw.maxPrice ?? raw.highPrice ?? Math.max(open, ltp));

\-  const low = parseCleanNumber(raw.low ?? raw.l ?? raw.minPrice ?? raw.lowPrice ?? Math.min(open, ltp));

\+  const rawOpen = parseCleanNumber(raw.open ?? raw.op ?? raw.openPrice);

\+  const open = rawOpen !== null \&\& rawOpen > 0 ? rawOpen : prevClose;

\+  const rawHigh = parseCleanNumber(raw.high ?? raw.h ?? raw.maxPrice ?? raw.highPrice);

\+  const rawLow = parseCleanNumber(raw.low ?? raw.l ?? raw.minPrice ?? raw.lowPrice);

\+  const high = rawHigh !== null \&\& rawHigh > 0 ? Math.max(rawHigh, open, ltp) : Math.max(open, ltp);

\+  const low = rawLow !== null \&\& rawLow > 0 ? Math.min(rawLow, open, ltp) : Math.min(open, ltp);

@@ -152,7 +160,7 @@

&#x20;      const timestamp = Number(rawData.t\[i]);

&#x20;      const date = !isNaN(timestamp)

\-        ? (timestamp > 1e11 ? new Date(timestamp) : new Date(timestamp \* 1000)).toISOString().slice(0, 10)

\+        ? formatNptDateIso(timestamp > 1e11 ? new Date(timestamp) : new Date(timestamp \* 1000))

&#x20;        : null;

&#x20;      if (!date) continue;

@@ -378,7 +386,7 @@

&#x20;  if (lockInExpiryDate) {

&#x20;    const diffMs = new Date(lockInExpiryDate).getTime() - Date.now();

&#x20;    daysToLockInExpiry = Math.ceil(diffMs / (1000 \* 60 \* 60 \* 24));

\-    isLockInNearExpiry = daysToLockInExpiry >= 0 \&\& daysToLockInExpiry <= 60;

\+    isLockInNearExpiry = daysToLockInExpiry >= -30 \&\& daysToLockInExpiry < 120;

&#x20;  }



```



\---



\#### `A1-059` — `src/utils/nepseCalendar.js`



```diff

\--- a/src/utils/nepseCalendar.js

+++ b/src/utils/nepseCalendar.js

@@ -106,7 +106,7 @@

&#x20;  '2026-05-27': 'Bakra Eid',

&#x20;  '2026-05-29': 'Republic Day (Ganatantra Diwas)',

\-  '2026-08-27': 'Janai Purnima / Raksha Bandhan',

\+  // Note: 2026-08-27 was a verified active NEPSE trading session (floorsheet-full-2026-08-27.json)

&#x20;  '2026-08-28': 'Gai Jatra (Public Holiday)',

@@ -211,6 +211,8 @@

&#x20;export function clearDynamicMarketHalt() {

&#x20;  dynamicHaltMemory = null;

\+  \_tradingDayCache.clear();

\+  \_tradingSessionsBetweenCache.clear();

&#x20;  if (typeof window !== 'undefined' \&\& window.localStorage) {

&#x20;    try {

@@ -228,6 +230,8 @@

&#x20;    return;

&#x20;  }

&#x20;  dynamicHaltMemory = haltInfo;

\+  \_tradingDayCache.clear();

\+  \_tradingSessionsBetweenCache.clear();

&#x20;  if (typeof window !== 'undefined') {

@@ -379,10 +383,13 @@

&#x20;export function addTradingDays(startDate = getAppNow(), days = 2) {

\-  const cur = new Date(startDate);

\+  const refIso = (startDate instanceof Date) ? formatNptDateIso(startDate) : String(startDate).trim().slice(0, 10);

\+  const \[ry, rm, rd] = refIso.split('-').map(Number);

\+  const cur = (!isNaN(ry) \&\& !isNaN(rm) \&\& !isNaN(rd))

\+    ? new Date(Date.UTC(ry, rm - 1, rd, 12, 0, 0))

\+    : new Date(startDate);

&#x20;  let added = 0;

&#x20;  while (added < days) {

\-    cur.setDate(cur.getDate() + 1);

\+    cur.setUTCDate(cur.getUTCDate() + 1);

&#x20;    if (isNepseTradingDay(cur)) {

&#x20;      added++;

&#x20;    }

@@ -470,12 +477,15 @@

&#x20;    if (mins >= 11 \* 60) {

&#x20;      if (!requireCompleted) {

&#x20;        return formatNptDateIso(d);

&#x20;      }

\-      const prevDate = new Date(d);

\-      prevDate.setDate(prevDate.getDate() - 1);

\+      const \[y, m, day] = formatNptDateIso(d).split('-').map(Number);

\+      const prevDate = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));

\+      prevDate.setUTCDate(prevDate.getUTCDate() - 1);

&#x20;      return formatNptDateIso(getLastValidTradingDay(prevDate, false));

&#x20;    }

\-    const prevDate = new Date(d);

\-    prevDate.setDate(prevDate.getDate() - 1);

\+    const \[y, m, day] = formatNptDateIso(d).split('-').map(Number);

\+    const prevDate = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));

\+    prevDate.setUTCDate(prevDate.getUTCDate() - 1);

&#x20;    return formatNptDateIso(getLastValidTradingDay(prevDate, false));

&#x20;  }

@@ -731,7 +741,8 @@

&#x20;      statusLabel: 'Market Open',

&#x20;      message: 'NEPSE Live Session Active • Continuous Trading Active',

\-      lastTradingDay: formatNptDateIso(now),

\+      lastTradingDay: now,

\+      lastTradingDayIso: formatNptDateIso(now),

&#x20;      timeRemaining: 'Closing at 3:00 PM NPT'

&#x20;    };

&#x20;  }



```



\---



\#### `A1-060` — `src/utils/paperTrading.js`



```diff

\--- a/src/utils/paperTrading.js

+++ b/src/utils/paperTrading.js

@@ -3,6 +3,7 @@

&#x20;// PERSISTENT PLAYGROUND (Rs. 10 Lakhs Virtual Capital)

&#x20;

&#x20;import { calculateBuyDetails, calculateSellDetails } from './calculations.js';

+import { calculateT2SettlementDate } from './nepseCalendar.js';

@@ -88,6 +89,8 @@

&#x20;      };

&#x20;    }

&#x20;

\+    const t2Schedule = calculateT2SettlementDate(new Date(orderTimestamp));

\+    const settledAtMs = new Date(`${t2Schedule.settlementDateIso}T11:00:00+05:45`).getTime();

&#x20;    return {

&#x20;      executed: true,

&#x20;      side: 'BUY',

@@ -98,7 +101,7 @@

&#x20;      dpFee: buyMath.dpFee,

&#x20;      totalCashDebited: +buyMath.totalAmount.toFixed(2),

&#x20;      remainingCash: +(availableCash - buyMath.totalAmount).toFixed(2),

&#x20;      waccPerShare: +buyMath.costPerShare.toFixed(2),

\-      settledAtMs: orderTimestamp + (2 \* 24 \* 60 \* 60 \* 1000) // T+2 Settlement Lockup

\+      settledAtMs

&#x20;    };

&#x20;  }

@@ -126,25 +129,41 @@

\-  // Compute Weighted WACC and Holding Period across matched FIFO lots

\+  // Compute FIFO lots with per-lot short-term (7.5%) vs long-term (5.0%) CGT split

&#x20;  let rem = qty;

&#x20;  let weightedCost = 0;

&#x20;  let weightedDays = 0;

\+  let shortTermQty = 0;

\+  let shortTermCost = 0;

\+  let longTermQty = 0;

\+  let longTermCost = 0;

&#x20;  for (const lot of t2ClearedLots) {

&#x20;    if (rem <= 0) break;

&#x20;    const take = Math.min(rem, Number(lot.qty));

&#x20;    rem -= take;

&#x20;    const lotWacc = Number(lot.waccPerShare || lot.wacc || lot.buyPrice || lot.price || price);

&#x20;    const days = Math.max(1, Math.floor((orderTimestamp - (lot.timestamp || orderTimestamp)) / (24 \* 60 \* 60 \* 1000)));

&#x20;    weightedCost += take \* lotWacc;

&#x20;    weightedDays += take \* days;

\+    if (days > 365) {

\+      longTermQty += take;

\+      longTermCost += take \* lotWacc;

\+    } else {

\+      shortTermQty += take;

\+      shortTermCost += take \* lotWacc;

\+    }

&#x20;  }

&#x20;

&#x20;  const avgWacc = weightedCost / qty;

&#x20;  const avgHoldingDays = weightedDays / qty;

\-  const holdingType = avgHoldingDays > 365 ? 'long' : 'short';

\-  const sellMath = calculateSellDetails(qty, price, avgWacc, holdingType);

\+  const baseSellMath = calculateSellDetails(qty, price, avgWacc, 'short');

\+  const totalSellFeeRatio = qty > 0 ? (baseSellMath.commission + baseSellMath.sebonFee + baseSellMath.dpFee) / qty : 0;

\+  const netPerShareBeforeTax = price - totalSellFeeRatio;

\+  const shortGain = shortTermQty > 0 ? Math.max(0, shortTermQty \* netPerShareBeforeTax - shortTermCost) : 0;

\+  const longGain = longTermQty > 0 ? Math.max(0, longTermQty \* netPerShareBeforeTax - longTermCost) : 0;

\+  const totalCgt = +(shortGain \* 0.075 + longGain \* 0.05).toFixed(2);

\+  const netCashCredited = +((qty \* price) - baseSellMath.commission - baseSellMath.sebonFee - baseSellMath.dpFee - totalCgt).toFixed(2);

\+  const netRealizedPnl = +(netCashCredited - weightedCost).toFixed(2);

\+  const effectiveCgtRatePct = (shortGain + longGain) > 0 ? +((totalCgt / (shortGain + longGain)) \* 100).toFixed(1) : (longTermQty > 0 \&\& shortTermQty === 0 ? 5.0 : 7.5);

&#x20;

&#x20;  return {

&#x20;    executed: true,

&#x20;    side: 'SELL',

&#x20;    symbol: sym,

&#x20;    quantity: qty,

&#x20;    fillPrice: price,

&#x20;    waccBasis: +avgWacc.toFixed(2),

&#x20;    holdingDays: Math.round(avgHoldingDays),

\-    commission: sellMath.commission,

\-    sebonFee: sellMath.sebonFee,

\-    dpFee: sellMath.dpFee,

\-    cgt: +sellMath.cgt.toFixed(2),

\-    cgtRatePct: +(sellMath.cgtRate \* 100).toFixed(1),

\-    netCashCredited: +sellMath.netReceivable.toFixed(2),

\-    netRealizedPnl: +sellMath.netProfitLoss.toFixed(2),

\-    remainingCash: +(availableCash + sellMath.netReceivable).toFixed(2)

\+    commission: baseSellMath.commission,

\+    sebonFee: baseSellMath.sebonFee,

\+    dpFee: baseSellMath.dpFee,

\+    cgt: totalCgt,

\+    cgtRatePct: effectiveCgtRatePct,

\+    netCashCredited,

\+    netRealizedPnl,

\+    remainingCash: +(availableCash + netCashCredited).toFixed(2)

&#x20;  };

&#x20;}

@@ -234,7 +253,7 @@

&#x20;    previousClose: previousClose || sellPrice,

&#x20;    availableCash: state.cash,

&#x20;    existingHoldingsLots: \[pos],

\-    enforceT2Settlement: options.enforceT2Settlement ?? false // allow sandbox flexibility if requested

\+    enforceT2Settlement: options.enforceT2Settlement ?? true

&#x20;  });

@@ -276,9 +295,11 @@

&#x20;  const positionsEnriched = s.positions.map(p => {

\+    const qty = Number(p.quantity ?? p.qty ?? 0);

&#x20;    const ltp = currentPrices\[p.symbol] ? Number(currentPrices\[p.symbol]) : p.buyPrice;

\-    const currentVal = p.quantity \* ltp;

\-    const pnl = currentVal - p.totalCost;

\-    const pnlPct = +((pnl / p.totalCost) \* 100).toFixed(2);

\+    const costBasis = Number(p.totalCost || (qty \* Number(p.wacc || p.buyPrice || 0)));

\+    const currentVal = qty \* ltp;

\+    const pnl = currentVal - costBasis;

\+    const pnlPct = costBasis > 0 ? +((pnl / costBasis) \* 100).toFixed(2) : 0;



```



\---



\#### `A1-061` — `src/utils/priceActionEngine.js`



```diff

\--- a/src/utils/priceActionEngine.js

+++ b/src/utils/priceActionEngine.js

@@ -16,6 +16,13 @@

&#x20;

&#x20;import { calculatePivotPoints, calculateFibonacci } from './indicators.js';

&#x20;

+function ensureAscendingCandles(candles) {

\+  if (!Array.isArray(candles) || candles.length <= 1) return Array.isArray(candles) ? candles : \[];

\+  const first = String(candles\[0]?.date || candles\[0]?.time || '');

\+  const last = String(candles\[candles.length - 1]?.date || candles\[candles.length - 1]?.time || '');

\+  if (first \&\& last \&\& first > last) {

\+    return \[...candles].sort((a, b) => String(a?.date || a?.time || '').localeCompare(String(b?.date || b?.time || '')));

\+  }

\+  return candles;

+}

\+

&#x20;// ─────────────────────────────────────────────────────────────────────

@@ -168,9 +175,11 @@

&#x20;export function analyzeCandlestickPattern(candles) {

&#x20;  if (!Array.isArray(candles) || candles.length < 2) return null;

\+  const ordered = ensureAscendingCandles(candles);

&#x20;

\-  const n = candles.length;

\-  const curr = candles\[n - 1];

\-  const prev = candles\[n - 2];

\+  const n = ordered.length;

\+  const curr = ordered\[n - 1];

\+  const prev = ordered\[n - 2];

&#x20;

&#x20;  const cOpen = Number(curr.open);

&#x20;  const cClose = Number(curr.close);

&#x20;  const cHigh = Number(curr.high);

&#x20;  const cLow = Number(curr.low);

\+  if (!Number.isFinite(cClose) || cClose <= 0) return null;

@@ -286,39 +295,43 @@

&#x20;export function analyzeSupportResistance(candles) {

&#x20;  if (!Array.isArray(candles) || candles.length < 10) {

&#x20;    return { support: \[], resistance: \[] };

&#x20;  }

\+  const ordered = ensureAscendingCandles(candles);

&#x20;

\-  const n = candles.length;

\-  const currentPrice = Number(candles\[n - 1].close);

\-  const latestBar = candles\[n - 1];

\+  const n = ordered.length;

\+  const currentPrice = Number(ordered\[n - 1].close);

\+  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {

\+    return { support: \[], resistance: \[] };

\+  }

\+  // Classic pivots for the active session use the PREVIOUS completed session (no lookahead)

\+  const prevCompletedBar = ordered\[n - 2] || ordered\[n - 1];

&#x20;

&#x20;  const rawCandidates = \[];

&#x20;

&#x20;  // 1. Swings

\-  const { swingHighs, swingLows } = identifySwings(candles, 2);

\+  const { swingHighs, swingLows } = identifySwings(ordered, 2);

&#x20;  swingHighs.forEach((sh) => {

&#x20;    rawCandidates.push({ price: sh.price, source: 'swing\_high', recency: n - sh.index });

&#x20;  });

&#x20;  swingLows.forEach((sl) => {

&#x20;    rawCandidates.push({ price: sl.price, source: 'swing\_low', recency: n - sl.index });

&#x20;  });

&#x20;

\-  // 2. 52-Week High and Low

\-  const closes = candles.map((c) => Number(c.close));

\-  const lookback52w = closes.slice(-252);

\-  const high52w = Math.max(...lookback52w);

\-  const low52w = Math.min(...lookback52w);

\+  // 2. 52-Week High and Low (true intraday extremes)

\+  const lookback52w = ordered.slice(-252);

\+  const high52w = Math.max(...lookback52w.map((c) => Number(c.high || c.close || 0)));

\+  const low52w = Math.min(...lookback52w.map((c) => Number(c.low || c.close || Infinity)));

&#x20;  rawCandidates.push({ price: high52w, source: '52w\_high', recency: 0 });

\-  rawCandidates.push({ price: low52w, source: '52w\_low', recency: 0 });

\+  if (Number.isFinite(low52w) \&\& low52w > 0) rawCandidates.push({ price: low52w, source: '52w\_low', recency: 0 });

&#x20;

&#x20;  // 3. 20-Day Range Extremes

\-  const lookback20 = candles.slice(-20);

\+  const lookback20 = ordered.slice(-20);

&#x20;  const high20d = Math.max(...lookback20.map((c) => Number(c.high)));

&#x20;  const low20d = Math.min(...lookback20.map((c) => Number(c.low)));

&#x20;  rawCandidates.push({ price: high20d, source: '20d\_high', recency: 0 });

&#x20;  rawCandidates.push({ price: low20d, source: '20d\_low', recency: 0 });

&#x20;

&#x20;  // 4. Classic Pivot Points

&#x20;  try {

&#x20;    const pivots = calculatePivotPoints(

\-      latestBar.high || currentPrice,

\-      latestBar.low || currentPrice,

\-      currentPrice

\+      prevCompletedBar.high || prevCompletedBar.close || currentPrice,

\+      prevCompletedBar.low || prevCompletedBar.close || currentPrice,

\+      prevCompletedBar.close || currentPrice

&#x20;    );

@@ -579,10 +592,11 @@

&#x20;export function analyzePriceAction(candles, rvol = 1.0, atr = null) {

&#x20;  if (!Array.isArray(candles) || candles.length < 10) {

&#x20;    return {

&#x20;      supported: false,

&#x20;      reason: 'Need at least 10 candles for price action analysis.',

&#x20;    };

&#x20;  }

\+  const ordered = ensureAscendingCandles(candles);

&#x20;

\-  const structure = analyzeMarketStructure(candles);

\-  const candlestick = analyzeCandlestickPattern(candles);

\-  const sr = analyzeSupportResistance(candles);

\-  const breakout = analyzeBreakout(candles, sr, rvol, atr);

\+  const structure = analyzeMarketStructure(ordered);

\+  const candlestick = analyzeCandlestickPattern(ordered);

\+  const sr = analyzeSupportResistance(ordered);

\+  const breakout = analyzeBreakout(ordered, sr, rvol, atr);



```



\---



\#### `A1-062` \& `A1-069` — `src/utils/priceAdjustment.js`



```diff

\--- a/src/utils/priceAdjustment.js

+++ b/src/utils/priceAdjustment.js

@@ -57,9 +57,10 @@

&#x20;export function calculateRightAdjustedPrice(marketPrice, rightRatioOrPct, subscriptionPrice = PAR\_VALUE\_EQUITY) {

&#x20;  const p = Number(marketPrice || 0);

&#x20;  const rawR = Math.max(0, Number(rightRatioOrPct || 0));

\-  // Normalize: if caller passed > 3 (e.g. 25, 50, 100 for 25%, 50%, 100%), convert to decimal ratio

\-  const r = rawR > 3.0 ? rawR / 100 : rawR;

\+  // Treat percentage inputs (> 1.0) as percent; only fractional decimals (0..1) are direct ratios

\+  const r = rawR > 1.0 ? rawR / 100 : rawR;

&#x20;  const sub = Number(subscriptionPrice || PAR\_VALUE\_EQUITY);

&#x20;  if (p <= 0) return 0;

&#x20;  return +(((p + (r \* sub)) / (1 + r)).toFixed(2));

&#x20;}

@@ -78,7 +79,7 @@

&#x20;  const bRatio = Math.max(0, Number(bonusPercent || 0)) / 100;

&#x20;  const rawRight = Math.max(0, Number(rightPercent || 0));

\-  const rRatio = rawRight > 3.0 ? rawRight / 100 : rawRight;

\+  // Parameter is explicitly rightPercent (e.g. 2.5 -> 0.025, 50 -> 0.50, 100 -> 1.00)

\+  const rRatio = rawRight / 100;

&#x20;  const cashPct = Math.max(0, Number(cashDividendPercent || 0));

@@ -122,42 +123,37 @@

&#x20;function parseCorporateAction(action) {

&#x20;  if (!action) return null;

&#x20;

&#x20;  // Determine the ex-date: prefer 'exDate', fallback to 'bookCloseDate', 'bookClosure', 'bookclose\_date' or 'date'

\-  const rawDate = action.exDate || action.bookCloseDate || action.bookClosure || action.bookclose\_date || action.date;

\+  const rawDate = action.exDate || action.bookCloseDate || action.book\_close\_date || action.bookClosure || action.bookclose\_date || action.date;

&#x20;  if (!rawDate) return null;

&#x20;  const date = String(rawDate).slice(0, 10); // YYYY-MM-DD

&#x20;

\-  const type = (action.type || '').toLowerCase();

\+  const bonusPct = Number(action.bonusPercent ?? action.bonusShare ?? action.bonusSharePct ?? action.bonus\_share\_pct ?? 0);

\+  let rightPct = Number(action.rightPercent ?? action.rightShare ?? action.rightSharePct ?? 0);

\+  if (!rightPct \&\& typeof (action.rightShareRatio ?? action.right\_share\_ratio) === 'string') {

\+    const m = String(action.rightShareRatio ?? action.right\_share\_ratio).match(/(\\d+(?:\\.\\d+)?)\\s\*:\\s\*(\\d+(?:\\.\\d+)?)/);

\+    if (m \&\& Number(m\[1]) > 0) rightPct = (Number(m\[2]) / Number(m\[1])) \* 100;

\+  }

\+  const issuePrice = Number(action.issuePrice || action.rightIssuePrice || PAR\_VALUE\_EQUITY);

\+  const cashDivPct = Number(action.cashDividendPct ?? action.cash\_dividend\_pct ?? action.cashDividend ?? action.cashDiv ?? action.dividend ?? 0);

&#x20;

\-  // ── Bonus share ──────────────────────────────────────────────────────────────

\-  if (type === 'bonus' || action.bonusPercent > 0 || action.bonusShare > 0) {

\-    const pct = Number(action.bonusPercent || action.bonusShare || 0);

\-    if (pct <= 0 || pct > 500) return null; // sanity check

\-    const adjustmentFactor = 1 / (1 + pct / 100);

\-    return { date, type: 'bonus', pct, adjustmentFactor,

\-      label: `${pct}% Bonus` };

\-  }

\-

\-  // ── Right share ───────────────────────────────────────────────────────────────

\-  if (type === 'right' || action.rightPercent > 0 || action.rightShare > 0) {

\-    const pct = Number(action.rightPercent || action.rightShare || 0);

\-    const issuePrice = Number(action.issuePrice || action.rightIssuePrice || 100); // par = Rs.100

\-    if (pct <= 0 || pct > 200) return null;

\-    // Theoretical adjustment: proportion of new shares × (issue price / current price)

\-    // We store the raw values and compute the factor at call-time (needs current price context)

\-    return { date, type: 'right', pct, issuePrice, adjustmentFactor: null,

\-      label: `${pct}% Rights @ Rs.${issuePrice}` };

\-  }

\-

\-  // ── Cash dividend ─────────────────────────────────────────────────────────────

\-  if (type === 'cash' || type === 'dividend' || action.cashDividend > 0 || action.dividend > 0) {

\-    const div = Number(action.cashDividend || action.dividend || 0);

\-    if (div <= 0) return null;

\-    // Factor is computed at call-time since we need the cum-dividend price

\-    return { date, type: 'cash', div, adjustmentFactor: null,

\-      label: `Rs.${div} Cash Dividend` };

\-  }

\-

\-  return null;

\+  const safeBonus = bonusPct > 0 \&\& bonusPct <= 500 ? bonusPct : 0;

\+  const safeRight = rightPct > 0 \&\& rightPct <= 500 ? rightPct : 0;

\+  const safeCash = cashDivPct > 0 ? cashDivPct : 0;

\+  if (!safeBonus \&\& !safeRight \&\& !safeCash) return null;

\+

\+  return { date, bonusPct: safeBonus, rightPct: safeRight, issuePrice, cashDivPct: safeCash };

&#x20;}

@@ -188,12 +184,22 @@

&#x20;  // Parse and filter valid actions, sort descending (most recent first)

\-  const actions = corporateActions

\-    .map(a => parseCorporateAction(a))

\-    .filter(Boolean)

\-    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

\+  // Merge simultaneous corporate actions sharing the same ex-date so Bonus + Right + Cash use exact NEPSE formula

\+  const byDate = new Map();

\+  for (const raw of corporateActions) {

\+    const parsed = parseCorporateAction(raw);

\+    if (!parsed) continue;

\+    const prev = byDate.get(parsed.date) || { date: parsed.date, bonusPct: 0, rightPct: 0, issuePrice: PAR\_VALUE\_EQUITY, cashDivPct: 0 };

\+    prev.bonusPct += parsed.bonusPct;

\+    prev.rightPct += parsed.rightPct;

\+    if (parsed.rightPct > 0) prev.issuePrice = parsed.issuePrice;

\+    prev.cashDivPct += parsed.cashDivPct;

\+    byDate.set(parsed.date, prev);

\+  }

\+  const actions = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));

@@ -211,30 +217,15 @@

\-    // For right shares and cash dividends: use the closing price of the candle

\-    // just before ex-date to calculate the adjustment factor dynamically

\-    let actionFactor = action.adjustmentFactor;

\-

\-    if (action.type === 'right' \&\& actionFactor === null) {

\-      // Theoretical ex-right price: P\_ex = (P\_cum + ratio × issue\_price) / (1 + ratio)

\-      // where ratio = rightPercent / 100

\-      const cumClose = result\[firstAdjustedIdx - 1]?.close || 0;

\-      if (cumClose > 0) {

\-        const ratio = action.pct / 100;

\-        const exPrice = (cumClose + ratio \* action.issuePrice) / (1 + ratio);

\-        actionFactor = exPrice / cumClose;

\-      } else {

\-        actionFactor = 1; // cannot compute — skip

\-      }

\-    }

\-

\-    if (action.type === 'cash' \&\& actionFactor === null) {

\-      const cumClose = result\[firstAdjustedIdx - 1]?.close || 0;

\-      if (cumClose > 0 \&\& action.div < cumClose) {

\-        actionFactor = (cumClose - action.div) / cumClose;

\-      } else {

\-        actionFactor = 1;

\-      }

\-    }

\+    // Unified NEPSE ex-date adjustment (enforces > 10% cash-dividend bylaw threshold \& simultaneous Bonus+Right)

\+    const cumClose = result\[firstAdjustedIdx - 1]?.close || 0;

\+    if (cumClose <= 0) continue;

\+    const adj = calculateNepseCorporateActionAdjustment({

\+      marketPrice: cumClose,

\+      bonusPercent: action.bonusPct,

\+      rightPercent: action.rightPct,

\+      cashDividendPercent: action.cashDivPct,

\+      subscriptionPrice: action.issuePrice

\+    });

\+    const actionFactor = adj \&\& cumClose > 0 ? adj.adjustedPrice / cumClose : 1;

\+    if (Math.abs(actionFactor - 1) < 1e-6) continue;

@@ -295,15 +286,18 @@

&#x20;  for (const d of dailyCandles) {

\-    const dt = new Date(d.date);

\-    if (isNaN(dt.getTime())) continue;

\-

\-    // Regime Shift: Before April 6, 2026, trading week started Sunday (day 0).

\-    // From April 6, 2026 onward, trading week starts Monday (day 1).

\-    const dateStr = d.date ? String(d.date).slice(0, 10) : dt.toISOString().slice(0, 10);

\+    const dateStr = d.date ? String(d.date).slice(0, 10) : '';

\+    const \[y, m, dayNum] = dateStr.split('-').map(Number);

\+    const dt = (!isNaN(y) \&\& !isNaN(m) \&\& !isNaN(dayNum))

\+      ? new Date(Date.UTC(y, m - 1, dayNum, 12, 0, 0))

\+      : new Date(d.date);

\+    if (isNaN(dt.getTime())) continue;

\+

\+    // Regime Shift: Before April 6, 2026, trading week started Sunday (day 0).

\+    // From April 6, 2026 onward, trading week starts Monday (day 1).

&#x20;    const isPostShift = dateStr >= '2026-04-06';

&#x20;    const weekStartDt = new Date(dt);

&#x20;    if (isPostShift) {

\-      const day = dt.getDay(); // 0=Sun, 1=Mon ... 6=Sat

\+      const day = dt.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat

&#x20;      const daysToMonday = day === 0 ? 6 : day - 1; // roll back to Monday

\-      weekStartDt.setDate(dt.getDate() - daysToMonday);

\+      weekStartDt.setUTCDate(dt.getUTCDate() - daysToMonday);

&#x20;    } else



```



\---



\#### `A1-064` — `src/utils/nepseRules.js`



```diff

\--- a/src/utils/nepseRules.js

+++ b/src/utils/nepseRules.js

@@ -101,8 +101,10 @@

&#x20;export function clampReturnIntervalToCircuit(lowerPct, upperPct, circuitPct = NEPSE\_RULES.DAILY\_CIRCUIT\_LIMIT\_PCT) {

\-  const rawLower = Number(lowerPct) || -circuitPct;

\-  const rawUpper = Number(upperPct) || circuitPct;

\+  const parsedLower = Number(lowerPct);

\+  const parsedUpper = Number(upperPct);

\+  const rawLower = Number.isFinite(parsedLower) ? parsedLower : -circuitPct;

\+  const rawUpper = Number.isFinite(parsedUpper) ? parsedUpper : circuitPct;

&#x20;  return {

&#x20;    lower: Math.max(-circuitPct, rawLower),

&#x20;    upper: Math.min(circuitPct, rawUpper),

&#x20;    circuitPct

&#x20;  };

&#x20;}

@@ -118,7 +120,9 @@

&#x20;export function checkCircuitStatus(ltp, prevClose, pChange = null) {

&#x20;  const p = Number(ltp) || 0;

&#x20;  const prev = Number(prevClose) || p;

\-  const chg = pChange !== null ? Number(pChange) : (prev > 0 ? ((p - prev) / prev) \* 100 : 0);

\+  const chg = (pChange != null \&\& Number.isFinite(Number(pChange)))

\+    ? Number(pChange)

\+    : (prev > 0 ? ((p - prev) / prev) \* 100 : 0);

&#x20;  const { floor, ceiling } = getCircuitLimits(prev);



```



\---



\#### `A1-065` — `src/utils/nepaliDate.js`



```diff

\--- a/src/utils/nepaliDate.js

+++ b/src/utils/nepaliDate.js

@@ -26,7 +26,20 @@

&#x20;export function adToBS(date) {

\-  const targetDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

\+  const d = date instanceof Date ? date : new Date(date);

\+  if (isNaN(d.getTime())) {

\+    return { year: startBsYear, month: 0, day: 1, monthName: 'Baisakh' };

\+  }

\+  let y, m, dayNum;

\+  try {

\+    const isoNpt = new Intl.DateTimeFormat('en-CA', {

\+      timeZone: 'Asia/Kathmandu',

\+      year: 'numeric', month: '2-digit', day: '2-digit'

\+    }).format(d);

\+    \[y, m, dayNum] = isoNpt.split('-').map(Number);

\+  } catch (\_) {

\+    const npt = new Date(d.getTime() + (5 \* 60 + 45) \* 60000);

\+    \[y, m, dayNum] = \[npt.getUTCFullYear(), npt.getUTCMonth() + 1, npt.getUTCDate()];

\+  }

\+  const targetDate = new Date(Date.UTC(y, m - 1, dayNum));

&#x20;  let daysDiff = Math.floor((targetDate - startAdDate) / (1000 \* 60 \* 60 \* 24));



```



\---



\#### `A1-066` — `src/utils/newsImpactScorer.js`



```diff

\--- a/src/utils/newsImpactScorer.js

+++ b/src/utils/newsImpactScorer.js

@@ -4,6 +4,7 @@

&#x20; \* dividends, corporate actions, and monetary/capital market policies.

&#x20; \*/

&#x20;import { bsToAd } from './bikramSambat.js';

+import { isNepseTradingDay } from './nepseCalendar.js';

@@ -128,7 +129,7 @@

&#x20;  { id: 'MBL', aliases: \['माछापुच्छ्रे', 'mbl'] },

&#x20;  { id: 'NMB', aliases: \['एनएमबि', 'nmb'] },

\-  { id: 'PBL', aliases: \['प्राइम', 'pbl'] },

\+  { id: 'PCBL', aliases: \['प्राइम', 'pcbl'] },

&#x20;  { id: 'NIMB', aliases: \['नेपाल इन्भेष्टमेन्ट', 'nimb'] },

@@ -139,18 +140,18 @@

&#x20;  { id: 'JBBL', aliases: \['ज्योति', 'jbbl', 'jebl'] },

\-  { id: 'KDLBL', aliases: \['कामना', 'kdlbl'] },

\+  { id: 'KSBBL', aliases: \['कामना', 'ksbbl'] },

&#x20;  { id: 'MLBL', aliases: \['महालक्ष्मी', 'mlbl'] },

@@ -147,11 +148,11 @@

&#x20;  { id: 'SHPC', aliases: \['सानिमा माई', 'shpc'] },

\-  { id: 'BPCL', aliases: \['बुध्द', 'bpcl'] },

\+  { id: 'BPCL', aliases: \['बुटवल पावर', 'bpcl'] },

&#x20;  { id: 'HIDCL', aliases: \['एचआइडिसीएल', 'hidcl'] },

&#x20;  // Manufacturing \& Others

&#x20;  { id: 'SHIVM', aliases: \['शिवम्', 'शिवम', 'shivm'] },

\-  { id: 'GCCL', aliases: \['घोडाही', 'gccl'] },

\+  { id: 'GCIL', aliases: \['घोराही', 'gcil'] },

&#x20;  { id: 'SHL', aliases: \['सोल्टी', 'shl'] },

\-  { id: 'CGBL', aliases: \['चन्द्रागिरि', 'cgbl'] },

\+  { id: 'CGH', aliases: \['चन्द्रागिरि', 'cgh'] },

@@ -330,10 +331,12 @@

&#x20;  const rawDate = item.pubDate || item.date || '';

&#x20;  if (!rawDate) return 0;

&#x20;

\+  const normalizedRaw = String(rawDate).trim().replace(/\[०-९]/g, d => '०१२३४५६७८९'.indexOf(d));

\+

&#x20;  // 1. Direct standard JS date parsing (guard against BS year >= 2050 being parsed as future Gregorian)

\-  const bsMatch = String(rawDate).trim().match(/^(\\d{4})\[-/](\\d{1,2})\[-/](\\d{1,2})/);

\+  const bsMatch = normalizedRaw.match(/^(\\d{4})\[-/](\\d{1,2})\[-/](\\d{1,2})/);

&#x20;  if (bsMatch \&\& parseInt(bsMatch\[1], 10) >= 2050) {

@@ -361,7 +364,7 @@

&#x20;  if (str.includes('hour') || str.includes('घण्टा') || str.includes('घन्टा')) {

&#x20;    return now - val \* 3600 \* 1000;

&#x20;  }

\-  if (str.includes('day') || str.includes('दिन') || str.includes('हिजो')) {

\+  if (str.includes('yesterday') || str.includes('day') || str.includes('दिन') || str.includes('हिजो')) {

&#x20;    return now - val \* 86400 \* 1000;

&#x20;  }

@@ -445,8 +448,8 @@

&#x20;    const day = nptDate.getUTCDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat

&#x20;    const mins = nptDate.getUTCHours() \* 60 + nptDate.getUTCMinutes();

&#x20;

\-    // Active trading session: Monday (1) to Friday (5), 11:00 AM (660m) to 3:00 PM (900m)

\-    if (day >= 1 \&\& day <= 5 \&\& mins >= 660 \&\& mins < 900) {

\+    // Active trading session: Non-holiday trading day, 11:00 AM (660m) to 3:00 PM (900m) NPT

\+    if (day >= 1 \&\& day <= 5 \&\& mins >= 660 \&\& mins < 900 \&\& isNepseTradingDay(new Date(t))) {

&#x20;      tradingMinutes += 15;

&#x20;    }

&#x20;  }



```



\---



\#### `A1-067` — `src/utils/nepseEquityFilter.js`



```diff

\--- a/src/utils/nepseEquityFilter.js

+++ b/src/utils/nepseEquityFilter.js

@@ -7,7 +7,7 @@

&#x20;const NON\_EQUITY\_SECTOR\_RE = /(mutual|debenture|bond|promoter|preference)/i;

&#x20;const NON\_EQUITY\_NAME\_RE = /(mutual\\s\*fund|debenture|promoter|promotor|rinpatra|urja\\s\*rinpatra|perpetual|non\[- ]?cumulative|preference\\s\*share|yojana|scheme|investment\\s\*fund|growth\\s\*fund|equity\\s\*fund|balanced\\s\*fund|saving\\s\*fund|closed\[- ]?end|open\[- ]?end|\\bbond\\b)/i;

\-const KNOWN\_NON\_EQUITY\_SYMBOLS\_RE = /^(NIBLPF|NIBSF|NIBLSTF|CMBF|NICGF|NICBF|NICFC|SFMF|SEF|SAEF|SLCF|SBCF|HLICF|KEF|LUK|RMF|RBBMF|PSF|GIMES|MMF|KSY|RSY|CSY|NSY|GSY|SSY|KSLY|SAGF|PRSF|LVF|HLBSF|SIGS)$/i;

+const KNOWN\_NON\_EQUITY\_SYMBOLS\_RE = /^(NIBLPF|NIBSF|NIBLGF|NIBLSTF|CMBF|NICGF|NICBF|NICFC|NICSF|SFMF|SFEF|SEF|SAEF|SLCF|SBCF|HLICF|KEF|KDBY|MBLEF|LUK|RMF|RBBMF|PSF|GIMES|MMF|KSY|RSY|CSY|NSY|GSY|SSY|KSLY|SAGF|PRSF|LVF|HLBSF|SIGS|SCBD|SHINED|SIPD)$/i;

&#x20;const PROTECTED\_ORDINARY\_EQUITIES = new Set(\['CITY', 'HATHY', 'NMBMF', 'SWMF', 'SANIMA', 'SHIVM', 'NADEP']);

@@ -39,6 +39,7 @@

&#x20;  // 3. Known mutual fund / promoter / preference suffixes and slash-series tickers

&#x20;  if (s.includes('/') || /(PO|PR|PNP)$/.test(s) || s.includes('DEB')) return true;

\+  if (s.endsWith('D') \&\& s !== 'NFD' \&\& s !== 'FOWAD') return true;

&#x20;  if (s.endsWith('P') \&\& !PROTECTED\_ORDINARY\_EQUITIES.has(s)) return true;

&#x20;  if (KNOWN\_NON\_EQUITY\_SYMBOLS\_RE.test(s)) return true;

```\[cite: 4]



```



---
Add-AuditClip "acc1-backend.md"
