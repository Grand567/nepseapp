// proxy/utils/nepseRules.mjs
/**
 * Single Source of Truth: NEPSE Statutory Trading, Circuit & Volatility Rules
 * Effective: April 2026 (Baishakh 2083) under Securities Trading Operation
 * (Fourth Amendment) Bylaws 2082.
 * 
 * Rules:
 * 1. Individual Stock Daily Price Limits: ±15.0% from previous close (expanded from legacy 10%)
 * 2. Pre-Open Session Order Limits (10:30–10:45 AM): ±5.0% from previous close (expanded from legacy 2%)
 * 3. Market-Wide Index Circuit Breakers (Two-Tier Model):
 *    - Level 1: 5.0% Index move (first hour / opening sessions) = 15-minute full market trading halt
 *    - Level 2: 8.0% Cumulative Index move = Trading suspended for remainder of the day
 * 4. Demat Delivery & Settlement: T+2 Rolling Settlement (Sellable on Day T+3)
 */

export const NEPSE_RULES = Object.freeze({
  // ── Individual Stock Circuit Bands ──
  DAILY_CIRCUIT_LIMIT_PCT: 15.0,
  CIRCUIT_UPPER_MULTIPLIER: 1.15,
  CIRCUIT_LOWER_MULTIPLIER: 0.85,

  // ── Pre-Open Session (10:30 AM – 10:45 AM NPT) ──
  PRE_OPEN_LIMIT_PCT: 5.0,
  PRE_OPEN_UPPER_MULTIPLIER: 1.05,
  PRE_OPEN_LOWER_MULTIPLIER: 0.95,
  PRE_OPEN_GAP_TRAP_THRESHOLD_PCT: 4.5,

  // ── Proximity & Trap Guards ──
  CIRCUIT_NEAR_THRESHOLD_PCT: 12.5,
  CIRCUIT_LOCKED_THRESHOLD_PCT: 14.8,
  CIRCUIT_CHASE_DISTANCE_PCT: 2.0,

  // ── Market-Wide Index Circuit Breakers ──
  INDEX_CIRCUIT_LEVEL_1_PCT: 5.0,
  INDEX_CIRCUIT_LEVEL_1_HALT_MINUTES: 15,
  INDEX_CIRCUIT_LEVEL_2_PCT: 8.0,
  INDEX_CIRCUIT_LEVEL_2_HALT_DAY: true,
  INDEX_CIRCUIT_RADAR_PROXIMITY_PCT: 1.0,

  // ── Settlement ──
  SETTLEMENT_DAYS: 2,
  SELLABLE_DAYS: 3
});

// Backwards-compatible named exports
export const NEPSE_CIRCUIT_BAND_PCT = NEPSE_RULES.DAILY_CIRCUIT_LIMIT_PCT;
export const NEPSE_CIRCUIT_PCT = NEPSE_RULES.DAILY_CIRCUIT_LIMIT_PCT;
export const PRE_OPEN_LIMIT_PCT = NEPSE_RULES.PRE_OPEN_LIMIT_PCT;
export const INDEX_CIRCUIT_LEVEL_1_PCT = NEPSE_RULES.INDEX_CIRCUIT_LEVEL_1_PCT;
export const INDEX_CIRCUIT_LEVEL_2_PCT = NEPSE_RULES.INDEX_CIRCUIT_LEVEL_2_PCT;

/**
 * Calculates absolute floor and ceiling bounded strictly by the daily circuit limit.
 * @param {number} prevClose
 * @param {number} [circuitPct=15.0]
 * @returns {{ floor: number|null, ceiling: number|null, circuitPct: number }}
 */
export function getCircuitLimits(prevClose, circuitPct = NEPSE_RULES.DAILY_CIRCUIT_LIMIT_PCT) {
  const p = Number(prevClose);
  if (!p || p <= 0) return { floor: null, ceiling: null, circuitPct };
  const ceiling = +(p * (1 + circuitPct / 100)).toFixed(1);
  const floor = +(p * (1 - circuitPct / 100)).toFixed(1);
  return { floor, ceiling, circuitPct };
}

/**
 * Calculates pre-open price boundary (±5.0%).
 * @param {number} prevClose
 * @param {number} [preOpenPct=5.0]
 * @returns {{ floor: number|null, ceiling: number|null, preOpenPct: number }}
 */
export function getPreOpenLimits(prevClose, preOpenPct = NEPSE_RULES.PRE_OPEN_LIMIT_PCT) {
  const p = Number(prevClose);
  if (!p || p <= 0) return { floor: null, ceiling: null, preOpenPct };
  const ceiling = +(p * (1 + preOpenPct / 100)).toFixed(1);
  const floor = +(p * (1 - preOpenPct / 100)).toFixed(1);
  return { floor, ceiling, preOpenPct };
}

/**
 * Clamps a single-session projected price strictly to the ±15% circuit band from prevClose.
 * @param {number} projectedPrice
 * @param {number} prevClose
 * @param {number} [circuitPct=15.0]
 * @returns {number}
 */
export function clampToDailyCircuitBand(projectedPrice, prevClose, circuitPct = NEPSE_RULES.DAILY_CIRCUIT_LIMIT_PCT) {
  const raw = Number(projectedPrice);
  const prev = Number(prevClose);
  if (isNaN(raw) || isNaN(prev) || prev <= 0) return raw;

  const floor = +(prev * (1 - circuitPct / 100)).toFixed(1);
  const ceiling = +(prev * (1 + circuitPct / 100)).toFixed(1);
  return Math.min(ceiling, Math.max(floor, raw));
}

/**
 * Clamps statistical/volatility percentage bounds to ±15%.
 * @param {number} lowerPct
 * @param {number} upperPct
 * @param {number} [circuitPct=15.0]
 * @returns {{ lower: number, upper: number, circuitPct: number }}
 */
export function clampReturnIntervalToCircuit(lowerPct, upperPct, circuitPct = NEPSE_RULES.DAILY_CIRCUIT_LIMIT_PCT) {
  const rawLower = Number(lowerPct) || -circuitPct;
  const rawUpper = Number(upperPct) || circuitPct;
  return {
    lower: Math.max(-circuitPct, rawLower),
    upper: Math.min(circuitPct, rawUpper),
    circuitPct
  };
}

/**
 * Evaluates whether an individual stock is locked at or near its circuit limit.
 * @param {number} ltp
 * @param {number} prevClose
 * @param {number|null} [pChange=null]
 * @returns {{ isLocked: boolean, isCeilingLocked: boolean, isFloorLocked: boolean, isNearCircuit: boolean }}
 */
export function checkCircuitStatus(ltp, prevClose, pChange = null) {
  const p = Number(ltp) || 0;
  const prev = Number(prevClose) || p;
  const chg = pChange !== null ? Number(pChange) : (prev > 0 ? ((p - prev) / prev) * 100 : 0);
  const { floor, ceiling } = getCircuitLimits(prev);

  const isCeilingLocked = chg >= NEPSE_RULES.CIRCUIT_LOCKED_THRESHOLD_PCT || (ceiling !== null && p >= ceiling);
  const isFloorLocked = chg <= -NEPSE_RULES.CIRCUIT_LOCKED_THRESHOLD_PCT || (floor !== null && p <= floor);
  const isNearCircuit = Math.abs(chg) >= NEPSE_RULES.CIRCUIT_NEAR_THRESHOLD_PCT;

  return {
    isLocked: isCeilingLocked || isFloorLocked,
    isCeilingLocked,
    isFloorLocked,
    isNearCircuit
  };
}

/**
 * Evaluates market-wide index circuit breaker status.
 * @param {number} indexPChangePct
 * @returns {{ isHalted: boolean, level: number, haltDurationMinutes: number|null, isClosedForDay: boolean, isRadarWarning: boolean, message: string }}
 */
export function evaluateIndexCircuitBreaker(indexPChangePct) {
  const chg = Number(indexPChangePct) || 0;
  const absChg = Math.abs(chg);

  if (absChg >= NEPSE_RULES.INDEX_CIRCUIT_LEVEL_2_PCT) {
    return {
      isHalted: true,
      level: 2,
      haltDurationMinutes: null,
      isClosedForDay: true,
      isRadarWarning: false,
      message: `🚨 SEBON Level 2 Circuit Breaker: Index moved ${chg > 0 ? '+' : ''}${chg.toFixed(2)}% (>= ${NEPSE_RULES.INDEX_CIRCUIT_LEVEL_2_PCT}%). Full session halt triggered.`
    };
  }

  if (absChg >= NEPSE_RULES.INDEX_CIRCUIT_LEVEL_1_PCT) {
    return {
      isHalted: true,
      level: 1,
      haltDurationMinutes: NEPSE_RULES.INDEX_CIRCUIT_LEVEL_1_HALT_MINUTES,
      isClosedForDay: false,
      isRadarWarning: false,
      message: `⚠️ SEBON Level 1 Circuit Breaker: Index moved ${chg > 0 ? '+' : ''}${chg.toFixed(2)}% (>= ${NEPSE_RULES.INDEX_CIRCUIT_LEVEL_1_PCT}%). ${NEPSE_RULES.INDEX_CIRCUIT_LEVEL_1_HALT_MINUTES}-minute trading suspension active.`
    };
  }

  const isRadarWarning = absChg >= (NEPSE_RULES.INDEX_CIRCUIT_LEVEL_1_PCT - NEPSE_RULES.INDEX_CIRCUIT_RADAR_PROXIMITY_PCT);
  return {
    isHalted: false,
    level: 0,
    haltDurationMinutes: null,
    isClosedForDay: false,
    isRadarWarning,
    message: isRadarWarning
      ? `⚡ SEBON Circuit Radar: Index at ${chg > 0 ? '+' : ''}${chg.toFixed(2)}% is within 1% of the ${NEPSE_RULES.INDEX_CIRCUIT_LEVEL_1_PCT}% market circuit breaker threshold.`
      : 'Normal Trading'
  };
}
