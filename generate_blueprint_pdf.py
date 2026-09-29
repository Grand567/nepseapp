import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
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
            self.drawString(54, 755, "DRABYASHREE NEPSE PRO — INSTITUTIONAL PROFIT BLUEPRINT")
            self.drawRightString(558, 755, "SEBON 2082/2083 STATUTORY COMPLIANCE")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 747, 558, 747)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        
        self.setFont("Helvetica", 8)
        self.drawString(54, 32, "Confidential & Educational Investor Guide — Context: Nepal Stock Exchange (NEPSE)")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 32, page_str)
        self.restoreState()

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0f172a')
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#059669')
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155')
    )

    body_bold = ParagraphStyle(
        'Body_Bold',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#0f172a')
    )

    badge_green = ParagraphStyle(
        'BadgeGreen',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#065f46')
    )

    badge_red = ParagraphStyle(
        'BadgeRed',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#991b1b')
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#1e293b')
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#0f172a')
    )

    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=colors.white
    )

    story = []

    # ── PAGE 1: EXECUTIVE FOUNDATION & 6-POINT MATRIX ──────────────
    # Header Banner
    banner_data = [
        [
            Paragraph("<b>DRABYASHREE NEPSE PRO</b><br/><font size='8' color='#cbd5e1'>QUANTITATIVE WORKSTATION & DECISION ENGINE</font>", table_header),
            Paragraph("<b>SEBON STATUTORY RULES 2082/2083</b><br/><font size='8' color='#cbd5e1'>±15% Daily Circuit Bands | 10% Final CGT | T+2 Settlement</font>", ParagraphStyle('RHeader', parent=table_header, alignment=2))
        ]
    ]
    banner_table = Table(banner_data, colWidths=[270, 234])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#0f172a')),
        ('PADDING', (0,0), (-1,-1), 10),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 14))

    # Title & Subtitle
    story.append(Paragraph("Step-by-Step Daily Blueprint to Choose High-Profit Stocks", title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("THE DEFINITIVE CONFIRMED ENTRY PROTOCOL ACCORDING TO OUR APP (NEPAL CONTEXT)", subtitle_style))
    story.append(Spacer(1, 10))

    intro_text = (
        "This institutional guide outlines the exact, repeatable methodology used by the <b>Drabyashree NEPSE PRO</b> "
        "Application to identify high-probability swing and momentum trades in Nepal. By synthesizing "
        "<b>Benjamin Graham's Margin of Safety</b>, <b>Mark Minervini's Stage 2 Trend Template</b>, "
        "<b>Richard Wyckoff's Microstructure Absorption</b>, and our proprietary <b>Step 4 Smart Money Broker Flow Audit</b>, "
        "traders can systematically capture profitable moves while avoiding retail distribution traps and catastrophic lower-circuit lock-ins."
    )
    story.append(Paragraph(intro_text, body_style))
    story.append(Spacer(1, 12))

    # Callout: The 3 Core Realities of NEPSE
    realities_data = [
        [
            Paragraph(
                "<b>THE 3 CRITICAL REALITIES OF TRADING IN NEPSE:</b><br/>"
                "&bull; <b>Statutory Circuit Volatility (&plusmn;15%):</b> Under SEBON's Fourth Amendment Bylaws 2082, daily price limits are &plusmn;15%. A single bad trade can erase 15% in a day if caught in a limit-down waterfall.<br/>"
                "&bull; <b>T+2 Delivery Asymmetry:</b> Shares purchased today cannot be exited until T+2 settlement. Chasing Day 2 or Day 3 momentum carries extreme risk of lower-circuit lock-in.<br/>"
                "&bull; <b>Broker Concentration:</b> NEPSE is dominated by 5 to 7 powerhouse broker houses. Chasing green candles when top brokers are dumping guarantees retail bag-holding.",
                body_style
            )
        ]
    ]
    realities_table = Table(realities_data, colWidths=[504])
    realities_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#94a3b8')),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(realities_table)
    story.append(Spacer(1, 14))

    # Section 1: The Master 6-Point Matrix
    story.append(Paragraph("1. The Master 6-Point Confirmed Entry Matrix", h1_style))
    story.append(Paragraph("Before executing any buy order in NEPSE, all 6 gates must turn <b>GREEN</b> inside the app:", body_style))
    story.append(Spacer(1, 6))

    matrix_data = [
        [Paragraph("Checkpoint", table_header), Paragraph("Target Metric in App", table_header), Paragraph("Confirmation Rule", table_header), Paragraph("Hard Reject Trigger", table_header)],
        [
            Paragraph("<b>1. Setup Stance</b>", table_cell_bold),
            Paragraph("Action / Stance Banner", table_cell),
            Paragraph("Must be <b>STRONG BUY</b> or <b>ACCUMULATE ON PULLBACK</b>", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if 'HOLD / DO NOT CHASE' or 'AVOID'", table_cell)
        ],
        [
            Paragraph("<b>2. Setup Score</b>", table_cell_bold),
            Paragraph("Setup Score Card", table_cell),
            Paragraph("Score <b>&ge; 70 / 100</b> with <b>HIGH</b> confidence rating", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if score &lt; 65 or bearish consensus", table_cell)
        ],
        [
            Paragraph("<b>3. Entry Price</b>", table_cell_bold),
            Paragraph("Entry Risk Card", table_cell),
            Paragraph("LTP is strictly <b>within [Entry Zone]</b> and <b>below Chase Cap</b>", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if LTP &gt; Chase Cap (+2.5% over pivot)", table_cell)
        ],
        [
            Paragraph("<b>4. Smart Money</b>", table_cell_bold),
            Paragraph("Step 4 Broker Card", table_cell),
            Paragraph("Top 3 Brokers account for <b>&gt; 40% of Buy Volume (BCR3)</b>", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if Top Brokers are net distributing", table_cell)
        ],
        [
            Paragraph("<b>5. Trap Monitor</b>", table_cell_bold),
            Paragraph("Radar / Step 4 Card", table_cell),
            Paragraph("<b>NO Distribution Trap Alert</b> (Selling into green)", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if 'Distribution Trap: Do Not Buy' fires", table_cell)
        ],
        [
            Paragraph("<b>6. Risk : Reward</b>", table_cell_bold),
            Paragraph("Multi-Horizon Targets", table_cell),
            Paragraph("Minimum <b>2.5 : 1</b> Net R:R (Stop-Loss strictly &le; 4.5% - 5.5%)", table_cell),
            Paragraph("<font color='#dc2626'><b>REJECT</b></font> if Stop-Loss &gt; 7% or R:R &lt; 2.0:1", table_cell)
        ]
    ]

    matrix_table = Table(matrix_data, colWidths=[95, 110, 165, 134])
    matrix_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e293b')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 5.5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(matrix_table)
    story.append(PageBreak())

    # ── PAGE 2: VALUATION SAFETY & TECHNICAL TREND ENGINE ──────────
    story.append(Paragraph("2. Pillar 1: Fundamental Safety & Graham Valuation Gate", h1_style))
    story.append(Paragraph(
        "Speculative bubbles in NEPSE frequently collapse by 40%–60%. To safeguard trading capital, "
        "apply Benjamin Graham's intrinsic safety screen before taking any swing position:",
        body_style
    ))
    story.append(Spacer(1, 6))

    p1_data = [
        [Paragraph("Fundamental Factor", table_header), Paragraph("Institutional Standard", table_header), Paragraph("Quantitative Formula & Practical Application", table_header)],
        [
            Paragraph("<b>Earnings Per Share (EPS)</b>", table_cell_bold),
            Paragraph("EPS &gt; Rs. 15.00", table_cell),
            Paragraph("Must be positive and operationally profitable. Never trade negative-EPS companies on unverified social media rumors.", table_cell)
        ],
        [
            Paragraph("<b>Price-to-Earnings (P/E)</b>", table_cell_bold),
            Paragraph("P/E &le; 25x – 30x", table_cell),
            Paragraph("Ceiling multiple for NEPSE equities. P/E &gt; 40x carries severe multiple contraction downside during general market pullbacks.", table_cell)
        ],
        [
            Paragraph("<b>Benjamin Graham Intrinsic (V*)</b>", table_cell_bold),
            Paragraph("V* &ge; Current LTP", table_cell),
            Paragraph("<b>V* = &radic;(22.5 &times; EPS &times; BVPS)</b>. Measures tangible asset and earnings backing. Safety Margin = (V* - LTP) / LTP.", table_cell)
        ],
        [
            Paragraph("<b>P/E &times; P/B Multiple</b>", table_cell_bold),
            Paragraph("&le; 22.5 Maximum", table_cell),
            Paragraph("Graham's product test. If P/E is 40x and P/B is 9.2x, the product is 368x (&gt;16 times the prudent limit), indicating extreme froth.", table_cell)
        ],
        [
            Paragraph("<b>Piotroski F-Score</b>", table_cell_bold),
            Paragraph("Score &ge; 5 / 9", table_cell),
            Paragraph("Evaluates 9 financial health dimensions: profitability, leverage, liquidity, and operational efficiency.", table_cell)
        ],
        [
            Paragraph("<b>Promoter Lock-in Expiry</b>", table_cell_bold),
            Paragraph("No Unlocks &lt; 30 Days", table_cell),
            Paragraph("Check the 3-year statutory lock-in expiry date under Corporate Actions to avoid massive insider supply dumps hitting the market.", table_cell)
        ]
    ]

    p1_table = Table(p1_data, colWidths=[120, 110, 274])
    p1_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f766e')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f0fdf4'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(p1_table)
    story.append(Spacer(1, 14))

    # Section 3: Technical Trend Structure
    story.append(Paragraph("3. Pillar 2: Technical Trend Structure & Volume Expansion", h1_style))
    story.append(Paragraph(
        "A healthy company in a structural downtrend will still destroy portfolio equity. Only trade securities in confirmed Stage 2 uptrend regimes:",
        body_style
    ))
    story.append(Spacer(1, 6))

    tech_points = [
        "<b>Minervini Stage 2 Uptrend:</b> Price must be comfortably above both the 50-day SMA and the 200-day SMA, with the 50-day SMA sloping upward above the 200-day SMA.",
        "<b>Relative Volume Surge (RVOL &ge; 1.5x - 2.5x):</b> Institutional breakouts require huge capital commitment. RVOL compares today's volume to the 50-day average. Breakouts on RVOL &lt; 1.0x are low-liquidity retail bull traps.",
        "<b>Volatility Contraction Pattern (VCP):</b> Look for successive contracting price consolidations (e.g. -14% &rarr; -7% &rarr; -3%) with drying volume prior to the breakout pivot.",
        "<b>Proximity to 20-day EMA:</b> Never chase an asset that is extended &gt; 10% - 12% above its 20-day EMA. Wait for a low-volume retest of support."
    ]
    for pt in tech_points:
        story.append(Paragraph(f"&bull; {pt}", body_style))
        story.append(Spacer(1, 3.5))

    story.append(Spacer(1, 6))
    tech_box_data = [
        [
            Paragraph(
                "<b>KEY TECHNICAL RULE:</b> A breakout with low volume (&lt; 1.0x RVOL) is a retail trap. "
                "Always confirm that volume expands by at least 1.5x to 3.0x on the breakout day, confirming institutional sponsorship.",
                body_style
            )
        ]
    ]
    tech_box_table = Table(tech_box_data, colWidths=[504])
    tech_box_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#eff6ff')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#3b82f6')),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(tech_box_table)
    story.append(PageBreak())

    # ── PAGE 3: SMART MONEY FLOW & NEPSE STATUTORY FRICTION ────────
    story.append(Paragraph("4. Pillar 3: Step 4 Smart Money Broker Flow Audit (Radar Tab)", h1_style))
    story.append(Paragraph(
        "NEPSE is a broker-centric order market where 5 to 7 major broker houses (e.g., #58 Naasa, #45 Imperial, #34 Vision, #29 Trisul) "
        "drive major directional moves. Our app provides direct, easy-glance verification via two non-negotiable rules:",
        body_style
    ))
    story.append(Spacer(1, 8))

    flow_box_data = [
        [
            Paragraph("<b>[RULE A] INSTITUTIONAL ACCUMULATION (&gt;40% BUY SHARE)</b>", badge_green),
            Paragraph("<b>[RULE B] DISTRIBUTION TRAP WARNING (DO NOT BUY!)</b>", badge_red)
        ],
        [
            Paragraph(
                "Top 3 brokers account for <b>&gt; 40% of all buy volume (BCR3)</b> in concentrated large blocks, "
                "while selling is fragmented across dozens of retail brokers.<br/><br/>"
                "&bull; Average buy ticket size is significantly larger than sell ticket size (&ge; 1.4x).<br/>"
                "&bull; Large buy orders hit the ask without letting price retrace.<br/>"
                "&bull; Confirms systematic institutional accumulation prior to markup.",
                table_cell
            ),
            Paragraph(
                "If top brokers are <b>net selling (dumping shares) into retail excitement</b> or into green price action, "
                "<b>DO NOT BUY</b>, even if the chart looks green or circuit-seeking.<br/><br/>"
                "&bull; High turnover churning at peak resistance.<br/>"
                "&bull; Retail buying heavily while top 3 brokers unload inventory.<br/>"
                "&bull; App triggers: <b>'Distribution Trap: Do Not Buy'</b>.",
                table_cell
            )
        ]
    ]
    flow_box_table = Table(flow_box_data, colWidths=[250, 254])
    flow_box_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#dcfce7')),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor('#fee2e2')),
        ('BACKGROUND', (0,1), (0,1), colors.HexColor('#f0fdf4')),
        ('BACKGROUND', (1,1), (1,1), colors.HexColor('#fef2f2')),
        ('BOX', (0,0), (0,1), 1, colors.HexColor('#16a34a')),
        ('BOX', (1,0), (1,1), 1, colors.HexColor('#dc2626')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(flow_box_table)
    story.append(Spacer(1, 14))

    # Section 5: Statutory Frictions & Risk-Reward Geometry
    story.append(Paragraph("5. Pillar 4: Risk-Reward Geometry & NEPSE Statutory Frictions", h1_style))
    story.append(Paragraph(
        "Profitability in NEPSE requires rigorous accounting for real-world transaction friction and tax liabilities:",
        body_style
    ))
    story.append(Spacer(1, 6))

    stat_data = [
        [Paragraph("Friction / Statutory Factor", table_header), Paragraph("Statutory Rate", table_header), Paragraph("Impact on Net Profit & Trading Plan", table_header)],
        [
            Paragraph("<b>SEBON Broker Commission</b>", table_cell_bold),
            Paragraph("0.36% – 0.40%", table_cell),
            Paragraph("Applied each way on gross traded value (approx. 0.72% - 0.75% round-trip friction).", table_cell)
        ],
        [
            Paragraph("<b>SEBON Regulatory Fee</b>", table_cell_bold),
            Paragraph("0.015%", table_cell),
            Paragraph("Applied on both buy and sell transactions (0.030% round-trip).", table_cell)
        ],
        [
            Paragraph("<b>Final Capital Gains Tax (CGT)</b>", table_cell_bold),
            Paragraph("<b>10.0% Final Tax</b>", table_cell),
            Paragraph("Mandated under Finance Act 2083 on net realized profit for individual holdings &lt; 365 days. The app computes targets <b>net of 10% CGT</b>.", table_cell)
        ],
        [
            Paragraph("<b>SEBON Daily Circuit Limits</b>", table_cell_bold),
            Paragraph("<b>&plusmn; 15% Daily Band</b>", table_cell),
            Paragraph("Fourth Amendment Bylaws 2082. Replaces old 10% bands. Expanded daily volatility requires strict stop-loss adherence.", table_cell)
        ],
        [
            Paragraph("<b>T+2 Settlement Delivery Lock</b>", table_cell_bold),
            Paragraph("2 Working Days", table_cell),
            Paragraph("Purchased shares cannot be sold until T+2 settlement. Chasing Day 2+ momentum runs the catastrophic risk of lower-circuit lock-ins.", table_cell)
        ]
    ]

    stat_table = Table(stat_data, colWidths=[130, 95, 279])
    stat_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e1b4b')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f5f3ff'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(stat_table)
    story.append(PageBreak())

    # ── PAGE 4: CASE STUDY & 10-SECOND DAILY WORKFLOW ──────────────
    story.append(Paragraph("6. Case Study: Live App Audit of HDL (Himalayan Distillery Ltd)", h1_style))
    story.append(Paragraph(
        "Applying the exact 5-pillar blueprint to the real-time telemetry captured in the app for <b>HDL (LTP: Rs. 1,312)</b>:",
        body_style
    ))
    story.append(Spacer(1, 6))

    hdl_data = [
        [Paragraph("Pillar / Checkpoint", table_header), Paragraph("HDL App Metric", table_header), Paragraph("Institutional Diagnosis", table_header), Paragraph("Verdict", table_header)],
        [
            Paragraph("<b>Pillar 1: Valuation</b>", table_cell_bold),
            Paragraph("P/E: <b>40.11x</b><br/>P/E &times; P/B: <b>372.2</b><br/>Graham V*: <b>Rs. 322.63</b>", table_cell),
            Paragraph("Margin of Safety Deficit: <b>-306.6%</b>. Trades at 4x its intrinsic book valuation. Piotroski score is only 4/9.", table_cell),
            Paragraph("<font color='#dc2626'><b>FAIL</b></font><br/>Extreme Multiple", table_cell_bold)
        ],
        [
            Paragraph("<b>Pillar 2: Technicals</b>", table_cell_bold),
            Paragraph("Price: Rs. 1,312<br/>50 SMA: Rs. 1,285.8<br/>RVOL: <b>4.39x Surge</b>", table_cell),
            Paragraph("Above 50 & 200 SMA. Turnover of Rs. 35.17 Cr confirms huge volume expansion. However, extended +12.4% over 30 days.", table_cell),
            Paragraph("<font color='#16a34a'><b>PASS</b></font><br/>Strong Trend", table_cell_bold)
        ],
        [
            Paragraph("<b>Pillar 3: Smart Money</b>", table_cell_bold),
            Paragraph("BCR3: <b>57.5% (&gt;40%)</b><br/>Broker #58: +16,867<br/>Net Inst: +10,544 kitta", table_cell),
            Paragraph("Top 3 brokers (#58 Naasa, #29 Trisul, #57 Aryatara) cornered 57.5% of buy volume. Completely absorbed sellers #45 and #20.", table_cell),
            Paragraph("<font color='#16a34a'><b>PASS</b></font><br/>Inst. Accumulation", table_cell_bold)
        ],
        [
            Paragraph("<b>Pillar 4: Risk / Reward</b>", table_cell_bold),
            Paragraph("R:R Ratio: <b>1.71 : 1</b><br/>Target 1: Rs. 1,390.7<br/>Stop Floor: Rs. 1,266.1", table_cell),
            Paragraph("Upside to Resistance 1 is only +4.7% net, while risk to support floor is -3.5%. R:R ratio is below the 2.5:1 institutional threshold.", table_cell),
            Paragraph("<font color='#d97706'><b>CAUTION</b></font><br/>Sub-optimal R:R", table_cell_bold)
        ],
        [
            Paragraph("<b>Pillar 5: Win Rate</b>", table_cell_bold),
            Paragraph("Analog Win Rate: <b>31.3%</b><br/>Stance: <b>HOLD / DO NOT CHASE</b>", table_cell),
            Paragraph("Historical backtests show chasing high-P/E breakouts near 52-week resistance fails 68.7% of the time.", table_cell),
            Paragraph("<font color='#dc2626'><b>DO NOT CHASE</b></font>", table_cell_bold)
        ]
    ]

    hdl_table = Table(hdl_data, colWidths=[105, 115, 204, 80])
    hdl_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(hdl_table)
    story.append(Spacer(1, 8))

    action_box_data = [
        [
            Paragraph("<b>HDL ACTIONABLE VERDICT FOR MAXIMUM PROFIT:</b><br/>"
                      "&bull; <b>Existing Holders:</b> HOLD with a strict trailing stop at <b>Rs. 1,266.1</b> (-3.5%). Partial profit take at Rs. 1,390.<br/>"
                      "&bull; <b>Fresh Capital Buyers:</b> <b>DO NOT CHASE at Rs. 1,312.</b> Wait for a low-volume pullback into the 50-day SMA support zone at <b>Rs. 1,265 – Rs. 1,285</b> with a stop at Rs. 1,240. This expands your Risk:Reward ratio from 1.71:1 to <b>&gt; 3.2:1</b>.",
                      body_style)
        ]
    ]
    action_table = Table(action_box_data, colWidths=[504])
    action_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fef3c7')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#f59e0b')),
        ('PADDING', (0,0), (-1,-1), 7),
    ]))
    story.append(action_table)
    story.append(Spacer(1, 10))

    # Section 7: Daily Workflow Routine
    story.append(Paragraph("7. The 10-Second Daily Routine to Screen for Profit", h1_style))
    story.append(Paragraph("To save time and trade with maximum discipline every trading morning (11:00 AM – 3:00 PM):", body_style))
    story.append(Spacer(1, 4))

    routine_steps = [
        "<b>Step 1 — Open 'Broker Flow Dominance':</b> Click the <b>[Institutional Accumulation &gt;40%]</b> filter pill. This immediately filters out 95% of retail noise and presents only stocks where top 3 brokers are absorbing supply in large blocks.",
        "<b>Step 2 — Verify 'Day Prime Pick' / Guru Screener:</b> Select the highest-ranked candidate with a <b>Setup Score &ge; 70</b> and a verdict of <b>STRONG BUY</b>.",
        "<b>Step 3 — Inspect 'Entry / Exit Analyzer':</b> Check that the current price is strictly inside the <b>Entry Zone</b> and below the <b>Chase Cap</b>.",
        "<b>Step 4 — Verify Step 4 Broker Flow Card:</b> Ensure the card displays <b>INSTITUTIONAL ACCUMULATION CONFIRMED</b> and confirms NO <b>Distribution Trap</b>.",
        "<b>Step 5 — Check Stop-Loss & Net Targets:</b> Ensure the logical stop-loss is &le; 4.5% - 5.0% and Net Target 1 (after 10% CGT) yields at least +8% to +12%.",
        "<b>Step 6 — Execute Order:</b> Place your order on TMS within the defined Entry Zone and immediately record your stop-loss floor."
    ]
    for step in routine_steps:
        story.append(Paragraph(step, body_style))
        story.append(Spacer(1, 2.5))

    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#cbd5e1'), spaceBefore=2, spaceAfter=5))
    story.append(Paragraph(
        "<b>Risk Disclaimer:</b> Equity trading on the Nepal Stock Exchange (NEPSE) involves substantial market risk. "
        "Past performance is no guarantee of future returns. This blueprint provides a disciplined, rule-based quantitative framework "
        "to maximize risk-adjusted probabilities and minimize capital drawdowns. Always adhere strictly to statutory circuit limits "
        "(&plusmn;15%) and risk management protocols.",
        ParagraphStyle('Disclaimer', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=7.5, leading=9.5, textColor=colors.HexColor('#64748b'))
    ))

    # Build PDF with custom NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated: {filename}")

if __name__ == '__main__':
    out_path = sys.argv[1] if len(sys.argv) > 1 else 'NEPSE_Confirmed_Entry_Profit_Blueprint.pdf'
    build_pdf(out_path)
