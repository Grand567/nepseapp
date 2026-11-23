import React, { useState, useEffect } from 'react';
import { getDetailedMarketStatus, latestTradingSession } from '../utils/nepseCalendar.js';
import { RefreshCw, AlertTriangle, Clock } from 'lucide-react';

/**
 * ============================================================================
 * UNIVERSAL SESSION FRESHNESS & STALENESS BADGE (PHASE 4 FIX 6)
 * ============================================================================
 * Standardized freshness status component rendered across all main views.
 * Displays:
 *  - LIVE vs CLOSED market status badge
 *  - 'As of <session date> <time>'
 *  - Staleness warning if last update > 2 minutes during active market hours
 *  - Warming up indicator during cold-start or initial sync
 * ============================================================================
 */
export default function SessionFreshnessBadge({
  lastUpdatedMs = null,
  sessionDate = null,
  isWarmingUp = false,
  staleThresholdMs = 2 * 60 * 1000,
  compact = false,
  isLive = false,
  apiStatus = null,
  hasLiveTrades = false,
  isHistorical = false,
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000); // 10s tick
    return () => clearInterval(timer);
  }, []);

  const mktStatus = getDetailedMarketStatus(now);
  const isOpen = Boolean(mktStatus?.isOpen && !mktStatus?.isEmergencyHalt);
  const isMarketOpen = Boolean(isOpen || isLive || apiStatus === 'live');
  const todayTradingDate = latestTradingSession(now, false);
  const effectiveSessionDate = sessionDate || latestTradingSession(now, !isMarketOpen);
  const parsedLastMs = lastUpdatedMs != null ? Number(lastUpdatedMs) : null;
  const hasValidLastUpdate = Number.isFinite(parsedLastMs) && parsedLastMs > 0;
  const timeStr = hasValidLastUpdate
    ? new Date(parsedLastMs).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kathmandu',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : '';

  if (isWarmingUp) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#38bdf8' }}>
        <RefreshCw className="animate-spin" style={{ width: 12, height: 12 }} />
        <span>Syncing session {effectiveSessionDate}...</span>
      </div>
    );
  }

  // Explicit user-selected historical session: show neutral historical indicator
  if (isHistorical || (sessionDate && sessionDate !== todayTradingDate && isHistorical)) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(148, 163, 184, 0.12)', border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#94a3b8' }}>
        <Clock style={{ width: 12, height: 12 }} />
        <span>Historical • Showing {effectiveSessionDate}</span>
      </div>
    );
  }

  const lagMs = hasValidLastUpdate ? Math.max(0, now.getTime() - parsedLastMs) : Infinity;
  const isStale = isMarketOpen && hasValidLastUpdate && lagMs > staleThresholdMs;

  if (isMarketOpen) {
    // Genuine stale/offline fallback when market is open but feed is showing older session
    const isShowingOlderSession = Boolean(effectiveSessionDate && effectiveSessionDate !== todayTradingDate);
    const isStaleOfflineFallback = apiStatus === 'yesterday' || (!hasLiveTrades && !isLive && isShowingOlderSession);

    if (isShowingOlderSession && (!hasValidLastUpdate || isStaleOfflineFallback)) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#fbbf24' }}>
          <AlertTriangle style={{ width: 12, height: 12 }} />
          <span>Awaiting Live Feed • Showing {effectiveSessionDate}</span>
        </div>
      );
    }

    // Active market hours data lag (> 2 min lag)
    if (isStale) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#fbbf24' }}>
          <AlertTriangle style={{ width: 12, height: 12 }} />
          <span>⚠️ Data Lag ({Math.round(lagMs / 60000)}m) • Last tick {effectiveSessionDate} {timeStr} NPT</span>
        </div>
      );
    }

    // Live session active (green live indicator)
    const liveText = compact
      ? `LIVE • ${effectiveSessionDate}`
      : `LIVE • As of ${effectiveSessionDate}${timeStr ? ` ${timeStr} NPT` : ''}`;

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#34d399' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #10b981', display: 'inline-block' }} />
        <span>{liveText}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(148, 163, 184, 0.12)', border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: 8, padding: compact ? '2px 8px' : '4px 10px', fontSize: compact ? 10.5 : 12, fontWeight: 700, color: '#94a3b8' }}>
      <Clock style={{ width: 12, height: 12 }} />
      <span>Market Closed • Showing {effectiveSessionDate}</span>
    </div>
  );
}
