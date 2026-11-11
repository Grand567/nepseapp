import Database from 'better-sqlite3';
const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });

function showCols(table) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
  console.log(`--- Columns of ${table} ---`);
  console.log(cols.map(c => `${c.name} (${c.type})`).join(', '));
}

showCols('daily_stock_summary');
showCols('daily_broker_ledger');
showCols('floorsheet_contracts');
showCols('scrip_fundamentals');

const latestDates = db.prepare("SELECT DISTINCT date FROM daily_stock_summary ORDER BY date DESC LIMIT 15").all();
console.log('\nLatest dates in daily_stock_summary:', latestDates.map(d => d.date));
