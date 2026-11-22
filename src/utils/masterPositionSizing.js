/**
 * Pure position-sizing & statutory friction calculator for NEPSE Master 100% Profit Model.
 * Extracted into a dependency-free ES module so both UI/TS engines and Node tests can run it cleanly.
 */

/**
 * Calculates statutory tiered SEBON broker commission for a given transaction amount.
 * Statutory brackets under SEBON Bylaws:
 * - Up to Rs. 50,000: 0.36% (0.0036)
 * - Rs. 50,001 to Rs. 500,000: 0.33% (0.0033)
 * - Rs. 500,001 to Rs. 2,000,000: 0.31% (0.0031)
 * - Rs. 2,000,001 to Rs. 10,000,000: 0.27% (0.0027)
 * - Above Rs. 10,000,000: 0.24% (0.0024)
 * - Minimum commission: Rs. 10
 */
export function calculateTieredBrokerCommission(amount) {
  const amt = Math.max(0, Number(amount) || 0);
  if (amt <= 0) return 0;
  let fee = 0;
  if (amt <= 50000) fee = amt * 0.0036;
  else if (amt <= 500000) fee = amt * 0.0033;
  else if (amt <= 2000000) fee = amt * 0.0031;
  else if (amt <= 10000000) fee = amt * 0.0027;
  else fee = amt * 0.0024;
  return Math.max(10, fee);
}

/**
 * Computes net realized profit after all statutory frictions:
 * - Tiered SEBON Broker Commission on buy and sell
 * - SEBON Regulatory Fee (0.015% buy, 0.015% sell)
 * - DP Fee (Rs. 25 buy + Rs. 25 sell = Rs. 50 total round-trip)
 * - 5.0% Final Capital Gains Tax (CGT) mandated under Nepal Finance Act 2083 for individual holdings <= 365 days
 */
export function calculateNetTradeGain(entryPrice, targetPrice, shares = 100) {
  const pEntry = Number(entryPrice || 0);
  const pTarget = Number(targetPrice || 0);
  const numShares = Number(shares || 0);

  if (!Number.isFinite(numShares) || numShares <= 0 || pEntry <= 0 || pTarget <= 0) {
    return {
      grossGain: 0,
      brokerFeeTotal: 0,
      sebonFeeTotal: 0,
      dpFee: 0,
      totalExpenses: 0,
      cgtTax: 0,
      netRealizedGain: 0,
      netReturnPct: 0,
      statutoryBreakevenPrice: pEntry > 0 ? pEntry : 0,
      totalFrictionPct: 0
    };
  }

  const buyValue = pEntry * numShares;
  const sellValue = pTarget * numShares;
  const grossGain = sellValue - buyValue;

  const buyBrokerFee = calculateTieredBrokerCommission(buyValue);
  const sellBrokerFee = calculateTieredBrokerCommission(sellValue);
  const brokerFeeTotal = buyBrokerFee + sellBrokerFee;

  const sebonFeeBuy = buyValue * 0.00015;
  const sebonFeeSell = sellValue * 0.00015;
  const sebonFeeTotal = sebonFeeBuy + sebonFeeSell;

  const dpBuyFee = 25.0;
  const dpSellFee = 25.0;
  const dpFee = dpBuyFee + dpSellFee; // Rs. 50 total round-trip DP charge

  const totalBuyCost = buyValue + buyBrokerFee + sebonFeeBuy + dpBuyFee;
  const grossProceeds = sellValue - sellBrokerFee - sebonFeeSell - dpSellFee;

  const totalExpenses = brokerFeeTotal + sebonFeeTotal + dpFee;
  const taxableProfit = Math.max(0, grossProceeds - totalBuyCost);
  const cgtTax = taxableProfit * 0.050; // 5.0% Final CGT (Individual Short-Term <= 365d)

  const netRealizedGain = grossProceeds - totalBuyCost - cgtTax;
  const netReturnPct = totalBuyCost > 0 ? +((netRealizedGain / totalBuyCost) * 100).toFixed(2) : 0;
  const totalFrictionPct = totalBuyCost > 0 ? +(((totalExpenses + cgtTax) / totalBuyCost) * 100).toFixed(2) : 0;

  // Exact statutory breakeven: sellValue needed so net proceeds = totalBuyCost
  // (sellValue - sellBrokerFee - (sellValue * 0.00015) - 25) = totalBuyCost
  const estSellRate = totalBuyCost <= 50000 ? 0.0036 : (totalBuyCost <= 500000 ? 0.0033 : (totalBuyCost <= 2000000 ? 0.0031 : 0.0027));
  const breakevenSellValue = (totalBuyCost + dpSellFee) / (1 - estSellRate - 0.00015);
  const statutoryBreakevenPrice = +(breakevenSellValue / numShares).toFixed(2);

  return {
    grossGain: +grossGain.toFixed(2),
    brokerFeeTotal: +brokerFeeTotal.toFixed(2),
    sebonFeeTotal: +sebonFeeTotal.toFixed(2),
    dpFee,
    totalExpenses: +totalExpenses.toFixed(2),
    cgtTax: +cgtTax.toFixed(2),
    netRealizedGain: +netRealizedGain.toFixed(2),
    netReturnPct,
    statutoryBreakevenPrice,
    totalFrictionPct
  };
}

/**
 * Computes NEPSE lot-aware, risk-constrained, liquidity-capped position sizing.
 * When affordable or risk/liquidity-capped size drops below NEPSE minimum 10-kitta odd-lot threshold,
 * returns allowedShares: 0 with isBelowMinLot: true instead of forcing an unaffordable 10-share buy.
 */
export function computeMasterPositionSizing({
  ltp,
  stopLoss,
  target1Gross,
  portfolioCapital = 100000,
  riskTolerancePct = 1.5,
  adv20 = 15000
} = {}) {
  const effLtp = Number(ltp);
  const effStop = Number(stopLoss);
  const effT1 = Number(target1Gross);

  // Strict invalid / inverted stop guards: no fallback fabrication and no clamped 1.0 risk
  if (!Number.isFinite(effLtp) || effLtp <= 0 || !Number.isFinite(effStop) || effStop >= effLtp || effStop <= 0) {
    return {
      maxRiskCapital: 0,
      riskPerShare: 0,
      unconstrainedShares: 0,
      maxLiquidityShares: 0,
      maxAffordableShares: 0,
      isLiquidityCapped: false,
      isCapitalCapped: true,
      isBelowMinLot: true,
      allowedShares: 0,
      capitalOutlay: 0,
      allocationPct: 0,
      netDetails: calculateNetTradeGain(0, 0, 0)
    };
  }

  const targetPrice = Number.isFinite(effT1) && effT1 > effLtp ? effT1 : Number((effLtp * 1.08).toFixed(1));
  const safeCapital = Math.max(10000, Number(portfolioCapital) || 100000);
  const safeRiskPct = Math.max(0.5, Number(riskTolerancePct) || 1.5);
  const maxRiskCapital = safeCapital * (safeRiskPct / 100);
  const riskPerShare = +(effLtp - effStop).toFixed(2);
  const unconstrainedShares = Math.floor(maxRiskCapital / riskPerShare);
  const safeAdv = Math.max(0, Number(adv20) || 0);
  const maxLiquidityShares = safeAdv > 0 ? Math.floor(safeAdv * 0.05) : unconstrainedShares;

  // Max affordable shares accounting for buy-side brokerage + SEBON + DP friction
  const estBuyFeeRate = 0.0036 + 0.00015;
  const maxAffordableShares = Math.max(0, Math.floor((safeCapital - 25) / (effLtp * (1 + estBuyFeeRate))));

  const isLiquidityCapped = unconstrainedShares > maxLiquidityShares;
  const sharesBeforeCapitalCap = isLiquidityCapped ? maxLiquidityShares : unconstrainedShares;
  const isCapitalCapped = sharesBeforeCapitalCap > maxAffordableShares || maxAffordableShares < 10;
  const rawAllowed = Math.min(sharesBeforeCapitalCap, maxAffordableShares);
  const isBelowMinLot = rawAllowed < 10;
  const allowedShares = isBelowMinLot ? 0 : rawAllowed;
  const capitalOutlay = allowedShares * effLtp;
  const allocationPct = safeCapital > 0 ? +((capitalOutlay / safeCapital) * 100).toFixed(1) : 0;
  const netDetails = calculateNetTradeGain(effLtp, targetPrice, allowedShares);

  return {
    maxRiskCapital,
    riskPerShare,
    unconstrainedShares,
    maxLiquidityShares,
    maxAffordableShares,
    isLiquidityCapped,
    isCapitalCapped,
    isBelowMinLot,
    allowedShares,
    capitalOutlay,
    allocationPct,
    netDetails
  };
}
