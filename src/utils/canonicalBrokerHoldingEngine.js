/**
 * src/utils/canonicalBrokerHoldingEngine.js
 * 
 * CANONICAL CUMULATIVE BROKER HOLDING & RECONCILIATION ENGINE
 * Single Source of Truth for Cumulative Broker Holdings across:
 * - Stocks Tab -> Overview Sub-tab (Broker Footprint Ledger)
 * - Stocks Tab -> Broker Flow Sub-tab (Till Today Accumulator Pool)
 * - Smart Money Telemetry & Broker Vault APIs
 * 
 * Guarantees:
 * 1. Both tabs calculate and display the EXACT SAME cumulative figures.
 * 2. Explicit coverage disclosure: Never presented as 'lifetime holding'.
 *    Labeled everywhere as "Since YYYY-MM-DD (N sessions)".
 * 3. Pre-start date baseline disclaimer: Pre-start holding is explicitly stated as unknown.
 * 4. Strictly Asia/Kathmandu (UTC+5:45) calendar day grouping.
 * 5. Internal cross-trade rule: Same-broker matching (buyer === seller) nets strictly to 0.
 * 6. Idempotent daily ingestion: Duplicate trades/contracts are filtered.
 * 7. Ongoing market session guard: Today's active session is flagged 'Live session (incomplete)'.
 * 8. Corporate action transparency: Clear unadjusted labeling or mathematical bonus adjustment.
 * 9. Daily-to-cumulative reconciliation: Validates sum(daily) === cumulative total.
 */

import { formatNptDateIso, isNepseTradingDay, getIsoDateInNPT } from './nepseCalendar.js';
import { getBrokerName } from './sharedBrokerAggregationEngine.js';

/**
 * Resolves an ISO or timestamp string to Asia/Kathmandu (UTC+5:45) calendar date (YYYY-MM-DD).
 */
export function toNptDateString(dateVal) {
  if (!dateVal) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
  }
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
    return dateVal.trim();
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
}

/**
 * Computes canonical cumulative broker holdings from a raw list of trades or daily ledger rows.
 * @param {Array<Object>} tradesOrRows - Raw trade contracts or daily broker rows
 * @param {Object} options - Configuration options
 * @returns {Object} Canonical holding metrics and coverage metadata
 */
export function computeCanonicalBrokerHoldings(tradesOrRows = [], options = {}) {
  const sym = String(options.symbol || '').toUpperCase().trim();
  const checkGaps = Boolean(options.checkCalendarGaps);
  const parseNpt = Boolean(options.parseIsoDatesToNpt);
  const deduplicate = Boolean(options.deduplicateByContract);

  if (!Array.isArray(tradesOrRows) || tradesOrRows.length === 0) {
    return {
      symbol: sym,
      totalHeldQty: 0,
      totalHoldQty: 0,
      totalAccumulatorsCount: 0,
      totalDistributorsCount: 0,
      topHoldingBroker: null,
      topAccumulator: null,
      allHoldings: [],
      topHoldings: [],
      allDistributors: [],
      brokers: [],
      allBrokers: [],
      coverage: {
        startDate: '',
        endDate: '',
        sessionCount: 0,
        tradingDays: 0,
        isLifetime: false,
        label: 'No historical sessions covered',
        disclaimer: 'No broker flow data available for this scrip.',
        isLiveIncomplete: false,
        hasGaps: false,
        missingDates: [],
        lastUpdated: new Date().toISOString()
      },
      reconciliation: {
        sumOfAccumulatorNet: 0,
        sumOfDistributorNet: 0,
        netDifference: 0,
        isBalanced: true
      }
    };
  }

  // 1. Idempotent Deduplication (by contract number or fingerprint)
  let effectiveRows = tradesOrRows;
  if (deduplicate) {
    const seen = new Set();
    effectiveRows = [];
    for (const r of tradesOrRows) {
      const key = r.contract_no || r.contractNo || `${r.trade_date}_${r.buyer_broker || r.buyerBroker}_${r.seller_broker || r.sellerBroker}_${r.kitta || r.qty}_${r.rate}_${r.amount}`;
      if (!seen.has(key)) {
        seen.add(key);
        effectiveRows.push(r);
      }
    }
  }

  // 2. Broker Accumulation Aggregation
  const brokerMap = {};
  const datesSet = new Set();
  let totalGrossVolume = 0;
  let totalGrossTurnover = 0;

  for (const r of effectiveRows) {
    // Resolve date
    let dateStr = r.trade_date || r.tradeDate || r.businessDate || r.date;
    if (parseNpt && (r.trade_time || r.tradeTime || r.time || dateStr)) {
      dateStr = toNptDateString(r.trade_time || r.tradeTime || dateStr);
    } else if (dateStr) {
      dateStr = toNptDateString(dateStr);
    }
    if (dateStr) datesSet.add(dateStr);

    // Format A: Trade contract format (buyer_broker, seller_broker, kitta, rate, amount)
    if (r.buyer_broker !== undefined || r.buyerBroker !== undefined || r.buyer !== undefined) {
      const bId = String(r.buyer_broker || r.buyerBroker || r.buyer || '').trim();
      const sId = String(r.seller_broker || r.sellerBroker || r.seller || '').trim();
      const kitta = Number(r.kitta || r.qty || r.quantity || 0);
      const rate = Number(r.rate || r.price || 0);
      const amt = Number(r.amount || kitta * rate || 0);

      totalGrossVolume += kitta;
      totalGrossTurnover += amt;

      // Initialize buyer
      if (bId) {
        if (!brokerMap[bId]) {
          brokerMap[bId] = { id: bId, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, crossQty: 0, trades: 0 };
        }
        brokerMap[bId].buyQty += kitta;
        brokerMap[bId].buyAmt += amt;
        brokerMap[bId].trades += 1;
      }

      // Initialize seller
      if (sId) {
        if (!brokerMap[sId]) {
          brokerMap[sId] = { id: sId, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, crossQty: 0, trades: 0 };
        }
        brokerMap[sId].sellQty += kitta;
        brokerMap[sId].sellAmt += amt;
      }

      // Internal cross trade tracking: If bId === sId, crossQty is tracked
      if (bId && sId && bId === sId) {
        brokerMap[bId].crossQty += kitta;
      }
    } 
    // Format B: Pre-aggregated daily broker ledger row (broker_id, buy_vol, sell_vol, buy_amt, sell_amt)
    else if (r.broker_id !== undefined || r.brokerId !== undefined || r.broker !== undefined) {
      const bId = String(r.broker_id || r.brokerId || r.broker || '').trim();
      if (!bId) continue;
      const bQty = Number(r.buy_vol || r.buyQty || r.buyKitta || 0);
      const sQty = Number(r.sell_vol || r.sellQty || r.sellKitta || 0);
      const bAmt = Number(r.buy_amt || r.buyAmount || 0);
      const sAmt = Number(r.sell_amt || r.sellAmount || 0);
      const cross = Number(r.cross_vol || r.crossQty || 0);

      if (!brokerMap[bId]) {
        brokerMap[bId] = { id: bId, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, crossQty: 0, trades: 0 };
      }
      brokerMap[bId].buyQty += bQty;
      brokerMap[bId].sellQty += sQty;
      brokerMap[bId].buyAmt += bAmt;
      brokerMap[bId].sellAmt += sAmt;
      brokerMap[bId].crossQty += cross;
    }
  }

  // 3. Compute Net Metrics per Broker
  const accumulators = [];
  const distributors = [];
  const allBrokersList = [];

  for (const bId in brokerMap) {
    const b = brokerMap[bId];
    // Cross trades cancel out in net calculation (buyQty - sellQty naturally accounts for cross trades)
    const netQty = b.buyQty - b.sellQty;
    const netAmt = b.buyAmt - b.sellAmt;
    const avgBuyRate = b.buyQty > 0 ? +(b.buyAmt / b.buyQty).toFixed(2) : 0;
    const avgSellRate = b.sellQty > 0 ? +(b.sellAmt / b.sellQty).toFixed(2) : 0;
    const retentionPct = b.buyQty > 0 ? Number(((Math.max(0, netQty) / b.buyQty) * 100).toFixed(1)) : 0;

    const brokerObj = {
      id: bId,
      broker: bId,
      brokerId: bId,
      name: getBrokerName(bId),
      brokerName: getBrokerName(bId),
      buyQty: b.buyQty,
      sellQty: b.sellQty,
      buyVolume: b.buyQty,
      sellVolume: b.sellQty,
      buyAmount: +b.buyAmt.toFixed(2),
      sellAmount: +b.sellAmt.toFixed(2),
      netQty,
      netVolume: netQty,
      signedHoldQty: netQty,
      holdQty: Math.max(0, netQty),
      totalHeldQty: Math.max(0, netQty),
      netAmt: +netAmt.toFixed(2),
      holdAmt: netQty > 0 ? +netAmt.toFixed(2) : 0,
      totalHeldAmt: netQty > 0 ? +netAmt.toFixed(2) : 0,
      avgBuyRate,
      avgSellRate,
      avgBuyPrice: avgBuyRate,
      avgSellPrice: avgSellRate,
      retentionPct,
      crossQty: b.crossQty,
      trades: b.trades
    };

    allBrokersList.push(brokerObj);
    if (netQty > 0) {
      accumulators.push(brokerObj);
    } else if (netQty < 0) {
      distributors.push(brokerObj);
    }
  }

  accumulators.sort((a, b) => b.netQty - a.netQty);
  distributors.sort((a, b) => a.netQty - b.netQty); // Most negative first

  const totalHeldQty = accumulators.reduce((sum, b) => sum + b.netQty, 0);
  const totalDistributedQty = Math.abs(distributors.reduce((sum, b) => sum + b.netQty, 0));

  // Compute share of total held percentage for accumulators
  const allHoldings = accumulators.map(b => ({
    ...b,
    shareOfHoldPct: totalHeldQty > 0 ? Number(((b.netQty / totalHeldQty) * 100).toFixed(1)) : 0,
    holdingSharePct: totalHeldQty > 0 ? Number(((b.netQty / totalHeldQty) * 100).toFixed(2)) : 0
  }));

  const topAcc = allHoldings[0] || null;

  // 4. Date Coverage & Calendar Gap Verification
  const sortedDates = Array.from(datesSet).sort((a, b) => a.localeCompare(b));
  const startDate = sortedDates[0] || '';
  const endDate = sortedDates[sortedDates.length - 1] || '';
  const sessionCount = sortedDates.length;

  // Calendar gap audit
  let hasGaps = false;
  const missingDates = [];
  if (checkGaps && startDate && endDate && sortedDates.length > 1) {
    let cur = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      if (isNepseTradingDay(cur) && !datesSet.has(iso)) {
        hasGaps = true;
        missingDates.push(iso);
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // 5. Incomplete Live Market Session Guard
  const now = new Date();
  const todayNpt = formatNptDateIso(now);
  const nowUtcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nptMinutes = (nowUtcMinutes + 345) % 1440;
  // NEPSE trading hours: 11:00 AM to 15:00 PM NPT (660 to 900 minutes)
  const isMarketHours = isNepseTradingDay(now) && nptMinutes >= 660 && nptMinutes <= 930;
  const isLiveIncomplete = isMarketHours && datesSet.has(todayNpt);

  // 6. Zero-Sum Reconciliation
  const netDifference = totalHeldQty - totalDistributedQty;
  const isBalanced = netDifference === 0;

  const coverage = {
    startDate,
    endDate,
    sessionCount,
    tradingDays: sessionCount,
    isLifetime: false, // Invariant: NEPSE broker ledger is NEVER lifetime holding
    label: startDate ? `Since ${startDate} (${sessionCount} sessions)` : 'No sessions covered',
    disclaimer: startDate 
      ? `Pre-${startDate} baseline holding unknown. Figures reflect net accumulation over the covered ${sessionCount}-session window.`
      : 'No data covered.',
    isLiveIncomplete,
    hasGaps,
    missingDates,
    lastUpdated: new Date().toISOString()
  };

  return {
    symbol: sym,
    totalHeldQty,
    totalHoldQty: totalHeldQty,
    totalSharesHeldTillNow: totalHeldQty,
    totalAccumulatorsCount: accumulators.length,
    totalDistributorsCount: distributors.length,
    topHoldingBroker: topAcc,
    topAccumulator: topAcc,
    allHoldings,
    topHoldings: allHoldings,
    allDistributors: distributors,
    topDistributors: distributors,
    brokers: allBrokersList,
    allBrokers: allBrokersList,
    coverage,
    reconciliation: {
      sumOfAccumulatorNet: totalHeldQty,
      sumOfDistributorNet: totalDistributedQty,
      netDifference,
      isBalanced
    }
  };
}

/**
 * Reconciles the reported cumulative holding against the sum of daily broker values.
 * Logs a warning if a discrepancy exists.
 */
export function reconcileDailyWithCumulative(reportedCumulative = 0, dailyBreakdown = []) {
  const dailySum = dailyBreakdown.reduce((sum, d) => sum + Number(d.netQty || d.signedHoldQty || 0), 0);
  const discrepancy = Math.abs(reportedCumulative - dailySum);
  const isConsistent = discrepancy === 0;

  if (!isConsistent) {
    console.warn(`[Reconciliation Warning] Cumulative holding (${reportedCumulative}) differs from daily sum (${dailySum}) by ${discrepancy} shares!`);
  }

  return {
    reportedCumulative,
    dailySum,
    discrepancy,
    isConsistent
  };
}

/**
 * Adjusts cumulative broker holdings for corporate actions (e.g. bonus shares, splits).
 * If no corporate action or unadjusted, returns transparent unadjusted labeling.
 */
export function adjustHoldingsForCorporateActions(canonicalHoldings, corporateAction = null) {
  if (!corporateAction || !corporateAction.type || corporateAction.type === 'NONE') {
    return {
      ...canonicalHoldings,
      isCorporateAdjusted: false,
      corporateAdjustmentNote: 'Holding is unadjusted trade volume. Corporate actions (bonus/right shares) are not factored into historical share count.',
      label: 'Net Accumulation (Unadjusted for bonus/right shares)'
    };
  }

  if (corporateAction.type === 'BONUS' && corporateAction.bonusPct > 0) {
    const factor = 1 + (corporateAction.bonusPct / 100);
    const adjustedHeld = Math.round(canonicalHoldings.totalHeldQty * factor);
    const adjustedHoldings = (canonicalHoldings.allHoldings || []).map(b => ({
      ...b,
      netQty: Math.round(b.netQty * factor),
      totalHeldQty: Math.round((b.totalHeldQty || b.netQty) * factor),
      avgBuyRate: b.avgBuyRate > 0 ? +(b.avgBuyRate / factor).toFixed(2) : 0
    }));

    return {
      ...canonicalHoldings,
      totalHeldQty: adjustedHeld,
      totalSharesHeldTillNow: adjustedHeld,
      allHoldings: adjustedHoldings,
      topHoldings: adjustedHoldings,
      isCorporateAdjusted: true,
      corporateAdjustmentNote: `Adjusted for ${corporateAction.bonusPct}% bonus share effective ${corporateAction.exDate || 'ex-date'}.`,
      label: `Net Accumulation (Adjusted for +${corporateAction.bonusPct}% bonus)`
    };
  }

  return {
    ...canonicalHoldings,
    isCorporateAdjusted: false,
    corporateAdjustmentNote: 'Unadjusted for corporate action.',
    label: 'Net Accumulation (Unadjusted)'
  };
}
