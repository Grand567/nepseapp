import sys
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Draw header (on pages > 1)
        if self._pageNumber > 1:
            self.drawString(36, 805, "NEPSE Alpha Playbook — High-Probability Execution & Capital Protection Guide")
            self.setStrokeColor(colors.HexColor("#e2e8f0"))
            self.setLineWidth(0.5)
            self.line(36, 800, 559, 800)
            
        # Draw footer on all pages
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(36, 40, 559, 40)
        
        self.drawString(36, 28, "NEPSE Quantitative Intelligence Platform • Confidential Trader Manual")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(559, 28, page_str)
        self.restoreState()

def build_pdf(filename="NEPSE_Alpha_Playbook.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=4
    )
    
    badge_style = ParagraphStyle(
        'Badge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor('#0284c7'),
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#475569'),
        spaceAfter=12
    )
    
    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=12,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155')
    )

    bold_body = ParagraphStyle(
        'BoldBody',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#0f172a')
    )

    callout_text = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#1e293b')
    )
    
    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor('#334155')
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=table_cell,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#0f172a')
    )

    table_hdr = ParagraphStyle(
        'TableHdr',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor('#0f172a')
    )

    danger_badge = ParagraphStyle(
        'DangerBadge',
        parent=table_cell_bold,
        textColor=colors.HexColor('#b91c1c')
    )

    success_badge = ParagraphStyle(
        'SuccessBadge',
        parent=table_cell_bold,
        textColor=colors.HexColor('#15803d')
    )

    story = []

    # Title Banner
    story.append(Paragraph("NEPSE QUANTITATIVE TRADING MANUAL", badge_style))
    story.append(Paragraph("NEPSE Alpha Playbook: Profit & Execution Guide", title_style))
    story.append(Paragraph("Filtering 110+ App Features into High-Probability Swings and Strict Capital Defense", subtitle_style))
    
    # Core Axiom Callout Box
    axiom_html = (
        "<b>Core Market Reality of NEPSE:</b> In the Nepal Stock Exchange, <b>capital preservation is 80% of net profitability</b>. "
        "Because NEPSE enforces a <b>T+2 settlement freeze</b> (stocks purchased today cannot be sold for 2 trading days), "
        "has <b>no short-selling</b>, and caps moves with <b>±10% circuit limits</b>, bad entries cannot be rescued intraday. "
        "To consistently profit among the app's 110+ features, follow the rule: "
        "<i>Defend Capital First &rarr; Follow Institutional Footprints &rarr; Execute Asymmetrically.</i>"
    )
    axiom_table = Table([[Paragraph(axiom_html, callout_text)]], colWidths=[523])
    axiom_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('LINEBEFORE', (0,0), (0,0), 3.5, colors.HexColor('#0284c7')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    story.append(axiom_table)
    story.append(Spacer(1, 10))

    # SECTION 1: 3 TIERS
    story.append(Paragraph("1. FEATURE RELIABILITY CLASSIFICATION (THE 3 TIERS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0284c7"), spaceAfter=8))

    # Tier 1 Table
    t1_title = Paragraph("<b>TIER 1: Non-Negotiable Capital Protectors</b> &nbsp;<font color='#b91c1c' size=7.5><b>[ WEIGHT: 90%+ RELIABILITY ]</b></font><br/><font size=7.5 color='#64748b'>These 4 core features shield you from severe drawdowns. Never violate these rules.</font>", table_cell)
    
    t1_data = [
        [t1_title, ""],
        [
            Paragraph("<b>1. Cash Defense Mode (Market Breadth Gate)</b><br/>"
                      "<font color='#64748b'>Evaluates real-time Advance/Decline ratio and New Highs vs Lows. In bear regimes (breadth &lt; 40%), over 75% of chart breakouts fail immediately.</font><br/>"
                      "<font color='#b91c1c'><b>RULE:</b> In Cash Defense, <b>DO NOT BUY ANY BREAKOUT</b>. Keep 70-80% cash.</font>", table_cell),
            Paragraph("<b>2. Chase Cap Guard (+2.5% Max Limit)</b><br/>"
                      "<font color='#64748b'>Guards against T+2 clearing traps. Buying a stock already up +4% to +8% on Day 1 makes you easy exit liquidity for short-term swingers.</font><br/>"
                      "<font color='#b91c1c'><b>RULE:</b> If Current Price &gt; Entry Pivot + 2.5%, <b>CANCEL TRADE</b>. Never chase.</font>", table_cell)
        ],
        [
            Paragraph("<b>3. Promoter Lock-in Radar (60-Day Blackout)</b><br/>"
                      "<font color='#64748b'>Hydros and Microfinances unlock 3-year promoter shares post-IPO, dumping massive supply and causing multi-month 20-40% collapses.</font><br/>"
                      "<font color='#b91c1c'><b>RULE:</b> Automatic blacklist. Never swing trade within 60 days of lock-in expiry.</font>", table_cell),
            Paragraph("<b>4. Broker LBAS (Large-Block Floorsheet)</b><br/>"
                      "<font color='#64748b'>Tracks institutional accumulation (e.g. Brokers 58, 45, 34, 17) to confirm whether real capital or speculative retail is buying.</font><br/>"
                      "<font color='#15803d'><b>RULE:</b> Only swing when Top 3 buyer brokers control &ge; 35% of total volume.</font>", table_cell)
        ]
    ]
    t1_table = Table(t1_data, colWidths=[256, 257])
    t1_table.setStyle(TableStyle([
        ('SPAN', (0,0), (1,0)),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#fee2e2')),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#ffffff')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#fca5a5')),
        ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#f1f5f9')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t1_table)
    story.append(Spacer(1, 8))

    # Tier 2 Table
    t2_title = Paragraph("<b>TIER 2: High-Edge Opportunity Engines</b> &nbsp;<font color='#15803d' size=7.5><b>[ STATISTICAL EDGE: 80%+ ]</b></font><br/><font size=7.5 color='#64748b'>Primary alpha generation tools during neutral and bullish market regimes.</font>", table_cell)
    
    t2_data = [
        [t2_title, ""],
        [
            Paragraph("<b>1. Day Prime Pick + Zero-Loss Protocol</b><br/>"
                      "<font color='#64748b'>Screens entire market via 500-session analog vectors, liquidity, fundamental safety, and broker accumulation.</font><br/>"
                      "<font color='#15803d'><b>ZERO-LOSS RULE:</b> Sell 50% at Target 1 (+4% to +6%). Immediately move SL on remainder to Entry. Trade is now immune to loss.</font>", table_cell),
            Paragraph("<b>2. Sector Rotation Matrix & Heatmap</b><br/>"
                      "<font color='#64748b'>NEPSE money flows in waves across sub-indices (Hydro &rarr; Finance &rarr; Commercial Banks &rarr; Insurance).</font><br/>"
                      "<font color='#15803d'><b>RULE:</b> Never buy a stock in a 'Lagging' sector. Only trade sectors in 'Leading' or 'Improving' quadrants.</font>", table_cell)
        ],
        [
            Paragraph("<b>3. Pre-Open Order Book Imbalance (OBIR)</b><br/>"
                      "<font color='#64748b'>Measures real matching bid/ask depth between 10:30 AM & 11:00 AM before the market opens.</font><br/>"
                      "<font color='#15803d'><b>RULE:</b> OBIR &gt; 1.8 with positive matching depth confirms strong institutional morning demand.</font>", table_cell),
            Paragraph("<b>4. Dual-Gate Alerts (RVOL &ge; 1.4x + VCP)</b><br/>"
                      "<font color='#64748b'>Detects volatility compression breakouts validated against a 20-day baseline relative volume.</font><br/>"
                      "<font color='#15803d'><b>RULE:</b> Volume precedes price. Never trust a chart breakout if live RVOL &lt; 1.0x.</font>", table_cell)
        ]
    ]
    t2_table = Table(t2_data, colWidths=[256, 257])
    t2_table.setStyle(TableStyle([
        ('SPAN', (0,0), (1,0)),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#dcfce7')),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#ffffff')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#86efac')),
        ('INNERGRID', (0,1), (-1,-1), 0.5, colors.HexColor('#f1f5f9')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t2_table)
    story.append(Spacer(1, 8))

    # Tier 3 Traps
    t3_html = (
        "<b>TIER 3: DANGEROUS TRAPS TO AVOID IN ISOLATION:</b><br/>"
        "• <b>Standalone Oscillators (RSI / MACD):</b> In speculative NEPSE runs, RSI &gt; 70 can stay overbought for 3 weeks while the stock doubles; RSI &lt; 30 can drop another 30%. Never trade oscillators without volume and floorsheet confirmation.<br/>"
        "• <b>Theoretical Monte Carlo Projections:</b> Gaussian curves cannot anticipate sudden Nepal Rastra Bank directives, margin ceiling caps, or interest rate decisions.<br/>"
        "• <b>Unadjusted Charts:</b> Bonus and right shares distort support/resistance. Always use corporate-adjusted price series."
    )
    t3_table = Table([[Paragraph(t3_html, table_cell)]], colWidths=[523])
    t3_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fffbeb')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#fde68a')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t3_table)

    # Page Break for Step Routine and Tables
    story.append(PageBreak())

    # SECTION 2: DAILY ROUTINE
    story.append(Paragraph("2. THE 4-STEP DAILY EXECUTION ROUTINE", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0284c7"), spaceAfter=8))

    routine_data = [
        [Paragraph("Time Window", table_hdr), Paragraph("Action Checklist & Non-Negotiable Gate", table_hdr)],
        [
            Paragraph("<b>10:00 - 10:30 AM</b><br/><font color='#0284c7'>Pre-Market Scan</font>", table_cell),
            Paragraph("• Check <b>Cash Defense Mode</b> on top banner. If ACTIVE, <b>stop</b>: close buy tab; hold 70-80% cash.<br/>"
                      "• Review <b>Day Prime Pick</b> card: record Entry Zone, Chase Cap (+2.5%), Stop Loss, and Target 1.<br/>"
                      "• Run <b>Safety Audit</b>: verify candidate stock has NO promoter lock-in expiry in next 60 days.", table_cell)
        ],
        [
            Paragraph("<b>10:30 - 11:00 AM</b><br/><font color='#0284c7'>Pre-Open Validation</font>", table_cell),
            Paragraph("• Observe <b>Pre-Open OBIR</b> (Order Book Imbalance Ratio) for morning buyer depth.<br/>"
                      "• Check projected opening price: If gapping up &gt; 2.5% above entry pivot, <b>ABORT BUY</b> (Chase Cap violated). If opening inside Entry Zone with OBIR &gt; 1.5, setup is <b>VALID</b>.", table_cell)
        ],
        [
            Paragraph("<b>11:15 - 01:30 PM</b><br/><font color='#0284c7'>Live Execution & Sizing</font>", table_cell),
            Paragraph("• Wait out 11:00-11:15 AM opening shakeout to avoid emotional retail whipsaws.<br/>"
                      "• Verify live volume pacing: <b>RVOL must be &ge; 1.2x - 1.5x</b> of 20-day baseline.<br/>"
                      "• Apply <b>1.5% Risk Sizing Rule:</b> <i>Max Shares = (Portfolio × 0.015) / (Entry - StopLoss)</i>.<br/>"
                      "• Place Limit Orders strictly inside the Entry Zone on TMS.", table_cell)
        ],
        [
            Paragraph("<b>03:15 - 04:00 PM</b><br/><font color='#0284c7'>Floorsheet Audit</font>", table_cell),
            Paragraph("• Open <b>Floorsheet Analytics</b> for the stock.<br/>"
                      "• Identify Top 5 buyer and seller broker IDs: did Broker 58, 45, 34, 17 net accumulate?<br/>"
                      "• Did Top 3 buyer brokers control &ge; 35% of total volume?<br/>"
                      "• Calibrate trailing stop loss and lock in T+2 execution plan.", table_cell)
        ]
    ]
    routine_table = Table(routine_data, colWidths=[115, 408])
    routine_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(routine_table)
    story.append(Spacer(1, 10))

    # SECTION 3: SEASONAL CYCLES
    story.append(Paragraph("3. SEASONAL LIQUIDITY & CALENDAR CYCLES IN NEPAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0284c7"), spaceAfter=8))

    season_data = [
        [Paragraph("Period", table_hdr), Paragraph("Market Behavior & Retail Dynamic", table_hdr), Paragraph("Strategic Trader Edge", table_hdr)],
        [
            Paragraph("<b>Bhadra - Ashwin</b><br/><font color='#64748b'>(Sept - Oct)</font>", table_cell),
            Paragraph("<b>Pre-Dashain Liquidity Squeeze:</b> Retail liquidates shares for festival expenses, travel, and business cash. Margin lending tightens.", table_cell),
            Paragraph("Volume drops sharply. Historically the best accumulation window to purchase quality dividend stocks at steep valuation discounts.", table_cell)
        ],
        [
            Paragraph("<b>Mangsir - Magh</b><br/><font color='#64748b'>(Dec - Feb)</font>", table_cell),
            Paragraph("<b>Dividend Season Rally:</b> Commercial banks, insurance, and hydro companies hold AGMs and declare bonus/cash dividends.", table_cell),
            Paragraph("Strongest multi-week seasonal rally. Sell into strength before the book closure date rather than holding through the dividend adjustment.", table_cell)
        ],
        [
            Paragraph("<b>Chaitra - Baisakh</b><br/><font color='#64748b'>(Mar - May)</font>", table_cell),
            Paragraph("<b>Q3 Corporate Earnings:</b> Banking liquidity stabilizes before national annual budget announcement.", table_cell),
            Paragraph("Focus on high cash-flow producers and sector rotations driven by quarterly EPS surprises.", table_cell)
        ],
        [
            Paragraph("<b>Ashad</b><br/><font color='#64748b'>(June - July)</font>", table_cell),
            Paragraph("<b>Fiscal Year-End Squeeze:</b> Banks recall loans; investors sell to settle quarterly tax and interest obligations.", table_cell),
            Paragraph("High volatility and sharp pullbacks. Avoid aggressive new swing buys during the final 2 weeks of Ashad. Save cash for Shrawan.", table_cell)
        ]
    ]
    season_table = Table(season_data, colWidths=[100, 210, 213])
    season_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(season_table)
    story.append(Spacer(1, 10))

    # SECTION 4: DECISION MATRIX
    story.append(Paragraph("4. QUICK-REFERENCE DECISION MATRIX", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#0284c7"), spaceAfter=8))

    matrix_data = [
        [Paragraph("Live Market Scenario", table_hdr), Paragraph("Primary Feature to Check", table_hdr), Paragraph("Required Trader Action", table_hdr)],
        [
            Paragraph("Index dropping, Market Breadth &lt; 40%", table_cell),
            Paragraph("<b>Cash Defense Mode</b>", table_cell),
            Paragraph("<font color='#b91c1c'><b>Hold 70-80% Cash.</b></font> Abort all chart breakouts.", table_cell)
        ],
        [
            Paragraph("Stock is up +5% at 11:05 AM", table_cell),
            Paragraph("<b>Chase Cap Indicator</b>", table_cell),
            Paragraph("<font color='#b91c1c'><b>Do not buy.</b></font> Never chase past +2.5% of pivot.", table_cell)
        ],
        [
            Paragraph("Stock has promoter lock-in in 30 days", table_cell),
            Paragraph("<b>Promoter Lock-in Radar</b>", table_cell),
            Paragraph("<font color='#b91c1c'><b>Blacklist stock.</b></font> Severe supply shock ahead.", table_cell)
        ],
        [
            Paragraph("Stock reaches Target 1 (+5%) on T+2", table_cell),
            Paragraph("<b>Entry/Exit Analyzer Levels</b>", table_cell),
            Paragraph("<font color='#15803d'><b>Sell 50% position.</b></font> Move Stop Loss to Entry price.", table_cell)
        ],
        [
            Paragraph("Price breaks out on low volume (RVOL &lt; 1.0x)", table_cell),
            Paragraph("<b>Relative Volume (RVOL)</b>", table_cell),
            Paragraph("<font color='#b91c1c'><b>Fake breakout trap.</b></font> Do not enter.", table_cell)
        ],
        [
            Paragraph("Top 3 brokers accumulate &ge; 35% of volume", table_cell),
            Paragraph("<b>Floorsheet LBAS</b>", table_cell),
            Paragraph("<font color='#15803d'><b>High-conviction setup.</b></font> Institutional backing active.", table_cell)
        ]
    ]
    matrix_table = Table(matrix_data, colWidths=[175, 155, 193])
    matrix_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(matrix_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print("PDF generated successfully:", filename)

if __name__ == "__main__":
    build_pdf("c:/Users/Hp/Desktop/Software/nepse app/NEPSE_Alpha_Playbook.pdf")
