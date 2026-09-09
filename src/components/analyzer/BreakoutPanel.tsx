import React from 'react';
import { Target, CheckCircle2, AlertTriangle, ArrowUpRight, Zap } from 'lucide-react';

interface BreakoutPanelProps {
  breakout?: {
    detected: boolean;
    type: string;
    direction: string;
    level: number;
    breakoutPrice: number;
    volumeConfirmed: boolean;
    retestConfirmed: boolean;
    strength: number;
    description: string;
  };
  setupType?: string;
}

export function BreakoutPanel({ breakout, setupType }: BreakoutPanelProps) {
  const isBreakout = breakout?.detected;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-200 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-purple-500/15 border border-purple-500/30 text-purple-400">
            <Zap size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Breakout & Setup Structure
            </h3>
            <p className="text-[11px] text-slate-400">
              Structural breach and consolidation resolution analysis
            </p>
          </div>
        </div>

        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
            isBreakout
              ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          {isBreakout ? '⚡ ACTIVE BREAKOUT' : 'RANGE BOUND'}
        </span>
      </div>

      {isBreakout ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-2.5">
              <div className="text-[11px] text-slate-400 mb-0.5">Key Level Breached</div>
              <div className="font-bold text-white text-sm">
                Rs. {breakout.level}
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-2.5">
              <div className="text-[11px] text-slate-400 mb-0.5">Breakout Execution</div>
              <div className="font-bold text-emerald-400 text-sm">
                Confirmed (Rs. {breakout.breakoutPrice})
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-2.5">
              <div className="text-[11px] text-slate-400 mb-0.5">Volume Confirmation</div>
              <div
                className={`font-bold text-sm ${
                  breakout.volumeConfirmed ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {breakout.volumeConfirmed ? '✓ Confirmed' : '⚠️ Light Volume'}
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-2.5">
              <div className="text-[11px] text-slate-400 mb-0.5">Retest Status</div>
              <div className="font-bold text-slate-300 text-sm">
                {breakout.retestConfirmed ? '✓ Confirmed Retest' : 'Pending Retest'}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-xs text-emerald-300 leading-relaxed">
            {breakout.description}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center space-y-1">
          <div className="text-sm font-semibold text-slate-300">
            No confirmed breakout detected.
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Price is currently oscillating inside established historical boundaries without an
            active resistance breach or support breakdown.
          </p>
        </div>
      )}
    </div>
  );
}
