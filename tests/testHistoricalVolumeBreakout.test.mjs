// tests/testHistoricalVolumeBreakout.test.mjs
process.env.NODE_ENV = 'test';
process.env.SUPPRESS_TEST_ALERTS = 'true';

import assert from 'assert';
import { 
  detectHistoricalVolumeBreakout, 
  processBreakoutAlertTrigger 
} from '../proxy/smartAlertEngine.mjs';

console.log('▶ [SUITE] testHistoricalVolumeBreakout.test.mjs\n');

// Mock 20 daily historical candles:
// High prices fluctuate around 300, with a 20-Day high peak at 320.
// Daily volume averages around 20,000 kitta.
const mockPriceHistory = Array.from({ length: 22 }, (_, i) => ({
  trade_date: `2026-10-${String(i + 1).padStart(2, '0')}`,
  open: 295,
  high: i === 10 ? 320 : 305, // 20-Day resistance peak is 320
  low: 290,
  close: 300,
  volume: 20000 // 20-Day average volume = 20,000 kitta
}));

// Case 1: Legitimate Breakout
// LTP = 325 (clears 320 resistance by +1.5%), Volume = 45,000 kitta (2.25x avg volume)
const case1 = detectHistoricalVolumeBreakout({
  symbol: 'SHIVM',
  ltp: 325,
  high: 328,
  low: 318,
  volume: 45000,
  turnover: 14625000, // Rs. 1.46 Cr
  priceHistory: mockPriceHistory,
  avgVolume20D: 20000,
  floorsheetTrades: [
    { buyer: '58', qty: 25000, rate: 325 },
    { buyer: '45', qty: 10000, rate: 325 },
    { seller: '34', qty: 15000, rate: 325 }
  ]
});

assert.strictEqual(case1.qualified, true, 'Must qualify legitimate high-volume breakout');
assert.strictEqual(case1.resistance20D, 320, '20D resistance must be 320');
assert.ok(case1.rvol >= 1.75, `RVOL must be >= 1.75x (got ${case1.rvol})`);
assert.strictEqual(case1.buyZone.low, 320, 'Buy Zone low must anchor to breakout pivot 320');
assert.ok(case1.stopLoss < 320, `Stop loss must be below resistance (got ${case1.stopLoss})`);
assert.ok(case1.target1 > 325, `Target 1 must be above LTP (got ${case1.target1})`);
console.log('✅ Case 1: Legitimate 20-Day resistance breakout with 2.25x volume surge passed');

// Case 2: Price below 20D resistance (False / No Breakout)
// LTP = 310 (below 320 resistance)
const case2 = detectHistoricalVolumeBreakout({
  symbol: 'SHIVM',
  ltp: 310,
  volume: 50000,
  turnover: 15000000,
  priceHistory: mockPriceHistory
});

assert.strictEqual(case2.qualified, false, 'Must reject when price is below 20D resistance');
console.log('✅ Case 2: Sub-resistance rejection passed');

// Case 3: Low Volume / Retail Fakeout
// LTP = 322 (above 320), but volume is only 3,000 kitta (< 20,000 avg)
const case3 = detectHistoricalVolumeBreakout({
  symbol: 'SHIVM',
  ltp: 322,
  volume: 3000,
  turnover: 966000,
  priceHistory: mockPriceHistory
});

assert.strictEqual(case3.qualified, false, 'Must reject low-volume retail breakout');
console.log('✅ Case 3: Low volume / dry volume breakout rejection passed');

// Case 4: Overextended Late Chase (> 6.5% above resistance)
// LTP = 345 (7.8% above 320 resistance)
const case4 = detectHistoricalVolumeBreakout({
  symbol: 'SHIVM',
  ltp: 345,
  volume: 80000,
  turnover: 27000000,
  priceHistory: mockPriceHistory
});

assert.strictEqual(case4.qualified, false, 'Must reject overextended late chase');
console.log('✅ Case 4: Late chase (>6.5% above pivot) veto passed');

// Case 5: Alert Generation
(async () => {
  const alertRes = await processBreakoutAlertTrigger({ ...case1, forceDispatch: true });
  assert.strictEqual(alertRes.triggered, true, 'Must successfully trigger and record breakout alert');
  assert.strictEqual(alertRes.alert.type, 'BREAKOUT', 'Alert type must be BREAKOUT');
  assert.strictEqual(alertRes.alert.resistance20D, 320, 'Alert must preserve 20D resistance reference');
  console.log('✅ Case 5: Breakout alert dispatch & lifecycle passed');

  console.log('\n🎉 All High-Volume Breakout historical tests passed cleanly!');
})();
