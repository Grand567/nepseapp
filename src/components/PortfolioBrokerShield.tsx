// src/components/PortfolioBrokerShield.tsx
// Portfolio & Watchlist 30-Day Broker Shield Workstation
// Cross-checks user holdings and watchlist against 32-day HOT_CACHE microstructure,
// Operator Profit Margins, Syndicate Accumulation, and Institutional Capital Rotation Outflows/Inflows.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldAlert, ShieldCheck, Shield, AlertTriangle, TrendingUp, TrendingDown,
  RefreshCw, Plus, Trash2, ArrowUpRight, ArrowDownRight, Layers,
  ChevronRight, Sparkles, Repeat, BarChart3, Clock, DollarSign,
  CheckCircle2, XCircle, ArrowRight, Eye, Info, X
} from 'lucide-react';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse.js';
import { fetchPortfolioShield, fetchPrecomputedDiagnostic } from '../utils/liveData';

export interface ShieldItemInput {
  symbol: string;
  qty?: number;
  buyPrice?: number;
  listType: 'PORTFOLIO' | 'WATCHLIST';
}

export interface ShieldEvaluatedStock {
  symbol: string;
  companyName: string;
  sector: string;
  listType: 'PORTFOLIO' | 'WATCHLIST';
  qty: number;
  buyPrice: number;
  ltp: number;
  bigBrokerVWAP: number;
  marketVWAP: number;
  buyZoneMin: number;
  buyZoneMax: number;
  phase: string;
  phaseLabel: string;
  priceChangePct: number;
  bcr5NetPct: number;
  scr3NetPct: number;
  operatorProfitMarginPct: number;
  userProfitLossPct: number | null;
  unrealizedPnL: number | null;
  costAdvantageVsOperatorPct: number | null;
  positionValue: number;
  shieldVerdict: string;
  riskLevel: string;
  badge: string;
  tacticalAdvice: string;
  rotationAlert: string | null;
  dumpedRotation: any;
  accumulatedRotation: any;
  leadAccumulator: any;
  leadDistributor: any;
  isSyndicateCoAccumulation: boolean;
  syndicateBrokers: string[];
}

export interface PortfolioSummary {
  shieldScore: number;
  shieldStatus: string;
  totalStocks: number;
  portfolioCount: number;
  watchlistCount: number;
  criticalExitCount: number;
  climaxRiskCount: number;
  fortressCount: number;
  safeAccumulateCount: number;
  neutralCount: number;
  totalPortfolioValue: number;
  totalPortfolioPnL: number;
  rotationAlerts: string[];
}

export const DEFAULT_SAMPLE_SHIELD_ITEMS: ShieldItemInput[] = [
  { symbol: 'TAMOR', qty: 1000, buyPrice: 410, listType: 'PORTFOLIO' },
  { symbol: 'GHL', qty: 1500, buyPrice: 380, listType: 'PORTFOLIO' },
  { symbol: 'HDL', qty: 500, buyPrice: 1420, listType: 'PORTFOLIO' },
  { symbol: 'NABIL', qty: 800, buyPrice: 510, listType: 'PORTFOLIO' },
  { symbol: 'API', qty: 2000, buyPrice: 330, listType: 'PORTFOLIO' },
  { symbol: 'HATHY', qty: 0, buyPrice: 0, listType: 'WATCHLIST' },
  { symbol: 'RADHI', qty: 0, buyPrice: 0, listType: 'WATCHLIST' }
];

const STORAGE_KEY = 'drabyashree_portfolio_shield_v1';

interface PortfolioBrokerShieldProps {
  onSelectStock?: (stock: any) => void;
  defaultTimeframe?: number;
}

export default function PortfolioBrokerShield({
  onSelectStock,
  defaultTimeframe = 30
}: PortfolioBrokerShieldProps) {
  // Timeframe & Input states
  const [days, setDays] = useState<number>(defaultTimeframe);
  const [inputSymbol, setInputSymbol] = useState<string>('');
  const [inputQty, setInputQty] = useState<string>('');
  const [inputBuyPrice, setInputBuyPrice] = useState<string>('');
  const [inputListType, setInputListType] = useState<'PORTFOLIO' | 'WATCHLIST'>('PORTFOLIO');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Stored Items
  const [shieldItems, setShieldItems] = useState<ShieldItemInput[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_SAMPLE_SHIELD_ITEMS;
  });

  // Evaluated Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [evaluatedStocks, setEvaluatedStocks] = useState<ShieldEvaluatedStock[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [capitalRotations, setCapitalRotations] = useState<any[]>([]);
  const [lastEvaluatedTime, setLastEvaluatedTime] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Daily Tape Detail Modal
  const [tapeModalStock, setTapeModalStock] = useState<ShieldEvaluatedStock | null>(null);
  const [tapeLoading, setTapeLoading] = useState<boolean>(false);
  const [tapeData, setTapeData] = useState<any>(null);

  // Save items to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shieldItems));
    } catch (_) {}
  }, [shieldItems]);

  // Autocomplete suggestions filtered against NEPSE_UNIVERSE
  const symbolSuggestions = useMemo(() => {
    if (!inputSymbol.trim()) return [];
    const q = inputSymbol.toUpperCase().trim();
    const list = Array.isArray(NEPSE_UNIVERSE) ? NEPSE_UNIVERSE : [];
    return list
      .filter((s: any) => s.symbol.toUpperCase().includes(q) || (s.name && s.name.toUpperCase().includes(q)))
      .slice(0, 8);
  }, [inputSymbol]);

  // Evaluate Portfolio Shield from Backend API
  const evaluateShield = async (isManual = false) => {
    if (shieldItems.length === 0) {
      setEvaluatedStocks([]);
      setSummary(null);
      setLoading(false);
      return;
    }

    if (isManual) setRefreshing(true);
    else setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetchPortfolioShield(shieldItems, days);
      if (res?.success) {
        setEvaluatedStocks(res.items || []);
        setSummary(res.portfolioSummary || null);
        setCapitalRotations(res.capitalRotations || []);
        setLastEvaluatedTime(new Date().toLocaleTimeString());
      } else {
        setErrorMsg('Microstructure shield evaluation pending sync. Retrying...');
      }
    } catch (err: any) {
      console.warn('[PortfolioBrokerShield] Evaluation failed:', err);
      setErrorMsg('Failed to connect to broker shield backend.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    evaluateShield();
  }, [shieldItems, days]);

  // Add Item to Shield
  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const sym = inputSymbol.toUpperCase().trim();
    if (!sym) return;

    const qty = Math.max(0, parseFloat(inputQty) || 0);
    const buyPrice = Math.max(0, parseFloat(inputBuyPrice) || 0);

    setShieldItems(prev => {
      // If symbol already exists, update its details
      const existingIdx = prev.findIndex(item => item.symbol.toUpperCase() === sym);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { symbol: sym, qty, buyPrice, listType: inputListType };
        return updated;
      }
      return [{ symbol: sym, qty, buyPrice, listType: inputListType }, ...prev];
    });

    setInputSymbol('');
    setInputQty('');
    setInputBuyPrice('');
    setShowSuggestions(false);
  };

  // Remove Item
  const handleRemoveItem = (sym: string) => {
    setShieldItems(prev => prev.filter(item => item.symbol.toUpperCase() !== sym.toUpperCase()));
  };

  // Clear All Items
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear your Shield items?')) {
      setShieldItems([]);
    }
  };

  // Reset to Sample Portfolio
  const handleLoadSample = () => {
    setShieldItems(DEFAULT_SAMPLE_SHIELD_ITEMS);
  };

  // Open Tape / Diagnostic Modal
  const handleOpenTape = async (stock: ShieldEvaluatedStock) => {
    setTapeModalStock(stock);
    setTapeLoading(true);
    try {
      const diag = await fetchPrecomputedDiagnostic(stock.symbol, days);
      setTapeData(diag);
    } catch (_) {
      setTapeData(null);
    } finally {
      setTapeLoading(false);
    }
  };

  // Format NPR Currency
  const formatNpr = (amt: number) => {
    const abs = Math.abs(amt);
    const sign = amt < 0 ? '-' : amt > 0 ? '+' : '';
    if (abs >= 1e7) {
      return `${sign}Rs. ${(abs / 1e7).toFixed(2)} Cr`;
    }
    if (abs >= 1e5) {
      return `${sign}Rs. ${(abs / 1e5).toFixed(2)} L`;
    }
    return `${sign}Rs. ${abs.toLocaleString()}`;
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* ── HEADER & WORKSTATION TITLE ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900/95 via-indigo-950/40 to-slate-950/95 rounded-2xl border border-indigo-500/30 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Shield className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                Portfolio &amp; Watchlist 30-Day Broker Shield
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                  HOT_CACHE &lt;1ms
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Defend your capital against predatory broker dumps, identify operator profit climax traps, and align with institutional syndicates.
              </p>
            </div>
          </div>
        </div>

        {/* Timeframe & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Switcher */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            {[1, 5, 15, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  days === d
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>

          {lastEvaluatedTime && (
            <span className="text-[11px] text-slate-400 hidden lg:flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-500" /> Synced {lastEvaluatedTime}
            </span>
          )}

          <button
            type="button"
            onClick={() => evaluateShield(true)}
            disabled={refreshing}
            className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700/80 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            Re-Evaluate
          </button>
        </div>
      </div>

      {/* ── QUICK-ADD & PRESET BAR ── */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 shadow-lg space-y-3">
        <form onSubmit={handleAddItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Symbol Input with Autocomplete */}
          <div className="relative lg:col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Symbol <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={inputSymbol}
              onChange={(e) => {
                setInputSymbol(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="e.g. TAMOR, RADHI, NABIL..."
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 uppercase font-bold"
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && symbolSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto">
                {symbolSuggestions.map((s: any) => (
                  <button
                    key={s.symbol}
                    type="button"
                    onClick={() => {
                      setInputSymbol(s.symbol);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800/80 flex items-center justify-between text-xs border-b border-slate-800/50 last:border-b-0 transition-colors"
                  >
                    <div>
                      <span className="font-extrabold text-white text-xs">{s.symbol}</span>
                      <span className="text-[10px] text-slate-400 ml-2 truncate max-w-[150px]">{s.name}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                      {s.sector || 'Others'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Quantity (Shares)
            </label>
            <input
              type="number"
              min="0"
              value={inputQty}
              onChange={(e) => setInputQty(e.target.value)}
              placeholder="e.g. 500"
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Buy Price / WACC Input */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Buy Price / WACC (Rs.)
            </label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={inputBuyPrice}
              onChange={(e) => setInputBuyPrice(e.target.value)}
              placeholder="e.g. 410.5"
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* List Type Toggle */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              List Category
            </label>
            <div className="flex bg-slate-950/90 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setInputListType('PORTFOLIO')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  inputListType === 'PORTFOLIO'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Portfolio
              </button>
              <button
                type="button"
                onClick={() => setInputListType('WATCHLIST')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  inputListType === 'WATCHLIST'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Watchlist
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!inputSymbol.trim()}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add to Shield
            </button>
          </div>
        </form>

        {/* Preset & Reset Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px] font-medium">Quick Presets:</span>
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 transition-colors flex items-center gap-1 text-[11px]"
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Load Sample Institutional Test Portfolio
            </button>
          </div>

          {shieldItems.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-rose-400 hover:text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All ({shieldItems.length} items)
            </button>
          )}
        </div>
      </div>

      {/* ── TOP EXECUTIVE SHIELD TELEMETRY CARDS (4 METRICS) ── */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Overall Portfolio Shield Score */}
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                  Portfolio Shield Score
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className={`text-3xl font-black ${
                      summary.shieldScore >= 75
                        ? 'text-emerald-400'
                        : summary.shieldScore >= 50
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {summary.shieldScore}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">/ 100</span>
                </div>
              </div>
              <div
                className={`p-2.5 rounded-xl ${
                  summary.shieldScore >= 75
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : summary.shieldScore >= 50
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {summary.shieldScore >= 75 ? (
                  <ShieldCheck className="w-5 h-5" />
                ) : (
                  <ShieldAlert className="w-5 h-5" />
                )}
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-300">{summary.shieldStatus}</span>
              {summary.totalPortfolioValue > 0 && (
                <span className="text-slate-400 font-mono">
                  Val: {formatNpr(summary.totalPortfolioValue)}
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Dump & Trap Warnings (Critical Exit) */}
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Dump &amp; Trap Alerts
                </span>
                <div className="text-3xl font-black text-rose-400 mt-1">
                  {summary.criticalExitCount}
                  <span className="text-xs font-normal text-slate-500 ml-1.5">critical stocks</span>
                </div>
              </div>
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 truncate">
              Active broker distribution or T+2 exit trap
            </div>
          </div>

          {/* Card 3: Operator Profit Risk (>25%) */}
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Climax Profit Risk
                </span>
                <div className="text-3xl font-black text-amber-400 mt-1">
                  {summary.climaxRiskCount}
                  <span className="text-xs font-normal text-slate-500 ml-1.5">stocks &gt;25% margin</span>
                </div>
              </div>
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 truncate">
              Operator sitting on massive gains; high dump risk
            </div>
          </div>

          {/* Card 4: Syndicate Fortress & Accumulation */}
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Syndicate Fortresses
                </span>
                <div className="text-3xl font-black text-emerald-400 mt-1">
                  {summary.fortressCount + summary.safeAccumulateCount}
                  <span className="text-xs font-normal text-slate-500 ml-1.5">safe / fortress</span>
                </div>
              </div>
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 truncate">
              {summary.fortressCount} fortress holds · {summary.safeAccumulateCount} safe zones
            </div>
          </div>
        </div>
      )}

      {/* ── ROTATION SWAP BANNER ── */}
      {summary && summary.rotationAlerts && summary.rotationAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-rose-950/40 via-amber-950/30 to-slate-900 border border-rose-500/30 rounded-2xl p-4 shadow-lg space-y-2">
          <div className="flex items-center gap-2 text-rose-300 font-black text-sm">
            <span className="p-1 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-400">
              <Repeat className="w-4 h-4 animate-pulse" />
            </span>
            <span>Institutional Capital Rotation Warnings Detected in Your Holdings!</span>
          </div>
          <div className="space-y-1.5 pl-7">
            {summary.rotationAlerts.map((alertStr, idx) => (
              <div key={idx} className="text-xs text-rose-200/90 font-medium">
                {alertStr}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INTERACTIVE SHIELD MATRIX TABLE (7 COLUMNS) ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-black text-white">
              Institutional Microstructure Shield Matrix ({evaluatedStocks.length} Stocks · {days}D Scope)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {evaluatedStocks.filter(s => s.listType === 'PORTFOLIO').length} Holdings · {evaluatedStocks.filter(s => s.listType === 'WATCHLIST').length} Watchlist
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-indigo-400" />
            <span className="text-xs font-bold">Cross-checking against 32-day floorsheet ledger...</span>
          </div>
        ) : evaluatedStocks.length === 0 ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <Shield className="w-10 h-10 text-slate-600" />
            <p className="text-sm font-bold text-slate-300">No stocks in your Broker Shield yet.</p>
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-all shadow-md"
            >
              Load Sample Institutional Portfolio
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-3.5">Stock &amp; Category</th>
                  <th className="py-3 px-3">Shield Verdict &amp; Phase</th>
                  <th className="py-3 px-3 text-right">Price vs Cost Basis</th>
                  <th className="py-3 px-3 text-right">Operator Margin vs WACC</th>
                  <th className="py-3 px-3">Dominant Broker Footprint</th>
                  <th className="py-3 px-3">Tactical Advice</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {evaluatedStocks.map((stock) => {
                  const isCritical = stock.shieldVerdict === 'EXIT_BEFORE_T2_DUMP';
                  const isClimax = stock.shieldVerdict === 'PROFIT_BOOKING_CLIMAX_RISK';
                  const isFortress = stock.shieldVerdict === 'SYNDICATE_FORTRESS_HOLD';
                  const isSafe = stock.shieldVerdict === 'SAFE_ACCUMULATION_ZONE';

                  return (
                    <tr
                      key={stock.symbol}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isCritical ? 'bg-rose-950/10' : isClimax ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Col 1: Stock & Category */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-white group-hover:text-indigo-400">
                            {stock.symbol}
                          </span>
                          <span
                            className={`text-[9.5px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${
                              stock.listType === 'PORTFOLIO'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                            }`}
                          >
                            {stock.listType}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[140px] mt-0.5">
                          {stock.companyName}
                        </div>
                        {stock.qty > 0 && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {stock.qty.toLocaleString()} shs @ Rs. {stock.buyPrice > 0 ? stock.buyPrice.toFixed(1) : '—'}
                          </div>
                        )}
                      </td>

                      {/* Col 2: Shield Verdict & Phase */}
                      <td className="py-3 px-3">
                        <div className="inline-block">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black border ${
                              isCritical
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                                : isClimax
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                : isFortress
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                                : isSafe
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {stock.badge}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <span className="font-semibold text-slate-300">{stock.phaseLabel}</span>
                        </div>
                      </td>

                      {/* Col 3: Price vs Cost Basis */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-black text-white text-sm">
                          Rs. {stock.ltp.toLocaleString()}
                        </div>
                        <div className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                          Operator VWAP: <span className="font-bold text-slate-200">Rs. {stock.bigBrokerVWAP.toFixed(1)}</span>
                        </div>
                        {stock.buyZoneMin > 0 && (
                          <div className="text-[9.5px] text-emerald-400 font-mono mt-0.5">
                            Zone: Rs. {stock.buyZoneMin}–{stock.buyZoneMax}
                          </div>
                        )}
                      </td>

                      {/* Col 4: Operator Margin vs WACC */}
                      <td className="py-3 px-3 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400">Op Margin: </span>
                          <span
                            className={`font-black font-mono ${
                              stock.operatorProfitMarginPct >= 20
                                ? 'text-rose-400'
                                : stock.operatorProfitMarginPct <= 5
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {stock.operatorProfitMarginPct >= 0 ? '+' : ''}
                            {stock.operatorProfitMarginPct}%
                          </span>
                        </div>
                        {stock.userProfitLossPct !== null && (
                          <div className="mt-0.5 font-mono text-[10.5px]">
                            <span className="text-slate-400">Your P/L: </span>
                            <span
                              className={`font-bold ${
                                stock.userProfitLossPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {stock.userProfitLossPct >= 0 ? '+' : ''}
                              {stock.userProfitLossPct}%
                            </span>
                          </div>
                        )}
                        {stock.costAdvantageVsOperatorPct !== null && (
                          <div className="mt-0.5 font-mono text-[9.5px] text-slate-400">
                            Advantage: {stock.costAdvantageVsOperatorPct >= 0 ? '+' : ''}{stock.costAdvantageVsOperatorPct}%
                          </div>
                        )}
                      </td>

                      {/* Col 5: Dominant Broker Footprint */}
                      <td className="py-3 px-3 max-w-[220px]">
                        {stock.leadAccumulator && (
                          <div className="text-[11px] text-emerald-300 font-medium truncate">
                            <span className="font-bold">▲ Acc: </span>
                            {stock.leadAccumulator.brokerName}{' '}
                            <span className="font-mono text-emerald-400 font-bold">
                              (+{stock.leadAccumulator.netInflowCr} Cr)
                            </span>
                            {stock.leadAccumulator.streakDays > 0 && (
                              <span className="text-[9.5px] text-slate-400 block">
                                {stock.leadAccumulator.streakDays}d streak · {stock.leadAccumulator.consistencyPct}% consistency
                              </span>
                            )}
                          </div>
                        )}
                        {stock.leadDistributor && (
                          <div className="text-[11px] text-rose-300 font-medium truncate mt-0.5">
                            <span className="font-bold">▼ Dist: </span>
                            {stock.leadDistributor.brokerName}{' '}
                            <span className="font-mono text-rose-400 font-bold">
                              ({stock.leadDistributor.netOutflowCr} Cr)
                            </span>
                          </div>
                        )}
                        <div className="text-[9.5px] text-slate-400 font-mono mt-0.5">
                          BCR5: {stock.bcr5NetPct}% · SCR3: {stock.scr3NetPct}%
                        </div>
                      </td>

                      {/* Col 6: Tactical Advice */}
                      <td className="py-3 px-3 max-w-[240px]">
                        <p className="text-[11px] text-slate-300 leading-snug">
                          {stock.tacticalAdvice}
                        </p>
                        {stock.dumpedRotation && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              <Repeat className="w-2.5 h-2.5" /> Swap Out → {stock.dumpedRotation.accumulatedSymbol}
                            </span>
                          </div>
                        )}
                        {stock.accumulatedRotation && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <Repeat className="w-2.5 h-2.5" /> Rotation Target (from {stock.accumulatedRotation.dumpedSymbol})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Col 7: Actions */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenTape(stock)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[10.5px] font-bold border border-slate-700 transition-colors flex items-center gap-1 shadow-sm"
                            title="Inspect 30-Day Floorsheet Tape"
                          >
                            <BarChart3 className="w-3 h-3 text-indigo-400" />
                            Tape
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(stock.symbol)}
                            className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Remove from Shield"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── DAILY TAPE DETAIL MODAL ── */}
      {tapeModalStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                  <BarChart3 className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    {tapeModalStock.symbol} — {days}D Broker Microstructure &amp; Tape
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                      Rs. {tapeModalStock.ltp}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 truncate max-w-sm">
                    {tapeModalStock.companyName} ({tapeModalStock.sector})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTapeModalStock(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {tapeLoading ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs">Fetching tape &amp; floorsheet metrics...</span>
                </div>
              ) : (
                <>
                  {/* Verdict & Phase Banner */}
                  <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                        Shield Classification
                      </span>
                      <div className="text-sm font-black text-white mt-0.5">
                        {tapeModalStock.badge}
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        {tapeModalStock.tacticalAdvice}
                      </p>
                    </div>
                  </div>

                  {/* VWAP & Safe Buy Zone */}
                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Operator Cost Basis</span>
                      <div className="text-base font-black text-indigo-400 mt-0.5">
                        Rs. {tapeModalStock.bigBrokerVWAP.toFixed(1)}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Safe Buy Zone</span>
                      <div className="text-base font-black text-emerald-400 mt-0.5">
                        Rs. {tapeModalStock.buyZoneMin}–{tapeModalStock.buyZoneMax}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Operator Margin</span>
                      <div
                        className={`text-base font-black mt-0.5 ${
                          tapeModalStock.operatorProfitMarginPct >= 20 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {tapeModalStock.operatorProfitMarginPct >= 0 ? '+' : ''}{tapeModalStock.operatorProfitMarginPct}%
                      </div>
                    </div>
                  </div>

                  {/* Top Accumulators & Distributors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-1.5">
                      <span className="font-extrabold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" /> Top Accumulating Broker
                      </span>
                      {tapeModalStock.leadAccumulator ? (
                        <div>
                          <div className="font-bold text-white text-xs">
                            {tapeModalStock.leadAccumulator.brokerName}
                          </div>
                          <div className="text-emerald-300 font-mono text-[11px] mt-0.5">
                            Net Retained: +{tapeModalStock.leadAccumulator.netInflowCr} Cr ({tapeModalStock.leadAccumulator.remainingQty?.toLocaleString()} shs)
                          </div>
                          {tapeModalStock.leadAccumulator.avgBuyPrice > 0 && (
                            <div className="text-slate-400 text-[10px] mt-0.5">
                              Avg Buy Price: Rs. {tapeModalStock.leadAccumulator.avgBuyPrice.toFixed(1)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-400 text-[11px]">No dominant buyer</div>
                      )}
                    </div>

                    <div className="p-3.5 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-1.5">
                      <span className="font-extrabold text-rose-400 uppercase tracking-wider text-[11px] flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" /> Top Distributing Broker
                      </span>
                      {tapeModalStock.leadDistributor ? (
                        <div>
                          <div className="font-bold text-white text-xs">
                            {tapeModalStock.leadDistributor.brokerName}
                          </div>
                          <div className="text-rose-300 font-mono text-[11px] mt-0.5">
                            Net Outflow: {tapeModalStock.leadDistributor.netOutflowCr} Cr ({tapeModalStock.leadDistributor.remainingQty?.toLocaleString()} shs)
                          </div>
                          {tapeModalStock.leadDistributor.avgSellPrice > 0 && (
                            <div className="text-slate-400 text-[10px] mt-0.5">
                              Avg Sell Price: Rs. {tapeModalStock.leadDistributor.avgSellPrice.toFixed(1)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-400 text-[11px]">No dominant seller</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              {onSelectStock ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelectStock(tapeModalStock);
                    setTapeModalStock(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Full Stock Analysis
                </button>
              ) : <div />}
              <button
                type="button"
                onClick={() => setTapeModalStock(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
