import assert from 'assert';
import { validateAlertInvariants, formatUpgradedStealthAccumulationHtml } from '../proxy/telegramNotifier.mjs';

console.log('🧪 Starting Alert Invariant Firewall Tests...');

// Test 1: Clean, valid candidate (NTC)
const validNtc = {
  symbol: 'NTC',
  ltp: 940.3,
  chaseCap: 957.2, // 940.3 * 1.018 = 957.2
  entryLow: 931.3,
  entryHigh: 942.5,
  stopLoss: 907.4,
  target1: 1010.8,
  target2: 1076.6,
  retention10D: 98,
  washChurnPct: 2,
  vdu: 0.63,
  rallyTrack: 'TRACK_B_T2_CLEARED_CONTINUATION',
  isT2ClearedContinuation: true,
};

const ntcHtml = formatUpgradedStealthAccumulationHtml(validNtc);
const ntcCheck = validateAlertInvariants(validNtc, ntcHtml);
assert.strictEqual(ntcCheck.valid, true, `NTC should pass all invariants, but failed: ${ntcCheck.errors.join('; ')}`);
console.log('✅ Test 1 Passed: Valid NTC passes all mathematical & semantic invariants.');

// Test 2: Catch Bad Chase Cap (+4.7% instead of +1.8%)
const badChaseCapCandidate = {
  ...validNtc,
  symbol: 'BAD_CHASE',
  ltp: 374.0,
  chaseCap: 391.7, // Contradiction: 391.7 is +4.73%, expected 380.7
  entryHigh: 382.1,
  stopLoss: 355.3,
  target1: 402.0,
  target2: 430.0,
};
const badChaseCheck = validateAlertInvariants(badChaseCapCandidate, '');
assert.strictEqual(badChaseCheck.valid, false, 'Bad Chase Cap must fail invariant validation');
assert.ok(badChaseCheck.errors.some(e => e.includes('Chase Cap math failure')), 'Must detect Chase Cap math mismatch');
console.log('✅ Test 2 Passed: Invariant firewall successfully caught +4.7% Chase Cap contradiction.');

// Test 3: Catch Churn Contradiction ("No Churn" with 43% wash-churn)
const churnContradictionHtml = `
• Gate 0 Trap Immunity: <b>100% PASSED (No Dump / No Churn)</b>
• Clean Delivery Retention: 57% | Wash-Churn Rate: 43%
`;
const churnCandidate = {
  symbol: 'CHURN_TEST',
  ltp: 374.0,
  chaseCap: 380.7,
  entryLow: 374.0,
  entryHigh: 380.7,
  stopLoss: 355.0,
  target1: 402.0,
  target2: 430.0,
  washChurnPct: 43,
};
const churnCheck = validateAlertInvariants(churnCandidate, churnContradictionHtml);
assert.strictEqual(churnCheck.valid, false, 'Churn contradiction must fail invariant validation');
assert.ok(churnCheck.errors.some(e => e.includes('Wash-Churn is 43%')), 'Must detect Churn contradiction');
console.log('✅ Test 3 Passed: Invariant firewall successfully caught "No Churn" vs 43% wash-churn contradiction.');

// Test 4: Catch VDU Contradiction (claiming <= 0.60x when VDU is 0.66x)
const vduContradictionHtml = `
• Wyckoff Volume Dry-Up (VDU): 0.66x (<= 0.60x 20D SMA Exhaustion)
`;
const vduCandidate = {
  symbol: 'VDU_TEST',
  ltp: 374.0,
  chaseCap: 380.7,
  entryLow: 374.0,
  entryHigh: 380.7,
  stopLoss: 355.0,
  target1: 402.0,
  target2: 430.0,
  washChurnPct: 15,
  vdu: 0.66,
};
const vduCheck = validateAlertInvariants(vduCandidate, vduContradictionHtml);
assert.strictEqual(vduCheck.valid, false, 'VDU contradiction must fail invariant validation');
assert.ok(vduCheck.errors.some(e => e.includes('VDU is 0.66x')), 'Must detect VDU contradiction');
console.log('✅ Test 4 Passed: Invariant firewall successfully caught VDU <= 0.60x lie when VDU was 0.66x.');

// Test 5: Verify the real RFPL alert passes with our fixes
const fixedRfpl = {
  symbol: 'RFPL',
  ltp: 374.0,
  chaseCap: 380.7,
  entryLow: 374.0,
  entryHigh: 380.7,
  stopLoss: 355.3,
  target1: 402.1,
  target2: 430.1,
  retention10D: 57,
  washChurnPct: 43,
  vdu: 0.66,
  rallyTrack: 'STANDARD_ACCUMULATION',
};
const rfplHtml = formatUpgradedStealthAccumulationHtml(fixedRfpl);
const rfplCheck = validateAlertInvariants(fixedRfpl, rfplHtml);
assert.strictEqual(rfplCheck.valid, true, `Fixed RFPL should pass invariants, but got: ${rfplCheck.errors.join('; ')}`);
console.log('✅ Test 5 Passed: Fixed RFPL alert passes all invariant checks with 0 contradictions.');

console.log('\n🎉 ALL 5 ALERT INVARIANT FIREWALL TESTS PASSED PERFECTLY!');
