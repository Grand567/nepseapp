/**
 * scripts/backtest_upgraded_flowchart.mjs
 *
 * Point-in-time backtest of the 29-factor "Upgraded Stealth Accumulation Flowchart".
 *
 * Honesty rules enforced:
 *  - Signals use only data available at the 3:15 PM close of the signal day.
 *  - Entry = NEXT session open (pre-open gap cap applied against signal-day close).
 *  - T+2 demat lock: no exit on entry day (k=0) or k=1.
 *  - Gap-through stops fill at the open, not at the stop price.
 *  - If a bar touches both stop and target, the STOP is assumed to fill first.
 *  - Ratchet / T1 stop moves take effect from the NEXT bar (no same-bar look-ahead).
 *  - Realistic position size (Rs 2,00,000) so the Rs 25 DP fee is not distorted.
 *  - Factor 17 is tested both as the static list (look-ahead biased) and walk-forward.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { calculateRoundTripNetReturn } from '../src/constants/marketRules.js';

const db = new Database(path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db'), { readonly: true });
const CAPITAL_PER_TRADE = 200000;
const HOLD_MAX = 15;
const OUT_JSON = process.argv[2] || null;

// ───────────────────────── 1. PRICES ─────────────────────────
const priceRows = db.prepare(`
  SELECT trade_date d, symbol s, open_price o, high_price h, low_price l, close_price c,
         total_volume v, total_turnover t
  FROM daily_stock_summary
  WHERE COALESCE(is_quarantined,0)=0 AND close_price > 0
  ORDER BY trade_date ASC
`).all();

const dates = [...new Set(priceRows.map(r => r.d))].sort();
const dIdx = new Map(dates.map((d, i) => [d, i]));
const hist = new Map();   // sym -> [{i,o,h,l,c,v,t}]
const pos = new Map();    // sym -> Map(dateIdx -> position)
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

// ───────────────────────── 2. FUNDAMENTALS ─────────────────────────
const normSector = (raw) => {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
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
  const pub = Number(f.public_float_kitta) > 0
    ? Number(f.public_float_kitta)
    : (Number(f.paid_up_capital) > 0 && Number(f.public_share_pct) > 0
      ? (Number(f.paid_up_capital) / 100) * (Number(f.public_share_pct) / 100)
      : null);
  fundamentals.set(String(f.symbol).toUpperCase(), {
    sector: normSector(f.sector),
    bookValue: Number(f.book_value_per_share) || null,
    floatKitta: pub,
    promoterUnlock: f.promoter_unlock_date || null
  });
}

const isExcludedInstrument = (sym) => {
  const f = fundamentals.get(sym);
  if (f && ['DEBENTURE', 'MUTUAL_FUND', 'PROMOTER'].includes(f.sector)) return true;
  if (sym.endsWith('PO') || (sym.endsWith('P') && sym !== 'NADEP')) return true;
  if (sym.includes('DEB') || sym.startsWith('NMB50') || sym.startsWith('ADBLD')) return true;
  if (/\d+$/.test(sym)) return true; // bonds/debentures/funds carry numeric suffixes
  return false;
};

// ───────────────────────── 3. SECTOR & MARKET INDICES (equal-weighted) ─────────────────────────
const sectorRets = new Map(); // sector -> array of avg daily returns
const marketRet = new Array(dates.length).fill(0);
{
  const sums = new Map(); const cnts = new Map();
  const mSum = new Array(dates.length).fill(0); const mCnt = new Array(dates.length).fill(0);
  for (const [sym, H] of hist) {
    if (isExcludedInstrument(sym)) continue;
    const sec = fundamentals.get(sym)?.sector || null;
    for (let p = 1; p < H.length; p++) {
      if (H[p].i !== H[p - 1].i + 1) continue;
      const r = H[p].c / H[p - 1].c - 1;
      if (!isFinite(r) || Math.abs(r) > 0.16) continue; // ignore corporate-action jumps
      mSum[H[p].i] += r; mCnt[H[p].i]++;
      if (sec) {
        if (!sums.has(sec)) { sums.set(sec, new Array(dates.length).fill(0)); cnts.set(sec, new Array(dates.length).fill(0)); }
        sums.get(sec)[H[p].i] += r; cnts.get(sec)[H[p].i]++;
      }
    }
  }
  for (let i = 0; i < dates.length; i++) marketRet[i] = mCnt[i] ? mSum[i] / mCnt[i] : 0;
  for (const [sec, arr] of sums) sectorRets.set(sec, arr.map((v, i) => (cnts.get(sec)[i] ? v / cnts.get(sec)[i] : 0)));
}
const toLevel = (rets) => { const L = []; let x = 100; for (const r of rets) { x *= 1 + r; L.push(x); } return L; };
const ema = (arr, n) => { const k = 2 / (n + 1); const out = []; let e = arr[0]; for (const v of arr) { e = v * k + e * (1 - k); out.push(e); } return out; };
const marketLevel = toLevel(marketRet);
const sectorLevel = new Map(); const sectorEma = new Map();
for (const [sec, rets] of sectorRets) { const L = toLevel(rets); sectorLevel.set(sec, L); sectorEma.set(sec, ema(L, 20)); }

// ───────────────────────── 4. BROKER LEDGER ─────────────────────────
const brokerByKey = new Map(); // `${sym}|${i}` -> rows
const brokerDateSet = new Set();
for (const r of db.prepare(`
  SELECT trade_date d, symbol s, broker_id b, buy_vol bv, sell_vol sv, buy_amt ba, cross_vol cv
  FROM daily_broker_ledger WHERE COALESCE(is_quarantined,0)=0 AND (buy_vol>0 OR sell_vol>0)
`).iterate()) {
  const i = dIdx.get(r.d);
  if (i === undefined) continue;
  brokerDateSet.add(i);
  const key = `${String(r.s).toUpperCase()}|${i}`;
  if (!brokerByKey.has(key)) brokerByKey.set(key, []);
  brokerByKey.get(key).push({ b: Number(r.b), buy: Number(r.bv) || 0, sell: Number(r.sv) || 0, buyAmt: Number(r.ba) || 0, cross: Number(r.cv) || 0 });
}
const brokerDates = [...brokerDateSet].sort((a, b) => a - b);

function aggBrokers(sym, from, to) {
  const m = new Map(); let totBuy = 0, totSell = 0;
  for (let i = from; i <= to; i++) {
    const rows = brokerByKey.get(`${sym}|${i}`);
    if (!rows) continue;
    for (const r of rows) {
      if (!m.has(r.b)) m.set(r.b, { b: r.b, buy: 0, sell: 0, buyAmt: 0, cross: 0 });
      const x = m.get(r.b);
      x.buy += r.buy; x.sell += r.sell; x.buyAmt += r.buyAmt; x.cross += r.cross;
      totBuy += r.buy; totSell += r.sell;
    }
  }
  return { m, totBuy, totSell };
}

// ───────────────────────── 5. FLOORSHEET TICKET SIZES ─────────────────────────
const ticket = new Map(); // `${sym}|${i}` -> { buy: Map(b->{k,n}), sell: Map }
for (const r of db.prepare(`
  SELECT trade_date d, symbol s, buyer_broker b, SUM(kitta) k, COUNT(*) n
  FROM floorsheet_contracts WHERE COALESCE(is_quarantined,0)=0 GROUP BY trade_date, symbol, buyer_broker
`).iterate()) {
  const i = dIdx.get(r.d); if (i === undefined) continue;
  const key = `${String(r.s).toUpperCase()}|${i}`;
  if (!ticket.has(key)) ticket.set(key, { buy: new Map(), sell: new Map() });
  ticket.get(key).buy.set(Number(r.b), { k: Number(r.k), n: Number(r.n) });
}
for (const r of db.prepare(`
  SELECT trade_date d, symbol s, seller_broker b, SUM(kitta) k, COUNT(*) n
  FROM floorsheet_contracts WHERE COALESCE(is_quarantined,0)=0 GROUP BY trade_date, symbol, seller_broker
`).iterate()) {
  const i = dIdx.get(r.d); if (i === undefined) continue;
  const key = `${String(r.s).toUpperCase()}|${i}`;
  if (!ticket.has(key)) ticket.set(key, { buy: new Map(), sell: new Map() });
  ticket.get(key).sell.set(Number(r.b), { k: Number(r.k), n: Number(r.n) });
}

// ───────────────────────── 6. WALK-FORWARD BROKER PERSONA ─────────────────────────
const personaRows = db.prepare(`
  SELECT lead_broker_id b, signal_date sd, exit_date ed, net_return_pct r
  FROM algorithmic_signal_ledger WHERE exit_date IS NOT NULL AND net_return_pct IS NOT NULL
`).all().map(r => ({ b: Number(r.b), ed: r.ed, r: Number(r.r) }));
function walkForwardPersona(brokerId, signalDate) {
  const prior = personaRows.filter(x => x.b === brokerId && x.ed < signalDate);
  if (prior.length < 3) return { known: false, winRate: null, n: prior.length };
  const w = prior.filter(x => x.r > 0).length;
  return { known: true, winRate: (w / prior.length) * 100, n: prior.length };
}
const STATIC_ALLOW = new Set([94, 45, 57, 75, 84, 35, 62, 44]);
const STATIC_VETO = new Set([48, 77, 56]);

// ───────────────────────── 7. INDICATORS & CONTEXT ─────────────────────────
const pctRank = (arr, v) => (arr.filter(x => x <= v).length / arr.length) * 100;

function buildCtx(sym, i) {
  const H = hist.get(sym); const p = pos.get(sym)?.get(i);
  if (p === undefined || p < 30) return null;
  // broker coverage: >= 8 of the last 10 sessions must have exchange broker data, incl. today
  let cov = 0; for (let j = i - 9; j <= i; j++) if (brokerDateSet.has(j)) cov++;
  if (cov < 8 || !brokerByKey.has(`${sym}|${i}`)) return null;

  const b = H[p], prev = H[p - 1];
  const fund = fundamentals.get(sym) || {};
  const pChange = (b.c / prev.c - 1) * 100;
  const vwapDay = b.v > 0 ? b.t / b.v : b.c;

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
  const mkt20 = (marketLevel[i] / marketLevel[Math.max(0, i - 20)] - 1) * 100;
  const sec = fund.sector;
  const sectorAboveEma = sec && sectorLevel.has(sec) ? sectorLevel.get(sec)[i] > sectorEma.get(sec)[i] : null;

  // Broker windows
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
  const asym = bcr3Buy / Math.max(bcr3Sell, 15);
  const lead = buyers10[0];
  let persistence = 0;
  for (let j = i - 4; j <= i; j++) {
    const r = (brokerByKey.get(`${sym}|${j}`) || []).find(x => x.b === lead?.b);
    if (r && r.buy - r.sell > 0) persistence++;
  }
  const top3Cross = top3.reduce((s, x) => s + x.cross, 0);
  const crossShare = top3Buy > 0 ? top3Cross / top3Buy : 0;
  let top3DayNet = 0;
  for (const id of top3Ids) { const x = w1.m.get(id); if (x) top3DayNet += x.buy - x.sell; }

  // Ticket inversion (floorsheet; only 2026-09-18 onward)
  let ticketRatio = null;
  const tk = ticket.get(`${sym}|${i}`);
  if (tk) {
    const sellTop3 = new Set(sellers10.slice(0, 3).map(x => x.b));
    let bk = 0, bn = 0, sk = 0, sn = 0;
    for (const [id, x] of tk.buy) if (top3Ids.has(id)) { bk += x.k; bn += x.n; }
    for (const [id, x] of tk.sell) if (sellTop3.has(id)) { sk += x.k; sn += x.n; }
    if (bn > 0 && sn > 0) ticketRatio = (bk / bn) / (sk / sn);
  }

  // QAI (re-implementation of calculateQuietAccumulationIndex on signal-day flow)
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
  else if (pChange > 2.5 && pChange <= 4) pt = 10; else if (pChange > 4) pt = 3; else if (pChange < -2) pt = 5;
  if (b.c <= vwapDay * 1.01 && b.c >= vwapDay * 0.98) pt = Math.min(25, pt + 3);
  let as = 10;
  if (d1Bcr3B >= 45 && d1Bcr3S <= 25) as = 30; else if (d1Bcr3B >= 38 && qaiRatio >= 1.5) as = 24;
  else if (d1Bcr3B >= 34 && qaiRatio >= 1.2) as = 18; else if (d1Bcr3S >= 40 && d1Bcr3S > d1Bcr3B) as = 2;
  let na = 10;
  if (d1Abs >= 0.85 && d1Bcr3B >= 35) na = 25; else if (d1Abs >= 0.70 && d1Bcr3B >= 30) na = 20;
  else if (d1Abs >= 0.50) na = 12; else if (d1Abs < 0.35) na = 3;
  const floatAbsPct = fund.floatKitta ? (b.v / fund.floatKitta) * 100 : 0;
  let fi = 6;
  if (floatAbsPct >= 0.8) fi = 20; else if (floatAbsPct >= 0.45) fi = 16; else if (floatAbsPct >= 0.25) fi = 12; else if (floatAbsPct >= 0.12) fi = 8;
  const nearUC = b.c >= prev.c * 1.15 * 0.985;
  let qai = pt + as + na + fi; if (nearUC) qai = Math.min(qai, 35);
  qai = Math.max(5, Math.min(99, Math.round(qai)));

  const floatCornerPct = fund.floatKitta ? (top3Net10 / fund.floatKitta) * 100 : null;
  const vdu1 = (() => { const a = H.slice(p - 20, p).reduce((s, x) => s + x.v, 0) / 20; return a > 0 ? b.v / a : 9; })();
  const leadVwap = lead && lead.buy > 0 ? lead.buyAmt / lead.buy : b.c;
  const leadVwapDiff = ((b.c - leadVwap) / leadVwap) * 100;
  const persona = lead ? walkForwardPersona(lead.b, dates[i]) : { known: false };

  let promoterSoon = false;
  if (fund.promoterUnlock) {
    const days = (new Date(fund.promoterUnlock) - new Date(dates[i])) / 86400000;
    promoterSoon = days >= 0 && days <= 65; // ≈45 NEPSE sessions
  }

  return {
    sym, i, date: dates[i], b, prev, pChange, vwapDay, bbw, spread10, nrRatio, vdu, cmf, obvSpread,
    ret5, ret20, mkt20, sectorAboveEma, sector: sec, bcr3Buy, bcr5Buy, bcr3Sell, ret10, ret5w, asym,
    leadId: lead?.b ?? null, persistence, crossShare, top3DayNet, ticketRatio, qai, floatCornerPct,
    persona, promoterSoon, nearUC, bookValue: fund.bookValue, vol5, vdu1, leadVwapDiff
  };
}

// ───────────────────────── 8. FACTOR DEFINITIONS ─────────────────────────
const FACTORS = [
  { id: 1, layer: 0, name: 'Upper-circuit ceiling guard', fn: x => !x.nearUC },
  { id: 2, layer: 0, name: 'Pump-dump veto (proxy: 5D<12%, 20D<25%)', fn: x => x.ret5 < 12 && x.ret20 < 25, proxy: true },
  { id: 3, layer: 0, name: 'Wash-churn veto (top3 cross_vol ≤30%)', fn: x => x.crossShare <= 0.30, proxy: true },
  { id: 4, layer: 0, name: 'Operator offloading veto (top3 day net ≥0)', fn: x => x.top3DayNet >= 0, proxy: true },
  { id: 5, layer: 0, name: 'Seller dominance (BCR3s<35 & BCR3b>BCR3s)', fn: x => x.bcr3Sell < 35 && x.bcr3Buy > x.bcr3Sell },
  { id: 6, layer: 0, name: 'Ticket inversion (ratio >0.70; N/A passes)', fn: x => x.ticketRatio === null || x.ticketRatio > 0.70 },
  { id: 7, layer: 0, name: 'Promoter unlock within 45 sessions', fn: x => !x.promoterSoon, lowCoverage: true },
  { id: 8, layer: 0, name: 'Solvency / penny / instrument veto', fn: x => x.b.c >= 50 && (x.bookValue == null || x.bookValue > 50) },
  { id: 9, layer: 1, name: '1D change −1.2% … +2.0%', fn: x => x.pChange >= -1.2 && x.pChange <= 2.0 },
  { id: 10, layer: 1, name: 'Intraday VWAP anchor 0.98–1.01', fn: x => x.b.c / x.vwapDay >= 0.98 && x.b.c / x.vwapDay <= 1.01 },
  { id: 11, layer: 1, name: 'BBW ≤14% & 10D spread ≤6.5%', fn: x => x.bbw <= 14 && x.spread10 <= 6.5 },
  { id: 12, layer: 1, name: 'Narrow-range bar (range/ATR10 ≤0.70)', fn: x => x.nrRatio <= 0.70 },
  { id: 13, layer: 2, name: 'BCR3 buy ≥40% (or BCR5 ≥50%)', fn: x => x.bcr3Buy >= 40 || x.bcr5Buy >= 50 },
  { id: 14, layer: 2, name: 'Net retention 10D ≥70% & 5D ≥75%', fn: x => x.ret10 >= 0.70 && x.ret5w >= 0.75 },
  { id: 15, layer: 2, name: 'Asymmetry ratio ≥1.35x', fn: x => x.asym >= 1.35 },
  { id: 16, layer: 2, name: 'Lead broker net-buy ≥2 of last 5 sessions', fn: x => x.persistence >= 2 },
  { id: 17, layer: 2, name: 'Lead broker persona (static allow-list)', fn: x => STATIC_ALLOW.has(x.leadId), biased: true },
  { id: 18, layer: 2, name: 'Float cornering ≥0.40% of public float', fn: x => x.floatCornerPct !== null && x.floatCornerPct >= 0.40, proxy: true },
  { id: 19, layer: 3, name: 'VDU (5D/20D) ≤0.60 OR QAI ≥68', fn: x => x.vdu <= 0.60 || x.qai >= 68 },
  { id: 20, layer: 3, name: 'CMF(20) ≥ +0.08', fn: x => x.cmf >= 0.08 },
  { id: 21, layer: 3, name: 'Leading OBV spread ≥35 pts', fn: x => x.obvSpread >= 35 },
  { id: 22, layer: 4, name: 'Sector > EMA20 OR RS vs market ≥ +2%', fn: x => x.sectorAboveEma === true || (x.ret20 - x.mkt20) >= 2.0, proxy: true },
  { id: 23, layer: 4, name: 'Liquidity: turnover ≥25L & 5D vol ≥8,000', fn: x => x.b.t >= 2500000 && x.vol5 >= 8000 }
];
const PERSONA_WF = { id: '17-WF', name: 'Lead broker persona (walk-forward, ≥3 prior closed signals, ≥50% WR)', fn: x => !STATIC_VETO.has(x.leadId) && (!x.persona.known || x.persona.winRate >= 50) };

// ───────────────────────── 9. EXECUTION ENGINE (Layer 5: factors 24–29) ─────────────────────────
const simCache = new Map();
function simulate(sym, i, opt = {}) {
  const { gapCap = 1.8, stopPct = 3.5, ratchetAt = 5.5, ratchetLock = 1.8, t1 = 8, t1Lock = 4.5, t2 = 15, partial = 0.5 } = opt;
  const key = `${sym}|${i}|${JSON.stringify(opt)}`;
  if (simCache.has(key)) return simCache.get(key);
  const H = hist.get(sym); const p = pos.get(sym).get(i);
  const signal = H[p]; const entryBar = H[p + 1];
  let res;
  if (!entryBar || entryBar.i !== i + 1) res = { skipped: 'NO_NEXT_SESSION' };
  else if (entryBar.o > signal.c * (1 + gapCap / 100)) res = { skipped: 'PREOPEN_GAP_CAP' };
  else {
    const entry = entryBar.o;
    const qty = Math.max(10, Math.floor(CAPITAL_PER_TRADE / entry));
    let stop = entry * (1 - stopPct / 100), pendingStop = stop;
    let armed = false, t1Hit = false, remaining = 1.0, peak = entry, trough = entry;
    const fills = []; let reason = null, lastBar = entryBar, held = 0;
    const fwd = H.slice(p + 1, p + 1 + HOLD_MAX);
    for (let k = 0; k < fwd.length && remaining > 0; k++) {
      const bar = fwd[k]; lastBar = bar; held = k + 1;
      stop = pendingStop;
      if (k >= 2) {
        if (bar.o <= stop) { fills.push({ px: bar.o, w: remaining, k }); remaining = 0; reason = armed || t1Hit ? 'RATCHET_STOP' : 'STOP_LOSS'; break; }
        if (bar.l <= stop) { fills.push({ px: stop, w: remaining, k }); remaining = 0; reason = armed || t1Hit ? 'RATCHET_STOP' : 'STOP_LOSS'; break; }
        if (!t1Hit && bar.h >= entry * (1 + t1 / 100)) {
          const px = Math.max(bar.o, entry * (1 + t1 / 100));
          fills.push({ px, w: partial, k }); remaining -= partial; t1Hit = true;
          pendingStop = Math.max(pendingStop, entry * (1 + t1Lock / 100));
        }
        if (remaining > 0 && bar.h >= entry * (1 + t2 / 100)) {
          const px = Math.max(bar.o, entry * (1 + t2 / 100));
          fills.push({ px, w: remaining, k }); remaining = 0; reason = 'TARGET_2'; break;
        }
      }
      peak = Math.max(peak, bar.h); trough = Math.min(trough, bar.l);
      if (!armed && bar.h >= entry * (1 + ratchetAt / 100)) { armed = true; pendingStop = Math.max(pendingStop, entry * (1 + ratchetLock / 100)); }
      if (!t1Hit && k < 2 && bar.h >= entry * (1 + t1 / 100)) pendingStop = Math.max(pendingStop, entry * (1 + ratchetLock / 100));
    }
    let truncated = false;
    if (remaining > 0) {
      fills.push({ px: lastBar.c, w: remaining, k: held - 1 });
      truncated = fwd.length < HOLD_MAX;
      reason = truncated ? 'OPEN_AT_DATA_END' : (t1Hit ? 'T1_PARTIAL+TIME' : 'TIME_EXIT');
    } else if (t1Hit && reason !== 'TARGET_2') reason = 'T1_PARTIAL+' + reason;
    let netNpr = 0;
    for (const f of fills) {
      const q = Math.max(1, Math.round(qty * f.w));
      netNpr += calculateRoundTripNetReturn({ buyPrice: entry, sellPrice: f.px, quantity: q, holdingDays: f.k + 1 }).netProfitNpr;
    }
    const netPct = (netNpr / (entry * qty)) * 100;
    res = {
      sym, signalDate: dates[i], entryDate: dates[entryBar.i], entry: +entry.toFixed(2),
      exitDate: dates[lastBar.i], exitPx: +fills[fills.length - 1].px.toFixed(2), held, reason, truncated,
      netPct: +netPct.toFixed(2), mfePct: +(((peak - entry) / entry) * 100).toFixed(2), maePct: +(((trough - entry) / entry) * 100).toFixed(2)
    };
  }
  simCache.set(key, res);
  return res;
}

// ───────────────────────── 10. SCAN ─────────────────────────
const ctxs = [];
const signalDates = brokerDates.filter(i => i >= 9);
for (const i of signalDates) {
  for (const sym of hist.keys()) {
    if (isExcludedInstrument(sym)) continue;
    const x = buildCtx(sym, i);
    if (x) ctxs.push(x);
  }
}

function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const ph = k / n, d = 1 + z * z / n, c = ph + z * z / (2 * n), m = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n));
  return [+((c - m) / d * 100).toFixed(1), +((c + m) / d * 100).toFixed(1)];
}

// One position per symbol at a time (no overlapping trades)
function runSelection(passFn, simOpt = {}) {
  const sorted = ctxs.filter(passFn).sort((a, c) => a.i - c.i);
  const busyUntil = new Map(); const trades = []; let skippedGap = 0, skippedNoNext = 0, signals = 0;
  for (const x of sorted) {
    if ((busyUntil.get(x.sym) ?? -1) >= x.i) continue;
    signals++;
    const t = simulate(x.sym, x.i, simOpt);
    if (t.skipped) { if (t.skipped === 'PREOPEN_GAP_CAP') skippedGap++; else skippedNoNext++; continue; }
    trades.push({ ...t, ctx: x });
    busyUntil.set(x.sym, dIdx.get(t.exitDate));
  }
  return summarize(trades, { signals, skippedGap, skippedNoNext });
}
function summarize(trades, extra = {}) {
  const closed = trades.filter(t => !t.truncated);
  const stat = (arr) => {
    const w = arr.filter(t => t.netPct > 0), l = arr.filter(t => t.netPct <= 0);
    const g = w.reduce((s, t) => s + t.netPct, 0), ls = Math.abs(l.reduce((s, t) => s + t.netPct, 0));
    return {
      n: arr.length, wins: w.length,
      winRate: arr.length ? +((w.length / arr.length) * 100).toFixed(1) : 0,
      ci95: wilson(w.length, arr.length),
      profitFactor: ls > 0 ? +(g / ls).toFixed(2) : (g > 0 ? Infinity : 0),
      expectancy: arr.length ? +(arr.reduce((s, t) => s + t.netPct, 0) / arr.length).toFixed(2) : 0
    };
  };
  return { ...extra, all: stat(trades), closedOnly: stat(closed), trades };
}

const ALL_REQUIRED = x => FACTORS.every(f => f.fn(x));
const fmt = (s) => `N=${String(s.n).padStart(3)} | WR ${String(s.winRate).padStart(5)}% (95% CI ${s.ci95[0]}–${s.ci95[1]}) | PF ${s.profitFactor} | Exp ${s.expectancy >= 0 ? '+' : ''}${s.expectancy}%`;

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(' UPGRADED 29-FACTOR STEALTH FLOWCHART — POINT-IN-TIME BACKTEST');
console.log('══════════════════════════════════════════════════════════════════════');
console.log(`Price history : ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} sessions)`);
console.log(`Broker ledger : ${dates[brokerDates[0]]} → ${dates[brokerDates[brokerDates.length - 1]]} (${brokerDates.length} sessions)`);
console.log(`Signal window : ${dates[signalDates[0]]} → ${dates[signalDates[signalDates.length - 1]]} | symbol-days evaluated: ${ctxs.length}`);
console.log(`Float data coverage: ${[...fundamentals.values()].filter(f => f.floatKitta).length} symbols | promoter-unlock dates: ${[...fundamentals.values()].filter(f => f.promoterUnlock).length}`);
console.log(`Ticket-ratio coverage among evaluated symbol-days: ${(ctxs.filter(x => x.ticketRatio !== null).length / ctxs.length * 100).toFixed(1)}%`);

// Funnel
console.log('\n── FUNNEL (cumulative, layer order) ──');
let pool = ctxs; const funnel = [];
for (const f of FACTORS) { pool = pool.filter(f.fn); funnel.push({ factor: f.id, name: f.name, remaining: pool.length }); console.log(`  F${String(f.id).padStart(2)} ${f.name.padEnd(48)} → ${pool.length}`); }

// Full strict
const full = runSelection(ALL_REQUIRED);
console.log('\n── FULL 29-FACTOR FLOWCHART (static persona list) ──');
console.log('  All trades   :', fmt(full.all));
console.log('  Closed only  :', fmt(full.closedOnly));
const fullWF = runSelection(x => FACTORS.filter(f => f.id !== 17).every(f => f.fn(x)) && PERSONA_WF.fn(x));
console.log('\n── FULL FLOWCHART with walk-forward persona (no look-ahead) ──');
console.log('  All trades   :', fmt(fullWF.all));
console.log('  Closed only  :', fmt(fullWF.closedOnly));

// Single-factor binding analysis: drop one factor at a time
console.log('\n── LEAVE-ONE-OUT (which factors bind / help) ──');
const loo = [];
for (const f of FACTORS) {
  const r = runSelection(x => FACTORS.every(g => g.id === f.id || g.fn(x)));
  loo.push({ dropped: f.id, name: f.name, ...r.all });
  console.log(`  drop F${String(f.id).padStart(2)} ${f.name.padEnd(48)} ${fmt(r.all)}`);
}

// Per-factor predictive lift inside a broad "quiet base" universe
console.log('\n── FACTOR LIFT inside base universe (F8+F23 eligible, F9 flat price, F1 not at circuit) ──');
const BASE = x => [1, 8, 9, 23].every(id => FACTORS.find(f => f.id === id).fn(x));
const base = runSelection(BASE);
console.log('  Base universe:', fmt(base.all));
const lift = [];
for (const f of [...FACTORS, PERSONA_WF]) {
  if ([1, 8, 9, 23].includes(f.id)) continue;
  const pass = base.trades.filter(t => f.fn(t.ctx)); const fail = base.trades.filter(t => !f.fn(t.ctx));
  const sp = summarize(pass).all, sf = summarize(fail).all;
  lift.push({ id: f.id, name: f.name, pass: sp, fail: sf, liftPts: +(sp.winRate - sf.winRate).toFixed(1), expLift: +(sp.expectancy - sf.expectancy).toFixed(2) });
  console.log(`  F${String(f.id).padEnd(5)} ${f.name.padEnd(55)} pass N=${String(sp.n).padStart(4)} WR ${String(sp.winRate).padStart(5)}% Exp ${String(sp.expectancy).padStart(6)}% | fail N=${String(sf.n).padStart(4)} WR ${String(sf.winRate).padStart(5)}% Exp ${String(sf.expectancy).padStart(6)}% | lift ${lift[lift.length - 1].liftPts >= 0 ? '+' : ''}${lift[lift.length - 1].liftPts} pts`);
}

// Exit-rule sensitivity on the "present flow" core (to check whether the 85.7% claim survives honest fills)
console.log('\n── EXIT-RULE SENSITIVITY (core = F1,F5,F8,F9,F11,F13,F14,F20,F23 + VDU≤0.60) ──');
const CORE = x => [1, 5, 8, 9, 11, 13, 14, 20, 23].every(id => FACTORS.find(f => f.id === id).fn(x)) && x.vdu <= 0.60;
const exitVariants = [
  { label: 'No ratchet, T1 +8% full exit', opt: { ratchetAt: 999, partial: 1.0 } },
  { label: 'Ratchet at +8% → +2.5%', opt: { ratchetAt: 8, ratchetLock: 2.5, partial: 1.0 } },
  { label: 'Flowchart: ratchet +5.5%→+1.8%, T1 50% + lock 4.5%', opt: {} },
  { label: 'Flowchart without pre-open gap cap', opt: { gapCap: 99 } }
];
const exitRes = [];
for (const v of exitVariants) { const r = runSelection(CORE, v.opt); exitRes.push({ label: v.label, ...r.all }); console.log(`  ${v.label.padEnd(52)} ${fmt(r.all)}`); }

// ── Funnel with F18 treated as "not measurable → pass" (only 5 symbols have float data)
console.log('\n── FUNNEL with F18 skipped (data unavailable) ──');
let pool2 = ctxs; const funnel2 = [];
for (const f of FACTORS) { if (f.id === 18) continue; pool2 = pool2.filter(f.fn); funnel2.push({ factor: f.id, remaining: pool2.length }); console.log(`  F${String(f.id).padStart(2)} ${f.name.padEnd(48)} → ${pool2.length}`); }
const noF18 = runSelection(x => FACTORS.every(f => f.id === 18 || f.fn(x)));
console.log('  Full flowchart minus F18:', fmt(noF18.all));

// ── Reproduce the earlier "present flow" (7-trade, 71.4%) definition under honest fills
const PRESENT = x => x.b.t >= 2500000 && x.b.v >= 8000 && x.b.c >= 50 && x.pChange >= -1.2 && x.pChange <= 2.0 &&
  x.spread10 <= 6.5 && x.bbw <= 14 && x.vdu1 <= 0.60 && x.cmf >= 0.08 && x.bcr3Buy >= 40 && x.ret10 >= 0.70 &&
  !(x.bcr3Sell >= 35 && x.bcr3Sell > x.bcr3Buy) && Math.abs(x.leadVwapDiff) <= 2.5;
console.log('\n── EARLIER "PRESENT FLOW" DEFINITION re-run with honest fills ──');
const presentVariants = [
  { label: 'Old exits (no ratchet, T1 full) + honest fills', opt: { ratchetAt: 8, ratchetLock: 2.5, partial: 1.0, t1: 999, gapCap: 99 } },
  { label: 'Upgraded exits (+5.5% ratchet, T1 50%, gap cap)', opt: {} }
];
const presentRes = [];
for (const v of presentVariants) { const r = runSelection(PRESENT, v.opt); presentRes.push({ label: v.label, ...r.all, trades: r.trades.map(({ ctx, ...t }) => t) }); console.log(`  ${v.label.padEnd(52)} ${fmt(r.all)}`); }

// ── Evidence-based candidate built ONLY from factors with positive lift, validated on a time split
const midDate = '2026-10-05';
const EVIDENCE = x => [1, 3, 4, 6, 8, 23].every(id => FACTORS.find(f => f.id === id).fn(x)) &&   // gate
  [9, 11, 12].every(id => FACTORS.find(f => f.id === id).fn(x)) &&                                   // squeeze
  [13, 14].every(id => FACTORS.find(f => f.id === id).fn(x));                                        // flow
const EVIDENCE_OBV = x => EVIDENCE(x) && (x.obvSpread >= 35 || x.vdu <= 0.60 || x.qai >= 68);
console.log('\n── EVIDENCE-BASED CANDIDATE (positive-lift factors only) with time split ──');
const evRes = [];
for (const [label, fn] of [['Evidence core (gate+squeeze+BCR3+retention)', EVIDENCE], ['Evidence core + (OBV lead OR VDU OR QAI)', EVIDENCE_OBV]]) {
  for (const [part, pf] of [['ALL', () => true], [`IN-SAMPLE ≤${midDate}`, x => x.date <= midDate], [`OUT-OF-SAMPLE >${midDate}`, x => x.date > midDate]]) {
    const r = runSelection(x => fn(x) && pf(x));
    evRes.push({ label, part, ...r.all, trades: part === 'ALL' ? r.trades.map(({ ctx, ...t }) => ({ ...t, leadId: ctx.leadId })) : undefined });
    console.log(`  ${label.padEnd(44)} ${part.padEnd(24)} ${fmt(r.all)}`);
  }
}
// Base-rate split for context
for (const [part, pf] of [[`BASE ≤${midDate}`, x => x.date <= midDate], [`BASE >${midDate}`, x => x.date > midDate]]) {
  const r = runSelection(x => BASE(x) && pf(x)); evRes.push({ label: 'Base universe', part, ...r.all });
  console.log(`  ${'Base universe (context)'.padEnd(44)} ${part.padEnd(24)} ${fmt(r.all)}`);
}
globalThis.__extra = { funnel2, noF18: noF18.all, presentRes, evRes };

// Trade lists
const printTrades = (title, trades) => {
  console.log(`\n── ${title} ──`);
  for (const t of trades) {
    console.log(`  ${t.signalDate} ${t.sym.padEnd(7)} entry ${t.entry} → ${t.exitPx} (${t.exitDate}, ${t.held}d) net ${t.netPct >= 0 ? '+' : ''}${t.netPct}% MFE ${t.mfePct}% MAE ${t.maePct}% ${t.reason}${t.truncated ? ' [OPEN]' : ''} | lead #${t.ctx.leadId} BCR3 ${t.ctx.bcr3Buy.toFixed(1)}% ret ${(t.ctx.ret10 * 100).toFixed(0)}% CMF ${t.ctx.cmf.toFixed(2)} VDU ${t.ctx.vdu.toFixed(2)} QAI ${t.ctx.qai}`);
  }
};
printTrades('FULL FLOWCHART TRADES', full.trades);
printTrades('FULL FLOWCHART (walk-forward persona) TRADES', fullWF.trades);
printTrades('CORE FLOW TRADES (flowchart exits)', runSelection(CORE).trades);

if (OUT_JSON) {
  const strip = (r) => ({ ...r, trades: r.trades.map(({ ctx, ...t }) => ({ ...t, leadId: ctx.leadId, bcr3Buy: +ctx.bcr3Buy.toFixed(1), ret10: +(ctx.ret10 * 100).toFixed(0), cmf: +ctx.cmf.toFixed(3), vdu: +ctx.vdu.toFixed(2), qai: ctx.qai })) });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ funnel, full: strip(full), fullWF: strip(fullWF), loo, base: { ...base.all }, lift, exitRes, core: strip(runSelection(CORE)), ...globalThis.__extra }, null, 2));
  console.log(`\nSaved JSON → ${OUT_JSON}`);
}
