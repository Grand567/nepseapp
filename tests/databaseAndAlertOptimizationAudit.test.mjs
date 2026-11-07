// tests/databaseAndAlertOptimizationAudit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../proxy/db/ledgerStore.js';
import { broadcastAlert, getSmartAlertHistory } from '../proxy/smartAlertEngine.mjs';

test('Database, Query Performance & Smart Alert Deduplication Verification', async (t) => {
  await t.test('1. SQLite WAL Mode, 64MB Page Cache & Sub-10ms Benchmarks', () => {
    // A. PRAGMA Verification
    const journalMode = db.pragma('journal_mode', { simple: true });
    const synchronous = db.pragma('synchronous', { simple: true });
    const cacheSize = db.pragma('cache_size', { simple: true });
    const busyTimeout = db.pragma('busy_timeout', { simple: true });

    assert.equal(journalMode.toLowerCase(), 'wal', 'journal_mode must be WAL');
    assert.equal(synchronous, 1, 'synchronous must be 1 (NORMAL)');
    assert.equal(cacheSize, -64000, 'cache_size must be -64000 (64MB in-memory page cache)');
    assert.ok(busyTimeout >= 10000, 'busy_timeout must be >= 10,000ms');

    // B. Index Verification
    const indexes = db.prepare('PRAGMA index_list(floorsheet_contracts)').all();
    const hasSymDateIndex = indexes.some(idx => idx.name === 'idx_fs_contracts_sym_date');
    assert.ok(hasSymDateIndex, 'Composite index idx_fs_contracts_sym_date must exist');

    // C. 1D Query Benchmark (< 10 ms)
    const t0 = performance.now();
    const rows1D = db.prepare('SELECT * FROM floorsheet_contracts WHERE symbol = ? AND trade_date = ?').all('AKJCL', '2026-11-06');
    const t1 = performance.now();
    const q1dMs = t1 - t0;
    assert.equal(rows1D.length, 360, '1D query must return all 360 AKJCL contracts');
    assert.ok(q1dMs < 10, `1D query must execute in sub-10ms, executed in ${q1dMs.toFixed(2)}ms`);

    // D. 5D Query Benchmark (< 10 ms steady-state)
    const recent5 = db.prepare('SELECT DISTINCT trade_date FROM floorsheet_contracts ORDER BY trade_date DESC LIMIT 5').all().map(r => r.trade_date);
    const placeholders5 = recent5.map(() => '?').join(',');
    const stmt5D = db.prepare(`SELECT * FROM floorsheet_contracts WHERE symbol = ? AND trade_date IN (${placeholders5})`);
    stmt5D.all('AKJCL', ...recent5); // warm-up VDBE opcode execution plan
    const t2 = performance.now();
    const rows5D = stmt5D.all('AKJCL', ...recent5);
    const t3 = performance.now();
    const q5dMs = t3 - t2;
    assert.ok(rows5D.length >= 360, '5D query must return multi-session contracts');
    assert.ok(q5dMs < 10, `5D query must execute in sub-10ms, executed in ${q5dMs.toFixed(2)}ms`);

    // E. 30D Query Benchmark (< 10 ms steady-state)
    const recent30 = db.prepare('SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC LIMIT 30').all().map(r => r.trade_date);
    const placeholders30 = recent30.map(() => '?').join(',');
    const stmt30D = db.prepare(`SELECT * FROM daily_broker_ledger WHERE symbol = ? AND trade_date IN (${placeholders30})`);
    stmt30D.all('AKJCL', ...recent30); // warm-up
    const t4 = performance.now();
    const rows30D = stmt30D.all('AKJCL', ...recent30);
    const t5 = performance.now();
    const q30dMs = t5 - t4;
    assert.ok(rows30D.length > 0, '30D query must return broker ledger entries');
    assert.ok(q30dMs < 10, `30D query must execute in sub-10ms, executed in ${q30dMs.toFixed(2)}ms`);
  });

  await t.test('2. Smart Alert Engine Deduplication & Immediate Session Dispatch', () => {
    const testSym = `SYM_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const alertId1 = `audit_alert_breakout_${Date.now()}`;
    const alert1 = {
      id: alertId1,
      type: 'BREAKOUT',
      symbol: testSym,
      title: `⚡ Breakout Alert: ${testSym} Expanding`,
      body: `${testSym} broke resistance Rs. 540 with 3.2x Volume Expansion at ${Date.now()}.`,
      triggeredAt: new Date().toISOString(),
      isTest: false,
      forceDispatch: false
    };

    // First alert must dispatch immediately
    const dispatched1 = broadcastAlert(alert1);
    assert.notEqual(dispatched1, false, 'First alert must dispatch successfully');
    const history = getSmartAlertHistory(10);
    assert.equal(history[0].id, alertId1, 'Dispatched alert must be stored at head of history');

    // Duplicate alert for same symbol and type must be suppressed
    const alertIdDuplicate = `audit_alert_breakout_dup_${Date.now()}`;
    const alertDuplicate = {
      ...alert1,
      id: alertIdDuplicate
    };
    const dispatchedDup = broadcastAlert(alertDuplicate);
    assert.equal(dispatchedDup, false, 'Duplicate alert within 45m window must be suppressed');

    // Alert for different stock must dispatch immediately
    const testSym2 = `DIFF_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const alertId2 = `audit_alert_whale_${Date.now()}`;
    const alert2 = {
      id: alertId2,
      type: 'ACCUMULATION',
      symbol: testSym2,
      title: `🐋 Stealth Whale Accumulation: ${testSym2}`,
      body: `Whale Broker #58 accumulated +25,000 kitta in quiet base for ${testSym2}.`,
      triggeredAt: new Date().toISOString(),
      isTest: false,
      forceDispatch: false
    };
    const dispatched2 = broadcastAlert(alert2);
    assert.notEqual(dispatched2, false, 'Different symbol alert must dispatch immediately');
    const updatedHistory = getSmartAlertHistory(10);
    assert.equal(updatedHistory[0].id, alertId2, 'Alert 2 must be stored at head');
  });

  await t.test('3. GitHub Actions 10-Minute Keep-Alive Heartbeat Workflow', () => {
    const workflowPath = path.resolve('.github/workflows/keep_alive.yml');
    assert.ok(fs.existsSync(workflowPath), '.github/workflows/keep_alive.yml must exist');

    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.ok(content.includes("cron: '*/10 * * * *'"), 'Workflow must run on 10-minute cron');
    assert.ok(content.includes('/api/ping'), 'Workflow must ping /api/ping endpoint');
    assert.ok(content.includes('/api/health'), 'Workflow must ping /api/health endpoint');
    assert.ok(content.includes('nepseapp.onrender.com'), 'Workflow must target nepseapp.onrender.com');
  });
});
