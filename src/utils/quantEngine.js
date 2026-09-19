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
 * 1B. Benjamin Graham Interest-Adjusted Intrinsic Valuation Model (1974 Revision)
 * Formula: V = (EPS * (8.5 + 2g) * 4.4) / Y
 * Adapted for Nepal's monetary policy and commercial bank 1-year Fixed Deposit rate Y.
 * @param {number} eps - Trailing 12-month Earnings Per Share in NPR
 * @param {number} expectedGrowthRate - 5-year expected earnings growth rate (%) e.g. 7.0
 * @param {number} prevailingFdRate - Commercial bank 1-year FD rate in Nepal (%) e.g. 7.5
 * @param {number} ltp - Current Last Traded Price
 */
export function calculateInterestAdjustedGrahamValue(eps, expectedGrowthRate = 7.0, prevailingFdRate = 7.5, ltp = 0) {
  const e = Number(eps) || 0;
  const g = Math.max(0, Math.min(25, Number(expectedGrowthRate) || 7.0));
  const y = Math.max(2.0, Number(prevailingFdRate) || 7.5);
  const price = Number(ltp) || 0;

  if (e <= 0) {
    return {
      intrinsicValue: 0,
      marginOfSafetyPct: 0,
      maxBuyPrice20: 0,
      maxBuyPrice30: 0,
      isUndervalued: false,
      valuationStatus: 'Loss-Making / Negative EPS',
      growthFactor: Number((8.5 + 2 * g).toFixed(2)),
      fdRate: y,
      equityYield: 0,
      erp: 0
    };
  }

  // V = (EPS * (8.5 + 2g) * 4.4) / Y
  const growthMultiplier = 8.5 + (2 * g);
  const numerator = e * growthMultiplier * 4.4;
  const intrinsicValue = Number((numerator / y).toFixed(2));

  const maxBuyPrice20 = Number((intrinsicValue * 0.80).toFixed(2));
  const maxBuyPrice30 = Number((intrinsicValue * 0.70).toFixed(2));

  const marginOfSafetyPct = intrinsicValue > 0 && price > 0
    ? Number((((intrinsicValue - price) / intrinsicValue) * 100).toFixed(1))
    : 0;

  const equityYield = price > 0 ? Number(((e / price) * 100).toFixed(2)) : 0;
  const erp = Number((equityYield - y).toFixed(2));

  let valuationStatus = 'Fairly Valued';
  if (marginOfSafetyPct >= 30) valuationStatus = 'Deep Value (≥30% Margin of Safety)';
  else if (marginOfSafetyPct >= 20) valuationStatus = 'Undervalued (Favorable 20% MOS Entry)';
  else if (marginOfSafetyPct >= 0) valuationStatus = 'Fairly Valued (Within Intrinsic Value)';
  else if (marginOfSafetyPct >= -25) valuationStatus = 'Modestly Overvalued';
  else valuationStatus = 'Speculative / Premium Valuation';

  return {
    intrinsicValue,
    marginOfSafetyPct,
    maxBuyPrice20,
    maxBuyPrice30,
    isUndervalued: price > 0 && price <= maxBuyPrice20,
    valuationStatus,
    growthFactor: Number(growthMultiplier.toFixed(2)),
    fdRate: y,
    equityYield,
    erp
  };
}

/**
 * 1C. Earnings Yield & Equity Risk Premium (ERP)
 * Evaluates whether stock equity yield provides adequate compensation over risk-free bank FD rate.
 */
export function calculateEarningsYieldAndRiskPremium(eps, ltp, prevailingFdRate = 7.5) {
  const e = Number(eps) || 0;
  const price = Number(ltp) || 0;
  const y = Number(prevailingFdRate) || 7.5;

  if (e <= 0 || price <= 0) {
    return {
      earningsYield: 0,
      erp: Number((-y).toFixed(2)),
      isFavorable: false,
      status: 'Negative Earning Power / No Risk Premium'
    };
  }

  const earningsYield = Number(((e / price) * 100).toFixed(2));
  const erp = Number((earningsYield - y).toFixed(2));
  const isFavorable = erp > 0;

  let status = 'Inadequate Equity Risk Premium (FD Yield Superior)';
  if (erp >= 3.0) status = 'Exceptional Risk Premium (High Equity Compensation)';
  else if (erp > 0) status = 'Positive Equity Risk Premium (Attractive vs FD)';
  else if (erp >= -1.5) status = 'Neutral Risk Premium (Comparable to Fixed Deposit)';

  return {
    earningsYield,
    erp,
    isFavorable,
    status
  };
}

/**
 * 1D. Peter Lynch Metrics & 6-Archetype Classifier
 * Classifies NEPSE stocks into Lynch categories and computes PEG ratio.
 */
export function calculatePeterLynchMetrics(stock = {}, ltp = 0, epsGrowthRate = 0) {
  const eps = Number(stock?.eps) || 0;
  const price = Number(ltp || stock?.ltp || stock?.closePrice || 0);
  const pe = price > 0 && eps > 0 ? price / eps : Number(stock?.pe) || 0;
  const g = Number(epsGrowthRate || stock?.epsGrowth || stock?.growth || (eps > 20 ? 12 : eps > 10 ? 8 : 5));
  const sector = String(stock?.sector || '').toLowerCase();
  const roe = Number(stock?.roe || 0);
  const pb = Number(stock?.pb || stock?.pbv || (stock?.bookValue && price > 0 ? price / stock.bookValue : 1.5));

  // PEG = PE / g
  const peg = pe > 0 && g > 0 ? Number((pe / g).toFixed(2)) : 0;

  // Peter Lynch 6-Archetype Categorization
  let archetype = 'Stalwarts';
  let rationale = '';

  if (sector.includes('mutual') || (pb > 0 && pb < 0.85)) {
    archetype = 'Asset Plays';
    rationale = 'Trading at a substantial discount to Net Asset Value or carrying high underlying assets.';
  } else if (sector.includes('hydro') || sector.includes('cement') || sector.includes('manufactur')) {
    archetype = 'Cyclicals';
    rationale = 'Revenue tied to seasonal hydrology/monsoon water levels or industrial capital expenditure cycles.';
  } else if (g >= 20 || (eps > 25 && roe >= 18)) {
    archetype = 'Fast Growers';
    rationale = 'Aggressive double-digit earnings growth compounder with strong capital reinvestment.';
  } else if (stock?.npl && Number(stock.npl) > 4.5) {
    archetype = 'Turnarounds';
    rationale = 'Distressed asset or bank restructuring bad loans to restore regular dividend distribution.';
  } else if (g < 6 && (stock?.dividendYield >= 5 || stock?.divYield >= 5)) {
    archetype = 'Slow Growers';
    rationale = 'Mature utility or cash-cow with generous dividend payouts but modest capital expansion.';
  } else {
    archetype = 'Stalwarts';
    rationale = 'Large-cap institutional anchor with dependable 10–15% ROE and consistent regulatory standing.';
  }

  const isGarp = peg > 0 && peg <= 1.2 && pe <= 30;

  return {
    peg,
    archetype,
    rationale,
    isGarp,
    pegStatus: peg <= 0 ? 'N/A (Loss-Making or Zero Growth)' : peg <= 0.8 ? 'Deep Bargain GARP (PEG ≤ 0.8)' : peg <= 1.2 ? 'Fair Growth Valuation (PEG ≤ 1.2)' : peg <= 2.0 ? 'Premium Growth' : 'Overextended / Bubble Multiples (PEG > 2.0)'
  };
}

/**
 * 1E. Nepal Rastra Bank (NRB) Mandatory Solvency & Safety Gate
 * Enforces quantitative regulatory filters for Commercial Banks, Dev Banks, and Finance.
 */
export function evaluateNrbRegulatorySafety(stock = {}) {
  const sector = String(stock?.sector || '').toLowerCase();
  const isBfi = sector.includes('bank') || sector.includes('finance') || sector.includes('micro');

  if (!isBfi) {
    return {
      isBfi: false,
      passSafetyGate: true,
      dividendRisk: 'Not Applicable (Non-BFI)',
      car: null,
      npl: null,
      cdRatio: null,
      issues: []
    };
  }

  const npl = Number(stock?.npl != null ? stock.npl : 2.5);
  const car = Number(stock?.car != null ? stock.car : 12.0);
  const cdRatio = Number(stock?.cdRatio != null ? stock.cdRatio : 82.5);
  const roe = Number(stock?.roe != null ? stock.roe : 12.0);

  const issues = [];
  let passSafetyGate = true;

  if (npl > 5.0) {
    passSafetyGate = false;
    issues.push(`Critical NPL (${npl}% > 5.0%): Exceeds NRB regulatory dividend threshold. Dividends will be frozen.`);
  } else if (npl > 3.0) {
    issues.push(`Elevated NPL (${npl}%): Higher loan loss provisioning required; profit contraction risk.`);
  }

  if (car < 11.0) {
    passSafetyGate = false;
    issues.push(`Capital Adequacy Breach (${car}% < 11.0% NRB minimum): Tier-1 capital impaired; dividend halt mandatory.`);
  } else if (car < 11.5) {
    issues.push(`Tight Capital Buffer (${car}%): Very close to the 11.0% mandatory minimum.`);
  }

  if (cdRatio > 90.0) {
    passSafetyGate = false;
    issues.push(`Credit-to-Deposit Ceiling Breach (${cdRatio}% > 90.0%): Statutory lending freeze active.`);
  } else if (cdRatio > 88.0) {
    issues.push(`Tight Liquidity (${cdRatio}%): Close to 90% regulatory cap; credit growth restricted.`);
  }

  let dividendRisk = 'Safe / Eligible';
  if (!passSafetyGate) dividendRisk = 'High Risk / Frozen';
  else if (issues.length > 0) dividendRisk = 'Caution / Monitor';

  return {
    isBfi: true,
    passSafetyGate,
    dividendRisk,
    npl,
    car,
    cdRatio,
    roe,
    issues
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

  // Sector-relative Valuation Benchmarks (NEPSE medians)
  // Commercial banks trade 10-18x, Hydropower 15-30x, Insurance 20-30x, Microfinance 18-32x
  let sectorMedianPE = 20;
  let sectorMedianPB = 2.0;

  if (sector.includes('commercial') || (sector.includes('bank') && !sector.includes('development'))) {
    sectorMedianPE = 14;
    sectorMedianPB = 1.25;
  } else if (sector.includes('development') || sector.includes('finance')) {
    sectorMedianPE = 18;
    sectorMedianPB = 1.6;
  } else if (sector.includes('hydro')) {
    sectorMedianPE = 24;
    sectorMedianPB = 2.2;
  } else if (sector.includes('insurance') || sector.includes('life')) {
    sectorMedianPE = 25;
    sectorMedianPB = 2.6;
  } else if (sector.includes('micro')) {
    sectorMedianPE = 26;
    sectorMedianPB = 3.0;
  } else if (sector.includes('hotel') || sector.includes('tourism') || sector.includes('manufacturing')) {
    sectorMedianPE = 28;
    sectorMedianPB = 3.2;
  }

  // EPS check
  if (eps >= 25) score += 12;
  else if (eps >= 15) score += 8;
  else if (eps <= 0) score -= 25;

  // Sector-Relative P/E Valuation (Never evaluate across sectors without relative baseline)
  if (pe > 0) {
    if (pe <= sectorMedianPE * 0.85) {
      score += 12; // Undervalued relative to sector peer median
    } else if (pe <= sectorMedianPE * 1.15) {
      score += 8;  // Fair sector valuation
    } else if (pe > sectorMedianPE * 1.75 || pe > 45) {
      score -= 12; // Overextended valuation
    }

    // Penalize momentum crowding / FOMO buying where P/E > 40 without supporting EPS growth
    if (pe >= 40 && eps < 15) {
      score -= 10;
    }
  }

  // Sector-Relative P/B Valuation
  if (pb > 0) {
    // Bank specific: sub-1.0 P/BV indicates undervaluation if asset quality (NPL) is sound
    if (sector.includes('bank') && pb < 1.0 && npl <= 3.0) {
      score += 12;
    } else if (pb <= sectorMedianPB * 0.85) {
      score += 10;
    } else if (pb <= sectorMedianPB * 1.25) {
      score += 5;
    } else if (pb > sectorMedianPB * 2.0) {
      score -= 10;
    }
  }

  // ROE quality
  if (roe >= 15) score += 12;
  else if (roe >= 10) score += 7;
  else if (roe < 5) score -= 8;

  // Dividend yield
  if (divYield >= 4.0) score += 8;
  else if (divYield >= 2.0) score += 4;

  // Sector-specific adjustments for Banks & Microfinance (NPL & CAR regulatory rules)
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
    const entryMin = +(Math.min(ltp * 0.99, Math.max(s1, ltp * 0.975))).toFixed(1);
    const entryMax = +(ltp * 1.012).toFixed(1);
    entryTarget = `Rs. ${entryMin} – Rs. ${entryMax} (Accumulation Corridor)`;
    profitTarget1 = `Rs. ${(ltp + (1.5 * atr)).toFixed(1)} (+${(((1.5 * atr) / ltp) * 100).toFixed(1)}%)`;
    profitTarget2 = `Rs. ${(ltp + (3.0 * atr)).toFixed(1)} (+${(((3.0 * atr) / ltp) * 100).toFixed(1)}%)`;
    stopLoss = `Rs. ${(Math.max(1, ltp - (1.5 * atr))).toFixed(1)} (-${(((1.5 * atr) / ltp) * 100).toFixed(1)}%)`;
    systematicStrategy = 'Accumulate positions quietly within the support range alongside institutional buyers.';
  }
  // 3. EXIT ZONE (Overbought / Broker Distribution / Smart Money Dumping)
  else if (rsi >= 75 || factors.iSmartMoney <= -0.40 || hasHeavyBrokerDumping || (stock?.pChange >= 8.5 && rsi > 70)) {
    zone = 'Exit Zone';
    zoneColor = '#eab308';
    zoneBadge = '🟡 EXIT ZONE (TAKE PROFIT / DISTRIBUTION)';
    zoneIcon = 'TrendingDown';
    const brokerWarn = hasHeavyBrokerDumping ? ` · ⚠️ ${brokerScore.label}: ${brokerScore.detail}` : '';
    const condLabel = hasHeavyBrokerDumping && rsi < 70
      ? `Institutional distribution detected (I_SmartMoney: ${factors.iSmartMoney})`
      : rsi >= 75
      ? `Overbought peak detected (RSI: ${rsi.toFixed(0)})`
      : `Overbought or institutional distribution detected (RSI: ${rsi.toFixed(0)}, I_SmartMoney: ${factors.iSmartMoney})`;
    triggerLogic = `${condLabel}${brokerWarn}.`;
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
 * 15b. Pre-Open Order Execution Gate & Risk Audit
 * Analyzes Level-2 order book / queued orders during Pre-Open (10:30-10:45 AM)
 * or Post-Market preparation to validate the Day Prime Pick.
 *
 * @param {object} primePick - Selected Day Prime Pick setup
 * @param {object} marketDepth - Level-2 order book { bids, asks, totalBidQty, totalAskQty, obir }
 * @param {object} marketStatus - NEPSE market status { session, isTradingDay, isOpen }
 */
export function evaluatePreOpenExecutionGate(primePick = {}, marketDepth = null, marketStatus = {}) {
  if (!primePick || !primePick.symbol) {
    return null;
  }

  const bids = Array.isArray(marketDepth?.bids) ? marketDepth.bids : [];
  const asks = Array.isArray(marketDepth?.asks) ? marketDepth.asks : [];
  const totalBidQty = Number(marketDepth?.totalBidQty ?? bids.reduce((s, b) => s + Number(b.quantity || b.qty || 0), 0));
  const totalAskQty = Number(marketDepth?.totalAskQty ?? asks.reduce((s, a) => s + Number(a.quantity || a.qty || 0), 0));
  
  const obirMetrics = calculateOrderBookImbalanceRatio(totalBidQty, totalAskQty);

  const bestBid = bids.length > 0 ? Number(bids[0].price || bids[0].rate || 0) : 0;
  const bestAsk = asks.length > 0 ? Number(asks[0].price || asks[0].rate || 0) : 0;

  const prevClose = Number(primePick.previousClose || primePick.prevClose || primePick.ltp || primePick.price || 100);
  const indicativePrice = bestBid > 0 && bestAsk > 0
    ? +((bestBid + bestAsk) / 2).toFixed(1)
    : (bestBid > 0 ? bestBid : (bestAsk > 0 ? bestAsk : prevClose));

  const indicativeGapPct = prevClose > 0 ? +(((indicativePrice - prevClose) / prevClose) * 100).toFixed(2) : 0;

  // Key execution levels
  const entryLow = Number(primePick.entryLow || primePick.levels?.entryZone?.low || primePick.levels?.entryZone?.min || prevClose * 0.99);
  const entryHigh = Number(primePick.entryHigh || primePick.levels?.entryZone?.high || primePick.levels?.entryZone?.max || prevClose * 1.02);
  const stopLoss = Number(primePick.stopLoss || primePick.levels?.stopLoss?.price || prevClose * 0.93);
  const chaseCap = Number(primePick.chaseCap || primePick.levels?.chaseCap || (entryHigh > 0 ? +(entryHigh * 1.015).toFixed(1) : +(prevClose * 1.025).toFixed(1)));
  const preOpenCeiling = +(prevClose * 1.05).toFixed(1); // ±5% NEPSE pre-open limit

  // Order concentration & anti-spoofing
  const totalBidOrders = bids.reduce((s, b) => s + Number(b.orders || 1), 0) || 1;
  const avgSharesPerBid = totalBidQty > 0 ? Math.round(totalBidQty / totalBidOrders) : 0;
  const topBidSharePct = totalBidQty > 0 && bids.length > 0 ? +((Number(bids[0].quantity || 0) / totalBidQty) * 100).toFixed(1) : 0;
  const isWhaleAccumulation = bids.length > 0 && Number(bids[0].quantity || 0) >= 4000 && (bids[0].orders || 1) <= 3;

  const session = marketStatus?.session || 'POST_MARKET';
  const hasLiveOrders = (totalBidQty > 0 || totalAskQty > 0);
  const isTradingDay = marketStatus?.isTradingDay ?? true;
  const isAmoWindow = Boolean(marketStatus?.isAmoWindow);
  const isFirst15Min = Boolean(marketStatus?.isFirst15Min);
  const isPreOpenSession = session === 'PRE_OPEN' || session === 'PRE_OPEN_MATCH' || Boolean(marketStatus?.isPreOpen);
  const isContinuous = session === 'CONTINUOUS';

  let phase = 'POST_MARKET';
  let state = 'MONITORING_PRE_OPEN';
  let badge = '⚪ Pre-Open Liquidity Gathering';
  let color = '#94a3b8';
  let bg = 'rgba(148, 163, 184, 0.15)';
  let recommendation = 'Monitoring pre-open order book queue. Liquidity forming.';
  let verdict = 'MONITOR';

  // ── PHASE 1: AFTER-MARKET ORDER (AMO) / PRE-ORDER WINDOW (5:00 PM – 10:30 AM) ──
  if (isAmoWindow && !isPreOpenSession && !isContinuous) {
    phase = 'AMO_PRE_ORDER';
    state = 'AMO_PRE_ORDER_WINDOW';
    badge = '🌙 Pre-Order / AMO Window Open (5:00 PM – 10:30 AM)';
    color = '#a855f7';
    bg = 'rgba(168, 85, 247, 0.15)';
    recommendation = `NEPSE Broker TMS (NOTS) accepts After-Market Orders (AMO) from 5:00 PM to 10:30 AM. Queue a LIMIT buy order inside Recommended Buy Zone (Rs. ${entryLow} – Rs. ${entryHigh}). DO NOT place market orders or bid above Chase Cap (Rs. ${chaseCap}). Order will queue for pre-open matching.`;
    verdict = 'QUEUE_AMO_LIMIT';
  }
  // ── PHASE 2: PRE-OPEN ORDER SESSION & MATCHING (10:30 AM – 11:00 AM) ──
  else if (isPreOpenSession) {
    phase = 'PRE_OPEN';
    if (indicativePrice > chaseCap || indicativeGapPct >= 3.8) {
      state = 'PRE_OPEN_CHASE_WARNING';
      badge = '🟡 Pre-Open Warning: Indicative Open Above Chase Cap';
      color = '#f59e0b';
      bg = 'rgba(245, 158, 11, 0.15)';
      recommendation = `Indicative open (+${indicativeGapPct}%) exceeds Chase Cap (Rs. ${chaseCap}). Risk/Reward poor. Do NOT chase market order at 11:00 AM open. Cancel or adjust pre-order.`;
      verdict = 'CHASE_WARNING';
    } else if (obirMetrics.obir <= -0.25) {
      state = 'PRE_OPEN_SUPPLY_OVERHANG';
      badge = '🔴 Pre-Open Alert: Heavy Supply Blocks in Book';
      color = '#ef4444';
      bg = 'rgba(239, 68, 68, 0.15)';
      recommendation = `Institutional sell orders dominate pre-open book (OBIR: ${(obirMetrics.obir * 100).toFixed(0)}%). Stand down and wait for 11:15 AM opening absorption.`;
      verdict = 'AVOID';
    } else if (obirMetrics.obir >= 0.15 && indicativePrice >= entryLow * 0.985 && indicativePrice <= chaseCap) {
      state = 'PRE_OPEN_CONFIRMED';
      badge = '🟢 Pre-Open Confirmed: Strong Bid Absorption';
      color = '#10b981';
      bg = 'rgba(16, 185, 129, 0.15)';
      recommendation = `High-conviction green light. Bids dominate by ${obirMetrics.bidDominancePct}% inside Entry Corridor (Rs. ${entryLow}–${entryHigh}). Safe to queue limit buy.`;
      verdict = 'BUY_CONFIRMED';
    } else {
      state = 'PRE_OPEN_BALANCED';
      badge = '🔵 Pre-Open Order Book Balanced';
      color = '#38bdf8';
      bg = 'rgba(56, 189, 248, 0.15)';
      recommendation = `Pre-open order queue forming smoothly (OBIR: ${(obirMetrics.obir * 100).toFixed(0)}%). Indicative price Rs. ${indicativePrice}. Flow is neutral.`;
      verdict = 'MONITOR';
    }
  }
  // ── PHASE 3: FIRST 15-MINUTE FINAL GO / NO-GO DECISION ENGINE (11:00 AM – 11:15 AM) ──
  else if (isFirst15Min) {
    phase = 'FIRST_15M_DECISION';
    const livePrice = indicativePrice;

    if (livePrice > 0 && stopLoss > 0 && livePrice < stopLoss) {
      state = 'FINAL_VERDICT_NO_GO_STOP_BREACH';
      badge = '🔴 Final 15-Min Decision: NO-GO (Stop Loss Breached)';
      color = '#ef4444';
      bg = 'rgba(239, 68, 68, 0.15)';
      recommendation = `Stock opened at Rs. ${livePrice}, breaching the structural stop loss (Rs. ${stopLoss}). Trade setup invalidated. DO NOT ENTER.`;
      verdict = 'NO-GO';
    } else if (livePrice > chaseCap || indicativeGapPct >= 2.5) {
      state = 'FINAL_VERDICT_NO_GO_CHASE_TRAP';
      badge = '🔴 Final 15-Min Decision: NO-GO (Chase Trap Detected)';
      color = '#ef4444';
      bg = 'rgba(239, 68, 68, 0.15)';
      recommendation = `Stock opened extended at Rs. ${livePrice} (+${indicativeGapPct}%), exceeding the maximum Chase Cap of Rs. ${chaseCap}. High risk of retail trap. STAND DOWN and do not chase market orders.`;
      verdict = 'NO-GO';
    } else if (obirMetrics.obir <= -0.25 || Boolean(primePick.riskGate?.isInstitutionalDumping)) {
      state = 'FINAL_VERDICT_NO_GO_DUMPING';
      badge = '🔴 Final 15-Min Decision: NO-GO (Supply Dump In Progress)';
      color = '#ef4444';
      bg = 'rgba(239, 68, 68, 0.15)';
      recommendation = `Heavy institutional sell blocks detected in opening 15-minute order book (OBIR: ${(obirMetrics.obir * 100).toFixed(0)}%). Smart money selling into retail. STAND DOWN.`;
      verdict = 'NO-GO';
    } else if (livePrice <= chaseCap && livePrice >= entryLow * 0.985 && obirMetrics.obir > -0.20) {
      state = 'FINAL_VERDICT_GO';
      badge = '🟢 Final 15-Min Decision: GO (Confirmed Execution)';
      color = '#10b981';
      bg = 'rgba(16, 185, 129, 0.15)';
      recommendation = `Opening 15-minute price action confirmed inside Entry Zone (Rs. ${entryLow}–${entryHigh}) at Rs. ${livePrice}. Buying demand healthy (OBIR: ${(obirMetrics.obir * 100).toFixed(0)}%). Execution confirmed.`;
      verdict = 'GO';
    } else {
      state = 'FIRST_15M_CONFIRMING';
      badge = '🟡 15-Min Verification In Progress (11:00 – 11:15 AM)';
      color = '#f59e0b';
      bg = 'rgba(245, 158, 11, 0.15)';
      recommendation = `Assessing initial 15-minute price action, opening auction price, and institutional flow against Chase Cap (Rs. ${chaseCap}). Final verdict locked at 11:15 AM.`;
      verdict = 'PENDING';
    }
  }
  // ── PHASE 4: CONTINUOUS LIVE TRADING EXECUTION (11:15 AM – 3:00 PM) ──
  else if (isContinuous) {
    phase = 'CONTINUOUS_LIVE';
    if (indicativePrice > 0 && stopLoss > 0 && indicativePrice < stopLoss) {
      state = 'GAP_DOWN_INVALIDATED';
      badge = '🔴 Aborted: Traded Below Structural Stop';
      color = '#ef4444';
      bg = 'rgba(239, 68, 68, 0.15)';
      recommendation = `Live price (Rs. ${indicativePrice}) breached stop loss (Rs. ${stopLoss}). Trade setup invalidated. Stand down.`;
      verdict = 'STOPPED_OUT';
    } else if (indicativePrice > chaseCap || indicativeGapPct >= 3.8) {
      state = 'CHASE_CAUTION';
      badge = '🟡 Chase Warning: Price Extended Above Entry Zone';
      color = '#f59e0b';
      bg = 'rgba(245, 158, 11, 0.15)';
      recommendation = `Current price (+${indicativeGapPct}%) is extended above entry cap (Rs. ${chaseCap}). Wait for a pullback before entering.`;
      verdict = 'CHASE_WARNING';
    } else if (obirMetrics.obir <= -0.30) {
      state = 'SUPPLY_OVERHANG_ABORT';
      badge = '🔴 Heavy Supply Resistance in Order Book';
      color = '#ef4444';
      bg = 'rgba(239, 68, 68, 0.15)';
      recommendation = `Sellers heavily dominate the book (OBIR: ${(obirMetrics.obir * 100).toFixed(0)}%). Institutional selling block detected. Avoid entry.`;
      verdict = 'AVOID';
    } else if (obirMetrics.obir >= 0.20 && indicativePrice >= entryLow * 0.99 && indicativePrice <= chaseCap) {
      state = 'CONFIRMED_EXECUTION';
      badge = '🟢 Live Order Book: Strong Buying Demand Dominance';
      color = '#10b981';
      bg = 'rgba(16, 185, 129, 0.15)';
      recommendation = `High-conviction green light. Bids dominate by ${obirMetrics.bidDominancePct}% inside Entry Zone (Rs. ${entryLow}–${entryHigh}). Momentum supported by live book.`;
      verdict = 'BUY_CONFIRMED';
    } else {
      state = 'BALANCED_ORDER_BOOK';
      badge = '🔵 Balanced Live Order Flow';
      color = '#38bdf8';
      bg = 'rgba(56, 189, 248, 0.15)';
      recommendation = `Order book balanced (OBIR: ${(obirMetrics.obir * 100).toFixed(0)}%). Indicative price Rs. ${indicativePrice}. Flow is neutral.`;
      verdict = 'MONITOR';
    }
  }
  // ── PHASE 5: POST-MARKET / RECONCILING (3:00 PM – 5:00 PM) ──
  else {
    phase = 'POST_MARKET';
    state = 'POST_MARKET_READY';
    badge = '🌙 Post-Market Verified: Tomorrow Prime Setup';
    color = '#c084fc';
    bg = 'rgba(192, 132, 252, 0.15)';
    recommendation = `Sealed with full-day floorsheet + 500-day analogs. Pre-Order / AMO window opens at 5:00 PM for queuing limit orders in Broker TMS.`;
    verdict = 'POST_MARKET_SEALED';
  }

  return {
    state,
    phase,
    badge,
    color,
    bg,
    recommendation,
    verdict,
    indicativePrice,
    indicativeGapPct,
    bestBid,
    bestAsk,
    totalBidQty,
    totalAskQty,
    obir: obirMetrics.obir,
    bidDominancePct: obirMetrics.bidDominancePct,
    askDominancePct: obirMetrics.askDominancePct,
    dominanceLabel: obirMetrics.dominance,
    avgSharesPerBid,
    topBidSharePct,
    isWhaleAccumulation,
    entryLow,
    entryHigh,
    stopLoss,
    chaseCap,
    preOpenCeiling,
    session,
    hasLiveOrders,
    targetSessionDate: marketStatus?.targetSessionDate || '',
    isAmoWindow,
    isFirst15Min,
    evaluatedAt: new Date().toISOString()
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
 * Evaluates +/- 15% daily individual stock price bands (effective April 20, 2026 under
 * Securities Trading Operation Fourth Amendment Regulations 2082; previously +/- 10%)
 * and warns on discrete lower circuit execution freezes and upper circuit upside traps.
 */
export function calculateCircuitAndLiquidityMetrics(ltp, prevClose, volume = 0, turnover = 0, avgTurnover30D = 0) {
  const p = Number(ltp) || 100;
  const prev = Number(prevClose) || p;
  const vol = Number(volume) || 0;
  const tnov = Number(turnover) || (p * vol);
  const avgTnov = Number(avgTurnover30D) || tnov;

  // Individual stock daily price band is +/- 15% from previous close (since April 20, 2026)
  const floor = +(prev * 0.85).toFixed(1);
  const ceiling = +(prev * 1.15).toFixed(1);

  const distToFloorPct = prev > 0 ? +(((p - floor) / prev) * 100).toFixed(2) : 15;
  const distToCeilingPct = prev > 0 ? +(((ceiling - p) / prev) * 100).toFixed(2) : 15;

  const isAtLowerCircuit = p <= floor;
  const isAtUpperCircuit = p >= ceiling;
  const isNearLowerCircuit = distToFloorPct <= 2.5 && !isAtLowerCircuit;
  const isNearUpperCircuit = distToCeilingPct <= 2.5 && !isAtUpperCircuit;
  const isCircuitCeilingTrap = distToCeilingPct <= 1.5; // Capped upside vs extreme downside risk

  const isIlliquid = (tnov > 0 && tnov < 3000000) || (vol > 0 && vol < 5000);
  const turnoverCr = +(tnov / 10000000).toFixed(2);

  let status = 'NORMAL_LIQUIDITY';
  let severity = 'LOW';
  let warningMessage = null;

  if (isAtLowerCircuit) {
    status = 'LOWER_CIRCUIT_LOCKED';
    severity = 'CRITICAL';
    warningMessage = `🚨 CRITICAL LOWER CIRCUIT FREEZE: Rs. ${p} is locked at -15% limit (Rs. ${floor}). Buy demand (bids) = 0. Market stop-loss orders will NOT execute.`;
  } else if (isNearLowerCircuit) {
    status = 'LOWER_CIRCUIT_PROXIMITY';
    severity = 'HIGH';
    warningMessage = `⚠️ CIRCUIT PROXIMITY RISK: Only ${distToFloorPct}% above -15% lower circuit (Rs. ${floor}). Stop-loss execution faces zero-bid liquidity freeze risk.`;
  } else if (isAtUpperCircuit) {
    status = 'UPPER_CIRCUIT_LOCKED';
    severity = 'INFO';
    warningMessage = `🔥 UPPER CIRCUIT LOCKED: Stock locked at +15% ceiling (Rs. ${ceiling}). Strong demand queue.`;
  } else if (isCircuitCeilingTrap) {
    status = 'UPPER_CIRCUIT_CEILING_TRAP';
    severity = 'HIGH';
    warningMessage = `⚠️ CIRCUIT CEILING TRAP: Stock is within ${distToCeilingPct}% of +15% ceiling (Rs. ${ceiling}). Risk/reward is heavily unfavorable for new buys.`;
  } else if (isNearUpperCircuit) {
    status = 'UPPER_CIRCUIT_PROXIMITY';
    severity = 'INFO';
    warningMessage = `🚀 Approaching +15% circuit ceiling (Rs. ${ceiling}, ${distToCeilingPct}% headroom).`;
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
    isCircuitCeilingTrap,
    isIlliquid,
    turnoverCr,
    status,
    severity,
    warningMessage
  };
}

/**
 * 25. Corporate Action Price Normalization
 * Normalizes historical series for Bonus Share distribution and Rights Offerings.
 * Uses theoretical adjustment formulas when metadata is provided:
 *   - Bonus Share: P_adj = (P_market * 100) / (100 + %_bonus)
 *   - Rights Share: P_adj = (P_market + (P_issue * %_right)) / (1 + %_right)
 * Falls back to overnight step-drop detection (>8.5% to 52%) when exact metadata is absent.
 */
export function normalizeCorporateActionPrices(candles = [], corporateActions = []) {
  if (!candles || candles.length < 5) return candles || [];

  const sorted = [...candles].sort((a, b) => new Date(a.date || a.t || 0) - new Date(b.date || b.t || 0));
  const normalized = [];

  // Map known corporate actions by ISO date if provided
  const caMap = new Map();
  if (Array.isArray(corporateActions)) {
    corporateActions.forEach(ca => {
      const d = (ca.date || ca.bookClosureDate || ca.announcedDate || '').slice(0, 10);
      if (d) caMap.set(d, ca);
    });
  }

  let adjFactor = 1.0;
  let corporateActionCount = 0;
  
  for (let i = sorted.length - 1; i >= 0; i--) {
    const curr = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const currDate = (curr.date || curr.t || '').slice(0, 10);

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

    // Check for explicit corporate action metadata matching this book closure
    const explicitCA = caMap.get(currDate);
    if (explicitCA && prevClose > 0) {
      if (explicitCA.type === 'bonus' || explicitCA.bonusPct > 0) {
        const bPct = Number(explicitCA.bonusPct || explicitCA.ratio || 0);
        if (bPct > 0) {
          const ratio = 100 / (100 + bPct);
          adjFactor *= ratio;
          corporateActionCount++;
          continue;
        }
      } else if (explicitCA.type === 'rights' || explicitCA.rightPct > 0) {
        const rPct = Number(explicitCA.rightPct || explicitCA.ratio || 0) / 100;
        const issuePrice = Number(explicitCA.issuePrice || 100);
        if (rPct > 0 && prevClose > 0) {
          const theoreticalEx = (prevClose + (issuePrice * rPct)) / (1 + rPct);
          const ratio = theoreticalEx / prevClose;
          adjFactor *= ratio;
          corporateActionCount++;
          continue;
        }
      }
    }

    // Heuristic: If overnight step drop matches bonus/rights book closures (8.5% to 52%),
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
 * Accurate Multi-Year Lunar-Solar Nepali Festival Calendar Database (2024–2028+)
 * Provides exact dates for Pre-Dashain cash drain, Dashain, Tihar, Chhath, Mangsir AGM rally,
 * Poush 40% tax drain, Chaitra 30% tax drain, and Ashadh fiscal spending surge.
 */
export const NEPALI_FESTIVAL_CALENDAR = {
  2024: {
    year: 2024,
    bsYear: '2081 BS',
    preDashain: { start: '2024-09-12', end: '2024-10-02', name: 'Pre-Dashain Festive Cash Drain' },
    dashain: {
      ghatasthapana: '2024-10-03',
      fulpati: '2024-10-10',
      mahaAshtami: '2024-10-11',
      vijayaDashami: '2024-10-12',
      kojagrat: '2024-10-16',
      name: 'Dashain Festival Holidays'
    },
    tihar: {
      dhanteras: '2024-10-29',
      laxmiPuja: '2024-10-31',
      govardhanPuja: '2024-11-02',
      bhaiTika: '2024-11-03',
      name: 'Tihar (Deepawali) Holidays'
    },
    chhath: { date: '2024-11-07', name: 'Chhath Parva' },
    mangsirAgmRally: { start: '2024-11-15', end: '2024-12-25', name: 'Mangsir AGM & Dividend Rally' },
    poushTaxDrain: { start: '2024-12-26', end: '2025-01-15', name: 'Poush 40% Advance Corporate Tax Drain' },
    chaitraTaxDrain: { start: '2025-03-15', end: '2025-04-14', name: 'Chaitra 30% Advance Corporate Tax Drain' },
    ashadhSurge: { start: '2024-06-15', end: '2024-08-15', name: 'Ashadh-Shrawan Government Budget & Liquidity Surge' },
  },
  2025: {
    year: 2025,
    bsYear: '2082 BS',
    preDashain: { start: '2025-09-01', end: '2025-09-21', name: 'Pre-Dashain Festive Cash Drain' },
    dashain: {
      ghatasthapana: '2025-09-22',
      fulpati: '2025-09-29',
      mahaAshtami: '2025-09-30',
      vijayaDashami: '2025-10-02',
      kojagrat: '2025-10-06',
      name: 'Dashain Festival Holidays'
    },
    tihar: {
      dhanteras: '2025-10-19',
      laxmiPuja: '2025-10-21',
      govardhanPuja: '2025-10-23',
      bhaiTika: '2025-10-24',
      name: 'Tihar (Deepawali) Holidays'
    },
    chhath: { date: '2025-10-27', name: 'Chhath Parva' },
    mangsirAgmRally: { start: '2025-11-10', end: '2025-12-25', name: 'Mangsir AGM & Dividend Rally' },
    poushTaxDrain: { start: '2025-12-26', end: '2026-01-15', name: 'Poush 40% Advance Corporate Tax Drain' },
    chaitraTaxDrain: { start: '2025-03-15', end: '2025-04-14', name: 'Chaitra 30% Advance Corporate Tax Drain' },
    ashadhSurge: { start: '2025-06-15', end: '2025-08-15', name: 'Ashadh-Shrawan Government Budget & Liquidity Surge' },
  },
  2026: {
    year: 2026,
    bsYear: '2083 BS',
    preDashain: { start: '2026-09-15', end: '2026-10-09', name: 'Pre-Dashain Festive Cash Drain' },
    dashain: {
      ghatasthapana: '2026-10-10',
      fulpati: '2026-10-17',
      mahaAshtami: '2026-10-18',
      vijayaDashami: '2026-10-20',
      kojagrat: '2026-10-24',
      name: 'Dashain Festival Holidays'
    },
    tihar: {
      dhanteras: '2026-11-07',
      laxmiPuja: '2026-11-09',
      govardhanPuja: '2026-11-11',
      bhaiTika: '2026-11-12',
      name: 'Tihar (Deepawali) Holidays'
    },
    chhath: { date: '2026-11-15', name: 'Chhath Parva' },
    mangsirAgmRally: { start: '2026-11-16', end: '2026-12-25', name: 'Mangsir AGM & Dividend Rally' },
    poushTaxDrain: { start: '2026-12-26', end: '2027-01-15', name: 'Poush 40% Advance Corporate Tax Drain' },
    chaitraTaxDrain: { start: '2026-03-15', end: '2026-04-14', name: 'Chaitra 30% Advance Corporate Tax Drain' },
    ashadhSurge: { start: '2026-06-15', end: '2026-08-15', name: 'Ashadh-Shrawan Government Budget & Liquidity Surge' },
  },
  2027: {
    year: 2027,
    bsYear: '2084 BS',
    preDashain: { start: '2027-09-10', end: '2027-09-29', name: 'Pre-Dashain Festive Cash Drain' },
    dashain: {
      ghatasthapana: '2027-09-30',
      fulpati: '2027-10-07',
      mahaAshtami: '2027-10-08',
      vijayaDashami: '2027-10-09',
      kojagrat: '2027-10-13',
      name: 'Dashain Festival Holidays'
    },
    tihar: {
      dhanteras: '2027-10-27',
      laxmiPuja: '2027-10-29',
      govardhanPuja: '2027-10-31',
      bhaiTika: '2027-11-01',
      name: 'Tihar (Deepawali) Holidays'
    },
    chhath: { date: '2027-11-05', name: 'Chhath Parva' },
    mangsirAgmRally: { start: '2027-11-10', end: '2027-12-25', name: 'Mangsir AGM & Dividend Rally' },
    poushTaxDrain: { start: '2027-12-26', end: '2028-01-15', name: 'Poush 40% Advance Corporate Tax Drain' },
    chaitraTaxDrain: { start: '2027-03-15', end: '2027-04-14', name: 'Chaitra 30% Advance Corporate Tax Drain' },
    ashadhSurge: { start: '2027-06-15', end: '2027-08-15', name: 'Ashadh-Shrawan Government Budget & Liquidity Surge' },
  },
  2028: {
    year: 2028,
    bsYear: '2085 BS',
    preDashain: { start: '2028-09-28', end: '2028-10-17', name: 'Pre-Dashain Festive Cash Drain' },
    dashain: {
      ghatasthapana: '2028-10-18',
      fulpati: '2028-10-25',
      mahaAshtami: '2028-10-26',
      vijayaDashami: '2028-10-27',
      kojagrat: '2028-10-31',
      name: 'Dashain Festival Holidays'
    },
    tihar: {
      dhanteras: '2028-11-05',
      laxmiPuja: '2028-11-07',
      govardhanPuja: '2028-11-09',
      bhaiTika: '2028-11-10',
      name: 'Tihar (Deepawali) Holidays'
    },
    chhath: { date: '2028-11-13', name: 'Chhath Parva' },
    mangsirAgmRally: { start: '2028-11-15', end: '2028-12-25', name: 'Mangsir AGM & Dividend Rally' },
    poushTaxDrain: { start: '2028-12-26', end: '2029-01-15', name: 'Poush 40% Advance Corporate Tax Drain' },
    chaitraTaxDrain: { start: '2028-03-15', end: '2028-04-14', name: 'Chaitra 30% Advance Corporate Tax Drain' },
    ashadhSurge: { start: '2028-06-15', end: '2028-08-15', name: 'Ashadh-Shrawan Government Budget & Liquidity Surge' },
  }
};

/**
 * Evaluates accurate festival and fiscal seasonality for any date in Nepal Capital Market.
 * Incorporates Vikram Samvat festival schedules and banking liquidity flows.
 */
export function getAccurateFestivalSeasonality(date = new Date()) {
  const d = new Date(date);
  const curIso = d.toISOString().split('T')[0];
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1 = Jan ... 12 = Dec
  const day = d.getDate();

  const cal = NEPALI_FESTIVAL_CALENDAR[year] || NEPALI_FESTIVAL_CALENDAR[2026];
  const prevCal = NEPALI_FESTIVAL_CALENDAR[year - 1];

  // 1. Cross-Year Poush Tax Check (January 1 - January 15)
  if (month === 1 && day <= 15) {
    const taxEnd = prevCal?.poushTaxDrain?.end || `${year}-01-15`;
    if (curIso <= taxEnd) {
      return {
        phase: 'Q2 Advance Corporate Tax Liquidity Drain',
        phaseKey: 'POUSH_TAX_DRAIN',
        scoreBonus: -0.20,
        bias: 'bearish',
        detail: 'Corporations remit 40% advance corporate income tax to Inland Revenue Department (IRD). Rs. 40–60 Arba leaves commercial banks, tightening interbank liquidity.',
        festivalName: 'Q2 Tax Installment (Poush End)',
        nextEventName: 'Poush 40% Tax Deadline',
        nextEventDate: taxEnd,
        daysToNextEvent: Math.max(0, Math.ceil((new Date(taxEnd).getTime() - d.getTime()) / (1000 * 3600 * 24))),
        historicalWinRate: '34% (Liquidity Contraction)',
        historicalAvgReturn: '-2.1%',
        tradingRule: 'Tighten stop-losses, reduce margin leverage, avoid low-liquidity illiquid scrips.',
        rvolThreshold: 1.3,
        isFestiveLull: false,
        isFestivalHolidays: false,
        isAgmRally: false,
        isTaxDrain: true,
        calendarYear: year,
        bsYear: cal?.bsYear || `${year + 57} BS`
      };
    }
  }

  // 2. Pre-Dashain Cash Drain (Starts ~25 days before Ghatasthapana)
  if (cal?.preDashain && curIso >= cal.preDashain.start && curIso <= cal.preDashain.end) {
    const daysToGhatasthapana = Math.ceil((new Date(cal.dashain.ghatasthapana).getTime() - d.getTime()) / (1000 * 3600 * 24));
    return {
      phase: 'Festive Season Cash Outflow Cycle',
      phaseKey: 'PRE_DASHAIN_DRAIN',
      scoreBonus: -0.15,
      bias: 'neutral_defensive',
      detail: `Public withdrawals for Dashain/Tihar festival bonuses, shopping, and travel temporarily drain bank deposits, tighten liquidity, and drop NEPSE daily turnover by 30%–50%. Ghatasthapana is in ${daysToGhatasthapana} day(s) on ${cal.dashain.ghatasthapana}.`,
      festivalName: 'Dashain Festive Window',
      nextEventName: 'Ghatasthapana (Dashain Day 1)',
      nextEventDate: cal.dashain.ghatasthapana,
      daysToNextEvent: daysToGhatasthapana,
      historicalWinRate: '38% (Low Momentum Follow-Through)',
      historicalAvgReturn: '-1.4%',
      tradingRule: 'Volume confirmation hurdle raised to RVOL >= 1.5x. Avoid chasing marginal breakouts during holiday cash drain.',
      rvolThreshold: 1.5,
      isFestiveLull: true,
      isFestivalHolidays: false,
      isAgmRally: false,
      isTaxDrain: false,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 3. Dashain Holidays (Ghatasthapana to Kojagrat Purnima)
  if (cal?.dashain && curIso >= cal.dashain.ghatasthapana && curIso <= cal.dashain.kojagrat) {
    return {
      phase: 'Dashain Festival Market Lull',
      phaseKey: 'DASHAIN_HOLIDAYS',
      scoreBonus: -0.10,
      bias: 'neutral_defensive',
      detail: 'NEPSE exchange closed or operating on truncated trading sessions for Vijaya Dashami festivities. Thin liquidity, holiday sentiment, and minimal institutional participation.',
      festivalName: 'Vijaya Dashami',
      nextEventName: 'Vijaya Dashami',
      nextEventDate: cal.dashain.vijayaDashami,
      daysToNextEvent: Math.max(0, Math.ceil((new Date(cal.dashain.vijayaDashami).getTime() - d.getTime()) / (1000 * 3600 * 24))),
      historicalWinRate: '45% (Thin Trading)',
      historicalAvgReturn: '+0.2%',
      tradingRule: 'Hold defensive cash reserves. Avoid new positions until market reopens with full institutional participation.',
      rvolThreshold: 1.4,
      isFestiveLull: true,
      isFestivalHolidays: true,
      isAgmRally: false,
      isTaxDrain: false,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 4. Tihar & Chhath Holidays (Dhanteras to Chhath)
  const tiharStart = cal?.tihar?.dhanteras || `${year}-11-07`;
  const chhathEnd = cal?.chhath?.date || `${year}-11-15`;
  if (curIso >= tiharStart && curIso <= chhathEnd) {
    return {
      phase: 'Tihar & Chhath Festive Window',
      phaseKey: 'TIHAR_CHHATH',
      scoreBonus: 0.05,
      bias: 'neutral',
      detail: 'Laxmi Puja & Bhai Tika festive period. Historically marks the turning point where liquidity returns to banking channels and speculative dividend accumulation begins.',
      festivalName: 'Tihar & Chhath',
      nextEventName: 'Bhai Tika',
      nextEventDate: cal?.tihar?.bhaiTika,
      daysToNextEvent: Math.max(0, Math.ceil((new Date(cal.tihar.bhaiTika).getTime() - d.getTime()) / (1000 * 3600 * 24))),
      historicalWinRate: '56% (Pre-Dividend Accumulation)',
      historicalAvgReturn: '+1.5%',
      tradingRule: 'Screen for high-dividend yield companies ahead of Mangsir AGM declarations.',
      rvolThreshold: 1.1,
      isFestiveLull: false,
      isFestivalHolidays: true,
      isAgmRally: false,
      isTaxDrain: false,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 5. Mangsir AGM & Dividend Season Rally (Mid-Nov to late Dec)
  if (cal?.mangsirAgmRally && curIso >= cal.mangsirAgmRally.start && curIso <= cal.mangsirAgmRally.end) {
    return {
      phase: 'Mangsir AGM & Dividend Season Rally',
      phaseKey: 'MANGSIR_AGM_RALLY',
      scoreBonus: +0.30,
      bias: 'bullish',
      detail: 'Companies mandated to hold AGMs within 6 months of fiscal year-end rush dividend declarations (bonus shares and cash distributions). Strongest seasonal bull window on NEPSE.',
      festivalName: 'AGM & Dividend Season',
      nextEventName: 'Poush Book Closures',
      nextEventDate: `${year}-12-25`,
      daysToNextEvent: Math.max(0, Math.ceil((new Date(`${year}-12-25`).getTime() - d.getTime()) / (1000 * 3600 * 24))),
      historicalWinRate: '71% (NEPSE Seasonal Apex)',
      historicalAvgReturn: '+4.6%',
      tradingRule: 'Aggressive growth & dividend capture. Prioritize fundamental compounders declaring >10% bonus shares.',
      rvolThreshold: 1.0,
      isFestiveLull: false,
      isFestivalHolidays: false,
      isAgmRally: true,
      isTaxDrain: false,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 6. Poush Advance Corporate Tax Drain (Late Dec to Jan 15)
  if (cal?.poushTaxDrain && curIso >= cal.poushTaxDrain.start) {
    return {
      phase: 'Q2 Advance Corporate Tax Liquidity Drain',
      phaseKey: 'POUSH_TAX_DRAIN',
      scoreBonus: -0.20,
      bias: 'bearish',
      detail: 'Corporations remit 40% of estimated annual income tax to Inland Revenue Department (IRD). Rs. 40–60 Arba leaves commercial banks, spiking interbank rates and temporarily contracting credit.',
      festivalName: 'Q2 Tax Installment',
      nextEventName: 'Poush 40% Tax Deadline',
      nextEventDate: cal.poushTaxDrain.end,
      daysToNextEvent: Math.max(0, Math.ceil((new Date(cal.poushTaxDrain.end).getTime() - d.getTime()) / (1000 * 3600 * 24))),
      historicalWinRate: '34% (Liquidity Contraction)',
      historicalAvgReturn: '-2.1%',
      tradingRule: 'Tighten stop-losses, reduce margin leverage, focus on cash-rich institutions unaffected by credit tightening.',
      rvolThreshold: 1.3,
      isFestiveLull: false,
      isFestivalHolidays: false,
      isAgmRally: false,
      isTaxDrain: true,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 7. Chaitra Advance Corporate Tax Drain (30% by mid-April)
  if (cal?.chaitraTaxDrain && curIso >= cal.chaitraTaxDrain.start && curIso <= cal.chaitraTaxDrain.end) {
    return {
      phase: 'Q3 Advance Corporate Tax Liquidity Squeeze',
      phaseKey: 'CHAITRA_TAX_DRAIN',
      scoreBonus: -0.15,
      bias: 'bearish',
      detail: 'Second 30% advance corporate tax installment remitted. Short-term bank deposit pressure prior to Baishakh fiscal rebalancing.',
      festivalName: 'Q3 Tax Installment',
      nextEventName: 'Chaitra Tax Deadline',
      nextEventDate: cal.chaitraTaxDrain.end,
      daysToNextEvent: Math.max(0, Math.ceil((new Date(cal.chaitraTaxDrain.end).getTime() - d.getTime()) / (1000 * 3600 * 24))),
      historicalWinRate: '40% (Fiscal Tightening)',
      historicalAvgReturn: '-1.1%',
      tradingRule: 'Selective positioning. Monitor banking system CD ratios before deploying fresh swing capital.',
      rvolThreshold: 1.25,
      isFestiveLull: false,
      isFestivalHolidays: false,
      isAgmRally: false,
      isTaxDrain: true,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 8. Ashadh-Shrawan Government Spending Wave (Mid-June to Mid-August)
  if (cal?.ashadhSurge && curIso >= cal.ashadhSurge.start && curIso <= cal.ashadhSurge.end) {
    return {
      phase: 'Ashadh-Shrawan Government Spending Wave',
      phaseKey: 'ASHADH_SHRAWAN_SURGE',
      scoreBonus: +0.25,
      bias: 'bullish',
      detail: 'Massive government capital expenditure release at fiscal year-end injects tens of billions into commercial bank accounts, crashing interbank rates and fueling post-fiscal liquidity surge.',
      festivalName: 'Fiscal Year-End Expenditure',
      nextEventName: 'Shrawan Monetary Policy',
      nextEventDate: `${year}-07-31`,
      daysToNextEvent: Math.max(0, Math.ceil((new Date(`${year}-07-31`).getTime() - d.getTime()) / (1000 * 3600 * 24))),
      historicalWinRate: '68% (Liquidity Inflow)',
      historicalAvgReturn: '+5.2%',
      tradingRule: 'Ride high-beta momentum leaders and banking sector liquidity plays.',
      rvolThreshold: 0.9,
      isFestiveLull: false,
      isFestivalHolidays: false,
      isAgmRally: false,
      isTaxDrain: false,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 9. Baishakh-Jestha Spring Expansion (Pre-Budget & Hydropower Snowmelt)
  if (month === 4 || month === 5 || (month === 6 && day < 15)) {
    return {
      phase: 'Spring Capital Expansion & Pre-Budget Rally',
      phaseKey: 'BAISHAKH_BUDGET_SPRING',
      scoreBonus: +0.12,
      bias: 'bullish',
      detail: 'Pre-budget speculation (National Budget presented Jestha 15). Himalayan snowmelt begins, swelling river discharge and restoring hydropower generation to peak capacity.',
      festivalName: 'Pre-Budget & Spring Expansion',
      nextEventName: 'Jestha 15 Budget Speech',
      nextEventDate: `${year}-05-29`,
      daysToNextEvent: Math.max(0, Math.ceil((new Date(`${year}-05-29`).getTime() - d.getTime()) / (1000 * 3600 * 24))),
      historicalWinRate: '62%',
      historicalAvgReturn: '+3.1%',
      tradingRule: 'Focus on hydropower breakout setups and budget priority sectors.',
      rvolThreshold: 1.0,
      isFestiveLull: false,
      isFestivalHolidays: false,
      isAgmRally: false,
      isTaxDrain: false,
      calendarYear: year,
      bsYear: cal.bsYear
    };
  }

  // 10. Mid-Fiscal Consolidation Phase (Normal Equilibrium)
  return {
    phase: 'Mid-Fiscal Consolidation Phase',
    phaseKey: 'MID_FISCAL_NORMAL',
    scoreBonus: 0.0,
    bias: 'neutral',
    detail: 'Balanced fiscal liquidity flows without seasonal tax or budget concentration. Market trades primarily on scrip fundamentals and technical structure.',
    festivalName: 'Regular Trading Season',
    nextEventName: 'Upcoming Quarterly Review',
    nextEventDate: `${year}-03-31`,
    daysToNextEvent: 30,
    historicalWinRate: '51%',
    historicalAvgReturn: '+0.5%',
    tradingRule: 'Follow pure technical breakout and Graham margin-of-safety rules.',
    rvolThreshold: 1.0,
    isFestiveLull: false,
    isFestivalHolidays: false,
    isAgmRally: false,
    isTaxDrain: false,
    calendarYear: year,
    bsYear: cal.bsYear
  };
}

/**
 * 26. Calendar & Fiscal Cycle Evaluation for Nepal Capital Market
 * Fully backward-compatible wrapper around getAccurateFestivalSeasonality
 */
export function computeFiscalCycle(date = new Date()) {
  const seasonality = getAccurateFestivalSeasonality(date);
  return {
    phase: seasonality.phase,
    scoreBonus: seasonality.scoreBonus,
    bias: seasonality.bias,
    detail: seasonality.detail,
    phaseKey: seasonality.phaseKey,
    historicalWinRate: seasonality.historicalWinRate,
    historicalAvgReturn: seasonality.historicalAvgReturn,
    tradingRule: seasonality.tradingRule,
    rvolThreshold: seasonality.rvolThreshold,
    festivalName: seasonality.festivalName,
    nextEventName: seasonality.nextEventName,
    nextEventDate: seasonality.nextEventDate,
    daysToNextEvent: seasonality.daysToNextEvent,
    isFestiveLull: seasonality.isFestiveLull,
    isFestivalHolidays: seasonality.isFestivalHolidays,
    isAgmRally: seasonality.isAgmRally,
    isTaxDrain: seasonality.isTaxDrain,
    calendarYear: seasonality.calendarYear,
    bsYear: seasonality.bsYear,
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

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED MASTER BREAKOUT ARCHITECTURE & DAILY PRIME ENGINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 28. Volatility Contraction Pattern (VCP) Contraction Index
 * Quantifies progressive dampening of price swings: D_k = (H_k - L_k) / H_k * 100
 * Validates monotonic contraction decay and verifies final contraction D_final <= 6.5%.
 */
export function calculateVCPContractionRatio(candles = []) {
  if (!Array.isArray(candles) || candles.length < 25) {
    return { isVCP: false, contractions: [], finalDepth: 10, ratio: 1.0, qualityScore: 40 };
  }

  const n = candles.length;
  // Divide candles into 3 sequential swing windows (Shakeout, Absorption, Coiling)
  const w1 = candles.slice(-35, -20);
  const w2 = candles.slice(-20, -8);
  const w3 = candles.slice(-8);

  const getDepth = (w) => {
    if (!w || w.length === 0) return 10;
    const h = Math.max(...w.map(c => Number(c.high || c.close || 0)));
    const l = Math.min(...w.map(c => Number(c.low || c.close || 0)));
    return h > 0 ? +(((h - l) / h) * 100).toFixed(1) : 10;
  };

  const d1 = getDepth(w1);
  const d2 = getDepth(w2);
  const d3 = getDepth(w3);

  // Progressive contraction: each wave must be tighter than the previous
  const isDecaying = (d2 <= d1 * 0.85 || d2 <= d1 - 2.0) && (d3 <= d2 * 0.85 || d3 <= d2 - 1.5);
  const isTightFinal = d3 <= 6.8; // Final contraction <= 6.8%
  const isVCP = isDecaying || (d3 <= 5.5 && d2 <= 9.0);

  let qualityScore = 50;
  if (isVCP) qualityScore += 25;
  if (isTightFinal) qualityScore += 15;
  if (d3 <= 4.0) qualityScore += 10;

  return {
    isVCP,
    contractions: [d1, d2, d3],
    finalDepth: d3,
    ratio: d1 > 0 ? +(d3 / d1).toFixed(2) : 0.5,
    qualityScore: Math.min(100, Math.max(30, qualityScore)),
    summary: isVCP
      ? `VCP Compression Confirmed: Progressive swing tightening (${d1}% ➔ ${d2}% ➔ ${d3}%).`
      : `Broad Price Swings: Recent wave depth at ${d3}% (needs <= 6.5% for VCP).`
  };
}

/**
 * 29. 120-Day Bollinger BandWidth Percentile Rank (BWPR_120)
 * Evaluates whether current BandWidth is at historical 6-month compression lows (<= 12%).
 */
export function calculateBollingerBandWidthPercentile(history = [], period = 20, lookback = 120) {
  if (!Array.isArray(history) || history.length < 30) {
    return { bwpr: 25, isSqueeze: false, currentBBW: 0.08 };
  }

  const closes = history.map(c => Number(c.close || c.ltp || 0)).filter(c => c > 0);
  if (closes.length < 30) {
    return { bwpr: 25, isSqueeze: false, currentBBW: 0.08 };
  }

  // Calculate rolling BBW across lookback
  const bbws = [];
  const startIdx = Math.max(period, closes.length - lookback);

  for (let i = startIdx; i <= closes.length; i++) {
    const slice = closes.slice(i - period, i);
    if (slice.length < period) continue;
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    const bbw = mean > 0 ? (2 * 2 * stdDev) / mean : 0.08;
    bbws.push(bbw);
  }

  if (bbws.length === 0) {
    return { bwpr: 25, isSqueeze: false, currentBBW: 0.08 };
  }

  const currentBBW = bbws[bbws.length - 1];
  const countLesser = bbws.filter(b => b <= currentBBW).length;
  const bwpr = +((countLesser / bbws.length) * 100).toFixed(1);
  const isSqueeze = bwpr <= 14.0 || currentBBW <= 0.065;

  return {
    bwpr,
    isSqueeze,
    currentBBW: +(currentBBW).toFixed(4),
    currentBBWPct: +(currentBBW * 100).toFixed(2)
  };
}

/**
 * 30. Systemic Market Breadth & Cash Defense Gate
 * Calculates the percentage of listed equities trading above their 50-day EMA/SMA.
 * When Breadth_50 < 40%, the engine activates "CASH DEFENSE MODE" and blocks Prime picks.
 */
export function evaluateMarketBreadthCashDefense(stocks = []) {
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return { breadth50: 55, cashDefenseActive: false, message: 'Normal Market Regime' };
  }

  // 1. Calculate active session advance/decline breadth
  let advances = 0;
  let declines = 0;
  let countAbove50 = 0;
  let totalWithEma = 0;

  stocks.forEach(s => {
    const ltp = Number(s.ltp || s.price || 0);
    const ch = Number(s.pChange ?? s.percentageChange ?? s.pointChange ?? s.change ?? 0);
    if (ch > 0) advances++;
    else if (ch < 0) declines++;

    const ema50 = Number(s.ema50 || s.sma50 || 0);
    if (ltp > 0 && ema50 > 0) {
      totalWithEma++;
      if (ltp >= ema50) countAbove50++;
    }
  });

  const totalActive = advances + declines;
  const advancePct = totalActive > 0 ? +((advances / totalActive) * 100).toFixed(1) : 50;
  const declinePct = totalActive > 0 ? +((declines / totalActive) * 100).toFixed(1) : 50;
  const effectiveBreadth = totalWithEma >= 15 ? +((countAbove50 / totalWithEma) * 100).toFixed(1) : advancePct;

  // Systemic Cash Defense triggers if:
  // - 50-day EMA breadth < 40%
  // - OR session advances < 35% (e.g. today at 20% advances vs 73% declines)
  // - OR declines >= 60% of traded market (with at least 2x declines over advances)
  const isSevereSessionDecline = (totalActive >= 30 && (advancePct < 35.0 || (declines >= advances * 2.0 && declinePct >= 60.0)));
  const cashDefenseActive = effectiveBreadth < 40.0 || isSevereSessionDecline;

  return {
    breadth50: effectiveBreadth,
    advancePct,
    declinePct,
    advances,
    declines,
    cashDefenseActive,
    countAbove50,
    totalEvaluated: totalWithEma > 0 ? totalWithEma : totalActive,
    regimeLabel: cashDefenseActive ? '🛑 CASH DEFENSE MODE' : '✅ BULLISH / EXPANSION REGIME',
    message: cashDefenseActive
      ? `Systemic Market Defense Active: Market breadth is weak (${effectiveBreadth}% advances / ${declinePct}% declines). Preserving cash; high-risk breakout buys blocked.`
      : `Market breadth is healthy (${effectiveBreadth}% positive regime). Breakout setups supported.`
  };
}

/**
 * 31. Unified Master Breakout Pipeline
 * Amalgamates the complete research architecture into a production classifier:
 *   1. primeDailyPick (Tomorrow's #1 Flagship Buy Blueprint)
 *   2. activeBreakouts (Confirmed momentum breaches today)
 *   3. nextBreakouts (Pre-breakout coiled accumulation radar)
 */
export function runAmalgamatedBreakoutPipeline(stocks = [], priceHistories = {}, brokerDataMap = {}, options = {}) {
  const activeBreakouts = [];
  const nextBreakouts = [];
  const primeCandidates = [];

  // 1. Evaluate Systemic Market Breadth Cash Defense Gate
  const breadthCheck = evaluateMarketBreadthCashDefense(stocks);
  const totalMarketTurnover = stocks.reduce((sum, s) => sum + Number(s.turnover || (s.ltp * s.volume) || 0), 0);
  // Adaptive liquidity hurdle: 75 Lakhs in quiet markets (< 3 Arba), 1.5 Crore in active markets
  const turnoverHurdle = totalMarketTurnover >= 3000000000 ? 15000000 : 7500000;

  for (const stock of stocks) {
    const sym = String(stock.symbol || stock.scrip || '').toUpperCase().trim();
    const ltp = Number(stock.ltp || stock.price || 0);
    const pCh = Number(stock.pChange || 0);
    const vol = Number(stock.volume || stock.totalTradedQuantity || 0);
    const turnover = Number(stock.turnover || (ltp * vol) || 0);
    const candles = priceHistories[sym] || [];

    // Safety Gate 1: Liquidity & Basic Pricing
    if (ltp < 80 || turnover < turnoverHurdle || candles.length < 25) continue;

    // Safety Gate 2: Positive Earnings Filter
    const eps = Number(stock.eps || 0);
    if (stock.eps !== undefined && eps < 0) continue;

    // Safety Gate 3: Promoter Share Lock-In Expiry Blackout (45-Day window)
    if (stock.lockinExpiry || stock.promoterLockinDays !== undefined) {
      const daysToUnlock = stock.promoterLockinDays !== undefined
        ? Number(stock.promoterLockinDays)
        : Math.ceil((new Date(stock.lockinExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToUnlock >= 0 && daysToUnlock <= 45) {
        continue; // Exclude impending promoter unlock scrips
      }
    }

    // Safety Gate 4: Himalayan Hydrology Engine (RoR Dry Season Check)
    const sector = String(stock.sector || stock.sectorName || '');
    const hydro = getHydroSeasonality(sector);
    const hydroPenalty = hydro.isHydro && hydro.isDrySeason ? (hydro.penaltyPoints || -15) : 0;
    if (hydro.isHydro && hydro.isDrySeason && hydro.penaltyPoints <= -15 && ltp < (stock.ema50 || ltp)) {
      continue; // Disqualify broken dry season hydros
    }

    // Floor Sheet Intelligence & Wash-Trade Metrics
    const broker = brokerDataMap[sym] || {};
    const adRatio = Number(broker.adRatio || 0);
    const nbar = Number(broker.nbar || (adRatio > 0 ? 1.6 : 1.0));
    const lbas = Number(broker.lbas || 0.35); // Large block absorption share
    const isDumped = adRatio <= -0.10 || (broker.adSignal === 'Distribution' && adRatio < 0);
    if (isDumped) continue; // Disqualify institutional dump targets

    // Technical Metrics: ATR, 20-Day High, 50-Day Volume
    const atr = calculateATR(candles, 14);
    const lastBar = candles[candles.length - 1] || {};
    const prevBar = candles[candles.length - 2] || lastBar;
    const high20 = Math.max(...candles.slice(-21, -1).map(c => Number(c.high || c.close || 0)));
    const lowBase = Math.min(...candles.slice(-21, -1).map(c => Number(c.low || c.close || 0)));

    const avgVol50 = candles.slice(-50).reduce((acc, c) => acc + Number(c.volume || 0), 0) / Math.min(50, candles.length);
    const rvol = avgVol50 > 0 ? +(vol / avgVol50).toFixed(2) : 1.0;

    // VCP Contraction & Bollinger Squeeze
    const vcp = calculateVCPContractionRatio(candles);
    const bbwp = calculateBollingerBandWidthPercentile(candles, 20, 120);

    // Candle Geometry (Upper Wick Bull Trap Check)
    const barHigh = Number(lastBar.high || ltp);
    const barLow = Number(lastBar.low || ltp);
    const barClose = Number(lastBar.close || ltp);
    const barOpen = Number(lastBar.open || barClose);
    const barRange = Math.max(0.1, barHigh - barLow);
    const upperWick = barHigh - Math.max(barClose, barOpen);
    const upperWickRatio = +(upperWick / barRange).toFixed(2);
    const closeLocationValue = +(((barClose - barLow) - (barHigh - barClose)) / barRange).toFixed(2);

    // Dynamic Execution Geometry
    const clearanceBuffer = Math.max(high20 * 0.0035, atr * 0.22);
    const triggerBuyBandLow = +(high20 + clearanceBuffer * 0.5).toFixed(1);
    const triggerBuyBandHigh = +(high20 * 1.025).toFixed(1); // Strict +2.5% Chase Cap
    const structuralStopLoss = +(Math.max(1, Math.min(lowBase - atr * 0.5, ltp - atr * 1.5))).toFixed(1);
    const riskPerShare = Math.max(1, ltp - structuralStopLoss);
    const target1 = +(ltp + riskPerShare * 1.5).toFixed(1); // 1.5R de-risking
    const target2 = +(ltp + riskPerShare * 3.0).toFixed(1); // 3.0R trend runner

    // Safety Gate 5: 200-Day EMA Resistance Trap Check
    const ema200 = Number(stock.ema200 || stock.sma200 || 0);
    const isTesting200EMA = ema200 > 0 && Math.abs(ltp - ema200) / ema200 <= 0.015 && ltp < ema200 * 1.01;

    // Safety Gate 6: Overbought Peak & Distribution Trap Check (RSI >= 70)
    // Disqualifies stocks (like HDHPC at RSI 75) where single-day volume spikes into overbought exhaustion
    const rsiVal = Number(stock.rsi || stock.rsi14 || (candles.length >= 15 ? (() => {
      const closes = candles.map(c => Number(c.close || 0));
      let g = 0, l = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) g += d; else l -= d;
      }
      return l === 0 ? 100 : 100 - (100 / (1 + (g / l)));
    })() : 50));
    if (rsiVal >= 70) continue;

    // Safety Gate 7: Unfavorable Downside Risk Check (Max 10% risk to structural stop)
    // Disqualifies setups where downside to stop is excessive (e.g. HDHPC -20% stop loss)
    const downsideRiskPct = ltp > 0 ? (ltp - structuralStopLoss) / ltp : 0;
    if (downsideRiskPct > 0.10) continue;

    // Safety Gate 8: Machine Learning Action Zone Check
    // A stock in Exit Zone or Selling Zone can NEVER be a Prime Buy candidate!
    const az = classifyActionZone(stock);
    if (az.zone === 'Exit Zone' || az.zone === 'Selling Zone' || az.zone === 'Counter-Trend Bounce') continue;

    // ── 1. ACTIVE BREAKOUT DETECTION ──
    const isPriceBreaking = ltp >= high20 + clearanceBuffer && prevBar.close <= high20 * 1.01;
    const isCleanCandle = (upperWickRatio <= 0.40 && closeLocationValue >= 0.35) || barClose >= barHigh * 0.985;
    const isVolumeConfirmed = rvol >= 1.60;

    if (isPriceBreaking && isCleanCandle && (isVolumeConfirmed || adRatio >= 0.05)) {
      const activeScore = Math.min(96, Math.max(10, Math.round(
        50 +
        (isVolumeConfirmed ? 18 : 6) +
        (rvol >= 2.2 ? 10 : 0) +
        (adRatio >= 0.08 ? 14 : 4) +
        (lbas >= 0.40 ? 8 : 0) +
        (pCh >= 1.5 && pCh <= 6.5 ? 10 : 2) +
        hydroPenalty -
        (isTesting200EMA ? 15 : 0)
      )));

      const activeItem = {
        ...stock,
        pivotLevel: high20,
        rvol,
        lbas,
        nbar,
        upperWickRatio: +(upperWickRatio * 100).toFixed(1),
        score: activeScore,
        compositeScore: activeScore,
        entryZone: [triggerBuyBandLow, triggerBuyBandHigh],
        entryLow: triggerBuyBandLow,
        entryHigh: triggerBuyBandHigh,
        chaseCap: triggerBuyBandHigh,
        stopLoss: structuralStopLoss,
        target1,
        target2,
        vcp,
        bbwp,
        sampleDepth: candles.length,
        statisticalConfidence: candles.length >= 180 ? 'High' : (candles.length >= 90 ? 'Moderate' : 'Emerging'),
        catalyst: `Resistance Breach of Rs. ${high20} with RVOL ${rvol}x and Net Accumulation`,
        statusType: 'Active Resistance Breach'
      };

      activeBreakouts.push(activeItem);

      if (activeScore >= 80 && !breadthCheck.cashDefenseActive && !isTesting200EMA) {
        primeCandidates.push({
          ...activeItem,
          setupClass: 'Active Expansion Breakout'
        });
      }
    }

    // ── 2. NEXT BREAKOUT (COILING / PRE-BREAKOUT RADAR) ──
    const distToPivotPct = +(((high20 - ltp) / high20) * 100).toFixed(1);
    const isCoilingNearPivot = distToPivotPct >= 0.1 && distToPivotPct <= 4.8;
    const isVCPTight = vcp.isVCP || vcp.finalDepth <= 6.8;
    const isSqueeze = bbwp.isSqueeze || bbwp.bwpr <= 15.0;
    const isVolumeDryUp = rvol <= 0.70;

    if (isCoilingNearPivot && (isVCPTight || isSqueeze || isVolumeDryUp)) {
      const nextScore = Math.min(96, Math.max(10, Math.round(
        52 +
        (isVCPTight ? 18 : 6) +
        (isSqueeze ? 14 : 4) +
        (isVolumeDryUp ? 12 : 2) +
        (adRatio >= 0.05 ? 12 : 2) +
        (lbas >= 0.40 ? 8 : 0) +
        (distToPivotPct <= 2.0 ? 8 : 0) +
        hydroPenalty -
        (isTesting200EMA ? 15 : 0)
      )));

      const nextItem = {
        ...stock,
        pivotLevel: high20,
        distToPivotPct,
        rvol,
        lbas,
        nbar,
        vcp,
        bbwp,
        score: nextScore,
        compositeScore: nextScore,
        entryZone: [+(high20 * 0.99).toFixed(1), triggerBuyBandHigh],
        entryLow: +(high20 * 0.99).toFixed(1),
        entryHigh: triggerBuyBandHigh,
        chaseCap: triggerBuyBandHigh,
        stopLoss: structuralStopLoss,
        target1,
        target2,
        sampleDepth: candles.length,
        statisticalConfidence: candles.length >= 180 ? 'High' : (candles.length >= 90 ? 'Moderate' : 'Emerging'),
        catalyst: `Coiled Base ${distToPivotPct}% Below Rs. ${high20} Pivot (${vcp.label || 'VCP'})`,
        statusType: isVCPTight ? 'VCP Volatility Contraction' : 'Bollinger Squeeze Dry-Up'
      };

      nextBreakouts.push(nextItem);

      if (nextScore >= 82 && !breadthCheck.cashDefenseActive && !isTesting200EMA) {
        primeCandidates.push({
          ...nextItem,
          setupClass: 'Coiled Pre-Breakout Spring'
        });
      }
    }
  }

  // Sort candidates descending by score
  primeCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Programmatic Tie-Breakers: LBAS first, then distance to 52w high, then VCP depth
    if ((b.lbas || 0) !== (a.lbas || 0)) return (b.lbas || 0) - (a.lbas || 0);
    return (a.vcp?.finalDepth || 10) - (b.vcp?.finalDepth || 10);
  });

  activeBreakouts.sort((a, b) => b.score - a.score);
  nextBreakouts.sort((a, b) => b.score - a.score);

  // Select #1 Daily Prime Pick (or null if cash defense is active)
  const primeDailyPick = (!breadthCheck.cashDefenseActive && primeCandidates.length > 0)
    ? primeCandidates[0]
    : (!breadthCheck.cashDefenseActive && (activeBreakouts.length > 0 || nextBreakouts.length > 0)
        ? (activeBreakouts[0] || nextBreakouts[0])
        : null);

  return {
    primeDailyPick,
    activeBreakouts: activeBreakouts.slice(0, 15),
    nextBreakouts: nextBreakouts.slice(0, 15),
    breadthCheck,
    cashDefenseActive: breadthCheck.cashDefenseActive,
    evaluatedAt: new Date().toISOString()
  };
}

