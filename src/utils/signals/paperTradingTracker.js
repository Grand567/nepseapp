/**
 * paperTradingTracker.js
 * Automated Paper Trading Engine, Recommendation Logger, & Trade Journal for NEPSE
 *
 * Implements:
 * 1. Automatic logging of daily BUY / WATCH / AVOID stock selection picks
 * 2. Virtual trade execution with real NEPSE rules (T+2 lock, commissions, SEBON fee, DP fee, CGT)
 * 3. Daily outcome tracking: Target 1 (+1.5R partial profit), Target 2 (+2.5R full profit), Stop-Loss
 * 4. Trade Journal View: Date, Symbol, Trigger Signal, PnL, Holding Days, Exit Reason
 * 5. Signal Performance Attribution: Quantifies which specific signals earn or lose money
 */

import { STATUTORY_FEES } from './backtestEngine.js';
import { calculateBrokerCommission, calculateSebonFee, DP_CHARGE } from '../calculations.js';
import { calculateLiquiditySlippage } from '../nepseWalkForwardBacktest.mjs';
import { evaluateTrailingRatchet, calculateRatchetLevels } from './trailingRatchetEngine.ts';
import { formatNptDateIso } from '../nepseCalendar.js';

const STORAGE_KEY = 'drabyashree_paper_trading_tracker_v1';
const INITIAL_PAPER_CAPITAL = 1000000; // Rs. 10 Lakhs virtual equity

let memoryState = null;

export function getPaperTrackerState() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
  }
  if (!memoryState) {
    memoryState = {
      capital: INITIAL_PAPER_CAPITAL,
      initialCapital: INITIAL_PAPER_CAPITAL,
      dailyPicks: [],
      openPositions: [],
      closedJournal: [],
      createdAt: new Date().toISOString()
    };
  }
  return memoryState;
}

export function savePaperTrackerState(state) {
  memoryState = state;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }
  return state;
}

export function resetPaperTrackerState() {
  memoryState = {
    capital: INITIAL_PAPER_CAPITAL,
    initialCapital: INITIAL_PAPER_CAPITAL,
    dailyPicks: [],
    openPositions: [],
    closedJournal: [],
    createdAt: new Date().toISOString()
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }
  return memoryState;
}

/**
 * Extracts descriptive signal tags that triggered this recommendation
 */
export function extractTriggerSignals(scoringResult) {
  const triggers = [];
  const sb = scoringResult.scoreBreakdown || {};

  if (sb.brokerFloorsheet >= 75) triggers.push('BROKER_ACCUMULATION');
  if (sb.technical >= 75) triggers.push('TECHNICAL_BREAKOUT');
  if (sb.fundamental >= 70) triggers.push('VALUE_FUNDAMENTAL');
  if (sb.marketContext >= 70) triggers.push('MARKET_TAILWIND');

  if (scoringResult.hardFilters?.liquidityPassed) triggers.push('LIQUIDITY_SURGE');

  return triggers.length > 0 ? triggers : ['CONFLUENCE_MOMENTUM'];
}

/**
 * 1. Log daily stock selection pick (Buy / Watch / Avoid)
 */
export function recordPaperPick({
  date = formatNptDateIso(new Date()),
  stock = {},
  scoringResult = {},
  autoExecuteBuy = true
}) {
  const state = getPaperTrackerState();
  const symbol = String(stock.symbol || scoringResult.symbol || 'SCRIP').toUpperCase().trim();
  const action = scoringResult.action || 'AVOID';
  const plan = scoringResult.executionPlan;
  const triggers = extractTriggerSignals(scoringResult);

  const pickRecord = {
    id: `PICK-${symbol}-${date}-${Date.now().toString().slice(-4)}`,
    date,
    symbol,
    sector: stock.sector || scoringResult.sector || 'Unknown',
    action,
    compositeScore: scoringResult.compositeScore || 50,
    confidence: scoringResult.confidence || 50,
    triggers,
    entryZone: plan?.entryZone || [stock.ltp, stock.ltp],
    stopLoss: plan?.stopLoss || null,
    target1: plan?.target1 || null,
    target2: plan?.target2 || null,
    shares: plan?.positionSizing?.sharesKitta || 10,
    capitalRequiredNpr: plan?.positionSizing?.capitalRequiredNpr || 0,
    rejectionReasons: scoringResult.rejectionReasons || []
  };

  state.dailyPicks.unshift(pickRecord);

  // If action is BUY and user allows auto-execution, open a simulated paper trade
  if (action === 'BUY' && autoExecuteBuy && plan) {
    const entryPrice = Number(stock.ltp || plan.entryLtp);
    const shares = plan.positionSizing.sharesKitta;
    const grossOrder = shares * entryPrice;

    const commission = calculateBrokerCommission(grossOrder);
    const sebon = calculateSebonFee(grossOrder);
    const totalOutflow = grossOrder + commission + sebon;

    if (state.capital >= totalOutflow && !state.openPositions.some(p => p.symbol === symbol)) {
      state.capital -= totalOutflow;
      const rLevels = calculateRatchetLevels(entryPrice, plan.stopLoss);
      state.openPositions.push({
        id: `POS-${symbol}-${date}`,
        symbol,
        sector: pickRecord.sector,
        entryDate: date,
        shares,
        entryPrice,
        costBasisNpr: totalOutflow,
        initialStopLoss: plan.stopLoss,
        currentStopLoss: plan.stopLoss,
        stopLoss: plan.stopLoss,
        target1: rLevels.target1,
        target2: rLevels.target2,
        t1Banked: false,
        ratchetStage: 'INITIAL_RISK',
        triggers,
        holdSessions: 0
      });
    }
  }

  savePaperTrackerState(state);
  return pickRecord;
}

/**
 * 2. Process daily market tick & automatically track outcomes (T1, T2, Stop-Loss)
 */
export function processDailyPaperOutcomes(marketQuotes = {}, currentDate = formatNptDateIso(new Date())) {
  const state = getPaperTrackerState();
  const remainingPositions = [];

  for (const pos of state.openPositions) {
    const quote = marketQuotes[pos.symbol] || marketQuotes[pos.symbol.toUpperCase()];
    if (!quote) {
      pos.holdSessions = (pos.holdSessions || 0) + 1;
      remainingPositions.push(pos);
      continue;
    }

    const high = Number(quote.high || quote.highPrice || quote.ltp || quote.close);
    const low = Number(quote.low || quote.lowPrice || quote.ltp || quote.close);
    const close = Number(quote.close || quote.closePrice || quote.ltp);
    const turnover = Number(quote.turnover || (close * 20000));

    pos.holdSessions = (pos.holdSessions || 0) + 1;

    // ── Multi-Stage Trailing Stop-Loss Ratchet Evaluation ──
    const evalRes = evaluateTrailingRatchet({
      position: {
        ...pos,
        currentStopLoss: pos.currentStopLoss || pos.stopLoss,
        initialStopLoss: pos.initialStopLoss || pos.stopLoss,
        ratchetStage: pos.ratchetStage || 'INITIAL_RISK',
      },
      currentHigh: high,
      currentLow: low,
      currentClose: close,
      holdSessions: pos.holdSessions
    });

    pos.currentStopLoss = evalRes.newStopLoss;
    pos.stopLoss = evalRes.newStopLoss;
    pos.ratchetStage = evalRes.ratchetStage;

    let isFullyClosed = false;

    // 1. Partial Target 1 Profit Scale-Out (50%) + Ratchet to +1.0R
    if (evalRes.takePartialProfit && !pos.t1Banked && evalRes.partialSharesToSell > 0) {
      const sharesToSell = Math.floor(evalRes.partialSharesToSell / 10) * 10 || evalRes.partialSharesToSell;
      const proceeds = sharesToSell * pos.target1;
      const comm = calculateBrokerCommission(proceeds);
      const sebon = calculateSebonFee(proceeds);
      const netProceeds = proceeds - comm - sebon - STATUTORY_FEES.dpCharge;

      const cost = sharesToSell * pos.entryPrice;
      const grossGain = netProceeds - cost;
      const cgt = grossGain > 0 ? Number((grossGain * STATUTORY_FEES.cgtShortTermRate).toFixed(2)) : 0;
      const realizedPnl = Number((grossGain - cgt).toFixed(2));

      state.capital += (netProceeds - cgt);
      state.closedJournal.unshift({
        id: `TRD-T1-${pos.symbol}-${currentDate}`,
        symbol: pos.symbol,
        sector: pos.sector,
        entryDate: pos.entryDate,
        exitDate: currentDate,
        shares: sharesToSell,
        entryPrice: pos.entryPrice,
        exitPrice: pos.target1,
        realizedPnl,
        returnPct: Number(((realizedPnl / cost) * 100).toFixed(2)),
        outcome: 'TARGET_1_PARTIAL',
        exitReason: '✨ Target 1 Banked (50% Scaled Out, Stop Ratcheted to +1R)',
        holdSessions: pos.holdSessions,
        triggers: pos.triggers,
        commission: comm,
        cgt
      });

      pos.shares -= sharesToSell;
      pos.t1Banked = true;
    }

    // 2. Full Position Close (Target 2 or Stop-Loss Hit)
    if (evalRes.isClosed) {
      const exitPrice = evalRes.exitPrice || close;
      const proceeds = pos.shares * exitPrice;

      const comm = calculateBrokerCommission(proceeds);
      const sebon = calculateSebonFee(proceeds);
      const netProceeds = proceeds - comm - sebon - STATUTORY_FEES.dpCharge;

      const cost = pos.shares * pos.entryPrice;
      const grossGain = netProceeds - cost;
      const cgt = grossGain > 0 ? Number((grossGain * STATUTORY_FEES.cgtShortTermRate).toFixed(2)) : 0;
      const realizedPnl = Number((grossGain - cgt).toFixed(2));

      state.capital += (netProceeds - cgt);
      state.closedJournal.unshift({
        id: `TRD-${pos.symbol}-${currentDate}`,
        symbol: pos.symbol,
        sector: pos.sector,
        entryDate: pos.entryDate,
        exitDate: currentDate,
        shares: pos.shares,
        entryPrice: pos.entryPrice,
        exitPrice,
        realizedPnl,
        returnPct: Number(((realizedPnl / cost) * 100).toFixed(2)),
        outcome: evalRes.exitReason || 'STOP_LOSS_HIT',
        exitReason: evalRes.exitReason === 'TARGET_2_HIT'
          ? '🎯 Target 2 Reached (+2.5R Runner Profit)'
          : `🛑 Trailing Stop Triggered (${evalRes.ratchetStage})`,
        holdSessions: pos.holdSessions,
        triggers: pos.triggers,
        commission: comm,
        cgt
      });
      isFullyClosed = true;
    }

    if (!isFullyClosed) {
      remainingPositions.push(pos);
    }
  }

  state.openPositions = remainingPositions;
  savePaperTrackerState(state);
  return state;
}

/**
 * 3. Signal Performance Attribution
 * Answers directly: "which signals earn or lose money"
 */
export function calculateSignalAttribution(closedTrades = null) {
  const state = getPaperTrackerState();
  const trades = closedTrades || state.closedJournal || [];

  if (trades.length === 0) {
    return {
      totalClosedTrades: 0,
      overall: { realizedPnl: 0, winRatePct: 0, profitFactor: 0 },
      signals: {},
      summary: 'No closed trades recorded yet in journal.'
    };
  }

  const attributionMap = {};

  for (const trade of trades) {
    const triggers = Array.isArray(trade.triggers) && trade.triggers.length > 0
      ? trade.triggers
      : ['UNSPECIFIED_SIGNAL'];

    for (const sig of triggers) {
      if (!attributionMap[sig]) {
        attributionMap[sig] = {
          signal: sig,
          tradesCount: 0,
          wins: 0,
          losses: 0,
          grossGains: 0,
          grossLosses: 0,
          netPnlNpr: 0,
          totalReturnPct: 0
        };
      }

      const rec = attributionMap[sig];
      rec.tradesCount++;
      rec.netPnlNpr += trade.realizedPnl;
      rec.totalReturnPct += trade.returnPct;

      if (trade.realizedPnl > 0) {
        rec.wins++;
        rec.grossGains += trade.realizedPnl;
      } else {
        rec.losses++;
        rec.grossLosses += Math.abs(trade.realizedPnl);
      }
    }
  }

  const results = {};
  for (const [sig, rec] of Object.entries(attributionMap)) {
    const winRatePct = Number(((rec.wins / rec.tradesCount) * 100).toFixed(1));
    const profitFactor = rec.grossLosses > 0
      ? Number((rec.grossGains / rec.grossLosses).toFixed(2))
      : (rec.grossGains > 0 ? 99.9 : 0);
    const avgReturnPct = Number((rec.totalReturnPct / rec.tradesCount).toFixed(2));

    let edgeVerdict = 'NEUTRAL';
    if (profitFactor >= 2.0 && winRatePct >= 60) edgeVerdict = 'HIGH_ALPHA_SIGNAL';
    else if (rec.netPnlNpr > 0 && profitFactor > 1.2) edgeVerdict = 'POSITIVE_EDGE';
    else if (rec.netPnlNpr < 0) edgeVerdict = 'DRAG_LOSS_SIGNAL';

    results[sig] = {
      signal: sig,
      tradesCount: rec.tradesCount,
      wins: rec.wins,
      losses: rec.losses,
      winRatePct,
      netPnlNpr: Number(rec.netPnlNpr.toFixed(2)),
      avgReturnPct,
      profitFactor,
      edgeVerdict
    };
  }

  return {
    totalClosedTrades: trades.length,
    signals: results
  };
}

/**
 * 4. Auto-Bot Execution Configuration & Signal Ingestion
 */
const AUTOBOT_CONFIG_KEY = 'drabyashree_autobot_config_v1';

const DEFAULT_AUTOBOT_CONFIG = {
  enabled: true,
  riskPerTradePct: 1.5,
  maxConcurrentPositions: 5,
  trailingRatchetPolicy: 'DYNAMIC_RATCHET',
  minCompositeScore: 75,
  minConfidence: 70
};

let memBotConfig = { ...DEFAULT_AUTOBOT_CONFIG };

export function getAutoBotConfig() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(AUTOBOT_CONFIG_KEY);
      if (raw) return { ...DEFAULT_AUTOBOT_CONFIG, ...JSON.parse(raw) };
    } catch (_) {}
  }
  return { ...memBotConfig };
}

export function saveAutoBotConfig(cfg) {
  memBotConfig = { ...memBotConfig, ...cfg };
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(AUTOBOT_CONFIG_KEY, JSON.stringify(memBotConfig));
    } catch (_) {}
  }
  return { ...memBotConfig };
}

export function evaluateAutoBotSignals({ signals = [], marketQuotes = {}, date = formatNptDateIso(new Date()) }) {
  const config = getAutoBotConfig();
  if (!config.enabled) {
    return { executedCount: 0, executedPicks: [], reason: 'Auto-bot mode is currently paused by user.' };
  }

  const state = getPaperTrackerState();
  if (state.openPositions.length >= config.maxConcurrentPositions) {
    return { executedCount: 0, reason: `Max concurrent positions limit (${config.maxConcurrentPositions}) reached.` };
  }

  let executedCount = 0;
  const executedPicks = [];

  for (const sig of signals) {
    if (state.openPositions.length >= config.maxConcurrentPositions) break;

    const sym = String(sig.symbol || '').toUpperCase().trim();
    if (!sym || state.openPositions.some(p => p.symbol === sym)) continue;

    const score = Number(sig.compositeScore || sig.score || 0);
    const conf = Number(sig.confidence || 0);
    const action = String(sig.action || 'BUY').toUpperCase();

    if (action !== 'BUY' || score < config.minCompositeScore || conf < config.minConfidence) {
      continue;
    }

    const quote = marketQuotes[sym] || {};
    const ltp = Number(quote.ltp || sig.entryPrice || sig.ltp || (Array.isArray(sig.entryZone) ? sig.entryZone[0] : 0));
    const prevClose = Number(quote.prevClose || quote.previousClose || ltp);

    // Guard: Upper circuit freeze check (+9.90% for 10% limit or +14.95% for 15% limit)
    const quotePctChange = Number(quote.pctChange ?? quote.pointChangePct ?? 0);
    const calculatedPct = prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;
    const pChangePct = quotePctChange || calculatedPct;
    if (pChangePct >= 9.90) continue;
    if (ltp <= 0) continue;

    // Position sizing: Fixed fractional risk (e.g. 1.5% max capital risk)
    const riskCapital = state.capital * (config.riskPerTradePct / 100);
    const stopLoss = sig.stopLoss || Number((ltp * 0.95).toFixed(1));
    const riskPerShare = Math.max(1, ltp - stopLoss);
    let targetShares = Math.floor(riskCapital / riskPerShare);
    targetShares = Math.floor(targetShares / 10) * 10; // Round to NEPSE regular board lot (10 kitta)

    // Capital budget ceiling: Max 20% of total capital in a single position
    const maxKittaByCapital = Math.floor((state.capital * 0.20) / ltp / 10) * 10;
    const finalShares = Math.max(10, Math.min(targetShares, maxKittaByCapital));

    const grossVal = finalShares * ltp;
    const comm = calculateBrokerCommission(grossVal);
    const sebon = calculateSebonFee(grossVal);
    const totalOutflow = grossVal + comm + sebon;

    if (state.capital >= totalOutflow) {
      const pickRecord = recordPaperPick({
        date,
        stock: { symbol: sym, ltp, sector: sig.sector },
        scoringResult: {
          symbol: sym,
          action: 'BUY',
          compositeScore: score,
          confidence: conf,
          scoreBreakdown: sig.scoreBreakdown,
          executionPlan: {
            entryLtp: ltp,
            stopLoss,
            target1: sig.target1,
            target2: sig.target2,
            positionSizing: {
              sharesKitta: finalShares,
              capitalRequiredNpr: totalOutflow
            }
          }
        },
        autoExecuteBuy: true
      });
      executedCount++;
      executedPicks.push(pickRecord);
    }
  }

  return {
    executedCount,
    executedPicks,
    openPositionsCount: state.openPositions.length,
    remainingCapital: state.capital
  };
}

