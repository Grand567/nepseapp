// proxy/utils/kathmanduTime.mjs
/**
 * Single Source of Truth: Timezone-Independent NEPSE Schedule & Calendar Engine
 * 
 * Accurately calculates NEPSE trading days, market hours, weekends, and public holidays
 * strictly in Nepal Standard Time (NPT: Asia/Kathmandu, UTC+5:45), irrespective of the
 * host operating system's timezone (e.g. Render UTC Linux containers).
 * 
 * Official Statutory Trading Schedule (Effective April 2026):
 * - Trading Days: Monday through Friday (Mon, Tue, Wed, Thu, Fri)
 * - Weekend / Closed: Saturday and Sunday (Sat, Sun)
 * - Core Trading Hours: 11:00 AM – 3:00 PM NPT (660 to 900 minutes)
 * - Keep-Alive Window: 10:45 AM – 3:15 PM NPT (645 to 915 minutes)
 * - EOD Settlement & Reconciliation Window: 3:15 PM NPT onwards (>= 915 minutes)
 * - Holidays: Dynamically loaded from proxy/data/nepse_holidays.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic holiday calendar loader with fallback
let cachedHolidays = null;
let lastHolidayLoadMs = 0;

export function getNepseHolidays() {
  const now = Date.now();
  if (cachedHolidays && now - lastHolidayLoadMs < 60000) {
    return cachedHolidays;
  }

  const candidatePaths = [
    path.join(__dirname, '../data/nepse_holidays.json'),
    path.join(__dirname, '../../src/data/nepse_holidays.json'),
    path.join(process.cwd(), 'proxy/data/nepse_holidays.json'),
    path.join(process.cwd(), 'src/data/nepse_holidays.json')
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        delete parsed._comment;
        cachedHolidays = parsed;
        lastHolidayLoadMs = now;
        return cachedHolidays;
      }
    } catch (_) {}
  }

  // Built-in emergency fallback if file cannot be read
  cachedHolidays = {
    '2026-11-08': 'Tihar (Laxmi Puja)',
    '2026-11-09': 'Tihar (Govardhan Puja / Mha Puja)',
    '2026-11-10': 'Tihar (Bhai Tika)',
    '2026-11-11': 'Tihar (Additional Holiday)',
    '2026-11-15': 'Chhath Parva',
    '2026-11-16': 'Chhath Parva (Government Holiday)'
  };
  lastHolidayLoadMs = now;
  return cachedHolidays;
}

export function isNepseHoliday(dateIso) {
  if (!dateIso) return { isHoliday: false, holidayName: null };
  const holidays = getNepseHolidays();
  const cleanIso = String(dateIso).slice(0, 10);
  if (holidays[cleanIso]) {
    return { isHoliday: true, holidayName: holidays[cleanIso] };
  }
  return { isHoliday: false, holidayName: null };
}

export function getKathmanduTradingStatus(date = new Date()) {
  const d = new Date(date);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const { type, value } of parts) {
    map[type] = value;
  }

  const dayName = map.weekday; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const hours = parseInt(map.hour, 10) % 24;
  const minutes = parseInt(map.minute, 10);
  const totalMinutes = hours * 60 + minutes;
  const dateIso = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} NPT`;

  // Statutory NEPSE trading days (April 2026 onward): Monday (1) through Friday (5)
  // Weekend / Closed: Saturday (6) and Sunday (0)
  const isWeekend = ['Sat', 'Sun'].includes(dayName);
  const holidayCheck = isNepseHoliday(dateIso);
  const isHoliday = holidayCheck.isHoliday;
  const holidayName = holidayCheck.holidayName;

  // Active trading day: strictly Monday–Friday and NOT an official holiday
  const isTradingDay = !isWeekend && !isHoliday && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dayName);

  // Continuous market trading window: 11:00 AM to 3:00 PM NPT (660 to 900 mins)
  const isTradingHours = isTradingDay && totalMinutes >= 660 && totalMinutes <= 900;

  // Keep-alive heartbeat window: active on trading days (with a 15-min warm-up buffer: 10:45 - 15:15 NPT)
  const isKeepAliveWindow = isTradingDay && totalMinutes >= 645 && totalMinutes <= 915;

  // EOD reconciliation window: 3:15 PM NPT onwards on trading days (>= 915 mins)
  const isEodWindow = isTradingDay && totalMinutes >= 915;

  return {
    dayName,
    hours,
    minutes,
    totalMinutes,
    isWeekend,
    isHoliday,
    holidayName,
    isTradingDay,
    isTradingHours,
    isKeepAliveWindow,
    isEodWindow,
    dateIso,
    timeStr
  };
}

/**
 * Returns the next valid active NEPSE trading day strictly skipping Saturday, Sunday, and listed holidays.
 */
export function getNextTradingDay(fromDate = new Date()) {
  const cursor = new Date(fromDate);
  let iterations = 0;
  while (iterations < 60) {
    cursor.setDate(cursor.getDate() + 1);
    const status = getKathmanduTradingStatus(cursor);
    if (status.isTradingDay) {
      return cursor;
    }
    iterations++;
  }
  return cursor;
}

/**
 * Calculates exact T+2 Settlement Date strictly skipping Saturday, Sunday, and listed public holidays.
 */
export function calculateT2Settlement(tradeDate = new Date()) {
  let session = new Date(tradeDate);
  const initialStatus = getKathmanduTradingStatus(session);
  if (!initialStatus.isTradingDay) {
    session = getNextTradingDay(session);
  }

  const t1 = getNextTradingDay(session);
  const t2 = getNextTradingDay(t1);
  const t3 = getNextTradingDay(t2);

  const t0Status = getKathmanduTradingStatus(session);
  const t1Status = getKathmanduTradingStatus(t1);
  const t2Status = getKathmanduTradingStatus(t2);
  const t3Status = getKathmanduTradingStatus(t3);

  return {
    tradeDate: session,
    tradeDateIso: t0Status.dateIso,
    tradeDayName: t0Status.dayName,
    t1Date: t1,
    t1Iso: t1Status.dateIso,
    t1DayName: t1Status.dayName,
    settlementDate: t2,
    settlementDateIso: t2Status.dateIso,
    settlementDayName: t2Status.dayName,
    dematCreditDate: t3,
    dematCreditDateIso: t3Status.dateIso,
    dematSellableDayName: t3Status.dayName
  };
}
