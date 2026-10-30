# DRABYASHREE NEPSE — PHASE 3: AUDIT ALL 13 STOCK TABS

**Audit Date:** 2026-10-30  
**Target Codebase:** `c:\Users\Hp\Desktop\Software\nepse app`  
**Primary Modal Component:** [`src/components/StockDetailModal.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx) (7,426 lines)  
**Secondary Hub Component:** [`src/components/StockInformationHubModal.tsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockInformationHubModal.tsx) (1,341 lines)  
**Unified Backend Telemetry Route:** [`proxy/routes/stockTelemetryRoutes.mjs`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/stockTelemetryRoutes.mjs)  

---

## 1. Executive Summary & Stock-Tab Discovery

Inspection of [`StockDetailModal.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L2762-L2789) (`allTabs` array) confirms **13 primary stock tabs** grouped into 3 filter categories (`trading`, `financials`, `tools`), plus a 14th tab (`STOCK_SCORE`) inside [`StockInformationHubModal.tsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockInformationHubModal.tsx#L221-L236).

### Required Stock-Tab Audit Matrix

| # | Stock Tab (`id` & Label) | API Endpoint(s) | Database Table(s) / Upstream Source | Historical Data | Latest Date Verified | Correct Symbol Mapping | Status |
|---|---|---|---|---|---|---|---|
| **1** | `overview`<br/>**📊 Overview** | `GET /api/stock-detail/:sym`<br/>`GET /api/mero/stock-details/:sym`<br/>`GET /api/company/:sym`<br/>`GET /api/nepse/intraday-graph/:sym`<br/>`GET /api/stocks/:sym/telemetry` | `daily_stock_summary`, `scrip_fundamentals`, `floorsheet_contracts`, Live NEPSE Cache | 30-day sparkline & 1Y high/low from `price_history` / `daily_stock_summary` | `2026-10-30` | Yes (`exact` uppercase symbol match) | **PARTIALLY WORKING** (Hardcoded fallback timestamp `'Oct 12, 2:59 PM NPT'` at line 3410; Telemetry Hub `LIMIT 500` truncates high-volume stocks) |
| **2** | `technicals`<br/>**📈 Technicals** | `GET /api/price-history/:sym?days=500`<br/>`GET /api/stocks/:sym/telemetry` | `daily_stock_summary` + Sharesansar/Chukul OHLCV cache (`234–235` candles) | 234–235 daily OHLCV candles (`2025-10-30` to `2026-10-30`) | `2026-10-30` | Yes | **WORKING AND VERIFIED** (Client-side RSI-14, MACD, Stochastic, ADX, ATR, Bollinger, Pivot Points, Candlestick Scanner, Yan Analytics Card all verified) |
| **3** | `broker_analysis`<br/>**🤝 Broker Flow & Smart Money** | `GET /api/broker-analysis/:sym?days=N&date=YYYY-MM-DD`<br/>`GET /api/diagnostics/:sym?days=N`<br/>`GET /api/stocks/:sym/smart-money?days=all` | `daily_broker_ledger`, `daily_stock_summary`, `floorsheet_contracts` | 26 trading days in `daily_broker_ledger` (`2026-09-14` to `2026-10-30`) | `2026-10-30` | Yes | **CALCULATION DEFECT / PARTIALLY WORKING** (`realBrokerAnalysisCache` 1D vs 5D key collision in `liveData.js:2987`; `StockBrokerAnalysisTab.jsx:157` uses UTC date instead of NPT; Oct 28 `BARUN` BCR3 `36.9%` vs `54.1%` dual-formula contradiction) |
| **4** | `market_depth`<br/>**📚 Market Depth** | `GET /api/market-depth/:sym`<br/>`GET /api/nepse/market-depth/:sym` | Live NEPSE Level-2 Order Book / Proxy cache | Real-time snapshot only (Order book depth is ephemeral) | `2026-10-30` | Yes | **WORKING AND VERIFIED** (5-level Bid/Ask ladder, Bid/Ask ratio bar, Order Book Imbalance % and Spread bps verified) |
| **5** | `floorsheet`<br/>**🧾 Floorsheet** | `GET /api/floorsheet/:sym?page=1&size=50`<br/>`GET /api/broker-analysis/:sym?date=YYYY-MM-DD` | `floorsheet_contracts` (`406,796` rows), `daily_broker_ledger` | 20 trading dates in `floorsheet_contracts`, 26 in `daily_broker_ledger` | `2026-10-30` | Yes | **PARTIALLY WORKING** (Latest session paginated contracts work; historical date selector loads broker summary via `/api/broker-analysis/:sym?date=...` instead of raw historical contracts; Telemetry Hub caps raw contracts at `LIMIT 500`) |
| **6** | `volume_profile`<br/>**📊 Volume Profile** | `GET /api/floorsheet/:sym?page=1&size=50`<br/>`GET /api/stocks/:sym/telemetry` | `floorsheet_contracts` | Intended: Session & multi-day VPVR. Actual: Only Page 1 (50 rows) or 0 rows | `2026-10-30` | Yes | **BROKEN / DEFECTIVE** (`StockDetailModal.jsx:6092` embeds entire `<StockInformationHubModal>` defaulting to `OVERVIEW` tab instead of `VOLUME_PROFILE`, and does not trigger `fetchFloorsheetData` when Tab 6 is opened directly; `stockTelemetryRoutes.mjs:589` hardcodes `volumeProfile.nodes: []`) |
| **7** | `history`<br/>**📅 Price History & Charts** | `GET /api/price-history/:sym?days=500` | `daily_stock_summary` + OHLCV history cache | 234–235 trading days (`2025-10-30` to `2026-10-30`) | `2026-10-30` | Yes | **PARTIALLY WORKING** (Interactive candlestick/line chart, MA20/MA50, 1W–1Y returns, and OHLCV table work; however line 6276 falls back to hardcoded `'+14.8%'` when 1Y return is null) |
| **8** | `fundamentals`<br/>**🏛️ Fundamentals & Lock-In** | `GET /api/company/:sym/quarterly-reports`<br/>`GET /api/company/:sym/industry-comparison`<br/>`GET /api/mero/stock-details/:sym` | `scrip_fundamentals` (`8` rows only!), MeroLagani / Sharesansar scraper | Returns `HTTP 404` (`quarters: 0`) for all 5 audited symbols | `2026-10-30` | Yes | **CALCULATION DEFECT / SYNTHETIC FALLBACK** (`/api/company/:sym/quarterly-reports` returns `404`; [`StockFundamentalsTab.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockFundamentalsTab.jsx#L95-L300) fabricates 6 quarters of historical EPS/Profit/ROE using scalar multipliers `0.45..1.0` and hardcodes fake Income Statement/Balance Sheet numbers!) |
| **9** | `dividends`<br/>**🎁 Dividends & Rights** | `GET /api/dividend-history/:sym` | MeroLagani / NepseAlpha dividend scraper + cache | Multi-year historical bonus & cash dividends | `2026-10-30` | Yes | **PARTIALLY WORKING** (Real dividend history table works, though uncached scrapes take 5.9s–10.2s; [`StockRightShareCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockRightShareCard.jsx#L9-L16) fabricates a fake `'1:1'` `'Muktinath Capital Limited'` right share for every stock!) |
| **10** | `reports`<br/>**📰 Reports & Announcements** | `GET /api/news/nepse`<br/>`GET /api/company/:sym/quarterly-reports` | Live news scraper + [`StockReportsAnnouncementsCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockReportsAnnouncementsCard.jsx) | None (Static hardcoded arrays in component) | Static (`2026-05-09` / `2024-02-25`) | No (Hardcoded text with `${symbol}` interpolated) | **UI ONLY / SYNTHETIC DATA** ([`StockReportsAnnouncementsCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockReportsAnnouncementsCard.jsx#L34-L130) renders hardcoded fake quarterly report dates, fake news items, and fake corporate announcements for every stock) |
| **11** | `compare`<br/>**⚖️ Compare Peers** | `GET /api/compare/:s1/:s2` | In-memory market cache + `scrip_fundamentals` | Snapshot comparison + 1Y range | `2026-10-30` | Yes | **WORKING AND VERIFIED** (Side-by-side peer comparison table, radar/bar metrics, and dynamic peer selector verified across `BARUN`, `NABIL`, `SHPC`, `NIMB`, `HDL`) |
| **12** | `seasonality`<br/>**🌦️ Seasonality** | None called inside component (`GET /api/market/seasonality` exists on backend but is unused) | None (Hardcoded array in [`StockSeasonalityCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockSeasonalityCard.jsx#L7-L20)) | None (Static Bikram Sambat month table) | Static | No (Ignores `symbol` & `sector` props) | **BROKEN / HARDCODED STATIC DATA** ([`StockSeasonalityCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockSeasonalityCard.jsx#L7-L20) displays the exact same hardcoded 12 Bikram Sambat monthly returns—e.g. `Baishakh +3.42%`, `Shrawan +4.85%`—for every single stock in NEPSE) |
| **13** | `ai_calc`<br/>**🤖 AI Guru & Tools** | `POST /api/ai-guru/assess` | `daily_stock_summary`, `daily_broker_ledger`, `scrip_fundamentals`, OpenRouter LLM / Deterministic fallback | Uses latest session + 5D broker flow + 234D OHLCV | `2026-10-30` | Yes | **WORKING AND VERIFIED** (`POST /api/ai-guru/assess` returns `HTTP 200` with verified price, quantitative metrics, markdown thesis; client-side Secondary Buy/Sell SEBON Fee & CGT Calculator, Risk/Reward Position Sizer, and EMI/SIP tools verified) |

---

## 2. Deep Component & Function-Level Audit by Tab

### Tab Navigation & Header Bar ([`StockDetailModal.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L2762-L2835))
- **Component Inventory:**
  - Stock Header Badge (Symbol, Company Name, Sector Pill, Live LTP, Point Change, `% Change`, As-Of Session Badge).
  - Action Buttons: `Watchlist Toggle (★)`, `Alert Bell (🔔)`, `Share Snapshot`, `Refresh Data (🔄)`, `Close (✕)`.
  - Category Filter Pills (`All Tabs`, `⚡ Trading & Flow`, `🏛️ Financials & Peer`, `🛠️ Quant & Tools`).
  - Horizontal Scrollable 13-Tab Bar.
- **Defect `P3-1` (Verified):** At [`StockDetailModal.jsx:2792`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L2792), `tabCategories` hardcodes `{ id: 'all', label: 'All Tabs', count: 12 }` and `{ id: 'trading', label: '⚡ Trading & Flow', count: 6 }`, whereas `allTabs` actually contains **13** tabs (`7` in `'trading'`, `4` in `'financials'`, `2` in `'tools'`).

---

### Tab 1: `overview` (`📊 Overview`)
- **Location:** [`StockDetailModal.jsx:3370–4115`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L3370-L4115)
- **Cards, Charts, Tables & Indicators Audited:**
  1. **Intraday Area/Line Sparkline & Session Range Card:** Calls `fetchIntradayGraph(symbol)` (`GET /api/nepse/intraday-graph/:sym`, `HTTP 200`, 51–90ms). Plots intraday price trajectory against Previous Close reference line.
  2. **Key Trading Telemetry Grid:** Displays Open, High, Low, Close (LTP), Prev Close, VWAP, Total Volume (Kitta), Total Turnover (NPR), Total Trades, 52-Week High/Low range bar.
  3. **Valuation & Capital Structure Snapshot Card:** Displays Market Cap, Paid-Up Capital, Listed Shares, Promoter/Public Shareholding %, EPS, P/E Ratio, Book Value, P/B Ratio.
  4. **Quick Technical & Smart Money Pulse Card:** Displays composite Technical Gauge, RSI(14), MACD status, and 1D Net Institutional Flow preview.
- **Defects Identified:**
  - **Defect `P3-2`:** At [`StockDetailModal.jsx:3410`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L3410), when `clockTime` is absent on the initial render, the UI displays hardcoded `'Oct 12, 2:59 PM NPT'`.
  - **Defect `P3-3`:** In [`proxy/routes/stockTelemetryRoutes.mjs:330-346`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/stockTelemetryRoutes.mjs#L330-L346), because `scrip_fundamentals` in `drabyashree_ledger.db` only contains **8 symbols**, any symbol not in those 8 gets synthetic bank-like fallback fundamentals from `/api/stocks/:symbol/telemetry` (`epsTtm = 18.5`, `bookValuePerShare = 165`, `paidUpCapital = 5,000,000,000`).

---

### Tab 2: `technicals` (`📈 Technicals`)
- **Location:** [`StockDetailModal.jsx:4118–5190`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L4118-L5190) + [`src/components/StockYanAnalyticsCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockYanAnalyticsCard.jsx)
- **Cards, Charts, Tables & Indicators Audited:**
  1. **Summary Technical Gauge & Signal Matrix:** Aggregates Oscillator signals (RSI-14, Stochastic %K/%D, CCI, Williams %R, Momentum, MACD) and Moving Average signals (SMA 10/20/50/100/200, EMA 10/20/50) into `Strong Buy / Buy / Neutral / Sell / Strong Sell`.
  2. **Oscillators & Trend Indicators Table:** Computes real RSI(14), MACD(12,26,9), ADX(14), ATR(14), Bollinger Bands(20,2) from the 234–235 real OHLCV candles returned by `GET /api/price-history/:sym?days=500`.
  3. **Classic / Fibonacci / Camarilla Pivot Points Table:** Computes S1/S2/S3, Pivot `(H+L+C)/3`, and R1/R2/R3 from the latest completed trading session (`2026-10-30`).
  4. **Candlestick Pattern Recognition Scanner:** Scans the last 5 OHLCV candles for Doji, Hammer, Bullish/Bearish Engulfing, Morning/Evening Star, Marubozu.
  5. **`<StockYanAnalyticsCard />` ([`StockYanAnalyticsCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockYanAnalyticsCard.jsx)):** Computes z-score mean reversion, volatility regime, Hursts/efficiency ratio, and volume anomaly metrics from `realPriceHistory`.
- **Verification Verdict:** **WORKING AND VERIFIED**. All indicators are computed dynamically from real historical candles (`234–235` sessions ending `2026-10-30`).

---

### Tab 3: `broker_analysis` (`🤝 Broker Flow & Smart Money`)
- **Location:** [`StockDetailModal.jsx:5194–5220`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L5194-L5220) -> renders [`src/components/StockBrokerAnalysisTab.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx) (1,316 lines)
- **Cards, Charts, Tables, Filters & Interactive Controls Audited:**
  1. **Timeframe & Historical Session Filter Bar:**
     - Window buttons: `1D (Latest Session)`, `5D`, `10D`, `20D`, `30D`, `60D`.
     - Specific Historical Date Picker (`selectedDate` dropdown populated from available dates).
  2. **Institutional Accumulation / Distribution Banner & Wyckoff Regime Badge:** Displays `dominantRegime` / `wyckoffPhase`, `BCR3` (Top-3 Buyer Concentration Ratio), `SCR3` (Top-3 Seller Concentration Ratio), Net Institutional Flow Kitta, and Market VWAP vs Top-3 Buyer VWAP.
  3. **Lead Accumulator Desk Card:** Displays Top-1 and Top-3 Accumulating Brokers with Net Kitta, Accumulation `%`, and Average Buy Price (`buyAmt / buyVol`).
  4. **Top 10 Net Buyers & Top 10 Net Sellers Tables:** Broker ID, Buy Kitta, Sell Kitta, Net Kitta, Avg Buy/Sell Price, Turnover share `%`.
  5. **Top 10 Net Retention Till Now (Cumulative Holding Card):** Queries `/api/stocks/:symbol/smart-money?days=all` to compute all-time cumulative net retention (`totalBuy - totalSell`) and weighted average buy price per broker across all stored sessions.
  6. **Deep Diagnostic Cards (Chaikin/Wyckoff, Smart Money Order Bias, Absorption/Exhaustion):** Rendered from `/api/diagnostics/:symbol?days=N` and client-side fallback logic.
- **Defects Identified (Directly Explaining User's Reported Bug List #1–#5):**
  - **Defect `P3-5` (Singular vs Plural Smart-Money Route):** [`StockBrokerAnalysisTab.jsx:145`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx#L145) calls `/api/stocks/${symbol}/smart-money?days=all` (plural), whereas [`StockInformationHubModal.tsx:408`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockInformationHubModal.tsx#L408) calls `/api/stock/${symbol}/smart-money?days=all` (singular). Furthermore, our live route test showed both returned an array-indexed object (`keys=0,1,2,3,4,5`) where `sessions` was `undefined` when unwrapped incorrectly!
  - **Defect `P3-12a` (1D and 5D Giving Identical Results in Mobile/PC Radar & Cache Collision):** In [`src/utils/liveData.js:2987,3059`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/liveData.js#L2987-L3059), `fetchMarketWideBrokerSummaryMap(days)` caches results in `realBrokerAnalysisCache.set(symKey, dataObj)` keyed **only by `symKey`** without `days`! When a 1D fetch and a 5D fetch run, or when the mobile APK falls back to cached/snapshot data (`public/data/history_cache.json` has `brokerSummary: {}`), `1D` and `5D` read the exact same cached entry!
  - **Defect `P3-12b` (UTC vs NPT Date Bug in `StockBrokerAnalysisTab.jsx:157`):**
    ```js
    const todayNpt = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    ```
    Despite being named `todayNpt`, it uses `getUTCFullYear()/getUTCMonth()/getUTCDate()` without adding the `+05:45` Nepal offset! Between `00:00 NPT` and `05:45 NPT`, `todayNpt` is yesterday's date.
  - **Defect `P3-12c` (Dual BCR3 Formula & Why `BARUN` Shows `54.1%` vs `36.9%` and `Distribution Trap`):**
    - On `2026-10-28`, `BARUN` total volume was `34,644` kitta.
    - **Gross Top-3 Buyer Share (`BCR3_gross`):** Top 3 gross buyers bought `12,777` kitta -> `12,777 / 34,644 = 36.88%` (reported by `/api/broker-analysis/BARUN?date=2026-10-28`).
    - **Net Top-3 Buyer Share (`BCR3_net`):** Total positive net accumulation across all net-buying brokers on `2026-10-28` was `17,843` kitta, and the top 3 net buyers accumulated `9,656` kitta -> `9,656 / 17,843 = 54.12%` (`54.1%`)!
    - Because one component calculates `BCR3` as `Top3_NetBuy / Total_NetBuy` (`54.1%`) while the Wyckoff classifier checks price change (`BARUN` closed down or below VWAP with high seller concentration `SCR3`), one badge says `54.1% BCR3` while the regime classifier labels it `Distribution Trap` or `Broad Retail`!

---

### Tab 4: `market_depth` (`📚 Market Depth`)
- **Location:** [`StockDetailModal.jsx:5222–5610`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L5222-L5610)
- **Cards, Charts, Tables & Indicators Audited:**
  1. **Order Book Sentiment & Imbalance Bar:** Calculates `buyPct = totalBuyQty / (totalBuyQty + totalSellQty) * 100` and `sellPct = 100 - buyPct`.
  2. **Top 5 Buy Orders (Bids) & Top 5 Sell Orders (Asks) Tables:** Orders, Quantity, Price, and visual depth bars.
  3. **Spread & Liquidity Microstructure Card:** Bid-Ask Spread (NPR & bps), Best Bid/Ask ratio, wall detection.
- **Verification Verdict:** **WORKING AND VERIFIED** (`GET /api/market-depth/:sym` and `GET /api/nepse/market-depth/:sym` both return `HTTP 200` in 8–29ms).

---

### Tab 5: `floorsheet` (`🧾 Floorsheet`)
- **Location:** [`StockDetailModal.jsx:5612–6089`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L5612-L6089)
- **Cards, Charts, Tables, Filters & Buttons Audited:**
  1. **Session & Filter Toolbar:** Date selector (`floorsheetDate`), Buyer Broker filter input, Seller Broker filter input, Minimum Quantity filter (`minQty`), Page Size selector (`50`, `100`, `200`, `All`), Pagination controls (`Prev`, `Next`).
  2. **Floorsheet Summary Strip:** Total Contracts, Total Traded Kitta, Total Turnover, Average Trade Size, Chiti/Large Trade count (`>= 1,000` kitta).
  3. **Raw Contract Ledger Table:** Contract No, Symbol, Buyer Broker, Seller Broker, Quantity, Rate (NPR), Amount (NPR), Trade Size Badge (`Whale`, `Institutional`, `Retail`).
- **Defects Identified:**
  - **Defect `P3-4` (`LIMIT 500` Truncation in Telemetry Hub):** In [`proxy/routes/stockTelemetryRoutes.mjs:358`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/stockTelemetryRoutes.mjs#L358), `SELECT ... FROM floorsheet_contracts WHERE symbol = ? AND trading_date = ? ORDER BY contract_no DESC LIMIT 500` truncates any stock with `>500` trades in a session (`SHPC` had `932` trades on `2026-10-30`, `HDL` had `601` trades).
  - **Historical Floorsheet Mode:** When a user selects a historical date in `floorsheetDate`, `StockDetailModal.jsx:2055` calls `fetchRealBrokerAnalysis(symbol, 1, false, floorsheetDate)` which displays the **historical broker summary** for that date rather than raw contract-by-contract rows from `floorsheet_contracts`.

---

### Tab 6: `volume_profile` (`📊 Volume Profile`)
- **Location:** [`StockDetailModal.jsx:6092–6123`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6092-L6123)
- **Cards & Components Audited:**
  - Renders `<StockInformationHubModal isOpen={true} inline={true} symbol={symbol} rawFloorsheetContracts={realFloorsheet?.rows || []} ... />`.
- **Defects Identified:**
  - **Defect `P3-6a` (Missing Floorsheet Fetch Trigger on Tab 6):** The `useEffect` at [`StockDetailModal.jsx:2087`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L2087) only calls `fetchFloorsheetData(1)` when `activeTab === 'floorsheet'`. If a user opens a stock modal and clicks Tab 6 (`volume_profile`) directly without visiting Tab 5 (`floorsheet`) first, `realFloorsheet` is `null`, so `rawFloorsheetContracts` is `[]` (0 rows)!
  - **Defect `P3-6b` (Wrong Default Sub-Tab in Embedded Hub):** `<StockInformationHubModal>` initializes `const [activeTab, setActiveTab] = useState<TabId>("OVERVIEW")` ([`StockInformationHubModal.tsx:204`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockInformationHubModal.tsx#L204)) and does not accept an `initialTab="VOLUME_PROFILE"` prop. Thus clicking `📊 Volume Profile` in `StockDetailModal` renders a duplicate `OVERVIEW` tab inside the Volume Profile card!
  - **Defect `P3-3a` (Hardcoded Empty Volume Profile in Telemetry Route):** [`proxy/routes/stockTelemetryRoutes.mjs:589`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/stockTelemetryRoutes.mjs#L589) hardcodes `volumeProfile: { poc: verifiedPrice, vah: verifiedPrice * 1.02, val: verifiedPrice * 0.98, nodes: [] }`.

---

### Tab 7: `history` (`📅 Price History & Charts`)
- **Location:** [`StockDetailModal.jsx:6126–6395`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6126-L6395)
- **Cards, Charts, Tables & Filters Audited:**
  1. **Multi-Horizon Return Pills:** `1W`, `1M`, `3M`, `6M`, `YTD`, `1Y` return `%` cards computed from `realPriceHistory`.
  2. **Interactive Price & Volume Chart:** Timeframe toggles (`1M`, `3M`, `6M`, `1Y`, `ALL`), Chart Type toggles (`Line`, `Candlestick`, `Area`), Moving Average overlays (`MA20`, `MA50`).
  3. **Historical Daily OHLCV Table:** Date, Open, High, Low, Close, Change `%`, Volume (Kitta), Turnover (NPR).
- **Defect Identified:**
  - **Defect `P3-11` (`StockDetailModal.jsx:6276`):** When `performanceValues[5]` (1Y return) is null/unavailable, the UI falls back to hardcoded `'+14.8%'` (`{yr ? yr.val : '+14.8%'}`).

---

### Tab 8: `fundamentals` (`🏛️ Fundamentals & Lock-In`)
- **Location:** [`StockDetailModal.jsx:6398–6415`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6398-L6415) -> renders [`src/components/StockFundamentalsTab.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockFundamentalsTab.jsx) (1,073 lines)
- **Cards, Charts, Tables & Sub-Tabs Audited:**
  1. **Sub-Tab Bar:** `Summary & Ratios`, `Financial Statements (Income Statement / Balance Sheet)`, `Quarterly Trends`, `Peer Valuation`, `Promoter Lock-In & Capital`.
  2. **API Verification:** `GET /api/company/:sym/quarterly-reports` returned **`HTTP 404`** (`quarters=0`) for all 5 audited symbols (`BARUN`, `NABIL`, `SHPC`, `NIMB`, `HDL`).
- **Defects Identified:**
  - **Defect `P3-7a` (Synthetic Multiplied Quarterly Trend History):** In [`StockFundamentalsTab.jsx:95–152`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockFundamentalsTab.jsx#L95-L152), `allTrendData` ignores `backendQuarterData` and fabricates 6 quarters of historical EPS, Net Profit, Net Worth, ROE, P/E, and NPL by multiplying current `baseEps` and `baseBv` by hardcoded scalars (`0.45`, `0.65`, `0.85`, `0.89`, `0.94`, `1.0`)!
  - **Defect `P3-7b` (Hardcoded Fake Financial Statements):** In [`StockFundamentalsTab.jsx:164–300`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockFundamentalsTab.jsx#L164-L300), `statementLineItems` hardcodes fake financial statement line items (`85.99 Lkh` Admin Expenses, `5.65 Cr` Depreciation, `92.30 Cr` Investments for every Hydropower stock; `6.45 Cr` Admin Expenses, `4,850 Cr` Deposits, `450.20 Cr` Investments for every non-Hydropower stock)!

---

### Tab 9: `dividends` (`🎁 Dividends & Rights`)
- **Location:** [`StockDetailModal.jsx:6418–6585`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6418-L6585) + [`src/components/StockRightShareCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockRightShareCard.jsx)
- **Cards & Tables Audited:**
  1. **Dividend Summary KPI Strip:** Average Bonus `%`, Average Cash `%`, Total Dividend Events, Latest Fiscal Year.
  2. **Historical Dividend Ledger Table:** Fiscal Year, Bonus Share `%`, Cash Dividend `%`, Total Dividend `%`, Book Closure Date (fetched from `GET /api/dividend-history/:sym`, `HTTP 200`).
  3. **Right Share Card (`<StockRightShareCard />`):** Displays Right Share Ratio, Units, Opening/Closing Date, Issue Manager, Status.
- **Defect Identified:**
  - **Defect `P3-8` (Fabricated Right Share Data for All Stocks):** In [`src/components/StockRightShareCard.jsx:9–16`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockRightShareCard.jsx#L9-L16), whenever `rightShareData` is not passed (which is **always**, as `StockDetailModal.jsx:6580` renders `<StockRightShareCard symbol={symbol} stock={stock} />` without `rightShareData`), it fabricates a fake `1:1` right share issue managed by `'Muktinath Capital Limited'` (`26 Nov 2023` – `01 Jan 2024`) for **every stock in NEPSE**!

---

### Tab 10: `reports` (`📰 Reports & Announcements`)
- **Location:** [`StockDetailModal.jsx:6588–6600`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6588-L6600) -> renders [`src/components/StockReportsAnnouncementsCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockReportsAnnouncementsCard.jsx)
- **Cards & Tables Audited:**
  1. **Quarterly Financial Reports Archive Accordion (`reportYears`):** Lists Fiscal Years `2082/2083`, `2081/2082`, `2080/2081`.
  2. **Company News Feed (`companyNews`):** Lists news headlines and dates.
  3. **Corporate Announcements Feed (`announcements`):** Lists AGM/dividend/demat notices.
- **Defect Identified:**
  - **Defect `P3-9` (100% Static Hardcoded Templates):** In [`src/components/StockReportsAnnouncementsCard.jsx:34–130`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockReportsAnnouncementsCard.jsx#L34-L130), `reportYears`, `companyNews`, and `announcements` are completely hardcoded static arrays with `${symbol}` interpolated into strings (e.g., `'09 May 2026, Saturday'`, `'2024-02-25'`, `'has deposited bonus/right shares directly to the demat account...'`). No API is called inside `StockReportsAnnouncementsCard.jsx`!

---

### Tab 11: `compare` (`⚖️ Compare Peers`)
- **Location:** [`StockDetailModal.jsx:6603–6850`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6603-L6850)
- **Cards, Tables & Controls Audited:**
  1. **Peer Selector Dropdown & Search Input:** Allows comparing the active stock against sector peers or any NEPSE symbol.
  2. **Head-to-Head Metric Matrix (`GET /api/compare/:s1/:s2`):** Compares LTP, `% Change`, 52W High/Low, Volume, Turnover, Market Cap, EPS, P/E, Book Value, P/B, ROE, and Technical Rating with winner highlights.
- **Verification Verdict:** **WORKING AND VERIFIED** (`GET /api/compare/:s1/:s2` returns `HTTP 200` in 8–273ms).

---

### Tab 12: `seasonality` (`🌦️ Seasonality`)
- **Location:** [`StockDetailModal.jsx:6853–6862`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6853-L6862) -> renders [`src/components/StockSeasonalityCard.jsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockSeasonalityCard.jsx)
- **Cards & Tables Audited:**
  1. **12-Month Bikram Sambat Seasonality Heatmap & Win-Rate Grid:** Displays monthly average return `%`, win rate `%`, best/worst month (`Shrawan +4.85%`, `Chaitra -2.85%`).
- **Defect Identified:**
  - **Defect `P3-10` (100% Static Hardcoded Monthly Returns):** In [`src/components/StockSeasonalityCard.jsx:7–20`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockSeasonalityCard.jsx#L7-L20), `bsMonths` is a hardcoded constant array (`Baishakh: +3.42%`, `Jestha: +1.15%`, `Ashadh: -1.80%`, `Shrawan: +4.85%`, etc.). The component never uses `realPriceHistory` or calls `/api/market/seasonality`; every stock in NEPSE shows the exact same seasonality numbers!

---

### Tab 13: `ai_calc` (`🤖 AI Guru & Tools`)
- **Location:** [`StockDetailModal.jsx:6865–7410`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6865-L7410) + [`src/components/AiGuruQuantitativeCard.tsx`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/AiGuruQuantitativeCard.tsx)
- **Cards, Calculators & Interactive Features Audited:**
  1. **`<AiGuruQuantitativeCard />` (`POST /api/ai-guru/assess`):** Generates institutional quantitative assessment combining verified LTP (`2026-10-30`), 5D Smart Money Broker Flow, RSI/MACD/Trend alignment, and LLM/deterministic investment thesis. Verified `HTTP 200`.
  2. **NEPSE Secondary Market Buy/Sell Calculator:** Computes exact SEBON fee (`0.015%`), DP charge (`NPR 25`), tiered Broker Commission (`0.24%` to `0.36%`), Capital Gains Tax (`7.5%` short-term `<365d` vs `5.0%` long-term `>=365d` individual, `10%` institutional), WACC, and net profit/breakeven price.
  3. **Position Sizing & Risk/Reward Calculator:** Computes maximum kitta to buy based on Account Capital, Risk `%` per trade, Entry Price, Stop-Loss Price, and Target Price.
- **Verification Verdict:** **WORKING AND VERIFIED**.

---

## 3. Summary of Verified Phase 3 Defects (Queued for Phase 6 Remediation)

| Defect ID | Severity | Location | Description |
|---|---|---|---|
| **P3-1** | LOW | [`StockDetailModal.jsx:2792`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L2792) | `tabCategories` hardcodes `All Tabs (12)` and `Trading & Flow (6)` instead of dynamic counts (`13` and `7`). |
| **P3-2** | MEDIUM | [`StockDetailModal.jsx:3410`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L3410) | Overview tab falls back to hardcoded `'Oct 12, 2:59 PM NPT'` when `clockTime` is absent. |
| **P3-3** | CRITICAL | [`proxy/routes/stockTelemetryRoutes.mjs:330-614`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/stockTelemetryRoutes.mjs#L330-L614) | Telemetry Hub fabricates bank-like fundamentals (`EPS 18.5`, `BV 165`) when `scrip_fundamentals` has no row, hardcodes `volumeProfile.nodes: []`, and hardcodes `smartMoney5D.netAccumulationRatio: 12.5`. |
| **P3-4** | HIGH | [`proxy/routes/stockTelemetryRoutes.mjs:358`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/proxy/routes/stockTelemetryRoutes.mjs#L358) | `LIMIT 500` on `floorsheet_contracts` truncates session contract count, volume, and turnover for active stocks (`SHPC`, `HDL`). |
| **P3-5** | HIGH | [`StockInformationHubModal.tsx:408`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockInformationHubModal.tsx#L408) | Calls `/api/stock/:sym/smart-money` (singular) and mishandles array vs `{ sessions }` response shape. |
| **P3-6** | HIGH | [`StockDetailModal.jsx:2087,6092`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6092-L6123) | Tab 6 (`volume_profile`) does not trigger `fetchFloorsheetData(1)` when opened directly (passing `0` rows), and embeds `<StockInformationHubModal>` on the `OVERVIEW` tab instead of `VOLUME_PROFILE`. |
| **P3-7** | CRITICAL | [`StockFundamentalsTab.jsx:95-300`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockFundamentalsTab.jsx#L95-L300) | Fabricates 6 quarters of historical EPS/Profit/ROE using hardcoded scalar multipliers (`0.45..1.0`) and hardcodes fake Income Statement / Balance Sheet numbers when `/api/company/:sym/quarterly-reports` returns `404`. |
| **P3-8** | HIGH | [`StockRightShareCard.jsx:9-16`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockRightShareCard.jsx#L9-L16) | Fabricates a fake `1:1` right share issue by `'Muktinath Capital Limited'` for every stock in NEPSE. |
| **P3-9** | HIGH | [`StockReportsAnnouncementsCard.jsx:34-130`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockReportsAnnouncementsCard.jsx#L34-L130) | Displays 100% static hardcoded report dates (`2026-05-09`), news, and announcements for every symbol. |
| **P3-10** | HIGH | [`StockSeasonalityCard.jsx:7-20`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockSeasonalityCard.jsx#L7-L20) | Displays 100% static hardcoded Bikram Sambat monthly returns for every symbol instead of computing actual monthly seasonality from `realPriceHistory`. |
| **P3-11** | MEDIUM | [`StockDetailModal.jsx:6276`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockDetailModal.jsx#L6276) | Falls back to hardcoded `'+14.8%'` when 1Y return is null. |
| **P3-12** | CRITICAL | [`liveData.js:2987`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/utils/liveData.js#L2987), [`StockBrokerAnalysisTab.jsx:157`](file:///c:/Users/Hp/Desktop/Software/nepse%20app/src/components/StockBrokerAnalysisTab.jsx#L157) | `realBrokerAnalysisCache` key omits `days` (causing 1D/5D cache overwrite); `todayNpt` uses UTC date instead of NPT; Gross BCR3 (`36.9%`) vs Net BCR3 (`54.1%`) formula divergence causes contradictory Wyckoff labels. |
