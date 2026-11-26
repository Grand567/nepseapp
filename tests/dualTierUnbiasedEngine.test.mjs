// tests/dualTierUnbiasedEngine.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

import {
  evaluateUnbiasedMarketRegime,
  evaluateDualTierCandidate,
  scanDualTierCandidates,
  resolveCanonicalSector,
} from '../proxy/utils/dualTierEngine.mjs';
import { evaluateFlowchartV3Candidate } from '../proxy/utils/flowchartV3Engine.mjs';
import { getScripVolumeProfile, db as liveDb } from '../proxy/db/ledgerStore.js';
import radarRouter from '../proxy/routes/radarRoutes.js';

function createDualTierMockDb() {
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
      is_quarantined INTEGER DEFAULT 0,
      calendar_status TEXT DEFAULT 'VALID',
      source TEXT DEFAULT 'NEPSE_NOTS',
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
      is_quarantined INTEGER DEFAULT 0,
      calendar_status TEXT DEFAULT 'VALID',
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
  `);

  // 42 trading dates ending on 2026-11-24
  const dates = [];
  const start = new Date('2026-09-25T00:00:00Z');
  for (let i = 0; dates.length < 42; i++) {
    const dt = new Date(start.getTime() + i * 86400000);
    const dow = dt.getUTCDay();
    if (dow === 5 || dow === 6) continue;
    dates.push(dt.toISOString().slice(0, 10));
  }
  const latestDate = dates[dates.length - 1];

  const insFund = db.prepare(`
    INSERT INTO scrip_fundamentals (symbol, sector, paid_up_capital, public_float_kitta, promoter_share_pct, public_share_pct, eps_ttm, book_value_per_share, promoter_unlock_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insPrice = db.prepare(`
    INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover, is_quarantined, calendar_status, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insBroker = db.prepare(`
    INSERT INTO daily_broker_ledger (trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Helper to seed Break & Retest price action ending at latestDate:
  // Breakout 3 days ago above 10-day prior resistance, then calm retest on last day holding near resistance with RVOL control
  function seedBreakAndRetestBars(sym, basePrice, { rvolLast = 0.62, upperWickLast = false, threeRed = false } = {}) {
    dates.forEach((d, idx) => {
      const n = dates.length;
      let close = basePrice;
      let open = basePrice - 1;
      let high = basePrice + 1;
      let low = basePrice - 2;
      let vol = 50000;

      if (idx >= n - 15 && idx < n - 4) {
        // Prior 10-bar resistance ceiling at basePrice * 1.03
        close = basePrice * (1.0 + (idx % 2 === 0 ? 0.025 : 0.01));
        open = close - 1;
        high = basePrice * 1.03;
        low = close - 2;
        vol = 48000;
      } else if (idx === n - 4) {
        // High-volume breakout bar clearing 1.03 * basePrice
        open = basePrice * 1.02;
        close = basePrice * 1.055;
        high = close + 1;
        low = open - 1;
        vol = 120000; // > 1.15 * avgVol20
      } else if (idx === n - 3 || idx === n - 2) {
        close = basePrice * 1.045;
        open = close + (threeRed ? 2 : -1);
        high = close + 2;
        low = close - 2;
        vol = 35000;
      } else if (idx === n - 1) {
        // Retest pivot = priorRes = basePrice * 1.03; touch ~1.035 and hold above 1.03
        close = threeRed ? basePrice * 1.01 : basePrice * 1.038;
        open = threeRed ? basePrice * 1.04 : basePrice * 1.032;
        high = upperWickLast ? close + 18 : close + 1.5;
        low = basePrice * 1.028;
        vol = Math.round(50000 * rvolLast);
      }

      insPrice.run(d, sym, +open.toFixed(1), +high.toFixed(1), +low.toFixed(1), +close.toFixed(1), vol, Math.round(vol * close), 0, 'VALID', 'NEPSE_NOTS');
    });
  }

  function seedCleanSyndicate(sym, price, { bcr3High = true, rawGrossHigh = true, minTop2High = true } = {}) {
    dates.slice(-20).forEach((d) => {
      if (bcr3High && rawGrossHigh && minTop2High) {
        // Top-3 buyers absorb >80% of all buy volume, dispersed across 10 small sellers (bcr3Sell ~29%)
        insBroker.run(d, sym, 33, 18000, 1000, 18000 * price, 1000 * price);
        insBroker.run(d, sym, 50, 14000, 800, 14000 * price, 800 * price);
        insBroker.run(d, sym, 75, 9000, 500, 9000 * price, 500 * price);
        insBroker.run(d, sym, 11, 2000, 1000, 2000 * price, 1000 * price);
        insBroker.run(d, sym, 12, 2000, 1000, 2000 * price, 1000 * price);
        for (let b = 21; b <= 31; b++) {
          insBroker.run(d, sym, b, 200, 3800, 200 * price, 3800 * price);
        }
      } else if (bcr3High && (!rawGrossHigh || !minTop2High)) {
        // Heavy wash churn in Top 2 gross buyers
        insBroker.run(d, sym, 58, 30000, 28000, 30000 * price, 28000 * price);
        insBroker.run(d, sym, 44, 25000, 22000, 25000 * price, 22000 * price);
        insBroker.run(d, sym, 75, 6000, 0, 6000 * price, 0);
        for (let b = 21; b <= 28; b++) {
          insBroker.run(d, sym, b, 500, 2000, 500 * price, 2000 * price);
        }
      } else {
        // Balanced Tier-2 style: Top-3 gross buyers (#33, #50, #75) absorb ~40.5% of total 74k buys cleanly
        insBroker.run(d, sym, 33, 11000, 1000, 11000 * price, 1000 * price);
        insBroker.run(d, sym, 50, 10000, 2000, 10000 * price, 2000 * price);
        insBroker.run(d, sym, 75, 9000, 4000, 9000 * price, 4000 * price);
        for (let b = 11; b <= 17; b++) {
          insBroker.run(d, sym, b, 6285, 6285, 6285 * price, 6285 * price);
        }
        for (let b = 21; b <= 25; b++) {
          insBroker.run(d, sym, b, 0, 4600, 0, 4600 * price);
        }
      }
    });
  }

  // 1. SNIPER1 (Tier-1 Sniper): Hydro, LTP ~311, rvol=0.62, tight spread, clean high retention
  insFund.run('SNIPER1', 'Hydro Power', 900000000, 3500000, 60, 40, 14.2, 130, null);
  seedBreakAndRetestBars('SNIPER1', 300, { rvolLast: 0.62 });
  seedCleanSyndicate('SNIPER1', 300, { bcr3High: true, rawGrossHigh: true, minTop2High: true });

  // 2. BALANCED2 (Tier-2 Balanced): Hydro, rvol=0.73 (>0.70, <=0.75) & moderate bcr3
  insFund.run('BALANCED2', 'Hydro Power', 900000000, 3500000, 60, 40, 11.5, 120, null);
  seedBreakAndRetestBars('BALANCED2', 300, { rvolLast: 0.73 });
  seedCleanSyndicate('BALANCED2', 300, { bcr3High: false, rawGrossHigh: true, minTop2High: true });

  // 3. INSURVETO (Life Insurance -> vetoed)
  insFund.run('NLICTEST', 'Life Insurance', 2000000000, 5000000, 51, 49, 25.0, 210, null);
  seedBreakAndRetestBars('NLICTEST', 400, { rvolLast: 0.58 });
  seedCleanSyndicate('NLICTEST', 400, { bcr3High: true, rawGrossHigh: true, minTop2High: true });

  // 4. HIGHPRICE (LTP >= 650 -> vetoed)
  insFund.run('SARBTMTEST', 'Manufacturing And Processing', 2000000000, 5000000, 60, 40, 22.0, 220, null);
  seedBreakAndRetestBars('SARBTMTEST', 750, { rvolLast: 0.60 });
  seedCleanSyndicate('SARBTMTEST', 750, { bcr3High: true, rawGrossHigh: true, minTop2High: true });

  // 5. WASHCHURN (15D minTop2 < 25% -> vetoed)
  insFund.run('WASHCHURN', 'Hydro Power', 900000000, 3500000, 60, 40, 9.0, 115, null);
  seedBreakAndRetestBars('WASHCHURN', 300, { rvolLast: 0.60 });
  seedCleanSyndicate('WASHCHURN', 300, { bcr3High: true, rawGrossHigh: false, minTop2High: false });

  // 6. SHINE (DB mislabeled 'Commercial Banks', stockmap.json has 'Development Banks')
  insFund.run('SHINE', 'Commercial Banks', 4000000000, 15000000, 51, 49, 22.19, 175, null);
  seedBreakAndRetestBars('SHINE', 400, { rvolLast: 0.60 });
  seedCleanSyndicate('SHINE', 400, { bcr3High: true, rawGrossHigh: true, minTop2High: true });

  // 7. NABIL (Authentic Commercial Bank -> still vetoed in Flowchart v3.0)
  insFund.run('NABIL', 'Commercial Banks', 27000000000, 90000000, 51, 49, 28.0, 230, null);
  seedBreakAndRetestBars('NABIL', 480, { rvolLast: 0.55 });
  seedCleanSyndicate('NABIL', 480, { bcr3High: true, rawGrossHigh: true, minTop2High: true });

  // 8. TODAY_PRICES un-reconciled bar & high-price outlier test for Unbiased Market Regime
  insPrice.run('2026-11-25', 'SNIPER1', 310, 312, 305, 306, 40000, 12240000, 0, 'VALID', 'TODAY_PRICES');
  insPrice.run(latestDate, 'OUTLIERHIGH', 50000, 50000, 50000, 50000, 100, 5000000, 0, 'VALID', 'NEPSE_NOTS');

  return { db, dates, latestDate };
}

describe('Dual-Tier Unbiased Engine & Flowchart v3.0 Bug Fixes', () => {
  it('FR-1: evaluateUnbiasedMarketRegime uses NEPSE >= EMA20 + Breadth and rejects AVG(close_price) & TODAY_PRICES noise', () => {
    const { db, dates, latestDate } = createDualTierMockDb();

    // Strong Bull case: NEPSE above rising EMA20 + seeded equities all above 20D SMA
    const bullHist = dates.slice(-30).map((dt, i) => ({ date: dt, close: 2550 + i * 5 }));
    const bullRegime = evaluateUnbiasedMarketRegime({
      db,
      targetDate: latestDate,
      liveHistory: bullHist,
      baselinePath: '__nonexistent_baseline__.json',
      lastKnownMarketPath: '__nonexistent_lkm__.json',
    });
    assert.equal(bullRegime.regime, 'BULL');
    assert.ok(bullRegime.nepseClose >= bullRegime.ema20, 'NEPSE close should exceed EMA20');
    assert.ok(bullRegime.breadthPct >= 45, `Breadth should be >= 45%, got ${bullRegime.breadthPct}`);
    assert.equal(bullRegime.method, 'NEPSE_EMA20_PLUS_BREADTH');
    assert.equal(bullRegime.asOfDate, latestDate, 'Settled date must ignore 2026-11-25 TODAY_PRICES bar');

    // Chop case even if OUTLIERHIGH added Rs 50,000 close on latestDate: NEPSE < EMA20 triggers CHOP!
    const chopHist = dates.slice(-30).map((dt, i) => ({ date: dt, close: 2800 - i * 8 }));
    const chopRegime = evaluateUnbiasedMarketRegime({
      db,
      targetDate: latestDate,
      liveHistory: chopHist,
      baselinePath: '__nonexistent_baseline__.json',
      lastKnownMarketPath: '__nonexistent_lkm__.json',
    });
    assert.equal(chopRegime.regime, 'CHOP');
    db.close();
  });

  it('FR-2: Dual-Tier classifies TIER_1_SNIPER vs TIER_2_BALANCED and blocks Insurance / >=650 / Wash-Churn', () => {
    const { db, latestDate } = createDualTierMockDb();

    const sniper = evaluateDualTierCandidate('SNIPER1', { db, targetDate: latestDate });
    assert.equal(sniper.qualified, true, `SNIPER1 should qualify: ${sniper.failReason}`);
    assert.equal(sniper.tier, 'TIER_1_SNIPER');
    assert.ok(sniper.tierBadge.includes('87.5%'), 'Tier-1 badge should surface empirical WR');

    const balanced = evaluateDualTierCandidate('BALANCED2', { db, targetDate: latestDate });
    assert.equal(balanced.qualified, true, `BALANCED2 should qualify: ${balanced.failReason}`);
    assert.equal(balanced.tier, 'TIER_2_BALANCED');

    const insur = evaluateDualTierCandidate('NLICTEST', { db, targetDate: latestDate });
    assert.equal(insur.qualified, false);
    assert.equal(insur.vetoCode, 'INSURANCE_SECTOR_VETO');

    const hp = evaluateDualTierCandidate('SARBTMTEST', { db, targetDate: latestDate });
    assert.equal(hp.qualified, false);
    assert.equal(hp.vetoCode, 'PRICE_OUT_OF_RANGE');

    const wash = evaluateDualTierCandidate('WASHCHURN', { db, targetDate: latestDate });
    assert.equal(wash.qualified, false);
    assert.equal(wash.vetoCode, 'GROSS_MOVER_WASH_CHURN');

    const scan = scanDualTierCandidates({ db, targetDate: latestDate });
    const t1Symbols = scan.tier1Sniper.map((c) => c.symbol).sort();
    assert.deepEqual(t1Symbols, ['NABIL', 'SHINE', 'SNIPER1'], 'SNIPER1, sector-fixed SHINE, and sub-650 NABIL qualify as Tier-1');
    assert.equal(scan.tier2Balanced.length, 1, 'BALANCED2 qualifies as Tier-2');
    assert.equal(scan.topPick?.tier, 'TIER_1_SNIPER');
    db.close();
  });

  it('FR-3: Fixes SHINE sector mislabel override in Flowchart v3.0 & Dual-Tier while preserving genuine Commercial Bank veto and honest badge', () => {
    const { db, latestDate } = createDualTierMockDb();

    assert.equal(resolveCanonicalSector('SHINE', 'Commercial Banks'), 'Development Banks');
    assert.equal(resolveCanonicalSector('NABIL', 'Commercial Banks'), 'Commercial Banks');

    // Flowchart v3.0 evaluates SHINE without throwing SLOW_BANK_SECTOR
    const shineV3 = evaluateFlowchartV3Candidate('SHINE', { db, targetDate: latestDate, maxPrice: 500 });
    assert.notEqual(shineV3.vetoCode, 'SLOW_BANK_SECTOR', 'SHINE must NOT be vetoed as Commercial Bank');

    // Genuine Commercial Bank NABIL remains vetoed in Flowchart v3.0
    const nabilV3 = evaluateFlowchartV3Candidate('NABIL', { db, targetDate: latestDate, maxPrice: 500 });
    assert.equal(nabilV3.qualified, false);
    assert.equal(nabilV3.vetoCode, 'SLOW_BANK_SECTOR');

    // Misleading 88.7% Edge string removed from Flowchart v3.0 modeBadge
    const s1V3 = evaluateFlowchartV3Candidate('SNIPER1', { db, targetDate: latestDate, maxPrice: 500 });
    if (s1V3.qualified) {
      assert.ok(!s1V3.modeBadge.includes('88.7%'), 'Flowchart v3.0 must not label 88.7% Edge');
    }
    db.close();
  });

  it('FR-4: getScripVolumeProfile honors explicit lookbackSessions parameter (e.g. 15 vs default 5)', () => {
    const vp5 = getScripVolumeProfile('MBJC');
    const vp20 = getScripVolumeProfile('MBJC', 20);
    assert.ok(vp5 && vp5.nodes.length > 0, '5D volume profile must return nodes');
    assert.ok(vp20 && vp20.nodes.length >= vp5.nodes.length, '20D profile must cover at least as many nodes as 5D');
  });

  it('FR-5 & FR-6: Production notifier removes AVG(close_price)/88.7% hype, routes /radar/dual-tier, and updates UI panel', async () => {
    const notifierSrc = fs.readFileSync(path.join(process.cwd(), 'proxy', 'telegramNotifier.mjs'), 'utf8');
    assert.ok(!notifierSrc.includes('AVG(close_price)'), 'Must replace biased AVG(close_price) regime query');
    assert.ok(!notifierSrc.includes('88.7% Floor-Turn'), 'Must remove misleading 88.7% Floor-Turn string');
    assert.ok(notifierSrc.includes('/sniper'), 'Telegram bot must expose /sniper command');

    // Express router includes /radar/dual-tier and returns valid payload
    const dtLayer = radarRouter.stack.find((l) => l.route && Array.isArray(l.route.path) && l.route.path.includes('/radar/dual-tier'));
    assert.ok(dtLayer, 'radarRoutes must expose /radar/dual-tier');
    const dtHandler = dtLayer.route.stack[0].handle;
    let dtStatus = 200;
    let dtPayload = null;
    await dtHandler(
      { query: { maxPrice: '650', minTurnover: '2500000' } },
      { headers: {}, set(k, v) { this.headers[k] = v; }, status(c) { dtStatus = c; return this; }, json(b) { dtPayload = b; return this; } }
    );
    assert.equal(dtStatus, 200);
    assert.equal(dtPayload?.success, true);
    assert.ok(Array.isArray(dtPayload?.candidates), '/radar/dual-tier must return candidates array');

    const v3Layer = radarRouter.stack.find((l) => l.route && Array.isArray(l.route.path) && l.route.path.includes('/radar/flowchart-v3'));
    assert.ok(v3Layer, 'radarRoutes must expose /radar/flowchart-v3');
    const v3Handler = v3Layer.route.stack[0].handle;
    let v3Payload = null;
    await v3Handler(
      { query: { maxPrice: '500' } },
      { headers: {}, set(k, v) { this.headers[k] = v; }, status() { return this; }, json(b) { v3Payload = b; return this; } }
    );
    assert.equal(v3Payload?.success, true);
    assert.ok(v3Payload?.dualTier && Array.isArray(v3Payload.dualTier.candidates), '/radar/flowchart-v3 must embed dualTier payload');

    // UI component reads dualTier without direct DB access
    const panelSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'swing', 'FlowchartV3Panel.tsx'), 'utf8');
    assert.ok(!panelSrc.includes('better-sqlite3'), 'UI must remain isolated from DB');
    assert.ok(panelSrc.includes('dualTier') || panelSrc.includes('Sniper'), 'UI panel must render Dual-Tier Sniper shortlist');

    // Real ledger deterministic check on reconciled 2026-11-24
    const liveScan = scanDualTierCandidates({ db: liveDb, targetDate: '2026-11-24' });
    assert.ok(liveScan.asOfDate === '2026-11-24');
    assert.equal(liveScan.marketRegime, 'CHOP');
    assert.ok(Number.isFinite(liveScan.breadthPct), 'Breadth % must be finite');
  });
});
