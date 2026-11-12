// scripts/scan_latest_v2.mjs
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db'), { readonly: true });

const priceRows = db.prepare(`
  SELECT trade_date d, symbol s, open_price o, high_price h, low_price l, close_price c,
         total_volume v, total_turnover t
  FROM daily_stock_summary
  WHERE COALESCE(is_quarantined,0)=0 AND close_price > 0
  ORDER BY trade_date ASC
`).all();

const dates = [...new Set(priceRows.map(r => r.d))].sort();
const dIdx = new Map(dates.map((d, i) => [d, i]));
const hist = new Map();
const pos = new Map();

for (const r of priceRows) {
  const s = String(r.s).toUpperCase().trim();
  const i = dIdx.get(r.d);
  if (!hist.has(s)) { hist.set(s, []); pos.set(s, new Map()); }
  const c = Number(r.c);
  const bar = {
    i,
    o: Number(r.o) || c,
    h: Math.max(Number(r.h) || c, c),
    l: Math.min(Number(r.l) || c, c),
    c,
    v: Number(r.v) || 0,
    t: Number(r.t) || 0
  };
  pos.get(s).set(i, hist.get(s).length);
  hist.get(s).push(bar);
}

const normSector = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'Others';
  if (s.includes('hydro')) return 'Hydro Power';
  if (s.includes('development')) return 'Development Banks';
  if (s.includes('commercial')) return 'Commercial Banks';
  if (s.includes('micro')) return 'Microfinance';
  if (s.includes('non-life') || s.includes('non life')) return 'Non-Life Insurance';
  if (s.includes('life')) return 'Life Insurance';
  if (s.includes('finance')) return 'Finance';
  if (s.includes('hotel')) return 'Hotels & Tourism';
  if (s.includes('manufact')) return 'Manufacturing';
  if (s.includes('invest')) return 'Investment';
  if (s.includes('debenture')) return 'DEBENTURE';
  if (s.includes('mutual')) return 'MUTUAL_FUND';
  if (s.includes('promot')) return 'PROMOTER';
  if (s.includes('trad')) return 'Trading';
  return 'Others';
};

const fundamentals = new Map();
for (const f of db.prepare('SELECT * FROM scrip_fundamentals').all()) {
  fundamentals.set(String(f.symbol).toUpperCase(), {
    sector: normSector(f.sector),
    bookValue: Number(f.book_value_per_share) || null,
    companyName: f.company_name || f.symbol
  });
}

const isExcludedInstrument = (sym) => {
  const f = fundamentals.get(sym);
  if (f && ['DEBENTURE', 'MUTUAL_FUND', 'PROMOTER'].includes(f.sector)) return true;
  if (sym.endsWith('PO') || (sym.endsWith('P') && sym !== 'NADEP')) return true;
  if (sym.includes('DEB') || sym.startsWith('NMB50') || sym.startsWith('ADBLD')) return true;
  if (/\d+$/.test(sym)) return true;
  return false;
};

const brokerByKey = new Map();
const brokerDateSet = new Set();
for (const r of db.prepare(`
  SELECT trade_date d, symbol s, broker_id b, buy_vol bv, sell_vol sv, cross_vol cv
  FROM daily_broker_ledger
  WHERE COALESCE(is_quarantined,0)=0 AND (buy_vol > 0 OR sell_vol > 0)
`).iterate()) {
  const i = dIdx.get(r.d);
  if (i === undefined) continue;
  brokerDateSet.add(i);
  const k = `${String(r.s).toUpperCase()}|${i}`;
  if (!brokerByKey.has(k)) brokerByKey.set(k, []);
  brokerByKey.get(k).push({
    b: Number(r.b),
    buy: Number(r.bv) || 0,
    sell: Number(r.sv) || 0,
    cross: Number(r.cv) || 0
  });
}
const brokerDates = [...brokerDateSet].sort((a, b) => a - b);

function aggBrokers(sym, iStart, iEnd) {
  const m = new Map();
  let totBuy = 0, totSell = 0;
  for (let i = iStart; i <= iEnd; i++) {
    const list = brokerByKey.get(`${sym}|${i}`) || [];
    for (const r of list) {
      if (!m.has(r.b)) m.set(r.b, { b: r.b, buy: 0, sell: 0, cross: 0 });
      const e = m.get(r.b);
      e.buy += r.buy; e.sell += r.sell; e.cross += r.cross;
      totBuy += r.buy; totSell += r.sell;
    }
  }
  return { m, totBuy, totSell };
}

function evaluateScrip(sym, i) {
  const H = hist.get(sym); const p = pos.get(sym)?.get(i);
  if (p === undefined || p < 30) return null;
  if (!brokerByKey.has(`${sym}|${i}`)) return null;

  const b = H[p], prev = H[p - 1];
  const fund = fundamentals.get(sym) || {};
  const pChange = (b.c / prev.c - 1) * 100;

  const closes20 = H.slice(p - 19, p + 1).map(x => x.c);
  const mean20 = closes20.reduce((s, v) => s + v, 0) / 20;
  const std20 = Math.sqrt(closes20.reduce((s, v) => s + (v - mean20) ** 2, 0) / 20);
  const bbw = mean20 > 0 ? (2 * std20 / mean20) * 100 : 99;
  const c10 = H.slice(p - 9, p + 1).map(x => x.c);
  const spread10 = ((Math.max(...c10) - Math.min(...c10)) / Math.min(...c10)) * 100;

  let trSum = 0;
  for (let q = p - 9; q <= p; q++) trSum += Math.max(H[q].h - H[q].l, Math.abs(H[q].h - H[q - 1].c), Math.abs(H[q].l - H[q - 1].c));
  const atr10 = trSum / 10;
  const nrRatio = atr10 > 0 ? (b.h - b.l) / atr10 : 1;

  const vol5 = H.slice(p - 4, p + 1).reduce((s, x) => s + x.v, 0) / 5;
  const vol20prior = H.slice(p - 24, p - 4).reduce((s, x) => s + x.v, 0) / 20;
  const vdu = vol20prior > 0 ? vol5 / vol20prior : 9;

  let mfv = 0, mv = 0;
  for (let q = p - 19; q <= p; q++) {
    const rg = H[q].h - H[q].l;
    const mfm = rg > 0 ? ((H[q].c - H[q].l) - (H[q].h - H[q].c)) / rg : 0;
    mfv += mfm * H[q].v; mv += H[q].v;
  }
  const cmf = mv > 0 ? mfv / mv : 0;

  const w10 = aggBrokers(sym, i - 9, i), w5 = aggBrokers(sym, i - 4, i), w1 = aggBrokers(sym, i, i);
  const buyers10 = [...w10.m.values()].sort((a, c) => c.buy - a.buy);
  const sellers10 = [...w10.m.values()].sort((a, c) => c.sell - a.sell);
  const top3 = buyers10.slice(0, 3);
  const top3Ids = new Set(top3.map(x => x.b));
  const top3Buy = top3.reduce((s, x) => s + x.buy, 0);
  const bcr3Buy = w10.totBuy > 0 ? (top3Buy / w10.totBuy) * 100 : 0;
  const bcr3Sell = w10.totSell > 0 ? (sellers10.slice(0, 3).reduce((s, x) => s + x.sell, 0) / w10.totSell) * 100 : 0;
  const top3Net10 = top3.reduce((s, x) => s + Math.max(0, x.buy - x.sell), 0);
  const ret10 = top3Buy > 0 ? top3Net10 / top3Buy : 0;
  let b5 = 0, n5 = 0;
  for (const id of top3Ids) { const x = w5.m.get(id); if (x) { b5 += x.buy; n5 += Math.max(0, x.buy - x.sell); } }
  const ret5w = b5 > 0 ? n5 / b5 : 0;

  const ret5 = (b.c / H[p - 5].c - 1) * 100;
  const ret20 = (b.c / H[p - 20].c - 1) * 100;
  const top3Cross = top3.reduce((s, x) => s + x.cross, 0);
  const crossShare = top3Buy > 0 ? top3Cross / top3Buy : 0;
  let top3DayNet = 0;
  for (const id of top3Ids) { const x = w1.m.get(id); if (x) top3DayNet += x.buy - x.sell; }

  // Check v2 criteria
  const gate0Pass = ret5 < 12 && ret20 < 25 && crossShare <= 0.30 && top3DayNet >= 0 && bcr3Sell < 45 && b.c >= 50;
  const squeezePass = pChange >= -1.2 && pChange <= 2.0 && bbw <= 14.0;
  const flowPass = bcr3Buy >= 40.0 && ret10 >= 0.70;
  const volPass = vdu <= 0.60 && cmf >= 0.05;
  const liqPass = b.t >= 2500000 && vol5 >= 8000;

  return {
    sym,
    date: dates[i],
    c: b.c,
    pChange: +pChange.toFixed(2),
    bbw: +bbw.toFixed(1),
    spread10: +spread10.toFixed(1),
    vdu: +vdu.toFixed(2),
    cmf: +cmf.toFixed(2),
    bcr3Buy: +bcr3Buy.toFixed(1),
    bcr3Sell: +bcr3Sell.toFixed(1),
    ret10: +(ret10 * 100).toFixed(0),
    turnoverLakhs: +(b.t / 100000).toFixed(1),
    leadBroker: buyers10[0]?.b,
    topBrokers: buyers10.slice(0, 3).map(b => b.b),
    sector: fund.sector || 'Others',
    companyName: fund.companyName || sym,
    gate0Pass,
    squeezePass,
    flowPass,
    volPass,
    liqPass,
    isQualified: gate0Pass && squeezePass && flowPass && volPass && liqPass
  };
}

const lastSessionIdx = brokerDates[brokerDates.length - 1]; // 2026-11-06
const prevSessionIdx = brokerDates[brokerDates.length - 2]; // 2026-11-05
const prev2SessionIdx = brokerDates[brokerDates.length - 3]; // 2026-11-04

console.log('Evaluating session:', dates[lastSessionIdx], '(Index:', lastSessionIdx, ')');

const results = [];
for (const sym of hist.keys()) {
  if (isExcludedInstrument(sym)) continue;
  const r = evaluateScrip(sym, lastSessionIdx);
  if (r) results.push(r);
}

const qualifiedToday = results.filter(r => r.isQualified);
console.log(`Qualified on ${dates[lastSessionIdx]}:`, qualifiedToday.length);
console.log(JSON.stringify(qualifiedToday, null, 2));

console.log('\nChecking previous session:', dates[prevSessionIdx]);
const prevResults = [];
for (const sym of hist.keys()) {
  if (isExcludedInstrument(sym)) continue;
  const r = evaluateScrip(sym, prevSessionIdx);
  if (r && r.isQualified) prevResults.push(r);
}
console.log(`Qualified on ${dates[prevSessionIdx]}:`, JSON.stringify(prevResults, null, 2));

console.log('\nChecking 2 sessions prior:', dates[prev2SessionIdx]);
const prev2Results = [];
for (const sym of hist.keys()) {
  if (isExcludedInstrument(sym)) continue;
  const r = evaluateScrip(sym, prev2SessionIdx);
  if (r && r.isQualified) prev2Results.push(r);
}
console.log(`Qualified on ${dates[prev2SessionIdx]}:`, JSON.stringify(prev2Results, null, 2));
