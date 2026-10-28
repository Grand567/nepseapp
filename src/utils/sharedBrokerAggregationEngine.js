/**
 * src/utils/sharedBrokerAggregationEngine.js
 *
 * UNIFIED CANONICAL MICROSTRUCTURE & BROKER LEDGER ENGINE
 * Single Source of Truth for Broker Flow, Smart Money, Stock Overview, and Accumulation/Distribution Radar.
 *
 * Enforces:
 * 1. Strictly Amount/Quantity-Weighted Pricing (VWAP = sum(Amt) / sum(Qty)), NEVER unweighted mean.
 * 2. Unified Internal Cross-Trade Rule:
 *    - Cross trades (buyerBroker === sellerBroker) net to 0 (NetQty = 0).
 *    - Cross trades are included in total volume sums so BuyVol === SellVol === TotalVolume.
 *    - Cross trades are STRICTLY EXCLUDED from gross concentration ratios (BCR3, BCR5, SCR3).
 * 3. Minimum Activity Guards: Turnover < Rs. 50k, Volume < 200, Distinct Brokers < 3
 *    -> Outputs 'INSUFFICIENT ACTIVITY' instead of speculative labels.
 * 4. Microstructure Wyckoff Phase Classification & Smart Money Score.
 */

export const TOP_NEPSE_BROKERS = {
  "1": "Kumari Securities (#1)",
  "2": "Khadga Securities (#2)",
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
  "68": "Reliable Securities (#68)",
  "69": "Elite Stock (#69)",
  "70": "Infinity Securities (#70)",
  "71": "Index Securities (#71)",
  "72": "Subha Securities (#72)",
  "73": "Kalash Stock (#73)",
  "74": "Magnet Securities (#74)",
  "75": "Nabil Stock Dealer (#75)",
  "96": "Himalayan Securities (#96)"
};

export function getBrokerName(id) {
  const cleanId = String(id || '').replace(/^0+/, '').trim();
  return TOP_NEPSE_BROKERS[cleanId] || `Broker #${cleanId}`;
}

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
  RETAIL_ABSORPTION: {
    title: "Retail Absorption",
    badge: "🟡 Moderate Retail Absorption",
    criteria: "Top-5 Buyer Concentration > Top-3 Seller Concentration with Ticket Ratio >= 1.05",
    explanation: "Moderate accumulation with buy-side dispersion."
  },
  NEUTRAL_RETAIL: {
    title: "Normal Retail Flow",
    badge: "⚪ Balanced Order Book",
    criteria: "Evenly dispersed buy/sell orders without dominant broker cornering",
    explanation: "Trading is distributed across broad retail participants without asymmetric institutional dominance."
  },
  INSUFFICIENT_ACTIVITY: {
    title: "Insufficient Activity",
    badge: "⚪ Insufficient Activity",
    criteria: "Turnover < Rs. 50,000 | Volume < 200 shares | Active Brokers < 3",
    explanation: "Trading volume, turnover, or broker participation is too thin for statistically reliable institutional accumulation/distribution detection."
  }
};

/**
 * Core Shared Aggregator
 */
export function aggregateBrokerMicrostructure(params = {}) {
  const normSym = String(params.symbol || params.targetSymbol || '').toUpperCase().trim();
  const windowData = Array.isArray(params.windowData) ? params.windowData : (Array.isArray(params.dailyHistory) ? params.dailyHistory : []);
  const rawTrades = Array.isArray(params.contracts) ? params.contracts : (Array.isArray(params.trades) ? params.trades : (Array.isArray(params.floorsheet) ? params.floorsheet : []));
  const dailyLedgerRows = Array.isArray(params.dailyLedgerRows) ? params.dailyLedgerRows : (Array.isArray(params.brokerRows) ? params.brokerRows : []);
  const stockSummary = params.stockSummary || {};
  const days = Number(params.days || 1);

  const brokerMap = new Map();
  let totalVolume = 0;
  let totalTurnover = 0;
  let totalTradesCount = 0;
  let totalNonCrossBuyVol = 0;
  let totalNonCrossSellVol = 0;
  let crossTradesCount = 0;
  let crossVolume = 0;
  let crossTurnover = 0;

  // PATH 1: Raw floorsheet contracts provided
  if (rawTrades.length > 0) {
    const symbolTrades = rawTrades.filter(t => {
      const s = String(t.symbol || t.stockSymbol || t.contractSymbol || '').toUpperCase().trim();
      return !normSym || !s || s === normSym;
    });

    const seenContracts = new Set();
    for (const t of symbolTrades) {
      const cid = String(t.contractId ?? t.contract_no ?? t.contractNo ?? t.id ?? '').trim();
      if (cid) {
        if (seenContracts.has(cid)) continue;
        seenContracts.add(cid);
      }

      const qty = Math.round(Number(t.quantity || t.qty || t.kitta || t.contractQuantity || 0));
      const rate = Number(t.rate || t.price || t.contractRate || 0);
      const rawAmt = Number(t.amount || t.contractAmount || 0);
      const expectedAmt = qty > 0 && rate > 0 ? Number((qty * rate).toFixed(2)) : 0;
      const amt = (expectedAmt > 0 && (rawAmt <= 0 || Math.abs(rawAmt - expectedAmt) > Math.max(1, expectedAmt * 0.01)))
        ? expectedAmt
        : (rawAmt > 0 ? rawAmt : expectedAmt);
      const bId = String(t.buyer || t.buyerBroker || t.buyer_broker || t.buyerMemberId || '').replace(/^0+/, '').trim();
      const sId = String(t.seller || t.sellerBroker || t.seller_broker || t.sellerMemberId || '').replace(/^0+/, '').trim();
      const isCross = Boolean(bId && sId && bId === sId);

      if (qty <= 0) continue;

      totalVolume += qty;
      totalTurnover += amt;
      totalTradesCount += 1;

      if (isCross) {
        crossTradesCount++;
        crossVolume += qty;
        crossTurnover += amt;
      } else {
        totalNonCrossBuyVol += qty;
        totalNonCrossSellVol += qty;
      }

      // Record buyer
      if (bId) {
        if (!brokerMap.has(bId)) {
          brokerMap.set(bId, {
            brokerId: bId,
            brokerName: getBrokerName(bId),
            buyVol: 0,
            sellVol: 0,
            crossVol: 0,
            nonCrossBuyVol: 0,
            nonCrossSellVol: 0,
            buyAmt: 0,
            sellAmt: 0,
            buyTrades: 0,
            sellTrades: 0
          });
        }
        const b = brokerMap.get(bId);
        b.buyVol += qty;
        b.buyAmt += amt;
        b.buyTrades += 1;
        if (isCross) {
          b.crossVol = (b.crossVol || 0) + qty;
        } else {
          b.nonCrossBuyVol += qty;
        }
      }

      // Record seller
      if (sId) {
        if (!brokerMap.has(sId)) {
          brokerMap.set(sId, {
            brokerId: sId,
            brokerName: getBrokerName(sId),
            buyVol: 0,
            sellVol: 0,
            crossVol: 0,
            nonCrossBuyVol: 0,
            nonCrossSellVol: 0,
            buyAmt: 0,
            sellAmt: 0,
            buyTrades: 0,
            sellTrades: 0
          });
        }
        const s = brokerMap.get(sId);
        s.sellVol += qty;
        s.sellAmt += amt;
        s.sellTrades += 1;
        if (!isCross) {
          s.nonCrossSellVol += qty;
        }
      }
    }
  }
  // PATH 2: windowData (multi-day session objects) provided
  else if (windowData.length > 0) {
    // Exclude any partial session (e.g. 2026-10-25 with only 2 scrips) from multi-day calculation windows
    const validSessions = windowData.filter(s => 
      s.calendarStatus !== 'PARTIAL_SESSION' && 
      s.calendar_status !== 'PARTIAL_SESSION' && 
      s.trade_date !== '2026-10-25' && 
      s.date !== '2026-10-25'
    );
    const slice = validSessions.slice(0, days);
    for (const session of slice) {
      totalVolume += Number(session.totalVolume || session.volume || 0);
      totalTurnover += Number(session.totalTurnover || session.turnover || 0);
      totalTradesCount += Number(session.transactions || session.trades || session.totalTransactions || 0);

      for (const b of (session.brokers || [])) {
        const bId = String(b.brokerId || b.broker || b.id || b.brokerNo || '').replace(/^0+/, '').trim();
        if (!bId) continue;

        if (!brokerMap.has(bId)) {
          brokerMap.set(bId, {
            brokerId: bId,
            brokerName: getBrokerName(bId),
            buyVol: 0,
            sellVol: 0,
            crossVol: 0,
            nonCrossBuyVol: 0,
            nonCrossSellVol: 0,
            buyAmt: 0,
            sellAmt: 0,
            buyTrades: 0,
            sellTrades: 0
          });
        }
        const prev = brokerMap.get(bId);
        const bVol = Number(b.buyVol || b.buyQty || b.shares || b.volume || 0);
        const sVol = Number(b.sellVol || b.sellQty || 0);
        const bAmt = Number(b.buyAmt ?? b.buyAmount ?? (bVol * Number(b.avgBuyPrice || b.rate || 0)) ?? 0);
        const sAmt = Number(b.sellAmt ?? b.sellAmount ?? (sVol * Number(b.avgSellPrice || b.rate || 0)) ?? 0);

        const bCross = Number(b.crossVol || b.cross_vol || 0);
        const nonCrossB = Math.max(0, bVol - bCross);
        const nonCrossS = Math.max(0, sVol - bCross);

        prev.buyVol += bVol;
        prev.sellVol += sVol;
        prev.crossVol = (prev.crossVol || 0) + bCross;
        prev.nonCrossBuyVol += nonCrossB;
        prev.nonCrossSellVol += nonCrossS;
        prev.buyAmt += bAmt;
        prev.sellAmt += sAmt;
        if (bVol > 0) prev.buyTrades += Number(b.buyTrades || b.trades || 1);
        if (sVol > 0) prev.sellTrades += Number(b.sellTrades || b.trades || 1);

        totalNonCrossBuyVol += nonCrossB;
        totalNonCrossSellVol += nonCrossS;
      }
    }
    if (totalNonCrossBuyVol === 0 && crossVolume === 0) totalNonCrossBuyVol = totalVolume;
    if (totalNonCrossSellVol === 0 && crossVolume === 0) totalNonCrossSellVol = totalVolume;
  }
  // PATH 3: dailyLedgerRows (direct SQLite rows) provided
  else if (dailyLedgerRows.length > 0) {
    for (const r of dailyLedgerRows) {
      if (r.calendarStatus === 'PARTIAL_SESSION' || r.calendar_status === 'PARTIAL_SESSION' || r.trade_date === '2026-10-25' || r.tradeDate === '2026-10-25') {
        continue;
      }
      const bId = String(r.brokerId || r.broker || r.broker_id || r.broker_no || '').replace(/^0+/, '').trim();
      if (!bId) continue;

      const bVol = Number(r.buyVol || r.buy_vol || r.buyKitta || r.buy_kitta || 0);
      const sVol = Number(r.sellVol || r.sell_vol || r.sellKitta || r.sell_kitta || 0);
      const bAmt = Number(r.buyAmt || r.buy_amt || r.buyAmount || r.buy_amount || 0);
      const sAmt = Number(r.sellAmt || r.sell_amt || r.sellAmount || r.sell_amount || 0);
      const crossVol = Number(r.crossVol || r.cross_vol || 0);
      const nonCrossB = Math.max(0, bVol - crossVol);
      const nonCrossS = Math.max(0, sVol - crossVol);

      totalVolume += bVol;
      totalTurnover += bAmt;

      if (!brokerMap.has(bId)) {
        brokerMap.set(bId, {
          brokerId: bId,
          brokerName: getBrokerName(bId),
          buyVol: 0,
          sellVol: 0,
          crossVol: 0,
          nonCrossBuyVol: 0,
          nonCrossSellVol: 0,
          buyAmt: 0,
          sellAmt: 0,
          buyTrades: 0,
          sellTrades: 0
        });
      }
      const prev = brokerMap.get(bId);
      prev.buyVol += bVol;
      prev.sellVol += sVol;
      prev.crossVol = (prev.crossVol || 0) + crossVol;
      prev.nonCrossBuyVol += nonCrossB;
      prev.nonCrossSellVol += nonCrossS;
      prev.buyAmt += bAmt;
      prev.sellAmt += sAmt;
      if (bVol > 0) prev.buyTrades += Number(r.buyTrades || r.trades || 1);
      if (sVol > 0) prev.sellTrades += Number(r.sellTrades || r.trades || 1);

      totalNonCrossBuyVol += nonCrossB;
      totalNonCrossSellVol += nonCrossS;
    }
    // When non-cross total is 0, do NOT fallback to totalVolume (Part D)
  }
  // PATH 4: realBrokerAnalysis / cached broker data provided
  else if (params.realBrokerAnalysis || stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis) {
    const rba = params.realBrokerAnalysis || stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis;
    const rawBuyers = Array.isArray(rba?.topBuyers) ? rba.topBuyers : (Array.isArray(rba?.topBuyerBrokers) ? rba.topBuyerBrokers : []);
    const rawSellers = Array.isArray(rba?.topSellers) ? rba.topSellers : (Array.isArray(rba?.topSellerBrokers) ? rba.topSellerBrokers : []);
    const brokersList = Array.isArray(rba?.brokers) && rba.brokers.length > 0 ? rba.brokers : [...rawBuyers, ...rawSellers];

    if (brokersList.length > 0) {
      let sumBuyVol = 0;
      let sumSellVol = 0;
      let sumBuyAmt = 0;
      let sumSellAmt = 0;
      for (const b of brokersList) {
        const bId = String(b.brokerId || b.broker || b.id || b.brokerNo || '').replace(/^0+/, '').trim();
        if (!bId) continue;
        const bVol = Number(b.buyVol || b.buyQty || b.buyKitta || b.shares || (b.sellQty || b.sellKitta ? 0 : b.volume) || 0);
        const sVol = Number(b.sellVol || b.sellQty || b.sellKitta || 0);
        const bAmt = Number(b.buyAmt ?? b.buyAmount ?? (bVol * Number(b.avgBuyPrice || b.avgBuyRate || b.rate || 0)) ?? 0);
        const sAmt = Number(b.sellAmt ?? b.sellAmount ?? (sVol * Number(b.avgSellPrice || b.avgSellRate || b.rate || 0)) ?? 0);
        const bCross = Number(b.crossVol || b.cross_vol || 0);
        const nonCrossB = Math.max(0, bVol - bCross);
        const nonCrossS = Math.max(0, sVol - bCross);

        sumBuyVol += bVol;
        sumSellVol += sVol;
        sumBuyAmt += bAmt;
        sumSellAmt += sAmt;

        if (!brokerMap.has(bId)) {
          brokerMap.set(bId, {
            brokerId: bId,
            brokerName: b.brokerName || b.name || getBrokerName(bId),
            buyVol: 0,
            sellVol: 0,
            crossVol: 0,
            nonCrossBuyVol: 0,
            nonCrossSellVol: 0,
            buyAmt: 0,
            sellAmt: 0,
            buyTrades: 0,
            sellTrades: 0
          });
        }
        const prev = brokerMap.get(bId);
        prev.buyVol += bVol;
        prev.sellVol += sVol;
        prev.crossVol += bCross;
        prev.nonCrossBuyVol += nonCrossB;
        prev.nonCrossSellVol += nonCrossS;
        prev.buyAmt += bAmt;
        prev.sellAmt += sAmt;
        if (bVol > 0) prev.buyTrades += Number(b.buyTrades || b.trades || 1);
        if (sVol > 0) prev.sellTrades += Number(b.sellTrades || b.trades || 1);

        totalNonCrossBuyVol += nonCrossB;
        totalNonCrossSellVol += nonCrossS;
      }
      // Do NOT sum buyVol + sellVol (which doubles market volume); use authoritative totalVolume or max(sumBuyVol, sumSellVol)
      totalVolume = Number(rba?.totalVolume || rba?.summary?.totalVolume || 0) || Math.max(sumBuyVol, sumSellVol);
      totalTurnover = Number(rba?.totalTurnover || rba?.summary?.totalTurnover || rba?.summary?.totalAmount || 0) || Math.max(sumBuyAmt, sumSellAmt);
      if (totalNonCrossBuyVol === 0) totalNonCrossBuyVol = totalVolume;
      if (totalNonCrossSellVol === 0) totalNonCrossSellVol = totalVolume;
    }
  }

  // Stock summary fallback volume / turnover
  const summaryVol = Number(stockSummary.total_volume || stockSummary.totalTradedQuantity || stockSummary.volume || 0);
  const summaryTurnover = Number(stockSummary.total_turnover || stockSummary.totalTurnover || stockSummary.turnover || 0);
  if (totalVolume === 0 && summaryVol > 0) totalVolume = summaryVol;
  if (totalTurnover === 0 && summaryTurnover > 0) totalTurnover = summaryTurnover;

  // Build Enriched Broker Profiles (Strictly Amount/Quantity-Weighted VWAP)
  const allBrokers = Array.from(brokerMap.values()).map(b => {
    const netQty = b.buyVol - b.sellVol;
    const netAmt = b.buyAmt - b.sellAmt;
    const avgBuyPrice = b.buyVol > 0 ? Number((b.buyAmt / b.buyVol).toFixed(2)) : 0;
    const avgSellPrice = b.sellVol > 0 ? Number((b.sellAmt / b.sellVol).toFixed(2)) : 0;
    const combinedVol = b.buyVol + b.sellVol;
    const vwap = combinedVol > 0 ? Number(((b.buyAmt + b.sellAmt) / combinedVol).toFixed(2)) : 0;
    const retentionPct = b.buyVol > 0 ? Number(((Math.max(0, netQty) / b.buyVol) * 100).toFixed(1)) : 0;
    const pct = totalVolume > 0 ? Number(((b.buyVol / totalVolume) * 100).toFixed(1)) : 0;

    return {
      broker: b.brokerId,
      brokerId: b.brokerId,
      brokerName: b.brokerName,
      name: b.brokerName,
      volume: b.buyVol,
      buyVol: b.buyVol,
      buyVolume: b.buyVol,
      buyQty: b.buyVol,
      sellVol: b.sellVol,
      sellVolume: b.sellVol,
      sellQty: b.sellVol,
      crossVol: b.crossVol || 0,
      nonCrossVolume: b.nonCrossBuyVol,
      nonCrossBuyVol: b.nonCrossBuyVol,
      nonCrossSellVol: b.nonCrossSellVol,
      amount: b.buyAmt,
      buyAmt: b.buyAmt,
      buyAmount: b.buyAmt,
      buyTurnoverNpr: b.buyAmt,
      sellAmt: b.sellAmt,
      sellAmount: b.sellAmt,
      sellTurnoverNpr: b.sellAmt,
      avgBuyPrice,
      avgBuyRate: avgBuyPrice,
      avgSellPrice,
      avgSellRate: avgSellPrice,
      vwap,
      netVol: netQty,
      netQty,
      netKitta: netQty,
      netAmount: netAmt,
      netAmt,
      holdQty: Math.max(0, netQty),
      signedHoldQty: netQty,
      retentionPct,
      pct,
      trades: b.buyTrades + b.sellTrades,
      buyTrades: b.buyTrades,
      sellTrades: b.sellTrades
    };
  });

  const sortedBuyers = [...allBrokers].sort((a, b) => (b.buyVol - a.buyVol) || (b.buyAmt - a.buyAmt) || String(a.brokerId).localeCompare(String(b.brokerId), undefined, { numeric: true }));
  const sortedSellers = [...allBrokers].sort((a, b) => (b.sellVol - a.sellVol) || (b.sellAmt - a.sellAmt) || String(a.brokerId).localeCompare(String(b.brokerId), undefined, { numeric: true }));
  const topAccumulators = [...allBrokers].filter(b => b.netQty > 0).sort((a, b) => (b.netQty - a.netQty) || (b.netAmt - a.netAmt) || String(a.brokerId).localeCompare(String(b.brokerId), undefined, { numeric: true }));
  const topDistributors = [...allBrokers].filter(b => b.netQty < 0).sort((a, b) => (a.netQty - b.netQty) || (a.netAmt - b.netAmt) || String(a.brokerId).localeCompare(String(b.brokerId), undefined, { numeric: true }));

  // Gross Concentration strictly excludes same-broker cross trades from numerator AND denominator (Item 1 & 6)
  const top3GrossBuyVol = sortedBuyers.slice(0, 3).reduce((sum, b) => sum + (b.nonCrossBuyVol ?? b.buyVol), 0);
  const top5GrossBuyVol = sortedBuyers.slice(0, 5).reduce((sum, b) => sum + (b.nonCrossBuyVol ?? b.buyVol), 0);
  const top3GrossSellVol = sortedSellers.slice(0, 3).reduce((sum, s) => sum + (s.nonCrossSellVol ?? s.sellVol), 0);

  // Exclude crosses from both numerator AND denominator (External Arm's-Length Market Volume Denominator)
  // When non-cross total is 0, do NOT fallback to totalVolume (Part D)
  const effBuyVol = totalNonCrossBuyVol;
  const effSellVol = totalNonCrossSellVol;

  let bcr3BuyPct = effBuyVol > 0 ? Number(Math.min(100.0, (top3GrossBuyVol / effBuyVol) * 100).toFixed(1)) : 0;
  let bcr5BuyPct = effBuyVol > 0 ? Number(Math.min(100.0, (top5GrossBuyVol / effBuyVol) * 100).toFixed(1)) : 0;
  let scr3SellPct = effSellVol > 0 ? Number(Math.min(100.0, (top3GrossSellVol / effSellVol) * 100).toFixed(1)) : 0;

  // If authentic concentration was already supplied in rba without raw trades
  const rbaData = params.realBrokerAnalysis || stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis;
  if (rawTrades.length === 0 && rbaData?.bcr3BuyPct !== undefined) {
    bcr3BuyPct = Number(rbaData.bcr3BuyPct);
    bcr5BuyPct = Number(rbaData.bcr5BuyPct || (bcr3BuyPct / 0.77).toFixed(1));
  } else if (rawTrades.length === 0 && rbaData?.concentrationPct !== undefined) {
    bcr3BuyPct = Number(rbaData.concentrationPct);
    bcr5BuyPct = Number(rbaData.bcr5BuyPct || (bcr3BuyPct / 0.77).toFixed(1));
  }

  // Bilateral Cross-Trade Neutralization (Part D)
  const isPureCrossTrade = Boolean(totalVolume > 0 && totalNonCrossBuyVol === 0);
  const isMatchedCrossTrade = Boolean(
    isPureCrossTrade || (
      sortedBuyers.length > 0 &&
      sortedSellers.length > 0 &&
      sortedBuyers[0]?.brokerId === sortedSellers[0]?.brokerId &&
      (totalNonCrossBuyVol === 0 || (bcr3BuyPct >= 95 && scr3SellPct >= 95))
    )
  );

  // Thin Sample Guard (< 500 kitta with <= 1 trade, or volume < 200)
  const isThinSample = !isMatchedCrossTrade && ((rawTrades.length > 0 && rawTrades.length <= 1 && totalVolume < 500) || (totalVolume > 0 && totalVolume < 200));
  if (isThinSample) {
    bcr3BuyPct = 0;
    bcr5BuyPct = 0;
    scr3SellPct = 0;
  }

  // Net Concentration strictly uses non-cross denominator (Part D)
  const top3NetBuyVol = topAccumulators.slice(0, 3).reduce((sum, b) => sum + b.netQty, 0);
  const top5NetBuyVol = topAccumulators.slice(0, 5).reduce((sum, b) => sum + b.netQty, 0);
  const top3NetSellVol = topDistributors.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.netQty), 0);

  const bcr3NetPct = effBuyVol > 0 ? Number(((top3NetBuyVol / effBuyVol) * 100).toFixed(1)) : 0;
  const bcr5NetPct = effBuyVol > 0 ? Number(((top5NetBuyVol / effBuyVol) * 100).toFixed(1)) : 0;
  const scr3NetPct = effSellVol > 0 ? Number(((top3NetSellVol / effSellVol) * 100).toFixed(1)) : 0;
  const scr3GrossSellPct = effSellVol > 0 ? Number(((top3GrossSellVol / effSellVol) * 100).toFixed(1)) : 0;

  // Average Trade Sizes & Asymmetry
  const top3BuyerTrades = sortedBuyers.slice(0, 3).reduce((sum, b) => sum + Math.max(1, b.buyTrades), 0);
  const top3SellerTrades = sortedSellers.slice(0, 3).reduce((sum, s) => sum + Math.max(1, s.sellTrades), 0);
  const avgBuyTradeSize = top3BuyerTrades > 0 ? Math.round(top3GrossBuyVol / top3BuyerTrades) : 0;
  const avgSellTradeSize = top3SellerTrades > 0 ? Math.round(top3GrossSellVol / top3SellerTrades) : 0;
  const tradeSizeRatio = avgSellTradeSize > 0 ? Number((avgBuyTradeSize / avgSellTradeSize).toFixed(2)) : 1.0;

  const marketVWAP = totalVolume > 0 ? Number((totalTurnover / totalVolume).toFixed(2)) : 0;
  const top5GrossBuyAmt = topAccumulators.slice(0, 5).reduce((sum, b) => sum + b.buyAmt, 0);
  const top5GrossBuyQty = topAccumulators.slice(0, 5).reduce((sum, b) => sum + b.buyVol, 0);
  const bigBrokerVWAP = top5GrossBuyQty > 0 ? Number((top5GrossBuyAmt / top5GrossBuyQty).toFixed(2)) : marketVWAP;

  // Prices & Price Change
  const latestClose = Number(stockSummary.close_price || stockSummary.close || stockSummary.ltp || (windowData[0]?.close || marketVWAP));
  const openPrice = Number(stockSummary.open_price || stockSummary.open || (windowData[windowData.length - 1]?.open || latestClose));
  const priceChangePct = openPrice > 0 ? Number((((latestClose - openPrice) / openPrice) * 100).toFixed(2)) : 0;

  // Relative & Absolute Minimum Activity Guards (Item 5 & 6)
  // Absolute floors:
  // MIN_ABS_VOLUME = 200 kitta, MIN_ABS_TURNOVER = 50,000 NPR, MIN_ABS_BROKERS = 3, MIN_ABS_TRADES = 3
  // Relative baseline: 20-session average volume, turnover, trade count
  const baseline20d = params.baseline20d || stockSummary?.baseline20d || stockSummary?.history20d || null;
  const avgVol20 = Number(baseline20d?.avgVolume || baseline20d?.avgVol || stockSummary?.avgVolume20 || 0);
  const avgTurnover20 = Number(baseline20d?.avgTurnover || stockSummary?.avgTurnover20 || 0);
  const avgTrades20 = Number(baseline20d?.avgTrades || stockSummary?.avgTrades20 || 0);

  // UNTUNED: Relative activity floors (20% of 20-session baseline)
  const RELATIVE_FLOOR_PCT = 0.20;
  const isBelowRelativeFloor = Boolean(
    (avgVol20 > 0 && totalVolume < avgVol20 * RELATIVE_FLOOR_PCT) ||
    (avgTurnover20 > 0 && totalTurnover < avgTurnover20 * RELATIVE_FLOOR_PCT) ||
    (avgTrades20 > 0 && totalTradesCount < avgTrades20 * RELATIVE_FLOOR_PCT)
  );

  const distinctBrokers = allBrokers.length;
  const isUnderactive = !isPureCrossTrade && !isMatchedCrossTrade && (
    (totalTurnover > 0 && totalTurnover < 50000) ||
    (totalVolume > 0 && totalVolume < 200) ||
    (distinctBrokers > 0 && distinctBrokers < 3) ||
    (totalTradesCount > 0 && totalTradesCount < 3) ||
    isBelowRelativeFloor
  );

  // Wyckoff Classification (Item 4 & 5)
  let phase = "NEUTRAL_RETAIL";
  let phaseLabel = "Normal Retail Flow";
  let smartMoneyBias = "Neutral";
  let adSignal = "Neutral";

  if (isPureCrossTrade || isMatchedCrossTrade) {
    phase = "NEUTRAL_RETAIL";
    phaseLabel = "Bilateral Block Transfer";
    smartMoneyBias = "Neutral";
    adSignal = "Neutral";
  } else if (isThinSample) {
    phase = "INSUFFICIENT_ACTIVITY";
    phaseLabel = "INSUFFICIENT ACTIVITY";
    smartMoneyBias = "Insufficient Data";
    adSignal = "INSUFFICIENT ACTIVITY";
  } else if (isUnderactive || totalVolume === 0) {
    phase = "INSUFFICIENT_ACTIVITY";
    phaseLabel = "INSUFFICIENT ACTIVITY";
    smartMoneyBias = "INSUFFICIENT ACTIVITY";
    adSignal = "INSUFFICIENT ACTIVITY";
  } else {
    // All thresholds below are UNTUNED heuristic baseline thresholds (Item 5)
    // Symmetrical k=3 comparisons on both buy and sell sides
    const isInstitutionalDumping = (scr3NetPct >= 18.0 && scr3NetPct > bcr3NetPct) || // UNTUNED
                                   (scr3GrossSellPct >= 38.0 && scr3GrossSellPct > bcr3BuyPct) || // UNTUNED
                                   (scr3GrossSellPct >= 42.0 && tradeSizeRatio <= 0.70); // UNTUNED
    const isBullTrap = scr3NetPct >= 20.0 && scr3NetPct > bcr3NetPct && priceChangePct > 2.5; // UNTUNED
    const isInstitutionalAccumulation = (bcr3NetPct >= 18.0 && bcr3NetPct > scr3NetPct && scr3NetPct < 14.0) || // UNTUNED
                                        (bcr3BuyPct >= 40.0 && tradeSizeRatio >= 1.40); // UNTUNED
    const isActiveMarkup = bcr3NetPct >= 15.0 && bcr3NetPct > scr3NetPct && priceChangePct > 4.5 && latestClose >= bigBrokerVWAP; // UNTUNED
    const isRetailAbsorption = bcr3BuyPct > scr3SellPct && bcr3NetPct > scr3NetPct && scr3NetPct < 14.0 && scr3GrossSellPct < 30.0 && tradeSizeRatio >= 1.05; // UNTUNED

    if (isBullTrap) {
      phase = "BULL_TRAP";
      phaseLabel = "Bull Trap (Retail Buying Top)";
      smartMoneyBias = "Operator Offloading";
      adSignal = "Distribution";
    } else if (isInstitutionalDumping) {
      phase = "DISTRIBUTION_DANGER";
      phaseLabel = "Distribution Danger";
      smartMoneyBias = "Operator Offloading";
      adSignal = "Distribution";
    } else if (isInstitutionalAccumulation) {
      phase = "STEALTH_ACCUMULATION";
      phaseLabel = "Stealth Accumulation";
      smartMoneyBias = "Institutional Cornering";
      adSignal = "Accumulation";
    } else if (isActiveMarkup) {
      phase = "ACTIVE_MARKUP";
      phaseLabel = "Active Markup";
      smartMoneyBias = "Institutional Cornering";
      adSignal = "Accumulation";
    } else if (isRetailAbsorption) {
      phase = "RETAIL_ABSORPTION";
      phaseLabel = "Retail Absorption";
      smartMoneyBias = "Retail Absorption";
      adSignal = "Accumulation";
    } else {
      phase = "NEUTRAL_RETAIL";
      phaseLabel = "Normal Retail Flow";
      smartMoneyBias = "Neutral";
      adSignal = "Neutral";
    }
  }

  // Smart Money Score (0 to 100) - Equal k=3 comparisons (Item 5)
  let netAbsorptionScore = 0;
  if (totalVolume > 0) {
    const netFlowPct = bcr3NetPct - scr3NetPct; // Equal k=3 net flow (UNTUNED)
    netAbsorptionScore = Math.max(-25, Math.min(25, Math.round(netFlowPct * 1.25))); // UNTUNED
  }
  const concentrationSpread = bcr3BuyPct - scr3SellPct; // Equal k=3 gross spread (UNTUNED)
  const concentrationScore = Math.max(-15, Math.min(15, Math.round(concentrationSpread * 0.5))); // UNTUNED
  let ticketSizeScore = 0;
  if (tradeSizeRatio >= 1.5) ticketSizeScore = 10; // UNTUNED
  else if (tradeSizeRatio <= 0.65) ticketSizeScore = -10; // UNTUNED
  else ticketSizeScore = Math.round((tradeSizeRatio - 1.0) * 15); // UNTUNED

  let smartMoneyScore = isUnderactive
    ? 50
    : Math.max(0, Math.min(100, Math.round(50 + netAbsorptionScore + concentrationScore + ticketSizeScore)));

  // Direction Consistency Enforcement (Item 4):
  // Score >= 60 is strictly Accumulation; Score <= 40 is strictly Distribution
  if (!isMatchedCrossTrade && !isThinSample && !isUnderactive && totalVolume > 0) {
    if (smartMoneyScore >= 60 && adSignal !== "Accumulation") {
      phase = "STEALTH_ACCUMULATION";
      phaseLabel = "Stealth Accumulation";
      smartMoneyBias = "Institutional Cornering";
      adSignal = "Accumulation";
    } else if (smartMoneyScore <= 40 && adSignal !== "Distribution") {
      phase = "DISTRIBUTION_DANGER";
      phaseLabel = "Distribution Danger";
      smartMoneyBias = "Operator Offloading";
      adSignal = "Distribution";
    }
  }

  const smartMoneyNetVolume = topAccumulators.reduce((sum, b) => sum + b.netQty, 0);
  const asymmetryRatio = Number((bcr3BuyPct / Math.max(1, scr3SellPct)).toFixed(2));
  const top3NetBuy = sortedBuyers.slice(0, 3).reduce((sum, b) => sum + Math.max(0, b.netQty), 0);
  const top3GrossBuy = sortedBuyers.slice(0, 3).reduce((sum, b) => sum + b.buyVol, 0);
  const netAbsorptionRatio = top3GrossBuy > 0 ? Number((top3NetBuy / top3GrossBuy).toFixed(2)) : 1.0;

  const distinctTradeDates = new Set(
    rawTrades.map(t => t.tradeDate || t.trade_date || t.date).filter(Boolean)
  );
  const actualSessions = windowData.length > 0 ? windowData.length : (distinctTradeDates.size > 0 ? distinctTradeDates.size : 1);
  const isHistoryIncomplete = days > 1 && actualSessions < days;
  const historyWarning = isHistoryIncomplete ? `INCOMPLETE HISTORY: ${actualSessions} of ${days} sessions` : null;
  const scopeLabel = isHistoryIncomplete
    ? `INCOMPLETE HISTORY: ${actualSessions} of ${days} sessions`
    : (actualSessions === 1
        ? `Latest Trading Session — Intraday Microstructure`
        : `Cumulative ${actualSessions}-Day Window — Institutional Trend & Absorption`);

  return {
    symbol: normSym,
    scopeLabel,
    historyWarning,
    isHistoryIncomplete,
    actualSessions,
    requestedSessions: days,
    totalVolume,
    totalTurnover,
    totalBuyVolume: totalVolume,
    totalSellVolume: totalVolume,
    crossVolume,
    crossTurnover,
    totalNonCrossBuyVol,
    totalNonCrossSellVol,
    netVolume: smartMoneyNetVolume,
    smartMoneyNetVolume,
    marketVWAP,
    bigBrokerVWAP,
    latestClose,
    bcr3BuyPct,
    bcr5BuyPct,
    bcr3SellPct: scr3SellPct,
    scr3SellPct,
    bcr3NetPct,
    bcr5NetPct,
    scr3NetPct,
    grossBuyConcentrationPct: bcr5BuyPct,
    grossSellConcentrationPct: scr3SellPct,
    topBuyerBrokers: sortedBuyers.slice(0, 5),
    topGrossBuyers: sortedBuyers.slice(0, 5),
    topBuyers: sortedBuyers.slice(0, 5),
    topSellerBrokers: sortedSellers.slice(0, 5),
    topGrossSellers: sortedSellers.slice(0, 5),
    topSellers: sortedSellers.slice(0, 5),
    topAccumulators: topAccumulators.slice(0, 5),
    topNetAccumulators: topAccumulators.slice(0, 5),
    topDistributors: topDistributors.slice(0, 5),
    topNetDistributors: topDistributors.slice(0, 5),
    allBrokers,
    avgBuyTradeSize,
    avgSellTradeSize,
    tradeSizeRatio,
    asymmetryRatio,
    netAbsorptionRatio,
    phase,
    phaseLabel,
    smartMoneyBias,
    adSignal,
    smartMoneyScore,
    isMatchedCrossTrade,
    isUnderactive,
    isInsufficientSample: Boolean(isUnderactive || isThinSample),
    sampleValidity: isMatchedCrossTrade ? 'CROSS_TRADE' : (isThinSample || isUnderactive ? 'INSUFFICIENT_SAMPLE' : 'VALID'),
    status: (isUnderactive || isThinSample) ? 'insufficient_sample' : 'complete',
    description: isMatchedCrossTrade
      ? `Neutral / Bilateral Block Transfer: Broker #${sortedBuyers[0]?.brokerId} matched both sides.`
      : (isThinSample
        ? `Insufficient trade sample (${rawTrades.length} trades, ${totalVolume} kitta). Thin volume prevents statistically valid broker concentration calculation.`
        : (isUnderactive
          ? `Insufficient activity (${totalTradesCount} trades, ${totalVolume} shares, Rs. ${Math.round(totalTurnover)} turnover, ${distinctBrokers} brokers).`
          : `${smartMoneyBias}: Top 3 buyers hold ${bcr3BuyPct}% concentration with ticket ratio ${tradeSizeRatio}x.`))
  };
}
