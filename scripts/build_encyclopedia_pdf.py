import re
import os
import subprocess
import markdown

SRC_MD = r"C:\Users\Hp\.gemini\antigravity\brain\17baa2e9-d468-4c95-bcc3-58a3829b3a89\drabyashree_nepse_master_investor_encyclopedia.md"
OUT_HTML = r"c:\Users\Hp\Desktop\Software\nepse app\Drabyashree-NEPSE-Master-Investor-Encyclopedia.html"
OUT_PDF_DESKTOP = r"C:\Users\Hp\Desktop\Drabyashree-NEPSE-Master-Investor-Encyclopedia.pdf"
OUT_PDF_WORKSPACE = r"c:\Users\Hp\Desktop\Software\nepse app\Drabyashree-NEPSE-Master-Investor-Encyclopedia.pdf"
OUT_PDF_ARTIFACT = r"C:\Users\Hp\.gemini\antigravity\brain\17baa2e9-d468-4c95-bcc3-58a3829b3a89\Drabyashree-NEPSE-Master-Investor-Encyclopedia.pdf"

# 1. High-resolution SVGs for the 6 Mermaid diagrams
SVG_DIAGRAM_1 = """
<div class="diagram-wrapper">
  <div class="diagram-title">Figure 1.1 — The 6-Gate Decision Precedence Hierarchy</div>
  <svg viewBox="0 0 850 420" xmlns="http://www.w3.org/2000/svg" class="flow-svg">
    <defs>
      <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="gGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
      <linearGradient id="gGreen" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.25"/>
      </filter>
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8"/>
      </marker>
    </defs>
    <!-- Pipeline Nodes -->
    <!-- Node 1 -->
    <rect x="50" y="20" width="750" height="48" rx="8" fill="url(#g1)" stroke="#3b82f6" stroke-width="2" filter="url(#shadow)"/>
    <text x="70" y="50" fill="#60a5fa" font-size="14" font-weight="bold">GATE 1</text>
    <text x="140" y="50" fill="#f8fafc" font-size="13" font-weight="600">Regulatory & Solvency Gate</text>
    <text x="420" y="50" fill="#94a3b8" font-size="12">CAR ≥ 11.5% • NPL ≤ 3.5% • No Promoter Lock-in Expiry Dump</text>

    <line x1="425" y1="68" x2="425" y2="86" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)"/>

    <!-- Node 2 -->
    <rect x="50" y="88" width="750" height="48" rx="8" fill="url(#g1)" stroke="#06b6d4" stroke-width="2" filter="url(#shadow)"/>
    <text x="70" y="118" fill="#22d3ee" font-size="14" font-weight="bold">GATE 2</text>
    <text x="140" y="118" fill="#f8fafc" font-size="13" font-weight="600">Order Flow & Floorsheet Gate</text>
    <text x="420" y="118" fill="#94a3b8" font-size="12">No Distribution Trap • BCR₃ Buy > BCR₃ Sell • Stealth Accumulation</text>

    <line x1="425" y1="136" x2="425" y2="154" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)"/>

    <!-- Node 3 -->
    <rect x="50" y="156" width="750" height="48" rx="8" fill="url(#g1)" stroke="#8b5cf6" stroke-width="2" filter="url(#shadow)"/>
    <text x="70" y="186" fill="#a78bfa" font-size="14" font-weight="bold">GATE 3</text>
    <text x="140" y="186" fill="#f8fafc" font-size="13" font-weight="600">Market Structure Gate</text>
    <text x="420" y="186" fill="#94a3b8" font-size="12">Minervini Stage 2 Uptrend (SMA 200 Rising) • Wyckoff Phase C/D</text>

    <line x1="425" y1="204" x2="425" y2="222" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)"/>

    <!-- Node 4 -->
    <rect x="50" y="224" width="750" height="48" rx="8" fill="url(#g1)" stroke="#ec4899" stroke-width="2" filter="url(#shadow)"/>
    <text x="70" y="254" fill="#f472b6" font-size="14" font-weight="bold">GATE 4</text>
    <text x="140" y="254" fill="#f8fafc" font-size="13" font-weight="600">Candlestick & Pivot Gate</text>
    <text x="420" y="254" fill="#94a3b8" font-size="12">Reversal Candlestick Confirmation • LTP ≤ Chase Cap (+2.5% max limit)</text>

    <line x1="425" y1="272" x2="425" y2="290" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)"/>

    <!-- Node 5 -->
    <rect x="50" y="292" width="750" height="48" rx="8" fill="url(#g1)" stroke="#f59e0b" stroke-width="2" filter="url(#shadow)"/>
    <text x="70" y="322" fill="#fbbf24" font-size="14" font-weight="bold">GATE 5</text>
    <text x="140" y="322" fill="#f8fafc" font-size="13" font-weight="600">Execution Risk & Stop Gate</text>
    <text x="420" y="322" fill="#94a3b8" font-size="12">Risk/Reward Ratio ≥ 1:2.0 • Predetermined Hard Invalidation Stop Placed</text>

    <line x1="425" y1="340" x2="425" y2="358" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)"/>

    <!-- Final Execution Node -->
    <rect x="50" y="360" width="750" height="48" rx="8" fill="url(#gGreen)" stroke="#34d399" stroke-width="2" filter="url(#shadow)"/>
    <text x="425" y="390" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">✓ FINAL STAGE: ORDER EXECUTION & STRICT POSITION SIZING</text>
  </svg>
</div>
"""

SVG_DIAGRAM_2 = """
<div class="diagram-wrapper">
  <div class="diagram-title">Figure 4.1 — Entry / Exit Radar Execution Architecture</div>
  <svg viewBox="0 0 900 320" xmlns="http://www.w3.org/2000/svg" class="flow-svg">
    <defs>
      <linearGradient id="bgBox" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <marker id="arr2" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8"/>
      </marker>
    </defs>
    <!-- Step 1 -->
    <rect x="20" y="40" width="160" height="70" rx="8" fill="url(#bgBox)" stroke="#38bdf8" stroke-width="1.5"/>
    <text x="100" y="68" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">STEP 1: BREAKOUT</text>
    <text x="100" y="88" fill="#f8fafc" font-size="11" text-anchor="middle">Floor Pivot / Base</text>
    <text x="100" y="102" fill="#94a3b8" font-size="10" text-anchor="middle">Clearance Confirmed</text>

    <line x1="180" y1="75" x2="225" y2="75" stroke="#38bdf8" stroke-width="2" marker-end="url(#arr2)"/>

    <!-- Step 2 Decision -->
    <polygon points="300,35 375,75 300,115 225,75" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
    <text x="300" y="70" fill="#fbbf24" font-size="11" font-weight="bold" text-anchor="middle">LTP ≤ Chase Cap?</text>
    <text x="300" y="85" fill="#e2e8f0" font-size="10" text-anchor="middle">(Within +2.5%)</text>

    <!-- Branch No -->
    <line x1="300" y1="115" x2="300" y2="175" stroke="#f43f5e" stroke-width="2" marker-end="url(#arr2)"/>
    <rect x="220" y="175" width="160" height="50" rx="6" fill="#881337" stroke="#f43f5e" stroke-width="1.5"/>
    <text x="300" y="196" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">ABORT ORDER</text>
    <text x="300" y="212" fill="#fecdd3" font-size="10" text-anchor="middle">Do Not Chase Extension</text>

    <!-- Branch Yes -->
    <line x1="375" y1="75" x2="430" y2="75" stroke="#10b981" stroke-width="2" marker-end="url(#arr2)"/>
    <rect x="430" y="40" width="150" height="70" rx="8" fill="url(#bgBox)" stroke="#10b981" stroke-width="1.5"/>
    <text x="505" y="68" fill="#34d399" font-size="12" font-weight="bold" text-anchor="middle">STEP 2: BUY EXECUTION</text>
    <text x="505" y="86" fill="#f8fafc" font-size="11" text-anchor="middle">Entry Zone Filled</text>
    <text x="505" y="100" fill="#fb7185" font-size="10" text-anchor="middle">Stop Placed (-5% to -8%)</text>

    <line x1="580" y1="75" x2="635" y2="75" stroke="#38bdf8" stroke-width="2" marker-end="url(#arr2)"/>

    <!-- Step 3 Target 1 -->
    <rect x="635" y="40" width="240" height="70" rx="8" fill="url(#bgBox)" stroke="#06b6d4" stroke-width="1.5"/>
    <text x="755" y="65" fill="#22d3ee" font-size="12" font-weight="bold" text-anchor="middle">STEP 3: TARGET 1 (+8% to +12%)</text>
    <text x="755" y="83" fill="#34d399" font-size="11" font-weight="bold" text-anchor="middle">SELL 50% POSITION</text>
    <text x="755" y="99" fill="#fcd34d" font-size="10" text-anchor="middle">Raise Stop to Breakeven (0% Risk)</text>

    <!-- Down to Step 4 -->
    <line x1="755" y1="110" x2="755" y2="175" stroke="#38bdf8" stroke-width="2" marker-end="url(#arr2)"/>

    <rect x="635" y="175" width="240" height="60" rx="8" fill="url(#bgBox)" stroke="#a855f7" stroke-width="2"/>
    <text x="755" y="200" fill="#c084fc" font-size="12" font-weight="bold" text-anchor="middle">STEP 4: TARGET 2 (+18% to +25%)</text>
    <text x="755" y="218" fill="#e2e8f0" font-size="10" text-anchor="middle">Ride Runner Position with Trailing 20-EMA</text>
  </svg>
</div>
"""

SVG_DIAGRAM_3 = """
<div class="diagram-wrapper">
  <div class="diagram-title">Figure 7.1 — Interactive Chart Overlay Lines & Geometry</div>
  <svg viewBox="0 0 900 280" xmlns="http://www.w3.org/2000/svg" class="flow-svg">
    <rect x="10" y="10" width="880" height="260" rx="10" fill="#090d16" stroke="#1e293b" stroke-width="2"/>
    
    <!-- Legend Items Box -->
    <g transform="translate(30, 25)">
      <!-- Target 2 -->
      <line x1="10" y1="15" x2="60" y2="15" stroke="#34d399" stroke-width="3"/>
      <text x="75" y="19" fill="#34d399" font-size="12" font-weight="bold">Target 2 Line (Rs. T2)</text>
      <text x="240" y="19" fill="#94a3b8" font-size="11">Solid #34d399 (2px) — Major Fibonacci Extension Runner Exit (+18% to +25%)</text>

      <!-- Target 1 -->
      <line x1="10" y1="45" x2="60" y2="45" stroke="#10b981" stroke-width="3"/>
      <text x="75" y="49" fill="#10b981" font-size="12" font-weight="bold">Target 1 Line (Rs. T1)</text>
      <text x="240" y="49" fill="#94a3b8" font-size="11">Solid #10b981 (2px) — 50% Profit Realization & Breakeven Trigger (+8% to +12%)</text>

      <!-- Chase Cap -->
      <line x1="10" y1="75" x2="60" y2="75" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4"/>
      <text x="75" y="79" fill="#fbbf24" font-size="12" font-weight="bold">Chase Cap Line</text>
      <text x="240" y="79" fill="#94a3b8" font-size="11">Dashed #f59e0b (1.5px) — Invariant Maximum Entry Ceiling (Breakout Pivot +2.5%)</text>

      <!-- Breakout Pivot -->
      <line x1="10" y1="105" x2="60" y2="105" stroke="#10b981" stroke-width="2" stroke-dasharray="4,4"/>
      <text x="75" y="109" fill="#6ee7b7" font-size="12" font-weight="bold">Breakout Pivot Line</text>
      <text x="240" y="109" fill="#94a3b8" font-size="11">Dashed #10b981 (1.5px) — Key Base Hurdle / Resistance Trigger Point</text>

      <!-- Entry Zone Low -->
      <line x1="10" y1="135" x2="60" y2="135" stroke="#60a5fa" stroke-width="2" stroke-dasharray="2,3"/>
      <text x="75" y="139" fill="#60a5fa" font-size="12" font-weight="bold">Entry Zone Low</text>
      <text x="240" y="139" fill="#94a3b8" font-size="11">Dotted #60a5fa (1px) — Lower Accumulation Shelf Limit</text>

      <!-- Hard Stop -->
      <line x1="10" y1="165" x2="60" y2="165" stroke="#f43f5e" stroke-width="3"/>
      <text x="75" y="169" fill="#f43f5e" font-size="12" font-weight="bold">Invalidation Stop Line</text>
      <text x="240" y="169" fill="#94a3b8" font-size="11">Solid #f43f5e (2px) — Hard Capital Protection Floor (Unconditional Exit)</text>

      <!-- Moving Averages -->
      <line x1="10" y1="195" x2="60" y2="195" stroke="#38bdf8" stroke-width="2"/>
      <text x="75" y="199" fill="#38bdf8" font-size="12" font-weight="bold">EMA 20 / EMA 50 / 200</text>
      <text x="240" y="199" fill="#94a3b8" font-size="11">Cyan (#38bdf8 20d) • Amber (#f59e0b 50d) • Purple (#a855f7 200d Macro Trend)</text>

      <!-- Bollinger -->
      <line x1="10" y1="225" x2="60" y2="225" stroke="rgba(56, 189, 248, 0.7)" stroke-width="2" stroke-dasharray="3,3"/>
      <text x="75" y="229" fill="#93c5fd" font-size="12" font-weight="bold">Bollinger Bands (20, 2σ)</text>
      <text x="240" y="229" fill="#94a3b8" font-size="11">Upper/Lower Dotted Lines • Dashed Middle 20-SMA Baseline • Squeeze Alert &lt;5%</text>
    </g>
  </svg>
</div>
"""

SVG_DIAGRAM_4 = """
<div class="diagram-wrapper">
  <div class="diagram-title">Figure 8.1 — Technical Speedometer Consensus Architecture</div>
  <svg viewBox="0 0 900 240" xmlns="http://www.w3.org/2000/svg" class="flow-svg">
    <rect x="10" y="10" width="880" height="220" rx="10" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
    
    <!-- Moving Averages Column -->
    <rect x="30" y="30" width="220" height="180" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5"/>
    <text x="140" y="55" fill="#60a5fa" font-size="13" font-weight="bold" text-anchor="middle">6 Moving Averages</text>
    <text x="50" y="85" fill="#e2e8f0" font-size="11">• EMA (10) &amp; EMA (20)</text>
    <text x="50" y="110" fill="#e2e8f0" font-size="11">• SMA (50) &amp; EMA (50)</text>
    <text x="50" y="135" fill="#e2e8f0" font-size="11">• SMA (100)</text>
    <text x="50" y="160" fill="#e2e8f0" font-size="11">• SMA (200 Macro)</text>
    <text x="140" y="192" fill="#94a3b8" font-size="10" text-anchor="middle">Threshold: ±0.35% from LTP</text>

    <!-- Plus Sign -->
    <text x="280" y="128" fill="#38bdf8" font-size="28" font-weight="bold" text-anchor="middle">+</text>

    <!-- Oscillators Column -->
    <rect x="310" y="30" width="220" height="180" rx="8" fill="#1e293b" stroke="#06b6d4" stroke-width="1.5"/>
    <text x="420" y="55" fill="#22d3ee" font-size="13" font-weight="bold" text-anchor="middle">6 Technical Oscillators</text>
    <text x="330" y="85" fill="#e2e8f0" font-size="11">• RSI 14 (Wilder's)</text>
    <text x="330" y="110" fill="#e2e8f0" font-size="11">• MACD Histogram (12,26,9)</text>
    <text x="330" y="135" fill="#e2e8f0" font-size="11">• Stochastic %K (52W Range)</text>
    <text x="330" y="160" fill="#e2e8f0" font-size="11">• RVOL 20D • ADX • CCI</text>
    <text x="420" y="192" fill="#94a3b8" font-size="10" text-anchor="middle">Dynamic Multi-Timeframe Range</text>

    <!-- Arrow to Consensus -->
    <path d="M 540 120 L 590 120" stroke="#38bdf8" stroke-width="3" fill="none"/>
    <polygon points="590,115 600,120 590,125" fill="#38bdf8"/>

    <!-- Consensus & Speedometer -->
    <rect x="610" y="30" width="260" height="180" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
    <text x="740" y="55" fill="#34d399" font-size="13" font-weight="bold" text-anchor="middle">Speedometer Output</text>
    <text x="740" y="85" fill="#f8fafc" font-size="12" font-weight="bold" text-anchor="middle">Needle: -88° to +88°</text>
    <text x="740" y="110" fill="#cbd5e1" font-size="11" text-anchor="middle">Net Consensus: -12 to +12</text>
    <text x="740" y="145" fill="#34d399" font-size="12" font-weight="bold" text-anchor="middle">STRONG BUY (≥ +0.50)</text>
    <text x="740" y="165" fill="#fbbf24" font-size="11" text-anchor="middle">BUY • NEUTRAL • SELL</text>
    <text x="740" y="185" fill="#f43f5e" font-size="12" font-weight="bold" text-anchor="middle">STRONG SELL (≤ -0.50)</text>
  </svg>
</div>
"""

SVG_DIAGRAM_5 = """
<div class="diagram-wrapper">
  <div class="diagram-title">Figure 13.1 — Master Investor Decision Matrix & Trade Gatekeeper</div>
  <svg viewBox="0 0 880 430" xmlns="http://www.w3.org/2000/svg" class="flow-svg">
    <defs>
      <marker id="arr5" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8"/>
      </marker>
    </defs>
    <!-- Start -->
    <rect x="30" y="20" width="560" height="40" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
    <text x="310" y="45" fill="#f8fafc" font-size="13" font-weight="bold" text-anchor="middle">CANDIDATE STOCK IDENTIFIED</text>

    <!-- Reject Box -->
    <rect x="660" y="90" width="180" height="240" rx="8" fill="#881337" stroke="#f43f5e" stroke-width="2"/>
    <text x="750" y="195" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">ABORT TRADE</text>
    <text x="750" y="225" fill="#fecdd3" font-size="12" text-anchor="middle">Capital Protected</text>
    <text x="750" y="245" fill="#fecdd3" font-size="11" text-anchor="middle">Zero Execution</text>

    <!-- Gate 1 -->
    <line x1="310" y1="60" x2="310" y2="85" stroke="#38bdf8" stroke-width="2" marker-end="url(#arr5)"/>
    <rect x="30" y="85" width="560" height="45" rx="6" fill="#0f172a" stroke="#3b82f6" stroke-width="1.5"/>
    <text x="50" y="112" fill="#60a5fa" font-size="12" font-weight="bold">GATE 1:</text>
    <text x="120" y="112" fill="#f8fafc" font-size="12">NRB Solvency Directives (CAR ≥ 11.5% &amp; NPL ≤ 3.5%)?</text>
    <line x1="590" y1="107" x2="660" y2="107" stroke="#f43f5e" stroke-width="2" marker-end="url(#arr5)"/>
    <text x="625" y="100" fill="#f43f5e" font-size="10" font-weight="bold">NO</text>

    <!-- Gate 2 -->
    <line x1="310" y1="130" x2="310" y2="155" stroke="#10b981" stroke-width="2" marker-end="url(#arr5)"/>
    <rect x="30" y="155" width="560" height="45" rx="6" fill="#0f172a" stroke="#06b6d4" stroke-width="1.5"/>
    <text x="50" y="182" fill="#22d3ee" font-size="12" font-weight="bold">GATE 2:</text>
    <text x="120" y="182" fill="#f8fafc" font-size="12">Floorsheet Order Flow (No Distribution Trap &amp; BCR₃ Buy > Sell)?</text>
    <line x1="590" y1="177" x2="660" y2="177" stroke="#f43f5e" stroke-width="2" marker-end="url(#arr5)"/>
    <text x="625" y="170" fill="#f43f5e" font-size="10" font-weight="bold">NO</text>

    <!-- Gate 3 -->
    <line x1="310" y1="200" x2="310" y2="225" stroke="#10b981" stroke-width="2" marker-end="url(#arr5)"/>
    <rect x="30" y="225" width="560" height="45" rx="6" fill="#0f172a" stroke="#8b5cf6" stroke-width="1.5"/>
    <text x="50" y="252" fill="#a78bfa" font-size="12" font-weight="bold">GATE 3:</text>
    <text x="120" y="252" fill="#f8fafc" font-size="12">Market Structure (Minervini Stage 2 or Wyckoff Accumulation)?</text>
    <line x1="590" y1="247" x2="660" y2="247" stroke="#f43f5e" stroke-width="2" marker-end="url(#arr5)"/>
    <text x="625" y="240" fill="#f43f5e" font-size="10" font-weight="bold">NO</text>

    <!-- Gate 4 -->
    <line x1="310" y1="270" x2="310" y2="295" stroke="#10b981" stroke-width="2" marker-end="url(#arr5)"/>
    <rect x="30" y="295" width="560" height="45" rx="6" fill="#0f172a" stroke="#ec4899" stroke-width="1.5"/>
    <text x="50" y="322" fill="#f472b6" font-size="12" font-weight="bold">GATE 4:</text>
    <text x="120" y="322" fill="#f8fafc" font-size="12">Price Action &amp; Chase Cap (Reversal Candle &amp; LTP ≤ Pivot +2.5%)?</text>
    <line x1="590" y1="317" x2="660" y2="317" stroke="#f43f5e" stroke-width="2" marker-end="url(#arr5)"/>
    <text x="625" y="310" fill="#f43f5e" font-size="10" font-weight="bold">NO</text>

    <!-- Gate 5 & Execution -->
    <line x1="310" y1="340" x2="310" y2="365" stroke="#10b981" stroke-width="2" marker-end="url(#arr5)"/>
    <rect x="30" y="365" width="810" height="48" rx="8" fill="#065f46" stroke="#34d399" stroke-width="2"/>
    <text x="435" y="395" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">✓ GATE 5 PASSED (RRR ≥ 1:2.0) — EXECUTE ORDER WITH HARD STOP-LOSS</text>
  </svg>
</div>
"""

SVG_DIAGRAM_6 = """
<div class="diagram-wrapper">
  <div class="diagram-title">Figure 14.1 — The NEPSE T+2 Settlement Trap Sequence</div>
  <svg viewBox="0 0 880 280" xmlns="http://www.w3.org/2000/svg" class="flow-svg">
    <rect x="10" y="10" width="860" height="260" rx="10" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>

    <!-- 4 Swimlanes -->
    <rect x="30" y="25" width="180" height="40" rx="6" fill="#1e293b" stroke="#3b82f6" stroke-width="1"/>
    <text x="120" y="50" fill="#60a5fa" font-size="12" font-weight="bold" text-anchor="middle">Retail Buyer</text>

    <rect x="245" y="25" width="180" height="40" rx="6" fill="#1e293b" stroke="#06b6d4" stroke-width="1"/>
    <text x="335" y="50" fill="#22d3ee" font-size="12" font-weight="bold" text-anchor="middle">NEPSE Matching Engine</text>

    <rect x="460" y="25" width="180" height="40" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="1"/>
    <text x="550" y="50" fill="#fbbf24" font-size="12" font-weight="bold" text-anchor="middle">Institutional Whale</text>

    <rect x="675" y="25" width="180" height="40" rx="6" fill="#1e293b" stroke="#a855f7" stroke-width="1"/>
    <text x="765" y="50" fill="#c084fc" font-size="12" font-weight="bold" text-anchor="middle">CDSC Clearing (T+2)</text>

    <!-- Timeline steps -->
    <!-- Step 1 -->
    <line x1="550" y1="85" x2="335" y2="85" stroke="#f43f5e" stroke-width="2"/>
    <polygon points="335,80 325,85 335,90" fill="#f43f5e"/>
    <text x="442" y="80" fill="#f87171" font-size="11" text-anchor="middle">1. Dumps large sell blocks at +10% Circuit</text>

    <!-- Step 2 -->
    <line x1="120" y1="120" x2="335" y2="120" stroke="#10b981" stroke-width="2"/>
    <polygon points="335,115 345,120 335,125" fill="#10b981"/>
    <text x="227" y="115" fill="#34d399" font-size="11" text-anchor="middle">2. Retail FOMO orders match at top</text>

    <!-- Step 3 Day T+1 -->
    <rect x="80" y="145" width="720" height="35" rx="6" fill="#881337" stroke="#f43f5e" stroke-width="1"/>
    <text x="440" y="167" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">DAY T+1: Stock drops -6.0% • Retail CANNOT sell (Shares uncredited)</text>

    <!-- Step 4 Day T+2 -->
    <line x1="765" y1="210" x2="120" y2="210" stroke="#f59e0b" stroke-width="2"/>
    <polygon points="120,205 110,210 120,215" fill="#f59e0b"/>
    <text x="440" y="205" fill="#fbbf24" font-size="11" text-anchor="middle">3. CDSC credits shares to Demat (Day T+2 afternoon: Down -14%)</text>
    
    <text x="440" y="240" fill="#fecdd3" font-size="11" font-weight="bold" text-anchor="middle">RESULT: Retail trapped with immediate -14% capital drawdown.</text>
  </svg>
</div>
"""

def replace_mermaid_blocks(text):
    blocks = [
        SVG_DIAGRAM_1,
        SVG_DIAGRAM_2,
        SVG_DIAGRAM_3,
        SVG_DIAGRAM_4,
        SVG_DIAGRAM_5,
        SVG_DIAGRAM_6
    ]
    def replacer(match):
        if hasattr(replacer, 'count'):
            replacer.count += 1
        else:
            replacer.count = 0
        idx = replacer.count
        if idx < len(blocks):
            return blocks[idx]
        return ""
    
    pattern = r"```mermaid[\s\S]*?```"
    return re.sub(pattern, replacer, text)

def format_alerts(text):
    # GitHub Alert conversions
    alert_types = {
        'NOTE': ('alert-note', 'ℹ️ NOTE', '#2563eb', '#eff6ff'),
        'TIP': ('alert-tip', '💡 TIP', '#059669', '#ecfdf5'),
        'IMPORTANT': ('alert-important', '⭐ IMPORTANT', '#7c3aed', '#f5f3ff'),
        'WARNING': ('alert-warning', '⚠️ WARNING', '#d97706', '#fffbeb'),
        'CAUTION': ('alert-caution', '🛑 CAUTION', '#e11d48', '#fff1f2'),
    }
    
    for alert, (cls, title, border, bg) in alert_types.items():
        pattern = re.compile(rf'> \[!{alert}\]\s*\n((?:> .*\n?)+)', re.MULTILINE)
        def alert_sub(m):
            lines = [line[2:] if line.startswith('> ') else line[1:] if line.startswith('>') else line for line in m.group(1).splitlines()]
            body = "\n".join(lines)
            return f'<div class="callout {cls}">\n<div class="callout-header">{title}</div>\n<div class="callout-body">\n\n{body}\n\n</div>\n</div>\n'
        text = pattern.sub(alert_sub, text)
    return text

def format_math_expressions(text):
    # Format display math $$...$$
    def block_math_sub(m):
        raw = m.group(1).strip()
        # Clean latex symbols for crisp HTML presentation
        clean = raw.replace(r"\text{", "").replace("}", "")
        clean = re.sub(r"\\frac\{([^}]+)\}\{([^}]+)\}", r'<span class="frac"><span class="num">\1</span><span class="den">\2</span></span>', clean)
        clean = re.sub(r"\\sqrt\{([^}]+)\}", r'<span class="radic">&radic;</span><span class="radicand">\1</span>', clean)
        clean = clean.replace(r"\ge", "&ge;").replace(r"\le", "&le;").replace(r"\times", "&times;").replace(r"\Big|", "|")
        clean = clean.replace(r"\quad", " &nbsp; ").replace(r"\sum", "&sum;").replace(r"\sigma", "&sigma;").replace(r"\mu", "&mu;")
        clean = clean.replace(r"\Phi", "&Phi;").replace(r"\Delta", "&Delta;")
        clean = re.sub(r"_\{([^}]+)\}", r'<sub>\1</sub>', clean)
        clean = re.sub(r"_([0-9a-zA-Z]+)", r'<sub>\1</sub>', clean)
        clean = re.sub(r"\^\{([^}]+)\}", r'<sup>\1</sup>', clean)
        clean = re.sub(r"\^([0-9a-zA-Z]+)", r'<sup>\1</sup>', clean)
        return f'<div class="math-block">{clean}</div>'
    
    text = re.sub(r"\$\$([\s\S]*?)\$\$", block_math_sub, text)
    
    # Format inline math $...$
    def inline_math_sub(m):
        raw = m.group(1).strip()
        if not raw or '\n' in raw:
            return m.group(0)
        clean = raw.replace(r"\text{", "").replace("}", "")
        clean = clean.replace(r"\ge", "&ge;").replace(r"\le", "&le;").replace(r"\times", "&times;")
        clean = clean.replace(r"\sigma", "&sigma;").replace(r"\mu", "&mu;").replace(r"\Phi", "&Phi;")
        clean = re.sub(r"_\{([^}]+)\}", r'<sub>\1</sub>', clean)
        clean = re.sub(r"_([0-9a-zA-Z]+)", r'<sub>\1</sub>', clean)
        clean = re.sub(r"\^\{([^}]+)\}", r'<sup>\1</sup>', clean)
        clean = re.sub(r"\^([0-9a-zA-Z]+)", r'<sup>\1</sup>', clean)
        return f'<span class="math-inline">{clean}</span>'
        
    text = re.sub(r"(?<!\$)\$([^\$\n]+)\$(?!\$)", inline_math_sub, text)
    return text

def build_html():
    with open(SRC_MD, "r", encoding="utf-8") as f:
        md_text = f.read()

    # Pre-process
    md_text = replace_mermaid_blocks(md_text)
    md_text = format_alerts(md_text)
    md_text = format_math_expressions(md_text)

    # Convert Markdown to HTML
    html_content = markdown.markdown(md_text, extensions=['tables', 'fenced_code', 'toc'])

    # Master publication CSS
    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Drabyashree NEPSE — Master Investor Encyclopedia</title>
  <style>
    @page {{
      size: A4;
      margin: 18mm 15mm 18mm 15mm;
      @bottom-right {{
        content: "Page " counter(page);
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 8.5pt;
        color: #64748b;
      }}
      @bottom-left {{
        content: "Drabyashree NEPSE — Master Investor Encyclopedia";
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 8.5pt;
        color: #64748b;
      }}
    }}
    
    *, *:before, *:after {{
      box-sizing: border-box;
    }}

    body {{
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Nirmala UI', 'Mangal', Roboto, Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.55;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }}

    /* Cover Page */
    .cover-page {{
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 90vh;
      background: linear-gradient(145deg, #090d16 0%, #111827 50%, #1e293b 100%);
      color: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    }}

    .cover-badge {{
      display: inline-block;
      align-self: flex-start;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      padding: 5px 14px;
      border-radius: 20px;
      margin-bottom: 24px;
    }}

    .cover-title {{
      font-size: 28pt;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.5px;
      margin: 0 0 12px 0;
      background: linear-gradient(90deg, #f8fafc, #38bdf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}

    .cover-subtitle {{
      font-size: 15pt;
      font-weight: 500;
      color: #94a3b8;
      margin: 0 0 28px 0;
      border-left: 3px solid #f59e0b;
      padding-left: 14px;
    }}

    .cover-desc {{
      font-size: 10pt;
      line-height: 1.6;
      color: #cbd5e1;
      max-width: 640px;
      margin-bottom: 35px;
    }}

    .cover-meta {{
      margin-top: auto;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #94a3b8;
    }}

    .cover-meta b {{
      color: #f1f5f9;
    }}

    /* Typography & Headings */
    h1 {{
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
      margin-top: 30px;
      margin-bottom: 14px;
    }}

    h2 {{
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
      border-left: 4px solid #2563eb;
      padding-left: 10px;
      margin-top: 26px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }}

    h3 {{
      font-size: 11.5pt;
      font-weight: 600;
      color: #1e293b;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }}

    h4 {{
      font-size: 10pt;
      font-weight: 600;
      color: #334155;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }}

    p {{
      margin: 0 0 10px 0;
    }}

    ul, ol {{
      margin: 0 0 12px 0;
      padding-left: 22px;
    }}

    li {{
      margin-bottom: 4px;
    }}

    hr {{
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 22px 0;
    }}

    /* Table of Contents */
    .toc {{
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 25px;
    }}

    .toc ul {{
      list-style-type: none;
      padding-left: 0;
    }}

    .toc li {{
      margin-bottom: 6px;
    }}

    .toc a {{
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
      font-size: 9.5pt;
    }}

    /* Tables */
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 20px 0;
      font-size: 8.5pt;
      page-break-inside: auto;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
    }}

    tr {{
      page-break-inside: avoid;
      page-break-after: auto;
    }}

    thead {{
      display: table-header-group;
    }}

    th {{
      background-color: #0f172a;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid #1e293b;
      font-size: 8.5pt;
      letter-spacing: 0.3px;
    }}

    td {{
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
      line-height: 1.45;
    }}

    tbody tr:nth-child(even) {{
      background-color: #f8fafc;
    }}

    tbody tr:hover {{
      background-color: #f1f5f9;
    }}

    /* Callout Alert Boxes */
    .callout {{
      border-radius: 6px;
      padding: 10px 14px;
      margin: 14px 0;
      page-break-inside: avoid;
    }}

    .callout-header {{
      font-size: 9.5pt;
      font-weight: 700;
      margin-bottom: 4px;
    }}

    .callout-body {{
      font-size: 9pt;
      line-height: 1.5;
    }}

    .alert-note {{
      background-color: #eff6ff;
      border-left: 4px solid #2563eb;
      color: #1e3a8a;
    }}
    .alert-note .callout-header {{ color: #1d4ed8; }}

    .alert-tip {{
      background-color: #ecfdf5;
      border-left: 4px solid #059669;
      color: #064e3b;
    }}
    .alert-tip .callout-header {{ color: #047857; }}

    .alert-important {{
      background-color: #f5f3ff;
      border-left: 4px solid #7c3aed;
      color: #4c1d95;
    }}
    .alert-important .callout-header {{ color: #6d28d9; }}

    .alert-warning {{
      background-color: #fffbeb;
      border-left: 4px solid #d97706;
      color: #78350f;
    }}
    .alert-warning .callout-header {{ color: #b45309; }}

    .alert-caution {{
      background-color: #fff1f2;
      border-left: 4px solid #e11d48;
      color: #881337;
    }}
    .alert-caution .callout-header {{ color: #be123c; }}

    /* Code Blocks & ASCII */
    pre {{
      background-color: #090d16;
      color: #f8fafc;
      padding: 12px 14px;
      border-radius: 6px;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 8pt;
      line-height: 1.4;
      overflow-x: auto;
      margin: 12px 0;
      border: 1px solid #1e293b;
      page-break-inside: avoid;
    }}

    code {{
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 8.5pt;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 2px 5px;
      border-radius: 4px;
    }}

    pre code {{
      background-color: transparent;
      color: inherit;
      padding: 0;
    }}

    /* Mathematical Notation */
    .math-block {{
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 14px;
      margin: 10px 0;
      text-align: center;
      font-family: 'Cambria Math', 'Times New Roman', serif;
      font-size: 11pt;
      color: #0f172a;
      page-break-inside: avoid;
    }}

    .math-inline {{
      font-family: 'Cambria Math', 'Times New Roman', serif;
      font-style: italic;
      color: #0f172a;
      padding: 0 2px;
    }}

    .frac {{
      display: inline-flex;
      flex-direction: column;
      vertical-align: middle;
      text-align: center;
      padding: 0 4px;
    }}
    .num {{
      border-bottom: 1px solid #334155;
      padding-bottom: 1px;
    }}
    .den {{
      padding-top: 1px;
    }}

    /* Diagrams */
    .diagram-wrapper {{
      margin: 18px 0;
      page-break-inside: avoid;
      text-align: center;
    }}

    .diagram-title {{
      font-size: 9pt;
      font-weight: 700;
      color: #475569;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}

    .flow-svg {{
      width: 100%;
      max-height: 380px;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.08));
    }}

    /* Page Breaks */
    .page-break {{
      page-break-before: always;
    }}
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover-page">
    <div class="cover-badge">Official Technical Release • Version 2.4</div>
    <div class="cover-title">DRABYASHREE NEPSE</div>
    <div class="cover-subtitle">Master Investor Encyclopedia & Quantitative Almanac</div>
    <div class="cover-desc">
      A comprehensive, mathematically verified compendium of the Nepal Stock Exchange (NEPSE) market microstructure: order flow mechanics, broker concentration metrics (BCR₃/BCR₅), 28 Japanese candlestick pattern recognition algorithms, interactive chart geometry, volatility frameworks, banking solvency directives (CAR/NPL), and capital preservation rules.
    </div>
    <div class="cover-meta">
      <div><b>System:</b> Drabyashree NEPSE Platform</div>
      <div><b>Exchange:</b> NEPSE NOTS Matching Engine</div>
      <div><b>Architecture:</b> Zero-Fabrication Verification</div>
      <div><b>Date:</b> October 2026</div>
    </div>
  </div>

  <!-- Content -->
  {html_content}

</body>
</html>
"""

    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(full_html)
    print(f"HTML successfully generated at: {OUT_HTML}")

def convert_to_pdf():
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ]
    browser_bin = None
    for p in edge_paths:
        if os.path.exists(p):
            browser_bin = p
            break
            
    if not browser_bin:
        raise RuntimeError("No compatible headless browser (Edge/Chrome) found on this machine.")

    cmd = [
        browser_bin,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        f"--print-to-pdf={OUT_PDF_DESKTOP}",
        f"file:///{OUT_HTML.replace('\\', '/')}"
    ]
    print(f"Executing: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("Return code:", res.returncode)
    
    if os.path.exists(OUT_PDF_DESKTOP):
        size_kb = os.path.getsize(OUT_PDF_DESKTOP) / 1024
        print(f"PDF Successfully Generated: {OUT_PDF_DESKTOP} ({size_kb:.2f} KB)")
        
        # Copy to workspace and artifact directory
        import shutil
        shutil.copyfile(OUT_PDF_DESKTOP, OUT_PDF_WORKSPACE)
        shutil.copyfile(OUT_PDF_DESKTOP, OUT_PDF_ARTIFACT)
        print(f"Copied to workspace: {OUT_PDF_WORKSPACE}")
        print(f"Copied to artifacts: {OUT_PDF_ARTIFACT}")
    else:
        print("Error: PDF output not created.")
        print(res.stderr)

if __name__ == "__main__":
    build_html()
    convert_to_pdf()
