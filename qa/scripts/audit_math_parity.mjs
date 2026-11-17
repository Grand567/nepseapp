import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  // initial SMA
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

const symbols = ['NABIL', 'SHIVM', 'HRL'];
const results = {};

for (const sym of symbols) {
  // 1. Price history sorted chronological (oldest to newest)
  const history = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(sym);

  const closes = history.map(h => h.close_price);
  const latest = history[history.length - 1];
  const prev = history[history.length - 2];

  // 2. Technical calculations
  const ema20 = calculateEMA(closes, 20);
  const sma50 = calculateSMA(closes, Math.min(50, closes.length));
  const rsi14 = calculateRSI(closes, 14);

  // 5D VWAP
  const last5 = history.slice(-5);
  const total5DTurnover = last5.reduce((sum, h) => sum + (h.total_turnover || (h.close_price * h.total_volume)), 0);
  const total5DVolume = last5.reduce((sum, h) => sum + h.total_volume, 0);
  const vwap5D = total5DVolume > 0 ? (total5DTurnover / total5DVolume) : latest.close_price;

  // Classic Floor Pivots from latest session
  const H = latest.high_price;
  const L = latest.low_price;
  const C = latest.close_price;
  const pivot = (H + L + C) / 3;
  const r1 = 2 * pivot - L;
  const s1 = 2 * pivot - H;
  const r2 = pivot + (H - L);
  const s2 = pivot - (H - L);

  // 3. Broker flow analysis over latest session
  const latestDate = latest.trade_date;
  const brokerRows = db.prepare(`
    SELECT broker_id, buy_vol, sell_vol, buy_amt, sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date = ?
    ORDER BY buy_vol DESC
  `).all(sym, latestDate);

  const totalBuyVol = brokerRows.reduce((sum, b) => sum + b.buy_vol, 0);
  const top3BuyVol = brokerRows.slice(0, 3).reduce((sum, b) => sum + b.buy_vol, 0);
  const bcr3 = totalBuyVol > 0 ? ((top3BuyVol / totalBuyVol) * 100) : 0;

  const topBuyer = brokerRows[0] || { broker_id: 'N/A', buy_vol: 0, sell_vol: 0 };
  const buyerRetention = topBuyer.buy_vol > 0 ? (((topBuyer.buy_vol - topBuyer.sell_vol) / topBuyer.buy_vol) * 100) : 0;

  // 4. Fundamentals
  const fund = db.prepare(`
    SELECT * FROM scrip_fundamentals WHERE symbol = ?
  `).get(sym) || {};

  results[sym] = {
    symbol: sym,
    latestDate,
    close: C,
    prevClose: prev ? prev.close_price : C,
    pChange: prev ? (((C - prev.close_price) / prev.close_price) * 100).toFixed(2) + '%' : '0.00%',
    ema20: ema20 ? ema20.toFixed(2) : 'N/A',
    sma50: sma50 ? sma50.toFixed(2) : 'N/A',
    rsi14: rsi14 ? rsi14.toFixed(2) : 'N/A',
    vwap5D: vwap5D.toFixed(2),
    pivots: {
      Pivot: pivot.toFixed(2),
      R1: r1.toFixed(2),
      S1: s1.toFixed(2),
      R2: r2.toFixed(2),
      S2: s2.toFixed(2),
    },
    brokerFlow: {
      totalBuyVol,
      top3Buyers: brokerRows.slice(0, 3).map(b => `#${b.broker_id} (${b.buy_vol})`),
      bcr3: bcr3.toFixed(1) + '%',
      leadBroker: `#${topBuyer.broker_id}`,
      leadBrokerNetQty: topBuyer.buy_vol - topBuyer.sell_vol,
      leadBrokerRetention: buyerRetention.toFixed(1) + '%',
    },
    interpretation: {
      trend: C > ema20 ? 'BULLISH (Trading above EMA-20)' : 'BEARISH (Trading below EMA-20)',
      smartMoney: bcr3 > 45 ? 'STRONG ACCUMULATION (BCR3 > 45%)' : bcr3 > 30 ? 'MODERATE ACCUMULATION' : 'DISTRIBUTED / RETAIL',
      rsiStatus: rsi14 > 70 ? 'OVERBOUGHT (>70)' : rsi14 < 30 ? 'OVERSOLD (<30)' : 'NEUTRAL ZONE (30-70)',
    },
    fundamentals: fund
  };
}

console.log(JSON.stringify(results, null, 2));
