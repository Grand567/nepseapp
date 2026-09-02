import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, ShieldCheck, Loader2, User, Lock, Key, 
  Landmark, AlertCircle, RefreshCw, CheckCircle2, Eye, EyeOff, Sparkles, ArrowRight
} from 'lucide-react';
import { getProxyBase } from '../utils/liveData';
import { MEROSHARE_DP_LIST, pullMeroShareLivePortfolio } from '../services/meroShareService';
import { sanitizeMeroShareHoldings } from '../utils/calculations';
import { Capacitor } from '@capacitor/core';

// localStorage key for bulk IPO accounts
const BULK_ACCOUNTS_KEY = 'nepse_hub_bulk_ipo_accounts';

function loadLocalAccounts() {
  try {
    const raw = localStorage.getItem(BULK_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAccounts(accounts) {
  localStorage.setItem(BULK_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export default function AccountManager({ userId = 'guest_local' }) {
  const [accounts, setAccounts] = useState([]);
  const [dpList, setDpList] = useState(MEROSHARE_DP_LIST);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [boid, setBoid] = useState('');
  const [username, setUsername] = useState('');
  const [dpCode, setDpCode] = useState('');
  const [dpSearch, setDpSearch] = useState('');
  const [password, setPassword] = useState('');
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isNative = Capacitor.isNativePlatform();
  const proxyBase = getProxyBase();

  useEffect(() => {
    fetchAccounts();
    fetchDpList();
  }, []);

  const fetchAccounts = async () => {
    setIsLoading(true);
    setError('');

    // On native Android, always use localStorage
    if (isNative) {
      const local = loadLocalAccounts();
      setAccounts(local);
      setIsLoading(false);
      return;
    }

    // On web, try proxy server first, fall back to localStorage
    try {
      const res = await fetch(`${proxyBase}/api/meroshare/accounts`);
      const text = await res.text().catch(() => '');
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new Error('Server returned invalid response format.');
      }

      if (res.ok && data.success) {
        setAccounts(data.accounts || []);
      } else {
        throw new Error(data.error || data.message || 'Failed to load accounts from proxy.');
      }
    } catch (err) {
      console.warn('[AccountManager] Proxy unavailable, using localStorage:', err.message);
      const local = loadLocalAccounts();
      setAccounts(local);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDpList = async () => {
    try {
      const res = await fetch(`${proxyBase}/api/meroshare/dp-list`);
      const text = await res.text().catch(() => '');
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new Error('Server returned invalid response format.');
      }

      if (res.ok && data.success && Array.isArray(data.data)) {
        setDpList(data.data);
      }
    } catch (err) {
      // If native, try CDSC directly
      if (isNative) {
        try {
          const res = await fetch('https://webbackend.cdsc.com.np/api/meroShare/capital/');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) setDpList(data);
          }
        } catch (_) {}
      }
      console.warn('[AccountManager] Using fallback DP list:', err.message);
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name || boid.length !== 16 || !username || !password || !crn || String(pin).length !== 4 || !dpCode) {
      setError('Please fill in all fields correctly. BOID must be 16 digits, ASBA PIN must be 4 digits.');
      return;
    }

    setIsSaving(true);
    const selectedDp = dpList.find(dp => dp.code === dpCode) || MEROSHARE_DP_LIST.find(dp => dp.code === dpCode) || { id: '128', name: 'Capital DP', code: dpCode };
    const dpId = selectedDp.id || '128';
    const dpName = selectedDp.name || 'Capital DP';

    const newAccount = {
      id: Date.now().toString(),
      name,
      boid,
      username,
      dpCode,
      dpId,
      dpName,
      password,
      crn,
      pin: String(pin),
      holdings: [],
      lastSyncedAt: null
    };

    try {
      // Always save to localStorage first (works on native + web)
      const existing = loadLocalAccounts();
      const filtered = existing.filter(a => a.boid !== boid);
      const updated = [...filtered, newAccount];
      saveLocalAccounts(updated);
      setAccounts(updated);

      // Also sync with Portfolio tab profiles
      try {
        const profileKey = `nepse_hub_${userId}_profiles`;
        const saved = localStorage.getItem(profileKey) || '[]';
        const existingProfiles = JSON.parse(saved);
        const updatedProfiles = [...existingProfiles.filter(p => p.boid !== boid), newAccount];
        localStorage.setItem(profileKey, JSON.stringify(updatedProfiles));
        window.dispatchEvent(new StorageEvent('storage', { key: profileKey, newValue: JSON.stringify(updatedProfiles) }));
        window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { key: profileKey, profiles: updatedProfiles } }));
      } catch (localErr) {
        console.warn('[AccountManager Sync]:', localErr.message);
      }

      setSuccess('Account saved successfully! Auto-syncing live portfolio...');
      setName(''); setBoid(''); setUsername(''); setDpCode('');
      setDpSearch(''); setPassword(''); setCrn(''); setPin('');
      setShowAddForm(false);

      // Automatically pull live portfolio right away
      handleSyncAccountPortfolio(newAccount);

    } catch (err) {
      setError(err.message || 'Failed to save account.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncAccountPortfolio = async (acc) => {
    setSyncingId(acc.id);
    setError('');
    setSuccess('');

    try {
      const result = await pullMeroShareLivePortfolio(acc);
      if (result.success) {
        const parsedHoldings = sanitizeMeroShareHoldings(result.holdings || []);

        const updatedAccount = {
          ...acc,
          name: (result.name && result.name !== 'Unknown') ? result.name : acc.name,
          holdings: parsedHoldings,
          lastSyncedAt: Date.now()
        };

        // Update bulk accounts
        const existing = loadLocalAccounts();
        const updatedAccounts = existing.map(a => a.id === acc.id ? updatedAccount : a);
        saveLocalAccounts(updatedAccounts);
        setAccounts(updatedAccounts);

        // Update profiles
        const profileKey = `nepse_hub_${userId}_profiles`;
        const saved = localStorage.getItem(profileKey) || '[]';
        const existingProfiles = JSON.parse(saved);
        const updatedProfiles = existingProfiles.map(p => p.boid === acc.boid || p.id === acc.id ? updatedAccount : p);
        localStorage.setItem(profileKey, JSON.stringify(updatedProfiles));
        window.dispatchEvent(new StorageEvent('storage', { key: profileKey, newValue: JSON.stringify(updatedProfiles) }));
        window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { key: profileKey, profiles: updatedProfiles } }));

        setSuccess(`⚡ Live Portfolio Synced! Retrieved ${parsedHoldings.length} scrips for ${updatedAccount.name}.`);
      } else {
        setError(result.messageEn || result.messageNe || 'Could not fetch portfolio.');
      }
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteAccount = async (id, accName) => {
    if (!window.confirm(`Delete ${accName}'s account? This cannot be undone.`)) return;
    setError('');
    setSuccess('');

    // Remove from localStorage
    const updated = loadLocalAccounts().filter(a => a.id !== id);
    saveLocalAccounts(updated);
    setAccounts(updated);

    // Sync Portfolio profiles — remove the deleted account
    try {
      const profileKey = `nepse_hub_${userId}_profiles`;
      const saved = localStorage.getItem(profileKey);
      if (saved) {
        const acc = accounts.find(a => a.id === id);
        if (acc) {
          const existing = JSON.parse(saved);
          const filtered = existing.filter(p => p.boid !== acc.boid);
          localStorage.setItem(profileKey, JSON.stringify(filtered));
          window.dispatchEvent(new StorageEvent('storage', { key: profileKey, newValue: JSON.stringify(filtered) }));
          window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { key: profileKey, profiles: filtered } }));
        }
      }
    } catch (_) {}

    setSuccess('Account deleted.');
  };

  const filteredDpList = dpList.filter(dp =>
    dp.name.toLowerCase().includes(dpSearch.toLowerCase()) ||
    (dp.code && dp.code.includes(dpSearch))
  );

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Info */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff', margin: 0, fontSize: 18, fontWeight: 800 }}>
          <ShieldCheck style={{ width: 22, height: 22, color: 'var(--bull)' }} /> Bulk MeroShare Account Vault
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          Register multiple family MeroShare credentials. Stored securely on this device for automated 1-click live portfolio pulling, bulk IPO apply, and allotment checks.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '12px 0', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}
          >
            <Plus style={{ width: 18, height: 18 }} /> {showAddForm ? 'Close Form' : 'Register New MeroShare Account'}
          </button>
          <button
            onClick={fetchAccounts}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', fontSize: 14 }}
          >
            <RefreshCw style={{ width: 16, height: 16 }} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="card fade-in" style={{ borderColor: 'rgba(245,69,92,0.4)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', padding: 14, display: 'flex', gap: 10, alignItems: 'center', borderRadius: 'var(--radius-md)' }}>
          <AlertCircle style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{error}</span>
        </div>
      )}
      {success && (
        <div className="card fade-in" style={{ borderColor: 'rgba(16,217,138,0.4)', background: 'rgba(16,217,138,0.12)', color: 'var(--bull)', padding: 14, display: 'flex', gap: 10, alignItems: 'center', borderRadius: 'var(--radius-md)' }}>
          <CheckCircle2 style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{success}</span>
        </div>
      )}

      {/* Add Account Form */}
      {showAddForm && (
        <form onSubmit={handleAddAccount} className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14, borderColor: 'rgba(255,255,255,0.15)' }}>
          <h4 style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary-light)', margin: '0 0 4px 0' }}>Register MeroShare Credentials</h4>

          <div>
            <label className="input-label" style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Account Holder Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Ram Bahadur Shrestha" className="input"
              style={{ padding: '12px 14px', fontSize: 15, fontWeight: 600, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }} required />
          </div>

          <div>
            <label className="input-label" style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Demat BOID (16 Digits)</label>
            <input type="text" maxLength="16" value={boid}
              onChange={e => setBoid(e.target.value.replace(/\D/g, '').substring(0, 16))}
              placeholder="e.g. 1301060000123456" className="input"
              style={{ padding: '12px 14px', fontSize: 15, fontWeight: 700, color: '#93c5fd', fontFamily: 'var(--font-mono)', background: '#0b1120', border: '1.5px solid #334155' }} required />
          </div>

          <div>
            <label className="input-label" style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Capital Depository Participant (DP)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="text" value={dpSearch} onChange={e => setDpSearch(e.target.value)}
                placeholder="Type to search Capital (e.g. NIMB, Global, ABC)..." className="input"
                style={{ padding: '10px 12px', fontSize: 14, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }} />
              <select value={dpCode} onChange={e => setDpCode(e.target.value)}
                className="select-input" style={{ padding: '12px 14px', fontSize: 15, fontWeight: 700, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }} required>
                <option value="">-- Choose Capital DP --</option>
                {filteredDpList.map(dp => (
                  <option key={dp.code} value={dp.code}>{dp.name} ({dp.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="input-label" style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="MeroShare Username" className="input"
                style={{ padding: '12px 14px', fontSize: 15, fontWeight: 600, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }} required />
            </div>
            <div>
              <label className="input-label" style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" className="input"
                style={{ padding: '12px 14px', fontSize: 15, fontWeight: 600, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="input-label" style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>CRN Number</label>
              <input type="text" value={crn} onChange={e => setCrn(e.target.value)}
                placeholder="C-12345" className="input"
                style={{ padding: '12px 14px', fontSize: 15, fontWeight: 600, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }} required />
            </div>
            <div>
              <label className="input-label" style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Transaction PIN (4 digits)</label>
              <input type="password" maxLength="4" value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').substring(0, 4))}
                placeholder="1234" className="input"
                style={{ padding: '12px 14px', fontSize: 15, fontWeight: 600, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }} required />
            </div>
          </div>

          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13, color: 'var(--accent-amber)', lineHeight: 1.5 }}>
            🔒 Credentials are encrypted locally on this device only and connect directly to CDSC without passing through third-party servers.
          </div>

          <button type="submit" disabled={isSaving} className="btn-primary"
            style={{ width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save & Sync MeroShare Account 🚀'}
          </button>
        </form>
      )}

      {/* Account List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 700 }}>Connecting to vault...</span>
        </div>
      ) : accounts.length === 0 ? (
        <div className="card" style={{ border: '1px dashed var(--border)', textAlign: 'center', padding: '36px 16px' }}>
          <User style={{ width: 36, height: 36, color: 'var(--text-secondary)', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>No MeroShare Accounts Saved Yet</div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 360, margin: '6px auto 0' }}>
            Add your MeroShare profiles to automatically pull real-time DEMAT stock holdings and enable 1-click bulk IPO actions.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 className="section-title" style={{ fontSize: 17, fontWeight: 800, color: '#ffffff' }}>Registered Family Accounts ({accounts.length})</h4>
          {accounts.map(acc => {
            const hasHoldings = acc.holdings && acc.holdings.length > 0;
            const isSyncing = syncingId === acc.id;

            return (
              <div key={acc.id} className="card"
                style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff' }}>{acc.name}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#93c5fd', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      BOID: {acc.boid}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {acc.dpName} • @{acc.username}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteAccount(acc.id, acc.name)}
                    className="icon-btn" style={{ border: 'none', background: 'transparent', flexShrink: 0, padding: 6 }}>
                    <Trash2 style={{ width: 18, height: 18, color: 'var(--bear)' }} />
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, marginTop: 2 }}>
                  <div style={{ fontSize: 13, color: hasHoldings ? 'var(--bull)' : 'var(--text-secondary)', fontWeight: 700 }}>
                    {hasHoldings ? `📊 ${acc.holdings.length} Scrips Synced` : '⚪ No portfolio synced yet'}
                  </div>
                  <button
                    onClick={() => handleSyncAccountPortfolio(acc)}
                    disabled={isSyncing}
                    className="btn-primary"
                    style={{ padding: '8px 14px', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 'var(--radius-sm)' }}
                  >
                    {isSyncing ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Sparkles style={{ width: 14, height: 14 }} />}
                    {isSyncing ? 'Pulling...' : 'Pull Live Portfolio'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

