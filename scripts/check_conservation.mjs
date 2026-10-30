import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join('proxy', 'proxy', 'data', 'drabyashree_ledger.db'));

// Check cross vs non-cross for the backfilled sessions
const backfilled = ['2026-10-14','2026-10-13','2026-10-12','2026-10-08','2026-10-01','2026-09-28'];
console.log('Conservation check (excl. internal cross trades):');
for (const d of backfilled) {
  const fcNoCross = db.prepare("SELECT SUM(kitta) as v FROM floorsheet_contracts WHERE trade_date=? AND is_internal_cross=0").get(d)?.v || 0;
  const fcAll     = db.prepare("SELECT SUM(kitta) as v FROM floorsheet_contracts WHERE trade_date=?").get(d)?.v || 0;
  const dbl       = db.prepare("SELECT SUM(buy_vol) as v FROM daily_broker_ledger WHERE trade_date=?").get(d)?.v || 0;
  const match     = fcNoCross === dbl ? '✅' : '⚠️ ';
  console.log(`  ${d}: fc_all=${fcAll}  fc_no_cross=${fcNoCross}  broker_ledger=${dbl}  ${match}`);
}

// Sessions still with 0 contracts — need to fetch from API
const still_missing = db.prepare(`
  SELECT s.trade_date d
  FROM daily_stock_summary s
  WHERE NOT EXISTS (SELECT 1 FROM floorsheet_contracts f WHERE f.trade_date=s.trade_date)
  ORDER BY s.trade_date DESC
`).all().map(r => r.d);

console.log(`\nSessions still missing contracts (${still_missing.length}):`);
console.log(still_missing.join(', '));

db.close();
