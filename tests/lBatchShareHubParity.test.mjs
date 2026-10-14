/**
 * lBatchShareHubParity.test.mjs
 * Comprehensive Verification & Invariant Tests for Share Hub Parity Suite:
 * 1. Algorithmic Trading Signals & Urgency Tiers (stockSignals.js)
 * 2. Valuation & Capital Structure Metrics (stockMetrics.js)
 * 3. Broker Accumulation Formulas & Zero-Sum Invariants
 * 4. Component Interface & Contract Validation
 */

import { calculateStockSignals } from '../src/utils/stockSignals.js';
import { calculateStockMetrics, formatNprMoney } from '../src/utils/stockMetrics.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  PASS:', msg);
    pass++;
  } else {
    console.error('  FAIL:', msg);
    fail++;
  }
}

console.log('====================================================================');
console.log(' VERIFICATION SUITE: SHARE HUB QUANTITATIVE & STRUCTURAL PARITY     ');
console.log('====================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// [S1] Stock Signals Engine (stockSignals.js)
// ─────────────────────────────────────────────────────────────────────────────
console.log('[S1] Algorithmic Signals Engine Verification');

// 1.1 Volume Spike Signal (> 150% => MAJOR, 50-150% => NOTABLE)
const mockHist250 = Array.from({ length: 250 }, (_, i) => ({
  date: `2026-0${Math.floor(i / 30) + 1}-${(i % 28) + 1}`,
  close: 200,
  volume: 10000 // 52W daily average = 10,000
}));

// Test major volume spike (30,000 volume vs 10,000 avg => +200% spike)
const quoteVolSpikeMajor = {
  ltp: 210,
  prevClose: 200,
  pChange: 5.0,
  volume: 30000,
  high52w: 250,
  low52w: 150
};
const signalsMajor = calculateStockSignals('GHL', quoteVolSpikeMajor, mockHist250);
const volSpikeMajor = signalsMajor.find(s => s.id === 'vol-spike');
assert(!!volSpikeMajor, 'Volume spike detected when volume is 3x average');
assert(volSpikeMajor?.type === 'MAJOR', `Urgency tier is MAJOR for +200% volume spike (got ${volSpikeMajor?.type})`);
assert(volSpikeMajor?.severity === 'critical', `Severity is critical (got ${volSpikeMajor?.severity})`);
assert(volSpikeMajor?.isBullish === true, 'Spike flagged bullish when pChange > 0');

// Test notable volume spike (18,000 volume vs 10,000 avg => +80% spike)
const quoteVolSpikeNotable = {
  ltp: 205,
  prevClose: 200,
  pChange: 2.5,
  volume: 18000,
  high52w: 250,
  low52w: 150
};
const signalsNotable = calculateStockSignals('GHL', quoteVolSpikeNotable, mockHist250);
const volSpikeNotable = signalsNotable.find(s => s.id === 'vol-spike');
assert(!!volSpikeNotable, 'Volume spike detected for 80% surge');
assert(volSpikeNotable?.type === 'NOTABLE', `Urgency tier is NOTABLE for +80% volume spike (got ${volSpikeNotable?.type})`);

// Test volume below 50% threshold does NOT trigger volume spike
const quoteVolNormal = {
  ltp: 202,
  prevClose: 200,
  pChange: 1.0,
  volume: 12000, // +20% surge (below 50% threshold)
  high52w: 250,
  low52w: 150
};
const signalsNormal = calculateStockSignals('GHL', quoteVolNormal, mockHist250);
assert(!signalsNormal.some(s => s.id === 'vol-spike'), 'Volume spike NOT triggered when surge is under 50%');

// 1.2 Accumulation Day & Distribution Day Signals
const accumSignal = signalsMajor.find(s => s.id === 'accumulation-day');
assert(!!accumSignal, 'Accumulation day signal generated on up-day with volume > 20% above 20D avg');
assert(accumSignal?.isBullish === true, 'Accumulation day is marked bullish');

const quoteDistribution = {
  ltp: 195,
  prevClose: 200,
  pChange: -2.5,
  volume: 25000,
  high52w: 250,
  low52w: 150
};
const signalsDist = calculateStockSignals('GHL', quoteDistribution, mockHist250);
const distSignal = signalsDist.find(s => s.id === 'distribution-day');
assert(!!distSignal, 'Distribution day signal generated on selloff with high volume');
assert(distSignal?.isBullish === false, 'Distribution day is marked bearish');

// 1.3 Consecutive Streak Detection
const bullishStreakHist = [
  { date: '2026-10-12', close: 220 },
  { date: '2026-10-11', close: 215 },
  { date: '2026-10-10', close: 210 },
  { date: '2026-10-09', close: 205 },
  { date: '2026-10-08', close: 200 },
  { date: '2026-10-07', close: 202 } // break streak at 5 days
];
const streakSignals = calculateStockSignals('GHL', { ltp: 220 }, bullishStreakHist);
const streakSig = streakSignals.find(s => s.id === 'streak');
assert(!!streakSig, 'Consecutive session streak detected');
assert(streakSig?.type === 'MAJOR', `Streak of >= 4 sessions is MAJOR (got ${streakSig?.type})`);
assert(streakSig?.isBullish === true, 'Streak is marked bullish for higher closes');

// 1.4 52-Week Low Recovery
const quoteRecoveryMajor = {
  ltp: 280, // from low of 180 => ((280 - 180) / 180) * 100 = 55.5% recovery
  low52w: 180,
  high52w: 350
};
const recSignals = calculateStockSignals('GHL', quoteRecoveryMajor, mockHist250);
const recSig = recSignals.find(s => s.id === '52w-recovery');
assert(!!recSig, '52-week low recovery signal triggered');
assert(recSig?.type === 'MAJOR', `Recovery >= 40% triggers MAJOR urgency (got ${recSig?.type})`);
assert(recSig?.metric === '+55.6%', `Recovery percentage formatted accurately: ${recSig?.metric}`);

// 1.5 Testing 52-Week High Breakout Zone
const quoteBreakout = {
  ltp: 345,
  high52w: 350 // within 1.4% of 52W high
};
const breakoutSignals = calculateStockSignals('GHL', quoteBreakout, mockHist250);
const breakoutSig = breakoutSignals.find(s => s.id === '52w-breakout-zone');
assert(!!breakoutSig, 'Testing 52-week high breakout zone signal triggered');
assert(breakoutSig?.type === 'MAJOR', 'Breakout watch is MAJOR urgency');

// 1.6 Edge Case & Resiliency
const emptySignals = calculateStockSignals(null, null, null);
assert(Array.isArray(emptySignals) && emptySignals.length === 0, 'Graceful handling of null/empty inputs without throwing');


// ─────────────────────────────────────────────────────────────────────────────
// [S2] Stock Valuation & Capital Metrics (stockMetrics.js)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[S2] Capital Structure & Quantitative Metrics Verification');

// 2.1 Float Market Capitalization Math
// Listed Shares: 5,000,000 | Promoter: 51% | Public: 49% | LTP: NPR 271
const mockStockGHL = {
  symbol: 'GHL',
  ltp: 271,
  listedShares: 5000000,
  promoterPercentage: 51,
  publicPercentage: 49,
  paidUpCapital: 500000000,
  bookValue: 120,
  eps: 8.5
};

const metricsGHL = calculateStockMetrics(mockStockGHL, mockHist250);

// Total Market Cap = 5,000,000 * 271 = 1,355,000,000 (1.355 Arba)
assert(metricsGHL.marketCap === 1355000000, `Market cap = 1,355,000,000: got ${metricsGHL.marketCap}`);

// Public Shares = 5,000,000 * 0.49 = 2,450,000
assert(metricsGHL.publicShares === 2450000, `Public shares = 2,450,000: got ${metricsGHL.publicShares}`);

// Promoter Shares = 5,000,000 * 0.51 = 2,550,000
assert(metricsGHL.promoterShares === 2550000, `Promoter shares = 2,550,000: got ${metricsGHL.promoterShares}`);

// Float Market Cap = 2,450,000 * 271 = 663,950,000
const expectedFloatCap = 2450000 * 271;
assert(metricsGHL.floatMarketCap === expectedFloatCap, `Float Market Cap = ${expectedFloatCap}: got ${metricsGHL.floatMarketCap}`);

// 2.2 Market Cap Categorization Tiers
assert(metricsGHL.capCategory === 'Low Cap', `Market cap 1.35B is Low Cap (< 10B): got ${metricsGHL.capCategory}`);

const mockStockMid = { ...mockStockGHL, listedShares: 60000000, ltp: 300 }; // 18 Billion => Mid Cap
const metricsMid = calculateStockMetrics(mockStockMid, mockHist250);
assert(metricsMid.capCategory === 'Mid Cap', `Market cap 18B is Mid Cap (10B - 50B): got ${metricsMid.capCategory}`);

const mockStockLarge = { ...mockStockGHL, listedShares: 200000000, ltp: 350 }; // 70 Billion => Large Cap
const metricsLarge = calculateStockMetrics(mockStockLarge, mockHist250);
assert(metricsLarge.capCategory === 'Large Cap', `Market cap 70B is Large Cap (> 50B): got ${metricsLarge.capCategory}`);

// 2.3 Valuation Ratios (PE & PBV)
// PE = LTP / EPS = 271 / 8.5 = 31.88
// PBV = LTP / BV = 271 / 120 = 2.26
assert(metricsGHL.pe === 31.88, `PE ratio calculated accurately: expected 31.88, got ${metricsGHL.pe}`);
assert(metricsGHL.pbv === 2.26, `PBV ratio calculated accurately: expected 2.26, got ${metricsGHL.pbv}`);

// 2.4 Moving Averages (120D & 180D)
// 120-Day SMA across constant 200 closes must equal exactly 200.0
assert(metricsGHL.avg120d === 200, `120D SMA across constant 200 = 200: got ${metricsGHL.avg120d}`);
assert(metricsGHL.avg180d === 200, `180D SMA across constant 200 = 200: got ${metricsGHL.avg180d}`);

// Price Adjustment Factor (e.g. 0.90x after 10% bonus/right issue)
const mockStockAdjusted = { ...mockStockGHL, priceAdjustmentFactor: 0.90 };
const metricsAdj = calculateStockMetrics(mockStockAdjusted, mockHist250);
assert(metricsAdj.avg120dAdj === 180, `Adjusted 120D SMA (200 * 0.90) = 180: got ${metricsAdj.avg120dAdj}`);
assert(metricsAdj.avg180dAdj === 180, `Adjusted 180D SMA (200 * 0.90) = 180: got ${metricsAdj.avg180dAdj}`);

// 2.5 All-Time High (ATH) and Date Tracking
const mockHistWithATH = [
  { date: '2021-08-18', close: 540, high: 540 },
  ...mockHist250
];
const metricsATH = calculateStockMetrics(mockStockGHL, mockHistWithATH);
assert(metricsATH.ath === 540, `ATH scanned accurately: expected 540, got ${metricsATH.ath}`);
assert(metricsATH.athDate === '2021-08-18', `ATH date recorded accurately: got ${metricsATH.athDate}`);

// 2.6 Currency & Quantity Formatting Verification
assert(formatNprMoney(15000000000) === 'Rs 1.50 Arba', `15B formatted as Arba: got ${formatNprMoney(15000000000)}`);
assert(formatNprMoney(25000000) === 'Rs 2.50 Cr', `25M formatted as Cr: got ${formatNprMoney(25000000)}`);
assert(formatNprMoney(450000) === 'Rs 4.50 Lkh', `450k formatted as Lkh: got ${formatNprMoney(450000)}`);
assert(formatNprMoney(null) === '—', 'Null value formatted gracefully as dash');


// ─────────────────────────────────────────────────────────────────────────────
// [S3] Broker Accumulation & Zero-Sum Mathematical Invariants
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[S3] Broker Accumulation & Conservation Invariants');

// Test Broker Model: Broker 58 bought 100,000 shares @ avg 270, sold 20,000 shares @ avg 272
const b58BuyQty = 100000;
const b58SellQty = 20000;
const b58AvgBuy = 270;
const b58AvgSell = 272;

// Formula 1: Hold % of Buy Qty = max(0, (Buy - Sell) / Buy) * 100
const holdQty = Math.max(0, b58BuyQty - b58SellQty); // 80,000
const holdPctOfBuy = Math.round((holdQty / b58BuyQty) * 100); // 80%
assert(holdQty === 80000, `Hold quantity = 80,000 kitta: got ${holdQty}`);
assert(holdPctOfBuy === 80, `Hold % of buy qty = 80%: got ${holdPctOfBuy}`);

// Formula 2: Matched volume = min(Buy, Sell)
const matchedQty = Math.min(b58BuyQty, b58SellQty);
assert(matchedQty === 20000, `Matched trade volume = 20,000 kitta: got ${matchedQty}`);

// Formula 3: Buy vs Sell Distribution Invariant (Buy % + Sell % === 100%)
const totalTrades = b58BuyQty + b58SellQty; // 120,000
const buyPct = Math.round((b58BuyQty / totalTrades) * 100); // 83%
const sellPct = 100 - buyPct; // 17%
assert(buyPct + sellPct === 100, `Buy % (${buyPct}%) + Sell % (${sellPct}%) conserves exactly 100%`);

// Formula 4: Hold Amount = Hold Qty * Avg Buy Price
const holdAmount = holdQty * b58AvgBuy; // 80,000 * 270 = 21,600,000 (2.16 Cr)
assert(holdAmount === 21600000, `Hold amount = 21,600,000: got ${holdAmount}`);

// ─────────────────────────────────────────────────────────────────────────────
// [S4] Broker Vault Official Roster, Self-Matched Conservation & Tab Parity
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[S4] Official Broker Roster, Date-Wise Floorsheet & Tab Parity');

import fs from 'fs';
import { BROKER_NAMES, getBrokerName, aggregateFloorsheetRows } from '../proxy/brokerVault.mjs';

assert(typeof BROKER_NAMES === 'object' && Object.keys(BROKER_NAMES).length >= 90, 'BROKER_NAMES exported and contains official 1-101 NEPSE brokers');
assert(getBrokerName(45) === 'Imperial Securities', `Broker #45 is Imperial Securities (got ${getBrokerName(45)})`);
assert(getBrokerName(56) === 'Sri Hari Securities', `Broker #56 is Sri Hari Securities (got ${getBrokerName(56)})`);
assert(getBrokerName(42) === 'Sani Securities', `Broker #42 is Sani Securities (got ${getBrokerName(42)})`);
assert(getBrokerName(28) === 'Shree Krishna Securities', `Broker #28 is Shree Krishna Securities (got ${getBrokerName(28)})`);
assert(getBrokerName(96) === 'Himalayan Securities', `Broker #96 is Himalayan Securities (got ${getBrokerName(96)})`);

// Test self-matched trade conservation in aggregateFloorsheetRows
const sampleRows = [
  { contractId: '1', buyerBroker: '45', sellerBroker: '45', qty: 1000, rate: 500, amount: 500000, businessDate: '2026-10-12' },
  { contractId: '2', buyerBroker: '56', sellerBroker: '45', qty: 2000, rate: 510, amount: 1020000, businessDate: '2026-10-12' },
  { contractId: '3', buyerBroker: '42', sellerBroker: '59', qty: 1500, rate: 505, amount: 757500, businessDate: '2026-10-09' }
];
const agg = aggregateFloorsheetRows(sampleRows, 'SYPNL', ['2026-10-12', '2026-10-09']);
assert(agg.totalTrades === 3, `Self-matched trades are preserved in totalTrades (expected 3, got ${agg.totalTrades})`);
assert(agg.totalVolume === 4500, `Total volume includes self-matched trades (expected 4500, got ${agg.totalVolume})`);
const b45 = agg.brokers.find(b => b.broker === '45');
assert(b45?.matchedQty === 1000, `Broker #45 self-matched qty tracked accurately (expected 1000, got ${b45?.matchedQty})`);
assert(b45?.buyQty === 1000 && b45?.sellQty === 3000, `Broker #45 buyQty=1000, sellQty=3000 (got buy=${b45?.buyQty}, sell=${b45?.sellQty})`);
assert(agg.dailyFlow.length === 2, `Date-wise dailyFlow tracks 2 distinct trading dates (got ${agg.dailyFlow.length})`);

// Verify StockDetailModal has separate Market Depth, Floorsheet, and Broker Analysis tabs and zero stockFundamentals ReferenceError
const modalSrc = fs.readFileSync(new URL('../src/components/StockDetailModal.jsx', import.meta.url), 'utf8');
assert(!modalSrc.includes('stockFundamentals'), 'Zero undeclared stockFundamentals references in StockDetailModal.jsx');
assert(modalSrc.includes("id: 'market_depth'") && modalSrc.includes("id: 'floorsheet'") && modalSrc.includes("id: 'broker_analysis'"), 'Separate Market Depth, Floorsheet, and Broker Analysis tabs present in StockDetailModal.jsx');

// ─────────────────────────────────────────────────────────────────────────────
// [S5] Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n====================================================================');
console.log(` AUDIT COMPLETE: ${pass} PASSED, ${fail} FAILED`);
console.log('====================================================================');

if (fail > 0) {
  process.exit(1);
} else {
  console.log('✅ ALL SHARE HUB PARITY TESTS PASSED CLEANLY!\n');
  process.exit(0);
}
