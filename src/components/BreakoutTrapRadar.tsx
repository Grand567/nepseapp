import React, { useState, useMemo, useEffect } from 'react';
import {
  Zap, AlertTriangle, ShieldAlert, ShieldCheck, Target, Crosshair,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Layers,
  Search, RefreshCw, BarChart3, BookOpen, CheckCircle2, XCircle,
  Clock, Coins, Flame, Info, Lock
} from 'lucide-react';
import { loadNepseData, fetchFloorSheet, getCachedRealPriceHistory, fetchPriceHistory, fetchRealBrokerAnalysis } from '../utils/liveData';
import { generateDynamicStockCandles } from '../utils/accumulationDistributionEngine';
import {
  calculateConfluenceSR,
  calculateBreakoutQuality,
  calculateTrapProofLevels,
  calculateExitLiquiditySafety,
  type Candle,
  type T2TrapHazard,
  type BreakoutEvaluation,
  type TrapProofLevels,
  type ExitLiquiditySafety
} from '../utils/breakoutTrapEngine';

interface BreakoutTrapRadarProps {
  initialSymbol?: string;
  onSelectStock?: (stock: any) => void;
  onAskGuruAi?: (stock: any) => void;
}

export function BreakoutTrapRadar({
  initialSymbol,
  onSelectStock,
  onAskGuruAi
}: BreakoutTrapRadarProps) {
  const [activeTab, setActiveTab] = useState<'scanner' | 'audit' | 'playbook'>('scanner');
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStockSymbol, setSelectedStockSymbol] = useState(initialSymbol || 'NABIL');
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<any[]>([]);
  const [floorsheet, setFloorsheet] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'quality' | 'trapProb' | 'pChange' | 'turnover' | 'rvol'>('quality');

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
        console.error('Failed to load breakout radar data:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [initialSymbol]);

  // Dynamically fetch authentic price history for the inspected stock
  useEffect(() => {
    if (!selectedStockSymbol) return;
    const sym = selectedStockSymbol.toUpperCase();
    if (!getCachedRealPriceHistory(sym)) {
      fetchPriceHistory(sym, 60).catch(() => {});
    }
  }, [selectedStockSymbol]);

  // Compute Breakout & Trap Analysis for each stock
  const analyzedStocks = useMemo(() => {
    return stocks.map((s) => {
      const price = Number(s.ltp || s.closePrice || 100);
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

      const srLevels = calculateConfluenceSR(price, historyCandles, s.high52w, s.low52w, s);
      const breakoutEval = calculateBreakoutQuality(s, historyCandles, srLevels, floorsheet);
      const levels = calculateTrapProofLevels(price, srLevels, breakoutEval);
      const exitSafety = calculateExitLiquiditySafety(s);

      return {
        ...s,
        srLevels,
        breakoutEval,
        levels,
        exitSafety
      };
    });
  }, [stocks, floorsheet]);

  // Filtered & Sorted stocks
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

    if (selectedFilter === 'RETEST') {
      list = list.filter((s) => s.breakoutEval.t2Hazard === '🟢 PRIME_RETEST_ENTRY');
    } else if (selectedFilter === 'BREAKOUT') {
      list = list.filter((s) => s.breakoutEval.status === 'Confirmed Breakout');
    } else if (selectedFilter === 'TRAP') {
      list = list.filter((s) => s.breakoutEval.bullTrapProbability >= 55 || s.breakoutEval.status === 'Bull Trap (Rejection)');
    } else if (selectedFilter === 'BREAKDOWN') {
      list = list.filter((s) => s.breakoutEval.status === 'Support Breakdown' || s.exitSafety.exitTrapScore >= 75);
    } else if (selectedFilter === 'COIL') {
      list = list.filter((s) => s.breakoutEval.t2Hazard === '💤 PRE_BREAKOUT_COIL');
    }

    return list.sort((a, b) => {
      if (sortBy === 'quality') return b.breakoutEval.qualityScore - a.breakoutEval.qualityScore;
      if (sortBy === 'trapProb') return b.breakoutEval.bullTrapProbability - a.breakoutEval.bullTrapProbability;
      if (sortBy === 'pChange') return (b.pChange || 0) - (a.pChange || 0);
      if (sortBy === 'turnover') return (b.turnover || 0) - (a.turnover || 0);
      if (sortBy === 'rvol') return b.breakoutEval.rvol - a.breakoutEval.rvol;
      return 0;
    });
  }, [analyzedStocks, searchQuery, selectedFilter, sortBy]);

  // Active stock for Deep Audit
  const activeStock = useMemo(() => {
    return (
      analyzedStocks.find((s) => s.symbol === selectedStockSymbol) ||
      analyzedStocks[0] ||
      null
    );
  }, [analyzedStocks, selectedStockSymbol]);

  // Global summary statistics
  const stats = useMemo(() => {
    let retestCount = 0;
    let breakoutCount = 0;
    let trapCount = 0;
    let exitTrapCount = 0;

    analyzedStocks.forEach((s) => {
      if (s.breakoutEval.t2Hazard === '🟢 PRIME_RETEST_ENTRY') retestCount++;
      if (s.breakoutEval.status === 'Confirmed Breakout') breakoutCount++;
      if (s.breakoutEval.bullTrapProbability >= 55) trapCount++;
      if (s.exitSafety.exitTrapScore >= 75) exitTrapCount++;
    });

    return { retestCount, breakoutCount, trapCount, exitTrapCount };
  }, [analyzedStocks]);

  const getHazardBadgeStyle = (hazard: T2TrapHazard) => {
    if (hazard.includes('PRIME_RETEST')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.35)' };
    }
    if (hazard.includes('EXTREME_TRAP')) {
      return { bg: 'rgba(239, 68, 68, 0.18)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.35)' };
    }
    if (hazard.includes('HIGH_RISK')) {
      return { bg: 'rgba(249, 115, 22, 0.18)', text: '#f97316', border: 'rgba(249, 115, 22, 0.35)' };
    }
    if (hazard.includes('MODERATE')) {
      return { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: 'rgba(234, 179, 8, 0.35)' };
    }
    return { bg: 'rgba(148, 163, 184, 0.12)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' };
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-5 text-slate-100 space-y-5">
      {/* Top Banner & Header */}
      <div className="rounded-2xl p-5 border border-purple-500/20 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                Support, Resistance & Confluence
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                T+2 Trap & Zero-Bid Exit Guard
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Zap className="w-7 h-7 text-purple-400" />
              Breakout, Entry/Exit & Trap Radar
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              ब्रेकआउट तथा प्रवेश/निकास विश्लेषक: Filter out Day-1 circuit traps, identify high-conviction T+2 retests, and protect against zero-bid exit lockups.
            </p>
          </div>

          {/* Quick Tab Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 self-start md:self-auto">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'scanner'
                  ? 'bg-purple-500 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" /> Trap Scanner
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-purple-500 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Deep Audit
            </button>
            <button
              onClick={() => setActiveTab('playbook')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'playbook'
                  ? 'bg-purple-500 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Trader Playbook
            </button>
          </div>
        </div>

        {/* Global Summary Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Prime T+2 Retest Setups
            </div>
            <div className="text-xl font-black text-emerald-400 mt-1">{stats.retestCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">High probability, dry volume</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" /> Active Resistance Breakouts
            </div>
            <div className="text-xl font-black text-blue-400 mt-1">{stats.breakoutCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">Decisive clearance beyond pivot</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Bull Trap Warnings
            </div>
            <div className="text-xl font-black text-red-400 mt-1">{stats.trapCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">Upper wick rejection / broker dump</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-400" /> Exit Trap / Zero-Bid Risk
            </div>
            <div className="text-xl font-black text-orange-400 mt-1">{stats.exitTrapCount} <span className="text-xs text-slate-400 font-normal">stocks</span></div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">Illiquid book, cannot exit on drops</div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: BREAKOUT & TRAP SCANNER                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'scanner' && (
        <div className="space-y-4">
          {/* Controls: Search, Stage Filter, Sort */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol, company or sector (e.g. NABIL, HIDCL, NRIC)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'RETEST', label: '🟢 Prime Retest', color: 'emerald' },
                { id: 'BREAKOUT', label: '⚡ Breakout', color: 'blue' },
                { id: 'TRAP', label: '🚨 Bull Trap Warning', color: 'red' },
                { id: 'BREAKDOWN', label: '🔴 Exit Trap Risk', color: 'orange' },
                { id: 'COIL', label: '💤 Coiling', color: 'slate' }
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setSelectedFilter(btn.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedFilter === btn.id
                      ? 'bg-purple-600 text-white font-bold border border-purple-500'
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
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="quality">Breakout Quality Score</option>
                <option value="trapProb">Highest Bull Trap Risk</option>
                <option value="pChange">% Change</option>
                <option value="turnover">Daily Turnover</option>
                <option value="rvol">Relative Volume (RVOL)</option>
              </select>
            </div>
          </div>

          {/* Results Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <th className="py-3 px-4">Symbol / Company</th>
                    <th className="py-3 px-3 text-right">LTP (Rs.)</th>
                    <th className="py-3 px-3 text-right">Change</th>
                    <th className="py-3 px-3">Breakout Status</th>
                    <th className="py-3 px-3 text-right">RVOL</th>
                    <th className="py-3 px-3">T+2 Settlement Hazard</th>
                    <th className="py-3 px-3 text-center">Bull Trap Risk</th>
                    <th className="py-3 px-3 text-right">Retest Entry Zone</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredStocks.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        {loading ? 'Evaluating resistance breaches and bull traps...' : 'No stocks matching the selected filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredStocks.slice(0, 50).map((stock) => {
                      const hazardStyle = getHazardBadgeStyle(stock.breakoutEval.t2Hazard);
                      const isTrapSevere = stock.breakoutEval.bullTrapProbability >= 55;

                      return (
                        <tr
                          key={stock.symbol}
                          className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                          onClick={() => {
                            setSelectedStockSymbol(stock.symbol);
                            setActiveTab('audit');
                          }}
                        >
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-white group-hover:text-purple-400 transition-colors">
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
                            <div className="font-bold text-white">
                              {stock.breakoutEval.status}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Pivot: Rs. {stock.breakoutEval.level}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-200">
                            <span className={stock.breakoutEval.rvol >= 1.4 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                              {stock.breakoutEval.rvol.toFixed(2)}x
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-bold border"
                              style={{
                                backgroundColor: hazardStyle.bg,
                                color: hazardStyle.text,
                                borderColor: hazardStyle.border
                              }}
                            >
                              {stock.breakoutEval.t2Hazard.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-16 bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    isTrapSevere ? 'bg-red-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${stock.breakoutEval.bullTrapProbability}%` }}
                                />
                              </div>
                              <span
                                className={`text-[10px] font-bold ${
                                  isTrapSevere ? 'text-red-400' : 'text-emerald-400'
                                }`}
                              >
                                {stock.breakoutEval.bullTrapProbability}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-300">
                            Rs. {stock.levels.conservativeRetestZone.low} - {stock.levels.conservativeRetestZone.high}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStockSymbol(stock.symbol);
                                setActiveTab('audit');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-800 hover:bg-purple-500 hover:text-white text-slate-300 transition-colors border border-slate-700"
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
              <span>Auditing resistance breaches against T+2 delivery delays and zero-bid lower circuit risks.</span>
              <span className="font-semibold text-slate-300">Click any row for complete Breakout & Exit Audit</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: DEEP BREAKOUT & EXIT AUDIT                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && activeStock && (
        <div className="space-y-4">
          {/* Stock Search Bar */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Inspecting Stock:</span>
              <div className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  placeholder="Switch Symbol (e.g. NABIL, HIDCL)..."
                  value={selectedStockSymbol}
                  onChange={(e) => setSelectedStockSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-extrabold focus:outline-none focus:border-purple-500 uppercase"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onSelectStock && (
                <button
                  onClick={() => onSelectStock(activeStock)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Open Stock Modal
                </button>
              )}
              {onAskGuruAi && (
                <button
                  onClick={() => onAskGuruAi(activeStock)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 hover:opacity-95 text-white transition-opacity"
                >
                  Ask Guru AI About {activeStock.symbol} Breakout
                </button>
              )}
            </div>
          </div>

          {/* Hero Setup Card */}
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
                    Turnover: Rs. {((activeStock.turnover || 0) / 100000).toFixed(2)} Lakhs
                  </span>
                </div>
              </div>

              {/* T+2 Settlement Hazard Badge */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg border"
                  style={getHazardBadgeStyle(activeStock.breakoutEval.t2Hazard)}
                >
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">T+2 Settlement Hazard Rating</div>
                  <div className="text-sm font-extrabold text-white">
                    {activeStock.breakoutEval.t2Hazard.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs font-semibold text-purple-400">
                    Breakout Status: {activeStock.breakoutEval.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Actionable Guidance (Nepali & English) */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-500/20 space-y-2">
              <div className="text-xs font-bold text-purple-400 flex items-center gap-1.5 uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4" /> Actionable Trader Guidance (रणनीतिक सल्लाह)
              </div>
              <div className="text-sm font-semibold text-slate-100">
                🇳🇵 {activeStock.levels.actionableNepali}
              </div>
              <div className="text-xs text-slate-400">
                🇬🇧 {activeStock.levels.actionableEnglish}
              </div>
            </div>

            {/* Dual Diagnostic Grid: Breakout Quality vs S/R Confluence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Box 1: Breakout & Trap Metrics */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  1. Breakout Quality & Bull Trap Metrics
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Breakout Quality Score</span>
                    <span className="font-black text-purple-400">
                      {activeStock.breakoutEval.qualityScore} / 100
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Bull Trap Probability</span>
                    <span
                      className={`font-black ${
                        activeStock.breakoutEval.bullTrapProbability >= 55 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {activeStock.breakoutEval.bullTrapProbability}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Relative Volume (RVOL)</span>
                    <span className="font-bold text-white">
                      {activeStock.breakoutEval.rvol}x {activeStock.breakoutEval.volumeConfirmed ? '✓ Confirmed' : '⚠️ Low Conviction'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Upper Rejection Wick Ratio</span>
                    <span className="font-bold text-slate-200">
                      {(activeStock.breakoutEval.upperWickRatio * 100).toFixed(0)}% {activeStock.breakoutEval.upperWickRatio >= 0.38 ? '⚠️ High Upper Wick' : '✓ Clean Body'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: Support & Resistance Confluence */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  2. Confluence Support & Resistance Clusters
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Nearest Resistance Cluster</span>
                    <span className="font-black text-red-400">
                      Rs. {activeStock.srLevels.nearestResistance?.price || '—'} ({activeStock.srLevels.nearestResistance?.strength || 60}% strength)
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Resistance Sources</span>
                    <span className="font-bold text-slate-300">
                      {activeStock.srLevels.nearestResistance?.sources?.join(', ') || 'Range Peak'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Nearest Support Cluster</span>
                    <span className="font-black text-emerald-400">
                      Rs. {activeStock.srLevels.nearestSupport?.price || '—'} ({activeStock.srLevels.nearestSupport?.strength || 60}% strength)
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Support Sources</span>
                    <span className="font-bold text-slate-300">
                      {activeStock.srLevels.nearestSupport?.sources?.join(', ') || 'Floor Base'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dual Entry Plan & Asymmetric RRR */}
            <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/20 space-y-3">
              <div className="text-xs font-bold text-emerald-400 flex items-center justify-between uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Target className="w-4 h-4" /> Dual Entry & Risk-Reward Plan (प्रवेश तथा लक्ष्य योजना)</span>
                <span className="text-[11px] font-semibold text-slate-400">Recommended: {activeStock.levels.recommendedEntry}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Entry 1: Conservative Retest */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-emerald-500/30">
                  <div className="text-slate-400 font-medium">1. Conservative T+2 Retest Entry</div>
                  <div className="text-base font-black text-emerald-400 mt-1">
                    Rs. {activeStock.levels.conservativeRetestZone.low} - {activeStock.levels.conservativeRetestZone.high}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">High probability, minimizes T+2 trap</div>
                </div>

                {/* Entry 2: Aggressive Breakout */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400 font-medium">2. Aggressive Breakout Entry</div>
                  <div className="text-base font-bold text-white mt-1">
                    Rs. {activeStock.levels.aggressiveEntryZone.low} - {activeStock.levels.aggressiveEntryZone.high}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Direct momentum chase (Higher risk)</div>
                </div>

                {/* Statutory Breakeven */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-slate-400 font-medium">3. Statutory Zero-Loss Breakeven</div>
                  <div className="text-base font-bold text-yellow-400 mt-1">
                    Rs. {activeStock.levels.statutoryBreakevenPrice}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">+{activeStock.levels.statutoryHurdlePct}% needed to clear SEBON/Broker fees</div>
                </div>
              </div>

              {/* Targets and Stop Loss */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-800">
                <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/40">
                  <span className="text-slate-400">Stop Loss</span>
                  <span className="font-black text-red-400">Rs. {activeStock.levels.stopLossPrice} ({activeStock.levels.stopLossPct}%)</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/40">
                  <span className="text-slate-400">Target 1</span>
                  <span className="font-black text-emerald-400">Rs. {activeStock.levels.target1Price} (+{activeStock.levels.target1UpsidePct}%) [RRR: {activeStock.levels.rrr1}x]</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/40">
                  <span className="text-slate-400">Target 2</span>
                  <span className="font-black text-emerald-400">Rs. {activeStock.levels.target2Price} (+{activeStock.levels.target2UpsidePct}%) [RRR: {activeStock.levels.rrr2}x]</span>
                </div>
              </div>
            </div>

            {/* Exit Liquidity Guard */}
            <div className="p-4 rounded-xl bg-slate-950 border border-orange-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-orange-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <ShieldAlert className="w-4 h-4" /> Zero-Bid Exit Trap Guard (निकास सुरक्षा जाँच)
                </div>
                <span className="text-xs font-bold text-slate-300">
                  Tier: {activeStock.exitSafety.exitSafetyTier}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeStock.exitSafety.warningNepali}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: TRADER PLAYBOOK & TRAPS GUIDE                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'playbook' && (
        <div className="space-y-5">
          {/* Section 1: The Fatal T+2 Breakout Trap */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              नेपालको बजारमा ब्रेकआउट किन 'ट्र्याप' बन्छ? (The Fatal T+2 Breakout Trap)
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              अन्तर्राष्ट्रिय बजारमा ब्रेकआउट असफल हुँदा केही सेकेन्डमै स्टप लसमा बेच्न सकिन्छ। तर <strong>नेपालको NEPSE मा T+2 नियम</strong> भएकोले दिन-१ मा सर्किट हान्दा किन्ने लगानीकर्ताहरू २ देखि ३ दिनसम्म बन्धक हुन्छन्:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-red-500/20">
                <div className="text-xs font-bold text-red-400 mb-1">१. पहिलो दिन: FOMO सर्किट चेस</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  अपरेटरले बिहानै १०% सर्किट लगाएर सेयर पम्प गर्छ। खुद्रा लगानीकर्ताले ब्रेकआउट ठानेर सर्किटमा किन्छन्। तर सेयर तुरुन्त डिम्याटमा आउँदैन।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-orange-500/20">
                <div className="text-xs font-bold text-orange-400 mb-1">२. दोस्रो दिन: अपरेटर डम्प सुरु</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  अपरेटरले आफूसँग पहिले नै रहेको पुरानो कित्ता बजारमा फाल्न थाल्छ। मूल्य घटेर -५% पुग्छ। हिजो किन्नेले बेच्न पाउँदैनन् किनकि सेयर हातमा छैन।
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-purple-500/20">
                <div className="text-xs font-bold text-purple-400 mb-1">३. तेस्रो दिन: लोअर सर्किट र फस्ने अवस्था</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  साँझ मात्र MeroShare मा सेयर आउँछ। तर भोलिपल्ट बजार खुल्दा -१०% लोअर सर्किट लाग्छ र खरिदकर्ता शून्य (Zero Bids) हुन्छ। लगानीकर्ता २५-३०% नोक्सानीमा फस्छन्।
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: The T+2 Retest Rule */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/20 space-y-4">
            <h2 className="text-xl font-black text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              T+2 रि-टेस्ट नियम: सुरक्षित प्रवेशको सूत्र (The T+2 Retest Playbook)
            </h2>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-emerald-400">नियम १: पहिलो दिन कहिल्यै नकिन्नुहोस् (Never Chase Day 1)</span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  ब्रेकआउट भएको दिन शेयर सर्किट वा +७-१०% मा पुगिसकेको हुन्छ। त्यहाँ किन्दा फाइदा भन्दा T+2 डम्पको जोखिम धेरै हुन्छ।
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-blue-400">नियम २: तेस्रो वा चौथो दिन कुर्नुहोस् (Wait for T+2 Delivery Supply)</span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  पहिलो दिन किन्नेहरूको शेयर T+2 मा आउँछ। उनीहरूले नाफा बुक गर्दा बजार हल्का घट्छ (पुलब्याक)। यदि पुरानो रेसिस्टेन्सलाई सपोर्ट बनाएर घट्दो भोल्युममा बजार थामिन्छ भने मात्र त्यो **सुरक्षित रि-टेस्ट (Prime Retest)** हो।
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="font-bold text-yellow-400">नियम ३: स्ट्याच्युटरी शुल्क जोडेर मात्र ब्रेकइभेन हेर्नुहोस् (Statutory Breakeven)</span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  ब्रोकर कमिसन (०.२४%-०.३६%), सेबोन शुल्क (०.०१५%), डीपी (रु. २५) र पुँजीगत लाभकरले गर्दा कम्तिमा +१% बढेपछि मात्र नाफा सुरु हुन्छ। त्यसैले १:२.५ भन्दा बढीको Risk-Reward हुनु अनिवार्य छ।
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default BreakoutTrapRadar;
