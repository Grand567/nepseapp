// scripts/rank_latest_stocks_v2.mjs
import Database from 'better-sqlite3';
import path from 'path';
import { calculateStockCorneringScore } from '../src/utils/accumulationDistributionEngine.ts';

const db = new Database(path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db'), { readonly: true });

// 1. Get price summaries on 2026-11-06
const latestDate = '2026-11-06';
const prices = db.prepare(`
  SELECT symbol s, open_price o, high_price h, low_price l, close_price c,
         total_volume v, total_turnover t
  FROM daily_stock_summary
  WHERE trade_date = ? AND close_price > 0 AND COALESCE(is_quarantined, 0) = 0
`).all(latestDate);

// 2. Get prevClose from 2026-11-05
const prevPrices = db.prepare(`
  SELECT symbol s, close_price c
  FROM daily_stock_summary
  WHERE trade_date = '2026-11-05' AND close_price > 0
`).all();
const prevMap = new Map(prevPrices.map(r => [r.s.toUpperCase(), r.c]));

// 3. Get broker aggregation on 2026-11-06
const brokerRows = db.prepare(`
  SELECT symbol s, broker_id b, buy_vol bv, sell_vol sv, cross_vol cv
  FROM daily_broker_ledger
  WHERE trade_date = ? AND COALESCE(is_quarantined, 0) = 0
`).all(latestDate);

const brokerBySym = new Map();
for (const r of brokerRows) {
  const sym = r.s.toUpperCase();
  if (!brokerBySym.has(sym)) brokerBySym.set(sym, []);
  brokerBySym.get(sym).push({ b: r.b, buy: r.bv, sell: r.sv, cross: r.cv });
}

// 4. Fundamentals & Company names
const fundMap = new Map();
for (const f of db.prepare('SELECT symbol, sector, book_value_per_share FROM scrip_fundamentals').all()) {
  fundMap.set(f.symbol.toUpperCase(), {
    name: f.symbol,
    sector: f.sector || 'Others',
    bv: f.book_value_per_share
  });
}

// 5. Score every stock using calculateStockCorneringScore
const scored = [];
for (const p of prices) {
  const sym = p.s.toUpperCase();
  // Filter out non-equity / debentures
  if (sym.includes('DEB') || sym.endsWith('PO') || (sym.endsWith('P') && sym !== 'NADEP') || /\d+$/.test(sym)) continue;

  const f = fundMap.get(sym) || { name: sym, sector: 'Others' };
  const prevC = prevMap.get(sym) || p.c;
  const pChange = prevC > 0 ? ((p.c - prevC) / prevC) * 100 : 0;

  const bList = brokerBySym.get(sym) || [];
  const totBuy = bList.reduce((s, r) => s + r.buy, 0);
  const totSell = bList.reduce((s, r) => s + r.sell, 0);

  const sortedB = [...bList].sort((a, b) => b.buy - a.buy);
  const sortedS = [...bList].sort((a, b) => b.sell - a.sell);

  const top3Buy = sortedB.slice(0, 3).reduce((s, r) => s + r.buy, 0);
  const top3Sell = sortedS.slice(0, 3).reduce((s, r) => s + r.sell, 0);

  const bcr3Buy = totBuy > 0 ? (top3Buy / totBuy) * 100 : 0;
  const bcr3Sell = totSell > 0 ? (top3Sell / totSell) * 100 : 0;
  const netAbs = totBuy > 0 ? (top3Buy - top3Sell) / top3Buy : 0.5;

  const stockInput = {
    symbol: sym,
    name: f.name,
    sector: f.sector,
    ltp: p.c,
    previousClose: prevC,
    pChange,
    turnover: p.t,
    volume: p.v,
    bcr3Buy,
    bcr3Sell,
    brokerData: {
      bcr3BuyPct: bcr3Buy,
      bcr3SellPct: bcr3Sell,
      netAbsorptionRatio: Math.max(0, netAbs)
    },
    wyckoff: {
      cmf: 0.08,
      pumpDumpRiskScore: 15,
      tradeSizeRatio: 1.4,
      earlySignals: {
        volumeDryUp: { isVDU: true, isCoil: true, vduRatio: 0.52 },
        leadingOBV: { signal: 'BULLISH_LEAD' }
      }
    }
  };

  const cornering = calculateStockCorneringScore(stockInput);
  scored.push({
    symbol: sym,
    name: f.name,
    sector: f.sector,
    ltp: p.c,
    pChange: +pChange.toFixed(2),
    turnoverLakhs: +(p.t / 100000).toFixed(1),
    volume: p.v,
    bcr3Buy: +bcr3Buy.toFixed(1),
    bcr3Sell: +bcr3Sell.toFixed(1),
    leadBrokers: sortedB.slice(0, 3).map(b => b.b),
    ...cornering
  });
}

// Filter non-traps with high volume/turnover
const candidates = scored
  .filter(s => !s.isDisqualifiedTrap && s.turnoverLakhs >= 10 && s.ltp >= 50)
  .sort((a, b) => {
    if (b.corneringScore !== a.corneringScore) return b.corneringScore - a.corneringScore;
    return b.bcr3Buy - a.bcr3Buy;
  });

console.log(`Evaluated ${scored.length} scrips on ${latestDate}.`);
console.log(`Top 10 High-Ranked Candidates:`);
console.log(JSON.stringify(candidates.slice(0, 10), null, 2));
