// tests/agBatchKathmanduSchedule.test.mjs
import { getKathmanduTradingStatus, getNextTradingDay, calculateT2Settlement, isNepseHoliday } from '../proxy/utils/kathmanduTime.mjs';

let pass = 0;
let fail = 0;

const ok = (condition, message) => {
  if (condition) {
    pass++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${message}`);
  }
};

console.log('▶ [SUITE] agBatchKathmanduSchedule.test.mjs\n');

try {
  console.log('[TEST 1] NEPSE Statutory Trading Days: Monday through Friday');
  // Monday 2026-11-23 11:30 NPT (UTC = 05:45)
  const monTrading = getKathmanduTradingStatus(new Date('2026-11-23T05:45:00Z'));
  ok(monTrading.isTradingDay === true, 'Monday is an active NEPSE trading day');
  ok(monTrading.isTradingHours === true, 'Monday 11:30 NPT is within continuous trading hours (11:00 - 15:00)');
  ok(monTrading.dayName === 'Mon', 'Monday mapped to Mon weekday');

  // Friday 2026-11-20 11:30 NPT (UTC = 05:45)
  const friTrading = getKathmanduTradingStatus(new Date('2026-11-20T05:45:00Z'));
  ok(friTrading.isTradingDay === true, 'Friday is an active NEPSE trading day');
  ok(friTrading.isTradingHours === true, 'Friday 11:30 NPT is within trading hours');
  ok(friTrading.dayName === 'Fri', 'Friday mapped to Fri weekday');

  console.log('\n[TEST 2] NEPSE Statutory Weekend: Saturday and Sunday Closed');
  // Saturday 2026-11-21 12:00 NPT (UTC = 06:15)
  const satWeekend = getKathmanduTradingStatus(new Date('2026-11-21T06:15:00Z'));
  ok(satWeekend.isTradingDay === false, 'Saturday is a weekend / closed non-trading day');
  ok(satWeekend.isWeekend === true, 'Saturday is flagged as weekend');
  ok(satWeekend.isTradingHours === false, 'Saturday noon is NOT within trading hours');
  ok(satWeekend.dayName === 'Sat', 'Saturday mapped to Sat weekday');

  // Sunday 2026-11-22 12:00 NPT (UTC = 06:15)
  const sunWeekend = getKathmanduTradingStatus(new Date('2026-11-22T06:15:00Z'));
  ok(sunWeekend.isTradingDay === false, 'Sunday is a weekend / closed non-trading day');
  ok(sunWeekend.isWeekend === true, 'Sunday is flagged as weekend');
  ok(sunWeekend.isTradingHours === false, 'Sunday noon is NOT within trading hours');
  ok(sunWeekend.dayName === 'Sun', 'Sunday mapped to Sun weekday');

  console.log('\n[TEST 3] Central Holiday Calendar: Tihar 2026 Closure');
  // Monday 2026-11-09 is Tihar (Govardhan Puja / Mha Puja)
  const tiharGovardhan = getKathmanduTradingStatus(new Date('2026-11-09T06:00:00Z'));
  ok(tiharGovardhan.isHoliday === true, '2026-11-09 identified as public holiday');
  ok(tiharGovardhan.isTradingDay === false, 'Trading day is FALSE on public holiday even if Monday');
  ok(tiharGovardhan.holidayName && tiharGovardhan.holidayName.includes('Govardhan'), 'Holiday name correctly matches Govardhan Puja');

  console.log('\n[TEST 4] Trading Hours Boundary Enforcement (11:00 - 15:00 NPT)');
  // Friday 10:59 NPT (UTC = 05:14) -> before open
  const preOpen = getKathmanduTradingStatus(new Date('2026-11-20T05:14:00Z'));
  ok(preOpen.isTradingHours === false, '10:59 NPT is outside 11:00-15:00 trading hours');

  // Friday 11:00 NPT (UTC = 05:15) -> market opens
  const openBell = getKathmanduTradingStatus(new Date('2026-11-20T05:15:00Z'));
  ok(openBell.isTradingHours === true, '11:00 NPT opening bell is inside trading hours');

  // Friday 15:00 NPT (UTC = 09:15) -> market close
  const closeBell = getKathmanduTradingStatus(new Date('2026-11-20T09:15:00Z'));
  ok(closeBell.isTradingHours === true, '15:00 NPT closing bell is inside trading hours');

  // Friday 15:01 NPT (UTC = 09:16) -> after close
  const postClose = getKathmanduTradingStatus(new Date('2026-11-20T09:16:00Z'));
  ok(postClose.isTradingHours === false, '15:01 NPT is after market close');

  console.log('\n[TEST 5] Automated EOD Reconciliation Window (15:15 NPT Onwards)');
  // Friday 15:10 NPT (UTC = 09:25) -> before 15:15 EOD window
  const preEod = getKathmanduTradingStatus(new Date('2026-11-20T09:25:00Z'));
  ok(preEod.isEodWindow === false, '15:10 NPT is before EOD window');

  // Friday 15:15 NPT (UTC = 09:30) -> start of 15:15 EOD window
  const eodTrigger = getKathmanduTradingStatus(new Date('2026-11-20T09:30:00Z'));
  ok(eodTrigger.isEodWindow === true, '15:15 NPT triggers EOD reconciliation window on Friday');

  // Saturday 15:30 NPT (UTC = 09:45) -> Saturday is weekend
  const satPostMarket = getKathmanduTradingStatus(new Date('2026-11-21T09:45:00Z'));
  ok(satPostMarket.isEodWindow === false, 'Saturday post-market does NOT trigger EOD reconciliation');

  // Sunday 15:30 NPT (UTC = 09:45) -> Sunday is weekend
  const sunPostMarket = getKathmanduTradingStatus(new Date('2026-11-22T09:45:00Z'));
  ok(sunPostMarket.isEodWindow === false, 'Sunday post-market does NOT trigger EOD reconciliation');

  console.log('\n[TEST 6] Single Source of Truth Keep-Alive Window (10:45 - 15:15 NPT Mon-Fri)');
  // Friday 10:44 NPT (UTC = 04:59) -> 1 minute before warm-up window
  const friPreWarmup = getKathmanduTradingStatus(new Date('2026-11-20T04:59:00Z'));
  ok(friPreWarmup.isKeepAliveWindow === false, 'Friday 10:44 NPT is outside keep-alive window');

  // Friday 10:45 NPT (UTC = 05:00) -> start of keep-alive window
  const friWarmupStart = getKathmanduTradingStatus(new Date('2026-11-20T05:00:00Z'));
  ok(friWarmupStart.isKeepAliveWindow === true, 'Friday 10:45 NPT triggers keep-alive window');

  // Friday 13:00 NPT (UTC = 07:15) -> midday trading
  const friMidday = getKathmanduTradingStatus(new Date('2026-11-20T07:15:00Z'));
  ok(friMidday.isKeepAliveWindow === true, 'Friday 13:00 NPT is inside keep-alive window');

  // Friday 15:15 NPT (UTC = 09:30) -> end of keep-alive window
  const friKeepAliveEnd = getKathmanduTradingStatus(new Date('2026-11-20T09:30:00Z'));
  ok(friKeepAliveEnd.isKeepAliveWindow === true, 'Friday 15:15 NPT is the last minute of keep-alive window');

  // Friday 15:16 NPT (UTC = 09:31) -> 1 minute after keep-alive window
  const friPostKeepAlive = getKathmanduTradingStatus(new Date('2026-11-20T09:31:00Z'));
  ok(friPostKeepAlive.isKeepAliveWindow === false, 'Friday 15:16 NPT is outside keep-alive window');

  // Saturday 12:00 NPT -> non-trading day
  const satKeepAlive = getKathmanduTradingStatus(new Date('2026-11-21T06:15:00Z'));
  ok(satKeepAlive.isKeepAliveWindow === false, 'Saturday 12:00 NPT is outside keep-alive window (weekend)');

  // Sunday 12:00 NPT -> non-trading day
  const sunKeepAlive = getKathmanduTradingStatus(new Date('2026-11-22T06:15:00Z'));
  ok(sunKeepAlive.isKeepAliveWindow === false, 'Sunday 12:00 NPT is outside keep-alive window (weekend)');

  // Public Holiday 12:00 NPT -> non-trading day
  const holidayKeepAlive = getKathmanduTradingStatus(new Date('2026-11-09T06:15:00Z'));
  ok(holidayKeepAlive.isKeepAliveWindow === false, 'Holiday 12:00 NPT is outside keep-alive window (Tihar closure)');

  console.log('\n[TEST 7] T+2 Settlement & Next Trading Day Skipping Saturday, Sunday & Holidays');
  // Trade on Thursday 2026-11-19 -> T+1 is Friday 2026-11-20 -> T+2 is Monday 2026-11-23 (skips Sat & Sun)
  const thuTrade = calculateT2Settlement(new Date('2026-11-19T06:00:00Z'));
  ok(thuTrade.t1DayName === 'Fri', 'Thu trade T+1 is Friday');
  ok(thuTrade.settlementDayName === 'Mon', 'Thu trade T+2 settlement skips Sat/Sun and lands on Monday');
  ok(thuTrade.dematSellableDayName === 'Tue', 'Thu trade Demat sellable T+3 lands on Tuesday');

  // Trade on Friday 2026-11-20 -> T+1 is Monday 2026-11-23 -> T+2 is Tuesday 2026-11-24 (skips Sat & Sun)
  const friTrade = calculateT2Settlement(new Date('2026-11-20T06:00:00Z'));
  ok(friTrade.t1DayName === 'Mon', 'Fri trade T+1 skips Sat/Sun and lands on Monday');
  ok(friTrade.settlementDayName === 'Tue', 'Fri trade T+2 settlement lands on Tuesday');
  ok(friTrade.dematSellableDayName === 'Wed', 'Fri trade Demat sellable T+3 lands on Wednesday');

  console.log(`\n======================================================`);
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log(`======================================================`);

  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('Fatal test error:', err);
  process.exit(1);
}
