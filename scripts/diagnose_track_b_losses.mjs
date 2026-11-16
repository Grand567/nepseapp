// scripts/diagnose_track_b_losses.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

// Load fundamentals for float shares
const fundRows = db.prepare('SELECT symbol, sector, public_float_kitta, paid_up_capital FROM scrip_fundamentals').all();
const fundMap = new Map();
for (const f of fundRows) {
  fundMap.set(f.symbol, {
    sector: f.sector || 'Equities',
    floatKitta: Number(f.public_float_kitta || 0),
    paidUp: Number(f.paid_up_capital || 0),
  });
}

function getEstimatedPublicFloat(sym, sector) {
  const f = fundMap.get(sym);
  if (f && f.floatKitta > 0) return f.floatKitta;
  if (f && f.paidUp > 0) {
    const estKitta = f.paidUp / 100;
    // Estimate float based on sector norms
    if (sector === 'Commercial Banks') return estKitta * 0.30;
    if (sector === 'Hydro Power' || sector === 'Hydropower') return estKitta * 0.20;
    if (sector === 'Finance' || sector === 'Development Bank Limited') return estKitta * 0.40;
    if (sector === 'Microfinance') return estKitta * 0.35;
    return estKitta * 0.25;
  }
  // Standard fallbacks
  if (sector === 'Commercial Banks') return 25000000;
  if (sector === 'Hydro Power' || sector === 'Hydropower') return 6000000;
  if (sector === 'Finance' || sector === 'Development Bank Limited') return 4500000;
  if (sector === 'Microfinance') return 1500000;
  return 5000000;
}

// Track B Trades from 6-Month Backtest:
// 9 Wins:
// 1. GBBL (2026-05-19) -> +0.24%
// 2. MEN (2026-07-27) -> +4.45%
// 3. GBBL (2026-07-30) -> +1.80%
// 4. EBL (2026-07-31) -> +0.41%
// 5. NBL (2026-08-05) -> +7.23%
// 6. MBJC (2026-09-10) -> +7.07%
// 7. MBJC (2026-09-28) -> +9.13%
// 8. GCIL (2026-10-06) -> +1.38%
// 9. KSBBL (2026-10-27) -> +2.32%
//
// 4 Losses:
// 1. SBL (2026-06-10) -> -4.17%
// 2. SHL (2026-07-31) -> -0.66%
// 3. NABIL (2026-08-11) -> -4.18%
// 4. SARBTM (2026-10-28) -> -4.18%

const allTrades = [
  { sym: 'GBBL', date: '2026-05-19', isWin: true, net: '+0.24%' },
  { sym: 'SBL', date: '2026-06-10', isWin: false, net: '-4.17%' },
  { sym: 'MEN', date: '2026-07-27', isWin: true, net: '+4.45%' },
  { sym: 'GBBL', date: '2026-07-30', isWin: true, net: '+1.80%' },
  { sym: 'EBL', date: '2026-07-31', isWin: true, net: '+0.41%' },
  { sym: 'SHL', date: '2026-07-31', isWin: false, net: '-0.66%' },
  { sym: 'NBL', date: '2026-08-05', isWin: true, net: '+7.23%' },
  { sym: 'NABIL', date: '2026-08-11', isWin: false, net: '-4.18%' },
  { sym: 'MBJC', date: '2026-09-10', isWin: true, net: '+7.07%' },
  { sym: 'MBJC', date: '2026-09-28', isWin: true, net: '+9.13%' },
  { sym: 'GCIL', date: '2026-10-06', isWin: true, net: '+1.38%' },
  { sym: 'KSBBL', date: '2026-10-27', isWin: true, net: '+2.32%' },
  { sym: 'SARBTM', date: '2026-10-28', isWin: false, net: '-4.18%' },
];

console.log('Diagnosing Track B Trades: Winners vs Losers on Free Float % & Microstructure...\n');

// Load broker alltime + DB
const scripBrokerByDate = new Map();
const alltimeDir = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime');
if (fs.existsSync(alltimeDir)) {
  const files = fs.readdirSync(alltimeDir).filter(f => f.endsWith('.json') && f !== 'crawler_progress.json');
  for (const f of files) {
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(alltimeDir, f), 'utf8'));
      const sym = String(obj.symbol || f.replace('.json', '')).toUpperCase().trim();
      const rollup = obj.dailyRollup || {};
      if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
      const symMap = scripBrokerByDate.get(sym);
      for (const [dt, brokersObj] of Object.entries(rollup)) {
        const arr = [];
        for (const [bId, vals] of Object.entries(brokersObj)) {
          if (vals[0] > 0 || vals[1] > 0) {
            arr.push({ brokerId: Number(bId), buyVol: vals[0], sellVol: vals[1], buyAmt: vals[2], sellAmt: vals[3] });
          }
        }
        if (arr.length > 0) symMap.set(dt, arr);
      }
    } catch (_) {}
  }
}

const dbBroker = db.prepare(`SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt FROM daily_broker_ledger WHERE COALESCE(is_quarantined,0)=0`).all();
for (const b of dbBroker) {
  const sym = String(b.symbol || '').toUpperCase().trim();
  if (!scripBrokerByDate.has(sym)) scripBrokerByDate.set(sym, new Map());
  const symMap = scripBrokerByDate.get(sym);
  if (!symMap.has(b.trade_date)) symMap.set(b.trade_date, []);
  symMap.get(b.trade_date).push({ brokerId: b.broker_id, buyVol: b.buy_vol, sellVol: b.sell_vol, buyAmt: b.buy_amt, sellAmt: b.sell_amt });
}

// All dates
const allDates = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date ASC').all().map(r => r.trade_date);
const dateIndexMap = new Map(allDates.map((d, i) => [d, i]));

for (const t of allTrades) {
  const sym = t.sym;
  const dt = t.date;
  const dateIdx = dateIndexMap.get(dt);
  const fund = fundMap.get(sym);
  const sector = fund?.sector || 'Equities';
  const floatShares = getEstimatedPublicFloat(sym, sector);

  // 5-day and 10-day broker flow
  const symMap = scripBrokerByDate.get(sym);
  let total5Net = 0, lead5Net = 0, lead5Id = null;
  let total10Net = 0, lead10Net = 0, lead10Id = null;

  if (symMap) {
    // 5 day
    const b5 = new Map();
    for (let k = Math.max(0, dateIdx - 4); k <= dateIdx; k++) {
      const rows = symMap.get(allDates[k]) || [];
      for (const r of rows) {
        if (!b5.has(r.brokerId)) b5.set(r.brokerId, { buy: 0, sell: 0 });
        b5.get(r.brokerId).buy += r.buyVol;
        b5.get(r.brokerId).sell += r.sellVol;
      }
    }
    const b5Arr = Array.from(b5.entries()).map(([id, d]) => ({ id, net: d.buy - d.sell })).sort((a, b) => b.net - a.net);
    if (b5Arr.length > 0) {
      lead5Id = b5Arr[0].id;
      lead5Net = b5Arr[0].net;
      total5Net = b5Arr.filter(x => x.net > 0).reduce((s, x) => s + x.net, 0);
    }
  }

  // Stock candle and VDU
  const bars = db.prepare('SELECT trade_date, open_price, high_price, low_price, close_price, total_volume FROM daily_stock_summary WHERE symbol = ? AND trade_date <= ? ORDER BY trade_date DESC LIMIT 25').all(sym, dt);
  const cur = bars[0];
  const avgVol20 = bars.slice(1, 21).reduce((s, b) => s + b.total_volume, 0) / 20;
  const vdu = cur.total_volume / Math.max(1, avgVol20);
  const chg1d = bars[1] ? ((cur.close_price - bars[1].close_price) / bars[1].close_price) * 100 : 0;

  const leadNetFloatPct = floatShares > 0 ? (lead5Net / floatShares) * 100 : 0;
  const totalNetFloatPct = floatShares > 0 ? (total5Net / floatShares) * 100 : 0;

  console.log(
    `${t.isWin ? '✅ WIN ' : '❌ LOSS'} | ${sym.padEnd(7)} (${dt}) | Return: ${t.net.padStart(7)} | Lead #${String(lead5Id).padEnd(2)}: +${String(lead5Net).padStart(7)} kitta (${leadNetFloatPct.toFixed(2)}% float) | Total 5D Net: ${totalNetFloatPct.toFixed(2)}% float | VDU: ${vdu.toFixed(2)} | Chg: ${chg1d >= 0 ? '+' : ''}${chg1d.toFixed(1)}% | Float: ${(floatShares/1000000).toFixed(1)}M (${sector})`
  );
}
