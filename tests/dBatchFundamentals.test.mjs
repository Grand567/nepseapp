/**
 * D-batch tests: Fundamental Analysis — Sector Benchmarks, Valuation, Scorecard
 */
import {
  NEPSE_SECTOR_BENCHMARKS,
  getSectorBenchmark,
  evaluateValuation,
  calculateFundamentalSummary,
  computeSectorComparison,
} from '../src/utils/fundamentals.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS:', msg); pass++; }
  else { console.error('  FAIL:', msg); fail++; }
}

// ── D2: getSectorBenchmark ────────────────────────────────────────────────────
console.log('\n[D2] Sector Lookup');
const bankBench = getSectorBenchmark('Commercial Bank');
assert(bankBench.sectorKey === 'commercial_bank', 'Commercial Bank keyword match');
assert(bankBench.medianPE === 13, `Commercial bank median PE = 13: got ${bankBench.medianPE}`);
assert(bankBench.medianPBV === 1.2, `Commercial bank median PBV = 1.2: got ${bankBench.medianPBV}`);
assert(bankBench.minCAR === 11, 'Commercial bank min CAR = 11%');

const hydroBench = getSectorBenchmark('Hydropower & Energy');
assert(hydroBench.sectorKey === 'hydropower', 'Hydro keyword match');
assert(hydroBench.medianPE === 28, `Hydro median PE = 28: got ${hydroBench.medianPE}`);

const microBench = getSectorBenchmark('Microfinance Institution');
assert(microBench.sectorKey === 'microfinance', 'Microfinance keyword match');

const unknownBench = getSectorBenchmark('Unknown Sector XYZ');
assert(unknownBench.sectorKey === 'others', 'Unknown sector falls back to others');
assert(getSectorBenchmark(null).sectorKey === 'others', 'Null sector falls back to others');

// ── D3: evaluateValuation ────────────────────────────────────────────────────
console.log('\n[D3] Valuation Evaluation');

// Undervalued commercial bank: PE=8 (well below median 13), PBV=0.8
const cheapBank = { symbol: 'NABIL', sector: 'Commercial Bank', pe: 8, pbv: 0.8, eps: 50, roe: 15, ltp: 400, npl: 2.0, car: 13.5 };
const cheapRes = evaluateValuation(cheapBank);
assert(cheapRes.verdict === 'UNDERVALUED', `Cheap bank is UNDERVALUED: ${cheapRes.verdict}`);
assert(cheapRes.peStatus === 'UNDERVALUED', `PE=8 vs median=13 → UNDERVALUED: ${cheapRes.peStatus}`);
assert(cheapRes.pbvStatus === 'UNDERVALUED', `PBV=0.8 < 1.0 bank with clean NPL: ${cheapRes.pbvStatus}`);
assert(cheapRes.score > 0, `Score is positive: ${cheapRes.score}`);
assert(Array.isArray(cheapRes.explanation) && cheapRes.explanation.length > 0, 'Has explanation array');
assert(cheapRes.benchmark.medianPE === 13, 'Benchmark median PE correct');
assert(typeof cheapRes.disclaimer === 'string', 'Has disclaimer string');

// Overvalued hydro: PE=60 (well above median 28), PBV=5.5
const expHydro = { symbol: 'BARUN', sector: 'Hydropower', pe: 60, pbv: 5.5, eps: 10, roe: 6, ltp: 600 };
const expRes = evaluateValuation(expHydro);
assert(expRes.verdict === 'OVERVALUED', `Expensive hydro is OVERVALUED: ${expRes.verdict}`);
assert(expRes.peStatus === 'OVERVALUED', `PE=60 vs median=28 → OVERVALUED`);
assert(expRes.score < 0, `Score is negative: ${expRes.score}`);

// Fair value: PE near median, PBV near median
const fairStock = { symbol: 'TEST', sector: 'Commercial Bank', pe: 13, pbv: 1.2, eps: 35, roe: 14, ltp: 455 };
const fairRes = evaluateValuation(fairStock);
assert(['FAIR', 'SLIGHTLY_UNDERVALUED', 'SLIGHTLY_OVERVALUED'].includes(fairRes.verdict),
  `Fair-value stock: ${fairRes.verdict}`);

// CAR below minimum triggers negative flag
const undercap = { symbol: 'XYZ', sector: 'Commercial Bank', pe: 12, pbv: 1.1, eps: 30, roe: 12, ltp: 360, car: 9.0 };
const undercapRes = evaluateValuation(undercap);
assert(undercapRes.score <= -1, `Under-capitalised bank penalised: score=${undercapRes.score}`);
const hasCarWarning = undercapRes.explanation.some(e => e.includes('CAR'));
assert(hasCarWarning, 'CAR warning in explanation');

// ── D4: calculateFundamentalSummary ──────────────────────────────────────────
console.log('\n[D4] Fundamental Scorecard');

const stockGood = {
  symbol: 'NABIL', sector: 'Commercial Bank',
  ltp: 400, eps: 50, bvps: 300, pe: 8, pbv: 1.33, roe: 16.7,
  dividendYield: 4.5, npl: 1.8, car: 13.5,
  sharesOut: 10
};
const summary = calculateFundamentalSummary(stockGood);
assert(summary !== null, 'Summary computed');
assert(summary.symbol === 'NABIL', 'Symbol preserved');
assert(summary.fundamentalScore > 50, `Good bank score > 50: ${summary.fundamentalScore}`);
assert(['Buy', 'Strong Buy'].includes(summary.fundamentalRating), `Rating for good bank: ${summary.fundamentalRating}`);
assert(typeof summary.disclaimer === 'string' && summary.disclaimer.includes('⚠️'), 'Disclaimer present with warning icon');
assert(summary.sectorName === 'Commercial Banks (NRB regulated)', `Sector name: ${summary.sectorName}`);
assert(summary.pe > 0, `PE computed from ltp/eps: ${summary.pe}`);
assert(summary.pbv > 0, `PBV computed: ${summary.pbv}`);

const stockBad = { symbol: 'LOSS', sector: 'Commercial Bank', ltp: 100, eps: -5, bvps: 120, dividendYield: 0 };
const summaryBad = calculateFundamentalSummary(stockBad);
assert(summaryBad.fundamentalScore < 50, `Loss-making stock score < 50: ${summaryBad.fundamentalScore}`);
assert(['Avoid', 'Underperform'].includes(summaryBad.fundamentalRating), `Bad rating: ${summaryBad.fundamentalRating}`);

// Null stock
assert(calculateFundamentalSummary(null) === null, 'Null stock returns null');
assert(calculateFundamentalSummary({}) === null, 'Empty stock returns null');

// ── D5: computeSectorComparison ───────────────────────────────────────────────
console.log('\n[D5] Sector Peer Comparison');

const mockStocks = [
  { symbol: 'NABIL', sector: 'Commercial Bank', pe: 8,  pbv: 1.1, eps: 50, roe: 16, dividendYield: 4.5 },
  { symbol: 'NBL',   sector: 'Commercial Bank', pe: 12, pbv: 1.3, eps: 38, roe: 14, dividendYield: 3.0 },
  { symbol: 'SANIMA',sector: 'Commercial Bank', pe: 15, pbv: 1.5, eps: 30, roe: 12, dividendYield: 2.5 },
  { symbol: 'PCBL',  sector: 'Commercial Bank', pe: 18, pbv: 1.8, eps: 22, roe: 10, dividendYield: 2.0 },
  { symbol: 'KBL',   sector: 'Commercial Bank', pe: 20, pbv: 2.0, eps: 18, roe: 8,  dividendYield: 1.5 },
  { symbol: 'BARUN', sector: 'Hydropower',      pe: 35, pbv: 2.5, eps: 12, roe: 8,  dividendYield: 0.5 },
];

const comp = computeSectorComparison(mockStocks, 'NABIL');
assert(comp !== null, 'Comparison computed');
assert(comp.peerCount === 4, `4 peers for NABIL in Commercial Bank: ${comp.peerCount}`);
assert(comp.pe.rank === 1, `NABIL has best (lowest) PE rank=1: ${comp.pe?.rank}`);
assert(comp.eps.rank === 1, `NABIL has best (highest) EPS rank=1: ${comp.eps?.rank}`);
assert(comp.pe.percentile > 50, `NABIL PE in top half: percentile=${comp.pe?.percentile}`);

// BARUN should not appear in NABIL's peers (different sector)
const baronInPeers = comp.peers?.some(p => p.symbol === 'BARUN');
assert(!baronInPeers, 'BARUN (Hydro) not in NABIL (Bank) peers');

// Null / not found
assert(computeSectorComparison(null, 'NABIL') === null, 'Null stocks returns null');
assert(computeSectorComparison(mockStocks, 'NOTEXIST') === null, 'Missing symbol returns null');

console.log(`\nD-BATCH TESTS: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
