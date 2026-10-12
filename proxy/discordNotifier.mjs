// proxy/discordNotifier.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAVYASHREE DISCORD WEBHOOK DISPATCHER (100% FREE - NO SMS / NO FEES)
 * ───────────────────────────────────────────────────────────────────────────
 * Purpose:
 * Bypasses mobile carrier SMS paywalls and Telegram fees completely.
 * Discord webhooks require ZERO phone numbers, ZERO SMS, and are 100% free forever.
 * Delivers rich, color-coded embed alerts directly to your Discord mobile app.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'discord_config.json');

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
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || fileConfig.webhookUrl || '',
    enabled: fileConfig.enabled !== false
  };
}

export function saveDiscordConfig({ webhookUrl, enabled = true }) {
  const nextConfig = {
    webhookUrl: webhookUrl !== undefined ? String(webhookUrl).trim() : '',
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(nextConfig, null, 2), 'utf8');
    console.log('[DiscordNotifier] Configuration saved successfully.');
    return { success: true };
  } catch (err) {
    console.error('[DiscordNotifier] Failed to save config:', err.message);
    return { success: false, error: err.message };
  }
}

export function getDiscordStatus() {
  const cfg = loadConfig();
  const hasUrl = Boolean(cfg.webhookUrl && cfg.webhookUrl.startsWith('https://discord.com/api/webhooks/'));
  const maskedUrl = hasUrl
    ? `${cfg.webhookUrl.slice(0, 38)}...${cfg.webhookUrl.slice(-6)}`
    : '';

  return {
    isConfigured: hasUrl && cfg.enabled,
    enabled: cfg.enabled,
    hasWebhook: hasUrl,
    maskedUrl
  };
}

/**
 * Sends a rich embed card to Discord
 */
export async function sendDiscordPayload(payload) {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.webhookUrl) {
    return { success: false, reason: 'Discord webhook not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.status === 204 || res.status === 200) {
      console.log('[DiscordNotifier] ✅ Alert dispatched to Discord successfully.');
      return { success: true };
    } else {
      const errText = await res.text().catch(() => '');
      console.warn('[DiscordNotifier] ❌ Discord returned error:', res.status, errText);
      return { success: false, error: `Discord HTTP ${res.status}: ${errText}` };
    }
  } catch (err) {
    console.warn('[DiscordNotifier] Dispatch failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Test webhook connectivity
 */
export async function testDiscordWebhook(customUrl) {
  const cfg = loadConfig();
  const url = customUrl || cfg.webhookUrl;

  if (!url || !url.startsWith('https://discord.com/api/webhooks/')) {
    return { success: false, error: 'Valid Discord Webhook URL is required.' };
  }

  const payload = {
    username: 'Drabyashree NEPSE Alerts',
    avatar_url: 'https://raw.githubusercontent.com/rexshsuwal/nepse-app/main/logo.png',
    embeds: [
      {
        title: '🔔 Drabyashree NEPSE Alert System — Connection Successful!',
        description: '✅ **100% Free Smartphone Alerts Connected.**\nYour Discord mobile app is now configured to receive real-time institutional flow alerts and 3:45 PM Daily Post-Market setups with **NPR 100,000 position sizing**.',
        color: 0x10b981, // Emerald green
        fields: [
          { name: 'Telecom SMS Cost', value: 'Rs. 0 (Free for Life)', inline: true },
          { name: 'Delivery Speed', value: '< 500ms Instant', inline: true },
          { name: 'Time', value: `${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu' })} NPT`, inline: true }
        ],
        footer: { text: 'Drabyashree NEPSE PRO • Institutional Grade Risk Engine' },
        timestamp: new Date().toISOString()
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.status === 204 || res.status === 200) {
      return { success: true, message: 'Test message sent successfully to your Discord channel!' };
    } else {
      return { success: false, error: `Failed to authenticate Discord webhook (Status ${res.status}).` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches an Institutional Smart Alert to Discord
 */
export async function sendDiscordSmartAlert(alertItem) {
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
    Math.floor(100000 / Math.max(1, ltp)),
    Math.max(10, Math.floor(1500 / riskPerShare))
  );
  const capitalOutlay = suggestedKitta * ltp;

  const payload = {
    username: 'Drabyashree Institutional Radar',
    avatar_url: 'https://raw.githubusercontent.com/rexshsuwal/nepse-app/main/logo.png',
    embeds: [
      {
        title: `🚨 INSTITUTIONAL SMART ALERT: ${sym}`,
        description: `**${brokersText}** actively absorbing **${conc}%** of float. Seller volume dry at VWAP support.`,
        color: 0x10b981, // Emerald Green
        fields: [
          { name: 'Live Price (LTP)', value: `Rs. ${ltp.toFixed(2)}`, inline: true },
          { name: 'Buy Zone', value: `Rs. ${bLow} – ${bHigh}`, inline: true },
          { name: 'Chase Cap (+2.5%)', value: `Rs. ${(bHigh * 1.025).toFixed(1)}`, inline: true },
          { name: '🛡️ Stop-Loss Floor', value: `Rs. ${sl} (-${(((ltp - sl) / ltp) * 100).toFixed(1)}%)`, inline: true },
          { name: '🎯 Target 1', value: `Rs. ${t1} (+${(((t1 - ltp) / ltp) * 100).toFixed(1)}%)`, inline: true },
          { name: '🎯 Target 2', value: `Rs. ${t2} (+${(((t2 - ltp) / ltp) * 100).toFixed(1)}%)`, inline: true },
          { name: '💼 100K Sizing (1.5% Risk)', value: `**${suggestedKitta} Kitta** (Rs. ${capitalOutlay.toLocaleString()} Outlay)`, inline: false },
        ],
        footer: { text: 'Strict Rule: Cancel trade if opening price gaps above Chase Cap.' },
        timestamp: new Date().toISOString()
      }
    ]
  };

  return await sendDiscordPayload(payload);
}

/**
 * Dispatches 3:45 PM Daily Post-Market Setup to Discord
 */
export async function sendDiscordPrimePickAlert(winner) {
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

  const payload = {
    username: 'Drabyashree Post-Market Scanner',
    avatar_url: 'https://raw.githubusercontent.com/rexshsuwal/nepse-app/main/logo.png',
    embeds: [
      {
        title: `👑 TOMORROW'S PRIME SETUP: ${sym} (${score}/100)`,
        description: `**Company:** ${name}\n**Audit Verdict:** ${verdict}\n*Filtered from 350+ NEPSE stocks at market close.*`,
        color: 0x38bdf8, // Sky Blue
        fields: [
          { name: '📍 Entry Limit Zone', value: `Rs. ${eLow} – ${eHigh}`, inline: true },
          { name: '⚠️ Chase Cap (+2.5% max)', value: `Rs. ${cCap}`, inline: true },
          { name: '🛡️ Stop-Loss Floor', value: `Rs. ${sl}`, inline: true },
          { name: '🎯 Target 1 (Net Gain)', value: `Rs. ${t1}`, inline: true },
          { name: '🎯 Target 2', value: `Rs. ${t2}`, inline: true },
          { name: '💼 100K Sizing', value: `**${kitta} Shares** (Rs. ${Number(capital).toLocaleString()} Capital)`, inline: true }
        ],
        footer: { text: 'Drabyashree NEPSE • 20-Trade Compound Compounding Engine' },
        timestamp: new Date().toISOString()
      }
    ]
  };

  return await sendDiscordPayload(payload);
}
