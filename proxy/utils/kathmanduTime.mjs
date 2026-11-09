// proxy/utils/kathmanduTime.mjs
/**
 * Timezone-Independent NEPSE Schedule & Calendar Engine
 * 
 * Accurately calculates NEPSE trading days and market hours strictly in
 * Nepal Standard Time (NPT: Asia/Kathmandu, UTC+5:45), irrespective of the
 * host operating system's timezone (e.g. Render UTC Linux containers).
 * 
 * Official Statutory Trading Schedule:
 * - Days: Sunday through Thursday (Sun, Mon, Tue, Wed, Thu)
 * - Weekend / Closed: Friday and Saturday (Fri, Sat)
 * - Core Trading Hours: 11:00 AM – 3:00 PM NPT (660 to 900 minutes)
 * - EOD Settlement & Reconciliation Window: 3:15 PM NPT onwards (>= 915 minutes)
 */

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

  const dayName = map.weekday; // 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
  const hours = parseInt(map.hour, 10) % 24;
  const minutes = parseInt(map.minute, 10);
  const totalMinutes = hours * 60 + minutes;

  // NEPSE trading days: Sunday (0) through Thursday (4)
  const isTradingDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].includes(dayName);

  // Continuous market trading window: 11:00 AM to 3:00 PM NPT (660 to 900 mins)
  const isTradingHours = isTradingDay && totalMinutes >= 660 && totalMinutes <= 900;

  // Keep-alive heartbeat window: active on trading days during market hours (with a 15-min warm-up buffer: 10:45 - 15:15 NPT)
  const isKeepAliveWindow = isTradingDay && totalMinutes >= 645 && totalMinutes <= 915;

  // EOD reconciliation window: 3:15 PM NPT onwards on trading days (>= 915 mins)
  const isEodWindow = isTradingDay && totalMinutes >= 915;

  const dateIso = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} NPT`;

  return {
    dayName,
    hours,
    minutes,
    totalMinutes,
    isTradingDay,
    isTradingHours,
    isKeepAliveWindow,
    isEodWindow,
    dateIso,
    timeStr
  };
}
