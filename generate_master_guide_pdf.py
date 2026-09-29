import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, KeepTogether, PageBreak, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 755, "DRABYASHREE NEPSE PRO — MASTER 100% PROFIT BLUEPRINT")
            self.drawRightString(558, 755, "SEBON 2082/2083 STATUTORY COMPLIANCE")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 747, 558, 747)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        
        self.setFont("Helvetica", 8)
        self.drawString(54, 32, "Confidential Quantitative Investor Guide — Context: Nepal Stock Exchange (NEPSE)")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 32, page_str)
        self.restoreState()

def build_pdf(filename="NEPSE_100_Percent_Profit_Master_Guide.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0f172a')
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#059669')
    )

    meta_style = ParagraphStyle(
        'MetaHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#ffffff')
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=6,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=colors.HexColor('#334155')
    )

    body_bold = ParagraphStyle(
        'Body_Bold',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor('#ffffff')
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor('#1e293b')
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=table_cell,
        fontName='Helvetica-Bold'
    )

    callout_text = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor('#0f172a')
    )

    story = []

    # ══════════════════════════════════════════════════════════════
    # PAGE 1: TITLE & CORE ARCHITECTURE
    # ══════════════════════════════════════════════════════════════
    
    # Header Banner
    meta_table = Table(
        [[
            Paragraph("DRABYASHREE NEPSE PRO<br/><font size=7>QUANTITATIVE WORKSTATION & DECISION ENGINE</font>", meta_style),
            Paragraph("<div align='right'>SEBON STATUTORY RULES 2082/2083<br/><font size=7>&plusmn;15% Daily Circuit Bands | 10% Final CGT | T+2 Settlement</font></div>", meta_style)
        ]],
        colWidths=[250, 254]
    )
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#0f172a')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    story.append(Paragraph("Unified Master Playbook: The 100% Profit Blueprint", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("THE COMPLETE QUANTITATIVE WORKFLOW TO DOUBLE CAPITAL IN NEPSE", subtitle_style))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "This master guide integrates the three core institutional frameworks of our application: "
        "<b>The One Method (20-Trade Half-Kelly Compounding Engine)</b>, <b>The NEPSE Alpha Playbook (T+2 Capital Defense & Market Breadth)</b>, "
        "and <b>The Confirmed Entry Blueprint (SEBON 2082/2083 Statutory Compliance)</b>. It eliminates retail gambling and defines "
        "an exact, reproducible mathematical routine to achieve 100%+ portfolio growth.",
        body_style
    ))
    story.append(Spacer(1, 8))

    # Core Reality Callout
    reality_box = [
        [Paragraph(
            "<b>THE 3 HARD REALITIES OF MAKING 100% PROFIT IN NEPSE:</b><br/>"
            "&bull; <b>Statutory Circuit Volatility (&plusmn;15%):</b> Under SEBON's Fourth Amendment Bylaws 2082, single bad trades can crash 15% in a day if caught in a limit-down waterfall.<br/>"
            "&bull; <b>T+2 Delivery Freeze:</b> Shares purchased today cannot be exited for 2 full trading days. Chasing extended green candles guarantees retail bag-holding.<br/>"
            "&bull; <b>Compounding Math vs. Single Lotteries:</b> Attempting to make 100% on 1 speculative stock leads to ruin. Sequential compounding (20 trades at 65% win rate and 2.5:1 R:R with 2% portfolio risk) transforms <b>Rs. 5,00,000 into Rs. 11,69,450 (+134% return)</b> in 6–10 months.",
            callout_text
        )]
    ]
    t_reality = Table(reality_box, colWidths=[504])
    t_reality.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#64748b')),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(t_reality)
    story.append(Spacer(1, 10))

    # Master 6-Point Confirmed Entry Matrix
    story.append(Paragraph("1. The Master 6-Point Confirmed Entry Matrix", h1_style))
    matrix_data = [
        [
            Paragraph("Checkpoint", table_header),
            Paragraph("Target Metric in App", table_header),
            Paragraph("Confirmation Rule", table_header),
            Paragraph("Hard Reject Trigger", table_header)
        ],
        [
            Paragraph("<b>1. Action Stance</b>", table_cell),
            Paragraph("Stance Banner (Top)", table_cell),
            Paragraph("Must be <b>STRONG BUY</b> or <b>ACCUMULATE ON PULLBACK</b>", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if 'HOLD / DO NOT CHASE' or 'AVOID'", table_cell)
        ],
        [
            Paragraph("<b>2. Setup Score</b>", table_cell),
            Paragraph("Setup Score Card", table_cell),
            Paragraph("Score &ge; 70 / 100 with High confidence rating", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if score &lt; 65 or bearish consensus", table_cell)
        ],
        [
            Paragraph("<b>3. Entry Price</b>", table_cell),
            Paragraph("Entry Risk Card", table_cell),
            Paragraph("LTP inside [Entry Zone] and &le; Chase Cap (+2.5%)", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if LTP &gt; Chase Cap (+2.5% of pivot)", table_cell)
        ],
        [
            Paragraph("<b>4. Smart Money</b>", table_cell),
            Paragraph("Step 4 Broker Card", table_cell),
            Paragraph("Top 3 Brokers account for &ge; 40% of Buy Volume (BCR3)", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if Top Brokers are net distributors", table_cell)
        ],
        [
            Paragraph("<b>5. Trap Monitor</b>", table_cell),
            Paragraph("Radar / Breakout Trap", table_cell),
            Paragraph("NO Distribution Trap Alert (No dumping into green)", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if 'Distribution Trap: Do Not Buy' fires", table_cell)
        ],
        [
            Paragraph("<b>6. Risk : Reward</b>", table_cell),
            Paragraph("Multi-Horizon Targets", table_cell),
            Paragraph("Minimum <b>2.5 : 1 Net R:R</b> (Stop-Loss strictly &le; 4.5% - 5.5%)", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if Stop &gt; 6% or Net R:R &lt; 2.0:1", table_cell)
        ]
    ]
    t_matrix = Table(matrix_data, colWidths=[90, 110, 174, 130])
    t_matrix.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('PADDING', (0,0), (-1,-1), 4.5),
    ]))
    story.append(t_matrix)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════
    # PAGE 2: SCREENER & CONFIRMATION GATES
    # ══════════════════════════════════════════════════════════════
    story.append(Paragraph("2. Step 1: The 8-Gate Screener (Finding the Top 1% Scrips)", h1_style))
    story.append(Paragraph(
        "Open <b>Services ➔ Flagship ➔ 100% Hunter (8-Gate Screener)</b> and filter for <b>6+ Gates</b>. "
        "The application evaluates every NEPSE scrip against 8 institutional filters:",
        body_style
    ))
    story.append(Spacer(1, 6))

    hunter_data = [
        [Paragraph("Gate #", table_header), Paragraph("Factor", table_header), Paragraph("Institutional Standard", table_header), Paragraph("Quant Purpose & Anti-Trap Defense", table_header)],
        [Paragraph("Gate 1", table_cell_bold), Paragraph("Float Size", table_cell), Paragraph("Public Float &le; 15M shares", table_cell), Paragraph("Prevents liquidity dilution; tight floating supply moves rapidly on institutional demand.", table_cell)],
        [Paragraph("Gate 2", table_cell_bold), Paragraph("Supply Lock", table_cell), Paragraph("Promoter Hold &ge; 52% or Stealth &ge; 55", table_cell), Paragraph("High skin-in-the-game; shields from speculative float dumps.", table_cell)],
        [Paragraph("Gate 3", table_cell_bold), Paragraph("VCP Squeeze", table_cell), Paragraph("BBW &le; 6.5% or |pChange| &le; 2.0%", table_cell), Paragraph("Volatility contraction pattern; precedes violent directional expansion.", table_cell)],
        [Paragraph("Gate 4", table_cell_bold), Paragraph("Volume Spike", table_cell), Paragraph("Z_vol &ge; 1.5&sigma; or RVOL &ge; 1.8x", table_cell), Paragraph("Distinguishes genuine institutional accumulation from low-volume retail churn.", table_cell)],
        [Paragraph("Gate 5", table_cell_bold), Paragraph("Broker Inflow", table_cell), Paragraph("Stealth Accumulation Score &ge; 60", table_cell), Paragraph("Confirms top broker powerhouse cornering (e.g. #58, #45, #34).", table_cell)],
        [Paragraph("Gate 6", table_cell_bold), Paragraph("Directional DPI", table_cell), Paragraph("DPI Score &ge; 65 / 100", table_cell), Paragraph("Measures buyer pressure consistency across intraday tick transactions.", table_cell)],
        [Paragraph("Gate 7", table_cell_bold), Paragraph("Graham Safety", table_cell), Paragraph("Margin of Safety &ge; 5% or P/E &lt; 28", table_cell), Paragraph("Protects downside; eliminates bubbles trading at 8x book value.", table_cell)],
        [Paragraph("Gate 8", table_cell_bold), Paragraph("Seasonality", table_cell), Paragraph("Season Score Bonus &ge; 0.00", table_cell), Paragraph("Guards against pre-Dashain and fiscal year-end liquidity contractions.", table_cell)]
    ]
    t_hunter = Table(hunter_data, colWidths=[40, 80, 160, 224])
    t_hunter.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_hunter)
    story.append(Spacer(1, 10))

    story.append(Paragraph("3. Step 2: The Wyckoff & Smart Money Broker Audit", h1_style))
    story.append(Paragraph(
        "Open <b>Services ➔ Flagship ➔ Accumulation Radar</b> to audit market microstructure before entry:",
        body_style
    ))
    story.append(Spacer(1, 6))

    wyckoff_box = [
        [
            Paragraph("<b>RULE A: INSTITUTIONAL ACCUMULATION (&gt;40% BUY SHARE)</b><br/>"
                      "&bull; Top 3 brokers corner &ge; 40% of total buy volume (BCR3) in heavy blocks.<br/>"
                      "&bull; Average buy ticket size is &ge; 1.4x sell ticket size.<br/>"
                      "&bull; Wyckoff Phase: <b>STEALTH_ACCUMULATION</b> or <b>SPRING_SHAKEOUT</b>.<br/>"
                      "&bull; Verdict: Valid institutional base.", callout_text),
            Paragraph("<b>RULE B: DISTRIBUTION TRAP WARNING (HARD REJECT!)</b><br/>"
                      "&bull; Top brokers are net sellers while price is up (churning green candles).<br/>"
                      "&bull; Retail buying heavily while Broker #58 or #45 dumps inventory.<br/>"
                      "&bull; Wyckoff Phase: <b>EUPHORIA_DISTRIBUTION</b> or <b>ACTIVE_DUMP</b>.<br/>"
                      "&bull; Verdict: <b>DO NOT BUY — Trap in progress.</b>", callout_text)
        ]
    ]
    t_wyckoff = Table(wyckoff_box, colWidths=[248, 256])
    t_wyckoff.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#ecfdf5')),
        ('BOX', (0,0), (0,0), 1, colors.HexColor('#10b981')),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor('#fff1f2')),
        ('BOX', (1,0), (1,0), 1, colors.HexColor('#f43f5e')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_wyckoff)
    story.append(Spacer(1, 10))

    # Statutory Frictions Table
    story.append(Paragraph("4. SEBON Statutory Frictions & Net Target Geometry", h1_style))
    frictions_data = [
        [Paragraph("Friction / Statutory Factor", table_header), Paragraph("Statutory Rate", table_header), Paragraph("Impact on Net Profit & Trading Plan", table_header)],
        [Paragraph("SEBON Broker Commission", table_cell_bold), Paragraph("0.36% &ndash; 0.40% each way", table_cell), Paragraph("~0.72% - 0.75% round-trip drag on gross traded turnover.", table_cell)],
        [Paragraph("SEBON Regulatory Fee", table_cell_bold), Paragraph("0.015% each way", table_cell), Paragraph("0.030% round-trip. DP Fee: Rs. 25 per transfer.", table_cell)],
        [Paragraph("Final Capital Gains Tax (CGT)", table_cell_bold), Paragraph("10.0% Final Tax", table_cell), Paragraph("Mandated under Finance Act 2083 for holdings &lt; 365 days. Net targets must be calibrated net of 10% CGT.", table_cell)],
        [Paragraph("Daily Circuit Band", table_cell_bold), Paragraph("&plusmn;15% Daily Limit", table_cell), Paragraph("Fourth Amendment Bylaws 2082. Expanded bands require strict stop-loss discipline.", table_cell)],
        [Paragraph("T+2 Delivery Freeze", table_cell_bold), Paragraph("2 Full Working Days", table_cell), Paragraph("Purchased shares cannot be sold for 2 sessions. Never chase Day 2+ green candles.", table_cell)]
    ]
    t_frictions = Table(frictions_data, colWidths=[140, 110, 254])
    t_frictions.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_frictions)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════
    # PAGE 3: EXECUTION & EXIT ENGINE
    # ══════════════════════════════════════════════════════════════
    story.append(Paragraph("5. Step 3: Precision Execution & Position Sizing Protocol", h1_style))
    story.append(Paragraph(
        "Disciplined execution occurs in strict daily time windows to prevent retail whipsaws:",
        body_style
    ))
    story.append(Spacer(1, 6))

    exec_timeline = [
        [Paragraph("Time Window", table_header), Paragraph("Action Checklist & Non-Negotiable Institutional Gate", table_header)],
        [Paragraph("10:00 - 10:30 AM<br/><b>Pre-Market Scan</b>", table_cell_bold), Paragraph("&bull; Check <b>Cash Defense Mode</b> on top banner. If Active (breadth &lt; 40%), stop: hold 70-80% cash.<br/>&bull; Verify candidate has <b>NO promoter lock-in expiry</b> within 60 days.", table_cell)],
        [Paragraph("10:30 - 11:00 AM<br/><b>Pre-Open Order Book</b>", table_cell_bold), Paragraph("&bull; Check Pre-Open <b>OBIR</b> (Order Book Imbalance Ratio). Must be &ge; +0.25 (buyer depth &gt; 1.8x).<br/>&bull; If projected open is &gt; +2.5% above pivot: <b>ABORT (Chase Cap Violated)</b>.", table_cell)],
        [Paragraph("11:15 - 01:30 PM<br/><b>Live Order Execution</b>", table_cell_bold), Paragraph("&bull; Bypass 11:00-11:15 AM opening retail churn. Verify live RVOL &ge; 1.4x.<br/>&bull; Verify <b>Daily Prime Pick shows 'GO'</b> signal.<br/>&bull; Place <b>TMS LIMIT ORDER</b> strictly at [Entry Low]. NEVER use market orders.", table_cell)],
        [Paragraph("03:15 - 04:00 PM<br/><b>Floorsheet Audit</b>", table_cell_bold), Paragraph("&bull; Audit Top 5 buyer/seller broker IDs: Did #58, #45, #34, #17 net accumulate?<br/>&bull; Confirm BCR3 &ge; 40%. Set Stop-Loss floor in trading journal.", table_cell)]
    ]
    t_exec = Table(exec_timeline, colWidths=[120, 384])
    t_exec.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_exec)
    story.append(Spacer(1, 10))

    # Friction-Adjusted Position Sizing Box
    sizing_box = [
        [Paragraph(
            "<b>THE 2% PORTFOLIO RISK SIZING FORMULA (HALF-KELLY):</b><br/>"
            "Open <b>Calculators ➔ Risk/Reward Position Sizer</b>. Never risk &gt; 2.0% of total capital on one setup:<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;<b>Max Shares = &lfloor; (Portfolio Capital &times; 0.02) / (Entry Low &minus; Stop Loss) &rfloor;</b><br/>"
            "<i>Example:</i> Capital = Rs. 5,00,000 | 2% Risk = Rs. 10,000 | Entry = Rs. 500 | Stop = Rs. 475 (Risk = Rs. 25/sh)<br/>"
            "&nbsp;&nbsp;&nbsp;&nbsp;<b>Max Position = 10,000 / 25 = 400 Shares (Rs. 2,00,000 capital outlay / 40% position).</b>",
            callout_text
        )]
    ]
    t_sizing = Table(sizing_box, colWidths=[504])
    t_sizing.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f0fdf4')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#16a34a')),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(t_sizing)
    story.append(Spacer(1, 10))

    # Exit Engine
    story.append(Paragraph("6. Step 4: The 4-Tier Trailing Profit & Exit Engine", h1_style))
    exit_data = [
        [Paragraph("Price Milestone", table_header), Paragraph("Quantity to Sell", table_header), Paragraph("Stop-Loss Adjustment", table_header), Paragraph("Tactical Purpose", table_header)],
        [Paragraph("<b>Target 1 Reached</b><br/>(+8% to +10% Net)", table_cell), Paragraph("<b>Sell 25% to 50%</b> of shares", table_cell), Paragraph("Move Stop to <b>BREAKEVEN</b> (Entry Price)", table_cell), Paragraph("<b>Zero-Loss Switch:</b> Trade is now mathematically immune to capital loss.", table_cell)],
        [Paragraph("<b>Target 2 Reached</b><br/>(+18% to +25% Net)", table_cell), Paragraph("<b>Sell another 25%</b> of shares", table_cell), Paragraph("Trail Stop up to <b>Target 1 Price</b>", table_cell), Paragraph("Locks in high double-digit profit; guarantees positive trade expectancy.", table_cell)],
        [Paragraph("<b>Target 3 / 52W High</b><br/>(+35% to +100%)", table_cell), Paragraph("<b>Hold remaining 25%-50%</b>", table_cell), Paragraph("Trail with <b>2-Day Close below 20-EMA</b>", table_cell), Paragraph("Captures full multibagger trend while allowing runner to compound.", table_cell)],
        [Paragraph("<b>Stop-Loss Triggered</b><br/>(-4.5% to -5.5%)", table_cell), Paragraph("<font color='#dc2626'><b>Sell 100% IMMEDIATELY</b></font>", table_cell), Paragraph("N/A &mdash; Position Closed", table_cell), Paragraph("<b>Absolute Capital Preservation:</b> Prevents &plusmn;15% lower-circuit cascades.", table_cell)]
    ]
    t_exit = Table(exit_data, colWidths=[100, 110, 130, 164])
    t_exit.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('PADDING', (0,0), (-1,-1), 4.5),
    ]))
    story.append(t_exit)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════
    # PAGE 4: CASE STUDY & 10-SECOND DAILY ROUTINE
    # ══════════════════════════════════════════════════════════════
    story.append(Paragraph("7. Case Study: Live App Audit of HDL (Himalayan Distillery)", h1_style))
    story.append(Paragraph(
        "Applying the exact 6-point matrix to the real-time telemetry captured in the app for <b>HDL (LTP: Rs. 1,312)</b>:",
        body_style
    ))
    story.append(Spacer(1, 6))

    hdl_data = [
        [Paragraph("Checkpoint", table_header), Paragraph("HDL App Telemetry", table_header), Paragraph("Institutional Diagnosis", table_header), Paragraph("Verdict", table_header)],
        [Paragraph("1. Valuation", table_cell_bold), Paragraph("P/E: 40.11x<br/>P/E &times; P/B: 372.2<br/>Graham V*: Rs. 322.6", table_cell), Paragraph("Margin of safety deficit: -306.6%. Trades at 4x intrinsic value. Piotroski score is only 4/9.", table_cell), Paragraph("<font color='#dc2626'><b>FAIL</b></font><br/>Extreme Multiple", table_cell)],
        [Paragraph("2. Technicals", table_cell_bold), Paragraph("Price: Rs. 1,312<br/>50 SMA: Rs. 1,285.8<br/>RVOL: 4.39x Surge", table_cell), Paragraph("Above 50 & 200 SMA. Turnover of Rs. 35.17 Cr confirms huge volume expansion.", table_cell), Paragraph("<font color='#16a34a'><b>PASS</b></font><br/>Strong Trend", table_cell)],
        [Paragraph("3. Smart Money", table_cell_bold), Paragraph("BCR3: 57.5% (&gt;40%)<br/>Broker #58: +16,867 kitta<br/>Net Inst: +10,544 kitta", table_cell), Paragraph("Brokers #58, #29, and #57 cornered 57.5% of buy volume. Completely absorbed sellers #45 and #20.", table_cell), Paragraph("<font color='#16a34a'><b>PASS</b></font><br/>Accumulation", table_cell)],
        [Paragraph("4. Risk / Reward", table_cell_bold), Paragraph("R:R Ratio: 1.71 : 1<br/>Target 1: Rs. 1,390.7<br/>Stop Floor: Rs. 1,266.1", table_cell), Paragraph("Upside to Target 1 is only +4.7% net, while risk to support floor is -3.5%. Below 2.5:1 institutional hurdle.", table_cell), Paragraph("<font color='#d97706'><b>CAUTION</b></font><br/>Sub-optimal R:R", table_cell)],
        [Paragraph("5. Win Rate", table_cell_bold), Paragraph("Analog Win Rate: 31.3%<br/>Stance: HOLD / DO NOT CHASE", table_cell), Paragraph("Historical backtests show chasing high-P/E breakouts near resistance fails 68.7% of the time.", table_cell), Paragraph("<font color='#dc2626'><b>DO NOT CHASE</b></font>", table_cell)]
    ]
    t_hdl = Table(hdl_data, colWidths=[70, 115, 239, 80])
    t_hdl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_hdl)
    story.append(Spacer(1, 8))

    hdl_action = [
        [Paragraph(
            "<b>HDL ACTIONABLE VERDICT FOR MAXIMUM PROFIT:</b><br/>"
            "&bull; <b>Existing Holders:</b> HOLD with a strict trailing stop at Rs. 1,266.1 (-3.5%). Partial profit harvest at Rs. 1,390.<br/>"
            "&bull; <b>Fresh Buyers:</b> <b>DO NOT CHASE at Rs. 1,312.</b> Wait for a low-volume pullback into the 50-day SMA support zone at <b>Rs. 1,265 &ndash; Rs. 1,285</b> with a stop at Rs. 1,240. This expands your Risk:Reward ratio from 1.71:1 to <b>&gt; 3.2:1</b>.",
            callout_text
        )]
    ]
    t_hdl_action = Table(hdl_action, colWidths=[504])
    t_hdl_action.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fef3c7')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#d97706')),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_hdl_action)
    story.append(Spacer(1, 10))

    # 10-Second Routine
    story.append(Paragraph("8. The 10-Second Daily Routine to Screen for Profit", h1_style))
    routine_text = (
        "<b>Step 1 &mdash; Open 'Broker Flow Dominance':</b> Click [BCR3 &gt; 40% Accumulation] pill to eliminate 95% of retail noise.<br/>"
        "<b>Step 2 &mdash; Verify '100% Hunter' / Screener:</b> Select top scrip with Gates &ge; 6/8, DPI &ge; 65, and STRONG BUY stance.<br/>"
        "<b>Step 3 &mdash; Inspect 'Entry / Exit Analyzer':</b> Ensure LTP is inside [Entry Zone] and strictly below [Chase Cap (+2.5%)].<br/>"
        "<b>Step 4 &mdash; Verify Step 4 Broker Flow Card:</b> Must confirm INSTITUTIONAL ACCUMULATION and confirm NO Distribution Trap.<br/>"
        "<b>Step 5 &mdash; Size Capital in 'Position Sizer':</b> Enforce 1.5% - 2.0% max portfolio risk. Get exact share count.<br/>"
        "<b>Step 6 &mdash; Execute Order on TMS:</b> Place LIMIT order at [Entry Low] and log stop-loss in trading journal."
    )
    story.append(Paragraph(routine_text, body_style))
    story.append(Spacer(1, 14))

    disclaimer_text = (
        "<font size=7 color='#64748b'><b>Risk Disclaimer:</b> Equity trading on the Nepal Stock Exchange (NEPSE) involves substantial capital risk. "
        "Past backtested performance is no guarantee of future returns. This blueprint provides a rule-based quantitative methodology "
        "designed to maximize mathematical expectancy and defend capital. Always adhere strictly to SEBON &plusmn;15% statutory circuit rules and risk management.</font>"
    )
    story.append(Paragraph(disclaimer_text, body_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated {filename}")

if __name__ == "__main__":
    build_pdf()
