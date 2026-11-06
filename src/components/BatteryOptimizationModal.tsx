import React from 'react';
import { ShieldAlert, BellRing, BatteryCharging, CheckCircle2, X, ExternalLink } from 'lucide-react';

interface BatteryOptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BatteryOptimizationModal: React.FC<BatteryOptimizationModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleOpenSettings = async () => {
    try {
      // In Capacitor native Android, open app details / settings
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
        const { App } = await import('@capacitor/app');
        // If native settings plugin exists or fallback to general open
        try {
          await (App as any).openUrl({ url: 'package:' + ((window as any).Capacitor?.getPlatform() || 'com.nepse.drabyashree') });
        } catch (_) {}
      }
    } catch (_) {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30 text-amber-400">
            <BatteryCharging className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              ब्याकग्राउन्ड अलर्ट सुरक्षा
            </h3>
            <p className="text-xs text-amber-400 font-medium">
              Android Battery Optimization Whitelist
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          Xiaomi, Samsung, Oppo लगायतका फोनहरूले ब्याट्री बचाउन पृष्ठभूमिमा चल्ने एपहरू बन्द गरिदिने गर्छन्। बजार बन्द हुँदा वा मोबाइल लक हुँदा पनि <strong>टार्गेट र स्टप-लस सूचना (Alerts)</strong> तुरुन्त पाउन निम्न सेटिङ मिलाउनुहोस्:
        </p>

        <div className="space-y-3 mb-6 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-200">
              <span className="font-semibold text-white">ब्याट्री सेभर (Battery Saver):</span> "No Restrictions" वा "Don't Optimize" छनोट गर्नुहोस्।
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-200">
              <span className="font-semibold text-white">अटो-स्टार्ट (Autostart - MIUI):</span> Drabyashree एपलाई पृष्ठभूमिमा सुरु हुन अनुमति दिनुहोस्।
            </div>
          </div>
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-200">
              <span className="font-semibold text-white">अलर्ट साउन्ड:</span> High Priority Notifications सक्रिय राख्नुहोस्।
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleOpenSettings}
            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <ExternalLink className="w-4 h-4" />
            सेटिङ मिलाउनुहोस् (Open App Settings)
          </button>
          <button
            onClick={() => {
              localStorage.setItem('battery_modal_dismissed', 'true');
              onClose();
            }}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
          >
            मैले मिलाइसकेँ / बुझें (Understood)
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatteryOptimizationModal;
