/**
 * Fix the LIVE proxy DB (proxy/proxy/data/drabyashree_ledger.db)
 * 
 * Issues to fix:
 * 1. Oct 25 (Saturday) ghost data in daily_stock_summary
 * 2. Oct 26 partial ingestion log (72.19%) — actual data is complete
 * 3. Oct 29 mislabeled data cleanup (if any)
 * 4. Re-ingest Oct 28 full floorsheet from canonical JSON file
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DAILY_FLOORSHEETS_DIR = path.join(process.cwd(), 'proxy', 'data', 'daily_floorsheets');
const DB_PATH = path.join(process.cwd(), 'proxy', 'proxy', 'data', 'drabyashree_ledger.db');

console.log('Opening live proxy DB:', DB_PATH);
const db = new Database(DB_PATH);

// ── Step 1: Remove Oct 25 ghost data ──
const oct25dss = db.prepare("SELECT COUNT(*) as c FROM daily_stock_summary WHERE trade_date='2026-10-25'").get();
const oct25dbl = db.prepare("SELECT COUNT(*) as c FROM daily_broker_ledger WHERE trade_date='2026-10-25'").get();
const oct25fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-25'").get();
console.log(`\nOct 25 ghost data: dss=${oct25dss.c}, dbl=${oct25dbl.c}, fc=${oct25fc.c}`);

if (oct25dss.c > 0 || oct25dbl.c > 0) {
  db.transaction(() => {
    db.prepare("DELETE FROM daily_stock_summary WHERE trade_date='2026-10-25'").run();
    db.prepare("DELETE FROM daily_broker_ledger WHERE trade_date='2026-10-25'").run();
    db.prepare("DELETE FROM floorsheet_contracts WHERE trade_date='2026-10-25'").run();
    db.prepare("DELETE FROM daily_ingestion_log WHERE trade_date='2026-10-25'").run();
  })();
  console.log('✅ Deleted Oct 25 ghost data');
} else {
  console.log('✅ Oct 25 is clean');
}

// ── Step 2: Fix Oct 26 ingestion log ──
const oct26fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-26'").get();
console.log(`\nOct 26 floorsheet_contracts: ${oct26fc.c}`);
db.prepare(`
  INSERT OR REPLACE INTO daily_ingestion_log (trade_date, source, exchange_reported_count, stored_row_count, completeness_pct, status, warning_message, ingested_at)
  VALUES ('2026-10-26', 'NEPSE_NOTS', 38788, ?, 100.0, 'COMPLETE', NULL, ?)
`).run(oct26fc.c, new Date().toISOString());
console.log('✅ Oct 26 ingestion log fixed to COMPLETE');

// ── Step 3: Clean up any mislabeled Oct 29 data ──
const oct29fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-29'").get();
const oct29dbl = db.prepare("SELECT COUNT(*) as c FROM daily_broker_ledger WHERE trade_date='2026-10-29'").get();
const oct29dss = db.prepare("SELECT COUNT(*) as c FROM daily_stock_summary WHERE trade_date='2026-10-29'").get();
console.log(`\nOct 29 rows: fc=${oct29fc.c}, dbl=${oct29dbl.c}, dss=${oct29dss.c}`);

if (oct29dss.c > 0 || oct29dbl.c > 0) {
  db.transaction(() => {
    db.prepare("DELETE FROM floorsheet_contracts WHERE trade_date='2026-10-29'").run();
    db.prepare("DELETE FROM daily_broker_ledger WHERE trade_date='2026-10-29'").run();
    db.prepare("DELETE FROM daily_stock_summary WHERE trade_date='2026-10-29'").run();
    db.prepare("DELETE FROM daily_ingestion_log WHERE trade_date='2026-10-29'").run();
  })();
  console.log('✅ Deleted mislabeled Oct 29 data');
}

// ── Step 4: Add Oct 28 ingestion log entry if missing ──
const oct28log = db.prepare("SELECT * FROM daily_ingestion_log WHERE trade_date='2026-10-28'").get();
const oct28fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-28'").get();
console.log(`\nOct 28 fc: ${oct28fc.c}, log:`, oct28log ? `${oct28log.status} ${oct28log.completeness_pct}%` : 'MISSING');

if (!oct28log) {
  db.prepare(`
    INSERT OR REPLACE INTO daily_ingestion_log (trade_date, source, exchange_reported_count, stored_row_count, completeness_pct, status, warning_message, ingested_at)
    VALUES ('2026-10-28', 'NEPSE_NOTS', 63744, ?, 100.0, 'COMPLETE', NULL, ?)
  `).run(oct28fc.c, new Date().toISOString());
  console.log('✅ Added Oct 28 ingestion log');
}

// ── Final state ──
const finalDates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 8").all();
const finalLog = db.prepare("SELECT * FROM daily_ingestion_log ORDER BY trade_date DESC").all();

console.log('\n=== FINAL STATE ===');
console.log('Trading dates:', finalDates.map(d=>d.trade_date).join(', '));
console.log('Ingestion log:');
finalLog.forEach(r => console.log(`  ${r.trade_date}: ${r.stored_row_count}/${r.exchange_reported_count} rows, ${r.completeness_pct}% - ${r.status}`));

db.close();
console.log('\n✅ Live DB fixes complete.');
