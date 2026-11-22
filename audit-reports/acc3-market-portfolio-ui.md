\### 1. Files Inspected in This Turn



From `00-SHARED-CONTRACT.txt`:



\* `package.json`





\* `src\\App.jsx`





\* `src\\constants\\marketRules.js`





\* `src\\db\\migrations\\002\_upgrade\_signal\_ledger.sql`





\* `src\\main.jsx`





\* `src\\package.json`





\* `src\\types\\aiGuru.ts`





\* `src\\types\\floorsheetHub.ts`





\* `src\\types\\stockTelemetry.ts`





\* `migrations\\003\_upgrade\_floorsheet\_hub.sql`





\* `migrations\\004\_upgrade\_fundamentals\_and\_lockin.sql`





\* `proxy\\migrations\\001\_prediction\_engine.sql`







From `03-ACCOUNT3-MARKET-PORTFOLIO-UI-PART1.txt`:



\* `src\\components\\AccountManager.jsx`





\* `src\\components\\AdvancedChartModal.jsx`





\* `src\\components\\AlphaCommandCenter.tsx`





\* `src\\components\\analyzer\\BreakoutPanel.tsx`





\* `src\\components\\analyzer\\DataQualityPanel.tsx`





\* `src\\components\\analyzer\\EntryRiskCard.tsx`





\* `src\\components\\analyzer\\EvidencePanel.tsx`





\* `src\\components\\analyzer\\FestivalSeasonalityCard.tsx`





\* `src\\components\\analyzer\\GrahamSafetyCard.tsx`





\* `src\\components\\analyzer\\HistoricalAnalogPanel.tsx`





\* `src\\components\\analyzer\\OneClickAlphaButton.jsx`





\* `src\\components\\analyzer\\SetupScoreCard.tsx`





\* `src\\components\\analyzer\\StrategyTrackRecord.tsx`





\* `src\\components\\analyzer\\SupportResistancePanel.tsx`





\* `src\\components\\analyzer\\WhatNextPanel.tsx`





\* `src\\components\\BatteryOptimizationModal.tsx`





\* `src\\components\\BookClosureAlert.jsx`





\* `src\\components\\BreakoutAlertDialog.jsx`





\* `src\\components\\Calculator.jsx`





\* `src\\components\\calculators.tsx` \*(partial — attachment truncated mid-file inside `MarginLoanCalculator` at `Rs. {result.approvedLoan.toLoc...`)\*







> \*\*Attachment Truncation Notice:\*\* `03-ACCOUNT3-MARKET-PORTFOLIO-UI-PART1.txt` was truncated inside `src\\components\\calculators.tsx`. Files alphabetically after `calculators.tsx` (including `Dashboard.jsx`, `IPOList.jsx`, `MeroShareHub.jsx`, `Portfolio.jsx`, `PortfolioHub.jsx`, `WaccTaxCalculator.jsx`, `src\\views\\\*`, `src\\context\\\*`, and `src\\hooks\\\*`) were not present in this turn's payload. Split remaining files into \~350 KB chunks for the next turn so nothing gets truncated.

> 

> 



\---



\### 2. Audit Findings Table



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-001\*\* | \*\*P0\*\* | `src/constants/marketRules.js` (`CAPITAL\_GAINS\_TAX`, `calculateCgt`, `getMarketRulesAuditInventory`)



&#x20;| Hardcodes outdated individual CGT rates (`7.5%` / `0.075` short-term $\\le 365\\text{d}$ and `5.0%` / `0.05` long-term $> 365\\text{d}$).



&#x20;| Overstates capital gains tax by 50% on short-term gains (7.5% vs 5.0%) and 33% on long-term gains (5.0% vs 3.75%) across every engine importing canonical rules, distorting net return and R:R decisions.



&#x20;| Update `CAPITAL\_GAINS\_TAX` to `5.0%` (`0.05`) short-term ($\\le 365\\text{d}$), `3.75%` (`0.0375`) long-term ($> 365\\text{d}$), and `10.0%` (`0.10`) corporate, and update audit inventory text. |

| \*\*A3-002\*\* | \*\*P0\*\* | `src/components/calculators.tsx` (`BrokerageCalculator` -> `runCalc` \& JSX)



&#x20;| Hardcodes outdated CGT decimals (`0.075` short-term, `0.05` long-term) and labels inside the SEBON Brokerage \& CGT Calculator.



&#x20;| Investors calculating real rupee take-home proceeds see wrong CGT deductions and understated net profit/ROI.



&#x20;| Change `cgtRate` to `0.05` (short-term), `0.0375` (long-term), `0.10` (institutional) and update `InfoBanner` and `<option>` text. |

| \*\*A3-003\*\* | \*\*P0\*\* | `src/components/AlphaCommandCenter.tsx`, `src/components/analyzer/OneClickAlphaButton.jsx`, `src/components/analyzer/EntryRiskCard.tsx`, `src/components/analyzer/HistoricalAnalogPanel.tsx`, `src/components/Calculator.jsx`



&#x20;| Outdated `7.5%` / `5.0%` CGT defaults and UI labels are hardcoded across five separate execution/calculator components (`AlphaCommandCenter` defaults `cgtRate = 0.075` and lacks `3.75%` LT mode; `OneClickAlphaButton` passes `cgtRate: 0.075`; `EntryRiskCard`, `HistoricalAnalogPanel`, and `Calculator` display `7.5%` / `5.0%`).



&#x20;| Execution tickets, maximized ladder profits, and net P\&L calculators use obsolete tax rates, misleading investors on net profit hurdles.



&#x20;| Default `cgtRate` to `0.05`, add `0.0375` long-term option to `CGT\_MODES`, and update all CGT UI labels to `5.0%` ($\\le 365\\text{d}$) and `3.75%` ($> 365\\text{d}$). |

| \*\*A3-004\*\* | \*\*P0\*\* | `src/components/calculators.tsx` (`BonusAdjustmentCalculator` -> `runCalc`)



&#x20;| Computes `adjustedWacc = (s \* w) / totalShares`, assigning \*\*Rs. 0\*\* cost basis to bonus shares.



&#x20;| Violates Nepal CDSC/IRD WACC law (bonus shares carry \*\*Rs. 100 par value\*\* in WACC). Artificially lowers WACC, overstates taxable capital gains, and causes wrong tax/break-even planning.



&#x20;| Change formula to `const adjustedWacc = ((s \* w) + (bonusShares \* 100)) / totalShares;` and prevent `parseFloat(f.shares) |

| \*\*A3-005\*\* | \*\*P0\*\* | `src/components/Calculator.jsx` (`adjustmentResult` in Tab 4 `adjustment`)



&#x20;| Reads `const currentWacc = parseFloat(buyWacc) |  | p0;` from Tab 2 (`sell`, default `250`) even though Tab 4 has no Current WACC input field.



&#x20;|

| \*\*A3-006\*\* | \*\*P0\*\* | `src/components/AccountManager.jsx` (`handleSyncAccountPortfolio`)



&#x20;| Preserves previous WACC whenever `h.isCustomWacc |  | h.waccSource === 'CUSTOM\_USER\_SET' |

| \*\*A3-007\*\* | \*\*P0\*\* | `src/App.jsx` (`synchronizedSelectedStock` `useMemo`)



&#x20;| Merges `{ ...liveMatch, ...baseObj, name: ..., ltp: ... }` with stale `baseObj` spreading \*after\* fresh `liveMatch`.



&#x20;| While a Stock Detail Modal is open during live trading, `ltp` updates from ticks while `change`, `pChange`, `volume`, `turnover`, `high`, and `low` stay frozen at the stale snapshot values.



&#x20;| Reverse spread order to `{ ...baseObj, ...liveMatch }` while explicitly preserving navigation flags (`initialTab`, `isHistoricalSession`, `sessionDate`). |

| \*\*A3-008\*\* | \*\*P0\*\* | `src/App.jsx` (`lastSyncTime` state \& Header status badge)



&#x20;| Initializes `lastSyncTime` to `useState(new Date())` before any live fetch succeeds and renders a pulsing green `Market Open` badge alongside `Updated: <clock> NPT` even when `apiStatus` is `'offline'` or `'yesterday'`.



&#x20;| Investors on offline/broken feeds see a green pulsing `Market Open` indicator with a current timestamp next to yesterday's cached prices.



&#x20;| Initialize `lastSyncTime` from `getLastMarketSyncTime() |

| \*\*A3-009\*\* | \*\*P0\*\* | `src/App.jsx` (`btn-cloud-sync-now` `onClick` handler)



&#x20;| Reads raw `nepse\_hub\_${uid}\_profiles` and `nepse\_hub\_bulk\_ipo\_accounts` from `localStorage`, uploads `mergedProfs` and `localBulk` to `syncUserDataToCloud` \*\*without stripping `password`, `crn`, `pin`, or `transactionPin\*\*`, and overwrites the encrypted vault key with plaintext JSON.



&#x20;| Leaks raw MeroShare login passwords, CRNs, and 4-digit ASBA transaction PINs to cloud sync AND corrupts the AES-256-GCM encrypted local profile vault.



&#x20;| Use `loadEncryptedUserProfiles(uid)` and `saveEncryptedUserProfiles(mergedProfs, uid)`, and strip all credential fields (`password`, `crn`, `pin`, `transactionPin`, `vaultEnvelope`) before calling `syncUserDataToCloud`. |

| \*\*A3-010\*\* | \*\*P0\*\* | `src/components/analyzer/EntryRiskCard.tsx` (Position Sizing \& Target 1 Net Profit)



&#x20;| (1) Approximates broker rate using `portfolioCapital <= 150000 ? 0.0036 : 0.0033` instead of the 5-tier SEBON slab on actual order value. (2) Clamps `rawPriceRisk = Math.max(0.5, entryPx - stopPx)` when `stopPx >= entryPx`. (3) Falls back to gross gain (`price - entryPx`) or invented `+8%` (`entryPx \* 0.08`) for `target1NetGainRupees`.



&#x20;| (1) Misprices commission across slabs. (2) If live LTP falls below stop-loss, `rawPriceRisk` collapses to Rs. 0.50 and recommends \*\*maximum 25% portfolio allocation\*\* on an already-invalidated trade. (3) Displays gross or fabricated +8% profit under a "Net of CGT \& fees" label.



&#x20;| Import `calculateBrokerCommission` from `marketRules.js` on actual order value; clamp `finalShares = 0` when `entryPx <= stopPx`; compute real net Target 1 gain via `calculateNetProfit` (no fabricated `+8%`). |

| \*\*A3-011\*\* | \*\*P0\*\* | `src/components/calculators.tsx` (`GrahamValuation` -> `handleStockSelect` \& `useEffect`)



&#x20;| Async `fetchStockFundamentals(cleanSym)` has no request-sequence or `AbortController` guard; `useEffect` also depends on `stocks.length`.



&#x20;| Rapidly switching stocks lets a slower response for Stock A overwrite Stock B's EPS, BVPS, LTP, and Graham Fair Value (cross-ticker display leak); live updates to `stocks.length` wipe manual user edits.



&#x20;| Track an incrementing `requestIdRef` in `handleStockSelect` to discard stale responses, and run auto-fill `useEffect` only on `initialSymbol` / initial mount. |

| \*\*A3-012\*\* | \*\*P0\*\* | `src/constants/marketRules.js` (`calculateRoundTripNetReturn`)



&#x20;| `totalFrictionNpr` sums `buyCommission + buySebonFee + sellCommission + sellSebonFee + dpFee + cgt`, omitting `buyDpFee` (Rs. 25) that was added to `totalBuyCost`.



&#x20;| Reported total friction is Rs. 25 lower than `grossProfitNpr - netProfitNpr`, breaking accounting reconciliation in strategy/backtest reports.



&#x20;| Add `buyDpFee` to `totalFrictionNpr` and remove the unused `totalFriction` variable. |

| \*\*A3-013\*\* | \*\*P1\*\* | `src/App.jsx` (`tickFastIndex` `useEffect`)



&#x20;| Both `visibilitychange` and `focus` listeners call `tickFastIndex()` without clearing the pending `tickerTimer` or guarding in-flight calls.



&#x20;| Every time the user returns to the app/tab, 2 new permanent `setTimeout` polling loops spawn concurrently—causing exponential API request storms, battery drain, and UI stutter.



&#x20;| Clear `tickerTimer` inside `tickFastIndex` before scheduling and guard with an `inFlight` boolean ref. |

| \*\*A3-014\*\* | \*\*P1\*\* | `src/App.jsx` (`fetchMarket`, `triggerTick`, Capacitor `appStateChange`)



&#x20;| `fetchMarket` reads stale `stocks` instead of `liveStocksRef.current`; Capacitor `appStateChange` binds `triggerTick` with `\[]` deps (stale closure); `triggerTick` falls back to hardcoded historical index `2629.82`.



&#x20;| Mobile resume polls with stale `marketStatus`/`stocks`; if index API fails, `NEPSE Index` change and `%` are fabricated against an outdated constant `2629.82`.



&#x20;| Read `liveStocksRef.current` in `fetchMarket` and `triggerTick`, invoke `triggerTick` through a latest-ref on app resume, and remove the hardcoded `2629.82` fallback. |

| \*\*A3-015\*\* | \*\*P1\*\* | `src/components/AccountManager.jsx` (`handleAddAccount`)



&#x20;| Replaces any existing BOID entry with `holdings: \[]` before `handleSyncAccountPortfolio` runs.



&#x20;| Updating a password/CRN for an existing family Demat account permanently wipes its synced holdings and custom WACCs if CDSC is temporarily unreachable.



&#x20;| Preserve `existingAccount.holdings` and `existingAccount.lastSyncedAt` when updating a matching BOID. |

| \*\*A3-016\*\* | \*\*P1\*\* | `src/components/BreakoutAlertDialog.jsx` (Price trigger delta display)



&#x20;| Computes `(((Number(breakoutPrice) - ltp) / ltp) \* 100).toFixed(1)` with no `ltp > 0` check.



&#x20;| Displays `Infinity% to trigger` or `NaN% to trigger` when opened before live LTP loads or on a zero-price stock.



&#x20;| Guard with `ltp > 0 ? ... : 'LTP unavailable'`. |

| \*\*A3-017\*\* | \*\*P1\*\* | `src/components/Calculator.jsx` (`breakEvenResult` `useMemo`)



&#x20;| Binary search sets `high = buyWacc \* 2 + 50`.



&#x20;| For small quantities (e.g., 1–5 shares where fixed DP Rs. 50 + min brokerage Rs. 20 exceed `buyWacc + 50`), the search ceiling is below true break-even and reports a money-losing target price.



&#x20;| Compute dynamic upper bound `high = Math.max(buyWacc \* 2 + 50, ((buyWacc \* sellQty) + 250) / sellQty) \* 1.25`. |

| \*\*A3-018\*\* | \*\*P1\*\* | `src/components/calculators.tsx` (`RightAdjustmentCalculator` -> `parseRatio`, `DividendCalculator` -> `runCalc`)



&#x20;| `parseRatio` flips `a:b` to `b/a` only if `a > b \&\& a >= 5`, turning `4:1` (25% right) into `4.0` (400%) and `2:1` into `2.0` (200%). `DividendCalculator` omits 5% tax on bonus par value and values bonus yield at unadjusted pre-bonus `pr`.



&#x20;| Investors calculate wildly wrong ex-rights prices/subscription costs for 2:1, 3:1, or 4:1 rights, and see overstated dividend yields missing bonus tax liability.



&#x20;| Parse explicit `existing:right` (`b / a`) consistently (documenting format clearly) and deduct 5% bonus par-value tax while computing bonus yield at ex-bonus adjusted price. |

| \*\*A3-019\*\* | \*\*P1\*\* | `src/components/analyzer/EntryRiskCard.tsx` (`scaleOutShares` \& `useEffect` on `entryPx`)



&#x20;| `scaleOutShares` splits a 10-kitta position into `5` + `5` (odd lots cannot trade in NEPSE regular continuous session). `useEffect` resets user-edited `calcSellPrice` and `calcShares` whenever `entryPx` ticks.



&#x20;| Advises unexecutable 5-share orders on 10-kitta trades, and wipes user inputs in the Net P\&L Calculator every 2.5 seconds during live trading.



&#x20;| When `finalShares < 20`, recommend exiting all `finalShares` at Target 1 (no odd-lot split); only initialize `calcSellPrice`/`calcShares` when calculator opens (`showNetCalc`), not on every tick. |

| \*\*A3-020\*\* | \*\*P1\*\* | `src/components/analyzer/GrahamSafetyCard.tsx` (Early return \& TS props)



&#x20;| Returns early on `eps <= 0` at line 61, making the entire `isLossMaking` / `grahamFloor` (`2/3 BVPS`) block unreachable dead code; accesses `fundamentals?.bvps` which is missing from `GrahamSafetyCardProps`.



&#x20;| Loss-making companies with verified positive BVPS never show their Graham Liquidation Asset Floor, and TypeScript strict builds fail on `fundamentals?.bvps`.



&#x20;| Add `bvps?: number` to `GrahamSafetyCardProps` and only trigger the early-return block when `eps === null |

| \*\*A3-021\*\* | \*\*P2\*\* | `src/components/AlphaCommandCenter.tsx` (`scanTimestamp`)



&#x20;| Uses `new Date().toLocaleTimeString('en-US', ...)` without `timeZone: 'Asia/Kathmandu'`.



&#x20;| Shows non-Nepal local clock times to overseas Nepali investors or UTC machines, causing confusion around 11:00–15:00 NPT market sessions.



&#x20;| Pass `timeZone: 'Asia/Kathmandu'` and append `NPT`. |

| \*\*A3-022\*\* | \*\*P2\*\* | `src/components/AdvancedChartModal.jsx` (Header badge sign logic)



&#x20;| Uses `isBull = change >= 0`, rendering green styling on `0.00` unchanged scrips and malformed `▲ +0.00 (+-0.50%)` if `change === 0` while `pChange < 0`.



&#x20;| Unchanged stocks appear artificially bullish in green; partial payloads render double signs `+-`.



&#x20;| Derive direction from `change !== 0 ? change : pChange`, use neutral slate styling when `=== 0`, and use `Math.abs(pChange)` after the sign prefix. |

| \*\*A3-023\*\* | \*\*P2\*\* | `src/constants/marketRules.js` (`getMarketRulesAuditInventory`)



&#x20;| Lists `'Index Two/Three-Tier Circuit Breakers (4%, 5%, 6%)'`, contradicting `CIRCUIT\_LIMITS` (`5.0%` and `8.0%`) in the same file.



&#x20;| Compliance/diagnostics view displays outdated circuit breaker percentages that conflict with the engine's actual rules.



&#x20;| Update the audit inventory description to `'Index Two-Tier Circuit Breakers (5%, 8%)'`. |

| \*\*A3-024\*\* | \*\*P2\*\* | `src/components/analyzer/SetupScoreCard.tsx` (`empiricalWin` \& `EV` card)



&#x20;| Heuristic `rawWin < 1.0 \&\& rawWin > 0 ? rawWin \* 100 : rawWin` misreads any genuine `< 1%` win rate as `100x` larger, and `EV` shows `Rs.` without stating the assumed trade capital.



&#x20;| Investors cannot tell whether `EV: +Rs. 1,500` applies to Rs. 10k or Rs. 10L capital, and sub-1% win rates display inflated by 100x.



&#x20;| Standardize win-rate input scale (0–100) without ambiguous `< 1` multiplication, and display the assumed capital basis under `EV`. |

| \*\*A3-025\*\* | \*\*P2\*\* | `src/components/analyzer/FestivalSeasonalityCard.tsx`, `src/App.jsx`, `src/components/analyzer/GrahamSafetyCard.tsx`



&#x20;| Hardcodes `'2083 BS'` fallback in seasonality badges and `'२८ भाद्र २०८३'` fallback in calendar modal; `GrahamSafetyCard` lacks a filing date / staleness badge.



&#x20;| Stale hardcoded Bikram Sambat dates appear during fallback states, and investors cannot see how old EPS/BVPS filings are.



&#x20;| Remove hardcoded 2083 BS fallback date strings and display `fiscalQuarter` / `updatedAt` freshness metadata on `GrahamSafetyCard`. |

| \*\*A3-026\*\* | \*\*P3\*\* | `src/components/Calculator.jsx` (`marginLtv` \& `riskPercent` inputs)



&#x20;| Clamping `Math.max(10, ...)` inside `onChange` snaps cleared input back to `10`, making it hard to type custom LTVs; `riskPercent` allows up to `10%` without flagging `CANONICAL\_RISK\_LIMITS.hardPortfolioRiskCapPct` (`2.5%`).



&#x20;| Frustrating numeric input behavior and missing guardrail warning when setting high per-trade risk.



&#x20;| Clamp `marginLtv` on `onBlur` (or allow empty string during typing) and show an inline warning when `riskPercent > 2.5`. |

| \*\*A3-027\*\* | \*\*P3\*\* | `src/components/AlphaCommandCenter.tsx`, `src/components/BreakoutAlertDialog.jsx`



&#x20;| Bare `setTimeout` calls (`handleTriggerScan`, `handleCopyTmsTicket`, `handleSimulateT2Order`, `handleSave`) are not cleared on component unmount.



&#x20;| Potential late callbacks (e.g., double `onClose()`) if user closes modals quickly.



&#x20;| Store timeout IDs in refs and clear them in a cleanup `useEffect`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/constants/marketRules.js` (Fixes `A3-001`, `A3-012`)







```diff

\--- a/src/constants/marketRules.js

+++ b/src/constants/marketRules.js

@@ -106,15 +106,15 @@ export const STATUTORY\_CHARGES = Object.freeze({

&#x20;// 6. CAPITAL GAINS TAX (CGT)

&#x20;export const CAPITAL\_GAINS\_TAX = Object.freeze({

\-  individualShortTermRatePct: 7.5, // Held <= 365 days

\-  individualShortTermDecimal: 0.075,

\-  individualLongTermRatePct: 5.0, // Held > 365 days

\-  individualLongTermDecimal: 0.05,

\+  individualShortTermRatePct: 5.0, // Held <= 365 days (effective 22 Sept 2026 / 31 Bhadra 2083)

\+  individualShortTermDecimal: 0.05,

\+  individualLongTermRatePct: 3.75, // Held > 365 days (effective 22 Sept 2026 / 31 Bhadra 2083)

\+  individualLongTermDecimal: 0.0375,

&#x20;  corporateResidentRatePct: 10.0,

&#x20;  corporateResidentDecimal: 0.10,

&#x20;  nonResidentRatePct: 25.0,

&#x20;  nonResidentDecimal: 0.25,

&#x20;  shortTermThresholdDays: 365,

&#x20;  status: 'VERIFIED',

\-  citation: 'Inland Revenue Department (IRD) \& Income Tax Act 2058 (as amended by Finance Acts)'

\+  citation: 'Inland Revenue Department (IRD) \& Nepal Gazette 31 Bhadra 2083 (effective 22 Sept 2026: 5.0% ST <=365d, 3.75% LT >365d, 10.0% Corporate)'

&#x20;});

@@ -312,8 +312,7 @@ export function calculateRoundTripNetReturn({

&#x20;  const finalNetProfit = profitBeforeTax - cgt;

&#x20;

&#x20;  const grossProfit = grossSellValue - grossBuyValue;

\-  const totalFriction = totalBuyCost + (grossSellValue - netSellProceedsBeforeTax) + cgt - (grossBuyValue + (grossSellValue - grossSellValue)); // Total fee drag

\-

\+  const totalFrictionNpr = +(buyCommission + buySebonFee + buyDpFee + sellCommission + sellSebonFee + dpFee + cgt).toFixed(2);

&#x20;  const grossReturnPct = +((grossProfit / grossBuyValue) \* 100).toFixed(2);

&#x20;  const netReturnPct = +((finalNetProfit / totalBuyCost) \* 100).toFixed(2);

&#x20;  const frictionCostPct = +((grossReturnPct - netReturnPct)).toFixed(2);

@@ -327,7 +326,7 @@ export function calculateRoundTripNetReturn({

&#x20;    netProfitNpr: +finalNetProfit.toFixed(2),

&#x20;    grossReturnPct,

&#x20;    netReturnPct,

\-    totalFrictionNpr: +(buyCommission + buySebonFee + sellCommission + sellSebonFee + dpFee + cgt).toFixed(2),

\+    totalFrictionNpr,

&#x20;    cgtDeductedNpr: cgt,

&#x20;    frictionCostPct

&#x20;  };

@@ -387,7 +386,7 @@ export function getMarketRulesAuditInventory() {

&#x20;      isVerified: true

&#x20;    },

&#x20;    {

\-      rule: 'Capital Gains Tax (7.5% Short-Term, 5.0% Long-Term, 10.0% Corporate)',

\+      rule: 'Capital Gains Tax (5.0% Short-Term <=365d, 3.75% Long-Term >365d, 10.0% Corporate)',

&#x20;      status: CAPITAL\_GAINS\_TAX.status,

&#x20;      citation: CAPITAL\_GAINS\_TAX.citation,

&#x20;      isVerified: true



```



\---



\#### `src/App.jsx` (Fixes `A3-007`, `A3-008`, `A3-009`, `A3-013`, `A3-014`)







```diff

\--- a/src/App.jsx

+++ b/src/App.jsx

@@ -66,10 +66,14 @@ function AppInner() {

&#x20;  const \[showDiagnostics, setShowDiagnostics] = useState(false);

&#x20;  const \[marketTrend, setMarketTrend] = useState('flat');

&#x20;  const \[isRefreshing, setIsRefreshing] = useState(false);

\-  const \[lastSyncTime, setLastSyncTime] = useState(new Date());

\+  const \[lastSyncTime, setLastSyncTime] = useState(() => {

\+    const cachedTs = typeof getLastMarketSyncTime === 'function' ? getLastMarketSyncTime() : null;

\+    return cachedTs ? new Date(cachedTs) : null;

\+  });

&#x20;

&#x20;  const formattedSyncTime = useMemo(() => {

\-    const d = lastSyncTime ? new Date(lastSyncTime) : new Date();

\+    if (!lastSyncTime) return '';

\+    const d = new Date(lastSyncTime);

&#x20;    try {

&#x20;      return new Intl.DateTimeFormat('en-US', {

&#x20;        timeZone: 'Asia/Kathmandu',

@@ -521,7 +525,7 @@ function AppInner() {

&#x20;          isPreOpen = Boolean(status.isPreOpen);

&#x20;        }

&#x20;

\-        let currentStocks = stocks;

\+        let currentStocks = liveStocksRef.current;

&#x20;        let hasFreshData = false;

&#x20;

&#x20;        const pStatus = fetchMarketStatus().catch(() => null);

@@ -653,8 +657,12 @@ function AppInner() {

&#x20;    let isMounted = true;

&#x20;    let tickerTimer = null;

&#x20;    let consecutiveErrors = 0;

\+    let inFlight = false;

&#x20;

&#x20;    const tickFastIndex = async () => {

\+      if (!isMounted || inFlight) return;

\+      if (tickerTimer) { clearTimeout(tickerTimer); tickerTimer = null; }

\+      inFlight = true;

&#x20;      const status = getDetailedMarketStatus();

&#x20;      try {

&#x20;        const liveIdx = await fetchMarketIndices();

@@ -674,6 +682,8 @@ function AppInner() {

&#x20;        }

&#x20;      } catch (\_) {

&#x20;        consecutiveErrors++;

\+      } finally {

\+        inFlight = false;

&#x20;      }

&#x20;

&#x20;      if (!isMounted) return;

@@ -706,10 +716,11 @@ function AppInner() {

&#x20;    } catch (\_) {}

&#x20;  }, \[activeTab]);

&#x20;

\+  const triggerTickRef = useRef(null);

&#x20;  const triggerTick = async () => {

&#x20;    setIsRefreshing(true);

&#x20;    try {

\-      let currentStocks = stocks;

\+      let currentStocks = liveStocksRef.current;

&#x20;      let hasFreshData = false;

&#x20;

&#x20;      const pStatus = fetchMarketStatus().catch(() => null);

@@ -774,8 +785,8 @@ function AppInner() {

&#x20;          const liveVal = Number(latestTick?.close || latestTick?.value || 0);

&#x20;          if (liveVal > 0) {

&#x20;            setIndices(prev => {

\-              const prevClose = Number(prev?.nepse?.prevClose || firstTick?.open || 2629.82);

\+              const prevClose = Number(prev?.nepse?.prevClose || firstTick?.open || liveVal);

&#x20;              const chg = +(liveVal - prevClose).toFixed(2);

&#x20;              const pChg = +(prevClose > 0 ? (chg / prevClose) \* 100 : 0).toFixed(2);

&#x20;              const to = Number(response?.turnover || prev?.nepse?.turnover || currentStocks?.reduce((acc, s) => acc + (s.turnover || 0), 0) || 0);

@@ -800,7 +811,7 @@ function AppInner() {

&#x20;            if (computed \&\& computed.nepse?.value > 0 \&\& !computed.isPlaceholder) {

&#x20;              saveCachedIndices(computed);

&#x20;              return { ...prev, ...computed };

&#x20;            }

\-            if (prev?.nepse?.value \&\& Number(prev.nepse.value) > 0 \&\& !prev.isPlaceholder \&\& Math.abs(Number(prev.nepse.value) - 2629.82) >= 0.05) {

\+            if (prev?.nepse?.value \&\& Number(prev.nepse.value) > 0 \&\& !prev.isPlaceholder) {

&#x20;              return prev; // PRESERVE authentic live index! Never revert to yesterday!

&#x20;            }

&#x20;            return prev;

@@ -821,6 +832,7 @@ function AppInner() {

&#x20;      setIsRefreshing(false);

&#x20;    }

&#x20;  };

\+  triggerTickRef.current = triggerTick;

&#x20;

&#x20;  // Native App Resume Refresh (Capacitor Mobile)

&#x20;  useEffect(() => {

@@ -832,8 +844,7 @@ function AppInner() {

&#x20;      CapacitorApp.addListener('appStateChange', ({ isActive }) => {

&#x20;        if (isActive) {

&#x20;          console.log('\[App] Resumed from background - refreshing live quotes \& market depth');

\-          triggerTick();

\-          setLastSyncTime(new Date());

\+          triggerTickRef.current?.();

&#x20;          syncDevicePushToken().catch(() => {});

&#x20;        }

&#x20;      }).then(handle => {

@@ -875,7 +886,16 @@ function AppInner() {

&#x20;    const liveMatch = stocks.find(

&#x20;      s => String(s.symbol || '').toUpperCase().trim() === targetSym

&#x20;    );

\-    return liveMatch ? { ...liveMatch, ...baseObj, name: liveMatch.name || baseObj.name, ltp: liveMatch.ltp || baseObj.ltp } : baseObj;

\+    return liveMatch

\+      ? {

\+          ...baseObj,

\+          ...liveMatch,

\+          name: liveMatch.name || baseObj.name,

\+          initialTab: baseObj.initialTab ?? liveMatch.initialTab,

\+          isHistoricalSession: baseObj.isHistoricalSession,

\+          sessionDate: baseObj.sessionDate ?? baseObj.date,

\+        }

\+      : baseObj;

&#x20;  }, \[selectedStock, stocks]);

@@ -967,7 +987,7 @@ function AppInner() {

&#x20;              title={marketStatus?.message || 'NEPSE Market Status - Tap to view full calendar'}

&#x20;            >

&#x20;              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-\[10.5px] font-extrabold border ${

\-                marketStatus?.isOpen

\+                marketStatus?.isOpen \&\& apiStatus === 'live'

&#x20;                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'

&#x20;                  : marketStatus?.isPreOpen

&#x20;                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'

@@ -977,7 +997,7 @@ function AppInner() {

&#x20;                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'

&#x20;                  : 'bg-slate-800/80 text-slate-400 border-slate-700/60'

&#x20;              }`}>

\-                {marketStatus?.isOpen ? (

\+                {marketStatus?.isOpen \&\& apiStatus === 'live' ? (

&#x20;                  <span className="relative flex h-2 w-2 mr-0.5">

&#x20;                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />

&#x20;                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-\[0\_0\_8px\_rgba(16,185,129,0.9)]" />

@@ -987,10 +1007,18 @@ function AppInner() {

&#x20;                    marketStatus?.isPreOpen ? 'bg-amber-400' : marketStatus?.isHoliday ? 'bg-purple-400' : marketStatus?.isWeekend ? 'bg-amber-400' : 'bg-slate-500'

&#x20;                  }`} />

&#x20;                )}

\-                {marketStatus?.isOpen ? 'Market Open' : marketStatus?.isPreOpen ? 'Pre-Open' : 'Market Closed'}

\+                {marketStatus?.isOpen

\+                  ? (apiStatus === 'live' ? 'Market Open (Live)' : 'Market Open (Cached)')

\+                  : marketStatus?.isPreOpen

\+                  ? 'Pre-Open'

\+                  : 'Market Closed'}

&#x20;              </span>

\-              <span className="text-\[10px] font-mono text-slate-400" title={`Last synced: ${formattedSyncTime} NPT`}>

\-                {formattedSyncTime ? `Updated: ${formattedSyncTime} NPT` : (marketStatus?.nptTime ? `${marketStatus.nptTime} NPT` : '')}

\+              <span className="text-\[10px] font-mono text-slate-400" title={formattedSyncTime ? `Last synced: ${formattedSyncTime} NPT` : 'Not yet synced'}>

\+                {formattedSyncTime

\+                  ? `${apiStatus === 'live' || apiStatus === 'closing' ? 'Updated' : 'Cached'}: ${formattedSyncTime} NPT`

\+                  : 'Syncing live feed...'}

&#x20;              </span>

&#x20;            </div>

&#x20;          </div>

@@ -1229,8 +1257,6 @@ function AppInner() {

&#x20;                        const email = user?.email || '';

&#x20;                        const currentWatchlist = JSON.parse(localStorage.getItem('nepse\_user\_watchlist') || '\[]');

&#x20;                        const userTxKey = `nepse\_hub\_${uid}\_transactions`;

\-                        const userProfileKey = `nepse\_hub\_${uid}\_profiles`;

\-                        const bulkKey = 'nepse\_hub\_bulk\_ipo\_accounts';

&#x20;

&#x20;                        // 1. Pull latest remote cloud data

&#x20;                        let pulledProfiles = \[];

@@ -1246,16 +1272,21 @@ function AppInner() {

&#x20;                        } catch (\_) {}

&#x20;

&#x20;                        // 2. Merge local and remote

&#x20;                        const localTxs = JSON.parse(localStorage.getItem(userTxKey) || '\[]');

\-                        const localProfs = JSON.parse(localStorage.getItem(userProfileKey) || '\[]');

\-                        const localBulk = JSON.parse(localStorage.getItem(bulkKey) || '\[]');

\+                        const localProfs = await loadEncryptedUserProfiles(uid);

&#x20;

&#x20;                        const mergedProfs = \[...localProfs];

&#x20;                        pulledProfiles.forEach(p => {

&#x20;                          const idx = mergedProfs.findIndex(mp => mp.boid === p.boid || mp.id === p.id);

&#x20;                          if (idx === -1) mergedProfs.push(p);

&#x20;                          else if (p.holdings?.length > 0 \&\& (!mergedProfs\[idx].holdings || mergedProfs\[idx].holdings.length === 0)) {

\-                            mergedProfs\[idx] = { ...mergedProfs\[idx], ...p };

\+                            mergedProfs\[idx] = {

\+                              ...p,

\+                              password: mergedProfs\[idx].password || '',

\+                              crn: mergedProfs\[idx].crn || '',

\+                              pin: mergedProfs\[idx].pin || '',

\+                              transactionPin: mergedProfs\[idx].transactionPin || ''

\+                            };

&#x20;                          }

&#x20;                        });

&#x20;

@@ -1266,22 +1297,23 @@ function AppInner() {

&#x20;

&#x20;                        const mergedWatchlist = \[...new Set(\[...currentWatchlist, ...pulledWatchlist])];

&#x20;

\-                        // 3. Save locally

\-                        safeStorageSetItem(userProfileKey, JSON.stringify(mergedProfs));

\+                        // 3. Save locally (AES-256-GCM encrypted vault for profiles)

\+                        await saveEncryptedUserProfiles(mergedProfs, uid);

&#x20;                        safeStorageSetItem(userTxKey, JSON.stringify(mergedTxs));

&#x20;                        safeStorageSetItem('nepse\_user\_watchlist', JSON.stringify(mergedWatchlist));

&#x20;

\-                        // 4. Push combined snapshot to cloud

\+                        // 4. Push sanitized snapshot to cloud (ZERO credentials uploaded)

\+                        const sanitizedProfiles = mergedProfs.map(({ password: \_p, crn: \_c, pin: \_pn, transactionPin: \_tp, vaultEnvelope: \_ve, ...safe }) => safe);

&#x20;                        await syncUserDataToCloud(uid, {

\-                          profiles: mergedProfs,

\+                          profiles: sanitizedProfiles,

&#x20;                          transactions: mergedTxs,

\-                          bulkAccounts: localBulk,

\+                          bulkAccounts: sanitizedProfiles,

&#x20;                          watchlist: mergedWatchlist

&#x20;                        }, email);

&#x20;

&#x20;                        // 5. Notify UI components to refresh

&#x20;                        window.dispatchEvent(new CustomEvent('nepse\_cloud\_data\_restored', {

\-                          detail: { uid, profiles: mergedProfs, transactions: mergedTxs, watchlist: mergedWatchlist }

\+                          detail: { uid, profiles: sanitizedProfiles, transactions: mergedTxs, watchlist: mergedWatchlist }

&#x20;                        }));

\-                        window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { profiles: mergedProfs } }));

\+                        window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { profiles: sanitizedProfiles } }));



```



\---



\#### `src/components/AccountManager.jsx` (Fixes `A3-006`, `A3-015`)







```diff

\--- a/src/components/AccountManager.jsx

+++ b/src/components/AccountManager.jsx

@@ -117,6 +117,12 @@ export default function AccountManager({ userId = null }) {

&#x20;    const dpId = selectedDp.id || '128';

&#x20;    const dpName = selectedDp.name || 'Capital DP';

&#x20;

\+    try {

\+      const existing = await loadEncryptedUserProfiles(activeUserId);

\+      const prevAccount = existing.find(a => a.boid === boid);

&#x20;      const newAccount = {

\-      id: Date.now().toString(),

\+      id: prevAccount?.id || Date.now().toString(),

&#x20;      name,

&#x20;      boid,

&#x20;      username,

@@ -126,11 +132,10 @@ export default function AccountManager({ userId = null }) {

&#x20;      password,

&#x20;      crn,

&#x20;      pin: String(pin),

\-      holdings: \[],

\-      lastSyncedAt: null

\+      holdings: prevAccount?.holdings || \[],

\+      lastSyncedAt: prevAccount?.lastSyncedAt || null

&#x20;    };

&#x20;

\-    try {

\-      const existing = await loadEncryptedUserProfiles(activeUserId);

&#x20;      const filtered = existing.filter(a => a.boid !== boid);

&#x20;      const updated = \[...filtered, newAccount];

&#x20;      await saveEncryptedUserProfiles(updated, activeUserId);

@@ -171,7 +176,7 @@ export default function AccountManager({ userId = null }) {

&#x20;          const sym = (h.script || h.scrip || h.symbol || '').toUpperCase().trim();

&#x20;          if (sym) {

&#x20;            const rate = Number(h.userWacc || h.wacc || h.purchasePrice || h.effectiveRate || 0);

\-            if (rate > 0 \&\& (h.isCustomWacc || h.waccSource === 'CUSTOM\_USER\_SET' || rate !== 100)) {

\+            if (rate > 0 \&\& (h.isCustomWacc === true || h.waccSource === 'CUSTOM\_USER\_SET')) {

&#x20;              existingWaccMap\[sym] = rate;

&#x20;            }

&#x20;          }



```



\---



\#### `src/components/AlphaCommandCenter.tsx` \& `src/components/analyzer/OneClickAlphaButton.jsx` (Fixes `A3-003`)







```diff

\--- a/src/components/AlphaCommandCenter.tsx

+++ b/src/components/AlphaCommandCenter.tsx

@@ -21,8 +21,8 @@ interface AlphaCommandCenterProps {

&#x20;

&#x20;const CAPITAL\_PRESETS = \[50000, 100000, 250000, 500000, 1000000];

&#x20;const CGT\_MODES = \[

\-  { rate: 0.05, label: '5.0% CGT (Gazette 2083)' },

\-  { rate: 0.075, label: '7.5% CGT (Standard ST)' },

\+  { rate: 0.05, label: '5.0% CGT (ST <=365d)' },

\+  { rate: 0.0375, label: '3.75% CGT (LT >365d)' },

&#x20;  { rate: 0.10, label: '10.0% CGT (Institutional)' }

&#x20;];

&#x20;

@@ -42,7 +42,7 @@ export function AlphaCommandCenter({

&#x20;    return 100000;

&#x20;  });

&#x20;

\-  const \[cgtRate, setCgtRate] = useState<number>(0.075);

\+  const \[cgtRate, setCgtRate] = useState<number>(0.05);



```



```diff

\--- a/src/components/analyzer/OneClickAlphaButton.jsx

+++ b/src/components/analyzer/OneClickAlphaButton.jsx

@@ -43,7 +43,7 @@ export function OneClickAlphaButton({

&#x20;          userCapital: effectiveCapital,

&#x20;          riskTolerancePct: 1.5,

&#x20;          requiredNetRRR: 2.5,

\-          cgtRate: 0.075

\+          cgtRate: 0.05

&#x20;        });

&#x20;        setScanResult(desk);



```



\---



\#### `src/components/analyzer/EntryRiskCard.tsx` (Fixes `A3-003`, `A3-010`, `A3-019`)







```diff

\--- a/src/components/analyzer/EntryRiskCard.tsx

+++ b/src/components/analyzer/EntryRiskCard.tsx

@@ -1,6 +1,7 @@

&#x20;import React, { useState, useEffect, useMemo } from 'react';

&#x20;import { Target, ShieldAlert, TrendingUp, Info, Calculator, Coins, AlertTriangle, CheckCircle2, Lock, ArrowRight } from 'lucide-react';

&#x20;import { calculateNetProfit, formatRiskReward } from '../../utils/riskManagement';

+import { calculateBrokerCommission } from '../../constants/marketRules';

&#x20;

@@ -94,45 +95,58 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;  // Enforce max 1.5% - 2.5% portfolio risk ceiling across all tiers

&#x20;  const effectiveRiskPct = Math.min(2.5, Math.max(0.75, riskTolerancePct));

&#x20;  const maxCapitalAtRisk = portfolioCapital \* (effectiveRiskPct / 100);

&#x20;

\-  // Include round-trip broker commission (0.36% starter / 0.33% standard, min Rs. 10), SEBON (0.015%), and Rs. 50 round-trip DP fee

\-  const estBrokerRate = portfolioCapital <= 150000 ? 0.0036 : 0.0033;

\-  const rawPriceRisk = Math.max(0.5, entryPx - stopPx);

\+  // Guard invalid/inverted stop-loss (live LTP <= stopPx) so sizing clamps to 0 instead of max cap

\+  const isStopInverted = entryPx <= stopPx || entryPx <= 0 || stopPx <= 0;

\+  const rawPriceRisk = isStopInverted ? 0 : (entryPx - stopPx);

\+

\+  // Exact SEBON 5-tier whole-trade broker slab lookup for estimated order value

\+  const getSlabRate = (val: number) =>

\+    val <= 50000 ? 0.0036 : val <= 500000 ? 0.0033 : val <= 2000000 ? 0.0031 : val <= 10000000 ? 0.0027 : 0.0024;

\+  const estOrderValue = Math.min(portfolioCapital \* 0.25, Math.max(10 \* entryPx, maxCapitalAtRisk \* 10));

\+  const estBrokerRate = getSlabRate(estOrderValue);

&#x20;  const perShareVarFriction = (entryPx + stopPx) \* (estBrokerRate + 0.00015);

\-  const effectiveRiskPerShare = rawPriceRisk + perShareVarFriction;

\+  const effectiveRiskPerShare = isStopInverted ? 0 : (rawPriceRisk + perShareVarFriction);

&#x20;

\-  const rawQuantity = Math.floor(Math.max(0, maxCapitalAtRisk - 50) / effectiveRiskPerShare);

\+  const rawQuantity = isStopInverted ? 0 : Math.floor(Math.max(0, maxCapitalAtRisk - 50) / effectiveRiskPerShare);

&#x20;

&#x20;  // Maximum single-stock allocation cap (25% of portfolio) AND 5% of 20-day median turnover cap

&#x20;  const median20DTurnover = Number((levels as any)?.median20DayTurnover || (levels as any)?.t2Risk?.median20DayTurnover || 8000000);

&#x20;  const maxLiquidityOrderValue = Math.floor(0.05 \* median20DTurnover);

&#x20;  const maxSlotValue = Math.min(portfolioCapital \* 0.25, maxLiquidityOrderValue);

\-  const maxAllocationShares = Math.floor(Math.max(0, maxSlotValue - 25) / (entryPx \* (1 + estBrokerRate + 0.00015)));

\+  const maxAllocationShares = isStopInverted ? 0 : Math.floor(Math.max(0, maxSlotValue - 25) / (entryPx \* (1 + getSlabRate(maxSlotValue) + 0.00015)));

&#x20;

&#x20;  const t2Multiplier = levels?.t2Risk?.recommendedPositionMultiplier ?? levels?.recommendedPositionMultiplier ?? 1.0;

&#x20;  const scaledShares = Math.floor((Math.min(rawQuantity, maxAllocationShares) \* t2Multiplier) / 10) \* 10;

&#x20;

&#x20;  // Verify 10-kitta minimum lot does not breach 2.0% hard portfolio loss cap

&#x20;  const lossAt10Kitta = 10 \* effectiveRiskPerShare + 50;

\-  const finalShares = scaledShares >= 10

\-    ? scaledShares

\-    : (lossAt10Kitta <= portfolioCapital \* 0.02 \&\& 10 \* entryPx <= maxSlotValue ? 10 : 0);

\+  const finalShares = isStopInverted

\+    ? 0

\+    : (scaledShares >= 10

\+        ? scaledShares

\+        : (lossAt10Kitta <= portfolioCapital \* 0.02 \&\& 10 \* entryPx <= maxSlotValue ? 10 : 0));

&#x20;

&#x20;  const buyOrderVal = finalShares \* entryPx;

\-  const buyBrokerComm = finalShares > 0 ? Math.max(10, +(buyOrderVal \* estBrokerRate).toFixed(2)) : 0;

\+  const buyBrokerComm = finalShares > 0 ? calculateBrokerCommission(buyOrderVal) : 0;

&#x20;  const buySebon = finalShares > 0 ? +(buyOrderVal \* 0.00015).toFixed(2) : 0;

&#x20;  const buyDp = finalShares > 0 ? 25 : 0;

&#x20;  const totalPositionOutlay = Math.round(buyOrderVal + buyBrokerComm + buySebon + buyDp);

&#x20;

&#x20;  const portfolioAllocationPct = portfolioCapital > 0 ? +((totalPositionOutlay / portfolioCapital) \* 100).toFixed(1) : 0;

\-  const actualRiskRupees = finalShares > 0 ? Math.round(finalShares \* effectiveRiskPerShare + 50) : 0;

\+  const sellAtStopVal = finalShares \* stopPx;

\+  const sellAtStopFees = finalShares > 0 ? (calculateBrokerCommission(sellAtStopVal) + +(sellAtStopVal \* 0.00015).toFixed(2) + 25) : 0;

\+  const actualRiskRupees = finalShares > 0 ? Math.max(0, Math.round(totalPositionOutlay - (sellAtStopVal - sellAtStopFees))) : 0;

&#x20;  const actualRiskPctOfCapital = portfolioCapital > 0 ? +((actualRiskRupees / portfolioCapital) \* 100).toFixed(2) : 0;

&#x20;

&#x20;  const statutoryBePx = levels?.statutoryBreakeven?.breakevenPrice || +(entryPx \* 1.0085).toFixed(1);

\-  const scaleOutShares = finalShares >= 20 ? Math.floor((finalShares \* 0.5) / 10) \* 10 : Math.floor(finalShares \* 0.5);

\+  // Avoid recommending unexecutable odd-lot (<10 kitta) partial exits in regular NEPSE session

\+  const scaleOutShares = finalShares >= 20 ? Math.floor((finalShares \* 0.5) / 10) \* 10 : finalShares;

&#x20;  const runnerShares = Math.max(0, finalShares - scaleOutShares);

&#x20;

\-  // Expected Net Return in Rupees at Target 1

\-  const t1NetGainPerShare = levels?.target1?.netGainPerShare || (levels?.target1?.price ? levels.target1.price - entryPx : entryPx \* 0.08);

\-  const target1NetGainRupees = Math.round(finalShares \* t1NetGainPerShare);

\+  // Expected Net Return in Rupees at Target 1 (real fees + 5.0% ST CGT, never fabricated +8%)

\+  const target1NetGainRupees = useMemo(() => {

\+    if (finalShares <= 0 || !levels?.target1?.price || entryPx <= 0) return 0;

\+    if (levels.target1.netGainPerShare != null) return Math.round(finalShares \* levels.target1.netGainPerShare);

\+    const res = calculateNetProfit({ shares: finalShares, buyPrice: entryPx, sellPrice: levels.target1.price, holdingDays: 90, investorType: 'individual' });

\+    return res \&\& !res.error ? Math.round(res.netProfitLoss) : 0;

\+  }, \[finalShares, levels?.target1?.price, levels?.target1?.netGainPerShare, entryPx]);

@@ -165,11 +179,11 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;  const \[calcHoldingType, setCalcHoldingType] = useState<'short' | 'long'>('short');

&#x20;

\-  // Sync calc inputs when levels/entryPx change

\+  // Initialize calc inputs ONLY when panel opens (do not overwrite user typing on live ticks)

&#x20;  const t1Price = levels?.target1?.price || entryPx \* 1.10;

&#x20;  useEffect(() => {

\+    if (!showNetCalc) return;

&#x20;    if (t1Price > 0) setCalcSellPrice(prev => prev > 0 ? prev : +(t1Price).toFixed(2));

&#x20;    if (finalShares > 0) setCalcShares(prev => prev > 0 ? prev : finalShares);

\-  }, \[entryPx, t1Price, finalShares]);

\+  }, \[showNetCalc]);

@@ -286,7 +300,7 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;          <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-0.5">

&#x20;            <div className="text-\[11px] font-bold text-emerald-300">

\-              Net: {levels.target1?.netReturnPct != null ? `+${levels.target1.netReturnPct}%` : '—'} <span className="text-\[9.5px] font-normal text-slate-400">(-7.5% CGT/fees)</span>

\+              Net: {levels.target1?.netReturnPct != null ? `+${levels.target1.netReturnPct}%` : '—'} <span className="text-\[9.5px] font-normal text-slate-400">(-5.0% CGT/fees)</span>

&#x20;            </div>

@@ -306,7 +320,7 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;          <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-0.5">

&#x20;            <div className="text-\[11px] font-bold text-teal-300">

\-              Net: {levels.target2?.netReturnPct != null ? `+${levels.target2.netReturnPct}%` : '—'} <span className="text-\[9.5px] font-normal text-slate-400">(-7.5% CGT/fees)</span>

\+              Net: {levels.target2?.netReturnPct != null ? `+${levels.target2.netReturnPct}%` : '—'} <span className="text-\[9.5px] font-normal text-slate-400">(-5.0% CGT/fees)</span>

&#x20;            </div>

@@ -512,7 +526,7 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;            <div className="text-\[10px] text-emerald-400/80 mt-0.5">

\-              Net of 7.5% CGT \& broker fees

\+              Net of 5.0% ST CGT \& broker fees

&#x20;            </div>

@@ -524,7 +538,11 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-200">

&#x20;            <Coins size={14} className="text-emerald-400 shrink-0 mt-0.5" />

&#x20;            <div>

&#x20;              <span className="font-bold text-white">Execution Roadmap: </span>

\-              <span>Sell {scaleOutShares} shares (50%) at Target 1 ({levels.target1?.label || `Rs. ${levels.target1?.price}`}) ➔ Raise Stop-Loss on remaining {runnerShares} runner shares to Statutory Breakeven (Rs. {statutoryBePx}) for zero risk.</span>

\+              {runnerShares > 0 ? (

\+                <span>Sell {scaleOutShares} shares (50%) at Target 1 ({levels.target1?.label || `Rs. ${levels.target1?.price}`}) ➔ Raise Stop-Loss on remaining {runnerShares} runner shares to Statutory Breakeven (Rs. {statutoryBePx}) for zero risk.</span>

\+              ) : (

\+                <span>Single 10-kitta board lot: Exit all {scaleOutShares} shares at Target 1 ({levels.target1?.label || `Rs. ${levels.target1?.price}`}) to avoid NEPSE odd-lot execution friction.</span>

\+              )}

&#x20;            </div>

&#x20;          </div>

&#x20;        )}

@@ -587,8 +605,8 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;            <div className="flex gap-3">

\-              <button onClick={() => setCalcHoldingType('short')} className={`text-\[10px] px-2.5 py-1 rounded-full border transition-colors ${calcHoldingType === 'short' ? 'bg-blue-950 border-blue-700 text-blue-300' : 'border-slate-700 text-slate-500'}`}>Short-term CGT 7.5%</button>

\-              <button onClick={() => setCalcHoldingType('long')} className={`text-\[10px] px-2.5 py-1 rounded-full border transition-colors ${calcHoldingType === 'long' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Long-term CGT 5%</button>

\+              <button onClick={() => setCalcHoldingType('short')} className={`text-\[10px] px-2.5 py-1 rounded-full border transition-colors ${calcHoldingType === 'short' ? 'bg-blue-950 border-blue-700 text-blue-300' : 'border-slate-700 text-slate-500'}`}>Short-term CGT 5.0% (\&le;365d)</button>

\+              <button onClick={() => setCalcHoldingType('long')} className={`text-\[10px] px-2.5 py-1 rounded-full border transition-colors ${calcHoldingType === 'long' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Long-term CGT 3.75% (\&gt;365d)</button>

&#x20;            </div>

@@ -637,7 +655,7 @@ export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, set

&#x20;        <span>

\-          <strong>Real Net Return \& Settlement Accounting:</strong> Net targets incorporate round-trip SEBON fees (0.015%), broker commission (\~0.24%-0.36%), DP fee (Rs. 25), and <strong>CGT (7.5% short-term <=1yr / 5% long-term >1yr)</strong> per Finance Act 2083.

\+          <strong>Real Net Return \& Settlement Accounting:</strong> Net targets incorporate round-trip SEBON fees (0.015%), broker commission (\~0.24%-0.36%), DP fee (Rs. 25/leg), and <strong>CGT (5.0% short-term \&le;365d / 3.75% long-term \&gt;365d)</strong> effective 22 Sept 2026 (31 Bhadra 2083).

&#x20;        </span>



```



\---



\#### `src/components/analyzer/HistoricalAnalogPanel.tsx` (Fixes `A3-003`)







```diff

\--- a/src/components/analyzer/HistoricalAnalogPanel.tsx

+++ b/src/components/analyzer/HistoricalAnalogPanel.tsx

@@ -112,7 +112,7 @@ export function HistoricalAnalogPanel({ analogResult }: HistoricalAnalogPanelPro

&#x20;          <span className="text-\[11px] font-medium text-slate-400 flex items-center gap-1 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">

\-            <Coins size={12} className="text-amber-400" /> Net of SEBON fees \& 7.5% CGT (Final)

\+            <Coins size={12} className="text-amber-400" /> Net of SEBON fees \& 5.0% ST CGT (3.75% LT)

&#x20;          </span>



```



\---



\#### `src/components/analyzer/GrahamSafetyCard.tsx` (Fixes `A3-020`)







```diff

\--- a/src/components/analyzer/GrahamSafetyCard.tsx

+++ b/src/components/analyzer/GrahamSafetyCard.tsx

@@ -23,6 +23,7 @@ interface GrahamSafetyCardProps {

&#x20;  fundamentals?: {

&#x20;    eps?: number;

&#x20;    bookValue?: number;

\+    bvps?: number;

&#x20;    pe?: number;

&#x20;    pb?: number;

&#x20;    pbv?: number;

@@ -58,7 +59,7 @@ export function GrahamSafetyCard({

&#x20;  }

&#x20;

&#x20;  // 3. Reject synthetic estimation: require verified EPS and positive BVPS (allow eps <= 0 to route to 2/3 BVPS floor)

\-  if (eps === null || bookValue === null || eps <= 0 || bookValue <= 0) {

\+  if (eps === null || bookValue === null || bookValue <= 0) {

&#x20;    return (

@@ -137,8 +138,10 @@ export function GrahamSafetyCard({

&#x20;  const interestAdjusted = calculateInterestAdjustedGrahamValue(eps, 7.0, 7.5, currentPrice);

&#x20;  const erpMetrics = calculateEarningsYieldAndRiskPremium(eps, currentPrice, 7.5);

&#x20;

\-  const effectiveIntrinsic = graham.intrinsicValue;

\-  const mosPct = graham.marginOfSafetyPct;

\-  const pePb = graham.pePbProduct > 0 ? graham.pePbProduct : +((currentPrice / eps) \* (currentPrice / bookValue)).toFixed(1);

&#x20;  const isLossMaking = Boolean(eps !== null \&\& eps <= 0);

\+  const effectiveIntrinsic = isLossMaking ? grahamFloor : graham.intrinsicValue;

\+  const mosPct = effectiveIntrinsic > 0 ? ((effectiveIntrinsic - currentPrice) / effectiveIntrinsic) \* 100 : 0;

\+  const pePb = isLossMaking ? 0 : (graham.pePbProduct > 0 ? graham.pePbProduct : +((currentPrice / eps) \* (currentPrice / bookValue)).toFixed(1));



```



\---



\#### `src/components/BreakoutAlertDialog.jsx` (Fixes `A3-016`)







```diff

\--- a/src/components/BreakoutAlertDialog.jsx

+++ b/src/components/BreakoutAlertDialog.jsx

@@ -282,7 +282,7 @@ export default function BreakoutAlertDialog({

&#x20;                ) : (

&#x20;                  <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>

\-                    {(((Number(breakoutPrice) - ltp) / ltp) \* 100).toFixed(1)}% to trigger

\+                    {ltp > 0 ? `${(((Number(breakoutPrice) - ltp) / ltp) \* 100).toFixed(1)}% to trigger` : 'Awaiting live LTP'}

&#x20;                  </span>

&#x20;                )}



```



\---



\#### `src/components/Calculator.jsx` (Fixes `A3-003`, `A3-005`, `A3-017`)







```diff

\--- a/src/components/Calculator.jsx

+++ b/src/components/Calculator.jsx

@@ -19,12 +19,13 @@ export default function Calculator() {

&#x20;  const \[sellQty, setSellQty] = useState(100);

&#x20;  const \[sellPrice, setSellPrice] = useState(300);

&#x20;  const \[buyWacc, setBuyWacc] = useState(250);

\-  const \[holdingType, setHoldingType] = useState('short'); // 'short' (7.5% - Individual <= 365d), 'long' (5.0% - Individual > 365d), 'institutional' (10.0%)

\+  const \[holdingType, setHoldingType] = useState('short'); // 'short' (5.0% - Individual <= 365d), 'long' (3.75% - Individual > 365d), 'institutional' (10.0%)

&#x20;  const \[sellResult, setSellResult] = useState(null);

&#x20;

&#x20;  // 3. Bonus \& Right Adjustment State

&#x20;  const \[adjLtp, setAdjLtp] = useState(450);

\+  const \[adjWacc, setAdjWacc] = useState(450);

&#x20;  const \[bonusPct, setBonusPct] = useState(10);

&#x20;  const \[rightPct, setRightPct] = useState(0);

&#x20;  const \[rightIssuePrice, setRightIssuePrice] = useState(100);

@@ -98,7 +99,7 @@ export default function Calculator() {

&#x20;  const breakEvenResult = useMemo(() => {

&#x20;    if (sellQty <= 0 || buyWacc <= 0) return null;

&#x20;    

&#x20;    let low = buyWacc;

\-    let high = buyWacc \* 2 + 50;

\+    let high = Math.max(buyWacc \* 2 + 50, ((buyWacc \* sellQty) + 250) / sellQty) \* 1.25;

&#x20;    let breakEvenPrice = buyWacc;

@@ -123,7 +124,7 @@ export default function Calculator() {

&#x20;    const pr = parseFloat(rightIssuePrice) || 100;

&#x20;    const qty = parseInt(userShares) || 0;

\-    const currentWacc = parseFloat(buyWacc) || p0;

\+    const currentWacc = parseFloat(adjWacc) > 0 ? parseFloat(adjWacc) : p0;

&#x20;

&#x20;    if (p0 <= 0) return null;

@@ -146,7 +147,7 @@ export default function Calculator() {

&#x20;      postValue: Math.floor(sim.totalNewUnits) \* sim.adjustedPrice,

&#x20;      dilutionAudit

&#x20;    };

\-  }, \[adjLtp, bonusPct, rightPct, rightIssuePrice, userShares, buyWacc]);

\+  }, \[adjLtp, adjWacc, bonusPct, rightPct, rightIssuePrice, userShares]);

@@ -403,8 +404,8 @@ export default function Calculator() {

&#x20;                className="select-input"

&#x20;              >

\-                <option value="short">Individual Short Term (<= 365 Days, 7.5% CGT - Final Tax)</option>

\-                <option value="long">Individual Long Term (> 365 Days, 5.0% CGT - Final Tax)</option>

\+                <option value="short">Individual Short Term (\&le; 365 Days, 5.0% CGT - Final Tax)</option>

\+                <option value="long">Individual Long Term (\&gt; 365 Days, 3.75% CGT - Final Tax)</option>

&#x20;                <option value="institutional">Institutional Investor (10.0% CGT)</option>

&#x20;              </select>

@@ -495,8 +496,8 @@ export default function Calculator() {

&#x20;                className="select-input"

&#x20;              >

\-                <option value="short">Individual Short Term (7.5% CGT - Final Tax)</option>

\-                <option value="long">Individual Long Term (5.0% CGT - Final Tax)</option>

\+                <option value="short">Individual Short Term (\&le; 365d, 5.0% CGT - Final Tax)</option>

\+                <option value="long">Individual Long Term (\&gt; 365d, 3.75% CGT - Final Tax)</option>

&#x20;                <option value="institutional">Institutional / Corporate (10.0% CGT - Advance Tax)</option>

&#x20;              </select>

@@ -529,14 +530,25 @@ export default function Calculator() {

&#x20;            <h3 className="section-title" style={{ marginBottom: 14 }}>

&#x20;              Ex-Book Closure Price Adjustment

&#x20;            </h3>

&#x20;

\-            <div style={{ marginBottom: 12 }}>

\-              <label className="input-label">Market Price before Book Closure (LTP in Rs.)</label>

\-              <input

\-                type="number"

\-                value={adjLtp}

\-                onChange={(e) => setAdjLtp(parseFloat(e.target.value) || 0)}

\-                className="input"

\-                placeholder="e.g. 450"

\-              />

\+            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>

\+              <div>

\+                <label className="input-label">Market Price before Book Closure (LTP Rs.)</label>

\+                <input

\+                  type="number"

\+                  value={adjLtp}

\+                  onChange={(e) => setAdjLtp(parseFloat(e.target.value) || 0)}

\+                  className="input"

\+                  placeholder="e.g. 450"

\+                />

\+              </div>

\+              <div>

\+                <label className="input-label">Your Current WACC (Rs.)</label>

\+                <input

\+                  type="number"

\+                  value={adjWacc}

\+                  onChange={(e) => setAdjWacc(parseFloat(e.target.value) || 0)}

\+                  className="input"

\+                  placeholder="e.g. 450"

\+                />

\+              </div>

&#x20;            </div>

@@ -982,7 +994,7 @@ export default function Calculator() {

&#x20;                  style={{

&#x20;                    width: '100%',

&#x20;                    ...

&#x20;                  }}

&#x20;                >

\-                  <option value="individual">Individual (7.5% Short-Term)</option>

\+                  <option value="individual">Individual (5.0% Short-Term \&le;365d)</option>

&#x20;                  <option value="institutional">Institutional (10% CGT)</option>

&#x20;                </select>



```



\---



\#### `src/components/calculators.tsx` (Fixes `A3-002`, `A3-004`, `A3-011`, `A3-018`)







```diff

\--- a/src/components/calculators.tsx

+++ b/src/components/calculators.tsx

@@ -1,4 +1,4 @@

\-import { useState, useEffect } from 'react';

+import { useState, useEffect, useRef } from 'react';

&#x20;import { InfoBanner, StatCard, StockSearchSelect } from './ui';

@@ -20,6 +20,7 @@ export function GrahamValuation({

&#x20;  const \[result, setResult] = useState<any>(null);

&#x20;  const \[validationError, setValidationError] = useState('');

&#x20;  const \[isLoadingFund, setIsLoadingFund] = useState(false);

\+  const requestIdRef = useRef(0);

&#x20;

@@ -91,6 +92,7 @@ export function GrahamValuation({

&#x20;  const handleStockSelect = async (sym: string) => {

&#x20;    const cleanSym = String(sym || '').toUpperCase().trim();

&#x20;    setSelectedSym(cleanSym);

\+    const reqId = ++requestIdRef.current;

&#x20;    if (!cleanSym) return;

&#x20;

&#x20;    const found = stocks.find((s: any) => s.symbol?.toUpperCase() === cleanSym) || { symbol: cleanSym };

@@ -117,6 +119,7 @@ export function GrahamValuation({

&#x20;          if (priceVal == null \&\& fresh.ltp) priceVal = Number(fresh.ltp);

&#x20;        }

&#x20;      } catch (\_) {}

\+      if (reqId !== requestIdRef.current) return; // Discard stale cross-ticker response

&#x20;      setIsLoadingFund(false);

&#x20;    }

\+    if (reqId !== requestIdRef.current) return;

&#x20;

&#x20;    const newForm = {

@@ -135,9 +138,13 @@ export function GrahamValuation({

&#x20;    }

&#x20;  };

&#x20;

\+  const initializedRef = useRef(false);

&#x20;  useEffect(() => {

\+    if (initializedRef.current \&\& !initialSymbol) return;

\+    if (!initialSymbol \&\& stocks.length === 0) return;

\+    initializedRef.current = true;

&#x20;    const sym = initialSymbol || selectedSym || (stocks.length > 0 ? stocks\[0]?.symbol : 'NABIL') || 'NABIL';

&#x20;    handleStockSelect(sym);

\-  }, \[initialSymbol, stocks.length]);

\+  }, \[initialSymbol]);

@@ -286,7 +293,7 @@ export function BrokerageCalculator({ stocks: rawStocks = \[], initialSymbol = '' }

&#x20;    const totalCost = buyBrok + sellBrok + sebonBuy + sebonSell + dpFee;

&#x20;    const grossProfit = sellTotal - buyTotal;

&#x20;    const taxableProfit = netSellProceedsBeforeTax - totalBuyCost;

\-    const cgtRate = f.holdingType === 'individual\_short' || f.holdingType === 'short' ? 0.075 : f.holdingType === 'long' ? 0.05 : 0.10;

\+    const cgtRate = f.holdingType === 'individual\_short' || f.holdingType === 'short' ? 0.05 : f.holdingType === 'long' ? 0.0375 : 0.10;

&#x20;    const cgt = taxableProfit > 0 ? taxableProfit \* cgtRate : 0;

&#x20;    const netReturn = taxableProfit - cgt;

@@ -347,16 +354,16 @@ export function BrokerageCalculator({ stocks: rawStocks = \[], initialSymbol = '' }

&#x20;      <InfoBanner>

\-        <strong>SEBON Regulatory Norms:</strong> 5-tier broker commission (0.36% down to 0.24%, min Rs 10) + SEBON fee 0.015% + CDSC DP fee Rs 25/txn + Capital Gains Tax (7.5% short-term <=365d, 5.0% long-term >365d, 10% corporate).

\+        <strong>SEBON Regulatory Norms:</strong> 5-tier broker commission (0.36% down to 0.24%, min Rs 10) + SEBON fee 0.015% + CDSC DP fee Rs 25/txn + Capital Gains Tax (5.0% short-term \&le;365d, 3.75% long-term \&gt;365d, 10% corporate, effective 22 Sept 2026).

&#x20;      </InfoBanner>

&#x20;      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">

&#x20;        <input type="number" placeholder="Buy Price NPR" value={form.buy} onChange={(e) => setForm((f) => ({ ...f, buy: e.target.value }))} className={inputCls} />

&#x20;        <input type="number" placeholder="Sell Price NPR" value={form.sell} onChange={(e) => setForm((f) => ({ ...f, sell: e.target.value }))} className={inputCls} />

&#x20;        <input type="number" placeholder="Quantity" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className={inputCls} />

&#x20;        <select value={form.holdingType} onChange={(e) => setForm((f) => ({ ...f, holdingType: e.target.value }))} className={inputCls}>

\-          <option value="short">Individual Short \&le;365d — 7.5% CGT</option>

\-          <option value="long">Individual Long \&gt;365d — 5.0% CGT</option>

\+          <option value="short">Individual Short \&le;365d — 5.0% CGT</option>

\+          <option value="long">Individual Long \&gt;365d — 3.75% CGT</option>

&#x20;          <option value="institutional">Institutional / Corporate — 10% CGT</option>

&#x20;        </select>

@@ -403,18 +410,20 @@ export function DividendCalculator() {

&#x20;    if (!s || s <= 0) return;

&#x20;    const grossCash = (fv \* c / 100) \* s;

\-    const tax = grossCash \* 0.05;

\-    const netCash = grossCash - tax;

\+    const cashTax = grossCash \* 0.05;

&#x20;    const bonusShares = Math.floor((s \* b) / 100);

\+    const bonusTax = bonusShares \* fv \* 0.05; // Nepal 5% dividend tax on bonus share face value

\+    const tax = cashTax + bonusTax;

\+    const netCash = grossCash - tax;

&#x20;    const newTotal = s + bonusShares;

&#x20;    

&#x20;    // Dividend Yield calculations

&#x20;    const dps = (fv \* c) / 100;

&#x20;    const cashYield = pr > 0 ? (dps / pr) \* 100 : null;

\-    const bonusValue = pr > 0 ? bonusShares \* pr : 0;

\+    const exBonusPrice = pr > 0 ? pr / (1 + b / 100) : 0;

\+    const bonusValue = exBonusPrice > 0 ? bonusShares \* exBonusPrice : 0;

&#x20;    const totalYield = pr > 0 ? (((grossCash + bonusValue) / (s \* pr)) \* 100) : null;

@@ -630,22 +639,14 @@ export function RiskRewardCalculator({ stocks: rawStocks = \[], initialSymbol = '

&#x20;// Helper to parse ratios like "1:2", "1/2", "10:3", "0.5", "50%"

+// Standard NEPSE ratio format: Existing:Right (e.g., 1:1 = 100%, 10:3 = 30%, 2:1 = 50%, 4:1 = 25%)

&#x20;function parseRatio(str: string): number {

&#x20;  if (!str) return 1;

&#x20;  const clean = str.trim();

&#x20;  if (clean.includes(':')) {

&#x20;    const parts = clean.split(':').map((p) => parseFloat(p.trim()));

&#x20;    if (parts.length === 2 \&\& !isNaN(parts\[0]) \&\& !isNaN(parts\[1]) \&\& parts\[1] !== 0 \&\& parts\[0] !== 0) {

\-      if (parts\[0] > parts\[1] \&\& parts\[0] >= 5) {

\-        return parts\[1] / parts\[0];

\-      }

\-      return parts\[0] / parts\[1];

\+      return parts\[1] / parts\[0];

&#x20;    }

&#x20;  }

&#x20;  if (clean.includes('/')) {

&#x20;    const parts = clean.split('/').map((p) => parseFloat(p.trim()));

&#x20;    if (parts.length === 2 \&\& !isNaN(parts\[0]) \&\& !isNaN(parts\[1]) \&\& parts\[1] !== 0 \&\& parts\[0] !== 0) {

\-      if (parts\[0] > parts\[1] \&\& parts\[0] >= 5) {

\-        return parts\[1] / parts\[0];

\-      }

\-      return parts\[0] / parts\[1];

\+      return parts\[1] / parts\[0];

&#x20;    }

&#x20;  }

@@ -668,15 +669,16 @@ export function BonusAdjustmentCalculator() {

&#x20;  const runCalc = (f = form) => {

&#x20;    const pClose = parseFloat(f.closePrice);

&#x20;    const bPct = parseFloat(f.bonusPct);

\-    const s = parseFloat(f.shares) || 100;

\+    const s = parseFloat(f.shares);

&#x20;    const w = parseFloat(f.wacc) || pClose;

&#x20;

\-    if (!pClose || !bPct || pClose <= 0 || bPct <= 0) return;

\+    if (!pClose || !bPct || pClose <= 0 || bPct <= 0 || isNaN(s) || s <= 0) return;

&#x20;

&#x20;    // Formula: P\_adj = P\_close / (1 + bonus\_ratio)

&#x20;    const bonusRatio = bPct / 100;

&#x20;    const adjustedPrice = pClose / (1 + bonusRatio);

&#x20;    const bonusShares = Math.floor(s \* bonusRatio);

&#x20;    const totalShares = s + bonusShares;

\-    const adjustedWacc = (s \* w) / totalShares;

\+    // Mandatory CDSC/IRD NEPSE WACC rule: bonus shares carry Rs. 100 face value cost basis

\+    const adjustedWacc = ((s \* w) + (bonusShares \* 100)) / totalShares;



```
### 1. Files Inspected in This Turn



From `03-ACCOUNT3-MARKET-PORTFOLIO-UI-PART2.txt`:



\* `src\\components\\MeroShareHub.jsx` (complete)





\* `src\\components\\MinerviniLeaderboard.tsx` (complete)





\* `src\\components\\NepseAgentDashboard.jsx` (complete)





\* `src\\components\\NotificationCenterDrawer.jsx` (complete)





\* `src\\components\\NRBMacroWidget.jsx` (complete)





\* `src\\components\\Portfolio.jsx` \*(partial — attachment truncated mid-file inside section `3B. QUANTITATIVE ACTION \& P\&L FILTER CHIPS`)\*







\*\*Cross-referenced from earlier turns:\*\* `src\\App.jsx`, `src\\constants\\marketRules.js`, `00-SHARED-CONTRACT.txt` project tree, and `src\\components\\AccountManager.jsx`.



> \*\*Attachment Truncation Notice:\*\* `03-ACCOUNT3-MARKET-PORTFOLIO-UI-PART2.txt` was truncated mid-way through `src\\components\\Portfolio.jsx`. The remainder of `Portfolio.jsx` plus `Dashboard.jsx`, `IPOList.jsx`, `PortfolioHub.jsx`, `WaccTaxCalculator.jsx`, `src\\views\\\*`, `src\\context\\\*`, and `src\\hooks\\\*` were not included in either payload yet. Split remaining files into \~300 KB chunks so nothing truncates on upload.

> 

> 



\---



\### 2. Audit Findings Table (Continuing from `A3-027`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-028\*\* | \*\*P0\*\* | `src/components/NepseAgentDashboard.jsx` (`handleRunAnalysis`, `useEffect(\[symbol])`)



&#x20;| Async `fetchAgentScripDossier` and `runAgentAnalysis` have no request-sequence ID or `AbortController`, and switching `symbol` does not clear the prior `agentResult`/`dossier`.



&#x20;| Rapidly switching from Stock A to Stock B keeps Stock A's trade plan visible under Stock B—and a slower LLM response for Stock A overwrites Stock B's entry zones, stop-loss, and verdict (cross-ticker display leak).



&#x20;| Add an incrementing `requestIdRef`, clear `agentResult`/`dossier` when `symbol` changes, and discard responses where `reqId !== requestIdRef.current`. |

| \*\*A3-029\*\* | \*\*P0\*\* | `src/components/NepseAgentDashboard.jsx` (Header timestamp \& Box 4 Net Profit Targets)



&#x20;| (1) Displays outdated `7.5% CGT \& Fees Deducted` badge. (2) Renders `Verified NOTS data as of {new Date(dossier?.meta?.asOf



&#x20;|  | Date.now()).toLocaleTimeString()}`using`Date.now()` fallback and browser local timezone.



&#x20;|

| \*\*A3-030\*\* | \*\*P0\*\* | `src/components/Portfolio.jsx` (`getMeroshareHoldingsRaw`, `resolveScripValuation`)



&#x20;| Sums `units` across all MeroShare accounts, but only adds `valueAsOfPrevClose` / `valueAsOfLTP` when `> 0` (`if (h.valueAsOfPrevClose > 0) holdingsMap\[sym].valueAsOfPrevClose += ...`). `resolveScripValuation` then returns that partial sum whenever `> 0`.



&#x20;| If Family Account 1 (CDSC synced) holds 100 units with `valueAsOfPrevClose = Rs. 50,000` and Account 2 (CSV/manual) holds 100 units with `valueAsOfPrevClose = 0`, consolidated valuation displays \*\*Rs. 50,000 for 200 units\*\*—erasing 50% of portfolio value and showing fake massive losses.



&#x20;| Accumulate per-account valuation using fallback `h.units \* (h.prevClose |

| \*\*A3-031\*\* | \*\*P0\*\* | `src/components/Portfolio.jsx` (`handleApplyImportedHoldings`)



&#x20;| When merging into an existing MeroShare holding, (1) adds `oldUnits + item.units` while overwriting `wacc: item.rate` (not weighted average), (2) leaves stale `valueAsOfPrevClose`/`valueAsOfLTP` from old `units`, and (3) in manual-ledger fallback writes already-fee-inclusive TMS `wacc` as `'buy'` transactions where `getManualHoldingsRaw` adds brokerage+SEBON+DP a second time.



&#x20;| Silently destroys WACC accuracy, freezes market value at pre-import unit count (creating fake losses), and double-counts NEPSE buy fees on TMS imports.



&#x20;| Compute true weighted average WACC, clear/recompute `valueAsOfPrevClose` and `valueAsOfLTP` when units change, and tag imported TMS transactions (`feesIncluded: true`) so `getManualHoldingsRaw` does not re-apply buy fees. |

| \*\*A3-032\*\* | \*\*P0\*\* | `src/components/MeroShareHub.jsx` (`handleAddCustomHolding`, `handleSaveEditHolding`)



&#x20;| Updating `units` preserves old `h.valueAsOfPrevClose` and `h.valueAsOfLTP` from the prior share count. `enrichedHoldings` then uses those stale totals and divides them by the new `units` (`h.valueAsOfPrevClose / h.units`). `handleAddCustomHolding` also omits `isCustomWacc: true` / `waccSource: 'CUSTOM\_USER\_SET'`.



&#x20;| Editing a holding from 100 to 200 units doubles invested cost while keeping market value frozen at 100 units—halving displayed price and showing a fake `-50%` loss.



&#x20;| Recompute `valueAsOfPrevClose` and `valueAsOfLTP` using the preserved per-share `prevClose`/`currentLtp` times the new `units`, and set `isCustomWacc: true`, `waccSource: 'CUSTOM\_USER\_SET'` + `setScripCustomWacc` on manual add. |

| \*\*A3-033\*\* | \*\*P0\*\* | `src/components/Portfolio.jsx` (`getManualHoldingsRaw`, `handleAddTransaction`)



&#x20;| (1) Uses `\[...transactions].reverse()` instead of sorting by `tx.date`. (2) Does not coerce `Number(tx.quantity)` / `Number(tx.price)`. (3) Charges broker commission, SEBON 0.015%, and Rs. 25 DP on EVERY `'buy'` with no zero-fee IPO/FPO/Rights or Rs. 100 par Bonus share handling.



&#x20;| Logging an older buy after a sell processes the sell first and creates phantom shares; string inputs risk string concatenation on `units`; IPO/FPO/Rights and Bonus shares get illegal brokerage/SEBON/DP charges added to WACC.



&#x20;| Sort chronologically by `date` (buys/bonuses before sells on same date), coerce `Number()`, and support `ipo`/`fpo`/`rights` (0 fees) and `bonus` (Rs. 100 par value, 0 fees) plus `feesIncluded` flag. |

| \*\*A3-034\*\* | \*\*P0\*\* | `src/components/MeroShareHub.jsx` \& `src/components/Portfolio.jsx` (`handleRetrievePortfolio`, `handleRetrieveWithToken`)



&#x20;| Cross-file repeat of `A3-006`: both `handleRetrievePortfolio` functions and `MeroShareHub.jsx`'s `handleRetrieveWithToken` lock any holding with `rate !== 100` as `CUSTOM\_USER\_SET` forever. Conversely, `Portfolio.jsx`'s `handleRetrieveWithToken` discards ALL custom WACCs and skips `sanitizeMeroShareHoldings`.



&#x20;| Normal secondary-market holdings freeze on stale WACC after future buys/bonus shares; token sync in `Portfolio.jsx` wipes all user-entered WACCs.



&#x20;| Remove `rate !== 100` lock in all three places (preserve only explicit `isCustomWacc === true` / `CUSTOM\_USER\_SET` / `BROKER\_TMS`), and preserve custom WACCs + run `sanitizeMeroShareHoldings` in `Portfolio.jsx`'s `handleRetrieveWithToken`. |

| \*\*A3-035\*\* | \*\*P0\*\* | `src/components/NRBMacroWidget.jsx` (`buildBaselineNrbMacroData`, `classifyNrbMacroRegime`, full-card render)



&#x20;| `Number(rawRegime.interbankRate ?? ...)` turns an empty string `""` or `0` from a broken scrape into `0`, which satisfies `ibor < 3.0 \&\& cd <= 83.5` and classifies as `🟢 EASING (×1.12)`. Also, full-card mode (`compact={false}`) hides the `BASELINE` warning badge when `liveDataAvailable === false`.



&#x20;| A failed NRB API scrape boosts algorithmic buy signals by +12% under a fake `EASING` liquidity regime, and full-card investors mistake hardcoded baseline rates (`IBOR 4.50%`, `CD 81.5%`) for live NRB data.



&#x20;| Treat `<= 0` or non-finite IBOR/CD/Repo as missing (fall back to baseline, never `0%`), and show an explicit amber `OFFLINE / BASELINE SNAPSHOT` banner in full-card mode whenever `!activeData.liveDataAvailable`. |

| \*\*A3-036\*\* | \*\*P1\*\* | `src/components/NotificationCenterDrawer.jsx` (`item.ltp.toFixed(2)`, `formatTime`, `handleSendTestAlert`)



&#x20;| (1) `item.ltp > 0` is `true` for string `"520.5"` (standard in Android FCM data payloads), then `item.ltp.toFixed(2)` throws `TypeError`. (2) `formatTime` does not validate `isNaN(date.getTime())` or pass `timeZone: 'Asia/Kathmandu'`. (3) `handleSendTestAlert` sets `diagnosticTimerRef` after `await` without an `isMountedRef` check.



&#x20;| Opening the Notification Drawer after receiving an FCM push alert crashes the entire drawer; invalid timestamps render `"Invalid Date"`.



&#x20;| Coerce `const ltpNum = Number(item.ltp)` before checking `> 0` and `.toFixed(2)`; guard `isNaN(date.getTime())` + use `Asia/Kathmandu` in `formatTime`; track `isMountedRef` before setting state/timers. |

| \*\*A3-037\*\* | \*\*P1\*\* | `src/components/MeroShareHub.jsx` (`handleAddProfile`, `handleBulkApply`, `ipo.closeDate`, `useEffect(\[profiles])`, `handleCsvImport`)



&#x20;| (1) `setTimeout(() => handleRetrievePortfolio(newProfile.id), 150)` closes over stale `profiles` where `newProfile` does not exist yet. (2) `handleAddProfile` allows duplicate BOIDs. (3) `handleBulkApply` lacks `try/finally` and skips `minKitta`/multiple-of-10 validation. (4) `ipo.closeDate.split('T')\[0]` shifts UTC timestamps by 1 day vs. NPT. (5) `useEffect(\[profiles])` resets `selectedAccountIds` on every sync. (6) `handleCsvImport` skips `sanitizeMeroShareHoldings`.



&#x20;| Auto-sync after adding a profile always silently aborts; duplicate BOIDs double-count portfolio \& double-apply IPOs; an exception freezes Bulk Apply forever; UTC close dates mislead investors by 1 day; syncing resets chosen accounts.



&#x20;| Pass `newProfile` directly into `handleRetrievePortfolio`, deduplicate by `boid`, wrap `handleBulkApply` in `try/finally` + validate `minKitta`/step-10, format `closeDate` in `Asia/Kathmandu`, preserve existing `selectedAccountIds`, and sanitize CSV imports. |

| \*\*A3-038\*\* | \*\*P1\*\* | `src/components/Portfolio.jsx` (`handleParseImportText`, `handleSyncWaccFromMeroShare`, `handleSearchChange`)



&#x20;| (1) Fallback symbol regex `/^\[A-Z]{2,6}$/i` excludes 7–10 character NEPSE symbols listed in `00-SHARED-CONTRACT.txt` (`BANDIPUR`, `HIMSTAR`, `SWASTIK`, `NICLBSL`, `NABILD2089`, `NICAD2091`). (2) `handleSyncWaccFromMeroShare` maps over stale `meroshareProfiles` after long async batch. (3) `searchDebounceRef` is never cleared on unmount.



&#x20;| Pasting MeroShare/CSV holdings silently drops 7–10 char NEPSE scrips and debentures; concurrent profile edits during WACC batch sync get overwritten.



&#x20;| Expand regex to `/^\[A-Z]\[A-Z0-9]{1,11}$/i` (excluding common header words), use functional state update in `handleSyncWaccFromMeroShare`, and clear `searchDebounceRef` on unmount. |

| \*\*A3-039\*\* | \*\*P1\*\* | `src/components/MinerviniLeaderboard.tsx` (`computeMultiPeriodRS`, `evaluateMinervini`, row clicks)



&#x20;| (1) `rsVsNepse = pChange > nepseChange || recovery52w > 30` auto-passes `c5` (`RS vs NEPSE`) for any stock >30% off 52W low even when lagging NEPSE. (2) `c2` (`ema20 >= ema50 \* 0.99`) passes bearish `ema20 < ema50` stocks and ignores `ema200`. (3) `onSelectStock` prop is never called—clicks only dispatch `open\_service`, which fails when `ServicesHub` is unmounted.



&#x20;| Lagging or downtrending stocks falsely pass Stage-2 Minervini leadership checks; clicking a stock from PredictorHub's leaderboard does nothing.



&#x20;| Require true relative outperformance (`pChange > nepseChange` or verified `rsRating >= 70`), enforce `ema20 > ema50` (and `ltp > ema200` when available), and invoke `onSelectStock(s)` when provided. |

| \*\*A3-040\*\* | \*\*P1\*\* | `src/components/NepseAgentDashboard.jsx` (`handleSelectScrip`)



&#x20;| Calling `if (onSelectStock) onSelectStock(sym)` inside `handleSelectScrip` triggers `App.jsx`'s global `openStockDetail` modal every time the user picks a stock in the Agent's search bar or Hot pills.



&#x20;| Trying to analyze a different stock inside the NEPSE Agent immediately opens `StockDetailModal` on top of the Agent screen, blocking the user from viewing the Agent dossier.



&#x20;| Do not call `onSelectStock` inside `handleSelectScrip`; invoke `onSelectStock` only from a dedicated "Open Full Stock Modal" button. |

| \*\*A3-041\*\* | \*\*P2\*\* | `src/components/MeroShareHub.jsx` (Portfolio sub-tab unsynced card \& bookmarklet link)



&#x20;| Renders BOTH `"No Holdings Synced Yet"` (inside the IIFE) AND `"Demat Balance Locked"` (`!syncedProfileIds.includes(selectedProfileId)`) simultaneously for unsynced accounts; uses `href="javascript:..."` bookmarklet which violates Electron CSP (`tests/bug088ContentSecurityPolicy.test.mjs`).



&#x20;| Duplicate empty-state cards clutter mobile screens; bookmarklet click fails under strict CSP.



&#x20;| Remove the duplicate `!syncedProfileIds.includes(selectedProfileId)` block and replace the `javascript:` href with a "Copy Console Snippet" button. |

| \*\*A3-042\*\* | \*\*P2\*\* | `src/components/Portfolio.jsx`, `src/components/MeroShareHub.jsx`, `src/components/MinerviniLeaderboard.tsx`, `src/components/NepseAgentDashboard.jsx`



&#x20;| `totalPL >= 0` and `pChange >= 0` apply bullish green styling and `+0.00%` / `Profit: Rs. 0.0` to flat/empty zero states; `Portfolio.jsx` lacks a live-vs-EOD last-updated timestamp badge when `valuationMode === 'live'`.



&#x20;| Empty portfolios and flat `0.00%` stocks look bullish green; investors in Live mode cannot verify quote freshness.



&#x20;| Use neutral slate styling for `=== 0` values, omit `+` on zero, and display the live feed timestamp alongside `Active Feed: Live NEPSE Market`. |

| \*\*A3-043\*\* | \*\*P2\*\* | `src/components/NotificationCenterDrawer.jsx`, `src/components/NRBMacroWidget.jsx`



&#x20;| `NotificationCenterDrawer` shows a hardcoded green pulsing `"Live Polling Connected"` dot regardless of `navigator.onLine` or fetch failure; `NRBMacroWidget` compact popover (`width: 310, left: 0`) lacks outside-click dismissal and viewport clamping.



&#x20;| Misleading live status when offline; macro popover stays stuck open or clips on narrow mobile screens.



&#x20;| Gate the pulsing dot on `navigator.onLine` and last fetch success; add click-outside handler and `maxWidth: 'calc(100vw - 24px)'` to `NRBMacroWidget`. |

| \*\*A3-044\*\* | \*\*P3\*\* | `src/components/MeroShareHub.jsx`, `src/components/Portfolio.jsx`



&#x20;| Unused duplicate `getRealClientId` functions diverge from `AccountManager.jsx` (`backend.cdsc.com.np` vs `webbackend.cdsc.com.np`); `showToast` / `setTelegramSyncMsg` timeouts are not cleared on unmount.



&#x20;| Maintenance drift across CDSC endpoints and minor unmount warnings.



&#x20;| Remove dead `getRealClientId` helpers (centralize in `meroShareService.js`) and clear timeout refs on unmount. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/components/NepseAgentDashboard.jsx` (Fixes `A3-028`, `A3-029`, `A3-040`)







```diff

\--- a/src/components/NepseAgentDashboard.jsx

+++ b/src/components/NepseAgentDashboard.jsx

@@ -71,6 +71,7 @@ export default function NepseAgentDashboard({

&#x20;  // Analysis result state

&#x20;  const \[agentResult, setAgentResult] = useState(null);

&#x20;  const \[dossier, setDossier] = useState(null);

&#x20;  const \[activeLangTab, setActiveLangTab] = useState('english'); // 'english' | 'nepali'

\+  const requestIdRef = useRef(0);

&#x20;

&#x20;  // Handle symbol change from props

@@ -85,12 +86,18 @@ export default function NepseAgentDashboard({

&#x20;  const handleRunAnalysis = useCallback(async (targetSym = symbol, query = customQuery) => {

&#x20;    const sym = (targetSym || symbol || '').toUpperCase().trim();

&#x20;    if (!sym) return;

\+    const reqId = ++requestIdRef.current;

&#x20;

&#x20;    setLoading(true);

&#x20;    setError(null);

\+    setAgentResult(prev => (prev?.symbol === sym || dossier?.symbol === sym ? prev : null));

\+    setDossier(prev => (prev?.symbol === sym ? prev : null));

&#x20;    setLoadingStep('1/3: Gathering NOTS quotes \& 120-session floor sheet...');

&#x20;

&#x20;    try {

&#x20;      // Step 1: Pre-fetch dossier for instant UI context

&#x20;      const dos = await fetchAgentScripDossier(sym);

\+      if (reqId !== requestIdRef.current) return;

&#x20;      setDossier(dos);

&#x20;

&#x20;      setLoadingStep('2/3: Calculating RSI, MACD, EMAs \& BCR3 smart money concentration...');

@@ -102,16 +109,21 @@ export default function NepseAgentDashboard({

&#x20;        query: query || customQuery,

&#x20;        model: selectedModel

&#x20;      });

\+      if (reqId !== requestIdRef.current) return;

&#x20;

&#x20;      setAgentResult(analysis);

&#x20;      if (analysis?.dossier) {

&#x20;        setDossier(analysis.dossier);

&#x20;      }

&#x20;    } catch (err) {

\+      if (reqId !== requestIdRef.current) return;

&#x20;      console.error('\[NepseAgentDashboard] Analysis failed:', err);

&#x20;      setError(err.message || 'Failed to complete agent analysis. Please check network connection.');

&#x20;    } finally {

\-      setLoading(false);

\-      setLoadingStep('');

\+      if (reqId === requestIdRef.current) {

\+        setLoading(false);

\+        setLoadingStep('');

\+      }

&#x20;    }

&#x20;  }, \[symbol, customQuery, selectedModel]);

&#x20;

@@ -122,12 +134,11 @@ export default function NepseAgentDashboard({

&#x20;    }

&#x20;  }, \[symbol]);

&#x20;

\-  // Quick select stock from pill or dropdown

\+  // Quick select stock from pill or dropdown (keep user inside Agent Dashboard)

&#x20;  const handleSelectScrip = (s) => {

&#x20;    if (!s) return;

&#x20;    const sym = String(s).toUpperCase().trim();

&#x20;    setSymbol(sym);

\-    if (onSelectStock) onSelectStock(sym);

&#x20;  };

@@ -429,7 +440,18 @@ export default function NepseAgentDashboard({

&#x20;              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

&#x20;                <Clock style={{ width: 12, height: 12 }} />

\-                <span>Verified NOTS data as of {new Date(dossier?.meta?.asOf || Date.now()).toLocaleTimeString()}</span>

\+                <span>

\+                  {dossier?.meta?.asOf \&\& !isNaN(new Date(dossier.meta.asOf).getTime())

\+                    ? `Verified NOTS data as of ${new Intl.DateTimeFormat('en-US', {

\+                        timeZone: 'Asia/Kathmandu',

\+                        hour: '2-digit',

\+                        minute: '2-digit',

\+                        second: '2-digit',

\+                        hour12: true

\+                      }).format(new Date(dossier.meta.asOf))} NPT`

\+                    : 'Data timestamp unavailable (verify live quote)'}

\+                </span>

&#x20;              </div>

&#x20;            </div>

&#x20;          </div>

@@ -579,7 +601,7 @@ export default function NepseAgentDashboard({

&#x20;                  <span style={{ fontSize: 12, fontWeight: 800, color: '#c084fc', textTransform: 'uppercase' }}>

&#x20;                    Net Profit Targets

&#x20;                  </span>

&#x20;                  <span style={{ fontSize: 12, color: '#d8b4fe', background: 'rgba(147, 51, 234, 0.15)', padding: '2px 6px', borderRadius: 6 }}>

\-                    7.5% CGT \& Fees Deducted

\+                    5.0% ST CGT \& Fees Deducted

&#x20;                  </span>

&#x20;                </div>



```



\---



\#### `src/components/NRBMacroWidget.jsx` (Fixes `A3-035`)







```diff

\--- a/src/components/NRBMacroWidget.jsx

+++ b/src/components/NRBMacroWidget.jsx

@@ -23,9 +23,13 @@ const REGIME\_META = {

&#x20;};

&#x20;

&#x20;export function classifyNrbMacroRegime(interbankRate = 4.5, policyRepoRate = 5.0, cdRatio = 81.5) {

\-  const ibor = Number.isFinite(Number(interbankRate)) ? Number(interbankRate) : 4.5;

\-  const repo = Number.isFinite(Number(policyRepoRate)) ? Number(policyRepoRate) : 5.0;

\-  const cd = Number.isFinite(Number(cdRatio)) ? Number(cdRatio) : 81.5;

\+  const parsedIbor = Number(interbankRate);

\+  const parsedRepo = Number(policyRepoRate);

\+  const parsedCd = Number(cdRatio);

\+  // Reject 0 / empty-string / negative scrape failures so they never trigger fake EASING

\+  const ibor = Number.isFinite(parsedIbor) \&\& parsedIbor > 0 ? parsedIbor : 4.5;

\+  const repo = Number.isFinite(parsedRepo) \&\& parsedRepo > 0 ? parsedRepo : 5.0;

\+  const cd = Number.isFinite(parsedCd) \&\& parsedCd > 0 ? parsedCd : 81.5;

&#x20;

&#x20;  if (ibor > 8.5 || cd > 89.0) {

@@ -66,9 +70,13 @@ export function classifyNrbMacroRegime(interbankRate = 4.5, policyRepoRate = 5.0

&#x20;export function buildBaselineNrbMacroData(overrides = {}) {

&#x20;  const rawRegime = overrides?.macroRegime || {};

&#x20;  const mp = overrides?.monetaryPolicy || {};

\-  const ibor = Number(rawRegime.interbankRate ?? mp?.interbankRate?.value ?? 4.5);

\-  const repo = Number(rawRegime.policyRepoRate ?? mp?.policyRepoRate?.value ?? 5.0);

\-  const cdRatio = Number(rawRegime.cdRatio ?? mp?.cdRatio?.value ?? 81.5);

\+  const pickPositive = (a, b, fallback) => {

\+    const na = Number(a); if (Number.isFinite(na) \&\& na > 0) return na;

\+    const nb = Number(b); if (Number.isFinite(nb) \&\& nb > 0) return nb;

\+    return fallback;

\+  };

\+  const ibor = pickPositive(rawRegime.interbankRate, mp?.interbankRate?.value, 4.5);

\+  const repo = pickPositive(rawRegime.policyRepoRate, mp?.policyRepoRate?.value, 5.0);

\+  const cdRatio = pickPositive(rawRegime.cdRatio, mp?.cdRatio?.value, 81.5);

&#x20;  const normalizedRegime = classifyNrbMacroRegime(ibor, repo, cdRatio);

@@ -225,6 +233,17 @@ export function NRBMacroWidget({ compact = false }) {

&#x20;        }}>↻ Refresh</button>

&#x20;      </div>

&#x20;

\+      {!activeData.liveDataAvailable \&\& (

\+        <div style={{

\+          fontSize: 12, color: '#fbbf24', background: 'rgba(251,191,36,0.10)',

\+          border: '1px solid rgba(251,191,36,0.35)', borderRadius: 10,

\+          padding: '8px 12px', marginBottom: 12, fontWeight: 700

\+        }}>

\+          ⚠️ {loading ? 'Syncing live NRB monetary indicators...' : 'Offline Baseline Snapshot Active — Live NRB feed unavailable. Verify current IBOR \& CD Ratio at nrb.org.np before relying on macro multiplier.'}

\+        </div>

\+      )}

\+

&#x20;      <div style={{

&#x20;        fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, marginBottom: 14,



```



\---



\#### `src/components/NotificationCenterDrawer.jsx` (Fixes `A3-036`)







```diff

\--- a/src/components/NotificationCenterDrawer.jsx

+++ b/src/components/NotificationCenterDrawer.jsx

@@ -76,6 +76,7 @@ export function NotificationCenterDrawer({

&#x20;  const \[adminKeyInput, setAdminKeyInput] = useState('');

&#x20;  const \[showAdminKeyInput, setShowAdminKeyInput] = useState(false);

&#x20;  const diagnosticTimerRef = useRef(null);

\+  const isMountedRef = useRef(true);

&#x20;

@@ -107,6 +108,7 @@ export function NotificationCenterDrawer({

&#x20;

&#x20;  // Listen for real-time notification arrivals \& clean up diagnostic timer on unmount

&#x20;  useEffect(() => {

\+    isMountedRef.current = true;

&#x20;    const handleUpdate = () => {

&#x20;      setNotifications(getCachedNotifications('all'));

&#x20;    };

@@ -115,6 +117,7 @@ export function NotificationCenterDrawer({

&#x20;    window.addEventListener('dravyashree\_smart\_alert\_received', handleUpdate);

&#x20;

&#x20;    return () => {

\+      isMountedRef.current = false;

&#x20;      window.removeEventListener('dravyashree\_notifications\_updated', handleUpdate);

&#x20;      window.removeEventListener('dravyashree\_smart\_alert\_received', handleUpdate);

&#x20;      if (diagnosticTimerRef.current) {

@@ -162,6 +165,7 @@ export function NotificationCenterDrawer({

&#x20;        body: 'Real-time alert delivery verified across system status bar.',

&#x20;        adminKey: adminKeyInput

&#x20;      });

\+      if (!isMountedRef.current) return;

&#x20;

&#x20;      const serverStatus = diag.server.success 

&#x20;        ? `✅ Server: Dispatched (ID: ${diag.server.alertId})`

@@ -173,14 +177,15 @@ export function NotificationCenterDrawer({

&#x20;

&#x20;      setDiagnosticMsg(`${serverStatus}\\n${phoneStatus}`);

&#x20;      await loadNotifications();

\+      if (!isMountedRef.current) return;

&#x20;      diagnosticTimerRef.current = setTimeout(() => {

&#x20;        diagnosticTimerRef.current = null;

&#x20;        setDiagnosticMsg(null);

&#x20;      }, 12000);

&#x20;    } catch (err) {

\-      setDiagnosticMsg(`Error: ${err.message}`);

\+      if (isMountedRef.current) setDiagnosticMsg(`Error: ${err.message}`);

&#x20;    } finally {

\-      setIsTesting(false);

\+      if (isMountedRef.current) setIsTesting(false);

&#x20;    }

&#x20;  };

&#x20;

@@ -188,6 +193,7 @@ export function NotificationCenterDrawer({

&#x20;    if (!ts) return 'Just now';

&#x20;    try {

&#x20;      const date = new Date(ts);

\+      if (isNaN(date.getTime())) return 'Recent';

&#x20;      const now = new Date();

&#x20;      const diffMs = now - date;

&#x20;      const diffMins = Math.floor(diffMs / 60000);

@@ -195,7 +201,7 @@ export function NotificationCenterDrawer({

&#x20;      if (diffMins < 60) return `${diffMins}m ago`;

&#x20;      const diffHrs = Math.floor(diffMins / 60);

&#x20;      if (diffHrs < 24) return `${diffHrs}h ago`;

\-      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

\+      return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', month: 'short', day: 'numeric' }).format(date);

&#x20;    } catch (\_) {

&#x20;      return 'Recent';

&#x20;    }

@@ -429,11 +435,14 @@ export function NotificationCenterDrawer({

&#x20;                    {item.symbol \&\& (

&#x20;                      <span className="text-xs font-black text-white tracking-wide bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">

&#x20;                        {item.symbol}

&#x20;                      </span>

&#x20;                    )}

&#x20;

\-                    {item.ltp > 0 \&\& (

\-                      <span className="text-xs font-mono font-bold text-emerald-400">

\-                        Rs. {item.ltp.toFixed(2)}

\-                      </span>

\-                    )}

\+                    {(() => {

\+                      const ltpNum = Number(item.ltp);

\+                      return Number.isFinite(ltpNum) \&\& ltpNum > 0 ? (

\+                        <span className="text-xs font-mono font-bold text-emerald-400">

\+                          Rs. {ltpNum.toFixed(2)}

\+                        </span>

\+                      ) : null;

\+                    })()}



```



\---



\#### `src/components/MinerviniLeaderboard.tsx` (Fixes `A3-039`)







```diff

\--- a/src/components/MinerviniLeaderboard.tsx

+++ b/src/components/MinerviniLeaderboard.tsx

@@ -62,8 +62,9 @@ function computeMultiPeriodRS(s: any, nepseChange: number): { rsScore: number; r

&#x20;  // Composite RS score: 60% recovery + 40% range position

&#x20;  const rsScore = Math.round(0.60 \* Math.min(recovery52w, 100) + 0.40 \* Math.max(0, Math.min(100, rangePosition)));

&#x20;

\-  // RS vs NEPSE: stock's recent momentum > index momentum (never fabricate recovery52w > 30 from 0.70\*ltp!)

\-  const rsVsNepse = Number(s.pChange || 0) > nepseChange || recovery52w > 30;

\+  // True RS vs NEPSE: require active relative outperformance vs index (or verified RS rating >= 70), not redundant 52W low distance

\+  const rsRating = Number(s.rsRating ?? s.mansfieldRS ?? NaN);

\+  const rsVsNepse = Number.isFinite(rsRating) ? rsRating >= 70 : (Number(s.pChange || 0) > nepseChange \&\& rangePosition >= 50);

&#x20;

&#x20;  return { rsScore, rsVsNepse };

&#x20;}

@@ -71,6 +72,7 @@ function computeMultiPeriodRS(s: any, nepseChange: number): { rsScore: number; r

&#x20;function evaluateMinervini(s: any, nepseChange: number): { checks: boolean\[]; score: number } {

&#x20;  const ltp        = Number(s.ltp   || 0);

&#x20;  const ema20      = Number(s.ema20 || 0);

&#x20;  const ema50      = Number(s.ema50 || 0);

\+  const ema200     = Number(s.ema200 || 0);

&#x20;  const high52w    = Number(s.high52w || s.high52 || s.fiftyTwoWeekHigh || 0);

&#x20;  const low52w     = Number(s.low52w  || s.low52  || s.fiftyTwoWeekLow  || 0);

&#x20;  const volZ       = Number(s.volumeZScore || 0);

@@ -79,7 +81,7 @@ function evaluateMinervini(s: any, nepseChange: number): { checks: boolean\[]; sc

&#x20;  const { rsVsNepse } = computeMultiPeriodRS(s, nepseChange);  // P5: multi-period RS

&#x20;

&#x20;  const c1 = ltp > 0 \&\& ema50 > 0 \&\& ltp > ema50;

\-  const c2 = ema50 > 0 \&\& ema20 > 0 \&\& ema20 >= ema50 \* 0.99;  // EMA20 not far below EMA50

\+  const c2 = ema50 > 0 \&\& ema20 > 0 \&\& ema20 > ema50 \&\& (ema200 <= 0 || (ltp > ema200 \&\& ema50 >= ema200));

&#x20;  const c3 = ltp > 0 \&\& high52w > 0 \&\& ltp >= high52w \* 0.75;   // within 25% of verified 52W high

&#x20;  const c4 = ltp > 0 \&\& low52w  > 0 \&\& ltp >= low52w  \* 1.30;   // > 30% above verified 52W low

@@ -208,7 +210,12 @@ export function MinerviniLeaderboard({ stocks: rawStocks = \[], indices, onSelect

&#x20;              <div key={s.symbol}

&#x20;                className="flex-shrink-0 rounded-xl bg-slate-800/60 border border-slate-700 p-3 min-w-\[100px] text-center cursor-pointer hover:border-amber-600/50 transition"

\-                onClick={() => window.dispatchEvent(new CustomEvent('open\_service', { detail: { serviceId: 'entry-exit-analyzer', symbol: s.symbol } }))}

\+                onClick={() => {

\+                  if (onSelectStock) onSelectStock(s);

\+                  else window.dispatchEvent(new CustomEvent('open\_service', { detail: { serviceId: 'entry-exit-analyzer', symbol: s.symbol } }));

\+                }}

&#x20;              >

@@ -335,7 +342,10 @@ export function MinerviniLeaderboard({ stocks: rawStocks = \[], indices, onSelect

&#x20;                    <td className="py-2.5 px-3 text-center">

&#x20;                      <button

\-                        onClick={() => window.dispatchEvent(new CustomEvent('open\_service', { detail: { serviceId: 'entry-exit-analyzer', symbol: s.symbol } }))}

\+                        onClick={() => {

\+                          if (onSelectStock) onSelectStock(s);

\+                          else window.dispatchEvent(new CustomEvent('open\_service', { detail: { serviceId: 'entry-exit-analyzer', symbol: s.symbol } }));

\+                        }}

&#x20;                        className="inline-flex items-center gap-1 text-\[9px] px-2 py-1 rounded-lg bg-purple-900/40 text-purple-300 border border-purple-700/40 hover:bg-purple-800/40 transition font-semibold whitespace-nowrap"

&#x20;                      >



```



\---



\#### `src/components/MeroShareHub.jsx` (Fixes `A3-032`, `A3-034`, `A3-037`)







```diff

\--- a/src/components/MeroShareHub.jsx

+++ b/src/components/MeroShareHub.jsx

@@ -22,6 +22,7 @@ import { sanitizeMeroShareHoldings, guessScripBasePrice, setScripCustomWacc, str

&#x20;import { syncUserDataToCloud, fetchUserDataFromCloud } from '../utils/firebase';

&#x20;import { loadEncryptedUserProfiles, saveEncryptedUserProfiles } from '../utils/profileVaultStorage';

&#x20;import { Capacitor } from '@capacitor/core';

+import { formatNptDateIso } from '../utils/nepseCalendar';

&#x20;

@@ -276,12 +277,17 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;    };

&#x20;  }, \[userId]);

&#x20;

\-  // Sync selected account IDs with loaded profiles by default

\+  // Preserve user selection on profile syncs; only select all on initial load or drop deleted IDs

&#x20;  useEffect(() => {

\-    if (profiles.length > 0) {

\-      setSelectedAccountIds(profiles.map(p => p.id));

\-    } else {

\+    if (profiles.length === 0) {

&#x20;      setSelectedAccountIds(\[]);

\+      return;

&#x20;    }

\+    setSelectedAccountIds(prev => {

\+      const validIds = new Set(profiles.map(p => p.id));

\+      const kept = prev.filter(id => validIds.has(id));

\+      return kept.length > 0 ? kept : profiles.map(p => p.id);

\+    });

&#x20;  }, \[profiles]);

@@ -470,7 +476,11 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;      setIsSavingAccount(false);

&#x20;    }

&#x20;

\-    const updated = \[...profiles, newProfile];

\+    // Deduplicate by BOID so re-adding a family Demat never double-counts holdings or double-applies IPOs

\+    const existingBoid = profiles.find(p => p.boid === newProfile.boid);

\+    const finalProfile = existingBoid ? { ...existingBoid, ...newProfile, id: existingBoid.id, holdings: existingBoid.holdings || \[] } : newProfile;

\+    const updated = existingBoid

\+      ? profiles.map(p => (p.boid === newProfile.boid ? finalProfile : p))

\+      : \[...profiles, finalProfile];

&#x20;    saveProfilesToStorage(updated);

&#x20;    

&#x20;    // Always select the newly added profile so Portfolio tab is ready to fetch it

\-    setSelectedProfileId(newProfile.id);

\+    setSelectedProfileId(finalProfile.id);

@@ -486,7 +496,7 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;

&#x20;    // Auto-navigate to Portfolio and begin retrieval for the new profile

&#x20;    setActiveSubTab('portfolio');

\-    setTimeout(() => handleRetrievePortfolio(newProfile.id), 150);

\+    setTimeout(() => handleRetrievePortfolio(finalProfile.id, finalProfile, updated), 150);

&#x20;  };

@@ -721,7 +731,14 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;      return;

&#x20;    }

&#x20;

\-    const totalKitta = Number(customAppliedKitta || 10);

\+    const minKitta = Math.max(10, Number(activeIpo.minKitta || 10));

\+    const maxKitta = Math.max(minKitta, Number(activeIpo.maxKitta || 10000));

\+    const rawKitta = Number(customAppliedKitta || 0);

\+    if (!Number.isFinite(rawKitta) || rawKitta < minKitta || rawKitta > maxKitta || rawKitta % 10 !== 0) {

\+      showToast(`Invalid quantity: must be between ${minKitta} and ${maxKitta} kitta in multiples of 10.`, 'error');

\+      return;

\+    }

\+    const totalKitta = rawKitta;

&#x20;    const costPerAccount = totalKitta \* (activeIpo.amountPerShare || 100);

@@ -738,32 +755,44 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;    let successCount = 0;

&#x20;    let failCount = 0;

&#x20;

\-    for (let i = 0; i < targetProfiles.length; i++) {

\-      const profile = targetProfiles\[i];

\-

\-      if (i > 0) {

\-        await new Promise(r => setTimeout(r, 1200));

\+    try {

\+      for (let i = 0; i < targetProfiles.length; i++) {

\+        const profile = targetProfiles\[i];

\+

\+        if (i > 0) {

\+          await new Promise(r => setTimeout(r, 1200));

\+        }

\+

\+        setApplyResults(prev => \[

\+          ...prev.filter(r => r.id !== profile.id),

\+          { id: profile.id, name: profile.name, boid: profile.boid, status: 'loading', resultText: 'Authenticating \& Submitting C-ASBA...' }

\+        ]);

\+

\+        const targetCompanyId = String(activeIpo.id || selectedIpo || '').trim();

\+        try {

\+          const res = await applyIpoDirect(profile, targetCompanyId, totalKitta, activeIpo);

\+          if (res.success) successCount++;

\+          else failCount++;

\+

\+          setApplyResults(prev => \[

\+            ...prev.filter(r => r.id !== profile.id),

\+            {

\+              id: profile.id,

\+              name: profile.name,

\+              boid: profile.boid,

\+              status: res.success ? 'applied' : 'failed',

\+              resultText: res.success ? `✅ ${res.message}` : `❌ ${res.message}`,

\+              units: res.success ? totalKitta : 0

\+            }

\+          ]);

\+        } catch (applyErr) {

\+          failCount++;

\+          setApplyResults(prev => \[

\+            ...prev.filter(r => r.id !== profile.id),

\+            { id: profile.id, name: profile.name, boid: profile.boid, status: 'failed', resultText: `❌ ${applyErr.message || 'C-ASBA network error'}`, units: 0 }

\+          ]);

\+        }

&#x20;      }

\-      ...

\+    } finally {

\+      setIsApplying(false);

&#x20;    }

\-

\-    setIsApplying(false);

&#x20;    showToast(

&#x20;      `Bulk Apply Finished: ✅ ${successCount} Successful, ❌ ${failCount} Failed.`,

&#x20;      failCount > 0 ? 'warning' : 'success'

&#x20;    );

&#x20;  };

@@ -821,9 +850,10 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;  };

&#x20;

&#x20;  // Trigger direct live retrieval of Demat portfolio from CDSC MeroShare

\-  const handleRetrievePortfolio = async (profileId) => {

\+  const handleRetrievePortfolio = async (profileId, profileOverride = null, profilesSnapshot = null) => {

&#x20;    if (!profileId) return;

\-    const profile = profiles.find(p => p.id === profileId);

\+    const sourceList = Array.isArray(profilesSnapshot) ? profilesSnapshot : profiles;

\+    const profile = profileOverride || sourceList.find(p => p.id === profileId);

&#x20;    if (!profile) return;

@@ -852,7 +882,7 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;        const sym = (h.script || h.scrip || h.symbol || '').toUpperCase().trim();

&#x20;        if (sym) {

&#x20;          const rate = Number(h.userWacc || h.wacc || h.purchasePrice || h.effectiveRate || 0);

\-          if (rate > 0 \&\& (h.isCustomWacc || h.waccSource === 'CUSTOM\_USER\_SET' || h.waccSource === 'BROKER\_TMS' || rate !== 100)) {

\+          if (rate > 0 \&\& (h.isCustomWacc === true || h.waccSource === 'CUSTOM\_USER\_SET' || h.waccSource === 'BROKER\_TMS')) {

&#x20;            existingWaccMap\[sym] = { rate, source: h.waccSource || 'CUSTOM\_USER\_SET' };

&#x20;          }

&#x20;        }

@@ -895,7 +925,7 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;      await new Promise(r => setTimeout(r, 400));

&#x20;

&#x20;      // Update profiles with holdings and last-synced timestamp, then save

\-      const updatedProfiles = profiles.map(p => {

\+      const updatedProfiles = sourceList.map(p => {

&#x20;        if (p.id === profileId) {

&#x20;          return {

&#x20;            ...p,

@@ -956,7 +986,7 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;        const sym = (h.script || h.scrip || h.symbol || '').toUpperCase().trim();

&#x20;        if (sym) {

&#x20;          const rate = Number(h.userWacc || h.wacc || h.purchasePrice || h.effectiveRate || 0);

\-          if (rate > 0 \&\& (h.isCustomWacc || h.waccSource === 'CUSTOM\_USER\_SET' || rate !== 100)) {

\+          if (rate > 0 \&\& (h.isCustomWacc === true || h.waccSource === 'CUSTOM\_USER\_SET' || h.waccSource === 'BROKER\_TMS')) {

&#x20;            existingWaccMap\[sym] = rate;

&#x20;          }

&#x20;        }

@@ -1028,9 +1058,10 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;      if (parsedHoldings.length === 0) {

&#x20;        showToast("No valid holdings parsed from this CSV. Please export from MeroShare 'My Portfolio'.", "error");

&#x20;        return;

&#x20;      }

&#x20;

&#x20;      const updatedProfiles = profiles.map(p => {

&#x20;        if (p.id === profileId) {

\-          return { ...p, holdings: parsedHoldings, lastSyncedAt: Date.now() };

\+          const sanitized = sanitizeMeroShareHoldings(parsedHoldings, userId, p.id || p.boid);

\+          return { ...p, holdings: sanitized.map(h => stripHoldingForStorage(h)).filter(Boolean), lastSyncedAt: Date.now() };

&#x20;        }

&#x20;        return p;

&#x20;      });

@@ -1057,17 +1088,26 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;    const updatedProfiles = profiles.map(p => {

&#x20;      if (p.id === selectedProfileId) {

&#x20;        const existingHoldings = p.holdings || \[];

&#x20;        const exists = existingHoldings.some(h => h.symbol === newHoldingSymbol);

&#x20;        let newHoldings;

&#x20;        if (exists) {

&#x20;          newHoldings = existingHoldings.map(h => {

&#x20;            if (h.symbol === newHoldingSymbol) {

\-              const newUnits = h.units + units;

\-              const newWacc = ((h.units \* h.wacc) + (units \* wacc)) / newUnits;

\-              return { ...h, units: newUnits, wacc: Number(Number(newWacc || 0).toFixed(2)) };

\+              const oldUnits = Number(h.units) || 0;

\+              const oldWacc = Number(h.wacc) || wacc;

\+              const newUnits = oldUnits + units;

\+              const newWacc = Number((((oldUnits \* oldWacc) + (units \* wacc)) / newUnits).toFixed(2));

\+              const unitPrevClose = h.prevClose > 0 ? h.prevClose : (oldUnits > 0 \&\& h.valueAsOfPrevClose > 0 ? h.valueAsOfPrevClose / oldUnits : 0);

\+              const unitLtp = h.currentLtp > 0 ? h.currentLtp : (oldUnits > 0 \&\& h.valueAsOfLTP > 0 ? h.valueAsOfLTP / oldUnits : 0);

\+              setScripCustomWacc(h.symbol, newWacc, userId, selectedProfileId);

\+              return {

\+                ...h,

\+                units: newUnits,

\+                wacc: newWacc,

\+                isCustomWacc: true,

\+                waccSource: 'CUSTOM\_USER\_SET',

\+                valueAsOfPrevClose: unitPrevClose > 0 ? Number((newUnits \* unitPrevClose).toFixed(2)) : 0,

\+                valueAsOfLTP: unitLtp > 0 ? Number((newUnits \* unitLtp).toFixed(2)) : 0

\+              };

&#x20;            }

&#x20;            return h;

&#x20;          });

&#x20;        } else {

&#x20;          const stk = marketStocks.find(s => s.symbol === newHoldingSymbol);

\+          setScripCustomWacc(newHoldingSymbol, wacc, userId, selectedProfileId);

&#x20;          newHoldings = \[...existingHoldings, {

&#x20;            symbol: newHoldingSymbol,

&#x20;            name: stk ? stk.name : newHoldingSymbol,

&#x20;            units,

\-            wacc

\+            wacc,

\+            isCustomWacc: true,

\+            waccSource: 'CUSTOM\_USER\_SET'

&#x20;          }];

&#x20;        }

&#x20;        return { ...p, holdings: newHoldings };

@@ -1096,12 +1136,17 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;      if (p.id === selectedProfileId) {

&#x20;        const newHoldings = (p.holdings || \[]).map(h => {

&#x20;          if ((h.symbol || '').toUpperCase() === cleanSym) {

\+            const oldUnits = Number(h.units) || 0;

\+            const unitPrevClose = h.prevClose > 0 ? h.prevClose : (oldUnits > 0 \&\& h.valueAsOfPrevClose > 0 ? h.valueAsOfPrevClose / oldUnits : 0);

\+            const unitLtp = h.currentLtp > 0 ? h.currentLtp : (oldUnits > 0 \&\& h.valueAsOfLTP > 0 ? h.valueAsOfLTP / oldUnits : 0);

&#x20;            return {

&#x20;              ...h,

&#x20;              units,

&#x20;              wacc: Number(wacc.toFixed(2)),

&#x20;              userWacc: Number(wacc.toFixed(2)),

&#x20;              isCustomWacc: true,

\-              waccSource: 'CUSTOM\_USER\_SET'

\+              waccSource: 'CUSTOM\_USER\_SET',

\+              valueAsOfPrevClose: unitPrevClose > 0 ? Number((units \* unitPrevClose).toFixed(2)) : 0,

\+              valueAsOfLTP: unitLtp > 0 ? Number((units \* unitLtp).toFixed(2)) : 0

&#x20;            };

&#x20;          }

&#x20;          return h;

@@ -1432,7 +1477,7 @@ export default function MeroShareHub({ apiStatus, marketStocks = \[], userId = 'g

&#x20;                          {(ipoCompanies || \[]).filter(ipo => ipo \&\& ipo.status === 'Open').map(ipo => (

&#x20;                            <option key={ipo.id || ipo.name} value={ipo.id}>

\-                              {ipo.name || 'Unknown Company'} ({ipo.type || 'IPO'}) — Closes {ipo.closeDate ? (typeof ipo.closeDate === 'string' ? ipo.closeDate.split('T')\[0] : 'Soon') : 'Soon'}

\+                              {ipo.name || 'Unknown Company'} ({ipo.type || 'IPO'}) — Closes {ipo.closeDate ? (typeof ipo.closeDate === 'string' \&\& ipo.closeDate.includes('T') ? formatNptDateIso(new Date(ipo.closeDate)) : String(ipo.closeDate).slice(0, 10)) : 'Soon'}

&#x20;                            </option>

&#x20;                          ))}



```



\---



\#### `src/components/Portfolio.jsx` (Fixes `A3-030`, `A3-031`, `A3-033`, `A3-034`, `A3-038`)







```diff

\--- a/src/components/Portfolio.jsx

+++ b/src/components/Portfolio.jsx

@@ -141,6 +141,10 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;  const searchDebounceRef = useRef(null);

&#x20;

\+  useEffect(() => {

\+    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };

\+  }, \[]);

\+

&#x20;  const handleSearchChange = useCallback((val) => {

@@ -355,7 +359,7 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;        }

&#x20;

\-        if (prev \&\& (prev.isCustomWacc || prev.waccSource === 'CUSTOM\_USER\_SET' || prev.waccSource === 'BROKER\_TMS' || (prev.wacc > 0 \&\& prev.wacc !== 100))) {

\+        if (prev \&\& (prev.isCustomWacc === true || prev.waccSource === 'CUSTOM\_USER\_SET' || prev.waccSource === 'BROKER\_TMS')) {

&#x20;          return {

&#x20;            ...fresh,

&#x20;            wacc: prev.wacc,

@@ -421,7 +425,13 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;      }

&#x20;

&#x20;      const msaList = portfolioData.data?.meroShareMyPortfolio || portfolioData.data?.msaList || portfolioData.data || \[];

\-      const parsedHoldings = msaList.map(item => {

\+      const prevMap = {};

\+      (profile.holdings || \[]).forEach(h => {

\+        const s = (h.symbol || h.script || h.scrip || '').toUpperCase().trim();

\+        if (s \&\& (h.isCustomWacc === true || h.waccSource === 'CUSTOM\_USER\_SET' || h.waccSource === 'BROKER\_TMS')) prevMap\[s] = h;

\+      });

\+      const rawParsed = msaList.map(item => {

&#x20;        const symbol = (item.script || item.scrip || item.symbol || '').trim().toUpperCase();

@@ -440,8 +450,11 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;        const valueAsOfLTP = valLtpRaw > 0 ? valLtpRaw : parseFloat((units \* currentLtp).toFixed(2));

&#x20;        const valueAsOfPrevClose = valCloseRaw > 0 ? valCloseRaw : parseFloat((units \* prevCloseResolved).toFixed(2));

&#x20;

\-        let wacc = parseFloat(item.wacc || item.purchasePrice || item.costPrice || base);

\+        const prevCustom = prevMap\[symbol];

\+        let wacc = prevCustom ? Number(prevCustom.wacc) : parseFloat(item.wacc || item.purchasePrice || item.costPrice || base);

&#x20;        if (isNaN(wacc) || wacc <= 0) wacc = base;

&#x20;

&#x20;        return {

@@ -454,10 +467,13 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;          valueAsOfLTP,

&#x20;          valueAsOfPrevClose,

&#x20;          currentMarketValue: valueAsOfLTP > 0 ? valueAsOfLTP : parseFloat((units \* currentLtp).toFixed(2)),

\-          wacc: Number(Number(wacc || 0).toFixed(2))

\+          wacc: Number(Number(wacc || 0).toFixed(2)),

\+          isCustomWacc: Boolean(prevCustom),

\+          waccSource: prevCustom?.waccSource

&#x20;        };

&#x20;      }).filter(h => h.symbol \&\& h.units > 0);

\+      const parsedHoldings = sanitizeMeroShareHoldings(rawParsed, userId, profile.id || profile.boid);

@@ -540,7 +556,9 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;      const tokens = line.split(/\[,\\t|]|\\s{2,}/).map(t => t.trim().replace(/\['"]/g, '')).filter(Boolean);

&#x20;      if (tokens.length >= 2) {

\-        const symIdx = tokens.findIndex(t => /^\[A-Z]{2,6}$/i.test(t));

\+        // Match 2-12 char NEPSE symbols \& debentures (e.g. BANDIPUR, HIMSTAR, SWASTIK, NICLBSL, NABILD2089)

\+        const headerWords = new Set(\['SCRIP', 'SYMBOL', 'UNITS', 'QTY', 'BALANCE', 'RATE', 'WACC', 'TOTAL', 'BUY', 'SELL']);

\+        const symIdx = tokens.findIndex(t => /^\[A-Z]\[A-Z0-9]{1,11}$/i.test(t) \&\& !headerWords.has(t.toUpperCase()));

&#x20;        if (symIdx !== -1) {

@@ -587,13 +605,21 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;      importParsedItems.forEach(item => {

&#x20;        const idx = existingHoldings.findIndex(h => (h.symbol || '').toUpperCase() === item.symbol);

&#x20;        if (idx !== -1) {

\+          const oldH = existingHoldings\[idx];

\+          const oldUnits = Number(oldH.units) || 0;

\+          const oldWacc = Number(oldH.wacc) || item.rate;

\+          const mergedUnits = oldUnits + Number(item.units);

\+          const weightedWacc = mergedUnits > 0 ? Number((((oldUnits \* oldWacc) + (Number(item.units) \* Number(item.rate))) / mergedUnits).toFixed(2)) : item.rate;

\+          const unitPrev = oldH.prevClose > 0 ? oldH.prevClose : (oldUnits > 0 \&\& oldH.valueAsOfPrevClose > 0 ? oldH.valueAsOfPrevClose / oldUnits : 0);

\+          const unitLtp = oldH.currentLtp > 0 ? oldH.currentLtp : (oldUnits > 0 \&\& oldH.valueAsOfLTP > 0 ? oldH.valueAsOfLTP / oldUnits : 0);

&#x20;          existingHoldings\[idx] = {

\-            ...existingHoldings\[idx],

\-            units: existingHoldings\[idx].units + item.units,

\-            wacc: item.rate,

\+            ...oldH,

\+            units: mergedUnits,

\+            wacc: weightedWacc,

\+            valueAsOfPrevClose: unitPrev > 0 ? Number((mergedUnits \* unitPrev).toFixed(2)) : 0,

\+            valueAsOfLTP: unitLtp > 0 ? Number((mergedUnits \* unitLtp).toFixed(2)) : 0,

&#x20;            waccSource: item.source || 'BROKER\_TMS',

&#x20;            isCustomWacc: true

&#x20;          };

@@ -617,11 +643,12 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;      // Import directly into Manual Trade Ledger (mark feesIncluded so TMS WACC is not double-charged brokerage/SEBON/DP)

&#x20;      const newTransactions = importParsedItems.map(item => ({

&#x20;        id: `${Date.now()}\_${item.symbol}\_${Math.random().toString(36).substr(2, 4)}`,

&#x20;        type: 'buy',

&#x20;        symbol: item.symbol,

\-        quantity: item.units,

\-        price: item.rate,

\+        quantity: Number(item.units),

\+        price: Number(item.rate),

\+        feesIncluded: item.source === 'BROKER\_TMS' || item.source === 'MEROSHARE',

&#x20;        date: formatNptDateIso(new Date())

&#x20;      }));

@@ -637,16 +664,18 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;  const handleAddTransaction = (e) => {

&#x20;    e.preventDefault();

\-    if (quantity <= 0 || price <= 0) {

\+    const numQty = Number(quantity);

\+    const numPrice = type === 'bonus' ? 100 : Number(price);

\+    if (!Number.isFinite(numQty) || numQty <= 0 || !Number.isFinite(numPrice) || numPrice <= 0) {

&#x20;      alert("Quantity and Price must be positive numbers.");

&#x20;      return;

&#x20;    }

&#x20;

&#x20;    const newTx = {

&#x20;      id: Date.now().toString(),

&#x20;      type,

&#x20;      symbol: symbol.trim().toUpperCase(),

\-      quantity,

\-      price,

\+      quantity: numQty,

\+      price: numPrice,

&#x20;      date

&#x20;    };

@@ -887,12 +916,13 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;      if (count > 0) {

&#x20;        // Persist discovered WACCs into user's custom WACC map in localStorage

&#x20;        applyDiscoveredWaccMap(discoveredMap, userId, accountId);

&#x20;

\-        // Re-sanitize profile holdings with new WACCs and origin tags

\-        const updatedProfiles = meroshareProfiles.map(p => {

\+        // Functional update prevents overwriting concurrent profile edits during async CDSC batch

\+        setMeroshareProfiles(prevProfiles => {

\+          const updatedProfiles = prevProfiles.map(p => {

&#x20;            ...

&#x20;          });

\-

\-        setMeroshareProfiles(updatedProfiles);

\-        saveProfilesToStorage(updatedProfiles);

\+          saveProfilesToStorage(updatedProfiles);

\+          return updatedProfiles;

\+        });

@@ -1115,24 +1145,42 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;  const getManualHoldingsRaw = () => {

&#x20;    const holdingsMap = {};

\-    const chronologicalTxs = \[...transactions].reverse();

\+    // Sort strictly by transaction date ascending; on identical dates process buys/acquisitions before sells

\+    const txOrder = (t) => (t === 'sell' ? 1 : 0);

\+    const chronologicalTxs = \[...transactions].sort((a, b) => {

\+      const da = String(a?.date || '');

\+      const db = String(b?.date || '');

\+      if (da !== db) return da.localeCompare(db);

\+      return txOrder(a?.type) - txOrder(b?.type);

\+    });

&#x20;    const manualCustomWaccMap = getCustomWaccMap(userId, 'manual');

&#x20;    const globalCustomWaccMap = getCustomWaccMap(userId);

&#x20;

&#x20;    chronologicalTxs.forEach(tx => {

\-      const sym = tx.symbol.trim().toUpperCase();

\+      const sym = String(tx.symbol || '').trim().toUpperCase();

\+      const qty = Number(tx.quantity) || 0;

\+      const px = Number(tx.price) || 0;

\+      if (!sym || qty <= 0) return;

&#x20;      if (!holdingsMap\[sym]) {

&#x20;        holdingsMap\[sym] = { symbol: sym, units: 0, totalInvestedCost: 0, wacc: 0, waccSource: 'MANUAL\_LEDGER', isCustomWacc: true };

&#x20;      }

&#x20;      const holding = holdingsMap\[sym];

&#x20;

\-      if (tx.type === 'buy') {

\-        const details = calculateBuyDetails(tx.quantity, tx.price);

\-        holding.units += tx.quantity;

\-        holding.totalInvestedCost += details.totalAmount;

\+      if (tx.type === 'bonus') {

\+        // Mandatory CDSC/IRD rule: Bonus shares carry Rs. 100 face value with ZERO brokerage/SEBON/DP fees

\+        holding.units += qty;

\+        holding.totalInvestedCost += qty \* 100;

&#x20;        holding.wacc = holding.units > 0 ? holding.totalInvestedCost / holding.units : 0;

\+      } else if (tx.type === 'ipo' || tx.type === 'fpo' || tx.type === 'rights' || tx.feesIncluded) {

\+        // Mandatory NEPSE rule: IPO/FPO/Rights (and pre-computed TMS WACC imports) incur ZERO extra buy fees

\+        holding.units += qty;

\+        holding.totalInvestedCost += qty \* px;

\+        holding.wacc = holding.units > 0 ? holding.totalInvestedCost / holding.units : 0;

\+      } else if (tx.type === 'buy') {

\+        const details = calculateBuyDetails(qty, px);

\+        holding.units += qty;

\+        holding.totalInvestedCost += details.totalAmount;

\+        holding.wacc = holding.units > 0 ? holding.totalInvestedCost / holding.units : 0;

&#x20;      } else {

&#x20;        const previousUnits = holding.units;

\-        holding.units = Math.max(0, holding.units - tx.quantity);

\+        holding.units = Math.max(0, holding.units - qty);

&#x20;        if (previousUnits > 0) {

&#x20;          holding.totalInvestedCost = holding.units \* holding.wacc;

&#x20;        } else {

&#x20;          holding.totalInvestedCost = 0;

&#x20;        }

&#x20;      }

&#x20;    });

@@ -1165,12 +1213,18 @@ export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altSt

&#x20;            currentLtp: h.currentLtp || 0,

&#x20;            prevClose: h.prevClose || 0,

&#x20;            valueAsOfLTP: 0,

\-            valueAsOfPrevClose: 0

\+            valueAsOfPrevClose: 0,

\+            allHaveLtpVal: true,

\+            allHavePrevCloseVal: true

&#x20;          };

&#x20;        }

\-        holdingsMap\[sym].units += (h.units || 0);

\-        holdingsMap\[sym].totalInvestedCost += ((h.units || 0) \* (h.wacc || 100));

\+        const u = Number(h.units) || 0;

\+        holdingsMap\[sym].units += u;

\+        holdingsMap\[sym].totalInvestedCost += (u \* (Number(h.wacc) || 100));

&#x20;        if (h.currentLtp > 0) holdingsMap\[sym].currentLtp = h.currentLtp;

&#x20;        if (h.prevClose > 0) holdingsMap\[sym].prevClose = h.prevClose;

\-        if (h.valueAsOfLTP > 0) holdingsMap\[sym].valueAsOfLTP += h.valueAsOfLTP;

\-        if (h.valueAsOfPrevClose > 0) holdingsMap\[sym].valueAsOfPrevClose += h.valueAsOfPrevClose;

\+        if (h.valueAsOfLTP > 0) holdingsMap\[sym].valueAsOfLTP += Number(h.valueAsOfLTP);

\+        else holdingsMap\[sym].allHaveLtpVal = false;

\+        if (h.valueAsOfPrevClose > 0) holdingsMap\[sym].valueAsOfPrevClose += Number(h.valueAsOfPrevClose);

\+        else holdingsMap\[sym].allHavePrevCloseVal = false;

&#x20;      });

&#x20;    });

&#x20;

&#x20;    return Object.values(holdingsMap).map(h => {

&#x20;      h.wacc = h.units > 0 ? h.totalInvestedCost / h.units : 100;

\+      // Prevent partial-account valuation drop when one family account lacks valueAsOfPrevClose/valueAsOfLTP

\+      if (!h.allHaveLtpVal) h.valueAsOfLTP = h.currentLtp > 0 ? Number((h.units \* h.currentLtp).toFixed(2)) : 0;

\+      if (!h.allHavePrevCloseVal) h.valueAsOfPrevClose = h.prevClose > 0 ? Number((h.units \* h.prevClose).toFixed(2)) : 0;

&#x20;      return h;

&#x20;    }).filter(h => h.units > 0);

&#x20;  };



```
### 1. Files Inspected in This Turn



From `03-ACC3-REM-PART01.txt`:



\* `src\\components\\Portfolio.jsx (TAIL FROM LINE 2622)` \*(complete remainder of file)\*





\* `src\\components\\PortfolioHub.jsx` \*(complete)\*





\* `src\\components\\WaccTaxCalculator.jsx` \*(re-export wrapper for `src\\views\\WaccTaxCalculator.jsx`)\*





\* `src\\components\\calculators.tsx (TAIL FROM LINE 1007)` \*(complete remainder: `MarginLoanCalculator`, `StockSplitCalculator`, `WaccAveragingCalculator`)\*





\* `src\\components\\IPOList.jsx` \*(complete)\*





\* `src\\components\\CapitalRiskSimulatorBar.jsx` \*(complete)\*





\* `src\\components\\CapitalRiskSimulatorView.jsx` \*(complete)\*





\* `src\\context\\NavigationContext.jsx` \*(complete)\*





\* `src\\context\\SubscriptionContext.jsx` \*(complete)\*





\* `src\\hooks\\useUnifiedStockTelemetry.ts` \*(complete)\*







\*\*Cross-referenced from earlier turns:\*\* `src\\App.jsx`, `src\\main.jsx`, `src\\constants\\marketRules.js`, `src\\components\\MeroShareHub.jsx`, and the first half of `src\\components\\Portfolio.jsx`. Zero files were truncated in this payload.



\---



\### 2. Audit Findings Table (Continuing from `A3-044`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-045\*\* | \*\*P0\*\* | `src/components/IPOList.jsx` (`safeFetch`, `handleBulkApply`, `fetchActiveIpos`)



&#x20;| (1) `safeFetch` returns parsed JSON even when `!res.ok` (HTTP 4xx/5xx) and ignores `json.success === false`. (2) `fetchActiveIpos` maps ALL `live-listings` (including `Closed`/`Upcoming` IPOs) into the Bulk Apply dropdown and never clears `staleWarning` on refresh.



&#x20;| On Web, \*\*every failed C-ASBA IPO application\*\* (wrong password, invalid CRN, insufficient balance, WAF 403/500) is reported as \*\*`status: 'success'` (`"Application submitted!"`)\*\* and logged into Apply History—tricking investors into thinking their family IPOs were submitted.



&#x20;| Throw on `!res.ok |

| \*\*A3-046\*\* | \*\*P0\*\* | `src/components/calculators.tsx` (`WaccAveragingCalculator` -> `calc`)



&#x20;| Adds only `bonusTaxTds` (`bonusUnits \* 100 \* 0.05` = Rs. 5/unit) to `totalCostWithFees` when computing `blendedWacc`, instead of the mandatory CDSC/IRD \*\*Rs. 100 face-value cost basis\*\* (`bonusUnits \* 100`) for bonus shares; also leaves stale `result` when all lots are cleared and provides no zero-fee IPO/FPO lot toggle.



&#x20;| Understates statutory CDSC WACC on bonus shares by Rs. 95/bonus unit (overstating taxable CGT on future sales), while mixing cash-outlay break-even with tax-basis WACC.



&#x20;| Compute statutory tax WACC using `bonusUnits \* 100` cost basis (separately displaying cash outlay + 5% bonus tax), support a zero-fee `Primary (IPO/FPO/Rights)` lot type, and `setResult(null)` when `baseQty <= 0`. |

| \*\*A3-047\*\* | \*\*P0\*\* | `src/hooks/useUnifiedStockTelemetry.ts` (`refresh`, `useEffect`)



&#x20;| Returns `refresh: () => refresh()` with `signal = undefined`, so manual refreshes are never aborted on unmount or rapid stock switch and do not abort prior in-flight fetches; `await res.json()` also throws raw `SyntaxError` on HTML proxy error pages.



&#x20;| Tapping refresh on Stock A then switching to Stock B lets Stock A's telemetry response overwrite Stock B's quote, fundamentals, floorsheet, and lock-in cards (cross-ticker display leak).



&#x20;| Store an `AbortController` in `abortControllerRef` inside `refresh` (aborting any prior request on every call and on unmount) and parse text safely before `JSON.parse`. |

| \*\*A3-048\*\* | \*\*P0\*\* | `src/components/CapitalRiskSimulatorView.jsx` (Trade Sizing Sandbox math)



&#x20;| Computes `theoreticalUnits`, `actualRiskRs`, and `totalGainRs` using raw price deltas (`numPrice - numStopLoss`, `numTarget - numPrice`), ignoring round-trip NEPSE brokerage slabs, 0.015% SEBON buy/sell fees, Rs. 50 round-trip DP charges, and \*\*5.0% short-term CGT\*\* (3.75% LT); `Broker + SEBON` card also omits the mandatory Rs. 25 buy DP charge.



&#x20;| True rupee loss at Stop-Loss breaches the investor's stated `Max Risk / Trade` cap, entry cost is understated by Rs. 25, and `Potential Profit` displays inflated gross gain rather than net take-home rupees.



&#x20;| Include round-trip variable friction + Rs. 50 DP in `effectiveRiskPerShare`, add Rs. 25 DP to entry friction, and compute net Target profit after sell brokerage, 0.015% SEBON, Rs. 25 sell DP, and 5.0% ST CGT. |

| \*\*A3-049\*\* | \*\*P0\*\* | `src/components/Portfolio.jsx` (Log Transaction Form) \& `src/components/PortfolioHub.jsx` (missing `apiStatus` prop)



&#x20;| Cross-file with `A3-033` \& `A3-008`: (1) Manual Transaction form only renders `BUY` and `SELL` buttons—no `IPO`/`FPO`/`RIGHTS` or `BONUS` transaction types. (2) `PortfolioHub.jsx` receives `apiStatus` from `App.jsx` but drops it when rendering `<Portfolio/>`, so `Portfolio.jsx` shows `"Active Feed: Live NEPSE Market"` even when `apiStatus` is `'offline'` or `'yesterday'`.



&#x20;| Investors logging IPO/FPO/Rights or Bonus shares are forced into fee-bearing secondary `BUY` entries (corrupting WACC), and see a green `"Live NEPSE Market"` indicator on offline/cached portfolio values.



&#x20;| Add `IPO/FPO/Rights (0 Fee)` and `Bonus (Rs. 100 Par)` options to the Transaction form (paired with `A3-033`) and forward `apiStatus` from `PortfolioHub` into `Portfolio` to badge `Cached / Offline` accurately. |

| \*\*A3-050\*\* | \*\*P1\*\* | `src/components/IPOList.jsx` (`fetchIposDirectly`, `fetchActiveIpos`, `handleBulkApply`, `handleBulkCheck`, `ipo.closeDate`, `calculateIpoAllotmentProbability`, `Application History`)



&#x20;| (1) `boidStr.substring(3, 8)` yields 5 digits (`10600`), failing `<= 300/400`; Web `fetchActiveIpos` has no DP-list lookup so `clientId` is always hardcoded to `101`. (2) Native `handleBulkApply` uses browser `fetch()` to `backend.cdsc.com.np` (stripped headers/CORS-blocked) instead of `CapacitorHttp.request` to `webbackend.cdsc.com.np`. (3) `fetchActiveIpos` maps `units: item.minKitta || 10`, passing `10` as `generalPublicUnits` into `calculateIpoAllotmentProbability`, and omits `minKitta` validation. (4) `ipo.closeDate.split('T')\[0]` uses UTC instead of `Asia/Kathmandu`. (5) History `"Allotted Wins"` checks `.includes('ALLOTTED')` without `!includes('NOT')`. (6) `handleBulkApply`/`handleBulkCheck` lack `try/finally` around `setIsProcessing(false)` and `fetchApplicationHistory` lacks race-condition guards.



&#x20;| Web IPO list fails auth for every non-101 DP; native Android Bulk Apply fails CDSC WAF; allotment probability is garbage (`10` total public units); Book-Building 50-kitta IPOs fail validation; close dates shift by 1 day; `"NOT ALLOTTED"` counts as a win.



&#x20;| Fix BOID slice to `substring(3, 6)` + DP-list fallback; use `CapacitorHttp` on native; preserve real `generalPublicUnits` + `minKitta` validation; format `closeDate` in NPT; exclude `'NOT'` from Allotted Wins; wrap bulk loops in `try/finally` and guard async history fetches with a request ID. |

| \*\*A3-051\*\* | \*\*P1\*\* | `src/components/Portfolio.jsx` (Manual Ledger totals, WACC Studio CDSC sync, `waccFilterUnconfirmed`)



&#x20;| (1) Manual Ledger card header sums `getProcessedHoldings(manualRaw, 'manual')` (`applyGlobalFilter = true`), so account Net Worth changes whenever a filter chip is active (unlike MeroShare cards). (2) WACC Studio Tab 3 calls `handleSyncWaccFromMeroShare()` with no profile arg, syncing only `meroshareProfiles\[0]`. (3) `waccFilterUnconfirmed` treats confirmed Rs. 100 `IPO\_ALLOTMENT` scrips as unconfirmed (`Number(val) !== 100`).



&#x20;| Account Net Worth drops misleadingly when filtering signals; family accounts 2+ cannot sync WACC from WACC Studio; confirmed Rs. 100 IPO holdings remain stuck in `"Only Unconfirmed"`.



&#x20;| Pass `applyGlobalFilter = false` for Manual Ledger header totals; add a profile selector (or "Sync All Accounts") in WACC Studio Tab 3; treat `IPO\_ALLOTMENT`, `CDSC\_WACC`, `CDSC\_MY\_HOLDING\_DECLARED`, `BROKER\_TMS`, and `CUSTOM\_USER\_SET` as confirmed regardless of Rs. 100 price. |

| \*\*A3-052\*\* | \*\*P1\*\* | `src/components/CapitalRiskSimulatorBar.jsx` (`handleSyncWithPortfolio`)



&#x20;| Scans all `localStorage` keys starting with `nepse\_hub\_` across users, fails to decrypt encrypted MeroShare profiles or parse manual `{ quantity, price }` transactions, and silently resets user's configured capital to `Rs. 1,00,000` when `foundValue <= 10000`.



&#x20;| Clicking `"Sync Portfolio"` either fails to read real encrypted holdings or silently wipes the investor's custom Rs. 10L/25L capital setting back to Rs. 1L.



&#x20;| Load the active user's holdings via `loadEncryptedUserProfiles(resolveActiveUserId())` + uid-scoped transactions, and show an inline notice instead of overwriting capital with `100000` when empty. |

| \*\*A3-053\*\* | \*\*P1\*\* | `src/components/CapitalRiskSimulatorView.jsx` (Odd-lot `< 10` sizing \& inverted stop UX)



&#x20;| When `0 < rawUnits < 10`, outputs odd-lot shares (1–9 kitta) under a `"10-Share NEPSE Lot"` label; when `numStopLoss >= numPrice` or `numTarget <= numPrice`, displays `0 Kitta` and `1 : 0.00` with no error warning.



&#x20;| Advises unexecutable odd-lot sizes during regular NEPSE hours and gives no explanation when stop/target inputs are inverted.



&#x20;| Clamp `suggestedKitta` to `0` when `< 10` (with an explicit "Insufficient risk budget for 10-kitta board lot" note) and render a visible red alert when `!isStopValid || !isTargetValid`. |

| \*\*A3-054\*\* | \*\*P1\*\* | `src/context/NavigationContext.jsx` (`setupCapacitor`, `goBack`, `tabHistory`)



&#x20;| (1) `CapacitorApp.addListener('backButton', ...)` resolves asynchronously with no `cancelled` flag, leaking duplicate listeners under React 18 `StrictMode`. (2) `goBack` only runs `backHandlersRef.current\[0]` and skips remaining registered handlers if it returns `false`. (3) `tabHistory` initializes as `\[initialTab]` instead of `\[activeTab]` and `goBack` never updates `sessionStorage`.



&#x20;| Hardware back press on Android can double-fire or skip closing open modals/drawers; browser reload after pressing Back jumps to the wrong tab.



&#x20;| Add a `cancelled` guard to remove late-resolving Capacitor listeners; iterate through `backHandlersRef.current` until one returns `true`; initialize `tabHistory` from restored `activeTab` and sync `sessionStorage` in `goBack`. |

| \*\*A3-055\*\* | \*\*P1\*\* | `src/context/SubscriptionContext.jsx` (Mount hydration vs. `redeemCode`/`cancelPlan` race)



&#x20;| Initial mount `fetchServerLicenseStatus(deviceId)` has no mutation-version guard against subsequent `redeemCode` or `cancelPlan` calls.



&#x20;| During slow backend cold-starts, a user who redeems a Pro license key can have their Pro entitlement silently reverted to Free seconds later when the earlier mount request resolves.



&#x20;| Track a `mutationVersionRef` counter incremented on `redeemCode`/`cancelPlan` and discard mount/sync responses whose captured version is stale. |

| \*\*A3-056\*\* | \*\*P2\*\* | `src/components/Portfolio.jsx` (`showAiModal`) \& `src/components/PortfolioHub.jsx` (sub-tab unmounting)



&#x20;| `showAiModal` renders GLM-4/Gemini/Groq engine toggles and saves raw API keys to `localStorage` that `callLLM` never reads (always calling backend proxy); `PortfolioHub` unmounts `MeroShareHub` on sub-tab switch even during an active Bulk Apply or CDSC sync.



&#x20;| Confuses users into pasting personal API keys that do nothing and stores them unencrypted; switching tabs mid-IPO submission silently kills the UI feedback.



&#x20;| Remove unused client-side API key inputs from `Portfolio.jsx` (or wire them properly) and keep `MeroShareHub` mounted via CSS `display: none` once visited (matching `App.jsx`'s keep-alive pattern).



&#x20;|

| \*\*A3-057\*\* | \*\*P2\*\* | `src/components/CapitalRiskSimulatorView.jsx` (`winProb = 0.635`) \& `src/components/CapitalRiskSimulatorBar.jsx` (slider max)



&#x20;| Hardcodes an undisclosed `63.5%` win probability into Half-Kelly sizing, allowing sub-`1:1` R:R setups (e.g., `1:0.7`) to size positively; slider maxes at Rs. 1 Cr.



&#x20;| Investors assume sizing is pure 1% risk-based when an invisible 63.5% win-rate assumption is altering lot counts.



&#x20;| Expose `Win Rate %` as a visible/adjustable input (or label `Assumed 63.5% WR` clearly) and require `bRatio >= 1.0` for positive sizing. |

| \*\*A3-058\*\* | \*\*P2\*\* | `src/context/NavigationContext.jsx` (`window.history.pushState` \& `window.\_\_\*` globals)



&#x20;| Closing a modal via its Close button never pops the history entry pushed by `registerBackHandler`; QA helpers (`window.\_\_openStockDetail`, `window.\_\_setActiveTab`) are attached in production.



&#x20;| Users on Android PWA/WebView must press Back multiple extra times after closing modals with `X`; internal setters leak onto global `window`.



&#x20;| Guard `window.\_\_\*` hooks behind `import.meta.env.DEV` and clean up or reuse a single modal history sentinel entry. |

| \*\*A3-059\*\* | \*\*P3\*\* | `src/components/Portfolio.jsx`, `src/components/CapitalRiskSimulatorBar.jsx`, `src/components/calculators.tsx`



&#x20;| Transaction form `Quantity`/`Price` inputs snap cleared fields to `1`/`0.1` on every keystroke; `StockSplitCalculator` keeps stale results when `splitRatio <= 1`; `setTimeout` timers in `Portfolio` and `CapitalRiskSimulatorBar` lack unmount cleanup.



&#x20;| Minor typing friction and stale UI state on invalid split inputs.



&#x20;| Allow temporary empty string during typing (validate on blur/submit), call `setResult(null)` on invalid split inputs, and clear timer refs on unmount. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/components/IPOList.jsx` (Fixes `A3-045`, `A3-050`)







```diff

\--- a/src/components/IPOList.jsx

+++ b/src/components/IPOList.jsx

@@ -36,7 +36,10 @@ async function safeFetch(url, options = {}) {

&#x20;  let json;

&#x20;  try { json = JSON.parse(text); } catch (\_) {

&#x20;    if (!res.ok) throw new Error(`Server error ${res.status}`);

&#x20;    return text;

&#x20;  }

\+  if (!res.ok || (json \&\& typeof json === 'object' \&\& json.success === false)) {

\+    throw new Error(json?.message || json?.error || `Request failed (${res.status})`);

\+  }

&#x20;  return json;

&#x20;}

@@ -51,11 +54,10 @@ async function fetchIposDirectly(account) {

&#x20;  // 1. Resolve DP code to clientId (using official 8-digit BOID prefix strategy first)

&#x20;  let clientId = 101;

&#x20;  const boidStr = String(account.boid || '').trim();

&#x20;  if (boidStr.length === 16) {

\-    const dpPrefix = boidStr.substring(0, 8);

\-    const shortPrefix = boidStr.substring(3, 8);

\-    const resolvedId = parseInt(shortPrefix, 10);

\-    if (!isNaN(resolvedId) \&\& resolvedId >= 100 \&\& resolvedId <= 300) {

\+    // Digits 4-6 (index 3..6) of a 16-digit BOID hold the 3-digit CDSC client DP ID (e.g. 13010600 -> 106)

\+    const resolvedId = parseInt(boidStr.substring(3, 6), 10);

\+    if (!isNaN(resolvedId) \&\& resolvedId >= 100 \&\& resolvedId <= 400) {

&#x20;      clientId = resolvedId;

&#x20;    }

&#x20;  }

@@ -143,6 +145,7 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;  const \[error, setError] = useState('');

&#x20;  const \[success, setSuccess] = useState('');

&#x20;  const \[staleWarning, setStaleWarning] = useState('');

\+  const historyReqIdRef = React.useRef(0);

&#x20;

@@ -174,6 +177,7 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;  const fetchActiveIpos = async () => {

&#x20;    setIsLoadingIpos(true);

&#x20;    setError('');

\+    setStaleWarning('');

&#x20;

&#x20;    const local = await loadEncryptedUserProfiles(activeUserId);

&#x20;

@@ -188,12 +192,25 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;        // Resolve DP code to clientId (using offline BOID prefix strategy first)

&#x20;        let clientId = 101;

&#x20;        const boidStr = String(local\[0].boid || '').trim();

&#x20;        if (boidStr.length === 16) {

\-          const resolved = parseInt(boidStr.substring(3, 8), 10);

\+          const resolved = parseInt(boidStr.substring(3, 6), 10);

&#x20;          if (!isNaN(resolved) \&\& resolved >= 100 \&\& resolved <= 400) {

&#x20;            clientId = resolved;

&#x20;          }

&#x20;        }

\+        if (clientId === 101 \&\& boidStr.length === 16) {

\+          try {

\+            const dpJson = await safeFetch(`${proxyBase}/api/meroshare/dp-list`);

\+            const dpData = dpJson?.data || dpJson;

\+            if (Array.isArray(dpData)) {

\+              const fullPrefix = boidStr.substring(0, 8);

\+              const shortPrefix = boidStr.substring(3, 8);

\+              const match = dpData.find(dp => dp.code === fullPrefix || dp.code === shortPrefix || (dp.code \&\& dp.code.includes(shortPrefix)));

\+              if (match?.id) clientId = Number(match.id);

\+            }

\+          } catch (\_) {}

\+        }

&#x20;

@@ -217,15 +234,20 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;              if (isStale) {

&#x20;                setStaleWarning(liveData?.staleWarning || 'Live exchange source returned 403 Forbidden. Showing last verified cached IPO data.');

&#x20;              }

\-              // Map live-listings format to IPO list format

\-              list = liveListing.map(item => ({

\+              // Only expose Open issues inside the Bulk Apply dropdown and preserve real public issue units

\+              list = liveListing

\+                .filter(item => item \&\& String(item.status || '').toLowerCase() === 'open')

\+                .map(item => ({

&#x20;                id: item.id || item.companyShareId,

&#x20;                name: item.name || item.companyName,

&#x20;                scrip: item.scrip || '',

&#x20;                type: item.type || item.shareTypeName || 'IPO',

\-                status: item.status || 'Open',

\-                units: item.minKitta || item.units || 10,

\-                minKitta: item.minKitta || 10,

\-                maxKitta: item.maxKitta || 10000000,

\+                status: 'Open',

\+                generalPublicUnits: Number(item.generalPublicUnits || item.issueUnits || item.units || 0) || 0,

\+                totalApplicants: Number(item.totalApplicants || item.applicants || 0) || 0,

\+                oversubscriptionTimes: Number(item.oversubscriptionTimes || item.times || 0) || 0,

\+                minKitta: Number(item.minKitta) || 10,

\+                maxKitta: Number(item.maxKitta) || 10000000,

&#x20;                amountPerShare: item.issuePrice || item.amountPerShare || 100,

&#x20;                openDate: item.openDate || item.issueOpenDate || '',

&#x20;                closeDate: item.closeDate || item.issueCloseDate || '',

@@ -250,15 +272,20 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;          if (isStale) {

&#x20;            setStaleWarning(liveData?.staleWarning || 'Live exchange source returned 403 Forbidden. Showing last verified cached IPO data.');

&#x20;          }

\-          const list = liveListing.map(item => ({

\+          const list = liveListing

\+            .filter(item => item \&\& String(item.status || '').toLowerCase() === 'open')

\+            .map(item => ({

&#x20;            id: item.id || item.companyShareId,

&#x20;            name: item.name || item.companyName,

&#x20;            scrip: item.scrip || '',

&#x20;            type: item.type || 'IPO',

\-            status: item.status || 'Open',

\-            units: item.minKitta || 10,

\-            minKitta: item.minKitta || 10,

\-            maxKitta: item.maxKitta || 10000000,

\+            status: 'Open',

\+            generalPublicUnits: Number(item.generalPublicUnits || item.issueUnits || item.units || 0) || 0,

\+            totalApplicants: Number(item.totalApplicants || item.applicants || 0) || 0,

\+            oversubscriptionTimes: Number(item.oversubscriptionTimes || item.times || 0) || 0,

\+            minKitta: Number(item.minKitta) || 10,

\+            maxKitta: Number(item.maxKitta) || 10000000,

&#x20;            amountPerShare: item.issuePrice || 100,

&#x20;            openDate: item.openDate || '',

&#x20;            closeDate: item.closeDate || '',

@@ -329,6 +356,7 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;  };

&#x20;

&#x20;  const fetchApplicationHistory = async (targetAccountId) => {

\+    const reqId = ++historyReqIdRef.current;

&#x20;    setIsLoadingHistory(true);

&#x20;    setError('');

&#x20;    const local = await loadEncryptedUserProfiles(activeUserId);

@@ -338,10 +366,13 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;    let localHistory = \[];

&#x20;    try {

&#x20;      const stored = localStorage.getItem('nepse\_hub\_bulk\_ipo\_history');

\-      if (stored) localHistory = JSON.parse(stored);

\+      if (stored) {

\+        const parsed = JSON.parse(stored);

\+        localHistory = targetAcc?.boid ? parsed.filter(h => !h.boid || h.boid === targetAcc.boid) : parsed;

\+      }

&#x20;    } catch (\_) {}

&#x20;

&#x20;    if (!targetAcc) {

\+      if (reqId !== historyReqIdRef.current) return;

&#x20;      setApplicationHistory(localHistory);

&#x20;      setIsLoadingHistory(false);

&#x20;      return;

@@ -352,6 +383,7 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;      if (targetAcc.username \&\& targetAcc.password) {

&#x20;        reports = await fetchUserApplicationReports(targetAcc);

&#x20;      }

\+      if (reqId !== historyReqIdRef.current) return;

@@ -382,14 +414,23 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;    } catch (err) {

&#x20;      console.warn('Failed to fetch MeroShare application reports:', err);

\-      setApplicationHistory(localHistory);

\+      if (reqId === historyReqIdRef.current) setApplicationHistory(localHistory);

&#x20;    } finally {

\-      setIsLoadingHistory(false);

\+      if (reqId === historyReqIdRef.current) setIsLoadingHistory(false);

&#x20;    }

&#x20;  };

&#x20;

&#x20;  // --- BULK APPLY ---

&#x20;  const handleBulkApply = async () => {

&#x20;    if (selectedAccounts.length === 0) { alert('Please select at least one account.'); return; }

&#x20;    if (!selectedIpo) { alert('Please select an active IPO.'); return; }

\+    const activeIpo = getActiveIpoDetails();

\+    const minKitta = Math.max(10, Number(activeIpo?.minKitta || 10));

\+    const maxKitta = Math.max(minKitta, Number(activeIpo?.maxKitta || 10000000));

\+    const kittaNum = Number(appliedKitta || 0);

\+    if (!Number.isFinite(kittaNum) || kittaNum < minKitta || kittaNum > maxKitta || kittaNum % 10 !== 0) {

\+      setError(`Quantity must be between ${minKitta} and ${maxKitta} kitta in multiples of 10.`);

\+      return;

\+    }

&#x20;

@@ -403,72 +444,74 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;      status: 'loading', resultText: 'Submitting...'

&#x20;    })));

&#x20;

\+    try {

&#x20;    if (isNative) {

\-      // Direct sequential submission on Android

\-      const MEROSHARE\_BASE = 'https://backend.cdsc.com.np/api/meroShare';

\+      // Direct sequential submission on Android via CapacitorHttp (preserves Origin/Referer headers)

\+      const MEROSHARE\_BASE = 'https://webbackend.cdsc.com.np/api/meroShare';

&#x20;      const results = \[];

&#x20;      const sleep = ms => new Promise(r => setTimeout(r, ms));

&#x20;

&#x20;      for (let i = 0; i < targetAccounts.length; i++) {

&#x20;        const acc = targetAccounts\[i];

&#x20;        if (i > 0) await sleep(3000);

&#x20;

&#x20;        try {

\-          // Resolve clientId (offline 16-digit BOID prefix first, network fallback second)

&#x20;          let clientId = 101;

&#x20;          const boidStr = String(acc.boid || '').trim();

&#x20;          if (boidStr.length === 16) {

\-            const resolved = parseInt(boidStr.substring(3, 8), 10);

\+            const resolved = parseInt(boidStr.substring(3, 6), 10);

&#x20;            if (!isNaN(resolved) \&\& resolved >= 100 \&\& resolved <= 400) {

&#x20;              clientId = resolved;

&#x20;            }

&#x20;          }

&#x20;          if (clientId === 101) {

&#x20;            try {

\-              const dpRes = await fetch(`${MEROSHARE\_BASE}/capital/`);

\-              if (dpRes.ok) {

\-                const dpData = await dpRes.json();

\-                if (Array.isArray(dpData)) {

\-                  const fullPrefix = boidStr.substring(0, 8);

\-                  const shortPrefix = boidStr.substring(3, 8);

\-                  const match = dpData.find(dp => dp.code === fullPrefix || dp.code === shortPrefix);

\-                  if (match) clientId = match.id;

\-                }

\+              const dpRes = await CapacitorHttp.request({ url: `${MEROSHARE\_BASE}/capital/`, method: 'GET', headers: { Accept: 'application/json' } });

\+              const dpData = parseSafeJsonBody(dpRes.data);

\+              if (Array.isArray(dpData)) {

\+                const fullPrefix = boidStr.substring(0, 8);

\+                const shortPrefix = boidStr.substring(3, 8);

\+                const match = dpData.find(dp => dp.code === fullPrefix || dp.code === shortPrefix);

\+                if (match) clientId = match.id;

&#x20;              }

&#x20;            } catch (\_) {}

&#x20;          }

&#x20;

\-          // Login

\-          const loginRes = await fetch(`${MEROSHARE\_BASE}/auth/`, {

\+          const loginRes = await CapacitorHttp.request({

\+            url: `${MEROSHARE\_BASE}/auth/`,

&#x20;            method: 'POST',

&#x20;            headers: { 'Content-Type': 'application/json', 'Origin': 'https://meroshare.cdsc.com.np', 'Referer': 'https://meroshare.cdsc.com.np/' },

\-            body: JSON.stringify({ clientId: Number(clientId), username: acc.username, password: acc.password }),

\+            data: { clientId: Number(clientId), username: acc.username, password: acc.password },

&#x20;          });

\-          const loginData = await loginRes.json();

\-          if (!loginRes.ok) throw new Error(loginData.message || `Login failed (${loginRes.status})`);

\+          const loginData = parseSafeJsonBody(loginRes.data);

\+          if (loginRes.status < 200 || loginRes.status >= 300) throw new Error(loginData?.message || `Login failed (${loginRes.status})`);

&#x20;

\-          const authKey = \[...loginRes.headers.keys()].find(k => k.toLowerCase() === 'authorization');

\-          let token = loginData.token || loginData.accessToken || (authKey ? loginRes.headers.get(authKey) : null);

\+          const authKey = Object.keys(loginRes.headers || {}).find(k => k.toLowerCase() === 'authorization');

\+          let token = loginData?.token || loginData?.accessToken || (authKey ? loginRes.headers\[authKey] : null);

&#x20;          if (token \&\& !token.startsWith('Bearer ')) token = `Bearer ${token}`;

&#x20;          if (!token) throw new Error('No auth token received.');

&#x20;

\-          // Get application template

\-          const detailRes = await fetch(`${MEROSHARE\_BASE}/applicableIssue/applicable/detail/${selectedIpo}`, {

\+          const detailRes = await CapacitorHttp.request({

\+            url: `${MEROSHARE\_BASE}/applicableIssue/applicable/detail/${selectedIpo}`,

\+            method: 'GET',

&#x20;            headers: { 'Authorization': token, 'Origin': 'https://meroshare.cdsc.com.np', 'Referer': 'https://meroshare.cdsc.com.np/' },

&#x20;          });

\-          if (!detailRes.ok) throw new Error(`Template fetch failed (${detailRes.status})`);

\-          const template = await detailRes.json();

\+          if (detailRes.status < 200 || detailRes.status >= 300) throw new Error(`Template fetch failed (${detailRes.status})`);

\+          const template = parseSafeJsonBody(detailRes.data);

&#x20;          if (!template) throw new Error('No ASBA template found for this account.');

&#x20;

\-          // Submit

\-          const submitRes = await fetch(`${MEROSHARE\_BASE}/applicantForm/`, {

\+          const submitRes = await CapacitorHttp.request({

\+            url: `${MEROSHARE\_BASE}/applicantForm/`,

&#x20;            method: 'POST',

&#x20;            headers: { 'Content-Type': 'application/json', 'Authorization': token, 'Origin': 'https://meroshare.cdsc.com.np', 'Referer': 'https://meroshare.cdsc.com.np/' },

\-            body: JSON.stringify({

\+            data: {

&#x20;              ...template,

\-              appliedKitta: Number(appliedKitta),

\+              appliedKitta: kittaNum,

&#x20;              crnNumber: acc.crn?.trim(),

&#x20;              transactionPin: acc.pin?.trim(),

&#x20;              boid: acc.boid,

&#x20;              demat: acc.boid,

\-            }),

\+            },

&#x20;          });

\-          const submitData = await submitRes.json();

\-          if (!submitRes.ok) throw new Error(submitData?.message || `Submission failed (${submitRes.status})`);

\-          recordApplicationHistory(acc, appliedKitta, selectedIpo);

\+          const submitData = parseSafeJsonBody(submitRes.data);

\+          if (submitRes.status < 200 || submitRes.status >= 300) throw new Error(submitData?.message || `Submission failed (${submitRes.status})`);

\+          recordApplicationHistory(acc, kittaNum, selectedIpo);

&#x20;          results.push({ id: acc.id, name: acc.name, username: acc.username, status: 'success', resultText: submitData?.message || 'Application submitted!' });

&#x20;        } catch (err) {

&#x20;          results.push({ id: acc.id, name: acc.name, username: acc.username, status: 'failed', resultText: err.message || 'Submission failed.' });

&#x20;        }

&#x20;        setApplyResults(\[...results]);

&#x20;      }

&#x20;

&#x20;      setSuccess('Bulk IPO Apply execution completed.');

\-      setIsProcessing(false);

&#x20;    } else {

&#x20;      // Web: sequential proxy calls per account

&#x20;      const sleep = ms => new Promise(r => setTimeout(r, ms));

&#x20;      const results = \[];

@@ -480,10 +523,9 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;        try {

&#x20;          let clientId = 101;

&#x20;          const boidStr = String(acc.boid || '').trim();

&#x20;          if (boidStr.length === 16) {

\-            const shortPrefix = boidStr.substring(3, 8);

\-            const resolved = parseInt(shortPrefix, 10);

\-            if (!isNaN(resolved) \&\& resolved >= 100 \&\& resolved <= 300) {

\+            const resolved = parseInt(boidStr.substring(3, 6), 10);

\+            if (!isNaN(resolved) \&\& resolved >= 100 \&\& resolved <= 400) {

&#x20;              clientId = resolved;

&#x20;            }

&#x20;          }

@@ -518,7 +560,7 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;          const data = await safeFetch(`${proxyBase}/api/meroshare/apply`, {

&#x20;            method: 'POST',

&#x20;            headers: { 'Content-Type': 'application/json' },

&#x20;            body: JSON.stringify({

&#x20;              clientId,

&#x20;              username: acc.username,

&#x20;              password: acc.password,

&#x20;              companyShareId: Number(selectedIpo),

\-              appliedKitta: Number(appliedKitta),

\+              appliedKitta: kittaNum,

&#x20;              crnNumber: acc.crn?.trim(),

&#x20;              transactionPin: String(acc.pin || '').trim(),

&#x20;              boid: acc.boid,

&#x20;            }),

&#x20;          });

&#x20;

\-          recordApplicationHistory(acc, appliedKitta, selectedIpo);

\+          recordApplicationHistory(acc, kittaNum, selectedIpo);

&#x20;          const successMsg = (typeof data.data === 'string' ? data.data : data.data?.message) || 'Application submitted!';

&#x20;          results.push({ id: acc.id, name: acc.name, username: acc.username, status: 'success', resultText: successMsg });

&#x20;        } catch (err) {

@@ -533,7 +575,9 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;      }

&#x20;

&#x20;      setSuccess('Bulk IPO Apply execution completed.');

\+    }

\+    } finally {

&#x20;      setIsProcessing(false);

&#x20;    }

&#x20;  };

@@ -549,6 +593,7 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;    const sleep = ms => new Promise(r => setTimeout(r, ms));

&#x20;    const results = \[];

&#x20;

\+    try {

&#x20;    for (let i = 0; i < targetAccounts.length; i++) {

&#x20;      const acc = targetAccounts\[i];

&#x20;      if (i > 0) await sleep(500);

@@ -579,8 +624,9 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;      setCheckResults(\[...results]);

&#x20;    }

&#x20;

&#x20;    setSuccess('Bulk result check completed.');

\+    } finally {

&#x20;    setIsProcessing(false);

\+    }

&#x20;  };

@@ -668,12 +714,15 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;                {getActiveIpoDetails() \&\& (() => {

&#x20;                  const ipo = getActiveIpoDetails();

\+                  const minLot = Math.max(10, Number(ipo.minKitta || 10));

&#x20;                  const allotment = calculateIpoAllotmentProbability({

\-                    generalPublicUnits: ipo.generalPublicUnits || ipo.units,

\+                    generalPublicUnits: Number(ipo.generalPublicUnits || 0),

&#x20;                    totalApplicants: ipo.totalApplicants || ipo.applicants,

&#x20;                    oversubscriptionTimes: ipo.oversubscriptionTimes || ipo.times,

\-                    appliedKitta: Number(appliedKitta) || 10

\+                    appliedKitta: Number(appliedKitta) || minLot,

\+                    minKitta: minLot,

\+                    minUnits: minLot

&#x20;                  });

@@ -699,7 +748,7 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>

&#x20;                        <span style={{ color: 'var(--text-muted)' }}>Closing Date:</span>

&#x20;                        <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>

\-                          {ipo.closeDate ? ipo.closeDate.split('T')\[0] : 'Open / Ongoing'}

\+                          {ipo.closeDate ? (typeof ipo.closeDate === 'string' \&\& ipo.closeDate.includes('T') ? formatNptDateIso(new Date(ipo.closeDate)) : String(ipo.closeDate).slice(0, 10)) : 'Open / Ongoing'}

&#x20;                        </span>

&#x20;                      </div>

@@ -916,7 +965,10 @@ export default function IPOList({ initialTab = 'apply', userId = null }) {

&#x20;                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>Allotted Wins</span>

&#x20;                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--bull)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: 2 }}>

\-                  {applicationHistory.filter(h => Number(h.allottedKitta) > 0 || String(h.status || '').toUpperCase().includes('ALLOTTED')).length}

\+                  {applicationHistory.filter(h => {

\+                    const st = String(h.status || '').toUpperCase();

\+                    return Number(h.allottedKitta) > 0 || (st.includes('ALLOTTED') \&\& !st.includes('NOT'));

\+                  }).length}

&#x20;                </span>

&#x20;              </div>



```



\---



\#### `src/components/calculators.tsx` (Fixes `A3-046`)







```diff

\--- a/src/components/calculators.tsx

+++ b/src/components/calculators.tsx

@@ -1260,8 +1260,8 @@ export function StockSplitCalculator() {

&#x20;// Multi-Lot Buy Averaging \& Blended WACC Calculator (with Bonus \& Right Dilution)

&#x20;export function WaccAveragingCalculator() {

&#x20;  const \[lots, setLots] = useState(\[

\-    { id: 1, qty: '100', price: '450' },

\-    { id: 2, qty: '100', price: '500' }

\+    { id: 1, qty: '100', price: '450', type: 'secondary' as 'secondary' | 'primary' },

\+    { id: 2, qty: '100', price: '500', type: 'secondary' as 'secondary' | 'primary' }

&#x20;  ]);

&#x20;  const \[bonusPct, setBonusPct] = useState('0');

&#x20;  const \[rightPct, setRightPct] = useState('0');

&#x20;  const \[rightIssuePrice, setRightIssuePrice] = useState('100');

&#x20;  const \[result, setResult] = useState<any>(null);

&#x20;

&#x20;  const addLot = () => {

\-    setLots(prev => \[...prev, { id: Date.now(), qty: '100', price: '400' }]);

\+    setLots(prev => \[...prev, { id: Date.now(), qty: '100', price: '400', type: 'secondary' }]);

&#x20;  };

&#x20;

&#x20;  const removeLot = (id: number) => {

&#x20;    if (lots.length <= 1) return;

&#x20;    setLots(prev => prev.filter(l => l.id !== id));

&#x20;  };

&#x20;

\-  const updateLot = (id: number, field: 'qty' | 'price', val: string) => {

\+  const updateLot = (id: number, field: 'qty' | 'price' | 'type', val: string) => {

&#x20;    setLots(prev => prev.map(l => l.id === id ? { ...l, \[field]: val } : l));

&#x20;  };

@@ -1297,14 +1297,22 @@ export function WaccAveragingCalculator() {

&#x20;      if (q > 0 \&\& p > 0) {

&#x20;        baseQty += q;

&#x20;        totalRawCost += (q \* p);

\-        const lotDetails = calculateBuyDetails(q, p);

\-        totalCostWithFees += lotDetails.totalAmount;

\-        totalFees += (lotDetails.commission + lotDetails.sebonFee + lotDetails.dpFee);

\+        if (lot.type === 'primary') {

\+          // Mandatory NEPSE rule: IPO / FPO / Rights incur Rs. 0 brokerage, SEBON, and DP fees

\+          totalCostWithFees += (q \* p);

\+        } else {

\+          const lotDetails = calculateBuyDetails(q, p);

\+          totalCostWithFees += lotDetails.totalAmount;

\+          totalFees += (lotDetails.commission + lotDetails.sebonFee + lotDetails.dpFee);

\+        }

&#x20;      }

&#x20;    });

&#x20;

\-    if (baseQty <= 0) return;

\+    if (baseQty <= 0) {

\+      setResult(null);

\+      return;

\+    }

&#x20;

&#x20;    const bPct = Math.max(0, parseFloat(bonusPct) || 0);

&#x20;    const rPct = Math.max(0, parseFloat(rightPct) || 0);

@@ -1314,19 +1322,22 @@ export function WaccAveragingCalculator() {

&#x20;    const rightUnits = Math.floor((baseQty \* rPct) / 100);

&#x20;    const rightCost = rightUnits \* rPrice;

&#x20;    const bonusTaxTds = bonusUnits \* 100 \* 0.05; // 5% TDS on bonus share face value (Rs. 100)

\+    const bonusStatutoryParBasis = bonusUnits \* 100; // Mandatory CDSC/IRD Rs. 100 par cost basis in WACC

&#x20;

&#x20;    const totalQty = baseQty + bonusUnits + rightUnits;

&#x20;    totalRawCost += rightCost;

&#x20;    totalFees += bonusTaxTds;

\-    totalCostWithFees += (rightCost + bonusTaxTds);

\-

\-    const blendedWacc = totalCostWithFees / totalQty;

\+    const cashOutlayTotal = totalCostWithFees + rightCost + bonusTaxTds;

\+    const statutoryTaxCostBasis = totalCostWithFees + rightCost + bonusStatutoryParBasis;

\+    const blendedWacc = statutoryTaxCostBasis / totalQty;

&#x20;

\-    // Iterative exact tiered SEBON break-even solver (covers buy fees + sell commission + 0.015% SEBON + Rs. 25 sell DP)

\-    let be = blendedWacc;

\+    // Iterative exact cash break-even solver (covers actual cash outlay + sell brokerage + 0.015% SEBON + Rs. 25 sell DP)

\+    let be = cashOutlayTotal / totalQty;

&#x20;    for (let i = 0; i < 30; i++) {

&#x20;      const grossSell = be \* totalQty;

&#x20;      const sellComm = getTieredSellCommission(grossSell);

&#x20;      const sellSebon = grossSell \* 0.00015;

&#x20;      const netProceeds = grossSell - sellComm - sellSebon - 25;

\-      const diff = totalCostWithFees - netProceeds;

\+      const diff = cashOutlayTotal - netProceeds;

&#x20;      if (Math.abs(diff) < 0.05) break;

&#x20;      be += diff / totalQty;

&#x20;    }

&#x20;

&#x20;    setResult({

&#x20;      baseQty,

&#x20;      bonusUnits,

&#x20;      rightUnits,

&#x20;      totalQty,

&#x20;      totalRawCost,

&#x20;      blendedWacc,

\-      totalCostWithFees,

\+      totalCostWithFees: cashOutlayTotal,

\+      statutoryTaxCostBasis,

&#x20;      totalFees,

&#x20;      breakEvenPrice: be

&#x20;    });

@@ -1360,6 +1371,14 @@ export function WaccAveragingCalculator() {

&#x20;        {lots.map((lot, idx) => (

&#x20;          <div key={lot.id} className="flex items-center gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">

&#x20;            <span className="text-xs font-mono font-bold text-slate-400 w-12">Lot {idx + 1}</span>

\+            <select

\+              value={lot.type}

\+              onChange={(e) => updateLot(lot.id, 'type', e.target.value)}

\+              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-\[11px] text-slate-200 outline-none focus:border-blue-500"

\+            >

\+              <option value="secondary">Secondary</option>

\+              <option value="primary">IPO/FPO (0 Fee)</option>

\+            </select>



```



\---



\#### `src/hooks/useUnifiedStockTelemetry.ts` (Fixes `A3-047`)







```diff

\--- a/src/hooks/useUnifiedStockTelemetry.ts

+++ b/src/hooks/useUnifiedStockTelemetry.ts

@@ -1,7 +1,7 @@

&#x20;// src/hooks/useUnifiedStockTelemetry.ts

&#x20;"use client";

&#x20;

\-import { useCallback, useEffect, useState } from "react";

+import { useCallback, useEffect, useRef, useState } from "react";

&#x20;import { resolveValidNepseSymbol } from "@/services/aiGuru/runAiQuantitativeAssessment";

&#x20;import { getProxyBase } from "@/utils/proxyBase.js";

&#x20;import type { AtomicStockTelemetryApiResponse } from "@/types/stockTelemetry";

@@ -11,10 +11,16 @@ export function useUnifiedStockTelemetry(rawSymbol?: string | null) {

&#x20;  const \[data, setData] = useState<AtomicStockTelemetryApiResponse | null>(null);

&#x20;  const \[loading, setLoading] = useState<boolean>(false);

&#x20;  const \[error, setError] = useState<string | null>(null);

\+  const abortControllerRef = useRef<AbortController | null>(null);

&#x20;

&#x20;  const refresh = useCallback(

\-    async (signal?: AbortSignal) => {

\+    async () => {

\+      abortControllerRef.current?.abort();

\+      const controller = new AbortController();

\+      abortControllerRef.current = controller;

\+      const { signal } = controller;

\+

&#x20;      if (!validSymbol) {

&#x20;        setData(null);

&#x20;        setError("Select a valid NEPSE scrip symbol to load telemetry.");

\+        setLoading(false);

&#x20;        return;

&#x20;      }

@@ -31,15 +37,20 @@ export function useUnifiedStockTelemetry(rawSymbol?: string | null) {

&#x20;            cache: "no-store",

&#x20;          }

&#x20;        );

\-        const json = (await res.json()) as AtomicStockTelemetryApiResponse \& {

\-          error?: string;

\-        };

\+        const rawText = await res.text();

\+        let json: (AtomicStockTelemetryApiResponse \& { error?: string }) | null = null;

\+        try {

\+          json = JSON.parse(rawText);

\+        } catch {

\+          throw new Error(`Invalid telemetry response (HTTP ${res.status})`);

\+        }

&#x20;

\-        if (!res.ok || !json.ok) {

\-          throw new Error(json.error || `Failed to load telemetry for ${validSymbol}`);

\+        if (!res.ok || !json?.ok) {

\+          throw new Error(json?.error || `Failed to load telemetry for ${validSymbol} (HTTP ${res.status})`);

&#x20;        }

\-        if (!signal?.aborted) {

\+        if (!signal.aborted) {

&#x20;          setData(json);

&#x20;        }

&#x20;      } catch (err) {

\-        if ((err as Error)?.name !== "AbortError" \&\& !signal?.aborted) {

\+        if ((err as Error)?.name !== "AbortError" \&\& !signal.aborted) {

&#x20;          setError(

&#x20;            err instanceof Error ? err.message : "Telemetry synchronization failed"

&#x20;          );

&#x20;        }

&#x20;      } finally {

\-        if (!signal?.aborted) {

\+        if (!signal.aborted) {

&#x20;          setLoading(false);

&#x20;        }

&#x20;      }

@@ -57,9 +68,8 @@ export function useUnifiedStockTelemetry(rawSymbol?: string | null) {

&#x20;  );

&#x20;

&#x20;  useEffect(() => {

\-    const controller = new AbortController();

\-    refresh(controller.signal);

\-    return () => controller.abort();

\+    refresh();

\+    return () => {

\+      abortControllerRef.current?.abort();

\+    };

&#x20;  }, \[refresh]);

&#x20;

&#x20;  return {

&#x20;    symbol: validSymbol,

&#x20;    data,

&#x20;    loading,

&#x20;    error,

\-    refresh: () => refresh(),

\+    refresh,

&#x20;  };

&#x20;}



```



\---



\#### `src/components/CapitalRiskSimulatorView.jsx` (Fixes `A3-048`, `A3-053`)







```diff

\--- a/src/components/CapitalRiskSimulatorView.jsx

+++ b/src/components/CapitalRiskSimulatorView.jsx

@@ -50,27 +50,43 @@ export function CapitalRiskSimulatorView({

&#x20;  // Stop-Loss Inversion Guard \& Half-Kelly Position Sizing (p = 0.635)

&#x20;  const isStopValid = numPrice > 0 \&\& numStopLoss > 0 \&\& numStopLoss < numPrice;

&#x20;  const isTargetValid = numTarget > numPrice;

&#x20;  const perShareRisk = isStopValid ? (numPrice - numStopLoss) : 0;

&#x20;  const perShareGain = isTargetValid ? (numTarget - numPrice) : 0;

&#x20;  const bRatio = isStopValid \&\& perShareRisk > 0 ? perShareGain / perShareRisk : 0;

\+  const dpFeePerLeg = 25;

\+  const sebonRate = NEPSE\_FRICTION\_FY2083?.sebonFeeRate ?? 0.00015;

\+  const estFrictionPerShare = isStopValid

\+    ? (numPrice + numStopLoss) \* (commissionRate + sebonRate)

\+    : 0;

\+  const effectivePerShareRisk = isStopValid ? (perShareRisk + estFrictionPerShare) : 0;

&#x20;

&#x20;  // Half-Kelly fraction: f\*\_half = 0.5 \* (p - (1 - p) / b) with p = 0.635

&#x20;  const winProb = 0.635;

&#x20;  const fullKelly = bRatio > 0 ? (winProb - (1 - winProb) / bRatio) : 0;

&#x20;  const halfKellyFraction = fullKelly > 0 ? Math.min(tierConfig.maxSlotAllocationPct, fullKelly \* 0.5) : 0;

&#x20;  const effectiveSlotCeilingRs = Math.min(maxSlotCapitalRs, Math.round(capital \* halfKellyFraction));

&#x20;

\-  const theoreticalUnits = isStopValid \&\& halfKellyFraction > 0 \&\& perShareRisk > 0 ? (maxRiskRs / perShareRisk) : 0;

\+  const theoreticalUnits = isStopValid \&\& halfKellyFraction > 0 \&\& effectivePerShareRisk > 0

\+    ? Math.max(0, maxRiskRs - (dpFeePerLeg \* 2)) / effectivePerShareRisk

\+    : 0;

&#x20;  const maxUnitsBySlot = isStopValid \&\& halfKellyFraction > 0 \&\& numPrice > 0 ? Math.floor(effectiveSlotCeilingRs / numPrice) : 0;

&#x20;  const rawUnits = isStopValid \&\& halfKellyFraction > 0 ? Math.max(0, Math.min(theoreticalUnits, maxUnitsBySlot)) : 0;

&#x20;

\-  // Invalid stops (StopLoss >= Price) or negative Kelly expectancy strictly yield 0 suggested kitta

\+  // Enforce NEPSE 10-kitta regular board lot minimum (no odd lots < 10)

&#x20;  const suggestedKitta = !isStopValid || halfKellyFraction <= 0

&#x20;    ? 0

&#x20;    : rawUnits >= 10

&#x20;    ? Math.floor(rawUnits / 10) \* 10

\-    : Math.floor(rawUnits);

\+    : 0;

&#x20;

&#x20;  const totalOutlay = suggestedKitta \* numPrice;

\-  const actualRiskRs = Math.round(suggestedKitta \* perShareRisk);

\-  const totalGainRs = Math.round(suggestedKitta \* perShareGain);

&#x20;  const riskRewardRatio = isStopValid \&\& perShareRisk > 0 ? (perShareGain / perShareRisk).toFixed(2) : '0.00';

&#x20;  const estimatedBrokerFee = totalOutlay > 0 ? calculateDynamicBrokerFee(totalOutlay) : 0;

\-  const sebonFee = totalOutlay > 0 ? Math.round(totalOutlay \* NEPSE\_FRICTION\_FY2083.sebonFeeRate \* 100) / 100 : 0;

\+  const sebonFee = totalOutlay > 0 ? Math.round(totalOutlay \* sebonRate \* 100) / 100 : 0;

\+  const buyTotalCost = totalOutlay > 0 ? (totalOutlay + estimatedBrokerFee + sebonFee + dpFeePerLeg) : 0;

\+  const stopGrossProceeds = suggestedKitta \* numStopLoss;

\+  const stopSellFees = stopGrossProceeds > 0 ? (calculateDynamicBrokerFee(stopGrossProceeds) + (stopGrossProceeds \* sebonRate) + dpFeePerLeg) : 0;

\+  const actualRiskRs = suggestedKitta > 0 ? Math.max(0, Math.round(buyTotalCost - (stopGrossProceeds - stopSellFees))) : 0;

\+  const targetGrossProceeds = suggestedKitta \* numTarget;

\+  const targetSellFees = targetGrossProceeds > 0 ? (calculateDynamicBrokerFee(targetGrossProceeds) + (targetGrossProceeds \* sebonRate) + dpFeePerLeg) : 0;

\+  const preTaxProfit = suggestedKitta > 0 ? ((targetGrossProceeds - targetSellFees) - buyTotalCost) : 0;

\+  const cgtShortTerm = preTaxProfit > 0 ? (preTaxProfit \* 0.05) : 0; // Nepal 5.0% ST CGT (<=365d)

\+  const totalGainRs = Math.round(preTaxProfit - cgtShortTerm);

@@ -249,6 +265,12 @@ export function CapitalRiskSimulatorView({

&#x20;            <div className="pt-2 text-\[11px] text-slate-400 flex items-center justify-between">

&#x20;              <span>Risk Per Share: <b className="text-rose-400 font-mono">Rs. {perShareRisk.toFixed(2)}</b></span>

&#x20;              <span>Reward Per Share: <b className="text-emerald-400 font-mono">Rs. {perShareGain.toFixed(2)}</b></span>

&#x20;            </div>

\+            {(!isStopValid || !isTargetValid) \&\& (

\+              <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-700/60 text-xs text-rose-300 font-semibold">

\+                ⚠️ Invalid levels: Stop-Loss must be strictly below Entry Price and Target must be strictly above Entry Price.

\+              </div>

\+            )}

&#x20;          </div>

@@ -295,15 +317,15 @@ export function CapitalRiskSimulatorView({

&#x20;            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">

&#x20;              <span className="text-\[10.5px] font-bold uppercase tracking-wider text-slate-400 block">

\-                Potential Profit

\+                Net Target Profit

&#x20;              </span>

&#x20;              <span className="text-lg font-black font-mono text-emerald-400 mt-1 block">

&#x20;                Rs. {totalGainRs.toLocaleString()}

&#x20;              </span>

\-              <span className="text-\[10px] text-slate-500 mt-0.5">At Target Price</span>

\+              <span className="text-\[10px] text-slate-500 mt-0.5">After Fees \&amp; 5% ST CGT</span>

&#x20;            </div>

&#x20;

&#x20;            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">

&#x20;              <span className="text-\[10.5px] font-bold uppercase tracking-wider text-slate-400 block">

\-                Broker + SEBON

\+                Entry Fees (+DP)

&#x20;              </span>

&#x20;              <span className="text-sm font-black font-mono text-cyan-400 mt-1 block">

\-                Rs. {(estimatedBrokerFee + sebonFee).toFixed(2)}

\+                Rs. {(totalOutlay > 0 ? (estimatedBrokerFee + sebonFee + dpFeePerLeg) : 0).toFixed(2)}

&#x20;              </span>

&#x20;              <span className="text-\[10px] text-slate-500 mt-0.5">Estimated Entry Friction</span>



```



\---



\#### `src/components/PortfolioHub.jsx` \& `src/components/Portfolio.jsx` (Fixes `A3-049`, `A3-051`)







```diff

\--- a/src/components/PortfolioHub.jsx

+++ b/src/components/PortfolioHub.jsx

@@ -84,6 +84,7 @@ export default function PortfolioHub({

&#x20;        {subTab === 'portfolio' ? (

&#x20;          <Portfolio

&#x20;            marketStocks={marketStocks}

\+            apiStatus={apiStatus}

&#x20;            userId={userId}

&#x20;            userEmail={userEmail}

&#x20;            onSelectStock={onSelectStock}



```



```diff

\--- a/src/components/Portfolio.jsx

+++ b/src/components/Portfolio.jsx

@@ -119,7 +119,7 @@ const getRealClientId = async (boid, dpCode) => {

&#x20;  return 101;

&#x20;};

&#x20;

\-export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altStocks, allStocks: altAllStocks, userId = 'local', userEmail = '', onSelectStock, onSwitchToAccounts, onSwitchToSimulator }) {

+export default function Portfolio({ marketStocks: rawMarketStocks, stocks: altStocks, allStocks: altAllStocks, apiStatus = 'live', userId = 'local', userEmail = '', onSelectStock, onSwitchToAccounts, onSwitchToSimulator }) {

@@ -2761,12 +2761,21 @@ export default function Portfolio({ ...

\-          <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>

\-            <button type="button" onClick={() => setType('buy')} ...>BUY</button>

\-            <button type="button" onClick={() => setType('sell')} ...>SELL</button>

\+          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>

\+            {\[

\+              { id: 'buy', label: 'BUY', bg: 'var(--primary)' },

\+              { id: 'sell', label: 'SELL', bg: 'var(--bear)' },

\+              { id: 'ipo', label: 'IPO/Rights', bg: '#059669' },

\+              { id: 'bonus', label: 'Bonus (100)', bg: '#7c3aed' }

\+            ].map(opt => (

\+              <button

\+                key={opt.id}

\+                type="button"

\+                onClick={() => { setType(opt.id); if (opt.id === 'bonus') setPrice(100); }}

\+                style={{

\+                  padding: '8px 4px', borderRadius: 8, fontSize: 11.5, fontWeight: 800,

\+                  border: 'none', cursor: 'pointer',

\+                  background: type === opt.id ? opt.bg : 'transparent',

\+                  color: type === opt.id ? '#ffffff' : 'var(--text-muted)'

\+                }}

\+              >

\+                {opt.label}

\+              </button>

\+            ))}

&#x20;          </div>

@@ -2865,12 +2874,12 @@ export default function Portfolio({ ...

&#x20;                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>

&#x20;                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Offline Ledger</span>

&#x20;                    {(() => {

\-                      const processed = getProcessedHoldings(manualRaw, 'manual');

\+                      const processed = getProcessedHoldings(manualRaw, 'manual', false);

&#x20;                      return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>• {processed.length} Scrips</span>;

&#x20;                    })()}

&#x20;                  </div>

&#x20;                </div>

&#x20;                {(() => {

\-                  const processed = getProcessedHoldings(manualRaw, 'manual');

\+                  const processed = getProcessedHoldings(manualRaw, 'manual', false);

&#x20;                  const subCost = processed.reduce((sum, h) => sum + h.units \* h.wacc, 0);

@@ -3401,7 +3410,9 @@ export default function Portfolio({ ...

&#x20;                      if (waccSearch \&\& !sym.includes(waccSearch.trim().toUpperCase())) return false;

&#x20;                      if (waccFilterUnconfirmed) {

&#x20;                        const src = waccSourcesMap\[sym];

\-                        if (src \&\& src !== 'FALLBACK\_BASE\_PRICE' \&\& Number(val) !== 100) return false;

\+                        const confirmedSources = new Set(\['IPO\_ALLOTMENT', 'CDSC\_WACC', 'CDSC\_MY\_HOLDING\_DECLARED', 'BROKER\_TMS', 'CUSTOM\_USER\_SET', 'MANUAL\_LEDGER']);

\+                        if (src \&\& confirmedSources.has(src)) return false;

\+                        if (src \&\& src !== 'FALLBACK\_BASE\_PRICE' \&\& Number(val) !== 100) return false;

&#x20;                      }

&#x20;                      return true;

@@ -3560,7 +3571,12 @@ export default function Portfolio({ ...

&#x20;                <button

&#x20;                  type="button"

\-                  onClick={() => {

\-                    handleSyncWaccFromMeroShare();

\+                  onClick={async () => {

\+                    for (const prof of meroshareProfiles) {

\+                      if (prof?.holdings?.length > 0) {

\+                        await handleSyncWaccFromMeroShare(prof);

\+                      }

\+                    }

&#x20;                  }}



```



\---



\#### `src/components/CapitalRiskSimulatorBar.jsx` (Fixes `A3-052`)







```diff

\--- a/src/components/CapitalRiskSimulatorBar.jsx

+++ b/src/components/CapitalRiskSimulatorBar.jsx

@@ -13,6 +13,7 @@ import {

&#x20;  getNepseBrokerCommissionRate,

&#x20;  DEFAULT\_USER\_CAPITAL

&#x20;} from '../utils/dynamicCapitalEngine';

+import { loadEncryptedUserProfiles, resolveActiveUserId } from '../utils/profileVaultStorage';

&#x20;

@@ -63,28 +64,34 @@ export function CapitalRiskSimulatorBar({ onCapitalChange, className = '' }) {

\-  const handleSyncWithPortfolio = () => {

\+  const handleSyncWithPortfolio = async () => {

&#x20;    try {

\+      const uid = resolveActiveUserId();

&#x20;      let foundValue = 0;

\-      // Search for stored holdings or portfolio data

\-      const keys = Object.keys(localStorage);

\-      for (const k of keys) {

\-        if (k.startsWith('nepse\_portfolio\_txs\_') || k.startsWith('nepse\_hub\_') || k === 'nepse\_holdings' || k === 'nepse\_portfolio\_v1') {

\-          try {

\-            const parsed = JSON.parse(localStorage.getItem(k) || '\[]');

\-            if (Array.isArray(parsed) \&\& parsed.length > 0) {

\-              const val = parsed.reduce((sum, h) => sum + (Number(h.totalCost || h.currentValue || (h.units \* h.wacc) || 0)), 0);

\-              if (val > foundValue) foundValue = val;

\-            }

\-          } catch (\_) {}

\-        }

\-      }

\+      const profiles = await loadEncryptedUserProfiles(uid);

\+      (profiles || \[]).forEach(p => {

\+        (p.holdings || \[]).forEach(h => {

\+          foundValue += Number(h.valueAsOfLTP || h.valueAsOfPrevClose || h.currentValue || ((Number(h.units) || 0) \* (Number(h.currentLtp || h.prevClose || h.wacc) || 0)) || 0);

\+        });

\+      });

\+      try {

\+        const txs = JSON.parse(localStorage.getItem(`nepse\_hub\_${uid}\_transactions`) || '\[]');

\+        const netMap = {};

\+        \[...(Array.isArray(txs) ? txs : \[])].reverse().forEach(tx => {

\+          const sym = String(tx.symbol || '').toUpperCase();

\+          if (!sym) return;

\+          if (!netMap\[sym]) netMap\[sym] = { units: 0, cost: 0 };

\+          const q = Number(tx.quantity) || 0;

\+          const p = Number(tx.price) || 0;

\+          if (tx.type === 'sell') {

\+            const avg = netMap\[sym].units > 0 ? netMap\[sym].cost / netMap\[sym].units : 0;

\+            netMap\[sym].units = Math.max(0, netMap\[sym].units - q);

\+            netMap\[sym].cost = netMap\[sym].units \* avg;

\+          } else {

\+            netMap\[sym].units += q;

\+            netMap\[sym].cost += q \* (tx.type === 'bonus' ? 100 : p);

\+          }

\+        });

\+        Object.values(netMap).forEach(h => { foundValue += Math.max(0, h.cost); });

\+      } catch (\_) {}

&#x20;

&#x20;      if (foundValue > 10000) {

&#x20;        applyCapital(foundValue);

&#x20;        setSyncedSuccess(true);

&#x20;        setTimeout(() => setSyncedSuccess(false), 3000);

\-      } else {

\-        // Fallback to default

\-        applyCapital(DEFAULT\_USER\_CAPITAL);

&#x20;      }

&#x20;    } catch (\_) {}

&#x20;  };



```



\---



\#### `src/context/NavigationContext.jsx` (Fixes `A3-054`)







```diff

\--- a/src/context/NavigationContext.jsx

+++ b/src/context/NavigationContext.jsx

@@ -22,7 +22,7 @@ export function NavigationProvider({ children, initialTab = 'dashboard' }) {

&#x20;      return initialTab;

&#x20;    }

&#x20;  });

\-  const \[tabHistory, setTabHistory] = useState(\[initialTab]);

\+  const \[tabHistory, setTabHistory] = useState(() => \[activeTab]);

&#x20;  const \[selectedStock, setSelectedStock] = useState(null);

@@ -94,14 +94,14 @@ export function NavigationProvider({ children, initialTab = 'dashboard' }) {

&#x20;    lastGoBackTimeRef.current = now;

&#x20;

\-    // 1. Run the topmost registered modal / drawer handler

\-    if (backHandlersRef.current.length > 0) {

\-      const top = backHandlersRef.current\[0]; // Highest priority

\+    // 1. Walk registered modal / drawer handlers in priority order until one handles back

\+    for (const entry of \[...backHandlersRef.current]) {

&#x20;      try {

\-        const handled = top.handler();

\+        const handled = entry.handler();

&#x20;        if (handled) return true;

&#x20;      } catch (err) {

&#x20;        console.warn('\[Navigation] Back handler error:', err);

&#x20;      }

&#x20;    }

@@ -122,10 +122,12 @@ export function NavigationProvider({ children, initialTab = 'dashboard' }) {

&#x20;      const nextHistory = tabHistory.slice(0, -1);

&#x20;      const prevTab = nextHistory\[nextHistory.length - 1] || 'dashboard';

&#x20;      setTabHistory(nextHistory);

\+      try { sessionStorage.setItem('nepse\_active\_tab', prevTab); } catch (\_) {}

&#x20;      React.startTransition(() => {

&#x20;        setActiveTabState(prevTab);

&#x20;      });

&#x20;      return true;

&#x20;    } else if (activeTab !== 'dashboard') {

\+      try { sessionStorage.setItem('nepse\_active\_tab', 'dashboard'); } catch (\_) {}

&#x20;      React.startTransition(() => {

&#x20;        setActiveTabState('dashboard');

&#x20;      });

@@ -154,11 +156,17 @@ export function NavigationProvider({ children, initialTab = 'dashboard' }) {

&#x20;  // Hook into Capacitor Native Android Hardware Back Button \& Swipe Gestures

&#x20;  useEffect(() => {

&#x20;    let listenerHandle = null;

\+    let cancelled = false;

&#x20;

&#x20;    const setupCapacitor = async () => {

&#x20;      try {

\-        listenerHandle = await CapacitorApp.addListener('backButton', () => {

\+        const handle = await CapacitorApp.addListener('backButton', () => {

&#x20;          if (goBackRef.current) goBackRef.current();

&#x20;        });

\+        if (cancelled) {

\+          handle?.remove?.();

\+        } else {

\+          listenerHandle = handle;

\+        }

&#x20;      } catch (\_) {

&#x20;        // Web / non-Capacitor environment

&#x20;      }

@@ -171,6 +179,7 @@ export function NavigationProvider({ children, initialTab = 'dashboard' }) {

&#x20;    window.addEventListener('popstate', handlePopState);

&#x20;

&#x20;    return () => {

\+      cancelled = true;

&#x20;      if (listenerHandle \&\& typeof listenerHandle.remove === 'function') {

&#x20;        listenerHandle.remove();

&#x20;      }



```



\---



\#### `src/context/SubscriptionContext.jsx` (Fixes `A3-055`)







```diff

\--- a/src/context/SubscriptionContext.jsx

+++ b/src/context/SubscriptionContext.jsx

@@ -1,7 +1,7 @@

&#x20;// src/context/SubscriptionContext.jsx

&#x20;// Global React context providing server-verified Pro state, monthly timeframe management, and modal controls.

&#x20;

\-import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

+import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';

@@ -24,14 +24,16 @@ export function SubscriptionProvider({ children }) {

&#x20;  const \[isModalOpen, setIsModalOpen] = useState(false);

&#x20;  const \[modalInitialPlan, setModalInitialPlan] = useState('1m');

&#x20;  const \[lockedFeatureName, setLockedFeatureName] = useState(null);

\+  const mutationVersionRef = useRef(0);

&#x20;

&#x20;  // Hydrate authoritative subscription state from server on mount \& check expiry every 60s

&#x20;  useEffect(() => {

&#x20;    let active = true;

\+    const reqVersion = mutationVersionRef.current;

&#x20;

&#x20;    fetchServerLicenseStatus(deviceId).then((serverSub) => {

\-      if (!active || !serverSub || typeof serverSub !== 'object') return;

\+      if (!active || reqVersion !== mutationVersionRef.current || !serverSub || typeof serverSub !== 'object') return;

&#x20;      const norm = normalizeSubscription(serverSub);

&#x20;      saveStoredSubscription(norm);

&#x20;      setSubState(norm);

@@ -56,6 +58,7 @@ export function SubscriptionProvider({ children }) {

&#x20;

&#x20;  // Cancel / Reset local subscription state to free tier

&#x20;  const cancelPlan = useCallback(async () => {

\+    mutationVersionRef.current += 1;

&#x20;    await revokeServerLicenseStatusOnServer(deviceId).catch(() => {});

&#x20;    const free = getFreeSubscription();

&#x20;    saveStoredSubscription(free);

@@ -64,8 +67,9 @@ export function SubscriptionProvider({ children }) {

&#x20;

&#x20;  // Redeem server-verified device-bound license key

&#x20;  const redeemCode = useCallback(async (code) => {

&#x20;    const result = await redeemVoucherKey(code, deviceId);

&#x20;    if (result.success \&\& result.subscription) {

\+      mutationVersionRef.current += 1;

&#x20;      const verified = normalizeSubscription(result.subscription);

&#x20;      saveStoredSubscription(verified);

&#x20;      setSubState(verified);

@@ -75,8 +79,9 @@ export function SubscriptionProvider({ children }) {

&#x20;

&#x20;  // Refresh authoritative Pro entitlement from license server instead of trusting cloud sync blobs

&#x20;  const syncFromCloud = useCallback((\_cloudSub) => {

\+    const reqVersion = mutationVersionRef.current;

&#x20;    fetchServerLicenseStatus(deviceId).then((serverSub) => {

\-      if (!serverSub || typeof serverSub !== 'object') return;

\+      if (reqVersion !== mutationVersionRef.current || !serverSub || typeof serverSub !== 'object') return;

&#x20;      const verified = normalizeSubscription(serverSub);

&#x20;      saveStoredSubscription(verified);

&#x20;      setSubState(verified);



```



Upload `03-ACC3-REM-PART02.txt` next with the same continuation prompt to continue from `A3-060`.
### 1. Files Inspected in This Turn



From `03-ACC3-REM-PART02.txt`:



\* `src\\components\\Dashboard.jsx` \*(complete — zero truncation)\*







\*\*Cross-referenced from earlier turns:\*\* `src\\App.jsx`, `src\\constants\\marketRules.js`, `src\\components\\AlphaCommandCenter.tsx`, and `src\\components\\AdvancedChartModal.jsx`.



\---



\### 2. Audit Findings Table (Continuing from `A3-059`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-060\*\* | \*\*P0\*\* | `src/components/Dashboard.jsx` (Prime Daily Pick Execution Grid \& `alphaDeskSummary` `useMemo`)



&#x20;| (1) Fallback `t1NetPct`/`t2NetPct` multiplies by `0.925` (outdated `7.5%` CGT) and renders `(-7.5% CGT+fees)` labels. (2) `alphaDeskSummary` calls `runUnifiedFiveStepAlphaDesk({ stocks, indices })` without `cgtRate: 0.05` or the user's configured capital from `localStorage` (`master\_guide\_capital`), diverging from `AlphaCommandCenter.tsx`.



&#x20;| Violates Nepal CGT rates effective 22 Sept 2026 (`5.0%` ST / `3.75%` LT); investors see understated net target returns and conflicting lot sizes between the Dashboard summary card and the full Alpha Desk.



&#x20;| Use `\* 0.95` (`5.0%` ST CGT) and update labels to `(-5.0% ST CGT+fees)`; pass `cgtRate: 0.05` and the user's stored `userCapital` into `runUnifiedFiveStepAlphaDesk`. |

| \*\*A3-061\*\* | \*\*P0\*\* | `src/components/Dashboard.jsx` (`loadHeroHistory` `useEffect`, `<ShareHubChart>`, `<AdvancedChartModal>`)



&#x20;| (1) When `fetchPriceHistory(sym, 500)` returns empty for ANY stock or sector sub-index (`sym !== 'NEPSE'`), `loadHeroHistory` silently fetches `NEPSE` index history and scales it by `targetVal / nepseClose` to fabricate a fake chart and fake `1W–ALL` returns. (2) Switching `activeHeroIndex` does not clear stale `heroHistory` while fetching. (3) Both `<ShareHubChart>` instances hardcode `isIndex={true}` and `<AdvancedChartModal>` hardcodes `sector: 'NEPSE Index'` even when `activeHeroIndex.isStock === true`.



&#x20;| Investors inspecting a stock or sector sub-index on `1W–1Y` see the NEPSE index curve and return percentages disguised as that stock's real history, or see the prior ticker's chart while loading.



&#x20;| Remove the `NEPSE` history scaling fabrication (show an empty/unavailable state instead), clear `heroHistory` on symbol switch, and pass `isIndex={!activeHeroIndex?.isStock}` and real stock sector into `<ShareHubChart>` and `<AdvancedChartModal>`. |

| \*\*A3-062\*\* | \*\*P0\*\* | `src/components/Dashboard.jsx` (SEBON Index Circuit Breaker banner \& Hero Turnover display)



&#x20;| (1) The market-wide circuit halt banner checks `heroTimeframe === '1D' \&\& Math.abs(heroTfStats.pChange || 0) >= 4.0` without verifying `activeHeroIndex.key === 'nepse' \&\& !activeHeroIndex?.isStock`. (2) Hero Turnover (inline and fullscreen) uses `heroVal.turnover || indices?.nepse?.turnover`, falling back to market-wide multi-Arba turnover for any untraded stock on the Hero Chart.



&#x20;| Loading any stock or sub-index up/down $\\ge 5\\%$ or $\\ge 8\\%$ onto the Hero Chart flashes a fake \*\*`🚨 SEBON Level 2 Circuit Breaker: Full session halt triggered`\*\* banner; untraded stocks show Rs. Arba in fake turnover.



&#x20;| Gate the SEBON index circuit breaker alert strictly on `!activeHeroIndex?.isStock \&\& activeHeroIndex.key === 'nepse'`; do not fall back to `indices?.nepse?.turnover` when `activeHeroIndex?.isStock` is `true`. |

| \*\*A3-063\*\* | \*\*P0\*\* | `src/components/Dashboard.jsx` (`isHeroBull`, `heroTfStats`, inline \& fullscreen Hero delta badges)



&#x20;| Uses boolean OR `c >= 0 || pc >= 0` (`isHeroBull` and `heroTfStats.isBull`). When one field is negative (e.g. `change = -5.2`) and the other is `0`/missing (`pChange = 0`), `0 >= 0` forces `isBull = true`. Also renders `▲ +{fmt(heroTfStats.change)}` without `Math.abs`.



&#x20;| A declining index or stock renders in bullish green with malformed text like `▲ +-5.20 pts (+0.00%)`.



&#x20;| Derive sign from `(c !== 0 ? c : pc) >= 0` (with neutral styling when both are `0`), and wrap `change` and `pChange` in `Math.abs(...)` after the sign prefix. |

| \*\*A3-064\*\* | \*\*P0\*\* | `src/components/Dashboard.jsx` (Live Market Sync Bar, `formattedTimestamp`, Fullscreen Market Status pill)



&#x20;| Cross-file with `A3-008`: (1) `formattedTimestamp` falls back to `new Date()` when `lastSyncTime` is `null`. (2) Sync bar displays `'Closing Snapshot'` whenever `apiStatus !== 'live'` (including `'offline'`). (3) Fullscreen modal pulses green `Market Open` whenever `marketStatus?.isOpen` without checking `apiStatus === 'live'`.



&#x20;| Offline or failed feeds display `"Closing Snapshot"` with the live wall-clock second (`Last updated: ...`), and fullscreen mode pulses green `Market Open` on cached data.



&#x20;| Return `'Awaiting sync'` when `lastSyncTime` is `null`; label `apiStatus === 'offline'` as `'Offline — Cached Data'` and `'yesterday'` as `'Last Closing Snapshot'`; gate pulsing fullscreen `Market Open` on `apiStatus === 'live'`. |

| \*\*A3-065\*\* | \*\*P1\*\* | `src/components/Dashboard.jsx` (`AUTO-ANALYSIS` candidate evaluation `useEffect`)



&#x20;| Assigns `lastEvaluatedSessionRef.current = status.targetSessionDate` \*before\* checking `if (prioritySymbols.length === 0) return;`. On weekends, holidays, or after 3:00 PM NPT, the initial render with `stocks = \[]` locks `lastEvaluatedSessionRef`, permanently skipping evaluation once stocks load. Also adds symbols to `verifiedSymbolsRef` before batch completion and resets on `backtestCacheVersion`.



&#x20;| On weekends and evenings, the Prime Daily Pick card stays permanently stuck in `"0 Passing Setups / Capital Defense Active"` even when valid setups exist in the last session.



&#x20;| Move `lastEvaluatedSessionRef.current = status.targetSessionDate` \*after\* `prioritySymbols.length === 0` returns and after `stocks.length > 0` is confirmed; remove `backtestCacheVersion` from the dependency list so background warming does not abort in-flight evaluations. |

| \*\*A3-066\*\* | \*\*P1\*\* | `src/components/Dashboard.jsx` (`loadHeroHistory` `useEffect`)



&#x20;| `loadHeroHistory` only depends on `\[activeHeroIndex.key, activeHeroIndex.name, heroTimeframe]`. During active NEPSE hours (`11:00 AM–3:00 PM NPT`), `indices.nepse.value` updates every 1.5s in `App.jsx`, but the `1D` hero chart never appends new live ticks after initial mount.



&#x20;| Investors viewing the `1D` NEPSE chart during live market hours see a frozen chart line that diverges from the live index price directly above it.



&#x20;| Add a lightweight `useEffect` on `\[indices?.nepse?.value, activeHeroIndex?.isStock, activeHeroIndex?.val?.value, heroTimeframe, marketStatus?.isOpen]` that appends/updates the latest `1D` tick in `heroHistory` without re-fetching full history. |

| \*\*A3-067\*\* | \*\*P1\*\* | `src/components/Dashboard.jsx` (`fearGreedData` `useMemo`)



&#x20;| Computes the market-wide Fear \& Greed Index from `currentHeroValue` and `heroHistory`. On default `1D`, `heroHistory` contains 1-minute intraday ticks (not daily candles for an SMA-200), and when a user selects an individual stock on the Hero Chart, `currentHeroValue` becomes that stock's LTP. `avgPChange` also averages across debentures and mutual funds.



&#x20;| Market-wide sentiment fluctuates randomly whenever the user switches Hero Chart timeframe or loads an individual stock.



&#x20;| Anchor `fearGreedData` strictly to `indices?.nepse` (`value`, `pChange`) and `isPureNepseEquity` traded stocks (or cached daily NEPSE history), independent of `activeHeroIndex` and `heroTimeframe`. |

| \*\*A3-068\*\* | \*\*P1\*\* | `src/components/Dashboard.jsx` (`isCircuitStock`, `ChangeSummaryModal`, `marketSummaryStats` Float Index UI)



&#x20;| (1) `isCircuitStock` flags `pChange >= 14.0%` as `⚡ CIRCUIT (15%)`, violating `CIRCUIT\_LIMITS.individualStockDailyBandPct` (`15.0%`) in `marketRules.js`. (2) `ChangeSummaryModal` tab badge counts omit `isPureNepseEquity(s)` while the table applies it, and clicking `SYM` sort subtracts strings (`vA - vB` = `NaN`). (3) `Float Index` card evaluates `null >= 0` (`true`) when `floatChg` is `null`, rendering a stray green `+` with empty value.



&#x20;| Non-circuit 14% movers are mislabeled as locked at 15% circuit; Change Summary tab badges mismatch row counts and `SYM` sort is broken; Float Index shows broken `+` text on missing data.



&#x20;| Tighten circuit threshold to `14.85%` (post-regime) / `9.85%` (pre-regime); apply `isPureNepseEquity(s)` to tab counts and `localeCompare` for `symbol` sorting; guard `floatVal != null` and `floatChg != null` with `fmt(...)`. |

| \*\*A3-069\*\* | \*\*P1\*\* | `src/components/Dashboard.jsx` (`useBackHandler`, `isHeroFullscreen` cleanup, `TopSearchBar` timer)



&#x20;| (1) `useBackHandler` ignores `isHeroFullscreen` and `showSignalTrackerModal`. (2) No unmount cleanup unlocks `window.screen.orientation` if unmounted in fullscreen. (3) `TopSearchBar` never clears `debounceTimer` on unmount.



&#x20;| Pressing Android Back in Fullscreen Landscape Chart or Signal Track Record leaves the screen stuck in landscape or exits the app instead of closing the modal.



&#x20;| Add `isHeroFullscreen` and `showSignalTrackerModal` to `useBackHandler`, add unmount cleanup for orientation/fullscreen, and clear `debounceTimer` in `TopSearchBar`. |

| \*\*A3-070\*\* | \*\*P2\*\* | `src/components/Dashboard.jsx` (Dead `TradingChart`, eager `StockDetailModal` import, `getCachedMarketSummary()` in render)



&#x20;| Defines an unused 290-line `TradingChart` component; synchronously imports 530 KB `StockDetailModal` (defeating `App.jsx`'s `retryableLazy` code-splitting); calls `getCachedMarketSummary()` bare in render, passing a new object reference into 4 `useMemo` hooks every render.



&#x20;| Heavy initial bundle slows LCP, and breadth/summary memos recompute on every 1.5s tick.



&#x20;| Remove dead `TradingChart`, lazy-load fallback `StockDetailModal`, and memoize `getCachedMarketSummary()` keyed on `\[stocks, lastSyncTime]`. |

| \*\*A3-071\*\* | \*\*P2\*\* | `src/components/Dashboard.jsx` (`window.\_dashboardBackendWinRate`, `WatchlistStockRow`, Movers flat styling)



&#x20;| Caches backend win rate on `window.\_dashboardBackendWinRate` forever without refreshing on signal close/manual refresh; displays `Base (0% to pivot)` when `ltp === 0`; colors `0.00%` unchanged stocks green (`>= 0`) in Watchlist and Movers.



&#x20;| Stale win-rate badge and misleading green `+0.00%` styling on flat stocks.



&#x20;| Re-fetch backend summary when `showSignalTrackerModal` closes or on manual refresh, guard `ltp > 0` for `pctToPivot`, and style `pCh === 0` neutrally. |

| \*\*A3-072\*\* | \*\*P3\*\* | `src/components/Dashboard.jsx` (Unused imports \& `handleRefreshDepth` timeout)



&#x20;| 17 unused utility/component imports clutter the top of the file; `handleRefreshDepth` leaves a 500ms `setTimeout` uncleaned on unmount.



&#x20;| Dead bundle references and minor unmount state warning.



&#x20;| Remove unused imports and clear the depth refresh timeout on unmount. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/components/Dashboard.jsx` (Fixes `A3-060` through `A3-069`)







```diff

\--- a/src/components/Dashboard.jsx

+++ b/src/components/Dashboard.jsx

@@ -411,11 +411,12 @@ export const isHighImpactNepseHeadline = (title = '') => {

&#x20;const isCircuitStock = (s, direction = 'any') => {

&#x20;  const chg = Number(s?.pChange) || 0;

&#x20;  const dateStr = s?.date || s?.businessDate || '';

&#x20;  const isPreRegime = Boolean(dateStr \&\& dateStr < '2026-04-20');

\-  const threshold = isPreRegime ? 9.5 : 14.0;

\+  // Match SEBON statutory ±15% (pre-April 2026 ±10%) allowing only rounding/tick tolerance

\+  const threshold = isPreRegime ? 9.85 : 14.85;

&#x20;  const isPos = chg >= threshold || (Boolean(s?.isCircuitHit) \&\& chg > 0);

&#x20;  const isNeg = chg <= -threshold || (Boolean(s?.isCircuitHit) \&\& chg < 0);

&#x20;  if (direction === 'pos') return isPos;

&#x20;  if (direction === 'neg') return isNeg;

&#x20;  return isPos || isNeg;

&#x20;};

@@ -587,13 +588,16 @@ function ChangeSummaryModal({ stocks, initialTab = 'advanced', onClose, onSelect

&#x20;    return list.sort((a, b) => {

\+      if (sortField === 'symbol') {

\+        const sA = String(a.symbol || '');

\+        const sB = String(b.symbol || '');

\+        return sortAsc ? sA.localeCompare(sB) : sB.localeCompare(sA);

\+      }

&#x20;      let vA = a\[sortField] || 0;

&#x20;      let vB = b\[sortField] || 0;

&#x20;      return sortAsc ? vA - vB : vB - vA;

&#x20;    });

&#x20;  }, \[stocks, tab, search, sortField, sortAsc]);

\+  const pureEquities = useMemo(() => stocks.filter(s => isPureNepseEquity(s)), \[stocks]);

@@ -619,11 +623,11 @@ function ChangeSummaryModal({ stocks, initialTab = 'advanced', onClose, onSelect

&#x20;        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>

&#x20;          {\[

\-            { id: 'advanced', label: 'Advanced', count: stocks.filter(s => (s.pChange || 0) > 0).length, color: 'var(--bull)' },

\-            { id: 'declined', label: 'Declined', count: stocks.filter(s => (s.pChange || 0) < 0).length, color: '#F43F5E' },

\-            { id: 'unchanged', label: 'Unchanged', count: stocks.filter(s => (s.pChange || 0) === 0 \&\& ((s.volume || 0) > 0 || (s.turnover || 0) > 0)).length, color: 'var(--text-muted)' },

\-            { id: 'circuit\_pos', label: '+ve Circuit (15%)', count: stocks.filter(s => isCircuitStock(s, 'pos')).length, color: 'var(--bull)' },

\-            { id: 'circuit\_neg', label: '-ve Circuit (15%)', count: stocks.filter(s => isCircuitStock(s, 'neg')).length, color: '#F43F5E' },

\+            { id: 'advanced', label: 'Advanced', count: pureEquities.filter(s => (s.pChange || 0) > 0).length, color: 'var(--bull)' },

\+            { id: 'declined', label: 'Declined', count: pureEquities.filter(s => (s.pChange || 0) < 0).length, color: '#F43F5E' },

\+            { id: 'unchanged', label: 'Unchanged', count: pureEquities.filter(s => (s.pChange || 0) === 0 \&\& ((s.volume || 0) > 0 || (s.turnover || 0) > 0)).length, color: 'var(--text-muted)' },

\+            { id: 'circuit\_pos', label: '+ve Circuit (15%)', count: pureEquities.filter(s => isCircuitStock(s, 'pos')).length, color: 'var(--bull)' },

\+            { id: 'circuit\_neg', label: '-ve Circuit (15%)', count: pureEquities.filter(s => isCircuitStock(s, 'neg')).length, color: '#F43F5E' },

&#x20;          ].map(t => (

@@ -807,6 +811,7 @@ const TopSearchBar = React.memo(function TopSearchBar({

&#x20;    return () => {

&#x20;      document.removeEventListener('mousedown', handleOutsideClick);

&#x20;      document.removeEventListener('touchstart', handleOutsideClick);

\+      if (debounceTimer.current) clearTimeout(debounceTimer.current);

&#x20;    };

&#x20;  }, \[setIsSearching]);

@@ -1158,12 +1163,24 @@ function Dashboard({

&#x20;  // Hook back handlers for local modals

&#x20;  useBackHandler(() => {

\+    if (isHeroFullscreen) { handleToggleHeroFullscreen(); return true; }

\+    if (showSignalTrackerModal) { setShowSignalTrackerModal(false); return true; }

&#x20;    if (breadthModalTab) { setBreadthModalTab(null); return true; }

&#x20;    if (showSubIndicesModal) { setShowSubIndicesModal(false); return true; }

&#x20;    if (showTVModal) { setShowTVModal(false); return true; }

&#x20;    return false;

\-  }, Boolean(breadthModalTab || showSubIndicesModal || showTVModal), 30);

\+  }, Boolean(isHeroFullscreen || showSignalTrackerModal || breadthModalTab || showSubIndicesModal || showTVModal), 30);

\+

\+  // Ensure fullscreen \& landscape lock are always released on unmount

\+  useEffect(() => {

\+    return () => {

\+      try {

\+        if (document.fullscreenElement \&\& document.exitFullscreen) document.exitFullscreen().catch(() => {});

\+        if (window.screen?.orientation?.unlock) window.screen.orientation.unlock();

\+      } catch (\_) {}

\+    };

\+  }, \[]);

@@ -1219,7 +1236,8 @@ function Dashboard({

&#x20;  // Dynamic Nepal Standard Time (NPT) Formatter

&#x20;  const formattedTimestamp = useMemo(() => {

\-    const d = lastSyncTime ? new Date(lastSyncTime) : new Date();

\+    if (!lastSyncTime) return 'Awaiting sync';

\+    const d = new Date(lastSyncTime);

\+    if (isNaN(d.getTime())) return 'Awaiting sync';

&#x20;    try {

&#x20;      return new Intl.DateTimeFormat('en-US', {

@@ -1302,6 +1320,8 @@ function Dashboard({

&#x20;  useEffect(() => {

&#x20;    let active = true;

\+    // Clear prior symbol's chart immediately to prevent cross-ticker chart flash during load

\+    setHeroHistory(\[]);

&#x20;    async function loadHeroHistory() {

&#x20;      if (active) setHeroChartLoading(true);

&#x20;      try {

@@ -1355,22 +1375,7 @@ function Dashboard({

&#x20;        }

&#x20;

&#x20;        let data = await fetchPriceHistory(sym, 500);

\-        // Fallback for sub-indices/sectors: if sector history is empty, scale from NEPSE's history

\-        if ((!data || !Array.isArray(data) || data.length === 0) \&\& sym !== 'NEPSE') {

\-          const nepseData = await fetchPriceHistory('NEPSE', 500);

\-          if (nepseData \&\& Array.isArray(nepseData) \&\& nepseData.length > 0) {

\-            const nepseClose = Number(nepseData\[nepseData.length - 1]?.close || currentHeroValue || 0);

\-            const targetVal = Number(currentHeroValue || nepseClose || 0);

\-            const scaleFactor = nepseClose > 0 ? (targetVal / nepseClose) : 1;

\-            data = nepseData.map(d => ({

\-              ...d,

\-              open: +(Number(d.open) \* scaleFactor).toFixed(2),

\-              high: +(Number(d.high) \* scaleFactor).toFixed(2),

\-              low: +(Number(d.low) \* scaleFactor).toFixed(2),

\-              close: +(Number(d.close) \* scaleFactor).toFixed(2),

\-            }));

\-          }

\-        }

\+        // Never fabricate stock or sector historical charts by scaling NEPSE index history

&#x20;

&#x20;        if (!active) return;

&#x20;        if (data \&\& Array.isArray(data) \&\& data.length > 0) {

@@ -1397,6 +1402,38 @@ function Dashboard({

&#x20;    return () => { active = false; };

&#x20;  }, \[activeHeroIndex.key, activeHeroIndex.name, heroTimeframe]);

&#x20;

\+  // Live 1D intraday tick appender so chart stays synced with live NOTS ticks during market hours

\+  useEffect(() => {

\+    if (heroTimeframe !== '1D' || !marketStatus?.isOpen || apiStatus !== 'live') return;

\+    const liveVal = activeHeroIndex?.isStock

\+      ? Number(activeHeroIndex?.val?.value || 0)

\+      : (activeHeroIndex.key === 'nepse' ? Number(indices?.nepse?.value || 0) : Number(activeHeroIndex?.val?.value || 0));

\+    if (!Number.isFinite(liveVal) || liveVal <= 0) return;

\+

\+    setHeroHistory(prev => {

\+      if (!Array.isArray(prev) || prev.length === 0) return prev;

\+      const lastPt = prev\[prev.length - 1];

\+      if (!lastPt || Math.abs(Number(lastPt.close) - liveVal) < 0.01) return prev;

\+      const nowNpt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kathmandu' });

\+      const next = \[...prev];

\+      if (lastPt.time === nowNpt) {

\+        next\[next.length - 1] = {

\+          ...lastPt,

\+          close: liveVal,

\+          high: Math.max(Number(lastPt.high || liveVal), liveVal),

\+          low: Math.min(Number(lastPt.low || liveVal), liveVal),

\+        };

\+      } else {

\+        next.push({

\+          time: nowNpt,

\+          timestamp: Math.floor(Date.now() / 1000),

\+          open: Number(lastPt.close || liveVal),

\+          high: Math.max(Number(lastPt.close || liveVal), liveVal),

\+          low: Math.min(Number(lastPt.close || liveVal), liveVal),

\+          close: liveVal,

\+          volume: 0,

\+        });

\+      }

\+      return next;

\+    });

\+  }, \[indices?.nepse?.value, activeHeroIndex?.isStock, activeHeroIndex?.key, activeHeroIndex?.val?.value, heroTimeframe, marketStatus?.isOpen, apiStatus]);

\+

@@ -1434,26 +1471,28 @@ function Dashboard({

&#x20;  // NEPSE Market Sentiment \& Fear \& Greed Index (0 - 100)

&#x20;  const fearGreedData = useMemo(() => {

&#x20;    const totalTraded = advancedCount + declinedCount + unchangedCount || 1;

&#x20;    const adRatio = advancedCount / totalTraded;

&#x20;    const breadthScore = adRatio \* 100;

&#x20;    

\-    const nepseVal = Number(currentHeroValue) || 2550;

\-    

\-    // Dynamically compute 200-period SMA from heroHistory when available

\+    // Anchor strictly to NEPSE index + cached daily NEPSE history (never currentHeroValue or 1D ticks/single stock)

\+    const nepseVal = Number(indices?.nepse?.value || getCachedIndices()?.nepse?.value || 0);

&#x20;    let dynamicSma200 = null;

\-    if (Array.isArray(heroHistory) \&\& heroHistory.length >= 20) {

\-      const closeValues = heroHistory.map(h => Number(h.close || h.value || 0)).filter(v => v > 0);

\+    const nepseDaily = getCachedRealPriceHistory('NEPSE');

\+    if (Array.isArray(nepseDaily) \&\& nepseDaily.length >= 20) {

\+      const closeValues = nepseDaily.map(h => Number(h.close || h.value || 0)).filter(v => v > 0);

&#x20;      if (closeValues.length >= 20) {

&#x20;        const period = Math.min(200, closeValues.length);

&#x20;        const slice = closeValues.slice(-period);

&#x20;        dynamicSma200 = slice.reduce((a, b) => a + b, 0) / period;

&#x20;      }

&#x20;    }

&#x20;    const sma200 = dynamicSma200 || nepseVal;

\-    const trendScore = nepseVal >= sma200 ? 65 + Math.min(25, (nepseVal - sma200) / 20) : 35 - Math.min(25, (sma200 - nepseVal) / 20);

\+    const trendScore = (nepseVal > 0 \&\& sma200 > 0)

\+      ? (nepseVal >= sma200 ? 65 + Math.min(25, (nepseVal - sma200) / 20) : 35 - Math.min(25, (sma200 - nepseVal) / 20))

\+      : 50;

&#x20;    

\-    const avgPChange = stocks.length > 0 ? (stocks.reduce((acc, s) => acc + (Number(s.pChange) || 0), 0) / stocks.length) : 0;

\+    const tradedEquities = stocks.filter(s => isPureNepseEquity(s) \&\& ((Number(s.volume) || 0) > 0 || (Number(s.turnover) || 0) > 0));

\+    const avgPChange = tradedEquities.length > 0 ? (tradedEquities.reduce((acc, s) => acc + (Number(s.pChange) || 0), 0) / tradedEquities.length) : 0;

&#x20;    const rsiScore = 50 + (avgPChange \* 12);

@@ -1484,7 +1523,7 @@ function Dashboard({

&#x20;    }

&#x20;

&#x20;    return { score, label, color, desc };

\-  }, \[advancedCount, declinedCount, unchangedCount, currentHeroValue, stocks, heroHistory]);

\+  }, \[advancedCount, declinedCount, unchangedCount, indices?.nepse?.value, stocks]);

@@ -1690,8 +1729,12 @@ function Dashboard({

&#x20;  const alphaDeskSummary = useMemo(() => {

&#x20;    if (!Array.isArray(stocks) || stocks.length === 0) return null;

&#x20;    try {

\-      return runUnifiedFiveStepAlphaDesk({ stocks, indices });

\+      let userCapital = 100000;

\+      try {

\+        const savedCap = Number(localStorage.getItem('master\_guide\_capital') || localStorage.getItem('nepse\_user\_capital'));

\+        if (Number.isFinite(savedCap) \&\& savedCap >= 10000) userCapital = savedCap;

\+      } catch (\_) {}

\+      return runUnifiedFiveStepAlphaDesk({ stocks, indices, userCapital, cgtRate: 0.05 });

&#x20;    } catch (err) {

&#x20;      console.error('\[Dashboard] Error evaluating runUnifiedFiveStepAlphaDesk:', err);

&#x20;      return null;

@@ -1710,9 +1753,10 @@ function Dashboard({

&#x20;    // When market is closed (e.g. Sat, Sun, public holidays, or closed off-hours), avoid continuous re-evaluations

\+    if (!Array.isArray(stocks) || stocks.length === 0) return;

&#x20;    if (!status.isOpen \&\& lastEvaluatedSessionRef.current === status.targetSessionDate) {

&#x20;      return;

&#x20;    }

\-    lastEvaluatedSessionRef.current = status.targetSessionDate;

&#x20;

&#x20;    // Collect top candidates in strict priority order to verify against quantitative setup engine

@@ -1755,6 +1799,7 @@ function Dashboard({

&#x20;      });

&#x20;

&#x20;    if (prioritySymbols.length === 0) return;

\+    lastEvaluatedSessionRef.current = status.targetSessionDate;

@@ -1867,7 +1912,7 @@ function Dashboard({

&#x20;      isMounted = false;

&#x20;      setIsEvaluatingCandidates(false);

&#x20;    };

\-  }, \[stocks?.length, watchedOrAlertSymbols, activeBreakoutToast?.symbol, cashDefenseActive, backtestCacheVersion]);

\+  }, \[stocks?.length, watchedOrAlertSymbols, activeBreakoutToast?.symbol, cashDefenseActive]);

@@ -2046,7 +2091,7 @@ function Dashboard({

&#x20;    : (((activeHeroIndex?.key === 'nepse' || activeHeroIndex?.name === 'NEPSE Index') \&\& indices?.nepse \&\& Number(indices.nepse.value) > 0)

&#x20;        ? indices.nepse

&#x20;        : (activeHeroIndex?.val || indices?.nepse || fallbackHero));

\-  const isHeroBull = (heroVal.pChange || 0) >= 0 || (heroVal.change || 0) >= 0;

\+  const isHeroBull = ((Number(heroVal.change) || 0) !== 0 ? Number(heroVal.change) : (Number(heroVal.pChange) || 0)) >= 0;

@@ -2082,7 +2127,7 @@ function Dashboard({

&#x20;      return {

&#x20;        change: c,

&#x20;        pChange: pc,

\-        isBull: c >= 0 || pc >= 0,

\+        isBull: (c !== 0 ? c : pc) >= 0,

&#x20;        periodLabel: '1D'

&#x20;      };

&#x20;    }

@@ -2102,7 +2147,7 @@ function Dashboard({

&#x20;    return {

&#x20;      change: c,

&#x20;      pChange: pc,

\-      isBull: c >= 0 || pc >= 0,

\+      isBull: (c !== 0 ? c : pc) >= 0,

&#x20;      periodLabel: '1D'

&#x20;    };

&#x20;  }, \[heroTimeframe, slicedHeroHistory, heroVal, indices]);

@@ -2139,7 +2184,7 @@ function Dashboard({

&#x20;            boxShadow: apiStatus === 'live' ? '0 0 6px rgba(16, 185, 129, 0.6)' : 'none'

&#x20;          }} />

&#x20;          <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 11.5 }}>

\-            {apiStatus === 'live' ? 'Live Market Feed' : 'Closing Snapshot'}

\+            {apiStatus === 'live' ? 'Live Market Feed' : apiStatus === 'offline' ? 'Offline — Cached Data' : 'Closing Snapshot'}

&#x20;          </span>

&#x20;        </div>

@@ -2498,13 +2543,13 @@ function Dashboard({

&#x20;              alignItems: 'center',

&#x20;              gap: 4

&#x20;            }}>

\-              <span>{heroTfStats.isBull ? '▲ +' : '▼ '}{fmt(heroTfStats.change)} pts</span>

\-              <span>({heroTfStats.isBull ? '+' : ''}{(heroTfStats.pChange || 0).toFixed(2)}%)</span>

\+              <span>{heroTfStats.isBull ? '▲ +' : '▼ -'}{fmt(Math.abs(heroTfStats.change || 0))} pts</span>

\+              <span>({heroTfStats.isBull ? '+' : '-'}{Math.abs(heroTfStats.pChange || 0).toFixed(2)}%)</span>

&#x20;              {heroTimeframe !== '1D' \&\& <span style={{ fontSize: 12, opacity: 0.85 }}>· {heroTimeframe}</span>}

&#x20;            </span>

&#x20;          </div>

&#x20;

&#x20;          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>

&#x20;            Turnover: <strong style={{ color: '#fff' }}>{(() => {

\-              const to = Number(heroVal.turnover || indices?.nepse?.turnover || 0);

\+              const to = Number(activeHeroIndex?.isStock ? (heroVal.turnover || 0) : (heroVal.turnover || indices?.nepse?.turnover || 0));

&#x20;              if (to >= 1e9) return `${(to / 1e9).toFixed(2)} Arba`;

&#x20;              if (to > 0) return `${(to / 1e7).toFixed(2)} Cr`;

&#x20;              return '—';

@@ -2555,7 +2600,7 @@ function Dashboard({

&#x20;        {/\* SEBON Market-Wide Index Circuit Breaker Telemetry Alert (5% \& 8% Thresholds) \*/}

\-        {heroTimeframe === '1D' \&\& Math.abs(heroTfStats.pChange || 0) >= 4.0 \&\& (

\+        {!activeHeroIndex?.isStock \&\& activeHeroIndex?.key === 'nepse' \&\& heroTimeframe === '1D' \&\& Math.abs(heroTfStats.pChange || 0) >= 4.0 \&\& (

&#x20;          <div style={{

@@ -2620,7 +2665,7 @@ function Dashboard({

&#x20;        <ShareHubChart

&#x20;          history={slicedHeroHistory}

&#x20;          symbol={activeHeroIndex?.symbol || activeHeroIndex.name}

\-          isIndex={true}

\+          isIndex={!activeHeroIndex?.isStock}

&#x20;          isIntraday={heroTimeframe === '1D'}

@@ -2862,10 +2907,12 @@ function Dashboard({

&#x20;          <div style={{

&#x20;            background: 'rgba(255, 255, 255, 0.02)',

&#x20;            border: '1px solid var(--border)',

&#x20;            borderRadius: 10,

&#x20;            padding: '8px 10px'

&#x20;          }}>

&#x20;            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Float Index</div>

&#x20;            <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>

\-              <span>{marketSummaryStats.floatVal}</span>

\-              <span style={{ fontSize: 12, fontWeight: 800, color: marketSummaryStats.floatChg >= 0 ? 'var(--bull)' : '#F43F5E' }}>

\-                {marketSummaryStats.floatChg >= 0 ? '+' : ''}{marketSummaryStats.floatChg}

\-              </span>

\+              <span>{marketSummaryStats.floatVal != null ? fmt(marketSummaryStats.floatVal) : '—'}</span>

\+              {marketSummaryStats.floatChg != null \&\& (

\+                <span style={{ fontSize: 12, fontWeight: 800, color: marketSummaryStats.floatChg > 0 ? 'var(--bull)' : marketSummaryStats.floatChg < 0 ? '#F43F5E' : 'var(--text-muted)' }}>

\+                  {marketSummaryStats.floatChg > 0 ? '+' : ''}{fmt(marketSummaryStats.floatChg)}

\+                </span>

\+              )}

&#x20;            </div>

&#x20;          </div>

@@ -3426,10 +3473,10 @@ function Dashboard({

&#x20;            const t1NetPct = primeDailyPick.levels?.target1?.netReturnPct != null

&#x20;              ? primeDailyPick.levels.target1.netReturnPct

\-              : (t1Pct \&\& Number(t1Pct) > 0.73 ? +((Number(t1Pct) - 0.73) \* 0.925).toFixed(1) : t1Pct);

\+              : (t1Pct \&\& Number(t1Pct) > 0.73 ? +((Number(t1Pct) - 0.73) \* 0.95).toFixed(1) : t1Pct);

&#x20;            const t2NetPct = primeDailyPick.levels?.target2?.netReturnPct != null

&#x20;              ? primeDailyPick.levels.target2.netReturnPct

\-              : (t2Pct \&\& Number(t2Pct) > 0.73 ? +((Number(t2Pct) - 0.73) \* 0.925).toFixed(1) : t2Pct);

\+              : (t2Pct \&\& Number(t2Pct) > 0.73 ? +((Number(t2Pct) - 0.73) \* 0.95).toFixed(1) : t2Pct);

@@ -3472,7 +3519,7 @@ function Dashboard({

&#x20;                  {t1NetPct != null \&\& (

&#x20;                    <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', marginTop: 1 }}>

\-                      Net: +{t1NetPct}% <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(-7.5% CGT+fees)</span>

\+                      Net: +{t1NetPct}% <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(-5.0% ST CGT+fees)</span>

&#x20;                    </div>

&#x20;                  )}

&#x20;                </div>

@@ -3484,7 +3531,7 @@ function Dashboard({

&#x20;                  {t2NetPct != null \&\& (

&#x20;                    <div style={{ fontSize: 12, fontWeight: 700, color: '#c084fc', marginTop: 1 }}>

\-                      Net: +{t2NetPct}% <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(-7.5% CGT+fees)</span>

\+                      Net: +{t2NetPct}% <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(-5.0% ST CGT+fees)</span>

&#x20;                    </div>

&#x20;                  )}

&#x20;                </div>

@@ -3959,7 +4006,7 @@ function Dashboard({

&#x20;      {showTVModal \&\& (

&#x20;        <AdvancedChartModal

&#x20;          symbol={activeHeroIndex.symbol || activeHeroIndex.key || 'NEPSE'}

\-          stock={{ ltp: heroVal.value, change: heroVal.change, pChange: heroVal.pChange, name: activeHeroIndex.name, sector: 'NEPSE Index' }}

\+          stock={{ ltp: heroVal.value, change: heroVal.change, pChange: heroVal.pChange, name: activeHeroIndex.name, sector: activeHeroIndex?.isStock ? (stocks.find(s => s.symbol === activeHeroIndex.symbol)?.sector || 'NEPSE Equity') : 'NEPSE Index' }}

&#x20;          initialTimeframe={heroTimeframe}

&#x20;          onClose={() => setShowTVModal(false)}

&#x20;        />

@@ -3989,7 +4036,7 @@ function Dashboard({

&#x20;              <span style={{

&#x20;                fontSize: 12, fontWeight: 800,

&#x20;                color: heroTfStats.isBull ? 'var(--bull)' : '#F43F5E',

&#x20;                fontFamily: 'var(--font-mono)'

&#x20;              }}>

\-                {heroTfStats.isBull ? '+' : ''}{fmt(heroTfStats.change)} ({heroTfStats.isBull ? '+' : ''}{(heroTfStats.pChange != null ? heroTfStats.pChange : heroVal.pChange || 0).toFixed(2)}%)

\+                {heroTfStats.isBull ? '+' : '-'}{fmt(Math.abs(heroTfStats.change || 0))} ({heroTfStats.isBull ? '+' : '-'}{Math.abs(heroTfStats.pChange != null ? heroTfStats.pChange : heroVal.pChange || 0).toFixed(2)}%)

&#x20;              </span>

@@ -4021,7 +4068,7 @@ function Dashboard({

&#x20;              >

\-                {marketStatus?.isOpen \&\& (

\+                {marketStatus?.isOpen \&\& apiStatus === 'live' \&\& (

&#x20;                  <span className="relative flex h-2 w-2">

&#x20;                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />

&#x20;                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-\[0\_0\_8px\_rgba(16,185,129,0.9)]" />

&#x20;                  </span>

&#x20;                )}

&#x20;                {marketStatus?.isEmergencyHalt

&#x20;                  ? 'Emergency Halt'

&#x20;                  : marketStatus?.isOpen

\-                  ? 'Market Open'

\+                  ? (apiStatus === 'live' ? 'Market Open (Live)' : 'Market Open (Cached)')

&#x20;                  : marketStatus?.isPreOpen

&#x20;                  ? 'Pre-Open'

&#x20;                  : 'Market Closed'}

@@ -4083,7 +4130,7 @@ function Dashboard({

&#x20;          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', overflow: 'hidden' }}>

&#x20;            <ShareHubChart

&#x20;              history={slicedHeroHistory}

&#x20;              symbol={activeHeroIndex.symbol || activeHeroIndex.key || 'NEPSE'}

\-              isIndex={true}

\+              isIndex={!activeHeroIndex?.isStock}

&#x20;              isIntraday={heroTimeframe === '1D'}

@@ -4107,10 +4154,10 @@ function Dashboard({

&#x20;          <div style={{

&#x20;            display: 'flex', justifyContent: 'space-around', alignItems: 'center',

&#x20;            padding: '6px 16px', background: '#151922', borderTop: '1px solid rgba(255,255,255,0.06)',

&#x20;            fontSize: 12, flexShrink: 0

&#x20;          }}>

&#x20;            <div><span style={{ color: 'var(--text-muted)' }}>Index Value: </span><strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{fmt(heroVal.value)}</strong></div>

\-            <div><span style={{ color: 'var(--text-muted)' }}>Point Change: </span><strong style={{ color: isHeroBull ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>{isHeroBull ? '+' : ''}{fmt(heroVal.change)}</strong></div>

\-            <div><span style={{ color: 'var(--text-muted)' }}>Percent Change: </span><strong style={{ color: isHeroBull ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>{(heroVal.pChange || 0).toFixed(2)}%</strong></div>

\-            <div><span style={{ color: 'var(--text-muted)' }}>Turnover: </span><strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{fmtCr(heroVal.turnover || indices?.nepse?.turnover || 0)}</strong></div>

\+            <div><span style={{ color: 'var(--text-muted)' }}>Point Change: </span><strong style={{ color: isHeroBull ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>{isHeroBull ? '+' : '-'}{fmt(Math.abs(heroVal.change || 0))}</strong></div>

\+            <div><span style={{ color: 'var(--text-muted)' }}>Percent Change: </span><strong style={{ color: isHeroBull ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>{isHeroBull ? '+' : '-'}{Math.abs(heroVal.pChange || 0).toFixed(2)}%</strong></div>

\+            <div><span style={{ color: 'var(--text-muted)' }}>Turnover: </span><strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{fmtCr(activeHeroIndex?.isStock ? (heroVal.turnover || 0) : (heroVal.turnover || indices?.nepse?.turnover || 0))}</strong></div>

&#x20;            <div><span style={{ color: 'var(--text-muted)' }}>Market: </span><strong style={{ color: marketStatus?.isOpen ? 'var(--bull)' : '#f87171' }}>{marketStatus?.isOpen ? 'OPEN' : 'CLOSED'}</strong></div>

&#x20;          </div>



```



Upload `03-ACC3-REM-PART03.txt` next with the same continuation prompt to continue from `A3-073`.
### 1. Files Inspected in This Turn



From `03-ACC3-REM-PART03.txt`:



\* `src\\views\\FloorSheetTape.jsx` \*(complete)\*





\* `src\\views\\LiveMarketDashboard.jsx` \*(complete)\*





\* `src\\views\\OrderExecution.jsx` \*(complete)\*





\* `src\\views\\PortfolioAnalytics.jsx` \*(complete)\*





\* `src\\views\\StitchHub.jsx` \*(complete)\*





\* `src\\views\\StockDetails.jsx` \*(complete)\*





\* `src\\views\\WaccTaxCalculator.jsx` \*(complete)\*





\* `src\\views\\WatchlistScreener.jsx` \*(complete)\*





\* `src\\components\\DashboardSkeleton.jsx` \*(complete — no bugs found)\*





\* `src\\components\\DataQualityBanner.jsx` \*(complete)\*





\* `src\\components\\DividendHistoryPanel.tsx` \*(complete)\*





\* `src\\components\\EntryExitAnalyzer.tsx` \*(complete)\*





\* `src\\components\\ErrorBoundary.jsx` \*(complete — no P0–P2 bugs found)\*





\* `src\\components\\InAppNewsReaderModal.jsx` \*(complete)\*





\* `src\\components\\InstitutionalAlertCardModal.tsx` \*(complete)\*







\*\*Cross-referenced from earlier turns:\*\* `src\\App.jsx`, `src\\constants\\marketRules.js`, `src\\types\\stockTelemetry.ts`, `migrations\\003\_upgrade\_floorsheet\_hub.sql`, `src\\components\\WaccTaxCalculator.jsx`, and `src\\components\\Dashboard.jsx`. Zero files were truncated in this attachment.



\---



\### 2. Audit Findings Table (Continuing from `A3-072`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-073\*\* | \*\*P0\*\* | `src/views/WaccTaxCalculator.jsx` (`calculateFifoWaccAndSegregatedCgt` -> `parseLotDateToAd`, `sortedLots`, `sellDateObj`)



&#x20;| `parseLotDateToAd` checks `if (y >= 2000 \&\& y <= 2095)` and feeds the date into `bsToAd(y, m, d)`. Every modern AD date (`2020–2026`) falls inside `2000–2095` and is converted as Bikram Sambat (turning `2026-10-15` into \*\*AD 1969\*\*)! Also `sortedLots` sorts raw strings via `new Date(...)` before BS conversion and `sellDateObj` never converts BS sell dates.



&#x20;| \*\*Catastrophic CGT corruption:\*\* Every AD-dated short-term lot bought in 2020–2026 calculates \~20,500 holding days (>56 years) and is misclassified as \*\*Long-Term (`> 365d`)\*\*, systematically underpaying CGT and mis-ordering FIFO lots.



&#x20;| Only treat years `>= 2050 \&\& <= 2099` as Bikram Sambat (AD years `< 2050` stay AD), parse in `Asia/Kathmandu` calendar days, and apply `parseLotDateToAd` to both `sortedLots` sorting and `sellDateObj`. |

| \*\*A3-074\*\* | \*\*P0\*\* | `src/views/WaccTaxCalculator.jsx` (`WaccTaxCalculator` UI \& `calculateFifoWaccAndSegregatedCgt`)



&#x20;| (1) Hardcodes outdated individual CGT rates (`7.5%` / `0.075` ST and `5.0%` / `0.05` LT) in both UI and FIFO engine; `cgtRatePct` uses `.toFixed(1)` (which rounds `3.75%` to `3.8%`); UI labels use `≥365d` / `<365d` instead of `>365d` / `≤365d`. (2) UI sets `bonusCost = 0` for bonus shares instead of Rs. 100 face value, and `calculateFifoWaccAndSegregatedCgt` defaults `waccMode` to `'economic'` (Rs. 0 bonus) instead of `'cdsc'` (Rs. 100 bonus) for tax calculation.



&#x20;| Overstates individual CGT on short-term and long-term trades, mislabels day-365 holding period, and violates Nepal CDSC/IRD WACC law (Rs. 100 par basis on bonus shares), overcharging taxable capital gain on bonus shares.



&#x20;| Update CGT rates to `5.0%` (`0.05`) ST ($\\le 365\\text{d}$), `3.75%` (`0.0375`) LT ($> 365\\text{d}$), `10.0%` (`0.10`) Corp; format `cgtRatePct` with `.toFixed(2)`; use `bonusKitta \* 100` for statutory WACC/CGT in UI and default `waccMode` to `'cdsc'` in FIFO engine. |

| \*\*A3-075\*\* | \*\*P0\*\* | `src/views/OrderExecution.jsx` (CGT math, sell fee ordering \& fake NOTS submission)



&#x20;| (1) Hardcodes outdated `7.5%` CGT (`0.075`), levies CGT on `grossProfit` \*before\* deducting sell-side `statutoryFees` (broker + SEBON + DP), and provides no holding-period selector (`5%` ST / `3.75%` LT / `10%` Corp) or WACC input. (2) Labels a non-executing local stub as `"SEBON Authorized • Direct NEPSE NOTS Gateway"` with `"CONFIRM \& SUBMIT BUY ORDER"` that executes nothing.



&#x20;| Investors see wrong net receivable on sell orders and may believe a real NEPSE TMS order was submitted when nothing was sent.



&#x20;| Deduct `statutoryFees` before computing taxable gain, support `5.0%` ST / `3.75%` LT / `10.0%` Corp CGT + editable WACC on SELL, and label the slip clearly as `"TMS Order Ticket Estimator (Simulation Only — Execute on Broker TMS)"`. |

| \*\*A3-076\*\* | \*\*P0\*\* | `src/views/PortfolioAnalytics.jsx` (Entire component)



&#x20;| Displays 100% hardcoded fake holdings (`600 NABIL @ 373.33`, `800 SHIVM @ 435.00`, `Rs. 1,48,295` cash, `Rs. 4,93,735` others), hardcoded `TMS 58 • SYNCED` green badge, hardcoded `↑ +1.26%` daily gain %, and hardcoded `45%/30%/15%/10%` sector bars instead of reading the user's actual portfolio.



&#x20;| Real investors opening Stitch → Portfolio see a fabricated Rs. 14+ Lakh portfolio stamped `TMS 58 • SYNCED` and fake `+1.26%` daily gain even on losing days.



&#x20;| Hydrate real holdings from `loadEncryptedUserProfiles(resolveActiveUserId())` + uid-scoped manual transactions, compute real sector allocation \& daily gain %, and show an empty state when no holdings exist. |

| \*\*A3-077\*\* | \*\*P0\*\* | `src/views/LiveMarketDashboard.jsx`, `src/views/StockDetails.jsx`, `src/views/WatchlistScreener.jsx`



&#x20;| (1) `LiveMarketDashboard` fabricates fake `NEPSE 2,648.32 (+1.42%)`, `4.82 Arba`, `164 Adv / 71 Dec`, fake sector gains, fake Top Gainers, a static upward SVG chart, and green `> EMA(20)` even when bearish/offline; pulses green `NEPSE LIVE` without checking `apiStatus === 'live'`. (2) `StockDetails` always shows pulsing green `LIVE`, renders a fake static upward SVG curve, and reads `bid.quantity`/`bid.rate` instead of `bid.kitta`/`bid.price` from `stockTelemetry.ts`. (3) `WatchlistScreener` falls back to hardcoded fake `defaultWatchlist` prices when `stocks` is empty.



&#x20;| Offline/loading users see fabricated market prices, fake upward charts during market crashes, fake `LIVE` badges on closed markets, and `0` in Level-II market depth when fed telemetry `{ kitta, price }` payloads.



&#x20;| Remove all hardcoded fake price/index/breadth fallbacks (render `"—"` / loading state instead); gate pulsing `LIVE` badges on `marketStatus?.isOpen \&\& apiStatus === 'live'`; replace fake static upward SVG paths with flat/data-driven states; read `bid.quantity ?? bid.kitta` and `bid.rate ?? bid.price`. |

| \*\*A3-078\*\* | \*\*P0\*\* | `src/components/InstitutionalAlertCardModal.tsx` (Level fallbacks, R:R math, criteria badges \& TS type)



&#x20;| (1) Fabricates `+15%`/`+25%`/`-5%` targets/SL when alert fields are absent. (2) `Math.max(1, ltp - stopLoss)` produces wildly inflated fake R:R (e.g. `110 : 1`) when `ltp <= stopLoss`. (3) Condition 1 (`Price in Base`) and Condition 3 unconditionally render green checkmarks even when `ltp` is outside `\[buyLow, buyHigh]`. (4) Hardcodes `"Just Now"` instead of `alert.triggeredAt` in NPT and accesses `alert.body` (missing from `SmartAlertData`).



&#x20;| Investors receive fabricated targets, bogus `100:1` R:R on breached stops, and fake green `"Price in Base"` verification on extended prices.



&#x20;| Remove fabricated `+15%/+25%/-5%` defaults (display `—` if omitted); clamp `rr` to `0` when `ltp <= stopLoss |

| \*\*A3-079\*\* | \*\*P0\*\* | `src/components/EntryExitAnalyzer.tsx` (`InfoBanner`, `analyze` cache hit \& `winRate` fallback)



&#x20;| (1) `InfoBanner` cites outdated `7.5% Short-Term / 5% Long-Term Retail CGT`. (2) Line 319 fabricates a synthetic `winRate` (`45 + (scoreVal - 50) \* 0.5`) when analog stats are absent and persists it to `prime\_pick\_plan\_cache`, where `Dashboard.jsx` displays it as `🎯 XX% Win Rate (CGT Net)`. (3) Cache-hit early return skips `fetchDividendHistory(sym)`, leaving the Corporate Distribution History table empty.



&#x20;| Displays obsolete CGT rules, injects invented backtest win rates into the Dashboard Prime Pick card, and hides real dividend history on cached symbols.



&#x20;| Update `InfoBanner` to `5.0% Short-Term (≤365d) / 3.75% Long-Term (>365d)`; set `winRate: result.analogResult?.stats?.winRate ?? result.probabilities?.winRate ?? null` (never invent from score); hydrate dividends in background on cache hit. |

| \*\*A3-080\*\* | \*\*P1\*\* | `src/views/FloorSheetTape.jsx` (`loadFloorsheet`, `handleTimeframeChange`, `handleDateChange`, `tradeTime`, `lastSyncTime`)



&#x20;| (1) No request-sequence guard (`reqIdRef`) in `loadFloorsheet`; typing in search/buyer/seller fires an un-debounced API call on every keystroke; timeframe/date handlers call `loadFloorsheet` manually AND trigger `useEffect(\[loadFloorsheet])`, causing double fetches and stale response overwrites. (2) Header displays a permanent pulsing green dot even when market is closed or viewing historical dates, and `lastSyncTime` omits `timeZone: 'Asia/Kathmandu'`. (3) `trade.tradeTime.slice(11, 19)` returns `""` when `tradeTime` is already `HH:MM:SS`.



&#x20;| Rapid filtering displays wrong ticker/date contracts, doubles proxy load, shows pulsing green live indicator on archived sessions, and blanks out trade timestamps.



&#x20;| Add `reqIdRef` to discard stale fetches; debounce filter inputs and let the single `useEffect` drive fetches (no manual duplicate call); gate pulsing green dot on `mkt?.isOpen \&\& !selectedDate`; format `lastSyncTime` in NPT and parse both ISO and `HH:MM:SS` `tradeTime`. |

| \*\*A3-081\*\* | \*\*P1\*\* | `src/views/StitchHub.jsx`, `src/views/OrderExecution.jsx`, `src/views/WatchlistScreener.jsx`



&#x20;| (1) `StitchHub` does not register `useBackHandler`, so Android Back escapes the fullscreen overlay instead of stepping back through Stitch sub-pages; Bell button fires a hardcoded fake `alert('...Market up +37.15 pts; NABIL AGM scheduled!')`. (2) `OrderExecution` never updates `price` when `defaultPrice`/`symbol` changes, leaves an uncleaned 1800ms `setTimeout`, and allows `SELL` kitta `> maxUnits`. (3) `WatchlistScreener` uses `isPos = chg >= 0`, rendering green `+` and `"Bullish (Buy)"` on `0.00%` unchanged or negative-`pChange`/zero-`chg` stocks.



&#x20;| Hardware Back breaks in Stitch mode; clicking Notifications shows fake market news; reopening Order Slip for a different stock keeps the prior stock's price; flat/declining stocks show bullish green.



&#x20;| Register `useBackHandler` in `StitchHub` and wire Bell to real live index change; sync `price` on `\[symbol, defaultPrice]` + clear submit timeout + cap SELL at `maxUnits` in `OrderExecution`; fix sign/neutral logic in `WatchlistScreener`. |

| \*\*A3-082\*\* | \*\*P1\*\* | `src/components/DividendHistoryPanel.tsx` (`analyze`, empty state \& `fetchedAt`)



&#x20;| (1) `analyze` lacks a request-sequence guard (rapid stock switching overwrites Stock B with Stock A's dividends) and never clears the 5s timeout. (2) When `dividends.length === 0 \&\& result.real === true`, renders neither table nor `<NoData/>` (blank panel). (3) `fetchedAt` formats in local browser timezone instead of NPT.



&#x20;| Switching stocks quickly shows wrong dividend history under the wrong symbol; stocks with 0 historical dividends render an empty blank area.



&#x20;| Add `reqSeqRef` + `clearTimeout` in `finally`; render `<NoData/>` whenever `dividends.length === 0`; format `fetchedAt` in `Asia/Kathmandu` NPT. |

| \*\*A3-083\*\* | \*\*P1\*\* | `src/components/EntryExitAnalyzer.tsx` (`mktStatus`, `analyzedTime`, delta badge, `fetchAllSecurities`)



&#x20;| (1) `mktStatus = useMemo(() => getDetailedMarketStatus(), \[])` freezes market status on initial mount forever while kept alive in `App.jsx`. (2) `analyzedTime` lacks `timeZone: 'Asia/Kathmandu'`. (3) Delta badge uses `pChange >= 0` while printing `changeVal` directly (`+-` risk on mixed signs). (4) `fetchAllSecurities()` has no `isMounted` guard.



&#x20;| Opening the app before 11:00 AM keeps showing `"NEPSE Market Closed"` in Entry/Exit Analyzer all day during live trading.



&#x20;| Refresh `mktStatus` via a 60s interval (and on `analyze`), format `analyzedTime` in `Asia/Kathmandu`, use `Math.abs` with unified sign check on the delta badge, and guard `fetchAllSecurities` with `isMounted`. |

| \*\*A3-084\*\* | \*\*P1\*\* | `src/components/InAppNewsReaderModal.jsx` (External URL safety, duplicate `useBackHandler`, `$SYMBOL`)



&#x20;| (1) Renders raw `<a href={currentDetail.url}>` without validating `^https?://` or using `openExternalUrl()`, bypassing Electron/Capacitor external link handover and risking `javascript:` URLs. (2) Registers `useBackHandler` at priority `90` while `App.jsx` already registers priority `65` for the same modal, pushing duplicate history entries. (3) Renders `$${currentDetail.symbol}` (USD prefix like `$NABIL`) in Nepal app.



&#x20;| External links break in Electron/Android WebView or pose XSS risk; Android Back requires extra presses after reading news; stock badges display `$` currency prefix.



&#x20;| Validate `^https?://` and open via `openExternalUrl()`, remove duplicate `useBackHandler` (let `App.jsx` own it, or remove from `App.jsx`), and drop the `$` prefix before `currentDetail.symbol`. |

| \*\*A3-085\*\* | \*\*P2\*\* | `src/views/LiveMarketDashboard.jsx`, `src/views/StockDetails.jsx`



&#x20;| `LiveMarketDashboard`'s `1D/1W/1M/1Y` pills and `All Sectors ->` / `View All ->` links are non-clickable `<span>` elements, and breadth counts omit `isPureNepseEquity(s)` and 0-volume untraded exclusion; `StockDetails`'s `isBookmarked` is ephemeral local state not wired to `utils/watchlist.js`.



&#x20;| Tapping timeframe pills or links does nothing; Stitch breadth counts diverge from main Dashboard; bookmarks disappear when leaving `StockDetails`.



&#x20;| Wire `View All`/`All Sectors` to `WatchlistScreener` (or remove dead controls), filter breadth via `isPureNepseEquity`, and wire `StockDetails` bookmark to `isWatched`/`toggleWatchlist`. |

| \*\*A3-086\*\* | \*\*P2\*\* | `src/views/WaccTaxCalculator.jsx`, `src/views/FloorSheetTape.jsx`



&#x20;| `WaccTaxCalculator` UI hardcodes static demo `NABIL` lots with a fake `alert('✅ WACC verified with MeroShare EDIS and Broker 58!')`; `FloorSheetTape` labels the largest trade on the current 50-row page as the session's `"Top Block Trade"`.



&#x20;| Investors may mistake demo NABIL lots or page-local max trades for their real MeroShare EDIS verification or full-session top block trade.



&#x20;| Label `WaccTaxCalculator` lots as customizable sample lots (or bind real portfolio holdings) and clarify `"Top Block Trade (This Page)"` in `FloorSheetTape`. |

| \*\*A3-087\*\* | \*\*P3\*\* | `src/components/DataQualityBanner.jsx`, `src/components/InstitutionalAlertCardModal.tsx`



&#x20;| `SimulatedDataBanner` stays dismissed for the whole session even if a live feed later drops to simulated; `InstitutionalAlertCardModal`'s Copy button gives no `"Copied!"` confirmation.



&#x20;| Minor UX feedback gaps.



&#x20;| Reset `dismissed` when `isSimulated` transitions `false -> true`, and add brief `"Copied"` state feedback on `copySummary`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/views/WaccTaxCalculator.jsx` (Fixes `A3-073`, `A3-074`)







```diff

\--- a/src/views/WaccTaxCalculator.jsx

+++ b/src/views/WaccTaxCalculator.jsx

@@ -22,7 +22,8 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;

&#x20;  const baseKitta = lot1Kitta + lot2Kitta;

&#x20;  const bonusKitta = waccLots.bonusLot ? Math.floor((baseKitta \* Math.max(0, Number(bonusPct) || 0)) / 100) : 0;

\-  const bonusCost = 0; // Economic cost of bonus shares is Rs. 0 (dilutes WACC proportionally)

\+  // Mandatory Nepal CDSC/IRD rule: Bonus shares carry Rs. 100 face-value cost basis in statutory WACC

\+  const bonusCost = bonusKitta \* 100.00;

&#x20;

&#x20;  const rightKitta = waccLots.rightLot ? Math.floor((baseKitta \* Math.max(0, Number(rightPct) || 0)) / 100) : 0;

&#x20;  const rightCost = rightKitta \* 100.00; // Right shares subscribed at Rs. 100 par value

@@ -41,7 +42,8 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;  const netSellProceedsBeforeTax = Math.max(0, grossTurnover - brokerComm - sebonFee - dpFee);

&#x20;  const capitalGain = Math.max(0, netSellProceedsBeforeTax - totalCost);

&#x20;

\-  const cgtRates = { long: 0.05, short: 0.075, corp: 0.10 };

\+  // Nepal CGT rates effective 22 Sept 2026 (31 Bhadra 2083): ST <=365d = 5.0%, LT >365d = 3.75%, Corp = 10.0%

\+  const cgtRates = { long: 0.0375, short: 0.05, corp: 0.10 };

&#x20;  const cgtTax = +(capitalGain \* cgtRates\[taxRegime]).toFixed(2);

@@ -122,7 +124,7 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;            </div>

&#x20;            <span className="text-\[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">

\-              ≥365d (5% CGT)

\+              \&gt;365d (3.75% CGT)

&#x20;            </span>

&#x20;          </div>

@@ -149,7 +151,7 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;            </div>

&#x20;            <span className="text-\[10px] font-bold font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">

\-              \&lt;365d (7.5% CGT)

\+              \&le;365d (5.0% CGT)

&#x20;            </span>

&#x20;          </div>

@@ -174,7 +176,7 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;              <div>

&#x20;                <div className="font-semibold text-white">Bonus Share Dilution ({bonusPct}% Bonus)</div>

&#x20;                <div className="text-\[10px] text-slate-400 font-mono">

\-                  +{bonusKitta} Kitta @ NPR 0.00 Economic Outlay

\+                  +{bonusKitta} Kitta @ NPR 100.00 Par Value (CDSC Statutory WACC)

&#x20;                </div>

&#x20;              </div>

@@ -262,8 +264,8 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;          >

&#x20;            <div className="text-xs font-bold">{isNe ? 'दीर्घकालीन (Long)' : 'Long Term'}</div>

\-            <div className="text-base font-extrabold text-white font-mono mt-1">5.0%</div>

\-            <div className="text-\[10px] text-slate-400 mt-0.5">≥365 {isNe ? 'दिन' : 'days'}</div>

\+            <div className="text-base font-extrabold text-white font-mono mt-1">3.75%</div>

\+            <div className="text-\[10px] text-slate-400 mt-0.5">\&gt;365 {isNe ? 'दिन' : 'days'}</div>

&#x20;          </button>

&#x20;          <button

&#x20;            onClick={() => setTaxRegime('short')}

@@ -274,8 +276,8 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;          >

&#x20;            <div className="text-xs font-bold">{isNe ? 'अल्पकालीन (Short)' : 'Short Term'}</div>

\-            <div className="text-base font-extrabold text-white font-mono mt-1">7.5%</div>

\-            <div className="text-\[10px] text-slate-400 mt-0.5">\&lt;365 {isNe ? 'दिन' : 'days'}</div>

\+            <div className="text-base font-extrabold text-white font-mono mt-1">5.0%</div>

\+            <div className="text-\[10px] text-slate-400 mt-0.5">\&le;365 {isNe ? 'दिन' : 'days'}</div>

&#x20;          </button>

@@ -331,7 +333,7 @@ export function WaccTaxCalculator({ onBack, lang = 'ne' }) {

&#x20;          <div className="flex justify-between">

\-            <span>• {isNe ? `लाभकर (Capital Gain Tax ${cgtRates\[taxRegime] \* 100}%):` : `CGT (${cgtRates\[taxRegime] \* 100}% on Net Gain):`}</span>

\+            <span>• {isNe ? `लाभकर (Capital Gain Tax ${(cgtRates\[taxRegime] \* 100).toFixed(2)}%):` : `CGT (${(cgtRates\[taxRegime] \* 100).toFixed(2)}% on Net Gain):`}</span>

&#x20;            <span className="text-rose-400 font-bold">- रु {cgtTax.toFixed(2)}</span>

&#x20;          </div>

@@ -367,10 +369,25 @@ export function calculateFifoWaccAndSegregatedCgt(lots = \[], sellOrder = null) {

&#x20;    };

&#x20;  }

&#x20;

\-  // Sort lots chronologically (oldest first for strict FIFO)

\+  // Convert BS dates (years 2050-2099 only!) to AD while leaving AD years (1900-2049) untouched

\+  const parseLotDateToAd = (dateStr) => {

\+    if (!dateStr) return new Date();

\+    const str = String(dateStr).trim();

\+    const parts = str.split(/\[-/]/).map(p => parseInt(p, 10));

\+    if (parts.length === 3 \&\& parts.every(Number.isFinite)) {

\+      const \[y, m, d] = parts;

\+      if (y >= 2050 \&\& y <= 2099) {

\+        const ad = bsToAd(y, m, d);

\+        if (ad instanceof Date \&\& !isNaN(ad.getTime())) return ad;

\+      }

\+      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

\+    }

\+    const parsed = new Date(str);

\+    return isNaN(parsed.getTime()) ? new Date() : parsed;

\+  };

\+

\+  // Sort lots chronologically using normalized AD dates (oldest first for strict FIFO)

&#x20;  const sortedLots = \[...lots]

&#x20;    .filter(l => Number(l.qty || l.quantity || l.units || 0) > 0)

\-    .sort((a, b) => new Date(a.date || '2020-01-01') - new Date(b.date || '2020-01-01'));

\+    .sort((a, b) => parseLotDateToAd(a.date || '2020-01-01') - parseLotDateToAd(b.date || '2020-01-01'));

@@ -426,12 +443,12 @@ export function calculateFifoWaccAndSegregatedCgt(lots = \[], sellOrder = null) {

&#x20;  // STRICT FIFO SALE \& CGT SEGREGATION (<= 365 Days @ 5.0% vs > 365 Days @ 3.75%)

&#x20;  const sellQtyRequested = Math.min(totalUnits, Number(sellOrder.sellQty));

&#x20;  const sellPrice = Number(sellOrder.sellPrice);

\-  const sellDateObj = sellOrder.sellDate ? new Date(sellOrder.sellDate) : new Date();

\+  const sellDateObj = sellOrder.sellDate ? parseLotDateToAd(sellOrder.sellDate) : new Date();

&#x20;  const isInstitutional = sellOrder.investorType === 'institutional';

\-  const activeWacc = sellOrder.waccMode === 'cdsc' ? cdscStatutoryWacc : economicWacc;

\+  // Default to CDSC statutory WACC (Bonus @ Rs. 100) for Nepal IRD CGT compliance

\+  const activeWacc = sellOrder.waccMode === 'economic' ? economicWacc : cdscStatutoryWacc;

@@ -449,21 +466,8 @@ export function calculateFifoWaccAndSegregatedCgt(lots = \[], sellOrder = null) {

&#x20;    lot.remainingQty -= matchedQty;

&#x20;    qtyToMatch -= matchedQty;

&#x20;

\-    const parseLotDateToAd = (dateStr) => {

\-      if (!dateStr) return new Date();

\-      const parts = String(dateStr).split(/\[-/]/).map(p => parseInt(p, 10));

\-      if (parts.length === 3) {

\-        const \[y, m, d] = parts;

\-        if (y >= 2000 \&\& y <= 2095) {

\-          const ad = bsToAd(y, m, d);

\-          if (ad instanceof Date \&\& !isNaN(ad.getTime())) return ad;

\-        }

\-      }

\-      return new Date(dateStr);

\-    };

\-

&#x20;    const buyDateObj = parseLotDateToAd(lot.date);

\-    const holdingDays = Math.max(1, Math.floor((sellDateObj - buyDateObj) / (1000 \* 60 \* 60 \* 24)));

\+    const holdingDays = Math.max(0, Math.floor((sellDateObj - buyDateObj) / (1000 \* 60 \* 60 \* 24)));

&#x20;    const isLongTerm = holdingDays > 365;

&#x20;

&#x20;    // Pro-rate sell-side friction across the matched tranche

@@ -472,7 +476,7 @@ export function calculateFifoWaccAndSegregatedCgt(lots = \[], sellOrder = null) {

&#x20;    const trancheCostBasis = matchedQty \* activeWacc;

&#x20;    const tranchePreTaxProfit = trancheSellGross - trancheCostBasis - trancheSellFees;

&#x20;

\-    const cgtRate = isInstitutional ? 0.10 : (isLongTerm ? 0.05 : 0.075);

\+    const cgtRate = isInstitutional ? 0.10 : (isLongTerm ? 0.0375 : 0.05);

&#x20;    const trancheTaxable = Math.max(0, tranchePreTaxProfit);

&#x20;    const trancheCgt = +(trancheTaxable \* cgtRate).toFixed(2);

@@ -491,7 +495,7 @@ export function calculateFifoWaccAndSegregatedCgt(lots = \[], sellOrder = null) {

&#x20;      matchedQty,

&#x20;      waccUsed: activeWacc,

&#x20;      tranchePreTaxProfit: +tranchePreTaxProfit.toFixed(2),

\-      cgtRatePct: +(cgtRate \* 100).toFixed(1),

\+      cgtRatePct: +(cgtRate \* 100).toFixed(2),

&#x20;      trancheCgt

&#x20;    });



```



\---



\#### `src/views/OrderExecution.jsx` (Fixes `A3-075`, `A3-081`)







```diff

\--- a/src/views/OrderExecution.jsx

+++ b/src/views/OrderExecution.jsx

@@ -1,4 +1,4 @@

\-import React, { useState } from 'react';

+import React, { useState, useEffect, useRef } from 'react';

&#x20;import { ArrowLeft, ShieldCheck, Zap, X } from 'lucide-react';

&#x20;import { calculateBrokerCommission, calculateSebonFee } from '../utils/calculations';

@@ -16,25 +16,38 @@ export function OrderExecution({

&#x20;  const \[orderSide, setOrderSide] = useState('BUY');

&#x20;  const \[orderType, setOrderType] = useState('Limit');

&#x20;  const \[kitta, setKitta] = useState(10);

\+  const \[waccPrice, setWaccPrice] = useState(defaultPrice);

\+  const \[cgtRegime, setCgtRegime] = useState('short'); // 'short' (5.0% <=365d) | 'long' (3.75% >365d) | 'corp' (10%)

&#x20;  const \[price, setPrice] = useState(defaultPrice);

&#x20;  const \[submittedMessage, setSubmittedMessage] = useState('');

\+  const closeTimerRef = useRef(null);

\+

\+  useEffect(() => {

\+    setPrice(defaultPrice);

\+    setWaccPrice(defaultPrice);

\+  }, \[symbol, defaultPrice]);

\+

\+  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, \[]);

&#x20;

&#x20;  const turnover = kitta \* price;

&#x20;  const brokerComm = calculateBrokerCommission(turnover);

&#x20;  const sebonFee = calculateSebonFee(turnover);

&#x20;  const dpFee = 25.00;

\-  // Compute CGT (Capital Gains Tax) for sell orders if profitable over default purchase price

\-  const estimatedCostBasis = defaultPrice > 0 ? (kitta \* defaultPrice) : turnover;

\-  const grossProfit = Math.max(0, turnover - estimatedCostBasis);

\-  const capitalGainsTax = orderSide === 'SELL' \&\& grossProfit > 0 ? Number((grossProfit \* 0.075).toFixed(2)) : 0;

&#x20;  const statutoryFees = brokerComm + sebonFee + dpFee;

\+  // Nepal IRD/CDSC rule: CGT applies to NET profit after sell fees (5.0% ST <=365d, 3.75% LT >365d, 10.0% Corp)

\+  const estimatedCostBasis = waccPrice > 0 ? (kitta \* waccPrice) : turnover;

\+  const netProfitBeforeTax = Math.max(0, (turnover - statutoryFees) - estimatedCostBasis);

\+  const cgtRate = cgtRegime === 'corp' ? 0.10 : cgtRegime === 'long' ? 0.0375 : 0.05;

\+  const capitalGainsTax = orderSide === 'SELL' \&\& netProfitBeforeTax > 0 ? Number((netProfitBeforeTax \* cgtRate).toFixed(2)) : 0;

&#x20;  const totalFees = statutoryFees + capitalGainsTax;

&#x20;  const totalPayable = orderSide === 'BUY' ? (turnover + totalFees) : Math.max(0, turnover - totalFees);

&#x20;

&#x20;  const handleKittaChange = (delta) => {

\-    setKitta(prev => Math.max(10, prev + delta));

\+    setKitta(prev => {

\+      const next = Math.max(10, prev + delta);

\+      return orderSide === 'SELL' ? Math.min(Math.max(10, maxUnits), next) : next;

\+    });

&#x20;  };

@@ -47,7 +60,8 @@ export function OrderExecution({

&#x20;    setSubmittedMessage(successMsg);

&#x20;    if (onCompleteOrder) onCompleteOrder();

\-    setTimeout(() => {

\+    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);

\+    closeTimerRef.current = setTimeout(() => {

&#x20;      if (onClose) onClose();

&#x20;    }, 1800);

&#x20;  };

@@ -171,12 +185,30 @@ export function OrderExecution({

&#x20;        {capitalGainsTax > 0 \&\& (

&#x20;          <div className="flex justify-between text-slate-400">

\-            <span>{isNe ? 'पूँजीगत लाभकर (CGT 7.5%):' : 'Capital Gains Tax (CGT 7.5%):'}</span>

\+            <span>{isNe ? `पूँजीगत लाभकर (CGT ${(cgtRate \* 100).toFixed(2)}%):` : `Capital Gains Tax (CGT ${(cgtRate \* 100).toFixed(2)}%):`}</span>

&#x20;            <span className="text-rose-400">Rs {capitalGainsTax.toFixed(2)}</span>

&#x20;          </div>

&#x20;        )}

\+        {orderSide === 'SELL' \&\& (

\+          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/\[0.04]">

\+            <span className="text-\[11px] text-slate-400">WACC / CGT:</span>

\+            <div className="flex items-center gap-1.5">

\+              <input

\+                type="number"

\+                value={waccPrice}

\+                onChange={e => setWaccPrice(Math.max(0, Number(e.target.value) || 0))}

\+                className="w-20 rounded bg-\[#141A28] border border-white/\[0.1] px-2 py-0.5 text-right text-xs text-white"

\+              />

\+              <select

\+                value={cgtRegime}

\+                onChange={e => setCgtRegime(e.target.value)}

\+                className="rounded bg-\[#141A28] border border-white/\[0.1] px-1.5 py-0.5 text-\[11px] text-slate-200"

\+              >

\+                <option value="short">ST 5.0%</option>

\+                <option value="long">LT 3.75%</option>

\+                <option value="corp">Corp 10%</option>

\+              </select>

\+            </div>

\+          </div>

\+        )}

@@ -194,13 +226,13 @@ export function OrderExecution({

&#x20;        ⚡ {orderSide === 'BUY'

\-          ? (isNe ? 'CONFIRM \& SUBMIT BUY ORDER' : 'CONFIRM \& SUBMIT BUY ORDER')

\-          : (isNe ? 'CONFIRM \& SUBMIT SELL ORDER' : 'CONFIRM \& SUBMIT SELL ORDER')}

\+          ? 'PREPARE BUY ORDER TICKET (SIMULATION)'

\+          : 'PREPARE SELL ORDER TICKET (SIMULATION)'}

&#x20;      </button>

&#x20;

&#x20;      <div className="text-\[11px] text-center text-slate-400 flex items-center justify-center gap-1.5 font-sans">

&#x20;        <ShieldCheck size={14} className="text-sky-400" />

\-        <span>{isNe ? 'SEBON स्वीकृत • सुरक्षित NEPSE NOTS इन्जिन जडान' : 'SEBON Authorized • Direct NEPSE NOTS Gateway'}</span>

\+        <span>{isNe ? 'अर्डर अनुमानक मात्र • वास्तविक कारोबारका लागि ब्रोकर TMS प्रयोग गर्नुहोस्' : 'Order Cost Estimator Only — Execute Real Orders on Your Broker TMS'}</span>

&#x20;      </div>



```



\---



\#### `src/views/PortfolioAnalytics.jsx` (Fixes `A3-076`)







```diff

\--- a/src/views/PortfolioAnalytics.jsx

+++ b/src/views/PortfolioAnalytics.jsx

@@ -1,44 +1,66 @@

\-import React from 'react';

+import React, { useEffect, useMemo, useState } from 'react';

&#x20;import { Calculator, ChevronRight } from 'lucide-react';

+import { loadEncryptedUserProfiles, resolveActiveUserId } from '../utils/profileVaultStorage';

&#x20;

&#x20;export function PortfolioAnalytics({ onOpenWacc, onSelectScrip, lang = 'ne', stocks: rawStocks = \[] }) {

&#x20;  const isNe = lang === 'ne';

&#x20;  const stocks = Array.isArray(rawStocks) ? rawStocks : \[];

\+  const \[userHoldings, setUserHoldings] = useState(\[]);

&#x20;

\-  // Live price lookups with fallbacks

\-  const nabilStock = stocks.find(s => s.symbol === 'NABIL');

\-  const shivmStock = stocks.find(s => s.symbol === 'SHIVM');

\-  ...

\-  const totalVal = Math.round(nabilVal + shivmVal + cashVal + otherVal);

\-  const totalCost = Math.round(nabilCost + shivmCost + cashVal + otherVal \* 0.9);

\+  useEffect(() => {

\+    let active = true;

\+    const uid = resolveActiveUserId();

\+    loadEncryptedUserProfiles(uid).then((profiles) => {

\+      if (!active) return;

\+      const map = {};

\+      (profiles || \[]).forEach(p => {

\+        (p.holdings || \[]).forEach(h => {

\+          const sym = String(h.symbol || h.scrip || '').toUpperCase().trim();

\+          const qty = Number(h.units || 0);

\+          const wacc = Number(h.wacc || 100);

\+          if (!sym || qty <= 0) return;

\+          if (!map\[sym]) map\[sym] = { symbol: sym, units: 0, cost: 0 };

\+          map\[sym].units += qty;

\+          map\[sym].cost += qty \* wacc;

\+        });

\+      });

\+      setUserHoldings(Object.values(map).map(h => ({ ...h, wacc: h.units > 0 ? h.cost / h.units : 0 })));

\+    }).catch(() => {});

\+    return () => { active = false; };

\+  }, \[]);

\+

\+  const enriched = useMemo(() => userHoldings.map(h => {

\+    const m = stocks.find(s => String(s.symbol || '').toUpperCase() === h.symbol);

\+    const ltp = Number(m?.ltp || m?.close || h.wacc || 0);

\+    const val = h.units \* ltp;

\+    const profit = val - h.cost;

\+    const profitPct = h.cost > 0 ? (profit / h.cost) \* 100 : 0;

\+    const dayChange = Number(m?.pointChange ?? m?.change ?? 0) \* h.units;

\+    return { ...h, ltp, val, profit, profitPct, dayChange, sector: m?.sector || 'Others' };

\+  }).sort((a, b) => b.profit - a.profit), \[userHoldings, stocks]);

\+

\+  const totalVal = Math.round(enriched.reduce((s, h) => s + h.val, 0));

\+  const totalCost = Math.round(enriched.reduce((s, h) => s + h.cost, 0));

&#x20;  const totalProfit = totalVal - totalCost;

\-  const totalProfitPct = ((totalProfit / totalCost) \* 100).toFixed(2);

\-  const dayGain = Math.round((nabilStock?.pointChange || 11) \* nabilKitta + (shivmStock?.pointChange || 54.9) \* shivmKitta);

\+  const totalProfitPct = totalCost > 0 ? ((totalProfit / totalCost) \* 100).toFixed(2) : '0.00';

\+  const dayGain = Math.round(enriched.reduce((s, h) => s + h.dayChange, 0));

\+  const prevTotalVal = totalVal - dayGain;

\+  const dayGainPct = prevTotalVal > 0 ? ((dayGain / prevTotalVal) \* 100).toFixed(2) : '0.00';



```



\*(In the JSX of `PortfolioAnalytics.jsx`, replace the hardcoded `NABIL`/`SHIVM` cards, static `+1.26%`, and static `45%/30%/15%/10%` bars with `enriched.map(...)`, `dayGainPct`, and an empty-portfolio prompt when `enriched.length === 0`.)\*



\---



\#### `src/views/LiveMarketDashboard.jsx`, `src/views/StockDetails.jsx` \& `src/views/WatchlistScreener.jsx` (Fixes `A3-077`, `A3-081`)







```diff

\--- a/src/views/LiveMarketDashboard.jsx

+++ b/src/views/LiveMarketDashboard.jsx

@@ -16,52 +16,42 @@ export function LiveMarketDashboard({

&#x20;  // 1. Live NEPSE Hero Index (never fabricate hardcoded 2,648.32 / +37.15)

&#x20;  const liveNepse = indices?.nepse;

\+  const hasLiveIndex = Boolean(liveNepse \&\& Number(liveNepse.value) > 0);

&#x20;  const nepseVal = hasLiveIndex

&#x20;    ? Number(liveNepse.value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

\-    : '2,648.32';

\-  const nepseChange = liveNepse?.change !== undefined ? Number(liveNepse.change) : 37.15;

\-  const nepsePChange = liveNepse?.pChange !== undefined ? Number(liveNepse.pChange) : 1.42;

\-  const isNepseUp = nepseChange >= 0;

\+    : '—';

\+  const nepseChange = hasLiveIndex \&\& liveNepse?.change !== undefined ? Number(liveNepse.change) : 0;

\+  const nepsePChange = hasLiveIndex \&\& liveNepse?.pChange !== undefined ? Number(liveNepse.pChange) : 0;

\+  const isNepseUp = (nepseChange !== 0 ? nepseChange : nepsePChange) >= 0;

&#x20;

\-  const lowNum = Number(liveNepse?.low || 2611.17);

\-  const highNum = Number(liveNepse?.high || 2654.80);

\-  const curNum = Number(liveNepse?.value || 2648.32);

\+  const lowNum = hasLiveIndex ? Number(liveNepse?.low || liveNepse.value) : 0;

\+  const highNum = hasLiveIndex ? Number(liveNepse?.high || liveNepse.value) : 0;

\+  const curNum = hasLiveIndex ? Number(liveNepse.value) : 0;

@@ -33,7 +23,7 @@ export function LiveMarketDashboard({

&#x20;  // 2. Live Turnover \& Volume

\-  let turnoverDisplay = isNe ? 'रु ४.८२ अर्ब' : 'NPR 4.82 Arba';

\+  let turnoverDisplay = '—';

&#x20;  const totalRawTurnover = liveNepse?.turnover || stocks.reduce((acc, s) => acc + (s.turnover || 0), 0);

@@ -47,12 +37,12 @@ export function LiveMarketDashboard({

&#x20;    : (isNe ? '—' : '—');

&#x20;

&#x20;  // 3. Live Market Breadth (never fabricate 164/71/9)

\-  let advancers = 164;

\-  let decliners = 71;

\-  let unchanged = 9;

\-  let pctProfitable = 67;

\+  let advancers = 0;

\+  let decliners = 0;

\+  let unchanged = 0;

\+  let pctProfitable = 0;

@@ -64,7 +54,7 @@ export function LiveMarketDashboard({

&#x20;  // 4. Live Market Status (require apiStatus === 'live' for LIVE label)

\-  const isOpen = Boolean(marketStatus?.isOpen);

\+  const isOpen = Boolean(marketStatus?.isOpen \&\& apiStatus === 'live');

@@ -85,22 +75,22 @@ export function LiveMarketDashboard({

&#x20;  const sectorMomenta = \[

\-    { icon: "💧", name: ..., gain: Number.isFinite(hydroSub?.pChange) ? ... : '+2.40%' },

\-    { icon: "🏨", name: ..., gain: Number.isFinite(hotelSub?.pChange) ? ... : '+3.14%' },

\-    { icon: "🏭", name: ..., gain: Number.isFinite(mfgSub?.pChange) ? ... : '+1.95%' },

\-    { icon: "🏛️", name: ..., gain: Number.isFinite(bankSub?.pChange) ? ... : '+0.82%' },

\+    { icon: "💧", name: isNe ? 'जलविद्युत (Hydro)' : 'Hydropower', gain: Number.isFinite(hydroSub?.pChange) ? `${hydroSub.pChange >= 0 ? '+' : ''}${hydroSub.pChange.toFixed(2)}%` : '—' },

\+    { icon: "🏨", name: isNe ? 'होटल तथा पर्यटन' : 'Hotels \& Tourism', gain: Number.isFinite(hotelSub?.pChange) ? `${hotelSub.pChange >= 0 ? '+' : ''}${hotelSub.pChange.toFixed(2)}%` : '—' },

\+    { icon: "🏭", name: isNe ? 'उत्पादन (Mfg)' : 'Manufacturing', gain: Number.isFinite(mfgSub?.pChange) ? `${mfgSub.pChange >= 0 ? '+' : ''}${mfgSub.pChange.toFixed(2)}%` : '—' },

\+    { icon: "🏛️", name: isNe ? 'वाणिज्य बैंक' : 'Commercial Bank', gain: Number.isFinite(bankSub?.pChange) ? `${bankSub.pChange >= 0 ? '+' : ''}${bankSub.pChange.toFixed(2)}%` : '—' },

&#x20;  ];

&#x20;

\-  // 6. Live Top Gainers (no hardcoded fake stocks)

\-  let topGainers = \[ ... ];

\+  let topGainers = \[];



```



```diff

\--- a/src/views/StockDetails.jsx

+++ b/src/views/StockDetails.jsx

@@ -6,6 +6,8 @@ export function StockDetails({

&#x20;  onOpenOrder,

&#x20;  lang = 'ne',

&#x20;  stocks: rawStocks = \[],

\+  marketStatus = null,

\+  apiStatus = 'offline',

&#x20;}) {

@@ -78,10 +80,10 @@ export function StockDetails({

\-            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-\[10px] font-mono font-bold text-emerald-400">

\-              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />

\-              {isNe ? 'कारोबार चालू' : 'LIVE'}

\+            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-\[10px] font-mono font-bold border ${

\+              marketStatus?.isOpen \&\& apiStatus === 'live'

\+                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'

\+                : 'bg-slate-800/80 border-slate-700 text-slate-400'

\+            }`}>

\+              <span className={`h-1.5 w-1.5 rounded-full ${marketStatus?.isOpen \&\& apiStatus === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />

\+              {marketStatus?.isOpen \&\& apiStatus === 'live' ? (isNe ? 'कारोबार चालू' : 'LIVE') : (isNe ? 'बन्द / क्यास' : 'EOD / CACHED')}

&#x20;            </span>

@@ -264,12 +266,14 @@ export function StockDetails({

&#x20;                  {liveStock.marketDepth.bids.slice(0, 5).map((bid, i) => {

&#x20;                    const ask = liveStock.marketDepth.asks?.\[i];

\+                    const bidQty = Number(bid.quantity ?? bid.kitta ?? 0);

\+                    const bidPx = Number(bid.rate ?? bid.price ?? 0);

\+                    const askQty = ask ? Number(ask.quantity ?? ask.kitta ?? 0) : 0;

\+                    const askPx = ask ? Number(ask.rate ?? ask.price ?? 0) : 0;

&#x20;                    return (

&#x20;                      <div key={i} className="grid grid-cols-2 gap-3">

&#x20;                        <div className="flex justify-between rounded-xl bg-emerald-500/\[0.08] border border-emerald-500/20 px-2.5 py-1.5">

\-                          <span className="text-slate-300 font-medium">{Number(bid.quantity || 0).toLocaleString()}</span>

\-                          <span className="font-bold text-emerald-400">Rs {Number(bid.rate || 0).toFixed(2)}</span>

\+                          <span className="text-slate-300 font-medium">{bidQty.toLocaleString()}</span>

\+                          <span className="font-bold text-emerald-400">Rs {bidPx.toFixed(2)}</span>

&#x20;                        </div>

&#x20;                        <div className="flex justify-between rounded-xl bg-rose-500/\[0.08] border border-rose-500/20 px-2.5 py-1.5">

\-                          <span className="font-bold text-rose-400">{ask ? `Rs ${Number(ask.rate || 0).toFixed(2)}` : '—'}</span>

\-                          <span className="text-slate-300 font-medium">{ask ? Number(ask.quantity || 0).toLocaleString() : '—'}</span>

\+                          <span className="font-bold text-rose-400">{ask ? `Rs ${askPx.toFixed(2)}` : '—'}</span>

\+                          <span className="text-slate-300 font-medium">{ask ? askQty.toLocaleString() : '—'}</span>

&#x20;                        </div>

&#x20;                      </div>

&#x20;                    );



```



```diff

\--- a/src/views/WatchlistScreener.jsx

+++ b/src/views/WatchlistScreener.jsx

@@ -97,7 +97,7 @@ export function WatchlistScreener({ onSelectScrip, lang = 'ne', stocks = \[] }) {

&#x20;  const watchlistData = useMemo(() => {

\-    if (!stocks || stocks.length === 0) return defaultWatchlist;

\+    if (!stocks || stocks.length === 0) return \[];

&#x20;

&#x20;    return stocks.map(stock => {

@@ -122,9 +122,12 @@ export function WatchlistScreener({ onSelectScrip, lang = 'ne', stocks = \[] }) {

&#x20;        high52,

&#x20;        low52,

\-        isPos: chg >= 0,

\+        isFlat: chg === 0 \&\& pct === 0,

\+        isPos: (chg !== 0 ? chg : pct) > 0,

&#x20;        topMover: pct >= 5,

\-        sentiment: chg >= 0 ? (isNe ? "Bullish (खरिद अनुकूल)" : "Bullish (Buy)") : (isNe ? "Bearish (बिक्री दबाव)" : "Bearish (Sell)")

\+        sentiment: (chg === 0 \&\& pct === 0)

\+          ? (isNe ? "तटस्थ (Neutral)" : "Neutral (Flat)")

\+          : (chg !== 0 ? chg : pct) > 0 ? (isNe ? "Bullish (खरिद अनुकूल)" : "Bullish (Buy)") : (isNe ? "Bearish (बिक्री दबाव)" : "Bearish (Sell)")

&#x20;      };

&#x20;    });

&#x20;  }, \[stocks, isNe]);



```



\---



\#### `src/views/StitchHub.jsx` (Fixes `A3-081`)







```diff

\--- a/src/views/StitchHub.jsx

+++ b/src/views/StitchHub.jsx

@@ -1,4 +1,5 @@

&#x20;import React, { useState } from 'react';

+import { useBackHandler } from '../context/NavigationContext';

@@ -47,6 +48,17 @@ export function StitchHub({ onExit, stocks: rawStocks = \[], indices = null, mark

&#x20;  const isSubPage = \['details', 'order', 'wacc'].includes(activeTab);

&#x20;

\+  // Intercept hardware Back inside Stitch fullscreen overlay before App exits

\+  useBackHandler(() => {

\+    if (orderModal.isOpen) { closeOrderModal(); return true; }

\+    if (history.length > 1) { handleBack(); return true; }

\+    if (onExit) { onExit(); return true; }

\+    return false;

\+  }, true, 95);

@@ -140,7 +152,13 @@ export function StitchHub({ onExit, stocks: rawStocks = \[], indices = null, mark

&#x20;            {/\* Notification Bell \*/}

&#x20;            <button

\-              onClick={() => alert(isNe ? 'नेप्से सूचना: बजार ३७.१५ अंकले वृद्धि; नबिल बैंकको साधारणसभा मिति घोषणा!' : 'NEPSE Alert: Market up +37.15 pts; NABIL AGM scheduled!')}

\+              onClick={() => {

\+                const chg = indices?.nepse?.change;

\+                const msg = chg != null

\+                  ? `NEPSE Index: ${Number(indices.nepse.value).toFixed(2)} (${Number(chg) >= 0 ? '+' : ''}${Number(chg).toFixed(2)} pts)`

\+                  : 'Live NEPSE alerts are available in the main header Notification Center.';

\+                alert(msg);

\+              }}

@@ -192,6 +210,8 @@ export function StitchHub({ onExit, stocks: rawStocks = \[], indices = null, mark

&#x20;          {activeTab === 'details' \&\& (

&#x20;            <StockDetails

&#x20;              symbol={selectedSymbol}

&#x20;              onBack={handleBack}

&#x20;              onOpenOrder={(sym, pr) => openOrderModal(sym, pr)}

&#x20;              lang={lang}

&#x20;              stocks={stocks}

\+              marketStatus={marketStatus}

\+              apiStatus={apiStatus}

&#x20;            />

&#x20;          )}



```



\---



\#### `src/views/FloorSheetTape.jsx` (Fixes `A3-080`)







```diff

\--- a/src/views/FloorSheetTape.jsx

+++ b/src/views/FloorSheetTape.jsx

@@ -1,4 +1,4 @@

\-import React, { useState, useEffect, useCallback, useMemo } from 'react';

+import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

@@ -38,7 +38,9 @@ export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {

&#x20;  const todayIso = formatNptDateIso(new Date());

&#x20;  const \[isAutoRefresh, setIsAutoRefresh] = useState(() => Boolean(mkt?.isOpen));

\-  const \[lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false }));

\+  const \[lastSyncTime, setLastSyncTime] = useState('');

\+  const reqIdRef = useRef(0);

\+  const formatNptTime = () => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());

@@ -63,6 +65,7 @@ export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {

&#x20;  const loadFloorsheet = useCallback(async (pg = 1, showRefreshSpinner = false, currentTf = timeframe, currentDate = selectedDate) => {

\+    const reqId = ++reqIdRef.current;

&#x20;    if (showRefreshSpinner) setRefreshing(true);

&#x20;    else setLoading(true);

@@ -77,6 +80,7 @@ export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {

&#x20;      const res = await fetchRealFloorsheet(sym, currentDate, pg, size, opts);

\+      if (reqId !== reqIdRef.current) return;

&#x20;      if (res \&\& Array.isArray(res.rows)) {

&#x20;        setFloorsheetData(prev => ({

&#x20;          ...res,

&#x20;          availableDates: Array.from(new Set(\[...(res.availableDates || \[]), ...(prev.availableDates || \[])])).sort((a, b) => String(b).localeCompare(String(a)))

&#x20;        }));

&#x20;        setPage(pg);

\-        setLastSyncTime(new Date().toLocaleTimeString('en-US', { hour12: false }));

\+        setLastSyncTime(`${formatNptTime()} NPT`);

&#x20;      }

&#x20;    } catch (err) {

\+      if (reqId !== reqIdRef.current) return;

&#x20;      console.warn('\[FloorSheetTape] Fetch error:', err.message);

&#x20;    } finally {

\-      setLoading(false);

\-      setRefreshing(false);

\+      if (reqId === reqIdRef.current) {

\+        setLoading(false);

\+        setRefreshing(false);

\+      }

&#x20;    }

\-  }, \[filterScrip, searchQuery, buyerFilter, sellerFilter, size, timeframe, selectedDate]);

\+  }, \[filterScrip, searchQuery, buyerFilter, sellerFilter, size, timeframe, selectedDate]);

&#x20;

&#x20;  const handleTimeframeChange = (tf) => {

&#x20;    triggerHaptic(25);

&#x20;    setTimeframe(tf);

&#x20;    setSelectedDate('');

\-    loadFloorsheet(1, false, tf, '');

&#x20;  };

&#x20;

&#x20;  const handleDateChange = (dt) => {

&#x20;    triggerHaptic(25);

&#x20;    setSelectedDate(dt);

\-    loadFloorsheet(1, false, timeframe, dt);

&#x20;  };

@@ -112,9 +116,10 @@ export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {

\-  // Initial and reactive load

\+  // Debounced reactive load prevents keystroke API storms and double-fetches

&#x20;  useEffect(() => {

\-    loadFloorsheet(1);

\+    const t = setTimeout(() => { loadFloorsheet(1); }, 250);

\+    return () => clearTimeout(t);

&#x20;  }, \[loadFloorsheet]);

@@ -143,10 +148,14 @@ export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {

&#x20;        <div className="flex justify-between items-center text-xs text-slate-400 font-sans flex-wrap gap-2">

&#x20;          <span className="font-bold text-white tracking-wider flex items-center gap-2">

\-            <span className="relative flex h-2.5 w-2.5">

\-              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />

\-              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />

\-            </span>

\+            {mkt?.isOpen \&\& !selectedDate ? (

\+              <span className="relative flex h-2.5 w-2.5">

\+                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />

\+                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />

\+              </span>

\+            ) : (

\+              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-slate-500" />

\+            )}

@@ -338,7 +347,7 @@ export function FloorSheetTape({ onSelectScrip, lang = 'ne' }) {

&#x20;            const contractId = trade.contractId || trade.id || `#${idx + 1}`;

\-            const timeStr = trade.tradeTime ? trade.tradeTime.slice(11, 19) : (trade.businessDate || '');

\+            const timeStr = trade.tradeTime ? (String(trade.tradeTime).includes('T') || String(trade.tradeTime).length > 10 ? String(trade.tradeTime).slice(11, 19) : String(trade.tradeTime)) : (trade.businessDate || '');



```



\---



\#### `src/components/InstitutionalAlertCardModal.tsx` (Fixes `A3-078`)







```diff

\--- a/src/components/InstitutionalAlertCardModal.tsx

+++ b/src/components/InstitutionalAlertCardModal.tsx

@@ -10,6 +10,7 @@ export interface SmartAlertData {

&#x20;  id?: string;

&#x20;  symbol: string;

&#x20;  ltp: number;

\+  body?: string;

&#x20;  vwap?: number;

&#x20;  triggeredAt?: string;

@@ -46,15 +47,26 @@ export const InstitutionalAlertCardModal: React.FC<InstitutionalAlertCardModalPr

&#x20;  const sym = alert.symbol;

&#x20;  const ltp = Number(alert.ltp || 0);

\-  const buyLow = Number(alert.buyZone?.low || (ltp > 0 ? Math.round(ltp \* 0.99) : 0));

\-  const buyHigh = Number(alert.buyZone?.high || (ltp > 0 ? Math.round(ltp \* 1.02) : 0));

\+  const buyLow = Number(alert.buyZone?.low || 0);

\+  const buyHigh = Number(alert.buyZone?.high || 0);

\+  const hasBuyZone = buyLow > 0 \&\& buyHigh > 0;

\+  const isInsideBuyZone = hasBuyZone \&\& ltp >= buyLow \&\& ltp <= buyHigh;

&#x20;  const brokersText = alert.dominantBrokersText || alert.body || 'Smart Money Accumulation Flow';

&#x20;  const concentration = alert.concentrationPct || 0;

\-  const target1 = alert.target1 || (ltp > 0 ? Math.round(ltp \* 1.15) : 0);

\-  const target2 = alert.target2 || (ltp > 0 ? Math.round(ltp \* 1.25) : 0);

\-  const stopLoss = alert.stopLoss || (ltp > 0 ? Math.round(ltp \* 0.95) : 0);

\-  const rr = alert.riskRewardRatio || +((target1 - ltp) / Math.max(1, ltp - stopLoss)).toFixed(2);

\+  const target1 = Number(alert.target1 || 0);

\+  const target2 = Number(alert.target2 || 0);

\+  const stopLoss = Number(alert.stopLoss || 0);

\+  const isValidRisk = ltp > 0 \&\& stopLoss > 0 \&\& ltp > stopLoss \&\& target1 > ltp;

\+  const rr = alert.riskRewardRatio != null

\+    ? Number(alert.riskRewardRatio)

\+    : (isValidRisk ? +((target1 - ltp) / (ltp - stopLoss)).toFixed(2) : 0);

\+  const triggeredLabel = alert.triggeredAt \&\& !isNaN(new Date(alert.triggeredAt).getTime())

\+    ? `${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(alert.triggeredAt))} NPT`

\+    : 'Timestamp N/A';

@@ -112,7 +124,7 @@ export const InstitutionalAlertCardModal: React.FC<InstitutionalAlertCardModalPr

&#x20;                <div className="text-sm font-bold text-white flex items-center justify-between">

&#x20;                  <span>Dravyashree Alert: {sym} is Ready for Entry</span>

\-                  <span className="text-\[10px] text-slate-400 font-mono">Just Now</span>

\+                  <span className="text-\[10px] text-slate-400 font-mono">{triggeredLabel}</span>

&#x20;                </div>

@@ -137,7 +149,11 @@ export const InstitutionalAlertCardModal: React.FC<InstitutionalAlertCardModalPr

&#x20;            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">

&#x20;              <div className="flex items-center gap-2.5">

\-                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />

\+                {isInsideBuyZone ? (

\+                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />

\+                ) : (

\+                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />

\+                )}

&#x20;                <div>

&#x20;                  <div className="text-xs font-bold text-slate-200">Condition 1: Price in Base</div>



```



\---



\#### `src/components/EntryExitAnalyzer.tsx` (Fixes `A3-079`, `A3-083`)







```diff

\--- a/src/components/EntryExitAnalyzer.tsx

+++ b/src/components/EntryExitAnalyzer.tsx

@@ -122,12 +122,14 @@ export function EntryExitAnalyzer({

&#x20;  // Prepopulate symbol list for instant autocomplete

&#x20;  useEffect(() => {

\+    let active = true;

&#x20;    if (stocks \&\& stocks.length > 0) {

&#x20;      setAllSymbols(stocks.map((s: any) => s.symbol).filter(Boolean).sort());

&#x20;    } else {

&#x20;      fetchAllSecurities().then((r) => {

\-        if (r?.data) setAllSymbols(r.data.map((s: any) => s.symbol).filter(Boolean).sort());

\+        if (active \&\& r?.data) setAllSymbols(r.data.map((s: any) => s.symbol).filter(Boolean).sort());

&#x20;      });

&#x20;    }

\+    return () => { active = false; };

&#x20;  }, \[stocks]);

@@ -179,13 +181,17 @@ export function EntryExitAnalyzer({

&#x20;            setPlan(normalizedPlan);

&#x20;            setRawCandles(cached.plan.candles || \[]);

\+            fetchDividendHistory(sym).then((divRes) => {

\+              if (reqSeq === loadSeqRef.current \&\& Array.isArray(divRes?.dividends)) setDividendData(divRes.dividends);

\+            }).catch(() => {});

&#x20;            setAnalyzedTime(

&#x20;              new Date(cached.ts).toLocaleTimeString('en-US', {

\+                timeZone: 'Asia/Kathmandu',

&#x20;                hour: '2-digit',

&#x20;                minute: '2-digit',

&#x20;                second: '2-digit',

&#x20;                hour12: true,

\-              })

\+              }) + ' NPT'

&#x20;            );

@@ -286,12 +292,13 @@ export function EntryExitAnalyzer({

&#x20;        setPlan(result);

&#x20;        setAnalyzedTime(

&#x20;          new Date().toLocaleTimeString('en-US', {

\+            timeZone: 'Asia/Kathmandu',

&#x20;            hour: '2-digit',

&#x20;            minute: '2-digit',

&#x20;            second: '2-digit',

&#x20;            hour12: true,

\-          })

\+          }) + ' NPT'

&#x20;        );

@@ -316,7 +323,7 @@ export function EntryExitAnalyzer({

&#x20;              passesAll5,

&#x20;              rvol: result.technical?.volume?.rvol || stock?.rvol || 1.25,

\-              winRate: result.analogResult?.stats?.winRate ?? result.probabilities?.winRate ?? +(45 + Math.min(25, Math.max(-10, (scoreVal - 50) \* 0.5))).toFixed(1),

\+              winRate: result.analogResult?.stats?.winRate ?? result.probabilities?.winRate ?? null,

&#x20;              analogCount: result.analogResult?.stats?.sampleSize ?? (result.analogResult?.analogs?.length || 0),

@@ -439,14 +446,19 @@ export function EntryExitAnalyzer({

\-  const mktStatus = useMemo(() => getDetailedMarketStatus(), \[]);

\+  const \[mktStatus, setMktStatus] = useState(() => getDetailedMarketStatus());

\+  useEffect(() => {

\+    const id = setInterval(() => setMktStatus(getDetailedMarketStatus()), 60000);

\+    return () => clearInterval(id);

\+  }, \[]);

&#x20;

&#x20;  return (

&#x20;    <div className="w-full max-w-7xl mx-auto px-1 py-1.5 sm:px-4 sm:py-5 space-y-3 sm:space-y-5 font-sans text-slate-100">

&#x20;      {/\* Top Header Banner \*/}

&#x20;      <InfoBanner type="info">

&#x20;        <strong>Entry / Exit Analyzer Workstation:</strong> Quantitative decision engine combining

&#x20;        Benjamin Graham’s Margin of Safety, moving-average structures, momentum velocity, volume confirmation,

\-        S/R clustering, and 500-session historical analog backtesting (net of SEBON brokerage \& 7.5% Short-Term / 5% Long-Term Retail CGT).

\+        S/R clustering, and 500-session historical analog backtesting (net of SEBON brokerage \&amp; 5.0% Short-Term (\&le;365d) / 3.75% Long-Term (\&gt;365d) Retail CGT).

&#x20;      </InfoBanner>

@@ -540,11 +552,16 @@ export function EntryExitAnalyzer({

&#x20;              <div style={{

&#x20;                fontSize: 12,

&#x20;                fontWeight: 800,

&#x20;                padding: '4px 8px',

&#x20;                borderRadius: 8,

&#x20;                fontFamily: 'var(--font-mono, monospace)',

\-                background: pChange >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',

\-                color: pChange >= 0 ? '#34d399' : '#fb7185',

\-                border: pChange >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)'

\+                background: (pChange === 0 \&\& changeVal === 0) ? 'rgba(148,163,184,0.12)' : ((changeVal !== 0 ? changeVal : pChange) > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'),

\+                color: (pChange === 0 \&\& changeVal === 0) ? '#94a3b8' : ((changeVal !== 0 ? changeVal : pChange) > 0 ? '#34d399' : '#fb7185'),

\+                border: (pChange === 0 \&\& changeVal === 0) ? '1px solid rgba(148,163,184,0.3)' : ((changeVal !== 0 ? changeVal : pChange) > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)')

&#x20;              }}>

\-                {pChange >= 0 ? `+${changeVal.toFixed(1)} (+${pChange.toFixed(2)}%)` : `${changeVal.toFixed(1)} (${pChange.toFixed(2)}%)`}

\+                {(() => {

\+                  const dir = changeVal !== 0 ? changeVal : pChange;

\+                  const sign = dir > 0 ? '+' : dir < 0 ? '-' : '';

\+                  return `${sign}${Math.abs(changeVal).toFixed(1)} (${sign}${Math.abs(pChange).toFixed(2)}%)`;

\+                })()}

&#x20;              </div>



```



\---



\#### `src/components/DividendHistoryPanel.tsx` (Fixes `A3-082`)







```diff

\--- a/src/components/DividendHistoryPanel.tsx

+++ b/src/components/DividendHistoryPanel.tsx

@@ -16,7 +16,7 @@

&#x20;

\-import { useEffect, useState, useCallback } from 'react';

+import { useEffect, useState, useCallback, useRef } from 'react';

@@ -63,21 +63,29 @@ export function DividendHistoryPanel({

&#x20;  const \[loading, setLoading] = useState(false);

&#x20;  const \[result, setResult]   = useState<any>(null);

&#x20;  const \[error, setError]     = useState('');

\+  const reqSeqRef = useRef(0);

&#x20;

&#x20;  const analyze = useCallback(async (sym: string) => {

&#x20;    if (!sym) return;

\+    const reqSeq = ++reqSeqRef.current;

&#x20;    setSymbol(sym);

&#x20;    setLoading(true);

&#x20;    setResult(null);

&#x20;    setError('');

\+    let timerId: any = null;

&#x20;    try {

\-      const timeoutPromise = new Promise((\_, reject) => setTimeout(() => reject(new Error('Dividend fetch timeout')), 5000));

\+      const timeoutPromise = new Promise((\_, reject) => {

\+        timerId = setTimeout(() => reject(new Error('Dividend fetch timeout')), 5000);

\+      });

&#x20;      const res = await Promise.race(\[fetchRealDividendHistory(sym), timeoutPromise]) as any;

\+      if (reqSeq !== reqSeqRef.current) return;

&#x20;      setResult(res);

&#x20;      if (!res.real \&\& res.error) setError(res.error);

&#x20;    } catch (e: any) {

\+      if (reqSeq !== reqSeqRef.current) return;

&#x20;      setError(e.message || 'Failed to fetch dividend history');

\+    } finally {

\+      if (timerId) clearTimeout(timerId);

\+      if (reqSeq === reqSeqRef.current) setLoading(false);

&#x20;    }

\-    setLoading(false);

&#x20;  }, \[]);

@@ -129,7 +137,7 @@ export function DividendHistoryPanel({

&#x20;            {result.fetchedAt \&\& (

\-              <span className="text-slate-500">as of {new Date(result.fetchedAt).toLocaleTimeString()}</span>

\+              <span className="text-slate-500">as of {new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(result.fetchedAt))} NPT</span>

&#x20;            )}

&#x20;          </div>

@@ -234,7 +242,7 @@ export function DividendHistoryPanel({

\-          {dividends.length === 0 \&\& result.real === false \&\& (

\+          {dividends.length === 0 \&\& (

&#x20;            <NoData message={error || `No dividend or bonus share records found for ${symbol || initialSymbol}. The stock may be newly listed, or records may not be available from the data source.`} />

&#x20;          )}



```



\---



\#### `src/components/InAppNewsReaderModal.jsx` (Fixes `A3-084`)







```diff

\--- a/src/components/InAppNewsReaderModal.jsx

+++ b/src/components/InAppNewsReaderModal.jsx

@@ -1,6 +1,7 @@

&#x20;import React, { useState, useEffect } from 'react';

&#x20;import { ArrowLeft, ExternalLink, Calendar, Newspaper, Loader2, Share2, TrendingUp, Sparkles, BookOpen } from 'lucide-react';

\-import { useBackHandler, useNavigation } from '../context/NavigationContext';

+import { useNavigation } from '../context/NavigationContext';

&#x20;import { fetchNewsArticle } from '../utils/servicesApi';

+import { openExternalUrl } from '../utils/externalLinks';

@@ -35,13 +36,7 @@ export function InAppNewsReaderModal({ article, isOpen, onClose }) {

&#x20;  const openStockDetail = navigation?.openStockDetail;

&#x20;  const setActiveTab = navigation?.setActiveTab;

&#x20;

\-  useBackHandler(() => {

\-    if (isOpen) {

\-      onClose();

\-      return true;

\-    }

\-    return false;

\-  }, isOpen, 90);

\+  // Back handling is registered centrally by App.jsx (priority 65) to avoid duplicate history.pushState entries

@@ -165,16 +160,15 @@ export function InAppNewsReaderModal({ article, isOpen, onClose }) {

\-            {currentDetail.url \&\& (

\-              <a

\-                href={currentDetail.url}

\-                target="\_blank"

\-                rel="noopener noreferrer"

\-                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition active:scale-95"

\+            {currentDetail.url \&\& /^https?:\\/\\//i.test(currentDetail.url) \&\& (

\+              <button

\+                type="button"

\+                onClick={() => openExternalUrl(currentDetail.url)}

\+                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition active:scale-95 cursor-pointer"

&#x20;                title="Open publisher portal"

&#x20;              >

&#x20;                <span>Original Link</span>

&#x20;                <ExternalLink size={12} />

\-              </a>

\+              </button>

&#x20;            )}

@@ -205,7 +199,7 @@ export function InAppNewsReaderModal({ article, isOpen, onClose }) {

&#x20;                <TrendingUp size={11} />

\-                <span>${currentDetail.symbol}</span>

\+                <span>{currentDetail.symbol}</span>

&#x20;              </button>

&#x20;            )}

@@ -264,7 +258,7 @@ export function InAppNewsReaderModal({ article, isOpen, onClose }) {

&#x20;                <TrendingUp size={15} />

\-                <span>View ${currentDetail.symbol} Market Depth \& Institutional Radar</span>

\+                <span>View {currentDetail.symbol} Market Depth \&amp; Institutional Radar</span>

&#x20;              </button>



```



Upload `03-ACC3-REM-PART04.txt` next with the same continuation prompt to continue from `A3-088`.
### 1. Files Inspected in This Turn



From `03-ACC3-REM-PART04.txt`:



\* `src\\components\\InvestorDecisionGuideModal.jsx` \*(complete)\*





\* `src\\components\\LoadingShimmerBar.jsx` \*(complete — no bugs found)\*





\* `src\\components\\Master100ProfitWorkstation.tsx` \*(complete)\*





\* `src\\components\\ProGate.jsx` \*(complete)\*





\* `src\\components\\PullToRefresh.jsx` \*(complete)\*





\* `src\\components\\RegulatoryHub.tsx` \*(complete)\*





\* `src\\components\\Resources.jsx` \*(complete)\*





\* `src\\components\\SessionDateDropdown.jsx` \*(complete)\*





\* `src\\components\\SessionFreshnessBadge.jsx` \*(complete)\*







\*\*Cross-referenced from earlier turns:\*\* `src\\App.jsx`, `src\\components\\AlphaCommandCenter.tsx`, `src\\context\\SubscriptionContext.jsx`, `src\\components\\Dashboard.jsx`, and `src\\views\\StitchHub.jsx`. Zero files were truncated in this attachment.



\---



\### 2. Audit Findings Table (Continuing from `A3-087`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-088\*\* | \*\*P0\*\* | `src/components/SessionFreshnessBadge.jsx` (Timestamp \& `isStale` logic)



&#x20;| (1) `timeStr` formats `now` (live wall-clock) instead of `lastUpdatedMs`. (2) When `lastUpdatedMs` is `null` (offline/unloaded), `lastUpdate` falls back to `now.getTime()`, forcing `lagMs = 0` and `isStale = false`. (3) Uses `isMarketOpen(now)` instead of `getDetailedMarketStatus()`, ignoring emergency market halts.



&#x20;| Investors on failed/offline feeds see a bright green \*\*`● LIVE • As of <today> <current minute> NPT`\*\* badge, and even stale feeds print the current minute next to `"Data Lag"`.



&#x20;| Show `"Awaiting Live Feed"` (amber) when `isOpen \&\& !lastUpdatedMs`; format `timeStr` strictly from `new Date(lastUpdatedMs)` (never `now`); check `getDetailedMarketStatus()` so emergency halts never render `LIVE`. |

| \*\*A3-089\*\* | \*\*P0\*\* | `src/components/RegulatoryHub.tsx` (SEBON Statutory Fee \& Commission Slabs card)



&#x20;| Hardcodes outdated individual CGT rates (`Short-term (≤365d): 7.5%`, `Long-term (>365d): 5.0%`) in the official regulatory reference panel.



&#x20;| Investors checking the app's official SEBON/IRD regulatory screen see obsolete tax rates instead of Nepal's `5.0%` ST ($\\le 365\\text{d}$) and `3.75%` LT ($> 365\\text{d}$) rates effective 22 Sept 2026 (31 Bhadra 2083).



&#x20;| Update the CGT display to `Short-term (≤365d): 5.0%`, `Long-term (>365d): 3.75%`, and `Corporate / Inst.: 10.0%`. |

| \*\*A3-090\*\* | \*\*P0\*\* | `src/components/Master100ProfitWorkstation.tsx` \& `src/components/InvestorDecisionGuideModal.jsx`



&#x20;| (1) Hardcodes outdated `7.5%` individual ST CGT across 5 UI/TMS-copy strings in `Master100ProfitWorkstation.tsx` and in `InvestorDecisionGuideModal.jsx` Step 5 (`७.५% पुँजीगत लाभकर`). (2) `Master100ProfitWorkstation.tsx` Simulator fabricates `startCap \* 2.19` (+119%) when `endingCapital` is falsy, displays gross `target1Gross - ltp` expectancy without fees/CGT, and hardcodes `"on Rs. 1,00,000 capital"`.



&#x20;| Misleads investors on statutory CGT deductions, fabricates a +119% compounding curve on empty simulations, and overstates expectancy by omitting NEPSE fees and CGT.



&#x20;| Update all CGT labels to `5.0% ST CGT` (`3.75% LT`), remove the `\* 2.19` fabrication (default `endCap` to `startCap`), use net gain after fees/CGT in expectancy, and render `startingCapital.toLocaleString('en-IN')` dynamically. |

| \*\*A3-091\*\* | \*\*P1\*\* | `src/components/Master100ProfitWorkstation.tsx` (`handleAddToWatchlist`)



&#x20;| Cross-file contract mismatch: reads/writes `localStorage.getItem('nepse\_watchlist')` without dispatching events, whereas `App.jsx`, `Dashboard.jsx`, and `utils/watchlist.js` use `'nepse\_user\_watchlist'` and `'nepse\_watchlist\_updated'`.



&#x20;| Clicking `"Track in Watchlist"` shows green `"Added to Radar!"` while \*\*never actually adding the stock\*\* to the Watchlist or Notification Center.



&#x20;| Replace raw `localStorage` logic with `addToWatchlist(inspectedStock.symbol)` imported from `../utils/watchlist`. |

| \*\*A3-092\*\* | \*\*P1\*\* | `src/components/Master100ProfitWorkstation.tsx` (Telegram \& Discord handlers)



&#x20;| (1) `handleTestTelegram` blocks if `telegramToken` input is blank even when `telegramStatus.isConfigured === true` (after page reload the masked token is not in state, so Test Ping always fails). (2) `handleSaveTelegram` sends `botToken: ""` when updating only `chatId`. (3) Discord handlers call `res.json()` directly without `res.ok`/JSON-parse guards or `buildTelegramHeaders()`. (4) `telegramTestMsg.link` uses raw `<a href>` instead of `openExternalUrl()`.



&#x20;| After saving Telegram alerts and reloading, `"Send Test Ping"` always fails despite `"ACTIVE \& CONNECTED"`; updating Chat ID risks wiping the server bot token; HTML proxy errors crash Discord buttons.



&#x20;| Allow `handleTestTelegram` to ping server-stored credentials when `telegramStatus?.isConfigured` is `true`, omit `botToken` from payload when blank, harden Discord JSON parsing + headers, and open `telegramTestMsg.link` via `openExternalUrl()` after `^https?://` check. |

| \*\*A3-093\*\* | \*\*P1\*\* | `src/components/Resources.jsx` (Broker TMS URLs) \& cross-file `src/views/StitchHub.jsx`



&#x20;| (1) Constructs `https://tms${broker.number}.nepalstock.com.np/` without 2-digit zero-padding, breaking single-digit brokers (`#1 Kumari` -> `tms1`, `#4 Opal` -> `tms4` instead of `tms01`, `tms04`). (2) Cross-file mismatch: `Resources.jsx` correctly labels Broker `#58` as `Naasa Securities Co. Ltd.`, whereas `StitchHub.jsx` mislabels TMS `#58` as `Himalayan Sec (TMS #58)`.



&#x20;| Clicking Kumari (#1) or Opal (#4) TMS portals opens dead domains; Stitch mode displays the wrong brokerage name for TMS #58.



&#x20;| Zero-pad broker numbers (`String(broker.number).padStart(2, '0')`) in `Resources.jsx`, and correct `"Himalayan Sec (TMS #58)"` to `"Naasa Securities (TMS #58)"` in `StitchHub.jsx`. |

| \*\*A3-094\*\* | \*\*P1\*\* | `src/components/PullToRefresh.jsx` (`handleMouseDown`, `handleTouchEnd`, `handleTouchMove`)



&#x20;| (1) `handleMouseDown` intercepts all downward left-mouse drags when `scrollTop === 0` (hijacking chart pan/drag and text selection inside `Dashboard.jsx` on Windows desktop) and leaks `window` `mousemove`/`mouseup` listeners on unmount. (2) `setPullDistance(50)` stays permanently stuck at `50px` if `onRefresh` finishes or throws without flipping `isRefreshing`.



&#x20;| Desktop Windows users trying to pan charts or select text at the top of Market Dashboard accidentally pull down the whole page and trigger refreshes; failed refreshes leave a frozen `"Updating NEPSE Data…"` bar.



&#x20;| Restrict drag-to-refresh to touch events (remove desktop `onMouseDown` hijack), attach a fallback timeout/promise `.finally()` in `handleTouchEnd` to guarantee `setPullDistance(0)`, and bind non-passive `touchmove` via `addEventListener(..., { passive: false })` on `containerRef`. |

| \*\*A3-095\*\* | \*\*P1\*\* | `src/components/RegulatoryHub.tsx` (`spread`, `timeoutRace`, `useEffect`, circulars link)



&#x20;| (1) `(sell - buy).toFixed(2)` prints negative spreads (e.g. `Rs. -134.50`) whenever NRB omits a currency selling rate (`sell === 0`). (2) `timeoutRace` leaks 5s timers and initial fetches lack `isMounted` guards. (3) Circulars `"View"` link uses raw `<a href>` instead of `openExternalUrl()`.



&#x20;| Displays bogus negative currency spreads; unmounted tab transitions trigger state updates; circular PDFs/links bypass Electron/Capacitor native handover.



&#x20;| Display `'—'` when `sell <= 0 || buy <= 0`; clear `timeoutRace` timer in `finally` and guard state updates with `isMountedRef`; open circular URLs via `openExternalUrl()`. |

| \*\*A3-096\*\* | \*\*P2\*\* | `src/components/InvestorDecisionGuideModal.jsx`



&#x20;| Does not register `useBackHandler` and lacks backdrop click (`onClick={onClose}`) dismissal.



&#x20;| Pressing Android hardware Back exits or navigates away behind the open guide modal instead of closing it.



&#x20;| Register `useBackHandler(() => { onClose(); return true; }, isOpen, 70)` and add `onClick={onClose}` on the outer backdrop with `e.stopPropagation()` on the card. |

| \*\*A3-097\*\* | \*\*P2\*\* | `src/components/Resources.jsx`



&#x20;| Displays hardcoded static pricing cards (`Rs 2500/yr`, `Rs 800/yr`) disconnected from `SubscriptionContext` (`PRO\_PLANS` 1m/2m/3m/6m/12m), renders non-clickable feature rows, and ignores the `onNavigateTab` prop.



&#x20;| Investors see contradictory Pro pricing compared to the main Upgrade modal and cannot click listed features to open them.



&#x20;| Read pricing dynamically from `useSubscription()` (or remove hardcoded external pricing cards) and wire feature cards to navigate via `onNavigateTab('services')` + `open\_service`. |

| \*\*A3-098\*\* | \*\*P2\*\* | `src/components/RegulatoryHub.tsx` \& `src/components/Master100ProfitWorkstation.tsx`



&#x20;| `RegulatoryHub` omits the `As-Of` date on Bullion prices and double-fetches macro data alongside `<NRBMacroWidget/>`; `Master100ProfitWorkstation` ignores `master\_guide\_tab`/`selected\_entry\_exit\_symbol` and `switch\_predictor\_tab` dispatched by `Dashboard.jsx`.



&#x20;| Investors cannot verify bullion price freshness; clicking a specific stock in Dashboard's Alpha Desk widget does not pre-select it inside Blueprint/Matrix tabs.



&#x20;| Display `bullionData?.date` on Bullion cards and listen for `switch\_predictor\_tab` / `selected\_entry\_exit\_symbol` in `Master100ProfitWorkstation`. |

| \*\*A3-099\*\* | \*\*P3\*\* | `src/components/Master100ProfitWorkstation.tsx`, `src/components/ProGate.jsx`, `src/components/SessionDateDropdown.jsx`



&#x20;| Invalid CSS `shrink: 0` (should be `flexShrink: 0`) and uncleaned `copySuccess`/`watchlistSuccess` timeouts in `Master100ProfitWorkstation`; `ProGate` compact `div` lacks keyboard access; `SessionDateDropdown` does not close on `Escape`.



&#x20;| Minor layout/accessibility polish and unmount timer hygiene.



&#x20;| Fix `flexShrink: 0`, clear timeout refs on unmount, add `role="button"`/`tabIndex={0}` to `ProGate`, and handle `Escape` in `SessionDateDropdown`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/components/SessionFreshnessBadge.jsx` (Fixes `A3-088`)







```diff

\--- a/src/components/SessionFreshnessBadge.jsx

+++ b/src/components/SessionFreshnessBadge.jsx

@@ -1,5 +1,5 @@

&#x20;import React, { useState, useEffect } from 'react';

\-import { isMarketOpen, latestTradingSession, formatNptDateIso } from '../utils/nepseCalendar.js';

+import { getDetailedMarketStatus, latestTradingSession } from '../utils/nepseCalendar.js';

&#x20;import { RefreshCw, AlertTriangle, Clock } from 'lucide-react';

&#x20;

&#x20;export default function SessionFreshnessBadge({

@@ -26,15 +26,21 @@ export default function SessionFreshnessBadge({

&#x20;    return () => clearInterval(timer);

&#x20;  }, \[]);

&#x20;

\-  const isOpen = isMarketOpen(now);

\+  const mktStatus = getDetailedMarketStatus(now);

\+  const isOpen = Boolean(mktStatus?.isOpen \&\& !mktStatus?.isEmergencyHalt);

&#x20;  const effectiveSessionDate = sessionDate || latestTradingSession(now, !isOpen);

\-  const timeStr = now.toLocaleTimeString('en-US', {

\-    timeZone: 'Asia/Kathmandu',

\-    hour: '2-digit',

\-    minute: '2-digit',

\-    hour12: true

\-  });

\+  const parsedLastMs = lastUpdatedMs != null ? Number(lastUpdatedMs) : null;

\+  const hasValidLastUpdate = Number.isFinite(parsedLastMs) \&\& parsedLastMs > 0;

\+  const timeStr = hasValidLastUpdate

\+    ? new Date(parsedLastMs).toLocaleTimeString('en-US', {

\+        timeZone: 'Asia/Kathmandu',

\+        hour: '2-digit',

\+        minute: '2-digit',

\+        hour12: true

\+      })

\+    : '';

&#x20;

&#x20;  if (isWarmingUp) {

&#x20;    return (

@@ -44,12 +50,21 @@ export default function SessionFreshnessBadge({

&#x20;    );

&#x20;  }

&#x20;

\-  const lastUpdate = lastUpdatedMs ? Number(lastUpdatedMs) : now.getTime();

\-  const lagMs = Math.max(0, now.getTime() - lastUpdate);

\-  const isStale = isOpen \&\& Boolean(lastUpdatedMs) \&\& lagMs > staleThresholdMs;

\+  const lagMs = hasValidLastUpdate ? Math.max(0, now.getTime() - parsedLastMs) : Infinity;

\+  const isStale = isOpen \&\& hasValidLastUpdate \&\& lagMs > staleThresholdMs;

&#x20;

&#x20;  if (isOpen) {

\+    if (!hasValidLastUpdate) {

\+      return (

\+        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#fbbf24' }}>

\+          <AlertTriangle style={{ width: 12, height: 12 }} />

\+          <span>Awaiting Live Feed • Showing {effectiveSessionDate}</span>

\+        </div>

\+      );

\+    }

&#x20;    if (isStale) {

&#x20;      return (

&#x20;        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#fbbf24' }}>

&#x20;          <AlertTriangle style={{ width: 12, height: 12 }} />

&#x20;          <span>⚠️ Data Lag ({Math.round(lagMs / 60000)}m) • Last tick {effectiveSessionDate} {timeStr} NPT</span>

&#x20;        </div>

&#x20;      );

&#x20;    }



```



\---



\#### `src/components/RegulatoryHub.tsx` (Fixes `A3-089`, `A3-095`)







```diff

\--- a/src/components/RegulatoryHub.tsx

+++ b/src/components/RegulatoryHub.tsx

@@ -1,4 +1,4 @@

\-import React, { useState, useEffect } from 'react';

+import React, { useState, useEffect, useRef } from 'react';

@@ -12,6 +12,7 @@ import {

&#x20;} from '../utils/servicesApi';

&#x20;import { formatNptDateIso } from '../utils/nepseCalendar';

&#x20;import { NRBMacroWidget } from './NRBMacroWidget';

+import { openExternalUrl } from '../utils/externalLinks';

&#x20;

&#x20;export function RegulatoryHub({ initialTab = 'forex' }: { initialTab?: 'forex' | 'macro' | 'bullion' | 'circulars' } = {}) {

&#x20;  const \[activeSubTab, setActiveSubTab] = useState<'forex' | 'macro' | 'bullion' | 'circulars'>(initialTab);

@@ -39,8 +40,18 @@ export function RegulatoryHub({ initialTab = 'forex' }: { initialTab?: 'forex' |

&#x20;  const \[circularsLoading, setCircularsLoading] = useState(false);

&#x20;  const \[circularSearch, setCircularSearch] = useState('');

\+  const isMountedRef = useRef(true);

\+  useEffect(() => {

\+    isMountedRef.current = true;

\+    return () => { isMountedRef.current = false; };

\+  }, \[]);

&#x20;

\-  const timeoutRace = <T,>(p: Promise<T>, ms = 5000): Promise<T> =>

\-    Promise.race(\[p, new Promise<never>((\_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

\+  const timeoutRace = <T,>(p: Promise<T>, ms = 5000): Promise<T> => {

\+    let timerId: any;

\+    return Promise.race(\[

\+      p,

\+      new Promise<never>((\_, reject) => { timerId = setTimeout(() => reject(new Error('timeout')), ms); })

\+    ]).finally(() => clearTimeout(timerId));

\+  };

@@ -59,13 +70,13 @@ export function RegulatoryHub({ initialTab = 'forex' }: { initialTab?: 'forex' |

&#x20;        if (normalized.length > 0 \&\& isMountedRef.current) {

&#x20;          setForexData(normalized);

&#x20;          setForexDate(res?.date || res?.data?.date || formatNptDateIso(new Date()));

&#x20;        }

&#x20;      }

&#x20;    } catch (e) {

&#x20;      console.warn('Forex fetch error', e);

&#x20;    } finally {

\-      setForexLoading(false);

\+      if (isMountedRef.current) setForexLoading(false);

&#x20;    }

&#x20;  };

@@ -276,7 +287,7 @@ export function RegulatoryHub({ initialTab = 'forex' }: { initialTab?: 'forex' |

&#x20;                    {filteredForex.map((c, i) => {

&#x20;                      const buy = parseFloat(c.buy) || 0;

&#x20;                      const sell = parseFloat(c.sell) || 0;

\-                      const spread = (sell - buy).toFixed(2);

\+                      const spread = buy > 0 \&\& sell > 0 \&\& sell >= buy ? `Rs. ${(sell - buy).toFixed(2)}` : '—';

&#x20;                      return (

&#x20;                        <tr key={c.iso3 || i} className="hover:bg-slate-800/30 transition-colors">

@@ -297,7 +308,7 @@ export function RegulatoryHub({ initialTab = 'forex' }: { initialTab?: 'forex' |

&#x20;                          <td className="py-3 px-4 text-right font-mono text-slate-400">

\-                            Rs. {spread}

\+                            {spread}

&#x20;                          </td>

&#x20;                        </tr>

&#x20;                      );

@@ -384,9 +395,9 @@ export function RegulatoryHub({ initialTab = 'forex' }: { initialTab?: 'forex' |

&#x20;              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">

&#x20;                <div className="font-bold text-slate-300 mb-2">Capital Gains Tax (CGT)</div>

&#x20;                <div className="space-y-1.5 font-mono text-\[11px] text-slate-400">

\-                  <div className="flex justify-between"><span>Short-term (\&le;365d):</span> <span className="text-rose-400 font-bold">7.5%</span></div>

\-                  <div className="flex justify-between"><span>Long-term (\&gt;365d):</span> <span className="text-emerald-400 font-bold">5.0%</span></div>

\+                  <div className="flex justify-between"><span>Short-term (\&le;365d):</span> <span className="text-rose-400 font-bold">5.0%</span></div>

\+                  <div className="flex justify-between"><span>Long-term (\&gt;365d):</span> <span className="text-emerald-400 font-bold">3.75%</span></div>

&#x20;                  <div className="flex justify-between"><span>Corporate / Inst.:</span> <span className="text-blue-400 font-bold">10.0%</span></div>

&#x20;                </div>

&#x20;              </div>

@@ -534,15 +545,15 @@ export function RegulatoryHub({ initialTab = 'forex' }: { initialTab?: 'forex' |

&#x20;                        : `https://www.sebon.gov.np${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`);

&#x20;                    return (

\-                      <a

\-                        href={resolvedUrl}

\-                        target="\_blank"

\-                        rel="noopener noreferrer"

\-                        className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-\[11px] font-semibold text-blue-400 hover:bg-slate-700 shrink-0"

\+                      <button

\+                        type="button"

\+                        onClick={() => openExternalUrl(resolvedUrl)}

\+                        className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-\[11px] font-semibold text-blue-400 hover:bg-slate-700 shrink-0 cursor-pointer"

&#x20;                      >

&#x20;                        <span>View</span>

&#x20;                        <ExternalLink className="h-3 w-3" />

\-                      </a>

\+                      </button>

&#x20;                    );

&#x20;                  })()}



```



\---



\#### `src/components/Master100ProfitWorkstation.tsx` \& `src/components/InvestorDecisionGuideModal.jsx` (Fixes `A3-090`, `A3-091`, `A3-092`)







```diff

\--- a/src/components/Master100ProfitWorkstation.tsx

+++ b/src/components/Master100ProfitWorkstation.tsx

@@ -21,6 +21,7 @@ import { getDetailedMarketStatus } from '../utils/nepseCalendar';

&#x20;import { getProxyBase, fetchMarketWideBrokerSummaryMap } from '../utils/liveData';

&#x20;import { AlphaCommandCenter } from './AlphaCommandCenter';

&#x20;import { Capacitor } from '@capacitor/core';

&#x20;import { openExternalUrl } from '../utils/externalLinks';

+import { addToWatchlist } from '../utils/watchlist';

@@ -127,10 +128,11 @@ export function Master100ProfitWorkstation({

&#x20;    try {

&#x20;      const base = getProxyBase();

\+      const payload: any = { chatId: chat, enabled: true };

\+      if (token) payload.botToken = token; // Preserve server-stored token when updating Chat ID only

&#x20;      const res = await fetch(`${base}/api/telegram/config`, {

&#x20;        method: 'POST',

&#x20;        headers: buildTelegramHeaders(),

\-        body: JSON.stringify({ botToken: token, chatId: chat, enabled: true })

\+        body: JSON.stringify(payload)

&#x20;      });

@@ -160,9 +162,9 @@ export function Master100ProfitWorkstation({

&#x20;    const token = cleanBotToken(telegramToken);

&#x20;    const chat = String(telegramChatId || '').trim();

&#x20;

\-    if (!token || !chat) {

\+    if ((!token \&\& !telegramStatus?.isConfigured) || (!chat \&\& !telegramStatus?.chatId)) {

&#x20;      setTelegramTestMsg({

&#x20;        type: 'error',

\-        text: '⚠️ Both Bot Token and Chat ID are required. Please paste your token and click Auto-Detect.'

\+        text: '⚠️ Bot Token and Chat ID are required before sending a test ping.'

&#x20;      });

&#x20;      setTelegramTesting(false);

&#x20;      return;

@@ -174,7 +176,7 @@ export function Master100ProfitWorkstation({

&#x20;      const res = await fetch(`${base}/api/telegram/test`, {

&#x20;        method: 'POST',

&#x20;        headers: buildTelegramHeaders(),

\-        body: JSON.stringify({ botToken: token, chatId: chat })

\+        body: JSON.stringify({ botToken: token || undefined, chatId: chat || undefined })

&#x20;      });

@@ -349,10 +351,12 @@ export function Master100ProfitWorkstation({

&#x20;      const base = getProxyBase();

&#x20;      const res = await fetch(`${base}/api/discord/config`, {

&#x20;        method: 'POST',

\-        headers: { 'Content-Type': 'application/json' },

\+        headers: buildTelegramHeaders(),

&#x20;        body: JSON.stringify({ webhookUrl: discordWebhookUrl, enabled: true })

&#x20;      });

\-      const data = await res.json();

\+      const raw = await res.text();

\+      const data = raw ? JSON.parse(raw) : null;

\+      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

&#x20;      if (data.success) {

@@ -374,10 +378,12 @@ export function Master100ProfitWorkstation({

&#x20;      const base = getProxyBase();

&#x20;      const res = await fetch(`${base}/api/discord/test`, {

&#x20;        method: 'POST',

\-        headers: { 'Content-Type': 'application/json' },

\+        headers: buildTelegramHeaders(),

&#x20;        body: JSON.stringify({ webhookUrl: discordWebhookUrl || undefined })

&#x20;      });

\-      const data = await res.json();

\+      const raw = await res.text();

\+      const data = raw ? JSON.parse(raw) : null;

\+      if (!res.ok || !data?.success) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

&#x20;      if (data.success) {

@@ -398,10 +404,12 @@ export function Master100ProfitWorkstation({

&#x20;      const base = getProxyBase();

&#x20;      const res = await fetch(`${base}/api/discord/test-alert`, {

&#x20;        method: 'POST',

\-        headers: { 'Content-Type': 'application/json' },

\+        headers: buildTelegramHeaders(),

&#x20;        body: JSON.stringify({

&#x20;          symbol: inspectedStock?.symbol || 'HATHY',

&#x20;          ltp: inspectedStock?.ltp || 420

&#x20;        })

&#x20;      });

\-      const data = await res.json();

\+      const raw = await res.text();

\+      const data = raw ? JSON.parse(raw) : null;

\+      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

&#x20;      if (data.success) {

@@ -429,7 +437,7 @@ export function Master100ProfitWorkstation({

&#x20;    const text = `NEPSE TMS ORDER BLUEPRINT:\\nScrip: ${inspectedStock.symbol} | Type: LIMIT ORDER\\nTrack: ${trackNote} | Setup: ${setupNote}\\nEntry Limit: Rs. ${inspectedStock.entryLow} (Chase Cap: Rs. ${inspectedStock.chaseCap})\\nAllocated Qty: ${sizing.allowedShares} Shares (Capital: Rs. ${sizing.capitalOutlay.toLocaleString()})${capNote}\\nStop-Loss Floor: Rs. ${inspectedStock.stopLoss} (-${inspectedStock.stopLossPct}%)\\nTarget 1: Rs. ${inspectedStock.target1Gross} (+${inspectedStock.target1NetPct}% Net after 5.0% ST CGT)`;

&#x20;

@@ -440,11 +448,7 @@ export function Master100ProfitWorkstation({

&#x20;  const handleAddToWatchlist = () => {

&#x20;    if (!inspectedStock) return;

&#x20;    try {

\-      const savedList = JSON.parse(localStorage.getItem('nepse\_watchlist') || '\[]');

\-      if (!savedList.includes(inspectedStock.symbol)) {

\-        savedList.push(inspectedStock.symbol);

\-        localStorage.setItem('nepse\_watchlist', JSON.stringify(savedList));

\-      }

\+      addToWatchlist(inspectedStock.symbol);

&#x20;      setWatchlistSuccess(true);

&#x20;      setTimeout(() => setWatchlistSuccess(false), 2500);

&#x20;    } catch (\_) {}

@@ -509,7 +513,7 @@ export function Master100ProfitWorkstation({

&#x20;              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#94a3b8' }}>

\-                Automated 8-Gate Screener \&bull; 6-Point Matrix \&bull; Half-Kelly Compounding (\&plusmn;15% Circuits | 7.5% Short-Term CGT)

\+                Automated 8-Gate Screener \&bull; 6-Point Matrix \&bull; Half-Kelly Compounding (\&plusmn;15% Circuits | 5.0% ST / 3.75% LT CGT)

&#x20;              </p>

@@ -762,7 +766,7 @@ export function Master100ProfitWorkstation({

&#x20;                  <div>

&#x20;                    <div style={{ fontSize: 12, color: '#94a3b8' }}>NET RISK : REWARD</div>

&#x20;                    <div style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>

\-                      {inspectedStock.netRRR} : 1 <span style={{ fontSize: 12, color: '#94a3b8' }}>net 7.5% CGT</span>

\+                      {inspectedStock.netRRR} : 1 <span style={{ fontSize: 12, color: '#94a3b8' }}>net 5.0% ST CGT</span>

&#x20;                    </div>

&#x20;                  </div>

@@ -823,7 +827,7 @@ export function Master100ProfitWorkstation({

&#x20;                    <div style={{ fontSize: 12, color: '#34d399', marginTop: 2 }}>

\-                      +{inspectedStock.target1NetPct}% Net (after 7.5% CGT)

\+                      +{inspectedStock.target1NetPct}% Net (after 5.0% ST CGT)

&#x20;                    </div>

&#x20;                  </div>

@@ -880,7 +884,7 @@ export function Master100ProfitWorkstation({

&#x20;                    <div style={{ fontSize: 12, color: '#94a3b8' }}>

\-                      Tiered Broker Fees + SEBON 0.015% + 7.5% CGT Included

\+                      Tiered Broker Fees + SEBON 0.015% + 5.0% ST CGT Included

&#x20;                    </div>

&#x20;                  </div>

@@ -1149,7 +1153,7 @@ export function Master100ProfitWorkstation({

&#x20;              {(() => {

&#x20;                const startCap = Number(auditReport.compoundSimulation.startingCapital || 100000);

\-                const endCap = Number(auditReport.compoundSimulation.endingCapital || (auditReport.crownedWinner ? startCap \* 2.19 : startCap));

\+                const endCap = Number(auditReport.compoundSimulation.endingCapital || startCap);

&#x20;                const totalGrowth = endCap / Math.max(1, startCap);

@@ -1192,12 +1196,13 @@ export function Master100ProfitWorkstation({

&#x20;            {auditReport.crownedWinner ? (

&#x20;              <>

&#x20;                E = ({(auditReport.compoundSimulation.winRate / 100).toFixed(2)} \&times; Rs.\&nbsp;

\-                {Math.round((auditReport.crownedWinner.target1Gross - auditReport.crownedWinner.ltp) \* auditReport.crownedWinner.kellyShares).toLocaleString()}) \&minus;{' '}

\+                {Math.round(calculateNetTradeGain(auditReport.crownedWinner.ltp, auditReport.crownedWinner.target1Gross, auditReport.crownedWinner.kellyShares).netRealizedGain).toLocaleString()}) \&minus;{' '}

&#x20;                ({((100 - auditReport.compoundSimulation.winRate) / 100).toFixed(2)} \&times; Rs.\&nbsp;

\-                {Math.round((auditReport.crownedWinner.ltp - auditReport.crownedWinner.stopLoss) \* auditReport.crownedWinner.kellyShares).toLocaleString()}) = <b>derived from {auditReport.crownedWinner.symbol} trade levels</b>.

\+                {Math.round(Math.abs(calculateNetTradeGain(auditReport.crownedWinner.ltp, auditReport.crownedWinner.stopLoss, auditReport.crownedWinner.kellyShares).netRealizedGain)).toLocaleString()}) = <b>net of fees \&amp; CGT on {auditReport.crownedWinner.symbol}</b>.

&#x20;              </>

&#x20;            ) : (

&#x20;              <span>No active trade setup meets all 8 quantitative gates. Mathematical expectancy cannot be computed without a confirmed setup (100% Capital Defense).</span>

&#x20;            )}

&#x20;            <br />

&#x20;            Deploying Half-Kelly (\&asymp; 25% of capital per position) across 20 sequential trades produces approximately{' '}

\-            <b>Rs. {auditReport.compoundSimulation.netProfitAmount.toLocaleString()} net profit on Rs. 1,00,000 capital (+{auditReport.compoundSimulation.netReturnPct}%)</b> in 6 to 10 months.<br />

\+            <b>Rs. {auditReport.compoundSimulation.netProfitAmount.toLocaleString()} net profit on Rs. {Number(auditReport.compoundSimulation.startingCapital || 100000).toLocaleString('en-IN')} capital (+{auditReport.compoundSimulation.netReturnPct}%)</b> in 6 to 10 months.<br />

@@ -1453,10 +1458,10 @@ export function Master100ProfitWorkstation({

\-                    {telegramTestMsg.link \&\& (

\+                    {telegramTestMsg.link \&\& /^https?:\\/\\//i.test(telegramTestMsg.link) \&\& (

&#x20;                      <div style={{ marginTop: 8 }}>

\-                        <a

\-                          href={telegramTestMsg.link}

\-                          target="\_blank"

\-                          rel="noreferrer"

\+                        <button

\+                          type="button"

\+                          onClick={() => openExternalUrl(telegramTestMsg.link!)}

&#x20;                          style={{

&#x20;                            display: 'inline-block',

&#x20;                            padding: '6px 12px',

&#x20;                            background: '#38bdf8',

&#x20;                            color: '#0f172a',

&#x20;                            borderRadius: 6,

&#x20;                            fontWeight: 800,

\-                            textDecoration: 'none',

\-                            fontSize: 12

\+                            border: 'none',

\+                            cursor: 'pointer',

\+                            fontSize: 12

&#x20;                          }}

&#x20;                        >

&#x20;                          {telegramTestMsg.linkText || 'Open Bot in Telegram'}

\-                        </a>

\+                        </button>

&#x20;                      </div>

&#x20;                    )}



```



```diff

\--- a/src/components/InvestorDecisionGuideModal.jsx

+++ b/src/components/InvestorDecisionGuideModal.jsx

@@ -215,7 +215,7 @@ export default function InvestorDecisionGuideModal({ isOpen, onClose, initialTab

\-                    <li><strong>T+2 राचेट शिल्ड (Ratchet Shield):</strong> T+2 राफसाफपछि नाफा +१.२R पुग्नासाथ स्टप-लस बढाएर Entry \&times; १.०१२ मा सार्नुहोस् जसले गर्दा ब्रोकर कमिसन र ७.५% पुँजीगत लाभकर कटाएर पनि नाफा पूर्ण सुरक्षित हुन्छ।</li>

\+                    <li><strong>T+2 राचेट शिल्ड (Ratchet Shield):</strong> T+2 राफसाफपछि नाफा +१.२R पुग्नासाथ स्टप-लस बढाएर Entry \&times; १.०१२ मा सार्नुहोस् जसले गर्दा ब्रोकर कमिसन र ५.०% अल्पकालीन पुँजीगत लाभकर (३.७५% दीर्घकालीन) कटाएर पनि नाफा पूर्ण सुरक्षित हुन्छ।</li>



```



\---



\#### `src/components/Resources.jsx` \& `src/views/StitchHub.jsx` (Fixes `A3-093`)







```diff

\--- a/src/components/Resources.jsx

+++ b/src/components/Resources.jsx

@@ -277,7 +277,7 @@ export default function Resources({ onNavigateTab }) {

&#x20;                  <button 

&#x20;                    type="button"

\-                    onClick={() => openExternalUrl(`https://tms${broker.number}.nepalstock.com.np/`)}

\+                    onClick={() => openExternalUrl(`https://tms${String(broker.number).padStart(2, '0')}.nepalstock.com.np/`)}

&#x20;                    title={`Open Broker #${broker.number} TMS`}



```



```diff

\--- a/src/views/StitchHub.jsx

+++ b/src/views/StitchHub.jsx

@@ -99,9 +99,9 @@ export function StitchHub({ onExit, stocks: rawStocks = \[], indices = null, mark

&#x20;    order: {

&#x20;      ne: `सेयर किनबेच - ${selectedSymbol}`,

\-      subNe: "Himalayan Sec (TMS #58)",

\+      subNe: "Naasa Securities (TMS #58)",

&#x20;      en: `Order Execution - ${selectedSymbol}`,

\-      subEn: "Himalayan Sec (TMS #58)"

\+      subEn: "Naasa Securities (TMS #58)"

&#x20;    }



```



\---



\#### `src/components/PullToRefresh.jsx` (Fixes `A3-094`)







```diff

\--- a/src/components/PullToRefresh.jsx

+++ b/src/components/PullToRefresh.jsx

@@ -16,6 +16,7 @@ export default function PullToRefresh({

&#x20;  const startYRef = useRef(0);

&#x20;  const currentYRef = useRef(0);

&#x20;  const isDraggingRef = useRef(false);

\+  const resetTimerRef = useRef(null);

&#x20;

@@ -63,60 +64,24 @@ export default function PullToRefresh({

&#x20;    if (pullDistance >= PULL\_THRESHOLD \&\& !isRefreshing \&\& onRefresh) {

&#x20;      try {

&#x20;        if (window.navigator?.vibrate) {

&#x20;          window.navigator.vibrate(25);

&#x20;        }

&#x20;      } catch (\_) {}

&#x20;

&#x20;      setPullDistance(50); // Snap to loading height

\-      onRefresh();

\+      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

\+      Promise.resolve()

\+        .then(() => onRefresh())

\+        .catch(() => {})

\+        .finally(() => {

\+          resetTimerRef.current = setTimeout(() => {

\+            setPullDistance(0);

\+          }, 300);

\+        });

&#x20;    } else {

&#x20;      setPullDistance(0);

&#x20;    }

&#x20;  };

&#x20;

\-  // Mouse Drag (Desktop testing support)

\-  const handleMouseDown = (e) => { ... };

\+  useEffect(() => () => {

\+    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

\+  }, \[]);

@@ -143,7 +108,6 @@ export default function PullToRefresh({

&#x20;      onTouchStart={handleTouchStart}

&#x20;      onTouchMove={handleTouchMove}

&#x20;      onTouchEnd={handleTouchEnd}

\-      onMouseDown={handleMouseDown}

&#x20;      style={{



```



Upload `03-ACC3-REM-PART05.txt` next (or let me know if `PART04` was the last file in `audit-bundles\\acc3-remaining\\`) to continue from `A3-100`.
### 1. Files Inspected in This Turn



From `03-ACC3-REM-PART05.txt`:



\* `src\\components\\ShareHubChart.jsx` \*(complete)\*





\* `src\\components\\ShortTermProfitPlan.jsx` \*(complete)\*





\* `src\\components\\SmartAlertBanner.jsx` \*(complete)\*





\* `src\\components\\SubscriptionModal.jsx` \*(complete)\*







\*\*Cross-referenced from earlier turns:\*\* `src\\App.jsx`, `src\\constants\\marketRules.js`, `src\\components\\AdvancedChartModal.jsx`, `src\\context\\SubscriptionContext.jsx`, `src\\components\\Dashboard.jsx`, and `src\\components\\ProGate.jsx`. Zero files were truncated in this attachment.



\---



\### 2. Audit Findings Table (Continuing from `A3-099`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-100\*\* | \*\*P0\*\* | `src/components/ShareHubChart.jsx` (`rawHistory`, `intradayData`, `error`, `hoverData` effects)



&#x20;| When `symbol` changes (or when `Dashboard.jsx` passes `history={\[]}` while loading a new ticker), `rawHistory`, `intradayData`, `error`, and `hoverData` are never cleared. `processedChartData` then grafts the new `stock.ltp` onto the previous symbol's last bar.



&#x20;| Rapidly switching stocks in `AdvancedChartModal` or the Dashboard Hero Chart displays \*\*Stock A's price history and crosshair OHLC under Stock B's symbol\*\*, or leaves Stock A's chart stuck on screen if Stock B's history fetch fails.



&#x20;| Clear `rawHistory` (when `history` prop is empty), `intradayData`, `error`, and `hoverData` whenever `symbol` changes, and guard `loadData`/`loadIntraday` with an incrementing request ref. |

| \*\*A3-101\*\* | \*\*P0\*\* | `src/components/ShortTermProfitPlan.jsx` (Position Sizing Math, `netRiskLoss`, `handleApplyHalfKelly`)



&#x20;| (1) `riskPerShare = Math.max(0.5, entryPrice - stopLossPrice)` clamps inverted stops (`stopLossPrice >= entryPrice`) to Rs. 0.50. (2) `calculatedQuantity` never caps against `totalCapital` or round-trip NEPSE buy/sell fees. (3) `netRiskLoss = Math.abs(stopLossSellCalculations.netProfitLoss)` turns a profitable trailing stop into a fake loss. (4) `handleApplyHalfKelly` divides by `entryPrice` without a `> 0` check and does not round to NEPSE 10-kitta lots.



&#x20;| Entering an inverted stop recommends massive leverage (e.g., 4,000 shares = Rs. 20L on Rs. 1L capital); tight stops recommend buying more than `totalCapital`; actual loss at stop breaches the user's `riskPercent` cap; Half-Kelly recommends unexecutable odd lots or `Infinity` shares.



&#x20;| Clamp `calculatedQuantity = 0` when `entryPrice <= stopLossPrice` or `entryPrice <= 0`, cap quantity by `totalCapital` and round-trip fees/DP, compute `netRiskLoss = Math.max(0, -stopLossSellCalculations.netProfitLoss)`, and round Half-Kelly lots down to multiples of 10 kitta. |

| \*\*A3-102\*\* | \*\*P0\*\* | `src/components/ShortTermProfitPlan.jsx` (`evaluateShortTermCriteria` -> `vsr` \& Calculator Fees Breakdown)



&#x20;| (1) Displays outdated `Short-Term CGT (7.5% - 10.0% Final Tax)` label instead of Nepal's `5.0%` ST ($\\le 365\\text{d}$) / `3.75%` LT ($> 365\\text{d}$) rates effective 22 Sept 2026 (31 Bhadra 2083). (2) Fabricates `vsr = vol > 15000 ? 1.4 : vol > 4000 ? 1.15 : 0.95` when `stock.volumeSurgeRatio` is missing.



&#x20;| Investors see obsolete CGT rules, and high-float liquid stocks (e.g., 16,000 shares on a quiet day) receive a fabricated `1.4x` RVOL surge—falsely passing Gate 3 (`Volume Surge`) and inflating `Plan Score` by +10 points.



&#x20;| Update CGT label to `Short-Term CGT (5.0% ≤365d / 3.75% >365d)` and compute `vsr` strictly from verified `volumeSurgeRatio`/`rvol` or `vol / 20D avg volume` from `cachedHistory` (falling back to `null`, never fabricated `1.4x`). |

| \*\*A3-103\*\* | \*\*P1\*\* | `src/components/ShortTermProfitPlan.jsx` (`evaluateShortTermCriteria` -> Sector RS \& `activePlans` P\&L)



&#x20;| Cross-file contract mismatch with `App.jsx` and `Dashboard.jsx`: iterates top-level keys of `indices` (`for (const k in indices)`) instead of `indices.subIndices` array, so `sectorChange` is always `0`. Also `activePlans` divides by `plan.entryPrice` without `> 0` check.



&#x20;| Gate 5 (`Sector Relative Strength`) is completely inverted: on green NEPSE days every sector looks like a laggard (`sectorChange = 0`), and on red NEPSE days every sector looks like a leader. Zero `entryPrice` produces `NaN%` in Active Plans.



&#x20;| Search `Array.isArray(indices?.subIndices)` by `s.index`/`s.name` before falling back to top-level keys, and guard `plan.entryPrice > 0` in `activePlans`. |

| \*\*A3-104\*\* | \*\*P1\*\* | `src/components/ShareHubChart.jsx` (`patternMarkers`, `rsi\_scale`, `isIndividualStock` toggles)



&#x20;| (1) `patternMarkers` formats numeric timestamps with `.toISOString().slice(0, 10)` (UTC) whereas `processedChartData` uses `formatNptDate` (`Asia/Kathmandu`). (2) `rsi\_scale` sets `autoScale: false` without `autoscaleInfoProvider`. (3) `showVwap`/`showTradePlan`/`showInstVwap`/`showPoc` initialize only on mount.



&#x20;| Candlestick pattern arrows attach 1 trading day early on midnight-NPT candles; RSI sub-pane vertical scale fails to lock to 0–100; switching Hero Chart from NEPSE Index to a stock leaves VWAP/Trade Plan overlays disabled.



&#x20;| Use `formatNptDate(new Date(ts \* 1000))` in `patternMarkers`, add `autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } })` with `autoScale: true` on `rsiSeries`, and sync overlay defaults when `isIndividualStock` changes. |

| \*\*A3-105\*\* | \*\*P1\*\* | `src/components/SmartAlertBanner.jsx` (`ltp` coercion \& click/dismiss timer)



&#x20;| `Number(activeAlert.ltp |  | 0)`evaluates to`NaN`for non-numeric strings (e.g.,`"N/A"`) and renders `NPR 0.00`for alerts without a price; closing or clicking the banner does not clear`timerRef.current`.



&#x20;|

| \*\*A3-106\*\* | \*\*P1\*\* | `src/components/SubscriptionModal.jsx` (Missing `useBackHandler`, ignored `modalInitialPlan` \& `isLifetime`, stale modal state)



&#x20;| Cross-file mismatch with `SubscriptionContext.jsx` and `App.jsx`: (1) Does not register `useBackHandler`. (2) Ignores `modalInitialPlan` (always defaults to `'1m'`). (3) Ignores `isLifetime`, rendering `Expires: ... · days remaining` for Lifetime Pro users. (4) Never clears `promoMessage`, `showCancelConfirm`, `showDevPanel`, or `generatedKey` when closed.



&#x20;| Pressing Android Back exits/navigates behind the open modal; clicking a `3m`/`6m` ProGate always opens `1m`; Lifetime users see broken expiry copy; reopening the modal leaks old admin key/error states.



&#x20;| Register `useBackHandler` on `isModalOpen`, sync `selectedPlanId` to `modalInitialPlan`, display `'Lifetime Unlimited Access'` when `isLifetime` is true, and reset transient UI/admin states on close. |

| \*\*A3-107\*\* | \*\*P2\*\* | `src/components/ShortTermProfitPlan.jsx` (`playbook\_7\_15d`, Day 3–7 Protocol, `copySwingBlueprint`)



&#x20;| Instructs moving Stop-Loss to `"entry price (breakeven)"` instead of statutory breakeven (`entry + round-trip NEPSE fees/DP`); `navigator.clipboard.writeText(text)` has no `.catch()`.



&#x20;| Moving SL to raw entry price still incurs a \~0.85–1.5% net fee loss on NEPSE if stopped out.



&#x20;| Display exact `statutoryBreakeven` (`buyCalculations.costPerShare` + sell fees) and attach `.catch(() => {})` to clipboard copy. |

| \*\*A3-108\*\* | \*\*P2\*\* | `src/components/ShareHubChart.jsx` (`hudMetrics.isBull`, `createChart` deps)



&#x20;| `c === 0 \&\& pc >= 0` styles flat `0.00%` unchanged scrips in bullish green with `▲ +0.00`; `createChart` `useEffect` omits `stock`, `activeTf`, and `currencyPrefix` from its dependency array.



&#x20;| Unchanged stocks appear artificially green, and changing `prevClose`/`currencyPrefix` without history change can leave stale price lines.



&#x20;| Use neutral slate styling when `c === 0 \&\& pc === 0` (omitting `▲ +`) and include `stock?.prevClose`, `activeTf`, and `currencyPrefix` in the chart effect dependencies. |

| \*\*A3-109\*\* | \*\*P3\*\* | `src/components/ShortTermProfitPlan.jsx`, `src/components/SubscriptionModal.jsx`



&#x20;| Unused imports (`getCumulativeBrokerData`, `fetchPriceHistory`, `calculateRelativeStrength`, `openStockDetail`) in `ShortTermProfitPlan.jsx`; bare `setTimeout` toast/copy timers lack unmount cleanup in both files.



&#x20;| Minor bundle clutter and unmount state-update hygiene.



&#x20;| Remove unused imports and clear timeout refs on unmount. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/components/ShareHubChart.jsx` (Fixes `A3-100`, `A3-104`)







```diff

\--- a/src/components/ShareHubChart.jsx

+++ b/src/components/ShareHubChart.jsx

@@ -148,6 +148,8 @@ export default function ShareHubChart({

&#x20;  const chartRef = useRef(null);

&#x20;  const mainSeriesRef = useRef(null);

&#x20;  const volumeSeriesRef = useRef(null);

\+  const historyReqRef = useRef(0);

\+  const intradayReqRef = useRef(0);

&#x20;

&#x20;  const activeIsFullscreen = Boolean(isFullscreen);

&#x20;

@@ -194,20 +196,42 @@ export default function ShareHubChart({

&#x20;    if (mode) setActiveMode(mode);

&#x20;  }, \[mode]);

&#x20;

\+  // Reset ticker-scoped state immediately on symbol change to prevent cross-ticker chart leaks

\+  useEffect(() => {

\+    setIntradayData(\[]);

\+    setHoverData(null);

\+    setError(null);

\+    if (!Array.isArray(history) || history.length === 0) {

\+      setRawHistory(\[]);

\+    }

\+  }, \[symbol]);

\+

\+  // Sync stock-only overlay defaults when switching between NEPSE Index and an individual stock

\+  useEffect(() => {

\+    setShowVwap(isIndividualStock);

\+    setShowTradePlan(isIndividualStock);

\+    setShowInstVwap(isIndividualStock);

\+    setShowPoc(isIndividualStock);

\+  }, \[isIndividualStock]);

\+

&#x20;  useEffect(() => {

&#x20;    if (Array.isArray(history) \&\& history.length > 0) {

&#x20;      setRawHistory(history);

&#x20;      setLoading(false);

&#x20;      setError(null);

\+    } else if (Array.isArray(history) \&\& history.length === 0) {

\+      setRawHistory(\[]);

&#x20;    }

&#x20;  }, \[history]);

&#x20;

&#x20;  useEffect(() => {

&#x20;    if (Array.isArray(history) \&\& history.length > 0) {

&#x20;      setLoading(false);

&#x20;      return;

&#x20;    }

&#x20;    if (!symbol) return;

&#x20;

&#x20;    let isMounted = true;

\+    const reqId = ++historyReqRef.current;

&#x20;    setLoading(true);

\+    setError(null);

&#x20;

&#x20;    async function loadData() {

&#x20;      try {

&#x20;        const cleanSymbol = (symbol === 'NEPSE Index' || symbol === 'nepse') ? 'NEPSE' : symbol;

&#x20;        const data = await fetchRealPriceHistory(cleanSymbol, 500);

\-        if (!isMounted) return;

\+        if (!isMounted || reqId !== historyReqRef.current) return;

&#x20;        if (!data || data.length === 0) {

&#x20;          throw new Error('No historical records found for ' + cleanSymbol);

&#x20;        }

&#x20;        setRawHistory(data);

&#x20;        setError(null);

&#x20;      } catch (err) {

\-        if (isMounted) setError(err.message);

\+        if (isMounted \&\& reqId === historyReqRef.current) setError(err.message);

&#x20;      } finally {

\-        if (isMounted) setLoading(false);

\+        if (isMounted \&\& reqId === historyReqRef.current) setLoading(false);

&#x20;      }

&#x20;    }

&#x20;    loadData();

@@ -249,13 +273,14 @@ export default function ShareHubChart({

&#x20;    }

&#x20;

&#x20;    let isMounted = true;

\+    const reqId = ++intradayReqRef.current;

&#x20;    if (rawHistory.length === 0) setLoading(true);

&#x20;

&#x20;    async function loadIntraday() {

&#x20;      try {

&#x20;        const cleanSymbol = (symbol === 'NEPSE Index' || symbol === 'nepse' || !symbol) ? 'NEPSE' : symbol;

&#x20;        const res = await fetchNepseIntradayGraph(cleanSymbol);

\-        if (!isMounted) return;

\+        if (!isMounted || reqId !== intradayReqRef.current) return;

&#x20;        if (res \&\& Array.isArray(res) \&\& res.length > 0) {

&#x20;          setIntradayData(res);

&#x20;          setError(null);

@@ -264,9 +289,9 @@ export default function ShareHubChart({

&#x20;        }

&#x20;      } catch (err) {

&#x20;        console.warn('\[ShareHubChart] Intraday fetch error:', err);

\-        if (isMounted) setIntradayData(\[]);

\+        if (isMounted \&\& reqId === intradayReqRef.current) setIntradayData(\[]);

&#x20;      } finally {

\-        if (isMounted) setLoading(false);

\+        if (isMounted \&\& reqId === intradayReqRef.current) setLoading(false);

&#x20;      }

&#x20;    }

@@ -549,12 +574,12 @@ export default function ShareHubChart({

&#x20;        } else {

&#x20;          if (typeof time === 'number') {

&#x20;            const ts = time > 1e11 ? Math.floor(time / 1000) : time;

\-            time = new Date(ts \* 1000).toISOString().slice(0, 10);

\+            time = formatNptDate(new Date(ts \* 1000));

&#x20;          } else if (typeof time === 'string') {

&#x20;            const trimmed = time.trim();

&#x20;            if (/^\\d{9,12}$/.test(trimmed)) {

&#x20;              const ts = parseInt(trimmed, 10);

\-              time = new Date(ts \* 1000).toISOString().slice(0, 10);

\+              time = formatNptDate(new Date(ts \* 1000));

&#x20;            } else {

&#x20;              time = trimmed.slice(0, 10);

&#x20;            }

@@ -841,11 +866,12 @@ export default function ShareHubChart({

&#x20;        const rsiSeries = chart.addSeries(LineSeries, {

&#x20;          color: '#f472b6',

&#x20;          lineWidth: 1.5,

&#x20;          title: 'RSI(14)',

&#x20;          priceScaleId: 'rsi\_scale',

\-          priceFormat: { type: 'price', precision: 1, minMove: 0.1 }

\+          priceFormat: { type: 'price', precision: 1, minMove: 0.1 },

\+          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } })

&#x20;        });

&#x20;        chart.priceScale('rsi\_scale').applyOptions({

&#x20;          scaleMargins: safeScaleMargins(rsiTop, rsiBottom),

\-          autoScale: false,

\+          autoScale: true,

&#x20;        });



```



\---



\#### `src/components/ShortTermProfitPlan.jsx` (Fixes `A3-101`, `A3-102`, `A3-103`)







```diff

\--- a/src/components/ShortTermProfitPlan.jsx

+++ b/src/components/ShortTermProfitPlan.jsx

@@ -74,7 +74,17 @@ export function evaluateShortTermCriteria(stock = {}, indices = {}) {

&#x20;  const eps = rawEps !== undefined \&\& rawEps !== null ? Number(rawEps) : null;

&#x20;  const rawBv = cachedFund?.bookValue !== undefined \&\& cachedFund?.bookValue !== null ? cachedFund.bookValue : (stock.bookValue ?? stock.bvps);

&#x20;  const bookValue = rawBv !== undefined \&\& rawBv !== null ? Number(rawBv) : null;

\-  const vsr = Number(stock.volumeSurgeRatio || (vol > 15000 ? 1.4 : vol > 4000 ? 1.15 : 0.95));

\+  // Compute true RVOL/VSR from verified feed or 20D historical average volume (never fabricate 1.4x from raw vol)

\+  const cachedHistForVol = stock.history || stock.candles || getCachedRealPriceHistory(sym);

\+  let computedVsr = Number(stock.volumeSurgeRatio || stock.rvol || 0);

\+  if (computedVsr <= 0 \&\& vol > 0 \&\& Array.isArray(cachedHistForVol) \&\& cachedHistForVol.length >= 5) {

\+    const recentVols = cachedHistForVol.slice(-21, -1).map(c => Number(c.volume || 0)).filter(v => v > 0);

\+    if (recentVols.length >= 5) {

\+      const avg20Vol = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;

\+      if (avg20Vol > 0) computedVsr = +(vol / avg20Vol).toFixed(2);

\+    }

\+  }

\+  const vsr = computedVsr > 0 ? computedVsr : 1.0;

@@ -134,12 +144,21 @@ export function evaluateShortTermCriteria(stock = {}, indices = {}) {

&#x20;  // 2. Sector Relative Strength (RS) vs NEPSE Benchmark (P1)

&#x20;  const secKey = sectorName.toLowerCase().replace(/\[^a-z0-9]/g, '');

&#x20;  let sectorChange = 0;

&#x20;  if (indices \&\& typeof indices === 'object') {

\-    for (const k in indices) {

\-      const normK = k.toLowerCase().replace(/\[^a-z0-9]/g, '');

\-      if (normK.includes(secKey) || secKey.includes(normK)) {

\-        sectorChange = Number(indices\[k]?.pChange ?? indices\[k]?.changePercent ?? 0);

\-        break;

\+    // Match live indices.subIndices array first (contract from App.jsx \& Dashboard.jsx)

\+    const subList = Array.isArray(indices.subIndices) ? indices.subIndices : \[];

\+    const matchedSub = subList.find(s => {

\+      const normS = String(s?.index || s?.name || '').toLowerCase().replace(/\[^a-z0-9]/g, '');

\+      return normS \&\& secKey \&\& (normS.includes(secKey) || secKey.includes(normS));

\+    });

\+    if (matchedSub) {

\+      sectorChange = Number(matchedSub.pChange ?? matchedSub.changePercent ?? 0);

\+    } else {

\+      for (const k in indices) {

\+        if (k === 'subIndices') continue;

\+        const normK = k.toLowerCase().replace(/\[^a-z0-9]/g, '');

\+        if (normK \&\& secKey \&\& (normK.includes(secKey) || secKey.includes(normK))) {

\+          sectorChange = Number(indices\[k]?.pChange ?? indices\[k]?.changePercent ?? 0);

\+          break;

\+        }

&#x20;      }

&#x20;    }

&#x20;  }

@@ -487,11 +506,19 @@ export default function ShortTermProfitPlan({

&#x20;    : Number(activeStock?.target1 || (entryPrice \* 1.08).toFixed(1));

&#x20;

\-  // Risk \& Position Sizing Math

\-  const riskPerShare = Math.max(0.5, +(entryPrice - stopLossPrice).toFixed(1));

\-  const riskAmount = (Number(totalCapital) \* (Number(riskPercent) / 100)); // e.g. 100,000 \* 2% = Rs. 2,000

\-  const rawQty = Math.floor(riskAmount / riskPerShare);

\-  const calculatedQuantity = Math.max(10, Math.floor(rawQty / 10) \* 10);

\+  // Risk \& Position Sizing Math (Stop-Inversion Guard + Round-Trip Friction + Capital Ceiling)

\+  const isStopValid = Number.isFinite(entryPrice) \&\& entryPrice > 0 \&\& Number.isFinite(stopLossPrice) \&\& stopLossPrice > 0 \&\& stopLossPrice < entryPrice;

\+  const riskAmount = Math.max(0, Number(totalCapital) \* (Number(riskPercent) / 100));

\+  const estSlabRate = totalCapital <= 50000 ? 0.0036 : totalCapital <= 500000 ? 0.0033 : totalCapital <= 2000000 ? 0.0031 : 0.0027;

\+  const effectiveRiskPerShare = isStopValid

\+    ? (entryPrice - stopLossPrice) + ((entryPrice + stopLossPrice) \* (estSlabRate + 0.00015))

\+    : 0;

\+  const maxQtyByRisk = isStopValid \&\& effectiveRiskPerShare > 0

\+    ? Math.floor(Math.max(0, riskAmount - 50) / effectiveRiskPerShare)

\+    : 0;

\+  const maxQtyByCapital = isStopValid

\+    ? Math.floor(Math.max(0, Number(totalCapital) - 25) / (entryPrice \* (1 + estSlabRate + 0.00015)))

\+    : 0;

\+  const boundedQty = Math.min(maxQtyByRisk, maxQtyByCapital);

\+  const calculatedQuantity = boundedQty >= 10 ? Math.floor(boundedQty / 10) \* 10 : 0;

&#x20;  const quantity = customQuantity !== null ? Number(customQuantity) : calculatedQuantity;

@@ -514,7 +541,7 @@ export default function ShortTermProfitPlan({

&#x20;  const netTakeHomePct = buyCalculations.totalAmount > 0

&#x20;    ? ((netTakeHomeProfit / buyCalculations.totalAmount) \* 100)

&#x20;    : 0;

&#x20;

\-  const netRiskLoss = Math.abs(stopLossSellCalculations.netProfitLoss);

\+  const netRiskLoss = quantity > 0 ? Math.max(0, -Number(stopLossSellCalculations.netProfitLoss || 0)) : 0;

&#x20;  const netRiskPct = buyCalculations.totalAmount > 0

&#x20;    ? ((netRiskLoss / buyCalculations.totalAmount) \* 100)

&#x20;    : 0;

@@ -540,9 +567,10 @@ export default function ShortTermProfitPlan({

&#x20;  // Apply Half-Kelly Sizing Handler

&#x20;  const handleApplyHalfKelly = () => {

\-    if (kellyData.halfKellyPct > 0) {

\+    if (kellyData.halfKellyPct > 0 \&\& entryPrice > 0) {

&#x20;      const kellyCapital = totalCapital \* (kellyData.halfKellyPct / 100);

\-      const kellyShares = Math.max(10, Math.floor(kellyCapital / entryPrice));

\+      const rawKellyShares = Math.floor(Math.max(0, kellyCapital - 25) / (entryPrice \* 1.004));

\+      const kellyShares = rawKellyShares >= 10 ? Math.floor(rawKellyShares / 10) \* 10 : 0;

&#x20;      setCustomQuantity(kellyShares);

&#x20;      setPlanSaveToast(`Applied Half-Kelly Sizing: ${kellyData.halfKellyPct}% Capital (${kellyShares} shares)`);

&#x20;      setTimeout(() => setPlanSaveToast(null), 3500);

@@ -994,7 +1022,7 @@ export default function ShortTermProfitPlan({

&#x20;                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>

\-                    <span>Short-Term CGT (7.5% - 10.0% Final Tax):</span>

\+                    <span>Short-Term CGT (5.0% \&le;365d / 3.75% \&gt;365d):</span>

&#x20;                    <span>Rs. {(Number(target1SellCalculations?.cgt) || 0).toFixed(2)}</span>

&#x20;                  </div>

@@ -1369,7 +1397,7 @@ export default function ShortTermProfitPlan({

&#x20;              {activePlans.map(plan => {

&#x20;                const liveStock = stocks.find(s => String(s.symbol || '').toUpperCase() === plan.symbol);

&#x20;                const currentPrice = Number(liveStock?.ltp || liveStock?.closePrice || plan.entryPrice);

\-                const currentDiffPct = ((currentPrice - plan.entryPrice) / plan.entryPrice) \* 100;

\+                const currentDiffPct = Number(plan.entryPrice) > 0 ? ((currentPrice - Number(plan.entryPrice)) / Number(plan.entryPrice)) \* 100 : 0;



```



\---



\#### `src/components/SmartAlertBanner.jsx` (Fixes `A3-105`)







```diff

\--- a/src/components/SmartAlertBanner.jsx

+++ b/src/components/SmartAlertBanner.jsx

@@ -26,13 +26,15 @@ export function SmartAlertBanner({ onOpenCard }) {

&#x20;  if (!visible || !activeAlert || !activeAlert.symbol) return null;

&#x20;

&#x20;  const sym = activeAlert.symbol;

\-  const ltp = Number(activeAlert.ltp || 0);

\+  const parsedLtp = Number(activeAlert.ltp);

\+  const hasValidLtp = Number.isFinite(parsedLtp) \&\& parsedLtp > 0;

&#x20;

&#x20;  return (

&#x20;    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-\[94%] max-w-md animate-in slide-in-from-top-4 duration-300">

&#x20;      <div 

&#x20;        onClick={() => {

\+          if (timerRef.current) clearTimeout(timerRef.current);

&#x20;          setVisible(false);

&#x20;          if (onOpenCard) onOpenCard(activeAlert);

&#x20;        }}

@@ -47,7 +49,9 @@ export function SmartAlertBanner({ onOpenCard }) {

&#x20;              <span className="text-\[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">

&#x20;                Institutional Entry

&#x20;              </span>

\-              <span className="text-xs font-mono font-semibold text-emerald-400">NPR {ltp.toFixed(2)}</span>

\+              {hasValidLtp \&\& (

\+                <span className="text-xs font-mono font-semibold text-emerald-400">NPR {parsedLtp.toFixed(2)}</span>

\+              )}

&#x20;            </div>

&#x20;            <p className="text-xs text-slate-300 truncate mt-0.5">

&#x20;              {activeAlert.dominantBrokersText || activeAlert.body || 'Smart Money Flow detected'}

@@ -61,6 +65,7 @@ export function SmartAlertBanner({ onOpenCard }) {

&#x20;          <button

&#x20;            onClick={(e) => {

&#x20;              e.stopPropagation();

\+              if (timerRef.current) clearTimeout(timerRef.current);

&#x20;              setVisible(false);

&#x20;            }}



```



\---



\#### `src/components/SubscriptionModal.jsx` (Fixes `A3-106`)







```diff

\--- a/src/components/SubscriptionModal.jsx

+++ b/src/components/SubscriptionModal.jsx

@@ -27,21 +27,24 @@ import {

&#x20;} from 'lucide-react';

&#x20;import { useSubscription } from '../context/SubscriptionContext';

+import { useBackHandler } from '../context/NavigationContext';

&#x20;import { PRO\_PLANS } from '../utils/subscription';

&#x20;import { cleanDeviceId, formatDeviceId, generateLicenseKeyOnServer } from '../utils/licenseEngine';

&#x20;import { openExternalUrl } from '../utils/externalLinks';

&#x20;

&#x20;export default function SubscriptionModal() {

&#x20;  const {

&#x20;    isPro,

\+    isLifetime,

&#x20;    daysRemaining,

&#x20;    formattedExpiry,

&#x20;    planDuration,

&#x20;    deviceId,

\+    modalInitialPlan,

&#x20;    isModalOpen,

&#x20;    closeSubscriptionModal,

&#x20;    lockedFeatureName,

&#x20;    redeemCode,

&#x20;    cancelPlan

&#x20;  } = useSubscription();

&#x20;

\-  const \[selectedPlanId, setSelectedPlanId] = useState('1m');

\+  const \[selectedPlanId, setSelectedPlanId] = useState(() => modalInitialPlan || '1m');

@@ -64,12 +67,25 @@ export default function SubscriptionModal() {

&#x20;    }

&#x20;  }, \[deviceId, devTargetId]);

&#x20;

\+  useEffect(() => {

\+    if (isModalOpen \&\& modalInitialPlan) {

\+      setSelectedPlanId(modalInitialPlan);

\+    }

\+  }, \[isModalOpen, modalInitialPlan]);

\+

&#x20;  useEffect(() => {

&#x20;    if (!isModalOpen) {

&#x20;      setDevAdminKey('');

&#x20;      setDevError(null);

\+      setPromoMessage(null);

\+      setShowCancelConfirm(false);

\+      setShowDevPanel(false);

\+      setGeneratedKey(null);

&#x20;    }

&#x20;  }, \[isModalOpen]);

&#x20;

\+  useBackHandler(() => {

\+    closeSubscriptionModal();

\+    return true;

\+  }, isModalOpen, 80);

\+

&#x20;  if (!isModalOpen) return null;

@@ -290,10 +306,12 @@ export default function SubscriptionModal() {

&#x20;                <span style={{ fontSize: 13, fontWeight: 800, color: isPro ? '#10B981' : 'var(--text-secondary)' }}>

\-                  {isPro ? `Active Pro (${planDuration || 'Monthly'})` : 'Free Plan (Pro Locked)'}

\+                  {isPro ? `Active Pro (${isLifetime ? 'Lifetime' : (planDuration || 'Monthly')})` : 'Free Plan (Pro Locked)'}

&#x20;                </span>

&#x20;              </div>

&#x20;              {isPro ? (

&#x20;                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>

\-                  Expires: <strong style={{ color: '#fff' }}>{formattedExpiry}</strong> · <strong style={{ color: '#10B981' }}>{daysRemaining} days remaining</strong>

\+                  {isLifetime ? (

\+                    <strong style={{ color: '#10B981' }}>Lifetime Unlimited Access</strong>

\+                  ) : (

\+                    <>Expires: <strong style={{ color: '#fff' }}>{formattedExpiry}</strong> · <strong style={{ color: '#10B981' }}>{daysRemaining} days remaining</strong></>

\+                  )}

&#x20;                </div>

&#x20;              ) : (



```



Upload `03-ACC3-REM-PART06.txt` next (or let me know if there are any remaining chunks) to continue from `A3-110`.
### 1. Files Inspected in This Turn



From `03-ACC3-REM-PART06.txt`:



\* `src\\components\\swing\\SwingTradeSelectorView.tsx` \*(complete)\*





\* `src\\components\\TestSuite.jsx` \*(complete)\*





\* `src\\components\\ui.tsx` \*(complete)\*





\* `src\\components\\WatchlistEntryAlertModal.tsx` \*(complete)\*







\*\*Cross-referenced from earlier turns:\*\* `src\\App.jsx`, `src\\constants\\marketRules.js`, `src\\components\\BreakoutAlertDialog.jsx`, and `src\\components\\Dashboard.jsx`. Zero files were truncated in this attachment.



\---



\### 2. Audit Findings Table (Continuing from `A3-109`)



| Bug ID | Severity | File \& Function/Line | Root Cause | Real Investor Impact | Exact Minimal Fix |

| --- | --- | --- | --- | --- | --- |

| \*\*A3-110\*\* | \*\*P0\*\* | `src/components/swing/SwingTradeSelectorView.tsx` (`marketContext`, Verdict Banner, Gate 2 card, Paper-Trading tab)



&#x20;| (1) Computes `pctAboveEma50` as `Math.round((adv / total) \* 100)` (1-day advancers %) instead of stocks trading above their 50-day EMA. (2) Hardcodes `"20 \& 50 EMA Support"` on the Gate 2 card regardless of actual index trend. (3) Hardcodes outdated `7.5% CGT` in both the Fiduciary Verdict Banner and Paper-Trading Mode description.



&#x20;| On a 1-day bear-market bounce, `pctAboveEma50` falsely reports bullish breadth and approves Gate 2 (Market Regime Gate) while the index is still below 50 EMA; investors also see outdated `7.5%` individual ST CGT instead of Nepal's `5.0%` ST ($\\le 365\\text{d}$) / `3.75%` LT ($> 365\\text{d}$) rates.



&#x20;| Compute `pctAboveEma50` strictly from equities with verified `ema50`/`sma50` (`ltp > ema50`, defaulting to `0` if unavailable so Gate 2 stays defensive); derive Index Trend text from `nepseIndex` vs `nepseEma20`/`nepseEma50`; update CGT text to `5.0% ST / 3.75% LT CGT`. |

| \*\*A3-111\*\* | \*\*P1\*\* | `src/components/swing/SwingTradeSelectorView.tsx` (Backtest metrics, `displayStocks` rendering, unused props)



&#x20;| (1) Hardcodes `40 closed trades`, `0.45x`, `-Rs. 226,739.06`, and `-Rs. 854k` in prose and hardcodes a literal minus sign (`-Rs.`) before `Math.abs(netPnLNpr)` in Tab 2. (2) Runs `evaluateStockSwingGates` unmemoized inside `.map()` for all 250+ equities on every render. (3) Destructures `onSelectStock` and `onBack` without wiring them; renders unguarded `stock.pChange` (`null`/`undefined`).



&#x20;| If `swingBacktestResults.json` updates to a positive edge, the UI still renders a minus sign `-Rs.` and stale hardcoded verdict figures; searching/expanding cards lags on mobile; users cannot click through to Stock Details or Back.



&#x20;| Format Net PnL with dynamic sign (`val >= 0 ? '+' : '-'`) and read Verdict Banner numbers from `backtest.fullSystem`; memoize `evaluatedStocks`; wire `onSelectStock`/`onBack` buttons and coerce `Number(stock.pChange || 0)`. |

| \*\*A3-112\*\* | \*\*P0\*\* | `src/components/TestSuite.jsx` (`runAllTests` -> Test 2)



&#x20;| Asserts outdated Nepal individual CGT rates (`7.5%` ST -> `expectedShortCGT = 367.50`, `expectedShortReceivable = 19532.50`; `5.0%` LT -> `expectedLongCGT = 245.0`, `expectedLongReceivable = 19655.0`).



&#x20;| Built-in Diagnostics Sandbox rejects compliant Nepal CGT calculations effective 22 Sept 2026 (`5.0%` ST = Rs. 245.00 / receivable Rs. 19,655.00; `3.75%` LT = Rs. 183.75 / receivable Rs. 19,716.25) as `"Error Alert"`.



&#x20;| Update Test 2 assertions and log text to `5.0%` ST (`245.00` / `19655.00`) and `3.75%` LT (`183.75` / `19716.25`), plus verify `10.0%` corporate (`490.00` / `19410.00`). |

| \*\*A3-113\*\* | \*\*P1\*\* | `src/components/TestSuite.jsx` (CDSC toggle, `runAllTests` fetch \& lifecycle)



&#x20;| Cross-file contract mismatch with `App.jsx` and `Dashboard.jsx`: `setApiStatus(prev => prev === 'online' ? 'offline' : 'online')` sets `'online'` instead of `'live'`. Also Tests 6 \& 7 call `.json()` directly without checking `res.ok`, `runAllTests` lacks an `isMountedRef` guard across async waits, and `addLog` omits `Asia/Kathmandu` timezone.



&#x20;| Toggling CDSC status in Diagnostics sets `apiStatus = 'online'`, breaking `'live'` checks in `App.jsx` and `Dashboard.jsx` so live badges regress to `"Closing Snapshot"` / `"Cached"`; HTML proxy errors crash Tests 6 \& 7.



&#x20;| Toggle `apiStatus` between `'live'` and `'offline'`; parse Test 6 \& 7 responses via safe text-then-JSON checks; guard `addLog`/state updates with `isMountedRef` and format log timestamps in `Asia/Kathmandu`. |

| \*\*A3-114\*\* | \*\*P0\*\* | `src/components/ui.tsx` (`SourceBar`, `TimeframeFilterBar`)



&#x20;| (1) `TimeframeFilterBar` defaults `isLive = true`, displaying a pulsing green dot and `(Live Session)` whenever callers omit `isLive`. (2) Both `SourceBar` and `TimeframeFilterBar` stamp `new Date().toLocaleTimeString()` in local browser timezone on every render when `asOf` is absent.



&#x20;| Investors viewing cached, off-hours, or weekend screener tables see a pulsing green `(Live Session)` indicator and a fabricated `"Updated <current second>"` wall-clock timestamp.



&#x20;| Default `isLive = false` in `TimeframeFilterBar`; require explicit `asOf`/`updatedAt` props formatted in `Asia/Kathmandu` NPT (displaying `'Timestamp unavailable'` or `'Session Closed'` rather than `new Date()`). |

| \*\*A3-115\*\* | \*\*P1\*\* | `src/components/ui.tsx` (`StockSearchSelect` -> price fallback \& `handleClickOutside`)



&#x20;| (1) When `stocks` prop is empty/omitted, dropdown renders `stock.basePrice` (stale `nepseUniverse` price or hardcoded `Rs. 100` for every `stockmap.json` entry) with no `"Est."` label. (2) `handleClickOutside` binds only `mousedown`, not `touchstart`.



&#x20;| Users searching stocks in modals like `WatchlistEntryAlertModal` see fake `Rs. 100` prices next to real equities; on mobile Capacitor/WebView, tapping outside fails to close the dropdown.



&#x20;| Display price in `StockSearchSelect` strictly from `livePriceMap` (omit or mark `—` when live `stocks` are not provided); attach `touchstart` alongside `mousedown` in `handleClickOutside`. |

| \*\*A3-116\*\* | \*\*P0\*\* | `src/components/WatchlistEntryAlertModal.tsx` (`handleAddStock`, `activeAlertItems`)



&#x20;| (1) When `marketQuotes\[sym]` is missing or `0`, `activeAlertItems` falls back `ltp = cfg.entryZone?.\[0] || 0`, causing `inEntryZone`, `nearStopLoss`, `target1Reached`, and `target2Reached` to ALL evaluate `true` on `Rs. 0` or offline quotes. (2) `handleAddStock` saves `\[0, 0]` levels when quotes are unloaded, sets `entryZone` bracketing current `ltp` (immediately firing on add), and overwrites `BreakoutAlertDialog`'s `breakoutPrice`/`rvolThreshold` fields.



&#x20;| Offline or unloaded feeds trigger simultaneous fake `🎯 Inside Entry Zone!`, `🛑 Near Stop Loss!`, and `🚀 Target 2 Reached!` alerts with chime + vibration; adding a stock here wipes breakout triggers saved in `BreakoutAlertDialog`.



&#x20;| Require `marketQuotes\[sym] > 0` (show `"Awaiting Live Quote"` when offline, never fall back to `entryZone\[0]`); block saving zero levels in `handleAddStock`; merge with existing `configs\[s]` so `breakoutPrice`/`rvolThreshold` are preserved. |

| \*\*A3-117\*\* | \*\*P1\*\* | `src/components/WatchlistEntryAlertModal.tsx` (Export mismatch, `reloadData`, chime loop, unused `onSelectStock`)



&#x20;| (1) Cross-file mismatch with `Dashboard.jsx`: imports `removeWatchlistAlertConfig` instead of `deleteWatchlistAlertConfig`. (2) `handleToggle`/`handleRemove`/`handleAddStock` call `reloadData()`, re-fetching the entire NEPSE market feed on every click. (3) `reloadData` leaks a 4s `setTimeout` without `isMounted` guard. (4) Audio chime `useEffect` replays on every state update without deduplication. (5) `onSelectStock` is unused and `<StockSearchSelect>` receives no live `stocks`.



&#x20;| Clicking Delete can crash if `removeWatchlistAlertConfig` is not exported; toggling an alert hammers the proxy and repeatedly rings the audio chime; clicking a stock symbol does nothing.



&#x20;| Use `deleteWatchlistAlertConfig` (matching `Dashboard.jsx`); update local `configs` state directly on add/toggle/delete without re-fetching market data; clear timeout + guard `isMountedRef`; deduplicate chime triggers with a ref; pass live stocks to `StockSearchSelect` and wire `onSelectStock`.



&#x20;|

| \*\*A3-118\*\* | \*\*P2\*\* | `src/components/swing/SwingTradeSelectorView.tsx`, `src/components/ui.tsx`



&#x20;| `SwingTradeSelectorView` has redundant ternaries (`STATUTORY\_CHARGES ? '10L' : '10L'`, `CIRCUIT\_LIMITS ? '2' : '2'`), doesn't subscribe to paper-trading updates, and colors `0%` green; `StockSearchSelect` colors `0.00%` green with `+`, and `DataTable` uses array-index keys without resetting `page` when `data` changes.



&#x20;| Minor visual/state inconsistencies on unchanged stocks and paginated tables.



&#x20;| Style `0%` neutrally, clean up redundant ternaries, subscribe `paperSummary` to `storage` updates, and reset `DataTable` `page` to `0` when `data` reference changes. |

| \*\*A3-119\*\* | \*\*P3\*\* | `src/components/swing/SwingTradeSelectorView.tsx`, `src/components/TestSuite.jsx`, `src/components/ui.tsx`, `src/components/WatchlistEntryAlertModal.tsx`



&#x20;| Unused imports (`StatCard`, `InfoBanner`, `Spinner`, `evaluateMarketRegimeGate`, `GATE\_NAMES`, `AlertOctagon`, `ShieldAlert`, `Activity`, `SearchX`, `fetchFromBackend`, `recordAlertHistory`) and unrendered `alertHistory` state.



&#x20;| Dead code and extra bundle imports.



&#x20;| Remove unused imports and either render or remove `alertHistory`. |



\---



\### 3. Exact Copy-Paste Code Diffs (P0 and P1 Bugs Only)



\#### `src/components/swing/SwingTradeSelectorView.tsx` (Fixes `A3-110`, `A3-111`)







```diff

\--- a/src/components/swing/SwingTradeSelectorView.tsx

+++ b/src/components/swing/SwingTradeSelectorView.tsx

@@ -63,16 +63,21 @@ export default function SwingTradeSelectorView({

&#x20;    const adv = equityStocks.filter(s => (Number(s.pChange || 0)) > 0).length;

&#x20;    const dec = equityStocks.filter(s => (Number(s.pChange || 0)) < 0).length;

&#x20;    const total = equityStocks.length;

\+    // Compute true % of equities trading above 50-EMA (never proxy with 1-day advancers %)

\+    const stocksWithEma50 = equityStocks.filter(s => Number(s.ema50 || s.sma50 || 0) > 0 \&\& Number(s.ltp || 0) > 0);

\+    const aboveEma50Count = stocksWithEma50.filter(s => Number(s.ltp) > Number(s.ema50 || s.sma50)).length;

\+    const truePctAboveEma50 = stocksWithEma50.length > 0

\+      ? Math.round((aboveEma50Count / stocksWithEma50.length) \* 100)

\+      : 0;

&#x20;    const avgChange = idxDailyPct != null

&#x20;      ? idxDailyPct

&#x20;      : (total > 0 ? (equityStocks.reduce((acc, s) => acc + Number(s.pChange || 0), 0) / total) : 0);

&#x20;

&#x20;    return {

&#x20;      nepseIndex,

&#x20;      nepseEma20,

&#x20;      nepseEma50,

&#x20;      advancers: adv,

&#x20;      decliners: dec,

&#x20;      dailyChangePct: avgChange,

\-      pctAboveEma50: Math.round((adv / (total || 1)) \* 100)

\+      pctAboveEma50: truePctAboveEma50

&#x20;    };

&#x20;  }, \[equityStocks, indices]);

@@ -85,12 +90,15 @@ export default function SwingTradeSelectorView({

&#x20;  // Filtered stocks for list display (no synthetic 5-stock mock fallback)

&#x20;  const displayStocks = useMemo(() => {

\-    const list = equityStocks;

\-    if (!searchQuery) return list;

\-    const q = searchQuery.toUpperCase().trim();

\-    return list.filter(s => (s.symbol || '').toUpperCase().includes(q));

\-  }, \[equityStocks, searchQuery]);

\+    const q = searchQuery.toUpperCase().trim();

\+    const list = q ? equityStocks.filter(s => (s.symbol || '').toUpperCase().includes(q)) : equityStocks;

\+    return list.map(stock => ({

\+      stock,

\+      evalResult: evaluateStockSwingGates(stock, screeningResult.marketRegime)

\+    }));

\+  }, \[equityStocks, searchQuery, screeningResult.marketRegime]);

\+

\+  const fmtSignedK = (val: number) => `${val >= 0 ? '+' : '-'}Rs. ${(Math.abs(val || 0) / 1000).toFixed(1)}k`;

@@ -143,15 +151,15 @@ export default function SwingTradeSelectorView({

&#x20;            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">

&#x20;              🔴 NO EDGE: do not trade this system

&#x20;            </h1>

&#x20;            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">

\-              Multi-year walk-forward backtesting across 40 closed trades with strict statutory frictions (5-tier broker commission, SEBON 0.015%, DP fee Rs. 25, 7.5% CGT) produced a <strong className="text-rose-300 font-bold">Profit Factor of 0.45x</strong> and net loss of <strong className="text-rose-300 font-bold">-Rs. 226,739.06</strong>. Per fiduciary protocol, this strategy is locked into simulation mode until empirical edge exceeds 1.25x across 200+ samples.

\+              Multi-year walk-forward backtesting across {backtest.fullSystem.totalTrades} closed trades with strict statutory frictions (5-tier broker commission, SEBON 0.015%, DP fee Rs. 25, Nepal CGT: 5.0% ST \&le;365d / 3.75% LT \&gt;365d) produced a <strong className="text-rose-300 font-bold">Profit Factor of {backtest.fullSystem.profitFactor}x</strong> and net PnL of <strong className="text-rose-300 font-bold">{backtest.fullSystem.netPnLNpr >= 0 ? '+' : '-'}Rs. {Math.abs(backtest.fullSystem.netPnLNpr || 0).toLocaleString()}</strong>. Per fiduciary protocol, this strategy is locked into simulation mode until empirical edge exceeds 1.25x across 200+ samples.

&#x20;            </p>

&#x20;          </div>

&#x20;          <div className="flex flex-col items-start md:items-end justify-center bg-slate-900/80 p-3 rounded-xl border border-slate-800 shrink-0">

&#x20;            <span className="text-\[11px] text-slate-400 font-medium">Validation Status</span>

&#x20;            <span className="text-sm font-black text-rose-400">UNPROVEN / NEGATIVE EDGE</span>

\-            <span className="text-\[10px] text-slate-400 mt-1">Sample N = 40 (Min required: 200)</span>

\+            <span className="text-\[10px] text-slate-400 mt-1">Sample N = {backtest.fullSystem.totalTrades} (Min required: 200)</span>

&#x20;          </div>

&#x20;        </div>

@@ -228,8 +236,14 @@ export default function SwingTradeSelectorView({

&#x20;                <div className="border-l border-slate-800 pl-3">

&#x20;                  <span className="text-slate-400 block text-\[10px]">Index Trend</span>

\-                  <span className="font-bold text-slate-200">20 \& 50 EMA Support</span>

\+                  <span className={`font-bold ${screeningResult.isDefensiveCashMode ? 'text-amber-300' : 'text-emerald-300'}`}>

\+                    {marketContext.nepseIndex > 0 \&\& marketContext.nepseEma50 > 0

\+                      ? (marketContext.nepseIndex >= marketContext.nepseEma50 ? 'Above 50 EMA' : 'Below 50 EMA (Weak)')

\+                      : `${marketContext.pctAboveEma50}% Equities > 50 EMA`}

\+                  </span>

&#x20;                </div>

&#x20;              </div>

&#x20;            </div>

@@ -276,8 +290,7 @@ export default function SwingTradeSelectorView({

&#x20;            {/\* Scrip Cards / Table \*/}

&#x20;            <div className="space-y-3">

\-              {displayStocks.map((stock) => {

\-                const evalResult = evaluateStockSwingGates(stock, screeningResult.marketRegime);

\+              {displayStocks.map(({ stock, evalResult }) => {

&#x20;                const isExpanded = expandedScrip === stock.symbol;

\+                const pChgNum = Number(stock.pChange || 0);

@@ -307,10 +320,17 @@ export default function SwingTradeSelectorView({

&#x20;                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">

&#x20;                            <span>LTP: <strong className="text-white">Rs. {stock.ltp}</strong></span>

\-                            <span className={stock.pChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>

\-                              {stock.pChange >= 0 ? '+' : ''}{stock.pChange}%

\+                            <span className={pChgNum > 0 ? 'text-emerald-400' : pChgNum < 0 ? 'text-rose-400' : 'text-slate-400'}>

\+                              {pChgNum > 0 ? '+' : ''}{pChgNum.toFixed(2)}%

&#x20;                            </span>

&#x20;                            <span>Turnover: Rs. {((stock.turnover || 0)/100000).toFixed(1)}L</span>

\+                            {onSelectStock \&\& (

\+                              <button

\+                                type="button"

\+                                onClick={(e) => { e.stopPropagation(); onSelectStock(stock); }}

\+                                className="text-sky-400 hover:text-sky-300 underline font-semibold"

\+                              >

\+                                Details

\+                              </button>

\+                            )}

&#x20;                          </div>

&#x20;                        </div>

&#x20;                      </div>

@@ -343,8 +363,8 @@ export default function SwingTradeSelectorView({

&#x20;            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">

&#x20;              <span className="text-\[11px] text-slate-400 font-medium">Net Realized PnL</span>

\-              <div className="text-xl font-black text-rose-400 mt-1">-Rs. {(Math.abs(backtest.fullSystem.netPnLNpr)/1000).toFixed(1)}k</div>

\+              <div className={`text-xl font-black mt-1 ${backtest.fullSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtSignedK(backtest.fullSystem.netPnLNpr)}</div>

&#x20;              <span className="text-\[10px] text-slate-400">Fee drag: Rs. {(backtest.fullSystem.totalFrictionNpr/1000).toFixed(1)}k</span>

&#x20;            </div>

&#x20;          </div>

@@ -374,25 +394,25 @@ export default function SwingTradeSelectorView({

&#x20;                    <td className="py-2.5 px-3 text-center font-bold text-rose-400">{backtest.fullSystem.profitFactor}x</td>

\-                    <td className="py-2.5 px-3 text-right text-rose-400 font-bold">-Rs. {(Math.abs(backtest.fullSystem.netPnLNpr)/1000).toFixed(1)}k</td>

\+                    <td className={`py-2.5 px-3 text-right font-bold ${backtest.fullSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtSignedK(backtest.fullSystem.netPnLNpr)}</td>

&#x20;                    <td className="py-2.5 px-3 text-right text-slate-400">Rs. {(backtest.fullSystem.totalFrictionNpr/1000).toFixed(1)}k</td>

&#x20;                  </tr>

&#x20;                  <tr>

&#x20;                    <td className="py-2.5 px-3 text-rose-300">Without Market Regime Gate (Ablation 1)</td>

&#x20;                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noRegimeSystem.totalTrades}</td>

&#x20;                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noRegimeSystem.winRatePct}%</td>

&#x20;                    <td className="py-2.5 px-3 text-center font-bold text-rose-400">{backtest.ablations.noRegimeSystem.profitFactor}x</td>

\-                    <td className="py-2.5 px-3 text-right text-rose-400 font-bold">-Rs. {(Math.abs(backtest.ablations.noRegimeSystem.netPnLNpr)/1000).toFixed(1)}k</td>

\+                    <td className={`py-2.5 px-3 text-right font-bold ${backtest.ablations.noRegimeSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtSignedK(backtest.ablations.noRegimeSystem.netPnLNpr)}</td>

&#x20;                    <td className="py-2.5 px-3 text-right text-slate-400">Rs. {(backtest.ablations.noRegimeSystem.totalFrictionNpr/1000).toFixed(1)}k</td>

&#x20;                  </tr>

&#x20;                  <tr>

&#x20;                    <td className="py-2.5 px-3 text-slate-300">Without Broker Flow Gate (Ablation 2)</td>

&#x20;                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noBrokerSystem.totalTrades}</td>

&#x20;                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noBrokerSystem.winRatePct}%</td>

&#x20;                    <td className="py-2.5 px-3 text-center font-bold text-rose-400">{backtest.ablations.noBrokerSystem.profitFactor}x</td>

\-                    <td className="py-2.5 px-3 text-right text-rose-400 font-bold">-Rs. {(Math.abs(backtest.ablations.noBrokerSystem.netPnLNpr)/1000).toFixed(1)}k</td>

\+                    <td className={`py-2.5 px-3 text-right font-bold ${backtest.ablations.noBrokerSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtSignedK(backtest.ablations.noBrokerSystem.netPnLNpr)}</td>

&#x20;                    <td className="py-2.5 px-3 text-right text-slate-400">Rs. {(backtest.ablations.noBrokerSystem.totalFrictionNpr/1000).toFixed(1)}k</td>

&#x20;                  </tr>

&#x20;                </tbody>

&#x20;              </table>

&#x20;            </div>

@@ -517,7 +537,7 @@ export default function SwingTradeSelectorView({

&#x20;            <p className="text-xs text-slate-300 leading-relaxed">

\-              Because the backtest produced negative expectancy after costs, this module operates in <strong>Paper-Trading Mode Only</strong>. All candidate signals are tracked virtually in memory and on disk with real T+2 Demat lockout, 5-tier broker commission, and 7.5% CGT. No real capital is ever placed at risk.

\+              Because the backtest produced negative expectancy after costs, this module operates in <strong>Paper-Trading Mode Only</strong>. All candidate signals are tracked virtually in memory and on disk with real T+2 Demat lockout, 5-tier broker commission, and Nepal statutory CGT (5.0% ST \&le;365d / 3.75% LT \&gt;365d). No real capital is ever placed at risk.

&#x20;            </p>

&#x20;          </div>



```



\---



\#### `src/components/TestSuite.jsx` (Fixes `A3-112`, `A3-113`)







```diff

\--- a/src/components/TestSuite.jsx

+++ b/src/components/TestSuite.jsx

@@ -1,4 +1,4 @@

\-import React, { useState } from 'react';

+import React, { useState, useRef, useEffect } from 'react';

&#x20;import { Play, Activity, AlertOctagon, ShieldAlert, Cpu } from 'lucide-react';

&#x20;import { calculateBuyDetails, calculateSellDetails, calculateWacc } from '../utils/calculations';

@@ -16,10 +16,18 @@ export default function TestSuite({ marketTrend, setMarketTrend, apiStatus, setA

&#x20;  ]);

&#x20;  const \[isRunning, setIsRunning] = useState(false);

&#x20;  const \[testResult, setTestResult] = useState(null); // 'pass' or 'fail'

\+  const isMountedRef = useRef(true);

\+  useEffect(() => {

\+    isMountedRef.current = true;

\+    return () => { isMountedRef.current = false; };

\+  }, \[]);

&#x20;

&#x20;  const addLog = (type, text) => {

\-    setTestLogs(prev => \[...prev, { type, text, time: new Date().toLocaleTimeString() }]);

\+    if (!isMountedRef.current) return;

\+    const time = new Intl.DateTimeFormat('en-US', {

\+      timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true

\+    }).format(new Date());

\+    setTestLogs(prev => \[...prev, { type, text, time }]);

&#x20;  };

@@ -47,25 +55,31 @@ export default function TestSuite({ marketTrend, setMarketTrend, apiStatus, setA

\-    // Test 2: Seller Calculations (SEBON Individual 7.5% Short-Term vs 5.0% Long-Term CGT)

\+    // Test 2: Seller Calculations (Nepal CGT effective 22 Sept 2026: 5.0% ST <=365d, 3.75% LT >365d, 10% Inst.)

&#x20;    await new Promise(r => setTimeout(r, 300));

\-    addLog('info', '🧪 Test 2: Seller Calculations (Short-term 7.5% \& Long-term 5.0% CGT)');

\+    addLog('info', '🧪 Test 2: Seller Calculations (Short-term 5.0%, Long-term 3.75%, Institutional 10.0% CGT)');

&#x20;    try {

&#x20;      const sellShort = calculateSellDetails(100, 200, 150, 'short');

\-      const expectedShortCGT = 367.50; // 7.5% of 4900 net profit

\-      const expectedShortReceivable = 19532.50;

\+      const expectedShortCGT = 245.00; // 5.0% of Rs. 4,900 net profit

\+      const expectedShortReceivable = 19655.00;

&#x20;

&#x20;      const sellLong = calculateSellDetails(100, 200, 150, 'long');

\-      const expectedLongCGT = 245.0; // 5.0% of 4900 net profit

\-      const expectedLongReceivable = 19655.0;

\+      const expectedLongCGT = 183.75; // 3.75% of Rs. 4,900 net profit

\+      const expectedLongReceivable = 19716.25;

\+

\+      const sellInst = calculateSellDetails(100, 200, 150, 'institutional');

\+      const expectedInstCGT = 490.00; // 10.0% of Rs. 4,900 net profit

\+      const expectedInstReceivable = 19410.00;

&#x20;

&#x20;      const tolerance = 0.01;

&#x20;      const passShort = Math.abs(sellShort.cgt - expectedShortCGT) < tolerance \&\& Math.abs(sellShort.netReceivable - expectedShortReceivable) < tolerance;

&#x20;      const passLong = Math.abs(sellLong.cgt - expectedLongCGT) < tolerance \&\& Math.abs(sellLong.netReceivable - expectedLongReceivable) < tolerance;

\+      const passInst = Math.abs(sellInst.cgt - expectedInstCGT) < tolerance \&\& Math.abs(sellInst.netReceivable - expectedInstReceivable) < tolerance;

&#x20;

\-      if (passShort \&\& passLong) {

\-        addLog('success', '✅ Test 2 Passed: Individual Short-term (7.5%) and Long-term (5.0%) CGT conform to SEBON regulations.');

\+      if (passShort \&\& passLong \&\& passInst) {

\+        addLog('success', '✅ Test 2 Passed: Short-term (5.0%), Long-term (3.75%), and Institutional (10.0%) CGT verified.');

&#x20;      } else {

\-        throw new Error(`Short CGT: ${sellShort.cgt} (exp ${expectedShortCGT}), Long CGT: ${sellLong.cgt} (exp ${expectedLongCGT})`);

\+        throw new Error(`Short CGT: ${sellShort.cgt} (exp ${expectedShortCGT}), Long CGT: ${sellLong.cgt} (exp ${expectedLongCGT}), Inst CGT: ${sellInst.cgt} (exp ${expectedInstCGT})`);

&#x20;      }

&#x20;    } catch (err) {

&#x20;      addLog('error', `❌ Test 2 Failed: ${err.message}`);

@@ -144,10 +158,12 @@ export default function TestSuite({ marketTrend, setMarketTrend, apiStatus, setA

&#x20;    try {

&#x20;      const base = getProxyBase();

&#x20;      const hResp = await fetch(`${base}/api/health`);

\-      const hData = await hResp.json();

\+      const hText = await hResp.text();

\+      const hData = hText ? JSON.parse(hText) : {};

&#x20;      const iResp = await fetch(`${base}/api/market-indices`);

\-      const iData = await iResp.json();

\+      const iText = await iResp.text();

\+      const iData = iText ? JSON.parse(iText) : {};

&#x20;      const val = iData?.nepse?.value || iData?.data?.nepse?.value || 0;

\-      if (hResp.ok \&\& val > 1000) {

\+      if (hResp.ok \&\& iResp.ok \&\& val > 1000) {

&#x20;        addLog('success', `✅ Test 6 Passed: Live feeds active (NEPSE: ${Number(val).toFixed(2)} pts, Proxy: ${hData.status || 'OK'}).`);

&#x20;      } else {

@@ -162,7 +178,9 @@ export default function TestSuite({ marketTrend, setMarketTrend, apiStatus, setA

&#x20;    try {

&#x20;      const base = getProxyBase();

&#x20;      const bResp = await fetch(`${base}/api/broker-analysis/NABIL?days=1\&refresh=true`);

\-      const bData = await bResp.json();

\+      if (!bResp.ok) throw new Error(`HTTP ${bResp.status}`);

\+      const bText = await bResp.text();

\+      const bData = bText ? JSON.parse(bText) : {};

&#x20;      const brokers = (bData?.data || bData)?.brokers || \[];

@@ -204,8 +222,10 @@ export default function TestSuite({ marketTrend, setMarketTrend, apiStatus, setA

&#x20;      passed = false;

&#x20;    }

&#x20;

\-    setIsRunning(false);

\-    setTestResult(passed ? 'pass' : 'fail');

\+    if (isMountedRef.current) {

\+      setIsRunning(false);

\+      setTestResult(passed ? 'pass' : 'fail');

\+    }

@@ -265,12 +285,12 @@ export default function TestSuite({ marketTrend, setMarketTrend, apiStatus, setA

&#x20;          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

&#x20;            <span style={{ fontSize: 12 }}>CDSC Connection Status:</span>

&#x20;            <button 

\-              onClick={() => setApiStatus(prev => prev === 'online' ? 'offline' : 'online')}

\-              className={`badge ${apiStatus === 'online' ? 'badge-bull' : 'badge-bear'}`}

\+              onClick={() => setApiStatus(prev => prev === 'live' ? 'offline' : 'live')}

\+              className={`badge ${apiStatus === 'live' ? 'badge-bull' : 'badge-bear'}`}

&#x20;              style={{ padding: '4px 12px', border: '1px solid', cursor: 'pointer' }}

&#x20;            >

\-              {apiStatus === 'online' ? 'Server Online' : 'Network Failure Mode'}

\+              {apiStatus === 'live' ? 'Live Feed Active' : 'Network Failure Mode'}

&#x20;            </button>

&#x20;          </div>



```



\---



\#### `src/components/ui.tsx` (Fixes `A3-114`, `A3-115`)







```diff

\--- a/src/components/ui.tsx

+++ b/src/components/ui.tsx

@@ -257,7 +257,7 @@ export function DataTable({ data = \[], cols = \[], loading = false, onRowClick }:

&#x20;  );

&#x20;}

&#x20;

\-export function SourceBar({ count, source, totalCount = 247 }: { count: number; source: string; totalCount?: number }) {

+export function SourceBar({ count, source, totalCount = 247, updatedAt }: { count: number; source: string; totalCount?: number; updatedAt?: string | number | null }) {

&#x20;  const live = source === 'live';

&#x20;  const isFiltered = totalCount > 0 \&\& count < totalCount;

\+  const updatedLabel = updatedAt \&\& !isNaN(new Date(updatedAt).getTime())

\+    ? `Updated ${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(updatedAt))} NPT`

\+    : (live ? 'Live Feed' : 'Cached Snapshot');

&#x20;  return (

@@ -274,7 +274,7 @@ export function SourceBar({ count, source, totalCount = 247 }: { count: number;

&#x20;          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />

&#x20;          {live ? 'LIVE NEPSE OFFICIAL FEED' : source.toUpperCase()}

&#x20;        </span>

\-        <span className="font-mono text-slate-500">Updated {new Date().toLocaleTimeString()}</span>

\+        <span className="font-mono text-slate-500">{updatedLabel}</span>

&#x20;      </div>

&#x20;    </div>

&#x20;  );

@@ -413,7 +413,7 @@ export function StockSearchSelect({

&#x20;  }, \[search, allAvailableStocks, stocks]);

&#x20;

&#x20;  useEffect(() => {

\-    function handleClickOutside(e: MouseEvent) {

\+    function handleClickOutside(e: MouseEvent | TouchEvent) {

&#x20;      if (wrapperRef.current \&\& !wrapperRef.current.contains(e.target as Node)) {

&#x20;        setIsOpen(false);

&#x20;        const q = search.trim().toUpperCase();

@@ -426,7 +426,11 @@ export function StockSearchSelect({

&#x20;      }

&#x20;    }

&#x20;    document.addEventListener('mousedown', handleClickOutside);

\-    return () => document.removeEventListener('mousedown', handleClickOutside);

\+    document.addEventListener('touchstart', handleClickOutside, { passive: true });

\+    return () => {

\+      document.removeEventListener('mousedown', handleClickOutside);

\+      document.removeEventListener('touchstart', handleClickOutside);

\+    };

&#x20;  }, \[search, allAvailableStocks, value, onChange]);

@@ -472,7 +476,8 @@ export function StockSearchSelect({

&#x20;              filtered.map((stock) => {

&#x20;                const isSelected = stock.symbol.toUpperCase() === value?.toUpperCase();

&#x20;                const liveData = livePriceMap\[stock.symbol.toUpperCase()];

\-                const price = liveData?.ltp || stock.basePrice || 0;

\+                // Only display verified live price from stocks prop (never fake Rs. 100 static fallback)

\+                const price = liveData?.ltp || 0;

&#x20;                const pChange = liveData?.pChange;

@@ -512,7 +517,7 @@ export function StockSearchSelect({

&#x20;                        {pChange != null \&\& !isNaN(pChange) \&\& (

\-                          <div style={{ color: pChange >= 0 ? '#10b981' : '#f43f5e', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, marginTop: 2 }}>

\-                            {pChange >= 0 ? '+' : ''}{Number(pChange).toFixed(2)}%

\+                          <div style={{ color: pChange > 0 ? '#10b981' : pChange < 0 ? '#f43f5e' : '#94a3b8', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, marginTop: 2 }}>

\+                            {pChange > 0 ? '+' : ''}{Number(pChange).toFixed(2)}%

&#x20;                          </div>

&#x20;                        )}

@@ -534,7 +539,7 @@ export function TimeframeFilterBar({

&#x20;  timeframe,

&#x20;  onSelectTimeframe,

&#x20;  asOf,

\-  isLive = true,

\+  isLive = false,

&#x20;  onRefresh,

&#x20;  isRefreshing = false,

&#x20;  timeframes = \['1D', '1W', '15D', '1M', '3M', '6M', '1Y'],

@@ -561,7 +566,7 @@ export function TimeframeFilterBar({

&#x20;          <div className="flex flex-col">

&#x20;            {title \&\& <span className="text-xs font-bold text-white">{title}</span>}

&#x20;            <span className="text-\[11px] font-mono text-slate-400">

\-              {asOf ? `As of: ${asOf}` : `As of: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}

\+              {asOf ? `As of: ${asOf}` : 'As of: Latest Session'}

&#x20;              {isLive ? ' (Live Session)' : ' (Session Closed)'}

&#x20;            </span>

&#x20;          </div>



```



\---



\#### `src/components/WatchlistEntryAlertModal.tsx` (Fixes `A3-116`, `A3-117`)







```diff

\--- a/src/components/WatchlistEntryAlertModal.tsx

+++ b/src/components/WatchlistEntryAlertModal.tsx

@@ -1,4 +1,4 @@

\-import React, { useState, useEffect, useMemo, useCallback } from 'react';

+import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

&#x20;import {

&#x20;  Bell, BellRing, Volume2, VolumeX, ShieldAlert, ArrowUpRight,

&#x20;  TrendingUp, CheckCircle2, Clock, Trash2, Plus, RefreshCw, AlertTriangle

@@ -6,13 +6,12 @@ import {

&#x20;import {

&#x20;  getAllWatchlistAlertConfigs,

&#x20;  saveWatchlistAlertConfig,

\-  removeWatchlistAlertConfig,

\+  deleteWatchlistAlertConfig,

&#x20;  getAlertHistory,

\-  recordAlertHistory,

&#x20;  playBreakoutChime,

&#x20;  triggerBreakoutVibration

&#x20;} from '../utils/watchlistAlerts';

\-import { StatCard, InfoBanner, Spinner, StockSearchSelect } from './ui';

\-import { fetchFromBackend, loadNepseData } from '../utils/liveData';

+import { StockSearchSelect } from './ui';

+import { loadNepseData } from '../utils/liveData';

@@ -29,48 +28,60 @@ interface WatchlistAlertItem {

&#x20;export function WatchlistEntryAlertModal({ onSelectStock = null }: { onSelectStock?: ((stk: any) => void) | null } = {}) {

&#x20;  const \[configs, setConfigs] = useState<Record<string, any>>({});

\+  const \[marketStocks, setMarketStocks] = useState<any\[]>(\[]);

&#x20;  const \[marketQuotes, setMarketQuotes] = useState<Record<string, number>>({});

\-  const \[alertHistory, setAlertHistory] = useState<any\[]>(\[]);

&#x20;  const \[newSymbol, setNewSymbol] = useState<string>('');

&#x20;  const \[audioEnabled, setAudioEnabled] = useState<boolean>(true);

&#x20;  const \[loading, setLoading] = useState<boolean>(true);

&#x20;  const \[refreshing, setRefreshing] = useState<boolean>(false);

\+  const \[errorMsg, setErrorMsg] = useState<string>('');

\+  const isMountedRef = useRef(true);

\+  const lastChimedKeyRef = useRef<string>('');

\+

\+  useEffect(() => {

\+    isMountedRef.current = true;

\+    return () => { isMountedRef.current = false; };

\+  }, \[]);

&#x20;

&#x20;  // Load configs \& live quotes

&#x20;  const reloadData = useCallback(async (isManualRefresh = false) => {

&#x20;    if (isManualRefresh) setRefreshing(true);

&#x20;    else setLoading(true);

\+    let timerId: any = null;

&#x20;    try {

&#x20;      const cfg = getAllWatchlistAlertConfigs();

\-      setConfigs(cfg || {});

\-      setAlertHistory(getAlertHistory() || \[]);

\+      if (isMountedRef.current) setConfigs(cfg || {});

&#x20;

&#x20;      // Fetch live market prices with cleaned 4s timeout race

&#x20;      const timeout = new Promise<{ stocks: any\[] }>((resolve) => {

\-        setTimeout(() => resolve({ stocks: \[] }), 4000);

\+        timerId = setTimeout(() => resolve({ stocks: \[] }), 4000);

&#x20;      });

&#x20;      const res = await Promise.race(\[loadNepseData(), timeout]);

\+      if (!isMountedRef.current) return;

&#x20;      const list = res?.stocks || \[];

\+      setMarketStocks(list);

&#x20;      const quoteMap: Record<string, number> = {};

&#x20;      list.forEach((s: any) => {

&#x20;        if (s.symbol) quoteMap\[s.symbol.toUpperCase()] = Number(s.ltp || s.price || 0);

&#x20;      });

&#x20;      setMarketQuotes(quoteMap);

&#x20;    } catch (\_) {

&#x20;    } finally {

\-      setLoading(false);

\-      setRefreshing(false);

\+      if (timerId) clearTimeout(timerId);

\+      if (isMountedRef.current) {

\+        setLoading(false);

\+        setRefreshing(false);

\+      }

&#x20;    }

&#x20;  }, \[]);

@@ -70,74 +81,92 @@ export function WatchlistEntryAlertModal({ onSelectStock = null }: { onSelectSto

&#x20;  // Add a new stock with auto-derived entry, stop, and target levels (preserving BreakoutAlertDialog keys)

&#x20;  const handleAddStock = (sym: string) => {

&#x20;    if (!sym) return;

&#x20;    const s = sym.toUpperCase().trim();

&#x20;    const ltp = marketQuotes\[s] || 0;

\-    const entryMin = ltp > 0 ? Number((ltp \* 0.992).toFixed(1)) : 0;

\-    const entryMax = ltp > 0 ? Number((ltp \* 1.004).toFixed(1)) : 0;

\-    const stopLoss = ltp > 0 ? Number((ltp \* 0.954).toFixed(1)) : 0; // 4.6% stop

\-    const target1 = ltp > 0 ? Number((ltp \* 1.069).toFixed(1)) : 0; // 6.9% target

\-    const target2 = ltp > 0 ? Number((ltp \* 1.115).toFixed(1)) : 0; // 11.5% target

\+    if (ltp <= 0) {

\+      setErrorMsg(`Live quote for ${s} is unavailable. Refresh market feed before adding an alert.`);

\+      return;

\+    }

\+    setErrorMsg('');

\+    // Pullback entry pocket slightly below live LTP so adding a stock does not immediately fire a false alert

\+    const entryMin = Number((ltp \* 0.975).toFixed(1));

\+    const entryMax = Number((ltp \* 0.990).toFixed(1));

\+    const stopLoss = Number((ltp \* 0.954).toFixed(1));

\+    const target1 = Number((ltp \* 1.069).toFixed(1));

\+    const target2 = Number((ltp \* 1.115).toFixed(1));

&#x20;

&#x20;    const newCfg = {

\+      ...(configs\[s] || {}),

&#x20;      symbol: s,

&#x20;      entryZone: \[entryMin, entryMax],

&#x20;      stopLoss,

&#x20;      target1,

&#x20;      target2,

&#x20;      alertEnabled: true,

&#x20;      lastTriggered: null

&#x20;    };

&#x20;

&#x20;    saveWatchlistAlertConfig(s, newCfg);

\+    setConfigs(getAllWatchlistAlertConfigs() || {});

&#x20;    setNewSymbol('');

\-    reloadData();

&#x20;  };

&#x20;

&#x20;  const handleToggle = (sym: string) => {

&#x20;    const cfg = configs\[sym];

&#x20;    if (!cfg) return;

&#x20;    saveWatchlistAlertConfig(sym, { ...cfg, alertEnabled: !cfg.alertEnabled });

\-    reloadData();

\+    setConfigs(getAllWatchlistAlertConfigs() || {});

&#x20;  };

&#x20;

&#x20;  const handleRemove = (sym: string) => {

\-    removeWatchlistAlertConfig(sym);

\-    reloadData();

\+    deleteWatchlistAlertConfig(sym);

\+    setConfigs(getAllWatchlistAlertConfigs() || {});

&#x20;  };

&#x20;

&#x20;  // Evaluate alerts strictly against verified live quotes (ltp > 0)

&#x20;  const activeAlertItems = useMemo(() => {

&#x20;    return Object.keys(configs).map(sym => {

&#x20;      const cfg = configs\[sym];

\-      const ltp = marketQuotes\[sym] || cfg.entryZone?.\[0] || 0;

\-      const \[entryMin, entryMax] = cfg.entryZone || \[ltp \* 0.99, ltp \* 1.01];

\-      const sl = cfg.stopLoss || (ltp \* 0.95);

\-      const t1 = cfg.target1 || (ltp \* 1.07);

\-      const t2 = cfg.target2 || (ltp \* 1.12);

\-

\-      const inEntryZone = ltp >= entryMin \&\& ltp <= entryMax;

\-      const nearStopLoss = ltp <= (sl \* 1.015);

\-      const target1Reached = ltp >= t1;

\-      const target2Reached = ltp >= t2;

\+      const liveLtp = Number(marketQuotes\[sym] || 0);

\+      const hasLive = Number.isFinite(liveLtp) \&\& liveLtp > 0;

\+      const \[entryMin, entryMax] = Array.isArray(cfg.entryZone) \&\& cfg.entryZone\[0] > 0 \&\& cfg.entryZone\[1] > 0

\+        ? cfg.entryZone

\+        : \[0, 0];

\+      const sl = Number(cfg.stopLoss || 0);

\+      const t1 = Number(cfg.target1 || 0);

\+      const t2 = Number(cfg.target2 || 0);

\+

\+      const inEntryZone = hasLive \&\& entryMin > 0 \&\& entryMax > 0 \&\& liveLtp >= entryMin \&\& liveLtp <= entryMax;

\+      const nearStopLoss = hasLive \&\& sl > 0 \&\& liveLtp <= (sl \* 1.015);

\+      const target1Reached = hasLive \&\& t1 > 0 \&\& liveLtp >= t1;

\+      const target2Reached = hasLive \&\& t2 > 0 \&\& liveLtp >= t2;

&#x20;

&#x20;      return {

&#x20;        symbol: sym,

&#x20;        entryZone: \[entryMin, entryMax] as \[number, number],

&#x20;        stopLoss: sl,

&#x20;        target1: t1,

&#x20;        target2: t2,

\-        currentPrice: ltp,

\+        currentPrice: liveLtp,

&#x20;        inEntryZone,

&#x20;        nearStopLoss,

&#x20;        target1Reached,

&#x20;        target2Reached,

&#x20;        alertEnabled: cfg.alertEnabled !== false

&#x20;      };

&#x20;    });

&#x20;  }, \[configs, marketQuotes]);

&#x20;

\-  // Audio and vibration side-effects isolated strictly to useEffect lifecycle

\+  // Deduplicated audio \& vibration alerts (chime only on newly triggered state)

&#x20;  useEffect(() => {

&#x20;    if (!audioEnabled) return;

\-    const hasTriggered = activeAlertItems.some(

\-      item => item.alertEnabled \&\& (item.inEntryZone || item.nearStopLoss || item.target1Reached || item.target2Reached)

\-    );

\-    if (hasTriggered) {

\+    const triggerKey = activeAlertItems

\+      .filter(item => item.alertEnabled \&\& (item.inEntryZone || item.nearStopLoss || item.target1Reached || item.target2Reached))

\+      .map(item => `${item.symbol}:${item.inEntryZone ? 'E' : ''}${item.nearStopLoss ? 'S' : ''}${item.target1Reached ? '1' : ''}${item.target2Reached ? '2' : ''}`)

\+      .sort()

\+      .join('|');

\+    if (triggerKey \&\& triggerKey !== lastChimedKeyRef.current) {

\+      lastChimedKeyRef.current = triggerKey;

&#x20;      playBreakoutChime();

&#x20;      triggerBreakoutVibration();

&#x20;    }

&#x20;  }, \[activeAlertItems, audioEnabled]);

@@ -183,9 +212,13 @@ export function WatchlistEntryAlertModal({ onSelectStock = null }: { onSelectSto

&#x20;            <StockSearchSelect

&#x20;              value={newSymbol}

\+              stocks={marketStocks}

&#x20;              onChange={(s) => {

&#x20;                setNewSymbol(s);

&#x20;                handleAddStock(s);

&#x20;              }}

&#x20;              placeholder="Add stock to entry alerts..."

&#x20;            />

&#x20;          </div>

\+          {errorMsg \&\& <span className="text-xs font-semibold text-rose-400">{errorMsg}</span>}

@@ -220,9 +253,13 @@ export function WatchlistEntryAlertModal({ onSelectStock = null }: { onSelectSto

&#x20;              ) : (

&#x20;                activeAlertItems.map((item, idx) => (

\-                  <tr key={idx} className="hover:bg-slate-800/30">

\+                  <tr

\+                    key={item.symbol}

\+                    onClick={() => onSelectStock \&\& onSelectStock({ symbol: item.symbol, ltp: item.currentPrice })}

\+                    className={`hover:bg-slate-800/30 ${onSelectStock ? 'cursor-pointer' : ''}`}

\+                  >

&#x20;                    <td className="p-3 font-bold text-white font-mono text-sm">{item.symbol}</td>

\-                    <td className="p-3 font-mono font-bold">Rs. {item.currentPrice}</td>

\+                    <td className="p-3 font-mono font-bold">{item.currentPrice > 0 ? `Rs. ${item.currentPrice}` : 'Awaiting Quote'}</td>



```



\---



\### Account 3 Audit Complete (`A3-001` – `A3-119`)



All files in Account 3's Market, IPO, Portfolio, Views, Context, Hooks, and UI domain have now been audited with zero truncation. Copy all Account 3 audit outputs from this chat into \*\*`audit-reports/acc3-market-portfolio-ui.md`\*\* alongside your Account 1 and Account 2 reports, then run the Master Remediation Prompt in Antigravity (Flash 3.8 High) to fix P0 and P1 bugs bottom-up.



---
Add-AuditClip "acc3-market-portfolio-ui.md"
