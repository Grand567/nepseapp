import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Wallet, ShieldCheck,
  Calculator as CalcIcon, BrainCircuit, BookOpen,
  BarChart3, Wifi, WifiOff, Clock, LogOut, User, Settings
} from 'lucide-react';
import Dashboard    from './components/Dashboard';
import Portfolio    from './components/Portfolio';
import MeroShareHub from './components/MeroShareHub';
import Calculator   from './components/Calculator';
import AiAnalyst    from './components/AiAnalyst';
import Resources    from './components/Resources';
import LoginScreen  from './components/LoginScreen';

import { fetchLiveMarketData, calculateIndices, fetchMarketStatus, mergeWithMockData, fetchMarketIndices } from './utils/liveData';
import { initializeMarket } from './utils/mockData';
import { onAuthChange, signOut, checkRedirectResult } from './utils/firebase';

const defaultMockStocks = initializeMarket();
const defaultIndices = calculateIndices(defaultMockStocks);

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // ── Auth state ──
  const [user,         setUser]         = useState(undefined); // undefined = checking, null = logged out, object = logged in
  const [showUserMenu, setShowUserMenu] = useState(false);

  // ── Market data state ──
  const [stocks,       setStocks]       = useState(defaultMockStocks);
  const [indices,      setIndices]      = useState(defaultIndices);
  const [apiStatus,    setApiStatus]    = useState('offline'); // 'live' | 'closing' | 'offline'
  const [marketStatus, setMarketStatus] = useState({ isOpen: false, nptTime: '', message: 'Loading...' });

  // Store the base mock data so we don't recreate it
  const mockStocksRef = useRef(defaultMockStocks);

  // ── Listen for Firebase auth state changes ──
  useEffect(() => {
    // Check if returning from a mobile OAuth redirect
    checkRedirectResult().then(redirectUser => {
      if (redirectUser) setUser(redirectUser);
    }).catch(console.error);

    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser); // null if signed out
    });
    return unsubscribe;
  }, []);

  // ── Market data fetching (only when logged in) ──
  useEffect(() => {
    if (!user) return; // Don't fetch if not logged in
    let isMounted = true;

    const fetchMarket = async () => {
      const statusObj = await fetchMarketStatus();
      if (isMounted) setMarketStatus(statusObj);

      const [response, liveIndices] = await Promise.all([
        fetchLiveMarketData(),
        fetchMarketIndices()
      ]);

      if (!isMounted) return;

      if (response && response.data) {
        const merged = mergeWithMockData(response.data, mockStocksRef.current);
        setStocks(merged);
        setIndices(liveIndices || calculateIndices(merged));
        setApiStatus(response.source === 'live' ? 'live' : 'closing');
      } else {
        setApiStatus('offline');
      }
    };

    fetchMarket();
    const id = setInterval(fetchMarket, 15000);

    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [user]); // Re-run when user logs in/out

  const triggerTick = async () => {
    const [response, liveIndices] = await Promise.all([
      fetchLiveMarketData(),
      fetchMarketIndices()
    ]);
    if (response && response.data) {
      const merged = mergeWithMockData(response.data, mockStocksRef.current);
      setStocks(merged);
      setIndices(liveIndices || calculateIndices(merged));
      setApiStatus(response.source === 'live' ? 'live' : 'closing');
    } else {
      setApiStatus('offline');
    }
  };

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
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
          <div className="header-logo-icon">
            <BarChart3 style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          <div>
            <div className="header-title">Drabyashree Nepse Hub</div>
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
              : <WifiOff style={{ width: 12, height: 12, color: 'var(--accent-amber)' }} />
            }
            <span style={{ fontSize: 10, fontWeight: 700,
              color: apiStatus === 'live' ? 'var(--bull)'
                   : apiStatus === 'closing' ? 'var(--accent-cyan)'
                   : 'var(--accent-amber)' }}>
              {apiStatus === 'live' ? 'Live' : apiStatus === 'closing' ? 'Closing' : 'Offline'}
            </span>
          </div>

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
                  minWidth: 200, padding: '8px 0',
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

      {/* ── Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          {activeTab === 'dashboard'  && <Dashboard stocks={stocks} indices={indices} triggerTick={triggerTick} />}
          {activeTab === 'portfolio'  && <Portfolio marketStocks={stocks} userId={user.uid} />}
          {activeTab === 'meroshare'  && <MeroShareHub apiStatus={apiStatus === 'offline' ? 'offline' : 'online'} marketStocks={stocks} />}
          {activeTab === 'calculator' && <Calculator />}
          {activeTab === 'ai'         && <AiAnalyst marketStocks={stocks} />}
          {activeTab === 'resources'  && <Resources />}
        </div>
        <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Built by <span style={{ fontWeight: 600, color: 'var(--bull)' }}>Rexsh K Suwal, a Computer Engineer</span>
        </div>
      </main>

      {/* ── Bottom Navigation ── */}
      <nav className="bottom-nav">
        {[
          { id: 'dashboard',  icon: LayoutDashboard, label: 'Market' },
          { id: 'portfolio',  icon: Wallet,          label: 'Portfolio' },
          { id: 'meroshare',  icon: ShieldCheck,     label: 'MeroShare' },
          { id: 'calculator', icon: CalcIcon,        label: 'Calc' },
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
    </div>
  );
}
