import React from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, Info, Zap, Flame } from 'lucide-react';

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
  bullishFactors?: string[];
  bearishFactors?: string[];
  warnings?: string[];
  confirmations?: string[];
}

function getVerdictColor(score: number, verdict?: string) {
  if (verdict && verdict.toUpperCase().startsWith('NO TRADE')) {
    return { bg: 'rgba(239, 68, 68, 0.16)', border: 'rgba(239, 68, 68, 0.5)', text: '#f87171', badge: 'bg-rose-500/20 text-rose-300' };
  }
  if (score >= 85) return { bg: 'rgba(16, 185, 129, 0.16)', border: 'rgba(16, 185, 129, 0.5)', text: '#34d399', badge: 'bg-emerald-500/20 text-emerald-300' };
  if (score >= 70) return { bg: 'rgba(59, 130, 246, 0.16)', border: 'rgba(59, 130, 246, 0.5)', text: '#60a5fa', badge: 'bg-blue-500/20 text-blue-300' };
  if (score >= 58) return { bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.5)', text: '#38bdf8', badge: 'bg-sky-500/20 text-sky-300' };
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
  bullishFactors = [],
  bearishFactors = [],
  warnings = [],
  confirmations = [],
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
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Technical Setup Score
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${theme.badge}`}>
              {verdict?.toUpperCase().startsWith('NO TRADE')
                ? '🛑 NO TRADE / CAPITAL PRESERVATION'
                : score >= 70
                ? '🟢 BULLISH SETUP'
                : score <= 38
                ? '🔴 BEARISH SETUP'
                : '🟡 NEUTRAL / WAIT'}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ color: theme.text }}>
            {verdict}
          </div>
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

      {/* ── Compact Explanation & Warnings ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
        {/* Bullish & Confirming evidence */}
        <div className="space-y-1.5">
          <div className="font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
            <CheckCircle2 size={13} /> Why this setup scores well
          </div>
          <ul className="space-y-1 text-slate-300">
            {confirmations.slice(0, 3).map((c, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>{c}</span>
              </li>
            ))}
            {confirmations.length === 0 && bullishFactors.slice(0, 2).map((b, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>{b}</span>
              </li>
            ))}
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
