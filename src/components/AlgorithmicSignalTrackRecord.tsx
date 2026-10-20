// File: src/components/AlgorithmicSignalTrackRecord.tsx
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
  Flame,
  Shield,
  Activity
} from 'lucide-react';
import { getProxyBase } from '../utils/liveData';

export type SignalStrategy = 'EARLY_IGNITION_3D' | 'STEALTH_ACCUMULATION' | 'SYNDICATE_ROTATION' | string;
export type SignalStatus =
  | 'ACTIVE'
  | 'OPEN_ACTIVE'
  | 'TARGET_HIT'
  | 'WIN_T1'
  | 'WIN_T2'
  | 'RATCHET_STOP_WIN'
  | 'WIN_RATCHET_STOP'
  | 'TIME_STOP_STALE'
  | 'TIME_EXPIRED'
  | 'STOP_LOSS'
  | 'STOPPED_OUT'
  | 'UNFILLABLE_SKIP'
  | string;

export type MarketRegime = 'BULL' | 'SIDEWAYS' | 'BEAR' | 'QUARTER_END_PRESSURE' | string;

export interface SignalLedgerRow {
  signal_id: string;
  symbol: string;
  sector: string;
  strategy: SignalStrategy;
  signal_type?: string;
  signal_date: string;
  trigger_ltp: number;
  initial_risk_pct: number;
  reward_multiple: number;
  entry_date: string | null;
  entry_vwap: number | null;
  entry_price?: number;
  entry_turnover_npr: number;
  broker_vwap?: number;
  lead_broker_id?: string;
  lead_broker_name?: string;
  target_price: number | null;
  target1_price?: number;
  target2_price?: number;
  initial_stop_price: number | null;
  stop_loss_price?: number;
  active_stop_price: number | null;
  is_ratchet_armed: number; // 1 = armed at Entry + 1.2%, 0 = initial stop
  settlement_unlock_date: string | null;
  t2_unlock_date?: string;
  status: SignalStatus;
  exit_date: string | null;
  exit_price: number | null;
  peak_price?: number;
  holding_days: number;
  mfe_pct: number;
  mae_pct: number;
  max_gain_pct?: number;
  gross_return_pct: number;
  gross_pnl_pct?: number;
  net_return_pct: number;
  net_pnl_after_fees_pct?: number;
  nepse_index_return_pct: number;
  nepse_alpha_pct: number;
  primary_broker_id: number | null;
  broker_anomaly_score: number;
  avg_ticket_kitta: number;
  market_regime: MarketRegime;
  current_ltp?: number;
  vwap_diff_pct?: number;
  vwap_zone?: string;
  live_risk_to_sl_pct?: number;
  live_reward_to_t1_pct?: number;
  ignition_score?: number;
  bcr5_net_pct?: number;
  scr3_net_pct?: number;
}

export interface StrategyInstitutionalMetric {
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

export interface BrokerLeaderboardRow {
  brokerId: number | string;
  brokerName?: string;
  auditedSignals?: number;
  totalSignals?: number;
  avgAnomalyScore?: number;
  avgTicketKitta?: number;
  postFeeWinRatePct?: number;
  winRatePct?: number;
  winCount?: number;
  lossCount?: number;
  avgNetReturnPct: number;
  avgNepseAlphaPct?: number;
  bestStock?: {
    symbol: string;
    maxGainPct: number;
  };
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
  strategyMetrics?: StrategyInstitutionalMetric[];
}

export interface AlgorithmicSignalTrackRecordProps {
  signals?: SignalLedgerRow[];
  strategyMetrics?: StrategyInstitutionalMetric[];
  brokerLeaderboard?: BrokerLeaderboardRow[];
  isOpen?: boolean;
  onClose?: () => void;
  inlineMode?: boolean;
  marketStocks?: any[];
  onSelectStock?: (symbol: string) => void;
  onSelectSymbol?: (symbol: string) => void;
  onRebuildTrackRecord?: () => Promise<void>;
  isRebuilding?: boolean;
}

type SortField =
  | 'signal_date'
  | 'net_return_pct'
  | 'nepse_alpha_pct'
  | 'mfe_pct'
  | 'broker_anomaly_score'
  | 'vwapDiscount';

const STATUS_BADGE_CONFIG: Record<
  string,
  { label: string; className: string; dotClass: string }
> = {
  TARGET_HIT: {
    label: 'Target Hit',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dotClass: 'bg-emerald-400',
  },
  WIN_T2: {
    label: 'WIN T2 (T2 Hit)',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dotClass: 'bg-emerald-400',
  },
  WIN_T1: {
    label: 'WIN T1 (T1 Locked)',
    className: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    dotClass: 'bg-teal-400',
  },
  RATCHET_STOP_WIN: {
    label: 'Ratchet Win (+1.2R Lock)',
    className: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    dotClass: 'bg-teal-400',
  },
  WIN_RATCHET_STOP: {
    label: 'Ratchet Win (+1.2R Lock)',
    className: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    dotClass: 'bg-teal-400',
  },
  ACTIVE: {
    label: 'Active (T+2 Live)',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dotClass: 'bg-sky-400 animate-pulse',
  },
  OPEN_ACTIVE: {
    label: 'Active (T+2 Live)',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dotClass: 'bg-sky-400 animate-pulse',
  },
  TIME_STOP_STALE: {
    label: 'Time-Stop (10D Stale)',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dotClass: 'bg-amber-400',
  },
  TIME_EXPIRED: {
    label: 'Time-Stop Expired',
    className: 'bg-slate-700/60 text-slate-300 border-slate-600/60',
    dotClass: 'bg-slate-400',
  },
  STOP_LOSS: {
    label: 'Stop Loss',
    className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-400',
  },
  STOPPED_OUT: {
    label: 'Stopped Out (SL Hit)',
    className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-400',
  },
  UNFILLABLE_SKIP: {
    label: 'Skipped (Circuit/Illiquid)',
    className: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
    dotClass: 'bg-slate-500',
  },
};

const TRACK_RECORD_CACHE_KEY = 'drabyashree_signal_track_record_v2';

function getStoredTrackRecordCache(): {
  signals?: SignalLedgerRow[];
  summary?: SignalSummary | null;
  strategyMetrics?: StrategyInstitutionalMetric[];
  brokerLeaderboard?: BrokerLeaderboardRow[];
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TRACK_RECORD_CACHE_KEY) || localStorage.getItem(TRACK_RECORD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.signals) && parsed.signals.length > 0) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

export function AlgorithmicSignalTrackRecord({
  signals: propSignals,
  strategyMetrics: propStrategyMetrics,
  brokerLeaderboard: propBrokerLeaderboard,
  isOpen = true,
  onClose,
  inlineMode = false,
  marketStocks = [],
  onSelectStock,
  onSelectSymbol,
  onRebuildTrackRecord,
  isRebuilding = false,
}: AlgorithmicSignalTrackRecordProps) {
  // Instant SWR Cache Hydration (0ms load on open)
  const cachedData = useMemo(() => getStoredTrackRecordCache(), []);

  // State for fetched telemetry if not passed via props
  const [fetchedSignals, setFetchedSignals] = useState<SignalLedgerRow[]>(() => cachedData?.signals || []);
  const [fetchedStrategyMetrics, setFetchedStrategyMetrics] = useState<StrategyInstitutionalMetric[]>(() => cachedData?.strategyMetrics || []);
  const [fetchedBrokerLeaderboard, setFetchedBrokerLeaderboard] = useState<BrokerLeaderboardRow[]>(() => cachedData?.brokerLeaderboard || []);
  const [serverSummary, setServerSummary] = useState<SignalSummary | null>(() => cachedData?.summary || null);
  const [isLoading, setIsLoading] = useState<boolean>(() => !cachedData?.signals?.length && (!propSignals || propSignals.length === 0));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & View State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRegime, setSelectedRegime] = useState<string>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [minAnomalyScore, setMinAnomalyScore] = useState<number>(0);
  const [hideUnfillable, setHideUnfillable] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'BROKER_LEADERBOARD'>('LEDGER');

  // Sorting State
  const [sortField, setSortField] = useState<SortField>('signal_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Handle stock selection callback
  const handleStockClick = (symbol: string) => {
    if (onSelectSymbol) onSelectSymbol(symbol);
    if (onSelectStock) onSelectStock(symbol);
  };

  // Fetch signals if propSignals not provided
  const fetchTrackRecord = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setIsRefreshing(true);
      setError(null);
      const base = getProxyBase() || '';
      const res = await fetch(`${base}/api/radar/signal-track-record`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && (data.signals || data.success)) {
        const rawSignals: any[] = data.signals || [];
        // Map any legacy property names seamlessly to institutional schema
        const normalized: SignalLedgerRow[] = rawSignals.map((s) => ({
          signal_id: s.signal_id || `${s.symbol}_${s.signal_date}`,
          symbol: s.symbol,
          sector: s.sector || 'Others',
          strategy: s.strategy || s.signal_type || 'STEALTH_ACCUMULATION',
          signal_type: s.signal_type || s.strategy,
          signal_date: s.signal_date,
          trigger_ltp: Number(s.trigger_ltp ?? s.entry_price ?? 0),
          initial_risk_pct: Number(s.initial_risk_pct ?? 5.0),
          reward_multiple: Number(s.reward_multiple ?? 2.2),
          entry_date: s.entry_date ?? s.signal_date,
          entry_vwap: s.entry_vwap ?? s.entry_price ?? 0,
          entry_price: s.entry_price ?? s.entry_vwap ?? 0,
          entry_turnover_npr: Number(s.entry_turnover_npr ?? 0),
          broker_vwap: Number(s.broker_vwap ?? 0),
          lead_broker_id: s.lead_broker_id ? String(s.lead_broker_id) : undefined,
          lead_broker_name: s.lead_broker_name || (s.lead_broker_id ? `Broker #${s.lead_broker_id}` : undefined),
          target_price: Number(s.target_price ?? s.target1_price ?? 0),
          target1_price: Number(s.target1_price ?? s.target_price ?? 0),
          target2_price: Number(s.target2_price ?? 0),
          initial_stop_price: Number(s.initial_stop_price ?? s.stop_loss_price ?? 0),
          stop_loss_price: Number(s.stop_loss_price ?? s.initial_stop_price ?? 0),
          active_stop_price: Number(s.active_stop_price ?? s.stop_loss_price ?? 0),
          is_ratchet_armed: Number(s.is_ratchet_armed ?? 0),
          settlement_unlock_date: s.settlement_unlock_date ?? s.t2_unlock_date ?? null,
          t2_unlock_date: s.t2_unlock_date ?? s.settlement_unlock_date,
          status: s.status || 'ACTIVE',
          exit_date: s.exit_date || null,
          exit_price: s.exit_price != null ? Number(s.exit_price) : null,
          peak_price: s.peak_price != null ? Number(s.peak_price) : undefined,
          holding_days: Number(s.holding_days ?? 0),
          mfe_pct: Number(s.mfe_pct ?? s.max_gain_pct ?? 0),
          mae_pct: Number(s.mae_pct ?? 0),
          max_gain_pct: Number(s.max_gain_pct ?? s.mfe_pct ?? 0),
          gross_return_pct: Number(s.gross_return_pct ?? s.gross_pnl_pct ?? 0),
          gross_pnl_pct: Number(s.gross_pnl_pct ?? s.gross_return_pct ?? 0),
          net_return_pct: Number(s.net_return_pct ?? s.net_pnl_after_fees_pct ?? 0),
          net_pnl_after_fees_pct: Number(s.net_pnl_after_fees_pct ?? s.net_return_pct ?? 0),
          nepse_index_return_pct: Number(s.nepse_index_return_pct ?? 0),
          nepse_alpha_pct: Number(s.nepse_alpha_pct ?? (s.net_pnl_after_fees_pct ?? 0)),
          primary_broker_id: s.primary_broker_id != null ? Number(s.primary_broker_id) : (s.lead_broker_id ? Number(s.lead_broker_id) : null),
          broker_anomaly_score: Number(s.broker_anomaly_score ?? 0),
          avg_ticket_kitta: Number(s.avg_ticket_kitta ?? 0),
          market_regime: s.market_regime || 'SIDEWAYS',
          current_ltp: s.current_ltp != null ? Number(s.current_ltp) : undefined,
          vwap_diff_pct: s.vwap_diff_pct != null ? Number(s.vwap_diff_pct) : undefined,
          vwap_zone: s.vwap_zone,
          live_risk_to_sl_pct: s.live_risk_to_sl_pct != null ? Number(s.live_risk_to_sl_pct) : undefined,
          live_reward_to_t1_pct: s.live_reward_to_t1_pct != null ? Number(s.live_reward_to_t1_pct) : undefined,
          ignition_score: s.ignition_score,
          bcr5_net_pct: s.bcr5_net_pct,
          scr3_net_pct: s.scr3_net_pct,
        }));

        setFetchedSignals(normalized);
        setServerSummary(data.summary || null);
        const nextStrategyMetrics = Array.isArray(data.strategyMetrics) && data.strategyMetrics.length > 0
          ? data.strategyMetrics
          : Array.isArray(data.summary?.strategyMetrics) && data.summary.strategyMetrics.length > 0
          ? data.summary.strategyMetrics
          : [];
        setFetchedStrategyMetrics(nextStrategyMetrics);

        const nextBrokerLeaderboard = Array.isArray(data.brokerLeaderboard) && data.brokerLeaderboard.length > 0
          ? data.brokerLeaderboard
          : [];
        setFetchedBrokerLeaderboard(nextBrokerLeaderboard);

        // Save fresh telemetry to local storage for instant future boots
        try {
          const cachePayload = {
            signals: normalized,
            summary: data.summary || null,
            strategyMetrics: nextStrategyMetrics,
            brokerLeaderboard: nextBrokerLeaderboard,
            updatedAt: Date.now(),
          };
          sessionStorage.setItem(TRACK_RECORD_CACHE_KEY, JSON.stringify(cachePayload));
          localStorage.setItem(TRACK_RECORD_CACHE_KEY, JSON.stringify(cachePayload));
        } catch (_) {}
      }
    } catch (err: any) {
      console.error('[AlgorithmicSignalTrackRecord] Fetch error:', err);
      setError(err?.message || 'Failed to load signal track record telemetry');
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  };

  // Dedicated manual re-audit handler that forces backend calculation
  const handleManualReAudit = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      const base = getProxyBase() || '';
      // Trigger background cache and ledger re-audit
      await fetch(`${base}/api/radar/rebuild-cache`, { method: 'POST' }).catch(() => {});
      // Fetch freshly computed ledger
      await fetchTrackRecord(true);
    } catch (err: any) {
      console.warn('[AlgorithmicSignalTrackRecord] Re-audit error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!propSignals || propSignals.length === 0) {
      if (!fetchedSignals || fetchedSignals.length === 0) {
        setIsLoading(true);
      }
      fetchTrackRecord();
    }
  }, [propSignals]);

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

  // Resolved sources
  const signals = propSignals && propSignals.length > 0 ? propSignals : fetchedSignals;
  const strategyMetrics = propStrategyMetrics && propStrategyMetrics.length > 0 ? propStrategyMetrics : fetchedStrategyMetrics;
  const brokerLeaderboard = propBrokerLeaderboard && propBrokerLeaderboard.length > 0 ? propBrokerLeaderboard : fetchedBrokerLeaderboard;

  // Extract unique sectors dynamically from ledger rows
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => {
      if (s.sector) set.add(s.sector);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [signals]);

  // Filter & Sort Signals
  const filteredSignals = useMemo(() => {
    const query = searchQuery.trim().toUpperCase();

    return signals
      .filter((row) => {
        if (hideUnfillable && row.status === 'UNFILLABLE_SKIP') return false;
        if (selectedStrategy !== 'ALL') {
          const rowStrat = (row.strategy || row.signal_type || '').toUpperCase();
          if (rowStrat !== selectedStrategy.toUpperCase()) return false;
        }

        if (selectedStatus !== 'ALL') {
          const st = String(row.status || '').toUpperCase();
          if (selectedStatus === 'WINS') {
            if (!st.startsWith('WIN') && st !== 'TARGET_HIT' && st !== 'RATCHET_STOP_WIN') return false;
          } else if (selectedStatus === 'ACTIVE') {
            if (st !== 'ACTIVE' && st !== 'OPEN_ACTIVE') return false;
          } else if (selectedStatus === 'STOP_LOSS') {
            if (st !== 'STOP_LOSS' && st !== 'STOPPED_OUT') return false;
          } else if (selectedStatus === 'TIME_STOP_STALE') {
            if (st !== 'TIME_STOP_STALE' && st !== 'TIME_EXPIRED') return false;
          } else if (st !== selectedStatus.toUpperCase()) {
            return false;
          }
        }

        if (selectedRegime !== 'ALL' && row.market_regime !== selectedRegime) return false;
        if (selectedSector !== 'ALL' && row.sector !== selectedSector) return false;
        if (minAnomalyScore > 0 && (row.broker_anomaly_score || 0) < minAnomalyScore) return false;

        if (query) {
          const symbolMatch = (row.symbol || '').toUpperCase().includes(query);
          const brokerMatch =
            (row.primary_broker_id !== null && (`B${row.primary_broker_id}` === query || String(row.primary_broker_id) === query)) ||
            (row.lead_broker_id && (`B${row.lead_broker_id}` === query || String(row.lead_broker_id) === query)) ||
            (row.lead_broker_name && row.lead_broker_name.toUpperCase().includes(query));
          if (!symbolMatch && !brokerMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'vwapDiscount') {
          const aOpen = (a.status === 'ACTIVE' || a.status === 'OPEN_ACTIVE') ? 0 : 1;
          const bOpen = (b.status === 'ACTIVE' || b.status === 'OPEN_ACTIVE') ? 0 : 1;
          if (aOpen !== bOpen) return aOpen - bOpen;
          return (a.vwap_diff_pct ?? 0) - (b.vwap_diff_pct ?? 0);
        }

        let valA: number | string = a[sortField] ?? 0;
        let valB: number | string = b[sortField] ?? 0;

        if (sortField === 'signal_date') {
          valA = new Date(a.signal_date).getTime();
          valB = new Date(b.signal_date).getTime();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [
    signals,
    searchQuery,
    selectedStrategy,
    selectedStatus,
    selectedRegime,
    selectedSector,
    minAnomalyScore,
    hideUnfillable,
    sortField,
    sortOrder,
  ]);

  // Compute Aggregate Scorecard
  const computedPortfolioSummary = useMemo(() => {
    const closedTradable = filteredSignals.filter(
      (s) => s.status !== 'ACTIVE' && s.status !== 'OPEN_ACTIVE' && s.status !== 'UNFILLABLE_SKIP'
    );
    const skippedCount = signals.filter((s) => s.status === 'UNFILLABLE_SKIP').length;
    const ratchetSavedCount = closedTradable.filter(
      (s) => s.status === 'RATCHET_STOP_WIN' || s.status === 'WIN_RATCHET_STOP'
    ).length;

    if (closedTradable.length === 0) {
      return {
        totalClosed: serverSummary?.closedSignals ?? 0,
        winRate: serverSummary?.verifiedWinRatePct ?? 0,
        profitFactor: serverSummary?.profitFactor ?? 0,
        netExpectancy: serverSummary?.avgNetReturnPct ?? 0,
        avgAlpha: serverSummary?.avgNetReturnPct ?? 0,
        ratchetSavedCount,
        skippedCount,
      };
    }

    const wins = closedTradable.filter((s) => (s.net_return_pct ?? s.net_pnl_after_fees_pct ?? 0) > 0);
    const grossPositive = closedTradable.reduce(
      (acc, s) => acc + Math.max(0, s.net_return_pct ?? s.net_pnl_after_fees_pct ?? 0),
      0
    );
    const grossNegative = Math.abs(
      closedTradable.reduce(
        (acc, s) => acc + Math.min(0, s.net_return_pct ?? s.net_pnl_after_fees_pct ?? 0),
        0
      )
    );

    const winRate = (wins.length / closedTradable.length) * 100;
    const profitFactor =
      grossNegative > 0 ? grossPositive / grossNegative : grossPositive > 0 ? 9.99 : 0;
    const netExpectancy =
      closedTradable.reduce((acc, s) => acc + (s.net_return_pct ?? s.net_pnl_after_fees_pct ?? 0), 0) / closedTradable.length;
    const avgAlpha =
      closedTradable.reduce((acc, s) => acc + (s.nepse_alpha_pct ?? (s.net_return_pct ?? 0)), 0) /
      closedTradable.length;

    return {
      totalClosed: closedTradable.length,
      winRate: Number(winRate.toFixed(1)),
      profitFactor: Number(profitFactor.toFixed(2)),
      netExpectancy: Number(netExpectancy.toFixed(2)),
      avgAlpha: Number(avgAlpha.toFixed(2)),
      ratchetSavedCount,
      skippedCount,
    };
  }, [filteredSignals, signals, serverSummary]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedStrategy('ALL');
    setSelectedStatus('ALL');
    setSelectedRegime('ALL');
    setSelectedSector('ALL');
    setMinAnomalyScore(0);
    setHideUnfillable(true);
    setSortField('signal_date');
    setSortOrder('desc');
  };

  // Helper for VWAP discount badge
  const renderVwapBadge = (row: SignalLedgerRow) => {
    const ltp = Number(row.exit_price ?? row.entry_price ?? row.entry_vwap ?? 0);
    const vwap = Number(row.broker_vwap || row.entry_vwap || 0);
    const diff =
      row.vwap_diff_pct !== undefined
        ? row.vwap_diff_pct
        : vwap > 0
        ? Number((((ltp - vwap) / vwap) * 100).toFixed(2))
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

  // 1. PINNED HEADER & ACTION BAR (Never scrolls away on mobile or desktop)
  const headerContent = (
    <div className="flex-shrink-0 bg-slate-950 border-b border-slate-800/80 p-3 sm:p-4 md:px-6 md:py-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>Algorithmic Signal Track Record</span>
            </h2>
            <span className="px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
              T+1 VWAP &bull; T+2 Demat Audited
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1 line-clamp-1 sm:line-clamp-none">
            Zero look-ahead walk-forward SQLite ledger deducting NEPSE broker tiers, 0.015% SEBON fee, Rs 50 round-trip DP, and 7.5% short-term CGT.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
          <div className="inline-flex rounded-lg bg-slate-900 p-1 border border-slate-800 flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => setActiveTab('LEDGER')}
              className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition text-center whitespace-nowrap ${
                activeTab === 'LEDGER'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Signal Ledger ({filteredSignals.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BROKER_LEADERBOARD')}
              className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition text-center whitespace-nowrap ${
                activeTab === 'BROKER_LEADERBOARD'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Smart-Money Leaderboard ({brokerLeaderboard.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onRebuildTrackRecord || handleManualReAudit}
            disabled={isRebuilding || isRefreshing}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
            title="Force fresh audit calculation"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRebuilding || isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRebuilding || isRefreshing ? 'Auditing...' : '↻ Re-Audit'}</span>
          </button>

          {!inlineMode && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition"
              title="Close Track Record (बन्द गर्नुहोस्)"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // 2. SCROLLABLE BODY (Smooth 60fps vertical touch on mobile and mouse on desktop)
  const scrollableBody = (
    <div
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-slate-950 text-slate-100 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5"
      style={{
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
      }}
    >

      {/* 2. INSTITUTIONAL PROFIT FACTOR & EXPECTANCY SCORECARD */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Profit Factor
          </div>
          <div
            className={`text-xl font-bold mt-1 ${
              computedPortfolioSummary.profitFactor >= 1.75
                ? 'text-emerald-400'
                : computedPortfolioSummary.profitFactor >= 1.15
                ? 'text-amber-300'
                : 'text-rose-400'
            }`}
          >
            {computedPortfolioSummary.profitFactor.toFixed(2)}x
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Target &ge; 1.50x Institutional
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Post-Fee Win Rate
          </div>
          <div className="text-xl font-bold text-white mt-1">
            {computedPortfolioSummary.winRate}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {computedPortfolioSummary.totalClosed} settled trades audited
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Net Expectancy / Trade
          </div>
          <div
            className={`text-xl font-bold mt-1 ${
              computedPortfolioSummary.netExpectancy >= 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {computedPortfolioSummary.netExpectancy >= 0 ? '+' : ''}
            {computedPortfolioSummary.netExpectancy}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            After Commission, DP &amp; 7.5% CGT
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Avg NEPSE Alpha
          </div>
          <div
            className={`text-xl font-bold mt-1 ${
              computedPortfolioSummary.avgAlpha >= 0
                ? 'text-sky-400'
                : 'text-rose-400'
            }`}
          >
            {computedPortfolioSummary.avgAlpha >= 0 ? '+' : ''}
            {computedPortfolioSummary.avgAlpha}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Outperformance vs Benchmark
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            1.2R Ratchet Saves
          </div>
          <div className="text-xl font-bold text-teal-300 mt-1">
            {computedPortfolioSummary.ratchetSavedCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Round-trip losses prevented
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Circuit Traps Filtered
          </div>
          <div className="text-xl font-bold text-amber-300 mt-1">
            {computedPortfolioSummary.skippedCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Unfillable +10% lockouts excluded
          </div>
        </div>
      </div>

      {/* Strategy Breakdown Cards (from SQL View v_strategy_institutional_metrics) */}
      {strategyMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {strategyMetrics.map((m) => (
            <div
              key={m.strategy}
              className="bg-slate-900/60 border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between gap-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  {m.strategy.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-slate-400">
                  Avg Hold: {m.avg_holding_days}d
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-800/60">
                <div>
                  <span className="text-slate-400 block text-[10px]">PF</span>
                  <span className="font-bold text-white">{m.profit_factor ?? 0}x</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Win Rate</span>
                  <span className="font-bold text-white">{m.verified_win_rate_pct ?? 0}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Expectancy</span>
                  <span
                    className={`font-bold ${
                      (m.net_expectancy_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {(m.net_expectancy_pct ?? 0) >= 0 ? '+' : ''}
                    {m.net_expectancy_pct ?? 0}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">MFE / MAE</span>
                  <span className="font-mono text-slate-200 text-[11px]">
                    +{m.avg_mfe_pct ?? 0}% / {m.avg_mae_pct ?? 0}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. STICKY FILTER BAR (Fixes Scroll Clipping & Broken Filter Bugs) */}
      {activeTab === 'LEDGER' && (
        <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-lg flex flex-wrap items-center gap-2.5">
          {/* Symbol or Broker Search */}
          <div className="relative min-w-[210px] flex-1 sm:flex-initial">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Symbol or Broker (e.g. NABIL, B58)..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Strategy Filter */}
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Strategies</option>
            <option value="SYNDICATE_ROTATION">Syndicate Rotation</option>
            <option value="STEALTH_ACCUMULATION">Stealth Accumulation</option>
            <option value="EARLY_IGNITION_3D">Early Ignition 3D</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Outcomes</option>
            <option value="WINS">All Wins (T1, T2, Ratchet)</option>
            <option value="ACTIVE">Active (In Trade)</option>
            <option value="RATCHET_STOP_WIN">Ratchet Stop Win (+1.2R)</option>
            <option value="TARGET_HIT">Target Hit</option>
            <option value="STOP_LOSS">Stop Loss</option>
            <option value="TIME_STOP_STALE">Time-Stop Stale</option>
            <option value="UNFILLABLE_SKIP">Skipped Circuit Traps</option>
          </select>

          {/* Sector Filter */}
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {availableSectors.map((sec) => (
              <option key={sec} value={sec}>
                {sec === 'ALL' ? 'All Sectors' : sec}
              </option>
            ))}
          </select>

          {/* Regime Filter */}
          <select
            value={selectedRegime}
            onChange={(e) => setSelectedRegime(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Regimes</option>
            <option value="BULL">Bull Regime</option>
            <option value="SIDEWAYS">Sideways Regime</option>
            <option value="BEAR">Bear Regime</option>
            <option value="QUARTER_END_PRESSURE">Quarter-End Pressure</option>
          </select>

          {/* Minimum Broker Anomaly Score */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1">
            <span className="text-[11px] text-slate-400">Min Anomaly:</span>
            <input
              type="number"
              step="0.5"
              min="0"
              max="10"
              value={minAnomalyScore}
              onChange={(e) => setMinAnomalyScore(Number(e.target.value) || 0)}
              className="w-12 bg-transparent text-xs text-emerald-300 font-mono focus:outline-none text-right"
            />
            <span className="text-[11px] text-slate-500">&sigma;</span>
          </div>

          {/* Quick VWAP Discount Sort Button */}
          <button
            type="button"
            onClick={() => handleSort('vwapDiscount')}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition flex items-center gap-1 ${
              sortField === 'vwapDiscount'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                : 'bg-slate-950 text-slate-300 border-slate-700/80 hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            Best VWAP Discount
          </button>

          {/* Toggle Unfillable Circuit Skips */}
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none ml-auto">
            <input
              type="checkbox"
              checked={hideUnfillable}
              onChange={(e) => setHideUnfillable(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0"
            />
            <span>Hide Circuit Locks</span>
          </label>

          <button
            type="button"
            onClick={resetAllFilters}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition"
          >
            Reset
          </button>
        </div>
      )}

      {/* 4A. MAIN WALK-FORWARD SIGNAL TELEMETRY (Mobile Cards + Desktop Table) */}
      {activeTab === 'LEDGER' ? (
        <>
          {/* MOBILE VIEW: Touch-optimized vertical cards (prevents horizontal swipe lock on phones) */}
          <div className="block md:hidden space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
                <div className="flex flex-col items-center justify-center gap-2">
                  <RotateCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <span className="text-xs">Loading settled walk-forward ledger signals...</span>
                </div>
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800 text-xs">
                No audited signals match filter criteria.{' '}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-emerald-400 underline font-semibold"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              filteredSignals.map((row) => {
                const badge = STATUS_BADGE_CONFIG[row.status] || STATUS_BADGE_CONFIG.ACTIVE;
                const mfeBarWidth = Math.min(100, Math.max(0, (row.mfe_pct / 20) * 100));
                const maeBarWidth = Math.min(100, Math.max(0, (Math.abs(row.mae_pct) / 12) * 100));
                const isInstitutionalTicket = row.avg_ticket_kitta >= 150;
                const netReturn = row.net_return_pct ?? row.net_pnl_after_fees_pct ?? 0;
                const alpha = row.nepse_alpha_pct ?? netReturn;

                return (
                  <div
                    key={`mob_${row.signal_id}`}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 shadow-sm"
                  >
                    {/* Top Row: Symbol, Sector, Status Badge & Return */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleStockClick(row.symbol)}
                            className="font-bold text-base text-white hover:text-emerald-400 transition"
                          >
                            {row.symbol}
                          </button>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {row.sector}
                          </span>
                          {row.holding_days > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 font-mono">
                              {row.holding_days}d hold
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Trig: {row.signal_date} &bull; {row.strategy.replace(/_/g, ' ')}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        {row.status === 'UNFILLABLE_SKIP' ? (
                          <span className="text-slate-500 text-xs">No Fill (Circuit)</span>
                        ) : (
                          <>
                            <div
                              className={`text-base font-bold font-mono ${
                                netReturn > 0
                                  ? 'text-emerald-400'
                                  : netReturn < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {netReturn > 0 ? '+' : ''}{netReturn}%
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Alpha:{' '}
                              <span className={alpha >= 0 ? 'text-sky-400' : 'text-rose-400'}>
                                {alpha >= 0 ? '+' : ''}{alpha}%
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Status Badge & Execution / VWAP */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${badge.className}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                        {badge.label}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-300">
                          VWAP Rs {row.entry_vwap?.toLocaleString() ?? row.entry_price?.toLocaleString() ?? '—'}
                        </span>
                        {renderVwapBadge(row)}
                      </div>
                    </div>

                    {/* Excursion Bar (MAE / MFE) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-rose-400">MAE: {row.mae_pct}%</span>
                        <span className="text-emerald-400">MFE: +{row.mfe_pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                        <div className="w-1/2 flex justify-end border-r border-slate-700">
                          <div
                            className="h-full bg-rose-500/80 rounded-l-full"
                            style={{ width: `${maeBarWidth}%` }}
                          />
                        </div>
                        <div className="w-1/2 flex justify-start">
                          <div
                            className="h-full bg-emerald-500/80 rounded-r-full"
                            style={{ width: `${mfeBarWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Targets & Ratchet Footprint */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                      <div>
                        <span className="text-emerald-400 font-semibold">
                          T1 Rs {row.target_price?.toLocaleString() ?? row.target1_price?.toLocaleString() ?? '—'}
                        </span>
                        <span className="mx-1 text-slate-600">/</span>
                        <span className={row.is_ratchet_armed === 1 ? 'text-teal-300 font-bold' : 'text-rose-400'}>
                          SL Rs {row.active_stop_price?.toLocaleString() ?? row.initial_stop_price?.toLocaleString() ?? '—'}
                        </span>
                      </div>

                      {row.is_ratchet_armed === 1 ? (
                        <span className="text-[10px] font-sans font-semibold text-teal-300 bg-teal-500/10 border border-teal-500/30 px-1.5 py-0.5 rounded">
                          🛡️ +1.2R Armed
                        </span>
                      ) : (
                        <span className="text-[10px] font-sans text-slate-500">
                          {row.settlement_unlock_date ?? row.t2_unlock_date ?? 'T+2 Pending'}
                        </span>
                      )}
                    </div>

                    {/* Broker Anomaly & Institutional Ticket */}
                    {(row.primary_broker_id || row.lead_broker_id) && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-200">
                            {row.lead_broker_name || `Broker #${row.primary_broker_id || row.lead_broker_id}`}
                          </span>
                          {row.broker_anomaly_score > 0 && (
                            <span className="px-1 py-0.5 text-[9px] font-mono rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                              {row.broker_anomaly_score}x Anomaly
                            </span>
                          )}
                        </div>
                        {row.avg_ticket_kitta > 0 && (
                          <span className={`text-[10px] font-mono ${isInstitutionalTicket ? 'text-emerald-300 font-medium' : 'text-slate-400'}`}>
                            {row.avg_ticket_kitta} kitta {isInstitutionalTicket ? '(Inst.)' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* DESKTOP VIEW: Full 8-column wide table for PC and tablet viewports */}
          <div className="hidden md:block border border-slate-800 rounded-xl bg-slate-900/40 overflow-hidden shadow-sm">
            <div className="overflow-x-auto min-h-[350px]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md">
                  <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th
                      onClick={() => handleSort('signal_date')}
                      className="py-3 px-3.5 cursor-pointer hover:text-white select-none whitespace-nowrap"
                    >
                      Stock &amp; Date{' '}
                      {sortField === 'signal_date' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">Strategy &amp; Regime</th>
                    <th className="py-3 px-3 whitespace-nowrap">Execution (T+1 VWAP)</th>
                    <th className="py-3 px-3 whitespace-nowrap">Ratchet Stop &amp; Target</th>
                    <th
                      onClick={() => handleSort('mfe_pct')}
                      className="py-3 px-3.5 cursor-pointer hover:text-white select-none min-w-[175px]"
                    >
                      Excursion (MAE / MFE){' '}
                      {sortField === 'mfe_pct' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('broker_anomaly_score')}
                      className="py-3 px-3 cursor-pointer hover:text-white select-none whitespace-nowrap"
                    >
                      Smart Money Footprint{' '}
                      {sortField === 'broker_anomaly_score' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">Status</th>
                    <th
                      onClick={() => handleSort('net_return_pct')}
                      className="py-3 px-3.5 text-right cursor-pointer hover:text-white select-none whitespace-nowrap"
                    >
                      Net Return &amp; Alpha{' '}
                      {sortField === 'net_return_pct' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RotateCw className="w-6 h-6 animate-spin text-emerald-400" />
                          <span>Loading settled walk-forward ledger signals...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredSignals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400">
                        No audited signals match the current filter criteria. Click{' '}
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="text-emerald-400 underline hover:text-emerald-300 font-semibold"
                        >
                          Reset Filters
                        </button>{' '}
                        to view all records.
                      </td>
                    </tr>
                  ) : (
                    filteredSignals.map((row) => {
                      const badge = STATUS_BADGE_CONFIG[row.status] || STATUS_BADGE_CONFIG.ACTIVE;
                      const mfeBarWidth = Math.min(100, Math.max(0, (row.mfe_pct / 20) * 100));
                      const maeBarWidth = Math.min(100, Math.max(0, (Math.abs(row.mae_pct) / 12) * 100));
                      const isInstitutionalTicket = row.avg_ticket_kitta >= 150;

                      return (
                        <tr
                          key={row.signal_id}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          {/* 1. Symbol & Date */}
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStockClick(row.symbol)}
                                className="font-bold text-sm text-white hover:text-emerald-400 transition"
                              >
                                {row.symbol}
                              </button>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                {row.sector}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Trig: {row.signal_date}
                              {row.holding_days > 0 && (
                                <span className="text-slate-500"> &bull; {row.holding_days}d hold</span>
                              )}
                            </div>
                          </td>

                          {/* 2. Strategy & Market Regime */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-medium text-slate-200">
                              {row.strategy.replace(/_/g, ' ')}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span>Regime:</span>
                              <span
                                className={`font-semibold ${
                                  row.market_regime === 'BULL'
                                    ? 'text-emerald-400'
                                    : row.market_regime === 'QUARTER_END_PRESSURE'
                                    ? 'text-amber-400'
                                    : row.market_regime === 'BEAR'
                                    ? 'text-rose-400'
                                    : 'text-slate-300'
                                }`}
                              >
                                {row.market_regime}
                              </span>
                            </div>
                          </td>

                          {/* 3. Day T LTP vs Day T+1 Audited VWAP */}
                          <td className="py-3 px-3 whitespace-nowrap font-mono">
                            <div className="text-slate-200">
                              VWAP: Rs {row.entry_vwap?.toLocaleString() ?? row.entry_price?.toLocaleString() ?? '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Day T Close: Rs {row.trigger_ltp?.toLocaleString() ?? '—'}
                            </div>
                            <div className="mt-1">
                              {renderVwapBadge(row)}
                            </div>
                          </td>

                          {/* 4. Active Ratchet Stop & Target */}
                          <td className="py-3 px-3 whitespace-nowrap font-mono">
                            <div className="flex items-center gap-1.5">
                              <span className="text-emerald-400 font-semibold">
                                T1: Rs {row.target_price?.toLocaleString() ?? row.target1_price?.toLocaleString() ?? '—'}
                              </span>
                              <span className="text-slate-600">/</span>
                              <span
                                className={
                                  row.is_ratchet_armed === 1 ? 'text-teal-300 font-bold' : 'text-rose-400'
                                }
                              >
                                SL: Rs {row.active_stop_price?.toLocaleString() ?? row.initial_stop_price?.toLocaleString() ?? '—'}
                              </span>
                            </div>
                            {row.is_ratchet_armed === 1 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-teal-300 bg-teal-500/10 border border-teal-500/30 px-1.5 py-0.5 rounded mt-1">
                                🛡️ +1.2R Ratchet Armed
                              </span>
                            ) : (
                              <div className="text-[10px] font-sans text-slate-500 mt-0.5">
                                Unlock: {row.settlement_unlock_date ?? row.t2_unlock_date ?? 'Pending'}
                              </div>
                            )}
                          </td>

                          {/* 5. Excursion Telemetry (MAE vs MFE Dual Bar) */}
                          <td className="py-3 px-3.5">
                            <div className="flex justify-between text-[11px] font-mono mb-1">
                              <span className="text-rose-400" title="Maximum Adverse Excursion">
                                MAE: {row.mae_pct}%
                              </span>
                              <span className="text-emerald-400" title="Maximum Favorable Excursion">
                                MFE: +{row.mfe_pct}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                              <div className="w-1/2 flex justify-end border-r border-slate-600">
                                <div
                                  className="h-full bg-rose-500/80 rounded-l-full"
                                  style={{ width: `${maeBarWidth}%` }}
                                />
                              </div>
                              <div className="w-1/2 flex justify-start">
                                <div
                                  className="h-full bg-emerald-500/80 rounded-r-full"
                                  style={{ width: `${mfeBarWidth}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* 6. Broker Anomaly & Ticket Size */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {row.primary_broker_id || row.lead_broker_id ? (
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white">
                                    {row.lead_broker_name || `Broker #${row.primary_broker_id || row.lead_broker_id}`}
                                  </span>
                                  {row.broker_anomaly_score > 0 && (
                                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                      {row.broker_anomaly_score}x Anomaly
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {row.avg_ticket_kitta > 0 ? (
                                    <>
                                      Avg Ticket:{' '}
                                      <span
                                        className={
                                          isInstitutionalTicket
                                            ? 'text-emerald-300 font-medium'
                                            : 'text-slate-400'
                                        }
                                      >
                                        {row.avg_ticket_kitta} kitta
                                      </span>{' '}
                                      {isInstitutionalTicket ? '(Inst.)' : '(Retail Mix)'}
                                    </>
                                  ) : (
                                    <span>BCR5: {row.bcr5_net_pct ?? 0}% &bull; Retention: {row.ignition_score ?? 0}/100</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>

                          {/* 7. Status Badge */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${badge.className}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                              {badge.label}
                            </span>
                            {row.exit_date && (
                              <div className="text-[10px] text-slate-500 mt-1">
                                Exit: {row.exit_date} @ Rs {row.exit_price?.toLocaleString()}
                              </div>
                            )}
                          </td>

                          {/* 8. Post-Fee Net Return & NEPSE Alpha */}
                          <td className="py-3 px-3.5 text-right whitespace-nowrap font-mono">
                            {row.status === 'UNFILLABLE_SKIP' ? (
                              <span className="text-slate-500 text-xs">No Fill (Circuit)</span>
                            ) : (
                              <>
                                <div
                                  className={`text-sm font-bold ${
                                    (row.net_return_pct ?? row.net_pnl_after_fees_pct ?? 0) > 0
                                      ? 'text-emerald-400'
                                      : (row.net_return_pct ?? row.net_pnl_after_fees_pct ?? 0) < 0
                                      ? 'text-rose-400'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {(row.net_return_pct ?? row.net_pnl_after_fees_pct ?? 0) > 0 ? '+' : ''}
                                  {row.net_return_pct ?? row.net_pnl_after_fees_pct ?? 0}%
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Alpha:{' '}
                                  <span
                                    className={
                                      (row.nepse_alpha_pct ?? (row.net_return_pct ?? 0)) >= 0 ? 'text-sky-400' : 'text-rose-400'
                                    }
                                  >
                                    {(row.nepse_alpha_pct ?? (row.net_return_pct ?? 0)) >= 0 ? '+' : ''}
                                    {row.nepse_alpha_pct ?? row.net_return_pct ?? 0}%
                                  </span>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* 4B. SMART-MONEY BROKER ANOMALY LEADERBOARD TAB (Mobile Cards + Desktop Table) */
        <>
          {/* MOBILE VIEW: Cards for Broker Leaderboard */}
          <div className="block md:hidden space-y-3">
            {brokerLeaderboard.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800 text-xs">
                No broker leaderboard telemetry available yet.
              </div>
            ) : (
              brokerLeaderboard.map((b, idx) => (
                <div
                  key={`mob_broker_${b.brokerId}`}
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 cursor-pointer hover:border-emerald-500/50 transition shadow-sm"
                  onClick={() => {
                    setSearchQuery(`B${b.brokerId}`);
                    setActiveTab('LEDGER');
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">
                      #{idx + 1} &mdash; {b.brokerName || `Broker #${b.brokerId}`}
                    </span>
                    <span className="font-mono text-xs font-semibold text-white">
                      {b.postFeeWinRatePct ?? b.winRatePct ?? 0}% Win Rate
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/60">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Audited Signals</span>
                      <span className="font-mono text-slate-200">{b.auditedSignals ?? b.totalSignals ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Avg Anomaly</span>
                      <span className="font-mono text-indigo-300">
                        {b.avgAnomalyScore != null ? `${b.avgAnomalyScore}x` : 'Tracked'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Avg Ticket</span>
                      <span className="font-mono text-slate-200">
                        {b.avgTicketKitta ? `${b.avgTicketKitta} kitta` : 'HNI Ticket'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Avg Net Return</span>
                      <span
                        className={`font-mono font-bold ${
                          (b.avgNetReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {(b.avgNetReturnPct ?? 0) >= 0 ? '+' : ''}{b.avgNetReturnPct ?? 0}%
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-emerald-400/90 font-medium text-right pt-0.5">
                    Tap to view signals &rarr;
                  </div>
                </div>
              ))
            )}
          </div>

          {/* DESKTOP VIEW: Table for Broker Leaderboard */}
          <div className="hidden md:block border border-slate-800 rounded-xl bg-slate-900/40 overflow-hidden shadow-sm">
            <div className="overflow-x-auto min-h-[350px]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md">
                  <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Rank &amp; Broker</th>
                    <th className="py-3 px-4">Audited Signals</th>
                    <th className="py-3 px-4">Avg Anomaly Score (vs 30D Share)</th>
                    <th className="py-3 px-4">Avg Ticket Size (Kitta / Trade)</th>
                    <th className="py-3 px-4">Post-Fee Win Rate</th>
                    <th className="py-3 px-4 text-right">Avg Net Return</th>
                    <th className="py-3 px-4 text-right">Avg NEPSE Alpha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {brokerLeaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-400">
                        No broker leaderboard telemetry available yet. Run the walk-forward rebuild to populate broker rankings.
                      </td>
                    </tr>
                  ) : (
                    brokerLeaderboard.map((b, idx) => (
                      <tr
                        key={String(b.brokerId)}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                        onClick={() => {
                          setSearchQuery(`B${b.brokerId}`);
                          setActiveTab('LEDGER');
                        }}
                      >
                        <td className="py-3 px-4 font-bold text-white">
                          #{idx + 1} &mdash; {b.brokerName || `Broker #${b.brokerId}`}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {b.auditedSignals ?? b.totalSignals ?? 0} signals
                        </td>
                        <td className="py-3 px-4 font-mono text-indigo-300">
                          {b.avgAnomalyScore != null ? `${b.avgAnomalyScore}x baseline` : 'Institutional Tracked'}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span
                            className={
                              (b.avgTicketKitta ?? 0) >= 150
                                ? 'text-emerald-300 font-semibold'
                                : 'text-slate-300'
                            }
                          >
                            {b.avgTicketKitta ? `${b.avgTicketKitta} kitta` : 'HNI Ticket'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          {b.postFeeWinRatePct ?? b.winRatePct ?? 0}%
                          {b.winCount != null && (
                            <span className="text-slate-400 text-[11px] font-normal ml-1">
                              ({b.winCount}W / {b.lossCount ?? 0}L)
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            (b.avgNetReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {(b.avgNetReturnPct ?? 0) >= 0 ? '+' : ''}
                          {b.avgNetReturnPct ?? 0}%
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            (b.avgNepseAlphaPct ?? b.avgNetReturnPct ?? 0) >= 0 ? 'text-sky-400' : 'text-rose-400'
                          }`}
                        >
                          {(b.avgNepseAlphaPct ?? b.avgNetReturnPct ?? 0) >= 0 ? '+' : ''}
                          {b.avgNepseAlphaPct ?? b.avgNetReturnPct ?? 0}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // 3. ASSEMBLE CONTENT WITH STRICT VERTICAL FLEX BOUNDS
  const content = (
    <div className="flex flex-col h-full max-h-[100dvh] sm:max-h-[92vh] w-full overflow-hidden bg-slate-950">
      {headerContent}
      {scrollableBody}
    </div>
  );

  if (inlineMode) {
    return content;
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full h-[100dvh] sm:h-[92vh] max-w-7xl flex flex-col bg-slate-950 rounded-none sm:rounded-2xl border-0 sm:border border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

export default AlgorithmicSignalTrackRecord;
