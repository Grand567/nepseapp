import React, { useState, useMemo } from 'react';
import {
  Search, RefreshCw, ChevronDown, X, TrendingUp, TrendingDown,
  BarChart2, BookOpen, Activity, Zap, Target, Calculator, BrainCircuit, Sparkles
} from 'lucide-react';
import {
  generateHistory, generateSparkline, SECTORS,
  calculatePivotPoints, calculateFibonacci, generateHourlyHistory
} from '../utils/mockData';
import { calculateBuyDetails, calculateSellDetails } from '../utils/calculations';
import { formatBS } from '../utils/nepaliDate';

/* ─── tiny helpers ─── */
const parseInlineMarkdown = (text) => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary); font-weight: 700;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em style="font-style: italic;">$1</em>');
};

const markdownToHtml = (markdown) => {
  if (!markdown) return '';
  let html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = html.split('\n');
  let inList = false;
  const result = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        result.push('<ul style="margin: 8px 0; padding-left: 20px; list-style-type: disc;">');
        inList = true;
      }
      const itemContent = trimmed.substring(2);
      result.push(`<li style="margin: 4px 0;">${parseInlineMarkdown(itemContent)}</li>`);
      continue;
    }
    if (inList && !trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      result.push('</ul>');
      inList = false;
    }
    if (trimmed.startsWith('### ')) {
      result.push(`<h4 style="font-size: 15px; font-weight: 700; margin-top: 16px; margin-bottom: 8px; color: var(--text-primary);">${parseInlineMarkdown(trimmed.substring(4))}</h4>`);
    } else if (trimmed.startsWith('## ')) {
      result.push(`<h3 style="font-size: 16px; font-weight: 800; margin-top: 20px; margin-bottom: 10px; color: var(--primary-light);">${parseInlineMarkdown(trimmed.substring(3))}</h3>`);
    } else if (trimmed.startsWith('# ')) {
      result.push(`<h2 style="font-size: 18px; font-weight: 900; margin-top: 24px; margin-bottom: 12px; color: var(--primary-light); border-bottom: 1px solid var(--border); padding-bottom: 4px;">${parseInlineMarkdown(trimmed.substring(2))}</h2>`);
    } else if (trimmed === '') {
      result.push('<div style="height: 8px;"></div>');
    } else {
      result.push(`<p style="margin: 8px 0;">${parseInlineMarkdown(trimmed)}</p>`);
    }
  }
  if (inList) {
    result.push('</ul>');
  }
  return result.join('\n');
};

const fmt   = n => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtM  = n => n >= 1000 ? `${(n/1000).toFixed(2)}B` : `${n.toFixed(2)}M`;
const clsBull = 'text-bull';
const clsBear = 'text-bear';

/* ─── Mini sparkline SVG ─── */
function Sparkline({ points, bull }) {
  if (!points?.length) return null;
  const mn = Math.min(...points), mx = Math.max(...points);
  const rng = mx - mn || 1;
  const W = 64, H = 26;
  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((p - mn) / rng) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline fill="none"
        stroke={bull ? 'var(--bull)' : 'var(--bear)'}
        strokeWidth="1.8" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

/* ─── Large area chart ─── */
function AreaChart({ history }) {
  if (!history?.length) return null;
  const prices = history.map(h => h.close);
  const mn = Math.min(...prices) * 0.985;
  const mx = Math.max(...prices) * 1.015;
  const rng = mx - mn || 1;
  const W = 400, H = 160;
  const pts = history.map((h, i) => ({
    x: (i / (history.length - 1)) * W,
    y: H - ((h.close - mn) / rng) * H,
    c: h.close, d: h.date
  }));
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${lineD} L${W},${H} L0,${H} Z`;
  const bull   = prices[prices.length - 1] >= prices[0];
  const stroke = bull ? 'var(--bull)' : 'var(--bear)';
  const gid    = `ag${Math.random().toString(36).slice(2)}`;

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.00" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={H*f} x2={W} y2={H*f}
            stroke="rgba(255,255,255,0.04)" strokeDasharray="4" />
        ))}
        <path d={areaD} fill={`url(#${gid})`} />
        <path d={lineD} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.length > 0 && (
          <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y}
            r="4" fill={stroke} stroke="var(--bg-elevated)" strokeWidth="2"
            style={{ filter: `drop-shadow(0 0 6px ${stroke})` }} />
        )}
      </svg>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--text-muted)', marginTop:4, paddingInline:2 }}>
        <span>{history[0].dateObj ? formatBS(history[0].dateObj, 'short') : history[0].date}</span>
        <span>{history[Math.floor(history.length/2)].dateObj ? formatBS(history[Math.floor(history.length/2)].dateObj, 'short') : history[Math.floor(history.length/2)].date}</span>
        <span>{history[history.length-1].dateObj ? formatBS(history[history.length-1].dateObj, 'short') : history[history.length-1].date}</span>
      </div>
    </div>
  );
}

/* ─── Hourly Chart ─── */
function HourlyChart({ history, pivot }) {
  if (!history?.length) return null;
  const prices = history.map(h => [h.open, h.high, h.low, h.close]).flat();
  const mn = Math.min(...prices) * 0.995;
  const mx = Math.max(...prices) * 1.005;
  const rng = mx - mn || 1;
  const W = 400, H = 140;
  
  const barW = Math.max(4, W / history.length - 6);
  
  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
        {/* Support / Resistance Bands based on pivot */}
        {pivot && (
          <>
            <rect x="0" y={H - ((pivot.R1 - mn) / rng) * H - 4} width={W} height="8" fill="rgba(245,69,92,0.08)" />
            <rect x="0" y={H - ((pivot.S1 - mn) / rng) * H - 4} width={W} height="8" fill="rgba(16,217,138,0.08)" />
          </>
        )}
        
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={H*f} x2={W} y2={H*f} stroke="rgba(255,255,255,0.04)" strokeDasharray="4" />
        ))}
        
        {/* Candlesticks */}
        {history.map((h, i) => {
          const x = (i / (history.length - 1)) * (W - barW) + barW/2;
          const isBull = h.close >= h.open;
          const color = isBull ? 'var(--bull)' : 'var(--bear)';
          
          const yOpen = H - ((h.open - mn) / rng) * H;
          const yClose = H - ((h.close - mn) / rng) * H;
          const yHigh = H - ((h.high - mn) / rng) * H;
          const yLow = H - ((h.low - mn) / rng) * H;
          
          return (
            <g key={i}>
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.5" />
              <rect x={x - barW/2} y={Math.min(yOpen, yClose)} width={barW} height={Math.max(1, Math.abs(yOpen - yClose))} fill={color} />
            </g>
          );
        })}
      </svg>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--text-muted)', marginTop:4, paddingInline:2 }}>
        <span>11:00 NPT</span>
        <span>13:00 NPT</span>
        <span>15:00 NPT</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
        Today: {formatBS(new Date(), 'long')}
      </div>
    </div>
  );
}

function HourlyAnalysisSummary({ history, stock }) {
  if (!history?.length) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const change = last.close - first.open;
  const pChange = (change / first.open) * 100;
  
  const high = Math.max(...history.map(h => h.high));
  const low = Math.min(...history.map(h => h.low));
  
  let totalVol = 0;
  let totalVolPrice = 0;
  history.forEach(h => {
    totalVol += h.volume;
    totalVolPrice += ((h.open + h.close + h.high + h.low) / 4) * h.volume;
  });
  const vwap = totalVolPrice / totalVol;
  
  const isBull = pChange >= 0;
  const color = isBull ? 'var(--bull)' : 'var(--bear)';
  const bg = isBull ? 'var(--bull-subtle)' : 'var(--bear-subtle)';
  
  return (
    <div style={{ background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginTop:10, marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-muted)' }}>
          Session Summary
        </span>
        <span style={{ fontSize:10, fontWeight:800, color, background:bg, border:`1px solid ${color}30`, padding:'3px 8px', borderRadius:6 }}>
          {isBull ? 'Bullish' : 'Bearish'} Intraday
        </span>
      </div>
      <div className="stat-grid-3">
        <div className="stat-box">
          <div className="stat-box-label">VWAP</div>
          <div className="stat-box-value" style={{fontSize:12}}>Rs.{vwap.toFixed(2)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Session Range</div>
          <div className="stat-box-value" style={{fontSize:11}}>{low.toFixed(0)} - {high.toFixed(0)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Session Chg</div>
          <div className="stat-box-value" style={{fontSize:12, color}}>{isBull ? '+' : ''}{pChange.toFixed(2)}%</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Technical Signal engine ─── */
function getTechSignal(rsi, macd, ema20, ema50, ema200) {
  let score = 0;
  if (rsi < 30) score += 3;
  else if (rsi < 40) score += 1.5;
  else if (rsi > 75) score -= 3;
  else if (rsi > 65) score -= 1.5;
  if (macd.line > macd.signal) score += 1.5; else score -= 1.5;
  if (ema20 > ema50)  score += 1; else score -= 1;
  if (ema50 > ema200) score += 0.8; else score -= 0.8;
  if (score >= 3.5)  return { label:'Strong Buy',  color:'var(--bull)',         emoji:'🟢', bg:'var(--bull-subtle)',  desc:'Heavy buying signals. RSI oversold + MACD bullish crossover + bullish EMA stack. High confidence upside entry.' };
  if (score >= 1.2)  return { label:'Buy',         color:'#34d399',             emoji:'📈', bg:'rgba(52,211,153,0.08)', desc:'Positive momentum building. Multiple indicators turning bullish. Suitable for entry with stop-loss below recent low.' };
  if (score <= -3.5) return { label:'Strong Sell', color:'var(--bear)',         emoji:'🔴', bg:'var(--bear-subtle)',  desc:'Overbought with bearish momentum. RSI extended + MACD cross below signal. Risk of sharp correction.' };
  if (score <= -1.2) return { label:'Sell',        color:'#fb7185',             emoji:'📉', bg:'rgba(251,113,133,0.08)', desc:'Downward pressure building. Consider booking profits or tightening stop-loss on existing positions.' };
  return               { label:'Neutral',         color:'var(--accent-amber)', emoji:'⚖️', bg:'rgba(245,158,11,0.08)', desc:'Price consolidating in a range. Wait for a clear breakout above resistance or breakdown below support before acting.' };
}

/* ─── SORT OPTIONS ─── */
const SORT_OPTIONS = [
  { value: 'default',   label: 'Default Order' },
  { value: 'gainers',   label: '🟢 Top Gainers' },
  { value: 'losers',    label: '🔴 Top Losers' },
  { value: 'volume',    label: '📊 Highest Volume' },
  { value: 'price_hi',  label: '💰 Price: High → Low' },
  { value: 'price_lo',  label: '💰 Price: Low → High' },
  { value: 'az',        label: '🔤 A → Z' },
  { value: 'za',        label: '🔤 Z → A' },
  { value: 'mktcap',    label: '🏦 Market Cap' },
];

/* ══════════════════════════════════════════
   STOCK DETAIL DRAWER
══════════════════════════════════════════ */
function StockDrawer({ stock, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [chartMode, setChartMode] = useState('daily');
  const [chartDays, setChartDays] = useState(30);
  const [hourlyRes, setHourlyRes] = useState('15m');
  const [history, setHistory]     = useState(() => generateHistory(stock.symbol, stock.ltp, 30));
  const [hourlyHistory, setHourlyHistory] = useState(() => generateHourlyHistory(stock.symbol, stock.ltp, '15m'));

  // Quick calc state
  const [qtyInput,  setQtyInput]  = useState('10');
  const [priceInput,setPriceInput]= useState(String(stock.ltp.toFixed(2)));
  const [waccInput, setWaccInput] = useState(String(stock.ltp.toFixed(2)));
  const [holdType,  setHoldType]  = useState('short');
  const [calcMode,  setCalcMode]  = useState('buy');

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult]   = useState('');
  
  const generateAiAnalysis = async () => {
    setAiLoading(true);
    setAiResult('');
    
    const prompt = `Act as an expert stock market analyst. I need a comprehensive fundamental and technical analysis of the Nepalese stock: ${stock.name || stock.symbol} (${stock.symbol}). 

Current Market Data:
- Sector: ${stock.sector}
- Last Traded Price (LTP): Rs. ${stock.ltp}
- Change: ${stock.pChange}%
- 52W High/Low: Rs. ${stock.high52w} / Rs. ${stock.low52w}
- EPS: ${stock.eps}
- P/E Ratio: ${stock.pe}
- Book Value: Rs. ${stock.bookValue}
- P/B Ratio: ${stock.pb}
- RSI: ${stock.rsi}
- MACD Line: ${stock.macd?.line}, Signal: ${stock.macd?.signal}
- 20 EMA: ${stock.ema20}, 50 EMA: ${stock.ema50}, 200 EMA: ${stock.ema200}

Please provide a concise analysis covering:
1. Fundamental Health (valuation, earnings)
2. One Day Technical Analysis (daily momentum, overall trend, moving averages)
3. Hourly / Intraday Analysis (short-term price action, intraday volatility, and support/resistance based on current momentum)
4. Final Verdict: Overall outlook.
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

  const changeDays = d => {
    setChartDays(d);
    setHistory(generateHistory(stock.symbol, stock.ltp, d));
  };
  const changeHourlyRes = r => {
    setHourlyRes(r);
    setHourlyHistory(generateHourlyHistory(stock.symbol, stock.ltp, r));
  };

  // Derived analytics
  const pivot = useMemo(() => {
    const h = stock.high || stock.ltp * 1.03;
    const l = stock.low  || stock.ltp * 0.97;
    return calculatePivotPoints(h, l, stock.ltp);
  }, [stock]);

  const fib = useMemo(() => calculateFibonacci(stock.high52w, stock.low52w), [stock]);

  const signal = getTechSignal(stock.rsi, stock.macd, stock.ema20, stock.ema50, stock.ema200 || stock.ema50 * 0.95);

  // Quick Calc result
  const calcResult = useMemo(() => {
    const qty   = parseFloat(qtyInput)   || 0;
    const price = parseFloat(priceInput) || 0;
    const wacc  = parseFloat(waccInput)  || 0;
    if (!qty || !price) return null;
    if (calcMode === 'buy')  return calculateBuyDetails(qty, price);
    if (calcMode === 'sell') return calculateSellDetails(qty, price, wacc, holdType);
    return null;
  }, [qtyInput, priceInput, waccInput, calcMode, holdType]);

  const tabs = [
    { id: 'overview',    icon: BarChart2,  label: 'Overview' },
    { id: 'fundamentals',icon: BookOpen,   label: 'Fundamentals' },
    { id: 'technicals',  icon: Activity,   label: 'Technicals' },
    { id: 'quickcalc',   icon: Calculator, label: 'Quick Calc' },
    { id: 'ai',          icon: BrainCircuit, label: 'AI Analysis' },
  ];

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-handle" />

        {/* Header */}
        <div className="drawer-header">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <span className="badge badge-primary">{stock.sector}</span>
                {stock.pChange >= 0
                  ? <span className="badge badge-bull">▲ {stock.pChange.toFixed(2)}%</span>
                  : <span className="badge badge-bear">▼ {Math.abs(stock.pChange).toFixed(2)}%</span>}
              </div>
              <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-0.03em', color:'var(--text-primary)' }}>
                {stock.symbol}
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {stock.name}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:24, fontWeight:900, letterSpacing:'-0.03em', fontFamily:'var(--font-mono)', color:'var(--text-primary)' }}>
                Rs.{fmt(stock.ltp)}
              </div>
              <div style={{ fontSize:12, fontWeight:700, marginTop:2, color: stock.change >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                {stock.change >= 0 ? '+' : ''}{fmt(stock.change)}
              </div>
              <button onClick={onClose} style={{
                marginTop:6, border:'1px solid var(--border)', background:'rgba(255,255,255,0.05)',
                borderRadius:8, padding:'4px 8px', cursor:'pointer', color:'var(--text-muted)',
                display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, marginLeft:'auto'
              }}>
                <X style={{width:12,height:12}} /> Close
              </button>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="drawer-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`drawer-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <t.icon style={{width:12,height:12,display:'inline',marginRight:4}} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="drawer-body fade-in">

          {/* ══ OVERVIEW TAB ══ */}
          {activeTab === 'overview' && (
            <div>
              {/* Chart */}
              <div className="chart-wrap">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 8 }}>
                    <button className={`chart-day-btn ${chartMode==='daily'?'active':''}`} onClick={()=>setChartMode('daily')} style={{padding:'4px 10px'}}>Daily</button>
                    <button className={`chart-day-btn ${chartMode==='hourly'?'active':''}`} onClick={()=>setChartMode('hourly')} style={{padding:'4px 10px'}}>Hourly</button>
                  </div>
                  
                  {chartMode === 'daily' ? (
                    <div className="chart-day-btns">
                      {[7,30,90].map(d => (
                        <button key={d} className={`chart-day-btn ${chartDays===d?'active':''}`}
                          onClick={() => changeDays(d)}>{d}D</button>
                      ))}
                    </div>
                  ) : (
                    <div className="chart-day-btns">
                      {['15m','1h'].map(r => (
                        <button key={r} className={`chart-day-btn ${hourlyRes===r?'active':''}`}
                          onClick={() => changeHourlyRes(r)}>{r}</button>
                      ))}
                    </div>
                  )}
                </div>
                
                {chartMode === 'daily' ? (
                  <AreaChart history={history} />
                ) : (
                  <>
                    <HourlyChart history={hourlyHistory} pivot={pivot} />
                    <HourlyAnalysisSummary history={hourlyHistory} stock={stock} />
                  </>
                )}
              </div>

              {/* Price Stats */}
              <div className="stat-grid-3" style={{marginBottom:10}}>
                <div className="stat-box">
                  <div className="stat-box-label">Open</div>
                  <div className="stat-box-value" style={{fontSize:12}}>Rs.{fmt(stock.open||stock.ltp)}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">Day High</div>
                  <div className="stat-box-value" style={{fontSize:12, color:'var(--bull)'}}>Rs.{fmt(stock.high)}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">Day Low</div>
                  <div className="stat-box-value" style={{fontSize:12, color:'var(--bear)'}}>Rs.{fmt(stock.low)}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">Volume</div>
                  <div className="stat-box-value" style={{fontSize:12}}>{stock.volume.toLocaleString()}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">52W High</div>
                  <div className="stat-box-value" style={{fontSize:12, color:'var(--bull)'}}>Rs.{fmt(stock.high52w)}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">52W Low</div>
                  <div className="stat-box-value" style={{fontSize:12, color:'var(--bear)'}}>Rs.{fmt(stock.low52w)}</div>
                </div>
              </div>

              {/* Signal Card */}
              <div style={{ background:signal.bg, border:`1px solid ${signal.color}30`, borderRadius:14, padding:14, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.07em', color:signal.color }}>
                    {signal.emoji} Guru Analysis
                  </span>
                  <span style={{ fontSize:12, fontWeight:900, color:signal.color, background:`${signal.color}18`, border:`1px solid ${signal.color}30`, padding:'3px 10px', borderRadius:6 }}>
                    {signal.label}
                  </span>
                </div>
                {/* RSI bar */}
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginBottom:4 }}>
                  <span>RSI({stock.rsi.toFixed(1)})</span>
                  <span>{stock.rsi < 30 ? 'Oversold' : stock.rsi > 70 ? 'Overbought' : 'Neutral Zone'}</span>
                </div>
                <div className="signal-bar-wrap">
                  <div className="signal-bar" style={{
                    width: `${stock.rsi}%`,
                    background: stock.rsi < 30 ? 'var(--bull)' : stock.rsi > 70 ? 'var(--bear)' : 'var(--primary)'
                  }} />
                </div>
                <p style={{ fontSize:11.5, color:'rgba(255,255,255,0.72)', lineHeight:1.6, marginTop:8 }}>{signal.desc}</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:10 }}>
                  {[
                    ['EMA20', `Rs.${fmt(stock.ema20)}`],
                    ['EMA50', `Rs.${fmt(stock.ema50)}`],
                    ['MACD Line', stock.macd.line.toFixed(3)],
                    ['MACD Signal', stock.macd.signal.toFixed(3)],
                  ].map(([l,v]) => (
                    <div key={l} style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'7px 10px', border:'1px solid var(--border)' }}>
                      <div style={{ fontSize:9.5, color:'var(--text-muted)', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>{l}</div>
                      <div style={{ fontSize:12.5, fontWeight:800, fontFamily:'var(--font-mono)', color:'var(--text-primary)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Ratios */}
              <div className="stat-grid-3">
                <div className="stat-box">
                  <div className="stat-box-label">EPS</div>
                  <div className="stat-box-value">{stock.eps > 0 ? stock.eps : 'N/A'}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">P/E</div>
                  <div className="stat-box-value">{stock.pe > 0 ? stock.pe : 'N/A'}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">P/B</div>
                  <div className="stat-box-value">{stock.pb?.toFixed(2) || 'N/A'}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">Book Val</div>
                  <div className="stat-box-value" style={{fontSize:12}}>Rs.{stock.bookValue}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">Div Yield</div>
                  <div className="stat-box-value">{stock.divYield}%</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">ROE</div>
                  <div className="stat-box-value">{stock.roe}%</div>
                </div>
              </div>
            </div>
          )}

          {/* ══ FUNDAMENTALS TAB ══ */}
          {activeTab === 'fundamentals' && (
            <div>
              {/* Market Cap Hero */}
              <div style={{
                background:'linear-gradient(135deg, rgba(91,94,244,0.12), rgba(168,85,247,0.08))',
                border:'1px solid rgba(91,94,244,0.2)', borderRadius:16, padding:18, marginBottom:12, textAlign:'center'
              }}>
                <div style={{fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--primary-light)', marginBottom:8}}>
                  Market Capitalisation
                </div>
                <div style={{fontSize:28, fontWeight:900, letterSpacing:'-0.04em', color:'var(--text-primary)', fontFamily:'var(--font-mono)'}}>
                  Rs.{fmtM(stock.marketCap || stock.ltp * stock.listedShares)}
                </div>
                <div style={{fontSize:11, color:'var(--text-muted)', marginTop:4}}>
                  {fmt(stock.listedShares)}M shares listed · Paid-up Capital Rs.{fmt(stock.paidUpCapital)}M
                </div>
              </div>

              {/* Fundamentals Grid */}
              <div className="stat-grid-2" style={{marginBottom:12}}>
                {[
                  ['EPS (Earnings/Share)', `Rs. ${stock.eps > 0 ? stock.eps : 'N/A'}`],
                  ['P/E Ratio', stock.pe > 0 ? `${stock.pe}x` : 'N/A'],
                  ['P/B Ratio', stock.pb ? `${stock.pb.toFixed(2)}x` : 'N/A'],
                  ['Book Value/Share', `Rs. ${stock.bookValue}`],
                  ['Return on Equity', `${stock.roe}%`],
                  ['Dividend Yield', `${stock.divYield}%`],
                  ['Outstanding Shares', `${stock.listedShares}M`],
                  ['120D Avg Price', `Rs. ${stock.avg120}`],
                ].map(([l,v]) => (
                  <div key={l} className="stat-box">
                    <div className="stat-box-label">{l}</div>
                    <div className="stat-box-value" style={{fontSize:13}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Dividend History */}
              <div style={{background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginBottom:12}}>
                <div style={{fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:10}}>
                  Dividend History (Last)
                </div>
                <div className="stat-grid-2">
                  <div>
                    <div style={{fontSize:10, color:'var(--text-muted)', fontWeight:700, marginBottom:4}}>BONUS SHARE</div>
                    <div style={{fontSize:20, fontWeight:900, color: stock.bonusShare > 0 ? 'var(--bull)' : 'var(--text-muted)', fontFamily:'var(--font-mono)'}}>
                      {stock.bonusShare > 0 ? `${stock.bonusShare}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:10, color:'var(--text-muted)', fontWeight:700, marginBottom:4}}>CASH DIVIDEND</div>
                    <div style={{fontSize:20, fontWeight:900, color: stock.cashDiv > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)', fontFamily:'var(--font-mono)'}}>
                      {stock.cashDiv > 0 ? `${stock.cashDiv}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 52 Week Range Bar */}
              <div style={{background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)', borderRadius:12, padding:14}}>
                <div style={{fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:10}}>
                  52-Week Price Range
                </div>
                <div style={{position:'relative', height:8, background:'rgba(255,255,255,0.08)', borderRadius:8, margin:'0 0 8px'}}>
                  {(() => {
                    const pct = ((stock.ltp - stock.low52w) / (stock.high52w - stock.low52w)) * 100;
                    return (
                      <>
                        <div style={{position:'absolute', left:0, top:0, bottom:0, width:`${Math.min(100, pct)}%`, background:'linear-gradient(90deg, var(--bull), var(--accent-cyan))', borderRadius:8}} />
                        <div style={{position:'absolute', top:-3, left:`${Math.min(98,pct)}%`, width:14, height:14, background:'#fff', borderRadius:7, border:'2px solid var(--primary)', boxShadow:'0 0 10px var(--primary-glow)'}} />
                      </>
                    );
                  })()}
                </div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700}}>
                  <span style={{color:'var(--bear)'}}>Low Rs.{fmt(stock.low52w)}</span>
                  <span style={{color:'var(--text-muted)', fontSize:10}}>Current Rs.{fmt(stock.ltp)}</span>
                  <span style={{color:'var(--bull)'}}>High Rs.{fmt(stock.high52w)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ══ TECHNICALS TAB ══ */}
          {activeTab === 'technicals' && (
            <div>
              {/* EMA Status */}
              <div style={{marginBottom:12}}>
                <div className="section-title" style={{marginBottom:8}}>EMA Trend Structure</div>
                <div className="stat-grid-3">
                  {[
                    ['EMA 20', stock.ema20, 'Short-term'],
                    ['EMA 50', stock.ema50, 'Mid-term'],
                    ['EMA 200', stock.ema200 || (stock.ema50 * 0.95), 'Long-term'],
                  ].map(([label, val, sub]) => {
                    const aboveLtp = stock.ltp >= val;
                    return (
                      <div key={label} className="stat-box" style={{ borderColor: aboveLtp ? 'rgba(16,217,138,0.2)' : 'rgba(245,69,92,0.2)' }}>
                        <div className="stat-box-label">{label}</div>
                        <div className="stat-box-value" style={{fontSize:12, fontFamily:'var(--font-mono)'}}>Rs.{fmt(val)}</div>
                        <div className="stat-box-sub" style={{color: aboveLtp ? 'var(--bull)' : 'var(--bear)'}}>
                          {aboveLtp ? '▲ Price Above' : '▼ Price Below'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pivot Points */}
              <div style={{background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginBottom:12}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                  <div className="section-title">Classic Pivot Points</div>
                  <span className="badge badge-cyan">Daily</span>
                </div>
                <table className="pivot-table">
                  <thead>
                    <tr><th>Level</th><th>Price (Rs.)</th><th>Type</th></tr>
                  </thead>
                  <tbody>
                    {[
                      { name:'R3', val:pivot.R3, type:'Resistance', cls:'text-bear' },
                      { name:'R2', val:pivot.R2, type:'Resistance', cls:'text-bear' },
                      { name:'R1', val:pivot.R1, type:'Resistance', cls:'text-bear' },
                      { name:'PP', val:pivot.P,  type:'Pivot',      cls:'text-primary-c', isPivot:true },
                      { name:'S1', val:pivot.S1, type:'Support',    cls:'text-bull' },
                      { name:'S2', val:pivot.S2, type:'Support',    cls:'text-bull' },
                      { name:'S3', val:pivot.S3, type:'Support',    cls:'text-bull' },
                    ].map(row => (
                      <tr key={row.name} className={row.isPivot ? 'pivot-pivot' : ''}>
                        <td><span className={`badge ${row.isPivot ? 'badge-primary' : row.cls === 'text-bull' ? 'badge-bull' : 'badge-bear'}`}>{row.name}</span></td>
                        <td className={`mono ${row.cls}`} style={{fontWeight:800, fontSize:13}}>{fmt(row.val)}</td>
                        <td style={{fontSize:10, color:'var(--text-muted)'}}>{row.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{fontSize:10, color:'var(--text-muted)', marginTop:8, lineHeight:1.5}}>
                  Pivot calculated from today's High ({fmt(stock.high)}), Low ({fmt(stock.low)}), Close ({fmt(stock.ltp)}).
                </p>
              </div>

              {/* Fibonacci Retracement */}
              <div style={{background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)', borderRadius:12, padding:14}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                  <div className="section-title">Fibonacci Retracement</div>
                  <span className="badge badge-violet">52W Range</span>
                </div>
                {[
                  { label:'0% (52W High)',   val:fib.level_0,    color:'var(--bear)' },
                  { label:'23.6%',           val:fib.level_236,  color:'#fb923c' },
                  { label:'38.2%',           val:fib.level_382,  color:'var(--accent-amber)' },
                  { label:'50.0% (Mid)',     val:fib.level_500,  color:'var(--accent-cyan)' },
                  { label:'61.8% (Golden)', val:fib.level_618,  color:'var(--bull)' },
                  { label:'78.6%',           val:fib.level_786,  color:'#34d399' },
                  { label:'100% (52W Low)', val:fib.level_1000, color:'var(--text-muted)' },
                ].map(f => {
                  const isNear = Math.abs(stock.ltp - f.val) / stock.ltp < 0.015;
                  return (
                    <div key={f.label} className="fib-row" style={{ background: isNear ? 'rgba(91,94,244,0.08)' : 'transparent', borderRadius: isNear ? 8 : 0 }}>
                      <span className="fib-label" style={{color: f.color}}>{f.label}</span>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        {isNear && <span className="badge badge-primary" style={{fontSize:9}}>Near</span>}
                        <span className="fib-val" style={{color: f.color}}>Rs.{fmt(f.val)}</span>
                      </div>
                    </div>
                  );
                })}
                <p style={{fontSize:10, color:'var(--text-muted)', marginTop:10, lineHeight:1.5, padding:'0 2px'}}>
                  Golden ratio 61.8% is the most significant Fibonacci support/resistance. Price near this level often reverses.
                </p>
              </div>
            </div>
          )}

          {/* ══ QUICK CALC TAB ══ */}
          {activeTab === 'quickcalc' && (
            <div>
              {/* Buy/Sell toggle */}
              <div className="tab-bar" style={{marginBottom:14}}>
                <button className={`tab-btn ${calcMode==='buy'?'active':''}`} onClick={()=>setCalcMode('buy')}>
                  📈 Buy Calculator
                </button>
                <button className={`tab-btn ${calcMode==='sell'?'active':''}`} onClick={()=>setCalcMode('sell')}>
                  📉 Sell Calculator
                </button>
              </div>

              <div style={{display:'flex', alignItems:'center', gap:8, background:'rgba(91,94,244,0.06)', border:'1px solid rgba(91,94,244,0.15)', borderRadius:10, padding:'8px 12px', marginBottom:14}}>
                <Zap style={{width:14,height:14,color:'var(--primary-light)',flexShrink:0}} />
                <span style={{fontSize:11, color:'var(--text-secondary)', lineHeight:1.5}}>
                  Pre-filled with <strong style={{color:'var(--text-primary)'}}>{stock.symbol}</strong> current price Rs.{fmt(stock.ltp)}. Includes SEBON 0.015%, broker commission, and DP Rs.25.
                </span>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
                <div>
                  <label className="input-label">Qty (Units)</label>
                  <input className="input" type="number" min="1"
                    value={qtyInput} onChange={e=>setQtyInput(e.target.value)} />
                </div>
                <div>
                  <label className="input-label">{calcMode==='buy'?'Buy':'Sell'} Price (Rs.)</label>
                  <input className="input" type="number" min="1"
                    value={priceInput} onChange={e=>setPriceInput(e.target.value)} />
                </div>
              </div>

              {calcMode === 'sell' && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
                  <div>
                    <label className="input-label">Buy WACC (Rs.)</label>
                    <input className="input" type="number" min="1"
                      value={waccInput} onChange={e=>setWaccInput(e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Holding Period</label>
                    <select className="input select-input" value={holdType} onChange={e=>setHoldType(e.target.value)}>
                      <option value="short">Short-term ≤365d (7.5%)</option>
                      <option value="long">Long-term {">"} 365d (5%)</option>
                      <option value="institutional">Institutional (10%)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Results */}
              {calcResult && (
                <div style={{background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden'}}>
                  <div style={{padding:'10px 14px', borderBottom:'1px solid var(--border)', background:'rgba(255,255,255,0.02)'}}>
                    <span style={{fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)'}}>
                      Transaction Breakdown
                    </span>
                  </div>
                  <div style={{padding:14}}>
                    {calcMode === 'buy' ? (
                      <>
                        {[
                          ['Share Value', `Rs. ${fmt(calcResult.shareValue)}`,'var(--text-primary)'],
                          ['Broker Commission', `Rs. ${fmt(calcResult.commission)}`,'var(--text-secondary)'],
                          ['SEBON Fee (0.015%)', `Rs. ${fmt(calcResult.sebonFee)}`,'var(--text-secondary)'],
                          ['DP Charge', `Rs. ${fmt(calcResult.dpFee)}`,'var(--text-secondary)'],
                        ].map(([l,v,c]) => (
                          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12.5}}>
                            <span style={{color:'var(--text-secondary)',fontWeight:600}}>{l}</span>
                            <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:c}}>{v}</span>
                          </div>
                        ))}
                        <div style={{display:'flex',justifyContent:'space-between',padding:'11px 0 4px',fontSize:14,fontWeight:900}}>
                          <span style={{color:'var(--text-primary)'}}>Total Payable</span>
                          <span style={{fontFamily:'var(--font-mono)',color:'var(--bear)'}}>Rs. {fmt(calcResult.totalAmount)}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)'}}>
                          <span>Cost per Share (WACC)</span>
                          <span style={{fontFamily:'var(--font-mono)'}}>Rs. {fmt(calcResult.costPerShare)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        {[
                          ['Sell Value', `Rs. ${fmt(calcResult.sellValue)}`,'var(--text-primary)'],
                          ['Broker Commission', `- Rs. ${fmt(calcResult.commission)}`,'var(--bear)'],
                          ['SEBON Fee', `- Rs. ${fmt(calcResult.sebonFee)}`,'var(--bear)'],
                          ['DP Charge', `- Rs. ${fmt(calcResult.dpFee)}`,'var(--bear)'],
                          [`CGT (${(calcResult.cgtRate*100).toFixed(1)}%)`, `- Rs. ${fmt(calcResult.cgt)}`,'var(--accent-amber)'],
                        ].map(([l,v,c]) => (
                          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12.5}}>
                            <span style={{color:'var(--text-secondary)',fontWeight:600}}>{l}</span>
                            <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:c}}>{v}</span>
                          </div>
                        ))}
                        <div style={{display:'flex',justifyContent:'space-between',padding:'11px 0 4px',fontSize:14,fontWeight:900}}>
                          <span style={{color:'var(--text-primary)'}}>Net Receivable</span>
                          <span style={{fontFamily:'var(--font-mono)',color:'var(--bull)'}}>Rs. {fmt(calcResult.netReceivable)}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
                          <span style={{color:'var(--text-muted)'}}>Net Profit / Loss</span>
                          <span style={{fontFamily:'var(--font-mono)',fontWeight:800,color:calcResult.netProfitLoss>=0?'var(--bull)':'var(--bear)'}}>
                            {calcResult.netProfitLoss >= 0 ? '+' : ''}Rs. {fmt(calcResult.netProfitLoss)}
                          </span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
                          <span style={{color:'var(--text-muted)'}}>ROI</span>
                          <span style={{fontFamily:'var(--font-mono)',fontWeight:800,color:calcResult.roi>=0?'var(--bull)':'var(--bear)'}}>
                            {calcResult.roi >= 0 ? '+' : ''}{calcResult.roi.toFixed(2)}%
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ AI ANALYSIS TAB ══ */}
          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {!aiResult && !aiLoading && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <BrainCircuit style={{ width: 48, height: 48, color: 'var(--primary)', margin: '0 auto 16px', opacity: 0.8 }} />
                  <h3 style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>Guru AI Analysis</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                    Generate a real-time fundamental, <strong>daily, and hourly</strong> technical analysis report for {stock.symbol}.
                  </p>
                  <button onClick={generateAiAnalysis} className="btn-primary" style={{ padding: '10px 20px', borderRadius: 8 }}>
                    <Sparkles style={{ width: 16, height: 16, display: 'inline', marginRight: 6 }} /> Generate Analysis
                  </button>
                </div>
              )}

              {aiLoading && (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div className="spinner" style={{ margin: '0 auto 20px' }} />
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>Analyzing data for {stock.symbol}...</div>
                </div>
              )}

              {aiResult && !aiLoading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BrainCircuit style={{ width: 14, height: 14 }} /> AI Generated Report
                    </div>
                    <button onClick={generateAiAnalysis} className="icon-btn" title="Regenerate" style={{ padding: 6 }}>
                      <RefreshCw style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                  <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: markdownToHtml(aiResult) }} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }} />
                </div>
              )}
            </div>
          )}

        </div>{/* end drawer-body */}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
══════════════════════════════════════════ */
export default function Dashboard({ stocks, indices, triggerTick }) {
  const [search,    setSearch]    = useState('');
  const [sector,    setSector]    = useState('All');
  const [sortBy,    setSortBy]    = useState('default');
  const [selected,  setSelected]  = useState(null);
  const [showSort,  setShowSort]  = useState(false);

  /* ── filtered + sorted stock list ── */
  const displayStocks = useMemo(() => {
    let list = stocks.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.symbol?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q) || s.sector?.toLowerCase().includes(q);
      const matchSector = sector === 'All' || s.sector === sector;
      return matchSearch && matchSector;
    });

    switch (sortBy) {
      case 'gainers':  list = [...list].sort((a,b) => b.pChange - a.pChange); break;
      case 'losers':   list = [...list].sort((a,b) => a.pChange - b.pChange); break;
      case 'volume':   list = [...list].sort((a,b) => b.volume  - a.volume);  break;
      case 'price_hi': list = [...list].sort((a,b) => b.ltp     - a.ltp);     break;
      case 'price_lo': list = [...list].sort((a,b) => a.ltp     - b.ltp);     break;
      case 'az':       list = [...list].sort((a,b) => a.symbol.localeCompare(b.symbol)); break;
      case 'za':       list = [...list].sort((a,b) => b.symbol.localeCompare(a.symbol)); break;
      case 'mktcap':   list = [...list].sort((a,b) => (b.marketCap||0) - (a.marketCap||0)); break;
      default: break;
    }
    return list;
  }, [stocks, search, sector, sortBy]);

  const gainers = stocks.filter(s => s.pChange > 0).length;
  const losers  = stocks.filter(s => s.pChange < 0).length;
  const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Sort';

  return (
    <div>
      {/* ── Live Ticker Strip ── */}
      <div className="ticker-strip">
        <div className="ticker-scroll">
          {[...stocks, ...stocks].map((s, i) => (
            <div key={i} className="ticker-item" onClick={() => setSelected(s)}>
              <span className="ticker-symbol">{s.symbol}</span>
              <span className="ticker-price">Rs.{s.ltp.toFixed(1)}</span>
              <span className="ticker-change" style={{color: s.pChange >= 0 ? 'var(--bull)' : 'var(--bear)'}}>
                {s.pChange >= 0 ? '▲' : '▼'}{Math.abs(s.pChange).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:'14px 14px 0'}}>
        {/* ── Index Cards ── */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12}}>
          {[
            { label:'NEPSE', data:indices.nepse },
            { label:'Float', data:indices.float },
            { label:'Sensitive', data:indices.sensitive },
          ].map(({ label, data }) => {
            const bull = data.change >= 0;
            return (
              <div key={label} className={`index-card ${bull ? 'bull-card' : 'bear-card'}`}>
                <div style={{fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.09em', color:'var(--text-muted)', marginBottom:4}}>{label}</div>
                <div style={{fontSize:15, fontWeight:900, color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em'}}>{data.value}</div>
                <div style={{fontSize:10, fontWeight:800, marginTop:3, color: bull ? 'var(--bull)' : 'var(--bear)'}}>
                  {bull ? '▲' : '▼'} {Math.abs(data.pChange).toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Market Summary Bar ── */}
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background:'rgba(255,255,255,0.025)', border:'1px solid var(--border)',
          borderRadius:12, padding:'9px 14px', marginBottom:12
        }}>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <span className="pulse-dot" />
            <span style={{fontSize:11, fontWeight:700, color:'var(--text-secondary)'}}>
              <span style={{color:'var(--bull)', fontWeight:900}}>{gainers}</span> up ·&nbsp;
              <span style={{color:'var(--bear)', fontWeight:900}}>{losers}</span> down ·&nbsp;
              <span style={{color:'var(--text-muted)'}}>{stocks.length - gainers - losers}</span> flat
            </span>
          </div>
          <button onClick={triggerTick} style={{
            display:'flex', alignItems:'center', gap:5, background:'var(--primary-subtle)',
            border:'1px solid rgba(91,94,244,0.25)', borderRadius:8, padding:'5px 10px',
            color:'var(--primary-light)', fontSize:11, fontWeight:800, cursor:'pointer', transition:'all 0.2s'
          }}>
            <RefreshCw style={{width:12,height:12}} /> Refresh Data
          </button>
        </div>

        {/* ── Sector Pills ── */}
        <div className="sector-pills" style={{marginBottom:12}}>
          <button className={`sector-pill ${sector==='All'?'active':''}`} onClick={()=>setSector('All')}>
            All ({stocks.length})
          </button>
          {SECTORS.map(sec => {
            const cnt = stocks.filter(s=>s.sector===sec).length;
            if (!cnt) return null;
            const avgChg = stocks.filter(s=>s.sector===sec).reduce((a,s)=>a+s.pChange,0) / cnt;
            return (
              <button key={sec} className={`sector-pill ${sector===sec?'active':''}`} onClick={()=>setSector(sec)}>
                {sec}
                <span style={{
                  fontSize:9, fontWeight:900,
                  color: sector===sec ? 'rgba(255,255,255,0.8)' : avgChg>=0 ? 'var(--bull)' : 'var(--bear)'
                }}>
                  {avgChg>=0?'+':''}{avgChg.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Search + Sort Row ── */}
        <div style={{display:'flex', gap:8, marginBottom:12, alignItems:'center'}}>
          <div className="search-wrap" style={{flex:1}}>
            <Search className="search-icon" style={{width:16,height:16}} />
            <input
              className="input"
              style={{paddingLeft:38}}
              placeholder={`Search ${stocks.length}+ stocks — symbol, name, sector…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{position:'relative', flexShrink:0}}>
            <button
              onClick={() => setShowSort(p => !p)}
              style={{
                display:'flex', alignItems:'center', gap:5,
                background: sortBy !== 'default' ? 'var(--primary-subtle)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${sortBy !== 'default' ? 'rgba(91,94,244,0.35)' : 'var(--border)'}`,
                borderRadius:12, padding:'10px 12px', cursor:'pointer',
                color: sortBy !== 'default' ? 'var(--primary-light)' : 'var(--text-secondary)',
                fontSize:12, fontWeight:700, whiteSpace:'nowrap', transition:'all 0.2s'
              }}
            >
              <BarChart2 style={{width:14,height:14}} />
              {sortBy === 'default' ? 'Sort' : sortLabel.split(' ').slice(0,2).join(' ')}
              <ChevronDown style={{width:12,height:12}} />
            </button>
            {showSort && (
              <div style={{
                position:'absolute', top:'calc(100% + 6px)', right:0,
                background:'var(--bg-elevated)', border:'1px solid var(--border-bright)',
                borderRadius:14, overflow:'hidden', minWidth:200,
                boxShadow:'0 20px 60px rgba(0,0,0,0.7)', zIndex:50,
                animation:'fadeIn 0.18s ease'
              }}>
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => { setSortBy(opt.value); setShowSort(false); }}
                    style={{
                      display:'block', width:'100%', textAlign:'left',
                      padding:'10px 14px', background: sortBy===opt.value ? 'var(--primary-subtle)' : 'transparent',
                      border:'none', color: sortBy===opt.value ? 'var(--primary-light)' : 'var(--text-secondary)',
                      fontSize:12.5, fontWeight:700, cursor:'pointer', transition:'background 0.15s',
                      borderBottom:'1px solid rgba(255,255,255,0.04)'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Stock Directory Table ── */}
        <div style={{background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', marginBottom:14}}>
          {/* Table Head */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 65px 70px 65px 50px',
            padding:'8px 14px', borderBottom:'1px solid var(--border)',
            fontSize:9.5, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)',
            background:'rgba(255,255,255,0.015)'
          }}>
            <span>Symbol</span>
            <span style={{textAlign:'center'}}>Trend</span>
            <span style={{textAlign:'right'}}>LTP</span>
            <span style={{textAlign:'right'}}>Chg %</span>
            <span style={{textAlign:'right'}}>Vol</span>
          </div>

          {/* Rows */}
          <div style={{maxHeight:440, overflowY:'auto'}}>
            {displayStocks.length > 0 ? displayStocks.map(stock => {
              const bull = stock.pChange >= 0;
              const spark = generateSparkline(stock.symbol, stock.ltp);
              return (
                <div key={stock.symbol}
                  onClick={() => setSelected(stock)}
                  style={{
                    display:'grid', gridTemplateColumns:'1fr 65px 70px 65px 50px',
                    padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.035)',
                    cursor:'pointer', transition:'background 0.15s', alignItems:'center'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  {/* Col 1: Symbol & Name */}
                  <div>
                    <div style={{fontSize:13, fontWeight:900, color:'var(--text-primary)', letterSpacing:'-0.01em', display:'flex', alignItems:'center', gap:4}}>
                      {stock.symbol}
                      <span style={{width:5,height:5,borderRadius:'50%',background:bull?'var(--bull)':'var(--bear)', display:'inline-block', opacity:0.8}} />
                    </div>
                    <div style={{fontSize:9.5, color:'var(--text-muted)', marginTop:1, maxWidth:110, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {stock.name}
                    </div>
                  </div>

                  {/* Col 2: Sparkline Trend */}
                  <div style={{display:'flex', justifyContent:'center'}}>
                    <Sparkline points={spark} bull={bull} />
                  </div>

                  {/* Col 3: LTP */}
                  <div style={{textAlign:'right', fontFamily:'var(--font-mono)', fontSize:12, fontWeight:700, color:'var(--text-primary)'}}>
                    {fmt(stock.ltp)}
                  </div>

                  {/* Col 4: Change % */}
                  <div style={{textAlign:'right', fontSize:11, fontWeight:800, color: bull ? 'var(--bull)' : 'var(--bear)'}}>
                    {bull ? '+' : ''}{stock.pChange.toFixed(1)}%
                  </div>

                  {/* Col 5: Volume */}
                  <div style={{textAlign:'right', fontSize:10, color:'var(--text-muted)', fontWeight:600}}>
                    {stock.volume >= 1000 ? `${(stock.volume/1000).toFixed(0)}K` : stock.volume}
                  </div>
                </div>
              );
            }) : (
              <div style={{padding:'40px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:13}}>
                No stocks found for <strong>"{search}"</strong>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{padding:'8px 14px', borderTop:'1px solid var(--border)', background:'rgba(255,255,255,0.01)', fontSize:10, color:'var(--text-muted)', display:'flex', justifyContent:'space-between'}}>
            <span>Showing {displayStocks.length} of {stocks.length} stocks</span>
            {sortBy !== 'default' && <span style={{color:'var(--primary-light)', fontWeight:700}}>Sorted: {sortLabel}</span>}
          </div>
        </div>
      </div>

      {/* ── Stock Detail Drawer ── */}
      {selected && <StockDrawer stock={selected} onClose={() => setSelected(null)} />}

      {/* Close sort dropdown on outside click */}
      {showSort && <div style={{position:'fixed',inset:0,zIndex:40}} onClick={()=>setShowSort(false)} />}
    </div>
  );
}
