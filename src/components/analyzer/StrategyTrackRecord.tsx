import React from 'react';
import { TrendingUp, BarChart2, Shield } from 'lucide-react';

interface StrategyTrackRecordProps {
  strategyTrackRecord?: {
    totalTrades: number;
    winningTrades?: number;
    losingTrades?: number;
    winRate: number;
    returnPct: number;
    maxDrawdownPct: number;
    profitFactor?: number | null;
    averageDaysHeld?: number | null;
    sampleQuality?: string;
  };
}

export function StrategyTrackRecord({ strategyTrackRecord }: StrategyTrackRecordProps) {
  if (!strategyTrackRecord || strategyTrackRecord.totalTrades === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-200 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <TrendingUp size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Rule-Based Strategy Track Record
            </h3>
            <p className="text-[11px] text-slate-400">
              Multi-factor trend & momentum strategy simulated across full historical dataset
            </p>
          </div>
        </div>

        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
          Sample Quality: <strong className="text-emerald-400">{strategyTrackRecord.sampleQuality || 'HIGH'}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Total Trades</div>
          <div className="text-xl font-black text-white mt-0.5">
            {strategyTrackRecord.totalTrades}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {strategyTrackRecord.winningTrades ?? '—'} Wins / {strategyTrackRecord.losingTrades ?? '—'} Losses
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Win Rate</div>
          <div className="text-xl font-black text-emerald-400 mt-0.5">
            {strategyTrackRecord.winRate}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Benchmark edge
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Profit Factor</div>
          <div className="text-xl font-black text-purple-400 mt-0.5">
            {strategyTrackRecord.profitFactor != null ? `${strategyTrackRecord.profitFactor}x` : '—'}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Gross gains vs losses
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3">
          <div className="text-[11px] text-slate-400">Max Drawdown</div>
          <div className="text-xl font-black text-rose-400 mt-0.5">
            -{strategyTrackRecord.maxDrawdownPct ?? (strategyTrackRecord as any).maxDrawdown ?? 0}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Peak-to-trough risk
          </div>
        </div>
      </div>
    </div>
  );
}
