/**
 * Calculations for Nepal Stock Exchange (NEPSE) and SEBON rules
 */

/**
 * Calculates tiered broker commission for equity trading in Nepal.
 * Tiers:
 * - Up to Rs. 50,000: 0.40%
 * - Rs. 50,001 to Rs. 500,000: 0.37%
 * - Rs. 500,001 to Rs. 2,000,000: 0.34%
 * - Rs. 2,000,001 to Rs. 10,000,000: 0.30%
 * - Above Rs. 10,000,000: 0.27%
 * Note: Minimum broker commission is Rs. 10.
 */
export function calculateBrokerCommission(amount) {
  if (amount <= 0) return 0;
  let commission = 0;
  if (amount <= 50000) {
    commission = amount * 0.0040;
  } else if (amount <= 500000) {
    commission = amount * 0.0037;
  } else if (amount <= 2000000) {
    commission = amount * 0.0034;
  } else if (amount <= 10000000) {
    commission = amount * 0.0030;
  } else {
    commission = amount * 0.0027;
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
  // Profit = Selling Value - Buying Cost - Selling Broker Commission - Selling SEBON Fee
  const netProfitBase = sellValue - totalBuyingCost - commission - sebonFee;
  
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
