import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
console.log('PHASE 1 TDD: BACKEND SQLITE INTEGRITY & EOD PARITY VERIFICATION');
console.log('==============================================================\n');

// Isolate a temporary workspace copy so schema/function tests never pollute real workspace DB
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nepse-phase1-tdd-'));
const realDbPath = path.join(ROOT, 'proxy/data/drabyashree_ledger.db');
const tmpDbPath = path.join(TMP_DIR, 'drabyashree_ledger.db');
const realGzPath = path.join(ROOT, 'proxy/data/drabyashree_ledger.db.gz');
fs.copyFileSync(realDbPath, tmpDbPath);
if (fs.existsSync(realGzPath)) {
  const s = fs.statSync(realGzPath);
  fs.writeFileSync(`${tmpDbPath}.gz.applied`, `${s.size}:${Math.trunc(s.mtimeMs || 0)}`, 'utf8');
}
process.env.NEPSE_DATA_DIR = TMP_DIR;
process.env.NEPSE_SKIP_STATIC_EXPORTS = '1';

const Database = (await import('../proxy/node_modules/better-sqlite3/lib/index.js')).default;
const ledgerStore = await import('../proxy/db/ledgerStore.js');
const { ingestContractsToLedger } = await import('../proxy/utils/dailyFloorsheetCollector.mjs');
const { runEodReconciliation } = await import('../proxy/utils/eodReconciliationEngine.mjs');
const workersSrc = fs.readFileSync(path.join(ROOT, 'proxy/workers.mjs'), 'utf8');
const brokerVaultSrc = fs.readFileSync(path.join(ROOT, 'proxy/brokerVault.mjs'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'proxy/server.mjs'), 'utf8');
const ledgerSrc = fs.readFileSync(path.join(ROOT, 'proxy/db/ledgerStore.js'), 'utf8');
const collectorSrc = fs.readFileSync(path.join(ROOT, 'proxy/utils/dailyFloorsheetCollector.mjs'), 'utf8');

try {
  // ── 1. Live workspace SQLite DB must not contain 2026-11-24 35.46% mismatch or poisoned 2026-11-25 ──
  await test('[P1-01] Workspace drabyashree_ledger.db 2026-11-24 SHL volume matches floorsheet_contracts (565,990) & variance < 5%', () => {
    const liveDb = new Database(realDbPath, { readonly: true });
    try {
      const shlFc = liveDb.prepare(`SELECT SUM(kitta) as k FROM floorsheet_contracts WHERE trade_date = '2026-11-24' AND symbol = 'SHL' AND COALESCE(is_quarantined, 0) = 0`).get();
      const shlDss = liveDb.prepare(`SELECT total_volume as v FROM daily_stock_summary WHERE trade_date = '2026-11-24' AND symbol = 'SHL' AND COALESCE(is_quarantined, 0) = 0`).get();
      assert.strictEqual(shlDss?.v, shlFc?.k, `2026-11-24 SHL summary volume (${shlDss?.v}) must match floorsheet_contracts (${shlFc?.k})`);

      const fcTotal = liveDb.prepare(`SELECT SUM(kitta) as k FROM floorsheet_contracts WHERE trade_date = '2026-11-24' AND COALESCE(is_quarantined, 0) = 0`).get()?.k || 0;
      const dssTotal = liveDb.prepare(`SELECT SUM(total_volume) as v FROM daily_stock_summary WHERE trade_date = '2026-11-24' AND COALESCE(is_quarantined, 0) = 0`).get()?.v || 0;
      const diffRatio = Math.abs(fcTotal - dssTotal) / Math.max(1, dssTotal);
      assert.ok(diffRatio < 0.05, `2026-11-24 total volume variance (${(diffRatio * 100).toFixed(2)}%) must be < 5%`);
    } finally {
      liveDb.close();
    }
  });

  await test('[P1-02] Workspace drabyashree_ledger.db does not treat masked 193-row 2026-11-25 as VALID EOD or 100% benchmark', () => {
    const liveDb = new Database(realDbPath, { readonly: true });
    try {
      const bench = liveDb.prepare(`SELECT * FROM official_exchange_benchmarks WHERE trade_date = '2026-11-25'`).get();
      if (bench) {
        assert.ok(bench.total_transactions >= 1000 && !String(bench.source).includes('100%'), `2026-11-25 benchmark cannot claim 100% on 193 rows: ${JSON.stringify(bench)}`);
      }
      const partialUnquarantined = liveDb.prepare(`
        SELECT COUNT(*) as c FROM floorsheet_contracts
        WHERE trade_date = '2026-11-25' AND (buyer_broker <= 0 OR seller_broker <= 0) AND COALESCE(is_quarantined, 0) = 0
      `).get()?.c || 0;
      assert.strictEqual(partialUnquarantined, 0, `2026-11-25 masked (broker=0) rows must be cleaned/quarantined, found ${partialUnquarantined}`);
    } finally {
      liveDb.close();
    }
  });

  // ── 2. ingestContractsToLedger must reject masked 0/0 broker contracts ─────
  await test('[P1-03] ingestContractsToLedger rejects masked (buyer=0, seller=0) intraday rows from corrupting EOD tables', () => {
    const maskedBatch = Array.from({ length: 50 }, (_, i) => ({
      contractId: `20991125-MASK-${i}`,
      stockSymbol: i % 2 === 0 ? 'SHEL' : 'NABIL',
      businessDate: '2099-11-25',
      tradeTime: '11:05:00',
      buyerBroker: 0,
      sellerBroker: 0,
      qty: 100,
      rate: 500,
      amount: 50000
    }));
    const count = ingestContractsToLedger('2099-11-25', maskedBatch);
    assert.strictEqual(count, 0, `Masked intraday batch (0 valid brokers) must insert 0 EOD rows, inserted ${count}`);
    const dssCount = ledgerStore.db.prepare(`SELECT COUNT(*) as c FROM daily_stock_summary WHERE trade_date = '2099-11-25'`).get()?.c || 0;
    assert.strictEqual(dssCount, 0, `Masked intraday batch must not write partial daily_stock_summary, wrote ${dssCount}`);
  });

  // ── 3. ingestDailyStockPrices must not overwrite higher verified full-tape volume ─
  await test('[P1-04] ingestDailyStockPrices does not overwrite higher verified floorsheet-backed volume with partial snapshot', () => {
    ledgerStore.db.prepare(`DELETE FROM daily_stock_summary WHERE trade_date = '2099-11-24'`).run();
    ledgerStore.db.prepare(`
      INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover, is_quarantined, calendar_status, tape_scope, source)
      VALUES ('2099-11-24', 'SHL', 395, 410, 390, 405, 565990, 226396000, 0, 'VALID', 'FULL_TAPE', 'DAILY_COLLECTOR')
    `).run();

    ledgerStore.ingestDailyStockPrices('2099-11-24', [
      { symbol: 'SHL', open: 395, high: 400, low: 392, ltp: 398, volume: 28914, turnover: 11507772 }
    ]);

    const after = ledgerStore.db.prepare(`SELECT total_volume, close_price FROM daily_stock_summary WHERE trade_date = '2099-11-24' AND symbol = 'SHL'`).get();
    assert.strictEqual(after.total_volume, 565990, `ingestDailyStockPrices must preserve verified 565990 volume over smaller partial 28914, got ${after.total_volume}`);
  });

  // ── 4. eodReconciliationEngine must NOT stamp Parity: 100% on masked/partial <1000 sessions ─
  await test('[P1-05] reconcileSessionEodParity flags partial/masked sessions instead of stamping 100% Parity into benchmarks', () => {
    ledgerStore.db.prepare(`DELETE FROM floorsheet_contracts WHERE trade_date = '2099-11-26'`).run();
    ledgerStore.db.prepare(`DELETE FROM daily_stock_summary WHERE trade_date = '2099-11-26'`).run();
    ledgerStore.db.prepare(`DELETE FROM official_exchange_benchmarks WHERE trade_date = '2099-11-26'`).run();
    ledgerStore.db.prepare(`
      INSERT INTO floorsheet_contracts (contract_no, symbol, trade_date, buyer_broker, seller_broker, kitta, rate, amount, is_quarantined, calendar_status)
      VALUES ('C-MASK-1', 'SHEL', '2099-11-26', 0, 0, 500, 350, 175000, 0, 'VALID')
    `).run();
    ledgerStore.db.prepare(`
      INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover, is_quarantined, calendar_status)
      VALUES ('2099-11-26', 'SHEL', 350, 350, 350, 350, 500, 175000, 0, 'VALID')
    `).run();

    const res = runEodReconciliation('2099-11-26');
    assert.notStrictEqual(res.status, 'CERTIFIED_AUTHENTIC', '1-contract masked session must never be certified 100% authentic');
    assert.strictEqual(res.parityPercentage, 0, 'Incomplete/masked parity must be 0%, not 100%');
    const bench = ledgerStore.db.prepare(`SELECT * FROM official_exchange_benchmarks WHERE trade_date = '2099-11-26'`).get();
    assert.strictEqual(bench, undefined, 'Must not insert incomplete/masked session into official_exchange_benchmarks');
  });

  // ── 5. Collector, Vault, Server, Worker & Cache Static Invariants ─────────
  await test('[P1-06] Collectors, MemoryGuard, Postgres NPT & SQLite quarantine guards are properly wired', () => {
    assert.ok(!/if \(postHeapMb > MAX_LIVE_HEAP_MB \|\| postRssMb > MAX_LIVE_RSS_MB\)/.test(workersSrc) || workersSrc.includes('IS_RENDER_CONSTRAINED') || workersSrc.includes('process.env.RENDER'),
      'MemoryGuard must only enforce tiny 205/385MB cap on constrained Render environments, not pause desktop workers');
    assert.ok(!workersSrc.includes('WHERE traded_date = CURRENT_DATE'),
      'aggregateFloorsheetData Postgres query must use Asia/Kathmandu NPT date instead of UTC CURRENT_DATE');
    assert.ok(!/lastPostMarketSessionAnalyzed = targetDate;\s*\}\s*catch/.test(workersSrc),
      'runPostMarketCloseAnalysis must verify daily_broker_ledger ingestion succeeded before locking lastPostMarketSessionAnalyzed');
    assert.ok(collectorSrc.includes('fileHasValidBrokers') || collectorSrc.includes('buyer_broker > 0'),
      'dailyFloorsheetCollector must verify cached files have valid broker IDs and >= minimum EOD contracts');
    assert.ok(brokerVaultSrc.includes('buyer_broker > 0') || brokerVaultSrc.includes('is_quarantined'),
      'brokerVault SQLite fallback must filter quarantined / masked rows');
    assert.ok(serverSrc.includes('daily_broker_ledger') && serverSrc.includes('Number(a.tradeCount || 0) >= 1000'),
      'auto-archiver in server.mjs must require >= 1000 valid contracts and broker ledger rows');
    assert.ok(/FROM daily_stock_summary\s+WHERE trade_date >= \?\s+AND COALESCE\(is_quarantined,\s*0\)\s*=\s*0/.test(ledgerSrc),
      'rebuildHotCache in ledgerStore.js must filter out is_quarantined rows');
  });
} finally {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\n==============================================================`);
console.log(` PHASE 1 TDD RESULTS: ${passed} passed, ${failed} failed`);
console.log(`==============================================================\n`);
if (failed > 0) process.exit(1);
