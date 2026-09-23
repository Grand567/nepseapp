import React from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, Info, Zap, Flame, Award, TrendingUp, BarChart2 } from 'lucide-react';

interface SetupScoreCardProps {
  score: number;
  verdict: string;
  confidence?: {
    level: string;
    sampleSize: number;
    averageSimilarity: number;
    outcomeConsistency: number;
  };
  setupType?: string;
  signalAgreement?: {
    bullishGroups: number;
    bearishGroups: number;
    neutralGroups: number;
    totalEvaluated: number;
    agreementPct: number;
  };
  dataQuality?: {
    overall: string;
    historyDays: number;
  };
  t2Risk?: {
    score: number;
    tier: string;
    worst2DayDropPct: number;
    t2DrawdownBufferPct: number;
    warning?: string | null;
    detail?: string;
  };
  quantMetrics?: {
    minerviniTemplate?: {
      passedCount: number;
      totalCount: number;
      isStage2Uptrend: boolean;
      stageLabel: string;
      distFrom52wLowPct?: number;
      distFrom52wHighPct?: number;
    };
    mansfieldRS?: {
      mrs: number;
      isOutperforming: boolean;
      isRising: boolean;
      status: string;
      label: string;
    };
    volumeDryUp?: {
      vduRatio: number;
      isDryUp: boolean;
      isPocketPivot: boolean;
      status: string;
      label: string;
    };
    brokerCornering?: {
      cr5BuyPct: number;
      isCornered: boolean;
      isInstitutionalDumping: boolean;
      tier: string;
      label: string;
    };
    expectancy?: {
      ev: number;
      profitFactor: number;
      breakEvenWinRate: number;
      hasPositiveEdge: boolean;
      edgeRating: string;
    };
    kelly?: {
      halfKellyPct: number;
      recommendationPct: number;
      isViable: boolean;
    };
    t2CircuitGuard?: {
      trapDangerScore: number;
      status: string;
      twoDayGain: number;
      isSafeToEnter: boolean;
    };
  };
  bullishFactors?: string[];
  bearishFactors?: string[];
  warnings?: string[];
  confirmations?: string[];
}

function getVerdictColor(score: number, verdict?: string) {
  const vUpper = (verdict || '').toUpperCase();
  // Hard gates — red
  if (vUpper.startsWith('NO TRADE') || vUpper.startsWith('REDUCE') || vUpper.startsWith('EXIT') || (vUpper.startsWith('AVOID') && !vUpper.startsWith('HOLD'))) {
    return { bg: 'rgba(239, 68, 68, 0.16)', border: 'rgba(239, 68, 68, 0.5)', text: '#f87171', badge: 'bg-rose-500/20 text-rose-300' };
  }
  // Soft-gate caution overrides — teal/amber hybrid (high score but a risk note)
  if (vUpper.startsWith('CAUTION')) {
    return { bg: 'rgba(20, 184, 166, 0.14)', border: 'rgba(20, 184, 166, 0.45)', text: '#2dd4bf', badge: 'bg-teal-500/20 text-teal-300' };
  }
  if (vUpper.includes('VERIFY CURRENT EARNINGS') || vUpper.includes('200-EMA OVERHEAD')) {
    return { bg: 'rgba(59, 130, 246, 0.14)', border: 'rgba(59, 130, 246, 0.45)', text: '#60a5fa', badge: 'bg-blue-500/20 text-blue-300' };
  }
  if (vUpper.includes('EXTREME VALUATION') || vUpper.includes('AVOID CHASING') || vUpper.startsWith('HOLD')) {
    return { bg: 'rgba(234, 179, 8, 0.16)', border: 'rgba(234, 179, 8, 0.5)', text: '#facc15', badge: 'bg-amber-500/20 text-amber-300' };
  }
  if (score >= 82 || vUpper.includes('VERY STRONG') || vUpper.includes('HIGH-CONVICTION')) return { bg: 'rgba(16, 185, 129, 0.16)', border: 'rgba(16, 185, 129, 0.5)', text: '#34d399', badge: 'bg-emerald-500/20 text-emerald-300' };
  if (score >= 70 || vUpper.includes('STRONG ENTRY') || vUpper.includes('COILED BASE')) return { bg: 'rgba(59, 130, 246, 0.16)', border: 'rgba(59, 130, 246, 0.5)', text: '#60a5fa', badge: 'bg-blue-500/20 text-blue-300' };
  if (score >= 58 || vUpper.includes('BUY') || vUpper.includes('ACCUMULATE')) return { bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.5)', text: '#38bdf8', badge: 'bg-sky-500/20 text-sky-300' };
  if (score >= 45) return { bg: 'rgba(234, 179, 8, 0.16)', border: 'rgba(234, 179, 8, 0.5)', text: '#facc15', badge: 'bg-amber-500/20 text-amber-300' };
  if (score >= 32) return { bg: 'rgba(249, 115, 22, 0.16)', border: 'rgba(249, 115, 22, 0.5)', text: '#fb923c', badge: 'bg-orange-500/20 text-orange-300' };
  return { bg: 'rgba(244, 63, 94, 0.16)', border: 'rgba(244, 63, 94, 0.5)', text: '#fb7185', badge: 'bg-rose-500/20 text-rose-300' };
}

export function SetupScoreCard({
  score = 50,
  verdict,
  confidence,
  setupType = 'neutral_setup',
  signalAgreement,
  dataQuality,
  t2Risk,
  bullishFactors = [],
  bearishFactors = [],
  warnings = [],
  confirmations = [],
  quantMetrics,
}: SetupScoreCardProps) {
  const theme = getVerdictColor(score, verdict);
  const confidenceLevel = confidence?.level || 'LOW';

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 border transition-all shadow-xl space-y-4"
      style={{ background: theme.bg, borderColor: theme.border }}
    >
      {/* ── Top Header Row ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Technical Setup Score
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${theme.badge}`}>
              {verdict?.toUpperCase().startsWith('NO TRADE')
                ? '🛑 NO TRADE / CAPITAL PRESERVATION'
                : (verdict?.toUpperCase().startsWith('REDUCE') || verdict?.toUpperCase().startsWith('EXIT') || (verdict?.toUpperCase().startsWith('AVOID') && !verdict?.toUpperCase().startsWith('HOLD')))
                ? '🛑 AVOID / DISTRIBUTION RISK'
                : verdict?.toUpperCase().startsWith('CAUTION')
                ? '⚡ HIGH SCORE — CAUTION FLAG ACTIVE'
                : (verdict?.toUpperCase().includes('VERIFY CURRENT EARNINGS') || verdict?.toUpperCase().includes('200-EMA OVERHEAD'))
                ? '📊 BUY / ACCUMULATE — MONITOR RISK NOTE'
                : (verdict?.toUpperCase().includes('EXTREME VALUATION') || verdict?.toUpperCase().includes('AVOID CHASING'))
                ? '🟡 VALUATION CAUTION (HOLD / DO NOT CHASE)'
                : verdict?.toUpperCase().startsWith('HOLD')
                ? '🟡 HOLD / WAIT FOR CONFIRMATION'
                : (score >= 58 || verdict?.toUpperCase().includes('BUY') || verdict?.toUpperCase().includes('ACCUMULATE'))
                ? '🟢 BULLISH SETUP'
                : score <= 38
                ? '🔴 BEARISH SETUP'
                : '🟡 NEUTRAL / WAIT'}
            </span>
            {t2Risk && (
              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${
                t2Risk.tier === 'LOW'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : t2Risk.tier === 'MODERATE'
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                  : t2Risk.tier === 'HIGH'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                T+2 Lockup: {t2Risk.tier} (±{t2Risk.t2DrawdownBufferPct}%)
              </span>
            )}
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ color: theme.text }}>
            {verdict}
          </div>

          {/* ── Contradiction notice: high score but a soft risk gate is active ── */}
          {score >= 78 && verdict && (
            verdict.toUpperCase().startsWith('CAUTION') ||
            verdict.toUpperCase().includes('VERIFY CURRENT EARNINGS') ||
            verdict.toUpperCase().includes('200-EMA OVERHEAD')
          ) && (
            <div
              className="mt-2 rounded-xl p-3 text-xs leading-relaxed border"
              style={{ background: 'rgba(20, 184, 166, 0.08)', borderColor: 'rgba(20, 184, 166, 0.3)', color: '#94a3b8' }}
            >
              <span style={{ color: '#2dd4bf', fontWeight: 700 }}>ℹ️ Why does a high score show a caution notice?</span>
              <br />
              This setup scores <strong style={{ color: '#fff' }}>{score}/100</strong> — a strong multi-factor signal. However, a <strong style={{ color: '#fbbf24' }}>secondary risk flag</strong> (e.g. borderline risk/reward ratio, proximity to T1 target, or potentially stale EPS data) is also active.
              <br /><br />
              The caution does <em>not</em> invalidate the setup. You may still enter at the entry zone and aim for <strong>Target 2 (T2)</strong> for full reward. Verify the flagged condition manually before committing full position size.
            </div>
          )}
        </div>


        {/* Large Score Metric */}
        <div className="flex items-baseline gap-2 sm:text-right">
          <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            {score}
          </span>
          <span className="text-slate-400 text-sm font-semibold">/ 100</span>
        </div>
      </div>

      {/* ── Metadata Grid (Confidence, Setup Type, Signal Agreement, Data Quality) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-2.5">
          <div className="text-[11px] text-slate-400 mb-0.5">Evidence Confidence</div>
          <div
            className={`font-bold uppercase ${
              confidenceLevel === 'HIGH'
                ? 'text-emerald-400'
                : confidenceLevel === 'MEDIUM'
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {confidenceLevel}
            {confidence?.sampleSize ? ` (${confidence.sampleSize} analogs)` : ''}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-2.5">
          <div className="text-[11px] text-slate-400 mb-0.5">Setup Structure</div>
          <div className="font-bold text-white capitalize">
            {setupType.replace(/_/g, ' ')}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-2.5">
          <div className="text-[11px] text-slate-400 mb-0.5">Signal Agreement</div>
          <div className="font-bold text-white">
            {signalAgreement ? `${signalAgreement.agreementPct}% (${signalAgreement.bullishGroups} Bull / ${signalAgreement.bearishGroups} Bear)` : 'Normal'}
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-2.5">
          <div className="text-[11px] text-slate-400 mb-0.5">Data Quality</div>
          <div className="font-bold text-emerald-400">
            {dataQuality?.overall || 'HIGH'} ({dataQuality?.historyDays || 0} bars)
          </div>
        </div>
      </div>

      {/* ── Institutional Quant & Edge Matrix ── */}
      {quantMetrics && (
        <div className="rounded-xl p-3 bg-slate-950/80 border border-blue-900/40 space-y-2.5 text-xs">
          <div className="flex items-center justify-between flex-wrap gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-blue-400">
              <Award size={13} /> Institutional Quant & Market Theory Edge
            </span>
            {quantMetrics.minerviniTemplate && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                quantMetrics.minerviniTemplate.isStage2Uptrend
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                Minervini SEPA: {quantMetrics.minerviniTemplate.passedCount}/8 ({quantMetrics.minerviniTemplate.stageLabel})
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Mathematical Expectancy (EV) */}
            <div className="rounded-lg bg-slate-900/60 p-2 border border-slate-800">
              <div className="text-[10.5px] text-slate-400">Math Expectancy (EV)</div>
              <div className={`font-bold mt-0.5 ${
                (quantMetrics.expectancy?.ev ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {(quantMetrics.expectancy?.ev ?? 0) > 0 ? '+' : ''}Rs. {quantMetrics.expectancy?.ev?.toLocaleString() ?? '—'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Profit Factor: {quantMetrics.expectancy?.profitFactor ?? '—'}x
              </div>
            </div>

            {/* Break-Even Win Rate vs Analog Edge */}
            <div className="rounded-lg bg-slate-900/60 p-2 border border-slate-800">
              <div className="text-[10.5px] text-slate-400">Statistical Edge (Δ)</div>
              {(() => {
                const empiricalWin = quantMetrics.expectancy?.pWin ?? (score >= 55 ? 55 : 40);
                const beWin = quantMetrics.expectancy?.breakEvenWinRate ?? 33;
                const delta = +(empiricalWin - beWin).toFixed(1);
                const hasPositiveEv = (quantMetrics.expectancy?.ev ?? 0) > 0;
                const isPositive = delta > 0 && hasPositiveEv;

                return (
                  <>
                    <div className={`font-bold mt-0.5 ${isPositive ? 'text-sky-400' : 'text-rose-400'}`}>
                      {delta > 0 ? `+${delta}%` : `${delta}%`}
                      {!isPositive && <span className="text-[9px] font-normal text-rose-400/80 ml-1">(No Edge)</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      B/E: {beWin}% • Win: {empiricalWin}%
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Volume Dry-Up (VDU) / Pocket Pivot */}
            <div className="rounded-lg bg-slate-900/60 p-2 border border-slate-800">
              <div className="text-[10.5px] text-slate-400">Volume & Supply Flow</div>
              <div className="font-bold text-amber-300 mt-0.5 truncate">
                {quantMetrics.volumeDryUp?.isPocketPivot
                  ? '🚀 Pocket Pivot'
                  : (quantMetrics.volumeDryUp?.isDryUp ? `💎 VDU ${quantMetrics.volumeDryUp.vduRatio}x` : 'Orderly Volume')}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                {quantMetrics.volumeDryUp?.isDryUp ? 'Supply Exhausted' : 'Normal Participation'}
              </div>
            </div>

            {/* Mansfield Relative Strength vs NEPSE */}
            <div className="rounded-lg bg-slate-900/60 p-2 border border-slate-800">
              <div className="text-[10.5px] text-slate-400">Mansfield RS vs NEPSE</div>
              <div className={`font-bold mt-0.5 truncate ${
                quantMetrics.mansfieldRS?.isOutperforming ? 'text-purple-300' : 'text-slate-400'
              }`}>
                {quantMetrics.mansfieldRS?.mrs != null
                  ? `${quantMetrics.mansfieldRS.mrs > 0 ? '+' : ''}${quantMetrics.mansfieldRS.mrs}% MRS`
                  : 'In-Line'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                {quantMetrics.mansfieldRS?.isOutperforming ? 'Outperforming NEPSE' : 'Consolidating'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Compact Explanation & Warnings ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
        {/* Bullish & Confirming evidence */}
        <div className="space-y-1.5">
          <div className="font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
            <CheckCircle2 size={13} /> Why this setup scores well
          </div>
          <ul className="space-y-1 text-slate-300">
            {(bullishFactors.length > 0 ? bullishFactors.slice(0, 3) : confirmations.slice(0, 2)).map((item, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>{item}</span>
              </li>
            ))}
            {bullishFactors.length === 0 && confirmations.length === 0 && (
              <li className="text-slate-500 italic">No significant bullish confirmation recorded.</li>
            )}
          </ul>
        </div>

        {/* Warnings & Headwinds */}
        <div className="space-y-1.5">
          <div className="font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
            <AlertTriangle size={13} /> Warnings & Resistance
          </div>
          <ul className="space-y-1 text-slate-300">
            {warnings.slice(0, 3).map((w, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-amber-400 font-bold">!</span>
                <span>{w}</span>
              </li>
            ))}
            {warnings.length === 0 && bearishFactors.slice(0, 2).map((b, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-rose-400 font-bold">!</span>
                <span>{b}</span>
              </li>
            ))}
            {warnings.length === 0 && bearishFactors.length === 0 && (
              <li className="text-slate-500 italic">No critical structural warning detected.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
