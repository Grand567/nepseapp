// tests/testDynamicCapitalEngine.mjs
process.env.SUPPRESS_TEST_ALERTS = 'true';
process.env.NODE_ENV = 'test';
import assert from 'assert';
import {
  calculateDynamicPositionSizing,
  getCapitalTierConfig,
  getNepseBrokerCommissionRate,
  calculateDynamicBrokerFee,
  formatDualModeExecutionTicket,
  DEFAULT_USER_CAPITAL,
  NEPSE_FRICTION_FY2083
} from '../src/utils/dynamicCapitalEngine.js';

import {
  evaluateTurnoverToFloatRotation,
  evaluateSectorFundamentalAndLockinTraps,
  evaluateInstitutionalAlert
} from '../proxy/institutionalAlertEngine.mjs';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('💎 TEST SUITE: DYNAMIC CAPITAL ENGINE & INSTITUTIONAL LAYERS');
console.log('═══════════════════════════════════════════════════════════════════\n');

// ── TEST 1: CAPITAL TIER 1 (RS. 50,000 STARTER PORTFOLIO) ───────────────────
console.log('Test 1: Validating Tier 1 — Rs. 50,000 Starter Portfolio...');
const t1Config = getCapitalTierConfig(50000);
assert.strictEqual(t1Config.tier, 1);
assert.strictEqual(t1Config.maxSlots, 3, 'Tier 1 must have 3 slots');
assert.strictEqual(t1Config.riskPerTradePct, 0.015, 'Tier 1 risk is 1.5%');
assert.strictEqual(t1Config.maxSlotAllocationPct, 0.35, 'Tier 1 max slot is 35%');

const sizing50k = calculateDynamicPositionSizing({
  userCapital: 50000,
  entryPrice: 300,
  stopLoss: 285, // 5% stop
  target1: 360,  // 20% target
  target2: 390,
  median20DayTurnover: 8000000
});

assert.ok(sizing50k);
assert.strictEqual(sizing50k.tier, 1);
assert.strictEqual(sizing50k.commissionRate, 0.0036, 'Rs. 50k order qualifies for 0.36% broker commission');
assert.strictEqual(sizing50k.maxRiskRupees, 750, '1.5% of 50k is Rs. 750');
assert.ok(sizing50k.finalKitta >= 10, 'Must meet NEPSE 10-kitta regular lot rule');
assert.ok(sizing50k.deployedCapital <= 50000 * 0.35 + 200, 'Must not exceed 35% slot capital allocation');
console.log(`✅ Test 1 Passed: Rs. 50k Sized -> ${sizing50k.finalKitta} Kitta (Deployed: Rs. ${sizing50k.deployedCapital}, Commission: ${sizing50k.commissionTierText}).\n`);

// ── TEST 2: CAPITAL TIER 1 (RS. 100,000 RETAIL BASELINE) ────────────────────
console.log('Test 2: Validating Tier 1 — Rs. 100,000 Retail Baseline...');
const t100kConfig = getCapitalTierConfig(100000);
assert.strictEqual(t100kConfig.tier, 1);
assert.strictEqual(t100kConfig.maxSlots, 3);
assert.strictEqual(t100kConfig.riskPerTradePct, 0.015);

const sizing100k = calculateDynamicPositionSizing({
  userCapital: 100000,
  entryPrice: 270,
  stopLoss: 258,
  target1: 330,
  target2: 355,
  median20DayTurnover: 8200000
});

assert.ok(sizing100k);
assert.strictEqual(sizing100k.tier, 1);
assert.strictEqual(sizing100k.commissionRate, 0.0036, 'Order value under Rs. 50k is 0.36% commission');
assert.strictEqual(sizing100k.maxRiskRupees, 1500, '1.5% of 100k is Rs. 1,500');
assert.ok(sizing100k.netRRR >= 2.5, `Net RRR must be >= 2.5 (got ${sizing100k.netRRR})`);
assert.strictEqual(sizing100k.cgtRate, 0.100, 'FY 2083/84 Short-term CGT is 10.0%');
console.log(`✅ Test 2 Passed: Rs. 100k Sized -> ${sizing100k.finalKitta} Kitta (Net RRR: ${sizing100k.netRRR}:1, Risk: Rs. ${sizing100k.actualRiskRupees}).\n`);

// ── TEST 3: CAPITAL TIER 2 (RS. 1,000,000 ACTIVE SWING) ─────────────────────
console.log('Test 3: Validating Tier 2 — Rs. 1,000,000 Active Swing Portfolio...');
const t1mConfig = getCapitalTierConfig(1000000);
assert.strictEqual(t1mConfig.tier, 2);
assert.strictEqual(t1mConfig.maxSlots, 5, 'Tier 2 must have 5 slots');
assert.strictEqual(t1mConfig.riskPerTradePct, 0.0125, 'Tier 2 risk is 1.25%');
assert.strictEqual(t1mConfig.maxSlotAllocationPct, 0.25, 'Tier 2 max slot is 25%');

const sizing1m = calculateDynamicPositionSizing({
  userCapital: 1000000,
  entryPrice: 500,
  stopLoss: 475,
  target1: 610,
  target2: 650,
  median20DayTurnover: 12000000
});

assert.ok(sizing1m);
assert.strictEqual(sizing1m.tier, 2);
assert.strictEqual(sizing1m.maxRiskRupees, 12500, '1.25% of 1M is Rs. 12,500');
assert.ok(sizing1m.deployedCapital <= 250000 + 1000, 'Must respect 25% slot capital allocation (Rs. 2.5L)');
assert.strictEqual(sizing1m.commissionRate, 0.0033, 'Order value between Rs. 50k and Rs. 500k is 0.33% commission');
console.log(`✅ Test 3 Passed: Rs. 1M Sized -> ${sizing1m.finalKitta} Kitta (Deployed: Rs. ${sizing1m.deployedCapital}, Commission: ${sizing1m.commissionTierText}).\n`);

// ── TEST 4: CAPITAL TIER 4 (RS. 7,500,000 INSTITUTIONAL / HNWI) ─────────────
console.log('Test 4: Validating Tier 4 — Rs. 7,500,000 Institutional / Family Office...');
const t75mConfig = getCapitalTierConfig(7500000);
assert.strictEqual(t75mConfig.tier, 4);
assert.strictEqual(t75mConfig.maxSlots, 8, 'Tier 4 must have 8 slots');
assert.strictEqual(t75mConfig.riskPerTradePct, 0.0075, 'Tier 4 risk is 0.75%');
assert.strictEqual(t75mConfig.maxSlotAllocationPct, 0.15, 'Tier 4 max slot is 15%');

const sizing75m = calculateDynamicPositionSizing({
  userCapital: 7500000,
  entryPrice: 420,
  stopLoss: 399,
  target1: 520,
  target2: 560,
  median20DayTurnover: 9000000 // 90 Lakhs turnover -> 5% safe cap is Rs. 4.5 Lakhs
});

assert.ok(sizing75m);
assert.strictEqual(sizing75m.tier, 4);
assert.strictEqual(sizing75m.maxRiskRupees, 56250, '0.75% of 7.5M is Rs. 56,250');
assert.ok(sizing75m.deployedCapital <= 450000 + 2000, 'Must be strictly capped by 5% 20D median turnover (Rs. 4.5L)');
assert.strictEqual(sizing75m.commissionRate, 0.0033, 'Order under Rs. 500k is 0.33%');
console.log(`✅ Test 4 Passed: Rs. 7.5M Sized -> ${sizing75m.finalKitta} Kitta (Liquidity Capped at Rs. ${sizing75m.deployedCapital} <= Rs. 4.5L 5% cap).\n`);

// ── TEST 5: LAYER 1 — TURNOVER-TO-FLOAT ROTATION ────────────────────────────
console.log('Test 5: Validating Layer 1 Turnover-to-Float Sector Rotation...');

// Sub-4 Arba turnover blocks heavyweights
const rotLowTurnover = evaluateTurnoverToFloatRotation({ marketTurnoverArba: 3.2, sector: 'Commercial Banks' });
assert.strictEqual(rotLowTurnover.passed, false, 'Heavyweight banks not permitted under sub-4 Arba turnover');

// Moderate turnover (Rs. 5.5 Arba) prioritizes low-float sectors
const rotModLowFloat = evaluateTurnoverToFloatRotation({ marketTurnoverArba: 5.5, sector: 'Finance' });
assert.strictEqual(rotModLowFloat.passed, true, 'Finance is favored under moderate 5.5 Arba turnover');

// High turnover (Rs. 12 Arba) unlocks heavyweight commercial banks
const rotHighTurnover = evaluateTurnoverToFloatRotation({ marketTurnoverArba: 12.0, sector: 'Commercial Banks' });
assert.strictEqual(rotHighTurnover.passed, true, 'Banks unlocked under 12 Arba high exchange turnover');
console.log('✅ Test 5 Passed: Turnover-to-Float sector rotation verified across all 3 market turnover regimes.\n');

// ── TEST 6: LAYER 2 — SECTOR FUNDAMENTALS & LOCK-IN TRAP AGENT ──────────────
console.log('Test 6: Validating Layer 2 Sector Fundamental & Lock-in Traps...');

// 6.1 Promoter Lock-in Expiry within 90-180 day cliff
const lockinTrap = evaluateSectorFundamentalAndLockinTraps({
  symbol: 'HATHY',
  sector: 'Investment',
  daysToLockInExpiry: 120, // Inside 90 to 180 day cliff
  lockinType: 'promoter'
});
assert.strictEqual(lockinTrap.passed, false);
assert.ok(lockinTrap.traps.some(t => t.code === 'VETO_LOCKIN_EXPIRY_CLIFF'));
console.log('✅ Test 6.1 Passed: 120-day promoter lock-in supply cliff vetoed.');

// 6.2 Bank NPL > 4.5% or negative distributable profit
const bankTrap = evaluateSectorFundamentalAndLockinTraps({
  symbol: 'TESTBANK',
  sector: 'Commercial Banks',
  fundamentals: { npl: 4.8, distributableEps: -3.5 }
});
assert.strictEqual(bankTrap.passed, false);
assert.ok(bankTrap.traps.some(t => t.code === 'VETO_BANK_HIGH_NPL'));
assert.ok(bankTrap.traps.some(t => t.code === 'VETO_BANK_NEGATIVE_DISTRIBUTABLE'));
console.log('✅ Test 6.2 Passed: Bank with 4.8% NPL and negative distributable EPS vetoed.');

// 6.3 Hydropower with Capex > Rs. 22 Cr/MW or Incomplete COD
const hydroTrap = evaluateSectorFundamentalAndLockinTraps({
  symbol: 'TESTHYDRO',
  sector: 'Hydro Power',
  fundamentals: { codCompleted: false, costPerMW: 24.5, bookValue: 95 }
});
assert.strictEqual(hydroTrap.passed, false);
assert.ok(hydroTrap.traps.some(t => t.code === 'VETO_HYDRO_COD_INCOMPLETE'));
assert.ok(hydroTrap.traps.some(t => t.code === 'VETO_HYDRO_EXCESSIVE_CAPEX'));
assert.ok(hydroTrap.traps.some(t => t.code === 'VETO_HYDRO_SUB_PAR_BOOK_VALUE'));
console.log('✅ Test 6.3 Passed: Hydro with delayed COD, Rs. 24.5 Cr/MW Capex, and sub-par BV vetoed.\n');

// ── TEST 7: DUAL-MODE TELEGRAM TICKET WITH DYNAMIC CAPITAL ──────────────────
console.log('Test 7: Validating Dual-Mode Telegram Ticket (Personal + Broadcast Multiplier)...');

const alertRes = evaluateInstitutionalAlert({
  symbol: 'GHL',
  ltp: 271.5,
  high: 272,
  low: 268,
  open: 269,
  volume: 20000,
  turnover: 5430000,
  avgVolume20D: 50000,
  medianDailyTurnover20D: 8200000,
  bcr3BuyPct: 52.4,
  totalBuyTrades: 45,
  totalSellTrades: 125,
  totalBuyQty: 65000,
  totalSellQty: 48000,
  rolling5DBrokerData: { grossBuy5D: 280000, netBuy5D: 235000 },
  sector: 'Hydro Power',
  sectorRank10D: 2,
  stock10DReturn: 6.8,
  sector10DReturn: 3.5,
  nearestSupport: 261,
  target1: 330,
  target2: 355,
  userCapital: 500000, // Custom Rs. 5 Lakhs Portfolio
  bypassTimingGate: true
});

assert.strictEqual(alertRes.isQualified, true);
assert.strictEqual(alertRes.sizing.userCapital, 500000);
assert.strictEqual(alertRes.sizing.tier, 2);
assert.ok(alertRes.ticketPayload.html.includes('FOR YOUR RS. 500,000 PORTFOLIO'));
assert.ok(alertRes.ticketPayload.html.includes('UNIVERSAL SUBSCRIBER MULTIPLIER (PER RS. 1 LAKH CAPITAL)'));
console.log('Dual-Mode Ticket Preview:');
console.log('───────────────────────────────────────────────────────────────────');
console.log(alertRes.ticketPayload.text);
console.log('───────────────────────────────────────────────────────────────────\n');
console.log('✅ Test 7 Passed: Dual-Mode ticket successfully formats personal and universal sizing.\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎉 ALL DYNAMIC CAPITAL ENGINE TESTS PASSED (7/7)!');
console.log('═══════════════════════════════════════════════════════════════════\n');
