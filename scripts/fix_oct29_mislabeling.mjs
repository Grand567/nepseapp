/**
 * Fix Script: Clean up mislabeled Oct 29 data
 * 
 * The dailyFloorsheetCollector saved Oct 28's floorsheet data with the label "2026-10-29"
 * (savedAt: 2026-10-28T11:33:49.830Z). This means:
 * - daily_broker_ledger has 12,655 rows for 2026-10-29 (actually Oct 28 data)
 * - daily_stock_summary has 290 rows for 2026-10-29 (actually Oct 28 data)
 * - floorsheet_contracts has 0 rows for 2026-10-29 (ingest failed)
 * - The JSON file proxy/data/daily_floorsheets/floorsheet-2026-10-29.json contains Oct 28 data
 * 
 * This script:
 * 1. Detects the mislabeling by comparing the embedded businessDate in the JSON file
 * 2. Removes the mislabeled Oct 29 rows from all 3 tables
 * 3. Deletes the mislabeled JSON + .gz files
 * 4. Updates the archive index to remove the fake Oct 29 entry
 * 5. Verifies Oct 28 data is intact (the correct data)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DAILY_FLOORSHEETS_DIR = path.join(process.cwd(), 'proxy', 'data', 'daily_floorsheets');
const JSON_FILE = path.join(DAILY_FLOORSHEETS_DIR, 'floorsheet-2026-10-29.json');
const GZ_FILE = path.join(DAILY_FLOORSHEETS_DIR, 'floorsheet-2026-10-29.json.gz');
const INDEX_FILE = path.join(DAILY_FLOORSHEETS_DIR, 'archive_index.json');
const DB_PATH = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');

const db = new Database(DB_PATH);

console.log('=== Fix: Mislabeled Oct 29 Data Cleanup ===\n');

// Step 1: Verify mislabeling
if (fs.existsSync(JSON_FILE)) {
  const trades = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  const sample = trades[0];
  const embeddedDate = String(sample?.businessDate || sample?.trade_date || '').split('T')[0].trim();
  console.log(`JSON file first trade businessDate: ${embeddedDate}`);
  console.log(`Expected date label: 2026-10-29`);
  
  if (embeddedDate === '2026-10-28' || embeddedDate !== '2026-10-29') {
    console.log(`\n⚠️  MISLABELING CONFIRMED: File contains ${embeddedDate} data, labeled as 2026-10-29`);
    
    // Step 2: Count rows to be deleted
    const fcCount = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-29'").get();
    const dblCount = db.prepare("SELECT COUNT(*) as c FROM daily_broker_ledger WHERE trade_date='2026-10-29'").get();
    const dssCount = db.prepare("SELECT COUNT(*) as c FROM daily_stock_summary WHERE trade_date='2026-10-29'").get();
    
    console.log(`\nRows to delete from DB:`);
    console.log(`  floorsheet_contracts: ${fcCount.c}`);
    console.log(`  daily_broker_ledger: ${dblCount.c}`);
    console.log(`  daily_stock_summary: ${dssCount.c}`);
    
    // Step 3: Delete mislabeled rows
    const del = db.transaction(() => {
      db.prepare("DELETE FROM floorsheet_contracts WHERE trade_date='2026-10-29'").run();
      db.prepare("DELETE FROM daily_broker_ledger WHERE trade_date='2026-10-29'").run();
      db.prepare("DELETE FROM daily_stock_summary WHERE trade_date='2026-10-29'").run();
      db.prepare("DELETE FROM daily_ingestion_log WHERE trade_date='2026-10-29'").run();
    });
    del();
    console.log(`\n✅ Deleted all mislabeled 2026-10-29 rows from DB`);
    
    // Step 4: Delete mislabeled JSON file
    try { fs.unlinkSync(JSON_FILE); console.log(`✅ Deleted mislabeled JSON: ${JSON_FILE}`); } catch (e) { console.warn('Could not delete JSON:', e.message); }
    try { if (fs.existsSync(GZ_FILE)) { fs.unlinkSync(GZ_FILE); console.log(`✅ Deleted mislabeled GZ: ${GZ_FILE}`); } } catch (e) {}
    
    // Step 5: Update archive index - remove fake Oct 29 entry
    if (fs.existsSync(INDEX_FILE)) {
      const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      const filtered = index.filter(e => e.date !== '2026-10-29');
      fs.writeFileSync(INDEX_FILE, JSON.stringify(filtered, null, 2), 'utf8');
      console.log(`✅ Archive index updated (removed fake Oct 29 entry)`);
    }
    
    // Step 6: Verify Oct 28 data is intact
    const oct28fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-28'").get();
    const oct28dbl = db.prepare("SELECT COUNT(*) as c FROM daily_broker_ledger WHERE trade_date='2026-10-28'").get();
    const oct28dss = db.prepare("SELECT COUNT(*) as c FROM daily_stock_summary WHERE trade_date='2026-10-28'").get();
    
    console.log(`\nOct 28 data integrity (should be intact):`);
    console.log(`  floorsheet_contracts: ${oct28fc.c} (expected: ~63,744)`);
    console.log(`  daily_broker_ledger: ${oct28dbl.c} (expected: ~12,655)`);
    console.log(`  daily_stock_summary: ${oct28dss.c} (expected: ~290)`);
    
    console.log(`\n=== CLEANUP COMPLETE ===`);
    console.log(`Oct 29 data will be available after NEPSE closes today (~3:00–3:30 PM NPT)`);
    console.log(`The proxy will auto-ingest it, or manually trigger: POST /api/sync/floorsheet?date=2026-10-29`);
  } else {
    console.log(`✅ No mislabeling detected — file contains correct 2026-10-29 data`);
  }
} else {
  console.log(`No Oct 29 JSON file found — already clean or not yet downloaded`);
}

db.close();
