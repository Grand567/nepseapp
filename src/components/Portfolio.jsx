import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Briefcase, PlusCircle, MinusCircle, ShieldCheck, Layers, BookOpen, Sparkles, X, Loader2 } from 'lucide-react';
import { calculateBuyDetails, calculateSellDetails } from '../utils/calculations';

/**
 * Safe markdown renderer — only handles **bold** and newlines.
 * Avoids dangerouslySetInnerHTML to prevent XSS from AI output.
 */
function SafeMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      {lines.map((line, li) => {
        // Split on **bold** markers
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <React.Fragment key={li}>
            {parts.map((part, pi) =>
              pi % 2 === 1
                ? <strong key={pi} style={{ color: 'var(--text-primary)' }}>{part}</strong>
                : <span key={pi}>{part}</span>
            )}
            {li < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function Portfolio({ marketStocks, userId = 'local' }) {

  const [transactions, setTransactions] = useState([]);
  const [meroshareProfiles, setMeroshareProfiles] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeView, setActiveView] = useState('consolidated'); // 'consolidated', 'meroshare', 'manual'
  
  // Form fields
  const [type, setType] = useState('buy'); // 'buy' or 'sell'
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [price, setPrice] = useState(100);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // AI Analyst state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [selectedAiStock, setSelectedAiStock] = useState(null);

  // User-scoped localStorage keys
  const txKey      = `nepse_hub_${userId}_transactions`;
  const profileKey = `nepse_hub_${userId}_profiles`;

  // Load transactions and meroshare profiles from localStorage (scoped to user)
  useEffect(() => {
    const savedTxs = localStorage.getItem(txKey);
    if (savedTxs) {
      try { setTransactions(JSON.parse(savedTxs)); }
      catch (e) { setTransactions([]); }
    } else {
      setTransactions([]);
    }

    const savedProfiles = localStorage.getItem(profileKey);
    if (savedProfiles) {
      try { setMeroshareProfiles(JSON.parse(savedProfiles)); }
      catch (e) { setMeroshareProfiles([]); }
    } else {
      setMeroshareProfiles([]);
    }
  }, [userId]);  // Re-load whenever the logged-in user changes

  // Ensure default symbol is set
  useEffect(() => {
    if (marketStocks.length > 0 && !symbol) {
      setSymbol(marketStocks[0].symbol);
    }
  }, [marketStocks, symbol]);

  const saveTransactions = (newTxs) => {
    setTransactions(newTxs);
    localStorage.setItem(txKey, JSON.stringify(newTxs));
  };

  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (quantity <= 0 || price <= 0) {
      alert("Quantity and Price must be positive numbers.");
      return;
    }

    const newTx = {
      id: Date.now().toString(),
      type,
      symbol: symbol.trim().toUpperCase(),
      quantity,
      price,
      date
    };

    const updated = [newTx, ...transactions];
    saveTransactions(updated);

    // Reset fields
    setQuantity(10);
    setPrice(100);
    setShowAddForm(false);
  };

  const handleDeleteTransaction = (id) => {
    if (window.confirm("Are you sure you want to delete this transaction record?")) {
      const updated = transactions.filter(t => t.id !== id);
      saveTransactions(updated);
    }
  };

  const handleClearAllTransactions = () => {
    if (window.confirm("CRITICAL WARNING: This will permanently delete ALL logged transaction records. This cannot be undone. Are you sure you want to proceed?")) {
      saveTransactions([]);
    }
  };

  const handleAnalyzePortfolio = async () => {
    // Calculate holdings up-to-date
    if (holdings.length === 0) {
      alert("Your portfolio is empty! Add some transactions or sync MeroShare first.");
      return;
    }

    setSelectedAiStock(null);
    setAiLoading(true);
    setAiResult('');
    
    // Construct Prompt
    let prompt = "You are a professional Nepalese stock market technical analyst. Analyze my current stock portfolio and give a concise Buy, Sell, or Hold recommendation for each stock based on my WACC vs LTP. Give a short 1-sentence reasoning for each. Here is my portfolio:\\n\\n";
    holdings.forEach(h => {
      prompt += `- ${h.symbol}: ${h.units} units @ WACC Rs. ${h.wacc.toFixed(2)}, Current LTP: Rs. ${h.currentPrice}, P/L: ${h.plPercent.toFixed(2)}%\\n`;
    });
    prompt += "\\nFormat your response cleanly with markdown. Use bullet points.";

    try {
      const res = await fetch(`https://text.pollinations.ai/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are an expert Nepalese Stock Market (NEPSE) analyst.' },
            { role: 'user', content: prompt }
          ]
        })
      });
      const text = await res.text();
      setAiResult(text);
    } catch (err) {
      setAiResult("Failed to connect to free AI server. Check your network connection.");
    }
    setAiLoading(false);
  };

  const handleAnalyzeSingleStock = async (holding) => {
    const mStock = marketStocks.find(s => s.symbol === holding.symbol);
    if (!mStock) {
       alert(`Live data for ${holding.symbol} is currently unavailable.`);
       return;
    }
    
    setSelectedAiStock(holding);
    setAiLoading(true);
    setAiResult('');
    setShowAiModal(true);
    
    const prompt = `Act as an expert stock market analyst. I need a comprehensive fundamental and technical analysis of the Nepalese stock: ${mStock.name || mStock.symbol} (${mStock.symbol}). 
My Portfolio Context:
- I currently hold ${holding.units} units.
- My average buy price (WACC) is Rs. ${holding.wacc.toFixed(2)}.
- My current P/L is ${holding.plPercent.toFixed(2)}%.

Current Market Data:
- Sector: ${mStock.sector}
- Last Traded Price (LTP): Rs. ${mStock.ltp}
- Change: ${mStock.pChange}%
- 52W High/Low: Rs. ${mStock.high52w} / Rs. ${mStock.low52w}
- EPS: ${mStock.eps}
- P/E Ratio: ${mStock.pe}
- Book Value: Rs. ${mStock.bookValue}
- P/B Ratio: ${mStock.pb}
- RSI: ${mStock.rsi}
- MACD Line: ${mStock.macd?.line}, Signal: ${mStock.macd?.signal}
- 20 EMA: ${mStock.ema20}, 50 EMA: ${mStock.ema50}, 200 EMA: ${mStock.ema200}

Please provide a concise analysis covering:
1. Fundamental Health (valuation, earnings)
2. One Day Technical Analysis (daily momentum, overall trend, moving averages)
3. Hourly / Intraday Analysis (short-term price action, intraday volatility, and support/resistance based on current momentum)
4. Verdict: Should I Buy more, Sell my holdings, or Hold my position? Consider my WACC (Rs. ${holding.wacc.toFixed(2)}) and current P/L. Why?
Format with markdown using headers and bullet points. Do not include raw HTML.`;

    try {
      const response = await fetch(`https://text.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
      if (!response.ok) throw new Error('Failed to fetch AI analysis');
      const text = await response.text();
      setAiResult(text);
    } catch (err) {
      setAiResult("Failed to connect to free AI server. Check your network connection.");
    }
    setAiLoading(false);
  };

  // --- Core Calculations ---
  
  const getManualHoldingsRaw = () => {
    const holdingsMap = {};
    const chronologicalTxs = [...transactions].reverse();

    chronologicalTxs.forEach(tx => {
      const sym = tx.symbol.trim().toUpperCase();
      if (!holdingsMap[sym]) {
        holdingsMap[sym] = { symbol: sym, units: 0, totalInvestedCost: 0, wacc: 0 };
      }
      const holding = holdingsMap[sym];

      if (tx.type === 'buy') {
        const details = calculateBuyDetails(tx.quantity, tx.price);
        holding.units += tx.quantity;
        holding.totalInvestedCost += details.totalAmount;
        holding.wacc = holding.units > 0 ? holding.totalInvestedCost / holding.units : 0;
      } else {
        const previousUnits = holding.units;
        holding.units = Math.max(0, holding.units - tx.quantity);
        if (previousUnits > 0) {
          holding.totalInvestedCost = holding.units * holding.wacc;
        } else {
          holding.totalInvestedCost = 0;
        }
      }
    });

    return Object.values(holdingsMap).filter(h => h.units > 0);
  };

  const getMeroshareHoldingsRaw = () => {
    const holdingsMap = {};
    meroshareProfiles.forEach(p => {
      (p.holdings || []).forEach(h => {
        const sym = (h.symbol || '').trim().toUpperCase();
        if (!holdingsMap[sym]) {
          holdingsMap[sym] = { symbol: sym, units: 0, totalInvestedCost: 0, wacc: 0 };
        }
        holdingsMap[sym].units += h.units;
        holdingsMap[sym].totalInvestedCost += (h.units * h.wacc);
      });
    });

    return Object.values(holdingsMap).map(h => {
      h.wacc = h.units > 0 ? h.totalInvestedCost / h.units : 0;
      return h;
    }).filter(h => h.units > 0);
  };

  const getConsolidatedHoldingsRaw = (manual, meroshare) => {
    const map = {};
    [...manual, ...meroshare].forEach(h => {
      if (!map[h.symbol]) {
        map[h.symbol] = { symbol: h.symbol, units: 0, totalInvestedCost: 0, wacc: 0 };
      }
      map[h.symbol].units += h.units;
      map[h.symbol].totalInvestedCost += h.totalInvestedCost;
    });
    return Object.values(map).map(h => {
      h.wacc = h.units > 0 ? h.totalInvestedCost / h.units : 0;
      return h;
    }).filter(h => h.units > 0);
  };

  const manualRaw = getManualHoldingsRaw();
  const meroshareRaw = getMeroshareHoldingsRaw();
  
  let activeRaw = [];
  if (activeView === 'manual') activeRaw = manualRaw;
  else if (activeView === 'meroshare') activeRaw = meroshareRaw;
  else activeRaw = getConsolidatedHoldingsRaw(manualRaw, meroshareRaw);

  const holdings = activeRaw.map(h => {
    const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === h.symbol) || { ltp: h.wacc, change: 0, pChange: 0 };
    const currentValue = h.units * marketStock.ltp;
    const profitLoss = currentValue - h.totalInvestedCost;
    const plPercent = h.totalInvestedCost > 0 ? (profitLoss / h.totalInvestedCost) * 100 : 0;

    return {
      ...h,
      currentPrice: marketStock.ltp,
      currentValue,
      profitLoss,
      plPercent,
      stockChange: marketStock.change,
      stockPchange: marketStock.pChange
    };
  });

  // Aggregate Portfolio totals
  const totalCost = holdings.reduce((sum, h) => sum + h.totalInvestedCost, 0);
  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  // Prepare allocation chart data
  const sortedHoldings = [...holdings].sort((a, b) => b.currentValue - a.currentValue);
  const chartHoldings = [];
  let otherSum = 0;
  sortedHoldings.forEach((h, idx) => {
    if (idx < 5) {
      chartHoldings.push({ symbol: h.symbol, value: h.currentValue });
    } else {
      otherSum += h.currentValue;
    }
  });
  if (otherSum > 0) {
    chartHoldings.push({ symbol: 'Others', value: otherSum });
  }

  const formatRs = (value) => {
    return new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value).replace('NPR', 'Rs.');
  };

  return (
    <div style={{ padding: 16 }}>
      
      {/* Portfolio source view toggles */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button 
          onClick={() => setActiveView('consolidated')}
          className={`tab-btn ${activeView === 'consolidated' ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
        >
          <Layers style={{ width: 14, height: 14 }} /> Consolidated
        </button>
        <button 
          onClick={() => setActiveView('meroshare')}
          className={`tab-btn ${activeView === 'meroshare' ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
        >
          <ShieldCheck style={{ width: 14, height: 14 }} /> MeroShare
        </button>
        <button 
          onClick={() => setActiveView('manual')}
          className={`tab-btn ${activeView === 'manual' ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
        >
          <BookOpen style={{ width: 14, height: 14 }} /> Manual Ledger
        </button>
      </div>

      {/* Portfolio overview card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
            <Briefcase style={{ width: 16, height: 16 }} /> {activeView === 'consolidated' ? 'Total Net Worth' : activeView === 'meroshare' ? 'MeroShare Net Worth' : 'Ledger Net Worth'}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setShowAiModal(true)}
              className="btn-secondary btn-xs"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'linear-gradient(90deg, rgba(91,94,244,0.1) 0%, rgba(168,85,247,0.1) 100%)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
            >
              <Sparkles style={{ width: 14, height: 14 }} /> AI Analyst
            </button>
            {activeView !== 'meroshare' && (
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="btn-primary btn-xs"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus style={{ width: 14, height: 14 }} /> Add Transaction
              </button>
            )}
          </div>
        </div>

        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {formatRs(totalValue)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Invested Capital</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>{formatRs(totalCost)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Total Profit / Loss</div>
            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, color: totalPL >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
              {totalPL >= 0 ? <ArrowUpRight style={{ width: 14, height: 14 }} /> : <ArrowDownRight style={{ width: 14, height: 14 }} />}
              {totalPL >= 0 ? '+' : ''}{totalPLPercent.toFixed(2)}% ({formatRs(Math.abs(totalPL))})
            </div>
          </div>
        </div>
      </div>

      {/* Allocation breakdown chart */}
      {holdings.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Portfolio Allocation</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '4px 8px' }}>
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="45" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                {(() => {
                  let cumulativeOffset = 0;
                  const radius = 45;
                  const circumference = 2 * Math.PI * radius; // ~282.74
                  const colors = ['#5b5ef4', '#06b6d4', '#a855f7', '#f59e0b', '#10d98a', '#8b92a8'];
                  
                  return chartHoldings.map((ch, idx) => {
                    const pct = ch.value / (totalValue || 1);
                    const strokeLength = pct * circumference;
                    const offset = cumulativeOffset;
                    cumulativeOffset += strokeLength;
                    return (
                      <circle
                        key={ch.symbol}
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="transparent"
                        stroke={colors[idx % colors.length]}
                        strokeWidth="12"
                        strokeDasharray={`${strokeLength} ${circumference}`}
                        strokeDashoffset={-offset}
                        transform="rotate(-90 60 60)"
                        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                      />
                    );
                  });
                })()}
              </svg>
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Assets</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{holdings.length}</span>
              </div>
            </div>

            {/* Side Legend */}
            {(() => {
              const colors = ['#5b5ef4', '#06b6d4', '#a855f7', '#f59e0b', '#10d98a', '#8b92a8'];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  {chartHoldings.map((ch, idx) => {
                    const pct = (ch.value / (totalValue || 1)) * 100;
                    return (
                      <div key={ch.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[idx % colors.length], display: 'inline-block' }}></span>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ch.symbol}</span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Transaction input form */}
      {showAddForm && activeView !== 'meroshare' && (
        <form onSubmit={handleAddTransaction} className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Log Buy/Sell Transaction</h3>

          <div className="tab-bar" style={{ marginBottom: 12 }}>
            <button 
              type="button" 
              onClick={() => setType('buy')}
              className={`tab-btn ${type === 'buy' ? 'active' : ''}`}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: type === 'buy' ? 'var(--primary)' : '' }}
            >
              <PlusCircle style={{ width: 14, height: 14 }} /> BUY
            </button>
            <button 
              type="button" 
              onClick={() => setType('sell')}
              className={`tab-btn ${type === 'sell' ? 'active' : ''}`}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: type === 'sell' ? 'var(--bear)' : '', boxShadow: type === 'sell' ? '0 2px 12px var(--bear-glow)' : '' }}
            >
              <MinusCircle style={{ width: 14, height: 14 }} /> SELL
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <label className="input-label">Stock Symbol</label>
              <input 
                list="portfolio-stocks-list"
                value={symbol} 
                onChange={e => setSymbol(e.target.value)} 
                className="input"
                placeholder="Search symbol or name..."
              />
              <datalist id="portfolio-stocks-list">
                {marketStocks.map(s => (
                  <option key={s.symbol} value={s.symbol}>{s.name !== s.symbol ? `${s.name} (${s.symbol})` : s.symbol}</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="input-label">Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="input" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div>
              <label className="input-label">Quantity</label>
              <input type="number" required value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="input" />
            </div>
            <div>
              <label className="input-label">Price per Share (Rs.)</label>
              <input type="number" step="0.01" required value={price} onChange={e => setPrice(Math.max(0.1, parseFloat(e.target.value) || 0))} className="input" />
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px 0' }}>Add to Ledger</button>
        </form>
      )}

      {/* Holdings List */}
      {holdings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ marginBottom: 8 }}>Active Holdings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
            {holdings.map(h => {
              const isProfit = h.profitLoss >= 0;
              return (
                <div key={h.symbol} className="card" style={{ 
                  padding: '10px 12px', 
                  marginBottom: 0,
                  background: isProfit ? 'var(--bull-subtle)' : 'var(--bear-subtle)',
                  borderColor: isProfit ? 'rgba(16,217,138,0.18)' : 'rgba(245,69,92,0.18)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{h.symbol}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h.units} Units • WACC: {formatRs(h.wacc)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatRs(h.currentValue)}</div>
                      <div style={{ fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, color: isProfit ? 'var(--bull)' : 'var(--bear)' }}>
                        {isProfit ? '+' : ''}{h.plPercent.toFixed(1)}% ({formatRs(h.profitLoss)})
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleAnalyzeSingleStock(h); }}
                        className="btn-secondary btn-xs"
                        style={{ marginTop: 8, fontSize: 9, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
                      >
                        <Sparkles style={{ width: 10, height: 10 }} /> Analyze
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ledger list (Only show if in Manual or Consolidated view) */}
      {(activeView === 'manual' || activeView === 'consolidated') && (
        transactions.length > 0 ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 className="section-title" style={{ marginBottom: 0 }}>Transaction Log Ledger</h3>
              <button
                type="button"
                onClick={handleClearAllTransactions}
                className="btn btn-bear btn-xs"
                style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, height: 'auto', background: 'linear-gradient(135deg, #be123c, var(--bear))' }}
              >
                <Trash2 style={{ width: 11, height: 11 }} /> Clear All
              </button>
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
              {transactions.map((tx, i) => (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i === transactions.length - 1 ? 'none' : '1px solid var(--border)', paddingTop: i === 0 ? 0 : 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`badge ${tx.type === 'buy' ? 'badge-bull' : 'badge-bear'}`} style={{ marginRight: 10 }}>
                      {tx.type.toUpperCase()}
                    </span>
                    <div>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: 13 }}>{tx.symbol}</span>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{tx.quantity} units @ {formatRs(tx.price)} • {tx.date}</div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteTransaction(tx.id)} className="icon-btn" style={{ width: 28, height: 28 }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          holdings.length === 0 && !showAddForm && (
            <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
              <Briefcase style={{ width: 32, height: 32, color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Your manual transaction ledger is empty.</p>
              <button onClick={() => setShowAddForm(true)} className="btn-secondary btn-sm">Add First Trade</button>
            </div>
          )
        )
      )}

      {/* Empty State for MeroShare */}
      {activeView === 'meroshare' && meroshareProfiles.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
          <ShieldCheck style={{ width: 32, height: 32, color: 'var(--text-muted)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>No MeroShare accounts linked.</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Go to the MeroShare tab to link an account and sync your portfolio.</p>
        </div>
      )}

      {/* AI Analyst Modal */}
      {showAiModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5,5,15,0.8)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, margin: 0, position: 'relative', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setShowAiModal(false)} className="icon-btn" style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
              <X style={{ width: 18, height: 18 }} />
            </button>
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, color: '#d8b4fe' }}>
              <Sparkles style={{ width: 16, height: 16 }} /> {selectedAiStock ? `Free AI Stock Analyst (${selectedAiStock.symbol})` : 'Free AI Portfolio Analyst'}
            </h3>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Get completely free instant AI analysis for your {selectedAiStock ? 'stock' : 'portfolio'} using open models. No API token required.
              </p>
              
              <button 
                onClick={selectedAiStock ? () => handleAnalyzeSingleStock(selectedAiStock) : handleAnalyzePortfolio}
                disabled={aiLoading}
                className="btn-primary" 
                style={{ width: '100%', padding: '10px 0', marginBottom: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg, var(--primary) 0%, #a855f7 100%)', border: 'none', opacity: aiLoading ? 0.7 : 1 }}
              >
                {aiLoading ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Sparkles style={{ width: 16, height: 16 }} />}
                {aiLoading ? 'Analyzing...' : 'Run Technical Analysis'}
              </button>

              {aiResult && (
                <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <SafeMarkdown text={aiResult} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
