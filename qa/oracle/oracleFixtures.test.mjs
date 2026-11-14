/**
 * QA ORACLE FIXTURES VERIFICATION SUITE
 * ============================================================================
 * Tests the independent oracle against hand-calculated mathematical proofs
 * and verified database records.
 * ============================================================================
 */

import { IndependentOracle } from './independentOracle.mjs';

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${message} — ${details}`);
  }
}

console.log('=================================================================');
console.log('🧪 INDEPENDENT ORACLE — FIXTURE VERIFICATION & HAND-COMPUTED PROOFS');
console.log('=================================================================\n');

// ── TEST 1: STATUTORY COMMISSIONS & FEES ─────────────────────────────────────
console.log('--- [Suite 1] Statutory Commissions, SEBON Fees & DP Charge ---');
assert(
  IndependentOracle.calculateBrokerCommission(40000) === 144.0,
  'Tier 1 commission (<=50k) is strictly 0.36%: Rs. 144.00'
);
assert(
  IndependentOracle.calculateBrokerCommission(200000) === 660.0,
  'Tier 2 commission (50k-500k) is strictly 0.33%: Rs. 660.00'
);
assert(
  IndependentOracle.calculateBrokerCommission(1000000) === 3100.0,
  'Tier 3 commission (500k-2M) is strictly 0.31%: Rs. 3,100.00'
);
assert(
  IndependentOracle.calculateBrokerCommission(5000000) === 13500.0,
  'Tier 4 commission (2M-10M) is strictly 0.27%: Rs. 13,500.00'
);
assert(
  IndependentOracle.calculateBrokerCommission(20000000) === 48000.0,
  'Tier 5 commission (>10M) is strictly 0.24%: Rs. 48,000.00'
);
assert(
  IndependentOracle.calculateSebonFee(100000) === 15.0,
  'SEBON regulatory fee is strictly 0.015%: Rs. 15.00'
);

// ── TEST 2: HOLDING PNL & WACC ───────────────────────────────────────────────
console.log('\n--- [Suite 2] Holding PnL, WACC, Frictions & Capital Gains Tax ---');
const pnl = IndependentOracle.calculateHoldingPnL({
  units: 100,
  buyPrice: 500,
  currentPrice: 600,
  holdingDays: 100,
  investorType: 'INDIVIDUAL'
});
assert(pnl.grossBuyAmt === 50000, 'Gross buy amount === Rs. 50,000');
assert(pnl.buyCommission === 180.0, 'Buy commission === Rs. 180.00');
assert(pnl.buySebon === 7.5, 'Buy SEBON fee === Rs. 7.50');
assert(pnl.buyDp === 25.0, 'Buy DP fee === Rs. 25.00');
assert(pnl.totalBuyOutlay === 50212.5, 'Total buy outlay === Rs. 50,212.50');
assert(pnl.effectiveWacc === 502.13, 'Effective WACC === Rs. 502.13');
assert(pnl.grossSellAmt === 60000, 'Gross sell amount === Rs. 60,000');
assert(pnl.sellCommission === 198.0, 'Sell commission === Rs. 198.00');
assert(pnl.sellSebon === 9.0, 'Sell SEBON fee === Rs. 9.00');
assert(pnl.sellDp === 25.0, 'Sell DP fee === Rs. 25.00');
assert(pnl.netReceivableBeforeTax === 59768.0, 'Net receivable before tax === Rs. 59,768.00');
assert(pnl.capitalGain === 9555.5, 'Capital Gain === Rs. 9,555.50');
assert(pnl.cgt === 716.66, 'Short-Term CGT (7.5%) === Rs. 716.66');
assert(pnl.netProfitLoss === 8838.84, 'Net Realizable Profit === Rs. 8,838.84');
assert(pnl.returnPct === 17.6, 'Return on Outlay === +17.6%');

// ── TEST 3: IPO ALLOTMENT & CORPORATE ACTIONS ────────────────────────────────
console.log('\n--- [Suite 3] IPO Allotment & Corporate Action Price Adjustments ---');
const ipoOver = IndependentOracle.calculateIpoAllotment(1000000, 500000);
assert(!ipoOver.isGuaranteed, 'Oversubscribed IPO is not guaranteed (lottery)');
assert(ipoOver.probabilityPct === 20.0, '1M kitta with 500k applicants = 20.0% probability');

const ipoUnder = IndependentOracle.calculateIpoAllotment(1000000, 80000);
assert(ipoUnder.isGuaranteed, 'Undersubscribed IPO is 100% guaranteed');

const bonusAdj = IndependentOracle.calculateBonusShareAdjustment(400, 10);
assert(bonusAdj === 363.64, 'Rs. 400 with 10% bonus adjusts to Rs. 363.64');

const rightAdj = IndependentOracle.calculateRightShareAdjustment(400, 50);
assert(rightAdj === 300.0, 'Rs. 400 with 50% right adjusts to Rs. 300.00');

// ── TEST 4: ORACLE DATABASE INTEGRITY & MICROSTRUCTURE (RFPL & NABIL) ────────
console.log('\n--- [Suite 4] Oracle Database Calculations (RFPL & NABIL) ---');
const oracle = new IndependentOracle();

const rfpl = oracle.getStockSummary('RFPL', '2026-11-13');
assert(rfpl !== null, 'RFPL summary found for 2026-11-13');
assert(rfpl.symbol === 'RFPL', 'Symbol matches RFPL');
assert(rfpl.tradeDate === '2026-11-13', 'Session date matches 2026-11-13');
assert(rfpl.volume > 0, `RFPL session volume is positive (${rfpl.volume})`);
assert(rfpl.turnover > 0, `RFPL session turnover is positive (Rs. ${rfpl.turnover})`);
assert(rfpl.vwap > 0, `RFPL session VWAP is positive (Rs. ${rfpl.vwap})`);

const rfpl1D = oracle.getBrokerFlow('RFPL', '1', '2026-11-13');
assert(rfpl1D !== null, 'RFPL 1D broker flow computed');
assert(rfpl1D.topAccumulators.length > 0, 'Top accumulators list is populated');
assert(rfpl1D.topAccumulators[0].brokerId === 49, `Top accumulator is Broker #49 (got #${rfpl1D.topAccumulators[0].brokerId})`);
assert(rfpl1D.topAccumulators[0].netQty === 3586, `Broker #49 net kitta === +3,586 (got ${rfpl1D.topAccumulators[0].netQty})`);
assert(rfpl1D.topDistributors[0].brokerId === 16, `Top distributor is Broker #16 (got #${rfpl1D.topDistributors[0].brokerId})`);
assert(rfpl1D.topDistributors[0].netQty === -4593, `Broker #16 net dump === -4,593 kitta (got ${rfpl1D.topDistributors[0].netQty})`);

// 5D Aggregate distinctness check
const rfpl5D = oracle.getTimeframeAggregate('RFPL', '5', '2026-11-13');
assert(rfpl5D !== null, 'RFPL 5D aggregate computed');
assert(rfpl5D.sessionsCount === 5, '5D aggregate contains exactly 5 trading sessions');
assert(rfpl5D.totalVolume > rfpl.volume, '5D cumulative volume > 1D session volume');

// Top 10 Cornering check
const corneringTop10 = oracle.getBrokerCorneringTop10('2026-11-13');
assert(corneringTop10.length === 10, 'Top 10 Broker Cornering returns exactly 10 scrips');
assert(corneringTop10[0].concentrationPct >= corneringTop10[9].concentrationPct, 'Cornering list is sorted descending by concentration');

oracle.close();

console.log('\n=================================================================');
console.log(`ORACLE FIXTURES SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('=================================================================');

if (failed > 0) {
  process.exit(1);
}
