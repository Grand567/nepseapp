import React from 'react';
import { Compass, CheckCircle2, ShieldAlert, ArrowRight } from 'lucide-react';

interface WhatNextPanelProps {
  confirmations?: string[];
  warnings?: string[];
  levels?: {
    stopLoss?: { price: number; label: string };
    entryZone?: { low: number; high: number };
    target1?: { price: number };
  };
  breakout?: {
    detected: boolean;
    level: number;
    breakoutPrice: number;
  };
}

export function WhatNextPanel({
  confirmations = [],
  warnings = [],
  levels,
  breakout,
}: WhatNextPanelProps) {
  // Synthesize clear next-step criteria from Stage 1 levels & breakout signals
  const confirmationTriggers = [...confirmations];
  if (breakout?.detected && breakout.level) {
    confirmationTriggers.push(`Price should maintain consecutive daily closes above breakout level at Rs. ${breakout.level}.`);
  }
  if (levels?.target1?.price) {
    confirmationTriggers.push(`Target 1 liquidity objective sits at Rs. ${levels.target1.price} on volume expansion.`);
  }

  const invalidationTriggers = [...warnings];
  if (levels?.stopLoss?.price) {
    invalidationTriggers.push(`A daily close beneath Stop-Loss at Rs. ${levels.stopLoss.price} invalidates the technical setup.`);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-200 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-sky-500/15 border border-sky-500/30 text-sky-400">
            <Compass size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              What Must Happen Next (Actionable Triggers)
            </h3>
            <p className="text-[11px] text-slate-400">
              Real-time validation and invalidation conditions to monitor before executing trades
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
        {/* Confirmations to watch */}
        <div className="rounded-xl bg-slate-900/60 border border-emerald-900/40 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-emerald-400">
            <CheckCircle2 size={14} /> Confirmations to Watch
          </div>
          <ul className="space-y-1.5 text-slate-300">
            {confirmationTriggers.slice(0, 4).map((c, i) => (
              <li key={i} className="flex items-start gap-2 leading-relaxed">
                <ArrowRight size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>{c}</span>
              </li>
            ))}
            {confirmationTriggers.length === 0 && (
              <li className="text-slate-500 italic">Wait for decisive volume expansion and EMA confirmation.</li>
            )}
          </ul>
        </div>

        {/* Invalidation Triggers */}
        <div className="rounded-xl bg-slate-900/60 border border-rose-900/40 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-rose-400">
            <ShieldAlert size={14} /> Invalidation & Exit Triggers
          </div>
          <ul className="space-y-1.5 text-slate-300">
            {invalidationTriggers.slice(0, 4).map((w, i) => (
              <li key={i} className="flex items-start gap-2 leading-relaxed">
                <span className="text-rose-400 font-bold shrink-0">✕</span>
                <span>{w}</span>
              </li>
            ))}
            {invalidationTriggers.length === 0 && (
              <li className="text-slate-500 italic">Breach of the lower entry boundary or sudden volume dump.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
