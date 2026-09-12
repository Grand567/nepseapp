import React, { useState, useEffect, useMemo } from 'react';
import { calculateBuyDetails, calculateSellDetails, adjustForBonusShare, adjustForRightShare } from '../utils/calculations';
import { HelpCircle, Copy, Check, Calculator as CalcIcon, Percent, TrendingUp, Sparkles, RefreshCw } from 'lucide-react';

export default function Calculator() {
  const [activeTab, setActiveTab] = useState('buy');
  const [copiedBuyWacc, setCopiedBuyWacc] = useState(false);
  
  // ── 1. Buy State ──
  const [buyQty, setBuyQty] = useState(100);
  const [buyPrice, setBuyPrice] = useState(250);
  const [buyResult, setBuyResult] = useState(null);

  // ── 2. Sell State ──
  const [sellQty, setSellQty] = useState(100);
  const [sellPrice, setSellPrice] = useState(300);
  const [buyWacc, setBuyWacc] = useState(250);
  const [holdingType, setHoldingType] = useState('short'); // 'short' (10% - Finance Act 2083), 'long' (7.5%), 'institutional' (10%)
  const [sellResult, setSellResult] = useState(null);

  // ── 3. Bonus & Right Adjustment State ──
  const [adjLtp, setAdjLtp] = useState(450);
  const [bonusPct, setBonusPct] = useState(10);
  const [rightPct, setRightPct] = useState(0);
  const [rightIssuePrice, setRightIssuePrice] = useState(100);
  const [userShares, setUserShares] = useState(100);

  // ── 4. SIP & Wealth Compounder State ──
  const [sipMonthly, setSipMonthly] = useState(10000);
  const [sipReturnRate, setSipReturnRate] = useState(15);
  const [sipYears, setSipYears] = useState(10);

  // ── 5. Margin Loan State (NRB Directive) ──
  const [marginUnits, setMarginUnits] = useState(1000);
  const [marginLtp, setMarginLtp] = useState(600);
  const [marginAvg180, setMarginAvg180] = useState(550);
  const [marginLtv, setMarginLtv] = useState(70);
  const [marginRate, setMarginRate] = useState(9.5);
  const [marginMaintenance, setMarginMaintenance] = useState(130);
  const [borrowerType, setBorrowerType] = useState('individual');

  // Update Buy/Sell calculations
  useEffect(() => {
    if (buyQty > 0 && buyPrice > 0) {
      setBuyResult(calculateBuyDetails(buyQty, buyPrice));
    } else {
      setBuyResult(null);
    }
  }, [buyQty, buyPrice]);

  useEffect(() => {
    if (sellQty > 0 && sellPrice > 0 && buyWacc > 0) {
      setSellResult(calculateSellDetails(sellQty, sellPrice, buyWacc, holdingType));
    } else {
      setSellResult(null);
    }
  }, [sellQty, sellPrice, buyWacc, holdingType]);

  const formatRs = (value) => {
    if (value == null || isNaN(value)) return 'Rs. 0.00';
    return new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value).replace('NPR', 'Rs.');
  };

  const handleCopyBuyWacc = () => {
    if (!buyResult) return;
    navigator.clipboard.writeText(buyResult.costPerShare.toFixed(2));
    setCopiedBuyWacc(true);
    setTimeout(() => setCopiedBuyWacc(false), 2000);
  };

  // ── Break-Even Calculation ──
  const breakEvenResult = useMemo(() => {
    if (sellQty <= 0 || buyWacc <= 0) return null;
    
    let low = buyWacc;
    let high = buyWacc * 2 + 50;
    let breakEvenPrice = buyWacc;
    
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const sellDetails = calculateSellDetails(sellQty, mid, buyWacc, holdingType);
      if (sellDetails.netProfitLoss >= 0) {
        breakEvenPrice = mid;
        high = mid;
      } else {
        low = mid;
      }
    }
    
    const details = calculateSellDetails(sellQty, breakEvenPrice, buyWacc, holdingType);
    return {
      price: breakEvenPrice,
      ...details
    };
  }, [sellQty, buyWacc, holdingType]);

  // ── Bonus & Right Price Adjustment Calculation ──
  const adjustmentResult = useMemo(() => {
    const p0 = parseFloat(adjLtp) || 0;
    const bRatio = (parseFloat(bonusPct) || 0) / 100;
    const rRatio = (parseFloat(rightPct) || 0) / 100;
    const pr = parseFloat(rightIssuePrice) || 100;
    const qty = parseInt(userShares) || 0;

    if (p0 <= 0) return null;

    const denominator = 1 + bRatio + rRatio;
    
    const bonusPctNum = parseFloat(bonusPct) || 0;
    const rightRatioNum = (parseFloat(rightPct) || 0) / 100;
    
    // Wire to utils/calculations.js adjustForBonusShare and adjustForRightShare (which handles WACC)
    // For raw price adjustment (P_close):
    let adjustedPrice = p0;
    if (bonusPctNum > 0) adjustedPrice = adjustedPrice / (1 + (bonusPctNum/100));
    if (rightRatioNum > 0) adjustedPrice = (adjustedPrice + (rightRatioNum * pr)) / (1 + rightRatioNum);

    const bonusUnits = Math.floor(qty * (bonusPctNum/100));
    const rightUnits = Math.floor(qty * rightRatioNum);
    const totalNewUnits = qty + bonusUnits + rightUnits;
    const rightCost = rightUnits * pr;
    const bonusTax = bonusUnits * 100 * 0.05;

    return {
      adjustedPrice: Number(adjustedPrice.toFixed(2)),
      bonusUnits,
      rightUnits,
      totalNewUnits,
      rightCost,
      bonusTax,
      preValue: qty * p0,
      postValue: totalNewUnits * adjustedPrice
    };
  }, [adjLtp, bonusPct, rightPct, rightIssuePrice, userShares]);

  // ── SIP Calculation ──
  const sipResult = useMemo(() => {
    const p = parseFloat(sipMonthly) || 0;
    const annualRate = parseFloat(sipReturnRate) || 0;
    const years = parseFloat(sipYears) || 0;

    if (p <= 0 || years <= 0) return null;

    const months = years * 12;
    const i = annualRate / 12 / 100;

    let maturity = 0;
    if (i > 0) {
      maturity = p * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
    } else {
      maturity = p * months;
    }

    const totalInvested = p * months;
    const estReturns = Math.max(0, maturity - totalInvested);

    return {
      totalInvested: Math.round(totalInvested),
      estReturns: Math.round(estReturns),
      maturity: Math.round(maturity),
      months
    };
  }, [sipMonthly, sipReturnRate, sipYears]);

  // ── NRB Margin Loan Calculation ──
  const marginLoanResult = useMemo(() => {
    if (marginUnits <= 0 || marginLtp <= 0) return null;
    const avg = marginAvg180 > 0 ? marginAvg180 : marginLtp;
    const valuationPrice = Math.min(marginLtp, avg);
    const collateralValuation = marginUnits * valuationPrice;
    const currentMarketValuation = marginUnits * marginLtp;
    const effectiveLtv = Math.min(70, Math.max(10, marginLtv));
    const calculatedLoan = collateralValuation * (effectiveLtv / 100);
    const ceiling = borrowerType === 'individual' ? 150000000 : 200000000;
    const approvedLoan = Math.min(calculatedLoan, ceiling);
    const isCapped = calculatedLoan > ceiling;

    const maintRatio = (parseFloat(marginMaintenance) || 130) / 100;
    const callPrice = (approvedLoan * maintRatio) / marginUnits;
    const cushion = ((marginLtp - callPrice) / marginLtp) * 100;

    const annualInterest = approvedLoan * (parseFloat(marginRate) / 100);
    const monthlyInterest = annualInterest / 12;

    return {
      valuationPrice,
      effectiveLtv,
      collateralValuation,
      currentMarketValuation,
      approvedLoan,
      isCapped,
      ceiling,
      callPrice,
      cushion,
      annualInterest,
      monthlyInterest
    };
  }, [marginUnits, marginLtp, marginAvg180, marginLtv, marginRate, marginMaintenance, borrowerType]);

  return (
    <div style={{ padding: '16px 14px 40px' }}>
      {/* 6-Tab Selector (Dashboard Pill Chips) */}
      <div style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        borderBottom: '1px solid var(--border)',
        paddingBottom: 12,
        marginBottom: 16
      }}>
        {[
          { id: 'buy', label: 'Buy WACC', icon: '🛒', color: 'var(--primary-light)' },
          { id: 'sell', label: 'Sell Profit', icon: '💰', color: 'var(--bull)' },
          { id: 'breakeven', label: 'Break-Even', icon: '🎯', color: '#f59e0b' },
          { id: 'adjustment', label: 'Bonus / Right', icon: '🎁', color: '#ec4899' },
          { id: 'sip', label: 'SIP Growth', icon: '📈', color: '#06b6d4' },
          { id: 'margin_loan', label: 'Margin Loan (NRB)', icon: '🏛️', color: '#8b5cf6' }
        ].map(t => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: '1 0 auto',
                padding: '8px 14px',
                textAlign: 'center',
                fontWeight: 800,
                fontSize: 12,
                whiteSpace: 'nowrap',
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 12,
                background: isActive ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                boxShadow: isActive ? '0 0 16px rgba(79,70,229,0.3)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: BUY SHARE CALCULATOR ── */}
      {activeTab === 'buy' && (
        <div>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Buy Specifications</h3>
            
            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Number of Shares (Quantity)</label>
              <input
                type="number"
                value={buyQty}
                onChange={(e) => setBuyQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="input"
                placeholder="Enter quantity"
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="input-label">Share Purchase Price (Rs.)</label>
              <input
                type="number"
                value={buyPrice}
                onChange={(e) => setBuyPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="input"
                placeholder="Enter price per share"
              />
            </div>
          </div>

          {buyResult && (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 16 }}>Cost Breakdown</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Share Value:</span>
                  <span style={{ fontWeight: 600 }}>{formatRs(buyResult.shareValue)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Broker Commission (Tiered)
                    <HelpCircle style={{ width: 14, height: 14, opacity: 0.7 }} />
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>+{formatRs(buyResult.commission)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SEBON Fee (0.015%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>+{formatRs(buyResult.sebonFee)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>DP Charge:</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>+{formatRs(buyResult.dpFee)}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 15 }}>Total Amount Payable:</span>
                  <span style={{ fontWeight: 900, fontSize: 18, color: 'var(--primary-light)', fontFamily: 'var(--font-mono)' }}>{formatRs(buyResult.totalAmount)}</span>
                </div>

                <div className="card-sm" style={{ background: 'var(--primary-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)' }}>Effective WACC per Share:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, color: 'var(--primary-light)', fontFamily: 'var(--font-mono)' }}>{formatRs(buyResult.costPerShare)}</span>
                    <button 
                      type="button" 
                      onClick={handleCopyBuyWacc} 
                      className="icon-btn" 
                      style={{ width: 26, height: 26, borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }}
                      title="Copy WACC value"
                    >
                      {copiedBuyWacc ? <Check style={{ width: 12, height: 12, color: 'var(--bull)' }} /> : <Copy style={{ width: 12, height: 12 }} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: SELL SHARE CALCULATOR ── */}
      {activeTab === 'sell' && (
        <div>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Sell Specifications</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="input-label">Quantity</label>
                <input
                  type="number"
                  value={sellQty}
                  onChange={(e) => setSellQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="input"
                />
              </div>
              <div>
                <label className="input-label">Selling Rate (Rs.)</label>
                <input
                  type="number"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Purchase WACC (Rs.)</label>
              <input
                type="number"
                value={buyWacc}
                onChange={(e) => setBuyWacc(Math.max(0, parseFloat(e.target.value) || 0))}
                className="input"
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="input-label">Capital Gains Holding Period</label>
              <select
                value={holdingType}
                onChange={(e) => setHoldingType(e.target.value)}
                className="select-input"
              >
                <option value="short">Individual Short Term (≤ 365 Days, 10.0% CGT — Final Tax)</option>
                <option value="long">Individual Long Term (&gt; 365 Days, 7.5% CGT — Final Tax)</option>
                <option value="institutional">Institutional Investor (10.0% CGT)</option>
              </select>
            </div>
          </div>

          {sellResult && (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 16 }}>Net Realization & Tax Breakdown</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Gross Turnover:</span>
                  <span style={{ fontWeight: 600 }}>{formatRs(sellResult.sellValue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Broker Commission:</span>
                  <span style={{ color: 'var(--bear)' }}>-{formatRs(sellResult.commission)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SEBON Fee (0.015%):</span>
                  <span style={{ color: 'var(--bear)' }}>-{formatRs(sellResult.sebonFee)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>DP Fee:</span>
                  <span style={{ color: 'var(--bear)' }}>-{formatRs(sellResult.dpFee)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Capital Gains Tax (CGT):</span>
                  <span style={{ color: 'var(--bear)', fontWeight: 700 }}>-{formatRs(sellResult.cgt)}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>Net Receivable Amount:</span>
                  <span style={{ fontWeight: 900, fontSize: 17, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{formatRs(sellResult.netReceivable)}</span>
                </div>

                <div className="card-sm" style={{
                  background: sellResult.netProfitLoss >= 0 ? 'var(--bull-subtle)' : 'var(--bear-subtle)',
                  border: `1px solid ${sellResult.netProfitLoss >= 0 ? 'rgba(16,217,138,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  padding: 12, borderRadius: 10, marginTop: 4
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: sellResult.netProfitLoss >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      Net {sellResult.netProfitLoss >= 0 ? 'Profit' : 'Loss'}:
                    </span>
                    <span style={{ fontWeight: 900, fontSize: 16, color: sellResult.netProfitLoss >= 0 ? 'var(--bull)' : 'var(--bear)', fontFamily: 'var(--font-mono)' }}>
                      {sellResult.netProfitLoss >= 0 ? '+' : ''}{formatRs(sellResult.netProfitLoss)} ({sellResult.netProfitLoss >= 0 ? '+' : ''}{sellResult.profitPercentage.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: BREAK-EVEN CALCULATOR ── */}
      {activeTab === 'breakeven' && (
        <div>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Break-Even Specifications</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="input-label">Quantity</label>
                <input
                  type="number"
                  value={sellQty}
                  onChange={(e) => setSellQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="input"
                />
              </div>
              <div>
                <label className="input-label">Purchase WACC (Rs.)</label>
                <input
                  type="number"
                  value={buyWacc}
                  onChange={(e) => setBuyWacc(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="input-label">Holding Type</label>
              <select
                value={holdingType}
                onChange={(e) => setHoldingType(e.target.value)}
                className="select-input"
              >
                <option value="short">Individual Short Term (10.0% CGT — Final Tax)</option>
                <option value="long">Individual Long Term (7.5% CGT — Final Tax)</option>
              </select>
            </div>
          </div>

          {breakEvenResult && (
            <div className="card">
              <div className="card-sm" style={{
                background: 'rgba(16,217,138,0.12)',
                border: '1px solid rgba(16,217,138,0.3)',
                padding: 16, borderRadius: 12, textAlign: 'center', marginBottom: 14
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bull)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Target Selling Rate to Break Even
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--bull)', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
                  {formatRs(breakEvenResult.price)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Covers buy/sell broker commission, SEBON fees, DP charge & CGT
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: BONUS & RIGHT SHARE ADJUSTMENT CALCULATOR ── */}
      {activeTab === 'adjustment' && (
        <div>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 14 }}>
              🎁 Ex-Book Closure Price Adjustment
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Market Price before Book Closure (LTP in Rs.)</label>
              <input
                type="number"
                value={adjLtp}
                onChange={(e) => setAdjLtp(parseFloat(e.target.value) || 0)}
                className="input"
                placeholder="e.g. 450"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="input-label">Bonus Share (%)</label>
                <input
                  type="number"
                  value={bonusPct}
                  onChange={(e) => setBonusPct(parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="e.g. 10"
                />
              </div>
              <div>
                <label className="input-label">Right Share (%)</label>
                <input
                  type="number"
                  value={rightPct}
                  onChange={(e) => setRightPct(parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="e.g. 50 (1:0.5)"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="input-label">Right Issue Price (Rs.)</label>
                <input
                  type="number"
                  value={rightIssuePrice}
                  onChange={(e) => setRightIssuePrice(parseFloat(e.target.value) || 100)}
                  className="input"
                  placeholder="100"
                />
              </div>
              <div>
                <label className="input-label">Your Current Shares</label>
                <input
                  type="number"
                  value={userShares}
                  onChange={(e) => setUserShares(parseInt(e.target.value) || 0)}
                  className="input"
                  placeholder="100"
                />
              </div>
            </div>

            {/* Quick Bonus Presets */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                { label: '5% Bonus', b: 5, r: 0 },
                { label: '10% Bonus', b: 10, r: 0 },
                { label: '20% Bonus', b: 20, r: 0 },
                { label: '1:1 Right (100%)', b: 0, r: 100 },
                { label: '10% B + 50% R', b: 10, r: 50 }
              ].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setBonusPct(p.b); setRightPct(p.r); }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '4px 8px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {adjustmentResult && (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 14 }}>Post-Adjustment Results</h3>

              <div className="card-sm" style={{
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(99, 102, 241, 0.08))',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: 16, borderRadius: 12, textAlign: 'center', marginBottom: 14
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Theoretical Ex-Date Opening Price
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#38bdf8', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
                  Rs. {adjustmentResult.adjustedPrice.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Expected base opening rate on NEPSE after book closure
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Bonus Shares Allotted:</span>
                  <span style={{ fontWeight: 800, color: 'var(--bull)' }}>+{adjustmentResult.bonusUnits} Units</span>
                </div>
                {adjustmentResult.rightUnits > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Right Shares Eligible:</span>
                    <span style={{ fontWeight: 800, color: '#38bdf8' }}>+{adjustmentResult.rightUnits} Units (Cost: {formatRs(adjustmentResult.rightCost)})</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total New Share Count:</span>
                  <span style={{ fontWeight: 900, color: '#ffffff' }}>{adjustmentResult.totalNewUnits} Units</span>
                </div>
                {adjustmentResult.bonusTax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Bonus Share Tax (5% on par):</span>
                    <span style={{ color: 'var(--bear)', fontWeight: 700 }}>{formatRs(adjustmentResult.bonusTax)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Portfolio Value:</span>
                  <span style={{ fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{formatRs(adjustmentResult.postValue)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 5: SIP & COMPOUND WEALTH CALCULATOR ── */}
      {activeTab === 'sip' && (
        <div>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 14 }}>
              📈 SIP & Compound Growth Projection
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Monthly Investment (Rs.)</label>
              <input
                type="number"
                value={sipMonthly}
                onChange={(e) => setSipMonthly(parseFloat(e.target.value) || 0)}
                className="input"
                placeholder="e.g. 10000"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="input-label">Expected Annual Return (%)</label>
                <input
                  type="number"
                  value={sipReturnRate}
                  onChange={(e) => setSipReturnRate(parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="e.g. 15"
                />
              </div>
              <div>
                <label className="input-label">Duration (Years)</label>
                <input
                  type="number"
                  value={sipYears}
                  onChange={(e) => setSipYears(parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="e.g. 10"
                />
              </div>
            </div>
          </div>

          {sipResult && (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 14 }}>Projected Wealth Creation</h3>

              <div className="card-sm" style={{
                background: 'linear-gradient(135deg, rgba(16, 217, 138, 0.12), rgba(6, 182, 212, 0.08))',
                border: '1px solid rgba(16, 217, 138, 0.3)',
                padding: 16, borderRadius: 12, textAlign: 'center', marginBottom: 14
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bull)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Expected Maturity Wealth ({sipYears} Years)
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--bull)', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
                  {formatRs(sipResult.maturity)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Compounded over {sipResult.months} monthly investments
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Amount Invested:</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{formatRs(sipResult.totalInvested)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Estimated Wealth Gain:</span>
                  <span style={{ fontWeight: 900, color: 'var(--bull)' }}>+{formatRs(sipResult.estReturns)}</span>
                </div>

                {/* Visual Ratio Bar */}
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(sipResult.totalInvested / sipResult.maturity) * 100}%`, background: '#6366f1' }} title="Invested" />
                    <div style={{ width: `${(sipResult.estReturns / sipResult.maturity) * 100}%`, background: 'var(--bull)' }} title="Growth" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span style={{ color: '#818cf8' }}>● Invested: {((sipResult.totalInvested / sipResult.maturity) * 100).toFixed(0)}%</span>
                    <span style={{ color: 'var(--bull)' }}>● Gains: {((sipResult.estReturns / sipResult.maturity) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6: NRB MARGIN LENDING & MARGIN CALL ENGINE ── */}
      {activeTab === 'margin_loan' && (
        <div>
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 6 }}>NRB Share Collateral Loan Parameters</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Statutory central bank rules: Max 70% LTV against lower of LTP and 180-day average. Single-obligor limit capped at Rs. 15 Cr (Individual) / Rs. 20 Cr (Institutional).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="input-label">Share Quantity (Units)</label>
                <input
                  type="number"
                  value={marginUnits}
                  onChange={(e) => setMarginUnits(Math.max(0, parseInt(e.target.value) || 0))}
                  className="input"
                  placeholder="e.g. 1000"
                />
              </div>

              <div>
                <label className="input-label">Borrower Category</label>
                <select
                  value={borrowerType}
                  onChange={(e) => setBorrowerType(e.target.value)}
                  className="input"
                  style={{ background: 'var(--bg-input)' }}
                >
                  <option value="individual">Individual (Cap Rs. 15 Cr)</option>
                  <option value="institutional">Institutional (Cap Rs. 20 Cr)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="input-label">Current Market Price (LTP Rs.)</label>
                <input
                  type="number"
                  value={marginLtp}
                  onChange={(e) => setMarginLtp(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                  placeholder="e.g. 600"
                />
              </div>

              <div>
                <label className="input-label">180-Day VWAP / Avg (Rs.)</label>
                <input
                  type="number"
                  value={marginAvg180}
                  onChange={(e) => setMarginAvg180(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                  placeholder="e.g. 550"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div>
                <label className="input-label">LTV Ratio (%)</label>
                <input
                  type="number"
                  max="70"
                  value={marginLtv}
                  onChange={(e) => setMarginLtv(Math.min(70, Math.max(10, parseFloat(e.target.value) || 0)))}
                  className="input"
                  placeholder="Max 70"
                />
              </div>

              <div>
                <label className="input-label">Interest (% p.a.)</label>
                <input
                  type="number"
                  step="0.1"
                  value={marginRate}
                  onChange={(e) => setMarginRate(parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="9.5"
                />
              </div>

              <div>
                <label className="input-label">Maint. Margin (%)</label>
                <input
                  type="number"
                  value={marginMaintenance}
                  onChange={(e) => setMarginMaintenance(parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="130"
                />
              </div>
            </div>
          </div>

          {marginLoanResult && (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 14 }}>Loan Approval &amp; Risk Metrics</h3>

              <div className="card-sm" style={{
                background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(16, 185, 129, 0.1))',
                border: '1px solid rgba(79, 70, 229, 0.4)',
                padding: 16, borderRadius: 12, textAlign: 'center', marginBottom: 14
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Eligible Approved Margin Loan
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#38bdf8', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>
                  {formatRs(marginLoanResult.approvedLoan)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Valuation base: Rs. {marginLoanResult.valuationPrice.toFixed(2)} &times; {marginLoanResult.effectiveLtv}% LTV
                </div>
                {marginLoanResult.isCapped && (
                  <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '4px 8px', borderRadius: 6 }}>
                    ⚠️ Capped at NRB Ceiling of Rs. {(marginLoanResult.ceiling / 10000000).toFixed(0)} Crores
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Collateral Market Valuation:</span>
                  <span style={{ fontWeight: 700 }}>{formatRs(marginLoanResult.currentMarketValuation)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Margin Call Trigger Price:</span>
                  <span style={{ fontWeight: 800, color: marginLoanResult.cushion > 20 ? 'var(--bull)' : 'var(--bear)' }}>
                    Rs. {marginLoanResult.callPrice.toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Safety Drop Buffer:</span>
                  <span style={{ fontWeight: 800, color: marginLoanResult.cushion > 20 ? 'var(--bull)' : '#f59e0b' }}>
                    {marginLoanResult.cushion.toFixed(1)}% price decline cushion
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Estimated Monthly Interest:</span>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>{formatRs(marginLoanResult.monthlyInterest)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Estimated Annual Interest:</span>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>{formatRs(marginLoanResult.annualInterest)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
