import React, { useState } from 'react';
import {
  TrendingUp, TrendingDown, Zap, AlertTriangle, CheckCircle,
  Activity, X, ChevronRight, BarChart2, Flame, Layers
} from 'lucide-react';

export default function StockSignalsCard({ signals = [], symbol = '' }) {
  const [showAllModal, setShowAllModal] = useState(false);

  if (!signals || signals.length === 0) {
    return (
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '16px 18px',
        marginBottom: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Zap style={{ width: 16, height: 16, color: '#38bdf8' }} />
          <span style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>Signals</span>
        </div>
        <div style={{ fontSize: 12.5, color: '#94a3b8' }}>
          No abnormal volume spikes or divergence signals detected in the latest session.
        </div>
      </div>
    );
  }

  const topSignals = signals.slice(0, 4);

  return (
    <>
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '16px 18px',
        marginBottom: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Zap style={{ width: 14, height: 14, color: '#38bdf8' }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>Signals</span>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
            background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981'
          }}>
            {signals.length} Active Observations
          </span>
        </div>

        {/* List of Top Signals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {topSignals.map((sig, idx) => {
            const isMajor = sig.type === 'MAJOR';
            return (
              <div
                key={sig.id || idx}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: isMajor ? '1px solid rgba(244, 63, 94, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start'
                }}
              >
                {/* Icon box */}
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: sig.isBullish ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                  border: `1px solid ${sig.isBullish ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {sig.isBullish ? (
                    <TrendingUp style={{ width: 16, height: 16, color: '#10b981' }} />
                  ) : (
                    <TrendingDown style={{ width: 16, height: 16, color: '#f43f5e' }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>
                      {sig.title}
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 900, padding: '2px 7px', borderRadius: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      background: isMajor ? 'rgba(244, 63, 94, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                      border: isMajor ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                      color: isMajor ? '#f43f5e' : '#f59e0b'
                    }}>
                      • {sig.type}
                    </div>
                  </div>

                  <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.45, marginBottom: 6 }}>
                    {sig.description}
                  </div>

                  <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>🕒 {sig.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* View all signals button */}
        {signals.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllModal(true)}
            style={{
              width: '100%',
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
          >
            <Activity style={{ width: 14, height: 14 }} />
            <span>View all {signals.length} signals</span>
          </button>
        )}

        {/* Disclaimer footer */}
        <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 10 }}>
          ⓘ Automated observations, not investment advice.
        </div>
      </div>

      {/* Modal for All Signals */}
      {showAllModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 20,
            maxWidth: 520,
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap style={{ width: 18, height: 18, color: '#38bdf8' }} />
                <span style={{ fontSize: 16, fontWeight: 900, color: '#ffffff' }}>
                  {symbol} Automated Signals ({signals.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAllModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  borderRadius: 8,
                  padding: 6,
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {signals.map((sig, idx) => {
                const isMajor = sig.type === 'MAJOR';
                return (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: isMajor ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '12px 14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff' }}>
                        {sig.title}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 900, padding: '2px 7px', borderRadius: 6,
                        background: isMajor ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: isMajor ? '#f43f5e' : '#f59e0b'
                      }}>
                        {sig.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.45, marginBottom: 6 }}>
                      {sig.description}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Timestamp: {sig.timestamp}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
