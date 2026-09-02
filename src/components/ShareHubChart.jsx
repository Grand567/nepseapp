import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LineChart, BarChart2, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

/* ─── Moving Average Helper ─── */
function calculateMA(data, period, key = 'close') {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < 0) {
      result.push(null);
      continue;
    }
    const start = Math.max(0, i - period + 1);
    const slice = data.slice(start, i + 1);
    const sum = slice.reduce((acc, curr) => acc + Number(curr[key] || 0), 0);
    result.push(Number((sum / slice.length).toFixed(2)));
  }
  return result;
}

const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtVol = n => {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(2)}B`;
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
};

export default function ShareHubChart({
  history = [],
  symbol = 'NEPSE',
  isIntraday = true,
  mode: initialMode = 'line',
  stock = null,
  onOpenTradingView,
  onToggleFullscreen,
  isFullscreen = false,
  chartTimeframe = '1D',
  onTimeframeChange,
  showTimeframeBar = true,
  showAdvancedChartBtn = true,
}) {
  const [mode, setMode] = useState(initialMode); // 'line' | 'candle'
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
    lastTap: 0,
  });

  // Keep mode in sync if parent passes it
  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  // Reset zoom on symbol or dataset change
  useEffect(() => {
    setScale(1.0);
    setPanOffset(0);
    setHoverIndex(null);
  }, [symbol, isIntraday, chartTimeframe, history?.length]);

  // Ensure dataset has valid open/high/low/close/volume
  const safeHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.map((item, idx) => {
      const c = Number(item.close != null ? item.close : item.ltp || 100);
      const o = Number(item.open != null ? item.open : c);
      const h = Number(item.high != null ? item.high : Math.max(o, c));
      const l = Number(item.low != null ? item.low : Math.min(o, c));
      const v = Number(item.volume || item.tradedQty || Math.floor(10000 + (idx * 317) % 50000));
      return {
        ...item,
        close: c,
        open: o,
        high: h,
        low: l,
        volume: v,
        label: item.time || item.date || `P${idx + 1}`
      };
    });
  }, [history]);

  // Calculate Price Moving Averages (MA5, MA10, MA20)
  const ma5 = useMemo(() => calculateMA(safeHistory, 5, 'close'), [safeHistory]);
  const ma10 = useMemo(() => calculateMA(safeHistory, 10, 'close'), [safeHistory]);
  const ma20 = useMemo(() => calculateMA(safeHistory, 20, 'close'), [safeHistory]);

  // Calculate Volume Moving Averages (Vol MA5, Vol MA10)
  const volMa5 = useMemo(() => calculateMA(safeHistory, 5, 'volume'), [safeHistory]);
  const volMa10 = useMemo(() => calculateMA(safeHistory, 10, 'volume'), [safeHistory]);

  if (safeHistory.length === 0) {
    return (
      <div style={{ height: isFullscreen ? 360 : 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No chart history data available
      </div>
    );
  }

  // Dimensions
  const W = isFullscreen ? 860 : 400;
  const H = isFullscreen ? (mode === 'candle' ? 420 : 360) : (mode === 'candle' ? 260 : 210);
  const LEFT_AXIS = isFullscreen ? 50 : 40;
  const RIGHT_AXIS = mode === 'candle' ? (isFullscreen ? 54 : 46) : 6;
  const PLOT_W = W - LEFT_AXIS - RIGHT_AXIS;
  
  // Height split for Candlestick mode (Main Price Chart + Volume Subchart)
  const BOTTOM_AXIS = isFullscreen ? 26 : 22;
  const VOL_H = mode === 'candle' ? (isFullscreen ? 75 : 52) : 0;
  const PRICE_H = H - BOTTOM_AXIS - VOL_H - (mode === 'candle' ? 14 : 0);

  // Zoom / pan bounds
  const maxPan = Math.max(0, (scale - 1) * PLOT_W);
  const clampedPan = Math.max(0, Math.min(maxPan, panOffset));

  const getX = (index) => {
    if (safeHistory.length <= 1) return LEFT_AXIS + PLOT_W / 2;
    const rawX = (index / (safeHistory.length - 1)) * (PLOT_W * scale) - clampedPan;
    return LEFT_AXIS + rawX;
  };

  // Find visible indices slice
  const visibleIndices = safeHistory.map((_, i) => i).filter(i => {
    const x = getX(i);
    return x >= (LEFT_AXIS - 30) && x <= (W - RIGHT_AXIS + 30);
  });
  const visibleHistory = visibleIndices.length >= 2 ? visibleIndices.map(i => safeHistory[i]) : safeHistory;

  const ltp = safeHistory[safeHistory.length - 1].close;
  const firstClose = safeHistory[0].open || safeHistory[0].close;
  const isBull = stock?.change != null 
    ? (Number(stock.change) >= 0) 
    : (stock?.pChange != null ? Number(stock.pChange) >= 0 : (ltp >= firstClose));

  const mainColor = isBull ? '#10d98a' : '#f43f5e';

  // Price Bounds
  const highPrices = visibleHistory.map(h => h.high);
  const lowPrices = visibleHistory.map(h => h.low);
  const rawMax = Math.max(...highPrices, ltp);
  const rawMin = Math.min(...lowPrices, ltp);
  const pad = Math.max(0.5, (rawMax - rawMin) * 0.08);
  const maxPrice = rawMax + pad;
  const minPrice = Math.max(1, rawMin - pad);
  const priceRng = maxPrice - minPrice || 1;

  const getY = (price) => {
    return 16 + (1 - (price - minPrice) / priceRng) * (PRICE_H - 26);
  };

  // Peak and Trough Points for High/Low tags
  let peakIdx = 0, peakVal = -Infinity;
  let troughIdx = 0, troughVal = Infinity;
  visibleIndices.forEach(idx => {
    const pt = safeHistory[idx];
    if (pt.high > peakVal) {
      peakVal = pt.high;
      peakIdx = idx;
    }
    if (pt.low < troughVal) {
      troughVal = pt.low;
      troughIdx = idx;
    }
  });

  // Volume Bounds
  const maxVol = Math.max(...visibleHistory.map(h => h.volume), 1000);
  const getVolY = (vol) => {
    const subTop = PRICE_H + 14;
    return subTop + (1 - vol / maxVol) * (VOL_H - 8);
  };

  // Price grid levels
  const gridLevels = [];
  const steps = isFullscreen ? 6 : 4;
  for (let s = 0; s <= steps; s++) {
    const p = minPrice + (priceRng * (steps - s)) / steps;
    gridLevels.push({
      price: Math.round(p),
      y: getY(p),
    });
  }

  // Generate SVG Path for Line Mode
  let lineD = '';
  safeHistory.forEach((h, i) => {
    const x = getX(i);
    const y = getY(h.close);
    if (i === 0) {
      lineD = `M ${x.toFixed(1)},${y.toFixed(1)}`;
    } else {
      lineD += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
    }
  });

  const lastX = getX(safeHistory.length - 1);
  const firstX = getX(0);
  const areaD = `${lineD} L ${lastX.toFixed(1)},${PRICE_H} L ${firstX.toFixed(1)},${PRICE_H} Z`;

  // MA Paths for Candlestick Mode
  const buildMaPath = (maArr) => {
    let path = '';
    safeHistory.forEach((_, i) => {
      const val = maArr[i];
      if (val != null) {
        const x = getX(i);
        const y = getY(val);
        if (!path) path = `M ${x.toFixed(1)},${y.toFixed(1)}`;
        else path += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
      }
    });
    return path;
  };

  const ma5Path = mode === 'candle' ? buildMaPath(ma5) : '';
  const ma10Path = mode === 'candle' ? buildMaPath(ma10) : '';
  const ma20Path = mode === 'candle' ? buildMaPath(ma20) : '';

  // Volume MA Paths
  const buildVolMaPath = (volMaArr) => {
    let path = '';
    safeHistory.forEach((_, i) => {
      const val = volMaArr[i];
      if (val != null) {
        const x = getX(i);
        const y = getVolY(val);
        if (!path) path = `M ${x.toFixed(1)},${y.toFixed(1)}`;
        else path += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
      }
    });
    return path;
  };

  const volMa5Path = mode === 'candle' ? buildVolMaPath(volMa5) : '';
  const volMa10Path = mode === 'candle' ? buildVolMaPath(volMa10) : '';

  const activeIdx = hoverIndex != null ? hoverIndex : (safeHistory.length - 1);
  const activePt = safeHistory[activeIdx] || safeHistory[safeHistory.length - 1];

  const handlePointer = (clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const relX = mouseX - (rect.width * (LEFT_AXIS / W));
    const plotWidthPx = rect.width * (PLOT_W / W);
    const effectiveX = (relX + (clampedPan / PLOT_W) * plotWidthPx) / scale;
    const pct = Math.max(0, Math.min(1, effectiveX / plotWidthPx));
    const idx = Math.min(safeHistory.length - 1, Math.max(0, Math.round(pct * (safeHistory.length - 1))));
    setHoverIndex(idx);
  };

  // Touch Handlers
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
      if (now - touchRef.current.lastTap < 300) {
        if (scale > 1.2) {
          setScale(1.0);
          setPanOffset(0);
        } else {
          setScale(2.2);
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
    if (e.touches.length < 2) touchRef.current.initialDist = 0;
    if (e.touches.length === 0) setHoverIndex(null);
  };

  const gid = `sharehub_grad_${symbol.replace(/[^a-zA-Z0-9]/g, '')}_${isFullscreen ? 'fs' : 'in'}`;
  const clipId = `sharehub_clip_${symbol.replace(/[^a-zA-Z0-9]/g, '')}_${isFullscreen ? 'fs' : 'in'}`;

  // Time labels on bottom
  const visibleStartIdx = Math.max(0, Math.min(safeHistory.length - 1, Math.round(((clampedPan) / (PLOT_W * scale)) * (safeHistory.length - 1))));
  const visibleEndIdx = Math.max(0, Math.min(safeHistory.length - 1, Math.round(((clampedPan + PLOT_W) / (PLOT_W * scale)) * (safeHistory.length - 1))));
  const startTimeLabel = safeHistory[visibleStartIdx]?.label || (isIntraday ? '11:00 AM' : 'Start');
  const endTimeLabel = safeHistory[visibleEndIdx]?.label || (isIntraday ? '03:00 PM' : 'Latest');

  return (
    <div style={{ width: '100%', position: 'relative', userSelect: 'none', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── Top Bar: Mode Toggles (Line / Candle) & MA Legend (ShareHub style) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
        
        {/* Left / Moving Averages Legend in Candle Mode */}
        {mode === 'candle' ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, fontWeight: 800 }}>
            <span style={{ color: '#eab308' }}>MA5: {fmt(ma5[activeIdx])}</span>
            <span style={{ color: '#ec4899' }}>MA10: {fmt(ma10[activeIdx])}</span>
            <span style={{ color: '#06b6d4' }}>MA20: {fmt(ma20[activeIdx])}</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
            {stock?.name || symbol}
          </div>
        )}

        {/* Right: Line / Candle Toggle Pills */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.06)', padding: 3, borderRadius: 8 }}>
          <button
            type="button"
            onClick={() => setMode('line')}
            style={{
              background: mode === 'line' ? '#10d98a' : 'transparent',
              color: mode === 'line' ? '#000000' : 'rgba(255,255,255,0.7)',
              border: 'none', borderRadius: 6, padding: '3px 10px',
              fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Line
          </button>
          <button
            type="button"
            onClick={() => setMode('candle')}
            style={{
              background: mode === 'candle' ? '#10d98a' : 'transparent',
              color: mode === 'candle' ? '#000000' : 'rgba(255,255,255,0.7)',
              border: 'none', borderRadius: 6, padding: '3px 10px',
              fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Candle
          </button>
        </div>
      </div>

      {/* Floating Interactive Tooltip Pill (Matching ShareHub video 00:21 & 00:43) */}
      {hoverIndex != null && activePt && (
        <div style={{
          position: 'absolute',
          top: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid #10d98a',
          borderRadius: 8,
          padding: '4px 12px',
          fontSize: 11.5,
          fontWeight: 800,
          color: '#ffffff',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          zIndex: 30,
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
          pointerEvents: 'none'
        }}>
          <span style={{ color: '#8da2be' }}>{activePt.label}</span>
          <span style={{ color: '#10d98a', fontFamily: 'var(--font-mono)' }}>Rs {fmt(activePt.close)}</span>
          {mode === 'candle' && (
            <span style={{ color: activePt.close >= activePt.open ? '#10d98a' : '#f43f5e', fontSize: 10.5 }}>
              O:{fmt(activePt.open)} H:{fmt(activePt.high)} L:{fmt(activePt.low)}
            </span>
          )}
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none' }}
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

          <clipPath id={clipId}>
            <rect x={LEFT_AXIS} y={0} width={PLOT_W} height={H} />
          </clipPath>
        </defs>

        {/* Horizontal grid lines & Left-aligned Y-axis labels */}
        {gridLevels.map((lvl, idx) => (
          <g key={idx}>
            <line
              x1={LEFT_AXIS}
              y1={lvl.y}
              x2={W - RIGHT_AXIS}
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
                strokeWidth={isFullscreen ? "2.8" : "2.2"}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* CANDLESTICK MODE (OHLC + Moving Averages + High/Low markers) */}
          {mode === 'candle' && (
            <>
              {/* Candlesticks */}
              {safeHistory.map((h, i) => {
                const x = getX(i);
                if (x < LEFT_AXIS - 20 || x > W - RIGHT_AXIS + 20) return null;

                const isGreen = h.close >= h.open;
                const col = isGreen ? '#10d98a' : '#f43f5e';
                const yOpen = getY(h.open);
                const yClose = getY(h.close);
                const yHigh = getY(h.high);
                const yLow = getY(h.low);
                const topBody = Math.min(yOpen, yClose);
                const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));
                const candleBarW = Math.max(3, Math.min(14, ((PLOT_W * scale) / safeHistory.length) - 2));

                return (
                  <g key={i}>
                    {/* Wicks */}
                    <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={col} strokeWidth="1.2" />
                    {/* Candle Body */}
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
              })}

              {/* Moving Average Lines (MA5, MA10, MA20) */}
              {ma5Path && <path d={ma5Path} fill="none" stroke="#eab308" strokeWidth="1.4" strokeLinejoin="round" />}
              {ma10Path && <path d={ma10Path} fill="none" stroke="#ec4899" strokeWidth="1.4" strokeLinejoin="round" />}
              {ma20Path && <path d={ma20Path} fill="none" stroke="#06b6d4" strokeWidth="1.4" strokeLinejoin="round" />}

              {/* High & Low Price Tags (Matching ShareHub video 00:04 - 00:30) */}
              {peakVal > 0 && (
                <g>
                  <line
                    x1={getX(peakIdx) - 8}
                    y1={getY(peakVal) - 6}
                    x2={getX(peakIdx) + 8}
                    y2={getY(peakVal) - 6}
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth="1"
                  />
                  <text
                    x={getX(peakIdx)}
                    y={getY(peakVal) - 9}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fontWeight="700"
                  >
                    {fmt(peakVal)}
                  </text>
                </g>
              )}

              {troughVal < Infinity && (
                <g>
                  <line
                    x1={getX(troughIdx) - 8}
                    y1={getY(troughVal) + 6}
                    x2={getX(troughIdx) + 8}
                    y2={getY(troughVal) + 6}
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth="1"
                  />
                  <text
                    x={getX(troughIdx)}
                    y={getY(troughVal) + 16}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fontWeight="700"
                  >
                    {fmt(troughVal)}
                  </text>
                </g>
              )}

              {/* Volume Subchart Separator & Bars */}
              <line
                x1={LEFT_AXIS}
                y1={PRICE_H + 10}
                x2={W - RIGHT_AXIS}
                y2={PRICE_H + 10}
                stroke="rgba(255,255,255,0.1)"
              />
              
              {/* Volume Legend Text */}
              <text x={LEFT_AXIS + 4} y={PRICE_H + 22} fill="rgba(255,255,255,0.55)" fontSize="8.5" fontWeight="700">
                VOL: {fmtVol(activePt.volume)}  <tspan fill="#eab308">MA5: {fmtVol(volMa5[activeIdx])}</tspan>  <tspan fill="#ec4899">MA10: {fmtVol(volMa10[activeIdx])}</tspan>
              </text>

              {/* Volume Histogram Bars */}
              {safeHistory.map((h, i) => {
                const x = getX(i);
                if (x < LEFT_AXIS - 20 || x > W - RIGHT_AXIS + 20) return null;
                const isGreen = h.close >= h.open;
                const col = isGreen ? 'rgba(16,217,138,0.45)' : 'rgba(244,63,94,0.45)';
                const barW = Math.max(2, Math.min(12, ((PLOT_W * scale) / safeHistory.length) - 2));
                const yVol = getVolY(h.volume);
                const subBottom = PRICE_H + 14 + VOL_H;
                const barH = Math.max(2, subBottom - yVol);

                return (
                  <rect
                    key={`vol_${i}`}
                    x={x - barW / 2}
                    y={yVol}
                    width={barW}
                    height={barH}
                    fill={col}
                  />
                );
              })}

              {/* Volume MA5 & MA10 Lines */}
              {volMa5Path && <path d={volMa5Path} fill="none" stroke="#eab308" strokeWidth="1.2" />}
              {volMa10Path && <path d={volMa10Path} fill="none" stroke="#ec4899" strokeWidth="1.2" />}
            </>
          )}

          {/* Active Crosshair Line on hover/touch */}
          {hoverIndex != null && activePt && (
            <g>
              <line
                x1={getX(activeIdx)}
                y1="6"
                x2={getX(activeIdx)}
                y2={mode === 'candle' ? PRICE_H + 14 + VOL_H : PRICE_H}
                stroke="rgba(255,255,255,0.4)"
                strokeDasharray="2 2"
                strokeWidth="1.2"
              />
              <circle
                cx={getX(activeIdx)}
                cy={getY(activePt.close)}
                r={isFullscreen ? "5.5" : "4"}
                fill="#10d98a"
                stroke="#ffffff"
                strokeWidth="1.8"
              />
            </g>
          )}
        </g>

        {/* Right Y-Axis Current Price Badge in Candle Mode */}
        {mode === 'candle' && (
          <g>
            <rect
              x={W - RIGHT_AXIS + 2}
              y={getY(ltp) - 8}
              width={RIGHT_AXIS - 4}
              height={16}
              rx="4"
              fill={isBull ? '#10d98a' : '#f43f5e'}
            />
            <text
              x={W - RIGHT_AXIS + (RIGHT_AXIS - 4) / 2 + 2}
              y={getY(ltp) + 3.5}
              textAnchor="middle"
              fill="#000000"
              fontSize="8.5"
              fontWeight="900"
              fontFamily="var(--font-mono)"
            >
              {Math.round(ltp)}
            </text>
          </g>
        )}

        {/* Bottom X-Axis Time / Date Milestones */}
        {scale <= 1.25 && isIntraday ? (
          [
            { label: '10:51 AM', pct: 0 },
            { label: '11:41 AM', pct: 0.25 },
            { label: '12:31 PM', pct: 0.50 },
            { label: '01:21 PM', pct: 0.75 },
            { label: '03:00 PM', pct: 1.0 }
          ].map((m, idx, arr) => {
            const xPos = LEFT_AXIS + m.pct * (PLOT_W - 4);
            const anchor = idx === 0 ? 'start' : (idx === arr.length - 1 ? 'end' : 'middle');
            return (
              <text
                key={idx}
                x={xPos}
                y={H - 4}
                textAnchor={anchor}
                fill="rgba(255,255,255,0.45)"
                fontSize="8.5"
                fontFamily="var(--font-mono)"
              >
                {m.label}
              </text>
            );
          })
        ) : (
          <>
            <text x={LEFT_AXIS + 2} y={H - 4} fill="rgba(255,255,255,0.45)" fontSize="8.5" fontFamily="var(--font-mono)">
              {startTimeLabel}
            </text>
            <text x={W - RIGHT_AXIS - 2} y={H - 4} textAnchor="end" fill="rgba(255,255,255,0.45)" fontSize="8.5" fontFamily="var(--font-mono)">
              {endTimeLabel}
            </text>
          </>
        )}
      </svg>

      {/* ── Timeframe Selector Bar (ShareHub style: 1D | 1W | 1M | 3M | 6M | 1Y | All) ── */}
      {showTimeframeBar && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
          padding: '6px 8px',
          background: 'rgba(255, 255, 255, 0.025)',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto' }}>
            {[
              { id: '1D', label: '1D' },
              { id: '2D', label: '2D' },
              { id: '3D', label: '3D' },
              { id: '7', label: '1W' },
              { id: '30', label: '1M' },
              { id: '90', label: '3M' },
              { id: '180', label: '6M' },
              { id: '365', label: '1Y' },
              { id: 'all', label: 'All' },
            ].map((tf, index) => {
              const isActive = (chartTimeframe === tf.id) || (chartTimeframe === '1D' && tf.id === '1D');
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => onTimeframeChange && onTimeframeChange(tf.id)}
                  style={{
                    background: isActive ? '#10d98a' : 'transparent',
                    color: isActive ? '#000000' : 'rgba(255,255,255,0.65)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              title="Toggle Fullscreen View"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 6,
                padding: '5px 8px',
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {isFullscreen ? <Minimize2 style={{ width: 14, height: 14 }} /> : <Maximize2 style={{ width: 14, height: 14 }} />}
            </button>
          )}
        </div>
      )}

      {/* ── View Advanced Chart Button (Matching ShareHub video 00:20 & 00:36) ── */}
      {showAdvancedChartBtn && onOpenTradingView && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={onOpenTradingView}
            style={{
              background: 'rgba(16, 217, 138, 0.08)',
              border: '1px solid rgba(16, 217, 138, 0.25)',
              borderRadius: 20,
              padding: '7px 20px',
              color: '#10d98a',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
          >
            <span>📊</span>
            <span>View Advanced Chart &gt;</span>
          </button>
        </div>
      )}
    </div>
  );
}
