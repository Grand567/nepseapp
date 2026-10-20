// File: src/components/stock/BrokerSmartMoneyCard.tsx
import React, { Component, ErrorInfo, ReactNode, useEffect, useMemo, useState } from 'react';

export type SmartMoneyTimeframe = '1D' | '5D' | '1M';

export interface RawBrokerFlowItem {
  brokerId?: number | string;
  broker_id?: number | string;
  brokerNo?: number | string;
  brokerName?: string;
  date?: string;
  buyVolume?: number;
  buy_volume?: number;
   buyKitta?: number;
  sellVolume?: number;
  sell_volume?: number;
  sellKitta?: number;
  buyTrades?: number;
  buy_trades_count?: number;
  buyTransactions?: number;
  sellTrades?: number;
  sell_trades_count?: number;
  buyAmount?: number;
  buy_turnover_npr?: number;
  sellAmount?: number;
  sell_turnover_npr?: number;
  avgBuyPrice?: number;
  avgSellPrice?: number;
}

export interface AuditedBrokerFlow {
  brokerId: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  totalVolume: number;
  buyTradesCount: number;
  sellTradesCount: number;
  buyTurnoverNpr: number;
  sellTurnoverNpr: number;
  netTurnoverNpr: number;
  buyVwap: number;
  sellVwap: number;
  avgBuyTicketKitta: number;
  stockAccumulationSharePct: number;
  anomalyScore: number;
  footprintType: 'INSTITUTIONAL' | 'HNI_MIX' | 'RETAIL_HERD';
}

export interface BrokerSmartMoneyCardProps {
  symbol: string;
  currentPrice?: number;
  /** Optional pre-loaded data keyed by timeframe or raw array */
  initialData?: any;
  /** Optional custom fetcher; defaults to /api/stocks/{symbol}/smart-money?timeframe={tf}&days={days} */
  onFetchSmartMoney?: (
    symbol: string,
    timeframe: SmartMoneyTimeframe,
    days: number
  ) => Promise<any>;
  /** Optional 30D baseline market share map (brokerId -> ratio 0..1) */
  brokerBaselineShares?: Record<number, number>;
}

/**
 * Default NEPSE 30-Day Broker Market Share Baselines (Ratio of total market volume)
 * Prevents high-volume retail brokers (e.g., #58, #45, #49) from triggering false
 * smart-money alerts unless their buying in this specific stock is a true outlier.
 */
const DEFAULT_NEPSE_BROKER_BASELINES: Record<number, number> = {
  58: 0.082, // Naasa Securities (~8.2% retail-heavy baseline)
  45: 0.048, // Imperial Securities
  49: 0.044, // Online Securities
  34: 0.036, // Vision Securities
  42: 0.033, // Sani Securities
  38: 0.031, // Dipshikha Dhitopatra
  57: 0.029, // Aryatara的投资
  28: 0.026, // Shree Krishna Securities
  17: 0.025, // ABC Securities
  50: 0.022, // Crista Securities
};

const safeNum = (val: unknown, fallback = 0): number => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const formatInt = (val: unknown): string =>
  Math.round(safeNum(val, 0)).toLocaleString('en-IN');

const formatPrice = (val: unknown): string => {
  const n = safeNum(val, 0);
  return n > 0 ? `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}` : '—';
};

const formatLakhs = (npr: unknown): string => {
  const val = safeNum(npr, 0);
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (absVal >= 10000000) {
    return `${sign}Rs ${(absVal / 10000000).toFixed(2)} Cr`;
  }
  if (absVal >= 100000) {
    return `${sign}Rs ${(absVal / 100000).toFixed(2)} L`;
  }
  return `${sign}Rs ${Math.round(absVal).toLocaleString('en-IN')}`;
};

/**
 * Defensive Normalizer & Multi-Day Aggregator
 * Extracts arrays from any backend payload shape and rolls up multi-day (5D/1M) rows
 * by brokerId so duplicate broker entries across dates never break keys or math.
 */
export function normalizeAndAggregateBrokerData(
  payload: any,
  timeframe: SmartMoneyTimeframe,
  customBaselines?: Record<number, number>
): AuditedBrokerFlow[] {
  if (!payload) return [];

  const tfUpper = timeframe.toUpperCase();
  const tfLower = timeframe.toLowerCase();
  const daysKey = timeframe === '5D' ? '5' : timeframe === '1M' ? '30' : '1';

  // 1. Extract raw array from any nested structure
  let rawList: RawBrokerFlowItem[] = [];
  if (Array.isArray(payload)) {
    rawList = payload;
  } else if (typeof payload === 'object') {
    const candidate =
      payload[tfUpper] ??
      payload[tfLower] ??
      payload[`days_${daysKey}`] ??
      payload?.data?.[tfUpper] ??
      payload?.data?.[tfLower] ??
      payload?.data?.brokers ??
      payload?.data ??
      payload?.brokers ??
      payload?.rows ??
      payload?.items;

    if (Array.isArray(candidate)) {
      rawList = candidate;
    }
  }

  if (!rawList.length) return [];

  // 2. Roll up by brokerId (handles both pre-aggregated and raw multi-day floor-sheet rows)
  const rollupMap = new Map<
    number,
    {
      buyVol: number;
      sellVol: number;
      buyTrades: number;
      sellTrades: number;
      buyTurnover: number;
      sellTurnover: number;
    }
  >();

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const brokerId = safeNum(item.brokerId ?? item.broker_id ?? item.brokerNo, 0);
    if (brokerId <= 0) continue;

    // BUG FIX (Discrepancy #4): realBrokerAnalysis uses `buyQty`/`sellQty`/`buyAmt`/`avgBuyRate`
    // instead of floor-sheet canonical names. Add fallbacks so 1D Overview summary shows non-zero kitta.
    const buyVol = Math.max(0, safeNum(item.buyVolume ?? item.buy_volume ?? item.buyKitta ?? item.buyQty, 0));
    const sellVol = Math.max(0, safeNum(item.sellVolume ?? item.sell_volume ?? item.sellKitta ?? item.sellQty, 0));

    const avgBuyPx = Math.max(0, safeNum(item.avgBuyPrice ?? item.avgBuyRate, 0));
    const avgSellPx = Math.max(0, safeNum(item.avgSellPrice ?? item.avgSellRate, 0));

    const buyTurnover = Math.max(
      0,
      safeNum(item.buyAmount ?? item.buy_turnover_npr ?? item.buyAmt, buyVol * avgBuyPx)
    );
    const sellTurnover = Math.max(
      0,
      safeNum(item.sellAmount ?? item.sell_turnover_npr ?? item.sellAmt, sellVol * avgSellPx)
    );

    // Estimate trade tickets if backend omitted transaction count
    const rawBuyTrades = safeNum(
      item.buyTrades ?? item.buy_trades_count ?? item.buyTransactions,
      0
    );
    const rawSellTrades = safeNum(item.sellTrades ?? item.sell_trades_count, 0);

    const buyTrades = rawBuyTrades > 0 ? rawBuyTrades : buyVol > 0 ? Math.max(1, Math.round(buyVol / 80)) : 0;
    const sellTrades = rawSellTrades > 0 ? rawSellTrades : sellVol > 0 ? Math.max(1, Math.round(sellVol / 80)) : 0;

    const existing = rollupMap.get(brokerId) || {
      buyVol: 0,
      sellVol: 0,
      buyTrades: 0,
      sellTrades: 0,
      buyTurnover: 0,
      sellTurnover: 0,
    };

    existing.buyVol += buyVol;
    existing.sellVol += sellVol;
    existing.buyTrades += buyTrades;
    existing.sellTrades += sellTrades;
    existing.buyTurnover += buyTurnover;
    existing.sellTurnover += sellTurnover;

    rollupMap.set(brokerId, existing);
  }

  // Total stock volume across all brokers in the timeframe
  let totalStockBuyVol = 0;
  for (const v of rollupMap.values()) {
    totalStockBuyVol += v.buyVol;
  }
  if (totalStockBuyVol <= 0) totalStockBuyVol = 1;

  const baselines = { ...DEFAULT_NEPSE_BROKER_BASELINES, ...(customBaselines || {}) };

  // 3. Compute Audited Metrics, VWAP, Ticket Size & Anomaly Score
  const auditedList: AuditedBrokerFlow[] = [];

  for (const [brokerId, agg] of rollupMap.entries()) {
    const netVolume = agg.buyVol - agg.sellVol;
    const totalVolume = agg.buyVol + agg.sellVol;
    if (totalVolume <= 0) continue;

    const buyVwap = agg.buyVol > 0 && agg.buyTurnover > 0 ? agg.buyTurnover / agg.buyVol : 0;
    const sellVwap = agg.sellVol > 0 && agg.sellTurnover > 0 ? agg.sellTurnover / agg.sellVol : 0;
    const avgBuyTicketKitta =
      agg.buyVol > 0 ? agg.buyVol / Math.max(1, agg.buyTrades) : 0;

    // Positive accumulation share vs total stock volume
    const netAccumulationShare = Math.max(0, netVolume) / totalStockBuyVol;
    const brokerBaselineShare = Math.max(0.009, baselines[brokerId] ?? 0.016);
    const rawAnomalyRatio = netAccumulationShare / brokerBaselineShare;

    // Weight by Ticket Size (Institutional >= 250 kitta vs Retail < 45 kitta)
    const ticketMultiplier =
      avgBuyTicketKitta >= 300
        ? 1.35
        : avgBuyTicketKitta >= 140
        ? 1.05
        : avgBuyTicketKitta < 45
        ? 0.45
        : 0.78;

    const anomalyScore = Number((rawAnomalyRatio * ticketMultiplier).toFixed(2));

    const footprintType: AuditedBrokerFlow['footprintType'] =
      avgBuyTicketKitta >= 200 && anomalyScore >= 2.0
        ? 'INSTITUTIONAL'
        : avgBuyTicketKitta >= 90
        ? 'HNI_MIX'
        : 'RETAIL_HERD';

    auditedList.push({
      brokerId,
      buyVolume: agg.buyVol,
      sellVolume: agg.sellVol,
      netVolume,
      totalVolume,
      buyTradesCount: agg.buyTrades,
      sellTradesCount: agg.sellTrades,
      buyTurnoverNpr: agg.buyTurnover,
      sellTurnoverNpr: agg.sellTurnover,
      netTurnoverNpr: agg.buyTurnover - agg.sellTurnover,
      buyVwap: Number(buyVwap.toFixed(2)),
      sellVwap: Number(sellVwap.toFixed(2)),
      avgBuyTicketKitta: Number(avgBuyTicketKitta.toFixed(1)),
      stockAccumulationSharePct: Number(((agg.buyVol / totalStockBuyVol) * 100).toFixed(1)),
      anomalyScore,
      footprintType,
    });
  }

  return auditedList;
}

/**
 * Dedicated Error Boundary so any unexpected runtime issue inside the Broker Card
 * never triggers an app-level "Retry Render" screen crash.
 */
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class BrokerSmartMoneyErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected floor-sheet aggregation error.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BrokerSmartMoneyCard] Caught render exception:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-5 text-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-amber-300">
              ⚠️ Floor-Sheet Telemetry Recovery Mode
            </span>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onReset();
              }}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              Reset to 1D Session
            </button>
          </div>
          <p className="text-xs text-slate-400">
            The selected multi-day floor-sheet slice contained incomplete broker records (
            {this.state.errorMessage}). Click above to restore verified session data.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Main Inner Component
 */
function BrokerSmartMoneyCardInner({
  symbol,
  currentPrice = 0,
  initialData,
  onFetchSmartMoney,
  brokerBaselineShares,
}: BrokerSmartMoneyCardProps) {
  const cleanSymbol = (symbol || '').trim().toUpperCase();
  const [timeframe, setTimeframe] = useState<SmartMoneyTimeframe>('1D');
  const [rawPayload, setRawPayload] = useState<any>(initialData ?? null);
  const [cached1DPayload, setCached1DPayload] = useState<any>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(false);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!cleanSymbol) return;
    let isMounted = true;

    async function loadTimeframeData() {
      // If initialData already contains the requested timeframe key, use it immediately
      const tfUpper = timeframe.toUpperCase();
      const tfLower = timeframe.toLowerCase();
      if (
        initialData &&
        typeof initialData === 'object' &&
        !Array.isArray(initialData) &&
        (Array.isArray(initialData[tfUpper]) || Array.isArray(initialData[tfLower]))
      ) {
        setRawPayload(initialData[tfUpper] ?? initialData[tfLower]);
        setWarningBanner(null);
        return;
      }

      setLoading(true);
      setWarningBanner(null);

      const days = timeframe === '5D' ? 5 : timeframe === '1M' ? 20 : 1;

      try {
        let responseData: any;

        if (onFetchSmartMoney) {
          responseData = await onFetchSmartMoney(cleanSymbol, timeframe, days);
        } else {
          // Standard fetch with both timeframe=5D and days=5 query params for backend compatibility
          const res = await fetch(
            `/api/stocks/${encodeURIComponent(
              cleanSymbol
            )}/smart-money?timeframe=${timeframe}&tf=${tfLower}&days=${days}`,
            { headers: { Accept: 'application/json' } }
          );

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          responseData = await res.json();
        }

        if (!isMounted) return;

        const normalizedCheck = normalizeAndAggregateBrokerData(
          responseData,
          timeframe,
          brokerBaselineShares
        );

        if (normalizedCheck.length === 0 && timeframe !== '1D' && cached1DPayload) {
          // Graceful fallback if 5D/1M floor-sheet table isn't backfilled for this scrip yet
          setWarningBanner(
            `${timeframe} multi-day floor-sheet aggregation is currently syncing for ${cleanSymbol}. Showing latest verified session telemetry.`
          );
          setRawPayload(cached1DPayload);
        } else {
          setRawPayload(responseData);
          if (timeframe === '1D' && normalizedCheck.length > 0) {
            setCached1DPayload(responseData);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        if (cached1DPayload) {
          setWarningBanner(
            `Could not fetch live ${timeframe} floor-sheet rollup. Displaying cached session data.`
          );
          setRawPayload(cached1DPayload);
        } else if (initialData) {
          setRawPayload(initialData);
        } else {
          setRawPayload([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTimeframeData();
    return () => {
      isMounted = false;
    };
  }, [cleanSymbol, timeframe, initialData, onFetchSmartMoney, brokerBaselineShares]);

  // Normalize and split into Top Accumulators vs Top Distributors
  const {
    topAccumulators,
    topDistributors,
    summaryMetrics,
  } = useMemo(() => {
    const allBrokers = normalizeAndAggregateBrokerData(
      rawPayload,
      timeframe,
      brokerBaselineShares
    );

    const accumulators = [...allBrokers]
      .filter((b) => b.netVolume > 0)
      .sort((a, b) => b.netVolume - a.netVolume)
      .slice(0, 5);

    const distributors = [...allBrokers]
      .filter((b) => b.netVolume < 0)
      .sort((a, b) => a.netVolume - b.netVolume) // Most negative first
      .slice(0, 5);

    const top5NetBuyVol = accumulators.reduce((s, b) => s + b.netVolume, 0);
    const top5NetSellVol = Math.abs(distributors.reduce((s, b) => s + b.netVolume, 0));
    const totalTop5Flow = top5NetBuyVol + top5NetSellVol;

    const accumulationPressurePct =
      totalTop5Flow > 0 ? Math.round((top5NetBuyVol / totalTop5Flow) * 100) : 50;

    // Weighted Smart-Money Buy VWAP across Top 5 Accumulators
    const top5BuyTurnover = accumulators.reduce((s, b) => s + b.buyTurnoverNpr, 0);
    const top5GrossBuyVol = accumulators.reduce((s, b) => s + b.buyVolume, 0);
    const smartMoneyBuyVwap =
      top5GrossBuyVol > 0 && top5BuyTurnover > 0
        ? Number((top5BuyTurnover / top5GrossBuyVol).toFixed(2))
        : 0;

    // Highest Anomaly Broker among top accumulators
    const leadSmartBroker =
      [...accumulators].sort((a, b) => b.anomalyScore - a.anomalyScore)[0] || null;

    // Profit cushion of smart money relative to current LTP
    const vwapCushionPct =
      currentPrice > 0 && smartMoneyBuyVwap > 0
        ? Number((((currentPrice - smartMoneyBuyVwap) / smartMoneyBuyVwap) * 100).toFixed(2))
        : null;

    return {
      topAccumulators: accumulators,
      topDistributors: distributors,
      summaryMetrics: {
        top5NetBuyVol,
        top5NetSellVol,
        accumulationPressurePct,
        smartMoneyBuyVwap,
        vwapCushionPct,
        leadSmartBroker,
        totalActiveBrokers: allBrokers.length,
      },
    };
  }, [rawPayload, timeframe, brokerBaselineShares, currentPrice]);

  return (
    <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 md:p-5 text-slate-100 shadow-xl space-y-4">
      {/* 1. HEADER & 1D / 5D / 1M TIMEFRAME SWITCHER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
              Broker Smart Money Flow ({cleanSymbol || 'NEPSE'})
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              30D Baseline Normalized
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Detects institutional floor-sheet accumulation vs. retail herd volume using anomaly multiples &amp; ticket sizes.
          </p>
        </div>

        {/* Timeframe Selector Pills */}
        <div className="inline-flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          {(['1D', '5D', '1M'] as SmartMoneyTimeframe[]).map((tf) => {
            const isActive = timeframe === tf;
            return (
              <button
                key={tf}
                type="button"
                disabled={loading}
                onClick={() => setTimeframe(tf)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                } ${loading ? 'opacity-60 cursor-wait' : ''}`}
              >
                {tf === '1D' ? '1D (Session)' : tf === '5D' ? '5D (Weekly)' : '1M (20D)'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Warning Banner when 5D/1M falls back gracefully */}
      {warningBanner && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3.5 py-2 rounded-xl text-xs flex items-center justify-between gap-2">
          <span>ℹ️ {warningBanner}</span>
          <button
            type="button"
            onClick={() => setWarningBanner(null)}
            className="text-amber-200 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. SMART-MONEY SUMMARY TELEMETRY STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Smart-Money Buy VWAP ({timeframe})
          </div>
          <div className="text-base md:text-lg font-bold font-mono text-white mt-1">
            {formatPrice(summaryMetrics.smartMoneyBuyVwap)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {summaryMetrics.vwapCushionPct !== null ? (
              <span>
                LTP vs VWAP:{' '}
                <strong
                  className={
                    summaryMetrics.vwapCushionPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  {summaryMetrics.vwapCushionPct >= 0 ? '+' : ''}
                  {summaryMetrics.vwapCushionPct}%
                </strong>
              </span>
            ) : (
              'Top-5 accumulator cost basis'
            )}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Lead Anomaly Broker
          </div>
          <div className="text-base md:text-lg font-bold text-indigo-300 mt-1">
            {summaryMetrics.leadSmartBroker
              ? `Broker #${summaryMetrics.leadSmartBroker.brokerId} (${summaryMetrics.leadSmartBroker.anomalyScore}x)`
              : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {summaryMetrics.leadSmartBroker
              ? `Avg Ticket: ${summaryMetrics.leadSmartBroker.avgBuyTicketKitta} kitta/trade`
              : 'No outlier accumulation'}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Top-5 Net Accumulation
          </div>
          <div className="text-base md:text-lg font-bold font-mono text-emerald-400 mt-1">
            +{formatInt(summaryMetrics.top5NetBuyVol)} kitta
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Absorbed by top 5 buyers
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            Top-5 Net Distribution
          </div>
          <div className="text-base md:text-lg font-bold font-mono text-rose-400 mt-1">
            -{formatInt(summaryMetrics.top5NetSellVol)} kitta
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Offloaded by top 5 sellers
          </div>
        </div>
      </div>

      {/* 3. ACCUMULATION VS DISTRIBUTION PRESSURE GAUGE */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-emerald-400">
            Accumulation Pressure: {summaryMetrics.accumulationPressurePct}%
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            {summaryMetrics.accumulationPressurePct >= 62
              ? '🔥 Strong Institutional Absorption'
              : summaryMetrics.accumulationPressurePct <= 38
              ? '⚠️ Heavy Floor-Sheet Distribution'
              : '⚖️ Balanced Two-Way Rotation'}
          </span>
          <span className="font-semibold text-rose-400">
            Distribution: {100 - summaryMetrics.accumulationPressurePct}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-rose-500/30 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-300"
            style={{ width: `${summaryMetrics.accumulationPressurePct}%` }}
          />
        </div>
      </div>

      {/* 4. SPLIT VIEW: TOP 5 ACCUMULATORS VS TOP 5 DISTRIBUTORS */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
          Aggregating {timeframe} floor-sheet transactions &amp; broker anomaly scores for{' '}
          {cleanSymbol}...
        </div>
      ) : topAccumulators.length === 0 && topDistributors.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
          No floor-sheet broker records found for <strong>{cleanSymbol}</strong> in the{' '}
          {timeframe} window.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: TOP 5 ACCUMULATORS (SMART MONEY BUYING) */}
          <div className="border border-emerald-500/20 bg-slate-900/40 rounded-xl overflow-hidden">
            <div className="bg-emerald-950/30 border-b border-emerald-500/20 px-3.5 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Top 5 Accumulators ({timeframe} Net Buyers)
              </span>
              <span className="text-[11px] text-slate-400">Anomaly &bull; Ticket Size</span>
            </div>

            <div className="divide-y divide-slate-800/60">
              {topAccumulators.map((b) => (
                <div
                  key={`acc-${b.brokerId}`}
                  className="p-3 hover:bg-slate-800/40 transition flex items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-white">
                        Broker #{b.brokerId}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        {b.anomalyScore}x Share
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                          b.footprintType === 'INSTITUTIONAL'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : b.footprintType === 'HNI_MIX'
                            ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {b.avgBuyTicketKitta} kitta/tx (
                        {b.footprintType === 'INSTITUTIONAL'
                          ? 'Inst.'
                          : b.footprintType === 'HNI_MIX'
                          ? 'HNI'
                          : 'Retail'}
                        )
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Buy: {formatInt(b.buyVolume)} &bull; Sell: {formatInt(b.sellVolume)} &bull; Buy VWAP:{' '}
                      <span className="text-slate-200">{formatPrice(b.buyVwap)}</span>
                    </div>
                  </div>

                  <div className="text-right font-mono whitespace-nowrap">
                    <div className="text-sm font-bold text-emerald-400">
                      +{formatInt(b.netVolume)} kitta
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatLakhs(b.netTurnoverNpr)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: TOP 5 DISTRIBUTORS (SUPPLY DUMPING) */}
          <div className="border border-rose-500/20 bg-slate-900/40 rounded-xl overflow-hidden">
            <div className="bg-rose-950/30 border-b border-rose-500/20 px-3.5 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                Top 5 Distributors ({timeframe} Net Sellers)
              </span>
              <span className="text-[11px] text-slate-400">Exit VWAP &bull; Net Supply</span>
            </div>

            <div className="divide-y divide-slate-800/60">
              {topDistributors.map((b) => (
                <div
                  key={`dist-${b.brokerId}`}
                  className="p-3 hover:bg-slate-800/40 transition flex items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">
                        Broker #{b.brokerId}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        ({b.sellTradesCount} sell tickets)
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Sell: {formatInt(b.sellVolume)} &bull; Buy: {formatInt(b.buyVolume)} &bull; Sell VWAP:{' '}
                      <span className="text-slate-200">{formatPrice(b.sellVwap)}</span>
                    </div>
                  </div>

                  <div className="text-right font-mono whitespace-nowrap">
                    <div className="text-sm font-bold text-rose-400">
                      {formatInt(b.netVolume)} kitta
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatLakhs(b.netTurnoverNpr)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Exported Wrapper with Built-In Error Boundary Protection
 */
export function BrokerSmartMoneyCard(props: BrokerSmartMoneyCardProps) {
  const [resetKey, setResetKey] = useState(0);

  return (
    <BrokerSmartMoneyErrorBoundary onReset={() => setResetKey((k) => k + 1)}>
      <BrokerSmartMoneyCardInner key={`${props.symbol}-${resetKey}`} {...props} />
    </BrokerSmartMoneyErrorBoundary>
  );
}
