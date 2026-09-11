// src/components/PortfolioHub.jsx
// Unified Portfolio & Bulk IPO Hub
// Merges Portfolio management and Bulk MeroShare IPO operations into a single tab.

import React, { useState, useEffect } from 'react';
import { Wallet, Layers, Sparkles, TrendingUp } from 'lucide-react';
import Portfolio from './Portfolio';
import MeroShareHub from './MeroShareHub';

export default function PortfolioHub({
  marketStocks = [],
  userId,
  apiStatus = 'live',
  initialSubTab = 'portfolio',
  onSelectStock
}) {
  const [subTab, setSubTab] = useState(() => {
    return initialSubTab === 'bulk_ipo' ? 'bulk_ipo' : 'portfolio';
  });

  useEffect(() => {
    if (initialSubTab === 'bulk_ipo' || initialSubTab === 'portfolio') {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
      {/* ── Unified Top Segmented Switcher ── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(11, 15, 25, 0.95)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 4,
          width: '100%',
          maxWidth: 480,
          gap: 6
        }}>
          <button
            onClick={() => setSubTab('portfolio')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: subTab === 'portfolio' ? 'var(--primary)' : 'transparent',
              color: subTab === 'portfolio' ? '#fff' : 'var(--text-secondary)',
              boxShadow: subTab === 'portfolio' ? '0 2px 10px rgba(59, 130, 246, 0.35)' : 'none',
              transition: 'all 0.18s ease'
            }}
          >
            <Wallet style={{ width: 16, height: 16 }} />
            <span>Demat Portfolio</span>
          </button>

          <button
            onClick={() => setSubTab('bulk_ipo')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: subTab === 'bulk_ipo' ? 'var(--primary)' : 'transparent',
              color: subTab === 'bulk_ipo' ? '#fff' : 'var(--text-secondary)',
              boxShadow: subTab === 'bulk_ipo' ? '0 2px 10px rgba(59, 130, 246, 0.35)' : 'none',
              transition: 'all 0.18s ease'
            }}
          >
            <Layers style={{ width: 16, height: 16 }} />
            <span>Bulk IPO (MeroShare)</span>
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'portfolio' ? (
          <Portfolio
            marketStocks={marketStocks}
            userId={userId}
            onSelectStock={onSelectStock}
          />
        ) : (
          <MeroShareHub
            userId={userId}
            marketStocks={marketStocks}
            apiStatus={apiStatus}
          />
        )}
      </div>
    </div>
  );
}
