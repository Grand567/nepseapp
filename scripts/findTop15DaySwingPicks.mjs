import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 30").all().map(r => r.trade_date);
const recent5Dates = dates.slice(0, 5);

// 1. Broker 58 holdings and recent accumulation
const b58Candidates = db.prepare(`
  SELECT b.symbol,
         SUM(b.buy_vol) as total_buy_vol,
         SUM(b.sell_vol) as total_sell_vol,
         (SUM(b.buy_vol) - SUM(b.sell_vol)) as net_vol,
         SUM(b.buy_amt) as total_buy_amt,
         CASE WHEN SUM(b.buy_vol) > 0 THEN SUM(b.buy_amt)/SUM(b.buy_vol) ELSE 0 END as avg_cost,
         -- recent 5-day net
         SUM(CASE WHEN b.trade_date IN (${recent5Dates.map(d => `'${d}'`).join(',')}) THEN (b.buy_vol - b.sell_vol) ELSE 0 END) as recent_5d_net_vol,
         SUM(CASE WHEN b.trade_date IN (${recent5Dates.map(d => `'${d}'`).join(',')}) THEN (b.buy_amt - b.sell_amt) ELSE 0 END) as recent_5d_net_amt
  FROM daily_broker_ledger b
  WHERE b.broker_id = 58
  GROUP BY b.symbol
  HAVING net_vol > 15000 AND recent_5d_net_vol > 0
  ORDER BY recent_5d_net_amt DESC
`).all();

// Filter with technicals
const enriched = [];

for (const c of b58Candidates) {
  const candles = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(c.symbol);

  if (!candles || candles.length < 20) continue;

  const closes = candles.map(x => x.close_price);
  const ltp = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] || ltp;
  const pctChange = ((ltp - prevClose) / prevClose * 100);

  // EMA20
  const k = 2 / (20 + 1);
  let ema20 = closes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  for (let i = 20; i < closes.length; i++) {
    ema20 = closes[i] * k + ema20 * (1 - k);
  }

  // RVOL
  const vols = candles.slice(-20).map(x => x.total_volume);
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const latestVol = candles[candles.length - 1].total_volume;
  const rvol = avgVol > 0 ? (latestVol / avgVol) : 1;

  // 52-week high & low (or max in series)
  const maxHigh = Math.max(...candles.map(x => x.high_price));
  const minLow = Math.min(...candles.map(x => x.low_price));

  enriched.push({
    symbol: c.symbol,
    ltp,
    avgCostB58: c.avg_cost.toFixed(1),
    netVolB58: c.net_vol,
    recent5dNetB58: c.recent_5d_net_vol,
    recent5dNetAmt_Lakhs: (c.recent_5d_net_amt / 100000).toFixed(1),
    ema20: ema20.toFixed(1),
    aboveEma20: ltp >= ema20,
    rvol: rvol.toFixed(2),
    pctChange: pctChange.toFixed(2) + '%',
    candlesCount: candles.length,
    distanceFrom58Cost: (((ltp - c.avg_cost) / c.avg_cost) * 100).toFixed(1) + '%'
  });
}

console.log('Top Broker 58 Active Accumulations with Technical Alignment:');
console.table(enriched.slice(0, 15));

fs.writeFileSync('qa/logs/b58_screened_swing.json', JSON.stringify(enriched, null, 2));
