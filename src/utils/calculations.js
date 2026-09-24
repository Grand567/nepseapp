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

/**
 * Formats a number to South Asian (Indian/Nepali) numbering system (Lakh/Crore)
 */
export function formatSouthAsian(number) {
  if (number === null || number === undefined || isNaN(number)) return "0.00";
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(number);
}

/**
 * Adjusts holdings after a Bonus Share distribution
 * @param {number} units 
 * @param {number} wacc 
 * @param {number} bonusPercent 
 */
export function adjustForBonusShare(units, wacc, bonusPercent) {
  const newUnits = units * (1 + (bonusPercent / 100));
  const newWacc = (units * wacc) / newUnits;
  return { newUnits: Number(newUnits.toFixed(2)), newWacc: Number(newWacc.toFixed(2)) };
}

/**
 * Adjusts holdings after a Right Share issuance
 * @param {number} units 
 * @param {number} wacc 
 * @param {number} rightRatio - E.g. 1:0.5 is 0.5
 * @param {number} subscriptionPrice - Usually 100
 */
export function adjustForRightShare(units, wacc, rightRatio, subscriptionPrice = 100) {
  const addedUnits = units * rightRatio;
  const newUnits = units + addedUnits;
  const newWacc = ((units * wacc) + (addedUnits * subscriptionPrice)) / newUnits;
  return { newUnits: Number(newUnits.toFixed(2)), newWacc: Number(newWacc.toFixed(2)) };
}

/**
 * Adjusts holdings and price after a simultaneous Bonus and Right Share distribution
 * Official NEPSE Formula: P_adj = (P_cum + (R * S)) / (1 + B + R)
 * @param {number} units - Pre-book closure units
 * @param {number} wacc - Pre-book closure WACC
 * @param {number} cumPrice - Last traded price before book closure (P_cum)
 * @param {number} bonusPercent - Bonus % e.g. 10 for 10%
 * @param {number} rightPercent - Right % e.g. 50 for 50% or 1:0.5
 * @param {number} subscriptionPrice - Par value, default 100
 */
export function adjustSimultaneousBonusAndRight(units, wacc, cumPrice, bonusPercent = 0, rightPercent = 0, subscriptionPrice = 100) {
  const bRatio = (Number(bonusPercent) || 0) / 100;
  const rRatio = (Number(rightPercent) || 0) / 100;
  const sPrice = Number(subscriptionPrice) || 100;
  const pCum = Number(cumPrice) || 0;
  const u = Number(units) || 0;
  const w = Number(wacc) || 0;

  const denominator = 1 + bRatio + rRatio;
  const adjustedPrice = denominator > 0 ? (pCum + (rRatio * sPrice)) / denominator : pCum;

  const bonusUnits = u * bRatio;
  const rightUnits = u * rRatio;
  const totalNewUnits = u + bonusUnits + rightUnits;

  const rightSubscriptionCost = rightUnits * sPrice;
  const totalCostBasis = (u * w) + rightSubscriptionCost;
  const newWacc = totalNewUnits > 0 ? totalCostBasis / totalNewUnits : w;

  return {
    adjustedPrice: Number(adjustedPrice.toFixed(2)),
    bonusUnits: Number(bonusUnits.toFixed(2)),
    rightUnits: Number(rightUnits.toFixed(2)),
    totalNewUnits: Number(totalNewUnits.toFixed(2)),
    rightSubscriptionCost: Number(rightSubscriptionCost.toFixed(2)),
    newWacc: Number(newWacc.toFixed(2))
  };
}

/**
 * Philip Fisher Bonus Dilution & Sustainability Auditor
 * Evaluates whether earnings power can sustain the expanded post-bonus equity base.
 * @param {number} currentEps - Trailing EPS
 * @param {number} bonusPercent - Declared bonus %
 * @param {number} pe - Current P/E ratio
 */
export function auditBonusDilution(currentEps, bonusPercent, pe = 0) {
  const eps = Number(currentEps) || 0;
  const b = (Number(bonusPercent) || 0) / 100;

  if (eps <= 0 || b <= 0) {
    return {
      postBonusEps: eps,
      dilutionPct: 0,
      riskLevel: 'Neutral',
      message: 'Zero or negative EPS / No bonus dividend declared.'
    };
  }

  const postBonusEps = Number((eps / (1 + b)).toFixed(2));
  const dilutionPct = Number(((b / (1 + b)) * 100).toFixed(1));

  let riskLevel = 'Low';
  let message = 'Earning capacity remains healthy post-distribution.';

  if (postBonusEps < 12 || (pe > 35 && dilutionPct > 20)) {
    riskLevel = 'High';
    message = `Severe dilution risk: Post-bonus EPS drops to Rs. ${postBonusEps}. High risk of dividend halving next fiscal year.`;
  } else if (postBonusEps < 18 || dilutionPct > 15) {
    riskLevel = 'Moderate';
    message = `Moderate dilution: Post-bonus EPS contracts by -${dilutionPct}%. Requires sustained net profit growth to maintain dividend yield.`;
  }

  return {
    postBonusEps,
    dilutionPct,
    riskLevel,
    message
  };
}

/**
 * Calculates Dividend Yield based on Cash Dividend and LTP
 */
export function calculateDividendYield(cashDivPerShare, ltp) {
  if (!ltp || ltp <= 0) return 0;
  return Number(((cashDivPerShare / ltp) * 100).toFixed(2));
}

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
    costPerShare: quantity > 0 ? totalAmount / quantity : 0
  };
}

/**
 * Calculates the complete sell transaction details, including Capital Gains Tax (CGT).
 * @param {number} quantity - Number of shares
 * @param {number} sellPrice - Selling price per share
 * @param {number} buyPriceWacc - Purchase price per share (WACC)
 * @param {string} holdingType - 'short' (<=365 days), 'long' (>365 days), or 'institutional'
 */
export function calculateSellDetails(quantity, sellPrice, buyPriceWacc, holdingTypeOrPurchaseDate = 'short', sellDate = new Date()) {
  const sellValue = quantity * sellPrice;
  const commission = calculateBrokerCommission(sellValue);
  const sebonFee = calculateSebonFee(sellValue);
  const dpFee = DP_CHARGE;
  
  // Total acquisition cost (based on WACC)
  const totalBuyingCost = quantity * buyPriceWacc;
  
  // Base for CGT calculation
  // Profit = Selling Value - Buying Cost - Selling Broker Commission - Selling SEBON Fee - DP Fee
  const netProfitBase = sellValue - totalBuyingCost - commission - sebonFee - dpFee;
  
  let isLongTerm = false;
  let isInstitutional = false;
  
  if (holdingTypeOrPurchaseDate === 'long') {
    isLongTerm = true;
  } else if (holdingTypeOrPurchaseDate === 'institutional') {
    isInstitutional = true;
  } else if (holdingTypeOrPurchaseDate === 'short') {
    isLongTerm = false;
  } else {
    try {
      const pDate = new Date(holdingTypeOrPurchaseDate);
      const sDate = sellDate ? new Date(sellDate) : new Date();
      const diffTime = Math.abs(sDate - pDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      isLongTerm = diffDays > 365;
    } catch(e) {
      isLongTerm = false;
    }
  }

  // Capital Gains Tax (CGT) per SEBON & Nepal Income Tax Act (Section 95Ka):
  // Individual Short-Term (<= 365 days): 7.5% (Final Withholding Tax)
  // Individual Long-Term (> 365 days): 5.0% (Final Withholding Tax)
  // Institutional / Corporate: 10.0%
  let cgtRate = 0.075; // Default short-term individual (7.5%)
  if (isInstitutional) cgtRate = 0.10;
  else if (isLongTerm) cgtRate = 0.05;

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
    isFinalTax: true,
    totalExpenses,
    netReceivable,
    netProfitLoss,
    roi: totalBuyingCost > 0 ? (netProfitLoss / totalBuyingCost) * 100 : 0
  };
}

/**
 * Calculates Weighted Average Cost of Capital (WACC) for multiple transactions
 * with full inclusion of broker commission tiers, SEBON fee, DP fee, and corporate actions.
 * @param {Array<{ quantity: number, price: number }>} buyTransactions
 * @param {Array<{ type: 'bonus'|'right', bonusPercent?: number, rightRatio?: number, subscriptionPrice?: number }>} [corporateActions=[]]
 */
export function calculateWacc(buyTransactions, corporateActions = []) {
  if (!Array.isArray(buyTransactions) || buyTransactions.length === 0) {
    return { totalQuantity: 0, totalCost: 0, wacc: 0 };
  }
  let totalQty = 0;
  let totalCost = 0;

  buyTransactions.forEach(tx => {
    const qty = Number(tx.quantity || tx.units || 0);
    const price = Number(tx.price || tx.rate || 0);
    if (qty <= 0) return;
    const buyDetails = calculateBuyDetails(qty, price);
    totalQty += qty;
    totalCost += buyDetails.totalAmount; // includes broker commission, sebon (0.015%), dp (Rs 25)
  });

  // Apply corporate actions dynamically (bonus shares, right shares adjustments)
  if (Array.isArray(corporateActions) && corporateActions.length > 0) {
    corporateActions.forEach(ca => {
      if (ca.type === 'bonus' && Number(ca.bonusPercent) > 0) {
        const bonusUnits = totalQty * (Number(ca.bonusPercent) / 100);
        totalQty += bonusUnits;
        // Total cost basis remains identical; per-unit WACC dilutes
      } else if (ca.type === 'right' && Number(ca.rightRatio) > 0) {
        const subPrice = Number(ca.subscriptionPrice) || 100;
        const rightUnits = totalQty * Number(ca.rightRatio);
        totalQty += rightUnits;
        totalCost += (rightUnits * subPrice); // Added cash subscription outlay
      }
    });
  }

  return {
    totalQuantity: Math.round(totalQty),
    totalCost: +totalCost.toFixed(2),
    wacc: totalQty > 0 ? +(totalCost / totalQty).toFixed(2) : 0
  };
}

/**
 * Dynamically computes IPO Allotment Probability under SEBON 10-Kitta Rule.
 * Official SEBON Securities Issue and Allotment Guidelines:
 * - General public quota is divided into 10-share (10-kitta) lots.
 * - Total possible allottees = Math.floor(generalPublicUnits / 10).
 * - If oversubscription times <= 1.0: Guaranteed allotment (100% chance).
 * - If oversubscription times > 1.0: Lottery system applies.
 *   Probability = (Total Eligible Allottees / Total Applicants) * 100.
 *
 * @param {Object} params
 * @param {number} params.generalPublicUnits - Total units allocated to general public
 * @param {number} [params.totalApplicants=0] - Total verified applicant count
 * @param {number} [params.oversubscriptionTimes=0] - Subscription multiple (e.g. 5.5x)
 * @param {number} [params.appliedKitta=10] - Applied kitta (default 10)
 * @returns {Object}
 */
export function calculateIpoAllotmentProbability({
  generalPublicUnits = 0,
  totalApplicants = 0,
  oversubscriptionTimes = 0,
  appliedKitta = 10
}) {
  const units = Number(generalPublicUnits) || 0;
  let applicants = Number(totalApplicants) || 0;
  let times = Number(oversubscriptionTimes) || 0;

  const eligibleAllottees = units > 0 ? Math.floor(units / 10) : 0;

  if (times <= 0 && applicants > 0 && units > 0) {
    times = +((applicants * 10) / units).toFixed(2);
  } else if (applicants <= 0 && times > 0 && eligibleAllottees > 0) {
    applicants = Math.round(eligibleAllottees * times);
  }

  if (eligibleAllottees <= 0) {
    return {
      probabilityPct: null,
      eligibleAllottees: 0,
      totalApplicants: applicants,
      oversubscriptionTimes: times,
      isGuaranteed: false,
      status: 'insufficient_data',
      formula: 'General public issue size not disclosed',
      statusText: 'Pipeline / Pending SEBON Approval'
    };
  }

  // Undersubscribed or fully subscribed: 100% guaranteed 10 kitta
  if (times > 0 && times <= 1.0) {
    return {
      probabilityPct: 100.0,
      eligibleAllottees,
      totalApplicants: applicants,
      oversubscriptionTimes: times,
      isGuaranteed: true,
      status: 'guaranteed',
      allotmentType: 'guaranteed',
      formula: '10-kitta allotment guaranteed (Oversubscription <= 1.0x)',
      statusText: '100% Guaranteed Allotment (10+ Kitta)',
      explanation: '100% Guaranteed Allotment (10+ Kitta under SEBON rules)'
    };
  }

  // Oversubscribed lottery
  let prob = 100.0;
  if (times > 1.0) {
    prob = Math.min(100.0, Math.max(0.01, +(100 / times).toFixed(2)));
  } else if (applicants > 0 && eligibleAllottees > 0) {
    prob = Math.min(100.0, Math.max(0.01, +((eligibleAllottees / applicants) * 100).toFixed(2)));
  }

  return {
    probabilityPct: prob,
    eligibleAllottees,
    totalApplicants: applicants,
    oversubscriptionTimes: times,
    isGuaranteed: prob >= 100.0,
    status: prob >= 100.0 ? 'guaranteed' : 'lottery',
    allotmentType: prob >= 100.0 ? 'guaranteed' : 'lottery',
    formula: `Lottery: ${eligibleAllottees.toLocaleString()} winners among ${applicants ? applicants.toLocaleString() : (times + 'x')} applicants`,
    statusText: `${prob}% Mathematical Probability (${eligibleAllottees.toLocaleString()} Allottees / ${times}x Subscribed)`,
    explanation: `${prob}% Mathematical Probability under SEBON 10-Kitta Lottery Rule`
  };
}

/**
 * Parses copied trade tables or CSV exports from NEPSE Broker TMS (e.g. Broker 58, 45, etc.)
 * Extracts Buy transactions, groups by symbol, and calculates authentic WACC with commissions.
 *
 * @param {string} rawText - Raw text or CSV copied/exported from TMS
 * @returns {object} { success: boolean, count: number, holdings: { [symbol]: { symbol, wacc, totalQuantity, totalCost, source } }, error?: string }
 */
export function parseBrokerTradeBook(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, count: 0, holdings: {}, error: 'No trade book text provided.' };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { success: false, count: 0, holdings: {}, error: 'Empty content.' };
  }

  // Detect delimiter (tab, comma, semicolon, or pipe)
  const firstLine = lines[0];
  let delimiter = '\t';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(',')) delimiter = ',';
  else if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('|')) delimiter = '|';
  else delimiter = /\s+/;

  const parsedRows = lines.map(line => {
    if (delimiter instanceof RegExp) {
      return line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    }
    return line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
  });

  // Find header line if any
  let headerIndex = -1;
  let colSymbol = -1;
  let colQty = -1;
  let colRate = -1;
  let colType = -1;

  for (let i = 0; i < Math.min(parsedRows.length, 5); i++) {
    const row = parsedRows[i];
    row.forEach((cell, idx) => {
      const c = String(cell || '').toLowerCase().trim();
      if (colSymbol === -1 && (c.includes('symbol') || c.includes('scrip') || c.includes('script') || c === 'stock' || c === 'company')) {
        colSymbol = idx;
      }
      if (colQty === -1 && (c.includes('qty') || c.includes('quantity') || c.includes('units') || c.includes('kitta') || c.includes('vol') || c === 'shares')) {
        colQty = idx;
      }
      if (colRate === -1 && (c.includes('rate') || c.includes('price') || c.includes('cost') || c.includes('trade price') || c.includes('unit price'))) {
        colRate = idx;
      }
      if (colType === -1 && (c.includes('side') || c.includes('type') || c.includes('action') || c.includes('buy/sell') || c.includes('b/s') || c.includes('order type'))) {
        colType = idx;
      }
    });
    if (colSymbol !== -1 || (colQty !== -1 && colRate !== -1)) {
      headerIndex = i;
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;
  const buyTransactionsByScrip = {};

  for (let i = startRow; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (!row || row.length < 2) continue;

    let symbol = '';
    let qty = 0;
    let rate = 0;
    let isBuy = true;

    if (colSymbol !== -1 && colQty !== -1 && colRate !== -1) {
      symbol = String(row[colSymbol] || '').toUpperCase().trim();
      qty = parseFloat(String(row[colQty] || '').replace(/,/g, '')) || 0;
      rate = parseFloat(String(row[colRate] || '').replace(/,/g, '')) || 0;
      if (colType !== -1) {
        const typeStr = String(row[colType] || '').toUpperCase();
        if (typeStr.includes('SELL') || typeStr === 'S') isBuy = false;
      }
    } else {
      // Heuristic fallback for unstructured lines:
      for (const token of row) {
        const clean = token.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (/^[A-Z]{2,8}$/.test(clean) && !['BUY', 'SELL', 'TOTAL', 'DATE', 'PRICE', 'QTY', 'RATE', 'CASH', 'NRB', 'NEPSE'].includes(clean)) {
          if (!symbol) symbol = clean;
        }
        if (token.toUpperCase().includes('SELL')) isBuy = false;
      }
      const nums = row
        .map(t => parseFloat(String(t).replace(/,/g, '')))
        .filter(n => !isNaN(n) && n > 0);

      if (nums.length >= 2) {
        if (nums[0] % 1 === 0 && nums[0] >= 10 && nums[1] > 10) {
          qty = nums[0];
          rate = nums[1];
        } else if (nums[1] % 1 === 0 && nums[1] >= 10 && nums[0] > 10) {
          qty = nums[1];
          rate = nums[0];
        } else {
          qty = nums[0];
          rate = nums[1];
        }
      }
    }

    if (symbol && isBuy && qty > 0 && rate > 0) {
      if (!buyTransactionsByScrip[symbol]) {
        buyTransactionsByScrip[symbol] = [];
      }
      buyTransactionsByScrip[symbol].push({ quantity: qty, price: rate });
    }
  }

  const holdings = {};
  let totalParsed = 0;

  for (const [sym, txs] of Object.entries(buyTransactionsByScrip)) {
    const waccResult = calculateWacc(txs);
    if (waccResult.totalQuantity > 0 && waccResult.wacc > 0) {
      holdings[sym] = {
        symbol: sym,
        wacc: Number(waccResult.wacc.toFixed(2)),
        totalQuantity: waccResult.totalQuantity,
        totalCost: Number(waccResult.totalCost.toFixed(2)),
        source: 'BROKER_TMS',
        transactionsCount: txs.length
      };
      totalParsed++;
    }
  }

  if (totalParsed === 0) {
    return {
      success: false,
      count: 0,
      holdings: {},
      error: 'Could not detect valid stock buy transactions. Ensure columns include Symbol, Quantity, and Rate/Price.'
    };
  }

  return {
    success: true,
    count: totalParsed,
    holdings,
    message: `Successfully parsed ${totalParsed} scrips from TMS Trade Book.`
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
 * Scoped by accountId when provided so multiple accounts holding the same stock don't collide.
 */
export function getCustomWaccMap(userId = 'local', accountId = '') {
  try {
    if (accountId) {
      const cleanAccId = String(accountId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const accRaw = localStorage.getItem(`nepse_hub_${userId}_acc_${cleanAccId}_custom_wacc_map`);
      return accRaw ? (JSON.parse(accRaw) || {}) : {};
    }
    const globalRaw = localStorage.getItem(`nepse_hub_${userId}_custom_wacc_map`) || localStorage.getItem('nepse_hub_custom_wacc_map');
    return globalRaw ? (JSON.parse(globalRaw) || {}) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Safely saves data to localStorage, catching QuotaExceededError and automatically
 * purging non-critical caches (chart history, news, prime pick cache) to prevent crashes.
 */
export function safeStorageSetItem(key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    localStorage.setItem(key, str);
    return true;
  } catch (err) {
    console.warn(`[SafeStorage] Quota exceeded for '${key}'. Purging dispensable caches...`);
    try {
      const expendable = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.includes('cache') ||
          k.includes('chart') ||
          k.includes('history') ||
          k.includes('news') ||
          k.startsWith('temp_') ||
          k === 'prime_pick_plan_cache' ||
          k === 'nepse_paper_orders'
        ) {
          expendable.push(k);
        }
      }
      expendable.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      localStorage.setItem(key, str);
      return true;
    } catch (innerErr) {
      console.error(`[SafeStorage Critical] Failed setting '${key}' even after cache eviction:`, innerErr);
      return false;
    }
  }
}

/**
 * Strips a holding object down to essential storage attributes, eliminating
 * volatile UI fields (signals, advice, raw nested CDSC payloads) to prevent quota blowups.
 */
export function stripHoldingForStorage(h) {
  if (!h || typeof h !== 'object') return null;
  const symbol = String(h.symbol || h.script || h.scrip || '').trim().toUpperCase();
  if (!symbol) return null;
  return {
    symbol,
    name: String(h.name || h.scriptDesc || h.companyName || symbol).trim(),
    units: Number(h.units || h.currentBalance || h.totalUnits || 0),
    wacc: Number(Number(h.wacc || 100).toFixed(2)),
    waccSource: h.waccSource || 'FALLBACK_BASE_PRICE',
    isCustomWacc: Boolean(h.isCustomWacc),
    currentLtp: Number(h.currentLtp || h.lastTransactionPrice || 0),
    prevClose: Number(h.prevClose || h.previousClosingPrice || 0),
    valueAsOfLTP: Number(h.valueAsOfLTP || 0),
    valueAsOfPrevClose: Number(h.valueAsOfPrevClose || 0),
    freeBalance: Number(h.freeBalance ?? h.units ?? 0),
    frozenBalance: Number(h.frozenBalance || h.freezeBalance || 0)
  };
}

/**
 * Saves a custom secondary market WACC map to localStorage
 * Scoped by accountId when provided.
 */
export function saveCustomWaccMap(waccMap, userId = 'local', accountId = '') {
  try {
    if (accountId) {
      const cleanAccId = String(accountId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const key = `nepse_hub_${userId}_acc_${cleanAccId}_custom_wacc_map`;
      safeStorageSetItem(key, waccMap);
    } else {
      const key = `nepse_hub_${userId}_custom_wacc_map`;
      safeStorageSetItem(key, waccMap);
      safeStorageSetItem('nepse_hub_custom_wacc_map', waccMap);
    }
  } catch (e) {
    console.error("Failed to save custom WACC map:", e);
  }
}

/**
 * Updates or sets WACC for a specific symbol, optionally scoped to a specific Demat account
 */
export function setScripCustomWacc(symbol, wacc, userId = 'local', accountId = '') {
  const map = getCustomWaccMap(userId, accountId);
  const sym = String(symbol || '').trim().toUpperCase();
  if (sym && Number(wacc) > 0) {
    map[sym] = Number(Number(wacc).toFixed(2));
    saveCustomWaccMap(map, userId, accountId);
  }
  return map;
}

/**
 * Merges discovered WACC rates from CDSC into user's custom WACC map, optionally scoped to account
 */
export function applyDiscoveredWaccMap(discoveredMap = {}, userId = 'local', accountId = '') {
  if (!discoveredMap || typeof discoveredMap !== 'object') return getCustomWaccMap(userId, accountId);
  const currentMap = getCustomWaccMap(userId, accountId);
  let updated = false;

  for (const [sym, data] of Object.entries(discoveredMap)) {
    const cleanSym = String(sym || '').trim().toUpperCase();
    const rate = typeof data === 'object' ? Number(data.wacc) : Number(data);
    if (cleanSym && rate > 0) {
      currentMap[cleanSym] = Number(rate.toFixed(2));
      updated = true;
    }
  }

  if (updated) {
    saveCustomWaccMap(currentMap, userId, accountId);
  }
  return currentMap;
}

/**
 * Evaluates quantitative action signals (Breakout, Book Profit, Stop Loss, Hold)
 * for a portfolio holding based on cost basis, live market metrics, and technical setup.
 */
export function classifyHoldingActionSignal(holding, marketStock = null, plan = null) {
  if (!holding) return null;

  const wacc = Number(holding.wacc || 0);
  const currentPrice = Number(holding.currentPrice || holding.currentLtp || marketStock?.ltp || 0);
  const pChange = Number(marketStock?.pChange || marketStock?.percentageChange || 0);
  const rvol = Number(
    marketStock?.rvol || 
    marketStock?.volumeSurgeRatio || 
    (marketStock?.volume && marketStock?.avgVolume ? (marketStock.volume / marketStock.avgVolume) : 
    (marketStock?.volume && marketStock?.averageVolume ? (marketStock.volume / marketStock.averageVolume) : 1))
  );
  const rsi = Number(marketStock?.rsi || (50 + Math.max(-25, Math.min(25, (pChange * 3.5)))));

  const gainPct = wacc > 0 && currentPrice > 0 
    ? ((currentPrice - wacc) / wacc) * 100 
    : Number(holding.plPercent || 0);

  // 1. Target 2 Super Gain (Gain >= 25% or above Target 2)
  if (gainPct >= 25.0 || (plan?.levels?.target2?.price && currentPrice >= Number(plan.levels.target2.price))) {
    return {
      type: 'SUPER_GAIN',
      category: 'profit',
      label: 'TARGET 2 REACHED',
      badge: `🏆 Super Gain (+${gainPct.toFixed(1)}%)`,
      action: 'Secure 75% Profit',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.35)',
      icon: 'trophy',
      advice: 'Target 2 reached! Take 75% profit off the table and let the remaining 25% ride with a trailing stop.'
    };
  }

  // 2. Target 1 Book Profit (Gain >= 12% or above Target 1)
  if (gainPct >= 12.0 || (plan?.levels?.target1?.price && currentPrice >= Number(plan.levels.target1.price))) {
    return {
      type: 'BOOK_PROFIT',
      category: 'profit',
      label: 'BOOK 50% PROFIT',
      badge: `🎯 Book Profit (+${gainPct.toFixed(1)}%)`,
      action: 'Sell 50% & Trail Stop',
      color: '#34d399',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.3)',
      icon: 'target',
      advice: 'Zero-Loss Rule: Sell 50% here to lock in solid alpha, then trail your stop loss to your entry price.'
    };
  }

  // 3. Stop Loss Violation (Loss >= 8% or below Entry/Exit plan Stop Loss)
  if (gainPct <= -8.0 || (plan?.levels?.stopLoss?.price && currentPrice <= Number(plan.levels.stopLoss.price))) {
    return {
      type: 'STOP_LOSS',
      category: 'risk',
      label: 'STOP LOSS RISK',
      badge: `🛑 Stop Loss (${gainPct.toFixed(1)}%)`,
      action: 'Capital Defense Exit',
      color: '#f43f5e',
      bg: 'rgba(244, 63, 94, 0.15)',
      border: 'rgba(244, 63, 94, 0.35)',
      icon: 'shield-alert',
      advice: 'Downside risk limit breached. Cut loss or hedge immediately to preserve capital and prevent compounding drawdown.'
    };
  }

  // 4. Heavy Selling Pressure Warning
  if (gainPct < -3.0 && pChange <= -3.5) {
    return {
      type: 'DEFENSE_ALERT',
      category: 'risk',
      label: 'DEFENSE ALERT',
      badge: `⚠️ Selling Pressure (${pChange.toFixed(1)}%)`,
      action: 'Tighten Stop Loss',
      color: '#fb7185',
      bg: 'rgba(251, 113, 133, 0.12)',
      border: 'rgba(251, 113, 133, 0.3)',
      icon: 'alert-triangle',
      advice: 'Heavy distribution observed today. Tighten your stop loss to protect against gap-downs.'
    };
  }

  // 5. Breakout Volume Surge (RVOL >= 1.5x and Price >= +2.0%)
  if (rvol >= 1.5 && pChange >= 2.0) {
    return {
      type: 'BREAKOUT',
      category: 'opportunity',
      label: 'BREAKOUT SURGE',
      badge: `🚀 Breakout (${rvol.toFixed(1)}x Vol)`,
      action: 'Opportunity to Add',
      color: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.35)',
      icon: 'flame',
      advice: 'High institutional buying surge detected with RVOL > 1.5x. Good momentum candidate to scale in.'
    };
  }

  // 6. Upward Accumulation Setup (Healthy RSI and Positive Trend)
  if (rsi >= 55 && rsi <= 68 && pChange > 0) {
    return {
      type: 'ACCUMULATE',
      category: 'opportunity',
      label: 'ACCUMULATE',
      badge: '🟢 Accumulate',
      action: 'Buy on Pullback',
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.12)',
      border: 'rgba(56, 189, 248, 0.3)',
      icon: 'trending-up',
      advice: 'Constructive bullish structure. Quality consolidation setup suitable for gradual accumulation.'
    };
  }

  // 7. Profitable Position Trend Intact (Hold & Ride)
  if (gainPct > 0) {
    return {
      type: 'HOLD_RIDE',
      category: 'hold',
      label: 'HOLD & RIDE',
      badge: `🛡️ Trend Intact (+${gainPct.toFixed(1)}%)`,
      action: 'Ride Trend',
      color: '#60a5fa',
      bg: 'rgba(96, 165, 250, 0.12)',
      border: 'rgba(96, 165, 250, 0.3)',
      icon: 'shield-check',
      advice: 'Position is green and trading healthily above cost. Continue holding with an upward trailing stop.'
    };
  }

  // 8. Normal Consolidation / Rangebound
  return {
    type: 'HOLD_WAIT',
    category: 'hold',
    label: 'HOLD / WAIT',
    badge: '⏸️ Hold & Watch',
    action: 'Watch Support',
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.1)',
    border: 'rgba(148, 163, 184, 0.25)',
    icon: 'clock',
    advice: 'Price consolidating within normal volatility bounds. Maintain risk discipline.'
  };
}

/**
 * Sanitizes and repairs MeroShare holdings records with full CDSC field compatibility
 * and preserves user's secondary market custom WACC rates and CDSC origin tiers.
 * Scoped by accountId when provided.
 */
export function sanitizeMeroShareHoldings(holdings = [], userId = 'local', accountId = '') {
  if (!Array.isArray(holdings)) return [];
  const customMap = getCustomWaccMap(userId, accountId);

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
    const currentMarketValue = valueAsOfLTP > 0 ? valueAsOfLTP : (units * currentLtp);

    // Custom secondary market WACC priority & origin classification:
    let wacc = base;
    let waccSource = 'FALLBACK_BASE_PRICE';

    const customEntry = customMap[symbol];
    const customRate = (customEntry && typeof customEntry === 'object') ? Number(customEntry.wacc) : Number(customEntry);
    const customSource = (customEntry && typeof customEntry === 'object' && customEntry.source) ? customEntry.source : 'CUSTOM_USER_SET';

    if (customRate > 0) {
      wacc = customRate;
      waccSource = customSource;
    } else if (h.waccSource === 'CDSC_MY_HOLDING_DECLARED' || h.source === 'CDSC_MY_HOLDING_DECLARED') {
      wacc = Number(h.wacc || h.purchasePrice || base);
      waccSource = 'CDSC_MY_HOLDING_DECLARED';
    } else if (h.waccSource === 'BROKER_TMS' || h.source === 'BROKER_TMS') {
      wacc = Number(h.wacc || h.purchasePrice || base);
      waccSource = 'BROKER_TMS';
    } else if (h.waccSource && String(h.waccSource).startsWith('ESTIMATED_')) {
      wacc = Number(h.wacc || base);
      waccSource = h.waccSource;
    } else if (h.waccSource === 'CDSC_PURCHASE_SOURCE_UNCONFIRMED' || h.source === 'CDSC_PURCHASE_SOURCE_UNCONFIRMED') {
      wacc = Number(h.wacc || h.purchasePrice || base);
      waccSource = 'CDSC_PURCHASE_SOURCE_UNCONFIRMED';
    } else if (h.isCustomWacc && Number(h.wacc) > 0) {
      wacc = Number(h.wacc);
      waccSource = 'CUSTOM_USER_SET';
    } else if (h.isIPO || h.isAllotted || h.waccSource === 'IPO_ALLOTMENT') {
      wacc = base;
      waccSource = 'IPO_ALLOTMENT';
    } else if (h.wacc && Number(h.wacc) > 0 && Number(h.wacc) !== 100) {
      wacc = Number(h.wacc);
      waccSource = 'CUSTOM_USER_SET';
    } else if (h.purchasePrice && Number(h.purchasePrice) > 0 && Number(h.purchasePrice) !== 100) {
      wacc = Number(h.purchasePrice);
      waccSource = 'CUSTOM_USER_SET';
    } else {
      // If base is 10 (Mutual fund) or 1000 (Debenture)
      if (base === 10) waccSource = 'NAV_PAR_FUND';
      else if (base === 1000) waccSource = 'PAR_VALUE_DEB';
      else waccSource = 'FALLBACK_BASE_PRICE';
    }

    const totalInvestment = Number((units * wacc).toFixed(2));
    const profitLoss = Number((currentMarketValue - totalInvestment).toFixed(2));
    const plPercent = totalInvestment > 0 ? Number(((profitLoss / totalInvestment) * 100).toFixed(2)) : 0;

    return {
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
      currentMarketValue,
      totalInvestment,
      profitLoss,
      plPercent,
      wacc: Number(wacc.toFixed(2)),
      waccSource,
      isCustomWacc: Boolean(waccSource !== 'FALLBACK_BASE_PRICE')
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
} from './quantEngine.js';

export function getPeerStocks(currentStock, allStocks = []) {
  if (!currentStock || !Array.isArray(allStocks) || allStocks.length === 0) return [];
  const sym = currentStock.symbol || '';
  const sector = currentStock.sector || '';
  const ltp = Number(currentStock.ltp || 0);

  const sameSector = allStocks.filter(s => s && s.symbol !== sym && s.sector === sector);
  if (sameSector.length >= 3) return sameSector.slice(0, 5);
  return allStocks
    .filter(s => s && s.symbol !== sym)
    .sort((a, b) => Math.abs((a.ltp || 0) - ltp) - Math.abs((b.ltp || 0) - ltp))
    .slice(0, 5);
}

export const SECTORS = [
  "Commercial Banks",
  "Development Banks",
  "Finance",
  "Microfinance",
  "Hydro Power",
  "Life Insurance",
  "Non Life Insurance",
  "Hotels And Tourism",
  "Manufacturing And Processing",
  "Investment",
  "Tradings",
  "Mutual Fund",
  "Others"
];

/** Sparkline: returns empty string; real charts use price-history data */
export function generateSparkline() {
  return '';
}

/** Market news: returns empty array; real news is fetched via servicesApi */
export function getMarketNews() {
  return [];
}
