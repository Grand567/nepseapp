# 📘 THE NEPSE QUANTITATIVE TRADING BIBLE
### *The Conceptual, Mathematical, and Tactical Trading Framework Built into Drabyashree NEPSE*

---

## 📑 TABLE OF CONTENTS
1. [Executive Summary & Core Trading Philosophy](#1-executive-summary--core-trading-philosophy)
2. [Structural Realities of the Nepal Stock Exchange (NEPSE)](#2-structural-realities-of-the-nepal-stock-exchange-nepse)
   - 2.1 The Long-Only Asymmetry (Zero Short-Selling)
   - 2.2 SEBON Statutory Frictions & Regulatory Bands
   - 2.3 The T+2 Settlement Freeze Trap
   - 2.4 The Public Floor Sheet Phenomenon (Tracking Whales by Broker ID)
   - 2.5 Zero-Bid Traps & Illiquidity Risk
3. [The Adapted Wyckoff Market Cycle for NEPSE](#3-the-adapted-wyckoff-market-cycle-for-nepse)
   - 3.1 The Four Market Phases
   - 3.2 Phase B: Stealth Accumulation & Float Cornering
   - 3.3 Phase C: Volume Dry-Up (VDU) & The Spring Shakeout
   - 3.4 Wyckoff's 3rd Law: Effort vs. Result & Churn Traps
   - 3.5 Phase A/B Distribution: The Buying Climax (Euphoria Distribution)
   - 3.6 Phase E Markdown: Active Dump & Circuit Cascades
4. [Microstructure & Quantitative Indicators](#4-microstructure--quantitative-indicators)
   - 4.1 Quiet Accumulation Index (QAI) & Day 1 Stealth
   - 4.2 Broker Concentration Ratio (BCR₃ / BCR₅) & Net Absorption Ratio
   - 4.3 Buyer-to-Seller Trade Size Ratio (BSR)
   - 4.4 Volume Dry-Up (VDU) & Volatility Contraction (VCP) Squeeze
   - 4.5 Leading On-Balance Volume (OBV) Divergence
   - 4.6 Pre-Open Order Book Imbalance Ratio (OBIR)
   - 4.7 Chaikin Money Flow (CMF) & Accumulation/Distribution Line (ADL)
5. [The 8-Gate Institutional Screener (The 100% Hunter)](#5-the-8-gate-institutional-screener-the-100-hunter)
6. [Breakout Clearance & Anti-Trap Defense Architecture](#6-breakout-clearance--anti-trap-defense-architecture)
   - 6.1 Support & Resistance Confluence Clustering
   - 6.2 Bull Trap Rejection vs. Genuine Breakout Clearance
   - 6.3 The T+2 Retest Rule: Day 1 Chase vs. Day 3/4 Retest Entry
   - 6.4 Exit Liquidity Safety Score
7. [The Non-Negotiable 6-Point Confirmed Entry Matrix](#7-the-non-negotiable-6-point-confirmed-entry-matrix)
8. [Capital Allocation, Position Sizing & Compounding Math](#8-capital-allocation-position-sizing--compounding-math)
   - 8.1 The Half-Kelly 2% Portfolio Risk Formula
   - 8.2 Friction-Adjusted Breakeven Geometry
   - 8.3 The 20-Trade Compounding Engine (+134% Account Growth)
   - 8.4 Capital Defense Mode: The Superpower of Holding 70–80% Cash
9. [The 4-Tier Trailing Profit Harvesting & Exit Engine](#9-the-4-tier-trailing-profit-harvesting--exit-engine)
   - 9.1 Tier 1: Target 1 Reached (+8% to +10% Net) & The Zero-Loss Switch
   - 9.2 Tier 2: Target 2 Reached (+18% to +25% Net) & Profit Lock
   - 9.3 Tier 3: Multibagger Runner (+35% to +100%) & 20-EMA Trail
   - 9.4 Emergency Hard Veto Exits (Same-Day Liquidation)
10. [Daily Execution Blueprint (The 10-Second Daily Routine)](#10-daily-execution-blueprint-the-10-second-daily-routine)
11. [Real-World Case Studies & Forensic Breakdown](#11-real-world-case-studies--forensic-breakdown)
    - Case Study 1: GHL — Why Buying Euphoria at Rs. 283.5 was a Trap
    - Case Study 2: HDL — High-PE Breakout vs. Low-Risk Pullback
    - Case Study 3: SHIVM — Multi-Session Cornering into Markup

---

## 1. Executive Summary & Core Trading Philosophy

Most retail traders in the Nepal Stock Exchange (NEPSE) lose money not because they lack passion, but because they trade using **emotional retail instincts** in a market dominated by **coordinated institutional syndicates**.

Retail traders typically:
1. Buy after a stock has already rallied +15% to +30% because of social media hype, Facebook groups, or Viber/Clubhouse tips.
2. Chase upper circuit ceilings (+15%) on Day 1, unaware of the **T+2 settlement delivery freeze**.
3. Hold losing positions for months hoping for a rebound ("hope is not an investment strategy"), while cutting tiny winners after +3%.
4. Attempt to turn Rs. 1,00,000 into Rs. 10,00,000 on a single speculative penny stock, inevitably getting trapped in zero-bid lower circuits.

### The Drabyashree Quant Philosophy
This application was engineered around an uncompromising mathematical reality:
> **You do not get rich in NEPSE by hitting a single lottery trade. You build lasting wealth through Sequential Compounding with an asymmetric Risk-to-Reward ratio, strict Capital Defense, and tracking the verifiable footprint of Institutional Money Flow.**

$$\text{Expectancy} = (\text{Win Rate} \times \text{Average Win}) - (\text{Loss Rate} \times \text{Average Loss}) - \text{Statutory Frictions}$$

If your trading system achieves a **60%–65% win rate** with an average winner of **+18% net** and an average loss capped strictly at **-4.5% net**, your mathematical expectancy is massively positive. Compounding this edge over 20 consecutive swing setups multiplies your account equity by **+134%**.

---

## 2. Structural Realities of the Nepal Stock Exchange (NEPSE)

To trade NEPSE successfully, you must master the structural quirks and statutory constraints unique to Nepal. Treating NEPSE like Wall Street or Dalal Street will result in severe losses because the institutional mechanics are fundamentally different.

### 2.1 The Long-Only Asymmetry (Zero Short-Selling)
In international markets (NYSE, NASDAQ, NSE India), hedge funds and institutions can profit when prices go down by **short-selling**. 

In NEPSE, **short-selling does not exist**.
* **Implication for Smart Money:** Operators, institutional desks, and syndicate whales can only make money if the stock price moves **UP**.
* **The Operator Necessity:** Before operators can take profits, they *must* accumulate large blocks of shares quietly at low prices, then *orchestrate a price markup*, and finally create sufficient retail excitement (FOMO) to sell their accumulated shares to retail buyers.
* **Your Strategic Edge:** Because operators cannot hide their buying on the floorsheet, and because they *must* pump price to exit, retail traders who track accumulation can ride the exact wave engineered by the operators.

---

### 2.2 SEBON Statutory Frictions & Regulatory Bands
Under SEBON regulations and Finance Acts:

| Statutory Parameter | Legal Rate / Specification | Trading Implication |
| :--- | :--- | :--- |
| **Daily Circuit Band** | **$\pm 15\%$ Daily Limit** (SEBON 4th Amendment Bylaws) | Expanded price bands mean volatility is high. A single bad entry without a stop-loss can wipe out $-15\%$ in a single session. |
| **SEBON Broker Commission** | **$0.27\%$ to $0.40\%$** tiered each way | Round-trip trading cost is $\sim 0.72\% - 0.80\%$ on turnover. Over-trading destroys accounts. |
| **SEBON Regulatory Fee** | **$0.015\%$** each way + DP fee Rs. 25 | Adds continuous friction on micro-trades. |
| **Final Capital Gains Tax (CGT)** | **$10.0\%$ Final** ($< 365$ days) / **$7.5\%$** ($> 365$ days) | Tax is levied immediately upon selling profitable trades. Gross targets must be calibrated net of CGT. |
| **Statutory Breakeven Drag** | **$+1.15\%$ to $+1.45\%$** above purchase price | A stock must gain $>+1.2\%$ just to break even after round-trip commissions and fees. |

---

### 2.3 The T+2 Settlement Freeze Trap
In NEPSE, shares purchased on Day $T$ do not settle into your Demat account (via CDSC / Meroshare) until **two full trading days later ($T+2$)**:
* If you buy on Sunday (Day 1), you **cannot sell** on Monday (Day 2).
* You can only sell on Tuesday afternoon or Wednesday morning once EDIS clearing is finalized.

> [!WARNING]
> **The #1 Cause of Retail Losses in NEPSE:**
> Buying an explosive green candle on Day 1 (+10% to +15% upper circuit). By Day 2, operators begin dumping into the frenzy. By Day 3 (when your shares finally arrive in Demat), the stock is locked in a **$-15\%$ lower circuit with zero bids**. You are trapped and forced to take massive losses.
> 
> **The Golden Rule:** Never chase a stock that is already up $>+2.5\%$ from its base pivot. Enter during Phase B/C stealth consolidation, or wait for a confirmed Day 3/4 retest!

---

### 2.4 The Public Floor Sheet Phenomenon (Tracking Whales by Broker ID)
Unlike Western dark pools where institutional orders are anonymized, **NEPSE publishes every single transaction with Buyer and Seller Broker Member IDs**:
* Broker #58 (Naasa Securities), Broker #45 (Imperial), Broker #34 (Vision), Broker #49 (Online), Broker #28 (Shree Krishna), Broker #42 (Sani), etc.
* When 3 specific broker desks quietly buy 60,000 shares across 5 consecutive sessions while price is completely flat, **they cannot hide**.
* The Drabyashree engine aggregates this floorsheet data in real time, calculating the exact **Broker Concentration Ratio (BCR)** and **Trade Size Asymmetry**.

---

### 2.5 Zero-Bid Traps & Illiquidity Risk
Many small-cap hydro and finance companies in NEPSE have tiny public floats ($< 2$ million shares). 
* During an orchestrated pump, operators dry up supply and push the stock up daily with tiny volume.
* When the operators exit, the order book becomes **completely empty on the bid side (Zero Bids)**.
* Even if your trading system tells you to cut losses, **no one is willing to buy your shares**.
* **Engine Protection:** The app enforces an **Exit Liquidity Safety Score**, evaluating daily turnover against public float. It penalizes scrips where you risk getting locked behind lower circuit walls.

---

## 3. The Adapted Wyckoff Market Cycle for NEPSE

Richard D. Wyckoff’s legendary market methodology is the foundation of our accumulation/distribution radar, adapted specifically for NEPSE order flow.

```
       [ PHASE D: MARKUP ]
           /          \
          /            \  [ PHASE A/B: DISTRIBUTION CLIMAX ]
         /              \      (Euphoria / Churn Trap)
        /                \              \
 [ PHASE B/C: STEALTH ]   \              \  [ PHASE E: DUMP / MARKDOWN ]
  (Accumulation / VDU)     \              \    (Zero-bid Cascades)
       /                    \              \
______/                      \______________\______
```

### 3.1 The Four Market Phases
1. **Accumulation (सङ्कलन - Phase A/B/C):** Smart money quietly absorbs shares at market bottoms in a tight trading range. Public interest is dead. Volume dries up.
2. **Markup (वृद्धि - Phase D/E):** Float is locked. Operators trigger the breakout. News and social media turn bullish. Price expands rapidly.
3. **Distribution (वितरण / माल फाल्ने - Phase A/B/C):** Smart money offloads large inventory into retail FOMO buying near cycle peaks. Volume churns heavily without price progression.
4. **Markdown (पतन - Phase E):** Smart money has exited. Buying demand collapses. Price enters a painful downtrend with lower circuit traps.

---

### 3.2 Phase B: Stealth Accumulation & Float Cornering
During stealth accumulation:
* **Price Behavior:** Extremely quiet. Price fluctuates in a narrow range of **$-1.5\%$ to $+2.5\%$**. No massive green candles.
* **Volume Flow:** Steady, moderate turnover without hype.
* **Broker Concentration:** Top 3 brokers corner **$\ge 40\%$ of total buy volume (BCR₃)**.
* **Trade Size Asymmetry:** Average buy ticket size is **$\ge 1.4\times$ to $2.0\times$** the average sell ticket size. Whales buy in large blocks (e.g. 2,000–5,000 kitta), while retail sellers sell in small odd lots (e.g. 50–200 kitta).

---

### 3.3 Phase C: Volume Dry-Up (VDU) & The Spring Shakeout
Phase C is the **most lucrative entry phase** in the entire Wyckoff cycle. It occurs right before the public markup begins.

#### A. Volume Dry-Up (VDU - The Supply Exhaustion Test)
* When operators finish buying up all the available floating shares, **nobody is left selling**.
* Relative Volume drops drastically to **$\le 0.40\times - 0.55\times$** of the 20-day average.
* Daily price range contracts to a microscopic spread (**Narrow Range Bar / NR4 / NR7 $\le 2.2\%$**).
* **Quant Meaning:** Floating supply is dead. The next influx of even modest buying will propel the stock upward violently.

#### B. The Spring Shakeout
* Before marking up the price, operators often execute a **false breakdown** below support to panic weak retail hands into selling their shares at a discount.
* The stock dips $-2\%$ to $-4\%$ intraday, triggers retail stop-loss orders, and is immediately scooped up by smart money before closing back inside the range.

---

### 3.4 Wyckoff's 3rd Law: Effort vs. Result & Churn Traps
Wyckoff’s Third Law states:
$$\text{Effort (Volume / Turnover)} \quad \longleftrightarrow \quad \text{Result (Price Progress / Spread)}$$

* **Normal Equilibrium:** High Volume = Large Price Movement; Low Volume = Small Price Movement.
* **Effort without Result (The Churn Trap):**
  * Volume surges to $2.5\times - 4.0\times$ normal turnover (Massive Effort).
  * But price barely gains $+0.5\%$ or forms an **upper rejection wick $\ge 40\%$** (Tiny Result).
  * **Forensic Diagnosis:** Retail is aggressively buying market orders, but large syndicate desks are holding an invisible ceiling and dumping massive blocks into those bids.
  * **Engine Verdict:** Flagged as `HIGH_DISTRIBUTION_CHURN` — **DO NOT BUY**.

---

### 3.5 Phase A/B Distribution: The Buying Climax (Euphoria Distribution)
When the radar flags `⚠️ EUPHORIA_DISTRIBUTION`:
* **Retail State:** Euphoric excitement, social media chatter, Telegram/Viber screenshots.
* **Price Action:** Rapid intraday spikes ($+5\%$ to $+12\%$).
* **Microstructure Reality:** Top buyer brokers flip to aggressive net sellers. They sell small lots to thousands of retail TMS accounts.
* **Tactical Command:** **Zero fresh buying.** If you hold shares, prepare to harvest profits before the markdown begins.

---

### 3.6 Phase E Markdown: Active Dump & Circuit Cascades
When the radar flags `🔴 ACTIVE_DUMP`:
* Price breaks below multi-week support on heavy turnover or negative Chaikin Money Flow ($CMF < -0.05$).
* Institutional bids vanish. Retail panic sets in.
* **Tactical Command:** Cut losses immediately. Never attempt to "average down" or catch a falling knife in NEPSE.

---

## 4. Microstructure & Quantitative Indicators

The application transforms raw NEPSE exchange feeds into a multi-layered diagnostic telemetry stack:

### 4.1 Quiet Accumulation Index (QAI) & Day 1 Stealth
Developed specifically for NEPSE, the **QAI Score (0 to 100)** identifies stocks undergoing silent institutional accumulation before Day 1 of the markup:

$$\text{QAI Score} = \text{Price Tightness (25 pts)} + \text{Broker Asymmetry (30 pts)} + \text{Net Absorption (25 pts)} + \text{Float Impact (20 pts)}$$

* **Price Tightness:** Highest points awarded when price is locked between $-1.2\%$ and $+1.5\%$.
* **Broker Asymmetry:** Ratio of BCR₃ Buy % to BCR₃ Sell %. A score of $\ge 2.0\times$ indicates institutional dominance over retail dispersion.
* **Net Absorption Ratio:** Proportion of bought shares retained as net delivery without wash-trading churn:
  $$\text{Net Absorption} = \frac{\text{Net Quantity Traded}}{\text{Gross Quantity Traded}} \ge 0.70$$
* **Day 1 Stealth Candidate:** A stock with $QAI \ge 68$, price change $[-1.8\%, +2.5\%]$, and BCR₃ asymmetry $\ge 1.35\times$.

---

### 4.2 Broker Concentration Ratio (BCR₃ / BCR₅) & Net Absorption
* **$BCR_3$ Buy %:** Percentage of total market buy volume captured by the top 3 purchasing broker members.
  $$\text{BCR}_3 = \frac{\text{Volume of Top 3 Buyers}}{\text{Total Market Buy Volume}} \times 100$$
  * $BCR_3 \ge 40.0\%$: Confirmed Institutional Accumulation.
  * $BCR_3 \ge 50.0\%$: Aggressive Institutional Cornering.
* **$BCR_3$ Sell %:** Percentage of sell volume executed by top 3 selling broker members.
  * $BCR_3 \text{ Sell} \ge 38.0\%$ with high turnover = Operator Offloading / Distribution Trap.

---

### 4.3 Buyer-to-Seller Trade Size Ratio (BSR)
$$\text{BSR} = \frac{\text{Average Buy Ticket Size}}{\text{Average Sell Ticket Size}} = \frac{\text{Total Buy Volume} / \text{Buy Trade Count}}{\text{Total Sell Volume} / \text{Sell Trade Count}}$$

* $\text{BSR} \ge 1.40\times$: Smart Money is buying blocks from small retail sellers.
* $\text{BSR} \le 0.65\times$: Smart Money is dumping small lots onto retail market orders.

---

### 4.4 Volume Dry-Up (VDU) & Volatility Contraction (VCP) Squeeze
* **VDU Ratio:** Today’s traded volume divided by the 20-day Simple Moving Average of volume:
  $$\text{VDU Ratio} = \frac{\text{Volume}_{\text{Today}}}{\text{SMA}_{20}(\text{Volume})} \le 0.50$$
* **VCP Range Spread:**
  $$\text{Spread Tightness} = \frac{\text{High} - \text{Low}}{\text{LTP}} \times 100 \le 2.2\%$$
* When VDU and VCP occur simultaneously at a key moving average (e.g. 20-day or 50-day EMA), the setup has the highest probability of an explosive upward move.

---

### 4.5 Leading On-Balance Volume (OBV) Divergence
On-Balance Volume calculates cumulative volume flow:
$$\text{OBV}_t = \text{OBV}_{t-1} + \begin{cases} +\text{Volume}_t & \text{if } \text{Close}_t > \text{Close}_{t-1} \\ -\text{Volume}_t & \text{if } \text{Close}_t < \text{Close}_{t-1} \\ 0 & \text{if } \text{Close}_t = \text{Close}_{t-1} \end{cases}$$

* **Bullish Leading Divergence:** Today’s OBV reaches the $80^{\text{th}}$ percentile of its 15-day range while Price is below the $45^{\text{th}}$ percentile. Volume is breaking out before price!
* **Bearish Leading Divergence:** OBV breaks down to the bottom $30^{\text{th}}$ percentile while price artificially lingers near recent highs. Distribution is underway.

---

### 4.6 Pre-Open Order Book Imbalance Ratio (OBIR)
Between 10:30 AM and 11:00 AM (NEPSE Pre-Open Session):
$$\text{OBIR} = \frac{\text{Total Bid Depth Volume} - \text{Total Offer Depth Volume}}{\text{Total Bid Depth Volume} + \text{Total Offer Depth Volume}}$$

* $\text{OBIR} \ge +0.25$: Strong morning demand pressure ($> 1.8\times$ buy depth over sell depth).
* $\text{OBIR} \le -0.25$: Strong morning supply overhang (sellers dominating the open).

---

### 4.7 Chaikin Money Flow (CMF) & Accumulation/Distribution Line (ADL)
* **Money Flow Multiplier (MFM):**
  $$\text{MFM} = \frac{(\text{Close} - \text{Low}) - (\text{High} - \text{Close})}{\text{High} - \text{Low}}$$
* **Chaikin Money Flow (CMF 20):**
  $$\text{CMF}_{20} = \frac{\sum_{i=1}^{20} (\text{MFM}_i \times \text{Volume}_i)}{\sum_{i=1}^{20} \text{Volume}_i}$$
  * $\text{CMF} > +0.05$: Institutional buying confirmed across multi-day sessions.
  * $\text{CMF} < -0.05$: Sustained distribution flow.

---

### 4.8 Sector Accumulation Rotation Heatmap
Institutions and syndicates in NEPSE rarely accumulate isolated scrips; they rotate capital into **sector clusters** (e.g. 5–8 Hydropower stocks, or 4–6 Finance scrips simultaneously).
* **Cluster Absorption Signal:** When $\ge 4$ scrips within a single sector show $BCR_3 \ge 40\%$ or $QAI \ge 65$, institutional sector rotation is underway.
* **First-Mover vs. Laggard Play:**
  1. Identify the **Sector Leader** (first scrip hitting +5% to +10% on record volume).
  2. Enter the **Quality Laggards** in the same sector that are still in tight Phase C VDU compression with $QAI \ge 68$ before their public markup begins.

---

### 4.9 Live Intraday Floorsheet vs. Multi-Session Hybrid Engine
To guarantee zero latency across all 250+ NEPSE scrips:
* **Initial Market Scan (Live Intraday Mode):** When full 60-day historical candle bars are not yet loaded in cache, the radar calculates authentic stealth accumulation scores and Wyckoff stages directly from:
  1. Live price action tightness ($\text{pChange}$ between $-1.8\%$ and $+2.5\%$, VWAP anchoring).
  2. Intraday Money Flow Multiplier ($\text{MFM} = \frac{(\text{LTP} - \text{Low}) - (\text{High} - \text{LTP})}{\text{High} - \text{Low}}$).
  3. Real-time floor sheet broker metrics ($BCR_3$, $BCR_5$, buyer-to-seller trade size asymmetry $\text{BSR}$, net absorption retention $\ge 70\%$).
* **Deep Chart Mode (Multi-Session Confirmation):** When individual stock charts are inspected, the engine synthesizes 60-day Chaikin Money Flow (CMF), ADL divergence, and historical OBV trends with today's broker flows.

---

## 5. The 8-Gate Institutional Screener (The 100% Hunter)

The **100% Hunter Screener** filters the entire universe of 250+ NEPSE scrips across 8 strict quantitative gates. A scrip must pass **at least 6 out of 8 gates** to be eligible for capital allocation:

| Gate # | Factor Name | Quantitative Threshold | Institutional Purpose & Anti-Trap Defense |
| :---: | :--- | :--- | :--- |
| **Gate 1** | **Tradable Float Size** | Public Float $\le 15$ Million shares | Prevents dilution; tightly held floating supplies move rapidly on institutional buying. |
| **Gate 2** | **Supply Lock** | Promoter $\ge 52\%$ OR Stealth $\ge 55$ | Ensures high insider skin-in-the-game; protects against speculative float dumping. |
| **Gate 3** | **VCP Volatility Squeeze** | BBW $\le 6.5\%$ OR $|\text{pChange}| \le 2.0\%$ | Detects volatility contraction (Mark Minervini VCP); precedes violent price expansion. |
| **Gate 4** | **Volume Surge (RVOL)** | $Z_{\text{vol}} \ge 1.5\sigma$ OR $\text{RVOL} \ge 1.8\times$ | Differentiates authentic smart money accumulation from retail noise. |
| **Gate 5** | **Broker Inflow** | Stealth Accumulation Score $\ge 60$ | Verifies powerhouse broker buying (e.g. Broker #58, #45, #34, #17). |
| **Gate 6** | **Directional DPI** | DPI Score $\ge 65 / 100$ | Measures buyer aggression and sustained limit-order absorption across intraday trades. |
| **Gate 7** | **Graham Downside Safety** | Margin of Safety $\ge 5\%$ OR P/E $< 28$ | Protects downside; eliminates speculative bubbles trading at $10\times$ book value with zero earnings. |
| **Gate 8** | **Seasonality & Liquidity** | Seasonality Score $\ge 0.00$ | Protects against seasonal liquidity drains (pre-Dashain cash withdrawals and fiscal year-end crunches). |

---

## 6. Breakout Clearance & Anti-Trap Defense Architecture

### 6.1 Support & Resistance Confluence Clustering
The application does not use arbitrary trendlines. It calculates **mathematical confluence clusters** combining:
1. Classical Floor Pivots ($PP, R_1, R_2, S_1, S_2$)
2. Fibonacci Retracements ($38.2\%, 50.0\%, 61.8\%, 78.6\%$)
3. 52-Week Highs/Lows and Swing Anchors

When 3 or more of these independent levels align within a narrow $1.5\%$ price band, it creates a **High-Probability Confluence Floor**.

---

### 6.2 Bull Trap Rejection vs. Genuine Breakout Clearance
A breakout candle is evaluated using strict geometric tests:
* **Genuine Breakout:**
  * Close occurs in the **top 25%** of the daily range ($\text{Close} \ge \text{Low} + 0.75 \times \text{Range}$).
  * Relative Volume is **$\ge 1.8\times$ to $2.5\times$** average.
  * Upper rejection wick is **$< 20\%$** of total candle height.
  * Broker floorsheet shows **net accumulation** by top desks.
* **Bull Trap Rejection (The Fakeout):**
  * Price pushes above resistance intraday but gets smashed back down, leaving an **upper wick $\ge 40\%$**.
  * Floorsheet reveals top brokers were **dumping large blocks** into retail market buy orders.
  * Engine flags `Bull Trap (Rejection)` — Immediate veto.

---

### 6.3 The T+2 Retest Rule: Day 1 Chase vs. Day 3/4 Retest Entry
Because of NEPSE's T+2 settlement freeze:
* **The Day 1 Trap:** Buying on the day a breakout surges $+8\%$ to $+10\%$ carries negative expectancy. If it rejects on Day 2, you cannot sell.
* **The Prime Retest Entry (Day 3 or 4):**
  * Wait for the initial breakout excitement to settle.
  * On Day 3 or 4, the stock pulls back to test the prior resistance level (now acting as support).
  * The pullback **must occur on low, drying-up volume (VDU $\le 0.60\times$)**.
  * Enter at the retest with a tight stop-loss placed right below the support floor.

---

### 6.4 Exit Liquidity Safety Score
$$\text{Exit Trap Score (0 to 100)} = f(\text{Daily Turnover, Free Float, Bid-to-Offer Depth Ratio})$$
* **High Liquidity (Safe Exit):** Daily turnover $\ge \text{Rs. } 2.5 \text{ Crore}$ with deep multi-tier bids. You can exit 10,000 shares in minutes without crashing the price.
* **Severe Exit Trap (Zero-Bid Risk):** Daily turnover $< \text{Rs. } 40 \text{ Lakh}$ with paper-thin bid depth. A single 5,000-share sell order will push the stock to a lower circuit. **Avoid large position sizing!**

---

## 7. The Non-Negotiable 6-Point Confirmed Entry Matrix

Before entering any swing trade on TMS, every candidate must pass all 6 gates of the **Confirmed Entry Matrix**:

```
      [ 1. ACTION STANCE ]  ---> Must be "STRONG BUY" or "ACCUMULATE ON PULLBACK"
             |
      [ 2. SETUP SCORE ]    ---> Score >= 70 / 100 with High Confidence
             |
      [ 3. ENTRY CORRIDOR ] ---> Inside [Entry Low - High] & <= Chase Cap (+2.5%)
             |
      [ 4. SMART MONEY ]    ---> BCR3 >= 40% & Top Brokers Net Buying
             |
      [ 5. TRAP MONITOR ]   ---> NO "Distribution Trap" & Churn Risk = Normal
             |
      [ 6. RISK : REWARD ]  ---> Net R:R >= 2.5 : 1 (Stop Loss <= 4.5% - 5.5%)
             |
         [ EXECUTE ]
```

### The Chase Cap Rule (+2.5% Maximum)
* If the pivot or base entry price is **Rs. 500**:
  $$\text{Chase Cap} = 500 \times 1.025 = \text{Rs. } 512.50$$
* If the market opens at **Rs. 518 (+3.6%)**, **DO NOT BUY**. 
* The trade is aborted immediately. Chasing extended prices severely distorts your Risk-to-Reward ratio and exposes you to settlement traps.

---

## 8. Capital Allocation, Position Sizing & Compounding Math

### 8.1 The Half-Kelly 2% Portfolio Risk Formula
Professional trading is capital defense. You must **never risk more than 1.5% to 2.0% of your total account capital on any single trade**.

$$\text{Max Shares to Buy} = \left\lfloor \frac{\text{Total Portfolio Capital} \times 0.02}{\text{Entry Price} - \text{Stop-Loss Price}} \right\rfloor$$

#### Numerical Example:
* **Total Portfolio Capital:** Rs. 5,00,000
* **Maximum Dollar Risk (2%):** $\text{Rs. } 5,00,000 \times 0.02 = \text{Rs. } 10,000$
* **Planned Entry Price:** Rs. 280
* **Structural Stop-Loss Floor:** Rs. 266 (Risk per share = $\text{Rs. } 14$)
$$\text{Max Position Size} = \frac{\text{Rs. } 10,000}{280 - 266} = \frac{10,000}{14} = \mathbf{714 \text{ Shares}}$$
* **Total Capital Outlay:** $714 \times 280 = \text{Rs. } 1,99,920$ ($40\%$ of portfolio).
* **Worst-Case Loss if Stop Hits:** Exactly Rs. 10,000 ($2.0\%$ of portfolio equity).
* **Result:** Even if 3 consecutive trades hit stop-loss, you lose only $6\%$, preserving $94\%$ of your capital to capitalize on the next winning trend.

---

### 8.2 Friction-Adjusted Breakeven Geometry
Because of broker fees ($0.36\% - 0.40\%$), SEBON fees ($0.015\%$), DP fees (Rs. 25), and $10\%$ CGT on profits:
* To make a **net profit of $+10\%$**, the stock must move up **$\approx +11.8\%$ gross**.
* To make a **net profit of $+20\%$**, the stock must move up **$\approx +23.2\%$ gross**.
* Drabyashree's workstation calculates every target **net of statutory taxes and friction fees**, ensuring you never exit thinking you made profit only to find your Meroshare ledger showing a loss.

---

### 8.3 The 20-Trade Compounding Engine (+134% Account Growth)
Compounding is the true "secret" to making 100%+ in NEPSE. 

Assume an account of **Rs. 5,00,000**:
* **20 Consecutive Trades** using the 2% Portfolio Risk Rule.
* **Win Rate:** 65% (13 Wins, 7 Losses).
* **Average Winner:** $+18.0\%$ gross ($\approx +15.5\%$ net).
* **Average Loser:** $-4.5\%$ net (Strict stop-loss).
* **Asymmetric R:R Ratio:** $\approx 3.4 : 1$.

```
Trade #1:  Rs. 5,00,000  ---> Win (+15.5% on 40% alloc = +6.2% port) ---> Rs. 5,31,000
Trade #2:  Rs. 5,31,000  ---> Win                                    ---> Rs. 5,63,922
Trade #3:  Rs. 5,63,922  ---> Loss (-2.0% max port risk)              ---> Rs. 5,52,644
Trade #4:  Rs. 5,52,644  ---> Win                                    ---> Rs. 5,86,908
...
Trade #20: Final Account Equity = Rs. 11,69,450 (+133.9% Net Growth!)
```
You have **more than doubled your capital** without ever risking more than 2% on any single stock, and without ever needing a lottery stock!

---

### 8.4 Capital Defense Mode: The Superpower of Holding 70–80% Cash
> **"In NEPSE, 80% of net annual profit comes from NOT buying during market corrections."**

When market breadth deteriorates (fewer than $40\%$ of stocks trading above their 20-day SMA, or total exchange turnover collapses):
* The application automatically triggers **🛡️ Capital Defense Mode**.
* **Directive:** **Zero Buy Orders.** Hold **$70\%$ to $80\%$ cash**.
* During bear phases, retail traders get chopped to pieces trying to catch bounces. The professional trader preserves capital in cash, waiting patiently like a predator until the next institutional accumulation cycle begins.

---

## 9. The 4-Tier Trailing Profit Harvesting & Exit Engine

Entering a trade is only 30% of the game; the remaining 70% is execution of the exit plan. The app uses a **4-Tier Trailing Harvest Engine**:

```
        [ TARGET 3 / RUNNER ] ---> (+35% to +100%) Hold 25-50%, Trail 2-day close < 20-EMA
              /
       [ TARGET 2 ]        ---> (+18% to +25%) Sell 25%, Trail Stop to Target 1 Price
             /
      [ TARGET 1 ]         ---> (+8% to +10%) Sell 25-50%, Move Stop to BREAKEVEN
            /
    [ ENTRY CORRIDOR ]     ---> Stop-Loss set at -4.5% to -5.0%
```

### 9.1 Tier 1: Target 1 Reached (+8% to +10% Net) & The Zero-Loss Switch
* **Action:** Sell **25% to 50%** of your initial share quantity.
* **Stop-Loss Adjustment:** Move your stop-loss floor on the remaining shares up to your **Entry Price (Breakeven)**.
* **Psychological & Mathematical Impact:** **The Zero-Loss Switch is flipped.** It is now mathematically impossible for this trade to lose money. You have locked in profit, and the remainder is playing with "house money".

---

### 9.2 Tier 2: Target 2 Reached (+18% to +25% Net) & Profit Lock
* **Action:** Sell an additional **25%** of your original position.
* **Stop-Loss Adjustment:** Trail your stop-loss floor on the remaining shares up to the **Target 1 Price**.
* **Outcome:** You have now locked in high double-digit gains into your cash ledger.

---

### 9.3 Tier 3: Multibagger Runner (+35% to +100%) & 20-EMA Trail
* **Action:** Hold the remaining **25% to 50% runner**.
* **Stop-Loss Rule:** **A 2-day consecutive close below the 20-day EMA**.
* **Outcome:** This allows major multibagger winners (e.g. hydro runners or banking bull runs) to compound to $+50\%$, $+80\%$, or $+100\%$ without getting shaken out by normal intraday noise.

---

### 9.4 Emergency Hard Veto Exits (Same-Day Liquidation)
Liquidate **100% of your position immediately** on TMS without hesitation if:
1. **Stop-Loss Floor Breached:** Daily close below your structural stop-loss ($-4.5\%$ to $-5.5\%$).
2. **Broker Reversal:** Original buyer brokers (e.g. Broker #58 or #45) appear as the **#1 and #2 net sellers** on the live floorsheet.
3. **Radar Phase Shift:** Accumulation Radar flips to `⚠️ EUPHORIA_DISTRIBUTION` or `🔴 ACTIVE_DUMP`.

---

## 10. Daily Execution Blueprint (The 10-Second Daily Routine)

A disciplined trader executes in structured daily windows:

### Phase 1: 10:00 AM – 10:30 AM (Pre-Market Scan)
1. **Check Top Banner:** Is **Cash Defense Mode** active? If YES, close TMS and preserve cash. If NO, proceed.
2. **Promoter Lock-In Check:** Ensure candidate scrips have **no promoter lock-in expiries** within the next 60 days.

### Phase 2: 10:30 AM – 11:00 AM (Pre-Open Order Book)
1. **Check Pre-Open OBIR:** Verify buyer depth ratio is $\ge +0.25$ ($>1.8\times$ buy depth).
2. **Chase Cap Guard:** If the projected open price is $> +2.5\%$ above the base pivot, **ABORT**.

### Phase 3: 11:15 AM – 01:30 PM (Live Execution Window)
1. **Bypass Opening Noise:** Avoid the chaotic first 15 minutes (11:00–11:15 AM).
2. **Audit Relative Volume:** Ensure live RVOL $\ge 1.4\times$.
3. **Order Placement:** Place a **TMS LIMIT ORDER** strictly at `[Entry Low]`. **NEVER use market orders.**

### Phase 4: 03:15 PM – 04:00 PM (Post-Market Floorsheet Audit)
1. **Floorsheet Verification:** Audit the broker registry. Did Broker #58, #45, #34, or #17 net accumulate?
2. **Log in Journal:** Record entry price, stop-loss floor, and target levels in your trading journal.

---

## 11. Real-World Case Studies & Forensic Breakdown

### Case Study 1: GHL — Why Buying Euphoria at Rs. 283.5 was a Trap

* **Background:** User bought 20 shares of GHL at **Rs. 283.5**.
* **What the Radar Indicated:** The radar flipped from *Day 1 Stealth Accumulation* to `⚠️ EUPHORIA_DISTRIBUTION`.

#### Forensic Breakdown:
1. **The Stealth Phase:** GHL was quietly accumulated in Phase B between **Rs. 268 – Rs. 276** by Brokers #58, #42, and #34.
2. **The Intraday Spike:** When price broke above Rs. 280 and pushed toward Rs. 285+, retail traders saw the green candle and rushed in with market orders.
3. **The Distribution Churn:** 
   * Volume spiked to $>2.0\times$ normal turnover.
   * Instead of continuing upward, a **prominent upper rejection wick formed ($>45\%$)**.
   * Top buyer brokers began feeding their accumulated inventory into the retail buying frenzy.
4. **The Lesson:** 
   * Buying at **Rs. 283.5** violated the **Chase Cap Rule** (buying at the top of the range instead of the Rs. 268–276 base).
   * **Action Plan:** Hold the 20 shares until Demat clearance ($T+2$), do NOT add more shares, and sell to harvest profit if price tests Target 1 (Rs. 295–312), or exit strictly if it breaks below the Rs. 258 stop-loss floor.

---

### Case Study 2: HDL — High-PE Breakout vs. Low-Risk Pullback

* **Telemetry Captured in App:** LTP = Rs. 1,312 | P/E = 40.1x | Graham V* = Rs. 322.6 | 50 SMA = Rs. 1,285.8 | RVOL = 4.39x | BCR₃ = 57.5% (Brokers #58, #29, #57).
* **The Dilemma:** Strong institutional accumulation (BCR₃ = 57.5%), but price is already extended at Rs. 1,312 with Target 1 at Rs. 1,390 (+4.7%) and Stop-Loss at Rs. 1,266 (-3.5%).
* **Risk:Reward Calculation:**
  $$\text{Net R:R} = \frac{4.7\%}{3.5\%} = 1.34 : 1 \quad (\text{Sub-optimal; below institutional 2.5:1 hurdle})$$
* **The Professional Playbook:**
  * **Do NOT chase at Rs. 1,312.**
  * Wait for a low-volume pullback into the 50-day SMA support corridor at **Rs. 1,265 – Rs. 1,285** with stop-loss at Rs. 1,240.
  * Entering on the pullback expands your upside to $+8.5\%$ and tightens risk to $-2.5\%$, lifting your **Risk:Reward ratio to $> 3.4 : 1$**!

---

### Case Study 3: SHIVM — Multi-Session Cornering into Markup

* **Telemetry:** 
  * Day 1: Flat price (+0.56%), Volume = 78,500 kitta, BCR₃ = 48.2% (Broker #58 taking 24.1%).
  * Day 2: Flat price (+0.74%), Volume = 78,500 kitta, BCR₃ = 48.2%, Net Absorption = 82%.
  * Badge Fired: `🔥 Day 2 Multi-Session Absorption (Prime Entry)`.
* **Execution:**
  * Entered on Day 2 near base (Rs. 538) with stop-loss at Rs. 515 (-4.2%).
  * On Day 4, float was fully locked. Operators triggered the markup with a $+8.5\%$ expansion on record turnover.
  * Target 1 hit at Rs. 580 (+7.8% net) $\rightarrow$ Sold 35% shares and moved stop to Breakeven (Rs. 538).
  * Target 2 hit at Rs. 625 (+16.1% net) $\rightarrow$ Sold 35% shares and trailed stop to Rs. 580.
  * Remaining 30% runner held until consecutive close below 20-EMA at Rs. 660 (+22.6% net).
* **Outcome:** Clean, low-stress, mathematically sound +14.8% average portfolio gain.

---

## 12. Complete Trading Glossary & Key Terms

* **BCR₃ (Broker Concentration Ratio 3):** The percentage share of total buy volume cornered by the top 3 purchasing broker members. $\ge 40\%$ indicates institutional accumulation.
* **BSR (Buyer-to-Seller Trade Size Ratio):** Average buy volume per trade divided by average sell volume per trade. Values $\ge 1.4\times$ confirm whale accumulation.
* **QAI (Quiet Accumulation Index):** Proprietary 0–100 score measuring price tightness, broker asymmetry, float impact, and net absorption before markup.
* **VDU (Volume Dry-Up):** Wyckoff Phase C phenomenon where volume shrinks to $\le 0.50\times$ normal, proving floating supply is exhausted.
* **VCP (Volatility Contraction Pattern):** Sequential tightening of daily price spreads (Mark Minervini setup) preceding explosive breakouts.
* **OBIR (Order Book Imbalance Ratio):** Pre-open depth metric measuring buyer bid volume against seller offer volume.
* **Churn Trap (Effort vs. Result Failure):** Abnormally high turnover with tiny price progress and upper rejection wicks, indicating smart money is dumping into retail bids.
* **Chase Cap:** The maximum price ceiling (+2.5% above base pivot) beyond which fresh buy orders are strictly forbidden.
* **Zero-Loss Switch:** The tactical action of moving stop-loss to entry price immediately upon reaching Target 1.
* **Capital Defense Mode:** Quantitative directive to hold 70%–80% cash when market breadth falls below institutional safety levels.

---

*Document compiled strictly for quantitative personal study and trade discipline in the Nepal Stock Exchange (NEPSE).*
*SEBON Statutory Compliance: Fourth Amendment Bylaws 2082 & Finance Act 2083.*
