/**
 * Targeted Stress Test for Stock Profiles:
 * 1. Strongly trending stock
 * 2. Sideways stock
 * 3. Volatile stock
 * 4. Missing volume stock
 * 5. Limited history stock (30-50 candles)
 */

import { generateEntryExitPlan } from '../src/utils/setupAnalyzer.js';

function generateCandles({ days = 100, startPrice = 200, trend = 0, volatility = 0.02, zeroVolume = false }) {
  const candles = [];
  let p = startPrice;
  for (let i = 0; i < days; i++) {
    const d = new Date(2025, 0, 1 + i).toISOString().slice(0, 10);
    const change = (Math.sin(i * 0.3) * volatility) + trend;
    p = Math.max(10, +(p * (1 + change)).toFixed(2));
    const h = +(p * (1 + volatility * 0.8)).toFixed(2);
    const l = +(p * (1 - volatility * 0.8)).toFixed(2);
    candles.push({
      date: d,
      open: p,
      high: Math.max(h, p),
      low: Math.min(l, p),
      close: p,
      volume: zeroVolume ? 0 : 50000 + Math.round(Math.cos(i) * 10000),
    });
  }
  return candles;
}

function checkSafety(profileName, plan) {
  console.log(`\n--- Profile: ${profileName} ---`);
  console.log('Supported:', plan.supported);
  if (!plan.supported) {
    console.log('Reason:', plan.reason);
    return;
  }
  console.log('Setup Score:', plan.setupScore, '| Verdict:', plan.verdict);
  console.log('Confidence:', plan.confidence?.level, '| Sample Size:', plan.confidence?.sampleSize);
  console.log('Setup Type:', plan.setupType);
  console.log('Entry:', plan.levels.entryZone.label);
  console.log('Target 1:', plan.levels.target1.label);
  console.log('Stop Loss:', plan.levels.stopLoss.label);
  console.log('RRR1:', plan.levels.rrr1);
  console.log('Unavailable Factors:', plan.unavailableFactors.join(', ') || 'None');

  // Safety checks
  const valuesToCheck = [
    plan.setupScore,
    plan.levels.rrr1,
    plan.levels.rrr2,
    plan.levels.stopLoss.price,
    plan.levels.target1.price,
    plan.levels.target2.price,
  ];

  for (const v of valuesToCheck) {
    if (v === undefined || v === null || Number.isNaN(v) || !Number.isFinite(v)) {
      throw new Error(`Invalid numeric value in ${profileName}: ${v}`);
    }
  }

  if (plan.levels.stopLoss.price >= plan.ltp) {
    throw new Error(`Stop loss (${plan.levels.stopLoss.price}) >= LTP (${plan.ltp}) in ${profileName}`);
  }
  if (plan.levels.target1.price <= plan.ltp) {
    throw new Error(`Target 1 (${plan.levels.target1.price}) <= LTP (${plan.ltp}) in ${profileName}`);
  }
  if (plan.levels.rrr1 < 0) {
    throw new Error(`Negative RRR1 in ${profileName}: ${plan.levels.rrr1}`);
  }
  console.log('✅ Safety checks passed for', profileName);
}

// 1. Strongly trending stock (trend = +0.008 per day)
const trendingCandles = generateCandles({ days: 220, trend: 0.008, volatility: 0.015 });
const trendingPlan = generateEntryExitPlan({ symbol: 'TREND', ltp: trendingCandles[trendingCandles.length - 1].close }, trendingCandles);
checkSafety('Strongly Trending Stock', trendingPlan);

// 2. Sideways stock (trend = 0, tight volatility)
const sidewaysCandles = generateCandles({ days: 150, trend: 0, volatility: 0.008 });
const sidewaysPlan = generateEntryExitPlan({ symbol: 'SIDEWAYS', ltp: sidewaysCandles[sidewaysCandles.length - 1].close }, sidewaysCandles);
checkSafety('Sideways Stock', sidewaysPlan);

// 3. Volatile stock (large swings)
const volatileCandles = generateCandles({ days: 180, trend: 0, volatility: 0.05 });
const volatilePlan = generateEntryExitPlan({ symbol: 'VOLATILE', ltp: volatileCandles[volatileCandles.length - 1].close }, volatileCandles);
checkSafety('Volatile Stock', volatilePlan);

// 4. Missing volume stock
const noVolCandles = generateCandles({ days: 120, trend: 0.002, volatility: 0.02, zeroVolume: true });
const noVolPlan = generateEntryExitPlan({ symbol: 'NO_VOL', ltp: noVolCandles[noVolCandles.length - 1].close }, noVolCandles);
checkSafety('Missing Volume Stock', noVolPlan);

// 5. Limited history stock (40 candles)
const shortCandles = generateCandles({ days: 40, trend: 0.003, volatility: 0.02 });
const shortPlan = generateEntryExitPlan({ symbol: 'SHORT_HIST', ltp: shortCandles[shortCandles.length - 1].close }, shortCandles);
checkSafety('Limited History Stock (40 bars)', shortPlan);

console.log('\n🎉 ALL STOCK PROFILE STRESS TESTS COMPLETED SUCCESSFULLY!');
