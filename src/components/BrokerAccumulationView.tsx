import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, TrendingUp, TrendingDown, ShieldAlert, Award,
  RefreshCw, Search, ArrowUpRight, ArrowDownRight, Layers,
  PieChart, Activity, AlertTriangle, CheckCircle2, ShieldCheck, Calendar
} from 'lucide-react';
import { StatCard, InfoBanner, Spinner, StockSearchSelect } from './ui';
import {
  calculateTopBrokerAccumulation,
  calculateBrokerConcentration,
  calculateRepeatedBrokerPatterns,
  calculateBuySellImbalance,
  calculateUnusualVolume,
  evaluateBrokerFloorsheetConfluence
} from '../utils/signals/brokerFloorsheetSignals';
import { fetchRealBrokerAnalysis, fetchRealFloorsheet } from '../utils/liveData';

interface BrokerRow {
  broker: number;
  brokerId?: number;
  buyQty: number;
  sellQty: number;
  netQty: number;
  buyAmount?: number;
  sellAmount?: number;
  netAmount?: number;
}

export function BrokerAccumulationView({ initialSymbol = 'SHIVM' }: { initialSymbol?: string }) {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [brokerData, setBrokerData] = useState<any>(null);
  const [floorsheetContracts, setFloorsheetContracts] = useState<any[]>([]);

  const loadBrokerData = useCallback(async (sym = symbol, dt = selectedDate) => {
    setLoading(true);
    setError(null);
    try {
      const [bData, fsData] = await Promise.all([
        fetchRealBrokerAnalysis(sym, 1, { date: dt, refresh: true }),
        fetchRealFloorsheet(sym, dt, 1, 500).catch(() => null)
      ]);
      setBrokerData(bData);
      const rows = Array.isArray(fsData) ? fsData : (Array.isArray(fsData?.rows) ? fsData.rows : []);
      setFloorsheetContracts(rows);
      if (bData?.businessDate && !dt) {
        setSelectedDate(bData.businessDate);
      }
    } catch (err: any) {
      setError(err.message || `Failed to load broker analysis for ${sym}`);
    } finally {
      setLoading(false);
    }
  }, [symbol, selectedDate]);

  useEffect(() => {
    loadBrokerData(symbol, selectedDate);
  }, [symbol, selectedDate, loadBrokerData]);

  // Extract available trading dates
  const availableDates = useMemo(() => {
    const list = Array.isArray(brokerData?.availableDates) ? brokerData.availableDates : [];
    return list.slice(0, 15);
  }, [brokerData]);

  // Run Step 2a Broker Floorsheet Signals
  const brokerSignals = useMemo(() => {
    if (!brokerData && floorsheetContracts.length === 0) return null;

    const brokersList = Array.isArray(brokerData?.brokers) && brokerData.brokers.length > 0
      ? brokerData.brokers
      : (Array.isArray(brokerData?.allBrokers) ? brokerData.allBrokers : []);

    const volume = Number(brokerData?.totalVolume || brokerData?.totalTradedQty || 0);

    return evaluateBrokerFloorsheetConfluence({
      symbol,
      tradeDate: selectedDate || brokerData?.businessDate || '',
      currentVolume: volume,
      brokers: brokersList,
      dailyBrokerHistory: Array.isArray(brokerData?.dailyFlow) ? brokerData.dailyFlow : [],
      contracts: floorsheetContracts
    });
  }, [brokerData, floorsheetContracts, symbol, selectedDate]);

  const sessionClosePrice = useMemo(() => {
    const raw = Number(
      brokerData?.closePrice ||
      brokerData?.ltp ||
      brokerData?.price ||
      (floorsheetContracts.length > 0 ? (floorsheetContracts[0]?.rate || floorsheetContracts[0]?.contractRate || 0) : 0)
    );
    return isFinite(raw) && raw > 0 ? raw : 0;
  }, [brokerData, floorsheetContracts]);

  const sessionVwap = useMemo(() => {
    if (brokerData?.vwap && Number(brokerData.vwap) > 0) return Number(brokerData.vwap);
    const to = Number(brokerData?.totalTurnover || 0);
    const vol = Number(brokerData?.totalVolume || 0);
    if (to > 0 && vol > 0) return +(to / vol).toFixed(2);
    return sessionClosePrice;
  }, [brokerData, sessionClosePrice]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Broker Accumulation & CR5 Telemetry
              </h1>
              <p className="text-xs text-slate-400">
                Institutional order flow analysis: Net broker absorption, concentration ratios (CR3/CR5), HHI, and wash trade detection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-44">
              <StockSearchSelect
                value={symbol}
                onChange={(s) => {
                  setSymbol(s);
                  loadBrokerData(s, selectedDate);
                }}
                placeholder="Search Scrip..."
              />
            </div>

            {availableDates.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300">
                <Calendar size={13} className="text-sky-400" />
                <select
                  value={selectedDate || availableDates[0]}
                  onChange={(e) => {
                    const dt = e.target.value;
                    setSelectedDate(dt);
                    loadBrokerData(symbol, dt);
                  }}
                  className="bg-transparent font-mono text-xs text-white focus:outline-none cursor-pointer"
                >
                  {availableDates.map((dt: string) => (
                    <option key={dt} value={dt} className="bg-slate-900 text-white">
                      {dt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => loadBrokerData(symbol, selectedDate)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <InfoBanner type="danger">
          <div className="font-semibold">Broker Analysis Data Error</div>
          <div className="text-xs text-red-300">{error}</div>
        </InfoBanner>
      )}

      {loading && !brokerSignals ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40">
          <Spinner size="lg" />
          <span className="text-xs text-slate-400">Auditing tick-by-tick broker order flow for {symbol}…</span>
        </div>
      ) : !brokerSignals ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-400" size={32} />
          <h3 className="text-sm font-bold text-white">No Broker Transaction Records Found</h3>
          <p className="mt-1 text-xs text-slate-400">
            No active broker trade prints were logged for {symbol} in the requested session.
          </p>
        </div>
      ) : (
        <>
          {/* Top Confluence Summary Bar */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Floorsheet Microstructure Rating</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  brokerSignals.compositeScore >= 70
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : brokerSignals.compositeScore >= 45
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-red-500/20 text-red-400 border border-red-500/40'
                }`}>
                  {brokerSignals.compositeScore >= 70 ? 'ACCUMULATION DOMINANT' : brokerSignals.compositeScore >= 45 ? 'NEUTRAL CHURN' : 'DISTRIBUTION HEAVY'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Confluence score combines top-broker net buying, buyer concentration asymmetry (&Delta;CR5), and aggressor flow.
              </p>
            </div>

            <div className="flex items-center gap-6 flex-wrap">
              {sessionClosePrice > 0 && (
                <div className="text-right border-r border-slate-800 pr-5">
                  <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    {selectedDate ? `Session Close (${selectedDate})` : 'Latest Close / LTP'}
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    Rs. {sessionClosePrice.toLocaleString()}
                  </div>
                  {sessionVwap > 0 && (
                    <div className="text-[11px] text-slate-400 font-mono">
                      VWAP: Rs. {sessionVwap.toFixed(2)}
                    </div>
                  )}
                </div>
              )}

              <div className="text-right">
                <div className="text-3xl font-black text-white font-mono">
                  {brokerSignals.compositeScore} <span className="text-xs text-slate-500 font-normal">/ 100</span>
                </div>
                <div className="text-[10px] text-slate-400 font-medium">Broker Alpha Confluence</div>
              </div>
            </div>
          </div>

          {/* Primary Stat Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Top 3 Net Volume"
              value={`${(brokerSignals?.signals?.accumulation?.top3NetKitta ?? 0) >= 0 ? '+' : ''}${(brokerSignals?.signals?.accumulation?.top3NetKitta ?? 0).toLocaleString()} kitta`}
              color={(brokerSignals?.signals?.accumulation?.top3NetKitta ?? 0) >= 0 ? '#10b981' : '#ef4444'}
              subtitle={`Rs. ${((brokerSignals?.signals?.accumulation?.top3NetAmountNpr ?? 0) / 100000).toFixed(1)} Lakhs`}
            />
            <StatCard
              label="Top 5 Absorption"
              value={`${brokerSignals?.signals?.accumulation?.absorptionRatioTop5Pct ?? 0}%`}
              color={(brokerSignals?.signals?.accumulation?.absorptionRatioTop5Pct ?? 0) >= 35 ? '#10b981' : '#94a3b8'}
              subtitle="Of total traded volume"
            />
            <StatCard
              label="Buyer Concentration (CR5)"
              value={`${brokerSignals?.signals?.concentration?.cr5Pct ?? 0}%`}
              color={(brokerSignals?.signals?.concentration?.cr5Pct ?? 0) >= 40 ? '#10b981' : '#94a3b8'}
              subtitle={`Seller SCR5: ${brokerSignals?.signals?.concentration?.scr5Pct ?? 0}%`}
            />
            <StatCard
              label="Syndicate Streak"
              value={`${brokerSignals?.signals?.repeatedPatterns?.streakSessions ?? 1} Sessions`}
              color={(brokerSignals?.signals?.repeatedPatterns?.streakSessions ?? 1) >= 3 ? '#10b981' : '#94a3b8'}
              subtitle="Consecutive Accumulation"
            />
          </div>

          {/* Detailed Metric Columns */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Concentration & Asymmetry Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Concentration Asymmetry</span>
                <PieChart size={16} className="text-purple-400" />
              </div>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">CR3 (Top 3 Buyers)</span>
                  <span className="font-mono font-bold text-slate-100">{brokerSignals?.signals?.concentration?.cr3Pct ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">CR5 (Top 5 Buyers)</span>
                  <span className="font-mono font-bold text-slate-100">{brokerSignals?.signals?.concentration?.cr5Pct ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">SCR5 (Top 5 Sellers)</span>
                  <span className="font-mono font-bold text-slate-100">{brokerSignals?.signals?.concentration?.scr5Pct ?? 0}%</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-2">
                  <span className="text-slate-300 font-semibold">&Delta;CR5 (Buyer - Seller)</span>
                  <span className={`font-mono font-bold ${(brokerSignals?.signals?.concentration?.deltaCr5Pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(brokerSignals?.signals?.concentration?.deltaCr5Pct ?? 0) >= 0 ? '+' : ''}{brokerSignals?.signals?.concentration?.deltaCr5Pct ?? 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Buyer HHI Index</span>
                  <span className="font-mono text-slate-300">{brokerSignals?.signals?.concentration?.buyerHhi ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Aggressor Flow & Wash Trade Check */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Order Flow & Wash Trades</span>
                <Activity size={16} className="text-cyan-400" />
              </div>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Aggressor Imbalance</span>
                  <span className={`font-mono font-bold ${(brokerSignals?.signals?.imbalance?.netAggressorKitta ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(brokerSignals?.signals?.imbalance?.netAggressorKitta ?? 0) >= 0 ? '+' : ''}{(brokerSignals?.signals?.imbalance?.netAggressorKitta ?? 0).toLocaleString()} kitta
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Order Flow Pressure</span>
                  <span className="font-mono text-slate-200">{brokerSignals?.signals?.imbalance?.orderFlowPressurePct ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Whale Prints (&ge; 500 kitta)</span>
                  <span className="font-mono font-bold text-purple-300">{brokerSignals?.signals?.imbalance?.whalePrintsCount ?? 0} prints ({(brokerSignals?.signals?.imbalance?.whaleVolumeKitta ?? 0).toLocaleString()} kitta)</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-2">
                  <span className="text-slate-400">Wash Trade Churn Flag</span>
                  {brokerSignals?.signals?.accumulation?.isWashTradingSuspected ? (
                    <span className="inline-flex items-center gap-1 text-rose-400 font-bold text-[11px]">
                      <AlertTriangle size={12} /> Suspected Churn
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
                      <ShieldCheck size={12} /> Clean Absorption
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Syndicate Streak & Persistence */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Institutional Syndicate</span>
                <Award size={16} className="text-amber-400" />
              </div>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Syndicate Persistence</span>
                  <span className="font-mono font-bold text-amber-300">
                    {brokerSignals?.signals?.repeatedPatterns?.isPersistentSyndicate ? 'Active Multi-Session' : 'Transient Flow'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Consistency Ratio</span>
                  <span className="font-mono text-slate-100">{brokerSignals?.signals?.repeatedPatterns?.consistencyRatioPct ?? 0}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Streak Sessions</span>
                  <span className="font-mono text-slate-100">{brokerSignals?.signals?.repeatedPatterns?.streakSessions ?? 1} consecutive</span>
                </div>
                <div className="mt-3 rounded-lg bg-slate-950/40 p-2.5 text-[11px] text-slate-400">
                  Persistence reflects smart money syndicates steadily absorbing retail float across multiple clearing cycles without triggering circuit halts.
                </div>
              </div>
            </div>
          </div>

          {/* Weaknesses & NEPSE Disclaimers */}
          {brokerSignals.weaknesses.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <AlertTriangle size={14} />
                <span>Microstructure Disclaimers & Operator Caveats</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-amber-200/90 list-disc list-inside">
                {brokerSignals.weaknesses.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export default BrokerAccumulationView;
