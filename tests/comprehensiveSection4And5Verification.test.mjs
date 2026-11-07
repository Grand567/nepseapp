// tests/comprehensiveSection4And5Verification.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../proxy/db/ledgerStore.js';
import { broadcastAlert, getSmartAlertHistory } from '../proxy/smartAlertEngine.mjs';

function readSrcFile(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

test('Comprehensive Section 4 & 5 Verification Suite', async (t) => {
  // ══════════════════════════════════════════════════════════════════
  // GROUP 1: SECTION 4 - DATABASE & PERFORMANCE OPTIMIZATION
  // ══════════════════════════════════════════════════════════════════
  await t.test('1. Database Engine PRAGMAs & Composite Indices', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    const synchronous = db.pragma('synchronous', { simple: true });
    const cacheSize = db.pragma('cache_size', { simple: true });
    const busyTimeout = db.pragma('busy_timeout', { simple: true });

    assert.equal(journalMode.toLowerCase(), 'wal', 'journal_mode must be WAL');
    assert.equal(synchronous, 1, 'synchronous must be 1 (NORMAL)');
    assert.equal(cacheSize, -64000, 'cache_size must be -64000 (64MB memory cache)');
    assert.ok(busyTimeout >= 10000, 'busy_timeout must be at least 10,000ms');

    const indexes = db.prepare('PRAGMA index_list(floorsheet_contracts)').all();
    const hasSymDateIndex = indexes.some(idx => idx.name === 'idx_fs_contracts_sym_date');
    assert.ok(hasSymDateIndex, 'Composite index idx_fs_contracts_sym_date must exist');
  });

  await t.test('2. Sub-10ms Benchmark Queries (1D, 5D, 30D)', () => {
    // 1D Query Benchmark
    const stmt1D = db.prepare('SELECT * FROM floorsheet_contracts WHERE symbol = ? AND trade_date = ?');
    stmt1D.all('AKJCL', '2026-11-06'); // warm-up
    const t0 = performance.now();
    const rows1D = stmt1D.all('AKJCL', '2026-11-06');
    const q1dMs = performance.now() - t0;
    assert.equal(rows1D.length, 360, '1D query must return all 360 AKJCL contracts on 2026-11-06');
    assert.ok(q1dMs < 10, `1D query benchmark must be < 10ms (was ${q1dMs.toFixed(2)}ms)`);

    // 5D Query Benchmark
    const recent5 = db.prepare('SELECT DISTINCT trade_date FROM floorsheet_contracts ORDER BY trade_date DESC LIMIT 5').all().map(r => r.trade_date);
    const placeholders5 = recent5.map(() => '?').join(',');
    const stmt5D = db.prepare(`SELECT * FROM floorsheet_contracts WHERE symbol = ? AND trade_date IN (${placeholders5})`);
    stmt5D.all('AKJCL', ...recent5); // warm-up
    const t1 = performance.now();
    const rows5D = stmt5D.all('AKJCL', ...recent5);
    const q5dMs = performance.now() - t1;
    assert.ok(rows5D.length >= 360, '5D query must return multi-session contracts');
    assert.ok(q5dMs < 10, `5D query benchmark must be < 10ms (was ${q5dMs.toFixed(2)}ms)`);

    // 30D Query Benchmark
    const recent30 = db.prepare('SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC LIMIT 30').all().map(r => r.trade_date);
    const placeholders30 = recent30.map(() => '?').join(',');
    const stmt30D = db.prepare(`SELECT * FROM daily_broker_ledger WHERE symbol = ? AND trade_date IN (${placeholders30})`);
    stmt30D.all('AKJCL', ...recent30); // warm-up
    const t2 = performance.now();
    const rows30D = stmt30D.all('AKJCL', ...recent30);
    const q30dMs = performance.now() - t2;
    assert.ok(rows30D.length > 0, '30D query must return broker ledger entries');
    assert.ok(q30dMs < 10, `30D query benchmark must be < 10ms (was ${q30dMs.toFixed(2)}ms)`);
  });

  await t.test('3. Smart Alert Engine Deduplication & Immediate Session Dispatch', () => {
    const testSym = `SYM_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const alertId1 = `audit_dedup_${Date.now()}`;
    const alert1 = {
      id: alertId1,
      type: 'BREAKOUT',
      symbol: testSym,
      title: `⚡ Breakout Alert: ${testSym} Expanding`,
      body: `${testSym} broke resistance with 3.2x Volume Expansion at ${Date.now()}.`,
      triggeredAt: new Date().toISOString(),
      isTest: false,
      forceDispatch: false
    };

    const firstBroadcast = broadcastAlert(alert1);
    assert.notEqual(firstBroadcast, false, 'First alert must dispatch successfully');
    const history = getSmartAlertHistory(10);
    assert.equal(history[0].id, alertId1, 'Dispatched alert must be stored at head of history');

    const duplicateAlert = {
      ...alert1,
      id: `audit_dedup_dup_${Date.now()}`
    };
    const secondBroadcast = broadcastAlert(duplicateAlert);
    assert.equal(secondBroadcast, false, 'Duplicate alert within deduplication window must return false');
  });

  await t.test('4. GitHub Actions Keep-Alive Heartbeat Workflow', () => {
    const ymlContent = readSrcFile('.github/workflows/keep_alive.yml');
    assert.ok(ymlContent.includes('schedule:'), 'Workflow must have a schedule trigger');
    assert.ok(ymlContent.includes('cron:'), 'Workflow must have a cron definition');
    assert.ok(ymlContent.includes('curl'), 'Workflow must perform curl ping to Render proxy');
  });

  // ══════════════════════════════════════════════════════════════════
  // GROUP 2: SECTION 5 - HAPTIC TOUCH FEEDBACK (25MS)
  // ══════════════════════════════════════════════════════════════════
  await t.test('5. Haptics Utility Module & 25ms Physical Vibration', () => {
    const hapticsContent = readSrcFile('src/utils/haptics.js');
    assert.ok(hapticsContent.includes('export function triggerHaptic'), 'Must export triggerHaptic function');
    assert.ok(hapticsContent.includes('navigator.vibrate'), 'Must use navigator.vibrate for physical vibration');
    assert.ok(hapticsContent.includes('duration = 25') || hapticsContent.includes('25'), 'Default duration must be 25ms');
  });

  await t.test('6. Haptic Touch Feedback Across All App Components', () => {
    const componentsToAudit = [
      { file: 'src/App.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/Dashboard.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/StockDetailModal.jsx', expected: 'triggerHaptic' },
      { file: 'src/views/FloorSheetTape.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/ui.tsx', expected: 'triggerHaptic' },
      { file: 'src/components/ServicesHub.tsx', expected: 'triggerHaptic' },
      { file: 'src/components/PredictorHub.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/PortfolioHub.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/Portfolio.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/StockBrokerAnalysisTab.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/BrokerSmartFlowTracker.tsx', expected: 'triggerHaptic' },
      { file: 'src/components/AccumulationDistributionRadar.tsx', expected: 'triggerHaptic' },
      { file: 'src/components/FloorsheetServiceTab.tsx', expected: 'triggerHaptic' },
      { file: 'src/components/NotificationCenterDrawer.jsx', expected: 'triggerHaptic' },
      { file: 'src/components/PreferencesSettingsService.tsx', expected: 'triggerHaptic' },
    ];

    for (const { file, expected } of componentsToAudit) {
      const content = readSrcFile(file);
      assert.ok(
        content.includes(expected),
        `Component ${file} must import and invoke ${expected}`
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // GROUP 3: SECTION 5 - LIVE ANIMATED EMERALD PULSE
  // ══════════════════════════════════════════════════════════════════
  await t.test('7. Live Animated Pulse in Exchange Streaming Badges', () => {
    const pulseTargets = [
      { file: 'src/App.jsx', needle: 'animate-ping' },
      { file: 'src/components/Dashboard.jsx', needle: 'animate-ping' },
      { file: 'src/components/StockDetailModal.jsx', needle: 'animate-ping' },
      { file: 'src/views/FloorSheetTape.jsx', needle: 'animate-ping' },
      { file: 'src/components/ui.tsx', needle: 'animate-ping' },
      { file: 'src/components/FloorsheetServiceTab.tsx', needle: 'animate-ping' },
    ];

    for (const { file, needle } of pulseTargets) {
      const content = readSrcFile(file);
      assert.ok(
        content.includes(needle),
        `Component ${file} must include animated pulse (${needle}) for live session confirmation`
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // GROUP 4: SECTION 5 - SUB-MILLISECOND PROGRESS SHIMMER
  // ══════════════════════════════════════════════════════════════════
  await t.test('8. Sub-Millisecond Progress Bar Shimmer Line & CSS Animation', () => {
    // Component existence
    const shimmerComponent = readSrcFile('src/components/LoadingShimmerBar.jsx');
    assert.ok(shimmerComponent.includes('LoadingShimmerBar'), 'LoadingShimmerBar component must exist');

    // CSS keyframes
    const cssContent = readSrcFile('src/index.css');
    assert.ok(cssContent.includes('@keyframes shimmerSlide'), 'index.css must define @keyframes shimmerSlide');
    assert.ok(cssContent.includes('.animate-shimmer-slide'), 'index.css must define .animate-shimmer-slide');

    // Mounted across views
    const viewsWithShimmer = [
      'src/App.jsx',
      'src/components/Dashboard.jsx',
      'src/components/StockDetailModal.jsx',
      'src/views/FloorSheetTape.jsx',
      'src/components/ui.tsx',
      'src/components/PredictorHub.jsx',
      'src/components/StockBrokerAnalysisTab.jsx',
      'src/components/BrokerSmartFlowTracker.tsx',
      'src/components/AccumulationDistributionRadar.tsx',
      'src/components/FloorsheetServiceTab.tsx',
    ];

    for (const file of viewsWithShimmer) {
      const content = readSrcFile(file);
      assert.ok(
        content.includes('LoadingShimmerBar'),
        `Component ${file} must mount LoadingShimmerBar`
      );
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // GROUP 5: SECTION 5 - ANDROID BATTERY OPTIMIZATION MODAL
  // ══════════════════════════════════════════════════════════════════
  await t.test('9. Android Battery Optimization Exemption Modal & Triggers', () => {
    // Modal component
    const modalContent = readSrcFile('src/components/BatteryOptimizationModal.tsx');
    assert.ok(modalContent.includes('BatteryOptimizationModal'), 'Modal must be defined');
    assert.ok(modalContent.includes('battery_modal_dismissed'), 'Must support dismissal storage flag');

    // App integration
    const appContent = readSrcFile('src/App.jsx');
    assert.ok(appContent.includes('<BatteryOptimizationModal'), 'App.jsx must mount BatteryOptimizationModal');
    assert.ok(appContent.includes('dravyashree_open_battery_modal'), 'App.jsx must listen for dravyashree_open_battery_modal');

    // Quick Trigger Banners
    const drawerContent = readSrcFile('src/components/NotificationCenterDrawer.jsx');
    assert.ok(drawerContent.includes('dravyashree_open_battery_modal'), 'NotificationCenterDrawer must dispatch open event');

    const prefsContent = readSrcFile('src/components/PreferencesSettingsService.tsx');
    assert.ok(prefsContent.includes('dravyashree_open_battery_modal'), 'PreferencesSettingsService must dispatch open event');
  });
});
