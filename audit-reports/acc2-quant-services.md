\### 1. Audit Scope \& Files Inspected (Part 1)



\*\*Files Inspected in This Turn (14 files):\*\*



\* \*\*Shared Contract \& Schemas (`00-SHARED-CONTRACT.txt`):\*\*

\* `package.json`





\* `src/App.jsx`





\* `src/constants/marketRules.js`





\* `src/main.jsx`





\* `src/package.json`





\* `src/types/aiGuru.ts`





\* `src/types/floorsheetHub.ts`





\* `src/types/stockTelemetry.ts`





\* `src/db/migrations/002\_upgrade\_signal\_ledger.sql`





\* `migrations/003\_upgrade\_floorsheet\_hub.sql`





\* `migrations/004\_upgrade\_fundamentals\_and\_lockin.sql`





\* `proxy/migrations/001\_prediction\_engine.sql`









\* \*\*Account 2 Part 1 Bundle (`02-ACCOUNT2-STOCK-SERVICES-AI-PART1.txt`):\*\*

\* `src/components/AccumulationDistributionRadar.tsx` (complete)





\* `src/components/AiAnalyst.jsx` (lines 1–\~1480; truncated at Chat Input Deck)











\*\*125+ Services Audit Coverage (Part 1):\*\*



\* \*\*1 of 125+ dedicated services audited\*\* in this part (`AccumulationDistributionRadar.tsx`), alongside the core Guru AI analyst workstation (`AiAnalyst.jsx`) and shared contract layers (`src/App.jsx`, `src/constants/marketRules.js`). `services.tsx` and the remaining dedicated `\*Service.tsx` / stock-tab / PredictorHub components are not included in Part 1 and remain for subsequent parts.







\---



\### 2. Audit Findings Table



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A2-001\*\* | \*\*P0\*\* | `src/components/AiAnalyst.jsx` — `analyzeStock` (\~lines 695–935) | `loadingMsg` omits `analysisType: 'stock'`, so the `nonStock` filter fails to remove Stock A's pending spinner when switching to Stock B, and there is no monotonic request ID / abort check.



&#x20;| Switching tickers mid-flight causes Stock A's full Guru AI Buy/Sell card to render inside Stock B's analysis and prematurely clears the loading state (`setLoading(false)`).



&#x20;| Add `activeStockReqIdRef` monotonic counter, tag `loadingMsg` with `analysisType: 'stock'`, and ignore stale responses / loading clears when `reqId !== activeStockReqIdRef.current`. |

| \*\*A2-002\*\* | \*\*P0\*\* | `src/components/AiAnalyst.jsx` — `synthesizeGuruQuantReport` \& `analyzeStock` (\~lines 52–290, 725–925) | Unlike `synthesizeGuruMarketOutlook`, `synthesizeGuruQuantReport` has no guard when `ltp <= 0` or `candles` is empty; it defaults to `HOLD`/`BUY`/`SELL` with `78%–88%` confidence and `5/10` pillar scores.



&#x20;| When a live quote fails or a stock is halted/delisted, investors receive a high-confidence verdict and broken Rs. 0 targets/stop-losses.



&#x20;| Return a `DATA UNAVAILABLE` report (`confidence: null`, null scores/targets/stop) when `ltp <= 0`, and skip `/api/ai/predict` and LLM overrides. |

| \*\*A2-003\*\* | \*\*P0\*\* | `src/components/AiAnalyst.jsx` — `analyzeStock` (\~lines 875–920) | When merging `/api/ai/predict` or LLM fallback verdicts, only `recommendation.startsWith('VETO')` is protected; `REDUCE / SMART MONEY EXIT`, `REDUCE / AVOID NEW ENTRY`, and `AVOID (WINTER HYDROLOGY)` are silently overwritten.



&#x20;| LLM can overwrite heavy broker-dumping or counter-trend-bounce warnings into a `STRONG BUY` badge while leaving the bearish `actionZoneBadge` on screen.



&#x20;| Protect all hard quantitative vetoes and risk downgrades (`VETO`, `REDUCE`, `AVOID`) from being upgraded by LLM or predict responses. |

| \*\*A2-004\*\* | \*\*P0\*\* | `src/components/AiAnalyst.jsx` — `analyzeStock` `predictPayload` \& `clampToCircuit` (\~lines 820–895) | (1) `predictPayload` reads non-existent `graham.pe` / `graham.pb` (sending `pe: 0, pbv: 0`), omits `roe`, `macd`, `ema20/50/200`, `bbwPct`, `brokerDominanceRatio`, and sends `dominantBrokers` instead of `topBrokers` (violating `StockAnalysisPayload` in `src/types/aiGuru.ts`). (2) Passes raw cumulative ADI (millions of shares) as `stealthAccumulationIndex`. (3) `clampToCircuit` clamps 1M (`target1`) and 3M (`target2`) targets to a single-day `±15%` band (`ltp \* 1.15`) without recomputing `riskRewardRatio`, and ignores `profitTarget`.



&#x20;| Backend predictor evaluates bogus `0` P/E \& P/BV and unscaled ADI; 1M and 3M targets collapse to the same `+15%` price with mismatched R:R ratios.



&#x20;| Compute real `pe`/`pbv`/`roe` \& normalized 0–100 `stealthAccumulationIndex`, align keys to `StockAnalysisPayload`, apply multi-month target bounds (not single-day ±15% cap), support `profitTarget`, and recompute `rrr` after clamping. |

| \*\*A2-005\*\* | \*\*P0\*\* | `src/components/AiAnalyst.jsx` — `synthesizeGuruQuantReport` \& `analyzeStock` (\~lines 55–85, 730–735) | Only checks camelCase keys (`eps`, `bvps`, `npl`, `car`, `promoterUnlockDate`), missing SQLite/API snake\_case columns (`eps\_ttm`, `book\_value\_per\_share`, `npl\_pct`, `car\_pct`, `promoter\_unlock\_date` per `004\_upgrade\_fundamentals\_and\_lockin.sql`). Also `Number("" ?? NaN)` evaluates to `0`, triggering `isLockInVeto` (`0 >= 0 \&\& 0 < 120`).



&#x20;| Silently defaults EPS/BVPS to `0`, bypasses NRB NPL/CAR and lock-in vetoes on snake\_case responses, or triggers false `LOCK-IN EXPIRY IN 0D` vetoes on empty strings.



&#x20;| Support both camelCase and snake\_case fundamental/regulatory fields, and use a strict finite-number helper that treats `""`/`null`/`undefined` as `NaN`. |

| \*\*A2-006\*\* | \*\*P0\*\* | `src/components/AiAnalyst.jsx` — `marketData` mount effect, `getMarketOutlook`, `synthesizeGuruMarketOutlook`, `buildStockPrompt` (\~lines 295–305, 370–380, 641–643, 980–1035) | `fetchMarketSummary()` runs once on mount (`useEffect(..., \[])`) and is never refreshed even though `App.jsx` keeps `AiAnalyst` mounted via `visitedTabs`. `getMarketOutlook` stamps current browser-local time as `"NPT"` onto stale mount-time index data, and `buildStockPrompt` injects `new Date()` instead of the quote/candle's actual as-of date.



&#x20;| Investors and LLM prompts act on hours-old or prior-day NEPSE index/turnover data labeled with a fresh NPT timestamp.



&#x20;| Re-fetch `fetchMarketSummary()` inside `getMarketOutlook()` (and when stale), format NPT timestamps strictly with `timeZone: 'Asia/Kathmandu'`, and pass the actual latest candle/quote date into `buildStockPrompt`. |

| \*\*A2-007\*\* | \*\*P0\*\* | `src/components/AccumulationDistributionRadar.tsx` — `init`, `handleRadarDateChange`, `handleRadarTimeframeChange`, `analyzedStocks` (\~lines 380–660) | (1) `init()` merges `{ ...batchMap, ...prev }`, so stale static `bundledBrokerMap` in `prev` overwrites fresh backend radar data. (2) `handleRadarDateChange(dt)` merges `...prev` (leaking prior-date broker rows onto non-trading stocks) and never reloads `stocks` (LTP/`pChange`/volume) for date `dt`. (3) Lookup falls back from `${sym}\_${radarDays}` to 1D static `stockBrokerDataMap\[sym]`. (4) No request-sequence cancellation guards on async handlers.



&#x20;| Live radar silently displays stale static JSON broker numbers; selecting historical dates mixes today's price changes with historical broker selling (false Bull Traps); 5D/15D/30D views silently mix in 1D data.



&#x20;| Fix merge precedence (`{ ...prev, ...batchMap }`), scope cache keys by `${sym}\_${days}\_${dateKey}` without cross-horizon 1D fallback, reload `loadNepseData(dt)` on date change, and add monotonic request ID guards. |

| \*\*A2-008\*\* | \*\*P0\*\* | `src/components/AccumulationDistributionRadar.tsx` — `activeStock` memo (\~lines 735–820) | When `diagnosticDays !== radarDays` (e.g., user selects `5D`/`15D`/`30D` in Deep Diagnostic), `activeStock` recomputes `brokerData` and `multiDayDiag`, but leaves `wyckoff`, `isTrap`, `isDumping`, `isSellerDominant`, `isAccumulation`, `bcr3Buy`, `bcr3Sell`, `realBrokerAnalysis`, and `corneringAnalysis` stale from `base` (1D).



&#x20;| Deep Diagnostic displays 1D Wyckoff phase, trader guidance, Pump \& Dump Risk Meter, and Retail Offloading flags under a banner claiming "Cumulative Multi-Day Analysis (30D)".



&#x20;| Recompute `wyckoff`, `evaluateUnifiedStep4Flow`, `realBrokerAnalysis`, and `corneringAnalysis` inside `activeStock` using the `diagnosticDays` broker and candle data. |

| \*\*A2-009\*\* | \*\*P0\*\* | `src/constants/marketRules.js` — `calculateRoundTripNetReturn` (\~lines 285–320) | `buyDpFee` (Rs. 25) is added to `totalBuyCost` and reduces `finalNetProfit`, but `totalFrictionNpr` in the returned object omits `buyDpFee` (`buyCommission + buySebonFee + sellCommission + sellSebonFee + dpFee + cgt`).



&#x20;| Violates conservation (`grossProfitNpr - totalFrictionNpr !== netProfitNpr` by Rs. 25) across every backtest, swing calculator, and simulator referencing canonical NEPSE rules.



&#x20;| Include `buyDpFee` in `totalFrictionNpr` and remove the unused `totalFriction` variable. |

| \*\*A2-010\*\* | \*\*P1\*\* | `src/components/AccumulationDistributionRadar.tsx` — `radarDate` init \& Horizon pills (\~lines 387, 466, 975–995) | `radarDate` initializes to `BUNDLED\_BROKER\_DATE` (truthy) and `handleRadarTimeframeChange(d)` never clears it; both the active pill highlight (`radarDays === pill.days \&\& !radarDate`) and `fetchPrecomputedRadar(d)` require `!radarDate`.



&#x20;| Horizon buttons (`1D`/`3D`/`5D`/`15D`/`30D`) never highlight as active on click and bypass the fast precomputed multi-day radar endpoint.



&#x20;| Clear `radarDate` (`setRadarDate('')`) when clicking a multi-day Horizon pill and pass `useFastRadar = true` for latest cumulative mode. |

| \*\*A2-011\*\* | \*\*P1\*\* | `src/components/AccumulationDistributionRadar.tsx` — `floorsheet` state \& `partialStock` (\~lines 376, 460–540, 680–710) | `fetchRealFloorsheet` is imported but never called (`setFloorsheet` is dead), leaving `floorsheet` permanently `\[]`. Additionally, `partialStock` never copies `realBrokerAnalysis`, so `evaluateUnifiedStep4Flow` in Diagnostic view gets `hasRealBrokerAnalysis=false` and `tradeCount=0`.



&#x20;| Live trade counts are always `0` ("Deep Cache"), trade-ticket ratios cannot use raw floorsheet prints, and valid stocks with `200 <= totalBuyVol < 500` are falsely rejected as `insufficient\_sample` in Diagnostic view.



&#x20;| Populate `floorsheet` via `fetchRealFloorsheet(effDate)` in `init` and `handleRadarDateChange`, and attach `realBrokerAnalysis: stockBrokerAnalysis` on `partialStock`. |

| \*\*A2-012\*\* | \*\*P1\*\* | `src/components/AccumulationDistributionRadar.tsx` — Live Status Alert bar \& `loadedTradingDays` (\~lines 392–395, 910–915) | Live Status Alert hardcodes `Top sector: Hydro Power` via `sectorFlowStats.find(s => s.sector.toLowerCase().includes('hydro'))`. `loadedTradingDays` defaults to `45` and is never updated when `fetchAvailableTradingDates()` resolves.



&#x20;| Misleads investors that Hydro Power is always the top accumulating sector (even at 0 stocks) and displays a fabricated "45 authentic sessions" badge if fewer sessions are loaded.



&#x20;| Render `sectorFlowStats\[0]` dynamically in the alert bar, initialize `loadedTradingDays` from actual date count (default `0`), and update it when `datesRes` resolves. |

| \*\*A2-013\*\* | \*\*P1\*\* | `src/components/AccumulationDistributionRadar.tsx` — `StockTableRow`, `StockRadarCard`, Archive cards, `handleRadarTimeframeChange` (\~lines 129–165, 315–345, 480, 1280, 1390) | (1) Missing `pChange` renders `+%`, `NaN` `ltp` renders `Rs. NaN`, and missing `turnover` in Archive renders `Rs. NaN Cr`. (2) `bcr5BuyPct` falls back to `grossBuyConcentrationPct` (BCR3) or `bcr5NetPct` (net) inside the `BCR3 / BCR5 Buy %` column.



&#x20;| Investors see broken `+%` / `Rs. NaN Cr` cells and misread 3-broker or net concentration as 5-broker gross buy concentration.



&#x20;| Guard all price/percent/turnover formatters with `Number.isFinite(...)` (rendering `—` when absent) and stop falling back `bcr5BuyPct` to BCR3 or `bcr5NetPct`. |

| \*\*A2-014\*\* | \*\*P1\*\* | `src/components/AccumulationDistributionRadar.tsx` — `stats`, `handleStockPress`, local `<StockDetailModal>` (\~lines 525–540, 845–885, 1680–1700) | (1) `stats` uses mutually exclusive `if / else if` while `filteredStocks` evaluates predicates independently. (2) `handleStockPress` omits `isHistoricalSession: Boolean(radarDate



&#x20;|  | selectedArchiveDate)`, so `App.jsx`strips`selectedDate`\[cite: 1, 2]. (3) Local ``omits`key={syncedModalStock.symbol}`.



&#x20;|

| \*\*A2-015\*\* | \*\*P1\*\* | `src/components/AiAnalyst.jsx` — `activeTab === 'agent'`, `analyzePortfolio`, `sendChat`, `GuruResponse` (\~lines 615, 647, 945, 1080, 1380) | (1) `activeTab !== 'sandbox'` renders the `<ProGate>`-wrapped chat stream underneath `<NepseAgentDashboard/>` when `activeTab === 'agent'`. (2) `analyzePortfolio` only reads legacy `nepse\_portfolio` once on mount instead of user-scoped `nepse\_portfolio\_profiles` / `nepse\_hub\_\*\_transactions`. (3) `sendChat` passes object `result.data` to `<SafeGuruMarkdown>`, rendering `\[object Object]`. (4) `{parsed.backtestResult \&\& <BacktestTransparencyCard/>}` hides the `<20 sessions` fiduciary "Pending Verification" card.



&#x20;| Broken layout on Agent tab, "No portfolio positions found" for real users, `\[object Object]` chat leaks, and missing IPO backtest disclaimer.



&#x20;| Exclude `'agent'` from the chat-stream branch, read live portfolio holdings from active storage keys on click, safely stringify non-string `result.data`, and render `<BacktestTransparencyCard>` whenever `parsed.symbol` is present. |

| \*\*A2-016\*\* | \*\*P1\*\* | `src/App.jsx` — `synchronizedSelectedStock` (\~lines 703–712) | `{ ...liveMatch, ...baseObj, ltp: liveMatch.ltp |  | baseObj.ltp }`spreads`baseObj`\*after\*`liveMatch`.



&#x20;|

| \*\*A2-017\*\* | \*\*P2\*\* | `src/components/AccumulationDistributionRadar.tsx` — `isPureNepseEquity` \& `analyzedStocks` (\~lines 73–78, 646–655) | `sym.length >= 5 \&\& sym.endsWith('MF')` falsely drops real Microfinance equities like `NMBMF` (listed in `00-SHARED-CONTRACT.txt`), while single-`P` promoter shares (`HIDCLP`, `PCBLP`, `MNBBLP`) slip past `endsWith('PO')`. Also `historyCandles.slice(-radarDays)` computes an `(N-1)`-day return instead of an `N`-day return.



&#x20;| `NMBMF` disappears from the radar, promoter tickers can pollute equity rankings, and 5D returns measure 4 sessions.



&#x20;| Exempt `NMBMF` (or check sector/company name before `MF` suffix) and filter known promoter `P`-suffix tickers; slice `-(radarDays + 1)` when computing `N`-day returns. |

| \*\*A2-018\*\* | \*\*P2\*\* | `src/components/AiAnalyst.jsx` — Virtual Sandbox price lookup (\~lines 1225–1245, 1335–1345) | `currentPrices` keys and `Close Trade` lookup do not normalize `symbol.toUpperCase().trim()` and omit `closePrice` fallback.



&#x20;| Closing a paper position when symbol casing differs or quote uses `closePrice` falls back to `pos.buyPrice` (0% gross P/L).



&#x20;| Normalize keys with `String(s.symbol).toUpperCase().trim()` and include `s.closePrice` in live LTP resolution. |

| \*\*A2-019\*\* | \*\*P3\*\* | `src/components/AiAnalyst.jsx` (\~lines 470, 635) \& `src/constants/marketRules.js` (`getMarketRulesAuditInventory` \~line 346) | `allSymbols` fetched on mount is unused; `TradeExecutionCards` ignores `currentPrice` and `parsed.targetLabels`; `getMarketRulesAuditInventory()` still displays `(4%, 5%, 6%)` despite `CIRCUIT\_LIMITS` using `5% / 8%`.



&#x20;| Redundant network call on Guru AI mount and outdated regulatory label in audit inventory.



&#x20;| Remove unused `allSymbols` state/fetch, render `targetLabels` if present, and update inventory string to `(5%, 8%)`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 \& P1 Bugs Only)



\#### `src/components/AiAnalyst.jsx` (Fixes `A2-001`, `A2-002`, `A2-003`, `A2-004`, `A2-005`, `A2-006`, `A2-015`)



```diff

\--- a/src/components/AiAnalyst.jsx

+++ b/src/components/AiAnalyst.jsx

@@ -49,39 +49,49 @@

&#x20;function synthesizeGuruQuantReport({

&#x20;  symbol, price, technical, financials, candles, adi, wyckoff, graham, atr, targets, zone, rrr, volumeZ, marketData,

&#x20;  circuitMetrics, backtestResult, signalTriggers, brokerAnalysis = null

&#x20;}) {

\+  const parseOptionalNum = (val) => {

\+    if (val === null || val === undefined || val === '') return NaN;

\+    const n = Number(val);

\+    return Number.isFinite(n) ? n : NaN;

\+  };

\+

&#x20;  const rawLtp = Number(price.closePrice || price.lastTradedPrice || price.ltp || 0);

&#x20;  const ltp = Number.isFinite(rawLtp) \&\& rawLtp > 0 ? rawLtp : 0;

&#x20;  const pChg = Number(price.percentageChange || price.pChange || 0);

&#x20;  const vol = Number(price.totalTradedQuantity || price.volume || 0);

&#x20;  const finData = financials?.data || {};

\-  const rawEps = finData.eps ?? price.eps ?? null;

\-  const hasEps = rawEps !== null \&\& rawEps !== undefined \&\& rawEps !== '' \&\& Number.isFinite(Number(rawEps));

\-  const eps = hasEps ? Number(rawEps) : 0;

\-  const rawBvps = finData.bvps ?? finData.bookValuePerShare ?? finData.bookValue ?? price.bvps ?? null;

\-  const hasBvps = rawBvps !== null \&\& rawBvps !== undefined \&\& rawBvps !== '' \&\& Number.isFinite(Number(rawBvps));

\-  const bvps = hasBvps ? Number(rawBvps) : 0;

\-  const pe = Number(finData.pe ?? price.pe ?? (eps > 0 \&\& ltp > 0 ? ltp / eps : 0));

\+  const epsNum = parseOptionalNum(finData.eps ?? finData.eps\_ttm ?? finData.epsTtm ?? price.eps ?? price.eps\_ttm);

\+  const hasEps = Number.isFinite(epsNum);

\+  const eps = hasEps ? epsNum : 0;

\+  const bvpsNum = parseOptionalNum(

\+    finData.bvps ?? finData.bookValuePerShare ?? finData.book\_value\_per\_share ?? finData.bookValue ?? price.bvps ?? price.book\_value\_per\_share

\+  );

\+  const hasBvps = Number.isFinite(bvpsNum);

\+  const bvps = hasBvps ? bvpsNum : 0;

\+  const peRaw = parseOptionalNum(finData.pe ?? finData.pe\_ratio ?? price.pe);

\+  const pe = Number.isFinite(peRaw) \&\& peRaw > 0 ? peRaw : (eps > 0 \&\& ltp > 0 ? ltp / eps : 0);

&#x20;  const rsi = Number(technical?.indicators?.rsi || resolveDynamicStockRSI({ ...price, symbol, ltp, pChange: pChg, candles }));

&#x20;  const sector = String(price.sector || finData.sector || '').toLowerCase();

&#x20;

\+  if (ltp <= 0) {

\+    return {

\+      symbol,

\+      recommendation: 'DATA UNAVAILABLE',

\+      verdict: 'DATA UNAVAILABLE',

\+      actionZone: 'Unavailable',

\+      actionZoneBadge: 'LIVE QUOTE TELEMETRY UNAVAILABLE',

\+      confidence: null,

\+      confidenceScore: null,

\+      riskLevel: 'UNKNOWN',

\+      sentiment: 'UNAVAILABLE',

\+      currentPrice: null,

\+      todayChange: undefined,

\+      scores: { fundamental: null, technical: null, smartMoney: null },

\+      targetPrice: { oneMonth: null, threeMonths: null, sixMonths: null },

\+      stopLoss: null,

\+      entryZone: 'Rs. —',

\+      riskRewardRatio: null,

\+      analysis: `Live price telemetry for ${symbol} is unavailable (LTP = 0 or feed offline). Quantitative targets, stops, and buy/sell verdicts are suppressed until verified exchange data is restored.`,

\+      keyReasons: \['Live quote feed returned no active traded price for this security.'],

\+      risks: \['Never place orders without verified live LTP, market depth, and circuit band confirmation.'],

\+      investmentTips: 'Refresh live feed or verify trading status on NEPSE NOTS before acting.',

\+      nepseSpecific: 'Halted, delisted, or untraded securities have no live price discovery.',

\+      circuitMetrics: null,

\+      backtestResult: null,

\+      signalTriggers: \[]

\+    };

\+  }

\+

&#x20;  // ── Statutory \& Regulatory Hard Veto Checks ──────────────────────────────

\-  const nplPct = Number(finData.npl ?? finData.nplPct ?? price.npl ?? NaN);

\-  const carPct = Number(finData.car ?? finData.carPct ?? price.car ?? NaN);

\-  const costPerMW = Number(finData.costPerMW ?? finData.capexPerMw ?? price.costPerMW ?? NaN);

\+  const nplPct = parseOptionalNum(finData.npl ?? finData.nplPct ?? finData.npl\_pct ?? price.npl ?? price.npl\_pct);

\+  const carPct = parseOptionalNum(finData.car ?? finData.carPct ?? finData.car\_pct ?? price.car ?? price.car\_pct);

\+  const costPerMW = parseOptionalNum(finData.costPerMW ?? finData.capexPerMw ?? finData.capex\_per\_mw ?? price.costPerMW);

&#x20;  const codCompleted = finData.codCompleted ?? price.codCompleted ?? true;

&#x20;

\-  let daysToLockIn = Number(finData.daysToLockInExpiry ?? price.daysToLockInExpiry ?? NaN);

\-  const lockInDateStr = finData.promoterUnlockDate || finData.lockInExpiryDate || price.promoterUnlockDate || price.lockInExpiryDate;

\+  let daysToLockIn = parseOptionalNum(finData.daysToLockInExpiry ?? finData.days\_to\_lockin\_expiry ?? price.daysToLockInExpiry);

\+  const lockInDateStr =

\+    finData.promoterUnlockDate ||

\+    finData.promoter\_unlock\_date ||

\+    finData.lockInExpiryDate ||

\+    price.promoterUnlockDate ||

\+    price.promoter\_unlock\_date ||

\+    price.lockInExpiryDate;

&#x20;  if (Number.isNaN(daysToLockIn) \&\& lockInDateStr) {

&#x20;    const diffMs = new Date(lockInDateStr).getTime() - Date.now();

\-    daysToLockIn = Math.ceil(diffMs / (1000 \* 60 \* 60 \* 24));

\+    if (Number.isFinite(diffMs)) {

\+      daysToLockIn = Math.ceil(diffMs / (1000 \* 60 \* 60 \* 24));

\+    }

&#x20;  }

@@ -294,8 +304,17 @@

&#x20;  const rawTxn = Number(marketData?.data?.totalTransactions);

&#x20;  const txnCount = Number.isFinite(rawTxn) \&\& rawTxn > 0 ? rawTxn : null;

&#x20;

\-  const nowTime = new Date().toLocaleTimeString('en-NP', { hour: '2-digit', minute: '2-digit' });

\-  const nowDate = new Date().toLocaleDateString('en-NP');

\+  const nowObj = new Date();

\+  const nowTime = new Intl.DateTimeFormat('en-US', {

\+    timeZone: 'Asia/Kathmandu',

\+    hour: '2-digit',

\+    minute: '2-digit',

\+    hour12: true

\+  }).format(nowObj);

\+  const nowDate = new Intl.DateTimeFormat('en-CA', {

\+    timeZone: 'Asia/Kathmandu',

\+    year: 'numeric',

\+    month: '2-digit',

\+    day: '2-digit'

\+  }).format(nowObj);

&#x20;

&#x20;  if (nepseVal === null) {

@@ -370,9 +389,11 @@

&#x20;function buildStockPrompt(symbol, stockData, technical, financials, marketData, quantMetrics) {

&#x20;  const price = stockData?.data || {};

&#x20;  const fin = financials?.data || {};

\+  const asOfDate =

\+    price.businessDate || price.date || quantMetrics?.asOfDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());

&#x20;

&#x20;  return `You are GURU AI, an expert quantitative NEPSE (Nepal Stock Exchange) investment analyst.

&#x20;

&#x20;STOCK: ${symbol}

\-DATE: ${new Date().toLocaleDateString('en-NP')}

+DATA AS-OF TRADING DATE (NPT): ${asOfDate}

@@ -613,7 +634,7 @@

&#x20;      )}

&#x20;

&#x20;      {/\* 6. 365-Day Backtest Performance \& Model Transparency \*/}

\-      {parsed.backtestResult \&\& (

\+      {(parsed.backtestResult || parsed.symbol) \&\& (

&#x20;        <BacktestTransparencyCard backtest={parsed.backtestResult} triggers={parsed.signalTriggers} />

&#x20;      )}

@@ -625,6 +646,7 @@

&#x20;  const \[portfolio, setPortfolio] = useState(\[]);

&#x20;  const \[marketData, setMarketData] = useState(null);

\+  const activeStockReqIdRef = useRef(0);

&#x20;  const \[apiKeyMissing, setApiKeyMissing] = useState(false);

@@ -644,10 +666,35 @@

&#x20;    fetchMarketSummary().then(r => {

&#x20;      if (r.success) setMarketData(r);

&#x20;    });

&#x20;

\-    const saved = localStorage.getItem('nepse\_portfolio');

\-    if (saved) {

\-      try { setPortfolio(JSON.parse(saved)); } catch { }

\+    const loadPortfolioHoldings = () => {

\+      try {

\+        const direct = JSON.parse(localStorage.getItem('nepse\_portfolio') || '\[]');

\+        if (Array.isArray(direct) \&\& direct.length > 0) return direct;

\+        const profiles = JSON.parse(localStorage.getItem('nepse\_portfolio\_profiles') || '\[]');

\+        if (Array.isArray(profiles)) {

\+          const flattened = profiles.flatMap(p => Array.isArray(p?.holdings) ? p.holdings : \[]);

\+          if (flattened.length > 0) return flattened;

\+        }

\+        for (let i = 0; i < localStorage.length; i++) {

\+          const k = localStorage.key(i);

\+          if (k \&\& /^nepse\_hub\_.\*\_transactions$/.test(k)) {

\+            const txs = JSON.parse(localStorage.getItem(k) || '\[]');

\+            if (Array.isArray(txs) \&\& txs.length > 0) {

\+              const map = {};

\+              txs.forEach(t => {

\+                const s = String(t.symbol || t.scrip || '').toUpperCase().trim();

\+                const qty = Number(t.quantity || t.units || 0);

\+                const rate = Number(t.price || t.rate || t.wacc || 0);

\+                if (!s || qty <= 0) return;

\+                if (!map\[s]) map\[s] = { symbol: s, quantity: 0, investedValue: 0 };

\+                const isSell = String(t.type || '').toUpperCase().includes('SELL');

\+                map\[s].quantity += isSell ? -qty : qty;

\+                map\[s].investedValue += isSell ? -(qty \* rate) : (qty \* rate);

\+              });

\+              return Object.values(map).filter(h => h.quantity > 0).map(h => ({ ...h, avgPrice: h.investedValue / h.quantity }));

\+            }

\+          }

\+        }

\+      } catch (\_) {}

\+      return \[];

&#x20;    }

\+    setPortfolio(loadPortfolioHoldings());

&#x20;  }, \[]);

@@ -696,6 +743,7 @@

&#x20;  const analyzeStock = async (sym) => {

&#x20;    if (!sym) return;

\+    const reqId = ++activeStockReqIdRef.current;

&#x20;    setLoading(true);

&#x20;

&#x20;    const userMsg = {

@@ -707,6 +755,7 @@

&#x20;    const loadingId = Date.now();

&#x20;    const loadingMsg = {

&#x20;      role: 'assistant',

&#x20;      isLoading: true,

\+      analysisType: 'stock',

&#x20;      id: loadingId,

&#x20;      timestamp: new Date().toLocaleTimeString()

&#x20;    };

@@ -725,11 +774,16 @@

&#x20;        fetchPriceHistory(sym, 365).catch(() => \[]),

&#x20;        fetchBrokerAnalysis(sym, 15).catch(() => null)

&#x20;      ]);

\+      if (activeStockReqIdRef.current !== reqId) return;

&#x20;

&#x20;      const rawCandles = Array.isArray(historyRes) ? historyRes : (historyRes?.data || \[]);

&#x20;      const candles = normalizeCorporateActionPrices(rawCandles);

&#x20;      const price = stockData?.data || {};

&#x20;      const ltp = Number(price.closePrice || price.lastTradedPrice || price.ltp || 0);

\-      const eps = Number(financials?.data?.eps ?? price.eps ?? 0);

\-      const bvps = Number(financials?.data?.bvps ?? financials?.data?.bookValuePerShare ?? financials?.data?.bookValue ?? price.bvps ?? 0);

\+      const finObj = financials?.data || {};

\+      const eps = Number(finObj.eps ?? finObj.eps\_ttm ?? finObj.epsTtm ?? price.eps ?? 0);

\+      const bvps = Number(finObj.bvps ?? finObj.bookValuePerShare ?? finObj.book\_value\_per\_share ?? finObj.bookValue ?? price.bvps ?? 0);

\+      const resolvedPe = Number(finObj.pe ?? finObj.pe\_ratio ?? price.pe ?? (eps > 0 \&\& ltp > 0 ? ltp / eps : 0)) || 0;

\+      const resolvedPbv = Number(finObj.pbv ?? finObj.pb ?? (bvps > 0 \&\& ltp > 0 ? ltp / bvps : 0)) || 0;

\+      const resolvedRoe = Number(finObj.roe ?? finObj.roe\_pct ?? price.roe ?? 0) || 0;

&#x20;      const volume = Number(price.totalTradedQuantity || price.volume || 0);

@@ -816,74 +870,96 @@

&#x20;      // 4. Hit POST /api/ai/predict with live quantitative payload

&#x20;      let finalData = synthesizedReport;

\+      const isHardRiskGuard = /^(VETO|REDUCE|AVOID|DATA UNAVAILABLE)/i.test(String(synthesizedReport.recommendation || ''));

\+

\+      if (ltp > 0) {

&#x20;      try {

\+        const techInd = technical?.data?.indicators || {};

\+        const topBrokerIds = (brokerData.topNetBuyers || brokerData.topBuyers || \[])

\+          .slice(0, 5)

\+          .map(b => Number(b.brokerId || b.broker))

\+          .filter(Number.isFinite);

\+        const normalizedStealthIdx = Math.max(

\+          0,

\+          Math.min(100, Math.round(50 + Math.max(-35, Math.min(35, (Number(brokerData.adRatio || 0) \* 50) + (pChg \* 2)))))

\+        );

&#x20;        const predictPayload = {

&#x20;          symbol: sym,

&#x20;          ltp,

&#x20;          fundamentals: {

\-            pe: Number(graham.pe) || 0,

\-            pbv: Number(graham.pb) || 0,

\+            pe: Number(resolvedPe.toFixed(2)),

\+            pbv: Number(resolvedPbv.toFixed(2)),

&#x20;            eps,

\+            roe: resolvedRoe,

&#x20;            bookValue: bvps,

&#x20;            dividendYield: price.dividendYield || 0,

&#x20;          },

&#x20;          technicals: {

&#x20;            rsi14: dynRsi,

\+            macd: {

\+              line: Number(techInd.macd ?? 0),

\+              signal: Number(techInd.macdSignal ?? 0),

\+              histogram: Number(techInd.macdHist ?? 0),

\+            },

\+            ema20: Number(techInd.ema20 ?? ltp),

\+            ema50: Number(techInd.ema50 ?? ltp),

\+            ema200: Number(techInd.ema200 ?? ltp),

&#x20;            volumeZScore: volumeZ.zScore || 1.1,

\+            bbwPct: Number(techInd.bbwPct ?? 0),

&#x20;            atr,

&#x20;          },

&#x20;          smartMoney: {

\-            dominantBrokers: brokerData.topNetBuyers?.length ? brokerData.topNetBuyers.map(b => b.brokerId || b.broker) : \[],

\+            brokerDominanceRatio: Number(brokerData.bcr3BuyPct ?? brokerData.concentrationPct ?? 0),

\+            topBrokers: topBrokerIds,

\+            dominantBrokers: topBrokerIds,

&#x20;            wyckoffPhase: wyckoff.phase,

\-            stealthAccumulationIndex: adi.currentADI || Math.round(50 + Math.max(-25, Math.min(25, pChg \* 3.5))),

\-            turnover: price.totalTurnover || (volume \* ltp),

\+            stealthAccumulationIndex: normalizedStealthIdx,

\+            turnover: Number(price.totalTurnover || price.totalTradedValue || price.turnover || (volume \* ltp)),

&#x20;            adRatio: brokerData.adRatio ?? 0,

&#x20;            adSignal: brokerData.adSignal ?? 'Neutral',

&#x20;            adStrength: brokerData.adStrength ?? 0

&#x20;          },

&#x20;          apiKey: (typeof localStorage !== 'undefined' ? (localStorage.getItem('nepse\_hub\_glm\_api\_key') || localStorage.getItem('glm\_api\_key')) : '') || glmKey || ''

&#x20;        };

&#x20;

&#x20;        const predictRes = await fetch(`${PROXY}/api/ai/predict`, {

&#x20;          method: 'POST',

&#x20;          headers: { 'Content-Type': 'application/json' },

&#x20;          body: JSON.stringify(predictPayload),

&#x20;          signal: AbortSignal.timeout(20000)

&#x20;        });

\+        if (activeStockReqIdRef.current !== reqId) return;

&#x20;

\-        const clampToCircuit = (val, fallbackVal) => {

\+        const clampSwingLevel = (val, fallbackVal, maxUpsideMult, maxDownsideMult = 0.75) => {

&#x20;          const num = Number(val);

&#x20;          if (!Number.isFinite(num) || num <= 0) return fallbackVal;

\-          const floor15 = Number((ltp \* 0.85).toFixed(2));

\-          const ceil15 = Number((ltp \* 1.15).toFixed(2));

\-          return Math.max(floor15, Math.min(ceil15, num));

\+          return Math.max(Number((ltp \* maxDownsideMult).toFixed(2)), Math.min(Number((ltp \* maxUpsideMult).toFixed(2)), num));

&#x20;        };

&#x20;

&#x20;        if (predictRes.ok) {

&#x20;          const pred = await predictRes.json();

\+          if (activeStockReqIdRef.current !== reqId) return;

&#x20;          if (pred \&\& (pred.verdict || pred.confidenceScore)) {

\-            const safeStop = clampToCircuit(pred.riskReward?.stopLoss, targets.stopLoss.price);

\+            const safeStop = clampSwingLevel(pred.riskReward?.stopLoss, targets.stopLoss.price, 0.99, 0.80);

&#x20;            const verifiedStop = safeStop < ltp ? safeStop : targets.stopLoss.price;

\-            const safeT1 = clampToCircuit(pred.riskReward?.target1, targets.target1.price);

\+            const rawPredT1 = pred.riskReward?.target1 ?? pred.riskReward?.profitTarget;

\+            const safeT1 = clampSwingLevel(rawPredT1, targets.target1.price, 1.35, 1.01);

&#x20;            const verifiedT1 = safeT1 > ltp ? safeT1 : targets.target1.price;

\-            const safeT2 = Math.max(verifiedT1, clampToCircuit(pred.riskReward?.target2, targets.target2.price));

\+            const safeT2 = Math.max(verifiedT1, clampSwingLevel(pred.riskReward?.target2, targets.target2.price, 1.75, 1.02));

\+            const recomputedRrr = calculateRiskRewardRatio(ltp, verifiedT1, verifiedStop).rrr;

&#x20;

&#x20;            finalData = {

&#x20;              ...synthesizedReport,

\-              verdict: synthesizedReport.recommendation.startsWith('VETO')

\+              verdict: isHardRiskGuard

&#x20;                ? synthesizedReport.recommendation

&#x20;                : (pred.verdict || synthesizedReport.recommendation),

\-              recommendation: synthesizedReport.recommendation.startsWith('VETO')

\+              recommendation: isHardRiskGuard

&#x20;                ? synthesizedReport.recommendation

&#x20;                : (pred.verdict || synthesizedReport.recommendation),

&#x20;              confidenceScore: pred.confidenceScore ?? synthesizedReport.confidence,

&#x20;              confidence: pred.confidenceScore ?? synthesizedReport.confidence,

&#x20;              scores: pred.scores || synthesizedReport.scores,

&#x20;              targetPrice: {

&#x20;                oneMonth: verifiedT1,

&#x20;                threeMonths: safeT2,

&#x20;                sixMonths: targets.target3.price

&#x20;              },

&#x20;              stopLoss: verifiedStop,

&#x20;              entryZone: pred.riskReward?.entryTarget ? `Rs. ${pred.riskReward.entryTarget}` : targets.entryZone.label,

\-              riskRewardRatio: pred.riskReward?.rrr || rrr.rrr,

\+              riskRewardRatio: recomputedRrr,

&#x20;              analysis: pred.summaryReasoning || synthesizedReport.analysis,

&#x20;              smartMoneyAccumulation: pred.smartMoneyAccumulation || synthesizedReport.accumulationDistribution,

&#x20;              circuitMetrics,

&#x20;              backtestResult,

&#x20;              signalTriggers,

&#x20;            };

&#x20;          }

&#x20;        }

&#x20;      } catch (predictErr) {

&#x20;        console.warn('\[Guru AI] /api/ai/predict error, trying LLM prompt:', predictErr.message);

&#x20;      }

&#x20;

&#x20;      if (finalData === synthesizedReport) {

&#x20;        try {

\+          const latestCandleDate = dynCandles.length > 0 ? (dynCandles\[dynCandles.length - 1]?.date || dynCandles\[dynCandles.length - 1]?.businessDate) : '';

&#x20;          const prompt = buildStockPrompt(sym, stockData, technical?.data, financials, marketData, {

\-            adi, wyckoff, graham, targets, zone, rrr, report: synthesizedReport

\+            adi, wyckoff, graham, targets, zone, rrr, report: synthesizedReport, asOfDate: latestCandleDate

&#x20;          });

&#x20;          const result = await callGuruAI(prompt, 'stock');

\+          if (activeStockReqIdRef.current !== reqId) return;

&#x20;          if (result \&\& (result.data || typeof result === 'object')) {

&#x20;            const aiData = result.data || result;

&#x20;            if (aiData \&\& typeof aiData === 'object' \&\& !aiData.raw) {

&#x20;              finalData = {

&#x20;                ...synthesizedReport,

&#x20;                ...aiData,

\-                recommendation: synthesizedReport.recommendation.startsWith('VETO')

\+                recommendation: isHardRiskGuard

&#x20;                  ? synthesizedReport.recommendation

&#x20;                  : (aiData.recommendation || synthesizedReport.recommendation),

&#x20;                targetPrice: synthesizedReport.targetPrice,

&#x20;                stopLoss: synthesizedReport.stopLoss,

&#x20;                accumulationDistribution: synthesizedReport.accumulationDistribution,

&#x20;                grahamValuation: synthesizedReport.grahamValuation,

&#x20;                targetLabels: synthesizedReport.targetLabels,

&#x20;                stopLossLabel: synthesizedReport.stopLossLabel,

&#x20;                entryZone: synthesizedReport.entryZone,

&#x20;                riskRewardRatio: synthesizedReport.riskRewardRatio,

&#x20;                actionZoneBadge: synthesizedReport.actionZoneBadge,

&#x20;                circuitMetrics,

&#x20;                backtestResult,

&#x20;                signalTriggers

&#x20;              };

&#x20;            }

&#x20;          }

&#x20;        } catch (llmErr) {

&#x20;          console.warn('\[Guru AI] LLM unreachable, using local quant engine:', llmErr.message);

&#x20;        }

&#x20;      }

\+      }

&#x20;

\+      if (activeStockReqIdRef.current !== reqId) return;

&#x20;      setMessages(prev => prev.map(m =>

&#x20;        m.id === loadingId ? {

&#x20;          role: 'assistant',

&#x20;          guruData: finalData,

&#x20;          analysisType: 'stock',

&#x20;          timestamp: new Date().toLocaleTimeString()

&#x20;        } : m

&#x20;      ));

&#x20;

&#x20;    } catch (err) {

\+      if (activeStockReqIdRef.current !== reqId) return;

&#x20;      setMessages(prev => prev.map(m =>

&#x20;        m.id === loadingId ? {

&#x20;          role: 'assistant',

&#x20;          content: `❌ Analysis failed: ${err.message}`,

&#x20;          analysisType: 'stock',

&#x20;          timestamp: new Date().toLocaleTimeString()

&#x20;        } : m

&#x20;      ));

&#x20;    }

&#x20;

\-    setLoading(false);

\-    scrollToTop();

\+    if (activeStockReqIdRef.current === reqId) {

\+      setLoading(false);

\+      scrollToTop();

\+    }

&#x20;  };

@@ -987,15 +1063,19 @@

&#x20;    let gainers = \[];

&#x20;    let losers = \[];

&#x20;    try {

\-      const \[gainersRes, losersRes] = await Promise.all(\[

\+      const \[freshSummary, gainersRes, losersRes] = await Promise.all(\[

\+        fetchMarketSummary().catch(() => null),

&#x20;        fetch(`${PROXY}/api/market/top-gainers`).then(r => r.json()).catch(() => ({ data: \[] })),

&#x20;        fetch(`${PROXY}/api/market/top-losers`).then(r => r.json()).catch(() => ({ data: \[] }))

&#x20;      ]);

\+      const activeMarketData = freshSummary?.success ? freshSummary : marketData;

\+      if (freshSummary?.success) setMarketData(freshSummary);

&#x20;      gainers = gainersRes?.data || \[];

&#x20;      losers = losersRes?.data || \[];

&#x20;

&#x20;      const prompt = buildMarketPrompt(

\-        marketData,

\+        activeMarketData,

&#x20;        null,

&#x20;        gainers,

&#x20;        losers

&#x20;      );

@@ -1016,7 +1096,7 @@

&#x20;    } catch (err) {

&#x20;      console.warn('\[AiAnalyst] Guru market analysis fallback triggered:', err);

\-      const fallbackReport = synthesizeGuruMarketOutlook(marketData, gainers, losers);

\+      const fallbackReport = synthesizeGuruMarketOutlook(marketData, gainers, losers);

&#x20;      setMessages(prev => prev.map(m =>

&#x20;        m.id === loadingId ? {

&#x20;          role: 'assistant',

@@ -1075,8 +1155,14 @@

&#x20;

&#x20;      const result = await callGuruAI(contextPrompt, 'chat');

&#x20;

\-      const responseText = typeof result === 'string' ? result :

\-        result?.data?.analysis || result?.data || result?.text || JSON.stringify(result);

\+      const rawCandidate = typeof result === 'string'

\+        ? result

\+        : (result?.data?.analysis ?? result?.text ?? result?.data ?? result);

\+      const responseText = typeof rawCandidate === 'string'

\+        ? rawCandidate

\+        : (rawCandidate \&\& typeof rawCandidate === 'object'

\+          ? JSON.stringify(rawCandidate, null, 2)

\+          : String(rawCandidate ?? ''));

@@ -1377,7 +1463,7 @@

&#x20;      )}

&#x20;

&#x20;      {/\* Chat / Stock Messages Stream (when not on sandbox tab) \*/}

\-      {activeTab !== 'sandbox' \&\& (

\+      {activeTab !== 'sandbox' \&\& activeTab !== 'agent' \&\& (

&#x20;        <ProGate



```



\---



\#### `src/components/AccumulationDistributionRadar.tsx` (Fixes `A2-007`, `A2-008`, `A2-010`, `A2-011`, `A2-012`, `A2-013`, `A2-014`)



```diff

\--- a/src/components/AccumulationDistributionRadar.tsx

+++ b/src/components/AccumulationDistributionRadar.tsx

@@ -126,9 +126,13 @@

&#x20;  const badgeStyle = getStageBadgeStyle(stock.wyckoff?.stage);

&#x20;  const isRiskHigh = (stock.wyckoff?.pumpDumpRiskScore || 0) >= 55;

&#x20;  const isRiskExtreme = (stock.wyckoff?.pumpDumpRiskScore || 0) >= 75;

&#x20;  const bcr3Buy = Number(stock.bcr3Buy ?? stock.bcr3BuyPct ?? stock.brokerAnalysis?.bcr3BuyPct ?? stock.realBrokerAnalysis?.bcr3BuyPct ?? stock.brokerData?.bcr3BuyPct ?? 0);

&#x20;  const bcr3Sell = Number(stock.bcr3Sell ?? stock.bcr3SellPct ?? stock.brokerAnalysis?.bcr3SellPct ?? stock.realBrokerAnalysis?.bcr3SellPct ?? stock.brokerData?.bcr3SellPct ?? 0);

\-  const bcr5Buy = Number(stock.bcr5Buy ?? stock.bcr5BuyPct ?? stock.bcr5NetPct ?? stock.brokerAnalysis?.bcr5BuyPct ?? stock.realBrokerAnalysis?.bcr5BuyPct ?? stock.brokerData?.bcr5BuyPct ?? 0);

\+  const bcr5Buy = Number(stock.bcr5Buy ?? stock.bcr5BuyPct ?? stock.brokerAnalysis?.bcr5BuyPct ?? stock.realBrokerAnalysis?.bcr5BuyPct ?? stock.brokerData?.bcr5BuyPct ?? 0);

\+  const hasLtp = Number.isFinite(Number(stock.ltp)) \&\& Number(stock.ltp) > 0;

\+  const hasPChange = stock.pChange !== null \&\& stock.pChange !== undefined \&\& Number.isFinite(Number(stock.pChange));

&#x20;  const isTrap = stock.isTrap;

@@ -156,17 +160,17 @@

&#x20;      </td>

&#x20;      <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">

\-        Rs. {stock.ltp?.toLocaleString()}

\+        {hasLtp ? `Rs. ${Number(stock.ltp).toLocaleString()}` : '—'}

&#x20;      </td>

&#x20;      <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">

&#x20;        <span

&#x20;          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-\[11px] ${

\-            (stock.pChange || 0) >= 0

\+            !hasPChange

\+              ? 'text-slate-400 bg-slate-800'

\+              : Number(stock.pChange) >= 0

&#x20;              ? 'text-emerald-400 bg-emerald-500/10'

&#x20;              : 'text-red-400 bg-red-500/10'

&#x20;          }`}

&#x20;        >

\-          {(stock.pChange || 0) >= 0 ? '+' : ''}

\-          {stock.pChange?.toFixed(2)}%

\+          {hasPChange ? `${Number(stock.pChange) >= 0 ? '+' : ''}${Number(stock.pChange).toFixed(2)}%` : '—'}

&#x20;        </span>

&#x20;      </td>

@@ -315,7 +319,9 @@

&#x20;  const bcr3Buy = Number(stock.bcr3Buy ?? stock.bcr3BuyPct ?? stock.brokerAnalysis?.bcr3BuyPct ?? stock.realBrokerAnalysis?.bcr3BuyPct ?? stock.brokerData?.bcr3BuyPct ?? 0);

&#x20;  const bcr3Sell = Number(stock.bcr3Sell ?? stock.bcr3SellPct ?? stock.brokerAnalysis?.bcr3SellPct ?? stock.realBrokerAnalysis?.bcr3SellPct ?? stock.brokerData?.bcr3SellPct ?? 0);

\-  const bcr5Buy = Number(stock.bcr5Buy ?? stock.bcr5BuyPct ?? stock.bcr5NetPct ?? stock.brokerAnalysis?.bcr5BuyPct ?? stock.realBrokerAnalysis?.bcr5BuyPct ?? stock.brokerData?.bcr5BuyPct ?? 0);

\+  const bcr5Buy = Number(stock.bcr5Buy ?? stock.bcr5BuyPct ?? stock.brokerAnalysis?.bcr5BuyPct ?? stock.realBrokerAnalysis?.bcr5BuyPct ?? stock.brokerData?.bcr5BuyPct ?? 0);

\+  const hasLtp = Number.isFinite(Number(stock.ltp)) \&\& Number(stock.ltp) > 0;

\+  const hasPChange = stock.pChange !== null \&\& stock.pChange !== undefined \&\& Number.isFinite(Number(stock.pChange));

@@ -347,17 +353,17 @@

&#x20;        <div className="text-right">

&#x20;          <div className="font-black text-sm text-white">

\-            Rs. {stock.ltp?.toLocaleString()}

\+            {hasLtp ? `Rs. ${Number(stock.ltp).toLocaleString()}` : '—'}

&#x20;          </div>

&#x20;          <span

&#x20;            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-\[11px] font-bold mt-0.5 ${

\-              (stock.pChange || 0) >= 0

\+              !hasPChange

\+                ? 'text-slate-400 bg-slate-800'

\+                : Number(stock.pChange) >= 0

&#x20;                ? 'text-emerald-400 bg-emerald-500/10'

&#x20;                : 'text-red-400 bg-red-500/10'

&#x20;            }`}

&#x20;          >

\-            {(stock.pChange || 0) >= 0 ? '+' : ''}

\-            {stock.pChange?.toFixed(2)}%

\+            {hasPChange ? `${Number(stock.pChange) >= 0 ? '+' : ''}${Number(stock.pChange).toFixed(2)}%` : '—'}

&#x20;          </span>

&#x20;        </div>

&#x20;      </div>

@@ -382,7 +390,9 @@

&#x20;    const keyed: Record<string, any> = {};

&#x20;    for (const \[k, v] of Object.entries(pre)) {

&#x20;      const u = k.toUpperCase();

\-      keyed\[u] = v;

\-      keyed\[`${u}\_1`] = v;

\+      keyed\[`${u}\_1\_${BUNDLED\_BROKER\_DATE}`] = v;

\+      keyed\[`${u}\_1\_LATEST`] = v;

&#x20;    }

&#x20;    return keyed;

&#x20;  });

\+  const radarReqIdRef = React.useRef(0);

\+  const diagReqIdRef = React.useRef(0);

&#x20;  const \[whaleArchive, setWhaleArchive] = useState<any\[]>(() => getStoredWhaleArchive());

&#x20;  const \[selectedArchiveDate, setSelectedArchiveDate] = useState<string>(incomingDate || '');

&#x20;  const \[modalStock, setModalStock] = useState<any>(null);

&#x20;  const \[sortBy, setSortBy] = useState<'qai' | 'stealth' | 'dumpRisk' | 'pChange' | 'turnover' | 'cmf'>('qai');

&#x20;  const \[brokerLedgerMetric, setBrokerLedgerMetric] = useState<'netFlow' | 'turnover' | 'kitta'>('netFlow');

&#x20;  const \[radarDays, setRadarDays] = useState<number>(1);

\-  const \[radarDate, setRadarDate] = useState<string>(incomingDate || BUNDLED\_BROKER\_DATE);

\+  const \[radarDate, setRadarDate] = useState<string>(incomingDate || '');

@@ -417,7 +427,7 @@

&#x20;  const \[diagnosticDays, setDiagnosticDays] = useState<number>(1);

&#x20;  const \[diagnosticLoading, setDiagnosticLoading] = useState<boolean>(false);

&#x20;  const \[loadedTradingDays, setLoadedTradingDays] = useState<number>(() => {

&#x20;    if (Array.isArray(propAvailableDates) \&\& propAvailableDates.length > 0) return propAvailableDates.length;

\-    return 45;

\+    return 0;

&#x20;  });

@@ -445,10 +455,13 @@

&#x20;  };

&#x20;

&#x20;  const handleRadarTimeframeChange = async (d: number) => {

\+    const reqId = ++radarReqIdRef.current;

&#x20;    setRadarDays(d);

&#x20;    setDiagnosticDays(d);

\+    setRadarDate('');

&#x20;    setIsRecalculatingTimeframe(true);

&#x20;    setLoading(true);

&#x20;    try {

\-      const fastRadar = !radarDate ? await fetchPrecomputedRadar(d).catch(() => null) : null;

\+      const fastRadar = await fetchPrecomputedRadar(d).catch(() => null);

\+      if (radarReqIdRef.current !== reqId) return;

&#x20;      if (fastRadar?.success) {

&#x20;        if (typeof fastRadar.loadedTradingDays === 'number') {

&#x20;          setLoadedTradingDays(fastRadar.loadedTradingDays);

@@ -463,7 +476,7 @@

&#x20;            symbol: symUpper,

&#x20;            bcr3BuyPct: Math.min(100, Math.max(0, Number(st.bcr3BuyPct ?? st.grossBuyConcentrationPct ?? 0))),

&#x20;            bcr3SellPct: Math.min(100, Math.max(0, Number(st.bcr3SellPct ?? st.grossSellConcentrationPct ?? 0))),

\-            bcr5BuyPct: Math.min(100, Math.max(0, Number(st.bcr5BuyPct ?? st.grossBuyConcentrationPct ?? st.bcr5NetPct ?? 0))),

\+            bcr5BuyPct: Math.min(100, Math.max(0, Number(st.bcr5BuyPct ?? 0))),

&#x20;            bcr5NetPct: Math.min(100, Math.max(0, Number(st.bcr5NetPct ?? 0))),

&#x20;            scr3NetPct: Math.min(100, Math.max(0, Number(st.scr3NetPct ?? 0))),

&#x20;            grossBuyConcentrationPct: st.grossBuyConcentrationPct,

@@ -482,66 +495,84 @@

&#x20;            topBuyerBrokers: st.topBuyers || \[],

&#x20;            topSellerBrokers: st.topSellers || \[]

&#x20;          };

\-          brokerMap\[symUpper] = entry;

\-          brokerMap\[`${symUpper}\_${d}`] = entry;

\+          brokerMap\[`${symUpper}\_${d}\_LATEST`] = entry;

&#x20;        }

&#x20;        setStockBrokerDataMap(prev => ({ ...prev, ...brokerMap }));

&#x20;      } else {

\-        const brokerMap = await fetchMarketWideBrokerSummaryMap(d, { date: radarDate || undefined, refresh: true });

\+        const brokerMap = await fetchMarketWideBrokerSummaryMap(d, { refresh: true });

\+        if (radarReqIdRef.current !== reqId) return;

&#x20;        if (brokerMap \&\& typeof brokerMap === 'object' \&\& Object.keys(brokerMap).length > 0) {

&#x20;          const mapWithKeys: Record<string, any> = {};

&#x20;          for (const \[k, v] of Object.entries(brokerMap)) {

&#x20;            const u = String(k).toUpperCase();

\-            mapWithKeys\[u] = v;

\-            mapWithKeys\[`${u}\_${d}`] = v;

\+            mapWithKeys\[`${u}\_${d}\_LATEST`] = v;

&#x20;          }

&#x20;          setStockBrokerDataMap(prev => ({ ...prev, ...mapWithKeys }));

&#x20;        }

&#x20;      }

&#x20;

&#x20;      if (selectedStockSymbol) {

&#x20;        const symU = selectedStockSymbol.toUpperCase();

\-        const diagFast = await fetchPrecomputedDiagnostic(selectedStockSymbol, d, radarDate ? { date: radarDate } : {}).catch(() => null);

\+        const diagFast = await fetchPrecomputedDiagnostic(selectedStockSymbol, d, {}).catch(() => null);

\+        if (radarReqIdRef.current !== reqId) return;

&#x20;        if (diagFast) {

\-          setStockBrokerDataMap(prev => ({ ...prev, \[symU]: diagFast, \[`${symU}\_${d}`]: diagFast }));

\+          setStockBrokerDataMap(prev => ({ ...prev, \[`${symU}\_${d}\_LATEST`]: diagFast }));

&#x20;          if (typeof (diagFast as any).loadedTradingDays === 'number') {

&#x20;            setLoadedTradingDays((diagFast as any).loadedTradingDays);

&#x20;          }

&#x20;          if (typeof (diagFast as any).isBackfilling === 'boolean') {

&#x20;            setIsBackfilling(Boolean((diagFast as any).isBackfilling));

&#x20;          }

&#x20;        } else {

\-          const res = await fetchRealBrokerAnalysis(selectedStockSymbol, d, { date: radarDate || undefined, refresh: true }).catch(() => null);

\+          const res = await fetchRealBrokerAnalysis(selectedStockSymbol, d, { refresh: true }).catch(() => null);

\+          if (radarReqIdRef.current !== reqId) return;

&#x20;          if (res) {

\-            setStockBrokerDataMap(prev => ({ ...prev, \[symU]: res, \[`${symU}\_${d}`]: res }));

\+            setStockBrokerDataMap(prev => ({ ...prev, \[`${symU}\_${d}\_LATEST`]: res }));

&#x20;          }

&#x20;        }

&#x20;      }

&#x20;    } catch (\_) {

&#x20;    } finally {

\-      setIsRecalculatingTimeframe(false);

\-      setLoading(false);

\+      if (radarReqIdRef.current === reqId) {

\+        setIsRecalculatingTimeframe(false);

\+        setLoading(false);

\+      }

&#x20;    }

&#x20;  };

&#x20;

&#x20;  const handleDiagnosticDaysChange = async (d: number) => {

\+    const reqId = ++diagReqIdRef.current;

&#x20;    setDiagnosticDays(d);

&#x20;    if (!selectedStockSymbol) return;

&#x20;    setDiagnosticLoading(true);

&#x20;    const symU = selectedStockSymbol.toUpperCase();

\+    const dateKey = radarDate || 'LATEST';

&#x20;    try {

&#x20;      const diagFast = await fetchPrecomputedDiagnostic(selectedStockSymbol, d, radarDate ? { date: radarDate } : {}).catch(() => null);

\+      if (diagReqIdRef.current !== reqId) return;

&#x20;      if (diagFast) {

\-        setStockBrokerDataMap(prev => ({ ...prev, \[symU]: diagFast, \[`${symU}\_${d}`]: diagFast }));

\+        setStockBrokerDataMap(prev => ({ ...prev, \[`${symU}\_${d}\_${dateKey}`]: diagFast }));

&#x20;        if (typeof (diagFast as any).loadedTradingDays === 'number') {

&#x20;          setLoadedTradingDays((diagFast as any).loadedTradingDays);

&#x20;        }

&#x20;        if (typeof (diagFast as any).isBackfilling === 'boolean') {

&#x20;          setIsBackfilling(Boolean((diagFast as any).isBackfilling));

&#x20;        }

&#x20;      } else {

&#x20;        const res = await fetchRealBrokerAnalysis(selectedStockSymbol, d, { date: radarDate || undefined, refresh: true }).catch(() => null);

\+        if (diagReqIdRef.current !== reqId) return;

&#x20;        if (res) {

\-          setStockBrokerDataMap(prev => ({ ...prev, \[symU]: res, \[`${symU}\_${d}`]: res }));

\+          setStockBrokerDataMap(prev => ({ ...prev, \[`${symU}\_${d}\_${dateKey}`]: res }));

&#x20;        }

&#x20;      }

&#x20;    } catch (\_) {

&#x20;    } finally {

\-      setDiagnosticLoading(false);

\+      if (diagReqIdRef.current === reqId) {

\+        setDiagnosticLoading(false);

\+      }

&#x20;    }

&#x20;  };

&#x20;

\-  // FIX BUG-A2-01: Populate both `sym` and `${sym}\_${radarDays}` keys when switching session dates

&#x20;  const handleRadarDateChange = async (dt: string) => {

\+    const reqId = ++radarReqIdRef.current;

&#x20;    setRadarDate(dt);

&#x20;    setLoading(true);

&#x20;    setIsRecalculatingTimeframe(true);

\+    const dateKey = dt || 'LATEST';

&#x20;    try {

\-      const brokerMap = await fetchMarketWideBrokerSummaryMap(radarDays, { date: dt, refresh: true });

\+      const \[liveRes, brokerMap, fsRes] = await Promise.all(\[

\+        loadNepseData(dt || '').catch(() => null),

\+        fetchMarketWideBrokerSummaryMap(radarDays, { date: dt || undefined, refresh: true }).catch(() => null),

\+        fetchRealFloorsheet(dt || undefined).catch(() => \[])

\+      ]);

\+      if (radarReqIdRef.current !== reqId) return;

\+      if (Array.isArray(liveRes?.stocks) \&\& liveRes.stocks.length > 0) {

\+        setStocks(liveRes.stocks);

\+      }

\+      if (Array.isArray(fsRes)) {

\+        setFloorsheet(fsRes);

\+      }

&#x20;      if (brokerMap \&\& typeof brokerMap === 'object') {

&#x20;        const keyedMap: Record<string, any> = {};

&#x20;        for (const \[k, v] of Object.entries(brokerMap)) {

&#x20;          const symU = String(k).toUpperCase().trim();

\-          keyedMap\[symU] = v;

\-          keyedMap\[`${symU}\_${radarDays}`] = v;

\+          keyedMap\[`${symU}\_${radarDays}\_${dateKey}`] = v;

&#x20;        }

\-        setStockBrokerDataMap(prev => ({ ...prev, ...keyedMap }));

\+        setStockBrokerDataMap(prev => {

\+          const cleaned: Record<string, any> = {};

\+          const suffix = `\_${radarDays}\_${dateKey}`;

\+          for (const \[k, v] of Object.entries(prev)) {

\+            if (!k.endsWith(suffix)) cleaned\[k] = v;

\+          }

\+          return { ...cleaned, ...keyedMap };

\+        });

&#x20;      }

&#x20;      if (selectedStockSymbol) {

&#x20;        const symU = selectedStockSymbol.toUpperCase().trim();

&#x20;        const diagFast = await fetchPrecomputedDiagnostic(symU, radarDays, dt ? { date: dt } : {}).catch(() => null);

&#x20;        const res = diagFast || await fetchRealBrokerAnalysis(symU, radarDays, { date: dt || undefined, refresh: true }).catch(() => null);

\+        if (radarReqIdRef.current !== reqId) return;

&#x20;        if (res) {

&#x20;          setStockBrokerDataMap(prev => ({

&#x20;            ...prev,

\-            \[symU]: res,

\-            \[`${symU}\_${radarDays}`]: res,

\-            \[`${symU}\_${diagnosticDays}`]: res

\+            \[`${symU}\_${radarDays}\_${dateKey}`]: res,

\+            \[`${symU}\_${diagnosticDays}\_${dateKey}`]: res

&#x20;          }));

&#x20;        }

&#x20;      }

&#x20;    } catch (\_) {

&#x20;    } finally {

\-      setIsRecalculatingTimeframe(false);

\-      setLoading(false);

\+      if (radarReqIdRef.current === reqId) {

\+        setIsRecalculatingTimeframe(false);

\+        setLoading(false);

\+      }

&#x20;    }

&#x20;  };

@@ -550,24 +581,28 @@

&#x20;      try {

&#x20;        const effInitialDate = radarDate || incomingDate || '';

\-        const \[liveRes, datesRes, brokerMapRes] = await Promise.allSettled(\[

\+        const dateKey = effInitialDate || 'LATEST';

\+        const \[liveRes, datesRes, brokerMapRes, fsRes] = await Promise.allSettled(\[

&#x20;          loadNepseData(effInitialDate),

&#x20;          fetchAvailableTradingDates(),

\-          fetchMarketWideBrokerSummaryMap(1, { date: effInitialDate })

\+          fetchMarketWideBrokerSummaryMap(1, { date: effInitialDate || undefined }),

\+          fetchRealFloorsheet(effInitialDate || undefined)

&#x20;        ]);

&#x20;        if (!isMounted) return;

\+        if (fsRes.status === 'fulfilled' \&\& Array.isArray(fsRes.value)) {

\+          setFloorsheet(fsRes.value);

\+        }

&#x20;        if (datesRes.status === 'fulfilled' \&\& Array.isArray(datesRes.value) \&\& datesRes.value.length > 0) {

&#x20;          setAvailableSessionDates(datesRes.value);

\-          const freshestDate = datesRes.value\[0];

\-          if (!incomingDate \&\& freshestDate \&\& (!effInitialDate || freshestDate > effInitialDate)) {

\-            handleRadarDateChange(freshestDate);

\-          }

\+          setLoadedTradingDays(datesRes.value.length);

&#x20;        }

&#x20;        if (brokerMapRes.status === 'fulfilled' \&\& brokerMapRes.value \&\& typeof brokerMapRes.value === 'object') {

&#x20;          const map1D: Record<string, any> = {};

&#x20;          for (const \[k, v] of Object.entries(brokerMapRes.value)) {

&#x20;            const u = String(k).toUpperCase();

\-            map1D\[u] = v;

\-            map1D\[`${u}\_1`] = v;

\+            map1D\[`${u}\_1\_${dateKey}`] = v;

&#x20;          }

&#x20;          setStockBrokerDataMap(prev => ({ ...prev, ...map1D }));

&#x20;        }

@@ -586,7 +621,7 @@

&#x20;                    symbol: sSym,

&#x20;                    bcr3BuyPct: Math.min(100, Math.max(0, Number(st.bcr3BuyPct ?? st.grossBuyConcentrationPct ?? 0))),

&#x20;                    bcr3SellPct: Math.min(100, Math.max(0, Number(st.bcr3SellPct ?? st.grossSellConcentrationPct ?? 0))),

\-                    bcr5BuyPct: Math.min(100, Math.max(0, Number(st.bcr5BuyPct ?? st.grossBuyConcentrationPct ?? st.bcr5NetPct ?? 0))),

\+                    bcr5BuyPct: Math.min(100, Math.max(0, Number(st.bcr5BuyPct ?? 0))),

@@ -606,11 +641,10 @@

&#x20;                    topBuyerBrokers: st.topBuyers || \[],

&#x20;                    topSellerBrokers: st.topSellers || \[]

&#x20;                  };

\-                  batchMap\[sSym] = entry;

\-                  batchMap\[`${sSym}\_1`] = entry;

\+                  batchMap\[`${sSym}\_1\_LATEST`] = entry;

&#x20;                }

&#x20;              });

&#x20;              if (Object.keys(batchMap).length > 0) {

\-                setStockBrokerDataMap(prev => ({ ...batchMap, ...prev }));

\+                setStockBrokerDataMap(prev => ({ ...prev, ...batchMap }));

&#x20;              }

&#x20;            }

&#x20;          }

@@ -649,10 +683,12 @@

&#x20;    const resolvedSessionDate = brokerPayloadDate || radarDate || selectedArchiveDate || incomingDate || baseStock?.businessDate || baseStock?.date || '';

\+    const isHistorical = Boolean(radarDate || selectedArchiveDate || incomingDate);

&#x20;    const fullStock = {

&#x20;      ...baseStock,

\+      isHistoricalSession: isHistorical,

&#x20;      businessDate: resolvedSessionDate,

&#x20;      sessionDate: resolvedSessionDate,

&#x20;      date: resolvedSessionDate,

&#x20;    };

@@ -684,12 +720,13 @@

&#x20;    const daysToFetch = activeTab === 'diagnostic' ? diagnosticDays : radarDays;

\+    const dateKey = radarDate || 'LATEST';

\-    fetchRealBrokerAnalysis(sym, daysToFetch, { date: radarDate || BUNDLED\_BROKER\_DATE, refresh: false })

\+    fetchRealBrokerAnalysis(sym, daysToFetch, { date: radarDate || undefined, refresh: false })

&#x20;      .then(res => {

&#x20;        if (active \&\& res \&\& (res.topBuyers?.length > 0 || res.topNetBuyers?.length > 0)) {

&#x20;          setStockBrokerDataMap(prev => ({

&#x20;            ...prev,

\-            \[sym]: res,

\-            \[`${sym}\_${daysToFetch}`]: res

\+            \[`${sym}\_${daysToFetch}\_${dateKey}`]: res

&#x20;          }));

&#x20;        }

&#x20;      })

@@ -780,10 +817,10 @@

\+      const activeDateKey = radarDate || 'LATEST';

&#x20;      const stockBrokerAnalysis =

\-        stockBrokerDataMap\[`${symUpper}\_${radarDays}`] ||

\-        stockBrokerDataMap\[symUpper] ||

\-        getCachedRealBrokerAnalysis(sym, radarDays, { date: radarDate || BUNDLED\_BROKER\_DATE }) ||

\+        stockBrokerDataMap\[`${symUpper}\_${radarDays}\_${activeDateKey}`] ||

\+        getCachedRealBrokerAnalysis(sym, radarDays, { date: radarDate || undefined }) ||

&#x20;        s.realBrokerAnalysis ||

&#x20;        s.brokerAnalysis;

@@ -835,6 +872,7 @@

&#x20;        ...s,

\+        realBrokerAnalysis: stockBrokerAnalysis || null,

&#x20;        intradayPChange,

@@ -942,10 +980,10 @@

&#x20;    const sym = base.symbol;

&#x20;    const symUpper = sym ? sym.toUpperCase().trim() : '';

\+    const activeDateKey = radarDate || 'LATEST';

&#x20;    const diagBrokerAnalysis =

\-      stockBrokerDataMap\[`${symUpper}\_${diagnosticDays}`] ||

\-      stockBrokerDataMap\[symUpper] ||

\-      getCachedRealBrokerAnalysis(sym, diagnosticDays, { date: radarDate || BUNDLED\_BROKER\_DATE });

\+      stockBrokerDataMap\[`${symUpper}\_${diagnosticDays}\_${activeDateKey}`] ||

\+      getCachedRealBrokerAnalysis(sym, diagnosticDays, { date: radarDate || undefined });

@@ -990,6 +1028,15 @@

&#x20;      stockSummaryWithBroker,

&#x20;      diagBrokerAnalysis

&#x20;    );

\+    const wyckoff = classifyWyckoffStage(stockSummaryWithBroker, historyCandles, brokerData);

\+    const step4 = evaluateUnifiedStep4Flow(

\+      brokerData,

\+      intradayPChange,

\+      wyckoff?.stage || '',

\+      Boolean(diagBrokerAnalysis),

\+      stockTrades.length

\+    );

&#x20;

&#x20;    const dailyHistory = buildDailyHistoryFromStockData(

&#x20;      stockSummaryWithBroker,

@@ -1003,12 +1050,21 @@

\-    return {

\+    const nextDiagStock = {

&#x20;      ...base,

\+      realBrokerAnalysis: diagBrokerAnalysis || null,

&#x20;      intradayPChange,

&#x20;      pChange: effectivePChange,

&#x20;      volume: effectiveVolume,

&#x20;      timeframeDays: diagnosticDays,

&#x20;      multiDayDiag,

&#x20;      brokerData,

\+      wyckoff,

\+      isTrap: step4.isTrap,

\+      isDumping: step4.isDumping,

\+      isSellerDominant: step4.isSellerDominant,

\+      isAccumulation: step4.isAccumulation,

\+      bcr3Buy: step4.bcr3Buy,

\+      bcr3Sell: step4.bcr3Sell,

&#x20;      buyZoneMin,

&#x20;      buyZoneMax,

&#x20;      bcr5NetPct: multiDayDiag?.bcr5NetPct ?? brokerData?.bcr5BuyPct ?? base.bcr5NetPct,

@@ -1025,6 +1081,7 @@

&#x20;      entryStatus: multiDayDiag?.entryStatus || base.entryStatus,

&#x20;      entryDescription: multiDayDiag?.entryDescription || base.entryDescription,

&#x20;    };

\+    return { ...nextDiagStock, corneringAnalysis: calculateStockCorneringScore(nextDiagStock) };

&#x20;  }, \[

@@ -1033,6 +1090,8 @@

&#x20;    radarDays,

\+    radarDate,

&#x20;    stockBrokerDataMap,

&#x20;    floorsheetBySymbol,

\+    evaluateUnifiedStep4Flow,

&#x20;  ]);

@@ -1089,18 +1148,14 @@

&#x20;    analyzedStocks.forEach((s) => {

&#x20;      const st = s.wyckoff?.stage || '';

&#x20;      const ph = s.phase || '';

\-      if (ph === 'STEALTH\_ACCUMULATION' || st.includes('STEALTH') || s.isAccumulation) {

\-        stealthCount++;

\-      } else if (ph === 'ACTIVE\_MARKUP' || st.includes('PUMP')) {

\-        pumpCount++;

\-      } else if (ph === 'DISTRIBUTION\_DANGER' || st.includes('DISTRIBUTION') || st.includes('EUPHORIA')) {

\-        distributionCount++;

\-      } else if (ph === 'BULL\_TRAP' || st.includes('DUMP') || s.isTrap || s.isDumping) {

\-        dumpCount++;

\-      } else if (st.includes('SPRING')) {

\-        springCount++;

\-      }

\+      if (ph === 'STEALTH\_ACCUMULATION' || st.includes('STEALTH') || s.isAccumulation) stealthCount++;

\+      if (ph === 'ACTIVE\_MARKUP' || st.includes('PUMP')) pumpCount++;

\+      if (ph === 'DISTRIBUTION\_DANGER' || st.includes('DISTRIBUTION') || st.includes('EUPHORIA')) distributionCount++;

\+      if (ph === 'BULL\_TRAP' || st.includes('DUMP') || s.isTrap || s.isDumping) dumpCount++;

\+      if (st.includes('SPRING')) springCount++;

&#x20;      totalCMF += (s.wyckoff?.cmf || 0);

@@ -1220,7 +1275,11 @@

&#x20;              {stats.step4AccumulationCount > 0 ? (

&#x20;                <span>

&#x20;                  🟢 <strong className="text-emerald-400">{stats.step4AccumulationCount} Institutional Accumulations</strong> (\&gt;40% BCR₃) | 

\-                  Top sector: <span className="text-amber-300">Hydro Power ({sectorFlowStats.find(s=>s.sector.toLowerCase().includes('hydro'))?.accumulatingCount || 0})</span> | 

\+                  Top sector: <span className="text-amber-300">

\+                    {sectorFlowStats\[0]

\+                      ? `${sectorFlowStats\[0].sector} (${sectorFlowStats\[0].accumulatingCount})`

\+                      : 'N/A'}

\+                  </span> | 

&#x20;                  🚨 {stats.step4TrapCount} Distribution Trap alerts flagged

&#x20;                </span>

&#x20;              ) : (

@@ -1618,7 +1677,7 @@

&#x20;                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">

&#x20;                          <div className="text-\[11px] text-slate-400 font-medium">Session Turnover \&amp; Float</div>

&#x20;                          <div className="font-extrabold text-white text-sm mt-0.5">

\-                            Rs. {(stock.turnover / 1e7).toFixed(2)} Cr

\+                            {Number.isFinite(Number(stock.turnover)) ? `Rs. ${(Number(stock.turnover) / 1e7).toFixed(2)} Cr` : '—'}

&#x20;                          </div>

@@ -1742,7 +1801,7 @@

&#x20;                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">

&#x20;                          <div className="text-\[11px] text-slate-400 font-medium">Session Turnover \&amp; Float</div>

&#x20;                          <div className="font-extrabold text-white text-sm mt-0.5">

\-                            Rs. {(stock.turnover / 1e7).toFixed(2)} Cr

\+                            {Number.isFinite(Number(stock.turnover)) ? `Rs. ${(Number(stock.turnover) / 1e7).toFixed(2)} Cr` : '—'}

&#x20;                          </div>

@@ -2115,6 +2174,7 @@

&#x20;        const syncedModalStock = { ...modalStock, ...(latestLive || {}), ...(latestAnalyzed || {}), sessionDate: activeEffDate, date: activeEffDate };

&#x20;        return (

&#x20;          <StockDetailModal

\+            key={syncedModalStock.symbol || 'radar-stock-modal'}

&#x20;            stock={syncedModalStock}



```



\---



\#### `src/constants/marketRules.js` (Fixes `A2-009`)



```diff

\--- a/src/constants/marketRules.js

+++ b/src/constants/marketRules.js

@@ -295,12 +295,12 @@

&#x20;  const cgt = calculateCgt(profitBeforeTax, holdingDays, investorType);

&#x20;  const finalNetProfit = profitBeforeTax - cgt;

&#x20;

&#x20;  const grossProfit = grossSellValue - grossBuyValue;

\-  const totalFriction = totalBuyCost + (grossSellValue - netSellProceedsBeforeTax) + cgt - (grossBuyValue + (grossSellValue - grossSellValue)); // Total fee drag

&#x20;

&#x20;  const grossReturnPct = +((grossProfit / grossBuyValue) \* 100).toFixed(2);

&#x20;  const netReturnPct = +((finalNetProfit / totalBuyCost) \* 100).toFixed(2);

&#x20;  const frictionCostPct = +((grossReturnPct - netReturnPct)).toFixed(2);

\+  const totalFrictionNpr = +(buyCommission + buySebonFee + buyDpFee + sellCommission + sellSebonFee + dpFee + cgt).toFixed(2);

&#x20;

&#x20;  return {

&#x20;    grossBuyValue: +grossBuyValue.toFixed(2),

@@ -309,7 +309,7 @@

&#x20;    netSellProceeds: +(netSellProceedsBeforeTax - cgt).toFixed(2),

&#x20;    grossProfitNpr: +grossProfit.toFixed(2),

&#x20;    netProfitNpr: +finalNetProfit.toFixed(2),

&#x20;    grossReturnPct,

&#x20;    netReturnPct,

\-    totalFrictionNpr: +(buyCommission + buySebonFee + sellCommission + sellSebonFee + dpFee + cgt).toFixed(2),

\+    totalFrictionNpr,

&#x20;    cgtDeductedNpr: cgt,

&#x20;    frictionCostPct

&#x20;  };



```



\---



\#### `src/App.jsx` (Fixes `A2-016`)



```diff

\--- a/src/App.jsx

+++ b/src/App.jsx

@@ -706,7 +706,17 @@

&#x20;    const liveMatch = stocks.find(

&#x20;      s => String(s.symbol || '').toUpperCase().trim() === targetSym

&#x20;    );

\-    return liveMatch ? { ...liveMatch, ...baseObj, name: liveMatch.name || baseObj.name, ltp: liveMatch.ltp || baseObj.ltp } : baseObj;

\+    if (!liveMatch) return baseObj;

\+    if (baseObj.isHistoricalSession) {

\+      return { ...liveMatch, ...baseObj, name: liveMatch.name || baseObj.name };

\+    }

\+    return {

\+      ...baseObj,

\+      ...liveMatch,

\+      name: liveMatch.name || baseObj.name,

\+      initialTab: baseObj.initialTab,

\+      isHistoricalSession: false,

\+      sessionDate: baseObj.sessionDate || liveMatch.sessionDate,

\+    };

&#x20;  }, \[selectedStock, stocks]);



```
### 1. Audit Scope \& Files Inspected (Part 2)



\*\*Files Inspected in This Turn (9 files):\*\*



\* `src/components/LoginScreen.jsx` (complete)





\* `src/components/MultibaggerHunterService.tsx` (complete)





\* `src/components/PaperTradingJournalScreen.tsx` (complete)





\* `src/components/PortfolioBrokerShield.tsx` (complete)





\* `src/components/PredictorHub.jsx` (complete)





\* `src/components/PreferencesSettingsService.tsx` (complete)





\* `src/components/PromoterSharesService.tsx` (complete)





\* `src/components/SeasonalityAnalyticsService.tsx` (complete)





\* `src/components/services.tsx` (header/imports \& `DEFAULT\_COLS` lines 1–79; truncated before component definitions)







\*\*125+ Services Audit Coverage (Part 2):\*\*



\* \*\*6 dedicated services audited in Part 2\*\* (`MultibaggerHunterService.tsx`, `PaperTradingJournalScreen.tsx`, `PortfolioBrokerShield.tsx`, `PreferencesSettingsService.tsx`, `PromoterSharesService.tsx`, `SeasonalityAnalyticsService.tsx`), alongside `PredictorHub.jsx`, `LoginScreen.jsx`, and the header slice of `services.tsx`.





\* \*\*Cumulative total audited across Parts 1–2: 7 of 125+ services\*\* (1 in Part 1 + 6 in Part 2).







\---



\### 2. Audit Findings Table (Continuing from `A2-020`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A2-020\*\* | \*\*P0\*\* | `src/components/PredictorHub.jsx` — `primePlan` auto-analysis \& `hubMarketDepth` (\~lines 500–595, 650–760) | (1) When `generateEntryExitPlan()` completes with `isActionableBuySignal(result) === false` (rejected setup), `setPrimePlan(planWithSymbol)` is still called and the green \*\*"Daily Prime Setup / Breakout Stock in Buy Zone"\*\* card remains rendered with Buy Zone and Target 1/2. (2) `hubMarketDepth` is not reset when `primeDailyPick?.symbol` changes, leaking Stock A's Bids/Asks/OBIR onto Stock B while Stock B's depth fetch is in flight.



&#x20;| Investors receive a green "Daily Prime Setup" buy card for a stock that failed the 500-session backtest check, and see another ticker's live order-book imbalance (`OBIR`).



&#x20;| Reject/suppress the Prime Pick card (render Capital Preservation state) when `primePlan` fails `isActionableBuySignal`, and clear `hubMarketDepth` to `null` immediately on symbol change. |

| \*\*A2-021\*\* | \*\*P0\*\* | `src/components/PredictorHub.jsx` — `fetchPredictionData` Index fallback (\~lines 295–385, 725–755) | (1) Defaults missing live NEPSE index to `2650` and emits a 55%–95% confidence forecast. (2) When `dir === 'consolidate'`, sets `rawT1`/`rawT2` \*below\* index and `rawStop` \*above\* index, yet UI colors T1/T2 green (`var(--bull)`) and labels `stopFloor` (above price) as "Stop Floor". (3) Does not cap `dir` when `hard\_ceiling\_applied === true` (<50 EMA), showing green `BULLISH EXPANSION` alongside a bearish Hard Trend Ceiling warning. (4) Hardcodes `sentiment: 0.30` and `turnover\_ratio\_vs\_20d\_avg: 1.05`, and routes `dir === 'down'` into the consolidation explanation.



&#x20;| Fabricated forecasts when offline, inverted bullish/bearish index targets and stop floor during consolidation, and contradictory Bullish vs. Hard Ceiling signals.



&#x20;| Suppress index prediction when live index is absent; compute symmetric consolidation support/resistance bounds; cap `dir` to `'consolidate'` when `hard\_ceiling\_applied`; derive sentiment from `sentimentNews` and fix `dir === 'down'` explanation. |

| \*\*A2-022\*\* | \*\*P0\*\* | `src/components/PredictorHub.jsx` — `fallbackStockScoring` (\~lines 176–285) | (1) Omits `isPureNepseEquity` filter, scoring mutual funds, debentures, and promoter shares. (2) Defaults `volume === 0` to `1000` (bypassing `vol >= 200` liquidity guard) and missing `ltp` to `Rs. 100`. (3) Fabricates `volumeSurgeRatio = 1.55` for any `vol > 15000`. (4) Passes `s.brokerAnalysis` instead of `brokerInfo` (cached broker data) into `evaluateOrderFlowVeto`, letting broker dumping slip past the veto. (5) Uses unsanitized `s.ltp` in `upperWickRatio` (producing `NaN`).



&#x20;| Untraded/illiquid stocks, mutual funds, and broker-dumped stocks receive `BUY` rankings with fabricated `1.55x` volume surges and Rs. 100 prices.



&#x20;| Filter with `isPureNepseEquity` and `ltp > 0`, preserve `vol = 0` (cap illiquid stocks to `AVOID`), default missing `volumeSurgeRatio` to `1.0`, pass `brokerInfo` to `evaluateOrderFlowVeto`, and use sanitized `ltp`. |

| \*\*A2-023\*\* | \*\*P0\*\* | `src/components/PredictorHub.jsx` — `fetchPredictionData` effect \& Strategy Calibration (\~lines 287–445, 835–880) | `fetchPredictionData` depends on `\[stocks, indices, fallbackStockScoring]`, which change every 1.5s–2.5s via `App.jsx` polling—firing 5 unguarded HTTP requests every 1.5s with no sequence cancellation guard. Moreover, when `/api/predict/stocks` returns 200 OK, `activeStrategyPreset` is ignored (never sent to backend or applied to `scoredStocks`), rendering the Strategy Calibration buttons dead.



&#x20;| Out-of-order stale prediction payloads overwrite fresher state, proxy gets hammered every 1.5s, and selecting Conservative/Aggressive/Flow strategy presets does nothing when online.



&#x20;| Hold `stocks`/`indices` in refs, add a monotonic `fetchSeqRef` guard, fetch on mount/manual sync/preset change/initial stock hydration, and pass `?preset=${activeStrategyPreset}` plus apply preset thresholds/weights on enriched scores. |

| \*\*A2-024\*\* | \*\*P0\*\* | `src/components/PaperTradingJournalScreen.tsx` — `loadData`, `handleToggleBot`, `handleRunBotStep`, Open Positions table (\~lines 107, 136–163, 455–465) | (1) `setCapital(stateRes.data.capital |  | 1000000)`replaces Rs.`0`virtual cash (100% deployed) with Rs.`1,000,000`\[cite: 3]. (2) `handleToggleBot`and`handleRunBotStep`ignore`!resp.ok` (`401`/`403`/`500`) and swallow errors without reverting `botConfig`or displaying`error`\[cite: 3]. (3) Marks positions `Cleared Demat`at`pos.holdSessions >= 2`instead of`SETTLEMENT\_CYCLE.sellableDays` (`3`, i.e., T+3 after T+2 settlement in `src/constants/marketRules.js`).



&#x20;|

| \*\*A2-025\*\* | \*\*P0\*\* | `src/components/PortfolioBrokerShield.tsx` — `evaluateShield`, `useEffect`, `handleOpenTape`, Daily Tape Modal (\~lines 122, 147–264, 540–660) | (1) Manual `evaluateShield(true)` has no request sequence guard against `useEffect(\[shieldItems, days])`, allowing a slower `30D` response to overwrite a newly selected `5D` view. (2) `errorMsg` is never rendered in JSX, and `evaluatedStocks` is not cleared on failure—leaving stale `30D` verdicts under a `5D Scope` banner. (3) `handleOpenTape` fetches `fetchPrecomputedDiagnostic` into `tapeData` with no sequence guard and \*\*never renders `tapeData\*\*` anywhere in the modal.



&#x20;| Cross-timeframe stale broker verdicts shown silently under the wrong horizon header, swallowed offline errors, and a Tape modal that fetches but discards all floorsheet broker tape data.



&#x20;| Add monotonic `evalSeqRef`/`tapeSeqRef` guards, clear stale data on error and render an error alert banner, and render `tapeData`'s broker flow \& volume/turnover breakdown in the Tape modal. |

| \*\*A2-026\*\* | \*\*P1\*\* | `src/components/PredictorHub.jsx` — `filteredStocks` (`coiled`/`catalyst`/`low\_float`) \& card rendering (\~lines 390–495, 765, 930–980, 1106) | (1) `coiled` ("Next Breakouts") reads `high20`/`high52`/`pivot\_distance\_pct`, which are never copied onto `scoredStocks`, so `distPct === 0` always and it falls back to 35 unrelated stocks. (2) `catalyst` classifies any low-float stock (`sharesOut <= 3.5`) as a Corporate Catalyst and dumps 35 non-catalyst stocks on fallback. (3) Renders `Float nullM` when `sharesOut` is null, `undefined%` when backend `/api/predict/stocks` omits `pChange` (schema `001\_prediction\_engine.sql` has no `pChange` column), defaults unknown Prime Pick sector to `'Commercial Banks'`, and hardcodes `2026-11-08` on offline news badge.



&#x20;| Broken "Next Breakouts" and "Corporate Catalysts" screeners, `Float nullM` / `undefined%` UI leaks, and misclassified stock sectors.



&#x20;| Copy live `pChange`/`high20`/`high52`/`pivot\_distance\_pct` onto `scoredStocks`, remove low-float \& arbitrary fallback pollution from `catalyst`/`coiled`, guard null `sharesOut`/`pChange` formatters, and remove hardcoded `'Commercial Banks'` / `'2026-11-08'`. |

| \*\*A2-027\*\* | \*\*P1\*\* | `src/components/MultibaggerHunterService.tsx` — `useEffect`, `evaluated`, `filtered`, card render (\~lines 23–28, 39–46, 107, 175) | (1) `fetchMarketWideBrokerSummaryMap(1)` checks `Object.keys(map).length > 0` and discards `map` instead of storing it for Gate 5 (`realBroker`). (2) `filterSector === 'finance'` uses `sector.includes('finance')`, which matches `'Microfinance'`. (3) `s.sharesOut



&#x20;|  | (Number(s.listedShares) / 1e6)`yields`NaN`when`s.sharesOut === 0`and`listedShares`is undefined; ignores SQLite snake\_case`eps\_ttm`, `book\_value\_per\_share`, `promoter\_share\_pct`\[cite: 1, 3]. (4) `(s.pChange |

| \*\*A2-028\*\* | \*\*P1\*\* | `src/components/PaperTradingJournalScreen.tsx` — table renderers (\~lines 319, 377, 517, 521, 529) | Unchecked `t.realizedPnl.toLocaleString()`, `item.netPnlNpr.toLocaleString()`, and `pick.triggers.map(...)` throw `TypeError` on missing values; empty `pick.entryZone` (`\[]`) renders `Rs. undefined – undefined`; null `pick.target2` renders `Rs. X / null`.



&#x20;| Crashes the Paper Trading Journal tab or leaks `undefined`/`null` prices in logged picks.



&#x20;| Guard all numeric `.toLocaleString()` calls, default `(pick.triggers |

| \*\*A2-029\*\* | \*\*P1\*\* | `src/components/PortfolioBrokerShield.tsx` — Matrix table \& Tape modal (\~lines 510, 513, 618, 648, 669) | Calls `.toLocaleString()` / `.toFixed(1)` directly on `stock.ltp`, `stock.bigBrokerVWAP`, `tapeModalStock.bigBrokerVWAP`, `avgBuyPrice`, and `avgSellPrice` without finiteness checks.



&#x20;| Throws `TypeError` and crashes the Broker Shield screen if any portfolio/watchlist stock lacks VWAP or LTP data.



&#x20;| Format all prices via a `Number.isFinite` helper returning `'—'` for missing values. |

| \*\*A2-030\*\* | \*\*P1\*\* | `src/components/PreferencesSettingsService.tsx` — `handleExportBackup`, counts, System Health tab (\~lines 176–198, 348, 382, 425, 439–444) | (1) Reads non-existent `nepse\_portfolio\_v1`, `nepse\_notes\_v1`, `nepse\_alerts\_v1` instead of `App.jsx`'s canonical keys (`nepse\_portfolio\_profiles`, `nepse\_trade\_notes`, `nepse\_stock\_alerts`) and runs unguarded `JSON.parse` during render. (2) System Health defaults to `'HEALTHY'` while loading, shows `'247 Stocks'` when cache is `0`, defaults completeness bar to `100%`, and renders 4 hardcoded `100% HEALTHY` scrapers even when `overallStatus === 'DEGRADED'` (backend offline).



&#x20;| Users export empty backup files thinking their portfolio/notes/alerts are backed up, and System Health falsely reports 100% healthy scrapers when the proxy is offline.



&#x20;| Use safe `try/catch` readers on canonical `App.jsx` storage keys, display `0 Stocks` accurately, show `'CHECKING...'` while loading, and never fabricate `HEALTHY` scrapers when `monitoringData?.scrapers` is absent. |

| \*\*A2-031\*\* | \*\*P1\*\* | `src/components/PromoterSharesService.tsx` — `useEffect` processing \& render (\~lines 30–130, 153, 203) | (1) Trusts static `apiItem.daysRemaining` from registry JSON instead of recomputing days from `lockInExpiryDate` vs today. (2) Ignores SQLite `004\_upgrade\_fundamentals\_and\_lockin.sql` snake\_case fields (`promoter\_share\_pct`, `promoter\_unlock\_date`, `public\_float\_kitta`). (3) `parseInt(String(apiItem.totalShares)...)` yields `NaN` on `"N/A"`; renders `N/A%` for `avgPromoterHolding` and `Rs. 0` when `ltp === 0`; lacks `isMounted` guard.



&#x20;| Drifted/expired lock-in countdowns miss `<=60D` supply shocks, and table leaks `N/A%` / `Rs. 0` / `NaN` float flood ratios.



&#x20;| Recompute `daysRemaining` dynamically from parseable `lockInExpiryDate`, support snake\_case fields, guard `parseInt` against `NaN`, fix `N/A%` \& `Rs. 0`, and add `isMounted` guard. |

| \*\*A2-032\*\* | \*\*P1\*\* | `src/components/SeasonalityAnalyticsService.tsx` — `useEffect`, StatCards, Deep-Dive (\~lines 36–55, 78, 155–160) | (1) Hardcodes `(80% Win)` in the Best Month subtitle and `out of 10` in Years Green/Red even when live backend data has different win rates or year counts. (2) Silently falls back to hardcoded 2015–2025 static array with no baseline disclosure badge. (3) `overallWinRate` produces `NaN%` if any API row omits `winRate`, and `useEffect` lacks `isMounted` guard.



&#x20;| Investors see contradictory live return metrics paired with hardcoded `80% Win` and `out of 10` labels, or mistake static fallback numbers for live-computed seasonality.



&#x20;| Interpolate `bestMonth.winRate` and `(yearsUp + yearsDown)`, guard `Number(m.winRate)` against `NaN`, add `isMounted` guard, and show a static-baseline badge when live API fails. |

| \*\*A2-033\*\* | \*\*P2\*\* | `src/components/MultibaggerHunterService.tsx` — footer \& props (\~lines 10, 237) | Footer prints `Total Scanned: {stocks.length}` (including excluded mutual funds/debentures) instead of `{evaluated.length}`, and `indices` prop is unused.



&#x20;| Misstates count of pure equities scanned.



&#x20;| Display `evaluated.length` in footer and remove dead `indices` prop (or use it). |

| \*\*A2-034\*\* | \*\*P2\*\* | `src/components/services.tsx` (visible lines 30–74) | Statically bundles 7.36 MB `broker\_matrix\_latest.json` and 2-month-stale `sebonPipelineData.json` (LastWrite `2026-09-07`); `DEFAULT\_COLS` formats `NaN` values as `NaN%` / `Rs. NaN` (full body pending Part 3).



&#x20;| Bloats client bundle with stale broker/IPO JSON and leaks `NaN%` on malformed rows.



&#x20;| Guard `DEFAULT\_COLS` formatters with `Number.isFinite(Number(val))` and audit static JSON consumers in Part 3. |

| \*\*A2-035\*\* | \*\*P3\*\* | `src/components/LoginScreen.jsx` (\~lines 115, 198), `src/components/PortfolioBrokerShield.tsx` (\~lines 120, 270, 438), `src/components/PreferencesSettingsService.tsx` (\~line 32) | Registration password input lacks `minLength={6}` and `handleGuest` `setTimeout` has no unmount cleanup; `PortfolioBrokerShield` prefixes `+` onto positive portfolio value (`+Rs. 12.50 L`) and has dead `capitalRotations` state; `PreferencesSettingsService` has unused `importSuccess` state.



&#x20;| Minor UX/cosmetic polish issues.



&#x20;| Add `minLength={6}` and unmount ref in `LoginScreen`, add `signed = false` param to `formatNpr`, and remove dead state variables. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 \& P1 Bugs Only)



\#### `src/components/PredictorHub.jsx` (Fixes `A2-020`, `A2-021`, `A2-022`, `A2-023`, `A2-026`)



```diff

\--- a/src/components/PredictorHub.jsx

+++ b/src/components/PredictorHub.jsx

@@ -55,6 +55,7 @@

&#x20;import InvestorDecisionGuideModal from './InvestorDecisionGuideModal';

&#x20;import { NEPSE\_UNIVERSE } from '../data/nepseUniverse';

+import { isPureNepseEquity } from '../utils/nepseEquityFilter.js';

&#x20;import { clampToDailyCircuitBand, getCircuitLimits, clampReturnIntervalToCircuit, calculateDynamicRSI } from '../utils/dynamicCalculationEngine';

&#x20;import { evaluateOrderFlowVeto } from '../utils/sharedBrokerAggregationEngine';

@@ -174,17 +175,26 @@

&#x20;    return () => { isMounted = false; };

&#x20;  }, \[selectedNewsArticle]);

&#x20;

\+  const stocksRef = useRef(stocks);

\+  const indicesRef = useRef(indices);

\+  const sentimentNewsRef = useRef(sentimentNews);

\+  const fetchSeqRef = useRef(0);

\+  useEffect(() => { stocksRef.current = stocks; }, \[stocks]);

\+  useEffect(() => { indicesRef.current = indices; }, \[indices]);

\+  useEffect(() => { sentimentNewsRef.current = sentimentNews; }, \[sentimentNews]);

\+

&#x20;  const fallbackStockScoring = React.useCallback(() => {

\-    if (!Array.isArray(stocks) || stocks.length === 0) return;

\+    const currentStocks = stocksRef.current;

\+    if (!Array.isArray(currentStocks) || currentStocks.length === 0) return;

&#x20;    const activePreset = STRATEGY\_PRESETS.find(p => p.id === activeStrategyPreset) || STRATEGY\_PRESETS\[0];

&#x20;    const techMult = Number((activePreset.weights.technical / 0.25).toFixed(2));

&#x20;    const flowMult = Number((activePreset.weights.brokerFloorsheet / 0.35).toFixed(2));

&#x20;    const fundMult = Number((activePreset.weights.fundamental / 0.20).toFixed(2));

&#x20;

\-    const computed = stocks.map(s => {

\+    const computed = currentStocks.filter(s => s \&\& s.symbol \&\& Number(s.ltp || s.closePrice || 0) > 0 \&\& isPureNepseEquity(s)).map(s => {

&#x20;      const sym = String(s.symbol || '').toUpperCase().trim();

&#x20;      const uInfo = UNIVERSE\_MAP.get(sym);

&#x20;      const pCh = Number(s.pChange || 0);

\-      const vol = Number(s.volume || s.totalTradedQuantity || 1000);

\-      const ltp = Number(s.ltp || s.closePrice || 100);

\-      const vsr = Number(s.volumeSurgeRatio || (vol > 15000 ? 1.55 : 0.95));

\+      const vol = Number(s.volume ?? s.totalTradedQuantity ?? 0);

\+      const ltp = Number(s.ltp || s.closePrice || 0);

\+      const vsr = Number(s.volumeSurgeRatio || s.rvol || 1.0);

@@ -234,7 +244,7 @@

&#x20;      // ── Order Flow Veto Guard ───────────────────────────────────────────

\-      const sBrokerData = s.brokerAnalysis || s.realBrokerAnalysis || s.brokerData || s;

\+      const sBrokerData = brokerInfo || s.brokerAnalysis || s.realBrokerAnalysis || s.brokerData || s;

&#x20;      const orderFlowVeto = evaluateOrderFlowVeto(sBrokerData, s);

&#x20;      const isOrderFlowVetoed = Boolean(orderFlowVeto?.isVetoed);

@@ -249,10 +259,10 @@

&#x20;      // ── Upper Rejection Wick Anti-Dump Check ─────────────────────────────

\-      const pHigh = Number(s.high || s.dayHigh || s.ltp);

\-      const pLow = Number(s.low || s.dayLow || s.ltp);

\-      const pOpen = Number(s.open || s.ltp);

\+      const pHigh = Number(s.high || s.dayHigh || ltp);

\+      const pLow = Number(s.low || s.dayLow || ltp);

\+      const pOpen = Number(s.open || ltp);

&#x20;      const pRange = Math.max(0.1, pHigh - pLow);

\-      const upperWickRatio = pHigh > pLow ? ((pHigh - Math.max(pOpen, s.ltp)) / pRange) : 0;

\+      const upperWickRatio = pHigh > pLow ? ((pHigh - Math.max(pOpen, ltp)) / pRange) : 0;

&#x20;      const isUpperWickDump = upperWickRatio >= 0.35;

@@ -272,7 +282,9 @@

&#x20;      // ── Apply Hard Trend Ceiling, Upper Wick Cap \& Order Flow Veto ──────────

&#x20;      const rawScore = Math.max(10, Math.min(98, Math.round(score)));

\-      let compositeScore = isOrderFlowVetoed ? Math.min(25, rawScore) : (isUpperWickDump ? Math.min(45, rawScore) : (hardCeilingApplied ? Math.min(48, rawScore) : rawScore));

\+      const isIlliquidZeroVol = vol < 200;

\+      let compositeScore = isIlliquidZeroVol

\+        ? Math.min(35, rawScore)

\+        : (isOrderFlowVetoed ? Math.min(25, rawScore) : (isUpperWickDump ? Math.min(45, rawScore) : (hardCeilingApplied ? Math.min(48, rawScore) : rawScore)));

@@ -315,6 +327,13 @@

&#x20;        Number(s.rightShare || 0) > 0 ? `${s.rightShare}% Right Share Issue` :

&#x20;        'Corporate Action / AGM Disclosure';

&#x20;

\+      const high20 = closes.length >= 5

\+        ? Math.max(...closes.slice(-20))

\+        : Number(s.high20 || s.high52 || s.fiftyTwoWeekHigh || 0);

\+      const pivotDistPct = high20 > 0 \&\& ltp > 0 ? +(((high20 - ltp) / high20) \* 100).toFixed(2) : null;

\+

&#x20;      return {

&#x20;        symbol: s.symbol,

&#x20;        companyName: s.companyName || s.name || uInfo?.name || s.symbol,

&#x20;        sector: s.sector || uInfo?.sector || 'Others',

&#x20;        ltp,

&#x20;        pChange: pCh,

\+        high20: high20 > 0 ? high20 : null,

\+        high52: Number(s.high52 || s.fiftyTwoWeekHigh || 0) || null,

\+        pivot\_distance\_pct: pivotDistPct,

&#x20;        volume: vol,

@@ -340,7 +359,7 @@

&#x20;        corporate\_action\_flag: hasCatalyst ? 'corporate\_catalyst' : null,

&#x20;        catalystLabel: hasCatalyst ? catalystLabel : null,

&#x20;        composite\_score: compositeScore,

\-        signal: compositeScore >= (activePreset.thresholds?.buyScore || 70) ? 'BUY' : compositeScore >= (activePreset.thresholds?.watchScore || 50) ? 'WATCH' : 'AVOID',

\+        signal: isIlliquidZeroVol ? 'AVOID' : (compositeScore >= (activePreset.thresholds?.buyScore || 70) ? 'BUY' : compositeScore >= (activePreset.thresholds?.watchScore || 50) ? 'WATCH' : 'AVOID'),

&#x20;        activePreset: activePreset.id,

&#x20;        presetName: activePreset.shortName,

&#x20;        bcr3BuyPct: bcr3Buy,

@@ -351,11 +370,12 @@

&#x20;    });

&#x20;

&#x20;    setScoredStocks(computed.sort((a, b) => b.composite\_score - a.composite\_score));

\-  }, \[stocks, activeStrategyPreset]);

\+  }, \[activeStrategyPreset]);

&#x20;

&#x20;

&#x20;  // Fetch prediction data from backend or generate instant deterministic fallback

&#x20;  const fetchPredictionData = React.useCallback(async () => {

\+    const reqId = ++fetchSeqRef.current;

&#x20;    setLoading(true);

&#x20;    const proxyBase = getProxyBase();

\+    const currentStocks = stocksRef.current || \[];

\+    const currentIndices = indicesRef.current || {};

&#x20;

&#x20;    // Trigger parallel market-wide broker summary map hydration

&#x20;    fetchMarketWideBrokerSummaryMap(1).catch(() => null);

@@ -363,28 +383,46 @@

&#x20;    try {

&#x20;      // 1. Fetch Index Prediction

&#x20;      const predRes = await fetch(`${proxyBase}/api/predict/nepse`).catch(() => null);

\+      if (fetchSeqRef.current !== reqId) return;

&#x20;      if (predRes \&\& predRes.ok) {

&#x20;        const json = await predRes.json();

\+        if (fetchSeqRef.current !== reqId) return;

&#x20;        if (json.prediction) {

&#x20;          setIndexPrediction(json.prediction);

&#x20;          if (json.trackRecord) setTrackRecord(json.trackRecord);

&#x20;        }

&#x20;      } else {

&#x20;        // High-fidelity client-side deterministic fallback

\+        const rawNepseIdx = Number(currentIndices?.nepse?.current || currentIndices?.nepse?.value || currentIndices?.nepse?.index || 0);

\+        if (!Number.isFinite(rawNepseIdx) || rawNepseIdx <= 0) {

\+          setIndexPrediction(null);

\+        } else {

&#x20;        let advances = 0, declines = 0, adRatio = 1;

\-        if (stocks \&\& stocks.length > 0) {

\-          advances = stocks.filter(s => Number(s.pChange || 0) > 0).length;

\-          declines = stocks.filter(s => Number(s.pChange || 0) < 0).length;

\+        if (currentStocks.length > 0) {

\+          advances = currentStocks.filter(s => Number(s.pChange || 0) > 0).length;

\+          declines = currentStocks.filter(s => Number(s.pChange || 0) < 0).length;

&#x20;          adRatio = advances / Math.max(1, declines);

&#x20;        }

&#x20;        

\-        const nepseIdx = Number(indices?.nepse?.current || indices?.nepse?.value || indices?.nepse?.index || 2650);

\-        const nepseChange = Number(indices?.nepse?.pChange || indices?.nepse?.pointChange || 0);

\+        const nepseIdx = rawNepseIdx;

\+        const nepseChange = Number(currentIndices?.nepse?.pChange || currentIndices?.nepse?.pointChange || 0);

&#x20;        const fiscal = computeFiscalCycle(new Date());

&#x20;

\-        // Market Breadth impact in \[-1, +1]

\+        // 4-Pillar Weighted Score (35% Technical, 25% Breadth, 25% Macro, 15% Sentiment)

&#x20;        const totalAd = advances + declines;

&#x20;        const breadthRatio = totalAd > 0 ? (advances - declines) / totalAd : 0;

\-        const momentumImpact = Math.max(-1, Math.min(1, nepseChange / 2.5));

\-        const rawScore = Number(((breadthRatio \* 0.60) + (momentumImpact \* 0.40)).toFixed(2));

\-        const dir = rawScore > 0.08 ? 'up' : rawScore < -0.08 ? 'down' : 'consolidate';

\+        const techFactor = Math.max(-1, Math.min(1, nepseChange / 2.5));

\+        const newsItems = sentimentNewsRef.current || \[];

\+        const sentimentFactor = newsItems.length > 0

\+          ? Number((newsItems.reduce((acc, n) => acc + Number(n.sentiment\_score || 0), 0) / newsItems.length).toFixed(2))

\+          : 0;

\+        const macroFactor = Number(Math.max(-1, Math.min(1, fiscal.scoreBonus)).toFixed(2));

\+        const rawScore = Number(((techFactor \* 0.35) + (breadthRatio \* 0.25) + (macroFactor \* 0.25) + (sentimentFactor \* 0.15)).toFixed(2));

@@ -395,13 +433,15 @@

&#x20;        const prevIndexClose = Number(

\-          indices?.nepse?.prevClose ||

\-          (indices?.nepse?.pointChange ? nepseIdx - Number(indices.nepse.pointChange) : null) ||

\-          (indices?.nepse?.pChange ? +(nepseIdx / (1 + Number(indices.nepse.pChange) / 100)).toFixed(2) : null) ||

\+          currentIndices?.nepse?.prevClose ||

\+          (currentIndices?.nepse?.pointChange ? nepseIdx - Number(currentIndices.nepse.pointChange) : null) ||

\+          (currentIndices?.nepse?.pChange ? +(nepseIdx / (1 + Number(currentIndices.nepse.pChange) / 100)).toFixed(2) : null) ||

&#x20;          nepseIdx

&#x20;        );

&#x20;        const { floor: circuitFloor, ceiling: circuitCeiling } = getCircuitLimits(prevIndexClose, 8.0);

\-

\-        const rawT1 = dir === 'up' ? +(nepseIdx + atr \* 1.4).toFixed(1) : +(nepseIdx - atr \* 1.4).toFixed(1);

\-        const rawT2 = dir === 'up' ? +(nepseIdx + atr \* 2.8).toFixed(1) : +(nepseIdx - atr \* 2.8).toFixed(1);

\-        const rawStop = dir === 'up' ? +(nepseIdx - atr \* 1.1).toFixed(1) : +(nepseIdx + atr \* 1.1).toFixed(1);

@@ -429,8 +469,8 @@

&#x20;        const floatDiv = {

&#x20;          divergenceDetected: false,

&#x20;          signal: 'neutral',

&#x20;          scoreModifier: 0.0,

\-          headlinePChange: Number(indices?.nepse?.pChange || 0),

\-          floatPChange: Number(indices?.float?.pChange || 0),

\-          sensitiveFloatPChange: Number(indices?.sensitive\_float?.pChange || 0),

\+          headlinePChange: Number(currentIndices?.nepse?.pChange || 0),

\+          floatPChange: Number(currentIndices?.float?.pChange || 0),

\+          sensitiveFloatPChange: Number(currentIndices?.sensitive\_float?.pChange || 0),

&#x20;          explanation: 'Headline NEPSE and free-float index are moving in normal correlation.'

&#x20;        };

@@ -461,6 +501,15 @@

&#x20;        const is\_above\_200\_ema = (ema\_200 != null \&\& ema\_200 > 0) ? (nepseIdx >= ema\_200) : null;

&#x20;        const golden\_cross = (ema\_50 != null \&\& ema\_200 != null) ? (ema\_50 >= ema\_200) : null;

&#x20;        const hard\_ceiling\_applied = is\_above\_50\_ema === false;

\+        const rawDir = rawScore > 0.08 ? 'up' : rawScore < -0.08 ? 'down' : 'consolidate';

\+        const dir = (hard\_ceiling\_applied \&\& rawDir === 'up') ? 'consolidate' : rawDir;

\+

\+        const rawT1 = dir === 'down' ? +(nepseIdx - atr \* 1.4).toFixed(1) : +(nepseIdx + atr \* 1.4).toFixed(1);

\+        const rawT2 = dir === 'down' ? +(nepseIdx - atr \* 2.8).toFixed(1) : +(nepseIdx + atr \* 2.8).toFixed(1);

\+        const rawStop = dir === 'down' ? +(nepseIdx + atr \* 1.1).toFixed(1) : +(nepseIdx - atr \* 1.1).toFixed(1);

\+        const target1 = clampToDailyCircuitBand(rawT1, prevIndexClose, 8.0);

\+        const target2 = clampToDailyCircuitBand(rawT2, prevIndexClose, 8.0);

\+        const stopFloor = clampToDailyCircuitBand(rawStop, prevIndexClose, 8.0);

\+        const rrr = +(Math.abs(target1 - nepseIdx) / Math.max(0.01, Math.abs(nepseIdx - stopFloor))).toFixed(2);

@@ -487,27 +536,30 @@

&#x20;          contributing\_factors: {

\-            technical: dir === 'up' ? 0.35 : -0.25,

\-            breadth: +(adRatio - 1).toFixed(2),

\-            sentiment: 0.30,

\-            macro: +(0.25 + fiscal.scoreBonus).toFixed(2),

\+            technical: Number(techFactor.toFixed(2)),

\+            breadth: Number(breadthRatio.toFixed(2)),

\+            sentiment: sentimentFactor,

\+            macro: macroFactor,

&#x20;            weights: { technical: 0.35, breadth: 0.25, macro: 0.25, sentiment: 0.15 }

&#x20;          },

&#x20;          features: {

&#x20;            rsi\_14: null,

&#x20;            macd\_signal: dir === 'up' ? 'bullish' : 'bearish',

&#x20;            advance\_decline\_ratio: +adRatio.toFixed(2),

\-            sector\_breadth\_pct: +(advances / Math.max(1, stocks?.length || 1)).toFixed(2),

\-            weighted\_breadth\_pct: +(advances / Math.max(1, stocks?.length || 1)).toFixed(2),

\-            turnover\_ratio\_vs\_20d\_avg: 1.05,

\+            sector\_breadth\_pct: +(advances / Math.max(1, currentStocks.length || 1)).toFixed(2),

\+            weighted\_breadth\_pct: +(advances / Math.max(1, currentStocks.length || 1)).toFixed(2),

\+            turnover\_ratio\_vs\_20d\_avg: null,

&#x20;            m2\_growth\_pct: null,

&#x20;            interest\_rate\_pct: null

&#x20;          },

&#x20;          model\_version: 'quant-v2.2-institutional',

&#x20;          explanation: dir === 'up'

&#x20;            ? `NEPSE (${nepseIdx.toFixed(1)} pts) displays bullish bias driven by favorable sector breadth (${advances} advances vs ${declines} declines). Tactical upside target set at ${target1} pts (extension ${target2} pts, bounded by daily index circuit ${circuitCeiling} pts) with trailing stop floor at ${Math.min(target1, stopFloor)} pts (RRR ${rrr}:1).`

\+            : dir === 'down'

\+            ? `NEPSE (${nepseIdx.toFixed(1)} pts) signals bearish retracement pressure (${declines} declines vs ${advances} advances). Downside target: ${target1} pts (extension ${target2} pts), invalidation ceiling: ${stopFloor} pts.`

&#x20;            : `NEPSE (${nepseIdx.toFixed(1)} pts) indicates consolidation near benchmark levels. Support floor: ${stopFloor} pts, Resistance ceiling: ${target1} pts.`

&#x20;        });

\+        }

@@ -529,11 +581,18 @@

&#x20;      // 2. Fetch Scored Stocks

\-      const stockRes = await fetch(`${proxyBase}/api/predict/stocks`).catch(() => null);

\+      const stockRes = await fetch(`${proxyBase}/api/predict/stocks?preset=${encodeURIComponent(activeStrategyPreset)}`).catch(() => null);

\+      if (fetchSeqRef.current !== reqId) return;

&#x20;      if (stockRes \&\& stockRes.ok) {

&#x20;        const json = await stockRes.json();

\+        if (fetchSeqRef.current !== reqId) return;

&#x20;        if (Array.isArray(json.data) \&\& json.data.length > 0) {

\+          const activePreset = STRATEGY\_PRESETS.find(p => p.id === activeStrategyPreset) || STRATEGY\_PRESETS\[0];

\+          const liveMap = new Map(currentStocks.map(st => \[String(st.symbol || '').toUpperCase().trim(), st]));

&#x20;          const enriched = json.data.map(item => {

&#x20;            const sym = String(item.symbol || '').toUpperCase().trim();

&#x20;            const uInfo = UNIVERSE\_MAP.get(sym);

\+            const liveStk = liveMap.get(sym);

\+            const resolvedLtp = Number(liveStk?.ltp || liveStk?.closePrice || item.ltp || 0);

\+            const resolvedPChange = liveStk?.pChange != null ? Number(liveStk.pChange) : (item.pChange != null ? Number(item.pChange) : null);

&#x20;            const sharesOutM = Number(uInfo?.sharesOut || item.sharesOut || 0);

&#x20;            const isLowFloat = sharesOutM > 0 \&\& sharesOutM <= 5;

&#x20;            const hasCatalyst = Boolean(

@@ -546,12 +605,19 @@

&#x20;              Number(item.rightShare || 0) > 0 ? `${item.rightShare}% Right Share Issue` :

&#x20;              'Corporate Action / AGM Disclosure';

\+            const highRef = Number(item.high20 || liveStk?.high20 || liveStk?.high52 || liveStk?.fiftyTwoWeekHigh || 0);

\+            const pivotDist = item.pivot\_distance\_pct ?? (highRef > 0 \&\& resolvedLtp > 0 ? +(((highRef - resolvedLtp) / highRef) \* 100).toFixed(2) : null);

&#x20;            return {

&#x20;              ...item,

&#x20;              companyName: item.companyName || uInfo?.name || item.symbol,

&#x20;              sector: item.sector || uInfo?.sector || 'Others',

\+              ltp: resolvedLtp,

\+              pChange: resolvedPChange,

\+              high20: highRef > 0 ? highRef : null,

\+              pivot\_distance\_pct: pivotDist,

&#x20;              volume: Number(liveStk?.volume || item.volume || 0),

&#x20;              turnover: Number(liveStk?.turnover || item.turnover || 0),

\-              sharesOut: sharesOutM,

\+              sharesOut: sharesOutM > 0 ? sharesOutM : null,

&#x20;              float\_risk\_flag: isLowFloat ? 'low\_float' : (item.float\_risk\_flag || 'normal'),

&#x20;              corporate\_action\_flag: hasCatalyst ? 'corporate\_catalyst' : (item.corporate\_action\_flag || null),

\-              catalystLabel: hasCatalyst ? catalystLabel : null

\+              catalystLabel: hasCatalyst ? catalystLabel : null,

\+              signal: Number(item.composite\_score) >= (activePreset.thresholds?.buyScore || 70) ? 'BUY' : Number(item.composite\_score) >= (activePreset.thresholds?.watchScore || 50) ? 'WATCH' : 'AVOID'

&#x20;            };

&#x20;          });

&#x20;          setScoredStocks(enriched);

@@ -564,6 +630,7 @@

&#x20;      // 3. Fetch Sentiment

&#x20;      const sentRes = await fetch(`${proxyBase}/api/predict/sentiment`).catch(() => null);

\+      if (fetchSeqRef.current !== reqId) return;

&#x20;      if (sentRes \&\& sentRes.ok) {

&#x20;        const json = await sentRes.json();

&#x20;        if (Array.isArray(json.data) \&\& json.data.length > 0) {

@@ -577,6 +644,7 @@

&#x20;      // 4. Fetch Macro

&#x20;      const macroRes = await fetch(`${proxyBase}/api/predict/macro`).catch(() => null);

\+      if (fetchSeqRef.current !== reqId) return;

&#x20;      if (macroRes \&\& macroRes.ok) {

&#x20;        const json = await macroRes.json();

&#x20;        if (json.data \&\& Object.keys(json.data).length > 0) {

@@ -591,17 +659,20 @@

&#x20;      console.warn('\[PredictorHub] Fetch error:', e);

&#x20;      fallbackStockScoring();

&#x20;    } finally {

\-      setLoading(false);

\+      if (fetchSeqRef.current === reqId) setLoading(false);

&#x20;    }

\-  }, \[stocks, indices, fallbackStockScoring]);

\+  }, \[activeStrategyPreset, fallbackStockScoring]);

&#x20;

&#x20;  // Immediate hydration so scoredStocks is NEVER empty on initial render

\+  const hasStocksHydrated = Array.isArray(stocks) \&\& stocks.length > 0;

&#x20;  useEffect(() => {

\-    if (Array.isArray(stocks) \&\& stocks.length > 0 \&\& scoredStocks.length === 0) {

\+    if (hasStocksHydrated \&\& scoredStocks.length === 0) {

&#x20;      fallbackStockScoring();

&#x20;    }

\-  }, \[stocks, fallbackStockScoring, scoredStocks.length]);

\+  }, \[hasStocksHydrated, fallbackStockScoring, scoredStocks.length]);

&#x20;

&#x20;  useEffect(() => {

&#x20;    fetchPredictionData();

\-  }, \[fetchPredictionData]);

\+  }, \[fetchPredictionData, hasStocksHydrated]);

@@ -653,31 +724,25 @@

&#x20;    if (stockFilter === 'catalyst') {

&#x20;      // 4. Corporate Catalysts: Filter confirmed corporate actions \& dividends, sort by catalyst relevance!

&#x20;      const candidates = \[...searchFiltered].filter(s => {

\-        const sym = String(s.symbol || '').toUpperCase().trim();

\-        const uInfo = UNIVERSE\_MAP.get(sym);

&#x20;        return Boolean(

&#x20;          s.corporate\_action\_flag ||

&#x20;          s.catalystLabel ||

&#x20;          Number(s.dividendYield || 0) > 0 ||

&#x20;          Number(s.bonusShare || 0) > 0 ||

\-          Number(s.rightShare || 0) > 0 ||

\-          (uInfo?.sharesOut \&\& uInfo.sharesOut <= 3.5)

\+          Number(s.rightShare || 0) > 0

&#x20;        );

&#x20;      }).sort((a, b) => {

&#x20;        const scoreA = (a.corporate\_action\_flag ? 25 : 0) + (a.catalystLabel ? 15 : 0) + Number(a.composite\_score || 0);

&#x20;        const scoreB = (b.corporate\_action\_flag ? 25 : 0) + (b.catalystLabel ? 15 : 0) + Number(b.composite\_score || 0);

&#x20;        return scoreB - scoreA;

&#x20;      });

\-      return candidates.length >= 5 ? candidates : \[...searchFiltered].filter(s => Number(s.composite\_score) >= 45).slice(0, 35);

\+      return candidates;

&#x20;    }

&#x20;

&#x20;    if (stockFilter === 'coiled') {

&#x20;      // 5. Pre-Breakout / Coiling Radar: Stocks 0.5% to 5.0% below 20-day high or pivot level

&#x20;      const candidates = \[...searchFiltered].filter(s => {

&#x20;        const dist = s.pivot\_distance\_pct ?? s.pivotDistancePct;

\-        const ltp = Number(s.ltp || s.price || 0);

\-        const high20 = Number(s.high20 || s.high52 || ltp);

\-        const distPct = dist != null ? Number(dist) : (high20 > 0 ? ((high20 - ltp) / high20) \* 100 : 99);

\+        const distPct = dist != null \&\& Number.isFinite(Number(dist)) ? Number(dist) : 99;

&#x20;        return distPct >= 0.2 \&\& distPct <= 5.5;

&#x20;      }).sort((a, b) => {

&#x20;        const distA = Math.abs(Number(a.pivot\_distance\_pct ?? a.pivotDistancePct ?? 5));

&#x20;        const distB = Math.abs(Number(b.pivot\_distance\_pct ?? b.pivotDistancePct ?? 5));

&#x20;        return distA - distB;

&#x20;      });

\-      return candidates.length >= 5 ? candidates : \[...searchFiltered].filter(s => Number(s.composite\_score) >= 50).slice(0, 35);

\+      return candidates;

&#x20;    }

@@ -780,7 +845,7 @@

&#x20;        if (result.supported) {

&#x20;          const isPassing = isActionableBuySignal(result);

&#x20;          const status = getDetailedMarketStatus();

&#x20;          const planWithSymbol = {

&#x20;            ...result,

&#x20;            symbol: sym,

&#x20;            sessionDate: primeDailyPick?.sessionDate || status.targetSessionDate,

\-            isLockedForSession: true

\+            isLockedForSession: isPassing,

\+            passedActionableVerification: isPassing

&#x20;          };

&#x20;          setPrimePlan(planWithSymbol);

@@ -814,6 +879,7 @@

&#x20;  useEffect(() => {

&#x20;    const sym = primeDailyPick?.symbol;

\+    setHubMarketDepth(null);

&#x20;    if (!sym) return;

&#x20;    let isMounted = true;

@@ -1012,7 +1078,7 @@

&#x20;            {/\* ── 🏆 DAILY PRIME BREAKOUT \& BUY-ZONE PICK SPOTLIGHT / CASH DEFENSE BANNER ── \*/}

\-            {(cashDefenseActive || !primeDailyPick) ? (

\+            {(cashDefenseActive || !primeDailyPick || (primePlan \&\& primePlan.symbol === primeDailyPick.symbol \&\& primePlan.passedActionableVerification === false)) ? (

&#x20;              <div style={{

@@ -1158,7 +1224,7 @@

&#x20;                            const masterStock = Array.isArray(stocks) ? stocks.find(s => s?.symbol === sym) : null;

&#x20;                            return (primeDailyPick.sector \&\& primeDailyPick.sector !== 'Unknown' \&\& primeDailyPick.sector !== 'NEPSE')

&#x20;                              ? primeDailyPick.sector

\-                              : (masterStock?.sector || 'Commercial Banks');

\+                              : (masterStock?.sector || 'NEPSE Equity');

&#x20;                          })()}

&#x20;                        </span>

@@ -1225,7 +1291,7 @@

&#x20;                      <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 10px' }}>

&#x20;                        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Data Quality</div>

&#x20;                        <div style={{ fontSize: 12, fontWeight: 800, color: '#60a5fa', marginTop: 2 }}>

\-                          {primePlan.dataQuality?.overall || 'HIGH'} ({primePlan.dataQuality?.historyDays || 227} bars)

\+                          {primePlan.dataQuality?.overall || 'VERIFIED'} ({primePlan.dataQuality?.historyDays ?? '—'} bars)

&#x20;                        </div>

&#x20;                      </div>

@@ -1434,7 +1500,7 @@

&#x20;                            <Target style={{ width: 12, height: 12 }} />

\-                            Float {s.sharesOut}M

\+                            {s.sharesOut != null ? `Float ${s.sharesOut}M` : 'Float N/A'}

&#x20;                          </div>

@@ -1472,11 +1538,13 @@

&#x20;                        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, color: 'var(--text-primary)' }}>

\-                          Rs. {s.ltp}

\+                          {Number.isFinite(Number(s.ltp)) \&\& Number(s.ltp) > 0 ? `Rs. ${Number(s.ltp).toFixed(1)}` : '—'}

&#x20;                          <span style={{

&#x20;                            fontSize: 12,

&#x20;                            marginLeft: 6,

\-                            color: s.pChange >= 0 ? 'var(--bull)' : 'var(--bear)'

\+                            color: s.pChange == null ? 'var(--text-muted)' : Number(s.pChange) >= 0 ? 'var(--bull)' : 'var(--bear)'

&#x20;                          }}>

\-                            {s.pChange >= 0 ? `+${s.pChange}%` : `${s.pChange}%`}

\+                            {s.pChange != null \&\& Number.isFinite(Number(s.pChange))

\+                              ? `${Number(s.pChange) >= 0 ? '+' : ''}${Number(s.pChange).toFixed(2)}%`

\+                              : '—'}

&#x20;                          </span>

&#x20;                        </div>

@@ -1629,7 +1697,7 @@

&#x20;                {Array.isArray(sentimentNews) \&\& sentimentNews\[0]?.isOfflineFallback \&\& (

&#x20;                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>

\-                    Offline Sample Data (Last Updated: 2026-11-08)

\+                    Offline Sample Data ({sentimentNews\[0]?.published\_at || sentimentNews\[0]?.date || 'Cached'})

&#x20;                  </span>

&#x20;                )}



```



\---



\#### `src/components/PaperTradingJournalScreen.tsx` (Fixes `A2-024`, `A2-028`)



```diff

\--- a/src/components/PaperTradingJournalScreen.tsx

+++ b/src/components/PaperTradingJournalScreen.tsx

@@ -6,6 +6,7 @@

&#x20;} from 'lucide-react';

&#x20;import { StatCard, InfoBanner, Spinner } from './ui';

&#x20;import { getProxyBase } from '../utils/proxyBase.js';

+import { SETTLEMENT\_CYCLE } from '../constants/marketRules.js';

@@ -104,7 +105,8 @@

&#x20;      if (seq !== loadSeqRef.current) return;

&#x20;

&#x20;      if (stateRes?.success \&\& stateRes.data) {

\-        setCapital(stateRes.data.capital || 1000000);

\+        const parsedCap = Number(stateRes.data.capital);

\+        setCapital(Number.isFinite(parsedCap) ? parsedCap : 1000000);

&#x20;        setDailyPicks(stateRes.data.dailyPicks || \[]);

&#x20;        setOpenPositions(stateRes.data.openPositions || \[]);

&#x20;        setClosedJournal(stateRes.data.closedJournal || \[]);

@@ -134,28 +136,41 @@

&#x20;  }, \[]);

&#x20;

&#x20;  const handleToggleBot = async (enable: boolean) => {

\+    const previous = botConfig;

&#x20;    const updated = { ...botConfig, enabled: enable };

&#x20;    setBotConfig(updated);

\+    setError(null);

&#x20;    try {

&#x20;      const base = getProxyBase();

\-      await fetch(`${base}/api/paper-trading/bot-config`, {

\+      const resp = await fetch(`${base}/api/paper-trading/bot-config`, {

&#x20;        method: 'POST',

&#x20;        headers: { 'Content-Type': 'application/json' },

&#x20;        body: JSON.stringify(updated)

&#x20;      });

\-    } catch (\_) {}

\+      if (!resp.ok) {

\+        throw new Error(`Bot config update rejected (HTTP ${resp.status})`);

\+      }

\+    } catch (err: any) {

\+      setBotConfig(previous);

\+      setError(err?.message || 'Failed to update Autonomous Paper-Execution Bot state.');

\+    }

&#x20;  };

&#x20;

&#x20;  const handleRunBotStep = async () => {

&#x20;    setSteppingBot(true);

\+    setError(null);

&#x20;    try {

&#x20;      const base = getProxyBase();

\-      await fetch(`${base}/api/paper-trading/auto-step`, {

\+      const resp = await fetch(`${base}/api/paper-trading/auto-step`, {

&#x20;        method: 'POST',

&#x20;        headers: { 'Content-Type': 'application/json' },

&#x20;        body: JSON.stringify({})

&#x20;      });

\+      if (!resp.ok) {

\+        throw new Error(`Bot auto-step failed (HTTP ${resp.status})`);

\+      }

&#x20;      await loadData(true);

\-    } catch (\_) {

\+    } catch (err: any) {

\+      setError(err?.message || 'Failed to execute bot step.');

&#x20;    } finally {

&#x20;      setSteppingBot(false);

&#x20;    }

@@ -316,8 +331,8 @@

\-                      <td className={`p-3 font-mono font-bold ${t.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\-                        {t.returnPct >= 0 ? '+' : ''}{t.returnPct}%

\+                      <td className={`p-3 font-mono font-bold ${(Number(t.returnPct) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\+                        {Number.isFinite(Number(t.returnPct)) ? `${Number(t.returnPct) >= 0 ? '+' : ''}${Number(t.returnPct)}%` : '—'}

&#x20;                      </td>

\-                      <td className={`p-3 font-mono font-bold ${t.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\-                        Rs. {t.realizedPnl.toLocaleString()}

\+                      <td className={`p-3 font-mono font-bold ${(Number(t.realizedPnl) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\+                        {Number.isFinite(Number(t.realizedPnl)) ? `Rs. ${Number(t.realizedPnl).toLocaleString()}` : '—'}

&#x20;                      </td>

@@ -374,8 +389,8 @@

\-                        <td className={`p-3 font-mono font-bold ${item.avgReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\-                          {item.avgReturnPct >= 0 ? '+' : ''}{item.avgReturnPct}%

\+                        <td className={`p-3 font-mono font-bold ${(Number(item.avgReturnPct) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\+                          {Number.isFinite(Number(item.avgReturnPct)) ? `${Number(item.avgReturnPct) >= 0 ? '+' : ''}${Number(item.avgReturnPct)}%` : '—'}

&#x20;                        </td>

\-                        <td className={`p-3 font-mono font-bold ${item.netPnlNpr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\-                          Rs. {item.netPnlNpr.toLocaleString()}

\+                        <td className={`p-3 font-mono font-bold ${(Number(item.netPnlNpr) || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>

\+                          {Number.isFinite(Number(item.netPnlNpr)) ? `Rs. ${Number(item.netPnlNpr).toLocaleString()}` : '—'}

&#x20;                        </td>

@@ -455,14 +470,14 @@

\-                        <td className="p-3 font-mono">{pos.holdSessions}d</td>

\+                        <td className="p-3 font-mono">{pos.holdSessions ?? 0}d</td>

&#x20;                        <td className="p-3">

\-                          {pos.holdSessions >= 2 ? (

\+                          {(pos.holdSessions ?? 0) >= SETTLEMENT\_CYCLE.sellableDays ? (

&#x20;                            <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 px-2 py-0.5 text-\[10px] text-emerald-400 border border-emerald-800">

&#x20;                              <CheckCircle2 size={10} /> Cleared Demat

&#x20;                            </span>

&#x20;                          ) : (

&#x20;                            <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 px-2 py-0.5 text-\[10px] text-amber-400 border border-amber-800">

\-                              <Clock size={10} /> T+{pos.holdSessions} Lock

\+                              <Clock size={10} /> T+{pos.holdSessions ?? 0} Lock

&#x20;                            </span>

&#x20;                          )}

&#x20;                        </td>

@@ -514,19 +529,19 @@

&#x20;                      <td className="p-3 font-mono text-slate-300">

\-                        {pick.entryZone ? `Rs. ${pick.entryZone\[0]} – ${pick.entryZone\[1]}` : '—'}

\+                        {Array.isArray(pick.entryZone) \&\& pick.entryZone.length >= 2 \&\& pick.entryZone\[0] != null \&\& pick.entryZone\[1] != null ? `Rs. ${pick.entryZone\[0]} – ${pick.entryZone\[1]}` : '—'}

&#x20;                      </td>

&#x20;                      <td className="p-3 font-mono text-red-400">{pick.stopLoss ? `Rs. ${pick.stopLoss}` : '—'}</td>

&#x20;                      <td className="p-3 font-mono text-emerald-400">

\-                        {pick.target1 ? `Rs. ${pick.target1} / ${pick.target2}` : '—'}

\+                        {pick.target1 ? `Rs. ${pick.target1}${pick.target2 != null ? ` / ${pick.target2}` : ''}` : '—'}

&#x20;                      </td>

&#x20;                      <td className="p-3 text-\[11px] text-slate-400">

&#x20;                        {pick.rejectionReasons \&\& pick.rejectionReasons.length > 0 ? (

&#x20;                          <span className="text-red-400">{pick.rejectionReasons\[0]}</span>

&#x20;                        ) : (

&#x20;                          <div className="flex flex-wrap gap-1">

\-                            {pick.triggers.map((tr, i) => (

\+                            {(pick.triggers || \[]).map((tr, i) => (

&#x20;                              <span key={i} className="rounded bg-slate-800 px-1 py-0.5 text-\[10px] text-slate-300">

&#x20;                                {tr}

&#x20;                              </span>



```



\---



\#### `src/components/PortfolioBrokerShield.tsx` (Fixes `A2-025`, `A2-029`)



```diff

\--- a/src/components/PortfolioBrokerShield.tsx

+++ b/src/components/PortfolioBrokerShield.tsx

@@ -122,6 +122,8 @@

&#x20;  const \[lastEvaluatedTime, setLastEvaluatedTime] = useState<string>('');

&#x20;  const \[errorMsg, setErrorMsg] = useState<string>('');

\+  const evalSeqRef = useRef<number>(0);

\+  const tapeSeqRef = useRef<number>(0);

&#x20;

&#x20;  // Daily Tape Detail Modal

@@ -146,6 +148,7 @@

&#x20;

&#x20;  // Evaluate Portfolio Shield from Backend API

&#x20;  const evaluateShield = async (isManual = false) => {

\+    const seq = ++evalSeqRef.current;

&#x20;    if (shieldItems.length === 0) {

&#x20;      setEvaluatedStocks(\[]);

&#x20;      setSummary(null);

@@ -158,6 +161,7 @@

&#x20;

&#x20;    try {

&#x20;      const res = await fetchPortfolioShield(shieldItems, days);

\+      if (evalSeqRef.current !== seq) return;

&#x20;      if (res?.success) {

&#x20;        setEvaluatedStocks(res.items || \[]);

&#x20;        setSummary(res.portfolioSummary || null);

&#x20;        setCapitalRotations(res.capitalRotations || \[]);

&#x20;        setLastEvaluatedTime(new Date().toLocaleTimeString());

&#x20;      } else {

\+        setEvaluatedStocks(\[]);

\+        setSummary(null);

&#x20;        setErrorMsg('Microstructure shield evaluation pending sync. Retrying...');

&#x20;      }

&#x20;    } catch (err: any) {

\+      if (evalSeqRef.current !== seq) return;

&#x20;      console.warn('\[PortfolioBrokerShield] Evaluation failed:', err);

\+      setEvaluatedStocks(\[]);

\+      setSummary(null);

&#x20;      setErrorMsg('Failed to connect to broker shield backend.');

&#x20;    } finally {

\-      setLoading(false);

\-      setRefreshing(false);

\+      if (evalSeqRef.current === seq) {

\+        setLoading(false);

\+        setRefreshing(false);

\+      }

&#x20;    }

&#x20;  };

&#x20;

&#x20;  useEffect(() => {

\-    let active = true;

\-    const run = async () => {

\-      if (shieldItems.length === 0) {

\-        if (active) {

\-          setEvaluatedStocks(\[]);

\-          setSummary(null);

\-          setLoading(false);

\-        }

\-        return;

\-      }

\-      setLoading(true);

\-      setErrorMsg('');

\-      try {

\-        const res = await fetchPortfolioShield(shieldItems, days);

\-        if (!active) return;

\-        if (res?.success) {

\-          setEvaluatedStocks(res.items || \[]);

\-          setSummary(res.portfolioSummary || null);

\-          setCapitalRotations(res.capitalRotations || \[]);

\-          setLastEvaluatedTime(new Date().toLocaleTimeString());

\-        } else {

\-          setErrorMsg('Microstructure shield evaluation pending sync. Retrying...');

\-        }

\-      } catch (err: any) {

\-        if (!active) return;

\-        console.warn('\[PortfolioBrokerShield] Evaluation failed:', err);

\-        setErrorMsg('Failed to connect to broker shield backend.');

\-      } finally {

\-        if (active) {

\-          setLoading(false);

\-          setRefreshing(false);

\-        }

\-      }

\-    };

\-    run();

\-    return () => {

\-      active = false;

\-    };

\+    evaluateShield(false);

\+    return () => { evalSeqRef.current++; };

&#x20;  }, \[shieldItems, days]);

@@ -251,15 +254,23 @@

&#x20;  // Open Tape / Diagnostic Modal

&#x20;  const handleOpenTape = async (stock: ShieldEvaluatedStock) => {

\+    const seq = ++tapeSeqRef.current;

&#x20;    setTapeModalStock(stock);

\+    setTapeData(null);

&#x20;    setTapeLoading(true);

&#x20;    try {

&#x20;      const diag = await fetchPrecomputedDiagnostic(stock.symbol, days);

\+      if (tapeSeqRef.current !== seq) return;

&#x20;      setTapeData(diag);

&#x20;    } catch (\_) {

\-      setTapeData(null);

\+      if (tapeSeqRef.current === seq) setTapeData(null);

&#x20;    } finally {

\-      setTapeLoading(false);

\+      if (tapeSeqRef.current === seq) setTapeLoading(false);

&#x20;    }

&#x20;  };

\+

\+  const fmtPrice = (v: any, decimals = 1) => {

\+    const n = Number(v);

\+    return v !== null \&\& v !== undefined \&\& Number.isFinite(n) \&\& n > 0 ? `Rs. ${n.toFixed(decimals)}` : '—';

\+  };

@@ -472,6 +483,13 @@

&#x20;      {/\* ── INTERACTIVE SHIELD MATRIX TABLE (7 COLUMNS) ── \*/}

\+      {errorMsg \&\& (

\+        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">

\+          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />

\+          <span>{errorMsg}</span>

\+        </div>

\+      )}

\+

&#x20;      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">

@@ -507,10 +525,10 @@

&#x20;                      {/\* Col 3: Price vs Cost Basis \*/}

&#x20;                      <td className="py-3 px-3 text-right">

&#x20;                        <div className="font-black text-white text-sm">

\-                          Rs. {stock.ltp.toLocaleString()}

\+                          {Number.isFinite(Number(stock.ltp)) \&\& Number(stock.ltp) > 0 ? `Rs. ${Number(stock.ltp).toLocaleString()}` : '—'}

&#x20;                        </div>

&#x20;                        <div className="text-\[10.5px] text-slate-400 mt-0.5 font-mono">

\-                          Operator VWAP: <span className="font-bold text-slate-200">Rs. {stock.bigBrokerVWAP.toFixed(1)}</span>

\+                          Operator VWAP: <span className="font-bold text-slate-200">{fmtPrice(stock.bigBrokerVWAP, 1)}</span>

&#x20;                        </div>

@@ -614,7 +632,7 @@

&#x20;                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">

&#x20;                      <span className="text-\[10px] text-slate-400 uppercase font-bold">Operator Cost Basis</span>

&#x20;                      <div className="text-base font-black text-indigo-400 mt-0.5">

\-                        Rs. {tapeModalStock.bigBrokerVWAP.toFixed(1)}

\+                        {fmtPrice(tapeModalStock.bigBrokerVWAP, 1)}

&#x20;                      </div>

&#x20;                    </div>

@@ -644,9 +662,9 @@

\-                          {tapeModalStock.leadAccumulator.avgBuyPrice > 0 \&\& (

\+                          {Number.isFinite(Number(tapeModalStock.leadAccumulator.avgBuyPrice)) \&\& Number(tapeModalStock.leadAccumulator.avgBuyPrice) > 0 \&\& (

&#x20;                            <div className="text-slate-400 text-\[10px] mt-0.5">

\-                              Avg Buy Price: Rs. {tapeModalStock.leadAccumulator.avgBuyPrice.toFixed(1)}

\+                              Avg Buy Price: {fmtPrice(tapeModalStock.leadAccumulator.avgBuyPrice, 1)}

&#x20;                            </div>

&#x20;                          )}

@@ -665,15 +683,41 @@

\-                          {tapeModalStock.leadDistributor.avgSellPrice > 0 \&\& (

\+                          {Number.isFinite(Number(tapeModalStock.leadDistributor.avgSellPrice)) \&\& Number(tapeModalStock.leadDistributor.avgSellPrice) > 0 \&\& (

&#x20;                            <div className="text-slate-400 text-\[10px] mt-0.5">

\-                              Avg Sell Price: Rs. {tapeModalStock.leadDistributor.avgSellPrice.toFixed(1)}

\+                              Avg Sell Price: {fmtPrice(tapeModalStock.leadDistributor.avgSellPrice, 1)}

&#x20;                            </div>

&#x20;                          )}

&#x20;                        </div>

&#x20;                      ) : (

&#x20;                        <div className="text-slate-400 text-\[11px]">No dominant seller</div>

&#x20;                      )}

&#x20;                    </div>

&#x20;                  </div>

\+

\+                  {/\* Live Fetched Diagnostic Tape Telemetry \*/}

\+                  {tapeData \&\& (

\+                    <div className="p-3.5 bg-slate-950/80 border border-indigo-500/20 rounded-xl space-y-2 text-xs">

\+                      <div className="flex items-center justify-between text-\[11px] font-bold uppercase tracking-wider text-indigo-300">

\+                        <span>Verified {days}D Floorsheet Diagnostic Telemetry</span>

\+                        <span className="font-mono text-slate-400">

\+                          Vol: {Number(tapeData.totalVolume || 0).toLocaleString()} sh

\+                        </span>

\+                      </div>

\+                      <div className="grid grid-cols-3 gap-2 font-mono text-\[11px]">

\+                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">

\+                          <span className="text-slate-400 block text-\[10px]">BCR3 Buy</span>

\+                          <strong className="text-emerald-400">{Number(tapeData.bcr3BuyPct ?? tapeData.grossBuyConcentrationPct ?? 0).toFixed(1)}%</strong>

\+                        </div>

\+                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">

\+                          <span className="text-slate-400 block text-\[10px]">SCR3 Sell</span>

\+                          <strong className="text-rose-400">{Number(tapeData.bcr3SellPct ?? tapeData.grossSellConcentrationPct ?? 0).toFixed(1)}%</strong>

\+                        </div>

\+                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">

\+                          <span className="text-slate-400 block text-\[10px]">Turnover</span>

\+                          <strong className="text-slate-200">{formatNpr(Number(tapeData.totalTurnover || 0))}</strong>

\+                        </div>

\+                      </div>

\+                    </div>

\+                  )}

&#x20;                </>

&#x20;              )}

&#x20;            </div>



```



\---



\#### `src/components/MultibaggerHunterService.tsx` (Fixes `A2-027`)



```diff

\--- a/src/components/MultibaggerHunterService.tsx

+++ b/src/components/MultibaggerHunterService.tsx

@@ -18,14 +18,19 @@

&#x20;  const \[filterScore, setFilterScore] = useState<number | null>(null);

&#x20;  const \[filterSector, setFilterSector] = useState<string | null>(null);

\-  const \[brokerMapLoaded, setBrokerMapLoaded] = useState(false);

\+  const \[brokerMap, setBrokerMap] = useState<Record<string, any>>({});

&#x20;

&#x20;  useEffect(() => {

&#x20;    let isMounted = true;

&#x20;    fetchMarketWideBrokerSummaryMap(1).then((map: any) => {

&#x20;      if (isMounted \&\& map \&\& Object.keys(map).length > 0) {

\-        setBrokerMapLoaded(true);

\+        const upperMap: Record<string, any> = {};

\+        for (const \[k, v] of Object.entries(map)) {

\+          upperMap\[String(k).toUpperCase().trim()] = v;

\+        }

\+        setBrokerMap(upperMap);

&#x20;      }

&#x20;    }).catch(() => {});

&#x20;    return () => { isMounted = false; };

&#x20;  }, \[]);

@@ -36,16 +41,23 @@

&#x20;    return stocks

\-      .filter(s => s \&\& s.symbol \&\& s.ltp > 0 \&\& isPureNepseEquity(s))

\+      .filter(s => s \&\& s.symbol \&\& Number(s.ltp) > 0 \&\& isPureNepseEquity(s))

&#x20;      .map(s => {

\-        const hasFloatData = s.promoterHolding != null \&\& (s.sharesOut != null || s.listedShares != null);

\-        const publicFloatM = hasFloatData ? (1 - Number(s.promoterHolding) / 100) \* Number(s.sharesOut || (Number(s.listedShares) / 1000000)) : null;

\-        const bvps = s.bvps || s.bookValue || 0;

\-        const g = s.eps > 0 \&\& bvps > 0 ? Math.sqrt(22.5 \* s.eps \* bvps) : 0;

\-        const mos = g > 0 ? ((g - s.ltp) / g) \* 100 : null;

\+        const ltpNum = Number(s.ltp);

\+        const pChangeNum = s.pChange != null \&\& Number.isFinite(Number(s.pChange)) ? Number(s.pChange) : 0;

\+        const promoterPct = s.promoterHolding ?? s.promoter\_share\_pct ?? null;

\+        const rawSharesM = Number(s.sharesOut) > 0 ? Number(s.sharesOut) : (Number(s.listedShares) > 0 ? Number(s.listedShares) / 1000000 : NaN);

\+        const hasFloatData = promoterPct != null \&\& Number.isFinite(Number(promoterPct)) \&\& Number.isFinite(rawSharesM) \&\& rawSharesM > 0;

\+        const publicFloatM = hasFloatData ? (1 - Number(promoterPct) / 100) \* rawSharesM : null;

\+        const epsNum = Number(s.eps ?? s.eps\_ttm ?? 0);

\+        const bvps = Number(s.bvps ?? s.bookValue ?? s.book\_value\_per\_share ?? 0);

\+        const g = epsNum > 0 \&\& bvps > 0 ? Math.sqrt(22.5 \* epsNum \* bvps) : 0;

\+        const mos = g > 0 ? ((g - ltpNum) / g) \* 100 : null;

&#x20;        

&#x20;        const gates = (() => {

&#x20;          const sym = String(s.symbol || '').toUpperCase().trim();

&#x20;          const cachedHist = sym ? getCachedRealPriceHistory(sym) : null;

\-          const realBroker = s.brokerAnalysis || s.realBrokerAnalysis || (sym ? getCachedRealBrokerAnalysis(sym) : null) || undefined;

\+          const realBroker = s.brokerAnalysis || s.realBrokerAnalysis || (sym ? brokerMap\[sym] : null) || (sym ? getCachedRealBrokerAnalysis(sym) : null) || undefined;

@@ -80,8 +92,8 @@

&#x20;          return \[

&#x20;            publicFloatM !== null \&\& publicFloatM <= 15,

\-            (s.promoterHolding || 0) >= 52 || stealthScore >= 55,

\-            s.bollinger?.squeeze === true || (Math.abs(s.pChange || 0) <= 2.0 \&\& (s.volume || 0) > 5000),

\+            (Number(promoterPct) || 0) >= 52 || stealthScore >= 55,

\+            s.bollinger?.squeeze === true || (Math.abs(pChangeNum) <= 2.0 \&\& (Number(s.volume) || 0) > 5000),

&#x20;            (s.volumeZScore || 0) >= 1.5 || (s.volumeSurgeRatio || 0) >= 1.8 || s.isVolumeShocker === true,

&#x20;            brokerGatePassed,

&#x20;            (s.dpi || 0) >= 65 || (s.technicalScore || 0) >= 65,

\-            mos !== null ? mos >= 5 : (s.pe > 0 \&\& s.pe < 28),

\+            mos !== null ? mos >= 5 : (Number(s.pe) > 0 \&\& Number(s.pe) < 28),

&#x20;            seasonOk,

&#x20;          ];

&#x20;        })();

&#x20;        

&#x20;        const gatesPass = gates.filter(Boolean).length;

&#x20;        const isEstimated = s.rsi === null || s.rsi === undefined || s.volumeZScore === null || s.volumeZScore === undefined;

&#x20;        

\-        return { ...s, gates, gatesPass, isEstimated, mos, publicFloatM };

\+        return { ...s, ltp: ltpNum, pChange: pChangeNum, gates, gatesPass, isEstimated, mos, publicFloatM };

&#x20;      })

&#x20;      .sort((a, b) => b.gatesPass - a.gatesPass || (b.turnover || 0) - (a.turnover || 0));

\-  }, \[stocks, seasonOk, brokerMapLoaded]);

\+  }, \[stocks, seasonOk, brokerMap]);

@@ -104,7 +116,7 @@

&#x20;        if (filterSector === 'hydro') return sector.includes('hydro');

&#x20;        if (filterSector === 'banks') return sector.includes('commercial bank') || sector.includes('bank');

\-        if (filterSector === 'finance') return sector.includes('finance');

\+        if (filterSector === 'finance') return sector.includes('finance') \&\& !sector.includes('micro');

&#x20;        if (filterSector === 'micro') return sector.includes('microfinance');

&#x20;        return true;



```



\---



\#### `src/components/PreferencesSettingsService.tsx` (Fixes `A2-030`)



```diff

\--- a/src/components/PreferencesSettingsService.tsx

+++ b/src/components/PreferencesSettingsService.tsx

@@ -174,14 +174,31 @@

\+  const safeParseArray = (key: string): any\[] => {

\+    try {

\+      const raw = localStorage.getItem(key);

\+      const parsed = raw ? JSON.parse(raw) : \[];

\+      return Array.isArray(parsed) ? parsed : \[];

\+    } catch (\_) {

\+      return \[];

\+    }

\+  };

\+

\+  const readCanonicalPortfolio = (): any\[] => {

\+    const profiles = safeParseArray('nepse\_portfolio\_profiles');

\+    if (profiles.length > 0) return profiles;

\+    const userTx = safeParseArray(`nepse\_hub\_${activeUserId}\_transactions`);

\+    if (userTx.length > 0) return userTx;

\+    return safeParseArray('nepse\_portfolio\_v1');

\+  };

\+

&#x20;  // Backup Export

&#x20;  const handleExportBackup = () => {

&#x20;    try {

&#x20;      const backup = {

&#x20;        exportedAt: new Date().toISOString(),

&#x20;        watchlist: getWatchlist(),

\-        portfolio: JSON.parse(localStorage.getItem('nepse\_portfolio\_v1') || '\[]'),

\-        notes: JSON.parse(localStorage.getItem('nepse\_notes\_v1') || '\[]'),

\-        alerts: JSON.parse(localStorage.getItem('nepse\_alerts\_v1') || '\[]'),

\+        portfolio: readCanonicalPortfolio(),

\+        notes: safeParseArray('nepse\_trade\_notes'),

\+        alerts: safeParseArray('nepse\_stock\_alerts'),

&#x20;        meroShareAccounts: accounts.map(a => ({

@@ -194,9 +211,9 @@

&#x20;  };

&#x20;

&#x20;  const watchlistCount = getWatchlist().length;

\-  const portfolioCount = (JSON.parse(localStorage.getItem('nepse\_portfolio\_v1') || '\[]')).length;

\-  const notesCount = (JSON.parse(localStorage.getItem('nepse\_notes\_v1') || '\[]')).length;

\-  const alertsCount = (JSON.parse(localStorage.getItem('nepse\_alerts\_v1') || '\[]')).length;

\+  const portfolioCount = readCanonicalPortfolio().length;

\+  const notesCount = safeParseArray('nepse\_trade\_notes').length;

\+  const alertsCount = safeParseArray('nepse\_stock\_alerts').length;

@@ -345,7 +362,7 @@

&#x20;                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'

&#x20;                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'

&#x20;                  }`}>

\-                    {monitoringData?.overallStatus || 'HEALTHY'}

\+                    {loadingHealth ? 'CHECKING...' : (monitoringData?.overallStatus || 'UNKNOWN')}

&#x20;                  </span>

&#x20;                </div>

@@ -379,7 +396,7 @@

&#x20;          {/\* Quick Metrics Grid \*/}

&#x20;          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">

\-            <StatCard label="Memory Securities" value={cachedStocksCount || '247 Stocks'} color="#3b82f6" />

\+            <StatCard label="Memory Securities" value={`${cachedStocksCount} Stocks`} color="#3b82f6" />

&#x20;            <StatCard 

@@ -422,10 +439,10 @@

&#x20;              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">

&#x20;                <div 

&#x20;                  className={`h-full transition-all duration-500 ${

\-                    (monitoringData?.completeness?.completenessPct ?? 100) >= 98

\+                    (monitoringData?.completeness?.completenessPct ?? 0) >= 98

&#x20;                      ? 'bg-emerald-500'

\-                      : (monitoringData?.completeness?.completenessPct ?? 100) >= 80

\+                      : (monitoringData?.completeness?.completenessPct ?? 0) >= 80

&#x20;                      ? 'bg-amber-500'

&#x20;                      : 'bg-rose-500'

&#x20;                  }`}

\-                  style={{ width: `${Math.min(100, Math.max(5, monitoringData?.completeness?.completenessPct ?? 100))}%` }}

\+                  style={{ width: `${Math.min(100, Math.max(0, monitoringData?.completeness?.completenessPct ?? 0))}%` }}

&#x20;                />

&#x20;              </div>

@@ -436,15 +453,16 @@

&#x20;            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">

&#x20;              <Server size={14} className="text-purple-400" /> 2. Scraper Telemetry \&amp; Failover Status

&#x20;            </h4>

&#x20;

\+            {!monitoringData?.scrapers ? (

\+              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">

\+                {loadingHealth ? 'Loading live scraper telemetry...' : 'Scraper telemetry unavailable while backend proxy is offline or degraded.'}

\+              </div>

\+            ) : (

&#x20;            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">

\-              {Object.values(monitoringData?.scrapers || {

\-                nepse\_nots: { name: 'NEPSE NOTS Direct API', successRatePct: 100, consecutiveFailures: 0, health: 'HEALTHY' },

\-                floorsheet\_scraper: { name: 'Daily Floorsheet Scraper', successRatePct: 100, consecutiveFailures: 0, health: 'HEALTHY' },

\-                broker\_vault: { name: 'Broker Accumulation Vault', successRatePct: 100, consecutiveFailures: 0, health: 'HEALTHY' },

\-                fundamentals\_scraper: { name: 'Quarterly Fundamentals Scraper', successRatePct: 100, consecutiveFailures: 0, health: 'HEALTHY' }

\-              }).map((s: any, idx) => (

\+              {Object.values(monitoringData.scrapers).map((s: any, idx) => (

&#x20;                <div key={idx} className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">

@@ -466,6 +484,7 @@

&#x20;                </div>

&#x20;              ))}

&#x20;            </div>

\+            )}

&#x20;          </div>



```



\---



\#### `src/components/PromoterSharesService.tsx` (Fixes `A2-031`)



```diff

\--- a/src/components/PromoterSharesService.tsx

+++ b/src/components/PromoterSharesService.tsx

@@ -26,6 +26,7 @@

&#x20;  const \[selectedFilter, setSelectedFilter] = useState<'all' | 'critical' | 'locked' | 'expiring' | 'high\_float'>('all');

&#x20;

&#x20;  useEffect(() => {

\+    let isMounted = true;

&#x20;    const timeoutFallback = new Promise<\[any, { stocks: any\[] }]>((resolve) => {

&#x20;      setTimeout(() => resolve(\[null, { stocks: \[] }]), 5000);

&#x20;    });

@@ -37,6 +38,7 @@

&#x20;      ]),

&#x20;      timeoutFallback

&#x20;    ]).then((\[apiLockin, { stocks: liveStocks }]) => {

\+      if (!isMounted) return;

&#x20;      const lockinMap = new Map<string, any>();

&#x20;      const lockinList = Array.isArray(apiLockin) ? apiLockin : (Array.isArray(apiLockin?.data) ? apiLockin.data : \[]);

@@ -55,10 +57,11 @@

&#x20;      lockinList.forEach(item => {

&#x20;        const sym = (item.symbol || '').toUpperCase();

&#x20;        if (sym \&\& !symbolSet.has(sym)) {

&#x20;          symbolSet.add(sym);

\+          const parsedTotal = item.totalShares ? parseInt(String(item.totalShares).replace(/,/g, ''), 10) : NaN;

&#x20;          combinedStocks.push({

&#x20;            symbol: sym,

&#x20;            name: item.name,

&#x20;            sector: item.sector,

\-            promoterHolding: item.promoterRatio,

\+            promoterHolding: item.promoterRatio ?? item.promoter\_share\_pct,

&#x20;            ltp: Number(item.ltp || item.close || 0),

\-            sharesOut: item.totalShares ? parseInt(String(item.totalShares).replace(/,/g, ''), 10) / 1e6 : 0

\+            sharesOut: Number.isFinite(parsedTotal) \&\& parsedTotal > 0 ? parsedTotal / 1e6 : 0

&#x20;          });

&#x20;        }

&#x20;      });

@@ -70,22 +73,37 @@

&#x20;        // Authentic promoter holding: prioritize official filing disclosures, then live stock holding (no fabricated 51%/49% defaults)

&#x20;        let promoterPct: number | null = null;

\-        if (apiItem?.promoterRatio != null \&\& Number.isFinite(Number(apiItem.promoterRatio)) \&\& Number(apiItem.promoterRatio) > 0) {

\-          promoterPct = Math.min(99, Math.max(1, +Number(apiItem.promoterRatio).toFixed(1)));

\-        } else if (s.promoterHolding != null \&\& Number.isFinite(Number(s.promoterHolding)) \&\& Number(s.promoterHolding) > 0) {

\-          promoterPct = Math.min(99, Math.max(1, +Number(s.promoterHolding).toFixed(1)));

\-        } else if (s.promoterSharePct != null \&\& Number.isFinite(Number(s.promoterSharePct)) \&\& Number(s.promoterSharePct) > 0) {

\-          promoterPct = Math.min(99, Math.max(1, +Number(s.promoterSharePct).toFixed(1)));

\+        const rawPromoter = apiItem?.promoterRatio ?? apiItem?.promoter\_share\_pct ?? s.promoterHolding ?? s.promoterSharePct ?? s.promoter\_share\_pct;

\+        if (rawPromoter != null \&\& rawPromoter !== '' \&\& Number.isFinite(Number(rawPromoter)) \&\& Number(rawPromoter) > 0) {

\+          promoterPct = Math.min(99, Math.max(1, +Number(rawPromoter).toFixed(1)));

&#x20;        }

&#x20;

&#x20;        const publicPct: number | null = promoterPct != null ? +(100 - promoterPct).toFixed(1) : null;

&#x20;

\-        const sharesM = Number(s.sharesOut || (apiItem?.totalShares ? parseInt(String(apiItem.totalShares).replace(/,/g, ''), 10) / 1e6 : (s.listedShares ? s.listedShares / 1e6 : 0)));

\-        const totalShares = Math.round(sharesM \* 1e6);

\+        const parsedApiTotal = apiItem?.totalShares ? parseInt(String(apiItem.totalShares).replace(/,/g, ''), 10) : NaN;

\+        const rawSharesM = Number(s.sharesOut) > 0

\+          ? Number(s.sharesOut)

\+          : (Number.isFinite(parsedApiTotal) \&\& parsedApiTotal > 0

\+              ? parsedApiTotal / 1e6

\+              : (Number(s.listedShares) > 0 ? Number(s.listedShares) / 1e6 : 0));

\+        const totalShares = Number.isFinite(rawSharesM) \&\& rawSharesM > 0 ? Math.round(rawSharesM \* 1e6) : 0;

&#x20;        const promoterShares = promoterPct != null ? Math.round(totalShares \* (promoterPct / 100)) : 0;

&#x20;        const publicShares = promoterPct != null ? (totalShares - promoterShares) : 0;

&#x20;

&#x20;        // Authentic lock-in tracking from verified filings

&#x20;        let lockInStatus: 'Locked' | 'Critical Supply Shock' | 'Expiring Soon' | 'Unlocked' = 'Unlocked';

&#x20;        let daysRemaining = 0;

&#x20;        let lockInExpiryDate = 'Unlocked';

&#x20;

\-        if (apiItem) {

\-          lockInExpiryDate = apiItem.lockinExpiry || 'Unlocked';

\-          daysRemaining = Number(apiItem.daysRemaining || 0);

\+        const rawExpiry = apiItem?.lockinExpiry || apiItem?.promoter\_unlock\_date || s.promoter\_unlock\_date;

\+        if (apiItem || rawExpiry) {

\+          lockInExpiryDate = rawExpiry || 'Unlocked';

\+          const parsedExpiryMs = rawExpiry \&\& rawExpiry !== 'Unlocked' ? Date.parse(String(rawExpiry)) : NaN;

\+          if (Number.isFinite(parsedExpiryMs)) {

\+            daysRemaining = Math.ceil((parsedExpiryMs - Date.now()) / (1000 \* 60 \* 60 \* 24));

\+          } else {

\+            daysRemaining = Number(apiItem?.daysRemaining || 0);

\+          }

\-          if (apiItem.isExpired || lockInExpiryDate === 'Unlocked') {

\+          if (apiItem?.isExpired || lockInExpiryDate === 'Unlocked' || daysRemaining <= 0) {

&#x20;            lockInStatus = 'Unlocked';

&#x20;            daysRemaining = 0;

&#x20;            lockInExpiryDate = 'Unlocked';

@@ -134,8 +152,9 @@

&#x20;      setStocks(processed);

&#x20;      setLoading(false);

&#x20;    }).catch(() => {

\-      setLoading(false);

\+      if (isMounted) setLoading(false);

&#x20;    });

\+    return () => { isMounted = false; };

&#x20;  }, \[]);

@@ -174,7 +193,7 @@

&#x20;      {/\* Metric Cards \*/}

&#x20;      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">

\-        <StatCard label="Avg Promoter Holding" value={`${avgPromoterHolding}%`} big color="#3b82f6" />

\+        <StatCard label="Avg Promoter Holding" value={avgPromoterHolding === 'N/A' ? 'N/A' : `${avgPromoterHolding}%`} big color="#3b82f6" />

&#x20;        <StatCard label="Critical Shock (≤60D)" value={criticalCount} subtitle="Severe Supply Flood" color="#ef4444" big />

@@ -221,7 +240,7 @@

&#x20;                  <td className="p-3 text-right font-black text-white">

\-                    Rs. {s.ltp}

\+                    {s.ltp > 0 ? `Rs. ${s.ltp.toLocaleString()}` : '—'}

&#x20;                  </td>



```



\---



\#### `src/components/SeasonalityAnalyticsService.tsx` (Fixes `A2-032`)



```diff

\--- a/src/components/SeasonalityAnalyticsService.tsx

+++ b/src/components/SeasonalityAnalyticsService.tsx

@@ -33,27 +33,36 @@

&#x20;  const \[calendarMode, setCalendarMode] = useState<'BS' | 'AD'>('BS');

&#x20;  const \[seasonalityData, setSeasonalityData] = useState<MonthStat\[]>(HISTORICAL\_SEASONALITY\_DATA);

&#x20;  const \[selectedMonth, setSelectedMonth] = useState<MonthStat>(HISTORICAL\_SEASONALITY\_DATA\[3]); // Shrawan default

\+  const \[isStaticBaseline, setIsStaticBaseline] = useState<boolean>(true);

&#x20;

&#x20;  useEffect(() => {

\+    let isMounted = true;

&#x20;    fetchSeasonalityAnalytics().then(res => {

\+      if (!isMounted) return;

&#x20;      const data = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : null);

&#x20;      if (data \&\& data.length > 0) {

&#x20;        setSeasonalityData(data);

&#x20;        setSelectedMonth(data\[3] || data\[0]);

\+        setIsStaticBaseline(false);

&#x20;      }

&#x20;    }).catch(() => {});

\+    return () => { isMounted = false; };

&#x20;  }, \[]);

&#x20;

&#x20;  const bestMonth = useMemo(() => {

\-    return \[...seasonalityData].sort((a, b) => b.avgReturn - a.avgReturn)\[0] || seasonalityData\[0];

\+    return \[...seasonalityData].sort((a, b) => (Number(b.avgReturn) || 0) - (Number(a.avgReturn) || 0))\[0] || seasonalityData\[0];

&#x20;  }, \[seasonalityData]);

&#x20;

&#x20;  const worstMonth = useMemo(() => {

\-    return \[...seasonalityData].sort((a, b) => a.avgReturn - b.avgReturn)\[0] || seasonalityData\[0];

\+    return \[...seasonalityData].sort((a, b) => (Number(a.avgReturn) || 0) - (Number(b.avgReturn) || 0))\[0] || seasonalityData\[0];

&#x20;  }, \[seasonalityData]);

&#x20;

&#x20;  const overallWinRate = useMemo(() => {

\-    const totalWin = seasonalityData.reduce((acc, m) => acc + m.winRate, 0);

\-    return (totalWin / (seasonalityData.length || 1)).toFixed(0);

\+    const valid = seasonalityData.filter(m => Number.isFinite(Number(m.winRate)));

\+    if (valid.length === 0) return 'N/A';

\+    const totalWin = valid.reduce((acc, m) => acc + Number(m.winRate), 0);

\+    return (totalWin / valid.length).toFixed(0);

&#x20;  }, \[seasonalityData]);

@@ -63,6 +72,11 @@

&#x20;          <h3 className="text-base font-bold text-white tracking-wide">NEPSE 10-Year Seasonality Analytics</h3>

&#x20;          <p className="text-xs text-slate-400">Historical monthly win-rates, median returns, and liquidity cycles (2015–2025).</p>

\+          {isStaticBaseline \&\& (

\+            <span className="inline-block mt-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-\[10px] font-bold text-amber-300">

\+              Static Historical Baseline (2015–2025) — Live API Offline

\+            </span>

\+          )}

&#x20;        </div>

@@ -76,10 +90,10 @@

&#x20;      {/\* Metric Cards \*/}

&#x20;      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">

\-        <StatCard label="Historical Best Month" value={calendarMode === 'BS' ? bestMonth.bsMonth : bestMonth.adMonth} subtitle={`+${bestMonth.avgReturn}% Avg Return (80% Win)`} color="#10b981" />

\-        <StatCard label="Historical Worst Month" value={calendarMode === 'BS' ? worstMonth.bsMonth : worstMonth.adMonth} subtitle={`${worstMonth.avgReturn}% Avg Return (Fiscal Year-End)`} color="#f43f5e" />

\+        <StatCard label="Historical Best Month" value={calendarMode === 'BS' ? bestMonth.bsMonth : bestMonth.adMonth} subtitle={`${Number(bestMonth.avgReturn) >= 0 ? '+' : ''}${Number(bestMonth.avgReturn || 0).toFixed(2)}% Avg Return (${bestMonth.winRate ?? '—'}% Win)`} color="#10b981" />

\+        <StatCard label="Historical Worst Month" value={calendarMode === 'BS' ? worstMonth.bsMonth : worstMonth.adMonth} subtitle={`${Number(worstMonth.avgReturn) >= 0 ? '+' : ''}${Number(worstMonth.avgReturn || 0).toFixed(2)}% Avg Return (${worstMonth.winRate ?? '—'}% Win)`} color="#f43f5e" />

&#x20;        <StatCard label="Bullish Months" value={`${seasonalityData.filter(m => (Number(m.avgReturn) || 0) >= 0).length} / ${seasonalityData.length || 12} Months`} subtitle="Positive Expectancy" color="#10b981" />

\-        <StatCard label="Avg Seasonal Win Rate" value={`${overallWinRate}%`} big color="#06b6d4" />

\+        <StatCard label="Avg Seasonal Win Rate" value={overallWinRate === 'N/A' ? 'N/A' : `${overallWinRate}%`} big color="#06b6d4" />

&#x20;      </div>

@@ -152,11 +166,11 @@

&#x20;            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">

&#x20;              <span className="text-\[10px] text-slate-400 block font-sans">YEARS GREEN</span>

\-              <span className="font-bold text-sm text-emerald-400">{selectedMonth.yearsUp} out of 10</span>

\+              <span className="font-bold text-sm text-emerald-400">{selectedMonth.yearsUp} out of {(Number(selectedMonth.yearsUp) || 0) + (Number(selectedMonth.yearsDown) || 0)}</span>

&#x20;            </div>

&#x20;            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">

&#x20;              <span className="text-\[10px] text-slate-400 block font-sans">YEARS RED</span>

\-              <span className="font-bold text-sm text-rose-400">{selectedMonth.yearsDown} out of 10</span>

\+              <span className="font-bold text-sm text-rose-400">{selectedMonth.yearsDown} out of {(Number(selectedMonth.yearsUp) || 0) + (Number(selectedMonth.yearsDown) || 0)}</span>

&#x20;            </div>

&#x20;          </div>

&#x20;        </div>



```
### 1. Audit Scope \& Files Inspected (Part 3)



\*\*Files Inspected in This Turn (1 file):\*\*



\* `src/components/StockDetailModal.jsx` (lines 1–\~2600; covers `StockEntryExitCard`, `CardLocalErrorBoundary`, `BeginnerConfidenceCard`, core modal state/effects/calculations, Tab 1 `Overview`, Tab 2 `Technicals`, and Tab 2B `Market Depth` up to the Broker Accumulation History Guide Banner; remaining tabs 3–13 are truncated for Part 4).







\*\*125+ Services Audit Coverage (Part 3):\*\*



\* \*\*0 new standalone `\*Service.tsx` files\*\* were in Part 3 (this part is the core 13-Tab `StockDetailModal.jsx` hub).





\* \*\*Cumulative total audited across Parts 1–3: 7 of 125+ services\*\* (plus `App.jsx`, `AiAnalyst.jsx`, `PredictorHub.jsx`, `LoginScreen.jsx`, and Part 1 of `StockDetailModal.jsx`).







\---



\### 2. Audit Findings Table (Continuing from `A2-036`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A2-036\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — `tickInterval` (\~lines 715–765), `handleTimeframeChange` (\~lines 1075–1110), `generateAi` (\~lines 1465–1495), `5D SWING` \& Header Refresh buttons (\~lines 1465, 1775) | (1) `tickInterval` overwrites `realBrokerAnalysis` with `1D` data every 10s even when user selected `5D`/`15D`/`30D`/`ALL`, and reads a stale `realFloorsheet` closure (`lastSeenId === ''`). (2) `handleTimeframeChange`, `generateAi`, `5D SWING`, and Header Refresh have no request sequence/symbol cancellation guard.



&#x20;| Switching from Stock A to Stock B mid-fetch leaks Stock A's 10-year chart, AI Guru report, or 5D broker data onto Stock B; during market hours, multi-day Broker Flow silently flips back to 1D every 10 seconds.



&#x20;| Add monotonic `historySeqRef` / `aiSeqRef` / `broker5DSeqRef` guards, track `brokerDays` and `realFloorsheet` via refs in `tickInterval`, and skip 1D broker polling when `brokerDays !== 1` or `brokerDate` is set. |

| \*\*A2-037\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — symbol-change `useEffect(\[d?.symbol])` (\~lines 975–985) \& tab-switch `useEffect` (\~lines 1035–1045) | (1) On mount, `useEffect(\[d?.symbol])` unconditionally runs `setHistoryFilterDate(''); setFloorsheetDate(''); setBrokerDate('');`, wiping out `initialEffectiveDate` while `modalSessionDate` retains the historical date. (2) Tab-switch `useEffect` checks `realBrokerAnalysis.tradingDays !== 1` and overwrites multi-day `realBrokerAnalysis` back to `1D` even when `brokerDays > 1`.



&#x20;| Opening a stock from a historical archive session mixes historical OHLCV with today's live floorsheet and broker trades; switching tabs silently resets a 30D broker analysis to 1D.



&#x20;| Preserve `initialEffectiveDate` when initializing/resetting date states on mount, and gate the 1D broker fetch in tab-switch `useEffect` on `brokerDays === 1`. |

| \*\*A2-038\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — `resolvedStock` (\~line 670), `d` (\~lines 770–885), `rawFundamentalsForHub` (\~line 1015) | (1) `resolvedStock` fabricates `ltp: 350, sector: 'Commercial Banks'`; `d` falls back to `100` when quotes are missing. (2) `d` ignores SQLite snake\_case columns (`eps\_ttm`, `book\_value\_per\_share`, `paid\_up\_capital`, `promoter\_share\_pct`, `public\_share\_pct` from `004\_upgrade\_fundamentals\_and\_lockin.sql`). (3) `rawFundamentalsForHub` defaults missing EPS/BVPS/promoter%/public% to `0`/`100`/`51`/`49`. (4) `liveTrades` ignores historical `sessionCandle.trades`.



&#x20;| Missing quotes render fake Rs. 350 / Rs. 100 prices; missing fundamentals silently default to `0` EPS and `51%/49%` ownership; historical sessions display today's trade count.



&#x20;| Remove fabricated `350`/`100` LTP defaults, map both camelCase and snake\_case fundamental columns, preserve `null` for unknown fundamentals in `rawFundamentalsForHub`, and use `sessionCandle.trades` when `sessionCandle` is active. |

| \*\*A2-039\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — `BeginnerConfidenceCard` (\~lines 405–465, 530–545) | (1) `grossBuyPct` falls back to `bcr5BuyPct` (Top 5 buyers) while `grossSellPct` falls back to `scr3SellPct`/`bcr3SellPct` (Top 3 sellers), then computes `nbar = grossBuyPct / grossSellPct` and `accumulationPressurePct = grossBuyPct / (grossBuyPct + grossSellPct)`. (2) Rupee Simulator defaults `ltp <= 0` to `100` and forces `kitta = Math.max(10, ...)` even when 10 shares exceed `selectedCapital`.



&#x20;| Comparing 5 buyers against 3 sellers systematically inflates buy pressure into false bullish "Big Players Accumulating" verdicts; high-priced stocks (e.g., UNL/BNT) quote Rs. 450,000+ purchases under a "Rs. 10,000" simulator pill.



&#x20;| Compare matched Top-3 vs Top-3 (`bcr3BuyPct` vs `bcr3SellPct`) or matched `grossBuyConcentrationPct` vs `grossSellConcentrationPct`, suppress simulator when `ltp <= 0`, and flag unaffordable minimum 10-kitta lots. |

| \*\*A2-040\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — `market\_depth` tab `liveDists`, `b5Dists`, `netDists` (\~lines 2124, 2324, 2500) | Copy-paste comparator bug in all 3 seller sorts: `.sort((a, b) => (a.netQty || (a.buyQty - a.sellQty)) - (b.netQty || (b.buyQty - a.sellQty)))` uses `a.sellQty` instead of `b.sellQty`.



&#x20;| Corrupts the #1 Distributing Broker (`topDist`), which directly feeds `topDistShareOfVol >= 15.0` and triggers false or missed `DO NOT BUY RIGHT NOW — ACTIVE INSTITUTIONAL DUMPING` verdicts.



&#x20;| Fix comparator in all 3 places using a helper `(row) => (row.netQty !== undefined ? Number(row.netQty) : (Number(row.buyQty |

| \*\*A2-041\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — `ad12M` (\~lines 1255, 1280–1295) \& `technicals` Wyckoff card (\~lines 1988–1996) | (1) `ad12M` checks `adRatio >= 1.05` / `<= 0.95` and computes `(adRatio - 1) \* 100`, but `adRatio` is signed `\[-1, +1]` centered at `0` (cross-checked with `AccumulationDistributionRadar.tsx` and line 1712 of `StockDetailModal.jsx`). (2) `technicals` Wyckoff card defaults null `ad12M` to `'Active Accumulation'` and `'Phase B (Institutional Absorption)'`.



&#x20;| Bullish `+0.25` `adRatio` renders as `-75.0% (Broker Outflow)` and neutral `0.0` renders as `-100.0% (Broker Outflow)`; missing broker data falsely displays bullish Wyckoff Accumulation.



&#x20;| Center `adRatio` thresholds at `0` (`>= 0.05` / `<= -0.05`, multiplying `adRatio \* 100`), remove the `350` LTP fallback, and display `'Data Pending'` when `ad12M` is null. |

| \*\*A2-042\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — `computePerformance`, `ad12M` CMF, `Overview`/`Technicals` oscillators, `piotroskiScore` (\~lines 975, 1265, 1358, 1650, 1890) | `adjustPricesForCorporateActions` is only applied inside `history12M` for `sma50`/`sma200`, while `computePerformance`, `ad12M` CMF, `RSI`/`MACD`/`Bollinger`/`ATR`, and `StockTechnicalGaugeCard` use unadjusted raw closes; `piotroskiScore` compares unadjusted `ltp` against adjusted `sma200Ref`.



&#x20;| Across bonus/rights book closures, unadjusted overnight price drops cause false `RSI < 30 (Oversold)`, false bearish MACD, inflated ATR stops, and fake -20% to -50% return chips.



&#x20;| Memoize `adjustedPriceHistory` once from `realPriceHistory` + `dividendHistory`, and feed it consistently to `computePerformance`, `ad12M` CMF, oscillators, `StockTechnicalGaugeCard`, and `history12M`. |

| \*\*A2-043\*\* | \*\*P0\*\* | `src/components/StockDetailModal.jsx` — `cachedPrime` (\~lines 910–925) \& `market\_depth` 5D Swing Radar (\~lines 2310–2420) | (1) `cachedPrime` reads `localStorage\['prime\_pick\_plan\_cache']` without checking `parsed.sessionDate === getDetailedMarketStatus().targetSessionDate` (mismatch with `PredictorHub.jsx`). (2) 5D Swing Radar renders a confident `"5-DAY NEUTRAL / BALANCED SWING REGIME (BCR₃ 0% vs SCR₃ 0%)"` card when `broker5DData` is null.



&#x20;| Stale Prime Pick targets from prior trading sessions override live `generateEntryExitPlan()` inside `StockDetailModal`; missing 5D broker feeds present as a verified "Balanced Swing Regime".



&#x20;| Validate `parsed.sessionDate === getDetailedMarketStatus().targetSessionDate` in `cachedPrime`, and render an explicit "5-Day Swing Data Unavailable" state when `!b5`. |

| \*\*A2-044\*\* | \*\*P1\*\* | `src/components/StockDetailModal.jsx` — `StockEntryExitCard` (\~lines 290–398), `Overview` Momentum Strip (\~lines 1650–1695), `Technicals` Oscillators (\~lines 1890–1960) | Null `t1Price`/`t2Price`/`slPrice`/`rrr1`/`entryHigh`/`bbBandwidth` are interpolated directly into template strings (`Rs. ${t1Price}`, `Width ${bbBandwidth}%`); missing RSI defaults to `50` (`Neutral Midline`); null MACD renders in red (`#f43f5e`).



&#x20;| Leaks `Rs.  (+%)`, `Width null%`, and ` : 1` in UI cards and fabricates an RSI of `50` on newly listed IPOs with `< 15` sessions.



&#x20;| Guard all nullable metric strings with `!= null` fallbacks (`—`), render `RSI` as `—` / `Insufficient Data` when `closes.length < 15`, and style null MACD neutral (`#94a3b8`). |

| \*\*A2-045\*\* | \*\*P1\*\* | `src/components/StockDetailModal.jsx` — Calculator reset `useEffect` (\~lines 1392–1399) | Effect depends on `\[d?.symbol, d?.ltp]` and resets `priceInput`, `waccInput`, `investorType`, and `holdingPeriod` whenever `d?.ltp` ticks.



&#x20;| Every 2.5s price tick during live market hours erases the investor's typed sell price, WACC, investor type, and holding period in the tax/profit calculator.



&#x20;| Depend only on `\[d?.symbol]` (plus a ref flag so initial `ltp` hydrates once per symbol without clobbering user edits). |

| \*\*A2-046\*\* | \*\*P1\*\* | `src/components/StockDetailModal.jsx` — `market\_depth` Live Refresh (\~line 2210), `liveAccums` (\~line 2278), `brokerAccumPeriod` `useEffect` (\~lines 1015–1035) | (1) `Live Refresh` calls `fetchMarketDepth(d.symbol)` without saving the result to `setRealMarketDepth`. (2) `brokerAccumPeriod` `useEffect` ignores `brokerDate`, so selecting a historical date in that card's `SessionDateDropdown` never updates `brokerAccumData`. (3) `liveAccums` renders `+-X sh` if a gross buyer has negative `netQty`.



&#x20;| Clicking Live Refresh never refreshes the order book; selecting a historical session date in Broker Accumulation History leaves stale aggregate numbers on screen; malformed `+-` quantities leak in UI.



&#x20;| Wire `setRealMarketDepth` with `depthSeqRef` on Live Refresh, include `brokerDate` in the `brokerAccumPeriod` effect and fetch options, and format signed `netKitta` cleanly (filtering `netQty > 0` for accumulators). |

| \*\*A2-047\*\* | \*\*P1\*\* | `src/components/StockDetailModal.jsx` — `Overview` General Information (\~lines 1572–1635) \& `market\_depth` Flow Bar (\~lines 2135–2140) | (1) Calls `Number(stockMetrics.marketCap).toLocaleString()` (plus `floatMarketCap`, `paidUpCapital`, `listedShares`) without finiteness checks -> renders `Rs. NaN` on missing fundamentals. (2) `liveBuyPct`/`liveSellPct` computes ratio of top net buyers vs top net sellers and labels it `"Live Bought"` vs `"Live Sold"` (forcing `50%/50%` under full broker list or violating zero-sum conservation).



&#x20;| Displays `Rs. NaN` in General Information and mislabels top-broker net concentration as total shares bought vs sold.



&#x20;| Guard all `stockMetrics` numeric formatters with `Number.isFinite(...) \&\& > 0 ? ... : '—'`, and relabel the bar as `"Top Net Accumulators vs Top Net Distributors"`. |

| \*\*A2-048\*\* | \*\*P2\*\* | `src/components/StockDetailModal.jsx` — `Valuation Metrics` (\~line 1835), `d` 52W H/L (\~line 805), `brokerAccumPeriod` staleness check (\~line 1021) | Missing `dividendYield` silently displays `0.00%`; 52W H/L slices tail of `realPriceHistory` without capping at `modalSessionDate`; `brokerAccumData.tradingDays !== days` stays permanently stale if SQLite holds fewer days than `days` (e.g., `42 < 60`).



&#x20;| Minor dividend display drift, historical 52W lookahead, and redundant refetching on long horizons.



&#x20;| Display `'—'` when dividend yield is null/undefined, cap 52W window at `modalSessionDate`, and track `requestedDays` on `brokerAccumData`. |

| \*\*A2-049\*\* | \*\*P3\*\* | `src/components/StockDetailModal.jsx` — `holdType` (\~line 1388) \& empty `useEffect` (\~line 1068) | Dead `holdType`/`setHoldType` state and empty no-op `useEffect` on `\[chartTimeframe, d?.symbol]`.



&#x20;| Minor code clutter.



&#x20;| Remove unused `holdType` state and empty `useEffect`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 \& P1 Bugs Only)



\#### `src/components/StockDetailModal.jsx` (Fixes `A2-036`, `A2-037`, `A2-038`, `A2-039`, `A2-040`, `A2-041`, `A2-042`, `A2-043`, `A2-044`, `A2-045`, `A2-046`, `A2-047`)



```diff

\--- a/src/components/StockDetailModal.jsx

+++ b/src/components/StockDetailModal.jsx

@@ -291,17 +291,17 @@

&#x20;          <div style={{

&#x20;            fontSize: 13,

&#x20;            fontWeight: 800,

&#x20;            color: isAvoid ? '#cbd5e1' : isHoldWait ? '#a7f3d0' : '#34d399',

&#x20;            fontFamily: 'var(--font-mono)',

&#x20;            marginTop: 2

&#x20;          }}>

\-            Rs. {t1Price} (+{t1GrossPct}%)

\+            {t1Price != null ? `Rs. ${fmt(t1Price)}${t1GrossPct != null ? ` (${t1GrossPct >= 0 ? '+' : ''}${t1GrossPct}%)` : ''}` : '—'}

&#x20;          </div>

&#x20;          <div style={{ fontSize: 12, fontWeight: 700, color: isAvoid ? '#94a3b8' : '#34d399', marginTop: 1 }}>

&#x20;            {isAvoid ? (

&#x20;              <span style={{ color: '#94a3b8', fontSize: 12 }}>Profit-Taking / Trim Resistance</span>

\-            ) : (

\-              <>Net: +{t1NetPct}% <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>(-7.5% CGT+fees)</span></>

\+            ) : t1NetPct != null ? (

\+              <>Net: {t1NetPct >= 0 ? '+' : ''}{t1NetPct}% <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>(-7.5% CGT+fees)</span></>

\+            ) : (

\+              <span style={{ color: '#64748b', fontSize: 12 }}>—</span>

&#x20;            )}

&#x20;          </div>

&#x20;        </div>

@@ -312,17 +312,17 @@

&#x20;          <div style={{

&#x20;            fontSize: 13,

&#x20;            fontWeight: 800,

&#x20;            color: isAvoid ? '#94a3b8' : '#a78bfa',

&#x20;            fontFamily: 'var(--font-mono)',

&#x20;            marginTop: 2

&#x20;          }}>

\-            Rs. {t2Price} (+{t2GrossPct}%)

\+            {t2Price != null ? `Rs. ${fmt(t2Price)}${t2GrossPct != null ? ` (${t2GrossPct >= 0 ? '+' : ''}${t2GrossPct}%)` : ''}` : '—'}

&#x20;          </div>

&#x20;          <div style={{ fontSize: 12, fontWeight: 700, color: isAvoid ? '#64748b' : '#c084fc', marginTop: 1 }}>

&#x20;            {isAvoid ? (

&#x20;              <span style={{ color: '#64748b', fontSize: 12 }}>Heavy Overhead Supply</span>

\-            ) : (

\-              <>Net: +{t2NetPct}% <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>(-7.5% CGT+fees)</span></>

\+            ) : t2NetPct != null ? (

\+              <>Net: {t2NetPct >= 0 ? '+' : ''}{t2NetPct}% <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>(-7.5% CGT+fees)</span></>

\+            ) : (

\+              <span style={{ color: '#64748b', fontSize: 12 }}>—</span>

&#x20;            )}

&#x20;          </div>

&#x20;        </div>

@@ -330,7 +330,7 @@

&#x20;        <div>

&#x20;          <div style={{ fontSize: 12, color: isAvoid ? '#f87171' : isExtremeValuation ? '#fbbf24' : '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>

&#x20;            {isExtremeValuation ? 'Trailing Stop (Floor)' : isAvoid ? 'Cut-Loss Floor (Exit)' : 'Stop Loss (Structural)'}

&#x20;          </div>

&#x20;          <div style={{ fontSize: 13, fontWeight: 800, color: isExtremeValuation ? '#fbbf24' : '#f87171', fontFamily: 'var(--font-mono)', marginTop: 2 }}>

\-            Rs. {slPrice} (-{slPct}%)

\+            {slPrice != null ? `Rs. ${fmt(slPrice)}${slPct != null ? ` (-${slPct}%)` : ''}` : '—'}

&#x20;          </div>

@@ -367,7 +367,7 @@

&#x20;          <div>

&#x20;            <span style={{ fontWeight: 800, color: '#f59e0b' }}>Confirmation Prerequisite: </span>

\-            This asset is in a consolidation phase (Score: {setupScore}/100{winRate != null ? `, Analog Win Rate: ${winRate}%` : ''}). Price must establish a confirmed high-volume close above Rs. {entryHigh} before entering fresh positions.

\+            This asset is in a consolidation phase (Score: {setupScore}/100{winRate != null ? `, Analog Win Rate: ${winRate}%` : ''}). {entryHigh != null ? `Price must establish a confirmed high-volume close above Rs. ${fmt(entryHigh)} before entering fresh positions.` : 'Await confirmed volume breakout before entering fresh positions.'}

&#x20;          </div>

@@ -395,7 +395,9 @@

&#x20;        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>

\-          <span>Risk:Reward: <strong style={{ color: '#38bdf8' }}>{entryExitPlan?.levels?.rrr1 != null ? entryExitPlan.levels.rrr1 : rrr1} : 1</strong></span>

\+          <span>Risk:Reward: <strong style={{ color: '#38bdf8' }}>

\+            {(entryExitPlan?.levels?.rrr1 ?? rrr1) != null ? `${entryExitPlan?.levels?.rrr1 ?? rrr1} : 1` : '—'}

\+          </strong></span>

@@ -406,27 +408,27 @@

&#x20;  const bcr3Buy = Number(realBrokerAnalysis?.bcr3BuyPct ?? brokerConcentration?.bcr3BuyPct ?? 0);

&#x20;  const bcr3Sell = Number(realBrokerAnalysis?.bcr3SellPct ?? brokerConcentration?.bcr3SellPct ?? 0);

\-  const grossBuyPct = Number(

\-    (isHistorySufficient ? multiDayDiag?.grossBuyConcentrationPct : null) ??

\-    realBrokerAnalysis?.grossBuyConcentrationPct ??

\-    realBrokerAnalysis?.bcr5BuyPct ??

\-    realBrokerAnalysis?.bcr3BuyPct ??

\-    multiDayDiag?.grossBuyConcentrationPct ??

\-    bcr3Buy ??

\-    0

\-  );

\-  const grossSellPct = Number(

\-    (isHistorySufficient ? multiDayDiag?.grossSellConcentrationPct : null) ??

\-    realBrokerAnalysis?.grossSellConcentrationPct ??

\-    realBrokerAnalysis?.scr3SellPct ??

\-    realBrokerAnalysis?.bcr3SellPct ??

\-    multiDayDiag?.grossSellConcentrationPct ??

\-    bcr3Sell ??

\-    0

\-  );

\+  // Strictly compare apples-to-apples broker cohorts (matched Top-N buy vs Top-N sell)

\+  const hasMatchedGross =

\+    (isHistorySufficient \&\& multiDayDiag?.grossBuyConcentrationPct != null \&\& multiDayDiag?.grossSellConcentrationPct != null) ||

\+    (realBrokerAnalysis?.grossBuyConcentrationPct != null \&\& realBrokerAnalysis?.grossSellConcentrationPct != null);

\+  const grossBuyPct = Number(

\+    hasMatchedGross

\+      ? ((isHistorySufficient ? multiDayDiag?.grossBuyConcentrationPct : null) ?? realBrokerAnalysis?.grossBuyConcentrationPct ?? 0)

\+      : (realBrokerAnalysis?.bcr3BuyPct ?? bcr3Buy ?? 0)

\+  );

\+  const grossSellPct = Number(

\+    hasMatchedGross

\+      ? ((isHistorySufficient ? multiDayDiag?.grossSellConcentrationPct : null) ?? realBrokerAnalysis?.grossSellConcentrationPct ?? 0)

\+      : (realBrokerAnalysis?.bcr3SellPct ?? realBrokerAnalysis?.scr3SellPct ?? bcr3Sell ?? 0)

\+  );

\+  const cohortLabel = hasMatchedGross ? 'Top institutional brokers' : 'Top 3 brokers';

&#x20;  const nbar = Number(realBrokerAnalysis?.nbar ?? (grossSellPct > 0 ? grossBuyPct / grossSellPct : 1.0));

@@ -463,7 +465,7 @@

&#x20;    } else if (isStrongAccumulation) {

&#x20;      check2Badge = '🟢 Big Players Accumulating';

\-      check2Desc = `Top 5 brokers absorbed ${grossBuyPct.toFixed(1)}% of all shares bought${whaleVwap ? ` at Big Broker VWAP of Rs. ${whaleVwap}` : ''} (Net absorption: ${bcr5Net}%).`;

\+      check2Desc = `${cohortLabel} absorbed ${grossBuyPct.toFixed(1)}% of buy volume vs ${grossSellPct.toFixed(1)}% sell concentration${whaleVwap ? ` at Big Broker VWAP of Rs. ${whaleVwap}` : ''}.`;

&#x20;      check2Color = '#10b981';

@@ -478,7 +480,7 @@

\-  const ltp = Number(d?.ltp || 100);

\+  const ltp = Number(d?.ltp || 0);

@@ -528,11 +530,13 @@

&#x20;  // Rupee Investment Simulator calculations

\-  const buyPrice = ltp > 0 ? ltp : 100;

\-  const kitta = Math.max(10, Math.floor(selectedCapital / (buyPrice \* 1.006)));

\+  const hasLiveLtp = Number.isFinite(ltp) \&\& ltp > 0;

\+  const buyPrice = hasLiveLtp ? ltp : 0;

\+  const rawAffordableKitta = buyPrice > 0 ? Math.floor(selectedCapital / (buyPrice \* 1.006)) : 0;

\+  const minLotExceedsCapital = buyPrice > 0 \&\& rawAffordableKitta < 10;

\+  const kitta = buyPrice > 0 ? Math.max(10, rawAffordableKitta) : 0;

&#x20;  const buyCalc = buyPrice > 0 ? (calculateBuyDetails(kitta, buyPrice) || { totalAmount: kitta \* buyPrice }) : { totalAmount: 0 };

@@ -668,14 +672,17 @@

&#x20;  const floorsheetSeqRef = useRef(0);

&#x20;  const brokerSeqRef = useRef(0);

&#x20;  const depthSeqRef = useRef(0);

&#x20;  const brokerAccumSeqRef = useRef(0);

&#x20;  const compareSeqRef = useRef(0);

\+  const historySeqRef = useRef(0);

\+  const aiSeqRef = useRef(0);

\+  const broker5DSeqRef = useRef(0);

\+  const brokerDaysRef = useRef(brokerDays);

\+  const brokerDateRef = useRef(brokerDate);

\+  const floorsheetRef = useRef(realFloorsheet);

\+  useEffect(() => { brokerDaysRef.current = brokerDays; }, \[brokerDays]);

\+  useEffect(() => { brokerDateRef.current = brokerDate; }, \[brokerDate]);

\+  useEffect(() => { floorsheetRef.current = realFloorsheet; }, \[realFloorsheet]);

@@ -684,12 +691,12 @@

&#x20;  const resolvedStock = useMemo(() => {

&#x20;    if (!stock) return null;

&#x20;    if (typeof stock === 'string') {

&#x20;      const found = allStocks.find(s => s \&\& s.symbol === stock.toUpperCase());

\-      return found || { symbol: stock.toUpperCase(), name: stock.toUpperCase(), ltp: 350, pChange: 0, sector: 'Commercial Banks' };

\+      return found || { symbol: stock.toUpperCase(), name: stock.toUpperCase(), ltp: 0, pChange: 0, sector: 'Others' };

&#x20;    }

&#x20;    if (typeof stock === 'object') {

&#x20;      const sym = (stock.symbol || stock.stockSymbol || stock.sym || stock.scrip || stock.ticker || stock.item?.symbol || stock.name || '').toUpperCase();

\-      if (!sym) return { symbol: 'STOCK', name: 'Stock Details', ltp: 350, pChange: 0, sector: 'Commercial Banks' };

\+      if (!sym) return { symbol: 'STOCK', name: 'Stock Details', ltp: 0, pChange: 0, sector: 'Others' };

@@ -750,15 +757,15 @@

\-          // Refresh live intraday broker execution data every 10 seconds ONLY during live active session when no past date is selected

\-          if (marketStatus.isOpen \&\& !brokerDate \&\& liveTickCount % 4 === 0) {

\+          // Refresh live intraday broker execution data every 10 seconds ONLY when viewing 1D live session

\+          if (marketStatus.isOpen \&\& !brokerDateRef.current \&\& brokerDaysRef.current === 1 \&\& liveTickCount % 4 === 0) {

&#x20;            fetchRealBrokerAnalysis(sym, 1, { refresh: true }).then(ba => {

\-              if (isMounted \&\& ba) setRealBrokerAnalysis(ba);

\+              if (isMounted \&\& ba \&\& brokerDaysRef.current === 1 \&\& !brokerDateRef.current) {

\+                setRealBrokerAnalysis(ba);

\+                setBroker1DData(ba);

\+              }

&#x20;            }).catch(() => {});

&#x20;          }

&#x20;

&#x20;          // Refresh live intraday floorsheet tape every 5 seconds ONLY during live active session when no past date is selected

&#x20;          if (marketStatus.isOpen \&\& !floorsheetDate \&\& liveTickCount % 2 === 0 \&\& (activeTab === 'floorsheet' || activeTab === 'market\_depth' || activeTab === 'depth\_broker' || showHubModal)) {

\-            const lastSeenId = realFloorsheet?.rows?.\[0]?.contractId || realFloorsheet?.rows?.\[0]?.contractNo || '';

\+            const lastSeenId = floorsheetRef.current?.rows?.\[0]?.contractId || floorsheetRef.current?.rows?.\[0]?.contractNo || '';

&#x20;            fetchRealFloorsheet(sym, '', 1, 500, { refresh: true, sinceContractId: lastSeenId }).then(fs => {

@@ -778,13 +785,13 @@

&#x20;  const d = useMemo(() => {

\-    const s = resolvedStock || { symbol: 'STOCK', name: 'Stock Details', ltp: 350, pChange: 0, sector: 'Commercial Banks' };

\+    const s = resolvedStock || { symbol: 'STOCK', name: 'Stock Details', ltp: 0, pChange: 0, sector: 'Others' };

&#x20;    

&#x20;    // Live exchange price from single-stock quote or active market feed (allStocks) ALWAYS takes absolute priority

&#x20;    const quoteLtp = Number(liveQuote?.ltp || liveQuote?.closePrice || 0);

&#x20;    const liveLtp = quoteLtp > 0 ? quoteLtp : Number(s.ltp || s.closePrice || s.latestPrice || s.price || 0);

&#x20;    let ltp = liveLtp > 0 ? liveLtp : Number(liveDetail?.closePrice || liveDetail?.marketPrice || 0);

&#x20;    if (ltp <= 0 \&\& Array.isArray(realPriceHistory) \&\& realPriceHistory.length > 0) {

&#x20;      ltp = Number(realPriceHistory\[realPriceHistory.length - 1]?.close || realPriceHistory\[0]?.close || 0);

&#x20;    }

&#x20;    if (ltp <= 0) {

\-      ltp = Number(s.prevClose || s.previousClose || s.high || 100);

\+      ltp = Number(s.prevClose || s.previousClose || s.high || 0);

&#x20;    }

@@ -835,28 +842,35 @@

&#x20;    const isRealEps = (val) => val !== undefined \&\& val !== null \&\& val !== '' \&\& !isNaN(Number(val)) \&\& Number(val) !== 0;

&#x20;    const isNegativeEps = (val) => val !== undefined \&\& val !== null \&\& !isNaN(Number(val)) \&\& Number(val) < 0;

&#x20;

\+    const liveEpsRaw = liveDetail?.eps ?? liveDetail?.eps\_ttm ?? liveDetail?.epsTtm;

\+    const stockEpsRaw = s.eps ?? s.eps\_ttm ?? s.epsTtm;

\+    const cachedEpsRaw = cachedFundObj?.eps ?? cachedFundObj?.eps\_ttm ?? cachedFundObj?.epsTtm;

&#x20;    let validEps = undefined;

\-    if (isRealEps(liveDetail?.eps)) validEps = Number(liveDetail.eps);

\-    else if (isRealEps(s.eps)) validEps = Number(s.eps);

\-    else if (isRealEps(cachedFundObj?.eps)) validEps = Number(cachedFundObj.eps);

\-    else if (isNegativeEps(liveDetail?.eps)) validEps = Number(liveDetail.eps);

\-    else if (isNegativeEps(s.eps)) validEps = Number(s.eps);

\-    else if (isNegativeEps(cachedFundObj?.eps)) validEps = Number(cachedFundObj.eps);

\+    if (isRealEps(liveEpsRaw)) validEps = Number(liveEpsRaw);

\+    else if (isRealEps(stockEpsRaw)) validEps = Number(stockEpsRaw);

\+    else if (isRealEps(cachedEpsRaw)) validEps = Number(cachedEpsRaw);

\+    else if (isNegativeEps(liveEpsRaw)) validEps = Number(liveEpsRaw);

\+    else if (isNegativeEps(stockEpsRaw)) validEps = Number(stockEpsRaw);

\+    else if (isNegativeEps(cachedEpsRaw)) validEps = Number(cachedEpsRaw);

&#x20;

&#x20;    const eps = validEps;

&#x20;

&#x20;    const isRealBv = (val) => val !== undefined \&\& val !== null \&\& val !== '' \&\& !isNaN(Number(val)) \&\& Number(val) > 0;

\+    const liveBvRaw = liveDetail?.bookValue ?? liveDetail?.bvps ?? liveDetail?.book\_value\_per\_share ?? liveDetail?.bookValuePerShare;

\+    const stockBvRaw = s.bookValue ?? s.bvps ?? s.bv ?? s.book\_value\_per\_share;

\+    const cachedBvRaw = cachedFundObj?.bookValue ?? cachedFundObj?.bvps ?? cachedFundObj?.book\_value\_per\_share;

&#x20;    let validBv = undefined;

\-    if (isRealBv(liveDetail?.bookValue || liveDetail?.bvps)) validBv = Number(liveDetail.bookValue || liveDetail.bvps);

\-    else if (isRealBv(s.bookValue || s.bvps || s.bv)) validBv = Number(s.bookValue || s.bvps || s.bv);

\-    else if (isRealBv(cachedFundObj?.bookValue || cachedFundObj?.bvps)) validBv = Number(cachedFundObj.bookValue || cachedFundObj.bvps);

\+    if (isRealBv(liveBvRaw)) validBv = Number(liveBvRaw);

\+    else if (isRealBv(stockBvRaw)) validBv = Number(stockBvRaw);

\+    else if (isRealBv(cachedBvRaw)) validBv = Number(cachedBvRaw);

&#x20;

&#x20;    const bookValue = validBv;

&#x20;

&#x20;    const liveTrades = sessionCandle

\+      ? (Number(sessionCandle.trades || 0) || undefined)

\+      : (Number(

&#x20;      liveQuote?.trades || liveQuote?.totalTransactions ||

&#x20;      s.trades || s.totalTrades || s.totalTransactions || s.transactions ||

&#x20;      liveDetail?.totalTransactions || liveDetail?.trades ||

&#x20;      (realFloorsheet?.totalElements || (Array.isArray(realFloorsheet?.rows) ? realFloorsheet.rows.length : 0)) ||

&#x20;      realBrokerAnalysis?.totalTransactions ||

&#x20;      latestHistCandle?.trades || 0

\-    ) || undefined;

\+    ) || undefined);

@@ -876,13 +890,13 @@

\-    const rawPromoterPct = liveDetail?.promoterPercentage ?? liveDetail?.promoterPct ??

\-      s.promoterPercentage ?? s.promoterPct ?? s.promoter\_pct;

\+    const rawPromoterPct = liveDetail?.promoterPercentage ?? liveDetail?.promoterPct ?? liveDetail?.promoter\_share\_pct ??

\+      s.promoterPercentage ?? s.promoterPct ?? s.promoter\_pct ?? s.promoter\_share\_pct ?? s.promoterHolding;

&#x20;    const hasPromoterData = rawPromoterPct !== undefined \&\& rawPromoterPct !== null \&\& !isNaN(Number(rawPromoterPct));

&#x20;    const promoterPercentage = hasPromoterData ? Number(rawPromoterPct) : null;

&#x20;

\-    const rawPublicPct = liveDetail?.publicPercentage ?? liveDetail?.publicFloatPct ?? liveDetail?.publicPct ??

\-      s.publicPercentage ?? s.publicFloatPct ?? s.publicPct ?? s.public\_pct;

\+    const rawPublicPct = liveDetail?.publicPercentage ?? liveDetail?.publicFloatPct ?? liveDetail?.publicPct ?? liveDetail?.public\_share\_pct ??

\+      s.publicPercentage ?? s.publicFloatPct ?? s.publicPct ?? s.public\_pct ?? s.public\_share\_pct;

@@ -915,10 +929,12 @@

&#x20;        if (item) {

&#x20;          const parsed = JSON.parse(item);

\+          const expectedSession = getDetailedMarketStatus().targetSessionDate;

&#x20;          const plan = parsed?.plan || parsed;

&#x20;          const symbol = parsed?.symbol || plan?.symbol;

\-          if (symbol \&\& plan) {

\+          const cachedSession = parsed?.sessionDate || plan?.sessionDate;

\+          if (symbol \&\& plan \&\& (!cachedSession || cachedSession === expectedSession)) {

&#x20;            return { symbol: String(symbol).toUpperCase().trim(), plan };

&#x20;          }

&#x20;        }

@@ -980,8 +996,17 @@

\-  // Helper: compute performance return for N days using real price history

\+  // Corporate-action-adjusted price history shared by returns, CMF, and oscillators

\+  const adjustedPriceHistory = useMemo(() => {

\+    const baseHist = (realPriceHistory \&\& realPriceHistory.length > 0) ? realPriceHistory : (history || \[]);

\+    if (!baseHist.length) return \[];

\+    const corpActions = dividendHistory?.dividends || dividendHistory?.actions || \[];

\+    return corpActions.length > 0 ? adjustPricesForCorporateActions(baseHist, corpActions) : baseHist;

\+  }, \[realPriceHistory, history, dividendHistory]);

\+

\+  // Helper: compute performance return for N days using corporate-action-adjusted history

&#x20;  const computePerformance = useCallback((days) => {

\-    const hist = realPriceHistory;

\+    const hist = adjustedPriceHistory;

&#x20;    if (!hist || hist.length < 2) return null;

&#x20;    const latest = hist\[hist.length - 1]?.close;

&#x20;    const idx = Math.max(0, hist.length - 1 - days);

&#x20;    const past = hist\[idx]?.close;

&#x20;    if (!latest || !past || past === 0) return null;

&#x20;    const pct = ((latest - past) / past) \* 100;

&#x20;    return { pct: Number(pct.toFixed(2)), bull: pct >= 0 };

\-  }, \[realPriceHistory]);

\+  }, \[adjustedPriceHistory]);

@@ -1068,12 +1093,14 @@

\+    const preservedHistDate = (typeof stock === 'object' \&\& stock?.isHistoricalSession)

\+      ? (propSelectedDate || propSessionDate || propDate || stock?.sessionDate || stock?.businessDate || stock?.date || '')

\+      : '';

&#x20;    setAiResult('');

\-    setHistoryFilterDate('');

\-    setFloorsheetDate('');

\+    setHistoryFilterDate(preservedHistDate);

\+    setFloorsheetDate(preservedHistDate);

&#x20;    setFloorsheetBuyerInput('');

&#x20;    setFloorsheetSellerInput('');

&#x20;    setFloorsheetAppliedBuyer('');

&#x20;    setFloorsheetAppliedSeller('');

\-    setBrokerDate('');

\+    setBrokerDate(preservedHistDate);

@@ -1158,10 +1185,10 @@

&#x20;  const rawFundamentalsForHub = useMemo(() => {

&#x20;    return {

&#x20;      symbol: d?.symbol,

&#x20;      sector: (d?.sector \&\& d?.sector !== 'Unknown') ? d.sector : (liveDetail?.sector || 'Others'),

\-      epsTtm: Number(d?.eps ?? liveDetail?.eps ?? 0),

\-      bookValuePerShare: Number(d?.bookValue ?? liveDetail?.bookValue ?? 100),

\-      paidUpCapital: Number(d?.paidUpCapital ?? liveDetail?.paidUpCapital ?? (d?.listedShares ? d.listedShares \* 100 : 0)),

\-      promoterSharePct: Number(d?.promoterPercentage ?? liveDetail?.promoterPercentage ?? 51),

\-      publicSharePct: Number(d?.publicPercentage ?? liveDetail?.publicPercentage ?? 49),

\+      epsTtm: d?.eps ?? liveDetail?.eps ?? liveDetail?.eps\_ttm ?? null,

\+      bookValuePerShare: d?.bookValue ?? liveDetail?.bookValue ?? liveDetail?.book\_value\_per\_share ?? null,

\+      paidUpCapital: d?.paidUpCapital ?? liveDetail?.paidUpCapital ?? liveDetail?.paid\_up\_capital ?? (d?.listedShares ? d.listedShares \* 100 : null),

\+      promoterSharePct: d?.promoterPercentage ?? liveDetail?.promoterPercentage ?? liveDetail?.promoter\_share\_pct ?? null,

\+      publicSharePct: d?.publicPercentage ?? liveDetail?.publicPercentage ?? liveDetail?.public\_share\_pct ?? null,

&#x20;      fiscalQuarter: d?.quarter || liveDetail?.quarter || 'Q4 2082/83',

&#x20;      ...liveDetail,

&#x20;    };

&#x20;  }, \[d, liveDetail]);

@@ -1177,20 +1204,22 @@

&#x20;    const days = daysMap\[brokerAccumPeriod] || brokerDays || 5;

\-    const isStale = !brokerAccumData || brokerAccumData.tradingDays !== days;

\+    const targetDate = brokerDate || '';

\+    const isStale = !brokerAccumData || brokerAccumData.\_requestedDays !== days || (brokerAccumData.\_requestedDate || '') !== targetDate;

&#x20;    if (isStale) {

&#x20;      setBrokerAccumLoading(true);

\-      fetchRealBrokerAnalysis(d.symbol, days, { refresh: false })

\+      fetchRealBrokerAnalysis(d.symbol, targetDate ? 1 : days, { date: targetDate || undefined, refresh: false })

&#x20;        .then(data => {

&#x20;          if (active \&\& seq === brokerAccumSeqRef.current \&\& data) {

\-            setBrokerAccumData(data);

\+            setBrokerAccumData({ ...data, \_requestedDays: days, \_requestedDate: targetDate });

&#x20;          }

&#x20;        })

&#x20;        .catch(() => {})

&#x20;        .finally(() => { if (active \&\& seq === brokerAccumSeqRef.current) setBrokerAccumLoading(false); });

&#x20;    }

&#x20;    return () => { active = false; };

\-  }, \[activeTab, brokerAccumPeriod, d?.symbol]);

\+  }, \[activeTab, brokerAccumPeriod, brokerDate, d?.symbol]);

@@ -1202,9 +1231,9 @@

\-      // Ensure 1D live broker analysis is always loaded for today's live session

\-      if ((!realBrokerAnalysis || realBrokerAnalysis.tradingDays !== 1) \&\& !brokerAnalysisLoading) {

\+      // Ensure 1D live broker analysis is loaded only when user is on 1D horizon

\+      if (brokerDays === 1 \&\& (!realBrokerAnalysis || realBrokerAnalysis.tradingDays !== 1) \&\& !brokerAnalysisLoading) {

&#x20;        fetchBrokerAnalysisData(1, brokerDate || modalSessionDate || '');

&#x20;      }

@@ -1263,11 +1292,13 @@

&#x20;  const handleTimeframeChange = async (tf) => {

&#x20;    triggerHaptic(25);

&#x20;    setChartTimeframe(tf);

&#x20;    if (!d?.symbol) return;

\+    const reqSym = d.symbol;

\+    const hSeq = ++historySeqRef.current;

&#x20;

&#x20;    if (tf === '1D') {

&#x20;      return; // ShareHubChart autonomously switches to intraday ticks

&#x20;    } else if (tf === '2Y' || tf === 'ALL' || tf === 'MAX') {

&#x20;      const daysNeeded = tf === '2Y' ? 730 : 3650;

&#x20;      // If we don't already have enough data, fetch more from the proxy

&#x20;      if (!realPriceHistory || realPriceHistory.length < (daysNeeded > 1000 ? 550 : 300)) {

&#x20;        try {

\-          const fullHistory = await fetchRealPriceHistory(d.symbol, daysNeeded);

\+          const fullHistory = await fetchRealPriceHistory(reqSym, daysNeeded);

\+          if (historySeqRef.current !== hSeq) return;

&#x20;          if (fullHistory \&\& fullHistory.length > 0) {

@@ -1370,15 +1401,15 @@

&#x20;  const ad12M = useMemo(() => {

&#x20;    if (realBrokerAnalysis) {

\-      const topNetB = (realBrokerAnalysis.topNetBuyers || \[]).reduce((s, b) => s + (b.netAmt || (b.netQty \* (d.ltp || 350))), 0);

\-      const topNetS = (realBrokerAnalysis.topNetSellers || \[]).reduce((s, b) => s + Math.abs(b.netAmt || (b.netQty \* (d.ltp || 350))), 0);

\+      const refPrice = Number(d?.ltp || 0);

\+      const topNetB = (realBrokerAnalysis.topNetBuyers || \[]).reduce((s, b) => s + (b.netAmt || (refPrice > 0 ? b.netQty \* refPrice : 0)), 0);

\+      const topNetS = (realBrokerAnalysis.topNetSellers || \[]).reduce((s, b) => s + Math.abs(b.netAmt || (refPrice > 0 ? b.netQty \* refPrice : 0)), 0);

@@ -1387,8 +1418,8 @@

&#x20;      let cmfValue = 0;

&#x20;      let hasCmf = false;

\-      if (Array.isArray(realPriceHistory) \&\& realPriceHistory.length >= 20) {

\-        const slice20 = realPriceHistory.slice(-20);

\+      if (Array.isArray(adjustedPriceHistory) \&\& adjustedPriceHistory.length >= 20) {

\+        const slice20 = adjustedPriceHistory.slice(-20);

@@ -1410,12 +1441,12 @@

&#x20;            : (Number.isFinite(realBrokerAnalysis?.adRatio)

\-                ? (realBrokerAnalysis.adRatio >= 1.05

\-                    ? `+${((realBrokerAnalysis.adRatio - 1) \* 100).toFixed(1)}% (Broker Net Inflow)`

\-                    : realBrokerAnalysis.adRatio <= 0.95

\-                        ? `-${((1 - realBrokerAnalysis.adRatio) \* 100).toFixed(1)}% (Broker Outflow)`

\+                ? (realBrokerAnalysis.adRatio >= 0.05

\+                    ? `+${(realBrokerAnalysis.adRatio \* 100).toFixed(1)}% (Broker Net Inflow)`

\+                    : realBrokerAnalysis.adRatio <= -0.05

\+                        ? `${(realBrokerAnalysis.adRatio \* 100).toFixed(1)}% (Broker Outflow)`

&#x20;                        : '0.0% (Neutral Flow)')

&#x20;                : '0.0% (Neutral Flow)'));

@@ -1512,13 +1543,21 @@

\+  const calcInitializedSymRef = useRef('');

&#x20;  useEffect(() => {

\-    if (d?.ltp > 0) {

\+    if (!d?.symbol) return;

\+    if (calcInitializedSymRef.current !== d.symbol) {

\+      calcInitializedSymRef.current = d.symbol;

\+      if (d?.ltp > 0) {

\+        setPriceInput(String(d.ltp));

\+        setWaccInput(String(Number(d.ltp \* 0.92).toFixed(1)));

\+      }

\+      setInvestorType('INDIVIDUAL');

\+      setHoldingPeriod('SHORT\_TERM');

\+    } else if (!priceInput \&\& d?.ltp > 0) {

&#x20;      setPriceInput(String(d.ltp));

&#x20;      setWaccInput(String(Number(d.ltp \* 0.92).toFixed(1)));

&#x20;    }

\-    setInvestorType('INDIVIDUAL');

\-    setHoldingPeriod('SHORT\_TERM');

\-  }, \[d?.symbol, d?.ltp]);

\+  }, \[d?.symbol, d?.ltp, priceInput]);

@@ -1590,10 +1629,12 @@

&#x20;  const generateAi = async () => {

\+    const seq = ++aiSeqRef.current;

\+    const reqSym = d?.symbol;

&#x20;    setAiLoading(true);

&#x20;    setAiResult('');

&#x20;    try {

&#x20;      const assessment = await runAiQuantitativeAssessment({

@@ -1614,16 +1655,18 @@

&#x20;        realPriceHistory,

&#x20;        realBrokerAnalysis

&#x20;      });

\+      if (aiSeqRef.current !== seq || d?.symbol !== reqSym) return;

&#x20;      const textOut = res?.report || res?.text;

&#x20;      if (textOut) {

&#x20;        setAiResult(textOut);

&#x20;      } else {

&#x20;        setAiResult(generateOfflineStockReport(d, null, realPriceHistory, realBrokerAnalysis));

&#x20;      }

&#x20;    } catch (\_) {

\+      if (aiSeqRef.current !== seq || d?.symbol !== reqSym) return;

&#x20;      setAiResult(generateOfflineStockReport(d, null, realPriceHistory, realBrokerAnalysis));

&#x20;    }

\-    setAiLoading(false);

\+    if (aiSeqRef.current === seq) setAiLoading(false);

&#x20;  };

@@ -1832,19 +1875,19 @@

&#x20;                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>

&#x20;                    <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Market Cap</span>

&#x20;                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>

\-                      Rs. {Number(stockMetrics.marketCap).toLocaleString()}

\+                      {Number.isFinite(Number(stockMetrics.marketCap)) \&\& Number(stockMetrics.marketCap) > 0 ? `Rs. ${Number(stockMetrics.marketCap).toLocaleString()}` : '—'}

&#x20;                    </span>

&#x20;                  </div>

&#x20;                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>

&#x20;                    <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Float Market Cap</span>

&#x20;                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>

\-                      Rs. {Number(stockMetrics.floatMarketCap).toLocaleString()}

\+                      {Number.isFinite(Number(stockMetrics.floatMarketCap)) \&\& Number(stockMetrics.floatMarketCap) > 0 ? `Rs. ${Number(stockMetrics.floatMarketCap).toLocaleString()}` : '—'}

&#x20;                    </span>

&#x20;                  </div>

&#x20;                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>

&#x20;                    <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Paid Up Cap</span>

&#x20;                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>

\-                      Rs. {Number(stockMetrics.paidUpCapital).toLocaleString()}

\+                      {Number.isFinite(Number(stockMetrics.paidUpCapital)) \&\& Number(stockMetrics.paidUpCapital) > 0 ? `Rs. ${Number(stockMetrics.paidUpCapital).toLocaleString()}` : '—'}

&#x20;                    </span>

&#x20;                  </div>

@@ -1910,13 +1953,13 @@

&#x20;              {(() => {

\-                const closes = (realPriceHistory \&\& realPriceHistory.length >= 15)

\-                  ? realPriceHistory.map(c => Number(c.close || c.ltp || 0)).filter(Boolean)

\-                  : (history \&\& history.length >= 15 ? history.map(c => Number(c.close || c.ltp || 0)).filter(Boolean) : \[]);

\+                const closes = adjustedPriceHistory.length >= 15

\+                  ? adjustedPriceHistory.map(c => Number(c.close || c.ltp || 0)).filter(Boolean)

\+                  : \[];

&#x20;                

&#x20;                let rsiVal = entryExitPlan?.technical?.momentum?.rsi14 ?? d?.rsi;

&#x20;                if (rsiVal == null \&\& closes.length >= 15) rsiVal = calculateRSI(closes, 14);

\-                const rsi = rsiVal != null ? Number(Number(rsiVal).toFixed(1)) : 50;

\-                const rsiColor = rsi < 30 ? '#10b981' : rsi > 70 ? '#f43f5e' : '#38bdf8';

\+                const rsi = rsiVal != null \&\& Number.isFinite(Number(rsiVal)) ? Number(Number(rsiVal).toFixed(1)) : null;

\+                const rsiColor = rsi == null ? '#94a3b8' : rsi < 30 ? '#10b981' : rsi > 70 ? '#f43f5e' : '#38bdf8';

@@ -1940,11 +1983,11 @@

&#x20;                      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 8px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.06)' }}>

&#x20;                        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>RSI (14)</div>

&#x20;                        <div style={{ fontSize: 15, fontWeight: 800, color: rsiColor, fontFamily: 'var(--font-mono)', marginTop: 4 }}>

\-                          {rsi}

\+                          {rsi != null ? rsi : '—'}

&#x20;                        </div>

&#x20;                        <div style={{ fontSize: 12, color: rsiColor, marginTop: 2, fontWeight: 600 }}>

\-                          {rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral'}

\+                          {rsi == null ? 'Pending' : rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral'}

&#x20;                        </div>

&#x20;                      </div>

&#x20;

&#x20;                      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 8px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.06)' }}>

&#x20;                        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>MACD Hist</div>

\-                        <div style={{ fontSize: 15, fontWeight: 800, color: (macdHist != null \&\& macdHist >= 0) ? '#10b981' : '#f43f5e', fontFamily: 'var(--font-mono)', marginTop: 4 }}>

\+                        <div style={{ fontSize: 15, fontWeight: 800, color: macdHist == null ? '#94a3b8' : macdHist >= 0 ? '#10b981' : '#f43f5e', fontFamily: 'var(--font-mono)', marginTop: 4 }}>

&#x20;                          {macdHist != null ? (macdHist > 0 ? `+${macdHist}` : `${macdHist}`) : '—'}

&#x20;                        </div>

\-                        <div style={{ fontSize: 12, color: (macdHist != null \&\& macdHist >= 0) ? '#10b981' : '#f43f5e', marginTop: 2, fontWeight: 600 }}>

\+                        <div style={{ fontSize: 12, color: macdHist == null ? '#94a3b8' : macdHist >= 0 ? '#10b981' : '#f43f5e', marginTop: 2, fontWeight: 600 }}>

&#x20;                          {macdHist != null ? (macdHist >= 0 ? 'Bullish' : 'Bearish') : 'Pending'}

&#x20;                        </div>

&#x20;                      </div>

@@ -2110,13 +2153,15 @@

&#x20;                      <button

&#x20;                        type="button"

&#x20;                        onClick={() => {

&#x20;                          setOverviewBrokerTapeMode('5D\_SWING');

&#x20;                          if (!broker5DData \&\& !broker5DLoading) {

\+                            const b5Seq = ++broker5DSeqRef.current;

&#x20;                            setBroker5DLoading(true);

&#x20;                            fetchRealBrokerAnalysis(d.symbol, 5, { refresh: false })

\-                              .then(b5 => { if (b5) setBroker5DData(b5); })

\+                              .then(b5 => { if (broker5DSeqRef.current === b5Seq \&\& b5) setBroker5DData(b5); })

&#x20;                              .catch(() => {})

\-                              .finally(() => setBroker5DLoading(false));

\+                              .finally(() => { if (broker5DSeqRef.current === b5Seq) setBroker5DLoading(false); });

&#x20;                          }

&#x20;                        }}

@@ -2255,15 +2300,15 @@

&#x20;              const t = entryExitPlan?.technical;

\-              const closes = (realPriceHistory \&\& realPriceHistory.length >= 15)

\-                ? realPriceHistory.map(c => Number(c.close || c.ltp || 0)).filter(Boolean)

\-                : (history \&\& history.length >= 15 ? history.map(c => Number(c.close || c.ltp || 0)).filter(Boolean) : \[]);

\+              const closes = adjustedPriceHistory.length >= 15

\+                ? adjustedPriceHistory.map(c => Number(c.close || c.ltp || 0)).filter(Boolean)

\+                : \[];

&#x20;

&#x20;              // RSI 14

&#x20;              let rsiVal = t?.momentum?.rsi14 ?? d?.rsi;

&#x20;              if (rsiVal == null \&\& closes.length >= 15) {

&#x20;                rsiVal = calculateRSI(closes, 14);

&#x20;              }

\-              const rsi = rsiVal != null ? Number(Number(rsiVal).toFixed(1)) : 50;

\-              const rsiStatus = rsi < 30 ? { label: 'Oversold Dip (Rebound Zone)', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' }

\+              const rsi = rsiVal != null \&\& Number.isFinite(Number(rsiVal)) ? Number(Number(rsiVal).toFixed(1)) : null;

\+              const rsiStatus = rsi == null ? { label: 'Insufficient Data (<15d)', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' }

\+                : rsi < 30 ? { label: 'Oversold Dip (Rebound Zone)', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' }

@@ -2315,7 +2360,7 @@

&#x20;                      <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>

\-                        {rsi} <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>/ 100</span>

\+                        {rsi != null ? <>{rsi} <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>/ 100</span></> : '—'}

&#x20;                      </div>

&#x20;                      {/\* RSI Visual Bar \*/}

&#x20;                      <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 4, margin: '6px 0', overflow: 'hidden', position: 'relative' }}>

\-                        <div style={{ width: `${Math.min(100, Math.max(0, rsi))}%`, height: '100%', background: rsiStatus.color, borderRadius: 4 }} />

\+                        <div style={{ width: `${rsi != null ? Math.min(100, Math.max(0, rsi)) : 0}%`, height: '100%', background: rsiStatus.color, borderRadius: 4 }} />

&#x20;                      </div>

@@ -2351,7 +2396,7 @@

&#x20;                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>

&#x20;                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>Bollinger Bands (20, 2σ)</span>

&#x20;                        <span style={{ fontSize: 12, fontWeight: 800, color: isSqueeze ? '#2dd4bf' : '#94a3b8', background: isSqueeze ? 'rgba(45, 212, 191, 0.15)' : 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4 }}>

\-                          {isSqueeze ? '⚡ Volatility Squeeze' : `Width ${bbBandwidth}%`}

\+                          {isSqueeze ? '⚡ Volatility Squeeze' : (bbBandwidth != null ? `Width ${bbBandwidth}%` : 'Insufficient Data')}

&#x20;                        </span>

&#x20;                      </div>

@@ -2390,19 +2435,19 @@

&#x20;                <span style={{

&#x20;                  background: 'rgba(16, 185, 129, 0.15)',

&#x20;                  border: '1px solid rgba(16, 185, 129, 0.4)',

\-                  color: '#10B981',

\+                  color: ad12M ? '#10B981' : '#94a3b8',

&#x20;                  padding: '2px 8px',

&#x20;                  borderRadius: 6,

&#x20;                  fontSize: 12,

&#x20;                  fontWeight: 800

&#x20;                }}>

\-                  {ad12M?.status || 'Active Accumulation'}

\+                  {ad12M?.status || 'Data Pending'}

&#x20;                </span>

&#x20;              </div>

&#x20;

&#x20;              <div style={{ background: 'rgba(255,255,255,0.025)', borderRadius: 10, padding: 10, marginBottom: 10 }}>

&#x20;                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Wyckoff Cycle Stage</div>

&#x20;                <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>

\-                  {ad12M?.wyckoffPhase || 'Phase B (Institutional Absorption)'}

\+                  {ad12M?.wyckoffPhase || 'Awaiting Broker Flow Data'}

&#x20;                </div>

&#x20;                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>

\-                  {ad12M?.phaseDescription || 'Smart money absorbing float across weekly dips.'}

\+                  {ad12M?.phaseDescription || 'Wyckoff phase will compute once floorsheet broker data loads.'}

&#x20;                </div>

&#x20;              </div>

@@ -2495,12 +2540,14 @@

\+          const getSignedNetQty = (row) => (row?.netQty !== undefined ? Number(row.netQty) : (Number(row?.buyQty || 0) - Number(row?.sellQty || 0)));

&#x20;          // Top Distributors (Net Sellers) for Live / 1D session

&#x20;          const liveDists = (

&#x20;            (Array.isArray(pure1DBa?.topDistributors) \&\& pure1DBa.topDistributors.length > 0) ? pure1DBa.topDistributors :

&#x20;            (Array.isArray(pure1DBa?.topNetSellers) \&\& pure1DBa.topNetSellers.length > 0) ? pure1DBa.topNetSellers :

&#x20;            (Array.isArray(liveBc?.topNetDistributors) \&\& liveBc.topNetDistributors.length > 0) ? liveBc.topNetDistributors :

&#x20;            (Array.isArray(pure1DBa?.topNetDistributors) \&\& pure1DBa.topNetDistributors.length > 0) ? pure1DBa.topNetDistributors :

\-            (Array.isArray(pure1DBa?.brokers) \&\& pure1DBa.brokers.length > 0) ? pure1DBa.brokers.filter(b => (b.netQty !== undefined ? b.netQty : (b.buyQty - b.sellQty)) < 0).sort((a, b) => (a.netQty || (a.buyQty - a.sellQty)) - (b.netQty || (b.buyQty - a.sellQty))) :

\+            (Array.isArray(pure1DBa?.brokers) \&\& pure1DBa.brokers.length > 0) ? pure1DBa.brokers.filter(b => getSignedNetQty(b) < 0).sort((a, b) => getSignedNetQty(a) - getSignedNetQty(b)) :

&#x20;            (Array.isArray(liveBc?.topSellerBrokers) \&\& liveBc.topSellerBrokers.length > 0) ? liveBc.topSellerBrokers :

&#x20;            (Array.isArray(pure1DBa?.topSellers) \&\& pure1DBa.topSellers.length > 0) ? pure1DBa.topSellers : \[]

&#x20;          );

@@ -2610,10 +2657,14 @@

&#x20;                      onClick={() => {

&#x20;                        triggerHaptic(25);

\-                        fetchMarketDepth(d.symbol);

\+                        const dSeq = ++depthSeqRef.current;

\+                        setMarketDepthLoading(true);

\+                        fetchMarketDepth(d.symbol, modalSessionDate)

\+                          .then(depth => { if (depthSeqRef.current === dSeq \&\& depth) setRealMarketDepth(depth); })

\+                          .catch(() => {})

\+                          .finally(() => { if (depthSeqRef.current === dSeq) setMarketDepthLoading(false); });

&#x20;                        fetchBrokerAnalysisData(1, '', { refresh: true });

&#x20;                        fetchFloorsheetData(1, { refresh: true });

\-                        fetchRealBrokerAnalysis(d.symbol, 5, { refresh: true }).then(b5 => { if (b5) setBroker5DData(b5); });

\+                        const b5Seq = ++broker5DSeqRef.current;

\+                        fetchRealBrokerAnalysis(d.symbol, 5, { refresh: true }).then(b5 => { if (broker5DSeqRef.current === b5Seq \&\& b5) setBroker5DData(b5); }).catch(() => {});

&#x20;                      }}

@@ -2701,10 +2752,10 @@

&#x20;                <div>

&#x20;                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>

&#x20;                    <span style={{ color: '#10b981' }}>

\-                      🟢 Live Bought: {liveNetBuyShares > 0 ? liveNetBuyShares.toLocaleString() : 'Active'} shs ({liveBuyPct}%)

\+                      🟢 Top Net Accumulators: {liveNetBuyShares > 0 ? `+${liveNetBuyShares.toLocaleString()}` : '0'} shs ({liveBuyPct}%)

&#x20;                    </span>

&#x20;                    <span style={{ color: '#f43f5e' }}>

\-                      🔴 Live Sold: {liveNetSellShares > 0 ? liveNetSellShares.toLocaleString() : 'Active'} shs ({liveSellPct}%)

\+                      🔴 Top Net Distributors: {liveNetSellShares > 0 ? `-${liveNetSellShares.toLocaleString()}` : '0'} shs ({liveSellPct}%)

&#x20;                    </span>

&#x20;                  </div>

@@ -2740,7 +2791,7 @@

&#x20;                      const netKitta = Number(b.netQty !== undefined ? b.netQty : (buyQty - (b.sellQty || 0)));

&#x20;                      const avgRate = Number(b.avgBuyRate || (b.buyAmt \&\& buyQty ? (b.buyAmt / buyQty) : 0));

&#x20;                      return (

&#x20;                        <div key={idx} style={{ padding: '6px 0', borderBottom: idx < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>

&#x20;                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>

&#x20;                            <span style={{ fontWeight: 800, color: '#e2e8f0', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`#${id} ${bName}`}>

&#x20;                              <strong style={{ color: '#10b981', marginRight: 4 }}>#{id}</strong> {bName}

&#x20;                            </span>

&#x20;                            <span style={{ color: '#10b981', fontWeight: 900, fontFamily: 'var(--font-mono)' }}>

\-                              +{netKitta.toLocaleString()} sh

\+                              {netKitta >= 0 ? `+${netKitta.toLocaleString()}` : netKitta.toLocaleString()} sh

&#x20;                            </span>

&#x20;                          </div>

@@ -2825,6 +2876,14 @@

&#x20;                  );

&#x20;                }

&#x20;

\+                if (!b5) {

\+                  return (

\+                    <div style={{ background: '#111827', border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 16, padding: '16px 18px', fontSize: 12, color: '#94a3b8' }}>

\+                      5-Day institutional swing broker data is currently unavailable for {d.symbol}. Click Live Refresh to retry.

\+                    </div>

\+                  );

\+                }

\+

&#x20;                const b5Accums = (

@@ -2838,7 +2897,7 @@

&#x20;                const b5Dists = (

&#x20;                  (Array.isArray(b5?.topDistributors) \&\& b5.topDistributors.length > 0) ? b5.topDistributors :

&#x20;                  (Array.isArray(b5?.topNetSellers) \&\& b5.topNetSellers.length > 0) ? b5.topNetSellers :

\-                  (Array.isArray(b5?.brokers) \&\& b5.brokers.length > 0) ? b5.brokers.filter(b => (b.netQty !== undefined ? b.netQty : (b.buyQty - b.sellQty)) < 0).sort((a, b) => (a.netQty || (a.buyQty - a.sellQty)) - (b.netQty || (b.buyQty - a.sellQty))) : \[]

\+                  (Array.isArray(b5?.brokers) \&\& b5.brokers.length > 0) ? b5.brokers.filter(b => getSignedNetQty(b) < 0).sort((a, b) => getSignedNetQty(a) - getSignedNetQty(b)) : \[]

&#x20;                );

@@ -3125,7 +3184,7 @@

&#x20;              const netDists = (

&#x20;                (Array.isArray(ba?.topDistributors) \&\& ba.topDistributors.length > 0) ? ba.topDistributors :

&#x20;                (Array.isArray(ba?.topNetSellers) \&\& ba.topNetSellers.length > 0) ? ba.topNetSellers :

&#x20;                (Array.isArray(bc?.topNetDistributors) \&\& bc.topNetDistributors.length > 0) ? bc.topNetDistributors :

&#x20;                (Array.isArray(ba?.topNetDistributors) \&\& ba.topNetDistributors.length > 0) ? ba.topNetDistributors :

\-                (Array.isArray(ba?.brokers) \&\& ba.brokers.length > 0) ? ba.brokers.filter(b => (b.netQty !== undefined ? b.netQty : (b.buyQty - b.sellQty)) < 0).sort((a, b) => (a.netQty || (a.buyQty - a.sellQty)) - (b.netQty || (b.buyQty - a.sellQty))) :

\+                (Array.isArray(ba?.brokers) \&\& ba.brokers.length > 0) ? ba.brokers.filter(b => getSignedNetQty(b) < 0).sort((a, b) => getSignedNetQty(a) - getSignedNetQty(b)) :

&#x20;                (Array.isArray(ba?.topSellers) \&\& ba.topSellers.length > 0) ? ba.topSellers :

&#x20;                (Array.isArray(bc?.topSellerBrokers) \&\& bc.topSellerBrokers.length > 0) ? bc.topSellerBrokers : \[]

&#x20;              );



```



---
Add-AuditClip "acc2-quant-services.md"
