import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('Tables:', tables);

for (const t of ['telegram_config', 'app_config', 'settings', 'config']) {
  if (tables.includes(t)) {
    console.log(`Found table ${t}:`, db.prepare(`SELECT * FROM ${t}`).all());
  }
}

// Check telegram_config.json
if (fs.existsSync('proxy/data/telegram_config.json')) {
  console.log('telegram_config.json:', fs.readFileSync('proxy/data/telegram_config.json', 'utf8'));
}

// Check .env files
for (const envFile of ['.env', '.env.local', 'proxy/.env', 'proxy/.env.local']) {
  if (fs.existsSync(envFile)) {
    console.log(`Found ${envFile}`);
    const content = fs.readFileSync(envFile, 'utf8');
    const lines = content.split('\n').filter(l => l.includes('TELEGRAM') || l.includes('BOT'));
    console.log(`  Telegram keys in ${envFile}:`, lines.map(l => l.split('=')[0]));
  }
}
