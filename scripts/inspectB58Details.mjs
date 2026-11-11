import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 10").all().map(r => r.trade_date);

console.log('Inspecting top 25 B58 accumulated stocks across each of the 10 days...');

// Let's get daily breakdown of B58 for top candidates
const queryDailyB58 = (sym) => {
  return db.prepare(`
    SELECT trade_date, buy_vol, sell_vol, (buy_vol - sell_vol) as net_vol, buy_amt, sell_amt, (buy_amt - sell_amt) as net_amt
    FROM daily_broker_ledger
    WHERE broker_id = 58 AND symbol = ? AND trade_date IN (${dates.map(d => `'${d}'`).join(',')})
    ORDER BY trade_date ASC
  `).all(sym);
};

const queryCandles = (sym) => {
  return db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date IN (${dates.map(d => `'${d}'`).join(',')})
    ORDER BY trade_date ASC
  `).all(sym);
};

const symbolsToCheck = [
  'GHL', 'SAHAS', 'API', 'SHL', 'AKJCL', 'NICA', 'UMHL', 'SGHC', 'SPDL', 'LBBL', 
  'NIMB', 'RIDI', 'HIDCLP', 'HDL', 'RFPL', 'MKHC', 'DORDI', 'SHEL', 'AKPL', 'SOHL',
  'NRN', 'CORBL', 'BARUN', 'HATHY', 'SONA', 'HRL', 'UNHPL', 'NIFRA', 'CITY'
];

const candidateAnalysis = [];

for (const sym of symbolsToCheck) {
  const b58Daily = queryDailyB58(sym);
  const candles = queryCandles(sym);
  if (!candles || candles.length < 5) continue;

  const totalB58NetVol10d = b58Daily.reduce((acc, r) => acc + r.net_vol, 0);
  const totalB58NetAmt10d = b58Daily.reduce((acc, r) => acc + r.net_amt, 0);

  const last3B58 = b58Daily.slice(-3);
  const netVol3d = last3B58.reduce((acc, r) => acc + r.net_vol, 0);
  const netAmt3d = last3B58.reduce((acc, r) => acc + r.net_amt, 0);

  const ltp = candles[candles.length - 1].close_price;
  const high10d = Math.max(...candles.map(c => c.high_price));
  const low10d = Math.min(...candles.map(c => c.low_price));
  const range10d = high10d - low10d;
  
  // Position in 10-day range: 0% = at low, 100% = at high
  const rangePosPct = range10d > 0 ? ((ltp - low10d) / range10d) * 100 : 50;

  // Recent price pattern
  const closePrev = candles[candles.length - 2]?.close_price || ltp;
  const close3dAgo = candles[candles.length - 4]?.close_price || ltp;

  // Check top brokers in market for last 3 days
  const topBrokers = db.prepare(`
    SELECT broker_id, SUM(buy_vol - sell_vol) as net_vol, SUM(buy_amt - sell_amt) as net_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN ('${dates[0]}', '${dates[1]}', '${dates[2]}')
    GROUP BY broker_id
    ORDER BY net_amt DESC
    LIMIT 3
  `).all(sym);

  const topSellers = db.prepare(`
    SELECT broker_id, SUM(sell_vol - buy_vol) as net_sell_vol, SUM(sell_amt - buy_amt) as net_sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN ('${dates[0]}', '${dates[1]}', '${dates[2]}')
    GROUP BY broker_id
    ORDER BY net_sell_amt DESC
    LIMIT 3
  `).all(sym);

  candidateAnalysis.push({
    symbol: sym,
    ltp,
    high10d,
    low10d,
    rangePosPct: rangePosPct.toFixed(1),
    netAmt3d_Lakhs: (netAmt3d / 100000).toFixed(1),
    netVol3d,
    netAmt10d_Lakhs: (totalB58NetAmt10d / 100000).toFixed(1),
    netVol10d: totalB58NetVol10d,
    b58DailySummary: b58Daily.map(d => `${d.trade_date.slice(5)}: net ${d.net_vol}k (${(d.net_amt/100000).toFixed(1)}L)`).join(' | '),
    topBuyers: topBrokers.map(b => `B${b.broker_id}:+${(b.net_amt/100000).toFixed(0)}L`).join(', '),
    topSellers: topSellers.map(s => `B${s.broker_id}:-${(s.net_sell_amt/100000).toFixed(0)}L`).join(', ')
  });
}

fs.writeFileSync('qa/logs/candidate_deep_dive.json', JSON.stringify(candidateAnalysis, null, 2));

console.log('Candidate analysis completed:');
console.table(candidateAnalysis.map(c => ({
  Sym: c.symbol,
  LTP: c.ltp,
  '10D_High': c.high10d,
  '10D_Low': c.low10d,
  'Range%': c.rangePosPct + '%',
  '3D_Net_L': c.netAmt3d_Lakhs,
  '10D_Net_L': c.netAmt10d_Lakhs,
  TopBuyers: c.topBuyers,
  TopSellers: c.topSellers
})));
