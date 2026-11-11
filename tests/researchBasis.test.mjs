// tests/researchBasis.test.mjs
/**
 * ============================================================================
 * UNIT TEST SUITE: RESEARCH BASIS & ACADEMIC AUDIT VERIFICATION
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('======================================================================');
console.log('RESEARCH BASIS SPECIFICATION — VERIFICATION & AUDIT SUITE');
console.log('======================================================================\n');

const filePath = path.join(process.cwd(), 'qa', 'research_basis.md');
assert(fs.existsSync(filePath), 'qa/research_basis.md file exists on disk');

const content = fs.readFileSync(filePath, 'utf8');

// [TEST 1] Core Academic Literature Citations
console.log('[TEST 1] Academic Literature Citations');
assert(content.includes('Shrestha') && content.includes('Subedi'), 'Cites Shrestha & Subedi technical trading rule research');
assert(content.includes('Dangol') || content.includes('Pradhan'), 'Cites Dangol / Pradhan overreaction & contrarian research');
assert(content.includes('Karki'), 'Cites Karki risk-adjusted volatility control research');
assert(content.includes('Poudel'), 'Cites Poudel / Shrestha random walk and weekly non-random return research');

// [TEST 2] Core Strategy Findings Documented
console.log('\n[TEST 2] Strategy Empirical Findings');
assert(content.includes('fees') && content.includes('transaction costs'), 'Documents fee drag & transaction cost impact on high frequency');
assert(content.includes('Contrarian') && content.includes('banned'), 'Explicitly notes ban on contrarian dip-buying due to zero edge');
assert(content.includes('Weekly') && content.includes('Daily'), 'Documents weekly non-random momentum vs daily noise');
assert(content.includes('April 2026'), 'Documents April 2026 regime shifts (Mon-Fri week and ±15% circuit band)');

// [TEST 3] Verification Matrix & Transparency
console.log('\n[TEST 3] Verification Matrix & Claims Labeling');
assert(content.includes('VERIFIED') && content.includes('UNVERIFIED'), 'Transparently distinguishes between VERIFIED and UNVERIFIED claims');
assert(content.includes('NO EDGE: do not trade this system'), 'Encapsulates the mandatory fiduciary kill-switch policy');
assert(content.includes('200 verified trades') || content.includes('N >= 200') || content.includes('N ≥ 200'), 'Enforces sample power minimum of 200 trades');

console.log('\n======================================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
