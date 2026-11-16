// scripts/diag_funnel_counts.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Load price data
const rawRecords = db.prepare(`SELECT trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover FROM daily_stock_summary WHERE close_price > 0 ORDER BY trade_date ASC, symbol ASC`).all();
const scripHistoryMap = new Map();
const allDatesSet = new Set();
for (const r of rawRecords) {
  const sym = String(r.symbol || '').toUpperCase().trim();
  allDatesSet.add(r.trade_date);
  if (!scripHistoryMap.has(sym)) scripHistoryMap.set(sym, []);
  scripHistoryMap.get(sym).push({ date: r.trade_date, open: r.open_price, high: r.high_price, low: r.low_price, close: r.close_price, volume: r.total_volume, turnover: r.total_turnover });
}
const sortedDates = Array.from(allDatesSet).sort();
const dateIndexMap = new Map(sortedDates.map((d, i) => [d, i]));

// Load broker data
const scripBrokerByDate = new Map();
const alltimeDir = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime');
if (fs.existsSync(alltimeDir)) {
  for (const f of fs.readdirSync(alltimeDir).filter(f => f.endsWith('.json') && f >= 'broker_2026-04-15.json')) {
    const dt = f.replace('broker_', '').replace('.json', '');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(alltimeDir, f), 'utf8'));
      for (const [symRaw, list] of Object.entries(data)) {
        const sym = symRaw.toUpperCase().trim();
        if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
        scripBrokerByDate.get(sym).set(dt, (list || []).map(r => ({ brokerId: Number(r.brokerId || r.b || 0), buyVol: Number(r.buyQty || r.buy_vol || 0), sellVol: Number(r.sellQty || r.sell_vol || 0), buyAmt: Number(r.buyAmt || r.buy_amt || 0), sellAmt: Number(r.sellAmt || r.sell_amt || 0) })));
      }
    } catch (_) {}
  }
}

function aggregateBrokers(sym, dateIdx, lookbackDays) {
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap) return null;
  const startIdx = Math.max(0, dateIdx - lookbackDays + 1);
  const brokerAgg = new Map();
  let totalBuy = 0, totalSell = 0;
  for (let i = startIdx; i <= dateIdx; i++) {
    const dt = sortedDates[i];
    for (const r of (symMap.get(dt) || [])) {
      if (!brokerAgg.has(r.brokerId)) brokerAgg.set(r.brokerId, { buy: 0, sell: 0 });
      const b = brokerAgg.get(r.brokerId);
      b.buy += r.buyVol; b.sell += r.sellVol;
      totalBuy += r.buyVol; totalSell += r.sellVol;
    }
  }
  if (totalBuy === 0 && totalSell === 0) return null;
  const buyers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, buy: d.buy, sell: d.sell, net: d.buy - d.sell })).sort((a, b) => b.buy - a.buy);
  const top3Buy = buyers.slice(0, 3).reduce((s, b) => s + b.buy, 0);
  const top3Net = buyers.slice(0, 3).reduce((s, b) => s + Math.max(0, b.net), 0);
  const sellers = Array.from(brokerAgg.entries()).map(([id, d]) => ({ brokerId: id, sell: d.sell })).sort((a, b) => b.sell - a.sell);
  const top3Sell = sellers.slice(0, 3).reduce((s, b) => s + b.sell, 0);
  return { bcr3Buy: totalBuy > 0 ? (top3Buy / totalBuy) * 100 : 0, bcr3Sell: totalSell > 0 ? (top3Sell / totalSell) * 100 : 0, netRetention: top3Buy > 0 ? (top3Net / top3Buy) * 100 : 0 };
}

let cTotal = 0, cLiq = 0, cFlow = 0, cArch1 = 0, cArch2 = 0, cArch3 = 0;
const testDates = sortedDates.filter(d => d >= '2026-05-15' && d <= '2026-11-02');

for (const dt of testDates) {
  const dateIdx = dateIndexMap.get(dt);
  for (const [sym, history] of scripHistoryMap) {
    if (sym.includes('PO') || sym.includes('DEB') || (sym.endsWith('P') && sym !== 'NADEP') || /\d+$/.test(sym)) continue;
    const p = history.findIndex(h => h.date === dt);
    if (p < 30) continue;
    cTotal++;
    const c = history[p];
    if (c.close < 100 || c.turnover < 2500000 || c.volume < 8000) continue;
    cLiq++;

    const flow10 = aggregateBrokers(sym, dateIdx, 10);
    const flow5 = aggregateBrokers(sym, dateIdx, 5);
    if (!flow10 || !flow5) continue;
    if (flow10.bcr3Buy < 36 || flow10.bcr3Sell > 36 || flow10.netRetention < 65) continue;
    cFlow++;

    const closes = history.slice(0, p + 1).map(x => x.close);
    const c10 = closes.slice(-10);
    const spread10 = ((Math.max(...c10) - Math.min(...c10)) / Math.min(...c10)) * 100;
    const avgVol20 = history.slice(Math.max(0, p - 20), p).reduce((s, h) => s + h.volume, 0) / 20;
    const vdu = avgVol20 > 0 ? c.volume / avgVol20 : 1;
    const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
    const sma10 = closes.slice(-10).reduce((s, v) => s + v, 0) / 10;

    // Check Archetype 2: Pullback to 10 or 20 EMA
    const touchesEma = (c.low <= sma10 * 1.015 || c.low <= sma20 * 1.015) && c.close >= Math.min(sma10, sma20) * 0.99;
    if (touchesEma && vdu <= 0.85 && spread10 <= 12.0) {
      cArch2++;
    }

    // Check Archetype 3: Tight Base
    if (spread10 <= 8.0 && vdu <= 0.70) {
      cArch3++;
    }
  }
}

console.log({ cTotal, cLiq, cFlow, cArch2, cArch3 });
