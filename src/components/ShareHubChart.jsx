import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  LineStyle,
  createSeriesMarkers,
} from 'lightweight-charts';
import { fetchRealPriceHistory } from '../utils/liveData';
import { fetchNepseIntradayGraph } from '../utils/servicesApi';
import {
  Activity,
  Maximize2,
  Minimize2,
  TrendingUp,
  BarChart2,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { aggregateToWeeklyCandles } from '../utils/priceAdjustment';
import {
  calculateEMA,
  calculatePivotPoints,
  calculateFibonacci,
} from '../utils/indicators';
import { detectCandlestickPatternsFromHistory } from '../utils/candlestickPatterns';

const TIMEFRAMES = [
  { id: '1D',     label: '1D',     days: 1    },
  { id: '1W',     label: '1W',     days: 7    },
  { id: '1M',     label: '1M',     days: 30   },
  { id: '3M',     label: '3M',     days: 90   },
  { id: '6M',     label: '6M',     days: 180  },
  { id: '1Y',     label: '1Y',     days: 365  },
  { id: 'WEEKLY', label: 'Wkly',   days: 1000 },
  { id: 'ALL',    label: 'All',    days: 1000 },
];

/**
 * Nepal Timezone Offset (UTC+5:45) in seconds = 20,700
 */
export const NPT_OFFSET_SEC = 5 * 3600 + 45 * 60;

function getDatasetSessionDate(points, rawHistory) {
  if (Array.isArray(points) && points.length > 0) {
    for (const pt of points) {
      if (pt.date && /^\d{4}-\d{2}-\d{2}/.test(String(pt.date))) {
        const parts = String(pt.date).split('-');
        return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) - 1, day: parseInt(parts[2], 10) };
      }
      if (pt.timestamp && pt.timestamp > 1e8) {
        const sec = pt.timestamp > 1e11 ? Math.floor(pt.timestamp / 1000) : Math.floor(pt.timestamp);
        const d = new Date(sec * 1000);
        return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
      }
    }
  }
  if (Array.isArray(rawHistory) && rawHistory.length > 0) {
    const latest = rawHistory[rawHistory.length - 1];
    const dStr = String(latest?.date || latest?.time || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(dStr)) {
      const parts = dStr.split('-');
      return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) - 1, day: parseInt(parts[2], 10) };
    }
  }
  const nowNpt = new Date(Date.now() + NPT_OFFSET_SEC * 1000);
  return { year: nowNpt.getUTCFullYear(), month: nowNpt.getUTCMonth(), day: nowNpt.getUTCDate() };
}

function formatNptDate(dateObj) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
}

function formatNptTime(epochSec) {
  const d = new Date(epochSec * 1000);
  const hrs = d.getUTCHours();
  const mins = d.getUTCMinutes();
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  const h12 = hrs % 12 || 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

function formatNptFullDate(dateStrOrSec) {
  if (typeof dateStrOrSec === 'number') {
    return formatNptTime(dateStrOrSec) + ' NPT';
  }
  const str = String(dateStrOrSec).trim();
  const d = new Date(str.includes('T') ? str : str + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

// ── Mathematical Helpers for Technical Indicators ─────────────────────────────
function computeRSIArray(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
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

function computeMACDArrays(closes, shortP = 12, longP = 26, signalP = 9) {
  const empty = { macdArr: [], signalArr: [], histArr: [] };
  if (closes.length < longP) return empty;
  const shortEMA = calculateEMA(closes, shortP);
  const longEMA = calculateEMA(closes, longP);
  const macdArr = closes.map((_, i) =>
    shortEMA[i] != null && longEMA[i] != null
      ? +(shortEMA[i] - longEMA[i]).toFixed(3)
      : null
  );
  const validMacd = macdArr.filter(v => v !== null);
  const signalEMA = calculateEMA(validMacd, signalP);
  let sigIdx = 0;
  const signalArr = macdArr.map(v => {
    if (v == null) return null;
    const s = signalEMA[sigIdx++];
    return s != null ? +s.toFixed(3) : null;
  });
  const histArr = macdArr.map((m, i) => {
    const s = signalArr[i];
    return m != null && s != null ? +(m - s).toFixed(3) : null;
  });
  return { macdArr, signalArr, histArr };
}

function computeVWAP(candles) {
  let cumPV = 0, cumV = 0;
  return candles.map(c => {
    const tp = (Number(c.high ?? c.close) + Number(c.low ?? c.close) + Number(c.close)) / 3;
    const vol = Number(c.volume) || 0;
    cumPV += tp * vol;
    cumV += vol;
    return cumV > 0 ? +(cumPV / cumV).toFixed(2) : null;
  });
}

function computeVolSMA(volumes, period = 20) {
  const result = new Array(volumes.length).fill(null);
  for (let i = period - 1; i < volumes.length; i++) {
    const slice = volumes.slice(i - period + 1, i + 1);
    result[i] = +(slice.reduce((a, b) => a + b, 0) / period).toFixed(0);
  }
  return result;
}

export default function ShareHubChart({
  history,
  symbol = 'NEPSE',
  mode = 'line',
  chartTimeframe = '1M',
  height,
  isIntraday = false,
  stock = null,
  showTimeframeBar = true,
  showAdvancedChartBtn = true,
  onTimeframeChange = null,
  onOpenTradingView = null,
  onToggleFullscreen = null,
  isFullscreen = false,
  entryExitPlan = null,
  brokerAnalysis = null,
  floorsheetData = null
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const mainSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  const activeIsFullscreen = Boolean(isFullscreen);

  const [activeTf, setActiveTf] = useState(chartTimeframe || '1M');
  const [activeMode, setActiveMode] = useState(mode || 'line');
  const [rawHistory, setRawHistory] = useState(Array.isArray(history) && history.length > 0 ? history : []);
  const [intradayData, setIntradayData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoverData, setHoverData] = useState(null);

  // ── Technical Indicator Toggles for Analyst Workstation (Active in Fullscreen) ──
  const isIndividualStock = symbol && symbol !== 'NEPSE' && symbol !== 'NEPSE Index';
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [showEma200, setShowEma200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVwap, setShowVwap] = useState(isIndividualStock);
  const [showPivots, setShowPivots] = useState(false);
  const [showFib, setShowFib] = useState(false);
  const [show52W, setShow52W] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);
  const [showRsi, setShowRsi] = useState(true);
  const [showMacd, setShowMacd] = useState(false);
  const [showVolSma, setShowVolSma] = useState(true);
  const [showTradePlan, setShowTradePlan] = useState(isIndividualStock);
  const [showInstVwap, setShowInstVwap] = useState(isIndividualStock);
  const [showPoc, setShowPoc] = useState(isIndividualStock);

  // When in inline mode (!activeIsFullscreen), FORCE ALL OVERLAYS & INDICATORS OFF for 100% clean chart
  const effectiveShowEma20 = activeIsFullscreen && showEma20;
  const effectiveShowEma50 = activeIsFullscreen && showEma50;
  const effectiveShowEma200 = activeIsFullscreen && showEma200;
  const effectiveShowBollinger = activeIsFullscreen && showBollinger;
  const effectiveShowVwap = activeIsFullscreen && showVwap;
  const effectiveShowPivots = activeIsFullscreen && showPivots;
  const effectiveShowFib = activeIsFullscreen && showFib;
  const effectiveShow52W = activeIsFullscreen && show52W;
  const effectiveShowPatterns = activeIsFullscreen && showPatterns;
  const effectiveShowRsi = activeIsFullscreen && showRsi;
  const effectiveShowMacd = activeIsFullscreen && showMacd;
  const effectiveShowVolSma = activeIsFullscreen && showVolSma;
  const effectiveShowTradePlan = activeIsFullscreen && showTradePlan;
  const effectiveShowInstVwap = activeIsFullscreen && showInstVwap;
  const effectiveShowPoc = activeIsFullscreen && showPoc;

  // Sync props when chartTimeframe or mode changes from parent
  useEffect(() => {
    if (chartTimeframe) setActiveTf(chartTimeframe);
  }, [chartTimeframe]);

  useEffect(() => {
    if (mode) setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    if (Array.isArray(history) && history.length > 0) {
      setRawHistory(history);
      setLoading(false);
      setError(null);
    }
  }, [history]);

  useEffect(() => {
    if (Array.isArray(history) && history.length > 0) {
      setLoading(false);
      return;
    }
    if (!symbol) return;

    let isMounted = true;
    setLoading(true);

    async function loadData() {
      try {
        const cleanSymbol = (symbol === 'NEPSE Index' || symbol === 'nepse') ? 'NEPSE' : symbol;
        const data = await fetchRealPriceHistory(cleanSymbol, 500);
        if (!isMounted) return;
        if (!data || data.length === 0) {
          throw new Error('No historical records found for ' + cleanSymbol);
        }
        setRawHistory(data);
        setError(null);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
      setLoading(false);
    };
  }, [symbol, history]);

  // Autonomous Intraday Fetch
  useEffect(() => {
    if (activeTf !== '1D') return;

    const hasIntradayInHistory = Array.isArray(rawHistory) && rawHistory.length > 1 && rawHistory.some(pt => {
      const timeStr = String(pt.time || pt.date || '');
      if (/\d{1,2}:\d{2}/.test(timeStr)) return true;
      if (pt.timestamp && pt.timestamp > 1e8) {
        const sec = pt.timestamp > 1e11 ? Math.floor(pt.timestamp / 1000) : Math.floor(pt.timestamp);
        return (sec % 86400) !== 0;
      }
      return false;
    });

    if (hasIntradayInHistory) {
      setIntradayData(rawHistory);
      setLoading(false);
      return;
    }

    let isMounted = true;
    if (rawHistory.length === 0) setLoading(true);

    async function loadIntraday() {
      try {
        const cleanSymbol = (symbol === 'NEPSE Index' || symbol === 'nepse' || !symbol) ? 'NEPSE' : symbol;
        const res = await fetchNepseIntradayGraph(cleanSymbol);
        if (!isMounted) return;
        if (res && Array.isArray(res) && res.length > 0) {
          setIntradayData(res);
          setError(null);
        }
      } catch (err) {
        console.warn('[ShareHubChart] Intraday fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadIntraday();
    return () => {
      isMounted = false;
      setLoading(false);
    };
  }, [activeTf, symbol, rawHistory]);

  const activeDataset = useMemo(() => {
    if (activeTf === '1D' && intradayData.length > 0) {
      return intradayData;
    }
    return rawHistory;
  }, [activeTf, intradayData, rawHistory]);

  const isTrulyIntraday = useMemo(() => {
    return activeTf === '1D';
  }, [activeTf]);

  const aggregateToIntradayCandles = useCallback((points, intervalMinutes = 5) => {
    if (!Array.isArray(points) || points.length === 0) return [];
    const intervalSec = intervalMinutes * 60;
    const buckets = new Map();
    const sDate = getDatasetSessionDate(points, rawHistory);

    for (const pt of points) {
      let ts = null;
      if (pt.timestamp && pt.timestamp > 1e8) {
        const sec = pt.timestamp > 1e11 ? Math.floor(pt.timestamp / 1000) : Math.floor(pt.timestamp);
        ts = sec + NPT_OFFSET_SEC;
      } else if (typeof pt.time === 'number' && pt.time > 1e8) {
        const sec = pt.time > 1e11 ? Math.floor(pt.time / 1000) : Math.floor(pt.time);
        ts = sec + NPT_OFFSET_SEC;
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
          ts = Math.floor(Date.UTC(sDate.year, sDate.month, sDate.day, hrs, mins, secs) / 1000);
        }
      }
      if (!ts || isNaN(ts)) continue;

      const bucketKey = Math.floor(ts / intervalSec) * intervalSec;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey).push({ ...pt, ts });
    }

    const candles = [];
    for (const [bucketSec, bPoints] of buckets.entries()) {
      bPoints.sort((a, b) => a.ts - b.ts);
      const open = Number(bPoints[0].open ?? bPoints[0].close ?? 0);
      const close = Number(bPoints[bPoints.length - 1].close ?? 0);
      const high = Math.max(...bPoints.map(p => Number(p.high ?? p.close ?? open)));
      const low = Math.min(...bPoints.map(p => Number(p.low ?? p.close ?? open)));
      const volume = bPoints.reduce((sum, p) => sum + (Number(p.volume) || 0), 0);

      candles.push({
        time: bucketSec,
        open: open || close,
        high: Math.max(open, high, close),
        low: Math.min(open, low, close),
        close,
        volume,
        epochSec: bucketSec
      });
    }

    candles.sort((a, b) => a.time - b.time);
    return candles;
  }, [rawHistory]);

  const processedChartData = useMemo(() => {
    if (activeTf === '1D') {
      let intradaySource = intradayData.length > 0 ? intradayData : [];
      if (intradaySource.length === 0 && Array.isArray(rawHistory) && rawHistory.length > 1) {
        const hasIntraday = rawHistory.some(pt => /\d{1,2}:\d{2}/.test(String(pt.time || pt.date || '')));
        if (hasIntraday) intradaySource = rawHistory;
      }

      if (activeMode === 'candle') {
        const aggregated = aggregateToIntradayCandles(intradaySource, 5);
        if (stock?.ltp && Number(stock.ltp) > 0 && aggregated.length > 0) {
          const last = aggregated[aggregated.length - 1];
          const target = Number(stock.ltp);
          last.close = target;
          last.high = Math.max(Number(last.high || target), target);
          last.low = Math.min(Number(last.low || target), target);
        }
        return aggregated;
      }

      const sDate = getDatasetSessionDate(intradaySource, rawHistory);
      const sorted = [];
      for (const pt of intradaySource) {
        let ts = null;
        if (pt.timestamp && pt.timestamp > 1e8) {
          const sec = pt.timestamp > 1e11 ? Math.floor(pt.timestamp / 1000) : Math.floor(pt.timestamp);
          ts = sec + NPT_OFFSET_SEC;
        } else if (typeof pt.time === 'number' && pt.time > 1e8) {
          const sec = pt.time > 1e11 ? Math.floor(pt.time / 1000) : Math.floor(pt.time);
          ts = sec + NPT_OFFSET_SEC;
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
            ts = Math.floor(Date.UTC(sDate.year, sDate.month, sDate.day, hrs, mins, secs) / 1000);
          }
        }
        const val = Number(pt.close ?? pt.value ?? pt.open ?? 0);
        if (ts && !isNaN(ts) && val > 0) {
          sorted.push({
            time: ts,
            value: val,
            open: Number(pt.open || val),
            high: Number(pt.high || val),
            low: Number(pt.low || val),
            close: val,
            volume: Number(pt.volume || 0),
            epochSec: ts
          });
        }
      }
      sorted.sort((a, b) => a.time - b.time);
      const unique = [];
      const seen = new Set();
      for (const item of sorted) {
        if (!seen.has(item.time)) {
          seen.add(item.time);
          unique.push(item);
        }
      }
      if (stock?.ltp && Number(stock.ltp) > 0 && unique.length > 0) {
        const last = unique[unique.length - 1];
        const target = Number(stock.ltp);
        last.close = target;
        last.value = target;
        last.high = Math.max(Number(last.high || target), target);
        last.low = Math.min(Number(last.low || target), target);
      }
      return unique;
    }

    if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
    const map = new Map();
    for (const d of rawHistory) {
      let dateKey = null;
      const str = String(d.date || d.time || '').trim();

      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        dateKey = str;
      } else {
        let dObj = new Date(str);
        if (isNaN(dObj.getTime()) && d.timestamp) {
          dObj = new Date(d.timestamp > 1e11 ? d.timestamp : d.timestamp * 1000);
        }
        if (!isNaN(dObj.getTime())) {
          dateKey = formatNptDate(dObj);
        }
      }

      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;

      const open = Number(d.open ?? d.close ?? 0);
      const high = Number(d.high ?? d.close ?? 0);
      const low = Number(d.low ?? d.close ?? 0);
      const close = Number(d.close ?? 0);
      const volume = Number(d.volume ?? 0);
      if (isNaN(close) || close <= 0) continue;

      map.set(dateKey, {
        time: dateKey,
        open: open || close,
        high: Math.max(open, high, close),
        low: Math.min(open, low, close),
        close,
        value: close,
        volume,
        dateStr: dateKey
      });
    }

    const allSorted = Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
    if (allSorted.length === 0) return [];

    const tf = String(activeTf || '1M').toUpperCase();
    const latestDate = new Date(allSorted[allSorted.length - 1].time + 'T00:00:00Z');

    let sliced = allSorted;
    if (tf === '1W' || tf === '7') {
      const oneWeekAgo = new Date(latestDate.getTime() - 7 * 24 * 3600 * 1000);
      const weekBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= oneWeekAgo);
      sliced = weekBars.length >= 4 ? weekBars : allSorted.slice(-Math.min(5, allSorted.length));
    } else if (tf === '1M' || tf === '30') {
      const oneMonthAgo = new Date(latestDate.getTime() - 30 * 24 * 3600 * 1000);
      const monthBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= oneMonthAgo);
      sliced = monthBars.length >= 15 ? monthBars : allSorted.slice(-Math.min(22, allSorted.length));
    } else if (tf === '3M' || tf === '90') {
      const threeMonthsAgo = new Date(latestDate.getTime() - 90 * 24 * 3600 * 1000);
      const qtrBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= threeMonthsAgo);
      sliced = qtrBars.length >= 45 ? qtrBars : allSorted.slice(-Math.min(66, allSorted.length));
    } else if (tf === '6M' || tf === '180') {
      const sixMonthsAgo = new Date(latestDate.getTime() - 180 * 24 * 3600 * 1000);
      const halfYearBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= sixMonthsAgo);
      sliced = halfYearBars.length >= 90 ? halfYearBars : allSorted.slice(-Math.min(132, allSorted.length));
    } else if (tf === '1Y' || tf === '365') {
      const oneYearAgo = new Date(latestDate.getTime() - 365 * 24 * 3600 * 1000);
      const yearBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= oneYearAgo);
      sliced = yearBars.length >= 180 ? yearBars : allSorted.slice(-Math.min(260, allSorted.length));
    } else if (tf === 'WEEKLY') {
      const weekly = aggregateToWeeklyCandles(allSorted);
      const weeklyFormatted = weekly.map(w => ({
        time: w.time,
        open: w.open,
        high: w.high,
        low: w.low,
        close: w.close,
        value: w.close,
        volume: w.volume,
        dateStr: w.time,
      }));
      if (stock?.ltp && Number(stock.ltp) > 0 && weeklyFormatted.length > 0) {
        const last = { ...weeklyFormatted[weeklyFormatted.length - 1] };
        const target = Number(stock.ltp);
        last.close = target; last.value = target;
        last.high = Math.max(Number(last.high || target), target);
        last.low = Math.min(Number(last.low || target), target);
        return [...weeklyFormatted.slice(0, -1), last];
      }
      return weeklyFormatted;
    } else {
      sliced = allSorted;
    }

    if (stock?.ltp && Number(stock.ltp) > 0 && sliced.length > 0) {
      const last = { ...sliced[sliced.length - 1] };
      const target = Number(stock.ltp);
      last.close = target;
      last.value = target;
      last.high = Math.max(Number(last.high || target), target);
      last.low = Math.min(Number(last.low || target), target);
      sliced = [...sliced.slice(0, -1), last];
    }

    return sliced;
  }, [intradayData, rawHistory, activeTf, activeMode, stock, aggregateToIntradayCandles]);

  // ── Compute Technical Indicator Series ──
  const closes = useMemo(() => processedChartData.map(d => Number(d.close ?? d.value ?? 0)), [processedChartData]);
  const volumes = useMemo(() => processedChartData.map(d => Number(d.volume || 0)), [processedChartData]);

  const ema20Data = useMemo(() => {
    if (closes.length < 20) return [];
    const ema = calculateEMA(closes, 20);
    const res = [];
    processedChartData.forEach((d, i) => {
      if (ema[i] != null && !isNaN(ema[i])) res.push({ time: d.time, value: +Number(ema[i]).toFixed(2) });
    });
    return res;
  }, [closes, processedChartData]);

  const ema50Data = useMemo(() => {
    if (closes.length < 50) return [];
    const ema = calculateEMA(closes, 50);
    const res = [];
    processedChartData.forEach((d, i) => {
      if (ema[i] != null && !isNaN(ema[i])) res.push({ time: d.time, value: +Number(ema[i]).toFixed(2) });
    });
    return res;
  }, [closes, processedChartData]);

  const ema200Data = useMemo(() => {
    if (closes.length < 180) return [];
    const ema = calculateEMA(closes, 200);
    const res = [];
    processedChartData.forEach((d, i) => {
      if (ema[i] != null && !isNaN(ema[i])) res.push({ time: d.time, value: +Number(ema[i]).toFixed(2) });
    });
    return res;
  }, [closes, processedChartData]);

  const bollingerData = useMemo(() => {
    if (closes.length < 20) return { upper: [], lower: [], middle: [] };
    const upper = [], lower = [], middle = [];
    for (let i = 19; i < closes.length; i++) {
      const slice = closes.slice(i - 19, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / 20;
      const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / 20;
      const stdDev = Math.sqrt(variance);
      const time = processedChartData[i].time;
      middle.push({ time, value: +sma.toFixed(2) });
      upper.push({ time, value: +(sma + 2 * stdDev).toFixed(2) });
      lower.push({ time, value: +(sma - 2 * stdDev).toFixed(2) });
    }
    return { upper, lower, middle };
  }, [closes, processedChartData]);

  const vwapData = useMemo(() => {
    const vwapArr = computeVWAP(processedChartData);
    const res = [];
    processedChartData.forEach((d, i) => {
      if (vwapArr[i] != null) res.push({ time: d.time, value: vwapArr[i] });
    });
    return res;
  }, [processedChartData]);

  const volSmaData = useMemo(() => {
    const smaArr = computeVolSMA(volumes, 20);
    const res = [];
    processedChartData.forEach((d, i) => {
      if (smaArr[i] != null) res.push({ time: d.time, value: smaArr[i] });
    });
    return res;
  }, [volumes, processedChartData]);

  const rsiData = useMemo(() => {
    const rsiArr = computeRSIArray(closes, 14);
    const res = [];
    processedChartData.forEach((d, i) => {
      if (rsiArr[i] != null) res.push({ time: d.time, value: rsiArr[i] });
    });
    return res;
  }, [closes, processedChartData]);

  const currentRsi = useMemo(() => {
    const last = [...rsiData].reverse().find(d => d != null);
    return last?.value ?? null;
  }, [rsiData]);

  const macdArrays = useMemo(() => {
    const { macdArr, signalArr, histArr } = computeMACDArrays(closes);
    const macdLine = [];
    const signalLine = [];
    const histogram = [];
    processedChartData.forEach((d, i) => {
      const m = macdArr[i], s = signalArr[i], h = histArr[i];
      if (m != null) macdLine.push({ time: d.time, value: m });
      if (s != null) signalLine.push({ time: d.time, value: s });
      if (h != null) histogram.push({
        time: d.time,
        value: h,
        color: h >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)'
      });
    });
    return { macdLine, signalLine, histogram };
  }, [closes, processedChartData]);

  const currentMacdHist = useMemo(() => {
    const arr = macdArrays.histogram;
    return arr.length > 0 ? arr[arr.length - 1].value : null;
  }, [macdArrays]);

  const pivotData = useMemo(() => {
    if (processedChartData.length === 0) return null;
    const last = processedChartData[processedChartData.length - 1];
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
  }, [processedChartData]);

  const fibData = useMemo(() => {
    if (processedChartData.length < 5) return null;
    const highs = processedChartData.map(c => Number(c.high || c.close || 0));
    const lows = processedChartData.map(c => Number(c.low || c.close || 0)).filter(v => v > 0);
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
  }, [processedChartData]);

  // Volume Profile Point of Control (POC)
  const pocPrice = useMemo(() => {
    if (floorsheetData && Array.isArray(floorsheetData.priceVolumeBreakdown) && floorsheetData.priceVolumeBreakdown.length > 0) {
      const sortedByVol = [...floorsheetData.priceVolumeBreakdown].sort((a, b) => Number(b.volume || b.qty || 0) - Number(a.volume || a.qty || 0));
      const top = sortedByVol[0];
      const p = Number(top?.price || top?.rate || 0);
      if (p > 0) return +p.toFixed(2);
    }
    if (floorsheetData && Array.isArray(floorsheetData.rows) && floorsheetData.rows.length > 0) {
      const priceBuckets = new Map();
      floorsheetData.rows.forEach(r => {
        const p = Number(r.rate || r.price || 0);
        const v = Number(r.qty || r.quantity || 0);
        if (p > 0 && v > 0) {
          priceBuckets.set(p, (priceBuckets.get(p) || 0) + v);
        }
      });
      let maxV = 0, bestP = null;
      for (const [p, v] of priceBuckets.entries()) {
        if (v > maxV) { maxV = v; bestP = p; }
      }
      if (bestP) return +bestP.toFixed(2);
    }
    if (processedChartData.length > 0) {
      const priceBuckets = new Map();
      processedChartData.forEach(c => {
        const p = +(Number(c.close || 0)).toFixed(1);
        const v = Number(c.volume || 1);
        if (p > 0) {
          priceBuckets.set(p, (priceBuckets.get(p) || 0) + v);
        }
      });
      let maxV = 0, bestP = null;
      for (const [p, v] of priceBuckets.entries()) {
        if (v > maxV) { maxV = v; bestP = p; }
      }
      if (bestP) return +bestP.toFixed(2);
    }
    return null;
  }, [floorsheetData, processedChartData]);

  // Institutional Broker Cost-Basis (VWAP of top accumulators)
  const instVwap = useMemo(() => {
    if (!brokerAnalysis) return null;
    const buyers = (brokerAnalysis.topNetBuyers || brokerAnalysis.topNetAccumulators || []).filter(b => {
      const avg = Number(b.avgBuyRate || 0);
      const qty = Number(b.netQty !== undefined ? b.netQty : b.buyQty);
      return avg > 0 && qty > 0;
    });
    if (buyers.length === 0) return null;
    const top3 = buyers.slice(0, 3);
    const totalQty = top3.reduce((s, b) => s + Number(b.netQty !== undefined ? b.netQty : b.buyQty), 0);
    const totalAmt = top3.reduce((s, b) => s + (Number(b.avgBuyRate) * Number(b.netQty !== undefined ? b.netQty : b.buyQty)), 0);
    return totalQty > 0 ? +(totalAmt / totalQty).toFixed(2) : null;
  }, [brokerAnalysis]);

  // Live Trade Plan Corridors
  const tradePlanCorridor = useMemo(() => {
    if (!entryExitPlan || !entryExitPlan.levels) return null;
    const lv = entryExitPlan.levels;
    const t2 = Number(lv.target2?.price || 0);
    const t1 = Number(lv.target1?.price || 0);
    const entry = Number(lv.entryZone?.low || lv.pullbackAnchor || 0);
    const entryMax = Number(lv.entryZone?.max || lv.entryZone?.high || lv.breakoutPivot || 0);
    const sl = Number(lv.stopLoss?.price || 0);
    if (!t1 && !sl && !entry && !entryMax) return null;
    return {
      t2: t2 > 0 ? t2 : null,
      t1: t1 > 0 ? t1 : null,
      entry: entry > 0 ? entry : null,
      entryMax: entryMax > 0 ? entryMax : null,
      sl: sl > 0 ? sl : null,
      verdict: entryExitPlan.verdict || '',
      setupScore: Number(entryExitPlan.setupScore || 0),
      rrRatio: entryExitPlan.rrRatio || entryExitPlan.riskRewardRatio || null
    };
  }, [entryExitPlan]);

  const patternMarkers = useMemo(() => {
    if (processedChartData.length === 0) return [];
    try {
      const detections = detectCandlestickPatternsFromHistory(processedChartData, stock);
      if (!Array.isArray(detections)) return [];
      const markers = [];
      const seen = new Set();
      for (const det of detections) {
        const time = det.date || det.time;
        if (!time || seen.has(time + det.id)) continue;
        seen.add(time + det.id);
        const isBullish = det.type === 'bullish';
        markers.push({
          time,
          position: isBullish ? 'belowBar' : 'aboveBar',
          color: isBullish ? '#10b981' : '#f43f5e',
          shape: isBullish ? 'arrowUp' : 'arrowDown',
          text: det.name || det.id,
          size: 1
        });
      }
      return markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    } catch {
      return [];
    }
  }, [processedChartData, stock]);

  const high52w = Number(stock?.high52w || 0);
  const low52w = Number(stock?.low52w || 0);
  const rvol = Number(stock?.rvol || stock?.volumeSurgeRatio || 0);

  // Sub-pane dynamic layout (Active in fullscreen only)
  const effectiveSubPaneCount = (effectiveShowRsi ? 1 : 0) + (effectiveShowMacd ? 1 : 0);
  const dynamicHeight = activeIsFullscreen
    ? (Math.max(400, height || 440) + (effectiveSubPaneCount * 85))
    : (height || 260);

  const handleSelectTimeframe = (tfId) => {
    setActiveTf(tfId);
    if (onTimeframeChange) {
      onTimeframeChange(tfId);
    }
  };

  // ── Render Chart ──
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (processedChartData.length === 0) return;

    if (chartRef.current) {
      try { chartRef.current.remove(); } catch (_) {}
      chartRef.current = null;
    }

    const isCandle = activeMode === 'candle';
    const container = chartContainerRef.current;

    // Safe scaleMargins helper: strictly ensures top >= 0, bottom >= 0, and (top + bottom) <= 0.88 (< 1.0)
    const safeScaleMargins = (top, bottom) => {
      let t = Math.max(0, Math.min(0.95, Number(top) || 0));
      let b = Math.max(0, Math.min(0.95, Number(bottom) || 0));
      if (t + b >= 0.95) {
        const factor = 0.88 / (t + b);
        t = Number((t * factor).toFixed(3));
        b = Number((b * factor).toFixed(3));
      }
      return { top: t, bottom: b };
    };

    // Dynamic Scale Margins for Sub-Panes (Strict invariant: top + bottom <= 0.88 < 1.0)
    let mainBottom = 0.20;
    let volTop = 0.80, volBottom = 0.02;
    let rsiTop = 0, rsiBottom = 0;
    let macdTop = 0, macdBottom = 0;

    if (effectiveSubPaneCount === 1 && effectiveShowRsi) {
      mainBottom = 0.30;
      volTop = 0.55; volBottom = 0.30;
      rsiTop = 0.73; rsiBottom = 0.02;
    } else if (effectiveSubPaneCount === 1 && effectiveShowMacd) {
      mainBottom = 0.30;
      volTop = 0.55; volBottom = 0.30;
      macdTop = 0.73; macdBottom = 0.02;
    } else if (effectiveSubPaneCount === 2) {
      mainBottom = 0.46;
      volTop = 0.40; volBottom = 0.46;
      rsiTop = 0.56; rsiBottom = 0.24;
      macdTop = 0.78; macdBottom = 0.02;
    }

    try {
      const chart = createChart(container, {
        width: container.clientWidth || 600,
        height: dynamicHeight,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
          fontSize: 12,
          fontFamily: 'system-ui, -apple-system, sans-serif'
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.035)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.035)' },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: 'rgba(148, 163, 184, 0.35)', width: 1, style: 3 },
          horzLine: { color: 'rgba(148, 163, 184, 0.35)', width: 1, style: 3 },
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.07)',
          autoScale: true,
          scaleMargins: safeScaleMargins(0.08, mainBottom),
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.07)',
          timeVisible: isTrulyIntraday,
          secondsVisible: false,
          barSpacing: Math.max(0.5, Math.min(22, Math.floor(((container.clientWidth || 360) - 20) / Math.max(1, processedChartData.length)))),
          minBarSpacing: 0.1,
          rightOffset: 1,
          fixLeftEdge: true,
          fixRightEdge: false,
          tickMarkFormatter: (time) => {
            if (isTrulyIntraday && typeof time === 'number') {
              return formatNptTime(time);
            }
            if (typeof time === 'string') {
              const d = new Date(time + 'T00:00:00Z');
              if (activeTf === '1W' || activeTf === '7') {
                return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
              }
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            }
            return null;
          }
        },
        localization: {
          dateFormat: 'yyyy-MM-dd',
          timeFormatter: (timeVal) => {
            if (isTrulyIntraday && typeof timeVal === 'number') {
              return formatNptTime(timeVal);
            }
            if (typeof timeVal === 'string') {
              return formatNptFullDate(timeVal);
            }
            return undefined;
          }
        },
        handleScale: { mouseWheel: true, pinch: true },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true }
      });

      // 1. Main Series (Candlestick or Area)
      let mainSeries;
      if (isCandle) {
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#10B981',
          downColor: '#F43F5E',
          borderVisible: true,
          borderColor: '#10B981',
          borderUpColor: '#10B981',
          borderDownColor: '#F43F5E',
          wickVisible: true,
          wickUpColor: '#10B981',
          wickDownColor: '#F43F5E',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
        });
        mainSeries.setData(processedChartData.map(d => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close
        })));

        // Pattern Markers on Candlesticks (v5 createSeriesMarkers primitive + v4 fallback)
        if (effectiveShowPatterns && patternMarkers.length > 0) {
          try {
            if (typeof createSeriesMarkers === 'function') {
              createSeriesMarkers(mainSeries, patternMarkers);
            } else if (typeof mainSeries.setMarkers === 'function') {
              mainSeries.setMarkers(patternMarkers);
            }
          } catch (_) {}
        }
      } else {
        const firstPoint = processedChartData[0];
        const lastPoint = processedChartData[processedChartData.length - 1];
        const firstVal = Number(firstPoint?.close ?? firstPoint?.value ?? 0);
        const lastVal = Number(lastPoint?.close ?? lastPoint?.value ?? 0);
        const prevCloseVal = Number(stock?.prevClose || stock?.previousClose || (stock?.ltp != null && stock?.change != null ? stock.ltp - stock.change : null));

        const isBull = isTrulyIntraday
          ? (stock?.change != null ? (Number(stock.change) >= 0) : (prevCloseVal > 0 ? lastVal >= prevCloseVal : lastVal >= firstVal))
          : (lastVal >= firstVal);

        const lineColor = isBull ? '#10B981' : '#F43F5E';
        const topColor = isBull ? 'rgba(16, 185, 129, 0.28)' : 'rgba(244, 63, 94, 0.28)';
        const bottomColor = isBull ? 'rgba(16, 185, 129, 0.00)' : 'rgba(244, 63, 94, 0.00)';

        mainSeries = chart.addSeries(AreaSeries, {
          lineColor,
          topColor,
          bottomColor,
          lineWidth: 2.2,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: '#0B0E14',
          crosshairMarkerBackgroundColor: lineColor,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
        });
        mainSeries.setData(processedChartData.map(d => ({
          time: d.time,
          value: d.close ?? d.value
        })));
      }
      mainSeriesRef.current = mainSeries;

      // 2. Volume Series & Vol SMA20
      const hasVolume = processedChartData.some(d => (Number(d.volume) || 0) > 0);
      if (hasVolume) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume_scale',
        });
        chart.priceScale('volume_scale').applyOptions({
          scaleMargins: safeScaleMargins(volTop, volBottom)
        });
        volumeSeries.setData(processedChartData.map(d => ({
          time: d.time,
          value: Number(d.volume) || 0,
          color: d.close >= d.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'
        })));
        volumeSeriesRef.current = volumeSeries;

        if (effectiveShowVolSma && volSmaData.length > 0) {
          const volSmaSeries = chart.addSeries(LineSeries, {
            color: '#fbbf24',
            lineWidth: 1.5,
            priceScaleId: 'volume_scale',
            lastValueVisible: false,
            title: 'Vol SMA20'
          });
          volSmaSeries.setData(volSmaData);
        }
      }

      // 3. EMA Overlays
      if (effectiveShowEma20 && ema20Data.length > 0) {
        const ema20Series = chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1.5, title: 'EMA 20' });
        ema20Series.setData(ema20Data);
      }
      if (effectiveShowEma50 && ema50Data.length > 0) {
        const ema50Series = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1.5, title: 'EMA 50' });
        ema50Series.setData(ema50Data);
      }
      if (effectiveShowEma200 && ema200Data.length > 0) {
        const ema200Series = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, title: 'EMA 200' });
        ema200Series.setData(ema200Data);
      }

      // 4. Bollinger Bands Overlays
      if (effectiveShowBollinger && bollingerData.upper.length > 0) {
        const bbU = chart.addSeries(LineSeries, { color: 'rgba(56, 189, 248, 0.65)', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'BB Upper' });
        bbU.setData(bollingerData.upper);
        const bbL = chart.addSeries(LineSeries, { color: 'rgba(56, 189, 248, 0.65)', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'BB Lower' });
        bbL.setData(bollingerData.lower);
        const bbM = chart.addSeries(LineSeries, { color: 'rgba(148, 163, 184, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB Mid' });
        bbM.setData(bollingerData.middle);
      }

      // 5. VWAP Overlay
      if (effectiveShowVwap && vwapData.length > 0) {
        const vwapSeries = chart.addSeries(LineSeries, { color: '#fbbf24', lineWidth: 1.5, lineStyle: LineStyle.Dashed, title: 'VWAP' });
        vwapSeries.setData(vwapData);
      }

      // 6. Pivot Points & Support/Resistance Lines
      if (effectiveShowPivots && pivotData) {
        const pivotLines = [
          { price: pivotData.P, color: '#e2e8f0', title: `PP: ${pivotData.P}` },
          { price: pivotData.R1, color: '#34d399', title: `R1: ${pivotData.R1}` },
          { price: pivotData.R2, color: '#6ee7b7', title: `R2: ${pivotData.R2}` },
          { price: pivotData.S1, color: '#fb7185', title: `S1: ${pivotData.S1}` },
          { price: pivotData.S2, color: '#fda4af', title: `S2: ${pivotData.S2}` },
        ];
        pivotLines.forEach(pl => {
          if (pl.price > 0) {
            mainSeries.createPriceLine({
              price: pl.price,
              color: pl.color,
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: pl.title
            });
          }
        });
      }

      // 7. Fibonacci Retracements
      if (effectiveShowFib && fibData) {
        const fibLines = [
          { price: fibData.level_0, color: '#c4b5fd', title: `Fib 0%: ${fibData.level_0}` },
          { price: fibData.level_236, color: '#a78bfa', title: `Fib 23.6%: ${fibData.level_236}` },
          { price: fibData.level_382, color: '#8b5cf6', title: `Fib 38.2%: ${fibData.level_382}` },
          { price: fibData.level_500, color: '#7c3aed', title: `Fib 50%: ${fibData.level_500}` },
          { price: fibData.level_618, color: '#6d28d9', title: `Fib 61.8%: ${fibData.level_618}` },
          { price: fibData.level_1000, color: '#4c1d95', title: `Fib 100%: ${fibData.level_1000}` },
        ];
        fibLines.forEach(fl => {
          if (fl.price > 0) {
            mainSeries.createPriceLine({
              price: fl.price,
              color: fl.color,
              lineWidth: 1,
              lineStyle: LineStyle.LargeDashed,
              axisLabelVisible: true,
              title: fl.title
            });
          }
        });
      }

      // 8. 52-Week High / Low Markers
      if (effectiveShow52W) {
        if (high52w > 0) {
          mainSeries.createPriceLine({
            price: high52w,
            color: '#34d399',
            lineWidth: 2,
            lineStyle: LineStyle.SparseDotted,
            axisLabelVisible: true,
            title: `52W High: Rs. ${high52w}`
          });
        }
        if (low52w > 0) {
          mainSeries.createPriceLine({
            price: low52w,
            color: '#fb7185',
            lineWidth: 2,
            lineStyle: LineStyle.SparseDotted,
            axisLabelVisible: true,
            title: `52W Low: Rs. ${low52w}`
          });
        }
      }

      // 9. RSI Sub-Pane
      if (effectiveShowRsi && rsiData.length > 0) {
        const rsiSeries = chart.addSeries(LineSeries, {
          color: '#f472b6',
          lineWidth: 1.5,
          title: 'RSI(14)',
          priceScaleId: 'rsi_scale',
          priceFormat: { type: 'price', precision: 1, minMove: 0.1 }
        });
        chart.priceScale('rsi_scale').applyOptions({
          scaleMargins: safeScaleMargins(rsiTop, rsiBottom),
          autoScale: false,
        });
        rsiSeries.setData(rsiData);
        rsiSeries.createPriceLine({ price: 70, color: 'rgba(251, 113, 133, 0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'OB 70' });
        rsiSeries.createPriceLine({ price: 30, color: 'rgba(52, 211, 153, 0.55)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'OS 30' });
        rsiSeries.createPriceLine({ price: 50, color: 'rgba(148, 163, 184, 0.25)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
      }

      // 10. MACD Sub-Pane
      if (effectiveShowMacd) {
        if (macdArrays.histogram.length > 0) {
          const macdHist = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
            priceScaleId: 'macd_scale',
            title: 'MACD Hist'
          });
          chart.priceScale('macd_scale').applyOptions({
            scaleMargins: safeScaleMargins(macdTop, macdBottom),
            autoScale: true,
          });
          macdHist.setData(macdArrays.histogram);
        }
        if (macdArrays.macdLine.length > 0) {
          const macdLine = chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1.5, title: 'MACD', priceScaleId: 'macd_scale', lastValueVisible: false });
          macdLine.setData(macdArrays.macdLine);
        }
        if (macdArrays.signalLine.length > 0) {
          const signalLine = chart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1.5, title: 'Signal', priceScaleId: 'macd_scale', lastValueVisible: false });
          signalLine.setData(macdArrays.signalLine);
        }
      }

      // Previous Close Baseline
      const prevCloseVal = Number(stock?.prevClose || stock?.previousClose || (stock?.ltp != null && stock?.change != null ? stock.ltp - stock.change : null));
      if (prevCloseVal && prevCloseVal > 0 && isTrulyIntraday) {
        try {
          mainSeries.createPriceLine({
            price: prevCloseVal,
            color: 'rgba(148, 163, 184, 0.45)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Prev Close',
          });
        } catch (_) {}
      }

      // 11. Volume Profile Point of Control (POC)
      if (effectiveShowPoc && pocPrice && pocPrice > 0) {
        try {
          mainSeries.createPriceLine({
            price: pocPrice,
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `POC: Rs. ${pocPrice}`
          });
        } catch (_) {}
      }

      // 12. Institutional Broker VWAP (Top Accumulators Cost Basis)
      if (effectiveShowInstVwap && instVwap && instVwap > 0) {
        try {
          mainSeries.createPriceLine({
            price: instVwap,
            color: '#06b6d4',
            lineWidth: 2,
            lineStyle: LineStyle.LargeDashed,
            axisLabelVisible: true,
            title: `Inst. VWAP: Rs. ${instVwap}`
          });
        } catch (_) {}
      }

      // 13. Live Trade Plan Corridors
      if (effectiveShowTradePlan && tradePlanCorridor) {
        try {
          if (tradePlanCorridor.t2) {
            mainSeries.createPriceLine({
              price: tradePlanCorridor.t2,
              color: '#10b981',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: `Target 2: Rs. ${tradePlanCorridor.t2}`
            });
          }
          if (tradePlanCorridor.t1) {
            mainSeries.createPriceLine({
              price: tradePlanCorridor.t1,
              color: '#34d399',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: `Target 1: Rs. ${tradePlanCorridor.t1}`
            });
          }
          if (tradePlanCorridor.entry) {
            mainSeries.createPriceLine({
              price: tradePlanCorridor.entry,
              color: '#38bdf8',
              lineWidth: 1.5,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: `Entry: Rs. ${tradePlanCorridor.entry}`
            });
          }
          if (tradePlanCorridor.entryMax) {
            mainSeries.createPriceLine({
              price: tradePlanCorridor.entryMax,
              color: '#60a5fa',
              lineWidth: 1.5,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: `Breakout Pivot: Rs. ${tradePlanCorridor.entryMax}`
            });
          }
          if (tradePlanCorridor.sl) {
            mainSeries.createPriceLine({
              price: tradePlanCorridor.sl,
              color: '#ef4444',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: `Stop Loss: Rs. ${tradePlanCorridor.sl}`
            });
          }
        } catch (_) {}
      }

      // Crosshair HUD Subscriber
      chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesData) {
          setHoverData(null);
          return;
        }
        const sData = param.seriesData.get(mainSeries);
        if (sData) {
          const matchingEma20 = effectiveShowEma20 ? (ema20Data.find(e => e.time === param.time)?.value ?? null) : null;
          const matchingEma50 = effectiveShowEma50 ? (ema50Data.find(e => e.time === param.time)?.value ?? null) : null;
          const matchingEma200 = effectiveShowEma200 ? (ema200Data.find(e => e.time === param.time)?.value ?? null) : null;
          const matchingRsi = effectiveShowRsi ? (rsiData.find(r => r.time === param.time)?.value ?? null) : null;
          const matchingVwap = effectiveShowVwap ? (vwapData.find(v => v.time === param.time)?.value ?? null) : null;
          const matchingVol = volumeSeriesRef.current ? (param.seriesData.get(volumeSeriesRef.current)?.value ?? null) : null;
          setHoverData({
            time: param.time,
            open: sData.open ?? sData.value,
            high: sData.high ?? sData.value,
            low: sData.low ?? sData.value,
            close: sData.close ?? sData.value,
            value: sData.value ?? sData.close,
            volume: matchingVol,
            ema20: matchingEma20,
            ema50: matchingEma50,
            ema200: matchingEma200,
            rsi: matchingRsi,
            vwap: matchingVwap
          });
        }
      });

      chart.timeScale().fitContent();
      requestAnimationFrame(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      });
      chartRef.current = chart;

      const observer = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;
        const { width } = entries[0].contentRect;
        if (chartRef.current && width > 0) {
          chartRef.current.applyOptions({ width, height: dynamicHeight });
          chartRef.current.timeScale().fitContent();
        }
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
        if (chartRef.current) {
          try { chartRef.current.remove(); } catch (_) {}
          chartRef.current = null;
        }
      };
    } catch (err) {
      console.warn('[ShareHubChart] Render failed:', err);
      setError('Unable to render chart: ' + (err.message || 'unknown error'));
    }
  }, [
    processedChartData,
    activeMode,
    isTrulyIntraday,
    dynamicHeight,
    effectiveShowEma20,
    effectiveShowEma50,
    effectiveShowEma200,
    effectiveShowBollinger,
    effectiveShowVwap,
    effectiveShowPivots,
    effectiveShowFib,
    effectiveShow52W,
    effectiveShowPatterns,
    effectiveShowRsi,
    effectiveShowMacd,
    effectiveShowVolSma,
    effectiveShowPoc,
    pocPrice,
    effectiveShowInstVwap,
    instVwap,
    effectiveShowTradePlan,
    tradePlanCorridor,
    ema20Data,
    ema50Data,
    ema200Data,
    bollingerData,
    vwapData,
    volSmaData,
    rsiData,
    macdArrays,
    pivotData,
    fibData,
    high52w,
    low52w,
    patternMarkers,
    effectiveSubPaneCount
  ]);

  // Active HUD Price & Metadata
  const latestBar = processedChartData[processedChartData.length - 1];
  const authoritativeLtp = (stock && stock.ltp != null && !isNaN(Number(stock.ltp)))
    ? Number(stock.ltp)
    : (latestBar?.close ?? latestBar?.value ?? 0);

  const activeHud = hoverData || (latestBar ? {
    time: latestBar.time,
    open: latestBar.open ?? latestBar.value,
    high: Math.max(latestBar.high ?? authoritativeLtp, authoritativeLtp),
    low: Math.min(latestBar.low ?? authoritativeLtp, authoritativeLtp),
    close: authoritativeLtp,
    value: authoritativeLtp
  } : null);

  const hudMetrics = useMemo(() => {
    if (!activeHud) return { change: 0, pChange: 0, isBull: true };
    if (!hoverData && stock && stock.change != null && stock.pChange != null && !isNaN(Number(stock.change))) {
      const c = Number(stock.change);
      const pc = Number(stock.pChange);
      return { change: c, pChange: pc, isBull: c >= 0 };
    }
    const currentVal = Number(activeHud.close ?? activeHud.value ?? authoritativeLtp ?? 0);
    const prevCloseVal = Number(stock?.prevClose || stock?.previousClose || (stock?.ltp != null && stock?.change != null ? stock.ltp - stock.change : null));
    const firstPointVal = Number(processedChartData[0]?.close ?? processedChartData[0]?.value ?? 0);

    const baseline = isTrulyIntraday
      ? (prevCloseVal > 0 ? prevCloseVal : (firstPointVal > 0 ? firstPointVal : null))
      : (firstPointVal > 0 ? firstPointVal : prevCloseVal);

    if (baseline && baseline > 0) {
      const diff = +(currentVal - baseline).toFixed(2);
      const pct = +((diff / baseline) * 100).toFixed(2);
      return { change: diff, pChange: pct, isBull: diff >= 0 };
    }
    const fallbackChange = Number(stock?.change ?? 0);
    const fallbackPct = Number(stock?.pChange ?? 0);
    return { change: fallbackChange, pChange: fallbackPct, isBull: fallbackChange >= 0 };
  }, [activeHud, hoverData, authoritativeLtp, stock, processedChartData, isTrulyIntraday]);

  const isUp = hudMetrics.isBull;

  const hudTimeLabel = useMemo(() => {
    if (!activeHud || !activeHud.time) return '';
    if (typeof activeHud.time === 'string') return activeHud.time;
    if (isTrulyIntraday && typeof activeHud.time === 'number') {
      return formatNptTime(activeHud.time);
    }
    return formatNptFullDate(activeHud.time);
  }, [activeHud, isTrulyIntraday]);

  // ── Analyst Predictive Verdict & Telemetry ──
  const trendVerdict = useMemo(() => {
    const lastEma20 = ema20Data[ema20Data.length - 1]?.value;
    const lastEma50 = ema50Data[ema50Data.length - 1]?.value;
    const lastEma200 = ema200Data[ema200Data.length - 1]?.value;
    const ltp = authoritativeLtp;

    if (lastEma20 && lastEma50 && lastEma200) {
      if (lastEma20 > lastEma50 && lastEma50 > lastEma200 && ltp >= lastEma20) {
        return { label: 'Strong Bullish (Golden Alignment)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
      }
      if (lastEma20 < lastEma50 && lastEma50 < lastEma200 && ltp <= lastEma20) {
        return { label: 'Strong Bearish (Death Alignment)', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' };
      }
    }
    if (lastEma20 && lastEma50) {
      if (lastEma20 > lastEma50) return { label: 'Bullish Bias (EMA20 > 50)', color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' };
      if (lastEma20 < lastEma50) return { label: 'Bearish Bias (EMA20 < 50)', color: '#fb7185', bg: 'rgba(251, 113, 133, 0.15)' };
    }
    return { label: 'Consolidation / Neutral', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' };
  }, [ema20Data, ema50Data, ema200Data, authoritativeLtp]);

  const rvolBadge = useMemo(() => {
    if (rvol > 0) {
      if (rvol >= 1.5) return { text: `🔥 RVOL ${rvol.toFixed(2)}x (Institutional Surge)`, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
      if (rvol <= 0.6) return { text: `💤 RVOL ${rvol.toFixed(2)}x (Dry-up)`, color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' };
      return { text: `RVOL ${rvol.toFixed(2)}x`, color: '#94a3b8', bg: 'rgba(255, 255, 255, 0.05)' };
    }
    return null;
  }, [rvol]);

  const rsiBadge = useMemo(() => {
    if (currentRsi == null) return null;
    if (currentRsi >= 70) return { text: `RSI ${currentRsi} (Overbought ⚠️)`, color: '#fb7185', bg: 'rgba(251, 113, 133, 0.15)' };
    if (currentRsi <= 30) return { text: `RSI ${currentRsi} (Oversold 🟢)`, color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' };
    if (currentRsi >= 50) return { text: `RSI ${currentRsi} (Bullish Momentum)`, color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' };
    return { text: `RSI ${currentRsi} (Bearish Flow)`, color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' };
  }, [currentRsi]);

  const latestPattern = patternMarkers.length > 0 ? patternMarkers[patternMarkers.length - 1] : null;

  return (
    <div style={{
      width: '100%',
      height: activeIsFullscreen ? '100%' : 'auto',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      position: 'relative'
    }}>
      {/* ── Stage 1: Clean Minimalist First-Glance Top Bar (Inline Mode) ── */}
      {!activeIsFullscreen && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 2px 8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          marginBottom: 6,
          fontSize: 12,
          fontFamily: 'var(--font-mono, monospace)',
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02em', fontSize: 13 }}>{symbol}</span>
            {hoverData ? (
              <>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 900,
                  color: isUp ? '#10B981' : '#F43F5E'
                }}>
                  Rs. {Number(hoverData.close || hoverData.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {hudTimeLabel && (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>({hudTimeLabel})</span>
                )}
              </>
            ) : (
              <>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 900,
                  color: isUp ? '#10B981' : '#F43F5E'
                }}>
                  Rs. {Number(authoritativeLtp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  color: isUp ? '#10B981' : '#F43F5E'
                }}>
                  {isUp ? '▲ +' : '▼ '}{Math.abs(hudMetrics.change).toFixed(2)} ({isUp ? '+' : ''}{hudMetrics.pChange.toFixed(2)}%)
                </span>
                {latestBar && (
                  <span style={{ fontSize: 11, color: '#64748b' }} className="hidden sm:inline">
                    H: {latestBar.high != null ? Number(latestBar.high).toFixed(1) : '—'} • L: {latestBar.low != null ? Number(latestBar.low).toFixed(1) : '—'}
                  </span>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Compact Line | Candle Toggle */}
            <button
              type="button"
              onClick={() => setActiveMode(m => m === 'candle' ? 'line' : 'candle')}
              title={activeMode === 'candle' ? 'Switch to Area Line' : 'Switch to Candlesticks'}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.08)',
                background: activeMode === 'candle' ? 'rgba(56, 117, 246, 0.22)' : 'rgba(255,255,255,0.04)',
                color: activeMode === 'candle' ? '#60a5fa' : '#94a3b8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              {activeMode === 'candle' ? <BarChart2 size={12} /> : <TrendingUp size={12} />}
              <span>{activeMode === 'candle' ? 'Candles' : 'Line'}</span>
            </button>

            {/* Fullscreen Technical Chart Expand Button */}
            {(onOpenTradingView || onToggleFullscreen) && (
              <button
                type="button"
                onClick={onOpenTradingView || onToggleFullscreen}
                title="Open Fullscreen Technical Chart"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  padding: '4px 7px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Maximize2 size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Stage 2: Fullscreen Live Crosshair Technician HUD Strip ── */}
      {activeIsFullscreen && activeHud && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px 6px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: 6,
          fontSize: 11.5,
          fontFamily: 'var(--font-mono, monospace)',
          flexWrap: 'wrap',
          gap: 6,
          background: '#090d16',
          borderRadius: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02em', fontSize: 13 }}>{symbol}</span>
            <span style={{
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 4,
              background: isTrulyIntraday ? 'rgba(56, 117, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              color: isTrulyIntraday ? '#60a5fa' : '#94a3b8',
              fontWeight: 700
            }}>
              {isTrulyIntraday ? (activeMode === 'candle' ? '5m Intraday' : '1m Ticks') : activeTf}
            </span>
            <span style={{
              fontSize: '13px',
              fontWeight: 900,
              color: isUp ? '#10B981' : '#F43F5E'
            }}>
              Rs. {Number(activeHud.close || activeHud.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 4,
              background: isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              border: isUp ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(244, 63, 94, 0.35)',
              color: isUp ? '#10B981' : '#F43F5E',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3
            }}>
              <span>{isUp ? '▲ +' : '▼ '}{Math.abs(hudMetrics.change).toFixed(2)}</span>
              <span>({isUp ? '+' : ''}{hudMetrics.pChange.toFixed(2)}%)</span>
            </span>
            {hudTimeLabel && (
              <span style={{ fontSize: 11, color: '#64748b' }}>({hudTimeLabel})</span>
            )}
            {activeHud.open != null && <span><span style={{ color: '#64748b' }}>O:</span> {Number(activeHud.open).toFixed(2)}</span>}
            {activeHud.high != null && <span><span style={{ color: '#64748b' }}>H:</span> <span style={{ color: '#10B981' }}>{Number(activeHud.high).toFixed(2)}</span></span>}
            {activeHud.low != null && <span><span style={{ color: '#64748b' }}>L:</span> <span style={{ color: '#F43F5E' }}>{Number(activeHud.low).toFixed(2)}</span></span>}
            {activeHud.close != null && <span><span style={{ color: '#64748b' }}>C:</span> <span style={{ color: isUp ? '#10B981' : '#F43F5E' }}>{Number(activeHud.close).toFixed(2)}</span></span>}
            {activeHud.volume != null && <span><span style={{ color: '#64748b' }}>Vol:</span> {Number(activeHud.volume).toLocaleString()}</span>}
            {activeHud.ema20 != null && <span style={{ color: '#38bdf8' }}>EMA20: {activeHud.ema20}</span>}
            {activeHud.ema50 != null && <span style={{ color: '#f59e0b' }}>EMA50: {activeHud.ema50}</span>}
            {activeHud.ema200 != null && <span style={{ color: '#a855f7' }}>EMA200: {activeHud.ema200}</span>}
            {activeHud.vwap != null && <span style={{ color: '#fbbf24' }}>VWAP: {activeHud.vwap}</span>}
            {activeHud.rsi != null && <span style={{ color: '#f472b6' }}>RSI: {activeHud.rsi}</span>}
            {instVwap != null && <span style={{ color: '#06b6d4' }}>Whale: Rs. {instVwap}</span>}
            {pocPrice != null && <span style={{ color: '#f59e0b' }}>POC: Rs. {pocPrice}</span>}
          </div>

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              title="Exit Fullscreen"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 6,
                padding: '3px 8px',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Minimize2 size={12} />
              <span style={{ fontSize: 11 }}>Exit</span>
            </button>
          )}
        </div>
      )}

      {/* ── Stage 2: Single-Row Horizontal Scrollable Technician Toolbar (Fullscreen Only) ── */}
      {activeIsFullscreen && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          scrollbarWidth: 'none',
          padding: '4px 6px',
          background: '#0d131f',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.06)',
          marginBottom: 6,
          flexShrink: 0
        }}>
          {/* Chart Type: Candles | Area Line */}
          <div style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveMode('candle')}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                border: activeMode === 'candle' ? '1px solid #3875f6' : '1px solid rgba(255,255,255,0.06)',
                background: activeMode === 'candle' ? 'rgba(56, 117, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                color: activeMode === 'candle' ? '#60a5fa' : '#94a3b8'
              }}
            >
              🕯️ Candles
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('line')}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                border: activeMode === 'line' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.06)',
                background: activeMode === 'line' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.03)',
                color: activeMode === 'line' ? '#10b981' : '#94a3b8'
              }}
            >
              📈 Area Line
            </button>
          </div>

          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px', flexShrink: 0 }} />

          {/* Moving Averages & Trend */}
          <button
            type="button"
            onClick={() => setShowEma20(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showEma20 ? 800 : 600, cursor: 'pointer',
              border: showEma20 ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
              background: showEma20 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showEma20 ? '#38bdf8' : '#64748b'
            }}
          >
            EMA 20
          </button>

          <button
            type="button"
            onClick={() => setShowEma50(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showEma50 ? 800 : 600, cursor: 'pointer',
              border: showEma50 ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.06)',
              background: showEma50 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showEma50 ? '#f59e0b' : '#64748b'
            }}
          >
            EMA 50
          </button>

          <button
            type="button"
            onClick={() => setShowEma200(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showEma200 ? 800 : 600, cursor: 'pointer',
              border: showEma200 ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.06)',
              background: showEma200 ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showEma200 ? '#a855f7' : '#64748b'
            }}
          >
            EMA 200
          </button>

          <button
            type="button"
            onClick={() => setShowVwap(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showVwap ? 800 : 600, cursor: 'pointer',
              border: showVwap ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.06)',
              background: showVwap ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showVwap ? '#fbbf24' : '#64748b'
            }}
          >
            VWAP
          </button>

          <button
            type="button"
            onClick={() => setShowBollinger(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showBollinger ? 800 : 600, cursor: 'pointer',
              border: showBollinger ? '1px solid #22d3ee' : '1px solid rgba(255,255,255,0.06)',
              background: showBollinger ? 'rgba(34, 211, 238, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showBollinger ? '#22d3ee' : '#64748b'
            }}
          >
            Bollinger (20,2)
          </button>

          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px', flexShrink: 0 }} />

          {/* Sub-Panes */}
          <button
            type="button"
            onClick={() => setShowRsi(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showRsi ? 800 : 600, cursor: 'pointer',
              border: showRsi ? '1px solid #f472b6' : '1px solid rgba(255,255,255,0.06)',
              background: showRsi ? 'rgba(244, 114, 182, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showRsi ? '#f472b6' : '#64748b'
            }}
          >
            RSI (14)
          </button>

          <button
            type="button"
            onClick={() => setShowMacd(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showMacd ? 800 : 600, cursor: 'pointer',
              border: showMacd ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
              background: showMacd ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showMacd ? '#38bdf8' : '#64748b'
            }}
          >
            MACD (12,26,9)
          </button>

          <button
            type="button"
            onClick={() => setShowVolSma(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showVolSma ? 800 : 600, cursor: 'pointer',
              border: showVolSma ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.06)',
              background: showVolSma ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showVolSma ? '#fbbf24' : '#64748b'
            }}
          >
            Vol SMA 20
          </button>

          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px', flexShrink: 0 }} />

          {/* Key Action Levels & Geometry */}
          {tradePlanCorridor && (
            <button
              type="button"
              onClick={() => setShowTradePlan(v => !v)}
              style={{
                padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showTradePlan ? 800 : 600, cursor: 'pointer',
                border: showTradePlan ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.06)',
                background: showTradePlan ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)',
                color: showTradePlan ? '#10b981' : '#64748b'
              }}
            >
              🎯 Trade Plan
            </button>
          )}

          {(instVwap != null || pocPrice != null) && (
            <button
              type="button"
              onClick={() => {
                const next = !(showInstVwap || showPoc);
                setShowInstVwap(next);
                setShowPoc(next);
              }}
              style={{
                padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: (showInstVwap || showPoc) ? 800 : 600, cursor: 'pointer',
                border: (showInstVwap || showPoc) ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.06)',
                background: (showInstVwap || showPoc) ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.03)',
                color: (showInstVwap || showPoc) ? '#06b6d4' : '#64748b'
              }}
            >
              🐋 Whale Cost & POC
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPivots(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showPivots ? 800 : 600, cursor: 'pointer',
              border: showPivots ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.06)',
              background: showPivots ? 'rgba(203, 213, 225, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showPivots ? '#ffffff' : '#64748b'
            }}
          >
            Pivots
          </button>

          <button
            type="button"
            onClick={() => setShowFib(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showFib ? 800 : 600, cursor: 'pointer',
              border: showFib ? '1px solid #c084fc' : '1px solid rgba(255,255,255,0.06)',
              background: showFib ? 'rgba(192, 132, 252, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showFib ? '#c084fc' : '#64748b'
            }}
          >
            Fibonacci
          </button>

          <button
            type="button"
            onClick={() => setShow52W(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: show52W ? 800 : 600, cursor: 'pointer',
              border: show52W ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.06)',
              background: show52W ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.03)',
              color: show52W ? '#10b981' : '#64748b'
            }}
          >
            52W H/L
          </button>

          <button
            type="button"
            onClick={() => setShowPatterns(v => !v)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: showPatterns ? 800 : 600, cursor: 'pointer',
              border: showPatterns ? '1px solid #fb923c' : '1px solid rgba(255,255,255,0.06)',
              background: showPatterns ? 'rgba(251, 146, 60, 0.2)' : 'rgba(255,255,255,0.03)',
              color: showPatterns ? '#fb923c' : '#64748b'
            }}
          >
            🕯 Patterns
          </button>
        </div>
      )}

      {/* ── Loading Overlay ── */}
      {loading && activeDataset.length === 0 && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(11, 14, 20, 0.85)',
          borderRadius: 12,
          zIndex: 20
        }}>
          <Activity style={{ width: 28, height: 28, color: '#3875F6', animation: 'spin 1.5s linear infinite', marginBottom: 8 }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Loading historical data…</span>
        </div>
      )}

      {/* ── Error Overlay ── */}
      {error && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(11, 14, 20, 0.9)',
          borderRadius: 12,
          padding: 16,
          textAlign: 'center',
          zIndex: 20
        }}>
          <p style={{ fontSize: '12px', fontWeight: 800, color: '#F43F5E', margin: '0 0 4px' }}>⚠️ Chart Data Error</p>
          <p style={{ fontSize: 12, color: '#64748b', maxWidth: 280 }}>{error}</p>
        </div>
      )}

      {/* ── Chart Canvas ── */}
      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: String(dynamicHeight) + 'px',
          position: 'relative'
        }}
      />

      {/* ── Interactive Timeframe Bar ── */}
      {showTimeframeBar && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          padding: '5px 8px',
          background: '#151922',
          borderRadius: 10,
          border: '1px solid rgba(255, 255, 255, 0.07)',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {/* Timeframe Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {TIMEFRAMES.map(tf => {
              const isActive = activeTf === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  onClick={() => handleSelectTimeframe(tf.id)}
                  style={{
                    background: isActive ? '#3875F6' : 'transparent',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 9px',
                    fontSize: 12,
                    fontWeight: isActive ? 900 : 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    fontFamily: 'var(--font-mono, monospace)'
                  }}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          {/* Mode & Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  padding: '4px 7px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {isFullscreen ? <Minimize2 style={{ width: 12, height: 12 }} /> : <Maximize2 style={{ width: 12, height: 12 }} />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tap-to-Expand Trigger (Inline Mode) ── */}
      {!activeIsFullscreen && (showAdvancedChartBtn || onOpenTradingView || onToggleFullscreen) && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            type="button"
            onClick={onOpenTradingView || onToggleFullscreen}
            style={{
              width: '100%',
              background: 'rgba(56, 117, 246, 0.08)',
              border: '1px solid rgba(56, 117, 246, 0.22)',
              borderRadius: 8,
              padding: '7px 14px',
              color: '#60a5fa',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
          >
            <span>📊</span>
            <span>Tap for Fullscreen Technical Analysis (EMA, RSI, MACD, Pivots, Targets) ↗</span>
          </button>
        </div>
      )}

      {/* ── Stage 2: Technician's Quick Diagnosis Drawer (Fullscreen Only) ── */}
      {activeIsFullscreen && (
        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          background: '#0d131f',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.07)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 6,
            fontSize: 11.5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Trend verdict */}
              <span style={{
                padding: '2px 8px',
                borderRadius: 6,
                fontWeight: 800,
                color: trendVerdict.color,
                background: trendVerdict.bg,
                border: `1px solid ${trendVerdict.color}44`,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <Sparkles size={11} />
                {trendVerdict.label}
              </span>

              {/* Trade Plan Setup Score & Verdict Badge */}
              {tradePlanCorridor && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 800,
                  color: tradePlanCorridor.setupScore >= 70 ? '#10b981' : tradePlanCorridor.setupScore >= 50 ? '#38bdf8' : '#fb923c',
                  background: tradePlanCorridor.setupScore >= 70 ? 'rgba(16, 185, 129, 0.15)' : tradePlanCorridor.setupScore >= 50 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(251, 146, 60, 0.15)',
                  border: `1px solid ${tradePlanCorridor.setupScore >= 70 ? '#10b98144' : tradePlanCorridor.setupScore >= 50 ? '#38bdf844' : '#fb923c44'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <span>🎯 Setup: {tradePlanCorridor.setupScore}/100</span>
                  {tradePlanCorridor.verdict && <span style={{ opacity: 0.85 }}>• {tradePlanCorridor.verdict}</span>}
                </span>
              )}

              {/* Broker Accumulation / Distribution Status */}
              {brokerAnalysis && (brokerAnalysis.adSignal || brokerAnalysis.smartMoneyBias) && (() => {
                const sig = brokerAnalysis.adSignal || brokerAnalysis.smartMoneyBias;
                const isAcc = String(sig).includes('Accum') || String(sig).includes('Cornering');
                const isDist = String(sig).includes('Dist') || String(sig).includes('Offloading');
                const col = isAcc ? '#10b981' : isDist ? '#f43f5e' : '#94a3b8';
                return (
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontWeight: 800,
                    color: col,
                    background: col + '18',
                    border: `1px solid ${col}44`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <span>🏦 Broker: {sig}</span>
                    {Number(brokerAnalysis.bcr3BuyPct) > 0 && <span style={{ fontSize: 10.5, opacity: 0.85 }}>({Number(brokerAnalysis.bcr3BuyPct).toFixed(0)}% BCR3)</span>}
                  </span>
                );
              })()}

              {/* RSI Badge */}
              {rsiBadge && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 800,
                  color: rsiBadge.color,
                  background: rsiBadge.bg,
                  border: `1px solid ${rsiBadge.color}44`,
                  fontFamily: 'var(--font-mono, monospace)'
                }}>
                  {rsiBadge.text}
                </span>
              )}

              {/* MACD Hist Badge */}
              {currentMacdHist != null && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 800,
                  color: currentMacdHist >= 0 ? '#34d399' : '#fb7185',
                  background: currentMacdHist >= 0 ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 113, 133, 0.12)',
                  border: `1px solid ${currentMacdHist >= 0 ? '#34d399' : '#fb7185'}44`,
                  fontFamily: 'var(--font-mono, monospace)'
                }}>
                  MACD {currentMacdHist >= 0 ? '▲ +' : '▼ '}{currentMacdHist.toFixed(2)}
                </span>
              )}

              {/* RVOL Badge */}
              {rvolBadge && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 800,
                  color: rvolBadge.color,
                  background: rvolBadge.bg,
                  border: `1px solid ${rvolBadge.color}44`
                }}>
                  {rvolBadge.text}
                </span>
              )}
            </div>

            {/* Trade Plan / Pivot Corridors */}
            {tradePlanCorridor ? (
              <div style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: '#94a3b8', flexWrap: 'wrap' }}>
                {tradePlanCorridor.entry && <span>Entry: <strong style={{ color: '#38bdf8' }}>Rs. {tradePlanCorridor.entry}</strong></span>}
                {tradePlanCorridor.t1 && <span>T1: <strong style={{ color: '#34d399' }}>Rs. {tradePlanCorridor.t1}</strong></span>}
                {tradePlanCorridor.t2 && <span>T2: <strong style={{ color: '#10b981' }}>Rs. {tradePlanCorridor.t2}</strong></span>}
                {tradePlanCorridor.sl && <span>SL: <strong style={{ color: '#ef4444' }}>Rs. {tradePlanCorridor.sl}</strong></span>}
                {tradePlanCorridor.rrRatio && <span>R:R: <strong style={{ color: '#38bdf8' }}>1:{Number(tradePlanCorridor.rrRatio).toFixed(1)}</strong></span>}
              </div>
            ) : pivotData ? (
              <div style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: '#94a3b8' }}>
                <span>Target (R1): <strong style={{ color: '#34d399' }}>Rs. {pivotData.R1}</strong></span>
                <span>Stop (S1): <strong style={{ color: '#fb7185' }}>Rs. {pivotData.S1}</strong></span>
              </div>
            ) : null}
          </div>

          {/* Pattern Detected Signals Strip */}
          {effectiveShowPatterns && patternMarkers.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 6px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 6,
              fontSize: 11,
              flexWrap: 'wrap'
            }}>
              <span style={{ color: '#64748b', fontWeight: 700 }}>Signals:</span>
              {patternMarkers.slice(-5).map((m, i) => (
                <span
                  key={i}
                  style={{
                    padding: '1px 6px',
                    borderRadius: 4,
                    color: m.color,
                    background: m.color + '15',
                    border: `1px solid ${m.color}33`,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 10.5
                  }}
                >
                  {m.shape === 'arrowUp' ? '▲' : '▼'} {m.text} ({String(m.time).slice(5)})
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
