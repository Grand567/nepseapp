import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db');

const targets = [
  { sym: 'RFPL', float: 7_000_000 },
  { sym: 'AKJCL', float: 8_000_000 },
  { sym: 'SHEL', float: 30_450_000 }
];

for (const { sym, float: estFloat } of targets) {
  // 5-day broker data
  const dates5 = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date DESC LIMIT 5').all(sym).map(r => r.trade_date);
  const p5 = dates5.map(() => '?').join(',');
  const b5 = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as buy_v, SUM(sell_vol) as sell_v, SUM(buy_vol - sell_vol) as net_v
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${p5})
    GROUP BY broker_id
    HAVING net_v > 0
    ORDER BY net_v DESC
  `).all(sym, ...dates5);

  const totalMarket5 = db.prepare(`
    SELECT SUM(total_volume) as vol, SUM(total_turnover) as turnover
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date IN (${p5})
  `).get(sym, ...dates5);
  
  const leadNet5 = b5[0]?.net_v || 0;
  const top3Net5 = b5.slice(0, 3).reduce((s, r) => s + r.net_v, 0);
  const top5Net5 = b5.slice(0, 5).reduce((s, r) => s + r.net_v, 0);
  
  // 20-day broker data
  const dates20 = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date DESC LIMIT 20').all(sym).map(r => r.trade_date);
  const p20 = dates20.map(() => '?').join(',');
  const b20 = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as buy_v, SUM(sell_vol) as sell_v, SUM(buy_vol - sell_vol) as net_v
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${p20})
    GROUP BY broker_id
    HAVING net_v > 0
    ORDER BY net_v DESC
  `).all(sym, ...dates20);
  
  const leadNet20 = b20[0]?.net_v || 0;
  const top3Net20 = b20.slice(0, 3).reduce((s, r) => s + r.net_v, 0);
  const top5Net20 = b20.slice(0, 5).reduce((s, r) => s + r.net_v, 0);

  // All-time broker data
  const bAll = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as buy_v, SUM(sell_vol) as sell_v, SUM(buy_vol - sell_vol) as net_v
    FROM daily_broker_ledger
    WHERE symbol = ?
    GROUP BY broker_id
    HAVING net_v > 0
    ORDER BY net_v DESC
  `).all(sym);
  
  const leadNetAll = bAll[0]?.net_v || 0;
  const top3NetAll = bAll.slice(0, 3).reduce((s, r) => s + r.net_v, 0);
  const top5NetAll = bAll.slice(0, 5).reduce((s, r) => s + r.net_v, 0);
  
  console.log(`\n================== ${sym} (Float: ${(estFloat/1e6).toFixed(1)}M shares) ==================`);
  console.log(`5-Day Total Market Traded: ${totalMarket5.vol.toLocaleString()} shares (${((totalMarket5.vol/estFloat)*100).toFixed(1)}% of float traded in 5 days)`);
  console.log(`• Lead Broker (#${b5[0]?.broker_id}): Net +${leadNet5.toLocaleString()} shs (${((leadNet5/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`• Top-3 Accumulators Syndicate: Net +${top3Net5.toLocaleString()} shs (${((top3Net5/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`  Brokers:`, b5.slice(0, 3).map(r => `#${r.broker_id}: +${r.net_v.toLocaleString()} shs`).join(', '));
  console.log(`• Top-5 Accumulators Syndicate: Net +${top5Net5.toLocaleString()} shs (${((top5Net5/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`  Brokers:`, b5.slice(0, 5).map(r => `#${r.broker_id}: +${r.net_v.toLocaleString()} shs`).join(', '));

  console.log(`\n20-Day Horizon:`);
  console.log(`• Lead Broker (#${b20[0]?.broker_id}): Net +${leadNet20.toLocaleString()} shs (${((leadNet20/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`• Top-3 Accumulators: Net +${top3Net20.toLocaleString()} shs (${((top3Net20/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`• Top-5 Accumulators: Net +${top5Net20.toLocaleString()} shs (${((top5Net20/estFloat)*100).toFixed(2)}% of float)`);

  console.log(`\nAll-Time / Macro Horizon:`);
  console.log(`• Lead Broker (#${bAll[0]?.broker_id}): Net +${leadNetAll.toLocaleString()} shs (${((leadNetAll/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`• Top-3 Accumulators: Net +${top3NetAll.toLocaleString()} shs (${((top3NetAll/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`• Top-5 Accumulators: Net +${top5NetAll.toLocaleString()} shs (${((top5NetAll/estFloat)*100).toFixed(2)}% of float)`);
  console.log(`  Top 3 All-Time:`, bAll.slice(0, 3).map(r => `#${r.broker_id}: +${r.net_v.toLocaleString()} shs`).join(', '));
}
