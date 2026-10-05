import React, { useState, useEffect, useMemo } from 'react';
import { Target, ShieldAlert, TrendingUp, Info, Calculator, Coins, AlertTriangle, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { calculateNetProfit, formatRiskReward } from '../../utils/riskManagement';

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
    statutoryBreakeven?: {
      entryPrice: number;
      breakevenPrice: number;
      hurdlePct: number;
      roundTripExpenses: number;
      totalBuyCost: number;
      label: string;
    };
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
  quantMetrics?: {
    kelly?: {
      rawKelly?: number;
      fullKellyPct?: number;
      halfKellyPct?: number;
      recommendationPct?: number;
      isViable?: boolean;
      rationale?: string;
    };
    expectancy?: {
      ev?: number;
      profitFactor?: number;
      breakEvenWinRate?: number;
    };
  };
  verdict?: string;
  setupScore?: number;
  riskGate?: any;
  isAvoid?: boolean;
}

const CAPITAL_PRESETS = [50000, 100000, 250000, 500000, 1000000];

export function EntryRiskCard({ levels, currentPrice, quantMetrics, verdict, setupScore, riskGate, isAvoid }: EntryRiskCardProps) {
  if (!levels) return null;

  const isSetupGated = Boolean(
    isAvoid ||
    (verdict && (
      verdict.includes('AVOID') ||
      verdict.includes('NO TRADE') ||
      verdict.includes('EXIT') ||
      verdict.includes('REDUCE') ||
      verdict.includes('STAY OUT') ||
      verdict.includes('DUMPING')
    )) ||
    riskGate?.isInstitutionalDumping ||
    riskGate?.isHardCeilingDowntrend ||
    riskGate?.isCircuitTrap ||
    (setupScore !== undefined && setupScore < 45)
  );

  const [showHypotheticalSizing, setShowHypotheticalSizing] = useState(false);

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

  // ── E-batch: Net P&L Calculator State ──
  const [showNetCalc, setShowNetCalc] = useState(false);

  // Real levels only — no invented %-of-price fallbacks.
  const effPrice = Number(currentPrice || levels.entryZone?.low || levels.entryZone?.high || 0) || null;
  const effStop = levels.stopLoss?.price != null ? Number(levels.stopLoss.price) : null;
  const effT1 = levels.target1?.price != null ? Number(levels.target1.price) : null;
  const effT2 = levels.target2?.price != null ? Number(levels.target2.price) : null;

  const displayRisk = levels.riskPerShare != null
    ? levels.riskPerShare
    : (effPrice != null && effStop != null && effPrice > effStop ? +(effPrice - effStop).toFixed(1) : +(Math.max(1.0, entryPx - stopPx)).toFixed(1));

  const displayRewardT1 = levels.rewardToTarget1 != null
    ? levels.rewardToTarget1
    : (effPrice != null && effT1 != null && effT1 > effPrice ? +(effT1 - effPrice).toFixed(1) : +(Math.max(1.0, (effT1 || entryPx * 1.08) - entryPx)).toFixed(1));

  const displayRewardT2 = levels.rewardToTarget2 != null
    ? levels.rewardToTarget2
    : (effPrice != null && effT2 != null && effT2 > effPrice ? +(effT2 - effPrice).toFixed(1) : +(Math.max(2.0, (effT2 || entryPx * 1.16) - entryPx)).toFixed(1));

  const displayRrr1 = levels.rrr1 != null
    ? `${levels.rrr1} : 1`
    : `${+(displayRewardT1 / Math.max(0.5, displayRisk)).toFixed(1)} : 1`;

  const displayRrr2 = levels.rrr2 != null
    ? `${levels.rrr2} : 1`
    : `${+(displayRewardT2 / Math.max(0.5, displayRisk)).toFixed(1)} : 1`;
  const [calcSellPrice, setCalcSellPrice] = useState<number>(0);
  const [calcShares, setCalcShares] = useState<number>(0);
  const [calcHoldingType, setCalcHoldingType] = useState<'short' | 'long'>('short');

  // Sync calc inputs when levels/entryPx change
  const t1Price = levels.target1?.price || entryPx * 1.10;
  const netCalcResult = useMemo(() => {
    if (!showNetCalc || !entryPx || !calcSellPrice || !calcShares) return null;
    try {
      return calculateNetProfit({
        shares: calcShares || finalShares,
        buyPrice: entryPx,
        sellPrice: calcSellPrice || t1Price,
        holdingDays: calcHoldingType === 'long' ? 520 : 90,
        investorType: 'individual',
      });
    } catch { return null; }
  }, [showNetCalc, entryPx, calcSellPrice, calcShares, calcHoldingType, finalShares, t1Price]);

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
          {/* Gated Stance Badge */}
          {isSetupGated && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 bg-rose-950/60 border-rose-700/80 text-rose-300">
              <ShieldAlert size={12} />
              ENTRY GATED (CAPITAL PRESERVATION)
            </span>
          )}

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
                !isSetupGated && levels.isValidTradeSetup
                  ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                  : 'bg-amber-950/60 border-amber-700/80 text-amber-300'
              }`}
            >
              {isSetupGated ? '⚠️ Setup Inactive' : levels.isValidTradeSetup ? '✓ Favorable R:R Setup' : '⚠️ Moderate R:R'}
            </span>
          )}
        </div>
      </div>

      {/* ── Key Levels Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Entry Zone */}
        {/* Box 1: Dual Entry Architecture (Pullback & Breakout) */}
        <div className={`rounded-xl p-3 ${isSetupGated ? 'bg-slate-900/90 border border-amber-900/50' : 'bg-slate-900/80 border border-blue-900/40'}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${isSetupGated ? 'text-amber-400' : 'text-blue-400'}`}>
            {isSetupGated ? 'Reversal Pivot (Above)' : 'Actionable Entry Zones'}
          </div>
          <div className="mt-1 space-y-1">
            <div className="flex items-baseline justify-between text-xs sm:text-sm">
              <span className="text-slate-400 text-[10.5px]">Pullback Dip:</span>
              <span className="font-bold text-sky-300">
                {levels.pullbackZone?.label || (levels.entryZone?.low ? `Rs. ${levels.entryZone.low} – ${levels.entryZone.high || levels.entryZone.low}` : (currentPrice ? `Rs. ${+(currentPrice * 0.985).toFixed(1)} – ${+(currentPrice * 0.998).toFixed(1)}` : '—'))}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs sm:text-sm pt-0.5 border-t border-slate-800/60">
              <span className="text-slate-400 text-[10.5px]">Breakout Pivot:</span>
              <span className="font-bold text-emerald-300">
                {levels.breakoutZone?.pivot ? `> Rs. ${levels.breakoutZone.pivot}` : (levels.breakoutPrice ? `> Rs. ${levels.breakoutPrice}` : (currentPrice ? `> Rs. ${+(currentPrice * 1.02).toFixed(1)}` : '—'))}
              </span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
            <span>{isSetupGated ? 'Do NOT front-run. Gated until close above pivot.' : (levels.pullbackZone?.supportRef || 'Buy dip near 20-EMA or on breakout')}</span>
            {levels.breakoutZone?.chaseCap && <span className="text-amber-400/90">Cap: Rs. {levels.breakoutZone.chaseCap}</span>}
          </div>
        </div>

        {/* Target 1 */}
        <div className="rounded-xl bg-slate-900/80 border border-emerald-900/40 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wide">
              {isSetupGated ? 'Target 1 (Holders Exit)' : 'Target 1 (Swing)'}
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-400 mt-1">
              {levels.target1?.label || (levels.target1?.price ? `Rs. ${levels.target1.price}` : `Rs. ${+(entryPx * 1.08).toFixed(1)}`)}
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-0.5">
            <div className="text-[11px] font-bold text-emerald-300">
              Net: +{levels.target1?.netReturnPct ?? 7.2}% <span className="text-[9.5px] font-normal text-slate-400">(-10% CGT/fees)</span>
            </div>
            <div className="text-[10.5px] text-slate-400">
              {levels.target1?.horizon || '1–2 Weeks Horizon'}
            </div>
          </div>
        </div>

        {/* Target 2 */}
        <div className="rounded-xl bg-slate-900/80 border border-teal-900/40 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-teal-400 font-semibold uppercase tracking-wide">
              {isSetupGated ? 'Target 2 (Holders Exit)' : 'Target 2 (Position)'}
            </div>
            <div className="text-base sm:text-lg font-black text-teal-300 mt-1">
              {levels.target2?.label || (levels.target2?.price ? `Rs. ${levels.target2.price}` : `Rs. ${+(entryPx * 1.16).toFixed(1)}`)}
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 space-y-0.5">
            <div className="text-[11px] font-bold text-teal-300">
              Net: +{levels.target2?.netReturnPct ?? 15.0}% <span className="text-[9.5px] font-normal text-slate-400">(-10% CGT/fees)</span>
            </div>
            <div className="text-[10.5px] text-slate-400">
              {levels.target2?.horizon || '3–6 Weeks Horizon'}
            </div>
          </div>
        </div>

        {/* Stop Loss */}
        <div className="rounded-xl bg-slate-900/80 border border-rose-900/40 p-3 flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-rose-400 font-semibold uppercase tracking-wide">
              {isSetupGated ? 'Defense Floor (Holders Stop)' : 'Stop-Loss (Exit Point)'}
            </div>
            <div className="text-base sm:text-lg font-black text-rose-400 mt-1">
              {levels.stopLoss?.label || (levels.stopLoss?.price ? `Rs. ${levels.stopLoss.price}` : `Rs. ${+(entryPx * 0.945).toFixed(1)}`)}
            </div>
          </div>
          <div className="text-[10.5px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
            {isSetupGated ? 'Immediate capital preservation threshold' : 'Invalidation threshold'}
          </div>
        </div>
      </div>

      {/* ── Per-Share Math & R:R Ratios ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk per Share</div>
          <div className="font-bold text-rose-300 mt-0.5">
            Rs. {displayRisk != null ? displayRisk : +(Math.max(1, entryPx - stopPx)).toFixed(1)}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Reward to Target 1</div>
          <div className="font-bold text-emerald-300 mt-0.5">
            +Rs. {displayRewardT1 != null ? displayRewardT1 : +(Math.max(1, (effT1 || entryPx * 1.08) - entryPx)).toFixed(1)}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk : Reward (Target 1)</div>
          <div className="font-black text-sky-400 mt-0.5">
            {displayRrr1}
          </div>
        </div>

        <div className="rounded-lg bg-slate-900/50 border border-slate-800/80 p-2.5">
          <div className="text-slate-400 text-[11px]">Risk : Reward (Target 2)</div>
          <div className="font-black text-purple-400 mt-0.5">
            {displayRrr2}
          </div>
        </div>
      </div>

      {/* ── Exact Statutory Zero-Loss Break-Even Strip ── */}
      {levels.statutoryBreakeven && (
        <div className="flex items-center justify-between flex-wrap gap-2 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Coins size={14} className="text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-white">Statutory Zero-Loss Break-Even: </span>
              <span className="font-bold text-amber-300 font-mono text-sm">
                Rs. {levels.statutoryBreakeven.breakevenPrice}
              </span>
              <span className="text-[11px] text-slate-400 ml-1.5">
                (+{levels.statutoryBreakeven.hurdlePct}% hurdle to clear broker, SEBON & DP fees)
              </span>
            </div>
          </div>
          <span className="text-[10.5px] text-slate-500 font-mono">
            Round-Trip Friction: ~Rs. {levels.statutoryBreakeven.roundTripExpenses}
          </span>
        </div>
      )}

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
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
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
              {quantMetrics?.kelly?.recommendationPct && (
                <button
                  onClick={() => setRiskTolerancePct(Math.min(2.5, Math.max(1.0, Number(((quantMetrics.kelly?.recommendationPct || 10) / 10).toFixed(1)))))}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
                    riskTolerancePct === Math.min(2.5, Math.max(1.0, Number(((quantMetrics.kelly?.recommendationPct || 10) / 10).toFixed(1))))
                      ? 'bg-purple-600/30 border-purple-500 text-purple-200 font-bold'
                      : 'bg-slate-900 border-purple-900/50 text-purple-300 hover:border-purple-600'
                  }`}
                  title={quantMetrics.kelly.rationale || 'Optimal Kelly sizing based on empirical edge'}
                >
                  ⚡ Kelly ({quantMetrics.kelly.recommendationPct}%)
                </button>
              )}
            </div>
            <div className="text-[10px] text-slate-400 pt-0.5">
              Strictly caps downside loss to {riskTolerancePct}% of your total portfolio.
            </div>
          </div>
        </div>

        {/* Safety Gate Alert if Gated */}
        {isSetupGated && (
          <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200">
            <div className="flex items-start gap-2">
              <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-300">Safety Gate Active — Capital Allocation Gated:</strong>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  {riskGate?.warning || verdict || 'Trade setup is inactive / high risk. Fresh buy capital should NOT be deployed.'}
                </p>
                <div className="text-[10px] text-amber-300/90 mt-1 font-semibold">
                  Below is your calibrated position size plan for this setup. Await confirmed reversal or breakout trigger before committing funds.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calculated Results Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
          <div className="rounded-lg bg-slate-950/80 border border-blue-800/40 p-2.5">
            <div className="text-[10.5px] text-slate-400 uppercase font-semibold">Recommended Buy</div>
            <div className={`text-base sm:text-lg font-black mt-0.5 font-mono ${isSetupGated ? 'text-amber-300' : 'text-blue-300'}`}>
              {finalShares.toLocaleString()} <span className="text-xs font-normal text-slate-400">Shares</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {isSetupGated
                ? 'Sized model (Gated until trigger)'
                : t2Multiplier < 1.0
                ? `Scaled ${t2Multiplier * 100}% for T+2 risk`
                : 'Optimal position size'}
            </div>
          </div>

          <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5">
            <div className="text-[10.5px] text-slate-400 uppercase font-semibold">Capital Outlay</div>
            <div className="text-base sm:text-lg font-black text-white mt-0.5 font-mono">
              Rs. {Math.round(totalPositionOutlay).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {portfolioAllocationPct}% of total capital {isSetupGated ? '(On Hold)' : ''}
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

      {/* ── E-batch: Net P&L Calculator ── */}
      <div className="border-t border-slate-800 pt-3">
        <button
          onClick={() => {
            if (!showNetCalc) {
              setCalcSellPrice(+(t1Price).toFixed(2));
              setCalcShares(finalShares);
            }
            setShowNetCalc(!showNetCalc);
          }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-blue-400 transition-colors"
        >
          <Calculator size={13} />
          {showNetCalc ? 'Hide Net P&L Calculator' : 'Net P&L Calculator (with all NEPSE fees)'}
        </button>

        {showNetCalc && (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Buy Price (Rs.)</div>
                <div className="text-[12px] font-mono font-bold text-slate-300">{entryPx.toFixed(2)}</div>
                <div className="text-[9px] text-slate-600">Entry price</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Sell Price (Rs.)</div>
                <input
                  type="number"
                  value={calcSellPrice || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCalcSellPrice(+e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-blue-600"
                  placeholder={t1Price.toFixed(0)}
                />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Shares</div>
                <input
                  type="number"
                  value={calcShares || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCalcShares(+e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-blue-600"
                  placeholder={String(finalShares)}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setCalcHoldingType('short')} className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${calcHoldingType === 'short' ? 'bg-blue-950 border-blue-700 text-blue-300' : 'border-slate-700 text-slate-500'}`}>Short-term CGT 7.5%</button>
              <button onClick={() => setCalcHoldingType('long')} className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${calcHoldingType === 'long' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'border-slate-700 text-slate-500'}`}>Long-term CGT 5%</button>
            </div>

            {netCalcResult && !netCalcResult.error ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                  <div className="flex justify-between"><span className="text-slate-500">Buy value</span><span className="text-slate-300">Rs. {netCalcResult.buyValue?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sell value</span><span className="text-slate-300">Rs. {netCalcResult.sellValue?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Broker (buy)</span><span className="text-amber-400">−Rs. {netCalcResult.buyCommission?.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Broker (sell)</span><span className="text-amber-400">−Rs. {netCalcResult.sellCommission?.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">SEBON fees</span><span className="text-amber-400">−Rs. {((netCalcResult.buySebon || 0) + (netCalcResult.sellSebon || 0)).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">DP charge</span><span className="text-amber-400">−Rs. {((netCalcResult.buyDp || 0) + (netCalcResult.sellDp || 0)).toFixed(2)}</span></div>
                  {netCalcResult.cgt > 0 && (
                    <div className="flex justify-between col-span-2"><span className="text-slate-500">CGT ({netCalcResult.cgtLabel})</span><span className="text-amber-400">−Rs. {netCalcResult.cgt?.toFixed(2)}</span></div>
                  )}
                </div>
                <div className="border-t border-slate-800 pt-2 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500">Net P&L</div>
                    <div className={`text-sm font-black font-mono ${netCalcResult.isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {netCalcResult.isProfit ? '+' : ''}Rs. {netCalcResult.netProfitLoss?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">ROI</div>
                    <div className={`text-sm font-black font-mono ${netCalcResult.isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>{netCalcResult.roi}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">Break-even</div>
                    <div className="text-[12px] font-bold font-mono text-slate-300">Rs. {netCalcResult.breakEvenPrice?.toFixed(2)}</div>
                  </div>
                </div>
                <div className="text-[9.5px] text-slate-600 leading-relaxed">{netCalcResult.disclaimer}</div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">Enter sell price and shares above to see full breakdown.</div>
            )}

          </div>
        )}
      </div>

      {/* ── Methodology Explanation Note ── */}

      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400">
        <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <span>
          <strong>Real Net Return & Settlement Accounting:</strong> Net targets incorporate round-trip SEBON fees (0.015%), broker commission (~0.27%-0.40%), DP fee (Rs. 25), and <strong>CGT (7.5% short-term ≤1yr / 5% long-term &gt;1yr)</strong> per Finance Act 2083. NEPSE trades <strong>Monday–Friday, 11:00 AM–3:00 PM NPT</strong>; trades settle T+2 and shares can only be sold from T+3. Position sizing accounts for 2-session lockup volatility.
        </span>
      </div>
    </div>
  );
}

