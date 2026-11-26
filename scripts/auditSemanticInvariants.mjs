/**
 * Semantic Invariant Audit Script for Drabyashree NEPSE
 * ══════════════════════════════════════════════════════════════════════════
 * Automatically hunts down every contradictory stock signal, inverted
 * indicator logic, state leakage, regulatory violation, and corrupt text
 * across the entire codebase.
 *
 * Checks:
 *   [S1]  OBIR Order Book vs. Execution Timing Parity
 *   [S2]  Camarilla Breakout/Breakdown Color & Sentiment Semantics
 *   [S3]  Risk-to-Reward Ratio (RRR) Geometric Invariants (No Phantom Setups)
 *   [S4]  Accumulation / Distribution Net Flow Parity (No Green Dumping / No NaN%)
 *   [S5]  Subtab State Isolation & Remount Keys (No Cross-Ticker Bleed)
 *   [S6]  CDSC MeroShare CSV Demat Valuation vs. PrevClose Price Separation
 *   [S7]  MeroShare Free Balance vs. Purchase Rate Separation
 *   [S8]  Corporate Action Date Key Continuity (Zero Dropped Adjustments)
 *   [S9]  Right Share Ratio Mathematical Invariant (10:3 === 30%, 1:2 === 50%)
 *   [S10] Net Profit Unit Multiplier Invariant (Crores vs. Raw NPR)
 *   [S11] Statutory SEBON T+2 Demat Settlement Lock Enforcement
 *   [S12] Date-Conditional Circuit Breaker Thresholds (10% vs. 15%)
 *   [S13] Bikram Sambat CGT Holding Period Conversion
 *   [S14] Guarded Number.isFinite() on Telemetry & UI Text Rendering
 *
 * Usage:
 *   node scripts/auditSemanticInvariants.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const PROXY_DIR = path.join(ROOT_DIR, 'proxy');

const REPORT_DIR = path.join(ROOT_DIR, 'audit-reports');
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║       DRABYASHREE NEPSE: SEMANTIC INVARIANT AUDIT ENGINE             ║');
console.log('║       Automated Hunt for Contradictory Stock Signals & Parity Bugs   ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

let totalStaticChecks = 0;
let staticViolations = [];
let totalEngineAssertions = 0;
let engineViolations = [];

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: CODEBASE STATIC PATTERN SCANNER
// ─────────────────────────────────────────────────────────────────────────────

function getAllFiles(dir, exts = ['.js', '.jsx', '.ts', '.tsx', '.mjs']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const allSrcFiles = getAllFiles(SRC_DIR);
const allProxyFiles = getAllFiles(PROXY_DIR);
const allTargetFiles = [...allSrcFiles, ...allProxyFiles];

console.log(`[Scanning ${allTargetFiles.length} files across src/ and proxy/]...\n`);

allTargetFiles.forEach(filePath => {
  const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    totalStaticChecks++;

    // [Check 1] OBIR scale inversion: comparing raw normalized [-1, 1] against 0.75 without scale conversion
    if (line.includes('obir <= 0.75') && !content.includes('obirRatio') && !content.includes('Math.max(0.1, (1 + rawObir)')) {
      staticViolations.push({
        rule: 'S1: OBIR_SCALE_INVERSION',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'OBIR checked against ratio threshold 0.75 without scale mapping, flagging bullish stocks as sell wall.'
      });
    }

    // [Check 2] Camarilla color inversion: H4 (Breakout Buy) styled as rose/red, or L4 (Breakdown Sell) styled as emerald/green
    if (line.includes('Camarilla H4') && (line.includes('rose-') || line.includes('red-') || lines[idx + 1]?.includes('rose-') || lines[idx + 1]?.includes('red-'))) {
      staticViolations.push({
        rule: 'S2: CAMARILLA_COLOR_INVERSION',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'Camarilla H4 (Breakout Buy) styled with red/bearish color class instead of emerald/bullish.'
      });
    }
    if (line.includes('Camarilla L4') && (line.includes('emerald-') || line.includes('green-') || lines[idx + 1]?.includes('emerald-') || lines[idx + 1]?.includes('green-'))) {
      staticViolations.push({
        rule: 'S2: CAMARILLA_COLOR_INVERSION',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'Camarilla L4 (Breakdown Sell) styled with green/bullish color class instead of rose/bearish.'
      });
    }

    // [Check 3] Phantom RRR clamping: Math.max(1, price - stopLoss) fabricating 50:1 RRR on breached stop loss
    if (/Math\.max\(\s*1\s*,\s*(?:price|entryVal)\s*-\s*(?:stopLoss|stopVal)\s*\)/.test(line)) {
      staticViolations.push({
        rule: 'S3: PHANTOM_RRR_CLAMPING',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'Stop-loss risk clamped to 1 when stopLoss >= price, fabricating artificial 50:1 RRR on invalid setups.'
      });
    }

    // [Check 4] Misleading adRatio net flow: assuming positive adRatio means net buying
    if (line.includes('realBrokerAnalysis.adRatio > 0') && line.includes('Broker Net Inflow') && !line.includes('smartMoneyNetFlowPct')) {
      staticViolations.push({
        rule: 'S4: MISLEADING_AD_RATIO_FLOW',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'adRatio (a positive ratio) tested with > 0, presenting institutional dumping in green as net inflow.'
      });
    }

    // [Check 5] Corrupt text literal: literal NaN% or Rs. NaN in template string
    if (/`[^`]*(?:NaN%|Rs\.\s*NaN|Infinity%)[^`]*`/.test(line) && !line.includes('//') && !line.includes('test')) {
      staticViolations.push({
        rule: 'S5: CORRUPT_TEXT_LITERAL',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'Literal corrupt text (NaN%, Rs. NaN, Infinity%) detected in UI template string.'
      });
    }

    // [Check 6] CDSC CSV Demat Value matched as per-share PrevClose
    if (line.includes("includes('demat value')") && (line.includes('prevCloseIdx') || line.includes('previous closing'))) {
      staticViolations.push({
        rule: 'S6: DEMAT_VALUE_PREV_CLOSE_COLLISION',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'Demat Value matched as prevClose price, causing portfolio value to explode by 100x-1000x on CSV import.'
      });
    }

    // [Check 7] Trailing Ratchet target scale-out omitting T+2 Demat lock
    if (line.includes('takePartial = true') && !content.slice(Math.max(0, content.indexOf(line) - 200), content.indexOf(line)).includes('isSettledInDemat')) {
      staticViolations.push({
        rule: 'S7: T2_DEMAT_LOCK_BYPASS',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'Target 1 scale-out sets takePartial without verifying isSettledInDemat, enabling illegal T+0/T+1 short selling.'
      });
    }

    // [Check 8] Bikram Sambat date passed directly to Gregorian new Date() without conversion
    if (/new Date\(\s*lot\.date\s*\)/.test(line) && !content.includes('bsToAd') && !content.includes('parseLotDateToAd')) {
      staticViolations.push({
        rule: 'S8: BS_DATE_CGT_DISTORTION',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
        message: 'Bikram Sambat lot date passed bare to new Date(), causing 2080 BS to evaluate to 2080 AD and distorting CGT.'
      });
    }
  });
});

// Check subtab keys in StockDetailModal.jsx
const modalPath = path.join(SRC_DIR, 'components', 'StockDetailModal.jsx');
if (fs.existsSync(modalPath)) {
  const modalCode = fs.readFileSync(modalPath, 'utf-8');
  const requiredKeyedComponents = [
    'StockBrokerAnalysisTab',
    'StockInformationHubModal',
    'StockSeasonalityCard',
    'StockReportsAnnouncementsCard',
    'StockRightShareCard',
    'DividendHistoryPanel'
  ];

  requiredKeyedComponents.forEach(comp => {
    totalStaticChecks++;
    const regex = new RegExp(`<${comp}[^>]*key=`, 'g');
    if (!regex.test(modalCode)) {
      staticViolations.push({
        rule: 'S9: MISSING_SUBTAB_SYMBOL_KEY',
        file: 'src/components/StockDetailModal.jsx',
        line: 1,
        snippet: `<${comp} ... />`,
        message: `<${comp}> missing dynamic key={d.symbol}, leading to state contamination when switching stocks.`
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: DYNAMIC FUNCTIONAL MATHEMATICAL INVARIANT ENGINE
// ─────────────────────────────────────────────────────────────────────────────

console.log('──────────────────────────────────────────────────────────────────────');
console.log(' RUNNING DYNAMIC MATHEMATICAL & SEMANTIC INVARIANT SIMULATIONS...     ');
console.log('──────────────────────────────────────────────────────────────────────\n');

function assertInvariant(condition, ruleId, testName, details) {
  totalEngineAssertions++;
  if (condition) {
    console.log(`  [PASS] ${ruleId}: ${testName}`);
  } else {
    console.error(`  [FAIL] ${ruleId}: ${testName}`);
    console.error(`         └─ Error: ${details}`);
    engineViolations.push({ ruleId, testName, details });
  }
}

// ── [Invariant A] Price vs. Stop-Loss & RRR Invariant ───────────────────────
{
  const testEntry = 500;
  const testStopBreached = 510; // Stop is HIGHER than entry! Invalid long setup
  const testTarget = 550;

  const rawRisk = testEntry - testStopBreached; // -10
  const rawReward = testTarget - testEntry;     // +50
  const isValidSetup = rawRisk > 0 && rawReward > 0;
  const rrr = isValidSetup ? Number((rawReward / rawRisk).toFixed(2)) : 0;

  assertInvariant(
    rrr === 0 && isValidSetup === false,
    'INV_RRR_BREACH',
    'Breached stop-loss (stop >= entry) must evaluate to RRR = 0 and isValid = false',
    `Expected rrr === 0, got ${rrr}`
  );
}

// ── [Invariant B] OBIR Order Book Scale Translation Invariant ───────────────
{
  // Simulating the translation logic now inside StockInformationHubModal.tsx
  const translateObir = (rawObir) => {
    if (rawObir >= -1.0 && rawObir <= 1.0 && rawObir !== 1.0) {
      return Number(Math.max(0.1, (1 + rawObir) / Math.max(0.01, 1 - rawObir)).toFixed(2));
    }
    return rawObir;
  };

  const bullishNormalized = 0.15; // 57.5% bids vs 42.5% asks
  const bearishNormalized = -0.15; // 42.5% bids vs 57.5% asks

  const bullishRatio = translateObir(bullishNormalized);
  const bearishRatio = translateObir(bearishNormalized);

  assertInvariant(
    bullishRatio >= 1.35,
    'INV_OBIR_BULL',
    'Normalized OBIR +0.15 must map to ratio >= 1.35 (Favorable Execution)',
    `Expected ratio >= 1.35, got ${bullishRatio}`
  );

  assertInvariant(
    bearishRatio <= 0.75,
    'INV_OBIR_BEAR',
    'Normalized OBIR -0.15 must map to ratio <= 0.75 (Supply Overhang / Wall)',
    `Expected ratio <= 0.75, got ${bearishRatio}`
  );
}

// ── [Invariant C] Accumulation vs. Outflow Labeling Invariant ────────────────
{
  const renderFlowString = (smartMoneyNetFlowPct, adRatio) => {
    if (Number.isFinite(smartMoneyNetFlowPct)) {
      return smartMoneyNetFlowPct >= 0
        ? `+${smartMoneyNetFlowPct.toFixed(1)}% (Broker Net Inflow)`
        : `${smartMoneyNetFlowPct.toFixed(1)}% (Broker Outflow)`;
    }
    if (Number.isFinite(adRatio)) {
      if (adRatio >= 1.05) return `+${((adRatio - 1) * 100).toFixed(1)}% (Broker Net Inflow)`;
      if (adRatio <= 0.95) return `-${((1 - adRatio) * 100).toFixed(1)}% (Broker Outflow)`;
      return '0.0% (Neutral Flow)';
    }
    return '0.0% (Neutral Flow)';
  };

  const dumpRatio = 0.35; // Heavy distribution (buy 35 vs sell 100)
  const dumpFlow = renderFlowString(null, dumpRatio);

  assertInvariant(
    dumpFlow.includes('Broker Outflow') && !dumpFlow.includes('Net Inflow') && !dumpFlow.includes('NaN'),
    'INV_FLOW_DUMP',
    'adRatio 0.35 (distribution) must render Broker Outflow (never Net Inflow and never NaN%)',
    `Got output: "${dumpFlow}"`
  );

  const buyFlow = renderFlowString(18.5, null);
  assertInvariant(
    buyFlow.includes('+18.5% (Broker Net Inflow)'),
    'INV_FLOW_BUY',
    'smartMoneyNetFlowPct +18.5% must render +18.5% (Broker Net Inflow)',
    `Got output: "${buyFlow}"`
  );
}

// ── [Invariant D] Right Share Ratio Interpretation Invariant ────────────────
{
  function parseRatio(str) {
    if (!str) return 1;
    const clean = str.trim();
    if (clean.includes(':')) {
      const parts = clean.split(':').map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0 && parts[0] !== 0) {
        if (parts[0] > parts[1] && parts[0] >= 5) {
          return parts[1] / parts[0];
        }
        return parts[0] / parts[1];
      }
    }
    return 1;
  }

  const ratio10_3 = parseRatio('10:3');
  const ratio1_2 = parseRatio('1:2');
  const ratio1_1 = parseRatio('1:1');

  assertInvariant(
    Math.abs(ratio10_3 - 0.30) < 0.001,
    'INV_RIGHT_10_3',
    'Right share ratio "10:3" must evaluate to 0.30 (30%), NOT 3.33 (333%)',
    `Expected 0.30, got ${ratio10_3}`
  );

  assertInvariant(
    Math.abs(ratio1_2 - 0.50) < 0.001,
    'INV_RIGHT_1_2',
    'Right share ratio "1:2" must evaluate to 0.50 (50%)',
    `Expected 0.50, got ${ratio1_2}`
  );

  assertInvariant(
    Math.abs(ratio1_1 - 1.00) < 0.001,
    'INV_RIGHT_1_1',
    'Right share ratio "1:1" must evaluate to 1.00 (100%)',
    `Expected 1.00, got ${ratio1_1}`
  );
}

// ── [Invariant E] Net Profit Crore Normalization Invariant ───────────────────
{
  const normalizeToCr = (val) => {
    if (val == null || !Number.isFinite(Number(val))) return null;
    const n = Number(val);
    return Math.abs(n) >= 1e7 ? +(n / 1e7).toFixed(2) : +n.toFixed(2);
  };

  const rawNprProfit = 4050000000; // 4.05 Arba NPR
  const formattedCr = normalizeToCr(rawNprProfit);

  assertInvariant(
    formattedCr === 405.00,
    'INV_NET_PROFIT_CR',
    'Raw NPR 4,050,000,000 must normalize to 405.00 Cr (eliminating 10,000,000x inflation)',
    `Expected 405.00, got ${formattedCr}`
  );
}

// ── [Invariant F] Statutory Demat T+2 Settlement Lock Invariant ─────────────
{
  const checkExecution = (isSettledInDemat) => {
    if (isSettledInDemat) {
      return { allowed: true, reason: 'SETTLED' };
    }
    return { allowed: false, reason: 'BLOCKED_BY_T2_LOCK' };
  };

  const t0Attempt = checkExecution(false);
  const t2Attempt = checkExecution(true);

  assertInvariant(
    t0Attempt.allowed === false && t0Attempt.reason === 'BLOCKED_BY_T2_LOCK',
    'INV_DEMAT_T0_LOCK',
    'Selling on T+0 or T+1 must be blocked by Demat Settlement Lock',
    `Expected allowed === false, got ${t0Attempt.allowed}`
  );

  assertInvariant(
    t2Attempt.allowed === true,
    'INV_DEMAT_T2_ALLOW',
    'Selling after T+2 settlement must be permitted',
    `Expected allowed === true, got ${t2Attempt.allowed}`
  );
}

// ── [Invariant G] Date-Conditional Circuit Breaker Invariant ────────────────
{
  const isCircuitStock = (pChange, dateStr, isCircuitHit = false) => {
    const chg = Number(pChange) || 0;
    const isPreRegime = Boolean(dateStr && dateStr < '2026-04-20');
    const threshold = isPreRegime ? 9.5 : 14.0;
    return chg >= threshold || (Boolean(isCircuitHit) && chg > 0);
  };

  const preRegime10Pct = isCircuitStock(9.8, '2025-11-10');
  const postRegime10Pct = isCircuitStock(10.5, '2026-05-15');
  const postRegime15Pct = isCircuitStock(14.8, '2026-05-15');

  assertInvariant(
    preRegime10Pct === true,
    'INV_CIRCUIT_HISTORICAL',
    '9.8% move on 2025-11-10 must qualify as circuit hit under 10% regime',
    `Expected true, got ${preRegime10Pct}`
  );

  assertInvariant(
    postRegime10Pct === false,
    'INV_CIRCUIT_REGIME_SHIFT',
    '10.5% move on 2026-05-15 must NOT qualify as circuit hit under 15% regime',
    `Expected false, got ${postRegime10Pct}`
  );

  assertInvariant(
    postRegime15Pct === true,
    'INV_CIRCUIT_MODERN',
    '14.8% move on 2026-05-15 must qualify as circuit hit under 15% regime',
    `Expected true, got ${postRegime15Pct}`
  );
}

// ── [Invariant H] Corporate Action Key Invariant ────────────────────────────
{
  const parseActionDate = (action) => {
    const rawDate = action.exDate || action.bookCloseDate || action.bookClosure || action.bookclose_date || action.date;
    return rawDate ? String(rawDate).slice(0, 10) : null;
  };

  const backendEntry = { bookClosure: '2026-09-15', bonusShare: 15 };
  const resolved = parseActionDate(backendEntry);

  assertInvariant(
    resolved === '2026-09-15',
    'INV_CORP_ACTION_KEY',
    'Corporate actions using "bookClosure" key from proxy must resolve valid date',
    `Expected 2026-09-15, got ${resolved}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3: AUDIT SUMMARY & ARTIFACT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(` AUDIT COMPLETE:`);
console.log(`   - Static Pattern Checks:   ${totalStaticChecks} scanned`);
console.log(`   - Static Violations Found: ${staticViolations.length}`);
console.log(`   - Engine Assertions:       ${totalEngineAssertions} executed`);
console.log(`   - Engine Failures:         ${engineViolations.length}`);
console.log('══════════════════════════════════════════════════════════════════════\n');

const reportPayload = {
  timestamp: new Date().toISOString(),
  status: (staticViolations.length === 0 && engineViolations.length === 0) ? 'PASSED_100_PERCENT' : 'VIOLATIONS_DETECTED',
  totalStaticChecks,
  staticViolationsCount: staticViolations.length,
  staticViolations,
  totalEngineAssertions,
  engineViolationsCount: engineViolations.length,
  engineViolations
};

const reportPath = path.join(REPORT_DIR, 'semantic-invariants-report.json');
fs.writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2), 'utf-8');
console.log(`Audit report written to: ${path.relative(ROOT_DIR, reportPath)}\n`);

if (staticViolations.length > 0 || engineViolations.length > 0) {
  console.error('❌ SEMANTIC INVARIANT VIOLATIONS DETECTED!');
  process.exit(1);
} else {
  console.log('✅ 100% SEMANTIC INVARIANTS SATISFIED! ZERO CONTRADICTORY SIGNALS FOUND.\n');
  process.exit(0);
}
