import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LayoutDashboard, Wallet, ShieldCheck, Layers,
  LayoutGrid, BrainCircuit, BookOpen, TrendingUp,
  BarChart3, Wifi, WifiOff, Clock, LogOut, User, Settings, Cpu, RefreshCw,
  Calendar, X, Info, Crown, Zap, Smartphone, Copy, Bell, Sparkles
} from 'lucide-react';
import Dashboard      from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

// ── Dynamic Code-Splitting for Lightning-Fast Initial Launch ──
const ServicesHub      = React.lazy(() => import('./components/ServicesHub'));
const PredictorHub     = React.lazy(() => import('./components/PredictorHub'));
const PortfolioHub     = React.lazy(() => import('./components/PortfolioHub'));
const Calculator       = React.lazy(() => import('./components/Calculator'));
const AiAnalyst        = React.lazy(() => import('./components/AiAnalyst'));
const Resources        = React.lazy(() => import('./components/Resources'));
const LoginScreen      = React.lazy(() => import('./components/LoginScreen'));
const TestSuite        = React.lazy(() => import('./components/TestSuite'));
const StockDetailModal = React.lazy(() => import('./components/StockDetailModal'));
const StitchHub        = React.lazy(() => import('./views/StitchHub'));
import PullToRefresh from './components/PullToRefresh';
import SubscriptionModal from './components/SubscriptionModal';
import { RiskDisclaimer } from './components/DataQualityBanner'; // A1: Global disclaimer
import { InstitutionalAlertCardModal } from './components/InstitutionalAlertCardModal';
import { SmartAlertBanner } from './components/SmartAlertBanner';
import { initPushNotifications, fetchActiveSmartAlerts, triggerTestAlert } from './utils/pushNotificationService';
import { NavigationProvider, useNavigation, useBackHandler } from './context/NavigationContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { fetchHolidays, fetchNepseIntradayGraph } from './utils/servicesApi.js';
import { getUpcomingHolidays, toNepaliDigits } from './utils/bikramSambat.js';

import { fetchLiveMarketData, calculateIndices, fetchMarketStatus, fetchMarketIndices, getLastMarketSyncTime, getCachedIndices, getCachedStocks, saveCachedStocks, saveCachedIndices, warmUpServer } from './utils/liveData';
import { getDetailedMarketStatus, clearDynamicMarketHalt, setLiveMarketOverride } from './utils/nepseCalendar';
// MOCK_DATA_DISABLED — mock data is permanently disabled; import removed.
import { onAuthChange, signOut, checkRedirectResult, fetchUserDataFromCloud, syncUserDataToCloud, getLocalSession } from './utils/firebase';
import { safeStorageSetItem, purgeDispensableStorageCaches } from './utils/calculations';

// Automatically purge stale transient caches if localStorage is congested to prevent QuotaExceededError
try { purgeDispensableStorageCaches(); } catch (_) {}

// Real data only - No mock fallback
const _cachedStocks = getCachedStocks() || [];
const initialStocks = _cachedStocks;
const defaultIndices = getCachedIndices() || calculateIndices(initialStocks);

export default function App() {
  return (
    <SubscriptionProvider>
      <NavigationProvider>
        {/* A1: Global one-time risk disclaimer (shown on first visit, dismissable) */}
        <RiskDisclaimer />
        <AppInner />
      </NavigationProvider>
    </SubscriptionProvider>
  );
}


function AppInner() {
  const { activeTab, setActiveTab, selectedStock, closeStockDetail, openStockDetail, exitToast } = useNavigation();
  const { isPro, daysRemaining, isLifetime, planDuration, deviceId, openSubscriptionModal, syncFromCloud } = useSubscription();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [marketTrend, setMarketTrend] = useState('flat');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // ── Tab Keep-Alive for Instant 0ms Switching ──
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['dashboard']));

  useEffect(() => {
    let base = 'dashboard';
    if (activeTab === 'portfolio' || activeTab === 'bulk_ipo' || activeTab === 'simulator') base = 'portfolio';
    else if (activeTab === 'predictor' || activeTab === 'entry_exit' || activeTab === 'short_term_plan' || activeTab === 'master_100_profit') base = 'predictor';
    else if (activeTab === 'services') base = 'services';
    else if (activeTab === 'calculator') base = 'calculator';
    else if (activeTab === 'ai') base = 'ai';
    else if (activeTab === 'resources') base = 'resources';

    setVisitedTabs(prev => {
      if (prev.has(base)) return prev;
      const next = new Set(prev);
      next.add(base);
      return next;
    });
  }, [activeTab]);

  // ── Auth state ──
  const [user,         setUser]         = useState(() => getLocalSession() || undefined); // undefined = checking, null = logged out, object = logged in
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const avatarBtnRef = useRef(null);

  // ── Render cold-start warm-up — fire ASAP so server is ready before fetchMarket runs ──
  useEffect(() => { warmUpServer().catch(() => {}); }, []);

  // Close account menu on any click or touch outside
  useEffect(() => {
    if (!showUserMenu) return;
    const handleOutsideInteraction = (e) => {
      if (
        userMenuRef.current && 
        !userMenuRef.current.contains(e.target) &&
        avatarBtnRef.current && 
        !avatarBtnRef.current.contains(e.target)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideInteraction);
    document.addEventListener('touchstart', handleOutsideInteraction, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction);
      document.removeEventListener('touchstart', handleOutsideInteraction);
    };
  }, [showUserMenu]);

  // ── Accessibility & Font Scale State for Weak Eyesight ──
  const [fontScale, setFontScale] = useState(() => localStorage.getItem('nepse_font_scale') || 'normal');
  const [showFontModal, setShowFontModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [upcomingHolidaysList, setUpcomingHolidaysList] = useState([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  // ── Dravyashree Smart Institutional Alert Modal State ──
  const [smartAlertModal, setSmartAlertModal] = useState({ isOpen: false, alert: null });

  // Initialize Push Notifications (Capacitor FCM on Android + Web SSE)
  useEffect(() => {
    initPushNotifications().catch(() => {});
  }, []);

  // Listen for Lockscreen / Deep Link tap or In-App Banner clicks
  useEffect(() => {
    const handleOpenSmartAlert = (e) => {
      const alertData = e.detail;
      if (alertData) {
        setSmartAlertModal({ isOpen: true, alert: alertData });
      }
    };
    window.addEventListener('dravyashree_open_smart_alert', handleOpenSmartAlert);
    return () => {
      window.removeEventListener('dravyashree_open_smart_alert', handleOpenSmartAlert);
    };
  }, []);

  useBackHandler(() => {
    setSmartAlertModal({ isOpen: false, alert: null });
    return true;
  }, smartAlertModal.isOpen, 60);

  const handleOpenRadarFromAlert = (symbol) => {
    setSmartAlertModal({ isOpen: false, alert: null });
    try {
      localStorage.setItem('open_service_id', 'stealth-accumulation');
      localStorage.setItem('selected_entry_exit_symbol', symbol);
      setActiveTab('services');
      window.dispatchEvent(new CustomEvent('open_service', { detail: { serviceId: 'stealth-accumulation', symbol } }));
    } catch (_) {}
  };

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
    safeStorageSetItem('nepse_font_scale', fontScale);
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
            if (cloudData.subscription) syncFromCloud(cloudData.subscription);

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
        safeStorageSetItem(bulkAccountsKey, JSON.stringify(mergedBulk));

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
        safeStorageSetItem(userProfileKey, JSON.stringify(mergedProfiles));
        safeStorageSetItem(bulkAccountsKey, JSON.stringify(mergedProfiles));
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
        safeStorageSetItem(userTxKey, JSON.stringify(mergedTxs));
        window.dispatchEvent(new StorageEvent('storage', { key: userTxKey, newValue: JSON.stringify(mergedTxs) }));

        // 5. Restore Watchlist
        if (cloudWatchlist && Array.isArray(cloudWatchlist)) {
          safeStorageSetItem('nepse_user_watchlist', JSON.stringify(cloudWatchlist));
        }

        // 6. Restore Trade Notes
        if (cloudTradeNotes && Array.isArray(cloudTradeNotes)) {
          safeStorageSetItem('nepse_trade_notes', JSON.stringify(cloudTradeNotes));
        }

        // 7. Restore Stock Alerts
        if (cloudStockAlerts && Array.isArray(cloudStockAlerts)) {
          safeStorageSetItem('nepse_stock_alerts', JSON.stringify(cloudStockAlerts));
        }

        // 8. Restore Trade Journal
        if (cloudTradeJournal && Array.isArray(cloudTradeJournal)) {
          safeStorageSetItem('nepse_trade_journal', JSON.stringify(cloudTradeJournal));
        }

        // 9. Restore Paper Trading Simulator State
        if (cloudPaperTrading) {
          if (cloudPaperTrading.balance !== undefined) safeStorageSetItem('nepse_paper_balance', cloudPaperTrading.balance.toString());
          if (cloudPaperTrading.positions) safeStorageSetItem('nepse_paper_positions', JSON.stringify(cloudPaperTrading.positions));
          if (cloudPaperTrading.orders) safeStorageSetItem('nepse_paper_orders', JSON.stringify(cloudPaperTrading.orders));
        }

        // 10. Restore Credentials Vault
        if (cloudCredentials && Array.isArray(cloudCredentials)) {
          safeStorageSetItem('nepse_credentials_vault', JSON.stringify(cloudCredentials));
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
        const currentWatchlist = JSON.parse(localStorage.getItem('nepse_user_watchlist') || '[]');
        const currentNotes = JSON.parse(localStorage.getItem('nepse_trade_notes') || '[]');
        const currentAlerts = JSON.parse(localStorage.getItem('nepse_stock_alerts') || '[]');
        const currentJournal = JSON.parse(localStorage.getItem('nepse_trade_journal') || '[]');
        const currentPaperBal = parseFloat(localStorage.getItem('nepse_paper_balance') || '1000000');
        const currentPaperPos = JSON.parse(localStorage.getItem('nepse_paper_positions') || '[]');
        const currentPaperOrd = JSON.parse(localStorage.getItem('nepse_paper_orders') || '[]');
        const currentCreds = JSON.parse(localStorage.getItem('nepse_credentials_vault') || '[]');

        const hasDataToPreserve = mergedProfiles.length > 0 ||
                                  mergedTxs.length > 0 ||
                                  mergedBulk.length > 0 ||
                                  currentWatchlist.length > 0 ||
                                  currentNotes.length > 0 ||
                                  currentAlerts.length > 0 ||
                                  currentJournal.length > 0 ||
                                  currentPaperPos.length > 0;
        if (hasDataToPreserve) {
          try {

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

  // ── Listen for Emergency Market Halt Broadcasts ──
  useEffect(() => {
    const handleHaltChange = () => {
      const updatedStatus = getDetailedMarketStatus();
      setMarketStatus(updatedStatus);
      if (!updatedStatus.isOpen) {
        setApiStatus('yesterday');
      }
    };
    window.addEventListener('nepse_market_halt_triggered', handleHaltChange);
    window.addEventListener('nepse_market_halt_cleared', handleHaltChange);
    return () => {
      window.removeEventListener('nepse_market_halt_triggered', handleHaltChange);
      window.removeEventListener('nepse_market_halt_cleared', handleHaltChange);
    };
  }, []);

  // ── Market data fetching (Continuous Autonomous Poller for ALL Users) ──
  useEffect(() => {
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
      let isPreOpen = false;
      let hadError = false;

      try {
        // Immediate synchronous calendar status so data polling starts at millisecond 0
        const status = getDetailedMarketStatus();
        if (isMounted && status) {
          setMarketStatus(status);
          isMarketOpen = Boolean(status.isOpen);
          isPreOpen = Boolean(status.isPreOpen);
        }

        let currentStocks = stocks;
        let hasFreshData = false;

        const pStatus = fetchMarketStatus().catch(() => null);

        const pLiveMarket = fetchLiveMarketData().then(res => {
          if (!isMounted || !res) return res;
          const isFreshFeed = res.isFreshFeed === true || res.source === 'live' || res.source === 'closing';
          const isReal = res.data && res.data.length > 0 && res.source !== 'simulated-live' && res.source !== 'yesterday';
          const hasExistingReal = liveStocksRef.current && liveStocksRef.current.length > 0;
          const isMarketOpenNow = Boolean(status?.isOpen);

          // If market is open and we already have real live stocks, NEVER regress to yesterday's snapshot!
          const shouldUpdate = isFreshFeed || isReal || (!hasExistingReal && res.data?.length > 0);
          if (shouldUpdate && (!isMarketOpenNow || isFreshFeed || !hasExistingReal)) {
            currentStocks = res.data;
            liveStocksRef.current = currentStocks;
            setStocks(prev => {
              if (prev && prev === currentStocks) return prev;
              if (!prev || prev.length !== currentStocks.length) return currentStocks;
              const prevTurnover = prev.reduce((acc, s) => acc + (Number(s.turnover) || 0), 0);
              const curTurnover = currentStocks.reduce((acc, s) => acc + (Number(s.turnover) || 0), 0);
              if (prevTurnover > 0 && prevTurnover === curTurnover) {
                const prevVol = prev.reduce((acc, s) => acc + (Number(s.volume) || 0), 0);
                const curVol = currentStocks.reduce((acc, s) => acc + (Number(s.volume) || 0), 0);
                const prevPriceChecksum = prev.reduce(
                  (acc, s) => acc + (Number(s.ltp || s.close) || 0) + (Number(s.pChange) || 0),
                  0
                );
                const curPriceChecksum = currentStocks.reduce(
                  (acc, s) => acc + (Number(s.ltp || s.close) || 0) + (Number(s.pChange) || 0),
                  0
                );
                if (prevVol === curVol && Math.abs(prevPriceChecksum - curPriceChecksum) < 0.001) {
                  return prev;
                }
              }
              return currentStocks;
            });
            const isLive = Boolean(status?.isOpen);
            setApiStatus(isLive ? (isFreshFeed ? 'live' : (hasExistingReal ? 'live' : 'yesterday')) : (res.source === 'closing' ? 'closing' : 'yesterday'));
            if (isFreshFeed) {
              saveCachedStocks(currentStocks);
              hasFreshData = true;
            }
          } else if (hasExistingReal && isMarketOpenNow) {
            setApiStatus('live');
          }
          return res;
        }).catch(err => {
          console.warn('[App] fetchLiveMarketData error:', err);
          return null;
        });

        const pIndices = fetchMarketIndices().then(liveIdx => {
          if (!isMounted || !liveIdx) return liveIdx;
          const hasFresh = liveIdx.nepse && Number(liveIdx.nepse.value) > 1000 && !liveIdx.isPlaceholder;
          if (hasFresh) {
            setIndices(prev => {
              if (
                prev?.nepse?.value === liveIdx.nepse.value &&
                prev?.nepse?.turnover === liveIdx.nepse.turnover &&
                prev?.nepse?.change === liveIdx.nepse.change
              ) {
                return prev;
              }
              return { ...prev, ...liveIdx };
            });
            saveCachedIndices(liveIdx);
            hasFreshData = true;
          }
          return liveIdx;
        }).catch(err => {
          console.warn('[App] fetchMarketIndices error:', err);
          return null;
        });

        const [rawStatus, response, liveIndices] = await Promise.all([
          pStatus,
          pLiveMarket,
          pIndices
        ]);

        if (!isMounted) return;

        if (rawStatus && rawStatus.isOpen !== undefined) {
          if (rawStatus.isOpen) {
            setLiveMarketOverride({ isOpen: true, status: 'OPEN' });
          }
          setMarketStatus(rawStatus);
        }

        if (response && (response.marketOpen === true || response.source === 'live' || (response.data && response.data.length > 0 && response.source !== 'yesterday' && response.source !== 'simulated-live'))) {
          setLiveMarketOverride({ isOpen: true, status: 'OPEN' });
        }

        // Fallback index calculation ONLY if liveIndices failed AND we do NOT already have authentic indices
        const hasFreshIndices = liveIndices && liveIndices.nepse && Number(liveIndices.nepse.value) > 1000 && !liveIndices.isPlaceholder;
        if (!hasFreshIndices) {
          setIndices(prev => {
            const computed = (currentStocks && currentStocks.length > 0) ? calculateIndices(currentStocks) : null;
            if (computed && computed.nepse?.value > 1000 && !computed.isPlaceholder) {
              saveCachedIndices(computed);
              return { ...prev, ...computed };
            }
            if (prev?.nepse?.value && Number(prev.nepse.value) > 1000 && !prev.isPlaceholder) {
              return prev; // PRESERVE authentic live index! Never overwrite with placeholder
            }
            return prev;
          });
        }

        if (hasFreshData) {
          clearDynamicMarketHalt();
          const freshStatus = getDetailedMarketStatus();
          setMarketStatus(freshStatus);
          const isFresh = response?.isFreshFeed === true || response?.source === 'live' || response?.source === 'closing';
          setApiStatus(freshStatus.isOpen ? (isFresh ? 'live' : 'yesterday') : (response?.source === 'closing' ? 'closing' : 'yesterday'));
          setLastSyncTime(new Date());
          consecutiveErrors = 0;
        }
      } catch (err) {
        hadError = true;
        consecutiveErrors++;
        console.warn('[Adaptive Poller] Sync error (attempt ' + consecutiveErrors + '):', err?.message);
      }

      if (!isMounted) return;

      // Ultra-responsive autonomous background self-refresh:
      // - Active Live Trading (11:00 AM - 3:00 PM NPT): 2.5s
      // - Pre-Open Session (10:30 - 11:00 AM NPT): 3.5s
      // - Post-Close Reconciliation (3:00 - 3:30 PM NPT): 4.0s
      // - Off-Hours / Evening / Weekend: 6.0s
      const isRecon = !isMarketOpen && (status?.isPostCloseReconciling || (status?.nptTotalMinutes >= 15 * 60 && status?.nptTotalMinutes < 16 * 60));
      const baseInterval = isMarketOpen ? 2500 : (isPreOpen ? 3500 : (isRecon ? 4000 : 6000));
      let nextInterval = baseInterval;
      if (hadError || consecutiveErrors > 0) {
        nextInterval = Math.min(baseInterval * Math.pow(1.2, Math.min(consecutiveErrors, 3)), 12000);
      }

      scheduleNext(nextInterval);
    };

    fetchMarket();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [user]); // Re-run when user changes, but starts automatically on mount for everyone

  // ── NEPSE Live Index Micro-Ticker ──
  // Autonomous live index poller with rate-limit protection
  useEffect(() => {
    let isMounted = true;
    let tickerTimer = null;
    let consecutiveErrors = 0;

    const tickFastIndex = async () => {
      const status = getDetailedMarketStatus();
      try {
        const liveIdx = await fetchMarketIndices();
        if (isMounted && liveIdx && liveIdx.nepse && Number(liveIdx.nepse.value) > 1000 && !liveIdx.isPlaceholder) {
          setIndices(prev => {
            if (
              prev?.nepse?.value === liveIdx.nepse.value &&
              prev?.nepse?.turnover === liveIdx.nepse.turnover &&
              prev?.nepse?.change === liveIdx.nepse.change
            ) {
              return prev;
            }
            return { ...prev, ...liveIdx };
          });
          saveCachedIndices(liveIdx);
          setLastSyncTime(new Date());
          consecutiveErrors = 0;
        }
      } catch (_) {
        consecutiveErrors++;
      }

      if (!isMounted) return;
      // Responsive refresh: 3.5s during market, 5.0s pre-open, 6.0s off-market
      // Exponential backoff up to 15s prevents Cloudflare 429 Bot Challenges
      const baseInterval = status.isOpen ? 3500 : (status.isPreOpen ? 5000 : 6000);
      const interval = consecutiveErrors > 0 ? Math.min(baseInterval * Math.pow(1.3, Math.min(consecutiveErrors, 3)), 15000) : baseInterval;
      tickerTimer = setTimeout(tickFastIndex, interval);
    };

    tickerTimer = setTimeout(tickFastIndex, 300);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        tickFastIndex();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      if (tickerTimer) clearTimeout(tickerTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleVisibilityChange);
      }
    };
  }, []);

  // Instant zero-cost tab scroll without layout thrashing
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 0;
    } catch (_) {}
  }, [activeTab]);

  const triggerTick = async () => {
    setIsRefreshing(true);
    try {
      let currentStocks = stocks;
      let hasFreshData = false;

      const pStatus = fetchMarketStatus().catch(() => null);
      const pIntraday = fetchNepseIntradayGraph('NEPSE', true).catch(() => null);

      const pLiveMarket = fetchLiveMarketData().then(res => {
        if (!res) return res;
        const isFresh = res.isFreshFeed === true || res.source === 'live' || res.source === 'closing';
        const isReal = res.data && res.data.length > 0 && res.source !== 'simulated-live' && res.source !== 'yesterday';
        const hasExistingReal = liveStocksRef.current && liveStocksRef.current.length > 0;
        const isMarketOpenNow = Boolean(marketStatus?.isOpen);

        // If market is open and we already have real live stocks, NEVER regress to yesterday's snapshot!
        const shouldUpdate = isFresh || isReal || (!hasExistingReal && res.data?.length > 0);
        if (shouldUpdate && (!isMarketOpenNow || isFresh || !hasExistingReal)) {
          currentStocks = res.data;
          liveStocksRef.current = currentStocks;
          setStocks(currentStocks);
          const isLive = Boolean(marketStatus?.isOpen);
          setApiStatus(isLive ? (isFresh ? 'live' : (hasExistingReal ? 'live' : 'yesterday')) : (res.source === 'closing' ? 'closing' : 'yesterday'));
          if (isFresh) {
            saveCachedStocks(currentStocks);
            hasFreshData = true;
          }
        } else if (hasExistingReal && isMarketOpenNow) {
          setApiStatus('live');
        }
        return res;
      }).catch(err => {
        console.warn('[triggerTick] fetchLiveMarketData error:', err);
        return null;
      });

      const pIndices = fetchMarketIndices().then(liveIdx => {
        if (!liveIdx) return liveIdx;
        const hasFresh = liveIdx.nepse && Number(liveIdx.nepse.value) > 1000 && !liveIdx.isPlaceholder;
        if (hasFresh) {
          setIndices(prev => {
            if (
              prev?.nepse?.value === liveIdx.nepse.value &&
              prev?.nepse?.turnover === liveIdx.nepse.turnover &&
              prev?.nepse?.change === liveIdx.nepse.change
            ) {
              return prev;
            }
            return { ...prev, ...liveIdx };
          });
          saveCachedIndices(liveIdx);
          hasFreshData = true;
        }
        return liveIdx;
      }).catch(err => {
        console.warn('[triggerTick] fetchMarketIndices error:', err);
        return null;
      });

      const [rawStatus, response, liveIndices, intradayPts] = await Promise.all([
        pStatus,
        pLiveMarket,
        pIndices,
        pIntraday
      ]);

      const status = (rawStatus?.isOpen !== undefined) ? rawStatus : (rawStatus?.data || rawStatus || getDetailedMarketStatus());
      if (status) setMarketStatus(status);

      const hasFreshIndices = liveIndices && liveIndices.nepse && Number(liveIndices.nepse.value) > 1000 && !liveIndices.isPlaceholder;

      if (!hasFreshIndices) {
        // Direct synthesis from live exchange intraday ticks if available
        if (Array.isArray(intradayPts) && intradayPts.length > 0) {
          const latestTick = intradayPts[intradayPts.length - 1];
          const firstTick = intradayPts[0];
          const liveVal = Number(latestTick?.close || latestTick?.value || 0);
          if (liveVal > 0) {
            setIndices(prev => {
              const prevClose = Number(prev?.nepse?.prevClose || firstTick?.open || 2629.82);
              const chg = +(liveVal - prevClose).toFixed(2);
              const pChg = +(prevClose > 0 ? (chg / prevClose) * 100 : 0).toFixed(2);
              const to = Number(response?.turnover || prev?.nepse?.turnover || currentStocks?.reduce((acc, s) => acc + (s.turnover || 0), 0) || 0);
              const synthNepse = {
                index: 'NEPSE Index',
                value: liveVal,
                change: chg,
                pChange: pChg,
                prevClose,
                open: Number(firstTick?.open || prevClose),
                high: Math.max(...intradayPts.map(p => Number(p.high || p.close || liveVal))),
                low: Math.min(...intradayPts.map(p => Number(p.low || p.close || liveVal))),
                turnover: to
              };
              const updated = { ...prev, nepse: synthNepse };
              saveCachedIndices(updated);
              return updated;
            });
            hasFreshData = true;
          }
        } else {
          setIndices(prev => {
            const computed = (currentStocks && currentStocks.length > 0) ? calculateIndices(currentStocks) : null;
            if (computed && computed.nepse?.value > 0 && !computed.isPlaceholder) {
              saveCachedIndices(computed);
              return { ...prev, ...computed };
            }
            if (prev?.nepse?.value && Number(prev.nepse.value) > 0 && !prev.isPlaceholder && Math.abs(Number(prev.nepse.value) - 2629.82) >= 0.05) {
              return prev; // PRESERVE authentic live index! Never revert to yesterday!
            }
            return prev;
          });
        }
      }

      if (hasFreshData) {
        clearDynamicMarketHalt();
        const freshStatus = getDetailedMarketStatus();
        setMarketStatus(freshStatus);
        const isFresh = response?.isFreshFeed === true || response?.source === 'live' || response?.source === 'closing';
        setApiStatus(freshStatus.isOpen ? (isFresh ? 'live' : 'yesterday') : (response?.source === 'closing' ? 'closing' : 'yesterday'));
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

  const synchronizedSelectedStock = useMemo(() => {
    if (!selectedStock) return null;
    const targetSym = String(selectedStock.symbol || '').toUpperCase().trim();
    if (!targetSym || !Array.isArray(stocks) || stocks.length === 0) return selectedStock;
    const liveMatch = stocks.find(
      s => String(s.symbol || '').toUpperCase().trim() === targetSym
    );
    return liveMatch ? { ...selectedStock, ...liveMatch } : selectedStock;
  }, [selectedStock, stocks]);

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

  if (!user) {
    return (
      <React.Suspense fallback={<div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: '#090D16' }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', animation: 'spin 0.8s linear infinite' }} /></div>}>
        <LoginScreen onLogin={setUser} />
      </React.Suspense>
    );
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
              <span style={{ color: nepseChange >= 0 ? 'var(--bull)' : 'var(--bear)', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {indices?.nepse?.value > 0 ? (
                  <>
                    {Number(indices.nepse.value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&nbsp;
                    {nepseChange >= 0 ? '▲ +' : '▼ -'}{Math.abs(Number(indices?.nepse?.change || 0)).toFixed(2)} pts ({nepseChange >= 0 ? '+' : '-'}{Math.abs(Number(indices?.nepse?.pChange || 0)).toFixed(2)}%)
                  </>
                ) : (
                  'NEPSE Index — Fetching Live...'
                )}
              </span>
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, cursor: 'pointer' }}
              onClick={() => setShowCalendarModal(true)}
              title={marketStatus?.message || 'NEPSE Market Status — Tap to view full calendar'}
            >
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold border ${
                marketStatus?.isOpen
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                  : marketStatus?.isPreOpen
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : marketStatus?.isHoliday
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : marketStatus?.isWeekend
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700/60'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  marketStatus?.isOpen ? 'bg-emerald-400' : marketStatus?.isPreOpen ? 'bg-amber-400' : marketStatus?.isHoliday ? 'bg-purple-400' : marketStatus?.isWeekend ? 'bg-amber-400' : 'bg-slate-500'
                }`} />
                {marketStatus?.isOpen ? 'Market Open' : marketStatus?.isPreOpen ? 'Pre-Open' : 'Market Closed'}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {marketStatus?.nptTime ? `${marketStatus.nptTime} NPT` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {/* Top Row: Refresh, Font Size, Resources, User Avatar/Account */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Refresh Live Data Button */}
            <button
              id="btn-refresh-market"
              className="icon-btn"
              onClick={triggerTick}
              disabled={isRefreshing}
              title="Refresh Live Market Data"
              style={{
                padding: '0 8px',
                height: 30,
                background: isRefreshing ? 'rgba(91,94,244,0.2)' : 'rgba(255,255,255,0.04)',
                borderColor: isRefreshing ? 'var(--primary-light)' : 'var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: isRefreshing ? 'wait' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <RefreshCw style={{ width: 13, height: 13, color: isRefreshing ? 'var(--primary-light)' : 'var(--text-primary)', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              <span className="header-refresh-label" style={{ fontSize: 12, fontWeight: 800, color: isRefreshing ? 'var(--primary-light)' : 'var(--text-primary)' }}>
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
                height: 30,
                width: 'auto',
                background: fontScale !== 'normal' ? 'rgba(79,70,229,0.18)' : 'rgba(255,255,255,0.04)',
                borderColor: fontScale !== 'normal' ? 'var(--primary-light)' : 'var(--border)'
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900, color: '#ffffff' }}>A</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary-light)' }}>
                {fontScale === 'huge' ? '+++' : fontScale === 'xlarge' ? '++' : fontScale === 'large' ? '+' : ''}
              </span>
            </button>

            {/* Smart Institutional Alerts Bell Button */}
            <button
              id="btn-smart-alerts"
              className="icon-btn"
              onClick={async () => {
                const alerts = await fetchActiveSmartAlerts();
                if (alerts && alerts.length > 0) {
                  setSmartAlertModal({ isOpen: true, alert: alerts[0] });
                } else {
                  const testRes = await triggerTestAlert('GHL', 269.50);
                  if (testRes?.result?.alert) {
                    setSmartAlertModal({ isOpen: true, alert: testRes.result.alert });
                  }
                }
              }}
              title="Dravyashree Smart Alerts: High-Probability Institutional Setup"
              style={{
                height: 30,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(16, 185, 129, 0.15)',
                borderColor: 'rgba(16, 185, 129, 0.45)',
                color: '#10b981',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 12
              }}
            >
              <Bell style={{ width: 13, height: 13, color: '#10b981' }} />
              <span className="header-alerts-label">Alerts</span>
            </button>

            {/* Pro Subscription Badge / Upgrade Button */}
            <button
              id="btn-pro-subscription"
              className="icon-btn header-pro-btn"
              onClick={() => openSubscriptionModal()}
              title={isPro ? (isLifetime ? '⭐ Pro Active (Lifetime Unlimited Access)' : `⭐ Pro Active (${daysRemaining}d remaining)`) : '⚡ Upgrade to Pro (1m, 2m...)'}
              style={{
                height: 30,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: isPro
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'linear-gradient(90deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.22))',
                borderColor: isPro ? 'rgba(245, 158, 11, 0.45)' : 'rgba(245, 158, 11, 0.55)',
                color: isPro ? '#f59e0b' : '#fbbf24',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: 12
              }}
            >
              <Crown style={{ width: 13, height: 13, color: isPro ? '#f59e0b' : '#fbbf24' }} />
              <span>PRO{isPro && <span className="header-pro-days"> ({isLifetime ? 'Lifetime' : `${daysRemaining}d`})</span>}</span>
            </button>

            {/* Resources button */}
            <button
              className={`icon-btn ${activeTab === 'resources' ? 'active' : ''}`}
              onClick={() => setActiveTab('resources')}
              title="Resources & Guides"
              style={{ height: 30, width: 30 }}
            >
              <BookOpen style={{ width: 14, height: 14 }} />
            </button>

            {/* Stitch UI Design System button */}
            <button
              className={`icon-btn ${activeTab === 'stitch' ? 'active' : ''} header-stitch-btn`}
              onClick={() => setActiveTab('stitch')}
              title="Stitch UI Design System"
              style={{
                height: 30,
                padding: '0 8px',
                borderRadius: 8,
                background: activeTab === 'stitch' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Sparkles style={{ width: 13, height: 13 }} />
              <span>Stitch</span>
            </button>

            {/* User avatar + menu */}
            <div style={{ position: 'relative' }}>
              <button
                id="btn-user-avatar"
                ref={avatarBtnRef}
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
                    onTouchStart={() => setShowUserMenu(false)}
                  />
                  <div 
                    ref={userMenuRef}
                    style={{
                      position: 'absolute', top: 36, right: 0, zIndex: 200,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                      minWidth: 220, padding: '8px 0',
                    }}
                  >
                  {/* User info */}
                  <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {renderAvatar(36)}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                          {user.displayName || 'Guest User'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {user.email || 'Local storage only'}
                        </div>
                        {user.isGuest && (
                          <div style={{ fontSize: 12, color: 'var(--accent-amber)', fontWeight: 700, marginTop: 2 }}>
                            GUEST MODE
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pro Subscription Status Card */}
                  <div style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--border)',
                    background: isPro ? 'rgba(245, 158, 11, 0.07)' : 'rgba(255, 255, 255, 0.02)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Crown style={{ width: 12, height: 12, color: '#f59e0b' }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: isPro ? '#f59e0b' : 'var(--text-secondary)' }}>
                          {isPro ? `PRO (${isLifetime ? 'Lifetime' : (planDuration || 'Active')})` : 'FREE PLAN'}
                        </span>
                      </div>
                      {isPro && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#10B981', background: 'rgba(16, 185, 129, 0.12)', padding: '1px 5px', borderRadius: 4 }}>
                          {isLifetime ? 'Lifetime Unlocked' : `${daysRemaining}d left`}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowUserMenu(false); openSubscriptionModal(); }}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(90deg, #d97706, #f59e0b)',
                        color: '#000',
                        border: 'none',
                        borderRadius: 6,
                        padding: '5px 8px',
                        fontSize: 12,
                        fontWeight: 900,
                        cursor: 'pointer',
                        marginTop: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4
                      }}
                    >
                      <Zap style={{ width: 11, height: 11 }} />
                      <span>{isPro ? 'Manage / Extend Plan' : '⚡ Upgrade to Pro'}</span>
                    </button>
                  </div>

                  {/* Device License ID Row */}
                  <div style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--border)',
                    background: 'rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Smartphone style={{ width: 12, height: 12, color: '#f59e0b', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Device License ID
                        </div>
                        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
                          {deviceId || 'DS-SYNCING'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (deviceId && navigator?.clipboard?.writeText) {
                          navigator.clipboard.writeText(deviceId);
                        }
                        alert(`Copied Device ID: ${deviceId}`);
                      }}
                      style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#fbbf24',
                        borderRadius: 5,
                        padding: '3px 8px',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        flexShrink: 0
                      }}
                    >
                      <Copy style={{ width: 10, height: 10 }} />
                      Copy
                    </button>
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
                        safeStorageSetItem(userProfileKey, JSON.stringify(mergedProfs));
                        safeStorageSetItem(userTxKey, JSON.stringify(mergedTxs));
                        safeStorageSetItem('nepse_user_watchlist', JSON.stringify(mergedWatchlist));

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
                    <span style={{ fontSize: 12, padding: '2px 6px', background: 'rgba(16,185,129,0.2)', color: 'var(--bull)', borderRadius: 4, fontWeight: 800 }}>
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
                    <span style={{ fontSize: 12, padding: '2px 6px', background: 'rgba(79,70,229,0.2)', color: 'var(--primary-light)', borderRadius: 4, fontWeight: 800 }}>
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

        {/* Sub-row: Bikram Sambat Date written directly below Refresh, Font Size, Account */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 5, 
            cursor: 'pointer',
            userSelect: 'none',
            marginTop: 1
          }}
          onClick={() => setShowCalendarModal(true)}
          title={`${marketStatus?.message || ''} — Tap to view NEPSE Calendar & Holidays`}
        >
          <Calendar style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }} title={marketStatus?.bsFormattedEn || ''}>
            {marketStatus?.bsFormattedNp || marketStatus?.nptTime || '11:00 AM – 3:00 PM'}
          </span>
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
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{opt.desc}</div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isSelected ? 'var(--primary-light)' : 'var(--accent-amber)', marginTop: 2 }}>{opt.badge}</span>
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
      <main className="app-main-content">
        <div className="app-content-body">
          <ErrorBoundary>
            <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Tab 1: Dashboard / Market */}
              {visitedTabs.has('dashboard') && (
                <div style={{ display: activeTab === 'dashboard' ? 'flex' : 'none', flexDirection: 'column', flex: '1 0 auto' }}>
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
                </div>
              )}

              {/* Tab 2 to 8: Lazy-loaded modules with Suspense boundary */}
              <React.Suspense fallback={<div style={{ display: 'flex', minHeight: 320, width: '100%', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', animation: 'spin 0.8s linear infinite' }} /></div>}>
                {/* Tab 2: Portfolio & Bulk IPO */}
                {visitedTabs.has('portfolio') && (
                  <div style={{ display: (activeTab === 'portfolio' || activeTab === 'bulk_ipo' || activeTab === 'simulator') ? 'flex' : 'none', flexDirection: 'column', flex: '1 0 auto' }}>
                    <PortfolioHub
                      marketStocks={stocks}
                      userId={user?.uid}
                      userEmail={user?.email}
                      apiStatus={apiStatus}
                      initialSubTab={activeTab === 'bulk_ipo' ? 'bulk_ipo' : activeTab === 'simulator' ? 'simulator' : 'portfolio'}
                      onSelectStock={openStockDetail}
                    />
                  </div>
                )}

                {/* Tab 3: Predictor Hub */}
                {visitedTabs.has('predictor') && (
                  <div style={{ display: (activeTab === 'predictor' || activeTab === 'entry_exit' || activeTab === 'short_term_plan' || activeTab === 'master_100_profit') ? 'flex' : 'none', flexDirection: 'column', flex: '1 0 auto' }}>
                    <PredictorHub
                      stocks={stocks}
                      indices={indices}
                      onSelectStock={openStockDetail}
                      initialSubTab={activeTab === 'master_100_profit' ? 'master_100_profit' : activeTab === 'entry_exit' ? 'entry_exit' : activeTab === 'short_term_plan' ? 'short_term_plan' : undefined}
                    />
                  </div>
                )}

                {/* Tab 4: Services */}
                {visitedTabs.has('services') && (
                  <div style={{ display: activeTab === 'services' ? 'flex' : 'none', flexDirection: 'column', flex: '1 0 auto' }}>
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
                  </div>
                )}

                {/* Tab 5: Calculator */}
                {visitedTabs.has('calculator') && (
                  <div style={{ display: activeTab === 'calculator' ? 'flex' : 'none', flexDirection: 'column', flex: '1 0 auto' }}>
                    <Calculator />
                  </div>
                )}

                {/* Tab 6: Guru AI */}
                {visitedTabs.has('ai') && (
                  <div style={{ display: activeTab === 'ai' ? 'flex' : 'none', flexDirection: 'column', flex: '1 0 auto' }}>
                    <AiAnalyst
                      marketStocks={stocks}
                      initialStock={aiTargetStock}
                      onClearInitialStock={() => setAiTargetStock(null)}
                    />
                  </div>
                )}

                {/* Tab 7: Resources */}
                {visitedTabs.has('resources') && (
                  <div style={{ display: activeTab === 'resources' ? 'flex' : 'none', flexDirection: 'column', flex: '1 0 auto' }}>
                    <Resources onNavigateTab={setActiveTab} />
                  </div>
                )}

                {/* Tab 8: Stitch UI Design System (7 Screens) */}
                {activeTab === 'stitch' && (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto', background: '#070A10' }}>
                    <StitchHub
                      onExit={() => setActiveTab('dashboard')}
                      stocks={stocks}
                      indices={indices}
                      marketStatus={marketStatus}
                      apiStatus={apiStatus}
                    />
                  </div>
                )}
              </React.Suspense>

              {/* ── Dravyashree Smart Institutional Alert Banner & Modal ── */}
              <SmartAlertBanner onOpenCard={(alert) => setSmartAlertModal({ isOpen: true, alert })} />

              <InstitutionalAlertCardModal
                isOpen={smartAlertModal.isOpen}
                alert={smartAlertModal.alert}
                onClose={() => setSmartAlertModal({ isOpen: false, alert: null })}
                onOpenRadar={handleOpenRadarFromAlert}
              />

              {/* ── Global ShareHub-Style Stock Detail Modal ── */}
              {synchronizedSelectedStock && (
                <React.Suspense fallback={null}>
                  <StockDetailModal
                    stock={synchronizedSelectedStock}
                    allStocks={stocks}
                    onClose={closeStockDetail}
                    marketStatus={marketStatus}
                  />
                </React.Suspense>
              )}
            </div>
          </ErrorBoundary>

          <footer className="app-credit-footer">
            Built by <span style={{ fontWeight: 600, color: 'var(--bull)' }}>Rexsh K Suwal, a Computer Engineer</span>
          </footer>
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
          const isActive = activeTab === id || (id === 'portfolio' && (activeTab === 'bulk_ipo' || activeTab === 'simulator')) || (id === 'predictor' && (activeTab === 'entry_exit' || activeTab === 'short_term_plan' || activeTab === 'master_100_profit'));
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
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Automated diagnostics and market simulation sandbox</div>
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
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                    background: marketStatus?.isEmergencyHalt ? 'rgba(239, 68, 68, 0.15)' : marketStatus?.isOpen ? 'rgba(16,185,129,0.15)' : marketStatus?.isHoliday ? 'rgba(192,132,252,0.15)' : marketStatus?.isWeekend ? 'rgba(251,191,36,0.15)' : 'rgba(244,63,94,0.15)',
                    border: `1px solid ${marketStatus?.isEmergencyHalt ? 'rgba(239, 68, 68, 0.4)' : marketStatus?.isOpen ? 'rgba(16,185,129,0.4)' : marketStatus?.isHoliday ? 'rgba(192,132,252,0.4)' : marketStatus?.isWeekend ? 'rgba(251,191,36,0.4)' : 'rgba(244,63,94,0.4)'}`,
                    color: marketStatus?.isEmergencyHalt ? '#f87171' : marketStatus?.isOpen ? 'var(--bull)' : marketStatus?.isHoliday ? '#c084fc' : marketStatus?.isWeekend ? '#fbbf24' : '#f87171',
                    fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: marketStatus?.isEmergencyHalt ? '#ef4444' : marketStatus?.isOpen ? 'var(--bull)' : marketStatus?.isHoliday ? '#c084fc' : marketStatus?.isWeekend ? '#fbbf24' : '#f87171'
                    }} />
                    {marketStatus?.isEmergencyHalt
                      ? `Emergency Halt: ${marketStatus.holidayName || 'आकस्मिक बजार बन्द'}`
                      : marketStatus?.isOpen
                      ? 'Market Open (खुल्ला)'
                      : marketStatus?.isHoliday
                      ? `Holiday: ${marketStatus.holidayName || 'Public Holiday'}`
                      : marketStatus?.isWeekend
                      ? 'Weekend Closed (शुक्रबार/शनिबार)'
                      : 'Market Closed (बन्द)'}
                  </div>
                </div>

                {/* Schedule Rules Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>TRADING DAYS</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bull)', marginTop: 2 }}>Sun – Thu (आइत – बिही)</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fri & Sat market CLOSED</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>TRADING HOURS</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>11:00 AM – 3:00 PM</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nepal Time (NPT)</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>WEEKEND HOLIDAYS</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', marginTop: 2 }}>Friday & Saturday</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>National weekend off</div>
                  </div>
                </div>
              </div>

              {/* Upcoming Public Holidays Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar style={{ width: 15, height: 15, color: 'var(--primary)' }} />
                    Upcoming NEPSE Holidays
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 7px', borderRadius: 10 }}>
                      {upcomingHolidaysList.length}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
                      const isWeekendOff = Boolean(h.isWeekend ?? (h.dayOfWeek === 6 || h.dayOfWeek === 0));
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
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>
                                {h.dayOfWeekNp || ''}
                              </div>
                            </div>

                            {/* Holiday Info */}
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {h.nameNp || h.festival || 'सार्वजनिक बिदा'}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                                {h.nameEn || h.adDate || ''}
                              </div>
                            </div>
                          </div>

                          {/* Day tag */}
                          <div style={{ textAlign: 'right' }}>
                            <span style={{
                              fontSize: 12, fontWeight: 700,
                              padding: '3px 8px', borderRadius: 6,
                              background: isWeekendOff ? 'rgba(251,191,36,0.12)' : 'rgba(244,63,94,0.12)',
                              color: isWeekendOff ? '#fbbf24' : '#f87171',
                              border: `1px solid ${isWeekendOff ? 'rgba(251,191,36,0.25)' : 'rgba(244,63,94,0.25)'}`
                            }}>
                              {h.dayOfWeekEn || ''}
                            </span>
                            {h.adDate && (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
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
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>
                {exitToast.desc}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Global Subscription & Pro Pass Modal ── */}
      <SubscriptionModal />
    </div>
  );
}
