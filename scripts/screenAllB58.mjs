import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 10").all().map(r => r.trade_date);
const sqlIn3 = `'${dates[0]}', '${dates[1]}', '${dates[2]}'`;
const sqlIn10 = dates.map(d => `'${d}'`).join(',');

console.log('Searching all stocks where Broker 58 is top buyer or has highest net volume in last 3 days...');

// Find every single stock where Broker 58 bought in last 3 days
const allB58_3d = db.prepare(`
  SELECT 
    b.symbol,
    b.buy_vol,
    b.sell_vol,
    (b.buy_vol - b.sell_vol) as net_vol,
    b.buy_amt,
    b.sell_amt,
    (b.buy_amt - b.sell_amt) as net_amt,
    CASE WHEN b.buy_vol > 0 THEN b.buy_amt / b.buy_vol ELSE 0 END as avg_cost
  FROM (
    SELECT symbol, 
           SUM(buy_vol) as buy_vol, 
           SUM(sell_vol) as sell_vol,
           SUM(buy_amt) as buy_amt,
           SUM(sell_amt) as sell_amt
    FROM daily_broker_ledger
    WHERE broker_id = 58 AND trade_date IN (${sqlIn3})
    GROUP BY symbol
  ) b
  WHERE (b.buy_vol - b.sell_vol) > 5000
  ORDER BY net_amt DESC
`).all();

console.log(`Broker 58 net bought > 5,000 kitta in ${allB58_3d.length} scrips in last 3 days:`);

const enrichedList = [];

for (const scrip of allB58_3d) {
  // Get market totals in last 3 days
  const mkt = db.prepare(`
    SELECT SUM(total_volume) as vol_3d, SUM(total_turnover) as to_3d
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date IN (${sqlIn3})
  `).get(scrip.symbol);

  // Get rank of broker 58 among all buyers in last 3 days
  const brokerRank = db.prepare(`
    SELECT broker_id, (SUM(buy_amt) - SUM(sell_amt)) as net_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${sqlIn3})
    GROUP BY broker_id
    ORDER BY net_amt DESC
  `).all(scrip.symbol);

  const b58Rank = brokerRank.findIndex(r => r.broker_id === 58) + 1;
  const isTopBuyer = b58Rank === 1;

  // Candles
  const candles = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date IN (${sqlIn10})
    ORDER BY trade_date ASC
  `).all(scrip.symbol);

  if (!candles || candles.length < 5) continue;

  const ltp = candles[candles.length - 1].close_price;
  const high10 = Math.max(...candles.map(c => c.high_price));
  const low10 = Math.min(...candles.map(c => c.low_price));
  const rangePos = high10 > low10 ? ((ltp - low10) / (high10 - low10)) * 100 : 50;
  
  // 3-day price trend
  const c0 = candles[candles.length - 1].close_price;
  const c3 = candles[Math.max(0, candles.length - 4)].close_price;
  const chg3d = ((c0 - c3) / c3) * 100;

  // 10-day price trend
  const c10 = candles[0].close_price;
  const chg10d = ((c0 - c10) / c10) * 100;

  // Day by day B58 buying in last 3 days
  const dayByDay = db.prepare(`
    SELECT trade_date, (buy_vol - sell_vol) as net_vol, (buy_amt - sell_amt) as net_amt
    FROM daily_broker_ledger
    WHERE broker_id = 58 AND symbol = ? AND trade_date IN (${sqlIn3})
    ORDER BY trade_date ASC
  `).all(scrip.symbol);

  // Check sector / fundamentals
  const fund = db.prepare(`
    SELECT sector, eps_ttm, book_value_per_share
    FROM scrip_fundamentals
    WHERE symbol = ?
  `).get(scrip.symbol);

  const b58Share = mkt?.vol_3d > 0 ? (scrip.buy_vol / mkt.vol_3d) * 100 : 0;

  enrichedList.push({
    symbol: scrip.symbol,
    sector: fund?.sector || 'Unknown',
    ltp,
    b58Rank,
    isTopBuyer,
    netKitta3d: scrip.net_vol,
    netAmt3d_Lakhs: (scrip.net_amt / 100000).toFixed(1),
    b58SharePct: b58Share.toFixed(1),
    avgCost: scrip.avg_cost.toFixed(1),
    distFromCostPct: (((ltp - scrip.avg_cost) / scrip.avg_cost) * 100).toFixed(1),
    chg3dPct: chg3d.toFixed(1),
    chg10dPct: chg10d.toFixed(1),
    high10,
    low10,
    rangePosPct: rangePos.toFixed(1),
    d1_net: dayByDay.find(d => d.trade_date === dates[2])?.net_vol || 0,
    d2_net: dayByDay.find(d => d.trade_date === dates[1])?.net_vol || 0,
    d3_net: dayByDay.find(d => d.trade_date === dates[0])?.net_vol || 0,
    eps: fund?.eps_ttm || 'N/A',
    bv: fund?.book_value_per_share || 'N/A'
  });
}

fs.writeFileSync('qa/logs/b58_all_screened.json', JSON.stringify(enrichedList, null, 2));

console.log('\n--- ALL B58 CANDIDATES SORTED BY 3-DAY NET AMOUNT ---');
console.table(enrichedList.map(r => ({
  Sym: r.symbol,
  Sec: r.sector,
  LTP: r.ltp,
  B58Rank: r.b58Rank,
  '3D_Net_L': r.netAmt3d_Lakhs,
  '3D_Kitta': r.netKitta3d,
  'B58_%': r.b58SharePct + '%',
  Cost: r.avgCost,
  'CostDist%': r.distFromCostPct + '%',
  '3D_Chg%': r.chg3dPct + '%',
  'Range%': r.rangePosPct + '%',
  'D-2_Vol': r.d1_net,
  'D-1_Vol': r.d2_net,
  'D0_Vol': r.d3_net
})));
