import React, { useState, useEffect } from 'react';
import { Target, ShieldAlert, TrendingUp, Info, Calculator, Coins, AlertTriangle, CheckCircle2, Lock, ArrowRight } from 'lucide-react';

interface EntryRiskCardProps {
  levels: {
    entryZone?: { low: number; high: number; label: string };
    stopLoss?: { price: number; pct: number; label: string };
    target1?: { price: number; pct: number; horizon?: string; label: string; netReturnPct?: number; netGainPerShare?: number; grossUpsidePct?: number; capped?: boolean };
    target2?: { price: number; pct: number; horizon?: string; label: string; netReturnPct?: number; netGainPerShare?: number; grossUpsidePct?: number; capped?: boolean };
    riskPerShare?: number;
    rewardToTarget1?: number;
    rewardToTarget2?: number;
    rrr1?: number;
    rrr2?: number;
    feeFrictionPct?: number;
    cgtTaxRatePct?: number;
    isValidTradeSetup?: boolean;
    t2Risk?: {
      score: number;
      tier: string;
      worst2DayDropPct: number;
      t2DrawdownBufferPct: number;
      circuitDropsCount: number;
      isIlliquid: boolean;
      holdingSessions: number;
      recommendedPositionMultiplier: number;
      warning: string | null;
      detail: string;
    };
    recommendedPositionMultiplier?: number;
  };
  currentPrice?: number;
}

const CAPITAL_PRESETS = [50000, 100000, 250000, 500000, 1000000];

export function EntryRiskCard({ levels, currentPrice }: EntryRiskCardProps) {
  if (!levels) return null;

  // ── User-Configured Position Sizing State (Persisted in localStorage) ──
  const [portfolioCapital, setPortfolioCapital] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('entry_exit_portfolio_capital');
      if (saved) {
        const parsed = Number(saved);
        if (parsed >= 10000) return parsed;
      }
    } catch (_) {}
    return 100000;
  });

  const [riskTolerancePct, setRiskTolerancePct] = useState<number>(1.5); // 1.0%, 1.5%, 2.0%

  const handleCapitalChange = (val: number) => {
    const safeVal = Math.max(5000, Math.min(100000000, val));
    setPortfolioCapital(safeVal);
    try {
      localStorage.setItem('entry_exit_portfolio_capital', String(safeVal));
    } catch (_) {}
  };

  // ── Derived Position Sizing Calculations ──
  const entryPx = currentPrice || levels.entryZone?.low || 100;
  const stopPx = levels.stopLoss?.price || entryPx * 0.94;
  const rawRiskPerShare = Math.max(0.5, levels.riskPerShare || (entryPx - stopPx));
  const maxCapitalAtRisk = portfolioCapital * (riskTolerancePct / 100);

  // Raw shares allowed by the risk-per-share formula
  const rawQuantity = Math.floor(maxCapitalAtRisk / rawRiskPerShare);

  // Maximum single-stock allocation cap (25% of total portfolio)
  const maxAllocationShares = Math.floor((portfolioCapital * 0.25) / entryPx);
  const baseShares = Math.max(10, Math.min(rawQuantity, maxAllocationShares));

  // Scale by T+2 lockup risk multiplier (e.g. 0.50x if illiquid or volatile)
  const t2Multiplier = levels.t2Risk?.recommendedPositionMultiplier ?? levels.recommendedPositionMultiplier ?? 1.0;
  const finalShares = Math.max(10, Math.floor(baseShares * t2Multiplier));

  const totalPositionOutlay = finalShares * entryPx;
  const portfolioAllocationPct = portfolioCapital > 0 ? +((totalPositionOutlay / portfolioCapital) * 100).toFixed(1) : 0;
  const actualRiskRupees = Math.round(finalShares * rawRiskPerShare);
  const actualRiskPctOfCapital = portfolioCapital > 0 ? +((actualRiskRupees / portfolioCapital) * 100).toFixed(2) : 0;

  // Expected Net Return in Rupees at Target 1
  const t1NetGainPerShare = levels.target1?.netGainPerShare || (levels.target1?.price ? levels.target1.price - entryPx : entryPx * 0.08);
  const target1NetGainRupees = Math.round(finalShares * t1NetGainPerShare);

  const t2Risk = levels.t2Risk;

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#090d16] p-4 sm:p-5 text-slate-100 shadow-xl space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <Target size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Entry, Stop & Position Sizing Plan
            </h3>
            <p className="text-[11px] text-slate-400">
              Risk-reward aligned with nearby support, T+2 settlement lockup & overhead resistance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* T+2 Lockup Risk Badge */}
          {t2Risk && (
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                t2Risk.tier === 'LOW'
                  ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                  : t2Risk.tier === 'MODERATE'
                  ? 'bg-sky-950/60 border-sky-700/80 text-sky-300'
                  : t2Risk.tier === 'HIGH'
                  ? 'bg-amber-950/60 border-amber-700/80 text-amber-300'
                  : 'bg-rose-950/60 border-rose-700/80 text-rose-300'
              }`}
              title={t2Risk.detail}
            >
              <Lock size={12} />
              T+2 Lockup: {t2Risk.tier} (±{t2Risk.t2DrawdownBufferPct}%)
            </span>
          )}

          {levels.isValidTradeSetup !== undefined && (
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                levels.isValidTradeSetup
                  ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-700/80 text-amber-300'
              }`}
            >
              {levels.isValidTradeSetup ? '✓ Favorable R:R Setup' : '⚠️ Moderate R:R'}
            </span>
          )}
        </div>
      </div>

      {/* ── Key Levels Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Entry Zone */}
        <div className="rounded-xl bg-slate-900/80 border border-blue-900/40 p-3">
          <div className="text-[11px] text-blue-400 font-semibold uppercase tracking-wide">
            {levels.entryZone?.low && currentPrice && levels.entryZone.low > currentPrice * 1.015
              ? 'Breakout Zone (Above Pivot)'
              : 'Suggested Entry Zone'}
          </div>
          <div className="text-base sm:text-lg font-black text-white mt-1">
            {levels.entryZone?.label || '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {levels.entryZone?.low && currentPrice && levels.entryZone.low > currentPrice * 1.015
              ? `Requires breakout above Rs. ${levels.entryZone.low}`
              : 'Optimal accumulation range'}
          </div>
        </div>

        {/* Target 1 */}
        <div className="rounded-xl bg-slate-900/80 border border-emerald-900/40 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wide">
              Target 1 (Swing)
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-400 mt-1">
              {levels.target1?.label || '—'}
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-0.5">
            {levels.target1?.netReturnPct != null ? (
              <div className="text-[11px] font-bold text-emerald-300">
                Net: +{levels.target1.netReturnPct}% <span className="text-[9.5px] font-normal text-slate-400">(-10% CGT/fees)</span>
              </div>
            ) : null}
            <div className="text-[10.5px] text-slate-400">
              {levels.target1?.horizon || '1–2 Weeks Horizon'}
            </div>
          </div>
        </div>

        {/* Target 2 */}
        <div className="rounded-xl bg-slate-900/80 border border-teal-900/40 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-teal-400 font-semibold uppercase tracking-wide">
              Target 2 (Position)
            </div>
            <div className="text-base sm:text-lg font-black text-teal-300 mt-1">
              {levels.target2?.label || '—'}
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-0.5">
            {levels.target2?.netReturnPct != null ? (
              <div className="text-[11px] font-bold text-teal-300">
                Net: +{levels.target2.netReturnPct}% <span className="text-[9.5px] font-normal text-slate-400">(-10% CGT/fees)</span>
              </div>
            ) : null}
            <div className="text-[10.5px] text-slate-400">
              {levels.target2?.horizon || '3–6 Weeks Horizon'}
            </div>
          </div>
        </div>

        {/* Stop Loss */}
        <div className="rounded-xl bg-slate-900/80 border border-rose-900/40 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-rose-400 font-semibold uppercase tracking-wide">
              Stop-Loss (Exit Point)
            </div>
            <div className="text-base sm:text-lg font-black text-rose-400 mt-1">
              {levels.stopLoss?.label || '—'}
            </div>
          </div>
          <div className="text-[10.5px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
            Invalidation threshold
          </div>
        </div>
      </div>

      {/* ── Per-Share Math & R:R Ratios ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk per Share</div>
          <div className="font-bold text-rose-300 mt-0.5">
            Rs. {levels.riskPerShare ?? '—'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Reward to Target 1</div>
          <div className="font-bold text-emerald-300 mt-0.5">
            +Rs. {levels.rewardToTarget1 ?? '—'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk : Reward (Target 1)</div>
          <div className="font-black text-sky-400 mt-0.5">
            {levels.rrr1 != null ? `${levels.rrr1} : 1` : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk : Reward (Target 2)</div>
          <div className="font-black text-purple-400 mt-0.5">
            {levels.rrr2 != null ? `${levels.rrr2} : 1` : '—'}
          </div>
        </div>
      </div>

      {/* ── INTERACTIVE 1%–2% POSITION SIZING & CAPITAL ALLOCATION CALCULATOR ── */}
      <div className="rounded-xl border border-blue-900/50 bg-gradient-to-br from-blue-950/20 via-slate-900/60 to-slate-900/90 p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-300 uppercase tracking-wider">
            <Calculator size={14} />
            <span>Position Sizing Calculator (1% – 2% Risk Model)</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Never risk more than your predefined loss threshold
          </span>
        </div>

        {/* Inputs row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/70">
          {/* Portfolio Capital Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
              <span>Your Portfolio Size (NPR)</span>
              <span className="text-blue-400 font-mono">Rs. {portfolioCapital.toLocaleString()}</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="5000"
                step="5000"
                value={portfolioCapital}
                onChange={(e) => handleCapitalChange(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            {/* Quick Presets */}
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              {CAPITAL_PRESETS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleCapitalChange(amt)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-all font-mono ${
                    portfolioCapital === amt
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400'
                  }`}
                >
                  {amt >= 100000 ? `${amt / 100000}L` : `${amt / 1000}k`}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Tolerance Toggle */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
              <span>Risk Tolerance Per Trade</span>
              <span className="text-rose-400 font-mono font-bold">Max Loss: Rs. {Math.round(maxCapitalAtRisk).toLocaleString()}</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: '1.0% Safe', val: 1.0 },
                { label: '1.5% Normal', val: 1.5 },
                { label: '2.0% Aggressive', val: 2.0 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setRiskTolerancePct(opt.val)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
                    riskTolerancePct === opt.val
                      ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-400 pt-0.5">
              Strictly caps downside loss to {riskTolerancePct}% of your total portfolio.
            </div>
          </div>
        </div>

        {/* Calculated Results Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
          <div className="rounded-lg bg-slate-950/80 border border-blue-800/40 p-2.5">
            <div className="text-[10.5px] text-slate-400 uppercase font-semibold">Recommended Buy</div>
            <div className="text-base sm:text-lg font-black text-blue-300 mt-0.5 font-mono">
              {finalShares.toLocaleString()} <span className="text-xs font-normal text-slate-400">Shares</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {t2Multiplier < 1.0 ? `Scaled ${t2Multiplier * 100}% for T+2 risk` : 'Optimal position size'}
            </div>
          </div>

          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5">
            <div className="text-[10.5px] text-slate-400 uppercase font-semibold">Capital Outlay</div>
            <div className="text-base sm:text-lg font-black text-white mt-0.5 font-mono">
              Rs. {Math.round(totalPositionOutlay).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {portfolioAllocationPct}% of total capital
            </div>
          </div>

          <div className="rounded-lg bg-slate-950/80 border border-rose-950/80 p-2.5">
            <div className="text-[10.5px] text-rose-400 uppercase font-semibold">Max Downside Loss</div>
            <div className="text-base sm:text-lg font-black text-rose-400 mt-0.5 font-mono">
              -Rs. {actualRiskRupees.toLocaleString()}
            </div>
            <div className="text-[10px] text-rose-400/80 mt-0.5">
              At stop: -{actualRiskPctOfCapital}% of portfolio
            </div>
          </div>

          <div className="rounded-lg bg-slate-950/80 border border-emerald-950/80 p-2.5">
            <div className="text-[10.5px] text-emerald-400 uppercase font-semibold">Target 1 Net Profit</div>
            <div className="text-base sm:text-lg font-black text-emerald-400 mt-0.5 font-mono">
              +Rs. {target1NetGainRupees.toLocaleString()}
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5">
              Net of 10% CGT & broker fees
            </div>
          </div>
        </div>

        {/* T+2 Lockup Notification if high risk */}
        {t2Risk && t2Risk.warning && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <span>{t2Risk.warning}</span>
          </div>
        )}
      </div>

      {/* ── Methodology Explanation Note ── */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400">
        <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <span>
          <strong>Real Net Return & Settlement Accounting:</strong> Net targets incorporate round-trip SEBON fees (0.015%), broker commission (~0.27%-0.40%), DP fee (Rs. 25), and <strong>10% Final CGT</strong> (Finance Act 2083 for holding &lt; 1 yr). In NEPSE, trades settle on <strong>T+2</strong> and can only be sold on <strong>T+3</strong>; position sizing automatically factors in 2-session volatility to prevent catastrophic lockup drawdowns.
        </span>
      </div>
    </div>
  );
}

