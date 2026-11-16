// scripts/diagnose_why_ghl_missed.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

// Load dates
const allDates = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date ASC').all().map(r => r.trade_date);
const sortedDates = allDates.filter(d => d >= '2026-01-01');
const dateIndexMap = new Map(sortedDates.map((d, i) => [d, i]));

// Load market SMA
const mktRows = db.prepare(`
  SELECT trade_date, AVG(close_price) as avg_close
  FROM daily_stock_summary
  WHERE close_price > 0 AND symbol NOT LIKE '%PO%' AND symbol NOT LIKE '%DEB%'
  GROUP BY trade_date ORDER BY trade_date ASC
`).all();
const mktMap = new Map(mktRows.map(r => [r.trade_date, r.avg_close]));
const marketCloses = sortedDates.map(d => mktMap.get(d) || 0);
const marketSma20 = marketCloses.map((_, i) => {
  if (i < 19) return marketCloses[i];
  return marketCloses.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
});

// Load GHL history
const ghlBars = db.prepare(`
  SELECT trade_date as date, open_price as open, high_price as high, low_price as low, close_price as close, total_volume as volume, total_turnover as turnover
  FROM daily_stock_summary WHERE symbol = 'GHL' ORDER BY trade_date ASC
`).all();

// Check GHL broker alltime
const ghlFile = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime', 'GHL.json');
let ghlRollup = {};
if (fs.existsSync(ghlFile)) {
  ghlRollup = JSON.parse(fs.readFileSync(ghlFile, 'utf8')).dailyRollup || {};
}

// Overlay with SQLite daily_broker_ledger
const dbGhl = db.prepare('SELECT trade_date, broker_id, buy_vol, sell_vol, buy_amt, sell_amt FROM daily_broker_ledger WHERE symbol = ?').all('GHL');
for (const r of dbGhl) {
  if (!ghlRollup[r.trade_date]) ghlRollup[r.trade_date] = {};
  ghlRollup[r.trade_date][String(r.broker_id)] = [r.buy_vol, r.sell_vol, r.buy_amt, r.sell_amt];
}

console.log('Evaluating GHL across sessions between 2026-05-15 and 2026-11-02:');

for (let i = 0; i < sortedDates.length; i++) {
  const dt = sortedDates[i];
  if (dt < '2026-05-15' || dt > '2026-11-02') continue;
  const p = ghlBars.findIndex(h => h.date === dt);
  if (p < 30) continue;

  const c = ghlBars[p];
  const prev = ghlBars[p - 1];
  const chg1d = ((c.close - prev.close) / prev.close) * 100;
  const range = c.high - c.low;
  const upperWickRatio = range > 0 ? (c.high - Math.max(c.open, c.close)) / range : 0;
  const isBull = marketCloses[i] >= marketSma20[i];

  // 10-day base
  const c10 = ghlBars.slice(p - 9, p + 1).map(x => x.close);
  const spread10 = ((Math.max(...c10) - Math.min(...c10)) / Math.min(...c10)) * 100;
  const avgVol20 = ghlBars.slice(p - 20, p).reduce((s, x) => s + x.volume, 0) / 20;
  const vduToday = avgVol20 > 0 ? c.volume / avgVol20 : 1;

  // Broker metrics (10 day)
  let totalBuy = 0, totalSell = 0;
  const bMap = new Map();
  for (let k = Math.max(0, i - 9); k <= i; k++) {
    const dStr = sortedDates[k];
    const bObj = ghlRollup[dStr] || {};
    for (const [bId, v] of Object.entries(bObj)) {
      if (!bMap.has(bId)) bMap.set(bId, { buy: 0, sell: 0 });
      bMap.get(bId).buy += v[0];
      bMap.get(bId).sell += v[1];
      totalBuy += v[0];
      totalSell += v[1];
    }
  }
  const buyers = Array.from(bMap.entries()).map(([id, d]) => ({ id, buy: d.buy, sell: d.sell, net: d.buy - d.sell })).sort((a, b) => b.buy - a.buy);
  const top3Buy = buyers.slice(0, 3).reduce((s, b) => s + b.buy, 0);
  const top3Net = buyers.slice(0, 3).reduce((s, b) => s + Math.max(0, b.net), 0);
  const bcr3Buy = totalBuy > 0 ? (top3Buy / totalBuy) * 100 : 0;
  const netRet = top3Buy > 0 ? (top3Net / top3Buy) * 100 : 0;
  const leadBroker = buyers[0];

  // Check where GHL had high concentration
  if (leadBroker && leadBroker.id === '58' && netRet >= 70 && bcr3Buy >= 35) {
    console.log(
      `${dt} | Close: ${c.close} | Spread10: ${spread10.toFixed(1)}% | VDU: ${vduToday.toFixed(2)} | BCR3: ${bcr3Buy.toFixed(1)}% | Ret: ${netRet.toFixed(1)}% | Lead #${leadBroker.id} (+${leadBroker.net}k) | Mkt: ${isBull ? '🟢 Bull' : '🔴 Chop'} | Wick: ${(upperWickRatio*100).toFixed(0)}%`
    );
  }
}
