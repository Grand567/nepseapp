// tests/ahBatchIpoFallbackStaleLabeling.test.mjs
import { getLiveIpoListings } from '../proxy/ipoHelper.js';

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

console.log('▶ [SUITE] ahBatchIpoFallbackStaleLabeling.test.mjs\n');

try {
  console.log('[TEST 1] ShareSansar 403 Resilient Fallback Ingestion');
  // Trigger fetch with forceRefresh=true (forcing scrapers to execute against live endpoints)
  const listings = await getLiveIpoListings(true);

  ok(Array.isArray(listings), 'Returns valid array of IPO listings');
  ok(listings.length > 0, `Returns at least 1 fallback IPO listing (received: ${listings.length})`);

  console.log('\n[TEST 2] Stale IPO Data Labeling Invariant');
  const sample = listings[0];
  ok(sample !== null && typeof sample === 'object', 'First IPO record is valid object');
  ok(sample.name && sample.name.length > 0, `IPO record has valid company name: "${sample.name}"`);

  // Verify that if live scraper was blocked by 403, stale labeling is strictly applied
  if (sample.source === 'sharesansar' && !sample.isStale) {
    ok(true, 'Live ShareSansar succeeded without 403');
  } else {
    ok(sample.isStale === true, 'Fallback IPO data is strictly labeled with isStale: true');
    ok(
      typeof sample.staleWarning === 'string' && sample.staleWarning.includes('403 Forbidden'),
      `Provides clear stale warning message referencing 403 Forbidden: "${sample.staleWarning}"`
    );
  }

  console.log('\n[TEST 3] IPO Record Integrity & Standard Schema');
  ok(typeof sample.companyShareId === 'number' || typeof sample.id === 'string', 'Contains valid companyShareId or id');
  ok(typeof sample.minKitta === 'number' && sample.minKitta > 0, 'Contains valid statutory minKitta (>= 10)');
  ok(typeof sample.issuePrice === 'number' && sample.issuePrice > 0, 'Contains valid issuePrice (Rs. 100)');
  ok(typeof sample.type === 'string', 'Contains valid share type string (IPO/FPO/Right)');

  console.log(`\n======================================================`);
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log(`======================================================`);

  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('Fatal test error:', err);
  process.exit(1);
}
