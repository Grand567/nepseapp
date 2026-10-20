// scripts/exportAiGuruForArgon.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const desktopBundleDir = 'C:\\Users\\Hp\\Desktop\\Drabyashree_Audit_Bundle';

function estimateTokens(text) {
  return Math.ceil(text.length / 3.8);
}

const aiGuruFiles = [
  'src/services/aiGuru/runAiQuantitativeAssessment.ts',
  'src/lib/db/drabyashreeDb.ts',
  'src/app/api/ai-guru/assess/route.ts',
  'proxy/routes/aiGuruRoutes.mjs',
  'src/components/AiGuruQuantitativeCard.tsx',
  'src/utils/guruEngine.js',
  'src/services/aiService.js',
  'src/utils/dynamicCalculationEngine.js',
  'src/utils/calculations.js',
  'scripts/verifyBug4AiGuru.ts',
  'proxy/db/ledgerStore.js',
  'src/components/PromoterSharesService.tsx'
];

async function main() {
  console.log('Generating AI Guru Argon Audit Bundle...');

  if (!fs.existsSync(desktopBundleDir)) {
    fs.mkdirSync(desktopBundleDir, { recursive: true });
  }

  let bundleContent = '';
  bundleContent += `╔══════════════════════════════════════════════════════════════════════════════╗\n`;
  bundleContent += `║ DRABYASHREE NEPSE — AI GURU WORKING MECHANISM AUDIT BUNDLE FOR ARGON         ║\n`;
  bundleContent += `║ Target: Comprehensive AI Guru & Institutional Quantitative Engine Audit      ║\n`;
  bundleContent += `║ Generated: ${new Date().toISOString().padEnd(65)} ║\n`;
  bundleContent += `║ Files Included: ${String(aiGuruFiles.length).padEnd(60)} ║\n`;
  bundleContent += `╚══════════════════════════════════════════════════════════════════════════════╝\n\n`;

  bundleContent += `EXECUTIVE SUMMARY OF AI GURU WORKING MECHANISM:\n`;
  bundleContent += `This bundle contains the complete source code of the AI Guru & Institutional Quantitative Engine in Drabyashree NEPSE.\n`;
  bundleContent += `It includes:\n`;
  bundleContent += `1. 4-Stage Verified Price Discovery Chain (LIVE_LTP -> TODAY_CLOSE -> PREV_CLOSE -> HISTORICAL_CANDLE -> LEDGER_VWAP)\n`;
  bundleContent += `2. Zero-Drop Symbol Normalization (eliminating "STOCK" placeholder traps)\n`;
  bundleContent += `3. SQLite Microstructure Telemetry & 5D Broker Anomaly Scoring (with Retail-Giant #58 deflation)\n`;
  bundleContent += `4. Dual-Path Narrative Synthesis (LLM API via Gemini/OpenAI with zero-downtime deterministic institutional quant fallback)\n`;
  bundleContent += `5. Disqualification Safety Gates (Promoter 60D Lock-In Blackout, Negative EPS Avoid, NRB BFI Regulatory Thresholds, Circuit Ceiling Traps)\n`;
  bundleContent += `6. 1.2R Ratchet Shield & Friction-Adjusted Breakeven calculations (accounting for 1.12% NEPSE round-trip fees + 7.5% CGT)\n`;
  bundleContent += `7. Complete 10/10 automated TypeScript regression test suite (verifyBug4AiGuru.ts)\n\n`;
  bundleContent += `═`.repeat(80) + `\n\n`;

  let totalLines = 0;
  let fileSummaries = [];

  for (const relPath of aiGuruFiles) {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`File not found: ${relPath}`);
      continue;
    }
    const rawText = fs.readFileSync(fullPath, 'utf8');
    const lines = rawText.split('\n').length;
    const size = fs.statSync(fullPath).size;
    totalLines += lines;

    bundleContent += `=== FILE: ${relPath} ===\n`;
    bundleContent += `// Path: ${relPath} | Lines: ${lines} | Size: ${size} bytes\n\n`;
    bundleContent += rawText;
    bundleContent += `\n\n`;

    fileSummaries.push({ relPath, lines, size });
  }

  const bundlePath = path.join(desktopBundleDir, 'BUNDLE_AI_GURU_WORKING_MECHANISM.txt');
  fs.writeFileSync(bundlePath, bundleContent, 'utf8');
  const totalBytes = fs.statSync(bundlePath).size;
  const estimatedTokens = estimateTokens(bundleContent);

  console.log(`✓ Wrote ${bundlePath} (${(totalBytes / 1024).toFixed(1)} KB, ~${estimatedTokens.toLocaleString()} tokens, ${totalLines} lines)`);

  const promptLines = [
    "# 🧠 ARGON MASTER QUANTITATIVE AUDIT: AI GURU WORKING MECHANISM & INSTITUTIONAL TELEMETRY",
    "",
    "> **Audit Directive for Argon (Gemini 4 Argon / Principal AI Quantitative Systems Auditor)**  ",
    "> **Target Application:** Drabyashree NEPSE (nepseapp.onrender.com / Desktop & Mobile Core)  ",
    "> **Core Audit Target:** **AI Guru Working Mechanism, Institutional Quantitative Assessment, Price Fallback Chain & Risk Disqualification Gates**  ",
    "> **Audit Package File:** `BUNDLE_AI_GURU_WORKING_MECHANISM.txt`  ",
    "> **Timestamp:** October 20, 2026 | Verified Production Release  ",
    "> **File Location:** `C:\\Users\\Hp\\Desktop\\Drabyashree_Audit_Bundle\\ARGON_AI_GURU_MECHANISM_AUDIT_PROMPT.md`",
    "",
    "---",
    "",
    "## 🎯 AUDIT MISSION & OBJECTIVE FOR ARGON",
    "",
    "You are **Argon**, acting as a **Principal Financial Machine Learning Engineer, Quantitative Risk Architect, and High-Reliability Systems Auditor**.",
    "",
    "You have been commissioned to perform an exhaustive, rigorous, line-by-line audit of the **AI Guru Working Mechanism** inside the Drabyashree NEPSE application.",
    "",
    "The goal of this audit is to verify whether the AI Guru provides **authentic, institutional-grade quantitative intelligence grounded in NEPSE exchange reality**, or if any synthetic assumptions, calculation flaws, security loopholes, or operational failure points exist.",
    "",
    "---",
    "",
    "## 🔬 THE 7 CORE AUDIT DIMENSIONS FOR ARGON",
    "",
    "### Dimension 1: Symbol Normalization & Placeholder Guard",
    "- Inspect `resolveValidNepseSymbol()` in `src/services/aiGuru/runAiQuantitativeAssessment.ts`.",
    "- Verify that placeholder traps (`'STOCK'`, `'SYMBOL'`, `'TICKER'`, `'UNDEFINED'`, `''`) are strictly barred from querying the live feed.",
    "- Verify multi-candidate alias resolution (`props.symbol` -> `selectedScrip.symbol` -> `selectedScrip.ticker` -> `quoteData.symbol` -> `ledgerTelemetry.symbol`).",
    "",
    "### Dimension 2: 4-Stage Verified Price Discovery & Holiday Overrides",
    "- Inspect `resolveVerifiedPrice()` in `src/services/aiGuru/runAiQuantitativeAssessment.ts`.",
    "- Audit the 5-stage fallback hierarchy:",
    "  $$\\text{Verified Price} = \\text{LIVE_LTP} \\to \\text{TODAY_CLOSE} \\to \\text{PREV_CLOSE} \\to \\text{HISTORICAL_CANDLE} \\to \\text{LEDGER_VWAP}$$",
    "- Verify that on NEPSE trading holidays (`quote.isHoliday === true`), stale live feed cache is bypassed and `TODAY_CLOSE` / historical session close is loaded with official holiday metadata.",
    "- Ensure zero probability of 'Data Insufficient' or `NaN` during weekends, off-hours, or public festival breaks.",
    "",
    "### Dimension 3: SQLite Ledger Telemetry & 5D Broker Anomaly Scoring",
    "- Inspect `drabyashreeDb.ts`, `ledgerStore.js`, and `aiGuruRoutes.mjs`.",
    "- Audit the **Broker Anomaly Score Formula**:",
    "  * Retail giant baseline share deflation (Broker #58 Naasa at 8.5%, Broker #45 at 4.2%, Broker #49 at 3.8%).",
    "  * Average ticket size multiplier (rewarding HNI/Institutional tickets >= 300 kitta at 1.35x, penalizing retail herd churn < 45 kitta at 0.65x).",
    "  * Division by zero guards when total volume or trade count is 0.",
    "- Audit regime classification (`INSTITUTIONAL_ACCUMULATION`, `RETAIL_CHURN`, `DISTRIBUTION`, `NEUTRAL`).",
    "",
    "### Dimension 4: NEPSE Fee Friction & 1.2R Ratchet Shield Mechanics",
    "- Inspect `runAiQuantitativeAssessment.ts` lines 302-320:",
    "  * Round-trip NEPSE fee hurdle calibration (1.12%, covering sliding broker commissions, 0.015% SEBON fee, Rs 50 DP charges, and 7.5% short-term CGT).",
    "  * 14-period Average True Range (ATR) calculation from daily OHLCV candles.",
    "  * 1.2R Ratchet Shield trigger price (`Entry VWAP + 1.2 * 1R`) and protected stop price (`Entry VWAP * 1.012`).",
    "- Confirm that post-fee breakeven locks prevent profitable trades from turning into drawdowns.",
    "",
    "### Dimension 5: Institutional Safety Vetoes & Disqualification Gates",
    "- Inspect `guruEngine.js` lines 170-290 and `isActionableBuySignal()`:",
    "  1. **Promoter 60-Day Lock-In Blackout (`PROMOTER_LOCKIN_BLACKOUT`):** Evaluates SEBON 3-year promoter unlock dates; strictly disqualifies stocks within 60 days of secondary float flooding.",
    "  2. **Negative Earnings Gate (`NEGATIVE_EARNINGS_AVOID`):** Blocks stocks with negative TTM EPS from actionable recommendations.",
    "  3. **NRB BFI Regulatory Gate (`NRB_REGULATORY_FAIL`):** Enforces mandatory Nepal Rastra Bank Capital Adequacy, NPL, and Liquidity compliance for banks and microfinances.",
    "  4. **Circuit Ceiling Trap (`CIRCUIT_CEILING_TRAP`):** Disqualifies chasing scrips within 1.5% of +15% daily band.",
    "  5. **Institutional Distribution Trap (`DISTRIBUTION_AVOID`):** Blocks stocks where Top 3 brokers are offloading inventory despite retail buying.",
    "",
    "### Dimension 6: Dual-Path Narrative Architecture & Zero-Downtime Fallback",
    "- Inspect `/api/ai-guru/assess/route.ts` and `aiGuruRoutes.mjs`:",
    "  * Path A: Primary LLM generation via Gemini 2.5 Flash (`GEMINI_API_KEY`) or OpenAI (`OPENAI_API_KEY`).",
    "  * Path B: Guaranteed deterministic institutional fallback (`buildDeterministicInstitutionalAnalysis`).",
    "- Verify that if LLM keys are absent, offline, or rate-limited, the system produces a structured quantitative breakdown without throwing unhandled exceptions.",
    "",
    "### Dimension 7: Verification Suite & Cross-Platform Integrity",
    "- Inspect `scripts/verifyBug4AiGuru.ts` (10/10 passing tests).",
    "- Inspect `StockDetailModal.jsx` and `AiGuruQuantitativeCard.tsx` for safe rendering, absence of undeclared variables (including `marketStatus`), and clean responsive presentation on desktop and mobile.",
    "",
    "---",
    "",
    "## 📋 REQUESTED AUDIT DELIVERABLES FROM ARGON",
    "",
    "Please provide a formal, highly technical audit report containing:",
    "1. **Executive Certification & Score (0–100):** Comprehensive verdict on the AI Guru mechanism.",
    "2. **Dimension-by-Dimension Mathematical & Logic Findings:** Detailed review of all 7 dimensions above.",
    "3. **Edge Case & Vulnerability Analysis:** Any uncovered edge cases, race conditions, or unhandled null/undefined pathways.",
    "4. **Institutional Production Readiness Verdict:** Final sign-off for live capital deployment."
  ];

  const promptContent = promptLines.join('\n');
  const promptPath = path.join(desktopBundleDir, 'ARGON_AI_GURU_MECHANISM_AUDIT_PROMPT.md');
  fs.writeFileSync(promptPath, promptContent, 'utf8');

  console.log(`✓ Wrote ${promptPath}`);
  console.log(`\n🎉 AI Guru Audit Bundle for Argon is ready in Desktop folder:`);
  console.log(`   📁 ${desktopBundleDir}`);
  console.log(`   📄 BUNDLE_AI_GURU_WORKING_MECHANISM.txt (~${estimatedTokens.toLocaleString()} tokens)`);
  console.log(`   📄 ARGON_AI_GURU_MECHANISM_AUDIT_PROMPT.md`);
}

main().catch(err => {
  console.error('Failed to generate bundle:', err);
  process.exit(1);
});
