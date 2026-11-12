// scripts/detailed_backtest_runner.mjs
import Database from 'better-sqlite3';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';

const db = new Database(path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db'), { readonly: true });
const CAPITAL_PER_TRADE = 200000;
const HOLD_MAX = 15;

// 1. PRICE HISTORY
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

// 2. FUNDAMENTALS & SECTORS
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

// 3. BROKER DATA
const brokerByKey = new Map();
const brokerDateSet = new Set();
for (const r of db.prepare(`
  SELECT trade_date d, symbol s, broker_id b, buy_vol bv, sell_vol sv, buy_amt ba, cross_vol cv
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

// 4. FLOORSHEET TICKET SIZES
const ticket = new Map();
try {
  const tRows = db.prepare(`
    SELECT trade_date d, symbol s, buyer_member_id b, seller_member_id sm, contract_quantity q
    FROM raw_floorsheet
  `).all();
  for (const r of tRows) {
    const i = dIdx.get(r.d);
    if (i === undefined) continue;
    const k = `${String(r.s).toUpperCase()}|${i}`;
    if (!ticket.has(k)) ticket.set(k, { buy: new Map(), sell: new Map() });
    const e = ticket.get(k);
    const b = Number(r.b), s = Number(r.sm), q = Number(r.q);
    if (!e.buy.has(b)) e.buy.set(b, { k: 0, n: 0 });
    e.buy.get(b).k += q; e.buy.get(b).n++;
    if (!e.sell.has(s)) e.sell.set(s, { k: 0, n: 0 });
    e.sell.get(s).k += q; e.sell.get(s).n++;
  }
} catch (_) {}

function pctRank(arr, v) {
  const n = arr.filter(x => x <= v).length;
  return (n / arr.length) * 100;
}

// 5. BUILD CANDIDATE CONTEXT
function buildCtx(sym, i) {
  const H = hist.get(sym); const p = pos.get(sym)?.get(i);
  if (p === undefined || p < 30) return null;
  let cov = 0; for (let j = i - 9; j <= i; j++) if (brokerDateSet.has(j)) cov++;
  if (cov < 8 || !brokerByKey.has(`${sym}|${i}`)) return null;

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

  const obv = []; let o = 0;
  for (let q = p - 29; q <= p; q++) { if (q > p - 29) o += H[q].c > H[q - 1].c ? H[q].v : H[q].c < H[q - 1].c ? -H[q].v : 0; obv.push(o); }
  const obv15 = obv.slice(-15); const px15 = H.slice(p - 14, p + 1).map(x => x.c);
  const obvSpread = pctRank(obv15, obv15[14]) - pctRank(px15, px15[14]);

  const ret5 = (b.c / H[p - 5].c - 1) * 100;
  const ret20 = (b.c / H[p - 20].c - 1) * 100;

  const w10 = aggBrokers(sym, i - 9, i), w5 = aggBrokers(sym, i - 4, i), w1 = aggBrokers(sym, i, i);
  const buyers10 = [...w10.m.values()].sort((a, c) => c.buy - a.buy);
  const sellers10 = [...w10.m.values()].sort((a, c) => c.sell - a.sell);
  const top3 = buyers10.slice(0, 3);
  const top3Ids = new Set(top3.map(x => x.b));
  const top3Buy = top3.reduce((s, x) => s + x.buy, 0);
  const bcr3Buy = w10.totBuy > 0 ? (top3Buy / w10.totBuy) * 100 : 0;
  const bcr5Buy = w10.totBuy > 0 ? (buyers10.slice(0, 5).reduce((s, x) => s + x.buy, 0) / w10.totBuy) * 100 : 0;
  const bcr3Sell = w10.totSell > 0 ? (sellers10.slice(0, 3).reduce((s, x) => s + x.sell, 0) / w10.totSell) * 100 : 0;
  const top3Net10 = top3.reduce((s, x) => s + Math.max(0, x.buy - x.sell), 0);
  const ret10 = top3Buy > 0 ? top3Net10 / top3Buy : 0;
  let b5 = 0, n5 = 0;
  for (const id of top3Ids) { const x = w5.m.get(id); if (x) { b5 += x.buy; n5 += Math.max(0, x.buy - x.sell); } }
  const ret5w = b5 > 0 ? n5 / b5 : 0;

  const top3Cross = top3.reduce((s, x) => s + x.cross, 0);
  const crossShare = top3Buy > 0 ? top3Cross / top3Buy : 0;
  let top3DayNet = 0;
  for (const id of top3Ids) { const x = w1.m.get(id); if (x) top3DayNet += x.buy - x.sell; }

  let ticketRatio = null;
  const tk = ticket.get(`${sym}|${i}`);
  if (tk) {
    const sellTop3 = new Set(sellers10.slice(0, 3).map(x => x.b));
    let bk = 0, bn = 0, sk = 0, sn = 0;
    for (const [id, x] of tk.buy) if (top3Ids.has(id)) { bk += x.k; bn += x.n; }
    for (const [id, x] of tk.sell) if (sellTop3.has(id)) { sk += x.k; sn += x.n; }
    if (bn > 0 && sn > 0) ticketRatio = (bk / bn) / (sk / sn);
  }

  // QAI calculation
  const d1Buyers = [...w1.m.values()].sort((a, c) => c.buy - a.buy);
  const d1Sellers = [...w1.m.values()].sort((a, c) => c.sell - a.sell);
  const d1Bcr3B = w1.totBuy > 0 ? (d1Buyers.slice(0, 3).reduce((s, x) => s + x.buy, 0) / w1.totBuy) * 100 : 0;
  const d1Bcr3S = w1.totSell > 0 ? (d1Sellers.slice(0, 3).reduce((s, x) => s + x.sell, 0) / w1.totSell) * 100 : 0;
  const d1Gross = d1Buyers.slice(0, 3).reduce((s, x) => s + x.buy, 0);
  const d1Net = d1Buyers.slice(0, 3).reduce((s, x) => s + Math.max(0, x.buy - x.sell), 0);
  const d1Abs = d1Gross > 0 ? d1Net / d1Gross : 0.7;
  const qaiRatio = d1Bcr3B / (d1Bcr3S > 0 ? d1Bcr3S : 15);
  let pt = 12;
  if (pChange >= -1.2 && pChange <= 1.5) pt = 25; else if (pChange >= -1.8 && pChange <= 2.5) pt = 19;
  else if (pChange > 2.5 && pChange <= 4) pt = 10;
  let as = 10;
  if (d1Bcr3B >= 45 && d1Bcr3S <= 25) as = 30; else if (d1Bcr3B >= 38 && qaiRatio >= 1.5) as = 24;
  else if (d1Bcr3B >= 34 && qaiRatio >= 1.2) as = 18;
  let na = 10;
  if (d1Abs >= 0.85) na = 25; else if (d1Abs >= 0.70) na = 20; else if (d1Abs >= 0.55) na = 14;
  let qai = pt + as + na;

  return {
    sym, i, p, c: b.c, pChange, bbw, spread10, atr10, nrRatio, vdu, cmf, obvSpread,
    ret5, ret20, turnover: b.t, vol5, bcr3Buy, bcr5Buy, bcr3Sell, ret10, ret5w,
    leadId: buyers10[0]?.b, crossShare, top3DayNet, ticketRatio, qai,
    sector: fund.sector || 'Others', companyName: fund.companyName || sym
  };
}

// 6. SIMULATE HONEST TRADE WITH RATCHET ENGINE
function simulateTrade(x) {
  const H = hist.get(x.sym); const p = x.p;
  const signal = H[p]; const entryBar = H[p + 1];
  if (!entryBar || entryBar.i !== x.i + 1) return { skipped: 'NO_NEXT_SESSION' };
  if (entryBar.o > signal.c * 1.018) return { skipped: 'PREOPEN_GAP_CAP' };

  const entry = entryBar.o;
  const qty = Math.max(10, Math.floor(CAPITAL_PER_TRADE / entry));
  const capital = entry * qty;
  let stop = entry * (1 - 0.035), pendingStop = stop;
  let armed = false, t1Hit = false, remaining = 1.0, peak = entry, trough = entry;
  const fills = []; let reason = null, lastBar = entryBar, held = 0;
  const fwd = H.slice(p + 1, p + 1 + HOLD_MAX);

  for (let k = 0; k < fwd.length && remaining > 0; k++) {
    const bar = fwd[k]; lastBar = bar; held = k + 1;
    stop = pendingStop;

    if (k >= 2) { // T+2 Demat Lock
      if (bar.o <= stop) { fills.push({ px: bar.o, w: remaining, k }); remaining = 0; reason = armed || t1Hit ? 'RATCHET_STOP' : 'STOP_LOSS'; break; }
      if (bar.l <= stop) { fills.push({ px: stop, w: remaining, k }); remaining = 0; reason = armed || t1Hit ? 'RATCHET_STOP' : 'STOP_LOSS'; break; }
      if (!t1Hit && bar.h >= entry * 1.08) {
        const px = Math.max(bar.o, entry * 1.08);
        fills.push({ px, w: 0.5, k, type: 'T1' }); remaining -= 0.5; t1Hit = true;
        pendingStop = Math.max(pendingStop, entry * 1.045);
      }
      if (remaining > 0 && bar.h >= entry * 1.15) {
        const px = Math.max(bar.o, entry * 1.15);
        fills.push({ px, w: remaining, k, type: 'T2' }); remaining = 0; reason = 'TARGET_2'; break;
      }
    }

    peak = Math.max(peak, bar.h); trough = Math.min(trough, bar.l);
    if (!armed && bar.h >= entry * 1.055) {
      armed = true;
      pendingStop = Math.max(pendingStop, entry * 1.018);
    }
    if (!t1Hit && k < 2 && bar.h >= entry * 1.08) {
      pendingStop = Math.max(pendingStop, entry * 1.018);
    }
  }

  let truncated = false;
  if (remaining > 0) {
    fills.push({ px: lastBar.c, w: remaining, k: held - 1, type: 'TIME_OR_DATA_END' });
    truncated = fwd.length < HOLD_MAX;
    reason = truncated ? 'OPEN_AT_DATA_END' : (t1Hit ? 'T1_PARTIAL+TIME' : 'TIME_EXIT');
  } else if (t1Hit && reason !== 'TARGET_2') {
    reason = 'T1_PARTIAL+' + reason;
  }

  let netProfitNpr = 0;
  let totalSellNpr = 0;
  let totalFeesNpr = 0;
  let weightedExitPx = 0;

  for (const f of fills) {
    const q = Math.max(1, Math.round(qty * f.w));
    const rt = calculateRoundTripNetReturn({ buyPrice: entry, sellPrice: f.px, quantity: q, holdingDays: f.k + 1 });
    netProfitNpr += rt.netProfitNpr;
    totalSellNpr += f.px * q;
    totalFeesNpr += (rt.totalBuyCosts + rt.totalSellCosts - (f.px * q - entry * q - rt.netProfitNpr));
    weightedExitPx += f.px * f.w;
  }

  const netPct = (netProfitNpr / capital) * 100;
  const mfePct = ((peak - entry) / entry) * 100;
  const maePct = ((trough - entry) / entry) * 100;

  return {
    sym: x.sym,
    companyName: x.companyName,
    sector: x.sector,
    signalDate: dates[x.i],
    entryDate: dates[entryBar.i],
    entryPrice: +entry.toFixed(2),
    exitDate: dates[lastBar.i],
    exitPrice: +weightedExitPx.toFixed(2),
    heldSessions: held,
    reason,
    truncated,
    capital,
    netProfitNpr: Math.round(netProfitNpr),
    netPct: +netPct.toFixed(2),
    mfePct: +mfePct.toFixed(2),
    maePct: +maePct.toFixed(2),
    leadBroker: x.leadId,
    bcr3Buy: +x.bcr3Buy.toFixed(1),
    bcr3Sell: +x.bcr3Sell.toFixed(1),
    retention10D: +(x.ret10 * 100).toFixed(0),
    vdu: +x.vdu.toFixed(2),
    cmf: +x.cmf.toFixed(2),
    bbw: +x.bbw.toFixed(1),
    nrRatio: +x.nrRatio.toFixed(2),
    qai: x.qai,
    isWin: netProfitNpr > 0
  };
}

// 7. V2.0 PRODUCTION FILTER EVALUATION
// Core high-conviction stealth setup:
// Gate 0: no pump (ret5<12, ret20<25), wash<=30%, top3DayNet>=0, bcr3Sell<45, ticket>0.70
// Squeeze: -1.2 <= pChange <= +2.0, bbw<=14.0%
// Absorption: BCR3>=40%, retention>=70%
// Volume: VDU <= 0.60
// Liquidity: turnover >= 25L, vol5 >= 8000
const isV2Candidate = (x) => {
  // Gate 0
  if (x.ret5 >= 12 || x.ret20 >= 25) return false;
  if (x.crossShare > 0.30) return false;
  if (x.top3DayNet < 0) return false;
  if (x.bcr3Sell >= 45) return false; // v2.0 relaxed ceiling
  if (x.ticketRatio !== null && x.ticketRatio <= 0.70) return false;

  // Layer 1 Squeeze
  if (x.pChange < -1.2 || x.pChange > 2.0) return false;
  if (x.bbw > 14.0) return false;

  // Layer 2 Institutional
  if (x.bcr3Buy < 40.0) return false;
  if (x.ret10 < 0.70) return false;

  // Layer 3 Volume
  if (x.vdu > 0.60) return false;
  if (x.cmf < 0.05) return false;

  // Liquidity Floor
  if (x.turnover < 2500000 || x.vol5 < 8000) return false;

  return true;
};

// 8. RUN THE BACKTEST
const candidateCtxs = [];
const signalDates = brokerDates.filter(i => i >= 9);

for (const i of signalDates) {
  for (const sym of hist.keys()) {
    if (isExcludedInstrument(sym)) continue;
    const x = buildCtx(sym, i);
    if (x && isV2Candidate(x)) {
      candidateCtxs.push(x);
    }
  }
}

console.log(`\n========================================================================`);
console.log(`  NEPSE STEALTH ACCUMULATION v2.0 — DETAILED HISTORICAL BACKTEST REPORT`);
console.log(`  Universe: 392 symbols | Broker Sessions: ${brokerDates.length} | Capital/Trade: NPR 200,000`);
console.log(`========================================================================\n`);

const trades = [];
let skippedGap = 0;

for (const ctx of candidateCtxs) {
  const res = simulateTrade(ctx);
  if (res.skipped) {
    if (res.skipped === 'PREOPEN_GAP_CAP') skippedGap++;
    continue;
  }
  trades.push(res);
}

// Summary Metrics
const closedTrades = trades.filter(t => !t.truncated);
const winsAll = trades.filter(t => t.netPct > 0).length;
const winsClosed = closedTrades.filter(t => t.netPct > 0).length;

const totalNetProfitNpr = trades.reduce((s, t) => s + t.netProfitNpr, 0);
const grossWinsNpr = trades.filter(t => t.netProfitNpr > 0).reduce((s, t) => s + t.netProfitNpr, 0);
const grossLossesNpr = Math.abs(trades.filter(t => t.netProfitNpr < 0).reduce((s, t) => s + t.netProfitNpr, 0));
const profitFactor = grossLossesNpr > 0 ? (grossWinsNpr / grossLossesNpr).toFixed(2) : '999+';

const avgWinnerPct = (trades.filter(t => t.netPct > 0).reduce((s, t) => s + t.netPct, 0) / Math.max(1, winsAll)).toFixed(2);
const avgLoserPct = (trades.filter(t => t.netPct <= 0).reduce((s, t) => s + t.netPct, 0) / Math.max(1, trades.length - winsAll)).toFixed(2);
const avgExpectancyPct = (trades.reduce((s, t) => s + t.netPct, 0) / trades.length).toFixed(2);

console.log(`Total Candidates Evaluated: ${candidateCtxs.length}`);
console.log(`Skipped by Pre-Open Gap Cap (> +1.8%): ${skippedGap}`);
console.log(`Executed Trades: ${trades.length}`);
console.log(`Closed Trades: ${closedTrades.length} | Open Trades (Data Horizon End): ${trades.length - closedTrades.length}`);
console.log(`------------------------------------------------------------------------`);
console.log(`NET WIN RATE (ALL TRADES):    ${((winsAll / trades.length) * 100).toFixed(1)}% (${winsAll}/${trades.length})`);
console.log(`NET WIN RATE (CLOSED ONLY):   ${((winsClosed / closedTrades.length) * 100).toFixed(1)}% (${winsClosed}/${closedTrades.length})`);
console.log(`PROFIT FACTOR:                ${profitFactor}x`);
console.log(`NET EXPECTANCY PER TRADE:     +${avgExpectancyPct}%`);
console.log(`AVERAGE WINNER:               +${avgWinnerPct}%`);
console.log(`AVERAGE LOSER:                ${avgLoserPct}%`);
console.log(`TOTAL NET PROFIT (NPR):       Rs. ${totalNetProfitNpr.toLocaleString()} on Rs. 200k/trade`);
console.log(`========================================================================\n`);

console.log(JSON.stringify(trades, null, 2));
