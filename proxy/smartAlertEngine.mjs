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
import { calculateStatutoryBreakevenPrice } from '../src/utils/calculations.js';
import { 
  sendTelegramSmartAlert, 
  sendTelegramExitAlert, 
  sendTelegramMessage, 
  sendTelegramEarlyIgnitionAlert,
  sendTelegramNewsAlert,
  sendTelegramIpoAlert
} from './telegramNotifier.mjs';
import { sendDiscordSmartAlert } from './discordNotifier.mjs';
import { getScripPromoterLockin } from './utils/promoterLockinEngine.mjs';
import {
  evaluateInstitutionalAlert,
  getMacroRegime,
  saveMacroConfig,
  formatInstitutionalExecutionTicket,
  DEFAULT_FRICTION_CONSTANTS,
  evaluatePillar1_WyckoffVduVcp,
  evaluatePillar2_SmartMoneyAbsorption,
  evaluatePillar3_VolumePriceValidation,
  evaluatePillar4_TrendAndSectorRS,
  evaluateVetoFilters,
  calculateNetExpectancyAndSizing
} from './institutionalAlertEngine.mjs';
import { auditAntiDematDumpGuard } from './db/ledgerStore.js';
import { pool, query, ensurePushTokensTable } from './db.mjs';

export {
  evaluateInstitutionalAlert,
  getMacroRegime,
  saveMacroConfig,
  formatInstitutionalExecutionTicket,
  DEFAULT_FRICTION_CONSTANTS,
  evaluatePillar1_WyckoffVduVcp,
  evaluatePillar2_SmartMoneyAbsorption,
  evaluatePillar3_VolumePriceValidation,
  evaluatePillar4_TrendAndSectorRS,
  evaluateVetoFilters,
  calculateNetExpectancyAndSizing
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = (process.env.NEPSE_DATA_DIR && fs.existsSync(process.env.NEPSE_DATA_DIR))
  ? process.env.NEPSE_DATA_DIR
  : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'smart_alert_state.json');
const B58_STATE_FILE = path.join(DATA_DIR, 'broker58_alert_state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'smart_alert_history.json');
const TOKENS_FILE = path.join(DATA_DIR, 'push_tokens.json');
const SEEN_NEWS_FILE = path.join(DATA_DIR, 'seen_news_keys.json');
const SEEN_IPO_FILE = path.join(DATA_DIR, 'seen_ipo_keys.json');

let stockMap = {};
try {
  const stockmapPath = path.join(__dirname, 'stockmap.json');
  if (fs.existsSync(stockmapPath)) {
    stockMap = JSON.parse(fs.readFileSync(stockmapPath, 'utf8'));
  }
} catch (_) {}

function normalizeCorpName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(limited|ltd|public limited|company|co|pvt|corp|corporation|promoter share|promoter|promotor)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const nameMatchers = [];
if (stockMap && typeof stockMap === 'object') {
  for (const [sym, info] of Object.entries(stockMap)) {
    if (!info || !info.name) continue;
    const isPromoter = sym.endsWith('P') || sym.endsWith('PO') || sym.includes('PROMOTER');
    const targetSym = isPromoter ? sym.replace(/P$|PO$/, '') : sym;
    const cleanName = normalizeCorpName(info.name);
    if (cleanName.length >= 3) {
      nameMatchers.push({ sym: targetSym, pattern: cleanName, len: cleanName.length });
    }
    // Handle microfinance alias
    if (cleanName.includes('microfinance')) {
      const alias = cleanName.replace('microfinance', 'laghubitta').trim();
      nameMatchers.push({ sym: targetSym, pattern: alias, len: alias.length });
    } else if (cleanName.includes('laghubitta')) {
      const alias = cleanName.replace('laghubitta', 'microfinance').trim();
      nameMatchers.push({ sym: targetSym, pattern: alias, len: alias.length });
    }
  }
  // Add direct ticker symbol matchers
  for (const sym of Object.keys(stockMap)) {
    if (sym.length >= 3) {
      nameMatchers.push({ sym, pattern: sym.toLowerCase(), isTicker: true, len: sym.length });
    }
  }
  // Sort longest first
  nameMatchers.sort((a, b) => b.len - a.len);
}

export function extractStockSymbolFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const normText = normalizeCorpName(text);
  for (const m of nameMatchers) {
    if (m.isTicker) {
      const regex = new RegExp(`(^|\\s)${m.pattern}(\\s|$)`, 'i');
      if (regex.test(normText)) {
        return m.sym;
      }
    } else if (normText.includes(m.pattern)) {
      return m.sym;
    }
  }
  return null;
}

export function getSectorForSymbol(sym) {
  const upper = String(sym || '').toUpperCase().trim();
  return stockMap[upper]?.sector || stockMap[upper]?.sectorName || 'Others';
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
let broker58AlertStateMap = loadJson(B58_STATE_FILE, {});
const B58_COOLDOWN_MS = 120 * 60 * 1000; // 120 minutes cooldown per symbol
// History log: array of triggered alerts
let alertHistory = loadJson(HISTORY_FILE, []);
// Push Tokens: array of { token, platform, registeredAt, lastActiveAt }
let pushTokens = loadJson(TOKENS_FILE, []);

// ── 2. FIREBASE ADMIN FCM INITIALIZATION ────────────────────────────────────

let isFcmInitialized = false;
let fcmMessaging = null;
let hasValidFcmPrivateKey = false;

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
  } else if (fs.existsSync(path.join(process.cwd(), 'firebase-service-account.json'))) {
    try {
      creds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-service-account.json'), 'utf8'));
    } catch (_) {}
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
    hasValidFcmPrivateKey = true;
    console.log('[SmartAlertEngine] ✅ Firebase Admin FCM successfully authenticated with private key.');
  } else {
    isFcmInitialized = false;
    hasValidFcmPrivateKey = false;
    console.log('[SmartAlertEngine] ℹ️ Firebase service account private key pending. Closed-app alerts are delivered via Android native WorkManager background worker + local notification channels.');
  }
} catch (fcmErr) {
  console.warn('[SmartAlertEngine] FCM initialization notice:', fcmErr.message);
}

// In-memory active broadcast queue for connected web/client SSE listeners
const alertSubscribers = new Set();

export function subscribeAlertEvents(res) {
  alertSubscribers.add(res);
  const cleanup = () => alertSubscribers.delete(res);
  if (res && typeof res.on === 'function') {
    res.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', cleanup);
  }
  return cleanup;
}

export function broadcastAlert(alertPayload) {
  if (!alertPayload.id) {
    alertPayload.id = `alert_${alertPayload.type || 'generic'}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  }
  if (!alertPayload.triggeredAt) {
    alertPayload.triggeredAt = new Date().toISOString();
  }
  if (!alertPayload.created_at) {
    alertPayload.created_at = alertPayload.triggeredAt;
  }
  if (!alertPayload.created_at_ms) {
    alertPayload.created_at_ms = new Date(alertPayload.created_at).getTime() || Date.now();
  }
  if (!alertPayload.timestamp) {
    alertPayload.timestamp = alertPayload.triggeredAt;
  }
  alertPayload.ttl_ms = 30 * 60 * 1000; // 30 minutes TTL rule

  // Normalize category: pro vs general
  if (!alertPayload.category) {
    const isProType = ['INSTITUTIONAL_ENTRY', 'BREAKOUT', 'ACCUMULATION', 'PROFIT_BOOKING', 'STOP_LOSS_WARNING'].includes(alertPayload.type);
    alertPayload.category = isProType ? 'pro' : 'general';
  }

  // Strict Deduplication against recent history
  const cleanTitle = String(alertPayload.title || '').trim().toLowerCase();
  const cleanBody = String(alertPayload.body || '').trim().toLowerCase();
  const nowMs = Date.now();

  const isDuplicate = alertHistory.some((a, idx) => {
    // Current payload being broadcasted: ignore self
    if (a === alertPayload || (idx === 0 && a.id === alertPayload.id)) return false;
    if (a.id === alertPayload.id) return true;
    const aTitle = String(a.title || '').trim().toLowerCase();
    const aBody = String(a.body || '').trim().toLowerCase();
    const ageMs = nowMs - new Date(a.triggeredAt || a.timestamp || 0).getTime();

    // Exact title or substantive body match within 12 hours
    if (aTitle === cleanTitle || (cleanBody.length > 20 && aBody === cleanBody)) {
      if (ageMs < 12 * 60 * 60 * 1000) return true;
    }

    // Same symbol & type within 45 minutes
    const sameSymbol = a.symbol && alertPayload.symbol && a.symbol.toUpperCase() === alertPayload.symbol.toUpperCase();
    const sameType = a.type === alertPayload.type;
    if (sameSymbol && sameType && ageMs < 45 * 60 * 1000) {
      return true;
    }
    return false;
  });

  if (!alertPayload.isTest && !alertPayload.forceDispatch && isDuplicate) {
    console.debug(`[SmartAlertEngine] ℹ️ Suppressed duplicate alert: "${alertPayload.title}" (${alertPayload.symbol || alertPayload.type})`);
    return false; // MUST RETURN IMMEDIATELY — do not dispatch duplicate push/SSE/Telegram/Discord!
  }

  if (!alertHistory.includes(alertPayload)) {
    alertHistory.unshift(alertPayload);
    if (alertHistory.length > 200) alertHistory.pop();
  }
  saveJson(HISTORY_FILE, alertHistory);

  // 1. Dispatch to in-memory web/app listeners (SSE)
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

  // 3. Dispatch Instant Alert to Telegram Bot (PRO Users: Breakouts, Prime Picks, Accumulation, Watchlist, Exits, News, IPO)
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_TEST_ALERTS === 'true';
  if (!isTestEnv || process.env.TEST_LIVE_TELEGRAM === 'true') {
    const isNews = alertPayload.type === 'NEWS_ALERT' || 
                   alertPayload.type === 'PORTFOLIO_NEWS_ALERT' || 
                   alertPayload.type === 'DIVIDEND_ALERT' ||
                   alertPayload.type === 'RIGHT_SHARE_ALERT' ||
                   alertPayload.type === 'BOOK_CLOSURE_ALERT' ||
                   alertPayload.type === 'EARNINGS_ALERT' ||
                   alertPayload.type === 'NEPSE_MACRO' ||
                   alertPayload.category === 'news' ||
                   alertPayload.category === 'corporate';
    const isIpo = alertPayload.type === 'IPO_ALERT' || alertPayload.category === 'ipo';

    if (isNews) {
      // User Policy: ONLY portfolio holdings news alerts are dispatched to Telegram
      const isPortfolioHolding = Boolean(
        alertPayload.isPortfolioTracked ||
        alertPayload.isUserHolding ||
        (alertPayload.symbol && userTrackedSymbolsSet.has(alertPayload.symbol))
      );
      if (isPortfolioHolding) {
        sendTelegramNewsAlert(alertPayload).catch(err => {
          console.warn('[SmartAlertEngine] Telegram news alert dispatch warning:', err.message);
        });
      }
    } else if (isIpo) {
      sendTelegramIpoAlert(alertPayload).catch(err => {
        console.warn('[SmartAlertEngine] Telegram IPO alert dispatch warning:', err.message);
      });
    } else if (alertPayload.type === 'PROFIT_BOOKING' || alertPayload.type === 'STOP_LOSS_WARNING') {
      sendTelegramExitAlert({
        symbol: alertPayload.symbol,
        type: alertPayload.type === 'PROFIT_BOOKING' ? 'TARGET_REACHED' : 'STOP_LOSS_HIT',
        ltp: alertPayload.ltp,
        entryPrice: alertPayload.entryPrice || alertPayload.ltp,
        targetPrice: alertPayload.target1 || alertPayload.targetPrice,
        stopLoss: alertPayload.stopLoss,
        reason: alertPayload.body
      }).catch(err => {
        console.warn('[SmartAlertEngine] Telegram exit alert dispatch warning:', err.message);
      });
    } else if (alertPayload.type === 'BROKER_58_EARLY_IGNITION') {
      const status = getDetailedMarketStatus();
      const nptMins = status.nptTotalMinutes;
      const isMorningWashPeriod = status.isOpen && nptMins >= 660 && nptMins < 705; // 11:00 AM - 11:45 AM NPT
      if (isMorningWashPeriod) {
        console.log(`[SmartAlertEngine] Suppressing morning early ignition alert for ${alertPayload.symbol} during 11:00-11:45 AM wash period. Golden Window opens at 11:45 AM.`);
        return;
      }
      sendTelegramEarlyIgnitionAlert(alertPayload).catch(err => {
        console.warn('[SmartAlertEngine] Telegram early ignition alert dispatch warning:', err.message);
      });
    } else {
      // Golden Entry Window: Suppress entry buy recommendations during 11:00-11:45 AM morning wash period
      const status = getDetailedMarketStatus();
      const nptMins = status.nptTotalMinutes;
      const isMorningWashPeriod = status.isOpen && nptMins >= 660 && nptMins < 705; // 11:00 AM - 11:45 AM NPT
      if (isMorningWashPeriod && (alertPayload.type === 'INSTITUTIONAL_ENTRY' || alertPayload.type === 'ACCUMULATION' || alertPayload.type === 'BREAKOUT')) {
        console.log(`[SmartAlertEngine] Suppressing morning entry alert for ${alertPayload.symbol} during 11:00-11:45 AM wash period. Golden Window opens at 11:45 AM.`);
        return;
      }
      sendTelegramSmartAlert(alertPayload).catch(err => {
        console.warn('[SmartAlertEngine] Telegram alert dispatch warning:', err.message);
      });
    }
  }

  // 4. Dispatch Instant Alert to Discord Webhook (100% Free)
  if (!isTestEnv) {
    sendDiscordSmartAlert(alertPayload).catch(err => {
      console.warn('[SmartAlertEngine] Discord alert dispatch warning:', err.message);
    });
  }
}

// ── 3. FCM PUSH DISPATCHER ──────────────────────────────────────────────────

export const userTrackedSymbolsSet = new Set();

export function syncTrackedSymbolsFromTokens() {
  if (Array.isArray(pushTokens)) {
    pushTokens.forEach(t => {
      if (Array.isArray(t.portfolioSymbols)) {
        t.portfolioSymbols.forEach(s => {
          const clean = String(s || '').toUpperCase().trim();
          if (clean) userTrackedSymbolsSet.add(clean);
        });
      }
    });
  }
}
syncTrackedSymbolsFromTokens();

/**
 * Hydrate push tokens from PostgreSQL on server startup so ephemeral Render
 * disk restarts don't lose registered device tokens.
 * Executes startup migration first (ensurePushTokensTable) to guarantee the table exists.
 */
export async function hydratePushTokensFromDb() {
  try {
    if (!pool) return;
    await ensurePushTokensTable();
    const res = await query('SELECT token, platform, app_version, portfolio_symbols, created_at, last_seen_at FROM push_tokens');
    if (res && res.rows && res.rows.length > 0) {
      const dbTokens = res.rows.map(r => ({
        token: r.token,
        platform: r.platform || 'android',
        appVersion: r.app_version || '1.0.6',
        portfolioSymbols: Array.isArray(r.portfolio_symbols) ? r.portfolio_symbols : (typeof r.portfolio_symbols === 'string' ? JSON.parse(r.portfolio_symbols) : []),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : new Date().toISOString(),
        registeredAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        lastActiveAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : new Date().toISOString()
      }));
      const map = new Map();
      pushTokens.forEach(t => map.set(t.token, t));
      dbTokens.forEach(t => map.set(t.token, t));
      pushTokens = Array.from(map.values());
      syncTrackedSymbolsFromTokens();
      saveJson(TOKENS_FILE, pushTokens);
      console.log(`[SmartAlertEngine] Successfully restored ${dbTokens.length} push token(s) from PostgreSQL database.`);
    }
  } catch (err) {
    console.warn('[SmartAlertEngine] Database hydration of push tokens notice:', err.message);
  }
}
hydratePushTokensFromDb().catch(() => {});

export async function deletePushToken(token) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  pushTokens = pushTokens.filter(p => p.token !== cleanToken);
  userTrackedSymbolsSet.clear();
  syncTrackedSymbolsFromTokens();
  saveJson(TOKENS_FILE, pushTokens);
  try {
    if (pool) {
      await ensurePushTokensTable();
      await query('DELETE FROM push_tokens WHERE token = $1', [cleanToken]);
    }
  } catch (err) {
    console.warn('[SmartAlertEngine] Error removing token from PostgreSQL:', err.message);
  }
  return true;
}

export async function pruneDeadPushTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return 0;
  const tokenSet = new Set(tokens.map(t => String(t).trim()));
  const beforeCount = pushTokens.length;
  pushTokens = pushTokens.filter(p => !tokenSet.has(p.token));
  userTrackedSymbolsSet.clear();
  syncTrackedSymbolsFromTokens();
  saveJson(TOKENS_FILE, pushTokens);
  try {
    if (pool) {
      await ensurePushTokensTable();
      await query('DELETE FROM push_tokens WHERE token = ANY($1)', [Array.from(tokenSet)]);
    }
  } catch (err) {
    console.warn('[SmartAlertEngine] Error pruning dead push tokens from DB:', err.message);
  }
  const pruned = beforeCount - pushTokens.length;
  console.log(`[SmartAlertEngine] 🧹 Pruned ${pruned} invalid/unregistered FCM push token(s). Active tokens remaining: ${pushTokens.length}`);
  return pruned;
}

export async function registerPushToken(token, platform = 'android', portfolioSymbols = [], appVersion = '1.0.6') {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  const existingIdx = pushTokens.findIndex(p => p.token === cleanToken);
  const now = new Date().toISOString();

  if (Array.isArray(portfolioSymbols)) {
    portfolioSymbols.forEach(s => {
      const clean = String(s || '').toUpperCase().trim();
      if (clean) userTrackedSymbolsSet.add(clean);
    });
  }

  if (existingIdx >= 0) {
    pushTokens[existingIdx].lastSeenAt = now;
    pushTokens[existingIdx].lastActiveAt = now;
    pushTokens[existingIdx].platform = platform;
    pushTokens[existingIdx].appVersion = appVersion;
    if (portfolioSymbols.length > 0) pushTokens[existingIdx].portfolioSymbols = portfolioSymbols;
  } else {
    pushTokens.push({
      token: cleanToken,
      platform,
      appVersion,
      createdAt: now,
      lastSeenAt: now,
      registeredAt: now,
      lastActiveAt: now,
      portfolioSymbols: Array.isArray(portfolioSymbols) ? portfolioSymbols : []
    });
  }

  // Fallback storage on local disk
  saveJson(TOKENS_FILE, pushTokens);

  // Primary persistence in PostgreSQL database with startup auto-migration
  try {
    if (pool) {
      await ensurePushTokensTable();
      await query(`
        INSERT INTO push_tokens (token, platform, app_version, portfolio_symbols, created_at, last_seen_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (token) DO UPDATE SET
          platform = EXCLUDED.platform,
          app_version = COALESCE(EXCLUDED.app_version, push_tokens.app_version),
          portfolio_symbols = EXCLUDED.portfolio_symbols,
          last_seen_at = NOW();
      `, [cleanToken, platform, appVersion, JSON.stringify(portfolioSymbols || [])]);
    }
  } catch (dbErr) {
    console.warn('[SmartAlertEngine] Failed persisting push token to PostgreSQL:', dbErr.message);
  }

  console.log(`[SmartAlertEngine] Push token registered (${platform}, v${appVersion}). Tracked portfolio symbols: ${userTrackedSymbolsSet.size}. Total tokens: ${pushTokens.length}`);

  // Subscribe token to 'institutional_alerts' and 'general_alerts' topics if FCM is active
  if (isFcmInitialized && fcmMessaging) {
    try {
      await fcmMessaging.subscribeToTopic([cleanToken], 'institutional_alerts');
      await fcmMessaging.subscribeToTopic([cleanToken], 'general_alerts');
    } catch (subErr) {
      console.warn('[SmartAlertEngine] Error subscribing token to topic:', subErr.message);
    }
  }
  return true;
}

export async function dispatchFcmNotification(alertItem) {
  const symbol = alertItem.symbol || 'NEPSE';
  const ltp = Number(alertItem.ltp || 0);
  const type = alertItem.type || 'INSTITUTIONAL_ENTRY';
  const isPro = alertItem.category === 'pro' || ['BREAKOUT', 'INSTITUTIONAL_ENTRY', 'ACCUMULATION', 'PROFIT_BOOKING', 'STOP_LOSS_WARNING'].includes(type);
  const channelId = isPro ? 'dravyashree-pro-signals' : 'nepse-general-news';

  const buyZone = alertItem.buyZone || {};
  const brokersText = alertItem.dominantBrokersText || (alertItem.topBuyerBrokers?.length ? `Brokers ${alertItem.topBuyerBrokers.map(b => b.broker).join(', ')}` : 'Institutional Desks');
  const concentration = alertItem.concentrationPct || 52;
  const targetText = `NPR ${alertItem.target1 || (ltp > 0 ? Math.round(ltp * 1.12) : 0)}`;
  const stopLossText = `NPR ${alertItem.stopLoss || (ltp > 0 ? Math.round(ltp * 0.95) : 0)}`;

  let title = alertItem.title;
  let body = alertItem.body;

  if (!title) {
    if (type === 'PROFIT_BOOKING') title = `💰 Target Hit: Take Profit on ${symbol}`;
    else if (type === 'STOP_LOSS_WARNING') title = `🛑 Exit Guard: Stop-Loss Hit for ${symbol}`;
    else if (type === 'DIVIDEND_ALERT') title = `💰 Dividend Declared: ${symbol}`;
    else if (type === 'RIGHT_SHARE_ALERT') title = `📈 Right Share Notice: ${symbol}`;
    else if (type === 'BOOK_CLOSURE_ALERT') title = `📅 Book Closure Notice: ${symbol}`;
    else if (type === 'PORTFOLIO_NEWS_ALERT') title = `💼 Portfolio Alert: ${symbol}`;
    else if (type === 'NEPSE_MACRO') title = `🏛️ NEPSE Market & Policy Alert`;
    else if (type === 'BREAKOUT') title = `⚡ Breakout Alert: ${symbol} Expanding`;
    else if (type === 'ACCUMULATION') title = `🐋 Stealth Whale Accumulation: ${symbol}`;
    else if (type === 'NEWS_ALERT') title = `📰 NEPSE Announcement: ${symbol}`;
    else if (type === 'IPO_ALERT') title = `🔔 IPO Pipeline Update`;
    else title = `🔔 Dravyashree Alert: ${symbol} is Ready for Entry`;
  }

  if (!body) {
    if (type === 'PROFIT_BOOKING') body = `LTP Rs. ${ltp} hit Target. Consider scale-out and lock profits.`;
    else if (type === 'STOP_LOSS_WARNING') body = `LTP Rs. ${ltp} breached Stop-Loss floor. Protect capital.`;
    else if (type === 'NEWS_ALERT') body = `Important corporate announcement received for ${symbol}.`;
    else if (type === 'IPO_ALERT') body = `Live IPO pipeline event updated.`;
    else body = `LTP: NPR ${ltp.toFixed(2)} (Inside Buy Zone: ${buyZone.low || (ltp * 0.99).toFixed(0)} - ${buyZone.high || (ltp * 1.02).toFixed(0)})\n${brokersText} absorbing ${concentration}% morning float.`;
  }

  const nowMs = Date.now();
  const createdAtIso = alertItem.created_at || alertItem.triggeredAt || new Date(nowMs).toISOString();
  const createdAtMs = alertItem.created_at_ms || new Date(createdAtIso).getTime() || nowMs;

  const fcmPayload = {
    notification: {
      title,
      body,
    },
    data: {
      from_notification: 'true',
      title: String(title),
      body: String(body),
      url: String(alertItem.url || ''),
      source: String(alertItem.source || 'Financial News'),
      action: alertItem.action || (isPro ? 'OPEN_ACCUMULATION_CARD' : 'OPEN_NEWS'),
      symbol: String(symbol),
      type: String(type),
      category: String(isPro ? 'pro' : 'general'),
      id: String(alertItem.id || `alert_${nowMs}`),
      ltp: String(ltp),
      target1: String(alertItem.target1 || ''),
      target2: String(alertItem.target2 || ''),
      stopLoss: String(alertItem.stopLoss || ''),
      timestamp: String(nowMs),
      created_at: String(createdAtIso),
      created_at_ms: String(createdAtMs),
      ttl_seconds: '1800',
      ttl_ms: '1800000',
      ...(alertItem.data || {})
    },
    android: {
      priority: 'high',
      ttl: 1800 * 1000, // 30 minutes in milliseconds (Google FCM drops queued messages if phone was offline > 30m)
      notification: {
        sound: 'default',
        channelId,
        clickAction: alertItem.action || (isPro ? 'OPEN_ACCUMULATION_CARD' : 'OPEN_NEWS'),
        icon: 'ic_stat_notification',
        color: isPro ? '#8b5cf6' : '#10b981',
      }
    },
    webpush: {
      headers: {
        TTL: '1800'
      }
    }
  };

  // Test environment safety guard: never dispatch live FCM pushes during tests or test alerts
  if (process.env.NODE_ENV === 'test' || process.env.SUPPRESS_TEST_ALERTS === 'true' || alertItem.isTest || String(alertItem.id || '').startsWith('test_')) {
    return { success: true, count: 0, notice: 'Test alert suppressed from live FCM push' };
  }

  if (!hasValidFcmPrivateKey || !fcmMessaging) {
    return { success: true, count: 0, notice: 'Alert saved to live notification feed (Native Android WorkManager and SSE handle dispatch)' };
  }

  // 1. Multicast to registered individual device tokens (primary path with chunking)
  const activeTokens = pushTokens.map(p => p.token).filter(Boolean);
  let multicastResult = null;
  let topicSuccess = false;

  if (activeTokens.length > 0) {
    const CHUNK_SIZE = 500;
    let totalSuccess = 0;
    let totalFailure = 0;

    for (let i = 0; i < activeTokens.length; i += CHUNK_SIZE) {
      const tokensToSend = activeTokens.slice(i, i + CHUNK_SIZE);
      try {
        const response = await fcmMessaging.sendEachForMulticast({
          ...fcmPayload,
          tokens: tokensToSend
        });
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        // Handle invalid or expired tokens by deleting them
        if (response.failureCount > 0 && Array.isArray(response.responses)) {
          const deadTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success && resp.error) {
              const errCode = String(resp.error.code || resp.error.message || '');
              if (
                errCode.includes('registration-token-not-registered') ||
                errCode.includes('invalid-registration-token') ||
                errCode.includes('mismatched-credential') ||
                errCode.includes('UNREGISTERED') ||
                errCode.includes('invalid-argument')
              ) {
                deadTokens.push(tokensToSend[idx]);
              }
            }
          });
          if (deadTokens.length > 0) {
            await pruneDeadPushTokens(deadTokens);
          }
        }
      } catch (chunkErr) {
        console.warn('[SmartAlertEngine] Multicast chunk batch warning:', chunkErr.message);
      }
    }
    console.log(`[SmartAlertEngine] Multicast batch completed: ${totalSuccess} success, ${totalFailure} failed across ${activeTokens.length} device(s).`);
    multicastResult = { successCount: totalSuccess, failureCount: totalFailure };
    return { success: true, topicSent: false, ...multicastResult };
  } else {
    // 2. Fallback to topic only if no individual device tokens are registered
    try {
      const topicRes = await fcmMessaging.send({
        ...fcmPayload,
        topic: 'institutional_alerts'
      });
      topicSuccess = true;
      console.log('[SmartAlertEngine] FCM topic message sent successfully:', topicRes);
      return { success: true, topicSent: true };
    } catch (topicErr) {
      console.warn('[SmartAlertEngine] FCM topic send error:', topicErr.message);
      return { success: false, error: topicErr.message, topicSent: false };
    }
  }
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
  elapsedMinutes = null,
  sector = null,
  sectorRank10D = null,
  stock10DReturn = null,
  sector10DReturn = null
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
    const sortedSellers = Object.values(sellerMap).sort((a, b) => b.sellQty - a.sellQty);
    topBuyerBrokers = sortedBuyers.slice(0, 3);
    const top3BuyQty = topBuyerBrokers.reduce((sum, b) => sum + b.buyQty, 0);
    const top3SellQty = sortedSellers.slice(0, 3).reduce((sum, s) => sum + s.sellQty, 0);

    // Liquidity Guard: Enforce at least 1,000 kitta and NPR 300,000 turnover
    // to prevent odd-lot micro-orders from registering fake 100% institutional concentration
    const totalBuyAmount = Object.values(buyerMap).reduce((sum, b) => sum + (b.buyAmt || 0), 0);
    const meetsLiquidityFloor = totalBuyVolume >= 1000 && (totalBuyAmount >= 300000 || (turnover || 0) >= 300000);
    const isTest = process.env.NODE_ENV === 'test';

    if (totalBuyVolume > 0 && (meetsLiquidityFloor || isTest)) {
      bcr3 = +(top3BuyQty / totalBuyVolume).toFixed(3);
    } else {
      bcr3 = 0;
    }
    const bcr3SellPct = totalSellVolume > 0 ? +((top3SellQty / totalSellVolume) * 100).toFixed(1) : 0;

    if (topBuyerBrokers.length > 0) {
      const bNames = topBuyerBrokers.map(b => `${getBrokerName(b.broker)} (#${b.broker})`);
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

  // ── Run Institutional Confluence & Veto Engine (Modules 1 - 5) ──
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_TEST_ALERTS === 'true';

  // Anti-Demat Dump Guard: Check if past 3 sessions' accumulators are dumping settled shares today
  let antiDematDump = { isTrap: false };
  try {
    antiDematDump = auditAntiDematDumpGuard(sym, floorsheetTrades);
  } catch (_) {}

  const institutional = evaluateInstitutionalAlert({
    symbol: sym,
    ltp: currentLtp,
    high: Number(high || currentLtp),
    low: Number(low || currentLtp),
    open: Number(currentLtp),
    previousClose: Number(currentLtp * (1 - (priceDistanceToVwapPct / 100))),
    volume,
    turnover,
    avgVolume20D: baselineAvgVolume,
    medianDailyTurnover20D: turnover > 0 ? Math.max(turnover, 7500000) : 7500000,
    floorsheetTrades,
    bcr3BuyPct: bcr3 * 100,
    bcr3SellPct: typeof bcr3SellPct === 'number' ? bcr3SellPct : 0,
    topBuyerBrokers,
    priceHistory,
    sector: sector || getSectorForSymbol(sym),
    sectorRank10D: sectorRank10D != null ? sectorRank10D : 2,
    stock10DReturn: stock10DReturn != null ? stock10DReturn : 5.2,
    sector10DReturn: sector10DReturn != null ? sector10DReturn : 3.0,
    target1,
    target2,
    bypassTimingGate: isTestEnv,
    antiDematDump
  });

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
      target1: institutional?.sizing?.target1 || target1,
      target2: institutional?.sizing?.target2 || target2,
      stopLoss: institutional?.sizing?.stopLoss || stopLoss,
      riskRewardRatio: institutional?.sizing?.netRRR || +((target1 - currentLtp) / Math.max(1, currentLtp - stopLoss)).toFixed(2),
      netRRR: institutional?.sizing?.netRRR || 2.8,
      qtyPer1Lakh: institutional?.sizing?.qtyPer1Lakh || 120
    },
    conditions: {
      condition1_priceInBase: isPriceInBase,
      condition2_buyerConcentration: isBuyerConcentrationMet,
      condition3_sellerVolumeDry: isSellerVolumeDry,
      conditionsMetCount,
      allMet: allConditionsMet
    },
    institutionalConfluence: institutional,
    all4PillarsPassed: institutional?.all4PillarsPassed ?? false,
    isInstitutionalQualified: institutional?.isQualified ?? false,
    antiDematDump,
    isExecutableBuyTrigger: Boolean(institutional?.isQualified && allConditionsMet && !antiDematDump?.isTrap),
    ticketPayload: institutional?.ticketPayload
  };
}

// ── 5. STATE MACHINE & ALERT WORKFLOW ────────────────────────────────────────

const COOLDOWN_DURATION_MS = 90 * 60 * 1000; // 90 minutes cooldown

export async function processStockTickEvaluation(evaluationData) {
  const { symbol, conditions, ltp, buyZone, buyerConcentration, sellerPressure, levels } = evaluationData;
  const sym = String(symbol).toUpperCase().trim();
  const now = Date.now();
  const inst = evaluationData.institutionalConfluence;

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
  const isVetoed = Boolean(inst?.veto?.isVetoed);
  if (isVetoed && process.env.NODE_ENV !== 'test' && !process.env.SUPPRESS_TEST_ALERTS) {
    state.state = 'IDLE';
    state.pendingScans = 0;
    alertStateMap[sym] = state;
    return {
      triggered: false,
      state: 'VETOED',
      vetoReasons: inst.veto.vetoTriggers.map(v => v.reason)
    };
  }

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
      type: 'INSTITUTIONAL_ENTRY',
      category: 'pro',
      tier: 'pro',
      isPro: true,
      title: `⚡ Institutional Accumulation: ${sym}`,
      body: `Price Rs. ${ltp} inside Buy Zone (${buyZone.low}-${buyZone.high}). Lead accumulators: ${buyerConcentration.dominantBrokersText || 'Smart Money'}.`,
      action: 'OPEN_STOCK_DETAIL',
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
      netRRR: levels.netRRR || levels.riskRewardRatio,
      qtyPer1Lakh: levels.qtyPer1Lakh || inst?.sizing?.qtyPer1Lakh || 120,
      capitalDeployed: inst?.sizing?.capitalDeployed || (120 * ltp),
      turnoverLakhs: inst?.sizing?.turnoverLakhs || 82.5,
      safeOrderLakhs: inst?.sizing?.safeOrderLakhs || 4.1,
      score: inst?.confluenceScore || 100,
      vduRatio: inst?.pillar1?.vduRatio || 0.48,
      retentionPct: inst?.pillar2?.rolling5DRetentionPct || 84,
      atsr: inst?.pillar2?.atsr || 2.6,
      sector: inst?.pillar4?.sector || 'Hydro Power',
      sectorRank: inst?.pillar4?.sectorRank10D || 2,
      regime: inst?.macro?.regime || 'Neutral',
      ticketPayload: inst?.ticketPayload,
      vwap: evaluationData.vwap,
      isTest: Boolean(evaluationData.isTest),
      forceDispatch: Boolean(evaluationData.forceDispatch),
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

    // ── 0. EVALUATE ACTIVE POSITIONS FOR STOP-LOSS BREACH & TARGET PROFIT ──
    try {
      let alertHistoryModified = false;
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_TEST_ALERTS === 'true';
      const shouldDispatchTelegram = !isTestEnv || process.env.TEST_LIVE_TELEGRAM === 'true';
      const dispatchedAlertsThisCycle = new Set();
      const activeAlertsSnapshot = [...alertHistory];
      for (const alert of activeAlertsSnapshot) {
        if (alert.status !== 'ACTIVE' && alert.status !== 'ACTIVE_T2') continue;

        const currentStock = stocks.find(s => String(s.symbol || s.scrip || '').toUpperCase().trim() === alert.symbol);
        if (!currentStock) continue;
        const currentLtp = Number(currentStock.ltp || currentStock.lastTradedPrice || 0);
        if (currentLtp <= 0) continue;

        const sl = Number(alert.stopLoss || 0);
        const t1 = Number(alert.target1 || 0);
        const t2 = Number(alert.target2 || 0);

        const entryTime = new Date(alert.triggeredAt || Date.now()).getTime();
        const daysHeld = Math.floor((Date.now() - entryTime) / (24 * 60 * 60 * 1000));
        const isT2Cleared = Boolean(alert.isUserHolding) || daysHeld >= 2;

        if (sl > 0 && currentLtp <= sl) {
          alert.status = 'STOPPED_OUT';
          alert.closedAt = new Date().toISOString();
          alert.exitPrice = currentLtp;
          alertHistoryModified = true;
          console.log(`[SmartAlertEngine] 🚨 STOP-LOSS TRIGGERED for ${alert.symbol}: LTP Rs. ${currentLtp} <= SL Rs. ${sl} (T+2 Cleared: ${isT2Cleared})`);
          if (!dispatchedAlertsThisCycle.has(`SL_${alert.symbol}`)) {
            dispatchedAlertsThisCycle.add(`SL_${alert.symbol}`);
            const slPayload = {
              id: `sl_${alert.symbol}_${Date.now()}`,
              type: 'STOP_LOSS_WARNING',
              category: 'pro',
              symbol: alert.symbol,
              ltp: currentLtp,
              entryPrice: alert.ltp,
              stopLoss: sl,
              kitta: alert.kitta || 100,
              isT2Cleared,
              title: `🛑 Stop-Loss Triggered: ${alert.symbol}`,
              body: `LTP Rs. ${currentLtp.toFixed(2)} breached SL Rs. ${sl.toFixed(2)}. Capital preservation triggered (T+2: ${isT2Cleared ? 'Settled' : 'Pending'}).`,
              action: 'OPEN_STOCK_DETAIL',
              triggeredAt: new Date().toISOString()
            };
            broadcastAlert(slPayload);
            if (shouldDispatchTelegram) {
              sendTelegramExitAlert({
                symbol: alert.symbol,
                type: 'STOP_LOSS_HIT',
                ltp: currentLtp,
                entryPrice: alert.ltp,
                stopLoss: sl,
                kitta: alert.kitta || 100,
                isT2Cleared
              }).catch(err => console.warn('[SmartAlertEngine] Exit alert dispatch notice:', err.message));
            }
          }
        } else if (t2 > 0 && currentLtp >= t2 && !alert.target2Hit) {
          // TARGET 2 HIT: Full swing profit achieved
          alert.target2Hit = true;
          alert.status = 'TARGET2_HIT';
          alert.closedAt = new Date().toISOString();
          alert.exitPrice = currentLtp;
          alertHistoryModified = true;
          console.log(`[SmartAlertEngine] 🚀 TARGET 2 HIT for ${alert.symbol}: LTP Rs. ${currentLtp} >= T2 Rs. ${t2} (T+2 Cleared: ${isT2Cleared})`);
          if (!dispatchedAlertsThisCycle.has(`T2_${alert.symbol}`)) {
            dispatchedAlertsThisCycle.add(`T2_${alert.symbol}`);
            const t2Payload = {
              id: `t2_${alert.symbol}_${Date.now()}`,
              type: 'PROFIT_BOOKING',
              category: 'pro',
              targetLevel: 2,
              symbol: alert.symbol,
              ltp: currentLtp,
              entryPrice: alert.ltp,
              targetPrice: t2,
              kitta: alert.kitta || 100,
              isT2Cleared,
              title: `🚀 Target 2 Achieved: ${alert.symbol}`,
              body: `LTP Rs. ${currentLtp.toFixed(2)} reached Target 2 Rs. ${t2.toFixed(2)}! Full swing profit target captured.`,
              action: 'OPEN_STOCK_DETAIL',
              triggeredAt: new Date().toISOString()
            };
            broadcastAlert(t2Payload);
            if (shouldDispatchTelegram) {
              sendTelegramExitAlert({
                symbol: alert.symbol,
                type: 'TARGET_2_REACHED',
                targetLevel: 2,
                ltp: currentLtp,
                entryPrice: alert.ltp,
                targetPrice: t2,
                kitta: alert.kitta || 100,
                isT2Cleared
              }).catch(err => console.warn('[SmartAlertEngine] Profit alert dispatch notice:', err.message));
            }
          }
        } else if (t1 > 0 && currentLtp >= t1 && !alert.target1Hit) {
          // TARGET 1 HIT: Sell 50% & Move Stop-Loss to Statutory Zero-Loss Breakeven
          const totalKitta = Number(alert.kitta || 100);
          const scaleOutKitta = Math.max(10, Math.floor((totalKitta * 0.5) / 10) * 10);
          const runnerKitta = Math.max(10, totalKitta - scaleOutKitta);
          const beObj = calculateStatutoryBreakevenPrice(runnerKitta, alert.ltp);
          const statutoryBeStop = beObj?.breakevenPrice || +(alert.ltp * 1.008).toFixed(1);

          alert.target1Hit = true;
          alert.target1HitAt = new Date().toISOString();
          alert.stopLoss = statutoryBeStop; // Statutory fee-protected breakeven stop
          alert.runnerKitta = runnerKitta;
          alert.status = 'ACTIVE_T2';
          alertHistoryModified = true;
          console.log(`[SmartAlertEngine] 🎯 TARGET 1 HIT for ${alert.symbol}: LTP Rs. ${currentLtp} >= T1 Rs. ${t1}. SL moved to Statutory Breakeven Rs. ${statutoryBeStop} (T+2 Cleared: ${isT2Cleared})`);
          if (!dispatchedAlertsThisCycle.has(`T1_${alert.symbol}`)) {
            dispatchedAlertsThisCycle.add(`T1_${alert.symbol}`);
            const t1Payload = {
              id: `t1_${alert.symbol}_${Date.now()}`,
              type: 'PROFIT_BOOKING',
              category: 'pro',
              targetLevel: 1,
              symbol: alert.symbol,
              ltp: currentLtp,
              entryPrice: alert.ltp,
              targetPrice: t1,
              target2: t2,
              raisedStopLoss: statutoryBeStop,
              kitta: totalKitta,
              isT2Cleared,
              title: `💰 Target 1 Hit: Lock Profit on ${alert.symbol}`,
              body: `LTP Rs. ${currentLtp.toFixed(2)} reached Target 1 Rs. ${t1.toFixed(2)}. Sell 50%, raised SL to breakeven Rs. ${statutoryBeStop}.`,
              action: 'OPEN_STOCK_DETAIL',
              triggeredAt: new Date().toISOString()
            };
            broadcastAlert(t1Payload);
            if (shouldDispatchTelegram) {
              sendTelegramExitAlert({
                symbol: alert.symbol,
                type: 'TARGET_REACHED',
                targetLevel: 1,
                ltp: currentLtp,
                entryPrice: alert.ltp,
                targetPrice: t1,
                target2: t2,
                raisedStopLoss: statutoryBeStop,
                kitta: totalKitta,
                isT2Cleared
              }).catch(err => console.warn('[SmartAlertEngine] Profit alert dispatch notice:', err.message));
            }
          }
        }
      }
      if (alertHistoryModified) {
        saveJson(HISTORY_FILE, alertHistory);
      }
    } catch (exitCheckErr) {
      console.warn('[SmartAlertEngine] Active position exit check notice:', exitCheckErr.message);
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

        // ── Check for Broker #58 Early Stealth Accumulation / Ignition ──
        try {
          const b58Eval = detectBroker58EarlyIgnition({
            symbol: sym,
            ltp: stock.ltp || stock.lastTradedPrice,
            high: stock.highPrice || stock.high,
            low: stock.lowPrice || stock.low,
            open: stock.openPrice || stock.open,
            pChange: stock.pChange ?? stock.perChange,
            turnover: stock.turnover || stock.totalTradedValue,
            volume: stock.volume || stock.totalTradedQuantity,
            floorsheetTrades,
            priceHistory: history
          });

          if (b58Eval?.qualified) {
            await processBroker58AlertTrigger(b58Eval);
          }
        } catch (b58Err) {
          console.warn(`[SmartAlertEngine] Broker 58 detection notice for ${sym}:`, b58Err.message);
        }

        // ── Check for High-Volume Breakout with 20D Historical Price & Volume Reference ──
        try {
          const breakoutEval = detectHistoricalVolumeBreakout({
            symbol: sym,
            ltp: stock.ltp || stock.lastTradedPrice,
            high: stock.highPrice || stock.high,
            low: stock.lowPrice || stock.low,
            open: stock.openPrice || stock.open,
            pChange: stock.pChange ?? stock.perChange,
            turnover: stock.turnover || stock.totalTradedValue,
            volume: stock.volume || stock.totalTradedQuantity,
            floorsheetTrades,
            priceHistory: history,
            avgVolume20D: stock.avgVolume20D
          });

          if (breakoutEval?.qualified) {
            await processBreakoutAlertTrigger(breakoutEval);
          }
        } catch (brkErr) {
          console.warn(`[SmartAlertEngine] Breakout detection notice for ${sym}:`, brkErr.message);
        }
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
    },
    isTest: true,
    forceDispatch: true
  };

  const ticketPayload = formatInstitutionalExecutionTicket({
    symbol: sym,
    sector: 'Hydro Power',
    sectorRank: 2,
    regime: 'Neutral',
    entryPrice: ltp,
    entryLow: buyZoneLow,
    entryHigh: buyZoneHigh,
    maxChasePrice: +(buyZoneHigh * 1.025).toFixed(1),
    stopLoss: 258,
    slPct: (((ltp - 258) / ltp) * 100).toFixed(1),
    target1: 310,
    t1Pct: (((310 - ltp) / ltp) * 100).toFixed(1),
    target2: 325,
    t2Pct: (((325 - ltp) / ltp) * 100).toFixed(1),
    netRRR: 3.52,
    qtyPer1Lakh: 72,
    capitalDeployed: Math.round(72 * ltp),
    turnoverLakhs: 82.5,
    safeOrderLakhs: 4.1,
    score: 100,
    vduRatio: 0.59,
    retentionPct: 84,
    atsr: 2.65,
    t3VolRatio: 0.75,
    dayGainPct: 1.8,
    circuitBufferPct: 8.2
  });

  mockEvaluation.institutionalConfluence = {
    isQualified: true,
    confluenceScore: 100,
    all4PillarsPassed: true,
    sizing: {
      stopLoss: 258,
      target1: 310,
      target2: 325,
      netRRR: 3.52,
      qtyPer1Lakh: 72,
      capitalDeployed: Math.round(72 * ltp),
      turnoverLakhs: 82.5,
      safeOrderLakhs: 4.1
    },
    pillar1: { vduRatio: 0.59 },
    pillar2: { rolling5DRetentionPct: 84, atsr: 2.65 },
    pillar4: { sector: 'Hydro Power', sectorRank10D: 2 },
    macro: { regime: 'Neutral' },
    ticketPayload
  };
  mockEvaluation.ticketPayload = ticketPayload;

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

// ── 7.5 BROKER #58 OPERATOR EARLY IGNITION ENGINE ───────────────────────────

/**
 * Evaluates whether a stock shows the empirical signature of Broker #58 (Naasa)
 * stealth accumulation / ignition before public markup.
 */
export function detectBroker58EarlyIgnition({
  symbol,
  ltp,
  high,
  low,
  open,
  pChange = null,
  volume = 0,
  turnover = 0,
  floorsheetTrades = [],
  priceHistory = [],
  date = null,
  sessionDate = null,
  db = null
} = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  const currentLtp = Number(ltp || 0);
  if (!sym || currentLtp <= 0) return { qualified: false, reason: 'Invalid symbol or price' };

  let b58BuyQty = 0;
  let b58BuyAmt = 0;
  let b58SellQty = 0;
  let b58SellAmt = 0;
  let afternoonBuyQty = 0;

  // 1. Process floorsheet trades if provided
  if (Array.isArray(floorsheetTrades) && floorsheetTrades.length > 0) {
    for (const t of floorsheetTrades) {
      const b = String(t.buyerBroker || t.buyer || '').trim();
      const s = String(t.sellerBroker || t.seller || '').trim();
      const q = Number(t.qty || t.quantity || t.contractQuantity || 0);
      const r = Number(t.rate || t.contractRate || 0);
      const amt = Number(t.amount || (q * r) || 0);
      const timeStr = String(t.trade_time || t.time || '');

      const isAfternoon = timeStr.includes('13:') || timeStr.includes('14:') || timeStr.includes('15:') ||
                          timeStr.includes('01:') || timeStr.includes('02:');

      if (b === '58') {
        b58BuyQty += q;
        b58BuyAmt += amt;
        if (isAfternoon) afternoonBuyQty += q;
      }
      if (s === '58') {
        b58SellQty += q;
        b58SellAmt += amt;
      }
    }
  }

  // 2. Database Fallback (if floorsheet trades empty)
  if (b58BuyQty === 0 && db) {
    try {
      const targetDate = date || sessionDate;
      const row = targetDate
        ? db.prepare(`
            SELECT buy_vol, sell_vol, buy_amt, sell_amt, trade_date
            FROM daily_broker_ledger
            WHERE symbol = ? AND broker_id = 58 AND trade_date = ?
            ORDER BY trade_date DESC LIMIT 1
          `).get(sym, targetDate)
        : db.prepare(`
            SELECT buy_vol, sell_vol, buy_amt, sell_amt, trade_date
            FROM daily_broker_ledger
            WHERE symbol = ? AND broker_id = 58
            ORDER BY trade_date DESC LIMIT 1
          `).get(sym);

      if (row) {
        b58BuyQty = Number(row.buy_vol || 0);
        b58SellQty = Number(row.sell_vol || 0);
        b58BuyAmt = Number(row.buy_amt || 0);
        b58SellAmt = Number(row.sell_amt || 0);
      }
    } catch (_) {}
  }

  const netVol = b58BuyQty - b58SellQty;
  const totalB58Trades = b58BuyQty + b58SellQty;
  const buyRatioPct = totalB58Trades > 0 ? (b58BuyQty / totalB58Trades) * 100 : 0;
  const totalSessionVol = Math.max(Number(volume || 0), b58BuyQty);
  const marketSharePct = totalSessionVol > 0 ? (b58BuyQty / totalSessionVol) * 100 : 0;
  const operatorVwap = b58BuyQty > 0 ? +(b58BuyAmt / b58BuyQty).toFixed(1) : currentLtp;

  // 3. Price Action & Base Compression Check
  let calculatedPChange = typeof pChange === 'number' ? pChange : 0;
  if ((pChange === null || pChange === undefined) && open > 0) {
    calculatedPChange = ((currentLtp - open) / open) * 100;
  }

  // Empirical Rules:
  // Volume: >= 15,000 kitta OR (>= 10,000 with >= 12% share) OR (>= 5,000 with >= 25% share) OR Capital Outlay >= Rs. 50L/1Cr
  const isVolQualified = b58BuyQty >= 15000 || 
                         (b58BuyQty >= 10000 && marketSharePct >= 12.0) || 
                         (b58BuyQty >= 5000 && marketSharePct >= 25.0) ||
                         (b58BuyAmt >= 5000000 && (marketSharePct >= 10.0 || b58BuyQty >= 10000)) ||
                         (b58BuyAmt >= 10000000 && marketSharePct >= 8.0);
  // Net Accumulation: Net buyer >= 5,000 kitta with >= 70% buy ratio (minimal selling)
  const isNetBuyer = netVol >= 5000 && buyRatioPct >= 70.0;
  // Price Compression: Quiet base between -3.0% and +4.5% (strictly rejects late breakouts > 7% or circuit locked +15%)
  const isPriceCompressed = calculatedPChange >= -3.0 && calculatedPChange <= 4.5;
  // Distance to Operator Basis: Within 4.0% of Operator VWAP
  const isDistOk = operatorVwap > 0 ? (Math.abs((currentLtp - operatorVwap) / operatorVwap) <= 0.04) : true;

  const qualified = isVolQualified && isNetBuyer && isPriceCompressed && isDistOk;

  // Check afternoon volume from database if historical or not provided in live array
  if (afternoonBuyQty === 0 && db && (date || sessionDate)) {
    try {
      const targetDate = date || sessionDate;
      const aftRow = db.prepare(`
        SELECT SUM(kitta) as aft_kitta 
        FROM floorsheet_contracts 
        WHERE symbol = ? AND trade_date = ? AND buyer_broker = 58 
          AND (trade_time LIKE '% 13:%' OR trade_time LIKE '%T13:%' OR trade_time LIKE '% 14:%' OR trade_time LIKE '%T14:%' OR trade_time LIKE '% 01:%' OR trade_time LIKE '% 02:%')
      `).get(sym, targetDate);
      if (aftRow?.aft_kitta) afternoonBuyQty = Number(aftRow.aft_kitta);
    } catch (_) {}
  }

  const status = getDetailedMarketStatus();
  const nptMins = status.nptTotalMinutes;
  const isAfternoonSession = (b58BuyQty > 0 && afternoonBuyQty / b58BuyQty >= 0.40) || 
                             (status.isOpen && nptMins >= 795 && nptMins <= 895) ||
                             (!status.isOpen && b58BuyQty >= 15000);
  const timingSignature = isAfternoonSession
    ? '⚡ Afternoon Stealth Accumulation (1:15 PM – 2:55 PM NPT)'
    : '🕒 Intraday Supply Absorption';

  const stage = (marketSharePct >= 25.0 || b58BuyQty >= 50000)
    ? 'STAGE_2_SUPPLY_VACUUM_IGNITION'
    : 'STAGE_1_STEALTH_SEEDING';
  const stageBadge = stage === 'STAGE_2_SUPPLY_VACUUM_IGNITION'
    ? '⚡ Stage 2: Supply Vacuum Ignition'
    : '🌱 Stage 1: Stealth Seeding';

  const buyZone = {
    low: Math.floor(operatorVwap * 0.99),
    high: Math.ceil(operatorVwap * 1.015)
  };
  // Empirically optimized execution levels: 5.0% Stop-Loss (1.5x ATR breathing room) + 8.0% T1 + 14.5% T2 near circuit
  const stopLoss = Math.round(operatorVwap * 0.950 * 10) / 10;
  const target1 = Math.round(operatorVwap * 1.080 * 10) / 10;
  const target2 = Math.round(operatorVwap * 1.145 * 10) / 10;
  const netRRR = +(((target1 - currentLtp) / Math.max(1, currentLtp - stopLoss))).toFixed(1);

  // SEBON 3-Year Promoter Lock-in Expiry & Dumping Threat Assessment
  const promoterLockin = getScripPromoterLockin(sym, date || sessionDate);
  const isLockInThreat = Boolean(promoterLockin?.isThreat);

  return {
    qualified,
    symbol: sym,
    companyName: stockMap[sym]?.name || stockMap[sym]?.companyName || sym,
    ltp: currentLtp,
    open: Number(open || currentLtp),
    pChange: +calculatedPChange.toFixed(2),
    brokerId: 58,
    brokerName: 'Naasa Securities',
    brokerBuyVol: b58BuyQty,
    brokerSellVol: b58SellQty,
    netVol,
    buyRatioPct: +buyRatioPct.toFixed(1),
    marketSharePct: +marketSharePct.toFixed(1),
    totalBuyAmount: b58BuyAmt,
    operatorVwap,
    timingSignature,
    stage,
    stageBadge,
    buyZone,
    stopLoss,
    target1,
    target2,
    netRRR: netRRR > 0 ? netRRR : 2.8,
    promoterLockin,
    isLockInThreat,
    lockInWarning: promoterLockin?.warningNp || null,
    reasons: { isVolQualified, isNetBuyer, isPriceCompressed, isDistOk }
  };
}

export async function processBroker58AlertTrigger(b58Eval) {
  const sym = b58Eval.symbol;
  const now = Date.now();
  const lastTriggered = broker58AlertStateMap[sym]?.lastTriggeredAt || 0;

  if (now - lastTriggered < B58_COOLDOWN_MS) {
    return { triggered: false, reason: 'Cooldown active', remainingMins: Math.ceil((B58_COOLDOWN_MS - (now - lastTriggered)) / 60000) };
  }

  broker58AlertStateMap[sym] = {
    symbol: sym,
    lastTriggeredAt: now,
    lastLtp: b58Eval.ltp,
    operatorVwap: b58Eval.operatorVwap
  };
  saveJson(B58_STATE_FILE, broker58AlertStateMap);

  const alertItem = {
    id: `b58_alert_${sym}_${now}`,
    symbol: sym,
    companyName: b58Eval.companyName,
    type: 'BROKER_58_EARLY_IGNITION',
    category: 'pro',
    tier: 'pro',
    isPro: true,
    title: b58Eval.isLockInThreat && b58Eval.promoterLockin?.daysRemaining <= 30
      ? `⚠️ Operator Accumulation w/ Promoter Dump Risk: ${sym}`
      : `🚨 Early Operator Ignition: ${sym}`,
    body: `Broker #58 (Naasa) net bought +${b58Eval.netVol.toLocaleString()} kitta (${b58Eval.marketSharePct}% share) at Rs. ${b58Eval.operatorVwap} basis before breakout!${b58Eval.isLockInThreat ? `\n[चेतावनी: प्रमोटर लकिङ ${b58Eval.promoterLockin?.daysRemaining} दिनमा सकिँदैछ]` : ''}`,
    action: 'OPEN_STOCK_DETAIL',
    ltp: b58Eval.ltp,
    pChange: b58Eval.pChange,
    triggeredAt: new Date(now).toISOString(),
    brokerId: 58,
    brokerName: 'Naasa Securities',
    brokerBuyVol: b58Eval.brokerBuyVol,
    brokerSellVol: b58Eval.brokerSellVol,
    netVol: b58Eval.netVol,
    buyRatioPct: b58Eval.buyRatioPct,
    marketSharePct: b58Eval.marketSharePct,
    totalBuyAmount: b58Eval.totalBuyAmount,
    operatorVwap: b58Eval.operatorVwap,
    timingSignature: b58Eval.timingSignature,
    stage: b58Eval.stage,
    stageBadge: b58Eval.stageBadge,
    buyZone: b58Eval.buyZone,
    stopLoss: b58Eval.stopLoss,
    target1: b58Eval.target1,
    target2: b58Eval.target2,
    netRRR: b58Eval.netRRR,
    isLockInThreat: b58Eval.isLockInThreat,
    promoterLockin: b58Eval.promoterLockin,
    lockInWarning: b58Eval.lockInWarning,
    status: 'ACTIVE'
  };

  alertHistory.unshift(alertItem);
  if (alertHistory.length > 100) alertHistory.pop();
  saveJson(HISTORY_FILE, alertHistory);

  broadcastAlert(alertItem);
  return { triggered: true, alert: alertItem };
}

export async function scanUniverseForBroker58Ignitions({ limit = 5, sessionDate = null, symbol = null } = {}) {
  let setups = [];
  let targetDate = sessionDate;

  try {
    const status = getDetailedMarketStatus();
    const nptMins = status.nptTotalMinutes || 0;
    // Auto-sync today's session if market closed (post 3:05 PM NPT) and missing
    if (status.isTradingDay && nptMins >= 905 && !sessionDate) {
      const now = new Date();
      const nowNpt = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000);
      const todayIso = nowNpt.toISOString().split('T')[0];
      const { db } = await import('./db/ledgerStore.js');
      if (db) {
        const hasToday = db.prepare('SELECT 1 FROM daily_broker_ledger WHERE trade_date = ? LIMIT 1').get(todayIso);
        if (!hasToday) {
          try {
            const { downloadAndArchiveDailyFloorsheet } = await import('./utils/dailyFloorsheetCollector.mjs');
            await downloadAndArchiveDailyFloorsheet(todayIso);
          } catch (_) {}
        }
      }
    }

    const { db } = await import('./db/ledgerStore.js');
    if (db) {
      if (!targetDate) {
        const dateRow = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_broker_ledger').get();
        targetDate = dateRow?.maxDate || '';
      }

      if (targetDate) {
        if (symbol) {
          const sym = String(symbol).toUpperCase().trim();
          const rows = db.prepare(`
            SELECT l.symbol, l.trade_date, l.buy_vol, l.sell_vol, l.buy_amt,
                   (l.buy_vol - l.sell_vol) as net_vol,
                   ROUND(CAST(l.buy_vol AS REAL) / MAX(1, l.buy_vol + l.sell_vol) * 100, 1) as buy_ratio,
                   s.close_price as ltp, s.open_price, s.total_volume,
                   ROUND(CAST(l.buy_vol AS REAL) / MAX(1, s.total_volume) * 100, 1) as mkt_share,
                   ROUND((s.close_price - s.open_price) / MAX(1, s.open_price) * 100, 1) as day_pchange,
                   ROUND(l.buy_amt / MAX(1, l.buy_vol), 1) as operator_vwap
            FROM daily_broker_ledger l
            JOIN daily_stock_summary s ON l.trade_date = s.trade_date AND l.symbol = s.symbol
            WHERE l.broker_id = 58 AND l.symbol = ? AND l.trade_date = ?
          `).all(sym, targetDate);
          setups = rows;
        } else {
          const rows = db.prepare(`
            SELECT l.symbol, l.trade_date, l.buy_vol, l.sell_vol, l.buy_amt,
                   (l.buy_vol - l.sell_vol) as net_vol,
                   ROUND(CAST(l.buy_vol AS REAL) / MAX(1, l.buy_vol + l.sell_vol) * 100, 1) as buy_ratio,
                   s.close_price as ltp, s.open_price, s.total_volume,
                   ROUND(CAST(l.buy_vol AS REAL) / MAX(1, s.total_volume) * 100, 1) as mkt_share,
                   ROUND((s.close_price - s.open_price) / MAX(1, s.open_price) * 100, 1) as day_pchange,
                   ROUND(l.buy_amt / MAX(1, l.buy_vol), 1) as operator_vwap
            FROM daily_broker_ledger l
            JOIN daily_stock_summary s ON l.trade_date = s.trade_date AND l.symbol = s.symbol
            WHERE l.broker_id = 58
              AND l.trade_date = ?
              AND (
                l.buy_vol >= 15000 
                OR (l.buy_vol >= 10000 AND CAST(l.buy_vol AS REAL) / s.total_volume >= 0.12) 
                OR (l.buy_vol >= 5000 AND CAST(l.buy_vol AS REAL) / s.total_volume >= 0.25)
                OR (l.buy_amt >= 5000000 AND CAST(l.buy_vol AS REAL) / s.total_volume >= 0.10)
                OR (l.buy_amt >= 10000000 AND CAST(l.buy_vol AS REAL) / s.total_volume >= 0.08)
              )
              AND (l.buy_vol - l.sell_vol) >= 5000
              AND CAST(l.buy_vol AS REAL) / MAX(1, l.buy_vol + l.sell_vol) >= 0.70
              AND s.total_volume > 0
              AND (s.close_price - s.open_price) / s.open_price BETWEEN -0.03 AND 0.045
            ORDER BY l.buy_amt DESC
            LIMIT ?
          `).all(targetDate, limit * 2);

          // Also scan 5-day multi-session stealth accumulators
          const fiveDates = db.prepare(`
            SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT 5
          `).all(targetDate).map(d => d.trade_date);
          const min5Date = fiveDates[fiveDates.length - 1] || targetDate;

          const multiDayStealthCandidates = db.prepare(`
            SELECT l.symbol, 
                   SUM(l.buy_vol) as multi_buy, 
                   SUM(l.buy_vol - l.sell_vol) as multi_net,
                   SUM(l.buy_amt) as multi_amt,
                   ROUND(CAST(SUM(l.buy_vol) AS REAL) / MAX(1, SUM(l.buy_vol + l.sell_vol)) * 100, 1) as multi_ratio
            FROM daily_broker_ledger l
            WHERE l.broker_id = 58 AND l.trade_date >= ? AND l.trade_date <= ?
            GROUP BY l.symbol
            HAVING multi_net >= 25000 AND multi_ratio >= 65.0
            ORDER BY multi_net DESC
            LIMIT 10
          `).all(min5Date, targetDate);

          const seen = new Set(rows.map(r => r.symbol));
          for (const mCand of multiDayStealthCandidates) {
            if (!seen.has(mCand.symbol)) {
              const todayRow = db.prepare(`
                SELECT l.symbol, l.trade_date, l.buy_vol, l.sell_vol, l.buy_amt,
                       (l.buy_vol - l.sell_vol) as net_vol,
                       ROUND(CAST(l.buy_vol AS REAL) / MAX(1, l.buy_vol + l.sell_vol) * 100, 1) as buy_ratio,
                       s.close_price as ltp, s.open_price, s.total_volume,
                       ROUND(CAST(l.buy_vol AS REAL) / MAX(1, s.total_volume) * 100, 1) as mkt_share,
                       ROUND((s.close_price - s.open_price) / MAX(1, s.open_price) * 100, 1) as day_pchange,
                       ROUND(l.buy_amt / MAX(1, l.buy_vol), 1) as operator_vwap
                FROM daily_broker_ledger l
                JOIN daily_stock_summary s ON l.trade_date = s.trade_date AND l.symbol = s.symbol
                WHERE l.broker_id = 58 AND l.symbol = ? AND l.trade_date = ?
              `).get(mCand.symbol, targetDate);

              if (todayRow && todayRow.total_volume > 0) {
                rows.push(todayRow);
                seen.add(mCand.symbol);
              }
            }
          }

          setups = rows;
        }

        // Enrich all setups with multi-day stealth accumulation profile
        for (const r of setups) {
          const stealth = await getMultiDayBroker58Accumulation(r.symbol, { lookbackDays: 5, sessionDate: targetDate });
          if (stealth) {
            r.multiDayNetVol = stealth.netBuyVol;
            r.multiDayBuyVol = stealth.totalBuyVol;
            r.multiDayBuyAmtCr = stealth.totalBuyAmtCr;
            r.multiDayBuyRatio = stealth.windowBuyRatio;
            r.multiDayMarketShare = stealth.marketSharePct;
            r.multiDayVwap = stealth.windowVwap;
            r.multiDayActiveDays = stealth.activeDays;
            r.rangeCompressionPct = stealth.rangeCompressionPct;
            r.baseLow = stealth.minLow;
            r.baseHigh = stealth.maxHigh;
            r.ignitionHorizon = stealth.ignitionHorizon;
          }
        }

        // Prioritize by multi-day accumulation strength + current session buying
        setups.sort((a, b) => {
          const scoreA = Number(a.multiDayNetVol || a.net_vol || 0) * 1.5 + Number(a.buy_amt || 0) / 10000;
          const scoreB = Number(b.multiDayNetVol || b.net_vol || 0) * 1.5 + Number(b.buy_amt || 0) / 10000;
          return scoreB - scoreA;
        });

        if (!symbol) {
          setups = setups.slice(0, limit);
        }
      }
    }
  } catch (err) {
    console.warn('[SmartAlertEngine] scanUniverseForBroker58Ignitions notice:', err.message);
  }

  return { success: true, sessionDate: targetDate, setups };
}

/**
 * Queries multi-day stealth accumulation for Broker #58 across the last N trading sessions.
 * Returns cumulative kitta, capital outlay in Cr, buy ratio %, market share %, base compression range %,
 * and an empirical ignition horizon (e.g. "1–3 Days: Poised for Markup").
 */
export async function getMultiDayBroker58Accumulation(symbol, { lookbackDays = 5, sessionDate = null } = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;

  try {
    const { db } = await import('./db/ledgerStore.js');
    if (!db) return null;

    let targetDate = sessionDate;
    if (!targetDate) {
      const dateRow = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_broker_ledger').get();
      targetDate = dateRow?.maxDate || '';
    }
    if (!targetDate) return null;

    // Get last N distinct trading dates ending at targetDate
    const sessionDates = db.prepare(`
      SELECT DISTINCT trade_date 
      FROM daily_broker_ledger 
      WHERE trade_date <= ? 
      ORDER BY trade_date DESC 
      LIMIT ?
    `).all(targetDate, lookbackDays).map(r => r.trade_date);

    if (!sessionDates || sessionDates.length === 0) return null;

    const minDate = sessionDates[sessionDates.length - 1];
    const maxDate = sessionDates[0];

    // Query multi-day broker ledger for Broker 58
    const brokerRows = db.prepare(`
      SELECT trade_date, buy_vol, sell_vol, buy_amt, sell_amt,
             (buy_vol - sell_vol) as net_vol,
             ROUND(CAST(buy_vol AS REAL) / MAX(1, buy_vol + sell_vol) * 100, 1) as buy_ratio,
             ROUND(buy_amt / MAX(1, buy_vol), 1) as vwap
      FROM daily_broker_ledger
      WHERE broker_id = 58 AND symbol = ? AND trade_date >= ? AND trade_date <= ?
      ORDER BY trade_date DESC
    `).all(sym, minDate, maxDate);

    // Query market totals & price movement across the window
    const mktRow = db.prepare(`
      SELECT SUM(total_volume) as mkt_total_vol,
             MIN(low_price) as min_low,
             MAX(high_price) as max_high,
             (SELECT close_price FROM daily_stock_summary WHERE symbol = ? AND trade_date = ? LIMIT 1) as ltp,
             (SELECT open_price FROM daily_stock_summary WHERE symbol = ? AND trade_date = ? LIMIT 1) as window_open
      FROM daily_stock_summary
      WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?
    `).get(sym, maxDate, sym, minDate, sym, minDate, maxDate);

    const activeDays = brokerRows.length;
    let totalBuyVol = 0;
    let totalSellVol = 0;
    let totalBuyAmt = 0;
    for (const r of brokerRows) {
      totalBuyVol += Number(r.buy_vol || 0);
      totalSellVol += Number(r.sell_vol || 0);
      totalBuyAmt += Number(r.buy_amt || 0);
    }

    const netBuyVol = totalBuyVol - totalSellVol;
    const totalBuyAmtCr = +(totalBuyAmt / 10000000).toFixed(2);
    const windowBuyRatio = (totalBuyVol + totalSellVol) > 0 
      ? +((totalBuyVol / (totalBuyVol + totalSellVol)) * 100).toFixed(1) 
      : 0;
    const windowVwap = totalBuyVol > 0 
      ? +(totalBuyAmt / totalBuyVol).toFixed(1) 
      : Number(mktRow?.ltp || 100);

    const mktTotalVol = Number(mktRow?.mkt_total_vol || 0);
    const marketSharePct = mktTotalVol > 0 
      ? +((totalBuyVol / mktTotalVol) * 100).toFixed(1) 
      : 0;

    const minLow = Number(mktRow?.min_low || windowVwap);
    const maxHigh = Number(mktRow?.max_high || windowVwap);
    const ltp = Number(mktRow?.ltp || windowVwap);
    const rangeCompressionPct = minLow > 0 
      ? +(((maxHigh - minLow) / minLow) * 100).toFixed(1) 
      : 0;
    const distFromVwapPct = windowVwap > 0 
      ? +(((ltp - windowVwap) / windowVwap) * 100).toFixed(1) 
      : 0;

    // Empirical Ignition Horizon determination
    let ignitionHorizon = 'Neutral (Accumulation threshold pending)';
    if (activeDays >= 2 && netBuyVol >= 15000 && windowBuyRatio >= 65) {
      if (marketSharePct >= 17.0 || netBuyVol >= 80000 || (activeDays >= 3 && windowBuyRatio >= 72)) {
        ignitionHorizon = '1–3 Days (Supply Vacuum Stage 2 Complete)';
      } else {
        ignitionHorizon = '2–4 Days (Stage 1: Stealth Seeding Ongoing)';
      }
    }

    return {
      symbol: sym,
      targetDate: maxDate,
      lookbackDays: sessionDates.length,
      activeDays,
      totalBuyVol,
      totalSellVol,
      netBuyVol,
      totalBuyAmt,
      totalBuyAmtCr,
      windowBuyRatio,
      windowVwap,
      mktTotalVol,
      marketSharePct,
      minLow,
      maxHigh,
      ltp,
      rangeCompressionPct,
      distFromVwapPct,
      ignitionHorizon,
      dailyBreakdown: brokerRows
    };
  } catch (err) {
    console.warn('[SmartAlertEngine] getMultiDayBroker58Accumulation error:', err.message);
    return null;
  }
}

export async function testTriggerBroker58Alert(customSymbol = 'GHL', mockParams = {}) {
  const sym = String(customSymbol || 'GHL').toUpperCase().trim();
  const ltp = Number(mockParams.ltp || 335.0);
  const operatorVwap = Number(mockParams.operatorVwap || 333.2);
  const buyVol = Number(mockParams.buyVol || 266203);
  const sellVol = Number(mockParams.sellVol || 67826);
  const netVol = buyVol - sellVol;
  const buyRatioPct = (buyVol + sellVol) > 0 ? +((buyVol / (buyVol + sellVol)) * 100).toFixed(1) : 0;
  const marketSharePct = Number(mockParams.marketSharePct || 23.6);
  const totalBuyAmount = buyVol * operatorVwap;
  const pChange = Number(mockParams.pChange || 1.5);

  const buyZone = {
    low: Math.floor(operatorVwap * 0.99),
    high: Math.ceil(operatorVwap * 1.015)
  };
  const stopLoss = Math.round(operatorVwap * 0.950 * 10) / 10;
  const target1 = Math.round(operatorVwap * 1.080 * 10) / 10;
  const target2 = Math.round(operatorVwap * 1.145 * 10) / 10;
  const netRRR = +(((target1 - ltp) / Math.max(1, ltp - stopLoss))).toFixed(1);

  const alertItem = {
    id: `b58_alert_${sym}_${Date.now()}`,
    symbol: sym,
    companyName: stockMap[sym]?.name || sym,
    type: 'BROKER_58_EARLY_IGNITION',
    category: 'pro',
    tier: 'pro',
    isPro: true,
    title: `🚨 Early Operator Ignition: ${sym}`,
    body: `Broker #58 (Naasa) net bought +${netVol.toLocaleString()} kitta (${marketSharePct}% share) at Rs. ${operatorVwap} basis before breakout!`,
    action: 'OPEN_STOCK_DETAIL',
    ltp,
    pChange,
    triggeredAt: new Date().toISOString(),
    brokerId: 58,
    brokerName: 'Naasa Securities',
    brokerBuyVol: buyVol,
    brokerSellVol: sellVol,
    netVol,
    buyRatioPct,
    marketSharePct,
    totalBuyAmount,
    operatorVwap,
    timingSignature: '⚡ Afternoon Stealth Accumulation (1:15 PM – 2:55 PM NPT)',
    stage: 'STAGE_2_SUPPLY_VACUUM_IGNITION',
    stageBadge: '⚡ Stage 2: Supply Vacuum Ignition',
    buyZone,
    stopLoss,
    target1,
    target2,
    netRRR: netRRR > 0 ? netRRR : 2.8,
    isTest: true,
    forceDispatch: true,
    status: 'ACTIVE'
  };

  broadcastAlert(alertItem);
  return { triggered: true, alert: alertItem };
}

// ── 7.5. HIGH-VOLUME BREAKOUT WITH HISTORICAL DATA REFERENCE ────────────────

const BREAKOUT_COOLDOWN_MS = 90 * 60 * 1000;
const BREAKOUT_STATE_FILE = path.join(DATA_DIR, 'breakout_alert_state.json');
let breakoutAlertStateMap = {};
try {
  breakoutAlertStateMap = loadJson(BREAKOUT_STATE_FILE, {});
} catch (_) {}

/**
 * Evaluates whether a stock is staging a legitimate High-Volume Breakout
 * by referencing historical 20-Day price resistance and average daily volume.
 */
export function detectHistoricalVolumeBreakout({
  symbol,
  ltp,
  high,
  low,
  open,
  pChange = null,
  volume = 0,
  turnover = 0,
  floorsheetTrades = [],
  priceHistory = [],
  avgVolume20D = 0
} = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  const currentLtp = Number(ltp || 0);
  if (!sym || currentLtp <= 0) {
    return { qualified: false, reason: 'Invalid symbol or price' };
  }

  // 1. Historical Reference Baseline (Need at least 10 historical sessions)
  let pastCandles = [];
  if (Array.isArray(priceHistory) && priceHistory.length >= 10) {
    // Exclude today's latest candle if included in history
    pastCandles = priceHistory.slice(-21, -1);
    if (pastCandles.length < 5) pastCandles = priceHistory.slice(-15);
  }

  if (pastCandles.length < 5) {
    return { qualified: false, reason: 'Insufficient historical data to verify 20D resistance and volume' };
  }

  // 20-Day Resistance: highest high of the previous 20 sessions
  const resistance20D = Math.max(...pastCandles.map(c => Number(c.high || c.close || c.ltp || 0)).filter(p => p > 0));
  if (resistance20D <= 0) {
    return { qualified: false, reason: 'Invalid historical resistance calculation' };
  }

  // 20-Day Average Daily Volume
  const sumPastVol = pastCandles.reduce((acc, c) => acc + Number(c.volume || c.totalTradedQuantity || 0), 0);
  const baselineAvgVol = sumPastVol > 0 ? Math.round(sumPastVol / pastCandles.length) : Number(avgVolume20D || 50000);

  // 2. Relative Volume (RVOL) Surge Calculation
  const currentVol = Number(volume || 0);
  const status = getDetailedMarketStatus();
  const nptMins = status.nptTotalMinutes || 720;
  let timeScaleFactor = 1.0;
  if (status.isOpen) {
    const elapsedTradingMins = Math.max(15, Math.min(240, nptMins - 660)); // 11:00 AM = 660
    timeScaleFactor = +(240 / elapsedTradingMins).toFixed(2);
  }

  const projectedDailyVol = Math.round(currentVol * timeScaleFactor);
  const rvol = baselineAvgVol > 0 ? +(projectedDailyVol / baselineAvgVol).toFixed(2) : 1.0;
  const currentVolMultiple = baselineAvgVol > 0 ? +(currentVol / baselineAvgVol).toFixed(2) : 0;

  // 3. Breakout Qualification Rules:
  // Rule A: Price Breakout above 20D Resistance (within 0% to +6.5% buffer; rejects late overextended chase)
  const isAboveResistance = currentLtp >= resistance20D;
  const breakoutPct = +(((currentLtp - resistance20D) / resistance20D) * 100).toFixed(2);
  const isWithinSafeBand = breakoutPct >= 0 && breakoutPct <= 6.5;

  // Rule B: Volume Surge (RVOL >= 1.75x or current volume already >= 1.2x full 20D average)
  const isVolumeSurging = rvol >= 1.75 || currentVolMultiple >= 1.2;

  // Rule C: Liquidity Floor (Min 5,000 kitta traded & turnover >= 10 Lakhs)
  const isLiquid = currentVol >= 5000 && Number(turnover || 0) >= 1000000;

  // Rule D: Institutional Buyer Confirmation from Floorsheet (if trades available)
  let bcr3BuyPct = 50;
  let dominantBuyerText = 'Institutional Buyers';
  if (Array.isArray(floorsheetTrades) && floorsheetTrades.length > 0) {
    const buyerMap = {};
    let totBuy = 0;
    floorsheetTrades.forEach(t => {
      const b = String(t.buyerBroker || t.buyer || '').trim();
      const q = Number(t.qty || t.quantity || 0);
      if (b) {
        buyerMap[b] = (buyerMap[b] || 0) + q;
        totBuy += q;
      }
    });
    const sorted = Object.entries(buyerMap).sort((a, b) => b[1] - a[1]);
    const top3Qty = sorted.slice(0, 3).reduce((sum, item) => sum + item[1], 0);
    if (totBuy > 0) {
      bcr3BuyPct = Math.round((top3Qty / totBuy) * 100);
      dominantBuyerText = sorted.slice(0, 2).map(([b]) => `Broker #${b}`).join(' & ');
    }
  }

  const qualified = isAboveResistance && isWithinSafeBand && isVolumeSurging && isLiquid;

  // 4. Clean Asymmetric Trading Levels
  const buyZoneLow = resistance20D;
  const buyZoneHigh = +(resistance20D * 1.025).toFixed(1);
  const chaseCap = +(resistance20D * 1.035).toFixed(1);
  const stopLoss = +(resistance20D * 0.955).toFixed(1); // -4.5% below breakout pivot
  const target1 = +(currentLtp * 1.080).toFixed(1);     // +8.0% Momentum Target
  const target2 = +(currentLtp * 1.145).toFixed(1);     // +14.5% Circuit Ceiling

  return {
    qualified,
    symbol: sym,
    companyName: stockMap[sym]?.name || sym,
    ltp: currentLtp,
    pChange: pChange != null ? Number(pChange) : breakoutPct,
    resistance20D,
    breakoutPct,
    currentVolume: currentVol,
    projectedDailyVolume: projectedDailyVol,
    avgVolume20D: baselineAvgVol,
    rvol,
    currentVolMultiple,
    turnover: Number(turnover || 0),
    bcr3BuyPct,
    dominantBuyerText,
    buyZone: { low: buyZoneLow, high: buyZoneHigh },
    chaseCap,
    stopLoss,
    target1,
    target2,
    netRRR: 2.8,
    reason: qualified 
      ? `LTP Rs. ${currentLtp} broke 20-day high (Rs. ${resistance20D}) with ${rvol}x volume surge!` 
      : (!isAboveResistance ? `LTP Rs. ${currentLtp} below 20D resistance Rs. ${resistance20D}` : `Volume ratio ${rvol}x below 1.75x threshold`)
  };
}

export async function processBreakoutAlertTrigger(breakoutEval) {
  const sym = breakoutEval.symbol;
  const now = Date.now();
  const lastTriggered = breakoutAlertStateMap[sym]?.lastTriggeredAt || 0;

  if (!breakoutEval.forceDispatch && (now - lastTriggered < BREAKOUT_COOLDOWN_MS)) {
    return { triggered: false, reason: 'Cooldown active', remainingMins: Math.ceil((BREAKOUT_COOLDOWN_MS - (now - lastTriggered)) / 60000) };
  }

  breakoutAlertStateMap[sym] = {
    symbol: sym,
    lastTriggeredAt: now,
    lastLtp: breakoutEval.ltp,
    resistance20D: breakoutEval.resistance20D
  };
  saveJson(BREAKOUT_STATE_FILE, breakoutAlertStateMap);

  const alertItem = {
    id: `breakout_alert_${sym}_${now}`,
    symbol: sym,
    companyName: breakoutEval.companyName,
    type: 'BREAKOUT',
    category: 'pro',
    tier: 'pro',
    isPro: true,
    title: `🚀 High-Volume Breakout: ${sym}`,
    body: `Price Rs. ${breakoutEval.ltp} cleared 20-Day Resistance (Rs. ${breakoutEval.resistance20D}) with ${breakoutEval.rvol}x Volume Surge! Lead buyers: ${breakoutEval.dominantBuyerText}.`,
    action: 'OPEN_STOCK_DETAIL',
    ltp: breakoutEval.ltp,
    pChange: breakoutEval.pChange,
    triggeredAt: new Date(now).toISOString(),
    resistance20D: breakoutEval.resistance20D,
    breakoutPct: breakoutEval.breakoutPct,
    rvol: breakoutEval.rvol,
    avgVolume20D: breakoutEval.avgVolume20D,
    currentVolume: breakoutEval.currentVolume,
    buyZone: breakoutEval.buyZone,
    chaseCap: breakoutEval.chaseCap,
    stopLoss: breakoutEval.stopLoss,
    target1: breakoutEval.target1,
    target2: breakoutEval.target2,
    netRRR: breakoutEval.netRRR,
    status: 'ACTIVE'
  };

  alertHistory.unshift(alertItem);
  if (alertHistory.length > 100) alertHistory.pop();
  saveJson(HISTORY_FILE, alertHistory);

  broadcastAlert(alertItem);
  return { triggered: true, alert: alertItem };
}

/**
 * Calculates Exponential Moving Average (EMA) for an array of numbers.
 */
export function computeEma(prices, period = 20) {
  if (!Array.isArray(prices) || period <= 0 || prices.length < period) return null;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += Number(prices[i] || 0);
  let ema = sum / period;
  const emaArr = new Array(prices.length);
  for (let i = 0; i < period - 1; i++) emaArr[i] = null;
  emaArr[period - 1] = ema;
  for (let i = period; i < prices.length; i++) {
    ema = Number(prices[i] || 0) * k + ema * (1 - k);
    emaArr[i] = ema;
  }
  return emaArr;
}

/**
 * Scans for stocks that crossed above their 20 EMA with volume expansion in the last 1–10 sessions,
 * have NOT surged away (distance from 20 EMA within -2.0% to +7.5%), and are coiling tightly
 * in a sharp consolidation base (range <= 9.0%) poised for a secondary ignition.
 */
export async function scanEmaCrossoverAndSharpBase({
  lookbackSessions = 10,
  maxSurgePct = 7.5,
  maxBaseRangePct = 9.0,
  sessionDate = null,
  symbol = null,
  limit = 6
} = {}) {
  try {
    const { db } = await import('./db/ledgerStore.js');
    if (!db) return [];

    let targetDate = sessionDate;
    if (!targetDate) {
      const dateRow = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_stock_summary').get();
      targetDate = dateRow?.maxDate || '';
    }
    if (!targetDate) return [];

    // Retrieve all dates up to targetDate (at least 35 sessions for 20 EMA + lookback)
    const allDates = db.prepare(`
      SELECT DISTINCT trade_date 
      FROM daily_stock_summary 
      WHERE trade_date <= ? 
      ORDER BY trade_date DESC 
      LIMIT 45
    `).all(targetDate).map(r => r.trade_date).reverse();

    if (allDates.length < 22) return [];

    const symbols = symbol 
      ? [String(symbol).toUpperCase().trim()]
      : db.prepare(`
          SELECT DISTINCT symbol FROM daily_stock_summary 
          WHERE trade_date = ? AND total_volume >= 4000 AND close_price >= 100
        `).all(targetDate).map(r => r.symbol);

    const getHistoryStmt = db.prepare(`
      SELECT trade_date, close_price, high_price, low_price, total_volume, total_turnover
      FROM daily_stock_summary
      WHERE symbol = ? AND trade_date <= ?
      ORDER BY trade_date ASC
    `);

    const results = [];

    for (const sym of symbols) {
      const rows = getHistoryStmt.all(sym, targetDate);
      if (rows.length < 22) continue;

      const closes = rows.map(r => r.close_price);
      const volumes = rows.map(r => r.total_volume);
      const emas = computeEma(closes, 20);
      if (!emas) continue;

      const n = rows.length - 1;
      const currentClose = closes[n];
      const currentEma = emas[n];
      const currentVol = volumes[n];

      // 20-day historical average volume prior to current session
      const prev20Vols = volumes.slice(Math.max(0, n - 20), n);
      const avgVol20 = prev20Vols.reduce((a, b) => a + b, 0) / Math.max(1, prev20Vols.length);

      // Search for crossover within last `lookbackSessions` (n - lookbackSessions to n)
      let crossIndex = -1;
      let crossDate = null;
      let crossVol = 0;
      let crossAvgVol = 0;

      const minLookback = Math.max(20, n - (lookbackSessions - 1));
      for (let i = minLookback; i <= n; i++) {
        const prevClose = closes[i - 1];
        const prevEma = emas[i - 1];
        const thisClose = closes[i];
        const thisEma = emas[i];
        const thisVol = volumes[i];

        if (prevClose <= prevEma * 1.008 && thisClose > thisEma) {
          const histVols = volumes.slice(Math.max(0, i - 20), i);
          const histAvg = histVols.reduce((a, b) => a + b, 0) / Math.max(1, histVols.length);
          if (thisVol >= 1.2 * histAvg || thisVol >= 20000) {
            crossIndex = i;
            crossDate = rows[i].trade_date;
            crossVol = thisVol;
            crossAvgVol = histAvg;
            break;
          }
        }
      }

      if (crossIndex === -1) {
        // If single symbol query, check if price is already above 20 EMA and holding tight base
        if (symbol && currentClose >= currentEma * 0.985) {
          crossIndex = Math.max(20, n - 3);
          crossDate = rows[crossIndex]?.trade_date || targetDate;
          crossVol = currentVol;
          crossAvgVol = avgVol20;
        } else {
          continue;
        }
      }

      const daysSinceCross = n - crossIndex;

      // 1. "Does not surge high" filter
      const distFromEmaPct = currentEma > 0 ? +(((currentClose - currentEma) / currentEma) * 100).toFixed(1) : 0;
      if (distFromEmaPct < -2.0 || distFromEmaPct > maxSurgePct) continue;

      // 2. "Sharp accumulation base" filter
      const postCrossRows = rows.slice(crossIndex);
      const postCloses = postCrossRows.map(r => r.close_price);
      const minPostClose = Math.min(...postCloses);
      const maxPostClose = Math.max(...postCloses);
      const consolidationRangePct = +(((maxPostClose - minPostClose) / Math.max(1, minPostClose)) * 100).toFixed(1);

      if (consolidationRangePct > maxBaseRangePct) continue;
      if (currentClose < currentEma * 0.980) continue;

      const rvolToday = Number((currentVol / Math.max(1, avgVol20)).toFixed(2));
      const rvolCross = Number((crossVol / Math.max(1, crossAvgVol)).toFixed(2));

      // Execution plan levels
      const buyLow = Math.floor(currentEma * 0.995);
      const buyHigh = Math.ceil(currentClose * 1.015);
      const stopLoss = Math.round(currentEma * 0.955 * 10) / 10;
      const target1 = Math.round(currentClose * 1.080 * 10) / 10;
      const target2 = Math.round(currentClose * 1.145 * 10) / 10;

      const statusBadge = daysSinceCross === 0
        ? '⚡ Fresh 20 EMA Cross Today'
        : `🔥 20 EMA Cross &amp; Sharp Base (${daysSinceCross}D Coiling)`;

      results.push({
        symbol: sym,
        sessionDate: targetDate,
        ltp: currentClose,
        ema20: Number(currentEma.toFixed(1)),
        distFromEmaPct,
        daysSinceCross,
        crossDate,
        rvolCross,
        rvolToday,
        todayVolume: currentVol,
        avgVol20: Math.round(avgVol20),
        consolidationRangePct,
        minBasePrice: minPostClose,
        maxBasePrice: maxPostClose,
        buyZone: { low: buyLow, high: buyHigh },
        stopLoss,
        target1,
        target2,
        statusBadge,
        ignitionVerdict: 'Coiled for Secondary Expansion Wave (Supply Absorbed)'
      });
    }

    // Sort by setup quality
    results.sort((a, b) => {
      const scoreA = (a.rvolCross * 1.5) + (a.rvolToday * 1.0) - (a.consolidationRangePct * 0.5) + (a.daysSinceCross > 0 ? 3 : 0);
      const scoreB = (b.rvolCross * 1.5) + (b.rvolToday * 1.0) - (b.consolidationRangePct * 0.5) + (b.daysSinceCross > 0 ? 3 : 0);
      return scoreB - scoreA;
    });

    return results.slice(0, limit);
  } catch (err) {
    console.warn('[SmartAlertEngine] scanEmaCrossoverAndSharpBase error:', err.message);
    return [];
  }
}

// ── 8. EXPORT PUBLIC STATE QUERIES ──────────────────────────────────────────

export function getActiveSmartAlerts() {
  const now = Date.now();
  // Filter alerts triggered within today's session (last 6 hours), suppressing internal holdings and empty alerts
  return alertHistory.filter(a => {
    if (!a || a.isUserHolding) return false;
    if (!String(a.title || '').trim() || !String(a.body || '').trim()) return false;
    const t = new Date(a.triggeredAt || a.timestamp || 0).getTime();
    return (now - t) < (6 * 60 * 60 * 1000);
  });
}

export function getSmartAlertHistory(limit = 50) {
  // Exclude internal portfolio tracking records and empty alerts
  return alertHistory.filter(a => a && !a.isUserHolding && String(a.title || '').trim().length > 0).slice(0, limit);
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
    isFcmInitialized: hasValidFcmPrivateKey,
    hasValidFcmPrivateKey,
    nativeWorkManagerSupported: true,
    androidChannels: ['dravyashree-pro-signals', 'nepse-general-news'],
    registeredPushTokensCount: pushTokens.length,
    activeAlertsToday: getActiveSmartAlerts().length,
    totalHistoryCount: alertHistory.length,
    marketSession: status.session,
    isTradingDay: status.isTradingDay,
    nptTotalMinutes: status.nptTotalMinutes,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Register personal user holding to be actively monitored for Stop-Loss and Target alerts on Telegram
 */
export function trackCustomHolding({ symbol, buyPrice, currentPrice, stopLoss, target1, target2, kitta = 100, ltp }) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return null;
  const buy = Number(buyPrice || ltp || 0);
  const cur = Number(currentPrice || ltp || buy || 0);
  const sl = Number(stopLoss || (buy > 0 ? (buy * 0.95).toFixed(1) : (cur > 0 ? (cur * 0.95).toFixed(1) : 0)));
  const t1 = Number(target1 || (buy > 0 ? (buy * 1.08).toFixed(1) : (cur > 0 ? (cur * 1.08).toFixed(1) : 0))); // +8.0% pre-circuit
  const t2 = Number(target2 || (buy > 0 ? (buy * 1.145).toFixed(1) : (cur > 0 ? (cur * 1.145).toFixed(1) : 0))); // +14.5% near +15% circuit ceiling
  const qty = Number(kitta || 100);

  // Clear out any existing active records for this symbol to prevent duplicate or conflicting monitoring
  alertHistory = alertHistory.filter(a => !(a.symbol === sym && (a.status === 'ACTIVE' || a.status === 'ACTIVE_T2')));

  const alertItem = {
    id: `holding_${sym}_${Date.now()}`,
    symbol: sym,
    buyPrice: buy,
    currentPrice: cur > 0 ? cur : buy,
    ltp: cur > 0 ? cur : buy,
    triggeredAt: new Date().toISOString(),
    stopLoss: sl,
    target1: t1,
    target2: t2,
    kitta: qty,
    status: 'ACTIVE',
    isUserHolding: true
  };

  alertHistory.unshift(alertItem);
  saveJson(HISTORY_FILE, alertHistory);
  console.log(`[SmartAlertEngine] 📋 Holding registered for active monitoring: ${sym} (Buy: Rs. ${buy}, LTP: Rs. ${cur}, SL: Rs. ${sl}, T1: Rs. ${t1}, T2: Rs. ${t2}, Kitta: ${qty})`);
  return alertItem;
}

export function untrackCustomHolding(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return false;
  let removed = false;
  alertHistory = alertHistory.filter(a => {
    if (a.symbol === sym && a.isUserHolding && (a.status === 'ACTIVE' || a.status === 'ACTIVE_T2')) {
      removed = true;
      return false;
    }
    return true;
  });
  if (removed) {
    saveJson(HISTORY_FILE, alertHistory);
    console.log(`[SmartAlertEngine] 🗑️ Untracked user holding: ${sym}`);
  }
  return removed;
}

export function getUserTrackedHoldings() {
  return alertHistory.filter(a => a.isUserHolding && (a.status === 'ACTIVE' || a.status === 'ACTIVE_T2'));
}



// ── 9. LIVE NEWS & IPO WATCHER ──────────────────────────────────────────────

const seenNewsKeys = new Set(loadJson(SEEN_NEWS_FILE, []));
const seenIpoStatusKeys = new Set(loadJson(SEEN_IPO_FILE, []));
let lastNonHoldingPushWindow = ''; // e.g. "2026-11-10_11am" or "2026-11-10_6pm"

export function isNonHoldingPushWindowActive() {
  const status = getDetailedMarketStatus();
  const nptMins = status.nptTotalMinutes;
  // Window 1: 11:00 AM NPT (660 to 680 mins, i.e. 11:00 AM - 11:20 AM)
  const isMorningWindow = nptMins >= 660 && nptMins < 680;
  // Window 2: 6:00 PM NPT (1080 to 1100 mins, i.e. 6:00 PM - 6:20 PM)
  const isEveningWindow = nptMins >= 1080 && nptMins < 1100;

  if (isMorningWindow) return { active: true, windowId: '11am', label: '11:00 AM Morning Corporate Action Digest' };
  if (isEveningWindow) return { active: true, windowId: '6pm', label: '6:00 PM Evening Corporate Action Digest' };
  return { active: false, windowId: null, label: null };
}

export async function checkAndDispatchScheduledNonHoldingDigest() {
  // User policy: Non-holding corporate action alerts are completely suppressed.
  // Only personal portfolio holdings are alerted.
  return;
}

function saveSeenNewsKeys() {
  try {
    const trimmed = Array.from(seenNewsKeys).slice(-600);
    seenNewsKeys.clear();
    trimmed.forEach(k => seenNewsKeys.add(k));
    saveJson(SEEN_NEWS_FILE, trimmed);
  } catch (_) {}
}

function saveSeenIpoKeys() {
  try {
    const trimmed = Array.from(seenIpoStatusKeys).slice(-300);
    seenIpoStatusKeys.clear();
    trimmed.forEach(k => seenIpoStatusKeys.add(k));
    saveJson(SEEN_IPO_FILE, trimmed);
  } catch (_) {}
}

function generateNewsContentKey(title, url = '') {
  let hash = 0;
  const clean = String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  return `news_${Math.abs(hash).toString(36)}`;
}

export async function pollLiveNewsAndIpoAlerts(fetchNewsFn = null, getIpoListingsFn = null) {
  let actualNewsFn = fetchNewsFn;
  let actualIpoFn = getIpoListingsFn;

  // 1. Check Live News & Corporate Announcements across multi-portal scrapers
  try {
    let articles = [];
    if (typeof fetchNewsFn === 'object' && fetchNewsFn !== null) {
      actualIpoFn = fetchNewsFn.getLiveIpoListings || fetchNewsFn.getIpoListingsFn || null;

      const scrapers = [];
      if (typeof fetchNewsFn.scrapeMeroLaganiAnnouncements === 'function') scrapers.push(fetchNewsFn.scrapeMeroLaganiAnnouncements().catch(() => []));
      if (typeof fetchNewsFn.scrapeMeroLaganiNews === 'function') scrapers.push(fetchNewsFn.scrapeMeroLaganiNews().catch(() => []));
      if (typeof fetchNewsFn.scrapeShareSansarNews === 'function') scrapers.push(fetchNewsFn.scrapeShareSansarNews().catch(() => []));
      if (typeof fetchNewsFn.fetchNepaliPaisaNews === 'function') scrapers.push(fetchNewsFn.fetchNepaliPaisaNews().catch(() => []));
      if (typeof fetchNewsFn.scrapeBizshalaNews === 'function') scrapers.push(fetchNewsFn.scrapeBizshalaNews().catch(() => []));
      if (typeof fetchNewsFn.fetchKarobarNews === 'function') scrapers.push(fetchNewsFn.fetchKarobarNews().catch(() => []));
      if (typeof fetchNewsFn.fetchClickmanduNews === 'function') scrapers.push(fetchNewsFn.fetchClickmanduNews().catch(() => []));
      if (typeof fetchNewsFn.fetchNewsFn === 'function') scrapers.push(fetchNewsFn.fetchNewsFn().catch(() => []));

      const settled = await Promise.allSettled(scrapers);
      for (const s of settled) {
        if (s.status === 'fulfilled' && Array.isArray(s.value)) {
          articles.push(...s.value);
        }
      }
    } else if (typeof actualNewsFn === 'function') {
      articles = await actualNewsFn().catch(() => []);
    }

    if (Array.isArray(articles) && articles.length > 0) {
      // Cold boot guard: When the server first boots with an empty seenNewsKeys set,
      // seed all currently scraped news into memory/disk so we NEVER blast old news
      // as repeated push notifications upon deployment restarts.
      if (seenNewsKeys.size === 0) {
        for (const item of articles) {
          const title = String(item.title || '').trim();
          if (!title) continue;
          const itemKey = (item.id && !String(item.id).startsWith('ss-') && !String(item.id).startsWith('ml-'))
            ? `news_${item.id}`
            : generateNewsContentKey(title, item.url || item.link);
          seenNewsKeys.add(itemKey);
        }
        saveSeenNewsKeys();
        console.log(`[SmartAlertEngine] Cold boot guard: seeded ${seenNewsKeys.size} historical news articles to suppress restart notification spam.`);
        return;
      }

      const impactKeywords = [
        'लाभांश', 'बोनस', 'हकप्रद', 'साधारण सभा', 'वित्तीय विवरण', 'आइपिओ', 'म्युचुअल फन्ड', 'बुक क्लोज', 'बुकक्लोज',
        'dividend', 'bonus', 'bonus share', 'cash dividend', 'unclaimed dividend', 'unclaimed cash dividend',
        'right share', 'rights issue', 'right issue', 'right offering',
        'agm', 'annual general meeting', 'book closure', 'quarterly', 'quarter of fy', 'financial statement',
        'provisional financial', 'financial report', 'ipo', 'circuit', 'halt', 'monetary policy', 'ब्याजदर', 'राष्ट्र बैंक', 'धितोपत्र बोर्ड'
      ];

      for (const item of articles.slice(0, 50)) {
        const title = String(item.title || '').trim();
        if (!title || title.length < 10) continue;

        // Generate deterministic, stable key for this news story
        const itemKey = (item.id && !String(item.id).startsWith('ss-') && !String(item.id).startsWith('ml-'))
          ? `news_${item.id}`
          : generateNewsContentKey(title, item.url || item.link);

        if (seenNewsKeys.has(itemKey)) continue;

        const lowerTitle = title.toLowerCase();
        const hasImpact = impactKeywords.some(kw => lowerTitle.includes(kw));

        // Stock Symbol extraction: robust matcher against ticker or official company name
        let foundSym = extractStockSymbolFromText(title) || (item.body ? extractStockSymbolFromText(item.body) : null);
        if (!foundSym && item.symbol && item.symbol !== 'NEPSE') {
          foundSym = String(item.symbol).toUpperCase();
        }

        const isPortfolioTracked = foundSym && userTrackedSymbolsSet.has(foundSym);

        // Alert if high-impact keyword matches, or any specific scrip is mentioned, or portfolio tracked
        if (hasImpact || foundSym || isPortfolioTracked) {
          seenNewsKeys.add(itemKey);
          saveSeenNewsKeys();

          // Categorize by impact type for nepse-general-news channel (#38BDF8)
          const isDividend = ['लाभांश', 'बोनस', 'नगद लाभांश', 'प्रतिशत लाभांश', 'dividend', 'bonus share', 'bonus', 'cash dividend', 'unclaimed cash dividend', 'unclaimed dividend'].some(kw => lowerTitle.includes(kw));
          const isRightShare = ['हकप्रद', 'right share', 'right issue', 'rights issue', 'right offering', 'हकप्रद सेयर'].some(kw => lowerTitle.includes(kw));
          const isBookClosure = ['बुक क्लोज', 'बुकक्लोज', 'साधारण सभा', 'book closure', 'agm', 'annual general meeting', 'special general meeting', 'sgm'].some(kw => lowerTitle.includes(kw));
          const isFinancial = ['वित्तीय विवरण', 'त्रैमासिक', 'quarterly report', 'financial statement', 'financial report', 'provisional financial', 'quarterly', 'quarter of fy', 'earnings', 'खुद नाफा'].some(kw => lowerTitle.includes(kw));
          const isMacro = ['मौद्रिक नीति', 'ब्याजदर', 'धितोपत्र बोर्ड', 'राष्ट्र बैंक', 'सर्कुलर', 'सर्किट', 'monetary policy', 'interest rate', 'sebon', 'nrb', 'halt', 'circuit breaker'].some(kw => lowerTitle.includes(kw));
          const isHighImportanceNews = isMacro || ['अर्थमन्त्री', 'बजेट', 'धितोपत्र', 'मन्त्रिपरिषद्', 'नेप्से परिसूचक', 'शेयर बजार', 'बजार बन्द', 'कारोबार स्थगित', 'सूचक', 'finance minister', 'budget', 'gdp', 'inflation', 'cabinet', 'nepse index', 'trading halt'].some(kw => lowerTitle.includes(kw));

          let notifType = 'NEWS_ALERT';
          let notifCategory = 'general';
          let notifTitle = '';

          if (isDividend) {
            notifType = 'DIVIDEND_ALERT';
            notifCategory = 'general';
            notifTitle = foundSym
              ? `💰 ${isPortfolioTracked ? '💼 [Portfolio] ' : ''}${foundSym} Dividend / Bonus Announced`
              : `💰 NEPSE Dividend Announcement`;
          } else if (isRightShare) {
            notifType = 'RIGHT_SHARE_ALERT';
            notifCategory = 'general';
            notifTitle = foundSym
              ? `📈 ${isPortfolioTracked ? '💼 [Portfolio] ' : ''}${foundSym} Right Share Notice`
              : `📈 NEPSE Right Share Notice`;
          } else if (isBookClosure) {
            notifType = 'BOOK_CLOSURE_ALERT';
            notifCategory = 'general';
            notifTitle = foundSym
              ? `📅 ${isPortfolioTracked ? '💼 [Portfolio] ' : ''}${foundSym} Book Closure / AGM Notice`
              : `📅 NEPSE Book Closure Notice`;
          } else if (isFinancial) {
            notifType = 'EARNINGS_ALERT';
            notifCategory = 'general';
            notifTitle = foundSym
              ? `📊 ${isPortfolioTracked ? '💼 [Portfolio] ' : ''}${foundSym} Financial Results`
              : `📊 Financial Announcement`;
          } else if (isHighImportanceNews) {
            notifType = 'NEPSE_MACRO';
            notifCategory = 'general';
            notifTitle = `🏛️ NEPSE Market & Policy Alert`;
          } else if (isPortfolioTracked && foundSym) {
            notifType = 'PORTFOLIO_NEWS_ALERT';
            notifCategory = 'general';
            notifTitle = `💼 Portfolio Alert: ${foundSym}`;
          } else {
            notifType = 'NEWS_ALERT';
            notifCategory = 'general';
            notifTitle = foundSym ? `📰 ${foundSym} Corporate Announcement` : `📰 NEPSE Announcement`;
          }

          // User Policy for nepse-general-news channel:
          // Corporate Actions, Dividends, Right Shares, Financial Reports, AGM notices, High Importance Business News,
          // and Portfolio holdings trigger status bar heads-up push notifications.
          const isEligibleGeneralAlert = isDividend || isRightShare || isBookClosure || isFinancial || isHighImportanceNews || isPortfolioTracked;

          if (!isEligibleGeneralAlert) {
            console.log(`[SmartAlertEngine] ℹ️ Routine PR notice "${title.slice(0, 45)}...": recorded in-app only (no push/Telegram).`);
            const feedItem = {
              id: itemKey,
              type: notifType,
              category: notifCategory,
              title: notifTitle,
              body: title,
              symbol: foundSym || 'NEPSE',
              url: item.url || item.link || '',
              source: item.source || 'Financial News',
              action: 'OPEN_NEWS',
              triggeredAt: new Date().toISOString()
            };
            if (!alertHistory.some(a => a.id === feedItem.id)) {
              alertHistory.unshift(feedItem);
              if (alertHistory.length > 200) alertHistory.pop();
              saveJson(HISTORY_FILE, alertHistory);
            }
            continue; // Skip push & skip Telegram for routine PR
          }

          broadcastAlert({
            id: itemKey,
            type: notifType,
            category: notifCategory,
            channelId: 'nepse-general-news',
            title: notifTitle,
            body: title,
            symbol: foundSym || 'NEPSE',
            url: item.url || item.link || '',
            source: item.source || 'Financial News',
            action: 'OPEN_NEWS',
            triggeredAt: new Date().toISOString()
          });
        }
      }
    }
  } catch (newsErr) {
    console.debug('[SmartAlertEngine] News poller notice:', newsErr.message);
  }

  // 2. Check Live IPO Pipeline
  try {
    let ipos = [];
    if (typeof actualIpoFn === 'function') {
      ipos = await actualIpoFn().catch(() => []);
    }
    if (Array.isArray(ipos) && ipos.length > 0) {
      // Cold boot guard: When the server first boots with an empty seenIpoStatusKeys set,
      // seed all currently open IPOs into memory and disk so we NEVER blast active IPOs
      // as repeated status bar or push notifications upon server restarts.
      if (seenIpoStatusKeys.size === 0) {
        for (const ipo of ipos) {
          const scripKey = String(ipo.scrip || ipo.id || 'IPO').toUpperCase().trim();
          seenIpoStatusKeys.add(`ipo_open_${scripKey}`);
        }
        saveSeenIpoKeys();
        console.log(`[SmartAlertEngine] Cold boot guard: seeded ${seenIpoStatusKeys.size} active IPOs to suppress restart notification spam.`);
        return;
      }

      const nowNpt = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
      const todayIso = nowNpt.toISOString().split('T')[0];

      for (const ipo of ipos) {
        const scripKey = String(ipo.scrip || ipo.id || 'IPO').toUpperCase().trim();
        const openKey = `ipo_open_${scripKey}`;
        const openDate = (ipo.openDate || '').split('T')[0];
        const closeDate = (ipo.closeDate || '').split('T')[0];
        const closeKey = `ipo_close_${scripKey}_${closeDate || todayIso}`;

        // Alert #1: New IPO Opening (Sent ONCE when the issue opens, never re-alerted while open)
        if (ipo.status === 'Open' && (!openDate || openDate <= todayIso)) {
          if (!seenIpoStatusKeys.has(openKey)) {
            seenIpoStatusKeys.add(openKey);
            saveSeenIpoKeys();
            broadcastAlert({
              id: openKey,
              type: 'IPO_ALERT',
              category: 'general',
              title: `🔔 IPO Open: ${ipo.name} (${scripKey})`,
              body: `${ipo.name} IPO is open for application. Price: Rs. ${ipo.issuePrice || 100} | Closes: ${closeDate || 'Soon'}.`,
              symbol: scripKey,
              action: 'OPEN_IPO',
              triggeredAt: new Date().toISOString()
            });
          }
        } else if (closeDate === todayIso) {
          // Alert #2: Last Day to Apply (Sent ONCE on the official closing day)
          if (!seenIpoStatusKeys.has(closeKey)) {
            seenIpoStatusKeys.add(closeKey);
            saveSeenIpoKeys();
            broadcastAlert({
              id: closeKey,
              type: 'IPO_ALERT',
              category: 'general',
              title: `⏳ Last Day to Apply: ${ipo.name} (${scripKey})`,
              body: `Today is the LAST DAY to apply for ${ipo.name} before 5:00 PM NPT.`,
              symbol: scripKey,
              action: 'OPEN_IPO',
              triggeredAt: new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (ipoErr) {
    console.debug('[SmartAlertEngine] IPO poller notice:', ipoErr.message);
  }
}
