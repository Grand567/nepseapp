/**
 * scripts/renderKeepAlive.mjs
 * Standalone Keep-Alive ping utility for Render Free-Tier deployment.
 * Can be run manually or as a scheduled cron task to keep container active.
 */
import axios from 'axios';
import { getKathmanduTradingStatus } from '../proxy/utils/kathmanduTime.mjs';

const TARGET_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://nepseapp.onrender.com';
const forcePing = process.argv.includes('--force');

async function pingServer(force = forcePing) {
  const kt = getKathmanduTradingStatus();
  if (!force && !kt.isKeepAliveWindow) {
    console.log(`[KeepAlive] ⏸️ Skipped: Outside NEPSE trading window (${kt.dayName} ${kt.timeStr}, ${kt.dateIso}). Active: Sunday–Thursday 10:45–15:15 NPT.`);
    return true;
  }

  const url = `${TARGET_URL.replace(/\/$/, '')}/api/health`;
  const t0 = Date.now();
  try {
    const res = await axios.get(url, { timeout: 15000 });
    const latency = Date.now() - t0;
    console.log(`[KeepAlive] 200 OK from ${url} in ${latency}ms | Status: ${res.data.status} | Uptime: ${res.data.uptimeSec}s (${kt.dayName} ${kt.timeStr})`);
    return true;
  } catch (err) {
    console.error(`[KeepAlive] Failed to ping ${url}: ${err.message} (${kt.dayName} ${kt.timeStr})`);
    return false;
  }
}

if (process.argv[1] && process.argv[1].endsWith('renderKeepAlive.mjs')) {
  pingServer().then(ok => process.exit(ok ? 0 : 1));
}

export { pingServer };
