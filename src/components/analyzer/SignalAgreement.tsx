import React from 'react';
import { Gauge, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';

interface SignalAgreementProps {
  signalAgreement?: {
    bullishGroups: number;
    bearishGroups: number;
    neutralGroups: number;
    totalEvaluated: number;
    agreementPct: number;
  };
}

export function SignalAgreement({ signalAgreement }: SignalAgreementProps) {
  if (!signalAgreement) return null;

  const {
    bullishGroups = 0,
    bearishGroups = 0,
    neutralGroups = 0,
    totalEvaluated = 1,
    agreementPct = 50,
  } = signalAgreement;

  const bullWidth = `${Math.round((bullishGroups / totalEvaluated) * 100)}%`;
  const neutralWidth = `${Math.round((neutralGroups / totalEvaluated) * 100)}%`;
  const bearWidth = `${Math.round((bearishGroups / totalEvaluated) * 100)}%`;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-200 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <Gauge size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Signal Agreement Across Dimensions
            </h3>
            <p className="text-[11px] text-slate-400">
              Consensus of independent evidence groups (not a statistical return probability)
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400 mr-1.5">Evidence Agreement:</span>
          <span className="text-base font-black text-emerald-400">{agreementPct}%</span>
        </div>
      </div>

      {/* ── Segmented Progress Bar ── */}
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded-full bg-slate-900 overflow-hidden flex border border-slate-800">
          <div style={{ width: bullWidth }} className="bg-emerald-500 transition-all duration-500" />
          <div style={{ width: neutralWidth }} className="bg-amber-400 transition-all duration-500" />
          <div style={{ width: bearWidth }} className="bg-rose-500 transition-all duration-500" />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Bullish Groups: <strong>{bullishGroups}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span>Neutral: <strong>{neutralGroups}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>Bearish Groups: <strong>{bearishGroups}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
