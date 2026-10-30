import Database from 'better-sqlite3';
import path from 'path';

// The proxy runs from proxy/ dir, so it resolves to proxy/proxy/data/
const db = new Database(path.join('proxy/proxy/data/drabyashree_ledger.db'));

const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 10").all();
const oct29fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-29'").get();
const oct29dbl = db.prepare("SELECT COUNT(*) as c FROM daily_broker_ledger WHERE trade_date='2026-10-29'").get();
const oct28fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-28'").get();
const oct26fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-26'").get();
const oct25fc = db.prepare("SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date='2026-10-25'").get();
const ingestLog = db.prepare("SELECT * FROM daily_ingestion_log ORDER BY trade_date DESC").all();

console.log('=== proxy/proxy/data DB (LIVE PROXY DB) ===');
console.log('Top 10 trading dates:', dates.map(d=>d.trade_date).join(', '));
console.log('Oct 29 - fc:', oct29fc.c, '| dbl:', oct29dbl.c);
console.log('Oct 28 - fc:', oct28fc.c);
console.log('Oct 26 - fc:', oct26fc.c);
console.log('Oct 25 - fc:', oct25fc.c, '(should be 0, Saturday)');
console.log('\nIngestion log:');
ingestLog.forEach(r => console.log(`  ${r.trade_date}: ${r.stored_row_count}/${r.exchange_reported_count} rows, ${r.completeness_pct}% - ${r.status}`));

db.close();
