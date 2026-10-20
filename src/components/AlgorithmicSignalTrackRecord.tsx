// src/components/AlgorithmicSignalTrackRecord.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RotateCw,
  Search,
  Percent,
  Award,
  Zap,
  Briefcase,
  ChevronRight,
  Calendar,
  Layers,
  Building2,
  ExternalLink,
  Flame
} from 'lucide-react';
import { getProxyBase } from '../utils/liveData';

export interface AlgorithmicSignal {
  signal_id: string;
  symbol: string;
  sector: string;
  signal_date: string;
  t2_unlock_date: string;
  signal_type: 'EARLY_IGNITION_3D' | 'STEALTH_ACCUMULATION' | 'SYNDICATE_ROTATION' | string;
  entry_price: number;
  broker_vwap: number;
  lead_broker_id: string;
  lead_broker_name: string;
  bcr5_net_pct: number;
  scr3_net_pct: number;
  ignition_score: number;
  stop_loss_price: number;
  target1_price: number;
  target2_price: number;
  status: 'WIN_T1' | 'WIN_T2' | 'STOPPED_OUT' | 'OPEN_ACTIVE' | string;
  exit_date: string | null;
  exit_price: number;
  peak_price: number;
  max_gain_pct: number;
  gross_pnl_pct: number;
  net_pnl_after_fees_pct: number;
  holding_days: number;
  current_ltp?: number;
  vwap_diff_pct?: number;
  vwap_zone?: 'BELOW_VWAP' | 'AT_VWAP' | 'ABOVE_VWAP' | string;
  live_risk_to_sl_pct?: number;
  live_reward_to_t1_pct?: number;
  strategy?: string;
  entry_vwap?: number;
  entry_turnover_npr?: number;
  mfe_pct?: number;
  mae_pct?: number;
  gross_return_pct?: number;
  net_return_pct?: number;
  nepse_alpha_pct?: number;
  primary_broker_id?: number | null;
  broker_anomaly_score?: number;
  avg_ticket_kitta?: number;
  market_regime?: string;
  is_ratchet_armed?: number;
  active_stop_price?: number;
  settlement_unlock_date?: string;
}

export interface InstitutionalStrategyMetric {
  strategy: string;
  total_tradable_signals: number;
  skipped_circuit_traps: number;
  verified_win_rate_pct: number;
  net_expectancy_pct: number;
  avg_nepse_alpha_pct: number;
  profit_factor: number;
  avg_mfe_pct: number;
  avg_mae_pct: number;
  avg_holding_days: number;
}

export interface SignalSummary {
  totalSignals: number;
  closedSignals: number;
  openSignals: number;
  winCount: number;
  lossCount: number;
  verifiedWinRatePct: number;
  avgNetReturnPct: number;
  profitFactor: number;
  expectancyPct: number;
  topBroker: string;
  topStrategy: string;
  datasetTradingDates: number;
  oldestDate: string;
  newestDate: string;
  t2InvariantVerified: boolean;
  strategyMetrics?: InstitutionalStrategyMetric[];
}

export interface BrokerPerformance {
  brokerId: string;
  brokerName: string;
  totalSignals: number;
  closedSignals: number;
  openSignals: number;
  winCount: number;
  lossCount: number;
  winRatePct: number;
  avgNetReturnPct: number;
  institutionalAlphaScore?: number;
  bestStock: {
    symbol: string;
    maxGainPct: number;
  };
}

export interface StrategyPerformance {
  signalType: string;
  totalSignals: number;
  closedSignals: number;
  openSignals: number;
  winCount: number;
  lossCount: number;
  stoppedOutCount?: number;
  timeExpiredCount?: number;
  winRatePct: number;
  avgNetReturnPct: number;
}

interface AlgorithmicSignalTrackRecordProps {
  isOpen?: boolean;
  onClose?: () => void;
  inlineMode?: boolean;
  marketStocks?: any[];
  onSelectStock?: (symbol: string) => void;
}

export function AlgorithmicSignalTrackRecord({
  isOpen = true,
  onClose,
  inlineMode = false,
  marketStocks = [],
  onSelectStock,
}: AlgorithmicSignalTrackRecordProps) {
  const [signals, setSignals] = useState<AlgorithmicSignal[]>([]);
  const [summary, setSummary] = useState<SignalSummary | null>(null);
  const [strategyBreakdown, setStrategyBreakdown] = useState<Record<string, StrategyPerformance>>({});
  const [brokerLeaderboard, setBrokerLeaderboard] = useState<BrokerPerformance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [brokerFilter, setBrokerFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'dateDesc' | 'netPnlDesc' | 'maxGainDesc' | 'vwapDiscount'>('dateDesc');

  // Lock body scroll in modal mode
  useEffect(() => {
    if (isOpen && !inlineMode && typeof document !== 'undefined') {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, inlineMode]);

  // Fetch track record data from backend
  const fetchTrackRecord = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      const base = getProxyBase() || '';
      const res = await fetch(`${base}/api/radar/signal-track-record`);
      if (!res.ok) {
        throw new Error(`Failed to load track record (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data && data.success) {
        setSignals(data.signals || []);
        setSummary(data.summary || null);
        setStrategyBreakdown(data.strategyBreakdown || {});
        setBrokerLeaderboard(data.brokerLeaderboard || []);
      } else {
        throw new Error(data?.message || 'Failed to retrieve signal track record');
      }
    } catch (err: any) {
      console.warn('[SignalTrackRecord] Fetch error:', err.message);
      setError(err.message || 'Error connecting to track record service');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTrackRecord();
    }
  }, [isOpen]);

  // Unique sectors for filter dropdown
  const uniqueSectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of signals) {
      if (s.sector) set.add(s.sector);
    }
    return Array.from(set).sort();
  }, [signals]);

  // Unique brokers for filter dropdown
  const uniqueBrokers = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of signals) {
      if (s.lead_broker_id) {
        map.set(s.lead_broker_id, s.lead_broker_name || `Broker #${s.lead_broker_id}`);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [signals]);

  // Client-side filtering & sorting for instant sub-millisecond tab switching
  const filteredSignals = useMemo(() => {
    let result = [...signals];

    // Status filter
    if (statusFilter === 'WINS') {
      result = result.filter((s) => s.status && (s.status.startsWith('WIN') || s.status === 'TARGET_HIT' || s.status === 'RATCHET_STOP_WIN'));
    } else if (statusFilter === 'OPEN_ACTIVE') {
      result = result.filter((s) => s.status === 'OPEN_ACTIVE' || s.status === 'ACTIVE');
    } else if (statusFilter === 'STOPPED_OUT') {
      result = result.filter((s) => s.status === 'STOPPED_OUT' || s.status === 'STOP_LOSS' || s.status === 'TIME_EXPIRED' || s.status === 'TIME_STOP_STALE');
    }

    // Sector filter
    if (sectorFilter !== 'ALL') {
      result = result.filter((s) => s.sector === sectorFilter);
    }

    // Strategy filter
    if (strategyFilter !== 'ALL') {
      result = result.filter((s) => s.signal_type === strategyFilter);
    }

    // Broker filter
    if (brokerFilter !== 'ALL') {
      result = result.filter((s) => String(s.lead_broker_id) === String(brokerFilter));
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          (s.symbol && s.symbol.toLowerCase().includes(q)) ||
          (s.sector && s.sector.toLowerCase().includes(q)) ||
          (s.lead_broker_name && s.lead_broker_name.toLowerCase().includes(q)) ||
          String(s.lead_broker_id || '').includes(q) ||
          (s.signal_type && s.signal_type.toLowerCase().includes(q))
      );
    }

    // Sorting
    if (sortBy === 'vwapDiscount') {
      result.sort((a, b) => {
        const aOpen = a.status === 'OPEN_ACTIVE' ? 0 : 1;
        const bOpen = b.status === 'OPEN_ACTIVE' ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        const aLtp = Number(a.exit_price ?? a.entry_price ?? 0);
        const bLtp = Number(b.exit_price ?? b.entry_price ?? 0);
        const aDiff =
          a.vwap_diff_pct !== undefined
            ? a.vwap_diff_pct
            : (a.broker_vwap && a.broker_vwap > 0)
            ? ((aLtp - a.broker_vwap) / a.broker_vwap) * 100
            : 0;
        const bDiff =
          b.vwap_diff_pct !== undefined
            ? b.vwap_diff_pct
            : (b.broker_vwap && b.broker_vwap > 0)
            ? ((bLtp - b.broker_vwap) / b.broker_vwap) * 100
            : 0;
        return aDiff - bDiff;
      });
    } else if (sortBy === 'netPnlDesc') {
      result.sort((a, b) => (b.net_pnl_after_fees_pct ?? 0) - (a.net_pnl_after_fees_pct ?? 0));
    } else if (sortBy === 'maxGainDesc') {
      result.sort((a, b) => (b.max_gain_pct ?? 0) - (a.max_gain_pct ?? 0));
    } else {
      // dateDesc
      result.sort(
        (a, b) =>
          String(b.signal_date).localeCompare(String(a.signal_date)) ||
          (b.net_pnl_after_fees_pct ?? 0) - (a.net_pnl_after_fees_pct ?? 0)
      );
    }

    return result;
  }, [signals, statusFilter, sectorFilter, strategyFilter, brokerFilter, searchQuery, sortBy]);

  // Safe number formatter helper
  const fmtRs = (val: any, fallback = '—') => {
    if (val == null || isNaN(Number(val))) return fallback;
    return Number(val).toLocaleString();
  };

  // Helper for VWAP discount badge
  const renderVwapBadge = (s: AlgorithmicSignal) => {
    const ltp = Number(s.exit_price ?? s.entry_price ?? 0);
    const diff =
      s.vwap_diff_pct !== undefined
        ? s.vwap_diff_pct
        : (s.broker_vwap && s.broker_vwap > 0)
        ? Number((((ltp - s.broker_vwap) / s.broker_vwap) * 100).toFixed(2))
        : 0;

    if (diff <= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
          🔥 {Math.abs(diff).toFixed(2)}% BELOW VWAP
        </span>
      );
    }
    if (diff <= 1.5) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm">
          ✅ +{diff.toFixed(2)}% AT VWAP
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
        ⚠️ +{diff.toFixed(2)}% ABOVE VWAP
      </span>
    );
  };

  // Helper for status badge rendering
  const renderStatusBadge = (s: AlgorithmicSignal) => {
    if (s.status === 'WIN_T2') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          WIN T2 (T2 Hit)
        </span>
      );
    }
    if (s.status === 'WIN_T1') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
          WIN T1 (T1 Locked)
        </span>
      );
    }
    if (s.status === 'STOPPED_OUT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          STOPPED (SL Hit)
        </span>
      );
    }
    if (s.status === 'WIN_RATCHET_STOP' || s.status === 'RATCHET_STOP_WIN') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          RATCHET WIN (T+{s.holding_days})
        </span>
      );
    }
    if (s.status === 'TARGET_HIT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          TARGET HIT
        </span>
      );
    }
    if (s.status === 'STOP_LOSS') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          STOP LOSS
        </span>
      );
    }
    if (s.status === 'TIME_EXPIRED' || s.status === 'TIME_STOP_STALE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-700/60 text-slate-300 border border-slate-600/60">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {s.status === 'TIME_STOP_STALE' ? 'STALE EJECT' : 'TIME EXPIRED'} (T+{s.holding_days})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
        <Clock className="w-3.5 h-3.5 text-amber-400" />
        OPEN ACTIVE (T+{s.holding_days})
      </span>
    );
  };

  // Helper for strategy type badge
  const renderStrategyBadge = (type: string) => {
    if (type === 'EARLY_IGNITION_3D') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          <Zap className="w-3 h-3 text-cyan-400" />
          Early Ignition (3D)
        </span>
      );
    }
    if (type === 'STEALTH_ACCUMULATION') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          Stealth Accumulation
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
        <Briefcase className="w-3 h-3 text-purple-400" />
        Syndicate Rotation
      </span>
    );
  };

  if (!isOpen) return null;

  const content = (
    <div className="flex flex-col h-full bg-[#0d131f] text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* ── HEADER BAR ── */}
      <div className="px-5 py-4 border-b border-slate-800/80 bg-[#0f172a]/90 backdrop-blur flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/30 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/40">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-black text-white tracking-tight">
                Algorithmic Signal Track Record
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Walk-Forward Audit
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Zero look-ahead 32-session historical simulation with strict NEPSE T+2 settlement lock & 1.1% fee friction
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTrackRecord}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition-colors shadow-sm disabled:opacity-50"
            title="Re-run walk-forward simulation from current database"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{isRefreshing ? 'Auditing...' : 'Refresh Audit'}</span>
          </button>

          {!inlineMode && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-5">
        {/* TOP 4 EMPIRICAL KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Verified T+2 Win Rate */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900/90 to-slate-900/40 border border-emerald-500/30 p-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Verified T+2 Win Rate
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                T+2 Invariant
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400 tracking-tight">
                {summary ? `${summary.verifiedWinRatePct}%` : '...'}
              </span>
              <span className="text-xs text-slate-400">
                {summary ? `(${summary.winCount}/${summary.closedSignals} Closed)` : ''}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 leading-snug">
              Every closed trade held strictly for <span className="text-emerald-300 font-medium">≥2 sessions</span> before exit execution.
            </div>
          </div>

          {/* Card 2: Net Expectancy & Profit Factor */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900/90 to-slate-900/40 border border-teal-500/30 p-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-teal-400" />
                Net Expectancy
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300">
                -1.1% Fees
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-black tracking-tight ${
                  (summary?.avgNetReturnPct ?? 0) >= 0 ? 'text-teal-400' : 'text-rose-400'
                }`}
              >
                {summary
                  ? `${summary.avgNetReturnPct >= 0 ? '+' : ''}${summary.avgNetReturnPct}%`
                  : '...'}
              </span>
              <span className="text-xs text-slate-400">
                PF: <span className="text-slate-200 font-bold">{summary?.profitFactor ?? 1.0}x</span>
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 leading-snug">
              Average net return per trade after deducting <span className="text-teal-300 font-medium">1.1% statutory friction</span>.
            </div>
          </div>

          {/* Card 3: Open Active Signals (Post-Dashain Watchlist) */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900/90 to-slate-900/40 border border-amber-500/30 p-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Open Active Signals
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                Post-Dashain
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-400 tracking-tight">
                {summary ? summary.openSignals : '...'}
              </span>
              <span className="text-xs text-slate-400">Scrips Active</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 leading-snug">
              Pre-positioned institutional momentum ready for <span className="text-amber-300 font-medium">Monday, Oct 26</span> market reopen.
            </div>
          </div>

          {/* Card 4: Top Performing Strategy & Broker */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900/90 to-slate-900/40 border border-purple-500/30 p-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-purple-400" />
                Top Strategy & Broker
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300">
                Alpha Lead
              </span>
            </div>
            <div className="truncate">
              <div className="text-sm font-black text-purple-300 truncate">
                {summary?.topStrategy || 'Stealth Accumulation'}
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5">
                {summary?.topBroker || 'Broker Leaderboard'}
              </div>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 leading-snug">
              Highest historical win-rate follow-through when lead accumulation triggers.
            </div>
          </div>
        </div>

        {/* BROKER WIN-RATE LEADERBOARD STRIP */}
        <div className="rounded-xl bg-slate-900/70 border border-slate-800/80 p-4 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                Broker House Follow-Through Leaderboard
              </h2>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                (Accuracy when lead broker is accumulating)
              </span>
            </div>
            <span className="text-xs text-slate-400">
              {brokerLeaderboard.length} Broker Houses Analyzed
            </span>
          </div>

          {brokerLeaderboard.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500">
              No broker records generated yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {brokerLeaderboard.slice(0, 6).map((b) => (
                <div
                  key={b.brokerId}
                  onClick={() => setBrokerFilter(brokerFilter === b.brokerId ? 'ALL' : b.brokerId)}
                  className={`cursor-pointer rounded-lg p-2.5 transition-all border ${
                    brokerFilter === b.brokerId
                      ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/40'
                      : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 truncate">
                    <span className="truncate">#{b.brokerId} {b.brokerName.split(' ')[0]}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        b.winRatePct >= 60
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : b.winRatePct >= 40
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {b.winRatePct}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5">
                    <span>
                      {b.winCount}W / {b.lossCount}L
                    </span>
                    <span className={b.avgNetReturnPct >= 0 ? 'text-teal-400' : 'text-rose-400'}>
                      {b.avgNetReturnPct >= 0 ? '+' : ''}{b.avgNetReturnPct}%
                    </span>
                  </div>
                  {b.bestStock && b.bestStock.symbol && (
                    <div className="mt-1 text-[9px] text-slate-400 truncate">
                      Best: <span className="text-slate-200 font-bold">{b.bestStock.symbol}</span> (+{b.bestStock.maxGainPct}%)
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── INTERACTIVE FILTER BAR ── */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Status Pills & VWAP Discount Sort */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300'
                }`}
              >
                All Signals ({signals.length})
              </button>
              <button
                onClick={() => setStatusFilter('OPEN_ACTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'OPEN_ACTIVE'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-950/40'
                    : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300'
                }`}
              >
                ⏳ Open Active ({summary?.openSignals ?? 0})
              </button>
              <button
                onClick={() => setStatusFilter('WINS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'WINS'
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-950/40'
                    : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300'
                }`}
              >
                🏆 Verified Wins ({summary?.winCount ?? 0})
              </button>
              <button
                onClick={() => setStatusFilter('STOPPED_OUT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === 'STOPPED_OUT'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                    : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300'
                }`}
              >
                🔴 Stopped / Expired ({summary?.lossCount ?? 0})
              </button>

              <div className="h-4 w-px bg-slate-700/60 mx-1 hidden sm:block" />

              <button
                onClick={() => setSortBy(sortBy === 'vwapDiscount' ? 'dateDesc' : 'vwapDiscount')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  sortBy === 'vwapDiscount'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/40 border border-emerald-400/40 ring-1 ring-emerald-400/40'
                    : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30'
                }`}
                title="Sort by lowest price relative to lead broker VWAP (deepest discount inside safe buy zone)"
              >
                <Flame className={`w-3.5 h-3.5 ${sortBy === 'vwapDiscount' ? 'text-amber-300 animate-pulse' : 'text-emerald-400'}`} />
                <span>🔥 Best VWAP Discount (Buy Zone)</span>
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-medium">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="dateDesc">Signal Date (Newest)</option>
                <option value="vwapDiscount">🔥 Best VWAP Discount (Buy Zone)</option>
                <option value="netPnlDesc">Highest Net Return %</option>
                <option value="maxGainDesc">Highest Peak Gain %</option>
              </select>
            </div>
          </div>

          {/* Sub Filters: Strategy, Broker & Search */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-slate-800/60">
            {/* Search Box */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search symbol, sector or broker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-800/80 border border-slate-700/70 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Sector Select */}
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Sectors ({uniqueSectors.length})</option>
              {uniqueSectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>

            {/* Strategy Select */}
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Strategies</option>
              <option value="EARLY_IGNITION_3D">Early Ignition (3D)</option>
              <option value="STEALTH_ACCUMULATION">Stealth Accumulation</option>
              <option value="SYNDICATE_ROTATION">Syndicate Rotation</option>
            </select>

            {/* Broker Select */}
            <select
              value={brokerFilter}
              onChange={(e) => setBrokerFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Brokers</option>
              {uniqueBrokers.map((b) => (
                <option key={b.id} value={b.id}>
                  #{b.id} {b.name}
                </option>
              ))}
            </select>

            {(statusFilter !== 'ALL' || sectorFilter !== 'ALL' || strategyFilter !== 'ALL' || brokerFilter !== 'ALL' || searchQuery || sortBy !== 'dateDesc') && (
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setSectorFilter('ALL');
                  setStrategyFilter('ALL');
                  setBrokerFilter('ALL');
                  setSearchQuery('');
                  setSortBy('dateDesc');
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold px-2 py-1"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* ── FULL AUDIT TABLE ── */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b1120] text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3.5">Signal & T+2 Unlock</th>
                  <th className="py-3 px-3.5">Symbol & Sector</th>
                  <th className="py-3 px-3.5">Strategy & Lead Broker</th>
                  <th className="py-3 px-3.5 text-right">Entry / Broker VWAP</th>
                  <th className="py-3 px-3.5 text-center">Targets (T1 / T2 / SL)</th>
                  <th className="py-3 px-3.5 text-right">Exit / LTP (Peak)</th>
                  <th className="py-3 px-3.5 text-right">Net Return (After Fees)</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RotateCw className="w-6 h-6 animate-spin text-emerald-400" />
                        <span>Running zero look-ahead walk-forward simulation across 32 sessions...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSignals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      No signals match your selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSignals.map((s) => {
                    return (
                      <tr
                        key={s.signal_id}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                        onClick={() => onSelectStock && onSelectStock(s.symbol)}
                      >
                        {/* Signal Date & T+2 Unlock */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-200">{s.signal_date}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-2.5 h-2.5 text-teal-400" />
                            <span>Unlock: {s.t2_unlock_date}</span>
                          </div>
                        </td>

                        {/* Symbol & Sector */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <div className="font-black text-white text-sm tracking-tight flex items-center gap-1.5">
                            <span>{s.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-normal">
                              Score: {s.ignition_score}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                            {s.sector || 'Equities'}
                          </div>
                        </td>

                        {/* Strategy & Lead Broker */}
                        <td className="py-2.5 px-3.5">
                          <div className="flex flex-col gap-1">
                            <div>{renderStrategyBadge(s.signal_type)}</div>
                            <div className="text-[11px] text-slate-300 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[140px]">
                                {s.lead_broker_name || `Broker #${s.lead_broker_id}`}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Entry Price & VWAP Margin Badge */}
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-200">Rs. {fmtRs(s.entry_price)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            VWAP: Rs. {fmtRs(s.broker_vwap || s.entry_price)}
                          </div>
                          <div className="mt-1">
                            {renderVwapBadge(s)}
                          </div>
                        </td>

                        {/* Targets (T1 / T2 / SL) & Live Reward-to-Risk */}
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 text-[11px]">
                            <span className="text-teal-400 font-semibold" title="Target 1">
                              T1: {s.target1_price}
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="text-emerald-400 font-semibold" title="Target 2">
                              T2: {s.target2_price}
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="text-rose-400 font-semibold" title="Stop Loss">
                              SL: {s.stop_loss_price}
                            </span>
                          </div>
                          {s.status === 'OPEN_ACTIVE' && (
                            <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-bold">
                              <span
                                className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30"
                                title="Live potential gain to Target 1"
                              >
                                +{s.live_reward_to_t1_pct !== undefined ? s.live_reward_to_t1_pct : ((((s.target1_price - (s.exit_price || s.entry_price || 1)) / (s.exit_price || s.entry_price || 1)) * 100).toFixed(1))}% to T1
                              </span>
                              <span className="text-slate-500">/</span>
                              <span
                                className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/30"
                                title="Live potential risk to Stop Loss"
                              >
                                -{s.live_risk_to_sl_pct !== undefined ? s.live_risk_to_sl_pct : (((((s.exit_price || s.entry_price || 1) - s.stop_loss_price) / (s.exit_price || s.entry_price || 1)) * 100).toFixed(1))}% to SL
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Exit / Current LTP & Peak */}
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-200">
                            Rs. {fmtRs(s.exit_price || s.entry_price)}
                          </div>
                          <div className="text-[10px] text-emerald-400">
                            Peak: Rs. {fmtRs(s.peak_price || s.entry_price)} (+{s.max_gain_pct ?? 0}%)
                          </div>
                        </td>

                        {/* Net Return % After 1.1% Fees */}
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div
                            className={`font-black text-sm ${
                              s.net_pnl_after_fees_pct > 0
                                ? 'text-emerald-400'
                                : s.net_pnl_after_fees_pct < 0
                                ? 'text-rose-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {s.net_pnl_after_fees_pct > 0 ? '+' : ''}
                            {s.net_pnl_after_fees_pct}%
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Gross: {s.gross_pnl_pct > 0 ? `+${s.gross_pnl_pct}%` : `${s.gross_pnl_pct}%`}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                          {renderStatusBadge(s)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Telemetry */}
          <div className="px-4 py-3 bg-[#0b1120] border-t border-slate-800 text-slate-400 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              Showing <span className="text-white font-bold">{filteredSignals.length}</span> of{' '}
              <span className="text-white font-bold">{signals.length}</span> signals across{' '}
              <span className="text-emerald-400 font-bold">{summary?.datasetTradingDates ?? 32}</span> verified sessions
            </div>
            <div className="text-[11px] text-slate-400">
              * Net return reflects statutory SEBON + DP fee + broker commission friction (1.1% round-trip)
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // If inline mode (e.g. ServicesHub tab), render directly
  if (inlineMode) {
    return <div className="w-full min-h-[600px]">{content}</div>;
  }

  // Modal mode (e.g. Dashboard popup)
  return (
    <div 
      className="fixed inset-0 flex items-start sm:items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150"
      style={{ zIndex: 99999 }}
    >
      <div className="relative w-full max-w-6xl h-[92vh] max-h-[92vh] rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl flex flex-col bg-[#0d131f] my-auto shrink-0">
        {content}
      </div>
    </div>
  );
}
export default AlgorithmicSignalTrackRecord;
