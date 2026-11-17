# Drabyashree NEPSE Quantitative Reference Formulas (`qa/formulas.md`)

This document codifies the canonical mathematical definitions, statutory regulations, and algorithmic formulas used by the independent Oracle and the Drabyashree NEPSE platform.

---

## 1. Statutory Exchange Regulations & Regime Mandates (Nepal 2082/2083)

### 1.1 Trading Hours & Calendar Cycle
* **Weekly Schedule:** Monday through Friday, 11:00 AM – 3:00 PM Asia/Kathmandu (`NPT`).
* **Regime Shift (April 2026 Mandate):** Friday is a full continuous trading session (11:00–15:00); Sunday is an official exchange weekend closure.
* **Pre-Open Session:** 10:30 AM – 10:45 AM NPT (order entry, price determination).
* **Continuous Session:** 11:00 AM – 3:00 PM NPT.
* **Closed Sessions:** Saturday, Sunday, and official Nepal Government gazetted public holidays (e.g., Dashain, Tihar, Chhath).
* **Settlement Standard:** CDSC T+2 rolling settlement. Demat credit is realized on Day T+2; sellable on Day T+3.

### 1.2 Circuit Breaker Limits (Daily Price Fluctuation Band)
* **Authority:** Securities Board of Nepal (SEBON) / Nepal Securities Trading Bylaws (Fourth Amendment 2082).
* **Circuit Band:** $\pm 15.0\%$ of the previous trading session's official closing price (`prev_close`).
  $$\text{Circuit Ceiling} = \text{prev\_close} \times 1.15$$
  $$\text{Circuit Floor} = \text{prev\_close} \times 0.85$$
* **Index Circuit Breakers:**
  * $1^{\text{st}}$ Breaker: $4\%$ move $\rightarrow$ 20 minutes halt.
  * $2^{\text{nd}}$ Breaker: $5\%$ move $\rightarrow$ 40 minutes halt.
  * $3^{\text{rd}}$ Breaker: $6\%$ move $\rightarrow$ Session suspended for the remainder of the day.

---

## 2. Core Market Microstructure & Session Metrics

### 2.1 Daily Price & Change %
* **Change (NPR):**
  $$\Delta P = \text{LTP} - \text{prev\_close}$$
* **Percentage Change (%):**
  $$\%\Delta P = \left( \frac{\text{LTP} - \text{prev\_close}}{\text{prev\_close}} \right) \times 100$$
* *Flagged Edge Case:* If `prev_close` is absent or 0, fallback to `open_price`. If both absent, return 0.

### 2.2 Volume Weighted Average Price (VWAP)
* **Session VWAP:**
  $$\text{VWAP} = \frac{\sum_{i=1}^{N} (\text{Rate}_i \times \text{Kitta}_i)}{\sum_{i=1}^{N} \text{Kitta}_i} = \frac{\text{Total Turnover}}{\text{Total Volume}}$$
* **Multi-Day / Window VWAP (5D, 15D, 30D):**
  Calculated across settled trading sessions only, skipping non-trading calendar dates.

---

## 3. Statutory Transaction Frictions & Cost Accounting

### 3.1 Broker Commission (5-Tier Statutory Schedule)
Mandated by SEBON Directive on Equity Brokerage Commissions:
| Transaction Tranche (NPR) | Statutory Commission Rate | Minimum Commission |
| :--- | :---: | :---: |
| $\le \text{Rs. } 50,000$ | $0.36\%$ | Rs. 10.00 |
| $\text{Rs. } 50,001 - \text{Rs. } 500,000$ | $0.33\%$ | — |
| $\text{Rs. } 500,001 - \text{Rs. } 2,000,000$ | $0.31\%$ | — |
| $\text{Rs. } 2,000,001 - \text{Rs. } 10,000,000$ | $0.27\%$ | — |
| $> \text{Rs. } 10,000,000$ | $0.24\%$ | — |

### 3.2 Regulatory & Clearing Fees
* **SEBON Regulatory Fee:** Strictly $0.015\%$ ($0.00015$) of total transaction turnover.
* **CDSC Depository Participant (DP) Fee:** Flat Rs. 25.00 per scrip sold or bought per day.

### 3.3 Weighted Average Cost of Capital (WACC)
Calculates fiduciary cost basis including statutory acquisition frictions:
$$\text{Total Buy Outlay} = \text{Gross Buy Amount} + \text{Broker Commission} + \text{SEBON Fee} + \text{DP Fee}$$
$$\text{WACC} = \frac{\text{Total Buy Outlay}}{\text{Total Acquired Kitta}}$$

### 3.4 Net Receivable & Capital Gains Tax (CGT)
* **Gross Sell Proceeds:** $\text{Quantity} \times \text{Sell Rate}$
* **Net Sell Receivable (Pre-Tax):**
  $$\text{Net Receivable} = \text{Gross Sell Proceeds} - (\text{Sell Commission} + \text{Sell SEBON Fee} + \text{DP Fee})$$
* **Capital Gain:**
  $$\text{Capital Gain} = \text{Net Receivable} - (\text{WACC} \times \text{Quantity})$$
* **Tax Rates (Income Tax Act):**
  * Individual Short-Term ($< 365 \text{ days}$ holding): $7.5\%$ on Capital Gain
  * Individual Long-Term ($\ge 365 \text{ days}$ holding): $5.0\%$ on Capital Gain
  * Institutional / Corporate: $10.0\%$ on Capital Gain

---

## 4. Smart Money Flow & Broker Concentration

### 4.1 Broker Concentration Ratios (BCR3 & BCR5)
Measures the proportion of buying volume captured by the top 3 or top 5 accumulators:
$$\text{BCR3} = \left( \frac{\sum_{i=1}^{3} \text{Net Kitta Bought}_i}{\text{Total Net Buying Volume}} \right) \times 100$$
$$\text{BCR5} = \left( \frac{\sum_{i=1}^{5} \text{Net Kitta Bought}_i}{\text{Total Net Buying Volume}} \right) \times 100$$

### 4.2 Lead Broker Retention Rate
$$\text{Retention Rate} = \left( \frac{\text{Buy Volume} - \text{Sell Volume}}{\text{Buy Volume}} \right) \times 100$$
* High Conviction Shelf: $> 75\%$ retention.
* High Churn / Day-Trading Warning: $< 50\%$ retention.

### 4.3 Anti-Demat Dump Guard (T+2 Liquidation Veto)
Identifies when a leading institutional accumulator from Day $T-2$ or $T-3$ begins net dumping shares into retail demand:
$$\text{Dump Trap Triggered} \iff \text{Net Kitta Sold Today} \ge 0.50 \times \text{Past Accumulated Position}$$

---

## 5. Technical Indicators & Oscillators

### 5.1 Exponential Moving Average (EMA)
For period $N$ ($N \in \{20, 50, 200\}$):
$$k = \frac{2}{N + 1}$$
$$\text{EMA}_t = (P_t \times k) + (\text{EMA}_{t-1} \times (1 - k))$$
* Seed: Simple Moving Average (SMA) of the initial $N$ closing prices.

### 5.2 Relative Strength Index (RSI - Wilder 14-period)
$$\text{RS} = \frac{\text{Wilder Average Gain}_{14}}{\text{Wilder Average Loss}_{14}}$$
$$\text{RSI} = 100 - \left( \frac{100}{1 + \text{RS}} \right)$$

### 5.3 Average True Range (ATR - Wilder 14-period)
$$\text{True Range (TR)} = \max\left( \text{High}_t - \text{Low}_t, \, |\text{High}_t - \text{Close}_{t-1}|, \, |\text{Low}_t - \text{Close}_{t-1}| \right)$$
$$\text{ATR}_t = \frac{(\text{ATR}_{t-1} \times 13) + \text{TR}_t}{14}$$

---

## 6. Corporate Action Price Adjustments

### 6.1 Bonus Share Adjustment
$$\text{Adjusted Price} = \frac{\text{LTP}}{1 + \left(\frac{\text{Bonus } \%}{100}\right)}$$

### 6.2 Right Share Adjustment
$$\text{Adjusted Price} = \frac{\text{LTP} + \left( \frac{\text{Right } \%}{100} \times \text{Face Value (Rs. 100)} \right)}{1 + \left(\frac{\text{Right } \%}{100}\right)}$$

---

## 7. Flagged / Unusual NEPSE Mathematical Anomalies

1. **Volume Conservation Discrepancy:**
   In NEPSE floorsheet records, each matching trade lists both buyer and seller broker. In naive floorsheet parsing, counting both buyer and seller legs doubles the turnover/volume. The Oracle strictly sums buyer legs only (or divides total legs by 2) to match exchange-certified volume.
2. **Promoter vs Ordinary Equities:**
   Promoter shares (e.g., `HIDCLP`) trade under separate ticker symbols with restricted liquidity and discounted pricing. Mixing promoter shares with ordinary equities in cornering screens produces artificial low-float distortion.
3. **Microfinance Scrips Ending in 'BS':**
   Equities like `NMFBS` are Class D microfinance banks, not mutual funds (`MF`) or promoter shares (`PF`). String-based regex filters must distinguish between `BS` and `MF`.
