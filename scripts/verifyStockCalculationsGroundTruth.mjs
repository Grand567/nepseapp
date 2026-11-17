import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../proxy/data/drabyashree_ledger.db');

const db = new Database(dbPath, { readonly: true });

export function getStockGroundTruth(symbol = 'NTC') {
  console.log(`\n==================================================`);
  console.log(`🔍 EXTRACTING DATABASE GROUND TRUTH FOR: ${symbol}`);
  console.log(`==================================================`);

  // 1. Price history from daily_stock_summary
  const priceHistory = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover 
    FROM daily_stock_summary 
    WHERE symbol = ? 
    ORDER BY trade_date DESC 
    LIMIT 60
  `).all(symbol);

  if (priceHistory.length === 0) {
    console.error(`No price history found in DB for ${symbol}`);
    return null;
  }

  const latestBar = priceHistory[0] || {};
  const prevBar = priceHistory[1] || {};
  const ltp = Number(latestBar.close_price || 0);
  const prevClose = Number(prevBar.close_price || ltp);
  const dayChange = +(ltp - prevClose).toFixed(2);
  const dayChangePct = +(((ltp - prevClose) / prevClose) * 100).toFixed(2);
  const dayHigh = Number(latestBar.high_price || ltp);
  const dayLow = Number(latestBar.low_price || ltp);
  const dayVolume = Number(latestBar.total_volume || 0);
  const dayTurnover = Number(latestBar.total_turnover || (dayVolume * ltp));

  // 2. 20-period SMA & EMA
  const closes20 = priceHistory.slice(0, 20).map(b => Number(b.close_price));
  const sma20 = closes20.length > 0 ? +(closes20.reduce((s, c) => s + c, 0) / closes20.length).toFixed(2) : ltp;
  
  const k = 2 / (20 + 1);
  let ema20 = closes20[closes20.length - 1];
  for (let i = closes20.length - 2; i >= 0; i--) {
    ema20 = closes20[i] * k + ema20 * (1 - k);
  }
  ema20 = +ema20.toFixed(2);

  // 3. Multi-Timeframe VWAP
  // 5D
  const bars5 = priceHistory.slice(0, 5);
  const vol5 = bars5.reduce((s, b) => s + Number(b.total_volume || 0), 0);
  const turn5 = bars5.reduce((s, b) => s + Number(b.total_turnover || 0), 0);
  const vwap5D = vol5 > 0 ? +(turn5 / vol5).toFixed(1) : ltp;

  // 15D
  const bars15 = priceHistory.slice(0, 15);
  const vol15 = bars15.reduce((s, b) => s + Number(b.total_volume || 0), 0);
  const turn15 = bars15.reduce((s, b) => s + Number(b.total_turnover || 0), 0);
  const vwap15D = vol15 > 0 ? +(turn15 / vol15).toFixed(1) : ltp;

  // 1M (22D)
  const bars22 = priceHistory.slice(0, 22);
  const vol22 = bars22.reduce((s, b) => s + Number(b.total_volume || 0), 0);
  const turn22 = bars22.reduce((s, b) => s + Number(b.total_turnover || 0), 0);
  const vwap1M = vol22 > 0 ? +(turn22 / vol22).toFixed(1) : ltp;

  // 4. Broker Ledger Analysis for Latest Session
  const targetDate = latestBar.trade_date;
  const brokerRows = db.prepare(`
    SELECT broker_id, buy_vol, sell_vol, buy_amt, sell_amt, cross_vol 
    FROM daily_broker_ledger 
    WHERE symbol = ? AND trade_date = ?
  `).all(symbol, targetDate);

  let brokerSummary = null;
  if (brokerRows.length > 0) {
    const totalBuyVol = brokerRows.reduce((s, r) => s + Number(r.buy_vol || 0), 0);
    const totalSellVol = brokerRows.reduce((s, r) => s + Number(r.sell_vol || 0), 0);
    const totalBuyAmt = brokerRows.reduce((s, r) => s + Number(r.buy_amt || 0), 0);
    const totalSellAmt = brokerRows.reduce((s, r) => s + Number(r.sell_amt || 0), 0);

    const brokersList = brokerRows.map(b => {
      const bVol = Number(b.buy_vol || 0);
      const sVol = Number(b.sell_vol || 0);
      const bAmt = Number(b.buy_amt || 0);
      const sAmt = Number(b.sell_amt || 0);
      return {
        brokerId: String(b.broker_id),
        buyVol: bVol,
        sellVol: sVol,
        netVol: bVol - sVol,
        buyAmt: bAmt,
        sellAmt: sAmt,
        netAmt: bAmt - sAmt,
        avgBuyPrice: bVol > 0 ? +(bAmt / bVol).toFixed(1) : 0,
        avgSellPrice: sVol > 0 ? +(sAmt / sVol).toFixed(1) : 0,
        retentionPct: bVol > 0 ? +((Math.max(0, bVol - sVol) / bVol) * 100).toFixed(1) : 0,
        churnPct: bVol > 0 ? +((Math.min(bVol, sVol) / bVol) * 100).toFixed(1) : 0,
      };
    });

    const accumulators = [...brokersList].filter(b => b.netVol > 0).sort((a, b) => b.netVol - a.netVol);
    const distributors = [...brokersList].filter(b => b.netVol < 0).sort((a, b) => a.netVol - b.netVol);

    const grossBuyers = [...brokersList].sort((a, b) => b.buyVol - a.buyVol);
    const top3BuyVol = grossBuyers.slice(0, 3).reduce((s, b) => s + b.buyVol, 0);
    const bcr3BuyPct = totalBuyVol > 0 ? +((top3BuyVol / totalBuyVol) * 100).toFixed(1) : 0;

    const grossSellers = [...brokersList].sort((a, b) => b.sellVol - a.sellVol);
    const top3SellVol = grossSellers.slice(0, 3).reduce((s, b) => s + b.sellVol, 0);
    const bcr3SellPct = totalSellVol > 0 ? +((top3SellVol / totalSellVol) * 100).toFixed(1) : 0;
    const bcr3Spread = +(bcr3BuyPct - bcr3SellPct).toFixed(1);

    const leadAccumulator = accumulators[0] || null;

    brokerSummary = {
      tradeDate: targetDate,
      brokersCount: brokerRows.length,
      totalBuyVol,
      totalSellVol,
      isZeroSumBalanced: totalBuyVol === totalSellVol,
      totalTurnover: totalBuyAmt,
      marketVwap: totalBuyVol > 0 ? +(totalBuyAmt / totalBuyVol).toFixed(1) : ltp,
      bcr3BuyPct,
      bcr3SellPct,
      bcr3Spread,
      leadAccumulator,
      top3Accumulators: accumulators.slice(0, 3),
      top3Distributors: distributors.slice(0, 3),
    };
  }

  // 5. Multi-session (5D) Cumulative Broker Accumulation
  const recentDates = db.prepare(`
    SELECT DISTINCT trade_date 
    FROM daily_stock_summary 
    ORDER BY trade_date DESC 
    LIMIT 5
  `).all().map(r => r.trade_date);

  const broker5DRows = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as total_buy, SUM(sell_vol) as total_sell, SUM(buy_amt) as total_buy_amt, SUM(sell_amt) as total_sell_amt
    FROM daily_broker_ledger 
    WHERE symbol = ? AND trade_date IN (${recentDates.map(() => '?').join(',')})
    GROUP BY broker_id
  `).all(symbol, ...recentDates);

  let multiSessionSummary = null;
  if (broker5DRows.length > 0) {
    const brokers5D = broker5DRows.map(b => {
      const bVol = Number(b.total_buy || 0);
      const sVol = Number(b.total_sell || 0);
      const bAmt = Number(b.total_buy_amt || 0);
      return {
        brokerId: String(b.broker_id),
        buyVol: bVol,
        sellVol: sVol,
        netVol: bVol - sVol,
        buyAmt: bAmt,
        avgBuyPrice: bVol > 0 ? +(bAmt / bVol).toFixed(1) : 0,
        retentionPct: bVol > 0 ? +((Math.max(0, bVol - sVol) / bVol) * 100).toFixed(1) : 0,
        churnPct: bVol > 0 ? +((Math.min(bVol, sVol) / bVol) * 100).toFixed(1) : 0,
      };
    });

    const accumulators5D = [...brokers5D].filter(b => b.netVol > 0).sort((a, b) => b.netVol - a.netVol);
    const lead5D = accumulators5D[0] || null;

    multiSessionSummary = {
      sessionsAudited: recentDates.length,
      dateRange: `${recentDates[recentDates.length - 1]} to ${recentDates[0]}`,
      lead5DAccumulator: lead5D,
      top3_5DAccumulators: accumulators5D.slice(0, 3),
    };
  }

  // 6. Tactical Levels (Flowchart v2.0 Rules)
  const chaseCap = +(ltp * 1.018).toFixed(1);
  const entryLow = +(ltp * 0.995).toFixed(1);
  const entryHigh = Math.min(+(ltp * 1.012).toFixed(1), chaseCap);
  const stopLoss = +(ltp * 0.965).toFixed(1); // -3.5%
  const ratchetTrigger = +(ltp * 1.055).toFixed(1); // +5.5% MFE
  const ratchetLock = +(ltp * 1.018).toFixed(1); // +1.8% lock
  const target1 = +(ltp * 1.075).toFixed(1);
  const target2 = +(ltp * 1.15).toFixed(1);

  const result = {
    symbol,
    latestTradeDate: latestBar.trade_date,
    priceMetrics: {
      ltp,
      prevClose,
      dayChange,
      dayChangePct,
      dayHigh,
      dayLow,
      dayVolume,
      dayTurnover,
      sma20,
      ema20,
      vwap5D,
      vwap15D,
      vwap1M,
    },
    brokerSummary,
    multiSessionSummary,
    tacticalTicket: {
      chaseCap,
      entryLow,
      entryHigh,
      stopLoss,
      ratchetTrigger,
      ratchetLock,
      target1,
      target2,
    }
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sym = process.argv[2] || 'NTC';
  getStockGroundTruth(sym);
}
