import React, { useState, useMemo } from 'react';
import { Gauge, Compass, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import {
  detectCandlestickPatternsFromHistory,
  detectSingleStockPatterns,
  calculateTechnicalSpeedometer
} from '../utils/candlestickPatterns';

export default function StockTechnicalGaugeCard({ stock = {}, history = [] }) {
  const [gaugeMode, setGaugeMode] = useState('summary'); // 'summary' | 'ma' | 'osc'
  const [showIndicatorTable, setShowIndicatorTable] = useState(false);
  const [showAllPatterns, setShowAllPatterns] = useState(false);

  const speedometer = useMemo(() => {
    return calculateTechnicalSpeedometer(stock, history);
  }, [stock, history]);

  const patternTimeline = useMemo(() => {
    const fromHist = detectCandlestickPatternsFromHistory(history, stock);
    if (fromHist && fromHist.length > 0) return fromHist;
    const single = detectSingleStockPatterns(stock);
    const todayStr = stock?.businessDate || stock?.date || new Date().toISOString().slice(0, 10);
    return single.map(p => ({
      ...p,
      date: todayStr,
      closePrice: Number(stock?.ltp || stock?.close || 0),
      changePct: Number(stock?.pChange || 0)
    }));
  }, [stock, history]);

  const activeData = gaugeMode === 'ma'
    ? speedometer.maSummary
    : gaugeMode === 'osc'
      ? speedometer.oscSummary
      : speedometer.summary;

  const activeTotal = (activeData.buy + activeData.neutral + activeData.sell) || 1;
  const activeAngle = Math.max(-88, Math.min(88, Math.round(((activeData.buy - activeData.sell) / activeTotal) * 88)));

  const getRatingColor = (rating) => {
    if (rating === 'Strong Buy') return '#10b981';
    if (rating === 'Buy') return '#34d399';
    if (rating === 'Strong Sell') return '#f43f5e';
    if (rating === 'Sell') return '#fb7185';
    return '#f59e0b';
  };

  const ratingColor = getRatingColor(activeData.rating);

  // Convert needle angle (-90..+90) to SVG coordinates around center (120, 110) with radius 74
  const rad = ((activeAngle - 90) * Math.PI) / 180;
  const tipX = 120 + 70 * Math.cos(rad);
  const tipY = 110 + 70 * Math.sin(rad);

  const primaryPattern = patternTimeline[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── 1. Share Hub Technical Rating Speedometer Gauge Card ── */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Gauge style={{ width: 15, height: 15, color: '#10b981' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                Technical Rating Speedometer
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                12-Indicator Moving Averages & Oscillator Consensus
              </div>
            </div>
          </div>

          {/* Mode Tabs */}
          <div style={{
            display: 'flex',
            gap: 4,
            background: 'rgba(255,255,255,0.03)',
            padding: 3,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.07)'
          }}>
            {[
              { id: 'summary', label: 'Summary' },
              { id: 'osc', label: 'Oscillators' },
              { id: 'ma', label: 'Moving Avg' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setGaugeMode(tab.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 7,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: gaugeMode === tab.id ? '#0284c7' : 'transparent',
                  color: gaugeMode === tab.id ? '#ffffff' : '#94a3b8'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Semi-Circular Speedometer Dial */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0 10px' }}>
          <svg viewBox="0 0 240 132" style={{ width: '100%', maxWidth: 260, height: 135 }}>
            <defs>
              <linearGradient id="shGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="25%" stopColor="#fb7185" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="75%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Background Track Arc */}
            <path
              d="M 32 110 A 88 88 0 0 1 208 110"
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="16"
              strokeLinecap="round"
            />

            {/* Colored Speedometer Arc */}
            <path
              d="M 32 110 A 88 88 0 0 1 208 110"
              fill="none"
              stroke="url(#shGaugeGrad)"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Zone Labels around arc */}
            <text x="16" y="96" fontSize="8.5" fill="#f43f5e" fontWeight="700">Strong Sell</text>
            <text x="48" y="42" fontSize="8.5" fill="#fb7185" fontWeight="700">Sell</text>
            <text x="120" y="14" fontSize="8.5" fill="#f59e0b" fontWeight="700" textAnchor="middle">Neutral</text>
            <text x="184" y="42" fontSize="8.5" fill="#34d399" fontWeight="700">Buy</text>
            <text x="188" y="96" fontSize="8.5" fill="#10b981" fontWeight="700">Strong Buy</text>

            {/* Needle Line */}
            <line
              x1="120"
              y1="110"
              x2={tipX}
              y2={tipY}
              stroke="#f8fafc"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="120" cy="110" r="7" fill={ratingColor} stroke="#0f172a" strokeWidth="2.5" />
          </svg>

          <div style={{
            fontSize: 17,
            fontWeight: 900,
            color: ratingColor,
            letterSpacing: '0.02em',
            marginTop: -6
          }}>
            {activeData.rating.toUpperCase()}
          </div>
        </div>

        {/* Buy / Neutral / Sell Counter Pills */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          textAlign: 'center',
          marginBottom: 10
        }}>
          <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', borderRadius: 10, padding: '8px 6px' }}>
            <div style={{ fontSize: 11.5, color: '#fb7185', fontWeight: 700 }}>SELL</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#f43f5e', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {activeData.sell}
            </div>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 10, padding: '8px 6px' }}>
            <div style={{ fontSize: 11.5, color: '#fbbf24', fontWeight: 700 }}>NEUTRAL</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#f59e0b', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {activeData.neutral}
            </div>
          </div>
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: '8px 6px' }}>
            <div style={{ fontSize: 11.5, color: '#34d399', fontWeight: 700 }}>BUY</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {activeData.buy}
            </div>
          </div>
        </div>

        {/* Expandable Indicator Breakdown Button */}
        <button
          type="button"
          onClick={() => setShowIndicatorTable(prev => !prev)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#cbd5e1',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <span>{showIndicatorTable ? 'Hide Indicator Breakdown' : 'View All 12 Moving Average & Oscillator Signals'}</span>
          {showIndicatorTable ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
        </button>

        {showIndicatorTable && (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>INDICATOR</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>VALUE</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>SIGNAL</th>
                </tr>
              </thead>
              <tbody>
                {activeData.items.map((item, idx) => {
                  const col = item.action === 'Buy' ? '#10b981' : item.action === 'Sell' ? '#f43f5e' : '#f59e0b';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px', color: '#f8fafc', fontWeight: 600 }}>{item.label}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#cbd5e1', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{item.value}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          background: `${col}20`,
                          color: col
                        }}>
                          {item.action.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 2. Date-Wise 28-Candlestick Pattern Recognition Card (Share Hub SVG Assets) ── */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(168, 85, 247, 0.14)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Compass style={{ width: 15, height: 15, color: '#c084fc' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                Candlestick Pattern Recognition (Date-Wise)
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                28-Pattern Multi-Candle Scanner on Daily OHLC History
              </div>
            </div>
          </div>

          <span style={{
            fontSize: 11,
            fontWeight: 800,
            padding: '3px 9px',
            borderRadius: 12,
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8'
          }}>
            {patternTimeline.length} Patterns Found
          </span>
        </div>

        {primaryPattern ? (
          <>
            {/* Featured Latest Pattern Card with Authentic Share Hub SVG */}
            <div style={{
              background: primaryPattern.type === 'bullish'
                ? 'rgba(16, 185, 129, 0.07)'
                : primaryPattern.type === 'bearish'
                  ? 'rgba(244, 63, 94, 0.07)'
                  : 'rgba(56, 189, 248, 0.07)',
              border: `1px solid ${
                primaryPattern.type === 'bullish'
                  ? 'rgba(16, 185, 129, 0.28)'
                  : primaryPattern.type === 'bearish'
                    ? 'rgba(244, 63, 94, 0.28)'
                    : 'rgba(56, 189, 248, 0.28)'
              }`,
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 12
            }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: '#0B0E14',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: 4
                }}
                dangerouslySetInnerHTML={{ __html: primaryPattern.svg }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 900, color: '#ffffff' }}>
                    {primaryPattern.name} <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>({primaryPattern.nepaliName})</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: primaryPattern.type === 'bullish' ? 'rgba(16, 185, 129, 0.2)' : primaryPattern.type === 'bearish' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: primaryPattern.type === 'bullish' ? '#10b981' : primaryPattern.type === 'bearish' ? '#f43f5e' : '#fbbf24'
                    }}>
                      {primaryPattern.type.toUpperCase()} • {primaryPattern.candles}C
                    </span>
                    <span style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      📅 {primaryPattern.date}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, lineHeight: 1.45 }}>
                  {primaryPattern.description}
                </div>
                <div style={{ fontSize: 11.5, color: '#38bdf8', marginTop: 4, fontWeight: 700 }}>
                  🎯 Rule: {primaryPattern.actionableRule}
                </div>
              </div>
            </div>

            {/* Date-Wise Historical Pattern Log */}
            {patternTimeline.length > 1 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recent Date-Wise Candlestick Formations
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(showAllPatterns ? patternTimeline.slice(1, 12) : patternTimeline.slice(1, 5)).map((pat, idx) => {
                    const isBull = pat.type === 'bullish';
                    const isBear = pat.type === 'bearish';
                    return (
                      <div
                        key={`${pat.date}-${pat.id}-${idx}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 10,
                          fontSize: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{ width: 28, height: 28, flexShrink: 0 }}
                            dangerouslySetInnerHTML={{
                              __html: pat.svg.replace('width="64" height="64"', 'width="28" height="28"')
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 800, color: '#f8fafc' }}>{pat.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                              📅 {pat.date} • {pat.candles}-Candle {pat.reliability} Reliability
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: isBull ? 'rgba(16, 185, 129, 0.15)' : isBear ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: isBull ? '#10b981' : isBear ? '#f43f5e' : '#fbbf24'
                          }}>
                            {pat.type.toUpperCase()}
                          </span>
                          {pat.closePrice > 0 && (
                            <div style={{ fontSize: 11.5, color: '#cbd5e1', fontFamily: 'var(--font-mono)', marginTop: 2, fontWeight: 700 }}>
                              Rs. {Number(pat.closePrice).toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {patternTimeline.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllPatterns(prev => !prev)}
                    style={{
                      width: '100%',
                      marginTop: 8,
                      padding: '7px 12px',
                      borderRadius: 8,
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      color: '#38bdf8',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {showAllPatterns ? 'Show Less' : `View All ${patternTimeline.length} Date-Wise Patterns`}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '14px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
            Standard candle structure in the latest session — no extreme reversal pattern triggered.
          </div>
        )}
      </div>
    </div>
  );
}
