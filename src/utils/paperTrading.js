// src/utils/paperTrading.js
// Institutional Virtual Paper Trading Sandbox for NEPSE
// PERSISTENT PLAYGROUND (Rs. 10 Lakhs Virtual Capital)

import { calculateBuyDetails, calculateSellDetails } from './calculations.js';

const STORAGE_KEY = 'nepse_paper_trading_sandbox_v1';
export const INITIAL_CAPITAL = 1000000; // Rs. 10 Lakhs

export function getPaperState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.cash === 'number' && Array.isArray(parsed.positions)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[PaperTrading] Failed to parse state, resetting to initial:', e);
  }

  const initial = {
    cash: INITIAL_CAPITAL,
    positions: [],
    closedTrades: [],
    createdAt: new Date().toISOString()
  };
  savePaperState(initial);
  return initial;
}

export function savePaperState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[PaperTrading] Failed to save state:', e);
  }
}

export function resetPaperSandbox() {
  const initial = {
    cash: INITIAL_CAPITAL,
    positions: [],
    closedTrades: [],
    createdAt: new Date().toISOString()
  };
  savePaperState(initial);
  return initial;
}

export function validateAndExecutePaperOrder({
  side, // 'BUY' | 'SELL'
  symbol,
  quantity,
  executionPrice,
  previousClose = 0,
  availableCash = 100000,
  existingHoldingsLots = [],
  orderTimestamp = Date.now(),
  enforceT2Settlement = true
}) {
  const sym = String(symbol || '').toUpperCase().trim();
  const qty = Math.floor(Number(quantity || 0));
  const price = Number(executionPrice || 0);
  const prev = Number(previousClose || price);

  if (!sym || qty < 10 || price <= 0) {
    return {
      executed: false,
      reason: 'Invalid order: Minimum regular NEPSE order size is 10 kitta and price must be positive.'
    };
  }

  // 1. NEPSE ±15% Daily Circuit Freeze Guard
  const pChangePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
  if (side === 'BUY' && pChangePct >= 14.95) {
    return {
      executed: false,
      reason: `Order Rejected (Upper Circuit Freeze): ${sym} is locked at +${pChangePct.toFixed(2)}% upper circuit with zero sellers available.`
    };
  }
  if (side === 'SELL' && pChangePct <= -14.95) {
    return {
      executed: false,
      reason: `Order Rejected (Lower Circuit Freeze): ${sym} is locked at ${pChangePct.toFixed(2)}% lower circuit with zero buyers available.`
    };
  }

  // 2. BUY Execution with Statutory Friction
  if (side === 'BUY') {
    const buyMath = calculateBuyDetails(qty, price);
    if (buyMath.totalAmount > availableCash) {
      return {
        executed: false,
        reason: `Insufficient Cash: Order requires Rs. ${buyMath.totalAmount.toFixed(2)} (including Rs. ${buyMath.commission} broker fee, Rs. ${buyMath.sebonFee} SEBON, Rs. 25 DP), but available cash is Rs. ${availableCash.toFixed(2)}.`
      };
    }

    return {
      executed: true,
      side: 'BUY',
      symbol: sym,
      quantity: qty,
      fillPrice: price,
      commission: buyMath.commission,
      sebonFee: buyMath.sebonFee,
      dpFee: buyMath.dpFee,
      totalCashDebited: +buyMath.totalAmount.toFixed(2),
      remainingCash: +(availableCash - buyMath.totalAmount).toFixed(2),
      waccPerShare: +buyMath.costPerShare.toFixed(2),
      settledAtMs: orderTimestamp + (2 * 24 * 60 * 60 * 1000) // T+2 Settlement Lockup
    };
  }

  // 3. SELL Execution with T+2 Settlement Lockup & FIFO CGT Check
  const sortedLots = [...existingHoldingsLots]
    .filter(l => l.symbol === sym && Number(l.qty || 0) > 0)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const totalHeld = sortedLots.reduce((s, l) => s + Number(l.qty || 0), 0);
  const t2ClearedLots = sortedLots.filter(l => !enforceT2Settlement || (orderTimestamp >= (l.settledAtMs || 0)));
  const t2SalableQty = t2ClearedLots.reduce((s, l) => s + Number(l.qty || 0), 0);

  if (qty > totalHeld) {
    return { executed: false, reason: `Insufficient Holdings: Attempting to sell ${qty} kitta of ${sym}, but only ${totalHeld} kitta held.` };
  }
  if (qty > t2SalableQty) {
    return {
      executed: false,
      reason: `T+2 Settlement Lockup Active: You hold ${totalHeld} kitta of ${sym}, but only ${t2SalableQty} kitta have cleared T+2 Demat settlement.`
    };
  }

  // Compute Weighted WACC and Holding Period across matched FIFO lots
  let rem = qty;
  let weightedCost = 0;
  let weightedDays = 0;
  for (const lot of t2ClearedLots) {
    if (rem <= 0) break;
    const take = Math.min(rem, Number(lot.qty));
    rem -= take;
    const lotWacc = Number(lot.waccPerShare || lot.price || price);
    const days = Math.max(1, Math.floor((orderTimestamp - (lot.timestamp || orderTimestamp)) / (24 * 60 * 60 * 1000)));
    weightedCost += take * lotWacc;
    weightedDays += take * days;
  }

  const avgWacc = weightedCost / qty;
  const avgHoldingDays = weightedDays / qty;
  const holdingType = avgHoldingDays > 365 ? 'long' : 'short';
  const sellMath = calculateSellDetails(qty, price, avgWacc, holdingType);

  return {
    executed: true,
    side: 'SELL',
    symbol: sym,
    quantity: qty,
    fillPrice: price,
    waccBasis: +avgWacc.toFixed(2),
    holdingDays: Math.round(avgHoldingDays),
    commission: sellMath.commission,
    sebonFee: sellMath.sebonFee,
    dpFee: sellMath.dpFee,
    cgt: +sellMath.cgt.toFixed(2),
    cgtRatePct: +(sellMath.cgtRate * 100).toFixed(1),
    netCashCredited: +sellMath.netReceivable.toFixed(2),
    netRealizedPnl: +sellMath.netProfitLoss.toFixed(2),
    remainingCash: +(availableCash + sellMath.netReceivable).toFixed(2)
  };
}

export function executePaperBuy(symbol, ltp, quantity, targetPrice = null, stopLoss = null, previousClose = null) {
  const state = getPaperState();
  const sym = String(symbol || '').toUpperCase().trim();
  const qty = Math.max(10, Math.floor(Number(quantity) || 10));
  const price = Number(ltp) || 100;

  const validation = validateAndExecutePaperOrder({
    side: 'BUY',
    symbol: sym,
    quantity: qty,
    executionPrice: price,
    previousClose: previousClose || price,
    availableCash: state.cash
  });

  if (!validation.executed) {
    return {
      success: false,
      error: validation.reason
    };
  }

  const newPosition = {
    id: `POS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    symbol: sym,
    quantity: qty,
    buyPrice: price,
    wacc: validation.waccPerShare,
    totalCost: validation.totalCashDebited,
    commission: validation.commission,
    sebonFee: validation.sebonFee,
    dpFee: validation.dpFee,
    targetPrice: Number(targetPrice) || +(price * 1.1).toFixed(1),
    stopLoss: Number(stopLoss) || +(price * 0.93).toFixed(1),
    boughtAt: new Date().toISOString(),
    settledAtMs: validation.settledAtMs,
    timestamp: Date.now()
  };

  state.cash = validation.remainingCash;
  state.positions.push(newPosition);
  savePaperState(state);

  return {
    success: true,
    position: newPosition,
    remainingCash: state.cash,
    details: validation
  };
}

export function executePaperSell(positionId, currentLtp, previousClose = null, options = {}) {
  const state = getPaperState();
  const idx = state.positions.findIndex(p => p.id === positionId);
  if (idx === -1) {
    return { success: false, error: 'Simulated position not found.' };
  }

  const pos = state.positions[idx];
  const sellPrice = Number(currentLtp) || pos.buyPrice;

  const validation = validateAndExecutePaperOrder({
    side: 'SELL',
    symbol: pos.symbol,
    quantity: pos.quantity,
    executionPrice: sellPrice,
    previousClose: previousClose || sellPrice,
    availableCash: state.cash,
    existingHoldingsLots: [pos],
    enforceT2Settlement: options.enforceT2Settlement ?? false // allow sandbox flexibility if requested
  });

  if (!validation.executed) {
    return {
      success: false,
      error: validation.reason
    };
  }

  const closedTrade = {
    ...pos,
    sellPrice,
    sellValue: validation.fillPrice * pos.quantity,
    netReceivable: validation.netCashCredited,
    netProfitLoss: validation.netRealizedPnl,
    returnPct: +(((validation.netCashCredited - pos.totalCost) / pos.totalCost) * 100).toFixed(2),
    cgtPaid: validation.cgt,
    sellCommission: validation.commission,
    closedAt: new Date().toISOString()
  };

  state.cash = validation.remainingCash;
  state.positions.splice(idx, 1);
  state.closedTrades.unshift(closedTrade);
  savePaperState(state);

  return {
    success: true,
    closedTrade,
    newCash: state.cash,
    details: validation
  };
}

export function calculateSandboxSummary(state, currentPrices = {}) {
  const s = state || getPaperState();
  let openHoldingsValue = 0;
  let totalCostOpen = 0;
  let unrealizedPnl = 0;

  const positionsEnriched = s.positions.map(p => {
    const ltp = currentPrices[p.symbol] ? Number(currentPrices[p.symbol]) : p.buyPrice;
    const currentVal = p.quantity * ltp;
    const pnl = currentVal - p.totalCost;
    const pnlPct = +((pnl / p.totalCost) * 100).toFixed(2);
    openHoldingsValue += currentVal;
    totalCostOpen += p.totalCost;
    unrealizedPnl += pnl;

    return {
      ...p,
      currentLtp: ltp,
      currentValue: currentVal,
      unrealizedPnl: +pnl.toFixed(2),
      unrealizedPnlPct: pnlPct
    };
  });

  let totalRealizedPnl = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  s.closedTrades.forEach(t => {
    totalRealizedPnl += (t.netProfitLoss || 0);
    if ((t.netProfitLoss || 0) > 0) winningTrades++;
    else losingTrades++;
  });

  const totalClosed = s.closedTrades.length;
  const winRate = totalClosed > 0 ? +((winningTrades / totalClosed) * 100).toFixed(1) : 0;
  const totalPortfolioWorth = +(s.cash + openHoldingsValue).toFixed(2);
  const netReturnFromInceptionPct = +(((totalPortfolioWorth - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100).toFixed(2);

  return {
    initialCapital: INITIAL_CAPITAL,
    cash: s.cash,
    openHoldingsValue: +openHoldingsValue.toFixed(2),
    totalPortfolioWorth,
    netReturnFromInceptionPct,
    unrealizedPnl: +unrealizedPnl.toFixed(2),
    totalRealizedPnl: +totalRealizedPnl.toFixed(2),
    winRate,
    winningTrades,
    losingTrades,
    totalTrades: totalClosed,
    openPositionsCount: s.positions.length,
    positions: positionsEnriched,
    closedTrades: s.closedTrades
  };
}
