import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });

const dates = db.prepare("SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 15").all().map(r => r.trade_date);
const last10Dates = dates.slice(0, 10);
const last3Dates = dates.slice(0, 3);
const latestDate = dates[0];

console.log('Last 10 trading dates:', last10Dates);
console.log('Last 3 trading dates:', last3Dates);
console.log('Latest session:', latestDate);

// Helper for dates in SQL
const sqlIn10 = last10Dates.map(d => `'${d}'`).join(',');
const sqlIn3 = last3Dates.map(d => `'${d}'`).join(',');

// Query 1: Broker 58 Net Accumulation in Last 10 Days and Last 3 Days
const b58Overview = db.prepare(`
  SELECT 
    symbol,
    -- 10-day aggregates
    SUM(CASE WHEN trade_date IN (${sqlIn10}) THEN buy_vol ELSE 0 END) as b58_buy_vol_10d,
    SUM(CASE WHEN trade_date IN (${sqlIn10}) THEN sell_vol ELSE 0 END) as b58_sell_vol_10d,
    SUM(CASE WHEN trade_date IN (${sqlIn10}) THEN (buy_vol - sell_vol) ELSE 0 END) as b58_net_vol_10d,
    SUM(CASE WHEN trade_date IN (${sqlIn10}) THEN buy_amt ELSE 0 END) as b58_buy_amt_10d,
    SUM(CASE WHEN trade_date IN (${sqlIn10}) THEN (buy_amt - sell_amt) ELSE 0 END) as b58_net_amt_10d,
    -- 3-day aggregates (2026-11-04 to 2026-11-06)
    SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN buy_vol ELSE 0 END) as b58_buy_vol_3d,
    SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN sell_vol ELSE 0 END) as b58_sell_vol_3d,
    SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN (buy_vol - sell_vol) ELSE 0 END) as b58_net_vol_3d,
    SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN buy_amt ELSE 0 END) as b58_buy_amt_3d,
    SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN (buy_amt - sell_amt) ELSE 0 END) as b58_net_amt_3d,
    -- 1-day (latest session 2026-11-06)
    SUM(CASE WHEN trade_date = '${latestDate}' THEN buy_vol ELSE 0 END) as b58_buy_vol_1d,
    SUM(CASE WHEN trade_date = '${latestDate}' THEN sell_vol ELSE 0 END) as b58_sell_vol_1d,
    SUM(CASE WHEN trade_date = '${latestDate}' THEN (buy_vol - sell_vol) ELSE 0 END) as b58_net_vol_1d
  FROM daily_broker_ledger
  WHERE broker_id = 58
  GROUP BY symbol
  HAVING b58_net_vol_3d > 1000 OR b58_net_vol_10d > 5000
  ORDER BY b58_net_amt_3d DESC
`).all();

console.log(`Found ${b58Overview.length} scrips with positive Broker 58 accumulation.`);

// Query total market volume and broker 58 share in last 3 days and 10 days for each scrip
const enrichedB58 = [];

for (const row of b58Overview) {
  // Market totals
  const marketStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN trade_date IN (${sqlIn10}) THEN total_volume ELSE 0 END) as mkt_vol_10d,
      SUM(CASE WHEN trade_date IN (${sqlIn10}) THEN total_turnover ELSE 0 END) as mkt_turnover_10d,
      SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN total_volume ELSE 0 END) as mkt_vol_3d,
      SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN total_turnover ELSE 0 END) as mkt_turnover_3d,
      SUM(CASE WHEN trade_date = '${latestDate}' THEN total_volume ELSE 0 END) as mkt_vol_1d
    FROM daily_stock_summary
    WHERE symbol = ?
  `).get(row.symbol);

  // Candles for technical calculation
  const candles = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(row.symbol);

  if (!candles || candles.length < 15) continue;

  const closes = candles.map(c => c.close_price);
  const ltp = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] || ltp;
  const pctChangeLatest = ((ltp - prevClose) / prevClose) * 100;
  
  // 3-day price change
  const close3dAgo = closes[closes.length - 4] || closes[0];
  const pctChange3d = ((ltp - close3dAgo) / close3dAgo) * 100;

  // 10-day price change
  const close10dAgo = closes[Math.max(0, closes.length - 11)];
  const pctChange10d = ((ltp - close10dAgo) / close10dAgo) * 100;

  // EMA20 & EMA50
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
  const calcRSI = (period = 14) => {
    if (closes.length <= period) return 50;
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
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - diff) / period;
      }
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const rsi = calcRSI(14);

  // Bollinger Bands (20, 2)
  const bbSlice = closes.slice(-20);
  const bbMean = bbSlice.reduce((a, b) => a + b, 0) / bbSlice.length;
  const bbVariance = bbSlice.reduce((a, b) => a + Math.pow(b - bbMean, 2), 0) / bbSlice.length;
  const bbStd = Math.sqrt(bbVariance);
  const bbUpper = bbMean + 2 * bbStd;
  const bbLower = bbMean - 2 * bbStd;
  const bbBandwidth = bbMean > 0 ? ((bbUpper - bbLower) / bbMean) * 100 : 0;

  // ATR (14)
  let atr = 0;
  if (candles.length >= 14) {
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high_price;
      const l = candles[i].low_price;
      const cp = candles[i - 1].close_price;
      const tr = Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp));
      trs.push(tr);
    }
    const recentTrs = trs.slice(-14);
    atr = recentTrs.reduce((a, b) => a + b, 0) / recentTrs.length;
  }

  // RVOL
  const vols = candles.slice(-20).map(c => c.total_volume);
  const avgVol20 = vols.reduce((a, b) => a + b, 0) / vols.length;
  const latestVol = candles[candles.length - 1].total_volume;
  const rvol = avgVol20 > 0 ? (latestVol / avgVol20) : 1;

  // 20-day high and low
  const recent20Candles = candles.slice(-20);
  const high20d = Math.max(...recent20Candles.map(c => c.high_price));
  const low20d = Math.min(...recent20Candles.map(c => c.low_price));

  // Stealth score / B58 dominance
  const mktVol3d = marketStats?.mkt_vol_3d || 1;
  const b58Share3d = (row.b58_buy_vol_3d / mktVol3d) * 100;
  const b58Share10d = (row.b58_buy_vol_10d / (marketStats?.mkt_vol_10d || 1)) * 100;

  // Avg buy cost of broker 58 in last 3 days and 10 days
  const b58AvgCost3d = row.b58_buy_vol_3d > 0 ? row.b58_buy_amt_3d / row.b58_buy_vol_3d : 0;
  const b58AvgCost10d = row.b58_buy_vol_10d > 0 ? row.b58_buy_amt_10d / row.b58_buy_vol_10d : 0;

  enrichedB58.push({
    symbol: row.symbol,
    ltp,
    pctChangeLatest: pctChangeLatest.toFixed(2),
    pctChange3d: pctChange3d.toFixed(2),
    pctChange10d: pctChange10d.toFixed(2),
    // B58 metrics
    b58NetVol3d: row.b58_net_vol_3d,
    b58NetAmt3d_Lakhs: (row.b58_net_amt_3d / 100000).toFixed(1),
    b58NetVol10d: row.b58_net_vol_10d,
    b58NetAmt10d_Lakhs: (row.b58_net_amt_10d / 100000).toFixed(1),
    b58Share3d: b58Share3d.toFixed(1),
    b58Share10d: b58Share10d.toFixed(1),
    b58AvgCost3d: b58AvgCost3d.toFixed(1),
    b58AvgCost10d: b58AvgCost10d.toFixed(1),
    // Technicals
    ema20: ema20.toFixed(1),
    ema50: ema50.toFixed(1),
    aboveEma20: ltp >= ema20,
    distFromEma20Pct: (((ltp - ema20) / ema20) * 100).toFixed(1),
    distFromB58Cost3dPct: b58AvgCost3d > 0 ? (((ltp - b58AvgCost3d) / b58AvgCost3d) * 100).toFixed(1) : 'N/A',
    rsi: rsi.toFixed(1),
    bbBandwidth: bbBandwidth.toFixed(2),
    atr: atr.toFixed(1),
    rvol: rvol.toFixed(2),
    high20d,
    low20d,
    distFrom20dHighPct: (((ltp - high20d) / high20d) * 100).toFixed(1),
    distFrom20dLowPct: (((ltp - low20d) / low20d) * 100).toFixed(1),
    latestVol
  });
}

// Write full B58 report to disk
fs.writeFileSync('qa/logs/b58_full_analysis.json', JSON.stringify(enrichedB58, null, 2));

console.log('\n--- TOP 15 BROKER 58 NET BUYERS IN LAST 3 TRADING DAYS (Sorted by Net Amt) ---');
console.table(
  enrichedB58
    .sort((a, b) => parseFloat(b.b58NetAmt3d_Lakhs) - parseFloat(a.b58NetAmt3d_Lakhs))
    .slice(0, 15)
    .map(x => ({
      Symbol: x.symbol,
      LTP: x.ltp,
      '3D_Net_Lakh': x.b58NetAmt3d_Lakhs,
      '3D_Net_Kitta': x.b58NetVol3d,
      'B58_Share3D%': x.b58Share3d,
      'B58_Cost3D': x.b58AvgCost3d,
      'DistCost%': x.distFromB58Cost3dPct,
      '3D_Chg%': x.pctChange3d,
      RSI: x.rsi,
      EMA20: x.ema20,
      BB_Width: x.bbBandwidth,
      RVOL: x.rvol
    }))
);

// Now: Market-Wide Institutional Stealth Accumulation (All brokers)
console.log('\n--- TOP MARKET-WIDE STEALTH ACCUMULATION ACROSS ALL BROKERS ---');
// Criteria: High net inflow across institutional buyers, price compressed or consolidating, strong buyer concentration
const mktAccumulation = db.prepare(`
  SELECT 
    symbol,
    SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN buy_amt - sell_amt ELSE 0 END) as net_amt_3d,
    SUM(CASE WHEN trade_date IN (${sqlIn3}) THEN buy_vol - sell_vol ELSE 0 END) as net_vol_3d
  FROM daily_broker_ledger
  GROUP BY symbol
  HAVING net_amt_3d > 2000000 -- Top net inflow
  ORDER BY net_amt_3d DESC
`).all();

// Check broker concentration for each top scrip
const topMktPicks = [];
for (const item of enrichedB58) {
  // Check top 3 brokers in last 3 days
  const topBrokers3d = db.prepare(`
    SELECT broker_id, 
           SUM(buy_vol) as buy_vol, 
           SUM(sell_vol) as sell_vol, 
           (SUM(buy_vol) - SUM(sell_vol)) as net_vol,
           SUM(buy_amt) as buy_amt,
           SUM(sell_amt) as sell_amt,
           (SUM(buy_amt) - SUM(sell_amt)) as net_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${sqlIn3})
    GROUP BY broker_id
    ORDER BY net_amt DESC
    LIMIT 3
  `).all(item.symbol);

  // Check top sellers in last 3 days
  const topSellers3d = db.prepare(`
    SELECT broker_id, 
           SUM(sell_vol) as sell_vol, 
           (SUM(sell_vol) - SUM(buy_vol)) as net_sell_vol,
           SUM(sell_amt) as sell_amt,
           (SUM(sell_amt) - SUM(buy_amt)) as net_sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${sqlIn3})
    GROUP BY broker_id
    ORDER BY net_sell_amt DESC
    LIMIT 3
  `).all(item.symbol);

  // Check BCR3
  const totalMktTurnover3d = db.prepare(`
    SELECT SUM(total_turnover) as turnover, SUM(total_volume) as volume
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date IN (${sqlIn3})
  `).get(item.symbol);

  const top3BuyVol = topBrokers3d.reduce((s, b) => s + Math.max(0, b.buy_vol), 0);
  const bcr3 = totalMktTurnover3d?.volume > 0 ? (top3BuyVol / totalMktTurnover3d.volume) * 100 : 0;

  topMktPicks.push({
    ...item,
    bcr3: bcr3.toFixed(1),
    topBuyer1: topBrokers3d[0] ? `B#${topBrokers3d[0].broker_id} (+${(topBrokers3d[0].net_amt/100000).toFixed(0)}L)` : '-',
    topBuyer2: topBrokers3d[1] ? `B#${topBrokers3d[1].broker_id} (+${(topBrokers3d[1].net_amt/100000).toFixed(0)}L)` : '-',
    topBuyer3: topBrokers3d[2] ? `B#${topBrokers3d[2].broker_id} (+${(topBrokers3d[2].net_amt/100000).toFixed(0)}L)` : '-',
    topSeller1: topSellers3d[0] ? `B#${topSellers3d[0].broker_id} (-${(topSellers3d[0].net_sell_amt/100000).toFixed(0)}L)` : '-'
  });
}

fs.writeFileSync('qa/logs/screened_picks_all.json', JSON.stringify(topMktPicks, null, 2));
console.log('Saved detailed results to qa/logs/screened_picks_all.json');
