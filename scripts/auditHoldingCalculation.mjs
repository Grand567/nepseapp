import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });

for (const sym of ['AKJCL', 'GHL', 'SHEL', 'SAHAS']) {
  console.log(`\n=================== ${sym} ===================`);
  
  // 1. All-time in daily_broker_ledger
  const brokerAggs = db.prepare(`
    SELECT broker_id, 
           SUM(buy_vol) as buy_vol, 
           SUM(sell_vol) as sell_vol, 
           (SUM(buy_vol) - SUM(sell_vol)) as net_vol
    FROM daily_broker_ledger
    WHERE symbol = ?
    GROUP BY broker_id
  `).all(sym);

  const accumulators = brokerAggs.filter(b => b.net_vol > 0);
  const distributors = brokerAggs.filter(b => b.net_vol < 0);
  const totalHeldByAccumulators = accumulators.reduce((s, b) => s + b.net_vol, 0);
  const totalDistributed = distributors.reduce((s, b) => s + Math.abs(b.net_vol), 0);
  const netAll = brokerAggs.reduce((s, b) => s + b.net_vol, 0);

  console.log(`[All-Time DB] Total brokers: ${brokerAggs.length}`);
  console.log(`[All-Time DB] Accumulators count: ${accumulators.length}, Distributors count: ${distributors.length}`);
  console.log(`[All-Time DB] Total Held by Accumulators (Sum of Net > 0): ${totalHeldByAccumulators}`);
  console.log(`[All-Time DB] Total Distributed (Sum of Net < 0): ${totalDistributed}`);
  console.log(`[All-Time DB] Net balance across all brokers: ${netAll}`);

  // Top 5 accumulators
  console.log('Top 5 Accumulators in DB:');
  accumulators.sort((a, b) => b.net_vol - a.net_vol).slice(0, 5).forEach(a => {
    console.log(`  Broker #${a.broker_id}: buy=${a.buy_vol}, sell=${a.sell_vol}, net=${a.net_vol} (${((a.net_vol / totalHeldByAccumulators) * 100).toFixed(2)}%)`);
  });

  // Top 5 distributors
  console.log('Top 5 Distributors in DB:');
  distributors.sort((a, b) => a.net_vol - b.net_vol).slice(0, 5).forEach(d => {
    console.log(`  Broker #${d.broker_id}: buy=${d.buy_vol}, sell=${d.sell_vol}, net=${d.net_vol}`);
  });
}
