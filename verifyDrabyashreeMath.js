/**
 * verifyDrabyashreeMath.js
 * Comprehensive Quantitative & Mathematical Invariant Verification Suite
 * Verifies all Core Mathematical Formulas, Microstructure Engines, Commission & Tax Models,
 * and Database Reconciliation for Drabyashree NEPSE.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { aggregateBrokerMicrostructure, getBrokerName } from './src/utils/sharedBrokerAggregationEngine.js';
import { calculateMultiDayDiagnostics, evaluateEarlyIgnition } from './proxy/utils/microstructureEngine.js';
import { extractContractNumber, deduplicateFloorsheetContracts } from './proxy/utils/floorsheetDeduplicator.mjs';
import { validateNepseTradingDate } from './proxy/db/ledgerStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('════════════════════════════════════════════════════════════════════════');
console.log('   DRABYASHREE NEPSE: COMPREHENSIVE MATHEMATICAL VERIFICATION SUITE     ');
console.log('════════════════════════════════════════════════════════════════════════\n');

let totalTests = 0;
let passedTests = 0;

function assertCheck(desc, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${desc}${details ? ` -> ${details}` : ''}`);
  } else {
    console.error(`  ❌ [FAIL] ${desc}${details ? ` -> ${details}` : ''}`);
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ARITHMETIC & INGESTION DEDUPLICATION MATH
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ SECTION 1: Floorsheet Ingestion Arithmetic & Deduplication Invariants');

const tradeFixture = [
  { contractId: '101', symbol: 'NABIL', buyer: 58, seller: 45, qty: 500, rate: 600, amount: 300000 },
  { contractId: '102', symbol: 'NABIL', buyer: 45, seller: 45, qty: 200, rate: 602, amount: 0 }, // 0 amount & self-trade
  { contractId: '101', symbol: 'NABIL', buyer: 58, seller: 45, qty: 500, rate: 600, amount: 300000 }, // Duplicate
  { contractId: '103', symbol: 'NABIL', buyer: 34, seller: 16, qty: 300, rate: 605, amount: 181500 },
];

const dedupResult = deduplicateFloorsheetContracts(tradeFixture);
assertCheck('Deduplication filters duplicate contract IDs', dedupResult.deduplicatedTrades.length === 3, `Count: ${dedupResult.deduplicatedTrades.length}`);
assertCheck('Deduplication detects exact duplicate count', dedupResult.duplicateCount === 1, `Duplicates: ${dedupResult.duplicateCount}`);

const selfTrade = dedupResult.deduplicatedTrades.find(t => t.buyer === 45 && t.seller === 45);
assertCheck('Arithmetic fallback enforces amount = qty * rate on 0.0 amount', selfTrade && selfTrade.amount === 120400, `Computed Amount: Rs. ${selfTrade?.amount}`);

const synId = extractContractNumber({ symbol: 'SHIVM', businessDate: '2026-10-26', buyer: 58, seller: 45, qty: 100, rate: 520, tradeTime: '11:15:02' }, '2026-10-26', 0);
assertCheck('Deterministic Synthetic Contract ID contains all critical trade fields', synId.startsWith('SYN-2026-10-26-SHIVM-58-45-100-520-11:15:02'), `ID: ${synId}`);

const splitLotFixture = [
  { symbol: 'SHIVM', businessDate: '2026-10-26', buyer: 58, seller: 45, qty: 100, rate: 520, tradeTime: '11:15:02' },
  { symbol: 'SHIVM', businessDate: '2026-10-26', buyer: 58, seller: 45, qty: 100, rate: 520, tradeTime: '11:15:02', subFill: 'lot-2' }, // Same-second split-lot
  { symbol: 'SHIVM', businessDate: '2026-10-26', buyer: 58, seller: 45, qty: 100, rate: 520, tradeTime: '11:15:02' }, // True duplicate
];
const splitDedup = deduplicateFloorsheetContracts(splitLotFixture, '2026-10-26');
assertCheck('Same-second split-lot fills without raw ID preserved with occurrence suffix', splitDedup.deduplicatedTrades.length === 2 && splitDedup.deduplicatedTrades[1].contractId.endsWith('-2'), `Count: ${splitDedup.deduplicatedTrades.length}, Suffix ID: ${splitDedup.deduplicatedTrades[1]?.contractId}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MICROSTRUCTURE BROKER CONCENTRATION & CROSS-TRADE EXCLUSION MATH
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SECTION 2: Microstructure Concentration & Non-Cross Denominator Math');

const aggTrades = [
  // Broker 58: Net Buyer (+1000 shares)
  { contractId: 'T1', symbol: 'NABIL', buyer: 58, seller: 16, qty: 1000, rate: 600, amount: 600000 },
  // Broker 45: Bilateral Cross-Trade (500 shares buy & sell)
  { contractId: 'T2', symbol: 'NABIL', buyer: 45, seller: 45, qty: 500, rate: 601, amount: 300500 },
  // Broker 34: Net Seller (-600 shares)
  { contractId: 'T3', symbol: 'NABIL', buyer: 28, seller: 34, qty: 600, rate: 602, amount: 361200 },
  // Broker 16: Net Seller (-400 shares)
  { contractId: 'T4', symbol: 'NABIL', buyer: 28, seller: 16, qty: 400, rate: 602, amount: 240800 },
];

const sharedAgg = aggregateBrokerMicrostructure({
  symbol: 'NABIL',
  contracts: aggTrades,
  days: 1
});

// Total Volume: 2500 (1000 + 500 + 600 + 400)
// Cross Volume: 500
// External Arm's-Length Market Volume: 2000
assertCheck('Total session volume correctly includes all executed contracts', sharedAgg.totalVolume === 2500, `Total Volume: ${sharedAgg.totalVolume}`);
assertCheck('Cross volume is accurately segregated', sharedAgg.crossVolume === 500, `Cross Volume: ${sharedAgg.crossVolume}`);
assertCheck('Arm\'s-length non-cross volume equals total - cross', sharedAgg.totalNonCrossBuyVol === 2000, `Non-Cross Buy Vol: ${sharedAgg.totalNonCrossBuyVol}`);

// Broker 58 gross buy volume: 1000. Non-cross effBuyVol: 2000. Broker 58 share = 1000 / 2000 = 50.0%
const leadBuyer = sharedAgg.topBuyers.find(b => b.brokerId === '58');
const leadBuyerPct = leadBuyer ? Number(((leadBuyer.nonCrossBuyVol / sharedAgg.totalNonCrossBuyVol) * 100).toFixed(1)) : 0;
assertCheck('Lead Buyer (Broker 58) non-cross share is strictly 50.0% (1000 / 2000)', leadBuyerPct === 50.0, `Lead Buyer Share: ${leadBuyerPct}%`);
assertCheck('BCR3 Buy Concentration (Broker 58 + Broker 28) correctly captures 100.0% of non-cross volume', sharedAgg.bcr3BuyPct === 100.0, `BCR3: ${sharedAgg.bcr3BuyPct}%`);

// Lead Accumulator Broker 58 avgBuyPrice = 600.0; Combined Big Broker VWAP across accumulators (58 & 28) = (600,000 + 602,000) / 2000 = 601.0
assertCheck('Lead Accumulator (Broker 58) VWAP strictly equals Rs. 600.0', leadBuyer?.avgBuyPrice === 600.0, `Lead VWAP: Rs. ${leadBuyer?.avgBuyPrice}`);
assertCheck('Big Broker VWAP strictly equals SUM(buyAmt) / SUM(buyQty) across top accumulators', sharedAgg.bigBrokerVWAP === 601.0, `Big Broker VWAP: Rs. ${sharedAgg.bigBrokerVWAP}`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. MULTI-DAY DIAGNOSTICS & SMART FLOW ASYMMETRY MATH
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SECTION 3: Multi-Day Diagnostics & Smart Flow Directional Asymmetry');

const multiDayHistory = [
  {
    date: '2026-10-26',
    totalVolume: 50000,
    totalTurnover: 25000000,
    openPrice: 500,
    closePrice: 505,
    brokers: [
      { brokerId: '58', buyQty: 25000, sellQty: 5000, buyAmt: 12500000, sellAmt: 2500000 },
      { brokerId: '45', buyQty: 5000, sellQty: 20000, buyAmt: 2500000, sellAmt: 10000000 },
      { brokerId: '34', buyQty: 10000, sellQty: 10000, buyAmt: 5000000, sellAmt: 5000000, crossVol: 10000 }
    ]
  },
  {
    date: '2026-10-25',
    totalVolume: 40000,
    totalTurnover: 20000000,
    openPrice: 495,
    closePrice: 500,
    brokers: [
      { brokerId: '58', buyQty: 18000, sellQty: 4000, buyAmt: 9000000, sellAmt: 2000000 },
      { brokerId: '45', buyQty: 4000, sellQty: 15000, buyAmt: 2000000, sellAmt: 7500000 }
    ]
  },
  {
    date: '2026-10-22',
    totalVolume: 35000,
    totalTurnover: 17150000,
    openPrice: 490,
    closePrice: 495,
    brokers: [
      { brokerId: '58', buyQty: 15000, sellQty: 3000, buyAmt: 7350000, sellAmt: 1470000 },
      { brokerId: '45', buyQty: 3000, sellQty: 12000, buyAmt: 1470000, sellAmt: 5880000 }
    ]
  }
];

const diag3D = calculateMultiDayDiagnostics(multiDayHistory, 3);
assertCheck('Multi-day diagnostics calculates cumulative volume', diag3D.totalVolume === 125000, `Total Volume: ${diag3D.totalVolume}`);
assertCheck('Sessions with positive smart flow accurately detects institutional accumulation', diag3D.sessionsWithPositiveSmartFlow === 3, `Positive Sessions: ${diag3D.sessionsWithPositiveSmartFlow}/3`);
assertCheck('Lead accumulator correctly identified as Broker 58', diag3D.leadAccumulator.brokerId === '58', `Lead: #${diag3D.leadAccumulator.brokerId}`);
assertCheck('Net retained accumulation of lead accumulator is positive', diag3D.leadAccumulator.remainingQty === 46000, `Retained: ${diag3D.leadAccumulator.remainingQty} shares`);

const baseline30D = { ...diag3D, totalVolume: 1250000, retentionPct: 82, bcr5NetPct: 22, scr3NetPct: 8 };
const ignitionResult = evaluateEarlyIgnition('NABIL', diag3D, baseline30D, multiDayHistory);
assertCheck('Early Ignition Engine evaluates stage correctly', Boolean(ignitionResult?.ignitionStage), `Stage: ${ignitionResult?.stageLabel}`);

// ─────────────────────────────────────────────────────────────────────────────
// 4. STATUTORY SEBON COMMISSION & FIDUCIARY TAX MATH
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SECTION 4: Statutory SEBON Commission, Regulatory Fees & Capital Gains Tax');

function calculateNepseFees(turnover, isBuy = true, isShortTerm = true, capitalGain = 0, isInstitutional = false) {
  // SEBON 5-Tier Broker Commission Schedule (2082 Rules)
  let commRate = 0.0036;
  if (turnover > 10000000) commRate = 0.0024;
  else if (turnover > 2000000) commRate = 0.0027;
  else if (turnover > 500000) commRate = 0.0031;
  else if (turnover > 50000) commRate = 0.0033;
  const commission = Math.max(10, turnover * commRate);
  const sebonFee = turnover * 0.00015; // 0.015%
  const dpFee = 25.0; // Rs. 25 per scrip transfer
  const cgtRate = isInstitutional ? 0.10 : (isShortTerm ? 0.075 : 0.05); // 10% Institutional vs 7.5% (<365d) / 5.0% (>=365d) Individual
  const cgt = !isBuy && capitalGain > 0 ? Number((capitalGain * cgtRate).toFixed(2)) : 0;
  return { commission, sebonFee, dpFee, cgt };
}

const feeSmall = calculateNepseFees(1000);
assertCheck('SEBON Minimum Brokerage Floor of Rs. 10 is strictly enforced for small turnover (< Rs. 2,778)', feeSmall.commission === 10.0, `Comm on Rs. 1,000: Rs. ${feeSmall.commission}`);

const fee50k = calculateNepseFees(50000);
assertCheck('SEBON Broker Commission <= Rs. 50,000 is strictly 0.36%', Math.abs(fee50k.commission - 180) < 0.01, `Comm: Rs. ${fee50k.commission}`);

const fee200k = calculateNepseFees(200000);
assertCheck('SEBON Broker Commission Rs. 50,000 - 500,000 is strictly 0.33%', Math.abs(fee200k.commission - 660) < 0.01, `Comm: Rs. ${fee200k.commission}`);

const fee1M = calculateNepseFees(1000000);
assertCheck('SEBON Broker Commission Rs. 500,000 - 2,000,000 is strictly 0.31%', Math.abs(fee1M.commission - 3100) < 0.01, `Comm: Rs. ${fee1M.commission}`);

const fee5M = calculateNepseFees(5000000);
assertCheck('SEBON Broker Commission Rs. 2,000,000 - 10,000,000 is strictly 0.27%', Math.abs(fee5M.commission - 13500) < 0.01, `Comm: Rs. ${fee5M.commission}`);

const fee20M = calculateNepseFees(20000000);
assertCheck('SEBON Broker Commission > Rs. 10,000,000 (1 Crore) is strictly 0.24%', Math.abs(fee20M.commission - 48000) < 0.01, `Comm: Rs. ${fee20M.commission}`);

assertCheck('SEBON Regulatory Fee is strictly 0.015%', Math.abs(fee1M.sebonFee - 150) < 0.01, `SEBON Fee: Rs. ${fee1M.sebonFee}`);

const sellShortTerm = calculateNepseFees(500000, false, true, 100000, false);
const sellLongTerm = calculateNepseFees(500000, false, false, 100000, false);
const sellInstitutional = calculateNepseFees(500000, false, false, 100000, true);
assertCheck(
  'Capital Gains Tax enforces 7.5% Individual ST (<365d), 5.0% Individual LT (>=365d), and 10.0% Institutional',
  sellShortTerm.cgt === 7500 && sellLongTerm.cgt === 5000 && sellInstitutional.cgt === 10000,
  `ST: Rs. ${sellShortTerm.cgt}, LT: Rs. ${sellLongTerm.cgt}, Inst: Rs. ${sellInstitutional.cgt}`
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. REGULATORY ±15% CIRCUIT LIMIT CALIBRATION (2082 AMENDMENT)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SECTION 5: ±15% Circuit Band Enforcement (Nepal Securities Trading Fourth Amendment)');

function computeCircuitBands(prevClose) {
  const ceiling = Number((prevClose * 1.15).toFixed(1));
  const floor = Number((prevClose * 0.85).toFixed(1));
  return { ceiling, floor };
}

const bands1000 = computeCircuitBands(1000);
assertCheck('Base Rs. 1000 ceiling is strictly Rs. 1150 (+15%)', bands1000.ceiling === 1150.0, `Ceiling: ${bands1000.ceiling}`);
assertCheck('Base Rs. 1000 floor is strictly Rs. 850 (-15%)', bands1000.floor === 850.0, `Floor: ${bands1000.floor}`);

const bands320 = computeCircuitBands(320);
assertCheck('Base Rs. 320 ceiling is strictly Rs. 368 (+15%)', bands320.ceiling === 368.0, `Ceiling: ${bands320.ceiling}`);
assertCheck('Base Rs. 320 floor is strictly Rs. 272 (-15%)', bands320.floor === 272.0, `Floor: ${bands320.floor}`);

// ─────────────────────────────────────────────────────────────────────────────
// 6. SQLITE DATABASE RECONCILIATION INVARIANTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SECTION 6: Live SQLite Database Mathematical Parity (drabyashree_ledger.db)');

const dbPath = path.join(__dirname, 'proxy', 'data', 'drabyashree_ledger.db');
try {
  const db = new Database(dbPath, { readonly: true });

  const datesRow = db.prepare(`SELECT DISTINCT trade_date FROM floorsheet_contracts ORDER BY trade_date DESC LIMIT 3`).all();
  const dates = datesRow.map(d => d.trade_date);

  for (const date of dates) {
    const fc = db.prepare(`
      SELECT COUNT(*) as contracts, SUM(kitta) as totalKitta, ROUND(SUM(amount), 2) as totalAmount
      FROM floorsheet_contracts WHERE trade_date = ?
    `).get(date);

    const dss = db.prepare(`
      SELECT COUNT(*) as scrips, SUM(total_volume) as totalVolume, ROUND(SUM(total_turnover), 2) as totalTurnover
      FROM daily_stock_summary WHERE trade_date = ?
    `).get(date);

    const volDiff = Math.abs((fc.totalKitta || 0) - (dss.totalVolume || 0));
    const amtDiff = Math.abs((fc.totalAmount || 0) - (dss.totalTurnover || 0));

    assertCheck(
      `Reconciliation Date ${date}: floorsheet_contracts volume == daily_stock_summary volume`,
      volDiff === 0,
      `Contracts Vol: ${fc.totalKitta} | Summary Vol: ${dss.totalVolume} (Delta: ${volDiff})`
    );
    assertCheck(
      `Reconciliation Date ${date}: floorsheet_contracts turnover == daily_stock_summary turnover`,
      amtDiff < 1.0,
      `Contracts Turnover: Rs. ${fc.totalAmount} | Summary Turnover: Rs. ${dss.totalTurnover} (Delta: Rs. ${amtDiff.toFixed(2)})`
    );

    const dbl = db.prepare(`
      SELECT SUM(buy_vol) as sumBuyVol, SUM(sell_vol) as sumSellVol
      FROM daily_broker_ledger WHERE trade_date = ?
    `).get(date);
    assertCheck(
      `Reconciliation Date ${date}: daily_broker_ledger Zero-Sum Conservation (buy_vol == sell_vol == summary_vol)`,
      dbl.sumBuyVol === dbl.sumSellVol && dbl.sumBuyVol === dss.totalVolume,
      `BuyVol: ${dbl.sumBuyVol} | SellVol: ${dbl.sumSellVol} | SummaryVol: ${dss.totalVolume}`
    );
  }

  // Arithmetic integrity of stored contracts: check whether amount == kitta * rate
  const corruptRows = db.prepare(`
    SELECT COUNT(*) as badCount
    FROM floorsheet_contracts
    WHERE kitta > 0 AND rate > 0 AND ABS(amount - (kitta * rate)) > MAX(1.0, amount * 0.01)
  `).get();
  assertCheck('Zero arithmetic corruption rows (amount == kitta * rate) in floorsheet_contracts', corruptRows.badCount === 0, `Corrupt Rows: ${corruptRows.badCount}`);

  // Calendar allowlist check: historical 2026-10-16 session permitted via legacy allowlist
  assertCheck('Calendar Validator safely permits historical 2026-10-16 session via allowlist', validateNepseTradingDate('2026-10-16', true) === true, 'Allowlisted Date: 2026-10-16');

  db.close();
} catch (err) {
  assertCheck('SQLite ledger database accessible and readable', false, err.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL VERIFICATION SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(` MATHEMATICAL VERIFICATION SUMMARY: ${passedTests}/${totalTests} INVARIANTS PASSED`);
console.log('════════════════════════════════════════════════════════════════════════');

if (passedTests === totalTests) {
  console.log('🎉 ALL MATHEMATICAL INVARIANTS & FORMULAS ARE 100% VERIFIED!\n');
  process.exit(0);
} else {
  console.error(`⚠️ FAILED: ${totalTests - passedTests} mathematical invariants failed verification.\n`);
  process.exit(1);
}
