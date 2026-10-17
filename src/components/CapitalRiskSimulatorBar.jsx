// src/components/CapitalRiskSimulatorBar.jsx
import React, { useState, useEffect } from 'react';
import { 
  Sliders, Shield, Coins, PieChart, Layers, RefreshCw, 
  CheckCircle2, ArrowRight, Zap, Info, TrendingUp, AlertTriangle
} from 'lucide-react';
import { 
  getUserConfiguredCapital, 
  setUserConfiguredCapital, 
  getCapitalTierConfig,
  getNepseBrokerCommissionRate,
  DEFAULT_USER_CAPITAL
} from '../utils/dynamicCapitalEngine';

const PRESET_CAPITALS = [
  { label: 'Rs. 50K', value: 50000, tier: 'Tier 1' },
  { label: 'Rs. 1 Lakh', value: 100000, tier: 'Tier 1' },
  { label: 'Rs. 5 Lakhs', value: 500000, tier: 'Tier 2' },
  { label: 'Rs. 10 Lakhs', value: 1000000, tier: 'Tier 2' },
  { label: 'Rs. 25 Lakhs', value: 2500000, tier: 'Tier 3' },
  { label: 'Rs. 1 Crore', value: 10000000, tier: 'Tier 4' }
];

export function CapitalRiskSimulatorBar({ onCapitalChange, className = '' }) {
  const [capital, setCapital] = useState(() => getUserConfiguredCapital());
  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState(() => String(getUserConfiguredCapital()));
  const [syncedSuccess, setSyncedSuccess] = useState(false);

  useEffect(() => {
    const handleCapitalUpdated = (e) => {
      if (e.detail?.userCapital && e.detail.userCapital !== capital) {
        setCapital(e.detail.userCapital);
        setInputVal(String(e.detail.userCapital));
      }
    };
    window.addEventListener('nepse_capital_updated', handleCapitalUpdated);
    return () => window.removeEventListener('nepse_capital_updated', handleCapitalUpdated);
  }, [capital]);

  const tierConfig = getCapitalTierConfig(capital);
  const maxRiskRs = Math.round(capital * tierConfig.riskPerTradePct);
  const maxSlotCapitalRs = Math.round(capital * tierConfig.maxSlotAllocationPct);
  const cashReserveRs = Math.round(capital * tierConfig.tacticalCashReservePct);
  const commissionRate = getNepseBrokerCommissionRate(maxSlotCapitalRs);

  const applyCapital = (val) => {
    const clean = Math.max(10000, Math.round(Number(val) || DEFAULT_USER_CAPITAL));
    setCapital(clean);
    setInputVal(String(clean));
    setUserConfiguredCapital(clean);
    if (onCapitalChange) onCapitalChange(clean);
  };

  const handleSliderChange = (e) => {
    applyCapital(Number(e.target.value));
  };

  const handleInputSubmit = (e) => {
    e.preventDefault();
    setIsEditing(false);
    applyCapital(Number(inputVal));
  };

  const handleSyncWithPortfolio = () => {
    try {
      let foundValue = 0;
      // Search for stored holdings or portfolio data
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('nepse_portfolio_txs_') || k === 'nepse_holdings') {
          try {
            const parsed = JSON.parse(localStorage.getItem(k) || '[]');
            if (Array.isArray(parsed) && parsed.length > 0) {
              const val = parsed.reduce((sum, h) => sum + (Number(h.totalCost || h.currentValue || (h.units * h.wacc) || 0)), 0);
              if (val > foundValue) foundValue = val;
            }
          } catch (_) {}
        }
      }

      if (foundValue > 10000) {
        applyCapital(foundValue);
        setSyncedSuccess(true);
        setTimeout(() => setSyncedSuccess(false), 3000);
      } else {
        // Fallback to default
        applyCapital(DEFAULT_USER_CAPITAL);
      }
    } catch (_) {}
  };

  return (
    <div className={`p-4 rounded-2xl bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-indigo-950/40 border border-indigo-500/30 shadow-xl backdrop-blur-md ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 font-mono">
                Dynamic Capital &amp; Risk Simulator
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {tierConfig.tierName}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Live scales slot sizes, broker commission tiers, and 1% risk allocations without page reload
            </p>
          </div>
        </div>

        {/* Sync with Portfolio Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncWithPortfolio}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              syncedSuccess
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="Auto-sync capital from active portfolio value"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncedSuccess ? 'text-emerald-400' : ''}`} />
            <span>{syncedSuccess ? 'Portfolio Synced!' : 'Sync Portfolio'}</span>
          </button>
        </div>
      </div>

      {/* Main Control Panel: Preset Pills & Slider */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-3.5 items-center">
        {/* Capital Value / Input */}
        <div className="lg:col-span-4 flex items-center gap-2">
          <div className="flex-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Active Trading Capital
            </span>
            {isEditing ? (
              <form onSubmit={handleInputSubmit} className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg px-2.5 py-1 text-sm font-black font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
                >
                  Set
                </button>
              </form>
            ) : (
              <div 
                onClick={() => setIsEditing(true)}
                className="cursor-pointer group flex items-baseline gap-2 bg-slate-950/60 border border-slate-800 hover:border-indigo-500/50 rounded-xl px-3 py-1.5 transition-colors"
                title="Click to type exact capital amount"
              >
                <span className="text-lg font-black font-mono text-emerald-400">
                  Rs. {capital.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 group-hover:text-indigo-400 underline decoration-dotted">
                  Edit
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Preset Buttons */}
        <div className="lg:col-span-8 flex flex-wrap items-center gap-1.5 justify-start lg:justify-end">
          {PRESET_CAPITALS.map((p) => {
            const isActive = capital === p.value;
            return (
              <button
                key={p.value}
                onClick={() => applyCapital(p.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40 ring-1 ring-indigo-400'
                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Logarithmic Slider */}
      <div className="mt-3">
        <input
          type="range"
          min="20000"
          max="10000000"
          step="10000"
          value={capital}
          onChange={handleSliderChange}
          className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />
      </div>

      {/* Live Scaled Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 mt-3 border-t border-slate-800/80">
        {/* Metric 1: Slots */}
        <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/60 text-center">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Max Slots
          </span>
          <span className="text-sm font-black font-mono text-white mt-0.5 block">
            {tierConfig.maxSlots} Stocks
          </span>
          <span className="text-[9.5px] text-slate-500">Concurrent</span>
        </div>

        {/* Metric 2: Risk Per Trade */}
        <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/60 text-center">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Risk Cap
          </span>
          <span className="text-sm font-black font-mono text-rose-400 mt-0.5 block">
            Rs. {maxRiskRs.toLocaleString()}
          </span>
          <span className="text-[9.5px] text-slate-500">{(tierConfig.riskPerTradePct * 100).toFixed(2)}% of capital</span>
        </div>

        {/* Metric 3: Max Slot Capital */}
        <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/60 text-center">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Slot Ceiling
          </span>
          <span className="text-sm font-black font-mono text-emerald-400 mt-0.5 block">
            Rs. {maxSlotCapitalRs.toLocaleString()}
          </span>
          <span className="text-[9.5px] text-slate-500">{(tierConfig.maxSlotAllocationPct * 100).toFixed(0)}% single stock</span>
        </div>

        {/* Metric 4: Cash Reserve */}
        <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/60 text-center">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Cash Reserve
          </span>
          <span className="text-sm font-black font-mono text-amber-300 mt-0.5 block">
            Rs. {cashReserveRs.toLocaleString()}
          </span>
          <span className="text-[9.5px] text-slate-500">{(tierConfig.tacticalCashReservePct * 100).toFixed(0)}% tactical</span>
        </div>

        {/* Metric 5: Broker Commission Tier */}
        <div className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/60 text-center col-span-2 sm:col-span-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Broker Fee Tier
          </span>
          <span className="text-sm font-black font-mono text-cyan-400 mt-0.5 block">
            {(commissionRate * 100).toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-slate-500">Dynamic Tier</span>
        </div>
      </div>
    </div>
  );
}

export default CapitalRiskSimulatorBar;
