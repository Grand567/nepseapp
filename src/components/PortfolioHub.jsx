// src/components/PortfolioHub.jsx
// Unified Portfolio & Bulk IPO Hub
// Merges Portfolio management and Bulk MeroShare IPO operations into a single tab.

import React, { useState, useEffect } from 'react';
import { Wallet, Layers, Sparkles, TrendingUp, Sliders } from 'lucide-react';
import Portfolio from './Portfolio';
import MeroShareHub from './MeroShareHub';
import CapitalRiskSimulatorView from './CapitalRiskSimulatorView';

export default function PortfolioHub({
  marketStocks = [],
  userId,
  userEmail = '',
  apiStatus = 'live',
  initialSubTab = 'portfolio',
  onSelectStock
}) {
  const [subTab, setSubTab] = useState(() => {
    if (initialSubTab === 'bulk_ipo') return 'bulk_ipo';
    if (initialSubTab === 'accounts') return 'accounts';
    if (initialSubTab === 'simulator') return 'simulator';
    return 'portfolio';
  });

  useEffect(() => {
    if (initialSubTab === 'bulk_ipo' || initialSubTab === 'portfolio' || initialSubTab === 'accounts' || initialSubTab === 'simulator') {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', flex: 1 }}>
      {/* ── Institutional Segmented Navigation Switcher ── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(11, 14, 20, 0.95)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="segmented-bar" style={{ width: '100%', maxWidth: 500 }}>
          <button
            onClick={() => setSubTab('portfolio')}
            className={`segmented-pill ${subTab === 'portfolio' ? 'active' : ''}`}
            title="Consolidated Demat & Manual Portfolio"
          >
            <Wallet style={{ width: 15, height: 15 }} />
            <span>My Portfolio</span>
          </button>

          <button
            onClick={() => setSubTab('bulk_ipo')}
            className={`segmented-pill ${subTab === 'bulk_ipo' ? 'active' : ''}`}
            title="Bulk Apply and Verify Allotment Results"
          >
            <Sparkles style={{ width: 15, height: 15 }} />
            <span>Bulk IPO Portal</span>
          </button>

          <button
            onClick={() => setSubTab('accounts')}
            className={`segmented-pill ${subTab === 'accounts' ? 'active' : ''}`}
            title="Manage MeroShare BOID Credentials & DP Profiles"
          >
            <Layers style={{ width: 15, height: 15 }} />
            <span>Demat Accounts</span>
          </button>

          <button
            onClick={() => setSubTab('simulator')}
            className={`segmented-pill ${subTab === 'simulator' ? 'active' : ''}`}
            title="Dynamic Capital & Risk Simulator"
          >
            <Sliders style={{ width: 15, height: 15 }} />
            <span>Risk Simulator</span>
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'portfolio' ? (
          <Portfolio
            marketStocks={marketStocks}
            userId={userId}
            userEmail={userEmail}
            onSelectStock={onSelectStock}
            onSwitchToAccounts={() => setSubTab('accounts')}
            onSwitchToSimulator={() => setSubTab('simulator')}
          />
        ) : subTab === 'simulator' ? (
          <CapitalRiskSimulatorView
            onNavigateToPortfolio={() => setSubTab('portfolio')}
          />
        ) : (
          <MeroShareHub
            userId={userId}
            userEmail={userEmail}
            marketStocks={marketStocks}
            apiStatus={apiStatus}
            initialTab={subTab === 'bulk_ipo' ? 'ipo' : 'accounts'}
            onSwitchToPortfolio={() => setSubTab('portfolio')}
          />
        )}
      </div>
    </div>
  );
}
