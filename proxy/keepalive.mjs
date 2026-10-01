// proxy/keepalive.mjs
// Prevents Render free tier from sleeping by pinging every 12 minutes.
// Render free tier sleeps after 15 minutes of inactivity — 12 min is safely within the window.

import https from 'https';

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://nepseapp.onrender.com';
const PING_INTERVAL = 12 * 60 * 1000; // Every 12 minutes (< 15-minute Render sleep threshold)

function ping() {
  // Use /api/ping — always returns { ok: true } instantly
  const url = `${RENDER_URL}/api/ping`;
  
  https.get(url, (res) => {
    const now = new Date().toLocaleTimeString();
    if (res.statusCode === 200) {
      console.log(`✅ [${now}] Keep-alive ping successful`);
    } else {
      console.log(`⚠️ [${now}] Keep-alive ping: HTTP ${res.statusCode}`);
    }
    res.resume();
  }).on('error', (err) => {
    const now = new Date().toLocaleTimeString();
    console.log(`❌ [${now}] Keep-alive ping failed: ${err.message}`);
  });
}

console.log('🔄 Keep-alive service started');
console.log(`📡 Pinging ${RENDER_URL}/api/ping every 12 minutes`);

// Ping immediately
ping();

// Then ping every 12 minutes
setInterval(ping, PING_INTERVAL);
