import React from 'react';
import { Target, ShieldAlert, TrendingUp, Info } from 'lucide-react';

interface EntryRiskCardProps {
  levels: {
    entryZone?: { low: number; high: number; label: string };
    stopLoss?: { price: number; pct: number; label: string };
    target1?: { price: number; pct: number; horizon?: string; label: string };
    target2?: { price: number; pct: number; horizon?: string; label: string };
    riskPerShare?: number;
    rewardToTarget1?: number;
    rewardToTarget2?: number;
    rrr1?: number;
    rrr2?: number;
    isValidTradeSetup?: boolean;
  };
  currentPrice?: number;
}

export function EntryRiskCard({ levels, currentPrice }: EntryRiskCardProps) {
  if (!levels) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-100 shadow-xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <Target size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Entry & Risk Management Plan
            </h3>
            <p className="text-[11px] text-slate-400">
              Risk-reward aligned with nearby support & overhead resistance
            </p>
          </div>
        </div>

        {levels.isValidTradeSetup !== undefined && (
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              levels.isValidTradeSetup
                ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                : 'bg-amber-950/60 border-amber-700/80 text-amber-300'
            }`}
          >
            {levels.isValidTradeSetup ? '✓ Favorable Risk:Reward Setup' : '⚠️ Moderate Risk:Reward'}
          </span>
        )}
      </div>

      {/* ── Key Levels Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Entry Zone */}
        <div className="rounded-xl bg-slate-900/80 border border-blue-900/40 p-3">
          <div className="text-[11px] text-blue-400 font-semibold uppercase tracking-wide">
            Suggested Entry Zone
          </div>
          <div className="text-base sm:text-lg font-black text-white mt-1">
            {levels.entryZone?.label || '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Optimal accumulation range
          </div>
        </div>

        {/* Target 1 */}
        <div className="rounded-xl bg-slate-900/80 border border-emerald-900/40 p-3">
          <div className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wide">
            Target 1 (Swing)
          </div>
          <div className="text-base sm:text-lg font-black text-emerald-400 mt-1">
            {levels.target1?.label || '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {levels.target1?.horizon || '1–2 Weeks Horizon'}
          </div>
        </div>

        {/* Target 2 */}
        <div className="rounded-xl bg-slate-900/80 border border-teal-900/40 p-3">
          <div className="text-[11px] text-teal-400 font-semibold uppercase tracking-wide">
            Target 2 (Position)
          </div>
          <div className="text-base sm:text-lg font-black text-teal-300 mt-1">
            {levels.target2?.label || '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {levels.target2?.horizon || '3–6 Weeks Horizon'}
          </div>
        </div>

        {/* Stop Loss */}
        <div className="rounded-xl bg-slate-900/80 border border-rose-900/40 p-3">
          <div className="text-[11px] text-rose-400 font-semibold uppercase tracking-wide">
            Stop-Loss (Exit Point)
          </div>
          <div className="text-base sm:text-lg font-black text-rose-400 mt-1">
            {levels.stopLoss?.label || '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Invalidation threshold
          </div>
        </div>
      </div>

      {/* ── Per-Share Math & R:R Ratios ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk per Share</div>
          <div className="font-bold text-rose-300 mt-0.5">
            Rs. {levels.riskPerShare ?? '—'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Reward to Target 1</div>
          <div className="font-bold text-emerald-300 mt-0.5">
            +Rs. {levels.rewardToTarget1 ?? '—'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk : Reward (Target 1)</div>
          <div className="font-black text-sky-400 mt-0.5">
            {levels.rrr1 != null ? `${levels.rrr1} : 1` : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk : Reward (Target 2)</div>
          <div className="font-black text-purple-400 mt-0.5">
            {levels.rrr2 != null ? `${levels.rrr2} : 1` : '—'}
          </div>
        </div>
      </div>

      {/* ── Methodology Explanation Note ── */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400">
        <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <span>
          <strong>Methodology:</strong> Entry zone is formulated from current price, ATR volatility band,
          and confirmed support boundaries. Target 1 is aligned just below nearest major overhead resistance to
          avoid selling congestion.
        </span>
      </div>
    </div>
  );
}
