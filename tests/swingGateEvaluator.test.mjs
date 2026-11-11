// tests/swingGateEvaluator.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMarketRegimeGate,
  evaluateStockSwingGates,
  screenUniverseForSwingPicks,
  GATE_NAMES
} from '../src/utils/swingGateEvaluator.js';

test('Swing Gate Evaluator - Market Regime Gate', async (t) => {
  await t.test('passes when NEPSE index is above 20 and 50 EMA with positive breadth', () => {
    const res = evaluateMarketRegimeGate({
      nepseIndex: 2650,
      nepseEma20: 2600,
      nepseEma50: 2550,
      advancers: 160,
      decliners: 70,
      dailyChangePct: 0.8
    });
    assert.equal(res.passed, true);
    assert.equal(res.action, 'REGIME_PASS_TRADE_PERMITTED');
  });

  await t.test('rejects with CAPITAL DEFENSE when NEPSE index is below 50 EMA', () => {
    const res = evaluateMarketRegimeGate({
      nepseIndex: 2450,
      nepseEma20: 2500,
      nepseEma50: 2580,
      advancers: 40,
      decliners: 190,
      dailyChangePct: -1.2
    });
    assert.equal(res.passed, false);
    assert.equal(res.action, 'NO_TRADE_TODAY_CAPITAL_DEFENSE');
    assert.match(res.reason, /below 50 EMA/);
  });

  await t.test('rejects when index suffers sharp single-day plunge > 2%', () => {
    const res = evaluateMarketRegimeGate({
      nepseIndex: 2600,
      nepseEma20: 2590,
      nepseEma50: 2550,
      advancers: 20,
      decliners: 220,
      dailyChangePct: -2.3
    });
    assert.equal(res.passed, false);
    assert.match(res.reason, /sharp decline/);
  });
});

test('Swing Gate Evaluator - Individual Stock 7 Gates', async (t) => {
  const passingRegime = { passed: true };

  await t.test('rejects stock locked at +15% Upper Circuit (Unfillable gap)', () => {
    const stock = {
      symbol: 'UPPER_LOCK',
      ltp: 500,
      pChange: 14.95,
      volume: 100000,
      turnover: 50000000,
      transactions: 500,
      bookValue: 150,
      eps: 25,
      ema20: 450,
      ema50: 420
    };
    const res = evaluateStockSwingGates(stock, passingRegime);
    assert.equal(res.allGatesPassed, false);
    const g3 = res.gates.find(g => g.name.includes('Liquidity'));
    assert.equal(g3.passed, false);
    assert.match(g3.reason, /Upper Circuit/);
  });

  await t.test('rejects stock locked at -15% Lower Circuit (Exit illiquidity)', () => {
    const stock = {
      symbol: 'LOWER_LOCK',
      ltp: 300,
      pChange: -14.95,
      volume: 2000,
      turnover: 600000,
      transactions: 20,
      bookValue: 120,
      eps: 10
    };
    const res = evaluateStockSwingGates(stock, passingRegime);
    assert.equal(res.allGatesPassed, false);
    const g3 = res.gates.find(g => g.name.includes('Liquidity'));
    assert.equal(g3.passed, false);
    assert.match(g3.reason, /Lower Circuit/);
  });

  await t.test('rejects company with negative net worth (distressed fundamental)', () => {
    const stock = {
      symbol: 'DISTRESSED',
      ltp: 250,
      pChange: 3.5,
      volume: 40000,
      turnover: 10000000,
      transactions: 250,
      bookValue: -45, // Negative net worth
      eps: 5,
      ema20: 240,
      ema50: 230
    };
    const res = evaluateStockSwingGates(stock, passingRegime);
    assert.equal(res.allGatesPassed, false);
    const g5 = res.gates.find(g => g.name.includes('Quality'));
    assert.equal(g5.passed, false);
    assert.match(g5.reason, /Negative Net Worth/);
  });

  await t.test('rejects company with negative or collapsing EPS', () => {
    const stock = {
      symbol: 'LOSING_CO',
      ltp: 200,
      pChange: 2.1,
      volume: 30000,
      turnover: 6000000,
      transactions: 150,
      bookValue: 110,
      eps: -8.5, // Negative EPS
      ema20: 195,
      ema50: 190
    };
    const res = evaluateStockSwingGates(stock, passingRegime);
    assert.equal(res.allGatesPassed, false);
    const g5 = res.gates.find(g => g.name.includes('Quality'));
    assert.equal(g5.passed, false);
    assert.match(g5.reason, /Negative or collapsing EPS/);
  });

  await t.test('approves candidate meeting all 7 gates and designs risk plan', () => {
    const stock = {
      symbol: 'QUALITY_EXP',
      ltp: 600,
      pChange: 3.8,
      volume: 85000,
      turnover: 51000000,
      transactions: 650,
      bookValue: 220,
      eps: 32,
      ema20: 575,
      ema50: 550,
      rvol: 2.1,
      isBreakout: true,
      bcr3BuyPct: 38,
      netBrokerQty: 15000,
      promoterLockinDays: 120
    };
    const res = evaluateStockSwingGates(stock, passingRegime, { accountCapital: 1000000, riskPerTradePct: 1.0 });
    assert.equal(res.allGatesPassed, true);
    assert.equal(res.gatesPassedCount, 7);
    assert.equal(res.verdict, 'APPROVED_PAPER_PICK');

    // Risk plan checks
    assert.ok(res.plan.stopLoss < stock.ltp);
    assert.ok(res.plan.target1 > stock.ltp);
    assert.ok(res.plan.target2 > res.plan.target1);
    assert.ok(res.plan.netRewardRiskRatio >= 1.75);
    assert.equal(res.plan.maxHoldingSessions, 7);
    assert.equal(res.plan.dematLockSessions, 2);
  });
});

test('Swing Gate Evaluator - Universe Screening & Capital Defense', async (t) => {
  const bearMarketContext = {
    nepseIndex: 2300,
    nepseEma20: 2420,
    nepseEma50: 2510,
    advancers: 30,
    decliners: 210,
    dailyChangePct: -1.5
  };

  const sampleStocks = [
    { symbol: 'STK1', ltp: 400, pChange: 4.0, volume: 50000, turnover: 20000000, bookValue: 150, eps: 20 },
    { symbol: 'STK2', ltp: 800, pChange: 2.5, volume: 30000, turnover: 24000000, bookValue: 250, eps: 35 }
  ];

  const screenResult = screenUniverseForSwingPicks(sampleStocks, bearMarketContext);
  assert.equal(screenResult.isDefensiveCashMode, true);
  assert.equal(screenResult.statusHeadline, 'NO TRADE TODAY — CAPITAL DEFENSE ACTIVE');
  assert.equal(screenResult.shortlist.length, 0); // Strictly zero trades permitted in bear regime!
});
