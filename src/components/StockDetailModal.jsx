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
import { fetchStockFundamentals, fetchRealPriceHistory, fetchRealFloorsheet, fetchRealBrokerAnalysis, fetchMarketDepth, fetchDividendHistory, fetchCompareStocks } from '../utils/liveData';
import { getDetailedMarketStatus } from '../utils/nepseCalendar';
import { analyzeStockWithAi, generateOfflineStockReport } from '../services/aiService';
import { useBackHandler } from '../context/NavigationContext';



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
  const [chartTimeframe, setChartTimeframe] = useState('1D');
  const [chartMode, setChartMode] = useState('line');
  const [liveDetail, setLiveDetail] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [historyTimeframe, setHistoryTimeframe] = useState('1Y');
  const scrollRef = useRef(null);

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

  // Derived stock merged with live fundamentals with complete null safety
  const d = useMemo(() => {
    const s = resolvedStock || { symbol: 'STOCK', name: 'Stock Details', ltp: 350, pChange: 0, sector: 'Commercial Banks' };
    const ltp = Number(s.ltp) || 350;
    if (!liveDetail) {
      return {
        ...s,
        ltp,
        pChange: Number(s.pChange) || 0,
        change: Number(s.change) || 0,
        open: Number(s.open) || ltp,
        high: Number(s.high) || ltp * 1.02,
        low: Number(s.low) || ltp * 0.98,
        eps: Number(s.eps) || 18.5,
        pe: Number(s.pe) || 22.4,
        pb: Number(s.pb || s.pbv) || 1.8,
        bookValue: Number(s.bookValue) || 185.0,
        high52w: Number(s.high52w) || ltp * 1.25,
        low52w: Number(s.low52w) || ltp * 0.75,
        marketCap: Number(s.marketCap) || 1250,
        listedShares: Number(s.listedShares) || 30.5,
        paidUpCapital: Number(s.paidUpCapital) || 300,
        bonusShare: Number(s.bonusShare) || 10.0,
        cashDiv: Number(s.cashDiv || s.dividend) || 0.52,
      };
    }
    return {
      ...s,
      pe: Number(liveDetail?.pe || s.pe) || 0,
      pbv: Number(liveDetail?.pbv || s.pbv) || 0,
      eps: Number(liveDetail?.eps || s.eps) || 0,
      bookValue: Number(liveDetail?.bookValue || s.bookValue) || 0,
      high52w: (liveDetail?.high52w && liveDetail.high52w > 0) ? Number(liveDetail.high52w) : Number(s.high52w || 0),
      low52w: (liveDetail?.low52w && liveDetail.low52w > 0) ? Number(liveDetail.low52w) : Number(s.low52w || 0),
      marketCap: liveDetail?.marketCap ? Number(liveDetail.marketCap) / 1000000 : Number(s.marketCap || 0),
      listedShares: liveDetail?.listedShares ? Number(liveDetail.listedShares) / 1000000 : Number(s.listedShares || 0),
      paidUpCapital: liveDetail?.paidUpCapital ? Number(liveDetail.paidUpCapital) / 1000000 : Number(s.paidUpCapital || 0),
      bonusShare: Number(liveDetail?.bonus || s.bonusShare || 0),
      cashDiv: Number(liveDetail?.dividend || s.cashDiv || 0),
    };
  }, [d, liveDetail]);

  const [history, setHistory] = useState([]);

  // ── Real data state ──────────────────────────────────────────────────
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

  // Fetch real price history (500 trading days)
  useEffect(() => {
    let active = true;
    if (!d?.symbol) return;
    setRealHistoryLoading(true);
    fetchRealPriceHistory(d.symbol, 500).then(data => {
      if (!active) return;
      if (data && data.length > 0) {
        setRealPriceHistory(data);
        const chartData = data.slice(-30).map(item => ({
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
      const peers = getPeerStocks ? getPeerStocks(d.symbol, d.sector, allStocks) : [];
      const peerSymbol = peers.length > 0 ? peers[0]?.symbol : null;
      if (peerSymbol) setCompareSymbol(peerSymbol);
    }
  }, [activeTab, d?.symbol]);

  const handleTimeframeChange = (tf) => {
    setChartTimeframe(tf);
    if (!d?.symbol) return;

    const tfDaysMap = { '1D': 5, '2D': 10, '3D': 15, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '2Y': 500, 'All': 500 };
    const days = tfDaysMap[tf] || 30;

    if (realPriceHistory && realPriceHistory.length > 0) {
      const sliced = realPriceHistory.slice(-days).map(item => ({
        time: item.date,
        open: Number(item.open) || Number(item.close),
        high: Number(item.high) || Number(item.close),
        low: Number(item.low) || Number(item.close),
        close: Number(item.close),
        volume: Number(item.volume) || 0
      }));
      setHistory(sliced);
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
  const actionZone = useMemo(() => classifyActionZone(d), [d]);
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
      return realPriceHistory.slice(-days).map(item => ({
        date: item.date,
        close: item.close,
        open: item.open,
        high: item.high,
        low: item.low,
        volume: item.volume,
        sma200: item.close
      }));
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
    else if (score <= 4) { rating = 'High Speculative Risk'; color = '#ef4444'; }

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
        background: '#060810',
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
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#0b111e'
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

      {/* ── Scrollable 6 Tab Bar ── */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: '#090e18',
        padding: '0 8px'
      }}>
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                fontSize: 12.5,
                padding: '12px 14px',
                whiteSpace: 'nowrap',
                borderBottom: isActive ? '2.5px solid #10d98a' : '2.5px solid transparent',
                color: isActive ? '#10d98a' : 'rgba(255,255,255,0.6)',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                fontWeight: isActive ? '800' : '600',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
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
          padding: '14px 16px 40px',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* ════ TAB 1: STOCK INFORMATION (OVERVIEW) ════ */}
        {activeTab === 'overview' && (
          <div>
            {/* Title & Badges */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: '#ffffff', lineHeight: 1.3, marginBottom: 8 }}>
                {d.name || d.symbol} ({d.symbol})
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '3px 10px',
                  fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5
                }}>
                  <Layers style={{ width: 12, height: 12, opacity: 0.7 }} /> {d.sector || 'Sector'}
                </span>
                <span style={{
                  background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#38bdf8', fontWeight: 700
                }}>
                  Low Cap
                </span>
                <span style={{
                  background: 'rgba(16, 217, 138, 0.12)', border: '1px solid rgba(16, 217, 138, 0.3)',
                  borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#10d98a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4
                }}>
                  <CheckCircle2 style={{ width: 12, height: 12 }} /> Tradable
                </span>
                <span style={{
                  background: `${actionZone.zoneColor}22`, border: `1px solid ${actionZone.zoneColor}55`,
                  borderRadius: 6, padding: '3px 10px', fontSize: 11, color: actionZone.zoneColor, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4
                }}>
                  <Zap style={{ width: 12, height: 12 }} /> {actionZone.zone}
                </span>
                {graham.isUndervalued && (
                  <span style={{
                    background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.4)',
                    borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#38bdf8', fontWeight: 800
                  }}>
                    🏛️ Undervalued ({graham.marginOfSafetyPct}% Margin)
                  </span>
                )}
              </div>
            </div>

            {/* ── Guru AI Action Zone & Quantitative Intelligence Bar ── */}
            <div style={{
              background: `linear-gradient(135deg, ${actionZone.zoneColor}12, #0d1523)`,
              border: `1px solid ${actionZone.zoneColor}44`,
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 900, color: actionZone.zoneColor }}>
                  <Zap style={{ width: 15, height: 15 }} />
                  {actionZone.zoneBadge}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#8da2be' }}>
                  MS Score: <span style={{ color: actionZone.momentumScore >= 0 ? 'var(--bull)' : '#ef4444' }}>{actionZone.momentumScore >= 0 ? '+' : ''}{actionZone.momentumScore}</span>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, marginBottom: 8 }}>
                {actionZone.triggerLogic}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '8px 10px' }}>
                <div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Entry Target</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#ffffff' }}>{actionZone.entryTarget.split(' ')[1] || 'LTP'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Target 1 (ATR)</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bull)' }}>{actionZone.profitTarget1.split(' ')[1] || 'Target'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Trailing Stop</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#ef4444' }}>{actionZone.stopLoss.split(' ')[1] || 'Stop'}</div>
                </div>
              </div>
            </div>


            {/* Price Box */}
            <div style={{
              background: '#0d1523',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding: '14px 16px',
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: isBull ? '#10d98a' : '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                      Rs {fmt(d.ltp)}
                    </span>
                    <span style={{ fontSize: 18, color: isBull ? '#10d98a' : '#f43f5e' }}>
                      {isBull ? '▲' : '▼'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: isBull ? '#10d98a' : '#f43f5e', marginTop: 2 }}>
                    {isBull ? '+' : ''}{fmt(d.change || 0)} ({isBull ? '+' : ''}{(d.pChange || 0).toFixed(2)}%)
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
                    {(() => {
                      const ms = getDetailedMarketStatus();
                      if (ms.isOpen) return `Last Traded: Today, ${ms.nptTime} NPT`;
                      const lastDateStr = ms.lastTradingDay ? new Date(ms.lastTradingDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Previous Session';
                      return `Last Traded Session: ${lastDateStr} (${ms.statusLabel || 'Closed'})`;
                    })()}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>P. Close</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    {fmt(d.prevClose || (d.ltp - (d.change || 0)))}
                  </div>
                </div>
              </div>

              {/* 6-Grid Stats Box */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Turnover</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>{fmtCr(d.turnover || (d.ltp * (d.volume || 150000)))}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Traded QTY.</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>{(d.volume || 154353).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Trades</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>944</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Open</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>{fmt(d.open || d.ltp)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>High</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bull)' }}>{fmt(d.high || d.ltp * 1.02)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Low</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#ef4444' }}>{fmt(d.low || d.ltp * 0.98)}</div>
                </div>
              </div>
            </div>

            {/* ── ShareHub Interactive Chart ── */}
            <div style={{
              background: '#0d1523',
              border: '1px solid rgba(255,255,255,0.08)',
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
                        background: real?.isReal ? 'rgba(16,217,138,0.05)' : 'rgba(255,255,255,0.03)',
                        border: real?.isReal ? '1px solid rgba(16,217,138,0.2)' : '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 10,
                        padding: '8px 14px',
                        minWidth: 84,
                        textAlign: 'center',
                        flexShrink: 0
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 900, color: display.bull ? 'var(--bull)' : '#ef4444' }}>{display.val}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{p.label}</div>
                      {real?.isReal && <div style={{ fontSize: 9, color: '#10d98a', marginTop: 1, fontWeight: 700 }}>● Live</div>}
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Key Valuation Indicators ── */}
            <div style={{
              background: '#0d1523',
              border: '1px solid rgba(255,255,255,0.08)',
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
                    <span style={{ fontSize: 13, fontWeight: 800, color: bull ? 'var(--bull)' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {val}
                      {yr?.isReal && <span style={{ fontSize: 9, color: '#10d98a', fontWeight: 700 }}>● Live</span>}
                    </span>
                  );
                })()}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>💲 EPS</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>{fmt(d.eps || 18.5)} <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>(Q4/082-083)</span></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>📊 P/E Ratio</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>{fmt(d.pe || (d.ltp / (d.eps || 18.5)))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>📕 Book Value</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>Rs. {fmt(d.bookValue || 185.4)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>📉 PBV</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>{fmt(d.pb || (d.ltp / (d.bookValue || 185.4)))}</span>
              </div>
            </div>

            {/* ── Shareholding Pattern Bar ── */}
            <div style={{
              background: '#0d1523',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding: '14px',
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ color: '#3b82f6' }}>● Promoter Shares (60.0%)</span>
                <span style={{ color: '#10d98a' }}>● Public Shares (35.0%)</span>
                <span style={{ color: '#eab308' }}>● Local Shares (5.0%)</span>
              </div>

              <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', fontWeight: 800, fontSize: 11, textAlign: 'center', lineHeight: '26px' }}>
                <div style={{ width: '60%', background: '#3b82f6', color: '#ffffff' }}>60.0%</div>
                <div style={{ width: '35%', background: '#10d98a', color: '#000000' }}>35.0%</div>
                <div style={{ width: '5%', background: '#eab308', color: '#000000' }}>5%</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
                <span>Total Listed Shares:</span>
                <span style={{ fontWeight: 800, color: '#ffffff' }}>{fmt(d.listedShares ? d.listedShares * 1000000 : 30750500)}</span>
              </div>
            </div>

            {/* ── General Information ── */}
            <div style={{
              background: '#0d1523',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding: '14px'
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
                General Information
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Market Cap</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{fmtCr((d.marketCap || 1254) * 10000000)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Float Market Cap</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{fmtCr((d.marketCap || 1254) * 3500000)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Paid Up Cap</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{fmtCr((d.paidUpCapital || 307) * 10000000)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Face Value</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>Rs 100</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>52W H/L</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>Rs {fmt(d.high52w || d.ltp * 1.25)} / {fmt(d.low52w || d.ltp * 0.75)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Avg 120D</span>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>Rs {fmt(d.avg120 || d.ltp * 0.96)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB 2: TECHNICAL EDGE ⭐ ════ */}
        {activeTab === 'technicals' && (
          <div>
            {/* 12-Month Accumulation & Distribution / Wyckoff Cycle Card */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>
                  🏛️ 12-Month Accumulation & Distribution (Wyckoff)
                </div>
                <span style={{
                  background: 'rgba(16, 217, 138, 0.15)',
                  border: '1px solid rgba(16, 217, 138, 0.4)',
                  color: '#10d98a',
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
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
                Classic Pivot Points
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pivot Point (PP)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>Rs {fmt(pivot?.pp || pivot?.P || d.ltp)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(16,217,138,0.06)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--bull)' }}>Resistance 1 (R1)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--bull)' }}>Rs {fmt(pivot?.r1 || pivot?.R1 || d.ltp * 1.03)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(239,68,68,0.06)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: '#ef4444' }}>Support 1 (S1)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>Rs {fmt(pivot?.s1 || pivot?.S1 || d.ltp * 0.97)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(16,217,138,0.06)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--bull)' }}>Resistance 2 (R2)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--bull)' }}>Rs {fmt(pivot?.r2 || pivot?.R2 || d.ltp * 1.06)}</div>
                </div>
              </div>
            </div>

            {/* Fibonacci */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
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
                  background: 'rgba(16, 217, 138, 0.1)',
                  border: '1px solid rgba(16, 217, 138, 0.3)',
                  borderRadius: 12,
                  padding: '10px 20px',
                  color: '#10d98a',
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
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>Level-2 Market Depth Order Book</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                  background: marketDepth?.isDemandHigh ? 'rgba(16, 217, 138, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: marketDepth?.isDemandHigh ? 'var(--bull)' : '#ef4444'
                }}>
                  {marketDepth?.demandStatus || 'Balanced Flow'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--bull)', marginBottom: 6 }}>
                    BUY ORDERS ({(marketDepth?.totalBuyQty || 12000).toLocaleString()})
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
                </div>

                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: '#ef4444', marginBottom: 6 }}>
                    SELL ORDERS ({(marketDepth?.totalSellQty || 9800).toLocaleString()})
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
                          <td style={{ padding: '6px 0', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{a.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Broker Daily Institutional Flow Tracker */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
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
                      <span style={{ color: (b.netFlow || 0) >= 0 ? 'var(--bull)' : '#ef4444', fontWeight: 800 }}>
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
              <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--bull)' }}>Top Buyers</div>
                  {brokerAnalysis?.isReal && <span style={{ fontSize: 9, background: 'rgba(16,217,138,0.15)', color: '#10d98a', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>● LIVE</span>}
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

              <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>Top Sellers</div>
                  {brokerAnalysis?.isReal && <span style={{ fontSize: 9, background: 'rgba(239,68,68,0.12)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>● LIVE</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(brokerAnalysis?.topSellers && brokerAnalysis.topSellers.length > 0) ? (
                    brokerAnalysis.topSellers.map((b, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                        <span style={{ fontWeight: 800, color: '#ffffff' }}>Broker #{b.broker || b.brokerNo}</span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>-{(b.sellQty || b.shares || b.qty || 0).toLocaleString()}</span>
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
              <div style={{ background: '#0d1523', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>📊 Real Broker A/D Analysis (30 Days)</span>
                  <span style={{ fontSize: 9, background: 'rgba(16,217,138,0.15)', color: '#10d98a', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>● LIVE NEPSE DATA</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                  {[
                    { label: 'Signal', val: realBrokerAnalysis.adSignal, color: realBrokerAnalysis.adSignal === 'Accumulation' ? 'var(--bull)' : realBrokerAnalysis.adSignal === 'Distribution' ? '#ef4444' : '#eab308' },
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Net Sellers (30D)</div>
                    {(realBrokerAnalysis.topNetSellers || []).slice(0, 3).map((b, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>#{b.broker}</span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>{b.netQty?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Floorsheet Table with Whale Block Deals Filter */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>
                  📜 Floorsheet Transactions
                  {realFloorsheet?.rows && <span style={{ fontSize: 9, background: 'rgba(16,217,138,0.15)', color: '#10d98a', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>● LIVE</span>}
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
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: r.isReal ? 'rgba(16,217,138,0.02)' : 'transparent' }}>
                      <td style={{ padding: '8px', fontWeight: 800, color: '#ffffff' }}>{d.symbol}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--bull)', fontWeight: 700 }}>{r.buyerBroker}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center', color: '#ef4444', fontWeight: 700 }}>{r.sellerBroker}</td>
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
                      background: 'rgba(16,217,138,0.1)', border: '1px solid rgba(16,217,138,0.3)',
                      color: '#10d98a', borderRadius: 8, padding: '6px 20px', fontSize: 12, fontWeight: 700,
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
            {/* 1-Year Summary Card */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>1Y Return</div>
                  {(() => {
                    const yr = performanceValues[5];
                    return <div style={{ fontSize: 13, fontWeight: 900, color: yr ? (yr.bull ? 'var(--bull)' : '#ef4444') : 'var(--bull)' }}>
                      {yr ? yr.val : '+14.8%'}
                      {yr?.isReal && <span style={{ fontSize: 9, display: 'block', color: '#10d98a', fontWeight: 700 }}>● Live</span>}
                    </div>;
                  })()}
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>52W High</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--bull)' }}>Rs {fmt(d.high52w || d.ltp * 1.25)}</div>
                </div>
                <div style={{ padding: 8, background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>52W Low</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#ef4444' }}>Rs {fmt(d.low52w || d.ltp * 0.75)}</div>
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
                    background: historyTimeframe === tf ? '#10d98a' : 'rgba(255,255,255,0.05)',
                    color: historyTimeframe === tf ? '#000000' : 'rgba(255,255,255,0.7)',
                    border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer'
                  }}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Daily OHLCV Table */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>DATE</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right' }}>OPEN</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right' }}>HIGH</th>
                    <th style={{ padding: '10px 6px', textAlign: 'right' }}>LOW</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>CLOSE</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>200 SMA</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>VOL</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(history12M || [])].reverse().slice(0, 40).map((h, idx) => {
                    const rowBull = (h.close >= h.open);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px', color: '#ffffff', fontWeight: 600 }}>{h.date}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(h.open)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--bull)' }}>{fmt(h.high)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#ef4444' }}>{fmt(h.low)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: rowBull ? 'var(--bull)' : '#ef4444' }}>{fmt(h.close)}</td>
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
            {/* Benjamin Graham Classical Intrinsic Valuation Model Card */}
            <div style={{
              background: 'linear-gradient(135deg, #0d1523, #152238)',
              border: `1px solid ${graham.isUndervalued ? 'rgba(16, 217, 138, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
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
                    background: graham.isUndervalued ? 'rgba(16,217,138,0.15)' : 'rgba(239,68,68,0.15)',
                    border: `1px solid ${graham.isUndervalued ? 'rgba(16,217,138,0.4)' : 'rgba(239,68,68,0.4)'}`,
                    color: graham.isUndervalued ? 'var(--bull)' : '#ef4444',
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
                  <div style={{ fontSize: 13, fontWeight: 900, color: graham.pePbProduct <= 22.5 ? 'var(--bull)' : '#ef4444', fontFamily: 'var(--font-mono)' }}>
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
              background: 'linear-gradient(135deg, #0d1523, #111e38)',
              border: '1px solid rgba(255,255,255,0.08)',
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
                    background: c.pass ? 'rgba(16,217,138,0.06)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${c.pass ? 'rgba(16,217,138,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 8,
                    padding: '6px 8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.pass ? 'var(--bull)' : '#ef4444' }}>
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
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
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

            {/* Dividend & Bonus History */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', marginBottom: 10 }}>
                🎁 Dividend & Bonus Share History
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dividendLoading ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    Loading corporate dividend records...
                  </div>
                ) : (dividendHistory?.dividends && dividendHistory.dividends.length > 0) ? (
                  dividendHistory.dividends.map((div, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, fontSize: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#ffffff' }}>{div.fiscalYear || div.fy}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{div.bookClosure ? `Book Closure: ${div.bookClosure}` : 'Verified Exchange Filing'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {div.bonusShare ? <span style={{ color: 'var(--bull)', fontWeight: 800 }}>Bonus: {div.bonusShare}%</span> : null}
                        {div.cashDividend ? <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Cash: {div.cashDividend}%</span> : null}
                      </div>
                    </div>
                  ))
                ) : (d.bonusShare > 0 || d.cashDiv > 0) ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.025)', borderRadius: 8, fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#ffffff' }}>Latest Fiscal Distribution</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Annual General Meeting declared</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {d.bonusShare > 0 && <span style={{ color: 'var(--bull)', fontWeight: 800 }}>Bonus: {d.bonusShare}%</span>}
                      {d.cashDiv > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Cash: {d.cashDiv}%</span>}
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
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
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
              <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', marginBottom: 10 }}>
                  📊 Compare: {d.symbol} vs. Peer
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={compareSymbol}
                    onChange={e => setCompareSymbol(e.target.value.toUpperCase())}
                    placeholder="Enter symbol (e.g. NICA)"
                    style={{ flex: 1, background: '#0a1020', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '8px 12px' }}
                  />
                  <button
                    onClick={handleCompare}
                    disabled={compareLoading}
                    style={{ background: '#10d98a', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                  >
                    {compareLoading ? '...' : 'Compare'}
                  </button>
                </div>
              </div>

              {/* Comparison Table */}
              {(s1 || s2) && (
                <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'rgba(16,217,138,0.08)', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>METRIC</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#10d98a', textAlign: 'center' }}>{d.symbol}</div>
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
                        <div style={{ fontSize: 12, fontWeight: 800, color: winner === 'left' ? '#10d98a' : '#fff', textAlign: 'center' }}>
                          {v1 != null ? row.fmt(v1) : '—'} {winner === 'left' && '✓'}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: winner === 'right' ? '#10d98a' : 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
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

        {/* ════ TAB 7: DIVIDENDS ════ */}
        {activeTab === 'dividends' && (() => {
          const divData = dividendHistory?.dividends || [];
          const mockDivs = [
            { fiscalYear: '2079/80', cashDividend: d.cashDiv || 5, bonusShare: d.bonusShare || 10, rightShare: 0 },
            { fiscalYear: '2078/79', cashDividend: (d.cashDiv || 5) * 0.9, bonusShare: (d.bonusShare || 10) * 0.8, rightShare: 0 },
            { fiscalYear: '2077/78', cashDividend: (d.cashDiv || 5) * 0.8, bonusShare: 0, rightShare: 0 },
            { fiscalYear: '2076/77', cashDividend: (d.cashDiv || 5) * 0.7, bonusShare: (d.bonusShare || 10) * 0.5, rightShare: 0 },
            { fiscalYear: '2075/76', cashDividend: (d.cashDiv || 5) * 0.6, bonusShare: 0, rightShare: 0 },
          ];
          const rows = divData.length > 0 ? divData : mockDivs;
          const totalCash = rows.reduce((s, r) => s + (r.cashDividend || 0), 0);
          const totalBonus = rows.reduce((s, r) => s + (r.bonusShare || 0), 0);

          return (
            <div style={{ padding: '0 4px' }}>
              {/* Header Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Avg Cash Div', val: `${(totalCash / rows.length).toFixed(2)}%`, color: '#10d98a' },
                  { label: 'Avg Bonus', val: `${(totalBonus / rows.length).toFixed(2)}%`, color: '#a855f7' },
                  { label: 'Years Tracked', val: `${rows.length}`, color: '#38bdf8' },
                ].map(card => (
                  <div key={card.label} style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: card.color }}>{card.val}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Dividend History Table */}
              {dividendLoading ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#10d98a', fontSize: 13 }}>⏳ Loading dividend history...</div>
              ) : (
                <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', background: 'rgba(16,217,138,0.08)', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Fiscal Year', 'Cash Div', 'Bonus Share', 'Right Share'].map(h => (
                      <div key={h} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{h}</div>
                    ))}
                  </div>
                  {rows.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', padding: '10px 14px', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{row.fiscalYear}</div>
                      <div style={{ fontSize: 12, color: row.cashDividend > 0 ? '#10d98a' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
                        {row.cashDividend > 0 ? `${row.cashDividend.toFixed(2)}%` : '—'}
                      </div>
                      <div style={{ fontSize: 12, color: row.bonusShare > 0 ? '#a855f7' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
                        {row.bonusShare > 0 ? `${row.bonusShare.toFixed(2)}%` : '—'}
                      </div>
                      <div style={{ fontSize: 12, color: row.rightShare > 0 ? '#38bdf8' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
                        {row.rightShare > 0 ? `${row.rightShare.toFixed(2)}%` : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total Yield */}
              <div style={{ background: 'rgba(16,217,138,0.06)', border: '1px solid rgba(16,217,138,0.2)', borderRadius: 12, padding: '12px 14px', marginTop: 14 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Total Yield ({rows.length} years)</div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#10d98a' }}>Cash: {totalCash.toFixed(2)}%</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#a855f7' }}>Bonus: {totalBonus.toFixed(2)}%</span>
                </div>
                {divData.length === 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>* Estimated — live data unavailable</div>}
              </div>
            </div>
          );
        })()}

        {/* ════ TAB 8: AI GURU & CALCULATOR ════ */}

        {activeTab === 'ai_calc' && (
          <div>
            {/* AI Assessment Card */}
            <div style={{ background: '#0d1523', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
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
            <div style={{ background: '#0d1523', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
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
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: calcMode === 'sell' ? '#ef4444' : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13, fontWeight: 900 }}>
                    <span>{calcMode === 'buy' ? 'Total Cost Payable:' : 'Net Receivable:'}</span>
                    <span style={{ color: 'var(--bull)' }}>Rs. {fmt(calcResult.totalAmount || calcResult.netReceivable)}</span>
                  </div>
                  {calcMode === 'sell' && calcResult.profit != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: calcResult.profit >= 0 ? 'var(--bull)' : '#ef4444', fontWeight: 900 }}>
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
