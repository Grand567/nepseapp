import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 10").all().map(r => r.trade_date);
const sqlIn3 = `'${dates[0]}', '${dates[1]}', '${dates[2]}'`;
const sqlIn10 = dates.map(d => `'${d}'`).join(',');

console.log('Screening ENTIRE MARKET for institutional accumulation over last 3 days and 10 days...');

// Find scrips where top 3 buyers accumulated heavily and net buying is high
const allScrips = db.prepare(`
  SELECT symbol, SUM(total_volume) as vol_3d, SUM(total_turnover) as turnover_3d
  FROM daily_stock_summary
  WHERE trade_date IN (${sqlIn3})
  GROUP BY symbol
  HAVING turnover_3d > 20000000 -- At least 2 Crore turnover in 3 days (liquid enough)
`).all();

console.log(`Analyzing ${allScrips.length} liquid scrips across market...`);

const marketAnalysis = [];

for (const scrip of allScrips) {
  // Top 3 buyers in last 3 days
  const topBuyers = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as buy_vol, SUM(sell_vol) as sell_vol, (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
           SUM(buy_amt) as buy_amt, SUM(sell_amt) as sell_amt, (SUM(buy_amt) - SUM(sell_amt)) as net_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${sqlIn3})
    GROUP BY broker_id
    ORDER BY net_amt DESC
    LIMIT 3
  `).all(scrip.symbol);

  // Top 3 sellers in last 3 days
  const topSellers = db.prepare(`
    SELECT broker_id, SUM(sell_vol - buy_vol) as net_sell_vol, SUM(sell_amt - buy_amt) as net_sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${sqlIn3})
    GROUP BY broker_id
    ORDER BY net_sell_amt DESC
    LIMIT 3
  `).all(scrip.symbol);

  const top3NetAmt = topBuyers.reduce((acc, b) => acc + Math.max(0, b.net_amt), 0);
  const top3NetVol = topBuyers.reduce((acc, b) => acc + Math.max(0, b.net_vol), 0);
  const top3BuyVol = topBuyers.reduce((acc, b) => acc + b.buy_vol, 0);

  const bcr3 = scrip.vol_3d > 0 ? (top3BuyVol / scrip.vol_3d) * 100 : 0;
  const netInflowRatio = scrip.turnover_3d > 0 ? (top3NetAmt / scrip.turnover_3d) * 100 : 0;

  // Candles
  const candles = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date IN (${sqlIn10})
    ORDER BY trade_date ASC
  `).all(scrip.symbol);

  if (!candles || candles.length < 5) continue;

  const closes = candles.map(c => c.close_price);
  const ltp = closes[closes.length - 1];
  const c3 = closes[Math.max(0, closes.length - 4)];
  const chg3d = ((ltp - c3) / c3) * 100;

  // High / low in 10d
  const high10 = Math.max(...candles.map(c => c.high_price));
  const low10 = Math.min(...candles.map(c => c.low_price));
  const rangePos = high10 > low10 ? ((ltp - low10) / (high10 - low10)) * 100 : 50;

  // Fundamentals
  const fund = db.prepare(`
    SELECT sector, eps_ttm, book_value_per_share
    FROM scrip_fundamentals
    WHERE symbol = ?
  `).get(scrip.symbol);

  // Check Friday (D0) volume vs average
  const friVol = candles[candles.length - 1].total_volume;
  const avgVol = candles.slice(-5).reduce((a, b) => a + b.total_volume, 0) / 5;
  const rvolFri = avgVol > 0 ? (friVol / avgVol) : 1;

  marketAnalysis.push({
    symbol: scrip.symbol,
    sector: fund?.sector || 'Unknown',
    ltp,
    turnover3d_Cr: (scrip.turnover_3d / 10000000).toFixed(2),
    top3NetAmt_Lakhs: (top3NetAmt / 100000).toFixed(1),
    bcr3: bcr3.toFixed(1),
    netInflowRatio: netInflowRatio.toFixed(1),
    chg3d: chg3d.toFixed(1),
    rangePos: rangePos.toFixed(1),
    rvolFri: rvolFri.toFixed(2),
    topBuyers: topBuyers.map(b => `B#${b.broker_id}(+${(b.net_amt/100000).toFixed(0)}L)`).join(', '),
    topSellers: topSellers.map(s => `B#${s.broker_id}(-${(s.net_sell_amt/100000).toFixed(0)}L)`).join(', '),
    eps: fund?.eps_ttm || 'N/A',
    bv: fund?.book_value_per_share || 'N/A'
  });
}

// Sort by top institutional net inflow
marketAnalysis.sort((a, b) => parseFloat(b.top3NetAmt_Lakhs) - parseFloat(a.top3NetAmt_Lakhs));

console.log('\n--- TOP 20 MARKET-WIDE INSTITUTIONAL ACCUMULATION CANDIDATES (3 DAYS) ---');
console.table(marketAnalysis.slice(0, 20).map(x => ({
  Sym: x.symbol,
  Sec: x.sector,
  LTP: x.ltp,
  'TO_3D(Cr)': x.turnover3d_Cr,
  'Top3Net(L)': x.top3NetAmt_Lakhs,
  'BCR3%': x.bcr3 + '%',
  'Inflow%': x.netInflowRatio + '%',
  '3D_Chg%': x.chg3d + '%',
  'Range%': x.rangePos + '%',
  RVOL_Fri: x.rvolFri,
  TopBuyers: x.topBuyers
})));

fs.writeFileSync('qa/logs/market_wide_accumulation.json', JSON.stringify(marketAnalysis, null, 2));
