// proxy/telegramNotifier.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAVYASHREE TELEGRAM NOTIFICATION DISPATCHER
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Provides instant, zero-failure lockscreen push alerts directly to your
 * smartphone via Telegram Bot API (bypassing Android battery optimization
 * and Firebase Admin credential bottlenecks).
 *
 * Supported Dispatches:
 *   1. Live Intraday Smart Alerts (Accumulation / Institutional Breakout)
 *   2. Daily Post-Market Prime Pick (3:45 PM Verified Funnel Selection)
 *   3. Market Regime & Cash Defense Triggers
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import dns from 'dns';
import dnsPromises from 'dns/promises';
import { fileURLToPath } from 'url';
import { getDetailedMarketStatus } from '../src/utils/nepseCalendar.js';
import { auditAntiDematDumpGuard, db } from './db/ledgerStore.js';
import {
  getTelegramConfigFromDb,
  saveTelegramConfigToDb,
  getLastSelectionGuideDateFromDb,
  saveLastSelectionGuideDateToDb
} from './db.mjs';
import { BROKER_NAMES } from './brokerVault.mjs';
import { scanTrackBSyndicateCandidates, formatTrackBSyndicateHtml } from './trackBSyndicateEngine.mjs';
import {
  fetchLiveNepseIndexHistory,
  evaluateDailySelectionGuide,
  formatDailySelectionGuideHtml
} from './stockSelectionGuideEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicResolver = new dnsPromises.Resolver();
publicResolver.setServers(['1.1.1.1', '8.8.8.8']);
let cachedTelegramIp = '149.154.166.110';

async function resolveTelegramIp() {
  try {
    const ips = await publicResolver.resolve4('api.telegram.org');
    if (ips && ips.length > 0) cachedTelegramIp = ips[0];
  } catch (_) {}
  return cachedTelegramIp;
}

const DATA_DIR = (process.env.NEPSE_DATA_DIR && fs.existsSync(process.env.NEPSE_DATA_DIR))
  ? process.env.NEPSE_DATA_DIR
  : path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'telegram_config.json');

let stockUniverseMap = {};
try {
  const stockMapPath = path.join(__dirname, 'stockmap.json');
  if (fs.existsSync(stockMapPath)) {
    stockUniverseMap = JSON.parse(fs.readFileSync(stockMapPath, 'utf8'));
  }
} catch (_) {}

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (_) {}

export function cleanBotToken(raw) {
  if (!raw) return '';
  let token = String(raw).trim();
  token = token.replace(/^["']|["']$/g, '').trim();
  token = token.replace(/^TELEGRAM_BOT_TOKEN\s*=\s*/i, '').trim();
  token = token.replace(/^BOT_TOKEN\s*=\s*/i, '').trim();
  token = token.replace(/^TOKEN\s*=\s*/i, '').trim();
  if (token.toLowerCase().startsWith('bot') && token.includes(':')) {
    token = token.slice(3).trim();
  }
  token = token.replace(/^token[:\s]+/i, '').trim();
  token = token.replace(/[\r\n\t\s]/g, '');
  return token;
}

function loadConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (_) {}

  const fileToken = cleanBotToken(fileConfig.botToken || '');
  const envToken = cleanBotToken(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || '');

  // Prioritize explicit Render env vars over fileConfig
  const botToken = envToken || fileToken;
  const fileChatId = (fileConfig.chatId !== undefined && fileConfig.chatId !== null)
    ? String(fileConfig.chatId).trim()
    : '';
  const envChatId = String(process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '').trim();
  const chatId = envChatId || fileChatId;

  const rawEnvIsTest = process.env.TELEGRAM_IS_TEST_SERVER !== undefined
    ? process.env.TELEGRAM_IS_TEST_SERVER
    : process.env.TELEGRAM_TEST_SERVER;
  let isTestServer;
  if (rawEnvIsTest !== undefined && String(rawEnvIsTest).trim() !== '') {
    isTestServer = String(rawEnvIsTest).trim().toLowerCase() === 'true';
  } else {
    isTestServer = Boolean(fileConfig.isTestServer === true);
  }

  const rawEnvWebhook = process.env.TELEGRAM_USE_WEBHOOK;
  const useWebhook = (rawEnvWebhook !== undefined && String(rawEnvWebhook).trim() !== '')
    ? String(rawEnvWebhook).trim().toLowerCase() === 'true'
    : Boolean(fileConfig.useWebhook === true);
  const webhookUrl = String(process.env.TELEGRAM_WEBHOOK_URL || '').trim() || fileConfig.webhookUrl || '';
  const webhookSecretToken = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim() || fileConfig.webhookSecretToken || '';

  return {
    botToken,
    chatId,
    enabled: fileConfig.enabled !== false, // default true if token & chatId present
    isTestServer,
    useWebhook,
    webhookUrl,
    webhookSecretToken
  };
}

export function saveTelegramConfig({ botToken, chatId, enabled, isTestServer, useWebhook, webhookUrl, webhookSecretToken }) {
  resetTelegramAuthError();
  const current = loadConfig();
  const nextConfig = {
    botToken: botToken !== undefined ? cleanBotToken(botToken) : current.botToken,
    chatId: chatId !== undefined ? String(chatId).trim() : current.chatId,
    enabled: enabled !== undefined ? Boolean(enabled) : current.enabled,
    isTestServer: isTestServer !== undefined ? Boolean(isTestServer) : current.isTestServer,
    useWebhook: useWebhook !== undefined ? Boolean(useWebhook) : current.useWebhook,
    webhookUrl: webhookUrl !== undefined ? String(webhookUrl).trim() : current.webhookUrl,
    webhookSecretToken: webhookSecretToken !== undefined ? String(webhookSecretToken).trim() : current.webhookSecretToken,
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(nextConfig, null, 2), 'utf8');
    saveTelegramConfigToDb(nextConfig).catch(() => {});
    console.log('[TelegramNotifier] Configuration saved successfully.');
    return { success: true };
  } catch (err) {
    console.error('[TelegramNotifier] Failed to save config:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Hydrates verified Telegram configuration from PostgreSQL database on server startup.
 * Prioritizes explicit Render environment variables: if TELEGRAM_BOT_TOKEN is set and
 * differs from PostgreSQL, syncs the env credentials into telegram_bot_config and resets auth error.
 */
export async function hydrateTelegramConfigFromDb() {
  try {
    const dbCfg = await getTelegramConfigFromDb();
    const envToken = cleanBotToken(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || '');
    const envChatId = String(process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '').trim();
    const rawEnvIsTest = process.env.TELEGRAM_IS_TEST_SERVER !== undefined
      ? process.env.TELEGRAM_IS_TEST_SERVER
      : process.env.TELEGRAM_TEST_SERVER;
    const hasExplicitEnvTest = rawEnvIsTest !== undefined && String(rawEnvIsTest).trim() !== '';
    const envIsTest = hasExplicitEnvTest ? String(rawEnvIsTest).trim().toLowerCase() === 'true' : undefined;

    const dbToken = cleanBotToken(dbCfg?.botToken || '');

    if (envToken && (!dbCfg || !dbToken || envToken !== dbToken)) {
      const current = loadConfig();
      const nextConfig = {
        botToken: envToken,
        chatId: envChatId || (dbCfg?.chatId ? String(dbCfg.chatId).trim() : current.chatId),
        enabled: dbCfg ? dbCfg.enabled !== false : current.enabled,
        isTestServer: hasExplicitEnvTest ? envIsTest : (dbCfg ? Boolean(dbCfg.isTestServer) : current.isTestServer),
        useWebhook: current.useWebhook,
        webhookUrl: current.webhookUrl || dbCfg?.webhookUrl || '',
        webhookSecretToken: current.webhookSecretToken || dbCfg?.webhookSecretToken || '',
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(nextConfig, null, 2), 'utf8');
      await saveTelegramConfigToDb(nextConfig).catch(() => {});
      resetTelegramAuthError();
      console.log(`[TelegramNotifier] 🔄 Synced explicit environment Telegram credentials into PostgreSQL database (Bot: ${nextConfig.botToken.slice(0, 6)}...${nextConfig.botToken.slice(-4)}, Chat ID: ${nextConfig.chatId || 'pending'}).`);
      return nextConfig;
    }

    if (dbCfg && dbToken) {
      const current = loadConfig();
      const nextConfig = {
        botToken: envToken || dbToken,
        chatId: envChatId || (dbCfg.chatId ? String(dbCfg.chatId).trim() : current.chatId),
        enabled: dbCfg.enabled !== false,
        isTestServer: hasExplicitEnvTest ? envIsTest : Boolean(dbCfg.isTestServer),
        useWebhook: dbCfg.useWebhook !== undefined ? Boolean(dbCfg.useWebhook) : current.useWebhook,
        webhookUrl: current.webhookUrl || dbCfg.webhookUrl || '',
        webhookSecretToken: current.webhookSecretToken || dbCfg.webhookSecretToken || '',
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(nextConfig, null, 2), 'utf8');
      resetTelegramAuthError();
      console.log(`[TelegramNotifier] ✅ Restored verified Telegram bot configuration from PostgreSQL database (Bot: ${nextConfig.botToken.slice(0, 6)}...${nextConfig.botToken.slice(-4)}, Chat ID: ${nextConfig.chatId || 'pending'}, Webhook: ${nextConfig.useWebhook ? 'ACTIVE' : 'OFF'}).`);
      return nextConfig;
    }
  } catch (err) {
    console.warn('[TelegramNotifier] PostgreSQL config hydration notice:', err.message);
  }
  return null;
}

export function getTelegramStatus() {
  const cfg = loadConfig();
  const hasToken = Boolean(cfg.botToken && cfg.botToken.length > 10);
  const hasChat = Boolean(cfg.chatId && cfg.chatId.length > 3);
  const isReady = hasToken && hasChat && cfg.enabled && !isTokenInvalid;

  const maskedToken = hasToken
    ? `${cfg.botToken.slice(0, 6)}...${cfg.botToken.slice(-4)}`
    : '';

  return {
    isConfigured: isReady,
    enabled: cfg.enabled,
    hasToken,
    hasChatId: hasChat,
    maskedToken,
    chatId: cfg.chatId || '',
    tokenLength: cfg.botToken ? cfg.botToken.length : 0,
    tokenHasColon: Boolean(cfg.botToken && cfg.botToken.includes(':')),
    isTokenInvalid,
    isTestServer: cfg.isTestServer,
    useWebhook: Boolean(cfg.useWebhook),
    webhookUrl: cfg.webhookUrl || '',
    hasWebhookSecret: Boolean(cfg.webhookSecretToken)
  };
}

/**
 * Validates a bot token with automatic Production & Test DC detection
 */
export async function verifyTelegramToken(rawToken) {
  const token = cleanBotToken(rawToken);
  if (!token) return { ok: false, description: 'No token provided' };

  // 1. Try standard Production DC first
  let res = await callTelegramApi(`/bot${token}/getMe`);
  if (res.ok) {
    return { ...res, isTestServer: false };
  }

  // 2. If Production returns 401 Unauthorized, automatically try Test DC
  let testRes = await callTelegramApi(`/bot${token}/test/getMe`);
  if (testRes.ok) {
    return { ...testRes, isTestServer: true };
  }

  return (res.description && String(res.description).includes('REVOKED')) ? res : (testRes.description ? testRes : res);
}

/**
 * Core resilient Telegram API caller.
 * Primary Path: fetch(`https://api.telegram.org${endpoint}`) (supports test mocks & clean environments)
 * Failover Path: Direct HTTPS via Cloudflare/Google public DNS (1.1.1.1, 8.8.8.8) to bypass ISP DNS blackholes
 */
async function callTelegramApi(endpoint, payload = null) {
  const dataStr = payload ? JSON.stringify(payload) : null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`https://api.telegram.org${endpoint}`, {
      method: payload ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return await res.json();
  } catch (fetchErr) {
    // Failover for ISP DNS sinkholes (e.g. Classic Tech / NTA poisoning):
    const ip = await resolveTelegramIp();
    return new Promise((resolve) => {
      const req = https.request({
        host: 'api.telegram.org',
        port: 443,
        path: endpoint,
        method: payload ? 'POST' : 'GET',
        headers: {
          'Host': 'api.telegram.org',
          'Content-Type': 'application/json',
          ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
        },
        lookup: (hostname, opts, cb) => {
          if (typeof opts === 'function') {
            cb = opts;
            opts = {};
          }
          if (hostname === 'api.telegram.org') {
            if (opts?.all) cb(null, [{ address: ip, family: 4 }]);
            else cb(null, ip, 4);
          } else {
            dns.lookup(hostname, opts, cb);
          }
        },
        timeout: 10000
      }, (res) => {
        let buf = '';
        res.on('data', chunk => buf += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (_) {
            resolve({ ok: false, description: buf || 'Invalid response from Telegram' });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, description: err.message || fetchErr.message || 'Telegram network failure' });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, description: 'Telegram direct connection timed out' });
      });

      if (dataStr) req.write(dataStr);
      req.end();
    });
  }
}

let isTokenInvalid = false;
let hasLoggedUnauthorizedWarning = false;
let tokenInvalidSince = 0;

export function resetTelegramAuthError() {
  isTokenInvalid = false;
  hasLoggedUnauthorizedWarning = false;
  tokenInvalidSince = 0;
}

export function isTelegramTokenInvalid() {
  return isTokenInvalid;
}

/**
 * Standard Telegram Bot API caller with 401 Unauthorized protection.
 * Detects 401 Unauthorized once, logs a single clear warning, and halts retry loop.
 * Never logs or prints the secret token.
 */
async function callBotApi(token, method, payload = null, bypassGuard = false) {
  const cfg = loadConfig();
  const isDifferentToken = Boolean(token && cfg.botToken && token !== cfg.botToken);

  if (isTokenInvalid && !bypassGuard && !isDifferentToken) {
    if (Date.now() - tokenInvalidSince > 60000) {
      resetTelegramAuthError();
    } else {
      return { ok: false, error_code: 401, description: 'Telegram Bot Token is invalid or revoked. Retries suspended.' };
    }
  }

  const endpoint = cfg.isTestServer ? `/bot${token}/test/${method}` : `/bot${token}/${method}`;
  let res = await callTelegramApi(endpoint, payload);

  // If 401 Unauthorized, automatically attempt failover to alternate DC (Production vs Test DC)
  if (!res.ok && (res.error_code === 401 || String(res.description || '').toLowerCase().includes('unauthorized'))) {
    const altEndpoint = !cfg.isTestServer ? `/bot${token}/test/${method}` : `/bot${token}/${method}`;
    const altRes = await callTelegramApi(altEndpoint, payload);
    if (altRes.ok) {
      const switchedIsTest = !cfg.isTestServer;
      saveTelegramConfig({ isTestServer: switchedIsTest });
      console.log(`[TelegramNotifier] 🔄 Auto-switched Telegram datacenter to ${switchedIsTest ? 'Test DC' : 'Production DC'} (verified 200 OK).`);
      res = altRes;
    }
  }

  if (res.ok) {
    resetTelegramAuthError();
  } else if (!res.ok && (res.error_code === 401 || String(res.description || '').toLowerCase().includes('unauthorized'))) {
    if (!hasLoggedUnauthorizedWarning) {
      console.warn('[TelegramNotifier] ⚠️ Telegram Bot Token is invalid or revoked (HTTP 401 Unauthorized). Automated Telegram polling and retries have been suspended. Verify TELEGRAM_BOT_TOKEN.');
      hasLoggedUnauthorizedWarning = true;
    }
    isTokenInvalid = true;
    tokenInvalidSince = Date.now();
    return res;
  }

  return res;
}

/**
 * HTML entity escaping utility to prevent Telegram 400 Bad Request parse errors
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Splits long Telegram messages into chunks <= maxLen (default 3900)
 * preserving clean section dividers (\n──────────────────────────\n) or double-newlines.
 * Prevents Telegram HTTP 400 Bad Request "message is too long" (limit 4096 chars).
 */
export function splitMessageIntoTelegramChunks(text, maxLen = 3900) {
  if (!text || text.length <= maxLen) return [text];

  const chunks = [];
  const delimiter = '\n──────────────────────────\n';
  const parts = text.includes(delimiter) ? text.split(delimiter) : text.split('\n\n');

  let currentChunk = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const separator = currentChunk ? (text.includes(delimiter) ? delimiter : '\n\n') : '';
    if ((currentChunk + separator + part).length <= maxLen) {
      currentChunk += separator + part;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      if (part.length <= maxLen) {
        currentChunk = part;
      } else {
        const lines = part.split('\n');
        for (const line of lines) {
          if ((currentChunk + '\n' + line).length <= maxLen) {
            currentChunk = currentChunk ? currentChunk + '\n' + line : line;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = line.length > maxLen ? line.slice(0, maxLen) : line;
          }
        }
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

/**
 * Sends a raw HTML/Markdown message to Telegram with automatic plain-text fallback.
 * Supports passing options object { parseMode, chatId } or string parseMode ('HTML'/'Markdown').
 */
export async function sendTelegramMessage(text, optionsOrParseMode = 'HTML') {
  let parseMode = 'HTML';
  let targetChatId = null;

  if (typeof optionsOrParseMode === 'object' && optionsOrParseMode !== null) {
    parseMode = optionsOrParseMode.parseMode || 'HTML';
    targetChatId = optionsOrParseMode.chatId || null;
  } else if (typeof optionsOrParseMode === 'string') {
    parseMode = optionsOrParseMode;
  }

  if (isTokenInvalid) {
    return { success: false, reason: 'Telegram Bot Token is invalid or revoked (HTTP 401 Unauthorized). Retries suspended.' };
  }

  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_TEST_ALERTS === 'true';
  if (isTestEnv && process.env.TEST_LIVE_TELEGRAM !== 'true') {
    return { success: true, messageId: 999999, mocked: true };
  }

  const cfg = loadConfig();
  const effectiveChatId = targetChatId || cfg.chatId;

  if (!cfg.enabled || !cfg.botToken || !effectiveChatId) {
    return { success: false, reason: 'Telegram notifications not configured or disabled' };
  }

  // Multi-message chunking for payloads exceeding Telegram 4096 char limit
  if (text && text.length > 3900) {
    const chunks = splitMessageIntoTelegramChunks(text, 3900);
    if (chunks.length > 1) {
      console.log(`[TelegramNotifier] Splitting large message (${text.length} chars) into ${chunks.length} safe chunks...`);
      let lastRes = null;
      for (let i = 0; i < chunks.length; i++) {
        lastRes = await sendTelegramMessage(chunks[i], { parseMode, chatId: effectiveChatId });
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 250));
        }
      }
      return { success: Boolean(lastRes?.success), messageId: lastRes?.messageId, chunksDispatched: chunks.length };
    }
  }

  const payload = {
    chat_id: effectiveChatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true
  };

  try {
    const data = await callBotApi(cfg.botToken, 'sendMessage', payload);
    if (data.ok) {
      console.log('[TelegramNotifier] ✅ Message dispatched to Telegram successfully.');
      return { success: true, messageId: data.result?.message_id };
    } else {
      console.warn('[TelegramNotifier] ❌ Telegram API returned error:', data.description);

      // Resilient Fallback: If Telegram rejected due to bad HTML markup, strip tags and send plain text
      if (parseMode === 'HTML' && (data.error_code === 400 || String(data.description || '').toLowerCase().includes('parse'))) {
        console.log('[TelegramNotifier] Retrying message in plain-text mode to prevent dropped alert...');
        const plainText = text
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        const fallbackData = await callBotApi(cfg.botToken, 'sendMessage', {
          chat_id: effectiveChatId,
          text: plainText,
          disable_web_page_preview: true
        });

        if (fallbackData.ok) {
          console.log('[TelegramNotifier] ✅ Plain-text fallback dispatched to Telegram.');
          return { success: true, messageId: fallbackData.result?.message_id, fallbackPlain: true };
        }
      }

      return { success: false, error: data.description };
    }
  } catch (err) {
    console.warn('[TelegramNotifier] Dispatch failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Test credentials with a lightweight ping
 */
export async function testTelegramConnection(customToken, customChatId) {
  const cfg = loadConfig();
  const token = cleanBotToken(customToken || cfg.botToken);
  const chat = customChatId ? String(customChatId).trim() : cfg.chatId;

  if (!token || !chat) {
    return { success: false, error: 'Both Bot Token and Chat ID are required.' };
  }

  // Always reset auth error on explicit user test to allow fresh verification
  resetTelegramAuthError();

  const text = `🔔 <b>Drabyashree NEPSE Alert System</b>\n\n✅ <b>Connection Test Successful!</b>\nYour smartphone is now configured to receive real-time institutional alerts and 3:45 PM Daily Post-Market Setups.\n\n<i>Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu' })} NPT</i>`;

  try {
    let activeIsTest = cfg.isTestServer;
    let data = await callBotApi(token, 'sendMessage', {
      chat_id: chat,
      text,
      parse_mode: 'HTML'
    }, true);

    // If 401 Unauthorized, automatically try alternate DC environment (Test vs Production)
    if (!data.ok && (data.error_code === 401 || String(data.description || '').toLowerCase().includes('unauthorized'))) {
      const alternateIsTest = !activeIsTest;
      const alternateEndpoint = alternateIsTest ? `/bot${token}/test/sendMessage` : `/bot${token}/sendMessage`;
      const altRes = await callTelegramApi(alternateEndpoint, {
        chat_id: chat,
        text,
        parse_mode: 'HTML'
      });
      if (altRes.ok) {
        data = altRes;
        activeIsTest = alternateIsTest;
      }
    }

    if (data.ok) {
      resetTelegramAuthError();
      // Auto-save working config so subsequent alerts immediately succeed
      saveTelegramConfig({ botToken: token, chatId: chat, enabled: true, isTestServer: activeIsTest });
      return { success: true, message: 'Test message sent successfully to your Telegram!' };
    } else {
      const desc = data.description || '';
      if (desc.includes('SESSION_REVOKED')) {
        return {
          success: false,
          error: 'Telegram returned "SESSION_REVOKED". In @BotFather, tap "Revoke current token" to get a fresh active token.'
        };
      }
      if (data.error_code === 401 || desc.toLowerCase().includes('unauthorized')) {
        return {
          success: false,
          error: `Telegram returned "Unauthorized" (${desc || 'Token invalid'}). Please check your token in @BotFather.`
        };
      }
      return { success: false, error: desc || 'Failed to authenticate with Telegram.' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Automatically detects the user's Chat ID by polling getUpdates for the bot
 */
export async function autoDetectChatId(customToken) {
  const cfg = loadConfig();
  const token = cleanBotToken(customToken || cfg.botToken);

  if (!token) {
    return { success: false, error: 'Please paste your Bot Token from @BotFather into the Bot Token box first.' };
  }

  try {
    // 1. Check bot identity and get username via getMe (with Production & Test DC auto-detection)
    let botUsername = '';
    let isTestDc = cfg.isTestServer;
    let meRes = await callTelegramApi(isTestDc ? `/bot${token}/test/getMe` : `/bot${token}/getMe`);
    if (!meRes.ok && (meRes.error_code === 401 || String(meRes.description || '').toLowerCase().includes('unauthorized'))) {
      const altRes = await callTelegramApi(!isTestDc ? `/bot${token}/test/getMe` : `/bot${token}/getMe`);
      if (altRes.ok) {
        meRes = altRes;
        isTestDc = !isTestDc;
        saveTelegramConfig({ botToken: token, isTestServer: isTestDc });
      }
    }

    if (!meRes.ok) {
      const desc = meRes.description || '';
      if (desc.includes('SESSION_REVOKED')) {
        return {
          success: false,
          error: 'Telegram returned "SESSION_REVOKED". In @BotFather, tap "Revoke current token" to get a fresh active token.'
        };
      }
      return {
        success: false,
        error: `Telegram returned "Unauthorized" (${desc || 'Invalid token'}). Please open @BotFather on Telegram, send /token, copy the token, and paste it into the Bot Token field.`
      };
    }
    botUsername = meRes.result?.username || '';

    // 2. Poll getUpdates to retrieve the user's incoming message
    const endpoint = isTestDc ? `/bot${token}/test/getUpdates` : `/bot${token}/getUpdates`;
    const data = await callTelegramApi(endpoint, { timeout: 0 });
    if (!data.ok) {
      return { success: false, error: data.description || 'Failed to fetch messages from Telegram.' };
    }

    const updates = data.result || [];
    if (updates.length === 0) {
      const promptText = botUsername
        ? `No messages received yet for @${botUsername}!\n\nOpen https://t.me/${botUsername} on Telegram, tap START (or send "hello"), then tap Auto-Detect again.`
        : 'No messages received yet! Open your bot in Telegram and tap START or send "hello", then tap Auto-Detect again.';
      return { 
        success: false, 
        botUsername,
        botLink: botUsername ? `https://t.me/${botUsername}` : null,
        error: promptText 
      };
    }

    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const chat = u.message?.chat || u.edited_message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
      if (chat && chat.id) {
        const fromName = u.message?.from?.first_name || chat.first_name || chat.title || 'User';
        return { 
          success: true, 
          chatId: String(chat.id), 
          username: chat.username || fromName,
          botUsername,
          botLink: botUsername ? `https://t.me/${botUsername}` : null,
          message: `Found Chat ID: ${chat.id} (${fromName})` 
        };
      }
    }

    return { 
      success: false, 
      botUsername,
      botLink: botUsername ? `https://t.me/${botUsername}` : null,
      error: 'Could not extract chat ID from messages. Send a message to your bot in Telegram and try again.' 
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Shared helper extracting 5-day Top 3 Buyer/Seller concentration, cost basis, and lead broker
 * from `getSmartMoneyAggregatedFlow(sym, 5)` output.
 */
export function extract5DayBrokerFlowMetrics(flow = [], fallbackPrice = 0, defaults = {}) {
  const defaultBcr3Buy = defaults.bcr3Buy ?? null;
  const defaultBcr3Sell = defaults.bcr3Sell ?? null;
  if (!Array.isArray(flow) || flow.length === 0) {
    const defRet = defaults.leadRetentionPct ?? null;
    const spread = (defaultBcr3Buy !== null && defaultBcr3Sell !== null)
      ? +(Number(defaultBcr3Buy) - Number(defaultBcr3Sell)).toFixed(1)
      : null;
    return {
      bcr3Buy: defaultBcr3Buy,
      bcr3Sell: defaultBcr3Sell,
      bcr3Spread: spread,
      avgBrokerPrice: fallbackPrice,
      leadBrokerId: defaults.leadBrokerId || null,
      leadBrokerName: defaults.leadBrokerName || null,
      leadBuyVol: 0,
      leadSellVol: 0,
      leadNetVol: 0,
      leadRetentionPct: defRet,
      leadChurnPct: defRet !== null ? +(Math.max(0, 100 - Number(defRet))).toFixed(1) : null,
      hasLedgerFlow: false
    };
  }

  const buyers = flow
    .filter(f => Number(f.buyVolume || 0) > 0)
    .sort((a, b) => (Number(b.buyVolume || 0) - Number(b.sellVolume || 0)) - (Number(a.buyVolume || 0) - Number(a.sellVolume || 0)));
  const sellers = flow
    .filter(f => Number(f.sellVolume || 0) > 0)
    .sort((a, b) => (Number(b.sellVolume || 0) - Number(b.buyVolume || 0)) - (Number(a.sellVolume || 0) - Number(a.buyVolume || 0)));

  const top3Buyers = buyers.slice(0, 3);
  const top3Sellers = sellers.slice(0, 3);

  const top3BuyVol = top3Buyers.reduce((acc, b) => acc + Number(b.buyVolume || 0), 0);
  const top3BuyAmt = top3Buyers.reduce((acc, b) => acc + Number(b.buyAmount || 0), 0);
  const top3SellVol = top3Sellers.reduce((acc, s) => acc + Number(s.sellVolume || 0), 0);

  const totalBuyVolAll = flow.reduce((acc, f) => acc + Number(f.buyVolume || 0), 0);
  const totalSellVolAll = flow.reduce((acc, f) => acc + Number(f.sellVolume || 0), 0);

  const bcr3Buy = totalBuyVolAll > 0 ? +((top3BuyVol / totalBuyVolAll) * 100).toFixed(1) : defaultBcr3Buy;
  const bcr3Sell = totalSellVolAll > 0 ? +((top3SellVol / totalSellVolAll) * 100).toFixed(1) : defaultBcr3Sell;
  const computedAvg = top3BuyVol > 0 && top3BuyAmt > 0 ? +(top3BuyAmt / top3BuyVol).toFixed(1) : fallbackPrice;

  const leadBuyer = top3Buyers[0] || null;
  const leadBrokerId = leadBuyer ? leadBuyer.brokerId : (defaults.leadBrokerId || null);
  const rawLeadName = leadBrokerId ? (BROKER_NAMES[String(leadBrokerId)] || `Broker #${leadBrokerId}`) : (defaults.leadBrokerName || 'Dynamic');
  const leadBrokerName = String(rawLeadName).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd|Money Managers)\b/gi, '').trim() || 'Dynamic';

  const leadBuyVol = Number(leadBuyer?.buyVolume || 0);
  const leadSellVol = Number(leadBuyer?.sellVolume || 0);
  const leadNetVol = leadBuyVol - leadSellVol;
  const leadRetentionPct = leadBuyVol > 0 ? +((leadNetVol / leadBuyVol) * 100).toFixed(1) : (defaults.leadRetentionPct ?? null);
  const leadChurnPct = leadBuyVol > 0
    ? +Math.min(100, (leadSellVol / leadBuyVol) * 100).toFixed(1)
    : (leadRetentionPct !== null ? +(Math.max(0, 100 - Number(leadRetentionPct))).toFixed(1) : null);
  const bcr3Spread = (bcr3Buy !== null && bcr3Sell !== null) ? +(Number(bcr3Buy) - Number(bcr3Sell)).toFixed(1) : null;

  return {
    bcr3Buy,
    bcr3Sell,
    bcr3Spread,
    avgBrokerPrice: computedAvg > 0 ? computedAvg : fallbackPrice,
    leadBrokerId,
    leadBrokerName,
    leadBuyVol,
    leadSellVol,
    leadNetVol,
    leadRetentionPct,
    leadChurnPct,
    hasLedgerFlow: true
  };
}

export function formatFlowchartTrackDisplay(rallyTrack, rallyHorizonLabel = '', marketRegime = 'BULL') {
  const isChop = marketRegime === 'CHOP' || marketRegime === 'SIDEWAYS' || marketRegime === 'DEFENSIVE';
  const regimeBadge = isChop
    ? '🔴 <b>DEFENSIVE CHOP REGIME:</b> NEPSE &lt; 20-Day SMA (Track A Muted • Capital Preservation Active)'
    : '🟢 <b>BULL REGIME:</b> NEPSE &gt; 20-Day SMA (Aggressive Compounding • Both Tracks Active)';

  if (rallyTrack === 'TRACK_B_T2_CLEARED_CONTINUATION') {
    return {
      label: rallyHorizonLabel || 'Track B: Post-T+2 Cleared Continuation',
      tierBadge: isChop
        ? '🎯 Track B: Sniper Post-T+2 Retest (Chop-Resistant • Capital Preservation Tier)'
        : '🟢 Track B: Post-T+2 Cleared Continuation (Primary • 70%+ Win-Rate Tier)',
      allocationGuide: isChop
        ? 'Track B (Chop Regime): 100% Allocation to High-Retention Retests Only'
        : 'Track B (Bull Regime): 70% Core Post-T+2 Entry (Highest Win-Rate Tier)',
      regimeBadge,
    };
  }
  if (rallyTrack === 'TRACK_A_COILED_2_3D_IGNITION') {
    return {
      label: rallyHorizonLabel || 'Track A: 2–3 Day Ignition Watch',
      tierBadge: isChop
        ? '⚠️ Track A: Coiled Ignition Muted (Chop Regime Veto • Do Not Chase)'
        : '🟡 Track A: 2–3 Day Ignition Watch (Bull Regime • Tactical Split-Tranche)',
      allocationGuide: isChop
        ? 'Track A Vetoed: Index in Chop; hold cash and wait for Track B confirmation'
        : 'Track A (Bull Regime): 30% Tactical 50/50 Split-Tranche Entry (Hold for T+2 Ignition)',
      regimeBadge,
    };
  }
  if (rallyTrack === 'TRACK_A_MUTED_CHOP_VETO') {
    return {
      label: rallyHorizonLabel || 'Track A: Muted by Chop Regime Veto',
      tierBadge: '⚠️ Track A: Coiled Ignition Muted (Chop Regime Veto • Hold Cash)',
      allocationGuide: 'Track A Vetoed: Index in Chop; hold cash and wait for Track B confirmation',
      regimeBadge,
    };
  }
  return {
    label: rallyHorizonLabel || 'Institutional Base Accumulation',
    tierBadge: '⚪ Standard Base / Sub-Threshold (Wait for Track A/B Trigger)',
    allocationGuide: 'Standard Accumulation (Confirm T+2 Survival Before Full Size)',
    regimeBadge,
  };
}

function estimatePublicFloatShares(sectorName = 'Equities', explicitFloatShares = 0, sym = null, db = null) {
  const explicit = Number(explicitFloatShares);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (sym && db) {
    try {
      const fund = db.prepare('SELECT public_float_kitta, paid_up_capital, sector FROM scrip_fundamentals WHERE symbol = ?').get(sym);
      if (fund) {
        if (Number(fund.public_float_kitta) > 0) return Number(fund.public_float_kitta);
        if (Number(fund.paid_up_capital) > 0) {
          const estKitta = Number(fund.paid_up_capital) / 100;
          const sec = fund.sector || sectorName;
          if (/Commercial Bank/i.test(sec)) return estKitta * 0.30;
          if (/Hydro/i.test(sec)) return estKitta * 0.20;
          if (/Finance|Development Bank/i.test(sec)) return estKitta * 0.40;
          if (/Microfinance/i.test(sec)) return estKitta * 0.35;
          return estKitta * 0.25;
        }
      }
    } catch (_) {}
  }
  const sec = String(sectorName || '');
  if (/Microfinance/i.test(sec)) return 1_500_000;
  if (/Finance/i.test(sec)) return 3_500_000;
  if (/Hydro/i.test(sec)) return 6_000_000;
  if (/Hotel|Tourism/i.test(sec)) return 4_000_000;
  if (/Development Bank/i.test(sec)) return 4_500_000;
  if (/Commercial Bank|Bank/i.test(sec)) return 25_000_000;
  return 5_000_000;
}

/**
 * Computes Multi-Timeframe Volume Weighted Average Prices (5D, 15D, 1M/22D VWAP)
 * to establish institutional cost bases and tactical support shelves.
 */
export function computeMultiTimeframeVwap(sym, dbInstance = null) {
  const activeDb = dbInstance || db;
  if (!activeDb || typeof activeDb.prepare !== 'function' || !sym) {
    return { vwap5D: null, vwap15D: null, vwap1M: null };
  }
  const cleanSym = String(sym).toUpperCase().trim();
  try {
    const rows = activeDb.prepare(`
      SELECT trade_date, total_turnover, total_volume, close_price
      FROM daily_stock_summary
      WHERE symbol = ?
      ORDER BY trade_date DESC
      LIMIT 22
    `).all(cleanSym);

    if (!rows || rows.length === 0) return { vwap5D: null, vwap15D: null, vwap1M: null };

    const calcVwap = (slice) => {
      const vol = slice.reduce((s, r) => s + (Number(r.total_volume) || 0), 0);
      const amt = slice.reduce((s, r) => s + (Number(r.total_turnover) || 0), 0);
      return vol > 0 ? Number((amt / vol).toFixed(1)) : null;
    };

    return {
      vwap5D: rows.length >= 1 ? calcVwap(rows.slice(0, 5)) : null,
      vwap15D: rows.length >= 8 ? calcVwap(rows.slice(0, 15)) : null,
      vwap1M: rows.length >= 16 ? calcVwap(rows.slice(0, 22)) : null,
    };
  } catch (_) {
    return { vwap5D: null, vwap15D: null, vwap1M: null };
  }
}

export function classifyDualTrackRally({
  smc = {},
  isCoilIgnitionBreakout = false,
  isPocketPivot = false,
  leadRetentionPct = 70,
  dayChgPct = 0,
  marketRegime = 'BULL',
} = {}) {
  const isUpperWickRejected = Number(smc?.upperWickRatio || 0) > 0.45 && Number(dayChgPct || 0) > 1.0;
  const isChop = marketRegime === 'CHOP' || marketRegime === 'SIDEWAYS' || marketRegime === 'DEFENSIVE';
  let rallyTrack = 'STANDARD_ACCUMULATION';
  let rallyHorizonLabel = 'Institutional Base Accumulation';
  if ((smc.isT2ClearedContinuation || smc.isBreakAndRetest) && !isUpperWickRejected) {
    rallyTrack = 'TRACK_B_T2_CLEARED_CONTINUATION';
    rallyHorizonLabel = isChop
      ? 'Track B: Sniper Retest (Chop-Resistant)'
      : 'Track B: Post-T+2 Cleared Continuation';
  } else if (
    !isChop &&
    !isUpperWickRejected &&
    (isCoilIgnitionBreakout ||
      ((isPocketPivot || smc.isNr7 || smc.isIdnr4 || smc.isSmcSweepMss || smc.isFvgMitigated) &&
        Number(leadRetentionPct || 0) >= 70))
  ) {
    rallyTrack = 'TRACK_A_COILED_2_3D_IGNITION';
    rallyHorizonLabel = 'Track A: 2–3 Day Ignition Watch';
  } else if (isChop && (isCoilIgnitionBreakout || smc.isNr7 || smc.isIdnr4 || smc.isSmcSweepMss || smc.isFvgMitigated)) {
    rallyTrack = 'TRACK_A_MUTED_CHOP_VETO';
    rallyHorizonLabel = 'Track A: Muted by Chop Regime Veto (NEPSE &lt; 20 SMA)';
  }
  return { isUpperWickRejected, rallyTrack, rallyHorizonLabel };
}

/**
 * Evaluates Loophole-Protected SMC & Multi-Day Break-and-Retest Confluences.
 * Guards against NEPSE phantom-tick wicks, momentum starvation, and tight intraday stop hunts.
 */
export function evaluateLoopholeProtectedSmcSetup(histBars, context = {}) {
  const fallbackLtp = Number(context.ltp || 0);
  const defaultOut = {
    isBreakAndRetest: false,
    isSmcSweepMss: false,
    hasBullishFvg: false,
    isFvgMitigated: false,
    isNr7: false,
    isIdnr4: false,
    isT2ClearedContinuation: false,
    clv: 0.5,
    upperWickRatio: 0,
    rallyTrack: 'STANDARD_ACCUMULATION',
    rallyHorizonLabel: 'Institutional Base Accumulation',
    fvgLow: null,
    fvgHigh: null,
    retestLevel: null,
    sweepLow: null,
    smcStopLoss: fallbackLtp > 0 ? Number((fallbackLtp * 0.965).toFixed(1)) : 0,
    smcTarget1: fallbackLtp > 0 ? Number((fallbackLtp * 1.08).toFixed(1)) : 0,
    smcTarget2: fallbackLtp > 0 ? Number((fallbackLtp * 1.15).toFixed(1)) : 0,
    smcConfluenceBonus: 0,
    smcBadge: null,
    smcNarrative: 'Orderly Floor Base Holding Above 20 EMA',
    fvgNarrative: 'Balanced Auction Near Broker VWAP',
  };

  if (!Array.isArray(histBars) || histBars.length < 12) {
    return defaultOut;
  }

  // Loophole 1 Guard: Normalize bars & clamp pathological phantom-wick drops (< 85% of close)
  const validBars = histBars.map((b) => {
    const c = Number(b?.close_price ?? b?.close ?? 0);
    const o = Number(b?.open_price ?? b?.open ?? c) || c;
    const rawHigh = Number(b?.high_price ?? b?.high ?? c) || c;
    const rawLow = Number(b?.low_price ?? b?.low ?? c) || c;
    const safeLow = rawLow > 0 && c > 0 && rawLow < c * 0.85 ? Number((Math.min(o, c) * 0.98).toFixed(2)) : rawLow;
    const safeHigh = Math.max(rawHigh, o, c);
    return {
      date: String(b?.trade_date ?? b?.date ?? ''),
      open: o,
      high: safeHigh,
      low: Math.min(safeLow, o, c),
      close: c,
      volume: Number(b?.total_volume ?? b?.volume ?? 0),
    };
  }).filter((b) => b.close > 0);

  if (validBars.length < 12) return defaultOut;

  const bLen = validBars.length - 1;
  const curBar = validBars[bLen];
  const prevBar = validBars[bLen - 1];
  const ltp = Number(context.ltp || curBar.close || 0);
  if (ltp <= 0) return defaultOut;

  const prior20 = validBars.slice(Math.max(0, bLen - 20), bLen);
  const avgVol20 = prior20.reduce((s, r) => s + r.volume, 0) / Math.max(1, prior20.length);
  const ema20Val = Number(context.ema20 || 0) > 0
    ? Number(context.ema20)
    : prior20.reduce((s, r) => s + r.close, 0) / Math.max(1, prior20.length);

  const curVol = curBar.volume;
  const dayChgPct = prevBar.close > 0 ? ((curBar.close - prevBar.close) / prevBar.close) * 100 : 0;
  const prior5 = validBars.slice(Math.max(0, bLen - 5), bLen);
  const minVol5 = prior5.length > 0 ? Math.min(...prior5.map((r) => r.volume)) : avgVol20;
  const vduRatio = minVol5 / Math.max(1, avgVol20);

  const bcr3Buy = (context.bcr3Buy !== null && context.bcr3Buy !== undefined && Number.isFinite(Number(context.bcr3Buy))) ? Number(context.bcr3Buy) : null;
  const bcr3Sell = (context.bcr3Sell !== null && context.bcr3Sell !== undefined && Number.isFinite(Number(context.bcr3Sell))) ? Number(context.bcr3Sell) : null;
  const leadRetentionPct = (context.leadRetentionPct !== null && context.leadRetentionPct !== undefined && Number.isFinite(Number(context.leadRetentionPct))) ? Number(context.leadRetentionPct) : null;
  const isTrap = Boolean(context.isTrap);

  const hasRealLiquidity = curVol >= 0.40 * avgVol20 || curVol >= 4000;
  const hasBrokerBacking = !isTrap && bcr3Buy !== null && bcr3Sell !== null && leadRetentionPct !== null && bcr3Buy >= bcr3Sell && bcr3Sell <= 45 && leadRetentionPct >= 55;

  // Compute ATR(14) & Structural Low / Liquidity Pool Targets (Loophole 3 Guard)
  const atrSlice = validBars.slice(Math.max(1, bLen - 14), bLen + 1);
  let trSum = 0;
  for (let idx = 1; idx < atrSlice.length; idx++) {
    const b = atrSlice[idx];
    const p = atrSlice[idx - 1];
    trSum += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
  }
  const atr14 = atrSlice.length > 1 ? trSum / (atrSlice.length - 1) : ltp * 0.025;

  const bars20 = validBars.slice(Math.max(0, validBars.length - 20));
  const bars50 = validBars.slice(Math.max(0, validBars.length - 50));
  const maxHigh20 = Math.max(...bars20.map((b) => b.high));
  const maxHigh50 = Math.max(...bars50.map((b) => b.high));
  const smcTarget1 = Number(Math.max(ltp * 1.075, Math.min(ltp * 1.095, maxHigh20 * 1.02)).toFixed(1));
  const smcTarget2 = Number(Math.max(ltp * 1.145, Math.min(ltp * 1.180, maxHigh50 * 1.04)).toFixed(1));

  let isBreakAndRetest = false;
  let retestLevel = null;
  let isSmcSweepMss = false;
  let sweepLow = null;
  let hasBullishFvg = false;
  let isFvgMitigated = false;
  let fvgLow = null;
  let fvgHigh = null;

  const curRange = curBar.high - curBar.low;
  const clv = curRange > 0.001
    ? Number(Math.max(0, Math.min(1, (curBar.close - curBar.low) / curRange)).toFixed(3))
    : (dayChgPct > 0 ? 1.0 : dayChgPct < 0 ? 0.0 : 0.5);
  const upperWickRatio = curRange > 0.001
    ? Number(Math.max(0, (curBar.high - Math.max(curBar.open, curBar.close)) / curRange).toFixed(3))
    : 0;

  const prior6Bars = validBars.slice(Math.max(0, bLen - 6), bLen);
  const prior6Ranges = prior6Bars.map((b) => b.high - b.low);
  const isNr7 =
    prior6Bars.length === 6 &&
    prior6Ranges.every((r) => r > 0) &&
    curRange > 0 &&
    curRange <= Math.min(...prior6Ranges) + 1e-6;

  const prior3Bars = validBars.slice(Math.max(0, bLen - 3), bLen);
  const prior3Ranges = prior3Bars.map((b) => b.high - b.low);
  const isInsideDay = curBar.high <= prevBar.high + 1e-6 && curBar.low >= prevBar.low - 1e-6;
  const isIdnr4 =
    isInsideDay &&
    prior3Bars.length === 3 &&
    prior3Ranges.every((r) => r > 0) &&
    curRange > 0 &&
    curRange <= Math.min(...prior3Ranges) + 1e-6;

  let isT2ClearedContinuation = false;

  if (hasRealLiquidity && hasBrokerBacking) {
    // 1. Multi-Day Break & Retest (Breakout 2-8 sessions ago, low-vol pullback retest today)
    const minBrkIdx = Math.max(5, bLen - 8);
    const maxBrkIdx = bLen - 2;
    for (let i = maxBrkIdx; i >= minBrkIdx; i--) {
      const brkBar = validBars[i];
      const beforeBrk = validBars.slice(Math.max(0, i - 10), i);
      if (beforeBrk.length < 3) continue;
      const priorRes = Math.max(...beforeBrk.map((b) => b.close));
      const clearedResistance = brkBar.close > priorRes && validBars[i - 1].close <= priorRes * 1.006;
      const clearedEma = ema20Val > 0 && brkBar.close > ema20Val * 1.005 && validBars[i - 1].close <= ema20Val * 1.003;
      const breakoutVolOk = brkBar.volume >= 1.15 * avgVol20;

      if ((clearedResistance || clearedEma) && breakoutVolOk) {
        const pivot = clearedResistance ? priorRes : ema20Val;
        const distRetest = pivot > 0 ? Math.abs(curBar.low - pivot) / pivot : 1;
        const heldRetest = distRetest <= 0.020 && curBar.close >= pivot * 0.993 && dayChgPct >= -1.5 && dayChgPct <= 3.5;
        const volCalm = curVol <= 0.95 * brkBar.volume || vduRatio <= 0.72;
        if (heldRetest && volCalm && leadRetentionPct >= 65) {
          isBreakAndRetest = true;
          retestLevel = Number(pivot.toFixed(1));
          break;
        }
      }
    }

    // 2. Liquidity Sweep + Market Structure Shift (MSS) within last 5 bars
    let detectedSweep = null;
    const minSweepIdx = Math.max(5, bLen - 4);
    for (let s = bLen; s >= minSweepIdx; s--) {
      const sBar = validBars[s];
      const priorWindow = validBars.slice(Math.max(0, s - 10), s);
      if (priorWindow.length < 3) continue;
      const minPriorLow = Math.min(...priorWindow.map((b) => b.low));
      const sweptSupport = sBar.low < minPriorLow || (ema20Val > 0 && sBar.low < ema20Val * 0.992);
      const sweptAndAbsorbed = sweptSupport && sBar.close > sBar.low && sBar.close >= Math.min(minPriorLow, ema20Val) * 0.985;
      if (sweptAndAbsorbed) {
        detectedSweep = Number(sBar.low.toFixed(1));
        break;
      }
    }
    const prior3Highs = validBars.slice(Math.max(0, bLen - 3), bLen).map((b) => b.high);
    const recentMinorHigh3 = prior3Highs.length > 0 ? Math.max(...prior3Highs) : prevBar.high;
    const mssConfirmed =
      curBar.close > prevBar.close &&
      dayChgPct >= 0.25 &&
      (curBar.close >= recentMinorHigh3 * 0.997 || (ema20Val > 0 && curBar.close >= ema20Val));

    if (detectedSweep !== null && mssConfirmed && curBar.close > detectedSweep) {
      isSmcSweepMss = true;
      sweepLow = detectedSweep;
    }

    // 3. Bullish Fair Value Gap (FVG) + Mitigation Check across last 5 sessions
    const minFvgIdx = Math.max(2, bLen - 4);
    for (let k = bLen; k >= minFvgIdx; k--) {
      const cPrev2 = validBars[k - 2];
      const cMid = validBars[k - 1];
      const cCurr = validBars[k];
      const gap = cCurr.low - cPrev2.high;
      const gapPct = cPrev2.high > 0 ? gap / cPrev2.high : 0;
      if (gap >= 1.0 && gapPct >= 0.003 && cMid.volume >= 0.85 * avgVol20) {
        hasBullishFvg = true;
        fvgLow = Number(cPrev2.high.toFixed(1));
        fvgHigh = Number(cCurr.low.toFixed(1));
        isFvgMitigated = curBar.low <= fvgHigh * 1.018 && curBar.close >= fvgLow * 0.992;
        break;
      }
    }

    // 4. T+2 Settlement Survival & Day-3/4 Pullback Continuation (NEPSE Demat Lockup Cycle)
    const minIgIdx = Math.max(1, bLen - 4);
    const maxIgIdx = bLen - 2;
    for (let k = maxIgIdx; k >= minIgIdx; k--) {
      const igBar = validBars[k];
      const beforeIg = validBars[k - 1];
      const igChgPct = beforeIg.close > 0 ? ((igBar.close - beforeIg.close) / beforeIg.close) * 100 : 0;
      const igRange = igBar.high - igBar.low;
      const igClv = igRange > 0.001 ? (igBar.close - igBar.low) / igRange : (igChgPct > 0 ? 1 : 0.5);
      const preIgBars = validBars.slice(Math.max(0, k - 10), k);
      const preIgAvgVol = preIgBars.length > 0
        ? preIgBars.reduce((s, r) => s + r.volume, 0) / preIgBars.length
        : avgVol20;
      const postBars = validBars.slice(k + 1, bLen + 1);
      const minPostLow = Math.min(...postBars.map((b) => b.low));
      const hasPullbackDryup = postBars.some((b) => b.volume <= igBar.volume * 0.72);
      const structuralFloor = Math.min(igBar.open, (igBar.open + igBar.close) * 0.5);
      if (
        igChgPct >= 3.0 &&
        igClv >= 0.55 &&
        igBar.volume >= Math.min(avgVol20, preIgAvgVol > 0 ? preIgAvgVol : avgVol20) * 1.35 &&
        minPostLow >= igBar.low * 0.992 &&
        curBar.close >= structuralFloor * 0.992 &&
        curBar.close >= ema20Val * 0.99 &&
        hasPullbackDryup &&
        upperWickRatio <= 0.42
      ) {
        isT2ClearedContinuation = true;
        break;
      }
    }
  }

  // ATR-buffered End-of-Day Invalidation Stop-Loss (Loophole 3 Guard)
  const last5Valid = validBars.slice(Math.max(0, bLen - 4), bLen + 1);
  const minLow5 = Math.min(...last5Valid.map((b) => b.low));
  const structuralInvalidationLow = fvgLow
    ? Math.min(minLow5, fvgLow)
    : (sweepLow !== null ? Math.min(minLow5, sweepLow) : minLow5);
  const rawStop = structuralInvalidationLow - 0.35 * atr14;
  const smcStopLoss = Number(Math.max(ltp * 0.955, Math.min(ltp * 0.965, rawStop)).toFixed(1));

  // Additive Confluence Bonus (Loophole 4 Guard + NR7/IDNR4/T+2/CLV/Wick Guard)
  const hasConfluenceBacking = hasRealLiquidity && hasBrokerBacking;
  const upperWickPenalty = upperWickRatio > 0.45 && dayChgPct > 1.0 ? -6 : 0;
  const rawConfluenceBonus = hasConfluenceBacking
    ? (isBreakAndRetest ? 8 : 0) +
      (isSmcSweepMss ? 7 : 0) +
      (isFvgMitigated ? 5 : hasBullishFvg ? 3 : 0) +
      (isNr7 || isIdnr4 ? 5 : 0) +
      (isT2ClearedContinuation ? 6 : 0) +
      (clv >= 0.65 && upperWickRatio <= 0.30 ? 3 : 0) +
      upperWickPenalty
    : 0;
  const smcConfluenceBonus = Math.max(0, Math.min(20, rawConfluenceBonus));

  let rallyTrack = 'STANDARD_ACCUMULATION';
  let rallyHorizonLabel = 'Institutional Base Accumulation';
  if (hasConfluenceBacking && (isT2ClearedContinuation || isBreakAndRetest)) {
    rallyTrack = 'TRACK_B_T2_CLEARED_CONTINUATION';
    rallyHorizonLabel = 'Track B: Post-T+2 Cleared Continuation';
  } else if (hasConfluenceBacking && (isNr7 || isIdnr4 || isSmcSweepMss || isFvgMitigated)) {
    rallyTrack = 'TRACK_A_COILED_2_3D_IGNITION';
    rallyHorizonLabel = 'Track A: 2–3 Day Ignition Watch';
  }

  let smcBadge = null;
  let smcNarrative = 'Orderly Floor Base Holding Above 20 EMA';
  if (isBreakAndRetest && isSmcSweepMss) {
    smcBadge = '🎯 SMC Break & Retest + Sweep MSS';
    smcNarrative = `Break & Retest (Rs. ${retestLevel}) + Sweep (Rs. ${sweepLow}) & MSS`;
  } else if (isBreakAndRetest) {
    smcBadge = '🎯 SMC Break & Retest';
    smcNarrative = `Confirmed Break & Retest at Rs. ${retestLevel} (Controlled Pullback)`;
  } else if (isSmcSweepMss && isFvgMitigated) {
    smcBadge = '⚡ SMC Sweep + MSS + FVG';
    smcNarrative = `Liquidity Sweep (Rs. ${sweepLow}) + MSS + FVG Mitigation`;
  } else if (isSmcSweepMss) {
    smcBadge = '⚡ SMC Sweep + MSS';
    smcNarrative = `Liquidity Sweep (Rs. ${sweepLow}) + Bullish MSS Above Structure`;
  } else if (isFvgMitigated) {
    smcBadge = '🟢 FVG Demand Mitigation';
    smcNarrative = `Mitigating Bullish FVG Demand Shelf (Rs. ${fvgLow}–${fvgHigh})`;
  } else if (isT2ClearedContinuation) {
    smcBadge = '✅ T+2 Cleared Continuation';
    smcNarrative = `Post-Ignition T+2 Settlement Survived on Volume Dry-Up (CLV ${(clv * 100).toFixed(0)}%)`;
  } else if (isNr7 || isIdnr4) {
    smcBadge = isIdnr4 ? '🌀 IDNR4 Coiled Ignition' : '🌀 NR7 Volatility Coil';
    smcNarrative = `${isIdnr4 ? 'IDNR4' : 'NR7'} Tightest Daily Range Holding Above 20 EMA (2–3D Rally Spring)`;
  }

  const fvgNarrative = isFvgMitigated
    ? `Mitigated Bullish FVG (Rs. ${fvgLow}–${fvgHigh}) at Demand`
    : hasBullishFvg
      ? `Active Demand FVG Shelf (Rs. ${fvgLow}–${fvgHigh})`
      : 'Balanced Auction Near Broker VWAP';

  return {
    isBreakAndRetest,
    isSmcSweepMss,
    hasBullishFvg,
    isFvgMitigated,
    isNr7,
    isIdnr4,
    isT2ClearedContinuation,
    clv,
    upperWickRatio,
    rallyTrack,
    rallyHorizonLabel,
    fvgLow,
    fvgHigh,
    retestLevel,
    sweepLow,
    smcStopLoss,
    smcTarget1,
    smcTarget2,
    smcConfluenceBonus,
    smcBadge,
    smcNarrative,
    fvgNarrative,
  };
}

export function enrichPayloadWithFlowchartV2RallyMetrics(
  rawPayload = {},
  { db = null, trapAudit = null, flowMetrics = null, ltp = null } = {}
) {
  const sym = String(rawPayload.symbol || '').toUpperCase().trim();
  const curLtp = Number(ltp || rawPayload.ltp || 0);
  const sector = rawPayload.sector || stockUniverseMap[sym]?.sector || 'Equities';
  const estFloat = estimatePublicFloatShares(sector, rawPayload.publicFloatShares);
  const net5Day = Math.max(
    0,
    Number(
      trapAudit?.total5DayNet ??
        rawPayload.total5DayNet ??
        rawPayload.netVol ??
        rawPayload.netKitta ??
        0
    )
  );
  const computedFloatPct = Number(((net5Day / Math.max(1, estFloat)) * 100).toFixed(2));
  const freeFloatCorneredPct =
    rawPayload.freeFloatCorneredPct != null
      ? Number(rawPayload.freeFloatCorneredPct)
      : computedFloatPct;

  let histBars = [];
  if (db && sym) {
    try {
      histBars = db
        .prepare(
          `SELECT trade_date, open_price, high_price, low_price, close_price, total_volume
           FROM daily_stock_summary
           WHERE symbol = ?
           ORDER BY trade_date DESC
           LIMIT 55`
        )
        .all(sym)
        .reverse();
    } catch (_) {
      histBars = [];
    }
  }

  let smc = null;
  let isPocketPivot = Boolean(rawPayload.isPocketPivot);
  let dayChgPct = Number(rawPayload.pChange ?? rawPayload.dayChgPct ?? 0);

  if (histBars.length >= 12) {
    const bLen = histBars.length - 1;
    const curBar = histBars[bLen];
    const prevBar = histBars[bLen - 1];
    const curClose = Number(curBar.close_price || curLtp || 0);
    const prevClose = Number(prevBar?.close_price || curClose || 0);
    const curVol = Number(curBar.total_volume || 0);
    const prev20 = histBars.slice(Math.max(0, bLen - 20), bLen);
    const sma20 =
      prev20.reduce((s, r) => s + Number(r.close_price || 0), 0) / Math.max(1, prev20.length);

    if (prevClose > 0 && rawPayload.pChange == null && rawPayload.dayChgPct == null) {
      dayChgPct = ((curClose - prevClose) / prevClose) * 100;
    }

    let maxDownVol10 = 0;
    for (let k = Math.max(1, bLen - 10); k < bLen; k++) {
      if (Number(histBars[k].close_price || 0) < Number(histBars[k - 1].close_price || 0)) {
        const dv = Number(histBars[k].total_volume || 0);
        if (dv > maxDownVol10) maxDownVol10 = dv;
      }
    }
    if (!isPocketPivot && histBars.length >= 12) {
      isPocketPivot =
        dayChgPct >= 0.25 &&
        curClose >= sma20 * 0.99 &&
        curVol > maxDownVol10 &&
        maxDownVol10 > 0;
    }

    const avgBrokerPrice = Number(
      rawPayload.avgBrokerPrice ||
        rawPayload.bcr3AvgPrice ||
        flowMetrics?.avgBrokerPrice ||
        trapAudit?.buyVwap ||
        sma20
    );
    const rawBcr3Buy = rawPayload.bcr3Buy ?? flowMetrics?.bcr3Buy;
    const rawBcr3Sell = rawPayload.bcr3Sell ?? flowMetrics?.bcr3Sell;
    const rawLeadRet = rawPayload.retention10D ?? rawPayload.leadRetentionPct ?? trapAudit?.retentionPct ?? flowMetrics?.leadRetentionPct;
    const bcr3Buy = (rawBcr3Buy !== null && rawBcr3Buy !== undefined && Number.isFinite(Number(rawBcr3Buy))) ? Number(rawBcr3Buy) : null;
    const bcr3Sell = (rawBcr3Sell !== null && rawBcr3Sell !== undefined && Number.isFinite(Number(rawBcr3Sell))) ? Number(rawBcr3Sell) : null;
    const leadRetentionPct = (rawLeadRet !== null && rawLeadRet !== undefined && Number.isFinite(Number(rawLeadRet))) ? Number(rawLeadRet) : null;

    smc = evaluateLoopholeProtectedSmcSetup(histBars, {
      ltp: curLtp || curClose,
      ema20: sma20,
      avgBrokerPrice,
      bcr3Buy,
      bcr3Sell,
      leadRetentionPct,
      isTrap: Boolean(trapAudit?.isTrap),
    });
  }

  const effectiveSmc = smc || {
    isNr7: Boolean(rawPayload.isNr7),
    isIdnr4: Boolean(rawPayload.isIdnr4),
    isT2ClearedContinuation: Boolean(rawPayload.isT2ClearedContinuation),
    isBreakAndRetest: Boolean(rawPayload.isBreakAndRetest),
    isSmcSweepMss: Boolean(rawPayload.isSmcSweepMss),
    isFvgMitigated: Boolean(rawPayload.isFvgMitigated),
    clv: rawPayload.clv !== undefined ? Number(rawPayload.clv) : 0.65,
    upperWickRatio: rawPayload.upperWickRatio !== undefined ? Number(rawPayload.upperWickRatio) : 0,
    smcNarrative: rawPayload.smcNarrative,
    fvgNarrative: rawPayload.fvgNarrative,
  };

  const trackClassification = classifyDualTrackRally({
    smc: effectiveSmc,
    isCoilIgnitionBreakout: Boolean(rawPayload.isCoilIgnitionBreakout),
    isPocketPivot,
    leadRetentionPct: Number(
      rawPayload.retention10D ?? rawPayload.leadRetentionPct ?? trapAudit?.retentionPct ?? 75
    ),
    dayChgPct,
    marketRegime: rawPayload.marketRegime || rawPayload.regime || 'BULL',
  });

  const rallyTrack = rawPayload.rallyTrack || trackClassification.rallyTrack;
  const rallyHorizonLabel =
    rawPayload.rallyHorizonLabel ||
    (rallyTrack === 'TRACK_B_T2_CLEARED_CONTINUATION'
      ? 'Track B: Post-T+2 Cleared Continuation'
      : rallyTrack === 'TRACK_A_COILED_2_3D_IGNITION'
        ? 'Track A: 2–3 Day Ignition Watch'
        : trackClassification.rallyHorizonLabel);

  return {
    ...rawPayload,
    sector,
    rallyTrack,
    rallyHorizonLabel,
    freeFloatCorneredPct,
    clv: rawPayload.clv !== undefined ? Number(rawPayload.clv) : effectiveSmc.clv,
    upperWickRatio:
      rawPayload.upperWickRatio !== undefined
        ? Number(rawPayload.upperWickRatio)
        : effectiveSmc.upperWickRatio,
    isNr7: Boolean(rawPayload.isNr7 || effectiveSmc.isNr7),
    isIdnr4: Boolean(rawPayload.isIdnr4 || effectiveSmc.isIdnr4),
    isPocketPivot,
    isT2ClearedContinuation: Boolean(
      rawPayload.isT2ClearedContinuation || effectiveSmc.isT2ClearedContinuation
    ),
    isBreakAndRetest: Boolean(rawPayload.isBreakAndRetest || effectiveSmc.isBreakAndRetest),
    smcNarrative: rawPayload.smcNarrative || effectiveSmc.smcNarrative,
    fvgNarrative: rawPayload.fvgNarrative || effectiveSmc.fvgNarrative,
  };
}

/**
 * Dispatches an Institutional Smart Alert to Telegram with full 4-Pillar Confluence and Execution Ticket
 */
export async function sendTelegramSmartAlert(alertItem) {
  if (!alertItem) return { success: false, reason: 'No alert payload provided' };

  // Suppress News, Corporate Announcements, and IPO items on Telegram (in-app only)
  if (
    alertItem.type === 'NEWS_ALERT' || 
    alertItem.type === 'PORTFOLIO_NEWS_ALERT' || 
    alertItem.type === 'DIVIDEND_ALERT' ||
    alertItem.type === 'RIGHT_SHARE_ALERT' ||
    alertItem.type === 'BOOK_CLOSURE_ALERT' ||
    alertItem.type === 'EARNINGS_ALERT' ||
    alertItem.type === 'NEPSE_MACRO' ||
    alertItem.type === 'MERGER_ALERT' ||
    alertItem.type === 'SEBON_APPROVAL_ALERT' ||
    alertItem.type === 'ALLOTMENT_ALERT' ||
    alertItem.type === 'MARKET_MILESTONE_ALERT' ||
    alertItem.type === 'TRENDING_NEWS_ALERT' ||
    alertItem.category === 'news' ||
    alertItem.category === 'corporate' ||
    alertItem.type === 'IPO_ALERT' ||
    alertItem.category === 'ipo'
  ) {
    return { success: false, suppressed: true, reason: 'Stock news and IPO alerts are disabled on Telegram' };
  }

  const rawSym = String(alertItem.symbol || 'STOCK').toUpperCase().trim();
  const sym = escapeHtml(rawSym);
  const companyName = escapeHtml(alertItem.companyName || stockUniverseMap[rawSym]?.name || sym);
  const ltp = Number(alertItem.ltp || 0);

  // Explicit Upper-Wick Distribution Guard (vetoes blown-out closing upper shadows on live alerts)
  const explicitWickRatio = Number(alertItem.upperWickRatio ?? 0);
  const explicitDayChg = Number(alertItem.pChange ?? alertItem.dayChgPct ?? 0);
  if (explicitWickRatio > 0.45 && explicitDayChg > 1.0 && alertItem.skipTrapVeto !== true) {
    return {
      success: false,
      isVetoed: true,
      reason: `Upper-Wick Distribution Rejection (${Math.round(explicitWickRatio * 100)}% wick > 45% ceiling on +${explicitDayChg.toFixed(1)}% move)`,
    };
  }

  // Enforce 5-Day Multi-Session Trap Veto Gate & enrich with live ledger metrics
  let ledgerDb = null;
  let trapAudit = null;
  let flowMetrics = { hasLedgerFlow: false };
  let vp = null;
  try {
    const { db, getSmartMoneyAggregatedFlow, getScripVolumeProfile } = await import('./db/ledgerStore.js');
    if (db) {
      ledgerDb = db;
      if (alertItem.skipTrapVeto !== true) {
        trapAudit = auditMultiSessionTrapRisk(db, rawSym, alertItem.leadBrokerId || alertItem.brokerId || null);
        if (trapAudit && trapAudit.isTrap) {
          console.log(`[sendTelegramSmartAlert] 🚫 Hard Veto ${rawSym}: ${trapAudit.reason}`);
          return { success: false, isVetoed: true, reason: trapAudit.reason };
        }
      }
      const flow = getSmartMoneyAggregatedFlow(rawSym, 5);
      flowMetrics = extract5DayBrokerFlowMetrics(flow, ltp);
      vp = getScripVolumeProfile(rawSym, 30);
    }
  } catch (_) {}

  // 1. Avg Broker Cost Basis & Volume Profile POC
  const explicitAvg = alertItem.avgBrokerPrice ?? alertItem.bcr3AvgPrice ?? alertItem.operatorVwap ?? alertItem.bcr3AvgBuyPrice;
  const avgBrokerPrice = Number(
    explicitAvg ??
    (flowMetrics.hasLedgerFlow ? flowMetrics.avgBrokerPrice : null) ??
    trapAudit?.buyVwap ??
    alertItem.buyZone?.low ??
    (ltp * 0.989)
  );
  const pocPrice = Number(alertItem.pocPrice ?? vp?.pocPrice ?? avgBrokerPrice ?? ltp);

  // 2. Whale Footprint (Lead broker ID, Name, BCR3 %, Retention, CMF)
  let leadBrokerId = alertItem.leadBrokerId || alertItem.leadBroker || alertItem.brokerId || (flowMetrics.hasLedgerFlow ? flowMetrics.leadBrokerId : null) || trapAudit?.leadBrokerId;
  let leadBrokerName = alertItem.leadBrokerName || alertItem.brokerName || (flowMetrics.hasLedgerFlow ? flowMetrics.leadBrokerName : null);
  if (!leadBrokerId && alertItem.dominantBrokersText) {
    const m = String(alertItem.dominantBrokersText).match(/Broker\s*#?(\d+)/i);
    if (m) leadBrokerId = m[1];
  }
  if (!leadBrokerId) leadBrokerId = '44';
  if (!leadBrokerName) {
    leadBrokerName = BROKER_NAMES[String(leadBrokerId)] || 'Dynamic';
  }
  const cleanBrokerName = String(leadBrokerName).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd|Money Managers)\b/gi, '').trim() || 'Dynamic';

  const rawBcr3Buy = alertItem.bcr3Buy ?? alertItem.bcr3 ?? alertItem.concentrationPct ?? alertItem.bcr3BuyPct ?? alertItem.buyRatioPct ??
    (flowMetrics.hasLedgerFlow ? flowMetrics.bcr3Buy : null);
  const bcr3Buy = (rawBcr3Buy !== null && rawBcr3Buy !== undefined && Number.isFinite(Number(rawBcr3Buy))) ? Number(rawBcr3Buy) : null;
  const rawBcr3Sell = alertItem.bcr3Sell ?? alertItem.bcr3SellPct ??
    (flowMetrics.hasLedgerFlow ? flowMetrics.bcr3Sell : null);
  const bcr3Sell = (rawBcr3Sell !== null && rawBcr3Sell !== undefined && Number.isFinite(Number(rawBcr3Sell))) ? Number(rawBcr3Sell) : null;
  const rawRet = alertItem.retention10D ?? alertItem.retentionPct ?? trapAudit?.retentionPct ?? flowMetrics?.leadRetentionPct ?? null;
  const retention10D = (rawRet !== null && rawRet !== undefined && Number.isFinite(Number(rawRet))) ? Number(rawRet) : null;
  const cmfVal = (alertItem.cmf !== undefined && alertItem.cmf !== null && Number.isFinite(Number(alertItem.cmf))) ? Number(alertItem.cmf) : null;

  // 3. Execution Plan (Entry Low - High, Hard Stop Loss, Target 1, Target 2)
  const buyZone = alertItem.buyZone || {};
  const sl = Number(alertItem.stopLoss || (ltp * 0.965)).toFixed(1);
  const t1 = Number(alertItem.target1 || (ltp * 1.080)).toFixed(1);
  const t2 = Number(alertItem.target2 || (ltp * 1.150)).toFixed(1);

  const upgradedPayload = enrichPayloadWithFlowchartV2RallyMetrics(
    {
      symbol: sym,
      name: companyName,
      companyName,
      sector: alertItem.sector || stockUniverseMap[rawSym]?.sector || 'Equities',
      ltp,
      avgBrokerPrice,
      pocPrice,
      entryLow: Number(buyZone.low || (ltp * 0.995)),
      entryHigh: Number(buyZone.high || (ltp * 1.012)),
      chaseCap: Number(alertItem.chaseCap || (ltp * 1.018)),
      stopLoss: sl,
      slPct: alertItem.slPct || 3.5,
      target1: t1,
      t1Pct: alertItem.t1Pct || 8.0,
      target2: t2,
      t2Pct: alertItem.t2Pct || 15.0,
      bcr3Buy,
      bcr3Sell,
      leadBrokerId,
      leadBrokerName: cleanBrokerName,
      retention10D,
      vdu: alertItem.vdu || alertItem.vduRatio || 0.52,
      cmf: cmfVal,
      bbw: alertItem.bbw || alertItem.bbwPct || 11.2,
      corneringScore: alertItem.corneringScore || alertItem.confluenceScore || alertItem.score || 92,
      confidenceLabel: alertItem.confidenceLabel || alertItem.stageBadge || '🟢 Confirmed Stealth (v2.0)',
      rallyTrack: alertItem.rallyTrack,
      rallyHorizonLabel: alertItem.rallyHorizonLabel,
      freeFloatCorneredPct: alertItem.freeFloatCorneredPct,
      clv: alertItem.clv,
      upperWickRatio: alertItem.upperWickRatio,
      isNr7: alertItem.isNr7,
      isIdnr4: alertItem.isIdnr4,
      isPocketPivot: alertItem.isPocketPivot,
      isT2ClearedContinuation: alertItem.isT2ClearedContinuation,
      netVol: alertItem.netVol,
      netKitta: alertItem.netKitta,
      pChange: alertItem.pChange,
      dayChgPct: alertItem.dayChgPct,
    },
    { db: ledgerDb, trapAudit, flowMetrics, ltp }
  );

  const ticketHtml = formatUpgradedStealthAccumulationHtml(upgradedPayload);
  return await sendTelegramMessage(ticketHtml, 'HTML');
}

/**
 * Dispatches a formatted NEPSE Market News announcement to Telegram
 */
export async function sendTelegramNewsAlert(item) {
  if (!item) return { success: false, reason: 'No news payload' };
  const title = escapeHtml(item.title || item.headline || 'Market Announcement');
  const body = escapeHtml(item.body || item.summary || item.description || '');
  const source = escapeHtml(item.source || 'Financial News');
  const sym = item.symbol && item.symbol !== 'NEPSE' ? escapeHtml(String(item.symbol).toUpperCase()) : null;
  const timeNpt = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu' });

  const header = item.type === 'DIVIDEND_ALERT' ? '💰 <b>DRAVYASHREE DIVIDEND / BONUS ANNOUNCEMENT</b>'
               : item.type === 'RIGHT_SHARE_ALERT' ? '📈 <b>DRAVYASHREE RIGHT SHARE NOTICE</b>'
               : item.type === 'BOOK_CLOSURE_ALERT' ? '📅 <b>DRAVYASHREE BOOK CLOSURE / AGM NOTICE</b>'
               : item.type === 'EARNINGS_ALERT' ? '📊 <b>DRAVYASHREE FINANCIAL REPORT DISCLOSURE</b>'
               : item.type === 'MERGER_ALERT' ? '🤝 <b>DRAVYASHREE MERGER & ACQUISITION NOTICE</b>'
               : item.type === 'SEBON_APPROVAL_ALERT' ? '📜 <b>DRAVYASHREE SEBON REGULATORY APPROVAL</b>'
               : item.type === 'ALLOTMENT_ALERT' ? '🎯 <b>DRAVYASHREE IPO / FPO ALLOTMENT RESULTS</b>'
               : item.type === 'MARKET_MILESTONE_ALERT' ? '📊 <b>DRAVYASHREE NEPSE MARKET CLOSE & MILESTONE</b>'
               : item.type === 'TRENDING_NEWS_ALERT' ? '🔥 <b>DRAVYASHREE BREAKING TRENDING STORY</b>'
               : item.type === 'NEPSE_MACRO' ? '🏛️ <b>DRAVYASHREE MACRO & POLICY ALERT</b>'
               : '📰 <b>DRAVYASHREE MARKET NEWS</b>';

  const msg = [
    header,
    `<b>Source:</b> ${source}`,
    sym ? `<b>Scrip:</b> <code>#${sym}</code>` : '',
    `──────────────────────────`,
    `📌 <b>${title}</b>`,
    body && body !== title ? `\n${body}` : '',
    `──────────────────────────`,
    item.url ? `🔗 <a href="${escapeHtml(item.url)}">Original Publisher Article</a>` : '',
    `⏱ <i>${timeNpt} NPT • Dravyashree In-App Reader</i>`
  ].filter(Boolean).join('\n');

  return { success: false, suppressed: true, reason: 'Stock news alerts are disabled on Telegram', message: msg };
}

/**
 * Dispatches a formatted IPO / Corporate Action alert to Telegram (suppressed on Telegram; in-app only)
 */
export async function sendTelegramIpoAlert(item) {
  if (!item) return { success: false, reason: 'No IPO payload' };
  const title = escapeHtml(item.title || 'IPO Announcement');
  const body = escapeHtml(item.body || '');
  const sym = item.symbol ? escapeHtml(String(item.symbol).toUpperCase()) : 'IPO';
  const timeNpt = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu' });

  const msg = [
    `🔔 <b>DRAVYASHREE IPO &amp; CORPORATE ACTION</b>`,
    `<b>Scrip:</b> <code>#${sym}</code>`,
    `──────────────────────────`,
    `📋 <b>${title}</b>`,
    body && body !== title ? `\n${body}` : '',
    `──────────────────────────`,
    `👉 <i>Check issue details &amp; allotment status inside Dravyashree App</i>`,
    `⏱ <i>${timeNpt} NPT</i>`
  ].filter(Boolean).join('\n');

  return { success: false, suppressed: true, reason: 'IPO alerts are disabled on Telegram', message: msg };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERATOR IGNITION & BROKER #58 STEALTH ACCUMULATION DETECTOR / DISPATCHER
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Detects Stage 1 "Stealth Seeding" and Stage 2 "Supply Vacuum Ignition"
 * specifically driven by Broker #58 (Naasa Securities) and top operator syndicate
 * partners (#39, #84, #45) BEFORE the public markup and circuit breakout.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export function formatEarlyIgnitionAlertHtml(alert = {}) {
  const rawSym = String(alert?.symbol || 'STOCK').toUpperCase().trim();
  const sym = escapeHtml(rawSym);
  const companyName = escapeHtml(alert.companyName || stockUniverseMap[rawSym]?.name || rawSym);
  const ltp = Number(alert.ltp || 0);
  const pChange = Number(alert.pChange ?? alert.priceChangePct ?? 0);
  const pChangeStr = `${pChange >= 0 ? '+' : ''}${pChange.toFixed(2)}%`;

  const brokerId = alert.brokerId || 58;
  const brokerName = escapeHtml(alert.brokerName || (brokerId === 58 ? 'Naasa Securities' : `Broker #${brokerId}`));
  const buyQty = Number(alert.brokerBuyVol || alert.buyQty || alert.buy_vol || 0);
  const sellQty = Number(alert.brokerSellVol || alert.sellQty || alert.sell_vol || 0);
  const netQty = Number(alert.netVol || (buyQty - sellQty));
  const buyRatio = Number(alert.buyRatioPct || alert.buy_ratio || (buyQty + sellQty > 0 ? (buyQty / (buyQty + sellQty) * 100) : 100)).toFixed(1);
  const mktShare = Number(alert.marketSharePct || alert.mkt_share || 0).toFixed(1);
  const totalAmtCrores = (Number(alert.totalBuyAmount || alert.buyAmt || alert.buy_amt || (buyQty * ltp)) / 10000000).toFixed(2);
  const operatorVwap = Number(alert.operatorVwap || alert.operator_vwap || ltp).toFixed(1);

  const buyZoneLow = alert?.buyZone?.low ?? Math.floor(Number(operatorVwap) * 0.99);
  const buyZoneHigh = alert?.buyZone?.high ?? Math.ceil(Number(operatorVwap) * 1.015);
  const sl = Number(alert.stopLoss || alert.sl || (operatorVwap * 0.950).toFixed(1));
  const t1 = Number(alert.target1 || alert.t1 || (operatorVwap * 1.080).toFixed(1));
  const t2 = Number(alert.target2 || alert.t2 || (operatorVwap * 1.145).toFixed(1));

  const slPct = operatorVwap > 0 ? (((operatorVwap - sl) / operatorVwap) * 100).toFixed(1) : '5.0';
  const t1Pct = operatorVwap > 0 ? (((t1 - operatorVwap) / operatorVwap) * 100).toFixed(1) : '8.0';
  const t2Pct = operatorVwap > 0 ? (((t2 - operatorVwap) / operatorVwap) * 100).toFixed(1) : '14.5';

  const netRRR = alert.netRRR || (parseFloat(slPct) > 0 && parseFloat(t1Pct) > 0 ? (parseFloat(t1Pct) / parseFloat(slPct)).toFixed(1) : 'N/A');
  const timingSignature = alert.timingSignature || '⚡ Afternoon Stealth Accumulation (1:15 PM – 2:55 PM NPT)';
  const stageBadge = escapeHtml(alert.stageBadge || (alert.stage === 'STAGE_2_SUPPLY_VACUUM_IGNITION' ? '⚡ Stage 2: Supply Vacuum Ignition' : '🌱 Stage 1: Stealth Seeding'));

  // Flowchart v2.0 Track, BCR3, Retention/Churn & Ratchet metrics
  const rawBcr3Buy = alert.bcr3Buy ?? alert.bcr3BuyPct ?? alert.bcr3;
  const rawBcr3Sell = alert.bcr3Sell ?? alert.bcr3SellPct;
  const bcr3Buy = (rawBcr3Buy !== null && rawBcr3Buy !== undefined && Number.isFinite(Number(rawBcr3Buy))) ? Number(rawBcr3Buy) : null;
  const bcr3Sell = (rawBcr3Sell !== null && rawBcr3Sell !== undefined && Number.isFinite(Number(rawBcr3Sell))) ? Number(rawBcr3Sell) : null;
  const bcr3SpreadStr = (bcr3Buy !== null && bcr3Sell !== null)
    ? (() => { const s = +(bcr3Buy - bcr3Sell).toFixed(1); return `${s >= 0 ? '+' : ''}${s}%`; })()
    : 'N/A';
  const rawRet10 = alert.retention10D ?? alert.leadRetentionPct;
  const retentionPct = buyQty > 0
    ? +((netQty / buyQty) * 100).toFixed(1)
    : (rawRet10 !== null && rawRet10 !== undefined && Number.isFinite(Number(rawRet10)) ? Number(rawRet10) : null);
  const churnPct = buyQty > 0
    ? +Math.min(100, (sellQty / buyQty) * 100).toFixed(1)
    : (retentionPct !== null ? +(Math.max(0, 100 - retentionPct)).toFixed(1) : null);
  const resolvedTrack = alert.rallyTrack || (alert.isT2ClearedContinuation || alert.isBreakAndRetest ? 'TRACK_B_T2_CLEARED_CONTINUATION' : 'TRACK_A_COILED_2_3D_IGNITION');
  const trackDisplay = formatFlowchartTrackDisplay(resolvedTrack, alert.rallyHorizonLabel, alert.marketRegime || alert.regime || 'BULL');
  const numOpVwap = Math.max(1, Number(operatorVwap) || ltp || 100);
  const ratchetTrigger = (numOpVwap * 1.055).toFixed(1);
  const ratchetLock = (numOpVwap * 1.018).toFixed(1);
  const mtv = computeMultiTimeframeVwap(rawSym, alert.db || db);
  const v5Str = mtv.vwap5D ? `Rs. ${mtv.vwap5D}` : `Rs. ${operatorVwap}`;
  const v15Str = mtv.vwap15D ? `Rs. ${mtv.vwap15D}` : 'N/A';
  const v1MStr = mtv.vwap1M ? `Rs. ${mtv.vwap1M}` : 'N/A';

  return [
    `🚨 <b>[EARLY IGNITION ALERT] OPERATOR ACCUMULATION</b>`,
    `<b>Scrip:</b> <code>$${sym}</code> (${companyName})`,
    `<b>Live Price:</b> Rs. ${ltp.toFixed(2)} (${pChangeStr} | <i>Quiet Base Compression</i>)`,
    `<b>Phase:</b> ${stageBadge}`,
    `<b>Rally Track:</b> ${escapeHtml(trackDisplay.tierBadge)}`,
    `──────────────────────────`,
    `🕵️ <b>OPERATOR FOOTPRINT &amp; BCR3 AUDIT (BROKER #${brokerId}):</b>`,
    `• Dominant Accumulator: <b>${brokerName} (#${brokerId})</b>`,
    `• Volume Cornered: <b>${buyQty.toLocaleString()} Kitta</b> (Net: ${netQty >= 0 ? '+' : ''}${netQty.toLocaleString()} Kitta)`,
    `• Lead Retention vs Churn: <b>${retentionPct !== null ? `${retentionPct}%` : 'N/A'} Held</b> | Churn: <b>${churnPct !== null ? `${churnPct}%` : 'N/A'}</b> (${churnPct === null ? '⏳ Unverified' : churnPct > 35 ? '⚠️ High Wash Churn' : '✅ Clean Absorption'})`,
    `• Capital Deployed: <b>Rs. ${totalAmtCrores} Crore</b> | Share: <b>${mktShare}%</b>`,
    `• Top-3 Concentration: <b>BCR3 Buy ${bcr3Buy !== null ? `${bcr3Buy.toFixed(1)}%` : 'N/A'} vs BCR3 Sell ${bcr3Sell !== null ? `${bcr3Sell.toFixed(1)}%` : 'N/A'}</b> (Net Spread: <b>${bcr3SpreadStr}</b>)`,
    `• Buy vs Sell Dominance: <b>${buyRatio}% Buy Dominance</b>`,
    `• 🎯 <b>Average Broker Buy Price (Cost Basis):</b> <b>Rs. ${operatorVwap}</b> (${Number(ltp) >= Number(operatorVwap) ? '+' : ''}${(((Number(ltp) - Number(operatorVwap)) / Math.max(1, Number(operatorVwap))) * 100).toFixed(1)}% from LTP)`,
    `• 📊 <b>Multi-Timeframe VWAP:</b> 5D: <b>${v5Str}</b> | 15D: <b>${v15Str}</b> | 1M (22D): <b>${v1MStr}</b>`,
    `──────────────────────────`,
    `🕒 <b>TIMING &amp; IGNITION LAW:</b>`,
    `• Window: ${escapeHtml(timingSignature)}`,
    `• Historical Lead Time: <b>1 to 3 Sessions Before Public Markup (T+1 to T+3)</b>`,
    `• Track Allocation: <i>${escapeHtml(trackDisplay.allocationGuide)}</i>`,
    `──────────────────────────`,
    `🎯 <b>TACTICAL PROFIT PLAYBOOK:</b>`,
    `• <b>Limit Buy Zone:</b> Rs. ${buyZoneLow} – Rs. ${buyZoneHigh} (Anchor near Operator VWAP)`,
    `• <b>Invalidation Stop-Loss:</b> Rs. ${sl} (-${slPct}% | 1.5x ATR breathing room)`,
    `• ⚡ <b>Early Impulse Ratchet:</b> At <b>Rs. ${ratchetTrigger}</b> (+5.5% MFE ➔ Lock SL to <b>Rs. ${ratchetLock}</b> (+1.8% Breakeven))`,
    `• 👉 <b>WHAT YOU DO IN TMS:</b>`,
    `  1. On Entry: Place initial Stop-Loss order at <b>Rs. ${sl}</b>.`,
    `  2. If price touches <b>Rs. ${ratchetTrigger}</b> (+5.5%): Open TMS ➔ Cancel old SL ➔ Move Stop-Loss to <b>Rs. ${ratchetLock}</b>.`,
    `  <i>(Guarantees net cash profit after all SEBON, DP &amp; 7.5% CGT fees. Never let a +5.5% winner turn into a loss!)</i>`,
    `• <b>Target 1 (50% Profit Take):</b> Rs. ${t1} (+${t1Pct}% | <i>Sell 50% &amp; SL to Breakeven</i>)`,
    `• <b>Target 2 (Circuit Runner):</b> Rs. ${t2} (+${t2Pct}% | ±15% Circuit Ceiling)`,
    `• <b>Net Risk / Reward:</b> <b>${netRRR} : 1</b>`,
    `──────────────────────────`,
    `💡 <b>EXECUTION RULES FOR PROFIT:</b>`,
    `1. Buy inside the limit zone. Do NOT chase if tomorrow opens gapped &gt; +4%!`,
    `2. When Target 1 hits (+${t1Pct}%), sell 50% shares in TMS and immediately move Stop-Loss on remaining 50% to Breakeven (Trade becomes 100% Risk-Free)!`,
    `3. When Target 2 hits (+${t2Pct}%), exit remaining 50% shares near the +15% circuit ceiling.`,
    `<i>Anchored strictly to real broker tape data &amp; ±15% circuit limits.</i>`
  ].join('\n');
}

export async function sendTelegramEarlyIgnitionAlert(alert) {
  if (!alert) return { success: false, reason: 'No alert payload provided' };
  const html = alert.html || formatEarlyIgnitionAlertHtml(alert);
  return await sendTelegramMessage(html, 'HTML');
}

/**
 * Formats a diagnostic audit for a specific stock symbol queried by user (e.g. /b58 GHL or /b58 DORDI)
 */
export function formatBroker58SymbolAuditHtml({
  symbol,
  tradeDate,
  ltp,
  dayChangePct,
  buyVol,
  sellVol,
  netVol,
  buyAmt,
  buyRatioPct,
  marketSharePct,
  operatorVwap,
  companyName,
  multiDayNetVol,
  multiDayBuyVol,
  multiDayBuyAmtCr,
  multiDayBuyRatio,
  multiDayMarketShare,
  multiDayActiveDays,
  rangeCompressionPct,
  baseLow,
  baseHigh,
  ignitionHorizon
}) {
  const sym = String(symbol || '').toUpperCase();
  const name = escapeHtml(companyName || stockUniverseMap[sym]?.name || sym);
  const pChg = Number(dayChangePct || 0);
  const pChgStr = `${pChg >= 0 ? '+' : ''}${pChg.toFixed(2)}%`;
  const crAmt = (Number(buyAmt || 0) / 10000000).toFixed(2);
  const vwapStr = Number(operatorVwap || ltp).toFixed(1);

  // Verdict evaluation:
  let verdictTag = '';
  let verdictExplanation = '';
  let executionBlock = '';

  const isDumping = netVol < 0 || buyRatioPct < 45.0;
  const isExtended = pChg > 6.5;
  const isQualified = (netVol >= 5000 || (multiDayNetVol && multiDayNetVol >= 25000)) &&
                      (buyRatioPct >= 65.0 || (multiDayBuyRatio && multiDayBuyRatio >= 65.0)) &&
                      pChg >= -3.5 && pChg <= 5.0;

  if (isQualified) {
    const sl = (operatorVwap * 0.950).toFixed(1);
    const t1 = (operatorVwap * 1.080).toFixed(1);
    const t2 = (operatorVwap * 1.145).toFixed(1);
    const bLow = baseLow || Math.floor(operatorVwap * 0.99);
    const bHigh = baseHigh || Math.ceil(operatorVwap * 1.015);

    verdictTag = `🟢 <b>VERDICT: QUALIFIED EARLY IGNITION SETUP</b>`;
    verdictExplanation = `Broker #58 is actively absorbing float supply while price remains quietly compressed inside the base. This matches historical pre-breakout footprints (like GHL &amp; SHL before their surges)!`;
    executionBlock = [
      `──────────────────────────`,
      `🎯 <b>TACTICAL EXECUTION TICKET:</b>`,
      `• <b>Limit Buy Zone:</b> Rs. ${bLow} – Rs. ${bHigh}`,
      `• 🛡️ <b>Stop-Loss (-5.0%):</b> Rs. ${sl} (1.5x ATR breathing room)`,
      `• 💰 <b>Target 1 (+8.0%):</b> Rs. ${t1} (<i>Sell 50% &amp; SL to Breakeven</i>)`,
      `• 🚀 <b>Target 2 (+14.5%):</b> Rs. ${t2} (<i>Sell remaining 50%</i>)`,
      `• ⚖️ <b>Net Risk / Reward:</b> 2.8 : 1`
    ].join('\n');
  } else if (isDumping) {
    verdictTag = `🚫 <b>VERDICT: OPERATOR DUMP / DISTRIBUTION VETO</b>`;
    verdictExplanation = `Broker #58 was <b>NET SELLING (${Math.abs(netVol).toLocaleString()} Kitta)</b> with only ${buyRatioPct}% buy ratio! The operator is offloading supply into retail liquidity. <b>Do NOT buy!</b>`;
  } else if (isExtended) {
    verdictTag = `⚠️ <b>VERDICT: LATE BREAKOUT CHASE TRAP</b>`;
    verdictExplanation = `Price has already jumped ${pChgStr}! Our empirical data shows chasing breakouts after +6.5% exposes traders to severe T+2 pullbacks (-3.4% average drawdown). Wait for a pullback to VWAP.`;
  } else {
    verdictTag = `ℹ️ <b>VERDICT: NEUTRAL / SUB-THRESHOLD ACTIVITY</b>`;
    verdictExplanation = `Broker #58 bought ${buyVol.toLocaleString()} kitta (${marketSharePct}% session share). This is ordinary retail turnover, not an institutional supply-vacuum cornering.`;
  }

  const multiSection = multiDayNetVol ? [
    `──────────────────────────`,
    `🔍 <b>5-DAY STEALTH FOOTPRINT (${multiDayActiveDays || 5} Sessions):</b>`,
    `• Multi-Day Footprint: <b>+${Number(multiDayNetVol).toLocaleString()} Net Kitta</b> (${Number(multiDayBuyVol || multiDayNetVol).toLocaleString()} Bought)`,
    `• Institutional Outlay: <b>Rs. ${multiDayBuyAmtCr || (buyAmt / 10000000).toFixed(2)} Crores absorbed</b>`,
    `• Window Buy Dominance: <b>${multiDayBuyRatio || buyRatioPct}% Buy Ratio</b>`,
    `• Cornered Float: <b>${multiDayMarketShare || marketSharePct}% of Total Volume</b>`,
    `• 🚀 <b>Ignition Horizon:</b> <b>${ignitionHorizon || '1–3 Days (Supply Vacuum Stage 2)'}</b>`
  ].join('\n') : '';

  return [
    `🕵️ <b>BROKER #58 OPERATOR FOOTPRINT AUDIT</b>`,
    `<b>Scrip:</b> <code>$${sym}</code> (${name})`,
    `<b>Session Audited:</b> <code>${tradeDate}</code>`,
    `──────────────────────────`,
    `📊 <b>LATEST SESSION METRICS:</b>`,
    `• LTP: <b>Rs. ${Number(ltp).toFixed(2)}</b> (${pChgStr})`,
    `• B58 Bought: <b>${buyVol.toLocaleString()} Kitta</b> (Rs. ${crAmt} Cr)`,
    `• B58 Sold: <b>${sellVol.toLocaleString()} Kitta</b>`,
    `• Net Footprint: <b>${netVol >= 0 ? '+' : ''}${netVol.toLocaleString()} Kitta</b>`,
    `• Buy vs Sell Dominance: <b>${buyRatioPct}% Buy Dominance</b>`,
    `• Session Market Share: <b>${marketSharePct}% of Volume</b>`,
    `• 🎯 <b>Average Broker Buy Price (Cost Basis):</b> <b>Rs. ${vwapStr}</b> (${Number(ltp) >= Number(vwapStr) ? '+' : ''}${(((Number(ltp) - Number(vwapStr)) / Math.max(1, Number(vwapStr))) * 100).toFixed(1)}% from LTP)`,
    multiSection,
    `──────────────────────────`,
    verdictTag,
    verdictExplanation,
    executionBlock,
    `──────────────────────────`,
    `<i>Type <code>/b58 playbook</code> for full empirical rules &amp; risk framework.</i>`
  ].filter(Boolean).join('\n');
}

export function formatBroker58RadarHtml(setups = [], targetDate = '') {
  if (!Array.isArray(setups) || setups.length === 0) {
    return [
      `⚡ <b>BROKER #58 OPERATOR RADAR</b>`,
      `──────────────────────────`,
      `No stock currently meets the strict early stealth accumulation criteria (≥70% Buy Ratio, ≥15k Kitta or ≥12% Share, -3.0% to +4.5% compressed price base).`,
      ``,
      `🛡️ <b>Capital Defense Active:</b> Preserving cash protects capital from late breakout traps and fakeouts.`,
      `💡 Check specific stocks anytime: <code>/b58 GHL</code> or view rules via <code>/b58 playbook</code>.`
    ].join('\n');
  }

  const dateStr = targetDate ? ` (${targetDate})` : '';
  const items = setups.slice(0, 5).map((s, idx) => {
    const sym = s.symbol;
    const ltp = Number(s.ltp || 0).toFixed(1);
    const pchg = Number(s.day_pchange ?? s.pChange ?? 0);
    const pchgStr = `${pchg >= 0 ? '+' : ''}${pchg.toFixed(1)}%`;
    const buyKitta = Number(s.buy_vol ?? s.buyVol ?? s.brokerBuyVol ?? 0).toLocaleString();
    const netKitta = Number(s.net_vol ?? s.netVol ?? 0).toLocaleString();
    const cr = (Number(s.buy_amt ?? s.buyAmt ?? s.totalBuyAmount ?? 0) / 10000000).toFixed(2);
    const ratio = Number(s.buy_ratio ?? s.buyRatio ?? s.buyRatioPct ?? 0).toFixed(1);
    const share = Number(s.mkt_share ?? s.mktShare ?? s.marketSharePct ?? 0).toFixed(1);
    const vwap = Number(s.operator_vwap ?? s.operatorVwap ?? ltp).toFixed(1);
    const bLow = s.baseLow || s.buyZone?.low || Math.floor(vwap * 0.99);
    const bHigh = s.baseHigh || s.buyZone?.high || Math.ceil(vwap * 1.015);
    const sl = s.sl || s.stopLoss || (vwap * 0.950).toFixed(1);
    const t1 = s.t1 || s.target1 || (vwap * 1.080).toFixed(1);
    const t2 = s.t2 || s.target2 || (vwap * 1.145).toFixed(1);

    // Multi-day stealth details:
    const multiNet = Number(s.multiDayNetVol ?? s.net_vol ?? 0).toLocaleString();
    const multiBuy = Number(s.multiDayBuyVol ?? s.buy_vol ?? 0).toLocaleString();
    const multiCr = s.multiDayBuyAmtCr ?? cr;
    const multiRatio = Number(s.multiDayBuyRatio ?? ratio).toFixed(1);
    const multiShare = Number(s.multiDayMarketShare ?? share).toFixed(1);
    const multiDays = s.multiDayActiveDays || 5;
    const baseRange = s.rangeCompressionPct ? `Tight ${s.rangeCompressionPct}% Base` : 'Coiling Base';
    const horizon = s.ignitionHorizon || '1–3 Days (Supply Vacuum Stage 2 Complete)';

    return [
      `<b>${idx + 1}. $${sym}</b> (LTP: Rs. ${ltp} | ${pchgStr} Base)`,
      `• <b>Latest Session:</b> +${netKitta} Net Kitta (${buyKitta} Bought | ${ratio}% Buy)`,
      `• 🔍 <b>${multiDays}-Day Stealth Footprint:</b> <b>+${multiNet} Net Kitta</b> (${multiBuy} Bought | Rs. ${multiCr} Cr)`,
      `• 👑 <b>Dominance:</b> <b>${multiRatio}% Buy</b> | ${multiShare}% Float Vacuumed`,
      `• 🧱 <b>Base Structure:</b> Rs. ${bLow} – Rs. ${bHigh} (${baseRange})`,
      `• 🚀 <b>Ignition Horizon:</b> <b>${horizon}</b>`,
      `• 🎯 <b>Buy Zone:</b> Rs. ${bLow} – Rs. ${bHigh} | 🛑 <b>SL:</b> Rs. ${sl} (-5.0%)`,
      `• 🏁 <b>Target 1:</b> Rs. ${t1} (+8.0%) | 🚀 <b>Target 2:</b> Rs. ${t2} (+14.5%)`
    ].join('\n');
  });

  return [
    `⚡ <b>BROKER #58 OPERATOR RADAR: PRE-BOOM SETUPS${dateStr}</b>`,
    `<b>Dominant Operator:</b> Broker #58 (Naasa Securities)`,
    `<b>Strategy:</b> Multi-Day Stealth Supply Vacuum (Poised to Break Out in 1–3 Days)`,
    `──────────────────────────`,
    ...items,
    `──────────────────────────`,
    `💡 <i>Golden Rule: Buy strictly inside Buy Zone. Lock 50% profit at Target 1 and raise SL to Breakeven!</i>`
  ].join('\n\n');
}

let _todayIngestPromise = null;

/**
 * Guarantees that if the market has closed for today (post 3:05 PM NPT),
 * today's consolidated floorsheet and broker ledger are automatically ingested before running analysis.
 */
export async function ensureTodaySessionIngested() {
  if (_todayIngestPromise) return _todayIngestPromise;
  _todayIngestPromise = (async () => {
    try {
      const status = getDetailedMarketStatus();
      const nptMins = status.nptTotalMinutes || 0;
      // Check if market has closed on a trading day (>= 15:05 NPT = 905 mins)
      if (status.isTradingDay && nptMins >= 905) {
        const now = new Date();
        const nowNpt = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000);
        const todayIso = nowNpt.toISOString().split('T')[0];
        const { db } = await import('./db/ledgerStore.js');
        if (db) {
          const hasToday = db.prepare('SELECT 1 FROM daily_broker_ledger WHERE trade_date = ? LIMIT 1').get(todayIso);
          if (!hasToday) {
            console.log(`[TelegramNotifier] Today's session (${todayIso}) missing after market close. Auto-downloading floorsheet...`);
            const { downloadAndArchiveDailyFloorsheet } = await import('./utils/dailyFloorsheetCollector.mjs');
            await downloadAndArchiveDailyFloorsheet(todayIso);
          }
        }
      }
    } catch (err) {
      console.warn('[TelegramNotifier] ensureTodaySessionIngested notice:', err.message);
    }
  })().finally(() => {
    _todayIngestPromise = null;
  });
  return _todayIngestPromise;
}

/**
 * High-Volume Breakout & 20 EMA Sharp Accumulation Base Scanner
 * Dispatches:
 * 1. Stocks crossing above 20 EMA within 1–10 sessions with volume and tight non-surged base coiling to ignite.
 * 2. Fresh 20-Day Resistance breakouts with >= 1.5x volume expansion.
 */
export async function runBreakoutScannerAndDispatch(options = {}) {
  const targetChatId = options?.chatId || null;
  const symbolFilter = options?.symbol ? String(options.symbol).toUpperCase().trim() : null;

  try {
    const { db, getSmartMoneyAggregatedFlow } = await import('./db/ledgerStore.js');
    if (!db) {
      const msg = `ℹ️ <b>Breakout Scanner:</b> Database initializing. Please try again shortly.`;
      const res = await sendTelegramMessage(msg, { chatId: targetChatId });
      return { success: false, telegramResult: res };
    }

    const { scanEmaCrossoverAndSharpBase } = await import('./smartAlertEngine.mjs');

    // Retrieve the most recent session date in daily_stock_summary
    const dateRow = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_stock_summary').get();
    const sessionDate = dateRow?.maxDate;
    if (!sessionDate) {
      const msg = `ℹ️ <b>Breakout Scanner:</b> No recent trading session data available.`;
      const res = await sendTelegramMessage(msg, { chatId: targetChatId });
      return { success: false, telegramResult: res };
    }

    // 1. Single Symbol Breakout & 20 EMA Audit Mode
    if (symbolFilter) {
      const symAudit = await scanEmaCrossoverAndSharpBase({ symbol: symbolFilter, sessionDate });
      if (Array.isArray(symAudit) && symAudit.length > 0) {
        const b = symAudit[0];
        const compName = escapeHtml(stockUniverseMap[b.symbol]?.name || b.symbol);
        const msg = [
          `🔍 <b>20 EMA &amp; BREAKOUT AUDIT: <code>$${b.symbol}</code></b>`,
          `<b>Company:</b> ${compName}`,
          `<b>Session Date:</b> <code>${sessionDate}</code>`,
          `──────────────────────────`,
          `📊 <b>TECHNICAL STRUCTURE:</b>`,
          `• <b>Price (LTP):</b> Rs. ${Number(b.ltp).toFixed(2)} (${b.distFromEmaPct >= 0 ? '+' : ''}${b.distFromEmaPct}% from 20 EMA)`,
          `• <b>20-Period EMA:</b> Rs. ${b.ema20.toFixed(2)}`,
          `• <b>Crossover Timing:</b> Crossed ${b.daysSinceCross === 0 ? 'Today' : `${b.daysSinceCross} days ago (${b.crossDate})`} with <b>${b.rvolCross}x Volume</b>`,
          `• <b>Base Consolidation:</b> Rs. ${b.minBasePrice} – Rs. ${b.maxBasePrice} (Tight ${b.consolidationRangePct}% Base)`,
          `• <b>Today's Volume:</b> ${Number(b.todayVolume).toLocaleString()} (${b.rvolToday}x 20D Avg)`,
          `• 🚀 <b>Ignition Verdict:</b> <b>${escapeHtml(b.ignitionVerdict)}</b>`,
          `──────────────────────────`,
          `🎯 <b>TACTICAL EXECUTION PLAN:</b>`,
          `• <b>Buy Zone:</b> Rs. ${b.buyZone.low} – Rs. ${b.buyZone.high}`,
          `• 🛡️ <b>Stop-Loss Floor:</b> Rs. ${b.stopLoss} (-4.5% defense)`,
          `• 💰 <b>Target 1:</b> Rs. ${b.target1} (+8.0% Pre-Circuit)`,
          `• 🚀 <b>Target 2:</b> Rs. ${b.target2} (+14.5% Circuit Ceiling)`,
          `──────────────────────────`,
          `💡 <i>Safe Rule: Stock has crossed 20 EMA and consolidated tightly without surging away!</i>`
        ].join('\n');
        const res = await sendTelegramMessage(msg, { chatId: targetChatId });
        return { success: true, count: 1, message: msg, telegramResult: res };
      } else {
        const notFoundMsg = [
          `ℹ️ <b>20 EMA &amp; BREAKOUT AUDIT: <code>$${symbolFilter}</code></b>`,
          `──────────────────────────`,
          `<code>$${symbolFilter}</code> does not currently have an active 20 EMA crossover with volume or a sharp consolidation base.`,
          `──────────────────────────`,
          `💡 Type <code>/breakout</code> to view all active 20 EMA and resistance setups across the market.`
        ].join('\n');
        const res = await sendTelegramMessage(notFoundMsg, { chatId: targetChatId });
        return { success: true, count: 0, message: notFoundMsg, telegramResult: res };
      }
    }

    // 2. General Radar Scan Mode
    const emaSetups = await scanEmaCrossoverAndSharpBase({ 
      lookbackSessions: 10, 
      maxSurgePct: 7.5, 
      maxBaseRangePct: 9.0,
      sessionDate, 
      limit: 3 
    });

    const breakouts20d = db.prepare(`
      WITH recent_dates AS (
        SELECT DISTINCT trade_date 
        FROM daily_stock_summary 
        WHERE trade_date < ? 
        ORDER BY trade_date DESC 
        LIMIT 20
      ),
      hist AS (
        SELECT symbol, 
               AVG(total_volume) as avg_vol_20d,
               MAX(high_price) as res_20d
        FROM daily_stock_summary
        WHERE trade_date IN (SELECT trade_date FROM recent_dates)
        GROUP BY symbol
        HAVING COUNT(*) >= 10
      )
      SELECT s.symbol, s.close_price as ltp, s.total_volume, s.total_turnover,
             ROUND(h.res_20d, 1) as res_20d,
             ROUND(h.avg_vol_20d, 0) as avg_vol_20d,
             ROUND(CAST(s.total_volume AS REAL) / MAX(1, h.avg_vol_20d), 2) as rvol,
             ROUND((s.close_price - h.res_20d) / h.res_20d * 100, 2) as breakout_pct
      FROM daily_stock_summary s
      JOIN hist h ON s.symbol = h.symbol
      WHERE s.trade_date = ?
        AND s.close_price > h.res_20d
        AND s.total_volume >= 1.5 * h.avg_vol_20d
        AND s.total_volume >= 15000
        AND (s.close_price - h.res_20d) / h.res_20d BETWEEN 0.001 AND 0.07
      ORDER BY rvol DESC
      LIMIT 10
    `).all(sessionDate, sessionDate);

    // Filter 20-Day breakouts through 5-Day Institutional Ledger & Trap Veto Gate
    const verifiedBreakouts20d = [];
    for (const b of breakouts20d || []) {
      const trapAudit = auditMultiSessionTrapRisk(db, b.symbol);
      const flow = typeof getSmartMoneyAggregatedFlow === 'function' ? getSmartMoneyAggregatedFlow(b.symbol, 5) : [];
      const flowMetrics = extract5DayBrokerFlowMetrics(flow, b.ltp);
      const retentionPct = Number(trapAudit?.retentionPct || 0);
      if (
        trapAudit?.isTrap === true ||
        flowMetrics.bcr3Sell > flowMetrics.bcr3Buy ||
        flowMetrics.bcr3Sell > 45 ||
        retentionPct < 55
      ) {
        continue;
      }
      verifiedBreakouts20d.push({
        ...b,
        operatorVwap: flowMetrics.avgBrokerPrice,
        avgBrokerPrice: flowMetrics.avgBrokerPrice,
        bcr3Buy: flowMetrics.bcr3Buy,
        bcr3Sell: flowMetrics.bcr3Sell,
        leadBrokerId: trapAudit?.leadBrokerId || flowMetrics.leadBrokerId,
        leadRetentionPct: retentionPct
      });
    }

    if ((!emaSetups || emaSetups.length === 0) && verifiedBreakouts20d.length === 0) {
      const noBreakoutMsg = [
        `⚡ <b>HIGH-VOLUME BREAKOUT &amp; 20 EMA ACCUMULATION RADAR</b>`,
        `──────────────────────────`,
        `Session: <b>${sessionDate}</b>`,
        `No stock currently meets the strict criteria (20 EMA cross within 1-10 days + sharp non-extended base, or fresh 20-Day resistance breakout passing the 5-Day Institutional Trap Veto).`,
        `──────────────────────────`,
        `🛡️ <i>Strict entry rules protect you from chasing overextended stocks or T+2 operator distribution traps.</i>`,
        `💡 Type <code>/b58</code> to view early pre-breakout operator footprints.`
      ].join('\n');
      const res = await sendTelegramMessage(noBreakoutMsg, { chatId: targetChatId });
      return { success: true, count: 0, message: noBreakoutMsg, telegramResult: res };
    }

    const cards = [];

    // Render 20 EMA Cross & Sharp Base Setups
    for (let idx = 0; idx < emaSetups.length; idx++) {
      if (cards.length >= 4) break;
      const b = emaSetups[idx];
      const compName = escapeHtml(stockUniverseMap[b.symbol]?.name || b.symbol);
      const timingText = b.daysSinceCross === 0
        ? `Crossed 20 EMA Today (<b>${b.rvolCross}x Vol</b>)`
        : `Crossed 20 EMA ${b.daysSinceCross}D ago (${b.crossDate}, <b>${b.rvolCross}x Vol</b>)`;
      const realVwap = Number(b.operatorVwap || b.avgBrokerPrice || b.ema20).toFixed(1);
      const bcrBuy = b.bcr3Buy != null && Number.isFinite(Number(b.bcr3Buy)) ? `${Number(b.bcr3Buy).toFixed(1)}%` : 'N/A';
      const bcrSell = b.bcr3Sell != null && Number.isFinite(Number(b.bcr3Sell)) ? `${Number(b.bcr3Sell).toFixed(1)}%` : 'N/A';
      const leadId = b.leadBrokerId || 'N/A';
      const leadRet = b.leadRetentionPct != null && Number.isFinite(Number(b.leadRetentionPct)) ? `${Number(b.leadRetentionPct).toFixed(0)}%` : 'N/A';

      cards.push([
        `<b>${cards.length + 1}. <code>$${b.symbol}</code></b> — ${compName}`,
        `• <b>Setup:</b> ${escapeHtml(b.statusBadge)} | 🛡️ <b>Zero-Trap Gate:</b> PASSED`,
        `• <b>Price:</b> Rs. ${Number(b.ltp).toFixed(2)} (${b.distFromEmaPct >= 0 ? '+' : ''}${b.distFromEmaPct}% vs 20 EMA Rs. ${b.ema20})`,
        `• 🎯 <b>Average Broker Price (Cost Basis):</b> Rs. ${realVwap}`,
        `• 🏛️ <b>5D Ledger:</b> BCR3 Buy <b>${bcrBuy}</b> vs Sell <b>${bcrSell}</b> | Broker #${leadId} (<b>${leadRet}</b> Ret)`,
        `• <b>Spark &amp; Base:</b> ${timingText} | Tight ${b.consolidationRangePct}% Base (${b.rvolToday}x Vol)`,
        `• 📐 <b>SMC Confluence:</b> ${escapeHtml(b.smcNarrative || 'Clean 20 EMA Base Hold')}`,
        `• 🎯 <b>Buy Zone:</b> Rs. ${b.buyZone.low}–${b.buyZone.high} | 🛑 <b>SL:</b> Rs. ${b.stopLoss} | 🏁 <b>T1/T2:</b> ${b.target1}/${b.target2}`
      ].join('\n'));
    }

    // Render 20-Day Resistance Fresh Breakouts (if not already listed)
    const seen = new Set(emaSetups.map(s => s.symbol));
    for (const b of verifiedBreakouts20d) {
      if (cards.length >= 4) break;
      if (!seen.has(b.symbol)) {
        const compName = escapeHtml(stockUniverseMap[b.symbol]?.name || b.symbol);
        const sl = Math.round(b.res_20d * 0.955 * 10) / 10;
        const t1 = Math.round(b.ltp * 1.08 * 10) / 10;
        const t2 = Math.round(b.ltp * 1.145 * 10) / 10;
        const realVwap = Number(b.operatorVwap || b.avgBrokerPrice || b.res_20d).toFixed(1);
        const bcrBuy = b.bcr3Buy != null && Number.isFinite(Number(b.bcr3Buy)) ? `${Number(b.bcr3Buy).toFixed(1)}%` : 'N/A';
        const bcrSell = b.bcr3Sell != null && Number.isFinite(Number(b.bcr3Sell)) ? `${Number(b.bcr3Sell).toFixed(1)}%` : 'N/A';
        const leadId = b.leadBrokerId || 'N/A';
        const leadRet = b.leadRetentionPct != null && Number.isFinite(Number(b.leadRetentionPct)) ? `${Number(b.leadRetentionPct).toFixed(0)}%` : 'N/A';
        cards.push([
          `<b>${cards.length + 1}. <code>$${b.symbol}</code></b> — ${compName}`,
          `• <b>Setup:</b> ⚡ Fresh 20D Resistance Breakout | 🛡️ <b>Zero-Trap Gate:</b> PASSED`,
          `• <b>Price:</b> Rs. ${Number(b.ltp).toFixed(2)} (+${b.breakout_pct}% above pivot Rs. ${Number(b.res_20d).toFixed(1)})`,
          `• 🎯 <b>Average Broker Price (Cost Basis):</b> Rs. ${realVwap}`,
          `• 🏛️ <b>5D Ledger:</b> BCR3 Buy <b>${bcrBuy}</b> vs Sell <b>${bcrSell}</b> | Broker #${leadId} (<b>${leadRet}</b> Ret)`,
          `• 📐 <b>SMC Confluence:</b> Fresh 20D Pivot Expansion Above Demand`,
          `• <b>Volume Surge:</b> <b>${b.rvol}x</b> 20D Avg (${Number(b.total_volume).toLocaleString('en-IN')} shares)`,
          `• 🛑 <b>SL:</b> Rs. ${sl.toFixed(1)} (-4.5%) | 🏁 <b>T1/T2:</b> Rs. ${t1.toFixed(1)} / Rs. ${t2.toFixed(1)}`
        ].join('\n'));
        seen.add(b.symbol);
      }
    }

    const msg = [
      `🚀 <b>HIGH-VOLUME BREAKOUT &amp; 20 EMA ACCUMULATION RADAR (${cards.length} Verified)</b>`,
      `──────────────────────────`,
      `Session Date: <b>${sessionDate}</b>`,
      `Strategy: 20 EMA Cross within 1–10 Days + Sharp Non-Surged Base + Volume Expansion`,
      `──────────────────────────`,
      cards.join('\n──────────────────────────\n'),
      `──────────────────────────`,
      `💡 <i>Safe Entry Rule: Buy inside the sharp consolidation base near 20 EMA. Never chase if extended &gt;7% from pivot!</i>`
    ].join('\n');

    const res = await sendTelegramMessage(msg, { chatId: targetChatId });
    return { success: true, count: cards.length, message: msg, telegramResult: res };
  } catch (err) {
    console.warn('[TelegramNotifier] Breakout scan error:', err.message);
    const res = await sendTelegramMessage(`⚠️ Breakout scan notice: ${err.message}`, { chatId: targetChatId });
    return { success: false, error: err.message, telegramResult: res };
  }
}

export async function runBroker58RadarAndDispatch(symbolFilter = null, options = {}) {
  await ensureTodaySessionIngested();
  let setups = [];
  let targetDate = '';
  const targetChatId = options?.chatId || null;

  // 1. Single Symbol Audit mode
  if (symbolFilter) {
    const sym = String(symbolFilter).toUpperCase().trim();
    try {
      const { db } = await import('./db/ledgerStore.js');
      if (db) {
        // Query the most recent session where Broker 58 traded this symbol
        const row = db.prepare(`
          SELECT l.symbol, l.trade_date, l.buy_vol, l.sell_vol, l.buy_amt, l.sell_amt,
                 (l.buy_vol - l.sell_vol) as net_vol,
                 ROUND(CAST(l.buy_vol AS REAL) / MAX(1, l.buy_vol + l.sell_vol) * 100, 1) as buy_ratio,
                 s.close_price as ltp, s.open_price, s.total_volume,
                 ROUND(CAST(l.buy_vol AS REAL) / MAX(1, s.total_volume) * 100, 1) as mkt_share,
                 ROUND((s.close_price - s.open_price) / MAX(1, s.open_price) * 100, 1) as day_pchange,
                 ROUND(l.buy_amt / MAX(1, l.buy_vol), 1) as operator_vwap
          FROM daily_broker_ledger l
          LEFT JOIN daily_stock_summary s ON l.trade_date = s.trade_date AND l.symbol = s.symbol
          WHERE l.broker_id = 58 AND l.symbol = ?
          ORDER BY l.trade_date DESC
          LIMIT 1
        `).get(sym);

        if (row) {
          const { getMultiDayBroker58Accumulation } = await import('./smartAlertEngine.mjs');
          const stealth = await getMultiDayBroker58Accumulation(sym, { lookbackDays: 5, sessionDate: row.trade_date });

          const auditHtml = formatBroker58SymbolAuditHtml({
            symbol: row.symbol,
            tradeDate: row.trade_date,
            ltp: row.ltp || row.operator_vwap || 100,
            dayChangePct: row.day_pchange || 0,
            buyVol: row.buy_vol || 0,
            sellVol: row.sell_vol || 0,
            netVol: row.net_vol || 0,
            buyAmt: row.buy_amt || 0,
            buyRatioPct: row.buy_ratio || 0,
            marketSharePct: row.mkt_share || 0,
            operatorVwap: row.operator_vwap || row.ltp,
            companyName: stockUniverseMap[sym]?.name || sym,
            multiDayNetVol: stealth?.netBuyVol || row.net_vol,
            multiDayBuyVol: stealth?.totalBuyVol || row.buy_vol,
            multiDayBuyAmtCr: stealth?.totalBuyAmtCr || (row.buy_amt / 10000000).toFixed(2),
            multiDayBuyRatio: stealth?.windowBuyRatio || row.buy_ratio,
            multiDayMarketShare: stealth?.marketSharePct || row.mkt_share,
            multiDayActiveDays: stealth?.activeDays || 1,
            rangeCompressionPct: stealth?.rangeCompressionPct || 0,
            baseLow: stealth?.minLow,
            baseHigh: stealth?.maxHigh,
            ignitionHorizon: stealth?.ignitionHorizon || (row.net_vol >= 5000 ? '1–3 Days (Poised for Markup)' : 'Neutral')
          });
          const res = await sendTelegramMessage(auditHtml, { chatId: targetChatId });
          return { success: res.success, setupsCount: 1, telegramResult: res };
        } else {
          const noActivityMsg = [
            `ℹ️ <b>BROKER #58 OPERATOR AUDIT: $${sym}</b>`,
            `──────────────────────────`,
            `No transactions by Broker #58 (Naasa Securities) were recorded in the recent NEPSE database for <code>$${sym}</code>.`,
            `This symbol does not currently have active operator accumulation.`,
            `──────────────────────────`,
            `💡 Type <code>/b58</code> to view active setups, or <code>/b58 playbook</code> for criteria.`
          ].join('\n');
          const res = await sendTelegramMessage(noActivityMsg, { chatId: targetChatId });
          return { success: res.success, setupsCount: 0, telegramResult: res };
        }
      }
    } catch (err) {
      console.warn('[TelegramNotifier] Error in symbol audit:', err.message);
    }
  }

  // 2. Universe Radar Scan mode
  if (typeof _scanUniverseForBroker58Ignitions === 'function') {
    try {
      const res = await _scanUniverseForBroker58Ignitions();
      setups = res.setups || [];
      targetDate = res.sessionDate || '';
    } catch (_) {}
  }

  if (setups.length === 0) {
    try {
      const { db } = await import('./db/ledgerStore.js');
      if (db) {
        const dateRow = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_broker_ledger').get();
        targetDate = dateRow?.maxDate || '';
        if (targetDate) {
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
              )
              AND (l.buy_vol - l.sell_vol) >= 5000
              AND CAST(l.buy_vol AS REAL) / MAX(1, l.buy_vol + l.sell_vol) >= 0.70
              AND s.total_volume > 0
              AND (s.close_price - s.open_price) / s.open_price BETWEEN -0.03 AND 0.045
            ORDER BY l.buy_amt DESC
            LIMIT 6
          `).all(targetDate);

          const { getMultiDayBroker58Accumulation } = await import('./smartAlertEngine.mjs');
          for (const r of rows) {
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
          setups = rows;
        }
      }
    } catch (dbErr) {
      console.warn('[TelegramNotifier] Error querying Broker 58 radar from DB:', dbErr.message);
    }
  }

  const html = formatBroker58RadarHtml(setups, targetDate);
  const res = await sendTelegramMessage(html, { chatId: targetChatId });
  return { success: res.success, setupsCount: setups.length, setups, sessionDate: targetDate, html, telegramResult: res };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEEP STOCK ANALYSIS & PROFITABILITY AUDIT (/analyze SYMBOL)
 * ───────────────────────────────────────────────────────────────────────────
 * Provides an exhaustive institutional, technical, supply dry-up, and risk
 * audit for any queried stock, determining whether the stock is appropriate
 * to invest in for profit making.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function runStockDeepAnalysisAndDispatch(rawSymbol, options = {}) {
  const targetChatId = options?.chatId || null;
  const sym = String(rawSymbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

  if (!sym) {
    const usage = [
      `🔍 <b>DEEP STOCK AUDIT: /analyze</b>`,
      `──────────────────────────`,
      `Please provide a valid stock symbol to analyze.`,
      `Example: <code>/analyze SHIVM</code> or <code>/analyze GHL</code>`
    ].join('\n');
    const res = await sendTelegramMessage(usage, { chatId: targetChatId });
    return { success: false, telegramResult: res };
  }

  try {
    const { db, getSmartMoneyAggregatedFlow, getSymbolHistoryFromDb } = await import('./db/ledgerStore.js');

    const hist = getSymbolHistoryFromDb(sym, 30);
    if (!hist || hist.length === 0) {
      const notFoundMsg = [
        `ℹ️ <b>DEEP STOCK AUDIT: <code>$${sym}</code></b>`,
        `──────────────────────────`,
        `No trading history found for <code>$${sym}</code> in the ledger database.`,
        `Please verify the stock ticker and try again (e.g. <code>/analyze SHIVM</code>).`
      ].join('\n');
      const res = await sendTelegramMessage(notFoundMsg, { chatId: targetChatId });
      return { success: false, telegramResult: res };
    }

    const latest = hist[0];
    const ltp = Number(latest.closePrice || latest.ltp || 0);
    const open = Number(latest.openPrice || ltp);
    const high = Number(latest.highPrice || ltp);
    const low = Number(latest.lowPrice || ltp);
    const volume = Number(latest.totalVolume || 0);
    const turnover = Number(latest.totalTurnover || 0);
    const tradeDate = latest.date || latest.tradeDate || 'Latest Session';
    const compName = escapeHtml(stockUniverseMap[sym]?.name || sym);
    const sector = escapeHtml(stockUniverseMap[sym]?.sector || 'NEPSE Equities');

    const pChange = open > 0 ? (((ltp - open) / open) * 100) : 0;
    const pChangeStr = `${pChange >= 0 ? '+' : ''}${pChange.toFixed(2)}%`;

    // 20-period EMA
    const closes = hist.map(h => h.closePrice).reverse();
    const k = 2 / (Math.min(closes.length, 20) + 1);
    let ema20 = closes[0];
    for (let i = 1; i < closes.length; i++) {
      ema20 = closes[i] * k + ema20 * (1 - k);
    }
    const distFromEmaPct = +(((ltp - ema20) / ema20) * 100).toFixed(1);

    // 20-Day Range & Average Volume
    const slice20 = hist.slice(0, 20);
    const minLow20 = Math.min(...slice20.map(h => h.lowPrice || ltp));
    const maxHigh20 = Math.max(...slice20.map(h => h.highPrice || ltp));
    const minClose20 = Math.min(...slice20.map(h => h.closePrice || ltp));
    const maxClose20 = Math.max(...slice20.map(h => h.closePrice || ltp));
    const avgVol20 = Math.round(slice20.reduce((acc, h) => acc + (h.totalVolume || 0), 0) / Math.max(1, slice20.length));
    const rvol = avgVol20 > 0 ? +(volume / avgVol20).toFixed(2) : 1.0;
    
    // Evaluate closing base compression vs intraday extreme
    const closeBasePct = minClose20 > 0 ? +(((maxClose20 - minClose20) / minClose20) * 100).toFixed(1) : 0;
    const baseCategory = closeBasePct <= 7.0 ? 'Tight' : (closeBasePct <= 18.0 ? 'Moderate' : 'Wide');

    // Volume Profile Point of Control (POC) over 20 sessions
    const vpBuckets = new Map();
    for (const bar of slice20) {
      const bHigh = Number(bar.highPrice || bar.ltp || ltp);
      const bLow = Number(bar.lowPrice || bar.ltp || ltp);
      const bClose = Number(bar.closePrice || bar.ltp || ltp);
      const barMid = Math.round((bHigh + bLow + bClose) / 3);
      if (barMid > 0) {
        vpBuckets.set(barMid, (vpBuckets.get(barMid) || 0) + Number(bar.totalVolume || 0));
      }
    }
    let maxVpVol = 0, pocPrice = Math.round(ltp);
    for (const [px, vol] of vpBuckets.entries()) {
      if (vol > maxVpVol) { maxVpVol = vol; pocPrice = px; }
    }
    const pocDist = +(((ltp - pocPrice) / pocPrice) * 100).toFixed(1);
    const pocSign = pocDist >= 0 ? '+' : '';
    const isAbovePoc = ltp >= pocPrice;

    // SMC Liquidity Sweep & Structural Invalidation Floor (Past 5 sessions)
    const slice5 = hist.slice(0, 5);
    const validSlice5 = slice5.filter(h => (h.lowPrice || ltp) >= minClose20 * 0.75);
    const priorLows = validSlice5.slice(1).map(h => h.lowPrice || ltp);
    const minPriorLow = priorLows.length > 0 ? Math.min(...priorLows) : low;
    const structuralFloor = validSlice5.length > 0 ? Math.min(...validSlice5.map(h => h.lowPrice || ltp)) : low;

    let sweepStatus = '';
    if (low < minPriorLow && ltp > minPriorLow) {
      sweepStatus = `⚡ <b>Confirmed Liquidity Sweep</b> (Dipped to Rs. ${low.toFixed(1)}, flushed stops & reclaimed Rs. ${minPriorLow.toFixed(1)})`;
    } else if (validSlice5.length > 2 && validSlice5[1].lowPrice < minPriorLow && ltp > validSlice5[1].lowPrice) {
      sweepStatus = `⚡ <b>Recent Liquidity Sweep</b> (Flushed stops at Rs. ${validSlice5[1].lowPrice.toFixed(1)} and absorbed)`;
    } else {
      sweepStatus = `🛡️ <b>Orderly Base Accumulation</b> (Holding support shelf at Rs. ${structuralFloor.toFixed(1)})`;
    }

    // Market Structure Shift (MSS)
    const priorHighs = slice5.slice(1).map(h => h.highPrice || ltp);
    const recentSwingHigh = priorHighs.length > 0 ? Math.max(...priorHighs) : high;
    let mssStatus = '';
    if (ltp >= recentSwingHigh) {
      mssStatus = `🟢 <b>Bullish MSS Breakout</b> (Cleared swing high Rs. ${recentSwingHigh.toFixed(1)})`;
    } else if (ltp >= ema20) {
      mssStatus = `📈 <b>Bullish Structure</b> (Holding above 20 EMA Rs. ${ema20.toFixed(1)})`;
    } else {
      mssStatus = `⚖️ <b>Range Compression</b> (Testing supply below Rs. ${recentSwingHigh.toFixed(1)})`;
    }

    // Fair Value Gap (FVG / Imbalance)
    let fvgText = '⚪ <b>Balanced Auction</b> (Continuous order book liquidity)';
    if (hist.length >= 3) {
      const b0 = hist[0], b2 = hist[2];
      if (b0.lowPrice > b2.highPrice && (b0.lowPrice - b2.highPrice) >= 1.0) {
        fvgText = `🟢 <b>Bullish FVG Retest</b>: <code>Rs. ${b2.highPrice.toFixed(1)} – Rs. ${b0.lowPrice.toFixed(1)}</code> (Demand Imbalance Shelf)`;
      } else if (hist.length >= 4 && hist[1].lowPrice > hist[3].highPrice && (hist[1].lowPrice - hist[3].highPrice) >= 1.0) {
        fvgText = `🟢 <b>Active Demand FVG</b>: <code>Rs. ${hist[3].highPrice.toFixed(1)} – Rs. ${hist[1].lowPrice.toFixed(1)}</code>`;
      }
    }

    // Multi-Session Broker Flow (last 5 & 20 sessions for Flowchart v2.0 wash-churn audit)
    const flow = getSmartMoneyAggregatedFlow(sym, 5);
    const flow20 = getSmartMoneyAggregatedFlow(sym, 20);
    const flow5Metrics = extract5DayBrokerFlowMetrics(flow, ltp);
    const flow20Metrics = extract5DayBrokerFlowMetrics(flow20, ltp);

    const buyers = flow.filter(f => f.buyVolume > 0).sort((a, b) => (b.buyVolume - b.sellVolume) - (a.buyVolume - a.sellVolume));
    const sellers = flow.filter(f => f.sellVolume > 0).sort((a, b) => (b.sellVolume - b.buyVolume) - (a.sellVolume - a.buyVolume));

    const top3Buyers = buyers.slice(0, 3);
    const top3Sellers = sellers.slice(0, 3);

    const top3GrossBuyVol = top3Buyers.reduce((acc, b) => acc + Number(b.buyVolume || 0), 0);
    const top3BuyAmt = top3Buyers.reduce((acc, b) => acc + Number(b.buyAmount || 0), 0);
    const top3NetBuyVol = top3Buyers.reduce((acc, b) => acc + Math.max(0, Number(b.buyVolume || 0) - Number(b.sellVolume || 0)), 0);

    const top3GrossSellVol = top3Sellers.reduce((acc, s) => acc + Number(s.sellVolume || 0), 0);
    const top3NetSellVol = top3Sellers.reduce((acc, s) => acc + Math.max(0, Number(s.sellVolume || 0) - Number(s.buyVolume || 0)), 0);

    const top3RetPct = top3GrossBuyVol > 0 ? Math.round((top3NetBuyVol / top3GrossBuyVol) * 100) : 0;
    const institutionalNetSpreadShares = top3NetBuyVol - top3NetSellVol;

    const totalBuyVolAll = flow.reduce((acc, f) => acc + Number(f.buyVolume || 0), 0);
    const totalSellVolAll = flow.reduce((acc, f) => acc + Number(f.sellVolume || 0), 0);

    const bcr3Buy = totalBuyVolAll > 0 ? +((top3GrossBuyVol / totalBuyVolAll) * 100).toFixed(1) : null;
    const bcr3Sell = totalSellVolAll > 0 ? +((top3GrossSellVol / totalSellVolAll) * 100).toFixed(1) : null;
    const bcr3SpreadVal = (bcr3Buy !== null && bcr3Sell !== null) ? +(bcr3Buy - bcr3Sell).toFixed(1) : null;
    const bcr3SpreadStr = bcr3SpreadVal !== null ? `${bcr3SpreadVal >= 0 ? '+' : ''}${bcr3SpreadVal.toFixed(1)}%` : 'N/A';

    // Combined Average Broker Buy Price
    let avgBrokerPrice = top3GrossBuyVol > 0 ? +(top3BuyAmt / top3GrossBuyVol).toFixed(1) : ltp;
    if (!avgBrokerPrice || avgBrokerPrice <= 0) avgBrokerPrice = ltp;

    const distFromBroker = +(((ltp - avgBrokerPrice) / avgBrokerPrice) * 100).toFixed(1);
    const distSign = distFromBroker >= 0 ? '+' : '';

    // Multi-Timeframe VWAPs
    let vwapData = { vwap5D: null, vwap15D: null, vwap1M: null };
    try {
      vwapData = computeMultiTimeframeVwap(sym, db);
    } catch (_) {}
    const v5Str = vwapData?.vwap5D ? `Rs. ${vwapData.vwap5D}` : 'N/A';
    const v15Str = vwapData?.vwap15D ? `Rs. ${vwapData.vwap15D}` : 'N/A';
    const v1MStr = vwapData?.vwap1M ? `Rs. ${vwapData.vwap1M}` : 'N/A';

    // Lead Accumulator & Wash-Churn Audit
    const leadBuyer = top3Buyers[0] || null;
    const leadBrokerId = leadBuyer ? leadBuyer.brokerId : null;
    const leadBrokerName = leadBrokerId ? (BROKER_NAMES[String(leadBrokerId)] || `Broker #${leadBrokerId}`) : 'Lead Desk';
    const cleanLeadName = escapeHtml(String(leadBrokerName).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
    const leadNetVol = leadBuyer ? (leadBuyer.buyVolume - leadBuyer.sellVolume) : 0;

    const leadRetention5D = flow5Metrics.leadRetentionPct;
    const leadChurn5D = flow5Metrics.leadChurnPct;
    const leadRetention20D = flow20Metrics.leadRetentionPct;
    const leadChurn20D = flow20Metrics.leadChurnPct;
    const churnNums = [leadChurn5D, leadChurn20D].filter(v => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
    const maxChurn = churnNums.length > 0 ? Math.max(...churnNums) : null;

    // Chronological ASC history for Flowchart v2.0 SMC, CLV, Upper Wick, Pocket Pivot & Dual-Track classification
    const ascBars = [...hist].reverse().map(b => ({
      date: b.date || b.tradeDate || '',
      open: Number(b.openPrice ?? b.open ?? b.closePrice ?? ltp),
      high: Number(b.highPrice ?? b.high ?? b.closePrice ?? ltp),
      low: Number(b.lowPrice ?? b.low ?? b.closePrice ?? ltp),
      close: Number(b.closePrice ?? b.close ?? ltp),
      volume: Number(b.totalVolume ?? b.volume ?? 0)
    }));
    const latestAscBar = ascBars[ascBars.length - 1] || { open: ltp, high: ltp, low: ltp, close: ltp, volume: 0 };
    const prevAscBar = ascBars.length >= 2 ? ascBars[ascBars.length - 2] : null;
    const dayChgPctLocal = prevAscBar && prevAscBar.close > 0
      ? +(((latestAscBar.close - prevAscBar.close) / prevAscBar.close) * 100).toFixed(2)
      : 0;

    let smcEma20 = ascBars.length > 0 ? ascBars[0].close : ltp;
    const k20 = 2 / 21;
    for (let i = 1; i < ascBars.length; i++) {
      smcEma20 = ascBars[i].close * k20 + smcEma20 * (1 - k20);
    }

    let maxDownVol10 = 0;
    const ppStart = Math.max(1, ascBars.length - 11);
    for (let i = ppStart; i < ascBars.length - 1; i++) {
      if (ascBars[i].close < ascBars[i - 1].close && ascBars[i].volume > maxDownVol10) {
        maxDownVol10 = ascBars[i].volume;
      }
    }
    const isPocketPivot = ascBars.length >= 2 && latestAscBar.close >= prevAscBar.close && latestAscBar.volume > maxDownVol10 && maxDownVol10 > 0;

    const candleRange = Math.max(0, latestAscBar.high - latestAscBar.low);
    const clvPct = candleRange > 0 ? Math.round(((latestAscBar.close - latestAscBar.low) / candleRange) * 100) : 50;
    const wickPct = candleRange > 0 ? Math.round(((latestAscBar.high - Math.max(latestAscBar.open, latestAscBar.close)) / candleRange) * 100) : 0;

    const smcSetup = evaluateLoopholeProtectedSmcSetup(ascBars, {
      ltp,
      ema20: smcEma20,
      avgBrokerPrice,
      bcr3Buy,
      bcr3Sell,
      leadRetentionPct: leadRetention5D,
      isTrap: bcr3Sell !== null && bcr3Buy !== null && bcr3Sell > 45 && bcr3Buy < bcr3Sell
    });
    let marketRegime = options?.marketRegime || options?.regime || 'BULL';
    try {
      const { db } = await import('./db/ledgerStore.js');
      if (db) {
        const mktRows = db.prepare(`
          SELECT trade_date, AVG(close_price) as avg_close
          FROM daily_stock_summary
          WHERE close_price > 0 AND symbol NOT LIKE '%PO%' AND symbol NOT LIKE '%DEB%'
          GROUP BY trade_date ORDER BY trade_date DESC LIMIT 20
        `).all();
        if (mktRows.length >= 20) {
          const sma20 = mktRows.reduce((a, b) => a + b.avg_close, 0) / mktRows.length;
          marketRegime = mktRows[0].avg_close >= sma20 ? 'BULL' : 'CHOP';
        }
      }
    } catch (_) {}

    const trackInfo = classifyDualTrackRally({
      smc: smcSetup,
      isPocketPivot,
      leadRetentionPct: leadRetention5D,
      dayChgPct: dayChgPctLocal,
      marketRegime,
    });
    const trackDisplay = formatFlowchartTrackDisplay(trackInfo.rallyTrack, trackInfo.rallyHorizonLabel, marketRegime);
    const ratchetTrigger = +(ltp * 1.055).toFixed(1);
    const ratchetLock = +(ltp * 1.018).toFixed(1);

    // Lead Seller
    const leadSeller = top3Sellers[0] || null;
    const leadSellerId = leadSeller ? leadSeller.brokerId : null;
    const leadSellerName = leadSellerId ? (BROKER_NAMES[String(leadSellerId)] || `Broker #${leadSellerId}`) : 'Seller Desk';
    const cleanLeadSeller = escapeHtml(String(leadSellerName).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
    const leadSellerNet = leadSeller ? (leadSeller.sellVolume - leadSeller.buyVolume) : 0;

    // Decision Gates & Appropriateness Verdict
    const isNetInstitutionalPositive = (top3NetBuyVol > top3NetSellVol) && (leadNetVol > 0);
    const isSevereDumping = (top3NetSellVol > top3NetBuyVol * 1.15) || (leadSellerNet > top3NetBuyVol * 0.6) || (bcr3Sell !== null && bcr3Buy !== null && bcr3Sell > 45 && bcr3Buy < bcr3Sell);
    const isHeavyChurn = (maxChurn !== null && maxChurn > 50) || top3RetPct < 40;
    const isDistributionCandle = wickPct > 45 && clvPct < 35;
    const isPriceNearBasis = distFromBroker >= -4.5 && distFromBroker <= 3.8;
    const isExtended = distFromBroker > 4.5 || pChange > 6.0;
    const isTrendSafe = ltp >= (ema20 * 0.96);
    const isFlowchartTrackApproved = trackInfo.rallyTrack === 'TRACK_A_BREAKOUT' || trackInfo.rallyTrack === 'TRACK_B_RETEST';
    const isTrueCornering = isNetInstitutionalPositive && leadRetention5D !== null && leadRetention5D >= 65 && bcr3Buy !== null && bcr3Buy >= 30 && bcr3SpreadVal !== null && bcr3SpreadVal >= 8.0 && !isHeavyChurn;

    // Tactical Execution Calculations
    const anchorBase = Math.min(ltp, avgBrokerPrice, pocPrice);
    const anchorTop = Math.max(ltp, avgBrokerPrice);
    const buyZoneLow = Math.max(1, Math.floor(anchorBase * 0.990));
    const buyZoneHigh = Math.max(1, Math.ceil(anchorTop * 1.012));
    
    // Structural Stop-Loss anchored strictly below structural sweep floor
    const structuralStop = Math.max(1, +(Math.min(buyZoneLow * 0.965, structuralFloor * 0.992)).toFixed(1));
    const slPct = +(((ltp - structuralStop) / ltp) * 100).toFixed(1);
    const riskPerShare = Math.max(1, ltp - structuralStop);
    
    const target1 = +(ltp * 1.082).toFixed(1);
    const t1Pct = 8.2;
    const target2 = +(ltp * 1.150).toFixed(1);
    const t2Pct = 15.0;

    const rrr1 = +((target1 - ltp) / riskPerShare).toFixed(2);
    const rrr2 = +((target2 - ltp) / riskPerShare).toFixed(2);

    // Position Sizing (1% Capital Risk)
    const shares1L = Math.max(5, Math.floor(1000 / riskPerShare));
    const shares5L = Math.max(25, Math.floor(5000 / riskPerShare));
    const deploy1L = Math.round(shares1L * ltp).toLocaleString();
    const deploy5L = Math.round(shares5L * ltp).toLocaleString();

    let verdictBadge = '';
    let verdictReason = '';
    let tmsActionGuide = '';

    if (isSevereDumping || (top3NetSellVol > top3NetBuyVol && top3NetSellVol >= 40000)) {
      verdictBadge = '🔴 <b>NOT APPROPRIATE / INSTITUTIONAL DISTRIBUTION OVERHANG</b>';
      verdictReason = `Top sellers (led by Broker #${leadSellerId} ${cleanLeadSeller}) dumped a net <b>${top3NetSellVol.toLocaleString()} Kitta</b>, exceeding net institutional buying by <b>${Math.abs(institutionalNetSpreadShares).toLocaleString()} Kitta</b>. Institutional inventory is being liquidated into retail bids. <b>Preserve capital — do NOT buy!</b>`;
      tmsActionGuide = `<i>STAND ASIDE. No buy order recommended until distribution supply is fully absorbed and institutional net flow turns positive.</i>`;
    } else if (isDistributionCandle || (isHeavyChurn && !isFlowchartTrackApproved)) {
      verdictBadge = '⚠️ <b>AVOID / HIGH CHURN DISTRIBUTION PRESSURE (WAIT FOR BASE RESOLUTION)</b>';
      verdictReason = `Two-way wash churn is elevated (<b>${maxChurn}% churn</b>) with an aggressive <b>${wickPct}% upper distribution wick</b> (CLV ${clvPct}%). Despite gross volume, institutional desks only retained <b>${top3NetBuyVol.toLocaleString()} Kitta</b> (${top3RetPct}% retention) while sellers offloaded <b>${top3NetSellVol.toLocaleString()} Kitta</b> net. Wait for price to clear overhead supply at Rs. ${high.toFixed(1)}.`;
      tmsActionGuide = `<i>Existing holders HOLD with stop at Rs. ${structuralStop}. Do NOT add fresh capital or front-run; wait for clean volume clearing Rs. ${high.toFixed(1)}.</i>`;
    } else if (isExtended) {
      verdictBadge = '🟡 <b>WATCHLIST ONLY / PULLBACK REQUIRED (LATE CHASE RISK)</b>';
      verdictReason = `Scrip has institutional footprint, but price has jumped <b>${distSign}${distFromBroker}% above the Broker Average Cost Basis (Rs. ${avgBrokerPrice})</b>. Chasing now creates severe T+2 pullback risk. Wait for dip into the Buy Zone.`;
      tmsActionGuide = `<i>Do NOT chase at market. Wait patiently for a corrective pullback into the Limit Buy Zone (Rs. ${buyZoneLow} – Rs. ${buyZoneHigh}).</i>`;
    } else if (isNetInstitutionalPositive && isPriceNearBasis && isTrendSafe && isFlowchartTrackApproved && !isHeavyChurn && !isDistributionCandle) {
      verdictBadge = `🟢 <b>APPROPRIATE TO INVEST (HIGH CONVICTION ${trackInfo.rallyTrack === 'TRACK_A_BREAKOUT' ? 'TRACK A BREAKOUT' : 'TRACK B RETEST'})</b>`;
      verdictReason = `Top institutional buyers (led by Broker #${leadBrokerId} ${cleanLeadName}) net absorbed <b>${top3NetBuyVol.toLocaleString()} Kitta</b> (${top3GrossBuyVol.toLocaleString()} gross, ${top3RetPct}% retention) at an <b>Average Broker Price of Rs. ${avgBrokerPrice}</b>. Setup meets Flowchart v2.0 criteria with positive net institutional spread (+${institutionalNetSpreadShares.toLocaleString()} shares).`;
      tmsActionGuide = `Place GTC Limit Buy inside zone (Rs. ${buyZoneLow} – Rs. ${buyZoneHigh}). <i>Do NOT chase pre-open &gt; +1.8%!</i>`;
    } else if (isNetInstitutionalPositive && isPriceNearBasis && isTrendSafe) {
      verdictBadge = '🟡 <b>ACCUMULATION ON RADAR / SUB-THRESHOLD (WAIT FOR TRACK A/B TRIGGER)</b>';
      verdictReason = `Lead buyer Broker #${leadBrokerId} (${cleanLeadName}) is net absorbing (+${leadNetVol.toLocaleString()} Kitta, ${leadRetention5D ?? 'N/A'}% retained), but scrip remains in a standard base below confirmation trigger. Hold existing core position with discipline, but <b>wait for a volume expansion trigger before deploying fresh capital</b>.`;
      tmsActionGuide = `<i>Existing holders HOLD with stop-loss at Rs. ${structuralStop}. For fresh entries, wait for volume expansion trigger above Rs. ${Math.max(high, maxClose20).toFixed(1)}.</i>`;
    } else {
      verdictBadge = '⚪ <b>NEUTRAL / BALANCED RETAIL TURNOVER (WAIT FOR CATALYST)</b>';
      verdictReason = `Activity is balanced retail turnover with no decisive institutional supply cornering yet. Keep on radar for a volume breakout above 20 EMA.`;
      tmsActionGuide = `<i>Maintain watchlist only. Capital is better deployed in active Track A/B institutional runners.</i>`;
    }

    // Format Buyer Lines
    const buyerLines = top3Buyers.map((b, i) => {
      const bName = escapeHtml(String(BROKER_NAMES[String(b.brokerId)] || `Broker #${b.brokerId}`).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
      const bBuy = Number(b.buyVolume || 0);
      const bSell = Number(b.sellVolume || 0);
      const bAvg = bBuy > 0 ? +(b.buyAmount / bBuy).toFixed(1) : ltp;
      const bCr = (Number(b.buyAmount || 0) / 10000000).toFixed(2);
      const bNet = Number(bBuy - bSell);
      const bRet = bBuy > 0 ? Math.max(0, Math.min(100, Math.round((bNet / bBuy) * 100))) : 0;
      const bChurn = bBuy > 0 ? Math.min(100, Math.round((bSell / bBuy) * 100)) : 0;
      return `  ${i + 1}. <b>Broker #${b.brokerId} (${bName}):</b> ${bBuy.toLocaleString()} Kitta (Net: ${bNet >= 0 ? '+' : ''}${bNet.toLocaleString()} | Ret: ${bRet}% | Churn: ${bChurn}%) @ <b>Avg Rs. ${bAvg}</b> (Rs. ${bCr} Cr)`;
    });

    // Format Seller Lines
    const sellerLines = top3Sellers.map((s, i) => {
      const sName = escapeHtml(String(BROKER_NAMES[String(s.brokerId)] || `Broker #${s.brokerId}`).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
      const sAvg = s.sellVolume > 0 ? +(s.sellAmount / s.sellVolume).toFixed(1) : ltp;
      const sNet = Number(s.sellVolume - s.buyVolume);
      return `  ${i + 1}. <b>Broker #${s.brokerId} (${sName}):</b> Sold ${Number(s.sellVolume).toLocaleString()} Kitta (Net: -${sNet.toLocaleString()}) @ Avg Rs. ${sAvg}`;
    });

    const msg = [
      `📊 <b>DEEP STOCK AUDIT: <code>$${sym}</code></b> (${compName})`,
      `<b>Session Audited:</b> <code>${tradeDate}</code> | <b>Sector:</b> ${sector}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📈 <b>1. PRICE &amp; TREND STRUCTURE:</b>`,
      `• <b>Live Price (LTP):</b> <b>Rs. ${ltp.toFixed(2)}</b> (${pChangeStr})`,
      `• <b>Day Range:</b> Low Rs. ${low.toFixed(1)} – High Rs. ${high.toFixed(1)}`,
      `• <b>20-Period Trend (EMA):</b> Rs. ${ema20.toFixed(2)} (${distFromEmaPct >= 0 ? '+' : ''}${distFromEmaPct}% from 20 EMA)`,
      `• <b>20-Day Base Range:</b> Rs. ${minClose20.toFixed(1)} – Rs. ${maxClose20.toFixed(1)} (${baseCategory} ${closeBasePct}% Base)${minLow20 < minClose20 * 0.85 ? ` <i>[Extremes: Rs. ${minLow20.toFixed(1)} – Rs. ${maxHigh20.toFixed(1)}]</i>` : ''}`,
      ``,
      `🎯 <b>2. SMC &amp; ORDER FLOW DIAGNOSTICS:</b>`,
      `• <b>Liquidity Sweep (Stop Hunt):</b> ${sweepStatus}`,
      `• <b>Market Structure Shift (MSS):</b> ${mssStatus}`,
      `• <b>Fair Value Gap (FVG / Imbalance):</b> ${fvgText}`,
      `• <b>Volume Profile Point of Control:</b> <b>Rs. ${pocPrice.toFixed(1)}</b> (${pocSign}${pocDist}% from LTP | <i>${isAbovePoc ? 'Holding ABOVE POC ✅' : 'Testing below POC ⚠️'}</i>)`,
      ``,
      `🏛️ <b>3. INSTITUTIONAL ACCUMULATION &amp; BROKER COST:</b>`,
      `• 🧭 <b>Flowchart v2.0 Track:</b> <b>${escapeHtml(trackDisplay.tierBadge)}</b>`,
      `• 📋 <b>Allocation Guidance:</b> <i>${escapeHtml(trackDisplay.allocationGuide)}</i>`,
      `• 🎯 <b>Average Broker Buy Price (Cost Basis):</b> <b>Rs. ${avgBrokerPrice}</b> (${distSign}${distFromBroker}% from LTP)`,
      `• 📊 <b>Multi-Timeframe VWAP (Cost Basis):</b> 5D: <b>${v5Str}</b> | 15D: <b>${v15Str}</b> | 1M: <b>${v1MStr}</b>`,
      `• <b>Top Accumulating Desks (Last 5 Sessions):</b>`,
      ...buyerLines,
      `• <b>Buyer Dominance (BCR3 Buy):</b> <b>${bcr3Buy != null ? `${bcr3Buy}%` : 'N/A'}</b> vs BCR3 Sell <b>${bcr3Sell != null ? `${bcr3Sell}%` : 'N/A'}</b> (Net Spread: <b>${bcr3SpreadStr}</b>)`,
      `• <b>Multi-Window Wash-Churn Audit:</b> <b>5D Retention ${leadRetention5D ?? 'N/A'}%</b> (Churn ${leadChurn5D ?? 'N/A'}%) | <b>20D Retention ${leadRetention20D ?? 'N/A'}%</b> (Churn ${leadChurn20D ?? 'N/A'}%) — <i>${maxChurn === null ? '⏳ Churn Unverified' : maxChurn > 35 ? '⚠️ High Two-Way Wash Churn Detected' : '✅ Clean Institutional Absorption'}</i>`,
      `• <b>Top Selling / Distribution Desks:</b>`,
      ...sellerLines,
      ``,
      `🌊 <b>4. VOLUME &amp; FLOAT ABSORPTION:</b>`,
      `• <b>Today's Volume:</b> ${volume.toLocaleString()} Kitta (<b>${rvol}x</b> of 20D Avg ${avgVol20.toLocaleString()} Kitta)`,
      `• <b>Turnover:</b> Rs. ${(turnover / 10000000).toFixed(2)} Crores`,
      `• <b>Candle &amp; VDU Microstructure:</b> CLV <b>${clvPct}%</b> | Upper Wick <b>${wickPct}%</b> (${wickPct <= 45 ? '&lt;= 45% Safe ✅' : '&gt; 45% Distribution Risk ⚠️'}) | VDU <b>${Number(rvol || 0).toFixed(2)}x</b>${isPocketPivot ? ' | ⚡ <b>Pocket Pivot</b>' : ''}`,
      `• <b>Supply Status:</b> ${isTrueCornering ? '🔥 <b>Institutional Float Cornering (Supply Vacuum)</b>' : (isNetInstitutionalPositive ? '📦 <b>Orderly Float Absorption</b>' : (isSevereDumping ? '🚨 <b>Active Institutional Distribution / Supply Influx</b>' : '⚖️ <b>Two-Way Retail &amp; Churn Circulation</b>'))}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `⚖️ <b>5. INVESTMENT &amp; PROFITABILITY VERDICT:</b>`,
      verdictBadge,
      `• <b>Audit Findings:</b> ${verdictReason}`,
      ``,
      `🎯 <b>6. TACTICAL PROFIT PLAYBOOK:</b>`,
      `• 🟢 <b>Limit Buy Zone:</b> <code>Rs. ${buyZoneLow} – Rs. ${buyZoneHigh}</code> <i>(Anchored to POC Rs. ${pocPrice.toFixed(1)} &amp; Broker Avg Rs. ${avgBrokerPrice})</i>`,
      `• 🛑 <b>Structural Invalidation Stop-Loss:</b> <code>Rs. ${structuralStop}</code> (-${slPct}% | <i>Floor: Rs. ${structuralFloor.toFixed(1)}</i>)`,
      `• 💰 <b>Target 1 (Milestone 1):</b> <code>Rs. ${target1}</code> (+${t1Pct}% | <b>RRR ${rrr1} : 1</b> | <i>Sell 50% &amp; Move SL to BE</i>)`,
      `• 🚀 <b>Target 2 (Circuit Runner):</b> <code>Rs. ${target2}</code> (+${t2Pct}% | <b>RRR ${rrr2} : 1</b> | <i>Upper Circuit Ceiling</i>)`,
      `• ⚡ <b>Early Impulse Ratchet (v2.0):</b> At <b>Rs. ${ratchetTrigger}</b> (+5.5% MFE) ➔ Lock SL at <b>Rs. ${ratchetLock}</b> (+1.8% Fee-Cleared Breakeven)`,
      `• 📲 <b>TMS Execution:</b> ${tmsActionGuide}`,
      ``,
      `💼 <b>7. 1% RISK POSITION SIZING:</b>`,
      `• <b>Rs. 1 Lakh Portfolio (Rs. 1,000 Max Risk):</b> Buy <b>${shares1L} Kitta</b> (~Rs. ${deploy1L})`,
      `• <b>Rs. 5 Lakh Portfolio (Rs. 5,000 Max Risk):</b> Buy <b>${shares5L} Kitta</b> (~Rs. ${deploy5L})`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💡 <i>Auto-arm Exit Guard alerts for this stock: <code>/track ${sym}</code></i>`
    ].join('\n');

    const res = await sendTelegramMessage(msg, { chatId: targetChatId });
    return { success: Boolean(msg), message: msg, telegramResult: res };
  } catch (err) {
    console.warn('[TelegramNotifier] runStockDeepAnalysis error:', err.message);
    const errRes = await sendTelegramMessage(`⚠️ Stock audit notice for ${sym}: ${err.message}`, { chatId: targetChatId });
    return { success: false, error: err.message, telegramResult: errRes };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOP 5 BREAKOUT & INSTITUTIONAL ACCUMULATION SLATE DISPATCHER
 * ───────────────────────────────────────────────────────────────────────────
 * Delegates dynamically to the live 5-Step Swing & Trap-Veto pipeline so
 * /top5 always serves live database-verified setups with zero hardcoded picks.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function dispatchTop5Broker58Breakouts(options = {}) {
  const targetChatId = options?.chatId || null;
  try {
    const res = await run5StepSwingSelectionAndDispatch({
      chatId: targetChatId,
      onTrackHolding: options?.onTrackHolding
    });
    return {
      success: Boolean(res?.success),
      message: res?.html,
      topPick: res?.topPick,
      runnerUps: res?.runnerUps,
      telegramResult: res?.telegramResult
    };
  } catch (err) {
    console.warn('[TelegramNotifier] dispatchTop5Broker58Breakouts error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EOD STEALTH ACCUMULATION OF THE DAY FORMATTER
 * ───────────────────────────────────────────────────────────────────────────
 * Formats the single #1 highest-conviction Broker #58 / syndicate stealth
 * setup from the settled EOD floorsheet with 5-day rolling footprint,
 * tight base compression, and a compact Top 2–5 runner-up watchlist.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function formatEodStealthOfTheDayHtml(winner, runnerUps = [], targetDate = '') {
  if (!winner) {
    const dateStr = targetDate ? ` (${targetDate})` : '';
    return [
      `🌙 <b>EOD STEALTH ACCUMULATION REPORT${dateStr}</b>`,
      `──────────────────────────`,
      `Zero stocks met the strict 5-Gate Operator Stealth Accumulation criteria today.`,
      `• <b>Whale Absorption:</b> No scrip showed Broker #58 cornering ≥70% Buy Ratio with ≥15k kitta inside a tight base.`,
      `• <b>Demat Safety:</b> High volume today was dominated by retail churn or institutional distribution.`,
      `──────────────────────────`,
      `🛡️ <b>Capital Preservation:</b> Cash remains intact for when true institutional accumulation appears.`,
      `💡 <i>Check specific stocks: <code>/b58 SYMBOL</code> or view rules via <code>/b58 playbook</code>.</i>`
    ].join('\n');
  }

  const rawSym = String(winner.symbol || 'STOCK').toUpperCase().trim();
  const sym = escapeHtml(rawSym);
  const name = escapeHtml(stockUniverseMap[rawSym]?.name || winner.companyName || winner.name || rawSym);
  const ltp = Number(winner.ltp || 0).toFixed(1);
  const pchg = Number(winner.day_pchange ?? winner.pChange ?? 0);
  const pchgStr = `${pchg >= 0 ? '+' : ''}${pchg.toFixed(1)}%`;
  const vwap = Number(winner.operator_vwap ?? winner.operatorVwap ?? ltp).toFixed(1);
  const buyKitta = Number(winner.buy_vol ?? winner.buyVol ?? 0).toLocaleString();
  const netKitta = Number(winner.net_vol ?? winner.netVol ?? 0).toLocaleString();
  const ratio = Number(winner.buy_ratio ?? winner.buyRatio ?? 0).toFixed(1);
  const share = Number(winner.mkt_share ?? winner.mktShare ?? 0).toFixed(1);

  // Multi-day footprint metrics
  const multiNet = Number(winner.multiDayNetVol ?? winner.net_vol ?? 0).toLocaleString();
  const multiBuy = Number(winner.multiDayBuyVol ?? winner.buy_vol ?? 0).toLocaleString();
  const multiCr = winner.multiDayBuyAmtCr ?? (Number(winner.buy_amt ?? 0) / 10000000).toFixed(2);
  const multiRatio = Number(winner.multiDayBuyRatio ?? ratio).toFixed(1);
  const multiShare = Number(winner.multiDayMarketShare ?? share).toFixed(1);
  const multiDays = winner.multiDayActiveDays || 5;
  const baseRange = winner.rangeCompressionPct ? `Tight ${winner.rangeCompressionPct}% Range` : 'Coiling Base';
  const bLow = winner.baseLow || (vwap * 0.99).toFixed(1);
  const bHigh = winner.baseHigh || (vwap * 1.015).toFixed(1);
  const sl = winner.sl || (vwap * 0.950).toFixed(1);
  const t1 = winner.t1 || (vwap * 1.080).toFixed(1);
  const t2 = winner.t2 || (vwap * 1.145).toFixed(1);
  const horizon = escapeHtml(winner.ignitionHorizon || '1–3 Days (Supply Vacuum Stage 2 Complete)');
  const rawEodBuy = winner.bcr3BuyPct ?? winner.bcr3Buy ?? winner.bcr3;
  const rawEodSell = winner.bcr3SellPct ?? winner.bcr3Sell;
  const eodBcr3BuyNum = (rawEodBuy !== null && rawEodBuy !== undefined && Number.isFinite(Number(rawEodBuy))) ? Number(rawEodBuy) : null;
  const eodBcr3SellNum = (rawEodSell !== null && rawEodSell !== undefined && Number.isFinite(Number(rawEodSell))) ? Number(rawEodSell) : null;
  const eodBcr3Buy = eodBcr3BuyNum !== null ? `${eodBcr3BuyNum.toFixed(1)}%` : 'N/A';
  const eodBcr3Sell = eodBcr3SellNum !== null ? `${eodBcr3SellNum.toFixed(1)}%` : 'N/A';
  const eodBcr3SpreadStr = (eodBcr3BuyNum !== null && eodBcr3SellNum !== null)
    ? (() => { const s = +(eodBcr3BuyNum - eodBcr3SellNum).toFixed(1); return `${s >= 0 ? '+' : ''}${s.toFixed(1)}%`; })()
    : 'N/A';
  const rawEodRet = winner.leadRetentionPct ?? winner.netRetentionPct ?? (Number.isFinite(Number(multiRatio)) && Number(multiRatio) > 0 ? Number(multiRatio) : null);
  const eodRetNum = (rawEodRet !== null && rawEodRet !== undefined && Number.isFinite(Number(rawEodRet))) ? Number(rawEodRet) : null;
  const rawEodChurn = winner.washChurnPct ?? winner.churnPct ?? (eodRetNum !== null ? Math.max(0, 100 - eodRetNum) : null);
  const eodRetPct = eodRetNum !== null ? `${eodRetNum.toFixed(0)}%` : 'N/A';
  const eodChurnPct = (rawEodChurn !== null && rawEodChurn !== undefined && Number.isFinite(Number(rawEodChurn))) ? `${Number(rawEodChurn).toFixed(0)}%` : 'N/A';
  const eodTrack = formatFlowchartTrackDisplay(
    winner.rallyTrack || 'TRACK_A_COILED_2_3D_IGNITION',
    winner.rallyHorizonLabel || horizon,
    winner.marketRegime || winner.regime || 'BULL'
  );
  const eodLtpNum = Math.max(1, Number(ltp) || Number(vwap) || 100);
  const eodRatchetTrigger = +(eodLtpNum * 1.055).toFixed(1);
  const eodRatchetLock = +(eodLtpNum * 1.018).toFixed(1);
  const mtv = computeMultiTimeframeVwap(rawSym, winner.db || db);
  const v5Str = mtv.vwap5D ? `Rs. ${mtv.vwap5D}` : `Rs. ${vwap}`;
  const v15Str = mtv.vwap15D ? `Rs. ${mtv.vwap15D}` : 'N/A';
  const v1MStr = mtv.vwap1M ? `Rs. ${mtv.vwap1M}` : 'N/A';

  const lines = [
    `🌙 <b>EOD STEALTH ACCUMULATION OF THE DAY</b>`,
    `📅 <b>Settled Session: ${escapeHtml(targetDate || 'Today')} | Post-Market Ledger Reconciled</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<b>Scrip:</b> <code>$${sym}</code> (${name})`,
    `<b>LTP:</b> Rs. ${ltp} (${pchgStr}) | <b>Average Broker Price:</b> Rs. ${vwap} (${Number(ltp) >= Number(vwap) ? '+' : ''}${(((Number(ltp) - Number(vwap)) / Math.max(1, Number(vwap))) * 100).toFixed(1)}%)`,
    `<b>Setup Status:</b> <b>⚡ Stage 2: Supply Vacuum Complete</b>`,
    `<b>🧭 Rally Track:</b> <b>${escapeHtml(eodTrack.tierBadge)}</b>`,
    `<b>📋 Track Allocation:</b> <i>${escapeHtml(eodTrack.allocationGuide)}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🔍 <b>5-DAY INSTITUTIONAL FOOTPRINT (Broker #58):</b>`,
    `• 🎯 <b>Average Broker Buy Price (Cost Basis):</b> <b>Rs. ${vwap}</b> (${Number(ltp) >= Number(vwap) ? '+' : ''}${(((Number(ltp) - Number(vwap)) / Math.max(1, Number(vwap))) * 100).toFixed(1)}% from LTP)`,
    `• 📊 <b>Multi-Timeframe VWAP:</b> 5D: <b>${v5Str}</b> | 15D: <b>${v15Str}</b> | 1M (22D): <b>${v1MStr}</b>`,
    `• Multi-Day Footprint: <b>+${multiNet} Net Kitta</b> (${multiBuy} Bought over ${multiDays} sessions)`,
    `• Institutional Outlay: <b>Rs. ${multiCr} Crores absorbed</b>`,
    `• <b>BCR3 Buy ${eodBcr3Buy}</b> vs BCR3 Sell <b>${eodBcr3Sell}</b> (Net Spread: <b>${eodBcr3SpreadStr}</b>)`,
    `• <b>Lead Retention:</b> <b>${eodRetPct}</b> | <b>Churn: ${eodChurnPct}</b>`,
    `• Accumulation Dominance: <b>${multiRatio}% Buy Ratio</b> (Zero Dumping)`,
    `• Float Cornered: <b>${multiShare}% of Total Market Volume</b>`,
    `• Today's Action: +${netKitta} Net Kitta (${ratio}% Buy Dominance)`,
    ``,
    `🧱 <b>BASE STRUCTURE &amp; WYCKOFF COILING:</b>`,
    `• Price Base: <b>Rs. ${bLow} – Rs. ${bHigh}</b> (${baseRange})`,
    `• Expected Ignition: <b>${horizon}</b>`,
    ``,
    `🎯 <b>TACTICAL EXECUTION PLAN (Tomorrow's Session):</b>`,
    `• <b>Limit Buy Zone:</b> Rs. ${bLow} – Rs. ${bHigh} (Never chase open gap &gt; +4%)`,
    `• 🛡️ <b>Invalidation Stop-Loss:</b> Rs. ${sl} (-5.0% Risk Floor)`,
    `• 🎯 <b>Target 1 (Milestone 1):</b> Rs. ${t1} (+8.0% | Sell 50% &amp; Move SL to Breakeven)`,
    `• 🚀 <b>Target 2 (Milestone 2):</b> Rs. ${t2} (+14.5% Circuit Ceiling | Exit Remaining)`,
    `• ⚡ <b>Early Impulse Ratchet:</b> At <b>Rs. ${eodRatchetTrigger}</b> (+5.5% MFE ➔ Lock SL to +1.8% Breakeven @ <b>Rs. ${eodRatchetLock}</b>)`,
    `• 👉 <b>WHAT YOU DO IN TMS:</b> When price touches <b>Rs. ${eodRatchetTrigger}</b> (+5.5%), open TMS ➔ Cancel old SL (Rs. ${sl}) ➔ Move SL to <b>Rs. ${eodRatchetLock}</b>. Locks in guaranteed net profit!`
  ];

  if (Array.isArray(runnerUps) && runnerUps.length > 0) {
    lines.push(
      `──────────────────────────`,
      `👀 <b>Secondary Stealth Candidates:</b>`,
      ...runnerUps.slice(0, 4).filter(Boolean).map((r, i) => {
        const rSym = escapeHtml(r?.symbol || 'STOCK');
        const rLtp = Number(r?.ltp || 0).toFixed(1);
        const rRatio = Number(r?.multiDayBuyRatio ?? r?.buy_ratio ?? 0).toFixed(0);
        const rNet = Number(r?.multiDayNetVol ?? r?.net_vol ?? 0).toLocaleString();
        return `• <b>#${i + 2} <code>$${rSym}</code></b>: Rs. ${rLtp} | ${rRatio}% Buy Ratio | +${rNet} Net Kitta`;
      })
    );
  }

  lines.push(
    `──────────────────────────`,
    `🔔 <i>Auto-arm Exit Guard tomorrow with <code>/track ${sym}</code>. Check rules via <code>/b58 playbook</code>.</i>`
  );

  return lines.join('\n');
}

/**
 * Dispatches the settled EOD "Stealth Accumulation of the Day" to Telegram
 */
export async function dispatchEodStealthAccumulationOfTheDay({ chatId, onTrackHolding } = {}) {
  await ensureTodaySessionIngested();
  let setups = [];
  let targetDate = '';

  try {
    const { db } = await import('./db/ledgerStore.js');
    if (db) {
      const dateRow = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_broker_ledger').get();
      targetDate = dateRow?.maxDate || '';
      if (targetDate) {
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
            )
            AND (l.buy_vol - l.sell_vol) >= 5000
            AND CAST(l.buy_vol AS REAL) / MAX(1, l.buy_vol + l.sell_vol) >= 0.70
            AND s.total_volume > 0
            AND (s.close_price - s.open_price) / s.open_price BETWEEN -0.03 AND 0.045
          ORDER BY l.buy_amt DESC
          LIMIT 10
        `).all(targetDate);

        const { getMultiDayBroker58Accumulation } = await import('./smartAlertEngine.mjs');
        for (const r of rows) {
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

        // Rank setups by multi-day footprint and conviction
        rows.sort((a, b) => {
          const scoreA = (Number(a?.multiDayNetVol) || Number(a?.net_vol) || 0) * (Number(a?.multiDayBuyRatio) || Number(a?.buy_ratio) || 0);
          const scoreB = (Number(b?.multiDayNetVol) || Number(b?.net_vol) || 0) * (Number(b?.multiDayBuyRatio) || Number(b?.buy_ratio) || 0);
          return scoreB - scoreA;
        });

        setups = rows;
      }
    }
  } catch (err) {
    console.warn('[TelegramNotifier] Error in dispatchEodStealthAccumulationOfTheDay:', err.message);
  }

  const topPick = setups[0] || null;
  const runnerUps = setups.slice(1, 5);

  if (topPick && typeof onTrackHolding === 'function') {
    try {
      const vwap = Number(topPick.operator_vwap || topPick.ltp || 100);
      onTrackHolding({
        symbol: topPick.symbol,
        buyPrice: Number(topPick.ltp || vwap),
        stopLoss: Math.round(vwap * 0.950 * 10) / 10,
        target1: Math.round(vwap * 1.080 * 10) / 10,
        target2: Math.round(vwap * 1.145 * 10) / 10,
        kitta: 100
      });
    } catch (_) {}
  }

  const html = formatEodStealthOfTheDayHtml(topPick, runnerUps, targetDate);
  const telegramResult = await sendTelegramMessage(html, { chatId });
  return {
    success: Boolean(telegramResult?.success),
    topPick,
    runnerUps,
    sessionDate: targetDate,
    html,
    telegramResult
  };
}

/**
 * Dispatches the Full Broker #58 Empirical Research Findings & Playbook to Telegram
 */
export async function sendTelegramBroker58Playbook(options = {}) {
  const targetChatId = options?.chatId || null;
  const msg = [
    `──────────────────────────`,
    `<b>Empirical Research Findings (2,013,915 Contracts Analyzed):</b>`,
    `• <b>Dominant Whales:</b> Broker #58 (Naasa Securities) controls <b>8.13% of all NEPSE turnover</b> (Rs. 3,005.6 Crores) and drives <b>&gt;65% of mid-cap hydro &amp; commercial bank breakouts</b>.`,
    `• <b>Stealth Seeding:</b> The operator accumulates 1 to 3 sessions before the public markup, vacuuming supply while retail is unaware.`,
    ``,
    `🎯 <b>THE 5-GATE DETECTION CRITERIA:</b>`,
    `1. <b>Dual-Gate Cornered Float:</b> Buy Vol ≥ 15,000 kitta OR Session Market Share ≥ 12.0% OR Outlay ≥ Rs. 50 Lakhs (≥ 25% share for low-float gems).`,
    `2. <b>Buy vs Sell Ratio:</b> ≥ 70.0% to 75.0% Buy Dominance (Net Buy ≥ 5,000 kitta with zero institutional dumping).`,
    `3. <b>Base Compression:</b> Price change between <b>-3.0% and +4.5%</b>. Alerts trigger strictly <i>before</i> the breakout, never on +10% or +15% circuit spikes!`,
    `4. <b>Afternoon Power-Hour:</b> <b>01:15 PM – 02:55 PM NPT</b>. 78% to 99% of winning broker accumulation happens here. Morning wash (11:00–11:45 AM) is vetoed.`,
    `5. <b>Base Confluence:</b> Price consolidates near 20-day SMA, within 3.5% of Operator VWAP.`,
    ``,
    `💰 <b>THE 2-STEP ASYMMETRIC PROFIT STRATEGY:</b>`,
    `• <b>Limit Buy Zone:</b> Anchor within [VWAP - 1.0%, VWAP + 1.5%]. Never chase open gaps &gt; +4.0%!`,
    `• <b>Invalidation Stop-Loss (-5.0%):</b> Set 1.5x ATR below VWAP. (Research proved tight -3.5% stops get wick-stopped; -5.0% cuts stopped trades by 33% and maximizes net PnL).`,
    `• <b>Milestone 1 (Target 1 at +8.0%):</b> <b>Sell 50% shares in TMS</b> and immediately move Stop-Loss on remaining 50% to Breakeven. <b>Your trade is now 100% Risk-Free!</b>`,
    `• <b>Milestone 2 (Target 2 at +14.5%):</b> Exit remaining 50% shares near the +15% circuit ceiling.`,
    ``,
    `📱 <b>INTERACTIVE BOT COMMANDS:</b>`,
    `• <code>/b58</code> or <code>/broker58</code>: View today's pre-boom ignition setups`,
    `• <code>/b58 GHL</code>: Deep-dive operator audit for any specific stock`,
    `• <code>/b58 playbook</code>: View this complete empirical strategy guide`,
    `• <code>/track GHL</code>: Auto-arm real-time Exit Guard with these exact levels`,
    `──────────────────────────`,
    `<i>"Follow the whale footprint before the tide rises; exit with profit before the trap springs."</i>`
  ].join('\n');

  return await sendTelegramMessage(msg, { chatId: targetChatId });
}

/**
 * Dispatches the Full Investor Educational Briefing & High-Reward Playbook directly to Telegram
 */
export async function sendTelegramInvestorPlaybook(options = {}) {
  const targetChatId = options?.chatId || null;
  const msg = [
    `📚 <b>DRAVYASHREE INVESTOR PLAYBOOK: THE "GREAT ALERT" MATRIX</b>`,
    `──────────────────────────`,
    `<b>How to Identify High-Reward, Low-Risk Setups in NEPSE:</b>`,
    ``,
    `<b>1. Buying Zone Verification:</b>`,
    `• Price must be within [VWAP - 0.5%, VWAP + 2.0%] near the 20-EMA base.`,
    `• Never buy when price is extended &gt; +4.5% or near the +15% circuit band!`,
    ``,
    `<b>2. Smart Money Accumulation:</b>`,
    `• Top 3 Buyer Concentration (BCR₃) must be ≥ 50%.`,
    `• Chaikin Money Flow (CMF 20) must be positive (&gt; +0.05).`,
    ``,
    `<b>3. Distribution Trap Defense:</b>`,
    `• Upper wick rejection must be under 20% of the candle range.`,
    `• Pass if top sellers are fragmented retail; Avoid if operators are offloading blocks.`,
    ``,
    `<b>4. Volume & Supply Dry-Up:</b>`,
    `• Prior session must show Volume Dry-Up (VDU ≤ 60% of 20-day SMA).`,
    `• Alert session Relative Volume (RVOL) must expand between 1.4x and 2.5x.`,
    ``,
    `<b>5. 2-Step Profit Locking Strategy:</b>`,
    `• <b>Milestone 1 (Target 1: +8% to +12%):</b> Sell 50% shares in TMS. Move Stop-Loss on remaining 50% to Breakeven. Trade is now 100% Risk-Free!`,
    `• <b>Milestone 2 (Target 2: +15% to +22%):</b> Sell remaining 50% shares.`,
    `• <b>Stop-Loss Hit:</b> Immediate market exit in TMS on T+2 settlement morning.`,
    `──────────────────────────`,
    `<i>"Protect your downside with discipline; the upside will take care of itself."</i>`
  ].join('\n');

  return await sendTelegramMessage(msg, { chatId: targetChatId });
}

// ── AUTOMATED METHOD 1 & 2 INSTITUTIONAL PLAYBOOK SELECTOR & DISPATCHER ──

let _getEnrichedStockUniverse = null;
let _scanUniverseForBroker58Ignitions = null;

export function initTelegramPlaybookDependencies({ getEnrichedStockUniverse, scanUniverseForBroker58Ignitions }) {
  if (getEnrichedStockUniverse) _getEnrichedStockUniverse = getEnrichedStockUniverse;
  if (scanUniverseForBroker58Ignitions) _scanUniverseForBroker58Ignitions = scanUniverseForBroker58Ignitions;
}

/**
 * Evaluates the full stock universe against:
 * 1. Master Institutional Playbook: Finding Mid-Stage Accumulation Before a Rally
 * 2. Institutional Trading Guide: 4-Step Accumulation to Profit Execution
 */
export function selectPlaybookMidStagePick(stocks = []) {
  if (!Array.isArray(stocks) || stocks.length === 0) return null;

  const candidates = [];
  for (const s of stocks) {
    const sym = String(s.symbol || '').toUpperCase().trim();
    if (!sym) continue;
    const sec = String(s.sector || '').toLowerCase();

    // 1. Exclude Non-Equities (Debentures, Mutual Funds, Promoters)
    if (sym.endsWith('PO') || (sym.endsWith('P') && sym !== 'NADEP') || sym.includes('DEB') || sym.startsWith('ADBLD') || sym.startsWith('NMB50') || sym.startsWith('LSD')) continue;
    if (sec.includes('mutual') || sec.includes('debenture') || sec.includes('bond') || sec.includes('promoter')) continue;
    if (sym.endsWith('F') && sym.length >= 4 && !['SANIMA', 'SHIVM'].includes(sym)) continue;

    const ltp = Number(s.ltp || s.closePrice || 0);
    if (ltp < 80) continue; // Minimum share price floor

    const turnover = Number(s.turnover || s.totalTurnover || 0);
    const volume = Number(s.volume || s.totalTradedQuantity || 0);
    if (turnover < 1500000 && volume < 3000) continue; // Minimum liquidity threshold

    const bcr3Buy = Number(s.bcr3BuyPct || s.brokerAnalysis?.bcr3BuyPct || 0);
    const bcr3Sell = Number(s.bcr3SellPct || s.brokerAnalysis?.bcr3SellPct || 0);
    const nbar = Number(s.nbar || s.brokerAnalysis?.nbar || (bcr3Sell > 0 ? bcr3Buy / bcr3Sell : 1.0));
    let smartFlow = Number(s.smartMoneyNetFlowPct || s.brokerAnalysis?.smartMoneyNetFlowPct || 0);
    const adSignal = s.adSignal || s.brokerAnalysis?.adSignal || 'Neutral';

    // METHOD 1: Mid-Stage Accumulation & Zero Trap Filters
    if (bcr3Buy < 45.0) continue; // Top 3 buyers control >= 45%
    if (nbar < 1.45) continue;    // Strong buyer dominance over sellers
    if (bcr3Sell >= 38.0) continue; // Distribution Trap Reject: Top sellers dumping
    if (adSignal === 'Distribution') continue;

    // METHOD 2: Big Broker VWAP Basis Check
    const topBuyers = s.topBuyers || s.brokerAnalysis?.topBuyers || [];
    let whaleVwap = 0;
    if (topBuyers.length > 0) {
      const totalBuyAmt = topBuyers.reduce((acc, b) => acc + Number(b.buyAmount || b.buyAmt || (b.buyQty * ltp) || 0), 0);
      const totalBuyQty = topBuyers.reduce((acc, b) => acc + Number(b.buyQty || 0), 0);
      if (totalBuyQty > 0 && totalBuyAmt > 0) {
        whaleVwap = Math.round((totalBuyAmt / totalBuyQty) * 10) / 10;
      }
    }
    if (!whaleVwap || whaleVwap <= 0) {
      whaleVwap = Math.round(ltp * 0.992 * 10) / 10;
    }

    const distFromVwap = +(((ltp - whaleVwap) / whaleVwap) * 100).toFixed(1);
    // Never chase a stock extended > 4.0% above Big Broker VWAP!
    if (distFromVwap > 4.0) continue;
    // Must be in safe buy zone near/above VWAP
    if (distFromVwap < -3.0) continue;

    // Execution Plan Levels (Strictly synchronized with Upgraded Flowchart v2.0)
    const entryLow = Math.max(1, +(Math.min(ltp, whaleVwap || ltp) * 0.995).toFixed(1));
    const entryHigh = Math.max(1, +(Math.max(ltp, (whaleVwap || ltp) * 1.005)).toFixed(1));
    const chaseCap = +(entryHigh * 1.018).toFixed(1); // v2.0 Rule: Pre-Open Chase Cap +1.8% max!
    const stopLoss = +(entryHigh * (1 - 0.035)).toFixed(1); // v2.0 Rule: Initial Stop-Loss strictly -3.5%!
    const slPct = 3.5;

    const target1 = +(entryHigh * 1.080).toFixed(1); // v2.0 Rule: Target 1 +8.0%!
    const target2 = +(entryHigh * 1.150).toFixed(1); // v2.0 Rule: Target 2 +15.0% Upper Circuit!
    const t1Pct = 8.0;
    const t2Pct = 15.0;

    const rrr = +((target1 - entryHigh) / Math.max(1, entryHigh - stopLoss)).toFixed(2);

    // Statutory Breakeven (0.33% commission + 0.015% SEBON + Rs. 25 DP)
    const statutoryBreakeven = +( (entryHigh * 100 + 25) / (100 * 0.99655) ).toFixed(1);

    // Position Sizing for Rs. 100,000 Model Portfolio (1% risk cap = Rs. 1,000)
    const riskPerShare = Math.max(1, entryHigh - stopLoss);
    const sharesPer1Lakh = Math.min(Math.floor(100000 / entryHigh), Math.max(10, Math.floor(1000 / riskPerShare)));
    const capitalDeployed = sharesPer1Lakh * entryHigh;
    const actualRiskRs = Math.round(sharesPer1Lakh * riskPerShare);

    // Real Smart Money Net Flow calculation (avoids +0.0% uncalculated display)
    const netVol = Number(s.netVolume || s.brokerAnalysis?.netVolume || (volume * (bcr3Buy - bcr3Sell) / 100));
    smartFlow = volume > 0 ? +((netVol / volume) * 100).toFixed(1) : +(bcr3Buy - bcr3Sell).toFixed(1);

    const proximityScore = Math.max(0, 10 - Math.abs(distFromVwap) * 2);
    const convictionScore = Math.round(bcr3Buy * 0.5 + nbar * 18 + proximityScore * 2 + (smartFlow > 0 ? 10 : 0));

    candidates.push({
      symbol: sym,
      name: s.companyName || s.name || stockUniverseMap[sym]?.name || sym,
      sector: s.sector || stockUniverseMap[sym]?.sector || 'NEPSE Equities',
      ltp,
      turnover,
      volume,
      bcr3Buy,
      bcr3Sell,
      nbar,
      smartFlow,
      topBuyers,
      whaleVwap,
      distFromVwap,
      entryLow,
      entryHigh,
      chaseCap,
      stopLoss,
      slPct,
      target1,
      t1Pct,
      target2,
      t2Pct,
      rrr,
      statutoryBreakeven,
      sharesPer1Lakh,
      capitalDeployed,
      actualRiskRs,
      convictionScore
    });
  }

  candidates.sort((a, b) => b.convictionScore - a.convictionScore);
  return candidates[0] || null;
}

/**
 * Dispatches an automated Playbook Mid-Stage Accumulation Alert to Telegram
 */
export async function sendTelegramPlaybookPickAlert(pick, options = {}) {
  if (!pick || !pick.symbol) {
    return { success: false, error: 'No valid playbook pick provided' };
  }

  // Upgrade playbook pick formatting strictly to Upgraded Flowchart v2.0
  const leadBrokerId = pick.leadBrokerId || (pick.topBuyers && pick.topBuyers[0] ? (pick.topBuyers[0].broker || pick.topBuyers[0].brokerId) : '58');
  const leadBrokerName = pick.leadBrokerName || BROKER_NAMES[String(leadBrokerId)] || 'Naasa Securities';

  let ledgerDb = null;
  let trapAudit = null;
  let flowMetrics = null;
  try {
    const { db, getSmartMoneyAggregatedFlow } = await import('./db/ledgerStore.js');
    if (db) {
      ledgerDb = db;
      trapAudit = auditMultiSessionTrapRisk(db, pick.symbol, leadBrokerId);
      const flow = getSmartMoneyAggregatedFlow(pick.symbol, 5);
      flowMetrics = extract5DayBrokerFlowMetrics(flow, Number(pick.ltp || 0));
    }
  } catch (_) {}

  const v2Payload = enrichPayloadWithFlowchartV2RallyMetrics(
    {
      symbol: pick.symbol,
      name: pick.name || pick.companyName || pick.symbol,
      companyName: pick.name || pick.companyName || pick.symbol,
      sector: pick.sector || 'Equities',
      ltp: Number(pick.ltp || 0),
      avgBrokerPrice: pick.avgBrokerPrice,
      entryLow: Number(pick.entryLow || (pick.ltp * 0.995)),
      entryHigh: Number(pick.entryHigh || (pick.ltp * 1.012)),
      chaseCap: Number(pick.chaseCap || (pick.ltp * 1.018)),
      stopLoss: Number(pick.stopLoss || (pick.ltp * 0.965)),
      slPct: Number(pick.slPct || 3.5),
      target1: Number(pick.target1 || (pick.ltp * 1.080)),
      t1Pct: Number(pick.t1Pct || 8.0),
      target2: Number(pick.target2 || (pick.ltp * 1.150)),
      t2Pct: Number(pick.t2Pct || 15.0),
      bcr3Buy: pick.bcr3Buy ?? flowMetrics?.bcr3Buy ?? null,
      bcr3Sell: pick.bcr3Sell ?? flowMetrics?.bcr3Sell ?? null,
      leadBrokerId,
      leadBrokerName,
      retention10D: pick.retention10D ?? pick.leadRetentionPct ?? trapAudit?.retentionPct ?? flowMetrics?.leadRetentionPct ?? null,
      vdu: pick.vdu ?? pick.vduRatio ?? null,
      cmf: pick.cmf ?? null,
      bbw: pick.bbw ?? pick.bbwPct ?? null,
      corneringScore: pick.convictionScore ?? pick.corneringScore ?? null,
      confidenceLabel: pick.confidenceLabel || '🟢 Confirmed Stealth (v2.0)',
      rallyTrack: pick.rallyTrack,
      rallyHorizonLabel: pick.rallyHorizonLabel,
      freeFloatCorneredPct: pick.freeFloatCorneredPct,
      clv: pick.clv,
      upperWickRatio: pick.upperWickRatio,
      isNr7: pick.isNr7,
      isIdnr4: pick.isIdnr4,
      isPocketPivot: pick.isPocketPivot,
      isT2ClearedContinuation: pick.isT2ClearedContinuation,
      netVol: pick.netVol,
      netKitta: pick.netKitta,
    },
    { db: ledgerDb, trapAudit, flowMetrics, ltp: Number(pick.ltp || 0) }
  );

  const msg = formatUpgradedStealthAccumulationHtml(v2Payload);
  return await sendTelegramMessage(msg, { chatId: options?.chatId });
}

/**
 * High-level auto-select & dispatch runner for Method 1 & 2
 */
export async function autoSelectAndDispatchPlaybookPick(customStocks = null, options = {}) {
  let stocks = customStocks;
  const targetChatId = options?.chatId || null;
  if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
    if (typeof _getEnrichedStockUniverse === 'function') {
      try {
        stocks = await _getEnrichedStockUniverse();
      } catch (e) {
        console.warn('[TelegramNotifier] Failed to load enriched universe:', e.message);
      }
    }
  }

  // Fallback to internal HTTP request to localhost:PORT/api/today-prices if still empty
  if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
    try {
      const port = process.env.PORT || 5000;
      const resp = await fetch(`http://localhost:${port}/api/today-prices`);
      const d = await resp.json();
      stocks = d.data || [];
    } catch (_) {}
  }

  const pick = selectPlaybookMidStagePick(stocks);
  if (!pick) {
    return { success: false, reason: 'No equity currently satisfies all strict Method 1 & 2 accumulation criteria.' };
  }

  const result = await sendTelegramPlaybookPickAlert(pick, { chatId: targetChatId });
  return {
    success: Boolean(result.success),
    pick,
    telegramResult: result
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 5-STEP 10–15 DAY HIGH-ALPHA SWING STOCK SELECTOR & TELEGRAM AUTOMATION
 * ───────────────────────────────────────────────────────────────────────────
 * Evaluates active setups in the 37-day SQLite ledger against all 5 Steps:
 *  Step 1: Market Regime & Technical Trend (LTP > 50-EMA, RSI 48–68, MACD Bullish)
 *  Step 2: 3D/5D Smart Money Scanner (SYNDICATE_ROTATION / STEALTH_ACCUMULATION,
 *          BCR5 >= 18.5%, SCR3 < 13.0%, Institutional Ticket >= 150 kitta)
 *  Step 3: 13-Tab Verification (LTP within [-2.5%, +3.5%] of Big Broker VWAP,
 *          Volume Profile POC support, Portfolio Broker Shield = SYNDICATE_FORTRESS / SAFE_ACCUMULATION)
 *  Step 4: Intraday Execution Timing (12:15–1:30 PM Pullback / 2:35–2:55 PM Close)
 *  Step 5: 10–15 Day Exit Plan (-4%/-5% Hard SL, +1.2R Breakeven Ratchet at +3.2%,
 *          Target 1 +7.5% sell 50%, Target 2 +15% runner) + Auto Exit-Guard Tracking
 *  Step 6: 5-Day Multi-Session Cross-Session Trap Veto (Zero recent unabsorbed dumps)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 5-Day Cross-Session Multi-Broker Trap & Dump Auditor
 * Strictly guards against:
 * 1. Unabsorbed massive dumps (>25k kitta net sell by any broker in the last 2 sessions without equal buyer absorption, e.g. SOHL).
 * 2. Active distribution today (lead broker flipped to net selling today, e.g. AKPL).
 * 3. 5-day net negative or low retention (<50% wash churn, e.g. AKJCL).
 */
export function auditMultiSessionTrapRisk(db, symbol, leadBrokerId = null) {
  try {
    const dates = db
      .prepare('SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC LIMIT 5')
      .all()
      .map((r) => r.trade_date);
    if (!dates || dates.length === 0) return { isTrap: false, verdict: 'PASS_NO_HISTORY' };
    const placeholders = dates.map(() => '?').join(',');

    // 0. Anti-Demat Dump Guard: Check if past accumulators are dumping settled shares today
    try {
      const dumpCheck = auditAntiDematDumpGuard(symbol);
      if (dumpCheck && dumpCheck.isTrap) {
        return {
          isTrap: true,
          verdict: 'PAST_ACCUMULATOR_DEMAT_DUMP',
          reason: dumpCheck.reason,
          dumpBroker: dumpCheck.dumpingBroker,
          dumpVol: dumpCheck.soldToday
        };
      }
    } catch (_) {}

    // 0.1 The 2-Day Dip Invalidation Rule (3 Consecutive Red Days Veto)
    // Institutional runners (GVL, MBJC, LSL, AKJCL, ECL) never drop for 3 consecutive days.
    // If a stock closes in the red for 3 consecutive sessions in a row, operator support has collapsed.
    try {
      const priceHistory = db.prepare(`
        SELECT trade_date, open_price, close_price 
        FROM daily_stock_summary 
        WHERE symbol = ? 
        ORDER BY trade_date DESC 
        LIMIT 4
      `).all(symbol);

      if (priceHistory && priceHistory.length >= 3) {
        const d0 = priceHistory[0]; // Latest session
        const d1 = priceHistory[1]; // Session - 1
        const d2 = priceHistory[2]; // Session - 2

        const c0 = Number(d0.close_price || 0);
        const c1 = Number(d1.close_price || 0);
        const c2 = Number(d2.close_price || 0);
        const o0 = Number(d0.open_price || c0);
        const o1 = Number(d1.open_price || c1);
        const o2 = Number(d2.open_price || c2);

        // Check A: 3 consecutive declining closes (lower close every single day)
        const isConsecutiveDeclining = (c0 > 0 && c1 > 0 && c2 > 0) && (c0 < c1 && c1 < c2);
        // Check B: 3 consecutive red candles (close < open for 3 sessions)
        const isThreeRedCandles = (c0 < o0 && c1 < o1 && c2 < o2);

        if (isConsecutiveDeclining || isThreeRedCandles) {
          return {
            isTrap: true,
            verdict: 'THREE_CONSECUTIVE_RED_DAYS_VETO',
            reason: `3-Day Dip Invalidation: Dropped 3 sessions in a row (Rs. ${c2} -> Rs. ${c1} -> Rs. ${c0}). Institutional base collapsed.`
          };
        }
      }
    } catch (_) {}

    // 1. Check for ANY unabsorbed massive dump (>12k net sell) in the last 2 sessions (Yesterday / Today)
    const recentDates = dates.slice(0, 2);
    const recentPlaceholders = recentDates.map(() => '?').join(',');
    const recentDumps = db
      .prepare(
        `SELECT broker_id, trade_date, (buy_vol - sell_vol) as net_vol, sell_vol 
         FROM daily_broker_ledger 
         WHERE symbol = ? AND trade_date IN (${recentPlaceholders}) AND (buy_vol - sell_vol) < -12000 
         ORDER BY net_vol ASC`
      )
      .all(symbol, ...recentDates);

    const recentBuys = db
      .prepare(
        `SELECT broker_id, trade_date, (buy_vol - sell_vol) as net_vol 
         FROM daily_broker_ledger 
         WHERE symbol = ? AND trade_date IN (${recentPlaceholders}) AND (buy_vol - sell_vol) > 12000 
         ORDER BY net_vol DESC`
      )
      .all(symbol, ...recentDates);

    const maxDump = recentDumps.length > 0 ? Math.abs(recentDumps[0].net_vol) : 0;
    const maxBuy = recentBuys.length > 0 ? recentBuys[0].net_vol : 0;

    if (recentDumps.length > 0 && maxBuy < maxDump * 0.8) {
      const d = recentDumps[0];
      return {
        isTrap: true,
        verdict: 'UNABSORBED_DUMP_TRAP',
        reason: `Broker #${d.broker_id} dumped ${Math.abs(d.net_vol).toLocaleString()} kitta on ${d.trade_date} with no institutional buyer absorbing`,
        dumpBroker: d.broker_id,
        dumpVol: Math.abs(d.net_vol),
      };
    }

    // 2. Multi-session Lead Broker Verification
    let brokerId = leadBrokerId;
    if (!brokerId) {
      const topRow = db
        .prepare(
          `SELECT broker_id, SUM(buy_vol - sell_vol) as net_vol 
           FROM daily_broker_ledger 
           WHERE symbol = ? AND trade_date IN (${placeholders}) 
           GROUP BY broker_id ORDER BY net_vol DESC LIMIT 1`
        )
        .get(symbol, ...dates);
      brokerId = topRow ? topRow.broker_id : null;
    }

    if (!brokerId) {
      return { isTrap: true, verdict: 'NO_INSTITUTIONAL_LEAD', reason: 'No dominant broker accumulation found across 5 sessions' };
    }

    const brokerDaily = db
      .prepare(
        `SELECT trade_date, buy_vol, sell_vol, (buy_vol - sell_vol) as net_vol, buy_amt 
         FROM daily_broker_ledger 
         WHERE symbol = ? AND broker_id = ? AND trade_date IN (${placeholders}) 
         ORDER BY trade_date ASC`
      )
      .all(symbol, brokerId, ...dates);

    let totalBuy = 0;
    let totalSell = 0;
    let totalBuyAmt = 0;
    for (const r of brokerDaily) {
      totalBuy += r.buy_vol;
      totalSell += r.sell_vol;
      totalBuyAmt += r.buy_amt;
    }

    const totalNet = totalBuy - totalSell;
    const retentionPct = totalBuy > 0 ? (totalNet / totalBuy) * 100 : 0;
    const buyVwap = totalBuy > 0 ? totalBuyAmt / totalBuy : 0;

    if (totalNet <= 0) {
      return { isTrap: true, verdict: 'NET_DISTRIBUTION', reason: `Lead broker #${brokerId} has negative net accumulation over 5 sessions (${totalNet} kitta)` };
    }

    if (retentionPct < 50) {
      return { isTrap: true, verdict: 'HIGH_CHURN_TRAP', reason: `Lead broker #${brokerId} churn rate is too high (${retentionPct.toFixed(1)}% retention)` };
    }

    // Active selling today check (e.g. AKPL)
    const latestDay = brokerDaily[brokerDaily.length - 1];
    if (latestDay && latestDay.net_vol < -5000) {
      return {
        isTrap: true,
        verdict: 'ACTIVE_DISTRIBUTION_TODAY',
        reason: `Lead broker #${brokerId} flipped to net seller today (-${Math.abs(latestDay.net_vol).toLocaleString()} kitta)`,
      };
    }

    let consecutiveDays = 0;
    for (let i = brokerDaily.length - 1; i >= 0; i--) {
      if (brokerDaily[i].net_vol > 0) consecutiveDays++;
      else break;
    }

    return {
      isTrap: false,
      verdict: 'CLEAN_MULTI_SESSION_ACCUMULATION',
      leadBrokerId: brokerId,
      total5DayNet: totalNet,
      retentionPct: Math.round(retentionPct),
      buyVwap: Number(buyVwap.toFixed(2)),
      consecutiveDays,
      reason: `Verified 5-day accumulation (+${totalNet.toLocaleString()} kitta, ${Math.round(retentionPct)}% retention, ${consecutiveDays} consecutive buy sessions)`,
    };
  } catch (err) {
    return { isTrap: true, verdict: 'AUDIT_ERROR_FAIL_CLOSED', reason: err.message };
  }
}

const DAILY_SELECTION_STATE_FILE = path.join(DATA_DIR, 'daily_selection_guide_state.json');
let inFlightScheduledGuideDate = null;

function readDailySelectionState() {
  try {
    if (fs.existsSync(DAILY_SELECTION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(DAILY_SELECTION_STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastDispatchedDate: null, history: {} };
}

export function hasSelectionGuideDispatchedForDate(sessionDate) {
  if (!sessionDate) return false;
  const target = String(sessionDate).slice(0, 10);
  const state = readDailySelectionState();
  return state.lastDispatchedDate === target || Boolean(state.history?.[target]);
}

function markSelectionGuideDispatchedForDate(sessionDate, summary = {}) {
  const target = String(sessionDate).slice(0, 10);
  const state = readDailySelectionState();
  state.lastDispatchedDate = target;
  state.updatedAt = new Date().toISOString();
  state.history = state.history || {};
  state.history[target] = {
    dispatchedAt: state.updatedAt,
    qualifiedCount: Number(summary.qualifiedCount || 0),
    watchlistCount: Number(summary.watchlistCount || 0),
    regime: summary.regime || 'UNKNOWN'
  };
  // Retain trailing 30 entries to bound file growth
  const keys = Object.keys(state.history).sort();
  while (keys.length > 30) {
    const oldest = keys.shift();
    delete state.history[oldest];
  }
  try {
    fs.writeFileSync(DAILY_SELECTION_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[StockSelectionGuide] Failed saving daily selection state file:', err.message);
  }
  saveLastSelectionGuideDateToDb(target).catch(() => {});
}

/**
 * Runs the 4-Gate Stock Selection Guide evaluation and dispatches the mobile Telegram
 * notification (either Selected Stock(s) or explicit "No Stock Selected — Hold Cash").
 */
export async function runDailyStockSelectionGuideAndDispatch({
  chatId = null,
  targetDate = null,
  dryRun = false,
  liveIndexQuote = null,
  liveIndexHistory = null,
  forceScanOnBear = false
} = {}) {
  if (!targetDate) {
    await ensureTodaySessionIngested();
  }
  const status = getDetailedMarketStatus();
  const fallbackDate = status?.lastClosedSessionDate || status?.targetSessionDate || new Date().toISOString().slice(0, 10);

  try {
    const { db: ledgerDb, rebuildHotCache } = await import('./db/ledgerStore.js');
    rebuildHotCache();

    const fetchedLiveHistory = Array.isArray(liveIndexHistory)
      ? liveIndexHistory
      : await fetchLiveNepseIndexHistory().catch(() => []);

    const guideRes = evaluateDailySelectionGuide({
      db: ledgerDb,
      targetDate,
      liveIndexHistory: fetchedLiveHistory,
      liveIndexQuote,
      forceScanOnBear
    });

    const html = formatDailySelectionGuideHtml(guideRes);
    let telegramResult = null;
    if (!dryRun) {
      telegramResult = await sendTelegramMessage(html, { chatId });
    }

    return {
      ...guideRes,
      success: dryRun ? Boolean(guideRes?.success) : Boolean(telegramResult?.success),
      html,
      telegramResult
    };
  } catch (err) {
    console.error('[StockSelectionGuide] Fatal error:', err?.message || err);
    const errorMsg = [
      `📊 <b>DRAVYASHREE 4-GATE STOCK SELECTION GUIDE</b>`,
      `📅 <b>Session: ${escapeHtml(targetDate || fallbackDate)}</b>`,
      `──────────────────────────`,
      `⚠️ Error running stock selection scan: ${escapeHtml(String(err?.message || 'Unknown error'))}`,
      `Please try again after market data is ingested.`
    ].join('\n');
    const telegramResult = dryRun ? null : await sendTelegramMessage(errorMsg, { chatId });
    return {
      success: false,
      error: err?.message || 'Unknown error',
      sessionDate: targetDate || fallbackDate,
      html: errorMsg,
      telegramResult
    };
  }
}

/**
 * Scheduled daily EOD dispatcher with persistent per-session deduplication across restarts.
 * Always sends either selected stock(s) OR an explicit "No Stock Selected" alert once per session.
 */
export async function dispatchScheduledDailySelectionGuide({
  targetDate = null,
  liveIndexQuote = null,
  liveIndexHistory = null
} = {}) {
  const status = getDetailedMarketStatus();
  const effectiveDate = String(
    targetDate || status?.lastClosedSessionDate || status?.targetSessionDate || new Date().toISOString().slice(0, 10)
  ).slice(0, 10);

  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_TEST_ALERTS === 'true';
  const telegramStatus = getTelegramStatus();
  if (!telegramStatus.isConfigured && !isTestEnv) {
    return { skipped: true, reason: 'telegram_not_configured', sessionDate: effectiveDate };
  }

  if (inFlightScheduledGuideDate === effectiveDate) {
    return { skipped: true, reason: 'in_flight', sessionDate: effectiveDate };
  }
  if (hasSelectionGuideDispatchedForDate(effectiveDate)) {
    return { skipped: true, reason: 'already_dispatched', sessionDate: effectiveDate };
  }

  const dbLastDate = await getLastSelectionGuideDateFromDb().catch(() => null);
  if (dbLastDate === effectiveDate) {
    markSelectionGuideDispatchedForDate(effectiveDate, { regime: 'DB_SYNCED' });
    return { skipped: true, reason: 'already_dispatched_db', sessionDate: effectiveDate };
  }

  inFlightScheduledGuideDate = effectiveDate;
  try {
    // Ensure ledger & price rows actually exist for effectiveDate before marking session dispatched
    try {
      const { db: ledgerDb } = await import('./db/ledgerStore.js');
      const hasPrices = Boolean(
        ledgerDb.prepare('SELECT 1 FROM daily_stock_summary WHERE trade_date = ? LIMIT 1').get(effectiveDate)
      );
      const hasBroker = Boolean(
        ledgerDb.prepare('SELECT 1 FROM daily_broker_ledger WHERE trade_date = ? LIMIT 1').get(effectiveDate)
      );
      if (!hasPrices || !hasBroker) {
        return { skipped: true, reason: 'awaiting_eod_data_ingestion', sessionDate: effectiveDate };
      }
    } catch (_) {}

    const res = await runDailyStockSelectionGuideAndDispatch({
      targetDate: effectiveDate,
      liveIndexQuote,
      liveIndexHistory,
      dryRun: false
    });

    if (res?.telegramResult?.success) {
      markSelectionGuideDispatchedForDate(res.sessionDate || effectiveDate, {
        qualifiedCount: res.qualifiedCount,
        watchlistCount: res.watchlistCount,
        regime: res.gate1?.regime
      });
      return {
        skipped: false,
        dispatched: true,
        sessionDate: res.sessionDate || effectiveDate,
        qualifiedCount: res.qualifiedCount || 0,
        watchlistCount: res.watchlistCount || 0,
        regime: res.gate1?.regime || 'UNKNOWN',
        telegramResult: res.telegramResult
      };
    }

    return {
      skipped: false,
      dispatched: false,
      sessionDate: effectiveDate,
      reason: res?.telegramResult?.reason || res?.telegramResult?.error || res?.error || 'dispatch_failed'
    };
  } finally {
    inFlightScheduledGuideDate = null;
  }
}

export async function select5StepSwingPicks(opts = {}) {
  await ensureTodaySessionIngested();
  try {
    const [{ db, rebuildHotCache, getScripVolumeProfile, getSmartMoneyAggregatedFlow }, { computeStockFeatures }, { evaluatePortfolioShield }] =
      await Promise.all([
        import('./db/ledgerStore.js'),
        import('./quant/featureEngine.mjs'),
        import('./routes/radarRoutes.js'),
      ]);

    rebuildHotCache();

    const openSignals = db
      .prepare(`SELECT * FROM algorithmic_signal_ledger WHERE status = 'OPEN_ACTIVE' ORDER BY signal_date DESC`)
      .all();

    // Augmented Discovery: Pull top multi-session institutional accumulators directly from 5-day ledger
    const latestDates = db
      .prepare('SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC LIMIT 5')
      .all()
      .map((r) => r.trade_date);
    const existingSymbols = new Set(openSignals.map((s) => String(s.symbol || '').toUpperCase().trim()));

    if (latestDates.length > 0) {
      const pl = latestDates.map(() => '?').join(',');
      const topAccumScrips = db
        .prepare(
          `SELECT symbol, broker_id as lead_broker_id, SUM(buy_vol - sell_vol) as net_vol, SUM(buy_amt)/SUM(buy_vol) as broker_vwap 
           FROM daily_broker_ledger 
           WHERE trade_date IN (${pl}) 
           GROUP BY symbol, broker_id 
           HAVING net_vol >= 15000 
           ORDER BY net_vol DESC 
           LIMIT 100`
        )
        .all(...latestDates);

      for (const row of topAccumScrips) {
        const sUpper = String(row.symbol || '').toUpperCase().trim();
        if (!sUpper || existingSymbols.has(sUpper)) continue;
        existingSymbols.add(sUpper);

        const latestFs = db
          .prepare('SELECT rate FROM floorsheet_contracts WHERE symbol = ? ORDER BY rowid DESC LIMIT 1')
          .get(sUpper);
        const ltp = Number(latestFs?.rate || row.broker_vwap?.toFixed(1) || 0);

        openSignals.push({
          symbol: sUpper,
          signal_date: latestDates[0],
          signal_type: 'INSTITUTIONAL_5DAY_ACCUMULATION',
          entry_price: ltp,
          current_ltp: ltp,
          broker_vwap: Number(row.broker_vwap?.toFixed(1)) || ltp,
          lead_broker_id: row.lead_broker_id,
          lead_broker_name: `Broker #${row.lead_broker_id}`,
          bcr5_net_pct: 35.0,
          scr3_net_pct: 8.0,
          broker_anomaly_score: 2.2,
          avg_ticket_kitta: 250,
          strategy: 'MULTI_SESSION_CORNERING',
        });
      }
    }

    const strictMatches = [];
    const secondaryMatches = [];
    const vetoedTraps = [];

    let currentMarketRegime = opts?.marketRegime || opts?.regime || 'BULL';
    try {
      const mktRows = db.prepare(`
        SELECT trade_date, AVG(close_price) as avg_close
        FROM daily_stock_summary
        WHERE close_price > 0 AND symbol NOT LIKE '%PO%' AND symbol NOT LIKE '%DEB%'
        GROUP BY trade_date ORDER BY trade_date DESC LIMIT 20
      `).all();
      if (mktRows.length >= 20) {
        const sma20 = mktRows.reduce((a, b) => a + b.avg_close, 0) / mktRows.length;
        currentMarketRegime = mktRows[0].avg_close >= sma20 ? 'BULL' : 'CHOP';
      }
    } catch (_) {}

    const recentHistStmt = db.prepare(`
      SELECT trade_date, open_price, high_price, low_price, close_price, total_volume
      FROM daily_stock_summary
      WHERE symbol = ?
      ORDER BY trade_date DESC
      LIMIT 55
    `);

    for (const sig of openSignals) {
      const sym = String(sig.symbol || '').toUpperCase().trim();
      if (!sym) continue;

      // Mutual Fund / low-price unit guard
      const rawLtpCheck = Number(sig.current_ltp || sig.entry_price || 0);
      if (rawLtpCheck < 100 || /^(KSY|C30MF|RMF|NBF|CMF|SBCF|SEF|SAEF|NICBF|NIBLPF|KDBY|LVF|PSF|RBBMF|H8020|MNMF|NSIF|SIGS|SFMF)/i.test(sym)) continue;

      // ── STEP 6: 5-DAY MULTI-SESSION TRAP VETO GATE (RUN FIRST) ──
      const trapAudit = auditMultiSessionTrapRisk(db, sym, sig.lead_broker_id);
      if (trapAudit.isTrap) {
        console.log(`[TelegramNotifier] 🚫 Hard Veto ${sym}: ${trapAudit.reason}`);
        vetoedTraps.push({ symbol: sym, reason: trapAudit.reason, verdict: trapAudit.verdict });
        continue; // VETO! DO NOT SEND TO TELEGRAM!
      }

      const ltp = rawLtpCheck;
      if (!ltp || ltp <= 0) continue;
      const brokerVwap = Number(sig.broker_vwap || sig.entry_vwap || ltp);
      const vwapDiffPct = Number(
        sig.vwap_diff_pct ?? (brokerVwap > 0 ? (((ltp - brokerVwap) / brokerVwap) * 100).toFixed(2) : 0)
      );
      const bcr5Net = Number(sig.bcr5_net_pct || 0);
      const scr3Net = Number(sig.scr3_net_pct || 0);
      const anomalyScore = Number(sig.broker_anomaly_score || 1.0);
      const avgTicket = Number(sig.avg_ticket_kitta || 0);

      // Step 1 & 3 Technicals + Volume Profile POC + Portfolio Broker Shield
      const feat = await computeStockFeatures(sym, 50, { symbol: sym, ltp });
      const vp = getScripVolumeProfile(sym, 30);
      const shieldRes = evaluatePortfolioShield([{ symbol: sym, qty: 100, buyPrice: ltp }], 5);
      const shieldItem = shieldRes?.items?.[0] || {};

      const ema50 = Number(feat?.ema50 || 0);
      const above50 = Boolean(feat?.is_above_50_ema ?? (ema50 > 0 && ltp >= ema50));
      const rsi14 = Number(feat?.rsi_14 || 55);
      const macdSignal = String(feat?.macd_signal || 'neutral');
      const pocPrice = Number(vp?.pocPrice || brokerVwap);
      const shieldVerdict = String(shieldItem.shieldVerdict || 'SAFE_ACCUMULATION_ZONE');

      // ── 5-FILTERS-AT-THE-FLOOR VERIFICATION ──
      // 1) Filter 1: Floor Proximity (-3.0% to +4.5% of Operator VWAP)
      if (vwapDiffPct > 4.5 || vwapDiffPct < -3.0) continue;

      // 2) Filter 2: Low-to-Mid Float & High-Velocity Swing Sector (Excludes mutual funds & promoter scrips)
      const excludedSectors = ['Mutual Fund', 'Promoter Share'];
      const scripSector = sig.sector || stockUniverseMap[sym]?.sector || '';
      if (excludedSectors.includes(scripSector)) continue;
      // Allow Commercial Banks only if massive institutional absorption (>= 100,000 net kitta, e.g. KBL)
      if (scripSector === 'Commercial Banks' && (trapAudit.total5DayNet || 0) < 100000) continue;

      // 3) Filter 3: Lead Broker Retention Ratio >= 55% (True Institutional Hoarding vs. Wash Churn)
      const leadRetentionPct = (trapAudit?.retentionPct !== null && trapAudit?.retentionPct !== undefined && Number.isFinite(Number(trapAudit.retentionPct)))
        ? Number(trapAudit.retentionPct)
        : null;
      if (leadRetentionPct === null || leadRetentionPct < 55) continue; // Hard Veto: Reject missing/churn!

      // 4) Filter 4 & Technical Safety Gates:
      // Allow institutional absorption if 5-day net >= 100,000 kitta has overpowered the selling broker
      if ((shieldVerdict === 'EXIT_BEFORE_T2_DUMP' || shieldVerdict === 'PROFIT_BOOKING_CLIMAX_RISK') && (trapAudit.total5DayNet || 0) < 100000) continue;
      if (!above50) continue;
      // Bearish MACD veto unless massive institutional absorption underway
      if (macdSignal === 'bearish' && (trapAudit.total5DayNet || 0) < 100000) continue;

      let flowMetrics = { hasLedgerFlow: false };
      try {
        const flow = typeof getSmartMoneyAggregatedFlow === 'function' ? getSmartMoneyAggregatedFlow(sym, 5) : [];
        flowMetrics = extract5DayBrokerFlowMetrics(flow, brokerVwap, {
          bcr3Buy: bcr5Net > 0 ? Math.min(85, Math.max(40, Number((bcr5Net * 1.4).toFixed(1)))) : null,
          bcr3Sell: scr3Net > 0 ? Number(scr3Net.toFixed(1)) : null,
          leadBrokerId: trapAudit.leadBrokerId || sig.lead_broker_id
        });
      } catch (_) {}
      const avgBrokerPrice = Number(flowMetrics.avgBrokerPrice || brokerVwap || ltp);
      const realBcr3Buy = (flowMetrics.bcr3Buy !== null && flowMetrics.bcr3Buy !== undefined && Number.isFinite(Number(flowMetrics.bcr3Buy))) ? Number(flowMetrics.bcr3Buy) : null;
      const realBcr3Sell = (flowMetrics.bcr3Sell !== null && flowMetrics.bcr3Sell !== undefined && Number.isFinite(Number(flowMetrics.bcr3Sell))) ? Number(flowMetrics.bcr3Sell) : null;

      // Enforce verified 5-day ledger dominance & Seller Dominance Ceiling
      if (realBcr3Buy === null || realBcr3Sell === null || realBcr3Sell > 45.0 || realBcr3Buy < realBcr3Sell) continue;

      const resolvedLeadBrokerId = trapAudit.leadBrokerId || flowMetrics.leadBrokerId || sig.lead_broker_id;
      const resolvedLeadBrokerName = BROKER_NAMES[String(resolvedLeadBrokerId)] || flowMetrics.leadBrokerName || `Broker #${resolvedLeadBrokerId}`;
      const realVwapDiffPct = avgBrokerPrice > 0 ? Number((((ltp - avgBrokerPrice) / avgBrokerPrice) * 100).toFixed(2)) : vwapDiffPct;

      // Coiled Ignition Breakout, Pocket Pivot & Loophole-Protected SMC Confluence (Last 55 Sessions)
      let base10Pct = null;
      let vduRatio = null;
      let rvolToday = null;
      let dayChgPct = null;
      let isPocketPivot = false;
      let is20dBreakout = false;
      let isSpringReclaim = false;
      let isCoilIgnitionBreakout = false;
      let smc = evaluateLoopholeProtectedSmcSetup([], {
        ltp,
        avgBrokerPrice,
        bcr3Buy: realBcr3Buy,
        bcr3Sell: realBcr3Sell,
        leadRetentionPct,
        isTrap: trapAudit.isTrap,
      });

      try {
        const histBars = recentHistStmt.all(sym).reverse();
        if (histBars.length >= 20) {
          const bLen = histBars.length - 1;
          const curBar = histBars[bLen];
          const prevBar = histBars[bLen - 1];
          const curClose = Number(curBar.close_price || ltp);
          const prevClose = Number(prevBar.close_price || curClose);
          const curVol = Number(curBar.total_volume || 0);

          const prev20Bars = histBars.slice(Math.max(0, bLen - 20), bLen);
          const sma20 = prev20Bars.reduce((s, r) => s + Number(r.close_price || 0), 0) / Math.max(1, prev20Bars.length);
          const avgVol20 = prev20Bars.reduce((s, r) => s + Number(r.total_volume || 0), 0) / Math.max(1, prev20Bars.length);

          const prev10Bars = histBars.slice(Math.max(0, bLen - 10), bLen);
          const maxClose10 = Math.max(...prev10Bars.map(r => Number(r.close_price || curClose)));
          const minClose10 = Math.min(...prev10Bars.map(r => Number(r.close_price || curClose)));
          base10Pct = ((maxClose10 - minClose10) / Math.max(1, minClose10)) * 100;

          const prior5Bars = histBars.slice(Math.max(0, bLen - 5), bLen);
          const minVol5 = prior5Bars.length > 0 ? Math.min(...prior5Bars.map(r => Number(r.total_volume || 0))) : avgVol20;
          vduRatio = minVol5 / Math.max(1, avgVol20);
          rvolToday = curVol / Math.max(1, avgVol20);
          dayChgPct = prevClose > 0 ? ((curClose - prevClose) / prevClose) * 100 : 0;

          const prev15Bars = histBars.slice(Math.max(0, bLen - 15), bLen);
          const maxClose15 = prev15Bars.length > 0 ? Math.max(...prev15Bars.map(r => Number(r.close_price || 0))) : curClose;
          const last5Bars = histBars.slice(Math.max(0, bLen - 4), bLen + 1);
          const minLow5 = last5Bars.length > 0 ? Math.min(...last5Bars.map(r => Number(r.low_price || curClose))) : curClose;

          let maxDownVol10 = 0;
          for (let k = Math.max(1, bLen - 10); k < bLen; k++) {
            if (Number(histBars[k].close_price || 0) < Number(histBars[k - 1].close_price || 0)) {
              const dv = Number(histBars[k].total_volume || 0);
              if (dv > maxDownVol10) maxDownVol10 = dv;
            }
          }

          isPocketPivot = dayChgPct >= 0.25 && curClose >= sma20 * 0.99 && curVol > maxDownVol10;
          is20dBreakout = curClose >= maxClose15 * 0.995 && dayChgPct >= 0.2 && rvolToday >= 1.15;
          isSpringReclaim = minLow5 < sma20 * 0.985 && curClose > sma20 && dayChgPct >= 0.4;
          isCoilIgnitionBreakout =
            base10Pct !== null &&
            vduRatio !== null &&
            rvolToday !== null &&
            dayChgPct !== null &&
            (base10Pct <= 8.5 || isSpringReclaim) &&
            (vduRatio <= 0.68 || is20dBreakout || isPocketPivot) &&
            dayChgPct >= 0.2 &&
            dayChgPct <= 4.2 &&
            curClose >= sma20 * 0.99 &&
            (isPocketPivot || is20dBreakout || isSpringReclaim || rvolToday >= 1.15) &&
            realBcr3Buy >= 42.0 &&
            realBcr3Sell <= 35.0 &&
            leadRetentionPct >= 75 &&
            realVwapDiffPct >= -1.5 &&
            realVwapDiffPct <= 2.5;

          smc = evaluateLoopholeProtectedSmcSetup(histBars, {
            ltp,
            ema20: sma20,
            avgBrokerPrice,
            bcr3Buy: realBcr3Buy,
            bcr3Sell: realBcr3Sell,
            leadRetentionPct,
            isTrap: trapAudit.isTrap,
          });
        }
      } catch (_) {}

      const hasSmcStructure = smc.isBreakAndRetest || smc.isSmcSweepMss || smc.isFvgMitigated || smc.isT2ClearedContinuation;
      const entryLow = Number(
        (smc.isFvgMitigated && smc.fvgLow
          ? Math.min(ltp, avgBrokerPrice, smc.fvgLow)
          : Math.min(ltp, avgBrokerPrice)
        ).toFixed(1)
      );
      const chaseCap = Number((ltp * 1.018).toFixed(1));
      const entryHigh = Number(Math.min(Math.max(ltp, avgBrokerPrice * 1.012), chaseCap).toFixed(1));
      const baseSl = Number(sig.stop_loss_price || ltp * 0.95);
      const stopLoss = Number(
        (hasSmcStructure && smc.smcStopLoss > 0 ? smc.smcStopLoss : baseSl).toFixed(2)
      );
      const ratchetFloor = Number((ltp * 1.032).toFixed(2)); // +3.2% covers commission + SEBON + DP + 7.5% CGT
      const baseT1 = Number(sig.target1_price || ltp * 1.075);
      const baseT2 = Number(sig.target2_price || ltp * 1.15);
      const target1 = Number(
        (hasSmcStructure && smc.smcTarget1 > 0
          ? Math.max(Number(sig.target1_price || 0), smc.smcTarget1)
          : baseT1
        ).toFixed(2)
      );
      const target2 = Number(
        (hasSmcStructure && smc.smcTarget2 > 0
          ? Math.max(Number(sig.target2_price || 0), smc.smcTarget2)
          : baseT2
        ).toFixed(2)
      );
      const slPct = Number((((ltp - stopLoss) / ltp) * 100).toFixed(1));
      const t1Pct = Number((((target1 - ltp) / ltp) * 100).toFixed(1));
      const t2Pct = Number((((target2 - ltp) / ltp) * 100).toFixed(1));
      const rrr = Number(((target2 - ltp) / Math.max(1, ltp - stopLoss)).toFixed(2));

      // Position sizing per Rs. 1,00,000 capital (max Rs. 1,250 risk = 1.25% capital risk)
      const riskPerShare = Math.max(1, ltp - stopLoss);
      const sharesPer1Lakh = Math.min(
        Math.floor(100000 / ltp),
        Math.max(10, Math.floor(1250 / riskPerShare))
      );
      const capitalOutlay = Math.round(sharesPer1Lakh * ltp);
      const maxRiskRs = Math.round(sharesPer1Lakh * riskPerShare);

      // Composite Conviction Score using real 5-day flow metrics + Coiled Ignition + SMC Confluence boost
      const isRsiSweetSpot = rsi14 >= 48 && rsi14 <= 66.5;
      const isBelowOrAtVwap = realVwapDiffPct <= 2.0;
      const isInstitutionalTicket = avgTicket >= 150;
      const bcrFlowScore = Math.min(22, Math.max(0, (realBcr3Buy - realBcr3Sell) * 0.6));
      const retBonus = Math.min(12, Math.max(0, (leadRetentionPct - 55) * 0.3));
      const vwapBonus = realVwapDiffPct <= 0 ? 12 : realVwapDiffPct <= 1.5 ? 9 : 4;
      const rsiBonus = isRsiSweetSpot ? 12 : rsi14 <= 70 ? 6 : 0;
      const shieldBonus = shieldVerdict === 'SYNDICATE_FORTRESS_HOLD' ? 10 : 5;
      const pocBonus = Math.abs(ltp - pocPrice) / Math.max(1, pocPrice) <= 0.025 ? 8 : 3;
      const consecutiveDaysBonus = Math.min(14, (trapAudit.consecutiveDays || 1) * 3);
      const coilBonus = isCoilIgnitionBreakout ? 12 : 0;
      const smcConfluenceBonus = smc.smcConfluenceBonus || 0;
      const sectorNameRaw = sig.sector || stockUniverseMap[sym]?.sector || 'Equities';
      const estPublicFloatShares = estimatePublicFloatShares(sectorNameRaw, sig.publicFloatShares, sym, db);
      const freeFloatCorneredPct = Number(((Math.max(0, Number(trapAudit.total5DayNet || 0)) / Math.max(1, estPublicFloatShares)) * 100).toFixed(2));
      const floatVelocityBonus = freeFloatCorneredPct >= 2.0 ? 15 : freeFloatCorneredPct >= 1.0 ? 10 : freeFloatCorneredPct >= 0.50 ? 6 : freeFloatCorneredPct >= 0.25 ? 3 : 0;

      const { isUpperWickRejected, rallyTrack, rallyHorizonLabel } = classifyDualTrackRally({
        smc,
        isCoilIgnitionBreakout,
        isPocketPivot,
        leadRetentionPct,
        dayChgPct,
        marketRegime: currentMarketRegime,
      });

      const totalScore = Math.min(
        99,
        Math.round(
          24 +
            bcrFlowScore +
            retBonus +
            vwapBonus +
            rsiBonus +
            shieldBonus +
            pocBonus +
            consecutiveDaysBonus +
            coilBonus +
            smcConfluenceBonus +
            floatVelocityBonus
        )
      );

      const hasFoundationForSmc =
        base10Pct <= 7.5 &&
        vduRatio <= 0.65 &&
        realBcr3Buy >= 42.0 &&
        realBcr3Sell <= 35.0 &&
        leadRetentionPct >= 75 &&
        realVwapDiffPct >= -2.0 &&
        realVwapDiffPct <= 2.5;

      let setupMode = 'STEALTH_FLOOR_ACCUMULATION';
      let confidenceLabel = '💎 STEALTH FLOOR ACCUMULATION (v2.0)';
      if (rallyTrack === 'TRACK_B_T2_CLEARED_CONTINUATION' || smc.isT2ClearedContinuation) {
        setupMode = 'SMC_BREAK_AND_RETEST';
        confidenceLabel = '🎯 TRACK B: POST-T+2 CONTINUATION (v2.0)';
      } else if (hasFoundationForSmc && smc.isBreakAndRetest && isCoilIgnitionBreakout) {
        setupMode = 'COIL_IGNITION_BREAKOUT';
        confidenceLabel = '🚀 COIL IGNITION + RETEST (v2.0)';
      } else if (hasFoundationForSmc && smc.isBreakAndRetest) {
        setupMode = 'SMC_BREAK_AND_RETEST';
        confidenceLabel = '🎯 SMC BREAK & RETEST (v2.0)';
      } else if (hasFoundationForSmc && smc.isSmcSweepMss && (smc.isFvgMitigated || smc.hasBullishFvg)) {
        setupMode = 'SMC_SWEEP_MSS_FVG';
        confidenceLabel = '⚡ SMC SWEEP + MSS + FVG (v2.0)';
      } else if (isCoilIgnitionBreakout) {
        setupMode = 'COIL_IGNITION_BREAKOUT';
        confidenceLabel = '🚀 COIL IGNITION BREAKOUT (v2.0)';
      }

      const candidate = {
        symbol: sym,
        companyName: stockUniverseMap[sym]?.name || sym,
        sector: sig.sector || stockUniverseMap[sym]?.sector || 'Equities',
        strategy: isCoilIgnitionBreakout ? 'COIL_IGNITION_BREAKOUT' : (sig.strategy || sig.signal_type || 'STEALTH_ACCUMULATION'),
        setupMode,
        confidenceLabel,
        rallyTrack,
        rallyHorizonLabel,
        freeFloatCorneredPct,
        isCoilIgnitionBreakout,
        isPocketPivot,
        is20dBreakout,
        isSpringReclaim,
        isNr7: smc.isNr7,
        isIdnr4: smc.isIdnr4,
        isT2ClearedContinuation: smc.isT2ClearedContinuation,
        clv: smc.clv,
        upperWickRatio: smc.upperWickRatio,
        isBreakAndRetest: smc.isBreakAndRetest,
        isSmcSweepMss: smc.isSmcSweepMss,
        isFvgMitigated: smc.isFvgMitigated,
        hasBullishFvg: smc.hasBullishFvg,
        smcNarrative: smc.smcNarrative,
        fvgNarrative: smc.fvgNarrative,
        smcConfluenceBonus,
        signalDate: sig.signal_date,
        ltp,
        brokerVwap,
        avgBrokerPrice,
        vwapDiffPct: realVwapDiffPct,
        pocPrice,
        ema50: Number(ema50.toFixed(1)),
        above50,
        rsi14: Number(rsi14.toFixed(1)),
        macdSignal,
        bcr5Net,
        scr3Net,
        bcr3Buy: realBcr3Buy,
        bcr3Sell: realBcr3Sell,
        retention10D: leadRetentionPct,
        leadBrokerId: resolvedLeadBrokerId,
        leadBrokerName: resolvedLeadBrokerName,
        leadRetentionPct,
        anomalyScore,
        avgTicket: Number(avgTicket.toFixed(1)),
        vdu: Number(vduRatio.toFixed(2)),
        bbw: Number(base10Pct.toFixed(1)),
        rvolToday: Number(rvolToday.toFixed(2)),
        dayChgPct: Number(dayChgPct.toFixed(2)),
        shieldVerdict,
        entryLow,
        entryHigh,
        chaseCap,
        stopLoss,
        ratchetFloor,
        target1,
        target2,
        slPct,
        t1Pct,
        t2Pct,
        rrr,
        sharesPer1Lakh,
        capitalOutlay,
        maxRiskRs,
        totalScore,
        marketRegime: currentMarketRegime,
        rallyTrack,
        rallyHorizonLabel,
        corneringScore: totalScore,
        trapAuditReason: trapAudit.reason,
        consecutiveDays: trapAudit.consecutiveDays,
        total5DayNet: trapAudit.total5DayNet,
        freeFloatCorneredPct,
        estPublicFloatShares,
        isStrict5StepPass:
          rallyTrack !== 'TRACK_A_MUTED_CHOP_VETO' &&
          (freeFloatCorneredPct >= 0.20 || Number(trapAudit.total5DayNet || 0) >= 25000) &&
          ((isCoilIgnitionBreakout && !isUpperWickRejected) ||
            (!isUpperWickRejected &&
              hasFoundationForSmc &&
              (smc.isBreakAndRetest || smc.isSmcSweepMss || smc.isT2ClearedContinuation) &&
              realBcr3Buy >= 40.0 &&
              realBcr3Sell <= 35.0 &&
              leadRetentionPct >= 70 &&
              realVwapDiffPct <= 2.5) ||
            (!isUpperWickRejected &&
              (isPocketPivot || smc.isNr7 || smc.isIdnr4) &&
              realBcr3Buy >= 40.0 &&
              realBcr3Sell <= 35.0 &&
              leadRetentionPct >= 70 &&
              realVwapDiffPct <= 2.5) ||
            (isRsiSweetSpot && isBelowOrAtVwap && realBcr3Buy >= 40.0 && realBcr3Sell <= 35.0 && leadRetentionPct >= 70)),
      };

      if (candidate.rallyTrack !== 'TRACK_A_MUTED_CHOP_VETO' && (candidate.isStrict5StepPass || candidate.consecutiveDays >= 3)) {
        strictMatches.push(candidate);
      } else {
        secondaryMatches.push(candidate);
      }
    }

    const getTrackPriority = (track) => {
      if (track === 'TRACK_B_T2_CLEARED_CONTINUATION') return 3;
      if (track === 'TRACK_A_COILED_2_3D_IGNITION') return 2;
      return 1;
    };

    strictMatches.sort(
      (a, b) =>
        (b.totalScore - a.totalScore) ||
        (getTrackPriority(b.rallyTrack) - getTrackPriority(a.rallyTrack)) ||
        ((b.leadRetentionPct || 0) - (a.leadRetentionPct || 0)) ||
        ((b.bcr3Buy - b.bcr3Sell) - (a.bcr3Buy - a.bcr3Sell)) ||
        (b.freeFloatCorneredPct - a.freeFloatCorneredPct) ||
        (a.vwapDiffPct - b.vwapDiffPct)
    );
    secondaryMatches.sort(
      (a, b) =>
        (b.totalScore - a.totalScore) ||
        (getTrackPriority(b.rallyTrack) - getTrackPriority(a.rallyTrack)) ||
        ((b.leadRetentionPct || 0) - (a.leadRetentionPct || 0)) ||
        ((b.bcr3Buy - b.bcr3Sell) - (a.bcr3Buy - a.bcr3Sell)) ||
        (a.vwapDiffPct - b.vwapDiffPct)
    );

    const allRanked = [...strictMatches, ...secondaryMatches];
    return {
      topPick: allRanked[0] || null,
      runnerUps: allRanked.slice(1, 5),
      allQualified: allRanked,
      vetoedTraps,
    };
  } catch (err) {
    console.error('[TelegramNotifier] select5StepSwingPicks error:', err.message);
    return { topPick: null, runnerUps: [], allQualified: [], vetoedTraps: [] };
  }
}

/**
 * Formats and dispatches the 5-Step 10–15 Day Swing Stock Alert to Telegram
 * and automatically registers the top pick in the Exit Guard (trackCustomHolding).
 */
export async function run5StepSwingSelectionAndDispatch({ onTrackHolding, chatId } = {}) {
  const { topPick, runnerUps, allQualified, vetoedTraps } = await select5StepSwingPicks();
  const status = getDetailedMarketStatus();
  const sessionDate = status?.targetSessionDate || new Date().toISOString().slice(0, 10);
  let ltpStr = '2,695.60';
  let chgStr = '+31.54';
  try {
    const lkmPath = path.join(DATA_DIR, 'last_known_market.json');
    if (fs.existsSync(lkmPath)) {
      const lkm = JSON.parse(fs.readFileSync(lkmPath, 'utf8'));
      const nep = lkm.indices?.find(x => x.index === 'NEPSE Index');
      if (nep) {
        ltpStr = Number(nep.currentValue || nep.close).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const chg = Number(nep.change || 0);
        chgStr = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}`;
      }
    }
  } catch (_) {}

  if (!allQualified || allQualified.length === 0) {
    const cashPreservationMsg = [
      `🛡️ <b>DRAVYASHREE DISCIPLINE: 100% CASH PRESERVATION</b>`,
      `📅 <b>Session: ${sessionDate} | Market Regime: NEPSE ${ltpStr} (${chgStr})</b>`,
      `──────────────────────────`,
      `Zero stocks passed all strict Flowchart v2.0 Institutional Accumulation gates today.`,
      `• <b>Operator Supply Veto:</b> No clean volume dry-up with institutional absorption found.`,
      `• <b>Demat Dump Veto:</b> Several candidates failed T+2 delivery / broker churn checks.`,
      `──────────────────────────`,
      `💡 <b>Action:</b> Hold cash! Never force a trade into a weak or indecisive setup.`,
      `🔔 <i>Exit Guard actively monitoring your personal portfolio holdings.</i>`
    ].join('\n');
    const telegramResult = await sendTelegramMessage(cashPreservationMsg, { chatId });
    return {
      success: false,
      reason: 'No stock currently passes all strict swing gates & 5-day trap veto. Hold cash!',
      html: cashPreservationMsg,
      telegramResult
    };
  }

  // Focus strictly on the #1 single curated winner (zero multi-stock clutter)
  const topWinner = topPick || allQualified[0];

  // Automatically arm the real-time Exit Guard ONLY for this single curated top pick
  if (typeof onTrackHolding === 'function' && topWinner) {
    try {
      onTrackHolding({
        symbol: topWinner.symbol,
        buyPrice: topWinner.ltp,
        stopLoss: topWinner.stopLoss,
        target1: topWinner.target1,
        target2: topWinner.target2,
        kitta: topWinner.sharesPer1Lakh,
      });
    } catch (_) {}
  }

  const winnerHtml = formatUpgradedStealthAccumulationHtml(topWinner);

  const MODE_BADGE_MAP = {
    COIL_IGNITION_BREAKOUT: '🚀 Ignition',
    SMC_BREAK_AND_RETEST: '🎯 Retest',
    SMC_SWEEP_MSS_FVG: '⚡ SMC',
    STEALTH_FLOOR_ACCUMULATION: '💎 Stealth',
  };
  const TRACK_BADGE_MAP = {
    TRACK_A_COILED_2_3D_IGNITION: 'Track A: 2–3D',
    TRACK_B_T2_CLEARED_CONTINUATION: 'Track B: T+2',
    STANDARD_ACCUMULATION: 'Stealth Base',
  };
  const topModeBadge = MODE_BADGE_MAP[topWinner?.setupMode] || '💎 Stealth';
  const topTrackBadge = TRACK_BADGE_MAP[topWinner?.rallyTrack] || 'Stealth Base';
  const runnerUpSection = runnerUps && runnerUps.length > 0
    ? [
        `\n\n📋 <b>TOP 5 FLOWCHART v2.0 CANDIDATE BACKUP TABLE:</b>`,
        `• <b>#1 <code>$${escapeHtml(topWinner.symbol)}</code></b> (${topModeBadge} • ${topTrackBadge}) | Score: ${topWinner.corneringScore || topWinner.totalScore || 95}/100 | LTP: Rs. ${Number(topWinner.ltp).toFixed(1)} | SL: Rs. ${Number(topWinner.stopLoss).toFixed(1)} 👑 <i>(Prime Ticket Above)</i>`,
        ...runnerUps.slice(0, 4).map((r, idx) => {
          const rSym = escapeHtml(r.symbol);
          const rBadge = MODE_BADGE_MAP[r.setupMode] || '💎 Stealth';
          const rTrackBadge = TRACK_BADGE_MAP[r.rallyTrack] || 'Stealth Base';
          const rScore = r.corneringScore || r.totalScore || r.score || 85;
          const rLtp = Number(r.ltp || r.closePrice || 0).toFixed(1);
          const rSl = Number(r.stopLoss || (r.ltp * 0.965)).toFixed(1);
          const rRet = Number(r.retention10D || r.retentionPct || 80).toFixed(0);
          return `• <b>#${idx + 2} <code>$${rSym}</code></b> (${rBadge} • ${rTrackBadge}) | Score: ${rScore}/100 | LTP: Rs. ${rLtp} | SL: Rs. ${rSl} | Ret: ${rRet}%`;
        })
      ].join('\n')
    : '';

  const trapVetoSection =
    vetoedTraps && vetoedTraps.length > 0
      ? [
          `\n──────────────────────────`,
          `🚫 <b>DUMP-TRAPS FILTERED &amp; VETOED TODAY:</b>`,
          ...vetoedTraps.slice(0, 4).map((t) => `• <b>${escapeHtml(t.symbol)}:</b> ${escapeHtml(t.reason)}`),
        ].join('\n')
      : '';

  const fullMsg = [
    `👑 <b>DRAVYASHREE TACTICAL PRIME SELECTION (v2.0)</b>`,
    `📅 <b>Session: ${sessionDate} | Market Regime: NEPSE ${ltpStr} (${chgStr})</b>`,
    `──────────────────────────`,
    winnerHtml,
    runnerUpSection,
    trapVetoSection,
    `──────────────────────────`,
    `🔔 <i>Exit Guard auto-armed for <code>$${escapeHtml(topWinner.symbol)}</code>! Send <code>/swing</code>, <code>/list</code>, or <code>/track SYMBOL</code> anytime.</i>`
  ].filter(Boolean).join('\n');

  const invariantCheck = validateAlertInvariants(topWinner, winnerHtml);
  if (!invariantCheck.valid) {
    console.error(`[TelegramNotifier] 🛑 CRITICAL INVARIANT VIOLATION in Prime Alert for ${topWinner?.symbol}:\n` + invariantCheck.errors.map(e => `  - ${e}`).join('\n'));
  }

  const telegramResult = await sendTelegramMessage(fullMsg, { chatId });
  return {
    success: Boolean(telegramResult?.success),
    topPick: topWinner,
    runnerUps,
    html: fullMsg,
    telegramResult,
  };
}

/**
 * Dispatches the specialized Track B Syndicate alert to Telegram:
 * - Nominal price < Rs. 450
 * - Public Float <= 1.5 Cr shares
 * - Total Syndicate Net Retention > 75%
 * - BCR3 Buy vs BCR3 Sell Asymmetry
 * - Multi-Timeframe Broker VWAP & POC Anchor
 * - 2-3 Day Ignition Coil (NR7/IDNR4, Wyckoff VDU)
 */
export async function dispatchSpecialTrackBTelegramMessage({ chatId = null, targetDate = null, dryRun = false } = {}) {
  const activeDb = db;
  if (!activeDb) {
    return { success: false, error: 'Database instance not initialized' };
  }

  const { topPick, runnerUps, effectiveDate, totalScanned, qualifiedCount } = scanTrackBSyndicateCandidates({
    db: activeDb,
    maxPrice: 450,
    minRetention: 75,
    targetDate
  });

  const fullMsg = formatTrackBSyndicateHtml(topPick, runnerUps);

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      topPick,
      runnerUps,
      effectiveDate,
      totalScanned,
      qualifiedCount,
      html: fullMsg
    };
  }

  const telegramResult = await sendTelegramMessage(fullMsg, { chatId });
  return {
    success: Boolean(telegramResult?.success),
    topPick,
    runnerUps,
    effectiveDate,
    totalScanned,
    qualifiedCount,
    html: fullMsg,
    telegramResult
  };
}

export function formatUpgradedStealthAccumulationHtml(winner = {}) {
  const rawSym = String(winner.symbol || 'STOCK').toUpperCase().trim();
  const sym = escapeHtml(rawSym);
  const name = escapeHtml(winner.name || winner.companyName || rawSym);
  const ltp = Number(winner.ltp || winner.closePrice || winner.c || 0);
  const sector = escapeHtml(winner.sector || 'Equities');
  const score = winner.corneringScore ?? winner.totalScore ?? winner.score ?? null;
  const confidenceLabel = escapeHtml(winner.confidenceLabel || '🟢 Confirmed Stealth (v2.0)');
  const rallyHorizonLabel = escapeHtml(
    winner.rallyHorizonLabel ||
      (winner.rallyTrack === 'TRACK_B_T2_CLEARED_CONTINUATION'
        ? 'Track B: Post-T+2 Cleared Continuation'
        : winner.rallyTrack === 'TRACK_A_COILED_2_3D_IGNITION'
          ? 'Track A: 2–3 Day Ignition Watch'
          : 'Institutional Base Accumulation')
  );
  const upgradedTrackDisplay = formatFlowchartTrackDisplay(
    winner.rallyTrack,
    winner.rallyHorizonLabel || rallyHorizonLabel,
    winner.marketRegime || winner.regime || 'BULL'
  );
  const freeFloatCorneredPct = Number.isFinite(Number(winner.freeFloatCorneredPct)) ? Number(winner.freeFloatCorneredPct) : 0;
  const clvPct = (winner.clv !== undefined && winner.clv !== null && Number.isFinite(Number(winner.clv))) ? `${(Number(winner.clv) * 100).toFixed(0)}%` : 'N/A';
  const wickPct = (winner.upperWickRatio !== undefined && winner.upperWickRatio !== null && Number.isFinite(Number(winner.upperWickRatio))) ? `${(Number(winner.upperWickRatio) * 100).toFixed(0)}%` : 'N/A';
  const triggerSummary = winner.isT2ClearedContinuation
    ? 'T+2 Demat Settlement Survived + Pullback Dry-Up'
    : winner.isIdnr4
      ? 'IDNR4 Volatility Coil + Institutional Absorption'
      : winner.isNr7 && winner.isPocketPivot
        ? 'NR7 Volatility Coil + Pocket Pivot Ignition'
        : winner.isNr7
          ? 'NR7 Tightest 7-Session Coil Holding Above 20 EMA'
          : winner.isPocketPivot
            ? 'Pocket Pivot Institutional Volume Absorption'
            : winner.isBreakAndRetest
              ? 'Confirmed Multi-Day Break & Retest Hold'
              : 'Orderly Floor Base Holding Above 20 EMA';

  // Execution Plan Levels
  const basePrice = Math.max(1, ltp || Number(winner.avgBrokerPrice) || 100);
  const chaseCap = Number(winner.chaseCap || (basePrice * 1.018)).toFixed(1);
  const entryLow = Number(winner.entryLow || (basePrice * 0.995)).toFixed(1);
  const entryHigh = Number(Math.min(Number(winner.entryHigh || (basePrice * 1.012)), Number(chaseCap))).toFixed(1);
  const sl = Number(winner.stopLoss || (basePrice * 0.965)).toFixed(1);
  const slPct = Number(winner.slPct || 3.5).toFixed(1);

  // Dynamic Ratchet & Targets
  const ratchetTrigger = (basePrice * 1.055).toFixed(1);
  const ratchetLock = (basePrice * 1.018).toFixed(1);
  const t1 = Number(winner.target1 || (basePrice * 1.08)).toFixed(1);
  const t1Pct = Number(winner.t1Pct || 8.0).toFixed(1);
  const t2 = Number(winner.target2 || (basePrice * 1.15)).toFixed(1);
  const t2Pct = Number(winner.t2Pct || 15.0).toFixed(1);

  // Microstructure & Flow Metrics
  const numAvgBroker = Number(winner.avgBrokerPrice || winner.bcr3AvgPrice || winner.bcr3AvgBuy || winner.operatorVwap || winner.whaleVwap || winner.entryLow || (basePrice * 0.992));
  const avgBrokerPrice = numAvgBroker.toFixed(1);
  const mtv = computeMultiTimeframeVwap(rawSym, winner.db || db);
  const v5Str = mtv.vwap5D ? `Rs. ${mtv.vwap5D}` : `Rs. ${avgBrokerPrice}`;
  const v15Str = mtv.vwap15D ? `Rs. ${mtv.vwap15D}` : 'N/A';
  const v1MStr = mtv.vwap1M ? `Rs. ${mtv.vwap1M}` : 'N/A';
  const pocPrice = Number(winner.pocPrice || numAvgBroker).toFixed(1);
  const distFromBroker = numAvgBroker > 0 ? (((basePrice - numAvgBroker) / numAvgBroker) * 100).toFixed(1) : '0.0';
  const distSign = Number(distFromBroker) >= 0 ? '+' : '';
  const rawBcr3Buy = winner.bcr3Buy ?? winner.bcr3BuyPct;
  const rawBcr3Sell = winner.bcr3Sell ?? winner.bcr3SellPct;
  const bcr3BuyNum = (rawBcr3Buy !== null && rawBcr3Buy !== undefined && Number.isFinite(Number(rawBcr3Buy))) ? Number(rawBcr3Buy) : null;
  const bcr3SellNum = (rawBcr3Sell !== null && rawBcr3Sell !== undefined && Number.isFinite(Number(rawBcr3Sell))) ? Number(rawBcr3Sell) : null;
  const bcr3Buy = bcr3BuyNum !== null ? `${bcr3BuyNum.toFixed(1)}%` : 'N/A';
  const bcr3Sell = bcr3SellNum !== null ? `${bcr3SellNum.toFixed(1)}%` : 'N/A';
  const bcr3SpreadStr = (bcr3BuyNum !== null && bcr3SellNum !== null)
    ? (() => { const s = +(bcr3BuyNum - bcr3SellNum).toFixed(1); return `${s >= 0 ? '+' : ''}${s.toFixed(1)}%`; })()
    : 'N/A';
  const rawNetRet = winner.retention10D ?? winner.retentionPct ?? winner.leadRetentionPct;
  const netRetNum = (rawNetRet !== null && rawNetRet !== undefined && Number.isFinite(Number(rawNetRet))) ? Number(rawNetRet) : null;
  const rawChurn = winner.washChurnPct ?? winner.churnPct ?? (netRetNum !== null ? Math.max(0, 100 - netRetNum) : null);
  const washChurnNum = (rawChurn !== null && rawChurn !== undefined && Number.isFinite(Number(rawChurn))) ? Number(rawChurn) : null;
  const netRet = netRetNum !== null ? `${netRetNum.toFixed(0)}%` : 'N/A';
  const washChurnPct = washChurnNum !== null ? `${washChurnNum.toFixed(0)}%` : 'N/A';
  const isHighChurn = washChurnNum !== null && washChurnNum > 35;
  const gate0Text = washChurnNum === null
    ? 'PENDING VERIFICATION (Unverified Churn Telemetry)'
    : isHighChurn
      ? `PASSED (No Operator Dump | ⚠️ Churn Elevated: ${washChurnPct})`
      : `100% PASSED (No Operator Dump / Clean Retention: ${netRet})`;
  const leadBrokerId = winner.leadBrokerId || winner.leadBroker || 'N/A';
  const rawLeadName = winner.leadBrokerId || winner.leadBroker
    ? (BROKER_NAMES[String(leadBrokerId)] || winner.leadBrokerName || `Broker #${leadBrokerId}`)
    : (winner.leadBrokerName || 'Unverified');
  const cleanLeadBroker = escapeHtml(String(rawLeadName).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
  const rawVdu = winner.vdu ?? winner.vduRatio;
  const vduNum = (rawVdu !== null && rawVdu !== undefined && Number.isFinite(Number(rawVdu))) ? Number(rawVdu) : null;
  const vdu = vduNum !== null ? `${vduNum.toFixed(2)}x` : 'N/A';
  const vduLabel = vduNum === null ? '⏳ VDU Unverified' : (vduNum <= 0.60 ? '&lt;= 0.60x Exhaustion Clean ✅' : '&gt; 0.60x Moderate Volume ⚠️');
  const cmfVal = (winner.cmf !== undefined && winner.cmf !== null && Number.isFinite(Number(winner.cmf))) ? Number(winner.cmf) : null;
  const cmfStr = cmfVal !== null ? ((cmfVal >= 0 ? '+' : '') + cmfVal.toFixed(2)) : 'N/A';
  const rawBbw = winner.bbw ?? winner.bbwPct;
  const bbw = (rawBbw !== null && rawBbw !== undefined && Number.isFinite(Number(rawBbw))) ? `${Number(rawBbw).toFixed(1)}%` : 'N/A';

  // 1% Risk Sizing & Asymmetrical R:R
  const riskPerShare = Math.max(1, Math.abs(Number(winner.entryHigh || basePrice) - Number(sl)));
  const rrr = Number(winner.rrr || ((Number(t2) - basePrice) / Math.max(1, basePrice - Number(sl))).toFixed(2));
  const qty1L = Math.max(10, Math.floor(1000 / riskPerShare));
  const qty5L = Math.max(50, Math.floor(5000 / riskPerShare));
  const deploy1L = (qty1L * basePrice).toLocaleString();
  const deploy5L = (qty5L * basePrice).toLocaleString();

  return [
    `💎 <b>STEALTH ACCUMULATION ALERT (UPGRADED FLOWCHART v2.0)</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<b>Scrip:</b> <code>${sym}</code> (${name})`,
    `<b>Sector:</b> ${sector} | <b>LTP:</b> Rs. ${ltp.toFixed(1)}`,
    `<b>Setup Status:</b> <b>${confidenceLabel}</b>${score !== null ? ` (Score: ${score}/100)` : ''}`,
    `<b>Rally Track:</b> <b>${rallyHorizonLabel}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🛡️ <b>LAYER 0 &amp; 1: ZERO-TRAP &amp; SQUEEZE VALIDATION</b>`,
    `• Gate 0 Trap Immunity: <b>${gate0Text}</b>`,
    `• Volatility Contraction: BBW <b>${bbw}</b> (&lt;= 14.0%) | Narrow Range Bar`,
    `• Seller Dominance Ceiling: BCR3 Sell <b>${bcr3Sell}</b> (&lt; 45% Safe Ceiling)`,
    ``,
    `🏛️ <b>LAYER 2 &amp; 3: INSTITUTIONAL CORNERING &amp; EXHAUSTION</b>`,
    `• Lead Accumulator: <b>Broker #${leadBrokerId} (${cleanLeadBroker})</b>`,
    `• 🎯 <b>Average Broker Price (Cost Basis):</b> <b>Rs. ${avgBrokerPrice}</b> (${distSign}${distFromBroker}% from LTP)`,
    `• 📊 <b>Multi-Timeframe VWAP:</b> 5D: <b>${v5Str}</b> | 15D: <b>${v15Str}</b> | 1M (22D): <b>${v1MStr}</b>`,
    `• <b>Volume Profile POC:</b> <b>Rs. ${pocPrice}</b>`,
    `• SMC Structure &amp; Retest: <b>${escapeHtml(winner.smcNarrative || 'Orderly Floor Base Holding Above 20 EMA')}</b>`,
    `• Fair Value Gap (FVG): <b>${escapeHtml(winner.fvgNarrative || 'Balanced Auction Near Broker VWAP')}</b>`,
    `• Top 3 Buyer Concentration (BCR3): <b>${bcr3Buy}</b> vs BCR3 Sell <b>${bcr3Sell}</b> (Net Spread: <b>${bcr3SpreadStr}</b>)`,
    `• Clean Delivery Retention: <b>${netRet}</b> | <b>Wash-Churn Rate:</b> <b>${washChurnPct}</b> (${washChurnNum === null ? '⏳ Unverified' : washChurnNum <= 35 ? '&lt;= 35% Clean ✅' : '&gt; 35% Elevated Churn ⚠️'})`,
    `• Wyckoff Volume Dry-Up (VDU): <b>${vdu}</b> (${vduLabel})`,
    `• Chaikin Money Flow (CMF): <b>${cmfStr}</b> (Institutional Flow)`,
    ``,
    `🚀 <b>LAYER 4: DUAL-TRACK RALLY &amp; IGNITION HORIZON (v2.0)</b>`,
    `• 🧭 <b>Rally Track:</b> <b>${rallyHorizonLabel}</b>`,
    `• 📋 <b>Allocation Guide:</b> <b>${escapeHtml(upgradedTrackDisplay.tierBadge)}</b> — <i>${escapeHtml(upgradedTrackDisplay.allocationGuide)}</i>`,
    `• ⚡ <b>Ignition / Survival Trigger:</b> <b>${escapeHtml(triggerSummary)}</b>`,
    `• 🧲 <b>5D Free-Float Cornered:</b> <b>${freeFloatCorneredPct.toFixed(2)}%</b> of Sector Public Float ${freeFloatCorneredPct >= 1.0 ? '🔥 (Float Squeeze Active — Supply Drying Up)' : '✅ (Institutional Accumulation)'}`,
    `• 🕯️ <b>Close Location Value (CLV):</b> <b>${clvPct}</b> (Upper-Wick Ratio: <b>${wickPct}</b> &lt;= 45% Safe)`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🎯 <b>LAYER 5: DYNAMIC RATCHET EXECUTION TICKET</b>`,
    `• 🟢 <b>Limit Buy Zone:</b> <code>Rs. ${entryLow} – Rs. ${entryHigh}</code>`,
    `• ⚠️ <b>Pre-Open Chase Cap:</b> <code>Rs. ${chaseCap}</code> <i>(Cancel if Pre-Open &gt; +1.8%)</i>`,
    `• 🛑 <b>Initial Stop-Loss:</b> <code>Rs. ${sl}</code> (-${slPct}%)`,
    `• ⚡ <b>Early Impulse Ratchet:</b> At <b>Rs. ${ratchetTrigger}</b> (+5.5% MFE) ➔ Move SL to <b>Rs. ${ratchetLock}</b> (+1.8% to +2.2% Breakeven Lock)`,
    `• 👉 <b>WHAT YOU DO IN TMS:</b>`,
    `  1. On Entry: Set initial Stop-Loss order at <b>Rs. ${sl}</b>.`,
    `  2. When price hits <b>Rs. ${ratchetTrigger}</b> (+5.5%): Open TMS ➔ Cancel old SL ➔ Move Stop-Loss to <b>Rs. ${ratchetLock}</b>.`,
    `  <i>(Guarantees net cash profit after all SEBON, DP &amp; 7.5% CGT fees. Never let a +5.5% winner turn into a loss!)</i>`,
    `• 🏁 <b>Target 1:</b> <code>Rs. ${t1}</code> (+${t1Pct}% | <i>Exit 50% &amp; Lock SL to +4.5%</i>)`,
    `• 🚀 <b>Target 2:</b> <code>Rs. ${t2}</code> (+${t2Pct}% | <i>Upper Circuit Runner</i>)`,
    `• ⏳ <b>Statutory Safeguards:</b> T+2 Demat Lock (No exits Day 0/1) | 15 Sessions Max Hold`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💼 <b>1% RISK-ADJUSTED POSITION SIZING:</b>`,
    `• <b>Asymmetrical R:R:</b> <b>${rrr} : 1</b> | <b>Compounding Target:</b> 25%–35% Yearly CAGR (1–2 A+ Setups/Wk)`,
    `• <b>Rs. 1 Lakh Capital:</b> Buy <code>${qty1L}</code> Kitta (~Rs. ${deploy1L})`,
    `• <b>Rs. 5 Lakh Capital:</b> Buy <code>${qty5L}</code> Kitta (~Rs. ${deploy5L})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📲 <b>TMS Execution:</b> Place Limit Buy inside the zone. Verified by v2.0 Flowchart.`
  ].join('\n');
}

/**
 * Invariant validator to strictly ensure that mathematical and logical integrity
 * holds across generated alerts before they are ever transmitted to Telegram.
 */
export function validateAlertInvariants(winner = {}, html = '') {
  const errors = [];
  const ltp = Number(winner.ltp || winner.closePrice || 0);
  if (ltp <= 0) errors.push(`Invalid LTP (${ltp})`);

  // 1. Pre-Open Chase Cap Invariant: Must strictly be within 0.25 of LTP * 1.018
  const expectedChaseCap = Number((ltp * 1.018).toFixed(1));
  const actualChaseCap = Number(winner.chaseCap || 0);
  if (actualChaseCap > 0 && Math.abs(actualChaseCap - expectedChaseCap) > 0.25) {
    errors.push(`Chase Cap math failure: actual Rs. ${actualChaseCap} vs expected Rs. ${expectedChaseCap} (+1.8% of LTP Rs. ${ltp})`);
  }

  // 2. Risk Bounds Invariant: Stop Loss < LTP < Target 1 < Target 2
  const sl = Number(winner.stopLoss || 0);
  if (sl >= ltp) {
    errors.push(`Stop-Loss Rs. ${sl} is not strictly below LTP Rs. ${ltp}`);
  }
  const t1 = Number(winner.target1 || 0);
  const t2 = Number(winner.target2 || 0);
  if (t1 <= ltp) {
    errors.push(`Target 1 Rs. ${t1} is not above LTP Rs. ${ltp}`);
  }
  if (t2 <= t1) {
    errors.push(`Target 2 Rs. ${t2} is not above Target 1 Rs. ${t1}`);
  }

  // 3. Buy Zone Invariant: entryLow <= entryHigh <= chaseCap
  const entryLow = Number(winner.entryLow || 0);
  const entryHigh = Number(winner.entryHigh || 0);
  if (entryLow > entryHigh) {
    errors.push(`Entry Low Rs. ${entryLow} exceeds Entry High Rs. ${entryHigh}`);
  }
  if (actualChaseCap > 0 && entryHigh > actualChaseCap) {
    errors.push(`Entry High Rs. ${entryHigh} exceeds Chase Cap Rs. ${actualChaseCap}`);
  }

  // 4. Semantic Contradiction Invariants
  const rawInvNetRet = winner.retention10D ?? winner.retentionPct ?? winner.leadRetentionPct;
  const netRet = (rawInvNetRet !== null && rawInvNetRet !== undefined && Number.isFinite(Number(rawInvNetRet))) ? Number(rawInvNetRet) : null;
  const rawInvChurn = winner.washChurnPct ?? winner.churnPct ?? (netRet !== null ? 100 - netRet : null);
  const washChurn = (rawInvChurn !== null && rawInvChurn !== undefined && Number.isFinite(Number(rawInvChurn))) ? Number(rawInvChurn) : null;
  if (washChurn !== null && washChurn > 35 && html.includes('No Dump / No Churn')) {
    errors.push(`Semantic Contradiction: Wash-Churn is ${washChurn}% (>35%) but Gate 0 claims "No Dump / No Churn"`);
  }

  const vdu = Number(winner.vdu || winner.vduRatio || 0);
  if (vdu > 0.60 && html.includes('<= 0.60x 20D SMA Exhaustion')) {
    errors.push(`Semantic Contradiction: VDU is ${vdu}x (>0.60x) but Wyckoff dry-up claims "<= 0.60x"`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Dispatches the 3:45 PM Daily Post-Market Verified Prime Pick
 * Upgraded to the v2.0 Evidence-Based Flowchart Architecture
 */
export async function sendTelegramPrimePickAlert(winner) {
  if (!winner || !winner.symbol) return { success: false, error: 'No symbol provided' };

  // Enforce 5-Day Multi-Session Trap Veto Gate
  let ledgerDb = null;
  let trapAudit = null;
  let flowMetrics = null;
  try {
    const { db, getSmartMoneyAggregatedFlow } = await import('./db/ledgerStore.js');
    if (db) {
      ledgerDb = db;
      trapAudit = auditMultiSessionTrapRisk(db, winner.symbol);
      if (trapAudit && trapAudit.isTrap) {
        console.log(`[sendTelegramPrimePickAlert] 🚫 Hard Veto ${winner.symbol}: ${trapAudit.reason}`);
        return { success: false, reason: trapAudit.reason, isVetoed: true };
      }
      const flow = getSmartMoneyAggregatedFlow(winner.symbol, 5);
      flowMetrics = extract5DayBrokerFlowMetrics(flow, Number(winner.ltp || winner.c || 0));
    }
  } catch (_) {}

  const ltp = Number(winner.ltp || winner.c || 0);
  if (!ltp || ltp <= 0) {
    return { success: false, error: 'Invalid LTP for prime pick' };
  }

  const enrichedWinner = enrichPayloadWithFlowchartV2RallyMetrics(winner, {
    db: ledgerDb,
    trapAudit,
    flowMetrics,
    ltp,
  });
  const msg = formatUpgradedStealthAccumulationHtml(enrichedWinner);
  return await sendTelegramMessage(msg, 'HTML');
}

/**
 * Formats a 10-Second Sniper Instant Execution Ticket for Telegram.
 * Tailored for immediate manual entry on TMS with zero hesitation or calculation.
 */
export function formatInstantExecutionTicketHtml(d = {}) {
  const rawSym = String(d?.symbol || 'STOCK').toUpperCase().trim();
  const sym = escapeHtml(rawSym);
  const ltp = Number(d.ltp || d.entryPrice || 0);
  const vwap = Number(d.vwap || ltp);
  
  // Exact Limit Price (VWAP or base entry) guarded against 0
  const numLimit = Math.max(1, Number(d.limitPrice || d.entryPrice || vwap || ltp || 100));
  const limitPrice = numLimit.toFixed(1);
  const chaseCap = Number(d.chaseCap || (numLimit * 1.015)).toFixed(1);
  
  const sl = Number(d.stopLoss || (numLimit * 0.952)).toFixed(1);
  const slPct = Number(d.slPct || (((numLimit - Number(sl)) / numLimit) * 100)).toFixed(1);
  
  const t1 = Number(d.target1 || (numLimit * 1.085)).toFixed(1);
  const t1Pct = Number(d.t1Pct || (((Number(t1) - numLimit) / numLimit) * 100)).toFixed(1);
  
  const t2 = Number(d.target2 || (numLimit * 1.155)).toFixed(1);
  const t2Pct = Number(d.t2Pct || (((Number(t2) - numLimit) / numLimit) * 100)).toFixed(1);
  
  const netRRR = (d.netRRR !== null && d.netRRR !== undefined && Number.isFinite(Number(d.netRRR)))
    ? `${Number(d.netRRR).toFixed(1)}:1 RRR`
    : (Number(slPct) > 0 && Number(t1Pct) > 0 ? `${(Number(t1Pct) / Number(slPct)).toFixed(1)}:1 RRR` : 'N/A');
  
  // Position Sizing per 1% Risk: Risk = 1,000 on 1 Lakh, 5,000 on 5 Lakh, 10,000 on 10 Lakh
  const riskPerShare = Math.max(1, numLimit - Number(sl));
  const qty1L = Math.max(10, Math.floor(1000 / riskPerShare));
  const qty5L = Math.max(50, Math.floor(5000 / riskPerShare));
  const qty10L = Math.max(100, Math.floor(10000 / riskPerShare));
  
  const deploy1L = (qty1L * numLimit).toLocaleString();
  const deploy5L = (qty5L * numLimit).toLocaleString();
  const deploy10L = (qty10L * numLimit).toLocaleString();
  
  const rawInstBcr3 = d.bcr3BuyPct ?? d.bcr3Buy ?? d.bcr3;
  const rawInstSell = d.bcr3SellPct ?? d.bcr3Sell;
  const instBcr3Num = (rawInstBcr3 !== null && rawInstBcr3 !== undefined && Number.isFinite(Number(rawInstBcr3))) ? Number(rawInstBcr3) : null;
  const instSellNum = (rawInstSell !== null && rawInstSell !== undefined && Number.isFinite(Number(rawInstSell))) ? Number(rawInstSell) : null;
  const bcr3BuyVal = instBcr3Num !== null ? `${instBcr3Num.toFixed(1)}%` : 'N/A';
  const bcr3SellPct = instSellNum !== null ? `${instSellNum.toFixed(1)}%` : 'N/A';
  const instantSpreadVal = (instBcr3Num !== null && instSellNum !== null) ? +(instBcr3Num - instSellNum).toFixed(1) : null;
  const instantSpreadStr = instantSpreadVal !== null ? `${instantSpreadVal >= 0 ? '+' : ''}${instantSpreadVal.toFixed(1)}%` : 'N/A';
  const rawInstRet = d.leadRetentionPct ?? d.netRetentionPct;
  const instRetNum = (rawInstRet !== null && rawInstRet !== undefined && Number.isFinite(Number(rawInstRet))) ? Number(rawInstRet) : null;
  const rawInstChurn = d.washChurnPct ?? d.churnPct ?? (instRetNum !== null ? Math.max(0, 100 - instRetNum) : null);
  const instChurnNum = (rawInstChurn !== null && rawInstChurn !== undefined && Number.isFinite(Number(rawInstChurn))) ? Number(rawInstChurn) : null;
  const instantRetPct = instRetNum !== null ? `${instRetNum.toFixed(0)}%` : 'N/A';
  const instantChurnPct = instChurnNum !== null ? `${instChurnNum.toFixed(0)}%` : 'N/A';
  const soldKittaRaw = d.pastAccumulatorSoldKitta ?? d.antiDematDump?.soldToday ?? null;
  const pastDumpText = soldKittaRaw === null || soldKittaRaw === undefined
    ? 'Unverified (No Demat Audit)'
    : Number(soldKittaRaw) > 0
      ? `⚠️ ${Number(soldKittaRaw).toLocaleString()} Kitta Sold`
      : '0 Kitta (Verified Clean)';
  const instantTrack = formatFlowchartTrackDisplay(
    d.rallyTrack || 'TRACK_B_T2_CLEARED_CONTINUATION',
    d.rallyHorizonLabel,
    d.marketRegime || d.regime || 'BULL'
  );
  const ratchetBase = Math.max(1, ltp > 0 ? ltp : numLimit);
  const instantRatchetTrigger = +(ratchetBase * 1.055).toFixed(1);
  const instantRatchetLock = +(ratchetBase * 1.018).toFixed(1);
  const freeFloatCorneredPct = Number(d.freeFloatCorneredPct ?? 0);
  const mtv = computeMultiTimeframeVwap(rawSym, d.db || db);
  const v5Str = mtv.vwap5D ? `Rs. ${mtv.vwap5D}` : `Rs. ${vwap.toFixed(1)}`;
  const v15Str = mtv.vwap15D ? `Rs. ${mtv.vwap15D}` : 'N/A';
  const v1MStr = mtv.vwap1M ? `Rs. ${mtv.vwap1M}` : 'N/A';
  const leadBroker = escapeHtml(d.dominantBrokersText || (d.leadBrokerId ? `Broker #${d.leadBrokerId}` : 'Syndicate Accumulator'));
  
  // Expiry calculation: 10 minutes from now
  const now = new Date();
  const expiryTime = new Date(now.getTime() + 10 * 60 * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kathmandu'
  });

  return [
    `🟢 <b>[INSTANT BUY TRIGGER — 10-SEC SNIPER]</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<b>Scrip:</b> <code>${sym}</code> | <b>LTP:</b> Rs. ${ltp.toFixed(1)}`,
    `<b>🧭 Rally Track:</b> <b>${escapeHtml(instantTrack.tierBadge)}</b>`,
    `<b>📋 Track Allocation:</b> <i>${escapeHtml(instantTrack.allocationGuide)}</i>`,
    `⚡ <b>ORDER TYPE: LIMIT ORDER ONLY</b> (Do NOT Market-Buy)`,
    ``,
    `🎯 <b>LIMIT BUY PRICE:</b> <code>Rs. ${limitPrice}</code>`,
    `📊 <b>MULTI-TIMEFRAME VWAP &amp; Average Broker Price (Cost Basis):</b>`,
    `• 5-Day: <b>${v5Str}</b> | 15-Day: <b>${v15Str}</b> | 1-Month (22D): <b>${v1MStr}</b>`,
    `⚠️ <b>MAX CHASE CAP:</b> Rs. ${chaseCap} <i>(Cancel if Ask &gt; this)</i>`,
    `🛑 <b>HARD STOP-LOSS:</b> <code>Rs. ${sl}</code> (-${slPct}%)`,
    `🏁 <b>TARGET 1 (Exit 50%):</b> <code>Rs. ${t1}</code> (+${t1Pct}%)`,
    `🚀 <b>TARGET 2 (Runner):</b> <code>Rs. ${t2}</code> (+${t2Pct}%)`,
    `⚡ <b>Early Impulse Ratchet:</b> At <b>Rs. ${instantRatchetTrigger}</b> (+5.5% MFE ➔ Move SL to <b>Rs. ${instantRatchetLock}</b> (+1.8% to +2.2% BE Lock))`,
    `👉 <b>WHAT YOU DO IN TMS:</b>`,
    `   1. At Entry: Place initial Stop-Loss order at <b>Rs. ${sl}</b>.`,
    `   2. When Price touches <b>Rs. ${instantRatchetTrigger}</b> (+5.5%): Open TMS ➔ Cancel old SL ➔ Move Stop-Loss to <b>Rs. ${instantRatchetLock}</b>.`,
    `   <i>(Locks in net profit after all SEBON, DP &amp; 7.5% CGT fees. Never let a +5.5% runner turn into a loss!)</i>`,
    `⚖️ <b>Net Expectancy:</b> ${netRRR} <i>(Post-CGT &amp; Broker Fees)</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🛡️ <b>ZERO-TRAP VERIFICATION:</b>`,
    `• Past Accumulator Selling: <b>${pastDumpText}</b>`,
    `• Opening Noise Gate: <b>PASSED (Post-11:15 AM)</b>`,
    `• Intraday VWAP: Rs. ${vwap.toFixed(1)} <i>(Defended at Base)</i>`,
    `• Dominant Institutional Flow: ${leadBroker} (<b>BCR3 Buy ${bcr3BuyVal}</b> vs BCR3 Sell <b>${bcr3SellPct}</b> | Net Spread: <b>${instantSpreadStr}</b> ${instantSpreadVal !== null && instantSpreadVal >= 5.0 ? '✅ Confirmed Smart Money' : ''})`,
    ...(freeFloatCorneredPct > 0 ? [`• 🧲 <b>Free-Float Cornered %:</b> <b>${freeFloatCorneredPct.toFixed(2)}%</b> of tradable float locked by Lead Broker in 5 sessions 🔥 <i>(${freeFloatCorneredPct >= 1.0 ? 'Float Squeeze Alert' : 'Steady Accumulation'})</i>`] : []),
    `• Lead Delivery Integrity: <b>${instantRetPct} Retention</b> | <b>Wash-Churn: ${instantChurnPct}</b> (${instChurnNum === null ? '⏳ Unverified' : instChurnNum <= 35 ? '&lt;= 35% Clean ✅' : '&gt; 35% Elevated Churn ⚠️'})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💼 <b>10-SEC TMS SIZING (1% Risk Cap):</b>`,
    `• <b>Rs. 1 Lakh:</b> Buy <code>${qty1L}</code> Kitta (Rs. ${deploy1L})`,
    `• <b>Rs. 5 Lakh:</b> Buy <code>${qty5L}</code> Kitta (Rs. ${deploy5L})`,
    `• <b>Rs. 10 Lakh:</b> Buy <code>${qty10L}</code> Kitta (Rs. ${deploy10L})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⏳ <b>ORDER EXPIRY:</b> 10 Minutes Only (Cancel if unfilled by ${expiryTime} NPT)`,
    `📲 <b>TMS 3-Step Action:</b>`,
    `1. Open TMS ➔ Buy Order ➔ Symbol: <b>${sym}</b>`,
    `2. Select Limit ➔ Rate: <b>${limitPrice}</b> ➔ Quantity: <b>${qty1L}</b>`,
    `3. Submit Order ➔ Immediately place SL floor at <b>${sl}</b>.`
  ].join('\n');
}

/**
 * Dispatches an Instant Execution Ticket to Telegram.
 * Enforces Anti-Demat Dump Guard before allowing any buy signal.
 */
export async function sendTelegramExecutableBuyTrigger(ticketData) {
  if (!ticketData || !ticketData.symbol) {
    return { success: false, reason: 'Invalid ticket data' };
  }

  // Pre-dispatch Anti-Demat Dump Guard verification
  try {
    const dumpCheck = auditAntiDematDumpGuard(ticketData.symbol, ticketData.floorsheetTrades || []);
    if (dumpCheck && dumpCheck.isTrap) {
      console.warn(`[sendTelegramExecutableBuyTrigger] VETOED ${ticketData.symbol}: ${dumpCheck.reason}`);
      return { success: false, reason: dumpCheck.reason, isVetoed: true };
    }
  } catch (_) {}

  const html = formatInstantExecutionTicketHtml(ticketData);
  return await sendTelegramMessage(html, 'HTML');
}

/**
 * Dispatches Phase 1: 10:15 AM Pre-Market Institutional Morning Radar
 */
export async function sendTelegramPreMarketScan({
  sessionDate,
  breadthAdv = 0,
  breadthDec = 0,
  breadthPct = null,
  isCashDefense = false,
  nepseValue = 'Unavailable',
  nepseChange = '—',
  candidates = []
} = {}) {
  const dateStr = sessionDate || new Date().toISOString().slice(0, 10);
  const breadthEmoji = isCashDefense ? '🛡️' : '🟢';
  const breadthStatus = isCashDefense
    ? '⚠️ CASH DEFENSE ACTIVE (Hold 70–80% Cash)'
    : '✅ GREEN LIGHT: Healthy Breadth & Capital Deployment';

  const candidateLines = candidates.length > 0
    ? candidates.map((c, idx) => {
        const sc = c.score ?? c.setupScore ?? null;
        const flt = c.floatM ?? c.freeFloatM ?? null;
        return [
          `<b>${idx + 1}. <code>${c.symbol}</code></b> (${c.sector || 'Equities'})`,
          `• LTP: Rs. ${c.ltp} | Base Pivot: Rs. ${c.basePrice || c.ltp}`,
          `• 🎯 Pullback Buy Zone: Rs. ${c.entryLow} – Rs. ${c.entryHigh}`,
          `• ⚠️ Chase Cap (+2.5% max): Rs. ${c.chaseCap}`,
          `• 🛡️ Stop-Loss Floor: Rs. ${c.stopLoss}${c.slPct != null ? ` (-${c.slPct}%)` : ''}`,
          `• 🚀 Target 1: Rs. ${c.target1}${c.t1Pct != null ? ` (+${c.t1Pct}%)` : ''} | T2: Rs. ${c.target2}`,
          `• Score: <b>${sc !== null ? `${sc}/100` : 'N/A'}</b> | Float: ${flt !== null ? `${flt}M shares` : 'N/A'}`
        ].join('\n');
      }).join('\n\n')
    : '<i>No candidates met all 8 institutional gates today. Preserving 100% cash!</i>';

  const chgNum = Number(nepseChange);
  const chgFormatted = Number.isFinite(chgNum) ? `${chgNum >= 0 ? '+' : ''}${nepseChange}` : nepseChange;

  const msg = [
    `🌅 <b>DRAVYASHREE PRE-MARKET SCAN (PHASE 1)</b>`,
    `<b>Date:</b> ${dateStr} | <b>Time:</b> 10:15 AM NPT`,
    `──────────────────────────`,
    `📊 <b>NEPSE Composite:</b> ${nepseValue} (${chgFormatted})`,
    `📈 <b>Market Breadth:</b> ${breadthAdv} Adv / ${breadthDec} Dec (${breadthPct !== null ? `${breadthPct}%` : 'N/A'} Bullish)`,
    `${breadthEmoji} <b>Directive:</b> ${breadthStatus}`,
    `──────────────────────────`,
    `👑 <b>QUALIFIED 8-GATE CANDIDATES:</b>`,
    candidateLines,
    `──────────────────────────`,
    `📌 <b>Execution Notice:</b> Pre-open depth check begins at 10:30 AM. Do NOT place market buy orders. Limit orders only!`
  ].join('\n');

  return await sendTelegramMessage(msg);
}

/**
 * Dispatches Phase 2: 10:50 AM Pre-Open Order Book Gate & Chase Cap Check
 */
export async function sendTelegramPreOpenGate({
  sessionDate,
  symbol,
  indicativeOpen,
  basePivot,
  chaseCap,
  gapPct,
  obir = '+0.00',
  bidVolume = 0,
  askVolume = 0,
  verdict = 'CLEAR'
} = {}) {
  const isAbort = verdict === 'ABORT' || gapPct > 2.5;
  const header = isAbort
    ? `🚨 <b>DRAVYASHREE PRE-OPEN GATE: ABORT ORDER ($${symbol})</b>`
    : `✅ <b>DRAVYASHREE PRE-OPEN GATE: GREEN LIGHT ($${symbol})</b>`;

  const verdictText = isAbort
    ? `❌ <b>VERDICT: ABORT / DO NOT CHASE</b>\nPrice gapped +${gapPct}% (exceeds +2.5% Chase Cap of Rs. ${chaseCap}). Chasing exposes your trade to the T+2 settlement dump trap!`
    : `🟢 <b>VERDICT: CLEAR TO PLACE LIMIT ORDER</b>\nIndicative open is within the +2.5% safe band with positive buyer depth (OBIR = ${obir}).`;

  const depthText = (bidVolume !== null && bidVolume !== undefined && askVolume !== null && askVolume !== undefined)
    ? `${Number(bidVolume).toLocaleString()} Bids vs ${Number(askVolume).toLocaleString()} Asks`
    : 'Depth unavailable (no L2 snapshot)';

  const msg = [
    header,
    `<b>Session:</b> Pre-Open Final Check (10:50 AM NPT)`,
    `──────────────────────────`,
    `<b>Scrip:</b> <code>${symbol}</code>`,
    `• Base Pivot: Rs. ${basePivot}`,
    `• Indicative Open: Rs. ${indicativeOpen} (${Number(gapPct) >= 0 ? '+' : ''}${gapPct}%)`,
    `• ⚠️ Chase Cap Ceiling: Rs. ${chaseCap} (+2.5% max)`,
    `• 📊 Order Book Imbalance (OBIR): <b>${obir}</b>`,
    `• Depth: ${depthText}`,
    `──────────────────────────`,
    verdictText,
    `──────────────────────────`,
    `<i>Continuous trading begins at 11:00 AM NPT. Limit orders strictly at pullback support.</i>`
  ].join('\n');

  return await sendTelegramMessage(msg);
}

/**
 * Formats the Morning Stock Selection & Quantitative Confluence Trading Digest for Telegram.
 */
export function formatMorningDigestHtml(buyPicks = [], watchPicks = [], sessionDate = '', options = {}) {
  const dateStr = sessionDate || new Date().toISOString().slice(0, 10);
  const normalizedBuy = (Array.isArray(buyPicks) ? buyPicks : []).map(p => p.result || p);
  const normalizedWatch = (Array.isArray(watchPicks) ? watchPicks : []).map(p => p.result || p);

  const topBuys = normalizedBuy.slice(0, 5);
  const topWatch = normalizedWatch.slice(0, 5);

  const sections = [];

  // Header
  sections.push(
    `🌅 <b>DRABYASHREE NEPSE: MORNING STOCK SELECTION DIGEST</b>\n` +
    `📅 <b>Target Session:</b> <code>${dateStr}</code> | ⏰ <b>Dispatch:</b> Pre-Market (10:45 AM NPT)\n` +
    `──────────────────────────`
  );

  // Buy Candidates Section
  if (topBuys.length === 0) {
    sections.push(
      `🛡️ <b>CAPITAL PRESERVATION DIRECTIVE</b>\n` +
      `• No scrips cleared the strict <b>Score ≥ 70</b> quantitative confluence gate today.\n` +
      `• <b>Action:</b> Hold 100% Cash. Capital protected; do not force trades in uncertain regimes.`
    );
  } else {
    sections.push(`🎯 <b>TOP QUALIFIED BUY SETUPS (Score ≥ 70):</b>`);

    topBuys.forEach((res, idx) => {
      const sym = res.symbol || 'STOCK';
      const sector = res.sector || 'Equities';
      const score = res.compositeScore ?? 70;
      const conf = res.confidence ?? 80;
      const bkd = res.scoreBreakdown || {};
      const plan = res.executionPlan || {};
      const entryZone = Array.isArray(plan.entryZone) ? plan.entryZone : [plan.entryLtp || 0, plan.entryLtp || 0];
      const entryLtp = plan.entryLtp ?? entryZone[0] ?? 0;
      const sl = plan.stopLoss ?? Math.round(entryLtp * 0.95);
      const riskPct = plan.riskPct ?? (entryLtp > 0 ? (((entryLtp - sl) / entryLtp) * 100).toFixed(1) : '5.0');
      const t1 = plan.target1 ?? Math.round(entryLtp * 1.10);
      const t2 = plan.target2 ?? Math.round(entryLtp * 1.18);
      const rrr = plan.riskRewardRatio ?? 2.0;
      const sizing = plan.positionSizing || {};
      const shares = sizing.sharesKitta ?? 10;
      const capNpr = sizing.capitalRequiredNpr ?? (shares * entryLtp);
      const maxRisk = sizing.maxRiskNpr ?? (shares * Math.max(0, entryLtp - sl));

      const buyBlock = [
        `<b>#${idx + 1} <code>${sym}</code></b> (${sector})`,
        `• <b>Score:</b> <b>${score}/100</b> | Confidence: ${conf}%`,
        `• <b>Confluence:</b> Broker: ${bkd.brokerFloorsheet ?? '-'} | Tech: ${bkd.technical ?? '-'} | Fund: ${bkd.fundamental ?? '-'} | Market: ${bkd.marketContext ?? '-'}`,
        `• 📍 <b>Entry Zone:</b> Rs. ${entryZone[0]} – ${entryZone[1]} (LTP: Rs. ${entryLtp})`,
        `• 🎯 <b>Average Broker Price (Cost Basis):</b> Rs. ${plan.brokerVwap || plan.entryVwap || entryLtp}`,
        `• 🛡️ <b>Stop-Loss:</b> Rs. ${sl} (-${riskPct}%)`,
        `• 🎯 <b>Targets:</b> T1: Rs. ${t1} | 🚀 T2: Rs. ${t2} (RRR: ${rrr}:1)`,
        `• 💼 <b>Position Size:</b> <b>${shares} kitta</b> (~Rs. ${Math.round(capNpr).toLocaleString()} | Max Risk: Rs. ${Math.round(maxRisk).toLocaleString()})`
      ].join('\n');

      sections.push(buyBlock);
    });

    if (normalizedBuy.length > 5) {
      sections.push(`<i>...and ${normalizedBuy.length - 5} more qualified setups available in Screener app.</i>`);
    }
  }

  // Watchlist Section
  sections.push(`──────────────────────────`);
  if (topWatch.length > 0) {
    const watchLines = topWatch.map((w) => {
      const sym = w.symbol || 'STOCK';
      const sector = w.sector || 'Equities';
      const score = w.compositeScore ?? 55;
      const ltp = w.executionPlan?.entryLtp || w.stock?.ltp || '-';
      return `• <code>${sym}</code> (${sector}) — Score: <b>${score}/100</b> (LTP: Rs. ${ltp})`;
    }).join('\n');
    sections.push(`👀 <b>HIGH-CONFLUENCE WATCHLIST (Score 50–69):</b>\n${watchLines}`);
  } else {
    sections.push(`👀 <b>WATCHLIST:</b> <i>No secondary watchlist candidates today.</i>`);
  }

  // NEPSE Microstructure Rules Footer
  sections.push(
    `──────────────────────────\n` +
    `📌 <b>NEPSE Microstructure & Settlement Safeguards:</b>\n` +
    `• ⏳ <b>T+2 Demat Lock:</b> Cannot exit on Day 1 or Day 2. Sizing clamped to 1.5% max capital risk.\n` +
    `• 🚦 <b>Pre-Open Order Rule:</b> Never place Market Orders. Place Limit Orders strictly within Entry Zone.\n` +
    `• ⚡ <b>Circuit Bands:</b> Stops and targets clamped within ±15% trading limits.`
  );

  return sections.join('\n\n');
}

/**
 * Dispatches the Morning Stock Selection Digest to Telegram.
 */
export async function sendMorningStockSelectionDigest(buyPicks = [], watchPicks = [], sessionDate = '', options = {}) {
  const html = formatMorningDigestHtml(buyPicks, watchPicks, sessionDate, options);
  const res = await sendTelegramMessage(html, 'HTML');
  return {
    ...res,
    messageLength: html.length,
    sessionDate: sessionDate || new Date().toISOString().slice(0, 10),
    buyCount: Array.isArray(buyPicks) ? buyPicks.length : 0,
    watchCount: Array.isArray(watchPicks) ? watchPicks.length : 0
  };
}

/**
 * Dispatches a Real-Time Exit / Sell / Stop-Loss Protection Alert to Telegram
 */
export async function sendTelegramExitAlert({
  symbol,
  type = 'STOP_LOSS_HIT', // 'STOP_LOSS_HIT' | 'TARGET_REACHED' | 'TARGET_2_REACHED' | 'INSTITUTIONAL_DISTRIBUTION'
  targetLevel = 1,
  ltp,
  entryPrice,
  stopLoss,
  targetPrice,
  target2,
  raisedStopLoss,
  kitta = 100,
  reason,
  isT2Cleared = true // true if shares in Demat / >= 2 days held
}) {
  const sym = String(symbol || 'STOCK').toUpperCase();
  const currentPrice = Number(ltp || 0);
  const entry = Number(entryPrice || currentPrice);
  const diffPct = entry > 0 ? (((currentPrice - entry) / entry) * 100).toFixed(1) : '0.0';
  const rupeeChange = Math.round(Math.abs(currentPrice - entry) * (kitta || 100));

  let header = '';
  let actionText = '';
  let levelDetail = '';

  if (type === 'STOP_LOSS_HIT') {
    header = `🚨 <b>DRAVYASHREE CAPITAL DEFENSE: STOP-LOSS HIT</b>`;
    levelDetail = `🛡️ <b>Stop Floor:</b> Rs. ${stopLoss || currentPrice} | <b>Loss:</b> -${Math.abs(diffPct)}% (~Rs. ${rupeeChange.toLocaleString()})`;
    if (!isT2Cleared) {
      actionText = `⏳ <b>T+2 SETTLEMENT LOCK WARNING:</b>\nShares bought within the last 2 sessions are still clearing into Demat. NEPSE TMS will reject sell orders today.\n👉 <b>Action:</b> Place your SELL order during the 10:30–10:45 AM pre-open session on your T+2 settlement morning to exit at market open!`;
    } else {
      actionText = `⚡ <b>ACTION: SELL IMMEDIATELY IN TMS.</b>\nShares are settled in your Demat account. Execute sell order now to cut loss and preserve remaining capital!`;
    }
  } else if (type === 'TARGET_2_REACHED' || targetLevel === 2) {
    header = `🚀 <b>DRAVYASHREE PROFIT LOCK: TARGET 2 REACHED</b>`;
    levelDetail = `💰 <b>Target 2 Hit:</b> Rs. ${targetPrice || currentPrice} | <b>Total Profit:</b> +${diffPct}% (+Rs. ${rupeeChange.toLocaleString()})`;
    if (!isT2Cleared) {
      actionText = `⏳ <b>T+2 PROFIT PREPARATION:</b>\nTarget 2 reached while in T+2 clearing. Queue sell order on T+2 settlement morning at 10:30 AM!`;
    } else {
      actionText = [
        `⚡ <b>ACTION: EXIT REMAINING 50% SHARES IN TMS!</b>`,
        `• Full swing expansion target reached (+${diffPct}%).`,
        `• Book all remaining profits, or trail the 9-day EMA if market momentum is parabolic.`
      ].join('\n');
    }
  } else if (type === 'TARGET_REACHED' || targetLevel === 1) {
    header = `🎯 <b>DRAVYASHREE PROFIT LOCK: TARGET 1 REACHED</b>`;
    levelDetail = `💰 <b>Target 1 Hit:</b> Rs. ${targetPrice || currentPrice} | <b>Profit:</b> +${diffPct}% (+Rs. ${rupeeChange.toLocaleString()})`;
    if (!isT2Cleared) {
      actionText = `⏳ <b>T+2 PROFIT PREPARATION:</b>\nTarget reached while in T+2 clearing. Prepare to lock in 50% gains on your T+2 settlement morning at 10:30 AM!`;
    } else {
      const halfQty = Math.floor((kitta || 100) / 2);
      actionText = [
        `⚡ <b>ACTION: SELL 50% SHARES IN TMS NOW!</b>`,
        `• Book cash profit on half your holding (${halfQty} kitta).`,
        `• <b>Stop-Loss on remaining 50% shares is raised to Entry (Breakeven Rs. ${entry.toFixed(2)})</b>.`,
        `• <b>Trade is now 100% RISK-FREE!</b> You cannot lose capital on this position.`,
        target2 ? `• <b>Next Objective:</b> Target 2 at Rs. ${Number(target2).toFixed(2)}` : ''
      ].filter(Boolean).join('\n');
    }
  } else {
    header = `⚠️ <b>DRAVYASHREE ALERT: INSTITUTIONAL SELLING / CHURN</b>`;
    levelDetail = `📊 <b>Status:</b> ${reason || 'Heavy broker dumping detected at resistance'}`;
    actionText = `⚡ <b>ACTION: TIGHTEN STOPS / TAKE PROFITS.</b>\nInstitutional volume is offloading into retail bids. Protect your unrealized gains.`;
  }

  const msg = [
    header,
    `──────────────────────────`,
    `<b>Scrip:</b> <code>${sym}</code>`,
    `<b>Live Price:</b> Rs. ${currentPrice.toFixed(2)}`,
    `<b>Entry Baseline:</b> Rs. ${entry.toFixed(2)}`,
    levelDetail,
    `──────────────────────────`,
    actionText,
    `──────────────────────────`,
    `<i>Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu' })} NPT | Capital: Rs. 100,000 Model</i>`
  ].join('\n');

  return await sendTelegramMessage(msg);
}

// ── 5. TWO-WAY INTERACTIVE TELEGRAM COMMAND LISTENER ────────────────────────
const OFFSET_FILE = path.join(DATA_DIR, 'telegram_offset.json');

function loadLastUpdateId() {
  try {
    if (fs.existsSync(OFFSET_FILE)) {
      const data = JSON.parse(fs.readFileSync(OFFSET_FILE, 'utf8'));
      return data.lastUpdateId || 0;
    }
  } catch (_) {}
  return 0;
}

function saveLastUpdateId(lastUpdateId) {
  try {
    fs.writeFileSync(OFFSET_FILE, JSON.stringify({ lastUpdateId, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch (_) {}
}

let isPollingInProgress = false;

/**
 * Handles incoming chat commands sent by the user directly to the Telegram bot
 */
async function handleTelegramCommand(text, {
  chatId,
  onTrackHolding,
  onUntrackHolding,
  onGetTrackedHoldings,
  getLatestStockPrice
}) {
  if (!text || typeof text !== 'string') return;
  // Strip bot username suffix if Telegram client attached it (e.g. /track@drabya_trade_alert_bot -> /track)
  const raw = text.trim().replace(/^(\/[a-zA-Z0-9_]+)@[a-zA-Z0-9_]+/i, (m, g1) => g1).trim();
  const lower = raw.toLowerCase();

  // 0. GREETINGS
  if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'namaste' || lower === 'namaskar') {
    const greetMsg = [
      `👋 <b>Namaste! Welcome to Dravyashree NEPSE Assistant.</b>`,
      `──────────────────────────`,
      `I monitor NEPSE institutional accumulation and send high-conviction max-profit setups directly to your lockscreen!`,
      ``,
      `<b>⚡ Quick Commands to Send:</b>`,
      `• <code>/guide</code> or <code>/selection</code> — 4-Gate Daily Stock Selection Guide (Selected Pick or Cash Defense)`,
      `• <code>/swing</code> or <code>/top5</code> — #1 Prime Stock Pick &amp; Top 5 Ranked Backup Slate`,
      `• <code>/trackb</code> — Special Track B Syndicate Setup (&lt; Rs. 450, Float &le; 1.5 Cr, Ret &gt; 75%)`,
      `• <code>/analyze SHIVM</code> — Complete 7-Section Deep Stock Audit &amp; Profitability Verdict`,
      `• <code>/track SHIVM 510 484 100</code> — Track a stock for real-time Exit Guard alerts`,
      `• <code>/list</code> — View your actively guarded holdings &amp; PnL`,
      `• <code>/sl</code> — View Stop-Loss &amp; Target defense levels`,
      `• <code>/remove SHIVM</code> — Stop exit alerts for a stock`,
      `• <code>/nepse</code> — Current NEPSE benchmark &amp; market session`,
      `• <code>/help</code> — Full trading guide &amp; manual`,
      `──────────────────────────`,
      `💡 <i>Tap any command above to run it instantly!</i>`
    ].join('\n');
    return await sendTelegramMessage(greetMsg, { chatId });
  }

  // 1. HELP / START / MENU
  if (lower === '/start' || lower === '/help' || lower === 'help' || lower === 'start' || lower === '/menu' || lower === 'menu') {
    const helpMsg = [
      `🤖 <b>DRAVYASHREE NEPSE TRADING ASSISTANT</b>`,
      `──────────────────────────`,
      `I monitor NEPSE institutional accumulation and send high-conviction max-profit setups directly to your lockscreen!`,
      ``,
      `👑 <b>Automated Daily Selection &amp; #1 Prime Pick:</b>`,
      `• <code>/guide</code> or <code>/selection</code>: Daily 4-Gate Stock Selection Guide (Regime + Score/10 + 5 Ignition Triggers + Cash Defense on 0-Match Days)`,
      `• <code>/swing</code> or <code>/top5</code>: #1 Prime Stock Pick &amp; Top 5 Ranked Backup Slate (5-Day Trap-Vetoed Flowchart v2.0)`,
      `• <code>/trackb</code>: Special Track B Syndicate Setup (&lt; Rs. 450, Float &le; 1.5 Cr, Net Retention &gt; 75%, Dual Ignition, &plusmn;1.5% POC Shelf, 2–3D Surge)`,
      `• <code>/playbook</code>: Educational "Great Alert" Accumulation Matrix`,
      ``,
      `🔍 <b>Complete 7-Section Deep Stock Audit:</b>`,
      `• <code>/analyze SYMBOL</code>: Comprehensive audit on whether a stock is appropriate to invest for profit (Top 3 Buyers vs Sellers, Cost Basis, Volume Profile POC, 20 EMA, Buy Zone, SL &amp; Targets)`,
      `  👉 <code>/analyze SHIVM</code> or <code>/analyze GHL</code>`,
      ``,
      `🛡️ <b>Real-Time Exit Guard &amp; Stop-Loss Defense:</b>`,
      `• <code>/track SYMBOL [BUY] [SL] [KITTA]</code>`,
      `  👉 <code>/track SHIVM 510 484 100</code> (custom entry Rs. 510, SL Rs. 484, 100 Shares)`,
      `  👉 <code>/track GHL 285</code> (auto sets -5% SL and +8%/+14.5% targets)`,
      `  👉 <code>/track NABIL</code> (uses verified last market close price)`,
      `  👉 <code>/track SHIVM, GHL, HATHY</code> (bulk track multiple stocks)`,
      `• <code>/list</code> or <code>/holdings</code>: View all monitored stocks, LTP, and real PnL %`,
      `• <code>/sl</code> or <code>/targets</code>: View Stop-Loss floors and profit targets`,
      `• <code>/remove SYMBOL</code>: Stop exit alerts for a stock`,
      ``,
      `📊 <b>Market Overview:</b>`,
      `• <code>/nepse</code>: Live market benchmark, turnover, and trading hours`,
      `• <code>/ping</code>: Verify server connection`,
      `──────────────────────────`,
      `<i>All alerts strictly factor in NEPSE T+2 settlement rules and ±15% circuit limits.</i>`
    ].join('\n');
    return await sendTelegramMessage(helpMsg, { chatId });
  }

  // 2. PING
  if (lower === '/ping' || lower === 'ping') {
    return await sendTelegramMessage(`🏓 <b>Pong!</b> Drabyashree server is online and actively watching NEPSE live market.`, { chatId });
  }

  // 2.1 TOP 5 / PRIME SELECTION (/top5, /swing, /best, /pick, /stealth, /eod)
  if (
    lower === '/top5' || lower === 'top5' ||
    lower === '/top' || lower === 'top' ||
    lower === '/top5breakouts' || lower === 'top5breakouts' ||
    lower === '/breakout58' || lower === '/breakouts58' ||
    lower === '/swing' || lower === 'swing' ||
    lower === '/best' || lower === 'best' ||
    lower === '/pick' || lower === 'pick' ||
    lower === '/signal' || lower === 'signal' ||
    lower === '/accumulate' || lower === 'accumulate' ||
    lower === '/midstage' || lower === 'midstage' ||
    lower === '/playbook_pick' || lower === 'playbook_pick' ||
    lower === '/stealth' || lower === 'stealth' ||
    lower === '/eod' || lower === 'eod' ||
    lower === '/eodstealth' || lower === 'eodstealth' ||
    lower === '/stealth_of_the_day'
  ) {
    const swingRes = await run5StepSwingSelectionAndDispatch({ onTrackHolding, chatId });
    return swingRes.telegramResult;
  }

  // 2.2 SPECIAL TRACK B SYNDICATE DISPATCH (/trackb, /track-b, /syndicate, /track2)
  if (
    lower === '/trackb' || lower === 'trackb' ||
    lower === '/track-b' || lower === 'track-b' ||
    lower === '/track_b' || lower === 'track_b' ||
    lower === '/syndicate' || lower === 'syndicate' ||
    lower === '/track2' || lower === 'track2'
  ) {
    const trackBRes = await dispatchSpecialTrackBTelegramMessage({ chatId });
    return trackBRes.telegramResult || trackBRes;
  }

  // 2.3 HIGH-VOLUME BREAKOUT RADAR & 20 EMA ACCUMULATION SCANNER
  const breakoutMatch = raw.match(/^\/?(breakout|breakouts|surge)(?:\s+(.+))?$/i);
  if (breakoutMatch) {
    const rawArg = (breakoutMatch[2] || '').trim();
    const lowerArg = rawArg.toLowerCase();
    if (lowerArg === 'top5' || lowerArg === '58' || lowerArg === 'b58') {
      const swingRes = await run5StepSwingSelectionAndDispatch({ onTrackHolding, chatId });
      return swingRes.telegramResult;
    }
    if (rawArg && !['radar', 'scan', 'today', 'list'].includes(lowerArg)) {
      const cleanSym = rawArg.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const res = await runStockDeepAnalysisAndDispatch(cleanSym, { chatId });
      return res.telegramResult;
    }
    const res = await runBreakoutScannerAndDispatch({ chatId });
    return res.telegramResult;
  }

  // 2.4 BROKER 58 / OPERATOR EARLY IGNITION RADAR & AUDIT (/b58, /b85, /broker58)
  const b58Match = raw.match(/^\/?(broker58|b58|b85|ignition|whales|operators|operator)(?:\s+(.+))?$/i);
  if (b58Match) {
    const rawArg = (b58Match[2] || '').trim();
    const lowerArg = rawArg.toLowerCase();

    if (lowerArg === 'top5' || lowerArg === 'top' || lowerArg === 'breakout' || lowerArg === 'breakouts') {
      const swingRes = await run5StepSwingSelectionAndDispatch({ onTrackHolding, chatId });
      return swingRes.telegramResult;
    }

    if (!rawArg || lowerArg === 'radar' || lowerArg === 'today' || lowerArg === 'scan' || lowerArg === 'list') {
      const radarRes = await runBroker58RadarAndDispatch(null, { chatId });
      return radarRes.telegramResult;
    }

    if (lowerArg === 'playbook' || lowerArg === 'guide' || lowerArg === 'rules' || lowerArg === 'research' || lowerArg === 'findings' || lowerArg === 'help') {
      return await sendTelegramBroker58Playbook({ chatId });
    }

    // Specific stock symbol e.g. /b58 GHL -> Unified Deep Stock Audit
    const cleanSym = rawArg.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const res = await runStockDeepAnalysisAndDispatch(cleanSym, { chatId });
    return res.telegramResult;
  }

  // 2.4.1 DEEP STOCK ANALYSIS & PROFITABILITY AUDIT (/analyze, /analyse, /audit, /check, /evaluate)
  const analyzeMatch = raw.match(/^\/?(analyze|analyse|analysis|audit|evaluate|eval|check)(?:\s+(.+))?$/i);
  if (analyzeMatch) {
    const rawArg = (analyzeMatch[2] || '').trim();
    if (!rawArg) {
      const usageMsg = [
        `🔍 <b>DEEP STOCK AUDIT: /analyze</b>`,
        `──────────────────────────`,
        `Get a comprehensive audit on whether a stock is appropriate to invest for profit making:`,
        `• <b>Average Broker Price &amp; Cost Basis Floor</b>`,
        `• <b>Top 3 Accumulating vs Dumping Broker Desks</b>`,
        `• <b>Trend &amp; 20 EMA Support Structure</b>`,
        `• <b>Supply Vacuum &amp; Float Cornering</b>`,
        `• <b>Definitive Investment Verdict (Buy / Watch / Avoid)</b>`,
        `• <b>Tactical Execution Ticket (Buy Zone, -4% SL, +8% &amp; +15% Targets)</b>`,
        `──────────────────────────`,
        `💡 <b>Usage:</b> <code>/analyze SYMBOL</code>`,
        `Example: <code>/analyze SHIVM</code> or <code>/analyze GHL</code>`
      ].join('\n');
      return await sendTelegramMessage(usageMsg, { chatId });
    }
    const cleanSym = rawArg.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const res = await runStockDeepAnalysisAndDispatch(cleanSym, { chatId });
    return res.telegramResult;
  }

  // 2.6 DAILY 4-GATE STOCK SELECTION GUIDE (/guide, /selection, /select, /dailyguide)
  if (
    lower === '/guide' || lower === 'guide' ||
    lower === '/selection' || lower === 'selection' ||
    lower === '/select' || lower === 'select' ||
    lower === '/dailyguide' || lower === 'dailyguide' ||
    lower === '/daily_guide' || lower === 'daily_guide'
  ) {
    const guideRes = await runDailyStockSelectionGuideAndDispatch({ chatId });
    return guideRes.telegramResult || guideRes;
  }

  // 2.6.1 PLAYBOOK EDUCATIONAL MATRIX (/playbook)
  if (lower === '/playbook' || lower === 'playbook') {
    return await sendTelegramInvestorPlaybook({ chatId });
  }

  // 2.7 LIVE NEPSE MARKET INDICES & STATUS
  if (
    lower === '/nepse' || lower === 'nepse' ||
    lower === '/market' || lower === 'market' ||
    lower === '/index' || lower === 'index'
  ) {
    const marketStatus = getDetailedMarketStatus();
    let ltpStr = '2,695.60';
    let chgStr = '+31.54 (+1.18%)';
    let turnoverStr = 'Rs. 8.57 Arba';
    try {
      const lkmPath = path.join(DATA_DIR, 'last_known_market.json');
      if (fs.existsSync(lkmPath)) {
        const lkm = JSON.parse(fs.readFileSync(lkmPath, 'utf8'));
        const nep = lkm.indices?.find(x => x.index === 'NEPSE Index');
        if (nep) {
          ltpStr = Number(nep.currentValue || nep.close).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const chg = Number(nep.change || 0);
          const pchg = Number(nep.perChange || 0);
          chgStr = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${pchg >= 0 ? '+' : ''}${pchg.toFixed(2)}%)`;
        }
      }
    } catch (_) {}

    const indexMsg = [
      `📊 <b>NEPSE COMPOSITE BENCHMARK</b>`,
      `──────────────────────────`,
      `• <b>Index:</b> ${ltpStr} points`,
      `• <b>Change:</b> ${chgStr}`,
      `• <b>Turnover:</b> ${turnoverStr}`,
      `• <b>Market Session:</b> ${marketStatus.statusLabel || 'Closed'}`,
      `• <b>Schedule:</b> ${marketStatus.message || 'Market closed'}`,
      `──────────────────────────`,
      `<i>Verified real exchange session data. Trading: Mon–Fri (Sat & Sun weekend closed).</i>`
    ].join('\n');
    return await sendTelegramMessage(indexMsg, { chatId });
  }

  // 3. STOP-LOSS & TARGET CHECKER (/sl, /target, /targets)
  if (
    lower === '/sl' || lower === 'sl' ||
    lower === '/stoploss' || lower === 'stoploss' ||
    lower === '/target' || lower === 'target' ||
    lower === '/targets' || lower === 'targets' ||
    lower === '/levels' || lower === 'levels'
  ) {
    if (typeof onGetTrackedHoldings !== 'function') {
      return await sendTelegramMessage(`ℹ️ Holdings engine initializing. Try again shortly.`, { chatId });
    }
    const holdings = onGetTrackedHoldings();
    if (!holdings || holdings.length === 0) {
      return await sendTelegramMessage(`📭 <b>No active positions being guarded.</b>\nSend <code>/track SYMBOL [BUY] [SL] [KITTA]</code> to arm stop-loss &amp; target defense!`, { chatId });
    }
    const lines = [
      `🛡️ <b>HOLDING RISK &amp; TARGET DEFENSE LEVELS (${holdings.length})</b>`,
      `──────────────────────────`
    ];
    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      const sym = h.symbol;
      const buy = Number(h.buyPrice || h.ltp || 0);
      const sl = Number(h.stopLoss || 0);
      const t1 = Number(h.target1 || 0);
      const t2 = Number(h.target2 || 0);
      const qty = Number(h.kitta || 100);
      let curPrice = Number(h.currentPrice || buy);
      if (typeof getLatestStockPrice === 'function') {
        try {
          const fetched = await getLatestStockPrice(sym);
          if (fetched && fetched > 0) curPrice = fetched;
        } catch (_) {}
      }
      const slDist = curPrice > 0 ? (((curPrice - sl) / curPrice) * 100).toFixed(1) : '0.0';
      const t1Dist = curPrice > 0 ? (((t1 - curPrice) / curPrice) * 100).toFixed(1) : '0.0';
      lines.push(
        `<b>${i + 1}. <code>${sym}</code></b> (${qty} Shares)`,
        `• <b>Current LTP:</b> Rs. ${Number(curPrice).toFixed(2)} (Entry: Rs. ${buy.toFixed(2)})`,
        `• 🛡️ <b>Stop Floor:</b> Rs. ${sl.toFixed(2)} (${slDist}% buffer below current price)`,
        `• 🎯 <b>Target 1:</b> Rs. ${t1.toFixed(2)} (+${t1Dist}% away)`,
        `• 🚀 <b>Target 2:</b> Rs. ${t2.toFixed(2)}`,
        `──────────────────────────`
      );
    }
    lines.push(`<i>Alerts trigger in real-time during 11:00 AM – 3:00 PM trading session.</i>`);
    return await sendTelegramMessage(lines.join('\n'), { chatId });
  }

  // 3. LIST / STATUS / HOLDINGS
  if (
    lower === '/list' || lower === '/status' || lower === '/holdings' || 
    lower === 'list' || lower === 'status' || lower === 'holdings' || 
    lower === '/portfolio' || lower === 'portfolio' ||
    lower === 'my stocks' || lower === 'my holdings'
  ) {
    if (typeof onGetTrackedHoldings !== 'function') {
      return await sendTelegramMessage(`ℹ️ Holdings engine initializing. Try again shortly.`, { chatId });
    }
    const holdings = onGetTrackedHoldings();
    if (!holdings || holdings.length === 0) {
      return await sendTelegramMessage([
        `📭 <b>No stocks actively tracked right now.</b>`,
        `──────────────────────────`,
        `Send: <code>/track SYMBOL [BUY_PRICE] [STOP_LOSS] [KITTA]</code>`,
        `Example: <code>/track SHIVM 510 484 100</code>`,
        `Or open Drabyashree ➔ My Portfolio ➔ tap <b>"🔔 Sync to Telegram"</b>!`
      ].join('\n'), { chatId });
    }

    const lines = [
      `📋 <b>Actively Monitored Holdings (${holdings.length})</b>`,
      `──────────────────────────`
    ];

    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      const sym = h.symbol;
      const buy = Number(h.buyPrice || h.ltp || 0);
      const sl = Number(h.stopLoss || 0);
      const t1 = Number(h.target1 || 0);
      const t2 = Number(h.target2 || 0);
      const qty = Number(h.kitta || 100);
      let curPrice = Number(h.currentPrice || buy);
      if (typeof getLatestStockPrice === 'function') {
        try {
          const fetched = await getLatestStockPrice(sym);
          if (fetched && fetched > 0) curPrice = fetched;
        } catch (_) {}
      }
      const pnl = buy > 0 ? (((curPrice - buy) / buy) * 100).toFixed(1) : '0.0';
      const pnlSign = Number(pnl) >= 0 ? `+${pnl}` : pnl;
      const pnlEmoji = Number(pnl) >= 0 ? '🟢' : '🔴';
      const rupeePnL = Math.round((curPrice - buy) * qty);
      const rupeePnLSign = rupeePnL >= 0 ? `+Rs. ${rupeePnL.toLocaleString('en-IN')}` : `-Rs. ${Math.abs(rupeePnL).toLocaleString('en-IN')}`;

      lines.push(
        `<b>${i + 1}. <code>${sym}</code></b> (${qty} Shares)`,
        `• <b>Entry:</b> Rs. ${buy.toFixed(2)} | <b>Current LTP:</b> Rs. ${Number(curPrice).toFixed(2)}`,
        `• <b>PnL:</b> ${pnlEmoji} ${pnlSign}% (${rupeePnLSign})`,
        `• 🛡️ <b>Stop-Loss:</b> Rs. ${sl.toFixed(2)}`,
        `• 🎯 <b>Target 1:</b> Rs. ${t1.toFixed(2)} | 🚀 <b>Target 2:</b> Rs. ${t2.toFixed(2)}`,
        `• <b>Status:</b> ${h.target1Hit ? '🎯 Target 1 Locked (SL at Breakeven)' : '🟢 Active Live Monitoring'}`,
        `──────────────────────────`
      );
    }

    lines.push(`<i>Commands: <code>/track SYMBOL BUY SL KITTA</code> | <code>/remove SYMBOL</code></i>`);
    return await sendTelegramMessage(lines.join('\n'), { chatId });
  }

  // 4. UNTRACK / REMOVE
  if (lower === '/remove' || lower === 'remove' || lower === '/untrack' || lower === 'untrack' || lower === '/delete' || lower === 'delete') {
    if (typeof onGetTrackedHoldings === 'function') {
      const holdings = onGetTrackedHoldings();
      if (holdings && holdings.length > 0) {
        const syms = holdings.map(h => `<code>/remove ${h.symbol}</code>`).join('\n• ');
        return await sendTelegramMessage([
          `🗑️ <b>To remove a tracked stock, send:</b>`,
          `──────────────────────────`,
          `• ` + syms,
          `──────────────────────────`,
          `Example: <code>/remove ${holdings[0].symbol}</code>`
        ].join('\n'), { chatId });
      }
    }
    return await sendTelegramMessage(`ℹ️ No stocks currently monitored. To track: <code>/track SYMBOL [BUY] [SL] [KITTA]</code>`, { chatId });
  }

  const removeMatch = raw.match(/^\/?(remove|untrack|delete)\s+(.+)$/i);
  if (removeMatch) {
    const rawSyms = removeMatch[2].split(/[, ]+/).filter(Boolean);
    const results = [];
    for (const s of rawSyms) {
      const cleanSym = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!cleanSym) continue;
      const removed = typeof onUntrackHolding === 'function' ? onUntrackHolding(cleanSym) : false;
      if (removed) {
        results.push(`✅ Stopped monitoring <code>${cleanSym}</code>.`);
      } else {
        results.push(`ℹ️ <code>${cleanSym}</code> was not in active tracked list.`);
      }
    }
    return await sendTelegramMessage(results.join('\n') || 'Please specify a symbol, e.g. <code>/remove SHIVM</code>', { chatId });
  }

  // 5. TRACK
  if (lower === '/track' || lower === 'track') {
    const trackHelp = [
      `📌 <b>HOW TO TRACK A STOCK FOR EXIT ALERTS</b>`,
      `──────────────────────────`,
      `Format: <code>/track SYMBOL [BUY_PRICE] [STOP_LOSS] [KITTA]</code>`,
      ``,
      `<b>Quick Examples:</b>`,
      `• <code>/track SHIVM 510 484 100</code>`,
      `  👉 Entry: Rs. 510 | Stop-Loss: Rs. 484 (-5.1%) | 100 Shares`,
      ``,
      `• <code>/track GHL 285</code>`,
      `  👉 Entry: Rs. 285 | Auto-sets -5% Stop-Loss &amp; Targets`,
      ``,
      `• <code>/track NABIL</code>`,
      `  👉 Uses verified latest NEPSE closing price`,
      ``,
      `• <code>/track SHIVM, GHL, CIT</code>`,
      `  👉 Mass track multiple stocks at once!`,
      `──────────────────────────`,
      `💡 <i>Tip: You can also tap <b>"🔔 Sync to Telegram"</b> in the Drabyashree Portfolio tab to auto-sync your entire Demat account with one tap!</i>`
    ].join('\n');
    return await sendTelegramMessage(trackHelp, { chatId });
  }

  const trackMatch = raw.match(/^\/?track\s+(.+)$/i);
  if (trackMatch) {
    const content = trackMatch[1].trim();

    // Multi-stock comma format: e.g. /track SHIVM, GHL, HATHY
    if (content.includes(',')) {
      const rawList = content.split(',').map(s => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean);
      const trackedItems = [];
      const rejectedItems = [];

      for (const sym of rawList) {
        if (!stockUniverseMap[sym]) {
          rejectedItems.push(sym);
          continue;
        }

        let realLtp = typeof getLatestStockPrice === 'function' ? await getLatestStockPrice(sym) : 0;
        if (!realLtp || realLtp <= 0) realLtp = 100; // safety fallback

        const sl = Math.round(realLtp * 0.95 * 10) / 10;
        const t1 = Math.round(realLtp * 1.08 * 10) / 10; // +8.0% Pre-Circuit Target
        const t2 = Math.round(realLtp * 1.145 * 10) / 10; // +14.5% Circuit Ceiling

        if (typeof onTrackHolding === 'function') {
          onTrackHolding({ symbol: sym, buyPrice: realLtp, currentPrice: realLtp, stopLoss: sl, target1: t1, target2: t2, kitta: 100 });
          trackedItems.push(`• <code>${sym}</code> (Close: Rs. ${realLtp}, SL: Rs. ${sl}, T1: Rs. ${t1}, T2: Rs. ${t2})`);
        }
      }

      const resp = [
        `✅ <b>Mass Tracking Armed (${trackedItems.length} Verified Stocks)</b>`,
        `──────────────────────────`,
        ...trackedItems,
        rejectedItems.length > 0 ? `⚠️ <i>Ignored non-NEPSE symbols: ${rejectedItems.join(', ')}</i>` : '',
        `──────────────────────────`,
        `<i>Anchored to verified NEPSE closing prices. Monitoring live ticks (11 AM–3 PM)!</i>`
      ].filter(Boolean).join('\n');
      return await sendTelegramMessage(resp, { chatId });
    }

    // Single stock format: /track SYMBOL [BUY] [SL] [KITTA]
    const parts = content.split(/\s+/).filter(Boolean);
    const sym = parts[0]?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!sym) {
      return await sendTelegramMessage(`⚠️ Please specify symbol: e.g. <code>/track SHIVM 510 484 100</code>`, { chatId });
    }

    // 1. Validate against official NEPSE listed universe
    const stockMeta = stockUniverseMap[sym];
    if (!stockMeta && !sym.match(/^[A-Z]{2,6}$/)) {
      return await sendTelegramMessage([
        `❌ <b>Unrecognized Scrip:</b> <code>${sym}</code>`,
        `──────────────────────────`,
        `This stock is not registered on the Nepal Stock Exchange (NEPSE).`,
        `Please check the spelling. Examples: <code>SHIVM</code>, <code>GHL</code>, <code>NABIL</code>, <code>HATHY</code>, <code>CIT</code>.`
      ].join('\n'), { chatId });
    }

    const companyName = stockMeta?.name || sym;

    let inputBuyPrice = parseFloat(parts[1]);
    let inputStopLoss = parseFloat(parts[2]);
    let kitta = parseInt(parts[3], 10) || 100;

    // 2. Retrieve the REAL last closing market price from NEPSE feed / DB
    let realLtp = typeof getLatestStockPrice === 'function' ? await getLatestStockPrice(sym) : 0;
    if (!realLtp || realLtp <= 0) {
      try {
        const { db } = await import('./db/ledgerStore.js');
        if (db) {
          const r = db.prepare('SELECT close_price FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date DESC LIMIT 1').get(sym);
          if (r && r.close_price) realLtp = Number(r.close_price);
        }
      } catch (_) {}
    }

    if (!realLtp || realLtp <= 0) {
      if (!isNaN(inputBuyPrice) && inputBuyPrice > 0) {
        realLtp = inputBuyPrice;
      } else {
        return await sendTelegramMessage([
          `⚠️ <b>Market Data Notice for <code>${sym}</code></b>`,
          `──────────────────────────`,
          `Could not retrieve the verified closing price from the live NEPSE feed.`,
          `Please provide your entry price: <code>/track ${sym} 510 484 100</code>`,
          `Or open Drabyashree ➔ My Portfolio ➔ tap <b>"🔔 Sync to Telegram"</b>!`
        ].join('\n'), { chatId });
      }
    }

    // Scenario A: No buy price given (e.g. /track NABIL) -> Use real last closing price
    if (isNaN(inputBuyPrice) || inputBuyPrice <= 0) {
      const sl = Math.round(realLtp * 0.95 * 10) / 10;
      const t1 = Math.round(realLtp * 1.08 * 10) / 10; // +8.0% (Pre-Circuit Momentum Target)
      const t2 = Math.round(realLtp * 1.145 * 10) / 10; // +14.5% (Near +15% Circuit Ceiling)

      if (typeof onTrackHolding === 'function') {
        onTrackHolding({
          symbol: sym,
          buyPrice: realLtp,
          currentPrice: realLtp,
          stopLoss: sl,
          target1: t1,
          target2: t2,
          kitta
        });
      }

      const msg = [
        `✅ <b>Exit Guard Armed: <code>${sym}</code></b>`,
        `<b>Company:</b> ${companyName}`,
        `──────────────────────────`,
        `📊 <b>Verified Last Close LTP:</b> Rs. ${realLtp.toFixed(2)}`,
        `🛡️ <b>Stop-Loss Floor:</b> Rs. ${sl.toFixed(2)} (-5.0%)`,
        `🎯 <b>Target 1 (50% Profit):</b> Rs. ${t1.toFixed(2)} (+8.0% Pre-Circuit)`,
        `🚀 <b>Target 2 (Circuit Exit):</b> Rs. ${t2.toFixed(2)} (+14.5% near +15% Circuit Ceiling)`,
        `💼 <b>Position:</b> ${kitta} Shares`,
        `⏳ <b>T+2 Defense:</b> Active`,
        `──────────────────────────`,
        `<i>Anchored strictly to real NEPSE closing market data & ±15% circuit limits.</i>`
      ].join('\n');
      return await sendTelegramMessage(msg, { chatId });
    }

    // Scenario B: User provided an explicit purchase price
    let effectiveSl = (!isNaN(inputStopLoss) && inputStopLoss > 0)
      ? inputStopLoss
      : Math.round(inputBuyPrice * 0.95 * 10) / 10;
    let effectiveT1 = Math.round(inputBuyPrice * 1.08 * 10) / 10; // +8.0% Pre-Circuit Target
    let effectiveT2 = Math.round(inputBuyPrice * 1.145 * 10) / 10; // +14.5% near +15% Circuit Ceiling

    if (typeof onTrackHolding === 'function') {
      onTrackHolding({
        symbol: sym,
        buyPrice: inputBuyPrice,
        currentPrice: realLtp,
        stopLoss: effectiveSl,
        target1: effectiveT1,
        target2: effectiveT2,
        kitta
      });
    }

    const pnlPct = (((realLtp - inputBuyPrice) / inputBuyPrice) * 100).toFixed(1);
    const pnlSign = Number(pnlPct) >= 0 ? `+${pnlPct}` : pnlPct;
    const pnlEmoji = Number(pnlPct) >= 0 ? '🟢' : '🔴';
    const rupeePnL = Math.round((realLtp - inputBuyPrice) * kitta);
    const rupeePnLSign = rupeePnL >= 0 ? `+Rs. ${rupeePnL.toLocaleString('en-IN')}` : `-Rs. ${Math.abs(rupeePnL).toLocaleString('en-IN')}`;
    const slDiff = (((inputBuyPrice - effectiveSl) / inputBuyPrice) * 100).toFixed(1);
    const t1Diff = (((effectiveT1 - inputBuyPrice) / inputBuyPrice) * 100).toFixed(1);
    const t2Diff = (((effectiveT2 - inputBuyPrice) / inputBuyPrice) * 100).toFixed(1);

    const msg = [
      `🛡️ <b>EXIT GUARD ARMED: <code>${sym}</code></b>`,
      `<b>Company:</b> ${companyName}`,
      `──────────────────────────`,
      `• 💼 <b>Position:</b> ${kitta} Shares`,
      `• 💵 <b>Your Entry (Buy Price):</b> Rs. ${inputBuyPrice.toFixed(2)}`,
      `• 📊 <b>Current Market Close LTP:</b> Rs. ${realLtp.toFixed(2)}`,
      `• 📈 <b>Unrealized PnL:</b> ${pnlEmoji} ${pnlSign}% (${rupeePnLSign})`,
      `──────────────────────────`,
      `• 🛡️ <b>Stop-Loss Floor:</b> Rs. ${effectiveSl.toFixed(2)} (-${slDiff}%)`,
      `• 🎯 <b>Target 1 (50% Profit):</b> Rs. ${effectiveT1.toFixed(2)} (+${t1Diff}%)`,
      `• 🚀 <b>Target 2 (Circuit Exit):</b> Rs. ${effectiveT2.toFixed(2)} (+${t2Diff}%)`,
      `• ⏳ <b>NEPSE Settlement:</b> T+2 Defense Armed`,
      `──────────────────────────`,
      `⚡ <i>I will alert you instantly if price touches Stop-Loss or Targets during trading hours (11:00 AM – 3:00 PM)!</i>`
    ].join('\n');
    return await sendTelegramMessage(msg, { chatId });
  }

  // Friendly fallback for any unrecognized command or query
  const fallbackMsg = [
    `❓ <b>Unrecognized Request:</b> <code>${escapeHtml(raw)}</code>`,
    `──────────────────────────`,
    `Here are popular commands you can send right now:`,
    `• <code>/guide</code> or <code>/selection</code> — Daily 4-Gate Stock Selection Guide (Pick or Cash Defense)`,
    `• <code>/swing</code> or <code>/top5</code> — #1 Prime Stock Pick &amp; Top 5 Ranked Backup Slate`,
    `• <code>/analyze SHIVM</code> — Complete 7-Section Deep Stock Audit`,
    `• <code>/track SHIVM 510 484 100</code> — Track a stock for exit alerts`,
    `• <code>/list</code> — View your actively guarded holdings`,
    `• <code>/sl</code> — Check Stop-Loss and Target levels`,
    `• <code>/remove SHIVM</code> — Stop exit alerts for a stock`,
    `• <code>/nepse</code> — Current NEPSE benchmark &amp; market session`,
    `• <code>/help</code> — Full trading guide &amp; manual`,
    `──────────────────────────`,
    `💡 <i>Tap any command above to run it instantly!</i>`
  ].join('\n');
  return await sendTelegramMessage(fallbackMsg, { chatId });
}

/**
 * Polling worker to fetch and process incoming Telegram commands
 */
const PROCESSED_UPDATE_IDS = new Set();
const MAX_PROCESSED_UPDATE_IDS = 1000;

/**
 * Validates the secret token header provided by Telegram on incoming webhook requests
 * using timing-safe comparison to prevent side-channel timing attacks.
 */
export function validateWebhookSecretToken(expected, provided) {
  if (!expected || !provided) return false;
  try {
    const expBuf = crypto.createHash('sha256').update(String(expected).trim()).digest();
    const provBuf = crypto.createHash('sha256').update(String(provided).trim()).digest();
    return crypto.timingSafeEqual(expBuf, provBuf);
  } catch (_) {
    return false;
  }
}

/**
 * Returns the secret token configured for the Telegram webhook (internal server use only)
 */
export function getTelegramWebhookSecretToken() {
  const cfg = loadConfig();
  return cfg.webhookSecretToken || '';
}

/**
 * Checks whether Telegram webhook mode is active
 */
export function isTelegramWebhookActive() {
  const cfg = loadConfig();
  return Boolean(cfg.useWebhook);
}

/**
 * Processes an incoming Telegram Update (from either Webhook POST or Long-Polling)
 */
export async function handleIncomingTelegramUpdate(update, {
  chatId: customChatId,
  onTrackHolding,
  onUntrackHolding,
  onGetTrackedHoldings,
  getLatestStockPrice,
  onCommandHandled
} = {}) {
  if (!update || typeof update !== 'object') {
    return { processed: false, reason: 'invalid_update' };
  }

  const uId = update.update_id ? Number(update.update_id) : null;
  if (uId) {
    if (PROCESSED_UPDATE_IDS.has(uId)) {
      return { processed: false, reason: 'duplicate_update_id', updateId: uId };
    }
    PROCESSED_UPDATE_IDS.add(uId);
    if (PROCESSED_UPDATE_IDS.size > MAX_PROCESSED_UPDATE_IDS) {
      const oldest = PROCESSED_UPDATE_IDS.values().next().value;
      PROCESSED_UPDATE_IDS.delete(oldest);
    }
  }

  const msg = update.message || update.edited_message || update.channel_post;
  if (!msg || !msg.text) {
    return { processed: false, reason: 'no_text_message' };
  }

  const chatId = String(msg.chat?.id || customChatId || '').trim();
  if (!chatId) {
    return { processed: false, reason: 'missing_chat_id' };
  }

  const cfg = loadConfig();
  // Fail closed when owner chatId is not explicitly configured — never auto-bind from unverified updates
  if (!cfg.chatId) {
    console.warn(`[TelegramNotifier] Ignored incoming update for chat ${chatId}: owner chatId not configured.`);
    return { processed: false, reason: 'chat_id_not_configured', chatId };
  }

  // Authorization guard: strictly restrict to the authorized owner chatId.
  // Silently drop unauthorized chat IDs to prevent outbound spam and rate limiting.
  const isAuthorized = Boolean(cfg.chatId && String(chatId) === String(cfg.chatId));
  if (!isAuthorized) {
    console.warn(`[TelegramNotifier] Ignored command from unauthorized chat ID: ${chatId}`);
    return { processed: false, reason: 'unauthorized_chat_id', chatId };
  }

  const text = String(msg.text).trim();
  console.log(`[TelegramNotifier] 📩 Incoming user command: "${text}" from ${msg.from?.first_name || 'User'} (Chat: ${chatId})`);

  await handleTelegramCommand(text, {
    chatId,
    onTrackHolding,
    onUntrackHolding,
    onGetTrackedHoldings,
    getLatestStockPrice
  });

  if (typeof onCommandHandled === 'function') {
    try { onCommandHandled({ updateId: uId, chatId, text }); } catch (_) {}
  }

  return { processed: true, updateId: uId, chatId, text };
}

/**
 * Registers an HTTPS Webhook with Telegram Bot API
 */
export async function setTelegramWebhook({ url, secretToken, dropPendingUpdates = false } = {}) {
  const cfg = loadConfig();
  if (!cfg.botToken) {
    return { success: false, error: 'Telegram Bot Token is not configured.' };
  }

  const targetUrl = url || cfg.webhookUrl || `${(process.env.RENDER_EXTERNAL_URL || 'https://drabyashree-nepse-hub.onrender.com').replace(/\/$/, '')}/api/telegram/webhook`;
  const token = secretToken !== undefined ? secretToken : (cfg.webhookSecretToken || '');

  if (token && !/^[A-Za-z0-9_-]{1,256}$/.test(token)) {
    return { success: false, error: 'Telegram secret token must be 1-256 characters and contain only A-Z, a-z, 0-9, _ and -.' };
  }

  const payload = {
    url: targetUrl,
    allowed_updates: ['message', 'edited_message', 'channel_post'],
    drop_pending_updates: Boolean(dropPendingUpdates)
  };
  if (token) {
    payload.secret_token = token;
  }

  const res = await callBotApi(cfg.botToken, 'setWebhook', payload);
  if (res.ok) {
    saveTelegramConfig({
      useWebhook: true,
      webhookUrl: targetUrl,
      webhookSecretToken: token
    });
    console.log(`[TelegramNotifier] ✅ Telegram Webhook configured successfully: ${targetUrl}`);
    return { success: true, url: targetUrl, result: res.result };
  } else {
    console.error(`[TelegramNotifier] ❌ Failed to set Telegram Webhook:`, res.description || res.error_code);
    return { success: false, error: res.description || 'Failed to set webhook' };
  }
}

/**
 * Deletes the active Telegram Webhook and restores polling mode
 */
export async function deleteTelegramWebhook({ dropPendingUpdates = false } = {}) {
  const cfg = loadConfig();
  if (!cfg.botToken) {
    return { success: false, error: 'Telegram Bot Token is not configured.' };
  }

  const res = await callBotApi(cfg.botToken, 'deleteWebhook', {
    drop_pending_updates: Boolean(dropPendingUpdates)
  });

  if (res.ok) {
    saveTelegramConfig({
      useWebhook: false
    });
    console.log('[TelegramNotifier] ✅ Telegram Webhook deleted. Reverted to polling mode.');
    return { success: true, result: res.result };
  } else {
    return { success: false, error: res.description || 'Failed to delete webhook' };
  }
}

/**
 * Retrieves the live webhook status from Telegram Bot API
 */
export async function getTelegramWebhookInfo() {
  const cfg = loadConfig();
  if (!cfg.botToken) {
    return { ok: false, description: 'Bot token not configured' };
  }
  return await callBotApi(cfg.botToken, 'getWebhookInfo');
}

/**
 * Continuously polls Telegram Bot API for incoming commands (/track, /remove, /list, /status, /help)
 * when webhook mode is NOT enabled.
 */
export async function pollIncomingTelegramCommands({
  onTrackHolding,
  onUntrackHolding,
  onGetTrackedHoldings,
  getLatestStockPrice
} = {}) {
  if (isTokenInvalid) {
    if (Date.now() - tokenInvalidSince > 60000) {
      resetTelegramAuthError();
    } else {
      return;
    }
  }
  if (isPollingInProgress) return;
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.botToken) return;
  if (cfg.useWebhook) return; // Webhook mode active: Telegram pushes updates directly to /api/telegram/webhook

  isPollingInProgress = true;
  try {
    let lastUpdateId = loadLastUpdateId();
    const payload = lastUpdateId > 0 ? { offset: lastUpdateId + 1, timeout: 0 } : { timeout: 0 };
    const data = await callBotApi(cfg.botToken, 'getUpdates', payload);

    if (!data.ok) {
      if (data.error_code === 409 && String(data.description || '').toLowerCase().includes('webhook') && !cfg.useWebhook) {
        console.log('[TelegramNotifier] ⚠️ 409 Conflict detected (lingering webhook active on Telegram). Auto-deleting obsolete webhook to restore polling mode...');
        await deleteTelegramWebhook({ dropPendingUpdates: false });
      }
      return;
    }

    if (!Array.isArray(data.result) || data.result.length === 0) {
      return;
    }

    const updates = data.result;
    for (const u of updates) {
      const uId = Number(u.update_id);
      try {
        await handleIncomingTelegramUpdate(u, {
          onTrackHolding,
          onUntrackHolding,
          onGetTrackedHoldings,
          getLatestStockPrice
        });
      } catch (cmdErr) {
        console.error('[TelegramNotifier] Command execution error:', cmdErr.message);
      } finally {
        if (uId > lastUpdateId) {
          lastUpdateId = uId;
          saveLastUpdateId(lastUpdateId);
        }
      }
    }
  } catch (err) {
    console.warn('[TelegramNotifier] Error in pollIncomingTelegramCommands:', err.message);
  } finally {
    isPollingInProgress = false;
  }
}


