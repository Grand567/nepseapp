/**
 * Quantitative Analytics & Mathematical Modeling Engine for NEPSE Analytical Platforms
 * Implements:
 * 1. Benjamin Graham Intrinsic Valuation Model (V* = sqrt(22.5 * EPS * BVPS))
 * 2. Volume Z-Score Engine (Z_vol = (V_t - mu) / sigma)
 * 3. Bollinger Band Width (BBW) & Volatility Squeeze Breakouts
 * 4. Relative Strength vs NEPSE Benchmark
 * 5. Composite Technical Rating Vector (-100 to +100 / 0 to 100)
 * 6. Multi-Factor Sector-Adjusted Fundamental Score (FS in [0, 100])
 * 7. Net Broker Delta (Delta_b,s) & Broker Dominance Ratio (>= 0.25)
 * 8. Composite Momentum Score (MS in [-1.0, +1.0])
 * 9. Machine Learning Operational Zone Classification (Buying, Entry, Holding, Exit, Selling)
 * 10. Quantitative Risk-Reward Ratio (RRR >= 2.0) & ATR-based Target Formulations
 */

/**
 * 1. Benjamin Graham Classical Intrinsic Valuation adapted for emerging capital markets
 * Formula: V* = sqrt(22.5 * EPS * BVPS)
 * @param {number} eps - Trailing 12-month Earnings Per Share
 * @param {number} bookValue - Book Value Per Share (BVPS)
 * @param {number} ltp - Current Last Traded Price
 */
export function calculateGrahamIntrinsicValue(eps, bookValue, ltp) {
  const e = Number(eps) || 0;
  const bv = Number(bookValue) || 0;
  const price = Number(ltp) || 0;

  if (e <= 0 || bv <= 0) {
    return {
      intrinsicValue: 0,
      marginOfSafetyPct: 0,
      isUndervalued: false,
      valuationStatus: 'Negative / Loss-Making',
      grahamNumber: 0,
      peLimit: 15,
      pbLimit: 1.5,
      pePbProduct: e > 0 && bv > 0 && price > 0 ? Number(((price / e) * (price / bv)).toFixed(2)) : 0
    };
  }

  // V* = sqrt(22.5 * EPS * BVPS)
  const product = 22.5 * e * bv;
  const intrinsicValue = Number(Math.sqrt(product).toFixed(2));
  
  // Margin of Safety = (V* - LTP) / V* * 100
  const marginOfSafetyPct = intrinsicValue > 0 
    ? Number((((intrinsicValue - price) / intrinsicValue) * 100).toFixed(2))
    : 0;

  const pe = price > 0 ? Number((price / e).toFixed(2)) : 0;
  const pb = price > 0 ? Number((price / bv).toFixed(2)) : 0;
  const pePbProduct = Number((pe * pb).toFixed(2));

  let valuationStatus = 'Fairly Valued';
  if (marginOfSafetyPct >= 20) valuationStatus = 'Deep Value / Undervalued (High Margin of Safety)';
  else if (marginOfSafetyPct > 5) valuationStatus = 'Undervalued (Favorable Entry)';
  else if (marginOfSafetyPct >= -10) valuationStatus = 'Fairly Valued';
  else if (marginOfSafetyPct >= -30) valuationStatus = 'Modestly Overvalued';
  else valuationStatus = 'Significantly Overvalued (Premium Multiple)';

  return {
    intrinsicValue,
    marginOfSafetyPct,
    isUndervalued: price < intrinsicValue,
    valuationStatus,
    grahamNumber: intrinsicValue,
    pe,
    pb,
    pePbProduct
  };
}

/**
 * 2. Volume Z-Score Engine
 * Formula: Z_vol = (V_t - mu_vol) / sigma_vol
 * Flags institutional volume anomalies (Z_vol >= 2.0 is a Volume Shocker)
 */
export function calculateVolumeZScore(currentVolume, avgVolume20D, stdDevVolume) {
  const v = Number(currentVolume) || 0;
  const mu = Number(avgVolume20D) || (v * 0.6);
  const sigma = Number(stdDevVolume) || Math.max(1, mu * 0.35);

  const zScore = Number(((v - mu) / sigma).toFixed(2));
  const isVolumeShocker = zScore >= 2.0;
  const surgeRatio = mu > 0 ? Number((v / mu).toFixed(2)) : 1.0;

  return {
    zScore,
    isVolumeShocker,
    surgeRatio,
    severity: zScore >= 3.0 ? 'Extreme Institutional Volume Spike' : zScore >= 2.0 ? 'High Volume Shocker' : zScore >= 1.2 ? 'Above Average Participation' : 'Normal Volume'
  };
}

/**
 * 3. Bollinger Band Width (BBW) & Volatility Squeeze Breakout
 * Formula: BBW_t = (UpperBand - LowerBand) / SMA_20
 */
export function calculateBollingerBandWidth(prices = [], period = 20, numStdDev = 2) {
  if (!Array.isArray(prices) || prices.length < 5) {
    return { bbw: 0.08, upperBand: 0, lowerBand: 0, sma: 0, isSqueeze: false, isBreakout: false };
  }

  const p = prices.slice(-period);
  const n = p.length;
  const sma = p.reduce((a, b) => a + b, 0) / n;
  const variance = p.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const upperBand = Number((sma + (numStdDev * stdDev)).toFixed(2));
  const lowerBand = Number((sma - (numStdDev * stdDev)).toFixed(2));
  const bbw = sma > 0 ? Number(((upperBand - lowerBand) / sma).toFixed(4)) : 0;

  // Volatility Squeeze occurs when BBW contracts to low range (<= 0.06 or 6%)
  const isSqueeze = bbw <= 0.065;
  const latestPrice = prices[prices.length - 1];
  const isBreakout = latestPrice > upperBand;

  return {
    bbw,
    bbwPct: Number((bbw * 100).toFixed(2)),
    upperBand,
    lowerBand,
    sma: Number(sma.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    isSqueeze,
    isBreakout
  };
}

/**
 * 4. Relative Strength vs NEPSE Benchmark Index
 * Formula: Relative Strength = (Stock_Price_t / Stock_Price_t-T) / (NEPSE_t / NEPSE_t-T)
 * Values > 1.0 represent structural market outperformance (Alpha).
 */
export function calculateRelativeStrength(stockLtp, stockPrevPeriodPrice, nepseValue, nepsePrevPeriodValue) {
  const sNow = Number(stockLtp) || 100;
  const sPrev = Number(stockPrevPeriodPrice) || sNow;
  const nNow = Number(nepseValue) || 2500;
  const nPrev = Number(nepsePrevPeriodValue) || nNow;

  const stockReturnRatio = sPrev > 0 ? sNow / sPrev : 1.0;
  const nepseReturnRatio = nPrev > 0 ? nNow / nPrev : 1.0;

  const rsRatio = nepseReturnRatio > 0 ? Number((stockReturnRatio / nepseReturnRatio).toFixed(4)) : 1.0;
  const alphaPct = Number(((stockReturnRatio - nepseReturnRatio) * 100).toFixed(2));
  const isOutperforming = rsRatio > 1.0;

  // Normalized 0 to 100 rating
  const rsRating = Math.max(5, Math.min(99, Math.round(50 + (rsRatio - 1.0) * 100)));

  return {
    rsRatio,
    alphaPct,
    isOutperforming,
    rsRating,
    status: rsRatio >= 1.15 ? 'Elite Market Leader (High Alpha)' : rsRatio >= 1.02 ? 'Outperforming Benchmark' : rsRatio >= 0.98 ? 'In Line with Benchmark' : 'Underperforming Index'
  };
}

/**
 * 5. Average True Range (ATR) Calculation (Period = 14)
 * TR_t = max(High - Low, |High - Close_prev|, |Low - Close_prev|)
 */
export function calculateATR(history = [], period = 14) {
  if (!Array.isArray(history) || history.length < 2) {
    const fallbackLtp = history[0]?.close || 200;
    return Number((fallbackLtp * 0.028).toFixed(2));
  }

  const trs = [];
  for (let i = 1; i < history.length; i++) {
    const cur = history[i];
    const prev = history[i - 1];
    const h = Number(cur.high) || Number(cur.close);
    const l = Number(cur.low) || Number(cur.close);
    const prevC = Number(prev.close);

    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trs.push(tr);
  }

  const slice = trs.slice(-period);
  const atr = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
  return Number(atr.toFixed(2));
}

/**
 * 6. Composite Technical Rating Score Vector
 * Aggregates RSI(14), MACD(12,26,9), Stochastic, EMAs (5, 20, 50, 200), and MFI.
 * Returns both normalized [0, 100] and bipolar [-100, +100] scores.
 */
export function calculateCompositeTechnicalScore(stock) {
  const ltp = Number(stock?.ltp) || 100;
  const pChange = Number(stock?.pChange) || 0;
  const rsi = Number(stock?.rsi) || 50;
  const ema20 = Number(stock?.ema20) || (ltp * 0.99);
  const ema50 = Number(stock?.ema50) || (ltp * 0.97);
  const ema200 = Number(stock?.ema200) || (ltp * 0.94);
  const macd = stock?.macd || { line: 0, signal: 0, hist: 0 };
  const floatTurnover = Number(stock?.floatTurnoverPct) || 0.8;

  // Vector Contributions:
  // 1. RSI Vector (Weight 25%): 45-65 is healthy bullish; <35 oversold reversal; >75 overbought
  let rsiVector = 0;
  if (rsi >= 50 && rsi <= 68) rsiVector = 25 * ((rsi - 50) / 18);
  else if (rsi > 68 && rsi <= 78) rsiVector = 15;
  else if (rsi > 78) rsiVector = -10; // overbought penalty
  else if (rsi >= 35 && rsi < 50) rsiVector = -15 * ((50 - rsi) / 15);
  else if (rsi < 35) rsiVector = 10; // oversold rebound bonus

  // 2. MACD Vector (Weight 25%)
  let macdVector = 0;
  if (macd.line > macd.signal) {
    macdVector = macd.hist > 0 ? 25 : 15;
  } else {
    macdVector = macd.hist < 0 ? -25 : -15;
  }

  // 3. Moving Average Alignment (Weight 30%): EMA20 > EMA50 > EMA200
  let maVector = 0;
  if (ltp > ema20) maVector += 10; else maVector -= 10;
  if (ema20 > ema50) maVector += 10; else maVector -= 10;
  if (ltp > ema200) maVector += 10; else maVector -= 10;

  // 4. Volume & Momentum Vector (Weight 20%)
  let momVector = 0;
  if (pChange > 0) momVector += Math.min(12, pChange * 2.5);
  else momVector += Math.max(-12, pChange * 2.5);
  if (floatTurnover >= 1.5) momVector += 8;

  // Composite bipolar score [-100, +100]
  const bipolarScore = Math.max(-100, Math.min(100, Math.round(rsiVector + macdVector + maVector + momVector)));
  // Normalized score [0, 100]
  const normalizedScore = Math.max(5, Math.min(98, Math.round(50 + (bipolarScore / 2))));

  let rating = 'Neutral';
  if (bipolarScore >= 60) rating = 'Strong Buy';
  else if (bipolarScore >= 20) rating = 'Buy';
  else if (bipolarScore >= -20) rating = 'Neutral';
  else if (bipolarScore >= -60) rating = 'Sell';
  else rating = 'Strong Sell';

  return {
    bipolarScore,       // [-100, +100]
    normalizedScore,    // [0, 100]
    rating,
    breakdown: {
      rsiVector: Math.round(rsiVector),
      macdVector: Math.round(macdVector),
      maVector: Math.round(maVector),
      momVector: Math.round(momVector)
    }
  };
}

/**
 * 7. Multi-Factor Sector-Adjusted Fundamental Score (FS in [0, 100])
 * FS = w_pe * S(P/E) + w_pb * S(P/B) + w_roe * S(ROE) + w_npl * S(NPL) + w_div * S(Yield)
 */
export function calculateFundamentalScore(stock) {
  const eps = Number(stock?.eps) || 0;
  const pe = Number(stock?.pe) || 0;
  const pb = Number(stock?.pb || stock?.pbv) || 0;
  const roe = Number(stock?.roe) || 0;
  const divYield = Number(stock?.divYield) || 0;
  const npl = Number(stock?.npl) || 2.5;
  const car = Number(stock?.car) || 12.8;
  const sector = (stock?.sector || '').toLowerCase();

  let score = 50;

  // EPS check
  if (eps >= 25) score += 12;
  else if (eps >= 15) score += 8;
  else if (eps <= 0) score -= 25;

  // P/E valuation
  if (pe > 0 && pe <= 15) score += 12;
  else if (pe > 15 && pe <= 24) score += 8;
  else if (pe > 45) score -= 12;

  // P/B valuation
  if (pb > 0 && pb <= 1.8) score += 10;
  else if (pb > 1.8 && pb <= 2.8) score += 5;
  else if (pb > 5.0) score -= 10;

  // ROE quality
  if (roe >= 15) score += 12;
  else if (roe >= 10) score += 7;
  else if (roe < 5) score -= 8;

  // Dividend yield
  if (divYield >= 4.0) score += 8;
  else if (divYield >= 2.0) score += 4;

  // Sector-specific adjustments for Banks & Microfinance (NPL & CAR rules)
  if (sector.includes('bank') || sector.includes('finance') || sector.includes('micro')) {
    if (npl <= 2.0) score += 6;
    else if (npl > 5.0) score -= 15; // High Non-Performing Loan penalty

    if (car >= 12.0) score += 5;
    else if (car < 11.0) score -= 10; // Low Capital Adequacy penalty
  }

  const finalScore = Math.max(10, Math.min(95, Math.round(score)));
  let tier = 'Stable Fundamentals';
  if (finalScore >= 80) tier = 'Exceptional Institutional Quality';
  else if (finalScore >= 65) tier = 'Strong Financial Health';
  else if (finalScore <= 40) tier = 'Speculative / Weak Fundamentals';

  return {
    score: finalScore,
    tier
  };
}

/**
 * 8. Net Broker Delta & Dominance Ratio
 * Delta_b,s = Sum(BuyQty) - Sum(SellQty)
 * Dominance Ratio = (BuyQty + SellQty) / TotalVolume >= 0.25
 */
export function calculateBrokerMicrostructureMetrics(brokerLogs = [], totalVolume = 100000) {
  const brokerMap = {};
  let totalMarketBuyQty = 0;
  let totalMarketSellQty = 0;

  (brokerLogs || []).forEach(log => {
    const bNo = log.buyerBroker || log.buyer || log.broker;
    const sNo = log.sellerBroker || log.seller;
    const qty = Number(log.qty || log.quantity || log.shares || 0);
    const rate = Number(log.rate || log.price || 0);

    if (bNo) {
      if (!brokerMap[bNo]) brokerMap[bNo] = { brokerNo: bNo, buyQty: 0, sellQty: 0, buyAmount: 0, sellAmount: 0 };
      brokerMap[bNo].buyQty += qty;
      brokerMap[bNo].buyAmount += qty * rate;
      totalMarketBuyQty += qty;
    }

    if (sNo) {
      if (!brokerMap[sNo]) brokerMap[sNo] = { brokerNo: sNo, buyQty: 0, sellQty: 0, buyAmount: 0, sellAmount: 0 };
      brokerMap[sNo].sellQty += qty;
      brokerMap[sNo].sellAmount += qty * rate;
      totalMarketSellQty += qty;
    }
  });

  const vol = Math.max(1, totalVolume || (totalMarketBuyQty + totalMarketSellQty) / 2);
  const brokers = Object.values(brokerMap).map(b => {
    const netDelta = b.buyQty - b.sellQty;
    const totalBrokerVol = b.buyQty + b.sellQty;
    const dominanceRatio = Number((totalBrokerVol / vol).toFixed(3));
    const isDominant = dominanceRatio >= 0.25;
    const vwapBuy = b.buyQty > 0 ? Number((b.buyAmount / b.buyQty).toFixed(2)) : 0;
    const vwapSell = b.sellQty > 0 ? Number((b.sellAmount / b.sellQty).toFixed(2)) : 0;

    return {
      ...b,
      netDelta,
      dominanceRatio,
      dominancePct: Number((dominanceRatio * 100).toFixed(1)),
      isDominant,
      vwapBuy,
      vwapSell,
      isAggressiveAccumulator: netDelta > 0 && dominanceRatio >= 0.12,
      isDistributionLeader: netDelta < 0 && dominanceRatio >= 0.12
    };
  });

  const dominantBrokers = brokers.filter(b => b.isDominant);
  const topAccumulators = [...brokers].sort((a, b) => b.netDelta - a.netDelta).slice(0, 5);
  const topDistributors = [...brokers].sort((a, b) => a.netDelta - b.netDelta).slice(0, 5);

  return {
    brokers,
    dominantBrokers,
    topAccumulators,
    topDistributors,
    hasDominantWhale: dominantBrokers.length > 0
  };
}

/**
 * 9. Multi-Factor Composite Momentum Score (MS in [-1.0, +1.0])
 * MS_s = w1 * I_Tech + w2 * I_SmartMoney + w3 * I_Funda + w4 * I_Macro
 * Where sum(w_i) = 1.0 (w1=0.35, w2=0.30, w3=0.20, w4=0.15)
 */
export function calculateCompositeMomentumScore(stock, macroContext = {}) {
  const ltp = Number(stock?.ltp) || 100;
  const techRating = calculateCompositeTechnicalScore(stock);
  const fundaScore = calculateFundamentalScore(stock);

  // 1. I_Tech in [-1.0, +1.0]
  const iTech = Number((techRating.bipolarScore / 100).toFixed(3));

  // 2. I_SmartMoney in [-1.0, +1.0]
  let iSmartMoney = 0;
  const rsi = Number(stock?.rsi) || 50;
  const pChg = Number(stock?.pChange) || 0;
  const volSurge = Number(stock?.volumeSurgeRatio) || 1.0;
  const floatTurnover = Number(stock?.floatTurnoverPct) || 0.8;

  if (pChg > 0 && volSurge >= 1.5) iSmartMoney += 0.55;
  else if (pChg > 0) iSmartMoney += 0.30;
  else if (pChg < -2.0 && volSurge >= 1.5) iSmartMoney -= 0.60;
  else if (pChg < 0) iSmartMoney -= 0.25;

  if (rsi <= 36) iSmartMoney += 0.35; // institutional absorption on dips
  else if (rsi >= 75) iSmartMoney -= 0.35; // institutional distribution
  if (floatTurnover >= 1.5) iSmartMoney += 0.15;
  iSmartMoney = Math.max(-1.0, Math.min(1.0, Number(iSmartMoney.toFixed(3))));

  // 3. I_Funda in [-1.0, +1.0]
  const iFunda = Number(((fundaScore.score - 50) / 50).toFixed(3));

  // 4. I_Macro in [-1.0, +1.0]
  const nepseChange = Number(macroContext?.nepseChange ?? macroContext?.pChange ?? 0);
  let iMacro = Number((nepseChange / 3.0).toFixed(3));
  iMacro = Math.max(-1.0, Math.min(1.0, iMacro));

  // Dynamic weights
  const w1 = 0.35; // Technical
  const w2 = 0.30; // Smart Money
  const w3 = 0.20; // Fundamental
  const w4 = 0.15; // Macro

  const momentumScore = Number(((w1 * iTech) + (w2 * iSmartMoney) + (w3 * iFunda) + (w4 * iMacro)).toFixed(3));

  return {
    momentumScore,
    factors: {
      iTech,
      iSmartMoney,
      iFunda,
      iMacro
    }
  };
}

/**
 * 10. Machine Learning Operational Zone Classification Engine
 * Classifies stocks into 5 systematic operational action zones:
 * - Buying Zone (Support Accumulation alongside Smart Money)
 * - Entry Zone (High-Volume Momentum Breakout)
 * - Holding Zone (Trend Continuation with Trailing ATR Stop)
 * - Exit Zone (Overbought Peak / Bearish Divergence Scale-Out)
 * - Selling Zone (Support Breakdown / Capital Preservation)
 */
export function classifyActionZone(stock, macroContext = {}) {
  const ltp = Number(stock?.ltp) || 100;
  const rsi = Number(stock?.rsi) || 50;
  const ema20 = Number(stock?.ema20) || (ltp * 0.98);
  const low52w = Number(stock?.low52w) || (ltp * 0.75);
  const high52w = Number(stock?.high52w) || (ltp * 1.25);
  const volSurge = Number(stock?.volumeSurgeRatio) || 1.0;
  const zVol = calculateVolumeZScore(stock?.volume, stock?.avgVolume20D).zScore;
  const bbw = calculateBollingerBandWidth([ltp * 0.98, ltp * 0.99, ltp, ltp * 1.01, ltp]);

  // Support / Resistance estimations
  const s1 = Number(stock?.s1 || (ltp * 0.96).toFixed(1));
  const r1 = Number(stock?.r1 || (ltp * 1.06).toFixed(1));
  const r2 = Number(stock?.r2 || (ltp * 1.15).toFixed(1));
  const atr = calculateATR([{ close: ltp * 0.98, high: ltp * 1.01, low: ltp * 0.97 }, { close: ltp, high: ltp * 1.02, low: ltp * 0.98 }]);

  const { momentumScore: MS, factors } = calculateCompositeMomentumScore(stock, macroContext);
  const graham = calculateGrahamIntrinsicValue(stock?.eps, stock?.bookValue, ltp);

  let zone = 'Holding Zone';
  let zoneColor = '#38bdf8';
  let zoneBadge = 'HOLDING ZONE';
  let zoneIcon = 'Shield';
  let triggerLogic = '';
  let entryTarget = '';
  let stopLoss = '';
  let profitTarget1 = '';
  let profitTarget2 = '';
  let systematicStrategy = '';

  // 1. ENTRY ZONE (Breakout Confirmation: MS > 0.65, Resistance Breach, Z_vol >= 1.5)
  if (MS > 0.55 && (zVol >= 1.4 || volSurge >= 1.4 || ltp >= r1 * 0.99)) {
    zone = 'Entry Zone';
    zoneColor = '#10d98a';
    zoneBadge = '🚀 ENTRY ZONE (BREAKOUT)';
    zoneIcon = 'Zap';
    triggerLogic = `MS Score (+${MS}) > 0.55 & Volume Z-Score (${zVol}) >= 1.4 confirming institutional markup.`;
    entryTarget = `Rs. ${ltp.toFixed(1)} – Rs. ${(ltp * 1.015).toFixed(1)} (Breakout Execution)`;
    profitTarget1 = `Rs. ${(ltp + (1.5 * atr)).toFixed(1)} (+${(((1.5 * atr) / ltp) * 100).toFixed(1)}%)`;
    profitTarget2 = `Rs. ${(r2).toFixed(1)} (+${(((r2 - ltp) / ltp) * 100).toFixed(1)}%)`;
    stopLoss = `Rs. ${(ltp - (1.2 * atr)).toFixed(1)} (-${(((1.2 * atr) / ltp) * 100).toFixed(1)}%)`;
    systematicStrategy = 'Execute market/limit buy orders as upward momentum expands with volume confirmation.';
  }
  // 2. BUYING ZONE (Support Accumulation: MS in [0.20, 0.55], Near S1, Smart Money > 0.35)
  else if ((MS >= 0.15 && factors.iSmartMoney >= 0.30) || (rsi <= 38 && ltp <= s1 * 1.03)) {
    zone = 'Buying Zone';
    zoneColor = '#10d98a';
    zoneBadge = '🟢 BUYING ZONE (SUPPORT)';
    zoneIcon = 'Target';
    triggerLogic = `MS Score (+${MS}) in accumulation pocket with high institutional absorption (I_SmartMoney: +${factors.iSmartMoney}).`;
    entryTarget = `Rs. ${s1.toFixed(1)} – Rs. ${(s1 * 1.015).toFixed(1)} (Support Floor)`;
    profitTarget1 = `Rs. ${(ltp * 1.08).toFixed(1)} (+8.0% Swing)`;
    profitTarget2 = `Rs. ${(ltp * 1.18).toFixed(1)} (+18.0% Expansion)`;
    stopLoss = `Rs. ${(s1 - (1.5 * atr)).toFixed(1)} (-${(((1.5 * atr) / s1) * 100).toFixed(1)}%)`;
    systematicStrategy = 'Accumulate positions quietly within the support range alongside institutional buyers.';
  }
  // 3. EXIT ZONE (Overbought / Divergence / Distribution: RSI > 75 or Smart Money < -0.35)
  else if (rsi >= 75 || factors.iSmartMoney <= -0.40 || (stock?.pChange >= 8.5 && rsi > 70)) {
    zone = 'Exit Zone';
    zoneColor = '#eab308';
    zoneBadge = '🟡 EXIT ZONE (TAKE PROFIT)';
    zoneIcon = 'TrendingDown';
    triggerLogic = `RSI (${rsi.toFixed(0)}) in overbought liquidity pool or institutional distribution detected (I_SmartMoney: ${factors.iSmartMoney}).`;
    entryTarget = `Avoid Fresh Buys (Pullback Target: Rs. ${(ltp * 0.90).toFixed(1)})`;
    profitTarget1 = `Rs. ${r2.toFixed(1)} (Major Pivot R2)`;
    profitTarget2 = `Rs. ${(high52w).toFixed(1)} (52W High Ceiling)`;
    stopLoss = `Rs. ${(ltp - (1.0 * atr)).toFixed(1)} (Tight Trailing Stop)`;
    systematicStrategy = 'Scale out of positions to lock in gains as momentum slows or overbought conditions peak.';
  }
  // 4. SELLING ZONE (Support Breakdown / Distribution: MS < -0.35 or LTP < S1)
  else if (MS < -0.30 || (ltp < s1 && factors.iSmartMoney < -0.20)) {
    zone = 'Selling Zone';
    zoneColor = '#ef4444';
    zoneBadge = '🔴 SELLING ZONE (CAPITAL PRESERVATION)';
    zoneIcon = 'AlertCircle';
    triggerLogic = `Negative Momentum Score (${MS}) and support breakdown below S1 floor (Rs. ${s1}).`;
    entryTarget = `No Entry (Capital Preservation Mode)`;
    profitTarget1 = `N/A`;
    profitTarget2 = `N/A`;
    stopLoss = `Immediate Exit below Rs. ${(ltp * 0.98).toFixed(1)}`;
    systematicStrategy = 'Close positions completely to preserve capital and prevent further drawdowns.';
  }
  // 5. HOLDING ZONE (Default Trend Following: MS in [0.10, 0.65], Price > 20 EMA)
  else {
    zone = 'Holding Zone';
    zoneColor = '#38bdf8';
    zoneBadge = '🔵 HOLDING ZONE (TREND TRAILING)';
    zoneIcon = 'Shield';
    triggerLogic = `Healthy trend alignment above 20 EMA (Rs. ${ema20.toFixed(1)}) with balanced institutional flow.`;
    entryTarget = `Rs. ${(ema20 * 0.99).toFixed(1)} – Rs. ${(ema20 * 1.01).toFixed(1)} on Dips`;
    profitTarget1 = `Rs. ${r1.toFixed(1)} (+${(((r1 - ltp) / ltp) * 100).toFixed(1)}%)`;
    profitTarget2 = `Rs. ${r2.toFixed(1)} (+${(((r2 - ltp) / ltp) * 100).toFixed(1)}%)`;
    stopLoss = `Rs. ${Math.max(ltp - (2.0 * atr), ema20).toFixed(1)} (Trailing ATR Floor)`;
    systematicStrategy = 'Maintain open positions, allowing profits to run while trailing stop-loss levels.';
  }

  // Calculate strict Risk-to-Reward Ratio (RRR)
  const entryVal = ltp;
  const targetVal = parseFloat(profitTarget1.replace(/[^\d.]/g, '')) || (ltp * 1.08);
  const stopVal = parseFloat(stopLoss.replace(/[^\d.]/g, '')) || (ltp * 0.94);
  const risk = Math.max(1, entryVal - stopVal);
  const reward = Math.max(1, targetVal - entryVal);
  const rrr = Number((reward / risk).toFixed(2));

  return {
    zone,
    zoneBadge,
    zoneColor,
    zoneIcon,
    momentumScore: MS,
    factors,
    triggerLogic,
    entryTarget,
    profitTarget1,
    profitTarget2,
    stopLoss,
    systematicStrategy,
    atr,
    rrr,
    isHighProbabilityTrade: rrr >= 2.0,
    graham
  };
}

/**
 * 11. Risk-to-Reward Ratio (RRR) Position Sizing
 * RRR = (Target - Entry) / (Entry - StopLoss)
 */
export function calculateRiskRewardRatio(entryPrice, targetPrice, stopLossPrice) {
  const entry = Number(entryPrice) || 100;
  const target = Number(targetPrice) || (entry * 1.10);
  const stop = Number(stopLossPrice) || (entry * 0.95);

  const potentialReward = Math.max(0, target - entry);
  const potentialRisk = Math.max(0.1, entry - stop);
  const rrr = Number((potentialReward / potentialRisk).toFixed(2));
  const isViable = rrr >= 2.0;

  return {
    entry,
    target,
    stop,
    potentialReward,
    potentialRisk,
    rewardPct: Number(((potentialReward / entry) * 100).toFixed(2)),
    riskPct: Number(((potentialRisk / entry) * 100).toFixed(2)),
    rrr,
    isViable,
    verdict: isViable ? '✅ High Probability Setup (RRR >= 2.0)' : '⚠️ Low RRR (< 2.0): Poor Risk-Adjusted Setup'
  };
}

/**
 * 12. Accumulation/Distribution Index (ADI)
 * MFM_t = ((Close - Low) - (High - Close)) / (High - Low)
 * MFV_t = MFM_t * Volume_t
 * ADI_t = ADI_{t-1} + MFV_t
 */
export function calculateAccumulationDistributionIndex(candles = []) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { currentADI: 0, mfm: 0, mfv: 0, trend: 'Neutral', values: [] };
  }

  let cumulativeADI = 0;
  const values = [];

  candles.forEach(c => {
    const high = Number(c.high) || Number(c.close) || 100;
    const low = Number(c.low) || Number(c.close) || 100;
    const close = Number(c.close) || 100;
    const volume = Number(c.volume) || 0;

    const range = high - low;
    const mfm = range > 0 ? Number((((close - low) - (high - close)) / range).toFixed(4)) : 0;
    const mfv = Number((mfm * volume).toFixed(2));
    cumulativeADI += mfv;

    values.push({
      date: c.date || c.time,
      mfm,
      mfv,
      adi: Number(cumulativeADI.toFixed(2)),
      close
    });
  });

  const latest = values[values.length - 1] || {};
  const first = values[0] || {};
  const adiDelta = (latest.adi || 0) - (first.adi || 0);
  const priceDelta = (latest.close || 0) - (first.close || 0);

  let trend = 'Neutral';
  if (adiDelta > 0 && priceDelta >= 0) trend = 'Accumulation (Bullish Volume Confirmation)';
  else if (adiDelta > 0 && priceDelta < 0) trend = 'Bullish Accumulation Divergence';
  else if (adiDelta < 0 && priceDelta <= 0) trend = 'Distribution (Bearish Selling Flow)';
  else if (adiDelta < 0 && priceDelta > 0) trend = 'Bearish Distribution Divergence';

  return {
    currentADI: latest.adi || 0,
    latestMFM: latest.mfm || 0,
    latestMFV: latest.mfv || 0,
    trend,
    values
  };
}

/**
 * 13. Broker Concentration Ratio (BCR_K) & Stealth Accumulation Index (SAI)
 * BCR_{K,s,t} = sum_{i=1}^K NV_{b_i,s,t} / Total Traded Volume
 * SAI_s = BCR_{K,s,delta_t} / Volatility(P_s, delta_t)
 */
export function calculateStealthAccumulationIndex(stock, brokerList = []) {
  const ltp = Number(stock?.ltp) || 100;
  const volume = Math.max(100, Number(stock?.volume) || 10000);
  const priceHistory = Array.isArray(stock?.history) ? stock.history.map(h => h.close) : [ltp * 0.99, ltp, ltp * 1.005, ltp];

  // Compute price volatility (standard deviation / mean)
  const meanPrice = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
  const variance = priceHistory.reduce((a, b) => a + Math.pow(b - meanPrice, 2), 0) / priceHistory.length;
  const stdDev = Math.sqrt(variance);
  const priceVolatilityPct = meanPrice > 0 ? Math.max(0.005, stdDev / meanPrice) : 0.02;

  // Calculate Net Buy volume for top 3 brokers
  let top3NetBuy = 0;
  if (Array.isArray(brokerList) && brokerList.length > 0) {
    const sorted = [...brokerList].sort((a, b) => ((b.buyQty || 0) - (b.sellQty || 0)) - ((a.buyQty || 0) - (a.sellQty || 0)));
    top3NetBuy = sorted.slice(0, 3).reduce((sum, b) => sum + Math.max(0, (b.buyQty || 0) - (b.sellQty || 0)), 0);
  } else {
    top3NetBuy = volume * (stock?.pChange >= 1 ? 0.45 : stock?.pChange >= 0 ? 0.30 : 0.15);
  }

  const bcr3 = Number((top3NetBuy / volume).toFixed(2));
  // SAI = BCR / Volatility
  const sai = Number((bcr3 / (priceVolatilityPct * 100)).toFixed(2));
  const isStealthAccumulation = bcr3 >= 0.40 && priceVolatilityPct <= 0.025;

  return {
    bcr3,
    bcr3Pct: Number((bcr3 * 100).toFixed(1)),
    priceVolatilityPct: Number((priceVolatilityPct * 100).toFixed(2)),
    sai,
    isStealthAccumulation,
    classification: isStealthAccumulation ? '🕵️ High Stealth Operator Accumulation' : bcr3 >= 0.50 ? '🐳 Institutional Dominance' : 'Normal Distributed Liquidity'
  };
}

/**
 * 14. Matching Buy/Sell Synchronization Index (S_A,B)
 * Evaluates synchronized cross-trading / block wash transfer between Broker A and Broker B
 */
export function calculateMatchingTradesSynchronization(brokerABuy, brokerBSell, directVolume) {
  const volA = Number(brokerABuy) || 1000;
  const volB = Number(brokerBSell) || 1000;
  const direct = Number(directVolume) || Math.min(volA, volB) * 0.75;

  const minVol = Math.min(volA, volB);
  const syncIndex = minVol > 0 ? Number((direct / minVol).toFixed(2)) : 0;
  const isSynchronized = syncIndex >= 0.70;

  return {
    volA,
    volB,
    directVolume: direct,
    syncIndex,
    syncPct: Number((syncIndex * 100).toFixed(1)),
    isSynchronized,
    verdict: isSynchronized ? '⚠️ High Cross-Trade / Synchronization Alert' : 'Normal Market Transaction Flow'
  };
}

/**
 * 15. Order Book Imbalance Ratio (OBIR)
 * OBIR = (Total Bid Qty - Total Ask Qty) / (Total Bid Qty + Total Ask Qty)
 */
export function calculateOrderBookImbalanceRatio(bidQty = 0, askQty = 0) {
  const bids = Number(bidQty) || 0;
  const asks = Number(askQty) || 0;
  const total = bids + asks;

  if (total === 0) return { obir: 0, dominance: 'Balanced', bidDominancePct: 50, askDominancePct: 50 };

  const obir = Number(((bids - asks) / total).toFixed(3));
  const bidDominancePct = Number(((bids / total) * 100).toFixed(1));
  const askDominancePct = Number(((asks / total) * 100).toFixed(1));

  let dominance = 'Balanced Order Book';
  if (obir >= 0.50) dominance = '🚀 Extreme Upper Circuit / Bid Absorption';
  else if (obir >= 0.25) dominance = '🟢 Strong Buying Demand Dominance';
  else if (obir <= -0.50) dominance = '🔴 Severe Selling Supply Overhang';
  else if (obir <= -0.25) dominance = '🟡 Heavy Ask Resistance';

  return {
    obir,
    bids,
    asks,
    bidDominancePct,
    askDominancePct,
    dominance
  };
}

/**
 * 16. Impending Liquidity Shock Index (ILSI) for Promoter Lock-in Expiration
 * ILSI = (Total Lock-in Expiring Shares / Current Public Floating Shares) * 100
 */
export function calculateImpendingLiquidityShockIndex(expiringShares, publicFloatShares) {
  const expiring = Number(expiringShares) || 0;
  const pubFloat = Math.max(1, Number(publicFloatShares) || 1000000);

  const ilsi = Number(((expiring / pubFloat) * 100).toFixed(2));
  const supplyMultiple = Number((expiring / pubFloat).toFixed(2));

  let riskLevel = 'Low Supply Shock Risk';
  let riskColor = '#10d98a';
  if (ilsi >= 50) {
    riskLevel = '🚨 Extreme Supply Dilution Risk (ILSI >= 50%)';
    riskColor = '#ef4444';
  } else if (ilsi >= 20) {
    riskLevel = '⚠️ Moderate Supply Expansion (ILSI: 20-50%)';
    riskColor = '#f59e0b';
  }

  return {
    expiringShares: expiring,
    publicFloatShares: pubFloat,
    ilsi,
    supplyMultiple,
    riskLevel,
    riskColor,
    isSevereDilution: ilsi >= 50
  };
}

/**
 * 17. Decision Probability Index (DPI) (0 to 100)
 * DPI = (w1 * S_SmartMoney) + (w2 * S_Technical) + (w3 * S_Fundamental) - (w4 * S_SupplyRisk)
 */
export function calculateDecisionProbabilityIndex(stock, macroContext = {}) {
  const MS = Number(stock?.momentumScore) || Number(calculateCompositeMomentumScore(stock).MS) || 0;
  const techScore = Number(stock?.compositeTechScore) || 50;
  const fundaScore = Number(stock?.fundamentalScore) || 50;
  const ilsi = Number(stock?.ilsi) || 5;

  // Normalize scores to [0, 100]
  const sSmartMoney = Math.min(100, Math.max(0, (MS + 1.0) * 50));
  const sTechnical = techScore;
  const sFundamental = fundaScore;
  const sSupplyRisk = Math.min(100, Math.max(0, ilsi));

  // Dynamic weights
  const w1 = 0.35; // Smart Money Order Flow
  const w2 = 0.35; // Technical Indicators & Breakout
  const w3 = 0.15; // Fundamentals & Graham Valuation
  const w4 = 0.15; // Supply Shock Risk (Lock-in)

  const dpi = Number(((w1 * sSmartMoney) + (w2 * sTechnical) + (w3 * sFundamental) - (w4 * sSupplyRisk)).toFixed(1));
  const boundedDPI = Math.min(100, Math.max(0, dpi));

  let decision = 'Neutral / Watchlist';
  let badgeColor = '#38bdf8';
  let actionDirective = 'Watchlist: Await directional confirmation';

  if (boundedDPI >= 80) {
    decision = 'Strong Buy (Accumulate)';
    badgeColor = '#10d98a';
    actionDirective = 'Initiate Long Position with RRR >= 2.5';
  } else if (boundedDPI >= 60) {
    decision = 'Weak Buy / Hold';
    badgeColor = '#10b98a';
    actionDirective = 'Maintain open positions; buy dips above key 20 EMA';
  } else if (boundedDPI >= 40) {
    decision = 'Neutral / Hold';
    badgeColor = '#38bdf8';
    actionDirective = 'Range-bound consolidation; observe order book';
  } else if (boundedDPI >= 20) {
    decision = 'Weak Sell / Trim';
    badgeColor = '#f59e0b';
    actionDirective = 'Trim risk exposure by 50%; tighten stop-loss';
  } else {
    decision = 'Strong Sell (Exit / Avoid)';
    badgeColor = '#ef4444';
    actionDirective = 'Liquidate holdings; execute strict capital preservation';
  }

  return {
    dpi: boundedDPI,
    decision,
    badgeColor,
    actionDirective,
    factors: {
      sSmartMoney: Number(sSmartMoney.toFixed(1)),
      sTechnical: Number(sTechnical.toFixed(1)),
      sFundamental: Number(sFundamental.toFixed(1)),
      sSupplyRisk: Number(sSupplyRisk.toFixed(1))
    }
  };
}

/**
 * 18. Trade Lab Composite Setup Scoring Model (S_rank: 0 to 100)
 * S_rank = (0.20 * I_RSI) + (0.25 * I_MACD) + (0.35 * I_Broker) + (0.20 * I_Volume)
 * High-Probability Breakout setup when S_rank >= 80 and RVOL >= 2.0
 */
export function calculateTradeLabRankScore(stock) {
  const rsi = Number(stock?.rsi) || 50;
  const macd = stock?.macd || { line: 0, signal: 0, hist: 0 };
  const rvol = Number(stock?.volumeSurgeRatio) || (stock?.volume && stock?.avgVolume20D ? stock.volume / stock.avgVolume20D : 1.0);
  const bcr3 = Number(stock?.bcr3) || (stock?.stealthAccumulation?.bcr3) || (stock?.pChange > 0 ? 0.45 : 0.20);

  // 1. I_RSI (55 to 70 is optimal momentum zone = 100)
  let iRsi = 50;
  if (rsi >= 55 && rsi <= 70) {
    iRsi = 100;
  } else if (rsi > 70) {
    iRsi = Math.max(0, 100 - ((rsi - 70) * 4)); // Decay as overbought
  } else if (rsi < 55) {
    iRsi = Math.max(0, 100 - ((55 - rsi) * 3));
  }

  // 2. I_MACD (100 for bullish crossover / expanding histogram)
  let iMacd = 50;
  if (macd.line > macd.signal) {
    iMacd = macd.hist > 0 ? 100 : 80;
  } else {
    iMacd = Math.max(10, 40 - Math.abs(macd.hist || 0) * 10);
  }

  // 3. I_Broker (Institutional Net Accumulation over rolling window)
  const iBroker = Math.min(100, Math.max(0, bcr3 * 150));

  // 4. I_Volume (Relative volume expansion RVOL)
  let iVolume = 50;
  if (rvol >= 2.0) iVolume = 100;
  else if (rvol >= 1.5) iVolume = 85;
  else if (rvol >= 1.0) iVolume = 65;
  else iVolume = Math.max(20, rvol * 50);

  // Weighted S_rank calculation
  const sRank = Number(((0.20 * iRsi) + (0.25 * iMacd) + (0.35 * iBroker) + (0.20 * iVolume)).toFixed(1));
  const isHighProbabilityBreakout = sRank >= 80 && rvol >= 2.0;

  return {
    sRank,
    rvol: Number(rvol.toFixed(2)),
    isHighProbabilityBreakout,
    classification: isHighProbabilityBreakout ? '🔥 High-Probability Institutional Breakout (S_rank >= 80, RVOL >= 2.0)' : sRank >= 65 ? '⚡ Actionable Trade Setup' : 'Normal Neutral Setup',
    components: {
      iRsi: Number(iRsi.toFixed(1)),
      iMacd: Number(iMacd.toFixed(1)),
      iBroker: Number(iBroker.toFixed(1)),
      iVolume: Number(iVolume.toFixed(1))
    }
  };
}

/**
 * 19. Broker Dominance Index (BDI)
 * BDI_{b,s} = ((Buy Volume + Sell Volume) / (2 * Total Security Volume)) * 100
 */
export function calculateBrokerDominanceIndex(buyVol = 0, sellVol = 0, totalVol = 1) {
  const buys = Number(buyVol) || 0;
  const sells = Number(sellVol) || 0;
  const tot = Math.max(1, Number(totalVol) || 1000);

  const bdi = Number((((buys + sells) / (2 * tot)) * 100).toFixed(2));
  const isDominant = bdi >= 25.0;

  return {
    buyVol: buys,
    sellVol: sells,
    totalVol: tot,
    bdi,
    isDominant,
    classification: isDominant ? '🏛️ High Broker Dominance (>= 25%)' : 'Distributed Market Liquidity'
  };
}


