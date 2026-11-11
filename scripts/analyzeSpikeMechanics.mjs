import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const symbols = ['GHL', 'GVL', 'TAMOR', 'ADBL'];

for (const sym of symbols) {
  console.log(`\n======================================================`);
  console.log(` DETAILED SPIKE & MICROSTRUCTURE ANALYSIS: ${sym}`);
  console.log(`======================================================`);

  const history = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(sym);

  // Find all significant surge periods (>15% in 15 sessions)
  const surges = [];
  for (let i = 0; i < history.length - 2; i++) {
    const startP = Number(history[i].close_price);
    for (let j = i + 1; j < Math.min(i + 15, history.length); j++) {
      const endP = Number(history[j].close_price);
      const gainPct = ((endP - startP) / startP) * 100;
      if (gainPct >= 15.0) {
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

  // Sort surges by gainPct and pick non-overlapping top surges
  surges.sort((a, b) => b.gainPct - a.gainPct);
  const distinctSurges = [];
  for (const s of surges) {
    const overlaps = distinctSurges.some(d =>
      (s.startIndex >= d.startIndex && s.startIndex <= d.endIndex) ||
      (s.endIndex >= d.startIndex && s.endIndex <= d.endIndex)
    );
    if (!overlaps) distinctSurges.push(s);
  }

  console.log(`Identified ${distinctSurges.length} major rally / spike episodes:`);
  distinctSurges.slice(0, 3).forEach((surge, idx) => {
    console.log(`\n  [Spike #${idx + 1}] +${surge.gainPct.toFixed(1)}% | ${surge.startDate} (Rs. ${surge.startPrice}) -> ${surge.endDate} (Rs. ${surge.peakPrice})`);

    // Analyze volume and broker flow during this surge period
    const surgeRows = history.slice(surge.startIndex, surge.endIndex + 1);
    const avgVolDuring = Math.round(surgeRows.reduce((sum, r) => sum + Number(r.total_volume), 0) / surgeRows.length);
    const priorRows = history.slice(Math.max(0, surge.startIndex - 10), surge.startIndex);
    const avgVolPrior = priorRows.length > 0 ? Math.round(priorRows.reduce((sum, r) => sum + Number(r.total_volume), 0) / priorRows.length) : avgVolDuring;
    const volExpansion = avgVolPrior > 0 ? (avgVolDuring / avgVolPrior).toFixed(1) : '1.0';

    console.log(`    Volume Expansion: ${volExpansion}x (Prior Avg: ${avgVolPrior.toLocaleString()} kitta -> Spike Avg: ${avgVolDuring.toLocaleString()} kitta)`);

    // Check broker activity during the surge if dates fall within broker ledger
    const brokerActivity = db.prepare(`
      SELECT broker_id, SUM(buy_vol) as buy, SUM(sell_vol) as sell, SUM(buy_amt) as buy_amt, SUM(sell_amt) as sell_amt
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?
      GROUP BY broker_id
      ORDER BY buy DESC
      LIMIT 5
    `).all(sym, surge.startDate, surge.endDate);

    if (brokerActivity.length > 0) {
      console.log(`    Top Brokers Driving the Spike:`);
      const totalBuyVol = brokerActivity.reduce((s, b) => s + Number(b.buy), 0);
      brokerActivity.forEach(b => {
        const net = b.buy - b.sell;
        const netSign = net >= 0 ? '+' : '';
        console.log(`      • Broker #${b.broker_id}: Bought ${b.buy.toLocaleString()} | Sold ${b.sell.toLocaleString()} | Net: ${netSign}${net.toLocaleString()} kitta`);
      });
    } else {
      console.log(`    (Broker ledger starts after this period; price action driven by exchange floorsheet order matching)`);
    }
  });
}
