import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const holdings = ['AKJCL', 'AKPL', 'SHEL', 'DORDI', 'MKHC', 'SOHL'];

const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 30").all().map(r => r.trade_date);

function calcRsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcEma(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

const detailedHoldings = [];

for (const sym of holdings) {
  const candles = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(sym);

  const closes = candles.map(c => c.close_price);
  const ltp = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] || ltp;
  const changePct = ((ltp - prevClose) / prevClose * 100);

  const rsi = calcRsi(closes, 14);
  const ema20 = calcEma(closes, 20);
  const ema50 = calcEma(closes, 50);

  // Volume 20-day SMA & RVOL
  const recentVols = candles.slice(-20).map(c => c.total_volume);
  const avgVol20 = recentVols.reduce((a, b) => a + b, 0) / (recentVols.length || 1);
  const latestVol = candles[candles.length - 1]?.total_volume || 0;
  const rvol = avgVol20 > 0 ? (latestVol / avgVol20) : 1;

  // Broker accumulation in last 5 days
  const recentDates = dates.slice(0, 5);
  const brokerLedger5D = db.prepare(`
    SELECT broker_id, 
           SUM(buy_vol) as buy_vol, 
           SUM(sell_vol) as sell_vol, 
           (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
           SUM(buy_amt) as buy_amt,
           SUM(sell_amt) as sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${recentDates.map(d => `'${d}'`).join(',')})
    GROUP BY broker_id
    ORDER BY net_vol DESC
  `).all(sym);

  const topBuyers = brokerLedger5D.filter(b => b.net_vol > 0).slice(0, 5);
  const topSellers = brokerLedger5D.filter(b => b.net_vol < 0).slice(-5).reverse();

  const totalBuyVol = brokerLedger5D.reduce((acc, b) => acc + (b.buy_vol || 0), 0);
  const top3BuyVol = topBuyers.slice(0, 3).reduce((acc, b) => acc + b.net_vol, 0);
  const top5BuyVol = topBuyers.slice(0, 5).reduce((acc, b) => acc + b.net_vol, 0);
  const bcr3 = totalBuyVol > 0 ? (top3BuyVol / totalBuyVol * 100) : 0;
  const bcr5 = totalBuyVol > 0 ? (top5BuyVol / totalBuyVol * 100) : 0;

  // Broker 58 specific
  const b58_5d = brokerLedger5D.find(b => b.broker_id === 58) || { buy_vol: 0, sell_vol: 0, net_vol: 0 };
  const b58_alltime = db.prepare(`
    SELECT SUM(buy_vol) as buy_vol, SUM(sell_vol) as sell_vol, (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
           CASE WHEN SUM(buy_vol) > 0 THEN SUM(buy_amt)/SUM(buy_vol) ELSE 0 END as avg_price
    FROM daily_broker_ledger
    WHERE symbol = ? AND broker_id = 58
  `).get(sym);

  // Recent 5 candles
  const last5Candles = candles.slice(-5).map(c => ({
    date: c.trade_date,
    close: c.close_price,
    vol: c.total_volume,
    pct: ((c.close_price - c.open_price) / c.open_price * 100).toFixed(1) + '%'
  }));

  // Fundamentals
  const fundamentals = db.prepare(`SELECT * FROM scrip_fundamentals WHERE symbol = ?`).get(sym);

  detailedHoldings.push({
    symbol: sym,
    ltp,
    prevClose,
    changePct: changePct.toFixed(2) + '%',
    rsi: rsi ? rsi.toFixed(1) : 'N/A',
    ema20: ema20 ? ema20.toFixed(1) : 'N/A',
    ema50: ema50 ? ema50.toFixed(1) : 'N/A',
    trend: ema20 ? (ltp >= ema20 ? 'BULLISH (Above 20-EMA)' : 'BEARISH (Below 20-EMA)') : 'N/A',
    latestVol,
    avgVol20: Math.round(avgVol20),
    rvol: rvol.toFixed(2),
    bcr3: bcr3.toFixed(1) + '%',
    bcr5: bcr5.toFixed(1) + '%',
    topBuyers: topBuyers.map(b => `B#${b.broker_id} (+${b.net_vol}k)`).join(', '),
    topSellers: topSellers.map(b => `B#${b.broker_id} (${b.net_vol}k)`).join(', '),
    b58_5d_net: b58_5d.net_vol,
    b58_alltime_net: b58_alltime?.net_vol || 0,
    b58_avg_price: (b58_alltime?.avg_price || 0).toFixed(1),
    last5Candles,
    fundamentals: fundamentals ? {
      eps: fundamentals.eps,
      pe: fundamentals.pe,
      bookValue: fundamentals.book_value,
      sector: fundamentals.sector
    } : null
  });
}

console.log(JSON.stringify(detailedHoldings, null, 2));
fs.writeFileSync('qa/logs/holdings_summary_table.json', JSON.stringify(detailedHoldings, null, 2));
