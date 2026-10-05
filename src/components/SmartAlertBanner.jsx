import React, { useState, useEffect } from 'react';
import { Bell, ArrowRight, X } from 'lucide-react';

export function SmartAlertBanner({ onOpenCard }) {
  const [activeAlert, setActiveAlert] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleAlertReceived = (e) => {
      const alert = e.detail;
      if (!alert) return;
      setActiveAlert(alert);
      setVisible(true);

      // Auto dismiss banner after 12 seconds if not interacted
      const timer = setTimeout(() => {
        setVisible(false);
      }, 12000);

      return () => clearTimeout(timer);
    };

    window.addEventListener('dravyashree_smart_alert_received', handleAlertReceived);
    return () => {
      window.removeEventListener('dravyashree_smart_alert_received', handleAlertReceived);
    };
  }, []);

  if (!visible || !activeAlert) return null;

  const sym = activeAlert.symbol || 'GHL';
  const ltp = Number(activeAlert.ltp || 0);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md animate-in slide-in-from-top-4 duration-300">
      <div 
        onClick={() => {
          setVisible(false);
          if (onOpenCard) onOpenCard(activeAlert);
        }}
        className="cursor-pointer bg-slate-900/95 backdrop-blur-md border border-emerald-500/50 rounded-2xl p-3.5 shadow-2xl shadow-emerald-950/80 flex items-center justify-between gap-3 text-left hover:border-emerald-400 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-white tracking-wide">{sym}</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Institutional Entry
              </span>
              <span className="text-xs font-mono font-semibold text-emerald-400">NPR {ltp.toFixed(2)}</span>
            </div>
            <p className="text-xs text-slate-300 truncate mt-0.5">
              {activeAlert.dominantBrokersText || 'Broker 58 & 45'} absorbing {activeAlert.concentrationPct || 52}% float
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="p-1.5 rounded-lg bg-emerald-600/30 text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <ArrowRight className="w-4 h-4" />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setVisible(false);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SmartAlertBanner;
