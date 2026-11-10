// tests/testMeroShareWaccDetails.test.mjs
import {
  normalizeScripSymbol,
  verifyWaccMath,
  parseMeroShareWaccDetailsResponse,
  matchWaccRecordsToHoldings,
  classifyWaccSyncFailure
} from '../src/services/meroShareWaccService.js';

let pass = 0;
let fail = 0;

const ok = (condition, message) => {
  if (condition) {
    pass++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${message}`);
  }
};

console.log('▶ [SUITE] testMeroShareWaccDetails.test.mjs\n');

try {
  // ─── TEST 1: Symbol Normalization ──────────────────────────────────────────
  console.log('[TEST 1] Symbol Normalization across scrip variations');
  ok(normalizeScripSymbol('AKPL') === 'AKPL', 'Standard symbol normalized');
  ok(normalizeScripSymbol(' akpl ') === 'AKPL', 'Trimmed & uppercased');
  ok(normalizeScripSymbol('AKPL.N0000') === 'AKPL', 'Stripped .N0000 suffix');
  ok(normalizeScripSymbol('NABIL_PO') === 'NABIL', 'Stripped promoter share suffix _PO');
  ok(normalizeScripSymbol('GBIME.P') === 'GBIME', 'Stripped .P class suffix');
  ok(normalizeScripSymbol('') === '', 'Empty symbol handled safely');

  // ─── TEST 2: Mathematical Verification (Rate x Qty = Total Cost) ───────────
  console.log('\n[TEST 2] Math verification within rounding');
  // User ground truth: 100 shares @ 345.5381 = 34553.813
  const math1 = verifyWaccMath({ rate: 345.5381, quantity: 100, totalCost: 34553.813 });
  ok(math1.isValid === true, 'Ground truth record 1 math is valid');
  ok(math1.isMismatch === false, 'No mismatch for record 1');

  // User ground truth: AKPL 10 shares @ 264.5392 = 2645.392
  const math2 = verifyWaccMath({ rate: 264.5392, quantity: 10, totalCost: 2645.392 });
  ok(math2.isValid === true, 'Ground truth AKPL math is valid');
  ok(math2.difference < 0.001, 'Difference is zero within float precision');

  // Intentional mismatch
  const mathBad = verifyWaccMath({ rate: 264.5392, quantity: 10, totalCost: 2500.000 });
  ok(mathBad.isValid === false, 'Detects corrupted or mismatched total cost');
  ok(mathBad.isMismatch === true, 'isMismatch flagged true');
  ok(typeof mathBad.mismatchNote === 'string' && mathBad.mismatchNote.includes('2500'), 'Mismatch note generated');

  // ─── TEST 3: Parse Ground Truth Payload (Direct Array) ─────────────────────
  console.log('\n[TEST 3] Parsing Ground Truth Response (User provided shape)');
  const fakeDirectResponse = [
    {
      scripName: 'NABIL',
      waccRate: 345.5381,
      lastModifiedDate: '2026-10-28',
      waccCalculatedQuantity: 100,
      totalCostOfCapital: 34553.813
    },
    {
      scripName: 'AKPL',
      waccRate: 264.5392,
      lastModifiedDate: '2026-11-04',
      waccCalculatedQuantity: 10,
      totalCostOfCapital: 2645.392
    }
  ];

  const parsedDirect = parseMeroShareWaccDetailsResponse(fakeDirectResponse);
  ok(parsedDirect.success === true, 'Parsed direct array successfully');
  ok(parsedDirect.count === 2, 'Found 2 records');
  ok(parsedDirect.records[0].normalizedSymbol === 'NABIL', 'Record 0 symbol is NABIL');
  ok(parsedDirect.records[0].waccRate === 345.5381, 'Record 0 WACC rate parsed');
  ok(parsedDirect.records[0].waccCalculatedQuantity === 100, 'Record 0 quantity parsed');
  ok(parsedDirect.records[0].lastModifiedDate === '2026-10-28', 'Record 0 date parsed');
  ok(parsedDirect.records[1].normalizedSymbol === 'AKPL', 'Record 1 symbol is AKPL');
  ok(parsedDirect.records[1].waccRate === 264.5392, 'Record 1 WACC rate parsed');
  ok(parsedDirect.records[1].lastModifiedDate === '2026-11-04', 'Record 1 date parsed');

  // ─── TEST 4: Parse Spring Pageable & Wrapped Envelopes ──────────────────────
  console.log('\n[TEST 4] Paging & Envelope variations');
  const fakePageableResponse = {
    content: fakeDirectResponse,
    totalPages: 2,
    totalElements: 40,
    number: 0,
    size: 20
  };

  const parsedPageable = parseMeroShareWaccDetailsResponse(fakePageableResponse);
  ok(parsedPageable.success === true, 'Parsed Pageable response');
  ok(parsedPageable.page === 1, 'Extracted page 1');
  ok(parsedPageable.totalPages === 2, 'Extracted totalPages 2');
  ok(parsedPageable.totalRecords === 40, 'Extracted totalElements 40');

  // Empty lists
  const emptyRes = parseMeroShareWaccDetailsResponse([]);
  ok(emptyRes.success === true && emptyRes.records.length === 0, 'Handled empty array cleanly');
  const emptyPageable = parseMeroShareWaccDetailsResponse({ content: [] });
  ok(emptyPageable.success === true && emptyPageable.records.length === 0, 'Handled empty pageable cleanly');

  // ─── TEST 5: Matching Records to Holdings & Quantity Discrepancy Guard ──────
  console.log('\n[TEST 5] Matching Holdings & Quantity Difference Guard');
  const sampleHoldings = [
    { symbol: 'AKPL', units: 15, currentPrice: 310 }, // Held 15 vs WACC 10!
    { symbol: 'NABIL', units: 100, currentPrice: 500 }, // Exact match: 100 vs 100
    { symbol: 'SHIVM', units: 50, currentPrice: 512 }   // No WACC in CDSC
  ];

  const matched = matchWaccRecordsToHoldings(parsedDirect.records, sampleHoldings);
  ok(matched.length === 3, 'All 3 holdings preserved');

  // Check AKPL (Quantity mismatch: 15 held vs 10 calculated)
  const akplHolding = matched.find(h => h.symbol === 'AKPL');
  ok(akplHolding.waccSource === 'CDSC_WACC', 'AKPL cost source set to CDSC_WACC');
  ok(akplHolding.waccRate === 264.5392, 'AKPL WACC rate matches CDSC record');
  ok(akplHolding.hasQuantityMismatch === true, 'Detected quantity difference (15 held vs 10 calculated)');
  ok(akplHolding.waccCalculatedQuantity === 10, 'WACC calculated quantity is 10');
  ok(akplHolding.heldQuantity === 15, 'Held quantity is 15');
  ok(akplHolding.coveredQuantity === 10, 'Covered quantity is strictly 10 shares');
  ok(akplHolding.uncoveredQuantity === 5, '5 extra shares correctly isolated');
  ok(typeof akplHolding.quantityNote === 'string' && akplHolding.quantityNote.includes('Rate Rs. 264.54 applies only to 10 shares'), 'Clear explanation note generated');

  // Check NABIL (Exact quantity: 100 held == 100 calculated)
  const nabilHolding = matched.find(h => h.symbol === 'NABIL');
  ok(nabilHolding.hasQuantityMismatch === false, 'NABIL has exact quantity match');
  ok(nabilHolding.wacc === 345.5381, 'NABIL WACC is 345.5381');
  ok(nabilHolding.lastModifiedDate === '2026-10-28', 'NABIL modification date is 2026-10-28');

  // Check SHIVM (Not in CDSC WACC)
  const shivmHolding = matched.find(h => h.symbol === 'SHIVM');
  ok(shivmHolding.waccSource === 'NOT_AVAILABLE', 'SHIVM marked NOT_AVAILABLE when missing from CDSC');

  // ─── TEST 6: Distinguish Failure Causes ─────────────────────────────────────
  console.log('\n[TEST 6] Classify failure causes');
  ok(classifyWaccSyncFailure(new Error('token required')).type === 'NOT_LOGGED_IN', 'Classified NOT_LOGGED_IN');
  ok(classifyWaccSyncFailure(new Error('session expired'), 401).type === 'SESSION_EXPIRED', 'Classified SESSION_EXPIRED');
  ok(classifyWaccSyncFailure(new Error('F5 WAF block'), 503).type === 'CDSC_BLOCKED_WAF', 'Classified CDSC_BLOCKED_WAF');
  ok(classifyWaccSyncFailure(new Error('ECONNREFUSED connect')).type === 'CDSC_UNREACHABLE', 'Classified CDSC_UNREACHABLE');
  ok(classifyWaccSyncFailure(null, null).type === 'GENUINELY_NO_RECORD', 'Classified genuinely no records');

  console.log('\n======================================================');
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('======================================================');

  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
}
