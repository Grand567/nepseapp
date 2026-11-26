// tests/flowchartV3Engine.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  isNonEquityTicker,
  isInPromoterLockinCliff,
  computeMultiWindowGrossAndNetMetrics,
  evaluateFlowchartV3Candidate,
  scanFlowchartV3SwingCandidates,
} from '../proxy/utils/flowchartV3Engine.mjs';
import { auditMultiSessionTrapRisk } from '../proxy/telegramNotifier.mjs';
import { evaluateTrackB2to3DayIgnition } from '../proxy/trackBSyndicateEngine.mjs';
import radarRouter from '../proxy/routes/radarRoutes.js';

function buildFlowchartV3MockDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE daily_stock_summary (
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      open_price REAL,
      high_price REAL,
      low_price REAL,
      close_price REAL,
      total_volume INTEGER DEFAULT 0,
      total_turnover REAL DEFAULT 0,
      PRIMARY KEY (trade_date, symbol)
    );
    CREATE TABLE daily_broker_ledger (
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      broker_id INTEGER NOT NULL,
      buy_vol INTEGER DEFAULT 0,
      sell_vol INTEGER DEFAULT 0,
      buy_amt REAL DEFAULT 0,
      sell_amt REAL DEFAULT 0,
      PRIMARY KEY (trade_date, symbol, broker_id)
    );
    CREATE TABLE scrip_fundamentals (
      symbol TEXT PRIMARY KEY,
      sector TEXT,
      paid_up_capital REAL,
      public_float_kitta INTEGER,
      promoter_share_pct REAL,
      public_share_pct REAL,
      eps_ttm REAL,
      book_value_per_share REAL,
      promoter_unlock_date TEXT
    );
    CREATE TABLE floorsheet_contracts (
      contract_no TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      buyer_broker INTEGER NOT NULL,
      seller_broker INTEGER NOT NULL,
      kitta INTEGER NOT NULL,
      rate REAL NOT NULL,
      amount REAL NOT NULL
    );
  `);

  const dates = [
    '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03',
    '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10',
    '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17',
    '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'
  ];

  const insFund = db.prepare(`
    INSERT INTO scrip_fundamentals (symbol, sector, paid_up_capital, public_float_kitta, promoter_share_pct, public_share_pct, eps_ttm, book_value_per_share, promoter_unlock_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. FLOORWIN: Sub-500 Hydro Floor-Turn winner (EPS > 0, no lockin, RSI 48-55, VDU <= 0.65, dual-window hoarding, near 15D VWAP)
  insFund.run('FLOORWIN', 'Hydro Power', 1000000000, 4000000, 60, 40, 12.5, 132.0, null);
  // 2. WASHTRAP: AKJCL-style trap where Top-2 gross buyers churn (< 25% ret) while #3 net buyer holds 100%
  insFund.run('WASHTRAP', 'Hydro Power', 1200000000, 5000000, 58, 42, 6.2, 110.0, null);
  // 3. LOCKCLIFF: Good metrics on surface BUT promoter unlock expires 2026-11-26 (+2 days from 2026-11-24!)
  insFund.run('LOCKCLIFF', 'Hydro Power', 700000000, 2000000, 70, 30, 11.0, 118.0, '2026-11-26');
  // 4. OVERBOUGHT: RSI > 72 & extended > +8% above 15D VWAP
  insFund.run('OVERBOUGHT', 'Development Banks', 900000000, 3500000, 55, 45, 18.0, 145.0, null);

  const insPrice = db.prepare(`
    INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insBroker = db.prepare(`
    INSERT INTO daily_broker_ledger (trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  dates.forEach((d, i) => {
    // FLOORWIN: flat base around 330 with clean candles (no upper-wick rejection), VDU on days 15..18, green turn on day 19
    let fwClose = i < 15 ? (338 - (i % 3) * 2) : (i < 19 ? 330 : 335);
    let fwOpen = i === 19 ? 330 : fwClose - 1;
    let fwHigh = i === 19 ? 336 : fwClose + 0.3;
    let fwLow = i === 19 ? 329.5 : fwClose - 1.7;
    let fwVol = i >= 15 && i <= 18 ? 22000 : (i === 19 ? 85000 : 70000);
    insPrice.run(d, 'FLOORWIN', fwOpen, fwHigh, fwLow, fwClose, fwVol, fwVol * fwClose);

    // WASHTRAP: similar price/vol but Broker 58 buys 30k & sells 27k daily
    insPrice.run(d, 'WASHTRAP', 330, 336, 329, fwClose, fwVol, fwVol * fwClose);

    // LOCKCLIFF: identical clean price/vol to FLOORWIN
    insPrice.run(d, 'LOCKCLIFF', fwOpen, fwHigh, fwLow, fwClose, fwVol, fwVol * fwClose);

    // OVERBOUGHT: strong vertical rally from 320 -> 415 (+30%)
    const obClose = 320 + i * 5;
    insPrice.run(d, 'OVERBOUGHT', obClose - 2, obClose + 0.4, obClose - 3, obClose, 90000, 90000 * obClose);

    // Broker flows over all dates
    // FLOORWIN & LOCKCLIFF: Brokers #33 and #50 steadily hoard (80%+ retention), fragmented sellers
    for (const sym of ['FLOORWIN', 'LOCKCLIFF']) {
      insBroker.run(d, sym, 33, 24000, 2000, 24000 * 331, 2000 * 331);
      insBroker.run(d, sym, 50, 18000, 1500, 18000 * 331, 1500 * 331);
      insBroker.run(d, sym, 12, 3000, 16000, 3000 * 331, 16000 * 331);
      insBroker.run(d, sym, 14, 2000, 13000, 2000 * 331, 13000 * 331);
      insBroker.run(d, sym, 19, 2000, 16000, 2000 * 331, 16000 * 331);
    }

    // WASHTRAP: Top 2 GROSS buyers churn heavily (#58: 10% ret, #44: 20% ret), #75 quietly buys 5k net (100% ret -> traps net-only screeners!)
    insBroker.run(d, 'WASHTRAP', 58, 30000, 27000, 30000 * 331, 27000 * 331);
    insBroker.run(d, 'WASHTRAP', 44, 25000, 20000, 25000 * 331, 20000 * 331);
    insBroker.run(d, 'WASHTRAP', 75, 5000, 0, 5000 * 331, 0);
    insBroker.run(d, 'WASHTRAP', 22, 1000, 14000, 1000 * 331, 14000 * 331);

    // OVERBOUGHT: Clean institutional hoarding, but extended > +8% above 15D VWAP & RSI > 70
    insBroker.run(d, 'OVERBOUGHT', 33, 55000, 2000, 55000 * obClose, 2000 * obClose);
    insBroker.run(d, 'OVERBOUGHT', 50, 35000, 1500, 35000 * obClose, 1500 * obClose);
    insBroker.run(d, 'OVERBOUGHT', 12, 0, 45000, 0, 45000 * obClose);
    insBroker.run(d, 'OVERBOUGHT', 14, 0, 41500, 0, 41500 * obClose);
  });

  return db;
}

describe('Flowchart v3.0 6-Gate Swing Engine', () => {
  it('1. isInPromoterLockinCliff flags stocks within [-30d, +45d] of unlock expiry from DB or registry', () => {
    const resNearFuture = isInPromoterLockinCliff('TESTSYM', {
      asOfDate: '2026-11-25',
      unlockDate: '2026-12-10', // +15 days
    });
    assert.equal(resNearFuture.isCliff, true);

    const resRecentPast = isInPromoterLockinCliff('TESTSYM', {
      asOfDate: '2026-11-25',
      unlockDate: '2026-11-10', // -15 days
    });
    assert.equal(resRecentPast.isCliff, true);

    const resFar = isInPromoterLockinCliff('TESTSYM', {
      asOfDate: '2026-11-25',
      unlockDate: '2027-04-01', // +127 days
    });
    assert.equal(resFar.isCliff, false);
  });

  it('2. computeMultiWindowGrossAndNetMetrics exposes Gross-Mover retention alongside Net-Hoarder VWAP', () => {
    const db = buildFlowchartV3MockDb();
    const metrics = computeMultiWindowGrossAndNetMetrics('WASHTRAP', { db, targetDate: '2026-11-24' });
    assert.ok(metrics && metrics.w15, 'Should return 15D window metrics');
    // Top-2 gross buyers (#58 at 10%, #44 at 20%) must NOT be masked by #75 (100% net)!
    assert.ok(metrics.w15.minTop2GrossRetentionPct <= 21, `Expected minTop2 <= 21%, got ${metrics.w15.minTop2GrossRetentionPct}`);
    assert.ok(metrics.w15.grossTop3RetentionPct < 30, `Expected grossTop3 < 30%, got ${metrics.w15.grossTop3RetentionPct}`);
    db.close();
  });

  it('3. evaluateFlowchartV3Candidate rejects Net-Sort Wash Churn traps (WASHTRAP)', () => {
    const db = buildFlowchartV3MockDb();
    const res = evaluateFlowchartV3Candidate('WASHTRAP', { db, targetDate: '2026-11-24', maxPrice: 500 });
    assert.equal(res.qualified, false);
    assert.match(res.vetoCode || res.failReason, /WASH_CHURN|GROSS_MOVER/i);
    db.close();
  });

  it('4. evaluateFlowchartV3Candidate vetoes Promoter Lock-In Expiry Cliff (LOCKCLIFF)', () => {
    const db = buildFlowchartV3MockDb();
    const res = evaluateFlowchartV3Candidate('LOCKCLIFF', { db, targetDate: '2026-11-24', maxPrice: 500 });
    assert.equal(res.qualified, false);
    assert.match(res.vetoCode || res.failReason, /LOCKIN|UNLOCK|CLIFF/i);
    db.close();
  });

  it('5. evaluateFlowchartV3Candidate vetoes Overbought / Extended Chase setups (OVERBOUGHT)', () => {
    const db = buildFlowchartV3MockDb();
    const res = evaluateFlowchartV3Candidate('OVERBOUGHT', { db, targetDate: '2026-11-24', maxPrice: 500 });
    assert.equal(res.qualified, false);
    assert.match(res.vetoCode || res.failReason, /RSI|OVERBOUGHT|EXTENDED|VWAP/i);
    db.close();
  });

  it('6. evaluateFlowchartV3Candidate approves and scores sub-500 Floor-Turn winner (FLOORWIN) with valid R:R ticket', () => {
    const db = buildFlowchartV3MockDb();
    const res = evaluateFlowchartV3Candidate('FLOORWIN', { db, targetDate: '2026-11-24', maxPrice: 500 });
    assert.equal(res.qualified, true, `Expected FLOORWIN to qualify, got: ${res.failReason}`);
    assert.ok(res.score >= 78, `Expected v3 score >= 78, got ${res.score}`);
    assert.equal(res.mode, 'FLOWCHART_V3_FLOOR_TURN');
    assert.ok(res.entryLow > 0 && res.entryHigh >= res.entryLow);
    assert.ok(res.chaseCap > res.ltp && res.chaseCap <= res.ltp * 1.02);
    assert.ok(res.stopLoss < res.entryLow && res.target1 > res.ltp && res.target2 > res.target1);
    assert.ok(res.riskRewardRatio >= 2.0, `Expected R:R >= 2.0, got ${res.riskRewardRatio}`);
    db.close();
  });

  it('7. scanFlowchartV3SwingCandidates ranks FLOORWIN #1 and logs vetoed traps cleanly', () => {
    const db = buildFlowchartV3MockDb();
    const scan = scanFlowchartV3SwingCandidates({ db, targetDate: '2026-11-24', maxPrice: 500 });
    assert.equal(scan.topPick?.symbol, 'FLOORWIN');
    assert.equal(scan.candidates.length, 1);
    assert.ok(scan.vetoed.some(v => v.symbol === 'WASHTRAP'));
    assert.ok(scan.vetoed.some(v => v.symbol === 'LOCKCLIFF'));
    db.close();
  });

  it('8. auditMultiSessionTrapRisk blocks 15D Gross-Mover wash churn & Promoter Lock-In Cliff', () => {
    const db = buildFlowchartV3MockDb();
    const trapWash = auditMultiSessionTrapRisk(db, 'WASHTRAP');
    assert.equal(trapWash.isTrap, true);
    assert.equal(trapWash.verdict, 'GROSS_MOVER_WASH_CHURN');

    const trapLock = auditMultiSessionTrapRisk(db, 'LOCKCLIFF');
    assert.equal(trapLock.isTrap, true);
    assert.equal(trapLock.verdict, 'PROMOTER_LOCKIN_CLIFF_VETO');

    const clean = auditMultiSessionTrapRisk(db, 'FLOORWIN');
    assert.equal(clean.isTrap, false);
    db.close();
  });

  it('9. trackBSyndicateEngine enforces live scrip_fundamentals schema and promoter lock-in veto', () => {
    const db = buildFlowchartV3MockDb();
    const resLock = evaluateTrackB2to3DayIgnition('LOCKCLIFF', { db, targetDate: '2026-11-24' });
    assert.equal(resLock.qualified, false);
    assert.match(resLock.failReason, /LOCKIN_CLIFF_VETO/i);
    db.close();
  });

  it('10. radarRoutes mounts /radar/flowchart-v3 and safely parses invalid query params', async () => {
    const layer = radarRouter.stack.find(
      (l) => l.route && Array.isArray(l.route.path) && l.route.path.includes('/radar/flowchart-v3')
    );
    assert.ok(layer, 'radarRoutes must expose /radar/flowchart-v3');
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    const req = { query: { maxPrice: 'abc', minTurnover: '-50' } };
    let statusCode = 200;
    let payload = null;
    const res = {
      headers: {},
      set(k, v) { this.headers[k] = v; },
      status(c) { statusCode = c; return this; },
      json(body) { payload = body; return this; },
    };
    await handler(req, res);
    assert.equal(statusCode, 200);
    assert.equal(payload?.success, true);
    assert.ok(Array.isArray(payload?.candidates));
  });

  it('11. isNonEquityTicker preserves NMBMF/SWMF microfinance equities while rejecting *P promoter shares and debentures', () => {
    assert.equal(isNonEquityTicker('NMBMF', 'Microfinance'), false);
    assert.equal(isNonEquityTicker('SWMF', 'Microfinance'), false);
    assert.equal(isNonEquityTicker('BPCL', 'Hydro Power'), false);
    assert.equal(isNonEquityTicker('NABILP', ''), true);
    assert.equal(isNonEquityTicker('HIDCLPO', ''), true);
    assert.equal(isNonEquityTicker('NICAD88', ''), true);
    assert.equal(isNonEquityTicker('SBCF', ''), true);
  });

  it('12. evaluateFlowchartV3Candidate liveOverlay on same settled date preserves OHLC and avoids RSI close duplication', () => {
    const db = buildFlowchartV3MockDb();
    const base = evaluateFlowchartV3Candidate('FLOORWIN', { db, targetDate: '2026-11-24', maxPrice: 500 });
    const overlaid = evaluateFlowchartV3Candidate('FLOORWIN', {
      db,
      targetDate: '2026-11-24',
      maxPrice: 500,
      liveOverlay: { ltp: 335, pChange: 1.52, turnover: 28475000, volume: 85000, date: '2026-11-24' },
    });
    assert.equal(overlaid.qualified, true);
    assert.equal(overlaid.rsi14, base.rsi14, 'Same-day overlay must not duplicate closing price in RSI');
    assert.equal(overlaid.clvPct, base.clvPct, 'Same-day overlay without high/low must preserve ledger high/low for CLV');

    const nextDay = evaluateFlowchartV3Candidate('FLOORWIN', {
      db,
      targetDate: '2026-11-24',
      maxPrice: 500,
      liveOverlay: { ltp: 339, prevClose: 335, high: 340, low: 334, turnover: 35000000, volume: 100000, date: '2026-11-25' },
    });
    assert.equal(nextDay.asOfDate, '2026-11-25');

    const liveMap = new Map([
      ['FLOORWIN', { ltp: 335, pChange: 1.52, turnover: 28475000, volume: 85000, date: '2026-11-24' }],
      ['WASHTRAP', { ltp: 335, pChange: 1.52, turnover: 28475000, volume: 85000, date: '2026-11-24' }],
      ['NABILP', { ltp: 300, pChange: 1.0, turnover: 20000000, volume: 50000, date: '2026-11-24' }],
    ]);
    const liveScan = scanFlowchartV3SwingCandidates({ db, targetDate: '2026-11-24', maxPrice: 500, livePricesMap: liveMap });
    assert.equal(liveScan.topPick?.symbol, 'FLOORWIN');
    assert.equal(liveScan.candidates.length, 1);

    const trapLower = auditMultiSessionTrapRisk(db, ' washtrap ');
    assert.equal(trapLower.isTrap, true);
    db.close();
  });
});
