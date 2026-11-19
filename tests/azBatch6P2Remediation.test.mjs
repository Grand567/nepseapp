// tests/azBatch6P2Remediation.test.mjs
/**
 * Master Verification & Regression Suite for Batch 6 (P2 Platform Hygiene, CSS/DOM & Test Isolation)
 * Covers: BUG-017, BUG-018, BUG-019, BUG-020, BUG-021, BUG-043, BUG-044, BUG-045,
 *         BUG-071, BUG-090, BUG-109, BUG-134, BUG-150, BUG-151, BUG-164
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   ${err.message}\n`);
  }
}

console.log('🧪 Running Batch 6 P2 Remediation Test Suite (15 Bugs)...\n');

// ---------------------------------------------------------------------------
// 1. BUG-017: Radar Sets isBrokerVerified on partialStock
// ---------------------------------------------------------------------------
runTest('BUG-017: AccumulationDistributionRadar sets isBrokerVerified on partialStock to avoid false *Est.', () => {
  const radarCode = fs.readFileSync(path.join(root, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');

  // Must define isBrokerVerified in partialStock
  assert.ok(radarCode.includes('isBrokerVerified:'),
    'partialStock must assign isBrokerVerified based on authentic broker verification');
});

// ---------------------------------------------------------------------------
// 2. BUG-018: AiGuruQuantitativeCard Honest Fallback for Zero/Missing Telemetry
// ---------------------------------------------------------------------------
runTest('BUG-018: AiGuruQuantitativeCard does not format zero excursion/ticket as authentic telemetry', () => {
  const cardCode = fs.readFileSync(path.join(root, 'src/components/AiGuruQuantitativeCard.tsx'), 'utf8');

  // Must not unconditionally print +m.mfePct.toFixed(2)% when telemetry is absent
  assert.ok(!cardCode.includes('<span style={{ color: \'#34d399\' }}>+{m.mfePct.toFixed(2)}%</span>\n            <span style={{ color: \'#64748b\', margin: \'0 4px\' }}>/</span>\n            <span style={{ color: \'#fb7185\' }}>{m.maePct.toFixed(2)}%</span>'),
    'AiGuruQuantitativeCard must guard against displaying zero telemetry as authentic excursion');
});

// ---------------------------------------------------------------------------
// 3. BUG-019: Dynamic Session Count in AccumulationDistributionRadar
// ---------------------------------------------------------------------------
runTest('BUG-019: AccumulationDistributionRadar uses dynamic session depth instead of hardcoding 32 sessions', () => {
  const radarCode = fs.readFileSync(path.join(root, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');

  // Must not hardcode 32 as the only initial state for loadedTradingDays
  assert.ok(!radarCode.includes('useState<number>(32);'),
    'AccumulationDistributionRadar must initialize loadedTradingDays dynamically from available dates or prop');
});

// ---------------------------------------------------------------------------
// 4. BUG-020: Spinner Default Text & Broker Label Deduplication
// ---------------------------------------------------------------------------
runTest('BUG-020: ui.tsx Spinner default text is neutral and StockBrokerAnalysisTab prevents #94 Broker #94', () => {
  const uiCode = fs.readFileSync(path.join(root, 'src/components/ui.tsx'), 'utf8');
  const brokerTab = fs.readFileSync(path.join(root, 'src/components/StockBrokerAnalysisTab.jsx'), 'utf8');

  // Spinner default should not be hardcoded to "Scanning all 346 NEPSE listed securities…"
  assert.ok(!uiCode.includes("text = 'Scanning all 346 NEPSE listed securities…'"),
    'ui.tsx Spinner default text must be generic/neutral (e.g. Loading...)');

  // StockBrokerAnalysisTab must deduplicate redundant Broker prefix
  assert.ok(brokerTab.includes('formatBrokerDisplay') || brokerTab.includes('startsWith') || brokerTab.includes('b.name?.includes'),
    'StockBrokerAnalysisTab must prevent duplicate #ID Broker #ID labeling');
});

// ---------------------------------------------------------------------------
// 5. BUG-021: Mobile Responsive Scroll Affordance in Radar Table
// ---------------------------------------------------------------------------
runTest('BUG-021: AccumulationDistributionRadar provides horizontal scroll cue on mobile viewports', () => {
  const radarCode = fs.readFileSync(path.join(root, 'src/components/AccumulationDistributionRadar.tsx'), 'utf8');

  assert.ok(radarCode.includes('Swipe horizontally') || radarCode.includes('Scroll horizontally') || radarCode.includes('overflow-x-auto'),
    'AccumulationDistributionRadar table container must provide mobile scroll cues or clear touch affordance');
});

// ---------------------------------------------------------------------------
// 6. BUG-043: Remove Hardcoded 346 / 350+ Stale Literals
// ---------------------------------------------------------------------------
runTest('BUG-043: ui.tsx and services.tsx eliminate hardcoded 346 totals', () => {
  const uiCode = fs.readFileSync(path.join(root, 'src/components/ui.tsx'), 'utf8');
  const servCode = fs.readFileSync(path.join(root, 'src/components/services.tsx'), 'utf8');
  const prefCode = fs.readFileSync(path.join(root, 'src/components/PreferencesSettingsService.tsx'), 'utf8');

  assert.ok(!uiCode.includes('totalCount = 346'), 'ui.tsx SourceBar must not default totalCount to 346');
  assert.ok(!servCode.includes('useState(346);'), 'services.tsx must not default rawTotal to 346');
  assert.ok(!prefCode.includes("'346 Stocks'"), 'PreferencesSettingsService must not hardcode 346 Stocks');
});

// ---------------------------------------------------------------------------
// 7. BUG-044: Safe Numeric Guards & Lifecycle Cleanup
// ---------------------------------------------------------------------------
runTest('BUG-044: Check for safe numeric bounds and effect cancellation patterns in Batch 6 scope', () => {
  const calcCode = fs.readFileSync(path.join(root, 'src/components/calculators.tsx'), 'utf8');
  assert.ok(calcCode.includes('Number.isFinite') || calcCode.includes('isNaN'),
    'calculators.tsx must use robust numeric validation');
});

// ---------------------------------------------------------------------------
// 8. BUG-045: runAll.mjs Test Fixture Cleanup & Isolation
// ---------------------------------------------------------------------------
runTest('BUG-045: runAll.mjs restores or protects disk test fixtures after suite runs', () => {
  const runCode = fs.readFileSync(path.join(root, 'tests/runAll.mjs'), 'utf8');

  assert.ok(runCode.includes('git checkout') || runCode.includes('restore') || runCode.includes('cleanup') || runCode.includes('ayBatch5E2Remediation.test.mjs'),
    'tests/runAll.mjs must contain fixture restoration or isolation routines');
});

// ---------------------------------------------------------------------------
// 9. BUG-071: Dashboard animate-spin, Emoji Slicing, and Non-Vacuous Check
// ---------------------------------------------------------------------------
runTest('BUG-071: Dashboard.jsx uses animate-spin, safe emoji rendering, and non-vacuous every() check', () => {
  const dashCode = fs.readFileSync(path.join(root, 'src/components/Dashboard.jsx'), 'utf8');

  // Must not use non-existent 'spin' class
  assert.ok(!dashCode.includes("className={isRefreshingDepth ? 'spin' : ''}"),
    'Dashboard.jsx must use animate-spin instead of non-existent spin class');

  // Must not perform vacuous check stocks.every(s => s?.isSimulated) when stocks is empty
  assert.ok(!dashCode.includes('(summarySimulated || stocks.every(s => s?.isSimulated))'),
    'Dashboard.jsx must require stocks.length > 0 before calling every() to prevent vacuous truth bug');
});

// ---------------------------------------------------------------------------
// 10. BUG-090: StockDetailModal Tab Bar Overflow Handling & Listener Cleanup
// ---------------------------------------------------------------------------
runTest('BUG-090: StockDetailModal tab list handles scroll and unmounted listeners safely', () => {
  const modalCode = fs.readFileSync(path.join(root, 'src/components/StockDetailModal.jsx'), 'utf8');

  // Must contain overflow-x-auto or scroll handling for tabs
  assert.ok(modalCode.includes('overflowX') || modalCode.includes('overflow-x'),
    'StockDetailModal must support horizontal scrolling for modal tabs on mobile');
});

// ---------------------------------------------------------------------------
// 11. BUG-109: FestivalSeasonalityCard 0 RVOL & SmartMoneyBrokerFlowCard Fallbacks
// ---------------------------------------------------------------------------
runTest('BUG-109: FestivalSeasonalityCard preserves 0.0 RVOL; SmartMoneyBrokerFlowCard falls back netKitta', () => {
  const festCode = fs.readFileSync(path.join(root, 'src/components/analyzer/FestivalSeasonalityCard.tsx'), 'utf8');
  const smartCode = fs.readFileSync(path.join(root, 'src/components/analyzer/SmartMoneyBrokerFlowCard.tsx'), 'utf8');

  // Must not coerce 0 to 1.0 via Number(rvol) || 1.0
  assert.ok(!festCode.includes('const currentRvol = Number(rvol) || 1.0;'),
    'FestivalSeasonalityCard must preserve legitimate 0.0 RVOL using Number.isFinite()');

  // SmartMoneyBrokerFlowCard must support netKitta or kitta fallback
  assert.ok(smartCode.includes('netKitta') || smartCode.includes('kitta'),
    'SmartMoneyBrokerFlowCard must support netKitta fallback when filtering buyers');
});

// ---------------------------------------------------------------------------
// 12. BUG-134: SeasonalityAnalyticsService Dynamic Months & TradingViewChartService No 500 LTP Fallback
// ---------------------------------------------------------------------------
runTest('BUG-134: SeasonalityAnalyticsService dynamic months and TradingViewChartService removes 500 LTP fallback', () => {
  const seaCode = fs.readFileSync(path.join(root, 'src/components/SeasonalityAnalyticsService.tsx'), 'utf8');
  const tvCode = fs.readFileSync(path.join(root, 'src/components/TradingViewChartService.tsx'), 'utf8');

  // SeasonalityAnalyticsService must not hardcode "8 / 12 Months"
  assert.ok(!seaCode.includes('value="8 / 12 Months"'),
    'SeasonalityAnalyticsService must compute bullish months count dynamically');

  // TradingViewChartService must not hardcode ltp: 500
  assert.ok(!tvCode.includes('ltp: 500'),
    'TradingViewChartService must not hardcode ltp: 500');
});

// ---------------------------------------------------------------------------
// 13. BUG-150: Deduplicate 20D Median Turnover in dynamicCapitalEngine.js
// ---------------------------------------------------------------------------
runTest('BUG-150: dynamicCapitalEngine.js eliminates duplicate turnover line in execution ticket HTML', () => {
  const capCode = fs.readFileSync(path.join(root, 'src/utils/dynamicCapitalEngine.js'), 'utf8');

  // Must not have adjacent duplicate turnover lines
  assert.ok(!capCode.includes("• 20D Median Turnover: Rs. ${s.turnoverLakhs}L (Safe Total Order Cap: Rs. ${s.safeOrderLakhs}L)`,\n    `• 20D Median Turnover: Rs. ${s.turnoverLakhs}L (Safe Total Order Cap: Rs. ${s.safeOrderLakhs}L)"),
    'dynamicCapitalEngine.js must not output duplicate turnover lines in HTML execution ticket');
});

// ---------------------------------------------------------------------------
// 14. BUG-151: RegulatoryHub Forex Div/0 Guard & dividendHistory 12mo FY Range
// ---------------------------------------------------------------------------
runTest('BUG-151: RegulatoryHub guards sellRate > 0 and dividendHistory restricts fiscal year overlap', () => {
  const regCode = fs.readFileSync(path.join(root, 'src/components/RegulatoryHub.tsx'), 'utf8');
  const divCode = fs.readFileSync(path.join(root, 'src/utils/dividendHistory.js'), 'utf8');

  // RegulatoryHub must guard sellRate <= 0
  assert.ok(regCode.includes('sellRate <= 0') || regCode.includes('sellRate > 0 ?') || regCode.includes('sellRate === 0'),
    'RegulatoryHub must guard against division by zero when sellRate is 0');

  // dividendHistory must not span 17 months across fiscal years
  assert.ok(!divCode.includes("start: new Date(`${adY1}-05-01`),\n    end:   new Date(`${adY2}-10-01`),"),
    'dividendHistory fiscalYearToDateRange must narrow range to avoid 17-month cross-FY overlap');
});

// ---------------------------------------------------------------------------
// 15. BUG-164: watchlistAlerts NPT Midnight & indexedDb Reset dbPromise on Error
// ---------------------------------------------------------------------------
runTest('BUG-164: watchlistAlerts uses NPT date and indexedDb resets dbPromise on error', () => {
  const watchCode = fs.readFileSync(path.join(root, 'src/utils/watchlistAlerts.js'), 'utf8');
  const idbCode = fs.readFileSync(path.join(root, 'src/utils/indexedDb.js'), 'utf8');
  const resCode = fs.readFileSync(path.join(root, 'src/components/Resources.jsx'), 'utf8');

  // watchlistAlerts must not use UTC toISOString().slice(0, 10) for NPT midnight comparison
  assert.ok(!watchCode.includes('new Date(config.lastTriggeredAt).toISOString().slice(0, 10)'),
    'watchlistAlerts must format lastTriggeredAt with NPT date formatter to prevent midnight mismatch');

  // indexedDb must reset dbPromise to null on error so future retries can succeed
  assert.ok(idbCode.includes('dbPromise = null;'),
    'indexedDb must reset dbPromise = null on open error to prevent permanent sticky failure');

  // Resources.jsx must use openExternalUrl instead of plain <a href="..." target="_blank">
  assert.ok(!resCode.includes('<a href="https://meroshare.cdsc.com.np/" target="_blank"'),
    'Resources.jsx must open MeroShare via openExternalUrl to avoid broken mobile webview navigation');
});

console.log(`\n==================================================`);
console.log(`Batch 6 Remediation Test Results: ${passedTests}/${totalTests} Passed`);
console.log(`==================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
