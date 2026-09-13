import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Wallet, ShieldCheck, Layers,
  LayoutGrid, BrainCircuit, BookOpen, TrendingUp,
  BarChart3, Wifi, WifiOff, Clock, LogOut, User, Settings, Cpu, RefreshCw,
  Calendar, X, Info
} from 'lucide-react';
import Dashboard      from './components/Dashboard';
import Portfolio      from './components/Portfolio';
import MeroShareHub   from './components/MeroShareHub';
import PortfolioHub   from './components/PortfolioHub';
import PredictorHub   from './components/PredictorHub';
import { ErrorBoundary } from './components/ErrorBoundary';
import ServicesHub    from './components/ServicesHub';
import Calculator     from './components/Calculator';
import AiAnalyst      from './components/AiAnalyst';
import Resources      from './components/Resources';
import LoginScreen    from './components/LoginScreen';
import TestSuite      from './components/TestSuite';
import StockDetailModal from './components/StockDetailModal';
import PullToRefresh from './components/PullToRefresh';
import { NavigationProvider, useNavigation, useBackHandler } from './context/NavigationContext';
import { fetchHolidays } from './utils/servicesApi.js';
import { getUpcomingHolidays } from './utils/bikramSambat.js';

import { fetchLiveMarketData, calculateIndices, fetchMarketStatus, fetchMarketIndices, getLastMarketSyncTime, getCachedIndices, getCachedStocks, saveCachedStocks, saveCachedIndices } from './utils/liveData';
import { getDetailedMarketStatus } from './utils/nepseCalendar';
import { MOCK_DATA_DISABLED } from './utils/mockData';
import { onAuthChange, signOut, checkRedirectResult, fetchUserDataFromCloud, syncUserDataToCloud, getLocalSession } from './utils/firebase';

// Real data only - No mock fallback
const _cachedStocks = getCachedStocks() || [];
const initialStocks = _cachedStocks;
const defaultIndices = getCachedIndices() || calculateIndices(initialStocks);

export default function App() {
  return (
    <NavigationProvider>
      <AppInner />
    </NavigationProvider>
  );
}

function AppInner() {
  const { activeTab, setActiveTab, selectedStock, closeStockDetail, openStockDetail, exitToast } = useNavigation();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [marketTrend, setMarketTrend] = useState('flat');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // ── Auth state ──
  const [user,         setUser]         = useState(() => getLocalSession() || undefined); // undefined = checking, null = logged out, object = logged in
  const [showUserMenu, setShowUserMenu] = useState(false);

  // ── Accessibility & Font Scale State for Weak Eyesight ──
  const [fontScale, setFontScale] = useState(() => localStorage.getItem('nepse_font_scale') || 'normal');
  const [showFontModal, setShowFontModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [upcomingHolidaysList, setUpcomingHolidaysList] = useState([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  // Register Back handlers for modals
  useBackHandler(() => {
    setShowDiagnostics(false);
    return true;
  }, showDiagnostics, 50);

  useBackHandler(() => {
    setShowCalendarModal(false);
    return true;
  }, showCalendarModal, 45);

  useBackHandler(() => {
    setShowFontModal(false);
    return true;
  }, showFontModal, 40);

  useBackHandler(() => {
    setShowUserMenu(false);
    return true;
  }, showUserMenu, 30);

  // Load upcoming holidays when calendar modal is opened
  useEffect(() => {
    if (showCalendarModal) {
      setLoadingHolidays(true);
      fetchHolidays(null, null, 15)
        .then(res => {
          if (res?.holidays && Array.isArray(res.holidays) && res.holidays.length > 0) {
            setUpcomingHolidaysList(res.holidays);
          } else {
            setUpcomingHolidaysList(getUpcomingHolidays(new Date(), 15));
          }
        })
        .catch(() => {
          setUpcomingHolidaysList(getUpcomingHolidays(new Date(), 15));
        })
        .finally(() => setLoadingHolidays(false));
    }
  }, [showCalendarModal]);

  useEffect(() => {
    document.body.className = `font-scale-${fontScale}`;
    localStorage.setItem('nepse_font_scale', fontScale);
  }, [fontScale]);

  // Safety timeout: if auth state hasn't resolved within 1.5s, unblock immediately so screen is never stuck
  useEffect(() => {
    const timer = setTimeout(() => {
      setUser(u => u === undefined ? null : u);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // ── Market data state ──
  const [stocks,       setStocks]       = useState(initialStocks);
  const [indices,      setIndices]      = useState(defaultIndices);
  // 'live' | 'closing' | 'yesterday' | 'offline'
  const [apiStatus,    setApiStatus]    = useState(() => {
    const s = getDetailedMarketStatus();
    return s.isOpen ? 'live' : ((_cachedStocks && _cachedStocks.length > 0) ? 'yesterday' : 'offline');
  });
  const [marketStatus, setMarketStatus] = useState(() => getDetailedMarketStatus());
  const [aiTargetStock, setAiTargetStock] = useState(null);

  // Real live data reference
  const liveStocksRef = useRef(initialStocks);

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

        // Also merge any existing accounts created in guest mode or other local keys
        const localCandidateKeys = ['nepse_hub_guest_local_profiles', 'nepse_hub_profiles'];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('nepse_hub_') && k.endsWith('_profiles') && k !== userProfileKey) {
              localCandidateKeys.push(k);
            }
          }
        } catch (_) {}

        localCandidateKeys.forEach(candKey => {
          try {
            const raw = localStorage.getItem(candKey);
            if (!raw) return;
            const parsedList = JSON.parse(raw);
            if (Array.isArray(parsedList)) {
              parsedList.forEach(cp => {
                const idx = mergedProfiles.findIndex(mp => (cp.boid && mp.boid === cp.boid) || (cp.id && mp.id === cp.id));
                if (idx === -1) {
                  mergedProfiles.push(cp);
                }
              });
            }
          } catch (_) {}
        });

        mergedBulk.forEach(mb => {
          const idx = mergedProfiles.findIndex(mp => mp.boid === mb.boid || mp.id === mb.id);
          if (idx === -1) {
            mergedProfiles.push(mb);
          }
        });

        // Save merged profiles locally
        localStorage.setItem(userProfileKey, JSON.stringify(mergedProfiles));
        localStorage.setItem(bulkAccountsKey, JSON.stringify(mergedProfiles));
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

        // Broadcast dedicated custom event so active tabs (Portfolio, MeroShareHub) immediately refresh state
        window.dispatchEvent(new CustomEvent('nepse_cloud_data_restored', {
          detail: {
            uid,
            profiles: mergedProfiles,
            transactions: mergedTxs,
            bulkAccounts: mergedBulk,
            watchlist: cloudWatchlist
          }
        }));

        // 11. Push comprehensive multi-device backup to cloud ONLY if there is real data
        const hasDataToPreserve = mergedProfiles.length > 0 || mergedTxs.length > 0 || mergedBulk.length > 0;
        if (hasDataToPreserve) {
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

            console.log(`[Firebase Sync] Cloud restoration & sync complete for account: ${email || uid}.`);
          } catch (syncErr) {
            console.warn('[Firebase Sync] Realtime cloud backup push failed:', syncErr.message);
          }
        }
      }
    });
    return unsubscribe;
  }, []);

  // ── Market data fetching (Adaptive Polling with Market Hours & Backoff) ──
  useEffect(() => {
    if (!user) return; // Don't fetch if not logged in
    let isMounted = true;
    let timerId = null;
    let consecutiveErrors = 0;

    const scheduleNext = (intervalMs) => {
      if (!isMounted) return;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(fetchMarket, intervalMs);
    };

    const fetchMarket = async () => {
      let isMarketOpen = false;
      let hadError = false;

      try {
        const rawStatus = await fetchMarketStatus();
        const status = (rawStatus?.isOpen !== undefined) ? rawStatus : (rawStatus?.data || rawStatus || getDetailedMarketStatus());
        if (isMounted && status) {
          setMarketStatus(status);
          isMarketOpen = Boolean(status.isOpen);
        }

        const [response, liveIndices] = await Promise.all([
          fetchLiveMarketData(),
          fetchMarketIndices()
        ]);

        if (!isMounted) return;

        let currentStocks = stocks;
        let hasFreshData = false;

        // 1. Process Stock Data if available
        if (response && response.data && response.data.length > 0) {
          // ✅ Real data only, no mock fallback
          currentStocks = response.data;
          liveStocksRef.current = currentStocks;
          setStocks(currentStocks);
          const isLive = Boolean(status?.isOpen);
          setApiStatus(isLive ? 'live' : (response.source === 'closing' ? 'closing' : 'yesterday'));
          saveCachedStocks(currentStocks); // persist for next session as "yesterday's data"
          hasFreshData = true;
        }

        // 2. Process Indices — always prioritize real live exchange index from proxy/market
        if (liveIndices && liveIndices.nepse && Number(liveIndices.nepse.value) > 0) {
          setIndices(liveIndices);
          saveCachedIndices(liveIndices);
          hasFreshData = true;
        } else if (currentStocks && currentStocks.length > 0) {
          setIndices(calculateIndices(currentStocks));
          hasFreshData = true;
        }

        if (hasFreshData) {
          setLastSyncTime(new Date());
          consecutiveErrors = 0;
        }
      } catch (err) {
        hadError = true;
        consecutiveErrors++;
        console.warn('[Adaptive Poller] Sync error (attempt ' + consecutiveErrors + '):', err?.message);
      }

      if (!isMounted) return;

      // Adaptive intervals: 12s during active market trading (Sun-Thu 11am-3pm NPT), 120s when closed
      const baseInterval = isMarketOpen ? 12000 : 120000;
      let nextInterval = baseInterval;
      if (hadError || consecutiveErrors > 0) {
        // Exponential backoff up to 120s on network/server errors
        nextInterval = Math.min(baseInterval * Math.pow(1.8, Math.min(consecutiveErrors, 5)), 120000);
      }

      scheduleNext(nextInterval);
    };

    fetchMarket();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [user]); // Re-run when user logs in/out

  useEffect(() => {
    const doScroll = () => {
      try {
        const mainEl = document.querySelector('main');
        if (mainEl) mainEl.scrollTop = 0;
        const scrollables = document.querySelectorAll('.overflow-y-auto');
        scrollables.forEach(el => { el.scrollTop = 0; });
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      } catch (_) {}
    };
    doScroll();
    requestAnimationFrame(doScroll);
  }, [activeTab]);

  const triggerTick = async () => {
    setIsRefreshing(true);
    try {
      const [rawStatus, response, liveIndices] = await Promise.all([
        fetchMarketStatus(),
        fetchLiveMarketData(),
        fetchMarketIndices()
      ]);
      const status = (rawStatus?.isOpen !== undefined) ? rawStatus : (rawStatus?.data || rawStatus || getDetailedMarketStatus());
      if (status) setMarketStatus(status);

      let currentStocks = stocks;
      let hasFreshData = false;

      if (response && response.data && response.data.length > 0) {
        // ✅ Real data only, no mock fallback
        currentStocks = response.data;
        liveStocksRef.current = currentStocks;
        setStocks(currentStocks);
        const isLive = Boolean(status?.isOpen);
        setApiStatus(isLive ? 'live' : (response.source === 'closing' ? 'closing' : 'yesterday'));
        saveCachedStocks(currentStocks); // persist for next session as "yesterday's data"
        hasFreshData = true;
      }

      // Process Indices in manual refresh
      if (liveIndices && liveIndices.nepse && Number(liveIndices.nepse.value) > 0) {
        setIndices(liveIndices);
        saveCachedIndices(liveIndices);
        hasFreshData = true;
      } else if (currentStocks && currentStocks.length > 0) {
        setIndices(calculateIndices(currentStocks));
        hasFreshData = true;
      }



      if (hasFreshData) {
        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.warn('Manual market refresh failed:', err);
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
    liveStocksRef.current = _cachedStocks;
    setStocks(_cachedStocks);
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

  const nepseChange = indices?.nepse?.change ?? 0;

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
            <div className="header-title">Drabyashree NEPSE</div>
            <div 
              className="header-sub" 
              style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
              onClick={() => setShowCalendarModal(true)}
              title="Click to view NEPSE Calendar & Holidays"
            >
              <span style={{ color: nepseChange >= 0 ? 'var(--bull)' : 'var(--bear)', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {indices?.nepse?.value ?? 2542.77}&nbsp;
                {nepseChange >= 0 ? '▲ +' : '▼ -'}{Math.abs(indices?.nepse?.change != null ? Number(indices.nepse.change) : 4.66).toFixed(2)} pts ({Math.abs(indices?.nepse?.pChange ?? 0.18)}%)
              </span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10.5, fontFamily: 'var(--font-mono)' }} title={marketStatus.bsFormattedEn || ''}>
                {marketStatus.bsFormattedNp || marketStatus.nptTime || '11:00 AM – 3:00 PM'}
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Compact Market Status Indicator Button */}
          {(() => {
            const isLive = Boolean(marketStatus?.isOpen);
            const badgeColor = isLive 
              ? 'var(--bull)' 
              : marketStatus?.isHoliday 
              ? '#c084fc' 
              : marketStatus?.isWeekend 
              ? '#fbbf24' 
              : '#94a3b8';
            const badgeBg = isLive 
              ? 'rgba(16,185,129,0.1)' 
              : marketStatus?.isHoliday 
              ? 'rgba(192,132,252,0.12)' 
              : marketStatus?.isWeekend 
              ? 'rgba(251,191,36,0.12)' 
              : 'rgba(255,255,255,0.03)';
            const badgeBorder = isLive 
              ? 'rgba(16,185,129,0.35)' 
              : marketStatus?.isHoliday 
              ? 'rgba(192,132,252,0.35)' 
              : marketStatus?.isWeekend 
              ? 'rgba(251,191,36,0.35)' 
              : 'var(--border)';
            const label = isLive 
              ? 'LIVE' 
              : marketStatus?.isHoliday 
              ? 'HOLIDAY' 
              : marketStatus?.isWeekend 
              ? 'WEEKEND' 
              : 'CLOSED';

            return (
              <button 
                type="button"
                onClick={() => setShowCalendarModal(true)}
                title={`${marketStatus?.message || label}${marketStatus?.holidayName ? ` (${marketStatus.holidayName})` : ''} — Tap to view NEPSE Calendar & Holidays`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 7px',
                  borderRadius: 20,
                  border: `1px solid ${badgeBorder}`,
                  background: badgeBg,
                  cursor: 'pointer',
                  outline: 'none',
                  flexShrink: 0,
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 5.5,
                  height: 5.5,
                  borderRadius: '50%',
                  background: badgeColor
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  color: badgeColor,
                  letterSpacing: '0.02em'
                }}>
                  {label}
                </span>
              </button>
            );
          })()}

          {/* Refresh Live Data Button */}
          <button
            id="btn-refresh-market"
            className="icon-btn"
            onClick={triggerTick}
            disabled={isRefreshing}
            title="Refresh Live Market Data"
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
            <span className="header-refresh-label" style={{ fontSize: 11, fontWeight: 800, color: isRefreshing ? 'var(--primary-light)' : 'var(--text-primary)' }}>
              {isRefreshing ? '…' : 'Refresh'}
            </span>
          </button>

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

                  {/* Cloud Sync Manual Trigger */}
                  <button
                    id="btn-cloud-sync-now"
                    onClick={async () => {
                      try {
                        const uid = user?.uid || 'local';
                        const email = user?.email || '';
                        const currentWatchlist = JSON.parse(localStorage.getItem('nepse_user_watchlist') || '[]');
                        const userTxKey = `nepse_hub_${uid}_transactions`;
                        const userProfileKey = `nepse_hub_${uid}_profiles`;
                        const bulkKey = 'nepse_hub_bulk_ipo_accounts';

                        // 1. Pull latest remote cloud data
                        let pulledProfiles = [];
                        let pulledTxs = [];
                        let pulledWatchlist = [];
                        try {
                          const cloudData = await fetchUserDataFromCloud(uid, email);
                          if (cloudData) {
                            if (Array.isArray(cloudData.profiles)) pulledProfiles = cloudData.profiles;
                            if (Array.isArray(cloudData.transactions)) pulledTxs = cloudData.transactions;
                            if (Array.isArray(cloudData.watchlist)) pulledWatchlist = cloudData.watchlist;
                          }
                        } catch (_) {}

                        // 2. Merge local and remote
                        const localTxs = JSON.parse(localStorage.getItem(userTxKey) || '[]');
                        const localProfs = JSON.parse(localStorage.getItem(userProfileKey) || '[]');
                        const localBulk = JSON.parse(localStorage.getItem(bulkKey) || '[]');

                        const mergedProfs = [...localProfs];
                        pulledProfiles.forEach(p => {
                          const idx = mergedProfs.findIndex(mp => mp.boid === p.boid || mp.id === p.id);
                          if (idx === -1) mergedProfs.push(p);
                          else if (p.holdings?.length > 0 && (!mergedProfs[idx].holdings || mergedProfs[idx].holdings.length === 0)) {
                            mergedProfs[idx] = { ...mergedProfs[idx], ...p };
                          }
                        });

                        const mergedTxs = [...localTxs];
                        pulledTxs.forEach(t => {
                          if (!mergedTxs.find(mt => mt.id === t.id)) mergedTxs.push(t);
                        });

                        const mergedWatchlist = [...new Set([...currentWatchlist, ...pulledWatchlist])];

                        // 3. Save locally
                        localStorage.setItem(userProfileKey, JSON.stringify(mergedProfs));
                        localStorage.setItem(userTxKey, JSON.stringify(mergedTxs));
                        localStorage.setItem('nepse_user_watchlist', JSON.stringify(mergedWatchlist));

                        // 4. Push combined snapshot to cloud
                        await syncUserDataToCloud(uid, {
                          profiles: mergedProfs,
                          transactions: mergedTxs,
                          bulkAccounts: localBulk,
                          watchlist: mergedWatchlist
                        }, email);

                        // 5. Notify UI components to refresh
                        window.dispatchEvent(new CustomEvent('nepse_cloud_data_restored', {
                          detail: { uid, profiles: mergedProfs, transactions: mergedTxs, watchlist: mergedWatchlist }
                        }));
                        window.dispatchEvent(new CustomEvent('bulkAccountsChanged', { detail: { profiles: mergedProfs } }));

                        setShowUserMenu(false);
                        alert(`✅ Cloud Sync Successful!\n• ${mergedProfs.length} Account(s)\n• ${mergedTxs.length} Transaction(s)\n• ${mergedWatchlist.length} Watchlist Scrip(s)\nSynchronized across all your devices.`);
                      } catch (err) {
                        alert('Sync failed: ' + err.message);
                      }
                    }}
                    style={{
                      width: '100%', padding: '10px 16px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      color: 'var(--bull)', fontSize: 13, fontWeight: 700,
                      textAlign: 'left',
                      borderBottom: '1px solid var(--border)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--bull)', display: 'inline-block' }} />
                      ☁️ Cloud Sync (डेटा सिङ्क)
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 6px', background: 'rgba(16,185,129,0.2)', color: 'var(--bull)', borderRadius: 4, fontWeight: 800 }}>
                      SYNC NOW
                    </span>
                  </button>

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
      <main style={{ flex: 1, overflowY: activeTab === 'dashboard' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(65px + env(safe-area-inset-bottom))' }}>
        <ErrorBoundary>
          <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'dashboard'  && (
              <PullToRefresh onRefresh={triggerTick} isRefreshing={isRefreshing}>
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
                  onOpenCalendar={() => setShowCalendarModal(true)}
                />
              </PullToRefresh>
            )}
            {(activeTab === 'portfolio' || activeTab === 'bulk_ipo') && (
              <PortfolioHub
                marketStocks={stocks}
                userId={user?.uid}
                userEmail={user?.email}
                apiStatus={apiStatus}
                initialSubTab={activeTab === 'bulk_ipo' ? 'bulk_ipo' : 'portfolio'}
                onSelectStock={openStockDetail}
              />
            )}
            {activeTab === 'predictor'  && (
              <PredictorHub
                stocks={stocks}
                indices={indices}
                onSelectStock={openStockDetail}
              />
            )}

            {activeTab === 'services'   && (
              <ServicesHub
                stocks={stocks}
                indices={indices}
                apiStatus={apiStatus}
                userId={user?.uid}
                onNavigateTab={setActiveTab}
                onSelectStock={openStockDetail}
                onAskGuruAi={(stockOrSymbol) => {
                  const sym = typeof stockOrSymbol === 'string' ? stockOrSymbol : stockOrSymbol?.symbol;
                  setAiTargetStock(sym);
                  setActiveTab('ai');
                }}
              />
            )}
            {activeTab === 'calculator' && <Calculator />}
            {activeTab === 'ai'         && (
              <AiAnalyst
                marketStocks={stocks}
                initialStock={aiTargetStock}
                onClearInitialStock={() => setAiTargetStock(null)}
              />
            )}
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
          { id: 'portfolio',  icon: Wallet,          label: 'Portfolio & IPO' },
          { id: 'predictor',  icon: TrendingUp,      label: 'Predictor' },
          { id: 'services',   icon: LayoutGrid,      label: 'Services' },
          { id: 'ai',         icon: BrainCircuit,    label: 'Guru AI' },
        ].map(({ id, icon: Icon, label }) => {
          const isActive = activeTab === id || (id === 'portfolio' && activeTab === 'bulk_ipo');
          return (
            <button
              key={id}
              className={`nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon style={{ width: 20, height: 20, strokeWidth: 2.2 }} />
              <span className="nav-label">{label}</span>
            </button>
          );
        })}
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

      {/* ── NEPSE Market Calendar & Holidays Modal ── */}
      {showCalendarModal && (
        <div 
          onClick={() => setShowCalendarModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(5, 7, 13, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'flex-end',
            justifyContent: 'center',
            animation: 'fadeIn 0.25s ease'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0D111A',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '24px 24px 0 0',
              width: '100%',
              maxWidth: 580,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.7)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', background: 'rgba(255,255,255,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38,
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(59,130,246,0.2))',
                  border: '1px solid rgba(16,185,129,0.4)',
                  borderRadius: 12, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', boxShadow: '0 0 20px rgba(16,185,129,0.15)'
                }}>
                  <Calendar style={{ width: 20, height: 20, color: '#10b981' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    NEPSE Market Calendar & Holidays
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    नेप्से क्यालेन्डर तथा सार्वजनिक बिदाहरू
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCalendarModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border)',
                  borderRadius: '50%', width: 32, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)', cursor: 'pointer'
                }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Today's Status Banner */}
              <div style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16, padding: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Today's Nepali Date (वि.सं.)
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                      {marketStatus?.bsFormattedNp || '२८ भाद्र २०८३ (आइतबार)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      {marketStatus?.bsFormattedEn || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 12px', borderRadius: 20,
                    background: marketStatus?.isOpen ? 'rgba(16,185,129,0.15)' : marketStatus?.isHoliday ? 'rgba(192,132,252,0.15)' : marketStatus?.isWeekend ? 'rgba(251,191,36,0.15)' : 'rgba(244,63,94,0.15)',
                    border: `1px solid ${marketStatus?.isOpen ? 'rgba(16,185,129,0.4)' : marketStatus?.isHoliday ? 'rgba(192,132,252,0.4)' : marketStatus?.isWeekend ? 'rgba(251,191,36,0.4)' : 'rgba(244,63,94,0.4)'}`,
                    color: marketStatus?.isOpen ? 'var(--bull)' : marketStatus?.isHoliday ? '#c084fc' : marketStatus?.isWeekend ? '#fbbf24' : '#f87171',
                    fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: marketStatus?.isOpen ? 'var(--bull)' : marketStatus?.isHoliday ? '#c084fc' : marketStatus?.isWeekend ? '#fbbf24' : '#f87171'
                    }} />
                    {marketStatus?.isOpen
                      ? 'Market Open (खुल्ला)'
                      : marketStatus?.isHoliday
                      ? `Holiday: ${marketStatus.holidayName || 'Public Holiday'}`
                      : marketStatus?.isWeekend
                      ? 'Weekend Closed (शनिबार/आइतबार)'
                      : 'Market Closed (बन्द)'}
                  </div>
                </div>

                {/* Schedule Rules Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>TRADING DAYS</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bull)', marginTop: 2 }}>Mon – Fri (सोम – शुक्र)</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Friday market is OPEN</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>TRADING HOURS</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>11:00 AM – 3:00 PM</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Nepal Time (NPT)</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>WEEKEND HOLIDAYS</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', marginTop: 2 }}>Saturday & Sunday</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>National weekend off</div>
                  </div>
                </div>
              </div>

              {/* Upcoming Public Holidays Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar style={{ width: 15, height: 15, color: 'var(--primary)' }} />
                    Upcoming NEPSE Holidays
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 7px', borderRadius: 10 }}>
                      {upcomingHolidaysList.length}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Bikram Sambat (वि.सं.)
                  </div>
                </div>

                {loadingHolidays ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    <RefreshCw style={{ width: 18, height: 18, animation: 'spin 1s linear infinite', margin: '0 auto 8px', color: 'var(--primary)' }} />
                    Fetching latest Nepali calendar holidays...
                  </div>
                ) : upcomingHolidaysList.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
                    No upcoming market holidays scheduled.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {upcomingHolidaysList.map((h, idx) => {
                      const isWeekendOff = (h.dayOfWeek === 6 || h.dayOfWeek === 0);
                      return (
                        <div
                          key={`${h.bsYear}_${h.bsMonth}_${h.bsDay}_${idx}`}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 12,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* BS Date Badge */}
                            <div style={{
                              minWidth: 54, textAlign: 'center',
                              padding: '5px 8px', borderRadius: 8,
                              background: 'rgba(192,132,252,0.1)',
                              border: '1px solid rgba(192,132,252,0.25)'
                            }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#c084fc', lineHeight: 1.1 }}>
                                {h.digitsDay || toNepaliDigits(h.bsDay)}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>
                                {h.dayOfWeekNp || ''}
                              </div>
                            </div>

                            {/* Holiday Info */}
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {h.nameNp || h.festival || 'सार्वजनिक बिदा'}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                {h.nameEn || h.adDate || ''}
                              </div>
                            </div>
                          </div>

                          {/* Day tag */}
                          <div style={{ textAlign: 'right' }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              padding: '3px 8px', borderRadius: 6,
                              background: isWeekendOff ? 'rgba(251,191,36,0.12)' : 'rgba(244,63,94,0.12)',
                              color: isWeekendOff ? '#fbbf24' : '#f87171',
                              border: `1px solid ${isWeekendOff ? 'rgba(251,191,36,0.25)' : 'rgba(244,63,94,0.25)'}`
                            }}>
                              {h.dayOfWeekEn || ''}
                            </span>
                            {h.adDate && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                                {h.adDate}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex', justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={() => setShowCalendarModal(false)}
                className="btn-primary"
                style={{ padding: '8px 24px', fontSize: 13, fontWeight: 700, borderRadius: 10 }}
              >
                Close Calendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kharcha Tracker Style Exit Toast */}
      {exitToast && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(80px + env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: 16,
          padding: '12px 20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.2)',
          color: '#ffffff',
          pointerEvents: 'none',
          animation: 'fadeInUp 0.2s ease',
          maxWidth: '90vw',
          width: 'max-content'
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 10px #10b981',
            flexShrink: 0
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              {exitToast.title}
            </div>
            {exitToast.desc && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>
                {exitToast.desc}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
