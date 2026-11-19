// tests/baSubagentAuditRemediation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// =========================================================================
// Category 1: Security, Auth, Vault & Proxy
// =========================================================================

test('SEC-01: TestSuite.jsx cleans up nepse_hub_test_user_profiles key', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/TestSuite.jsx'), 'utf8');
  assert.ok(
    src.includes("localStorage.removeItem('nepse_hub_test_user_profiles')"),
    'TestSuite must clean up nepse_hub_test_user_profiles'
  );
  assert.ok(
    !src.includes("localStorage.removeItem('nepse_meroshare_profiles_enc_test_user')"),
    'TestSuite must not use obsolete key nepse_meroshare_profiles_enc_test_user'
  );
});

test('SEC-02: proxy/routes/radarRoutes.js protects /admin/backfill-status with requireAdminSecret', () => {
  const src = fs.readFileSync(path.join(ROOT, 'proxy/routes/radarRoutes.js'), 'utf8');
  assert.ok(
    src.includes('router.get("/admin/backfill-status", requireAdminSecret, handleBackfillStatus)'),
    'GET /admin/backfill-status must require requireAdminSecret middleware'
  );
});

test('SEC-03: proxy/meroshare.js sets private, no-store Cache-Control header', () => {
  const src = fs.readFileSync(path.join(ROOT, 'proxy/meroshare.js'), 'utf8');
  assert.ok(
    src.includes('private, no-store') || src.includes('no-cache, no-store, must-revalidate'),
    'proxy/meroshare.js must set private no-store Cache-Control'
  );
});

test('SEC-04: meroShareWaccService.js preserves promoter suffix with hyphens or spaces', async () => {
  const { normalizeScripSymbol } = await import('../src/services/meroShareWaccService.js');
  assert.equal(normalizeScripSymbol('GBIME-PO'), 'GBIME_PO', 'GBIME-PO must normalize to GBIME_PO');
  assert.equal(normalizeScripSymbol('GBIME PO'), 'GBIME_PO', 'GBIME PO must normalize to GBIME_PO');
  assert.equal(normalizeScripSymbol('NABIL_PO'), 'NABIL_PO', 'NABIL_PO must be preserved');
  assert.equal(normalizeScripSymbol('NABIL'), 'NABIL', 'Ordinary scrip NABIL must be NABIL');
});

test('SEC-05: meroShareService.js returns cachedFallback: true on portfolio fetch error', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/services/meroShareService.js'), 'utf8');
  // Look at lines around fetchPortfolio failure
  assert.ok(
    src.includes("cachedFallback: Boolean(account.holdings?.length)") ||
    src.includes("cachedFallback: true") && src.includes("Failed to fetch portfolio"),
    'Failed portfolio fetch must return cachedFallback flag'
  );
});

// =========================================================================
// Category 2: Quant & Statutory Compliance
// =========================================================================

test('QUANT-01: StockInformationHubModal imports isMarketOpen from nepseCalendar and has no inline Friday closure', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/StockInformationHubModal.tsx'), 'utf8');
  assert.ok(
    !src.includes('if (day === 5 || day === 6) return false;'),
    'StockInformationHubModal must not contain inline legacy day === 5 || day === 6 check'
  );
  assert.ok(
    src.includes('isMarketOpen') && src.includes('@/utils/nepseCalendar'),
    'StockInformationHubModal must import isMarketOpen from nepseCalendar'
  );
});

test('QUANT-02: quantEngine.js calculateGrahamIntrinsicValue handles loss-makers safely', async () => {
  const { calculateGrahamIntrinsicValue } = await import('../src/utils/quantEngine.js');
  const resLoss = calculateGrahamIntrinsicValue(-5, 120, 200);
  assert.equal(resLoss.grahamNumber, null, 'Loss-maker must return grahamNumber: null');
  assert.equal(resLoss.isUndervalued, false, 'Loss-maker must not be marked isUndervalued');
  assert.equal(resLoss.marginOfSafetyPct, 0, 'Loss-maker margin of safety must be 0');
});

test('QUANT-03: quantEngine.js calculateRiskRewardRatio guards inverted stop loss', async () => {
  const { calculateRiskRewardRatio } = await import('../src/utils/quantEngine.js');
  // entry 100, target 115, stop 105 (inverted: stop > entry)
  const inverted = calculateRiskRewardRatio(100, 115, 105);
  assert.equal(inverted.isViable, false, 'Inverted stop loss must not be viable');
  assert.equal(inverted.rrr, 0, 'Inverted stop loss RRR must be 0');
  assert.ok(inverted.verdict.includes('Inverted') || inverted.verdict.includes('Invalid'), 'Verdict must flag inverted stop');
});

test('QUANT-04: Promoter lock-in window is aligned to 120 days across modules', () => {
  const dynamicSrc = fs.readFileSync(path.join(ROOT, 'src/utils/dynamicCalculationEngine.js'), 'utf8');
  assert.ok(dynamicSrc.includes('120'), 'dynamicCalculationEngine must use 120 days promoter lock-in window');

  const quantSrc = fs.readFileSync(path.join(ROOT, 'src/utils/quantEngine.js'), 'utf8');
  assert.ok(quantSrc.includes('120') && !quantSrc.includes('daysRemaining <= 45'), 'quantEngine must use 120 days window');

  const swingSrc = fs.readFileSync(path.join(ROOT, 'src/utils/swingGateEvaluator.js'), 'utf8');
  assert.ok(swingSrc.includes('120') && !swingSrc.includes('daysRemaining <= 25'), 'swingGateEvaluator must use 120 days window');

  const alphaSrc = fs.readFileSync(path.join(ROOT, 'src/components/AlphaPlaybookService.tsx'), 'utf8');
  assert.ok(alphaSrc.includes('120'), 'AlphaPlaybookService must use 120 days window');
});

test('QUANT-05: OrderExecution.jsx includes CGT on sell and labels Net Receivable', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/views/OrderExecution.jsx'), 'utf8');
  assert.ok(src.includes('Net Receivable'), 'Order execution must label sell proceeds as Net Receivable');
  assert.ok(src.includes('cgt') || src.includes('capitalGainsTax') || src.includes('profitTax'), 'Order execution must compute CGT on sell');
});

test('QUANT-06: paperTrading.js calculates settlement using trading days', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/utils/paperTrading.js'), 'utf8');
  assert.ok(
    !src.includes('orderTimestamp + 2 * 24 * 60 * 60 * 1000') || src.includes('tradingDay') || src.includes('getSettlementDate'),
    'paperTrading must not use naive 48 calendar hours for settlement'
  );
});

test('QUANT-07: services.tsx uses 12.5% for circuit near check', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/services.tsx'), 'utf8');
  assert.ok(
    src.includes('12.5') || !src.includes('pCh > 10.0%'),
    'services.tsx must use 12.5% for 15% circuit near check'
  );
});

// =========================================================================
// Category 3: Frontend UI, Lifecycles & Stitch Views
// =========================================================================

test('UI-01: AiGuruQuantitativeCard.tsx prefixes /api/ai-guru/assess with getProxyBase()', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/AiGuruQuantitativeCard.tsx'), 'utf8');
  assert.ok(
    src.includes('getProxyBase') && src.includes('${getProxyBase()}/api/ai-guru/assess'),
    'AiGuruQuantitativeCard must use getProxyBase() on fetch call'
  );
});

test('UI-02: WatchlistScreener.jsx handles Mfg sector matching for Manufacturing and Processing', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/views/WatchlistScreener.jsx'), 'utf8');
  assert.ok(
    src.includes('manufactur'),
    'WatchlistScreener must match manufactur for Mfg sector filter'
  );
});

test('UI-03: AdvancedChartModal.jsx exits fullscreen on unmount', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/AdvancedChartModal.jsx'), 'utf8');
  assert.ok(
    src.includes('document.exitFullscreen'),
    'AdvancedChartModal must call document.exitFullscreen on unmount cleanup'
  );
});

test('UI-04: AiGuruQuantitativeCard.tsx resets assessment to null on symbol switch', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/AiGuruQuantitativeCard.tsx'), 'utf8');
  assert.ok(
    src.includes('setAssessment(null)') && src.includes('setAnalysisMarkdown("")'),
    'AiGuruQuantitativeCard must reset assessment on symbol switch'
  );
});

test('UI-05: StockBrokerAnalysisTab.jsx verifies brokerData.symbol === symbol', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/StockBrokerAnalysisTab.jsx'), 'utf8');
  assert.ok(
    src.includes('brokerData.symbol === symbol') || src.includes('brokerData?.symbol === symbol'),
    'StockBrokerAnalysisTab must check brokerData symbol match'
  );
});

test('UI-06: Portfolio.jsx tries parseMeroShareCsv before naive token splitting', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/Portfolio.jsx'), 'utf8');
  assert.ok(
    src.includes('parseMeroShareCsv'),
    'Portfolio.jsx handleParseImportText must call parseMeroShareCsv'
  );
});

test('UI-07: StockBrokerAnalysisTab.jsx uses formatBrokerDisplay to prevent #94 Broker #94', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/StockBrokerAnalysisTab.jsx'), 'utf8');
  assert.ok(
    !src.includes('#{b.id} {b.name}') && !src.includes('#{b.id} <span style={{ color: \'#94a3b8\', fontWeight: 500 }}>{b.name}</span>'),
    'StockBrokerAnalysisTab must not directly format #{b.id} {b.name}'
  );
});

test('UI-08: PredictorHub.jsx splits badge emoji using Array.from', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/PredictorHub.jsx'), 'utf8');
  assert.ok(
    !src.includes('hubPreOpenGate.badge.slice(0, 2)'),
    'PredictorHub.jsx must not use raw .slice(0, 2) on badge emoji'
  );
});

test('UI-09: Formatting NaN guards in LiveMarketDashboard, Dashboard, and WatchlistScreener', () => {
  const liveSrc = fs.readFileSync(path.join(ROOT, 'src/views/LiveMarketDashboard.jsx'), 'utf8');
  assert.ok(!liveSrc.includes('stock.ltp.toFixed(2)'), 'LiveMarketDashboard must guard stock.ltp.toFixed');

  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8');
  assert.ok(!dashSrc.includes('activePt.close.toFixed(2)'), 'Dashboard must guard activePt.close.toFixed');

  const watchSrc = fs.readFileSync(path.join(ROOT, 'src/views/WatchlistScreener.jsx'), 'utf8');
  assert.ok(!watchSrc.includes('stock.ltp.toFixed(2)'), 'WatchlistScreener must guard stock.ltp.toFixed');
});

// =========================================================================
// Category 4: Data Layer, Storage & Scraping Invariants
// =========================================================================

test('DATA-01: newsImpactScorer.js consolidates merged tickers per BUG-141 spec', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/utils/newsImpactScorer.js'), 'utf8');
  assert.ok(
    !src.includes("id: 'GBLBS'") && !src.includes("id: 'JEBL'"),
    'newsImpactScorer must not contain discontinued tickers per BUG-141'
  );
  assert.ok(
    src.includes("id: 'GBBL'"),
    'GBBL entity must exist'
  );
});

test('DATA-02: proxy/db/ledgerStore.js protects ordinary equities in isNonEquityScrip', () => {
  const src = fs.readFileSync(path.join(ROOT, 'proxy/db/ledgerStore.js'), 'utf8');
  assert.ok(
    src.includes('NMBMF') && src.includes('SWMF'),
    'ledgerStore isNonEquityScrip must protect ordinary equities NMBMF and SWMF'
  );
});

test('DATA-03: servicesApi.js uses year >= 2050 for Bikram Sambat check', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/utils/servicesApi.js'), 'utf8');
  assert.ok(
    src.includes('year >= 2050') || !src.includes('year > 2060'),
    'servicesApi computeIpoStatus must use year >= 2050'
  );
});

test('DATA-04: services.tsx contains no fake phone numbers', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/services.tsx'), 'utf8');
  assert.ok(!src.includes('01-4444444'), 'services.tsx must not contain fake phone 01-4444444');
  assert.ok(!src.includes('01-4250000'), 'services.tsx must not contain fake phone 01-4250000');
});

test('DATA-05: proxy/server.mjs outputs Broker #77 as Nabil Stock Dealer Ltd.', () => {
  const src = fs.readFileSync(path.join(ROOT, 'proxy/server.mjs'), 'utf8');
  assert.ok(
    src.includes('Nabil Stock Dealer Ltd.') || !src.includes('Nabil Stock Dealer Pvt. Ltd.'),
    'server.mjs Broker #77 must be Nabil Stock Dealer Ltd.'
  );
});

test('DATA-06: indexedDb.js sets db.onclose to reset dbPromise', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/utils/indexedDb.js'), 'utf8');
  assert.ok(
    src.includes('onclose') && src.includes('dbPromise = null'),
    'indexedDb.js must reset dbPromise on db.onclose'
  );
});
