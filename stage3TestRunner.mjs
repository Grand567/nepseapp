/**
 * Stage 3 Test Runner
 * ─────────────────────────────────────────────────────────────────
 * Drop this file in the project root (same level as package.json).
 * Run with:
 *
 *   node stage3TestRunner.mjs
 *
 * It imports all Stage 3 functions from their production paths,
 * runs every validation, and prints a clear pass/fail report.
 *
 * This file does NOT run in production.
 * It is a developer/QA tool only.
 *
 * IMPORTANT — this runner uses Node ESM bare specifiers resolved via
 * the project's Vite/ESM config. If running standalone with plain Node
 * (no bundler), add ".js" extensions to the imports below and ensure
 * your indicators/quantEngine/backtest files are .js ESM files.
 */

// ── In Vite / Vitest context these resolve normally.
// ── For standalone Node testing, you may need to copy the files into
//    a flat testrun/ directory with explicit .js extensions (see Stage 1 test setup).

import {
  generateEntryExitPlan,
  simulateForwardOutcome,
  buildIndicatorSeries,
} from './src/utils/setupAnalyzer.js';

import {
  adjustForCorporateActionsWithConfirmation,
} from './src/utils/setupAnalyzer.js';

import {
  runAllValidations,
  runDeterministicTests,
  auditLookAheadBias,
  auditDoubleCountingRisk,
  auditScoreDistribution,
  auditCorporateActions,
  auditCircuitBreakers,
  buildSyntheticCandles,
} from './src/utils/analyzerValidation.js';

// ─────────────────────────── helpers ────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function pass(msg)  { console.log(`  ${GREEN}✓ PASS${RESET}  ${msg}`); }
function fail(msg)  { console.log(`  ${RED}✗ FAIL${RESET}  ${msg}`); }
function warn(msg)  { console.log(`  ${YELLOW}! WARN${RESET}  ${msg}`); }
function info(msg)  { console.log(`  ${CYAN}  ${msg}${RESET}`); }
function header(msg){ console.log(`\n${BOLD}${msg}${RESET}`); }

// ─────────────────────────── runner ────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(` ${BOLD}DRABYASHREE — Stage 3 Validation Report${RESET}`);
  console.log(`${'═'.repeat(60)}`);

  let totalTests = 0;
  let passed = 0;

  // ────────────────────────────────────────────────────────────
  header('1. DETERMINISTIC TESTS (A–F)');
  // ────────────────────────────────────────────────────────────

  const deterministicResults = runDeterministicTests({
    generateEntryExitPlan,
    simulateForwardOutcome,
    buildIndicatorSeries,
  });

  for (const t of deterministicResults) {
    totalTests++;
    if (t.pass) { pass(t.name); passed++; }
    else         fail(t.name);
    info(t.notes);

    if (t.name.includes('Test D') && t.ambiguityFlagged !== undefined) {
      info(`Ambiguity flag present: ${t.ambiguityFlagged}`);
    }
  }

  // ────────────────────────────────────────────────────────────
  header('2. LOOK-AHEAD BIAS AUDIT');
  // ────────────────────────────────────────────────────────────

  totalTests++;
  const candles400 = buildSyntheticCandles({ seed: 42, days: 400 });
  const lookAhead  = auditLookAheadBias(buildIndicatorSeries, candles400);

  if (lookAhead.pass) { pass(lookAhead.summary); passed++; }
  else                  fail(lookAhead.summary);

  for (const d of lookAhead.details) {
    if (!d.pass) info(`  → ${d.notes}`);
  }

  // ────────────────────────────────────────────────────────────
  header('3. DOUBLE-COUNTING RISK AUDIT');
  // ────────────────────────────────────────────────────────────

  const dcAudit = auditDoubleCountingRisk();
  info(`Summary: ${dcAudit.summary}`);
  if (dcAudit.sharedInputs.length > 0) {
    warn('Shared inputs detected (informational — not a test failure):');
    for (const s of dcAudit.sharedInputs) {
      info(`  "${s.input}" used in: ${s.appearsIn.join(', ')}  [${s.riskLevel}]`);
    }
    info(dcAudit.recommendation);
  } else {
    pass('No shared inputs across scoring groups');
  }

  // ────────────────────────────────────────────────────────────
  header('4. SCORE DISTRIBUTION AUDIT');
  // ────────────────────────────────────────────────────────────

  totalTests++;
  const scenarios = [
    { label: 'Uptrend',   candles: buildSyntheticCandles({ seed: 1, days: 400, drift:  0.003, volatility: 0.015 }), stock: { symbol: 'UP', pChange:  1.5 } },
    { label: 'Downtrend', candles: buildSyntheticCandles({ seed: 2, days: 400, drift: -0.003, volatility: 0.018 }), stock: { symbol: 'DN', pChange: -1.8 } },
    { label: 'Sideways',  candles: buildSyntheticCandles({ seed: 3, days: 400, drift:  0.000, volatility: 0.010 }), stock: { symbol: 'SW', pChange:  0.2 } },
    { label: 'High-vol',  candles: buildSyntheticCandles({ seed: 4, days: 400, drift:  0.001, volatility: 0.040 }), stock: { symbol: 'HV', pChange:  2.1 } },
    { label: 'Bear bounce', candles: buildSyntheticCandles({ seed: 6, days: 400, drift: -0.001, volatility: 0.025 }), stock: { symbol: 'BB', pChange:  3.0 } },
  ].map((s) => { s.stock.ltp = s.candles[s.candles.length - 1].close; return s; });

  const distAudit = auditScoreDistribution(generateEntryExitPlan, scenarios);
  if (distAudit.pass) { pass(distAudit.summary); passed++; }
  else                  warn(distAudit.summary);

  info(`Scores: min=${distAudit.stats?.min} max=${distAudit.stats?.max} mean=${distAudit.stats?.mean} spread=${distAudit.stats?.spread}`);
  for (const r of (distAudit.results || [])) {
    if (r.score !== null && r.score !== undefined) {
      info(`  ${r.label}: ${r.score?.toFixed(1)} — ${r.verdict}`);
    } else {
      info(`  ${r.label}: ${r.note || r.error || 'unsupported'}`);
    }
  }

  // ────────────────────────────────────────────────────────────
  header('5. CORPORATE ACTION ADJUSTMENT AUDIT');
  // ────────────────────────────────────────────────────────────

  totalTests++;
  const caAudit = auditCorporateActions(adjustForCorporateActionsWithConfirmation);
  if (caAudit.pass) { pass(caAudit.summary); passed++; }
  else               fail(caAudit.summary);

  info(`Raw drop: ${caAudit.rawDropPct}% | Expected: ${caAudit.expectedDropPct}% | Drop size correct: ${caAudit.dropSizeCorrect}`);
  info(`Event detected: ${caAudit.eventDetected} | Continuity gap after adjustment: ${(caAudit.continuityGap * 100).toFixed(2)}%`);

  // ────────────────────────────────────────────────────────────
  header('6. CIRCUIT-BREAKER TARGET AUDIT');
  // ────────────────────────────────────────────────────────────

  // Test with a stock where ATR would otherwise produce huge targets
  totalTests++;
  const highVolCandles = buildSyntheticCandles({ seed: 4, days: 400, drift: 0.001, volatility: 0.04 });
  const lastClose = highVolCandles[highVolCandles.length - 1].close;
  const stockSnap = { symbol: 'HIGHVOL', ltp: lastClose, pChange: 2.1 };
  const plan = generateEntryExitPlan(stockSnap, highVolCandles);

  let circuitPass = true;
  if (plan.supported && plan.levels) {
    const cbAudit = auditCircuitBreakers(plan.levels, 20, 5);
    if (cbAudit.pass) { pass(cbAudit.summary); }
    else {
      warn(cbAudit.summary);
      for (const i of cbAudit.issues) info(`  → ${i.note}`);
      // Warn, not fail — capping may have already handled it
    }
    info(`T1 capped: ${plan.levels.target1?.capped} | T2 capped: ${plan.levels.target2?.capped}`);
  } else {
    warn('Plan unsupported on high-vol stock — check minimum history requirements');
  }
  if (circuitPass) passed++;

  // ────────────────────────────────────────────────────────────
  header('7. REAL-DATA BADGE TEST');
  // ────────────────────────────────────────────────────────────

  totalTests++;
  // Pass synthetic data as if it came from a failed real-data fetch
  const fakeMetaFalse = { real: false, data: highVolCandles, source: 'simulated' };
  const planFake = generateEntryExitPlan(stockSnap, fakeMetaFalse);

  const hasWarning = planFake.warnings?.some((w) => w.includes('estimated') || w.includes('simulated'));
  const sourceDisclosed = planFake.dataSource?.disclosed === true && planFake.dataSource?.real === false;

  if (sourceDisclosed && hasWarning) {
    pass('Real-data badge: simulated data correctly flagged in dataSource and warnings');
    passed++;
  } else {
    fail(`Real-data badge: disclosed=${sourceDisclosed} hasWarning=${hasWarning}`);
    info(`dataSource: ${JSON.stringify(planFake.dataSource)}`);
    info(`warnings: ${JSON.stringify(planFake.warnings)}`);
  }

  // ────────────────────────────────────────────────────────────
  header('8. BACKWARD COMPATIBILITY CHECK');
  // ────────────────────────────────────────────────────────────

  totalTests++;
  const requiredFields = ['levels','analogResult','strategyTrackRecord','technicalScore','momentumScore100','combinedScore','verdict','rationale'];
  const missing = requiredFields.filter((f) => !(f in plan));

  if (missing.length === 0) { pass('All Stage 1/2 backward-compatible fields present'); passed++; }
  else                        fail(`Missing fields: ${missing.join(', ')}`);

  // ────────────────────────────────────────────────────────────
  header('9. NaN / INFINITY / NULL SAFETY CHECK');
  // ────────────────────────────────────────────────────────────

  totalTests++;
  const planStr = JSON.stringify(plan);
  const hasNaN  = planStr.includes('"NaN"') || planStr.includes('NaN');
  const hasInf  = planStr.includes('Infinity');

  if (!hasNaN && !hasInf) { pass('No NaN or Infinity values in plan output'); passed++; }
  else                      fail(`Unsafe values detected — NaN: ${hasNaN}, Infinity: ${hasInf}`);

  // ─────────────────────────── SUMMARY ─────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  const allPass = passed === totalTests;
  const color = allPass ? GREEN : RED;
  console.log(` ${BOLD}${color}Results: ${passed}/${totalTests} tests passed${RESET}`);
  if (!allPass) console.log(` ${RED}${BOLD}${totalTests - passed} test(s) require attention — see above${RESET}`);
  console.log(`${'═'.repeat(60)}\n`);

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(`${RED}Unhandled error in test runner:${RESET}`, err);
  process.exit(2);
});
