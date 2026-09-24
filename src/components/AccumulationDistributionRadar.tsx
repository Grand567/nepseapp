import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, ShieldAlert, ShieldCheck,
  Search, RefreshCw, Zap, Crosshair, BarChart3, Info, BookOpen,
  Filter, Layers, ArrowUpRight, ArrowDownRight, Activity, Flame,
  CheckCircle2, XCircle, HelpCircle
} from 'lucide-react';
import { loadNepseData, fetchFloorSheet, fetchRealBrokerAnalysis, getCachedRealPriceHistory, fetchPriceHistory } from '../utils/liveData';
import {
  calculateChaikinADL,
  calculateCMF,
  calculateOBV,
  calculateBrokerConcentration,
  calculateStealthAccumulationScore,
  calculatePumpDumpRiskScore,
  classifyWyckoffStage,
  generateDynamicStockCandles,
  formatBrokerAmount,
  type BrokerDetail,
  type WyckoffStage,
  type StockWyckoffAnalysis,
  type Candle
} from '../utils/accumulationDistributionEngine';

interface AccumulationDistributionRadarProps {
  initialSymbol?: string;
  onSelectStock?: (stock: any) => void;
  onAskGuruAi?: (stock: any) => void;
}

export function AccumulationDistributionRadar({
  initialSymbol,
  onSelectStock,
  onAskGuruAi
}: AccumulationDistributionRadarProps) {
  const [activeTab, setActiveTab] = useState<'radar' | 'diagnostic' | 'playbook'>('radar');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStockSymbol, setSelectedStockSymbol] = useState(initialSymbol || 'NABIL');
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<any[]>([]);
  const [floorsheet, setFloorsheet] = useState<any[]>([]);
  const [stockBrokerDataMap, setStockBrokerDataMap] = useState<Record<string, any>>({});
  const [sortBy, setSortBy] = useState<'stealth' | 'dumpRisk' | 'pChange' | 'turnover' | 'cmf'>('stealth');

  useEffect(() => {
    let isMounted = true;
    async function init() {
      setLoading(true);
      try {
        const [liveRes, fsRes] = await Promise.allSettled([
          loadNepseData(),
          fetchFloorSheet(500)
        ]);
        if (!isMounted) return;
        if (liveRes.status === 'fulfilled' && liveRes.value?.stocks) {
          setStocks(liveRes.value.stocks);
          if (!initialSymbol && liveRes.value.stocks.length > 0) {
            setSelectedStockSymbol(liveRes.value.stocks[0].symbol);
          }
        }
        if (fsRes.status === 'fulfilled') {
          const fs = fsRes.value;
          const fsData = Array.isArray(fs?.content)
            ? fs.content
            : Array.isArray(fs?.data)
            ? fs.data
            : Array.isArray(fs)
            ? fs
            : [];
          setFloorsheet(fsData);
        }
      } catch (e) {
        console.error('Failed to load live accumulation data:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [initialSymbol]);

  // Dynamically fetch authentic broker data and real price history for the inspected stock
  useEffect(() => {
    if (!selectedStockSymbol) return;
    const sym = selectedStockSymbol.toUpperCase();
    let active = true;

    if (!stockBrokerDataMap[sym]) {
      fetchRealBrokerAnalysis(sym, 30)
        .then(res => {
          if (active && res && (res.topBuyers?.length > 0 || res.topNetBuyers?.length > 0)) {
            setStockBrokerDataMap(prev => ({ ...prev, [sym]: res }));
          }
        })
        .catch(() => {});
    }

    if (!getCachedRealPriceHistory(sym)) {
      fetchPriceHistory(sym, 60).catch(() => {});
    }

    return () => { active = false; };
  }, [selectedStockSymbol, stockBrokerDataMap]);

  // Compute analysis for each stock
  const analyzedStocks = useMemo(() => {
    return stocks.map((s) => {
      const sym = s.symbol;
      const cachedHist = getCachedRealPriceHistory(sym);
      const historyCandles: Candle[] = Array.isArray(s.history) && s.history.length >= 10
        ? s.history.map((h: any) => ({
            date: h.date,
            open: Number(h.open || h.close),
            high: Number(h.high || h.close),
            low: Number(h.low || h.close),
            close: Number(h.close),
            volume: Number(h.volume || 0)
          }))
        : Array.isArray(cachedHist) && cachedHist.length >= 10
        ? cachedHist.map((h: any) => ({
            date: h.date,
            open: Number(h.open || h.close),
            high: Number(h.high || h.close),
            low: Number(h.low || h.close),
            close: Number(h.close),
            volume: Number(h.volume || 0)
          }))
        : generateDynamicStockCandles(s, 25);

      const stockBrokerAnalysis = stockBrokerDataMap[sym];
      const stockSummaryWithBroker = stockBrokerAnalysis ? { ...s, realBrokerAnalysis: stockBrokerAnalysis } : s;
      const brokerData = calculateBrokerConcentration(floorsheet, sym, stockSummaryWithBroker);
      const wyckoff = classifyWyckoffStage(s, historyCandles, brokerData);

      return {
        ...s,
        wyckoff,
        brokerData
      };
    });
  }, [stocks, floorsheet, stockBrokerDataMap]);

  // Filtered & Sorted list for the radar
  const filteredStocks = useMemo(() => {
    let list = analyzedStocks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          (s.companyName && s.companyName.toLowerCase().includes(q)) ||
          (s.sector && s.sector.toLowerCase().includes(q))
      );
    }

    if (selectedStage !== 'ALL') {
      list = list.filter((s) => s.wyckoff.stage.includes(selectedStage));
    }

    return list.sort((a, b) => {
      if (sortBy === 'stealth') return b.wyckoff.stealthScore - a.wyckoff.stealthScore;
      if (sortBy === 'dumpRisk') return b.wyckoff.pumpDumpRiskScore - a.wyckoff.pumpDumpRiskScore;
      if (sortBy === 'pChange') return (b.pChange || 0) - (a.pChange || 0);
      if (sortBy === 'turnover') return (b.turnover || 0) - (a.turnover || 0);
      if (sortBy === 'cmf') return b.wyckoff.cmf - a.wyckoff.cmf;
      return 0;
    });
  }, [analyzedStocks, searchQuery, selectedStage, sortBy]);

  // Currently inspected stock for Deep Diagnostic
  const activeStock = useMemo(() => {
    return (
      analyzedStocks.find((s) => s.symbol === selectedStockSymbol) ||
      analyzedStocks[0] ||
      null
    );
  }, [analyzedStocks, selectedStockSymbol]);

  // Global radar overview statistics
  const stats = useMemo(() => {
    let stealthCount = 0;
    let pumpCount = 0;
    let distributionCount = 0;
    let dumpCount = 0;
    let totalCMF = 0;

    analyzedStocks.forEach((s) => {
      const st = s.wyckoff.stage;
      if (st.includes('STEALTH')) stealthCount++;
      if (st.includes('PUMP')) pumpCount++;
      if (st.includes('DISTRIBUTION')) distributionCount++;
      if (st.includes('DUMP')) dumpCount++;
      totalCMF += s.wyckoff.cmf;
    });

    const avgCMF = analyzedStocks.length > 0 ? totalCMF / analyzedStocks.length : 0;
    return {
      stealthCount,
      pumpCount,
      distributionCount,
      dumpCount,
      avgCMF: Number(avgCMF.toFixed(3)),
      marketBias: avgCMF > 0.03 ? 'Institutional Accumulation' : avgCMF < -0.03 ? 'Distribution Pressure' : 'Balanced'
    };
  }, [analyzedStocks]);

  const getStageBadgeStyle = (stage: WyckoffStage) => {
    if (stage.includes('STEALTH')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
    }
    if (stage.includes('PUMP')) {
      return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
    }
    if (stage.includes('SPRING')) {
      return { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.3)' };
    }
    if (stage.includes('DISTRIBUTION')) {
      return { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' };
    }
    if (stage.includes('DUMP')) {
      return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' };
    }
    return { bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' };
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-5 text-slate-100 space-y-5">
      {/* Top Banner & Header */}
      <div className="rounded-2xl p-5 border border-emerald-500/20 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Wyckoff & NEPSE Microstructure
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Floor Sheet Floor Flow
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Layers className="w-7 h-7 text-emerald-400" />
              Accumulation & Distribution Radar
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              संकलन र वितरण विश्लेषक: Identify smart money cornering, spot operator pumps early, and avoid high-turnover retail dumping traps.
            </p>
          </div>

          {/* Quick Tab Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 self-start md:self-auto">
            <button
              onClick={() => setActiveTab('radar')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'radar'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" /> Live Radar
            </button>
            <button
              onClick={() => setActiveTab('diagnostic')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'diagnostic'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Deep Diagnostic
            </button>
            <button
              onClick={() => setActiveTab('playbook')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'playbook'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Theory & Guide
            </button>
          </div>
        </div>

        {/* Global Summary Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Stealth Accumulation
            </div>
            <div className="text-xl font-black text-emerald-400 mt-1">{stats.stealthCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">Quiet institutional buying</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" /> Active Markup / Pump
            </div>
            <div className="text-xl font-black text-blue-400 mt-1">{stats.pumpCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">Price & volume expansion</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-400" /> Distribution Danger
            </div>
            <div className="text-xl font-black text-orange-400 mt-1">{stats.distributionCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">Peak churning & selling</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Active Dump / Markdown
            </div>
            <div className="text-xl font-black text-red-400 mt-1">{stats.dumpCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">Capitulation & lower circuit risk</div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: LIVE RADAR & SCANNER                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'radar' && (
        <div className="space-y-4">
          {/* Controls: Search, Stage Filter, Sort */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol, company or sector (e.g. NABIL, HIDCL, Finance)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Stage Filter Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: 'ALL', label: 'All Stages' },
                { id: 'STEALTH', label: '🟢 Stealth', color: 'emerald' },
                { id: 'PUMP', label: '🚀 Markup', color: 'blue' },
                { id: 'DISTRIBUTION', label: '⚠️ Distribution', color: 'orange' },
                { id: 'DUMP', label: '🔴 Dump', color: 'red' },
                { id: 'SPRING', label: '⚡ Spring', color: 'yellow' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setSelectedStage(btn.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedStage === btn.id
                      ? 'bg-slate-700 text-white font-bold border border-slate-600'
                      : 'bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800/80'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="stealth">Highest Stealth Score</option>
                <option value="dumpRisk">Highest Dump/Trap Risk</option>
                <option value="pChange">% Change</option>
                <option value="turnover">Daily Turnover</option>
                <option value="cmf">Chaikin Money Flow (CMF)</option>
              </select>
            </div>
          </div>

          {/* Results Table / Card Grid */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <th className="py-3 px-4">Symbol / Company</th>
                    <th className="py-3 px-3 text-right">LTP (Rs.)</th>
                    <th className="py-3 px-3 text-right">Change</th>
                    <th className="py-3 px-3">Wyckoff Stage & Status</th>
                    <th className="py-3 px-3 text-right">CMF (20)</th>
                    <th className="py-3 px-3 text-right">Top 5 Broker Buy %</th>
                    <th className="py-3 px-3 text-right">Buy/Sell Size Ratio</th>
                    <th className="py-3 px-3 text-center">Dump Risk Meter</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredStocks.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        {loading ? 'Analyzing live floor sheet and candles...' : 'No stocks matching the selected criteria.'}
                      </td>
                    </tr>
                  ) : (
                    filteredStocks.slice(0, 50).map((stock) => {
                      const badgeStyle = getStageBadgeStyle(stock.wyckoff.stage);
                      const isRiskHigh = stock.wyckoff.pumpDumpRiskScore >= 55;
                      const isRiskExtreme = stock.wyckoff.pumpDumpRiskScore >= 75;

                      return (
                        <tr
                          key={stock.symbol}
                          className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                          onClick={() => {
                            setSelectedStockSymbol(stock.symbol);
                            setActiveTab('diagnostic');
                          }}
                        >
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-white group-hover:text-emerald-400 transition-colors">
                              {stock.symbol}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                              {stock.companyName || stock.name || stock.symbol}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-white">
                            Rs. {stock.ltp?.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-bold">
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] ${
                                (stock.pChange || 0) >= 0
                                  ? 'text-emerald-400 bg-emerald-500/10'
                                  : 'text-red-400 bg-red-500/10'
                              }`}
                            >
                              {(stock.pChange || 0) >= 0 ? '+' : ''}
                              {stock.pChange?.toFixed(2)}%
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border"
                              style={{
                                backgroundColor: badgeStyle.bg,
                                color: badgeStyle.text,
                                borderColor: badgeStyle.border
                              }}
                            >
                              {stock.wyckoff.stage.replace(/_/g, ' ')}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {stock.wyckoff.stageNameNepali}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`font-semibold ${
                                stock.wyckoff.cmf > 0.05
                                  ? 'text-emerald-400'
                                  : stock.wyckoff.cmf < -0.05
                                  ? 'text-red-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {stock.wyckoff.cmf > 0 ? '+' : ''}
                              {stock.wyckoff.cmf.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-200">
                            {stock.brokerData?.bcr5BuyPct > 0 ? `${stock.brokerData.bcr5BuyPct}%` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`font-semibold ${
                                stock.wyckoff.tradeSizeRatio >= 1.5
                                  ? 'text-emerald-400'
                                  : stock.wyckoff.tradeSizeRatio <= 0.65
                                  ? 'text-orange-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {stock.wyckoff.tradeSizeRatio.toFixed(2)}x
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-16 bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    isRiskExtreme
                                      ? 'bg-red-500'
                                      : isRiskHigh
                                      ? 'bg-orange-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${stock.wyckoff.pumpDumpRiskScore}%` }}
                                />
                              </div>
                              <span
                                className={`text-[10px] font-bold ${
                                  isRiskExtreme
                                    ? 'text-red-400'
                                    : isRiskHigh
                                    ? 'text-orange-400'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {stock.wyckoff.pumpDumpRiskScore}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStockSymbol(stock.symbol);
                                setActiveTab('diagnostic');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 transition-colors border border-slate-700"
                            >
                              Audit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-950/60 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Showing up to 50 active stocks analyzed against live floor sheet and multi-day price-volume history.</span>
              <span className="font-semibold text-slate-300">Click any row for complete Wyckoff audit</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: DEEP STOCK DIAGNOSTIC                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'diagnostic' && activeStock && (
        <div className="space-y-4">
          {/* Stock Selector Search Bar */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Inspecting Stock:</span>
              <div className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  placeholder="Switch Symbol (e.g. NABIL, SHIVM)..."
                  value={selectedStockSymbol}
                  onChange={(e) => setSelectedStockSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-extrabold focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onSelectStock && (
                <button
                  onClick={() => onSelectStock(activeStock)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Open Full Stock Modal
                </button>
              )}
              {onAskGuruAi && (
                <button
                  onClick={() => onAskGuruAi(activeStock)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-slate-950 transition-opacity"
                >
                  Ask Guru AI About {activeStock.symbol}
                </button>
              )}
            </div>
          </div>

          {/* Wyckoff Phase Hero Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-black text-white">{activeStock.symbol}</h2>
                  <span className="text-xs text-slate-400 font-medium">{activeStock.companyName}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-lg font-bold text-white">Rs. {activeStock.ltp?.toLocaleString()}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      (activeStock.pChange || 0) >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                    }`}
                  >
                    {(activeStock.pChange || 0) >= 0 ? '+' : ''}
                    {activeStock.pChange?.toFixed(2)}%
                  </span>
                  <span className="text-xs text-slate-400">
                    Volume: {Number(activeStock.volume || 0).toLocaleString()} kitta
                  </span>
                </div>
              </div>

              {/* Wyckoff Stage Badge */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg border"
                  style={getStageBadgeStyle(activeStock.wyckoff.stage)}
                >
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Wyckoff Market Phase</div>
                  <div className="text-sm font-extrabold text-white">
                    {activeStock.wyckoff.stage.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs font-semibold text-emerald-400">
                    {activeStock.wyckoff.stageNameNepali}
                  </div>
                </div>
              </div>
            </div>

            {/* Actionable Guidance (Nepali & English) */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/20 space-y-2">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4" /> Actionable Trader Guidance (रणनीतिक सल्लाह)
              </div>
              <div className="text-sm font-semibold text-slate-100">
                🇳🇵 {activeStock.wyckoff.actionableGuidanceNepali}
              </div>
              <div className="text-xs text-slate-400">
                🇬🇧 {activeStock.wyckoff.actionableGuidanceEnglish}
              </div>
            </div>

            {/* Dual Diagnostic Grid: Classical Math vs NEPSE Floor Sheet */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Box 1: Classical Mathematical Indicators */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2 border-b border-slate-800 pb-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  1. Mathematical Flow Models (Chaikin / Wyckoff)
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Chaikin Money Flow (CMF 20)</span>
                    <span
                      className={`font-black ${
                        activeStock.wyckoff.cmf > 0.05
                          ? 'text-emerald-400'
                          : activeStock.wyckoff.cmf < -0.05
                          ? 'text-red-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {activeStock.wyckoff.cmf > 0 ? '+' : ''}
                      {activeStock.wyckoff.cmf.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Chaikin ADL Divergence</span>
                    <span className="font-bold text-slate-200">
                      {activeStock.wyckoff.adlDivergence}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Stealth Accumulation Index</span>
                    <span className="font-black text-emerald-400">
                      {activeStock.wyckoff.stealthScore} / 100
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Volume Surge Ratio</span>
                    <span className="font-bold text-white">
                      {Number(activeStock.volumeSurgeRatio || activeStock.rvol || 1.0).toFixed(2)}x
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: NEPSE Microstructure & Floor Sheet Flow */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Crosshair className="w-4 h-4 text-blue-400" />
                  2. NEPSE Floor Sheet & Broker Syndicates
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Top 5 Broker Buy Concentration (BCR₅)</span>
                    <span className="font-black text-blue-400">
                      {activeStock.brokerData?.bcr5BuyPct || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Buyer-to-Seller Trade Size Ratio</span>
                    <span
                      className={`font-black ${
                        activeStock.wyckoff.tradeSizeRatio >= 1.5
                          ? 'text-emerald-400'
                          : activeStock.wyckoff.tradeSizeRatio <= 0.65
                          ? 'text-red-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {activeStock.wyckoff.tradeSizeRatio.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Smart Money Order Bias</span>
                    <span className="font-bold text-slate-200">
                      {activeStock.brokerData?.smartMoneyBias || 'Neutral'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Net Traded Volume</span>
                    <span className={`font-bold ${(activeStock.brokerData?.netVolume || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(activeStock.brokerData?.netVolume || 0) >= 0 ? '+' : ''}
                      {(activeStock.brokerData?.netVolume || 0).toLocaleString()} kitta
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 3. BROKER ACCUMULATION & DISTRIBUTION FOOTPRINT LEDGER ── */}
            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-extrabold text-white">
                      Broker Accumulation vs Distribution Ledger (कुन ब्रोकरले कति किन्यो र बेच्यो?)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Transparent ledger of institutional buying & selling for {activeStock.symbol} (Kitta, Amount & Net Flow)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Net: {(activeStock.brokerData?.netVolume || 0) >= 0 ? '+' : ''}{(activeStock.brokerData?.netVolume || 0).toLocaleString()} kitta
                  </span>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
                    BCR₃: {activeStock.brokerData?.bcr3BuyPct || 0}%
                  </span>
                </div>
              </div>

              {/* 2-Column Responsive Tables: Top Accumulating vs Top Distributing */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Column 1: Top Buyers / Accumulators */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <TrendingUp className="w-4 h-4" /> Top Buying Brokers (खरिदकर्ता ब्रोकरहरू)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Total Buy: {(activeStock.brokerData?.totalBuyVolume || 0).toLocaleString()} kitta
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-800/80">
                          <th className="pb-2 font-bold">Broker</th>
                          <th className="pb-2 text-right font-bold">Buy Kitta</th>
                          <th className="pb-2 text-right font-bold">Turnover</th>
                          <th className="pb-2 text-right font-bold">% Vol</th>
                          <th className="pb-2 text-right font-bold">Net Flow</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {(activeStock.brokerData?.topBuyerBrokers || []).map((b: BrokerDetail, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="font-extrabold text-white">#{b.broker}</div>
                                  <div className="text-[10px] text-slate-400 truncate max-w-[110px]" title={b.brokerName}>
                                    {b.brokerName}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-bold text-emerald-400">
                              +{b.volume.toLocaleString()}
                            </td>
                            <td className="py-2.5 text-right font-semibold text-slate-300 text-[11px]">
                              {formatBrokerAmount(b.amount)}
                            </td>
                            <td className="py-2.5 text-right font-semibold text-slate-400 text-[11px]">
                              {b.pct}%
                            </td>
                            <td className="py-2.5 text-right font-extrabold text-[11px]">
                              <span className={b.netQty >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {b.netQty >= 0 ? '+' : ''}{b.netQty.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {(!activeStock.brokerData?.topBuyerBrokers || activeStock.brokerData.topBuyerBrokers.length === 0) && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                              No buying broker activity recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Column 2: Top Sellers / Distributors */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-red-500/20 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <TrendingDown className="w-4 h-4" /> Top Selling Brokers (बिक्रीकर्ता ब्रोकरहरू)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Total Sell: {(activeStock.brokerData?.totalSellVolume || 0).toLocaleString()} kitta
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-800/80">
                          <th className="pb-2 font-bold">Broker</th>
                          <th className="pb-2 text-right font-bold">Sell Kitta</th>
                          <th className="pb-2 text-right font-bold">Turnover</th>
                          <th className="pb-2 text-right font-bold">% Vol</th>
                          <th className="pb-2 text-right font-bold">Net Flow</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {(activeStock.brokerData?.topSellerBrokers || []).map((s: BrokerDetail, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-black flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="font-extrabold text-white">#{s.broker}</div>
                                  <div className="text-[10px] text-slate-400 truncate max-w-[110px]" title={s.brokerName}>
                                    {s.brokerName}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-bold text-red-400">
                              -{s.volume.toLocaleString()}
                            </td>
                            <td className="py-2.5 text-right font-semibold text-slate-300 text-[11px]">
                              {formatBrokerAmount(s.amount)}
                            </td>
                            <td className="py-2.5 text-right font-semibold text-slate-400 text-[11px]">
                              {s.pct}%
                            </td>
                            <td className="py-2.5 text-right font-extrabold text-[11px]">
                              <span className={s.netQty <= 0 ? 'text-red-400' : 'text-emerald-400'}>
                                {s.netQty > 0 ? '+' : ''}{s.netQty.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {(!activeStock.brokerData?.topSellerBrokers || activeStock.brokerData.topSellerBrokers.length === 0) && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-500 text-xs">
                              No selling broker activity recorded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Net Accumulators vs Net Distributors Highlight Strip */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Top Net Accumulators (खुद खरिदकर्ता - शेयर होल्ड गर्ने)
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(activeStock.brokerData?.topNetAccumulators || []).slice(0, 3).map((b: BrokerDetail, i: number) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-[11px]">
                        #{b.broker} {b.brokerName.split(' ')[0]}: +{b.netQty.toLocaleString()} kitta ({formatBrokerAmount(b.netAmount)})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-bold text-red-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" /> Top Net Distributors (खुद बिक्रेता - शेयर फाल्ने)
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(activeStock.brokerData?.topNetDistributors || []).slice(0, 3).map((s: BrokerDetail, i: number) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 font-bold text-[11px]">
                        #{s.broker} {s.brokerName.split(' ')[0]}: {s.netQty.toLocaleString()} kitta ({formatBrokerAmount(s.netAmount)})
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Educational Footnote */}
              <div className="text-[11px] text-slate-400 bg-slate-900/40 p-3 rounded-lg border border-slate-800/80 flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-200">नेपाली बजार विश्लेषण (NEPSE Insight): </span>
                  जब #५८, #४५ वा #३४ जस्ता शीर्ष ब्रोकरहरूले ५०% भन्दा बढी खरिद केन्द्रित (Concentration) गर्छन् र खुद बिक्रेताहरू धेरै छरिएका ब्रोकरहरूबाट हुन्छन्, यसले संस्थागत संकलन (Institutional Accumulation) को पुष्टि गर्दछ। यदि शीर्ष ब्रोकरहरूले ठूलो मात्रामा बिक्री (Net Seller) गरिरहेका छन् भने खुद्रा लगानीकर्तालाई शेयर भिडाउने (Operator Offloading) जोखिम रहन्छ।
                </div>
              </div>
            </div>

            {/* Pump & Dump Hazard Safety Audit */}
            <div className="p-4 rounded-xl bg-slate-950 border border-red-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4" /> Operator Pump & Dump Risk Meter (डम्पिङ तथा ट्र्याप जोखिम)
                </div>
                <div className="text-xs font-black px-2.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                  Risk Score: {activeStock.wyckoff.pumpDumpRiskScore} / 100
                </div>
              </div>

              <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    activeStock.wyckoff.pumpDumpRiskScore >= 75
                      ? 'bg-red-500'
                      : activeStock.wyckoff.pumpDumpRiskScore >= 50
                      ? 'bg-orange-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${activeStock.wyckoff.pumpDumpRiskScore}%` }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">T+2 Settlement Trap Risk</div>
                  <div className="font-bold text-white mt-0.5">
                    {activeStock.pChange >= 8 ? '🔴 Severe (Circuit Overhang)' : '🟢 Normal Settlement'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Retail Offloading Footprint</div>
                  <div className="font-bold text-white mt-0.5">
                    {activeStock.wyckoff.tradeSizeRatio <= 0.70
                      ? '⚠️ High (Institutions selling to retail)'
                      : activeStock.wyckoff.tradeSizeRatio >= 1.40
                      ? '🟢 Strong Absorption (Institutions buying blocks)'
                      : '🟢 Balanced ticket size'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400">Upper Wick Supply Churn</div>
                  <div className="font-bold text-white mt-0.5">
                    {activeStock.wyckoff.pumpDumpRiskScore >= 60 ? '⚠️ High Resistance Churn' : '🟢 Healthy Price Delivery'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: THEORY & NEPALI PLAYBOOK GUIDE                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'playbook' && (
        <div className="space-y-5">
          {/* Section 1: Wyckoff Cycle in Plain Nepali & English */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-400" />
              वाइकोफ थ्योरी र नेपालको शेयर बजार (The Wyckoff Market Cycle in NEPSE)
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Richard D. Wyckoff ले प्रतिपादन गरेको बजार नियम अनुसार, शेयरको मूल्य त्यसै घटबढ हुँदैन। संस्थागत लगानीकर्ता र ठूला अपरेटरहरू (Composite Operator / खेलाडीहरू) ले ४ चरणमा बजार सञ्चालन गर्दछन्:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/20">
                <div className="text-xs font-bold text-emerald-400 mb-1">१. गोप्य संकलन (Accumulation)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  बजार घटेर तल्लो बिन्दुमा पुगेपछि अपरेटरहरूले मूल्य नबढाईकन महिनौंसम्म शान्त रूपमा शेयर किन्ने गर्दछन्। यतिबेला भोल्युम सामान्य हुन्छ तर प्रमुख ब्रोकरहरू नेट खरिदकर्ता हुन्छन्।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-blue-500/20">
                <div className="text-xs font-bold text-blue-400 mb-1">२. पम्पिङ / मार्कअप (Markup / The Pump)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  फ्लोट लक गरिसकेपछि अपरेटरहरूले बजारमा सकारात्मक हल्ला (Social Media, Clubhouse) फिँजाएर १०% को सर्किट लगाउँछन्। साधारण लगानीकर्तामा FOMO सुरु हुन्छ।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-orange-500/20">
                <div className="text-xs font-bold text-orange-400 mb-1">३. वितरण / माल फाल्ने (Distribution)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  टुप्पोमा पुगेपछि सर्वाधिक उच्च भोल्युम (Record Turnover) मा अपरेटरहरूले आफ्नो शेयर साधारण लगानीकर्ताहरूलाई सुम्पिन्छन् (Dumping onto retail)।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-red-500/20">
                <div className="text-xs font-bold text-red-400 mb-1">४. डम्पिङ / पतन (Markdown / Dump)</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  अपरेटर बाहिरिएपछि माग शून्य हुन्छ। बजार तल्लो सर्किट हान्दै खस्छ। T+2 को कारण फसेका लगानीकर्ताले बेच्न नपाएर ३०-५०% नोक्सानी व्यहोर्छन्।
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Mathematical Calculations Explained */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              गणितीय सूत्रहरू (Mathematical Formulas Used in This App)
            </h2>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-emerald-400">1. Chaikin Close Location Value (MFM) & ADL:</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  MFM = ((Close - Low) - (High - Close)) / (High - Low)
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  दिनको क्लोजिङ हाइ नजिक भए MFM +1 (संकलन) हुन्छ, लो नजिक भए -1 (वितरण) हुन्छ।
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-blue-400">2. Chaikin Money Flow (CMF 20):</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  CMF = Sum(MFM × Volume, 20) / Sum(Volume, 20)
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  +0.10 भन्दा माथि = तीव्र संस्थागत खरिद दबाब; -0.10 भन्दा तल = तीव्र संस्थागत बिक्री दबाब।
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80">
                <div className="font-bold text-purple-400">3. NEPSE Buyer-to-Seller Trade Ticket Ratio (BSR):</div>
                <code className="text-slate-300 block my-1 font-mono text-[11px]">
                  BSR = (Total Buy Volume / Total Buy Trades) / (Total Sell Volume / Total Sell Trades)
                </code>
                <p className="text-slate-400 text-[10.5px]">
                  BSR ≥ 2.0 भए ठूला हातहरूले साना खुद्रा विक्रेताबाट कित्ता सोरिरहेका छन् (Smart Money Buying)。
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: NEPSE Nuances & Circuit Trap Warning */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-red-500/20 space-y-3">
            <h2 className="text-lg font-black text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              नेपालको बजारमा के फरक छ? (Crucial NEPSE Nuances)
            </h2>
            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong>१. सर्ट सेलिङ छैन (No Short Selling):</strong> अन्तर्राष्ट्रिय बजारमा वितरण गर्दा सर्ट गरेर कमाइन्छ, तर नेपालमा बेचेर मात्र नाफा बुक गर्न सकिन्छ। त्यसैले अपरेटरहरूले अनिवार्य रूपमा मूल्य पम्प गरेर खुद्रा लगानीकर्तालाई आकर्षित गर्नैपर्छ।
              </p>
              <p>
                <strong>२. १०% सर्किट र T+2 ट्र्याप (Circuit Trap):</strong> जब सेयर अत्यधिक पम्प भइसकेर टुप्पोमा पुग्छ, त्यहाँ १०% सर्किटमा किन्ने खुद्रा लगानीकर्ता फस्छन्। सेयर डिम्याटमा आउँदा (T+2) सम्ममा लगातार लोअर सर्किट लागेर बेच्नै पाइँदैन।
              </p>
              <p>
                <strong>३. पारदर्शी फ्लोरशिट (Public Floor Sheet Advantage):</strong> नेपालमा ब्रोकर नम्बर (Broker 58, 45, 34, 49, etc.) सार्वजनिक हुने भएकोले कसले किन्दैछ र कसले माल फाल्दैछ भन्ने कुरा हाम्रो यो राडारले सजिलै पत्ता लगाउँछ।
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default AccumulationDistributionRadar;
