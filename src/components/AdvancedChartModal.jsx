import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X, Maximize2, Minimize2, LineChart, BarChart2, Activity,
  Layers, Zap, ChevronLeft, Sliders, Eye, RefreshCw
} from 'lucide-react';
import { generateHistory, generateHourlyHistory } from '../utils/mockData';
import { useBackHandler } from '../context/NavigationContext';

const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function AdvancedChartModal({
  symbol = 'NEPSE',
  stock = null,
  initialTimeframe = '6M',
  onClose
}) {
  useBackHandler(onClose, true, 110);

  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [chartMode, setChartMode] = useState('candle'); // 'candle' | 'line'
  const [showSMA, setShowSMA] = useState(true);
  const [showSMA200, setShowSMA200] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRSI, setShowRSI] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [chartSource, setChartSource] = useState('native'); // 'native' | 'web'
  const [hoverIndex, setHoverIndex] = useState(null);

  const isIntraday = timeframe === '1D' || timeframe === '2D' || timeframe === '3D';
  const ltp = Number(stock?.ltp || 350);

  const [history, setHistory] = useState([]);

  // Fetch historical data from UDF endpoint
  useEffect(() => {
    async function fetchData() {
      try {
        let days = 180;
        if (timeframe === '1W') days = 7;
        else if (timeframe === '1M') days = 30;
        else if (timeframe === '3M') days = 90;
        else if (timeframe === '6M') days = 180;
        else if (timeframe === '1Y') days = 365;
        else if (timeframe === '2Y' || timeframe === 'All') days = 730;

        const to = Math.floor(Date.now() / 1000);
        const from = to - (days * 24 * 60 * 60);

        const res = await fetch(`http://localhost:5000/api/udf/history?symbol=${symbol}&from=${from}&to=${to}&resolution=1D`);
        const data = await res.json();
        
        if (data.s === 'ok') {
          const formatted = data.t.map((time, idx) => ({
            time: new Date(time * 1000).toISOString().split('T')[0],
            open: data.o[idx],
            high: data.h[idx],
            low: data.l[idx],
            close: data.c[idx],
            volume: data.v[idx]
          }));
          setHistory(formatted);
        } else {
          // Fallback to mock data if DB is empty
          if (isIntraday) {
            setHistory(generateHourlyHistory(symbol, ltp, '15m', stock));
          } else {
            setHistory(generateHistory(symbol, ltp, days));
          }
        }
      } catch (err) {
        console.error('Failed to fetch UDF history:', err);
        // Fallback to mock data on error
        setHistory(generateHistory(symbol, ltp, 180));
      }
    }
    fetchData();
  }, [symbol, timeframe, isIntraday, ltp, stock]);

  // Technical Calculations (SMA5, SMA10, SMA20, SMA50, SMA200, Bollinger Bands, RSI)
  const technicalData = useMemo(() => {
    if (!history || history.length === 0) return [];

    const closes = history.map(h => h.close);

    return history.map((item, idx) => {
      // Moving Averages
      const getSMA = period => {
        if (idx < period - 1) return null;
        const slice = closes.slice(idx - period + 1, idx + 1);
        return slice.reduce((a, b) => a + b, 0) / period;
      };

      const ma5 = getSMA(5);
      const ma10 = getSMA(10);
      const ma20 = getSMA(20);
      const ma50 = getSMA(50);
      const ma200 = item.sma200 || getSMA(200);

      // Bollinger Bands (20, 2)
      let bbUpper = null;
      let bbLower = null;
      if (ma20 != null && idx >= 19) {
        const slice = closes.slice(idx - 19, idx + 1);
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - ma20, 2), 0) / 20;
        const stdDev = Math.sqrt(variance);
        bbUpper = ma20 + (stdDev * 2);
        bbLower = ma20 - (stdDev * 2);
      }

      // RSI (14)
      let rsi = 50;
      if (idx >= 14) {
        let gains = 0;
        let losses = 0;
        for (let i = idx - 13; i <= idx; i++) {
          const diff = closes[i] - closes[i - 1];
          if (diff >= 0) gains += diff;
          else losses += Math.abs(diff);
        }
        const avgGain = gains / 14;
        const avgLoss = losses / 14 || 0.001;
        const rs = avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
      }

      return {
        ...item,
        ma5,
        ma10,
        ma20,
        ma50,
        ma200,
        bbUpper,
        bbLower,
        rsi
      };
    });
  }, [history]);

  const activePoint = hoverIndex != null ? technicalData[hoverIndex] : technicalData[technicalData.length - 1];

  // SVG Chart Geometry
  const W = 700;
  const H_MAIN = 260;
  const H_VOL = showVolume ? 60 : 0;
  const H_RSI = showRSI ? 60 : 0;
  const H_TOTAL = H_MAIN + H_VOL + H_RSI;
  const LEFT_AXIS = 45;
  const PLOT_W = W - LEFT_AXIS - 10;

  const getX = i => {
    if (technicalData.length <= 1) return LEFT_AXIS + PLOT_W / 2;
    return LEFT_AXIS + (i / (technicalData.length - 1)) * PLOT_W;
  };

  const prices = technicalData.flatMap(d => [d.high || d.close, d.low || d.close]);
  const minPrice = Math.min(...prices) * 0.985;
  const maxPrice = Math.max(...prices) * 1.015;
  const priceRng = maxPrice - minPrice || 1;

  const getY = p => {
    return H_MAIN - ((p - minPrice) / priceRng) * (H_MAIN - 20) - 10;
  };

  const volumes = technicalData.map(d => d.volume || 1000);
  const maxVol = Math.max(...volumes) || 1;
  const getVolY = v => {
    return (H_MAIN + H_VOL) - (v / maxVol) * (H_VOL - 10) - 5;
  };

  const getRsiY = r => {
    const rsiTop = H_MAIN + H_VOL;
    return rsiTop + H_RSI - (r / 100) * (H_RSI - 14) - 7;
  };

  // Touch / Mouse Move Handlers
  const handleTouch = (clientX, targetRect) => {
    const x = clientX - targetRect.left;
    const relX = (x - LEFT_AXIS) / PLOT_W;
    const idx = Math.max(0, Math.min(technicalData.length - 1, Math.round(relX * (technicalData.length - 1))));
    setHoverIndex(idx);
  };

  const isBull = stock?.change != null ? stock.change >= 0 : (stock?.pChange != null ? stock.pChange >= 0 : true);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        background: '#070b14',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      {/* ── Header with Safe Area Protection ── */}
      <div style={{
        paddingTop: 'max(12px, calc(env(safe-area-inset-top, 0px) + 8px))',
        paddingBottom: '10px',
        paddingLeft: '16px',
        paddingRight: '16px',
        background: '#0d131f',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ChevronLeft style={{ width: 22, height: 22 }} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#ffffff' }}>{symbol}</span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: isBull ? 'rgba(16, 217, 138, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isBull ? 'var(--bull)' : '#ef4444'
              }}>
                {isBull ? '▲ +' : '▼ '}{fmt(stock?.change || 0)} ({fmt(stock?.pChange || 0)}%)
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {stock?.name || 'Nepal Stock Exchange'} · {stock?.sector || 'Index'}
            </div>
          </div>
        </div>

        {/* Source Switcher (Native Interactive vs Web TradingView) */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
            <button
              onClick={() => setChartSource('native')}
              style={{
                background: chartSource === 'native' ? '#10d98a' : 'transparent',
                color: chartSource === 'native' ? '#000000' : 'rgba(255,255,255,0.7)',
                border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer'
              }}
            >
              Native
            </button>
            <button
              onClick={() => setChartSource('web')}
              style={{
                background: chartSource === 'web' ? '#10d98a' : 'transparent',
                color: chartSource === 'web' ? '#000000' : 'rgba(255,255,255,0.7)',
                border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer'
              }}
            >
              Web TV
            </button>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>

      {chartSource === 'web' ? (
        /* ── Web TradingView / NepseAlpha Embed ── */
        <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', background: '#131722' }}>
          <iframe
            title="TradingView Technical Chart"
            src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=NEPSE%3A${symbol.toUpperCase()}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FKathmandu&withdateranges=1&showpopupbutton=1`}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      ) : (
        /* ── Native High-Performance Interactive Chart ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top Control Bar: Mode & Indicators */}
          <div style={{
            padding: '8px 14px',
            background: '#090d16',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            overflowX: 'auto',
            gap: 8
          }}>
            {/* Chart Type (Line / Candle) */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => setChartMode('candle')}
                style={{
                  background: chartMode === 'candle' ? '#10d98a' : 'rgba(255,255,255,0.05)',
                  color: chartMode === 'candle' ? '#000' : '#fff',
                  border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer'
                }}
              >
                🕯️ Candle
              </button>
              <button
                onClick={() => setChartMode('line')}
                style={{
                  background: chartMode === 'line' ? '#10d98a' : 'rgba(255,255,255,0.05)',
                  color: chartMode === 'line' ? '#000' : '#fff',
                  border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer'
                }}
              >
                📈 Line
              </button>
            </div>

            {/* Indicator Pills */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => setShowSMA(v => !v)}
                style={{
                  background: showSMA ? 'rgba(234, 179, 8, 0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${showSMA ? '#eab308' : 'rgba(255,255,255,0.1)'}`,
                  color: showSMA ? '#eab308' : 'rgba(255,255,255,0.5)',
                  borderRadius: 6, padding: '4px 8px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer'
                }}
              >
                MA 5/10/20
              </button>

              <button
                onClick={() => setShowSMA200(v => !v)}
                style={{
                  background: showSMA200 ? 'rgba(168, 85, 247, 0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${showSMA200 ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
                  color: showSMA200 ? '#a855f7' : 'rgba(255,255,255,0.5)',
                  borderRadius: 6, padding: '4px 8px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer'
                }}
              >
                50/200 SMA
              </button>

              <button
                onClick={() => setShowBollinger(v => !v)}
                style={{
                  background: showBollinger ? 'rgba(6, 182, 212, 0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${showBollinger ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
                  color: showBollinger ? '#06b6d4' : 'rgba(255,255,255,0.5)',
                  borderRadius: 6, padding: '4px 8px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer'
                }}
              >
                Bollinger (20,2)
              </button>

              <button
                onClick={() => setShowRSI(v => !v)}
                style={{
                  background: showRSI ? 'rgba(236, 72, 153, 0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${showRSI ? '#ec4899' : 'rgba(255,255,255,0.1)'}`,
                  color: showRSI ? '#ec4899' : 'rgba(255,255,255,0.5)',
                  borderRadius: 6, padding: '4px 8px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer'
                }}
              >
                RSI (14)
              </button>
            </div>
          </div>

          {/* Interactive HUD / Crosshair Info Bar */}
          {activePoint && (
            <div style={{
              background: '#090e18',
              padding: '6px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 12px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)'
            }}>
              <span style={{ color: '#fff', fontWeight: 800 }}>📅 {activePoint.time || activePoint.date}</span>
              <span style={{ color: 'var(--text-muted)' }}>O: <strong style={{ color: '#fff' }}>Rs {fmt(activePoint.open || activePoint.close)}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>H: <strong style={{ color: 'var(--bull)' }}>Rs {fmt(activePoint.high || activePoint.close)}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>L: <strong style={{ color: '#ef4444' }}>Rs {fmt(activePoint.low || activePoint.close)}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>C: <strong style={{ color: '#10d98a' }}>Rs {fmt(activePoint.close)}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Vol: <strong style={{ color: '#fff' }}>{(activePoint.volume || 0).toLocaleString()}</strong></span>
              {showSMA200 && activePoint.ma200 && (
                <span style={{ color: '#a855f7' }}>200 SMA: Rs {fmt(activePoint.ma200)}</span>
              )}
              {showRSI && (
                <span style={{ color: activePoint.rsi > 70 ? '#ef4444' : (activePoint.rsi < 30 ? 'var(--bull)' : '#ec4899') }}>
                  RSI: {activePoint.rsi?.toFixed(1)}
                </span>
              )}
            </div>
          )}

          {/* SVG Canvas Area */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              touchAction: 'none',
              userSelect: 'none',
              background: '#070b14',
              padding: '8px 4px'
            }}
            onTouchMove={e => handleTouch(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchStart={e => handleTouch(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onMouseMove={e => handleTouch(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg
              viewBox={`0 0 ${W} ${H_TOTAL}`}
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
              preserveAspectRatio="none"
            >
              {/* Background Grid Lines */}
              {[0.2, 0.4, 0.6, 0.8].map((ratio, idx) => {
                const y = H_MAIN * ratio;
                const price = maxPrice - (ratio * priceRng);
                return (
                  <g key={idx}>
                    <line x1={LEFT_AXIS} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <text x={LEFT_AXIS - 6} y={y + 3.5} fill="rgba(255,255,255,0.35)" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
                      {price.toFixed(0)}
                    </text>
                  </g>
                );
              })}

              {/* Bollinger Bands Shading */}
              {showBollinger && (
                <>
                  <polygon
                    fill="rgba(6, 182, 212, 0.08)"
                    points={`
                      ${technicalData.filter(d => d.bbUpper != null).map((d, i) => `${getX(i)},${getY(d.bbUpper)}`).join(' ')}
                      ${technicalData.filter(d => d.bbLower != null).reverse().map((d, i) => {
                        const origIdx = technicalData.length - 1 - i;
                        return `${getX(origIdx)},${getY(d.bbLower)}`;
                      }).join(' ')}
                    `}
                  />
                  <polyline
                    fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="2 2"
                    points={technicalData.filter(d => d.bbUpper != null).map((d, i) => `${getX(i)},${getY(d.bbUpper)}`).join(' ')}
                  />
                  <polyline
                    fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="2 2"
                    points={technicalData.filter(d => d.bbLower != null).map((d, i) => `${getX(i)},${getY(d.bbLower)}`).join(' ')}
                  />
                </>
              )}

              {/* Candles or Line */}
              {chartMode === 'candle' ? (
                technicalData.map((d, i) => {
                  const x = getX(i);
                  const oY = getY(d.open || d.close);
                  const cY = getY(d.close);
                  const hY = getY(d.high || d.close);
                  const lY = getY(d.low || d.close);
                  const candleBull = (d.close >= (d.open || d.close));
                  const col = candleBull ? '#10d98a' : '#ef4444';
                  const topY = Math.min(oY, cY);
                  const bH = Math.max(2, Math.abs(cY - oY));
                  const bW = Math.max(2, Math.min(8, (PLOT_W / technicalData.length) * 0.7));

                  return (
                    <g key={i}>
                      {/* High-Low Wick */}
                      <line x1={x} y1={hY} x2={x} y2={lY} stroke={col} strokeWidth="1.2" />
                      {/* Candle Body */}
                      <rect x={x - bW / 2} y={topY} width={bW} height={bH} fill={col} rx="1" />
                    </g>
                  );
                })
              ) : (
                <>
                  {/* Line Chart Gradient Area */}
                  <defs>
                    <linearGradient id="advChartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10d98a" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10d98a" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <polygon
                    fill="url(#advChartGrad)"
                    points={`
                      ${LEFT_AXIS},${H_MAIN}
                      ${technicalData.map((d, i) => `${getX(i)},${getY(d.close)}`).join(' ')}
                      ${getX(technicalData.length - 1)},${H_MAIN}
                    `}
                  />
                  <polyline
                    fill="none" stroke="#10d98a" strokeWidth="2" strokeLinejoin="round"
                    points={technicalData.map((d, i) => `${getX(i)},${getY(d.close)}`).join(' ')}
                  />
                </>
              )}

              {/* Moving Averages Overlays */}
              {showSMA && (
                <>
                  <polyline
                    fill="none" stroke="#eab308" strokeWidth="1.2"
                    points={technicalData.filter(d => d.ma5 != null).map((d, i) => `${getX(i + 4)},${getY(d.ma5)}`).join(' ')}
                  />
                  <polyline
                    fill="none" stroke="#ec4899" strokeWidth="1.2"
                    points={technicalData.filter(d => d.ma10 != null).map((d, i) => `${getX(i + 9)},${getY(d.ma10)}`).join(' ')}
                  />
                  <polyline
                    fill="none" stroke="#06b6d4" strokeWidth="1.4"
                    points={technicalData.filter(d => d.ma20 != null).map((d, i) => `${getX(i + 19)},${getY(d.ma20)}`).join(' ')}
                  />
                </>
              )}

              {/* 50 SMA & 200 SMA (Long Term Trend) */}
              {showSMA200 && (
                <>
                  <polyline
                    fill="none" stroke="#3b82f6" strokeWidth="1.5"
                    points={technicalData.filter(d => d.ma50 != null).map((d, i) => `${getX(i + 49)},${getY(d.ma50)}`).join(' ')}
                  />
                  <polyline
                    fill="none" stroke="#a855f7" strokeWidth="1.8" strokeDasharray="4 2"
                    points={technicalData.filter(d => d.ma20 != null).map((d, i) => `${getX(i)},${getY(d.ma200 || d.close)}`).join(' ')}
                  />
                </>
              )}

              {/* Volume Subchart */}
              {showVolume && (
                <g>
                  <line x1={LEFT_AXIS} y1={H_MAIN} x2={W} y2={H_MAIN} stroke="rgba(255,255,255,0.12)" />
                  <text x={LEFT_AXIS - 6} y={H_MAIN + 12} fill="rgba(255,255,255,0.3)" fontSize="8" textAnchor="end">VOL</text>
                  {technicalData.map((d, i) => {
                    const x = getX(i);
                    const y = getVolY(d.volume || 1000);
                    const bW = Math.max(1.5, Math.min(6, (PLOT_W / technicalData.length) * 0.6));
                    const candleBull = (d.close >= (d.open || d.close));
                    return (
                      <rect
                        key={i}
                        x={x - bW / 2}
                        y={y}
                        width={bW}
                        height={(H_MAIN + H_VOL) - y}
                        fill={candleBull ? 'rgba(16, 217, 138, 0.4)' : 'rgba(239, 68, 68, 0.4)'}
                      />
                    );
                  })}
                </g>
              )}

              {/* RSI Subchart */}
              {showRSI && (
                <g>
                  <line x1={LEFT_AXIS} y1={H_MAIN + H_VOL} x2={W} y2={H_MAIN + H_VOL} stroke="rgba(255,255,255,0.12)" />
                  <line x1={LEFT_AXIS} y1={getRsiY(70)} x2={W} y2={getRsiY(70)} stroke="rgba(239,68,68,0.3)" strokeDasharray="2 2" />
                  <line x1={LEFT_AXIS} y1={getRsiY(30)} x2={W} y2={getRsiY(30)} stroke="rgba(16,217,138,0.3)" strokeDasharray="2 2" />
                  <text x={LEFT_AXIS - 6} y={getRsiY(50)} fill="rgba(236, 72, 153, 0.6)" fontSize="8" textAnchor="end">RSI</text>
                  <polyline
                    fill="none" stroke="#ec4899" strokeWidth="1.5"
                    points={technicalData.map((d, i) => `${getX(i)},${getRsiY(d.rsi || 50)}`).join(' ')}
                  />
                </g>
              )}

              {/* Interactive Crosshair Cursor */}
              {hoverIndex != null && (
                <g>
                  <line
                    x1={getX(hoverIndex)} y1={0} x2={getX(hoverIndex)} y2={H_TOTAL}
                    stroke="rgba(255,255,255,0.4)" strokeDasharray="3 3" strokeWidth="1"
                  />
                  <circle
                    cx={getX(hoverIndex)} cy={getY(technicalData[hoverIndex].close)}
                    r="4" fill="#10d98a" stroke="#fff" strokeWidth="1.5"
                  />
                </g>
              )}
            </svg>
          </div>

          {/* Bottom Timeframe Selector Bar */}
          <div style={{
            padding: '8px 14px calc(env(safe-area-inset-bottom, 0px) + 8px)',
            background: '#090d16',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            overflowX: 'auto',
            gap: 4
          }}>
            {[
              { id: '1D', label: '1D' },
              { id: '2D', label: '2D' },
              { id: '3D', label: '3D' },
              { id: '1W', label: '1W' },
              { id: '1M', label: '1M' },
              { id: '3M', label: '3M' },
              { id: '6M', label: '6M' },
              { id: '1Y', label: '1Y' },
              { id: '2Y', label: '2Y' },
              { id: 'All', label: 'All' }
            ].map(tf => {
              const isSelected = timeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  onClick={() => setTimeframe(tf.id)}
                  style={{
                    background: isSelected ? '#10d98a' : 'transparent',
                    color: isSelected ? '#000000' : 'rgba(255,255,255,0.65)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: isSelected ? '900' : '600',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
