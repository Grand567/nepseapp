/**
 * tests/rBatchBrokerFloorsheetSignals.test.mjs
 * Verification Test Suite for STEP 2a: BROKER & FLOORSHEET SIGNALS
 *
 * Verifies exact formulas, data field requirements, and NEPSE edge cases for:
 * 1. Net Accumulation by Top Brokers
 * 2. Broker Concentration (CR5, SCR5, Delta CR5, HHI)
 * 3. Repeated-Broker Multi-Session Patterns
 * 4. Buy/Sell Imbalance (Tick Aggressor & Broker Breadth)
 * 5. Unusual Volume vs. 20-Day Average (RVOL20, Z-Score)
 * 6. Composite Confluence Evaluation & Weakness Warnings
 */

import assert from 'assert';
import {
  calculateTopBrokerAccumulation,
  calculateBrokerConcentration,
  calculateRepeatedBrokerPatterns,
  calculateBuySellImbalance,
  calculateUnusualVolume,
  evaluateBrokerFloorsheetConfluence
} from '../src/utils/signals/brokerFloorsheetSignals.js';

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('======================================================================');
console.log(' STEP 2a: BROKER & FLOORSHEET SIGNALS VERIFICATION SUITE');
console.log('======================================================================\n');

// ─── TEST 1: NET ACCUMULATION BY TOP BROKERS ──────────────────────────────
console.log('[TEST 1] Net Accumulation by Top Brokers');

it('Calculates exact Top-3 and Top-5 net quantities, amounts, and absorption ratios', () => {
  const brokers = [
    { brokerId: 58, buyQty: 50000, sellQty: 10000, buyAmount: 25000000, sellAmount: 5000000 }, // Net: +40k, +20M
    { brokerId: 45, buyQty: 30000, sellQty: 5000,  buyAmount: 15000000, sellAmount: 2500000 }, // Net: +25k, +12.5M
    { brokerId: 28, buyQty: 20000, sellQty: 2000,  buyAmount: 10000000, sellAmount: 1000000 }, // Net: +18k, +9M
    { brokerId: 34, buyQty: 15000, sellQty: 5000,  buyAmount: 7500000,  sellAmount: 2500000 }, // Net: +10k, +5M
    { brokerId: 17, buyQty: 12000, sellQty: 4000,  buyAmount: 6000000,  sellAmount: 2000000 }, // Net: +8k, +4M
    { brokerId: 16, buyQty: 5000,  sellQty: 45000, buyAmount: 2500000,  sellAmount: 22500000 }, // Net: -40k (Seller)
    { brokerId: 42, buyQty: 2000,  sellQty: 63000, buyAmount: 1000000,  sellAmount: 31500000 }, // Net: -61k (Seller)
  ];
  const totalVolume = 134000;

  const result = calculateTopBrokerAccumulation(brokers, totalVolume);

  // Top 3 Net: 40k + 25k + 18k = 83,000
  assert.strictEqual(result.top3NetQty, 83000, 'Top 3 Net Qty must be 83,000');
  // Top 5 Net: 83k + 10k + 8k = 101,000
  assert.strictEqual(result.top5NetQty, 101000, 'Top 5 Net Qty must be 101,000');

  // Top 3 Net Amount: 20M + 12.5M + 9M = 41.5M
  assert.strictEqual(result.top3NetAmt, 41500000, 'Top 3 Net Amount must be Rs. 41.5M');
  // Top 5 Net Amount: 41.5M + 5M + 4M = 50.5M
  assert.strictEqual(result.top5NetAmt, 50500000, 'Top 5 Net Amount must be Rs. 50.5M');

  // Top 3 Net Ratio: 83,000 / 134,000 = 0.6194
  assert.strictEqual(result.top3NetRatio, 0.6194, 'Top 3 Net Ratio must be 0.6194');
  // Top 5 Net Ratio: 101,000 / 134,000 = 0.7537
  assert.strictEqual(result.top5NetRatio, 0.7537, 'Top 5 Net Ratio must be 0.7537');

  assert.strictEqual(result.topBuyers[0].brokerId, '58');
  assert.strictEqual(result.topBuyers[0].retentionPct, 80.0, 'Broker 58 retention must be 80%');
});

it('Detects wash trading / intra-day churn when retention is low', () => {
  const washBrokers = [
    { brokerId: 58, buyQty: 50000, sellQty: 45000, buyAmount: 25000000, sellAmount: 22500000 }, // Net: 5k (10% retention)
    { brokerId: 45, buyQty: 10000, sellQty: 9000,  buyAmount: 5000000,  sellAmount: 4500000 },
  ];

  const result = calculateTopBrokerAccumulation(washBrokers, 60000);
  assert.ok(result.weaknesses.some(w => w.includes('low retention')), 'Must flag low retention wash trading');
});

// ─── TEST 2: BROKER CONCENTRATION ─────────────────────────────────────────
console.log('\n[TEST 2] Broker Concentration (CR3, CR5, SCR3, SCR5, Delta CR, HHI)');

it('Computes buyer and seller concentration ratios and Herfindahl-Hirschman Index', () => {
  const brokers = [
    { brokerId: 58, buyQty: 40000, sellQty: 5000 },
    { brokerId: 45, buyQty: 25000, sellQty: 5000 },
    { brokerId: 28, buyQty: 15000, sellQty: 5000 },
    { brokerId: 34, buyQty: 10000, sellQty: 5000 },
    { brokerId: 17, buyQty: 10000, sellQty: 5000 }, // Top 5 Buy = 100k
    { brokerId: 16, buyQty: 0, sellQty: 45000 },
    { brokerId: 42, buyQty: 0, sellQty: 20000 },
    { brokerId: 57, buyQty: 0, sellQty: 10000 }, // Top 3 Sell = 75k
  ];
  const totalBuy = 100000;
  const totalSell = 100000;

  const result = calculateBrokerConcentration(brokers, totalBuy, totalSell);

  // CR3: (40k + 25k + 15k) / 100k = 80.0%
  assert.strictEqual(result.cr3, 0.80, 'CR3 must be 80.0%');
  // CR5: (40k + 25k + 15k + 10k + 10k) / 100k = 100.0%
  assert.strictEqual(result.cr5, 1.00, 'CR5 must be 100.0%');

  // SCR3: (45k + 20k + 10k) / 100k = 75.0%
  assert.strictEqual(result.scr3, 0.75, 'SCR3 must be 75.0%');

  // Delta CR5: 1.00 - 0.85 = +0.15
  assert.ok(result.deltaCr5 > 0, 'Delta CR5 must be positive');

  // HHI Buy: 40^2 + 25^2 + 15^2 + 10^2 + 10^2 = 1600 + 625 + 225 + 100 + 100 = 2650
  assert.strictEqual(result.hhiBuy, 2650, 'HHI Buy must be 2650');
  assert.strictEqual(result.concentrationLevel, 'HIGHLY_CONCENTRATED');
});

// ─── TEST 3: REPEATED-BROKER PATTERNS ─────────────────────────────────────
console.log('\n[TEST 3] Repeated-Broker Multi-Session Patterns');

it('Identifies persistent institutional syndicate accumulation over 5 sessions', () => {
  const dailyHistory = [
    {
      date: '2026-10-20',
      brokers: [
        { brokerId: 58, buyQty: 20000, sellQty: 2000 },
        { brokerId: 45, buyQty: 15000, sellQty: 1000 },
        { brokerId: 34, buyQty: 5000, sellQty: 8000 }
      ]
    },
    {
      date: '2026-10-21',
      brokers: [
        { brokerId: 58, buyQty: 25000, sellQty: 3000 },
        { brokerId: 45, buyQty: 18000, sellQty: 2000 },
        { brokerId: 34, buyQty: 2000, sellQty: 12000 }
      ]
    },
    {
      date: '2026-10-22',
      brokers: [
        { brokerId: 58, buyQty: 30000, sellQty: 4000 },
        { brokerId: 45, buyQty: 12000, sellQty: 3000 },
        { brokerId: 28, buyQty: 10000, sellQty: 1000 }
      ]
    },
    {
      date: '2026-10-25',
      brokers: [
        { brokerId: 58, buyQty: 22000, sellQty: 5000 },
        { brokerId: 45, buyQty: 14000, sellQty: 2000 },
        { brokerId: 28, buyQty: 8000, sellQty: 1000 }
      ]
    },
    {
      date: '2026-10-26',
      brokers: [
        { brokerId: 58, buyQty: 35000, sellQty: 5000 },
        { brokerId: 45, buyQty: 16000, sellQty: 3000 },
        { brokerId: 17, buyQty: 10000, sellQty: 2000 }
      ]
    }
  ];

  const result = calculateRepeatedBrokerPatterns(dailyHistory);

  assert.strictEqual(result.totalSessionsAnalyzed, 5);
  // Both Broker 58 and Broker 45 were net buyers on 5 out of 5 sessions (100% consistency)
  assert.ok(result.consistentAccumulatorsCount >= 2, 'Must detect at least 2 consistent accumulators');
  assert.strictEqual(result.isSyndicateAccumulation, true, 'Must identify syndicate accumulation');
  assert.ok(result.patternScore >= 75, `Pattern score (${result.patternScore}) must reflect strong consistency`);

  const broker58 = result.topConsistentBrokers.find(b => b.brokerId === '58');
  assert.ok(broker58, 'Broker 58 must be present');
  assert.strictEqual(broker58.consistencyRatio, 1.0, 'Broker 58 consistency must be 1.0 (5/5)');
  assert.strictEqual(broker58.currentStreak, 5, 'Broker 58 streak must be 5');
});

// ─── TEST 4: BUY/SELL IMBALANCE & ORDER FLOW ──────────────────────────────
console.log('\n[TEST 4] Buy/Sell Imbalance (Tick Aggressor & Broker Breadth)');

it('Calculates order flow aggressor imbalance and detects institutional absorption', () => {
  const contracts = [
    { kitta: 1000, rate: 520, aggressor: 'BUY' },
    { kitta: 1500, rate: 521, aggressor: 'BUY' },
    { kitta: 2000, rate: 522, aggressor: 'BUY' },
    { kitta: 500,  rate: 521, aggressor: 'SELL' },
    { kitta: 200,  rate: 520, aggressor: 'SELL' },
    { kitta: 100,  rate: 520, aggressor: 'NEUTRAL' }
  ];
  // 3 concentrated buyers absorbing from 12 small sellers
  const brokers = [
    { brokerId: 58, buyQty: 2500, sellQty: 0 },
    { brokerId: 45, buyQty: 1500, sellQty: 0 },
    { brokerId: 28, buyQty: 500,  sellQty: 0 },
    // 6 sellers
    { brokerId: 1, buyQty: 0, sellQty: 700 },
    { brokerId: 2, buyQty: 0, sellQty: 800 },
    { brokerId: 3, buyQty: 0, sellQty: 600 },
    { brokerId: 4, buyQty: 0, sellQty: 900 },
    { brokerId: 5, buyQty: 0, sellQty: 750 },
    { brokerId: 6, buyQty: 0, sellQty: 750 }
  ];

  const result = calculateBuySellImbalance(contracts, brokers);

  // Buy Aggressor: 4500, Sell: 700, Neutral: 100 -> Total: 5300
  // Imbalance = (4500 - 700) / 5300 = +0.7170
  assert.strictEqual(result.buyAggressorQty, 4500);
  assert.strictEqual(result.sellAggressorQty, 700);
  assert.strictEqual(result.aggressorImbalance, 0.7170);

  // Whale prints: all 3 buys were >= 500 kitta (whale buys), 1 sell was >= 500 (whale sell)
  assert.ok(result.whaleBuyRatio > 0.80, 'Whale buy ratio must dominate');

  // Broker breadth: 3 buyers vs 6 sellers -> (3 - 6) / 9 = -0.3333
  assert.strictEqual(result.netBuyersCount, 3);
  assert.strictEqual(result.netSellersCount, 6);
  assert.strictEqual(result.brokerBreadthImbalance, -0.3333);
  assert.strictEqual(result.orderFlowSignal, 'STRONG_BUY_AGGRESSION');
});

// ─── TEST 5: UNUSUAL VOLUME VS 20-DAY AVERAGE ─────────────────────────────
console.log('\n[TEST 5] Unusual Volume vs 20-Day Average (RVOL & Z-Score)');

it('Calculates RVOL20 and Z-Score accurately across normal and breakout conditions', () => {
  // 20 sessions baseline with mean ~20,000 kitta
  const history20 = [
    18000, 22000, 19000, 21000, 20000,
    19500, 20500, 18500, 21500, 20000,
    19000, 21000, 20000, 19000, 22000,
    20000, 19500, 20500, 19000, 21000
  ];

  // Case A: Normal volume (21,000)
  const normalCase = calculateUnusualVolume(21000, history20);
  assert.strictEqual(normalCase.sma20Volume, 20050);
  assert.strictEqual(normalCase.rvol20, 1.05);
  assert.strictEqual(normalCase.classification, 'NORMAL');
  assert.strictEqual(normalCase.isUnusualVolume, false);

  // Case B: Breakout volume surge (38,000 -> RVOL ~ 1.90x)
  const surgeCase = calculateUnusualVolume(38000, history20);
  assert.strictEqual(surgeCase.rvol20, 1.90);
  assert.strictEqual(surgeCase.classification, 'UNUSUAL_VOLUME');
  assert.strictEqual(surgeCase.isUnusualVolume, true);
  assert.strictEqual(surgeCase.isClimacticSurge, false);

  // Case C: Climactic exhaustion spike (65,000 -> RVOL ~ 3.24x)
  const climaxCase = calculateUnusualVolume(65000, history20);
  assert.strictEqual(climaxCase.rvol20, 3.24);
  assert.strictEqual(climaxCase.classification, 'CLIMACTIC_SURGE');
  assert.strictEqual(climaxCase.isClimacticSurge, true);
  assert.ok(climaxCase.weaknesses.some(w => w.includes('climactic surge')), 'Must warn of post-spike exhaustion');

  // Case D: Insufficient history (< 5 sessions)
  const insufficientCase = calculateUnusualVolume(50000, [10000, 12000]);
  assert.strictEqual(insufficientCase.isInsufficientHistory, true);
  assert.strictEqual(insufficientCase.rvol20, null);
});

// ─── TEST 6: COMPOSITE CONFLUENCE & WEAKNESS SURFACE ──────────────────────
console.log('\n[TEST 6] Composite Broker Floorsheet Confluence Evaluation');

it('Generates composite score and transparently lists market weaknesses', () => {
  const result = evaluateBrokerFloorsheetConfluence({
    symbol: 'NICA',
    tradeDate: '2026-10-26',
    currentVolume: 45000,
    volumeHistory20: [20000, 22000, 19000, 21000, 23000, 20000, 21000],
    brokers: [
      { brokerId: 58, buyQty: 25000, sellQty: 2000, buyAmount: 12500000, sellAmount: 1000000 },
      { brokerId: 45, buyQty: 15000, sellQty: 1000, buyAmount: 7500000,  sellAmount: 500000 }
    ],
    dailyBrokerHistory: [
      { date: '2026-10-22', brokers: [{ brokerId: 58, buyQty: 10000, sellQty: 1000 }, { brokerId: 45, buyQty: 8000, sellQty: 500 }] },
      { date: '2026-10-25', brokers: [{ brokerId: 58, buyQty: 12000, sellQty: 2000 }, { brokerId: 45, buyQty: 9000, sellQty: 1000 }] },
      { date: '2026-10-26', brokers: [{ brokerId: 58, buyQty: 25000, sellQty: 2000 }, { brokerId: 45, buyQty: 15000, sellQty: 1000 }] }
    ],
    contracts: [
      { kitta: 1500, rate: 500, aggressor: 'BUY' },
      { kitta: 2000, rate: 501, aggressor: 'BUY' }
    ]
  });

  assert.strictEqual(result.symbol, 'NICA');
  assert.ok(result.compositeScore >= 75, `Composite score (${result.compositeScore}) must reflect high confluence`);
  assert.strictEqual(result.verdict, 'STRONG_ACCUMULATION');
  assert.ok(Array.isArray(result.weaknesses), 'Must provide weaknesses array');
});

console.log('\n======================================================================');
console.log(`RESULTS: ${passedTests} passed, 0 failed out of ${totalTests} assertions.`);
console.log('======================================================================');
console.log('✅ STEP 2a BROKER/FLOORSHEET SIGNALS VERIFIED CLEANLY!\n');
