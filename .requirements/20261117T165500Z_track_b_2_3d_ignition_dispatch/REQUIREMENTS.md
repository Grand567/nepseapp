# Requirements: Special Track B Syndicate Telegram Message Dispatcher & 2–3 Day Ignition Engine

## 1. Context & Business Goal
The user requested a specialized Telegram message dispatcher implementing the **Track B Strategy** (Post-T+2 Cleared Continuation, Retest, and Syndicate Accumulation). The purpose is to pinpoint the exact scrip primed to **ignite within 2–3 days** (24–72 hours) with asymmetric Risk:Reward (Stop Loss -3.5%, Target 1 +8.5%, Target 2 +15.0%).

## 2. Hard Mathematical Constraints & Thresholds

### 2.1 Nominal Price & Liquidity Gate
- **Price Cap:** `LTP < Rs. 450.00` and `LTP >= Rs. 100.00` (mutual funds, debentures, and promoter shares excluded).
- **Float Ceiling:** Public Float $\le 1.5\text{ Crore shares}$ (15,000,000 kitta). Mega-cap Commercial Banks (average float 16.98 Cr shares) are strictly excluded from syndicate cornering. Priority sectors: Hydropower, Finance, Non-Life Insurance, Hotels, Development Banks, Microfinance.

### 2.2 Syndicate Accumulation & Concentration Asymmetry
- **Lead Broker Identification:** Programmatically identify Top 3 buyer brokers with their broker IDs, broker names, net accumulated kitta, cost basis (VWAP), and net retention %.
- **Single-Day & Multi-Day Net Retention:**
  - `Today Retention (1D)` $\ge 75.0\%$
  - `5-Day Rolling Net Retention` $\ge 75.0\%$
  - `Total Syndicate Retention` $> 75.0\%$
- **Buyer Concentration Ratio (BCR3 Buy):** $\text{BCR3}_{\text{Buy}} \ge 40.0\%$ (Top 3 buyer desks hold $\ge 40\%$ of genuine gross buying).
- **Seller Concentration Ratio (BCR3 Sell):** $\text{BCR3}_{\text{Sell}} \le 35.0\%$ (Dispersed retail selling, no competing institutional dump desk).
- **Concentration Asymmetry Ratio:**
  $$\frac{\text{BCR3}_{\text{Buy}}}{\text{BCR3}_{\text{Sell}}} \ge 1.50\times \quad (\text{Target: } \ge 2.0\times)$$

### 2.3 Volume-Weighted Average Price (VWAP) & Point of Control (POC) Proximity
- **Multi-Timeframe Broker Cost:** Calculate and display:
  - 1D (Today) Broker VWAP
  - 5D Rolling Broker VWAP
  - 15D Rolling Broker VWAP
- **Total POC Extraction:** Derive the Point of Control (highest volume price level) from the 15-day / 30-day floorsheet contracts or price volume profile.
- **Tight Price Proximity:**
  $$\left|\frac{\text{LTP} - \text{POC}}{\text{POC}}\right| \le 1.50\% \quad \text{and} \quad \left|\frac{\text{LTP} - \text{VWAP}_{\text{1D}}}{\text{VWAP}_{\text{1D}}}\right| \le 1.50\%$$

### 2.4 Pre-Ignition 2–3 Day Coiling Micro-Signatures (TBCII)
- **Severe Wyckoff Volume Dry-Up (VDU):**
  - $\text{RVOL}_{20D} = \frac{\text{Volume}_{T+2}}{\text{SMA}_{20}(\text{Volume})} \le 0.65\times$ (Sniper dry-up $\le 0.48\times$).
  - Pullback Volume Ratio: $\text{Volume}_{T+2} \le 0.42\times \text{Volume}_{\text{Ignition}}$ (or $\le 0.55\times$).
- **Volatility Contraction:**
  - Daily candle range: $(\text{High} - \text{Low}) / \text{Low} \le 2.50\%$, OR
  - Qualifies as **NR7** (Narrowest Range of 7 sessions) or **IDNR4** (Inside Day + Narrowest Range of 4 sessions).
- **Candle Integrity:**
  - Upper Wick Ratio $\le 35.0\%$ ($\text{UpperWick} = (\text{High} - \max(\text{Open}, \text{Close})) / (\text{High} - \text{Low})$).
  - Close Location Value ($\text{CLV}$) $\ge 0.35$ (closes in upper 65% of daily range).

### 2.5 Dual Ignition Event (2 to 5 Sessions Ago)
- Either:
  1. **Stealth Pocket Pivot:** Gain of $+1.0\%$ to $+2.5\%$ on heavy volume ($\text{RVOL} \ge 2.0\times$), OR
  2. **Momentum Breakout Surge:** Gain $\ge +2.5\%$ on volume ($\text{RVOL} \ge 1.5\times$).

### 2.6 The 6 Hard Negative Vetoes (Zero Dispatch on Trap)
1. **Demat Dump Trap:** Any broker who accumulated during the ignition bar (2 to 5 sessions ago) selling $> 25\%$ of their position today.
2. **Lead Broker Today Net Dumping:** Lead broker has net negative volume today.
3. **Overhead Resistance Closeness:** Major overhead supply wall within $1.2\times \text{ATR}(14)$.
4. **Overextended Price:** 3-day cumulative gain $> 12.0\%$, or LTP $> 3.5\%$ above 20 EMA.
5. **Upper Wick Distribution:** Upper wick $> 40.0\%$ with negative daily close.
6. **Pre-Open Chase Gap:** Opening gap $> +1.8\%$.

## 3. Telegram Message Template Specifications
The dispatcher must generate a clean, rich HTML message containing:
1. Header with Session Date and NEPSE status.
2. Selected Scrip with LTP (< 450), Sector, and Track B status.
3. Top Broker Syndicate table (Top 3 brokers with names, net kitta, retention %, and individual cost).
4. Concentration Asymmetry (BCR3 Buy vs BCR3 Sell and Ratio).
5. Multi-Timeframe Broker Cost Basis & Retention (1D, 5D, 15D, Total Retention %, Total POC).
6. Volume Dry-Up & Microstructure metrics (VDU %, CLV %, NR7/IDNR4 status, Demat Dump status).
7. Tactical Execution Ticket: Limit Buy Zone (around POC/VWAP), Stop Loss (-3.5% below POC floor), Target 1 (+8.5%), Target 2 (+15.0%), R:R ratio, and Rs. 1 Lakh capital blueprint.
8. Syndicate Playbook Narrative.

## 4. Architecture & File Locations
1. `proxy/trackBSyndicateEngine.mjs`: Core quantitative math engine (`calculateMultiTimeframeBrokerMetrics`, `scanTrackBSyndicateCandidates`, `formatTrackBSyndicateHtml`, `getFloorsheetPoc`).
2. `proxy/telegramNotifier.mjs`: Export `dispatchSpecialTrackBTelegramMessage({ chatId })` and register `/trackb` command handler in `handleTelegramCommand`.
3. `proxy/server.mjs`: API endpoint `POST /api/telegram/dispatch-trackb` and `GET /api/telegram/preview-trackb`.
4. `tests/testTrackBSpecialTelegramDispatch.test.mjs`: Automated TDD test suite validating all formulas, filters, vetoes, and HTML format.
