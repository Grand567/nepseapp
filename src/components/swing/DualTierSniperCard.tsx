import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Crosshair, RefreshCw, AlertTriangle, ArrowUpRight, CheckCircle2, Compass } from 'lucide-react';
import { fetchFromBackend } from '../../utils/liveData';

interface DualTierSniperCandidate {
  symbol: string;
  companyName?: string;
  sector?: string;
  tier: 'TIER_1_SNIPER' | 'TIER_2_BALANCED';
  tierBadge?: string;
  backtestWinRatePct?: number;
  profitFactor?: number;
  score: number;
  ltp: number;
  pChange: number;
  eps?: number;
  spread10?: number;
  rvolToday?: number;
  bcr3Buy10D?: number;
  bcr3Sell10D?: number;
  netRetention10D?: number;
  grossTop3Ret15D?: number;
  entryLow: number;
  entryHigh: number;
  chaseCap?: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio?: number;
}

interface DualTierApiResponse {
  success?: boolean;
  asOfDate?: string;
  marketRegime?: string;
  nepseClose?: number;
  nepseEma20?: number;
  breadthPct?: number;
  candidates?: DualTierSniperCandidate[];
  tier1Sniper?: DualTierSniperCandidate[];
  tier2Balanced?: DualTierSniperCandidate[];
  error?: string;
}

interface DualTierSniperCardProps {
  onSelectStock?: (candidate: DualTierSniperCandidate) => void;
  onOpenScreener?: () => void;
}

function fmtNum(val: unknown, digits = 1, fallback = '—'): string {
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
}

/**
 * Compact Practical 4-Step Execution Checklist shared across Dashboard and Swing Screener.
 */
export function PracticalPlaybookStrip() {
  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-950/75 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-300">
      <span className="inline-flex items-center gap-1 font-bold text-indigo-300">
        <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
        4-Step Execution Rule:
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span><strong>1.</strong> Intraday B58 = Early Warning (~36% WR)</span>
        <span><strong>2.</strong> Wait for 3:15 PM EOD <code>/sniper</code></span>
        <span><strong>3.</strong> Verify Regime &amp; clean <code>/analyze</code></span>
        <span><strong>4.</strong> Size Tier-1 (87.5%) / Dual-Tier (75.0%) w/ hard SL</span>
      </div>
    </div>
  );
}

/**
 * Surfaces the live Dual-Tier Unbiased Break & Retest Sniper radar (87.5% Tier-1 / 75.0% Combined WR),
 * NEPSE regime context, Cash Preservation state, and Practical 4-Step Execution Checklist on Dashboard.
 */
export default function DualTierSniperCard({ onSelectStock, onOpenScreener }: DualTierSniperCardProps) {
  const [data, setData] = useState<DualTierApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mountedRef = useRef<boolean>(true);
  const reqSeqRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadRadar = async (refresh = false) => {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = `/api/radar/dual-tier?maxPrice=650&limit=6${refresh ? '&refresh=true' : ''}`;
      let res: DualTierApiResponse | null = await fetchFromBackend(qs, 25000);
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
        setErrorMsg(res?.error || 'Dual-Tier Sniper scanner warming up');
      }
    } catch (err: any) {
      if (!mountedRef.current || seq !== reqSeqRef.current) return;
      setErrorMsg(err?.message || 'Unable to reach Dual-Tier Sniper endpoint');
    } finally {
      if (mountedRef.current && seq === reqSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRadar(false);
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const tier1Count = Array.isArray(data?.tier1Sniper) ? data.tier1Sniper.length : candidates.filter(c => c.tier === 'TIER_1_SNIPER').length;
  const tier2Count = Array.isArray(data?.tier2Balanced) ? data.tier2Balanced.length : candidates.filter(c => c.tier === 'TIER_2_BALANCED').length;
  const regime = data?.marketRegime || 'NEUTRAL';
  const regimeTone =
    regime === 'BULL'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : regime === 'CHOP'
        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

  return (
    <section
      aria-label="Dual-Tier Unbiased Sniper Execution Desk"
      className="rounded-2xl border border-indigo-500/35 bg-gradient-to-br from-slate-950/95 via-slate-900/95 to-indigo-950/35 p-4 mb-3 shadow-lg space-y-3"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-200 border border-indigo-400/35">
              <Crosshair size={11} /> EOD Dual-Tier Sniper Desk
            </span>
            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
              Tier-1: 87.5% WR (6.68x PF)
            </span>
            <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300 border border-cyan-500/30">
              Combined Dual-Tier: 75.0% WR (4.71x PF)
            </span>
          </div>
          <h3 className="text-sm font-extrabold text-white flex flex-wrap items-center gap-2">
            <span>High-Probability Execution Channel (/sniper)</span>
            {data?.asOfDate && (
              <span className="text-[11px] font-mono font-normal text-slate-400">Session {data.asOfDate}</span>
            )}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data?.marketRegime && (
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-mono font-bold ${regimeTone}`}>
              <Compass size={12} />
              Regime: {regime}
              {Number.isFinite(Number(data.nepseClose)) && Number.isFinite(Number(data.nepseEma20)) && (
                <span>({fmtNum(data.nepseClose, 1)} / EMA20 {fmtNum(data.nepseEma20, 1)})</span>
              )}
              {Number.isFinite(Number(data.breadthPct)) && <span>• Breadth {data.breadthPct}%</span>}
            </span>
          )}
          <button
            type="button"
            onClick={() => loadRadar(true)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            <span>Scan</span>
          </button>
        </div>
      </div>

      {/* Candidate List or Cash Preservation */}
      {loading ? (
        <div className="py-4 text-center text-xs text-slate-400">
          Auditing settled Break &amp; Retest + 15D Gross-Mover setups across NEPSE...
        </div>
      ) : errorMsg ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400 shrink-0" />
            {errorMsg}
          </span>
          {onOpenScreener && (
            <button
              type="button"
              onClick={onOpenScreener}
              className="rounded-lg border border-amber-400/35 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25 cursor-pointer shrink-0"
            >
              Open Flowchart v3.0
            </button>
          )}
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/75 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-extrabold text-amber-300">
              <ShieldCheck size={15} className="text-amber-400 shrink-0" />
              <span>Cash Preservation Active — 0 Tier-1/2 Sniper Buys Today (Tier-1: {tier1Count}, Tier-2: {tier2Count})</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              No settled NEPSE scrip cleared all unbiased Break &amp; Retest + 15D Gross-Mover gates. Hold cash rather than chasing low-WR (~35.8%–45.9%) intraday spikes or watchlist names.
            </p>
          </div>
          {onOpenScreener && (
            <button
              type="button"
              onClick={onOpenScreener}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-3 py-1.5 text-[11px] font-bold text-indigo-200 hover:bg-indigo-500/30 transition shrink-0 cursor-pointer"
            >
              <span>Flowchart v3.0 Watchlist</span>
              <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {candidates.slice(0, 6).map((c) => {
            const isT1 = c.tier === 'TIER_1_SNIPER';
            return (
              <button
                type="button"
                key={c.symbol}
                onClick={() => onSelectStock?.(c)}
                className="text-left rounded-xl border border-indigo-500/40 bg-slate-950/90 p-3 hover:border-emerald-400/60 transition-all space-y-2 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-sm font-black text-white">{c.symbol}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                          isT1
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
                            : 'bg-indigo-500/20 text-indigo-200 border-indigo-400/35'
                        }`}
                      >
                        {isT1 ? 'Tier-1 Sniper • 87.5% WR' : 'Tier-2 Balanced • 75.0%'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {c.sector || 'Equities'}{Number.isFinite(Number(c.eps)) ? ` • EPS ${fmtNum(c.eps, 1)}` : ''}
                    </div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <div className="text-sm font-bold text-white">Rs. {fmtNum(c.ltp, 1)}</div>
                    <div className={`text-[10px] font-semibold ${Number(c.pChange || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {Number(c.pChange || 0) >= 0 ? '+' : ''}{fmtNum(c.pChange, 2)}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                  <div className="rounded bg-slate-900 p-1 border border-slate-800">
                    <span className="text-slate-500 block">15D Gross</span>
                    <strong className="text-emerald-300">{fmtNum(c.grossTop3Ret15D, 1)}%</strong>
                  </div>
                  <div className="rounded bg-slate-900 p-1 border border-slate-800">
                    <span className="text-slate-500 block">10D Ret</span>
                    <strong className="text-indigo-200">{fmtNum(c.netRetention10D, 0)}%</strong>
                  </div>
                  <div className="rounded bg-slate-900 p-1 border border-slate-800">
                    <span className="text-slate-500 block">RVOL</span>
                    <strong className="text-slate-200">{fmtNum(c.rvolToday, 2)}x</strong>
                  </div>
                </div>

                <div className="pt-1.5 border-t border-slate-800/80 grid grid-cols-2 gap-x-2 text-[10px] font-mono">
                  <span className="text-slate-400">
                    Buy: <strong className="text-white">{fmtNum(c.entryLow, 1)}–{fmtNum(c.entryHigh, 1)}</strong>
                  </span>
                  <span className="text-slate-400">
                    SL/T1: <strong className="text-rose-400">{fmtNum(c.stopLoss, 1)}</strong>/<strong className="text-emerald-400">{fmtNum(c.target1, 1)}</strong>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 4-Step Practical Playbook Strip */}
      <PracticalPlaybookStrip />
    </section>
  );
}
