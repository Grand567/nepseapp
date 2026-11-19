// tests/atBatch5P1Remediation.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateNepseNetTrade,
  calculateWacc,
  calculateBuyDetails,
} from '../src/utils/calculations.js';

import {
  calculateStockMetrics,
  formatNprMoney,
} from '../src/utils/stockMetrics.js';

import {
  detectWyckoffPhase,
  calculateKellyCriterion,
  evaluateMarketBreadthCashDefense,
  runStockScanners,
} from '../src/utils/quantEngine.js';

import { analyzeTrend } from '../src/utils/technicalAnalysisEngine.js';
import { calculateStockSignals } from '../src/utils/stockSignals.js';
import { calculateMACD } from '../src/utils/indicators.js';
import { calculatePositionSize } from '../src/utils/riskManagement.js';
import { normalizeSectorKey, computeLiveSectorMedians } from '../src/utils/liveSectorMedians.js';
import { evaluateStockSelection } from '../src/utils/signals/stockScoringEngine.js';

test('BUG-033: calculateNepseNetTrade includes Buy DP Rs. 25 and respects >365 long term boundary', () => {
  const trade = calculateNepseNetTrade({
    quantity: 100,
    buyPrice: 500,
    sellPrice: 550,
    holdingDays: 365, // exactly 365 days is Short Term (<= 365)
  });
  assert.equal(trade.buyDp, 25, 'Buy DP should be Rs. 25 per statutory transaction rules');
  assert.equal(trade.cgtRatePct, 7.5, 'Holding exactly 365 days is Short Term (7.5% CGT)');

  const tradeLong = calculateNepseNetTrade({
    quantity: 100,
    buyPrice: 500,
    sellPrice: 550,
    holdingDays: 366, // > 365 is Long Term (5% CGT)
  });
  assert.equal(tradeLong.cgtRatePct, 5.0, 'Holding > 365 days is Long Term (5.0% CGT)');

  // calculateWacc rounding consistency
  const waccRes = calculateWacc([
    { quantity: 100, price: 100 }
  ], [
    { type: 'bonus', bonusPercent: 5.5 } // 100 + 5.5 = 105.5 units -> rounded to 106
  ]);
  assert.equal(waccRes.totalQuantity, 106);
  assert.ok(waccRes.wacc > 0);
  assert.equal(+(waccRes.totalCost / waccRes.totalQuantity).toFixed(2), waccRes.wacc, 'WACC division must use rounded totalQuantity');
});

test('BUG-035: stockScoringEngine returns 0 shares when unaffordable', () => {
  // Stock price Rs. 15,000, portfolio capital Rs. 10,000 -> 10 kitta costs Rs. 150,000, unaffordable
  const evaluation = evaluateStockSelection({
    stock: { symbol: 'RBCL', ltp: 15000, volume: 50000 },
    portfolioContext: { capital: 10000 },
    technicalSignals: { signals: { volatility: { atr14: 300 } } }
  });
  assert.equal(evaluation.executionPlan.positionSizing.sharesKitta, 0, 'Cannot allocate 10 kitta if capital is insufficient');
});

test('BUG-036: Wyckoff UTAD reachable, Kelly zero floor, marketCap scanner in Rupees', () => {
  // UTAD phase reachability
  // currentPos >= 85 && netChg >= 35
  const mockHistoryUTAD = [
    { close: 100 },
    { close: 110 },
    { close: 120 },
    { close: 130 },
    { close: 140 } // netChg = +40%, currentPos = 100%
  ];
  const wyckoff = detectWyckoffPhase(mockHistoryUTAD, 50000);
  assert.match(wyckoff.phase, /Distribution|UTAD/i, 'UTAD must not be shadowed by SOS');

  // Kelly Criterion returns 0 when rawKelly <= 0
  const badKelly = calculateKellyCriterion(20, 1.0); // 20% win rate, 1.0 payoff -> negative EV
  assert.equal(badKelly.recommendationPct, 0, 'Kelly recommendation must be 0 for negative edge setups');

  // Scanner market cap normalization
  const sampleStocks = [
    { symbol: 'LARGE', marketCap: 50_000_000_000, ltp: 500 }, // 50 Arba (50,000M)
    { symbol: 'MID', marketCap: 8_000_000_000, ltp: 300 },     // 8 Arba (8,000M)
    { symbol: 'SMALL', marketCap: 2_000_000_000, ltp: 150 }    // 2 Arba (2,000M)
  ];
  const midScanned = runStockScanners(sampleStocks, 'mid_cap');
  assert.ok(midScanned.some(s => s.symbol === 'MID'), 'MID stock (8 Arba) should be in mid_cap');
  assert.ok(!midScanned.some(s => s.symbol === 'LARGE'), 'LARGE stock (50 Arba) should not be in mid_cap');
  assert.ok(!midScanned.some(s => s.symbol === 'SMALL'), 'SMALL stock (2 Arba) should not be in mid_cap');
});

test('BUG-099: formatNprMoney Arba scale & stockMetrics null fallback', () => {
  assert.equal(formatNprMoney(1_500_000_000), 'Rs 1.50 Arba', '1.5 Arba (1.5e9) should format as 1.50 Arba');
  assert.equal(formatNprMoney(10_000_000_000), 'Rs 10.00 Arba');

  const emptyHistMetrics = calculateStockMetrics({ ltp: 500 }, []);
  assert.equal(emptyHistMetrics.avg120d, null, 'avg120d must be null without history');
  assert.equal(emptyHistMetrics.avg180d, null, 'avg180d must be null without history');
  assert.equal(emptyHistMetrics.ath, null, 'ath must be null without history/allTimeHigh prop');
});

test('BUG-108: technicalAnalysisEngine null safe, stockSignals strict streak, indicators MACD padding', () => {
  // 55 bars closes where ema200 is null and early ema50 are null
  const closes55 = Array.from({ length: 55 }, (_, i) => 100 + i);
  const trend = analyzeTrend(closes55);
  assert.ok(trend.available);
  assert.equal(typeof trend.ema.recentGoldenCross, 'boolean');

  // Strict streak: flat session should break streak
  const flatCloses = [100, 100, 100, 95];
  const signals = calculateStockSignals('TEST', { ltp: 100 }, flatCloses.map((c, i) => ({ close: c, date: `2026-01-0${i+1}` })));
  const streakSignal = signals.find(s => s.id === 'streak');
  assert.equal(streakSignal, undefined, 'Flat closes (0% change) must not trigger winning streak');

  // MACD signalArray alignment
  const macd = calculateMACD(Array.from({ length: 40 }, (_, i) => 100 + i));
  assert.equal(macd.macdArray.length, 40);
  assert.equal(macd.signalArray.length, 40, 'signalArray must have same length as macdArray for chart alignment');
});

test('BUG-148: calculatePositionSize min lot clamping and typo alias', () => {
  const res = calculatePositionSize({
    capital: 5000,
    riskPct: 1.5,
    entryPrice: 1000,
    stopLossPrice: 950, // risk per share = 50. Max risk = 75 Rs. Raw shares = 1.5 < 10
  });
  assert.equal(res.shares, 0, 'Cannot force 10 kitta when raw shares < 10 lot');

  const kellyRes = calculatePositionSize({
    capital: 100000,
    riskPct: 1.5,
    entryPrice: 100,
    stopLossPrice: 95,
    useKelly: true,
    winRate: 0.6,
    avgWin: 10,
    avgLoss: 5,
  });
  assert.ok(kellyRes.kelly.kellyCapital !== undefined, 'kellyCapital should exist');
  assert.ok(kellyRes.kelly.kellyCaptital !== undefined, 'kellyCaptital alias preserved');
});

test('BUG-149: liveSectorMedians snake_case alignment and pure equity filtering', () => {
  assert.equal(normalizeSectorKey('Commercial Bank'), 'commercial_bank');
  assert.equal(normalizeSectorKey('Development Bank'), 'development_bank');
  assert.equal(normalizeSectorKey('Hydropower'), 'hydropower');
  assert.equal(normalizeSectorKey('Life Insurance'), 'life_insurance');
  assert.equal(normalizeSectorKey('Non-Life Insurance'), 'non_life_insurance');

  const testStocks = [
    { symbol: 'NABIL', sector: 'Commercial Bank', pe: 18, pb: 2.5, roe: 14, eps: 25 },
    { symbol: 'SANIMA', sector: 'Commercial Bank', pe: 16, pb: 2.1, roe: 12, eps: 20 },
    { symbol: 'KBL', sector: 'Commercial Bank', pe: 20, pb: 2.8, roe: 11, eps: 18 },
    { symbol: 'HLICF', sector: 'Commercial Bank', pe: 5, pb: 0.8, roe: 4, eps: 2 } // Mutual Fund
  ];
  computeLiveSectorMedians(testStocks);
});
