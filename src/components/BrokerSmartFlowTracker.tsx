// src/components/BrokerSmartFlowTracker.tsx
// Smart Money Slow Accumulation & Dumping Tracker Workstation (1D / 5D / 15D / 1M)
// Powered by 32-Day drabyashree_ledger.db & HOT_CACHE Microstructure Engine

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, ShieldAlert,
  Search, RefreshCw, Filter, Layers, Users, ArrowUpRight, ArrowDownRight,
  Activity, CheckCircle2, DollarSign, Calendar, Clock, ChevronRight,
  ChevronDown, ChevronUp, ExternalLink, Sparkles, Percent, Database,
  Repeat, X, BarChart3, ArrowRight, Zap, Flame
} from 'lucide-react';
import { fetchBrokerTracker, fetchEarlyIgnition, fetchPrecomputedDiagnostic } from '../utils/liveData';
import { TOP_NEPSE_BROKERS } from '../utils/microstructureEngine';
import PortfolioBrokerShield from './PortfolioBrokerShield';

export interface DailyTapePoint {
  date: string;
  buyVol: number;
  sellVol: number;
  netVol: number;
  buyAmt: number;
  sellAmt: number;
  avgBuyPrice?: number;
  avgSellPrice?: number;
  close?: number;
}

export interface CapitalRotation {
  brokerId: string | number;
  brokerName: string;
  dumpedSymbol: string;
  dumpedCompanyName: string;
  dumpedNetAmt: number;
  dumpedQty: number;
  accumulatedSymbol: string;
  accumulatedCompanyName: string;
  accumulatedNetAmt: number;
  accumulatedQty: number;
  shiftedAmount: number;
  shiftedAmountCr: number;
  rotationMatchPct: number;
}

export interface BrokerSmartStock {
  symbol: string;
  companyName: string;
  sector: string;
  timeframeDays: number;
  ltp: number;
  priceChangePct: number;
  marketVWAP: number;
  bigBrokerVWAP: number;
  buyZoneMin: number;
  buyZoneMax: number;
  phase: string;
  phaseLabel: string;
  bcr5NetPct: number;
  scr3NetPct: number;
  brokerId: string | number;
  brokerName: string;
  buyQty: number;
  sellQty: number;
  remainingQty: number;
  buyAmount: number;
  sellAmount: number;
  netInflowAmount: number;
  totalTradedAmount: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  retentionPct: number;
  statusIndication: string;
  actionStartDate: string | null;
  streakDays: number;
  consistencyPct: number;
  unrealizedProfitPct: number;
  isSyndicateCoAccumulation: boolean;
  syndicateBrokers: string[];
  dailySeries?: DailyTapePoint[];
}

interface BrokerSmartFlowTrackerProps {
  onSelectStock?: (stock: any) => void;
  defaultTimeframe?: number;
}

export default function BrokerSmartFlowTracker({
  onSelectStock,
  defaultTimeframe = 30
}: BrokerSmartFlowTrackerProps) {
  // Filter States
  const [days, setDays] = useState<number>(defaultTimeframe);
  const [mode, setMode] = useState<'ACCUMULATING' | 'DUMPING' | 'ALL'>('ACCUMULATING');
  const [brokerId, setBrokerId] = useState<string>('ALL');
  const [sector, setSector] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('netInflow');
  const [syndicateOnly, setSyndicateOnly] = useState<boolean>(false);
  const [limit, setLimit] = useState<string>('10');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewTab, setViewTab] = useState<'MARKET_FLOW' | 'EARLY_IGNITION' | 'PORTFOLIO_SHIELD'>('MARKET_FLOW');

  // Early Ignition States
  const [ignitionStocks, setIgnitionStocks] = useState<any[]>([]);
  const [ignitionLoading, setIgnitionLoading] = useState<boolean>(false);
  const [ignitionStageFilter, setIgnitionStageFilter] = useState<string>('PRIME_ENTRY');
  const [ignitionMinRvol, setIgnitionMinRvol] = useState<number>(1.2);
  const [ignitionMaxMargin, setIgnitionMaxMargin] = useState<number>(8.0);
  const [ignitionSector, setIgnitionSector] = useState<string>('ALL');
  const [ignitionSummary, setIgnitionSummary] = useState<any>(null);
  const [availableIgnitionSectors, setAvailableIgnitionSectors] = useState<string[]>([]);
  const [lastIgnitionRefreshed, setLastIgnitionRefreshed] = useState<string>('');

  // Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [stocks, setStocks] = useState<BrokerSmartStock[]>([]);
  const [capitalRotations, setCapitalRotations] = useState<CapitalRotation[]>([]);
  const [isRotationsOpen, setIsRotationsOpen] = useState<boolean>(true);
  const [inspectedStock, setInspectedStock] = useState<BrokerSmartStock | null>(null);
  const [availableSectors, setAvailableSectors] = useState<string[]>([]);
  const [totalMatched, setTotalMatched] = useState<number>(0);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Fetch data from backend API
  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetchBrokerTracker({
        days,
        mode,
        brokerId,
        sector,
        sortBy,
        syndicateOnly,
        limit: limit === 'ALL' ? 'ALL' : Number(limit)
      });

      if (res?.success && Array.isArray(res.topStocks)) {
        setStocks(res.topStocks);
        setTotalMatched(res.totalMatched || res.topStocks.length);
        if (Array.isArray(res.capitalRotations)) {
          setCapitalRotations(res.capitalRotations);
        }
        if (Array.isArray(res.sectors) && res.sectors.length > 0) {
          setAvailableSectors(res.sectors);
        }
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('[BrokerSmartFlowTracker] Failed to load broker tracker:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days, mode, brokerId, sector, sortBy, syndicateOnly, limit]);

  // Load Early Ignition Data from Backend API
  const loadEarlyIgnitionData = async (isManual = false) => {
    setIgnitionLoading(true);
    try {
      const res = await fetchEarlyIgnition({
        stage: ignitionStageFilter,
        minRvol: ignitionMinRvol,
        maxOperatorMargin: ignitionMaxMargin,
        sector: ignitionSector,
        limit: 'ALL'
      });
      if (res?.success && Array.isArray(res.stocks)) {
        setIgnitionStocks(res.stocks);
        setIgnitionSummary(res.summary || null);
        if (Array.isArray(res.sectors) && res.sectors.length > 0) {
          setAvailableIgnitionSectors(res.sectors);
        }
        setLastIgnitionRefreshed(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('[BrokerSmartFlowTracker] Failed to load early ignition:', err);
    } finally {
      setIgnitionLoading(false);
    }
  };

  useEffect(() => {
    if (viewTab === 'EARLY_IGNITION') {
      loadEarlyIgnitionData();
    }
  }, [viewTab, ignitionStageFilter, ignitionMinRvol, ignitionMaxMargin, ignitionSector]);

  // Client-side text filter for Early Ignition Stocks
  const filteredIgnitionStocks = useMemo(() => {
    if (!searchQuery.trim()) return ignitionStocks;
    const q = searchQuery.toLowerCase().trim();
    return ignitionStocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        (s.companyName && s.companyName.toLowerCase().includes(q)) ||
        (s.sector && s.sector.toLowerCase().includes(q))
    );
  }, [ignitionStocks, searchQuery]);

  // Client-side text filter by Symbol, Company Name, or Broker
  const filteredStocks = useMemo(() => {
    if (!searchQuery.trim()) return stocks;
    const q = searchQuery.toLowerCase().trim();
    return stocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.companyName.toLowerCase().includes(q) ||
        s.brokerName.toLowerCase().includes(q) ||
        String(s.brokerId).includes(q)
    );
  }, [stocks, searchQuery]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const netFlowTotal = filteredStocks.reduce((sum, s) => sum + s.netInflowAmount, 0);
    const syndicateCount = filteredStocks.filter((s) => s.isSyndicateCoAccumulation).length;
    const highProfitCount = filteredStocks.filter((s) => s.unrealizedProfitPct >= 15).length;

    return {
      totalNetFlow: netFlowTotal,
      syndicateCount,
      highProfitCount,
      matchedCount: filteredStocks.length
    };
  }, [filteredStocks]);

  // Format currency in NPR Crores or Lakhs
  const formatNprAmt = (amt: number) => {
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

  // Inspect Early Ignition Stock in Tape Modal
  const handleInspectIgnitionStock = async (stk: any) => {
    try {
      const diag = await fetchPrecomputedDiagnostic(stk.symbol, 3);
      setInspectedStock({
        symbol: stk.symbol,
        companyName: stk.companyName,
        sector: stk.sector,
        timeframeDays: 3,
        ltp: stk.ltp,
        priceChangePct: stk.priceChange3dPct,
        marketVWAP: stk.marketVWAP3d,
        bigBrokerVWAP: stk.bigBrokerVWAP3d,
        buyZoneMin: stk.buyZoneMin,
        buyZoneMax: stk.buyZoneMax,
        phase: stk.ignitionStage,
        phaseLabel: stk.stageLabel,
        bcr5NetPct: stk.bcr5NetPct,
        scr3NetPct: stk.scr3NetPct,
        brokerId: stk.leadAccumulator?.brokerId || 'SYN',
        brokerName: stk.leadAccumulator?.brokerName || 'Co-Accumulating Syndicate',
        buyQty: stk.leadAccumulator?.buyVol || stk.totalVolume3d,
        sellQty: stk.leadAccumulator?.sellVol || 0,
        remainingQty: stk.leadAccumulator?.remainingQty || stk.top10NetBuyVol,
        buyAmount: stk.leadAccumulator?.buyAmt || 0,
        sellAmount: stk.leadAccumulator?.sellAmt || 0,
        netInflowAmount: stk.leadAccumulator?.netAmt || 0,
        totalTradedAmount: diag?.totalTurnover || 0,
        avgBuyPrice: stk.leadAccumulator?.avgBuyPrice || stk.bigBrokerVWAP3d,
        avgSellPrice: stk.leadAccumulator?.avgSellPrice || 0,
        retentionPct: stk.leadAccumulator?.retentionPct || 90,
        statusIndication: stk.stageBadge,
        actionStartDate: stk.leadAccumulator?.startDate || null,
        streakDays: stk.leadAccumulator?.streakDays || 3,
        consistencyPct: stk.leadAccumulator?.consistencyPct || 80,
        unrealizedProfitPct: stk.operatorProfitMargin3d,
        isSyndicateCoAccumulation: stk.isSyndicateCoAccumulation,
        syndicateBrokers: stk.syndicateBrokers,
        dailySeries: diag?.topAccumulators?.[0]?.dailySeries || []
      });
    } catch (_) {}
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* ── HEADER & WORKSTATION TITLE ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950/90 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                NEPSE Broker Slow Accumulation &amp; Dumping Tracker
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  HOT_CACHE &lt;1ms
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tracks 32-day floorsheet volume retention, exact inflection start dates, operator cost basis, and syndicate cornering.
              </p>
            </div>
          </div>
        </div>

        {/* Right Info & Refresh */}
        <div className="flex items-center gap-3">
          {(lastRefreshed || lastIgnitionRefreshed) && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-500" /> Synced {viewTab === 'EARLY_IGNITION' ? lastIgnitionRefreshed : lastRefreshed}
            </span>
          )}
          <button
            onClick={() => {
              if (viewTab === 'EARLY_IGNITION') loadEarlyIgnitionData(true);
              else loadData(true);
            }}
            disabled={refreshing || ignitionLoading}
            className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700/80 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing || ignitionLoading ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── WORKSTATION MODE SWITCHER (MARKET TRACKER VS EARLY IGNITION VS PORTFOLIO SHIELD) ── */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-950/80 rounded-2xl border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setViewTab('MARKET_FLOW')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            viewTab === 'MARKET_FLOW'
              ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Market Slow Flow &amp; Dumping
        </button>
        <button
          type="button"
          onClick={() => setViewTab('EARLY_IGNITION')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            viewTab === 'EARLY_IGNITION'
              ? 'bg-amber-500 text-slate-950 shadow-md font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-950 fill-current" /> ⚡ Day 1–3 Early Ignition Scanner
        </button>
        <button
          type="button"
          onClick={() => setViewTab('PORTFOLIO_SHIELD')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            viewTab === 'PORTFOLIO_SHIELD'
              ? 'bg-indigo-600 text-white shadow-md font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> 🛡️ My Portfolio &amp; Watchlist Shield
        </button>
      </div>

      {viewTab === 'PORTFOLIO_SHIELD' ? (
        <PortfolioBrokerShield
          onSelectStock={onSelectStock}
          defaultTimeframe={days}
        />
      ) : viewTab === 'EARLY_IGNITION' ? (
        /* ── ⚡ 3-DAY EARLY IGNITION SCANNER VIEW ── */
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="p-4 bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Flame className="w-5 h-5 animate-pulse" />
              </span>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  72-Hour Smart Money Early Ignition &amp; Manipulation Detector
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                    3-Day Horizon
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Multi-Broker Syndicate Detection · 1-to-Many Asymmetry · RVOL Surge · T+2 Demat Hold · Anti-Wash Veto
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Scanned: <strong className="text-white">{ignitionSummary?.totalScanned || 367}</strong> stocks
            </span>
          </div>

          {/* Top 4 KPI Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> Prime Entry Window
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  {ignitionSummary?.primeEntryCount || 0}{' '}
                  <span className="text-xs font-normal text-slate-500">Stage 1 + 2</span>
                </div>
              </div>
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                <Zap className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Stealth Seeding
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  {ignitionSummary?.stealthSeedingCount || 0}{' '}
                  <span className="text-xs font-normal text-slate-500">Stage 1</span>
                </div>
              </div>
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-blue-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Markup Breakouts
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  {ignitionSummary?.breakoutCount || 0}{' '}
                  <span className="text-xs font-normal text-slate-500">&gt;6.5% candle</span>
                </div>
              </div>
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-rose-400 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Wash Traps Blocked
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  {ignitionSummary?.washTrapCount || 0}{' '}
                  <span className="text-xs font-normal text-slate-500">circular churn</span>
                </div>
              </div>
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filter & Tuning Bar */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3.5 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Stage Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                {[
                  { id: 'PRIME_ENTRY', label: '⚡ Prime Entry (Stage 1+2)' },
                  { id: 'STAGE_1', label: '🌱 Stealth Seeding' },
                  { id: 'STAGE_2', label: '⚡ Prime Ignition' },
                  { id: 'BREAKOUT', label: '🚀 Breakout' },
                  { id: 'WASH_TRAP', label: '🚨 Fake Wash Churn' },
                  { id: 'ALL', label: 'All Detected' }
                ].map((stg) => (
                  <button
                    key={stg.id}
                    type="button"
                    onClick={() => setIgnitionStageFilter(stg.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      ignitionStageFilter === stg.id
                        ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {stg.label}
                  </button>
                ))}
              </div>

              {/* Min RVOL Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-semibold whitespace-nowrap">Min RVOL:</label>
                <select
                  value={ignitionMinRvol}
                  onChange={(e) => setIgnitionMinRvol(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                >
                  <option value={0}>0.0x (All Vol)</option>
                  <option value={1.0}>1.0x (Normal)</option>
                  <option value={1.2}>1.2x (Default)</option>
                  <option value={1.5}>1.5x (Surge)</option>
                  <option value={2.0}>2.0x (Explosion)</option>
                </select>
              </div>

              {/* Max Operator Margin Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-semibold whitespace-nowrap">Max Operator Profit:</label>
                <select
                  value={ignitionMaxMargin}
                  onChange={(e) => setIgnitionMaxMargin(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                >
                  <option value={4.0}>&le; 4.0% (Ultra-Tight)</option>
                  <option value={6.0}>&le; 6.0% (Prime)</option>
                  <option value={8.0}>&le; 8.0% (Default)</option>
                  <option value={999}>No Limit</option>
                </select>
              </div>

              {/* Sector Filter */}
              {availableIgnitionSectors.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400 font-semibold whitespace-nowrap">Sector:</label>
                  <select
                    value={ignitionSector}
                    onChange={(e) => setIgnitionSector(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500 max-w-[140px]"
                  >
                    <option value="ALL">All Sectors</option>
                    {availableIgnitionSectors.map((sec) => (
                      <option key={sec} value={sec}>{sec}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Results Grid / Table */}
          {ignitionLoading ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-slate-900/60 rounded-2xl border border-slate-800">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
              <span className="text-xs font-bold">Scanning 367 stocks in &lt;1ms for 3-Day Early Ignition signatures...</span>
            </div>
          ) : filteredIgnitionStocks.length === 0 ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-slate-900/60 rounded-2xl border border-slate-800">
              <Zap className="w-10 h-10 text-slate-600" />
              <p className="text-sm font-bold text-slate-300">No stocks matched current Early Ignition filters.</p>
              <button
                type="button"
                onClick={() => {
                  setIgnitionStageFilter('ALL');
                  setIgnitionMinRvol(0);
                  setIgnitionMaxMargin(999);
                  setIgnitionSector('ALL');
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all shadow-md"
              >
                Reset to All Detected
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 flex items-center justify-between px-1">
                <span>Displaying <strong>{filteredIgnitionStocks.length}</strong> early ignition setups</span>
                <span className="font-mono text-[11px]">Ranked by Ignition Score (0–100)</span>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {filteredIgnitionStocks.map((stock) => {
                  const isStage2 = stock.ignitionStage === 'STAGE_2_SUPPLY_VACUUM_IGNITION';
                  const isStage1 = stock.ignitionStage === 'STAGE_1_STEALTH_SEEDING';
                  const isBreakout = stock.ignitionStage === 'STAGE_3_BREAKOUT_IN_PROGRESS';
                  const isWash = stock.ignitionStage === 'WASH_CHURN_TRAP';

                  return (
                    <div
                      key={stock.symbol}
                      className={`p-4 rounded-2xl border transition-all ${
                        isStage2
                          ? 'bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/40 shadow-lg'
                          : isStage1
                          ? 'bg-gradient-to-r from-emerald-950/20 via-slate-900 to-slate-900 border-emerald-500/30'
                          : isWash
                          ? 'bg-rose-950/20 border-rose-500/30'
                          : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      {/* Top Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-3">
                          <span className="text-base font-black text-white">{stock.symbol}</span>
                          <span className="text-xs text-slate-400 truncate max-w-[200px]">{stock.companyName}</span>
                          <span className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700/80">
                            {stock.sector}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Stage Badge */}
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-black border flex items-center gap-1 ${
                              isStage2
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                                : isStage1
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : isBreakout
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : isWash
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {stock.stageBadge}
                          </span>

                          {/* Score Badge */}
                          <span className="px-2 py-1 rounded-lg bg-slate-950 font-mono text-xs font-black border border-slate-800 text-amber-400">
                            Score: {stock.ignitionScore}/100
                          </span>
                        </div>
                      </div>

                      {/* Middle 5 Quantitative Signals Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 my-3 text-xs">
                        {/* 1. SMH Power */}
                        <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] uppercase font-bold text-slate-400">SMH Power (Top 10)</span>
                          <div
                            className={`text-sm font-black font-mono mt-0.5 ${
                              stock.smh3dPct >= 15 ? 'text-emerald-400' : stock.smh3dPct >= 8 ? 'text-amber-400' : 'text-slate-300'
                            }`}
                          >
                            {stock.smh3dPct >= 0 ? '+' : ''}{stock.smh3dPct}%
                          </div>
                          <span className="text-[9.5px] text-slate-500 font-mono truncate block">
                            Net Vol: {(stock.top10NetBuyVol - stock.top10NetSellVol).toLocaleString()}
                          </span>
                        </div>

                        {/* 2. Dispersion Asymmetry */}
                        <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Dispersion Asymmetry</span>
                          <div className="text-sm font-black font-mono text-white mt-0.5">
                            {stock.dispersionRatio}x
                          </div>
                          <span className="text-[9.5px] text-slate-400 truncate block">
                            {stock.buyersCount} Buyers / {stock.sellersCount} Sellers
                          </span>
                        </div>

                        {/* 3. 3D RVOL Surge */}
                        <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] uppercase font-bold text-slate-400">3D RVOL Surge</span>
                          <div
                            className={`text-sm font-black font-mono mt-0.5 ${
                              stock.rvol3d >= 1.6 ? 'text-amber-400' : stock.rvol3d >= 1.2 ? 'text-emerald-400' : 'text-slate-300'
                            }`}
                          >
                            {stock.rvol3d}x
                          </div>
                          <span className="text-[9.5px] text-slate-500 truncate block">
                            vs 30D baseline
                          </span>
                        </div>

                        {/* 4. T+2 Retention */}
                        <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] uppercase font-bold text-slate-400">T+2 Settlement Hold</span>
                          <div
                            className={`text-sm font-black font-mono mt-0.5 ${
                              stock.t2RetentionPct >= 85 ? 'text-emerald-400' : stock.t2RetentionPct >= 70 ? 'text-amber-400' : 'text-rose-400'
                            }`}
                          >
                            {stock.t2RetentionPct}%
                          </div>
                          <span className="text-[9.5px] text-slate-500 truncate block">
                            held through Demat
                          </span>
                        </div>

                        {/* 5. Operator VWAP & Margin */}
                        <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Operator VWAP &amp; Margin</span>
                          <div className="text-sm font-black font-mono text-white mt-0.5">
                            Rs. {stock.bigBrokerVWAP3d.toFixed(1)}
                          </div>
                          <span
                            className={`text-[9.5px] font-mono block ${
                              stock.operatorProfitMargin3d <= 4 ? 'text-emerald-400' : stock.operatorProfitMargin3d <= 6 ? 'text-amber-400' : 'text-rose-400'
                            }`}
                          >
                            Margin: {stock.operatorProfitMargin3d >= 0 ? '+' : ''}{stock.operatorProfitMargin3d}%
                          </span>
                        </div>
                      </div>

                      {/* Bottom Tactical Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-800/60 text-xs">
                        <div className="flex-1 text-slate-300 leading-snug">
                          <strong className="text-amber-400 mr-1.5">Tactical Plan:</strong>
                          {stock.tacticalAdvice}
                          {stock.buyZoneMin > 0 && (
                            <span className="text-emerald-400 ml-1.5 font-mono">
                              (Safe Entry Zone: Rs. {stock.buyZoneMin}–{stock.buyZoneMax})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleInspectIgnitionStock(stock)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition-colors flex items-center gap-1.5 border border-slate-700 shadow-sm"
                          >
                            <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                            Floorsheet Tape
                          </button>
                          {onSelectStock && (
                            <button
                              type="button"
                              onClick={() => onSelectStock(stock)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-colors flex items-center gap-1 border border-amber-500/40"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Stock Analytics
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── TOP KPI SUMMARY CARDS ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Card 1: Stocks Matched */}
        <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Matches Displayed</span>
            <div className="text-2xl font-black text-white mt-1">
              {filteredStocks.length}{' '}
              <span className="text-xs font-normal text-slate-500">/ {totalMatched} total</span>
            </div>
          </div>
          <div className="p-2.5 bg-slate-800/60 rounded-xl text-slate-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Net Institutional Flow */}
        <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
              {mode === 'DUMPING' ? 'Total Net Outflow' : 'Total Net Inflow'}
            </span>
            <div
              className={`text-2xl font-black mt-1 ${
                summaryMetrics.totalNetFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatNprAmt(summaryMetrics.totalNetFlow)}
            </div>
          </div>
          <div
            className={`p-2.5 rounded-xl ${
              summaryMetrics.totalNetFlow >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}
          >
            {summaryMetrics.totalNetFlow >= 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
          </div>
        </div>

        {/* Card 3: Syndicate Co-Accumulation Setups */}
        <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Syndicate Cornered
            </span>
            <div className="text-2xl font-black text-white mt-1">
              {summaryMetrics.syndicateCount}{' '}
              <span className="text-xs font-normal text-slate-500">stocks (≥3 Brokers)</span>
            </div>
          </div>
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Operator High Profit Dump Warning */}
        <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> High Dump Risk
            </span>
            <div className="text-2xl font-black text-white mt-1">
              {summaryMetrics.highProfitCount}{' '}
              <span className="text-xs font-normal text-slate-500">held at &gt;15% gain</span>
            </div>
          </div>
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── INSTITUTIONAL CAPITAL ROTATION PAIRS (PAIR-TRADE RADAR) ── */}
      {capitalRotations.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900/95 via-indigo-950/30 to-slate-900/95 border border-indigo-500/30 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Repeat className="w-4 h-4 animate-pulse" />
              </span>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  Institutional Capital Rotation Pairs (Pair-Trade Radar)
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    {capitalRotations.length} Active Switching Pairs ({days}D)
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Detects big brokers cycling capital from overextended distribution stocks into fresh accumulation stocks.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsRotationsOpen(!isRotationsOpen)}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 flex items-center gap-1 transition-colors"
            >
              {isRotationsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {isRotationsOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {isRotationsOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {capitalRotations.map((rot, idx) => (
                <div
                  key={`${rot.brokerId}_${rot.dumpedSymbol}_${rot.accumulatedSymbol}_${idx}`}
                  className="p-3.5 bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition-all shadow-inner relative group"
                >
                  {/* Top: Broker & Shifted Amount */}
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/80">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-black border border-indigo-500/30">
                        #{rot.brokerId}
                      </span>
                      <span className="truncate max-w-[130px]">{rot.brokerName.replace(` (#${rot.brokerId})`, '')}</span>
                    </span>
                    <span className="font-mono font-black text-amber-400 text-[11px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      Rs. {rot.shiftedAmountCr} Cr Shifted
                    </span>
                  </div>

                  {/* Flow Pair */}
                  <div className="grid grid-cols-2 gap-2 mt-2.5 relative">
                    {/* From (Dumped) */}
                    <div
                      onClick={() => onSelectStock?.({ symbol: rot.dumpedSymbol })}
                      className="p-2 rounded-lg bg-rose-950/30 border border-rose-800/40 hover:border-rose-600 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-rose-400 font-bold uppercase">Sold / Dumped</span>
                        <ArrowDownRight className="w-3 h-3 text-rose-400" />
                      </div>
                      <div className="font-black text-sm text-white mt-0.5 group-hover:text-rose-300">
                        {rot.dumpedSymbol}
                      </div>
                      <div className="text-[10px] font-mono font-bold text-rose-400 mt-0.5">
                        {formatNprAmt(rot.dumpedNetAmt)}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono truncate">
                        {rot.dumpedQty.toLocaleString()} shs
                      </div>
                    </div>

                    {/* To (Accumulated) */}
                    <div
                      onClick={() => onSelectStock?.({ symbol: rot.accumulatedSymbol })}
                      className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/40 hover:border-emerald-600 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-emerald-400 font-bold uppercase">Bought / Absorbed</span>
                        <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                      </div>
                      <div className="font-black text-sm text-white mt-0.5 group-hover:text-emerald-300">
                        {rot.accumulatedSymbol}
                      </div>
                      <div className="text-[10px] font-mono font-bold text-emerald-400 mt-0.5">
                        +{formatNprAmt(rot.accumulatedNetAmt)}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono truncate">
                        +{rot.accumulatedQty.toLocaleString()} shs
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Rotation Match Indicator */}
                  <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
                    <span>Capital Transition Match:</span>
                    <strong className="text-indigo-400 font-mono">{rot.rotationMatchPct}% Balanced</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MULTI-FILTER CONTROL BAR ── */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3.5 shadow-md">
        {/* Row 1: Timeframe, Flow Mode, Limit Toggle, and Syndicate Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
            {[
              { label: '1D Session', val: 1 },
              { label: '3D ⚡ Early', val: 3 },
              { label: '5D (1W)', val: 5 },
              { label: '15D (2W)', val: 15 },
              { label: '1M (30D)', val: 30 }
            ].map((tf) => (
              <button
                key={tf.val}
                onClick={() => setDays(tf.val)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  days === tf.val
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Mode Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
            <button
              onClick={() => setMode('ACCUMULATING')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'ACCUMULATING'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> Slowly Accumulating
            </button>
            <button
              onClick={() => setMode('DUMPING')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'DUMPING'
                  ? 'bg-rose-500 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" /> Slowly Dumping
            </button>
            <button
              onClick={() => setMode('ALL')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === 'ALL'
                  ? 'bg-slate-700 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Flows
            </button>
          </div>

          {/* Row Limit Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
            {[
              { label: 'Top 10', val: '10' },
              { label: 'Top 25', val: '25' },
              { label: 'Top 50', val: '50' },
              { label: 'All', val: 'ALL' }
            ].map((lim) => (
              <button
                key={lim.val}
                onClick={() => setLimit(lim.val)}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  limit === lim.val
                    ? 'bg-indigo-600 text-white shadow-md font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lim.label}
              </button>
            ))}
          </div>

          {/* Syndicate Co-Accumulation Switch (FollowUp 2) */}
          <button
            onClick={() => setSyndicateOnly(!syndicateOnly)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 ${
              syndicateOnly
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-black shadow-lg shadow-amber-500/10'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-amber-300'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            Syndicate Cornered Only
          </button>
        </div>

        {/* Row 2: Broker Dropdown, Sector Dropdown, Sort By, and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
          {/* Broker Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Select NEPSE Broker
            </label>
            <select
              value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
              className="bg-slate-950/90 border border-slate-800 text-xs rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Brokers (Market-Wide Lead)</option>
              {Object.entries(TOP_NEPSE_BROKERS).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Sector Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sector Filter
            </label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-slate-950/90 border border-slate-800 text-xs rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Sectors</option>
              {availableSectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sort Ranking By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-950/90 border border-slate-800 text-xs rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="netInflow">Highest Net Inflow / Outflow (Rs.)</option>
              <option value="remainingQty">Highest Remaining Qty (Shares)</option>
              <option value="priceAsc">Price: Low to High (LTP ↑)</option>
              <option value="priceDesc">Price: High to Low (LTP ↓)</option>
              <option value="streakDays">Longest Accumulation Streak (Days)</option>
              <option value="bcr5">Top Concentration (BCR5 / SCR3 %)</option>
              <option value="profitMargin">Operator Profit Margin (%)</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Search Symbol / Broker
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. RADHI, Naasa, 58..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 text-xs rounded-xl pl-8 pr-3 py-2 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── DATA TABLE ── */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto opacity-80" />
            <p className="text-sm font-semibold text-slate-300">Scanning 32-day broker floorsheets & ledger...</p>
            <p className="text-xs text-slate-500">Calculating Net Inflows, Inflection Dates, and Safe Buy Zones</p>
          </div>
        ) : filteredStocks.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto opacity-70" />
            <p className="text-sm font-bold text-slate-300">No stocks matching current filters</p>
            <p className="text-xs text-slate-500">Try broadening your broker, sector, or mode selection.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/90 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px] font-black">
                  <th className="py-3.5 px-3 w-12 text-center">#</th>
                  <th className="py-3.5 px-3 min-w-[160px]">Stock & Sector</th>
                  <th className="py-3.5 px-3 min-w-[180px]">Dominant Broker</th>
                  <th className="py-3.5 px-3 min-w-[210px]">Status & Inflection Start</th>
                  <th className="py-3.5 px-3 text-right">Buy Qty</th>
                  <th className="py-3.5 px-3 text-right">Sell Qty</th>
                  <th className="py-3.5 px-3 text-right min-w-[150px]">Remaining Qty & Retention</th>
                  <th className="py-3.5 px-3 text-right min-w-[140px]">Net Inflow Amount</th>
                  <th className="py-3.5 px-3 min-w-[170px]">Broker Avg vs. LTP</th>
                  <th className="py-3.5 px-3 text-right min-w-[130px]">Operator Profit</th>
                  <th className="py-3.5 px-3 text-center w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredStocks.map((stock, idx) => {
                  const isAccum = stock.remainingQty > 0;
                  const isDump = stock.remainingQty < 0;
                  const isAboveCost = stock.ltp >= stock.avgBuyPrice && stock.avgBuyPrice > 0;
                  const profitHigh = stock.unrealizedProfitPct >= 15;

                  return (
                    <tr
                      key={`${stock.symbol}_${stock.brokerId}_${idx}`}
                      onClick={() => setInspectedStock(stock)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* 1. Rank */}
                      <td className="py-3.5 px-3 text-center text-slate-500 font-bold font-mono">
                        {idx + 1}
                      </td>

                      {/* 2. Stock & Sector */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-white group-hover:text-emerald-400 transition-colors">
                            {stock.symbol}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold font-mono ${
                              stock.priceChangePct >= 0
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {stock.priceChangePct >= 0 ? '+' : ''}
                            {stock.priceChangePct}%
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[180px] mt-0.5">
                          {stock.companyName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60 font-semibold">
                            {stock.sector}
                          </span>
                          <span className="text-[10px] text-slate-300 font-bold font-mono">
                            LTP: Rs. {stock.ltp}
                          </span>
                        </div>
                      </td>

                      {/* 3. Dominant Broker */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-black rounded border font-mono ${
                              isAccum
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            #{stock.brokerId}
                          </span>
                          <span className="font-bold text-slate-200 text-xs truncate max-w-[130px]">
                            {stock.brokerName.replace(` (#${stock.brokerId})`, '')}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                          <span>BCR5: {stock.bcr5NetPct}%</span>
                          <span>•</span>
                          <span>SCR3: {stock.scr3NetPct}%</span>
                        </div>
                      </td>

                      {/* 4. Status & Inflection Start */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-black rounded-md border flex items-center gap-1 ${
                              stock.statusIndication.includes('Slowly Accumulating')
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : stock.statusIndication.includes('Pumping')
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : stock.statusIndication.includes('Dumping')
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {stock.statusIndication}
                          </span>
                        </div>

                        {/* Inflection Date & Streak */}
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>
                            Started:{' '}
                            <strong className="text-slate-300 font-mono">
                              {stock.actionStartDate || 'Recent'}
                            </strong>{' '}
                            ({stock.streakDays}d streak, {stock.consistencyPct}% consistency)
                          </span>
                        </div>

                        {/* Syndicate Alert Pill (FollowUp 2) */}
                        {stock.isSyndicateCoAccumulation && (
                          <div className="mt-1 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                            <Sparkles className="w-2.5 h-2.5" />
                            Syndicate ({stock.syndicateBrokers.length} Brokers: #{stock.syndicateBrokers.slice(0, 3).join(', #')})
                          </div>
                        )}
                      </td>

                      {/* 5. Buy Qty */}
                      <td className="py-3.5 px-3 text-right font-mono text-slate-300">
                        {stock.buyQty.toLocaleString()}
                      </td>

                      {/* 6. Sell Qty */}
                      <td className="py-3.5 px-3 text-right font-mono text-slate-400">
                        {stock.sellQty.toLocaleString()}
                      </td>

                      {/* 7. Remaining Qty & Retention */}
                      <td className="py-3.5 px-3 text-right">
                        <div
                          className={`font-black font-mono text-xs ${
                            isAccum ? 'text-emerald-400' : isDump ? 'text-rose-400' : 'text-slate-300'
                          }`}
                        >
                          {stock.remainingQty > 0 ? '+' : ''}
                          {stock.remainingQty.toLocaleString()}{' '}
                          <span className="text-[10px] font-normal text-slate-500">shs</span>
                        </div>
                        {/* Retention ratio progress pill */}
                        {isAccum && (
                          <div className="flex items-center justify-end gap-1.5 mt-1">
                            <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(100, stock.retentionPct)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-emerald-400 font-bold font-mono">
                              {stock.retentionPct}% kept
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 8. Net Inflow Amount */}
                      <td className="py-3.5 px-3 text-right">
                        <div
                          className={`font-black font-mono text-xs ${
                            stock.netInflowAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatNprAmt(stock.netInflowAmount)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Traded: {formatNprAmt(stock.totalTradedAmount).replace('+', '')}
                        </div>
                      </td>

                      {/* 9. Broker Avg vs LTP */}
                      <td className="py-3.5 px-3">
                        <div className="text-[11px] font-mono text-slate-300">
                          Avg Buy: <strong className="text-white">Rs. {stock.avgBuyPrice}</strong>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Avg Sell: Rs. {stock.avgSellPrice}
                        </div>
                        {/* Safe Buy Zone Badge */}
                        <div className="mt-1">
                          {stock.ltp <= stock.buyZoneMax && stock.ltp >= stock.buyZoneMin ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                              🟢 In Safe Buy Zone
                            </span>
                          ) : stock.ltp < stock.buyZoneMin ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                              🟢 Below Cost (Discount)
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                              🟠 Extended Above Zone
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 10. Operator Profit Margin (FollowUp 3) */}
                      <td className="py-3.5 px-3 text-right">
                        <div
                          className={`font-black font-mono text-xs ${
                            stock.unrealizedProfitPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {stock.unrealizedProfitPct >= 0 ? '+' : ''}
                          {stock.unrealizedProfitPct}%
                        </div>
                        {profitHigh ? (
                          <div className="mt-1 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                            <AlertTriangle className="w-2.5 h-2.5" /> Dump Risk
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-500 mt-0.5">
                            {stock.unrealizedProfitPct >= 0 ? 'Holding Gain' : 'Underwater'}
                          </div>
                        )}
                      </td>

                      {/* 11. Action */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectedStock(stock);
                            }}
                            className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 font-bold text-[10px] transition-colors border border-emerald-500/30 flex items-center gap-1"
                            title="Inspect 30-day broker daily tape chart"
                          >
                            <BarChart3 className="w-3 h-3" />
                            Tape
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectStock?.(stock);
                            }}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
                            title="Open full stock analytics"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
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

      {/* ── FOOTER EXPLANATION & NEPSE OPERATOR THESIS CARD ── */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Fiduciary Note:</strong> Net Retention cancels intra-month circular wash trading. Inflection dates are chronologically verified against 32 sessions of authentic NEPSE NOTS exchange records in <code className="text-emerald-400 bg-slate-950 px-1.5 py-0.5 rounded">drabyashree_ledger.db</code>.
          </span>
        </div>
        <div className="shrink-0 flex items-center gap-3 text-[11px] text-slate-500">
          <span>Safe Buy Zone: 0.99x – 1.035x Big Broker VWAP</span>
          <span>•</span>
          <span>T+2 Settlement Compliant</span>
        </div>
      </div>

      {/* ── 30-DAY DAILY BROKER TAPE MODAL / DRAWER ── */}
      {inspectedStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black text-sm">
                  {inspectedStock.symbol}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">
                      {inspectedStock.symbol} — {inspectedStock.companyName}
                    </h3>
                    <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-slate-800 text-slate-300 font-mono border border-slate-700">
                      LTP: Rs. {inspectedStock.ltp}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>Dominant Broker: <strong className="text-emerald-300 font-bold">#{inspectedStock.brokerId} {inspectedStock.brokerName}</strong></span>
                    <span>•</span>
                    <span>Sector: {inspectedStock.sector}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedStock(null)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Stat Highlights Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Net Retained Qty</span>
                  <div className={`text-base font-black font-mono mt-0.5 ${inspectedStock.remainingQty >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {inspectedStock.remainingQty > 0 ? '+' : ''}{inspectedStock.remainingQty.toLocaleString()} shs
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{inspectedStock.retentionPct}% kept of buy flow</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Net Inflow</span>
                  <div className={`text-base font-black font-mono mt-0.5 ${inspectedStock.netInflowAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatNprAmt(inspectedStock.netInflowAmount)}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Traded: {formatNprAmt(inspectedStock.totalTradedAmount)}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Broker Avg vs LTP</span>
                  <div className="text-base font-black font-mono mt-0.5 text-white">
                    Rs. {inspectedStock.avgBuyPrice} <span className="text-xs font-normal text-slate-400">vs {inspectedStock.ltp}</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono ${inspectedStock.unrealizedProfitPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {inspectedStock.unrealizedProfitPct >= 0 ? '+' : ''}{inspectedStock.unrealizedProfitPct}% Profit Margin
                  </span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Active Inflection Streak</span>
                  <div className="text-base font-black font-mono mt-0.5 text-amber-400">
                    {inspectedStock.streakDays} Sessions
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Started: {inspectedStock.actionStartDate || 'Recent'}</span>
                </div>
              </div>

              {/* Visual Daily Net Volume Bar Chart */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Chronological Daily Broker Net Flow (Tape Chart)
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> Net Accumulation</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span> Net Distribution</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/40"></span> Cycle Start Date</span>
                  </div>
                </div>

                {/* Bars Container */}
                {(() => {
                  const series = [...(inspectedStock.dailySeries || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                  if (series.length === 0) {
                    return (
                      <div className="py-12 text-center text-xs text-slate-500">
                        No individual daily series recorded in window.
                      </div>
                    );
                  }
                  const maxNetVol = Math.max(...series.map(s => Math.abs(s.netVol)), 1);

                  return (
                    <div className="space-y-2 pt-2">
                      <div className="h-40 flex items-end gap-1.5 sm:gap-2 px-2 pb-2 pt-6 border-b border-slate-800 relative">
                        {series.map((day, dIdx) => {
                          const isBuy = day.netVol > 0;
                          const heightPct = Math.min(100, Math.max(10, (Math.abs(day.netVol) / maxNetVol) * 100));
                          const isStart = day.date === inspectedStock.actionStartDate;

                          return (
                            <div
                              key={day.date || dIdx}
                              className="flex-1 flex flex-col items-center h-full justify-end group relative"
                            >
                              {/* Inflection Marker Pin */}
                              {isStart && (
                                <div className="absolute -top-3 z-10 flex flex-col items-center">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 ring-4 ring-amber-400/30 animate-pulse"></span>
                                </div>
                              )}

                              {/* Bar */}
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full rounded-t transition-all group-hover:brightness-125 ${
                                  isStart
                                    ? 'bg-amber-400 ring-2 ring-amber-400/50'
                                    : isBuy
                                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20'
                                    : 'bg-rose-500 shadow-sm shadow-rose-500/20'
                                }`}
                              />

                              {/* Tooltip on Hover */}
                              <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col p-2 rounded-xl bg-slate-900 border border-slate-700 shadow-xl text-[10px] z-30 pointer-events-none whitespace-nowrap min-w-[140px]">
                                <span className="font-bold text-white pb-1 border-b border-slate-800">{day.date}</span>
                                <span className={isBuy ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                  Net: {day.netVol > 0 ? '+' : ''}{day.netVol.toLocaleString()} shs
                                </span>
                                <span className="text-slate-400">Buy: {day.buyVol.toLocaleString()} | Sell: {day.sellVol.toLocaleString()}</span>
                                {day.avgBuyPrice ? <span className="text-slate-300">Broker Avg: Rs. {day.avgBuyPrice}</span> : null}
                                {day.close ? <span className="text-slate-400">LTP Close: Rs. {day.close}</span> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* X-Axis Dates */}
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono px-2">
                        <span>{series[0]?.date}</span>
                        <span>{series[Math.floor(series.length / 2)]?.date}</span>
                        <span>{series[series.length - 1]?.date}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Daily Chronological Breakdown Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Daily Chronological Floorsheet Breakdown
                </h4>
                <div className="overflow-x-auto max-h-60 rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="sticky top-0 bg-slate-900/95 backdrop-blur text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3 text-right">Buy Qty</th>
                        <th className="py-2 px-3 text-right">Sell Qty</th>
                        <th className="py-2 px-3 text-right">Net Qty</th>
                        <th className="py-2 px-3 text-right">Broker Rate</th>
                        <th className="py-2 px-3 text-right">Close LTP</th>
                        <th className="py-2 px-3 text-center">Cycle Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                      {[...(inspectedStock.dailySeries || [])]
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                        .map((day, idx) => {
                          const isBuy = day.netVol > 0;
                          const isStart = day.date === inspectedStock.actionStartDate;
                          return (
                            <tr key={day.date || idx} className={`hover:bg-slate-800/40 ${isStart ? 'bg-amber-500/10' : ''}`}>
                              <td className="py-2 px-3 font-bold text-white flex items-center gap-1.5">
                                {day.date}
                                {isStart && (
                                  <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-sans font-bold border border-amber-500/30">
                                    Cycle Start
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-300">{day.buyVol.toLocaleString()}</td>
                              <td className="py-2 px-3 text-right text-slate-400">{day.sellVol.toLocaleString()}</td>
                              <td className={`py-2 px-3 text-right font-black ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {day.netVol > 0 ? '+' : ''}{day.netVol.toLocaleString()}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-200">
                                {day.avgBuyPrice ? `Rs. ${day.avgBuyPrice}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-300">
                                {day.close ? `Rs. ${day.close}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-center font-sans text-[10px]">
                                {isBuy ? (
                                  <span className="text-emerald-400 font-bold">Accumulating</span>
                                ) : day.netVol < 0 ? (
                                  <span className="text-rose-400 font-bold">Dumping</span>
                                ) : (
                                  <span className="text-slate-500">Neutral</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/80">
              <span className="text-xs text-slate-400">
                Verified against 32-day NEPSE exchange ledger
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectStock?.(inspectedStock);
                    setInspectedStock(null);
                  }}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Full Stock Analytics
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
