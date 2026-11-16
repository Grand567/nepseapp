import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

const dailyAgg = db.prepare(`
  SELECT trade_date, AVG(close_price) as avg_price, SUM(total_turnover) as turnover, COUNT(*) as scrips
  FROM daily_stock_summary
  WHERE close_price > 0 AND total_turnover > 0 AND is_quarantined = 0
  GROUP BY trade_date
  ORDER BY trade_date ASC
`).all();

console.log('Total aggregated sessions:', dailyAgg.length);

const closes = dailyAgg.map(r => r.avg_price);
const turnovers = dailyAgg.map(r => r.turnover);

const sma = (arr, n) => arr.map((_, i) => {
  if (i < n - 1) return arr[i];
  const slice = arr.slice(i - n + 1, i + 1);
  return slice.reduce((a, b) => a + b, 0) / n;
});

const priceSma20 = sma(closes, 20);
const turnoverSma20 = sma(turnovers, 20);

let bullCount = 0, chopCount = 0;
for (let i = 0; i < dailyAgg.length; i++) {
  const d = dailyAgg[i];
  const isBull = d.avg_price >= priceSma20[i];
  if (isBull) bullCount++; else chopCount++;
  if (i % 25 === 0 || i === dailyAgg.length - 1) {
    console.log(`${d.trade_date} | AvgPx: Rs.${d.avg_price.toFixed(1)} (SMA20: ${priceSma20[i].toFixed(1)}) | Turn: ${(d.turnover/10000000).toFixed(1)} Cr | Regime: ${isBull ? '🟢 BULL' : '🔴 CHOP'}`);
  }
}
console.log(`\nOverall: ${bullCount} Bull sessions, ${chopCount} Chop sessions`);
