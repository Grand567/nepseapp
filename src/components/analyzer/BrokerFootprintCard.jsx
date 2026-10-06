import React from 'react';
import { Layers, AlertTriangle, TrendingUp, TrendingDown, Users, ShieldAlert } from 'lucide-react';

/**
 * BrokerFootprintCard
 * Visualizes multi-session broker accumulation, operator absorption,
 * distribution offloading, and wash-trading / churn risk.
 *
 * @param {{ footprint: import('../../utils/accumulationDistributionEngine').MultiSessionBrokerFootprint, compact?: boolean }} props
 */
export function BrokerFootprintCard({ footprint, compact = false }) {
  if (!footprint || footprint.totalVolume === 0) return null;

  const {
    symbol,
    totalSessions,
    totalVolume,
    totalTurnover,
    netAccumulators = [],
    netDistributors = [],
    smartMoneyStance,
    stanceExplanation,
    topBrokerDominancePct,
    washTradingRisk
  } = footprint;

  // Stance styling
  let stanceLabel = 'Retail Fragmented';
  let stanceColor = '#94a3b8';
  let stanceBg = 'rgba(148, 163, 184, 0.1)';
  let stanceBorder = 'rgba(148, 163, 184, 0.25)';
  let StanceIcon = Users;

  if (smartMoneyStance === 'OPERATOR_ACCUMULATION') {
    stanceLabel = `Operator Accumulation (${topBrokerDominancePct}%)`;
    stanceColor = '#34d399';
    stanceBg = 'rgba(16, 185, 129, 0.12)';
    stanceBorder = 'rgba(16, 185, 129, 0.35)';
    StanceIcon = TrendingUp;
  } else if (smartMoneyStance === 'OPERATOR_DISTRIBUTION') {
    stanceLabel = `Operator Distribution (${topBrokerDominancePct}%)`;
    stanceColor = '#f87171';
    stanceBg = 'rgba(239, 68, 68, 0.12)';
    stanceBorder = 'rgba(239, 68, 68, 0.35)';
    StanceIcon = TrendingDown;
  } else if (smartMoneyStance === 'CHURN_CROSS_TRADING') {
    stanceLabel = 'Dual-Sided Churn / Wash Risk';
    stanceColor = '#fbbf24';
    stanceBg = 'rgba(245, 158, 11, 0.12)';
    stanceBorder = 'rgba(245, 158, 11, 0.35)';
    StanceIcon = ShieldAlert;
  }

  if (compact) {
    return (
      <div style={{
        background: stanceBg,
        border: `1px solid ${stanceBorder}`,
        borderRadius: 12,
        padding: '10px 14px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StanceIcon style={{ width: 16, height: 16, color: stanceColor }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: stanceColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Smart Money Flow: {stanceLabel}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>
              {stanceExplanation}
            </div>
          </div>
        </div>
        {topBrokerDominancePct > 0 && (
          <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
            Dominance: <span style={{ color: stanceColor }}>{topBrokerDominancePct}%</span>
          </div>
        )}
      </div>
    );
  }

  const formatLakhs = (val) => {
    if (!val || Math.abs(val) === 0) return '0';
    const abs = Math.abs(val);
    if (abs >= 1e7) return `${(val / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${(val / 1e5).toFixed(2)} Lakh`;
    return val.toLocaleString();
  };

  return (
    <div style={{
      background: '#151922',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 14,
      padding: 14,
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers style={{ width: 16, height: 16, color: '#60a5fa' }} />
            Multi-Session Smart Money Footprint ({totalSessions} Sessions)
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            Aggregated institutional broker accumulation vs distribution volume
          </div>
        </div>

        <span style={{
          background: stanceBg,
          border: `1px solid ${stanceBorder}`,
          borderRadius: 20,
          padding: '3px 10px',
          fontSize: 12,
          fontWeight: 800,
          color: stanceColor,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <StanceIcon style={{ width: 12, height: 12 }} />
          {stanceLabel}
        </span>
      </div>

      {/* Explanation banner */}
      <div style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
        color: '#cbd5e1',
        marginBottom: 12,
        lineHeight: 1.4
      }}>
        💡 {stanceExplanation}
      </div>

      {/* Wash Trading Warning Banner */}
      {washTradingRisk && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          color: '#fbbf24',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span>
            <strong>Wash Trading / Churn Warning:</strong> High-volume dual-sided matched orders detected within identical broker desks. Retail investors should avoid chasing artificial volume.
          </span>
        </div>
      )}

      {/* Two columns: Accumulators vs Distributors */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {/* Net Accumulators */}
        <div style={{
          background: 'rgba(16, 185, 129, 0.03)',
          border: '1px solid rgba(16, 185, 129, 0.18)',
          borderRadius: 10,
          padding: 10
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bull)', textTransform: 'uppercase', marginBottom: 8 }}>
            🟢 Top Net Accumulators (खरिदकर्ता)
          </div>
          {netAccumulators.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {netAccumulators.map((b) => (
                <div key={b.broker} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '6px 8px',
                  borderRadius: 6,
                  fontSize: 12
                }}>
                  <div>
                    <span style={{ fontWeight: 800, color: '#ffffff' }}>#{b.broker}</span>
                    <span style={{ color: '#94a3b8', marginLeft: 5, fontSize: 12 }}>{b.brokerName}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ color: 'var(--bull)', fontWeight: 800 }}>+{b.netQty.toLocaleString()} shares</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Rs. {formatLakhs(b.netAmount)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b', padding: '10px 0', textAlign: 'center' }}>
              No net buyers with significant float absorption
            </div>
          )}
        </div>

        {/* Net Distributors */}
        <div style={{
          background: 'rgba(239, 68, 68, 0.03)',
          border: '1px solid rgba(239, 68, 68, 0.18)',
          borderRadius: 10,
          padding: 10
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#f87171', textTransform: 'uppercase', marginBottom: 8 }}>
            🔴 Top Net Distributors (बिक्रीकर्ता)
          </div>
          {netDistributors.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {netDistributors.map((b) => (
                <div key={b.broker} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '6px 8px',
                  borderRadius: 6,
                  fontSize: 12
                }}>
                  <div>
                    <span style={{ fontWeight: 800, color: '#ffffff' }}>#{b.broker}</span>
                    <span style={{ color: '#94a3b8', marginLeft: 5, fontSize: 12 }}>{b.brokerName}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ color: '#f87171', fontWeight: 800 }}>{b.netQty.toLocaleString()} shares</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Rs. {formatLakhs(b.netAmount)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b', padding: '10px 0', textAlign: 'center' }}>
              No net sellers with significant distribution pressure
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
