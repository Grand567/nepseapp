/**
 * fix_exchange_benchmarks.mjs
 * 
 * Fetches missing official_exchange_benchmarks rows for Oct 27, 28, 29
 * from the proxy's own aggregated floorsheet data (since NEPSE PDF isn't
 * machine-readable). Uses daily_stock_summary + floorsheet_contracts as source.
 * 
 * Usage: node scripts/fix_exchange_benchmarks.mjs
 */

import Database from 'better-sqlite3';

const DB_PATH = 'proxy/proxy/data/drabyashree_ledger.db';
const db = new Database(DB_PATH);

// Find dates in daily_stock_summary that are missing from official_exchange_benchmarks
const missing = db.prepare(`
  SELECT DISTINCT s.trade_date
  FROM daily_stock_summary s
  WHERE NOT EXISTS (
    SELECT 1 FROM official_exchange_benchmarks o WHERE o.trade_date = s.trade_date
  )
  ORDER BY s.trade_date DESC
`).all().map(r => r.trade_date);

console.log('='.repeat(60));
console.log('FIX: official_exchange_benchmarks');
console.log('='.repeat(60));
console.log(`Missing dates: ${missing.length}`);
if (missing.length === 0) {
  console.log('✅ All up to date!');
  db.close();
  process.exit(0);
}

const upsert = db.prepare(`
  INSERT INTO official_exchange_benchmarks 
    (trade_date, total_volume, total_turnover, total_transactions, source, imported_at)
  VALUES (@trade_date, @total_volume, @total_turnover, @total_transactions, @source, @imported_at)
  ON CONFLICT(trade_date) DO UPDATE SET
    total_volume = excluded.total_volume,
    total_turnover = excluded.total_turnover,
    total_transactions = excluded.total_transactions,
    source = excluded.source,
    imported_at = excluded.imported_at
`);

let inserted = 0;
for (const date of missing) {
  // Aggregate from daily_stock_summary (official NEPSE-equivalent totals)
  const agg = db.prepare(`
    SELECT 
      SUM(total_volume) as vol,
      SUM(total_turnover) as turnover
    FROM daily_stock_summary
    WHERE trade_date = ?
  `).get(date);

  // Get transaction count from floorsheet_contracts if available
  const fcAgg = db.prepare(`
    SELECT COUNT(*) as txns
    FROM floorsheet_contracts
    WHERE trade_date = ?
  `).get(date);

  if (!agg || !agg.vol) {
    console.log(`  ⚠️  ${date}: No stock summary data, skipping`);
    continue;
  }

  upsert.run({
    trade_date: date,
    total_volume: Math.round(agg.vol),
    total_turnover: Math.round(agg.turnover || 0),
    total_transactions: fcAgg?.txns || 0,
    source: 'Aggregated from daily_stock_summary (proxy DB)',
    imported_at: new Date().toISOString(),
  });

  console.log(`  ✅ ${date}: vol=${agg.vol.toLocaleString()} turnover=${Math.round(agg.turnover).toLocaleString()} txns=${fcAgg?.txns || 0}`);
  inserted++;
}

const total = db.prepare('SELECT COUNT(*) as c FROM official_exchange_benchmarks').get().c;
console.log(`\n✅ Inserted ${inserted} rows. Table now has ${total} total rows.`);

// Show all rows now
console.log('\nAll official_exchange_benchmarks:');
db.prepare('SELECT * FROM official_exchange_benchmarks ORDER BY trade_date DESC').all()
  .forEach(r => console.log(`  ${r.trade_date} | vol=${r.total_volume?.toLocaleString()} | turnover=${r.total_turnover?.toLocaleString()} | txns=${r.total_transactions} | ${r.source.slice(0,50)}`));

db.close();
console.log('\n='.repeat(60));
