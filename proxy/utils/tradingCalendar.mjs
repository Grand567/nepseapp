/**
 * ============================================================================
 * SHARED NEPSE TRADING CALENDAR MODULE (PROXY INTERFACE)
 * ============================================================================
 * Canonical shared interface for proxy services and backend workers.
 * Ensures 100% unified logic between frontend and proxy backend.
 * ============================================================================
 */

export {
  isMarketOpen,
  latestTradingSession,
  tradingDayWindow,
  isNepseTradingDay,
  isNepseWeekend,
  isNepsePublicHoliday,
  getLastValidTradingDay,
  getNextValidTradingDay,
  formatNptDateIso,
  getDetailedMarketStatus,
  calculateT2SettlementDate,
  NEPSE_PUBLIC_HOLIDAYS,
  getAppNow,
  setAppFakeNow
} from '../../src/utils/nepseCalendar.js';
