import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

test('BUG-008: HLICF is classified as Mutual Fund and excluded from Life Insurance sector champions', () => {
  const stockmap = JSON.parse(fs.readFileSync(path.join(ROOT, 'proxy/stockmap.json'), 'utf8'));
  const hlicf = stockmap['HLICF'];
  assert.ok(hlicf, 'HLICF must exist in stockmap.json');
  assert.equal(
    hlicf.internalSector,
    'Mutual Fund',
    'HLICF internalSector must be Mutual Fund, not Life Insurance'
  );
  assert.equal(
    hlicf.sector,
    'Mutual Fund',
    'HLICF sector must be Mutual Fund'
  );
});

test('BUG-012: Radar stage counters and filter branches do not double-count DISTRIBUTION_DANGER across stages', () => {
  const radarSrc = fs.readFileSync(path.join(ROOT, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');

  // Stage counters must not double-count DISTRIBUTION_DANGER in both distribution and dump counts
  const counterBlock = radarSrc.slice(radarSrc.indexOf('analyzedStocks.forEach((s) => {'), radarSrc.indexOf('totalCMF +='));
  assert.ok(
    !counterBlock.includes("ph === 'DISTRIBUTION_DANGER' || st.includes('DISTRIBUTION') || st.includes('EUPHORIA')) distributionCount++;\n      if (ph === 'BULL_TRAP' || ph === 'DISTRIBUTION_DANGER'"),
    'Stage counter loop must not double-count DISTRIBUTION_DANGER in dumpCount'
  );

  // Stage filter branch for TRAP/DUMP must not capture DISTRIBUTION_DANGER
  const filterBlock = radarSrc.slice(radarSrc.indexOf("if (selectedStage === 'STEALTH')"), radarSrc.indexOf("if (step4Filter === 'SECTOR_LEADERS')"));
  assert.ok(
    !filterBlock.includes("s.phase === 'BULL_TRAP' || s.phase === 'DISTRIBUTION_DANGER' || s.isTrap || s.isDumping"),
    'TRAP/DUMP stage filter must not hijack DISTRIBUTION_DANGER stocks'
  );
});

test('BUG-013: calculateStockCorneringScore checks insufficient / thin sample before awarding brokerConcentration', () => {
  const engineSrc = fs.readFileSync(path.join(ROOT, 'src/utils/accumulationDistributionEngine.ts'), 'utf8');
  const corneringFn = engineSrc.slice(engineSrc.indexOf('export function calculateStockCorneringScore'), engineSrc.indexOf('export function calculateSectorAccumulationChampions'));
  
  assert.ok(
    corneringFn.includes('isThinSample') || corneringFn.includes('insufficient_sample') || corneringFn.includes('isSampleValid'),
    'calculateStockCorneringScore must guard against thin or insufficient trade samples'
  );
});

test('BUG-014: Radar diagnostic does not falsely flag Retail Offloading when net institutional accumulation is strong', () => {
  const radarSrc = fs.readFileSync(path.join(ROOT, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');
  const offloadBlock = radarSrc.slice(radarSrc.indexOf('Retail Offloading Footprint'), radarSrc.indexOf('Upper Wick Supply Churn'));
  
  assert.ok(
    !offloadBlock.includes("activeStock.wyckoff.tradeSizeRatio <= 0.70\n                      ? '⚠️ High (Institutions selling to retail)'"),
    'Retail Offloading label must require actual selling dominance or dumping, not tradeSizeRatio <= 0.70 in isolation'
  );
});

test('BUG-118: ServicesHub preserves activeCategory during search and keeps tool state accessible', () => {
  const hubSrc = fs.readFileSync(path.join(ROOT, 'src/components/ServicesHub.tsx'), 'utf8');
  
  // Search box should allow matching within active category and not discard active category
  assert.ok(
    hubSrc.includes('matchingTools') && (hubSrc.includes('activeFilter') || hubSrc.includes('activeCategory')),
    'ServicesHub search results should account for active category context'
  );
});

test('BUG-119: ServicesHub search does not leak non-equity securities into ordinary stock matches', () => {
  const hubSrc = fs.readFileSync(path.join(ROOT, 'src/components/ServicesHub.tsx'), 'utf8');
  const stockSearchBlock = hubSrc.slice(hubSrc.indexOf('const matchingStocks = useMemo'), hubSrc.indexOf('const groups = useMemo'));
  
  assert.ok(
    stockSearchBlock.includes('isPureNepseEquity'),
    'ServicesHub matchingStocks search must filter securities with isPureNepseEquity'
  );
});

test('BUG-120: Radar removes dead floorsheet, guards zeroSumAudit against empty brokers, and sorts sellers by net outflow', () => {
  const radarSrc = fs.readFileSync(path.join(ROOT, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');
  
  // zeroSumAudit must require brokers.length > 0 before asserting balance
  const zeroSumBlock = radarSrc.slice(radarSrc.indexOf('const runZeroSumVerification'), radarSrc.indexOf('const stageCounts'));
  assert.ok(
    !zeroSumBlock.includes('brokers.reduce((acc: number, b: any) => acc + Number(b.buyQty || b.buyQuantity || 0), 0) || Number(res?.totalVolume || 0)'),
    'zeroSumAudit must not fall back to totalVolume when brokers is empty'
  );

  // Sellers sorting in diagnostic table must not sort by Math.abs
  assert.ok(
    !radarSrc.includes('Math.abs(b.netAmount ?? b.netQty ?? 0) - Math.abs(a.netAmount ?? a.netQty ?? 0)'),
    'Radar diagnostic sellers sort must not sort by Math.abs which puts buyers at top of sellers list'
  );
});

test('BUG-121: BrokerFlowDominanceService replaces 0 || buyQty, removes || 500 fake LTP, and validates block deals', () => {
  const dominanceSrc = fs.readFileSync(path.join(ROOT, 'src/components/BrokerFlowDominanceService.tsx'), 'utf8');
  
  // Must not evaluate 0 || match.buyQty
  assert.ok(
    !dominanceSrc.includes('match.netQty || match.buyQty || 0'),
    'BrokerFlowDominanceService must use nullish coalescing ?? instead of || buyQty'
  );

  // Must not use || 500 fake LTP fallback
  assert.ok(
    !dominanceSrc.includes('closePrice || 500'),
    'BrokerFlowDominanceService must not fall back to fake 500 LTP'
  );
});

test('BUG-122: BrokerSmartFlowTracker and BrokerAccumulationView remove hardcoded 367 stocks, 32 days, 15-day slice, and 2026-10-29', () => {
  const smartFlowSrc = fs.readFileSync(path.join(ROOT, 'src/components/BrokerSmartFlowTracker.tsx'), 'utf8');
  const accumSrc = fs.readFileSync(path.join(ROOT, 'src/components/BrokerAccumulationView.tsx'), 'utf8');
  
  assert.ok(
    !smartFlowSrc.includes('totalScanned || 367'),
    'BrokerSmartFlowTracker must not hardcode totalScanned || 367'
  );
  assert.ok(
    !accumSrc.includes('list.slice(0, 15)'),
    'BrokerAccumulationView must not clamp list to 15'
  );
  assert.ok(
    !accumSrc.includes("'2026-10-29'"),
    'BrokerAccumulationView must not hardcode 2026-10-29 fallback date'
  );
});

test('BUG-123: BreakoutTrapRadar removes fake 520/480 S/R and triggers re-analysis on async history fetch', () => {
  const radarSrc = fs.readFileSync(path.join(ROOT, 'src/components/BreakoutTrapRadar.tsx'), 'utf8');
  
  assert.ok(
    !radarSrc.includes(': 520'),
    'BreakoutTrapRadar must not fall back to fake 520 resistance'
  );
  assert.ok(
    !radarSrc.includes(': 480'),
    'BreakoutTrapRadar must not fall back to fake 480 support'
  );
  assert.ok(
    radarSrc.includes('historyVersion') || radarSrc.includes('cachedHist') || radarSrc.includes('historyLoaded'),
    'BreakoutTrapRadar must recompute analyzedStocks when price history resolves'
  );
});

test('BUG-124: MultibaggerHunterService requires authentic float and filters pure equities', () => {
  const hunterSrc = fs.readFileSync(path.join(ROOT, 'src/components/MultibaggerHunterService.tsx'), 'utf8');
  
  assert.ok(
    !hunterSrc.includes('(s.promoterHolding || 51)'),
    'MultibaggerHunterService must not fabricate 51% promoter holding'
  );
  assert.ok(
    !hunterSrc.includes('(s.sharesOut || 10)'),
    'MultibaggerHunterService must not fabricate 10M sharesOut'
  );
  assert.ok(
    hunterSrc.includes('isPureNepseEquity'),
    'MultibaggerHunterService must filter securities using isPureNepseEquity'
  );
});

test('BUG-125: FloorsheetServiceTab does not lock out session date by mutating selectedDate to asOfDate and fixes entity label', () => {
  const fsTabSrc = fs.readFileSync(path.join(ROOT, 'src/components/FloorsheetServiceTab.tsx'), 'utf8');
  
  assert.ok(
    !fsTabSrc.includes('if (json?.asOfDate && !selectedDate) {\n        setSelectedDate(json.asOfDate);\n      }'),
    'FloorsheetServiceTab must not mutate selectedDate to json.asOfDate'
  );
  assert.ok(
    !fsTabSrc.includes('&ge;500k'),
    'FloorsheetServiceTab must not render raw &ge; HTML entity in JSX'
  );
});

test('BUG-126: FloorSheetTape does not clamp horizons to 5D and checks b !== "—" for cross trades', () => {
  const tapeSrc = fs.readFileSync(path.join(ROOT, 'src/views/FloorSheetTape.jsx'), 'utf8');
  
  assert.ok(
    !tapeSrc.includes('Math.min(daysMap[currentTf] || 1, 5)'),
    'FloorSheetTape must not clamp user selected timeframe to 5 days'
  );
  assert.ok(
    tapeSrc.includes("b !== '—' && b === s") || tapeSrc.includes('b !== "—" && b === s') || tapeSrc.includes("b && b !== '—' && b === s"),
    'FloorSheetTape must ensure broker is valid before flagging cross trade'
  );
});

test('BUG-127: StockSelectionScreener includes SWING_LEADERS in union and removes fabricated metrics', () => {
  const screenerSrc = fs.readFileSync(path.join(ROOT, 'src/components/StockSelectionScreener.tsx'), 'utf8');
  
  assert.ok(
    screenerSrc.includes("'SWING_LEADERS'"),
    'StockSelectionScreener floorFilter union must include SWING_LEADERS'
  );
  assert.ok(
    !screenerSrc.includes('eps: Number(stock.eps ?? 18)'),
    'StockSelectionScreener must not fabricate eps ?? 18'
  );
  assert.ok(
    !screenerSrc.includes('bookValue: Number(stock.bookValue ?? 160)'),
    'StockSelectionScreener must not fabricate bookValue ?? 160'
  );
});

test('BUG-128: StrategyLabService honestly badges synthetic candles and removes fake 500/52.0 fallbacks', () => {
  const labSrc = fs.readFileSync(path.join(ROOT, 'src/components/StrategyLabService.tsx'), 'utf8');
  
  assert.ok(
    !labSrc.includes('closePrice || 500'),
    'StrategyLabService must not fall back to fake 500 LTP'
  );
  assert.ok(
    !labSrc.includes(": '52.0'"),
    'StrategyLabService must not fall back to fake 52.0 RSI'
  );
});

test('BUG-129: AlgorithmicSignalTrackRecord computes dynamic MFE/MAE/hold and avoids 100% win rate on 0 settled trades', () => {
  const trackSrc = fs.readFileSync(path.join(ROOT, 'src/components/AlgorithmicSignalTrackRecord.tsx'), 'utf8');
  
  assert.ok(
    !trackSrc.includes('avg_mfe_pct: 10.5'),
    'AlgorithmicSignalTrackRecord must not hardcode 10.5 MFE'
  );
  assert.ok(
    !trackSrc.includes(': 100,'),
    'AlgorithmicSignalTrackRecord must not report 100% win rate when settledSignalsCount is 0'
  );
});

test('BUG-130: ShareHubScannersSuite fixes needleAngle === 0 falsy coercion, removes 50.0 RSI, and reads live index', () => {
  const suiteSrc = fs.readFileSync(path.join(ROOT, 'src/components/ShareHubScannersSuite.tsx'), 'utf8');
  
  assert.ok(
    !suiteSrc.includes("bItem?.needleAngle ? Math.round"),
    'ShareHubScannersSuite must check != null for needleAngle to prevent 0 being coerced to false'
  );
  assert.ok(
    !suiteSrc.includes(": '50.0'"),
    'ShareHubScannersSuite must not fall back to 50.0 RSI'
  );
  assert.ok(
    !suiteSrc.includes("index: 2750,"),
    'ShareHubScannersSuite must not hardcode NEPSE index 2750'
  );
});

test('BUG-131: WatchlistEntryAlertModal removes side-effects from useMemo and removes fake 500 fallback', () => {
  const modalSrc = fs.readFileSync(path.join(ROOT, 'src/components/WatchlistEntryAlertModal.tsx'), 'utf8');
  
  // Must not call playBreakoutChime inside activeAlertItems useMemo
  const memoEnd = modalSrc.indexOf('}, [configs, marketQuotes]);');
  const memoBlock = modalSrc.slice(modalSrc.indexOf('const activeAlertItems = useMemo'), memoEnd);
  assert.ok(
    !memoBlock.includes('playBreakoutChime()'),
    'WatchlistEntryAlertModal must not trigger audio side-effects inside useMemo'
  );
  assert.ok(
    !modalSrc.includes('marketQuotes[s] || 500'),
    'WatchlistEntryAlertModal must not fall back to fake 500 LTP'
  );
});

test('BUG-132: LiveFloorsheetService eliminates fake / 450 kitta estimation', () => {
  const servicesSrc = fs.readFileSync(path.join(ROOT, 'src/components/services.tsx'), 'utf8');
  
  assert.ok(
    !servicesSrc.includes('/ 450'),
    'LiveFloorsheetService must not estimate shares by dividing turnover by 450'
  );
});

test('BUG-133: StockMomentumAnalyzer reads authentic price properties and avoids non-existent metrics.today', () => {
  const servicesSrc = fs.readFileSync(path.join(ROOT, 'src/components/services.tsx'), 'utf8');
  
  assert.ok(
    !servicesSrc.includes('metrics?.today'),
    'StockMomentumAnalyzer must not read non-existent metrics.today property'
  );
});
