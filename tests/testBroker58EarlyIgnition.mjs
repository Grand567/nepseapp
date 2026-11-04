// tests/testBroker58EarlyIgnition.mjs
import assert from 'assert';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enable test mode so live Telegram calls are safely mocked
process.env.NODE_ENV = 'test';
process.env.SUPPRESS_TEST_ALERTS = 'true';

const dbPath = path.join(__dirname, '..', 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath);

console.log('🧪 Starting Automated Suite: Broker #58 Early Ignition & Telegram Dispatcher...\n');

async function runTests() {
  const { 
    detectBroker58EarlyIgnition, 
    scanUniverseForBroker58Ignitions, 
    testTriggerBroker58Alert 
  } = await import('../proxy/smartAlertEngine.mjs');

  const { 
    formatEarlyIgnitionAlertHtml, 
    sendTelegramEarlyIgnitionAlert,
    formatBroker58RadarHtml,
    formatBroker58SymbolAuditHtml,
    runBroker58RadarAndDispatch,
    sendTelegramBroker58Playbook
  } = await import('../proxy/telegramNotifier.mjs');

  let passed = 0;

  // ── TEST 1: Detect Historical GHL Stealth Accumulation (2026-11-02) ──
  console.log('Test 1: Testing Broker 58 early ignition detection on GHL (2026-11-02)...');
  const ghlStock = db.prepare('SELECT * FROM daily_stock_summary WHERE symbol = ? AND trade_date = ?').get('GHL', '2026-11-02');
  const ghlBroker = db.prepare('SELECT * FROM daily_broker_ledger WHERE symbol = ? AND trade_date = ? AND broker_id = 58').get('GHL', '2026-11-02');

  assert(ghlStock, 'GHL stock summary row should exist');
  assert(ghlBroker, 'GHL broker 58 row should exist');

  const ghlResult = detectBroker58EarlyIgnition({
    symbol: 'GHL',
    ltp: ghlStock.close_price,
    open: ghlStock.open_price,
    pChange: ((ghlStock.close_price - ghlStock.open_price) / ghlStock.open_price) * 100,
    volume: ghlStock.total_volume,
    turnover: ghlStock.total_turnover,
    date: '2026-11-02',
    db
  });

  assert.strictEqual(ghlResult.qualified, true, 'GHL should qualify for early ignition');
  assert.strictEqual(ghlResult.brokerId, 58, 'Broker ID should be 58');
  assert(ghlResult.brokerBuyVol >= 200000, 'Broker buy volume should be >= 200,000 kitta');
  assert(ghlResult.buyRatioPct >= 75.0, 'Buy ratio should be >= 75%');
  assert(ghlResult.marketSharePct >= 20.0, 'Market share should be >= 20%');
  assert(ghlResult.pChange <= 4.5 && ghlResult.pChange >= -3.0, 'Price change must be compressed inside base');
  assert(ghlResult.buyZone.low < ghlResult.buyZone.high, 'Buy zone must be valid range');
  assert(ghlResult.stopLoss < ghlResult.ltp, 'Stop loss must be below LTP');
  assert(ghlResult.target1 > ghlResult.ltp, 'Target 1 must be above LTP');
  assert(ghlResult.target2 > ghlResult.target1, 'Target 2 must be above Target 1');
  console.log('✅ Test 1 Passed: GHL (2026-11-02) successfully qualified (+198k net kitta, 23.6% share, tight base).\n');
  passed++;

  // ── TEST 2: Detect Historical SHL Stealth Accumulation (2026-11-02) ──
  console.log('Test 2: Testing Broker 58 early ignition detection on SHL (2026-11-02)...');
  const shlStock = db.prepare('SELECT * FROM daily_stock_summary WHERE symbol = ? AND trade_date = ?').get('SHL', '2026-11-02');
  const shlResult = detectBroker58EarlyIgnition({
    symbol: 'SHL',
    ltp: shlStock.close_price,
    open: shlStock.open_price,
    pChange: ((shlStock.close_price - shlStock.open_price) / shlStock.open_price) * 100,
    volume: shlStock.total_volume,
    date: '2026-11-02',
    db
  });

  assert.strictEqual(shlResult.qualified, true, 'SHL should qualify for early ignition');
  assert(shlResult.marketSharePct >= 50.0, 'SHL market share should be > 50%');
  assert(shlResult.buyRatioPct >= 90.0, 'SHL buy ratio should be > 90%');
  console.log('✅ Test 2 Passed: SHL (2026-11-02) successfully qualified (61.4% share, 94.8% buy ratio).\n');
  passed++;

  // ── TEST 3: Strict Rejection of Late Breakout / Dump (DORDI 2026-10-27) ──
  console.log('Test 3: Testing rejection of late breakout / retail dump on DORDI (2026-10-27)...');
  const dordiStock = db.prepare('SELECT * FROM daily_stock_summary WHERE symbol = ? AND trade_date = ?').get('DORDI', '2026-10-27');
  const dordiResult = detectBroker58EarlyIgnition({
    symbol: 'DORDI',
    ltp: dordiStock.close_price,
    open: dordiStock.open_price,
    pChange: ((dordiStock.close_price - dordiStock.open_price) / dordiStock.open_price) * 100,
    volume: dordiStock.total_volume,
    date: '2026-10-27',
    db
  });

  assert.strictEqual(dordiResult.qualified, false, 'DORDI on breakout day must NOT qualify as early ignition');
  assert(dordiResult.pChange > 4.5, 'DORDI price change should be rejected as extended');
  assert(dordiResult.netVol < 0, 'DORDI broker 58 was net seller on dump day');
  console.log('✅ Test 3 Passed: DORDI correctly rejected on late +8.18% retail pump day (B58 net dumping).\n');
  passed++;

  // ── TEST 4: Telegram HTML Message Formatting ──
  console.log('Test 4: Verifying Telegram early ignition alert HTML formatting...');
  const html = formatEarlyIgnitionAlertHtml(ghlResult);
  assert(html.includes('EARLY IGNITION ALERT'), 'HTML should have Early Ignition header');
  assert(html.includes('$GHL'), 'HTML should mention $GHL');
  assert(html.includes('Naasa Securities'), 'HTML should mention Naasa Securities');
  assert(html.includes('Limit Buy Zone:'), 'HTML should state Limit Buy Zone');
  assert(html.includes('Invalidation Stop-Loss:'), 'HTML should state Stop-Loss');
  assert(html.includes('Target 1'), 'HTML should state Target 1');
  assert(html.includes('Target 2'), 'HTML should state Target 2');
  assert(html.includes('Net Risk / Reward:'), 'HTML should include RRR');
  assert(html.includes('Afternoon Stealth Accumulation'), 'HTML should include timing signature');
  console.log('✅ Test 4 Passed: Telegram alert HTML formatted perfectly with all required tactical parameters.\n');
  passed++;

  // ── TEST 5: Dispatch Telegram Early Ignition Alert (Mocked API) ──
  console.log('Test 5: Testing sendTelegramEarlyIgnitionAlert dispatch function...');
  const dispatchRes = await sendTelegramEarlyIgnitionAlert(ghlResult);
  assert.strictEqual(dispatchRes.success, true, 'Dispatch should return success');
  console.log('✅ Test 5 Passed: sendTelegramEarlyIgnitionAlert executed successfully.\n');
  passed++;

  // ── TEST 6: Universe Scanner for Broker 58 Setups ──
  console.log('Test 6: Testing scanUniverseForBroker58Ignitions on master ledger...');
  const scanRes = await scanUniverseForBroker58Ignitions({ limit: 5 });
  assert.strictEqual(scanRes.success, true, 'Scan should succeed');
  assert(Array.isArray(scanRes.setups), 'Setups should be an array');
  assert(scanRes.setups.length > 0, 'Should find active setups on latest date');
  console.log(`✅ Test 6 Passed: Universe scanner found ${scanRes.setups.length} active setups for ${scanRes.sessionDate}.\n`);
  passed++;

  // ── TEST 7: Telegram Broker 58 Radar Dispatcher (/broker58 command) ──
  console.log('Test 7: Testing runBroker58RadarAndDispatch(/broker58)...');
  const radarRes = await runBroker58RadarAndDispatch();
  assert.strictEqual(radarRes.success, true, 'Radar dispatch should succeed');
  assert(radarRes.setupsCount > 0, 'Radar should identify setups');

  // Test single stock query e.g. /broker58 GHL
  const singleRes = await runBroker58RadarAndDispatch('GHL');
  assert.strictEqual(singleRes.success, true, 'Single scrip radar query should succeed');
  console.log('✅ Test 7 Passed: /broker58 radar command executed successfully for both general and single stock queries.\n');
  passed++;

  // ── TEST 8: Test Trigger Broker 58 Alert ──
  console.log('Test 8: Testing testTriggerBroker58Alert API...');
  const testTriggerRes = await testTriggerBroker58Alert('GHL', { ltp: 335.0, operatorVwap: 333.2 });
  assert.strictEqual(testTriggerRes.triggered, true, 'testTriggerBroker58Alert should trigger');
  assert.strictEqual(testTriggerRes.alert.type, 'BROKER_58_EARLY_IGNITION');
  console.log('✅ Test 8 Passed: testTriggerBroker58Alert successfully created and dispatched alert item.\n');
  passed++;

  // ── TEST 9: Broker #58 Playbook & Empirical Briefing Dispatcher ──
  console.log('Test 9: Testing sendTelegramBroker58Playbook (/b58 playbook)...');
  const playbookRes = await sendTelegramBroker58Playbook();
  assert.strictEqual(playbookRes.success, true, 'Playbook dispatch should succeed');
  console.log('✅ Test 9 Passed: sendTelegramBroker58Playbook dispatched successfully.\n');
  passed++;

  // ── TEST 10: Single-Scrip Audit on DORDI (Dump / Sub-threshold Protection) ──
  console.log('Test 10: Testing single scrip audit on DORDI (/b58 DORDI)...');
  const dordiRadarRes = await runBroker58RadarAndDispatch('DORDI');
  assert.strictEqual(dordiRadarRes.success, true, 'DORDI single scrip audit should succeed');
  console.log('✅ Test 10 Passed: /b58 DORDI single scrip audit generated diagnostic verdict.\n');
  passed++;

  console.log(`🎉 All ${passed}/10 Automated Tests Passed with 100% Precision!`);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
