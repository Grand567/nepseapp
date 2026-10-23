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
  "1": "Kumari Securities (#1)",
  "3": "Arun Securities (#3)",
  "4": "Opal Securities (#4)",
  "5": "Market Securities (#5)",
  "6": "Agrawal Securities (#6)",
  "7": "J.F. Securities (#7)",
  "8": "Ashutosh Brokerage (#8)",
  "10": "Pragyan Securities (#10)",
  "11": "Malla & Malla (#11)",
  "13": "Thrive Brokerage (#13)",
  "14": "Nepal Stock House (#14)",
  "16": "Primo Securities (#16)",
  "17": "ABC Securities (#17)",
  "18": "Sagarmatha Securities (#18)",
  "19": "Nepal Investment (#19)",
  "20": "Sipla Securities (#20)",
  "21": "Midas Stock Broking (#21)",
  "22": "Siprabi Securities (#22)",
  "25": "Sweta Securities (#25)",
  "26": "Asian Securities (#26)",
  "28": "Shree Krishna Securities (#28)",
  "29": "Trishul Securities (#29)",
  "32": "Premier Securities (#32)",
  "33": "Dakshinkali Securities (#33)",
  "34": "Vision Securities (#34)",
  "35": "Kohinoor Investment (#35)",
  "36": "Secured Securities (#36)",
  "37": "Swarna Laxmi (#37)",
  "38": "Dipshikha Dhitopatra (#38)",
  "39": "Sumeru Securities (#39)",
  "40": "Creative Securities (#40)",
  "41": "Linch Stock Market (#41)",
  "42": "Sani Securities (#42)",
  "43": "South Asian Bulls (#43)",
  "44": "Dynamic Money (#44)",
  "45": "Imperial Securities (#45)",
  "46": "Kalika Securities (#46)",
  "47": "Neev Securities (#47)",
  "48": "Trishakti Securities (#48)",
  "49": "Online Securities (#49)",
  "50": "Crystal Kanchenjunga (#50)",
  "51": "Oxford Securities (#51)",
  "52": "Sundhara Securities (#52)",
  "53": "Investment Management (#53)",
  "54": "Sewa Securities (#54)",
  "55": "Bhrikuti Stock (#55)",
  "56": "Sri Hari Securities (#56)",
  "57": "Aryatara Investment (#57)",
  "58": "Naasa Securities (#58)",
  "59": "Divya Securities (#59)",
  "60": "Nagarik Stock Dealer (#60)",
  "61": "Bhole Ganesh (#61)",
  "62": "Capital Max (#62)",
  "63": "Himalayan Brokerage (#63)",
  "64": "Sun Securities (#64)",
  "65": "Sharepro Securities (#65)",
  "66": "Miyo Securities (#66)",
  "67": "Property Wizard (#67)",
  "68": "Elite Stock House (#68)",
  "69": "Index Securities (#69)",
  "70": "Infinity Securities (#70)",
  "71": "Shubhakamana (#71)",
  "72": "Hatemalo Financial (#72)",
  "73": "Money World (#73)",
  "74": "Kalash Stock (#74)",
  "75": "Mega Stock Markets (#75)",
  "76": "Machhapuchchhre (#76)",
  "77": "Nabil Stock Dealer (#77)",
  "78": "Garima Securities (#78)",
  "79": "Pahi Investment (#79)",
  "80": "Indira Securities (#80)",
  "81": "Aakashbhairab (#81)",
  "82": "N.M.B. Securities (#82)",
  "83": "Sanima Securities (#83)",
  "84": "Milky Way (#84)",
  "85": "Capital Hub (#85)",
  "86": "Stoxkart Securities (#86)",
  "87": "S.P.S.A. Securities (#87)",
  "88": "Blue Chip Securities (#88)",
  "89": "JBNL Securities (#89)",
  "90": "Sajilo Broker (#90)",
  "91": "CBIL Securities (#91)",
  "92": "Roadshow Securities (#92)",
  "93": "Beni Securities (#93)",
  "94": "K.B.L. Securities (#94)",
  "95": "Magnet Securities (#95)",
  "96": "Himalayan Securities (#96)",
  "97": "R.B.B. Securities (#97)",
  "98": "Trademow Securities (#98)",
  "99": "Prabhu Stock Market (#99)",
  "100": "Sunrise Securities (#100)",
  "101": "Apple Securities (#101)"
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

      const bVol = Math.max(0, Number(b.buyVol || b.buyQty || b.shares || 0));
      const sVol = Math.max(0, Number(b.sellVol || b.sellQty || 0));
      const bAmt = bVol > 0
        ? Number(b.buyAmt ?? b.buyAmount ?? (sVol === 0 && b.amount ? b.amount : 0) ?? (bVol * Number(b.avgBuyPrice || b.rate || 0)))
        : 0;
      const sAmt = sVol > 0
        ? Number(b.sellAmt ?? b.sellAmount ?? (bVol === 0 && b.amount ? b.amount : 0) ?? (sVol * Number(b.avgSellPrice || b.rate || 0)))
        : 0;

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

  // Construct session-by-session flow for date-wise drilldown across all requested timeframes
  const dailyFlow = windowData.map((day) => {
    const dayBrokers = (day.brokers || []).map((b) => {
      const bId = String(b.brokerId || b.broker || b.id || '').trim();
      const bVol = Math.max(0, Number(b.buyVol || b.buyQty || b.shares || 0));
      const sVol = Math.max(0, Number(b.sellVol || b.sellQty || 0));
      const bAmt = bVol > 0
        ? Number(b.buyAmt ?? b.buyAmount ?? (sVol === 0 && b.amount ? b.amount : 0) ?? (bVol * Number(b.avgBuyPrice || b.rate || 0)))
        : 0;
      const sAmt = sVol > 0
        ? Number(b.sellAmt ?? b.sellAmount ?? (bVol === 0 && b.amount ? b.amount : 0) ?? (sVol * Number(b.avgSellPrice || b.rate || 0)))
        : 0;
      return {
        brokerId: bId,
        broker: bId,
        id: bId,
        brokerName: TOP_NEPSE_BROKERS[bId] || b.brokerName || b.name || `Broker #${bId}`,
        name: TOP_NEPSE_BROKERS[bId] || b.brokerName || b.name || `Broker #${bId}`,
        buyQty: bVol,
        buyVol: bVol,
        sellQty: sVol,
        sellVol: sVol,
        netQty: bVol - sVol,
        buyAmt: bAmt,
        sellAmt: sAmt,
        netAmt: bAmt - sAmt,
        avgBuyRate: bVol > 0 ? Number((bAmt / bVol).toFixed(2)) : 0,
        avgSellRate: sVol > 0 ? Number((sAmt / sVol).toFixed(2)) : 0,
      };
    });

    const dayTopBuyers = [...dayBrokers].filter(b => b.buyQty > 0).sort((a, b) => b.buyQty - a.buyQty);
    const dayTopSellers = [...dayBrokers].filter(b => b.sellQty > 0).sort((a, b) => b.sellQty - a.sellQty);
    const dayTopHolders = [...dayBrokers].sort((a, b) => b.netQty - a.netQty);
    const topAcc = dayTopHolders.filter(b => b.netQty > 0)[0] || dayTopBuyers[0] || null;
    const topDist = [...dayBrokers].filter(b => b.netQty < 0).sort((a, b) => a.netQty - b.netQty)[0] || dayTopSellers[0] || null;
    const dayVol = Math.max(Number(day.totalVolume || 0), dayBrokers.reduce((s, b) => s + b.buyQty, 0));
    const dayTurnover = Number(day.totalTurnover || day.turnover || (dayVol * Number(day.closePrice || day.close || 0)));
    const netFlow = (topAcc?.netQty || 0) - Math.abs(topDist?.netQty || 0);

    return {
      date: day.date,
      buyVol: dayBrokers.reduce((s, b) => s + b.buyQty, 0) || dayVol,
      sellVol: dayBrokers.reduce((s, b) => s + b.sellQty, 0) || dayVol,
      turnover: dayTurnover,
      totalVolume: dayVol,
      vwap: dayVol > 0 ? Number((dayTurnover / dayVol).toFixed(2)) : Number(day.closePrice || 0),
      netFlow,
      topBuyer: dayTopBuyers[0] || null,
      topSeller: dayTopSellers[0] || null,
      topHolder: topAcc,
      topAccumulator: topAcc,
      topDistributor: topDist,
      brokers: dayBrokers,
    };
  });

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
    topBuyers: topNetBuyers.slice(0, 10),
    topSellers: topNetSellers.slice(0, 10),
    topAccumulators: topNetBuyers.slice(0, 10),
    topDistributors: topNetSellers.slice(0, 10),
    totalBuyersCount: topNetBuyers.length,
    totalSellersCount: topNetSellers.length,
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
    brokers: brokersArray,
    dailyFlow,
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
        ...(realBrokerAnalysis?.topBuyers || []).map(b => ({
          ...b,
          buyQty: Number(b.volume ?? b.buyQty ?? b.shares ?? 0),
          sellQty: 0,
          buyAmt: Number(b.buyAmt ?? b.buyAmount ?? b.amount ?? 0),
          sellAmt: 0,
        })),
        ...(realBrokerAnalysis?.topSellers || []).map(s => ({
          ...s,
          buyQty: 0,
          sellQty: Number(s.volume ?? s.sellQty ?? s.shares ?? 0),
          buyAmt: 0,
          sellAmt: Number(s.sellAmt ?? s.sellAmount ?? s.amount ?? 0),
        }))
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

/**
 * Evaluates 3-Day Early Ignition & Manipulation Detection for a single stock.
 * Combines:
 * 1. Broker-Agnostic Smart Money Holding (SMH_3D)
 * 2. Buyer vs. Seller Concentration Asymmetry
 * 3. Amihud Absorption & Relative Volume Surge (RVOL 3D vs 30D baseline)
 * 4. T+2 Settlement Retention
 * 5. Anti-Wash / Cross-Trade Veto
 *
 * @param {string} symbol
 * @param {object} diag3d - Precomputed 3-day multi-day diagnostic
 * @param {object} diag30d - Precomputed 30-day baseline diagnostic
 * @param {Array<object>} dailyHistory - Sorted newest first [day0, day1, day2, ...]
 * @returns {object} Early Ignition diagnostic record
 */
export function evaluateEarlyIgnition(symbol, diag3d, diag30d, dailyHistory = []) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!diag3d) return null;

  const totalVolume3d = Math.max(1, Number(diag3d.totalVolume || 0));
  const ltp = Number(diag3d.latestClose || diag3d.closePrice || diag3d.close || diag30d?.latestClose || 0);
  const bigBrokerVWAP3d = Number(diag3d.bigBrokerVWAP || diag3d.marketVWAP || ltp);
  const priceChange3dPct = Number(diag3d.priceChangePct || 0);
  const bcr5NetPct = Number(diag3d.bcr5NetPct || 0);
  const scr3NetPct = Number(diag3d.scr3NetPct || 0);

  // 1. Broker-Agnostic Smart Money Holding (SMH_3D)
  // Sum of net buy volume for top 10 accumulating brokers minus sum of net sell volume for top 10 distributing brokers
  const topAcc = diag3d.topAccumulators || [];
  const topDist = diag3d.topDistributors || [];

  const top10NetBuyVol = topAcc.slice(0, 10).reduce((sum, b) => sum + Math.max(0, Number(b.remainingQty ?? b.netVol ?? 0)), 0);
  const top10NetSellVol = topDist.slice(0, 10).reduce((sum, s) => sum + Math.abs(Number(s.remainingQty ?? s.netVol ?? 0)), 0);
  const smh3dPct = Number((((top10NetBuyVol - top10NetSellVol) / totalVolume3d) * 100).toFixed(2));

  // 2. Buyer vs. Seller Concentration Asymmetry
  const buyersCount = diag3d.totalBuyersCount || topAcc.length;
  const sellersCount = diag3d.totalSellersCount || topDist.length;
  const dispersionRatio = buyersCount > 0 ? Number((sellersCount / Math.max(1, buyersCount)).toFixed(2)) : 1.0;
  const asymmetryBadge = `${buyersCount} Buyers absorbing ${sellersCount} Sellers (${dispersionRatio}x Dispersion)`;

  // 3. 3D Relative Volume vs 30D Baseline (RVOL 3D)
  const avgVol3d = totalVolume3d / Math.max(1, Number(diag3d.timeframeDays || 3));
  const avgVol30d = Math.max(
    1,
    Number(diag30d?.avgDailyVolume || (Number(diag30d?.totalVolume || (totalVolume3d * 10)) / Math.max(1, Number(diag30d?.timeframeDays || 30))))
  );
  const rvol3d = Number((avgVol3d / avgVol30d).toFixed(2));

  // Operator profit margin over 3D Big Broker VWAP
  const operatorProfitMargin3d = bigBrokerVWAP3d > 0
    ? Number((((ltp - bigBrokerVWAP3d) / bigBrokerVWAP3d) * 100).toFixed(2))
    : 0.0;

  // 4. T+2 Settlement Retention
  // Find top buyers from day2 (T-2) and day1 (T-1), check how much they retained on day0 (T-0)
  let t2RetentionPct = 100.0;
  let t2AccumulatedQty = 0;
  let t2DumpedOnDay0Qty = 0;

  if (Array.isArray(dailyHistory) && dailyHistory.length >= 2) {
    const sortedHistory = [...dailyHistory].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const day0 = sortedHistory[0]; // today
    const day1 = sortedHistory[1]; // T-1
    const day2 = sortedHistory[2]; // T-2 (if available)

    const t2BuyersMap = new Map();

    const processPriorSession = (session) => {
      if (!session || !Array.isArray(session.brokers)) return;
      for (const b of session.brokers) {
        const bId = String(b.brokerId || b.broker || '');
        if (!bId) continue;
        const net = Number(b.buyVol || 0) - Number(b.sellVol || 0);
        if (net > 0) {
          t2BuyersMap.set(bId, (t2BuyersMap.get(bId) || 0) + net);
        }
      }
    };

    if (day2) processPriorSession(day2);
    if (day1) processPriorSession(day1);

    // Get the top 5 buyers who accumulated on T-2 and T-1
    const topPriorBuyers = Array.from(t2BuyersMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topPriorBuyers.length > 0) {
      t2AccumulatedQty = topPriorBuyers.reduce((s, [, qty]) => s + qty, 0);
      const topBuyerIds = new Set(topPriorBuyers.map(([id]) => id));

      if (day0 && Array.isArray(day0.brokers)) {
        for (const b of day0.brokers) {
          const bId = String(b.brokerId || b.broker || '');
          if (topBuyerIds.has(bId)) {
            t2DumpedOnDay0Qty += Number(b.sellVol || 0);
          }
        }
      }

      const retained = Math.max(0, t2AccumulatedQty - t2DumpedOnDay0Qty);
      t2RetentionPct = t2AccumulatedQty > 0
        ? Number(Math.min(100, Math.max(0, (retained / t2AccumulatedQty) * 100)).toFixed(1))
        : 100.0;
    }
  }

  // 5. Anti-Wash / Cross-Trade Veto & Stage Classification
  const avgGrossRetention = Number(diag3d.retentionPct || 80);
  const isWashTrap = (avgGrossRetention < 35 && rvol3d >= 1.2) || scr3NetPct >= 20 || diag3d.phase === 'BULL_TRAP';

  let ignitionStage = 'NEUTRAL_ACCUMULATION';
  let stageLabel = 'Neutral / No Ignition';
  let stageBadge = '⚪ Neutral / Base';
  let ignitionScore = 45;
  let entrySignal = 'WAIT';
  let tacticalAdvice = 'Normal trading flow. No active early ignition impulse detected.';

  if (isWashTrap) {
    ignitionStage = 'WASH_CHURN_TRAP';
    stageLabel = 'Fake Wash Churn Trap';
    stageBadge = '🚨 Fake Wash Churn';
    ignitionScore = Math.max(10, Math.round(30 - (scr3NetPct * 0.5)));
    entrySignal = 'AVOID_TRAP';
    tacticalAdvice = `High churn circular volume detected with low net retention (${avgGrossRetention}% retention, SCR3: ${scr3NetPct}%). Operators offloading into retail liquidity.`;
  }
  // STAGE 2: Prime Ignition Entry (Supply Vacuum Ignition)
  else if (
    rvol3d >= 1.6 &&
    smh3dPct >= 18 &&
    t2RetentionPct >= 85 &&
    priceChange3dPct >= 1.0 &&
    priceChange3dPct <= 6.5 &&
    operatorProfitMargin3d <= 6.0
  ) {
    ignitionStage = 'STAGE_2_SUPPLY_VACUUM_IGNITION';
    stageLabel = 'Day 3 Prime Ignition Entry';
    stageBadge = '⚡ Day 3 Prime Ignition Entry';
    ignitionScore = Math.min(100, Math.round(85 + (smh3dPct * 0.4) + (rvol3d * 3)));
    entrySignal = 'PRIME_BUY';
    tacticalAdvice = `Supply vacuum confirmed! Smart money holding +${smh3dPct}% with ${t2RetentionPct}% T+2 retention. Operator margin is tight (+${operatorProfitMargin3d}%). Prime early entry window before public breakout.`;
  }
  // Single-day or 3-day spike under the ±15% circuit limit
  const day0PriceChange = Array.isArray(dailyHistory) && dailyHistory.length > 0
    ? Number(dailyHistory[0]?.priceChangePct || dailyHistory[0]?.pChange || 0)
    : 0;
  const isLargeSpike = day0PriceChange > 9.0 || priceChange3dPct > 9.0;
  const isNearCircuit = priceChange3dPct >= 12.5 || day0PriceChange >= 12.5;
  const isCircuitLocked = priceChange3dPct >= 14.8 || day0PriceChange >= 14.8;

  // STAGE 3: Breakout / Gap-Up Markup in Progress (Evaluated before Stealth Seeding to catch >9% spikes)
  if (
    isLargeSpike ||
    (priceChange3dPct > 6.5 && smh3dPct >= 15)
  ) {
    ignitionStage = 'STAGE_3_BREAKOUT_IN_PROGRESS';
    stageLabel = isCircuitLocked
      ? 'Circuit Locked Breakout (+15%)'
      : isNearCircuit
      ? 'Near-Circuit Breakout (≥+12.5%)'
      : isLargeSpike
      ? 'Markup Breakout / Gap Spike (>+9%)'
      : 'Markup Breakout in Progress';
    stageBadge = isCircuitLocked
      ? '🔒 Circuit Locked (+15%)'
      : isNearCircuit
      ? '⚡ Near Circuit (≥+12.5%)'
      : '🚀 Markup Breakout';
    ignitionScore = Math.min(85, Math.round(70 + (smh3dPct * 0.5)));
    entrySignal = isCircuitLocked ? 'CIRCUIT_LOCKED_AVOID_CHASE' : 'MOMENTUM_PULLBACK_ONLY';
    tacticalAdvice = isCircuitLocked
      ? `Stock is locked at or near the +15% upper circuit limit (+${priceChange3dPct}%). Extreme T+2 delivery risk if chasing locked circuit; wait for orderly pullback.`
      : isNearCircuit
      ? `Near circuit ceiling (+${priceChange3dPct}%). Approaching the +15% daily limit; high T+2 chase risk. Only enter on pullbacks toward Rs. ${bigBrokerVWAP3d.toFixed(1)}.`
      : `Large breakout/gap surge underway (+${priceChange3dPct}% toward ±15% band). Avoid chasing extended candles; wait for retest of Rs. ${bigBrokerVWAP3d.toFixed(1)} VWAP.`;
  }
  // STAGE 1: Stealth Seeding (Strictly requires flat/compressed price without >9% spike)
  else if (
    !isLargeSpike &&
    rvol3d >= 1.3 &&
    smh3dPct >= 12 &&
    t2RetentionPct >= 80 &&
    priceChange3dPct >= -2.0 &&
    priceChange3dPct <= 3.5 &&
    operatorProfitMargin3d <= 4.0
  ) {
    ignitionStage = 'STAGE_1_STEALTH_SEEDING';
    stageLabel = 'Day 1–2 Stealth Seeding';
    stageBadge = '🌱 Day 1–2 Stealth Seeding';
    ignitionScore = Math.min(88, Math.round(75 + (smh3dPct * 0.5) + (rvol3d * 4)));
    entrySignal = 'EARLY_ACCUMULATE';
    tacticalAdvice = `Quiet early seeding detected. Volume surging (${rvol3d}x) while price remains flat (+${priceChange3dPct}%). Accumulate with tight invalidation below Rs. ${(bigBrokerVWAP3d * 0.96).toFixed(1)}.`;
  }
  else if (smh3dPct > 8 && rvol3d >= 1.1) {
    ignitionScore = Math.min(74, Math.round(50 + (smh3dPct * 0.8) + (rvol3d * 5)));
    tacticalAdvice = `Mild institutional interest (+${smh3dPct}% SMH). Watch for volume expansion above 1.5x.`;
  }

  // Safe buy zone around 3D Big Broker VWAP
  const buyZoneMin = Number((bigBrokerVWAP3d * 0.975).toFixed(1));
  const buyZoneMax = Number((bigBrokerVWAP3d * 1.035).toFixed(1));

  return {
    symbol: sym,
    companyName: diag3d.companyName || sym,
    sector: diag3d.sector || 'Others',
    ltp,
    bigBrokerVWAP3d,
    marketVWAP3d: Number(diag3d.marketVWAP || ltp),
    priceChange3dPct,
    operatorProfitMargin3d,
    rvol3d,
    smh3dPct,
    top10NetBuyVol,
    top10NetSellVol,
    totalVolume3d,
    buyersCount,
    sellersCount,
    dispersionRatio,
    asymmetryBadge,
    t2RetentionPct,
    t2AccumulatedQty,
    t2DumpedOnDay0Qty,
    bcr5NetPct,
    scr3NetPct,
    isWashTrap,
    stage: ignitionStage,
    ignitionStage,
    stageLabel,
    stageBadge,
    ignitionScore,
    entrySignal,
    tacticalAdvice,
    tacticalPlan: {
      actionBadge: stageBadge,
      signal: entrySignal,
      advice: tacticalAdvice
    },
    buyZoneMin,
    buyZoneMax,
    leadAccumulator: diag3d.leadAccumulator,
    leadDistributor: diag3d.leadDistributor,
    isSyndicateCoAccumulation: Boolean(diag3d.isSyndicateCoAccumulation),
    syndicateBrokers: diag3d.syndicateBrokers || []
  };
}


/**
 * Classifies Wyckoff Phase & Evaluates Master 100 Gate 5 + Anti-Distribution Veto
 */
export function evaluateWyckoffAndGate5({
  bcr3GrossPct = 0,
  bcr5NetPct = 0,
  scr3NetPct = 0,
  priceChangePct = 0,
  smartMoneyNetFlowPct = 0,
}) {
  const bcr3 = Number(bcr3GrossPct) || 0;
  const bcr5 = Number(bcr5NetPct) || 0;
  const scr3 = Number(scr3NetPct) || 0;
  const dP = Number(priceChangePct) || 0;
  const netFlow = Number(smartMoneyNetFlowPct) || 0;

  // 1. Anti-Distribution / Bull-Trap Veto:
  // Rejects stocks if top brokers are heavily distributing (SCR3 >= 20% or SCR3 > BCR5) into retail price gains (dP > 2.5%)
  const isBullTrap = scr3 >= 20.0 && dP > 2.5 && scr3 > bcr5;
  const isDistributionIntoStrength = dP > 1.5 && scr3 > bcr5 * 1.15 && netFlow < 0;
  const antiDistributionVeto = isBullTrap || isDistributionIntoStrength;

  // 2. Wyckoff Phase Classification
  let phase = "NEUTRAL_EQUILIBRIUM";
  let phaseLabel = "Neutral Equilibrium";

  if (isBullTrap) {
    phase = "BULL_TRAP_DISTRIBUTION";
    phaseLabel = "Bull Trap (Institutional Distribution into Retail Buying)";
  } else if (bcr5 >= 18.0 && scr3 < 14.0 && Math.abs(dP) <= 4.5) {
    phase = "STEALTH_ACCUMULATION";
    phaseLabel = "Stealth Accumulation (High BCR5, Low Price Impact)";
  } else if (bcr5 >= 15.0 && dP > 4.5 && !antiDistributionVeto) {
    phase = "ACTIVE_MARKUP";
    phaseLabel = "Active Institutional Markup";
  } else if (scr3 >= 18.0 && dP < -2.0) {
    phase = "ACTIVE_MARKDOWN";
    phaseLabel = "Institutional Markdown / Supply Dominance";
  }

  // 3. Master 100% Profit Model — Gate 5 Verification
  // Gate 5 requires BCR3 >= 40.0% (or strong net institutional absorption) AND zero Anti-Distribution Veto
  const gate5Passed = bcr3 >= 40.0 && !antiDistributionVeto && bcr5 > scr3;

  return {
    phase,
    phaseLabel,
    isBullTrap,
    antiDistributionVeto,
    gate5Passed,
    gate5Reason: antiDistributionVeto
      ? `VETOED: Top-3 Seller Concentration (${scr3.toFixed(1)}%) distributing into +${dP.toFixed(2)}% retail price gain.`
      : gate5Passed
      ? `PASSED: BCR3 (${bcr3.toFixed(1)}%) >= 40.0% with net institutional accumulation (BCR5 ${bcr5.toFixed(1)}% vs SCR3 ${scr3.toFixed(1)}%).`
      : `BELOW THRESHOLD: BCR3 is ${bcr3.toFixed(1)}% (Requires >= 40.0%).`,
  };
}
