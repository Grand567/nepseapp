import https from 'https';
import fs from 'fs';

// Read proxy/.env for token
const envPath = 'proxy/.env';
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Use https request to 149.154.166.110 with Host header and servername api.telegram.org
const options = {
  host: '149.154.166.110',
  port: 443,
  path: `/bot${token}/getMe`,
  method: 'GET',
  headers: {
    'Host': 'api.telegram.org'
  },
  servername: 'api.telegram.org'
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Direct Telegram response:', data);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.end();
