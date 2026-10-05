/**
 * H-BATCH: Book-closure tracker, live sector medians, classifier consistency.
 * Run: node tests/hBatchMacroEvents.test.mjs
 */
import {
  parseDividendDate, extractBookClosureDate, findUpcomingBookClosure,
  classifyClosureUrgency, measurePastPreClosureRunups, buildBookClosureAlert,
} from '../src/utils/bookClosureTracker.js';
import { computeLiveSectorMedians, getLiveMedians, median } from '../src/utils/liveSectorMedians.js';
import { getSectorBenchmark, classifySector, NEPSE_SECTOR_BENCHMARKS } from '../src/utils/fundamentals.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS:', m); } else { fail++; console.error('  FAIL:', m); } };
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

console.log('\n[H1] Date parsing');
ok(parseDividendDate('2026-12-01')?.getUTCFullYear() === 2026, 'ISO AD date parsed');
ok(parseDividendDate('01/12/2026')?.getUTCMonth() === 11, 'dd/mm/yyyy parsed');
ok(parseDividendDate('2082/07/15') === null, 'Bikram Sambat date rejected (not guessed)');
ok(parseDividendDate('') === null && parseDividendDate(null) === null, 'empty/null -> null');
ok(parseDividendDate('2026-12-01 [AD]')?.getUTCDate() === 1, 'bracket annotations stripped');
ok(extractBookClosureDate({ bookClosure: '2026-12-01' }) !== null, 'reads backend field `bookClosure`');

console.log('\n[H2] Upcoming closure detection');
const soon = iso(Date.now() + 10 * DAY), far = iso(Date.now() + 200 * DAY), past = iso(Date.now() - 30 * DAY);
const divs = [
  { fiscalYear: 'a', bookClosure: past, cashDividend: 5 },
  { fiscalYear: 'b', bookClosure: far, bonusShare: 10 },
  { fiscalYear: 'c', bookClosure: soon, bonusShare: 15, cashDividend: 1 },
];
const up = findUpcomingBookClosure(divs);
ok(up && up.fiscalYear === 'c', 'picks nearest closure inside 60 days');
ok(findUpcomingBookClosure([{ bookClosure: far }]) === null, 'ignores closure >60 days out');
ok(findUpcomingBookClosure([{ bookClosure: past }]) === null, 'ignores past closures');
ok(findUpcomingBookClosure([]) === null && findUpcomingBookClosure(null) === null, 'empty/null safe');
ok(classifyClosureUrgency(Date.now() + 3 * DAY).label === 'IMMINENT', '3d => IMMINENT');
ok(classifyClosureUrgency(Date.now() + 15 * DAY).label === 'APPROACHING', '15d => APPROACHING');
ok(classifyClosureUrgency(Date.now() + 40 * DAY).label === 'UPCOMING', '40d => UPCOMING');

console.log('\n[H3] Measured (not invented) pre-closure run-ups');
// Synthetic test candles: flat 100 then +10% in the 21 days before a closure 100 days ago.
const hist = [];
const closureT = Date.now() - 100 * DAY;
for (let i = 300; i >= 0; i--) {
  const t = Date.now() - i * DAY;
  const dt = new Date(t); if (dt.getUTCDay() === 5 || dt.getUTCDay() === 6) continue;
  const daysToClosure = (closureT - t) / DAY;
  const price = daysToClosure <= 0 ? 110 : daysToClosure <= 21 ? 100 + (21 - daysToClosure) * (10 / 21) : 100;
  hist.push({ date: iso(t), close: price });
}
const pastDivs = [{ bookClosure: iso(closureT), cashDividend: 5 }];
const r = measurePastPreClosureRunups(pastDivs, hist, 21);
ok(r.count === 1, 'one past closure measured');
ok(r.medianPct > 7 && r.medianPct < 12, `measured run-up ~10%: ${r.medianPct}`);
ok(measurePastPreClosureRunups(pastDivs, [], 21).count === 0, 'no history => count 0, no fabricated number');
ok(measurePastPreClosureRunups(pastDivs, hist.slice(0, 10), 21).medianPct === null, 'too little history => null');

console.log('\n[H4] Alert never fabricates a run-up range');
const alert = buildBookClosureAlert('TEST', divs, null);
ok(alert && alert.type.includes('15% Bonus'), 'alert type labels bonus');
ok(!/10[–-]25|3[–-]8%|historically drive/i.test(alert.historicalNote), 'no hard-coded run-up claims');
ok(/Not enough price history/i.test(alert.historicalNote), 'says unavailable when no history');
ok(typeof alert.settlementNote === 'string' && /T\+2/.test(alert.settlementNote), 'T+2 caution present');
ok(buildBookClosureAlert('X', [{ bookClosure: past }], null) === null, 'no alert when nothing upcoming');

console.log('\n[H5] Live sector medians');
ok(median([3, 1, 2]) === 2 && median([1, 2, 3, 4]) === 2.5, 'median odd/even');
ok(median([]) === null && median([0, null, -1]) === null, 'median ignores invalid');
const mk = (sector, pe, pb, roe, eps) => ({ sector, pe, pb, roe, eps });
const universe = [
  ...Array.from({ length: 6 }, (_, i) => mk('Commercial Banks', 8 + i, 1 + i * 0.1, 12, 30)),
  ...Array.from({ length: 4 }, (_, i) => mk('Hydropower', 40 + i, 3, 8, 6)),
  ...Array.from({ length: 5 }, (_, i) => mk('Life Insurance', 50 + i, 4, 10, 20)),
  ...Array.from({ length: 5 }, (_, i) => mk('Non Life Insurance', 20 + i, 2, 12, 25)),
];
computeLiveSectorMedians(universe, classifySector);
const bank = getLiveMedians(classifySector('Commercial Banks'));
ok(bank && bank.medianPE === 10.5, `bank live median PE = 10.5 (got ${bank?.medianPE})`);
ok(getLiveMedians('nonexistent_key') === null, 'unknown key => null');
const b = getSectorBenchmark('Commercial Banks');
ok(b.isLive === true && b.medianPE === 10.5, 'getSectorBenchmark uses live PE');
ok(b.minCAR === NEPSE_SECTOR_BENCHMARKS['Commercial Banks'].minCAR, 'regulatory fields kept from static table');
const life = getSectorBenchmark('Life Insurance'), nonlife = getSectorBenchmark('Non Life Insurance');
ok(life.medianPE !== nonlife.medianPE, `life (${life.medianPE}) and non-life (${nonlife.medianPE}) are NOT lumped together`);

console.log('\n[H6] Fallback when live data is missing');
computeLiveSectorMedians([mk('Hydropower', 40, 3, 8, 6)], classifySector); // 1 stock < 3 => cleared
const hyd = getSectorBenchmark('Hydropower');
ok(hyd.isLive === false && hyd.medianPE === NEPSE_SECTOR_BENCHMARKS['Hydropower'].medianPE, 'too few peers => static fallback, flagged not-live');

console.log(`\nH-BATCH TESTS: ${pass} PASSED, ${fail} FAILED`);
process.exit(fail ? 1 : 0);
