// proxy/keepalive.mjs
// ADD THIS TO YOUR PROXY FOLDER
// Prevents Render free tier from sleeping

import https from 'https';

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://nepseapp.onrender.com';
const PING_INTERVAL = 14 * 60 * 1000; // Every 14 minutes

function ping() {
  const url = `${RENDER_URL}/health`;
  
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
console.log(`📡 Pinging ${RENDER_URL} every 14 minutes`);

// Ping immediately
ping();

// Then ping every 14 minutes
setInterval(ping, PING_INTERVAL);
