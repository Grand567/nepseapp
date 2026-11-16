// scripts/inspect_top_performers_details.mjs
import Database from 'better-sqlite3';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

const targetSymbols = [
  'ECL', 'SAPIL', 'KHPL', 'SOPL', 'SNORL', 'APHL', 'MEPDL', 'YMHL', 'TPKHL', 'KAHL',
  'SHPC', 'SGHL', 'GHL', 'TAMOR', 'CFCL', 'LSL', 'MBJC', 'NBL', 'SANIMA'
];

console.log('Fetching details for top performers...\n');

for (const sym of targetSymbols) {
  const allRows = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(sym);

  const firstEver = allRows[0];
  const lastEver = allRows[allRows.length - 1];

  // Also check broker ledger activity for this symbol
  const brokerCount = db.prepare(`
    SELECT COUNT(DISTINCT broker_id) as b_cnt, SUM(buy_vol) as total_vol
    FROM daily_broker_ledger
    WHERE symbol = ?
  `).get(sym);

  // Top broker
  const topBroker = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as buy_v, SUM(sell_vol) as sell_v, SUM(buy_amt)/MAX(1, SUM(buy_vol)) as vwap
    FROM daily_broker_ledger
    WHERE symbol = ?
    GROUP BY broker_id
    ORDER BY (buy_v - sell_v) DESC
    LIMIT 1
  `).get(sym);

  console.log(`=== ${sym} ===`);
  console.log(`First date in DB: ${firstEver?.trade_date} (Close: Rs. ${firstEver?.close_price}) | Last: ${lastEver?.trade_date} (Close: Rs. ${lastEver?.close_price}) | Total DB Sessions: ${allRows.length}`);
  if (topBroker) {
    console.log(`Top Accumulating Broker: Broker #${topBroker.broker_id} (Net: ${topBroker.buy_v - topBroker.sell_v} shares, VWAP: Rs. ${Math.round(topBroker.vwap)})`);
  }
}
