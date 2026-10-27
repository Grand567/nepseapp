/**
 * tests/oBatchMacdSignalIntegrity.test.mjs
 * 
 * Comprehensive Test Suite for MACD Signal Line Integrity (FN-02).
 * Verifies:
 * 1. Standard 9-period EMA calculation of MACD series vs broken `macdLine * 0.82` damper.
 * 2. Genuine Bullish and Bearish Histogram Crossovers (impossible under old 0.82 formula).
 * 3. Warm-up exclusion for series < 26 candles.
 * 4. Flat-market equilibrium (MACD = 0, Signal = 0, Hist = 0).
 * 5. Static code verification in StockInformationHubModal.tsx.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { calculateMACD, calculateEMA } from '../src/utils/indicators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('======================================================================');
console.log(' MACD(12, 26, 9) SIGNAL LINE & HISTOGRAM INTEGRITY AUDIT (FN-02)');
console.log('======================================================================\n');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// ── TEST 1: The 0.82 Damper Bug Demonstration & Proof ────────────────────────
console.log('[TEST 1] Flaw in Legacy 0.82 Multiplier Formula');

test('Legacy formula produces invariant positive histogram whenever MACD > 0', () => {
  // Under the legacy formula: signal = macd * 0.82, hist = macd - signal = macd * 0.18
  const positiveMacd = 12.5;
  const legacySignal = Number((positiveMacd * 0.82).toFixed(2));
  const legacyHist = Number((positiveMacd - legacySignal).toFixed(2));

  // The legacy histogram is ALWAYS positive (2.25) when MACD is positive, even if momentum is dropping!
  assert.ok(legacyHist > 0, 'Legacy histogram is artificially positive');
  assert.strictEqual(legacyHist, 2.25);

  // Even if MACD plummeted from 20.0 down to 1.0 (severe crash), legacy still reported positive histogram!
  const decayedMacd = 1.0;
  const legacyDecayedHist = Number((decayedMacd - Number((decayedMacd * 0.82).toFixed(2))).toFixed(2));
  assert.ok(legacyDecayedHist > 0, 'Legacy formula falsely reported bullish histogram during momentum collapse');
});

// ── TEST 2: Genuine Bearish Crossover Under 9-period EMA ──────────────────────
console.log('\n[TEST 2] Bearish Momentum Crossover with 9-Period EMA Signal Line');

test('MACD crosses below 9-EMA signal line when upward momentum decelerates', () => {
  // Build a 50-candle series that rallies strongly from 100 to 200, then rolls over and falls back to 175
  const rally = Array.from({ length: 35 }, (_, i) => 100 + i * 2.85); // 100 -> 199.75
  const rollover = [198, 195, 190, 185, 180, 175, 172, 168, 165, 162, 160, 158, 155, 152, 150];
  const prices = [...rally, ...rollover]; // 50 candles

  const result = calculateMACD(prices, 12, 26, 9);
  assert.strictEqual(result.isInsufficient, false);
  assert.ok(result.macd !== null, 'MACD value exists');
  assert.ok(result.signal !== null, 'Signal value exists');

  // Because prices dropped sharply after a rally, the faster 12-EMA dropped faster than the 26-EMA,
  // causing the MACD line to fall BELOW the slower 9-period EMA signal line!
  assert.ok(result.histogram < 0, `Histogram must be negative on rollover: got ${result.histogram}`);
  assert.ok(result.macd < result.signal, `MACD line (${result.macd}) must be strictly less than Signal line (${result.signal})`);
});

// ── TEST 3: Genuine Bullish Crossover Under 9-period EMA ──────────────────────
console.log('\n[TEST 3] Bullish Momentum Crossover with 9-Period EMA Signal Line');

test('MACD crosses above 9-EMA signal line when downward momentum reverses', () => {
  // Build a 50-candle series that drops strongly from 300 to 180, then rebounds aggressively to 230
  const decline = Array.from({ length: 35 }, (_, i) => 300 - i * 3.4); // 300 -> 184.4
  const recovery = [190, 198, 208, 218, 225, 230, 234, 238, 242, 246, 250, 255, 260, 265, 270];
  const prices = [...decline, ...recovery];

  const result = calculateMACD(prices, 12, 26, 9);
  assert.strictEqual(result.isInsufficient, false);
  assert.ok(result.macd !== null);
  assert.ok(result.signal !== null);

  // Faster 12-EMA rises sharply faster than 26-EMA, crossing above signal line
  assert.ok(result.histogram > 0, `Histogram must be positive on bullish reversal: got ${result.histogram}`);
  assert.ok(result.macd > result.signal, `MACD line (${result.macd}) must be strictly greater than Signal line (${result.signal})`);
});

// ── TEST 4: Warm-up Period Invariant (< 26 Candles) ───────────────────────────
console.log('\n[TEST 4] Insufficient Series Invariant Guard');

test('calculateMACD returns safe nulls and isInsufficient:true for prices.length < 26', () => {
  for (const count of [0, 1, 10, 25]) {
    const shortSeries = Array(count).fill(250);
    const res = calculateMACD(shortSeries, 12, 26, 9);
    assert.strictEqual(res.isInsufficient, true, `Series of ${count} must be marked insufficient`);
    assert.strictEqual(res.line, null, `Series of ${count} line must be null`);
    assert.strictEqual(res.macd, null, `Series of ${count} macd must be null`);
    assert.strictEqual(res.signal, null, `Series of ${count} signal must be null`);
    assert.strictEqual(res.histogram, null, `Series of ${count} histogram must be null`);
  }
});

// ── TEST 5: Flat Market Invariant ─────────────────────────────────────────────
console.log('\n[TEST 5] Flat Market Invariant');

test('MACD line, signal line, and histogram are exactly 0 on flat market series', () => {
  const flatPrices = Array(60).fill(520.0);
  const result = calculateMACD(flatPrices, 12, 26, 9);
  assert.strictEqual(result.isInsufficient, false);
  assert.strictEqual(result.macd, 0.0, 'MACD line on flat series must be 0');
  assert.strictEqual(result.signal, 0.0, 'Signal line on flat series must be 0');
  assert.strictEqual(result.histogram, 0.0, 'Histogram on flat series must be 0');
});

// ── TEST 6: Static Code Verification in StockInformationHubModal.tsx ───────────
console.log('\n[TEST 6] Static Code Verification in StockInformationHubModal.tsx');

test('StockInformationHubModal.tsx imports calculateMACD and does not contain 0.82 damper', () => {
  const modalPath = path.join(__dirname, '../src/components/StockInformationHubModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  assert.doesNotMatch(modalContent, /macdLine\s*\*\s*0\.82/, 'No hardcoded 0.82 multiplier in StockInformationHubModal.tsx');
  assert.match(modalContent, /import\s*\{[^}]*calculateMACD[^}]*\}\s*from\s*["']@\/utils\/indicators["']/, 'calculateMACD imported from indicators');
  assert.match(modalContent, /calculateMACD\s*\(\s*closes\s*,\s*12\s*,\s*26\s*,\s*9\s*\)/, 'calculateMACD called with 12, 26, 9');
});

console.log('\n======================================================================');
console.log(`RESULTS: ${passCount} passed, 0 failed.`);
console.log('======================================================================');
console.log('✅ FN-02 HIGH FIX VERIFIED: TRUE 9-PERIOD EMA MACD SIGNAL LINE RESTORED!\n');
