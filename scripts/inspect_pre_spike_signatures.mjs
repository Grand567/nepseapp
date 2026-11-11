import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });

// Check GHL before the spike on 2026-09-29
// GHL spiked from 253 on Sept 29 to 325 in October
console.log('=== GHL PRE-SPIKE (WEEKS 1-4 OF ACCUMULATION: 2026-09-01 to 2026-09-28) ===');
const ghlPre = db.prepare(`
  SELECT trade_date, close_price, high_price, low_price, total_volume, total_turnover
  FROM daily_stock_summary
  WHERE symbol = 'GHL' AND trade_date >= '2026-09-01' AND trade_date <= '2026-09-28'
  ORDER BY trade_date ASC
`).all();

console.log(`Sessions count: ${ghlPre.length}`);
const ghlCloses = ghlPre.map(r => r.close_price);
console.log(`Price range: Rs. ${Math.min(...ghlCloses)} to Rs. ${Math.max(...ghlCloses)} (Flat range!)`);
console.log(`Average volume during base: ${Math.round(ghlPre.reduce((s, r) => s + r.total_volume, 0) / ghlPre.length).toLocaleString()} kitta`);

// Broker activity during this 4-week base
const ghlBrokers = db.prepare(`
  SELECT broker_id, SUM(buy_vol) as buy, SUM(sell_vol) as sell
  FROM daily_broker_ledger
  WHERE symbol = 'GHL' AND trade_date >= '2026-09-01' AND trade_date <= '2026-09-28'
  GROUP BY broker_id
  ORDER BY buy DESC
  LIMIT 5
`).all();
console.log('Broker accumulation during 4-week base:');
ghlBrokers.forEach(b => {
  console.log(`  Broker #${b.broker_id}: Bought: ${b.buy.toLocaleString()} | Sold: ${b.sell.toLocaleString()} | Net: ${b.buy - b.sell >= 0 ? '+' : ''}${(b.buy - b.sell).toLocaleString()} kitta`);
});

// Check GVL before the spike on 2026-10-08
console.log('\n=== GVL PRE-SPIKE (WEEKS 1-4: 2026-09-01 to 2026-10-07) ===');
const gvlPre = db.prepare(`
  SELECT trade_date, close_price, high_price, low_price, total_volume
  FROM daily_stock_summary
  WHERE symbol = 'GVL' AND trade_date >= '2026-09-01' AND trade_date <= '2026-10-07'
  ORDER BY trade_date ASC
`).all();
console.log(`Sessions count: ${gvlPre.length}`);
const gvlCloses = gvlPre.map(r => r.close_price);
console.log(`Price range: Rs. ${Math.min(...gvlCloses)} to Rs. ${Math.max(...gvlCloses)} (Flat around Rs. 490-500)`);
console.log(`Average volume during base: ${Math.round(gvlPre.reduce((s, r) => s + r.total_volume, 0) / gvlPre.length).toLocaleString()} kitta`);

const gvlBrokers = db.prepare(`
  SELECT broker_id, SUM(buy_vol) as buy, SUM(sell_vol) as sell
  FROM daily_broker_ledger
  WHERE symbol = 'GVL' AND trade_date >= '2026-09-01' AND trade_date <= '2026-10-07'
  GROUP BY broker_id
  ORDER BY buy DESC
  LIMIT 5
`).all();
console.log('Broker accumulation during 4-week base:');
gvlBrokers.forEach(b => {
  console.log(`  Broker #${b.broker_id}: Bought: ${b.buy.toLocaleString()} | Sold: ${b.sell.toLocaleString()} | Net: ${b.buy - b.sell >= 0 ? '+' : ''}${(b.buy - b.sell).toLocaleString()} kitta`);
});
