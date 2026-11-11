import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const targetSymbols = ['GHL', 'SHL', 'AKJCL', 'SPDL', 'SAHAS', 'HPPL', 'API'];

console.log('Extracting exact indicators and fundamentals for target symbols...');

const results = {};

for (const sym of targetSymbols) {
  // Fundamentals
  const fund = db.prepare(`SELECT * FROM scrip_fundamentals WHERE symbol = ?`).get(sym);
  
  // All candles
  const candles = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(sym);

  const closes = candles.map(c => c.close_price);
  const ltp = closes[closes.length - 1];

  // Indicators
  // EMA 20 & EMA 50
  const calcEMA = (period) => {
    if (closes.length < period) return closes[closes.length - 1];
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
  };
  const ema20 = calcEMA(20);
  const ema50 = calcEMA(50);

  // RSI 14
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * 13 + diff) / 14;
      avgLoss = (avgLoss * 13) / 14;
    } else {
      avgGain = (avgGain * 13) / 14;
      avgLoss = (avgLoss * 13 - diff) / 14;
    }
  }
  const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  // MACD (12, 26, 9)
  const ema12 = calcEMA(12);
  const ema26 = calcEMA(26);
  const macdLine = ema12 - ema26;

  // ATR 14
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high_price;
    const l = candles[i].low_price;
    const cp = candles[i - 1].close_price;
    trs.push(Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp)));
  }
  const atr = trs.slice(-14).reduce((a, b) => a + b, 0) / 14;

  // Bollinger Bands 20, 2
  const bbSlice = closes.slice(-20);
  const mean = bbSlice.reduce((a, b) => a + b, 0) / bbSlice.length;
  const variance = bbSlice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / bbSlice.length;
  const std = Math.sqrt(variance);
  const bbUpper = mean + 2 * std;
  const bbLower = mean - 2 * std;
  const bbBandwidth = ((bbUpper - bbLower) / mean) * 100;

  // Recent 10 candles
  const recent10Candles = candles.slice(-10);

  // Broker 58 10-day history
  const b58History = db.prepare(`
    SELECT trade_date, buy_vol, sell_vol, (buy_vol - sell_vol) as net_vol, buy_amt, sell_amt, (buy_amt - sell_amt) as net_amt
    FROM daily_broker_ledger
    WHERE broker_id = 58 AND symbol = ?
    ORDER BY trade_date DESC
    LIMIT 10
  `).all(sym).reverse();

  results[sym] = {
    fundamentals: fund,
    ltp,
    ema20: ema20.toFixed(2),
    ema50: ema50.toFixed(2),
    rsi: rsi.toFixed(2),
    macdLine: macdLine.toFixed(2),
    atr: atr.toFixed(2),
    bbUpper: bbUpper.toFixed(2),
    bbLower: bbLower.toFixed(2),
    bbBandwidth: bbBandwidth.toFixed(2),
    recent10Candles,
    b58History
  };
}

fs.writeFileSync('qa/logs/target_deep_dive.json', JSON.stringify(results, null, 2));
console.log('Target deep dive saved successfully.');
