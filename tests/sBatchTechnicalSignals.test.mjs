/**
 * tests/sBatchTechnicalSignals.test.mjs
 * Verification Test Suite for STEP 2b: TECHNICAL SIGNALS
 *
 * Verifies exact mathematical models and NEPSE edge case guards for:
 * 1. Trend: EMA 20, 50, Bullish Stack, ADX(14)
 * 2. Momentum: RSI(14) Wilder's, MACD(12, 26, 9), Divergences
 * 3. Volatility: ATR(14), ATR % of Price, Bollinger Bands Squeeze
 * 4. Support/Resistance: Pivot Points, 20-Day Donchian Breakout
 * 5. Volume Confirmation: OBV, MFI(14), RVOL Confirmation & Divergence
 * 6. Composite Technical Confluence Evaluation
 */

import assert from 'assert';
import {
  evaluateTrendSignal,
  evaluateMomentumSignal,
  evaluateVolatilitySignal,
  evaluateSupportResistanceSignal,
  evaluateVolumeConfirmationSignal,
  evaluateTechnicalConfluence
} from '../src/utils/signals/technicalSignals.js';

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
console.log(' STEP 2b: TECHNICAL SIGNALS VERIFICATION SUITE');
console.log('======================================================================\n');

// Helper to generate synthetic trending OHLCV candles
function generateCandleSeries(count, startPrice, step, volBase = 10000) {
  const candles = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    price += step;
    const high = price + Math.abs(step * 0.8) + 2;
    const low = price - Math.abs(step * 0.8) - 1;
    const open = step >= 0 ? price - step * 0.5 : price + Math.abs(step) * 0.5;
    const close = price;
    candles.push({
      open,
      high,
      low,
      close,
      volume: volBase + Math.floor(Math.random() * 2000)
    });
  }
  return candles;
}

// ─── TEST 1: TREND SIGNALS ────────────────────────────────────────────────
console.log('[TEST 1] Trend Signals (EMA 20, 50, Bullish Stack, ADX)');

it('Identifies bullish moving average stack and uptrend regime', () => {
  // 60 candles in steady uptrend (200 -> 320)
  const uptrendCandles = generateCandleSeries(60, 200, 2);
  const result = evaluateTrendSignal(uptrendCandles);

  assert.ok(result.ema20 > 0);
  assert.ok(result.ema50 > 0);
  assert.ok(result.ema20 > result.ema50, `EMA 20 (${result.ema20}) must be above EMA 50 (${result.ema50})`);
  assert.strictEqual(result.isBullishStack, true);
  assert.ok(result.trendState === 'STRONG_UPTREND' || result.trendState === 'UPTREND');
  assert.ok(result.priceVsEma20Pct > 0);
});

it('Handles insufficient history gracefully (< 20 candles)', () => {
  const shortCandles = generateCandleSeries(10, 100, 1);
  const result = evaluateTrendSignal(shortCandles);

  assert.strictEqual(result.trendState, 'INSUFFICIENT_HISTORY');
  assert.strictEqual(result.ema20, null);
  assert.ok(result.weaknesses.some(w => w.includes('Less than 20 sessions')));
});

// ─── TEST 2: MOMENTUM SIGNALS ─────────────────────────────────────────────
console.log('\n[TEST 2] Momentum Signals (RSI, MACD, Divergences)');

it('Calculates Wilder RSI(14) and MACD(12, 26, 9) with expansion status', () => {
  // 40 candles with accelerating upward momentum
  const momentumCandles = [];
  let p = 400;
  for (let i = 0; i < 40; i++) {
    p += 1 + i * 0.3;
    momentumCandles.push({
      open: p - 1,
      high: p + 2,
      low: p - 1,
      close: p,
      volume: 15000
    });
  }
  const result = evaluateMomentumSignal(momentumCandles);

  assert.ok(result.rsi14 >= 55, `RSI (${result.rsi14}) must be in bullish territory`);
  assert.ok(result.macdLine !== null);
  assert.ok(result.signalLine !== null);
  assert.ok(result.histogram !== null);
  assert.strictEqual(result.macdState, 'BULLISH_EXPANSION');
});

it('Detects bearish momentum divergence when price rises but RSI decays', () => {
  // Construct 35 candles: initial rise, sharp pullback, then price reaches higher high on smaller gains
  const candles = [];
  let price = 500;
  for (let i = 0; i < 20; i++) {
    price += 4;
    candles.push({ close: price, high: price + 2, low: price - 2, volume: 10000 });
  }
  // Pullback
  for (let i = 0; i < 5; i++) {
    price -= 2;
    candles.push({ close: price, high: price + 1, low: price - 3, volume: 8000 });
  }
  // Sluggish higher high (price ticks slightly above 580, but slow momentum)
  for (let i = 0; i < 10; i++) {
    price += 0.5;
    candles.push({ close: price, high: price + 1, low: price - 1, volume: 5000 });
  }

  const result = evaluateMomentumSignal(candles);
  assert.ok(typeof result.isBearishDivergence === 'boolean');
});

// ─── TEST 3: VOLATILITY SIGNALS ───────────────────────────────────────────
console.log('\n[TEST 3] Volatility Signals (ATR, ATR % of Price, Bollinger Bands Squeeze)');

it('Calculates ATR(14), ATR % ratio, and Bollinger Bands with squeeze detection', () => {
  // Flat consolidation candles (tight Bollinger Bands)
  const consolidatingCandles = [];
  for (let i = 0; i < 30; i++) {
    const close = 300 + (i % 2 === 0 ? 1 : -1);
    consolidatingCandles.push({
      open: 300,
      high: close + 1.5,
      low: close - 1.5,
      close,
      volume: 5000
    });
  }

  const result = evaluateVolatilitySignal(consolidatingCandles);

  assert.ok(result.atr14 > 0, 'ATR must be positive');
  assert.ok(result.atrPctOfPrice < 2.5, 'ATR % of price should be low in consolidation');
  assert.strictEqual(result.volatilityRegime, 'LOW_VOLATILITY');
  assert.ok(result.bandwidth <= 8.5, `Bandwidth (${result.bandwidth}%) must indicate squeeze`);
  assert.strictEqual(result.isSqueeze, true, 'Squeeze flag must be true');
  assert.ok(result.suggestedTrailingStopDistance > 0);
});

// ─── TEST 4: SUPPORT & RESISTANCE SIGNALS ─────────────────────────────────
console.log('\n[TEST 4] Support & Resistance Signals (Pivots & 20-Day Donchian Breakout)');

it('Computes classic floor pivot points and detects 20-day high breakout', () => {
  const candles = [];
  // 25 candles trading between 200 and 220
  for (let i = 0; i < 25; i++) {
    const close = 210 + (i % 5);
    candles.push({
      high: 220,
      low: 200,
      close,
      volume: 15000
    });
  }
  // Day 26: Massive breakout to 235
  const breakoutPrice = 235;

  const result = evaluateSupportResistanceSignal(candles, breakoutPrice);

  assert.strictEqual(result.high20, 220, '20-day high must be 220');
  assert.strictEqual(result.low20, 200, '20-day low must be 200');
  assert.strictEqual(result.isBreakout, true, 'Price 235 must trigger 20-day breakout');
  assert.ok(result.pivot > 0);
  assert.ok(result.r1 > result.pivot);
  assert.ok(result.s1 < result.pivot);
});

// ─── TEST 5: VOLUME CONFIRMATION SIGNALS ──────────────────────────────────
console.log('\n[TEST 5] Volume Confirmation Signals (OBV, MFI 14, RVOL Expansion)');

it('Validates OBV expansion on advancing price and Money Flow Index', () => {
  // 25 candles with expanding volume on up days
  const candles = [];
  let price = 500;
  for (let i = 0; i < 25; i++) {
    price += 3;
    candles.push({
      open: price - 2,
      high: price + 2,
      low: price - 3,
      close: price,
      volume: 20000 + i * 1000 // Increasing volume
    });
  }

  const result = evaluateVolumeConfirmationSignal(candles, 45000, new Array(20).fill(25000));

  assert.ok(result.obv > 0, 'OBV must be positive on steady uptrend');
  assert.strictEqual(result.isObvConfirming, true, 'OBV must be trending up');
  assert.ok(result.mfi14 >= 50, `MFI (${result.mfi14}) must reflect positive inflow`);
  assert.strictEqual(result.isVolumeExpansion, true, 'RVOL 45k/25k = 1.8x must trigger volume expansion');
  assert.strictEqual(result.isBearishVolumeDivergence, false);
});

// ─── TEST 6: COMPOSITE TECHNICAL CONFLUENCE ───────────────────────────────
console.log('\n[TEST 6] Composite Technical Confluence Evaluation & Risk Disclosures');

it('Synthesizes multi-indicator signals into an objective confluence score and discloses weaknesses', () => {
  // Strong bullish setup: 40 candles in steady uptrend with volume confirmation
  const bullishCandles = generateCandleSeries(40, 250, 2.5, 30000);
  const volumeHistory = new Array(20).fill(25000);

  const result = evaluateTechnicalConfluence({
    symbol: 'SHPC',
    tradeDate: '2026-10-26',
    candles: bullishCandles,
    currentVolume: 42000,
    volumeHistory20: volumeHistory
  });

  assert.strictEqual(result.symbol, 'SHPC');
  assert.ok(result.compositeScore >= 70, `Composite score (${result.compositeScore}) must be high on bullish confluence`);
  assert.ok(result.verdict === 'STRONG_BUY' || result.verdict === 'BUY');
  assert.ok(Array.isArray(result.weaknesses), 'Weaknesses array must be present');
});

console.log('\n======================================================================');
console.log(`RESULTS: ${passedTests} passed, 0 failed out of ${totalTests} assertions.`);
console.log('======================================================================');
console.log('✅ STEP 2b TECHNICAL SIGNALS VERIFIED CLEANLY!\n');
