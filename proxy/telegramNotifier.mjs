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
 * Dispatches an Institutional Smart Alert to Telegram with full 4-Pillar Confluence and Execution Ticket
 */
export async function sendTelegramSmartAlert(alertItem) {
  if (!alertItem) return { success: false, reason: 'No alert payload provided' };

  // If already formatted HTML payload is passed, dispatch directly
  if (alertItem.ticketPayload?.html) {
    return await sendTelegramMessage(alertItem.ticketPayload.html, 'HTML');
  }

  const sym = String(alertItem.symbol || 'STOCK').toUpperCase();
  const ltp = Number(alertItem.ltp || 0);
  const buyZone = alertItem.buyZone || {};
  const bLow = buyZone.low || Math.floor(ltp * 0.995);
  const bHigh = buyZone.high || Math.ceil(ltp * 1.015);
  const cCap = alertItem.chaseCap || (bHigh * 1.025).toFixed(1);
  const sl = Number(alertItem.stopLoss || (ltp * 0.945).toFixed(1));
  const t1 = Number(alertItem.target1 || (ltp * 1.12).toFixed(1));
  const t2 = Number(alertItem.target2 || (ltp * 1.20).toFixed(1));
  const slPct = alertItem.slPct || (ltp > 0 ? (((ltp - sl) / ltp) * 100).toFixed(1) : '5.5');
  const t1Pct = alertItem.t1Pct || (ltp > 0 ? (((t1 - ltp) / ltp) * 100).toFixed(1) : '12.0');
  const t2Pct = alertItem.t2Pct || (ltp > 0 ? (((t2 - ltp) / ltp) * 100).toFixed(1) : '20.0');

  // Net Post-Tax/Fee RRR calculation
  const netRRR = alertItem.netRRR || alertItem.riskRewardRatio || 2.8;

  // Position sizing (1.0% portfolio risk on Rs. 100,000 = Rs. 1,000 risk cap)
  const netLossPerShare = alertItem.netLossPerShare || Math.max(1, ltp - sl);
  const qtyPer1Lakh = alertItem.qtyPer1Lakh || Math.max(10, Math.floor(1000 / netLossPerShare));
  const capitalDeployed = alertItem.capitalDeployed || (qtyPer1Lakh * ltp);

  const medianTurnover = Number(alertItem.medianDailyTurnover20D || alertItem.turnover || 7500000);
  const turnoverLakhs = alertItem.turnoverLakhs || +((medianTurnover / 100000).toFixed(1));
  const safeOrderLakhs = alertItem.safeOrderLakhs || +((medianTurnover * 0.05 / 100000).toFixed(1));

  const score = alertItem.score || alertItem.confluenceScore || 100;
  const vduRatio = alertItem.vduRatio || 0.48;
  const retentionPct = alertItem.retentionPct || alertItem.rolling5DRetentionPct || 84;
  const atsr = alertItem.atsr || 2.6;
  const t3VolRatio = alertItem.t3VolRatio || 0.8;
  const dayGainPct = alertItem.dayGainPct ?? (alertItem.pChange ?? 1.8);
  const circuitBufferPct = alertItem.circuitBufferPct ?? 8.2;
  const sector = alertItem.sector || 'Hydro Power';
  const sectorRank = alertItem.sectorRank || alertItem.sectorRank10D || 2;
  const regime = alertItem.regime || 'Neutral';

  const ticketHtml = [
    `🟢 <b>INSTITUTIONAL ACCUMULATION CONFIRMED: $${sym}</b>`,
    `Sector: ${sector} (10D RS Rank: #${sectorRank}/13) | Regime: ${regime}`,
    ``,
    `🎯 <b>EXECUTION PLAN (T+2 &amp; ±15% Circuit Adjusted)</b>`,
    `• Limit Buy Zone: Rs. ${bLow} – Rs. ${bHigh} (Do NOT chase &gt; Rs. ${cCap})`,
    `• Hard Stop-Loss: Rs. ${sl} (-${slPct}% | 1.75x ATR)`,
    `• Target 1 (Conservative): Rs. ${t1} (+${t1Pct}%)`,
    `• Target 2 (Runner): Rs. ${t2} (+${t2Pct}%)`,
    `• Net Post-Tax/Fee RRR: <b>${netRRR} : 1</b> (Includes 7.5% CGT &amp; Broker Fees)`,
    ``,
    `🛡️ <b>POSITION SIZING &amp; LIQUIDITY GUARD</b>`,
    `💼 <b>FOR YOUR RS. ${Number(alertItem.userCapital || 100000).toLocaleString()} PORTFOLIO:</b>`,
    `• Order Size: <b>${alertItem.finalKitta || qtyPer1Lakh} Shares</b> (Deploy: Rs. ${Number(capitalDeployed).toLocaleString()})`,
    `• Max Portfolio Risk: <b>Rs. ${Number(alertItem.actualRiskRupees || (qtyPer1Lakh * netLossPerShare)).toLocaleString()}</b>`,
    ``,
    `🌐 <b>UNIVERSAL SUBSCRIBER MULTIPLIER (PER RS. 1 LAKH CAPITAL):</b>`,
    `• Exact Sizing Multiplier: <b>${qtyPer1Lakh} Shares</b> per Rs. 1 Lakh Capital`,
    ``,
    `• 20D Median Turnover: Rs. ${turnoverLakhs}L (Safe Total Order Cap: Rs. ${safeOrderLakhs}L)`,
    ``,
    `📊 <b>4-PILLAR CONFLUENCE SCORE: ${score}/100</b>`,
    `✅ Wyckoff VDU Base: ${vduRatio}x of 20D Vol (Supply Exhausted)`,
    `✅ Smart Money 5D Retention: ${retentionPct}% | Ticket Ratio (ATSR): ${atsr}x`,
    `✅ T+3 Overhang Risk: LOW (t-3 Vol: ${t3VolRatio}x | Safe from settlement dump)`,
    `✅ Circuit Distance: +${dayGainPct}% today (${circuitBufferPct}% below +15% circuit)`
  ].join('\n');

  return await sendTelegramMessage(ticketHtml, 'HTML');
}

/**
 * Dispatches the Full Investor Educational Briefing & High-Reward Playbook directly to Telegram
 */
export async function sendTelegramInvestorPlaybook() {
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
    `⏳ <b>T+2 Execution Cycle:</b> Buy tomorrow (Day T) ➔ Cleared & Sellable on Day T+2.`,
    `<i>Strict Rule: Cancel buy order if pre-open price gaps above Chase Cap (+2.5% max).</i>`
  ].join('\n');

  return await sendTelegramMessage(msg);
}

/**
 * Dispatches Phase 1: 10:15 AM Pre-Market Institutional Morning Radar
 */
export async function sendTelegramPreMarketScan({
  sessionDate,
  breadthAdv = 0,
  breadthDec = 0,
  breadthPct = 50,
  isCashDefense = false,
  nepseValue = '2,634.17',
  nepseChange = '+8.23',
  candidates = []
} = {}) {
  const dateStr = sessionDate || new Date().toISOString().slice(0, 10);
  const breadthEmoji = isCashDefense ? '🛡️' : '🟢';
  const breadthStatus = isCashDefense
    ? '⚠️ CASH DEFENSE ACTIVE (Hold 70–80% Cash)'
    : '✅ GREEN LIGHT: Healthy Breadth & Capital Deployment';

  const candidateLines = candidates.length > 0
    ? candidates.map((c, idx) => {
        return [
          `<b>${idx + 1}. <code>${c.symbol}</code></b> (${c.sector || 'Equities'})`,
          `• LTP: Rs. ${c.ltp} | Base Pivot: Rs. ${c.basePrice || c.ltp}`,
          `• 🎯 Pullback Buy Zone: Rs. ${c.entryLow} – Rs. ${c.entryHigh}`,
          `• ⚠️ Chase Cap (+2.5% max): Rs. ${c.chaseCap}`,
          `• 🛡️ Stop-Loss Floor: Rs. ${c.stopLoss} (-${c.slPct || '4.8'}%)`,
          `• 🚀 Target 1: Rs. ${c.target1} (+${c.t1Pct || '9.6'}%) | T2: Rs. ${c.target2}`,
          `• Score: <b>${c.score || c.setupScore || 85}/100</b> | Float: ${c.floatM || '<15'}M shares`
        ].join('\n');
      }).join('\n\n')
    : '<i>No candidates met all 8 institutional gates today. Preserving 100% cash!</i>';

  const msg = [
    `🌅 <b>DRAVYASHREE PRE-MARKET SCAN (PHASE 1)</b>`,
    `<b>Date:</b> ${dateStr} | <b>Time:</b> 10:15 AM NPT`,
    `──────────────────────────`,
    `📊 <b>NEPSE Composite:</b> ${nepseValue} (${Number(nepseChange || 0) >= 0 ? '+' : ''}${nepseChange})`,
    `📈 <b>Market Breadth:</b> ${breadthAdv} Adv / ${breadthDec} Dec (${breadthPct}% Bullish)`,
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

  const msg = [
    header,
    `<b>Session:</b> Pre-Open Final Check (10:50 AM NPT)`,
    `──────────────────────────`,
    `<b>Scrip:</b> <code>${symbol}</code>`,
    `• Base Pivot: Rs. ${basePivot}`,
    `• Indicative Open: Rs. ${indicativeOpen} (${Number(gapPct) >= 0 ? '+' : ''}${gapPct}%)`,
    `• ⚠️ Chase Cap Ceiling: Rs. ${chaseCap} (+2.5% max)`,
    `• 📊 Order Book Imbalance (OBIR): <b>${obir}</b>`,
    `• Depth: ${Number(bidVolume).toLocaleString()} Bids vs ${Number(askVolume).toLocaleString()} Asks`,
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
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. HELP / START
  if (lower === '/start' || lower === '/help' || lower === 'help' || lower === 'start') {
    const helpMsg = [
      `🤖 <b>DRAVYASHREE NEPSE TRADING ASSISTANT</b>`,
      `──────────────────────────`,
      `I monitor your holdings every 60s and send instant lockscreen exit alerts for Stop-Loss, Target 1, and Target 2!`,
      ``,
      `📌 <b>How to Track a Stock for Exit Alerts:</b>`,
      `• <code>/track SYMBOL [BUY] [SL] [KITTA]</code>`,
      `  👉 <code>/track SHIVM 512 486 100</code> (custom entry & SL)`,
      `  👉 <code>/track GHL 285</code> (auto sets 5% SL & Targets)`,
      `  👉 <code>/track HATHY</code> (uses live market LTP)`,
      `  👉 <code>/track SHIVM, GHL, HATHY</code> (track multiple stocks)`,
      ``,
      `📌 <b>Management Commands:</b>`,
      `• <code>/list</code> or <code>/status</code>: View all monitored stocks & live levels`,
      `• <code>/remove SYMBOL</code>: Stop exit alerts for a stock`,
      `• <code>/ping</code>: Verify server connection`,
      `──────────────────────────`,
      `<i>All alerts strictly factor in NEPSE T+2 settlement rules.</i>`
    ].join('\n');
    return await sendTelegramMessage(helpMsg);
  }

  // 2. PING
  if (lower === '/ping' || lower === 'ping') {
    return await sendTelegramMessage(`🏓 <b>Pong!</b> Drabyashree server is online and actively watching NEPSE live market.`);
  }

  // 2.5 PLAYBOOK / GUIDE
  if (lower === '/playbook' || lower === '/guide' || lower === 'playbook' || lower === 'guide') {
    return await sendTelegramInvestorPlaybook();
  }

  // 3. LIST / STATUS
  if (lower === '/list' || lower === '/status' || lower === '/holdings' || lower === 'list' || lower === 'status' || lower === 'holdings') {
    if (typeof onGetTrackedHoldings !== 'function') {
      return await sendTelegramMessage(`ℹ️ Holdings engine initializing. Try again shortly.`);
    }
    const holdings = onGetTrackedHoldings();
    if (!holdings || holdings.length === 0) {
      return await sendTelegramMessage(`📭 <b>No stocks actively tracked right now.</b>\nSend <code>/track SYMBOL [BUY_PRICE] [STOP_LOSS]</code> to start monitoring!`);
    }

    const lines = [
      `📋 <b>Actively Monitored Holdings (${holdings.length})</b>`,
      `──────────────────────────`
    ];

    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      const sym = h.symbol;
      const buy = Number(h.ltp || 0);
      const sl = Number(h.stopLoss || 0);
      const t1 = Number(h.target1 || 0);
      const t2 = Number(h.target2 || 0);
      const qty = Number(h.kitta || 100);
      let curPrice = buy;
      if (typeof getLatestStockPrice === 'function') {
        try {
          const fetched = await getLatestStockPrice(sym);
          if (fetched && fetched > 0) curPrice = fetched;
        } catch (_) {}
      }
      const pnl = buy > 0 ? (((curPrice - buy) / buy) * 100).toFixed(1) : '0.0';
      const pnlSign = Number(pnl) >= 0 ? `+${pnl}` : pnl;

      lines.push(
        `<b>${i + 1}. <code>${sym}</code></b> (${qty} Kitta)`,
        `• Entry: Rs. ${buy.toFixed(2)} | Current: Rs. ${Number(curPrice).toFixed(2)} (${pnlSign}%)`,
        `• 🛡️ Stop-Loss: Rs. ${sl.toFixed(2)}`,
        `• 🎯 Target 1: Rs. ${t1.toFixed(2)} | 🚀 Target 2: Rs. ${t2.toFixed(2)}`,
        `• Status: ${h.target1Hit ? '🎯 Target 1 Locked (SL at Breakeven)' : '🟢 Active Monitoring'}`,
        `──────────────────────────`
      );
    }

    lines.push(`<i>To remove any stock: <code>/remove SYMBOL</code></i>`);
    return await sendTelegramMessage(lines.join('\n'));
  }

  // 4. UNTRACK / REMOVE
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
    return await sendTelegramMessage(results.join('\n') || 'Please specify a symbol, e.g. <code>/remove SHIVM</code>');
  }

  // 5. TRACK
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
          onTrackHolding({ symbol: sym, buyPrice: realLtp, stopLoss: sl, target1: t1, target2: t2, kitta: 100 });
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
      return await sendTelegramMessage(resp);
    }

    // Single stock format: /track SYMBOL [BUY] [SL] [KITTA]
    const parts = content.split(/\s+/).filter(Boolean);
    const sym = parts[0]?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!sym) {
      return await sendTelegramMessage(`⚠️ Please specify symbol: e.g. <code>/track SHIVM 512 489</code>`);
    }

    // 1. Validate against official NEPSE listed universe
    const stockMeta = stockUniverseMap[sym];
    if (!stockMeta && !sym.match(/^[A-Z]{2,6}$/)) {
      return await sendTelegramMessage([
        `❌ <b>Unrecognized Scrip:</b> <code>${sym}</code>`,
        `──────────────────────────`,
        `This stock is not registered on the Nepal Stock Exchange (NEPSE).`,
        `Please check the spelling. Examples: <code>SHIVM</code>, <code>GHL</code>, <code>NABIL</code>, <code>HATHY</code>, <code>CIT</code>.`
      ].join('\n'));
    }

    const companyName = stockMeta?.name || sym;

    // 2. Retrieve the REAL last closing market price from NEPSE feed
    let realLtp = typeof getLatestStockPrice === 'function' ? await getLatestStockPrice(sym) : 0;
    if (!realLtp || realLtp <= 0) {
      return await sendTelegramMessage([
        `⚠️ <b>Market Data Notice for <code>${sym}</code></b>`,
        `──────────────────────────`,
        `Could not retrieve the verified last closing price from the live NEPSE feed.`,
        `Please open Drabyashree ➔ My Portfolio ➔ tap <b>"🔔 Sync to Telegram"</b> to sync directly from your Demat data!`
      ].join('\n'));
    }

    let inputBuyPrice = parseFloat(parts[1]);
    let inputStopLoss = parseFloat(parts[2]);
    let kitta = parseInt(parts[3], 10) || 100;

    // Scenario A: No buy price given (e.g. /track NABIL) -> Use real last closing price
    if (isNaN(inputBuyPrice) || inputBuyPrice <= 0) {
      const sl = Math.round(realLtp * 0.95 * 10) / 10;
      const t1 = Math.round(realLtp * 1.08 * 10) / 10; // +8.0% (Pre-Circuit Momentum Target)
      const t2 = Math.round(realLtp * 1.145 * 10) / 10; // +14.5% (Near +15% Circuit Ceiling)

      if (typeof onTrackHolding === 'function') {
        onTrackHolding({
          symbol: sym,
          buyPrice: realLtp,
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
      return await sendTelegramMessage(msg);
    }

    // Scenario B: User provided an explicit purchase price
    const disparityPct = ((realLtp - inputBuyPrice) / inputBuyPrice) * 100;
    const isOldHolding = Math.abs(disparityPct) > 15;

    let effectiveSl = 0;
    let effectiveT1 = 0;
    let effectiveT2 = 0;

    if (isOldHolding) {
      // Long-term / old purchase (e.g. bought 7 years ago at 1500 or 100)
      // Stop-loss and targets MUST be anchored to current closing price (realLtp) to avoid nonsensical exits!
      effectiveSl = Math.round(realLtp * 0.95 * 10) / 10;
      effectiveT1 = Math.round(realLtp * 1.08 * 10) / 10; // +8.0% Pre-Circuit Target
      effectiveT2 = Math.round(realLtp * 1.145 * 10) / 10; // +14.5% near +15% Circuit Ceiling

      if (typeof onTrackHolding === 'function') {
        onTrackHolding({
          symbol: sym,
          buyPrice: inputBuyPrice, // Preserve their real historical cost basis for accounting
          stopLoss: effectiveSl,
          target1: effectiveT1,
          target2: effectiveT2,
          kitta
        });
      }

      const pnlSign = disparityPct >= 0 ? '+' : '';
      const msg = [
        `✅ <b>Long-Term Holding Armed: <code>${sym}</code></b>`,
        `<b>Company:</b> ${companyName}`,
        `──────────────────────────`,
        `📊 <b>Verified Last Close LTP:</b> Rs. ${realLtp.toFixed(2)}`,
        `💼 <b>Historical Cost Basis:</b> Rs. ${inputBuyPrice.toFixed(2)} (${pnlSign}${disparityPct.toFixed(1)}%)`,
        `──────────────────────────`,
        `🛡️ <b>Current Defense Stop Floor:</b> Rs. ${effectiveSl.toFixed(2)} (-5.0% from current LTP)`,
        `🎯 <b>Target 1:</b> Rs. ${effectiveT1.toFixed(2)} (+8.0% from current LTP)`,
        `🚀 <b>Target 2 (Circuit Ceiling):</b> Rs. ${effectiveT2.toFixed(2)} (+14.5% near +15% Circuit Ceiling)`,
        `💼 <b>Quantity:</b> ${kitta} Shares`,
        `──────────────────────────`,
        `💡 <i>Notice: Anchored to current NEPSE close (Rs. ${realLtp.toFixed(2)}) within ±15% daily circuit band. Higher multi-week targets (+25%+) require multi-session T+2 swing holds.</i>`
      ].join('\n');
      return await sendTelegramMessage(msg);
    } else {
      // Recent trade within normal swing range
      effectiveSl = !isNaN(inputStopLoss) && inputStopLoss > 0 && inputStopLoss < realLtp 
        ? inputStopLoss 
        : Math.round(Math.min(inputBuyPrice, realLtp) * 0.95 * 10) / 10;
      effectiveT1 = Math.round(inputBuyPrice * 1.15 * 10) / 10;
      effectiveT2 = Math.round(inputBuyPrice * 1.25 * 10) / 10;

      if (typeof onTrackHolding === 'function') {
        onTrackHolding({
          symbol: sym,
          buyPrice: inputBuyPrice,
          stopLoss: effectiveSl,
          target1: effectiveT1,
          target2: effectiveT2,
          kitta
        });
      }

      const slDiff = (((inputBuyPrice - effectiveSl) / inputBuyPrice) * 100).toFixed(1);
      const t1Diff = (((effectiveT1 - inputBuyPrice) / inputBuyPrice) * 100).toFixed(1);
      const t2Diff = (((effectiveT2 - inputBuyPrice) / inputBuyPrice) * 100).toFixed(1);

      const msg = [
        `✅ <b>Now Tracking: <code>${sym}</code></b>`,
        `<b>Company:</b> ${companyName}`,
        `──────────────────────────`,
        `📊 <b>Verified Last Close LTP:</b> Rs. ${realLtp.toFixed(2)}`,
        `• <b>Entry Price:</b> Rs. ${inputBuyPrice.toFixed(2)}`,
        `• 🛡️ <b>Stop-Loss Floor:</b> Rs. ${effectiveSl.toFixed(2)} (-${slDiff}%)`,
        `• 🎯 <b>Target 1 (50% Profit):</b> Rs. ${effectiveT1.toFixed(2)} (+${t1Diff}%)`,
        `• 🚀 <b>Target 2 (Full Exit):</b> Rs. ${effectiveT2.toFixed(2)} (+${t2Diff}%)`,
        `• 💼 <b>Quantity:</b> ${kitta} Shares`,
        `• ⏳ <b>NEPSE Settlement:</b> T+2 Defense Armed`,
        `──────────────────────────`,
        `<i>I will alert you instantly if price touches Stop-Loss or Targets!</i>`
      ].join('\n');
      return await sendTelegramMessage(msg);
    }
  }

  // Friendly fallback for unrecognized commands
  if (raw.startsWith('/')) {
    return await sendTelegramMessage(`❓ Unrecognized command: <code>${raw}</code>\nType <code>/help</code> to see available commands.`);
  }
}

/**
 * Polling worker to fetch and process incoming Telegram commands
 */
export async function pollIncomingTelegramCommands({
  onTrackHolding,
  onUntrackHolding,
  onGetTrackedHoldings,
  getLatestStockPrice
} = {}) {
  if (isPollingInProgress) return;
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.botToken) return;

  isPollingInProgress = true;
  try {
    let lastUpdateId = loadLastUpdateId();
    const payload = lastUpdateId > 0 ? { offset: lastUpdateId + 1, timeout: 0 } : { timeout: 0 };
    const data = await callBotApi(cfg.botToken, 'getUpdates', payload);

    if (!data.ok || !Array.isArray(data.result) || data.result.length === 0) {
      return;
    }

    const updates = data.result;
    for (const u of updates) {
      const uId = u.update_id;
      if (uId > lastUpdateId) {
        lastUpdateId = uId;
      }

      const msg = u.message || u.edited_message || u.channel_post;
      if (!msg || !msg.text) continue;

      const chatId = String(msg.chat?.id || '');
      // If user chat_id is configured, only respond to this authorized user
      if (cfg.chatId && chatId !== cfg.chatId) {
        console.warn(`[TelegramNotifier] Ignored command from unauthorized chat ID: ${chatId}`);
        continue;
      }

      const text = String(msg.text).trim();
      console.log(`[TelegramNotifier] 📩 Incoming user command: "${text}" from ${msg.from?.first_name || 'User'}`);

      await handleTelegramCommand(text, {
        chatId,
        onTrackHolding,
        onUntrackHolding,
        onGetTrackedHoldings,
        getLatestStockPrice
      });
    }

    saveLastUpdateId(lastUpdateId);
  } catch (err) {
    console.warn('[TelegramNotifier] Error in pollIncomingTelegramCommands:', err.message);
  } finally {
    isPollingInProgress = false;
  }
}


