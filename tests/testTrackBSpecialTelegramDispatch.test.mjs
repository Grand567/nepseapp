// tests/testTrackBSpecialTelegramDispatch.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  calculateMultiTimeframeBrokerMetrics,
  evaluateTrackB2to3DayIgnition,
  scanTrackBSyndicateCandidates,
  formatTrackBSyndicateHtml,
} from '../proxy/trackBSyndicateEngine.mjs';

function createMockDatabase() {
  const db = new Database(':memory:');
  
  // Create minimal schema matching drabyashree_ledger.db
  db.exec(`
    CREATE TABLE daily_stock_summary (
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      close_price REAL NOT NULL,
      open_price REAL,
      high_price REAL,
      low_price REAL,
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
      company_name TEXT,
      sector TEXT,
      paid_up_capital REAL,
      public_share_pct REAL,
      promoter_share_pct REAL,
      total_shares REAL
    );

    CREATE TABLE floorsheet_contracts (
      contract_no TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      trade_time TEXT,
      buyer_broker INTEGER NOT NULL,
      seller_broker INTEGER NOT NULL,
      kitta INTEGER NOT NULL,
      rate REAL NOT NULL,
      amount REAL NOT NULL,
      aggressor_side TEXT DEFAULT 'NEUTRAL',
      is_whale_print INTEGER DEFAULT 0
    );
  `);

  // Seed sample stock HEI (Himalayan Everest Insurance) - Sub 450, Float ~ 1.1 Cr
  db.prepare(`
    INSERT INTO scrip_fundamentals (symbol, company_name, sector, paid_up_capital, public_share_pct, total_shares)
    VALUES ('HEI', 'Himalayan Everest Insurance', 'Non-Life Insurance', 2300000000, 49.0, 23000000)
  `).run();

  // Seed stock NBL (Commercial bank with 30 Cr float shares -> should be filtered by float gate)
  db.prepare(`
    INSERT INTO scrip_fundamentals (symbol, company_name, sector, paid_up_capital, public_share_pct, total_shares)
    VALUES ('NBL', 'Nepal Bank Limited', 'Commercial Banks', 15000000000, 49.0, 150000000)
  `).run();

  // Seed HEI daily stock candles for 15 sessions
  // Day T-3 (2026-11-13): Ignition bar (+3.2% gain on 150,000 volume)
  // Day T-2 (2026-11-14): Pullback bar
  // Day T-1 (2026-11-16): Pullback bar
  // Day T0  (2026-11-17): Today bar, severe VDU (25,000 volume, NR7 tight range 441 - 446, close 444)
  const dates = [
    '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02',
    '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09',
    '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14',
    '2026-11-16', '2026-11-17'
  ];

  const candleStmt = db.prepare(`
    INSERT INTO daily_stock_summary (trade_date, symbol, close_price, open_price, high_price, low_price, total_volume, total_turnover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  dates.forEach((d, i) => {
    let close = 430 + i * 0.8;
    let open = close - 1;
    let high = close + 2;
    let low = close - 2;
    let vol = 60000;
    let turnover = vol * close;

    if (d === '2026-11-13') {
      // Ignition bar (+3.5% on 150,000 kitta)
      open = 432;
      close = 447;
      high = 448;
      low = 431;
      vol = 150000;
      turnover = vol * 442;
    } else if (d === '2026-11-17') {
      // Today (Day T+2 from ignition): Tight compression NR7, VDU (20,000 kitta)
      open = 442;
      close = 444;
      high = 445;
      low = 441.5;
      vol = 20000;
      turnover = vol * 443;
    }

    candleStmt.run(d, 'HEI', close, open, high, low, vol, turnover);
    candleStmt.run(d, 'NBL', 250, 249, 252, 248, 500000, 500000 * 250);
  });

  // Seed HEI broker ledger:
  // Top 3 buyers: Broker #39, #34, #41
  // They buy heavily, sell almost zero (Retention > 90%)
  const brokerStmt = db.prepare(`
    INSERT INTO daily_broker_ledger (trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Today (2026-11-17)
  brokerStmt.run('2026-11-17', 'HEI', 39, 8000, 400, 8000 * 443, 400 * 443);
  brokerStmt.run('2026-11-17', 'HEI', 34, 4500, 100, 4500 * 443.5, 100 * 443.5);
  brokerStmt.run('2026-11-17', 'HEI', 41, 3000, 0, 3000 * 442, 0);
  // Fragmented retail sellers (15 different broker desks selling small retail amounts)
  for (let b = 1; b <= 15; b++) {
    const brokerId = 50 + b;
    brokerStmt.run('2026-11-17', 'HEI', brokerId, 0, 400, 0, 400 * 443);
  }

  // Past 5 sessions
  const pastDates = ['2026-11-13', '2026-11-14', '2026-11-16'];
  pastDates.forEach(pd => {
    brokerStmt.run(pd, 'HEI', 39, 25000, 2000, 25000 * 438, 2000 * 438);
    brokerStmt.run(pd, 'HEI', 34, 18000, 1500, 18000 * 439, 1500 * 439);
    brokerStmt.run(pd, 'HEI', 41, 14000, 800, 14000 * 437, 800 * 437);
  });

  // Seed floorsheet contracts to give a definitive POC at 443.0
  const fsStmt = db.prepare(`
    INSERT INTO floorsheet_contracts (contract_no, symbol, trade_date, trade_time, buyer_broker, seller_broker, kitta, rate, amount, aggressor_side, is_whale_print)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let c = 1; c <= 20; c++) {
    fsStmt.run(`C${c}`, 'HEI', '2026-11-17', '11:30:00', 39, 45, 1000, 443.0, 443000, 'BUY', 1);
  }

  return db;
}

describe('Track B Special Syndicate Strategy & Telegram Dispatcher', () => {
  const db = createMockDatabase();

  it('1. should calculate 1D, 5D, and 15D broker metrics, retention, and cost basis accurately', () => {
    const metrics = calculateMultiTimeframeBrokerMetrics('HEI', { db, targetDate: '2026-11-17' });
    
    assert.ok(metrics, 'Metrics object must be returned');
    assert.equal(metrics.symbol, 'HEI');
    assert.ok(metrics.todayRetentionPct >= 75.0, `Today retention must be >= 75% (got ${metrics.todayRetentionPct}%)`);
    assert.ok(metrics.rolling5DRetentionPct >= 75.0, `5D retention must be >= 75% (got ${metrics.rolling5DRetentionPct}%)`);
    assert.ok(metrics.totalNetRetentionPct >= 75.0, `Total syndicate retention must be >= 75% (got ${metrics.totalNetRetentionPct}%)`);
    
    // Check cost basis (VWAP)
    assert.ok(metrics.vwap1D > 0, '1D VWAP must be positive');
    assert.ok(metrics.vwap5D > 0, '5D VWAP must be positive');
    assert.ok(metrics.vwap15D > 0, '15D VWAP must be positive');
    assert.ok(metrics.poc > 0, 'POC must be positive');

    // Check top brokers identification
    assert.ok(Array.isArray(metrics.topBrokers) && metrics.topBrokers.length >= 3, 'Must identify top 3 brokers');
    assert.equal(metrics.topBrokers[0].brokerId, 39);
    assert.ok(metrics.topBrokers[0].netQty > 0);
    assert.ok(metrics.topBrokers[0].retentionPct > 80);

    // Check Concentration Asymmetry
    assert.ok(metrics.bcr3Buy >= 40.0, `BCR3 Buy must be >= 40% (got ${metrics.bcr3Buy}%)`);
    assert.ok(metrics.bcr3Sell <= 35.0, `BCR3 Sell must be <= 35% (got ${metrics.bcr3Sell}%)`);
    assert.ok(metrics.buySellAsymmetryRatio >= 1.5, `Buy/Sell asymmetry ratio must be >= 1.5x (got ${metrics.buySellAsymmetryRatio}x)`);
  });

  it('2. should evaluate Track B 2–3 day ignition criteria and enforce all gates and vetoes', () => {
    const evaluation = evaluateTrackB2to3DayIgnition('HEI', { db, targetDate: '2026-11-17' });
    
    assert.ok(evaluation.qualified, `HEI must qualify for Track B (reason: ${evaluation.failReason})`);
    assert.ok(evaluation.ltp < 450, 'LTP must be < 450');
    assert.ok(evaluation.publicFloatShares <= 15000000, 'Public float must be <= 1.5 Crore shares');
    assert.ok(evaluation.isPocProximate, 'LTP must be within 1.5% of Point of Control (POC)');
    assert.ok(evaluation.isVduMet, 'Volume dry-up condition must be met');
    assert.ok(evaluation.isVolatilityCompressed, 'Daily spread compression or NR7/IDNR4 must be met');
    assert.equal(evaluation.antiDematDumpPass, true, 'Anti-Demat dump guard must pass');
  });

  it('3. should veto Commercial Banks or stocks with float exceeding 1.5 Crore shares', () => {
    const evaluation = evaluateTrackB2to3DayIgnition('NBL', { db, targetDate: '2026-11-17' });
    assert.equal(evaluation.qualified, false, 'NBL should be disqualified due to float size / commercial bank sector');
    assert.match(evaluation.failReason, /float|bank|commercial/i);
  });

  it('4. should reject stocks if LTP is extended > 1.5% away from POC / VWAP', () => {
    const evalHigh = evaluateTrackB2to3DayIgnition('HEI', { db, targetDate: '2026-11-17', mockLtp: 460.0 });
    assert.equal(evalHigh.qualified, false, 'Should fail if LTP is extended > 1.5% from POC');
  });

  it('5. should reject stocks if prior buyers are dumping shares today (Anti-Demat Dump Veto)', () => {
    // Add a dump for Broker 39 in a clone db
    const dumpDb = createMockDatabase();
    dumpDb.prepare(`
      UPDATE daily_broker_ledger 
      SET sell_vol = 30000, buy_vol = 1000 
      WHERE trade_date = '2026-11-17' AND symbol = 'HEI' AND broker_id = 39
    `).run();

    const evaluation = evaluateTrackB2to3DayIgnition('HEI', { db: dumpDb, targetDate: '2026-11-17' });
    assert.equal(evaluation.qualified, false, 'Should fail when lead broker dumps shares');
    assert.match(evaluation.failReason, /dump|retention/i);
  });

  it('6. should format the exact Telegram HTML message according to user specifications', () => {
    const topPick = {
      symbol: 'HEI',
      companyName: 'Himalayan Everest Insurance',
      sector: 'Non-Life Insurance',
      ltp: 444.0,
      pChange: 0.5,
      totalNetRetentionPct: 88.5,
      vwap1D: 443.0,
      vwap5D: 438.5,
      vwap15D: 435.0,
      poc: 443.0,
      bcr3Buy: 74.2,
      bcr3Sell: 28.5,
      buySellAsymmetryRatio: 2.60,
      todayRetentionPct: 94.5,
      rolling5DRetentionPct: 88.5,
      netKitta1D: 15000,
      netKitta5D: 72000,
      netKitta15D: 110000,
      topBrokers: [
        { brokerId: 39, name: 'Sumeru Securities', netQty: 10587, retentionPct: 93.2, vwap: 433.6 },
        { brokerId: 34, name: 'Vision Securities', netQty: 4590, retentionPct: 98.1, vwap: 440.5 },
        { brokerId: 41, name: 'Linch Securities', netQty: 4320, retentionPct: 93.0, vwap: 442.9 }
      ],
      vduPct: 75.0,
      todayVol: 20000,
      avgVol20: 80000,
      clvPct: 75.0,
      upperWickPct: 15.0,
      isNr7: true,
      buyZoneLow: 438.0,
      buyZoneHigh: 445.0,
      stopLoss: 428.0,
      target1: 482.0,
      target2: 512.0,
      riskRewardRatio: 2.4,
      capitalBlueprint: {
        shares: 225,
        maxRiskNpr: 3600,
        riskPct: 3.6
      }
    };

    const html = formatTrackBSyndicateHtml(topPick);
    
    // Check required keywords and user constraints
    assert.match(html, /TRACK B/i, 'Must label Track B');
    assert.match(html, /<code>\$HEI<\/code>/);
    assert.match(html, /Sumeru/i);
    assert.match(html, /Vision/i);
    assert.match(html, /BCR3 Buy/i);
    assert.match(html, /BCR3 Sell/i);
    assert.match(html, /1D.*Avg Cost/i);
    assert.match(html, /5D.*Avg Cost/i);
    assert.match(html, /15D.*Avg Cost/i);
    assert.match(html, /POC/i);
    assert.match(html, /Total Syndicate Retention.*88\.5%/i);
    assert.match(html, /Stop-Loss/i);
    assert.match(html, /Buy Zone/i);
    assert.match(html, /\/trackb/i);
  });

  it('7. should scan candidates, select HEI as top pick, and filter out commercial banks', () => {
    const scanResult = scanTrackBSyndicateCandidates({ db, maxPrice: 450, targetDate: '2026-11-17' });
    assert.ok(scanResult, 'Scan result must be returned');
    assert.ok(scanResult.qualifiedCount >= 1, `Must qualify at least 1 candidate (got ${scanResult.qualifiedCount})`);
    assert.equal(scanResult.topPick.symbol, 'HEI', 'HEI must be selected as #1 top pick');
    assert.ok(scanResult.topPick.tbciiScore >= 70, `Score must be >= 70 (got ${scanResult.topPick.tbciiScore})`);
    
    // NBL must not be in topPick or runnerUps
    assert.notEqual(scanResult.topPick.symbol, 'NBL');
    const runnerSymbols = scanResult.runnerUps.map(r => r.symbol);
    assert.equal(runnerSymbols.includes('NBL'), false, 'NBL must be filtered out');
  });

  it('8. should reject candidate when volatility compression is violated', () => {
    const wideDb = createMockDatabase();
    // Make 2026-11-17 candle high spread (high 460, low 435 -> range > 5%)
    wideDb.prepare(`
      UPDATE daily_stock_summary
      SET high_price = 460, low_price = 435, open_price = 440, close_price = 444
      WHERE trade_date = '2026-11-17' AND symbol = 'HEI'
    `).run();

    const evaluation = evaluateTrackB2to3DayIgnition('HEI', { db: wideDb, targetDate: '2026-11-17' });
    assert.equal(evaluation.qualified, false);
    assert.match(evaluation.failReason, /volatility/i);
  });

  it('9. should reject candidate when Wyckoff volume dry-up is violated', () => {
    const highVolDb = createMockDatabase();
    // Make 2026-11-17 volume huge (200,000 kitta -> RVOL > 2.5x)
    highVolDb.prepare(`
      UPDATE daily_stock_summary
      SET total_volume = 200000
      WHERE trade_date = '2026-11-17' AND symbol = 'HEI'
    `).run();

    const evaluation = evaluateTrackB2to3DayIgnition('HEI', { db: highVolDb, targetDate: '2026-11-17' });
    assert.equal(evaluation.qualified, false);
    assert.match(evaluation.failReason, /volume/i);
  });
});
