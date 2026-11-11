import fs from 'fs';
import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const report = JSON.parse(fs.readFileSync('qa/stealth_week4_backtest_report.json', 'utf8'));

const losses = report.sampleTrades.filter(t => !t.isWinNet);
console.log(`Analyzing ${losses.length} losing trades out of ${report.totalTrades} total trades...\n`);

// Group by sector, date, and reasons
const lossesWithDetails = [];

for (const t of losses) {
  const fund = db.prepare('SELECT sector, eps_ttm, book_value_per_share, npl_pct, promoter_unlock_date FROM scrip_fundamentals WHERE symbol = ?').get(t.symbol);
  
  // Check what the NEPSE index was doing during the trade dates
  // Find index return over the trade holding days
  lossesWithDetails.push({
    symbol: t.symbol,
    date: t.date,
    sector: fund ? fund.sector : 'Unknown',
    eps: fund ? fund.eps_ttm : null,
    netReturn: t.netReturnPct,
    maxGain: t.maxGainPct,
    maxDrawdown: t.maxDrawdownPct,
    exitReason: t.exitReason,
    leadBrokerId: t.leadBrokerId,
    leadBrokerNetKitta: t.leadBrokerNetKitta
  });
}

// 1. Loss breakdown by sector
const sectorLosses = {};
lossesWithDetails.forEach(l => {
  sectorLosses[l.sector] = (sectorLosses[l.sector] || 0) + 1;
});
console.log('--- LOSSES BY SECTOR ---');
console.table(sectorLosses);

// 2. Loss breakdown by date (were multiple losses clustered on the same day?)
const dateLosses = {};
lossesWithDetails.forEach(l => {
  dateLosses[l.date] = (dateLosses[l.date] || 0) + 1;
});
console.log('\n--- LOSSES CLUSTERED BY DATE ---');
console.table(dateLosses);

// 3. Inspect the clustered loss dates: what happened to NEPSE index on those dates?
const indexCandles = JSON.parse(fs.readFileSync('src/data/nepse_index_baseline.json', 'utf8'));
const indexMap = new Map(indexCandles.map(c => [c.date, Number(c.close || c.price || 0)]));

console.log('\n--- DETAILED LOOK AT EACH LOSING TRADE ---');
lossesWithDetails.forEach((l, i) => {
  console.log(`#${i + 1}: ${l.symbol} (${l.sector}) on ${l.date} | Net: ${l.netReturn}% | Max Gain: +${l.maxGain}% | Max DD: ${l.maxDrawdown}% | Exit: ${l.exitReason}`);
});
