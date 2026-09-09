import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import { calculateEMA } from '../../utils/indicators';
import { Layers, Eye, EyeOff, Calendar, Maximize2 } from 'lucide-react';

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartLevels {
  entryZone?: { low: number; high: number; label: string };
  stopLoss?: { price: number; pct: number; label: string };
  target1?: { price: number; pct: number; label: string };
  target2?: { price: number; pct: number; label: string };
  support?: Array<{ price: number; strength: number }>;
  resistance?: Array<{ price: number; strength: number }>;
}

interface StockCandlestickChartProps {
  candles: CandleData[];
  levels?: ChartLevels;
  symbol: string;
  ltp?: number;
}

const TIMEFRAMES = [
  { id: '1M', label: '1M', days: 30 },
  { id: '3M', label: '3M', days: 90 },
  { id: '6M', label: '6M', days: 180 },
  { id: '1Y', label: '1Y', days: 365 },
  { id: '2Y', label: '2Y', days: 730 },
  { id: 'MAX', label: 'MAX', days: 9999 },
];

export function StockCandlestickChart({
  candles = [],
  levels,
  symbol,
  ltp,
}: StockCandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [timeframe, setTimeframe] = useState('6M');

  // Indicator Toggles
  const [showCandles, setShowCandles] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showEma20, setShowEma20] = useState(false);
  const [showEma50, setShowEma50] = useState(false);
  const [showEma200, setShowEma200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showSRLevels, setShowSRLevels] = useState(true);
  const [showTradeLevels, setShowTradeLevels] = useState(true);

  // Active hover crosshair tooltip data
  const [tooltipData, setTooltipData] = useState<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    changePct: number;
    volume: number;
    ema20?: number | null;
    ema50?: number | null;
  } | null>(null);

  // Normalize, clean, sort ascending, and de-duplicate candles to satisfy lightweight-charts invariant
  const ascendingCandles = useMemo(() => {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const map = new Map<string, {
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>();

    for (const c of candles) {
      if (!c) continue;
      const rawDate = c.date || (c as any).t || (c as any).time;
      if (!rawDate) continue;

      let dateStr = '';
      if (typeof rawDate === 'number') {
        const ts = rawDate > 1e11 ? Math.floor(rawDate / 1000) : rawDate;
        dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
      } else if (typeof rawDate === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          dateStr = rawDate;
        } else {
          const d = new Date(rawDate);
          if (isNaN(d.getTime())) continue;
          dateStr = d.toISOString().slice(0, 10);
        }
      } else {
        continue;
      }

      const close = Number(c.close ?? (c as any).c ?? (c as any).ltp);
      if (!Number.isFinite(close) || close <= 0) continue;

      const open = Number(c.open ?? (c as any).o ?? close);
      const high = Math.max(open, close, Number(c.high ?? (c as any).h ?? close));
      const low = Math.min(open, close, Number(c.low ?? (c as any).l ?? close));
      const volume = Number(c.volume ?? (c as any).v ?? 0);

      // Save / overwrite same-date row
      map.set(dateStr, {
        date: dateStr,
        open,
        high,
        low,
        close,
        volume,
      });
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [candles]);

  // Filter candles based on timeframe
  const filteredCandles = useMemo(() => {
    if (ascendingCandles.length === 0) return [];
    const tf = TIMEFRAMES.find((t) => t.id === timeframe);
    const days = tf ? tf.days : 180;
    if (days >= 9000 || ascendingCandles.length <= days) return ascendingCandles;
    return ascendingCandles.slice(-days);
  }, [ascendingCandles, timeframe]);

  // Compute Moving Averages for filtered dataset
  const closes = useMemo(() => filteredCandles.map((c) => Number(c.close)), [filteredCandles]);
  const ema20Data = useMemo(() => {
    if (closes.length < 20) return [];
    const ema = calculateEMA(closes, 20);
    return filteredCandles.map((c, i) => ({ time: c.date, value: Number(ema[i].toFixed(2)) }));
  }, [closes, filteredCandles]);

  const ema50Data = useMemo(() => {
    if (closes.length < 50) return [];
    const ema = calculateEMA(closes, 50);
    return filteredCandles.map((c, i) => ({ time: c.date, value: Number(ema[i].toFixed(2)) }));
  }, [closes, filteredCandles]);

  const ema200Data = useMemo(() => {
    if (closes.length < 180) return [];
    const ema = calculateEMA(closes, 200);
    return filteredCandles.map((c, i) => ({ time: c.date, value: Number(ema[i].toFixed(2)) }));
  }, [closes, filteredCandles]);

  // Bollinger Bands (20 period, 2 std dev)
  const bollingerData = useMemo(() => {
    if (closes.length < 20) return { upper: [], lower: [], middle: [] };
    const upper: Array<{ time: string; value: number }> = [];
    const lower: Array<{ time: string; value: number }> = [];
    const middle: Array<{ time: string; value: number }> = [];

    for (let i = 19; i < closes.length; i++) {
      const slice = closes.slice(i - 19, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / 20;
      const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / 20;
      const stdDev = Math.sqrt(variance);
      const time = filteredCandles[i].date;
      middle.push({ time, value: Number(sma.toFixed(2)) });
      upper.push({ time, value: Number((sma + 2 * stdDev).toFixed(2)) });
      lower.push({ time, value: Number((sma - 2 * stdDev).toFixed(2)) });
    }
    return { upper, lower, middle };
  }, [closes, filteredCandles]);

  // Render Chart
  useEffect(() => {
    if (!chartContainerRef.current || filteredCandles.length === 0) return;

    // Clean previous chart instance
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const width = container.clientWidth;
    const height = Math.max(380, Math.min(520, window.innerHeight * 0.55));

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(148, 163, 184, 0.4)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(148, 163, 184, 0.4)', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: true,
      borderColor: '#10b981',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      visible: showCandles,
    });

    candleSeries.setData(
      filteredCandles.map((c) => ({
        time: c.date,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
    );
    mainSeriesRef.current = candleSeries;

    // 2. Volume Series
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume_scale',
      });
      chart.priceScale('volume_scale').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      volumeSeries.setData(
        filteredCandles.map((c) => ({
          time: c.date,
          value: Number(c.volume) || 0,
          color: Number(c.close) >= Number(c.open) ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
        }))
      );
    }

    // 3. EMA Overlays
    if (showEma20 && ema20Data.length > 0) {
      const ema20Series = chart.addSeries(LineSeries, {
        color: '#38bdf8',
        lineWidth: 1.5,
        title: 'EMA 20',
      });
      ema20Series.setData(ema20Data);
    }

    if (showEma50 && ema50Data.length > 0) {
      const ema50Series = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1.5,
        title: 'EMA 50',
      });
      ema50Series.setData(ema50Data);
    }

    if (showEma200 && ema200Data.length > 0) {
      const ema200Series = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 2,
        title: 'EMA 200',
      });
      ema200Series.setData(ema200Data);
    }

    // 4. Bollinger Bands Overlays
    if (showBollinger && bollingerData.upper.length > 0) {
      const bbUpper = chart.addSeries(LineSeries, {
        color: 'rgba(56, 189, 248, 0.65)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        title: 'BB Upper',
      });
      bbUpper.setData(bollingerData.upper);

      const bbLower = chart.addSeries(LineSeries, {
        color: 'rgba(56, 189, 248, 0.65)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        title: 'BB Lower',
      });
      bbLower.setData(bollingerData.lower);

      const bbMid = chart.addSeries(LineSeries, {
        color: 'rgba(148, 163, 184, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: 'BB Mid',
      });
      bbMid.setData(bollingerData.middle);
    }

    // 5. Support & Resistance Lines
    if (showSRLevels && levels) {
      if (Array.isArray(levels.resistance)) {
        levels.resistance.slice(0, 2).forEach((r) => {
          candleSeries.createPriceLine({
            price: r.price,
            color: 'rgba(251, 113, 133, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Res: Rs. ${r.price}`,
          });
        });
      }
      if (Array.isArray(levels.support)) {
        levels.support.slice(0, 2).forEach((s) => {
          candleSeries.createPriceLine({
            price: s.price,
            color: 'rgba(52, 211, 153, 0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Sup: Rs. ${s.price}`,
          });
        });
      }
    }

    // 6. Trade Plan Lines (Entry Zone, Stop Loss, Target 1, Target 2)
    if (showTradeLevels && levels) {
      if (levels.target2?.price) {
        candleSeries.createPriceLine({
          price: levels.target2.price,
          color: '#34d399',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🎯 T2: Rs. ${levels.target2.price}`,
        });
      }
      if (levels.target1?.price) {
        candleSeries.createPriceLine({
          price: levels.target1.price,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🎯 T1: Rs. ${levels.target1.price}`,
        });
      }
      if (levels.entryZone?.low) {
        candleSeries.createPriceLine({
          price: levels.entryZone.low,
          color: '#60a5fa',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `Entry Low: Rs. ${levels.entryZone.low}`,
        });
      }
      if (levels.stopLoss?.price) {
        candleSeries.createPriceLine({
          price: levels.stopLoss.price,
          color: '#f43f5e',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `🛑 Stop: Rs. ${levels.stopLoss.price}`,
        });
      }
    }

    // 7. Interactive Crosshair Hover Tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.get(candleSeries)) {
        setTooltipData(null);
        return;
      }

      const bar: any = param.seriesData.get(candleSeries);
      const prevBar = filteredCandles.find((c) => c.date === param.time);
      const chg = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;

      const matchingEma20 = ema20Data.find((d) => d.time === param.time)?.value ?? null;
      const matchingEma50 = ema50Data.find((d) => d.time === param.time)?.value ?? null;

      setTooltipData({
        date: String(param.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        changePct: Number(chg.toFixed(2)),
        volume: Number(prevBar?.volume) || 0,
        ema20: matchingEma20,
        ema50: matchingEma50,
      });
    });

    chart.timeScale().fitContent();

    // Resize Observer for auto-fitting
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [
    filteredCandles,
    timeframe,
    showCandles,
    showVolume,
    showEma20,
    showEma50,
    showEma200,
    showBollinger,
    showSRLevels,
    showTradeLevels,
    levels,
    ema20Data,
    ema50Data,
    ema200Data,
    bollingerData,
  ]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-3 sm:p-4 text-slate-200 shadow-xl space-y-3">
      {/* ── Top Chart Controls Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {symbol} Candlestick Chart
          </span>
          {ltp && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-white">
              Rs. {ltp.toFixed(1)}
            </span>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTimeframe(t.id)}
              className={`px-2.5 py-1 rounded-md font-bold transition ${
                timeframe === t.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Indicator Toggles Bar ── */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-300">
        <button
          onClick={() => setShowCandles((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition ${
            showCandles
              ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          {showCandles ? <Eye size={12} /> : <EyeOff size={12} />} Candles
        </button>

        <button
          onClick={() => setShowVolume((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition ${
            showVolume
              ? 'bg-blue-950/60 border-blue-700/80 text-blue-300'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          {showVolume ? <Eye size={12} /> : <EyeOff size={12} />} Volume
        </button>

        <button
          onClick={() => setShowEma20((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showEma20
              ? 'bg-sky-950/80 border-sky-600 text-sky-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          EMA 20
        </button>

        <button
          onClick={() => setShowEma50((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showEma50
              ? 'bg-amber-950/80 border-amber-600 text-amber-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          EMA 50
        </button>

        <button
          onClick={() => setShowEma200((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showEma200
              ? 'bg-purple-950/80 border-purple-600 text-purple-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          EMA 200
        </button>

        <button
          onClick={() => setShowBollinger((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showBollinger
              ? 'bg-cyan-950/80 border-cyan-600 text-cyan-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          Bollinger
        </button>

        <button
          onClick={() => setShowSRLevels((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showSRLevels
              ? 'bg-indigo-950/80 border-indigo-600 text-indigo-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          S / R Levels
        </button>

        <button
          onClick={() => setShowTradeLevels((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showTradeLevels
              ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          🎯 Entry / Targets
        </button>
      </div>

      {/* ── Active Bar Hover Stats Bar ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs font-mono">
        {tooltipData ? (
          <>
            <span className="text-slate-400 font-bold">{tooltipData.date}</span>
            <span>
              O: <strong className="text-slate-200">{tooltipData.open.toFixed(1)}</strong>
            </span>
            <span>
              H: <strong className="text-emerald-400">{tooltipData.high.toFixed(1)}</strong>
            </span>
            <span>
              L: <strong className="text-rose-400">{tooltipData.low.toFixed(1)}</strong>
            </span>
            <span>
              C: <strong className="text-white">{tooltipData.close.toFixed(1)}</strong>
            </span>
            <span style={{ color: tooltipData.changePct >= 0 ? '#34d399' : '#fb7185' }}>
              {tooltipData.changePct >= 0 ? '+' : ''}
              {tooltipData.changePct}%
            </span>
            <span className="text-slate-400">
              Vol: {Number(tooltipData.volume).toLocaleString()}
            </span>
            {tooltipData.ema20 && (
              <span className="text-sky-400">EMA20: {tooltipData.ema20}</span>
            )}
            {tooltipData.ema50 && (
              <span className="text-amber-400">EMA50: {tooltipData.ema50}</span>
            )}
          </>
        ) : (
          <span className="text-slate-500 text-[11px] italic font-sans">
            Hover over any candle to inspect historical OHLCV, moving averages, and changes.
          </span>
        )}
      </div>

      {/* ── Lightweight Charts DOM Container ── */}
      <div
        ref={chartContainerRef}
        className="w-full relative rounded-xl overflow-hidden border border-slate-800/80"
        style={{ minHeight: '380px' }}
      />
    </div>
  );
}
