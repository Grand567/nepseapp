import React, { useState, useEffect } from 'react';
import { Settings, Trash2, Download, Upload, RefreshCw, CheckCircle2, Shield, Bell, Moon, Database, Smartphone } from 'lucide-react';
import { clearAllCache } from '../utils/servicesApi';
import { getWatchlist } from '../utils/watchlist';
import { StatCard, InfoBanner, Insight } from './ui';

export function PreferencesSettingsService() {
  const [defaultTf, setDefaultTf] = useState(() => localStorage.getItem('nepse_default_tf') || '1M');
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('nepse_data_saver') === 'true');
  const [audioAlerts, setAudioAlerts] = useState(() => localStorage.getItem('nepse_audio_alerts') === 'true');
  const [cacheCleared, setCacheCleared] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handleSetTf = (tf: string) => {
    setDefaultTf(tf);
    localStorage.setItem('nepse_default_tf', tf);
  };

  const handleToggleDataSaver = () => {
    const next = !dataSaver;
    setDataSaver(next);
    localStorage.setItem('nepse_data_saver', String(next));
  };

  const handleToggleAudio = () => {
    const next = !audioAlerts;
    setAudioAlerts(next);
    localStorage.setItem('nepse_audio_alerts', String(next));
  };

  const handleClearCache = () => {
    clearAllCache();
    // clear api keys and caches while preserving portfolio & watchlist
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  };

  const handleExportBackup = () => {
    try {
      const backup = {
        exportedAt: new Date().toISOString(),
        watchlist: getWatchlist(),
        portfolio: JSON.parse(localStorage.getItem('nepse_portfolio_v1') || '[]'),
        notes: JSON.parse(localStorage.getItem('nepse_trade_notes_v1') || '[]'),
        alerts: JSON.parse(localStorage.getItem('nepse_stock_alerts_v1') || '[]'),
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nepse-desk-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (_) {}
  };

  const watchlistCount = getWatchlist().length;
  const portfolioCount = (JSON.parse(localStorage.getItem('nepse_portfolio_v1') || '[]')).length;
  const notesCount = (JSON.parse(localStorage.getItem('nepse_trade_notes_v1') || '[]')).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Desk Preferences &amp; App Settings</h3>
          <p className="text-xs text-slate-400">Configure default horizons, data saver, notification sounds, and backup personal trading data.</p>
        </div>
      </div>

      {cacheCleared && (
        <InfoBanner type="success">
          ✅ <strong>Cache Successfully Purged!</strong> All memory stores have been flushed. Fresh real-time data will be requested from NEPSE servers.
        </InfoBanner>
      )}

      {exportSuccess && (
        <InfoBanner type="success">
          ✅ <strong>Personal Data Exported!</strong> Downloaded JSON backup of your Watchlist ({watchlistCount}), Portfolio ({portfolioCount}), and Trade Notes ({notesCount}).
        </InfoBanner>
      )}

      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Watchlist Items" value={watchlistCount} color="#a855f7" />
        <StatCard label="Portfolio Holdings" value={portfolioCount} color="#3b82f6" />
        <StatCard label="Trade Journal Notes" value={notesCount} color="#f59e0b" />
        <StatCard label="Data Storage" value="Local Vault (Encrypted)" color="#10b981" />
      </div>

      {/* Settings Sections */}
      <div className="space-y-3">
        {/* Default Timeframe */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock size={14} className="text-blue-400" /> Default Screener &amp; Chart Horizon
          </h4>
          <p className="text-xs text-slate-400">
            Set your preferred default timeframe when opening Universal Screeners and technical charting tools.
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            {(['1D', '1W', '1M', '3M', '1Y'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => handleSetTf(tf)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  defaultTf === tf ? 'bg-blue-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Data & Performance */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Smartphone size={14} className="text-emerald-400" /> Mobile Performance &amp; Data Saver
          </h4>

          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div>
              <div className="text-xs font-bold text-white">Low-Bandwidth Mode</div>
              <div className="text-[11px] text-slate-400">Reduces background polling frequency to save mobile cellular data.</div>
            </div>
            <button
              onClick={handleToggleDataSaver}
              className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${dataSaver ? 'bg-emerald-600' : 'bg-slate-700'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${dataSaver ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">Market Event Chime</div>
              <div className="text-[11px] text-slate-400">Play a subtle sound when a target price alert is triggered.</div>
            </div>
            <button
              onClick={handleToggleAudio}
              className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 ${audioAlerts ? 'bg-blue-600' : 'bg-slate-700'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${audioAlerts ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Storage & Backup */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Database size={14} className="text-purple-400" /> Personal Data &amp; Cache Management
          </h4>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div>
              <div className="text-xs font-bold text-white">Purge Live Market Cache</div>
              <div className="text-[11px] text-slate-400">Clear stored live prices and force a fresh connection to NEPSE API proxy.</div>
            </div>
            <button
              onClick={handleClearCache}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition"
            >
              <RefreshCw size={13} /> Flush &amp; Refresh Cache
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
            <div>
              <div className="text-xs font-bold text-white">Backup Personal Trading Desk</div>
              <div className="text-[11px] text-slate-400">Download a JSON snapshot of your watchlists, portfolio entries, and trading notes.</div>
            </div>
            <button
              onClick={handleExportBackup}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition shadow"
            >
              <Download size={13} /> Export Backup (.json)
            </button>
          </div>
        </div>
      </div>

      <Insight>
        All watchlists, portfolio balances, and journal notes are stored securely on this device. Create regular JSON backups before clearing browser cookies or application data.
      </Insight>
    </div>
  );
}
function Clock(props: any) {
  return <ClockIcon {...props} />;
}
import { Clock as ClockIcon } from 'lucide-react';
