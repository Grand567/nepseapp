// proxy/keepalive.mjs
// Timezone-independent Keep-Alive heartbeat for Render deployment.
// Strictly matches NEPSE trading days (Sunday to Thursday, 10:45-15:15 NPT, Asia/Kathmandu time).
// Conserves Render free monthly quota during nights, Fridays, and Saturdays.

import https from 'https';
import { getKathmanduTradingStatus } from './utils/kathmanduTime.mjs';

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://nepseapp.onrender.com';
const PING_INTERVAL = 10 * 60 * 1000; // Ping every 10 minutes (safely inside Render 15-min sleep threshold)
const forcePing = process.argv.includes('--force');

export function executeKeepAlivePing(force = forcePing) {
  const kt = getKathmanduTradingStatus();

  // Guard: Only ping during NEPSE trading days (Sunday to Thursday, 10:45-15:15 NPT)
  // unless explicitly forced via --force
  if (!force && !kt.isKeepAliveWindow) {
    console.log(`[KeepAlive] ⏸️ Skipped: Outside NEPSE trading schedule (${kt.dayName} ${kt.timeStr}, Date: ${kt.dateIso}). Active: Sunday–Thursday 10:45–15:15 NPT.`);
    return false;
  }

  const url = `${RENDER_URL.replace(/\/$/, '')}/api/ping`;
  
  https.get(url, (res) => {
    if (res.statusCode === 200) {
      console.log(`[KeepAlive] ✅ Ping successful (${kt.dayName} ${kt.timeStr}) -> HTTP 200 OK`);
    } else {
      console.log(`[KeepAlive] ⚠️ Ping returned HTTP ${res.statusCode} (${kt.dayName} ${kt.timeStr})`);
    }
    res.resume();
  }).on('error', (err) => {
    console.log(`[KeepAlive] ❌ Ping failed: ${err.message} (${kt.dayName} ${kt.timeStr})`);
  });

  return true;
}

console.log('🔄 NEPSE Keep-Alive service initialized');
console.log(`📡 Target URL: ${RENDER_URL}/api/ping`);
console.log('⏰ Active Schedule: Sunday to Thursday, 10:45 AM – 3:15 PM NPT (Asia/Kathmandu)');

// Initial run
executeKeepAlivePing();

// Periodic timer
setInterval(() => executeKeepAlivePing(), PING_INTERVAL);
