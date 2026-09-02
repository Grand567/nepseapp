import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Wallet, ShieldCheck, Layers,
  LayoutGrid, BrainCircuit, BookOpen,
  BarChart3, Wifi, WifiOff, Clock, LogOut, User, Settings, Cpu, RefreshCw
} from 'lucide-react';
import Dashboard      from './components/Dashboard';
import Portfolio      from './components/Portfolio';
import MeroShareHub   from './components/MeroShareHub';
import { ErrorBoundary } from './components/ErrorBoundary';
import ServicesHub    from './components/ServicesHub';
import Calculator     from './components/Calculator';
import AiAnalyst      from './components/AiAnalyst';
import Resources      from './components/Resources';
import LoginScreen    from './components/LoginScreen';
import TestSuite      from './components/TestSuite';
import StockDetailModal from './components/StockDetailModal';
import { NavigationProvider, useNavigation } from './context/NavigationContext';

import { fetchLiveMarketData, calculateIndices, fetchMarketStatus, mergeWithMockData, fetchMarketIndices, getLastMarketSyncTime, getCachedIndices, getCachedStocks, saveCachedStocks } from './utils/liveData';
import { initializeMarket } from './utils/mockData';
import { onAuthChange, signOut, checkRedirectResult, fetchUserDataFromCloud, syncUserDataToCloud } from './utils/firebase';

const defaultMockStocks = initializeMarket();
const defaultIndices = getCachedIndices() || calculateIndices(defaultMockStocks);
// Use last real closing/live data as initial stocks if available; otherwise fall back to generated mock
const _cachedStocks = getCachedStocks();
const initialStocks = (_cachedStocks && _cachedStocks.length > 0) ? _cachedStocks : defaultMockStocks;

export default function App() {
  return (
    <NavigationProvider>
      <AppInner />
    </NavigationProvider>
  );
}

function AppInner() {
  const { activeTab, setActiveTab, selectedStock, closeStockDetail, openStockDetail } = useNavigation();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [marketTrend, setMarketTrend] = useState('flat');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // ── Accessibility & Font Scale State for Weak Eyesight ──
  const [fontScale, setFontScale] = useState(() => localStorage.getItem('nepse_font_scale') || 'normal');
  const [showFontModal, setShowFontModal] = useState(false);

  useEffect(() => {
    document.body.className = `font-scale-${fontScale}`;
    localStorage.setItem('nepse_font_scale', fontScale);
  }, [fontScale]);

  // ── Auth state ──
  const [user,         setUser]         = useState(undefined); // undefined = checking, null = logged out, object = logged in
  const [showUserMenu, setShowUserMenu] = useState(false);

  // ── Market data state ──
  const [stocks,       setStocks]       = useState(initialStocks);
  const [indices,      setIndices]      = useState(defaultIndices);
  // 'live' | 'closing' | 'yesterday' | 'offline'
  // 'yesterday' = real data from last session shown while current fetch is pending
  const [apiStatus,    setApiStatus]    = useState(
    (_cachedStocks && _cachedStocks.length > 0) ? 'yesterday' : 'offline'
  );
  const [marketStatus, setMarketStatus] = useState({ isOpen: false, nptTime: '', message: 'Loading...' });

  // Store the base mock data so we don't recreate it
  const mockStocksRef = useRef(defaultMockStocks);

  // ── Listen for Firebase auth state changes & sync cloud user profiles ──
  useEffect(() => {
    // Check if returning from a mobile OAuth redirect
    checkRedirectResult().then(redirectUser => {
      if (redirectUser) setUser(redirectUser);
    }).catch(console.error);

    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser); // null if signed out

      // ── Broad Migration & Cloud Synchronization Sequence ──
      if (firebaseUser && firebaseUser.uid) {
        const uid = firebaseUser.uid;
        const email = firebaseUser.email || '';
        const userTxKey      = `nepse_hub_${uid}_transactions`;
        const userProfileKey = `nepse_hub_${uid}_profiles`;
        const bulkAccountsKey = 'nepse_hub_bulk_ipo_accounts';

        console.log(`[Firebase Sync] Active User (${email || uid}) logged in. Starting cloud restoration...`);

        // 1. Fetch cloud backups from Firestore
        let cloudProfiles = null;
        let cloudTransactions = null;
        let cloudBulkAccounts = null;
        let cloudWatchlist = null;
        let cloudTradeNotes = null;
        let cloudStockAlerts = null;
        let cloudTradeJournal = null;
        let cloudPaperTrading = null;
        let cloudCredentials = null;

        try {
          const cloudData = await fetchUserDataFromCloud(uid, email);
          if (cloudData) {
            if (Array.isArray(cloudData.profiles)) cloudProfiles = cloudData.profiles;
            if (Array.isArray(cloudData.transactions)) cloudTransactions = cloudData.transactions;
            if (Array.isArray(cloudData.bulkAccounts)) cloudBulkAccounts = cloudData.bulkAccounts;
            if (Array.isArray(cloudData.watchlist)) cloudWatchlist = cloudData.watchlist;
            if (Array.isArray(cloudData.tradeNotes)) cloudTradeNotes = cloudData.tradeNotes;
            if (Array.isArray(cloudData.stockAlerts)) cloudStockAlerts = cloudData.stockAlerts;
            if (Array.isArray(cloudData.tradeJournal)) cloudTradeJournal = cloudData.tradeJournal;
            if (cloudData.paperTrading) cloudPaperTrading = cloudData.paperTrading;
            if (Array.isArray(cloudData.credentials)) cloudCredentials = cloudData.credentials;

            console.log(`[Firebase Sync] Cloud data fetched for ${email || uid}.`);
          }
        } catch (e) {
          console.warn('[Firebase Sync] Failed to fetch cloud data:', e.message);
        }

        // 2. Restore Bulk MeroShare Accounts
        const existingBulkRaw = localStorage.getItem(bulkAccountsKey);
        let existingBulk = [];
        try { existingBulk = existingBulkRaw ? JSON.parse(existingBulkRaw) : []; } catch (_) {}
        const mergedBulk = [...existingBulk];

        if (cloudBulkAccounts && Array.isArray(cloudBulkAccounts)) {
          cloudBulkAccounts.forEach(cb => {
            const idx = mergedBulk.findIndex(mb => mb.boid === cb.boid || mb.id === cb.id);
            if (idx === -1) {
              mergedBulk.push(cb);
            } else if (cb.holdings?.length > 0 && (!mergedBulk[idx].holdings || mergedBulk[idx].holdings.length === 0)) {
              mergedBulk[idx] = { ...mergedBulk[idx], ...cb };
            }
          });
        }
        if (cloudProfiles && Array.isArray(cloudProfiles)) {
          cloudProfiles.forEach(cp => {
            const idx = mergedBulk.findIndex(mb => mb.boid === cp.boid || mb.id === cp.id);
            if (idx === -1) {
              mergedBulk.push(cp);
            }
          });
        }
        localStorage.setItem(bulkAccountsKey, JSON.stringify(mergedBulk));

        // 3. Sync MeroShare Profiles for this specific user ID
        const existingProfilesRaw = localStorage.getItem(userProfileKey);
        let existingProfiles = [];
        try { existingProfiles = existingProfilesRaw ? JSON.parse(existingProfilesRaw) : []; } catch (_) {}
        const mergedProfiles = [...existingProfiles];

        if (cloudProfiles && Array.isArray(cloudProfiles)) {
          cloudProfiles.forEach(cp => {
            const idx = mergedProfiles.findIndex(mp => mp.boid === cp.boid || mp.id === cp.id);
            if (idx === -1) {
              mergedProfiles.push(cp);
            } else if (cp.holdings?.length > 0 && (!mergedProfiles[idx].holdings || mergedProfiles[idx].holdings.length === 0)) {
              mergedProfiles[idx] = { ...mergedProfiles[idx], ...cp };
            }
          });
        }

        mergedBulk.forEach(mb => {
          const idx = mergedProfiles.findIndex(mp => mp.boid === mb.boid || mp.id === mb.id);
          if (idx === -1) {
            mergedProfiles.push(mb);
          }
        });

        // Save merged profiles locally
        localStorage.setItem(userProfileKey, JSON.stringify(mergedProfiles));
        window.dispatchEvent(new StorageEvent('storage', { key: userProfileKey, newValue: JSON.stringify(mergedProfiles) }));
        window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { key: userProfileKey, profiles: mergedProfiles } }));

        // 4. Sync Demat Holdings Transactions
        const existingTxsRaw = localStorage.getItem(userTxKey);
        let existingTxs = [];
        try { existingTxs = existingTxsRaw ? JSON.parse(existingTxsRaw) : []; } catch (_) {}
        const mergedTxs = [...existingTxs];

        if (cloudTransactions && Array.isArray(cloudTransactions)) {
          cloudTransactions.forEach(ct => {
            if (!mergedTxs.find(mt => mt.id === ct.id)) {
              mergedTxs.push(ct);
            }
          });
        }
        localStorage.setItem(userTxKey, JSON.stringify(mergedTxs));
        window.dispatchEvent(new StorageEvent('storage', { key: userTxKey, newValue: JSON.stringify(mergedTxs) }));

        // 5. Restore Watchlist
        if (cloudWatchlist && Array.isArray(cloudWatchlist)) {
          localStorage.setItem('nepse_user_watchlist', JSON.stringify(cloudWatchlist));
        }

        // 6. Restore Trade Notes
        if (cloudTradeNotes && Array.isArray(cloudTradeNotes)) {
          localStorage.setItem('nepse_trade_notes', JSON.stringify(cloudTradeNotes));
        }

        // 7. Restore Stock Alerts
        if (cloudStockAlerts && Array.isArray(cloudStockAlerts)) {
          localStorage.setItem('nepse_stock_alerts', JSON.stringify(cloudStockAlerts));
        }

        // 8. Restore Trade Journal
        if (cloudTradeJournal && Array.isArray(cloudTradeJournal)) {
          localStorage.setItem('nepse_trade_journal', JSON.stringify(cloudTradeJournal));
        }

        // 9. Restore Paper Trading Simulator State
        if (cloudPaperTrading) {
          if (cloudPaperTrading.balance !== undefined) localStorage.setItem('nepse_paper_balance', cloudPaperTrading.balance.toString());
          if (cloudPaperTrading.positions) localStorage.setItem('nepse_paper_positions', JSON.stringify(cloudPaperTrading.positions));
          if (cloudPaperTrading.orders) localStorage.setItem('nepse_paper_orders', JSON.stringify(cloudPaperTrading.orders));
        }

        // 10. Restore Credentials Vault
        if (cloudCredentials && Array.isArray(cloudCredentials)) {
          localStorage.setItem('nepse_credentials_vault', JSON.stringify(cloudCredentials));
        }

        // 11. Push comprehensive multi-device backup to Firestore
        try {
          const currentWatchlist = JSON.parse(localStorage.getItem('nepse_user_watchlist') || '[]');
          const currentNotes = JSON.parse(localStorage.getItem('nepse_trade_notes') || '[]');
          const currentAlerts = JSON.parse(localStorage.getItem('nepse_stock_alerts') || '[]');
          const currentJournal = JSON.parse(localStorage.getItem('nepse_trade_journal') || '[]');
          const currentPaperBal = parseFloat(localStorage.getItem('nepse_paper_balance') || '1000000');
          const currentPaperPos = JSON.parse(localStorage.getItem('nepse_paper_positions') || '[]');
          const currentPaperOrd = JSON.parse(localStorage.getItem('nepse_paper_orders') || '[]');
          const currentCreds = JSON.parse(localStorage.getItem('nepse_credentials_vault') || '[]');

          await syncUserDataToCloud(uid, {
            profiles: mergedProfiles,
            transactions: mergedTxs,
            bulkAccounts: mergedBulk,
            watchlist: currentWatchlist,
            tradeNotes: currentNotes,
            stockAlerts: currentAlerts,
            tradeJournal: currentJournal,
            paperTrading: {
              balance: currentPaperBal,
              positions: currentPaperPos,
              orders: currentPaperOrd
            },
            credentials: currentCreds
          }, email);

          console.log(`[Firebase Sync] Cloud restoration & sync complete for Gmail account: ${email || uid}.`);
        } catch (syncErr) {
          console.warn('[Firebase Sync] Realtime cloud backup push failed:', syncErr.message);
        }
      }
    });
    return unsubscribe;
  }, []);

  // ── Market data fetching (only when logged in) ──
  useEffect(() => {
    if (!user) return; // Don't fetch if not logged in
    let isMounted = true;

    const fetchMarket = async () => {
      const statusObj = await fetchMarketStatus();
      if (isMounted && statusObj) setMarketStatus(statusObj);

      const [response, liveIndices] = await Promise.all([
        fetchLiveMarketData(),
        fetchMarketIndices()
      ]);

      if (!isMounted) return;

      let currentStocks = stocks;
      let hasFreshData = false;

      // 1. Process Stock Data if available
      if (response && response.data && response.data.length > 0) {
        currentStocks = mergeWithMockData(response.data, mockStocksRef.current);
        setStocks(currentStocks);
        setApiStatus(response.source === 'live' ? 'live' : 'closing');
        saveCachedStocks(currentStocks); // persist for next session as "yesterday's data"
        hasFreshData = true;
      }

      // 2. Process Indices — always prioritize live exchange index or calculate real-time weighted index from live stocks
      if (liveIndices && liveIndices.nepse && liveIndices.nepse.value > 0 && liveIndices.nepse.change !== 0) {
        setIndices(liveIndices);
        hasFreshData = true;
      } else if (currentStocks && currentStocks.length > 0) {
        setIndices(calculateIndices(currentStocks));
        hasFreshData = true;
      } else if (liveIndices && liveIndices.nepse && liveIndices.nepse.value > 0) {
        setIndices(liveIndices);
        hasFreshData = true;
      }

      if (hasFreshData) {
        setLastSyncTime(new Date());
      }
    };

    fetchMarket();
    const id = setInterval(fetchMarket, 20000);

    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [user]); // Re-run when user logs in/out

  const triggerTick = async () => {
    setIsRefreshing(true);
    try {
      const [statusObj, response, liveIndices] = await Promise.all([
        fetchMarketStatus(),
        fetchLiveMarketData(),
        fetchMarketIndices()
      ]);
      if (statusObj) setMarketStatus(statusObj);

      let currentStocks = stocks;
      let hasFreshData = false;

      if (response && response.data && response.data.length > 0) {
        currentStocks = mergeWithMockData(response.data, mockStocksRef.current);
        setStocks(currentStocks);
        setApiStatus(response.source === 'live' ? 'live' : 'closing');
        saveCachedStocks(currentStocks); // persist for next session as "yesterday's data"
        hasFreshData = true;
      }

      // Process Indices in manual refresh
      if (liveIndices && liveIndices.nepse && liveIndices.nepse.value > 0 && liveIndices.nepse.change !== 0) {
        setIndices(liveIndices);
        hasFreshData = true;
      } else if (currentStocks && currentStocks.length > 0) {
        setIndices(calculateIndices(currentStocks));
        hasFreshData = true;
      } else if (liveIndices && liveIndices.nepse && liveIndices.nepse.value > 0) {
        setIndices(liveIndices);
        hasFreshData = true;
      }



      if (hasFreshData) {
        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.warn('[NEPSE] Manual refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    setShowUserMenu(false);
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    localStorage.removeItem('nepse_hub_local_session');
    setUser(null); // Explicitly clear React state instantly
    // Reset market state for next login
    mockStocksRef.current = defaultMockStocks;
    setStocks(defaultMockStocks);
    setIndices(defaultIndices);
    setApiStatus('offline');
    setActiveTab('dashboard');
  };

  // ── Auth checking splash ──
  if (user === undefined) {
    return (
      <div className="loading-screen">
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, #5b5ef4, #a855f7)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 40px rgba(91,94,244,0.4)'
          }}>
            <BarChart3 style={{ width: 28, height: 28, color: '#fff' }} />
          </div>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.01em' }}>
            Checking session…
          </div>
        </div>
      </div>
    );
  }

  // ── Show Login screen if not authenticated ──
  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  const nepseChange = indices.nepse.change;

  // ── User avatar: photo or initial letter ──
  const renderAvatar = (size = 28) => {
    if (user.photoURL) {
      return (
        <img
          src={user.photoURL}
          alt={user.displayName || 'User'}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(91,94,244,0.4)' }}
          referrerPolicy="no-referrer"
        />
      );
    }
    const initial = (user.displayName || user.email || 'G').charAt(0).toUpperCase();
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #5b5ef4, #a855f7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, fontWeight: 800, color: '#fff',
        border: '2px solid rgba(91,94,244,0.4)',
      }}>
        {initial}
      </div>
    );
  };

  return (
    <div className="app-container">

      {/* ── Header ── */}
      <header className="header-bar">
        <div className="header-logo-wrap">
          <div className="header-logo-icon" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="logo.png" alt="Drabyashree Nepse Hub" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div className="header-title">Drabyashree</div>
            <div className="header-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: nepseChange >= 0 ? 'var(--bull)' : 'var(--bear)', fontWeight: 800 }}>
                {indices.nepse.value}&nbsp;
                {nepseChange >= 0 ? '▲' : '▼'}{Math.abs(indices.nepse.pChange)}%
              </span>
              &nbsp;·&nbsp;
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: marketStatus.isOpen ? 'var(--bull)' : 'var(--text-muted)' }}>
                <Clock style={{ width: 10, height: 10 }} />
                {marketStatus.isOpen ? 'Open' : 'Closed'} {marketStatus.nptTime && `(${marketStatus.nptTime})`}
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions">
          {/* Refresh Live Data Button */}
          <button
            id="btn-refresh-market"
            className="icon-btn"
            onClick={triggerTick}
            disabled={isRefreshing}
            title="Refresh Live NEPSE Data (ताजा डेटा अपडेट)"
            style={{
              padding: '0 8px',
              height: 32,
              background: isRefreshing ? 'rgba(91,94,244,0.2)' : 'rgba(255,255,255,0.04)',
              borderColor: isRefreshing ? 'var(--primary-light)' : 'var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: isRefreshing ? 'wait' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <RefreshCw style={{ width: 14, height: 14, color: isRefreshing ? 'var(--primary-light)' : 'var(--text-primary)', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: isRefreshing ? 'var(--primary-light)' : 'var(--text-primary)' }}>
              {isRefreshing ? 'Updating…' : 'Refresh'}
            </span>
          </button>

          {/* API Status dot */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px',
            borderRadius: 50,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.03)',
          }}>
            {apiStatus === 'live'
              ? <Wifi style={{ width: 12, height: 12, color: 'var(--bull)' }} />
              : apiStatus === 'closing'
              ? <Clock style={{ width: 12, height: 12, color: 'var(--accent-cyan)' }} />
              : apiStatus === 'yesterday'
              ? <Clock style={{ width: 12, height: 12, color: 'var(--accent-amber)' }} />
              : <WifiOff style={{ width: 12, height: 12, color: 'var(--accent-amber)' }} />
            }
            <span style={{ fontSize: 10, fontWeight: 700,
              color: apiStatus === 'live' ? 'var(--bull)'
                   : apiStatus === 'closing' ? 'var(--accent-cyan)'
                   : 'var(--accent-amber)' }}>
              {apiStatus === 'live' ? 'Live' : apiStatus === 'closing' ? 'Closing' : apiStatus === 'yesterday' ? 'Yesterday' : 'Offline'}
            </span>
          </div>

          {/* Text Size / Accessibility Font Enlarger for Weak Eyesight */}
          <button
            id="btn-font-size"
            className={`icon-btn ${showFontModal ? 'active' : ''}`}
            onClick={() => setShowFontModal(v => !v)}
            title="Enlarge Font for Weak Eyesight"
            style={{ 
              fontWeight: 900, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 3, 
              padding: '0 8px', 
              width: 'auto',
              background: fontScale !== 'normal' ? 'rgba(79,70,229,0.18)' : 'rgba(255,255,255,0.04)',
              borderColor: fontScale !== 'normal' ? 'var(--primary-light)' : 'var(--border)'
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 900, color: '#ffffff' }}>A</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary-light)' }}>
              {fontScale === 'huge' ? '+++' : fontScale === 'xlarge' ? '++' : fontScale === 'large' ? '+' : ''}
            </span>
          </button>

          {/* Resources button */}
          <button
            className={`icon-btn ${activeTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveTab('resources')}
            title="Resources & Guides"
          >
            <BookOpen style={{ width: 15, height: 15 }} />
          </button>

          {/* User avatar + menu */}
          <div style={{ position: 'relative' }}>
            <button
              id="btn-user-avatar"
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, display: 'flex', alignItems: 'center',
              }}
              title={user.displayName || user.email || 'Guest'}
            >
              {renderAvatar(28)}
            </button>

            {/* Dropdown menu */}
            {showUserMenu && (
              <>
                {/* backdrop */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                  onClick={() => setShowUserMenu(false)}
                />
                <div style={{
                  position: 'absolute', top: 36, right: 0, zIndex: 200,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                  minWidth: 220, padding: '8px 0',
                }}>
                  {/* User info */}
                  <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {renderAvatar(36)}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                          {user.displayName || 'Guest User'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {user.email || 'Local storage only'}
                        </div>
                        {user.isGuest && (
                          <div style={{ fontSize: 9, color: 'var(--accent-amber)', fontWeight: 700, marginTop: 2 }}>
                            GUEST MODE
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Font Size Accessibility Setting */}
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowFontModal(true);
                    }}
                    style={{
                      width: '100%', padding: '10px 16px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
                      textAlign: 'left',
                      borderBottom: '1px solid var(--border)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span>👓 Text Size (कमजोर आँखा)</span>
                    <span style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(79,70,229,0.2)', color: 'var(--primary-light)', borderRadius: 4, fontWeight: 800 }}>
                      {fontScale.toUpperCase()}
                    </span>
                  </button>

                  {/* System Diagnostics */}
                  <button
                    id="btn-diagnostics"
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowDiagnostics(true);
                    }}
                    style={{
                      width: '100%', padding: '10px 16px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      color: 'var(--primary-light)', fontSize: 13, fontWeight: 600,
                      textAlign: 'left',
                      borderBottom: '1px solid var(--border)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(91,94,244,0.07)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <Cpu style={{ width: 14, height: 14 }} />
                    Diagnostics Sandbox
                  </button>

                  {/* Sign out */}
                  <button
                    id="btn-sign-out"
                    onClick={handleSignOut}
                    style={{
                      width: '100%', padding: '10px 16px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      color: 'var(--bear)', fontSize: 13, fontWeight: 600,
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,69,92,0.07)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <LogOut style={{ width: 14, height: 14 }} />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Font Size / Readability Accessibility Modal ── */}
      {showFontModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card fade-in" style={{ width: '100%', maxWidth: 440, background: '#0f172a', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-lg)', padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                👓 Text Size for Weak Eyesight
              </h3>
              <button 
                onClick={() => setShowFontModal(false)} 
                className="icon-btn" 
                style={{ border: 'none', background: 'transparent' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Select your preferred font magnification level. All scrip prices, portfolio numbers, and IPO text will automatically enlarge across the entire app.
            </p>

            {/* Font scale options */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { id: 'normal', label: 'Normal (100%)', desc: 'Standard view', badge: 'Default' },
                { id: 'large', label: 'Large (120%)', desc: 'Comfortable reading', badge: '👓 Recommended' },
                { id: 'xlarge', label: 'Extra Large (140%)', desc: 'Weak eyesight', badge: '🔍 Clear' },
                { id: 'huge', label: 'Ultra Large (160%)', desc: 'Maximum size', badge: '🌟 Big' }
              ].map(opt => {
                const isSelected = fontScale === opt.id;
                return (
                  <div 
                    key={opt.id}
                    onClick={() => setFontScale(opt.id)}
                    style={{
                      padding: 12,
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'rgba(79,70,229,0.2)' : 'rgba(255,255,255,0.03)',
                      border: isSelected ? '2px solid var(--primary-light)' : '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      transition: 'var(--transition)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: isSelected ? '#ffffff' : 'var(--text-secondary)' }}>{opt.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{opt.desc}</div>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: isSelected ? 'var(--primary-light)' : 'var(--accent-amber)', marginTop: 2 }}>{opt.badge}</span>
                  </div>
                );
              })}
            </div>

            {/* Live Preview Box */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>LIVE PREVIEW (प्रत्यक्ष झलक):</div>
              <div style={{ fontSize: fontScale === 'huge' ? 22 : fontScale === 'xlarge' ? 19 : fontScale === 'large' ? 17 : 15, fontWeight: 800, color: '#ffffff', lineHeight: 1.4 }}>
                नेप्से परिसूचक: २,७५४.३० ▲ +१.४५%
              </div>
              <div style={{ fontSize: fontScale === 'huge' ? 18 : fontScale === 'xlarge' ? 16 : fontScale === 'large' ? 14.5 : 13, color: 'var(--bull)', fontWeight: 700, marginTop: 4 }}>
                🎉 १० कित्ता शेयर सफलतापूर्वक परेको छ (Allotted 10 Units)
              </div>
            </div>

            <button 
              onClick={() => setShowFontModal(false)}
              className="btn-primary"
              style={{ width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 800, borderRadius: 'var(--radius-md)' }}
            >
              Apply & Save Preference ✓
            </button>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}>
        <ErrorBoundary>
          <div style={{ flex: 1 }}>
            {activeTab === 'dashboard'  && (
              <Dashboard
                stocks={stocks}
                indices={indices}
                onRefresh={triggerTick}
                isRefreshing={isRefreshing}
                triggerTick={triggerTick}
                apiStatus={apiStatus}
                marketStatus={marketStatus}
                lastSyncTime={lastSyncTime}
                onSelectStock={openStockDetail}
              />
            )}
            {activeTab === 'portfolio'  && <Portfolio marketStocks={stocks} userId={user.uid} />}
            {activeTab === 'bulk_ipo'   && (
              <MeroShareHub
                userId={user.uid}
                marketStocks={stocks}
                apiStatus={apiStatus}
              />
            )}

          {activeTab === 'services'   && (
            <ServicesHub
              stocks={stocks}
              indices={indices}
              apiStatus={apiStatus}
              userId={user.uid}
              onNavigateTab={setActiveTab}
              onSelectStock={openStockDetail}
            />
          )}
          {activeTab === 'calculator' && <Calculator />}
          {activeTab === 'ai'         && <AiAnalyst marketStocks={stocks} />}
          {activeTab === 'resources'  && <Resources />}

          {/* ── Global ShareHub-Style Stock Detail Modal ── */}
          {selectedStock && (
            <StockDetailModal
              stock={selectedStock}
              allStocks={stocks}
              onClose={closeStockDetail}
            />
          )}
          </div>
        </ErrorBoundary>
        <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Built by <span style={{ fontWeight: 600, color: 'var(--bull)' }}>Rexsh K Suwal, a Computer Engineer</span>
        </div>
      </main>

      {/* ── Bottom Navigation ── */}
      <nav className="bottom-nav">
        {[
          { id: 'dashboard',  icon: LayoutDashboard, label: 'Market' },
          { id: 'portfolio',  icon: Wallet,          label: 'Portfolio' },
          { id: 'bulk_ipo',   icon: Layers,          label: 'Bulk IPO' },
          { id: 'services',   icon: LayoutGrid,      label: 'Services' },
          { id: 'ai',         icon: BrainCircuit,    label: 'Guru AI' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`nav-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* ── System Diagnostics Overlay Modal ── */}
      {showDiagnostics && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(6, 8, 16, 0.95)',
          backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column',
          animation: 'fadeIn 0.3s ease'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', background: 'rgba(255,255,255,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32,
                background: 'linear-gradient(135deg, #5b5ef4, #a855f7)',
                borderRadius: 10, display: 'flex', alignItems: 'center',
                justifyContent: 'center', boxShadow: '0 0 20px rgba(91,94,244,0.3)'
              }}>
                <Cpu style={{ width: 16, height: 16, color: '#fff' }} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>System Verification Console</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Automated diagnostics and market simulation sandbox</div>
              </div>
            </div>
            <button
              onClick={() => setShowDiagnostics(false)}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px', color: 'var(--text-muted)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              Close Console
            </button>
          </div>
          
          {/* Scrollable Body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TestSuite
              marketTrend={marketTrend}
              setMarketTrend={setMarketTrend}
              apiStatus={apiStatus}
              setApiStatus={setApiStatus}
            />
          </div>
        </div>
      )}
    </div>
  );
}
