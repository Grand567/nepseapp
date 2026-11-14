/**
 * QA INDEPENDENT ORACLE MODULE (PHASE 1)
 * ============================================================================
 * Completely isolated financial and microstructure reference calculation engine.
 * STRICT ISOLATION RULES:
 *  1. ZERO imports from src/ or proxy/ code.
 *  2. Connects strictly READ-ONLY to qa/work/drabyashree_ledger.db.
 *  3. Implements independent SQL and mathematical formulas.
 *  4. Evaluates expected values for:
 *     - Price, previous close, change, % change, OHLCV, turnover, transactions, VWAP
 *     - 52-week high & low
 *     - 1D, 5D, 15D, 30D, and All-Time distinct aggregates
 *     - Broker accumulation, distribution, VWAPs, BCR3/BCR5 concentration
 *     - Top 10 Broker Cornering rankings by date
 *     - Portfolio PnL with statutory commissions, SEBON fees, DP fees, and CGT
 *     - IPO allotment probability and corporate action adjustments
 * ============================================================================
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../work/drabyashree_ledger.db');

export class IndependentOracle {
  constructor(dbPath = DB_PATH) {
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  // ── 1. SESSION TRADING CALENDAR RESOLVER ───────────────────────────────────
  getAvailableTradingDates(limit = 60, anchorDate = null) {
    let sql = 'SELECT DISTINCT trade_date FROM daily_stock_summary ';
    const params = [];
    if (anchorDate) {
      sql += 'WHERE trade_date <= ? ';
      params.push(anchorDate);
    }
    sql += 'ORDER BY trade_date DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params).map(r => r.trade_date);
  }

  getTradingDayWindow(days = 5, anchorDate = null) {
    const dates = this.getAvailableTradingDates(days, anchorDate);
    const sorted = [...dates].sort();
    return {
      requestedDays: days,
      actualDays: sorted.length,
      startDate: sorted[0] || null,
      endDate: sorted[sorted.length - 1] || null,
      dates: sorted
    };
  }

  // ── 2. PRICE & OHLCV METRICS ──────────────────────────────────────────────
  getStockSummary(symbol, anchorDate = null) {
    const sym = String(symbol || '').toUpperCase().trim();
    let sql = `
      SELECT symbol, trade_date, open_price, high_price, low_price, close_price,
             total_volume, total_turnover
      FROM daily_stock_summary
      WHERE symbol = ?
    `;
    const params = [sym];
    if (anchorDate) {
      sql += ' AND trade_date <= ?';
      params.push(anchorDate);
    }
    sql += ' ORDER BY trade_date DESC LIMIT 2';

    const rows = this.db.prepare(sql).all(...params);
    if (!rows || rows.length === 0) return null;

    const latest = rows[0];
    const previous = rows.length > 1 ? rows[1] : null;

    const ltp = Number(latest.close_price ?? 0);
    const prevClose = previous ? Number(previous.close_price ?? 0) : ltp;
    const change = +(ltp - prevClose).toFixed(2);
    const pChange = prevClose > 0 ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2) : 0;
    const open = Number(latest.open_price ?? ltp);
    const high = Number(latest.high_price ?? ltp);
    const low = Number(latest.low_price ?? ltp);
    const volume = Number(latest.total_volume ?? 0);
    const turnover = Number(latest.total_turnover ?? 0);
    const vwap = volume > 0 ? +(turnover / volume).toFixed(2) : ltp;

    // 52-week values (240 trading sessions)
    const week52 = this.db.prepare(`
      SELECT MAX(high_price) as week52_high, MIN(low_price) as week52_low
      FROM (
        SELECT high_price, low_price FROM daily_stock_summary
        WHERE symbol = ? AND trade_date <= ?
        ORDER BY trade_date DESC LIMIT 240
      )
    `).get(sym, latest.trade_date);

    return {
      symbol: sym,
      tradeDate: latest.trade_date,
      ltp,
      prevClose,
      change,
      pChange,
      open,
      high,
      low,
      close: ltp,
      volume,
      turnover,
      vwap,
      week52High: Number(week52?.week52_high ?? high),
      week52Low: Number(week52?.week52_low ?? low)
    };
  }

  // ── 3. MULTI-TIMEFRAME AGGREGATES (1D, 5D, 15D, 30D, ALL-TIME) ─────────────
  getTimeframeAggregate(symbol, daysParam = '5', anchorDate = null) {
    const sym = String(symbol || '').toUpperCase().trim();
    const isAll = daysParam === 'all' || daysParam === 'alltime' || daysParam === 'ALL';
    const dayCount = isAll ? 999999 : (parseInt(daysParam, 10) || 5);

    // Get exact trading dates
    let datesSql = 'SELECT DISTINCT trade_date FROM daily_stock_summary ';
    const dateParams = [];
    if (anchorDate) {
      datesSql += 'WHERE trade_date <= ? ';
      dateParams.push(anchorDate);
    }
    datesSql += 'ORDER BY trade_date DESC ';
    if (!isAll) {
      datesSql += 'LIMIT ?';
      dateParams.push(dayCount);
    }

    const tradingDates = this.db.prepare(datesSql).all(...dateParams).map(r => r.trade_date);
    if (tradingDates.length === 0) return null;

    const startDate = tradingDates[tradingDates.length - 1];
    const endDate = tradingDates[0];

    // Aggregate summary
    const inClause = tradingDates.map(() => '?').join(',');
    const agg = this.db.prepare(`
      SELECT
        COUNT(*) as session_count,
        SUM(COALESCE(total_volume, 0)) as total_volume,
        SUM(COALESCE(total_turnover, 0)) as total_turnover,
        MAX(high_price) as period_high,
        MIN(low_price) as period_low
      FROM daily_stock_summary
      WHERE symbol = ? AND trade_date IN (${inClause})
    `).get(sym, ...tradingDates);

    const totalVolume = Number(agg?.total_volume || 0);
    const totalTurnover = Number(agg?.total_turnover || 0);
    const vwap = totalVolume > 0 ? +(totalTurnover / totalVolume).toFixed(2) : 0;

    return {
      symbol: sym,
      timeframe: daysParam,
      sessionsCount: Number(agg?.session_count || tradingDates.length),
      startDate,
      endDate,
      totalVolume,
      totalTurnover,
      periodHigh: Number(agg?.period_high || 0),
      periodLow: Number(agg?.period_low || 0),
      vwap
    };
  }

  // ── 4. BROKER FLOW & MICROSTRUCTURE ACCUMULATION ───────────────────────────
  getBrokerFlow(symbol, daysParam = '1', anchorDate = null) {
    const sym = String(symbol || '').toUpperCase().trim();
    const isAll = daysParam === 'all' || daysParam === 'alltime' || daysParam === 'ALL';
    const dayCount = isAll ? 999999 : (parseInt(daysParam, 10) || 1);

    // Get active trading session dates
    let datesSql = 'SELECT DISTINCT trade_date FROM daily_stock_summary ';
    const dateParams = [];
    if (anchorDate) {
      datesSql += 'WHERE trade_date <= ? ';
      dateParams.push(anchorDate);
    }
    datesSql += 'ORDER BY trade_date DESC ';
    if (!isAll) {
      datesSql += 'LIMIT ?';
      dateParams.push(dayCount);
    }
    const tradingDates = this.db.prepare(datesSql).all(...dateParams).map(r => r.trade_date);
    if (tradingDates.length === 0) return null;

    const inClause = tradingDates.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT
        broker_id,
        SUM(buy_vol) as buy_qty,
        SUM(buy_amt) as buy_amt,
        SUM(sell_vol) as sell_qty,
        SUM(sell_amt) as sell_amt
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date IN (${inClause})
      GROUP BY broker_id
    `).all(sym, ...tradingDates);

    let totalBuyQty = 0;
    let totalSellQty = 0;
    let totalBuyAmt = 0;
    let totalSellAmt = 0;

    const brokers = rows.map(r => {
      const buyQty = Number(r.buy_qty || 0);
      const buyAmt = Number(r.buy_amt || 0);
      const sellQty = Number(r.sell_qty || 0);
      const sellAmt = Number(r.sell_amt || 0);
      const netQty = buyQty - sellQty;
      const netAmt = buyAmt - sellAmt;
      const buyVwap = buyQty > 0 ? +(buyAmt / buyQty).toFixed(2) : 0;
      const sellVwap = sellQty > 0 ? +(sellAmt / sellQty).toFixed(2) : 0;

      totalBuyQty += buyQty;
      totalSellQty += sellQty;
      totalBuyAmt += buyAmt;
      totalSellAmt += sellAmt;

      return {
        brokerId: Number(r.broker_id),
        buyQty,
        buyAmt,
        buyVwap,
        sellQty,
        sellAmt,
        sellVwap,
        netQty,
        netAmt
      };
    });

    // Top net buyers (Accumulators)
    const topAccumulators = [...brokers]
      .filter(b => b.netQty > 0)
      .sort((a, b) => b.netQty - a.netQty)
      .slice(0, 5);

    // Top net sellers (Distributors)
    const topDistributors = [...brokers]
      .filter(b => b.netQty < 0)
      .sort((a, b) => a.netQty - b.netQty)
      .slice(0, 5);

    // Broker Concentration (BCR3, BCR5) based on gross buy volume
    const sortedBuyers = [...brokers].sort((a, b) => b.buyQty - a.buyQty);
    const bcr3Qty = sortedBuyers.slice(0, 3).reduce((acc, b) => acc + b.buyQty, 0);
    const bcr5Qty = sortedBuyers.slice(0, 5).reduce((acc, b) => acc + b.buyQty, 0);
    const bcr3 = totalBuyQty > 0 ? +((bcr3Qty / totalBuyQty) * 100).toFixed(2) : 0;
    const bcr5 = totalBuyQty > 0 ? +((bcr5Qty / totalBuyQty) * 100).toFixed(2) : 0;

    const top5AccumulatorTotal = topAccumulators.reduce((sum, b) => sum + b.netQty, 0);
    const top5DistributorTotal = topDistributors.reduce((sum, b) => sum + b.netQty, 0);

    return {
      symbol: sym,
      timeframe: daysParam,
      sessionsCount: tradingDates.length,
      startDate: tradingDates[tradingDates.length - 1],
      endDate: tradingDates[0],
      totalBuyQty,
      totalSellQty,
      netTurnover: totalBuyAmt,
      bcr3,
      bcr5,
      top5NetAccumulation: top5AccumulatorTotal,
      top5NetDistribution: top5DistributorTotal,
      topAccumulators,
      topDistributors
    };
  }

  // ── 5. TOP 10 BROKER CORNERING (BY DATE) ──────────────────────────────────
  getBrokerCorneringTop10(targetDate = null) {
    const dates = this.getAvailableTradingDates(1, targetDate);
    const date = dates[0];
    if (!date) return [];

    // Aggregate net broker buys per stock
    const rows = this.db.prepare(`
      SELECT
        b.symbol,
        b.broker_id,
        (b.buy_vol - b.sell_vol) as net_qty,
        b.buy_amt,
        b.buy_vol,
        s.total_volume as total_volume,
        s.close_price as ltp
      FROM daily_broker_ledger b
      JOIN daily_stock_summary s ON b.symbol = s.symbol AND b.trade_date = s.trade_date
      WHERE b.trade_date = ? AND (b.buy_vol - b.sell_vol) > 0 AND s.total_volume > 0
    `).all(date);

    // Group to find top accumulator per stock
    const stockMap = new Map();
    for (const r of rows) {
      const sym = r.symbol;
      const current = stockMap.get(sym);
      if (!current || r.net_qty > current.netQty) {
        stockMap.set(sym, {
          symbol: sym,
          date,
          brokerId: r.broker_id,
          netQty: r.net_qty,
          totalVolume: r.total_volume,
          concentrationPct: +((r.net_qty / r.total_volume) * 100).toFixed(2),
          ltp: r.ltp,
          netValue: +(r.net_qty * r.ltp).toFixed(2)
        });
      }
    }

    const ranked = [...stockMap.values()]
      .sort((a, b) => b.concentrationPct - a.concentrationPct || b.netValue - a.netValue)
      .slice(0, 10);

    return ranked;
  }

  // ── 6. STATUTORY COMMISSIONS, SEBON FEES, DP, WACC & PNL ──────────────────
  static calculateBrokerCommission(amount) {
    const amt = Number(amount || 0);
    if (amt <= 0) return 0;
    let rate = 0.0036;
    if (amt <= 50000) rate = 0.0036;
    else if (amt <= 500000) rate = 0.0033;
    else if (amt <= 2000000) rate = 0.0031;
    else if (amt <= 10000000) rate = 0.0027;
    else rate = 0.0024;
    return +(amt * rate).toFixed(2);
  }

  static calculateSebonFee(amount) {
    return +(Number(amount || 0) * 0.00015).toFixed(2);
  }

  static calculateHoldingPnL({
    units,
    buyPrice,
    currentPrice,
    holdingDays = 100,
    investorType = 'INDIVIDUAL' // 'INDIVIDUAL' or 'CORPORATE'
  }) {
    const qty = Number(units || 0);
    const buyP = Number(buyPrice || 0);
    const currP = Number(currentPrice || 0);

    const grossBuyAmt = qty * buyP;
    const buyCommission = IndependentOracle.calculateBrokerCommission(grossBuyAmt);
    const buySebon = IndependentOracle.calculateSebonFee(grossBuyAmt);
    const buyDp = 25.0;
    const totalBuyOutlay = +(grossBuyAmt + buyCommission + buySebon + buyDp).toFixed(2);
    const effectiveWacc = +(totalBuyOutlay / qty).toFixed(2);

    const grossSellAmt = qty * currP;
    const sellCommission = IndependentOracle.calculateBrokerCommission(grossSellAmt);
    const sellSebon = IndependentOracle.calculateSebonFee(grossSellAmt);
    const sellDp = 25.0;
    const netReceivableBeforeTax = +(grossSellAmt - sellCommission - sellSebon - sellDp).toFixed(2);

    const capitalGain = +(netReceivableBeforeTax - totalBuyOutlay).toFixed(2);

    let cgtRate = 0.075;
    if (investorType === 'CORPORATE') {
      cgtRate = 0.10;
    } else {
      cgtRate = holdingDays >= 365 ? 0.05 : 0.075;
    }

    const cgt = capitalGain > 0 ? +(capitalGain * cgtRate).toFixed(2) : 0;
    const netProfitLoss = +(capitalGain - cgt).toFixed(2);
    const returnPct = +( (netProfitLoss / totalBuyOutlay) * 100 ).toFixed(2);

    return {
      units: qty,
      buyPrice: buyP,
      currentPrice: currP,
      grossBuyAmt,
      buyCommission,
      buySebon,
      buyDp,
      totalBuyOutlay,
      effectiveWacc,
      grossSellAmt,
      sellCommission,
      sellSebon,
      sellDp,
      netReceivableBeforeTax,
      capitalGain,
      cgtRate: `${cgtRate * 100}%`,
      cgt,
      netProfitLoss,
      returnPct
    };
  }

  // ── 7. IPO ALLOTMENT PROBABILITY & PRICE ADJUSTMENTS ───────────────────────
  static calculateIpoAllotment(totalKitta, totalApplicants) {
    const kitta = Number(totalKitta || 0);
    const applicants = Number(totalApplicants || 0);
    const eligible10KittaAllottees = Math.floor(kitta / 10);

    if (applicants <= 0 || kitta <= 0) {
      return { isGuaranteed: false, probabilityPct: 0, eligibleAllottees: 0 };
    }

    if (applicants <= eligible10KittaAllottees) {
      return {
        isGuaranteed: true,
        probabilityPct: 100.0,
        eligibleAllottees: eligible10KittaAllottees,
        oversubscriptionRatio: +(applicants / eligible10KittaAllottees).toFixed(2)
      };
    }

    const prob = +((eligible10KittaAllottees / applicants) * 100).toFixed(2);
    return {
      isGuaranteed: false,
      probabilityPct: prob,
      eligibleAllottees: eligible10KittaAllottees,
      oversubscriptionRatio: +(applicants / eligible10KittaAllottees).toFixed(2)
    };
  }

  static calculateBonusShareAdjustment(ltp, bonusPct) {
    const p = Number(ltp || 0);
    const b = Number(bonusPct || 0);
    if (b <= 0) return p;
    return +(p / (1 + b / 100)).toFixed(2);
  }

  static calculateRightShareAdjustment(ltp, rightPct, faceValue = 100) {
    const p = Number(ltp || 0);
    const r = Number(rightPct || 0) / 100;
    const fv = Number(faceValue || 100);
    if (r <= 0) return p;
    return +((p + r * fv) / (1 + r)).toFixed(2);
  }
}
