// scripts/find_genuine_super_performers.mjs
import Database from 'better-sqlite3';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

const START_DATE = '2026-05-15';
const END_DATE = '2026-11-13';

console.log('Filtering and analyzing genuine super-performers (clean close-to-close metrics)...\n');

const symbols = db.prepare(`
  SELECT symbol, COUNT(*) as cnt
  FROM daily_stock_summary
  WHERE trade_date BETWEEN ? AND ?
    AND symbol NOT LIKE '%PO%'
    AND symbol NOT LIKE '%DEB%'
    AND symbol NOT LIKE '%MF%'
  GROUP BY symbol
`).all(START_DATE, END_DATE).map(r => r.symbol);

const results = [];

for (const sym of symbols) {
  const bars = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC
  `).all(sym, START_DATE, END_DATE);

  if (bars.length < 30) continue;

  const avgTurnover = bars.reduce((acc, b) => acc + (b.total_turnover || 0), 0) / bars.length;
  if (avgTurnover < 500000) continue;

  // Track max trough-to-peak rally using CLOSE prices to avoid anomalous single-trade low/high wicks
  let maxRally = 0;
  let bestTrough = null;
  let bestPeak = null;
  let bestDays = 0;

  for (let i = 0; i < bars.length; i++) {
    const buyBar = bars[i];
    if (!buyBar.close_price || buyBar.close_price <= 0) continue;

    for (let j = i + 1; j < bars.length; j++) {
      const sellBar = bars[j];
      if (!sellBar.close_price || sellBar.close_price <= 0) continue;

      const rally = ((sellBar.close_price - buyBar.close_price) / buyBar.close_price) * 100;
      if (rally > maxRally) {
        maxRally = rally;
        bestTrough = buyBar;
        bestPeak = sellBar;
        bestDays = j - i + 1;
      }
    }
  }

  const endToEnd = ((bars[bars.length - 1].close_price - bars[0].close_price) / bars[0].close_price) * 100;

  if (bestTrough && bestPeak) {
    results.push({
      symbol: sym,
      sessions: bars.length,
      firstClose: bars[0].close_price,
      lastClose: bars[bars.length - 1].close_price,
      troughDate: bestTrough.trade_date,
      troughPrice: bestTrough.close_price,
      peakDate: bestPeak.trade_date,
      peakPrice: bestPeak.close_price,
      maxCloseRallyPct: +maxRally.toFixed(1),
      endToEndPct: +endToEnd.toFixed(1),
      duration: bestDays,
      avgTurnover: Math.round(avgTurnover),
    });
  }
}

results.sort((a, b) => b.maxCloseRallyPct - a.maxCloseRallyPct);

console.log('Top 30 Clean Genuine NEPSE Super-Performers (Close-to-Close Maximum Rally):');
console.log('───────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log('Symbol  | Sessions | Trough Date | Trough (Rs) | Peak Date   | Peak (Rs)  | Max Rally % | Duration | End-to-End %');
console.log('───────────────────────────────────────────────────────────────────────────────────────────────────────────────');
results.slice(0, 30).forEach(r => {
  console.log(
    `${r.symbol.padEnd(7)} | ${String(r.sessions).padStart(8)} | ${r.troughDate}  | ${String(r.troughPrice).padStart(11)} | ${r.peakDate}  | ${String(r.peakPrice).padStart(10)} | ${String(r.maxCloseRallyPct + '%').padStart(11)} | ${String(r.duration + 'd').padStart(8)} | ${String(r.endToEndPct + '%').padStart(12)}`
  );
});
