// scripts/analyze_sector_trends.mjs
import Database from 'better-sqlite3';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

console.log('Analyzing sector-by-sector performance from May 15 to Nov 13, 2026...\n');

// Map all symbols to sectors from scrip_fundamentals
const sectorMap = {};
const fundRows = db.prepare('SELECT symbol, sector FROM scrip_fundamentals').all();
for (const r of fundRows) {
  sectorMap[r.symbol] = r.sector || 'Others';
}

const START_DATE = '2026-05-15';
const END_DATE = '2026-11-13';

const symbols = db.prepare(`
  SELECT DISTINCT symbol 
  FROM daily_stock_summary 
  WHERE trade_date BETWEEN ? AND ?
    AND symbol NOT LIKE '%PO%'
    AND symbol NOT LIKE '%DEB%'
    AND symbol NOT LIKE '%MF%'
`).all(START_DATE, END_DATE).map(r => r.symbol);

const sectorStats = {};

for (const sym of symbols) {
  const sector = sectorMap[sym] || 'Others';
  if (!sectorStats[sector]) {
    sectorStats[sector] = { scrips: 0, totalGainPct: 0, winners: 0, losers: 0, maxGainer: '', maxGainPct: -999 };
  }

  const bars = db.prepare(`
    SELECT trade_date, close_price 
    FROM daily_stock_summary 
    WHERE symbol = ? AND trade_date BETWEEN ? AND ?
    ORDER BY trade_date ASC
  `).all(sym, START_DATE, END_DATE);

  if (bars.length < 30) continue;

  const firstClose = bars[0].close_price;
  const lastClose = bars[bars.length - 1].close_price;
  if (!firstClose || !lastClose) continue;

  const gainPct = ((lastClose - firstClose) / firstClose) * 100;
  sectorStats[sector].scrips++;
  sectorStats[sector].totalGainPct += gainPct;
  if (gainPct > 0) sectorStats[sector].winners++;
  else sectorStats[sector].losers++;

  if (gainPct > sectorStats[sector].maxGainPct) {
    sectorStats[sector].maxGainPct = +gainPct.toFixed(1);
    sectorStats[sector].maxGainer = sym;
  }
}

console.log('Sector-Level 6-Month Aggregate Performance:');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
console.log('Sector                       | Scrips | Avg Net Gain % | Winners | Losers | Win Rate | Top Gainer (Net Gain %)');
console.log('────────────────────────────────────────────────────────────────────────────────────────────────────────────');
Object.entries(sectorStats)
  .sort((a, b) => (b[1].totalGainPct / Math.max(1, b[1].scrips)) - (a[1].totalGainPct / Math.max(1, a[1].scrips)))
  .forEach(([sec, data]) => {
    if (data.scrips === 0) return;
    const avgGain = +(data.totalGainPct / data.scrips).toFixed(1);
    const wr = +((data.winners / data.scrips) * 100).toFixed(1);
    console.log(
      `${sec.padEnd(28)} | ${String(data.scrips).padStart(6)} | ${String(avgGain >= 0 ? '+' : '').concat(String(avgGain), '%').padStart(14)} | ${String(data.winners).padStart(7)} | ${String(data.losers).padStart(6)} | ${String(wr).concat('%').padStart(8)} | ${data.maxGainer} (+${data.maxGainPct}%)`
    );
  });
