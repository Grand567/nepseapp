// tests/kWhaleDailyArchive.test.mjs
/**
 * Test Suite: Daily Whale Archive & Consecutive Alert Tracker (whaleDailyArchive.js)
 * Run: node tests/kWhaleDailyArchive.test.mjs
 */

// Polyfill localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

import {
  getStoredWhaleArchive,
  saveStoredWhaleArchive,
  exportWhaleArchiveJSON,
  importWhaleArchiveJSON,
  captureDailyWhaleSnapshot,
  calculateArchivePerformance
} from '../src/services/whaleDailyArchive.js';

let pass = 0, fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log(`  PASS: ${m}`);
  } else {
    fail++;
    console.error(`  FAIL: ${m}`);
  }
};

console.log('▶ [SUITE] kWhaleDailyArchive.test.mjs\n');

// 1. Clean state test
localStorage.clear();
ok(getStoredWhaleArchive().length === 0, 'Initial archive is empty');

// Mock data
const mockStocks = [
  { symbol: 'HDL', companyName: 'Himalayan Distillery', ltp: 1293, pChange: 0.54, turnover: 132000000, volume: 102000 },
  { symbol: 'SAHAS', companyName: 'Sahas Urja', ltp: 688, pChange: 0.0, turnover: 30000000, volume: 43000 },
  { symbol: 'KBL', companyName: 'Kumari Bank', ltp: 225.5, pChange: 0.22, turnover: 118000000, volume: 520000 },
  { symbol: 'AKJCL', companyName: 'Ankhu Khola', ltp: 356, pChange: 0.65, turnover: 148000000, volume: 415000 },
  { symbol: 'LEC', companyName: 'Liberty Energy', ltp: 245, pChange: -2.89, turnover: 107000000, volume: 436000 }
];

const mockFloorsheetDay1 = [
  // HDL buyer concentration (Brokers 10, 40)
  { stockSymbol: 'HDL', buyer: '10', seller: '62', quantity: 500, rate: 1293, amount: 646500, businessDate: '2026-10-01' },
  { stockSymbol: 'HDL', buyer: '40', seller: '54', quantity: 300, rate: 1293, amount: 387900, businessDate: '2026-10-01' },
  // SAHAS buyer concentration (Broker 29)
  { stockSymbol: 'SAHAS', buyer: '29', seller: '34', quantity: 800, rate: 688, amount: 550400, businessDate: '2026-10-01' },
  // AKJCL heavy seller dumping (Broker 49)
  { stockSymbol: 'AKJCL', buyer: '32', seller: '49', quantity: 900, rate: 356, amount: 320400, businessDate: '2026-10-01' },
  // LEC heavy seller dumping (Broker 34, 35)
  { stockSymbol: 'LEC', buyer: '16', seller: '34', quantity: 700, rate: 245, amount: 171500, businessDate: '2026-10-01' }
];

// Day 1 Capture
console.log('[Test 1] Capturing Day 1 Snapshot...');
const snap1 = captureDailyWhaleSnapshot(mockStocks, mockFloorsheetDay1, '2026-10-01');
ok(snap1 !== null, 'Snapshot created successfully');
ok(snap1.date === '2026-10-01', 'Snapshot date matches market date');
ok(snap1.topAccumulation.length > 0, 'Has top accumulation stocks');
ok(snap1.topDistribution.length > 0, 'Has top distribution stocks');

const hdlDay1 = snap1.topAccumulation.find(s => s.symbol === 'HDL');
ok(hdlDay1 !== undefined, 'HDL captured in top accumulation');
ok(hdlDay1.consecutiveDays === 1, 'HDL is on Day 1 accumulation');
ok(hdlDay1.signalBadge.includes('Day 1'), 'HDL has Day 1 badge');

const akjclDay1 = snap1.topDistribution.find(s => s.symbol === 'AKJCL');
ok(akjclDay1 !== undefined, 'AKJCL captured in top distribution');
ok(akjclDay1.exitWindowNote.includes('2 to 3 sessions'), 'AKJCL has 2-3 sessions exit note');

// Day 2 Capture (Consecutive day)
console.log('\n[Test 2] Capturing Day 2 Snapshot (Consecutive Day Verification)...');
const mockFloorsheetDay2 = [
  // HDL accumulated again on Day 2!
  { stockSymbol: 'HDL', buyer: '10', seller: '34', quantity: 600, rate: 1300, amount: 780000, businessDate: '2026-10-02' },
  // AKJCL distributed again on Day 2!
  { stockSymbol: 'AKJCL', buyer: '58', seller: '49', quantity: 1200, rate: 354, amount: 424800, businessDate: '2026-10-02' }
];

const snap2 = captureDailyWhaleSnapshot(mockStocks, mockFloorsheetDay2, '2026-10-02');
const hdlDay2 = snap2.topAccumulation.find(s => s.symbol === 'HDL');
ok(hdlDay2 !== undefined, 'HDL captured on Day 2');
ok(hdlDay2.consecutiveDays === 2, 'HDL successfully detected as Day 2 consecutive accumulation');
ok(hdlDay2.signalBadge.includes('Day 2 Multi-Session Absorption (Prime Entry)'), 'HDL has Prime Entry Day 2 badge');

const akjclDay2 = snap2.topDistribution.find(s => s.symbol === 'AKJCL');
ok(akjclDay2 !== undefined, 'AKJCL captured on Day 2 distribution');
ok(akjclDay2.distributionDay === 2, 'AKJCL marked as Day 2 distribution');
ok(akjclDay2.signalBadge.includes('Day 2 Aggressive Distribution'), 'AKJCL has Day 2 distribution warning badge');

// Archive Retrieval
console.log('\n[Test 3] Archive Persistence...');
const archive = getStoredWhaleArchive();
ok(archive.length === 2, 'Stored archive contains both Day 1 and Day 2');
ok(archive[0].date === '2026-10-02', 'Archive ordered newest date first');

// Performance calculation
console.log('\n[Test 4] Performance Outcome Evaluation...');
const liveMap = {
  HDL: { symbol: 'HDL', ltp: 1350 }, // Gained from 1293 to 1350
  AKJCL: { symbol: 'AKJCL', ltp: 335 } // Dropped from 356 to 335
};

const perfDay1 = calculateArchivePerformance(snap1, liveMap);
const hdlPerf = perfDay1.accumulationTrack.find(s => s.symbol === 'HDL');
ok(hdlPerf.returnPct > 0, `HDL return positive (+${hdlPerf.returnPct}%)`);
ok(hdlPerf.isProfitable === true, 'HDL marked as profitable');

const akjclPerf = perfDay1.distributionTrack.find(s => s.symbol === 'AKJCL');
ok(akjclPerf.dropPct > 0, `AKJCL drop detected (+${akjclPerf.dropPct}% loss avoided)`);
ok(akjclPerf.dumpConfirmed === true, 'AKJCL dump confirmed');

// Test 5: Wash-trading and Circuit Ceiling Proximity Guard
console.log('\n[Test 5] Wash-Trading and +15% Circuit Ceiling Guards...');
const testStocks5 = [
  // Normal clean accumulation stock
  { symbol: 'CLEAN1', companyName: 'Clean Acc Ltd', ltp: 500, prevClose: 498, pChange: 0.4, turnover: 10000000, volume: 20000 },
  // Wash-trading stock (heavy gross volume but dual-sided churning)
  { symbol: 'WASH1', companyName: 'Wash Trade Ltd', ltp: 300, prevClose: 300, pChange: 0.0, turnover: 25000000, volume: 50000 },
  // Upper circuit trap stock (+14.2% up near +15% ceiling)
  { symbol: 'CIRC1', companyName: 'Circuit Trap Ltd', ltp: 114.2, prevClose: 100, pChange: 14.2, turnover: 30000000, volume: 100000 }
];

const testFloorsheet5 = [
  // CLEAN1: Broker 58 buys 5,000, seller 12 sells 5,000 (clean net accumulation)
  { stockSymbol: 'CLEAN1', buyer: '58', seller: '12', quantity: 5000, rate: 500, amount: 2500000, businessDate: '2026-10-05' },
  // WASH1: Broker 45 buys 10,000 and sells 9,500 (churning/wash trading)
  { stockSymbol: 'WASH1', buyer: '45', seller: '28', quantity: 10000, rate: 300, amount: 3000000, businessDate: '2026-10-05' },
  { stockSymbol: 'WASH1', buyer: '14', seller: '45', quantity: 9500, rate: 300, amount: 2850000, businessDate: '2026-10-05' },
  // CIRC1: Broker 21 buys 8,000 near circuit ceiling
  { stockSymbol: 'CIRC1', buyer: '21', seller: '34', quantity: 8000, rate: 114.2, amount: 913600, businessDate: '2026-10-05' }
];

const snap5 = captureDailyWhaleSnapshot(testStocks5, testFloorsheet5, '2026-10-05');
const hasClean = snap5.topAccumulation.some(s => s.symbol === 'CLEAN1');
const hasWash = snap5.topAccumulation.some(s => s.symbol === 'WASH1');
const hasCirc = snap5.topAccumulation.some(s => s.symbol === 'CIRC1');

ok(hasClean === true, 'CLEAN1 successfully captured in Top Accumulation');
ok(hasWash === false, 'WASH1 successfully filtered out due to dual-sided churn guard');
ok(hasCirc === false, 'CIRC1 successfully filtered out due to +15% upper circuit ceiling guard');

// Test 6: Intraday Entry LTP Preservation
console.log('\n[Test 6] Intraday Entry LTP Preservation...');
// Re-run snapshot on same day with higher afternoon price
const testStocks6Afternoon = [
  { symbol: 'CLEAN1', companyName: 'Clean Acc Ltd', ltp: 507, prevClose: 498, pChange: 1.8, turnover: 15000000, volume: 30000 }
];
const snap6 = captureDailyWhaleSnapshot(testStocks6Afternoon, testFloorsheet5, '2026-10-05');
const clean1Afternoon = snap6.topAccumulation.find(s => s.symbol === 'CLEAN1');
ok(clean1Afternoon !== undefined, 'CLEAN1 present in updated afternoon snapshot');
ok(clean1Afternoon.entryLtp === 500, `CLEAN1 preserved morning entry LTP (500), not overwritten by 507: got ${clean1Afternoon.entryLtp}`);

// Test 7: Turnover Threshold vs Float Disparity Validation (Loophole 3 Fix)
console.log('\n[Test 7] Turnover Threshold vs Float Disparity Validation...');
const testStocks7 = [
  // Commercial bank: Rs. 35 Lakh turnover, low retail concentration (bcr3 = 18%)
  { symbol: 'BIG_BANK', companyName: 'Commercial Bank Ltd', sector: 'Commercial Banks', ltp: 400, prevClose: 400, pChange: 0.0, turnover: 3500000, volume: 8750, listedShares: 200000000 },
  // Micro-cap hydro: Rs. 20 Lakh turnover, massive float turnover (1.0% of float), high concentration (bcr3 = 70%)
  { symbol: 'TINY_HYDRO', companyName: 'Small Hydro Ltd', sector: 'Hydro Power', ltp: 200, prevClose: 200, pChange: 0.5, turnover: 2000000, volume: 10000, listedShares: 3000000 }
];

const testFloorsheet7 = [
  // BIG_BANK: retail fragmented trades across many brokers
  { stockSymbol: 'BIG_BANK', buyer: '1', seller: '2', quantity: 200, rate: 400, amount: 80000, businessDate: '2026-10-06' },
  { stockSymbol: 'BIG_BANK', buyer: '3', seller: '4', quantity: 200, rate: 400, amount: 80000, businessDate: '2026-10-06' },
  { stockSymbol: 'BIG_BANK', buyer: '5', seller: '6', quantity: 200, rate: 400, amount: 80000, businessDate: '2026-10-06' },
  // TINY_HYDRO: Broker 58 aggressively accumulates 7,000 shares out of 10,000
  { stockSymbol: 'TINY_HYDRO', buyer: '58', seller: '12', quantity: 7000, rate: 200, amount: 1400000, businessDate: '2026-10-06' },
  { stockSymbol: 'TINY_HYDRO', buyer: '34', seller: '15', quantity: 3000, rate: 200, amount: 600000, businessDate: '2026-10-06' }
];

const snap7 = captureDailyWhaleSnapshot(testStocks7, testFloorsheet7, '2026-10-06');
const hasBigBank = snap7.topAccumulation.some(s => s.symbol === 'BIG_BANK');
const tinyHydro = snap7.topAccumulation.find(s => s.symbol === 'TINY_HYDRO');

ok(hasBigBank === false, 'BIG_BANK with Rs. 35L retail turnover correctly rejected (no whale concentration & below bank floor)');
ok(tinyHydro !== undefined, 'TINY_HYDRO with Rs. 20L turnover accepted due to high float impact (1% float) and 70% concentration');
ok(tinyHydro?.bcr3Buy >= 70, `TINY_HYDRO verified whale concentration: ${tinyHydro?.bcr3Buy}%`);

// Test 8: Floorsheet Sample Depth & Morning Trade Eviction Protection (Loophole 1 Fix)
console.log('\n[Test 8] Floorsheet Sample Depth & Morning Eviction Protection...');
// Morning run at 11:30 AM: MORN1 accumulated by Broker 45
const morningStocks = [
  { symbol: 'MORN1', companyName: 'Morning Whale Ltd', sector: 'Hydro Power', ltp: 320, prevClose: 318, pChange: 0.6, turnover: 5000000, volume: 15000, listedShares: 8000000 }
];
const morningFloorsheet = [
  { stockSymbol: 'MORN1', buyer: '45', seller: '32', quantity: 12000, rate: 320, amount: 3840000, businessDate: '2026-10-07' }
];
const morningSnap = captureDailyWhaleSnapshot(morningStocks, morningFloorsheet, '2026-10-07');
const morn1InMorning = morningSnap.topAccumulation.find(s => s.symbol === 'MORN1');
ok(morn1InMorning !== undefined, 'MORN1 captured in morning accumulation snapshot');

// Afternoon run at 2:30 PM: Hyperactive trading in other scrips fills the latest floorsheet sample.
// The new incoming floorsheet feed has ZERO trades for MORN1!
const afternoonStocks = [
  { symbol: 'MORN1', companyName: 'Morning Whale Ltd', sector: 'Hydro Power', ltp: 322, prevClose: 318, pChange: 1.25, turnover: 5500000, volume: 16500, listedShares: 8000000 },
  { symbol: 'OTHER1', companyName: 'Other Scrip Ltd', sector: 'Finance', ltp: 210, prevClose: 210, pChange: 0.0, turnover: 4000000, volume: 19000, listedShares: 5000000 }
];
const afternoonFloorsheetOnly = [
  // Only OTHER1 trades in this afternoon batch; MORN1 was pushed out of the 2,000-row sample
  { stockSymbol: 'OTHER1', buyer: '14', seller: '21', quantity: 2000, rate: 210, amount: 420000, businessDate: '2026-10-07' }
];
const afternoonSnap = captureDailyWhaleSnapshot(afternoonStocks, afternoonFloorsheetOnly, '2026-10-07');
const morn1InAfternoon = afternoonSnap.topAccumulation.find(s => s.symbol === 'MORN1');
ok(morn1InAfternoon !== undefined, 'MORN1 preserved in Top Accumulation despite being evicted from afternoon floorsheet feed');
// Test 9: Wyckoff Pause Day Supply Test Volume Contraction Check
console.log('\n[Test 9] Wyckoff Pause Day Supply Test Volume Contraction...');
// Day 1 (2026-10-08): PAUSE1 accumulated with 20,000 shares
const stocksDay8 = [
  { symbol: 'PAUSE1', companyName: 'Pause Scrip Ltd', sector: 'Hydro Power', ltp: 400, prevClose: 400, pChange: 0.5, turnover: 8000000, volume: 20000, listedShares: 6000000 },
  { symbol: 'EXPAND1', companyName: 'Expand Scrip Ltd', sector: 'Hydro Power', ltp: 300, prevClose: 300, pChange: 0.5, turnover: 6000000, volume: 20000, listedShares: 6000000 }
];
const floorsheetDay8 = [
  { stockSymbol: 'PAUSE1', buyer: '58', seller: '12', quantity: 15000, rate: 400, amount: 6000000, businessDate: '2026-10-08' },
  { stockSymbol: 'EXPAND1', buyer: '58', seller: '12', quantity: 15000, rate: 300, amount: 4500000, businessDate: '2026-10-08' }
];
captureDailyWhaleSnapshot(stocksDay8, floorsheetDay8, '2026-10-08');

// Day 2 (2026-10-09): Interim day with other stocks; PAUSE1 & EXPAND1 not active
const stocksDay9 = [
  { symbol: 'OTHER_D9', companyName: 'Other D9 Ltd', sector: 'Finance', ltp: 150, prevClose: 150, pChange: 0.0, turnover: 4000000, volume: 26000, listedShares: 5000000 }
];
const floorsheetDay9 = [
  { stockSymbol: 'OTHER_D9', buyer: '34', seller: '21', quantity: 20000, rate: 150, amount: 3000000, businessDate: '2026-10-09' }
];
captureDailyWhaleSnapshot(stocksDay9, floorsheetDay9, '2026-10-09');

// Day 3 (2026-10-10):
// PAUSE1 volume contracts to 8,000 shares (<= 20,000 * 0.75 = 15,000) -> Wyckoff low volume supply test!
// EXPAND1 volume expands to 22,000 shares (> 20,000 * 0.75) -> Not a pause test contraction.
const stocksDay10 = [
  { symbol: 'PAUSE1', companyName: 'Pause Scrip Ltd', sector: 'Hydro Power', ltp: 401, prevClose: 400, pChange: 0.25, turnover: 3208000, volume: 8000, listedShares: 6000000 },
  { symbol: 'EXPAND1', companyName: 'Expand Scrip Ltd', sector: 'Hydro Power', ltp: 301, prevClose: 300, pChange: 0.33, turnover: 6622000, volume: 22000, listedShares: 6000000 }
];
const floorsheetDay10 = [
  { stockSymbol: 'PAUSE1', buyer: '58', seller: '34', quantity: 6000, rate: 401, amount: 2406000, businessDate: '2026-10-10' },
  { stockSymbol: 'EXPAND1', buyer: '58', seller: '34', quantity: 16000, rate: 301, amount: 4816000, businessDate: '2026-10-10' }
];
const snap10 = captureDailyWhaleSnapshot(stocksDay10, floorsheetDay10, '2026-10-10');
const pauseEntry = snap10.topAccumulation.find(s => s.symbol === 'PAUSE1');
const expandEntry = snap10.topAccumulation.find(s => s.symbol === 'EXPAND1');

ok(pauseEntry !== undefined, 'PAUSE1 captured on Day 3');
ok(pauseEntry?.alertType === 'PAUSE_DAY_DIP', `PAUSE1 correctly detected as PAUSE_DAY_DIP: got ${pauseEntry?.alertType}`);
ok(pauseEntry?.signalBadge.includes('Pause Day Supply Test'), 'PAUSE1 carries Pause Day badge');
ok(expandEntry?.alertType === 'DAY_1', `EXPAND1 with expanding volume not marked as pause day: got ${expandEntry?.alertType}`);

// Test 10: Multi-Desk Syndicate Churn Detection
console.log('\n[Test 10] Multi-Desk Syndicate Churn Detection...');
const testStocks10 = [
  // SYND1: 3 friendly brokers buy 6,000 and sell 5,300 (collective net: +700 sh out of 6,000 = 11.6% net absorption)
  { symbol: 'SYND1', companyName: 'Syndicate Churn Ltd', sector: 'Finance', ltp: 250, prevClose: 250, pChange: 0.0, turnover: 5000000, volume: 15000, listedShares: 5000000 },
  // GENUINE1: Broker 58 buys 6,000 and sells 0 (net absorption 100%)
  { symbol: 'GENUINE1', companyName: 'Genuine Acc Ltd', sector: 'Finance', ltp: 250, prevClose: 250, pChange: 0.0, turnover: 5000000, volume: 15000, listedShares: 5000000 }
];
const testFloorsheet10 = [
  // SYND1: Brokers 58, 45, 34 churning across each other
  { stockSymbol: 'SYND1', buyer: '58', seller: '12', quantity: 2000, rate: 250, amount: 500000, businessDate: '2026-10-11' },
  { stockSymbol: 'SYND1', buyer: '15', seller: '58', quantity: 1800, rate: 250, amount: 450000, businessDate: '2026-10-11' },
  { stockSymbol: 'SYND1', buyer: '45', seller: '16', quantity: 2000, rate: 250, amount: 500000, businessDate: '2026-10-11' },
  { stockSymbol: 'SYND1', buyer: '17', seller: '45', quantity: 1700, rate: 250, amount: 425000, businessDate: '2026-10-11' },
  { stockSymbol: 'SYND1', buyer: '34', seller: '18', quantity: 2000, rate: 250, amount: 500000, businessDate: '2026-10-11' },
  { stockSymbol: 'SYND1', buyer: '19', seller: '34', quantity: 1800, rate: 250, amount: 450000, businessDate: '2026-10-11' },
  // GENUINE1: Broker 58 clean absorption
  { stockSymbol: 'GENUINE1', buyer: '58', seller: '12', quantity: 6000, rate: 250, amount: 1500000, businessDate: '2026-10-11' }
];
const snap10Synd = captureDailyWhaleSnapshot(testStocks10, testFloorsheet10, '2026-10-11');
const hasSynd = snap10Synd.topAccumulation.some(s => s.symbol === 'SYND1');
const hasGenuine = snap10Synd.topAccumulation.some(s => s.symbol === 'GENUINE1');

ok(hasSynd === false, 'SYND1 successfully filtered out due to multi-desk syndicate churn guard');
ok(hasGenuine === true, 'GENUINE1 successfully captured in Top Accumulation');

// Test 11: Block Trade Anomaly & Execution Dispersion Filter
console.log('\n[Test 11] Block Trade Anomaly & Execution Dispersion Filter...');
const testStocks11 = [
  // BLOCK1: 60,000 shares crossed in a single ticket
  { symbol: 'BLOCK1', companyName: 'Block Deal Ltd', sector: 'Hydro Power', ltp: 300, prevClose: 300, pChange: 0.0, turnover: 18000000, volume: 60000, listedShares: 10000000 },
  // DISPERSED1: 60,000 shares accumulated across multiple trades
  { symbol: 'DISPERSED1', companyName: 'Dispersed Acc Ltd', sector: 'Hydro Power', ltp: 300, prevClose: 300, pChange: 0.0, turnover: 18000000, volume: 60000, listedShares: 10000000 }
];
const testFloorsheet11 = [
  // BLOCK1: 1 single massive transaction of 60,000 shares
  { stockSymbol: 'BLOCK1', buyer: '58', seller: '45', quantity: 60000, rate: 300, amount: 18000000, businessDate: '2026-10-12' },
  // DISPERSED1: 5 distinct trades
  { stockSymbol: 'DISPERSED1', buyer: '58', seller: '12', quantity: 15000, rate: 300, amount: 4500000, businessDate: '2026-10-12' },
  { stockSymbol: 'DISPERSED1', buyer: '58', seller: '14', quantity: 15000, rate: 300, amount: 4500000, businessDate: '2026-10-12' },
  { stockSymbol: 'DISPERSED1', buyer: '58', seller: '16', quantity: 15000, rate: 300, amount: 4500000, businessDate: '2026-10-12' },
  { stockSymbol: 'DISPERSED1', buyer: '58', seller: '18', quantity: 15000, rate: 300, amount: 4500000, businessDate: '2026-10-12' }
];
const snap11 = captureDailyWhaleSnapshot(testStocks11, testFloorsheet11, '2026-10-12');
const hasBlock = snap11.topAccumulation.some(s => s.symbol === 'BLOCK1');
const hasDispersed = snap11.topAccumulation.some(s => s.symbol === 'DISPERSED1');

ok(hasBlock === false, 'BLOCK1 rejected from Top Accumulation due to single-ticket block trade anomaly');
ok(hasDispersed === true, 'DISPERSED1 accepted with continuous retail float absorption');

// Test 12: Intraday Upper Shadow Dump Rejection
console.log('\n[Test 12] Intraday Upper Shadow Dump Rejection...');
const testStocks12 = [
  // WICK1: Closed +0.4% (tight closing price), but pumped to 545 (+9.0%) and dumped into close
  {
    symbol: 'WICK1',
    companyName: 'Upper Wick Dump Ltd',
    sector: 'Hydro Power',
    ltp: 502,
    prevClose: 500,
    open: 500,
    high: 545,
    low: 495,
    pChange: 0.4,
    turnover: 12000000,
    volume: 24000,
    listedShares: 8000000
  }
];
const testFloorsheet12 = [
  // Broker 34 dumped 18,000 shares from high to low
  { stockSymbol: 'WICK1', buyer: '12', seller: '34', quantity: 18000, rate: 502, amount: 9036000, businessDate: '2026-10-13' }
];
const snap12 = captureDailyWhaleSnapshot(testStocks12, testFloorsheet12, '2026-10-13');
const hasWickAcc = snap12.topAccumulation.some(s => s.symbol === 'WICK1');
const wickDist = snap12.topDistribution.find(s => s.symbol === 'WICK1');

ok(hasWickAcc === false, 'WICK1 with 86% upper shadow rejected from Top Accumulation');
ok(wickDist !== undefined, 'WICK1 flagged in Top Distribution as failed pump / upper shadow distribution');

// Test 13: JSON Export and Import / Restore
console.log('\n[Test 13] Whale Archive JSON Export and Import / Restore...');
const exportedJSON = exportWhaleArchiveJSON();
ok(typeof exportedJSON === 'string' && exportedJSON.length > 50, 'Exported valid JSON archive string');

const preCount = getStoredWhaleArchive().length;
ok(preCount > 0, `Pre-backup archive has ${preCount} snapshots`);

// Clear storage
localStorage.clear();
ok(getStoredWhaleArchive().length === 0, 'Archive emptied on clear');

// Restore from backup JSON
const importResult = importWhaleArchiveJSON(exportedJSON);
ok(importResult.success === true, 'Import succeeded');
ok(importResult.count === preCount, `Import restored exact count of ${preCount} snapshots`);
ok(getStoredWhaleArchive().length === preCount, 'Storage repopulated properly');

// Invalid import test
const invalidResult = importWhaleArchiveJSON('{ "bad": "data" }');
ok(invalidResult.success === false, 'Invalid JSON format rejected safely');

console.log(`\n========================================`);
console.log(`K-BATCH RESULTS: ${pass} PASSED, ${fail} FAILED`);
console.log(`========================================\n`);

if (fail > 0) process.exit(1);

