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
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'telegram_config.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (_) {}

function loadConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (_) {}

  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || fileConfig.botToken || '',
    chatId: process.env.TELEGRAM_CHAT_ID || fileConfig.chatId || '',
    enabled: fileConfig.enabled !== false, // default true if token & chatId present
    isTestServer: Boolean(fileConfig.isTestServer)
  };
}

export function saveTelegramConfig({ botToken, chatId, enabled = true, isTestServer }) {
  const current = loadConfig();
  const nextConfig = {
    botToken: botToken !== undefined ? String(botToken).trim() : current.botToken,
    chatId: chatId !== undefined ? String(chatId).trim() : current.chatId,
    enabled: Boolean(enabled),
    isTestServer: isTestServer !== undefined ? Boolean(isTestServer) : current.isTestServer,
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(nextConfig, null, 2), 'utf8');
    console.log('[TelegramNotifier] Configuration saved successfully.');
    return { success: true };
  } catch (err) {
    console.error('[TelegramNotifier] Failed to save config:', err.message);
    return { success: false, error: err.message };
  }
}

export function getTelegramStatus() {
  const cfg = loadConfig();
  const hasToken = Boolean(cfg.botToken && cfg.botToken.length > 10);
  const hasChat = Boolean(cfg.chatId && cfg.chatId.length > 3);
  const isReady = hasToken && hasChat && cfg.enabled;

  const maskedToken = hasToken
    ? `${cfg.botToken.slice(0, 6)}...${cfg.botToken.slice(-4)}`
    : '';

  return {
    isConfigured: isReady,
    enabled: cfg.enabled,
    hasToken,
    hasChatId: hasChat,
    maskedToken,
    chatId: cfg.chatId || ''
  };
}

/**
 * Core resilient Telegram API caller.
 * Attempts standard HTTPS fetch first. If intercepted or timed out by local ISP
 * (e.g., DNS hijacking in Nepal), automatically fails over to Telegram direct IP
 * with TLS SNI validation.
 */
async function callTelegramApi(endpoint, payload = null) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://api.telegram.org${endpoint}`, {
      method: payload ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return await res.json();
  } catch (_) {
    // Failover: Direct connection to Telegram core IP
    return new Promise((resolve) => {
      const dataStr = payload ? JSON.stringify(payload) : null;
      const req = https.request({
        host: '149.154.166.110',
        port: 443,
        path: endpoint,
        method: payload ? 'POST' : 'GET',
        headers: {
          'Host': 'api.telegram.org',
          'Content-Type': 'application/json',
          ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
        },
        servername: 'api.telegram.org',
        timeout: 5000
      }, (res) => {
        let buf = '';
        res.on('data', chunk => buf += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            resolve({ ok: false, description: buf || 'Invalid JSON response from Telegram' });
          }
        });
      });
      req.on('error', e => resolve({ ok: false, description: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, description: 'Telegram connection timed out' }); });
      if (dataStr) req.write(dataStr);
      req.end();
    });
  }
}

/**
 * Smart Bot API router:
 * Automatically negotiates between Standard Production DC and Telegram Test DC.
 * If one returns 401 Unauthorized, automatically tries the other and saves preference.
 */
async function callBotApi(token, method, payload = null) {
  const cfg = loadConfig();
  const useTest = cfg.isTestServer;

  const pathPrimary = useTest ? `/bot${token}/test/${method}` : `/bot${token}/${method}`;
  let data = await callTelegramApi(pathPrimary, payload);

  // If primary returns 401 or Unauthorized, auto-test the alternative environment
  if (!data.ok && (data.error_code === 401 || data.description?.toLowerCase().includes('unauthorized'))) {
    const pathAlt = useTest ? `/bot${token}/${method}` : `/bot${token}/test/${method}`;
    const altData = await callTelegramApi(pathAlt, payload);
    if (altData.ok) {
      saveTelegramConfig({ botToken: token, isTestServer: !useTest });
      return altData;
    }
  }

  return data;
}

/**
 * Sends a raw HTML/Markdown message to Telegram
 */
export async function sendTelegramMessage(text, parseMode = 'HTML') {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) {
    return { success: false, reason: 'Telegram notifications not configured or disabled' };
  }

  const payload = {
    chat_id: cfg.chatId,
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
  const token = customToken || cfg.botToken;
  const chat = customChatId || cfg.chatId;

  if (!token || !chat) {
    return { success: false, error: 'Both Bot Token and Chat ID are required.' };
  }

  const text = `🔔 <b>Drabyashree NEPSE Alert System</b>\n\n✅ <b>Connection Test Successful!</b>\nYour smartphone is now configured to receive real-time institutional alerts and 3:45 PM Daily Post-Market Setups.\n\n<i>Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu' })} NPT</i>`;

  try {
    const data = await callBotApi(token, 'sendMessage', {
      chat_id: chat,
      text,
      parse_mode: 'HTML'
    });
    if (data.ok) {
      return { success: true, message: 'Test message sent successfully to your Telegram!' };
    } else {
      return { success: false, error: data.description || 'Failed to authenticate with Telegram.' };
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
  const token = customToken || cfg.botToken;

  if (!token) {
    return { success: false, error: 'Please enter your Bot Token first.' };
  }

  try {
    const data = await callBotApi(token, 'getUpdates');
    if (!data.ok) {
      return { success: false, error: data.description || 'Invalid Bot Token. Check token from @BotFather.' };
    }

    const updates = data.result || [];
    if (updates.length === 0) {
      return { 
        success: false, 
        error: 'No messages received yet! Open your bot in Telegram (t.me/drabya_trade_alert_bot) and tap START or send "hello", then try Auto-Detect again.' 
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
          message: `Found Chat ID: ${chat.id} (${fromName})` 
        };
      }
    }

    return { success: false, error: 'Could not extract chat ID from messages. Send a message to your bot and try again.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches an Institutional Smart Alert to Telegram
 */
export async function sendTelegramSmartAlert(alertItem) {
  const sym = alertItem.symbol || 'STOCK';
  const ltp = Number(alertItem.ltp || 0);
  const buyZone = alertItem.buyZone || {};
  const bLow = buyZone.low || (ltp * 0.99).toFixed(0);
  const bHigh = buyZone.high || (ltp * 1.02).toFixed(0);
  const brokersText = alertItem.dominantBrokersText || (alertItem.topBuyerBrokers ? `Brokers ${alertItem.topBuyerBrokers.map(b => b.broker).join(', ')}` : 'Top Brokers');
  const conc = alertItem.concentrationPct || 50;
  const sl = alertItem.stopLoss || (ltp * 0.95).toFixed(1);
  const t1 = alertItem.target1 || (ltp * 1.08).toFixed(1);
  const t2 = alertItem.target2 || (ltp * 1.15).toFixed(1);

  // Position sizing based on Rs. 100,000 capital (1.5% max risk = Rs. 1,500)
  const riskPerShare = Math.max(1, ltp - sl);
  const suggestedKitta = Math.min(
    Math.floor(100000 / Math.max(1, ltp)), // Capital cap
    Math.max(10, Math.floor(1500 / riskPerShare)) // 1.5% Risk rule
  );
  const capitalOutlay = suggestedKitta * ltp;

  const msg = [
    `🚨 <b>DRAVYASHREE SMART INSTITUTIONAL ALERT</b>`,
    `──────────────────────────`,
    `<b>Scrip:</b> <code>${sym}</code>`,
    `<b>Live Price:</b> Rs. ${ltp.toFixed(2)}`,
    `<b>Buy Zone:</b> Rs. ${bLow} – Rs. ${bHigh}`,
    `<b>Flow Dominance:</b> ${brokersText} (${conc}% of morning float)`,
    `──────────────────────────`,
    `🎯 <b>Target 1:</b> Rs. ${t1} (+${(((t1 - ltp) / ltp) * 100).toFixed(1)}%)`,
    `🎯 <b>Target 2:</b> Rs. ${t2} (+${(((t2 - ltp) / ltp) * 100).toFixed(1)}%)`,
    `🛡️ <b>Stop-Loss:</b> Rs. ${sl} (-${(((ltp - sl) / ltp) * 100).toFixed(1)}%)`,
    `──────────────────────────`,
    `💼 <b>100K Sizing (1.5% Risk):</b> <b>${suggestedKitta} Kitta</b> (Rs. ${capitalOutlay.toLocaleString()})`,
    `<i>Open Drabyashree -> Workstation to inspect live floor sheet tape.</i>`
  ].join('\n');

  return await sendTelegramMessage(msg);
}

/**
 * Dispatches the 3:45 PM Daily Post-Market Verified Prime Pick
 */
export async function sendTelegramPrimePickAlert(winner) {
  if (!winner || !winner.symbol) return;

  const sym = winner.symbol;
  const name = winner.name || winner.companyName || sym;
  const ltp = Number(winner.ltp || 0);
  const score = winner.setupScore || winner.score || 0;
  const verdict = winner.verdict || 'CONFIRMED BUY';
  const eLow = winner.entryLow || winner.levels?.entryZone?.low || ltp;
  const eHigh = winner.entryHigh || winner.levels?.entryZone?.high || ltp;
  const cCap = winner.chaseCap || (eHigh * 1.025).toFixed(1);
  const sl = winner.stopLoss || (ltp * 0.94).toFixed(1);
  const t1 = winner.target1 || (ltp * 1.08).toFixed(1);
  const t2 = winner.target2 || (ltp * 1.15).toFixed(1);
  const kitta = winner.kellyShares || Math.min(Math.floor(100000 / ltp), Math.floor(1500 / Math.max(1, ltp - sl)));
  const capital = winner.capitalOutlay || (kitta * ltp);

  const msg = [
    `👑 <b>DRAVYASHREE 3:45 PM POST-MARKET PICK</b>`,
    `──────────────────────────`,
    `<b>Tomorrow's Prime Setup:</b> <code>${sym}</code>`,
    `<b>Company:</b> ${name}`,
    `<b>Setup Score:</b> <b>${score}/100</b> | <b>Verdict:</b> ${verdict}`,
    `──────────────────────────`,
    `📍 <b>Entry Limit:</b> Rs. ${eLow} – Rs. ${eHigh}`,
    `⚠️ <b>Chase Cap (+2.5% max):</b> Rs. ${cCap}`,
    `🛡️ <b>Stop-Loss Floor:</b> Rs. ${sl}`,
    `🎯 <b>Target 1:</b> Rs. ${t1} (Net after 10% CGT)`,
    `🎯 <b>Target 2:</b> Rs. ${t2}`,
    `──────────────────────────`,
    `💼 <b>100K Sizing:</b> <b>${kitta} Shares</b> (Outlay: Rs. ${Number(capital).toLocaleString()})`,
    `<i>Strict Rule: Cancel buy order if pre-open price gaps above Chase Cap.</i>`
  ].join('\n');

  return await sendTelegramMessage(msg);
}

/**
 * Dispatches a Real-Time Exit / Sell / Stop-Loss Protection Alert to Telegram
 */
export async function sendTelegramExitAlert({
  symbol,
  type = 'STOP_LOSS_HIT', // 'STOP_LOSS_HIT' | 'TARGET_REACHED' | 'INSTITUTIONAL_DISTRIBUTION'
  ltp,
  entryPrice,
  stopLoss,
  targetPrice,
  kitta = 100,
  reason
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
    actionText = `⚡ <b>ACTION: SELL IMMEDIATELY IN TMS.</b>\nCut loss now to preserve your capital. Never let a -5% planned loss turn into a -30% baghold!`;
  } else if (type === 'TARGET_REACHED') {
    header = `🎯 <b>DRAVYASHREE PROFIT LOCK: TARGET REACHED</b>`;
    levelDetail = `💰 <b>Target Hit:</b> Rs. ${targetPrice || currentPrice} | <b>Profit:</b> +${diffPct}% (+Rs. ${rupeeChange.toLocaleString()})`;
    actionText = `⚡ <b>ACTION: LOCK IN GAINS IN TMS.</b>\nSell 50% shares to book cash profit. Raise stop-loss on remaining 50% shares to entry price (Rs. ${entry}) for a risk-free runner.`;
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

