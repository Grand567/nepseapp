import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });

// Check latest dates
const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 20").all().map(r => r.trade_date);
console.log('Available trading dates in ledger:', dates);

const holdings = ['AKJCL', 'AKPL', 'SHEL', 'DORDI', 'MKHC', 'SOHL'];

console.log('\n======================================================');
console.log('1. USER HOLDINGS DEEP-DIVE: PRICE & VOLUME RECENT TREND');
console.log('======================================================');

const holdingsReport = {};

for (const sym of holdings) {
  const candles = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date DESC
    LIMIT 25
  `).all(sym).reverse();

  // Broker ledger for recent sessions
  const brokerSummary = db.prepare(`
    SELECT broker_id, 
           SUM(buy_vol) as total_buy, 
           SUM(sell_vol) as total_sell, 
           SUM(buy_amt) as total_buy_amt, 
           SUM(sell_amt) as total_sell_amt,
           (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
           (SUM(buy_amt) - SUM(sell_amt)) as net_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${dates.slice(0, 5).map(d => `'${d}'`).join(',')})
    GROUP BY broker_id
    ORDER BY net_vol DESC
  `).all(sym);

  // Broker 58 specific activity
  const b58Activity = db.prepare(`
    SELECT trade_date, buy_vol, sell_vol, buy_amt, sell_amt, (buy_vol - sell_vol) as net_vol
    FROM daily_broker_ledger
    WHERE symbol = ? AND broker_id = 58
    ORDER BY trade_date DESC
    LIMIT 10
  `).all(sym);

  // Overall Broker 58 accumulation for this symbol across all recorded sessions
  const b58AllTime = db.prepare(`
    SELECT SUM(buy_vol) as total_buy, SUM(sell_vol) as total_sell, 
           SUM(buy_amt) as total_buy_amt, SUM(sell_amt) as total_sell_amt,
           (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
           CASE WHEN SUM(buy_vol) > 0 THEN SUM(buy_amt) / SUM(buy_vol) ELSE 0 END as avg_buy_rate
    FROM daily_broker_ledger
    WHERE symbol = ? AND broker_id = 58
  `).get(sym);

  holdingsReport[sym] = {
    candles,
    latestCandle: candles[candles.length - 1],
    topBuyers5D: brokerSummary.slice(0, 5),
    topSellers5D: brokerSummary.slice(-5).reverse(),
    b58Recent: b58Activity,
    b58AllTime
  };
}

fs.writeFileSync('qa/logs/holdings_deep_dive.json', JSON.stringify(holdingsReport, null, 2));
console.log('Saved holdings analysis to qa/logs/holdings_deep_dive.json');

console.log('\n======================================================');
console.log('2. BROKER 58 (NAASA) TOP ACCUMULATION & STEALTH HOLDINGS');
console.log('======================================================');

// Broker 58 activity in the last 5 trading days
const b58TopRecent = db.prepare(`
  SELECT symbol, 
         SUM(buy_vol) as buy_vol, 
         SUM(sell_vol) as sell_vol, 
         (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
         SUM(buy_amt) as buy_amt,
         SUM(sell_amt) as sell_amt,
         (SUM(buy_amt) - SUM(sell_amt)) as net_amt,
         CASE WHEN SUM(buy_vol) > 0 THEN SUM(buy_amt) / SUM(buy_vol) ELSE 0 END as avg_buy_price
  FROM daily_broker_ledger
  WHERE broker_id = 58 AND trade_date IN (${dates.slice(0, 5).map(d => `'${d}'`).join(',')})
  GROUP BY symbol
  HAVING net_vol > 5000
  ORDER BY net_amt DESC
  LIMIT 20
`).all();

console.log('Broker 58 Top 10 Net Bought in Last 5 Sessions:');
console.table(b58TopRecent.slice(0, 10).map(r => ({
  Symbol: r.symbol,
  NetKitta: r.net_vol,
  NetAmt_Lakhs: (r.net_amt / 100000).toFixed(1),
  AvgBuyPrice: r.avg_buy_price.toFixed(1)
})));

// Broker 58 All-Time Top Net Holdings across entire ledger
const b58TopAllTime = db.prepare(`
  SELECT symbol, 
         SUM(buy_vol) as buy_vol, 
         SUM(sell_vol) as sell_vol, 
         (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
         SUM(buy_amt) as buy_amt,
         SUM(sell_amt) as sell_amt,
         (SUM(buy_amt) - SUM(sell_amt)) as net_amt,
         CASE WHEN SUM(buy_vol) > 0 THEN SUM(buy_amt) / SUM(buy_vol) ELSE 0 END as avg_buy_price
  FROM daily_broker_ledger
  WHERE broker_id = 58
  GROUP BY symbol
  HAVING net_vol > 20000
  ORDER BY net_amt DESC
  LIMIT 30
`).all();

console.log('\nBroker 58 Top 15 All-Time Stealth / Core Holdings:');
console.table(b58TopAllTime.slice(0, 15).map(r => ({
  Symbol: r.symbol,
  NetKitta: r.net_vol,
  NetAmt_Cr: (r.net_amt / 10000000).toFixed(2),
  AvgBuyPrice: r.avg_buy_price.toFixed(1)
})));

fs.writeFileSync('qa/logs/broker58_holdings.json', JSON.stringify({ b58TopRecent, b58TopAllTime }, null, 2));
console.log('Saved Broker 58 data to qa/logs/broker58_holdings.json');
