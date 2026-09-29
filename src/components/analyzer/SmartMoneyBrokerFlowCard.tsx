import React from 'react';
import { Shield, ShieldAlert, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Users, Target } from 'lucide-react';

interface SmartMoneyBrokerFlowCardProps {
  symbol: string;
  brokerAnalysis?: any;
  quantMetrics?: any;
  pChange?: number;
  ltp?: number;
}

export function SmartMoneyBrokerFlowCard({
  symbol,
  brokerAnalysis,
  quantMetrics,
  pChange = 0,
  ltp = 0
}: SmartMoneyBrokerFlowCardProps) {
  const brokerCornering = quantMetrics?.brokerCornering || {};
  const bcr5 = Number(brokerAnalysis?.bcr5BuyPct || brokerCornering.cr5BuyPct || 0);
  const bcr3 = Number(brokerAnalysis?.bcr3BuyPct || (bcr5 > 0 ? (bcr5 * 0.72).toFixed(1) : 0));
  const bcr3Sell = Number(brokerAnalysis?.bcr3SellPct || 0);

  const topBuyers = Array.isArray(brokerAnalysis?.topBuyers)
    ? brokerAnalysis.topBuyers
    : Array.isArray(brokerAnalysis?.topBuyerBrokers)
    ? brokerAnalysis.topBuyerBrokers
    : [];

  const topSellers = Array.isArray(brokerAnalysis?.topSellers)
    ? brokerAnalysis.topSellers
    : Array.isArray(brokerAnalysis?.topSellerBrokers)
    ? brokerAnalysis.topSellerBrokers
    : [];

  const isDumping = Boolean(
    brokerCornering.isInstitutionalDumping ||
    (brokerAnalysis?.adSignal === 'Distribution' && (Number(brokerAnalysis?.adStrength || 0) >= 30 || Number(brokerAnalysis?.adRatio || 0) <= -0.08)) ||
    (bcr3Sell >= 38.0 && bcr3Sell > bcr3)
  );

  // Distribution Trap Warning:
  // "If top brokers are net selling (dumping) into retail excitement, do not buy, even if the chart looks green."
  const isGreenOrExcited = pChange >= 0;
  const isDistributionTrap = isDumping && isGreenOrExcited;

  // Institutional Accumulation:
  // "Top 3 brokers (e.g., Broker 58, 45, 34) account for >40% of all buy volume in large blocks, while selling is distributed across dozens of retail brokers."
  const isInstitutionalAccumulation = (bcr3 >= 40.0 || (bcr5 >= 50.0 && bcr3 >= 36.0)) && !isDistributionTrap;

  const top3BuyerNames = topBuyers.slice(0, 3).map((b: any) => {
    const id = b.broker || b.brokerNo || b.id || '';
    return `#${id}`;
  }).filter(Boolean);

  const top3SellerNames = topSellers.slice(0, 3).map((s: any) => {
    const id = s.broker || s.brokerNo || s.id || '';
    return `#${id}`;
  }).filter(Boolean);

  return (
    <div style={{
      borderRadius: 18,
      border: isDistributionTrap
        ? '1px solid rgba(244, 63, 94, 0.4)'
        : isInstitutionalAccumulation
        ? '1px solid rgba(16, 185, 129, 0.4)'
        : '1px solid rgba(255, 255, 255, 0.08)',
      background: isDistributionTrap
        ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)'
        : isInstitutionalAccumulation
        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.95) 100%)'
        : 'var(--bg-card, #151922)',
      padding: '14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      maxWidth: '100%',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
          <div style={{
            padding: '3px 8px',
            borderRadius: 8,
            background: isDistributionTrap ? 'rgba(244, 63, 94, 0.2)' : isInstitutionalAccumulation ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
            border: isDistributionTrap ? '1px solid rgba(244, 63, 94, 0.4)' : isInstitutionalAccumulation ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
            color: isDistributionTrap ? '#fb7185' : isInstitutionalAccumulation ? '#34d399' : '#60a5fa',
            fontWeight: 900,
            fontSize: 10,
            letterSpacing: '0.05em',
            flexShrink: 0
          }}>
            STEP 4
          </div>
          <div style={{ minWidth: 0 }}>
            <h4 style={{ fontSize: 13, fontWeight: 900, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Shield size={15} color={isDistributionTrap ? '#f43f5e' : isInstitutionalAccumulation ? '#10b981' : '#3b82f6'} style={{ flexShrink: 0 }} />
              <span>Smart Money Flow ({symbol})</span>
            </h4>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1, lineHeight: 1.2 }}>
              Institutional block accumulation (&gt;40%) vs retail dump traps
            </div>
          </div>
        </div>

        {/* Verdict Badge */}
        <div style={{ flexShrink: 0 }}>
          {isDistributionTrap ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'rgba(244, 63, 94, 0.2)',
              border: '1px solid rgba(244, 63, 94, 0.5)',
              color: '#fda4af',
              fontSize: 10.5,
              fontWeight: 900,
              letterSpacing: '0.02em',
              animation: 'pulse 2s infinite'
            }}>
              🚨 DUMP TRAP: DO NOT BUY
            </span>
          ) : isInstitutionalAccumulation ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.5)',
              color: '#6ee7b7',
              fontSize: 10.5,
              fontWeight: 900,
              letterSpacing: '0.02em'
            }}>
              🟢 ACCUMULATION ({bcr3}%)
            </span>
          ) : (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'rgba(148, 163, 184, 0.12)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              color: '#cbd5e1',
              fontSize: 10.5,
              fontWeight: 800
            }}>
              ⚪ BROAD RETAIL FLOW
            </span>
          )}
        </div>
      </div>

      {/* 2 Rules Inspection Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {/* Rule 1: Institutional Accumulation */}
        <div style={{
          padding: '10px 12px',
          borderRadius: 12,
          background: isInstitutionalAccumulation ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0, 0, 0, 0.25)',
          border: isInstitutionalAccumulation ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#34d399', display: 'flex', alignItems: 'center', gap: 5 }}>
              <TrendingUp size={13} /> 1. Top 3 Buy Share
            </span>
            <span style={{ fontSize: 12, fontWeight: 900, color: bcr3 >= 40.0 ? '#34d399' : '#cbd5e1', fontFamily: 'monospace' }}>
              {bcr3 > 0 ? `${bcr3}%` : '—'} {bcr3 >= 40.0 ? '(≥40% Met)' : '(Target >40%)'}
            </span>
          </div>

          <div style={{ width: '100%', height: 6, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, bcr3)}%`,
              height: '100%',
              background: bcr3 >= 40.0 ? '#10b981' : '#64748b',
              borderRadius: 99,
              transition: 'width 0.3s ease'
            }} />
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
            {top3BuyerNames.length > 0 ? (
              <span>Top 3 Buyers: <strong style={{ color: '#ffffff' }}>{top3BuyerNames.join(', ')}</strong></span>
            ) : (
              <span>Top buyer concentration monitored via floorsheet vault</span>
            )}
            {bcr3 >= 40.0 && <span style={{ color: '#34d399', marginLeft: 6 }}>✓ Concentrated block buying detected</span>}
          </div>
        </div>

        {/* Rule 2: Distribution Trap Warning */}
        <div style={{
          padding: '10px 12px',
          borderRadius: 12,
          background: isDistributionTrap ? 'rgba(244, 63, 94, 0.12)' : 'rgba(0, 0, 0, 0.25)',
          border: isDistributionTrap ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: isDistributionTrap ? '#fb7185' : '#f59e0b', display: 'flex', alignItems: 'center', gap: 5 }}>
              <TrendingDown size={13} /> 2. Distribution Trap Monitor
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 900, color: isDistributionTrap ? '#fb7185' : '#34d399', fontFamily: 'monospace' }}>
              {isDistributionTrap ? 'TRAP DETECTED' : 'CLEAR'}
            </span>
          </div>

          <div style={{ fontSize: 11.5, color: '#e2e8f0', lineHeight: 1.4 }}>
            {isDistributionTrap ? (
              <span style={{ color: '#fca5a5', fontWeight: 600 }}>
                🚨 <strong>Do Not Buy:</strong> Top institutional brokers ({top3SellerNames.join(', ') || 'Smart Money'}) are net selling into retail enthusiasm, despite the green price action (+{pChange}%).
              </span>
            ) : isInstitutionalAccumulation ? (
              <span style={{ color: '#a7f3d0' }}>
                ✓ No active distribution trap detected. Top institutional firms are absorbing supply.
              </span>
            ) : (
              <span style={{ color: '#94a3b8' }}>
                Selling is distributed across broad retail participants without predatory operator dumping.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
