import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, TrendingUp, AlertTriangle, Play, RefreshCw, CheckCircle2,
  XCircle, Clock, ShieldCheck, DollarSign, Award, Target, Flame, Filter, Zap, Bot, Anchor
} from 'lucide-react';
import { StatCard, InfoBanner, Spinner } from './ui';
import { getProxyBase } from '../utils/proxyBase.js';
import { SETTLEMENT_CYCLE } from '../constants/marketRules.js';

interface SignalAttributionItem {
  signal: string;
  tradesCount: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnlNpr: number;
  avgReturnPct: number;
  profitFactor: number;
  edgeVerdict: 'HIGH_ALPHA_SIGNAL' | 'POSITIVE_EDGE' | 'DRAG_LOSS_SIGNAL' | 'NEUTRAL';
}

interface PaperPick {
  id: string;
  date: string;
  symbol: string;
  sector: string;
  action: 'BUY' | 'WATCH' | 'AVOID';
  compositeScore: number;
  confidence: number;
  triggers: string[];
  entryZone: [number, number];
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  shares: number;
  rejectionReasons?: string[];
}

interface ClosedTrade {
  id: string;
  symbol: string;
  sector: string;
  entryDate: string;
  exitDate: string;
  shares: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  returnPct: number;
  outcome: string;
  exitReason: string;
  holdSessions: number;
  triggers: string[];
  commission: number;
  cgt: number;
}

interface OpenPosition {
  id: string;
  symbol: string;
  sector: string;
  entryDate: string;
  shares: number;
  entryPrice: number;
  costBasisNpr: number;
  stopLoss: number;
  currentStopLoss?: number;
  initialStopLoss?: number;
  target1: number;
  target2: number;
  triggers: string[];
  holdSessions: number;
  t1Banked?: boolean;
  ratchetStage?: string;
}

export function PaperTradingJournalScreen() {
  const [activeTab, setActiveTab] = useState<'journal' | 'attribution' | 'picks' | 'positions'>('journal');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [capital, setCapital] = useState<number>(1000000);
  const [dailyPicks, setDailyPicks] = useState<PaperPick[]>([]);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [closedJournal, setClosedJournal] = useState<ClosedTrade[]>([]);
  const [attribution, setAttribution] = useState<Record<string, SignalAttributionItem>>({});
  const [botConfig, setBotConfig] = useState<{
    enabled: boolean;
    riskPerTradePct: number;
    maxConcurrentPositions: number;
    trailingRatchetPolicy: string;
  }>({
    enabled: true,
    riskPerTradePct: 1.5,
    maxConcurrentPositions: 5,
    trailingRatchetPolicy: 'DYNAMIC_RATCHET'
  });
  const [steppingBot, setSteppingBot] = useState<boolean>(false);
  const loadSeqRef = useRef<number>(0);

  const loadData = useCallback(async (isManualRefresh = false) => {
    const seq = ++loadSeqRef.current;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const base = getProxyBase();
    try {
      const [stateResp, attrResp, botResp] = await Promise.all([
        fetch(`${base}/api/paper-trading/state`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${base}/api/paper-trading/attribution`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${base}/api/paper-trading/bot-config`, { signal: AbortSignal.timeout(4000) }).catch(() => null)
      ]);

      if (!stateResp.ok || !attrResp.ok) {
        throw new Error(`Paper trading API error (${stateResp.status} / ${attrResp.status})`);
      }

      const [stateRes, attrRes] = await Promise.all([stateResp.json(), attrResp.json()]);
      if (seq !== loadSeqRef.current) return;

      if (stateRes?.success && stateRes.data) {
        const parsedCap = Number(stateRes.data.capital);
        setCapital(Number.isFinite(parsedCap) ? parsedCap : 1000000);
        setDailyPicks(stateRes.data.dailyPicks || []);
        setOpenPositions(stateRes.data.openPositions || []);
        setClosedJournal(stateRes.data.closedJournal || []);
      }

      if (attrRes?.success && attrRes.data?.signals) {
        setAttribution(attrRes.data.signals);
      }

      if (botResp && botResp.ok) {
        const botData = await botResp.json();
        if (botData?.success && botData.data) {
          setBotConfig(prev => ({ ...prev, ...botData.data }));
        }
      }
    } catch (err: any) {
      if (seq === loadSeqRef.current) {
        setError(err?.message || 'Failed to fetch paper trading state.');
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleToggleBot = async (enable: boolean) => {
    const previous = botConfig;
    const updated = { ...botConfig, enabled: enable };
    setBotConfig(updated);
    setError(null);
    try {
      const base = getProxyBase();
      const resp = await fetch(`${base}/api/paper-trading/bot-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!resp.ok) {
        throw new Error(`Bot config update rejected (HTTP ${resp.status})`);
      }
    } catch (err: any) {
      setBotConfig(previous);
      setError(err?.message || 'Failed to update Autonomous Paper-Execution Bot state.');
    }
  };

  const handleRunBotStep = async () => {
    setSteppingBot(true);
    setError(null);
    try {
      const base = getProxyBase();
      const resp = await fetch(`${base}/api/paper-trading/auto-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!resp.ok) {
        throw new Error(`Bot auto-step failed (HTTP ${resp.status})`);
      }
      await loadData(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to execute bot step.');
    } finally {
      setSteppingBot(false);
    }
  };

  useEffect(() => {
    loadData(false);
    return () => { loadSeqRef.current++; };
  }, [loadData]);

  const totalPnL = closedJournal.reduce((s, t) => s + (t.realizedPnl || 0), 0);
  const winCount = closedJournal.filter(t => t.realizedPnl > 0).length;
  const winRate = closedJournal.length > 0 ? ((winCount / closedJournal.length) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <BookOpen size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Paper Trading Mode & Trade Journal
              </h1>
              <p className="text-xs text-slate-400">
                Automated forward tracking of daily selection picks with full statutory NEPSE rules (T+2 settlement & zero real money risk)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh State</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 flex border-b border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('journal')}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === 'journal'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Trade Journal ({closedJournal.length})
          </button>
          <button
            onClick={() => setActiveTab('attribution')}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === 'attribution'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Signal Performance Attribution
          </button>
          <button
            onClick={() => setActiveTab('positions')}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === 'positions'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Active Holdings ({openPositions.length})
          </button>
          <button
            onClick={() => setActiveTab('picks')}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === 'picks'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Logged Picks ({dailyPicks.length})
          </button>
        </div>
      </div>

      {error && (
        <InfoBanner type="danger">
          <div className="font-semibold">Paper Trading Synchronization Error</div>
          <div className="text-xs text-red-300">{error}</div>
        </InfoBanner>
      )}

      {/* Auto-Bot Workstation & Ratchet Control Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
              botConfig.enabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-slate-700 bg-slate-800 text-slate-400'
            }`}>
              <Bot size={22} className={botConfig.enabled ? 'animate-pulse' : ''} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Autonomous Paper-Execution Bot</h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  botConfig.enabled
                    ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                    : 'border border-slate-700 bg-slate-800 text-slate-400'
                }`}>
                  {botConfig.enabled ? '● Autonomous Active' : '○ Disabled'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Auto-executes high-conviction Minervini Stage 2 & Smart-Money signals into the journal with 4-stage trailing stop-loss ratchets.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleToggleBot(!botConfig.enabled)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                botConfig.enabled
                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  : 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              }`}
            >
              <Zap size={14} />
              <span>{botConfig.enabled ? 'Pause Auto-Bot' : 'Activate Auto-Bot'}</span>
            </button>

            <button
              onClick={handleRunBotStep}
              disabled={steppingBot}
              className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/15 px-3.5 py-2 text-xs font-semibold text-sky-400 transition-colors hover:bg-sky-500/25 disabled:opacity-50"
            >
              <Play size={13} className={steppingBot ? 'animate-spin' : ''} />
              <span>{steppingBot ? 'Processing Ratchets...' : 'Step Engine Now'}</span>
            </button>
          </div>
        </div>

        {/* 4-Stage Trailing Ratchet Strip */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldCheck size={14} className="text-red-400" />
              <span className="text-xs font-semibold text-slate-200">Stage 0: Initial Floor</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Fixed stop-loss (-4% to -6%) at technical pivot point to strictly limit capital drawdown.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Anchor size={14} className="text-cyan-400" />
              <span className="text-xs font-semibold text-slate-200">Stage 1: Breakeven Armor</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              At +1.0R gain, ratchet stop-loss to entry price + 0.6% friction buffer. Zero-loss guaranteed.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-slate-300">
              <DollarSign size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-200">Stage 2: Bank 50% & Lock +1R</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              At Target 1 (+1.5R–2.0R), liquidate 50% shares to bank cash; elevate runner stop-loss to +1.0R floor.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Target size={14} className="text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">Stage 3: Full Runner Exit</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              At Target 2 (+2.5R–3.0R), liquidate remaining runner position for maximized compound yield.
            </p>
          </div>
        </div>
      </div>

      {/* Primary KPI Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Virtual Available Cash"
          value={`Rs. ${capital.toLocaleString()}`}
          color="#38bdf8"
          subtitle="Rs. 10L baseline"
        />
        <StatCard
          label="Net Realized PnL"
          value={`${totalPnL >= 0 ? '+' : ''}Rs. ${totalPnL.toLocaleString()}`}
          color={totalPnL >= 0 ? '#10b981' : '#ef4444'}
          subtitle="Net of statutory fees"
        />
        <StatCard
          label="Journal Win Rate"
          value={`${winRate}%`}
          color={Number(winRate) >= 55 ? '#10b981' : '#f59e0b'}
          subtitle={`${winCount} Wins / ${closedJournal.length - winCount} Losses`}
        />
        <StatCard
          label="Open Positions"
          value={openPositions.length}
          color="#a855f7"
          subtitle="T+2 Settling"
        />
      </div>

      {loading && closedJournal.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : activeTab === 'journal' ? (
        /* Trade Journal Table */
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm">
          <div className="border-b border-slate-800 p-4">
            <h3 className="text-sm font-bold text-white">Closed Trades Execution Journal</h3>
            <p className="text-xs text-slate-400">Chronological history of completed simulated orders with exit rationale</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <tr>
                  <th className="p-3">Symbol</th>
                  <th className="p-3">Entry Date</th>
                  <th className="p-3">Exit Date</th>
                  <th className="p-3">Trigger Signal</th>
                  <th className="p-3">Shares</th>
                  <th className="p-3">Entry</th>
                  <th className="p-3">Exit</th>
                  <th className="p-3">Return %</th>
                  <th className="p-3">Realized PnL</th>
                  <th className="p-3">Hold Days</th>
                  <th className="p-3">Exit Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {closedJournal.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-slate-500">
                      No trades closed yet. When daily market quotes hit targets or stop-loss, executions will automatically log here.
                    </td>
                  </tr>
                ) : (
                  closedJournal.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="p-3 font-bold text-white">{t.symbol}</td>
                      <td className="p-3 font-mono text-slate-400">{t.entryDate}</td>
                      <td className="p-3 font-mono text-slate-400">{t.exitDate}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(t.triggers || []).map((tr, i) => (
                            <span key={i} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                              {tr}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 font-mono">{t.shares}</td>
                      <td className="p-3 font-mono">Rs. {t.entryPrice}</td>
                      <td className="p-3 font-mono">Rs. {t.exitPrice}</td>
                      <td className={`p-3 font-mono font-bold ${t.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.returnPct >= 0 ? '+' : ''}{t.returnPct}%
                      </td>
                      <td className={`p-3 font-mono font-bold ${t.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        Rs. {t.realizedPnl.toLocaleString()}
                      </td>
                      <td className="p-3 font-mono">{t.holdSessions}d</td>
                      <td className="p-3 text-slate-300">{t.exitReason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'attribution' ? (
        /* Signal Attribution: Which Signals Earn or Lose Money */
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-sm font-bold text-white">Signal Performance Attribution Matrix</h3>
            <p className="mt-1 text-xs text-slate-400">
              Quantifies exactly which quantitative sub-signals create alpha vs which signals produce drag or losses.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                  <tr>
                    <th className="p-3">Signal Name</th>
                    <th className="p-3">Trades Triggered</th>
                    <th className="p-3">Win Rate %</th>
                    <th className="p-3">Profit Factor</th>
                    <th className="p-3">Avg Return %</th>
                    <th className="p-3">Net Realized PnL</th>
                    <th className="p-3">Quantitative Edge Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {Object.keys(attribution).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        Insufficient closed trades to compute statistical signal attribution.
                      </td>
                    </tr>
                  ) : (
                    Object.values(attribution).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="p-3 font-bold text-white">
                          <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-orange-300">
                            {item.signal}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{item.tradesCount}</td>
                        <td className={`p-3 font-mono font-bold ${item.winRatePct >= 55 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {item.winRatePct}% ({item.wins}W / {item.losses}L)
                        </td>
                        <td className="p-3 font-mono">{item.profitFactor}x</td>
                        <td className={`p-3 font-mono font-bold ${item.avgReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.avgReturnPct >= 0 ? '+' : ''}{item.avgReturnPct}%
                        </td>
                        <td className={`p-3 font-mono font-bold ${item.netPnlNpr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          Rs. {item.netPnlNpr.toLocaleString()}
                        </td>
                        <td className="p-3">
                          {item.edgeVerdict === 'HIGH_ALPHA_SIGNAL' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                              🟢 High Alpha Edge
                            </span>
                          )}
                          {item.edgeVerdict === 'POSITIVE_EDGE' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                              🔵 Positive Edge
                            </span>
                          )}
                          {item.edgeVerdict === 'DRAG_LOSS_SIGNAL' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                              🔴 Drag / Loss Driver
                            </span>
                          )}
                          {item.edgeVerdict === 'NEUTRAL' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-medium text-slate-400">
                              ⚪ Neutral
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'positions' ? (
        /* Active Holdings Table */
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm">
          <div className="border-b border-slate-800 p-4">
            <h3 className="text-sm font-bold text-white">Open Simulated Positions</h3>
            <p className="text-xs text-slate-400">Active paper trades held under NEPSE T+2 Demat settlement rules & 4-stage trailing ratchets</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <tr>
                  <th className="p-3">Symbol</th>
                  <th className="p-3">Sector</th>
                  <th className="p-3">Entry Date</th>
                  <th className="p-3">Shares</th>
                  <th className="p-3">Entry Price</th>
                  <th className="p-3">Trailing Stop-Loss</th>
                  <th className="p-3">Target 1</th>
                  <th className="p-3">Target 2</th>
                  <th className="p-3">Ratchet Stage</th>
                  <th className="p-3">Hold Days</th>
                  <th className="p-3">T+2 Demat Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {openPositions.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-slate-500">
                      No active open positions currently held.
                    </td>
                  </tr>
                ) : (
                  openPositions.map((pos, idx) => {
                    const effectiveStop = pos.currentStopLoss ?? pos.stopLoss;
                    const stage = pos.ratchetStage || (pos.t1Banked ? 'PROFIT_LOCKED' : 'INITIAL_RISK');
                    return (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="p-3 font-bold text-white">{pos.symbol}</td>
                        <td className="p-3 text-slate-400">{pos.sector}</td>
                        <td className="p-3 font-mono">{pos.entryDate}</td>
                        <td className="p-3 font-mono">
                          {pos.shares}
                          {pos.t1Banked && (
                            <span className="ml-1 text-[10px] text-amber-400 font-semibold">(50% Banked)</span>
                          )}
                        </td>
                        <td className="p-3 font-mono">Rs. {pos.entryPrice}</td>
                        <td className="p-3 font-mono font-semibold text-amber-300">
                          Rs. {effectiveStop}
                          {pos.initialStopLoss && pos.initialStopLoss !== effectiveStop && (
                            <span className="block text-[10px] font-normal text-slate-500 line-through">
                              Init: Rs. {pos.initialStopLoss}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-emerald-400">Rs. {pos.target1}</td>
                        <td className="p-3 font-mono text-emerald-300">Rs. {pos.target2}</td>
                        <td className="p-3">
                          {stage === 'BREAKEVEN_LOCKED' && (
                            <span className="inline-flex items-center gap-1 rounded bg-cyan-950/60 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-800">
                              <Anchor size={10} /> Breakeven Armor
                            </span>
                          )}
                          {stage === 'PROFIT_LOCKED' && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-800">
                              <DollarSign size={10} /> Profit Locked (+1R)
                            </span>
                          )}
                          {stage === 'RUNNER_COMPLETED' && (
                            <span className="inline-flex items-center gap-1 rounded bg-purple-950/60 px-2 py-0.5 text-[10px] font-semibold text-purple-400 border border-purple-800">
                              <Target size={10} /> Runner Exited
                            </span>
                          )}
                          {(stage === 'INITIAL_RISK' || !stage) && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-700">
                              <ShieldCheck size={10} className="text-red-400" /> Initial Risk
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono">{pos.holdSessions ?? 0}d</td>
                        <td className="p-3">
                          {(pos.holdSessions ?? 0) >= SETTLEMENT_CYCLE.sellableDays ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-800">
                              <CheckCircle2 size={10} /> Cleared Demat
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-800">
                              <Clock size={10} /> T+{pos.holdSessions ?? 0} Lock
                            </span>
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
      ) : activeTab === 'picks' ? (
        /* Daily Logged Picks */
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm">
          <div className="border-b border-slate-800 p-4">
            <h3 className="text-sm font-bold text-white">Daily Recorded Selection Picks</h3>
            <p className="text-xs text-slate-400">Complete archive of Buy, Watch, and Avoid decisions from the scoring engine</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Symbol</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3">Composite Score</th>
                  <th className="p-3">Confidence</th>
                  <th className="p-3">Entry Zone</th>
                  <th className="p-3">Stop-Loss</th>
                  <th className="p-3">Targets (T1 / T2)</th>
                  <th className="p-3">Signals / Rejection Reasons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {dailyPicks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-slate-500">
                      No picks logged yet. Run the selection engine to record daily recommendations.
                    </td>
                  </tr>
                ) : (
                  dailyPicks.map((pick, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-slate-400">{pick.date}</td>
                      <td className="p-3 font-bold text-white">{pick.symbol}</td>
                      <td className="p-3">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          pick.action === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : pick.action === 'WATCH'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-red-500/20 text-red-400 border border-red-500/40'
                        }`}>
                          {pick.action}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-100">{pick.compositeScore} / 100</td>
                      <td className="p-3 font-mono text-slate-300">{pick.confidence}%</td>
                      <td className="p-3 font-mono text-slate-300">
                        {pick.entryZone ? `Rs. ${pick.entryZone[0]} – ${pick.entryZone[1]}` : '—'}
                      </td>
                      <td className="p-3 font-mono text-red-400">{pick.stopLoss ? `Rs. ${pick.stopLoss}` : '—'}</td>
                      <td className="p-3 font-mono text-emerald-400">
                        {pick.target1 ? `Rs. ${pick.target1} / ${pick.target2}` : '—'}
                      </td>
                      <td className="p-3 text-[11px] text-slate-400">
                        {pick.rejectionReasons && pick.rejectionReasons.length > 0 ? (
                          <span className="text-red-400">{pick.rejectionReasons[0]}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {pick.triggers.map((tr, i) => (
                              <span key={i} className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300">
                                {tr}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export default PaperTradingJournalScreen;
