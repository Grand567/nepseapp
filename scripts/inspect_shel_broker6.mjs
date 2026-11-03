import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db');

console.log('=== SHEL BROKER 6 DAILY BREAKDOWN ===');
const rows = db.prepare(`
  SELECT trade_date, broker_id, buy_vol, buy_amt, sell_vol, sell_amt,
         round(buy_amt * 1.0 / nullif(buy_vol, 0), 2) as avg_buy_price,
         round(sell_amt * 1.0 / nullif(sell_vol, 0), 2) as avg_sell_price,
         buy_vol - sell_vol as net_vol
  FROM daily_broker_ledger
  WHERE symbol = 'SHEL' AND broker_id = 6
  ORDER BY trade_date ASC
`).all();
console.table(rows);

console.log('=== SHEL BROKER 6 ALL-TIME TOTALS ===');
const totals = db.prepare(`
  SELECT 
    sum(buy_vol) as total_buy_vol,
    sum(buy_amt) as total_buy_amt,
    round(sum(buy_amt) * 1.0 / nullif(sum(buy_vol), 0), 2) as all_time_avg_buy_price,
    sum(sell_vol) as total_sell_vol,
    sum(sell_amt) as total_sell_amt,
    round(sum(sell_amt) * 1.0 / nullif(sum(sell_vol), 0), 2) as all_time_avg_sell_price,
    sum(buy_vol) - sum(sell_vol) as net_holding_vol,
    round((sum(buy_vol) - sum(sell_vol)) * 1.0 / nullif(sum(buy_vol), 0) * 100, 2) as retention_pct
  FROM daily_broker_ledger
  WHERE symbol = 'SHEL' AND broker_id = 6
`).get();
console.log(totals);

console.log('=== SHEL TOP BROKERS OVER RECENT SESSIONS ===');
const dates = db.prepare(`
  SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE symbol = 'SHEL' ORDER BY trade_date DESC LIMIT 30
`).all().map(r => r.trade_date);

for (const w of [1, 2, 3, 5, 10, 15, 20, dates.length]) {
  const windowDates = dates.slice(0, w);
  const placeholders = windowDates.map(() => '?').join(',');
  const winTotal = db.prepare(`
    SELECT 
      sum(buy_vol) as buy_vol,
      sum(buy_amt) as buy_amt,
      round(sum(buy_amt) * 1.0 / nullif(sum(buy_vol), 0), 2) as win_avg_buy,
      sum(sell_vol) as sell_vol,
      sum(sell_amt) as sell_amt,
      sum(buy_vol) - sum(sell_vol) as net_vol,
      round((sum(buy_vol) - sum(sell_vol)) * 1.0 / nullif(sum(buy_vol), 0) * 100, 2) as retention
    FROM daily_broker_ledger
    WHERE symbol = 'SHEL' AND broker_id = 6 AND trade_date IN (${placeholders})
  `).get(...windowDates);
  console.log(`Window last ${w} sessions (${windowDates[windowDates.length-1]} to ${windowDates[0]}):`, winTotal);
}
