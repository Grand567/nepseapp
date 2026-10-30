/**
 * audit_all_tables.mjs
 * Full audit of all tables in the live proxy DB:
 * - daily_stock_summary
 * - daily_broker_ledger
 * - floorsheet_contracts
 * - daily_ingestion_log
 * - Any other tables
 */
import Database from 'better-sqlite3';

const db = new Database('proxy/proxy/data/drabyashree_ledger.db', { readonly: true });

// 1. List ALL tables
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all().map(r => r.name);
console.log('='.repeat(70));
console.log('ALL TABLES IN DB:', tables.join(', '));
console.log('='.repeat(70));

// 2. Row counts per table
console.log('\n📦 ROW COUNTS PER TABLE:');
for (const t of tables) {
  try {
    const cnt = db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get().c;
    console.log(`  ${t.padEnd(35)} ${String(cnt).padStart(10)} rows`);
  } catch(e) {
    console.log(`  ${t.padEnd(35)} ERROR: ${e.message}`);
  }
}

// 3. Trading date coverage per table
const tradingDateTables = ['daily_stock_summary', 'daily_broker_ledger', 'floorsheet_contracts', 'daily_ingestion_log'];
console.log('\n📅 TRADING DATE COVERAGE:');
for (const t of tradingDateTables) {
  if (!tables.includes(t)) { console.log(`  ${t}: NOT FOUND`); continue; }
  try {
    const r = db.prepare(`SELECT COUNT(DISTINCT trade_date) as d, MIN(trade_date) as earliest, MAX(trade_date) as latest FROM "${t}"`).get();
    console.log(`  ${t.padEnd(35)} ${String(r.d).padStart(3)} dates  [${r.earliest} → ${r.latest}]`);
  } catch(e) {
    console.log(`  ${t}: ERROR: ${e.message}`);
  }
}

// 4. Check which sessions are missing in each table vs the reference set
const allDates = db.prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC`).all().map(r => r.trade_date);
console.log(`\n🗓️  REFERENCE: ${allDates.length} trading sessions (${allDates[allDates.length-1]} → ${allDates[0]})`);

function getMissingDates(table) {
  if (!tables.includes(table)) return ['TABLE NOT FOUND'];
  try {
    const present = db.prepare(`SELECT DISTINCT trade_date FROM "${table}"`).all().map(r => r.trade_date);
    return allDates.filter(d => !present.includes(d));
  } catch(e) { return [`ERROR: ${e.message}`]; }
}

const checkTables = ['daily_broker_ledger', 'floorsheet_contracts'];
for (const t of checkTables) {
  const missing = getMissingDates(t);
  const status = missing.length === 0 ? '✅ ALL PRESENT' : `❌ MISSING ${missing.length}: ${missing.join(', ')}`;
  console.log(`\n  ${t}: ${status}`);
}

// 5. Ingestion log status
console.log('\n📋 INGESTION LOG STATUS:');
if (tables.includes('daily_ingestion_log')) {
  const logs = db.prepare(`SELECT trade_date, status, completeness_pct, warning_message FROM daily_ingestion_log ORDER BY trade_date DESC`).all();
  console.log('  Date         | Status            | Complete% | Warning');
  console.log('  -------------|-------------------|-----------|--------');
  for (const l of logs) {
    const warn = l.warning_message ? l.warning_message.slice(0,50) : '';
    console.log(`  ${l.trade_date} | ${String(l.status||'').padEnd(17)} | ${String((l.completeness_pct||0).toFixed(1)).padStart(8)}% | ${warn}`);
  }
} else {
  console.log('  daily_ingestion_log table not found');
}

// 6. Check stock coverage per session (are all stocks present each day?)
console.log('\n📊 STOCK COVERAGE IN daily_stock_summary:');
const stockPerDay = db.prepare(`SELECT trade_date, COUNT(DISTINCT symbol) as stocks FROM daily_stock_summary GROUP BY trade_date ORDER BY trade_date DESC`).all();
const avgStocks = Math.round(stockPerDay.reduce((s,r) => s + r.stocks, 0) / stockPerDay.length);
const lowDays = stockPerDay.filter(r => r.stocks < avgStocks * 0.8);
console.log(`  Average stocks/day: ${avgStocks}`);
console.log(`  Days with <80% of avg stocks: ${lowDays.length}`);
if (lowDays.length > 0) {
  for (const d of lowDays) console.log(`    ⚠️  ${d.trade_date}: only ${d.stocks} stocks`);
}

// 7. Check broker coverage per session
console.log('\n🏦 BROKER COVERAGE IN daily_broker_ledger:');
const brokerPerDay = db.prepare(`SELECT trade_date, COUNT(DISTINCT broker_id) as brokers FROM daily_broker_ledger GROUP BY trade_date ORDER BY trade_date DESC`).all();
const avgBrokers = Math.round(brokerPerDay.reduce((s,r) => s + r.brokers, 0) / brokerPerDay.length);
const lowBrokerDays = brokerPerDay.filter(r => r.brokers < avgBrokers * 0.8);
console.log(`  Average brokers/day: ${avgBrokers}`);
console.log(`  Days with <80% of avg brokers: ${lowBrokerDays.length}`);
if (lowBrokerDays.length > 0) {
  for (const d of lowBrokerDays) console.log(`    ⚠️  ${d.trade_date}: only ${d.brokers} brokers`);
}

// 8. Check any other non-standard tables
const otherTables = tables.filter(t => !tradingDateTables.includes(t) && !['sqlite_sequence'].includes(t));
if (otherTables.length > 0) {
  console.log('\n📁 OTHER TABLES (schema preview):');
  for (const t of otherTables) {
    try {
      const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
      const cnt = db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get().c;
      console.log(`  ${t} (${cnt} rows): ${cols.join(', ')}`);
    } catch(e) {
      console.log(`  ${t}: ERROR: ${e.message}`);
    }
  }
}

console.log('\n' + '='.repeat(70));
console.log('AUDIT COMPLETE');
console.log('='.repeat(70));
db.close();
