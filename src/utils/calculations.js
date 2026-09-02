/**
 * Calculations for Nepal Stock Exchange (NEPSE) and SEBON rules
 */

/**
 * Calculates tiered broker commission for equity trading in Nepal.
 * Effective Jestha 1, 2081 BS (May 14, 2024):
 * - Up to Rs. 50,000: 0.36%
 * - Rs. 50,001 to Rs. 500,000: 0.33%
 * - Rs. 500,001 to Rs. 2,000,000: 0.31%
 * - Rs. 2,000,001 to Rs. 10,000,000: 0.27%
 * - Above Rs. 10,000,000: 0.24%
 * Note: Minimum broker commission is Rs. 10.
 */
export function calculateBrokerCommission(amount) {
  if (amount <= 0) return 0;
  let commission = 0;
  if (amount <= 50000) {
    commission = amount * 0.0036;
  } else if (amount <= 500000) {
    commission = amount * 0.0033;
  } else if (amount <= 2000000) {
    commission = amount * 0.0031;
  } else if (amount <= 10000000) {
    commission = amount * 0.0027;
  } else {
    commission = amount * 0.0024;
  }
  return Math.max(10, commission);
}

/**
 * Calculates SEBON Regulatory Fee (0.015% of transaction amount)
 */
export function calculateSebonFee(amount) {
  return amount * 0.00015;
}

/**
 * DP Charge (Depository Participant fee) is Rs. 25 per transaction per company
 */
export const DP_CHARGE = 25;

/**
 * Calculates the complete buy transaction details.
 */
export function calculateBuyDetails(quantity, price) {
  const shareValue = quantity * price;
  const commission = calculateBrokerCommission(shareValue);
  const sebonFee = calculateSebonFee(shareValue);
  const dpFee = DP_CHARGE;
  const totalAmount = shareValue + commission + sebonFee + dpFee;

  return {
    shareValue,
    commission,
    sebonFee,
    dpFee,
    totalAmount,
    costPerShare: totalAmount / quantity
  };
}

/**
 * Calculates the complete sell transaction details, including Capital Gains Tax (CGT).
 * @param {number} quantity - Number of shares
 * @param {number} sellPrice - Selling price per share
 * @param {number} buyPriceWacc - Purchase price per share (WACC)
 * @param {string} holdingType - 'short' (<=365 days), 'long' (>365 days), or 'institutional'
 */
export function calculateSellDetails(quantity, sellPrice, buyPriceWacc, holdingType = 'short') {
  const sellValue = quantity * sellPrice;
  const commission = calculateBrokerCommission(sellValue);
  const sebonFee = calculateSebonFee(sellValue);
  const dpFee = DP_CHARGE;
  
  // Total acquisition cost (based on WACC)
  const totalBuyingCost = quantity * buyPriceWacc;
  
  // Base for CGT calculation
  // Profit = Selling Value - Buying Cost - Selling Broker Commission - Selling SEBON Fee - DP Fee
  const netProfitBase = sellValue - totalBuyingCost - commission - sebonFee - dpFee;
  
  let cgtRate = 0.075; // Short term individual (7.5%)
  if (holdingType === 'long') {
    cgtRate = 0.05; // Long term individual (5.0%)
  } else if (holdingType === 'institutional') {
    cgtRate = 0.10; // Institutional (10.0%)
  }

  const taxableProfit = Math.max(0, netProfitBase);
  const cgt = taxableProfit * cgtRate;
  
  const totalExpenses = commission + sebonFee + dpFee + cgt;
  const netReceivable = sellValue - commission - sebonFee - dpFee - cgt;
  const netProfitLoss = netReceivable - totalBuyingCost;

  return {
    sellValue,
    commission,
    sebonFee,
    dpFee,
    cgt,
    cgtRate,
    totalExpenses,
    netReceivable,
    netProfitLoss,
    roi: totalBuyingCost > 0 ? (netProfitLoss / totalBuyingCost) * 100 : 0
  };
}

/**
 * Calculates Weighted Average Cost of Capital (WACC) for multiple transactions.
 * Transactions array format: [{ quantity: 100, price: 150 }, { quantity: 50, price: 200 }]
 */
export function calculateWacc(buyTransactions) {
  let totalQty = 0;
  let totalCost = 0;

  buyTransactions.forEach(tx => {
    const buyDetails = calculateBuyDetails(tx.quantity, tx.price);
    totalQty += tx.quantity;
    totalCost += buyDetails.totalAmount; // includes commission, sebon, dp
  });

  return {
    totalQuantity: totalQty,
    totalCost: totalCost,
    wacc: totalQty > 0 ? totalCost / totalQty : 0
  };
}

/**
 * Resolves standard face value / base price based on scrip nature
 * Debentures in Nepal: Rs. 1,000 per unit
 * Mutual Funds: Rs. 10 per unit
 * Equity shares: Rs. 100 per unit
 */
export function guessScripBasePrice(symbol, fallback) {
  if (fallback && fallback > 0 && fallback !== 100) return fallback;
  const s = String(symbol || '').toUpperCase().trim();
  if (/D(8[0-9]|9[0-9]|[0-9]{2})$/.test(s) || s.includes('DEB') || s.includes('BOND')) return 1000;
  if (s.endsWith('PF') || s.endsWith('MF') || s.endsWith('SEF') || s.endsWith('MMF') || s.endsWith('BF') || s.endsWith('F3') || s.endsWith('F2')) return 10;
  return 100;
}

/**
 * Loads the user's custom secondary market WACC map from localStorage
 */
export function getCustomWaccMap(userId = 'local') {
  try {
    const raw = localStorage.getItem(`nepse_hub_${userId}_custom_wacc_map`) || localStorage.getItem('nepse_hub_custom_wacc_map');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Saves a custom secondary market WACC map to localStorage
 */
export function saveCustomWaccMap(waccMap, userId = 'local') {
  try {
    const key = `nepse_hub_${userId}_custom_wacc_map`;
    localStorage.setItem(key, JSON.stringify(waccMap));
    localStorage.setItem('nepse_hub_custom_wacc_map', JSON.stringify(waccMap));
  } catch (e) {
    console.error("Failed to save custom WACC map:", e);
  }
}

/**
 * Updates or sets WACC for a specific symbol
 */
export function setScripCustomWacc(symbol, wacc, userId = 'local') {
  const map = getCustomWaccMap(userId);
  const sym = String(symbol || '').trim().toUpperCase();
  if (sym && Number(wacc) > 0) {
    map[sym] = Number(Number(wacc).toFixed(2));
    saveCustomWaccMap(map, userId);
  }
  return map;
}

/**
 * Sanitizes and repairs MeroShare holdings records with full CDSC field compatibility
 * and preserves user's secondary market custom WACC rates.
 */
export function sanitizeMeroShareHoldings(holdings = [], userId = 'local') {
  if (!Array.isArray(holdings)) return [];
  const customMap = getCustomWaccMap(userId);

  return holdings.map(h => {
    const symbol = (h.symbol || h.script || h.scrip || '').trim().toUpperCase();
    const units = Number(h.units || h.totalUnits || h.currentBalance || h.dematQty || 0);
    const freeBalance = Number(h.freeBalance ?? units);
    const frozenBalance = Number(h.freezeBalance || h.frozenBalance || 0);
    const base = guessScripBasePrice(symbol, h.wacc || h.purchasePrice);

    const ltpRaw = Number(h.lastTransactionPrice || h.lastTradedPrice || h.currentLtp || h.ltp || h.currentPrice || 0);
    const prevCloseRaw = Number(h.previousClosingPrice || h.closingPrice || h.prevClose || h.prevClosingPrice || 0);

    const currentLtp = ltpRaw > 0 ? ltpRaw : (prevCloseRaw > 0 ? prevCloseRaw : base);
    const prevClose = prevCloseRaw > 0 ? prevCloseRaw : currentLtp;

    const valLtpRaw = Number(h.valueAsOfLastTransactionPrice || h.valueOfLastTransactionPrice || h.valueAsOfLTP || h.totalAmount || h.totalValue || 0);
    const valCloseRaw = Number(h.valueAsOfPreviousClosingPrice || h.valueOfPreviousClosingPrice || h.valueAsOfPrevClose || 0);

    const valueAsOfLTP = valLtpRaw > 0 ? valLtpRaw : Number((units * currentLtp).toFixed(2));
    const valueAsOfPrevClose = valCloseRaw > 0 ? valCloseRaw : Number((units * prevClose).toFixed(2));

    // Custom secondary market WACC priority:
    // 1. Saved custom WACC from customMap
    // 2. Holding's own customized WACC (if not 100 or marked isCustomWacc)
    // 3. Fallback base (100 for equity, 1000 for debenture, 10 for MF)
    let wacc = base;
    if (customMap[symbol] && customMap[symbol] > 0) {
      wacc = customMap[symbol];
    } else if (h.isCustomWacc && Number(h.wacc) > 0) {
      wacc = Number(h.wacc);
    } else if (h.wacc && Number(h.wacc) > 0 && Number(h.wacc) !== 100) {
      wacc = Number(h.wacc);
    } else if (h.purchasePrice && Number(h.purchasePrice) > 0 && Number(h.purchasePrice) !== 100) {
      wacc = Number(h.purchasePrice);
    }

    return {
      ...h,
      symbol,
      name: h.name || h.scriptDesc || h.companyName || symbol,
      units,
      totalUnits: units,
      freeBalance,
      frozenBalance,
      currentLtp,
      prevClose,
      valueAsOfLTP,
      valueAsOfPrevClose,
      currentMarketValue: valueAsOfLTP > 0 ? valueAsOfLTP : (units * currentLtp),
      wacc: Number(wacc.toFixed(2)),
      isCustomWacc: Boolean(customMap[symbol] > 0 || (h.isCustomWacc && wacc > 0) || (wacc !== base))
    };
  }).filter(h => h.symbol && h.units > 0);
}

// ── Re-export Quantitative Analytics & AI Momentum Models ──
export {
  calculateGrahamIntrinsicValue,
  calculateVolumeZScore,
  calculateBollingerBandWidth,
  calculateRelativeStrength,
  calculateATR,
  calculateCompositeTechnicalScore,
  calculateFundamentalScore,
  calculateBrokerMicrostructureMetrics,
  calculateCompositeMomentumScore,
  classifyActionZone,
  calculateRiskRewardRatio,
  calculateAccumulationDistributionIndex,
  calculateStealthAccumulationIndex,
  calculateMatchingTradesSynchronization,
  calculateOrderBookImbalanceRatio,
  calculateImpendingLiquidityShockIndex,
  calculateDecisionProbabilityIndex,
  calculateTradeLabRankScore,
  calculateBrokerDominanceIndex
} from './quantEngine';



