// scripts/find_super_performers_6m.mjs
import Database from 'better-sqlite3';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

const START_DATE = '2026-05-15';
const END_DATE = '2026-11-13';

console.log(`Scanning NEPSE universe for top super-performers between ${START_DATE} and ${END_DATE}...\n`);

// Query all symbols active in this period
const symbols = db.prepare(`
  SELECT DISTINCT symbol 
  FROM daily_stock_summary 
  WHERE trade_date BETWEEN ? AND ?
    AND symbol NOT LIKE '%PO%'
    AND symbol NOT LIKE '%DEB%'
    AND symbol NOT LIKE '%MF%'
    AND symbol NOT LIKE '%80%'
  ORDER BY symbol ASC
`).all(START_DATE, END_DATE).map(r => r.symbol);

const stats = [];

for (const sym of symbols) {
  const rows = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC
  `).all(sym, START_DATE, END_DATE);

  if (rows.length < 30) continue; // Minimum trading activity

  const firstClose = rows[0].close_price;
  const lastClose = rows[rows.length - 1].close_price;
  if (!firstClose || firstClose <= 0 || !lastClose || lastClose <= 0) continue;

  const minLowRow = rows.reduce((min, r) => (r.low_price > 0 && r.low_price < min.low_price ? r : min), rows[0]);
  const minLow = minLowRow.low_price;
  const minLowDate = minLowRow.trade_date;

  // Maximum high that occurred ON OR AFTER the minLow date
  const afterRows = rows.filter(r => r.trade_date >= minLowDate);
  const maxHighRow = afterRows.reduce((max, r) => (r.high_price > max.high_price ? r : max), afterRows[0]);
  const maxHigh = maxHighRow.high_price;
  const maxHighDate = maxHighRow.trade_date;

  const maxRallyPct = minLow > 0 ? ((maxHigh - minLow) / minLow) * 100 : 0;
  const endToEndPct = ((lastClose - firstClose) / firstClose) * 100;
  const avgTurnover = rows.reduce((acc, r) => acc + (r.total_turnover || 0), 0) / rows.length;
  const avgVolume = rows.reduce((acc, r) => acc + (r.total_volume || 0), 0) / rows.length;

  // Enforce minimal liquidity threshold
  if (avgTurnover < 500000 && avgVolume < 2000) continue;

  stats.push({
    symbol: sym,
    sessions: rows.length,
    firstClose,
    lastClose,
    minLow,
    minLowDate,
    maxHigh,
    maxHighDate,
    maxRallyPct: +maxRallyPct.toFixed(1),
    endToEndPct: +endToEndPct.toFixed(1),
    avgTurnover: Math.round(avgTurnover),
    avgVolume: Math.round(avgVolume),
  });
}

// Rank by Maximum Rally Impulse %
stats.sort((a, b) => b.maxRallyPct - a.maxRallyPct);

console.log('Top 25 Explosive Runners (Max Trough-to-Peak Rally %):');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log('Symbol  | Sessions | Low (Rs) | Low Date   | High (Rs) | High Date  | Max Rally % | End-to-End % | Avg Turnover');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
stats.slice(0, 25).forEach(s => {
  console.log(
    `${s.symbol.padEnd(7)} | ${String(s.sessions).padStart(8)} | ${String(s.minLow).padStart(8)} | ${s.minLowDate} | ${String(s.maxHigh).padStart(9)} | ${s.maxHighDate} | ${String(s.maxRallyPct + '%').padStart(11)} | ${String(s.endToEndPct + '%').padStart(12)} | Rs. ${s.avgTurnover.toLocaleString()}`
  );
});

// Also print top End-to-End Net Gainers
stats.sort((a, b) => b.endToEndPct - a.endToEndPct);
console.log('\nTop 15 End-to-End Gainers (May 15 to Nov 13, 2026):');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log('Symbol  | First Close | Last Close | End-to-End % | Max Rally % | Avg Turnover');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
stats.slice(0, 15).forEach(s => {
  console.log(
    `${s.symbol.padEnd(7)} | ${String(s.firstClose).padStart(11)} | ${String(s.lastClose).padStart(10)} | ${String(s.endToEndPct + '%').padStart(12)} | ${String(s.maxRallyPct + '%').padStart(11)} | Rs. ${s.avgTurnover.toLocaleString()}`
  );
});
