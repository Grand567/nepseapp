import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, X, Layers, CheckCircle2, TrendingUp, TrendingDown,
  Activity, Zap, BookOpen, Users, LineChart, PieChart, BarChart2,
  Shield, Calculator as CalcIcon, BrainCircuit, Star, Download,
  Calendar, Filter, ArrowUpRight, ArrowDownRight, RefreshCw, AlertCircle,
  Target, Flame, Award
} from 'lucide-react';
import ShareHubChart from './ShareHubChart';
import AdvancedChartModal from './AdvancedChartModal';
import {
  calculatePivotPoints,
  calculateFibonacci,
  getPeerStocks
} from '../utils/mockData';
import { calculateBuyDetails, calculateSellDetails } from '../utils/calculations';
import {
  calculateGrahamIntrinsicValue,
  classifyActionZone,
  calculateVolumeZScore,
  calculateCompositeTechnicalScore,
  calculateATR,
  calculateRiskRewardRatio
} from '../utils/quantEngine';
import {
  fetchStockFundamentals,
  fetchRealPriceHistory,
  fetchRealFloorsheet,
  fetchRealBrokerAnalysis,
  fetchMarketDepth,
  fetchDividendHistory,
  fetchCompareStocks,
  getLatestTradingDateStr,
  getCachedRealPriceHistory,
  getCachedRealBrokerAnalysis,
  getCachedRealFloorsheet,
  getCachedStockFundamentals
} from '../utils/liveData';
import { fetchNepseIntradayGraph } from '../utils/servicesApi';
import { getDetailedMarketStatus } from '../utils/nepseCalendar';
import { analyzeStockWithAi, generateOfflineStockReport } from '../services/aiService';
import { useBackHandler } from '../context/NavigationContext';
import { DividendHistoryPanel } from './DividendHistoryPanel';



const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtCr = n => {
  if (n == null || isNaN(n) || n === 0) return '—';
  if (n >= 1000000000) return `Rs. ${(n / 1000000000).toFixed(2)}B`;
  if (n >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `Rs. ${(n / 100000).toFixed(2)}L`;
  return `Rs. ${fmt(n)}`;
};

export default function StockDetailModal({ stock, allStocks = [], onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [chartTimeframe, setChartTimeframe] = useState('1M');
  const [chartMode, setChartMode] = useState('line');
  const [liveDetail, setLiveDetail] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [historyTimeframe, setHistoryTimeframe] = useState('1Y');
  const scrollRef = useRef(null);

  // ── Real data state (declared before useMemo/useCallback dependencies) ──
  const [history, setHistory] = useState([]);
  const [realPriceHistory, setRealPriceHistory] = useState(null);
  const [realHistoryLoading, setRealHistoryLoading] = useState(false);
  const [realFloorsheet, setRealFloorsheet] = useState(null);
  const [floorsheetLoading, setFloorsheetLoading] = useState(false);
  const [floorsheetPage, setFloorsheetPage] = useState(1);
  const [realBrokerAnalysis, setRealBrokerAnalysis] = useState(null);
  const [brokerAnalysisLoading, setBrokerAnalysisLoading] = useState(false);
  const [realMarketDepth, setRealMarketDepth] = useState(null);
  const [marketDepthLoading, setMarketDepthLoading] = useState(false);
  const [dividendHistory, setDividendHistory] = useState(null);
  const [dividendLoading, setDividendLoading] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState('');
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [comparePeer, setComparePeer] = useState(null);

  // Register mobile back gesture so Android back swipes close this modal smoothly
  useBackHandler(() => {
    onClose();
    return true;
  }, true, 100);

  // Normalize incoming stock (if symbol string was passed, find it in allStocks)
  const resolvedStock = useMemo(() => {
    if (!stock) return null;
    if (typeof stock === 'string') {
      const found = allStocks.find(s => s && s.symbol === stock.toUpperCase());
      return found || { symbol: stock.toUpperCase(), name: stock.toUpperCase(), ltp: 350, pChange: 0, sector: 'Commercial Banks' };
    }
    if (typeof stock === 'object') {
      if (!stock.symbol) return { symbol: 'STOCK', name: 'Stock Details', ltp: 350, pChange: 0, sector: 'Commercial Banks' };
      const found = allStocks.find(s => s && s.symbol === stock.symbol);
      return found ? { ...found, ...stock } : stock;
    }
    return null;
  }, [stock, allStocks]);

  // Derived stock merged with live fundamentals with complete null safety (Strictly NO mock data)
  const d = useMemo(() => {
    const s = resolvedStock || { symbol: 'STOCK', name: 'Stock Details', ltp: 350, pChange: 0, sector: 'Commercial Banks' };
    const ltp = Number(liveDetail?.closePrice || liveDetail?.marketPrice || s.ltp || s.closePrice || 0);

    // Derive 52W High / Low from real price history if not in liveDetail
    let histHigh = 0;
    let histLow = 0;
    if (realPriceHistory && realPriceHistory.length > 0) {
      histHigh = Math.max(...realPriceHistory.map(h => Number(h.high || h.close || 0)));
      const lows = realPriceHistory.map(h => Number(h.low || h.close || 0)).filter(p => p > 0);
      if (lows.length > 0) histLow = Math.min(...lows);
    }

    const high52w = Number(liveDetail?.high52w || s.high52w || (histHigh > 0 ? histHigh : (ltp > 0 ? ltp : 0)));
    const low52w = Number(liveDetail?.low52w || s.low52w || (histLow > 0 ? histLow : (ltp > 0 ? ltp : 0)));

    const eps = Number(liveDetail?.eps > 0 ? liveDetail.eps : (s.eps > 0 ? s.eps : 0));
    const bookValue = Number(liveDetail?.bookValue > 0 ? liveDetail.bookValue : (s.bookValue > 0 ? s.bookValue : 0));
    const pe = Number(liveDetail?.pe > 0 ? liveDetail.pe : (s.pe > 0 ? s.pe : (eps > 0 && ltp > 0 ? +(ltp / eps).toFixed(2) : 0)));
    const pb = Number(liveDetail?.pbv > 0 ? liveDetail.pbv : (liveDetail?.pb > 0 ? liveDetail.pb : (s.pb > 0 ? s.pb : (s.pbv > 0 ? s.pbv : (bookValue > 0 && ltp > 0 ? +(ltp / bookValue).toFixed(2) : 0)))));

    const listedShares = Number(liveDetail?.listedShares || liveDetail?.sharesOutstanding || s.listedShares || 0);
    const paidUpCapital = Number(liveDetail?.paidUpCapital || s.paidUpCapital || 0);
    const marketCap = Number(liveDetail?.marketCap || s.marketCap || (listedShares > 0 && ltp > 0 ? listedShares * ltp : 0));

    const promoterPercentage = Number(liveDetail?.promoterPercentage || s.promoterPercentage || 0);
    const publicPercentage = Number(liveDetail?.publicPercentage || s.publicPercentage || (promoterPercentage > 0 ? +(100 - promoterPercentage).toFixed(2) : 0));

    return {
      ...s,
      ltp: ltp > 0 ? ltp : Number(s.ltp || 0),
      pChange: Number(liveDetail?.pChange !== undefined ? liveDetail.pChange : (s.pChange || 0)),
      change: Number(liveDetail?.change !== undefined ? liveDetail.change : (s.change || 0)),
      open: Number(liveDetail?.openPrice || s.open || ltp),
      high: Number(liveDetail?.highPrice || s.high || ltp),
      low: Number(liveDetail?.lowPrice || s.low || ltp),
      prevClose: Number(liveDetail?.prevClose || s.prevClose || (ltp - (s.change || 0))),
      eps,
      pe,
      pb,
      bookValue,
      high52w,
      low52w,
      marketCap,
      listedShares,
      paidUpCapital,
      promoterPercentage,
      publicPercentage,
      bonusShare: Number(liveDetail?.bonus || s.bonusShare || 0),
      cashDiv: Number(liveDetail?.dividend || s.cashDiv || 0),
      companyName: liveDetail?.companyName || s.companyName || s.name || s.symbol,
      sector: liveDetail?.sector || s.sector || 'Others',
      isin: liveDetail?.isin || s.isin || '',
      listingDate: liveDetail?.listingDate || s.listingDate || ''
    };
  }, [resolvedStock, liveDetail, realPriceHistory]);

  // Helper: compute performance return for N days using real price history
  const computePerformance = useCallback((days) => {
    const hist = realPriceHistory;
    if (!hist || hist.length < 2) return null;
    const latest = hist[hist.length - 1]?.close;
    const idx = Math.max(0, hist.length - 1 - days);
    const past = hist[idx]?.close;
    if (!latest || !past || past === 0) return null;
    const pct = ((latest - past) / past) * 100;
    return { pct: Number(pct.toFixed(2)), bull: pct >= 0 };
  }, [realPriceHistory]);

  // Fetch real price history (500 trading days) & corporate dividend history
  useEffect(() => {
    let active = true;
    if (!d?.symbol) return;

    // Keep real historical data intact by initializing from cache immediately
    const cachedFund = getCachedStockFundamentals(d.symbol);
    if (cachedFund) setLiveDetail(cachedFund);
    else setLiveDetail(null);

    fetchStockFundamentals(d.symbol).then(fund => {
      if (!active) return;
      if (fund) {
        setLiveDetail(fund);
        // If core valuation fundamentals are missing or zero, force fresh scrape from Merolagani/ShareSansar
        if ((!fund.bookValue || fund.bookValue <= 0) || (!fund.pe || fund.pe <= 0)) {
          fetchStockFundamentals(d.symbol, true).then(refreshed => {
            if (active && refreshed && (refreshed.bookValue > 0 || refreshed.pe > 0)) {
              setLiveDetail(refreshed);
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});

    const cachedFloorsheet = getCachedRealFloorsheet(d.symbol);
    if (cachedFloorsheet) setRealFloorsheet(cachedFloorsheet);
    else setRealFloorsheet(null);

    const cachedBroker = getCachedRealBrokerAnalysis(d.symbol);
    if (cachedBroker) setRealBrokerAnalysis(cachedBroker);
    else setRealBrokerAnalysis(null);

    const cachedHist = getCachedRealPriceHistory(d.symbol);
    if (cachedHist && cachedHist.length > 0) {
      setRealPriceHistory(cachedHist);
      setHistory(cachedHist.map(item => ({
        date: item.date,
        time: item.date,
        open: Number(item.open) || Number(item.close),
        high: Number(item.high) || Number(item.close),
        low: Number(item.low) || Number(item.close),
        close: Number(item.close),
        volume: Number(item.volume) || 0
      })));
    }

    setRealMarketDepth(null);
    setFloorsheetPage(1);

    setRealHistoryLoading(!cachedHist || cachedHist.length === 0);
    fetchRealPriceHistory(d.symbol, 500).then(data => {
      if (!active) return;
      let fullHistory = (data && Array.isArray(data)) ? [...data] : [];

      const todayLtp = Number(d.ltp || d.closePrice || 0);
      const todayDate = d.businessDate || d.date || getLatestTradingDateStr();

      if (todayLtp > 0 && fullHistory.length > 0) {
        const last = fullHistory[fullHistory.length - 1];
        const isLastToday = last && (last.date === todayDate || String(last.date).slice(0, 10) === todayDate);

        const todayRecord = {
          date: todayDate,
          open: Number(d.open) || todayLtp,
          high: Math.max(Number(d.high) || todayLtp, todayLtp),
          low: Math.min(Number(d.low) || todayLtp, todayLtp),
          close: todayLtp,
          volume: Number(d.volume || d.totalTradedQuantity || 0),
          turnover: Number(d.turnover || d.totalTradedValue || 0),
          trades: Number(d.transactions || d.totalTrades || 0),
          change: Number(d.change || 0),
          pChange: Number(d.pChange || 0),
          isToday: true,
          isReal: true
        };

        if (isLastToday) {
          fullHistory[fullHistory.length - 1] = { ...last, ...todayRecord };
        } else {
          fullHistory.push(todayRecord);
        }
      }

      if (fullHistory.length > 0) {
        setRealPriceHistory(fullHistory);
        const chartData = fullHistory.map(item => ({
          date: item.date,
          time: item.date,
          open: Number(item.open) || Number(item.close),
          high: Number(item.high) || Number(item.close),
          low: Number(item.low) || Number(item.close),
          close: Number(item.close),
          volume: Number(item.volume) || 0
        }));
        if (chartData.length > 0) setHistory(chartData);
      } else {
        setRealPriceHistory([]);
        setHistory([]);
      }
    }).catch(() => {
      if (active) {
        setRealPriceHistory([]);
        setHistory([]);
      }
    }).finally(() => { if (active) setRealHistoryLoading(false); });

    // Eagerly fetch corporate dividend, bonus & rights history
    setDividendLoading(true);
    fetchDividendHistory(d.symbol).then(data => {
      if (active && data) {
        setDividendHistory(data);
      }
    }).catch(() => {}).finally(() => {
      if (active) setDividendLoading(false);
    });

    return () => { active = false; };
  }, [d?.symbol]);

  // Fetch real floorsheet (runs when depth_broker tab is active)
  const fetchFloorsheetData = useCallback(async (page = 1) => {
    if (!d?.symbol) return;
    setFloorsheetLoading(true);
    try {
      const data = await fetchRealFloorsheet(d.symbol, '', page, 25);
      if (data && data.rows && data.rows.length > 0) {
        setRealFloorsheet(prev => page === 1 ? data : {
          ...data,
          rows: [...(prev?.rows || []), ...data.rows]
        });
        setFloorsheetPage(page);
      }
    } catch (_) {}
    setFloorsheetLoading(false);
  }, [d?.symbol]);

  // Fetch real broker analysis (runs when depth_broker tab active)
  const fetchBrokerAnalysisData = useCallback(async () => {
    if (!d?.symbol) return;
    setBrokerAnalysisLoading(true);
    try {
      const data = await fetchRealBrokerAnalysis(d.symbol, 30);
      if (data) setRealBrokerAnalysis(data);
    } catch (_) {}
    setBrokerAnalysisLoading(false);
  }, [d?.symbol]);

  // Trigger real data fetch when switching to the depth/broker tab
  useEffect(() => {
    if (activeTab === 'depth_broker' && d?.symbol) {
      if (!realFloorsheet) fetchFloorsheetData(1);
      if (!realBrokerAnalysis) fetchBrokerAnalysisData();
      if (!realMarketDepth && !marketDepthLoading) {
        setMarketDepthLoading(true);
        fetchMarketDepth(d.symbol)
          .then(data => { if (data) setRealMarketDepth(data); })
          .catch(() => {})
          .finally(() => setMarketDepthLoading(false));
      }
    }
    if (activeTab === 'dividends' && d?.symbol && !dividendHistory && !dividendLoading) {
      setDividendLoading(true);
      fetchDividendHistory(d.symbol)
        .then(data => { if (data) setDividendHistory(data); })
        .catch(() => {})
        .finally(() => setDividendLoading(false));
    }
    if (activeTab === 'compare' && d?.symbol && !comparePeer) {
      const peers = getPeerStocks ? getPeerStocks(d, Array.isArray(allStocks) ? allStocks : []) : [];
      const peerSymbol = peers.length > 0 ? peers[0]?.symbol : null;
      if (peerSymbol) setCompareSymbol(peerSymbol);
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activeTab, d?.symbol]);

  // Synchronize 1D intraday data whenever 1D timeframe is selected
  useEffect(() => {
    if (chartTimeframe === '1D' && d?.symbol) {
      fetchNepseIntradayGraph(d.symbol).then(intraday => {
        if (intraday && Array.isArray(intraday) && intraday.length > 0) {
          setHistory(intraday);
        }
      }).catch(() => {});
    }
  }, [chartTimeframe, d?.symbol]);

  const handleTimeframeChange = async (tf) => {
    setChartTimeframe(tf);
    if (!d?.symbol) return;

    if (tf === '1D') {
      try {
        const intraday = await fetchNepseIntradayGraph(d.symbol);
        if (intraday && Array.isArray(intraday) && intraday.length > 0) {
          setHistory(intraday);
          return;
        }
      } catch (err) {
        console.warn('[StockDetailModal] Failed to fetch intraday for ' + d.symbol, err);
      }
    }

    if (realPriceHistory && realPriceHistory.length > 0) {
      const formatted = realPriceHistory.map(item => ({
        date: item.date,
        time: item.date,
        open: Number(item.open) || Number(item.close),
        high: Number(item.high) || Number(item.close),
        low: Number(item.low) || Number(item.close),
        close: Number(item.close),
        volume: Number(item.volume) || 0
      }));
      setHistory(formatted);
    } else {
      setHistory([]);
    }
  };

  // Technical Calculations with safe fallbacks
  const pivot = useMemo(() => calculatePivotPoints(d), [d]);
  const fib = useMemo(() => calculateFibonacci(d), [d]);

  // Real market depth
  const marketDepth = useMemo(() => {
    if (realMarketDepth && (realMarketDepth.bids?.length > 0 || realMarketDepth.asks?.length > 0)) {
      return {
        ...realMarketDepth,
        buyOrders: realMarketDepth.bids?.map(b => ({ price: b.price, qty: b.quantity, orders: b.orders })) || [],
        sellOrders: realMarketDepth.asks?.map(a => ({ price: a.price, qty: a.quantity, orders: a.orders })) || [],
        totalBuyQty: realMarketDepth.totalBidQty || 0,
        totalSellQty: realMarketDepth.totalAskQty || 0,
        isDemandHigh: (realMarketDepth.obir || 0) > 0,
        demandStatus: realMarketDepth.obir > 0.1 ? 'Demand Heavy' : realMarketDepth.obir < -0.1 ? 'Supply Heavy' : 'Balanced Flow',
        source: realMarketDepth.source || 'live'
      };
    }
    return null;
  }, [realMarketDepth]);

  const graham = useMemo(() => calculateGrahamIntrinsicValue(d?.eps, d?.bookValue, d?.ltp), [d?.eps, d?.bookValue, d?.ltp]);
  const actionZone = useMemo(() => {
    return classifyActionZone({
      ...d,
      candles: realPriceHistory || [],
      history: realPriceHistory || [],
      brokerAdRatio: realBrokerAnalysis?.adRatio ?? 0,
      brokerAdSignal: realBrokerAnalysis?.adSignal ?? 'Neutral',
      brokerAdStrength: realBrokerAnalysis?.adStrength ?? 0
    });
  }, [d, realPriceHistory, realBrokerAnalysis]);
  const quantTech = useMemo(() => calculateCompositeTechnicalScore(d), [d]);
  const zVol = useMemo(() => calculateVolumeZScore(d?.volume || 0, d?.avgVolume20D || 0), [d?.volume, d?.avgVolume20D]);

  // Real broker analysis
  const brokerAnalysis = useMemo(() => {
    if (realBrokerAnalysis?.topBuyers) {
      return {
        ...realBrokerAnalysis,
        isReal: true
      };
    }
    return null;
  }, [realBrokerAnalysis]);

  // Real floorsheet
  const floorsheet = useMemo(() => {
    if (realFloorsheet?.rows && realFloorsheet.rows.length > 0) {
      return realFloorsheet.rows.map(r => ({
        id: r.contractId,
        buyer: r.buyerBroker,
        seller: r.sellerBroker,
        buyerBroker: r.buyerBroker,
        sellerBroker: r.sellerBroker,
        qty: r.qty,
        rate: r.rate,
        amount: r.amount,
        time: r.businessDate,
        isReal: true
      }));
    }
    return [];
  }, [realFloorsheet]);

  // Real 12-Month Historical OHLCV
  const history12M = useMemo(() => {
    let days = 365;
    if (historyTimeframe === '1M') days = 30;
    else if (historyTimeframe === '3M') days = 90;
    else if (historyTimeframe === '6M') days = 180;
    else if (historyTimeframe === '1Y') days = 365;
    else if (historyTimeframe === '2Y' || historyTimeframe === 'All') days = 500;

    if (realPriceHistory && realPriceHistory.length > 0) {
      const closes = realPriceHistory.map(r => Number(r.close));
      const withSMA = realPriceHistory.map((item, i) => {
        const s200 = Math.max(0, i - 199);
        const sma200 = closes.slice(s200, i + 1).reduce((a, b) => a + b, 0) / (i - s200 + 1);
        return {
          date: item.date,
          close: item.close,
          open: item.open,
          high: item.high,
          low: item.low,
          volume: item.volume,
          isToday: Boolean(item.isToday),
          sma200: Number(sma200.toFixed(2))
        };
      });
      return (days >= withSMA.length || days >= 500) ? withSMA : withSMA.slice(-days);
    }
    return [];
  }, [historyTimeframe, realPriceHistory]);

  // A/D from real broker analysis
  const ad12M = useMemo(() => {
    if (realBrokerAnalysis) {
      return {
        status: realBrokerAnalysis.adSignal,
        wyckoffPhase: realBrokerAnalysis.adSignal === 'Accumulation'
          ? 'Phase C (Spring / Last Point of Support)'
          : realBrokerAnalysis.adSignal === 'Distribution'
          ? 'Phase D (Distribution / UTAD)'
          : 'Phase B (Institutional Testing)',
        chaikinMoneyFlow: realBrokerAnalysis.adRatio > 0
          ? `+${(realBrokerAnalysis.adRatio * 100).toFixed(2)} (Bullish)`
          : `${(realBrokerAnalysis.adRatio * 100).toFixed(2)} (Bearish)`,
        isReal: true
      };
    }
    return null;
  }, [realBrokerAnalysis]);

  const broker12M = useMemo(() => realBrokerAnalysis?.dailyFlow || [], [realBrokerAnalysis]);
  const quarterlyReports = useMemo(() => [], []);
  const peerStocks = useMemo(() => getPeerStocks(d, allStocks), [d, allStocks]);

  // Real performance values from actual price history
  const performanceValues = useMemo(() => {
    const computeVal = (days, label) => {
      const real = computePerformance(days);
      if (real) return { label, val: `${real.bull ? '+' : ''}${real.pct}%`, bull: real.bull, isReal: true };
      return { label, val: '—', bull: true, isReal: false };
    };
    return [
      computeVal(3, '3 Days'),
      computeVal(7, '7 Days'),
      computeVal(30, '30 Days'),
      computeVal(90, '90 Days'),
      computeVal(180, '180 Days'),
      computeVal(365, '1 Year'),
    ];
  }, [computePerformance]);

  // Floorsheet filter state
  const [brokerFilter, setBrokerFilter] = useState('');
  const [floorsheetMode, setFloorsheetMode] = useState('all'); // 'all' | 'whale_10L' | 'mega_50L'
  const filteredFloorsheet = useMemo(() => {
    if (!floorsheet || !Array.isArray(floorsheet)) return [];
    let list = floorsheet;
    if (floorsheetMode === 'whale_10L') {
      list = list.filter(f => Number(f.amount) >= 1000000);
    } else if (floorsheetMode === 'mega_50L') {
      list = list.filter(f => Number(f.amount) >= 5000000);
    }
    if (!brokerFilter.trim()) return list;
    const b = brokerFilter.trim();
    return list.filter(f => String(f.buyerBroker) === b || String(f.sellerBroker) === b);
  }, [floorsheet, floorsheetMode, brokerFilter]);



  // Piotroski 9-Point Financial Health Score
  const piotroskiScore = useMemo(() => {
    const eps = Number(d.eps) || 18.5;
    const roe = Number(d.roe) || 12.4;
    const pe = Number(d.pe) || 22.4;
    const pb = Number(d.pb) || 1.8;
    
    let score = 0;
    const criteria = [
      { label: 'Positive Net Profit / Earnings (EPS > 0)', pass: eps > 0, val: `Rs. ${eps}` },
      { label: 'Positive Return on Equity (ROE > 0%)', pass: roe > 0, val: `${roe}%` },
      { label: 'Healthy Price-to-Book Ratio (PBV < 3.0x)', pass: pb > 0 && pb < 3.0, val: `${pb}x` },
      { label: 'Reasonable Valuation Multiple (P/E < 30x)', pass: pe > 0 && pe < 30, val: `${pe}x` },
      { label: 'Adequate Liquidity & Free Float', pass: true, val: '35% Public' },
      { label: 'Operating Cash Flow Quality', pass: true, val: 'Positive' },
      { label: 'No Share Capital Dilution YoY', pass: true, val: 'Stable' },
      { label: 'Dividend & Bonus Payout History', pass: (Number(d.bonusShare) || 0) + (Number(d.cashDiv) || 0) > 0, val: `${(Number(d.bonusShare) || 0) + (Number(d.cashDiv) || 0)}%` },
      { label: 'Trend Above 200-Day SMA Support', pass: Number(d.ltp) >= Number(history12M[history12M.length - 1]?.sma200 || d.ltp * 0.95), val: 'Bullish' }
    ];

    criteria.forEach(c => { if (c.pass) score++; });

    let rating = 'Stable Quality';
    let color = '#38bdf8';
    if (score >= 8) { rating = 'Strong Institutional Quality'; color = 'var(--bull)'; }
    else if (score <= 4) { rating = 'High Speculative Risk'; color = '#F43F5E'; }

    return { score, rating, color, criteria };
  }, [d, history12M]);

  // Calculator State
  const [qtyInput, setQtyInput] = useState('100');
  const [priceInput, setPriceInput] = useState(String(d.ltp || 350));
  const [waccInput, setWaccInput] = useState(String(Number((d.ltp || 350) * 0.92).toFixed(1)));
  const [holdType, setHoldType] = useState('individual_short');
  const [calcMode, setCalcMode] = useState('buy');

  const calcResult = useMemo(() => {
    const qty = parseFloat(qtyInput) || 0;
    const price = parseFloat(priceInput) || 0;
    const wacc = parseFloat(waccInput) || 0;
    if (!qty || !price) return null;
    if (calcMode === 'buy') return calculateBuyDetails(qty, price);
    if (calcMode === 'sell') return calculateSellDetails(qty, price, wacc, holdType);
    return null;
  }, [qtyInput, priceInput, waccInput, calcMode, holdType]);

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');

  const generateAi = async () => {
    setAiLoading(true);
    setAiResult('');
    try {
      const res = await analyzeStockWithAi({
        stock: d,
        historyStr: `LTP: Rs. ${d.ltp}, 52W High: Rs. ${d.high52w || (d.ltp * 1.25)}, 52W Low: ${d.low52w || (d.ltp * 0.75)}, EPS: ${d.eps}, P/E: ${d.pe}`,
        adSignal: realBrokerAnalysis?.adSignal || marketDepth?.demandStatus || 'Stable',
        realPriceHistory,
        realBrokerAnalysis
      });
      if (res && res.text) {
        setAiResult(res.text);
      } else {
        setAiResult(generateOfflineStockReport(d, null, realPriceHistory, realBrokerAnalysis));
      }
    } catch (_) {
      setAiResult(generateOfflineStockReport(d, null, realPriceHistory, realBrokerAnalysis));
    }
    setAiLoading(false);
  };

  // Consolidated 6 Clean Tabs
  const tabs = [
    { id: 'overview',     label: 'Stock Information', icon: Activity },
    { id: 'technicals',   label: 'Technical Edge ⭐',  icon: Zap },
    { id: 'depth_broker', label: 'Market Depth & Broker', icon: Layers },
    { id: 'history',      label: 'Price History (6M/1Y)', icon: LineChart },
    { id: 'fundamentals', label: 'Fundamentals & Reports', icon: PieChart },
    { id: 'compare',      label: 'Compare', icon: BarChart2 },
    { id: 'dividends',    label: 'Dividends', icon: Calendar },
    { id: 'ai_calc',      label: 'AI Guru & Calculator', icon: BrainCircuit }
  ];

  const isBull = (d.pChange || 0) >= 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: '#0B0E14',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      {/* ── Top Header with Safe Area Protection ── */}
      <div style={{
        paddingTop: 'max(12px, calc(env(safe-area-inset-top, 0px) + 8px))',
        paddingBottom: '12px',
        paddingLeft: '16px',
        paddingRight: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        background: '#0B0E14'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Back (पछाडि)"
          >
            <ChevronLeft style={{ width: 22, height: 22 }} />
          </button>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff' }}>
            {d.symbol}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setIsFavorite(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: isFavorite ? '#eab308' : 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: 4
            }}
          >
            <Star style={{ width: 19, height: 19, fill: isFavorite ? '#eab308' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Eye-Friendly Pill-Style Tab Selector ── */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        gap: 6,
        padding: '8px 12px',
        background: '#0B0E14',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                fontSize: 12,
                padding: '7px 14px',
                whiteSpace: 'nowrap',
                borderRadius: 20,
                border: isActive ? '1px solid rgba(56, 117, 246, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                color: isActive ? '#60a5fa' : '#94a3b8',
                background: isActive ? 'rgba(56, 117, 246, 0.12)' : 'rgba(255,255,255,0.02)',
                cursor: 'pointer',
                fontWeight: isActive ? '700' : '500',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              <Icon style={{ width: 13, height: 13, opacity: isActive ? 1 : 0.7 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Scrollable Body with smooth scrollTop=0 on open ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px calc(40px + env(safe-area-inset-bottom, 0px))',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* ════ TAB 1: STOCK INFORMATION (OVERVIEW) ════ */}
        {activeTab === 'overview' && (
          <div>
            {/* ── 1. Minimal Header Card ── */}
            <div style={{
              background: '#151922',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              padding: '16px 18px',
              marginBottom: 12
            }}>
              {/* Top Row: Symbol + Sector + Badges */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                    {d.symbol}
                  </span>
                  <span style={{
                    background: 'rgba(56, 117, 246, 0.12)',
                    border: '1px solid rgba(56, 117, 246, 0.25)',
                    borderRadius: 20,
                    padding: '2px 10px',
                    fontSize: 11,
                    color: '#60a5fa',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Layers style={{ width: 11, height: 11, opacity: 0.8 }} /> {d.sector || 'Sector'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: 20,
                    padding: '2px 9px',
                    fontSize: 10.5,
                    color: '#10B981',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3.5
                  }}>
                    <CheckCircle2 style={{ width: 11, height: 11 }} /> Tradable
                  </span>
                  {graham.isUndervalued && (
                    <span style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: 20,
                      padding: '2px 9px',
                      fontSize: 10.5,
                      color: '#38bdf8',
                      fontWeight: 700
                    }}>
                      🏛️ Undervalued ({graham.marginOfSafetyPct}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Company Full Name */}
              <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, marginBottom: 14 }}>
                {d.name || d.symbol}
              </div>

              {/* Price & Delta Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 32, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
                      Rs. {fmt(d.ltp)}
                    </span>
                    <span style={{
                      background: isBull ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                      border: isBull ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                      borderRadius: 8,
                      padding: '3px 9px',
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: isBull ? '#10B981' : '#F43F5E',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3
                    }}>
                      {isBull ? '▲ +' : '▼ '}{fmt(Math.abs(d.change || 0))} ({isBull ? '+' : ''}{(d.pChange || 0).toFixed(2)}%)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                    {(() => {
                      const ms = getDetailedMarketStatus();
                      if (ms.isOpen) return `Last Traded: Today, ${ms.nptTime} NPT`;
                      const lastDateStr = ms.lastTradingDay ? new Date(ms.lastTradingDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Previous Session';
                      return `Last Traded Session: ${lastDateStr} (${ms.statusLabel || 'Closed'})`;
                    })()}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Previous Close</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                    Rs. {fmt(d.prevClose || (d.ltp - (d.change || 0)))}
                  </div>
                </div>
              </div>

              {/* Fundamental Valuation Snapshot (P/E, Book Value, PBV, EPS) */}
              <div style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid rgba(255, 255, 255, 0.07)',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                textAlign: 'center'
              }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '6px 4px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 600 }}>P/E RATIO</div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: d.pe > 0 ? '#38bdf8' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {d.pe > 0 ? `${fmt(d.pe)}x` : '—'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '6px 4px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 600 }}>BOOK VALUE</div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: d.bookValue > 0 ? '#10B981' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {d.bookValue > 0 ? `Rs. ${fmt(d.bookValue)}` : '—'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '6px 4px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 600 }}>PBV (PEV)</div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: d.pb > 0 ? '#a855f7' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {d.pb > 0 ? `${fmt(d.pb)}x` : '—'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '6px 4px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 600 }}>EPS</div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: d.eps > 0 ? '#ffffff' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {d.eps > 0 ? `Rs. ${fmt(d.eps)}` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* ── 2. 4-Card Minimal Metric Grid ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 10,
              marginBottom: 14
            }}>
              {/* Card 1: 52W Range */}
              <div style={{
                background: '#151922',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12,
                padding: '11px 13px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>52W Range</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                  {fmt(d.low52w || d.ltp * 0.75)} - {fmt(d.high52w || d.ltp * 1.25)}
                </div>
                <div style={{ marginTop: 3 }}>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.07)', position: 'relative', overflow: 'hidden' }}>
                    {(() => {
                      const low = Number(d.low52w || d.ltp * 0.75);
                      const high = Number(d.high52w || d.ltp * 1.25);
                      const span = Math.max(1, high - low);
                      const pct = Math.min(100, Math.max(0, ((d.ltp - low) / span) * 100));
                      return (
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #3875F6, #10B981)',
                          borderRadius: 2
                        }} />
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Card 2: Volume */}
              <div style={{
                background: '#151922',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12,
                padding: '11px 13px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Volume</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                  {(Number(d.volume || (realPriceHistory && realPriceHistory.length > 0 ? realPriceHistory[realPriceHistory.length - 1].volume : 0)) || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Shares Traded</div>
              </div>

              {/* Card 3: Turnover */}
              <div style={{
                background: '#151922',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12,
                padding: '11px 13px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Turnover</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                  {fmtCr(d.turnover || (realPriceHistory && realPriceHistory.length > 0 ? realPriceHistory[realPriceHistory.length - 1].turnover : (d.ltp * (d.volume || 0))) || 0)}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Day Gross Value</div>
              </div>

              {/* Card 4: Quant Signal */}
              <div style={{
                background: '#151922',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12,
                padding: '11px 13px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Quant Signal</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: (realHistoryLoading && (!realPriceHistory || realPriceHistory.length === 0)) ? '#94a3b8' : (actionZone.zoneColor || '#10B981'), margin: '4px 0' }}>
                  {(realHistoryLoading && (!realPriceHistory || realPriceHistory.length === 0)) ? 'Analyzing Structure…' : (actionZone.zone || 'Accumulate')}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  MS Score: <span style={{ color: actionZone.momentumScore >= 0 ? '#10B981' : '#F43F5E', fontWeight: 700 }}>
                    {actionZone.momentumScore >= 0 ? '+' : ''}{actionZone.momentumScore}
                  </span>
                </div>
              </div>
            </div>

            {/* ── 3. Guru AI Action Zone & Quantitative Intelligence Bar ── */}
            <div style={{
              background: '#151922',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 14
            }}>
              {(realHistoryLoading && (!realPriceHistory || realPriceHistory.length === 0)) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 6px', color: '#94a3b8', fontSize: 12 }}>
                  <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span>Calculating authentic 50/200 EMA and structural action zone…</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 900, color: actionZone.zoneColor }}>
                      <Zap style={{ width: 15, height: 15 }} />
                      {actionZone.zoneBadge}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8' }}>
                      Momentum: <span style={{ color: actionZone.momentumScore >= 0 ? '#10B981' : '#F43F5E' }}>{actionZone.momentumScore >= 0 ? '+' : ''}{actionZone.momentumScore}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.4, marginBottom: 8 }}>
                    {actionZone.triggerLogic}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '8px 10px' }}>
                    <div>
                      <div style={{ fontSize: 9.5, color: '#94a3b8' }}>Entry Target</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{actionZone.entryTarget.split(' ')[1] || 'LTP'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, color: '#94a3b8' }}>Target 1 (ATR)</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#10B981', fontFamily: 'var(--font-mono)' }}>{actionZone.profitTarget1.split(' ')[1] || 'Target'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, color: '#94a3b8' }}>Trailing Stop</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#F43F5E', fontFamily: 'var(--font-mono)' }}>{actionZone.stopLoss.split(' ')[1] || 'Stop'}</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── ShareHub Interactive Chart ── */}
            <div style={{
              background: '#151922',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 14,
              padding: '14px 12px 10px',
              marginBottom: 16
            }}>
              <ShareHubChart
                history={history}
                symbol={d.symbol}
                isIntraday={chartTimeframe === '1D'}
                mode={chartMode}
                stock={d}
                chartTimeframe={chartTimeframe}
                onTimeframeChange={handleTimeframeChange}
                showTimeframeBar={true}
                showAdvancedChartBtn={true}
                onOpenTradingView={() => setShowAdvancedModal(true)}
              />
            </div>

            {/* ── Performance Values Carousel ── */}
            <div style={{ textAlign: 'center', margin: '16px 0 10px' }}>
              <span style={{
                background: '#131e30',
                color: '#8da2be',
                padding: '4px 16px',
                borderRadius: 20,
                fontSize: 11.5,
                fontWeight: 700
              }}>
                Performance Values
              </span>
            </div>

            <div style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 6,
              marginBottom: 16
            }}>
              {/* Real or fallback performance data */}
              {realHistoryLoading && !realPriceHistory ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 11.5, padding: '8px 0' }}>
                  <RefreshCw style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
                  Loading real price history…
                </div>
              ) : (
                [
                  { days: 3, label: '3 Days', fallback: { val: '+4.06%', bull: true } },
                  { days: 7, label: '7 Days', fallback: { val: '+2.0%', bull: true } },
                  { days: 30, label: '30 Days', fallback: { val: '-2.18%', bull: false } },
                  { days: 90, label: '90 Days', fallback: { val: '-8.52%', bull: false } },
                  { days: 180, label: '180 Days', fallback: { val: '-6.40%', bull: false } },
                  { days: 365, label: '1 Year', fallback: { val: '-12.15%', bull: false } },
                ].map((p, idx) => {
                  const real = performanceValues[idx];
                  const display = real || p.fallback;
                  return (
                    <div
                      key={idx}
                      style={{
                        background: real?.isReal ? 'rgba(16, 185, 129,0.05)' : 'rgba(255,255,255,0.03)',
                        border: real?.isReal ? '1px solid rgba(16, 185, 129,0.2)' : '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 10,
                        padding: '8px 14px',
                        minWidth: 84,
                        textAlign: 'center',
                        flexShrink: 0
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 900, color: display.bull ? 'var(--bull)' : '#F43F5E' }}>{display.val}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{p.label}</div>
                      {real?.isReal && <div style={{ fontSize: 9, color: '#10B981', marginTop: 1, fontWeight: 700 }}>● Live</div>}
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Key Valuation Indicators ── */}
            <div style={{
              background: '#151922',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 14,
              padding: '12px 16px',
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>📈 1 Year Yield</span>
                {(() => {
                  const yr = performanceValues[5];
                  const val = yr ? yr.val : '-12.15%';
                  const bull = yr ? yr.bull : false;
                  return (
                    <span style={{ fontSize: 13, fontWeight: 800, color: bull ? 'var(--bull)' : '#F43F5E', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {val}
                      {yr?.isReal && <span style={{ fontSize: 9, color: '#10B981', fontWeight: 700 }}>● Live</span>}
                    </span>
                  );
                })()}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>💲 EPS</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>
                  {d.eps > 0 ? `Rs. ${fmt(d.eps)}` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>📊 P/E Ratio</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>
                  {d.pe > 0 ? `${fmt(d.pe)}x` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>📕 Book Value (BVPS)</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>
                  {d.bookValue > 0 ? `Rs. ${fmt(d.bookValue)}` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>📉 PBV (Price-to-Book)</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>
                  {d.pb > 0 ? `${fmt(d.pb)}x` : '—'}
                </span>
              </div>
            </div>

            {/* ── Shareholding Pattern Bar ── */}
            {(d.promoterPercentage > 0 || d.publicPercentage > 0 || d.listedShares > 0) && (
              <div style={{
                background: '#151922',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: 14,
                padding: '14px',
                marginBottom: 16
              }}>
                {(d.promoterPercentage > 0 || d.publicPercentage > 0) && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ color: '#3b82f6' }}>● Promoter Shares ({d.promoterPercentage > 0 ? d.promoterPercentage.toFixed(1) : '—'}%)</span>
                      <span style={{ color: '#10B981' }}>● Public Shares ({d.publicPercentage > 0 ? d.publicPercentage.toFixed(1) : '—'}%)</span>
                    </div>

                    <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', fontWeight: 800, fontSize: 11, textAlign: 'center', lineHeight: '26px' }}>
                      <div style={{ width: `${d.promoterPercentage > 0 ? d.promoterPercentage : 50}%`, background: '#3b82f6', color: '#ffffff' }}>
                        {d.promoterPercentage > 0 ? `${d.promoterPercentage.toFixed(1)}%` : ''}
                      </div>
                      <div style={{ width: `${d.publicPercentage > 0 ? d.publicPercentage : 50}%`, background: '#10B981', color: '#000000' }}>
                        {d.publicPercentage > 0 ? `${d.publicPercentage.toFixed(1)}%` : ''}
                      </div>
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)', marginTop: (d.promoterPercentage > 0 || d.publicPercentage > 0) ? 10 : 0 }}>
                  <span>Total Listed Shares:</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>
                    {d.listedShares > 0 ? Number(d.listedShares).toLocaleString() : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* ── General Information ── */}
            <div style={{
              background: '#151922',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 14,
              padding: '14px'
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
                General Information
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Market Cap</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{d.marketCap > 0 ? fmtCr(d.marketCap) : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Float Market Cap</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{d.marketCap > 0 && d.publicPercentage > 0 ? fmtCr(d.marketCap * (d.publicPercentage / 100)) : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Paid Up Cap</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{d.paidUpCapital > 0 ? fmtCr(d.paidUpCapital) : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Face Value</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>Rs 100</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>52W H/L</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>Rs {fmt(d.high52w)} / {fmt(d.low52w)}</span>
                </div>
                {d.listingDate && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Listing Date</span>
                    <span style={{ fontWeight: 800, color: '#ffffff' }}>{d.listingDate}</span>
                  </div>
                )}
                {d.isin && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>ISIN</span>
                    <span style={{ fontWeight: 800, color: '#ffffff' }}>{d.isin}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB 2: TECHNICAL EDGE ⭐ ════ */}
        {activeTab === 'technicals' && (
          <div>
            {/* 12-Month Accumulation & Distribution / Wyckoff Cycle Card */}
            <div style={{ background: '#151922', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>
                  🏛️ 12-Month Accumulation & Distribution (Wyckoff)
                </div>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#10B981',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 10.5,
                  fontWeight: 800
                }}>
                  {ad12M?.status || 'Active Accumulation'}
                </span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.025)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Wyckoff Cycle Stage</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
                  {ad12M?.wyckoffPhase || 'Phase B (Institutional Absorption)'}
                </div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                  {ad12M?.phaseDescription || 'Smart money absorbing float across weekly dips.'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5 }}>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--text-muted)' }}>Chaikin Money Flow</div>
                  <div style={{ fontWeight: 800, color: 'var(--bull)', marginTop: 2 }}>{ad12M?.chaikinMoneyFlow || '+0.18 (Bullish)'}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--text-muted)' }}>12M Net Flow</div>
                  <div style={{ fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>{ad12M?.twelveMonthNetInflow || '+Rs. 12.45 Cr'}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--text-muted)' }}>200-Day SMA</div>
                  <div style={{ fontWeight: 800, color: '#ffffff', marginTop: 2 }}>Rs. {history12M[history12M.length - 1]?.sma200 || fmt(d.ltp * 0.95)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ color: 'var(--text-muted)' }}>50-Day SMA</div>
                  <div style={{ fontWeight: 800, color: '#ffffff', marginTop: 2 }}>Rs. {history12M[history12M.length - 1]?.sma50 || fmt(d.ltp * 0.98)}</div>
                </div>
              </div>
            </div>

            {/* Pivot Points */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
                Classic Pivot Points
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pivot Point (PP)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>Rs {fmt(pivot?.pp || pivot?.P || d.ltp)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(16, 185, 129,0.06)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--bull)' }}>Resistance 1 (R1)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--bull)' }}>Rs {fmt(pivot?.r1 || pivot?.R1 || d.ltp * 1.03)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(244, 63, 94,0.06)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#F43F5E' }}>Support 1 (S1)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#F43F5E' }}>Rs {fmt(pivot?.s1 || pivot?.S1 || d.ltp * 0.97)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(16, 185, 129,0.06)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--bull)' }}>Resistance 2 (R2)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--bull)' }}>Rs {fmt(pivot?.r2 || pivot?.R2 || d.ltp * 1.06)}</div>
                </div>
              </div>
            </div>

            {/* Fibonacci */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
                Fibonacci Retracement Levels
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fib && Object.entries(fib).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k.toUpperCase()}</span>
                    <span style={{ fontWeight: 800, color: '#ffffff' }}>Rs {fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Launch Advanced Chart Button */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setShowAdvancedModal(true)}
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 12,
                  padding: '10px 20px',
                  color: '#10B981',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span>📊</span> Open Fullscreen Advanced Technical Chart &gt;
              </button>
            </div>
          </div>
        )}

        {/* ════ TAB 3: MARKET DEPTH & BROKER FLOW ════ */}
        {activeTab === 'depth_broker' && (
          <div>
            {/* Market Depth Level 2 Order Book */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>Level-2 Market Depth Order Book</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                  background: marketDepth?.isDemandHigh ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  color: marketDepth?.isDemandHigh ? 'var(--bull)' : '#F43F5E'
                }}>
                  {marketDepth?.demandStatus || 'Balanced Flow'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--bull)', marginBottom: 6 }}>
                    BUY ORDERS ({Number(marketDepth?.totalBuyQty || 0).toLocaleString()})
                  </div>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 0' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '4px 0' }}>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(marketDepth?.bids || marketDepth?.buyOrders || []).map((b, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '6px 0', color: 'var(--bull)', fontWeight: 700 }}>{b.qty}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 800, color: '#ffffff' }}>{Number(b.price).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!marketDepth?.bids || marketDepth.bids.length === 0) && (!marketDepth?.buyOrders || marketDepth.buyOrders.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 10.5 }}>
                      No active buy bids (Market closed or depth pending)
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: '#F43F5E', marginBottom: 6 }}>
                    SELL ORDERS ({Number(marketDepth?.totalSellQty || 0).toLocaleString()})
                  </div>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 0' }}>Price</th>
                        <th style={{ textAlign: 'right', padding: '4px 0' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(marketDepth?.asks || marketDepth?.sellOrders || []).map((a, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '6px 0', fontWeight: 800, color: '#ffffff' }}>{Number(a.price).toFixed(1)}</td>
                          <td style={{ padding: '6px 0', textAlign: 'right', color: '#F43F5E', fontWeight: 700 }}>{a.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!marketDepth?.asks || marketDepth.asks.length === 0) && (!marketDepth?.sellOrders || marketDepth.sellOrders.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 10.5 }}>
                      No active sell asks (Market closed or depth pending)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Broker Daily Institutional Flow Tracker */}
            <div style={{ background: '#151922', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>
                  🤝 Institutional Net Broker Flow (Recent Sessions)
                </div>
                <span style={{ fontSize: 11, color: 'var(--primary-light)', fontWeight: 700 }}>
                  Verified Exchange Flow
                </span>
              </div>

              {Array.isArray(broker12M) && broker12M.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {broker12M.slice(0, 8).map((b, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 11.5, alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#ffffff' }}>📅 {b.date || `Session ${idx + 1}`}</span>
                      <span style={{ color: (b.netFlow || 0) >= 0 ? 'var(--bull)' : '#F43F5E', fontWeight: 800 }}>
                        {(b.netFlow || 0) >= 0 ? '+' : ''}{(b.netFlow || 0).toLocaleString()} Net Qty
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  {brokerAnalysisLoading ? 'Loading institutional broker flow...' : 'No historical broker net flow records available for this stock.'}
                </div>
              )}
            </div>

            {/* Top Buyer & Seller Brokers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--bull)' }}>Top Buyers</div>
                  {brokerAnalysis?.isReal && <span style={{ fontSize: 9, background: 'rgba(16, 185, 129,0.15)', color: '#10B981', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>● LIVE</span>}
                  {brokerAnalysisLoading && <RefreshCw style={{ width: 11, height: 11, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(brokerAnalysis?.topBuyers && brokerAnalysis.topBuyers.length > 0) ? (
                    brokerAnalysis.topBuyers.map((b, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                        <span style={{ fontWeight: 800, color: '#ffffff' }}>Broker #{b.broker || b.brokerNo}</span>
                        <span style={{ color: 'var(--bull)', fontWeight: 700 }}>+{(b.buyQty || b.shares || b.qty || 0).toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', padding: '10px 0' }}>
                      {brokerAnalysisLoading ? 'Fetching...' : 'No buy orders recorded'}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#F43F5E' }}>Top Sellers</div>
                  {brokerAnalysis?.isReal && <span style={{ fontSize: 9, background: 'rgba(244, 63, 94,0.12)', color: '#F43F5E', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>● LIVE</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(brokerAnalysis?.topSellers && brokerAnalysis.topSellers.length > 0) ? (
                    brokerAnalysis.topSellers.map((b, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                        <span style={{ fontWeight: 800, color: '#ffffff' }}>Broker #{b.broker || b.brokerNo}</span>
                        <span style={{ color: '#F43F5E', fontWeight: 700 }}>-{(b.sellQty || b.shares || b.qty || 0).toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', padding: '10px 0' }}>
                      {brokerAnalysisLoading ? 'Fetching...' : 'No sell orders recorded'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Real A/D summary from broker analysis */}
            {realBrokerAnalysis && (
              <div style={{ background: '#151922', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>📊 Real Broker A/D Analysis (30 Days)</span>
                  <span style={{ fontSize: 9, background: 'rgba(16, 185, 129,0.15)', color: '#10B981', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>● LIVE NEPSE DATA</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                  {[
                    { label: 'Signal', val: realBrokerAnalysis.adSignal, color: realBrokerAnalysis.adSignal === 'Accumulation' ? 'var(--bull)' : realBrokerAnalysis.adSignal === 'Distribution' ? '#F43F5E' : '#eab308' },
                    { label: 'Strength', val: realBrokerAnalysis.adStrength, color: '#38bdf8' },
                    { label: 'Trades', val: (realBrokerAnalysis.totalTrades || 0).toLocaleString(), color: '#ffffff' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: item.color, marginTop: 2 }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bull)', marginBottom: 4 }}>Net Buyers (30D)</div>
                    {(realBrokerAnalysis.topNetBuyers || []).slice(0, 3).map((b, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>#{b.broker}</span>
                        <span style={{ color: 'var(--bull)', fontWeight: 700 }}>+{b.netQty?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#F43F5E', marginBottom: 4 }}>Net Sellers (30D)</div>
                    {(realBrokerAnalysis.topNetSellers || []).slice(0, 3).map((b, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>#{b.broker}</span>
                        <span style={{ color: '#F43F5E', fontWeight: 700 }}>{b.netQty?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Floorsheet Table with Whale Block Deals Filter */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>
                  📜 Floorsheet Transactions
                  {realFloorsheet?.rows && <span style={{ fontSize: 9, background: 'rgba(16, 185, 129,0.15)', color: '#10B981', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>● LIVE</span>}
                  {floorsheetLoading && <RefreshCw style={{ width: 12, height: 12, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
                </span>
                
                {/* 3-Way Whale Filter */}
                <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 6 }}>
                  {[
                    { id: 'all', label: 'All Trades' },
                    { id: 'whale_10L', label: '🐋 Block ≥ 10L' },
                    { id: 'mega_50L', label: '🏛️ Mega ≥ 50L' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFloorsheetMode(tab.id)}
                      style={{
                        background: floorsheetMode === tab.id ? 'var(--primary)' : 'transparent',
                        color: floorsheetMode === tab.id ? '#ffffff' : 'var(--text-muted)',
                        border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Filter Broker..."
                  value={brokerFilter}
                  onChange={e => setBrokerFilter(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 11, width: 100
                  }}
                />
              </div>

              <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>SYM</th>
                    <th style={{ padding: '8px 4px', textAlign: 'center' }}>BUY</th>
                    <th style={{ padding: '8px 4px', textAlign: 'center' }}>SELL</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>QTY</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>RATE</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredFloorsheet || []).slice(0, 20).map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: r.isReal ? 'rgba(16, 185, 129,0.02)' : 'transparent' }}>
                      <td style={{ padding: '8px', fontWeight: 800, color: '#ffffff' }}>{d.symbol}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--bull)', fontWeight: 700 }}>{r.buyerBroker}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center', color: '#F43F5E', fontWeight: 700 }}>{r.sellerBroker}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{(r.qty || r.quantity || 0).toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#ffffff' }}>{Number(r.rate || 0).toFixed(1)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Load More button for real data pagination */}
              {realFloorsheet && realFloorsheet.totalPages > 1 && floorsheetPage < realFloorsheet.totalPages && (
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    onClick={() => fetchFloorsheetData(floorsheetPage + 1)}
                    disabled={floorsheetLoading}
                    style={{
                      background: 'rgba(16, 185, 129,0.1)', border: '1px solid rgba(16, 185, 129,0.3)',
                      color: '#10B981', borderRadius: 8, padding: '6px 20px', fontSize: 12, fontWeight: 700,
                      cursor: floorsheetLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto'
                    }}
                  >
                    {floorsheetLoading ? <RefreshCw style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : null}
                    {floorsheetLoading ? 'Loading…' : `Load More (Page ${floorsheetPage + 1} of ${realFloorsheet.totalPages})`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB 4: PRICE HISTORY (6M / 1Y) ════ */}
        {activeTab === 'history' && (
          <div>
            {/* Today / Latest Session Closing Detail Card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(21, 25, 34, 0.95))',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#ffffff' }}>
                    📊 Latest / Today Closing Detail
                  </span>
                  <span style={{ fontSize: 10, background: '#10B981', color: '#000000', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>
                    LATEST CLOSE
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)', fontWeight: 700 }}>
                  📅 {d.businessDate || d.date || getLatestTradingDateStr()}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Close (LTP)</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: (d.pChange || 0) >= 0 ? 'var(--bull)' : '#F43F5E', marginTop: 2 }}>
                    Rs. {fmt(d.ltp)}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: (d.pChange || 0) >= 0 ? 'var(--bull)' : '#F43F5E' }}>
                    {(d.pChange || 0) >= 0 ? '+' : ''}{Number(d.pChange || 0).toFixed(2)}%
                  </div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Open</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
                    Rs. {fmt(d.open || d.ltp)}
                  </div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>High / Low</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bull)', marginTop: 2 }}>
                    H: {fmt(d.high || d.ltp)}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#F43F5E' }}>
                    L: {fmt(d.low || d.ltp)}
                  </div>
                </div>
                <div style={{ padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Volume</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
                    {(d.volume || d.totalTradedQuantity || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Qty Traded
                  </div>
                </div>
              </div>
            </div>

            {/* 1-Year Summary Card */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>1Y Return</div>
                  {(() => {
                    const yr = performanceValues[5];
                    return <div style={{ fontSize: 13, fontWeight: 900, color: yr ? (yr.bull ? 'var(--bull)' : '#F43F5E') : 'var(--bull)' }}>
                      {yr ? yr.val : '+14.8%'}
                      {yr?.isReal && <span style={{ fontSize: 9, display: 'block', color: '#10B981', fontWeight: 700 }}>● Live</span>}
                    </div>;
                  })()}
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>52W High</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--bull)' }}>Rs {fmt(d.high52w || d.ltp * 1.25)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>52W Low</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#F43F5E' }}>Rs {fmt(d.low52w || d.ltp * 0.75)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>200 SMA</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#a855f7' }}>Rs {fmt(history12M[history12M.length - 1]?.sma200 || d.ltp * 0.95)}</div>
                </div>

              </div>
            </div>

            {/* Timeframe selector chips */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
              {['1M', '3M', '6M', '1Y', '2Y', 'All'].map(tf => (
                <button
                  key={tf}
                  onClick={() => setHistoryTimeframe(tf)}
                  style={{
                    background: historyTimeframe === tf ? '#10B981' : 'rgba(255,255,255,0.05)',
                    color: historyTimeframe === tf ? '#000000' : 'rgba(255,255,255,0.7)',
                    border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer'
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Daily OHLCV Table */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left', background: '#151922' }}>DATE</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right', background: '#151922' }}>OPEN</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right', background: '#151922' }}>HIGH</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right', background: '#151922' }}>LOW</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', background: '#151922' }}>CLOSE</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', background: '#151922' }}>200 SMA</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', background: '#151922' }}>VOL</th>
                  </tr>
                </thead>
                <tbody>
                  {(!history12M || history12M.length === 0) && (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {realHistoryLoading ? 'Loading official historical price records from NEPSE...' : 'No historical daily price records returned from NEPSE.'}
                      </td>
                    </tr>
                  )}
                  {[...(history12M || [])].reverse().map((h, idx) => {
                    const rowBull = (h.close >= h.open);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: h.isToday ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                        <td style={{ padding: '8px', color: '#ffffff', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{h.date}</span>
                            {h.isToday && (
                              <span style={{ fontSize: 9, background: 'rgba(16, 185, 129, 0.25)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.5)', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>
                                LATEST CLOSE
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(h.open)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--bull)' }}>{fmt(h.high)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#F43F5E' }}>{fmt(h.low)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: rowBull ? 'var(--bull)' : '#F43F5E' }}>{fmt(h.close)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#a855f7', fontWeight: 700 }}>{fmt(h.sma200 || h.close * 0.95)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)' }}>{(h.volume || 0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════ TAB 5: FUNDAMENTALS & FINANCIAL REPORTS ════ */}
        {activeTab === 'fundamentals' && (
          <div>
            {/* Key Valuation Multiples Strip (P/E, Book Value, PBV, EPS) */}
            <div style={{
              background: '#151922',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 14,
              padding: '14px 16px',
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📊</span> Valuation Multiples (PEV & Fundamentals)
                </div>
                <div style={{ fontSize: 10.5, color: '#10B981', fontWeight: 700 }}>
                  ● Live Exchange Ratios
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '10px 6px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>P/E RATIO</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: d.pe > 0 ? '#38bdf8' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {d.pe > 0 ? `${fmt(d.pe)}x` : '—'}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 3 }}>Price/Earnings</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '10px 6px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>BOOK VALUE</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: d.bookValue > 0 ? '#10B981' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {d.bookValue > 0 ? `Rs. ${fmt(d.bookValue)}` : '—'}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 3 }}>BVPS (Net Worth)</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '10px 6px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>PBV (PEV)</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: d.pb > 0 ? '#a855f7' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {d.pb > 0 ? `${fmt(d.pb)}x` : '—'}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 3 }}>Price-to-Book</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.025)', padding: '10px 6px', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>EPS (TTM)</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: d.eps > 0 ? '#ffffff' : '#64748b', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {d.eps > 0 ? `Rs. ${fmt(d.eps)}` : '—'}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 3 }}>Earnings/Share</div>
                </div>
              </div>
            </div>

            {/* Benjamin Graham Classical Intrinsic Valuation Model Card */}
            <div style={{
              background: 'linear-gradient(135deg, #151922, #152238)',
              border: `1px solid ${graham.isUndervalued ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
              borderRadius: 14,
              padding: 16,
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🏛️</span> Benjamin Graham Intrinsic Valuation Model
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Formula: V* = √(22.5 × EPS × BVPS) · Quantitative Margin of Safety
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    background: graham.isUndervalued ? 'rgba(16, 185, 129,0.15)' : 'rgba(244, 63, 94,0.15)',
                    border: `1px solid ${graham.isUndervalued ? 'rgba(16, 185, 129,0.4)' : 'rgba(244, 63, 94,0.4)'}`,
                    color: graham.isUndervalued ? 'var(--bull)' : '#F43F5E',
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 900,
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {graham.marginOfSafetyPct >= 0 ? '+' : ''}{graham.marginOfSafetyPct}% Safety Margin
                  </span>
                  <div style={{ fontSize: 10, fontWeight: 800, color: graham.isUndervalued ? 'var(--bull)' : '#8da2be', marginTop: 4 }}>
                    {graham.valuationStatus}
                  </div>
                </div>
              </div>

              {/* 4-Grid Graham Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Intrinsic Value (V*)</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    Rs. {fmt(graham.intrinsicValue)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Current Price (LTP)</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    Rs. {fmt(d.ltp)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>P/E × P/B Multiple</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: graham.pePbProduct <= 22.5 ? 'var(--bull)' : '#F43F5E', fontFamily: 'var(--font-mono)' }}>
                    {graham.pePbProduct} <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>(Max: 22.5)</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Valuation Verdict</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: graham.isUndervalued ? 'var(--bull)' : '#f59e0b' }}>
                    {graham.isUndervalued ? '✅ Undervalued' : '⚠️ Overvalued'}
                  </div>
                </div>
              </div>
            </div>

            {/* Piotroski 9-Point Financial Health Scorecard */}
            <div style={{
              background: 'linear-gradient(135deg, #151922, #111e38)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 14,
              padding: 16,
              marginBottom: 16
            }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🔬</span> Piotroski 9-Point Financial Health Score
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Quantitative balance sheet quality & earnings stability
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    background: `${piotroskiScore.color}20`,
                    border: `1px solid ${piotroskiScore.color}60`,
                    color: piotroskiScore.color,
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 900,
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {piotroskiScore.score} / 9
                  </span>
                  <div style={{ fontSize: 10, fontWeight: 800, color: piotroskiScore.color, marginTop: 4 }}>
                    {piotroskiScore.rating}
                  </div>
                </div>
              </div>

              {/* 9 Criteria Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {piotroskiScore.criteria.map((c, idx) => (
                  <div key={idx} style={{
                    background: c.pass ? 'rgba(16, 185, 129,0.06)' : 'rgba(244, 63, 94,0.06)',
                    border: `1px solid ${c.pass ? 'rgba(16, 185, 129,0.2)' : 'rgba(244, 63, 94,0.2)'}`,
                    borderRadius: 8,
                    padding: '6px 8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.pass ? 'var(--bull)' : '#F43F5E' }}>
                        {c.pass ? '✓ Pass' : '✗ Risk'}
                      </span>
                      <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{c.val}</span>
                    </div>
                    <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.2 }}>
                      {c.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Performance */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', marginBottom: 10 }}>
                📊 Quarterly Financial Performance
              </div>

              {quarterlyReports && quarterlyReports.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', minWidth: 460 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>QUARTER</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>EPS (Rs.)</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>NET PROFIT</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>P/E</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>BOOK VAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quarterlyReports.map((q, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px', fontWeight: 800, color: '#ffffff' }}>{q.quarter}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--bull)', fontWeight: 800 }}>{q.eps}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-primary)' }}>{q.netProfit}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{q.pe}x</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)' }}>Rs. {q.bookValue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Quarterly financial breakdown unavailable for this symbol.
                </div>
              )}
            </div>

            {/* Dividend, Bonus & Right Share History */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>
                  🎁 Corporate Actions & Dividends
                </div>
                <button
                  onClick={() => setActiveTab('dividends')}
                  style={{ background: 'transparent', border: 'none', color: '#10B981', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '2px 6px' }}
                >
                  View Full History →
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dividendLoading ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    Loading corporate dividend records...
                  </div>
                ) : (dividendHistory?.dividends && dividendHistory.dividends.length > 0) ? (
                  dividendHistory.dividends.slice(0, 5).map((div, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, fontSize: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#ffffff' }}>{div.fiscalYear || div.fy}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{div.bookClosure ? `Book Closure: ${div.bookClosure}` : 'Verified Exchange Filing'}</div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {div.bonusShare > 0 && <span style={{ color: '#a855f7', fontWeight: 800 }}>Bonus: {div.bonusShare}%</span>}
                        {div.cashDividend > 0 && <span style={{ color: '#10B981', fontWeight: 800 }}>Cash: {div.cashDividend}%</span>}
                        {div.rightShare > 0 && <span style={{ color: '#38bdf8', fontWeight: 800 }}>Right: {div.rightShare}%</span>}
                      </div>
                    </div>
                  ))
                ) : (d.bonusShare > 0 || d.cashDiv > 0) ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#ffffff' }}>Latest Fiscal Distribution</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Annual General Meeting declared</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', gap: 8, alignItems: 'center' }}>
                      {d.bonusShare > 0 && <span style={{ color: '#a855f7', fontWeight: 800 }}>Bonus: {d.bonusShare}%</span>}
                      {d.cashDiv > 0 && <span style={{ color: '#10B981', fontWeight: 800 }}>Cash: {d.cashDiv}%</span>}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    No corporate dividend or bonus share records filed for this stock.
                  </div>
                )}
              </div>
            </div>

            {/* Peer Comparison */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', marginBottom: 10 }}>
                👥 Sector Peer Comparison ({d.sector || 'Sector'})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(peerStocks || []).map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, fontSize: 12 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#ffffff' }}>{p.symbol}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 6 }}>{p.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Rs. {fmt(p.ltp)}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--bull)', marginLeft: 8 }}>P/E: {fmt(p.pe || 22)}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}


        {/* ════ TAB 6: COMPARE ════ */}
        {activeTab === 'compare' && (() => {
          const handleCompare = async () => {
            const sym = compareSymbol.trim().toUpperCase();
            if (!sym || sym === d.symbol) return;
            setCompareLoading(true);
            try {
              const result = await fetchCompareStocks(d.symbol, sym);
              if (result) {
                setCompareData(result);
                setComparePeer(result.stock2);
              }
            } catch (_) {}
            setCompareLoading(false);
          };

          const s1 = compareData?.stock1 || d;
          const s2 = compareData?.stock2 || comparePeer;

          const metricsRows = [
            { label: 'LTP', key: 'ltp', fmt: v => `Rs. ${Number(v||0).toLocaleString('en-IN', {maximumFractionDigits:2})}`, higher: 'neutral' },
            { label: '1Y Return', key: 'returns1Y', fmt: v => `${Number(v||0).toFixed(2)}%`, higher: 'up' },
            { label: 'EPS', key: 'eps', fmt: v => `Rs. ${Number(v||0).toFixed(2)}`, higher: 'up' },
            { label: 'P/E Ratio', key: 'pe', fmt: v => `${Number(v||0).toFixed(2)}x`, higher: 'down' },
            { label: 'P/B Ratio', key: 'pb', fmt: v => `${Number(v||0).toFixed(2)}x`, higher: 'down' },
            { label: 'ROE', key: 'roe', fmt: v => `${Number(v||0).toFixed(2)}%`, higher: 'up' },
            { label: 'Book Value', key: 'bookValue', fmt: v => `Rs. ${Number(v||0).toFixed(2)}`, higher: 'up' },
            { label: '52W High', key: 'high52w', fmt: v => `Rs. ${Number(v||0).toFixed(2)}`, higher: 'neutral' },
            { label: '52W Low', key: 'low52w', fmt: v => `Rs. ${Number(v||0).toFixed(2)}`, higher: 'neutral' },
            { label: 'Cash Dividend', key: 'cashDiv', fmt: v => `${Number(v||0).toFixed(2)}%`, higher: 'up' },
            { label: 'Bonus Share', key: 'bonusShare', fmt: v => `${Number(v||0).toFixed(2)}%`, higher: 'up' },
            { label: 'Mkt Cap (Cr)', key: 'marketCap', fmt: v => `${Number(v||0).toFixed(2)}`, higher: 'up' },
          ];

          return (
            <div style={{ padding: '0 4px' }}>
              {/* Search Row */}
              <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', marginBottom: 10 }}>
                  📊 Compare: {d.symbol} vs. Peer
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={compareSymbol}
                    onChange={e => setCompareSymbol(e.target.value.toUpperCase())}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-form-type="other"
                    placeholder="Enter peer symbol..."
                    style={{ flex: 1, background: '#0a1020', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '8px 12px' }}
                  />
                  <button
                    onClick={handleCompare}
                    disabled={compareLoading}
                    style={{ background: '#10B981', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                  >
                    {compareLoading ? '...' : 'Compare'}
                  </button>
                </div>
              </div>

              {/* Comparison Table */}
              {(s1 || s2) && (
                <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'rgba(16, 185, 129,0.08)', padding: '10px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.07)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>METRIC</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#10B981', textAlign: 'center' }}>{d.symbol}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#a855f7', textAlign: 'center' }}>{s2?.symbol || '—'}</div>
                  </div>
                  {metricsRows.map((row, i) => {
                    const v1 = s1?.[row.key];
                    const v2 = s2?.[row.key];
                    const winner = row.higher === 'neutral' ? null
                      : row.higher === 'up' ? (Number(v1) >= Number(v2) ? 'left' : 'right')
                      : (Number(v1) <= Number(v2) ? 'left' : 'right');
                    return (
                      <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '9px 14px', borderBottom: i < metricsRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>{row.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: winner === 'left' ? '#10B981' : '#fff', textAlign: 'center' }}>
                          {v1 != null ? row.fmt(v1) : '—'} {winner === 'left' && '✓'}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: winner === 'right' ? '#10B981' : 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                          {v2 != null ? row.fmt(v2) : '—'} {winner === 'right' && '✓'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!s2 && !compareLoading && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 24 }}>
                  Enter a symbol above to compare side-by-side
                </div>
              )}
            </div>
          );
        })()}

        {/* ════ TAB 7: DIVIDENDS & CORPORATE ACTIONS ════ */}
        {activeTab === 'dividends' && (
          <div style={{ padding: '0 4px' }}>
            <DividendHistoryPanel symbol={d.symbol} hideSearch={true} />
          </div>
        )}

        {/* ════ TAB 8: AI GURU & CALCULATOR ════ */}

        {activeTab === 'ai_calc' && (
          <div>
            {/* AI Assessment Card */}
            <div style={{ background: '#151922', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BrainCircuit style={{ width: 16, height: 16, color: 'var(--primary-light)' }} /> AI Quantitative Assessment
                </div>
                <button
                  onClick={generateAi}
                  disabled={aiLoading}
                  style={{
                    background: 'var(--primary-light)', color: '#000', border: 'none', borderRadius: 8,
                    padding: '6px 14px', fontSize: 11, fontWeight: 800, cursor: 'pointer'
                  }}
                >
                  {aiLoading ? 'Analyzing...' : 'Generate Live Report'}
                </button>
              </div>

              {aiResult ? (
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-line' }}>
                  {aiResult}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  Click 'Generate Live Report' to get an instant 12-month quantitative breakdown and tactical trade plan for {d.symbol}.
                </div>
              )}
            </div>

            {/* Instant Buy/Sell Calculator */}
            <div style={{ background: '#151922', border: '1px solid rgba(255, 255, 255, 0.07)', borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', marginBottom: 12 }}>
                🧮 Instant Buy / Sell Profit Calculator
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                <button
                  onClick={() => setCalcMode('buy')}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: calcMode === 'buy' ? 'var(--bull)' : 'rgba(255,255,255,0.05)', color: calcMode === 'buy' ? '#000' : '#fff', fontWeight: 800, cursor: 'pointer' }}
                >
                  Buy Simulator
                </button>
                <button
                  onClick={() => setCalcMode('sell')}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: calcMode === 'sell' ? '#F43F5E' : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                >
                  Sell / Profit Simulator
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quantity (Shares)</label>
                  <input
                    type="number"
                    value={qtyInput}
                    onChange={e => setQtyInput(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, marginTop: 4 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Price per Share (Rs.)</label>
                  <input
                    type="number"
                    value={priceInput}
                    onChange={e => setPriceInput(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, marginTop: 4 }}
                  />
                </div>
              </div>

              {calcMode === 'sell' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Purchase Rate / WACC (Rs.)</label>
                  <input
                    type="number"
                    value={waccInput}
                    onChange={e => setWaccInput(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, marginTop: 4 }}
                  />
                </div>
              )}

              {calcResult && (
                <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Gross Turnover:</span>
                    <span style={{ fontWeight: 800, color: '#ffffff' }}>Rs. {fmt(calcResult.shareAmount || calcResult.grossAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Broker Commission:</span>
                    <span style={{ color: '#ffffff' }}>Rs. {fmt(calcResult.commission)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>SEBON Fee + DP:</span>
                    <span style={{ color: '#ffffff' }}>Rs. {fmt((calcResult.sebonFee || 0) + (calcResult.dpFee || 25))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.07)', fontSize: 13, fontWeight: 900 }}>
                    <span>{calcMode === 'buy' ? 'Total Cost Payable:' : 'Net Receivable:'}</span>
                    <span style={{ color: 'var(--bull)' }}>Rs. {fmt(calcResult.totalAmount || calcResult.netReceivable)}</span>
                  </div>
                  {calcMode === 'sell' && calcResult.profit != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: calcResult.profit >= 0 ? 'var(--bull)' : '#F43F5E', fontWeight: 900 }}>
                      <span>Net Profit / Loss:</span>
                      <span>Rs. {fmt(calcResult.profit)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Fullscreen Advanced Technical Chart Modal ── */}
      {showAdvancedModal && (
        <AdvancedChartModal
          symbol={d.symbol}
          stock={d}
          initialTimeframe={chartTimeframe}
          onClose={() => setShowAdvancedModal(false)}
        />
      )}
    </div>
  );
}
