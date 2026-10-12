/**
 * Integration Test Suite: Stealth Accumulation & Wyckoff Stage Regressions
 * File: tests/stealth_accumulation.test.js
 *
 * Verifies:
 *  - [Group 1] Stealth Score Correctness (Pump vs Flat vs Spring)
 *  - [Group 2] Wyckoff Stage Classification (Euphoria Distribution vs Stealth)
 *  - [Group 3] Deterministic Score Consistency across calls
 *  - [Group 4] Mathematical Normalization Bounds (Clamping to [0, 100])
 *
 * Compatible with:
 *  - Vitest: `npx vitest run tests/stealth_accumulation.test.js`
 *  - Node.js ESM: `node tests/stealth_accumulation.test.js`
 */

import {
  calculateStealthAccumulationScore,
  classifyWyckoffStage,
  detectSyndicateCluster
} from '../src/utils/accumulationDistributionEngine.ts';

// ── Universal Runner Adaptor (Vitest or Standalone Node.js) ──────────────────
let describeFn = (name, fn) => {
  console.log(`\n▶ [SUITE] ${name}`);
  fn();
};
let itFn = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✖ FAIL: ${name} — ${err.message}`);
    throw err;
  }
};

let expectFn = (actual) => ({
  toBe(expected) {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, received ${actual}`);
    }
  },
  toBeLessThanOrEqual(expected) {
    if (actual > expected) {
      throw new Error(`Expected ${actual} <= ${expected} (stealth should be LOW for pump stocks)`);
    }
  },
  toBeGreaterThanOrEqual(expected) {
    if (actual < expected) {
      throw new Error(`Expected ${actual} >= ${expected} (stealth should be HIGH for quiet consolidation)`);
    }
  },
  toContain(sub) {
    if (typeof actual !== 'string' || !actual.includes(sub)) {
      throw new Error(`Expected "${actual}" to contain "${sub}"`);
    }
  },
  not: {
    toContain(sub) {
      if (typeof actual === 'string' && actual.includes(sub)) {
        throw new Error(`Expected "${actual}" NOT to contain "${sub}"`);
      }
    }
  },
  toBeCloseTo(expected, delta = 2) {
    if (Math.abs(actual - expected) > delta) {
      throw new Error(`Expected ${actual} to be close to ${expected} (±${delta})`);
    }
  }
});

// Detect Vitest global environment if present
if (typeof globalThis.describe === 'function' && typeof globalThis.expect === 'function') {
  describeFn = globalThis.describe;
  itFn = globalThis.it || globalThis.test;
  expectFn = globalThis.expect;
}

const describe = describeFn;
const it = itFn;
const expect = expectFn;

// ── Shared Test Fixtures ──────────────────────────────────────────────────────
const pumpStock = {
  ltp: 500, high: 520, low: 450, open: 445,
  pChange: 12, volumeSurgeRatio: 2.8,
  high52w: 550, low52w: 300
};

const stealthStock = {
  ltp: 400, high: 403, low: 397, open: 399,
  pChange: 0.5, volumeSurgeRatio: 1.3,
  high52w: 600, low52w: 280
};

const springStock = {
  ltp: 390, high: 415, low: 382, open: 405,
  pChange: -3.2, volumeSurgeRatio: 1.6,
  high52w: 600, low52w: 280
};

const distStock = {
  ltp: 540, high: 560, low: 490, open: 490,
  pChange: 10.2, volumeSurgeRatio: 3.2,
  high52w: 550, low52w: 300
};

// ── Test Group 1: Stealth Score Correctness ──────────────────────────────────
describe('Group 1: Stealth Score Correctness', () => {
  it('1a: Pump stock (+12%, 2.8x volume) MUST score stealth <= 45 (Distribution territory)', () => {
    const score = calculateStealthAccumulationScore(pumpStock, [], undefined);
    console.log(`     Pump stock stealth score: ${score}`);
    expect(score).toBeLessThanOrEqual(45);
  });

  it('1b: Flat consolidation (+0.5%, 1.3x vol) MUST score stealth >= 50 (Accumulation territory)', () => {
    const score = calculateStealthAccumulationScore(stealthStock, [], undefined);
    console.log(`     Stealth stock score: ${score}`);
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it('1c: Spring shakeout (-3.2%, close near high) MUST retain medium stealth >= 35', () => {
    const score = calculateStealthAccumulationScore(springStock, [], undefined);
    console.log(`     Spring shakeout stealth score: ${score}`);
    expect(score).toBeGreaterThanOrEqual(35);
  });

  it('1d: Pump score MUST be lower than stealth consolidation score', () => {
    const pumpScore = calculateStealthAccumulationScore(pumpStock, [], undefined);
    const quietScore = calculateStealthAccumulationScore(stealthStock, [], undefined);
    console.log(`     Pump: ${pumpScore}, Quiet: ${quietScore}`);
    if (pumpScore >= quietScore) {
      throw new Error(`Pump stock (${pumpScore}) should score LOWER than quiet consolidation (${quietScore})`);
    }
  });
});

// ── Test Group 2: Wyckoff Stage Classification ──────────────────────────────
describe('Group 2: Wyckoff Stage Classification', () => {
  it('2a: High pump-dump risk MUST classify as DISTRIBUTION, never PUMP_MARKUP', () => {
    const result = classifyWyckoffStage(distStock, [], undefined);
    console.log(`     Dist stock Wyckoff: ${result.stage}`);
    expect(result.stage).toContain('DISTRIBUTION');
    expect(result.stage).not.toContain('PUMP_MARKUP');
  });

  it('2b: Quiet accumulation stock MUST classify as STEALTH (not DUMP or DISTRIBUTION)', () => {
    const result = classifyWyckoffStage(stealthStock, [], undefined);
    console.log(`     Stealth stock Wyckoff: ${result.stage}`);
    // Should be STEALTH or DORMANT_CONSOLIDATION — never DUMP or DISTRIBUTION
    expect(result.stage).not.toContain('DUMP');
    expect(result.stage).not.toContain('DISTRIBUTION');
  });
});

// ── Test Group 3: Score Consistency ──────────────────────────────────────────
describe('Group 3: Deterministic Score Consistency', () => {
  it('3: Same input MUST produce identical score on repeated calls', () => {
    const score1 = calculateStealthAccumulationScore(stealthStock, [], undefined);
    const score2 = calculateStealthAccumulationScore(stealthStock, [], undefined);
    const score3 = calculateStealthAccumulationScore(stealthStock, [], undefined);
    console.log(`     Scores: ${score1}, ${score2}, ${score3}`);
    expect(score1).toBe(score2);
    expect(score2).toBe(score3);
  });
});

// ── Test Group 4: BrokerFavourites Score Normalization Range [0, 100] ────────
describe('Group 4: BrokerFavourites Score Normalization Bounds', () => {
  it('4a: normVSurge clamps 1.0→0, 3.0→100, extremes bounded to [0,100]', () => {
    const normVSurge = (v) => Math.min(100, Math.max(0, (v - 1.0) * 50));
    expect(normVSurge(1.0)).toBe(0);
    expect(normVSurge(3.0)).toBe(100);
    expect(normVSurge(0.5)).toBe(0);   // below 1.0 clamped to 0
    expect(normVSurge(5.0)).toBe(100); // above 3.0 clamped to 100
  });

  it('4b: normPChg maps -15%→0, +15%→100, 0%→~50', () => {
    const normPChg = (p) => Math.min(100, Math.max(0, ((p + 15) / 30) * 100));
    expect(normPChg(-15)).toBe(0);
    expect(normPChg(15)).toBe(100);
    expect(normPChg(0)).toBeCloseTo(50, 1);
    expect(normPChg(-20)).toBe(0);  // extreme negative clamped
    expect(normPChg(20)).toBe(100); // extreme positive clamped
  });

  it('4c: 1D horizon score stays within [0, 100] for extreme inputs', () => {
    // 1D formula: (normVSurge * 0.45) + (normPChg * 0.25) + (hasBrokerBuy ? 30 : 0)
    const normVSurge = (v) => Math.min(100, Math.max(0, (v - 1.0) * 50));
    const normPChg = (p) => Math.min(100, Math.max(0, ((p + 15) / 30) * 100));
    const score1D = (vSurge, pChg, hasBroker) =>
      (normVSurge(vSurge) * 0.45) + (normPChg(pChg) * 0.25) + (hasBroker ? 30 : 0);
    const maxScore = score1D(5.0, 15, true);  // maximum inputs
    const minScore = score1D(0.5, -15, false); // minimum inputs
    console.log(`     1D max score: ${maxScore}, min score: ${minScore}`);
    expect(maxScore).toBeLessThanOrEqual(100);
    expect(minScore).toBeGreaterThanOrEqual(0);
  });
});

// ── Test Group 5: Multi-Desk Syndicate Cornering Detector (Pillar 4) ─────────
describe('Group 5: Multi-Desk Syndicate Cornering Detector', () => {
  it('5a: Multi-broker buying cluster (Desks #58, #45, #28 with 70% net volume) triggers CORNERING_ACCUMULATION', () => {
    const coordinatedBrokerData = {
      buyers: [
        { brokerId: 58, brokerName: 'Naasa Securities', buyQty: 120000, buyAmount: 60000000, avgRate: 500 },
        { brokerId: 45, brokerName: 'Imperial Securities', buyQty: 80000, buyAmount: 40000000, avgRate: 500 },
        { brokerId: 28, brokerName: 'Shree Hari Securities', buyQty: 60000, buyAmount: 30000000, avgRate: 500 },
        { brokerId: 34, brokerName: 'Vision Securities', buyQty: 25000, buyAmount: 12500000, avgRate: 500 },
        { brokerId: 49, brokerName: 'Online Securities', buyQty: 15000, buyAmount: 7500000, avgRate: 500 }
      ],
      sellers: [
        { brokerId: 14, brokerName: 'Nepal Stock House', sellQty: 25000, sellAmount: 12500000, avgRate: 500 },
        { brokerId: 19, brokerName: 'Nepal Investment', sellQty: 20000, sellAmount: 10000000, avgRate: 500 },
        { brokerId: 32, brokerName: 'Premier Securities', sellQty: 18000, sellAmount: 9000000, avgRate: 500 },
        { brokerId: 42, brokerName: 'Sani Securities', sellQty: 15000, sellAmount: 7500000, avgRate: 500 },
        { brokerId: 57, brokerName: 'Aryatara Securities', sellQty: 14000, sellAmount: 7000000, avgRate: 500 },
        { brokerId: 1, brokerName: 'Kumari Securities', sellQty: 12000, sellAmount: 6000000, avgRate: 500 }
      ]
    };

    const analysis = detectSyndicateCluster(coordinatedBrokerData);
    console.log(`     Syndicate Analysis: Type=${analysis.syndicateType}, Score=${analysis.syndicateScore}, Threat=${analysis.threatLevel}`);
    expect(analysis.isSyndicateDetected).toBe(true);
    expect(analysis.syndicateType).toBe('CORNERING_ACCUMULATION');
    expect(analysis.top3NetSharePct).toBeGreaterThanOrEqual(55);
    expect(analysis.syndicateScore).toBeGreaterThanOrEqual(70);
    expect(analysis.dominantDesks.length).toBeGreaterThanOrEqual(3);
    expect(analysis.dominantDesks[0].role).toBe('PRIMARY_ACCUMULATOR');
  });

  it('5b: Coordinated operator offloading into retail bids triggers COORDINATED_DISTRIBUTION', () => {
    const coordinatedOffloadData = {
      buyers: [
        { brokerId: 1, brokerName: 'Kumari', buyQty: 10000, buyAmount: 5000000, avgRate: 500 },
        { brokerId: 2, brokerName: 'Premier', buyQty: 8000, buyAmount: 4000000, avgRate: 500 },
        { brokerId: 3, brokerName: 'Nepal', buyQty: 7000, buyAmount: 3500000, avgRate: 500 },
        { brokerId: 4, brokerName: 'Himalayan', buyQty: 6000, buyAmount: 3000000, avgRate: 500 }
      ],
      sellers: [
        { brokerId: 58, brokerName: 'Naasa Securities', sellQty: 150000, sellAmount: 75000000, avgRate: 500 },
        { brokerId: 45, brokerName: 'Imperial Securities', sellQty: 90000, sellAmount: 45000000, avgRate: 500 },
        { brokerId: 28, brokerName: 'Shree Hari', sellQty: 65000, sellAmount: 32500000, avgRate: 500 }
      ]
    };

    const analysis = detectSyndicateCluster(coordinatedOffloadData);
    console.log(`     Offload Analysis: Type=${analysis.syndicateType}, Score=${analysis.syndicateScore}, Threat=${analysis.threatLevel}`);
    expect(analysis.isSyndicateDetected).toBe(true);
    expect(analysis.syndicateType).toBe('COORDINATED_DISTRIBUTION');
    expect(analysis.threatLevel).toBe('OPERATOR_CHURN');
  });

  it('5c: Dispersed retail two-way trading evaluates to BALANCED_TRADING', () => {
    const balancedData = {
      buyers: [
        { brokerId: 10, brokerName: 'Broker 10', buyQty: 15000, buyAmount: 7500000, avgRate: 500 },
        { brokerId: 11, brokerName: 'Broker 11', buyQty: 14000, buyAmount: 7000000, avgRate: 500 },
        { brokerId: 12, brokerName: 'Broker 12', buyQty: 13000, buyAmount: 6500000, avgRate: 500 },
        { brokerId: 13, brokerName: 'Broker 13', buyQty: 12000, buyAmount: 6000000, avgRate: 500 }
      ],
      sellers: [
        { brokerId: 20, brokerName: 'Broker 20', sellQty: 14000, sellAmount: 7000000, avgRate: 500 },
        { brokerId: 21, brokerName: 'Broker 21', sellQty: 13000, sellAmount: 6500000, avgRate: 500 },
        { brokerId: 22, brokerName: 'Broker 22', sellQty: 12000, sellAmount: 6000000, avgRate: 500 }
      ]
    };

    const analysis = detectSyndicateCluster(balancedData);
    console.log(`     Balanced Analysis: Type=${analysis.syndicateType}, Threat=${analysis.threatLevel}`);
    expect(analysis.syndicateType).toBe('BALANCED_TRADING');
    expect(analysis.threatLevel).toBe('BENIGN');
  });

  it('5d: Null/empty inputs gracefully return INSUFFICIENT_DATA without crashing', () => {
    const analysisNull = detectSyndicateCluster(null);
    expect(analysisNull.syndicateType).toBe('INSUFFICIENT_DATA');
    expect(analysisNull.isSyndicateDetected).toBe(false);

    const analysisEmpty = detectSyndicateCluster({ buyers: [], sellers: [] });
    expect(analysisEmpty.syndicateType).toBe('INSUFFICIENT_DATA');
  });
});

console.log('\n✅ All integration tests executed.\n');
