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
import { calculateEMA, calculatePivotPoints, calculateFibonacci } from '../../utils/indicators';
import { detectCandlestickPatternsFromHistory } from '../../utils/candlestickPatterns';
import { fetchNepseIntradayGraph } from '../../utils/servicesApi';
import { fetchPriceHistory } from '../../utils/liveData';
import { Layers, Eye, EyeOff, Calendar, Maximize2 } from 'lucide-react';

export interface CandleData {
  date: string | number;
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
  candles?: CandleData[];
  levels?: ChartLevels;
  symbol: string;
  ltp?: number;
  initialTimeframe?: string;
  onFetchMore?: (days: number) => void;
  stock?: any; // for 52W high/low, rvol, etc.
}

const TIMEFRAMES = [
  { id: '1D', label: '1D', days: 1 },
  { id: '1W', label: '1W', days: 5 },
  { id: '1M', label: '1M', days: 22 },
  { id: '3M', label: '3M', days: 66 },
  { id: '6M', label: '6M', days: 132 },
  { id: '1Y', label: '1Y', days: 250 },
  { id: '2Y', label: '2Y', days: 500 },
  { id: 'MAX', label: 'MAX', days: 9999 },
];

// ── Inline RSI (Wilder Smoothed, array version for charting) ──────────────────
function computeRSIArray(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  result[period] = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(0, d)) / period;
    al = (al * (period - 1) + Math.max(0, -d)) / period;
    result[i] = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2);
  }
  return result;
}

// ── Inline MACD for charting (arrays aligned with candle index) ───────────────
function computeMACDArrays(closes: number[], shortP = 12, longP = 26, signalP = 9) {
  const empty = { macdArr: [] as (number | null)[], signalArr: [] as (number | null)[], histArr: [] as (number | null)[] };
  if (closes.length < longP) return empty;
  const shortEMA = calculateEMA(closes, shortP) as (number | null)[];
  const longEMA = calculateEMA(closes, longP) as (number | null)[];
  const macdArr: (number | null)[] = closes.map((_, i) =>
    shortEMA[i] != null && longEMA[i] != null
      ? +(shortEMA[i]! - longEMA[i]!).toFixed(3)
      : null
  );
  // Build signal EMA on the valid MACD sub-array
  const validMacd = macdArr.filter((v): v is number => v !== null);
  const signalEMA = calculateEMA(validMacd, signalP) as (number | null)[];
  let sigIdx = 0;
  const signalArr: (number | null)[] = macdArr.map(v => {
    if (v == null) return null;
    const s = signalEMA[sigIdx++];
    return s != null ? +s.toFixed(3) : null;
  });
  const histArr: (number | null)[] = macdArr.map((m, i) => {
    const s = signalArr[i];
    return m != null && s != null ? +(m - s).toFixed(3) : null;
  });
  return { macdArr, signalArr, histArr };
}

// ── VWAP (cumulative session VWAP over visible window) ───────────────────────
function computeVWAP(candles: CandleData[]): (number | null)[] {
  let cumPV = 0, cumV = 0;
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * (Number(c.volume) || 0);
    cumV += Number(c.volume) || 0;
    return cumV > 0 ? +(cumPV / cumV).toFixed(2) : null;
  });
}

// ── Volume SMA (20 period) ────────────────────────────────────────────────────
function computeVolSMA(volumes: number[], period = 20): (number | null)[] {
  const result: (number | null)[] = new Array(volumes.length).fill(null);
  for (let i = period - 1; i < volumes.length; i++) {
    const slice = volumes.slice(i - period + 1, i + 1);
    result[i] = +(slice.reduce((a, b) => a + b, 0) / period).toFixed(0);
  }
  return result;
}

// ── Parse Intraday Ticks into 5-minute Candles ────────────────────────────────
function parseIntradayCandles(rawTicks: any[], ltp?: number): CandleData[] {
  if (!Array.isArray(rawTicks) || rawTicks.length === 0) return [];
  const intervalSec = 5 * 60; // 5-minute candles
  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  for (const pt of rawTicks) {
    if (!pt) continue;
    let ts: number | null = null;
    let price = 0;
    let vol = 0;

    if (Array.isArray(pt)) {
      const t = pt[0];
      price = Number(pt[1]) || 0;
      vol = Number(pt[2]) || 0;
      if (typeof t === 'number') {
        ts = t > 1e11 ? Math.floor(t / 1000) : Math.floor(t);
      }
    } else {
      price = Number(pt.close ?? pt.price ?? pt.rate ?? pt.ltp ?? pt.open ?? 0);
      vol = Number(pt.volume ?? pt.qty ?? 0);
      if (pt.timestamp && pt.timestamp > 1e8) {
        ts = pt.timestamp > 1e11 ? Math.floor(pt.timestamp / 1000) : Math.floor(pt.timestamp);
      } else if (typeof pt.time === 'number' && pt.time > 1e8) {
        ts = pt.time > 1e11 ? Math.floor(pt.time / 1000) : Math.floor(pt.time);
      } else if (pt.time || pt.date) {
        const timeStr = String(pt.time || pt.date).trim();
        const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
        if (match) {
          let hrs = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          const secs = match[3] ? parseInt(match[3], 10) : 0;
          const ampm = (match[4] || '').toUpperCase();
          if (ampm === 'PM' && hrs < 12) hrs += 12;
          if (ampm === 'AM' && hrs === 12) hrs = 0;
          ts = Math.floor(Date.UTC(year, month, day, hrs, mins, secs) / 1000);
        }
      }
    }

    if (!ts || isNaN(ts) || price <= 0) continue;
    const bucketKey = Math.floor(ts / intervalSec) * intervalSec;

    const existing = buckets.get(bucketKey);
    if (!existing) {
      buckets.set(bucketKey, {
        open: Number(pt.open || price),
        high: Number(pt.high || price),
        low: Number(pt.low || price),
        close: price,
        volume: vol,
      });
    } else {
      existing.high = Math.max(existing.high, price, Number(pt.high || price));
      existing.low = Math.min(existing.low, price, Number(pt.low || price));
      existing.close = price;
      existing.volume += vol;
    }
  }

  const result: CandleData[] = [];
  for (const [bucketSec, b] of buckets.entries()) {
    result.push({
      date: bucketSec,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    });
  }

  result.sort((a, b) => Number(a.date) - Number(b.date));

  if (result.length > 0 && ltp && Number(ltp) > 0) {
    const last = result[result.length - 1];
    last.close = Number(ltp);
    last.high = Math.max(last.high, Number(ltp));
    last.low = Math.min(last.low, Number(ltp));
  }

  return result;
}

export function StockCandlestickChart({
  candles = [],
  levels,
  symbol,
  ltp,
  initialTimeframe = '6M',
  onFetchMore,
  stock,
}: StockCandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [timeframe, setTimeframe] = useState(initialTimeframe || '6M');
  const [internalCandles, setInternalCandles] = useState<CandleData[]>([]);
  const [intradayCandles, setIntradayCandles] = useState<CandleData[]>([]);
  const [intradayLoading, setIntradayLoading] = useState(false);

  // Auto-fetch price history if candles prop is not supplied
  useEffect(() => {
    if (Array.isArray(candles) && candles.length > 0) {
      setInternalCandles(candles);
      return;
    }
    if (!symbol) return;
    let cancelled = false;
    const cleanSym = (symbol === 'NEPSE Index' || symbol === 'nepse' || !symbol) ? 'NEPSE' : symbol.replace(/ Index$/i, '').trim();
    fetchPriceHistory(cleanSym, 500).then((hist: any) => {
      if (cancelled) return;
      const list = Array.isArray(hist) ? hist : (Array.isArray(hist?.data) ? hist.data : []);
      if (list.length > 0) {
        setInternalCandles(list.map((h: any) => ({
          date: String(h.date || h.businessDate || '').slice(0, 10),
          open: Number(h.open || h.openPrice || h.close || 0),
          high: Number(h.high || h.highPrice || h.close || 0),
          low: Number(h.low || h.lowPrice || h.close || 0),
          close: Number(h.close || h.closePrice || h.ltp || 0),
          volume: Number(h.volume || h.totalTradedQuantity || 0)
        })).filter((c: any) => c.date && c.close > 0));
      }
    }).catch(err => console.warn('[StockCandlestickChart] Error loading history:', err));
    return () => { cancelled = true; };
  }, [symbol, candles]);

  // Load intraday data when 1D is selected
  useEffect(() => {
    if (timeframe !== '1D') return;
    let cancelled = false;
    setIntradayLoading(true);
    const cleanSym = (symbol === 'NEPSE Index' || symbol === 'nepse' || !symbol) ? 'NEPSE' : symbol.replace(/ Index$/i, '').trim();
    fetchNepseIntradayGraph(cleanSym).then((ticks: any) => {
      if (cancelled) return;
      const parsed = parseIntradayCandles(ticks, ltp);
      if (parsed.length > 0) {
        setIntradayCandles(parsed);
      }
    }).catch(err => {
      console.warn('[StockCandlestickChart] Intraday fetch error:', err);
    }).finally(() => {
      if (!cancelled) setIntradayLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbol, timeframe, ltp]);

  // ── Indicator Toggles ──
  const [showCandles, setShowCandles] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showEma20, setShowEma20] = useState(false);
  const [showEma50, setShowEma50] = useState(false);
  const [showEma200, setShowEma200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showSRLevels, setShowSRLevels] = useState(true);
  const [showTradeLevels, setShowTradeLevels] = useState(true);
  // ── New toggles ──
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [showVwap, setShowVwap] = useState(false);
  const [showPivots, setShowPivots] = useState(false);
  const [showFib, setShowFib] = useState(false);
  const [show52W, setShow52W] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const [showVolSma, setShowVolSma] = useState(false);

  // Crosshair tooltip
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
    rsi?: number | null;
    macdHist?: number | null;
    vwap?: number | null;
  } | null>(null);

  const activeCandles = (Array.isArray(candles) && candles.length > 0) ? candles : internalCandles;

  // ── Normalize, clean, sort ascending, de-duplicate candles ──────────────────
  const ascendingCandles = useMemo(() => {
    if (!Array.isArray(activeCandles) || activeCandles.length === 0) return [];

    const map = new Map<string, CandleData>();

    for (const c of activeCandles) {
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

      map.set(dateStr, { date: dateStr, open, high, low, close, volume });
    }

    return Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [activeCandles]);

  // ── Filter candles based on timeframe ────────────────────────────────────────
  const filteredCandles = useMemo(() => {
    if (timeframe === '1D') {
      if (intradayCandles.length > 0) return intradayCandles;
      if (ascendingCandles.length > 0) return [ascendingCandles[ascendingCandles.length - 1]];
      return [];
    }
    if (ascendingCandles.length === 0) return [];
    if (timeframe === '1W') {
      return ascendingCandles.slice(-5);
    }
    const tf = TIMEFRAMES.find((t) => t.id === timeframe);
    const days = tf ? tf.days : 132;
    if (days >= 9000 || ascendingCandles.length <= days) return ascendingCandles;
    return ascendingCandles.slice(-days);
  }, [ascendingCandles, intradayCandles, timeframe]);

  const closes = useMemo(() => filteredCandles.map((c) => Number(c.close)), [filteredCandles]);
  const volumes = useMemo(() => filteredCandles.map((c) => Number(c.volume) || 0), [filteredCandles]);

  // ── EMA overlays ──────────────────────────────────────────────────────────────
  const ema20Data = useMemo(() => {
    if (closes.length < 20) return [];
    const ema = calculateEMA(closes, 20);
    const result: Array<{ time: any; value: number }> = [];
    filteredCandles.forEach((c, i) => {
      if (ema && ema[i] != null && !isNaN(ema[i])) {
        result.push({ time: c.date, value: Number(Number(ema[i]).toFixed(2)) });
      }
    });
    return result;
  }, [closes, filteredCandles]);

  const ema50Data = useMemo(() => {
    if (closes.length < 50) return [];
    const ema = calculateEMA(closes, 50);
    const result: Array<{ time: any; value: number }> = [];
    filteredCandles.forEach((c, i) => {
      if (ema && ema[i] != null && !isNaN(ema[i])) {
        result.push({ time: c.date, value: Number(Number(ema[i]).toFixed(2)) });
      }
    });
    return result;
  }, [closes, filteredCandles]);

  const ema200Data = useMemo(() => {
    if (closes.length < 180) return [];
    const ema = calculateEMA(closes, 200);
    const result: Array<{ time: any; value: number }> = [];
    filteredCandles.forEach((c, i) => {
      if (ema && ema[i] != null && !isNaN(ema[i])) {
        result.push({ time: c.date, value: Number(Number(ema[i]).toFixed(2)) });
      }
    });
    return result;
  }, [closes, filteredCandles]);

  // ── Bollinger Bands ───────────────────────────────────────────────────────────
  const bollingerData = useMemo(() => {
    if (closes.length < 20) return { upper: [], lower: [], middle: [] };
    const upper: Array<{ time: any; value: number }> = [];
    const lower: Array<{ time: any; value: number }> = [];
    const middle: Array<{ time: any; value: number }> = [];

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

  // ── RSI array ─────────────────────────────────────────────────────────────────
  const rsiData = useMemo(() => {
    const rsiArr = computeRSIArray(closes, 14);
    const result: Array<{ time: any; value: number }> = [];
    filteredCandles.forEach((c, i) => {
      const v = rsiArr[i];
      if (v != null) result.push({ time: c.date, value: v as number });
    });
    return result;
  }, [closes, filteredCandles]);

  // Current RSI value (last in array)
  const currentRsi = useMemo(() => {
    const last = [...rsiData].reverse().find(d => d != null);
    return last?.value ?? null;
  }, [rsiData]);

  // ── MACD arrays ───────────────────────────────────────────────────────────────
  const macdArrays = useMemo(() => {
    const { macdArr, signalArr, histArr } = computeMACDArrays(closes);
    const macdLine: Array<{ time: any; value: number }> = [];
    const signalLine: Array<{ time: any; value: number }> = [];
    const histogram: Array<{ time: any; value: number; color: string }> = [];

    filteredCandles.forEach((c, i) => {
      const m = macdArr[i], s = signalArr[i], h = histArr[i];
      if (m != null) macdLine.push({ time: c.date, value: m });
      if (s != null) signalLine.push({ time: c.date, value: s });
      if (h != null) histogram.push({
        time: c.date,
        value: h,
        color: h >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)',
      });
    });
    return { macdLine, signalLine, histogram };
  }, [closes, filteredCandles]);

  // Current MACD histogram value
  const currentMacdHist = useMemo(() => {
    const arr = macdArrays.histogram;
    return arr.length > 0 ? arr[arr.length - 1].value : null;
  }, [macdArrays]);

  // ── VWAP ──────────────────────────────────────────────────────────────────────
  const vwapData = useMemo(() => {
    const vwapArr = computeVWAP(filteredCandles);
    const result: Array<{ time: any; value: number }> = [];
    filteredCandles.forEach((c, i) => {
      const v = vwapArr[i];
      if (v != null) result.push({ time: c.date, value: v });
    });
    return result;
  }, [filteredCandles]);

  // ── Volume SMA 20 ─────────────────────────────────────────────────────────────
  const volSmaData = useMemo(() => {
    const smaArr = computeVolSMA(volumes, 20);
    const result: Array<{ time: any; value: number }> = [];
    filteredCandles.forEach((c, i) => {
      const v = smaArr[i];
      if (v != null) result.push({ time: c.date, value: v });
    });
    return result;
  }, [volumes, filteredCandles]);

  // ── Pivot Points (from last candle) ──────────────────────────────────────────
  const pivotData = useMemo(() => {
    if (filteredCandles.length === 0) return null;
    const last = filteredCandles[filteredCandles.length - 1];
    const h = Number(last.high || last.close || 0);
    const l = Number(last.low || last.close || 0);
    const c = Number(last.close || 0);
    if (c <= 0) return null;
    const P = +( (h + l + c) / 3 ).toFixed(2);
    return {
      P,
      pp: P,
      R1: +(2 * P - l).toFixed(2),
      R2: +(P + (h - l)).toFixed(2),
      R3: +(h + 2 * (P - l)).toFixed(2),
      S1: +(2 * P - h).toFixed(2),
      S2: +(P - (h - l)).toFixed(2),
      S3: +(l - 2 * (h - P)).toFixed(2),
    };
  }, [filteredCandles]);

  // ── Fibonacci retracement (from visible swing high/low) ───────────────────────
  const fibData = useMemo(() => {
    if (filteredCandles.length < 5) return null;
    const highs = filteredCandles.map(c => Number(c.high || c.close || 0));
    const lows = filteredCandles.map(c => Number(c.low || c.close || 0)).filter(v => v > 0);
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);
    if (swingHigh <= swingLow) return null;
    const diff = swingHigh - swingLow;
    return {
      level_0: +swingHigh.toFixed(2),
      level_236: +(swingHigh - diff * 0.236).toFixed(2),
      level_382: +(swingHigh - diff * 0.382).toFixed(2),
      level_500: +(swingHigh - diff * 0.5).toFixed(2),
      level_618: +(swingHigh - diff * 0.618).toFixed(2),
      level_786: +(swingHigh - diff * 0.786).toFixed(2),
      level_1000: +swingLow.toFixed(2),
    };
  }, [filteredCandles]);

  // ── Candlestick pattern markers ───────────────────────────────────────────────
  const patternMarkers = useMemo(() => {
    if (filteredCandles.length === 0) return [];
    try {
      const detections: any[] = detectCandlestickPatternsFromHistory(filteredCandles, null);
      if (!Array.isArray(detections)) return [];

      // Map to lightweight-charts marker format
      const markers: Array<{
        time: string;
        position: 'aboveBar' | 'belowBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown' | 'circle';
        text: string;
        size: number;
      }> = [];

      const datesSeen = new Set<string>();
      for (const det of detections) {
        const time = String(det.date || '').slice(0, 10);
        if (!time || datesSeen.has(time + det.id)) continue;
        datesSeen.add(time + det.id);
        const isBullish = det.type === 'bullish';
        markers.push({
          time,
          position: isBullish ? 'belowBar' : 'aboveBar',
          color: isBullish ? '#10b981' : '#f43f5e',
          shape: isBullish ? 'arrowUp' : 'arrowDown',
          text: det.name || det.id || '',
          size: 1,
        });
      }
      // Must be sorted ascending by time for lightweight-charts
      return markers.sort((a, b) => a.time.localeCompare(b.time));
    } catch {
      return [];
    }
  }, [filteredCandles]);

  // ── 52W levels from stock prop ────────────────────────────────────────────────
  const high52w = useMemo(() => {
    const v = Number(stock?.high52w || 0);
    return v > 0 ? v : null;
  }, [stock]);

  const low52w = useMemo(() => {
    const v = Number(stock?.low52w || 0);
    return v > 0 ? v : null;
  }, [stock]);

  // ── RVOL from stock prop ──────────────────────────────────────────────────────
  const rvol = useMemo(() => {
    const v = Number(stock?.rvol || stock?.volumeSurgeRatio || 0);
    return v > 0 ? v : null;
  }, [stock]);

  // ── Sub-pane count for dynamic layout ────────────────────────────────────────
  const subPaneCount = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);

  // ── Render Chart ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current || filteredCandles.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const width = container.clientWidth;

    // Dynamic height: base + 90px per sub-pane
    const baseHeight = Math.max(400, Math.min(520, window.innerHeight * 0.55));
    const height = baseHeight + subPaneCount * 90;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 12,
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

    // Safe scaleMargins helper: strictly ensures top >= 0, bottom >= 0, and (top + bottom) <= 0.88 (< 1.0)
    const safeScaleMargins = (top: number, bottom: number) => {
      let t = Math.max(0, Math.min(0.95, Number(top) || 0));
      let b = Math.max(0, Math.min(0.95, Number(bottom) || 0));
      if (t + b >= 0.95) {
        const factor = 0.88 / (t + b);
        t = Number((t * factor).toFixed(3));
        b = Number((b * factor).toFixed(3));
      }
      return { top: t, bottom: b };
    };

    // ── Dynamic main price pane bottom margin to leave room for sub-panes ──
    let mainBottom = 0.20; // default: volume only
    let volTop = 0.80, volBottom = 0.02;
    let rsiTop = 0, rsiBottom = 0;
    let macdTop = 0, macdBottom = 0;

    if (subPaneCount === 1 && showRsi) {
      mainBottom = 0.30;
      volTop = 0.55; volBottom = 0.30;
      rsiTop = 0.73; rsiBottom = 0.02;
    } else if (subPaneCount === 1 && showMacd) {
      mainBottom = 0.30;
      volTop = 0.55; volBottom = 0.30;
      macdTop = 0.73; macdBottom = 0.02;
    } else if (subPaneCount === 2) {
      mainBottom = 0.46;
      volTop = 0.40; volBottom = 0.46;
      rsiTop = 0.56; rsiBottom = 0.24;
      macdTop = 0.78; macdBottom = 0.02;
    }

    chart.priceScale('right').applyOptions({
      scaleMargins: safeScaleMargins(0.05, mainBottom),
    });

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

    // Pattern markers
    if (showPatterns && patternMarkers.length > 0) {
      try {
        candleSeries.setMarkers(patternMarkers as any);
      } catch { /* ignore */ }
    }

    // 2. Volume Series
    let volumeSeries: ISeriesApi<'Histogram'> | null = null;
    if (showVolume) {
      volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume_scale',
      });
      chart.priceScale('volume_scale').applyOptions({
        scaleMargins: safeScaleMargins(volTop, volBottom),
      });

      volumeSeries.setData(
        filteredCandles.map((c) => ({
          time: c.date,
          value: Number(c.volume) || 0,
          color: Number(c.close) >= Number(c.open) ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
        }))
      );

      // Volume SMA 20 overlay on volume pane
      if (showVolSma && volSmaData.length > 0) {
        const volSmaSeries = chart.addSeries(LineSeries, {
          color: 'rgba(251, 191, 36, 0.85)',
          lineWidth: 1.5,
          title: 'Vol SMA20',
          priceScaleId: 'volume_scale',
          lastValueVisible: false,
        });
        volSmaSeries.setData(volSmaData);
      }
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

    // 4. Bollinger Bands
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

    // 5. VWAP (main pane overlay)
    if (showVwap && vwapData.length > 0) {
      const vwapSeries = chart.addSeries(LineSeries, {
        color: '#fbbf24',
        lineWidth: 1.5,
        lineStyle: LineStyle.Dashed,
        title: 'VWAP',
      });
      vwapSeries.setData(vwapData);
    }

    // 6. Support & Resistance Lines
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

    // 7. Trade Plan Lines
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

    // 8. Pivot Points price lines on main pane
    if (showPivots && pivotData) {
      const pivotLines = [
        { price: pivotData.P, color: '#e2e8f0', label: `PP: ${pivotData.P}` },
        { price: pivotData.R1, color: '#34d399', label: `R1: ${pivotData.R1}` },
        { price: pivotData.R2, color: '#6ee7b7', label: `R2: ${pivotData.R2}` },
        { price: pivotData.R3, color: '#a7f3d0', label: `R3: ${pivotData.R3}` },
        { price: pivotData.S1, color: '#fb7185', label: `S1: ${pivotData.S1}` },
        { price: pivotData.S2, color: '#fda4af', label: `S2: ${pivotData.S2}` },
        { price: pivotData.S3, color: '#fecdd3', label: `S3: ${pivotData.S3}` },
      ];
      for (const pl of pivotLines) {
        if (pl.price > 0) {
          candleSeries.createPriceLine({
            price: pl.price,
            color: pl.color,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: pl.label,
          });
        }
      }
    }

    // 9. Fibonacci Retracement levels
    if (showFib && fibData) {
      const fibLevels = [
        { price: fibData.level_0, color: '#c4b5fd', label: `Fib 0%: ${fibData.level_0}` },
        { price: fibData.level_236, color: '#a78bfa', label: `Fib 23.6%: ${fibData.level_236}` },
        { price: fibData.level_382, color: '#8b5cf6', label: `Fib 38.2%: ${fibData.level_382}` },
        { price: fibData.level_500, color: '#7c3aed', label: `Fib 50%: ${fibData.level_500}` },
        { price: fibData.level_618, color: '#6d28d9', label: `Fib 61.8%: ${fibData.level_618}` },
        { price: fibData.level_786, color: '#5b21b6', label: `Fib 78.6%: ${fibData.level_786}` },
        { price: fibData.level_1000, color: '#4c1d95', label: `Fib 100%: ${fibData.level_1000}` },
      ];
      for (const fl of fibLevels) {
        if (fl.price > 0) {
          candleSeries.createPriceLine({
            price: fl.price,
            color: fl.color,
            lineWidth: 1,
            lineStyle: LineStyle.LargeDashed,
            axisLabelVisible: true,
            title: fl.label,
          });
        }
      }
    }

    // 10. 52W High / Low price lines
    if (show52W) {
      if (high52w != null && high52w > 0) {
        candleSeries.createPriceLine({
          price: high52w,
          color: '#34d399',
          lineWidth: 2,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: `52W High: Rs. ${high52w}`,
        });
      }
      if (low52w != null && low52w > 0) {
        candleSeries.createPriceLine({
          price: low52w,
          color: '#fb7185',
          lineWidth: 2,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: `52W Low: Rs. ${low52w}`,
        });
      }
    }

    // 11. RSI sub-pane
    let rsiSeriesRef: ISeriesApi<'Line'> | null = null;
    if (showRsi && rsiData.length > 0) {
      rsiSeriesRef = chart.addSeries(LineSeries, {
        color: '#f472b6',
        lineWidth: 1.5,
        title: 'RSI(14)',
        priceScaleId: 'rsi_scale',
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      });
      chart.priceScale('rsi_scale').applyOptions({
        scaleMargins: safeScaleMargins(rsiTop, rsiBottom),
        autoScale: false,
        entireTextOnly: true,
      });
      rsiSeriesRef.setData(rsiData);
      // 70 / 30 reference lines
      rsiSeriesRef.createPriceLine({ price: 70, color: 'rgba(251, 113, 133, 0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'OB' });
      rsiSeriesRef.createPriceLine({ price: 30, color: 'rgba(52, 211, 153, 0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'OS' });
      rsiSeriesRef.createPriceLine({ price: 50, color: 'rgba(148, 163, 184, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
    }

    // 12. MACD sub-pane
    if (showMacd) {
      if (macdArrays.histogram.length > 0) {
        const macdHistSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
          priceScaleId: 'macd_scale',
          title: 'MACD Hist',
        });
        chart.priceScale('macd_scale').applyOptions({
          scaleMargins: safeScaleMargins(macdTop, macdBottom),
          autoScale: true,
          entireTextOnly: true,
        });
        macdHistSeries.setData(macdArrays.histogram as any);
      }
      if (macdArrays.macdLine.length > 0) {
        const macdLineSeries = chart.addSeries(LineSeries, {
          color: '#38bdf8',
          lineWidth: 1.5,
          title: 'MACD',
          priceScaleId: 'macd_scale',
          lastValueVisible: false,
        });
        macdLineSeries.setData(macdArrays.macdLine);
      }
      if (macdArrays.signalLine.length > 0) {
        const signalLineSeries = chart.addSeries(LineSeries, {
          color: '#fb923c',
          lineWidth: 1.5,
          title: 'Signal',
          priceScaleId: 'macd_scale',
          lastValueVisible: false,
        });
        signalLineSeries.setData(macdArrays.signalLine);
      }
    }

    // 13. Interactive Crosshair Tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.get(candleSeries)) {
        setTooltipData(null);
        return;
      }

      const bar: any = param.seriesData.get(candleSeries);
      const prevBar = filteredCandles.find((c) => c.date === param.time || String(c.date) === String(param.time));
      const chg = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;

      const matchingEma20 = ema20Data.find((d) => d.time === param.time)?.value ?? null;
      const matchingEma50 = ema50Data.find((d) => d.time === param.time)?.value ?? null;
      const matchingRsi = rsiData.find((d) => d.time === param.time)?.value ?? null;
      const matchingHist = macdArrays.histogram.find((d) => d.time === param.time)?.value ?? null;
      const matchingVwap = vwapData.find((d) => d.time === param.time)?.value ?? null;

      const dateStr = typeof param.time === 'number'
        ? new Date(param.time * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : String(param.time);

      setTooltipData({
        date: dateStr,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        changePct: Number(chg.toFixed(2)),
        volume: Number(prevBar?.volume) || 0,
        ema20: matchingEma20,
        ema50: matchingEma50,
        rsi: matchingRsi,
        macdHist: matchingHist,
        vwap: matchingVwap,
      });
    });

    chart.timeScale().fitContent();

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
    showRsi,
    showMacd,
    showVwap,
    showPivots,
    showFib,
    show52W,
    showPatterns,
    showVolSma,
    levels,
    ema20Data,
    ema50Data,
    ema200Data,
    bollingerData,
    rsiData,
    macdArrays,
    vwapData,
    volSmaData,
    pivotData,
    fibData,
    high52w,
    low52w,
    patternMarkers,
    subPaneCount,
  ]);

  // ── RVOL badge helper ─────────────────────────────────────────────────────────
  const rvolBadge = useMemo(() => {
    if (rvol == null) return null;
    if (rvol >= 1.5) return { emoji: '🔥', color: '#f59e0b', label: `RVOL ${rvol.toFixed(2)}x` };
    if (rvol <= 0.5) return { emoji: '💤', color: '#64748b', label: `RVOL ${rvol.toFixed(2)}x` };
    return { emoji: '', color: '#94a3b8', label: `RVOL ${rvol.toFixed(2)}x` };
  }, [rvol]);

  const rsiColor = currentRsi != null
    ? currentRsi >= 70 ? '#fb7185' : currentRsi <= 30 ? '#34d399' : '#f472b6'
    : '#94a3b8';

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
          {rvolBadge && (
            <span className="text-xs font-bold px-2 py-0.5 rounded border" style={{ color: rvolBadge.color, borderColor: rvolBadge.color + '55', background: rvolBadge.color + '18' }}>
              {rvolBadge.emoji} {rvolBadge.label}
            </span>
          )}
          {currentRsi != null && (
            <span className="text-xs font-bold px-2 py-0.5 rounded border" style={{ color: rsiColor, borderColor: rsiColor + '55', background: rsiColor + '18' }}>
              RSI {currentRsi}
            </span>
          )}
          {currentMacdHist != null && (
            <span className="text-xs font-bold px-2 py-0.5 rounded border"
              style={{
                color: currentMacdHist >= 0 ? '#34d399' : '#fb7185',
                borderColor: (currentMacdHist >= 0 ? '#34d399' : '#fb7185') + '55',
                background: (currentMacdHist >= 0 ? '#34d399' : '#fb7185') + '18'
              }}>
              MACD Hist {currentMacdHist >= 0 ? '▲' : '▼'} {Math.abs(currentMacdHist).toFixed(2)}
            </span>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTimeframe(t.id);
                if (onFetchMore && t.days > ascendingCandles.length + 30) {
                  onFetchMore(t.days);
                }
              }}
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
        {/* Existing toggles */}
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
          onClick={() => setShowVolSma((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showVolSma
              ? 'bg-yellow-950/80 border-yellow-600 text-yellow-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          Vol SMA20
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

        {/* New toggles */}
        <button
          onClick={() => setShowVwap((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showVwap
              ? 'bg-yellow-950/80 border-yellow-500 text-yellow-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          VWAP
        </button>

        <button
          onClick={() => setShowRsi((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showRsi
              ? 'bg-pink-950/80 border-pink-600 text-pink-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          RSI
        </button>

        <button
          onClick={() => setShowMacd((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showMacd
              ? 'bg-sky-950/80 border-sky-500 text-sky-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          MACD
        </button>

        <button
          onClick={() => setShowPivots((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showPivots
              ? 'bg-slate-700/80 border-slate-400 text-slate-200 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          Pivots
        </button>

        <button
          onClick={() => setShowFib((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showFib
              ? 'bg-violet-950/80 border-violet-500 text-violet-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          Fibonacci
        </button>

        <button
          onClick={() => setShow52W((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            show52W
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          52W H/L
        </button>

        <button
          onClick={() => setShowPatterns((v) => !v)}
          className={`px-2.5 py-1 rounded-md border transition ${
            showPatterns
              ? 'bg-orange-950/80 border-orange-600 text-orange-300 font-bold'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          🕯 Patterns
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

      {/* ── Pivot & Fib quick-reference chips (when enabled) ── */}
      {(showPivots && pivotData) && (
        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
          {[
            { label: 'PP', value: pivotData.P, color: '#e2e8f0' },
            { label: 'R1', value: pivotData.R1, color: '#34d399' },
            { label: 'R2', value: pivotData.R2, color: '#6ee7b7' },
            { label: 'S1', value: pivotData.S1, color: '#fb7185' },
            { label: 'S2', value: pivotData.S2, color: '#fda4af' },
          ].map(p => (
            <span key={p.label} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800" style={{ color: p.color }}>
              {p.label}: {p.value}
            </span>
          ))}
          {high52w && <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-300">52W H: {high52w}</span>}
          {low52w && <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-rose-300">52W L: {low52w}</span>}
        </div>
      )}

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
            {tooltipData.vwap != null && (
              <span className="text-yellow-400">VWAP: {tooltipData.vwap}</span>
            )}
            {tooltipData.rsi != null && (
              <span style={{ color: rsiColor }}>RSI: {tooltipData.rsi}</span>
            )}
            {tooltipData.macdHist != null && (
              <span style={{ color: tooltipData.macdHist >= 0 ? '#34d399' : '#fb7185' }}>
                MACD Hist: {tooltipData.macdHist >= 0 ? '+' : ''}{tooltipData.macdHist}
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-500 text-[11px] italic font-sans">
            Hover over any candle to inspect OHLCV, EMAs, VWAP, RSI, MACD, and pattern signals.
          </span>
        )}
      </div>

      {/* ── Lightweight Charts DOM Container ── */}
      <div
        ref={chartContainerRef}
        className="w-full relative rounded-xl overflow-hidden border border-slate-800/80"
        style={{ minHeight: '400px' }}
      />

      {/* ── Legend / Pattern summary ── */}
      {showPatterns && patternMarkers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[10px] pt-0.5">
          <span className="text-slate-500 font-medium">Detected:</span>
          {patternMarkers.slice(-6).map((m, i) => (
            <span key={i} className="px-2 py-0.5 rounded border"
              style={{
                color: m.color,
                borderColor: m.color + '55',
                background: m.color + '18',
              }}>
              {m.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
