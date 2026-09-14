import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp, TrendingDown, Clock, Search, RefreshCw, BarChart2,
  Maximize2, Activity, Eye, Layers, Settings, ChevronDown, Check, Zap,
} from 'lucide-react';
import { fetchPriceHistory, fetchAllSecurities, loadNepseData } from '../utils/liveData';
import { StockSearchSelect, StatCard, Spinner, InfoBanner, TimeframeFilterBar } from './ui';

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20?: number;
  ema50?: number;
  rsi?: number;
  macd?: { macd: number; signal: number; hist: number };
}

export function TradingViewChartService({ initialSymbol = 'NABIL' }: { initialSymbol?: string }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('1M');
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stockInfo, setStockInfo] = useState<any>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllSecurities().then(r => {
      if (r?.data) {
        setAllSymbols(r.data.map((s: any) => s.symbol).filter(Boolean).sort());
      }
    });
  }, []);

  const loadChartData = async (sym: string, tf: string) => {
    setLoading(true);
    try {
      const { stocks } = await loadNepseData();
      const info = stocks.find(s => (s.symbol || '').toUpperCase() === sym.toUpperCase()) || {
        symbol: sym,
        ltp: 520,
        pChange: 1.2,
        volume: 24000,
        high52w: 680,
        low52w: 390,
        rsi: 54,
      };
      setStockInfo(info);

      const daysCount = tf === '1D' ? 5 : tf === '1W' ? 10 : tf === '1M' ? 35 : tf === '3M' ? 95 : tf === '1Y' ? 260 : 500;
      let rawHistory: any[] = [];
      try {
        const histRes = await fetchPriceHistory(sym, daysCount);
        if (Array.isArray(histRes)) {
          rawHistory = histRes;
        } else if (Array.isArray(histRes?.data)) {
          rawHistory = histRes.data;
        }
      } catch (_) {}

      const ltp = Number(info.ltp || 500);

      let generated: Candle[] = [];
      if (rawHistory.length > 0) {
        // Sort ascending by date
        const sorted = rawHistory.slice().sort((a: any, b: any) => new Date(a.date || a.businessDate).getTime() - new Date(b.date || b.businessDate).getTime());
        // Filter slice according to selected timeframe
        const targetBars = tf === '1D' ? 1 : tf === '1W' ? 5 : tf === '1M' ? 22 : tf === '3M' ? 66 : tf === '1Y' ? 250 : sorted.length;
        const sliced = sorted.slice(Math.max(0, sorted.length - targetBars));

        generated = (sliced.length > 0 ? sliced : sorted).map((h: any) => ({
          date: String(h.date || h.businessDate || '').slice(0, 10),
          open: Number(h.open || h.openPrice || h.close || h.closePrice || ltp),
          high: Number(h.high || h.highPrice || Math.max(Number(h.open || ltp), Number(h.close || ltp))),
          low: Number(h.low || h.lowPrice || Math.min(Number(h.open || ltp), Number(h.close || ltp))),
          close: Number(h.close || h.closePrice || h.ltp || ltp),
          volume: Number(h.volume || h.totalTradedQuantity || 0),
        }));
      } else {
        // If network completely unavailable, return today's single actual candle
        generated = [{
          date: new Date().toISOString().slice(0, 10),
          open: Number(info.open || ltp),
          high: Number(info.high || ltp),
          low: Number(info.low || ltp),
          close: ltp,
          volume: Number(info.volume || 0),
        }];
      }

      // Calculate EMAs (EMA 20 & EMA 50)
      let k20 = 2 / (20 + 1);
      let k50 = 2 / (50 + 1);
      let ema20 = generated[0]?.close || ltp;
      let ema50 = generated[0]?.close || ltp;

      const candlesWithTech: Candle[] = generated.map((c, idx) => {
        ema20 = +(c.close * k20 + ema20 * (1 - k20)).toFixed(1);
        ema50 = +(c.close * k50 + ema50 * (1 - k50)).toFixed(1);

        // RSI-14 calculation
        let rsiVal = 50;
        if (idx >= 14) {
          let gains = 0, losses = 0;
          for (let j = idx - 13; j <= idx; j++) {
            const diff = generated[j].close - generated[j - 1].close;
            if (diff >= 0) gains += diff;
            else losses += Math.abs(diff);
          }
          const rs = losses === 0 ? 100 : gains / losses;
          rsiVal = +(100 - (100 / (1 + rs))).toFixed(1);
        }

        return {
          ...c,
          ema20,
          ema50,
          rsi: rsiVal,
        };
      });

      setCandles(candlesWithTech);
      if (candlesWithTech.length > 0) {
        setHoverCandle(candlesWithTech[candlesWithTech.length - 1]);
      }
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    loadChartData(symbol, timeframe);
  }, [symbol, timeframe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadChartData(symbol, timeframe);
    setRefreshing(false);
  };

  // Dimensions & scaling for SVG charting
  const chartHeight = 280;
  const chartWidth = 700;
  const rsiHeight = 80;
  const volHeight = 60;

  const minPrice = useMemo(() => {
    if (!candles.length) return 100;
    const lows = candles.map(c => Math.min(c.low, c.ema20 || c.low, c.ema50 || c.low));
    return Math.min(...lows) * 0.985;
  }, [candles]);

  const maxPrice = useMemo(() => {
    if (!candles.length) return 200;
    const highs = candles.map(c => Math.max(c.high, c.ema20 || c.high, c.ema50 || c.high));
    return Math.max(...highs) * 1.015;
  }, [candles]);

  const priceRange = Math.max(1, maxPrice - minPrice);
  const maxVolume = useMemo(() => {
    if (!candles.length) return 10000;
    return Math.max(...candles.map(c => c.volume)) * 1.15;
  }, [candles]);

  const getY = (val: number) => {
    return chartHeight - ((val - minPrice) / priceRange) * chartHeight;
  };

  const getX = (index: number) => {
    if (candles.length <= 1) return chartWidth / 2;
    return (index / (candles.length - 1)) * (chartWidth - 40) + 20;
  };

  const latestCandle = candles[candles.length - 1];
  const activeCandle = hoverCandle || latestCandle;
  const isGreenDay = activeCandle ? activeCandle.close >= activeCandle.open : true;

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-48 sm:w-60">
            <StockSearchSelect
              value={symbol}
              onChange={(s) => setSymbol(s)}
              placeholder="Search scrip (e.g. NABIL)…"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setChartType('candle')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${chartType === 'candle' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Candles
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${chartType === 'line' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Line
            </button>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition ${timeframe === tf ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'}`}
            >
              {tf}
            </button>
          ))}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="ml-1 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh chart"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Indicator overlay checkboxes */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800/80 text-xs text-slate-300">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Overlays:</span>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showEma20}
            onChange={(e) => setShowEma20(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900 text-yellow-500"
          />
          <span className="flex items-center gap-1 font-semibold text-yellow-400">
            <span className="w-2.5 h-0.5 bg-yellow-400 rounded"></span> EMA 20
          </span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showEma50}
            onChange={(e) => setShowEma50(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900 text-cyan-500"
          />
          <span className="flex items-center gap-1 font-semibold text-cyan-400">
            <span className="w-2.5 h-0.5 bg-cyan-400 rounded"></span> EMA 50
          </span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showVolume}
            onChange={(e) => setShowVolume(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900 text-purple-500"
          />
          <span className="font-semibold text-purple-400">Volume</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
          <input
            type="checkbox"
            checked={showRsi}
            onChange={(e) => setShowRsi(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900 text-emerald-500"
          />
          <span className="font-semibold text-emerald-400">RSI (14)</span>
        </label>
      </div>

      {/* Snapshot HUD bar */}
      {activeCandle && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 block font-semibold">DATE</span>
            <span className="font-mono text-slate-200 font-bold">{activeCandle.date || 'Latest'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-semibold">OPEN</span>
            <span className="font-mono text-slate-200">Rs. {activeCandle.open}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-semibold">HIGH</span>
            <span className="font-mono text-emerald-400">Rs. {activeCandle.high}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-semibold">LOW</span>
            <span className="font-mono text-rose-400">Rs. {activeCandle.low}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-semibold">CLOSE (LTP)</span>
            <span className={`font-mono font-bold ${isGreenDay ? 'text-emerald-400' : 'text-rose-400'}`}>
              Rs. {activeCandle.close}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-semibold">VOLUME</span>
            <span className="font-mono text-cyan-300 font-bold">{activeCandle.volume.toLocaleString()}</span>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner text={`Loading interactive chart for ${symbol}…`} />
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 sm:p-4 shadow-xl overflow-hidden" ref={containerRef}>
          {/* Main Price Chart */}
          <div className="relative">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto overflow-visible select-none"
              style={{ maxHeight: '340px' }}
            >
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = chartHeight * pct;
                const p = maxPrice - pct * priceRange;
                return (
                  <g key={idx}>
                    <line x1="0" y1={y} x2={chartWidth} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                    <text x={chartWidth - 5} y={y - 4} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">
                      Rs. {Math.round(p)}
                    </text>
                  </g>
                );
              })}

              {/* Price Line (if line mode) */}
              {chartType === 'line' && candles.length > 1 && (
                <>
                  <path
                    d={`M ${candles.map((c, i) => `${getX(i)} ${getY(c.close)}`).join(' L ')} L ${getX(candles.length - 1)} ${chartHeight} L ${getX(0)} ${chartHeight} Z`}
                    fill="url(#lineGrad)"
                  />
                  <path
                    d={`M ${candles.map((c, i) => `${getX(i)} ${getY(c.close)}`).join(' L ')}`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Candlesticks */}
              {chartType === 'candle' && candles.map((c, i) => {
                const x = getX(i);
                const isGreen = c.close >= c.open;
                const top = getY(Math.max(c.open, c.close));
                const bottom = getY(Math.min(c.open, c.close));
                const highY = getY(c.high);
                const lowY = getY(c.low);
                const candleWidth = Math.max(3, Math.min(12, (chartWidth / candles.length) * 0.7));

                return (
                  <g
                    key={i}
                    className="cursor-crosshair group"
                    onMouseEnter={() => setHoverCandle(c)}
                  >
                    {/* Upper & Lower Wick */}
                    <line
                      x1={x}
                      y1={highY}
                      x2={x}
                      y2={lowY}
                      stroke={isGreen ? '#22c55e' : '#ef4444'}
                      strokeWidth="1.2"
                    />
                    {/* Real Body */}
                    <rect
                      x={x - candleWidth / 2}
                      y={top}
                      width={candleWidth}
                      height={Math.max(2, bottom - top)}
                      fill={isGreen ? '#16a34a' : '#dc2626'}
                      stroke={isGreen ? '#22c55e' : '#ef4444'}
                      strokeWidth="0.8"
                      rx="1"
                    />
                  </g>
                );
              })}

              {/* EMA 20 Overlay Line */}
              {showEma20 && candles.length > 1 && (
                <path
                  d={`M ${candles.map((c, i) => `${getX(i)} ${getY(c.ema20 || c.close)}`).join(' L ')}`}
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="1.6"
                />
              )}

              {/* EMA 50 Overlay Line */}
              {showEma50 && candles.length > 1 && (
                <path
                  d={`M ${candles.map((c, i) => `${getX(i)} ${getY(c.ema50 || c.close)}`).join(' L ')}`}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="1.6"
                />
              )}
            </svg>
          </div>

          {/* Volume Sub-Chart */}
          {showVolume && (
            <div className="mt-2 border-t border-slate-800/80 pt-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
                <span>TRADING VOLUME</span>
                <span className="font-mono text-purple-400">Peak: {maxVolume.toLocaleString()} units</span>
              </div>
              <svg viewBox={`0 0 ${chartWidth} ${volHeight}`} className="w-full h-14 overflow-visible">
                {candles.map((c, i) => {
                  const x = getX(i);
                  const isGreen = c.close >= c.open;
                  const barH = (c.volume / maxVolume) * volHeight;
                  const candleWidth = Math.max(2, Math.min(10, (chartWidth / candles.length) * 0.65));
                  return (
                    <rect
                      key={i}
                      x={x - candleWidth / 2}
                      y={volHeight - barH}
                      width={candleWidth}
                      height={Math.max(1, barH)}
                      fill={isGreen ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'}
                      rx="1"
                    />
                  );
                })}
              </svg>
            </div>
          )}

          {/* RSI Sub-Panel */}
          {showRsi && (
            <div className="mt-2 border-t border-slate-800/80 pt-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
                <span>RELATIVE STRENGTH INDEX (RSI 14)</span>
                <span className={`font-mono font-bold ${activeCandle?.rsi && activeCandle.rsi > 70 ? 'text-rose-400' : activeCandle?.rsi && activeCandle.rsi < 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  RSI: {activeCandle?.rsi || 50}
                </span>
              </div>
              <svg viewBox={`0 0 ${chartWidth} ${rsiHeight}`} className="w-full h-16 overflow-visible">
                {/* 70 Overbought band */}
                <line x1="0" y1={rsiHeight * 0.3} x2={chartWidth} y2={rsiHeight * 0.3} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity="0.6" />
                {/* 30 Oversold band */}
                <line x1="0" y1={rsiHeight * 0.7} x2={chartWidth} y2={rsiHeight * 0.7} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity="0.6" />
                {/* 50 Centerline */}
                <line x1="0" y1={rsiHeight * 0.5} x2={chartWidth} y2={rsiHeight * 0.5} stroke="#334155" strokeDasharray="2 2" />

                {/* RSI Line */}
                {candles.length > 1 && (
                  <path
                    d={`M ${candles.map((c, i) => `${getX(i)} ${rsiHeight - ((c.rsi || 50) / 100) * rsiHeight}`).join(' L ')}`}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.8"
                  />
                )}
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Fundamentals & Key Levels Card */}
      {stockInfo && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="Current Price" value={`Rs. ${stockInfo.ltp || stockInfo.closePrice || '—'}`} big color="#3b82f6" />
          <StatCard label="52W High" value={`Rs. ${stockInfo.high52w || '—'}`} subtitle="Strong Resistance" color="#10b981" />
          <StatCard label="52W Low" value={`Rs. ${stockInfo.low52w || '—'}`} subtitle="Major Support" color="#f43f5e" />
          <StatCard label="EMA-20 Status" value={activeCandle?.close && activeCandle?.ema20 && activeCandle.close >= activeCandle.ema20 ? 'Bullish (Above 20)' : 'Bearish (Below 20)'} color={activeCandle?.close && activeCandle?.ema20 && activeCandle.close >= activeCandle.ema20 ? '#10b981' : '#f43f5e'} />
        </div>
      )}
    </div>
  );
}
