// tests/testSmartAlertPipeline.mjs
import assert from 'assert';
import { 
  evaluateStockAlertConditions, 
  processStockTickEvaluation, 
  testTriggerAlert,
  getActiveSmartAlerts,
  getSmartAlertSystemStatus,
  resetSymbolAlertState
} from '../proxy/smartAlertEngine.mjs';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🧪 DRAVYASHREE SMART INSTITUTIONAL ALERT PIPELINE TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════\n');

// ── Test 1: Ideal 3-Condition Met Institutional Base ─────────────────────────
console.log('Test 1: Validating Ideal Institutional Base (All 3 Criteria Met)...');

const mockFloorsheet = [
  // Broker 58 (Naasa) absorbing heavy float
  { contractId: 1, buyerBroker: '58', sellerBroker: '14', qty: 15000, rate: 270, amount: 4050000 },
  // Broker 45 (Imperial) absorbing heavy float
  { contractId: 2, buyerBroker: '45', sellerBroker: '28', qty: 12000, rate: 270.5, amount: 3246000 },
  // Broker 34 (Vision) absorbing
  { contractId: 3, buyerBroker: '34', sellerBroker: '49', qty: 8000, rate: 269.5, amount: 2156000 },
  // Other small retail buys
  { contractId: 4, buyerBroker: '10', sellerBroker: '5', qty: 5000, rate: 270, amount: 1350000 },
  { contractId: 5, buyerBroker: '17', sellerBroker: '8', qty: 4000, rate: 271, amount: 1084000 },
  // Purged wash trade (Buyer == Seller: Broker 58 to Broker 58)
  { contractId: 6, buyerBroker: '58', sellerBroker: '58', qty: 10000, rate: 270, amount: 2700000 }
];

const res1 = evaluateStockAlertConditions({
  symbol: 'GHL',
  ltp: 271.0, // within VWAP + 2%
  high: 272,
  low: 268,
  volume: 44000,
  turnover: 11886000,
  floorsheetTrades: mockFloorsheet,
  avgVolume20D: 90000, // sellers dry compared to 90k daily avg
  priceHistory: Array(25).fill({ close: 270, volume: 90000, high: 275, low: 265 })
});

console.log('Evaluation Result 1:');
console.log(`• Symbol: ${res1.symbol} | LTP: ${res1.ltp} | VWAP: ${res1.vwap}`);
console.log(`• Condition 1 (Price in Base): ${res1.conditions.condition1_priceInBase} (${res1.buyZone.statusText})`);
console.log(`• Condition 2 (Buyer Concentration > 50%): ${res1.conditions.condition2_buyerConcentration} (${res1.buyerConcentration.concentrationPct}% BCR3 - ${res1.buyerConcentration.dominantBrokersText})`);
console.log(`• Condition 3 (Seller Volume Dry): ${res1.conditions.condition3_sellerVolumeDry} (${res1.sellerPressure.statusText})`);
console.log(`• All 3 Met: ${res1.conditions.allMet}`);
console.log(`• Targets: T1 = NPR ${res1.levels.target1}, T2 = NPR ${res1.levels.target2}, SL = NPR ${res1.levels.stopLoss} (R:R ${res1.levels.riskRewardRatio}:1)\n`);

assert.strictEqual(res1.conditions.allMet, true, 'All 3 conditions should be simultaneously TRUE');
assert.strictEqual(res1.conditions.condition1_priceInBase, true, 'Condition 1 must be true');
assert.strictEqual(res1.conditions.condition2_buyerConcentration, true, 'Condition 2 must be true');
assert.strictEqual(res1.conditions.condition3_sellerVolumeDry, true, 'Condition 3 must be true');
console.log('✅ Test 1 Passed: Ideal Institutional Base validated.\n');

// ── Test 2: Condition 1 Failure (Price Chased > 2% Above VWAP) ───────────────
console.log('Test 2: Validating Failure when Price is Chased (> 2.0% Above VWAP)...');

const res2 = evaluateStockAlertConditions({
  symbol: 'GHL',
  ltp: 285.0, // Chased +5.5% above VWAP ~270
  high: 286,
  low: 268,
  volume: 44000,
  turnover: 11886000,
  floorsheetTrades: mockFloorsheet,
  avgVolume20D: 90000,
  priceHistory: Array(25).fill({ close: 270, volume: 90000, high: 275, low: 265 })
});

assert.strictEqual(res2.conditions.condition1_priceInBase, false, 'Condition 1 should FAIL when price is chased past 2%');
assert.strictEqual(res2.conditions.allMet, false, 'Overall alert must NOT trigger if Condition 1 fails');
console.log(`✅ Test 2 Passed: Overextended price rejected (${res2.ltp} vs VWAP ${res2.vwap}).\n`);

// ── Test 3: Condition 2 Failure (Dispersed Buying, BCR3 < 50%) ────────────────
console.log('Test 3: Validating Failure when Buyer Concentration is Low (BCR3 < 50%)...');

const dispersedFloorsheet = [
  { contractId: 1, buyerBroker: '1', sellerBroker: '2', qty: 2000, rate: 270, amount: 540000 },
  { contractId: 2, buyerBroker: '3', sellerBroker: '4', qty: 2000, rate: 270, amount: 540000 },
  { contractId: 3, buyerBroker: '5', sellerBroker: '6', qty: 2000, rate: 270, amount: 540000 },
  { contractId: 4, buyerBroker: '7', sellerBroker: '8', qty: 2000, rate: 270, amount: 540000 },
  { contractId: 5, buyerBroker: '9', sellerBroker: '10', qty: 2000, rate: 270, amount: 540000 },
  { contractId: 6, buyerBroker: '11', sellerBroker: '12', qty: 2000, rate: 270, amount: 540000 },
  { contractId: 7, buyerBroker: '13', sellerBroker: '14', qty: 2000, rate: 270, amount: 540000 },
  { contractId: 8, buyerBroker: '15', sellerBroker: '16', qty: 2000, rate: 270, amount: 540000 }
];

const res3 = evaluateStockAlertConditions({
  symbol: 'NABIL',
  ltp: 270.0,
  high: 271,
  low: 269,
  volume: 16000,
  turnover: 4320000,
  floorsheetTrades: dispersedFloorsheet,
  avgVolume20D: 90000,
  priceHistory: Array(25).fill({ close: 270, volume: 90000, high: 275, low: 265 })
});

assert.strictEqual(res3.conditions.condition2_buyerConcentration, false, 'Condition 2 should FAIL on dispersed retail buying');
assert.strictEqual(res3.conditions.allMet, false, 'Overall alert must NOT trigger if BCR3 < 50%');
console.log(`✅ Test 3 Passed: Dispersed retail buying rejected (BCR3 = ${res3.buyerConcentration.concentrationPct}%).\n`);

// ── Test 4: State Machine Lifecycle (IDLE -> PENDING -> TRIGGERED -> COOLDOWN) 
console.log('Test 4: Validating State Machine Transitions & Cooldown Enforcer...');
resetSymbolAlertState('GHL');

// 4a. PENDING transition (2 of 3 met)
const evalPending = {
  ...res2, // Condition 1 failed, but 2 and 3 met
  conditions: {
    ...res2.conditions,
    conditionsMetCount: 2,
    allMet: false
  }
};
const pendingRes = await processStockTickEvaluation(evalPending);
console.log(`• State with 2/3 criteria met: ${pendingRes.state}`);
assert.strictEqual(pendingRes.state, 'PENDING', 'State should be PENDING');
assert.strictEqual(pendingRes.triggered, false, 'Should NOT trigger push yet');

// 4b. TRIGGERED transition (all 3 met)
const triggerRes = await processStockTickEvaluation(res1);
console.log(`• State with 3/3 criteria met: ${triggerRes.state}`);
assert.strictEqual(triggerRes.triggered, true, 'Should trigger push alert');
assert.strictEqual(triggerRes.alert.symbol, 'GHL', 'Triggered symbol must match');

// 4c. COOLDOWN protection (second tick immediately after)
const duplicateRes = await processStockTickEvaluation(res1);
console.log(`• Repeated evaluation in same session: State = ${duplicateRes.state} | Triggered = ${duplicateRes.triggered}`);
assert.strictEqual(duplicateRes.state, 'COOLDOWN', 'Must be in COOLDOWN');
assert.strictEqual(duplicateRes.triggered, false, 'Must suppress duplicate notification spam in COOLDOWN');
console.log('✅ Test 4 Passed: State machine transitions and anti-spam cooldown verified.\n');

// ── Test 5: testTriggerAlert helper verification ──────────────────────────────
console.log('Test 5: Testing testTriggerAlert helper for GHL...');
const testResult = await testTriggerAlert('GHL', { ltp: 269.50, vwap: 270.00 });
assert.strictEqual(testResult.triggered, true);
assert.strictEqual(testResult.alert.symbol, 'GHL');
assert.strictEqual(testResult.alert.target1, 310);
assert.strictEqual(testResult.alert.stopLoss, 258);
console.log('✅ Test 5 Passed: testTriggerAlert produces authentic alert payload.\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎉 ALL SMART INSTITUTIONAL ALERT TESTS PASSED SUCCESSFULLY (5/5)!');
console.log('═══════════════════════════════════════════════════════════════════');
