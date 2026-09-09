import React, { useState } from 'react';
import { History, ShieldAlert, Coins, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface AnalogMatch {
  date: string;
  similarity: number;
  outcome: {
    entryPrice: number;
    exitPrice: number;
    returnPct: number;
    netReturnPct: number;
    daysHeld: number;
    outcome: string;
    outcomeType?: string;
    entryMethod?: string;
  };
}

interface HistoricalAnalogPanelProps {
  analogResult?: {
    analogs?: AnalogMatch[];
    stats?: {
      sampleSize: number;
      winRate: number;
      grossWinRate: number;
      avgReturnPct: number;
      avgNetReturnPct: number;
      avgWinPct: number;
      avgLossPct: number;
      avgDaysHeld: number;
      ambiguousOutcomesCount?: number;
    };
    confidence?: {
      level: string;
      sampleSize: number;
      averageSimilarity: number;
      outcomeConsistency: number;
    };
    note?: string;
  };
}

function getOutcomeLabel(outcome: string) {
  switch (outcome) {
    case 'target2_hit':
      return { label: 'Hit Target 2', color: '#34d399', bg: 'bg-emerald-500/10' };
    case 'target1_hit':
      return { label: 'Hit Target 1', color: '#4ade80', bg: 'bg-emerald-500/10' };
    case 'stop_hit':
      return { label: 'Hit Stop-Loss', color: '#fb7185', bg: 'bg-rose-500/10' };
    default:
      return { label: 'Time Exit', color: '#94a3b8', bg: 'bg-slate-800' };
  }
}

export function HistoricalAnalogPanel({ analogResult }: HistoricalAnalogPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const stats = analogResult?.stats;
  const analogs = analogResult?.analogs || [];
  const confidence = analogResult?.confidence;

  if (!stats && analogResult?.note) {
    return (
      <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4 text-xs text-amber-300">
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertTriangle size={14} /> Historical Analog Search
        </div>
        <p>{analogResult.note}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-200 shadow-xl space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-sky-500/15 border border-sky-500/30 text-sky-400">
            <History size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Historical Analog Analysis (Evidence-Based Backtest)
            </h3>
            <p className="text-[11px] text-slate-400">
              Forward simulated outcomes of identical setups on this stock’s historical OHLCV
            </p>
          </div>
        </div>

        <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
          <Coins size={12} className="text-amber-400" /> Net of SEBON fees & 7.5% CGT
        </span>
      </div>

      {/* ── High-Level Analog Summary Metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Net Win Rate</div>
          <div className="text-xl font-black text-emerald-400 mt-0.5">
            {stats.winRate}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Gross: {stats.grossWinRate ?? stats.winRate ?? 0}%
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Avg Net Return</div>
          <div
            className={`text-xl font-black mt-0.5 ${
              (stats.avgNetReturnPct ?? stats.avgReturnPct ?? 0) >= 0 ? 'text-sky-400' : 'text-rose-400'
            }`}
          >
            {(stats.avgNetReturnPct ?? stats.avgReturnPct ?? 0) >= 0 ? '+' : ''}
            {stats.avgNetReturnPct ?? stats.avgReturnPct ?? 0}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Gross: {(stats.avgReturnPct ?? 0) >= 0 ? '+' : ''}{stats.avgReturnPct ?? 0}%
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Avg Holding Period</div>
          <div className="text-xl font-black text-purple-400 mt-0.5">
            {stats.avgDaysHeld} days
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Max window: 20 days
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Evidence Reliability</div>
          <div
            className={`text-base font-black mt-0.5 ${
              confidence?.level === 'HIGH'
                ? 'text-emerald-400'
                : confidence?.level === 'MEDIUM'
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {confidence?.level || 'MEDIUM'} ({stats.sampleSize} matches)
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Avg Sim: {confidence?.averageSimilarity || 0}%
          </div>
        </div>
      </div>

      {/* ── Explanation Banner ── */}
      <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-300 space-y-1">
        <div className="font-bold text-slate-200">What this evidence means:</div>
        <p className="leading-relaxed">
          The pattern-matching engine found <strong>{stats.sampleSize}</strong> historical sessions
          with closely matching technical fingerprints (RSI, trend alignment, RVOL, returns, volatility).
          Historical analog trades strictly enter at next-day open and calculate real trade friction.
          {stats.sampleSize < 4 && (
            <span className="text-amber-400 block mt-1">
              ⚠️ Limited historical sample ({stats.sampleSize} analog{stats.sampleSize > 1 ? 's' : ''}) — treat evidence as informational only.
            </span>
          )}
        </p>
      </div>

      {/* ── Collapsible Analog Matches Table ── */}
      <div className="space-y-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between w-full py-1 text-xs font-bold text-slate-400 hover:text-white transition"
        >
          <span>
            {expanded ? 'Hide' : 'Inspect'} Individual Historical Matches ({analogs.length} verified sessions)
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expanded && (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-right py-2 px-2">Similarity</th>
                  <th className="text-right py-2 px-2">Entry (t+1 Open)</th>
                  <th className="text-right py-2 px-2">Exit Price</th>
                  <th className="text-right py-2 px-2">Net Return</th>
                  <th className="text-right py-2 px-2">Gross</th>
                  <th className="text-right py-2 px-2">Days</th>
                  <th className="text-left py-2 px-3">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {analogs.map((a, i) => {
                  const o = getOutcomeLabel(a.outcome.outcome);
                  const net = a.outcome.netReturnPct ?? a.outcome.returnPct;
                  return (
                    <tr key={i} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-300 font-sans">{a.date}</td>
                      <td className="py-2 px-2 text-right text-slate-300 font-bold">
                        {a.similarity}%
                      </td>
                      <td className="py-2 px-2 text-right text-slate-400">
                        Rs. {a.outcome.entryPrice}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-400">
                        Rs. {a.outcome.exitPrice}
                      </td>
                      <td
                        className="py-2 px-2 text-right font-bold"
                        style={{ color: net >= 0 ? '#34d399' : '#fb7185' }}
                      >
                        {net >= 0 ? '+' : ''}{net}%
                      </td>
                      <td className="py-2 px-2 text-right text-[11px] text-slate-400">
                        {a.outcome.returnPct >= 0 ? '+' : ''}{a.outcome.returnPct}%
                      </td>
                      <td className="py-2 px-2 text-right text-slate-400">
                        {a.outcome.daysHeld}d
                      </td>
                      <td className="py-2 px-3 font-sans">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{ color: o.color }}
                        >
                          {o.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
