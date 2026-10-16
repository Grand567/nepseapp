# MASTER AUDIT INSTRUCTION & SYSTEM BRIEF FOR GEMINI 4 ARGON

**Role:** You are acting as a **Principal Quantitative Systems Engineer & Senior Financial Software Security Auditor**.
**Target Application:** **Drabyashree NEPSE** (Institutional-grade Nepalese Equity Workstation, Algorithmic Stock Screener & Cross-Platform Mobile/Desktop Application).
**Tech Stack:** React 18, TypeScript, TailwindCSS, TradingView lightweight-charts, Node.js Express Proxy, PostgreSQL, Capacitor (Android Native), Electron (Windows PC).
**Execution Context:** Production backend deployed on Render (`https://nepseapp.onrender.com`), consuming live NEPSE NOTS API, Chukul floorsheet, and ShareSansar data.

---

## AUDIT OBJECTIVES & METHODOLOGY

Review the provided codebase partitions against the 6 core dimensions below. Provide a rigorous, highly specific, line-by-line audit report identifying any mathematical edge cases, concurrency hazards, race conditions, memory leaks, security vulnerabilities, or logic flaws.

### Dimension 1: Financial & Quantitative Mathematical Integrity
1. **Zero-Sum Broker Conservation Law:**
   - In floorsheet aggregation, verify that every transaction maintains:
     $$\sum_{\text{all brokers}} \text{BuyQty} \equiv \sum_{\text{all brokers}} \text{SellQty} \equiv \text{Total Traded Volume}$$
   - Verify that for every broker:
     $$\text{NetQty} = \text{BuyQty} - \text{SellQty}$$
   - Ensure wash sales (buyer broker == seller broker) are handled transparently without double-counting volume.
2. **Broker Concentration Ratios (BCR3 & BCR5):**
   - Confirm mathematical formula:
     $$\text{BCR3}_{\text{Buy}} = \left( \frac{\sum_{i=1}^3 \text{BuyQty}_i}{\text{Total Traded Volume}} \right) \times 100$$
   - Check for division by zero guards when total volume is 0.
3. **Statutory SEBON Commission & CGT Tax Engine:**
   - Verify compliance with Nepal SEBON retail equity commission slabs (0.40% under 50k, 0.37% up to 5L, 0.34% up to 20L, 0.27% above 20L).
   - Verify SEBON regulatory fee ($0.015\%$), DP charge (flat Rs. 25), and retail Individual Short-Term CGT ($7.5\%$ on net profit).
4. **Technical Indicator Accuracy:**
   - RSI(14) Wilder's smoothed moving average, EMA(20/50/200), Bollinger Bands (20, 2), MACD(12,26,9), VWAP, and classical Pivot Points.

### Dimension 2: Real-Time Data Pipeline & Anti-Hallucination
1. **Multi-Tier Scraper & Fallback Cascade:**
   - Tier 1: Official NEPSE NOTS session token exchange.
   - Tier 2: Chukul date-wise historical floorsheet API.
   - Tier 3: ShareSansar session floorsheet scrape.
   - Tier 4: MeroLagani fallback.
   - Verify that fallback logic NEVER fabricates mock data in production mode, and always raises or preserves authentic data integrity.
2. **Multi-Timeframe Scaling (1D vs 15D vs 30D):**
   - Verify that multi-day floorsheet queries dynamically aggregate unique historical dates from disk vault files and never return static repeated rows.

### Dimension 3: Concurrency, Memory & Socket Reliability
1. **Render 512MB RAM Container Stability:**
   - Inspect asynchronous loops in `brokerVault.mjs` and `server.mjs`. Verify concurrency limits (`CONCURRENCY <= 4`), pause delays, and stream buffering to ensure Node.js never crashes from OOM (Out Of Memory).
2. **Sub-3s Fast Vault Snapshot Response:**
   - Verify the `Promise.race` ceiling on multi-day broker requests that returns fast on-disk vault snapshots in $\le 2.8\text{s}$ while delegating full sync to background workers.
3. **Connection Pooling & AbortSignal:**
   - Ensure `AbortSignal.timeout(45000)` is respected across both web and native Capacitor HTTP bridges.

### Dimension 4: Security, Secrets & Vulnerabilities
1. **Hardcoded Secrets:** Verify zero API keys, service account credentials, or passwords exist in frontend bundles.
2. **Input Sanitization:** Verify SQL queries use parameterized clauses ($1, $2) and prevent SQL injection in `db.mjs`.
3. **CORS & Rate Limiting:** Verify Express rate limiters protect the Render endpoint against DDoS and scraping abuse.

### Dimension 5: Trading Psychology & Strategy Edge
1. **Setup Analyzer Order Constraints:**
   - Verify that for Long setups:
     $$\text{StopLoss} < \text{Entry Zone Min} \le \text{Entry Zone Max} < \text{Target 1} < \text{Target 2}$$
   - Verify minimum Risk-Reward ratio $\ge 2.0$ enforcement.
2. **Wyckoff & Smart Money Flow Radar:**
   - Verify accumulation vs distribution detection signals based on Top-5 broker net absorption vs retail volume spread.

### Dimension 6: Cross-Platform Native Runtime (Android & PC)
1. **Capacitor Mobile Native Bridge:**
   - Safe area insets, back button hardware handler, push notification token listener.
2. **Electron PC Window Manager:**
   - IPC communication, native menu bar, updater blockmaps, and window state persistence.

---

## DESIRED AUDIT DELIVERABLES FROM GEMINI 4 ARGON

Please structure your audit response in the following format:
1. **Executive Scorecard & Certification:** Overall system health score (0-100), production-readiness verdict.
2. **Critical Vulnerabilities & Edge Cases:** Any high-severity bugs, race conditions, or financial calculation discrepancies.
3. **Quantitative & Formula Verification Table:** Comparative analysis of all mathematical implementations vs textbook financial theory.
4. **Performance & Memory Recommendations:** Concrete optimizations for low-memory Render containers and mobile CPU efficiency.
5. **Concrete Drop-In Code Patches:** Exact code blocks for any suggested fixes.
