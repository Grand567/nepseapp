// src/constants/marketRules.js
/**
 * ============================================================================
 * CANONICAL NEPSE MARKET RULES, STATUTORY FRICTIONS & CALENDAR CONSTANTS
 * ============================================================================
 * Single source of truth for all quantitative backtesting, swing-trade selection,
 * trade simulation, and execution planning in the Drabyashree NEPSE application.
 *
 * Every rule is strictly tagged as:
 * - status: 'VERIFIED'   (backed by published SEBON/NEPSE/NRB/CDSC directives)
 * - status: 'UNVERIFIED' (empirically assumed or pending regulatory confirmation)
 */

// 1. TRADING SCHEDULE & CALENDAR
export const TRADING_SCHEDULE = Object.freeze({
  timeZone: 'Asia/Kathmandu', // UTC+5:45
  tradingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], // Post-April 2026 Regime
  tradingDayNumbers: [1, 2, 3, 4, 5], // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  preOpenSession: {
    start: '10:30',
    end: '10:45',
    description: 'Pre-open order collection & theoretical price discovery (matching at 10:45)'
  },
  regularSession: {
    start: '11:00',
    end: '15:00',
    description: 'Continuous continuous order matching session'
  },
  oddLotSession: {
    start: '15:00',
    end: '15:05',
    description: 'Odd-lot (orders < 10 kitta) execution window'
  },
  status: 'VERIFIED',
  citation: 'NEPSE Trading Bylaws & Cabinet/SEBON 5-Day Workweek Directive (April 2026 Shift from Sun-Thu to Mon-Fri)'
});

// 2. STATUTORY CIRCUIT BREAKERS & PRICE BANDS
export const CIRCUIT_LIMITS = Object.freeze({
  individualStockDailyBandPct: 15.0, // ±15.0% maximum daily range relative to previous close
  priceTickSize: 0.10, // Minimum price movement (Rs. 0.10)
  indexCircuitBreakers: [
    {
      tier: 1,
      thresholdPct: 4.0,
      haltDurationMinutes: 20,
      effectiveBefore: '13:00',
      rule: 'If index moves ±4% before 13:00, market halted for 20 minutes'
    },
    {
      tier: 2,
      thresholdPct: 5.0,
      haltDurationMinutes: 40,
      effectiveBefore: '14:00',
      rule: 'If index moves ±5% before 14:00, market halted for 40 minutes'
    },
    {
      tier: 3,
      thresholdPct: 6.0,
      haltDurationMinutes: null, // Market closed for remainder of session
      effectiveBefore: '15:00',
      rule: 'If index moves ±6% at any time during session, market halted for remainder of the day'
    }
  ],
  status: 'VERIFIED',
  citation: 'Nepal Securities Trading Regulations (Fourth Amendment) 2082 (expanding daily individual limits from 10% to 15%) & NEPSE Index Circuit Directive'
});

// 3. CLEARING & SETTLEMENT CYCLE
export const SETTLEMENT_CYCLE = Object.freeze({
  settlementDays: 2, // T+2
  description: 'Purchased shares are cleared and credited to the buyer Demat account on T+2.',
  sellingRestrictions: 'Under CDSC bylaws, bought shares cannot be legally sold or shorted on Day T or Day T+1 until credited.',
  tPlusTwoLockoutEnforced: true,
  status: 'VERIFIED',
  citation: 'CDSC Securities Clearing and Settlement Bylaws 2070 (amended 2077 to T+2)'
});

// 4. STATUTORY BROKER COMMISSION SLABS (SEBON 2077 DIRECTIVE)
export const BROKER_COMMISSION_SLABS = Object.freeze([
  {
    tier: 1,
    maxAmount: 50000,
    ratePct: 0.36,
    rateDecimal: 0.0036,
    minFee: 10.0,
    description: 'Up to Rs. 50,000: 0.36% (Minimum Rs. 10)'
  },
  {
    tier: 2,
    maxAmount: 500000,
    ratePct: 0.33,
    rateDecimal: 0.0033,
    description: 'Rs. 50,001 to Rs. 500,000: 0.33%'
  },
  {
    tier: 3,
    maxAmount: 2000000,
    ratePct: 0.31,
    rateDecimal: 0.0031,
    description: 'Rs. 500,001 to Rs. 2,000,000: 0.31%'
  },
  {
    tier: 4,
    maxAmount: 10000000,
    ratePct: 0.27,
    rateDecimal: 0.0027,
    description: 'Rs. 2,000,001 to Rs. 10,000,000: 0.27%'
  },
  {
    tier: 5,
    maxAmount: Infinity,
    ratePct: 0.24,
    rateDecimal: 0.0024,
    description: 'Above Rs. 10,000,000: 0.24%'
  }
]);

// 5. REGULATORY & CLEARING CHARGES
export const STATUTORY_CHARGES = Object.freeze({
  sebonFeeRatePct: 0.015, // 0.015% of turnover on both Buy and Sell
  sebonFeeDecimal: 0.00015,
  cdscDpChargeRs: 25.0, // Rs. 25.00 flat per scrip on sell
  status: 'VERIFIED',
  citation: 'Securities Board of Nepal (SEBON) Regulation Fee & CDSC Depository Service Bylaws'
});

// 6. CAPITAL GAINS TAX (CGT)
export const CAPITAL_GAINS_TAX = Object.freeze({
  individualShortTermRatePct: 7.5, // Held < 365 days
  individualShortTermDecimal: 0.075,
  individualLongTermRatePct: 5.0, // Held >= 365 days
  individualLongTermDecimal: 0.05,
  corporateResidentRatePct: 10.0,
  corporateResidentDecimal: 0.10,
  nonResidentRatePct: 25.0,
  nonResidentDecimal: 0.25,
  shortTermThresholdDays: 365,
  status: 'VERIFIED',
  citation: 'Inland Revenue Department (IRD) & Income Tax Act 2058 (as amended by Finance Acts)'
});

// 7. EDITABLE HOLIDAY CALENDAR (2025 - 2027)
// Stores verified NEPSE public trading holidays in ISO YYYY-MM-DD
export const EDITABLE_HOLIDAY_CALENDAR = [
  // 2025
  '2025-01-01', // New Year
  '2025-01-14', // Maghe Sankranti
  '2025-01-30', // Sonam Lhosar
  '2025-02-19', // National Democracy Day
  '2025-02-26', // Maha Shivaratri
  '2025-02-28', // Gyalpo Lhosar
  '2025-03-08', // International Women's Day
  '2025-03-13', // Fagu Purnima (Holi - Hilly)
  '2025-03-14', // Fagu Purnima (Holi - Terai)
  '2025-04-14', // Nepali New Year 2082
  '2025-05-01', // International Labour Day
  '2025-05-12', // Buddha Jayanti
  '2025-09-19', // Constitution Day
  '2025-10-01', // Ghatasthapana (Dashain)
  '2025-10-06', '2025-10-07', '2025-10-08', '2025-10-09', '2025-10-10', // Dashain Holidays
  '2025-10-27', '2025-10-28', '2025-10-29', '2025-10-30', // Tihar Holidays
  '2025-11-06', // Chhath
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year
  '2026-01-14', // Maghe Sankranti
  '2026-02-17', // Maha Shivaratri
  '2026-02-19', // National Democracy Day
  '2026-03-03', // Fagu Purnima (Holi - Hilly)
  '2026-03-04', // Fagu Purnima (Holi - Terai)
  '2026-03-08', // International Women's Day
  '2026-04-14', // Nepali New Year 2083
  '2026-05-01', // International Labour Day
  '2026-05-31', // Buddha Jayanti
  '2026-08-28', // Janai Purnima
  '2026-09-04', // Krishna Janmashtami
  '2026-09-19', // Constitution Day
  '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', // Dashain 2083
  '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', // Tihar 2083
  '2026-11-15', // Chhath 2083
  '2026-12-25', // Christmas
  // 2027
  '2027-01-01', // New Year
  '2027-01-14', // Maghe Sankranti
  '2027-03-08', // International Women's Day
  '2027-04-14'  // Nepali New Year 2084
];

const HOLIDAY_SET = new Set(EDITABLE_HOLIDAY_CALENDAR);

/**
 * Checks if a given ISO YYYY-MM-DD date is an official trading holiday.
 */
export function isHoliday(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const iso = dateStr.slice(0, 10);
  return HOLIDAY_SET.has(iso);
}

/**
 * Returns day of week (0=Sun, 1=Mon, ..., 6=Sat) for a calendar date string (YYYY-MM-DD).
 */
export function getCalendarDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay();
}

/**
 * Checks if a given date is an official NEPSE trading session (Mon-Fri and non-holiday).
 */
export function isTradingDay(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const iso = dateStr.slice(0, 10);
  const dayOfWeek = getCalendarDayOfWeek(iso);
  // Post-April 2026: Mon(1) to Fri(5) are active trading days; Sat(6) and Sun(0) are closed
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekend) return false;
  return !isHoliday(iso);
}

/**
 * Computes the next trading session date following a given date.
 */
export function getNextTradingDay(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  let safety = 60; // Prevent infinite loops during extended emergency shutdowns
  while (safety-- > 0) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    const iso = dt.toISOString().slice(0, 10);
    if (isTradingDay(iso)) {
      return iso;
    }
  }
  return dateStr;
}

/**
 * Computes the previous trading session date preceding a given date.
 */
export function getPreviousTradingDay(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  let safety = 60;
  while (safety-- > 0) {
    dt.setUTCDate(dt.getUTCDate() - 1);
    const iso = dt.toISOString().slice(0, 10);
    if (isTradingDay(iso)) {
      return iso;
    }
  }
  return dateStr;
}

/**
 * Adds N active trading sessions to a starting date.
 */
export function addTradingDays(dateStr, numDays = 1) {
  if (numDays <= 0) return dateStr;
  let current = dateStr.slice(0, 10);
  for (let i = 0; i < numDays; i++) {
    current = getNextTradingDay(current);
  }
  return current;
}

/**
 * Returns the exact T+2 Demat settlement date for a trade executed on tradeDateStr.
 */
export function getSettlementDate(tradeDateStr) {
  return addTradingDays(tradeDateStr, SETTLEMENT_CYCLE.settlementDays);
}

/**
 * Calculates statutory 5-tier broker commission for a given transaction amount.
 */
export function calculateBrokerCommission(amount) {
  const npr = Math.max(0, Number(amount) || 0);
  if (npr <= 0) return 0;
  for (const slab of BROKER_COMMISSION_SLABS) {
    if (npr <= slab.maxAmount) {
      const comm = npr * slab.rateDecimal;
      return slab.minFee ? Math.max(slab.minFee, +comm.toFixed(2)) : +comm.toFixed(2);
    }
  }
  return +(npr * 0.0024).toFixed(2);
}

/**
 * Calculates SEBON regulatory fee (0.015% of turnover).
 */
export function calculateSebonFee(amount) {
  const npr = Math.max(0, Number(amount) || 0);
  return +(npr * STATUTORY_CHARGES.sebonFeeDecimal).toFixed(2);
}

/**
 * Returns the flat CDSC DP fee for a sell trade.
 */
export function calculateDpFee() {
  return STATUTORY_CHARGES.cdscDpChargeRs;
}

/**
 * Calculates statutory Capital Gains Tax (CGT).
 * @param {number} netGain Realized gain after subtracting all entry & exit fees
 * @param {number} holdingDays Number of calendar days held
 * @param {'individual'|'corporate'|'non_resident'} investorType
 */
export function calculateCgt(netGain, holdingDays = 10, investorType = 'individual') {
  if (netGain <= 0) return 0;
  let rate = CAPITAL_GAINS_TAX.individualShortTermDecimal;
  if (investorType === 'corporate') {
    rate = CAPITAL_GAINS_TAX.corporateResidentDecimal;
  } else if (investorType === 'non_resident') {
    rate = CAPITAL_GAINS_TAX.nonResidentDecimal;
  } else if (holdingDays >= CAPITAL_GAINS_TAX.shortTermThresholdDays) {
    rate = CAPITAL_GAINS_TAX.individualLongTermDecimal;
  }
  return +(netGain * rate).toFixed(2);
}

/**
 * Calculates the individual stock circuit band (±15.0%) for a given previous close.
 */
export function calculateCircuitBand(prevClose) {
  const pc = Math.max(0.1, Number(prevClose) || 0);
  const bandPct = CIRCUIT_LIMITS.individualStockDailyBandPct / 100;
  const ceiling = +(Math.round((pc * (1 + bandPct)) * 10) / 10).toFixed(1);
  const floor = +(Math.round((pc * (1 - bandPct)) * 10) / 10).toFixed(1);
  return {
    ceiling: Math.max(pc, ceiling),
    floor: Math.max(0.1, floor),
    bandPct: CIRCUIT_LIMITS.individualStockDailyBandPct
  };
}

/**
 * Comprehensive Frictional Cost & Net PnL Calculation.
 * Accounts for 5-tier commission on Buy, SEBON on Buy, 5-tier commission on Sell,
 * SEBON on Sell, Rs. 25 DP charge, and statutory CGT on realized net profit.
 */
export function calculateRoundTripNetReturn({
  buyPrice,
  sellPrice,
  quantity = 100,
  holdingDays = 5,
  investorType = 'individual'
}) {
  const bp = Number(buyPrice) || 0;
  const sp = Number(sellPrice) || 0;
  const qty = Math.max(1, Math.round(Number(quantity) || 1));

  if (bp <= 0 || sp <= 0) {
    return {
      grossProfitNpr: 0,
      netProfitNpr: 0,
      grossReturnPct: 0,
      netReturnPct: 0,
      totalFrictionNpr: 0,
      frictionCostPct: 0,
      cgtDeductedNpr: 0
    };
  }

  const grossBuyValue = bp * qty;
  const buyCommission = calculateBrokerCommission(grossBuyValue);
  const buySebonFee = calculateSebonFee(grossBuyValue);
  const totalBuyCost = grossBuyValue + buyCommission + buySebonFee;

  const grossSellValue = sp * qty;
  const sellCommission = calculateBrokerCommission(grossSellValue);
  const sellSebonFee = calculateSebonFee(grossSellValue);
  const dpFee = calculateDpFee();
  const netSellProceedsBeforeTax = grossSellValue - sellCommission - sellSebonFee - dpFee;

  // Realized profit before tax under statutory WACC methodology
  const profitBeforeTax = netSellProceedsBeforeTax - totalBuyCost;
  const cgt = calculateCgt(profitBeforeTax, holdingDays, investorType);
  const finalNetProfit = profitBeforeTax - cgt;

  const grossProfit = grossSellValue - grossBuyValue;
  const totalFriction = totalBuyCost + (grossSellValue - netSellProceedsBeforeTax) + cgt - (grossBuyValue + (grossSellValue - grossSellValue)); // Total fee drag

  const grossReturnPct = +((grossProfit / grossBuyValue) * 100).toFixed(2);
  const netReturnPct = +((finalNetProfit / totalBuyCost) * 100).toFixed(2);
  const frictionCostPct = +((grossReturnPct - netReturnPct)).toFixed(2);

  return {
    grossBuyValue: +grossBuyValue.toFixed(2),
    grossSellValue: +grossSellValue.toFixed(2),
    totalBuyCost: +totalBuyCost.toFixed(2),
    netSellProceeds: +(netSellProceedsBeforeTax - cgt).toFixed(2),
    grossProfitNpr: +grossProfit.toFixed(2),
    netProfitNpr: +finalNetProfit.toFixed(2),
    grossReturnPct,
    netReturnPct,
    totalFrictionNpr: +(buyCommission + buySebonFee + sellCommission + sellSebonFee + dpFee + cgt).toFixed(2),
    cgtDeductedNpr: cgt,
    frictionCostPct
  };
}

/**
 * Returns audit inventory of all canonical rules with verification status and citations.
 */
export function getMarketRulesAuditInventory() {
  return [
    {
      rule: 'Trading Schedule (Mon-Fri 11:00-15:00 Asia/Kathmandu)',
      status: TRADING_SCHEDULE.status,
      citation: TRADING_SCHEDULE.citation,
      isVerified: true
    },
    {
      rule: 'Individual Stock Daily Circuit Band (±15.0%)',
      status: CIRCUIT_LIMITS.status,
      citation: CIRCUIT_LIMITS.citation,
      isVerified: true
    },
    {
      rule: 'Index Two/Three-Tier Circuit Breakers (4%, 5%, 6%)',
      status: CIRCUIT_LIMITS.status,
      citation: CIRCUIT_LIMITS.citation,
      isVerified: true
    },
    {
      rule: 'T+2 Demat Settlement Lockout',
      status: SETTLEMENT_CYCLE.status,
      citation: SETTLEMENT_CYCLE.citation,
      isVerified: true
    },
    {
      rule: '5-Tier Broker Commission Slabs (0.36% to 0.24%)',
      status: 'VERIFIED',
      citation: 'SEBON Directive on Broker Commission Slabs 2077',
      isVerified: true
    },
    {
      rule: 'SEBON Regulatory Turnover Fee (0.015%)',
      status: STATUTORY_CHARGES.status,
      citation: STATUTORY_CHARGES.citation,
      isVerified: true
    },
    {
      rule: 'CDSC Depository Participant (DP) Charge (Rs. 25.00 flat)',
      status: STATUTORY_CHARGES.status,
      citation: STATUTORY_CHARGES.citation,
      isVerified: true
    },
    {
      rule: 'Capital Gains Tax (7.5% Short-Term, 5.0% Long-Term, 10.0% Corporate)',
      status: CAPITAL_GAINS_TAX.status,
      citation: CAPITAL_GAINS_TAX.citation,
      isVerified: true
    },
    {
      rule: 'Dashain / Tihar / Public Holidays Calendar',
      status: 'VERIFIED',
      citation: 'Official Nepal Government Gazette Public Holidays & NEPSE Annual Trading Schedules',
      isVerified: true
    }
  ];
}
