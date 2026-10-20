import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Target, TrendingUp, Clock, AlertCircle, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { getSignals, getSignalStats } from '../../services/signalTracker.js';
import { getProxyBase } from '../../utils/liveData.js';
import { GlobalSignalTrackerModal } from './GlobalSignalTrackerModal.jsx';

// Module-level SWR-style cache: keyed by symbol, stores { signals, ts }
const _backendSignalCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL

/**
 * Normalise a backend signal ledger row into the same shape that
 * the local signalTracker.js uses, so both sources can be displayed uniformly.
 */
function normaliseBackendRow(s) {
  const statusMap = {
    ACTIVE: 'open', OPEN_ACTIVE: 'open',
    TARGET_HIT: 'hit_target', WIN_T1: 'hit_target', WIN_T2: 'hit_target',
    RATCHET_STOP_WIN: 'hit_target', WIN_RATCHET_STOP: 'hit_target',
    STOP_LOSS: 'hit_stop', STOPPED_OUT: 'hit_stop',
    TIME_STOP_STALE: 'expired', TIME_EXPIRED: 'expired',
    UNFILLABLE_SKIP: 'expired',
  };
  const mappedStatus = statusMap[String(s.status || '').toUpperCase()] || 'expired';
  return {
    id: s.signal_id || `${s.symbol}_${s.signal_date}`,
    symbol: s.symbol,
    signalDate: s.signal_date || s.entry_date,
    entryPrice: Number(s.entry_vwap ?? s.entry_price ?? s.trigger_ltp ?? 0),
    targetPrice: Number(s.target1_price ?? s.target_price ?? 0),
    target2Price: Number(s.target2_price ?? 0) || undefined,
    stopLoss: Number(s.initial_stop_price ?? s.stop_loss_price ?? 0),
    status: mappedStatus,
    outcome: mappedStatus !== 'open' ? {
      returnPct: Number((s.gross_return_pct ?? s.gross_pnl_pct ?? 0).toFixed(2)),
      netReturnPct: Number((s.net_return_pct ?? s.net_pnl_after_fees_pct ?? 0).toFixed(2)),
      holdingDays: Number(s.holding_days ?? 0),
    } : undefined,
    _fromBackend: true,
  };
}

export const SignalTrackRecord = ({ symbol, livePrice = null, allStocks = [] }) => {
  const [stats, setStats] = useState(null);
  const [recentSignals, setRecentSignals] = useState([]);
  const [showGlobalModal, setShowGlobalModal] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!symbol) return;
    const cleanSym = String(symbol).toUpperCase().trim();
    fetchedRef.current = false;

    // --- Step 1: Load local signals immediately (zero latency) ---
    const localSignals = getSignals({ symbol: cleanSym });
    localSignals.sort((a, b) => new Date(b.signalDate || 0) - new Date(a.signalDate || 0));
    const localStats = getSignalStats({ symbol: cleanSym });
    setRecentSignals(localSignals.slice(0, 5));
    setStats(localStats);

    // --- Step 2: Fetch from backend, merge & upgrade display ---
    const fetchBackend = async () => {
      if (fetchedRef.current) return;
      try {
        // Check module-level cache first
        const cached = _backendSignalCache[cleanSym];
        let backendRows;
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          backendRows = cached.signals;
        } else {
          const base = getProxyBase() || 'https://nepseapp.onrender.com';
          const res = await fetch(`${base}/api/radar/signal-track-record`, { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.signals) return;
          const all = (data.signals || [])
            .filter(s => String(s.symbol || '').toUpperCase().trim() === cleanSym)
            .map(normaliseBackendRow);
          _backendSignalCache[cleanSym] = { signals: all, ts: Date.now() };
          backendRows = all;
        }

        if (!backendRows || backendRows.length === 0) return;
        fetchedRef.current = true;

        // Merge: backend rows take precedence; local rows not in backend are appended
        const merged = [...backendRows];
        localSignals.forEach(loc => {
          const exists = backendRows.some(b => b.signalDate === loc.signalDate && Math.abs(b.entryPrice - (loc.entryPrice || 0)) < 1);
          if (!exists) merged.push(loc);
        });
        merged.sort((a, b) => new Date(b.signalDate || 0) - new Date(a.signalDate || 0));

        // Recompute stats from merged set
        const closed = merged.filter(s => s.status !== 'open' && s.status !== 'expired');
        const wins = closed.filter(s => s.status === 'hit_target');
        const losses = closed.filter(s => s.status === 'hit_stop');
        const openCount = merged.filter(s => s.status === 'open').length;
        const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
        const avgReturnPct = closed.length > 0
          ? Number((closed.reduce((sum, s) => sum + (s.outcome?.returnPct ?? 0), 0) / closed.length).toFixed(2))
          : 0;
        const avgNetReturnPct = closed.length > 0
          ? Number((closed.reduce((sum, s) => sum + (s.outcome?.netReturnPct ?? 0), 0) / closed.length).toFixed(2))
          : 0;
        const totalGain = wins.reduce((s, r) => s + Math.max(0, r.outcome?.netReturnPct ?? 0), 0);
        const totalLoss = Math.abs(losses.reduce((s, r) => s + Math.min(0, r.outcome?.netReturnPct ?? 0), 0));
        const profitFactor = totalLoss > 0 ? Number((totalGain / totalLoss).toFixed(2)) : totalGain > 0 ? Infinity : 0;
        const bestTrade = closed.reduce((best, s) => (!best || (s.outcome?.returnPct ?? 0) > (best.returnPct ?? 0))
          ? { returnPct: s.outcome?.returnPct, netReturnPct: s.outcome?.netReturnPct }
          : best, null);

        setRecentSignals(merged.slice(0, 5));
        setStats({
          total: merged.length,
          openCount,
          closedCount: closed.length,
          winRate,
          avgReturnPct,
          avgNetReturnPct,
          profitFactor,
          bestTrade,
        });
      } catch (_) {
        // Silently ignore — local data already displayed
      }
    };

    fetchBackend();
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
