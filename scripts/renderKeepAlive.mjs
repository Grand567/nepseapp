/**
 * scripts/renderKeepAlive.mjs
 * Standalone Keep-Alive ping utility for Render Free-Tier deployment.
 * Can be run manually or as a scheduled cron task to keep container active.
 */
import axios from 'axios';

const TARGET_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://nepseapp.onrender.com';

async function pingServer() {
  const url = `${TARGET_URL.replace(/\/$/, '')}/api/health`;
  const t0 = Date.now();
  try {
    const res = await axios.get(url, { timeout: 15000 });
    const latency = Date.now() - t0;
    console.log(`[KeepAlive] 200 OK from ${url} in ${latency}ms | Status: ${res.data.status} | Uptime: ${res.data.uptimeSec}s`);
    return true;
  } catch (err) {
    console.error(`[KeepAlive] Failed to ping ${url}: ${err.message}`);
    return false;
  }
}

if (process.argv[1] && process.argv[1].endsWith('renderKeepAlive.mjs')) {
  pingServer().then(ok => process.exit(ok ? 0 : 1));
}

export { pingServer };
