import React from 'react';
import { Layers, Shield, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface LevelItem {
  price: number;
  strength: number;
  distancePct?: number;
  touches?: number;
  sources?: string[];
}

interface SupportResistancePanelProps {
  support?: LevelItem[];
  resistance?: LevelItem[];
  currentPrice?: number;
}

export function SupportResistancePanel({
  support = [],
  resistance = [],
  currentPrice,
}: SupportResistancePanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-200 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Layers size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Support & Resistance Confluence
            </h3>
            <p className="text-[11px] text-slate-400">
              Clustered swing pivots, Fibonacci levels, 52-week boundaries, and daily pivots
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* ── Support Column (Demand Zones) ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <Shield size={13} /> Support / Demand Zones
          </div>

          <div className="space-y-1.5">
            {support.length > 0 ? (
              support.slice(0, 3).map((lvl, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                    idx === 0
                      ? 'bg-emerald-950/40 border-emerald-700/60 shadow-sm'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-black text-sm text-white">
                      Rs. {lvl.price}
                      {idx === 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                          Nearest
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Strength: <strong className="text-emerald-300">{lvl.strength}/100</strong>
                      {lvl.touches ? ` · ${lvl.touches} touches` : ''}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-0.5">
                      <ArrowDownRight size={13} />
                      {lvl.distancePct != null ? `${lvl.distancePct}%` : 'Below LTP'}
                    </span>
                    <div className="text-[10px] text-slate-500">from current price</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-500 italic">
                No immediate historical support cluster within proximity.
              </div>
            )}
          </div>
        </div>

        {/* ── Resistance Column (Supply Zones) ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-400">
            <Shield size={13} /> Resistance / Supply Zones
          </div>

          <div className="space-y-1.5">
            {resistance.length > 0 ? (
              resistance.slice(0, 3).map((lvl, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition ${
                    idx === 0
                      ? 'bg-rose-950/40 border-rose-700/60 shadow-sm'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-black text-sm text-white">
                      Rs. {lvl.price}
                      {idx === 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">
                          Nearest
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Strength: <strong className="text-rose-300">{lvl.strength}/100</strong>
                      {lvl.touches ? ` · ${lvl.touches} touches` : ''}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-rose-400 flex items-center justify-end gap-0.5">
                      <ArrowUpRight size={13} />
                      {lvl.distancePct != null ? `+${lvl.distancePct}%` : 'Above LTP'}
                    </span>
                    <div className="text-[10px] text-slate-500">from current price</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-500 italic">
                No immediate overhead resistance barrier identified.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
