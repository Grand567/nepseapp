/**
 * Check Oct 26 file: how many contracts does it have vs what's in DB?
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DAILY_FLOORSHEETS_DIR = path.join(process.cwd(), 'proxy', 'data', 'daily_floorsheets');
const DB_PATH = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');

const db = new Database(DB_PATH);

const jsonFile = path.join(DAILY_FLOORSHEETS_DIR, 'floorsheet-2026-10-26.json');
const trades = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
console.log(`Oct 26 JSON file contracts: ${trades.length}`);

const fcCount = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-26'").get();
const dblCount = db.prepare("SELECT COUNT(*) as c FROM daily_broker_ledger WHERE trade_date='2026-10-26'").get();
const dssCount = db.prepare("SELECT COUNT(*) as c FROM daily_stock_summary WHERE trade_date='2026-10-26'").get();
const ingestLog = db.prepare("SELECT * FROM daily_ingestion_log WHERE trade_date='2026-10-26'").get();

console.log(`\nOct 26 DB counts:`);
console.log(`  floorsheet_contracts: ${fcCount.c}`);
console.log(`  daily_broker_ledger: ${dblCount.c}`);
console.log(`  daily_stock_summary: ${dssCount.c}`);
console.log(`\nIngestion log:`, JSON.stringify(ingestLog));

// Sample first trade
const sample = trades[0];
const embeddedDate = String(sample?.businessDate || sample?.trade_date || '').split('T')[0].trim();
console.log(`\nFirst trade businessDate: ${embeddedDate}`);

db.close();
