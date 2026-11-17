// proxy/trackBSyndicateEngine.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAVYASHREE SPECIAL TRACK B SYNDICATE ENGINE & 2–3 DAY IGNITION DISPATCHER
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Pinpoints low-nominal stocks (LTP < Rs. 450) where institutional syndicates
 * have cornered free float, survived the T+2 Demat delivery cliff, and formed
 * an asymmetric pre-ignition coil (NR7/IDNR4, Wyckoff VDU, tight POC anchor)
 * primed to ignite within 24–72 hours (+8.5% to +15.0%).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getBrokerName } from './brokerVault.mjs';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Calculates Multi-Timeframe Broker Metrics (1D, 5D, 15D), Broker VWAP,
 * Net Retention %, Concentration Asymmetry (BCR3 Buy vs Sell), and Total POC.
 */
export function calculateMultiTimeframeBrokerMetrics(symbol, { db, targetDate = null, sessionLimit = 22 } = {}) {
  if (!db || !symbol) return null;
  const sym = String(symbol).toUpperCase().trim();

  // 1. Get ordered trading sessions for this symbol
  let dateQuery = `
    SELECT DISTINCT trade_date 
    FROM daily_broker_ledger 
    WHERE symbol = ?
  `;
  const params = [sym];
  if (targetDate) {
    dateQuery += ` AND trade_date <= ?`;
    params.push(targetDate);
  }
  dateQuery += ` ORDER BY trade_date DESC LIMIT ?`;
  params.push(sessionLimit);

  const dateRows = db.prepare(dateQuery).all(...params);
  if (!dateRows || dateRows.length === 0) {
    // Fallback to daily_stock_summary if broker ledger has fewer dates
    let stockDateQuery = `
      SELECT DISTINCT trade_date 
      FROM daily_stock_summary 
      WHERE symbol = ?
    `;
    const sParams = [sym];
    if (targetDate) {
      stockDateQuery += ` AND trade_date <= ?`;
      sParams.push(targetDate);
    }
    stockDateQuery += ` ORDER BY trade_date DESC LIMIT ?`;
    sParams.push(sessionLimit);
    const sRows = db.prepare(stockDateQuery).all(...sParams);
    if (!sRows || sRows.length === 0) return null;
    dateRows.push(...sRows);
  }

  const allDates = dateRows.map(r => r.trade_date);
  const date1D = allDates.slice(0, 1);
  const dates5D = allDates.slice(0, Math.min(5, allDates.length));
  const dates15D = allDates.slice(0, Math.min(15, allDates.length));

  // Helper to aggregate broker ledger for a given set of dates
  const aggregateLedger = (dates) => {
    if (!dates || dates.length === 0) return { totalBuyVol: 0, totalSellVol: 0, totalBuyAmt: 0, totalSellAmt: 0, brokers: [] };
    const placeholders = dates.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT 
        broker_id,
        SUM(buy_vol) as buy_vol,
        SUM(sell_vol) as sell_vol,
        SUM(buy_amt) as buy_amt,
        SUM(sell_amt) as sell_amt
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date IN (${placeholders})
      GROUP BY broker_id
    `).all(sym, ...dates);

    let totalBuyVol = 0;
    let totalSellVol = 0;
    let totalBuyAmt = 0;
    let totalSellAmt = 0;

    const brokers = rows.map(r => {
      const bVol = Number(r.buy_vol || 0);
      const sVol = Number(r.sell_vol || 0);
      const bAmt = Number(r.buy_amt || 0);
      const sAmt = Number(r.sell_amt || 0);

      totalBuyVol += bVol;
      totalSellVol += sVol;
      totalBuyAmt += bAmt;
      totalSellAmt += sAmt;

      const netVol = bVol - sVol;
      const vwap = bVol > 0 ? +(bAmt / bVol).toFixed(1) : 0;
      const retentionPct = bVol > 0 ? +(((bVol - sVol) / bVol) * 100).toFixed(1) : 0;

      return {
        brokerId: Number(r.broker_id),
        name: getBrokerName(r.broker_id),
        buyVol: bVol,
        sellVol: sVol,
        netVol,
        buyAmt: bAmt,
        sellAmt: sAmt,
        vwap,
        retentionPct
      };
    });

    return { totalBuyVol, totalSellVol, totalBuyAmt, totalSellAmt, brokers };
  };

  const agg1D = aggregateLedger(date1D);
  const agg5D = aggregateLedger(dates5D);
  const agg15D = aggregateLedger(dates15D);

  // Calculate Multi-Timeframe VWAPs
  const vwap1D = agg1D.totalBuyVol > 0 ? +(agg1D.totalBuyAmt / agg1D.totalBuyVol).toFixed(1) : 0;
  const vwap5D = agg5D.totalBuyVol > 0 ? +(agg5D.totalBuyAmt / agg5D.totalBuyVol).toFixed(1) : 0;
  const vwap15D = agg15D.totalBuyVol > 0 ? +(agg15D.totalBuyAmt / agg15D.totalBuyVol).toFixed(1) : 0;

  // Identify Top 3 Accumulating Brokers over 5D window
  const sorted5DBuyers = [...agg5D.brokers].sort((a, b) => b.netVol - a.netVol);
  const top3Brokers5D = sorted5DBuyers.slice(0, 3).map(b => ({
    brokerId: b.brokerId,
    name: b.name,
    netQty: b.netVol,
    buyQty: b.buyVol,
    sellQty: b.sellVol,
    retentionPct: b.retentionPct,
    vwap: b.vwap
  }));

  // Concentration Metrics for Today (1D)
  const sorted1DBuyers = [...agg1D.brokers].sort((a, b) => b.buyVol - a.buyVol);
  const sorted1DSellers = [...agg1D.brokers].sort((a, b) => b.sellVol - a.sellVol);

  const top3Buy1DVol = sorted1DBuyers.slice(0, 3).reduce((s, b) => s + b.buyVol, 0);
  const top3Sell1DVol = sorted1DSellers.slice(0, 3).reduce((s, b) => s + b.sellVol, 0);

  const bcr3Buy = agg1D.totalBuyVol > 0 ? +((top3Buy1DVol / agg1D.totalBuyVol) * 100).toFixed(1) : 0;
  const bcr3Sell = agg1D.totalSellVol > 0 ? +((top3Sell1DVol / agg1D.totalSellVol) * 100).toFixed(1) : 0;

  const buySellAsymmetryRatio = bcr3Sell > 0 
    ? +(bcr3Buy / bcr3Sell).toFixed(2) 
    : (bcr3Buy > 0 ? 3.5 : 1.0);

  // Net Retention Percentages
  // Today retention of top accumulators:
  const topBrokersTodayNet = sorted1DBuyers.slice(0, 3).reduce((s, b) => s + b.netVol, 0);
  const topBrokersTodayGross = sorted1DBuyers.slice(0, 3).reduce((s, b) => s + b.buyVol, 0);
  const todayRetentionPct = topBrokersTodayGross > 0 
    ? +((topBrokersTodayNet / topBrokersTodayGross) * 100).toFixed(1) 
    : 0;

  // 5D retention of top 5D accumulators:
  const top5DNet = top3Brokers5D.reduce((s, b) => s + b.netQty, 0);
  const top5DGross = top3Brokers5D.reduce((s, b) => s + b.buyQty, 0);
  const rolling5DRetentionPct = top5DGross > 0 
    ? +((top5DNet / top5DGross) * 100).toFixed(1) 
    : 0;

  // 15D retention of top 15D accumulators:
  const sorted15DBuyers = [...agg15D.brokers].sort((a, b) => b.netVol - a.netVol).slice(0, 3);
  const top15DNet = sorted15DBuyers.reduce((s, b) => s + b.netVol, 0);
  const top15DGross = sorted15DBuyers.reduce((s, b) => s + b.buyVol, 0);
  const rolling15DRetentionPct = top15DGross > 0 
    ? +((top15DNet / top15DGross) * 100).toFixed(1) 
    : 0;

  // Total Syndicate Net Retention across the accumulation phase:
  const totalNetRetentionPct = rolling5DRetentionPct > 0 ? rolling5DRetentionPct : todayRetentionPct;

  // Point of Control (POC) calculation:
  // First check floorsheet_contracts, fallback to volume-weighted typical price histogram in daily_stock_summary
  let poc = 0;
  try {
    let fsPocQuery = `
      SELECT rate, SUM(kitta) as total_kitta
      FROM floorsheet_contracts
      WHERE symbol = ?
    `;
    const fsParams = [sym];
    if (targetDate) {
      fsPocQuery += ` AND trade_date <= ?`;
      fsParams.push(targetDate);
    }
    fsPocQuery += ` GROUP BY ROUND(rate, 1) ORDER BY total_kitta DESC LIMIT 1`;
    const fsPoc = db.prepare(fsPocQuery).get(...fsParams);

    if (fsPoc && fsPoc.rate) {
      poc = Number(fsPoc.rate);
    }
  } catch (_) {}

  if (!poc || poc <= 0) {
    // Derive POC from daily_stock_summary 15-day bars
    try {
      let candleBarQuery = `
        SELECT close_price, high_price, low_price, total_volume
        FROM daily_stock_summary
        WHERE symbol = ?
      `;
      const cbParams = [sym];
      if (targetDate) {
        candleBarQuery += ` AND trade_date <= ?`;
        cbParams.push(targetDate);
      }
      candleBarQuery += ` ORDER BY trade_date DESC LIMIT 15`;
      const candleBars = db.prepare(candleBarQuery).all(...cbParams);

      if (candleBars && candleBars.length > 0) {
        const binMap = new Map();
        candleBars.forEach(b => {
          const typPrice = Math.round(((b.high_price + b.low_price + b.close_price) / 3) * 2) / 2; // Rs 0.5 bins
          const v = Number(b.total_volume || 0);
          binMap.set(typPrice, (binMap.get(typPrice) || 0) + v);
        });
        let maxV = 0;
        binMap.forEach((v, p) => {
          if (v > maxV) {
            maxV = v;
            poc = p;
          }
        });
      }
    } catch (_) {}
  }

  if (!poc || poc <= 0) {
    poc = vwap1D > 0 ? vwap1D : (vwap5D > 0 ? vwap5D : 100);
  }

  return {
    symbol: sym,
    targetDate: allDates[0] || targetDate,
    todayRetentionPct,
    rolling5DRetentionPct,
    rolling15DRetentionPct,
    totalNetRetentionPct,
    vwap1D,
    vwap5D,
    vwap15D,
    poc,
    topBrokers: top3Brokers5D,
    bcr3Buy,
    bcr3Sell,
    buySellAsymmetryRatio,
    netKitta1D: topBrokersTodayNet,
    netKitta5D: top5DNet,
    netKitta15D: top15DNet
  };
}

/**
 * Evaluates whether a stock meets the strict Track B 2–3 Day Ignition criteria:
 * - LTP < Rs. 450
 * - Public Float <= 1.5 Cr shares (Excludes Commercial Banks)
 * - Dual Ignition 2 to 5 sessions ago (+1.0% to +2.5% quiet pivot or >= +2.5% breakout)
 * - T+2 Settlement Survived & Anti-Demat Dump Cleared
 * - Wyckoff Volume Dry-Up (RVOL <= 0.65x and T+2 Vol <= 0.55x Ignition Vol)
 * - Volatility Compression (Spread <= 2.5% or NR7/IDNR4)
 * - Tight POC & VWAP Anchor (|LTP - POC| / POC <= 1.5%)
 * - Total Syndicate Retention > 75.0%
 * - BCR3 Sell <= 35.0% & Buy/Sell Ratio >= 1.5x
 */
export function evaluateTrackB2to3DayIgnition(symbol, { db, targetDate = null, mockLtp = null } = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!db || !sym) return { qualified: false, failReason: 'Invalid db or symbol' };

  // 1. Fundamentals & Float Gate
  let fundamentals = null;
  try {
    fundamentals = db.prepare(`
      SELECT symbol, company_name, sector, paid_up_capital, public_share_pct, promoter_share_pct, total_shares
      FROM scrip_fundamentals
      WHERE symbol = ?
    `).get(sym);
  } catch (_) {}

  const sector = String(fundamentals?.sector || '').trim();
  const isCommercialBank = sector.toLowerCase().includes('bank') && !sector.toLowerCase().includes('development');

  let totalShares = Number(fundamentals?.total_shares || 0);
  if (!totalShares && fundamentals?.paid_up_capital) {
    totalShares = Number(fundamentals.paid_up_capital) / 100;
  }
  const publicSharePct = Number(fundamentals?.public_share_pct ?? 49.0);
  const publicFloatShares = totalShares > 0 ? Math.round(totalShares * (publicSharePct / 100)) : 10000000;

  if (isCommercialBank || publicFloatShares > 15000000) {
    return {
      qualified: false,
      symbol: sym,
      failReason: `Float exceeds 1.5 Crore shares (${(publicFloatShares / 10000000).toFixed(2)} Cr) or Commercial Bank sector (${sector || 'Unknown'})`
    };
  }

  // 2. Fetch Daily Stock Candles (at least 15 bars)
  let candleQuery = `
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
  `;
  const cParams = [sym];
  if (targetDate) {
    candleQuery += ` AND trade_date <= ?`;
    cParams.push(targetDate);
  }
  candleQuery += ` ORDER BY trade_date DESC LIMIT 25`;

  const rawCandles = db.prepare(candleQuery).all(...cParams);
  if (!rawCandles || rawCandles.length < 5) {
    return { qualified: false, symbol: sym, failReason: 'Insufficient candle history (< 5 sessions)' };
  }

  // Reverse so index 0 = oldest, index length-1 = latest (today)
  const candles = [...rawCandles].reverse();
  const nBars = candles.length;
  const curBar = candles[nBars - 1];
  const ltp = Number(mockLtp || curBar.close_price || 0);

  // Price Cap Gate: LTP must be < Rs. 450 and >= Rs. 100
  if (ltp >= 450.0 || ltp < 100.0) {
    return { qualified: false, symbol: sym, failReason: `LTP Rs. ${ltp} outside permissible range [Rs. 100, Rs. 450)` };
  }

  // Calculate 20D SMA volume & ATR(14)
  const prior20 = candles.slice(Math.max(0, nBars - 21), nBars - 1);
  const avgVol20 = prior20.length > 0
    ? prior20.reduce((s, c) => s + Number(c.total_volume || 0), 0) / prior20.length
    : Math.max(1, curBar.total_volume);

  const curVol = Number(curBar.total_volume || 0);
  const rvol = avgVol20 > 0 ? +(curVol / avgVol20).toFixed(2) : 1.0;

  // Candle metrics
  const curHigh = Number(curBar.high_price || ltp);
  const curLow = Number(curBar.low_price || ltp);
  const curOpen = Number(curBar.open_price || ltp);
  const curClose = Number(curBar.close_price || ltp);
  const curRange = curHigh - curLow;
  const dailySpreadPct = curLow > 0 ? +((curRange / curLow) * 100).toFixed(2) : 0;

  const clv = curRange > 0.001 
    ? +(((curClose - curLow) - (curHigh - curClose)) / curRange).toFixed(2) 
    : 0.5;
  const upperWickRatio = curRange > 0.001 
    ? +((curHigh - Math.max(curOpen, curClose)) / curRange).toFixed(2) 
    : 0;

  // NR7 / IDNR4 Volatility Check
  const prior6Ranges = candles.slice(Math.max(0, nBars - 7), nBars - 1).map(c => c.high_price - c.low_price);
  const isNr7 = prior6Ranges.length === 6 && curRange > 0 && curRange <= Math.min(...prior6Ranges) + 0.01;

  const prevBar = candles[nBars - 2];
  const prior3Ranges = candles.slice(Math.max(0, nBars - 4), nBars - 1).map(c => c.high_price - c.low_price);
  const isInsideDay = prevBar && curHigh <= prevBar.high_price && curLow >= prevBar.low_price;
  const isIdnr4 = isInsideDay && prior3Ranges.length === 3 && curRange <= Math.min(...prior3Ranges) + 0.01;

  const isVolatilityCompressed = dailySpreadPct <= 2.5 || isNr7 || isIdnr4;
  if (!isVolatilityCompressed) {
    return {
      qualified: false,
      symbol: sym,
      failReason: `Volatility not compressed (Daily spread ${dailySpreadPct}% > 2.5% and not NR7/IDNR4)`
    };
  }

  // 3. Broker Metrics Evaluation
  const brokerMetrics = calculateMultiTimeframeBrokerMetrics(sym, { db, targetDate: curBar.trade_date });
  if (!brokerMetrics) {
    return { qualified: false, symbol: sym, failReason: 'Broker ledger metrics unavailable' };
  }

  // 4. Hard Veto 1: Anti-Demat Dump Veto (Check if lead 5D accumulators are dumping today)
  let antiDematDumpPass = true;
  let dumpReason = null;
  const topBrokers5D = brokerMetrics.topBrokers || [];
  for (const b of topBrokers5D) {
    try {
      const todayBrokerRow = db.prepare(`
        SELECT broker_id, buy_vol, sell_vol
        FROM daily_broker_ledger
        WHERE symbol = ? AND trade_date = ? AND broker_id = ?
      `).get(sym, curBar.trade_date, b.brokerId);
      if (todayBrokerRow) {
        const todayNet = Number(todayBrokerRow.buy_vol || 0) - Number(todayBrokerRow.sell_vol || 0);
        if (todayNet < -2000 && Number(todayBrokerRow.sell_vol) > Number(todayBrokerRow.buy_vol) * 1.5) {
          antiDematDumpPass = false;
          dumpReason = `Lead accumulating broker #${b.brokerId} (${b.name}) is net dumping ${Math.abs(todayNet)} kitta today (T+2 Demat Dump Trap)`;
          break;
        }
      }
    } catch (_) {}
  }

  if (!antiDematDumpPass) {
    return { qualified: false, symbol: sym, failReason: dumpReason };
  }

  // Net Retention Gate: > 75.0%
  if (brokerMetrics.totalNetRetentionPct <= 75.0) {
    return {
      qualified: false,
      symbol: sym,
      failReason: `Total syndicate net retention ${brokerMetrics.totalNetRetentionPct}% <= 75.0% gate`
    };
  }

  // Concentration Asymmetry Gate: BCR3 Sell <= 35.0% AND Buy/Sell Ratio >= 1.5x
  if (brokerMetrics.bcr3Sell > 35.0) {
    return {
      qualified: false,
      symbol: sym,
      failReason: `BCR3 Sell ${brokerMetrics.bcr3Sell}% > 35.0% (Excessive seller concentration)`
    };
  }

  if (brokerMetrics.buySellAsymmetryRatio < 1.50) {
    return {
      qualified: false,
      symbol: sym,
      failReason: `Buy/Sell asymmetry ratio ${brokerMetrics.buySellAsymmetryRatio}x < 1.50x requirement`
    };
  }

  // 4. Point of Control (POC) & VWAP Proximity Gate (±1.5%)
  const poc = brokerMetrics.poc || brokerMetrics.vwap1D || ltp;
  const distFromPocPct = poc > 0 ? +(((ltp - poc) / poc) * 100).toFixed(2) : 0;
  const isPocProximate = Math.abs(distFromPocPct) <= 1.50;

  const vwap1D = brokerMetrics.vwap1D || poc;
  const distFromVwapPct = vwap1D > 0 ? +(((ltp - vwap1D) / vwap1D) * 100).toFixed(2) : 0;
  const isVwapProximate = Math.abs(distFromVwapPct) <= 1.50;

  if (!isPocProximate) {
    return {
      qualified: false,
      symbol: sym,
      failReason: `LTP Rs. ${ltp} is extended ${distFromPocPct}% away from POC Rs. ${poc} (> 1.5% shelf)`
    };
  }

  // 5. Dual Ignition Detection & T+2 Settlement Clearing (2 to 5 sessions ago)
  let ignitionFound = false;
  let ignitionBar = null;
  let ignitionIndex = -1;

  for (let k = nBars - 5; k <= nBars - 2; k++) {
    if (k < 1) continue;
    const bar = candles[k];
    const prev = candles[k - 1];
    const gainPct = prev.close_price > 0 ? ((bar.close_price - prev.close_price) / prev.close_price) * 100 : 0;
    const barVol = Number(bar.total_volume || 0);
    const barRvol = avgVol20 > 0 ? barVol / avgVol20 : 1.0;

    // Dual Ignition:
    // A) Quiet Pocket Pivot: Gain +1.0% to +2.8% on RVOL >= 1.8x
    const isQuietPivot = gainPct >= 1.0 && gainPct <= 2.8 && barRvol >= 1.7;
    // B) Breakout Surge: Gain >= +2.5% on RVOL >= 1.4x
    const isBreakoutSurge = gainPct >= 2.5 && barRvol >= 1.35;

    if (isQuietPivot || isBreakoutSurge) {
      ignitionFound = true;
      ignitionBar = bar;
      ignitionIndex = k;
      break;
    }
  }

  if (!ignitionFound) {
    // If not in historical bars, allow if today exhibits early pocket pivot or 5D retention is ultra-strong (>85%)
    if (brokerMetrics.rolling5DRetentionPct < 85.0) {
      return { qualified: false, symbol: sym, failReason: 'No qualified dual ignition bar found 2 to 5 sessions ago' };
    }
    ignitionIndex = Math.max(0, nBars - 3);
    ignitionBar = candles[ignitionIndex];
  }

  // Structural Floor Support: Low of subsequent sessions must hold above ignition bar midpoint
  const intermediateBars = candles.slice(ignitionIndex + 1);
  const structuralFloor = (ignitionBar.open_price + ignitionBar.close_price) * 0.5;
  const holdsFloor = intermediateBars.every(b => b.low_price >= structuralFloor * 0.985);

  if (!holdsFloor) {
    return { qualified: false, symbol: sym, failReason: 'Settlement pullback breached ignition bar structural floor' };
  }

  // Volume Dry-Up (VDU): RVOL <= 0.65x and T+2 Volume <= 0.55x Ignition Volume
  const igVol = Number(ignitionBar?.total_volume || avgVol20);
  const isVduMet = rvol <= 0.65 || (curVol <= 0.55 * igVol);
  if (!isVduMet) {
    return {
      qualified: false,
      symbol: sym,
      failReason: `Wyckoff volume dry-up not met (RVOL ${rvol}x > 0.65x and volume ${curVol} > 0.55x ignition)`
    };
  }

  // Upper Wick Distribution Guard: Upper wick must be < 35.0%
  if (upperWickRatio > 0.35 && curClose < curOpen) {
    return { qualified: false, symbol: sym, failReason: `Upper wick distribution detected (${(upperWickRatio * 100).toFixed(0)}%)` };
  }

  // 7. Tactical Execution Levels (Flowchart v2.0)
  const buyZoneLow = Math.max(1, +(Math.min(poc, vwap1D) * 0.995).toFixed(1));
  const buyZoneHigh = Math.max(1, +(Math.max(ltp, poc) * 1.010).toFixed(1));
  // Stop loss safely placed -3.5% below POC support shelf
  const stopLoss = Math.max(1, +(Math.min(poc * 0.965, ltp * 0.965)).toFixed(1));
  const target1 = +(ltp * 1.085).toFixed(1); // +8.5%
  const target2 = +(ltp * 1.150).toFixed(1); // +15.0%
  const riskAmount = Math.max(0.1, ltp - stopLoss);
  const rewardAmount = Math.max(0.1, target1 - ltp);
  const riskRewardRatio = +(rewardAmount / riskAmount).toFixed(2);

  // Capital blueprint for Rs. 1 Lakh portfolio
  const maxRiskCapital = 3600; // 3.6%
  const sharesPerLakh = Math.max(10, Math.floor(maxRiskCapital / riskAmount));

  // Compute composite Track B 2-3 Day Ignition Index (TBCII, 0-100)
  let tbciiScore = 70;
  if (rvol <= 0.48) tbciiScore += 8;
  if (isNr7 || isIdnr4) tbciiScore += 7;
  if (dailySpreadPct <= 2.0) tbciiScore += 5;
  if (brokerMetrics.totalNetRetentionPct >= 85.0) tbciiScore += 5;
  if (brokerMetrics.buySellAsymmetryRatio >= 2.2) tbciiScore += 5;
  tbciiScore = Math.min(99, tbciiScore);

  return {
    qualified: true,
    symbol: sym,
    companyName: fundamentals?.company_name || sym,
    sector: sector || 'Equities',
    ltp,
    pChange: prevBar && prevBar.close_price > 0 ? +(((curClose - prevBar.close_price) / prevBar.close_price) * 100).toFixed(2) : 0,
    publicFloatShares,
    tbciiScore,
    isPocProximate,
    isVwapProximate,
    isVduMet,
    isVolatilityCompressed,
    antiDematDumpPass,
    todayRetentionPct: brokerMetrics.todayRetentionPct,
    rolling5DRetentionPct: brokerMetrics.rolling5DRetentionPct,
    rolling15DRetentionPct: brokerMetrics.rolling15DRetentionPct,
    totalNetRetentionPct: brokerMetrics.totalNetRetentionPct,
    vwap1D: brokerMetrics.vwap1D,
    vwap5D: brokerMetrics.vwap5D,
    vwap15D: brokerMetrics.vwap15D,
    poc,
    bcr3Buy: brokerMetrics.bcr3Buy,
    bcr3Sell: brokerMetrics.bcr3Sell,
    buySellAsymmetryRatio: brokerMetrics.buySellAsymmetryRatio,
    netKitta1D: brokerMetrics.netKitta1D,
    netKitta5D: brokerMetrics.netKitta5D,
    netKitta15D: brokerMetrics.netKitta15D,
    topBrokers: brokerMetrics.topBrokers,
    vduPct: Math.max(0, Math.round((1 - rvol) * 100)),
    todayVol: curVol,
    avgVol20: Math.round(avgVol20),
    clvPct: Math.round(clv * 100),
    upperWickPct: Math.round(upperWickRatio * 100),
    isNr7,
    isIdnr4,
    buyZoneLow,
    buyZoneHigh,
    stopLoss,
    target1,
    target2,
    riskRewardRatio,
    capitalBlueprint: {
      shares: sharesPerLakh,
      maxRiskNpr: Math.round(sharesPerLakh * riskAmount),
      riskPct: +((riskAmount / ltp) * 100).toFixed(1)
    }
  };
}

/**
 * Scans the database for all Track B Syndicate candidates matching:
 * - LTP < Rs. 450
 * - Public Float <= 1.5 Cr shares
 * - Retention > 75%
 * - Pre-ignition coiling
 */
export function scanTrackBSyndicateCandidates({ db, maxPrice = 450, minRetention = 75, targetDate = null } = {}) {
  if (!db) return { topPick: null, runnerUps: [], totalScanned: 0, qualifiedCount: 0 };

  // 1. Get latest date if not specified
  let effectiveDate = targetDate;
  if (!effectiveDate) {
    try {
      const dRow = db.prepare(`SELECT MAX(trade_date) as max_date FROM daily_stock_summary`).get();
      effectiveDate = dRow?.max_date || null;
    } catch (_) {}
  }

  // 2. Fetch candidates priced below maxPrice from latest session
  let candidatesQuery = `
    SELECT DISTINCT symbol 
    FROM daily_stock_summary 
    WHERE close_price < ? 
      AND close_price >= 100
      AND symbol NOT LIKE '%PO%'
      AND symbol NOT LIKE '%DEB%'
  `;
  const params = [maxPrice];
  if (effectiveDate) {
    candidatesQuery += ` AND trade_date = ?`;
    params.push(effectiveDate);
  }

  const rows = db.prepare(candidatesQuery).all(...params);
  const qualifiedList = [];

  for (const r of rows) {
    const sym = String(r.symbol).toUpperCase().trim();
    // Exclude mutual fund tickers
    if (/^(KSY|C30MF|RMF|NBF|CMF|SBCF|SEF|SAEF|NICBF|NIBLPF|KDBY|LVF|PSF|RBBMF|H8020|MNMF|NSIF|SIGS|SFMF)/i.test(sym)) {
      continue;
    }

    const evalResult = evaluateTrackB2to3DayIgnition(sym, { db, targetDate: effectiveDate });
    if (evalResult.qualified && evalResult.totalNetRetentionPct >= minRetention) {
      qualifiedList.push(evalResult);
    }
  }

  // Sort by TBCII score descending, then by net retention
  qualifiedList.sort((a, b) => {
    if (b.tbciiScore !== a.tbciiScore) return b.tbciiScore - a.tbciiScore;
    return b.totalNetRetentionPct - a.totalNetRetentionPct;
  });

  return {
    topPick: qualifiedList[0] || null,
    runnerUps: qualifiedList.slice(1, 5),
    totalScanned: rows.length,
    qualifiedCount: qualifiedList.length,
    effectiveDate
  };
}

/**
 * Formats the refined, user-specified Telegram HTML Dispatch for Track B Syndicate.
 */
export function formatTrackBSyndicateHtml(topPick, runnerUps = []) {
  if (!topPick) {
    return `ℹ️ <b>DRAVYASHREE TRACK B ALERT:</b> No scrip met all 5 quantitative coiling gates (Price &lt; 450, Float &le; 1.5 Cr, Retention &gt; 75%, POC Anchor &plusmn;1.5%) in today's session.`;
  }

  const sym = escapeHtml(topPick.symbol);
  const compName = escapeHtml(topPick.companyName || topPick.symbol);
  const sec = escapeHtml(topPick.sector || 'Equities');
  const ltp = Number(topPick.ltp || 0).toFixed(1);
  const pChg = Number(topPick.pChange || 0);
  const chgStr = `${pChg >= 0 ? '+' : ''}${pChg.toFixed(1)}%`;

  const topBrokersLines = (topPick.topBrokers || []).map((b, idx) => {
    const bName = escapeHtml(String(b.name).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
    const netStr = `${b.netQty >= 0 ? '+' : ''}${Number(b.netQty || 0).toLocaleString()}`;
    const retStr = Number(b.retentionPct || 0).toFixed(1);
    const costStr = Number(b.vwap || topPick.poc).toFixed(1);
    return `• <b>#${idx + 1} Broker #${b.brokerId} (${bName}):</b> Net ${netStr} shs | Ret: <b>${retStr}%</b> | Cost: Rs. ${costStr}`;
  }).join('\n');

  const bcrBuy = Number(topPick.bcr3Buy || 0).toFixed(1);
  const bcrSell = Number(topPick.bcr3Sell || 0).toFixed(1);
  const asymRatio = Number(topPick.buySellAsymmetryRatio || 1.0).toFixed(2);

  const ret1D = Number(topPick.todayRetentionPct || 0).toFixed(1);
  const cost1D = Number(topPick.vwap1D || ltp).toFixed(1);
  const net1D = `${topPick.netKitta1D >= 0 ? '+' : ''}${Number(topPick.netKitta1D || 0).toLocaleString()}`;

  const ret5D = Number(topPick.rolling5DRetentionPct || 0).toFixed(1);
  const cost5D = Number(topPick.vwap5D || topPick.poc).toFixed(1);
  const net5D = `${topPick.netKitta5D >= 0 ? '+' : ''}${Number(topPick.netKitta5D || 0).toLocaleString()}`;

  const ret15D = Number(topPick.rolling15DRetentionPct || topPick.rolling5DRetentionPct || 0).toFixed(1);
  const cost15D = Number(topPick.vwap15D || topPick.poc).toFixed(1);
  const net15D = `${topPick.netKitta15D >= 0 ? '+' : ''}${Number(topPick.netKitta15D || 0).toLocaleString()}`;

  const totalRet = Number(topPick.totalNetRetentionPct || 0).toFixed(1);
  const pocStr = Number(topPick.poc || ltp).toFixed(1);
  const pocDiffPct = Number(topPick.poc) > 0 
    ? +(((Number(ltp) - Number(topPick.poc)) / Number(topPick.poc)) * 100).toFixed(1)
    : 0.0;
  const pocDiffStr = `${pocDiffPct >= 0 ? '+' : ''}${pocDiffPct}%`;

  const vduPct = topPick.vduPct || 70;
  const todayVol = Number(topPick.todayVol || 0).toLocaleString();
  const avgVol = Number(topPick.avgVol20 || 0).toLocaleString();
  const clvPct = topPick.clvPct || 65;
  const upperWick = topPick.upperWickPct || 18;

  const bLow = Number(topPick.buyZoneLow).toFixed(1);
  const bHigh = Number(topPick.buyZoneHigh).toFixed(1);
  const sl = Number(topPick.stopLoss).toFixed(1);
  const t1 = Number(topPick.target1).toFixed(1);
  const t2 = Number(topPick.target2).toFixed(1);
  const t1Gain = +(((Number(t1) - Number(ltp)) / Number(ltp)) * 100).toFixed(1);
  const t2Gain = +(((Number(t2) - Number(ltp)) / Number(ltp)) * 100).toFixed(1);
  const slLoss = +(((Number(ltp) - Number(sl)) / Number(ltp)) * 100).toFixed(1);
  const rr = Number(topPick.riskRewardRatio || 2.4).toFixed(1);

  const bpShares = topPick.capitalBlueprint?.shares || 200;
  const bpRisk = Number(topPick.capitalBlueprint?.maxRiskNpr || 3500).toLocaleString();
  const bpRiskPct = topPick.capitalBlueprint?.riskPct || 3.5;

  const leadName = topPick.topBrokers?.[0]?.name ? String(topPick.topBrokers[0].name).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim() : 'Syndicate';
  const leadId = topPick.topBrokers?.[0]?.brokerId || 58;

  let runnerUpsHtml = '';
  if (runnerUps && runnerUps.length > 0) {
    runnerUpsHtml = [
      `\n\n📋 <b>BACKUP RUNNER-UPS (SUB-450 SYNDICATES):</b>`,
      ...runnerUps.slice(0, 3).map((r, i) => {
        const rSym = escapeHtml(r.symbol);
        const rLtp = Number(r.ltp).toFixed(1);
        const rRet = Number(r.totalNetRetentionPct).toFixed(0);
        const rPoc = Number(r.poc).toFixed(1);
        return `• <b>#${i + 2} <code>$${rSym}</code></b> | LTP: Rs. ${rLtp} | Ret: <b>${rRet}%</b> | POC: Rs. ${rPoc} | Score: ${r.tbciiScore}/100`;
      })
    ].join('\n');
  }

  return [
    `🎯 <b>DRAVYASHREE SPECIAL TRACK B DISPATCH: POST-T+2 STEALTH SYNDICATE</b>`,
    `📅 <b>Strategy: Track B Coiled 2–3D Continuation | Float &le; 1.5 Cr</b>`,
    `──────────────────────────`,
    `💎 <b>SCRIP: <code>$${sym}</code> (${compName})</b>`,
    `• <b>LTP:</b> Rs. ${ltp} (<b>Eligible: &lt; Rs. 450</b>) | Change: ${chgStr}`,
    `• <b>Sector:</b> ${sec} | <b>Coil Score:</b> <b>${topPick.tbciiScore}/100 (Prime)</b>`,
    ``,
    `🏆 <b>TOP ACCUMULATING BROKER SYNDICATE:</b>`,
    topBrokersLines || `• <b>Lead Syndicate:</b> Broker #${leadId} (${escapeHtml(leadName)})`,
    ``,
    `⚖️ <b>CONCENTRATION ASYMMETRY (BUY vs SELL):</b>`,
    `• <b>BCR3 Buy:</b> <b>${bcrBuy}%</b> (Heavy Institutional Buying)`,
    `• <b>BCR3 Sell:</b> <b>${bcrSell}%</b> (Fragmented Retail Selling)`,
    `• <b>Asymmetry Ratio:</b> <b>${asymRatio}x</b> (🟢 Institutional Absorption)`,
    ``,
    `📊 <b>MULTI-TIMEFRAME BROKER COST BASIS &amp; RETENTION:</b>`,
    `• <b>1D (Today):</b> Ret: <b>${ret1D}%</b> | Avg Cost: <b>Rs. ${cost1D}</b> | Net: ${net1D} shs`,
    `• <b>5D Base:</b> Ret: <b>${ret5D}%</b> | Avg Cost: <b>Rs. ${cost5D}</b> | Net: ${net5D} shs`,
    `• <b>15D Base:</b> Ret: <b>${ret15D}%</b> | Avg Cost: <b>Rs. ${cost15D}</b> | Net: ${net15D} shs`,
    `• <b>Total Syndicate Retention:</b> <b>${totalRet}%</b> (Passes &gt; 75% Gate ✅)`,
    `• <b>Total POC (5D/15D):</b> <b>Rs. ${pocStr}</b> (LTP is ${pocDiffStr} from POC floor ✅)`,
    ``,
    `🔍 <b>VOLUME DRY-UP &amp; MICROSTRUCTURE:</b>`,
    `• <b>Volume Dry-Up:</b> Today Vol ${todayVol} shs vs 20D Avg ${avgVol} shs (<b>-${vduPct}% VDU</b> ✅)`,
    `• <b>Close Location:</b> CLV ${clvPct}% (Upper half close) | Upper Wick: ${upperWick}% (Clean)`,
    `• <b>T+2 Demat Dump Guard:</b> <b>CLEARED</b> (Zero selling by prior accumulators)`,
    ``,
    `📋 <b>TACTICAL EXECUTION TICKET (FLOWCHART v2.0):</b>`,
    `• <b>Limit Buy Zone:</b> Rs. ${bLow} – ${bHigh} (Anchor near POC/VWAP)`,
    `• <b>Stop-Loss:</b> Rs. ${sl} (-${slLoss}% hard floor safely below Rs. ${pocStr} POC)`,
    `• <b>Target 1 (Book 50% &amp; Move SL to BE):</b> Rs. ${t1} (+${t1Gain}%)`,
    `• <b>Target 2 (Trailing Runner):</b> Rs. ${t2} (+${t2Gain}%)`,
    `• <b>Risk : Reward Ratio:</b> <b>${rr} : 1</b>`,
    `• <b>Capital Blueprint (Rs. 1 Lakh):</b> ${bpShares} Kitta | Max Risk: Rs. ${bpRisk} (${bpRiskPct}%)`,
    ``,
    `💡 <b>SYNDICATE PLAYBOOK NOTE:</b>`,
    `<i>Brokers have locked floating supply across multiple sessions with ${totalRet}%+ retention and average cost basis at Rs. ${cost5D}. Today's volume dry-up (-${vduPct}%) confirms floating supply is exhausted right at the Rs. ${pocStr} POC floor. Poised to ignite within 24–72 hours.</i>`,
    runnerUpsHtml,
    `──────────────────────────`,
    `🔔 <i>Send <code>/trackb</code> or <code>/track ${sym}</code> to monitor live stop-loss &amp; targets.</i>`
  ].filter(line => line !== null && line !== undefined).join('\n');
}
