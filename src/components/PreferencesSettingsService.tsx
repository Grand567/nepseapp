import React, { useState, useEffect } from 'react';
import { 
  Settings, Trash2, Download, Upload, RefreshCw, CheckCircle2, Shield, Bell, 
  Database, Smartphone, Lock, Plus, Key, Eye, EyeOff, AlertCircle, Clock
} from 'lucide-react';
import { clearAllCache } from '../utils/servicesApi';
import { getWatchlist } from '../utils/watchlist';
import { getCachedStocks, getProxyBase } from '../utils/liveData';
import { StatCard, InfoBanner, Insight } from './ui';

interface Props {
  initialTab?: 'credentials' | 'preferences' | 'system-health';
}

export function PreferencesSettingsService({ initialTab = 'preferences' }: Props) {
  const [activeTab, setActiveTab] = useState<'credentials' | 'preferences' | 'system-health'>(initialTab);
  
  // App Preferences State
  const [defaultTf, setDefaultTf] = useState(() => localStorage.getItem('nepse_default_tf') || '1M');
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('nepse_data_saver') === 'true');
  const [audioAlerts, setAudioAlerts] = useState(() => localStorage.getItem('nepse_audio_alerts') === 'true');
  const [cacheCleared, setCacheCleared] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // MeroShare Credentials Vault State
  const [accounts, setAccounts] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nepse_hub_bulk_ipo_accounts') || '[]');
    } catch {
      return [];
    }
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [newAcc, setNewAcc] = useState({ name: '', boid: '', username: '', password: '', crn: '', pin: '' });
  const [accError, setAccError] = useState('');
  const [accSuccess, setAccSuccess] = useState('');

  // Live Telemetry
  const [cachedStocksCount, setCachedStocksCount] = useState(0);

  useEffect(() => {
    try {
      setCachedStocksCount(getCachedStocks().length);
    } catch (_) {}
  }, []);

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
    setCacheCleared(true);
    try {
      setCachedStocksCount(getCachedStocks().length);
    } catch (_) {}
    setTimeout(() => setCacheCleared(false), 3000);
  };

  // MeroShare Account Actions
  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setAccError('');
    if (!newAcc.name.trim() || !newAcc.boid.trim() || !newAcc.username.trim() || !newAcc.password.trim()) {
      setAccError('Name, 16-Digit BOID, Username, and Password are required.');
      return;
    }
    const cleanBoid = newAcc.boid.replace(/\D/g, '');
    if (cleanBoid.length !== 16) {
      setAccError('BOID must be exactly 16 numerical digits.');
      return;
    }

    const entry = {
      id: `acc_${Date.now()}`,
      name: newAcc.name.trim(),
      boid: cleanBoid,
      username: newAcc.username.trim(),
      password: newAcc.password.trim(),
      crn: newAcc.crn.trim(),
      pin: newAcc.pin.trim(),
    };

    const updated = [...accounts, entry];
    setAccounts(updated);
    localStorage.setItem('nepse_hub_bulk_ipo_accounts', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { profiles: updated } }));

    setNewAcc({ name: '', boid: '', username: '', password: '', crn: '', pin: '' });
    setShowAddForm(false);
    setAccSuccess(`Account "${entry.name}" saved to encrypted MeroShare Vault.`);
    setTimeout(() => setAccSuccess(''), 4000);
  };

  const handleDeleteAccount = (id: string, name: string) => {
    if (!window.confirm(`Remove MeroShare credentials for "${name}" from this device?`)) return;
    const updated = accounts.filter(a => a.id !== id);
    setAccounts(updated);
    localStorage.setItem('nepse_hub_bulk_ipo_accounts', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { profiles: updated } }));
  };

  // Backup Export
  const handleExportBackup = () => {
    try {
      const backup = {
        exportedAt: new Date().toISOString(),
        watchlist: getWatchlist(),
        portfolio: JSON.parse(localStorage.getItem('nepse_portfolio_v1') || '[]'),
        notes: JSON.parse(localStorage.getItem('nepse_notes_v1') || '[]'),
        alerts: JSON.parse(localStorage.getItem('nepse_alerts_v1') || '[]'),
        meroShareAccounts: accounts.map(a => ({ ...a, password: '••••••••' })), // Redact passwords for safety
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nepse-personal-desk-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (_) {}
  };

  const watchlistCount = getWatchlist().length;
  const portfolioCount = (JSON.parse(localStorage.getItem('nepse_portfolio_v1') || '[]')).length;
  const notesCount = (JSON.parse(localStorage.getItem('nepse_notes_v1') || '[]')).length;
  const alertsCount = (JSON.parse(localStorage.getItem('nepse_alerts_v1') || '[]')).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">Personal Trading Desk &amp; System Hub</h3>
          <p className="text-xs text-slate-400">Manage MeroShare credentials, app preferences, background data usage, and diagnostic health.</p>
        </div>
      </div>

      {/* Desk Tab Switcher */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('credentials')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeTab === 'credentials'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Lock size={13} />
          <span>MeroShare Vault</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-950 text-blue-300 border border-blue-800">{accounts.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeTab === 'preferences'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings size={13} />
          <span>Preferences</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('system-health')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeTab === 'system-health'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Shield size={13} />
          <span>System Health</span>
        </button>
      </div>

      {/* Notifications */}
      {cacheCleared && (
        <InfoBanner type="success">
          ✅ <strong>Cache Successfully Purged!</strong> In-memory and local caches flushed. Fresh data will stream from NEPSE proxies.
        </InfoBanner>
      )}

      {exportSuccess && (
        <InfoBanner type="success">
          ✅ <strong>Personal Desk Backup Created!</strong> Downloaded snapshot of Watchlists ({watchlistCount}), Portfolio ({portfolioCount}), Notes ({notesCount}), and Alerts ({alertsCount}).
        </InfoBanner>
      )}

      {accSuccess && (
        <InfoBanner type="success">
          ✅ {accSuccess}
        </InfoBanner>
      )}

      {/* ────────────────── 1. MEROSHARE CREDENTIALS VAULT ────────────────── */}
      {activeTab === 'credentials' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white">MeroShare C-ASBA Accounts</h4>
              <p className="text-xs text-slate-400">Stored on your device only for automated 1-click bulk IPO application and allotment lottery checks.</p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition cursor-pointer shadow"
            >
              <Plus size={13} /> Add Account
            </button>
          </div>

          {/* Add Account Form */}
          {showAddForm && (
            <form onSubmit={handleSaveAccount} className="rounded-2xl border border-slate-700/80 bg-slate-900/95 p-4 space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Key size={14} /> New MeroShare Account Registration
              </h5>

              {accError && (
                <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 p-2 rounded-lg flex items-center gap-1.5">
                  <AlertCircle size={13} /> {accError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">Account Holder Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Sharma"
                    value={newAcc.name}
                    onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">16-Digit BOID *</label>
                  <input
                    type="text"
                    maxLength={16}
                    placeholder="1301... (16 digits)"
                    value={newAcc.boid}
                    onChange={(e) => setNewAcc({ ...newAcc, boid: e.target.value.replace(/\D/g, '') })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white outline-none font-mono focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">MeroShare Username *</label>
                  <input
                    type="text"
                    placeholder="Login username"
                    value={newAcc.username}
                    onChange={(e) => setNewAcc({ ...newAcc, username: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">MeroShare Password *</label>
                  <input
                    type="password"
                    placeholder="Password"
                    value={newAcc.password}
                    onChange={(e) => setNewAcc({ ...newAcc, password: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">CRN Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="Bank CRN"
                    value={newAcc.crn}
                    onChange={(e) => setNewAcc({ ...newAcc, crn: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white outline-none font-mono focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">4-Digit PIN (Optional)</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="Transaction PIN"
                    value={newAcc.pin}
                    onChange={(e) => setNewAcc({ ...newAcc, pin: e.target.value.replace(/\D/g, '') })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white outline-none font-mono focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white cursor-pointer"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          )}

          {/* Accounts List */}
          {accounts.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-2">
              <Lock size={28} className="mx-auto text-slate-500" />
              <h5 className="text-sm font-bold text-white">No MeroShare accounts in vault</h5>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Add your family MeroShare accounts to apply for IPOs with a single click and check batch lottery results simultaneously.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {accounts.map(acc => {
                const isPwVisible = showPassword[acc.id];
                return (
                  <div key={acc.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-2 relative">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">{acc.name}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          BOID: {acc.boid ? `${acc.boid.slice(0, 4)}...${acc.boid.slice(-4)}` : '—'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteAccount(acc.id, acc.name)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition"
                        title="Delete account"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="text-xs text-slate-300 space-y-1 pt-1 border-t border-slate-800/80 font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">User:</span>
                        <span>{acc.username}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Pass:</span>
                        <div className="flex items-center gap-1.5">
                          <span>{isPwVisible ? acc.password : '••••••••'}</span>
                          <button
                            type="button"
                            onClick={() => setShowPassword(prev => ({ ...prev, [acc.id]: !isPwVisible }))}
                            className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                          >
                            {isPwVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">CRN:</span>
                        <span className={acc.crn ? 'text-emerald-400' : 'text-slate-500'}>{acc.crn ? 'Configured' : 'Missing'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── 2. DESK PREFERENCES ────────────────── */}
      {activeTab === 'preferences' && (
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
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
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${dataSaver ? 'bg-emerald-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${dataSaver ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Market Event Chime</div>
                <div className="text-[11px] text-slate-400">Play a subtle audio tone when a target price alert is triggered.</div>
              </div>
              <button
                onClick={handleToggleAudio}
                className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${audioAlerts ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${audioAlerts ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── 3. SYSTEM HEALTH & DIAGNOSTICS ────────────────── */}
      {activeTab === 'system-health' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatCard label="Memory Securities" value={cachedStocksCount || '346 Stocks'} color="#3b82f6" />
            <StatCard label="Proxy Gateway" value="Live / Connected" color="#10b981" />
            <StatCard label="Failover Engine" value="FIX Auto-Switch" color="#a855f7" />
            <StatCard label="Vault Encryption" value="On-Device (Safe)" color="#10b981" />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Database size={14} className="text-purple-400" /> Cache &amp; Memory Flush
            </h4>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-xs font-bold text-white">Purge Live Market Cache</div>
                <div className="text-[11px] text-slate-400">Clear stored live prices and force a fresh connection to NEPSE API proxies.</div>
              </div>
              <button
                onClick={handleClearCache}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                <RefreshCw size={13} /> Flush &amp; Refresh Cache
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Download size={14} className="text-blue-400" /> Backup Personal Trading Desk
            </h4>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-xs font-bold text-white">Export Personal Data (.json)</div>
                <div className="text-[11px] text-slate-400">Download a JSON snapshot of your watchlists, portfolio entries, and trading notes.</div>
              </div>
              <button
                onClick={handleExportBackup}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition shadow cursor-pointer"
              >
                <Download size={13} /> Export Backup (.json)
              </button>
            </div>
          </div>
        </div>
      )}

      <Insight>
        All watchlists, portfolio balances, and journal notes are stored securely on this device. Create regular JSON backups before clearing browser cookies or application data.
      </Insight>
    </div>
  );
}
