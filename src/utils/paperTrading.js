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

export function executePaperBuy(symbol, ltp, quantity, targetPrice = null, stopLoss = null) {
  const state = getPaperState();
  const sym = String(symbol || '').toUpperCase().trim();
  const qty = Math.max(10, Math.floor(Number(quantity) || 10));
  const price = Number(ltp) || 100;

  const buyDetails = calculateBuyDetails(qty, price);
  if (state.cash < buyDetails.totalAmount) {
    return {
      success: false,
      error: `Insufficient simulated funds. Required: Rs. ${buyDetails.totalAmount.toLocaleString()}, Available: Rs. ${state.cash.toLocaleString()}`
    };
  }

  const newPosition = {
    id: `POS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    symbol: sym,
    quantity: qty,
    buyPrice: price,
    wacc: buyDetails.costPerShare,
    totalCost: buyDetails.totalAmount,
    commission: buyDetails.commission,
    sebonFee: buyDetails.sebonFee,
    dpFee: buyDetails.dpFee,
    targetPrice: Number(targetPrice) || +(price * 1.1).toFixed(1),
    stopLoss: Number(stopLoss) || +(price * 0.93).toFixed(1),
    boughtAt: new Date().toISOString()
  };

  state.cash = +(state.cash - buyDetails.totalAmount).toFixed(2);
  state.positions.push(newPosition);
  savePaperState(state);

  return {
    success: true,
    position: newPosition,
    remainingCash: state.cash,
    details: buyDetails
  };
}

export function executePaperSell(positionId, currentLtp) {
  const state = getPaperState();
  const idx = state.positions.findIndex(p => p.id === positionId);
  if (idx === -1) {
    return { success: false, error: 'Simulated position not found.' };
  }

  const pos = state.positions[idx];
  const sellPrice = Number(currentLtp) || pos.buyPrice;
  const sellDetails = calculateSellDetails(pos.quantity, sellPrice, pos.wacc, 'short');

  const closedTrade = {
    ...pos,
    sellPrice,
    sellValue: sellDetails.sellValue,
    netReceivable: sellDetails.netReceivable,
    netProfitLoss: sellDetails.netProfitLoss,
    returnPct: +(((sellDetails.netReceivable - pos.totalCost) / pos.totalCost) * 100).toFixed(2),
    cgtPaid: sellDetails.cgt,
    sellCommission: sellDetails.commission,
    closedAt: new Date().toISOString()
  };

  state.cash = +(state.cash + sellDetails.netReceivable).toFixed(2);
  state.positions.splice(idx, 1);
  state.closedTrades.unshift(closedTrade);
  savePaperState(state);

  return {
    success: true,
    closedTrade,
    newCash: state.cash,
    details: sellDetails
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
