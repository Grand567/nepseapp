// tests/testInstitutionalConfluencePipeline.mjs
process.env.SUPPRESS_TEST_ALERTS = 'true';
process.env.NODE_ENV = 'test';
import assert from 'assert';
import {
  evaluateInstitutionalAlert,
  evaluatePillar1_WyckoffVduVcp,
  evaluatePillar2_SmartMoneyAbsorption,
  evaluatePillar3_VolumePriceValidation,
  evaluatePillar4_TrendAndSectorRS,
  evaluateVetoFilters,
  calculateNetExpectancyAndSizing,
  getMacroRegime,
  formatInstitutionalExecutionTicket,
  DEFAULT_FRICTION_CONSTANTS
} from '../proxy/institutionalAlertEngine.mjs';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🏛️ TEST SUITE: INSTITUTIONAL CONFLUENCE & VETO ARCHITECTURE');
console.log('═══════════════════════════════════════════════════════════════════\n');

// ── TEST 1: PILLAR 1 — WYCKOFF PHASE C / VDU & VCP ──────────────────────────
console.log('Test 1: Validating Pillar 1 (Wyckoff VDU <= 0.55x & VCP Contraction)...');

const p1Success = evaluatePillar1_WyckoffVduVcp({
  recentVolume: 22000,
  avgVolume20D: 50000, // 22k / 50k = 0.44x <= 0.55x
  currentHigh: 272,
  currentLow: 268,
  currentClose: 270,
  priceHistory: [
    { high: 285, low: 265, close: 275 },
    { high: 280, low: 266, close: 272 },
    { high: 276, low: 267, close: 271 },
    { high: 272, low: 268, close: 270 }
  ]
});

assert.strictEqual(p1Success.passed, true, 'Pillar 1 should pass when VDU <= 0.55 and range contracts');
assert.strictEqual(p1Success.isVduMet, true);
assert.strictEqual(p1Success.isVcpMet, true);
assert.strictEqual(p1Success.vduRatio, 0.44);
console.log(`✅ Test 1.1 Passed: Supply Exhaustion VDU verified (${p1Success.vduRatio}x).`);

// High volume failure
const p1Fail = evaluatePillar1_WyckoffVduVcp({
  recentVolume: 45000,
  avgVolume20D: 50000, // 45k / 50k = 0.90x > 0.55x
  currentHigh: 275,
  currentLow: 265,
  currentClose: 270,
  priceHistory: []
});
assert.strictEqual(p1Fail.passed, false, 'Pillar 1 must fail when volume is not dry (0.90x > 0.55x)');
console.log('✅ Test 1.2 Passed: Non-dry volume rejected.\n');

// ── TEST 2: PILLAR 2 — SMART MONEY ABSORPTION & ATSR ─────────────────────────
console.log('Test 2: Validating Pillar 2 (BCR3 >= 40%, Retention >= 70%, 5D >= 75%, ATSR >= 2.2)...');

const p2Success = evaluatePillar2_SmartMoneyAbsorption({
  bcr3BuyPct: 52.4,
  totalBuyTrades: 40,
  totalSellTrades: 120,
  totalBuyQty: 60000,
  totalSellQty: 45000,
  rolling5DBrokerData: { grossBuy5D: 250000, netBuy5D: 210000 } // 84% retention
});

// avgBuyTicket = 60000 / 40 = 1500; avgSellTicket = 45000 / 120 = 375; ATSR = 1500 / 375 = 4.0 >= 2.2
assert.strictEqual(p2Success.passed, true, 'Pillar 2 must pass for institutional absorption');
assert.strictEqual(p2Success.isBcr3Met, true);
assert.strictEqual(p2Success.isSingleDayRetentionMet, true);
assert.strictEqual(p2Success.is5DRetentionMet, true);
assert.strictEqual(p2Success.isAtsrMet, true);
assert.strictEqual(p2Success.atsr, 4.0);
console.log(`✅ Test 2.1 Passed: Institutional absorption verified (ATSR: ${p2Success.atsr}x, 5D Retention: ${p2Success.rolling5DRetentionPct}%).`);

// Low ticket size failure (retail lot churn)
const p2FailTicket = evaluatePillar2_SmartMoneyAbsorption({
  bcr3BuyPct: 45.0,
  totalBuyTrades: 150,
  totalSellTrades: 60,
  totalBuyQty: 30000,
  totalSellQty: 30000,
  rolling5DBrokerData: { grossBuy5D: 100000, netBuy5D: 80000 }
});
// avgBuy = 200, avgSell = 500, ATSR = 0.4 < 2.2
assert.strictEqual(p2FailTicket.passed, false, 'Pillar 2 must fail when ATSR < 2.2');
assert.strictEqual(p2FailTicket.isAtsrMet, false);
console.log('✅ Test 2.2 Passed: Retail lot fragmented buying rejected by ATSR.\n');

// ── TEST 3: PILLAR 3 — VOLUME-PRICE VALIDATION (WICK & DAY-2) ────────────────
console.log('Test 3: Validating Pillar 3 (Effort vs. Result & Upper Wick < 40%)...');

// Clean candle with tiny upper wick
const p3Clean = evaluatePillar3_VolumePriceValidation({
  high: 273,
  low: 268,
  close: 272,
  open: 269
});
// Range = 5, Upper Wick = 273 - 272 = 1 (20% < 40%)
assert.strictEqual(p3Clean.passed, true);
assert.strictEqual(p3Clean.isWickClean, true);
console.log(`✅ Test 3.1 Passed: Clean candle body accepted (Wick: ${Math.round(p3Clean.upperWickRatio * 100)}%).`);

// Dump candle with massive upper rejection wick (45% >= 40%)
const p3Dump = evaluatePillar3_VolumePriceValidation({
  high: 280,
  low: 268,
  close: 272,
  open: 270
});
// Range = 12, Upper Wick = 280 - 272 = 8 (8/12 = 66.7% >= 40%)
assert.strictEqual(p3Dump.passed, false);
assert.strictEqual(p3Dump.isWickClean, false);
console.log('✅ Test 3.2 Passed: Upper wick rejection >= 40% cleanly rejected.\n');

// ── TEST 4: PILLAR 4 — STRUCTURAL TREND & SECTORAL RELATIVE STRENGTH ────────
console.log('Test 4: Validating Pillar 4 (Above Rising 50 EMA & Top 3 Sector RS)...');

const p4Success = evaluatePillar4_TrendAndSectorRS({
  ltp: 275,
  ema50: 260,
  ema50Prev: 259.5,
  sector: 'Hydro Power',
  sectorRank10D: 2, // Top 3 rank
  stock10DReturn: 6.5,
  sector10DReturn: 4.0 // Outperforming sector
});
assert.strictEqual(p4Success.passed, true);
assert.strictEqual(p4Success.isAboveEma50, true);
assert.strictEqual(p4Success.isSectorTop3, true);
assert.strictEqual(p4Success.isOutperformingSector, true);
console.log('✅ Test 4.1 Passed: Structural trend and sector leadership verified.');

// Sector rank 7/13 failure
const p4LaggardSector = evaluatePillar4_TrendAndSectorRS({
  ltp: 275,
  ema50: 260,
  sectorRank10D: 7, // Laggard sector
  stock10DReturn: 6.5,
  sector10DReturn: 2.0
});
assert.strictEqual(p4LaggardSector.passed, false);
assert.strictEqual(p4LaggardSector.isSectorTop3, false);
console.log('✅ Test 4.2 Passed: Laggard sector rejected.\n');

// ── TEST 5: ABSOLUTE DISTRIBUTION TRAP & VETO ENGINE (2082 BYLAWS / ±15% EDITION) ─────────
console.log('Test 5: Validating Module 2 Veto Engine (2082 Bylaws / ±15% Circuit Edition)...');

// 5.1 NEPSE ±15% Circuit Ceiling Guard Veto
const vCircuit = evaluateVetoFilters({
  ltp: 305,
  previousClose: 270, // +12.96% up (>= 10.5% and within 2.5% of +15% ceiling)
  bypassTimingGate: true
});
assert.strictEqual(vCircuit.isVetoed, true);
assert.ok(vCircuit.vetoTriggers.some(v => v.code === 'VETO_CIRCUIT_CEILING'));
console.log('✅ Test 5.1 Passed: ±15% circuit ceiling chase (+12.96% gain) vetoed.');

// 5.2 Operator Offloading Veto (BCR3_Sell >= 38%)
const vOperator = evaluateVetoFilters({
  ltp: 270,
  previousClose: 269,
  bcr3SellPct: 44.5, // >= 38%
  bypassTimingGate: true
});
assert.strictEqual(vOperator.isVetoed, true);
assert.ok(vOperator.vetoTriggers.some(v => v.code === 'VETO_OPERATOR_OFFLOADING_WASH'));
console.log('✅ Test 5.2 Passed: Operator offloading (BCR3 Sell 44.5%) vetoed.');

// 5.3 T+3 Settlement Supply Overhang Veto (sitting 11%+ in profit with t-3 vol >= 2.5x SMA)
const vT3 = evaluateVetoFilters({
  ltp: 300,
  previousClose: 290,
  volumeTMinus3: 150000, // 3x of 50k avg
  vwapTMinus3: 268,      // 300 is +11.94% profit on t-3 (>= 11%)
  avgVolume20D: 50000,
  bypassTimingGate: true
});
assert.strictEqual(vT3.isVetoed, true);
assert.ok(vT3.vetoTriggers.some(v => v.code === 'VETO_T3_SETTLEMENT_OVERHANG'));
console.log('✅ Test 5.3 Passed: T+3 settlement dump risk (11%+ profit) vetoed.');

// 5.4 Low Liquidity Depth Guard Veto (< Rs. 60 Lakhs)
const vIlliquid = evaluateVetoFilters({
  ltp: 270,
  previousClose: 269,
  medianDailyTurnover20D: 4200000, // 42 Lakhs < 60 Lakhs
  bypassTimingGate: true
});
assert.strictEqual(vIlliquid.isVetoed, true);
assert.ok(vIlliquid.vetoTriggers.some(v => v.code === 'VETO_LOW_TURNOVER_LIQUIDITY'));
console.log('✅ Test 5.4 Passed: Illiquid micro-cap (<60L) vetoed.');

// 5.5 Opening Retail Window Veto (11:00 AM – 11:25 AM NPT)
const vOpeningTime = evaluateVetoFilters({
  ltp: 270,
  previousClose: 269,
  medianDailyTurnover20D: 8000000,
  nptMinutes: 670, // 11:10 AM NPT (between 660 and 685)
  isLiveMarket: true,
  bypassTimingGate: false
});
assert.strictEqual(vOpeningTime.isVetoed, true);
assert.ok(vOpeningTime.vetoTriggers.some(v => v.code === 'VETO_OPENING_RETAIL_WINDOW'));
console.log('✅ Test 5.5 Passed: Opening retail noise (11:10 AM) vetoed.');

// 5.6 Unfilled Pre-Open Gap Veto (>= 4.0% pre-open gap without 30m VWAP hold)
const vPreOpenGap = evaluateVetoFilters({
  ltp: 275,
  previousClose: 265,
  preOpenGapPct: 4.8,
  isPreOpenGapRetested: false,
  bypassTimingGate: true
});
assert.strictEqual(vPreOpenGap.isVetoed, true);
assert.ok(vPreOpenGap.vetoTriggers.some(v => v.code === 'VETO_UNFILLED_PREOPEN_GAP'));
console.log('✅ Test 5.6 Passed: Unfilled pre-open gap (+4.8%) vetoed.');

// 5.7 Market-Wide Index Circuit Guard Veto (NEPSE Index near 5% halt: +4.8%)
const vIndexHalt = evaluateVetoFilters({
  ltp: 270,
  previousClose: 268,
  nepseIndexChangePct: 4.8,
  bypassTimingGate: true
});
assert.strictEqual(vIndexHalt.isVetoed, true);
assert.ok(vIndexHalt.vetoTriggers.some(v => v.code === 'VETO_INDEX_CIRCUIT_RISK'));
console.log('✅ Test 5.7 Passed: Market index circuit guard (+4.8% near 5% halt) vetoed.\n');

// ── TEST 6: NEPSE FRICTION-ADJUSTED RRR & POSITION SIZING ────────────────────
console.log('Test 6: Validating Net Post-Tax/Fee RRR & 1% Position Sizing Engine...');

const sizing = calculateNetExpectancyAndSizing({
  entryPrice: 270,
  target1: 330,
  target2: 355,
  nearestSupport: 260,
  atr14: 6.0, // 1.75 * 6.0 = 10.5 -> 270 - 10.5 = 259.5. Max(260, 259.5) = 260. Max(-7.5%) = 249.75 -> 260
  medianDailyTurnover20D: 8200000
});

assert.ok(sizing);
assert.strictEqual(sizing.stopLoss, 260, 'Stop loss calibrated to 260');
assert.strictEqual(sizing.slPct, 3.7);
assert.ok(sizing.netRRR >= 2.5, `Net RRR must be >= 2.5 (got ${sizing.netRRR})`);
assert.ok(sizing.qtyPer1Lakh > 0, `Qty per 1 Lakh must be positive (got ${sizing.qtyPer1Lakh})`);
assert.strictEqual(sizing.turnoverLakhs, 82.0);
assert.strictEqual(sizing.safeOrderLakhs, 4.1);
console.log(`✅ Test 6 Passed: Net RRR = ${sizing.netRRR}:1 (after 7.5% CGT & broker fees). Qty per 1 Lakh: ${sizing.qtyPer1Lakh} Shares.\n`);

// ── TEST 7: MACRO REGIME & SEASONAL MULTIPLIER ──────────────────────────────
console.log('Test 7: Validating Macro & Seasonal Hydrology Tightening...');

// Tightening under high IBOR (> 6.5%)
const macroDefensive = getMacroRegime({ ibor: 6.8, cdRatio: 84.0 });
assert.strictEqual(macroDefensive.regime, 'DEFENSIVE');
assert.strictEqual(macroDefensive.requiredNetRRR, 3.0);
console.log('✅ Test 7.1 Passed: Tight liquidity correctly triggers DEFENSIVE mode (Net RRR >= 3.0).');

// Seasonal dry-season tightening for Hydros
const macroSeasonal = getMacroRegime({ forceSeasonalTightening: true });
assert.strictEqual(macroSeasonal.vduThreshold, 0.45, 'VDU threshold tightened to 0.45');
assert.strictEqual(macroSeasonal.rolling5DRetentionThreshold, 0.80, '5D retention threshold tightened to 0.80');
console.log('✅ Test 7.2 Passed: Seasonal dry-season tightening verified (VDU <= 0.45, 5D Retention >= 80%).\n');

// ── TEST 8: FULL CONFLUENCE ENGINE & EXECUTION TICKET FORMATTER ──────────────
console.log('Test 8: Validating End-to-End Institutional Execution Ticket Payload...');

const fullAlert = evaluateInstitutionalAlert({
  symbol: 'GHL',
  ltp: 271.5,
  high: 272,
  low: 268,
  open: 269,
  volume: 20000,
  turnover: 5430000,
  avgVolume20D: 50000,
  medianDailyTurnover20D: 8200000,
  bcr3BuyPct: 52.4,
  totalBuyTrades: 45,
  totalSellTrades: 125,
  totalBuyQty: 65000,
  totalSellQty: 48000,
  rolling5DBrokerData: { grossBuy5D: 280000, netBuy5D: 235000 },
  sector: 'Hydro Power',
  sectorRank10D: 2,
  stock10DReturn: 6.8,
  sector10DReturn: 3.5,
  nearestSupport: 261,
  target1: 330,
  target2: 355,
  bypassTimingGate: true
});

assert.strictEqual(fullAlert.isQualified, true, 'Full ideal candidate must qualify');
assert.strictEqual(fullAlert.confluenceScore, 100);
assert.strictEqual(fullAlert.all4PillarsPassed, true);
assert.strictEqual(fullAlert.veto.isVetoed, false);
assert.ok(fullAlert.ticketPayload);
assert.ok(fullAlert.ticketPayload.html.includes('INSTITUTIONAL ACCUMULATION CONFIRMED: $GHL'));
assert.ok(fullAlert.ticketPayload.html.includes('4-PILLAR CONFLUENCE SCORE: 100/100'));
assert.ok(fullAlert.ticketPayload.html.includes('Net Post-Tax/Fee RRR:'));
assert.ok(fullAlert.ticketPayload.html.includes('POSITION SIZING &amp; LIQUIDITY GUARD'));

console.log('Execution Ticket Preview:');
console.log('───────────────────────────────────────────────────────────────────');
console.log(fullAlert.ticketPayload.text);
console.log('───────────────────────────────────────────────────────────────────\n');
console.log('✅ Test 8 Passed: Execution Ticket formatted with exact institutional specifications.\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎉 ALL INSTITUTIONAL CONFLUENCE & VETO TESTS PASSED (8/8)!');
console.log('═══════════════════════════════════════════════════════════════════\n');
