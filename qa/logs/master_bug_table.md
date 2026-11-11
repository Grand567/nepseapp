| Bug ID | Severity | Module / Area | Final Status |
| :--- | :---: | :--- | :---: |
| **BUG-001** | **Critical** | Market & Entry/Exit > BreakoutAlertDialog | **Fixed** |
| **BUG-002** | **Critical** | Predictor / Services > EntryExitAnalyzer > EntryRiskCard | **Fixed** |
| **BUG-003** | **High** | Market & Services > Alpha Playbook & Distribution Leaders (39 Orphan Services) | **Fixed** |
| **BUG-004** | **High** | Predictor / Services > EntryExitAnalyzer > EntryRiskCard (Net Profit CGT Calculator) | **Fixed** |
| **BUG-005** | **High** | Service Hub > Flagship Suites > Backtest Engine & Walk-Forward Report (`backtest-report`) | **Fixed** |
| **BUG-006** | **High** | Calculators & Portfolio > Statutory Buy Cost / CDSC DP Fee (Rs. 25) | **Fixed** |
| **BUG-007** | **Medium** | Predictor / Services > EntryExitAnalyzer > SetupScoreCard (Statistical Edge Δ) | **Fixed** |
| **BUG-008** | **Medium** | Service Hub > Calculators > Stock Split & Par Value Adjustment (`stock-split`) | **Fixed** |
| **BUG-009** | **Medium** | Portfolio & Calculators > `adjustForBonusShare` & `adjustForRightShare` | **Fixed** |
| **BUG-010** | **Medium** | Portfolio & 15 Cards > Null/Undefined `stocks` or `stock` Prop Crash | **Fixed** |
| **BUG-011** | **High** | Electron Main Process (`electron/main.cjs`) > WebPreferences & CORS/CSP Stripping | **Fixed** |
| **BUG-012** | **Medium** | Guru AI & Portfolio > Client-Exposed `VITE_*_API_KEY` Fallbacks | **Fixed** |
| **BUG-013** | **Low** | Global > InAppNewsReaderModal Conditional Hook Call | **Fixed** |
| **BUG-014** | **Medium** | Services & Stock Cards > UTC Date Slicing Instead of Nepal Time (UTC+5:45) | **Fixed** |
| **BUG-015** | **Low** | Multiple Components > Unguarded `window.open(..., "_blank")` & `localStorage` Calls | **Deferred** |
| **BUG-016** | **Medium** | Build & Architecture > Dead Next.js Route Files & Node-Only Modules Inside `src/` plus 13.8 MB Broker Matrix Chunks | **Fixed** |
| **BUG-017** | **High** | Dependencies > `npm audit` Vulnerabilities (41 Total: 5 Critical, 17 High, 17 Moderate, 2 Low) | **Fixed** |
| **BUG-018** | **Critical** | Portfolio & IPO > Demat Accounts & My Portfolio > Credential Encryption & Cloud Sync | **Fixed** |
| **BUG-019** | **High** | Portfolio & IPO > My Portfolio > Manual Ledger Valuation (`Prev Close` & `LTP` Modes) & Unconfirmed WACC Badge | **Fixed** |
| **BUG-020** | **High** | Portfolio & IPO > My Portfolio > Consolidated View Double-Counting & Import Duplication | **Fixed** |
| **BUG-021** | **High** | Portfolio & IPO > My Portfolio & WACC Studio > TMS Trade Book Parser Ignores `SELL` Rows | **Fixed** |
| **BUG-022** | **High** | Portfolio & IPO > My Portfolio > Direct Frontend LLM Calls, Gemini URL Key Exposure & Missing SEBON Disclaimer | **Fixed** |
| **BUG-023** | **Medium** | Portfolio & IPO > My Portfolio > Manual Ledger Quick WACC Edit Double-Charges Commission | **Fixed** |
| **BUG-024** | **Medium** | Portfolio & IPO > Architecture & Navigation > 3 Unmounted Portfolio Components & Duplicate Segmented Bars | **Fixed** |
| **BUG-025** | **Medium** | Portfolio & IPO > PortfolioHub > Mobile (`390x844`) Top Segmented Bar Clips 3rd & 4th Sub-Tabs | **Fixed** |
| **BUG-026** | **Medium** | Portfolio & IPO (Global Polling) > Console & Network Errors (`localhost:5000` Refused, `503`, `nepalipaisa.com` CORS) | **Fixed** |
| **BUG-027** | **Low** | Portfolio & IPO > My Portfolio > Hero Comparison Bar Ignores Manual Ledger Holdings (`Live Market: Rs. 0.0`) | **Fixed** |
| **BUG-028** | **Low** | Portfolio & IPO > Risk Simulator (`CapitalRiskSimulatorView.jsx`) > Max Risk Header Mismatch (`1.50%` vs `1.00%`), Un-clearable Inputs & Zero-Capital `NaN%` | **Fixed** |
| **BUG-029** | **High** | Portfolio & IPO > My Portfolio > Holding Action Signal (`classifyHoldingActionSignal`) Uses Live `marketStock.ltp` While Row Valuation Uses `prevClose` / `wacc` | **Fixed** |
| **BUG-030** | **High** | Portfolio & IPO > Bulk IPO Portal > Bulk Allotment Check (`checkSingleBoidAllotment` Secondary Market False-Positive Lottery Win) | **Fixed** |
| **BUG-031** | **High** | Portfolio & IPO > Bulk IPO Portal > `Verify Already Applied 🔍` Silently Displays `🟢 Ready to Apply` When Login or CDSC API Fails | **Fixed** |
| **BUG-032** | **High** | Portfolio & IPO > Bulk IPO Portal > `applyIpoDirect` Hardcodes `banks[0]` Without Bank Selection & Rejects >5,000 Kitta Allowed by UI | **Fixed** |
| **BUG-033** | **Medium** | Portfolio & IPO > Demat Accounts vs Bulk Apply > Contradictory BOID (`120...` vs `130...`) & CRN Length (`C-1234` vs 6–20 Chars) Validation | **Fixed** |
| **BUG-034** | **Medium** | Portfolio & IPO > Bulk IPO Portal > `SEBON 10-Kitta Allotment Probability` Always Stuck on `"Subscription Pending"` in `MeroShareHub` & 5x Overstated for Book-Building IPOs | **Fixed** |
| **BUG-035** | **Medium** | Portfolio & IPO > MeroShareHub > Unreachable 145-Line "Bulk Apply Wizard" (`showWizard`), Broken `/api/meroshare/apply` Endpoint & Plaintext PIN Display | **Fixed** |
| **BUG-036** | **Medium** | Portfolio & IPO & Services > `fetchIpoCompanyList` Permanently Injects `Beni Hydropower Project Limited (ID: 501, isTodayResult: true)` at Top of IPO Result List | **Fixed** |
| **BUG-037** | **Low** | Portfolio & IPO vs Service Hub > Feature Divergence Between `MeroShareHub.jsx` (Main Tab) and `IPOList.jsx` (Service Hub `ipo-result` / `mero-share` / `apply-history`) | **Deferred** |
| **BUG-038** | **Critical** | Stocks (`StockDetailModal`) > Floorsheet Tab (`6. Floorsheet`) > Sine-Wave Fabricated Trades (`Math.sin(i * 1.7)`), Hardcoded `10,840` Total Qty, `0` Bulk Deals & Stale Date Repetition (`2026-10-30` Shows `2026-11-04` Data) | **Fixed** |
| **BUG-039** | **High** | Stocks (`StockDetailModal`) > Overview Tab (`1. Overview`) > Direct Contradiction: `"🟢 SAFE OPERATOR ACCUMULATION ZONE / 🟢 SAFE TO ACCUMULATE"` Displayed 10px Above `"🚨 ORDER FLOW VETO LAW: INSTITUTIONAL EXIT LIQUIDITY TRAP"` | **Fixed** |
| **BUG-040** | **High** | Stocks (`StockDetailModal`) > Broker Flow (`5D`), Overview (`5D SWING`) & Market Depth (`5D Swing Radar`) > 5-Day Broker Synthesis Sums Gross `buy_kitta` Across Only `top_5_buyers` and Drops Same-Day Offsetting Sells (`#58` Shows `+87,079` Instead of `+61,607`, `#62` Shows `+117,622`, `BCR3 = 0%`) | **Fixed** |
| **BUG-041** | **High** | Stocks (`StockDetailModal`) > Broker Flow (`2. Broker Flow`) > Single-Day (`1D`) Subfile Synthesis Hardcodes `Avg Sell = Avg Buy` for All Brokers & Leaks `2026-11-06` `allTimeHoldingData` Into `2026-11-05` Top Cards / Bar Chart | **Fixed** |
| **BUG-042** | **High** | Stocks (`StockDetailModal`) > Broker Flow (`Acc. & Dist.` & `Date-Wise`) > `Date-Wise Buying & Selling Flow (30 Sessions)` Omits All 5 Latest November Sessions (`11/02`–`11/06`), Labels Every Historical Day `🟡 Neutral` With No Percentage, and Shows `TRADES = 0` | **Fixed** |
| **BUG-043** | **High** | Stocks (`StockDetailModal`) > AI Guru & Targets (`3. AI Guru & Targets`) > Instant Buy Simulator Omits `Rs. 25` DP Fee from `Total Cost Payable` (Displayed Line Items Do Not Sum to Total) & Accepts Negative Share Quantities | **Fixed** |
| **BUG-044** | **High** | Stocks (`StockDetailModal`) > Technicals (`4. Technicals`) vs AI Guru (`3. AI Guru`) > Contradictory RSI (`47.2 = Healthy Bullish` vs `▼ Bearish Momentum`) & Wyckoff Phase (`Phase D: Distribution` vs `Phase B: Absorption`), Plus Holiday Candlestick Dated `2026-11-08` | **Fixed** |
| **BUG-045** | **Medium** | Stocks (`StockDetailModal`) > Overview (`ShareHubChart`) & Header > `Last Traded Time: Today, 15:31` Shown on Public Holiday & `ShareHubChart` 1D Header Shows `▲ +0.00 (0.00%)` / `"Loading historical data…"` | **Fixed** |
| **BUG-046** | **Medium** | Stocks (`StockDetailModal`) > Volume Profile (`7. Volume Profile (POC)`) vs Telemetry Hub (`StockInformationHubModal`) > Tab 7 Stuck on `"No Volume Profile nodes compiled yet"` While Telemetry Hub Computes `POC: Rs 344` & `Session Turnover: Rs 3,723,205 (Vol: 10,840 kitta)` | **Fixed** |
| **BUG-047** | **Medium** | Stocks (`StockDetailModal`) > Fundamentals (`8. Fundamentals`) & Dividends (`9. Dividends & Rights`) > Piotroski Score Shows `– N/A (No data)` for ROE Right Below `ROE: 3.4%`, Quarterly Table Shows `082/083, q4` (Future Q4 Jul 2026), and `DividendHistoryPanel` Shows Duplicate Red Error Banners | **Fixed** |
| **BUG-048** | **Medium** | Stocks (`StockDetailModal`) > Compare Peers (`12. Compare Peers`) > `Float Market Cap` (`Rs. 2.75B`) Exceeds Total `Market Capitalization` (`Rs. 2.72B`), Peer Multi-Horizon Returns Are All `—`, and Invalid Peer Queries Fail Silently | **Fixed** |
| **BUG-049** | **Low** | Stocks (`StockDetailModal`) > Mobile (`390x844`) Header & Child Modals > Stock Symbol Truncated (`AKJCL` Overlaps `Watch` Button) & `BreakoutAlertDialog` (`zIndex: 99999`) Matches Parent Modal `zIndex` | **Fixed** |
| **BUG-050** | **High** | Market (`Dashboard.jsx` & `App.jsx`) > Hero Index Card vs Top Header Bar, `SubIndicesModal` & Fullscreen Modal > NEPSE Index Percentage Change Mismatch (`+0.10%` vs `+0.09%`) & `"Rs. 2,655.22"` Rupee Currency Prefix on Dimensionless Index Points | **Fixed** |
| **BUG-051** | **Critical** | Market (`Dashboard.jsx`) > Hero Index Chart Timeframes (`1W`, `1M`, `3M`, `6M`, `1Y`, `ALL`) > All 6 Non-`1D` Timeframe Buttons Display Identical Unsliced 500-Day Change (`▲ +801.74 pts (+43.26%)`) & `1D` Fallback Plots 5-Day X-Axis (`Nov 2 .. Nov 6`) | **Fixed** |
| **BUG-052** | **High** | Market (`Dashboard.jsx` & `masterAlphaPipeline.js`) > Market Breadth & Circuits vs Inline Drawer, `ChangeSummaryModal`, Market Summary & Alpha Desk > Four-Way Breadth & Unchanged Count Contradiction (`21` vs `228` Unchanged; `58%` vs `62%` Breadth; `336` vs `543` Active Scrips) | **Fixed** |
| **BUG-053** | **Medium** | Market (`Dashboard.jsx`) > `SubIndicesModal` (`tab.market.subindicesmodal`) > All 13 Sector Sub-Indices Display Bogus `Open === High === Close` & Omit Low Price | **Fixed** |
| **BUG-054** | **Medium** | Market (`Dashboard.jsx`) > `TopSearchBar` & `SubIndicesModal` > Search Dropdown (`zIndex: 10000`) Covers Spotlight Card Action Buttons & `TopSearchBar` (`zIndex: 1000`) Bleeds Over `.drawer-overlay` Modal Backdrop | **Fixed** |
| **BUG-055** | **Medium** | Market (`Dashboard.jsx`) > 8 Movers Sub-Tabs (`🔥 Breakouts`, `Top Gainers`, `Top Losers`, `Volume Surge`) > Unrounded IEEE-754 Float `Pivot Rs. 856.8000000000001` on `BENH`, Illiquid 10-Share Debentures Polluting Gainers/Losers, & Mutual Funds Dominating `Volume Surge` | **Fixed** |
| **BUG-056** | **Medium** | Market (`Dashboard.jsx`) > `ScannerModal` (`tab.market.scannermodal`) & Unused `useMemo` Computations (`topDemandStocks`, `circuitStocks`, `sectorRotationData`) > 100% Unreachable Dead Code | **Fixed** |
| **BUG-057** | **Medium** | Market (`Dashboard.jsx` & `AlgorithmicSignalTrackRecord.tsx`) > `AlgorithmicSignalTrackRecord` Modal (`tab.market.algorithmicsignaltrackrecord`) > Displays `Signal Ledger (0)` & `0%` Win Rate Without Local Fallback + Hardcodes Outdated `"+10% lockouts excluded"` Copy | **Fixed** |
| **BUG-058** | **Medium** | Market (`Dashboard.jsx`) > `Watchlist & Breakout Alerts` Card > Header Badge Hardcodes `watchedOrAlertSymbols.length` (`2`) Even When `topSearch` Filters Displayed Rows to `1` or `0` | **Fixed** |
| **BUG-059** | **Low** | Market (`BreakoutAlertDialog.jsx`) > Watchlist Alert Dialog (`tab.market.breakoutalertdialog`) > Hardcoded `"pre-Dashain"` Copy During Tihar/Kartik & Conditional Hooks After Early Return (`BUG-001`) | **Fixed** |
| **BUG-060** | **Medium** | Market (`App.jsx` & `Dashboard.jsx`) > Top Header `"PRO (Lifetime)"` Button Text Overlaps Adjacent Buttons on Desktop & Mobile + Orphan Service Shortcuts (`alpha-playbook`, `distribution-leaders`) | **Fixed** |
| **BUG-061** | **Low** | Market (`App.jsx` & `Dashboard.jsx`) > NEPSE Calendar Modal Header Badge Shows Generic `"Holiday: Public Holiday"` Instead of `"Holiday: तिहार (लक्ष्मी पूजा)"` & Top News Marquee Duplicates Single Headline Side-by-Side | **Fixed** |
| **BUG-062** | **High** | Predictor (`PredictorHub.jsx`) > `Index Predictor` (`tab.predictor.subtab_nepse`) > Dimensionless NEPSE Index Points Prefixed With `"Rs. "` Currency & Index `RRR` Hardcoded to `1.27:1` | **Fixed** |
| **BUG-063** | **Medium** | Predictor (`PredictorHub.jsx`) > `Index Predictor` > `Quantitative Factor Decomposition` Card Displays Hardcoded `40% / 20% / 20% / 20%` Weights While Engine Uses `35% / 25% / 25% / 15%` | **Fixed** |
| **BUG-064** | **High** | Predictor (`PredictorHub.jsx`) > `Stock Screener` (`tab.predictor.subtab_stocks`) > Screener Cards Render Literal `"null%"` for `5D Mom.` and Blank `RSI (14)` When 15-Session Price History Cache Is Unpopulated | **Fixed** |
| **BUG-065** | **Medium** | Predictor (`PredictorHub.jsx`) > `Stock Screener` > `Daily Prime Setup` Card Contradicts Itself on Short-Term CGT Rate (`-7.5% CGT` vs `10% CGT`) | **Fixed** |
| **BUG-066** | **Medium** | Predictor (`PredictorHub.jsx`) > `Macro & Sentiment` (`tab.predictor.subtab_macro_sentiment`) > Zero Client-Side Fallback When `/api/predict/macro` and `/api/predict/sentiment` Are Offline | **Fixed** |
| **BUG-067** | **High** | Predictor (`NepseAgentDashboard.jsx`) > `🤖 NEPSE Agent (3.1 Pro)` (`tab.predictor.nepseagentdashboard`) > Prefixes `"Unavailable"` Target Strings With `"Rs. "` (`T1: Rs. Unavailable`), Lacks Custom Query Input Box, & Omits SEBON Risk Disclaimer | **Fixed** |
| **BUG-068** | **High** | Predictor (`nepseAgentTools.js` & `Master100ProfitWorkstation.tsx`) > Direct Browser `fetch()` Calls Expose Secret Gemini API Key & Telegram Bot Token in Request URLs | **Fixed** |
| **BUG-069** | **Low** | Predictor (`Master100ProfitWorkstation.tsx` & `ShortTermProfitPlan.jsx`) > Raw Unparsed LaTeX Math Strings (`$\rightarrow$` and `$EV > 0$`) Rendered Literally in UI | **Fixed** |
| **BUG-070** | **High** | Guru AI (`AiAnalyst.jsx`) > Virtual Sandbox (`tab.guru_ai.subtab_sandbox`) > Close Trade Button Sells Position at Original Buy Price (`pos.buyPrice`) Instead of Live Market Price (`pos.currentLtp`) | **Fixed** |
| **BUG-071** | **High** | Guru AI (`AiAnalyst.jsx`) > `callGuruAI` Fallback > Crashes with `TypeError: text.match is not a function` Because `generateNepseAiContent` Returns an Object | **Fixed** |
| **BUG-072** | **Medium** | Guru AI (`AiAnalyst.jsx`) > `Market Outlook` (`tab.guru_ai.subtab_market`) > Zero Client-Side Fallback When Backend `/api/guru/analyze` Is Offline | **Fixed** |
| **BUG-073** | **Medium** | Guru AI (`aiService.js`) > `callGuruMarketOutlook` > Appends Secret API Keys (`apiKey`, `glmApiKey`, `openrouterApiKey`) to URL Query Parameters | **Fixed** |
| **BUG-074** | **Low** | Guru AI (`AiAnalyst.jsx`) > `TradeExecutionCards` (`tab.guru_ai.tradeexecutioncards`) > Hardcoded Fallback Targets (`Rs. 268`, `Rs. 285`, `Rs. 238`) If Entry Zone Regex Parsing Fails | **Fixed** |
| **BUG-075** | **Medium** | Guru AI (`AiAnalyst.jsx`) > Virtual Sandbox (`tab.guru_ai.subtab_sandbox`) > `calculateSandboxSummary` Called Without `currentPrices`, Freezing Open Positions at Entry Cost | **Fixed** |
| **BUG-076** | **High** | Resources (`Resources.jsx`) & Services (`services.tsx`) > Broker TMS Directory > All 18 External TMS Portal Links Point to Nonexistent Domain `https://tms${broker.number}.nepse.com.np/` Leading to DNS Failure (NXDOMAIN) | **Fixed** |
| **BUG-077** | **High** | Stitch Hub (`src/views/StitchHub.jsx`) > Reachability & Mobile UX > Header Trigger Button Hidden on Mobile Screens (< 520px), Leaving Stitch Hub 100% Unreachable | **Fixed** |
| **BUG-078** | **Low** | Stitch Hub (`src/views/PortfolioAnalytics.jsx`) > Total Portfolio Worth > English Mode Hardcodes Devanagari Decimal Suffix `.००` Resulting in Mixed ASCII/Devanagari Numerals (`NPR 1,519,430.००`) | **Fixed** |
| **BUG-079** | **Medium** | Service Hub > Calculators > WaccAveragingCalculator (`wacc-averaging`) > Passes Non-Existent `title` and `text` Props to `<InfoBanner>`, Leaving Top Guide Banner Blank | **Fixed** |
| **BUG-080** | **High** | `BreakoutAlertDialog.jsx` | **Fixed** |
| **BUG-081** | **High** | `AccumulationDistributionRadar.tsx`, `PreferencesSettingsService.tsx` | **Fixed** |
| **BUG-082** | **Medium** | `App.jsx`, `liveData.js` | **Fixed** |
| **BUG-083** | **Medium** | `AndroidManifest.xml` | **Fixed** |
| **BUG-084** | **Medium** | `capacitor.config.json` | **Fixed** |
| **BUG-085** | **Low** | `watchlistAlerts.js` | **Fixed** |
| **BUG-086** | **Low** | `Master100ProfitWorkstation.tsx` | **Fixed** |
| **BUG-087** | **Medium** | `electron/main.cjs` | **Fixed** |
| **BUG-088** | **Medium** | `index.html`, `electron/main.cjs` | **Fixed** |
| **BUG-089** | **High** | `electron/main.cjs` | **Fixed** |
| **BUG-090** | **High** | `electron-builder.json`, `electron/main.cjs` | **Fixed** |
| **BUG-091** | **Low** | `package.json`, `electron-builder.json`, `electron/main.cjs` | **Deferred** |
| **BUG-092** | **Medium** | `proxy/db/ledgerStore.js` | **Fixed** |
