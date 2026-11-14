/**
 * ============================================================================
 * DATA FRESHNESS TRACKER (PHASE 4 FIX 7)
 * ============================================================================
 * Central registry and telemetry engine tracking last fetch, session date,
 * last processed time, and latency/staleness lag per data source and feature.
 * Powers the administrative endpoint: GET /api/admin/data-freshness
 * ============================================================================
 */

import { isMarketOpen, latestTradingSession, formatNptDateIso } from './tradingCalendar.mjs';

export const TRACKED_SOURCES = [
  'nots_live',
  'sharesansar_today_prices',
  'floorsheet_stream',
  'market_summary',
  'sqlite_ledger',
  'macro_cache'
];

export const TRACKED_FEATURES = [
  'overview_1d',
  'timeframes_multi_window',
  'broker_flow',
  'market_depth',
  'broker_cornering',
  'smart_money'
];

class DataFreshnessRegistry {
  constructor() {
    this.sources = {};
    this.features = {};
    this.reset();
  }

  reset() {
    const initDate = latestTradingSession(new Date(), true);
    const nowIso = new Date().toISOString();

    for (const src of TRACKED_SOURCES) {
      this.sources[src] = {
        source: src,
        lastFetchUtc: nowIso,
        sessionDate: initDate,
        lastProcessedUtc: nowIso,
        itemsCount: 0,
        status: 'initialized'
      };
    }

    for (const feat of TRACKED_FEATURES) {
      this.features[feat] = {
        feature: feat,
        lastFetchUtc: nowIso,
        sessionDate: initDate,
        lastProcessedUtc: nowIso,
        itemsCount: 0,
        status: 'initialized'
      };
    }
  }

  recordFetch(name, { sessionDate = null, itemsCount = 0, status = 'active' } = {}, now = new Date()) {
    const iso = now.toISOString();
    const effectiveSession = sessionDate || latestTradingSession(now, !isMarketOpen(now));

    if (this.sources[name]) {
      this.sources[name].lastFetchUtc = iso;
      this.sources[name].sessionDate = effectiveSession;
      if (itemsCount) this.sources[name].itemsCount = itemsCount;
      this.sources[name].status = status;
    }
    if (this.features[name]) {
      this.features[name].lastFetchUtc = iso;
      this.features[name].sessionDate = effectiveSession;
      if (itemsCount) this.features[name].itemsCount = itemsCount;
      this.features[name].status = status;
    }
  }

  recordProcessed(name, { sessionDate = null, itemsCount = 0, status = 'synced' } = {}, now = new Date()) {
    const iso = now.toISOString();
    const effectiveSession = sessionDate || latestTradingSession(now, !isMarketOpen(now));

    if (this.sources[name]) {
      this.sources[name].lastProcessedUtc = iso;
      this.sources[name].sessionDate = effectiveSession;
      if (itemsCount) this.sources[name].itemsCount = itemsCount;
      this.sources[name].status = status;
    }
    if (this.features[name]) {
      this.features[name].lastProcessedUtc = iso;
      this.features[name].sessionDate = effectiveSession;
      if (itemsCount) this.features[name].itemsCount = itemsCount;
      this.features[name].status = status;
    }
  }

  getStatus(now = new Date(), staleThresholdSec = 120) {
    const open = isMarketOpen(now);
    const expectedSession = latestTradingSession(now, !open);
    const nowMs = now.getTime();

    const evaluateItem = (item) => {
      const fetchMs = item.lastFetchUtc ? new Date(item.lastFetchUtc).getTime() : 0;
      const lagSeconds = fetchMs > 0 ? Math.max(0, Math.floor((nowMs - fetchMs) / 1000)) : 999999;
      
      let isStale = false;
      let staleReason = null;

      if (open) {
        if (lagSeconds > staleThresholdSec) {
          isStale = true;
          staleReason = `Data fetch lag (${lagSeconds}s) exceeds threshold (${staleThresholdSec}s) during market hours`;
        }
      } else {
        // Closed market: data must match the latest closed trading session
        if (item.sessionDate && item.sessionDate < expectedSession) {
          isStale = true;
          staleReason = `Data session date (${item.sessionDate}) lags behind exchange latest closed session (${expectedSession})`;
        }
      }

      return {
        ...item,
        lagSeconds,
        isStale,
        staleReason
      };
    };

    const sourcesReport = Object.keys(this.sources).map(k => evaluateItem(this.sources[k]));
    const featuresReport = Object.keys(this.features).map(k => evaluateItem(this.features[k]));

    const anyStale = sourcesReport.some(s => s.isStale) || featuresReport.some(f => f.isStale);

    return {
      success: true,
      asOfUtc: now.toISOString(),
      asOfNptDate: formatNptDateIso(now),
      isMarketOpen: open,
      expectedSessionDate: expectedSession,
      systemHealth: anyStale ? 'DEGRADED_STALE' : 'OPTIMAL_FRESH',
      sources: sourcesReport,
      features: featuresReport
    };
  }
}

export const dataFreshnessTracker = new DataFreshnessRegistry();
