// scripts/find_established_top_gainers.mjs
import Database from 'better-sqlite3';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

const START_DATE = '2026-05-15';
const END_DATE = '2026-11-13';

console.log('Scanning ESTABLISHED stocks (DB sessions >= 180) for top rallies in last 6 months...\n');

const symbols = db.prepare(`
  SELECT symbol, COUNT(*) as cnt
  FROM daily_stock_summary
  GROUP BY symbol
  HAVING cnt >= 180
`).all().map(r => r.symbol);

const stats = [];

for (const sym of symbols) {
  if (sym.includes('PO') || sym.includes('DEB') || sym.includes('MF') || sym.includes('80')) continue;

  const rows = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC
  `).all(sym, START_DATE, END_DATE);

  if (rows.length < 50) continue;

  const minLowRow = rows.reduce((min, r) => (r.low_price > 0 && r.low_price < min.low_price ? r : min), rows[0]);
  const minLow = minLowRow.low_price;
  const minLowDate = minLowRow.trade_date;

  const afterRows = rows.filter(r => r.trade_date >= minLowDate);
  const maxHighRow = afterRows.reduce((max, r) => (r.high_price > max.high_price ? r : max), afterRows[0]);
  const maxHigh = maxHighRow.high_price;
  const maxHighDate = maxHighRow.trade_date;

  const maxRallyPct = minLow > 0 ? ((maxHigh - minLow) / minLow) * 100 : 0;
  const endToEndPct = ((rows[rows.length - 1].close_price - rows[0].close_price) / rows[0].close_price) * 100;
  const avgTurnover = rows.reduce((acc, r) => acc + (r.total_turnover || 0), 0) / rows.length;

  if (avgTurnover < 500000) continue;

  stats.push({
    symbol: sym,
    sessions: rows.length,
    minLow,
    minLowDate,
    maxHigh,
    maxHighDate,
    maxRallyPct: +maxRallyPct.toFixed(1),
    endToEndPct: +endToEndPct.toFixed(1),
    avgTurnover: Math.round(avgTurnover),
  });
}

stats.sort((a, b) => b.maxRallyPct - a.maxRallyPct);

console.log('Top 30 Established NEPSE Runners (6-Month Max Trough-to-Peak Rally %):');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log('Symbol  | Low (Rs) | Low Date   | High (Rs) | High Date  | Max Rally % | End-to-End % | Avg Turnover');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
stats.slice(0, 30).forEach(s => {
  console.log(
    `${s.symbol.padEnd(7)} | ${String(s.minLow).padStart(8)} | ${s.minLowDate} | ${String(s.maxHigh).padStart(9)} | ${s.maxHighDate} | ${String(s.maxRallyPct + '%').padStart(11)} | ${String(s.endToEndPct + '%').padStart(12)} | Rs. ${s.avgTurnover.toLocaleString()}`
  );
});
