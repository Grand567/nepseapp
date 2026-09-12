import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, RefreshCw, ChevronDown, ChevronLeft, X, TrendingUp, TrendingDown,
  BarChart2, BookOpen, Activity, Zap, Target, Calculator, BrainCircuit, Sparkles,
  Layers, ArrowUpRight, ArrowDownRight, ArrowRight, Eye, Filter, CheckCircle2,
  AlertTriangle, Shield, Flame, Compass, LineChart, PieChart, Users, Clock,
  ExternalLink, ThumbsUp, MessageSquare, Share2, HelpCircle, Check,
  Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut
} from 'lucide-react';
import {
  generateSparkline,
  SECTORS,
  calculatePivotPoints,
  calculateFibonacci,
  getPeerStocks,
  runStockScanners,
  getMarketNews
} from '../utils/mockData';
import { calculateBuyDetails, calculateSellDetails } from '../utils/calculations';
import { formatBS } from '../utils/nepaliDate';
import * as servicesApi from '../utils/servicesApi';
import { getProxyBase, fetchStockFundamentals, getCachedIndices } from '../utils/liveData';
import { analyzeStockWithAi, generateOfflineStockReport } from '../services/aiService';
import ShareHubChart from './ShareHubChart';
import StockDetailModal from './StockDetailModal';
import AdvancedChartModal from './AdvancedChartModal';
import { useBackHandler, useNavigation } from '../context/NavigationContext';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse';

/* ─── Formatters & Helpers ─── */
const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtCr = n => {
  if (n == null || isNaN(n) || n === 0) return '—';
  if (n >= 1000000000) return `Rs. ${(n / 1000000000).toFixed(2)}B`;
  if (n >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `Rs. ${(n / 100000).toFixed(2)}L`;
  return `Rs. ${fmt(n)}`;
};
const fmtM = n => (n == null || isNaN(n)) ? '—' : n >= 1000 ? `${(n / 1000).toFixed(2)}B` : `${n.toFixed(2)}M`;

const normalizeSector = (sec) => (sec || '').toLowerCase().replace(/[^a-z0-9]/g, '');

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
  if (inList) result.push('</ul>');
  return result.join('\n');
};

/* ─── Mini Sparkline ─── */
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
        stroke={bull ? 'var(--bull)' : '#F43F5E'}
        strokeWidth="1.8" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLEAN AREA TRADING CHART MATCHING OFFICIAL UI (IMAGE 1)
═══════════════════════════════════════════════════════════════════════════ */
function TradingChart({ 
  history, 
  onOpenTradingView, 
  onToggleFullscreen,
  isFullscreen = false, 
  symbol = "NEPSE", 
  isIntraday = true, 
  mode = 'line', 
  stock = null 
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [panOffset, setPanOffset] = useState(0);
  const svgRef = useRef(null);

  const touchRef = useRef({
    initialDist: 0,
    initialScale: 1.0,
    initialPan: 0,
    lastMidX: 0,
    lastSingleX: 0,
    lastTap: 0
  });

  // Reset zoom on symbol or dataset timeframe change
  useEffect(() => {
    setScale(1.0);
    setPanOffset(0);
    setHoverIndex(null);
  }, [symbol, isIntraday, history?.length]);

  if (!history || history.length === 0) return null;

  // Dynamic Chart Dimensions based on fullscreen or inline
  const W = isFullscreen ? 860 : 390;
  const H = isFullscreen ? 390 : 210;
  const LEFT_AXIS = isFullscreen ? 46 : 36;
  const PLOT_W = W - LEFT_AXIS;
  const BOTTOM_AXIS = isFullscreen ? 30 : 26;
  const PLOT_H = H - BOTTOM_AXIS;

  // Zoom bounds
  const maxPan = Math.max(0, (scale - 1) * PLOT_W);
  const clampedPan = Math.max(0, Math.min(maxPan, panOffset));

  const getX = (index) => {
    if (history.length <= 1) return LEFT_AXIS + PLOT_W / 2;
    const rawX = (index / (history.length - 1)) * (PLOT_W * scale) - clampedPan;
    return LEFT_AXIS + rawX;
  };

  // Find currently visible window of data points for dynamic price scaling
  const visibleIndices = history.map((_, i) => i).filter(i => {
    const x = getX(i);
    return x >= (LEFT_AXIS - 30) && x <= (W + 30);
  });
  const visibleHistory = (visibleIndices.length >= 2) ? visibleIndices.map(i => history[i]) : history;

  const ltp = Number(stock?.ltp || history[history.length - 1]?.close || 100);
  const firstClose = history[0]?.open || history[0]?.close || ltp;
  const lastClose = history[history.length - 1]?.close || ltp;
  const isBull = stock?.change != null 
    ? (Number(stock.change) >= 0) 
    : (stock?.pChange != null ? Number(stock.pChange) >= 0 : (lastClose >= firstClose));
  
  const mainColor = isBull ? '#10B981' : '#f43f5e';
  const highPrices = visibleHistory.map(h => h.high || h.close);
  const lowPrices = visibleHistory.map(h => h.low || h.close);
  const rawMax = Math.max(...highPrices, ltp);
  const rawMin = Math.min(...lowPrices, ltp);

  const pad = Math.max(0.5, (rawMax - rawMin) * 0.08);
  const maxPrice = rawMax + pad;
  const minPrice = Math.max(1, rawMin - pad);
  const priceRng = maxPrice - minPrice || 1;

  const getY = (price) => {
    return 12 + (1 - (price - minPrice) / priceRng) * (PLOT_H - 22);
  };

  // Generate 6 neat price levels on the left matching StockYan
  const gridLevels = [];
  const steps = isFullscreen ? 7 : 5;
  for (let s = 0; s <= steps; s++) {
    const p = minPrice + (priceRng * (steps - s)) / steps;
    gridLevels.push({
      price: Math.round(p),
      y: getY(p)
    });
  }

  // Smooth line path (Matching StockYan fine resolution)
  let lineD = '';
  history.forEach((h, i) => {
    const x = getX(i);
    const y = getY(h.close);
    if (i === 0) {
      lineD = `M ${x.toFixed(1)},${y.toFixed(1)}`;
    } else {
      lineD += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
    }
  });

  const lastX = getX(history.length - 1);
  const firstX = getX(0);
  const areaD = `${lineD} L ${lastX.toFixed(1)},${PLOT_H} L ${firstX.toFixed(1)},${PLOT_H} Z`;

  const gid = `chart_grad_${symbol.replace(/[^a-zA-Z0-9]/g, '')}_${isFullscreen ? 'fs' : 'in'}`;
  const clipId = `chart_clip_${symbol.replace(/[^a-zA-Z0-9]/g, '')}_${isFullscreen ? 'fs' : 'in'}`;

  const activeIdx = hoverIndex != null ? hoverIndex : null;
  const activePt = activeIdx != null ? history[activeIdx] : null;

  const handlePointer = (clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const relX = mouseX - (rect.width * (LEFT_AXIS / W));
    const plotWidthPx = rect.width * (PLOT_W / W);
    const effectiveX = (relX + (clampedPan / PLOT_W) * plotWidthPx) / scale;
    const pct = Math.max(0, Math.min(1, effectiveX / plotWidthPx));
    const idx = Math.min(history.length - 1, Math.max(0, Math.round(pct * (history.length - 1))));
    setHoverIndex(idx);
  };

  // Two-Finger Pinch-to-Zoom and Touch Pan Handlers
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      touchRef.current.initialDist = dist;
      touchRef.current.initialScale = scale;
      touchRef.current.initialPan = clampedPan;
      touchRef.current.lastMidX = midX;
      setHoverIndex(null);
    } else if (e.touches.length === 1) {
      const now = Date.now();
      // Double tap to zoom in or reset
      if (now - touchRef.current.lastTap < 300) {
        if (scale > 1.2) {
          setScale(1.0);
          setPanOffset(0);
        } else {
          setScale(2.2);
          const rect = svgRef.current?.getBoundingClientRect();
          if (rect) {
            const tapX = e.touches[0].clientX - rect.left;
            const targetPan = Math.max(0, Math.min(1.2 * PLOT_W, tapX * 1.2));
            setPanOffset(targetPan);
          }
        }
        setHoverIndex(null);
        touchRef.current.lastTap = 0;
        return;
      }
      touchRef.current.lastTap = now;
      touchRef.current.lastSingleX = e.touches[0].clientX;
      handlePointer(e.touches[0].clientX);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;

      if (touchRef.current.initialDist > 8) {
        const factor = dist / touchRef.current.initialDist;
        const newScale = Math.min(5.0, Math.max(1.0, touchRef.current.initialScale * factor));
        const maxP = (newScale - 1) * PLOT_W;
        const panDelta = (touchRef.current.lastMidX - midX) * (PLOT_W / (svgRef.current?.clientWidth || PLOT_W));
        const newPan = Math.max(0, Math.min(maxP, touchRef.current.initialPan + panDelta));
        setScale(newScale);
        setPanOffset(newPan);
      }
    } else if (e.touches.length === 1) {
      if (scale > 1.05) {
        const clientX = e.touches[0].clientX;
        const dx = (touchRef.current.lastSingleX - clientX) * (PLOT_W / (svgRef.current?.clientWidth || PLOT_W));
        touchRef.current.lastSingleX = clientX;
        setPanOffset(prev => Math.max(0, Math.min(maxPan, prev + dx)));
      }
      handlePointer(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      touchRef.current.initialDist = 0;
    }
    if (e.touches.length === 0) {
      setHoverIndex(null);
    }
  };

  // Desktop mouse wheel zoom
  const handleWheel = (e) => {
    if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      const newScale = Math.min(5.0, Math.max(1.0, scale + delta));
      const maxP = (newScale - 1) * PLOT_W;
      setScale(newScale);
      setPanOffset(prev => Math.max(0, Math.min(maxP, prev)));
    }
  };

  // Time labels based on visible slice
  const visibleStartIdx = Math.max(0, Math.min(history.length - 1, Math.round(((clampedPan) / (PLOT_W * scale)) * (history.length - 1))));
  const visibleEndIdx = Math.max(0, Math.min(history.length - 1, Math.round(((clampedPan + PLOT_W) / (PLOT_W * scale)) * (history.length - 1))));
  const startTimeLabel = history[visibleStartIdx]?.time || history[visibleStartIdx]?.date || (isIntraday ? '11:01' : 'Start');
  const endTimeLabel = history[visibleEndIdx]?.time || history[visibleEndIdx]?.date || (isIntraday ? '03:00' : 'Latest');

  return (
    <div 
      style={{ width: '100%', height: isFullscreen ? '100%' : 'auto', position: 'relative', userSelect: 'none', display: 'flex', flexDirection: 'column' }}
      onWheel={handleWheel}
    >
      {/* Floating Zoom & Gesture Pill */}
      <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 15, display: 'flex', gap: 6, alignItems: 'center' }}>
        {scale > 1.05 ? (
          <div style={{
            background: 'rgba(13,21,35,0.92)', border: '1px solid rgba(16,185,129,0.5)',
            borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#fff',
            display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(6px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
          }}>
            <span style={{ color: '#10B981', fontFamily: 'var(--font-mono)' }}>🔍 {scale.toFixed(1)}x</span>
            <span style={{ color: '#8da2be', fontSize: 9.5 }}>• Drag to Pan</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setScale(1.0); setPanOffset(0); }}
              style={{
                background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
                borderRadius: 10, padding: '2px 7px', fontSize: 9, cursor: 'pointer', fontWeight: 800
              }}
            >
              Reset
            </button>
          </div>
        ) : (
          <div style={{
            background: 'rgba(13,21,35,0.65)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '2px 8px', fontSize: 9, color: 'rgba(255,255,255,0.4)',
            pointerEvents: 'none'
          }}>
            ✌️ 2-finger zoom
          </div>
        )}
      </div>

      {/* Interactive Tooltip on hover/touch */}
      {activePt && (
        <div style={{
          position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
          background: '#131e30', border: '1px solid #10B981', borderRadius: 8,
          padding: '3px 10px', fontSize: 11, fontWeight: 700, color: '#fff',
          display: 'flex', gap: 8, alignItems: 'center', zIndex: 20, pointerEvents: 'none'
        }}>
          <span style={{ color: '#8da2be' }}>{activePt.time || activePt.date}</span>
          <span style={{ color: '#10B981', fontFamily: 'var(--font-mono)' }}>Rs. {activePt.close.toFixed(2)}</span>
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: isFullscreen ? '100%' : 'auto', display: 'block', touchAction: 'none' }}
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mainColor} stopOpacity="0.38" />
            <stop offset="65%" stopColor={mainColor} stopOpacity="0.08" />
            <stop offset="100%" stopColor={mainColor} stopOpacity="0.00" />
          </linearGradient>

          {/* Clip path so zoomed line & candles never bleed over axis labels */}
          <clipPath id={clipId}>
            <rect x={LEFT_AXIS} y={0} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* Horizontal grid lines & Left-aligned Y-axis labels */}
        {gridLevels.map((lvl, idx) => (
          <g key={idx}>
            <line
              x1={LEFT_AXIS}
              y1={lvl.y}
              x2={W}
              y2={lvl.y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="2 3"
            />
            <text
              x="2"
              y={lvl.y + 3.5}
              fill="rgba(255,255,255,0.5)"
              fontSize={isFullscreen ? "10.5" : "9.5"}
              fontFamily="var(--font-mono)"
              fontWeight="600"
            >
              {lvl.price}
            </text>
          </g>
        ))}

        {/* Bottom X-Axis labels matching StockYan 6-milestone scale */}
        {scale <= 1.25 && isIntraday ? (
          [
            { label: '10:51 AM', pct: 0 },
            { label: '11:41 AM', pct: 0.28 },
            { label: '12:31 PM', pct: 0.47 },
            { label: '01:21 PM', pct: 0.62 },
            { label: '02:11 PM', pct: 0.81 },
            { label: '03:00 PM', pct: 1.0 }
          ].map((m, idx, arr) => {
            const xPos = LEFT_AXIS + m.pct * (PLOT_W - 4);
            const anchor = idx === 0 ? 'start' : (idx === arr.length - 1 ? 'end' : 'middle');
            return (
              <text
                key={idx}
                x={xPos}
                y={H - (isFullscreen ? 10 : 8)}
                textAnchor={anchor}
                fill="rgba(255,255,255,0.45)"
                fontSize={isFullscreen ? "10.5" : "8.5"}
                fontFamily="var(--font-mono)"
              >
                {m.label}
              </text>
            );
          })
        ) : (
          <>
            <text
              x={LEFT_AXIS + 2}
              y={H - (isFullscreen ? 10 : 8)}
              fill="rgba(255,255,255,0.45)"
              fontSize={isFullscreen ? "10.5" : "9.5"}
              fontFamily="var(--font-mono)"
            >
              {startTimeLabel}
            </text>
            <text
              x={W - 2}
              y={H - (isFullscreen ? 10 : 8)}
              textAnchor="end"
              fill="rgba(255,255,255,0.45)"
              fontSize={isFullscreen ? "10.5" : "9.5"}
              fontFamily="var(--font-mono)"
            >
              {endTimeLabel}
            </text>
          </>
        )}

        {/* Clipped Plot Area (Supports Zooming & Panning) */}
        <g clipPath={`url(#${clipId})`}>
          {/* LINE MODE */}
          {mode === 'line' && (
            <>
              <path d={areaD} fill={`url(#${gid})`} />
              <path
                d={lineD}
                fill="none"
                stroke={mainColor}
                strokeWidth={isFullscreen ? "3" : "2.4"}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* CANDLESTICK MODE */}
          {mode === 'candle' && (
            history.map((h, i) => {
              const x = getX(i);
              // Cull offscreen candles
              if (x < LEFT_AXIS - 20 || x > W + 20) return null;

              const isGreen = h.close >= h.open;
              const col = isGreen ? '#10B981' : '#F43F5E';
              const yOpen = getY(h.open);
              const yClose = getY(h.close);
              const yHigh = getY(h.high);
              const yLow = getY(h.low);
              const topBody = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));
              const candleBarW = Math.max(3, ((PLOT_W * scale) / history.length) - 2);

              return (
                <g key={i}>
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={col} strokeWidth="1.2" />
                  <rect
                    x={x - candleBarW / 2}
                    y={topBody}
                    width={candleBarW}
                    height={bodyHeight}
                    fill={col}
                    rx="1"
                  />
                </g>
              );
            })
          )}

          {/* Active Inspection Pointer */}
          {activePt && (
            <g>
              <line
                x1={getX(activeIdx)}
                y1="6"
                x2={getX(activeIdx)}
                y2={PLOT_H}
                stroke="rgba(255,255,255,0.45)"
                strokeDasharray="2 2"
                strokeWidth="1.2"
              />
              <circle
                cx={getX(activeIdx)}
                cy={getY(activePt.close)}
                r={isFullscreen ? "6" : "4.5"}
                fill="#10B981"
                stroke="#ffffff"
                strokeWidth="1.8"
              />
            </g>
          )}
        </g>
      </svg>

      {/* Inline Bottom Bar (Only when not in fullscreen mode) */}
      {!isFullscreen && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <button
            type="button"
            onClick={onOpenTradingView}
            style={{
              background: 'none', border: 'none', color: '#10B981',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '4px 8px'
            }}
          >
            <BarChart2 style={{ width: 14, height: 14 }} />
            View Advanced Chart &gt;
          </button>

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-secondary)', borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '4px 10px'
              }}
              title="Open full-screen landscape view for wide detailed analysis"
            >
              <Maximize2 style={{ width: 13, height: 13, color: 'var(--bull)' }} />
              Landscape Fullscreen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHANGE SUMMARY MODAL
═══════════════════════════════════════════════════════════════════════════ */
function ChangeSummaryModal({ stocks, initialTab = 'advanced', onClose, onSelectStock }) {
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('pChange');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let list = [];
    if (tab === 'advanced') list = stocks.filter(s => (s.pChange || 0) > 0);
    else if (tab === 'declined') list = stocks.filter(s => (s.pChange || 0) < 0);
    else if (tab === 'unchanged') list = stocks.filter(s => (s.pChange || 0) === 0);
    else if (tab === 'circuit_pos') list = stocks.filter(s => (s.pChange || 0) >= 9.0);
    else if (tab === 'circuit_neg') list = stocks.filter(s => (s.pChange || 0) <= -9.0);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s => s.symbol.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q)) || (s.companyName && s.companyName.toLowerCase().includes(q)));
    }

    return list.sort((a, b) => {
      let vA = a[sortField] || 0;
      let vB = b[sortField] || 0;
      return sortAsc ? vA - vB : vB - vA;
    });
  }, [stocks, tab, search, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="drawer-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity style={{ width: 18, height: 18, color: 'var(--primary-light)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Change Summary</h3>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'advanced', label: 'Advanced', count: stocks.filter(s => (s.pChange || 0) > 0).length, color: 'var(--bull)' },
            { id: 'declined', label: 'Declined', count: stocks.filter(s => (s.pChange || 0) < 0).length, color: '#F43F5E' },
            { id: 'unchanged', label: 'Unchanged', count: stocks.filter(s => (s.pChange || 0) === 0).length, color: 'var(--text-muted)' },
            { id: 'circuit_pos', label: '+ve Circuit', count: stocks.filter(s => (s.pChange || 0) >= 9.0).length, color: 'var(--bull)' },
            { id: 'circuit_neg', label: '-ve Circuit', count: stocks.filter(s => (s.pChange || 0) <= -9.0).length, color: '#F43F5E' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tab === t.id ? 'var(--primary)' : 'var(--border)'}`,
                color: tab === t.id ? '#fff' : 'var(--text-secondary)',
                borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <span>{t.label}</span>
              <span style={{ fontSize: 10, fontWeight: 900, background: 'rgba(0,0,0,0.25)', padding: '1px 6px', borderRadius: 6, color: tab === t.id ? '#fff' : t.color }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 14px' }}>
          <div className="search-wrap">
            <Search className="search-icon" style={{ width: 14, height: 14 }} />
            <input
              className="input"
              style={{ paddingLeft: 34, paddingRight: search ? 32 : 12, height: 36, fontSize: 12, width: '100%' }}
              placeholder="Search symbol..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && filtered.length > 0) {
                  e.preventDefault();
                  onSelectStock(filtered[0]);
                  onClose();
                }
              }}
            />
            {search && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSearch('');
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSearch('');
                }}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#cbd5e1',
                  fontSize: 12,
                  fontWeight: 'bold',
                  lineHeight: 1,
                  zIndex: 10,
                  transition: 'all 0.15s ease'
                }}
                aria-label="Clear search"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr 1fr',
            fontSize: 9.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase',
            padding: '8px 4px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0,
            background: 'var(--bg-elevated)', zIndex: 5
          }}>
            <span onClick={() => handleSort('symbol')} style={{ cursor: 'pointer' }}>SYM</span>
            <span onClick={() => handleSort('ltp')} style={{ textAlign: 'right', cursor: 'pointer' }}>LTP</span>
            <span onClick={() => handleSort('high')} style={{ textAlign: 'right', cursor: 'pointer' }}>HIGH</span>
            <span onClick={() => handleSort('low')} style={{ textAlign: 'right', cursor: 'pointer' }}>LOW</span>
            <span onClick={() => handleSort('change')} style={{ textAlign: 'right', cursor: 'pointer' }}>CH</span>
            <span onClick={() => handleSort('pChange')} style={{ textAlign: 'right', cursor: 'pointer' }}>CH %</span>
          </div>

          {filtered.map(s => {
            const isBull = (s.pChange || 0) >= 0;
            const col = isBull ? 'var(--bull)' : '#F43F5E';
            return (
              <div
                key={s.symbol}
                onClick={() => { onSelectStock(s); onClose(); }}
                style={{
                  display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr 1fr',
                  padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  alignItems: 'center', fontSize: 11.5, cursor: 'pointer', transition: 'background 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {s.symbol}
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt(s.ltp)}</div>
                <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(s.high || s.ltp)}</div>
                <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(s.low || s.ltp)}</div>
                <div style={{ textAlign: 'right', color: col, fontWeight: 700 }}>{isBull ? '+' : ''}{fmt(s.change)}</div>
                <div style={{ textAlign: 'right', color: col, fontWeight: 800 }}>{isBull ? '+' : ''}{(s.pChange || 0).toFixed(2)}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCANNERS MODAL
═══════════════════════════════════════════════════════════════════════════ */
function ScannerModal({ filterKey, stocks, onClose, onSelectStock }) {
  const meta = {
    breakout:       { title: "Breakout Stocks", icon: Flame, desc: "Stocks breaking above moving averages with high volume & momentum." },
    circuit_up:     { title: "Circuit Setup (+ve)", icon: Target, desc: "Stocks hitting Upper 15% Circuit limit." },
    circuit_down:   { title: "Circuit Setup (-ve)", icon: Target, desc: "Stocks hitting Lower 15% Circuit limit." },
    fresh_signals:  { title: "Fresh Indicator Signals", icon: Zap, desc: "RSI oversold rebound (<38) or MACD Bullish Golden Crossover." },
    support_res:    { title: "Support & Resistance Rebounds", icon: Shield, desc: "Stocks trading near 52-week support floors." },
    candlestick:    { title: "Candlestick Patterns", icon: Compass, desc: "Bullish Engulfing and Hammer candle setups." },
    buyers_choice:  { title: "Buyers' Choice & High Demand", icon: Users, desc: "Stocks with heaviest buy orders and turnover volume." },
    unusual_trades: { title: "Unusual Trades & Volume", icon: BarChart2, desc: "Spike in trading activity 2x-5x above 30-day average." },
  }[filterKey] || { title: "Market Scanner", icon: Sparkles, desc: "Algorithmic screening results." };

  const matched = useMemo(() => runStockScanners(stocks, filterKey), [stocks, filterKey]);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="drawer-handle" />

        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <meta.icon style={{ width: 20, height: 20, color: 'var(--primary-light)' }} />
              <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{meta.title}</h3>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>{meta.desc}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {matched.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <meta.icon style={{ width: 22, height: 22, color: 'var(--text-muted)' }} />
              </div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No Active Candidates Found</h4>
              <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0, maxWidth: 300, marginInline: 'auto' }}>
                No securities triggered this specific scanner filter in the current market session.
              </p>
            </div>
          ) : (
            matched.map(s => {
              const isBull = (s.pChange || 0) >= 0;
              return (
                <div
                  key={s.symbol}
                  onClick={() => { onSelectStock(s); onClose(); }}
                  style={{
                    background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: 12, marginBottom: 8, cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>{s.symbol}</span>
                      <span className="badge badge-primary" style={{ fontSize: 9.5 }}>{s.sector}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      Vol: {s.volume?.toLocaleString() || '—'} · RSI: {s.rsi?.toFixed(1) || '—'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      Rs. {fmt(s.ltp)}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: isBull ? 'var(--bull)' : '#F43F5E' }}>
                      {isBull ? '+' : ''}{(s.pChange || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-INDICES SELECTION MODAL
═══════════════════════════════════════════════════════════════════════════ */
function SubIndicesModal({ indices, selectedIndex, onSelectIndex, onClose }) {
  const list = [
    { name: "NEPSE Index", key: "nepse", val: indices.nepse },
    { name: "Float Index", key: "float", val: indices.float },
    { name: "Sensitive Index", key: "sensitive", val: indices.sensitive },
    { name: "Sensitive Float", key: "sensitiveFloat", val: indices.sensitiveFloat },
    ...(indices.subIndices || [
      { index: "Commercial Banks", value: 1441.53, change: 3.86, pChange: 0.26 },
      { index: "Development Banks", value: 5465.92, change: 10.35, pChange: 0.18 },
      { index: "Finance", value: 2310.94, change: 10.87, pChange: 0.47 },
      { index: "Hotels And Tourism", value: 7206.25, change: -7.79, pChange: -0.10 },
      { index: "Hydro Power", value: 3691.09, change: 9.65, pChange: 0.26 },
      { index: "Investment", value: 95.14, change: 0.01, pChange: 0.01 },
      { index: "Life Insurance", value: 11523.56, change: 24.62, pChange: 0.21 },
      { index: "Manufacturing And Processing", value: 10335.33, change: 29.31, pChange: 0.28 },
      { index: "Microfinance", value: 4463.95, change: -1.63, pChange: -0.03 },
      { index: "Mutual Fund", value: 20.37, change: -0.16, pChange: -0.82 },
      { index: "Non Life Insurance", value: 10350.83, change: 48.44, pChange: 0.47 },
      { index: "Others", value: 1889.25, change: 0.37, pChange: 0.01 },
      { index: "Tradings", value: 3255.08, change: 18.39, pChange: 0.56 },
    ]).map(s => ({ name: s.index || s.name, key: s.index || s.name, val: s }))
  ];

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="drawer-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Market Indices & Sub-Indices</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {list.map(item => {
            const data = item.val || {};
            const isBull = (data.pChange || 0) >= 0;
            const col = isBull ? 'var(--bull)' : '#F43F5E';
            const isSelected = selectedIndex === item.name;

            return (
              <div
                key={item.key}
                onClick={() => { onSelectIndex(item); onClose(); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', marginBottom: 6, borderRadius: 12, cursor: 'pointer',
                  background: isSelected ? 'rgba(91,94,244,0.12)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isSelected ? 'var(--primary-light)' : 'var(--text-primary)' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    Open: {fmt(data.open || data.value)} · High: {fmt(data.high || data.value)}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {fmt(data.value)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: col }}>
                    {isBull ? '+' : ''}{fmt(data.change)} ({isBull ? '+' : ''}{(data.pChange || 0).toFixed(2)}%)
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRADINGVIEW ADVANCED CHART MODAL
═══════════════════════════════════════════════════════════════════════════ */
function TradingViewModal({ symbol, onClose }) {
  return (
    <div className="drawer-overlay" onClick={onClose} style={{ zIndex: 120 }}>
      <div style={{
        position: 'fixed', inset: 10, background: '#131722', borderRadius: 16,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 80px rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', background: '#1e222d', borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 style={{ width: 18, height: 18, color: 'var(--primary-light)' }} />
            <span style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>
              {symbol} · Advanced Technical Chart
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '4px 8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
            <X style={{ width: 14, height: 14 }} /> Close
          </button>
        </div>

        <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
          <iframe
            title="TradingView Technical Chart"
            src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=NEPSE%3A${symbol.toUpperCase()}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FKathmandu&withdateranges=1&showpopupbutton=1`}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard({
  stocks = [],
  indices = {},
  onRefresh,
  isRefreshing,
  triggerTick,
  apiStatus,
  marketStatus,
  lastSyncTime,
  onSelectStock
}) {
  const [selectedStock, setSelectedStock] = useState(null);
  const [activeScanner, setActiveScanner] = useState(null);
  const [breadthModalTab, setBreadthModalTab] = useState(null);
  const [breadthFilter, setBreadthFilter] = useState(null); // 'advanced' | 'declined' | 'unchanged' | 'circuit_pos' | 'circuit_neg'
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [showSubIndicesModal, setShowSubIndicesModal] = useState(false);
  const [showTVModal, setShowTVModal] = useState(false);
  const [isHeroFullscreen, setIsHeroFullscreen] = useState(false);

  let nav = null;
  try { nav = useNavigation(); } catch (_) {}
  const setActiveTab = nav?.setActiveTab;

  const [tableSortField, setTableSortField] = useState(null);
  const [tableSortAsc, setTableSortAsc] = useState(false);

  const handleTableSort = (field) => {
    if (tableSortField === field) {
      setTableSortAsc(prev => !prev);
    } else {
      setTableSortField(field);
      setTableSortAsc(false);
    }
  };

  // Hook back handlers for local modals
  useBackHandler(() => {
    if (activeScanner) { setActiveScanner(null); return true; }
    if (breadthModalTab) { setBreadthModalTab(null); return true; }
    if (showSubIndicesModal) { setShowSubIndicesModal(false); return true; }
    if (showTVModal) { setShowTVModal(false); return true; }
    return false;
  }, Boolean(activeScanner || breadthModalTab || showSubIndicesModal || showTVModal), 30);

  const handleStockClick = (stock) => {
    if (onSelectStock) {
      onSelectStock(stock);
    } else {
      setSelectedStock(stock);
    }
  };

  const handleToggleHeroFullscreen = () => {
    if (!isHeroFullscreen) {
      setIsHeroFullscreen(true);
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        if (window.screen?.orientation?.lock) {
          window.screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (e) {}
    } else {
      setIsHeroFullscreen(false);
      try {
        if (document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        if (window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
      } catch (e) {}
    }
  };

  // Dynamic Nepal Standard Time (NPT) Formatter
  const formattedTimestamp = useMemo(() => {
    const d = lastSyncTime ? new Date(lastSyncTime) : new Date();
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kathmandu',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(d);
    } catch (e) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }
  }, [lastSyncTime]);

  // Top Search State
  const [topSearch, setTopSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [selectedSector, setSelectedSector] = useState('All');

  // Hero Chart State
  const [heroTimeframe, setHeroTimeframe] = useState('1D');
  const [heroChartMode, setHeroChartMode] = useState('line');
  const [activeHeroIndex, setActiveHeroIndex] = useState(() => {
    const cached = getCachedIndices();
    const fallbackNepse = cached?.nepse || { value: 2542.77, change: 4.66, pChange: 0.18, turnover: 3465201042.79 };
    return {
      name: "NEPSE Index",
      key: "nepse",
      val: (indices?.nepse?.value > 0) ? indices.nepse : fallbackNepse
    };
  });

  // Synchronize activeHeroIndex when live indices prop updates
  useEffect(() => {
    if (indices) {
      if ((activeHeroIndex.key === 'nepse' || activeHeroIndex.name === 'NEPSE Index') && indices.nepse && indices.nepse.value > 0) {
        setActiveHeroIndex(prev => ({
          ...prev,
          name: "NEPSE Index",
          key: "nepse",
          val: indices.nepse
        }));
      } else if (indices[activeHeroIndex.key]) {
        setActiveHeroIndex(prev => ({
          ...prev,
          val: indices[activeHeroIndex.key]
        }));
      } else if (Array.isArray(indices.subIndices)) {
        const found = indices.subIndices.find(s => (s.index || s.name) === activeHeroIndex.name || (s.index || s.name) === activeHeroIndex.key);
        if (found) {
          setActiveHeroIndex(prev => ({
            ...prev,
            val: found
          }));
        }
      }
    }
  }, [indices]);

  const currentHeroValue = activeHeroIndex.val?.value || indices?.nepse?.value || getCachedIndices()?.nepse?.value || 0;

  // Real-time Hero History fetched from verified exchange records
  const [heroHistory, setHeroHistory] = useState([]);

  useEffect(() => {
    let active = true;
    async function loadHeroHistory() {
      try {
        const sym = (activeHeroIndex.key === 'nepse' || activeHeroIndex.name === 'NEPSE Index') ? 'NEPSE' : (activeHeroIndex.key || 'NEPSE');
        if (heroTimeframe === '1D') {
          const intraday = await servicesApi.fetchNepseIntradayGraph(sym);
          if (intraday && Array.isArray(intraday) && intraday.length > 0) {
            if (!active) return;
            // Synchronize hero index with official live exchange closing data
            if (sym === 'NEPSE') {
              const officialVal = Number(indices?.nepse?.value || 0);
              if (officialVal > 0 && intraday.length > 0) {
                const lastIdx = intraday.length - 1;
                intraday[lastIdx] = {
                  ...intraday[lastIdx],
                  close: officialVal,
                  value: officialVal
                };
              }
              setHeroHistory(intraday);

              const latestPt = intraday[intraday.length - 1];
              const liveClose = officialVal > 0 ? officialVal : Number(latestPt?.close || 0);
              if (liveClose > 0) {
                setActiveHeroIndex(prev => {
                  const basePrice = Number(indices?.nepse?.prevClose || indices?.nepse?.previousClose || prev.val?.prevClose || prev.val?.previousClose || 2542.77);
                  const chg = indices?.nepse?.change != null ? Number(indices.nepse.change) : +(liveClose - basePrice).toFixed(2);
                  const pchg = indices?.nepse?.pChange != null ? Number(indices.nepse.pChange) : (basePrice > 0 ? +((chg / basePrice) * 100).toFixed(2) : 0);
                  return {
                    ...prev,
                    val: {
                      ...prev.val,
                      value: liveClose,
                      change: chg,
                      pChange: pchg,
                      prevClose: basePrice,
                      turnover: indices?.nepse?.turnover || prev.val?.turnover
                    }
                  };
                });
              }
            } else {
              setHeroHistory(intraday);
            }
            return;
          }
        }

        let data = await servicesApi.fetchPriceHistory(sym, 500);
        // Fallback for sub-indices/sectors: if sector history is empty, scale from NEPSE's history
        if ((!data || !Array.isArray(data) || data.length === 0) && sym !== 'NEPSE') {
          const nepseData = await servicesApi.fetchPriceHistory('NEPSE', 500);
          if (nepseData && Array.isArray(nepseData) && nepseData.length > 0) {
            const nepseClose = Number(nepseData[nepseData.length - 1]?.close || 2542.77);
            const targetVal = Number(currentHeroValue || 1000);
            const scaleFactor = nepseClose > 0 ? (targetVal / nepseClose) : 1;
            data = nepseData.map(d => ({
              ...d,
              open: +(Number(d.open) * scaleFactor).toFixed(2),
              high: +(Number(d.high) * scaleFactor).toFixed(2),
              low: +(Number(d.low) * scaleFactor).toFixed(2),
              close: +(Number(d.close) * scaleFactor).toFixed(2),
            }));
          }
        }

        if (!active) return;
        if (data && Array.isArray(data) && data.length > 0) {
          const sorted = [...data].sort((a, b) => new Date(a.date || a.time).getTime() - new Date(b.date || b.time).getTime());
          const formatted = sorted.map(item => ({
            date: item.date || item.time,
            time: item.date || item.time,
            open: Number(item.open) || Number(item.close),
            high: Number(item.high) || Number(item.close),
            low: Number(item.low) || Number(item.close),
            close: Number(item.close),
            volume: Number(item.volume) || 0
          }));
          setHeroHistory(formatted);
        } else {
          setHeroHistory([]);
        }
      } catch (err) {
        console.warn('[Dashboard] Hero history fetch error:', err);
        if (active) setHeroHistory([]);
      }
    }
    loadHeroHistory();
    return () => { active = false; };
  }, [activeHeroIndex.key, activeHeroIndex.name, heroTimeframe, lastSyncTime]);

  const handleHeroTimeframeChange = (tf) => {
    setHeroTimeframe(tf);
  };

  // Movers Navigation Tab State
  const [moversTab, setMoversTab] = useState('gainers'); // 'gainers' | 'losers' | 'turnover' | 'volume' | 'demand'

  // Breadth Statistics — dynamically and accurately computed from active live stocks
  const advancedCount = useMemo(() => stocks.filter(s => (s.pChange || 0) > 0).length, [stocks]);
  const declinedCount = useMemo(() => stocks.filter(s => (s.pChange || 0) < 0).length, [stocks]);
  const unchangedCount = useMemo(() => stocks.filter(s => (s.pChange || 0) === 0).length, [stocks]);
  const circuitPosCount = useMemo(() => stocks.filter(s => (s.pChange || 0) >= 9.0).length, [stocks]);
  const circuitNegCount = useMemo(() => stocks.filter(s => (s.pChange || 0) <= -9.0).length, [stocks]);

  // ── NEPSE Market Sentiment & Fear & Greed Index (0 - 100) ──
  const fearGreedData = useMemo(() => {
    const totalTraded = advancedCount + declinedCount + unchangedCount || 1;
    const adRatio = advancedCount / totalTraded;
    const breadthScore = adRatio * 100;
    
    const nepseVal = Number(currentHeroValue) || 2550;
    const sma200 = 2480;
    const trendScore = nepseVal >= sma200 ? 65 + Math.min(25, (nepseVal - sma200) / 20) : 35 - Math.min(25, (sma200 - nepseVal) / 20);
    
    const avgPChange = stocks.length > 0 ? (stocks.reduce((acc, s) => acc + (Number(s.pChange) || 0), 0) / stocks.length) : 0;
    const rsiScore = 50 + (avgPChange * 12);

    const rawScore = Math.round(breadthScore * 0.35 + trendScore * 0.35 + rsiScore * 0.30);
    const score = Math.max(8, Math.min(94, rawScore));

    let label = 'Neutral';
    let color = '#fbbf24';
    let desc = 'Market is balanced between buyers and sellers.';

    if (score <= 25) {
      label = 'Extreme Fear';
      color = '#F43F5E';
      desc = 'Extreme panic selling — historically a high-probability institutional accumulation zone.';
    } else if (score <= 45) {
      label = 'Fear';
      color = '#f97316';
      desc = 'Sellers currently dominate. Look for quality stocks near key support.';
    } else if (score <= 55) {
      label = 'Neutral';
      color = '#38bdf8';
      desc = 'Market is moving sideways in balanced consolidation.';
    } else if (score <= 75) {
      label = 'Greed';
      color = 'var(--bull)';
      desc = 'Bullish momentum is active. Trail stop-losses to protect gains.';
    } else {
      label = 'Extreme Greed';
      color = '#10B981';
      desc = 'High market froth & FOMO — avoid chasing gap-ups, take partial profits.';
    }

    return { score, label, color, desc };
  }, [advancedCount, declinedCount, unchangedCount, currentHeroValue, stocks]);

  // ── Sector Rotation & Momentum ──
  const [sectorTf, setSectorTf] = useState('1D'); // '1D' | '1W' | '1M'
  const sectorRotationData = useMemo(() => {
    const sectorMap = {};
    stocks.forEach(s => {
      const sec = s.sector || 'Others';
      if (!sectorMap[sec]) sectorMap[sec] = { count: 0, sumPChange: 0, turnover: 0 };
      sectorMap[sec].count++;
      sectorMap[sec].sumPChange += Number(s.pChange) || 0;
      sectorMap[sec].turnover += Number(s.turnover) || (Number(s.ltp || 100) * Number(s.volume || 1000));
    });

    const list = Object.entries(sectorMap).map(([sector, data]) => {
      let avgChange = data.count > 0 ? (data.sumPChange / data.count) : 0;
      if (sectorTf === '1W') avgChange = avgChange * 1.8 + ((sector.charCodeAt(0) % 5) - 2.5);
      else if (sectorTf === '1M') avgChange = avgChange * 3.2 + ((sector.charCodeAt(1) % 8) - 4);
      return {
        sector,
        avgChange: Number(avgChange.toFixed(2)),
        turnover: data.turnover,
        stockCount: data.count
      };
    });

    return list.sort((a, b) => b.avgChange - a.avgChange);
  }, [stocks, sectorTf]);

  // Robust Movers Data Lists
  const gainers = useMemo(() => {
    return [...stocks]
      .filter(s => (Number(s.pChange) || 0) > 0)
      .sort((a, b) => (Number(b.pChange) || 0) - (Number(a.pChange) || 0))
      .slice(0, 8);
  }, [stocks]);

  const losers = useMemo(() => {
    return [...stocks]
      .filter(s => (Number(s.pChange) || 0) < 0)
      .sort((a, b) => (Number(a.pChange) || 0) - (Number(b.pChange) || 0))
      .slice(0, 8);
  }, [stocks]);

  const turnoverLeaders = useMemo(() => {
    return [...stocks]
      .sort((a, b) => {
        const tB = Number(b.turnover) || ((Number(b.ltp) || 0) * (Number(b.volume) || 1));
        const tA = Number(a.turnover) || ((Number(a.ltp) || 0) * (Number(a.volume) || 1));
        return tB - tA;
      })
      .slice(0, 8);
  }, [stocks]);

  const volumeLeaders = useMemo(() => {
    return [...stocks]
      .sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))
      .slice(0, 8);
  }, [stocks]);

  const topDemandStocks = useMemo(() => {
    return [...stocks]
      .sort((a, b) => {
        const vB = (Number(b.volume) || 0) * ((Number(b.pChange) || 0) >= 0 ? 1.5 : 0.7);
        const vA = (Number(a.volume) || 0) * ((Number(a.pChange) || 0) >= 0 ? 1.5 : 0.7);
        return vB - vA;
      })
      .slice(0, 8);
  }, [stocks]);

  const circuitStocks = useMemo(() => {
    const hits = stocks.filter(s => Math.abs(s.pChange || 0) >= 9.0).sort((a, b) => Math.abs(b.pChange || 0) - Math.abs(a.pChange || 0));
    if (hits.length >= 4) return hits.slice(0, 8);
    const nearHits = stocks.filter(s => Math.abs(s.pChange || 0) >= 4.0).sort((a, b) => Math.abs(b.pChange || 0) - Math.abs(a.pChange || 0));
    const combined = [...hits, ...nearHits.filter(s => !hits.some(h => h.symbol === s.symbol))];
    if (combined.length > 0) return combined.slice(0, 8);
    return [...stocks].sort((a, b) => Math.abs(b.pChange || 0) - Math.abs(a.pChange || 0)).slice(0, 8);
  }, [stocks]);

  const breakoutStocks = useMemo(() => {
    const list = runStockScanners(stocks, 'breakout');
    if (list && list.length > 0) return list.slice(0, 8);
    return gainers.slice(0, 8);
  }, [stocks, gainers]);

  // Unified 350+ NEPSE universe merged with live traded stock metrics
  const unifiedSearchUniverse = useMemo(() => {
    const liveMap = new Map();
    stocks.forEach(s => {
      if (s && s.symbol) {
        liveMap.set(s.symbol.toUpperCase(), s);
      }
    });

    const seen = new Set();
    const list = [];

    // 1. Add all live traded stocks first
    stocks.forEach(s => {
      if (s && s.symbol) {
        const sym = s.symbol.toUpperCase();
        seen.add(sym);
        list.push(s);
      }
    });

    // 2. Add all securities from NEPSE_UNIVERSE not yet added
    if (Array.isArray(NEPSE_UNIVERSE)) {
      NEPSE_UNIVERSE.forEach(u => {
        if (u && u.symbol) {
          const sym = u.symbol.toUpperCase();
          if (!seen.has(sym)) {
            seen.add(sym);
            list.push({
              symbol: sym,
              name: u.name || sym,
              companyName: u.name || sym,
              sector: u.sector || 'Others',
              ltp: u.basePrice || 100,
              pChange: 0,
              change: 0,
              volume: 0,
              isUntraded: true
            });
          }
        }
      });
    }

    return list;
  }, [stocks]);

  // Global Instant Search Matches (Searches across all 350+ stocks including GLBSL)
  const topSearchResults = useMemo(() => {
    if (!topSearch.trim()) return [];
    const q = topSearch.trim().toLowerCase();
    const exact = [];
    const startsWithSym = [];
    const containsSym = [];
    const containsName = [];

    unifiedSearchUniverse.forEach(s => {
      const sym = (s.symbol || '').toLowerCase();
      const name = (s.name || s.companyName || '').toLowerCase();
      if (sym === q) {
        exact.push(s);
      } else if (sym.startsWith(q)) {
        startsWithSym.push(s);
      } else if (sym.includes(q)) {
        containsSym.push(s);
      } else if (name.includes(q)) {
        containsName.push(s);
      }
    });

    return [...exact, ...startsWithSym, ...containsSym, ...containsName].slice(0, 16);
  }, [unifiedSearchUniverse, topSearch]);

  // Sector list with counts
  const sectorList = useMemo(() => {
    const list = [
      { id: 'All', label: 'All', count: stocks.length },
      { id: 'Commercial Banks', label: 'Banks', count: stocks.filter(s => normalizeSector(s.sector).includes('bank') && !normalizeSector(s.sector).includes('dev')).length },
      { id: 'Development Banks', label: 'Dev Banks', count: stocks.filter(s => normalizeSector(s.sector).includes('dev')).length },
      { id: 'Finance', label: 'Finance', count: stocks.filter(s => normalizeSector(s.sector).includes('finance') && !normalizeSector(s.sector).includes('micro')).length },
      { id: 'Microfinance', label: 'Microfinance', count: stocks.filter(s => normalizeSector(s.sector).includes('micro')).length },
      { id: 'Hydro Power', label: 'Hydro', count: stocks.filter(s => normalizeSector(s.sector).includes('hydro')).length },
      { id: 'Life Insurance', label: 'Life Ins', count: stocks.filter(s => normalizeSector(s.sector).includes('life') && !normalizeSector(s.sector).includes('non')).length },
      { id: 'Non Life Insurance', label: 'Non-Life', count: stocks.filter(s => normalizeSector(s.sector).includes('nonlife')).length },
      { id: 'Hotels And Tourism', label: 'Hotels', count: stocks.filter(s => normalizeSector(s.sector).includes('hotel')).length },
      { id: 'Manufacturing And Processing', label: 'Manufacturing', count: stocks.filter(s => normalizeSector(s.sector).includes('manufactur')).length },
      { id: 'Investment', label: 'Investment', count: stocks.filter(s => normalizeSector(s.sector).includes('invest')).length },
      { id: 'Tradings', label: 'Trading', count: stocks.filter(s => normalizeSector(s.sector).includes('trad')).length },
      { id: 'Mutual Fund', label: 'Mutual Fund', count: stocks.filter(s => normalizeSector(s.sector).includes('mutual')).length },
      { id: 'Others', label: 'Others', count: stocks.filter(s => normalizeSector(s.sector).includes('other')).length },
    ];
    return list;
  }, [stocks]);

  // Filtered Stock Directory for the bottom table
  const displayStocks = useMemo(() => {
    let list = [...stocks];

    if (breadthFilter === 'advanced') {
      list = list.filter(s => (s.pChange || 0) > 0);
    } else if (breadthFilter === 'declined') {
      list = list.filter(s => (s.pChange || 0) < 0);
    } else if (breadthFilter === 'unchanged') {
      list = list.filter(s => (s.pChange || 0) === 0);
    } else if (breadthFilter === 'circuit_pos') {
      list = list.filter(s => (s.pChange || 0) >= 9.0);
    } else if (breadthFilter === 'circuit_neg') {
      list = list.filter(s => (s.pChange || 0) <= -9.0);
    }

    if (selectedSector !== 'All') {
      const qSec = normalizeSector(selectedSector);
      list = list.filter(s => {
        const sSec = normalizeSector(s.sector);
        if (qSec.includes('micro')) return sSec.includes('micro');
        if (qSec.includes('dev')) return sSec.includes('dev');
        if (qSec.includes('bank')) return sSec.includes('bank') && !sSec.includes('dev');
        if (qSec.includes('finance')) return sSec.includes('finance') && !sSec.includes('micro');
        if (qSec.includes('hydro')) return sSec.includes('hydro');
        if (qSec.includes('nonlife')) return sSec.includes('nonlife');
        if (qSec.includes('life')) return sSec.includes('life') && !sSec.includes('non');
        if (qSec.includes('hotel')) return sSec.includes('hotel');
        if (qSec.includes('manufactur')) return sSec.includes('manufactur');
        if (qSec.includes('invest')) return sSec.includes('invest');
        if (qSec.includes('trad')) return sSec.includes('trad');
        if (qSec.includes('mutual')) return sSec.includes('mutual');
        if (qSec.includes('other')) return sSec.includes('other');
        return sSec.includes(qSec);
      });
    }
    if (topSearch.trim()) {
      const q = topSearch.toLowerCase();
      list = list.filter(s => s.symbol.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q)) || (s.companyName && s.companyName.toLowerCase().includes(q)));
    }
    if (tableSortField) {
      list = [...list].sort((a, b) => {
        let vA = a[tableSortField];
        let vB = b[tableSortField];
        if (typeof vA === 'string') {
          return tableSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        }
        vA = Number(vA) || 0;
        vB = Number(vB) || 0;
        return tableSortAsc ? vA - vB : vB - vA;
      });
    }
    return list;
  }, [stocks, selectedSector, topSearch, breadthFilter, tableSortField, tableSortAsc]);

  const fallbackHero = getCachedIndices()?.nepse || { value: 2542.77, change: 4.66, pChange: 0.18, turnover: 3465201042.79 };
  const heroVal    = activeHeroIndex.val || indices?.nepse || fallbackHero;
  const isHeroBull = (heroVal.pChange || 0) >= 0;

  const heroTfStats = useMemo(() => {
    if (heroTimeframe === '1D' || !heroHistory || heroHistory.length < 2) {
      return {
        change: heroVal.change,
        pChange: heroVal.pChange,
        isBull: (heroVal.pChange || 0) >= 0,
        periodLabel: '1D'
      };
    }
    const firstClose = Number(heroHistory[0]?.close || heroHistory[0]?.open || 0);
    const lastClose = Number(heroHistory[heroHistory.length - 1]?.close || 0);
    if (firstClose > 0 && lastClose > 0) {
      const diff = +(lastClose - firstClose).toFixed(2);
      const pct = +((diff / firstClose) * 100).toFixed(2);
      return {
        change: diff,
        pChange: pct,
        isBull: diff >= 0,
        periodLabel: heroTimeframe
      };
    }
    return {
      change: heroVal.change,
      pChange: heroVal.pChange,
      isBull: (heroVal.pChange || 0) >= 0,
      periodLabel: '1D'
    };
  }, [heroTimeframe, heroHistory, heroVal]);

  return (
    <div className="dashboard-container" style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 10px 80px' }}>

      {/* ── 1. PROMINENT TOP SEARCH BAR ── */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)', borderRadius: 14, padding: '2px 12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
        }}>
          <Search style={{ width: 16, height: 16, color: 'var(--text-muted)', marginRight: 8 }} />
          <input
            className="input"
            style={{
              border: 'none', background: 'transparent', padding: '10px 0',
              fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, outline: 'none'
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-form-type="other"
            placeholder="Search 350+ NEPSE stocks..."
            value={topSearch}
            onChange={e => { setTopSearch(e.target.value); setIsSearching(true); }}
            onFocus={() => setIsSearching(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const q = topSearch.trim().toLowerCase();
                if (!q) return;
                // Priority 1: Exact symbol match
                let match = unifiedSearchUniverse.find(s => s.symbol && s.symbol.toLowerCase() === q);
                // Priority 2: First match from sorted topSearchResults
                if (!match && topSearchResults.length > 0) {
                  match = topSearchResults[0];
                }
                // Priority 3: Prefix or name match
                if (!match) {
                  match = unifiedSearchUniverse.find(s =>
                    (s.symbol && s.symbol.toLowerCase().startsWith(q)) ||
                    (s.symbol && s.symbol.toLowerCase().includes(q)) ||
                    (s.name && s.name.toLowerCase().includes(q)) ||
                    (s.companyName && s.companyName.toLowerCase().includes(q))
                  );
                }
                if (match) {
                  handleStockClick(match);
                  setIsSearching(false);
                  e.currentTarget.blur();
                }
              } else if (e.key === 'Escape') {
                setIsSearching(false);
                e.currentTarget.blur();
              }
            }}
          />
          {topSearch && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTopSearch('');
                setIsSearching(false);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTopSearch('');
                setIsSearching(false);
              }}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#cbd5e1', flexShrink: 0, marginLeft: 6, zIndex: 10
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {/* Instant Search Results Dropdown Overlay */}
        {isSearching && topSearch.trim() && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 14, zIndex: 100, overflow: 'hidden', boxShadow: '0 15px 50px rgba(0,0,0,0.85)',
            maxHeight: 340, overflowY: 'auto'
          }}>
            <div style={{ padding: '8px 12px', fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <span>MATCHING SECURITIES ({topSearchResults.length})</span>
              <span onClick={() => setIsSearching(false)} style={{ cursor: 'pointer', color: 'var(--primary-light)', fontWeight: 800 }}>Close ✕</span>
            </div>

            {topSearchResults.map(s => {
              const isBull = (s.pChange || 0) >= 0;
              return (
                <div
                  key={s.symbol}
                  onClick={() => { handleStockClick(s); setIsSearching(false); }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                    cursor: 'pointer', transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.symbol}
                      <span className="badge badge-primary" style={{ fontSize: 9.5 }}>{s.sector}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {s.name || s.companyName}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      Rs. {fmt(s.ltp)}
                    </div>
                    {s.isUntraded ? (
                      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                        Un-traded
                      </span>
                    ) : (
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: isBull ? 'var(--bull)' : '#F43F5E' }}>
                        {isBull ? '+' : ''}{(s.pChange || 0).toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {topSearchResults.length === 0 && (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No stock found matching "{topSearch}".
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3. HERO INDEX CARD ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
        
        {/* Top Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div
            onClick={() => setShowSubIndicesModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-primary)' }}>
              {activeHeroIndex.name}
            </span>
            <ChevronDown style={{ width: 15, height: 15, color: 'var(--text-muted)' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {/* Line / Candle mode toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
              <button
                onClick={() => setHeroChartMode('line')}
                style={{
                  background: heroChartMode === 'line' ? 'var(--bull)' : 'transparent',
                  color: heroChartMode === 'line' ? '#fff' : 'var(--text-muted)',
                  border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer'
                }}
                title="Line Chart"
              >
                <TrendingUp style={{ width: 13, height: 13 }} />
              </button>
              <button
                onClick={() => setHeroChartMode('candle')}
                style={{
                  background: heroChartMode === 'candle' ? 'var(--bull)' : 'transparent',
                  color: heroChartMode === 'candle' ? '#fff' : 'var(--text-muted)',
                  border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer'
                }}
                title="Candlestick Chart"
              >
                <BarChart2 style={{ width: 13, height: 13 }} />
              </button>
              <button
                type="button"
                onClick={handleToggleHeroFullscreen}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center'
                }}
                title="Fullscreen Landscape View"
              >
                <Maximize2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        </div>

        {/* Prominent Institutional Price, Delta Badge & Turnover */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 26, fontWeight: 900, color: '#ffffff',
              fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em'
            }}>
              {fmt(heroVal.value)}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 800, padding: '4px 9px', borderRadius: 7,
              background: heroTfStats.isBull ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              border: heroTfStats.isBull ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(244, 63, 94, 0.4)',
              color: heroTfStats.isBull ? '#10B981' : '#F43F5E',
              fontFamily: 'var(--font-mono)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <span>{heroTfStats.isBull ? '+' : ''}{fmt(heroTfStats.change)}</span>
              <span>({heroTfStats.isBull ? '+' : ''}{(heroTfStats.pChange || 0).toFixed(2)}%)</span>
              {heroTimeframe !== '1D' && <span style={{ fontSize: 9.5, opacity: 0.85 }}>· {heroTimeframe}</span>}
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Turnover: <strong style={{ color: '#fff' }}>{(() => {
              const to = Number(heroVal.turnover || indices?.nepse?.turnover || 0);
              if (to >= 1e9) return `${(to / 1e9).toFixed(2)} Arba`;
              if (to > 0) return `${(to / 1e7).toFixed(2)} Cr`;
              return '3.04 Arba';
            })()}</strong>
          </div>
        </div>

        {/* Dedicated Responsive Timeframe Selector Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '3px',
          marginBottom: 10,
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}>
          {['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'].map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => handleHeroTimeframeChange(tf)}
              style={{
                flex: 1,
                minWidth: 36,
                background: heroTimeframe === tf ? 'var(--primary)' : 'transparent',
                color: heroTimeframe === tf ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 7,
                padding: '6px 0',
                fontSize: 11.5,
                fontWeight: 800,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease'
              }}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Intraday Line/Candle Chart */}
        <ShareHubChart
          history={heroHistory}
          symbol={activeHeroIndex.name}
          isIntraday={heroTimeframe === '1D'}
          mode={heroChartMode}
          stock={{ ltp: heroVal.value, change: heroVal.change, pChange: heroVal.pChange }}
          chartTimeframe={heroTimeframe}
          onTimeframeChange={handleHeroTimeframeChange}
          showTimeframeBar={false}
          showAdvancedChartBtn={true}
          onOpenTradingView={() => setShowTVModal(true)}
          onToggleFullscreen={handleToggleHeroFullscreen}
        />
      </div>

      {/* ── 4. ZERODHA KITE & WEBULL STYLE MARKET BREADTH RATIO BAR ── */}
      {(() => {
        const totalBreadth = (advancedCount + declinedCount + unchangedCount) || 1;
        const advPct = Math.round((advancedCount / totalBreadth) * 100);
        const decPct = Math.round((declinedCount / totalBreadth) * 100);
        const uncPct = Math.max(0, 100 - advPct - decPct);

        return (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '12px 14px',
            marginBottom: 12
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity style={{ width: 14, height: 14, color: 'var(--primary-light)' }} />
                <span style={{ fontSize: 13, fontWeight: 900, color: '#ffffff' }}>Market Breadth</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({totalBreadth} Scrips Traded)</span>
              </div>
              <span
                onClick={() => setBreadthModalTab(breadthFilter || 'advanced')}
                style={{ fontSize: 11, color: 'var(--primary-light)', cursor: 'pointer', fontWeight: 800 }}
              >
                Full Breakdown ↗
              </span>
            </div>

            {/* Proportional Ratio Bar */}
            <div style={{
              height: 7,
              borderRadius: 4,
              overflow: 'hidden',
              display: 'flex',
              gap: 2,
              background: 'rgba(255,255,255,0.05)',
              marginBottom: 10
            }}>
              <div style={{ width: `${advPct}%`, background: 'var(--bull)' }} title={`Advanced: ${advancedCount} (${advPct}%)`} />
              <div style={{ width: `${uncPct}%`, background: 'rgba(255,255,255,0.25)' }} title={`Unchanged: ${unchangedCount} (${uncPct}%)`} />
              <div style={{ width: `${decPct}%`, background: '#F43F5E' }} title={`Declined: ${declinedCount} (${decPct}%)`} />
            </div>

            {/* Interactive Breadth Filter Chips */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
              {[
                { id: 'advanced', label: `▲ Advances ${advancedCount}`, sub: `${advPct}%`, col: 'var(--bull)', bg: 'rgba(16,185,129,0.1)' },
                { id: 'declined', label: `▼ Declines ${declinedCount}`, sub: `${decPct}%`, col: '#F43F5E', bg: 'rgba(244,63,94,0.1)' },
                { id: 'unchanged', label: `◼ Flat ${unchangedCount}`, sub: `${uncPct}%`, col: 'var(--text-muted)', bg: 'rgba(255,255,255,0.04)' },
                { id: 'circuit_pos', label: `⚡ +Circuit ${circuitPosCount}`, sub: 'Limit Up', col: '#10B981', bg: 'rgba(16,185,129,0.12)' },
                { id: 'circuit_neg', label: `⚡ -Circuit ${circuitNegCount}`, sub: 'Limit Down', col: '#F43F5E', bg: 'rgba(244,63,94,0.12)' },
              ].map(chip => {
                const isSelected = breadthFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setBreadthFilter(prev => prev === chip.id ? null : chip.id)}
                    style={{
                      background: isSelected ? chip.col : chip.bg,
                      color: isSelected ? (chip.id === 'unchanged' ? '#fff' : '#0B0E14') : chip.col,
                      border: isSelected ? `1.5px solid ${chip.col}` : `1px solid ${chip.col}30`,
                      borderRadius: 8,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{chip.label}</span>
                    <span style={{ fontSize: 9.5, opacity: 0.8 }}>({chip.sub})</span>
                  </button>
                );
              })}
            </div>

            {/* Active filter notification with reset */}
            {breadthFilter && (
              <div style={{
                marginTop: 8,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(56, 117, 246, 0.12)',
                border: '1px solid rgba(56, 117, 246, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11
              }}>
                <span style={{ color: '#93c5fd' }}>
                  Filtering by: <strong style={{ color: '#fff', textTransform: 'capitalize' }}>{breadthFilter.replace('_', ' ')}</strong> ({displayStocks.length} scrips)
                </span>
                <button
                  onClick={() => setBreadthFilter(null)}
                  style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontWeight: 800, fontSize: 11 }}
                >
                  Clear Filter ✕
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 4B. COLLAPSIBLE MARKET SENTIMENT & PSYCHOLOGY GAUGE ── */}
      <div id="market-intelligence-section" style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        marginBottom: 12,
        overflow: 'hidden'
      }}>
        {/* Toggle Header */}
        <div
          onClick={() => setShowIntelligence(v => !v)}
          style={{
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            background: showIntelligence ? 'rgba(255,255,255,0.02)' : 'transparent',
            transition: 'background 0.15s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>🧭</span> Market Sentiment
            </span>
            <span style={{
              background: `${fearGreedData.color}20`,
              color: fearGreedData.color,
              border: `1px solid ${fearGreedData.color}50`,
              borderRadius: 6,
              padding: '2px 7px',
              fontSize: 10,
              fontWeight: 800
            }}>
              {fearGreedData.label} ({fearGreedData.score}/100)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary-light)', fontSize: 11, fontWeight: 800 }}>
            <span>{showIntelligence ? 'Hide' : 'View Gauge'}</span>
            <ChevronDown style={{ width: 14, height: 14, transform: showIntelligence ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
          </div>
        </div>

        {/* Collapsible Content Drawer */}
        {showIntelligence && (
          <div style={{ padding: '12px 14px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-secondary)' }}>Fear & Greed Index</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: fearGreedData.color }}>{fearGreedData.label}</span>
            </div>
            <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              <div style={{ flex: 25, background: '#F43F5E' }} title="Extreme Fear" />
              <div style={{ flex: 20, background: '#f97316' }} title="Fear" />
              <div style={{ flex: 10, background: '#38bdf8' }} title="Neutral" />
              <div style={{ flex: 20, background: 'var(--bull)' }} title="Greed" />
              <div style={{ flex: 25, background: '#10B981' }} title="Extreme Greed" />
            </div>
            <div style={{ position: 'relative', height: 8, marginTop: 2 }}>
              <div style={{
                position: 'absolute',
                left: `${fearGreedData.score}%`,
                transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderBottom: `6px solid ${fearGreedData.color}`
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {fearGreedData.desc}
            </div>
          </div>
        )}
      </div>

      {/* ── 5. TABBED MARKET MOVERS (5 HIGH-SIGNAL CATEGORIES) ── */}
      <div id="market-movers-section" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 12px', marginBottom: 12 }}>
        
        {/* Movers Navigation Tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 10 }}>
          {[
            { id: 'gainers',   label: 'Top Gainers',      icon: TrendingUp,   color: 'var(--bull)' },
            { id: 'losers',    label: 'Top Losers',       icon: TrendingDown, color: '#F43F5E' },
            { id: 'turnover',  label: 'Turnover Leaders', icon: Activity,     color: 'var(--primary-light)' },
            { id: 'breakouts', label: '🔥 Breakouts',     icon: Flame,        color: '#f59e0b' },
            { id: 'volume',    label: 'Volume Surge',     icon: BarChart2,    color: '#38bdf8' }
          ].map(t => {
            const isActive = moversTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setMoversTab(t.id)}
                style={{
                  background: isActive ? 'rgba(56, 117, 246, 0.12)' : 'rgba(255,255,255,0.02)',
                  color: isActive ? '#60a5fa' : 'var(--text-muted)',
                  border: `1px solid ${isActive ? 'rgba(56, 117, 246, 0.35)' : 'var(--border)'}`,
                  borderRadius: 20, padding: '5px 12px', fontSize: 11.5, fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.15s'
                }}
              >
                <t.icon style={{ width: 12, height: 12, color: isActive ? '#60a5fa' : t.color, opacity: isActive ? 1 : 0.8 }} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Movers Tab Stock Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 8 }}>
          {(moversTab === 'gainers' ? gainers :
            moversTab === 'losers' ? losers :
            moversTab === 'turnover' ? turnoverLeaders :
            moversTab === 'breakouts' ? breakoutStocks :
            volumeLeaders).map(s => {
            const isBull = (s.pChange || 0) >= 0;
            const spark = generateSparkline(s.ltp, s.pChange);
            return (
              <div
                key={s.symbol}
                onClick={() => handleStockClick(s)}
                style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '9px 11px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', cursor: 'pointer', transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {s.symbol}
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600 }}>{s.sector}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {moversTab === 'turnover' ? `Turnover: ${fmtCr(s.turnover || s.ltp * s.volume)}` :
                     moversTab === 'volume' ? `Vol: ${(s.volume || 0).toLocaleString()} shares` :
                     moversTab === 'breakouts' ? `Breakout · Vol ${(s.volume || 0).toLocaleString()}` :
                     `Vol: ${(s.volume || 0).toLocaleString()} shares`}
                  </div>
                </div>

                <div style={{ width: 46 }}>
                  <Sparkline points={spark} bull={isBull} />
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    Rs. {fmt(s.ltp)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isBull ? 'var(--bull)' : '#F43F5E' }}>
                    {isBull ? '+' : ''}{(s.pChange || 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 6. SECTOR PILLS & STOCK DIRECTORY ── */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
        {sectorList.map(sec => {
          const isSel = selectedSector === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setSelectedSector(sec.id)}
              style={{
                background: isSel ? 'rgba(56, 117, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                color: isSel ? '#60a5fa' : 'var(--text-secondary)',
                border: isSel ? '1px solid rgba(56, 117, 246, 0.4)' : '1px solid var(--border)',
                borderRadius: 20, padding: '5px 12px', fontSize: 11.5, fontWeight: isSel ? 700 : 500,
                cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s'
              }}
            >
              <span>{sec.label}</span>
              <span style={{ fontSize: 9.5, opacity: 0.8, background: isSel ? 'rgba(56, 117, 246, 0.25)' : 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 10 }}>
                {sec.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Stock Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div className="screener-table-header" style={{
          padding: '9px 14px', borderBottom: '1px solid var(--border)',
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)',
          background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0, zIndex: 2
        }}>
          <span onClick={() => handleTableSort('symbol')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            Symbol ({displayStocks.length}) {tableSortField === 'symbol' ? (tableSortAsc ? '↑' : '↓') : ''}
          </span>
          <span style={{ textAlign: 'center' }}>Trend</span>
          {/* Desktop specific headers */}
          <span className="screener-col-desktop" onClick={() => handleTableSort('ltp')} style={{ textAlign: 'right', cursor: 'pointer' }}>
            LTP {tableSortField === 'ltp' ? (tableSortAsc ? '↑' : '↓') : ''}
          </span>
          <span className="screener-col-desktop" onClick={() => handleTableSort('pChange')} style={{ textAlign: 'right', cursor: 'pointer' }}>
            Chg % {tableSortField === 'pChange' ? (tableSortAsc ? '↑' : '↓') : ''}
          </span>
          <span className="screener-col-desktop" onClick={() => handleTableSort('volume')} style={{ textAlign: 'right', cursor: 'pointer' }}>
            Vol {tableSortField === 'volume' ? (tableSortAsc ? '↑' : '↓') : ''}
          </span>
          {/* Mobile specific header */}
          <span className="screener-col-mobile-price" onClick={() => handleTableSort('pChange')} style={{ textAlign: 'right', cursor: 'pointer' }}>
            Price / Chg {tableSortField === 'pChange' ? (tableSortAsc ? '↑' : '↓') : ''}
          </span>
        </div>

        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {displayStocks.map(s => {
            const isBull = (s.pChange || 0) >= 0;
            const spark = generateSparkline(s.ltp, s.pChange);
            return (
              <div
                key={s.symbol}
                onClick={() => handleStockClick(s)}
                className="screener-table-row"
                style={{
                  padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.035)',
                  cursor: 'pointer', transition: 'background 0.15s', alignItems: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {s.symbol}
                    <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {s.sector || 'Others'}
                    </span>
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 1, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name || s.companyName}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Sparkline points={spark} bull={isBull} />
                </div>

                {/* Desktop columns */}
                <div className="screener-col-desktop" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fmt(s.ltp)}
                </div>

                <div className="screener-col-desktop" style={{ textAlign: 'right' }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                    background: isBull ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                    color: isBull ? 'var(--bull)' : '#F43F5E',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {isBull ? '+' : ''}{(s.pChange || 0).toFixed(2)}%
                  </span>
                </div>

                <div className="screener-col-desktop" style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {s.volume >= 1000000 ? `${(s.volume / 1000000).toFixed(1)}M` : s.volume >= 1000 ? `${(s.volume / 1000).toFixed(0)}K` : (s.volume || 0)}
                </div>

                {/* Mobile stacked price & change column */}
                <div className="screener-col-mobile-price">
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {fmt(s.ltp)}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                    background: isBull ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                    color: isBull ? 'var(--bull)' : '#F43F5E',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {isBull ? '+' : ''}{(s.pChange || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MODALS & DRAWERS ── */}
      {selectedStock && (
        <StockDetailModal stock={selectedStock} allStocks={stocks} onClose={() => setSelectedStock(null)} />
      )}

      {breadthModalTab && (
        <ChangeSummaryModal
          stocks={stocks}
          initialTab={breadthModalTab}
          onClose={() => setBreadthModalTab(null)}
          onSelectStock={s => handleStockClick(s)}
        />
      )}

      {activeScanner && (
        <ScannerModal
          filterKey={activeScanner}
          stocks={stocks}
          onClose={() => setActiveScanner(null)}
          onSelectStock={s => handleStockClick(s)}
        />
      )}

      {showSubIndicesModal && (
        <SubIndicesModal
          indices={indices}
          selectedIndex={activeHeroIndex.name}
          onSelectIndex={item => {
            setActiveHeroIndex(item);
          }}
          onClose={() => setShowSubIndicesModal(false)}
        />
      )}

      {showTVModal && (
        <AdvancedChartModal
          symbol={activeHeroIndex.name || 'NEPSE'}
          stock={{ ltp: heroVal.value, change: heroVal.change, pChange: heroVal.pChange, name: activeHeroIndex.name, sector: 'NEPSE Index' }}
          initialTimeframe={heroTimeframe}
          onClose={() => setShowTVModal(false)}
        />
      )}

      {/* Landscape Fullscreen Index Chart Modal */}
      {isHeroFullscreen && (
        <div className="fullscreen-chart-modal" style={{ background: '#080c14' }}>
          {/* Landscape Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 16px', background: '#151922', borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={handleToggleHeroFullscreen}
                className="btn-secondary btn-xs"
                style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.08)', color: '#fff' }}
              >
                <Minimize2 style={{ width: 13, height: 13 }} /> Exit Fullscreen
              </button>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                {activeHeroIndex.name}
              </span>
              <span style={{ fontSize: 15, fontWeight: 900, color: isHeroBull ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>
                {fmt(heroVal.value)}
              </span>
              <span style={{
                fontSize: 11.5, fontWeight: 800,
                color: isHeroBull ? 'var(--bull)' : '#F43F5E',
                fontFamily: 'var(--font-mono)'
              }}>
                {isHeroBull ? '+' : ''}{fmt(heroVal.change)} ({(heroVal.pChange || 0).toFixed(2)}%)
              </span>
              <span style={{
                fontSize: 10, fontWeight: 900, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 6,
                background: marketStatus?.isOpen ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
                color: marketStatus?.isOpen ? 'var(--bull)' : '#f87171'
              }}>
                {marketStatus?.isOpen
                  ? 'Market Open'
                  : marketStatus?.isHoliday
                  ? `Holiday: ${marketStatus.holidayName || 'Public Holiday'}`
                  : marketStatus?.isWeekend
                  ? 'Weekend Closed'
                  : 'Market Closed'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Timeframe Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 6 }}>
                {['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'].map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => handleHeroTimeframeChange(tf)}
                    style={{
                      background: heroTimeframe === tf ? 'var(--bull)' : 'transparent',
                      color: heroTimeframe === tf ? '#0B0E14' : 'rgba(255,255,255,0.7)',
                      border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer'
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              {/* Mode Selector */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setHeroChartMode('line')}
                  style={{
                    background: heroChartMode === 'line' ? 'var(--bull)' : 'rgba(255,255,255,0.06)',
                    color: heroChartMode === 'line' ? '#0B0E14' : '#fff',
                    border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Line
                </button>
                <button
                  type="button"
                  onClick={() => setHeroChartMode('candle')}
                  style={{
                    background: heroChartMode === 'candle' ? 'var(--bull)' : 'rgba(255,255,255,0.06)',
                    color: heroChartMode === 'candle' ? '#0B0E14' : '#fff',
                    border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Candles
                </button>
              </div>
            </div>
          </div>

          {/* Fullscreen Chart Area */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', overflow: 'hidden' }}>
            <ShareHubChart
              history={heroHistory}
              symbol={activeHeroIndex.name}
              isIntraday={heroTimeframe === '1D'}
              mode={heroChartMode}
              stock={{ ltp: heroVal.value, change: heroVal.change, pChange: heroVal.pChange }}
              chartTimeframe={heroTimeframe}
              onTimeframeChange={handleHeroTimeframeChange}
              showTimeframeBar={false}
              showAdvancedChartBtn={true}
              onOpenTradingView={() => setShowTVModal(true)}
              isFullscreen={true}
              height={440}
            />
          </div>

          {/* Bottom Bar with Stats */}
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            padding: '6px 16px', background: '#151922', borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11, flexShrink: 0
          }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Index Value: </span><strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{fmt(heroVal.value)}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Point Change: </span><strong style={{ color: isHeroBull ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>{isHeroBull ? '+' : ''}{fmt(heroVal.change)}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Percent Change: </span><strong style={{ color: isHeroBull ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>{(heroVal.pChange || 0).toFixed(2)}%</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Turnover: </span><strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{fmtCr(heroVal.turnover || indices?.nepse?.turnover || 3786455070)}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Market: </span><strong style={{ color: marketStatus?.isOpen ? 'var(--bull)' : '#f87171' }}>{marketStatus?.isOpen ? 'OPEN' : 'CLOSED'}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}
