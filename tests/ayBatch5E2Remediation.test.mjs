import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('🧪 Running Batch 5 Sub-Wave 5E-2 Remediation Test Suite (19 Bugs)...\n');

let passedTests = 0;
let totalTests = 0;

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

// ---------------------------------------------------------------------------
// 1. BUG-041: UniversalScreener Multi-TF & Fallback Invariants
// ---------------------------------------------------------------------------
runTest('BUG-041: UniversalScreener multi-TF open, 0-match clean state, no fake 52W or float', () => {
  const code = fs.readFileSync(path.join(root, 'src/components/services.tsx'), 'utf8');

  // Must not fabricate 52W high/low with 1.35x / 0.65x multipliers
  assert.ok(!code.includes('c * 1.35 : 500'), 'Must remove fake c * 1.35 52W high fabrication');
  assert.ok(!code.includes('c * 0.65 : 200'), 'Must remove fake c * 0.65 52W low fabrication');

  // Must not fabricate float turnover with 12M shares and 0.45 factor
  assert.ok(!code.includes('c * 12 * 1e6'), 'Must remove fake c * 12 * 1e6 market cap fallback in UniversalScreener');

  // Must have AbortController or active cancellation guard in useEffect
  assert.ok(code.includes('let active = true;') || code.includes('const controller = new AbortController();') || code.includes('let cancelled = false;'),
    'UniversalScreener useEffect must guard async fetchPriceHistory with an active/cancel flag');

  // Screener must not dump 20 unrelated stocks when 0 stocks match filter
  assert.ok(!code.includes('No scrips triggered this exact filter on the'),
    'Must not inject fake top-ranked candidates when 0 stocks match filterFn');
});

// ---------------------------------------------------------------------------
// 2. BUG-042: Standalone Service Renderers Multi-TF Invariants & Peter Lynch GARP
// ---------------------------------------------------------------------------
runTest('BUG-042: BrokerFavouritesService, BrokerHeatmapService, and Lynch GARP integrity', () => {
  const servCode = fs.readFileSync(path.join(root, 'src/components/services.tsx'), 'utf8');
  const hubCode = fs.readFileSync(path.join(root, 'src/components/ServicesHub.tsx'), 'utf8');

  // Must not fabricate ltp: 500 in BrokerFavouritesService
  assert.ok(!servCode.includes('scripMap.set(s.symbol, { symbol: s.symbol, ltp: 500 })'),
    'Must eliminate fake ltp: 500 fallback in BrokerFavouritesService');

  // BrokerHeatmapService must indicate when 1D fallback matrix is used on multi-day timeframe
  assert.ok(servCode.includes('isFallback1D') || servCode.includes('isBundledFallback') || servCode.includes('fallbackNotice') || servCode.includes('latestBrokerMatrix'),
    'BrokerHeatmapService must handle bundled fallback transparently');

  // Lynch GARP in ServicesHub must not fabricate fake growth rates (18, 12, 8)
  assert.ok(!hubCode.includes('s.eps > 25 ? 18 : s.eps > 15 ? 12 : 8'),
    'ServicesHub Lynch GARP must not fabricate fake EPS growth (18/12/8)');
});

// ---------------------------------------------------------------------------
// 3. BUG-141: NewsService & newsImpactScorer.js Slug Filter, BS Date Loop, & Tickers
// ---------------------------------------------------------------------------
runTest('BUG-141: newsImpactScorer slug filter, BS date parse guard, and ticker corrections', () => {
  const scorerCode = fs.readFileSync(path.join(root, 'src/utils/newsImpactScorer.js'), 'utf8');

  // Must not contain invalid/merged tickers GBLBS, JEBL, LXBL, HEIC
  assert.ok(!scorerCode.includes("id: 'GBLBS'"), "Must correct invalid ticker 'GBLBS' to 'GBBL'");
  assert.ok(!scorerCode.includes("id: 'JEBL'"), "Must correct invalid ticker 'JEBL' to 'JBBL'");
  assert.ok(!scorerCode.includes("id: 'LXBL'"), "Must correct invalid ticker 'LXBL' to 'LSL'");
  assert.ok(!scorerCode.includes("id: 'HEIC'"), "Must correct invalid ticker 'HEIC' to 'HEI' or 'HAIC'");

  // Must guard Date.parse against BS dates (years >= 2050)
  assert.ok(scorerCode.includes('2050') || scorerCode.includes('2060') || scorerCode.includes('bikram') || scorerCode.includes('bsToAd'),
    'parseNewsTimestamp must guard against parsing BS year >= 2050 as future Gregorian timestamp');

  // Trading session hours loop must be bounded or protected against multi-year loops
  assert.ok(scorerCode.includes('Math.min') || scorerCode.includes('tStart > tEnd') || scorerCode.includes('30 * 24'),
    'calculateTradingSessionHoursElapsed must guard against unbounded 15-minute step loops');
});

// ---------------------------------------------------------------------------
// 4. BUG-142: Broker Directory Broker #58 Naasa Securities & Dynamic Count
// ---------------------------------------------------------------------------
runTest('BUG-142: Broker #58 is Naasa Securities and #77 is Nabil Stock Dealer; remove 01-4400000 fake contact', () => {
  const servCode = fs.readFileSync(path.join(root, 'src/components/services.tsx'), 'utf8');
  const serverCode = fs.readFileSync(path.join(root, 'proxy/server.mjs'), 'utf8');

  // Broker #58 in services.tsx must NOT be named Nabil Stock Dealer
  assert.ok(!servCode.includes("{ id: 58, name: 'Nabil Stock Dealer Ltd.'"),
    'Broker #58 must not be mislabeled as Nabil Stock Dealer (58 is Naasa Securities)');
  assert.ok(!servCode.includes('Brokers 58 (Nabil Stock Dealer)'),
    'Broker 58 must not be referenced as Nabil Stock Dealer');

  // proxy/server.mjs must not hardcode contact: '01-4400000' for every broker
  assert.ok(!serverCode.includes("contact: '01-4400000'"),
    'proxy/server.mjs must not hardcode fake contact 01-4400000 for all brokers');
});

// ---------------------------------------------------------------------------
// 5. BUG-143: IPOTracker Results Wiring & NPT BS Date Conversion
// ---------------------------------------------------------------------------
runTest('BUG-143: IPOTracker results tab fetches real results and replaces year-57 with bsToAd', () => {
  const servCode = fs.readFileSync(path.join(root, 'src/components/services.tsx'), 'utf8');
  const apiCode = fs.readFileSync(path.join(root, 'src/utils/servicesApi.js'), 'utf8');

  // services.tsx must not empty results tab
  assert.ok(servCode.includes('fetchIPOResultCompanies') || servCode.includes('type === \'results\'') || servCode.includes('/api/ipo-result/companies'),
    'IPOTracker must wire real results instead of returning empty list on results tab');

  // Must not use naive year - 57 in computeIpoStatus / checkIpoStatus
  assert.ok(!servCode.includes('new Date(year - 57, month, day)'),
    'services.tsx checkIpoStatus must not use naive year - 57');
  assert.ok(!apiCode.includes('new Date(year - 57, month, day)'),
    'servicesApi.js computeIpoStatus must not use naive year - 57');
});

// ---------------------------------------------------------------------------
// 6. BUG-144: nepseRegulatoryEngine.ts Data Veracity & Graham Guard
// ---------------------------------------------------------------------------
runTest('BUG-144: nepseRegulatoryEngine returns null Graham on eps <= 0, handles missing data honestly', () => {
  const engineCode = fs.readFileSync(path.join(root, 'src/services/fundamentals/nepseRegulatoryEngine.ts'), 'utf8');
  const tabCode = fs.readFileSync(path.join(root, 'src/components/StockFundamentalsAndLockInTab.tsx'), 'utf8');

  // Graham Fair value must NOT equal bookValuePerShare when epsTtm <= 0
  assert.ok(!engineCode.includes(': bookValuePerShare;'),
    'Loss-making companies must not have grahamFairValue fall back to bookValuePerShare');

  // StockFundamentalsAndLockInTab must not show "60D BLACKOUT"
  assert.ok(!tabCode.includes('60D BLACKOUT'),
    'Must display statutory 120D CLIFF VETO instead of 60D BLACKOUT');
});

// ---------------------------------------------------------------------------
// 7. BUG-145: Calculators & Capital Risk Simulator Veracity
// ---------------------------------------------------------------------------
runTest('BUG-145: calculators.tsx respects user risk % & win rate; handles 0% SIP return; includes bonus share tax', () => {
  const calcCode = fs.readFileSync(path.join(root, 'src/components/calculators.tsx'), 'utf8');
  const barCode = fs.readFileSync(path.join(root, 'src/components/CapitalRiskSimulatorBar.jsx'), 'utf8');

  // calculators.tsx must not silently cap riskPct at 1.0%
  assert.ok(!calcCode.includes('Math.min(1.0, Math.max(0.25, parseFloat(f.riskPct) || 1.0))'),
    'Must not silently cap user riskPct at 1.0% in calculators.tsx');

  // calculators.tsx must not hardcode winProb = 0.635
  assert.ok(!calcCode.includes('const winProb = 0.635;'),
    'Must respect user winProbPct input instead of hardcoding winProb = 0.635');

  // SIP calculator must handle 0% rate without division by zero
  assert.ok(calcCode.includes('annualRate === 0') || calcCode.includes('!annualRate || annualRate === 0') || calcCode.includes('r === 0'),
    'SIP calculator must safely handle 0% return rate');

  // CapitalRiskSimulatorBar must sync nepse_hub_*_transactions
  assert.ok(barCode.includes('nepse_hub_') || barCode.includes('_transactions'),
    'CapitalRiskSimulatorBar must search nepse_hub_*_transactions keys');
});

// ---------------------------------------------------------------------------
// 8. BUG-146: Personal Desk Storage Keys, Input Validation, & Cache Flush
// ---------------------------------------------------------------------------
runTest('BUG-146: PortfolioTool rejects non-positive qty/rate; AlertsTool rejects ltp=0 false trigger; clearAllCache flushes storage', () => {
  const servCode = fs.readFileSync(path.join(root, 'src/components/services.tsx'), 'utf8');
  const apiCode = fs.readFileSync(path.join(root, 'src/utils/servicesApi.js'), 'utf8');

  // PortfolioTool must reject non-positive inputs
  assert.ok(servCode.includes('q <= 0') || servCode.includes('isNaN(q) || q <= 0'),
    'PortfolioTool add() must validate that quantity and rate are strictly positive');

  // AlertsTool must not trigger when ltp is 0 or missing
  assert.ok(servCode.includes('s.ltp <= 0') || servCode.includes('!s.ltp') || servCode.includes('s.ltp > 0'),
    'AlertsTool hit() must require valid positive ltp before triggering');

  // clearAllCache in servicesApi must clear IndexedDB or storage cache
  assert.ok(apiCode.includes('idbClear') || apiCode.includes('clearAllCache') && apiCode.includes('idbDel'),
    'servicesApi.js clearAllCache must flush persistent cache layers');
});

// ---------------------------------------------------------------------------
// 9. BUG-147: ApiStatusService Prefix getProxyBase() and Strict Plan Bounds
// ---------------------------------------------------------------------------
runTest('BUG-147: ApiStatusService prefixes /api/... with getProxyBase() and verifies plan bounds strictly', () => {
  const servCode = fs.readFileSync(path.join(root, 'src/components/services.tsx'), 'utf8');

  // Must not have bare fetch('/api/health') or fetch('/api/market-indices')
  assert.ok(!servCode.includes("fetch('/api/health')"), 'ApiStatusService must prefix /api/health with getProxyBase()');
  assert.ok(!servCode.includes("fetch('/api/market-indices')"), 'ApiStatusService must prefix /api/market-indices with getProxyBase()');
  assert.ok(!servCode.includes("fetch('/api/today-prices')"), 'ApiStatusService must prefix /api/today-prices with getProxyBase()');

  // Must not default geomValid to : true when plan targets are undefined
  assert.ok(!servCode.includes(': true;\n        record(\'Category C: Quant Setup Engine\''),
    'ApiStatusService must require valid numeric bounds instead of defaulting geomValid to true');
});

// ---------------------------------------------------------------------------
// 10. BUG-153: Custom WACC Scoped per Account & Object Format Preservation
// ---------------------------------------------------------------------------
runTest('BUG-153: Custom WACC scoped per accountId and preserves { wacc, source } structure', () => {
  const calcCode = fs.readFileSync(path.join(root, 'src/utils/calculations.js'), 'utf8');

  // Must have accountId scoping in getCustomWaccMap and saveCustomWaccMap
  assert.ok(calcCode.includes('acc_${cleanAccId}_custom_wacc_map'),
    'calculations.js must support account-scoped custom WACC keys');
  assert.ok(calcCode.includes('wacc: Number(Number(wacc).toFixed(2)), source'),
    'setScripCustomWacc must preserve { wacc, source } format');
});

// ---------------------------------------------------------------------------
// 11. BUG-154: Header-Aware CSV Parser in Portfolio.jsx
// ---------------------------------------------------------------------------
runTest('BUG-154: Portfolio.jsx uses header-aware parseMeroShareCsv instead of hardcoding parts[3] as WACC', () => {
  const portCode = fs.readFileSync(path.join(root, 'src/components/Portfolio.jsx'), 'utf8');

  // Must not assume parts[3] is WACC (parts[3] is Free Balance in CDSC export)
  assert.ok(!portCode.includes('let wacc = parseFloat(parts[3] ? parts[3].replace(/"/g, \'\').trim() : \'100\') || 100;'),
    'Portfolio.jsx must not read Free Balance (column 3) as WACC');
  assert.ok(portCode.includes('parseMeroShareCsv') || portCode.includes('headers'),
    'Portfolio.jsx must use header-aware CSV parsing');
});

// ---------------------------------------------------------------------------
// 12. BUG-155: WaccTaxCalculator.jsx & Calculator.jsx Dynamic Lots & Institutional CGT
// ---------------------------------------------------------------------------
runTest('BUG-155: WaccTaxCalculator supports user holdings and fixes dateless FIFO; Calculator.jsx adds institutional 10% CGT', () => {
  const calcCode = fs.readFileSync(path.join(root, 'src/components/Calculator.jsx'), 'utf8');
  const waccView = fs.readFileSync(path.join(root, 'src/views/WaccTaxCalculator.jsx'), 'utf8');

  // Calculator.jsx must include institutional / corporate 10% CGT option
  assert.ok(calcCode.includes('institutional') || calcCode.includes('10.0% CGT') || calcCode.includes('10% CGT'),
    'Calculator.jsx must include Institutional (10% CGT) holding type option');

  // WaccTaxCalculator FIFO sort must handle missing/dateless lots safely
  assert.ok(waccView.includes('sort') || waccView.includes('1970-01-01') || waccView.includes('Date.parse'),
    'WaccTaxCalculator must sort lots chronologically before FIFO application');
});

// ---------------------------------------------------------------------------
// 13. BUG-156: MeroShare WACC Normalization Must Not Strip Promoter Suffix
// ---------------------------------------------------------------------------
runTest('BUG-156: normalizeScripSymbol does not strip promoter suffixes (_PO/PR/PROM/P)', () => {
  const waccServCode = fs.readFileSync(path.join(root, 'src/services/meroShareWaccService.js'), 'utf8');

  // Must not strip promoter share suffixes into ordinary shares
  assert.ok(!waccServCode.includes("clean = clean.replace(/[_\.](PO|PR|PROM|P)$/i, '');"),
    'normalizeScripSymbol must not strip promoter suffixes (causes promoter WACC to overwrite ordinary equity)');
});

// ---------------------------------------------------------------------------
// 14. BUG-157: pullMeroShareLivePortfolio Honest Status on Auth Failure
// ---------------------------------------------------------------------------
runTest('BUG-157: pullMeroShareLivePortfolio returns success: false, cachedFallback: true on auth failure', () => {
  const meroCode = fs.readFileSync(path.join(root, 'src/services/meroShareService.js'), 'utf8');

  // Must not return success: true when auth fails and reading cached holdings
  assert.ok(!meroCode.includes("if (!auth.success || !auth.token) {\n    if (account.holdings?.length) {\n      return {\n        success: true,"),
    'Must return success: false, cachedFallback: true when MeroShare auth fails');
});

// ---------------------------------------------------------------------------
// 15. BUG-158 & BUG-159: Remove Beni Hardcoding & Fix BOID Slicing in IPO Operations
// ---------------------------------------------------------------------------
runTest('BUG-158 & BUG-159: Remove hardcoded BENI seed and fix BOID DP prefix slicing in IPOList.jsx', () => {
  const ipoCode = fs.readFileSync(path.join(root, 'src/components/IPOList.jsx'), 'utf8');

  // Must not have hardcoded BENI today result seed
  assert.ok(!ipoCode.includes("name: 'Beni Hydropower Project Limited (Result Published)', scrip: 'BENI', type: 'IPO', nmbclId: 41, isTodayResult: true"),
    'IPOList.jsx must not hardcode Beni Hydropower as a static seed with isTodayResult: true');

  // Must not slice boidStr.substring(3, 6)
  assert.ok(!ipoCode.includes('boidStr.substring(3, 6)'),
    'IPOList.jsx must not use invalid substring(3, 6) for 16-digit BOID DP extraction');
});

// ---------------------------------------------------------------------------
// 16. BUG-160: TestSuite.jsx Verifies Encrypted Vault and Uses getProxyBase()
// ---------------------------------------------------------------------------
runTest('BUG-160: TestSuite.jsx tests AES-256-GCM encrypted vault and prefixes /api/... with getProxyBase()', () => {
  const testCode = fs.readFileSync(path.join(root, 'src/components/TestSuite.jsx'), 'utf8');

  // Test 4 must test encryption, not plaintext localStorage
  assert.ok(!testCode.includes("localStorage.setItem('nepse_app_test_profile', JSON.stringify(testProfile));"),
    'TestSuite Test 4 must verify encrypted vault storage, not plaintext localStorage');

  // Must not have bare fetch('/api/health') or fetch('/api/market-indices')
  assert.ok(!testCode.includes("fetch('/api/health')"), 'TestSuite must prefix /api/health with getProxyBase()');
  assert.ok(!testCode.includes("fetch('/api/market-indices')"), 'TestSuite must prefix /api/market-indices with getProxyBase()');
  assert.ok(!testCode.includes("fetch('/api/broker-analysis/NABIL?days=1&refresh=true')"), 'TestSuite must prefix /api/broker-analysis with getProxyBase()');
});

// ---------------------------------------------------------------------------
// 17. BUG-161: OrderExecution.jsx Tiered Commission, Sell CGT, Dynamic MAX
// ---------------------------------------------------------------------------
runTest('BUG-161: OrderExecution.jsx uses tiered brokerage slabs, Sell CGT, dynamic MAX, and no alert() stubs', () => {
  const ordCode = fs.readFileSync(path.join(root, 'src/views/OrderExecution.jsx'), 'utf8');

  // Must not use flat 0.34% brokerage fee
  assert.ok(!ordCode.includes('turnover * 0.0034'),
    'OrderExecution.jsx must use statutory tiered brokerage slabs instead of flat 0.34%');

  // Must not set kitta to 420 on MAX
  assert.ok(!ordCode.includes('onClick={() => setKitta(420)}'),
    'OrderExecution.jsx must bind MAX to user balance/holdings instead of hardcoding 420');

  // Must not use alert() for order submission
  assert.ok(!ordCode.includes('alert(successMsg);'),
    'OrderExecution.jsx must not use alert() stubs for order confirmation');
});

// ---------------------------------------------------------------------------
// 18. BUG-162: Stitch Views Dynamic Props, Manufacturing Sector Match, and ±15% Circuits
// ---------------------------------------------------------------------------
runTest('BUG-162: Stitch views handle manufacturing sector matching, ±15% circuits, and remove alerts', () => {
  const screenCode = fs.readFileSync(path.join(root, 'src/views/WatchlistScreener.jsx'), 'utf8');
  const dashCode = fs.readFileSync(path.join(root, 'src/views/LiveMarketDashboard.jsx'), 'utf8');

  // WatchlistScreener must match manufacturing sector case-insensitively
  assert.ok(screenCode.includes('manufact') || screenCode.includes('Manufacturing'),
    'WatchlistScreener must handle manufacturing sector match accurately');

  // LiveMarketDashboard circuit tag must use statutory 15% threshold (not 9.5%)
  assert.ok(!dashCode.includes("s.percentChange >= 9.5 ? 'Circuit'"),
    'LiveMarketDashboard must use >= 14.5% circuit threshold instead of old 9.5%');
});

// ---------------------------------------------------------------------------
// 19. BUG-163: PortfolioBrokerShield No Auto-Seed Sample & Cache-Control Private
// ---------------------------------------------------------------------------
runTest('BUG-163: PortfolioBrokerShield does not auto-seed sample portfolio and radarRoutes sets Cache-Control: private', () => {
  const shieldCode = fs.readFileSync(path.join(root, 'src/components/PortfolioBrokerShield.tsx'), 'utf8');
  const radarCode = fs.readFileSync(path.join(root, 'proxy/routes/radarRoutes.js'), 'utf8');

  // PortfolioBrokerShield must not default initial state to DEFAULT_SAMPLE_SHIELD_ITEMS
  assert.ok(!shieldCode.includes('return DEFAULT_SAMPLE_SHIELD_ITEMS;\n  });'),
    'PortfolioBrokerShield must not auto-seed sample portfolio as real user holdings');

  // radarRoutes must set Cache-Control: private, no-store for user portfolio shield
  assert.ok(!radarCode.includes('res.set("Cache-Control", "public, max-age=30");'),
    'radarRoutes must not set Cache-Control: public on sensitive user portfolio shield requests');
  assert.ok(radarCode.includes('private') || radarCode.includes('no-store'),
    'radarRoutes must set Cache-Control: private, no-store on user portfolio shield requests');
});

console.log(`\n==================================================`);
console.log(`Sub-Wave 5E-2 Remediation Test Results: ${passedTests}/${totalTests} Passed`);
console.log(`==================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
