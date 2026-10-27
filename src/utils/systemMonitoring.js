/**
 * src/utils/systemMonitoring.js
 * Comprehensive System Health & Diagnostics Engine for Drabyashree NEPSE
 *
 * Implements:
 * 1. Data Completeness Monitoring: Stored rows vs Exchange reported count with discrepancy alerting.
 * 2. Scraper Failure Telemetry: Tracking success rates, consecutive failures, and provider degradation.
 * 3. Stale Data Detection: Real-time vs Session-relative staleness checks against NEPSE calendar hours.
 * 4. Error Logging & Diagnostics Aggregation: Rolling circular buffer for operational transparency.
 */

import { isNepseWeekend, isNepsePublicHoliday, getDetailedMarketStatus } from './nepseCalendar.js';

/**
 * Evaluates daily ingestion data completeness against exchange-reported volumes
 */
export function evaluateCompletenessHealth({
  completenessRecord = null,
  expectedTradingDate = null,
  now = new Date()
} = {}) {
  // If no record is available
  if (!completenessRecord) {
    // Check if the expected date was indeed a trading day
    const isWeekend = isNepseWeekend(now).isWeekend;
    const isHoliday = isNepsePublicHoliday(now).isHoliday;
    const isTradingSessionExpected = !isWeekend && !isHoliday;

    if (isTradingSessionExpected && expectedTradingDate) {
      return {
        status: 'CRITICAL',
        code: 'MISSING_SESSION',
        completenessPct: 0,
        storedRowCount: 0,
        exchangeReportedCount: 0,
        tradeDate: expectedTradingDate,
        warningMessage: `CRITICAL: Missing ingestion record for required trading session (${expectedTradingDate}). Exchange data was not persisted.`
      };
    }

    return {
      status: 'HEALTHY',
      code: 'OFF_MARKET_GRACE',
      completenessPct: 100,
      storedRowCount: 0,
      exchangeReportedCount: 0,
      tradeDate: expectedTradingDate || null,
      warningMessage: null
    };
  }

  const stored = Number(completenessRecord.stored_row_count ?? completenessRecord.storedRowCount ?? 0);
  const reported = Number(completenessRecord.exchange_reported_count ?? completenessRecord.exchangeReportedCount ?? 0);
  const rawPct = Number(completenessRecord.completeness_pct ?? completenessRecord.completenessPct ?? 0);
  const tradeDate = completenessRecord.trade_date || completenessRecord.tradeDate || 'Unknown';
  const customWarning = completenessRecord.warning_message || completenessRecord.warningMessage || null;

  // Calculate actual percentage if reported > 0
  const pct = reported > 0 ? Number(((stored / reported) * 100).toFixed(2)) : (stored > 0 ? 100 : rawPct);

  if (pct >= 98) {
    return {
      status: 'HEALTHY',
      code: 'COMPLETE',
      completenessPct: pct,
      storedRowCount: stored,
      exchangeReportedCount: reported,
      tradeDate,
      warningMessage: customWarning
    };
  }

  if (pct >= 80) {
    return {
      status: 'WARNING',
      code: 'PARTIAL_DISCREPANCY',
      completenessPct: pct,
      storedRowCount: stored,
      exchangeReportedCount: reported,
      tradeDate,
      warningMessage: customWarning || `Warning: Data discrepancy on ${tradeDate} (Stored: ${stored.toLocaleString()}, Reported: ${reported.toLocaleString()}, Completeness: ${pct}%)`
    };
  }

  return {
    status: 'CRITICAL',
    code: 'INCOMPLETE_DATA_LOSS',
    completenessPct: pct,
    storedRowCount: stored,
    exchangeReportedCount: reported,
    tradeDate,
    warningMessage: customWarning || `Critical Data Loss on ${tradeDate}: Only ${pct}% of exchange reported trades were stored (${stored} / ${reported})`
  };
}

/**
 * Evaluates whether market quotes or floorsheets are stale based on current NEPSE market hours
 */
export function evaluateDataFreshness({
  lastUpdatedTimestamp = null,
  now = new Date(),
  calendarStatus = null
} = {}) {
  const currentTime = now instanceof Date ? now.getTime() : Number(now || Date.now());
  const updatedTime = lastUpdatedTimestamp ? new Date(lastUpdatedTimestamp).getTime() : 0;
  
  if (!updatedTime || isNaN(updatedTime)) {
    return {
      status: 'CRITICAL',
      freshness: 'NO_TIMESTAMP',
      isStale: true,
      ageMinutes: null,
      message: 'Timestamp is missing or invalid. Feed cannot be verified.'
    };
  }

  const ageMs = Math.max(0, currentTime - updatedTime);
  const ageMinutes = Number((ageMs / (60 * 1000)).toFixed(1));

  // Determine market status
  const market = calendarStatus || getDetailedMarketStatus(new Date(currentTime));
  const isMarketOpen = Boolean(market?.isOpen || market?.isWithinTradingHours);

  // 1. During Live Trading Session (11:00 - 15:00 NPT Sun-Thu)
  if (isMarketOpen) {
    if (ageMinutes <= 15) {
      return {
        status: 'HEALTHY',
        freshness: 'FRESH',
        isStale: false,
        ageMinutes,
        sessionState: 'OPEN',
        message: `Live data is fresh (${ageMinutes}m old). Streaming real-time quotes.`
      };
    }
    return {
      status: 'WARNING',
      freshness: 'STALE_INTRADAY',
      isStale: true,
      ageMinutes,
      sessionState: 'OPEN',
      message: `Market is OPEN, but data has not updated for ${ageMinutes} minutes (>15m threshold). Check scraper connectivity.`
    };
  }

  // 2. Off-Market Hours / Post-Market / Pre-Market
  // If data was updated within 24 hours, or within 72 hours over a weekend/holiday
  const isWeekendOrHoliday = Boolean(market?.weekend?.isWeekend || market?.holiday?.isHoliday);
  const maxAllowedAgeHours = isWeekendOrHoliday ? 72 : 24;
  const ageHours = ageMinutes / 60;

  if (ageHours <= maxAllowedAgeHours) {
    return {
      status: 'HEALTHY',
      freshness: 'CURRENT_CYCLE',
      isStale: false,
      ageMinutes,
      sessionState: 'CLOSED',
      message: `Market is CLOSED. Data reflects current session (${ageHours.toFixed(1)}h old).`
    };
  }

  return {
    status: 'WARNING',
    freshness: 'STALE_HISTORICAL',
    isStale: true,
    ageMinutes,
    sessionState: 'CLOSED',
    message: `Market data is ${ageHours.toFixed(1)} hours old (exceeds ${maxAllowedAgeHours}h off-market threshold). Ingestion may be delayed.`
  };
}

/**
 * Scraper Health Tracker Class
 * Maintains circular error buffer and provider telemetry
 */
export class ScraperHealthTracker {
  constructor(maxEvents = 50) {
    this.maxEvents = maxEvents;
    this.events = [];
    this.scrapers = {
      nepse_nots: this._initScraperStats('NEPSE NOTS Direct API'),
      floorsheet_scraper: this._initScraperStats('Daily Floorsheet Scraper'),
      broker_vault: this._initScraperStats('Broker Accumulation Vault'),
      fundamentals_scraper: this._initScraperStats('Quarterly Fundamentals Scraper')
    };
  }

  _initScraperStats(label) {
    return {
      id: label.toLowerCase().replace(/\s+/g, '_'),
      name: label,
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      avgLatencyMs: 0
    };
  }

  recordEvent({ scraper, success, latencyMs = 0, error = null, itemsCount = 0 }) {
    const key = scraper || 'nepse_nots';
    if (!this.scrapers[key]) {
      this.scrapers[key] = this._initScraperStats(key);
    }

    const s = this.scrapers[key];
    s.totalAttempts++;

    const now = Date.now();
    if (success) {
      s.successfulAttempts++;
      s.consecutiveFailures = 0;
      s.lastSuccessAt = now;
      s.avgLatencyMs = Math.round((s.avgLatencyMs * 0.8) + (Number(latencyMs || 0) * 0.2));
    } else {
      s.failedAttempts++;
      s.consecutiveFailures++;
      s.lastFailureAt = now;
      s.lastError = error ? String(error) : 'Unknown network failure';
    }

    // Add to circular event log
    const event = {
      id: `${key}_${now}_${Math.random().toString(36).substring(2, 6)}`,
      scraper: key,
      scraperName: s.name,
      success: Boolean(success),
      latencyMs: Number(latencyMs || 0),
      itemsCount: Number(itemsCount || 0),
      error: error ? String(error) : null,
      timestamp: now,
      timeIso: new Date(now).toISOString()
    };

    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }

    return event;
  }

  getScraperStatus(scraperKey) {
    const s = this.scrapers[scraperKey];
    if (!s) return null;

    const successRatePct = s.totalAttempts > 0
      ? Number(((s.successfulAttempts / s.totalAttempts) * 100).toFixed(1))
      : 100;

    let health = 'HEALTHY';
    if (s.consecutiveFailures >= 3 || (s.totalAttempts >= 5 && successRatePct < 60)) {
      health = 'DEGRADED';
    } else if (s.consecutiveFailures > 0 || (s.totalAttempts >= 5 && successRatePct < 85)) {
      health = 'WARNING';
    } else if (s.totalAttempts === 0) {
      health = 'STANDBY';
    }

    return {
      ...s,
      successRatePct,
      health
    };
  }

  getAllScraperStatuses() {
    const result = {};
    for (const key of Object.keys(this.scrapers)) {
      result[key] = this.getScraperStatus(key);
    }
    return result;
  }

  getRecentErrors(limit = 15) {
    return this.events
      .filter(e => !e.success)
      .slice(0, limit);
  }

  getAllRecentEvents(limit = 30) {
    return this.events.slice(0, limit);
  }

  reset() {
    this.events = [];
    for (const k of Object.keys(this.scrapers)) {
      this.scrapers[k] = this._initScraperStats(this.scrapers[k].name);
    }
  }
}

/**
 * Master Aggregator for System Health
 */
export function aggregateSystemHealth({
  completeness = null,
  scrapers = null,
  freshness = null,
  recentErrors = [],
  dbStats = null
} = {}) {
  let overallStatus = 'HEALTHY';
  const warnings = [];
  const errors = [];

  // 1. Completeness Evaluation
  if (completeness) {
    if (completeness.status === 'CRITICAL') {
      overallStatus = 'DEGRADED';
      errors.push(completeness.warningMessage || 'Critical data completeness failure');
    } else if (completeness.status === 'WARNING') {
      if (overallStatus !== 'DEGRADED') overallStatus = 'WARNING';
      warnings.push(completeness.warningMessage || 'Data completeness discrepancy');
    }
  }

  // 2. Scraper Failure Evaluation
  if (scrapers) {
    for (const key of Object.keys(scrapers)) {
      const s = scrapers[key];
      if (s.health === 'DEGRADED') {
        overallStatus = 'DEGRADED';
        errors.push(`Scraper "${s.name}" is degraded (${s.consecutiveFailures} consecutive failures). Last error: ${s.lastError || 'Timeout'}`);
      } else if (s.health === 'WARNING') {
        if (overallStatus !== 'DEGRADED') overallStatus = 'WARNING';
        warnings.push(`Scraper "${s.name}" has intermittent failures (${s.successRatePct}% success rate)`);
      }
    }
  }

  // 3. Stale Data Evaluation
  if (freshness) {
    if (freshness.status === 'CRITICAL') {
      overallStatus = 'DEGRADED';
      errors.push(freshness.message);
    } else if (freshness.status === 'WARNING') {
      if (overallStatus !== 'DEGRADED') overallStatus = 'WARNING';
      warnings.push(freshness.message);
    }
  }

  return {
    overallStatus,
    timestamp: new Date().toISOString(),
    completeness,
    scrapers,
    freshness,
    warnings,
    errors,
    recentErrorsCount: recentErrors.length,
    recentErrors,
    dbStats
  };
}
