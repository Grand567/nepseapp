// proxy/smartAlertEngine.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAVYASHREE SMART INSTITUTIONAL ALERT ENGINE
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Solves the critical retail constraint: monitoring TMS from 11:00 AM – 3:00 PM NPT (Monday to Friday).
 * Automatically evaluates 3 simultaneous institutional criteria:
 *   Condition 1: Price in [VWAP Support, VWAP + 2.0%] (Inside Buy Zone)
 *   Condition 2: Buyer Concentration (Top 3 Brokers) > 50%
 *   Condition 3: Seller Volume at Support < 20-day Average Daily Volume
 *
 * State Machine:
 *   IDLE ──(2/3 met)──► PENDING ──(3/3 met)──► TRIGGERED ──► COOLDOWN (90m)
 *
 * Push Notifications:
 *   Dispatches instant lockscreen notification via Firebase Cloud Messaging (FCM).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getBrokerName, aggregateFloorsheetRows, fetchShareSansarFloorsheet } from './brokerVault.mjs';
import { getDetailedMarketStatus } from '../src/utils/nepseCalendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'smart_alert_state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'smart_alert_history.json');
const TOKENS_FILE = path.join(DATA_DIR, 'push_tokens.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[SmartAlertEngine] Failed to create data dir:', e.message);
}

// ── 1. PERSISTENCE HELPERS ──────────────────────────────────────────────────

function loadJson(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`[SmartAlertEngine] Failed reading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[SmartAlertEngine] Failed saving ${filePath}:`, err.message);
  }
}

// State storage: symbol -> { state, pendingScans, lastTriggeredAt, lastEvaluatedAt, lastAlert }
let alertStateMap = loadJson(STATE_FILE, {});
// History log: array of triggered alerts
let alertHistory = loadJson(HISTORY_FILE, []);
// Push Tokens: array of { token, platform, registeredAt, lastActiveAt }
let pushTokens = loadJson(TOKENS_FILE, []);

// ── 2. FIREBASE ADMIN FCM INITIALIZATION ────────────────────────────────────

let isFcmInitialized = false;
let fcmMessaging = null;

try {
  let creds = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    try {
      creds = JSON.parse(raw);
    } catch (_) {
      // Try decoding base64 if user encoded it
      try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        creds = JSON.parse(decoded);
      } catch (e2) {
        console.warn('[SmartAlertEngine] Could not parse FIREBASE_SERVICE_ACCOUNT JSON/Base64:', e2.message);
      }
    }
  } else if (fs.existsSync(path.join(__dirname, 'firebase-service-account.json'))) {
    try {
      creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-service-account.json'), 'utf8'));
    } catch (e3) {
      console.warn('[SmartAlertEngine] Error reading firebase-service-account.json:', e3.message);
    }
  }

  if (creds && creds.private_key) {
    // Normalize escaped newlines in private key if pasted as string
    if (typeof creds.private_key === 'string' && creds.private_key.includes('\\n')) {
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');
    }
    const app = getApps().length === 0 ? initializeApp({
      credential: cert(creds),
      projectId: creds.project_id || 'drabyashree-nepse-hub-11ef9'
    }) : getApps()[0];
    fcmMessaging = getMessaging(app);
    isFcmInitialized = true;
    console.log('[SmartAlertEngine] ✅ Firebase Admin FCM successfully authenticated with private key.');
  } else {
    try {
      const app = getApps().length === 0 ? initializeApp({
        projectId: 'drabyashree-nepse-hub-11ef9'
      }) : getApps()[0];
      fcmMessaging = getMessaging(app);
      isFcmInitialized = true;
      console.log('[SmartAlertEngine] Firebase Admin initialized with project ID drabyashree-nepse-hub-11ef9.');
    } catch (eInit) {
      console.warn('[SmartAlertEngine] Firebase Admin default init notice:', eInit.message);
    }
  }
} catch (fcmErr) {
  console.warn('[SmartAlertEngine] FCM initialization notice:', fcmErr.message);
}

// In-memory active broadcast queue for connected web/client SSE listeners
const alertSubscribers = new Set();

export function subscribeAlertEvents(res) {
  alertSubscribers.add(res);
  return () => alertSubscribers.delete(res);
}

export function broadcastAlert(alertPayload) {
  // 1. Dispatch to in-memory web/app listeners
  const dataString = `data: ${JSON.stringify(alertPayload)}\n\n`;
  for (const client of alertSubscribers) {
    try {
      client.write(dataString);
    } catch (_) {
      alertSubscribers.delete(client);
    }
  }

  // 2. Dispatch Push Notification via FCM
  dispatchFcmNotification(alertPayload).catch(err => {
    console.warn('[SmartAlertEngine] Push dispatch warning:', err.message);
  });
}

// ── 3. FCM PUSH DISPATCHER ──────────────────────────────────────────────────

export async function registerPushToken(token, platform = 'android') {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  const existingIdx = pushTokens.findIndex(p => p.token === cleanToken);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    pushTokens[existingIdx].lastActiveAt = now;
    pushTokens[existingIdx].platform = platform;
  } else {
    pushTokens.push({
      token: cleanToken,
      platform,
      registeredAt: now,
      lastActiveAt: now
    });
  }

  saveJson(TOKENS_FILE, pushTokens);
  console.log(`[SmartAlertEngine] Push token registered (${platform}). Total tokens: ${pushTokens.length}`);

  // Subscribe token to 'institutional_alerts' topic if FCM is active
  if (isFcmInitialized && fcmMessaging) {
    try {
      await fcmMessaging.subscribeToTopic([cleanToken], 'institutional_alerts');
    } catch (subErr) {
      console.warn('[SmartAlertEngine] Error subscribing token to topic:', subErr.message);
    }
  }
  return true;
}

export async function dispatchFcmNotification(alertItem) {
  const symbol = alertItem.symbol;
  const ltp = alertItem.ltp;
  const buyZone = alertItem.buyZone || {};
  const brokersText = alertItem.dominantBrokersText || `Brokers ${alertItem.topBuyerBrokers?.map(b => b.broker).join(', ')}`;
  const concentration = alertItem.concentrationPct || 52;
  const targetText = `NPR ${alertItem.target1 || Math.round(ltp * 1.15)} - ${alertItem.target2 || Math.round(ltp * 1.25)}`;
  const stopLossText = `NPR ${alertItem.stopLoss || Math.round(ltp * 0.95)}`;

  const title = `🔔 Dravyashree Alert: ${symbol} is Ready for Entry`;
  const body = `LTP: NPR ${ltp.toFixed(2)} (Inside Buy Zone: ${buyZone.low || (ltp * 0.99).toFixed(0)} - ${buyZone.high || (ltp * 1.02).toFixed(0)})\n` +
    `${brokersText} absorbing ${concentration}% of morning float. Seller volume dry.\n` +
    `Target: ${targetText} | Stop-Loss: ${stopLossText}`;

  console.log(`[SmartAlertEngine] 🚀 DISPATCHING ALERT for ${symbol}:\n${body}`);

  const fcmPayload = {
    notification: {
      title,
      body,
    },
    data: {
      action: 'OPEN_ACCUMULATION_CARD',
      symbol: String(symbol),
      ltp: String(ltp),
      entryLow: String(buyZone.low || ''),
      entryHigh: String(buyZone.high || ''),
      target1: String(alertItem.target1 || ''),
      target2: String(alertItem.target2 || ''),
      stopLoss: String(alertItem.stopLoss || ''),
      brokersText: String(brokersText),
      concentrationPct: String(concentration),
      timestamp: String(Date.now()),
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'dravyashree_institutional_alerts',
        clickAction: 'OPEN_ACCUMULATION_CARD',
        icon: 'ic_stat_notification',
        color: '#10b981', // Emerald green
      }
    }
  };

  if (!isFcmInitialized || !fcmMessaging) {
    console.warn('[SmartAlertEngine] FCM admin not fully authenticated with private key; alert saved locally and broadcasted to live clients.');
    return { success: true, count: 0, notice: 'Local broadcast only (FCM credentials pending)' };
  }

  try {
    // 1. Send to topic 'institutional_alerts'
    const topicRes = await fcmMessaging.send({
      ...fcmPayload,
      topic: 'institutional_alerts'
    });
    console.log('[SmartAlertEngine] FCM topic message sent successfully:', topicRes);
  } catch (topicErr) {
    console.warn('[SmartAlertEngine] FCM topic send error:', topicErr.message);
  }

  // 2. Multicast to registered individual device tokens
  const activeTokens = pushTokens.map(p => p.token).filter(Boolean);
  if (activeTokens.length > 0) {
    try {
      const response = await fcmMessaging.sendEachForMulticast({
        ...fcmPayload,
        tokens: activeTokens.slice(-500) // batch of up to 500
      });
      console.log(`[SmartAlertEngine] Multicast sent: ${response.successCount} success, ${response.failureCount} failed.`);
      return { success: true, successCount: response.successCount, failureCount: response.failureCount };
    } catch (multiErr) {
      console.warn('[SmartAlertEngine] Multicast error:', multiErr.message);
    }
  }

  return { success: true, topicSent: true };
}

// ── 4. QUANTITATIVE CONDITION EVALUATION ─────────────────────────────────────

/**
 * Evaluates whether a stock meets the 3 Simultaneous Institutional Criteria:
 *   Condition 1: Price in [VWAP Support, VWAP + 2%]
 *   Condition 2: Top 3 Buyer Concentration (BCR3) > 50%
 *   Condition 3: Seller Volume at Support < 20-day Average Daily Volume
 */
export function evaluateStockAlertConditions({
  symbol,
  ltp,
  high,
  low,
  turnover,
  volume,
  floorsheetTrades = [],
  avgVolume20D = 0,
  priceHistory = [],
  elapsedMinutes = null
}) {
  const sym = String(symbol || '').toUpperCase().trim();
  const currentLtp = Number(ltp || 0);

  if (!sym || currentLtp <= 0) {
    return { isQualified: false, reason: 'Invalid price or symbol' };
  }

  // ── Calculate Real Intraday VWAP ──
  let vwap = 0;
  if (floorsheetTrades && floorsheetTrades.length > 0) {
    let totQty = 0;
    let totAmt = 0;
    floorsheetTrades.forEach(t => {
      const q = Number(t.qty || t.quantity || t.contractQuantity || 0);
      const r = Number(t.rate || t.contractRate || 0);
      const a = Number(t.amount || (q * r) || 0);
      totQty += q;
      totAmt += a;
    });
    if (totQty > 0) vwap = +(totAmt / totQty).toFixed(2);
  }

  // Fallback to turnover / volume if floorsheet trades not passed directly
  if (vwap <= 0 && turnover > 0 && volume > 0) {
    vwap = +(turnover / volume).toFixed(2);
  }

  // Fallback to typical price (H+L+C)/3 if early morning with few trades
  if (vwap <= 0) {
    const h = Number(high || currentLtp);
    const l = Number(low || currentLtp);
    vwap = +((h + l + currentLtp) / 3).toFixed(2);
  }

  // ── Condition 1: Price in Base [VWAP Support, VWAP + 2.0%] ──
  // Tolerance: from 0.5% below VWAP (testing VWAP support) up to 2.0% above VWAP
  const vwapSupportLow = +(vwap * 0.995).toFixed(2);
  const vwapUpperBand = +(vwap * 1.020).toFixed(2);
  const isPriceInBase = currentLtp >= vwapSupportLow && currentLtp <= vwapUpperBand;
  const priceDistanceToVwapPct = +(((currentLtp - vwap) / vwap) * 100).toFixed(2);

  // ── Condition 2: Top 3 Buyer Concentration (BCR3) > 50% ──
  let bcr3 = 0;
  let topBuyerBrokers = [];
  let dominantBrokersText = '';
  let totalBuyVolume = 0;
  let totalSellVolume = 0;

  if (floorsheetTrades && floorsheetTrades.length > 0) {
    // Purge wash trades: BuyerBroker === SellerBroker
    const decontaminated = floorsheetTrades.filter(t => {
      const b = String(t.buyerBroker || t.buyer || '').trim();
      const s = String(t.sellerBroker || t.seller || '').trim();
      return !(b && s && b === s);
    });

    const buyerMap = {};
    const sellerMap = {};

    decontaminated.forEach(t => {
      const b = String(t.buyerBroker || t.buyer || '').trim();
      const s = String(t.sellerBroker || t.seller || '').trim();
      const q = Number(t.qty || t.quantity || 0);
      const amt = Number(t.amount || (q * Number(t.rate || 0)) || 0);

      if (b) {
        buyerMap[b] = buyerMap[b] || { broker: b, name: getBrokerName(b), buyQty: 0, buyAmt: 0 };
        buyerMap[b].buyQty += q;
        buyerMap[b].buyAmt += amt;
        totalBuyVolume += q;
      }
      if (s) {
        sellerMap[s] = sellerMap[s] || { broker: s, name: getBrokerName(s), sellQty: 0, sellAmt: 0 };
        sellerMap[s].sellQty += q;
        sellerMap[s].sellAmt += amt;
        totalSellVolume += q;
      }
    });

    const sortedBuyers = Object.values(buyerMap).sort((a, b) => b.buyQty - a.buyQty);
    topBuyerBrokers = sortedBuyers.slice(0, 3);
    const top3BuyQty = topBuyerBrokers.reduce((sum, b) => sum + b.buyQty, 0);

    if (totalBuyVolume > 0) {
      bcr3 = +(top3BuyQty / totalBuyVolume).toFixed(3);
    }

    if (topBuyerBrokers.length > 0) {
      const bNames = topBuyerBrokers.map(b => `Broker ${b.broker}`);
      dominantBrokersText = bNames.slice(0, 2).join(' & ');
    }
  }

  // If floorsheet not available or empty, calculate default estimates
  const isBuyerConcentrationMet = bcr3 >= 0.50; // BCR3 > 50%
  const concentrationPct = Math.round(bcr3 * 100);

  // ── Condition 3: Seller Volume at Support < 20-Day Average Daily Volume ──
  // Paced Seller Volume: During live market hours (11:00 to 15:00 = 240 mins), scale current intraday volume.
  // Outside market hours (or in backtest/test suite), timeScaleFactor defaults to 1.0.
  let baselineAvgVolume = Number(avgVolume20D || 0);
  if (baselineAvgVolume <= 0 && Array.isArray(priceHistory) && priceHistory.length >= 5) {
    const candles = priceHistory.slice(-21, -1);
    const sum = candles.reduce((acc, c) => acc + (Number(c.volume || c.totalTradedQuantity || 0)), 0);
    baselineAvgVolume = candles.length > 0 ? Math.round(sum / candles.length) : 0;
  }
  if (baselineAvgVolume <= 0) baselineAvgVolume = 50000; // Reasonable NEPSE baseline fallback

  const status = getDetailedMarketStatus();
  const nptMins = status.nptTotalMinutes;
  let timeScaleFactor = 1.0;

  if (typeof elapsedMinutes === 'number' && elapsedMinutes > 0) {
    const elapsed = Math.max(15, Math.min(240, elapsedMinutes));
    timeScaleFactor = 240 / elapsed;
  } else if (status.isOpen) {
    const elapsedTradingMins = Math.max(15, Math.min(240, nptMins - 660));
    timeScaleFactor = 240 / elapsedTradingMins;
  }

  // Actual or estimated selling volume
  const intradaySellerVol = totalSellVolume > 0 ? totalSellVolume : (volume > 0 ? volume * 0.45 : 10000);
  const projectedDailySellerVol = intradaySellerVol * timeScaleFactor;
  const sellerPaceRatio = baselineAvgVolume > 0 ? +(projectedDailySellerVol / baselineAvgVolume).toFixed(2) : 0.65;

  // Condition 3 is met if projected seller volume is dry (< 0.85x of 20-day average)
  const isSellerVolumeDry = sellerPaceRatio < 0.85;

  // ── Targets & Stop-Loss Calculation ──
  // Target 1: +12% to +15% resistance zone
  // Target 2: +20% to +25% swing expansion
  // Stop-Loss: 4% below VWAP or 1.5 ATR below support
  let atr = currentLtp * 0.035; // default 3.5% ATR
  if (Array.isArray(priceHistory) && priceHistory.length >= 14) {
    const recent = priceHistory.slice(-14);
    const ranges = recent.map(c => Number(c.high || c.close || currentLtp) - Number(c.low || c.close || currentLtp));
    atr = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }

  const buyZoneLow = Math.floor(vwapSupportLow);
  const buyZoneHigh = Math.ceil(vwapUpperBand);
  const target1 = Math.round(currentLtp * 1.15);
  const target2 = Math.round(currentLtp * 1.25);
  const stopLoss = Math.round(Math.min(vwap * 0.96, currentLtp - (atr * 1.2)));

  const conditionsMetCount = (isPriceInBase ? 1 : 0) + (isBuyerConcentrationMet ? 1 : 0) + (isSellerVolumeDry ? 1 : 0);
  const allConditionsMet = isPriceInBase && isBuyerConcentrationMet && isSellerVolumeDry;

  return {
    symbol: sym,
    ltp: currentLtp,
    vwap,
    priceDistanceToVwapPct,
    buyZone: {
      low: buyZoneLow,
      high: buyZoneHigh,
      isPriceInBase,
      statusText: isPriceInBase ? `Inside Buy Zone: ${buyZoneLow} - ${buyZoneHigh}` : `Outside Zone: ${currentLtp} vs ${vwap}`
    },
    buyerConcentration: {
      bcr3,
      concentrationPct,
      isBuyerConcentrationMet,
      topBuyerBrokers,
      dominantBrokersText: dominantBrokersText || 'Institutional Accumulators',
      totalBuyVolume
    },
    sellerPressure: {
      intradaySellerVol,
      projectedDailySellerVol: Math.round(projectedDailySellerVol),
      baselineAvgVolume,
      sellerPaceRatio,
      isSellerVolumeDry,
      statusText: isSellerVolumeDry ? `Seller volume dry (${sellerPaceRatio}x of 20-day avg)` : `Active seller pressure (${sellerPaceRatio}x)`
    },
    levels: {
      target1,
      target2,
      stopLoss,
      riskRewardRatio: +((target1 - currentLtp) / Math.max(1, currentLtp - stopLoss)).toFixed(2)
    },
    conditions: {
      condition1_priceInBase: isPriceInBase,
      condition2_buyerConcentration: isBuyerConcentrationMet,
      condition3_sellerVolumeDry: isSellerVolumeDry,
      conditionsMetCount,
      allMet: allConditionsMet
    }
  };
}

// ── 5. STATE MACHINE & ALERT WORKFLOW ────────────────────────────────────────

const COOLDOWN_DURATION_MS = 90 * 60 * 1000; // 90 minutes cooldown

export async function processStockTickEvaluation(evaluationData) {
  const { symbol, conditions, ltp, buyZone, buyerConcentration, sellerPressure, levels } = evaluationData;
  const sym = String(symbol).toUpperCase().trim();
  const now = Date.now();

  // Retrieve or create state for symbol
  const state = alertStateMap[sym] || {
    state: 'IDLE', // 'IDLE' | 'PENDING' | 'TRIGGERED' | 'COOLDOWN'
    pendingScans: 0,
    lastTriggeredAt: null,
    lastEvaluatedAt: now,
    historyCount: 0
  };

  state.lastEvaluatedAt = now;

  // Check cooldown status
  if (state.state === 'COOLDOWN') {
    if (state.lastTriggeredAt && (now - state.lastTriggeredAt < COOLDOWN_DURATION_MS)) {
      alertStateMap[sym] = state;
      return { triggered: false, state: 'COOLDOWN', remainingMins: Math.ceil((COOLDOWN_DURATION_MS - (now - state.lastTriggeredAt)) / 60000) };
    } else {
      // Cooldown expired — reset to IDLE
      state.state = 'IDLE';
      state.pendingScans = 0;
    }
  }

  // State Transition Logic
  if (conditions.allMet) {
    // If all 3 conditions met
    state.pendingScans += 1;

    // Trigger alert immediately on confirmed criteria
    state.state = 'TRIGGERED';
    state.lastTriggeredAt = now;
    state.historyCount += 1;

    const alertItem = {
      id: `alert_${sym}_${now}`,
      symbol: sym,
      ltp,
      triggeredAt: new Date(now).toISOString(),
      buyZone: buyZone,
      dominantBrokersText: buyerConcentration.dominantBrokersText,
      concentrationPct: buyerConcentration.concentrationPct,
      topBuyerBrokers: buyerConcentration.topBuyerBrokers,
      sellerStatus: sellerPressure.statusText,
      target1: levels.target1,
      target2: levels.target2,
      stopLoss: levels.stopLoss,
      riskRewardRatio: levels.riskRewardRatio,
      vwap: evaluationData.vwap,
      status: 'ACTIVE'
    };

    // Store in history
    alertHistory.unshift(alertItem);
    if (alertHistory.length > 100) alertHistory.pop();
    saveJson(HISTORY_FILE, alertHistory);

    // Transition state to COOLDOWN
    state.state = 'COOLDOWN';
    alertStateMap[sym] = state;
    saveJson(STATE_FILE, alertStateMap);

    // Broadcast push notification
    broadcastAlert(alertItem);

    return { triggered: true, alert: alertItem, state: 'TRIGGERED' };
  } else if (conditions.conditionsMetCount >= 2) {
    // 2 of 3 met -> PENDING
    state.state = 'PENDING';
    state.pendingScans += 1;
    alertStateMap[sym] = state;
    return { triggered: false, state: 'PENDING', conditionsMetCount: conditions.conditionsMetCount };
  } else {
    // Criteria collapsed
    if (state.state === 'PENDING') {
      state.pendingScans = 0;
    }
    state.state = 'IDLE';
    alertStateMap[sym] = state;
    return { triggered: false, state: 'IDLE' };
  }
}

// ── 6. PIPELINE SCANNER (RUNS DURING MARKET HOURS) ───────────────────────────

let isScannerRunning = false;

export async function runMarketAlertScanCycle({
  getMarketStocks,
  getFloorsheet,
  getPriceHistory
}) {
  if (isScannerRunning) return;
  isScannerRunning = true;

  try {
    const marketStatus = getDetailedMarketStatus();
    // Allow scan during live trading session (11:00 AM - 3:00 PM NPT)
    const isLive = marketStatus.isTradingDay && marketStatus.nptTotalMinutes >= 660 && marketStatus.nptTotalMinutes <= 900;

    const stocks = await getMarketStocks();
    if (!Array.isArray(stocks) || stocks.length === 0) {
      isScannerRunning = false;
      return;
    }

    // Sort by turnover / volume to prioritize the most liquid 60 stocks
    const candidatePool = [...stocks]
      .filter(s => Number(s.turnover || s.totalTradedValue || 0) > 1000000 || Number(s.volume || s.totalTradedQuantity || 0) > 10000)
      .sort((a, b) => (Number(b.turnover || 0) - Number(a.turnover || 0)))
      .slice(0, 40);

    for (const stock of candidatePool) {
      const sym = String(stock.symbol || stock.scrip || '').toUpperCase().trim();
      if (!sym) continue;

      try {
        let floorsheetTrades = [];
        if (typeof getFloorsheet === 'function') {
          floorsheetTrades = await getFloorsheet(sym);
        }
        if (!floorsheetTrades || floorsheetTrades.length === 0) {
          floorsheetTrades = await fetchShareSansarFloorsheet(sym, 200);
        }

        let history = [];
        if (typeof getPriceHistory === 'function') {
          history = await getPriceHistory(sym);
        }

        const evaluation = evaluateStockAlertConditions({
          symbol: sym,
          ltp: stock.ltp || stock.lastTradedPrice,
          high: stock.highPrice || stock.high,
          low: stock.lowPrice || stock.low,
          turnover: stock.turnover || stock.totalTradedValue,
          volume: stock.volume || stock.totalTradedQuantity,
          floorsheetTrades,
          avgVolume20D: stock.avgVolume20D,
          priceHistory: history
        });

        await processStockTickEvaluation(evaluation);
      } catch (stockErr) {
        // Continue to next stock
      }
    }
  } catch (err) {
    console.warn('[SmartAlertEngine] Error in scan cycle:', err.message);
  } finally {
    isScannerRunning = false;
  }
}

// ── 7. MANUAL TEST TRIGGER (FOR TESTING & IMMEDIATE DEMONSTRATION) ───────────

export async function testTriggerAlert(customSymbol = 'GHL', mockParams = {}) {
  const sym = String(customSymbol || 'GHL').toUpperCase().trim();
  const ltp = Number(mockParams.ltp || 269.50);
  const vwap = Number(mockParams.vwap || 270.00);
  const buyZoneLow = Math.round(vwap * 0.995);
  const buyZoneHigh = Math.round(vwap * 1.018);

  const mockEvaluation = {
    symbol: sym,
    ltp,
    vwap,
    priceDistanceToVwapPct: -0.19,
    buyZone: {
      low: buyZoneLow,
      high: buyZoneHigh,
      isPriceInBase: true,
      statusText: `Inside Buy Zone: ${buyZoneLow} - ${buyZoneHigh}`
    },
    buyerConcentration: {
      bcr3: 0.524,
      concentrationPct: 52,
      isBuyerConcentrationMet: true,
      topBuyerBrokers: [
        { broker: '58', name: 'Naasa Securities', buyQty: 18500, buyAmt: 4985750 },
        { broker: '45', name: 'Imperial Securities', buyQty: 12200, buyAmt: 3287900 },
        { broker: '34', name: 'Vision Securities', buyQty: 8400, buyAmt: 2263800 }
      ],
      dominantBrokersText: 'Broker 58 & 45',
      totalBuyVolume: 74600
    },
    sellerPressure: {
      intradaySellerVol: 24200,
      projectedDailySellerVol: 48400,
      baselineAvgVolume: 82000,
      sellerPaceRatio: 0.59,
      isSellerVolumeDry: true,
      statusText: 'Seller volume dry (0.59x of 20-day avg)'
    },
    levels: {
      target1: 310,
      target2: 325,
      stopLoss: 258,
      riskRewardRatio: 3.52
    },
    conditions: {
      condition1_priceInBase: true,
      condition2_buyerConcentration: true,
      condition3_sellerVolumeDry: true,
      conditionsMetCount: 3,
      allMet: true
    }
  };

  // Reset symbol state to force trigger
  alertStateMap[sym] = {
    state: 'IDLE',
    pendingScans: 0,
    lastTriggeredAt: null,
    lastEvaluatedAt: Date.now(),
    historyCount: 0
  };

  const result = await processStockTickEvaluation(mockEvaluation);
  return result;
}

// ── 8. EXPORT PUBLIC STATE QUERIES ──────────────────────────────────────────

export function getActiveSmartAlerts() {
  const now = Date.now();
  // Filter alerts triggered within today's session (last 6 hours)
  return alertHistory.filter(a => {
    const t = new Date(a.triggeredAt).getTime();
    return (now - t) < (6 * 60 * 60 * 1000);
  });
}

export function getSmartAlertHistory(limit = 50) {
  return alertHistory.slice(0, limit);
}

export function resetSymbolAlertState(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (sym && alertStateMap[sym]) {
    delete alertStateMap[sym];
    saveJson(STATE_FILE, alertStateMap);
  }
}

export function getSmartAlertSystemStatus() {
  const status = getDetailedMarketStatus();
  return {
    isFcmInitialized,
    registeredPushTokensCount: pushTokens.length,
    activeAlertsToday: getActiveSmartAlerts().length,
    totalHistoryCount: alertHistory.length,
    marketSession: status.session,
    isTradingDay: status.isTradingDay,
    nptTotalMinutes: status.nptTotalMinutes,
    updatedAt: new Date().toISOString()
  };
}

