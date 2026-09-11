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
 * NEW — Floorsheet Broker Accumulation Score
 *
 * Converts real broker analysis data from /api/broker-analysis/:symbol
 * into a score delta that is directly added to the composite action zone score.
 *
 * Physical basis: In NEPSE, institutional players operate through specific
 * broker IDs (e.g., Broker 58, 45, 34, 49). When top 3 buying brokers
 * absorb > 60% of daily turnover while selling is dispersed across retail
 * brokers, smart money is accumulating BEFORE the price moves.
 *
 * @param {number}  adRatio    Raw A/D ratio: (netBuyerQty - netSellerQty) / totalBuyVol
 * @param {string}  adSignal   'Accumulation' | 'Distribution' | 'Neutral'
 * @param {number}  adStrength Percentage strength 0–100
 * @param {number}  top3BuyPct (optional) Share of total turnover held by top 3 net buyers (0–1)
 * @returns {{ scoreDelta: number, label: string, color: string, detail: string }}
 */
export function calculateBrokerAccumulationScore(adRatio = 0, adSignal = 'Neutral', adStrength = 0, top3BuyPct = null) {
  const ratio = Number(adRatio) || 0;
  const strength = Number(adStrength) || 0;
  const signal = String(adSignal || 'Neutral');

  let scoreDelta = 0;
  let label = '';
  let color = '#94a3b8';
  let detail = '';

  if (signal === 'Accumulation') {
    // Strong broker accumulation: top 3 buyers absorbing most of the float
    if (strength >= 70 || ratio >= 0.15) {
      scoreDelta = +20;
      label = '🟢 STRONG BROKER ACCUMULATION';
      color = '#10B981';
      detail = `Net ${(ratio * 100).toFixed(1)}% of daily volume absorbed by top accumulating brokers. Institutional markup imminent.`;
    } else if (strength >= 35 || ratio >= 0.06) {
      scoreDelta = +12;
      label = '🟢 MODERATE BROKER ACCUMULATION';
      color = '#34d399';
      detail = `Steady institutional buying detected. ${strength.toFixed(0)}% accumulation strength across top brokers.`;
    } else {
      scoreDelta = +5;
      label = '🔵 MILD ACCUMULATION';
      color = '#60a5fa';
      detail = `Light net buying from institutional brokers. Monitor for confirmation.`;
    }

    // Extra bonus if top 3 buyers control > 60% of turnover (high concentration = conviction)
    if (top3BuyPct !== null && top3BuyPct >= 0.60) {
      scoreDelta += 5;
      detail += ` Top 3 brokers control ${(top3BuyPct * 100).toFixed(0)}% of turnover — high conviction accumulation.`;
    }

  } else if (signal === 'Distribution') {
    // Broker distribution: smart money selling into retail buy orders
    if (strength >= 70 || ratio <= -0.15) {
      scoreDelta = -25;
      label = '🔴 HEAVY BROKER DISTRIBUTION';
      color = '#F43F5E';
      detail = `Net ${Math.abs(ratio * 100).toFixed(1)}% of volume being dumped by top institutional brokers into retail demand. Exit or avoid.`;
    } else if (strength >= 35 || ratio <= -0.06) {
      scoreDelta = -15;
      label = '🟡 MODERATE DISTRIBUTION';
      color = '#f97316';
      detail = `Institutional selling pressure building. ${strength.toFixed(0)}% distribution strength — caution warranted.`;
    } else {
      scoreDelta = -6;
      label = '🟡 MILD SELLING PRESSURE';
      color = '#fbbf24';
      detail = `Minor broker-side selling. Not alarming but watch for escalation.`;
    }

  } else {
    // Neutral — no significant directional bias from broker data
    scoreDelta = 0;
    label = '⚪ BROKER FLOW NEUTRAL';
    color = '#94a3b8';
    detail = `No dominant broker accumulation or distribution detected. Market in equilibrium.`;
  }

  return {
    scoreDelta: Math.max(-25, Math.min(20, scoreDelta)),
    label,
    color,
    detail,
    adRatio: ratio,
    adSignal: signal,
    adStrength: strength,
    top3BuyPct
  };
}

/**
 * NEW — Hydro Dry Season Kill-Switch (NEPSE-Specific)
 *
 * Run-of-River (RoR) hydropower plants in Nepal generate only 25–40% of their
 * installed capacity during the dry Himalayan winter months (Mangsir–Chaitra,
 * approximately November–April in Gregorian calendar).
 *
 * During this period, Q2/Q3 revenues collapse, making bullish thesis for hydros
 * fundamentally unsound regardless of short-term technical signals.
 *
 * @param {string} sector  Stock sector string (e.g., 'Hydropower', 'Energy', etc.)
 * @returns {{
 *   isDrySeason: boolean,
 *   penaltyPoints: number,
 *   month: number,
 *   seasonLabel: string,
 *   warning: string
 * }}
 */
export function getHydroSeasonality(sector = '') {
  const sectorStr = String(sector || '').toLowerCase();
  const isHydro = sectorStr.includes('hydro') || sectorStr.includes('energy') ||
                  sectorStr.includes('power') || sectorStr.includes('electricity');

  if (!isHydro) {
    return { isDrySeason: false, penaltyPoints: 0, month: new Date().getMonth() + 1, seasonLabel: 'N/A (Non-Hydro)', warning: null };
  }

  const month = new Date().getMonth() + 1; // 1 = January … 12 = December

  // DRY SEASON: November (11) → April (4)
  // WET/PEAK SEASON: May (5) → October (10)
  const isDry = month >= 11 || month <= 4;

  // Deep dry months (Dec–Feb) are the worst for generation
  const isDeepDry = month === 12 || month === 1 || month === 2;

  let penaltyPoints = 0;
  let seasonLabel = '';
  let warning = null;

  if (isDry && isDeepDry) {
    penaltyPoints = -18;
    seasonLabel = '🔴 DEEP DRY SEASON (Dec–Feb)';
    warning = `⚠️ Hydropower Dry Season Alert: Peak winter months (Poush–Magh). RoR generation at 20–35% capacity. Q2/Q3 revenue severely impacted. Avoid new positions regardless of chart signals.`;
  } else if (isDry) {
    penaltyPoints = -10;
    seasonLabel = '🟡 DRY SEASON (Nov or Mar–Apr)';
    warning = `⚠️ Hydropower Seasonality Caution: Transitioning into / out of dry season. Generation 35–55% of capacity. Fundamentals weakening — reduce position size.`;
  } else {
    // WET SEASON: peak generation, strong revenues
    penaltyPoints = 0;
    seasonLabel = '🟢 WET/PEAK SEASON (May–Oct)';
    warning = null;
  }

  return {
    isDrySeason: isDry,
    penaltyPoints,
    month,
    seasonLabel,
    warning,
    isHydro
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

  // ── Broker Accumulation Score (Floorsheet Smart Money Signal) ─────────────
  // Read broker analysis data from stock object if pre-fetched by caller.
  // AiAnalyst passes brokerData; PredictorHub passes it when available.
  const brokerScore = calculateBrokerAccumulationScore(
    stock?.brokerAdRatio ?? macroContext?.brokerAdRatio ?? 0,
    stock?.brokerAdSignal ?? macroContext?.brokerAdSignal ?? 'Neutral',
    stock?.brokerAdStrength ?? macroContext?.brokerAdStrength ?? 0,
    stock?.brokerTop3Pct ?? macroContext?.brokerTop3Pct ?? null
  );

  // ── Hydro Dry Season Kill-Switch ─────────────────────────────────────────
  const hydroSeason = getHydroSeasonality(stock?.sector || stock?.sectorName || '');

  // Effective Momentum Score adjusted by broker flow evidence
  // (range stays logically in the same [-1, +1] ballpark via the MS input,
  //  but the score modifier works as a hard additive at the zone boundary)
  const brokerMSBoost = brokerScore.scoreDelta / 100; // convert pts to MS scale
  const effectiveMS = Math.max(-1.0, Math.min(1.0, MS + brokerMSBoost));

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

  // ── EMA Structural Position (Physical Hard Gate) ─────────────────────────
  // Read real ema50 / ema200 from the stock snapshot if available.
  // These are passed from AiAnalyst.jsx when computing the zone for Guru AI.
  const ema50 = Number(stock?.ema50 || stock?.sma50 || 0);
  const ema200 = Number(stock?.ema200 || stock?.sma200 || 0);

  // Determine structural position with 3-state logic: true / false / null (unknown)
  const isAbove50EMA = ema50 > 0 ? ltp >= ema50 : null;
  const isAbove200EMA = ema200 > 0 ? ltp >= ema200 : null;

  // Hard Trend Ceiling: CONFIRMED below 50 EMA → cannot be a true breakout.
  // Only fires when we have real EMA data (not the fallback 0.98x estimate).
  const isConfirmedBearishStructure = isAbove50EMA === false;

  // 1. ENTRY ZONE (True Breakout: effectiveMS > 0.55, Volume confirmed, price ABOVE 50 EMA, NO heavy broker distribution, NO deep hydro dry season)
  const hasHeavyBrokerDumping = brokerScore.adSignal === 'Distribution' && (brokerScore.adStrength >= 40 || brokerScore.adRatio <= -0.10);
  const isDeepHydroDry = hydroSeason.isHydro && hydroSeason.isDrySeason && hydroSeason.penaltyPoints <= -15;

  if (effectiveMS > 0.55 && (zVol >= 1.4 || volSurge >= 1.4 || ltp >= r1 * 0.99) && !isConfirmedBearishStructure && !hasHeavyBrokerDumping && !isDeepHydroDry) {
    zone = 'Entry Zone';
    zoneColor = '#10B981';
    zoneBadge = '🚀 ENTRY ZONE (BREAKOUT)';
    zoneIcon = 'Zap';
    const emaNote = isAbove50EMA === true ? ` · Price is above 50 EMA (Rs. ${ema50.toFixed(1)}) confirming structural uptrend.` : '';
    const brokerNote = brokerScore.scoreDelta > 0 ? ` · ${brokerScore.label} (+${brokerScore.scoreDelta}pts)` : '';
    triggerLogic = `Composite Momentum (+${effectiveMS.toFixed(2)}) & Volume Z-Score (${zVol}) >= 1.4 confirming institutional markup.${emaNote}${brokerNote}`;
    entryTarget = `Rs. ${ltp.toFixed(1)} – Rs. ${(ltp * 1.015).toFixed(1)} (Breakout Execution)`;
    profitTarget1 = `Rs. ${(ltp + (1.5 * atr)).toFixed(1)} (+${(((1.5 * atr) / ltp) * 100).toFixed(1)}%)`;
    profitTarget2 = `Rs. ${(r2).toFixed(1)} (+${(((r2 - ltp) / ltp) * 100).toFixed(1)}%)`;
    stopLoss = `Rs. ${(ltp - (1.2 * atr)).toFixed(1)} (-${(((1.2 * atr) / ltp) * 100).toFixed(1)}%)`;
    systematicStrategy = 'Execute market/limit buy orders as upward momentum expands with volume confirmation.';
  }
  // 1b. COUNTER-TREND BOUNCE (Price below 50 EMA but volume/MS temporarily positive)
  // This catches the exact AHPC situation: single-day +2.96% bounce with RVOL > 1.25x
  // but price trapped below structural moving averages.
  else if (isConfirmedBearishStructure && effectiveMS > 0.15) {
    zone = 'Counter-Trend Bounce';
    zoneColor = '#f97316';
    zoneBadge = '⚠️ COUNTER-TREND BOUNCE (RESISTANCE AHEAD)';
    zoneIcon = 'ShieldAlert';
    const resistanceNote = ema200 > 0 ? `Rs. ${ema200.toFixed(1)} (200 EMA)` : `Rs. ${r1.toFixed(1)} (R1 Pivot)`;
    const brokerNote = hasHeavyBrokerDumping ? ` · ⚠️ Institutional brokers are net sellers (${brokerScore.label}).` : '';
    triggerLogic = `Price below 50 EMA (Rs. ${ema50 > 0 ? ema50.toFixed(1) : 'N/A'}) — bounce into overhead resistance. This is a bearish structure rally, NOT a confirmed breakout.${brokerNote}`;
    entryTarget = `Avoid Fresh Buys — Wait for confirmed close above 50 EMA (Rs. ${ema50 > 0 ? ema50.toFixed(1) : '?'})`;
    profitTarget1 = `Resistance ceiling: ${resistanceNote}`;
    profitTarget2 = `N/A — Exit on approach to EMA resistance`;
    stopLoss = `Rs. ${(ltp - (1.0 * atr)).toFixed(1)} (Tight Stop — bearish structure)`;
    systematicStrategy = `Do NOT buy this rally. Price is below the 50 EMA structural ceiling. Wait for a confirmed weekly close above Rs. ${ema50 > 0 ? ema50.toFixed(1) : 'the 50 EMA'} with expanding volume before considering any entry.`;
  }
  // 1c. HYDRO DRY-SEASON REJECTION (Technical breakout blocked by winter hydrology)
  else if (isDeepHydroDry && (MS > 0.40 || volSurge >= 1.4)) {
    zone = 'Seasonality Caution';
    zoneColor = '#f59e0b';
    zoneBadge = '❄️ HYDRO DRY-SEASON OVERHANG';
    zoneIcon = 'AlertTriangle';
    triggerLogic = hydroSeason.warning || 'Hydropower RoR generation at winter low. Cash flows depressed.';
    entryTarget = `Avoid Fresh Buys (Wait for Spring Snowmelt / Pre-Monsoon)`;
    profitTarget1 = `Rs. ${r1.toFixed(1)} (Transient Swing Resistance)`;
    profitTarget2 = `N/A`;
    stopLoss = `Rs. ${(ltp - (1.2 * atr)).toFixed(1)}`;
    systematicStrategy = 'Hold back aggressive capital. Winter hydrology reduces RoR power output by 60–80%, capping earnings power.';
  }
  // 2. BUYING ZONE (Support Accumulation: effectiveMS in [0.15, 0.55], Near S1, Smart Money > 0.30, NO heavy broker dumping)
  else if (!hasHeavyBrokerDumping && ((effectiveMS >= 0.15 && factors.iSmartMoney >= 0.30) || (rsi <= 38 && ltp <= s1 * 1.03) || brokerScore.scoreDelta >= 15)) {
    zone = 'Buying Zone';
    zoneColor = '#10B981';
    zoneBadge = '🟢 BUYING ZONE (SUPPORT)';
    zoneIcon = 'Target';
    const brokerNote = brokerScore.scoreDelta > 0 ? ` · ${brokerScore.label}` : '';
    triggerLogic = `Composite Score (+${effectiveMS.toFixed(2)}) in accumulation pocket with institutional absorption (I_SmartMoney: +${factors.iSmartMoney})${brokerNote}.`;
    entryTarget = `Rs. ${s1.toFixed(1)} – Rs. ${(s1 * 1.015).toFixed(1)} (Support Floor)`;
    profitTarget1 = `Rs. ${(ltp * 1.08).toFixed(1)} (+8.0% Swing)`;
    profitTarget2 = `Rs. ${(ltp * 1.18).toFixed(1)} (+18.0% Expansion)`;
    stopLoss = `Rs. ${(s1 - (1.5 * atr)).toFixed(1)} (-${(((1.5 * atr) / s1) * 100).toFixed(1)}%)`;
    systematicStrategy = 'Accumulate positions quietly within the support range alongside institutional buyers.';
  }
  // 3. EXIT ZONE (Overbought / Broker Distribution / Smart Money Dumping)
  else if (rsi >= 75 || factors.iSmartMoney <= -0.40 || hasHeavyBrokerDumping || (stock?.pChange >= 8.5 && rsi > 70)) {
    zone = 'Exit Zone';
    zoneColor = '#eab308';
    zoneBadge = '🟡 EXIT ZONE (TAKE PROFIT / DISTRIBUTION)';
    zoneIcon = 'TrendingDown';
    const brokerWarn = hasHeavyBrokerDumping ? ` · ⚠️ ${brokerScore.label}: ${brokerScore.detail}` : '';
    triggerLogic = `Overbought or institutional distribution detected (RSI: ${rsi.toFixed(0)}, I_SmartMoney: ${factors.iSmartMoney})${brokerWarn}.`;
    entryTarget = `Avoid Fresh Buys (Pullback Target: Rs. ${(ltp * 0.90).toFixed(1)})`;
    profitTarget1 = `Rs. ${r2.toFixed(1)} (Major Pivot R2)`;
    profitTarget2 = `Rs. ${(high52w).toFixed(1)} (52W High Ceiling)`;
    stopLoss = `Rs. ${(ltp - (1.0 * atr)).toFixed(1)} (Tight Trailing Stop)`;
    systematicStrategy = 'Scale out of positions to lock in gains as momentum slows or institutional brokers offload into retail bids.';
  }
  // 4. SELLING ZONE (Support Breakdown / Distribution: effectiveMS < -0.30 or LTP < S1)
  else if (effectiveMS < -0.30 || (ltp < s1 && factors.iSmartMoney < -0.20)) {
    zone = 'Selling Zone';
    zoneColor = '#F43F5E';
    zoneBadge = '🔴 SELLING ZONE (CAPITAL PRESERVATION)';
    zoneIcon = 'AlertCircle';
    triggerLogic = `Negative Momentum Score (${effectiveMS.toFixed(2)}) and support breakdown below S1 floor (Rs. ${s1}).`;
    entryTarget = `No Entry (Capital Preservation Mode)`;
    profitTarget1 = `N/A`;
    profitTarget2 = `N/A`;
    stopLoss = `Immediate Exit below Rs. ${(ltp * 0.98).toFixed(1)}`;
    systematicStrategy = 'Close positions completely to preserve capital and prevent further drawdowns.';
  }
  // 5. HOLDING ZONE (Default Trend Following: effectiveMS in [0.05, 0.65], Price > 20 EMA)
  else {
    zone = 'Holding Zone';
    zoneColor = '#38bdf8';
    zoneBadge = '🔵 HOLDING ZONE (TREND TRAILING)';
    zoneIcon = 'Shield';
    triggerLogic = `Healthy trend alignment above 20 EMA (Rs. ${ema20.toFixed(1)}) with balanced flow.`;
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
    effectiveMomentumScore: +effectiveMS.toFixed(2),
    brokerScore,
    hydroSeason,
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
  const priceHistory = Array.isArray(stock?.history) && stock.history.length > 0 ? stock.history.map(h => h.close) : [ltp * 0.99, ltp, ltp * 1.005, ltp];

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
  let riskColor = '#10B981';
  if (ilsi >= 50) {
    riskLevel = '🚨 Extreme Supply Dilution Risk (ILSI >= 50%)';
    riskColor = '#F43F5E';
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
    badgeColor = '#10B981';
    actionDirective = 'Initiate Long Position with RRR >= 2.5';
  } else if (boundedDPI >= 60) {
    decision = 'Weak Buy / Hold';
    badgeColor = '#10B981';
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
    badgeColor = '#F43F5E';
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
 * 20. Multi-Horizon Predictive Target & Risk Formulation
 * Computes T1 (Conservative Scalp), T2 (Institutional Swing), T3 (Cycle Expansion), and Invalidation Stop
 */
export function calculateMultiHorizonTargets(ltp = 100, high52w = 0, low52w = 0, atr = 0, pChange = 0) {
  const price = Number(ltp) || 100;
  const calculatedAtr = Number(atr) > 0 ? Number(atr) : Math.max(2, price * 0.035);
  const pChg = Number(pChange) || 0;
  const h52 = Number(high52w) > 0 ? Number(high52w) : price * 1.30;
  const l52 = Number(low52w) > 0 ? Number(low52w) : price * 0.70;

  // T1: Conservative Swing Target (+1.0x ATR to +1.5x ATR, min +6%)
  const t1Gain = Math.max(price * 0.06, calculatedAtr * 1.25);
  const target1 = Number((price + t1Gain).toFixed(1));
  const t1Pct = Number((((target1 - price) / price) * 100).toFixed(2));

  // T2: Institutional Expansion Target (+2.0x ATR to Fibonacci 1.618 projection, min +14%)
  const t2Gain = Math.max(price * 0.14, calculatedAtr * 2.5);
  const target2 = Number((price + t2Gain).toFixed(1));
  const t2Pct = Number((((target2 - price) / price) * 100).toFixed(2));

  // T3: 52-Week High / Macro Cycle Extension (+3.5x ATR or 52W High retest)
  const target3 = Number(Math.max(price + calculatedAtr * 3.8, h52 * 0.98).toFixed(1));
  const t3Pct = Number((((target3 - price) / price) * 100).toFixed(2));

  // Invalidation Stop-Loss Floor (Key support level / -1.25x ATR, max -6.5%)
  const stopLossDistance = Math.min(price * 0.065, Math.max(price * 0.035, calculatedAtr * 1.25));
  const stopLoss = Number((price - stopLossDistance).toFixed(1));
  const stopPct = Number((((price - stopLoss) / price) * 100).toFixed(2));

  // Risk-to-Reward Ratio (Target 1 Reward / Risk)
  const risk = Math.max(1, price - stopLoss);
  const reward1 = Math.max(1, target1 - price);
  const reward2 = Math.max(1, target2 - price);
  const rrr1 = Number((reward1 / risk).toFixed(2));
  const rrr2 = Number((reward2 / risk).toFixed(2));

  // Entry Accumulation Zone
  const entryMin = Number((price * 0.985).toFixed(1));
  const entryMax = Number((price * 1.01).toFixed(1));

  return {
    ltp: price,
    entryZone: { min: entryMin, max: entryMax, label: `Rs. ${entryMin} – Rs. ${entryMax}` },
    target1: { price: target1, pct: t1Pct, horizon: '1–2 Weeks (Swing)', label: `Rs. ${target1} (+${t1Pct}%)` },
    target2: { price: target2, pct: t2Pct, horizon: '3–6 Weeks (Breakout)', label: `Rs. ${target2} (+${t2Pct}%)` },
    target3: { price: target3, pct: t3Pct, horizon: '2–4 Months (Macro Peak)', label: `Rs. ${target3} (+${t3Pct}%)` },
    stopLoss: { price: stopLoss, pct: stopPct, label: `Rs. ${stopLoss} (-${stopPct}%)` },
    rrr1,
    rrr2,
    isValidTradeSetup: rrr1 >= 1.5,
    atr: Number(calculatedAtr.toFixed(2))
  };
}

/**
 * 21. Multi-Factor Probabilistic Decision Matrix
 * Combines Momentum, Volume RVOL, Valuation Margin of Safety, and Macro Sentiment into Outcome Probabilities
 */
export function calculateProbabilisticMatrix(stock = {}, history = [], macroPulse = null) {
  const ltp = Number(stock.ltp) || 100;
  const pChange = Number(stock.pChange) || 0;
  const rsi = Number(stock.rsi) || 50;
  const pe = Number(stock.pe) || 0;
  const eps = Number(stock.eps) || 0;
  const volume = Number(stock.volume) || 0;
  const avgVol = Number(stock.avgVolume20D) || Math.max(1000, volume * 0.8);

  let bullishScore = 50;
  let bearishScore = 50;

  // 1. Price Momentum (+/- 20)
  if (pChange >= 3.0) bullishScore += 18;
  else if (pChange > 0.5) bullishScore += 10;
  else if (pChange <= -3.0) bearishScore += 18;
  else if (pChange < -0.5) bearishScore += 10;

  // 2. RSI Indicator (+/- 15)
  if (rsi >= 52 && rsi <= 68) bullishScore += 12;
  else if (rsi < 35) bullishScore += 15; // Oversold absorption
  else if (rsi > 75) bearishScore += 16; // Overbought distribution

  // 3. Volume Expansion RVOL (+/- 15)
  const rvol = avgVol > 0 ? volume / avgVol : 1.0;
  if (rvol >= 2.0 && pChange > 0) bullishScore += 15;
  else if (rvol >= 1.5 && pChange > 0) bullishScore += 8;
  else if (rvol >= 2.0 && pChange < 0) bearishScore += 15;

  // 4. Fundamental Quality (+/- 12)
  if (eps > 20 && pe > 0 && pe < 25) bullishScore += 12;
  else if (eps < 0 || pe > 70) bearishScore += 12;

  // 5. Macro Pulse (+/- 8)
  if (macroPulse?.sentiment === 'Bullish' || macroPulse?.score > 60) bullishScore += 8;
  else if (macroPulse?.sentiment === 'Bearish' || macroPulse?.score < 40) bearishScore += 8;

  // Normalize to 100% total
  const total = bullishScore + bearishScore;
  const bullishPct = Math.min(92, Math.max(15, Math.round((bullishScore / total) * 100)));
  const bearishPct = Math.min(85, Math.max(8, Math.round((bearishScore / total) * 100)));
  const neutralPct = Math.max(5, 100 - (bullishPct + bearishPct));

  // Determine overall AI confidence and signal
  let signal = 'HOLD / MONITOR';
  let confidence = 'Moderate (60%)';
  if (bullishPct >= 70) {
    signal = 'STRONG BUY / ACCUMULATE';
    confidence = `High (${bullishPct}%)`;
  } else if (bullishPct >= 58) {
    signal = 'BUY ON DIPS';
    confidence = `Favorable (${bullishPct}%)`;
  } else if (bearishPct >= 65) {
    signal = 'SELL / EXIT TO CASH';
    confidence = `High Risk (${bearishPct}%)`;
  } else if (bearishPct >= 55) {
    signal = 'TAKE PROFIT / TIGHTEN STOP';
    confidence = `Cautious (${bearishPct}%)`;
  }

  return {
    bullishPct,
    bearishPct,
    neutralPct,
    signal,
    confidence,
    rvol: Number(rvol.toFixed(2)),
    factors: {
      momentum: pChange >= 0 ? 'Bullish' : 'Bearish',
      volume: rvol >= 1.3 ? 'Expanding (Institutional Activity)' : 'Normal',
      valuation: eps > 0 && pe < 30 ? 'Sound Fundamentals' : 'Elevated Multiple'
    }
  };
}

/**
 * 22. Wyckoff Accumulation / Distribution Phase Classifier
 */
export function detectWyckoffPhase(history = [], currentVolume = 0) {
  if (!Array.isArray(history) || history.length < 5) {
    return {
      phase: 'Phase B: Base Building & Range Testing',
      action: 'Neutral Accumulation',
      description: 'Institutional range testing within dynamic support and resistance boundaries.'
    };
  }

  const closes = history.map(h => Number(h.close || h.ltp)).filter(c => !isNaN(c) && c > 0);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const netChg = ((last - first) / Math.max(1, first)) * 100;
  const currentPos = high > low ? ((last - low) / (high - low)) * 100 : 50;

  if (currentPos <= 25 && netChg <= -10) {
    return {
      phase: 'Phase C: Spring / Last Point of Support (LPS)',
      action: 'Smart Money Absorption',
      description: 'Smart Money absorbing supply at deep discount floors before markup initiation.'
    };
  } else if (currentPos >= 80 && netChg >= 15) {
    return {
      phase: 'Phase D: Markup Breakout / Sign of Strength (SOS)',
      action: 'Momentum Trend Continuation',
      description: 'Confirmed breakout above historical accumulation base with institutional buyer support.'
    };
  } else if (currentPos >= 85 && netChg >= 35) {
    return {
      phase: 'Phase D/E: Distribution / Upthrust After Distribution (UTAD)',
      action: 'Institutional Scale-Out',
      description: 'Smart Money offloading into retail liquidity spikes near multi-month highs.'
    };
  }

  return {
    phase: 'Phase B: Absorption & Cause Building',
    action: 'Consolidation / Base Building',
    description: 'Order flow testing supply/demand equilibrium inside the trading range.'
  };
}

/**
 * 23. Broker Dominance Index (BDI)
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

/**
 * 24. NEPSE Circuit-Breaker Proximity & Liquidity Guard
 * Evaluates +/- 10% daily price bands and warns on discrete lower circuit execution freezes
 */
export function calculateCircuitAndLiquidityMetrics(ltp, prevClose, volume = 0, turnover = 0, avgTurnover30D = 0) {
  const p = Number(ltp) || 100;
  const prev = Number(prevClose) || p;
  const vol = Number(volume) || 0;
  const tnov = Number(turnover) || (p * vol);
  const avgTnov = Number(avgTurnover30D) || tnov;

  const floor = +(prev * 0.90).toFixed(1);
  const ceiling = +(prev * 1.10).toFixed(1);

  const distToFloorPct = prev > 0 ? +(((p - floor) / prev) * 100).toFixed(2) : 10;
  const distToCeilingPct = prev > 0 ? +(((ceiling - p) / prev) * 100).toFixed(2) : 10;

  const isAtLowerCircuit = p <= floor;
  const isAtUpperCircuit = p >= ceiling;
  const isNearLowerCircuit = distToFloorPct <= 2.5 && !isAtLowerCircuit;
  const isNearUpperCircuit = distToCeilingPct <= 2.5 && !isAtUpperCircuit;

  const isIlliquid = (tnov > 0 && tnov < 3000000) || (vol > 0 && vol < 5000);
  const turnoverCr = +(tnov / 10000000).toFixed(2);

  let status = 'NORMAL_LIQUIDITY';
  let severity = 'LOW';
  let warningMessage = null;

  if (isAtLowerCircuit) {
    status = 'LOWER_CIRCUIT_LOCKED';
    severity = 'CRITICAL';
    warningMessage = `🚨 CRITICAL LOWER CIRCUIT FREEZE: Rs. ${p} is locked at -10% limit (Rs. ${floor}). Buy demand (bids) = 0. Market stop-loss orders will NOT execute.`;
  } else if (isNearLowerCircuit) {
    status = 'LOWER_CIRCUIT_PROXIMITY';
    severity = 'HIGH';
    warningMessage = `⚠️ CIRCUIT PROXIMITY RISK: Only ${distToFloorPct}% above -10% lower circuit (Rs. ${floor}). Stop-loss execution faces zero-bid liquidity freeze risk.`;
  } else if (isAtUpperCircuit) {
    status = 'UPPER_CIRCUIT_LOCKED';
    severity = 'INFO';
    warningMessage = `🔥 UPPER CIRCUIT LOCKED: Stock locked at +10% ceiling (Rs. ${ceiling}). Strong demand queue.`;
  } else if (isNearUpperCircuit) {
    status = 'UPPER_CIRCUIT_PROXIMITY';
    severity = 'INFO';
    warningMessage = `🚀 Approaching +10% circuit ceiling (Rs. ${ceiling}, ${distToCeilingPct}% headroom).`;
  } else if (isIlliquid) {
    status = 'THIN_LIQUIDITY';
    severity = 'MEDIUM';
    warningMessage = `⚠️ THIN LIQUIDITY WARNING: Daily turnover is Rs. ${turnoverCr} Cr (< Rs. 30L threshold). Expect high slippage and exit friction.`;
  }

  return {
    floor,
    ceiling,
    distToFloorPct,
    distToCeilingPct,
    isAtLowerCircuit,
    isAtUpperCircuit,
    isNearLowerCircuit,
    isNearUpperCircuit,
    isIlliquid,
    turnoverCr,
    status,
    severity,
    warningMessage
  };
}

/**
 * 25. Corporate Action Price Normalization
 * Detects sudden overnight step drops (>10%) in historical series that match bonus/rights book closures
 * and scales preceding bars backwards to prevent false technical crashes (e.g. false RSI plunge).
 */
export function normalizeCorporateActionPrices(candles = []) {
  if (!candles || candles.length < 5) return candles || [];

  const sorted = [...candles].sort((a, b) => new Date(a.date || a.t || 0) - new Date(b.date || b.t || 0));
  const normalized = [];

  let adjFactor = 1.0;
  let corporateActionCount = 0;
  
  for (let i = sorted.length - 1; i >= 0; i--) {
    const curr = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;

    const currClose = Number(curr.close ?? curr.c ?? curr.ltp ?? 100);
    const prevClose = prev ? Number(prev.close ?? prev.c ?? prev.ltp ?? currClose) : currClose;

    normalized.unshift({
      ...curr,
      rawClose: currClose,
      close: Number((currClose * adjFactor).toFixed(2)),
      open: Number((Number(curr.open ?? curr.o ?? currClose) * adjFactor).toFixed(2)),
      high: Number((Number(curr.high ?? curr.h ?? currClose) * adjFactor).toFixed(2)),
      low: Number((Number(curr.low ?? curr.l ?? currClose) * adjFactor).toFixed(2)),
      isAdjusted: adjFactor !== 1.0
    });

    // If there is an overnight step drop matching bonus/rights book closures (8.5% to 52%),
    // scale all preceding (older) historical bars backwards.
    if (prev && prevClose > 0 && currClose > 0) {
      const dropPct = ((prevClose - currClose) / prevClose) * 100;
      if (dropPct >= 8.5 && dropPct <= 52.0) {
        const expectedRatio = currClose / prevClose;
        adjFactor *= expectedRatio;
        corporateActionCount++;
      }
    }
  }

  normalized.corporateActionCount = corporateActionCount;
  return normalized;
}

/**
 * 26. Calendar & Fiscal Cycle Evaluation for Nepal Capital Market
 */
export function computeFiscalCycle(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1 = Jan ... 12 = Dec
  const day = d.getDate();

  // 1. Ashadh/Shrawan Wave (Mid-June to Mid-August): Massive Govt Development Budget Release
  if ((month === 6 && day >= 15) || month === 7 || (month === 8 && day <= 15)) {
    return {
      phase: 'Ashadh-Shrawan Government Spending Wave',
      scoreBonus: +0.25,
      bias: 'bullish',
      detail: 'Tens of billions of development budget released into banking accounts, lowering interbank rates and fueling post-fiscal liquidity surge.'
    };
  }

  // 2. Poush/Magh Q2 Corporate Tax Drain (Mid-Dec to Mid-Feb): 40% Advance Tax Paid
  if ((month === 12 && day >= 15) || month === 1 || (month === 2 && day <= 10)) {
    return {
      phase: 'Q2 Advance Corporate Tax Liquidity Drain',
      scoreBonus: -0.20,
      bias: 'bearish',
      detail: 'Corporates remit 40% advance tax to government treasury, temporarily withdrawing Rs. 40–60 Arba from bank deposits and tightening credit.'
    };
  }

  // 3. Festive Pre-Dashain Cash Withdrawal (Bhadra/Ashwin - approx Sept to Oct)
  if (month === 9 || (month === 10 && day <= 20)) {
    return {
      phase: 'Festive Season Cash Outflow Cycle',
      scoreBonus: -0.10,
      bias: 'neutral_defensive',
      detail: 'Public withdrawals for Dashain/Tihar festival bonuses and travel temporarily tighten banking reserves and reduce market turnover velocity.'
    };
  }

  // 4. Spring / Pre-Monetary Review (April - May)
  if (month === 4 || month === 5) {
    return {
      phase: 'Spring Capital Expansion Phase',
      scoreBonus: +0.10,
      bias: 'bullish',
      detail: 'Commercial banks active in credit deployment; speculative pre-monetary policy positioning.'
    };
  }

  return {
    phase: 'Mid-Fiscal Consolidation Phase',
    scoreBonus: 0.0,
    bias: 'neutral',
    detail: 'Balanced fiscal liquidity flows without seasonal tax or budget concentration.'
  };
}

/**
 * 27. 14-day Average True Range (ATR) for the NEPSE Index
 */
export function computeIndexATR(history, period = 14) {
  if (!Array.isArray(history) || history.length < period + 1) return 32.0;
  const trs = [];
  for (let i = 1; i < history.length; i++) {
    const h = Number(history[i].high || history[i].close || 0);
    const l = Number(history[i].low || history[i].close || 0);
    const prevC = Number(history[i - 1].close || 0);
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    if (tr > 0) trs.push(tr);
  }
  if (trs.length < 5) return 32.0;
  const recent = trs.slice(-period);
  return +(recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(1);
}
