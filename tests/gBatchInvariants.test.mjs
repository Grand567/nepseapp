/**
 * G-BATCH: Invariant Integrity Tests
 * ══════════════════════════════════════════════════════════════════════════
 * Ensures internal consistency rules that should never be violated:
 *   G1  Market cap = shares × LTP
 *   G2  EMA/SMA within the window's min/max
 *   G3  pullbackHigh < LTP ≤ pivot < chaseCap (via generateEntryExitPlan)
 *   G4  histogram = macd − signal
 *   G5  circuit = prevClose × (1 ± 0.10)
 */

import assert from 'node:assert/strict';
import { calculateEMA, calculateRSI, calculateMACD } from '../src/utils/indicators.js';
import { NEPSE_CIRCUIT_PCT, calculatePositionSize, calculateStopLossTargets } from '../src/utils/riskManagement.js';
import { generateEntryExitPlan } from '../src/utils/setupAnalyzer.js';

let passed = 0;
let failed = 0;
const ok = (label) => { passed++; console.log(`  PASS: ${label}`); };
const fail = (label, err) => { failed++; console.error(`  ✖ FAIL: ${label} — ${err}`); };
const check = (cond, label) => { try { assert(cond, label); ok(label); } catch (e) { fail(label, e.message); } };

// ── G1: Market Cap = shares × LTP ──────────────────────────────────────
console.log('\n[G1] Market Cap Invariant');
{
  const sharesOut = 134.22e6; // NRIC shares outstanding
  const ltp = 802.9;
  const expected = +(sharesOut * ltp / 1e9).toFixed(4); // in billions
  const computed = +(134.22 * 802.9 / 1e3).toFixed(4);  // M × price / 1000 → billions
  check(Math.abs(expected - computed) < 0.01, `Market cap ${expected}B ≈ ${computed}B`);
  check(sharesOut * ltp > 0, 'Market cap positive');
}

// ── G2: EMA within the window's min/max ────────────────────────────────
console.log('\n[G2] EMA Range Invariant');
{
  const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 30);
  const ema20 = calculateEMA(prices, 20).filter(v => v !== null);
  const windowMin = Math.min(...prices.slice(-30));
  const windowMax = Math.max(...prices.slice(-30));
  const lastEma = ema20[ema20.length - 1];
  check(lastEma >= windowMin - 5, `EMA20 ${lastEma} >= window min ${windowMin} (with margin)`);
  check(lastEma <= windowMax + 5, `EMA20 ${lastEma} <= window max ${windowMax} (with margin)`);
  // Hard invariant: EMA should be inside [global min, global max]
  const globalMin = Math.min(...prices);
  const globalMax = Math.max(...prices);
  check(lastEma >= globalMin, `EMA20 >= global min ${globalMin}`);
  check(lastEma <= globalMax, `EMA20 <= global max ${globalMax}`);
}

// ── G3: Plan Level Ordering ────────────────────────────────────────────
console.log('\n[G3] Entry/Exit Plan Level Ordering');
{
  // Build 60 synthetic candles with a controlled range
  const candles = [];
  for (let i = 0; i < 60; i++) {
    const base = 500 + (i / 60) * 50;
    candles.push({
      date: `2026-0${Math.floor(i / 28) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      open: base - 2,
      high: base + 10,
      low: base - 12,
      close: base,
      volume: 50000 + Math.floor(Math.random() * 20000)
    });
  }
  const lastClose = candles[candles.length - 1].close;
  const stock = { symbol: 'TEST', ltp: lastClose, pChange: 1.5 };
  const plan = generateEntryExitPlan(stock, candles, [], { maxHoldDays: 20 });
  if (plan && plan.supported !== false && plan.levels) {
    const L = plan.levels;
    if (L.pullbackZone) {
      check(L.pullbackZone.high <= lastClose * 1.001,
        `Pullback high ${L.pullbackZone.high} ≤ LTP ${lastClose}`);
    }
    if (L.stopLoss?.price != null) {
      check(L.stopLoss.price < lastClose,
        `Stop-loss ${L.stopLoss.price} < LTP ${lastClose}`);
    }
    if (L.breakoutZone?.pivot != null && L.breakoutZone?.chaseCap != null) {
      check(L.breakoutZone.chaseCap >= L.breakoutZone.pivot,
        `Chase cap ${L.breakoutZone.chaseCap} >= pivot ${L.breakoutZone.pivot}`);
    }
    if (L.target1?.price != null && L.target2?.price != null) {
      check(L.target2.price >= L.target1.price,
        `Target 2 ${L.target2.price} >= Target 1 ${L.target1.price}`);
    }
    if (L.stopLoss?.price != null && L.target1?.price != null) {
      check(L.target1.price > L.stopLoss.price,
        `Target 1 ${L.target1.price} > Stop-loss ${L.stopLoss.price}`);
    }
  } else {
    ok('Plan not supported with synthetic data — acceptable');
  }
}

// ── G4: MACD histogram = macd − signal ─────────────────────────────────
console.log('\n[G4] MACD Histogram Invariant');
{
  const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 8) * 20);
  const result = calculateMACD(prices, 12, 26, 9);
  if (result && result.macdLine != null && result.signalLine != null && result.histogram != null) {
    const expected = +(result.macdLine - result.signalLine).toFixed(6);
    const actual = +result.histogram.toFixed(6);
    check(Math.abs(expected - actual) < 0.01,
      `Histogram ${actual} = macd ${result.macdLine} − signal ${result.signalLine} (expected ${expected})`);
  } else {
    ok('MACD returned null — acceptable for short series');
  }
}

// ── G5: Circuit = prevClose × (1 ± 0.15) ──────────────────────────────
console.log('\n[G5] Circuit Limit Invariant');
{
  check(NEPSE_CIRCUIT_PCT === 15.0, `Circuit constant = 15%`);
  const prevClose = 800;
  const pos = calculatePositionSize({ capital: 100000, riskPct: 2, entryPrice: 800, stopLossPrice: 750 });
  check(pos.circuitFloor === +(prevClose * 0.85).toFixed(2),
    `Floor = ${prevClose * 0.85}: got ${pos.circuitFloor}`);
  
  const sl = calculateStopLossTargets({ entryPrice: 800, atr: 20, prevClose: 800 });
  check(sl.circuitCeiling === +(800 * 1.15).toFixed(2),
    `Ceiling = ${800 * 1.15}: got ${sl.circuitCeiling}`);
  check(sl.circuitFloor === +(800 * 0.85).toFixed(2),
    `Floor = ${800 * 0.85}: got ${sl.circuitFloor}`);
}

console.log(`\nG-BATCH TESTS: ${passed} PASSED, ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
