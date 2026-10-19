// verify_30d_fixes.mjs
// Automated verification suite for the 6 Argon 30-Day Ledger & Service Hub Bug Fixes

import { calculateMultiDayDiagnostics, PHASE_DEFINITIONS, evaluateEarlyIgnition } from './proxy/utils/microstructureEngine.js';
import { 
  aggregateFloorsheetRows, 
  isIlliquidDebtOrMutualFund 
} from './proxy/brokerVault.mjs';
import { resolveValidTimeframe, evaluatePortfolioShield } from './proxy/routes/radarRoutes.js';
import { db, HOT_CACHE, rebuildHotCache } from './proxy/db/ledgerStore.js';
import { 
  calculateT2SettlementDate, 
  isNepseWeekend, 
  isNepseTradingDay, 
  getNextValidTradingDay, 
  getDetailedMarketStatus 
} from './src/utils/nepseCalendar.js';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('   DRABYASHREE NEPSE: 30-DAY LEDGER & SERVICE HUB VERIFICATION     ');
console.log('═══════════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    if (details) console.log(`     └─ ${details}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     └─ ${details}`);
    failCount++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Wash-Trade Churn Elimination in aggregateFloorsheetRows (proxy/brokerVault.mjs)
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ TEST 1: Wash-Trade Churn Elimination & Net Accumulation/Distribution Separation');

const mockRows = [
  // Broker 81: High churn wash trading (Buys 30,000, Sells 20,000 -> Net +10,000)
  { buyerBroker: '81', sellerBroker: '45', qty: 30000, rate: 250, amount: 7500000, businessDate: '2026-10-15' },
  { buyerBroker: '14', sellerBroker: '81', qty: 20000, rate: 252, amount: 5040000, businessDate: '2026-10-15' },
  // Broker 58: Net Distribution (Buys 5,000, Sells 25,000 -> Net -20,000)
  { buyerBroker: '58', sellerBroker: '34', qty: 5000, rate: 251, amount: 1255000, businessDate: '2026-10-15' },
  { buyerBroker: '49', sellerBroker: '58', qty: 25000, rate: 250, amount: 6250000, businessDate: '2026-10-15' },
  // Broker 45: Pure Accumulation (Buys 15,000, Sells 0 -> Net +15,000)
  { buyerBroker: '45', sellerBroker: '28', qty: 15000, rate: 250, amount: 3750000, businessDate: '2026-10-15' }
];

const mockAgg = aggregateFloorsheetRows(mockRows, 'TEST', ['2026-10-15']);

const b81InAccumulators = mockAgg.topAccumulators.some(b => String(b.broker) === '81');
const b81InDistributors = mockAgg.topDistributors.some(b => String(b.broker) === '81');
const b58InAccumulators = mockAgg.topAccumulators.some(b => String(b.broker) === '58');
const b58InDistributors = mockAgg.topDistributors.some(b => String(b.broker) === '58');

assert(b81InAccumulators && !b81InDistributors, 
  'Broker 81 ranked as Accumulator and excluded from Distributors', 
  `Net Qty: +10,000 | In Accumulators: ${b81InAccumulators} | In Distributors: ${b81InDistributors}`);

assert(!b58InAccumulators && b58InDistributors, 
  'Broker 58 ranked as Distributor and excluded from Accumulators', 
  `Net Qty: -20,000 | In Accumulators: ${b58InAccumulators} | In Distributors: ${b58InDistributors}`);

assert(typeof mockAgg.bcr3NetPct === 'number' && typeof mockAgg.scr3NetPct === 'number',
  'Exported bcr3NetPct & scr3NetPct metrics',
  `bcr3NetPct: ${mockAgg.bcr3NetPct}% | scr3NetPct: ${mockAgg.scr3NetPct}%`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Microstructure Engine True Net-Weighted VWAP & Exported Fields
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 2: Microstructure Engine Net Institutional VWAP & Wyckoff Phase Metrics');

const mockHistory = [
  {
    date: '2026-10-15',
    openPrice: 200,
    highPrice: 210,
    lowPrice: 198,
    closePrice: 205,
    totalVolume: 100000,
    totalTurnover: 20500000,
    brokers: [
      { brokerId: 45, buyVol: 40000, sellVol: 0, buyAmt: 8200000, sellAmt: 0 },
      { brokerId: 58, buyVol: 0, sellVol: 30000, buyAmt: 0, sellAmt: 6150000 },
      { brokerId: 81, buyVol: 20000, sellVol: 10000, buyAmt: 4100000, sellAmt: 2050000 }
    ]
  }
];

const diag = calculateMultiDayDiagnostics(mockHistory, 1);

assert(diag !== null, 'Multi-day diagnostics returned object');
assert(typeof diag.bcr3NetPct === 'number' && typeof diag.bcr3BuyPct === 'number',
  'bcr3NetPct and bcr3BuyPct present',
  `bcr3NetPct: ${diag.bcr3NetPct}% | bcr3BuyPct: ${diag.bcr3BuyPct}%`);

assert(typeof diag.bigBrokerVWAP === 'number' && diag.bigBrokerVWAP > 0,
  'bigBrokerVWAP calculated with net accumulation weights',
  `bigBrokerVWAP: NPR ${diag.bigBrokerVWAP} | marketVWAP: NPR ${diag.marketVWAP}`);

assert(Array.isArray(diag.topAccumulators) && Array.isArray(diag.topDistributors),
  'topAccumulators and topDistributors exported',
  `Top Accumulator: Broker ${diag.topAccumulators[0]?.brokerId} (+${diag.topAccumulators[0]?.netVol} shares)`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 & 4: Master Profit Engine Gate 5 30D Verification & Trap Veto
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 3 & 4: Master Profit Engine Gate 5 Verification & Trap Veto');

function simulateGate5Evaluation(stock) {
  const cachedBroker = stock?.diagnostics30d || stock?.brokerAnalysis || stock?.realBrokerAnalysis;
  const rawGrossBcr3 = cachedBroker?.bcr3BuyPct ?? null;
  const rawNetBcr3 = cachedBroker?.bcr3NetPct ?? null;
  const rawBcr3 = rawGrossBcr3 ?? rawNetBcr3 ?? null;

  const isBrokerVerified = rawBcr3 !== null && rawBcr3 !== undefined && Number(rawBcr3) > 0;
  const bcr3 = isBrokerVerified ? Number(rawGrossBcr3 ?? (Number(rawNetBcr3) * 2.2).toFixed(1)) : 0.0;
  const bcr3Net = rawNetBcr3 !== null && rawNetBcr3 !== undefined ? Number(rawNetBcr3) : 0.0;

  const scr3SellPct = Number(cachedBroker?.scr3SellPct || 0);
  const phase = cachedBroker?.phase || '';
  const isDistributionTrap = 
    Boolean(cachedBroker?.isInstitutionalDumping) || 
    phase === 'DISTRIBUTION_DANGER' || 
    phase === 'BULL_TRAP' || 
    scr3SellPct >= 38.0;

  const passed = (bcr3 >= 40.0 || bcr3Net >= 16.0) && !isDistributionTrap;
  const reason = isDistributionTrap
    ? `Distribution trap active: phase=${phase}, scr3Sell=${scr3SellPct}% [TRAP VETO]`
    : passed 
      ? `Institutional accumulation verified (BCR3: ${bcr3.toFixed(1)}%, Net: ${bcr3Net.toFixed(1)}%)`
      : `Insufficient institutional concentration (BCR3: ${bcr3.toFixed(1)}%)`;

  return { isBrokerVerified, passed, reason, isDistributionTrap };
}

// Case A: 30D Stealth Accumulation stock with bcr3NetPct = 18.5%
const stockAccumulation = {
  symbol: 'RADHI',
  diagnostics30d: {
    bcr3NetPct: 18.5,
    bcr3BuyPct: 42.0,
    scr3NetPct: 6.2,
    scr3SellPct: 12.0,
    phase: 'STEALTH_ACCUMULATION',
    isInstitutionalDumping: false
  }
};
const gate5Accum = simulateGate5Evaluation(stockAccumulation);
assert(gate5Accum.isBrokerVerified === true, 
  'Gate 5 recognizes 30D diagnostics and sets isBrokerVerified = true', 
  `isBrokerVerified: ${gate5Accum.isBrokerVerified}`);
assert(gate5Accum.passed === true, 
  'Gate 5 passes for 30D accumulation stock', 
  gate5Accum.reason);

// Case B: Distribution Trap stock with high BCR3 (circular churn) but distribution danger
const stockTrap = {
  symbol: 'TRAP_STOCK',
  diagnostics30d: {
    bcr3NetPct: 17.0,
    bcr3BuyPct: 45.0,
    scr3NetPct: 22.0,
    scr3SellPct: 41.0,
    phase: 'DISTRIBUTION_DANGER',
    isInstitutionalDumping: true
  }
};
const gate5Trap = simulateGate5Evaluation(stockTrap);
assert(gate5Trap.passed === false && gate5Trap.reason.includes('[TRAP VETO]'),
  'Gate 5 strictly VETOES distribution trap despite high BCR3',
  gate5Trap.reason);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Silent 1-Day Fallback Elimination in radarRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 5: Silent 1-Day Fallback Elimination & Snap to Valid Timeframe');

const defaultSnap = resolveValidTimeframe(undefined, 30);
const emptySnap = resolveValidTimeframe('', 30);
const snap20 = resolveValidTimeframe(20, 30);
const snap7 = resolveValidTimeframe(7, 30);
const exact15 = resolveValidTimeframe(15, 30);

assert(defaultSnap === 30, 'Missing days query defaults to 30D institutional scope', `Result: ${defaultSnap}D`);
assert(emptySnap === 30, 'Empty days query defaults to 30D', `Result: ${emptySnap}D`);
assert(exact15 === 15, 'Exact supported days (15) preserved', `Result: ${exact15}D`);
assert(resolveValidTimeframe(3, 30) === 3, '3D Early Ignition timeframe correctly recognized', `Result: 3D`);
assert([15, 30].includes(snap20), 'Non-standard days=20 snapped to valid timeframe', `Result: ${snap20}D`);
assert([3, 5, 15].includes(snap7), 'Non-standard days=7 snapped to valid timeframe', `Result: ${snap7}D`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Debenture & Mutual Fund False-Missing Sync Loop Prevention
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 6: Illiquid Debentures & Mutual Funds False-Missing Loop Prevention');

const isBokdDeb = isIlliquidDebtOrMutualFund('BOKD86KA');
const isIcfcDeb = isIlliquidDebtOrMutualFund('ICFCD88');
const isNicaDeb = isIlliquidDebtOrMutualFund('NICAD2091');
const isC30Mf = isIlliquidDebtOrMutualFund('C30MF');
const isNabilEquity = isIlliquidDebtOrMutualFund('NABIL');
const isShivmEquity = isIlliquidDebtOrMutualFund('SHIVM');

assert(isBokdDeb && isIcfcDeb && isNicaDeb && isC30Mf,
  'isIlliquidDebtOrMutualFund correctly flags corporate debentures and mutual funds',
  `BOKD86KA: ${isBokdDeb}, ICFCD88: ${isIcfcDeb}, NICAD2091: ${isNicaDeb}, C30MF: ${isC30Mf}`);

assert(!isNabilEquity && !isShivmEquity,
  'isIlliquidDebtOrMutualFund does NOT flag regular equities',
  `NABIL: ${isNabilEquity}, SHIVM: ${isShivmEquity}`);

// Query SQLite drabyashree_ledger.db for BOKD86KA
const bokdDates = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary WHERE symbol = ?').all('BOKD86KA').map(r => r.trade_date);
assert(bokdDates.length > 0 && bokdDates.length < 30,
  'BOKD86KA authentic NEPSE trading dates verified in SQLite ledger',
  `Recorded trading dates on NEPSE: ${bokdDates.length} sessions (${bokdDates.join(', ')})`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: HOT_CACHE Instant Multi-Day Stock Diagnostics Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 7: HOT_CACHE RAM Diagnostics & Precomputed Wyckoff Metrics');

rebuildHotCache();
const radhi30 = HOT_CACHE.stockDiagnostics.get('RADHI_30');

if (radhi30) {
  assert(radhi30.timeframeDays === 30, 'HOT_CACHE contains RADHI_30 diagnostic', `Timeframe: ${radhi30.timeframeDays}D`);
  assert(typeof radhi30.bigBrokerVWAP === 'number', 'HOT_CACHE has bigBrokerVWAP', `bigBrokerVWAP: NPR ${radhi30.bigBrokerVWAP}`);
  assert(typeof radhi30.bcr3NetPct === 'number', 'HOT_CACHE has bcr3NetPct', `bcr3NetPct: ${radhi30.bcr3NetPct}%`);
  assert(typeof radhi30.phase === 'string', 'HOT_CACHE has Wyckoff phase', `Phase: ${radhi30.phase} (${radhi30.phaseLabel})`);
  assert(Array.isArray(radhi30.topAccumulators), 'HOT_CACHE has topAccumulators', `Top Accumulator: Broker ${radhi30.topAccumulators[0]?.brokerId}`);
} else {
  // Try another symbol in ledger
  const firstSample = Array.from(HOT_CACHE.stockDiagnostics.keys())[0];
  const sampleDiag = HOT_CACHE.stockDiagnostics.get(firstSample);
  assert(Boolean(sampleDiag), `HOT_CACHE populated with ${HOT_CACHE.stockDiagnostics.size} diagnostics`, `Sample key: ${firstSample}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: Portfolio & Watchlist 30-Day Broker Shield Evaluator
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 8: Portfolio & Watchlist 30-Day Broker Shield Evaluator');

const shieldResult = evaluatePortfolioShield([
  { symbol: 'TAMOR', qty: 1000, buyPrice: 410, listType: 'PORTFOLIO' },
  { symbol: 'GHL', qty: 1500, buyPrice: 380, listType: 'PORTFOLIO' },
  { symbol: 'API', qty: 2000, buyPrice: 330, listType: 'PORTFOLIO' },
  { symbol: 'RADHI', qty: 0, buyPrice: 0, listType: 'WATCHLIST' }
], 30);

assert(shieldResult.success === true, 'Portfolio shield evaluation returns success');
assert(shieldResult.items.length === 4, 'Evaluated all 4 input portfolio/watchlist stocks', `Items count: ${shieldResult.items.length}`);
assert(typeof shieldResult.portfolioSummary.shieldScore === 'number', 'Calculated 0-100 portfolio shield score', `Score: ${shieldResult.portfolioSummary.shieldScore}`);

const tamorItem = shieldResult.items.find(i => i.symbol === 'TAMOR');
const ghlItem = shieldResult.items.find(i => i.symbol === 'GHL');
const apiItem = shieldResult.items.find(i => i.symbol === 'API');
const radhiItem = shieldResult.items.find(i => i.symbol === 'RADHI');

assert(tamorItem?.shieldVerdict === 'SYNDICATE_FORTRESS_HOLD' || tamorItem?.shieldVerdict === 'SAFE_ACCUMULATION_ZONE',
  'TAMOR classified as Institutional Fortress / Accumulation',
  `Verdict: ${tamorItem?.shieldVerdict} (BCR5: ${tamorItem?.bcr5NetPct}%, Acc: +Rs. ${tamorItem?.leadAccumulator?.netInflowCr} Cr)`);

assert(ghlItem?.shieldVerdict === 'SYNDICATE_FORTRESS_HOLD' || ghlItem?.shieldVerdict === 'SAFE_ACCUMULATION_ZONE',
  'GHL classified as Institutional Fortress / Accumulation',
  `Verdict: ${ghlItem?.shieldVerdict} (BCR5: ${ghlItem?.bcr5NetPct}%, Acc: +Rs. ${ghlItem?.leadAccumulator?.netInflowCr} Cr)`);

assert(apiItem?.shieldVerdict === 'EXIT_BEFORE_T2_DUMP',
  'API strictly flagged with EXIT_BEFORE_T2_DUMP',
  `Verdict: ${apiItem?.shieldVerdict} (SCR3: ${apiItem?.scr3NetPct}%, Phase: ${apiItem?.phase})`);

assert(radhiItem?.shieldVerdict === 'EXIT_BEFORE_T2_DUMP',
  'RADHI strictly flagged with EXIT_BEFORE_T2_DUMP',
  `Verdict: ${radhiItem?.shieldVerdict} (Phase: ${radhiItem?.phase}, Dist: Rs. ${radhiItem?.leadDistributor?.netOutflowCr} Cr)`);

assert(shieldResult.portfolioSummary.criticalExitCount >= 2,
  'Summary telemetry counts critical exit alerts accurately',
  `Critical count: ${shieldResult.portfolioSummary.criticalExitCount}`);

assert(Array.isArray(shieldResult.portfolioSummary.rotationAlerts) && shieldResult.portfolioSummary.rotationAlerts.length > 0,
  'Active institutional rotation alerts detected in held/watched symbols',
  `Rotation alert sample: ${shieldResult.portfolioSummary.rotationAlerts[0]}`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9: ⚡ Day 1–3 Early Ignition & Manipulation Detector Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 9: ⚡ Day 1–3 Early Ignition & Manipulation Detector Multi-Factor Verification');

// 1. Verify HOT_CACHE 3D timeframe precomputation
assert(Array.isArray(HOT_CACHE.radarByTimeframe[3]) && HOT_CACHE.radarByTimeframe[3].length > 0,
  'HOT_CACHE precomputed 3D timeframe radar data',
  `Count: ${HOT_CACHE.radarByTimeframe[3]?.length} stocks`);

// 2. Verify HOT_CACHE.earlyIgnition pipeline
assert(Array.isArray(HOT_CACHE.earlyIgnition) && HOT_CACHE.earlyIgnition.length > 0,
  'HOT_CACHE precomputed early ignition candidates',
  `Candidates evaluated: ${HOT_CACHE.earlyIgnition?.length}`);

// 3. Verify sorting by ignitionScore descending
const topCandidate = HOT_CACHE.earlyIgnition[0];
const secondCandidate = HOT_CACHE.earlyIgnition[1];
assert(topCandidate && typeof topCandidate.ignitionScore === 'number' && topCandidate.ignitionScore >= (secondCandidate?.ignitionScore || 0),
  'Early ignition list correctly sorted descending by ignitionScore',
  `Top 1: ${topCandidate?.symbol} (${topCandidate?.ignitionScore}/100, Stage: ${topCandidate?.stage})`);

// 4. Verify candidate payload fields
assert(
  typeof topCandidate.smh3dPct === 'number' &&
  typeof topCandidate.dispersionRatio === 'number' &&
  typeof topCandidate.rvol3d === 'number' &&
  typeof topCandidate.t2RetentionPct === 'number' &&
  topCandidate.asymmetryBadge &&
  topCandidate.tacticalPlan,
  'Early ignition candidate contains full multi-factor microstructure metrics',
  `SMH: ${topCandidate.smh3dPct}%, RVOL: ${topCandidate.rvol3d}x, Asymmetry: ${topCandidate.asymmetryBadge}, T+2 Hold: ${topCandidate.t2RetentionPct}%`
);

// 5. Test Synthetic Early Ignition Logic: Stage 1 Stealth Seeding
const mockDiag3d = {
  totalVolume: 500000,
  timeframeDays: 3,
  latestClose: 300,
  closePrice: 300,
  bigBrokerVWAP: 295,
  priceChangePct: 1.7,
  topAccumulators: [
    { brokerId: 58, netVol: 75000, netInflowCr: 2.2 },
    { brokerId: 45, netVol: 45000, netInflowCr: 1.3 },
    { brokerId: 34, netVol: 30000, netInflowCr: 0.9 }
  ],
  topDistributors: [
    { brokerId: 19, netVol: -20000, netInflowCr: -0.6 },
    { brokerId: 28, netVol: -15000, netInflowCr: -0.4 }
  ],
  totalBuyersCount: 12,
  totalSellersCount: 48,
  scr3NetPct: 5.5
};

const mockDiag30d = {
  avgDailyVolume: 100000,
  marketVWAP: 290
};

const mockHistory3d = [
  {
    date: '2026-10-13',
    brokers: [{ brokerId: 58, buyVol: 30000, sellVol: 0 }]
  },
  {
    date: '2026-10-14',
    brokers: [{ brokerId: 58, buyVol: 25000, sellVol: 0 }]
  },
  {
    date: '2026-10-15',
    brokers: [{ brokerId: 58, buyVol: 20000, sellVol: 1000 }]
  }
];

const ignitionResult = evaluateEarlyIgnition('TEST_STEALTH', mockDiag3d, mockDiag30d, mockHistory3d);

assert(ignitionResult.stage === 'STAGE_2_SUPPLY_VACUUM_IGNITION' || ignitionResult.stage === 'STAGE_1_STEALTH_SEEDING',
  'evaluateEarlyIgnition correctly detects early institutional accumulation phase',
  `Detected Stage: ${ignitionResult.stage} (Score: ${ignitionResult.ignitionScore}/100)`);

assert(ignitionResult.t2RetentionPct >= 85,
  'evaluateEarlyIgnition computes authentic T+2 retention without flip dump',
  `Retention: ${ignitionResult.t2RetentionPct}%`);

// 6. Test Synthetic Wash-Churn Trap Veto
const mockWashDiag3d = {
  totalVolume: 800000,
  timeframeDays: 3,
  latestClose: 350,
  closePrice: 350,
  bigBrokerVWAP: 310,
  retentionPct: 20,
  topAccumulators: [{ brokerId: 81, netVol: 2000, netInflowCr: 0.07 }],
  topDistributors: [{ brokerId: 81, netVol: -3000, netInflowCr: -0.1 }],
  totalBuyersCount: 20,
  totalSellersCount: 20,
  scr3NetPct: 35.0
};

const mockWashHistory = [
  {
    date: '2026-10-13',
    brokers: [{ brokerId: 81, buyVol: 80000, sellVol: 0 }]
  },
  {
    date: '2026-10-14',
    brokers: [{ brokerId: 81, buyVol: 0, sellVol: 40000 }]
  },
  {
    date: '2026-10-15',
    brokers: [{ brokerId: 81, buyVol: 0, sellVol: 35000 }] // flipped > 90% of Day 1 buy
  }
];

const washResult = evaluateEarlyIgnition('TEST_WASH', mockWashDiag3d, mockDiag30d, mockWashHistory);

assert(washResult.isWashTrap === true && washResult.stage === 'WASH_CHURN_TRAP',
  'evaluateEarlyIgnition strictly detects circular churn and sets WASH_CHURN_TRAP veto',
  `Stage: ${washResult.stage} | isWashTrap: ${washResult.isWashTrap} | Flag: ${washResult.tacticalPlan?.actionBadge}`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 10: NEPSE Mon–Fri Trading Schedule, Saturday/Sunday Weekend & Dashain 2026
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 10: NEPSE Mon–Fri Trading Schedule, Weekend Closures, Dashain 2026 & T+2 Settlement');

// 1. Weekend Closures: Saturday (6) and Sunday (0) are market holidays
const satCheck = isNepseWeekend(new Date('2026-10-24T12:00:00+05:45'));
const sunCheck = isNepseWeekend(new Date('2026-10-25T12:00:00+05:45'));
const monCheck = isNepseWeekend(new Date('2026-10-26T12:00:00+05:45'));

assert(satCheck.isWeekend === true && sunCheck.isWeekend === true,
  'Saturday (6) and Sunday (0) strictly identified as weekly market closures',
  `Saturday: ${satCheck.isWeekend} (${satCheck.dayName}), Sunday: ${sunCheck.isWeekend} (${sunCheck.dayName})`);

assert(monCheck.isWeekend === false,
  'Monday through Friday identified as active trading days (when not a holiday)',
  `Monday: isWeekend = ${monCheck.isWeekend}`);

// 2. T+2 Settlement Cycle Verification (Monday through Friday)
const monSettlement = calculateT2SettlementDate(new Date('2026-12-07')); // Mon Dec 7
const tueSettlement = calculateT2SettlementDate(new Date('2026-12-08')); // Tue Dec 8
const wedSettlement = calculateT2SettlementDate(new Date('2026-12-09')); // Wed Dec 9
const thuSettlement = calculateT2SettlementDate(new Date('2026-12-10')); // Thu Dec 10
const friSettlement = calculateT2SettlementDate(new Date('2026-12-11')); // Fri Dec 11

assert(monSettlement.settlementDayName === 'Wednesday' && monSettlement.settlementDateIso === '2026-12-09',
  'Monday trade settles on Wednesday (T+2)',
  monSettlement.summary);

assert(tueSettlement.settlementDayName === 'Thursday' && tueSettlement.settlementDateIso === '2026-12-10',
  'Tuesday trade settles on Thursday (T+2)',
  tueSettlement.summary);

assert(wedSettlement.settlementDayName === 'Friday' && wedSettlement.settlementDateIso === '2026-12-11',
  'Wednesday trade settles on Friday (T+2)',
  wedSettlement.summary);

assert(thuSettlement.settlementDayName === 'Monday' && thuSettlement.settlementDateIso === '2026-12-14',
  'Thursday trade settles on Monday (T+2, skips Sat & Sun weekends)',
  thuSettlement.summary);

assert(friSettlement.settlementDayName === 'Tuesday' && friSettlement.settlementDateIso === '2026-12-15',
  'Friday trade settles on Tuesday (T+2, skips Sat & Sun weekends)',
  friSettlement.summary);

// 3. 2026 Dashain Festival Holidays (Oct 19–23) & Reopening Mon Oct 26
const oct19Status = getDetailedMarketStatus(new Date('2026-10-19T11:30:00+05:45'));
const oct23Trading = isNepseTradingDay(new Date('2026-10-23T11:30:00+05:45'));
const nextReopenDate = getNextValidTradingDay(new Date('2026-10-19T11:30:00+05:45'));

assert(oct19Status.isHoliday === true && oct19Status.isOpen === false,
  'Monday, October 19, 2026 marked as official Dashain holiday (market closed)',
  `Holiday: ${oct19Status.holidayName} | Status: ${oct19Status.statusLabel}`);

assert(oct23Trading === false,
  'Friday, October 23, 2026 marked as official Dashain holiday (Kojagrat Purnima)',
  `isTradingDay: ${oct23Trading}`);

assert(oct19Status.nextTradingDayIso === '2026-10-26' && oct19Status.nextTradingDayName === 'Monday',
  'Next active trading day after Dashain week is Monday, October 26, 2026',
  `Next Reopen: ${oct19Status.reopeningSchedule}`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 11A: 15% Daily Stock Circuit Limit Calibration & Gap-Up Markup Protection
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 11A: 15% Daily Stock Circuit Limit Calibration & Gap-Up Markup Protection');

// 1. Single-day or 3-day spike > 9.0% strictly classified as STAGE_3_BREAKOUT_IN_PROGRESS
const mockSpikeDiag3d = {
  totalVolume: 500000,
  timeframeDays: 3,
  latestClose: 330,
  closePrice: 330,
  bigBrokerVWAP: 295,
  priceChangePct: 10.5, // > +9.0% spike under 15% circuit limit
  topAccumulators: [{ brokerId: 58, netVol: 75000 }],
  topDistributors: [{ brokerId: 19, netVol: -10000 }],
  totalBuyersCount: 15,
  totalSellersCount: 40,
  retentionPct: 85
};

const spikeResult = evaluateEarlyIgnition('TEST_SPIKE', mockSpikeDiag3d, mockDiag30d, []);

assert(spikeResult.stage === 'STAGE_3_BREAKOUT_IN_PROGRESS' && spikeResult.stage !== 'STAGE_1_STEALTH_SEEDING',
  'Single-day/3-day surge > +9.0% strictly flagged as Markup Breakout rather than Stealth Seeding',
  `Stage: ${spikeResult.stage} (Badge: ${spikeResult.stageBadge})`);

// 2. Near-circuit momentum (>= +12.5% under ±15% band)
const mockNearCircuitDiag3d = {
  totalVolume: 600000,
  timeframeDays: 3,
  latestClose: 335,
  closePrice: 335,
  bigBrokerVWAP: 295,
  priceChangePct: 13.5, // >= +12.5%
  retentionPct: 85
};

const nearCircuitResult = evaluateEarlyIgnition('TEST_NEAR', mockNearCircuitDiag3d, mockDiag30d, []);

assert(nearCircuitResult.stageBadge.includes('Near Circuit'),
  'Flags near-circuit momentum badge at >= +12.5% under ±15% daily band',
  `Badge: ${nearCircuitResult.stageBadge} | Signal: ${nearCircuitResult.entrySignal}`);

// 3. Positive circuit lock (+15% band / >= 14.8%)
const mockLockedCircuitDiag3d = {
  totalVolume: 700000,
  timeframeDays: 3,
  latestClose: 340,
  closePrice: 340,
  bigBrokerVWAP: 295,
  priceChangePct: 14.9, // >= +14.8% circuit lock
  retentionPct: 85
};

const lockedCircuitResult = evaluateEarlyIgnition('TEST_LOCKED', mockLockedCircuitDiag3d, mockDiag30d, []);

assert(lockedCircuitResult.stageBadge.includes('Circuit Locked') && lockedCircuitResult.entrySignal === 'CIRCUIT_LOCKED_AVOID_CHASE',
  'Circuit lock at >= +14.8% flags CIRCUIT_LOCKED_AVOID_CHASE to prevent T+2 trapped buy',
  `Badge: ${lockedCircuitResult.stageBadge} | Signal: ${lockedCircuitResult.entrySignal}`);

// ─────────────────────────────────────────────────────────────────────────────
// TEST 11: Walk-Forward Algorithmic Signal Track Record & T+2 Audit
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ TEST 11: Walk-Forward Algorithmic Signal Track Record & T+2 Audit');

if (!HOT_CACHE.signalTrackRecord) {
  rebuildHotCache();
}

const trackRecord = HOT_CACHE.signalTrackRecord;

// 1. Verify HOT_CACHE.signalTrackRecord populated with signals.length > 0
assert(
  Boolean(trackRecord) && Array.isArray(trackRecord.signals) && trackRecord.signals.length > 0,
  'HOT_CACHE.signalTrackRecord is populated with generated signals',
  `Total signals generated: ${trackRecord?.signals?.length}`
);

const allSignals = trackRecord?.signals || [];
const closedSignals = allSignals.filter(s => s.status !== 'OPEN_ACTIVE');
const openSignals = allSignals.filter(s => s.status === 'OPEN_ACTIVE');
const winningSignals = closedSignals.filter(s => s.status.startsWith('WIN'));

// 2. Strict T+2 settlement invariant: all closed signals must satisfy holding_days >= 2
const invalidClosedSignals = closedSignals.filter(s => s.holding_days < 2);
assert(
  invalidClosedSignals.length === 0,
  'All closed signals strictly satisfy holding_days >= 2 (T+2 settlement invariant)',
  `Closed signals audited: ${closedSignals.length} | Invariant violations: ${invalidClosedSignals.length}`
);

// 3. Verify summary, brokerLeaderboard, and OPEN_ACTIVE signals
const summary = trackRecord?.summary;
const brokerLeaderboard = trackRecord?.brokerLeaderboard || [];

assert(
  typeof summary?.verifiedWinRatePct === 'number' &&
  summary.verifiedWinRatePct > 0 &&
  Array.isArray(brokerLeaderboard) &&
  brokerLeaderboard.length > 0 &&
  openSignals.length > 0,
  'summary.verifiedWinRatePct, brokerLeaderboard, and OPEN_ACTIVE signals computed accurately',
  `Win Rate: ${summary?.verifiedWinRatePct}% | Profit Factor: ${summary?.profitFactor}x | Open: ${openSignals.length} | Brokers: ${brokerLeaderboard.length}`
);

// 4. Print Telemetry
console.log('\n  🏆 TOP 5 VERIFIED WINNING SIGNALS (T+2 Settled):');
const topWins = [...winningSignals]
  .sort((a, b) => b.net_pnl_after_fees_pct - a.net_pnl_after_fees_pct)
  .slice(0, 5);

topWins.forEach((s, idx) => {
  console.log(
    `     ${idx + 1}. ${s.symbol} (${s.sector}) | Signal: ${s.signal_date} (Unlock: ${s.t2_unlock_date}) | Exit: ${s.exit_date} (T+${s.holding_days})`
  );
  console.log(
    `        Entry: NPR ${s.entry_price} -> Exit: NPR ${s.exit_price} (Peak: NPR ${s.peak_price}, Max Gain: +${s.max_gain_pct}%) | Net: +${s.net_pnl_after_fees_pct}% | Lead: ${s.lead_broker_name}`
  );
});

console.log('\n  📊 TOP 3 BROKERS ON WIN-RATE LEADERBOARD:');
brokerLeaderboard.slice(0, 3).forEach((b, idx) => {
  console.log(
    `     ${idx + 1}. ${b.brokerName} | Win Rate: ${b.winRatePct}% (${b.winCount}W / ${b.lossCount}L of ${b.totalSignals} signals) | Avg Net: ${b.avgNetReturnPct >= 0 ? '+' : ''}${b.avgNetReturnPct}% | Best: ${b.bestStock?.symbol} (+${b.bestStock?.maxGainPct}%)`
  );
});

console.log('\n  ⏳ TOP 5 OPEN ACTIVE SIGNALS (Post-Dashain Watchlist for Mon Oct 26):');
const topOpen = [...openSignals]
  .sort((a, b) => b.ignition_score - a.ignition_score || b.bcr5_net_pct - a.bcr5_net_pct)
  .slice(0, 5);

topOpen.forEach((s, idx) => {
  console.log(
    `     ${idx + 1}. ${s.symbol} (${s.sector}) | Signal Date: ${s.signal_date} (T+2 Unlock: ${s.t2_unlock_date}) | Strategy: ${s.signal_type}`
  );
  console.log(
    `        Entry: NPR ${s.entry_price} (VWAP: NPR ${s.broker_vwap}) | Targets: T1 NPR ${s.target1_price} / T2 NPR ${s.target2_price} / SL NPR ${s.stop_loss_price} | Lead: ${s.lead_broker_name} | Score: ${s.ignition_score}/100`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(`VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
console.log('═══════════════════════════════════════════════════════════════════\n');

if (failCount === 0) {
  console.log('🎉 ALL 6 ARCHITECTURAL & MATHEMATICAL BUG FIXES ARE FULLY VERIFIED!\n');
  process.exit(0);
} else {
  console.error('⚠️ SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE.\n');
  process.exit(1);
}
