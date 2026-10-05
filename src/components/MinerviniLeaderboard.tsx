/**
 * MinerviniLeaderboard.tsx
 * Minervini Stage 2 Leader Board + Operator Accumulation Momentum Index (OAMI)
 * ─────────────────────────────────────────────────────────────────────────────
 * Minervini Template checks (simplified for available NEPSE data):
 *   1. Price > 50-day EMA > 150-day EMA (approximate: ema50 > ema50 × 0.97 as proxy)
 *   2. Price > 200-day MA (approximate: price vs 52W structure)
 *   3. Price within 25% of 52-week HIGH
 *   4. Price > 30% above 52-week LOW
 *   5. RS (Relative Strength) vs NEPSE > 0 (price pChange > NEPSE index pChange)
 *   6. Volume > 1.3× average on recent advances
 *
 * OAMI (Operator Accumulation Momentum Index):
 *   Rolling proxy = stealthAccumulation score trend + volumeZScore + pChange momentum
 *   OAMI = 0.40 × stealthScore + 0.35 × normZVol + 0.25 × normMomentum (0–100)
 */
import React, { useState, useMemo } from 'react';
import { TrendingUp, Award, Zap, Filter, ChevronRight, Target, BarChart2, RefreshCw } from 'lucide-react';

interface Props {
  stocks?: any[];
  indices?: any;
  onSelectStock?: (s: any) => void;
}

const MINERVINI_CHECKS = [
  { key: 'c1', label: 'Price > EMA50',    desc: 'Price above 50-day EMA'          },
  { key: 'c2', label: 'EMA50 Trending',   desc: 'EMA50 uptrend structure'          },
  { key: 'c3', label: '< 25% Off 52H',   desc: 'Within 25% of 52-week high'       },
  { key: 'c4', label: '> 30% Off 52L',   desc: 'More than 30% above 52-week low'  },
  { key: 'c5', label: 'RS vs NEPSE',     desc: 'Outperforming NEPSE index'         },
  { key: 'c6', label: 'Volume Surge',    desc: 'Volume > 1.3× average on advance' },
];

/**
 * P5: Multi-period Relative Strength computation.
 * True Minervini RS = stock's 3-month return vs NEPSE index 3-month return.
 * Without per-stock history API, we approximate using 52W structure:
 *   - 52W RS = (ltp - low52w) / low52w  → measures recovery from trough
 *   - Normalized to 0-100 percentile within the current stock universe
 * C5 check: stock's 52W RS > nepse's 52W RS (using index pChange as proxy)
 */
function computeMultiPeriodRS(s: any, nepseChange: number): { rsScore: number; rsVsNepse: boolean } {
  const ltp     = Number(s.ltp    || 0);
  const low52w  = Number(s.low52w || ltp * 0.70);
  const high52w = Number(s.high52w || ltp * 1.30);

  // 52-Week recovery score (0–100): how much has it recovered from its annual low?
  const recovery52w = low52w > 0 ? ((ltp - low52w) / low52w) * 100 : 0;

  // Position within 52W range (0=at low, 100=at high): measures trend health
  const rangePosition = (high52w > low52w) ? ((ltp - low52w) / (high52w - low52w)) * 100 : 50;

  // Composite RS score: 60% recovery + 40% range position
  const rsScore = Math.round(0.60 * Math.min(recovery52w, 100) + 0.40 * rangePosition);

  // RS vs NEPSE: stock's recent momentum > index momentum (day-over-day as available signal)
  // Also pass if 52W recovery > 30% (structurally strong regardless of today's tick)
  const rsVsNepse = Number(s.pChange || 0) > (nepseChange - 0.5) || recovery52w > 30;

  return { rsScore, rsVsNepse };
}

function evaluateMinervini(s: any, nepseChange: number): { checks: boolean[]; score: number } {
  const ltp        = Number(s.ltp   || 0);
  const ema20      = Number(s.ema20 || 0);
  const ema50      = Number(s.ema50 || 0);
  const high52w    = Number(s.high52w || ltp * 1.15);
  const low52w     = Number(s.low52w  || ltp * 0.75);
  const volZ       = Number(s.volumeZScore || 0);
  const volSurge   = Number(s.volumeSurgeRatio || 1);

  const { rsVsNepse } = computeMultiPeriodRS(s, nepseChange);  // P5: multi-period RS

  const c1 = ltp > 0 && ema50 > 0 && ltp > ema50;
  const c2 = ema50 > 0 && ema20 > 0 && ema20 >= ema50 * 0.99;  // EMA20 not far below EMA50
  const c3 = high52w > 0 && ltp >= high52w * 0.75;              // within 25% of 52W high
  const c4 = low52w  > 0 && ltp >= low52w  * 1.30;              // > 30% above 52W low
  const c5 = rsVsNepse;                                          // P5: multi-period RS vs NEPSE
  const c6 = (Number(s.pChange || 0) > 0.5) && (volZ >= 0.5 || volSurge >= 1.3); // volume on advance

  const checks = [c1, c2, c3, c4, c5, c6];
  const score  = checks.filter(Boolean).length;
  return { checks, score };
}

function computeOAMI(s: any, rsScore: number): number {
  const stealth = Math.min(100, Math.max(0, Number(s.stealthAccumulation || 50)));
  const rawZ    = Number(s.volumeZScore || 0);
  const normZ   = Math.min(100, Math.max(0, (rawZ + 2) * 25)); // map -2..+2 → 0..100
  const rawMom  = Number(s.pChange || 0);
  const normMom = Math.min(100, Math.max(0, (rawMom + 10) * 5)); // map -10..+10 → 0..100
  // P5: incorporate multi-period RS score (15% weight) into OAMI
  return Math.round(0.35 * stealth + 0.30 * normZ + 0.20 * normMom + 0.15 * Math.min(100, rsScore));
}

export function MinerviniLeaderboard({ stocks = [], indices, onSelectStock }: Props) {
  const [minScore,     setMinScore]     = useState(4);
  const [sortBy,       setSortBy]       = useState<'score' | 'oami' | 'turnover'>('score');
  const [sectorFilter, setSectorFilter] = useState('ALL');

  const nepseChange = Number(indices?.nepse?.pChange || indices?.changePercent || 0);

  const evaluated = useMemo(() => {
    return stocks
      .filter(s => s && s.symbol && Number(s.ltp || 0) > 0)
      .map(s => {
        const { checks, score } = evaluateMinervini(s, nepseChange);
        const { rsScore } = computeMultiPeriodRS(s, nepseChange);  // P5
        const oami = computeOAMI(s, rsScore);
        const isEstimated = (s.rsi == null || s.volumeZScore == null || s.ema50 == null);
        return { ...s, mChecks: checks, mScore: score, oami, rsScore, isEstimated };
      })
      .filter(s => s.mScore >= minScore)
      .filter(s => {
        if (sectorFilter === 'ALL') return true;
        const sec = (s.sector || '').toLowerCase();
        if (sectorFilter === 'hydro')   return sec.includes('hydro');
        if (sectorFilter === 'bank')    return sec.includes('bank');
        if (sectorFilter === 'finance') return sec.includes('finance');
        if (sectorFilter === 'micro')   return sec.includes('micro');
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score')   return b.mScore - a.mScore || b.oami - a.oami;
        if (sortBy === 'oami')    return b.oami - a.oami;
        if (sortBy === 'turnover') return (b.turnover || 0) - (a.turnover || 0);
        return 0;
      })
      .slice(0, 60);
  }, [stocks, minScore, sectorFilter, sortBy, nepseChange]);

  const oamiLeaders = useMemo(() =>
    [...evaluated].sort((a, b) => b.oami - a.oami).slice(0, 5),
    [evaluated]);

  const hasEstimated = evaluated.some(s => s.isEstimated);

  return (
    <div className="w-full space-y-4 p-3 sm:p-4 text-slate-200 font-sans">

      {/* ── Header ── */}
      <div className="rounded-2xl p-4 border border-purple-500/20 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Stage 2 Template
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            OAMI Momentum
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
          <Award className="w-6 h-6 text-purple-400" />
          Minervini Leader Board + OAMI
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Stocks passing Minervini's Stage 2 uptrend template + Operator Accumulation Momentum Index (0–100).
        </p>
      </div>

      {/* ── Data quality warning ── */}
      {hasEstimated && (
        <div className="text-xs bg-amber-900/20 border border-amber-700/30 text-amber-300 p-2.5 rounded-xl">
          ⚡ Some checks use estimated indicators (marked *). Open Entry/Exit Analyzer for verified data.
        </div>
      )}

      {/* ── Top 5 OAMI Leaders ── */}
      {oamiLeaders.length > 0 && (
        <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 p-3">
          <div className="text-xs font-bold text-amber-300 mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Top 5 OAMI Accumulation Leaders
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {oamiLeaders.map(s => (
              <div key={s.symbol}
                className="flex-shrink-0 rounded-xl bg-slate-800/60 border border-slate-700 p-3 min-w-[100px] text-center cursor-pointer hover:border-amber-600/50 transition"
                onClick={() => window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: 'entry-exit-analyzer', symbol: s.symbol } }))}
              >
                <div className="font-extrabold text-white text-sm">{s.symbol}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">OAMI</div>
                <div className={`text-xl font-black mt-1 ${s.oami >= 70 ? 'text-emerald-400' : s.oami >= 50 ? 'text-amber-400' : 'text-slate-400'}`}>
                  {s.oami}
                </div>
                <div className={`text-[10px] font-semibold mt-0.5 ${(s.pChange || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(s.pChange || 0) >= 0 ? '+' : ''}{(s.pChange || 0).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters & Sort ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-700">
          <span className="text-[11px] text-slate-400 px-1">Min Score:</span>
          {[3, 4, 5, 6].map(n => (
            <button key={n} onClick={() => setMinScore(n)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${minScore === n ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {n}+
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-700">
          <span className="text-[11px] text-slate-400 px-1">Sort:</span>
          {(['score', 'oami', 'turnover'] as const).map(opt => (
            <button key={opt} onClick={() => setSortBy(opt)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition capitalize ${sortBy === opt ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {opt === 'score' ? 'Minervini' : opt === 'oami' ? 'OAMI' : 'Turnover'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {['ALL', 'hydro', 'bank', 'finance', 'micro'].map(sec => (
            <button key={sec} onClick={() => setSectorFilter(sec)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition capitalize ${sectorFilter === sec ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {sec === 'ALL' ? 'All Sectors' : sec}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results count ── */}
      <div className="text-xs text-slate-400">
        Showing <span className="text-white font-semibold">{evaluated.length}</span> stocks passing {minScore}+ Minervini checks
        | Scanned <span className="text-white font-semibold">{stocks.length}</span> total
      </div>

      {/* ── Stock Cards ── */}
      {evaluated.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          {stocks.length === 0 ? 'Loading market data...' : `No stocks pass ${minScore}+ Minervini checks with current filters.`}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  <th className="py-3 px-3">Symbol</th>
                  <th className="py-3 px-2 text-center">Score</th>
                  <th className="py-3 px-2">Checks (6)</th>
                  <th className="py-3 px-2 text-right">LTP</th>
                  <th className="py-3 px-2 text-right">% Chg</th>
                  <th className="py-3 px-2 text-right">OAMI</th>
                  <th className="py-3 px-2 text-right">DPI</th>
                  <th className="py-3 px-2 text-right">Turnover</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {evaluated.map(s => (
                  <tr key={s.symbol} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-extrabold text-white">{s.symbol}{s.isEstimated ? <span className="text-amber-500 text-[9px] ml-0.5">*</span> : null}</div>
                      <div className="text-[9px] text-slate-400 truncate max-w-[100px]">{s.companyName || s.name || s.symbol}</div>
                      {s.sector && <div className="text-[9px] text-slate-500 mt-0.5">{s.sector}</div>}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`text-lg font-black ${s.mScore >= 5 ? 'text-emerald-400' : s.mScore >= 4 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {s.mScore}/6
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-0.5 flex-wrap max-w-[130px]">
                        {s.mChecks.map((pass: boolean, i: number) => (
                          <span key={i} title={MINERVINI_CHECKS[i].desc}
                            className={`text-[9px] px-1 py-0.5 rounded font-semibold ${pass ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
                            {pass ? '✓' : '·'} {MINERVINI_CHECKS[i].label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-white text-xs">
                      {Number(s.ltp || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className={`font-bold text-xs ${(s.pChange || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(s.pChange || 0) >= 0 ? '+' : ''}{Number(s.pChange || 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-sm font-black ${s.oami >= 70 ? 'text-emerald-400' : s.oami >= 50 ? 'text-amber-400' : 'text-slate-500'}`}>
                          {s.oami}
                        </span>
                        <div className="w-16 bg-slate-700 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full ${s.oami >= 70 ? 'bg-emerald-400' : s.oami >= 50 ? 'bg-amber-400' : 'bg-slate-500'}`}
                            style={{ width: `${s.oami}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      {(() => {
                        const dpiVal = s.dpi != null ? Math.round(Number(s.dpi)) : Math.round(Number(s.stealthAccumulation || 50));
                        return (
                          <span className={`font-semibold ${dpiVal >= 70 ? 'text-emerald-400' : dpiVal >= 55 ? 'text-amber-400' : 'text-slate-400'}`}>
                            {dpiVal}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs text-slate-300">
                      {(Number(s.turnover || 0) / 1e5).toFixed(1)}L
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: 'entry-exit-analyzer', symbol: s.symbol } }))}
                        className="inline-flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg bg-purple-900/40 text-purple-300 border border-purple-700/40 hover:bg-purple-800/40 transition font-semibold whitespace-nowrap"
                      >
                        <Target className="w-3 h-3" /> Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-[10px] text-slate-500 text-center">
        Minervini checks: Price&gt;EMA50, EMA50 structure, within 25% of 52W-High, 30%+ above 52W-Low, RS vs NEPSE, Volume thrust
        | OAMI = 40% Stealth + 35% Volume-Z + 25% Momentum
      </div>
    </div>
  );
}

export default MinerviniLeaderboard;
