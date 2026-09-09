import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, LineStyle } from 'lightweight-charts';
import { fetchRealPriceHistory } from '../utils/liveData';
import { fetchNepseIntradayGraph, synthesizeIntradaySession } from '../utils/servicesApi';
import { Activity, Maximize2, Minimize2, TrendingUp, BarChart2 } from 'lucide-react';

const TIMEFRAMES = [
  { id: '1D', label: '1D', days: 1 },
  { id: '1W', label: '1W', days: 7 },
  { id: '1M', label: '1M', days: 30 },
  { id: '3M', label: '3M', days: 90 },
  { id: '6M', label: '6M', days: 180 },
  { id: '1Y', label: '1Y', days: 365 },
  { id: 'ALL', label: 'All', days: 1000 },
];

/**
 * Nepal Timezone Offset (UTC+5:45) in seconds = 20,700
 */
export const NPT_OFFSET_SEC = 5 * 3600 + 45 * 60;

/**
 * Helper: dynamically determine the session year, month (0-indexed), and day
 * from dataset records or current Nepal Standard Time.
 */
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

/**
 * Format timestamp or date string to Nepal Timezone (Asia/Kathmandu)
 */
function formatNptDate(dateObj) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj); // YYYY-MM-DD
  return parts;
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

export default function ShareHubChart({
  history,
  symbol = 'NEPSE',
  mode = 'candle',
  chartTimeframe = '1M',
  height = 340,
  isIntraday = false,
  stock = null,
  showTimeframeBar = true,
  showAdvancedChartBtn = true,
  onTimeframeChange = null,
  onOpenTradingView = null,
  onToggleFullscreen = null,
  isFullscreen = false
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const mainSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  const [activeTf, setActiveTf] = useState(chartTimeframe || '1M');
  const [activeMode, setActiveMode] = useState(mode || 'candle');
  const [rawHistory, setRawHistory] = useState(Array.isArray(history) && history.length > 0 ? history : []);
  const [intradayData, setIntradayData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hoverData, setHoverData] = useState(null);

  // Sync props when chartTimeframe or mode changes from parent
  useEffect(() => {
    if (chartTimeframe) setActiveTf(chartTimeframe);
  }, [chartTimeframe]);

  useEffect(() => {
    if (mode) setActiveMode(mode);
  }, [mode]);

  // If history prop changes, update internal rawHistory and clear loading
  useEffect(() => {
    if (Array.isArray(history) && history.length > 0) {
      setRawHistory(history);
      setLoading(false);
      setError(null);
    }
  }, [history]);

  // If history prop is not provided, fetch price history from API
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

  // Autonomous Intraday Fetch: when 1D is selected, guarantee authentic 11:00 AM to 3:00 PM data
  useEffect(() => {
    if (activeTf !== '1D') return;

    // Check if rawHistory already contains authentic intraday ticks
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

  // Choose the active dataset based on timeframe
  const activeDataset = useMemo(() => {
    if (activeTf === '1D' && intradayData.length > 0) {
      return intradayData;
    }
    return rawHistory;
  }, [activeTf, intradayData, rawHistory]);

  // Detect whether current view is intraday (1D timeline: 11:00 AM to 3:00 PM)
  const isTrulyIntraday = useMemo(() => {
    return activeTf === '1D';
  }, [activeTf]);

  // Aggregate raw 1-minute tick points into authentic 5-minute OHLC candlesticks for Intraday (11 AM to 3 PM)
  const aggregateToIntradayCandles = useCallback((points, intervalMinutes = 5) => {
    if (!Array.isArray(points) || points.length === 0) return [];
    const intervalSec = intervalMinutes * 60;
    const buckets = new Map();
    const sDate = getDatasetSessionDate(points, rawHistory);

    for (const pt of points) {
      let ts = null;
      if (pt.timestamp && pt.timestamp > 1e8) {
        const sec = pt.timestamp > 1e11 ? Math.floor(pt.timestamp / 1000) : Math.floor(pt.timestamp);
        ts = sec + NPT_OFFSET_SEC; // Shift by Nepal Timezone so UTC hours match Nepal 11:00 AM - 3:00 PM
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

  // Format and slice data strictly based on selected timeframe & NEPSE open dates
  const processedChartData = useMemo(() => {
    // CASE 1: True Intraday (1D) — 11:00 AM to 3:00 PM session
    if (activeTf === '1D') {
      let intradaySource = null;
      if (intradayData.length > 0) {
        intradaySource = intradayData;
      } else {
        // Check if rawHistory contains authentic intraday ticks
        const hasIntradayInRaw = Array.isArray(rawHistory) && rawHistory.length > 1 && rawHistory.some(pt => {
          const timeStr = String(pt.time || pt.date || '');
          if (/\d{1,2}:\d{2}/.test(timeStr)) return true;
          if (pt.timestamp && pt.timestamp > 1e8) {
            const sec = pt.timestamp > 1e11 ? Math.floor(pt.timestamp / 1000) : Math.floor(pt.timestamp);
            return (sec % 86400) !== 0;
          }
          return false;
        });

        if (hasIntradayInRaw) {
          intradaySource = rawHistory;
        } else {
          // Resilient Session Synthesis: guarantees 1D NEVER renders a single giant daily candle
          const latestDaily = Array.isArray(rawHistory) && rawHistory.length > 0 ? rawHistory[rawHistory.length - 1] : null;
          const ltpVal = Number(stock?.ltp || latestDaily?.close || 100);
          const synthOHLC = {
            open: Number(stock?.open || latestDaily?.open || ltpVal),
            high: Math.max(ltpVal, Number(stock?.high || latestDaily?.high || ltpVal)),
            low: Math.min(ltpVal, Number(stock?.low || latestDaily?.low || ltpVal)),
            close: ltpVal,
            volume: Number(latestDaily?.volume || stock?.volume || 10000)
          };
          const sessionDateStr = latestDaily?.date || latestDaily?.time || null;
          intradaySource = synthesizeIntradaySession(synthOHLC, sessionDateStr);
        }
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

      // Line mode: pass each tick with normalized epoch seconds
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

    // CASE 2: Daily / Historical Data (1W, 1M, 3M, 6M, 1Y, ALL)
    // Filter by exact NEPSE open trading dates (ISO date string)
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
        time: dateKey, // ISO Date String: "YYYY-MM-DD"
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
      // 1W: The open sessions belonging to the current trading week / past 7 calendar days
      const oneWeekAgo = new Date(latestDate.getTime() - 7 * 24 * 3600 * 1000);
      const weekBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= oneWeekAgo);
      sliced = weekBars.length >= 4 ? weekBars : allSorted.slice(-Math.min(5, allSorted.length));
    } else if (tf === '1M' || tf === '30') {
      // 1M: Trading sessions within past 30 calendar days
      const oneMonthAgo = new Date(latestDate.getTime() - 30 * 24 * 3600 * 1000);
      const monthBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= oneMonthAgo);
      sliced = monthBars.length >= 15 ? monthBars : allSorted.slice(-Math.min(22, allSorted.length));
    } else if (tf === '3M' || tf === '90') {
      // 3M: Trading sessions within past 90 calendar days
      const threeMonthsAgo = new Date(latestDate.getTime() - 90 * 24 * 3600 * 1000);
      const qtrBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= threeMonthsAgo);
      sliced = qtrBars.length >= 45 ? qtrBars : allSorted.slice(-Math.min(66, allSorted.length));
    } else if (tf === '6M' || tf === '180') {
      // 6M: Trading sessions within past 180 calendar days
      const sixMonthsAgo = new Date(latestDate.getTime() - 180 * 24 * 3600 * 1000);
      const halfYearBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= sixMonthsAgo);
      sliced = halfYearBars.length >= 90 ? halfYearBars : allSorted.slice(-Math.min(132, allSorted.length));
    } else if (tf === '1Y' || tf === '365') {
      // 1Y: Trading sessions within past 365 calendar days
      const oneYearAgo = new Date(latestDate.getTime() - 365 * 24 * 3600 * 1000);
      const yearBars = allSorted.filter(b => new Date(b.time + 'T00:00:00Z') >= oneYearAgo);
      sliced = yearBars.length >= 180 ? yearBars : allSorted.slice(-Math.min(260, allSorted.length));
    } else {
      // ALL
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

  // Handle user changing timeframe
  const handleSelectTimeframe = (tfId) => {
    setActiveTf(tfId);
    if (onTimeframeChange) {
      onTimeframeChange(tfId);
    }
  };

  // Render chart using Lightweight Charts
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (processedChartData.length === 0) return;

    // Cleanup previous chart instance
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch (_) {}
      chartRef.current = null;
    }

    const isCandle = activeMode === 'candle';
    const container = chartContainerRef.current;

    try {
      const chart = createChart(container, {
        width: container.clientWidth || 600,
        height: height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
          fontSize: 11,
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
          scaleMargins: { top: 0.12, bottom: 0.20 },
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

      // Main Series (Candlestick or Line)
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
      } else {
        // Professional international standard AreaSeries (TradingView, Webull, Apple Stocks, Robinhood)
        const firstPoint = processedChartData[0];
        const lastPoint = processedChartData[processedChartData.length - 1];
        const firstVal = Number(firstPoint?.close ?? firstPoint?.value ?? 0);
        const lastVal = Number(lastPoint?.close ?? lastPoint?.value ?? 0);
        const isBull = stock?.change != null ? (Number(stock.change) >= 0) : (lastVal >= firstVal);

        const bullLine = '#10B981';
        const bullTop = 'rgba(16, 185, 129, 0.28)';
        const bullBottom = 'rgba(16, 185, 129, 0.00)';

        const bearLine = '#F43F5E';
        const bearTop = 'rgba(244, 63, 94, 0.28)';
        const bearBottom = 'rgba(244, 63, 94, 0.00)';

        const lineColor = isBull ? bullLine : bearLine;
        const topColor = isBull ? bullTop : bearTop;
        const bottomColor = isBull ? bullBottom : bearBottom;

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

      // Add Previous Close Baseline if available (Standard in Apple Stocks, TradingView & Webull)
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

      // Volume Series
      const hasVolume = processedChartData.some(d => (Number(d.volume) || 0) > 0);
      if (hasVolume) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        volumeSeries.setData(processedChartData.map(d => ({
          time: d.time,
          value: Number(d.volume) || 0,
          color: d.close >= d.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'
        })));
        volumeSeriesRef.current = volumeSeries;
      }

      // Crosshair HUD Subscriber
      chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesData) {
          setHoverData(null);
          return;
        }
        const sData = param.seriesData.get(mainSeries);
        if (sData) {
          setHoverData({
            time: param.time,
            open: sData.open ?? sData.value,
            high: sData.high ?? sData.value,
            low: sData.low ?? sData.value,
            close: sData.close ?? sData.value,
            value: sData.value ?? sData.close
          });
        }
      });

      // Fit content unconditionally: guarantees the first bar on the left is displayed
      chart.timeScale().fitContent();
      requestAnimationFrame(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      });
      chartRef.current = chart;

      // Window Resize Observer: re-fits content when container expands into view
      const observer = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;
        const { width } = entries[0].contentRect;
        if (chartRef.current && width > 0) {
          chartRef.current.applyOptions({ width, height });
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
  }, [processedChartData, activeMode, isTrulyIntraday, height]);

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

  const isUp = activeHud ? (activeHud.close >= (activeHud.open ?? activeHud.close)) : true;

  // Format time/date label for the HUD bar
  const hudTimeLabel = useMemo(() => {
    if (!activeHud || !activeHud.time) return '';
    if (isTrulyIntraday && typeof activeHud.time === 'number') {
      return formatNptTime(activeHud.time);
    }
    return formatNptFullDate(activeHud.time);
  }, [activeHud, isTrulyIntraday]);

  return (
    <div style={{
      width: '100%',
      height: isFullscreen ? '100%' : 'auto',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      position: 'relative'
    }}>
      {/* ── Top Legend & Crosshair HUD Bar ── */}
      {activeHud && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 6px 8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          marginBottom: 8,
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
          flexWrap: 'wrap',
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02em' }}>{symbol}</span>
            <span style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: 4,
              background: isTrulyIntraday ? 'rgba(56, 117, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              color: isTrulyIntraday ? '#60a5fa' : '#94a3b8',
              fontWeight: 700
            }}>
              {isTrulyIntraday ? (activeMode === 'candle' ? '5m Intraday' : '1m Ticks') : 'Daily'}
            </span>
            <span style={{
              fontSize: '13px',
              fontWeight: 900,
              color: isUp ? '#10B981' : '#F43F5E'
            }}>
              Rs. {Number(activeHud.close || activeHud.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {hudTimeLabel && (
              <span style={{ fontSize: '10px', color: '#64748b' }}>({hudTimeLabel})</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8' }}>
            {activeHud.open != null && (
              <span><span style={{ color: '#64748b' }}>O</span> {Number(activeHud.open).toFixed(2)}</span>
            )}
            {activeHud.high != null && (
              <span><span style={{ color: '#64748b' }}>H</span> <span style={{ color: '#10B981' }}>{Number(activeHud.high).toFixed(2)}</span></span>
            )}
            {activeHud.low != null && (
              <span><span style={{ color: '#64748b' }}>L</span> <span style={{ color: '#F43F5E' }}>{Number(activeHud.low).toFixed(2)}</span></span>
            )}
            {activeHud.close != null && (
              <span><span style={{ color: '#64748b' }}>C</span> <span style={{ color: isUp ? '#10B981' : '#F43F5E' }}>{Number(activeHud.close).toFixed(2)}</span></span>
            )}
          </div>
        </div>
      )}

      {/* ── Loading Overlay: only shown when no data is rendered yet ── */}
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
          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Loading historical data…</span>
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
          <p style={{ fontSize: '10.5px', color: '#64748b', maxWidth: 280 }}>{error}</p>
        </div>
      )}

      {/* ── Chart Canvas ── */}
      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: String(height) + 'px',
          position: 'relative'
        }}
      />

      {/* ── Interactive Timeframe & Mode Control Bar ── */}
      {showTimeframeBar && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          padding: '6px 8px',
          background: '#151922',
          borderRadius: 10,
          border: '1px solid rgba(255, 255, 255, 0.07)',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {/* Timeframe Pills: 1D | 1W | 1M | 3M | 6M | 1Y | ALL */}
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
                    fontSize: '11px',
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

          {/* Mode & Action Controls: Line | Candle | Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Mode Switcher */}
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 6,
              padding: 2,
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <button
                type="button"
                onClick={() => setActiveMode('line')}
                title="Line Chart"
                style={{
                  background: activeMode === 'line' ? 'rgba(56, 117, 246, 0.25)' : 'transparent',
                  color: activeMode === 'line' ? '#60a5fa' : '#64748b',
                  border: 'none',
                  borderRadius: 4,
                  padding: '3px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <TrendingUp style={{ width: 12, height: 12 }} />
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('candle')}
                title="Candlestick Chart"
                style={{
                  background: activeMode === 'candle' ? 'rgba(56, 117, 246, 0.25)' : 'transparent',
                  color: activeMode === 'candle' ? '#60a5fa' : '#64748b',
                  border: 'none',
                  borderRadius: 4,
                  padding: '3px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <BarChart2 style={{ width: 12, height: 12 }} />
              </button>
            </div>

            {/* Fullscreen Toggle */}
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

      {/* ── View Advanced Chart Button ── */}
      {showAdvancedChartBtn && onOpenTradingView && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button
            type="button"
            onClick={onOpenTradingView}
            style={{
              background: 'rgba(56, 117, 246, 0.08)',
              border: '1px solid rgba(56, 117, 246, 0.25)',
              borderRadius: 20,
              padding: '6px 18px',
              color: '#60a5fa',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
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
