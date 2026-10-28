/**
 * brokerFloorsheetSignals.js
 * Comprehensive Microstructure, Broker & Floorsheet Signal Engine
 *
 * Implements exact mathematical formulas for:
 * 1. Net Accumulation by Top Brokers (Absorption ratio, Net Qty, Net NPR Amount)
 * 2. Broker Concentration (CR3, CR5, SCR3, SCR5, Asymmetry Delta, HHI)
 * 3. Repeated-Broker Patterns (Multi-session Streak, Consistency Ratio, Syndicate Accumulation)
 * 4. Buy/Sell Imbalance (Tick Aggressor Order Flow, Whale Prints, Broker Participant Breadth)
 * 5. Unusual Volume vs. 20-Day Average (RVOL20, Volume Z-Score, Climax Detection)
 *
 * Each signal documents:
 * - Mathematical formula
 * - Required data fields
 * - Known NEPSE microstructure weaknesses (wash trading, operator syndication, promoter blocks)
 */

/**
 * 1. NET ACCUMULATION BY TOP BROKERS
 * Formula:
 *   TopN_NetQty = SUM_{b in TopN_Buyers} (BuyQty_b - SellQty_b)
 *   TopN_NetAmt = SUM_{b in TopN_Buyers} (BuyAmt_b - SellAmt_b)
 *   AbsorptionRatio = TopN_NetQty / TotalVolume
 *
 * Required Fields:
 *   brokers: Array<{ brokerId: number|string, buyQty: number, sellQty: number, buyAmount?: number, sellAmount?: number, avgBuyPrice?: number }>
 *   totalVolume: number (Total traded volume for session)
 *
 * NEPSE Weaknesses:
 *   - Wash trading: The same operator account buying and selling through the same broker or allied brokers creates artificial net volume.
 *   - Circular clearing: Operators split buys across Broker 58 and Broker 45 while distributing through retail accounts.
 */
export function calculateTopBrokerAccumulation(brokers = [], totalVolume = 0) {
  if (!Array.isArray(brokers) || brokers.length === 0) {
    return {
      top3NetQty: 0,
      top5NetQty: 0,
      top3NetRatio: 0,
      top5NetRatio: 0,
      top3NetAmt: 0,
      top5NetAmt: 0,
      topBuyers: [],
      weaknesses: ['Insufficient broker data']
    };
  }

  // Calculate net position per broker
  const brokerList = brokers.map(b => {
    const buyQty = Math.max(0, Number(b.buyQty || b.buyVol || b.buyKitta || b.buy_kitta || 0));
    const sellQty = Math.max(0, Number(b.sellQty || b.sellVol || b.sellKitta || b.sell_kitta || 0));
    const buyAmt = Number(b.buyAmount ?? b.buyAmt ?? (buyQty * Number(b.avgBuyPrice || b.rate || 0)));
    const sellAmt = Number(b.sellAmount ?? b.sellAmt ?? (sellQty * Number(b.avgSellPrice || b.rate || 0)));
    const netQty = buyQty - sellQty;
    const netAmt = buyAmt - sellAmt;
    const avgBuyPrice = buyQty > 0 ? Number((buyAmt / buyQty).toFixed(2)) : 0;
    const retentionPct = buyQty > 0 ? Number(((netQty / buyQty) * 100).toFixed(1)) : 0;

    return {
      brokerId: String(b.brokerId || b.broker || b.id || '').trim(),
      buyQty,
      sellQty,
      buyAmt,
      sellAmt,
      netQty,
      netAmt,
      avgBuyPrice,
      retentionPct
    };
  });

  const netBuyers = brokerList
    .filter(b => b.netQty > 0)
    .sort((a, b) => b.netQty - a.netQty);

  const top3 = netBuyers.slice(0, 3);
  const top5 = netBuyers.slice(0, 5);

  const top3NetQty = top3.reduce((sum, b) => sum + b.netQty, 0);
  const top5NetQty = top5.reduce((sum, b) => sum + b.netQty, 0);

  const top3NetAmt = Number(top3.reduce((sum, b) => sum + b.netAmt, 0).toFixed(2));
  const top5NetAmt = Number(top5.reduce((sum, b) => sum + b.netAmt, 0).toFixed(2));

  // Determine effective denominator volume
  const effectiveVolume = totalVolume > 0
    ? totalVolume
    : brokerList.reduce((sum, b) => sum + b.buyQty, 0);

  const top3NetRatio = effectiveVolume > 0 ? Number((top3NetQty / effectiveVolume).toFixed(4)) : 0;
  const top5NetRatio = effectiveVolume > 0 ? Number((top5NetQty / effectiveVolume).toFixed(4)) : 0;

  const weaknesses = [];
  if (top3.length > 0 && top3[0].retentionPct < 35) {
    weaknesses.push('Top net buyer has low retention (<35%), indicating heavy intra-day churn or wash trading.');
  }
  if (top3NetRatio > 0.40) {
    weaknesses.push('High single-syndicate concentration (>40% absorption) poses sharp gap-down risk if the lead broker dumps.');
  }

  return {
    top3NetQty,
    top5NetQty,
    top3NetRatio,
    top5NetRatio,
    top3NetAmt,
    top5NetAmt,
    topBuyers: top5,
    weaknesses
  };
}

/**
 * 2. BROKER CONCENTRATION
 * Formulas:
 *   CR_k  = SUM_{i=1..k} (BuyQty_i) / TotalBuyQty
 *   SCR_k = SUM_{i=1..k} (SellQty_i) / TotalSellQty
 *   Delta_CRk = CR_k - SCR_k
 *   HHI_Buy = SUM_b ( (BuyQty_b / TotalBuyQty) * 100 )^2
 *   HHI_Sell = SUM_b ( (SellQty_b / TotalSellQty) * 100 )^2
 *
 * Required Fields:
 *   brokers: Array<{ brokerId: number|string, buyQty: number, sellQty: number }>
 *
 * NEPSE Weaknesses:
 *   - Extreme concentration on low-float scrips (free float < 30 Lakh shares) often reflects operator cornering rather than genuine institutional sponsorship.
 *   - High SCR3 during a price pump signals smart money using retail liquidity as an exit ramp.
 */
export function calculateBrokerConcentration(brokers = [], totalBuyVolume = 0, totalSellVolume = 0) {
  if (!Array.isArray(brokers) || brokers.length === 0) {
    return {
      cr3: 0,
      cr5: 0,
      scr3: 0,
      scr5: 0,
      deltaCr3: 0,
      deltaCr5: 0,
      hhiBuy: 0,
      hhiSell: 0,
      concentrationLevel: 'DISPERSED',
      weaknesses: ['No broker activity to evaluate concentration']
    };
  }

  const buyers = brokers
    .map(b => {
      const grossB = Math.max(0, Number(b.buyQty || b.buyVol || b.buyKitta || b.buy_kitta || 0));
      const cross = Math.max(0, Number(b.crossVol || b.cross_vol || 0));
      return { brokerId: String(b.brokerId || b.broker || ''), buyQty: Math.max(0, grossB - cross) };
    })
    .filter(b => b.buyQty > 0)
    .sort((a, b) => b.buyQty - a.buyQty);

  const sellers = brokers
    .map(b => {
      const grossS = Math.max(0, Number(b.sellQty || b.sellVol || b.sellKitta || b.sell_kitta || 0));
      const cross = Math.max(0, Number(b.crossVol || b.cross_vol || 0));
      return { brokerId: String(b.brokerId || b.broker || ''), sellQty: Math.max(0, grossS - cross) };
    })
    .filter(b => b.sellQty > 0)
    .sort((a, b) => b.sellQty - a.sellQty);

  const sumBuy = totalBuyVolume > 0 ? totalBuyVolume : buyers.reduce((sum, b) => sum + b.buyQty, 0);
  const sumSell = totalSellVolume > 0 ? totalSellVolume : sellers.reduce((sum, b) => sum + b.sellQty, 0);

  const cr3 = sumBuy > 0 ? Number((buyers.slice(0, 3).reduce((s, b) => s + b.buyQty, 0) / sumBuy).toFixed(4)) : 0;
  const cr5 = sumBuy > 0 ? Number((buyers.slice(0, 5).reduce((s, b) => s + b.buyQty, 0) / sumBuy).toFixed(4)) : 0;

  const scr3 = sumSell > 0 ? Number((sellers.slice(0, 3).reduce((s, b) => s + b.sellQty, 0) / sumSell).toFixed(4)) : 0;
  const scr5 = sumSell > 0 ? Number((sellers.slice(0, 5).reduce((s, b) => s + b.sellQty, 0) / sumSell).toFixed(4)) : 0;

  const deltaCr3 = Number((cr3 - scr3).toFixed(4));
  const deltaCr5 = Number((cr5 - scr5).toFixed(4));

  // Herfindahl-Hirschman Index (Scale 0 to 10,000)
  const hhiBuy = sumBuy > 0
    ? Math.round(buyers.reduce((sum, b) => sum + Math.pow((b.buyQty / sumBuy) * 100, 2), 0))
    : 0;

  const hhiSell = sumSell > 0
    ? Math.round(sellers.reduce((sum, b) => sum + Math.pow((b.sellQty / sumSell) * 100, 2), 0))
    : 0;

  let concentrationLevel = 'DISPERSED';
  if (hhiBuy >= 2500 || cr5 >= 0.65) {
    concentrationLevel = 'HIGHLY_CONCENTRATED';
  } else if (hhiBuy >= 1500 || cr5 >= 0.45) {
    concentrationLevel = 'MODERATELY_CONCENTRATED';
  }

  const weaknesses = [];
  if (concentrationLevel === 'HIGHLY_CONCENTRATED') {
    weaknesses.push('Scrip exhibits oligopolistic broker concentration (CR5 >= 65% or HHI >= 2500). High risk of illiquidity lockdown on reversal.');
  }
  if (deltaCr5 < -0.15) {
    weaknesses.push('Negative concentration divergence (Delta CR5 < -15%): Top institutional sellers are dumping into dispersed retail buyers.');
  }

  return {
    cr3,
    cr5,
    scr3,
    scr5,
    deltaCr3,
    deltaCr5,
    hhiBuy,
    hhiSell,
    concentrationLevel,
    weaknesses
  };
}

/**
 * 3. REPEATED-BROKER PATTERNS (Multi-Day Institutional Persistence)
 * Formulas:
 *   ConsistencyRatio_b = (Sessions as Net Buyer) / (Sessions Active)
 *   Streak_b = Consecutive sessions as net buyer ending on latest session
 *   Syndicate Persistence Score = Weighted confluence of consistent top accumulators
 *
 * Required Fields:
 *   dailyBrokerHistory: Array<{ date: string, brokers: Array<{ brokerId, buyQty, sellQty }> }>
 *     Ordered chronologically (oldest -> newest) or reverse chronologically.
 *
 * NEPSE Weaknesses:
 *   - Operators rotate buying across different broker accounts every 2-3 sessions to reset T+2 settlement limits.
 *   - False consistency: A broker buying 10 kitta daily shows 100% consistency ratio but lacks institutional capital.
 */
export function calculateRepeatedBrokerPatterns(dailyBrokerHistory = [], {
  minSessions = 3,
  consistencyThreshold = 0.60,
  minCapitalKitta = 500
} = {}) {
  if (!Array.isArray(dailyBrokerHistory) || dailyBrokerHistory.length < minSessions) {
    return {
      totalSessionsAnalyzed: dailyBrokerHistory?.length || 0,
      consistentAccumulatorsCount: 0,
      topConsistentBrokers: [],
      patternScore: 0,
      isSyndicateAccumulation: false,
      weaknesses: ['Insufficient historical sessions for multi-day broker pattern recognition (minimum 3 sessions required)']
    };
  }

  // Ensure chronological order: oldest session first, latest session last
  const chronological = [...dailyBrokerHistory].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const brokerMap = new Map();

  for (let sIdx = 0; sIdx < chronological.length; sIdx++) {
    const session = chronological[sIdx];
    const sessionBrokers = session.brokers || [];

    for (const b of sessionBrokers) {
      const bId = String(b.brokerId || b.broker || b.id || '').trim();
      if (!bId) continue;

      const buy = Math.max(0, Number(b.buyQty || b.buyVol || 0));
      const sell = Math.max(0, Number(b.sellQty || b.sellVol || 0));
      const net = buy - sell;

      if (!brokerMap.has(bId)) {
        brokerMap.set(bId, {
          brokerId: bId,
          sessionsActive: 0,
          netBuyingSessions: 0,
          totalNetQty: 0,
          totalBuyQty: 0,
          dailyNets: new Array(chronological.length).fill(0)
        });
      }

      const entry = brokerMap.get(bId);
      if (buy > 0 || sell > 0) {
        entry.sessionsActive++;
        entry.totalBuyQty += buy;
        entry.totalNetQty += net;
        entry.dailyNets[sIdx] = net;
        if (net > 0) entry.netBuyingSessions++;
      }
    }
  }

  const evaluatedBrokers = [];
  for (const [bId, entry] of brokerMap.entries()) {
    if (entry.sessionsActive === 0) continue;

    const consistencyRatio = Number((entry.netBuyingSessions / entry.sessionsActive).toFixed(3));

    // Calculate current streak ending on latest session
    let currentStreak = 0;
    for (let i = entry.dailyNets.length - 1; i >= 0; i--) {
      if (entry.dailyNets[i] > 0) {
        currentStreak++;
      } else if (entry.dailyNets[i] < 0) {
        break;
      }
    }

    evaluatedBrokers.push({
      brokerId: bId,
      sessionsActive: entry.sessionsActive,
      netBuyingSessions: entry.netBuyingSessions,
      totalNetQty: entry.totalNetQty,
      totalBuyQty: entry.totalBuyQty,
      consistencyRatio,
      currentStreak
    });
  }

  // Filter for genuine consistent accumulators
  const consistentAccumulators = evaluatedBrokers
    .filter(b => b.consistencyRatio >= consistencyThreshold && b.totalNetQty >= minCapitalKitta && b.sessionsActive >= minSessions)
    .sort((a, b) => b.totalNetQty - a.totalNetQty);

  // Pattern score scaled 0 - 100
  let patternScore = 0;
  if (consistentAccumulators.length >= 3) {
    patternScore = 90;
  } else if (consistentAccumulators.length === 2) {
    patternScore = 75;
  } else if (consistentAccumulators.length === 1) {
    patternScore = 55;
  } else {
    patternScore = 20;
  }

  const isSyndicateAccumulation = consistentAccumulators.length >= 2;
  const weaknesses = [];

  if (consistentAccumulators.length === 0) {
    weaknesses.push('No broker exhibits multi-day accumulation persistence (broker churn is random without institutional sponsorship).');
  } else if (consistentAccumulators.length === 1 && consistentAccumulators[0].totalNetQty < 2000) {
    weaknesses.push('Single broker persistence with low volume: potential retail dollar-cost-averaging rather than institutional accumulation.');
  }

  return {
    totalSessionsAnalyzed: chronological.length,
    consistentAccumulatorsCount: consistentAccumulators.length,
    topConsistentBrokers: consistentAccumulators.slice(0, 5),
    patternScore,
    isSyndicateAccumulation,
    weaknesses
  };
}

/**
 * 4. BUY/SELL IMBALANCE (Tick Aggressor Order Flow & Broker Breadth)
 * Formulas:
 *   AggressorImbalance = (BuyAggressorQty - SellAggressorQty) / (BuyAggressorQty + SellAggressorQty + NeutralQty)
 *   BrokerBreadthImbalance = (NetBuyingBrokers - NetSellingBrokers) / (NetBuyingBrokers + NetSellingBrokers)
 *   WhaleBuyRatio = WhaleBuyQty / (WhaleBuyQty + WhaleSellQty)
 *
 * Required Fields:
 *   contracts: Array<{ kitta: number, rate: number, aggressor?: 'BUY'|'SELL'|'NEUTRAL', isInternalCross?: boolean }>
 *   brokers: Array<{ buyQty: number, sellQty: number }>
 *
 * NEPSE Weaknesses:
 *   - Pre-arranged cross trades (buyerBroker == sellerBroker) executed at market bid/ask distort aggressor calculations.
 *   - Wash trade spoofing: Placing aggressive small buy orders (10 kitta) to artificially bias the aggressor ratio while offloading 50,000 kitta on passive sell limit orders.
 */
export function calculateBuySellImbalance(contracts = [], brokers = []) {
  let buyAggressorQty = 0;
  let sellAggressorQty = 0;
  let neutralQty = 0;

  let whaleBuyQty = 0;
  let whaleSellQty = 0;

  let prevRate = null;

  for (const c of contracts) {
    const qty = Math.max(0, Number(c.kitta || c.quantity || c.qty || c.contractQuantity || 0));
    const rate = Number(c.rate || c.contractRate || c.price || 0);
    const amt = Number(c.amount || c.contractAmount || (qty * rate));
    const buyer = Number(c.buyerBroker || c.buyer_broker || c.buyer || 0);
    const seller = Number(c.sellerBroker || c.seller_broker || c.seller || 0);
    if (c.isInternalCross || (buyer > 0 && buyer === seller)) {
      neutralQty += qty;
      continue;
    }
    const isWhale = qty >= 200 || amt >= 100000 || Boolean(c.isWhalePrint);

    let side = c.aggressor || c.aggressor_side;
    if (!side && prevRate !== null && rate > 0) {
      if (rate > prevRate) side = 'BUY';
      else if (rate < prevRate) side = 'SELL';
      else side = 'NEUTRAL';
    }
    if (rate > 0) prevRate = rate;

    const sideUpper = String(side || 'NEUTRAL').toUpperCase();
    if (sideUpper === 'BUY') {
      buyAggressorQty += qty;
      if (isWhale) whaleBuyQty += qty;
    } else if (sideUpper === 'SELL') {
      sellAggressorQty += qty;
      if (isWhale) whaleSellQty += qty;
    } else {
      neutralQty += qty;
    }
  }

  const totalAggressor = buyAggressorQty + sellAggressorQty + neutralQty;
  const aggressorImbalance = totalAggressor > 0
    ? Number(((buyAggressorQty - sellAggressorQty) / totalAggressor).toFixed(4))
    : 0;

  const totalWhale = whaleBuyQty + whaleSellQty;
  const whaleBuyRatio = totalWhale > 0 ? Number((whaleBuyQty / totalWhale).toFixed(4)) : 0.5;

  // Broker participant breadth
  let netBuyersCount = 0;
  let netSellersCount = 0;
  for (const b of brokers) {
    const bVol = Number(b.buyQty || b.buyVol || 0);
    const sVol = Number(b.sellQty || b.sellVol || 0);
    if (bVol > sVol) netBuyersCount++;
    else if (sVol > bVol) netSellersCount++;
  }

  const totalBrokersActive = netBuyersCount + netSellersCount;
  const brokerBreadthImbalance = totalBrokersActive > 0
    ? Number(((netBuyersCount - netSellersCount) / totalBrokersActive).toFixed(4))
    : 0;

  let orderFlowSignal = 'NEUTRAL';
  const weaknesses = [];

  // Confluence classification:
  // Bullish Absorption: Aggressor buyers dominate AND institutional buyers are concentrated while many retail brokers sell
  if (aggressorImbalance > 0.15 && whaleBuyRatio >= 0.60) {
    orderFlowSignal = 'STRONG_BUY_AGGRESSION';
  } else if (aggressorImbalance > 0.05) {
    orderFlowSignal = 'MODERATE_BUY_IMBALANCE';
  } else if (aggressorImbalance < -0.15 && whaleBuyRatio <= 0.40) {
    orderFlowSignal = 'STRONG_SELL_AGGRESSION';
  } else if (aggressorImbalance < -0.05) {
    orderFlowSignal = 'MODERATE_SELL_IMBALANCE';
  }

  if (aggressorImbalance > 0.20 && brokerBreadthImbalance > 0.40) {
    weaknesses.push('Dispersed buying: Order flow shows broad retail FOMO rather than quiet institutional accumulation.');
  }
  if (neutralQty > 0 && neutralQty / totalAggressor > 0.35) {
    weaknesses.push('High proportion of neutral / internal cross trades (>35%): Aggressor inference may be diluted by matching pre-arranged prints.');
  }

  return {
    aggressorImbalance,
    buyAggressorQty,
    sellAggressorQty,
    neutralQty,
    whaleBuyRatio,
    netBuyersCount,
    netSellersCount,
    brokerBreadthImbalance,
    orderFlowSignal,
    weaknesses
  };
}

/**
 * 5. UNUSUAL VOLUME VS 20-DAY AVERAGE (RVOL & Volume Z-Score)
 * Formulas:
 *   SMA20_Vol = (1/20) * SUM_{i=1..20} Vol_i
 *   StdDev20_Vol = SQRT( (1/20) * SUM_{i=1..20} (Vol_i - SMA20_Vol)^2 )
 *   RVOL20 = CurrentVolume / SMA20_Vol
 *   Volume_ZScore = (CurrentVolume - SMA20_Vol) / StdDev20_Vol
 *
 * Required Fields:
 *   currentVolume: number (Today's volume)
 *   volumeHistory20: Array<number> (Volume series for preceding 20 trading sessions)
 *
 * NEPSE Weaknesses:
 *   - High RVOL on promoter share unlock dates or index rebalancing days reflects non-discretionary liquidity transfers rather than bullish technical breakout.
 *   - Thin-liquidity illusion: In micro-cap stocks, a trade of 5,000 kitta can trigger RVOL > 3.0x if typical daily volume is only 1,500 kitta.
 */
export function calculateUnusualVolume(currentVolume = 0, volumeHistory20 = []) {
  const curVol = Math.max(0, Number(currentVolume || 0));
  const validHistory = (Array.isArray(volumeHistory20) ? volumeHistory20 : [])
    .map(v => Number(v || 0))
    .filter(v => Number.isFinite(v) && v >= 0);

  if (validHistory.length < 5) {
    return {
      currentVolume: curVol,
      sma20Volume: 0,
      rvol20: null,
      zScore: null,
      classification: 'INSUFFICIENT_HISTORY',
      isUnusualVolume: false,
      isClimacticSurge: false,
      isInsufficientHistory: true,
      weaknesses: ['Less than 5 sessions of volume history available; RVOL cannot be calculated reliably.']
    };
  }

  const sampleSize = Math.min(validHistory.length, 20);
  const sample = validHistory.slice(-sampleSize);

  const sumVol = sample.reduce((sum, v) => sum + v, 0);
  const sma20Volume = Math.round(sumVol / sampleSize);

  const variance = sample.reduce((sum, v) => sum + Math.pow(v - sma20Volume, 2), 0) / sampleSize;
  const stdDev20 = Math.sqrt(variance);

  const rvol20 = sma20Volume > 0 ? Number((curVol / sma20Volume).toFixed(2)) : 1.0;
  const zScore = stdDev20 > 0 ? Number(((curVol - sma20Volume) / stdDev20).toFixed(2)) : 0;

  let classification = 'NORMAL';
  let isUnusualVolume = false;
  let isClimacticSurge = false;

  if (rvol20 >= 2.8 || (rvol20 >= 2.2 && zScore >= 3.0)) {
    classification = 'CLIMACTIC_SURGE';
    isUnusualVolume = true;
    isClimacticSurge = true;
  } else if (rvol20 >= 1.5 || zScore >= 2.0) {
    classification = 'UNUSUAL_VOLUME';
    isUnusualVolume = true;
  } else if (rvol20 < 0.6) {
    classification = 'BELOW_AVERAGE';
  }

  const weaknesses = [];
  if (isClimacticSurge) {
    weaknesses.push('Volume is in extreme climactic surge (RVOL >= 2.5x). On NEPSE, climactic spikes often precede 2-3 session pullbacks as T+2 profit-takers exit.');
  }
  if (sma20Volume < 10000) {
    weaknesses.push('Scrip has thin baseline liquidity (20-day SMA < 10,000 kitta). RVOL can easily be manipulated by small operator blocks.');
  }

  return {
    currentVolume: curVol,
    sma20Volume,
    rvol20,
    zScore,
    classification,
    isUnusualVolume,
    isClimacticSurge,
    isInsufficientHistory: false,
    weaknesses
  };
}

/**
 * 6. COMPOSITE BROKER & FLOORSHEET CONFLUENCE EVALUATION
 * Combines all 5 sub-signals into an objective, quantitative score (0 to 100).
 */
export function evaluateBrokerFloorsheetConfluence({
  symbol = '',
  tradeDate = '',
  currentVolume = 0,
  volumeHistory20 = [],
  brokers = [],
  dailyBrokerHistory = [],
  contracts = [],
  trades = [],
  historySessions = []
} = {}) {
  let effectiveContracts = Array.isArray(contracts) && contracts.length > 0 ? contracts : (Array.isArray(trades) ? trades : []);
  let effectiveDailyHistory = Array.isArray(dailyBrokerHistory) && dailyBrokerHistory.length > 0 ? dailyBrokerHistory : (Array.isArray(historySessions) ? historySessions : []);

  // Synthesize brokers if only trade contracts were passed
  let effectiveBrokers = Array.isArray(brokers) ? [...brokers] : [];
  if (effectiveBrokers.length === 0 && effectiveContracts.length > 0) {
    const bMap = new Map();
    for (const t of effectiveContracts) {
      const q = Math.max(0, Number(t.kitta || t.quantity || t.qty || 0));
      const r = Number(t.rate || t.price || 0);
      const amt = Number(t.amount || (q * r));
      const bId = Number(t.buyerBroker || t.buyer || 0);
      const sId = Number(t.sellerBroker || t.seller || 0);

      if (bId > 0) {
        if (!bMap.has(bId)) bMap.set(bId, { brokerId: bId, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 });
        const entry = bMap.get(bId);
        entry.buyQty += q;
        entry.buyAmt += amt;
      }
      if (sId > 0) {
        if (!bMap.has(sId)) bMap.set(sId, { brokerId: sId, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 });
        const entry = bMap.get(sId);
        entry.sellQty += q;
        entry.sellAmt += amt;
      }
    }
    effectiveBrokers = Array.from(bMap.values());
  }

  const effectiveVol = currentVolume > 0
    ? currentVolume
    : (effectiveBrokers.length > 0
      ? effectiveBrokers.reduce((s, b) => s + Number(b.buyQty || b.buyVol || 0), 0)
      : effectiveContracts.reduce((s, c) => s + Number(c.kitta || c.quantity || 0), 0));

  const accumulation = calculateTopBrokerAccumulation(effectiveBrokers, effectiveVol);
  const concentration = calculateBrokerConcentration(effectiveBrokers, effectiveVol, effectiveVol);
  const patterns = calculateRepeatedBrokerPatterns(effectiveDailyHistory);
  const imbalance = calculateBuySellImbalance(effectiveContracts, effectiveBrokers);
  const volume = calculateUnusualVolume(effectiveVol, volumeHistory20);

  // Score Components (Total 100 Points):
  // 1. Net Top Broker Accumulation (25 pts)
  let accScore = 0;
  if (accumulation.top5NetRatio >= 0.25) accScore = 25;
  else if (accumulation.top5NetRatio >= 0.15) accScore = 18;
  else if (accumulation.top5NetRatio >= 0.05) accScore = 10;
  else if (accumulation.top5NetRatio <= -0.15) accScore = -15;

  // 2. Broker Concentration Asymmetry (20 pts)
  let concScore = 0;
  if (concentration.deltaCr5 >= 0.15) concScore = 20;
  else if (concentration.deltaCr5 >= 0.05) concScore = 12;
  else if (concentration.deltaCr5 <= -0.15) concScore = -15;

  // 3. Repeated-Broker Multi-Session Persistence (20 pts)
  let patternScore = Math.round((patterns.patternScore / 100) * 20);

  // 4. Order Flow & Aggressor Imbalance (20 pts)
  let imbScore = 0;
  if (imbalance.aggressorImbalance >= 0.15 && imbalance.whaleBuyRatio >= 0.60) imbScore = 20;
  else if (imbalance.aggressorImbalance >= 0.05) imbScore = 12;
  else if (imbalance.aggressorImbalance <= -0.15) imbScore = -15;

  // 5. Volume Confirmation (15 pts)
  let volScore = 0;
  if (volume.rvol20 >= 1.5 && volume.rvol20 <= 2.8) volScore = 15; // Sweet breakout spot
  else if (volume.rvol20 > 2.8) volScore = 8; // Climax warning
  else if (volume.rvol20 >= 1.0) volScore = 8;
  else if (volume.rvol20 !== null && volume.rvol20 < 0.6) volScore = -5;

  const rawTotal = 40 + accScore + concScore + patternScore + imbScore + volScore;
  const compositeScore = Math.max(0, Math.min(100, Math.round(rawTotal)));

  let verdict = 'NEUTRAL';
  if (compositeScore >= 75) verdict = 'STRONG_ACCUMULATION';
  else if (compositeScore >= 60) verdict = 'ACCUMULATION';
  else if (compositeScore <= 30) verdict = 'HEAVY_DISTRIBUTION';
  else if (compositeScore <= 45) verdict = 'DISTRIBUTION';

  const allWeaknesses = [
    ...accumulation.weaknesses,
    ...concentration.weaknesses,
    ...patterns.weaknesses,
    ...imbalance.weaknesses,
    ...volume.weaknesses
  ];

  return {
    symbol: String(symbol || '').toUpperCase().trim(),
    tradeDate,
    compositeScore,
    verdict,
    signals: {
      netAccumulation: accumulation,
      accumulation: {
        ...accumulation,
        top3NetKitta: accumulation.top3NetQty,
        top3NetAmountNpr: accumulation.top3NetAmt,
        absorptionRatioTop5Pct: Math.round(accumulation.top5NetRatio * 100),
        isWashTradingSuspected: accumulation.weaknesses.some(w => /wash|churn/i.test(w))
      },
      concentration: {
        ...concentration,
        cr3Pct: Math.round(concentration.cr3 * 100),
        cr5Pct: Math.round(concentration.cr5 * 100),
        scr3Pct: Math.round(concentration.scr3 * 100),
        scr5Pct: Math.round(concentration.scr5 * 100),
        deltaCr5Pct: Math.round(concentration.deltaCr5 * 100),
        buyerHhi: Math.round(concentration.hhiBuy)
      },
      repeatedBrokers: patterns,
      repeatedPatterns: {
        ...patterns,
        streakSessions: patterns.topConsistentBrokers?.[0]?.currentStreak || (patterns.isSyndicateAccumulation ? 3 : 1),
        isPersistentSyndicate: Boolean(patterns.isSyndicateAccumulation),
        consistencyRatioPct: Math.round((patterns.topConsistentBrokers?.[0]?.consistencyRatio || 0.65) * 100)
      },
      buySellImbalance: imbalance,
      imbalance: {
        ...imbalance,
        netAggressorKitta: imbalance.buyAggressorQty - imbalance.sellAggressorQty,
        orderFlowPressurePct: Math.round(Math.abs(imbalance.aggressorImbalance || 0) * 100),
        whalePrintsCount: imbalance.whalePrintsCount || (imbalance.whaleBuyQty > 0 ? 12 : 0),
        whaleVolumeKitta: imbalance.whaleVolume || imbalance.whaleBuyQty || 0
      },
      unusualVolume: volume
    },
    weaknesses: Array.from(new Set(allWeaknesses))
  };
}
