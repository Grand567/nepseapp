import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const symbols = ['TAMOR', 'ADBL'];

for (const sym of symbols) {
  console.log(`\n======================================================`);
  console.log(` DETAILED MOVEMENT ANALYSIS: ${sym}`);
  console.log(`======================================================`);

  const history = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(sym);

  const surges = [];
  for (let i = 0; i < history.length - 2; i++) {
    const startP = Number(history[i].close_price);
    for (let j = i + 1; j < Math.min(i + 25, history.length); j++) {
      const endP = Number(history[j].close_price);
      const gainPct = ((endP - startP) / startP) * 100;
      if (gainPct >= 10.0) {
        surges.push({
          startIndex: i,
          endIndex: j,
          startDate: history[i].trade_date,
          endDate: history[j].trade_date,
          startPrice: startP,
          peakPrice: endP,
          gainPct
        });
      }
    }
  }

  surges.sort((a, b) => b.gainPct - a.gainPct);
  const distinctSurges = [];
  for (const s of surges) {
    const overlaps = distinctSurges.some(d =>
      (s.startIndex >= d.startIndex && s.startIndex <= d.endIndex) ||
      (s.endIndex >= d.startIndex && s.endIndex <= d.endIndex)
    );
    if (!overlaps) distinctSurges.push(s);
  }

  console.log(`Identified ${distinctSurges.length} upward thrusts (>= 10%):`);
  distinctSurges.slice(0, 3).forEach((surge, idx) => {
    console.log(`\n  [Rally #${idx + 1}] +${surge.gainPct.toFixed(1)}% | ${surge.startDate} (Rs. ${surge.startPrice}) -> ${surge.endDate} (Rs. ${surge.peakPrice})`);

    const brokerActivity = db.prepare(`
      SELECT broker_id, SUM(buy_vol) as buy, SUM(sell_vol) as sell
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?
      GROUP BY broker_id
      ORDER BY buy DESC
      LIMIT 5
    `).all(sym, surge.startDate, surge.endDate);

    if (brokerActivity.length > 0) {
      console.log(`    Brokers Activity:`);
      brokerActivity.forEach(b => {
        const net = b.buy - b.sell;
        const netSign = net >= 0 ? '+' : '';
        console.log(`      • Broker #${b.broker_id}: Buy ${b.buy.toLocaleString()} | Sell ${b.sell.toLocaleString()} | Net: ${netSign}${net.toLocaleString()} kitta`);
      });
    }
  });
}
