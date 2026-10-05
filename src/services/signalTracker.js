// src/services/signalTracker.js

const STORAGE_KEY = 'drabyashree_signals';

const getStoredSignals = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading signals from local storage', e);
    return [];
  }
};

const saveSignals = (signals) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
  } catch (e) {
    console.error('Error saving signals to local storage', e);
  }
};

export const recordSignal = (signalInput) => {
  const signals = getStoredSignals();
  
  const newSignal = {
    id: `SIG-${Date.now()}`,
    signalDate: new Date().toISOString().split('T')[0],
    outcome: null,
    status: 'open',
    ...signalInput
  };
  
  signals.push(newSignal);
  saveSignals(signals);
  return newSignal;
};

export const getSignals = (filters = {}) => {
  let signals = getStoredSignals();
  
  if (filters.symbol) {
    signals = signals.filter(s => s.symbol === filters.symbol);
  }
  if (filters.source) {
    signals = signals.filter(s => s.source === filters.source);
  }
  if (filters.status) {
    signals = signals.filter(s => s.status === filters.status);
  }
  
  return signals;
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
  
  if (signal.targetPrice && highSince && highSince >= signal.targetPrice) {
    newStatus = 'hit_target';
    exitPrice = signal.targetPrice;
    hitTarget = true;
  } else if (signal.stopLoss && lowSince && lowSince <= signal.stopLoss) {
    newStatus = 'hit_stop';
    exitPrice = signal.stopLoss;
    hitStop = true;
  } else if (signal.targetPrice && currentPrice >= signal.targetPrice) {
    newStatus = 'hit_target';
    exitPrice = signal.targetPrice;
    hitTarget = true;
  } else if (signal.stopLoss && currentPrice <= signal.stopLoss) {
    newStatus = 'hit_stop';
    exitPrice = signal.stopLoss;
    hitStop = true;
  }
  
  if (newStatus !== 'open') {
    const entryDate = new Date(signal.signalDate);
    const exitDateObj = new Date();
    const holdingDays = Math.max(1, Math.floor((exitDateObj - entryDate) / (1000 * 60 * 60 * 24)));
    
    const returnPct = ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100;
    
    // Simple estimates for max drawdown/upside
    const maxDrawdownPct = lowSince ? ((lowSince - signal.entryPrice) / signal.entryPrice) * 100 : Math.min(0, returnPct);
    const maxUpsidePct = highSince ? ((highSince - signal.entryPrice) / signal.entryPrice) * 100 : Math.max(0, returnPct);
    
    signal.status = newStatus;
    signal.outcome = {
      exitDate: exitDateObj.toISOString().split('T')[0],
      exitPrice,
      hitTarget,
      hitStop,
      returnPct: parseFloat(returnPct.toFixed(2)),
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
  const closedSignals = signals.filter(s => ['hit_target', 'hit_stop', 'manual_close'].includes(s.status) && s.outcome);
  
  const openCount = openSignals.length;
  const closedCount = closedSignals.length;
  
  let winCount = 0;
  let totalReturnPct = 0;
  let totalHoldingDays = 0;
  let bestTrade = { symbol: '-', returnPct: -Infinity };
  let worstTrade = { symbol: '-', returnPct: Infinity };
  
  const bySource = {};
  
  // Initialize bySource for total stats
  signals.forEach(s => {
      if (!bySource[s.source]) {
          bySource[s.source] = { total: 0, wins: 0, closed: 0 };
      }
      bySource[s.source].total += 1;
  });

  closedSignals.forEach(s => {
    const returnPct = s.outcome.returnPct;
    if (returnPct > 0) winCount++;
    totalReturnPct += returnPct;
    totalHoldingDays += s.outcome.holdingDays;
    
    if (returnPct > bestTrade.returnPct) {
      bestTrade = { symbol: s.symbol, returnPct };
    }
    if (returnPct < worstTrade.returnPct) {
      worstTrade = { symbol: s.symbol, returnPct };
    }
    
    if (bySource[s.source]) {
        bySource[s.source].closed += 1;
        if (returnPct > 0) bySource[s.source].wins += 1;
    }
  });
  
  const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
  const avgReturnPct = closedCount > 0 ? (totalReturnPct / closedCount) : 0;
  const avgHoldingDays = closedCount > 0 ? (totalHoldingDays / closedCount) : 0;
  
  Object.keys(bySource).forEach(source => {
      const sourceData = bySource[source];
      sourceData.winRate = sourceData.closed > 0 ? (sourceData.wins / sourceData.closed) * 100 : 0;
  });

  return {
    total,
    openCount,
    closedCount,
    winRate: parseFloat(winRate.toFixed(2)),
    avgReturnPct: parseFloat(avgReturnPct.toFixed(2)),
    avgHoldingDays: parseFloat(avgHoldingDays.toFixed(1)),
    bestTrade: bestTrade.returnPct !== -Infinity ? bestTrade : null,
    worstTrade: worstTrade.returnPct !== Infinity ? worstTrade : null,
    bySource,
    disclaimer: 'Based on signals generated by this app. Past signal performance does not guarantee future results.'
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
        changed = true;
      }
    }
  });
  
  if (changed) saveSignals(signals);
};

/**
 * Automatically evaluates all open signals against current market prices.
 * Call whenever the market stock list is refreshed.
 */
export const evaluateOpenSignals = (marketStocks) => {
  if (!Array.isArray(marketStocks) || marketStocks.length === 0) return { updated: 0, closed: 0 };
  
  const signals = getStoredSignals();
  if (signals.length === 0) return { updated: 0, closed: 0 };

  const stockMap = new Map();
  for (const s of marketStocks) {
    if (s && s.symbol) stockMap.set(s.symbol.toUpperCase(), s);
  }

  let updatedCount = 0;
  let closedCount = 0;
  const now = Date.now();

  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    if (sig.status !== 'open') continue;

    const stock = stockMap.get(sig.symbol?.toUpperCase());
    if (!stock) continue;

    const currentPrice = Number(stock.ltp || stock.marketPrice || stock.close || 0);
    if (!currentPrice || currentPrice <= 0) continue;

    const highSince = stock.high != null ? Number(stock.high) : currentPrice;
    const lowSince = stock.low != null ? Number(stock.low) : currentPrice;

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
      const maxDrawdownPct = lowSince ? +(((lowSince - entryPrice) / entryPrice) * 100).toFixed(2) : Math.min(0, returnPct);
      const maxUpsidePct = highSince ? +(((highSince - entryPrice) / entryPrice) * 100).toFixed(2) : Math.max(0, returnPct);

      sig.status = newStatus;
      sig.outcome = {
        exitDate: new Date().toISOString().split('T')[0],
        exitPrice,
        hitTarget,
        hitStop,
        returnPct,
        holdingDays,
        maxDrawdownPct,
        maxUpsidePct
      };
      closedCount++;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    saveSignals(signals);
  }

  return { updated: updatedCount, closed: closedCount };
};

export const clearSignals = () => {
  localStorage.removeItem(STORAGE_KEY);
};
