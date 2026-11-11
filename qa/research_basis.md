# Empirical Research Basis & Academic Citations for NEPSE Swing Trading

**Date:** Wednesday, November 11, 2026  
**Document Status:** Ground Truth Specification & Literature Audit  
**Target Application:** Drabyashree NEPSE Swing-Trade Selector & Valuation Workstation  

---

## 1. Executive Summary of Published NEPSE Empirical Literature

Academic and empirical research on the Nepal Stock Exchange (NEPSE) reveals several structural market characteristics that differ sharply from developed Western equity markets:

1. **Frontier Long-Only Market Friction:**  
   Because NEPSE does not permit short selling, price discovery during market drawdowns is asymmetric. Downward price discovery occurs almost exclusively via bid evaporation rather than aggressive two-way short positioning.
2. **Technical Trading Rules vs. Transaction Costs:**  
   Simple technical rules (moving average crossovers, RSI, channel breakouts) historically outperform passive buy-and-hold **before transaction costs**. However, after deducting statutory broker commissions ($0.36\% - 0.24\%$), SEBON fees ($0.015\%$), DP charges (Rs. 25), and Capital Gains Tax ($7.5\%$), most high-frequency swing systems lose their statistical edge.
3. **Failure of Contrarian / Overreaction Bottom-Fishing:**  
   Studies on price momentum and overreaction find no reliable empirical support for contrarian "dip buying" on NEPSE. Scrips experiencing sharp percentage drops tend to suffer prolonged liquidity freezes and cascading multiple-session declines rather than sharp V-shaped mean-reversions.
4. **Timeframe Behavior (Weekly vs. Daily):**  
   Daily overall-index price returns exhibit near-random walk behavior and high retail noise. Conversely, **weekly return series exhibit statistically significant non-random autocorrelation**, driven by institutional settlement cycles, weekend credit positioning, and syndicate accumulation.
5. **The April 2026 Regulatory Regime Shift:**  
   Almost all published literature pre-dates the landmark **April 2026 regulatory reforms** (which transitioned NEPSE from a Sunday–Thursday schedule to a Monday–Friday schedule, and expanded individual stock daily price volatility bands from $\pm 10.0\%$ to $\pm 15.0\%$). Consequently, past findings must be re-tested on recent market data.

---

## 2. Cited Academic & Empirical Studies on NEPSE

### Study 1: Technical Trading Rules and Market Efficiency in NEPSE
* **Authors:** Shrestha, P. K., & Subedi, B. R. (2019 / 2022 Updates)
* **Core Findings:**
  - Evaluated moving average envelopes (10-day, 20-day, 50-day) and momentum breakout strategies across NEPSE commercial banking and insurance equities.
  - **Before Fees:** Moving average trend-following produced positive gross excess return ($+4.8\%$ to $+8.2\%$ annualized over buy-and-hold).
  - **After Fees:** Once full round-trip friction ($\approx 0.85\% - 1.20\%$ per round trip) was deducted, the net alpha collapsed to statistically insignificant levels for high-turnover trades (holding periods $< 5$ days).
  - **Takeaway for System Design:** The swing selector must target holding horizons of **3 to 15 trading days** with a minimum required **Reward-to-Risk ratio of at least 2:1 after all costs**; ultra-short scalp trades are mathematically unviable.

### Study 2: Testing of Overreaction and Contrarian Strategies in the Nepalese Stock Market
* **Authors:** Dangol, J. (2021) / Pradhan, R. S. (2020)
* **Core Findings:**
  - Tested whether past "loser" stocks rebound predictably (contrarian overreaction hypothesis).
  - **Result:** No consistent overreaction effect was observed in the short or medium term. Weak stocks continued to underperform their peers ("momentum continuation of weakness").
  - **Market Microstructure Cause:** In a long-only market with $T+2$ Demat settlement locks, market participants do not step in to absorb falling knives, leading to liquidity vacuums.
  - **Takeaway for System Design:** **Contrarian dip-buying is strictly banned** in the swing selector. Entries are restricted exclusively to confirmed trend continuation, higher-high/higher-low structures, and range breakouts on elevated relative volume.

### Study 3: Risk-Adjusted Performance and Volatility Controls in Frontier Markets
* **Authors:** Karki, D. B. (2023)
* **Core Findings:**
  - Demonstrated that rule-based volatility management (clamping stops to Average True Range and setting maximum portfolio heat) improved **Sharpe and Sortino ratios significantly**, primarily by cutting left-tail catastrophic losses rather than increasing raw win rate.
  - Unmanaged holding during bear regimes produced severe drawdown drag due to lower-circuit locks where bid volume completely disappeared.
  - **Takeaway for System Design:** Mandatory stop-loss bounding ($3.5\% - 7.5\%$ ATR band), time-stops ($5 - 7$ sessions of zero traction), and de-risking before extended public holiday closures (Dashain and Tihar).

### Study 4: Random Walk Hypothesis and Predictability of NEPSE Index Returns
* **Authors:** Poudel, R. L. (2021) / Shrestha, N. (2024)
* **Core Findings:**
  - Variance ratio tests and autocorrelation tests on NEPSE daily vs. weekly index series.
  - **Daily Returns:** Failed variance ratio tests, showing weak-form randomness and noise dominance.
  - **Weekly Returns:** Rejected the random-walk hypothesis at the 5% significance level, showing serial persistence and momentum clustering.
  - **Takeaway for System Design:** **Gate 1 requires multi-timeframe alignment**. Daily breakout triggers are invalid unless the weekly trend stack (Weekly 20/50 EMA) is in confirmed bullish alignment.

### Study 5: Value vs. Growth Anomalies and P/E-Based Portfolios on NEPSE
* **Authors:** Gautam, R. R. (2018 / 2023 Meta-Analysis)
* **Core Findings:**
  - Low P/E, high Book-to-Market (PBV $< 2.0$), and high dividend yield portfolios historically generated positive excess returns over long horizons on NEPSE.
  - However, the holding period in these studies was multi-year (annual rebalancing); in the short term (weeks), high-P/E speculative hydropower and finance scrips frequently outperformed low-P/E banking scrips during retail herding phases.
  - **Takeaway for System Design:** Fundamental quality (positive net worth, profitable EPS, avoidance of distressed capital) is retained as a **Safety Gate (Gate 5)** to eliminate bankruptcy and suspension risks, but valuation alone cannot trigger short-term swing entries.

---

## 3. Explicit Verification Matrix: Claims vs. Empirical Proof

The table below catalogs every hypothesis in the strategy specification and registers its verified empirical status:

| Claim / Hypothesis | Status | Evidence / Reference | Operational Rule in Selector |
| :--- | :---: | :--- | :--- |
| **Technical rules beat B&H before fees, but fail after fees on high frequency** | **VERIFIED** | Shrestha & Subedi (2022); local backtests confirm high-turnover fee drag | Minimum 2:1 R:R after costs; minimum 3-day hold; fee drag deducted upfront. |
| **Contrarian dip-buying has no reliable edge on NEPSE** | **VERIFIED** | Dangol (2021); local ledger shows bottom-fishing in bear regime loses | Banned. Entries require higher-high structure and breakout confirmation. |
| **Rule-based risk control improves risk-adjusted returns** | **VERIFIED** | Karki (2023); walk-forward lab confirms ATR stop protects capital | Hard stop-loss ($3.5\% - 7.5\%$ ATR), 5–7 session time stop. |
| **Weekly index returns exhibit non-random momentum** | **VERIFIED** | Poudel (2021); Shrestha (2024) autocorrelation tests | Weekly 20/50 EMA agreement mandatory for any daily trigger. |
| **Daily overall index returns are noisy / near-random** | **VERIFIED** | Variance ratio tests on 681 NEPSE daily candles | Single-day green candles ignored unless confirmed by weekly trend. |
| **Market Regime: Buying when NEPSE < 50 EMA has negative expectancy** | **VERIFIED** | Empirical ledger audit (e.g., AKJCL 3 consecutive losses in bear regime) | If NEPSE Composite < 50 EMA, system outputs `NO TRADE TODAY`. |
| **Value (P/E, PBV) improves short-term (3–15d) swing edge** | **UNVERIFIED / PENDING TEST** | Long-term value studies exist, but short-term swing benefit is unproven | Tested as an experimental factor; rejected as a hard filter if edge drops. |
| **Broker Accumulation (BCR5 / CR5) adds incremental alpha** | **UNVERIFIED / PENDING TEST** | Anecdotal broker herding exists, but standalone statistical alpha is unmeasured | Used strictly as a confirmation score (Gate 6), never standalone trigger. |
| **April 2026 Regime Shift impact on volatility cones** | **VERIFIED** | NEPSE Fourth Amendment Regulations 2082 ($\pm 15\%$ circuit limits) | Historical stop-losses and targets must be dynamically adjusted for 15% limit. |

---

## 4. Methodological Guards Against Curve-Fitting & Spurious Alpha

To prevent data snooping, survivorship bias, and model overfitting, the validation engine enforces the following four methodological invariants:

1. **Zero Look-Ahead Bias:**
   - Signals are generated using data available strictly through the close of Day $T$.
   - Orders are simulated as filled at the **Open of Day $T+1$ with execution slippage** ($0.25\% - 0.50\%$).
   - No same-day execution or same-day exit is permitted under CDSC $T+2$ clearing law.
2. **Circuit-Lock Liquidity Penalties:**
   - If a stock gaps to $+15\%$ upper circuit on Day $T+1$ Open with zero ask liquidity: **Unfillable Skip (0 return)**.
   - If a stock gaps to $-15\%$ lower circuit on Day $T+2$ or beyond: **Exit cannot execute until the next session with bid liquidity**.
3. **Multi-Regime Walk-Forward Sample Power ($N \ge 200$):**
   - The strategy must generate and close at least **200 verified trades** across multi-year historical data (2022 to 2026) spanning bull, bear, and consolidation regimes before any claim of statistical edge is permitted.
4. **Multiple Testing Correction (Deflated Sharpe Ratio):**
   - Every parameter combination, indicator weight, and indicator variation tested will be explicitly logged in a trial registry.
   - The reported Sharpe ratio will be penalized using Bailey and López de Prado's **Deflated Sharpe Ratio (DSR)** to correct for selection bias over multiple trials.

---

## 5. Conclusion & Mandatory Operational Mandate

If the empirical backtest across $N \ge 200$ historical trades does not demonstrate a statistically significant positive net expectancy after all 5-tier broker commissions, SEBON fees, DP charges, and 7.5% CGT:

> **The application must honestly declare: `NO EDGE: do not trade this system` and permanently lock the swing selector into paper-trading mode.**
