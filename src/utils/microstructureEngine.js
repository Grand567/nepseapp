/**
 * microstructureEngine.js
 * Rolling-Window Microstructure & Institutional Flow Aggregation Engine
 *
 * Implements exact mathematical formulas for:
 * 1. Multi-Day Institutional VWAP (VWAP_N = sum(Turnover) / sum(Volume))
 * 2. Net Broker Position (NetVol_{b,N} = sum(BuyVol_{b,t}) - sum(SellVol_{b,t}))
 * 3. Seller Concentration Ratio (SCR3_N = sum(TopNetSellerVol_{1..3}) / sum(Volume) * 100)
 * 4. Buyer Concentration Ratio (BCR5_N = sum(TopNetBuyerVol_{1..5}) / sum(Volume) * 100)
 * 5. Independent Gross Top-5 Buying vs Selling Concentration
 * 6. True multi-day wash trade cancellation and absorption consistency
 * 7. Wyckoff phase classification & Safe Buy Zone bounds
 */

export const PHASE_DEFINITIONS = {
  STEALTH_ACCUMULATION: {
    title: "Stealth Accumulation",
    badge: "🟢 Institutional Quiet Buying",
    criteria: "Top-5 Net Buyer Absorption ≥ 18% | Top-3 Seller Concentration < 14% | Price Change within ±4.5%",
    explanation: "Big brokers are quietly absorbing supply over multiple sessions while keeping the price compressed so retail traders do not notice the breakout setup yet."
  },
  ACTIVE_MARKUP: {
    title: "Active Markup",
    badge: "🚀 Institutional Momentum",
    criteria: "Top-5 Net Buyer Absorption ≥ 15% | Price Change > +4.5% | Price > Big Broker VWAP",
    explanation: "Accumulation is complete and institutional buyers are actively bidding up the price with strong volume support."
  },
  DISTRIBUTION_DANGER: {
    title: "Distribution Danger",
    badge: "🔴 Smart Money Exit",
    criteria: "Top-3 Seller Concentration (SCR3) ≥ 18% | Net Smart Money Flow < -6%",
    explanation: "Top institutional holders are systematically offloading large blocks into retail demand."
  },
  BULL_TRAP: {
    title: "Bull Trap / Retail Hype",
    badge: "⚠️ High Trap Risk",
    criteria: "SCR3 ≥ 20% while Price rises > +2.5% on dispersed retail buying",
    explanation: "Price is rising temporarily, but heavy top-seller concentration shows smart money is using the green candle as exit liquidity."
  },
  NEUTRAL_RETAIL: {
    title: "Normal Retail Flow",
    badge: "⚪ Balanced Order Book",
    criteria: "Evenly dispersed buy/sell orders without dominant broker cornering",
    explanation: "Trading is distributed across broad retail participants without asymmetric institutional dominance."
  }
};

export const TOP_NEPSE_BROKERS = {
  "58": "Naasa Securities (#58)",
  "45": "Imperial Securities (#45)",
  "34": "Vision Securities (#34)",
  "49": "Online Securities (#49)",
  "57": "Aryatara Investment (#57)",
  "42": "Sani Securities (#42)",
  "38": "Dipshikha Dhitopatra (#38)",
  "28": "Shree Krishna Securities (#28)",
  "17": "ABC Securities (#17)",
  "50": "Crista Securities (#50)",
  "35": "Kohinoor Investment (#35)",
  "59": "Dakshinkali Investment (#59)",
  "14": "Nepal Stock House (#14)",
  "25": "Sweta Securities (#25)",
  "81": "Broker #81",
  "65": "Broker #65",
  "33": "Dakshinkali Securities (#33)",
  "44": "Dynamic Money (#44)",
  "53": "Investment Management (#53)",
  "41": "Lincon Securities (#41)"
};

/**
 * Finds the exact trading date (YYYY-MM-DD) when a broker or top syndicate
 * began its current accumulation or dumping cycle within the window.
 * @param {Array<{date: string, netVol: number}>} chronologicalSeries - Ordered newest first [day0, day1, ...]
 * @param {'ACCUMULATING' | 'DUMPING'} direction
 */
export function detectCycleStartDate(chronologicalSeries, direction = "ACCUMULATING") {
  if (!Array.isArray(chronologicalSeries) || chronologicalSeries.length === 0) {
    return { startDate: null, streakDays: 0, activeDaysCount: 0, consistencyPct: 0 };
  }

  // Sort strictly oldest -> newest to calculate cumulative trough/peak inflection
  const oldestFirst = [...chronologicalSeries].sort((a, b) => {
    const da = String(a.date || '');
    const db = String(b.date || '');
    return da.localeCompare(db);
  });

  const isAccum = direction === "ACCUMULATING" || direction === true || direction === "BUY";

  let cumulativeNet = 0;
  let minCumulative = 0;
  let maxCumulative = 0;
  let inflectionDateAccum = oldestFirst[0]?.date || null;
  let inflectionDateDump = oldestFirst[0]?.date || null;

  let accumDays = 0;
  let dumpDays = 0;

  for (const pt of oldestFirst) {
    const vol = Number(pt.netVol ?? pt.netQty ?? 0);
    if (vol > 0) accumDays++;
    if (vol < 0) dumpDays++;

    cumulativeNet += vol;
    if (cumulativeNet <= minCumulative) {
      minCumulative = cumulativeNet;
      inflectionDateAccum = pt.date;
    }
    if (cumulativeNet >= maxCumulative) {
      maxCumulative = cumulativeNet;
      inflectionDateDump = pt.date;
    }
  }

  const totalActive = oldestFirst.length;
  if (isAccum) {
    // Find first net-buy date on or after the cumulative trough
    const startIdx = oldestFirst.findIndex((d) => {
      const vol = Number(d.netVol ?? d.netQty ?? 0);
      return String(d.date || '') >= inflectionDateAccum && vol > 0;
    });
    const startDate = startIdx >= 0 ? oldestFirst[startIdx].date : oldestFirst[0].date;
    const streakDays = startIdx >= 0 ? oldestFirst.length - startIdx : accumDays;
    const consistencyPct = totalActive > 0 ? Number(((accumDays / totalActive) * 100).toFixed(0)) : 0;
    return { startDate, streakDays, activeDaysCount: accumDays, totalActive, consistencyPct };
  } else {
    // Find first net-sell date on or after the cumulative peak
    const startIdx = oldestFirst.findIndex((d) => {
      const vol = Number(d.netVol ?? d.netQty ?? 0);
      return String(d.date || '') >= inflectionDateDump && vol < 0;
    });
    const startDate = startIdx >= 0 ? oldestFirst[startIdx].date : oldestFirst[0].date;
    const streakDays = startIdx >= 0 ? oldestFirst.length - startIdx : dumpDays;
    const consistencyPct = totalActive > 0 ? Number(((dumpDays / totalActive) * 100).toFixed(0)) : 0;
    return { startDate, streakDays, activeDaysCount: dumpDays, totalActive, consistencyPct };
  }
}

/**
 * Aggregates N-day floorsheet/broker summaries into Radar Phases & Deep Diagnostics
 * @param {Array} dailyHistory - Array of daily stock objects sorted newest -> oldest (index 0 = latest day)
 * @param {Number} days - Timeframe window: 1, 5, 15, or 30
 */
export function calculateMultiDayDiagnostics(dailyHistory, days = 1) {
  if (!Array.isArray(dailyHistory) || dailyHistory.length === 0) return null;

  // 1. Slice the exact N-day window (fallback to available days if history < N)
  const windowData = dailyHistory.slice(0, Math.max(1, parseInt(days || 1, 10)));
  const actualDays = windowData.length;

  let totalVolume = 0;
  let totalTurnover = 0;
  let sessionsWithPositiveSmartFlow = 0;

  // Map to track cumulative volume & turnover per broker across N days
  // Key: brokerId, Value: { brokerId, buyVol, sellVol, buyAmt, sellAmt, name, dailySeries }
  const brokerLedger = new Map();

  for (const day of windowData) {
    totalVolume += Number(day.totalVolume || 0);
    totalTurnover += Number(day.totalTurnover || 0);

    let dayTopBuyerVol = 0;
    let dayTopSellerVol = 0;

    const dt = String(day.date || day.trade_date || day.businessDate || '').trim();

    // Loop through each broker's activity for that trading session
    for (const b of day.brokers || []) {
      const brokerId = String(b.brokerId || b.broker || b.id || '').trim();
      if (!brokerId) continue;

      const prev = brokerLedger.get(brokerId) || {
        brokerId,
        brokerName: TOP_NEPSE_BROKERS[brokerId] || b.brokerName || b.name || `Broker #${brokerId}`,
        buyVol: 0,
        sellVol: 0,
        buyAmt: 0,
        sellAmt: 0,
        dailySeries: []
      };

      const bVol = Number(b.buyVol || b.buyQty || b.shares || 0);
      const sVol = Number(b.sellVol || b.sellQty || 0);
      const bAmt = Number(b.buyAmt || b.buyAmount || b.amount || (bVol * Number(b.avgBuyPrice || b.rate || 0)));
      const sAmt = Number(b.sellAmt || b.sellAmount || (sVol * Number(b.avgSellPrice || b.rate || 0)));

      prev.buyVol += bVol;
      prev.sellVol += sVol;
      prev.buyAmt += bAmt;
      prev.sellAmt += sAmt;

      prev.dailySeries.push({
        date: dt,
        buyVol: bVol,
        sellVol: sVol,
        netVol: bVol - sVol,
        buyAmt: bAmt,
        sellAmt: sAmt,
        avgBuyPrice: bVol > 0 ? Number((bAmt / bVol).toFixed(2)) : 0,
        avgSellPrice: sVol > 0 ? Number((sAmt / sVol).toFixed(2)) : 0,
        close: Number(day.closePrice || day.close || day.ltp || 0)
      });

      brokerLedger.set(brokerId, prev);

      dayTopBuyerVol += bVol;
      dayTopSellerVol += sVol;
    }

    if (dayTopBuyerVol >= dayTopSellerVol && dayTopBuyerVol > 0) {
      sessionsWithPositiveSmartFlow++;
    }
  }

  if (totalVolume === 0) return null;

  const marketVWAP = totalVolume > 0 ? Number((totalTurnover / totalVolume).toFixed(2)) : 0;
  const latestDay = windowData[0];
  const oldestDay = windowData[windowData.length - 1];
  const latestClose = Number(latestDay.close || latestDay.closePrice || latestDay.close_price || latestDay.ltp || marketVWAP);
  const oldestOpen = Number(oldestDay.open || oldestDay.openPrice || oldestDay.open_price || latestClose);
  const priceChangePct = oldestOpen > 0 ? Number((((latestClose - oldestOpen) / oldestOpen) * 100).toFixed(2)) : 0;

  // 2. Calculate Net Positions per Broker over the N-day window
  // True multi-day netting cancels wash trading across sessions
  const brokersArray = Array.from(brokerLedger.values()).map((b) => {
    const netVol = b.buyVol - b.sellVol; // Remaining Quantity
    const netAmt = b.buyAmt - b.sellAmt; // Net Inflow / Outflow Amount (NPR)
    const avgBuyPrice = b.buyVol > 0 ? b.buyAmt / b.buyVol : 0;
    const avgSellPrice = b.sellVol > 0 ? b.sellAmt / b.sellVol : 0;
    const retentionPct = b.buyVol > 0 ? Math.max(0, Math.min(100, (netVol / b.buyVol) * 100)) : 0;

    const direction = netVol >= 0 ? "ACCUMULATING" : "DUMPING";
    const cycleInfo = detectCycleStartDate(b.dailySeries || [], direction);

    let brokerActionLabel = "Neutral Churn";
    if (netVol > 0) {
      if (cycleInfo.consistencyPct >= 55 && retentionPct >= 50) {
        brokerActionLabel = "Slowly Accumulating";
      } else if (priceChangePct > 4.5) {
        brokerActionLabel = "Aggressive Pumping";
      } else {
        brokerActionLabel = "Net Accumulating";
      }
    } else if (netVol < 0) {
      if (cycleInfo.consistencyPct >= 55) {
        brokerActionLabel = "Slowly Dumping";
      } else if (priceChangePct < -3.5) {
        brokerActionLabel = "Aggressive Dumping";
      } else {
        brokerActionLabel = "Net Dumping";
      }
    }

    const unrealizedProfitPct = avgBuyPrice > 0
      ? Number((((latestClose - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2))
      : 0;

    return {
      brokerId: b.brokerId,
      brokerName: TOP_NEPSE_BROKERS[b.brokerId] || b.brokerName || `Broker #${b.brokerId}`,
      buyVol: b.buyVol,
      sellVol: b.sellVol,
      remainingQty: netVol,
      netVol,
      absNetVol: Math.abs(netVol),
      buyAmt: Number(b.buyAmt.toFixed(2)),
      sellAmt: Number(b.sellAmt.toFixed(2)),
      netAmt: Number(netAmt.toFixed(2)),
      totalAmount: Number((b.buyAmt + b.sellAmt).toFixed(2)),
      avgBuyPrice: Number(avgBuyPrice.toFixed(2)),
      avgSellPrice: Number(avgSellPrice.toFixed(2)),
      retentionPct: Number(retentionPct.toFixed(1)),
      direction,
      brokerActionLabel,
      startDate: cycleInfo.startDate,
      streakDays: cycleInfo.streakDays,
      activeDaysCount: cycleInfo.activeDaysCount,
      consistencyPct: cycleInfo.consistencyPct,
      unrealizedProfitPct,
      dailySeries: b.dailySeries
    };
  });

  // Sort for Top Net Buyers (Smart Money Accumulation) & Top Net Sellers (Supply Pressure)
  const topNetBuyers = [...brokersArray]
    .filter((b) => b.netVol > 0)
    .sort((a, b) => b.netVol - a.netVol);

  const topNetSellers = [...brokersArray]
    .filter((b) => b.netVol < 0)
    .sort((a, b) => a.netVol - b.netVol); // Most negative first

  // 3. Calculate Core Quality Gate Metrics
  const topGrossBuyers = [...brokersArray].sort((a, b) => b.buyVol - a.buyVol);
  const topGrossSellers = [...brokersArray].sort((a, b) => b.sellVol - a.sellVol);
  const top5GrossBuyers = topGrossBuyers.slice(0, 5);
  const top5GrossSellers = topGrossSellers.slice(0, 5);

  const top3NetBuyVol = topNetBuyers.slice(0, 3).reduce((sum, b) => sum + b.netVol, 0);
  const top5NetBuyVol = topNetBuyers.slice(0, 5).reduce((sum, b) => sum + b.netVol, 0);
  const top3NetSellVol = topNetSellers.slice(0, 3).reduce((sum, b) => sum + Math.abs(b.netVol), 0);

  const top3GrossBuyVol = topGrossBuyers.slice(0, 3).reduce((sum, b) => sum + b.buyVol, 0);
  const top5GrossBuyVol = topGrossBuyers.slice(0, 5).reduce((sum, b) => sum + b.buyVol, 0);
  const top3GrossSellVol = topGrossSellers.slice(0, 3).reduce((sum, b) => sum + b.sellVol, 0);

  const bcr3NetPct = Number(((top3NetBuyVol / totalVolume) * 100).toFixed(1));
  const bcr5NetPct = Number(((top5NetBuyVol / totalVolume) * 100).toFixed(1));
  const scr3NetPct = Number(((top3NetSellVol / totalVolume) * 100).toFixed(1));

  const bcr3BuyPct = Number(((top3GrossBuyVol / totalVolume) * 100).toFixed(1));
  const bcr5BuyPct = Number(((top5GrossBuyVol / totalVolume) * 100).toFixed(1));
  const scr3SellPct = Number(((top3GrossSellVol / totalVolume) * 100).toFixed(1));

  const grossBuyConcentrationPct = bcr5BuyPct;
  const grossSellConcentrationPct = scr3SellPct;
  const smartMoneyNetFlowPct = Number((bcr5NetPct - scr3NetPct).toFixed(1));

  // Multi-Day Institutional VWAP anchored to Net Retained Accumulation
  const top5NetTurnover = topNetBuyers.slice(0, 5).reduce((sum, b) => sum + (b.netVol * b.avgBuyPrice), 0);
  const top5GrossTurnover = topNetBuyers.slice(0, 5).reduce((sum, b) => sum + b.buyAmt, 0);
  const top5GrossVol = topNetBuyers.slice(0, 5).reduce((sum, b) => sum + b.buyVol, 0);

  const bigBrokerVWAP = top5NetBuyVol > 0
    ? Number((top5NetTurnover / top5NetBuyVol).toFixed(2))
    : (top5GrossVol > 0 ? Number((top5GrossTurnover / top5GrossVol).toFixed(2)) : marketVWAP);

  // Price Volatility Compression (High-Low spread over window)
  const highestPrice = Math.max(
    ...windowData.map((d) => Number(d.highPrice || d.high || d.closePrice || d.close || latestClose))
  );
  const lowestPrice = Math.min(
    ...windowData.map((d) => Number(d.lowPrice || d.low || d.closePrice || d.close || latestClose))
  );
  const rangePct = lowestPrice > 0 ? ((highestPrice - lowestPrice) / lowestPrice) * 100 : 0;

  // 4. Classify Phase for Accumulation & Distribution Radar + Search Filter Tabs
  let phase = "NEUTRAL_RETAIL";
  let phaseLabel = "Normal Retail Flow";

  if (scr3NetPct >= 20.0 && priceChangePct > 2.5) {
    phase = "BULL_TRAP";
    phaseLabel = "Bull Trap (Retail Buying Top)";
  } else if (scr3NetPct >= 18.0) {
    phase = "DISTRIBUTION_DANGER";
    phaseLabel = "Distribution Danger";
  } else if (bcr5NetPct >= 18.0 && scr3NetPct < 14.0 && Math.abs(priceChangePct) <= 4.5) {
    phase = "STEALTH_ACCUMULATION";
    phaseLabel = "Stealth Accumulation";
  } else if (bcr5NetPct >= 15.0 && priceChangePct > 4.5 && latestClose >= bigBrokerVWAP) {
    phase = "ACTIVE_MARKUP";
    phaseLabel = "Active Markup";
  }

  const isInstitutionalDumping = phase === "DISTRIBUTION_DANGER" || phase === "BULL_TRAP" || scr3NetPct >= 20.0 || scr3SellPct >= 38.0;
  const adSignal = (phase === "STEALTH_ACCUMULATION" || phase === "ACTIVE_MARKUP")
    ? "Accumulation"
    : (isInstitutionalDumping ? "Distribution" : "Neutral");

  // 5. Safe Buy Zone Bounds & Clear Conditional Copy (Overview Card 3)
  const buyZoneMin = Number((bigBrokerVWAP * 0.99).toFixed(1));
  const buyZoneMax = Number((bigBrokerVWAP * 1.035).toFixed(1));
  let entryStatus = "⚪ Neutral Entry";
  let entryDescription = "";

  if (latestClose < buyZoneMin) {
    entryStatus = "🟢 Discounted / Below Buy Zone";
    entryDescription = `Current price (Rs. ${latestClose}) is trading below the Safe Buy Zone (Rs. ${buyZoneMin}–${buyZoneMax}) and near/below Big Broker VWAP (Rs. ${bigBrokerVWAP.toFixed(1)}).`;
  } else if (latestClose >= buyZoneMin && latestClose <= buyZoneMax) {
    entryStatus = "🟢 Within Safe Buy Zone";
    entryDescription = `Current price (Rs. ${latestClose}) is strictly inside the Safe Buy Zone (Rs. ${buyZoneMin}–${buyZoneMax}) anchored by Big Broker VWAP (Rs. ${bigBrokerVWAP.toFixed(1)}).`;
  } else {
    entryStatus = "🟠 Extended Above Buy Zone";
    entryDescription = `Current price (Rs. ${latestClose}) is extended above the Safe Buy Zone (Rs. ${buyZoneMin}–${buyZoneMax}). Wait for pullback toward Rs. ${bigBrokerVWAP.toFixed(1)}.`;
  }

  // Stock-Level Net Flow Summary & Syndicate Co-Accumulation
  const top5NetInflowAmt = Number(topNetBuyers.slice(0, 5).reduce((sum, b) => sum + Math.max(0, b.netAmt), 0).toFixed(2));
  const top5NetOutflowAmt = Number(topNetSellers.slice(0, 5).reduce((sum, b) => sum + Math.abs(b.netAmt), 0).toFixed(2));
  const smartMoneyNetInflowAmt = Number((top5NetInflowAmt - top5NetOutflowAmt).toFixed(2));
  const leadAccumulator = topNetBuyers[0] || null;
  const leadDistributor = topNetSellers[0] || null;

  const activeSyndicateBrokers = topNetBuyers.filter(b => b.netVol > 0 && b.consistencyPct >= 40);
  const isSyndicateCoAccumulation = activeSyndicateBrokers.length >= 3;

  return {
    timeframeDays: actualDays,
    scopeLabel:
      actualDays === 1
        ? `Latest Trading Session (${windowData[0].date || "1D"}) — Intraday Microstructure`
        : `Cumulative ${actualDays}-Day Window — Institutional Trend & Absorption`,
    totalVolume,
    totalTurnover,
    latestClose,
    marketVWAP,
    priceChangePct,
    bigBrokerVWAP,
    buyZoneMin,
    buyZoneMax,
    entryStatus,
    entryDescription,
    grossBuyConcentrationPct,
    grossSellConcentrationPct,
    bcr3NetPct,
    bcr5NetPct,
    scr3NetPct,
    bcr3BuyPct,
    bcr5BuyPct,
    scr3SellPct,
    isInstitutionalDumping,
    adSignal,
    smartMoneyNetFlowPct,
    absorptionConsistency: `${sessionsWithPositiveSmartFlow}/${actualDays} Sessions`,
    phase,
    phaseLabel,
    topBuyers: topNetBuyers.slice(0, 5),
    topSellers: topNetSellers.slice(0, 5),
    topAccumulators: topNetBuyers.slice(0, 5),
    topDistributors: topNetSellers.slice(0, 5),
    topGrossBuyers: top5GrossBuyers.map(b => ({
      ...b,
      pct: Number(((b.buyVol / totalVolume) * 100).toFixed(1))
    })),
    topGrossSellers: top5GrossSellers.map(s => ({
      ...s,
      pct: Number(((s.sellVol / totalVolume) * 100).toFixed(1))
    })),
    top5NetInflowAmt,
    top5NetOutflowAmt,
    smartMoneyNetInflowAmt,
    leadAccumulator,
    leadDistributor,
    isSyndicateCoAccumulation,
    syndicateBrokers: activeSyndicateBrokers.slice(0, 5).map(b => b.brokerId),
    allBrokers: brokersArray,
  };
}

/**
 * Utility to convert raw brokerAnalysis / floorsheet / candles into dailyHistory snapshots
 */
export function buildDailyHistoryFromStockData(stock, realBrokerAnalysis, candleHistory = []) {
  if (!stock) return [];

  // 1. Authoritative Multi-Day Path: Use authentic date-by-date broker flows from dailyFlow
  if (Array.isArray(realBrokerAnalysis?.dailyFlow) && realBrokerAnalysis.dailyFlow.length > 0) {
    // Ensure sorted newest -> oldest (index 0 = latest trading session)
    const sortedFlow = [...realBrokerAnalysis.dailyFlow].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );

    return sortedFlow.map((df, idx) => {
      const candle =
        candleHistory.find((c) => c.date === df.date) ||
        candleHistory[candleHistory.length - 1 - idx] ||
        {};

      const dayBrokers = Array.isArray(df.brokers)
        ? df.brokers.map((b) => ({
            brokerId: String(b.brokerId || b.broker || b.id || "").trim(),
            brokerName: b.brokerName || b.name || `Broker #${b.brokerId || b.broker}`,
            buyVol: Number(b.buyQty ?? b.buyVol ?? 0),
            sellVol: Number(b.sellQty ?? b.sellVol ?? 0),
            buyAmt: Number(b.buyAmt ?? b.buyAmount ?? 0),
            sellAmt: Number(b.sellAmt ?? b.sellAmount ?? 0),
          }))
        : Object.values(df.brokerMap || {}).map((b) => ({
            brokerId: String(b.brokerId || b.broker || b.id || "").trim(),
            brokerName: b.brokerName || b.name || `Broker #${b.brokerId || b.broker}`,
            buyVol: Number(b.buyQty ?? b.buyVol ?? 0),
            sellVol: Number(b.sellQty ?? b.sellVol ?? 0),
            buyAmt: Number(b.buyAmt ?? b.buyAmount ?? 0),
            sellAmt: Number(b.sellAmt ?? b.sellAmount ?? 0),
          }));

      const dayVol = Number(
        df.totalVolume || df.buyVol || df.sellVol || candle.volume || (idx === 0 ? stock.volume : 0) || 0
      );
      const closePx = Number(df.vwap || candle.close || (idx === 0 ? stock.ltp : 0) || 100);
      const dayTurnover = Number(df.turnover || df.totalTurnover || dayVol * closePx);

      return {
        date: df.date || candle.date || "",
        closePrice: Number(candle.close || closePx),
        openPrice: Number(candle.open || candle.close || closePx),
        highPrice: Number(candle.high || candle.close || closePx),
        lowPrice: Number(candle.low || candle.close || closePx),
        totalVolume: dayVol,
        totalTurnover: dayTurnover,
        brokers: dayBrokers,
      };
    }).filter((d) => d.totalVolume > 0 && d.brokers.length > 0);
  }

  // 2. Single-Session Fallback (Strictly 1-Day Authentic Snapshot — NEVER clone Day 1 brokers onto past candles!)
  const rawBrokers = Array.isArray(realBrokerAnalysis?.brokers)
    ? realBrokerAnalysis.brokers
    : [
        ...(realBrokerAnalysis?.topBuyers || []).map(b => ({ ...b, buyQty: b.volume || b.buyQty, sellQty: 0 })),
        ...(realBrokerAnalysis?.topSellers || []).map(s => ({ ...s, buyQty: 0, sellQty: s.volume || s.sellQty }))
      ];

  if (rawBrokers.length === 0) return [];

  const totalVol = Number(
    realBrokerAnalysis?.totalVolume || stock.volume || stock.totalTradedQuantity || 0
  );
  if (totalVol <= 0) return [];

  const ltp = Number(stock.ltp || stock.close || 100);
  const totalTurnover = Number(
    realBrokerAnalysis?.totalTurnover || stock.turnover || totalVol * ltp
  );

  return [
    {
      date: realBrokerAnalysis?.businessDate || stock.date || "Latest 1D",
      closePrice: ltp,
      openPrice: Number(stock.open || stock.openPrice || ltp),
      highPrice: Number(stock.high || stock.highPrice || ltp),
      lowPrice: Number(stock.low || stock.lowPrice || ltp),
      totalVolume: totalVol,
      totalTurnover: totalTurnover,
      brokers: rawBrokers.map((b) => ({
        brokerId: String(b.broker || b.brokerId || b.id || "").trim(),
        brokerName: b.brokerName || b.name,
        buyVol: Number(b.buyQty ?? b.buyVol ?? 0),
        sellVol: Number(b.sellQty ?? b.sellVol ?? 0),
        buyAmt: Number(b.buyAmt ?? b.buyAmount ?? 0),
        sellAmt: Number(b.sellAmt ?? b.sellAmount ?? 0),
      })),
    },
  ];
}
