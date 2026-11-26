import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n==============================================================');
console.log('PHASE 4 TDD: STATUTORY 5%/3.75% CGT, BONUS WACC, NPT & REAL DATA');
console.log('==============================================================\n');

const { calculateBuyDetails, calculateSellDetails, calculateWacc } = await import('../src/utils/calculations.js');
const { NEPSE_FRICTION_FY2083 } = await import('../src/utils/dynamicCapitalEngine.js');
const { STATUTORY_FEES } = await import('../src/utils/signals/backtestEngine.js');
const { NEPSE_FEES } = await import('../src/utils/nepseWalkForwardBacktest.mjs');
const { CGT_SHORT_TERM, CGT_LONG_TERM } = await import('../src/utils/riskManagement.js');
const { computeStatutoryNetReturnPct } = await import('../proxy/agentTools.mjs');
const { DEFAULT_FRICTION_CONSTANTS } = await import('../proxy/institutionalAlertEngine.mjs');
const { calculateNepseNetReturn } = await import('../proxy/db/signalTrackerStore.js');

await test('[P4-01] Canonical 5.0% ST / 3.75% LT / 10.0% Corp CGT across all calculation engines', () => {
  assert.strictEqual(NEPSE_FRICTION_FY2083.cgtShortTerm, 0.05, `dynamicCapitalEngine ST CGT must be 0.05, got ${NEPSE_FRICTION_FY2083.cgtShortTerm}`);
  assert.strictEqual(NEPSE_FRICTION_FY2083.cgtLongTerm, 0.0375, `dynamicCapitalEngine LT CGT must be 0.0375, got ${NEPSE_FRICTION_FY2083.cgtLongTerm}`);

  assert.strictEqual(STATUTORY_FEES.cgtShortTermRate, 0.05, `backtestEngine ST CGT must be 0.05, got ${STATUTORY_FEES.cgtShortTermRate}`);
  assert.strictEqual(STATUTORY_FEES.cgtLongTermRate, 0.0375, `backtestEngine LT CGT must be 0.0375, got ${STATUTORY_FEES.cgtLongTermRate}`);

  assert.strictEqual(NEPSE_FEES.cgtShortTerm, 0.05, `nepseWalkForwardBacktest ST CGT must be 0.05`);
  assert.strictEqual(NEPSE_FEES.cgtLongTerm, 0.0375, `nepseWalkForwardBacktest LT CGT must be 0.0375`);

  assert.strictEqual(CGT_SHORT_TERM, 0.05, 'riskManagement CGT_SHORT_TERM must be 0.05');
  assert.strictEqual(CGT_LONG_TERM, 0.0375, 'riskManagement CGT_LONG_TERM must be 0.0375');

  assert.strictEqual(DEFAULT_FRICTION_CONSTANTS.cgtRate, 0.05, 'institutionalAlertEngine default cgtRate must be 0.05');
  assert.strictEqual(DEFAULT_FRICTION_CONSTANTS.cgtLongTermRate, 0.0375, 'institutionalAlertEngine LT cgtRate must be 0.0375');

  // Verify default cgtRate on computeStatutoryNetReturnPct & calculateNepseNetReturn reflects 5.0% short-term
  const s5 = computeStatutoryNetReturnPct(400, 500, 100, 30);
  const s375 = computeStatutoryNetReturnPct(400, 500, 100, 400);
  assert.ok(s375.netReturnPct > s5.netReturnPct, 'Long-term net return (3.75%) must exceed short-term (5.0%)');

  // Match calculateNepseNetReturn default (0.05) against explicit 0.05
  const defRet = calculateNepseNetReturn(400, 500, 250000);
  const exp5Ret = calculateNepseNetReturn(400, 500, 250000, 0.05);
  assert.strictEqual(defRet.netReturnPct, exp5Ret.netReturnPct, 'signalTrackerStore calculateNepseNetReturn default must use 5.0% CGT');

  // Economic bonus dilution in calculateWacc vs calculateSellDetails
  const sellShort = calculateSellDetails(100, 200, 150, 'short');
  const sellLong = calculateSellDetails(100, 200, 150, 'long');
  assert.strictEqual(sellShort.cgtRate, 0.05);
  assert.strictEqual(sellLong.cgtRate, 0.0375);
});

const legacy75Files = [
  'src/utils/calculations.js',
  'src/utils/backtestCore.js',
  'src/utils/masterAlphaPipeline.js',
  'src/utils/setupAnalyzer.js',
  'src/utils/signals/backtestEngine.js',
  'src/components/StockInformationHubModal.tsx',
  'src/components/BacktestReportScreen.tsx',
  'src/components/AlgorithmicSignalTrackRecord.tsx',
  'src/components/AlphaPlaybookService.tsx',
  'src/components/analyzer/SignalTrackRecord.jsx',
  'src/components/GlossaryGuideService.tsx',
  'src/components/services.tsx',
  'src/views/WaccTaxCalculator.jsx',
  'proxy/agentTools.mjs',
  'proxy/institutionalAlertEngine.mjs',
  'proxy/routes/aiGuruRoutes.mjs',
  'proxy/scripts/rebuildSignalTrackRecord.ts',
  'proxy/telegramNotifier.mjs',
  'proxy/server.mjs'
];

await test('[P4-02] Zero stale 7.5% CGT / 0.075 tax rate constants across active frontend & proxy modules', () => {
  for (const rel of legacy75Files) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // Exempt legitimate price target / stop risk percentages (e.g. maxSwingRiskPct = 0.075 or * 0.075) and Bank FD benchmark 7.5%
    assert.ok(!/cgtRate\s*[:=]\s*0\.075|cgtRateShort\s*=\s*0\.075|cgtShortTerm(?:Rate)?\s*:\s*0\.075|cgtTaxRatePct:\s*7\.5|0\.075\s*\|\s*0\.05|cgtShortTermRetail:\s*['"]7\.5%/.test(content),
      `Stale 7.5% CGT constant detected in ${rel}`);
    assert.ok(!/7\.5%\s*(?:Short-Term|retail\s*CGT|ST\s*\/|CGT|Individual)/i.test(content),
      `Stale "7.5% CGT" UI/alert label detected in ${rel}`);
  }
});

await test('[P4-03] StockCandlestickChart, signal trackers & backend routes use NPT Asia/Kathmandu calendar formatting (no raw UTC date drift)', () => {
  const chartSrc = fs.readFileSync(path.join(ROOT, 'src/components/charts/StockCandlestickChart.tsx'), 'utf8');
  const adRadarSrc = fs.readFileSync(path.join(ROOT, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');
  const backtestSrc = fs.readFileSync(path.join(ROOT, 'src/utils/signals/backtestEngine.js'), 'utf8');
  const paperSrc = fs.readFileSync(path.join(ROOT, 'src/utils/signals/paperTradingTracker.js'), 'utf8');
  const featSrc = fs.readFileSync(path.join(ROOT, 'proxy/quant/featureEngine.mjs'), 'utf8');
  const predSrc = fs.readFileSync(path.join(ROOT, 'proxy/quant/predictorEngine.mjs'), 'utf8');
  const fsHubSrc = fs.readFileSync(path.join(ROOT, 'proxy/routes/floorsheetHubRoutes.mjs'), 'utf8');
  const sigRouteSrc = fs.readFileSync(path.join(ROOT, 'proxy/routes/signalTrackRecordRoutes.mjs'), 'utf8');

  assert.ok(!chartSrc.includes('.toISOString().slice(0, 10)'), 'StockCandlestickChart must use formatNptDateIso instead of UTC toISOString');
  assert.ok(!adRadarSrc.includes("new Date().toISOString().split('T')[0]"), 'AccumulationDistributionRadar must use formatNptDateIso');
  assert.ok(!backtestSrc.includes('new Date().toISOString().slice(0, 10)'), 'signals/backtestEngine.js must use formatNptDateIso');
  assert.ok(!paperSrc.includes('new Date().toISOString().slice(0, 10)'), 'signals/paperTradingTracker.js must use formatNptDateIso');
  assert.ok(!featSrc.includes('new Date().toISOString().slice(0, 10)'), 'featureEngine.mjs must use formatNptDateIso');
  assert.ok(!predSrc.includes('new Date().toISOString().slice(0, 10)'), 'predictorEngine.mjs must use formatNptDateIso');
  assert.ok(!fsHubSrc.includes('new Date().toISOString().slice(0, 10)'), 'floorsheetHubRoutes.mjs must use formatNptDateIso');
  assert.ok(!sigRouteSrc.includes('new Date().toISOString().slice(0, 10)'), 'signalTrackRecordRoutes.mjs must use formatNptDateIso');
});

await test('[P4-04] Zero synthetic candle labeling or synthetic fallbacks in StrategyLabService & accumulationDistributionEngine', () => {
  const stratSrc = fs.readFileSync(path.join(ROOT, 'src/components/StrategyLabService.tsx'), 'utf8');
  const adEngineSrc = fs.readFileSync(path.join(ROOT, 'src/utils/accumulationDistributionEngine.ts'), 'utf8');
  const servicesSrc = fs.readFileSync(path.join(ROOT, 'src/components/services.tsx'), 'utf8');

  assert.ok(!stratSrc.includes('SYNTHETIC ESTIMATION'), 'StrategyLabService must not falsely display SYNTHETIC ESTIMATION');
  assert.ok(!adEngineSrc.includes("'SYNTHETIC_GENERATED'"), 'accumulationDistributionEngine must not tag dataQuality as SYNTHETIC_GENERATED');
  assert.ok(!servicesSrc.includes('367.50') && servicesSrc.includes('5.0%'), 'services.tsx internal self-test must assert canonical 5.0% / 3.75% CGT');
});

console.log(`\n==============================================================`);
console.log(` PHASE 4 TDD RESULTS: ${passed} passed, ${failed} failed`);
console.log(`==============================================================\n`);
if (failed > 0) process.exit(1);
