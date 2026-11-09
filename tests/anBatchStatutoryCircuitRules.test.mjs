// tests/akBatchStatutoryCircuitRules.test.mjs
/**
 * Test Suite: NEPSE Statutory Circuit Breaker, Pre-Open & Volatility Rules (April 2026)
 * 
 * Verifies:
 * 1. Individual stock daily price limit is strictly 15.0% (±15%).
 * 2. Pre-open session limit is strictly 5.0% (±5%).
 * 3. Market-wide index circuit breaker two-tier model:
 *    - Level 1: 5.0% Index move = 15-minute trading suspension.
 *    - Level 2: 8.0% Cumulative Index move = Closed for remainder of the day.
 * 4. Radar warning triggered when Index is within 1% of the 5% Level 1 threshold.
 * 5. Price and return clamping to the ±15% statutory bounds.
 * 6. Lock and near-circuit status detection.
 * 7. Parity between proxy (nepseRules.mjs) and frontend (nepseRules.js).
 */

import assert from 'assert';
import {
  NEPSE_RULES as BACKEND_RULES,
  getCircuitLimits as getBackendCircuitLimits,
  getPreOpenLimits as getBackendPreOpenLimits,
  clampToDailyCircuitBand as backendClampToDailyCircuitBand,
  clampReturnIntervalToCircuit as backendClampReturnIntervalToCircuit,
  checkCircuitStatus as backendCheckCircuitStatus,
  evaluateIndexCircuitBreaker as backendEvaluateIndexCircuitBreaker
} from '../proxy/utils/nepseRules.mjs';

import {
  NEPSE_RULES as FRONTEND_RULES,
  getCircuitLimits as getFrontendCircuitLimits,
  getPreOpenLimits as getFrontendPreOpenLimits,
  clampToDailyCircuitBand as frontendClampToDailyCircuitBand,
  clampReturnIntervalToCircuit as frontendClampReturnIntervalToCircuit,
  checkCircuitStatus as frontendCheckCircuitStatus,
  evaluateIndexCircuitBreaker as frontendEvaluateIndexCircuitBreaker
} from '../src/utils/nepseRules.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('======================================================================');
console.log(' NEPSE STATUTORY CIRCUIT & VOLATILITY RULES (APRIL 2026) TEST SUITE');
console.log('======================================================================\n');

// ── TEST 1: Parity between Backend and Frontend Rule Engines ─────────
console.log('[TEST 1] Single Source of Truth Parity (proxy vs src)');
it('Backend and Frontend rule constants are identical', () => {
  assert.strictEqual(BACKEND_RULES.DAILY_CIRCUIT_LIMIT_PCT, FRONTEND_RULES.DAILY_CIRCUIT_LIMIT_PCT);
  assert.strictEqual(BACKEND_RULES.PRE_OPEN_LIMIT_PCT, FRONTEND_RULES.PRE_OPEN_LIMIT_PCT);
  assert.strictEqual(BACKEND_RULES.INDEX_CIRCUIT_LEVEL_1_PCT, FRONTEND_RULES.INDEX_CIRCUIT_LEVEL_1_PCT);
  assert.strictEqual(BACKEND_RULES.INDEX_CIRCUIT_LEVEL_2_PCT, FRONTEND_RULES.INDEX_CIRCUIT_LEVEL_2_PCT);
  assert.strictEqual(BACKEND_RULES.CIRCUIT_UPPER_MULTIPLIER, 1.15);
  assert.strictEqual(BACKEND_RULES.CIRCUIT_LOWER_MULTIPLIER, 0.85);
  assert.strictEqual(BACKEND_RULES.PRE_OPEN_UPPER_MULTIPLIER, 1.05);
  assert.strictEqual(BACKEND_RULES.PRE_OPEN_LOWER_MULTIPLIER, 0.95);
});

// ── TEST 2: Individual Stock Daily Circuit Limits (±15%) ──────────────
console.log('\n[TEST 2] Individual Stock Daily Circuit Limits (±15%)');
it('PrevClose Rs. 1000 produces Floor Rs. 850 (-15%) and Ceiling Rs. 1150 (+15%)', () => {
  const limits = getBackendCircuitLimits(1000);
  assert.strictEqual(limits.floor, 850.0);
  assert.strictEqual(limits.ceiling, 1150.0);
  assert.strictEqual(limits.circuitPct, 15.0);

  const feLimits = getFrontendCircuitLimits(1000);
  assert.strictEqual(feLimits.floor, 850.0);
  assert.strictEqual(feLimits.ceiling, 1150.0);
});

it('PrevClose Rs. 320 produces Floor Rs. 272 (-15%) and Ceiling Rs. 368 (+15%)', () => {
  const limits = getBackendCircuitLimits(320);
  assert.strictEqual(limits.floor, 272.0);
  assert.strictEqual(limits.ceiling, 368.0);
});

// ── TEST 3: Pre-Open Session Order Limits (±5%) ───────────────────────
console.log('\n[TEST 3] Pre-Open Session Order Limits (±5%)');
it('PrevClose Rs. 400 produces Pre-Open range Rs. 380 to Rs. 420 (±5%)', () => {
  const limits = getBackendPreOpenLimits(400);
  assert.strictEqual(limits.floor, 380.0);
  assert.strictEqual(limits.ceiling, 420.0);
  assert.strictEqual(limits.preOpenPct, 5.0);

  const feLimits = getFrontendPreOpenLimits(400);
  assert.strictEqual(feLimits.floor, 380.0);
  assert.strictEqual(feLimits.ceiling, 420.0);
});

it('PrevClose Rs. 1000 produces Pre-Open range Rs. 950 to Rs. 1050 (±5%)', () => {
  const limits = getBackendPreOpenLimits(1000);
  assert.strictEqual(limits.floor, 950.0);
  assert.strictEqual(limits.ceiling, 1050.0);
});

// ── TEST 4: Market-Wide Two-Tier Index Circuit Breaker ───────────────
console.log('\n[TEST 4] Market-Wide Two-Tier Index Circuit Breaker (5% & 8%)');
it('Index move of +5.2% triggers Level 1 circuit breaker (15-minute halt)', () => {
  const res = backendEvaluateIndexCircuitBreaker(5.2);
  assert.strictEqual(res.isHalted, true);
  assert.strictEqual(res.level, 1);
  assert.strictEqual(res.haltDurationMinutes, 15);
  assert.strictEqual(res.isClosedForDay, false);
  assert.ok(res.message.includes('15-minute trading suspension'));

  const feRes = frontendEvaluateIndexCircuitBreaker(5.2);
  assert.strictEqual(feRes.level, 1);
  assert.strictEqual(feRes.haltDurationMinutes, 15);
});

it('Index plunge of -5.0% triggers Level 1 circuit breaker (15-minute halt)', () => {
  const res = backendEvaluateIndexCircuitBreaker(-5.0);
  assert.strictEqual(res.isHalted, true);
  assert.strictEqual(res.level, 1);
  assert.strictEqual(res.haltDurationMinutes, 15);
  assert.strictEqual(res.isClosedForDay, false);
});

it('Index move of +8.1% triggers Level 2 circuit breaker (closed for remainder of the day)', () => {
  const res = backendEvaluateIndexCircuitBreaker(8.1);
  assert.strictEqual(res.isHalted, true);
  assert.strictEqual(res.level, 2);
  assert.strictEqual(res.haltDurationMinutes, null);
  assert.strictEqual(res.isClosedForDay, true);
  assert.ok(res.message.includes('Full session halt triggered'));

  const feRes = frontendEvaluateIndexCircuitBreaker(8.1);
  assert.strictEqual(feRes.level, 2);
  assert.strictEqual(feRes.isClosedForDay, true);
});

it('Index plunge of -8.5% triggers Level 2 circuit breaker (closed for remainder of the day)', () => {
  const res = backendEvaluateIndexCircuitBreaker(-8.5);
  assert.strictEqual(res.isHalted, true);
  assert.strictEqual(res.level, 2);
  assert.strictEqual(res.isClosedForDay, true);
});

it('Index move of +4.2% triggers SEBON Circuit Radar proximity warning', () => {
  const res = backendEvaluateIndexCircuitBreaker(4.2);
  assert.strictEqual(res.isHalted, false);
  assert.strictEqual(res.level, 0);
  assert.strictEqual(res.isRadarWarning, true);
  assert.ok(res.message.includes('within 1% of the 5% market circuit breaker threshold'));
});

it('Index move of +1.5% is normal trading (no halt, no radar warning)', () => {
  const res = backendEvaluateIndexCircuitBreaker(1.5);
  assert.strictEqual(res.isHalted, false);
  assert.strictEqual(res.level, 0);
  assert.strictEqual(res.isRadarWarning, false);
  assert.strictEqual(res.message, 'Normal Trading');
});

// ── TEST 5: Clamping to ±15% Circuit Band ──────────────────────────────
console.log('\n[TEST 5] Clamping to ±15% Circuit Band');
it('Overshooting price projection (1250 on prevClose 1000) clamped to ceiling 1150.0', () => {
  const clamped = backendClampToDailyCircuitBand(1250, 1000);
  assert.strictEqual(clamped, 1150.0);
  assert.strictEqual(frontendClampToDailyCircuitBand(1250, 1000), 1150.0);
});

it('Undershooting price projection (750 on prevClose 1000) clamped to floor 850.0', () => {
  const clamped = backendClampToDailyCircuitBand(750, 1000);
  assert.strictEqual(clamped, 850.0);
  assert.strictEqual(frontendClampToDailyCircuitBand(750, 1000), 850.0);
});

it('In-band price projection (1080 on prevClose 1000) remains unclamped', () => {
  const clamped = backendClampToDailyCircuitBand(1080, 1000);
  assert.strictEqual(clamped, 1080.0);
});

it('Return interval [-24.5%, +32.1%] clamped to [-15.0%, +15.0%]', () => {
  const clamped = backendClampReturnIntervalToCircuit(-24.5, 32.1);
  assert.strictEqual(clamped.lower, -15.0);
  assert.strictEqual(clamped.upper, 15.0);
  assert.strictEqual(clamped.circuitPct, 15.0);
});

// ── TEST 6: Lock and Near-Circuit Detection ───────────────────────────
console.log('\n[TEST 6] Lock and Near-Circuit Status Detection');
it('Stock at +15% ceiling detected as ceiling locked', () => {
  const status = backendCheckCircuitStatus(1150, 1000);
  assert.strictEqual(status.isLocked, true);
  assert.strictEqual(status.isCeilingLocked, true);
  assert.strictEqual(status.isFloorLocked, false);
});

it('Stock at -15% floor detected as floor locked', () => {
  const status = backendCheckCircuitStatus(850, 1000);
  assert.strictEqual(status.isLocked, true);
  assert.strictEqual(status.isCeilingLocked, false);
  assert.strictEqual(status.isFloorLocked, true);
});

it('Stock up +13.0% detected as near circuit but NOT locked', () => {
  const status = backendCheckCircuitStatus(1130, 1000);
  assert.strictEqual(status.isLocked, false);
  assert.strictEqual(status.isNearCircuit, true);
});

it('Stock up +2.0% detected as neither near circuit nor locked', () => {
  const status = backendCheckCircuitStatus(1020, 1000);
  assert.strictEqual(status.isLocked, false);
  assert.strictEqual(status.isNearCircuit, false);
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================================\n`);

if (failed > 0) process.exit(1);
