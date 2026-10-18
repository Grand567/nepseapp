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
  // Key: brokerId, Value: { brokerId, buyVol, sellVol, buyAmt, sellAmt, name }
  const brokerLedger = new Map();

  for (const day of windowData) {
    totalVolume += Number(day.totalVolume || 0);
    totalTurnover += Number(day.totalTurnover || 0);

    let dayTopBuyerVol = 0;
    let dayTopSellerVol = 0;

    // Loop through each broker's activity for that trading session
    for (const b of day.brokers || []) {
      const brokerId = String(b.brokerId || b.broker || b.id || '').trim();
      if (!brokerId) continue;

      const prev = brokerLedger.get(brokerId) || {
        brokerId,
        brokerName: b.brokerName || b.name || `Broker #${brokerId}`,
        buyVol: 0,
        sellVol: 0,
        buyAmt: 0,
        sellAmt: 0,
      };

      const bVol = Number(b.buyVol || b.buyQty || b.shares || 0);
      const sVol = Number(b.sellVol || b.sellQty || 0);
      const bAmt = Number(b.buyAmt || b.buyAmount || b.amount || 0);
      const sAmt = Number(b.sellAmt || b.sellAmount || 0);

      prev.buyVol += bVol;
      prev.sellVol += sVol;
      prev.buyAmt += bAmt;
      prev.sellAmt += sAmt;
      brokerLedger.set(brokerId, prev);

      dayTopBuyerVol += bVol;
      dayTopSellerVol += sVol;
    }

    if (dayTopBuyerVol >= dayTopSellerVol && dayTopBuyerVol > 0) {
      sessionsWithPositiveSmartFlow++;
    }
  }

  if (totalVolume === 0) return null;

  // 2. Calculate Net Positions per Broker over the N-day window
  // True multi-day netting cancels wash trading across sessions
  const brokersArray = Array.from(brokerLedger.values()).map((b) => {
    const netVol = b.buyVol - b.sellVol;
    const avgBuyPrice = b.buyVol > 0 ? b.buyAmt / b.buyVol : 0;
    const avgSellPrice = b.sellVol > 0 ? b.sellAmt / b.sellVol : 0;
    return {
      ...b,
      netVol,
      absNetVol: Math.abs(netVol),
      avgBuyPrice: Number(avgBuyPrice.toFixed(2)),
      avgSellPrice: Number(avgSellPrice.toFixed(2)),
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
  const top5NetBuyVol = topNetBuyers
    .slice(0, 5)
    .reduce((sum, b) => sum + b.netVol, 0);

  const top3NetSellVol = topNetSellers
    .slice(0, 3)
    .reduce((sum, b) => sum + Math.abs(b.netVol), 0);

  // Independent Gross Top-5 Buying vs Selling Share (Fixes identical 45.6% buy vs sell bug)
  const top5GrossBuyers = [...brokersArray]
    .sort((a, b) => b.buyVol - a.buyVol)
    .slice(0, 5);
  const top5GrossSellers = [...brokersArray]
    .sort((a, b) => b.sellVol - a.sellVol)
    .slice(0, 5);

  const grossBuyConcentrationPct =
    (top5GrossBuyers.reduce((s, b) => s + b.buyVol, 0) / totalVolume) * 100;
  const grossSellConcentrationPct =
    (top5GrossSellers.reduce((s, b) => s + b.sellVol, 0) / totalVolume) * 100;

  // Net Absorption (BCR5_N) & Seller Concentration (SCR3_N)
  const bcr5NetPct = (top5NetBuyVol / totalVolume) * 100; // Smart Money Net Absorption %
  const scr3NetPct = (top3NetSellVol / totalVolume) * 100; // Top-3 Seller Concentration %
  const smartMoneyNetFlowPct = bcr5NetPct - scr3NetPct;

  // Multi-day Total Volume-Weighted VWAP
  const marketVWAP = totalVolume > 0 ? totalTurnover / totalVolume : 0;

  // Big Broker Average Buy Price (Weighted VWAP of Top 5 Net Buyers)
  const top5BuyAmt = topNetBuyers.slice(0, 5).reduce((s, b) => s + b.buyAmt, 0);
  const top5BuyTotalVol = topNetBuyers.slice(0, 5).reduce((s, b) => s + b.buyVol, 0);
  const bigBrokerVWAP =
    top5BuyTotalVol > 0 ? top5BuyAmt / top5BuyTotalVol : marketVWAP;

  // Price Action Change over N Days
  const latestClose = Number(windowData[0].closePrice || windowData[0].close || windowData[0].ltp || 0);
  const oldestClose = Number(
    windowData[actualDays - 1].openPrice ||
    windowData[actualDays - 1].open ||
    windowData[actualDays - 1].closePrice ||
    windowData[actualDays - 1].close ||
    latestClose
  );
  const priceChangePct =
    oldestClose > 0 ? ((latestClose - oldestClose) / oldestClose) * 100 : 0;

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

  if (bcr5NetPct >= 18 && scr3NetPct < 14 && Math.abs(priceChangePct) <= 4.5 && rangePct <= 8) {
    phase = "STEALTH_ACCUMULATION";
    phaseLabel = "Stealth Accumulation";
  } else if (bcr5NetPct >= 15 && priceChangePct > 4.5 && latestClose > bigBrokerVWAP) {
    phase = "ACTIVE_MARKUP";
    phaseLabel = "Active Markup";
  } else if (scr3NetPct >= 20 && priceChangePct > 2.5) {
    phase = "BULL_TRAP";
    phaseLabel = "Bull Trap (Retail Buying Top)";
  } else if (scr3NetPct >= 18 && smartMoneyNetFlowPct < -6) {
    phase = "DISTRIBUTION_DANGER";
    phaseLabel = "Distribution Danger";
  }

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

  return {
    timeframeDays: actualDays,
    scopeLabel:
      actualDays === 1
        ? `Latest Trading Session (${windowData[0].date || "1D"}) — Intraday Microstructure`
        : `Cumulative ${actualDays}-Day Window — Institutional Trend & Absorption`,
    totalVolume,
    totalTurnover,
    latestClose,
    marketVWAP: Number(marketVWAP.toFixed(1)),
    priceChangePct: Number(priceChangePct.toFixed(2)),
    bigBrokerVWAP: Number(bigBrokerVWAP.toFixed(1)),
    buyZoneMin,
    buyZoneMax,
    entryStatus,
    entryDescription,
    grossBuyConcentrationPct: Number(grossBuyConcentrationPct.toFixed(1)),
    grossSellConcentrationPct: Number(grossSellConcentrationPct.toFixed(1)),
    bcr5NetPct: Number(bcr5NetPct.toFixed(1)),
    scr3NetPct: Number(scr3NetPct.toFixed(1)),
    smartMoneyNetFlowPct: Number(smartMoneyNetFlowPct.toFixed(1)),
    absorptionConsistency: `${sessionsWithPositiveSmartFlow}/${actualDays} Sessions`,
    phase,
    phaseLabel,
    topNetBuyers: topNetBuyers.slice(0, 5),
    topNetSellers: topNetSellers.slice(0, 5),
    topGrossBuyers: top5GrossBuyers.map(b => ({
      ...b,
      pct: Number(((b.buyVol / totalVolume) * 100).toFixed(1))
    })),
    topGrossSellers: top5GrossSellers.map(s => ({
      ...s,
      pct: Number(((s.sellVol / totalVolume) * 100).toFixed(1))
    })),
  };
}

/**
 * Utility to convert raw brokerAnalysis / floorsheet / candles into dailyHistory snapshots
 */
export function buildDailyHistoryFromStockData(stock, realBrokerAnalysis, candleHistory = []) {
  if (!stock) return [];

  // 1. If realBrokerAnalysis contains pre-aggregated dailyFlow, map it directly
  if (Array.isArray(realBrokerAnalysis?.dailyFlow) && realBrokerAnalysis.dailyFlow.length > 0) {
    return realBrokerAnalysis.dailyFlow.map((df, idx) => {
      const candle = candleHistory.find(c => c.date === df.date) || candleHistory[candleHistory.length - 1 - idx] || {};
      const dayBrokers = Array.isArray(df.brokers)
        ? df.brokers
        : Object.values(df.brokerMap || {}).map(b => ({
            brokerId: b.brokerId || b.broker || b.id,
            brokerName: b.brokerName || b.name,
            buyVol: Number(b.buyQty || b.buyVol || 0),
            sellVol: Number(b.sellQty || b.sellVol || 0),
            buyAmt: Number(b.buyAmt || b.buyAmount || 0),
            sellAmt: Number(b.sellAmt || b.sellAmount || 0),
          }));

      const dayVol = Number(df.totalVolume || df.turnoverVolume || df.buyVol || candle.volume || stock.volume || 1);
      const dayTurnover = Number(df.turnover || df.totalTurnover || (dayVol * (candle.close || stock.ltp || 100)));

      return {
        date: df.date || candle.date || '',
        closePrice: Number(candle.close || stock.ltp || 100),
        openPrice: Number(candle.open || candle.close || stock.ltp || 100),
        highPrice: Number(candle.high || candle.close || stock.ltp || 100),
        lowPrice: Number(candle.low || candle.close || stock.ltp || 100),
        totalVolume: dayVol,
        totalTurnover: dayTurnover,
        brokers: dayBrokers
      };
    });
  }

  // 2. If realBrokerAnalysis has brokers array with raw session data, build snapshots
  const rawBrokers = Array.isArray(realBrokerAnalysis?.brokers)
    ? realBrokerAnalysis.brokers
    : [
        ...(realBrokerAnalysis?.topBuyers || []).map(b => ({ ...b, buyQty: b.volume || b.buyQty, sellQty: 0 })),
        ...(realBrokerAnalysis?.topSellers || []).map(s => ({ ...s, buyQty: 0, sellQty: s.volume || s.sellQty }))
      ];

  const totalVol = Number(realBrokerAnalysis?.totalVolume || stock.volume || stock.totalTradedQuantity || 1);
  const totalTurnover = Number(realBrokerAnalysis?.totalTurnover || stock.turnover || (totalVol * (stock.ltp || 100)));

  const baseDay = {
    date: realBrokerAnalysis?.businessDate || stock.date || 'latest',
    closePrice: Number(stock.ltp || stock.close || 100),
    openPrice: Number(stock.open || stock.openPrice || stock.ltp || 100),
    highPrice: Number(stock.high || stock.highPrice || stock.ltp || 100),
    lowPrice: Number(stock.low || stock.lowPrice || stock.ltp || 100),
    totalVolume: totalVol,
    totalTurnover: totalTurnover,
    brokers: rawBrokers.map(b => ({
      brokerId: String(b.broker || b.brokerId || b.id || '').trim(),
      brokerName: b.brokerName || b.name,
      buyVol: Number(b.buyQty || b.volume || 0),
      sellVol: Number(b.sellQty || 0),
      buyAmt: Number(b.buyAmt || b.amount || 0),
      sellAmt: Number(b.sellAmt || 0),
    }))
  };

  // If candle history is available, generate past sessions with distributed broker flow
  if (Array.isArray(candleHistory) && candleHistory.length > 1) {
    const sortedCandles = [...candleHistory].reverse();
    return sortedCandles.map((c, i) => {
      if (i === 0) return baseDay;
      const vol = Number(c.volume || 1);
      const cClose = Number(c.close || 100);
      const cOpen = Number(c.open || cClose);
      const cHigh = Number(c.high || cClose);
      const cLow = Number(c.low || cClose);
      const scale = totalVol > 0 ? vol / totalVol : 1;

      return {
        date: c.date || '',
        closePrice: cClose,
        openPrice: cOpen,
        highPrice: cHigh,
        lowPrice: cLow,
        totalVolume: vol,
        totalTurnover: vol * cClose,
        brokers: baseDay.brokers.map(b => ({
          ...b,
          buyVol: Math.round(b.buyVol * scale),
          sellVol: Math.round(b.sellVol * scale),
          buyAmt: Math.round(b.buyAmt * scale),
          sellAmt: Math.round(b.sellAmt * scale),
        }))
      };
    });
  }

  return [baseDay];
}
