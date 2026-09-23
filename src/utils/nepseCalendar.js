import { getNepaliDate, getBikramSambatHoliday } from './bikramSambat.js';

/**
 * NEPSE Trading Calendar & Holiday Engine
 * Regulates trading days, weekly closures (Saturday & Sunday),
 * and official Nepal Bikram Sambat (BS) Public Holidays.
 * 
 * NEPSE Trading Schedule:
 * - Trading Days: Monday, Tuesday, Wednesday, Thursday, Friday
 * - Weekly Closed: Saturday & Sunday (National Weekend Holidays)
 * - Hours: 11:00 AM – 3:00 PM NPT (UTC+5:45)
 */

// ── Official Nepal & NEPSE Public Holidays Database (2024 - 2027) ────────────
export const NEPSE_PUBLIC_HOLIDAYS = {
  // ── 2024 ──
  '2024-01-11': 'Prithvi Jayanti / National Unity Day',
  '2024-01-15': 'Maghe Sankranti',
  '2024-01-30': "Martyr's Day (Shahid Diwas)",
  '2024-02-10': 'Sonam Lhosar',
  '2024-02-19': 'National Democracy Day (Rashtriya Prajatantra Diwas)',
  '2024-03-08': "Maha Shivaratri / Women's Day",
  '2024-03-11': 'Gyalpo Lhosar',
  '2024-03-24': 'Fagu Purnima (Holi - Hilly)',
  '2024-03-25': 'Fagu Purnima (Holi - Terai)',
  '2024-04-08': 'Ghode Jatra (Kathmandu Valley)',
  '2024-04-13': 'Nepali New Year 2081 (Baisakh 1)',
  '2024-04-17': 'Ram Navami',
  '2024-05-01': 'International Labour Day (Majdur Diwas)',
  '2024-05-23': 'Buddha Jayanti / Ubhauli',
  '2024-05-28': 'Republic Day (Ganatantra Diwas)',
  '2024-06-17': 'Bakra Eid',
  '2024-08-19': 'Janai Purnima / Raksha Bandhan',
  '2024-08-20': 'Gai Jatra',
  '2024-08-26': 'Krishna Janmashtami',
  '2024-09-06': 'Haritalika Teej',
  '2024-09-08': 'Rishi Panchami',
  '2024-09-17': 'Indra Jatra',
  '2024-09-19': 'National Constitution Day (Sambidhan Diwas)',
  '2024-10-03': 'Ghatasthapana',
  '2024-10-10': 'Dashain (Phulpati)',
  '2024-10-11': 'Dashain (Maha Ashtami)',
  '2024-10-12': 'Dashain (Maha Navami)',
  '2024-10-13': 'Dashain (Vijaya Dashami)',
  '2024-10-14': 'Dashain (Papankusha Ekadashi)',
  '2024-10-15': 'Dashain (Kojagrat Purnima)',
  '2024-10-31': 'Tihar (Laxmi Puja)',
  '2024-11-01': 'Tihar (Gobardhan Puja / Mha Puja)',
  '2024-11-02': 'Tihar (Bhai Tika)',
  '2024-11-07': 'Chhath Parva',
  '2024-11-15': 'Guru Nanak Jayanti',
  '2024-12-15': 'Udhauli / Yomari Punhi',
  '2024-12-25': 'Christmas Day',
  '2024-12-30': 'Tamu Lhosar',

  // ── 2025 ──
  '2025-01-11': 'Prithvi Jayanti',
  '2025-01-14': 'Maghe Sankranti',
  '2025-01-30': "Sonam Lhosar / Martyr's Day",
  '2025-02-19': 'Democracy Day',
  '2025-02-26': 'Maha Shivaratri',
  '2025-03-01': 'Gyalpo Lhosar',
  '2025-03-08': "International Women's Day",
  '2025-03-13': 'Fagu Purnima (Holi)',
  '2025-03-14': 'Terai Holi',
  '2025-03-29': 'Ghode Jatra',
  '2025-03-31': 'Eid-ul-Fitr',
  '2025-04-06': 'Ram Navami',
  '2025-04-14': 'Nepali New Year 2082',
  '2025-05-01': 'Labour Day',
  '2025-05-12': 'Buddha Jayanti / Ubhauli',
  '2025-05-29': 'Republic Day',
  '2025-06-07': 'Bakra Eid',
  '2025-08-09': 'Janai Purnima / Raksha Bandhan',
  '2025-08-10': 'Gai Jatra',
  '2025-08-16': 'Krishna Janmashtami',
  '2025-08-27': 'Haritalika Teej',
  '2025-09-06': 'Indra Jatra',
  '2025-09-19': 'Constitution Day',
  '2025-09-22': 'Ghatasthapana',
  '2025-09-29': 'Dashain (Phulpati)',
  '2025-09-30': 'Dashain (Maha Ashtami)',
  '2025-10-01': 'Dashain (Maha Navami)',
  '2025-10-02': 'Dashain (Vijaya Dashami)',
  '2025-10-03': 'Dashain (Ekadashi)',
  '2025-10-20': 'Tihar (Laxmi Puja)',
  '2025-10-21': 'Tihar (Gobardhan Puja)',
  '2025-10-22': 'Tihar (Bhai Tika)',
  '2025-10-27': 'Chhath Parva',
  '2025-12-05': 'Udhauli / Yomari Punhi',
  '2025-12-25': 'Christmas Day',
  '2025-12-30': 'Tamu Lhosar',

  // ── 2026 ──
  '2026-01-11': 'Prithvi Jayanti / National Unity Day',
  '2026-01-15': 'Maghe Sankranti',
  '2026-01-30': "Martyr's Day (Shahid Diwas)",
  '2026-02-15': 'Maha Shivaratri',
  '2026-02-17': 'Sonam Lhosar',
  '2026-02-19': 'National Democracy Day',
  '2026-03-03': 'Fagu Purnima (Holi)',
  '2026-03-04': 'Terai Holi',
  '2026-03-08': "International Women's Day",
  '2026-03-19': 'Ghode Jatra',
  '2026-03-21': 'Eid-ul-Fitr',
  '2026-04-14': 'Nepali New Year 2083 (Baisakh 1)',
  '2026-04-26': 'Ram Navami',
  '2026-05-01': 'International Labour Day / Buddha Jayanti',
  '2026-05-27': 'Bakra Eid',
  '2026-05-29': 'Republic Day (Ganatantra Diwas)',
  '2026-08-27': 'Janai Purnima / Raksha Bandhan',
  '2026-08-28': 'Gai Jatra (Public Holiday)',
  '2026-09-04': 'Krishna Janmashtami',
  '2026-09-19': 'Constitution Day (Sambidhan Diwas)',
  '2026-09-25': 'Indra Jatra',
  '2026-10-10': 'Ghatasthapana',
  '2026-10-17': 'Dashain (Phulpati)',
  '2026-10-18': 'Dashain (Maha Ashtami)',
  '2026-10-19': 'Dashain (Maha Navami)',
  '2026-10-20': 'Dashain (Vijaya Dashami)',
  '2026-10-21': 'Dashain (Ekadashi)',
  '2026-11-08': 'Tihar (Laxmi Puja)',
  '2026-11-09': 'Tihar (Gobardhan Puja)',
  '2026-11-10': 'Tihar (Bhai Tika)',
  '2026-11-15': 'Chhath Parva',
  '2026-12-25': 'Christmas Day',
  '2026-12-30': 'Tamu Lhosar',

  // ── 2027 ──
  '2027-01-11': 'Prithvi Jayanti',
  '2027-01-15': 'Maghe Sankranti',
  '2027-01-30': "Martyr's Day",
  '2027-02-19': 'Democracy Day',
  '2027-03-07': 'Maha Shivaratri',
  '2027-03-08': "International Women's Day",
  '2027-03-22': 'Fagu Purnima (Holi)',
  '2027-04-14': 'Nepali New Year 2084',
  '2027-05-01': 'Labour Day',
  '2027-05-20': 'Buddha Jayanti',
  '2027-05-29': 'Republic Day',
  '2027-09-19': 'Constitution Day',
  '2027-12-25': 'Christmas Day'
};

/**
 * Returns YYYY-MM-DD string for any Date object in Nepal Standard Time
 */
export function getIsoDateInNPT(date = new Date()) {
  const d = new Date(date);
  // Format in Asia/Kathmandu time zone
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch (_) {
    // Fallback: UTC + 5:45
    const nptTime = new Date(d.getTime() + (5 * 60 + 45) * 60000);
    return nptTime.toISOString().split('T')[0];
  }
}

let dynamicHaltMemory = null;

/**
 * Clears any dynamic emergency market halt immediately and broadcasts update event.
 */
export function clearDynamicMarketHalt() {
  dynamicHaltMemory = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem('nepse_dynamic_emergency_halt');
      window.dispatchEvent(new CustomEvent('nepse_market_halt_cleared'));
    } catch (_) {}
  }
}

/**
 * Sets or clears a dynamic market halt (e.g., detected by news scraper or server breach).
 * Persists to localStorage for resilience across page reloads.
 */
export function setDynamicMarketHalt(haltInfo) {
  if (!haltInfo || !haltInfo.isHalted) {
    clearDynamicMarketHalt();
    return;
  }
  dynamicHaltMemory = haltInfo;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('nepse_dynamic_emergency_halt', JSON.stringify(haltInfo));
      window.dispatchEvent(new CustomEvent('nepse_market_halt_triggered', { detail: haltInfo }));
    } catch (_) {}
  }
}

/**
 * Retrieves currently active dynamic market halt, if any.
 * Stale records from previous dates are automatically purged.
 */
export function getDynamicMarketHalt() {
  if (dynamicHaltMemory) {
    const todayIso = getIsoDateInNPT();
    if (!dynamicHaltMemory.date || dynamicHaltMemory.date === todayIso) {
      return dynamicHaltMemory;
    }
    dynamicHaltMemory = null;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const item = localStorage.getItem('nepse_dynamic_emergency_halt');
      if (item) {
        const parsed = JSON.parse(item);
        const todayIso = getIsoDateInNPT();
        if (parsed && (!parsed.date || parsed.date === todayIso)) {
          return parsed;
        } else {
          // Stale past date halt; purge immediately
          localStorage.removeItem('nepse_dynamic_emergency_halt');
        }
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Checks if a given date is a Public Holiday in Nepal (Bikram Sambat & Official NEPSE)
 * or an Emergency Market Halt (e.g. ransomware breach / regulatory suspension).
 */
export function isNepsePublicHoliday(date = new Date()) {
  const nepaliDate = getNepaliDate(date);
  const iso = getIsoDateInNPT(date);

  // 0. Check dynamic emergency halt reported at runtime (news headline / server error detector)
  const dynamicHalt = getDynamicMarketHalt();
  if (dynamicHalt && (dynamicHalt.isHalted || dynamicHalt.isEmergencyHalt) && (!dynamicHalt.date || dynamicHalt.date === iso)) {
    return {
      isHoliday: true,
      isEmergencyHalt: true,
      holidayName: dynamicHalt.reason || 'Emergency Market Halt (आकस्मिक बजार बन्द — NEPSE Incident)',
      holidayNameNp: 'आकस्मिक बजार बन्द (NEPSE Server Incident)',
      holidayNameEn: 'Emergency Market Halt',
      nepaliDate,
      dateStr: iso
    };
  }

  // 1. Check Bikram Sambat official holiday database (exclude non-closing festivals like Teej / Rishi Panchami)
  const NON_CLOSING_FESTIVALS = ['तीज', 'teej', 'ऋषि पञ्चमी', 'rishi panchami'];
  const isExcluded = (name) => {
    if (!name) return false;
    const lower = String(name).toLowerCase();
    return NON_CLOSING_FESTIVALS.some(f => lower.includes(f));
  };

  if (nepaliDate.isHoliday && !isExcluded(nepaliDate.holidayNameNp) && !isExcluded(nepaliDate.holidayNameEn)) {
    const holidayName = nepaliDate.holidayNameNp || nepaliDate.holidayNameEn;
    return {
      isHoliday: true,
      isEmergencyHalt: false,
      holidayName,
      holidayNameNp: nepaliDate.holidayNameNp,
      holidayNameEn: nepaliDate.holidayNameEn,
      nepaliDate,
      dateStr: iso
    };
  }

  // 2. Check Gregorian ISO mapping fallback
  if (NEPSE_PUBLIC_HOLIDAYS[iso]) {
    const isEmergency = /emergency|आकस्मिक|halt/i.test(NEPSE_PUBLIC_HOLIDAYS[iso]);
    return {
      isHoliday: true,
      isEmergencyHalt: isEmergency,
      holidayName: NEPSE_PUBLIC_HOLIDAYS[iso],
      holidayNameNp: NEPSE_PUBLIC_HOLIDAYS[iso],
      holidayNameEn: NEPSE_PUBLIC_HOLIDAYS[iso],
      nepaliDate,
      dateStr: iso
    };
  }

  return { isHoliday: false, isEmergencyHalt: false, holidayName: null, nepaliDate, dateStr: iso };
}

/**
 * Checks if a given date is a weekly closure for NEPSE.
 * Under current NEPSE rules: Saturday (6) and Sunday (0) are weekend market closures.
 * Monday (1) through Friday (5) are active trading days (11:00 AM – 3:00 PM NPT).
 */
export function isNepseWeekend(date = new Date()) {
  const d = new Date(date);
  // Get Day of Week in Asia/Kathmandu
  let dayOfWeek = d.getDay();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kathmandu',
      weekday: 'short'
    });
    const dayStr = formatter.format(d);
    if (dayStr === 'Sun') dayOfWeek = 0;
    else if (dayStr === 'Mon') dayOfWeek = 1;
    else if (dayStr === 'Tue') dayOfWeek = 2;
    else if (dayStr === 'Wed') dayOfWeek = 3;
    else if (dayStr === 'Thu') dayOfWeek = 4;
    else if (dayStr === 'Fri') dayOfWeek = 5;
    else if (dayStr === 'Sat') dayOfWeek = 6;
  } catch (_) {}

  // National NEPSE weekend holidays: Saturday (6) and Sunday (0).
  // Monday (1) to Friday (5) are active trading days!
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  return {
    isWeekend,
    dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
    dayOfWeek
  };
}

/**
 * Checks if a given date is an official active NEPSE trading day.
 * Returns true for Monday, Tuesday, Wednesday, Thursday, Friday when NOT a holiday.
 */
export function isNepseTradingDay(date = new Date()) {
  const weekendCheck = isNepseWeekend(date);
  if (weekendCheck.isWeekend) return false;

  const holidayCheck = isNepsePublicHoliday(date);
  if (holidayCheck.isHoliday) return false;

  return true;
}

/**
 * Finds the most recent past valid NEPSE Trading Day.
 * If today is Saturday, Sunday, or a Holiday (or trading hasn't started yet),
 * it scans backwards until finding the last active trading session date.
 */
export function getLastValidTradingDay(fromDate = new Date(), requireCompleted = false) {
  const cursor = new Date(fromDate);
  
  // If requireCompleted is true or we are before market open (11:00 AM NPT) on a trading day,
  // we might want the previous day's session
  let iterations = 0;
  while (iterations < 30) {
    if (isNepseTradingDay(cursor)) {
      return new Date(cursor);
    }
    // Step backwards 1 calendar day
    cursor.setDate(cursor.getDate() - 1);
    iterations++;
  }
  return new Date(fromDate);
}

/**
 * Formats a Date object into YYYY-MM-DD in Asia/Kathmandu time zone.
 */
export function formatNptDateIso(date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date(date));
  } catch (_) {
    return new Date(date).toISOString().slice(0, 10);
  }
}

/**
 * Finds the NEXT active NEPSE trading day strictly skipping weekends and holidays.
 */
export function getNextValidTradingDay(fromDate = new Date()) {
  const cursor = new Date(fromDate);
  cursor.setDate(cursor.getDate() + 1);
  let iterations = 0;
  while (iterations < 30) {
    if (isNepseTradingDay(cursor)) {
      return new Date(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
    iterations++;
  }
  return new Date(fromDate);
}

/**
 * Returns the exact target NEPSE trading session date (YYYY-MM-DD) that a Prime Pick setup applies to.
 * - During active trading hours (before 15:00 NPT on a trading day): applies to TODAY.
 * - After market close (>= 15:00 NPT), or on weekends/holidays: applies to NEXT trading day.
 */
export function getTargetTradingSessionDate(now = new Date()) {
  const d = new Date(now);
  let nptHours = 0;
  let nptMinutes = 0;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kathmandu',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric'
    });
    const parts = formatter.formatToParts(d);
    nptHours = parseInt(parts.find(p => p.type === 'hour').value, 10) % 24;
    nptMinutes = parseInt(parts.find(p => p.type === 'minute').value, 10);
  } catch (_) {
    const nptOffset = 5 * 60 + 45;
    const utcMins = d.getUTCHours() * 60 + d.getUTCMinutes();
    const totalMins = (utcMins + nptOffset) % (24 * 60);
    nptHours = Math.floor(totalMins / 60);
    nptMinutes = totalMins % 60;
  }
  const nptTotalMinutes = nptHours * 60 + nptMinutes;
  const isTrading = isNepseTradingDay(d);

  if (isTrading && nptTotalMinutes < 15 * 60) {
    return formatNptDateIso(d);
  }
  const nextDay = getNextValidTradingDay(d);
  return formatNptDateIso(nextDay);
}

/**
 * Generates an array of EXACT past valid NEPSE trading dates.
 * Strictly skips Saturdays, Sundays, and all Nepal Public Holidays.
 */
export function generateTradingDaysSequence(count = 365, referenceDate = new Date()) {
  const tradingDays = [];
  const cursor = new Date(referenceDate);

  // Check if today is a valid trading day during or after market hours
  const todayTrading = isNepseTradingDay(cursor);
  if (!todayTrading) {
    // Start scanning backwards from the last valid trading day
    const lastValid = getLastValidTradingDay(cursor);
    cursor.setTime(lastValid.getTime());
  }

  let iterations = 0;
  const maxIterations = count * 3; // safety limit

  while (tradingDays.length < count && iterations < maxIterations) {
    if (isNepseTradingDay(cursor)) {
      tradingDays.push(new Date(cursor));
    }
    // Move backwards by 1 calendar day
    cursor.setDate(cursor.getDate() - 1);
    iterations++;
  }

  // Return in chronological order (oldest to newest)
  return tradingDays.reverse();
}

/**
 * Calculates current NEPSE market status with exact Nepal time, weekend, and holiday detection.
 */
export function getDetailedMarketStatus(now = new Date()) {
  const nepaliDate = getNepaliDate(now);
  const holiday = isNepsePublicHoliday(now);
  const weekend = isNepseWeekend(now);

  // Format current NPT time
  let nptHours = 0;
  let nptMinutes = 0;
  let nptTimeStr = '';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kathmandu',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric'
    });
    const parts = formatter.formatToParts(now);
    nptHours = parseInt(parts.find(p => p.type === 'hour').value, 10) % 24;
    nptMinutes = parseInt(parts.find(p => p.type === 'minute').value, 10);
    nptTimeStr = `${String(nptHours).padStart(2, '0')}:${String(nptMinutes).padStart(2, '0')}`;
  } catch (_) {
    const nptOffset = 5 * 60 + 45;
    const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    const totalMins = (utcMins + nptOffset) % (24 * 60);
    nptHours = Math.floor(totalMins / 60);
    nptMinutes = totalMins % 60;
    nptTimeStr = `${String(nptHours).padStart(2, '0')}:${String(nptMinutes).padStart(2, '0')}`;
  }

  const nptTotalMinutes = nptHours * 60 + nptMinutes;
  const isWithinHours = (nptTotalMinutes >= 11 * 60 && nptTotalMinutes < 15 * 60); // 11:00 to 15:00
  const isTradingDay = !weekend.isWeekend && !holiday.isHoliday;
  const isAmoWindow = (nptTotalMinutes >= 17 * 60 || nptTotalMinutes < 10 * 60 + 30) || weekend.isWeekend || holiday.isHoliday;
  const isFirst15Min = isTradingDay && (nptTotalMinutes >= 11 * 60 && nptTotalMinutes < 11 * 60 + 15);
  const targetSessionDate = getTargetTradingSessionDate(now);

  // Detailed Session Identification
  let session = 'POST_MARKET';
  let sessionLabel = 'Post-Market Closed';
  let isPreOpen = false;
  let isClosingSession = false;
  let isPostCloseReconciling = false;

  if (isTradingDay) {
    if (nptTotalMinutes >= 10 * 60 + 30 && nptTotalMinutes < 10 * 60 + 45) {
      session = 'PRE_OPEN';
      sessionLabel = 'Pre-Open Order Session (±5% limit)';
      isPreOpen = true;
    } else if (nptTotalMinutes >= 10 * 60 + 45 && nptTotalMinutes < 11 * 60) {
      session = 'PRE_OPEN_MATCH';
      sessionLabel = 'Pre-Open Matching Freeze';
      isPreOpen = true;
    } else if (nptTotalMinutes >= 11 * 60 && nptTotalMinutes < 15 * 60) {
      session = 'CONTINUOUS';
      sessionLabel = 'Continuous Live Trading';
    } else if (nptTotalMinutes >= 15 * 60 && nptTotalMinutes < 15 * 60 + 5) {
      session = 'CLOSING_SESSION';
      sessionLabel = 'Closing Price Session (3:00 - 3:05 PM)';
      isClosingSession = true;
    } else if (nptTotalMinutes >= 15 * 60 + 5 && nptTotalMinutes < 15 * 60 + 30) {
      session = 'POST_CLOSE_RECONCILING';
      sessionLabel = 'Floorsheet Finalization (3:05 - 3:30 PM)';
      isPostCloseReconciling = true;
    } else {
      session = 'POST_MARKET';
      sessionLabel = 'Post-Market Analysis Session';
    }
  }

  // Common metadata
  const baseData = {
    bsDate: nepaliDate,
    bsFormattedNp: nepaliDate.formattedNp,
    bsFormattedEn: nepaliDate.formattedEn,
    nptTime: nptTimeStr,
    nptTotalMinutes,
    isTradingDay,
    session,
    sessionLabel,
    isPreOpen,
    isClosingSession,
    isPostCloseReconciling,
    isAmoWindow,
    isFirst15Min,
    targetSessionDate,
  };

  // 1. Check Holiday (Bikram Sambat public holiday or Emergency Market Halt)
  if (holiday.isHoliday) {
    const isHalt = Boolean(holiday.isEmergencyHalt);
    return {
      ...baseData,
      isOpen: false,
      isHoliday: true,
      isEmergencyHalt: isHalt,
      session: isHalt ? 'EMERGENCY_HALT' : baseData.session,
      sessionLabel: isHalt ? 'Trading Suspended (Emergency Market Halt)' : baseData.sessionLabel,
      isWeekend: false,
      isCloseDay: true,
      holidayName: holiday.holidayName,
      statusLabel: isHalt ? 'Emergency Market Halt (आकस्मिक बजार बन्द)' : 'Holiday Closed',
      message: isHalt
        ? `Market Closed — ${holiday.holidayName}`
        : `Market Closed — ${holiday.holidayName} (${nepaliDate.shortNp})`,
      lastTradingDay: getLastValidTradingDay(now)
    };
  }

  // 2. Check Weekly Close (Saturday, Sunday)
  if (weekend.isWeekend) {
    return {
      ...baseData,
      isOpen: false,
      isHoliday: false,
      isWeekend: true,
      isCloseDay: true,
      holidayName: null,
      statusLabel: 'Weekend Closed',
      message: `Market Closed — ${weekend.dayName} Weekend (${nepaliDate.shortNp})`,
      lastTradingDay: getLastValidTradingDay(now)
    };
  }

  // 3. Regular Trading Day (Monday - Friday)
  if (isWithinHours) {
    return {
      ...baseData,
      isOpen: true,
      isHoliday: false,
      isWeekend: false,
      isCloseDay: false,
      holidayName: null,
      statusLabel: 'Market Open',
      message: `Market is OPEN (Live Trading) — ${nepaliDate.shortNp}`,
      lastTradingDay: now
    };
  } else if (isPreOpen) {
    return {
      ...baseData,
      isOpen: false,
      isHoliday: false,
      isWeekend: false,
      isCloseDay: false,
      holidayName: null,
      statusLabel: session === 'PRE_OPEN' ? 'Pre-Open Session' : 'Pre-Open Match',
      message: session === 'PRE_OPEN'
        ? `Pre-Open Session Active (10:30–10:45 AM) — Continuous opens at 11:00 AM`
        : `Pre-Open Matching Freeze (10:45–11:00 AM) — Continuous opens at 11:00 AM`,
      lastTradingDay: now
    };
  } else if (isClosingSession) {
    return {
      ...baseData,
      isOpen: false,
      isHoliday: false,
      isWeekend: false,
      isCloseDay: false,
      holidayName: null,
      statusLabel: 'Closing Session',
      message: `Market Closing Session (3:00–3:05 PM) — Determining Final Close`,
      lastTradingDay: now
    };
  } else if (isPostCloseReconciling) {
    return {
      ...baseData,
      isOpen: false,
      isHoliday: false,
      isWeekend: false,
      isCloseDay: false,
      holidayName: null,
      statusLabel: 'Floorsheet Finalizing',
      message: `Reconciling 50+ Broker Floorsheets (3:05–3:30 PM) — Finalizing Day Prime Pick`,
      lastTradingDay: now
    };
  } else if (nptTotalMinutes < 10 * 60 + 30) {
    return {
      ...baseData,
      isOpen: false,
      isHoliday: false,
      isWeekend: false,
      isCloseDay: false,
      holidayName: null,
      statusLabel: 'Pre-Market Preparation',
      message: `Pre-Open opens at 10:30 AM NPT — Continuous trading at 11:00 AM`,
      lastTradingDay: getLastValidTradingDay(new Date(now.getTime() - 86400000))
    };
  } else {
    return {
      ...baseData,
      isOpen: false,
      isHoliday: false,
      isWeekend: false,
      isCloseDay: false,
      holidayName: null,
      statusLabel: 'Post-Market Closed',
      message: `Market Closed at 3:00 PM NPT — Tomorrow's Prime Pick Ready`,
      lastTradingDay: now
    };
  }
}
