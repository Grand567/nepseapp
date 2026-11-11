import fs from 'fs';
import path from 'path';

// Read proxy/.env
const envPath = 'proxy/.env';
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

console.log('Token configured:', Boolean(token), 'Length:', token ? token.length : 0);
console.log('Chat ID configured:', Boolean(chatId), 'ChatId prefix:', chatId ? chatId.slice(0, 4) : 'none');

if (token) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await r.json();
    console.log('Telegram getMe result:', data.ok ? 'SUCCESS (Bot: ' + data.result?.username + ')' : 'FAILED: ' + data.description);
  } catch (e) {
    console.log('Network error:', e.message);
  }
}
