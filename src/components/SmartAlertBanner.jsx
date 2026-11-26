import React, { useState, useEffect, useRef } from 'react';
import { Bell, ArrowRight, X } from 'lucide-react';

export function SmartAlertBanner({ onOpenCard }) {
  const [activeAlert, setActiveAlert] = useState(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handleAlertReceived = (e) => {
      const alert = e.detail;
      if (!alert || !alert.symbol) return;
      setActiveAlert(alert);
      setVisible(true);

      // Auto dismiss banner after 12 seconds if not interacted
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 12000);
    };

    window.addEventListener('dravyashree_smart_alert_received', handleAlertReceived);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('dravyashree_smart_alert_received', handleAlertReceived);
    };
  }, []);

  if (!visible || !activeAlert || !activeAlert.symbol) return null;

  const sym = activeAlert.symbol;
  const rawLtp = Number(activeAlert.ltp);
  const ltp = Number.isFinite(rawLtp) && rawLtp > 0 ? rawLtp : null;
  const isEarlyWarning = Boolean(
    activeAlert.isIntradayEarlyWarning ||
    activeAlert.type === 'BROKER_58_EARLY_IGNITION' ||
    activeAlert.type === 'BREAKOUT'
  );
  const badgeText = isEarlyWarning
    ? '⚠️ Early Warning • Verify /sniper'
    : activeAlert.isDualTierSniper
      ? '🎯 Tier-1 Sniper (87.5% WR)'
      : activeAlert.isDualTierBalanced
        ? '🏹 Dual-Tier Prime (75.0% WR)'
        : 'Institutional Entry';

  const handleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md animate-in slide-in-from-top-4 duration-300">
      <div 
        onClick={() => {
          handleDismiss();
          if (onOpenCard) onOpenCard(activeAlert);
        }}
        className={`cursor-pointer bg-slate-900/95 backdrop-blur-md border rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 text-left transition-all group ${
          isEarlyWarning
            ? 'border-amber-500/60 shadow-amber-950/70 hover:border-amber-400'
            : 'border-emerald-500/50 shadow-emerald-950/80 hover:border-emerald-400'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            isEarlyWarning
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
          }`}>
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-sm text-white tracking-wide">{sym}</span>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                isEarlyWarning
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/35'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}>
                {badgeText}
              </span>
              {ltp !== null && (
                <span className={`text-xs font-mono font-semibold ${isEarlyWarning ? 'text-amber-300' : 'text-emerald-400'}`}>
                  NPR {ltp.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 truncate mt-0.5">
              {isEarlyWarning
                ? (activeAlert.intradayWarningBanner || activeAlert.dominantBrokersText || activeAlert.body || 'Unconfirmed intraday spike — verify /analyze & EOD /sniper')
                : (activeAlert.dominantBrokersText || activeAlert.body || 'Smart Money Flow detected')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`p-1.5 rounded-lg transition-all ${
            isEarlyWarning
              ? 'bg-amber-600/30 text-amber-200 group-hover:bg-amber-600 group-hover:text-white'
              : 'bg-emerald-600/30 text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white'
          }`}>
            <ArrowRight className="w-4 h-4" />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SmartAlertBanner;
