import { getCachedRealPriceHistory } from '../utils/historyCache.js';
import { getNepseBrokerCommissionRate } from '../utils/calculations.js';

const STORAGE_KEY = 'drabyashree_signals';

/**
 * Deduplicate raw signals array by symbol and date/status.
 * If multiple identical open signals exist for the same symbol, collapses them into one.
 */
export const deduplicateStoredSignals = (rawSignals = []) => {
  if (!Array.isArray(rawSignals)) return [];
  const seenOpenSymbols = new Set();
  const seenSignatures = new Set();
  const result = [];

  for (const s of rawSignals) {
    if (!s || !s.symbol) continue;
    const sym = String(s.symbol).toUpperCase().trim();
    const sigKey = `${sym}_${s.signalDate || ''}_${s.entryPrice || ''}_${s.status || ''}`;

    if (s.status === 'open') {
      if (seenOpenSymbols.has(sym)) {
        continue; // Keep only first open signal per symbol
      }
      seenOpenSymbols.add(sym);
    } else {
      if (seenSignatures.has(sigKey)) {
        continue; // Keep only one instance of duplicate closed signal
      }
      seenSignatures.add(sigKey);
    }

    result.push({
      ...s,
      symbol: sym
    });
  }

  return result;
};

const getStoredSignals = () => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    const deduplicated = deduplicateStoredSignals(parsed);
    if (deduplicated.length !== parsed.length) {
      saveSignals(deduplicated);
    }
    return deduplicated;
  } catch (e) {
    console.error('Error reading signals from local storage', e);
    return [];
  }
};

const saveSignals = (signals) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
  } catch (e) {
    console.error('Error saving signals to local storage', e);
  }
};

/**
 * Calculates statutory NEPSE tiered brokerage commission (0.36% down to 0.24%), SEBON fee (0.015%), DP fee (Rs 25), and 7.5% short-term / 5.0% long-term CGT.
 */
export const calculateNetReturn = (entryPrice, exitPrice, holdingDays = 1, tradeAmount = 50000) => {
  const entry = Number(entryPrice || 0);
  const exit = Number(exitPrice || 0);
  if (entry <= 0 || exit <= 0) {
    return { grossReturnPct: 0, netReturnPct: 0, totalFeesPct: 0, cgtPct: 0, cgtRatePct: 7.5 };
  }

  // Tiered brokerage per SEBON schedule (0.36% down to 0.24%)
  const buyBrokerageRate = getNepseBrokerCommissionRate(tradeAmount);
  const exitAmount = tradeAmount * (exit / entry);
  const sellBrokerageRate = getNepseBrokerCommissionRate(exitAmount);

  // SEBON regulatory fee: 0.015% per leg
  const sebonRate = 0.00015;
  // DP transaction charge: Rs 25 flat per leg (normalized against trade size)
  const dpBuyRate = Math.min(0.005, 25 / Math.max(tradeAmount, 1000));
  const dpSellRate = Math.min(0.005, 25 / Math.max(exitAmount, 1000));

  const buyFeeRate = buyBrokerageRate + sebonRate + dpBuyRate;
  const sellFeeRate = sellBrokerageRate + sebonRate + dpSellRate;

  const totalCost = entry * (1 + buyFeeRate);
  const grossProceeds = exit * (1 - sellFeeRate);

  const grossReturnPct = +(((exit - entry) / entry) * 100).toFixed(2);
  const rawPnl = grossProceeds - totalCost;

  // Individual Capital Gains Tax: 7.5% for holdings <= 365 days, 5.0% for > 365 days
  const isLongTerm = Number(holdingDays) > 365;
  const cgtRate = isLongTerm ? 0.050 : 0.075;
  const cgtAmount = rawPnl > 0 ? rawPnl * cgtRate : 0;

  const netPnl = rawPnl - cgtAmount;
  const netReturnPct = +((netPnl / totalCost) * 100).toFixed(2);
  const totalFeesPct = +(((totalCost - entry + (exit - grossProceeds)) / entry) * 100).toFixed(2);
  const cgtPct = +((cgtAmount / entry) * 100).toFixed(2);

  return {
    grossReturnPct,
    netReturnPct,
    totalFeesPct,
    cgtPct,
    cgtRatePct: cgtRate * 100
  };
};

export const recordSignal = (signalInput) => {
  if (!signalInput || !signalInput.symbol) return null;
  const symbol = String(signalInput.symbol).toUpperCase().trim();
  const today = new Date().toISOString().split('T')[0];

  const signals = getStoredSignals();

  // Deduplication check:
  // 1. If an 'open' signal already exists for this symbol, do NOT duplicate it.
  const existingOpenIndex = signals.findIndex(
    s => s.symbol === symbol && s.status === 'open'
  );

  if (existingOpenIndex !== -1) {
    const existing = signals[existingOpenIndex];
    // Update levels if new levels were calculated, but preserve signal date & initial entry
    let changed = false;
    if (signalInput.targetPrice && Number(signalInput.targetPrice) !== existing.targetPrice) {
      existing.targetPrice = Number(signalInput.targetPrice);
      changed = true;
    }
    const target2Val = signalInput.target2Price || signalInput.target2;
    if (target2Val && Number(target2Val) !== existing.target2Price) {
      existing.target2Price = Number(target2Val);
      changed = true;
    }
    if (signalInput.stopLoss && Number(signalInput.stopLoss) !== existing.stopLoss) {
      existing.stopLoss = Number(signalInput.stopLoss);
      changed = true;
    }
    if (signalInput.setupScore && signalInput.setupScore !== existing.setupScore) {
      existing.setupScore = signalInput.setupScore;
      changed = true;
    }
    if (signalInput.verdict && signalInput.verdict !== existing.verdict) {
      existing.verdict = signalInput.verdict;
      changed = true;
    }
    if (changed) {
      signals[existingOpenIndex] = existing;
      saveSignals(signals);
    }
    return existing;
  }

  // 2. If a signal for this symbol was already recorded today (even if closed), don't spam duplicate records
  const existingToday = signals.find(
    s => s.symbol === symbol && s.signalDate === today
  );
  if (existingToday) {
    return existingToday;
  }

  const entryPrice = Number(signalInput.entryPrice || 0);
  const target2Val = signalInput.target2Price || signalInput.target2;

  const newSignal = {
    id: `SIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    signalDate: today,
    outcome: null,
    status: 'open',
    signalType: signalInput.signalType || 'BUY',
    highestSeen: entryPrice > 0 ? entryPrice : null,
    lowestSeen: entryPrice > 0 ? entryPrice : null,
    ...signalInput,
    symbol,
    entryPrice,
    targetPrice: signalInput.targetPrice ? Number(signalInput.targetPrice) : null,
    target2Price: target2Val ? Number(target2Val) : null,
    stopLoss: signalInput.stopLoss ? Number(signalInput.stopLoss) : null,
    rrr: signalInput.rrr != null ? Number(signalInput.rrr) : (signalInput.rrr1 != null ? Number(signalInput.rrr1) : null)
  };

  signals.push(newSignal);
  saveSignals(signals);
  return newSignal;
};

export const getSignals = (filters = {}) => {
  let signals = getStoredSignals();

  if (filters.symbol) {
    const sym = String(filters.symbol).toUpperCase().trim();
    signals = signals.filter(s => s.symbol === sym);
  }
  if (filters.source) {
    signals = signals.filter(s => s.source === filters.source);
  }
  if (filters.status) {
    signals = signals.filter(s => s.status === filters.status);
  }

  return signals;
};

export const deleteSignal = (signalId) => {
  if (!signalId) return false;
  const signals = getStoredSignals();
  const next = signals.filter(s => s.id !== signalId);
  if (next.length !== signals.length) {
    saveSignals(next);
    return true;
  }
  return false;
};

export const closeSignalManually = (signalId, exitPrice = null) => {
  if (!signalId) return null;
  const signals = getStoredSignals();
  const idx = signals.findIndex(s => s.id === signalId);
  if (idx === -1) return null;

  const sig = signals[idx];
  if (sig.status !== 'open') return sig;

  const resolvedExit = exitPrice != null ? Number(exitPrice) : (sig.highestSeen || sig.entryPrice);
  const entryDate = new Date(sig.signalDate);
  const exitDateObj = new Date();
  const holdingDays = Math.max(1, Math.floor((exitDateObj - entryDate) / (1000 * 60 * 60 * 24)));
  const entryPrice = sig.entryPrice || resolvedExit;
  const returnPct = +(((resolvedExit - entryPrice) / entryPrice) * 100).toFixed(2);
  const { netReturnPct, totalFeesPct, cgtPct } = calculateNetReturn(entryPrice, resolvedExit, holdingDays);

  const effectiveLow = sig.lowestSeen || Math.min(entryPrice, resolvedExit);
  const effectiveHigh = sig.highestSeen || Math.max(entryPrice, resolvedExit);

  sig.status = 'manual_close';
  sig.outcome = {
    exitDate: exitDateObj.toISOString().split('T')[0],
    exitPrice: resolvedExit,
    hitTarget: sig.targetPrice ? resolvedExit >= sig.targetPrice : false,
    hitStop: sig.stopLoss ? resolvedExit <= sig.stopLoss : false,
    returnPct,
    netReturnPct,
    totalFeesPct,
    cgtPct,
    holdingDays,
    maxDrawdownPct: effectiveLow ? +(((effectiveLow - entryPrice) / entryPrice) * 100).toFixed(2) : Math.min(0, returnPct),
    maxUpsidePct: effectiveHigh ? +(((effectiveHigh - entryPrice) / entryPrice) * 100).toFixed(2) : Math.max(0, returnPct)
  };

  signals[idx] = sig;
  saveSignals(signals);
  return sig;
};

export const updateSignalOutcome = (signalId, currentPrice, highSince, lowSince) => {
  const signals = getStoredSignals();
  const signalIndex = signals.findIndex(s => s.id === signalId);

  if (signalIndex === -1) return null;

  const signal = signals[signalIndex];
  if (signal.status !== 'open') return signal; // Already closed

  let newStatus = 'open';
  let exitPrice = null;
  let hitTarget = false;
  let hitStop = false;

  const effectiveHigh = highSince != null ? Number(highSince) : Number(currentPrice || 0);
  const effectiveLow = lowSince != null ? Number(lowSince) : Number(currentPrice || 0);

  if (signal.targetPrice && effectiveHigh >= signal.targetPrice) {
    newStatus = 'hit_target';
    exitPrice = signal.targetPrice;
    hitTarget = true;
  } else if (signal.stopLoss && effectiveLow <= signal.stopLoss) {
    newStatus = 'hit_stop';
    exitPrice = signal.stopLoss;
    hitStop = true;
  }

  if (newStatus !== 'open') {
    const entryDate = new Date(signal.signalDate);
    const exitDateObj = new Date();
    const holdingDays = Math.max(1, Math.floor((exitDateObj - entryDate) / (1000 * 60 * 60 * 24)));
    // Invariant: Under NEPSE T+2 settlement, shares cannot be exited prior to Demat delivery
    if (holdingDays < 2) return signal;
    const entryPrice = signal.entryPrice || currentPrice;
    const returnPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
    const { netReturnPct, totalFeesPct, cgtPct } = calculateNetReturn(entryPrice, exitPrice, holdingDays);

    const maxDrawdownPct = effectiveLow ? ((effectiveLow - entryPrice) / entryPrice) * 100 : Math.min(0, returnPct);
    const maxUpsidePct = effectiveHigh ? ((effectiveHigh - entryPrice) / entryPrice) * 100 : Math.max(0, returnPct);

    signal.status = newStatus;
    signal.outcome = {
      exitDate: exitDateObj.toISOString().split('T')[0],
      exitPrice,
      hitTarget,
      hitStop,
      returnPct: parseFloat(returnPct.toFixed(2)),
      netReturnPct,
      totalFeesPct,
      cgtPct,
      holdingDays,
      maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
      maxUpsidePct: parseFloat(maxUpsidePct.toFixed(2))
    };

    signals[signalIndex] = signal;
    saveSignals(signals);
  }

  return signal;
};

export const getSignalStats = (filters = {}) => {
  const signals = getSignals(filters);
  const total = signals.length;

  const openSignals = signals.filter(s => s.status === 'open');
  // Include expired and manual_close signals in closedSignals so there is zero survivorship bias!
  const closedSignals = signals.filter(
    s => ['hit_target', 'hit_stop', 'manual_close', 'expired'].includes(s.status) && s.outcome
  );

  const openCount = openSignals.length;
  const closedCount = closedSignals.length;

  let winCount = 0;
  let lossCount = 0;
  let totalReturnPct = 0;
  let totalNetReturnPct = 0;
  let totalHoldingDays = 0;
  let totalWinsPct = 0;
  let totalLossesPct = 0;

  let bestTrade = { symbol: '-', returnPct: -Infinity };
  let worstTrade = { symbol: '-', returnPct: Infinity };

  const bySource = {};

  // Initialize bySource for total stats
  signals.forEach(s => {
    const src = s.source || 'default';
    if (!bySource[src]) {
      bySource[src] = { total: 0, wins: 0, closed: 0 };
    }
    bySource[src].total += 1;
  });

  closedSignals.forEach(s => {
    const returnPct = s.outcome.returnPct;
    const netReturnPct = s.outcome.netReturnPct != null ? s.outcome.netReturnPct : returnPct;

    if (returnPct > 0) {
      winCount++;
      totalWinsPct += returnPct;
    } else {
      lossCount++;
      totalLossesPct += Math.abs(returnPct);
    }

    totalReturnPct += returnPct;
    totalNetReturnPct += netReturnPct;
    totalHoldingDays += (s.outcome.holdingDays || 1);

    if (returnPct > bestTrade.returnPct) {
      bestTrade = { symbol: s.symbol, returnPct, netReturnPct };
    }
    if (returnPct < worstTrade.returnPct) {
      worstTrade = { symbol: s.symbol, returnPct, netReturnPct };
    }

    const src = s.source || 'default';
    if (bySource[src]) {
      bySource[src].closed += 1;
      if (returnPct > 0) bySource[src].wins += 1;
    }
  });

  const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
  const avgReturnPct = closedCount > 0 ? (totalReturnPct / closedCount) : 0;
  const avgNetReturnPct = closedCount > 0 ? (totalNetReturnPct / closedCount) : 0;
  const avgHoldingDays = closedCount > 0 ? (totalHoldingDays / closedCount) : 0;
  const profitFactor = totalLossesPct > 0
    ? +(totalWinsPct / totalLossesPct).toFixed(2)
    : (totalWinsPct > 0 ? 9.99 : 1.0);

  const avgWinPct = winCount > 0 ? +(totalWinsPct / winCount).toFixed(2) : 0;
  const avgLossPct = lossCount > 0 ? +(totalLossesPct / lossCount).toFixed(2) : 0;
  const expectancy = closedCount > 0
    ? +(((winRate / 100) * avgWinPct) - (((100 - winRate) / 100) * avgLossPct)).toFixed(2)
    : 0;

  Object.keys(bySource).forEach(source => {
    const sourceData = bySource[source];
    sourceData.winRate = sourceData.closed > 0 ? (sourceData.wins / sourceData.closed) * 100 : 0;
  });

  const expiredCount = signals.filter(s => s.status === 'expired').length;

  return {
    total,
    openCount,
    closedCount,
    winCount,
    lossCount,
    expiredCount,
    profitFactor,
    winRate: parseFloat(winRate.toFixed(2)),
    avgReturnPct: parseFloat(avgReturnPct.toFixed(2)),
    avgNetReturnPct: parseFloat(avgNetReturnPct.toFixed(2)),
    avgHoldingDays: parseFloat(avgHoldingDays.toFixed(1)),
    avgWinPct,
    avgLossPct,
    expectancy,
    bestTrade: bestTrade.returnPct !== -Infinity ? bestTrade : null,
    worstTrade: worstTrade.returnPct !== Infinity ? worstTrade : null,
    bySource,
    disclaimer: 'Based on quantitative signals generated by Drabyashree NEPSE. Real execution subject to broker fees, slippage, and SEBON market conditions.'
  };
};

export const expireOldSignals = (maxAgeDays = 60) => {
  const signals = getStoredSignals();
  const now = new Date();
  let changed = false;

  signals.forEach(s => {
    if (s.status === 'open') {
      const signalDate = new Date(s.signalDate);
      const ageDays = (now - signalDate) / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) {
        s.status = 'expired';
        s.outcome = {
          exitDate: now.toISOString().split('T')[0],
          exitPrice: s.entryPrice,
          hitTarget: false,
          hitStop: false,
          returnPct: 0,
          netReturnPct: 0,
          totalFeesPct: 0,
          cgtPct: 0,
          holdingDays: Math.round(ageDays),
          maxDrawdownPct: 0,
          maxUpsidePct: 0
        };
        changed = true;
      }
    }
  });

  if (changed) saveSignals(signals);
};

/**
 * Automatically evaluates all open signals against current market prices and historical candles.
 * Tracks highest and lowest price seen over time while signal is open.
 * Replays past trading sessions if historical candles are cached to ensure zero missed exits.
 */
export const evaluateOpenSignals = (marketStocks, options = {}) => {
  if (!Array.isArray(marketStocks) || marketStocks.length === 0) return { updated: 0, closed: 0 };

  const signals = getStoredSignals();
  if (signals.length === 0) return { updated: 0, closed: 0 };

  const stockMap = new Map();
  for (const s of marketStocks) {
    if (s && s.symbol) stockMap.set(String(s.symbol).toUpperCase().trim(), s);
  }

  let updatedCount = 0;
  let closedCount = 0;
  const now = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    if (sig.status !== 'open') continue;

    const sym = String(sig.symbol || '').toUpperCase().trim();
    const stock = stockMap.get(sym);
    if (!stock) continue;

    const currentPrice = Number(stock.ltp || stock.marketPrice || stock.close || 0);
    if (!currentPrice || currentPrice <= 0) continue;

    const todayHigh = stock.high != null && Number(stock.high) > 0 ? Number(stock.high) : currentPrice;
    const todayLow = stock.low != null && Number(stock.low) > 0 ? Number(stock.low) : currentPrice;

    // Multi-session historical candle walk-forward check
    const candleHistory = options.candleHistoryMap?.get?.(sym)
      || (typeof getCachedRealPriceHistory === 'function' ? getCachedRealPriceHistory(sym) : null);

    let resolvedFromHistory = false;

    if (Array.isArray(candleHistory) && candleHistory.length > 0 && sig.signalDate) {
      const relevantCandles = candleHistory
        .filter(c => c && c.date && c.date >= sig.signalDate)
        .sort((a, b) => (a.date > b.date ? 1 : -1));

      for (const c of relevantCandles) {
        const cHigh = Number(c.high || c.close || 0);
        const cLow = Number(c.low || c.close || 0);
        const cOpen = Number(c.open || c.close || 0);
        const cClose = Number(c.close || 0);
        if (cHigh <= 0 || cLow <= 0) continue;

        sig.highestSeen = Math.max(sig.highestSeen ?? sig.entryPrice ?? cHigh, cHigh);
        sig.lowestSeen = Math.min(sig.lowestSeen ?? sig.entryPrice ?? cLow, cLow);

        let cStatus = 'open';
        let cExit = null;
        let hitTarget = false;
        let hitStop = false;

        const targetHit = sig.targetPrice && cHigh >= sig.targetPrice;
        const stopHit = sig.stopLoss && cLow <= sig.stopLoss;

        if (targetHit && stopHit) {
          if (cOpen <= sig.stopLoss) {
            cStatus = 'hit_stop';
            cExit = sig.stopLoss;
            hitStop = true;
          } else if (cOpen >= sig.targetPrice) {
            cStatus = 'hit_target';
            cExit = sig.targetPrice;
            hitTarget = true;
          } else if (cClose < cOpen) {
            cStatus = 'hit_stop';
            cExit = sig.stopLoss;
            hitStop = true;
          } else {
            cStatus = 'hit_target';
            cExit = sig.targetPrice;
            hitTarget = true;
          }
        } else if (targetHit) {
          cStatus = 'hit_target';
          cExit = sig.targetPrice;
          hitTarget = true;
        } else if (stopHit) {
          cStatus = 'hit_stop';
          cExit = sig.stopLoss;
          hitStop = true;
        }

        if (cStatus !== 'open') {
          const entryDate = new Date(sig.signalDate);
          const exitDate = new Date(c.date);
          const holdingDays = Math.max(1, Math.round((exitDate - entryDate) / (1000 * 60 * 60 * 24)));
          const entryPrice = sig.entryPrice || currentPrice;
          const returnPct = +(((cExit - entryPrice) / entryPrice) * 100).toFixed(2);
          const { netReturnPct, totalFeesPct, cgtPct } = calculateNetReturn(entryPrice, cExit, holdingDays);

          sig.status = cStatus;
          sig.outcome = {
            exitDate: c.date,
            exitPrice: cExit,
            hitTarget,
            hitStop,
            returnPct,
            netReturnPct,
            totalFeesPct,
            cgtPct,
            holdingDays,
            maxDrawdownPct: sig.lowestSeen ? +(((sig.lowestSeen - entryPrice) / entryPrice) * 100).toFixed(2) : Math.min(0, returnPct),
            maxUpsidePct: sig.highestSeen ? +(((sig.highestSeen - entryPrice) / entryPrice) * 100).toFixed(2) : Math.max(0, returnPct)
          };
          closedCount++;
          updatedCount++;
          resolvedFromHistory = true;
          break;
        }
      }
    }

    if (resolvedFromHistory) continue;

    // Track running peak and trough across sessions with live quote
    sig.highestSeen = Math.max(sig.highestSeen ?? sig.entryPrice ?? currentPrice, todayHigh);
    sig.lowestSeen = Math.min(sig.lowestSeen ?? sig.entryPrice ?? currentPrice, todayLow);

    const highSince = sig.highestSeen;
    const lowSince = sig.lowestSeen;

    // Check expiration (> 60 days)
    const sigTime = new Date(sig.signalDate).getTime();
    const ageDays = (now - sigTime) / (1000 * 60 * 60 * 24);

    let newStatus = 'open';
    let exitPrice = null;
    let hitTarget = false;
    let hitStop = false;

    if (sig.targetPrice && highSince >= sig.targetPrice) {
      newStatus = 'hit_target';
      exitPrice = sig.targetPrice;
      hitTarget = true;
    } else if (sig.stopLoss && lowSince <= sig.stopLoss) {
      newStatus = 'hit_stop';
      exitPrice = sig.stopLoss;
      hitStop = true;
    } else if (ageDays > 60) {
      newStatus = 'expired';
      exitPrice = currentPrice;
    }

    if (newStatus !== 'open') {
      const holdingDays = Math.max(1, Math.round(ageDays));
      const entryPrice = sig.entryPrice || currentPrice;
      const returnPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
      const { netReturnPct, totalFeesPct, cgtPct } = calculateNetReturn(entryPrice, exitPrice, holdingDays);
      const maxDrawdownPct = lowSince ? +(((lowSince - entryPrice) / entryPrice) * 100).toFixed(2) : Math.min(0, returnPct);
      const maxUpsidePct = highSince ? +(((highSince - entryPrice) / entryPrice) * 100).toFixed(2) : Math.max(0, returnPct);

      sig.status = newStatus;
      sig.outcome = {
        exitDate: todayStr,
        exitPrice,
        hitTarget,
        hitStop,
        returnPct,
        netReturnPct,
        totalFeesPct,
        cgtPct,
        holdingDays,
        maxDrawdownPct,
        maxUpsidePct
      };
      closedCount++;
      updatedCount++;
    } else {
      // Still open, but highestSeen / lowestSeen may have updated
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    saveSignals(signals);
  }

  return { updated: updatedCount, closed: closedCount };
};

export const clearSignals = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing signals from local storage', e);
  }
};
