import Database from 'better-sqlite3';
import fs from 'fs';
import zlib from 'zlib';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const symbols = ['GHL', 'GVL', 'TAMOR', 'ADBL'];

console.log('=== FUNDAMENTALS & METRICS ===');
for (const sym of symbols) {
  const fund = db.prepare('SELECT * FROM scrip_fundamentals WHERE symbol = ?').get(sym);
  console.log(`\n--- ${sym} ---`);
  if (fund) {
    console.log(`Sector: ${fund.sector}, EPS: ${fund.eps}, BVPS: ${fund.book_value}, PE: ${fund.pe}, Shares: ${fund.listed_shares}, Promoter: ${fund.promoter_holding}%`);
  } else {
    console.log('No fundamental row in DB');
  }

  // Price history stats (recent close, min close, max close, recent volume)
  const history = db.prepare('SELECT trade_date, close_price, total_volume, total_turnover FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date ASC').all(sym);
  if (history.length > 0) {
    const closes = history.map(h => Number(h.close_price));
    const minClose = Math.min(...closes);
    const maxClose = Math.max(...closes);
    const firstClose = closes[0];
    const lastClose = closes[closes.length - 1];
    const lastDate = history[history.length - 1].trade_date;
    const totalVolume = history.reduce((s, h) => s + Number(h.total_volume), 0);
    const avgVolume = Math.round(totalVolume / history.length);
    console.log(`History count: ${history.length} sessions (${history[0].trade_date} to ${lastDate})`);
    console.log(`First: Rs. ${firstClose} | Last: Rs. ${lastClose} | Min: Rs. ${minClose} | Max (Peak): Rs. ${maxClose} | Max Spike: +${(((maxClose - minClose) / minClose) * 100).toFixed(1)}%`);
    console.log(`Avg Daily Volume: ${avgVolume.toLocaleString()} kitta`);

    // Find the largest 5-day or 10-day price jumps
    let maxSpike = { pct: 0, fromDate: '', toDate: '', fromP: 0, toP: 0 };
    for (let i = 0; i < history.length - 5; i++) {
      const p1 = Number(history[i].close_price);
      for (let j = i + 1; j <= Math.min(i + 15, history.length - 1); j++) {
        const p2 = Number(history[j].close_price);
        const jump = ((p2 - p1) / p1) * 100;
        if (jump > maxSpike.pct) {
          maxSpike = { pct: jump, fromDate: history[i].trade_date, toDate: history[j].trade_date, fromP: p1, toP: p2 };
        }
      }
    }
    console.log(`Largest Detected Spike: +${maxSpike.pct.toFixed(1)}% from Rs. ${maxSpike.fromP} (${maxSpike.fromDate}) to Rs. ${maxSpike.toP} (${maxSpike.toDate})`);
  }

  // Broker accumulation
  const brokerTotals = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as total_buy, SUM(sell_vol) as total_sell, SUM(buy_amt) as total_buy_amt
    FROM daily_broker_ledger
    WHERE symbol = ?
    GROUP BY broker_id
    ORDER BY total_buy DESC
    LIMIT 5
  `).all(sym);
  console.log('Top Accumulating Brokers in ledger:');
  brokerTotals.forEach(b => {
    const net = b.total_buy - b.total_sell;
    console.log(`  Broker #${b.broker_id}: Buy: ${b.total_buy.toLocaleString()}, Sell: ${b.total_sell.toLocaleString()}, Net: ${net >= 0 ? '+' : ''}${net.toLocaleString()} kitta`);
  });
}
