import React from 'react';
import {
  Bell, CheckCircle2, Shield, TrendingUp, AlertTriangle, X,
  ArrowUpRight, Share2, Copy, ExternalLink, Activity, Target, Lock, Zap
} from 'lucide-react';

export interface SmartAlertData {
  id?: string;
  symbol: string;
  ltp: number;
  vwap?: number;
  triggeredAt?: string;
  buyZone?: {
    low: number;
    high: number;
    statusText?: string;
  };
  dominantBrokersText?: string;
  concentrationPct?: number;
  topBuyerBrokers?: Array<{
    broker: string;
    name?: string;
    buyQty?: number;
    buyAmt?: number;
  }>;
  sellerStatus?: string;
  target1?: number;
  target2?: number;
  stopLoss?: number;
  riskRewardRatio?: number;
}

interface InstitutionalAlertCardModalProps {
  alert: SmartAlertData | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenRadar?: (symbol: string) => void;
}

export const InstitutionalAlertCardModal: React.FC<InstitutionalAlertCardModalProps> = ({
  alert,
  isOpen,
  onClose,
  onOpenRadar
}) => {
  if (!isOpen || !alert) return null;

  const sym = alert.symbol || 'GHL';
  const ltp = Number(alert.ltp || 269.50);
  const buyLow = Number(alert.buyZone?.low || Math.round(ltp * 0.99));
  const buyHigh = Number(alert.buyZone?.high || Math.round(ltp * 1.02));
  const brokersText = alert.dominantBrokersText || 'Broker 58 & 45';
  const concentration = alert.concentrationPct || 52;
  const target1 = alert.target1 || Math.round(ltp * 1.15);
  const target2 = alert.target2 || Math.round(ltp * 1.25);
  const stopLoss = alert.stopLoss || Math.round(ltp * 0.95);
  const rr = alert.riskRewardRatio || +((target1 - ltp) / Math.max(1, ltp - stopLoss)).toFixed(2);

  const copySummary = () => {
    const text = `🔔 DRAVYASHREE ALERT: ${sym} is Ready for Entry\n` +
      `LTP: NPR ${ltp.toFixed(2)} (Inside Buy Zone: NPR ${buyLow} - ${buyHigh})\n` +
      `${brokersText} absorbing ${concentration}% of morning float. Seller volume dry.\n` +
      `Target: NPR ${target1} - ${target2} | Stop-Loss: NPR ${stopLoss} (R:R ${rr}:1)\n` +
      `Dravyashree Smart Institutional Alert`;
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-950/50 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white tracking-wide">{sym}</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Ready for Entry
                </span>
              </div>
              <p className="text-xs text-slate-400">Institutional Setup Triggered</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Mobile Push Notification Mockup Card */}
          <div className="p-3.5 bg-slate-950/90 rounded-xl border border-emerald-500/40 shadow-inner relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-start gap-2.5">
              <span className="text-xl">🔔</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-white flex items-center justify-between">
                  <span>Dravyashree Alert: {sym} is Ready for Entry</span>
                  <span className="text-[10px] text-slate-400 font-mono">Just Now</span>
                </div>
                <div className="mt-1 text-xs font-semibold text-emerald-400">
                  LTP: NPR {ltp.toFixed(2)} <span className="text-slate-300 font-normal">(Inside Buy Zone: {buyLow} - {buyHigh})</span>
                </div>
                <div className="mt-1 text-xs text-slate-300 leading-relaxed">
                  {brokersText} absorbing <strong className="text-emerald-300">{concentration}%</strong> of morning float. Seller volume dry.
                </div>
                <div className="mt-1.5 text-xs font-mono font-medium text-amber-300 flex items-center gap-2">
                  <span>Target: NPR {target1} - {target2}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-rose-400">Stop-Loss: NPR {stopLoss}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3 Core Criteria Verification Badges */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              3 Simultaneous Institutional Criteria Verified
            </div>

            {/* Condition 1: Price in Base */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Condition 1: Price in Base</div>
                  <div className="text-[11px] text-slate-400">
                    LTP NPR {ltp.toFixed(2)} is within [VWAP, VWAP + 2%] buy pocket
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {buyLow} - {buyHigh}
              </span>
            </div>

            {/* Condition 2: Buyer Concentration */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Condition 2: Buyer Concentration &gt; 50%</div>
                  <div className="text-[11px] text-slate-400">
                    {brokersText} dominating intraday buy tickets
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {concentration}% BCR₃
              </span>
            </div>

            {/* Condition 3: Seller Volume Dry */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Condition 3: Seller Volume Dry</div>
                  <div className="text-[11px] text-slate-400">
                    {alert.sellerStatus || 'Exhaustion at support (< 20-day average)'}
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                Supply Cleared
              </span>
            </div>
          </div>

          {/* Execution Matrix (Targets & Stop-Loss) */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-center">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Stop Loss</div>
              <div className="mt-1 text-sm font-black font-mono text-rose-400">NPR {stopLoss}</div>
              <div className="text-[10px] text-rose-500/80 font-mono mt-0.5">
                -{(((ltp - stopLoss) / ltp) * 100).toFixed(1)}%
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/40 border border-emerald-500/30 text-center">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Target 1</div>
              <div className="mt-1 text-sm font-black font-mono text-emerald-400">NPR {target1}</div>
              <div className="text-[10px] text-emerald-500/80 font-mono mt-0.5">
                +{(((target1 - ltp) / ltp) * 100).toFixed(1)}%
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-center">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Target 2</div>
              <div className="mt-1 text-sm font-black font-mono text-emerald-300">NPR {target2}</div>
              <div className="text-[10px] text-emerald-500/80 font-mono mt-0.5">
                +{(((target2 - ltp) / ltp) * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Risk Reward Banner */}
          <div className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">Asymmetric Risk-Reward</span>
            <span className="text-emerald-400 font-bold font-mono">1 : {rr}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <button
            onClick={() => {
              onClose();
              if (onOpenRadar) onOpenRadar(sym);
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98]"
          >
            <Activity className="w-4 h-4" />
            <span>Open in Accumulation Radar</span>
          </button>

          <button
            onClick={copySummary}
            className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title="Copy Setup Summary"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstitutionalAlertCardModal;
