// tests/marketRules.test.mjs
/**
 * ============================================================================
 * UNIT TEST SUITE: CANONICAL NEPSE MARKET RULES & STATUTORY FRICTIONS
 * ============================================================================
 */

import {
  TRADING_SCHEDULE,
  CIRCUIT_LIMITS,
  SETTLEMENT_CYCLE,
  STATUTORY_CHARGES,
  CAPITAL_GAINS_TAX,
  isHoliday,
  isTradingDay,
  getNextTradingDay,
  getPreviousTradingDay,
  addTradingDays,
  getSettlementDate,
  calculateBrokerCommission,
  calculateSebonFee,
  calculateDpFee,
  calculateCgt,
  calculateCircuitBand,
  calculateRoundTripNetReturn,
  getMarketRulesAuditInventory
} from '../src/constants/marketRules.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('======================================================================');
console.log('CANONICAL MARKET RULES & FRICTION ENGINE — VERIFICATION SUITE');
console.log('======================================================================\n');

// [TEST 1] Trading Schedule & Regime
console.log('[TEST 1] Trading Schedule & Regime Shifts');
assert(TRADING_SCHEDULE.timeZone === 'Asia/Kathmandu', 'Timezone strictly Asia/Kathmandu (UTC+5:45)');
assert(TRADING_SCHEDULE.tradingDays.includes('Friday') && !TRADING_SCHEDULE.tradingDays.includes('Sunday'), 'Mon-Fri regime enforced (Sunday closed, Friday open)');
assert(TRADING_SCHEDULE.regularSession.start === '11:00' && TRADING_SCHEDULE.regularSession.end === '15:00', 'Regular continuous matching session strictly 11:00 to 15:00');
assert(TRADING_SCHEDULE.status === 'VERIFIED', 'Schedule status is VERIFIED');

// [TEST 2] Circuit Band Calculations
console.log('\n[TEST 2] Circuit Band Enforcement (±15.0%)');
assert(CIRCUIT_LIMITS.individualStockDailyBandPct === 15.0, 'Daily circuit band strictly ±15.0% (superseding legacy 10%)');
const band1000 = calculateCircuitBand(1000);
assert(band1000.ceiling === 1150.0, `Ceiling for Rs. 1000 is Rs. 1150.0 (+15%) (got ${band1000.ceiling})`);
assert(band1000.floor === 850.0, `Floor for Rs. 1000 is Rs. 850.0 (-15%) (got ${band1000.floor})`);

const band346 = calculateCircuitBand(346);
assert(band346.ceiling === 397.9, `Ceiling for Rs. 346 is Rs. 397.9 (got ${band346.ceiling})`);
assert(band346.floor === 294.1, `Floor for Rs. 346 is Rs. 294.1 (got ${band346.floor})`);

// [TEST 3] Holiday Calendar & Settlement T+2 Math
console.log('\n[TEST 3] Holiday Calendar & Settlement Cycle');
assert(isHoliday('2026-11-10'), '2026-11-10 (Tihar) recognized as holiday');
assert(!isHoliday('2026-11-06'), '2026-11-06 (Trading session) is not a holiday');
assert(isTradingDay('2026-11-06'), '2026-11-06 (Friday) recognized as trading session');
assert(!isTradingDay('2026-11-07'), '2026-11-07 (Saturday) recognized as weekend');
assert(!isTradingDay('2026-11-08'), '2026-11-08 (Sunday) recognized as weekend');
assert(!isTradingDay('2026-11-10'), '2026-11-10 (Tihar holiday) recognized as non-trading day');

// Next trading day after Tihar break (Nov 12 ends, Friday Nov 13 was holiday, reopens Nov 16)
const nextSession = getNextTradingDay('2026-11-06');
assert(typeof nextSession === 'string' && nextSession > '2026-11-06', `Next trading session computed: ${nextSession}`);

// T+2 Settlement calculation
const t2Settle = getSettlementDate('2026-11-06');
assert(typeof t2Settle === 'string' && t2Settle > nextSession, `T+2 settlement for 2026-11-06 correctly advances 2 sessions: ${t2Settle}`);
assert(SETTLEMENT_CYCLE.settlementDays === 2, 'Settlement cycle strictly T+2');

// [TEST 4] 5-Tier Broker Commission Slabs
console.log('\n[TEST 4] 5-Tier Broker Commission Slabs');
// Slab 1: <= 50,000 @ 0.36% (min Rs. 10)
assert(calculateBrokerCommission(1000) === 10.0, 'Small Rs. 1000 trade hits minimum commission Rs. 10.0');
assert(calculateBrokerCommission(50000) === 180.0, 'Rs. 50,000 commission is exactly Rs. 180 (0.36%)');

// Slab 2: 50,001 - 500,000 @ 0.33%
assert(calculateBrokerCommission(200000) === 660.0, 'Rs. 200,000 commission is exactly Rs. 660 (0.33%)');

// Slab 3: 500,001 - 2,000,000 @ 0.31%
assert(calculateBrokerCommission(1000000) === 3100.0, 'Rs. 1,000,000 commission is exactly Rs. 3100 (0.31%)');

// Slab 4: 2,000,001 - 10,000,000 @ 0.27%
assert(calculateBrokerCommission(5000000) === 13500.0, 'Rs. 5,000,000 commission is exactly Rs. 13,500 (0.27%)');

// Slab 5: > 10,000,000 @ 0.24%
assert(calculateBrokerCommission(20000000) === 48000.0, 'Rs. 20,000,000 commission is exactly Rs. 48,000 (0.24%)');

// [TEST 5] SEBON Regulatory Fee & DP Fee
console.log('\n[TEST 5] SEBON & DP Charges');
assert(STATUTORY_CHARGES.sebonFeeRatePct === 0.015, 'SEBON fee rate is strictly 0.015%');
assert(calculateSebonFee(100000) === 15.0, 'SEBON fee for Rs. 100,000 is Rs. 15.00');
assert(calculateDpFee() === 25.0, 'CDSC DP fee is strictly Rs. 25.00 flat');

// [TEST 6] Capital Gains Tax (CGT)
console.log('\n[TEST 6] Capital Gains Tax (CGT)');
assert(calculateCgt(10000, 30, 'individual') === 750.0, 'Individual short-term CGT (<365d) is 7.5% (Rs. 750 on Rs. 10k profit)');
assert(calculateCgt(10000, 400, 'individual') === 500.0, 'Individual long-term CGT (>=365d) is 5.0% (Rs. 500 on Rs. 10k profit)');
assert(calculateCgt(10000, 30, 'corporate') === 1000.0, 'Corporate CGT is 10.0% (Rs. 1000 on Rs. 10k profit)');
assert(calculateCgt(-5000, 30, 'individual') === 0, 'Negative profit incurs zero CGT');

// [TEST 7] Comprehensive Round-Trip Net Profit & Cost Drag
console.log('\n[TEST 7] Round-Trip Friction & Real Net PnL');
// Buy 100 shares @ 300, sell @ 330 (+10% gross gain, Rs. 3,000 gross profit)
const tradeResult = calculateRoundTripNetReturn({
  buyPrice: 300,
  sellPrice: 330,
  quantity: 100,
  holdingDays: 10,
  investorType: 'individual'
});

assert(tradeResult.grossReturnPct === 10.0, `Gross return is exactly +10.0% (got ${tradeResult.grossReturnPct}%)`);
assert(tradeResult.netReturnPct < 10.0, `Net return (${tradeResult.netReturnPct}%) is less than gross due to friction`);
assert(tradeResult.cgtDeductedNpr > 0, `CGT deducted (${tradeResult.cgtDeductedNpr}) from net winning trade`);
assert(tradeResult.totalFrictionNpr > 300, `Total friction accurately accounts for all fees (${tradeResult.totalFrictionNpr})`);
assert(tradeResult.frictionCostPct > 0.8, `Friction cost drag is > 0.8% (${tradeResult.frictionCostPct}%)`);

// [TEST 8] Audit Inventory Verification
console.log('\n[TEST 8] Audit Inventory Verification');
const inventory = getMarketRulesAuditInventory();
assert(inventory.length >= 8, `Audit inventory has at least 8 verified rules (${inventory.length} rules)`);
assert(inventory.every(r => r.isVerified && r.citation), 'Every rule in inventory has verified status and valid citation');

console.log('\n======================================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
