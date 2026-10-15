import React, { useState, useEffect } from 'react';
import { ShieldCheck, Target, TrendingUp, Clock, AlertCircle, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { getSignals, getSignalStats } from '../../services/signalTracker.js';
import { GlobalSignalTrackerModal } from './GlobalSignalTrackerModal.jsx';

export const SignalTrackRecord = ({ symbol, livePrice = null, allStocks = [] }) => {
  const [stats, setStats] = useState(null);
  const [recentSignals, setRecentSignals] = useState([]);
  const [showGlobalModal, setShowGlobalModal] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    const cleanSym = String(symbol).toUpperCase().trim();
    const signals = getSignals({ symbol: cleanSym });
    signals.sort((a, b) => new Date(b.signalDate || 0) - new Date(a.signalDate || 0));

    setRecentSignals(signals.slice(0, 5));
    setStats(getSignalStats({ symbol: cleanSym }));
  }, [symbol]);

  const cleanSym = symbol ? String(symbol).toUpperCase().trim() : '';

  if (!stats || stats.total === 0) {
    return (
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '16px 18px',
        marginTop: 16,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 240 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldCheck style={{ width: 18, height: 18, color: '#34d399' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>
              Algorithmic Track Record • {cleanSym}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              No past setups archived for {cleanSym}. Verified signals are automatically logged and tracked against live market ticks.
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowGlobalModal(true)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 11.5,
            fontWeight: 700,
            color: '#cbd5e1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}
        >
          <span>Market Audit</span>
          <ExternalLink size={12} />
        </button>

        {showGlobalModal && (
          <GlobalSignalTrackerModal
            isOpen={showGlobalModal}
            onClose={() => setShowGlobalModal(false)}
            marketStocks={allStocks}
          />
        )}
      </div>
    );
  }

  const { total, openCount, closedCount, winRate, avgReturnPct, avgNetReturnPct, profitFactor, bestTrade } = stats;
  const activeSignal = recentSignals.find(s => s.status === 'open');

  return (
    <div style={{
      background: '#111827',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 16,
      padding: '16px 18px',
      marginTop: 16,
      boxShadow: '0 4px 14px rgba(0,0,0,0.35)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldCheck style={{ width: 17, height: 17, color: '#34d399' }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              Algorithmic Track Record • {cleanSym}
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
              Forward out-of-sample execution audit
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11.5,
            fontWeight: 800,
            padding: '3px 9px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.06)',
            color: '#cbd5e1'
          }}>
            {total} Total Setups
          </span>
          {openCount > 0 && (
            <span style={{
              fontSize: 11.5,
              fontWeight: 800,
              padding: '3px 9px',
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24'
            }}>
              {openCount} Active
            </span>
          )}
          <button
            onClick={() => setShowGlobalModal(true)}
            title="Open Market-Wide Signal Tracker"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '4px 8px',
              fontSize: 11,
              fontWeight: 700,
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span>All Setups</span>
            <ExternalLink size={11} />
          </button>
        </div>
      </div>

      {/* Active Signal Live Banner */}
      {activeSignal && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                background: '#f59e0b',
                color: '#000000',
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: 10.5,
                fontWeight: 900
              }}>
                ACTIVE SETUP
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
                Triggered on {activeSignal.signalDate} at Rs. {activeSignal.entryPrice}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 4 }}>
              T1: <strong style={{ color: '#34d399' }}>Rs. {activeSignal.targetPrice}</strong>
              {activeSignal.target2Price && <> • T2: <strong style={{ color: '#2dd4bf' }}>Rs. {activeSignal.target2Price}</strong></>}
              {' • '}
              Stop: <strong style={{ color: '#f87171' }}>Rs. {activeSignal.stopLoss}</strong>
            </div>
          </div>

          {livePrice != null && activeSignal.entryPrice > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Live P&L</div>
              <div style={{
                fontSize: 14,
                fontWeight: 900,
                fontFamily: 'var(--font-mono, monospace)',
                color: livePrice >= activeSignal.entryPrice ? '#34d399' : '#f87171'
              }}>
                {livePrice >= activeSignal.entryPrice ? '+' : ''}
                {(((livePrice - activeSignal.entryPrice) / activeSignal.entryPrice) * 100).toFixed(2)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: 8,
        marginBottom: 14
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Win Rate</div>
          <div style={{
            fontSize: 18,
            fontWeight: 900,
            fontFamily: 'var(--font-mono, monospace)',
            color: closedCount === 0 ? '#94a3b8' : winRate >= 50 ? '#34d399' : '#f87171',
            marginTop: 2
          }}>
            {closedCount > 0 ? `${winRate.toFixed(1)}%` : 'Pending'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {closedCount} resolved
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Avg Return</div>
          <div style={{
            fontSize: 18,
            fontWeight: 900,
            fontFamily: 'var(--font-mono, monospace)',
            color: closedCount === 0 ? '#94a3b8' : avgReturnPct >= 0 ? '#34d399' : '#f87171',
            marginTop: 2
          }}>
            {closedCount > 0 ? `${avgReturnPct >= 0 ? '+' : ''}${avgReturnPct}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {avgNetReturnPct != null ? `${avgNetReturnPct >= 0 ? '+' : ''}${avgNetReturnPct}% Net` : 'Per closed trade'}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Profit Factor</div>
          <div style={{
            fontSize: 18,
            fontWeight: 900,
            fontFamily: 'var(--font-mono, monospace)',
            color: '#c084fc',
            marginTop: 2
          }}>
            {closedCount > 0 && profitFactor ? `${profitFactor}x` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Gains vs Losses
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px'
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Best Trade</div>
          <div style={{
            fontSize: 15,
            fontWeight: 900,
            fontFamily: 'var(--font-mono, monospace)',
            color: '#34d399',
            marginTop: 4
          }}>
            {bestTrade?.returnPct != null ? `+${bestTrade.returnPct}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {bestTrade?.netReturnPct != null ? `+${bestTrade.netReturnPct}% Net` : 'Max gain'}
          </div>
        </div>
      </div>

      {/* Recent Signals Table */}
      {recentSignals.length > 0 && (
        <div style={{
          overflowX: 'auto',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.05)',
          marginBottom: 10
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Signal Date</th>
                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Entry / Targets</th>
                <th style={{ padding: '8px 10px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Return</th>
              </tr>
            </thead>
            <tbody>
              {recentSignals.map(sig => {
                const isTargetHit = sig.status === 'hit_target';
                const isStopHit = sig.status === 'hit_stop';
                const isManualClose = sig.status === 'manual_close';
                const isExpired = sig.status === 'expired';
                const isOpen = sig.status === 'open';
                const ret = sig.outcome?.returnPct;
                const netRet = sig.outcome?.netReturnPct;

                return (
                  <tr key={sig.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '8px 10px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{sig.signalDate}</div>
                      {sig.outcome?.holdingDays && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {sig.outcome.holdingDays} session(s)
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '8px 10px', color: '#94a3b8' }}>
                      <div>
                        Entry: <strong style={{ color: '#ffffff' }}>Rs. {sig.entryPrice}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        T1: Rs. {sig.targetPrice || '—'}
                        {sig.target2Price && ` • T2: Rs. ${sig.target2Price}`}
                        {' • '}SL: Rs. {sig.stopLoss || '—'}
                      </div>
                    </td>

                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        background: isTargetHit
                          ? 'rgba(16, 185, 129, 0.15)'
                          : isStopHit
                            ? 'rgba(239, 68, 68, 0.15)'
                            : isOpen
                              ? 'rgba(245, 158, 11, 0.15)'
                              : isManualClose
                                ? 'rgba(99, 102, 241, 0.15)'
                                : 'rgba(148, 163, 184, 0.15)',
                        color: isTargetHit
                          ? '#34d399'
                          : isStopHit
                            ? '#f87171'
                            : isOpen
                              ? '#fbbf24'
                              : isManualClose
                                ? '#a5b4fc'
                                : '#94a3b8'
                      }}>
                        {isTargetHit && <CheckCircle2 size={12} />}
                        {isStopHit && <XCircle size={12} />}
                        {isOpen && <Clock size={12} />}
                        {isExpired && <AlertCircle size={12} />}
                        {sig.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </td>

                    <td style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono, monospace)'
                    }}>
                      {isOpen ? (
                        <span style={{ color: '#fbbf24' }}>Active</span>
                      ) : (
                        <div>
                          <div style={{ color: ret > 0 ? '#34d399' : ret < 0 ? '#f87171' : '#94a3b8' }}>
                            {ret > 0 ? `+${ret}%` : `${ret}%`}
                          </div>
                          {netRet != null && (
                            <div style={{ fontSize: 10, color: netRet >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                              {netRet >= 0 ? `+${netRet}%` : `${netRet}%`} Net
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer note */}
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
        Automated out-of-sample forward tracking • Net returns reflect 0.40% brokerage, 0.015% SEBON fee, and 7.5% retail CGT.
      </div>

      {showGlobalModal && (
        <GlobalSignalTrackerModal
          isOpen={showGlobalModal}
          onClose={() => setShowGlobalModal(false)}
          marketStocks={allStocks}
        />
      )}
    </div>
  );
};
