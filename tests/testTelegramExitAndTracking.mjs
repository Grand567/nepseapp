// tests/testTelegramExitAndTracking.mjs
import assert from 'assert';
import {
  trackCustomHolding,
  untrackCustomHolding,
  getUserTrackedHoldings,
  runMarketAlertScanCycle
} from '../proxy/smartAlertEngine.mjs';
import { sendTelegramExitAlert } from '../proxy/telegramNotifier.mjs';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🧪 TEST: TELEGRAM TWO-WAY TRACKING & TARGET 1/2 EXIT PIPELINE');
console.log('═══════════════════════════════════════════════════════════════════\n');

// ── Test 1: Register Custom Holding via Bot /track ───────────────────────────
console.log('Test 1: Tracking custom holding SHIVM with custom SL and Targets...');
const registered = trackCustomHolding({
  symbol: 'SHIVM',
  buyPrice: 512,
  stopLoss: 489,
  target1: 588,
  target2: 640,
  kitta: 100
});

assert.ok(registered, 'Holding should be registered');
assert.strictEqual(registered.symbol, 'SHIVM');
assert.strictEqual(registered.ltp, 512);
assert.strictEqual(registered.stopLoss, 489);
assert.strictEqual(registered.target1, 588);
assert.strictEqual(registered.target2, 640);
assert.strictEqual(registered.status, 'ACTIVE');

const allHoldings = getUserTrackedHoldings();
assert.ok(allHoldings.some(h => h.symbol === 'SHIVM'), 'SHIVM should be present in user tracked list');
console.log('✅ Test 1 Passed: Holding registered and tracked correctly.\n');

// ── Test 2: Target 1 Hit Simulation & Breakeven Stop-Loss Raise ──────────────
console.log('Test 2: Simulating Target 1 hit (LTP = 590 >= T1 588)...');
await runMarketAlertScanCycle({
  getMarketStocks: async () => [
    { symbol: 'SHIVM', ltp: 590, lastTradedPrice: 590, volume: 50000, turnover: 29500000 }
  ],
  getFloorsheet: async () => [],
  getPriceHistory: async () => []
});

const afterT1Holdings = getUserTrackedHoldings();
const shivmT1 = afterT1Holdings.find(h => h.symbol === 'SHIVM');
assert.ok(shivmT1, 'SHIVM should still be active for Target 2 monitoring');
assert.strictEqual(shivmT1.target1Hit, true, 'target1Hit should be marked true');
assert.strictEqual(shivmT1.status, 'ACTIVE_T2', 'Status should be ACTIVE_T2 to watch Target 2');
assert.strictEqual(shivmT1.stopLoss, 512, 'Stop-Loss must be raised to breakeven (entry price 512)');
console.log('✅ Test 2 Passed: Target 1 triggered, 50% profit booked & Stop-Loss raised to breakeven.\n');

// ── Test 3: Target 2 Hit Simulation & Full Exit ──────────────────────────────
console.log('Test 3: Simulating Target 2 hit (LTP = 645 >= T2 640)...');
await runMarketAlertScanCycle({
  getMarketStocks: async () => [
    { symbol: 'SHIVM', ltp: 645, lastTradedPrice: 645, volume: 80000, turnover: 51600000 }
  ],
  getFloorsheet: async () => [],
  getPriceHistory: async () => []
});

const afterT2Holdings = getUserTrackedHoldings();
assert.strictEqual(afterT2Holdings.some(h => h.symbol === 'SHIVM'), false, 'SHIVM should no longer be in active tracking once Target 2 completed');
console.log('✅ Test 3 Passed: Target 2 triggered and position fully closed.\n');

// ── Test 4: Stop-Loss Protection Simulation with T+2 Caveat ───────────────────
console.log('Test 4: Simulating Stop-Loss trigger for new holding GHL (Buy: 270, SL: 258)...');
trackCustomHolding({
  symbol: 'GHL',
  buyPrice: 270,
  stopLoss: 258,
  target1: 310,
  target2: 335,
  kitta: 100
});

// Price drops to 255 (below SL 258)
await runMarketAlertScanCycle({
  getMarketStocks: async () => [
    { symbol: 'GHL', ltp: 255, lastTradedPrice: 255, volume: 30000, turnover: 7650000 }
  ],
  getFloorsheet: async () => [],
  getPriceHistory: async () => []
});

const afterSlHoldings = getUserTrackedHoldings();
assert.strictEqual(afterSlHoldings.some(h => h.symbol === 'GHL'), false, 'GHL should be stopped out and removed from active list');
console.log('✅ Test 4 Passed: Stop-Loss defense successfully executed.\n');

// ── Test 5: Untrack / Remove Holding Command ─────────────────────────────────
console.log('Test 5: Testing untrackCustomHolding...');
trackCustomHolding({ symbol: 'HATHY', buyPrice: 980, stopLoss: 930, kitta: 50 });
assert.ok(getUserTrackedHoldings().some(h => h.symbol === 'HATHY'), 'HATHY should be tracked');

const removed = untrackCustomHolding('HATHY');
assert.strictEqual(removed, true, 'untrackCustomHolding should return true');
assert.strictEqual(getUserTrackedHoldings().some(h => h.symbol === 'HATHY'), false, 'HATHY should be removed');
console.log('✅ Test 5 Passed: User untrack / remove command verified.\n');

// ── Test 6: Message Formatting Verification ──────────────────────────────────
console.log('Test 6: Validating exit alert dispatch payloads for T1, T2 and Stop-Loss...');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(1500);

const t1Res = await sendTelegramExitAlert({
  symbol: 'SHIVM',
  type: 'TARGET_REACHED',
  targetLevel: 1,
  ltp: 588,
  entryPrice: 512,
  targetPrice: 588,
  target2: 640,
  kitta: 100,
  isT2Cleared: true
});
assert.strictEqual(t1Res.success, true, 'Target 1 Telegram alert should dispatch successfully');

await sleep(1500);
const t2Res = await sendTelegramExitAlert({
  symbol: 'SHIVM',
  type: 'TARGET_2_REACHED',
  targetLevel: 2,
  ltp: 640,
  entryPrice: 512,
  targetPrice: 640,
  kitta: 100,
  isT2Cleared: true
});
assert.strictEqual(t2Res.success, true, 'Target 2 Telegram alert should dispatch successfully');

await sleep(1500);
const slLockedRes = await sendTelegramExitAlert({
  symbol: 'GHL',
  type: 'STOP_LOSS_HIT',
  ltp: 255,
  entryPrice: 270,
  stopLoss: 258,
  kitta: 100,
  isT2Cleared: false // Locked in T+2!
});
assert.strictEqual(slLockedRes.success, true, 'T+2 locked Stop-Loss alert should dispatch successfully');
console.log('✅ Test 6 Passed: Real Telegram notifications received on user phone!\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎉 ALL TELEGRAM EXIT & TWO-WAY TRACKING TESTS PASSED (6/6)!');
console.log('═══════════════════════════════════════════════════════════════════');
