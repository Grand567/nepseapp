// Batch B indicator correctness tests
import { calculateEMA, calculateMACD, calculateRSI, calculateBollingerBands, calculateATR, calculateSMA } from '../src/utils/indicators.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); pass++; }
  else { console.error('  FAIL:', msg); fail++; }
}

// ── B1: EMA SMA seed test
const flat100 = Array(30).fill(100);
const ema10flat = calculateEMA(flat100, 10);
assert(Math.abs(ema10flat[9] - 100) < 0.001, 'EMA(10) seed equals SMA=100 on flat series at index 9');
assert(Math.abs(ema10flat[29] - 100) < 0.001, 'EMA(10) stays at 100 on flat series at index 29');
assert(ema10flat.isApproximate === false, 'EMA(10) on 30 candles is not approximate');

const rising = [100,102,104,106,108,110,112,114,116,118,120];
const emaRising = calculateEMA(rising, 5);
assert(Math.abs(emaRising[4] - 104) < 0.001, 'EMA(5) seed = SMA(5) = 104');
assert(emaRising[10] > 104, 'EMA(5) at end of rising series > seed');

// Short series truncation
const tiny = calculateEMA([100,102,104], 10);
assert(tiny.isApproximate === true, 'EMA with fewer prices than period is marked approximate');

// ── B2: MACD null on insufficient data
const macdShort = calculateMACD(Array(20).fill(100));
assert(macdShort.isInsufficient === true, 'MACD returns isInsufficient:true for series < 26');
assert(macdShort.line === null, 'MACD line is null when insufficient');

// MACD on sufficient flat data
const macdFlat = calculateMACD(Array(60).fill(200));
assert(macdFlat.line !== null, 'MACD line is non-null on 60-candle flat series');
assert(Math.abs(macdFlat.line) < 0.01, 'MACD line near 0 on flat series');
assert(Math.abs(macdFlat.histogram) < 0.01, 'MACD histogram near 0 on flat series');

// ── RSI returns null instead of 50 on insufficient data
const rsiNull = calculateRSI([100,102,101]);
assert(rsiNull === null, 'RSI returns null with < 14 candles (B6)');

// RSI on flat series should be 50 (balanced gains/losses)
// Actually with all zero changes RSI is undefined (no avg gain/loss) — returns 0
const rsiFlat = calculateRSI(Array(20).fill(100));
assert(rsiFlat !== null, 'RSI returns non-null on 20-candle flat series');

// ── B3: Bollinger Bands
const bb = calculateBollingerBands(flat100, 20);
assert(bb !== null, 'Bollinger Bands computed on 30-candle flat series');
assert(bb.middle === 100, 'Bollinger middle = 100 on flat series');
assert(bb.upper === 100 && bb.lower === 100, 'Bollinger upper=lower=100 on flat series (no volatility)');
assert(bb.squeeze === true, 'Bollinger squeeze=true on zero-bandwidth flat series');

const bbNull = calculateBollingerBands([100,102,104], 20);
assert(bbNull === null, 'Bollinger Bands returns null with insufficient data');

// ── B4: ATR
const candles = Array.from({length: 20}, (_, i) => ({
  high: 110 + i * 0.5,
  low: 90 + i * 0.5,
  close: 100 + i * 0.5
}));
const atr = calculateATR(candles, 14);
assert(atr !== null && atr > 0, `ATR computed on 20 candles: ${atr}`);
assert(atr >= 18 && atr <= 22, `ATR on range-20 candles is approximately 20: ${atr}`);
assert(calculateATR([{high:110,low:90,close:100}], 14) === null, 'ATR null with 1 candle');

// ── B5: SMA
const sma = calculateSMA([10,20,30,40,50], 3);
assert(sma[2] === 20, 'SMA(3) at index 2 = (10+20+30)/3 = 20');
assert(sma[4] === 40, 'SMA(3) at index 4 = (30+40+50)/3 = 40');
assert(sma[0] === null, 'SMA(3) at index 0 is null (insufficient)');
assert(sma.isApproximate === false, 'SMA(3) on 5 values is not approximate');

const smaApprox = calculateSMA([10,20,30], 10);
assert(smaApprox.isApproximate === true, 'SMA(10) on 3 values is approximate');

console.log(`\nB-BATCH TESTS: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
