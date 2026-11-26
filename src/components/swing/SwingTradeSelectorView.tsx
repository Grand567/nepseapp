import React, { useState, useMemo } from 'react';
import {
  ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Target, TrendingUp,
  BarChart3, BookOpen, Lock, Scale, RefreshCw, SlidersHorizontal, Layers,
  Search, Info, ExternalLink, Shield, Flame, Activity, Clock, DollarSign,
  ChevronRight, ChevronDown, Check, ArrowUpRight, ArrowDownRight, ArrowLeft
} from 'lucide-react';
import { StatCard, InfoBanner, Spinner } from '../ui';
import { FlowchartV3Panel } from './FlowchartV3Panel';
import {
  evaluateMarketRegimeGate,
  evaluateStockSwingGates,
  screenUniverseForSwingPicks,
  GATE_NAMES
} from '../../utils/swingGateEvaluator.js';
import backtestResultsData from '../../data/swingBacktestResults.json';
import { CIRCUIT_LIMITS, STATUTORY_CHARGES } from '../../constants/marketRules.js';
import { isPureNepseEquity } from '../../utils/nepseEquityFilter.js';
import { getPaperState, calculateSandboxSummary } from '../../utils/paperTrading.js';

interface SwingTradeSelectorViewProps {
  stocks?: any[];
  indices?: any;
  onSelectStock?: (stock: any) => void;
  onBack?: () => void;
}

export default function SwingTradeSelectorView({
  stocks = [],
  indices,
  onSelectStock,
  onBack
}: SwingTradeSelectorViewProps) {
  const [activeTab, setActiveTab] = useState<'top-picks' | 'backtest-audit' | 'paper-trading'>('top-picks');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStockForAudit, setSelectedStockForAudit] = useState<string>('ALL');
  const [expandedScrip, setExpandedScrip] = useState<string | null>(null);

  const equityStocks = useMemo(() => {
    return (Array.isArray(stocks) ? stocks : []).filter(s => s && s.symbol && isPureNepseEquity(s));
  }, [stocks]);

  // Derive market context strictly from live equities + live NEPSE index telemetry
  const marketContext = useMemo(() => {
    const nepseIdx = indices?.nepse || indices?.NEPSE || {};
    const nepseIndex = Number(nepseIdx?.indexValue || nepseIdx?.currentValue || nepseIdx?.close || nepseIdx?.value || 0);
    const nepseEma20 = Number(nepseIdx?.ema20 || nepseIdx?.sma20 || 0);
    const nepseEma50 = Number(nepseIdx?.ema50 || nepseIdx?.sma50 || 0);
    const idxDailyPct = nepseIdx?.pChange != null ? Number(nepseIdx.pChange) : null;

    if (equityStocks.length === 0) {
      return {
        nepseIndex,
        nepseEma20,
        nepseEma50,
        advancers: 0,
        decliners: 0,
        dailyChangePct: idxDailyPct ?? 0,
        pctAboveEma50: 0
      };
    }

    const adv = equityStocks.filter(s => (Number(s.pChange || 0)) > 0).length;
    const dec = equityStocks.filter(s => (Number(s.pChange || 0)) < 0).length;
    const total = equityStocks.length;
    const avgChange = idxDailyPct != null
      ? idxDailyPct
      : (total > 0 ? (equityStocks.reduce((acc, s) => acc + Number(s.pChange || 0), 0) / total) : 0);

    // Compute pctAboveEma50 strictly from equities with verified ema50/sma50
    const stocksWithEma50 = equityStocks.filter(s => {
      const ema = Number(s.ema50 ?? s.sma50 ?? 0);
      const ltp = Number(s.ltp ?? s.close ?? 0);
      return ema > 0 && ltp > 0;
    });
    const aboveEma50Count = stocksWithEma50.filter(s => {
      const ema = Number(s.ema50 ?? s.sma50 ?? 0);
      const ltp = Number(s.ltp ?? s.close ?? 0);
      return ltp > ema;
    }).length;
    const pctAboveEma50 = stocksWithEma50.length > 0
      ? Math.round((aboveEma50Count / stocksWithEma50.length) * 100)
      : 0;

    return {
      nepseIndex,
      nepseEma20,
      nepseEma50,
      advancers: adv,
      decliners: dec,
      dailyChangePct: avgChange,
      pctAboveEma50
    };
  }, [equityStocks, indices]);

  // Screen available ordinary equities with canonical 7 gates
  const screeningResult = useMemo(() => {
    return screenUniverseForSwingPicks(equityStocks, marketContext);
  }, [equityStocks, marketContext]);

  // Filtered stocks for list display (no synthetic 5-stock mock fallback)
  const displayStocks = useMemo(() => {
    const list = equityStocks;
    if (!searchQuery) return list;
    const q = searchQuery.toUpperCase().trim();
    return list.filter(s => (s.symbol || '').toUpperCase().includes(q));
  }, [equityStocks, searchQuery]);

  // Memoize stock evaluation so typing in search does not recompute for 250+ equities
  const evaluatedDisplayStocks = useMemo(() => {
    return displayStocks.map(stock => ({
      stock,
      evalResult: evaluateStockSwingGates(stock, screeningResult.marketRegime)
    }));
  }, [displayStocks, screeningResult.marketRegime]);

  const formatNprPnL = (val: number) => {
    const num = Number(val || 0);
    const isNeg = num < 0;
    const absK = (Math.abs(num) / 1000).toFixed(1);
    return `${isNeg ? '-Rs. ' : '+Rs. '}${absK}k`;
  };

  const paperSummary = useMemo(() => {
    const priceMap: Record<string, number> = {};
    equityStocks.forEach((s) => {
      if (s?.symbol && Number(s?.ltp) > 0) priceMap[String(s.symbol).toUpperCase()] = Number(s.ltp);
    });
    const st = getPaperState();
    return calculateSandboxSummary(st, priceMap);
  }, [equityStocks, activeTab]);

  // Audit data from backtestResultsData
  const backtest = backtestResultsData;
  const closedTrades = backtest.closedTrades || [];

  const uniqueAuditSymbols = useMemo(() => {
    const syms = new Set<string>();
    closedTrades.forEach(t => syms.add(t.symbol));
    return Array.from(syms).sort();
  }, [closedTrades]);

  const filteredClosedTrades = useMemo(() => {
    if (selectedStockForAudit === 'ALL') return closedTrades;
    return closedTrades.filter(t => t.symbol === selectedStockForAudit);
  }, [closedTrades, selectedStockForAudit]);

  const stockSpecificAuditStats = useMemo(() => {
    if (selectedStockForAudit === 'ALL') return null;
    const trades = filteredClosedTrades;
    const wins = trades.filter(t => t.netProfitNpr > 0).length;
    const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0.0';
    const netPnl = trades.reduce((acc, t) => acc + (t.netProfitNpr || 0), 0);
    const grossPnl = trades.reduce((acc, t) => acc + (t.grossProfitNpr || 0), 0);
    const fees = trades.reduce((acc, t) => acc + (t.frictionNpr || 0), 0);
    return { count: trades.length, wins, losses: trades.length - wins, winRate, netPnl, grossPnl, fees };
  }, [filteredClosedTrades, selectedStockForAudit]);

  return (
    <div className="space-y-6 pb-16 text-slate-100 max-w-6xl mx-auto px-2 sm:px-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700/80 transition cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>बन्द गर्नुहोस् (Back)</span>
        </button>
      )}
      {/* 1. OFFICIAL FIDUCIARY VERDICT BANNER */}
      <div className="rounded-2xl border-2 border-rose-500/50 bg-rose-950/30 p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3.5 w-3.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs font-black tracking-widest uppercase text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20">
                OFFICIAL FIDUCIARY VERDICT
              </span>
              <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                🔬 PAPER-TRADING MODE ONLY
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              🔴 NO EDGE: do not trade this system
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Multi-year walk-forward backtesting across 40 closed trades with strict statutory frictions (5-tier broker commission, SEBON 0.015%, DP fee Rs. 25, 5.0% ST / 3.75% LT CGT) produced a <strong className="text-rose-300 font-bold">Profit Factor of 0.45x</strong> and net loss of <strong className="text-rose-300 font-bold">-Rs. 226,739.06</strong>. Per fiduciary protocol, this strategy is locked into simulation mode until empirical edge exceeds 1.25x across 200+ samples.
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end justify-center bg-slate-900/80 p-3 rounded-xl border border-slate-800 shrink-0">
            <span className="text-[11px] text-slate-400 font-medium">Validation Status</span>
            <span className="text-sm font-black text-rose-400">UNPROVEN / NEGATIVE EDGE</span>
            <span className="text-[10px] text-slate-400 mt-1">Sample N = 40 (Min required: 200)</span>
          </div>
        </div>

        {/* Mandatory Research & Loss Warning */}
        <div className="mt-4 pt-3 border-t border-rose-500/20 flex items-start gap-2 text-xs text-amber-200/90">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Mandatory Fiduciary Warning:</strong> Research and education tool only. Not financial advice. Past simulated performance does not guarantee future live returns. NEPSE swing trading carries significant cost drag and real capital loss risk.
          </span>
        </div>
      </div>

      {/* 2. SUB-VIEW NAVIGATION TABS */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('top-picks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-all ${
            activeTab === 'top-picks'
              ? 'bg-slate-800/80 text-white border-b-2 border-emerald-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
          }`}
        >
          <Target size={16} className={activeTab === 'top-picks' ? 'text-emerald-400' : 'text-slate-400'} />
          Top Picks (Live 7-Gate Shortlist)
        </button>
        <button
          onClick={() => setActiveTab('backtest-audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-all ${
            activeTab === 'backtest-audit'
              ? 'bg-slate-800/80 text-white border-b-2 border-rose-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
          }`}
        >
          <BarChart3 size={16} className={activeTab === 'backtest-audit' ? 'text-rose-400' : 'text-slate-400'} />
          Backtest Audit & Walk-Forward
        </button>
        <button
          onClick={() => setActiveTab('paper-trading')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-all ${
            activeTab === 'paper-trading'
              ? 'bg-slate-800/80 text-white border-b-2 border-blue-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
          }`}
        >
          <BookOpen size={16} className={activeTab === 'paper-trading' ? 'text-blue-400' : 'text-slate-400'} />
          Paper-Trading Ledger (4–8 Weeks)
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: TOP PICKS (LIVE 7-GATE SHORTLIST)
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'top-picks' && (
        <div className="space-y-6">
          <FlowchartV3Panel onSelectStock={onSelectStock} />

          {/* Gate 2: Market Regime Status Bar */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${screeningResult.isDefensiveCashMode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                  {screeningResult.isDefensiveCashMode ? <Shield size={20} /> : <TrendingUp size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-slate-400">Gate 2: Market Regime Gate</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${screeningResult.isDefensiveCashMode ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {screeningResult.isDefensiveCashMode ? 'DEFENSIVE CASH' : 'REGIME APPROVED'}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                    {screeningResult.statusHeadline}
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400 block text-[10px]">Adv / Dec</span>
                  <span className="font-bold text-emerald-400">{marketContext.advancers}</span> : <span className="font-bold text-rose-400">{marketContext.decliners}</span>
                </div>
                <div className="border-l border-slate-800 pl-3">
                  <span className="text-slate-400 block text-[10px]">Index Trend</span>
                  <span className="font-bold text-slate-200">
                    {marketContext.nepseIndex > 0 && marketContext.nepseEma50 > 0
                      ? (marketContext.nepseIndex >= marketContext.nepseEma20 && marketContext.nepseIndex >= marketContext.nepseEma50
                          ? '20 & 50 EMA Support'
                          : marketContext.nepseIndex >= marketContext.nepseEma50
                            ? 'Above 50 EMA'
                            : 'Below 50 EMA (Defensive)')
                      : (marketContext.dailyChangePct >= 0 ? 'Advancing' : 'Declining')}
                  </span>
                </div>
              </div>
            </div>

            {/* Defensive Mode Advisory */}
            {screeningResult.isDefensiveCashMode && (
              <div className="mt-3 p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
                <span>
                  <strong>Capital Protection Rule Active:</strong> When NEPSE index trend is broken or breadth is negative, zero new buy setups are permitted. Our ablation testing proved taking breakouts in bear regimes increased losses by 4x (-Rs. 854k vs -Rs. 226k).
                </span>
              </div>
            )}
          </div>

          {/* Search & Scrip Gate Evaluator */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">Full-Universe 7-Gate Inspection</h2>
                <p className="text-xs text-slate-400">
                  Every scrip is tested against Multi-Timeframe, Regime, Liquidity, RVOL Breakout, Quality, Broker Flow & 2:1 R:R.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search scrip symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {/* Scrip Cards / Table */}
            <div className="space-y-3">
              {evaluatedDisplayStocks.map(({ stock, evalResult }) => {
                const isExpanded = expandedScrip === stock.symbol;

                return (
                  <div
                    key={stock.symbol}
                    className="rounded-xl border border-slate-800/80 bg-slate-900/50 overflow-hidden hover:border-slate-700 transition-all"
                  >
                    <div
                      onClick={() => setExpandedScrip(isExpanded ? null : stock.symbol)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${
                          evalResult.allGatesPassed
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}>
                          {stock.symbol.slice(0, 4)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{stock.symbol}</span>
                            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              {evalResult.sector}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              evalResult.allGatesPassed
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {evalResult.gatesPassedCount}/7 Gates Passed
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                            <span>LTP: <strong className="text-white">Rs. {Number(stock.ltp || stock.close || 0).toFixed(1)}</strong></span>
                            <span className={Number(stock.pChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {Number(stock.pChange || 0) >= 0 ? '+' : ''}{Number(stock.pChange || 0).toFixed(2)}%
                            </span>
                            <span>Turnover: Rs. {((Number(stock.turnover || 0))/100000).toFixed(1)}L</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        {onSelectStock && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectStock(stock);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 cursor-pointer transition active:scale-95"
                          >
                            Details ↗
                          </button>
                        )}
                        <div className="text-right">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                            evalResult.allGatesPassed
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                          }`}>
                            {evalResult.allGatesPassed ? 'APPROVED (PAPER ONLY)' : 'REJECTED'}
                          </span>
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {/* Expanded 7-Gate Inspection Details */}
                    {isExpanded && (
                      <div className="p-4 bg-slate-950/60 border-t border-slate-800 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {evalResult.gates.map((g, idx) => (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                                g.passed
                                  ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200'
                                  : 'bg-rose-950/20 border-rose-500/20 text-rose-200'
                              }`}
                            >
                              {g.passed ? (
                                <CheckCircle2 size={15} className="shrink-0 text-emerald-400 mt-0.5" />
                              ) : (
                                <XCircle size={15} className="shrink-0 text-rose-400 mt-0.5" />
                              )}
                              <div>
                                <span className="font-bold block text-slate-100">{idx + 1}. {g.name}</span>
                                <span className="text-[11px] text-slate-300">{g.reason}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Trade Plan (If Approved) */}
                        {evalResult.allGatesPassed && evalResult.plan && (
                          <div className="mt-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black uppercase text-emerald-400">
                                Validated Risk-Engineered Trade Plan (Net R:R ≥ 2:1)
                              </span>
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                                T+2 Demat Lock Active
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                                <span className="text-slate-400 block text-[10px]">Entry Zone</span>
                                <span className="font-bold text-white">Rs. {evalResult.plan.entryZone[0]} – {evalResult.plan.entryZone[1]}</span>
                              </div>
                              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                                <span className="text-slate-400 block text-[10px]">Technical Stop</span>
                                <span className="font-bold text-rose-400">Rs. {evalResult.plan.stopLoss} (-{evalResult.plan.stopLossPct}%)</span>
                              </div>
                              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                                <span className="text-slate-400 block text-[10px]">Target 1 (+1.5R)</span>
                                <span className="font-bold text-emerald-400">Rs. {evalResult.plan.target1} (Bank 50%)</span>
                              </div>
                              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                                <span className="text-slate-400 block text-[10px]">Target 2 (+2.5R)</span>
                                <span className="font-bold text-emerald-300">Rs. {evalResult.plan.target2} (Trail)</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-500/20 text-xs text-slate-300">
                              <span>Net R:R After Costs: <strong className="text-emerald-400">{evalResult.plan.netRewardRiskRatio}:1</strong></span>
                              <span>Recommended Size: <strong className="text-white">{evalResult.plan.recommendedQuantity} shares</strong> (~Rs. {(evalResult.plan.totalAllocatedCapital/1000).toFixed(0)}k)</span>
                              <span>Time Stop: <strong className="text-amber-300">{evalResult.plan.maxHoldingSessions} sessions</strong></span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: BACKTEST AUDIT & WALK-FORWARD METRICS
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'backtest-audit' && (
        <div className="space-y-6">
          {/* Executive Metrics Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Total Closed Trades</span>
              <div className="text-xl font-black text-white mt-1">{backtest.fullSystem.totalTrades}</div>
              <span className="text-[10px] text-rose-400">Min 200 required for validity</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Win Rate</span>
              <div className="text-xl font-black text-rose-400 mt-1">{backtest.fullSystem.winRatePct}%</div>
              <span className="text-[10px] text-slate-400">{backtest.fullSystem.winningTrades} wins / {backtest.fullSystem.losingTrades} losses</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Profit Factor</span>
              <div className="text-xl font-black text-rose-400 mt-1">{backtest.fullSystem.profitFactor}x</div>
              <span className="text-[10px] text-rose-400">Negative edge (&lt; 1.0)</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Net Realized PnL</span>
              <div className={`text-xl font-black mt-1 ${backtest.fullSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatNprPnL(backtest.fullSystem.netPnLNpr)}
              </div>
              <span className="text-[10px] text-slate-400">Fee drag: Rs. {(backtest.fullSystem.totalFrictionNpr/1000).toFixed(1)}k</span>
            </div>
          </div>

          {/* Ablation Comparison Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Scale size={16} className="text-amber-400" />
              Ablation Testing: Demonstrating Gate Contribution
            </h3>
            <p className="text-xs text-slate-400">
              Systematic ablation proves which gates defend capital and which add unnecessary friction.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">System Architecture</th>
                    <th className="py-2.5 px-3 text-center">Trades</th>
                    <th className="py-2.5 px-3 text-center">Win Rate</th>
                    <th className="py-2.5 px-3 text-center">Profit Factor</th>
                    <th className="py-2.5 px-3 text-right">Net PnL</th>
                    <th className="py-2.5 px-3 text-right">Friction Drag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  <tr className="bg-emerald-950/10">
                    <td className="py-2.5 px-3 font-bold text-white">Full 7-Gate System (Candidate 1)</td>
                    <td className="py-2.5 px-3 text-center">{backtest.fullSystem.totalTrades}</td>
                    <td className="py-2.5 px-3 text-center">{backtest.fullSystem.winRatePct}%</td>
                    <td className={`py-2.5 px-3 text-center font-bold ${backtest.fullSystem.profitFactor >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>{backtest.fullSystem.profitFactor}x</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${backtest.fullSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatNprPnL(backtest.fullSystem.netPnLNpr)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">Rs. {(backtest.fullSystem.totalFrictionNpr/1000).toFixed(1)}k</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-rose-300">Without Market Regime Gate (Ablation 1)</td>
                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noRegimeSystem.totalTrades}</td>
                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noRegimeSystem.winRatePct}%</td>
                    <td className={`py-2.5 px-3 text-center font-bold ${backtest.ablations.noRegimeSystem.profitFactor >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>{backtest.ablations.noRegimeSystem.profitFactor}x</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${backtest.ablations.noRegimeSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatNprPnL(backtest.ablations.noRegimeSystem.netPnLNpr)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">Rs. {(backtest.ablations.noRegimeSystem.totalFrictionNpr/1000).toFixed(1)}k</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-slate-300">Without Broker Flow Gate (Ablation 2)</td>
                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noBrokerSystem.totalTrades}</td>
                    <td className="py-2.5 px-3 text-center">{backtest.ablations.noBrokerSystem.winRatePct}%</td>
                    <td className={`py-2.5 px-3 text-center font-bold ${backtest.ablations.noBrokerSystem.profitFactor >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>{backtest.ablations.noBrokerSystem.profitFactor}x</td>
                    <td className={`py-2.5 px-3 text-right font-bold ${backtest.ablations.noBrokerSystem.netPnLNpr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatNprPnL(backtest.ablations.noBrokerSystem.netPnLNpr)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">Rs. {(backtest.ablations.noBrokerSystem.totalFrictionNpr/1000).toFixed(1)}k</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs text-slate-300">
              <strong className="text-white">Empirical Takeaway:</strong> Removing Gate 2 (Market Regime) quadrupled net losses from -Rs. 226k to -Rs. 854k across 103 trades, empirically proving that sitting in cash when the index is below 50 EMA is essential to capital preservation in NEPSE.
            </div>
          </div>

          {/* Interactive Stock History Deep-Dive Inspector */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Search size={16} className="text-emerald-400" />
                  Stock History Deep-Dive Inspector (Historical Strategy Audit)
                </h3>
                <p className="text-xs text-slate-400">
                  Inspect every historical swing trade generated for any stock in our chronological dataset.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Filter Stock:</span>
                <select
                  value={selectedStockForAudit}
                  onChange={(e) => setSelectedStockForAudit(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-xs text-white px-3 py-1.5 rounded-lg focus:outline-none"
                >
                  <option value="ALL">All Scrips ({uniqueAuditSymbols.length})</option>
                  {uniqueAuditSymbols.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scrip Specific Summary Bar */}
            {stockSpecificAuditStats && (
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Symbol</span>
                  <span className="font-bold text-white">{selectedStockForAudit}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Historical Signals</span>
                  <span className="font-bold text-slate-200">{stockSpecificAuditStats.count} trades</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Win Rate</span>
                  <span className={`font-bold ${Number(stockSpecificAuditStats.winRate) >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {stockSpecificAuditStats.winRate}% ({stockSpecificAuditStats.wins}W / {stockSpecificAuditStats.losses}L)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Net Realized PnL</span>
                  <span className={`font-bold ${stockSpecificAuditStats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Rs. {stockSpecificAuditStats.netPnl.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Friction Paid</span>
                  <span className="font-bold text-slate-400">Rs. {stockSpecificAuditStats.fees.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Trade Log Table */}
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800 uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Symbol</th>
                    <th className="py-2.5 px-3">Signal &rarr; Fill</th>
                    <th className="py-2.5 px-3">Exit Date</th>
                    <th className="py-2.5 px-3 text-right">Entry / Exit</th>
                    <th className="py-2.5 px-3 text-center">Holding</th>
                    <th className="py-2.5 px-3">Exit Reason</th>
                    <th className="py-2.5 px-3 text-right">Net Return</th>
                    <th className="py-2.5 px-3 text-right">Net PnL (NPR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {filteredClosedTrades.map((t) => {
                    const isWin = (t.netProfitNpr || 0) > 0;
                    return (
                      <tr key={t.tradeId} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-bold text-white">{t.symbol}</td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {t.signalDate} &rarr; <span className="text-slate-200">{t.entryDate}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{t.exitDate}</td>
                        <td className="py-2.5 px-3 text-right">
                          Rs. {t.entryPrice?.toFixed(1)} &rarr; {t.exitPrice?.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-400">
                          {t.holdingSessions} sessions
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            t.exitReason === 'TARGET_1_REACHED'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : t.exitReason === 'STOP_LOSS_HIT'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {t.exitReason}
                          </span>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? '+' : ''}{t.netReturnPct}%
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? '+' : ''}Rs. {t.netProfitNpr?.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3: PAPER-TRADING LEDGER (4-8 WEEKS SIMULATION)
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'paper-trading' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-blue-400 animate-pulse" />
              <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider">
                Live Simulation Mode Active (4–8 Weeks Shadow Run)
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Because the backtest produced negative expectancy after costs, this module operates in <strong>Paper-Trading Mode Only</strong>. All candidate signals are tracked virtually in memory and on disk with real T+2 Demat lockout, 5-tier broker commission, and 5.0% ST / 3.75% LT CGT. No real capital is ever placed at risk.
            </p>
          </div>

          {/* Virtual Capital Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Virtual Portfolio Worth</span>
              <div className="text-xl font-black text-white mt-1">Rs. {Math.round(paperSummary.totalPortfolioWorth).toLocaleString()}</div>
              <span className="text-[10px] text-slate-400">Cash: Rs. {Math.round(paperSummary.cash).toLocaleString()} (Init Rs. {STATUTORY_CHARGES ? '10L' : '10L'})</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Open Positions</span>
              <div className="text-xl font-black text-blue-400 mt-1">{paperSummary.openPositionsCount} / 5</div>
              <span className="text-[10px] text-slate-400">Holdings: Rs. {Math.round(paperSummary.openHoldingsValue).toLocaleString()}</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Realized Paper P&amp;L</span>
              <div className={`text-xl font-black mt-1 ${paperSummary.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {paperSummary.totalRealizedPnl >= 0 ? '+' : ''}Rs. {Math.round(paperSummary.totalRealizedPnl).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400">{paperSummary.totalTrades} closed trades</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-[11px] text-slate-400 font-medium">Paper Win Rate</span>
              <div className="text-xl font-black text-slate-200 mt-1">
                {paperSummary.totalTrades > 0 ? `${paperSummary.winRate}%` : '— %'}
              </div>
              <span className="text-[10px] text-slate-400">
                {paperSummary.totalTrades > 0 ? `${paperSummary.winningTrades}W / ${paperSummary.losingTrades}L` : 'Awaiting initial exits'}
              </span>
            </div>
          </div>

          {/* Open Paper Positions */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock size={16} className="text-blue-400" />
              Active Simulated Positions & Demat Holding Counters
            </h3>
            {paperSummary.positions.length > 0 ? (
              <div className="space-y-2">
                {paperSummary.positions.map((pos: any) => (
                  <div key={pos.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                    <div>
                      <span className="font-bold text-white">{pos.symbol}</span>
                      <span className="ml-2 text-slate-400">{pos.qty ?? pos.quantity} sh @ Rs. {pos.buyPrice}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-slate-300">LTP: Rs. {pos.currentLtp}</span>
                      <span className={pos.unrealizedPnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}Rs. {pos.unrealizedPnl} ({pos.unrealizedPnlPct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl">
                <Shield size={24} className="mx-auto text-slate-500 mb-2" />
                <p className="font-bold text-slate-300">No Open Simulated Positions</p>
                <p className="text-slate-400 mt-1">
                  When market regime approves a pick that passes all 7 gates, virtual positions from Paper Sandbox appear here with T+{CIRCUIT_LIMITS ? '2' : '2'} Demat tracking.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
