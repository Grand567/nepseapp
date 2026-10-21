// src/components/CapitalRiskSimulatorView.jsx
import React, { useState, useEffect } from 'react';
import { 
  Sliders, Shield, Coins, PieChart, Layers, RefreshCw, 
  CheckCircle2, ArrowRight, Zap, Info, TrendingUp, AlertTriangle,
  Target, BarChart3, Calculator, Wallet, ArrowUpRight
} from 'lucide-react';
import CapitalRiskSimulatorBar from './CapitalRiskSimulatorBar';
import { 
  getUserConfiguredCapital, 
  setUserConfiguredCapital, 
  getCapitalTierConfig,
  getNepseBrokerCommissionRate,
  calculateDynamicBrokerFee,
  DEFAULT_USER_CAPITAL,
  NEPSE_FRICTION_FY2083
} from '../utils/dynamicCapitalEngine';

export function CapitalRiskSimulatorView({ 
  onNavigateToPortfolio,
  onNavigateToCalculator,
  className = '' 
}) {
  const [capital, setCapital] = useState(() => getUserConfiguredCapital());

  // Interactive Position Sizing Sandbox state
  const [testPrice, setTestPrice] = useState(480);
  const [testStopLoss, setTestStopLoss] = useState(455);
  const [testTarget, setTestTarget] = useState(530);

  useEffect(() => {
    const handleCapitalUpdated = (e) => {
      if (e.detail?.userCapital && e.detail.userCapital !== capital) {
        setCapital(e.detail.userCapital);
      }
    };
    window.addEventListener('nepse_capital_updated', handleCapitalUpdated);
    return () => window.removeEventListener('nepse_capital_updated', handleCapitalUpdated);
  }, [capital]);

  const tierConfig = getCapitalTierConfig(capital);
  // Enforce strict 1% maximum portfolio risk cap alongside tier configuration
  const effectiveRiskPct = Math.min(tierConfig.riskPerTradePct, 0.01);
  const maxRiskRs = Math.round(capital * effectiveRiskPct);
  const maxSlotCapitalRs = Math.round(capital * tierConfig.maxSlotAllocationPct);
  const cashReserveRs = Math.round(capital * tierConfig.tacticalCashReservePct);
  const commissionRate = getNepseBrokerCommissionRate(maxSlotCapitalRs);

  // Stop-Loss Inversion Guard & Half-Kelly Position Sizing (p = 0.635)
  const isStopValid = Number(testPrice) > 0 && Number(testStopLoss) > 0 && Number(testStopLoss) < Number(testPrice);
  const isTargetValid = Number(testTarget) > Number(testPrice);
  const perShareRisk = isStopValid ? (testPrice - testStopLoss) : 0;
  const perShareGain = isTargetValid ? (testTarget - testPrice) : 0;
  const bRatio = isStopValid && perShareRisk > 0 ? perShareGain / perShareRisk : 0;

  // Half-Kelly fraction: f*_half = 0.5 * (p - (1 - p) / b) with p = 0.635
  const winProb = 0.635;
  const fullKelly = bRatio > 0 ? (winProb - (1 - winProb) / bRatio) : 0;
  const halfKellyFraction = fullKelly > 0 ? Math.min(tierConfig.maxSlotAllocationPct, fullKelly * 0.5) : 0;
  const effectiveSlotCeilingRs = Math.min(maxSlotCapitalRs, Math.round(capital * halfKellyFraction));

  const theoreticalUnits = isStopValid && halfKellyFraction > 0 && perShareRisk > 0 ? (maxRiskRs / perShareRisk) : 0;
  const maxUnitsBySlot = isStopValid && halfKellyFraction > 0 && testPrice > 0 ? Math.floor(effectiveSlotCeilingRs / testPrice) : 0;
  const rawUnits = isStopValid && halfKellyFraction > 0 ? Math.max(0, Math.min(theoreticalUnits, maxUnitsBySlot)) : 0;

  // Invalid stops (StopLoss >= Price) or negative Kelly expectancy strictly yield 0 suggested kitta
  const suggestedKitta = !isStopValid || halfKellyFraction <= 0
    ? 0
    : rawUnits >= 10
    ? Math.floor(rawUnits / 10) * 10
    : Math.floor(rawUnits);

  const totalOutlay = suggestedKitta * testPrice;
  const actualRiskRs = Math.round(suggestedKitta * perShareRisk);
  const totalGainRs = Math.round(suggestedKitta * perShareGain);
  const riskRewardRatio = isStopValid && perShareRisk > 0 ? (perShareGain / perShareRisk).toFixed(2) : '0.00';
  const estimatedBrokerFee = totalOutlay > 0 ? calculateDynamicBrokerFee(totalOutlay) : 0;
  const sebonFee = totalOutlay > 0 ? Math.round(totalOutlay * NEPSE_FRICTION_FY2083.sebonFeeRate * 100) / 100 : 0;

  return (
    <div className={`space-y-5 p-4 max-w-6xl mx-auto ${className}`}>
      {/* ── Header Title & Context ── */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-black text-white tracking-tight">
                  Dynamic Capital &amp; Risk Simulator
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                  {tierConfig.tierName}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Live scales active trading capital, concurrent stock slot limits, 1% risk budgeting, single-stock allocation ceilings, cash reserve buffers, and tiered NEPSE broker commission fees.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {onNavigateToPortfolio && (
              <button
                onClick={onNavigateToPortfolio}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <Wallet className="w-3.5 h-3.5 text-indigo-400" />
                <span>My Portfolio</span>
              </button>
            )}
            {onNavigateToCalculator && (
              <button
                onClick={onNavigateToCalculator}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                <span>Calculators</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Dynamic Capital Bar Component ── */}
      <CapitalRiskSimulatorBar />

      {/* ── Tier Rules & Risk Management Directives ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Slot Allocation Ceiling */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Slot Allocation</span>
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black font-mono text-emerald-400">
              Rs. {maxSlotCapitalRs.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1">
              {(tierConfig.maxSlotAllocationPct * 100).toFixed(0)}% max in single stock
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
            Caps concentration risk so no single stock failure can cause catastrophic drawdown.
          </p>
        </div>

        {/* Card 2: 1% Risk Cap */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Max Risk / Trade</span>
              <Shield className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-black font-mono text-rose-400">
              Rs. {maxRiskRs.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1">
              {(tierConfig.riskPerTradePct * 100).toFixed(2)}% of total portfolio
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
            Absolute loss permitted if stop-loss is triggered. Protects longevity over 100+ trades.
          </p>
        </div>

        {/* Card 3: Tactical Cash Reserve */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Cash Reserve</span>
              <Coins className="w-4 h-4 text-amber-300" />
            </div>
            <div className="text-xl font-black font-mono text-amber-300">
              Rs. {cashReserveRs.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1">
              {(tierConfig.tacticalCashReservePct * 100).toFixed(0)}% liquidity cushion
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
            Maintained dry powder to capitalize on market-wide panics and high-conviction pullbacks.
          </p>
        </div>

        {/* Card 4: Broker Fee Tier */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Broker Bracket</span>
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-black font-mono text-cyan-400">
              {(commissionRate * 100).toFixed(2)}%
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1">
              Official NEPSE Tier
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800/80">
            Dynamic commission bracket based on single order turnover (0.36% down to 0.24%).
          </p>
        </div>
      </div>

      {/* ── Interactive Live Position Sizing Sandbox ── */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-200">
              Live Trade Sizing Sandbox
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Calculated against active Rs. {capital.toLocaleString()} capital
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Inputs */}
          <div className="lg:col-span-5 space-y-3.5 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Entry Price (Rs. / Share)
              </label>
              <input
                type="number"
                min="10"
                step="1"
                value={testPrice}
                onChange={(e) => setTestPrice(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-black font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Stop Loss (Rs.)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={testStopLoss}
                  onChange={(e) => setTestStopLoss(Math.max(0.5, Number(e.target.value)))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-black font-mono text-rose-400 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Target Price (Rs.)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={testTarget}
                  onChange={(e) => setTestTarget(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-black font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Risk Per Share: <b className="text-rose-400 font-mono">Rs. {perShareRisk.toFixed(2)}</b></span>
              <span>Reward Per Share: <b className="text-emerald-400 font-mono">Rs. {perShareGain.toFixed(2)}</b></span>
            </div>
          </div>

          {/* Outputs */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
                Suggested Lots
              </span>
              <span className="text-xl font-black font-mono text-emerald-400 mt-1 block">
                {suggestedKitta.toLocaleString()} Kitta
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">10-Share NEPSE Lot</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
                Trade Capital
              </span>
              <span className="text-lg font-black font-mono text-white mt-1 block">
                Rs. {totalOutlay.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">
                {((totalOutlay / capital) * 100).toFixed(1)}% of capital
              </span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
                R:R Ratio
              </span>
              <span className={`text-xl font-black font-mono mt-1 block ${Number(riskRewardRatio) >= 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
                1 : {riskRewardRatio}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">
                {Number(riskRewardRatio) >= 2 ? 'Favorable Setup' : 'Sub-Optimal Setup'}
              </span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
                Risk at Stop Loss
              </span>
              <span className="text-lg font-black font-mono text-rose-400 mt-1 block">
                Rs. {actualRiskRs.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">
                {((actualRiskRs / capital) * 100).toFixed(2)}% of portfolio
              </span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
                Potential Profit
              </span>
              <span className="text-lg font-black font-mono text-emerald-400 mt-1 block">
                Rs. {totalGainRs.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">At Target Price</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 text-center flex flex-col justify-center">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
                Broker + SEBON
              </span>
              <span className="text-sm font-black font-mono text-cyan-400 mt-1 block">
                Rs. {(estimatedBrokerFee + sebonFee).toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5">Estimated Entry Friction</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── System Synchronization Info Banner ── */}
      <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-3 text-xs text-indigo-300">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-white">Universal Dynamic Engine Integration</p>
          <p className="text-slate-300 leading-relaxed">
            Changing capital in this simulator instantly updates all Smart Alert execution cards, position sizing calculations, and the NEPSE AI Predictor throughout the application without requiring a page reload.
          </p>
        </div>
      </div>
    </div>
  );
}

export default CapitalRiskSimulatorView;
