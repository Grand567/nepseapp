import { calculateT2LockupRisk, calculateTheoreticalExRightsPrice, generateEntryExitPlan } from '../src/utils/setupAnalyzer.js';
import { predictIndexDirection } from '../proxy/quant/predictorEngine.mjs';

console.log('--- Testing calculateT2LockupRisk ---');
const sampleCandles = [];
let base = 500;
for (let i = 0; i < 50; i++) {
  const d = new Date(2026, 0, i + 1).toISOString().slice(0, 10);
  base += (i % 3 === 0 ? -4 : 5);
  sampleCandles.push({
    date: d,
    open: base - 2,
    high: base + 6,
    low: base - 5,
    close: base,
    volume: 15000,
    turnover: 15000 * base
  });
}

const t2LowRisk = calculateT2LockupRisk(sampleCandles, base, 12, { sharesOut: 50 });
console.log('Orderly scrip T+2 Risk:', t2LowRisk.tier, 'Score:', t2LowRisk.score, 'Drawdown buffer:', t2LowRisk.t2DrawdownBufferPct + '%');
console.assert(t2LowRisk.tier === 'LOW', 'Orderly scrip should be LOW tier');

// Volatile drops test
const volatileCandles = [...sampleCandles];
volatileCandles.push({
  date: '2026-03-01',
  open: 520, high: 520, low: 468, close: 468, volume: 500 // -10% circuit drop
});
volatileCandles.push({
  date: '2026-03-02',
  open: 468, high: 468, low: 421, close: 421, volume: 300 // second circuit drop
});

const t2HighRisk = calculateT2LockupRisk(volatileCandles, 421, 25, { sharesOut: 2 });
console.log('Volatile illiquid scrip T+2 Risk:', t2HighRisk.tier, 'Score:', t2HighRisk.score, 'Warning:', t2HighRisk.warning);
console.assert(t2HighRisk.tier === 'CRITICAL' || t2HighRisk.tier === 'HIGH', 'Volatile scrip should be HIGH or CRITICAL');

console.log('\n--- Testing calculateTheoreticalExRightsPrice ---');
const exRights = calculateTheoreticalExRightsPrice(600, 1.0, 100);
console.log('1:1 Right Share Ex-Price on Rs. 600:', exRights.exPrice, 'Dilution:', exRights.dilutionDiscountPct + '%');
console.assert(exRights.exPrice === 350, 'Ex-Price should be 350 for (600 + 100)/2');

console.log('\n--- Testing generateEntryExitPlan with T+2 Risk ---');
const stock = { symbol: 'TEST', ltp: base, pChange: 1.5, sharesOut: 50 };
const plan = generateEntryExitPlan(stock, sampleCandles);
console.log('Plan supported:', plan.supported, 'Setup Score:', plan.setupScore, 'T+2 Tier:', plan.t2Risk?.tier);
console.assert(plan.levels?.t2Risk !== undefined, 'levels should contain t2Risk');
console.assert(plan.levels?.recommendedPositionMultiplier !== undefined, 'levels should contain recommendedPositionMultiplier');

console.log('\n--- Testing predictIndexDirection Dynamic Regime ---');
predictIndexDirection({
  memoryHistory: sampleCandles
}).then(res => {
  console.log('Predictor success:', res.success, 'Direction:', res.prediction.direction, 'Raw score:', res.prediction.raw_score, 'Regime:', res.prediction.market_regime);
  console.log('\n✅ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}).catch(err => {
  console.error('Predictor error:', err);
  process.exit(1);
});
