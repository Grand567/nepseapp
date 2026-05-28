import React, { useState, useEffect } from 'react';
import { calculateBuyDetails, calculateSellDetails } from '../utils/calculations';
import { HelpCircle, Copy, Check } from 'lucide-react';

export default function Calculator() {
  const [activeTab, setActiveTab] = useState('buy');
  const [copiedBuyWacc, setCopiedBuyWacc] = useState(false);
  
  // Buy state
  const [buyQty, setBuyQty] = useState(100);
  const [buyPrice, setBuyPrice] = useState(250);
  const [buyResult, setBuyResult] = useState(null);

  // Sell state
  const [sellQty, setSellQty] = useState(100);
  const [sellPrice, setSellPrice] = useState(300);
  const [buyWacc, setBuyWacc] = useState(250);
  const [holdingType, setHoldingType] = useState('short'); // 'short' (7.5%), 'long' (5%), 'institutional' (10%)
  const [sellResult, setSellResult] = useState(null);

  // Update calculations
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

  const getBreakEvenDetails = () => {
    if (sellQty <= 0 || buyWacc <= 0) return null;
    
    const totalBuyingCost = sellQty * buyWacc;
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
  };

  const breakEvenResult = getBreakEvenDetails();

  return (
    <div style={{ padding: 16 }}>
      {/* Tab Select */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab('buy')}
          style={{
            flex: 1, padding: '12px 0', textAlign: 'center', fontWeight: 'bold', fontSize: 13, 
            border: 'none', borderBottom: `2px solid ${activeTab === 'buy' ? 'var(--primary)' : 'transparent'}`,
            background: 'transparent', cursor: 'pointer', transition: 'var(--transition)',
            color: activeTab === 'buy' ? 'var(--primary-light)' : 'var(--text-muted)'
          }}
        >
          Buy Share
        </button>
        <button
          onClick={() => setActiveTab('sell')}
          style={{
            flex: 1, padding: '12px 0', textAlign: 'center', fontWeight: 'bold', fontSize: 13, 
            border: 'none', borderBottom: `2px solid ${activeTab === 'sell' ? 'var(--primary)' : 'transparent'}`,
            background: 'transparent', cursor: 'pointer', transition: 'var(--transition)',
            color: activeTab === 'sell' ? 'var(--primary-light)' : 'var(--text-muted)'
          }}
        >
          Sell Share
        </button>
        <button
          onClick={() => setActiveTab('breakeven')}
          style={{
            flex: 1, padding: '12px 0', textAlign: 'center', fontWeight: 'bold', fontSize: 13, 
            border: 'none', borderBottom: `2px solid ${activeTab === 'breakeven' ? 'var(--primary)' : 'transparent'}`,
            background: 'transparent', cursor: 'pointer', transition: 'var(--transition)',
            color: activeTab === 'breakeven' ? 'var(--primary-light)' : 'var(--text-muted)'
          }}
        >
          Break-Even
        </button>
      </div>

      {activeTab === 'buy' ? (
        <div>
          {/* Buy Calculator inputs */}
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Input Specifications</h3>
            
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

          {/* Buy Calculations results */}
          {buyResult ? (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 16 }}>Cost Breakdown</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Share Value:</span>
                  <span style={{ fontWeight: 600 }}>{formatRs(buyResult.shareValue)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }} title="Tiered charges: Up to 50k: 0.40%, Up to 5L: 0.37%, Up to 20L: 0.34%, Up to 1C: 0.30%, Above: 0.27% (Min Rs. 10)">
                    Broker Commission 
                    <HelpCircle style={{ width: 14, height: 14, cursor: 'help' }} />
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>+{formatRs(buyResult.commission)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SEBON Regulation Fee (0.015%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>+{formatRs(buyResult.sebonFee)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>DP Charge:</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>+{formatRs(buyResult.dpFee)}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 16 }}>Total Amount Payable:</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary-light)' }}>{formatRs(buyResult.totalAmount)}</span>
                </div>

                <div className="card-sm" style={{ background: 'var(--primary-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, marginBottom: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-light)' }}>Effective Buying Price (WACC):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 14, color: 'var(--primary-light)' }}>{formatRs(buyResult.costPerShare)} / share</span>
                    <button 
                      type="button" 
                      onClick={handleCopyBuyWacc} 
                      className="icon-btn" 
                      style={{ width: 26, height: 26, borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                      title="Copy WACC value"
                    >
                      {copiedBuyWacc ? <Check style={{ width: 12, height: 12, color: 'var(--bull)' }} /> : <Copy style={{ width: 12, height: 12 }} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              Enter quantity and price to view calculation breakdown.
            </div>
          )}
        </div>
      ) : activeTab === 'sell' ? (
        <div>
          {/* Sell Calculator inputs */}
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Input Specifications</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label className="input-label">Quantity</label>
                <input
                  type="number"
                  value={sellQty}
                  onChange={(e) => setSellQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="input"
                  placeholder="Quantity"
                />
              </div>
              <div>
                <label className="input-label">Buy WACC (Rs.)</label>
                <input
                  type="number"
                  value={buyWacc}
                  onChange={(e) => setBuyWacc(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                  placeholder="Acquisition WACC"
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Selling Price (Rs.)</label>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="input"
                placeholder="Enter selling price"
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="input-label">Investor & Holding Type</label>
              <select
                value={holdingType}
                onChange={(e) => setHoldingType(e.target.value)}
                className="select-input"
              >
                <option value="short">{"Individual Short Term (<= 365 days, 7.5% CGT)"}</option>
                <option value="long">{"Individual Long Term (> 365 days, 5.0% CGT)"}</option>
                <option value="institutional">Institutional Investor (10.0% CGT)</option>
              </select>
            </div>
          </div>

          {/* Sell Calculations results */}
          {sellResult ? (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 16 }}>Payout Analysis</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Sales Value:</span>
                  <span style={{ fontWeight: 600 }}>{formatRs(sellResult.sellValue)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Broker Commission (Tiered):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(sellResult.commission)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SEBON Regulation Fee (0.015%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(sellResult.sebonFee)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>DP Charge:</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(sellResult.dpFee)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Capital Gains Tax (CGT @ {(sellResult.cgtRate * 100).toFixed(1)}%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(sellResult.cgt)}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 16 }}>Net Receivable Cash:</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--bull)' }}>{formatRs(sellResult.netReceivable)}</span>
                </div>

                <div className="card-sm" style={{ 
                  display: 'flex', flexDirection: 'column', gap: 4, padding: 16, marginBottom: 0,
                  background: sellResult.netProfitLoss >= 0 ? 'var(--bull-subtle)' : 'var(--bear-subtle)',
                  border: `1px solid ${sellResult.netProfitLoss >= 0 ? 'rgba(16,217,138,0.25)' : 'rgba(245,69,92,0.25)'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: sellResult.netProfitLoss >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      {sellResult.netProfitLoss >= 0 ? 'Net Return (Profit)' : 'Net Loss incurred'}:
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: sellResult.netProfitLoss >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      {sellResult.netProfitLoss >= 0 ? '+' : ''}{formatRs(sellResult.netProfitLoss)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Return on Investment (ROI):</span>
                    <span style={{ fontSize: 12, fontWeight: 'bold', color: sellResult.netProfitLoss >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      {sellResult.netProfitLoss >= 0 ? '+' : ''}{sellResult.roi.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              Enter quantity, purchase price, and selling price to view return analysis.
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Break-Even Inputs */}
          <div className="card">
            <h3 className="section-title" style={{ marginBottom: 16 }}>Input Specifications</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label className="input-label">Quantity</label>
                <input
                  type="number"
                  value={sellQty}
                  onChange={(e) => setSellQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="input"
                  placeholder="Quantity"
                />
              </div>
              <div>
                <label className="input-label">Buy WACC (Rs.)</label>
                <input
                  type="number"
                  value={buyWacc}
                  onChange={(e) => setBuyWacc(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                  placeholder="Acquisition WACC"
                />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label className="input-label">Investor & Holding Type</label>
              <select
                value={holdingType}
                onChange={(e) => setHoldingType(e.target.value)}
                className="select-input"
              >
                <option value="short">{"Individual Short Term (<= 365 days, 7.5% CGT)"}</option>
                <option value="long">{"Individual Long Term (> 365 days, 5.0% CGT)"}</option>
                <option value="institutional">Institutional Investor (10.0% CGT)</option>
              </select>
            </div>
          </div>

          {/* Break-Even Results */}
          {breakEvenResult ? (
            <div className="card">
              <h3 className="section-title" style={{ marginBottom: 16 }}>Break-Even target price</h3>
              
              <div className="card-sm" style={{ 
                background: 'var(--bull-subtle)', 
                border: '1px solid rgba(16,217,138,0.25)', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: 16, 
                marginBottom: 16,
                textAlign: 'center'
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bull)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Minimum Selling Price to Break Even:</span>
                <span style={{ fontWeight: 900, fontSize: 22, color: 'var(--bull)', margin: '6px 0 2px', fontFamily: 'var(--font-mono)' }}>{formatRs(breakEvenResult.price)}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Net profit/loss is exactly Rs. 0.00 after all costs</span>
              </div>

              <h3 className="section-title" style={{ marginBottom: 12 }}>Sales Breakdown at Break-Even Price</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Sales Value:</span>
                  <span style={{ fontWeight: 600 }}>{formatRs(breakEvenResult.sellValue)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Broker Commission (Tiered):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(breakEvenResult.commission)}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>SEBON Regulation Fee (0.015%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(breakEvenResult.sebonFee)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>DP Charge:</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(breakEvenResult.dpFee)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Capital Gains Tax (CGT):</span>
                  <span style={{ fontWeight: 600, color: 'var(--bear)' }}>-{formatRs(breakEvenResult.cgt)}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0 0', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: 15 }}>Net Receivables:</span>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatRs(breakEvenResult.netReceivable)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Original Invested Cost:</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{formatRs(sellQty * buyWacc)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              Enter quantity and acquisition WACC to calculate break-even target.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
