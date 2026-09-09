import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck, Scale } from 'lucide-react';

interface EvidencePanelProps {
  bullishFactors?: string[];
  bearishFactors?: string[];
}

export function EvidencePanel({ bullishFactors = [], bearishFactors = [] }: EvidencePanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-200 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Scale size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Bullish vs. Bearish Evidence Matrix
            </h3>
            <p className="text-[11px] text-slate-400">
              Balanced technical evaluation designed to eliminate confirmation bias
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
        {/* Bullish Factors */}
        <div className="rounded-xl bg-emerald-950/20 border border-emerald-800/40 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-emerald-400">
            <CheckCircle2 size={14} /> Bullish Evidence ({bullishFactors.length})
          </div>
          <ul className="space-y-1.5 text-slate-300">
            {bullishFactors.map((factor, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-emerald-400 font-black mt-0.5">•</span>
                <span>{factor}</span>
              </li>
            ))}
            {bullishFactors.length === 0 && (
              <li className="text-slate-500 italic">No significant bullish signals confirmed.</li>
            )}
          </ul>
        </div>

        {/* Bearish Factors */}
        <div className="rounded-xl bg-rose-950/20 border border-rose-800/40 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-rose-400">
            <AlertTriangle size={14} /> Bearish & Headwind Evidence ({bearishFactors.length})
          </div>
          <ul className="space-y-1.5 text-slate-300">
            {bearishFactors.map((factor, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-rose-400 font-black mt-0.5">•</span>
                <span>{factor}</span>
              </li>
            ))}
            {bearishFactors.length === 0 && (
              <li className="text-slate-500 italic">No critical bearish headwinds detected.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
