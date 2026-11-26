import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Target, RefreshCw, AlertTriangle, TrendingUp, Lock } from 'lucide-react';
import { fetchFromBackend } from '../../utils/liveData';
import { PracticalPlaybookStrip } from './DualTierSniperCard';

interface FlowchartV3Candidate {
  symbol: string;
  companyName?: string;
  sector?: string;
  mode?: string;
  modeBadge?: string;
  score: number;
  ltp: number;
  pChange: number;
  turnover: number;
  eps: number;
  vwap15D: number;
  vwapGap15Pct: number;
  grossTop3Ret15D: number;
  minTop2GrossRet15D: number;
  bcrSpread5D: number;
  vdu: number;
  rsi14: number;
  clvPct: number;
  leadHolders?: string;
  entryLow: number;
  entryHigh: number;
  chaseCap: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
}

interface DualTierCandidate {
  symbol: string;
  companyName?: string;
  sector?: string;
  tier: 'TIER_1_SNIPER' | 'TIER_2_BALANCED';
  tierBadge: string;
  backtestWinRatePct: number;
  profitFactor: number;
  score: number;
  ltp: number;
  pChange: number;
  eps: number;
  spread10: number;
  rvolToday: number;
  bcr3Buy10D: number;
  bcr3Sell10D: number;
  netRetention10D: number;
  grossTop3Ret15D: number;
  minTop2GrossRet15D: number;
  smcNarrative?: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
}

interface FlowchartV3PanelProps {
  onSelectSymbol?: ((symbol: string) => void) | null;
  onSelectStock?: ((stock: any) => void) | null;
}

/**
 * Shared 6-Gate Flowchart v3.0 Floor-Turn & Dual-Tier Unbiased Break & Retest Screener Panel.
 * Fetches exclusively from /api/radar/flowchart-v3 (zero direct DB access in UI).
 */
export function FlowchartV3Panel({ onSelectSymbol = null, onSelectStock = null }: FlowchartV3PanelProps) {
  const [maxPrice, setMaxPrice] = useState<number>(500);
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    asOfDate?: string | null;
    totalScanned?: number;
    qualifiedCount?: number;
    candidates?: FlowchartV3Candidate[];
    vetoed?: Array<{ symbol: string; vetoCode: string; reason: string }>;
    dualTier?: {
      asOfDate?: string | null;
      marketRegime?: string;
      breadthPct?: number;
      nepseClose?: number;
      nepseEma20?: number;
      tier1Sniper?: DualTierCandidate[];
      tier2Balanced?: DualTierCandidate[];
      candidates?: DualTierCandidate[];
    };
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reqSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCandidates = async (priceCap: number, refresh = false) => {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = `/api/radar/flowchart-v3?maxPrice=${priceCap}${refresh ? '&refresh=true' : ''}`;
      let res = await fetchFromBackend(qs, 25000);
      if ((!res || res.success === false) && mountedRef.current && seq === reqSeqRef.current && !refresh) {
        await new Promise((r) => setTimeout(r, 900));
        if (!mountedRef.current || seq !== reqSeqRef.current) return;
        res = await fetchFromBackend(qs, 25000);
      }
      if (!mountedRef.current || seq !== reqSeqRef.current) return;
      if (res && res.success) {
        setData(res);
      } else {
        setData(null);
        setErrorMsg(res?.error || 'Unable to load Flowchart v3.0 candidates');
      }
    } catch (err: any) {
      if (!mountedRef.current || seq !== reqSeqRef.current) return;
      setErrorMsg(err?.message || 'Unable to load Flowchart v3.0 radar');
    } finally {
      if (mountedRef.current && seq === reqSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCandidates(maxPrice, false);
    }, 80);
    return () => clearTimeout(timer);
  }, [maxPrice]);

  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const vetoed = Array.isArray(data?.vetoed) ? data.vetoed : [];
  const dualTier = data?.dualTier;
  const dualTierCandidates = Array.isArray(dualTier?.candidates) ? dualTier.candidates : [];

  const handleOpen = (c: FlowchartV3Candidate | DualTierCandidate) => {
    if (onSelectStock) onSelectStock(c);
    if (onSelectSymbol) onSelectSymbol(c.symbol);
  };

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-emerald-950/25 p-4 sm:p-5 shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300 border border-emerald-500/30">
              <Target size={11} /> Flowchart v3.0 • 7–10D Engine
            </span>
            <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-500/25">
              Watchlist Radar (44.4%–45.9% 1Y WR) • Verify via /analyze
            </span>
            {data?.asOfDate && (
              <span className="text-[10px] font-mono text-slate-400">Session: {data.asOfDate}</span>
            )}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white">
            High-Probability 7–10 Day Floor-Turn Shortlist ({candidates.length})
          </h2>
          <p className="text-[11px] text-slate-400">
            Walk-forward calibrated gates: 15D Gross Buyer Retention ≥ 38%, 15D Hoarder VWAP Proximity [-4.5%..+3.8%], RSI [35..65], EPS &gt; 0, VDU Dry-Up &amp; Lock-In Cliff Veto.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/60 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMaxPrice(500)}
              className={`rounded-lg px-2.5 py-1 font-bold transition ${
                maxPrice === 500 ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              &lt; Rs. 500
            </button>
            <button
              type="button"
              onClick={() => setMaxPrice(0)}
              className={`rounded-lg px-2.5 py-1 font-bold transition ${
                maxPrice === 0 ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Prices
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadCandidates(maxPrice, true)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Scan</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">
          Running 6-Gate 15D Gross-Mover &amp; Lock-In Expiry audit across NEPSE ledger…
        </div>
      ) : errorMsg ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0 text-amber-400" />
          <span>{errorMsg}</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Dual-Tier Unbiased Break & Retest Engine (Tier-1 Sniper 87.5% WR / Combined Dual-Tier 75.0% WR) */}
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-200 border border-indigo-400/30">
                  <ShieldCheck size={11} /> Dual-Tier Unbiased Engine
                </span>
                <span className="text-[11px] font-semibold text-indigo-100">
                  Tier-1 Sniper (87.5% WR • 6.68x PF) &amp; Combined Dual-Tier (75.0% WR • 4.71x PF)
                </span>
              </div>
              {dualTier?.marketRegime && (
                <span className="rounded bg-slate-950/80 border border-slate-700 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                  Regime: {dualTier.marketRegime} • Breadth {Number.isFinite(Number(dualTier.breadthPct)) ? `${dualTier.breadthPct}%` : '—'}
                </span>
              )}
            </div>

            {dualTierCandidates.length === 0 ? (
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400">
                Capital Preservation Active — Zero settled NEPSE scrips satisfy strict Break &amp; Retest + 15D Gross Retention &ge; 50% gates on this session. Below list is Flowchart v3.0 Watchlist Only (~44.4%–45.9% WR).
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {dualTierCandidates.slice(0, 6).map((dc) => (
                  <button
                    type="button"
                    key={dc.symbol}
                    onClick={() => handleOpen(dc)}
                    className="text-left rounded-xl border border-indigo-500/35 bg-slate-950/85 p-3 hover:border-indigo-400 transition-all space-y-2 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm font-black text-white">{dc.symbol}</span>
                          <span className="rounded bg-indigo-500/25 px-1.5 py-0.5 text-[10px] font-bold text-indigo-200">
                            {dc.tier === 'TIER_1_SNIPER' ? 'Sniper 87.5%' : 'Dual-Tier 75.0%'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[190px]">{dc.sector} • EPS {dc.eps}</div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-white">Rs. {Number.isFinite(Number(dc.ltp)) ? Number(dc.ltp) : '—'}</div>
                        <div className={`text-[10px] font-semibold ${(dc.pChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {(dc.pChange ?? 0) >= 0 ? '+' : ''}{Number(dc.pChange ?? 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                      <div className="rounded bg-slate-900 p-1 border border-slate-800">
                        <span className="text-slate-500 block">15D Gross</span>
                        <strong className="text-emerald-300">{dc.grossTop3Ret15D}%</strong>
                      </div>
                      <div className="rounded bg-slate-900 p-1 border border-slate-800">
                        <span className="text-slate-500 block">10D Ret</span>
                        <strong className="text-indigo-200">{dc.netRetention10D}%</strong>
                      </div>
                      <div className="rounded bg-slate-900 p-1 border border-slate-800">
                        <span className="text-slate-500 block">RVOL</span>
                        <strong className="text-slate-200">{dc.rvolToday}x</strong>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-800/80 grid grid-cols-2 gap-x-2 text-[10px] font-mono">
                      <span className="text-slate-400">Buy: <strong className="text-white">{dc.entryLow}–{dc.entryHigh}</strong></span>
                      <span className="text-slate-400">SL/T1: <strong className="text-rose-400">{dc.stopLoss}</strong>/<strong className="text-emerald-400">{dc.target1}</strong></span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {candidates.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-center text-xs text-slate-400">
              Zero scrips cleared all 6 Flowchart v3.0 gates {maxPrice === 500 ? 'under Rs. 500 ' : ''}today — Capital Preservation active.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {candidates.slice(0, 6).map((c) => (
                <button
                  type="button"
                  key={c.symbol}
                  onClick={() => handleOpen(c)}
                  className="text-left rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-white">{c.symbol}</span>
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                          {c.score}/100
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{c.sector} • EPS {c.eps}</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-sm font-bold text-white">Rs. {Number.isFinite(Number(c.ltp)) ? Number(c.ltp) : '—'}</div>
                      {(() => {
                        const pChg = Number(c.pChange ?? 0);
                        const safeChg = Number.isFinite(pChg) ? pChg : 0;
                        return (
                          <div className={`text-[10px] font-semibold ${safeChg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {safeChg >= 0 ? '+' : ''}{safeChg.toFixed(2)}%
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="text-[10px] font-bold text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded-md px-2 py-1 inline-flex items-center gap-1">
                    <TrendingUp size={11} /> {c.modeBadge || '🎯 v3.0 Setup'}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                    <div className="rounded bg-slate-900 p-1.5 border border-slate-800">
                      <span className="text-slate-500 block">15D Gross Ret</span>
                      <strong className="text-emerald-300">{c.grossTop3Ret15D}%</strong>
                    </div>
                    <div className="rounded bg-slate-900 p-1.5 border border-slate-800">
                      <span className="text-slate-500 block">VWAP Gap</span>
                      <strong className="text-slate-200">{c.vwapGap15Pct >= 0 ? '+' : ''}{c.vwapGap15Pct}%</strong>
                    </div>
                    <div className="rounded bg-slate-900 p-1.5 border border-slate-800">
                      <span className="text-slate-500 block">RSI / VDU</span>
                      <strong className="text-slate-200">{c.rsi14} / {c.vdu}x</strong>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono">
                    <span className="text-slate-400">Buy: <strong className="text-white">{c.entryLow}–{c.entryHigh}</strong></span>
                    <span className="text-slate-400">SL: <strong className="text-rose-400">{c.stopLoss}</strong></span>
                    <span className="text-slate-400">T1/T2: <strong className="text-emerald-400">{c.target1}/{c.target2}</strong></span>
                    <span className="text-slate-400">R:R: <strong className="text-emerald-300">{c.riskRewardRatio}:1</strong></span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {vetoed.length > 0 && (
        <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1 font-bold text-rose-300">
            <Lock size={11} /> Anti-Wash &amp; Lock-In Vetoed ({vetoed.length}):
          </span>
          {vetoed.slice(0, 6).map((v) => (
            <span key={v.symbol} className="rounded bg-rose-950/40 border border-rose-900/50 px-1.5 py-0.5 text-rose-300 font-mono" title={v.reason}>
              {v.symbol}
            </span>
          ))}
        </div>
      )}
      <PracticalPlaybookStrip />
    </div>
  );
}

export default FlowchartV3Panel;
