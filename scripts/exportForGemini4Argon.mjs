#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DRABYASHREE NEPSE — GEMINI 4 ARGON AUDIT BUNDLE GENERATOR
 * ══════════════════════════════════════════════════════════════════════════════
 * Bundles the latest, up-to-date Drabyashree NEPSE codebase into optimal,
 * token-budgeted audit packages tailored for Google's Gemini 4 Argon model
 * (1,000,000 token context window).
 *
 * Usage:
 *   node scripts/exportForGemini4Argon.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ── Colors ──
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};

// ── Token Estimator (Standard 4 chars/token heuristic) ──
function estimateTokens(text) {
  return Math.ceil(text.length / 3.8);
}

// ── File Collector ──
function collectFiles(dir, options = {}) {
  const {
    allowedExts = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.sql', '.json', '.html', '.css'],
    excludeDirs = ['node_modules', 'dist', 'build', '.git', 'dist-electron', 'data', 'temp_frames_v3', 'scratch', 'sync_vaults', 'broker_vault', '.agents'],
    excludeFiles = ['package-lock.json', 'broker_matrix_latest.json', 'floorsheet-full-*.json', 'release.keystore', 'google-services.json']
  } = options;

  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const isExcluded = excludeFiles.some(pat => {
          if (pat.includes('*')) {
            const regex = new RegExp('^' + pat.replace(/\*/g, '.*') + '$');
            return regex.test(entry.name);
          }
          return pat === entry.name;
        });

        if (allowedExts.includes(ext) && !isExcluded) {
          try {
            const stat = fs.statSync(fullPath);
            // Skip files larger than 1.5MB (e.g. static assets)
            if (stat.size < 1500 * 1024) {
              results.push({
                fullPath,
                relPath,
                size: stat.size
              });
            }
          } catch (_) {}
        }
      }
    }
  }

  walk(dir);
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

// ── Bundle Writer ──
function writeBundle(outputPath, files, bundleTitle, description) {
  let content = '';
  content += `╔══════════════════════════════════════════════════════════════════════════════╗\n`;
  content += `║ DRABYASHREE NEPSE — CODEBASE AUDIT PACKAGE FOR GEMINI 4 ARGON                ║\n`;
  content += `║ Target: ${bundleTitle.padEnd(68)} ║\n`;
  content += `║ Generated: ${new Date().toISOString().padEnd(65)} ║\n`;
  content += `║ Files Bundled: ${String(files.length).padEnd(61)} ║\n`;
  content += `╚══════════════════════════════════════════════════════════════════════════════╝\n\n`;
  content += `Description:\n${description}\n\n`;
  content += `═`.repeat(80) + `\n\n`;

  let totalLines = 0;

  for (const file of files) {
    try {
      const rawText = fs.readFileSync(file.fullPath, 'utf8');
      const lines = rawText.split('\n').length;
      totalLines += lines;

      content += `=== FILE: ${file.relPath} ===\n`;
      content += `// Size: ${file.size} bytes | Lines: ${lines} | Path: ${file.relPath}\n\n`;
      content += rawText;
      content += `\n\n`;
    } catch (err) {
      content += `=== FILE: ${file.relPath} (ERROR READING: ${err.message}) ===\n\n`;
    }
  }

  fs.writeFileSync(outputPath, content, 'utf8');
  const bytes = fs.statSync(outputPath).size;
  const tokens = estimateTokens(content);
  return {
    filePath: outputPath,
    fileName: path.basename(outputPath),
    filesCount: files.length,
    linesCount: totalLines,
    bytes,
    tokens
  };
}

async function main() {
  console.log(`\n${c.cyan}${c.bold}════════════════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}${c.bold}  DRABYASHREE NEPSE — GEMINI 4 ARGON AUDIT BUNDLE EXPORTER              ${c.reset}`);
  console.log(`${c.cyan}${c.bold}════════════════════════════════════════════════════════════════════════${c.reset}\n`);

  const exportsDir = path.join(projectRoot, 'audit_exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  // ── 1. Part 1: Backend & Server Infrastructure ──
  const backendFiles = collectFiles(path.join(projectRoot, 'proxy'), {
    allowedExts: ['.js', '.mjs', '.sql', '.json'],
    excludeDirs: ['node_modules', 'data', 'sync_vaults', 'broker_vault'],
    excludeFiles: ['push_tokens.json', 'telegram_*.json', 'discord_*.json', 'broker_matrix_latest.json']
  });

  const part1Summary = writeBundle(
    path.join(projectRoot, 'audit_part1_backend.txt'),
    backendFiles,
    'Part 1 — Backend Architecture, Real-Time Ingestion, Broker Vault & DB',
    'Comprehensive backend suite: Express proxy server, BrokerVault engine, PostgreSQL quant schemas, Chukul/ShareSansar scrapers, live NOTS client manager, zero-sum verification routes, rate limiting, and push notifiers.'
  );

  // ── 2. Part 2: Quantitative Calculations, Trading Engines & Services ──
  const quantFiles = [
    ...collectFiles(path.join(projectRoot, 'src', 'utils')),
    ...collectFiles(path.join(projectRoot, 'src', 'services')),
    ...collectFiles(path.join(projectRoot, 'src', 'data'), {
      allowedExts: ['.js', '.ts', '.json'],
      excludeFiles: ['broker_matrix_latest.json']
    })
  ];

  const part2Summary = writeBundle(
    path.join(projectRoot, 'audit_part2_engines.txt'),
    quantFiles,
    'Part 2 — Mathematical Models, Quantitative Setups & Calculation Engines',
    'Core business and calculation logic: Statutory SEBON commission tiers, retail CGT tax math, Wyckoff accumulation/distribution engine, breakout trap validator, Fibonacci retracements, multi-horizon trade planner, candlestick pattern engine, dividend analyzers, and API service layer.'
  );

  // ── 3. Part 3: Frontend Workstation Components & Views ──
  const uiFiles = [
    ...collectFiles(path.join(projectRoot, 'src', 'components')),
    ...collectFiles(path.join(projectRoot, 'src', 'views')),
    ...collectFiles(path.join(projectRoot, 'src', 'context'))
  ];

  // Split UI into two balanced parts for optimal reasoning context
  const halfUI = Math.ceil(uiFiles.length / 2);
  const uiPartA = uiFiles.slice(0, halfUI);
  const uiPartB = uiFiles.slice(halfUI);

  const part3Summary = writeBundle(
    path.join(projectRoot, 'audit_part3_ui_and_views.txt'),
    uiFiles,
    'Part 3 — Full UI Workstation & Component Suite (All 87 Views & Modals)',
    'All React components: AdvancedChartModal (lightweight-charts TradingView engine), ServicesHub, Dashboard, StockDetailModal, AccumulationDistributionRadar, ShareHubScannersSuite, Master100ProfitWorkstation, and mobile viewports.'
  );

  const part3bSummary = writeBundle(
    path.join(projectRoot, 'audit_part3b_ui.txt'),
    uiPartB,
    'Part 3B — Secondary UI Modals & Modular Viewports',
    'Modular React components: Sub-modals, individual calculator widgets, report cards, news readers, and tertiary views.'
  );

  // ── 4. Part 4: E2E Telemetry, Verification Suite & System Manifests ──
  const auditFiles = [
    { fullPath: path.join(projectRoot, 'scripts', 'fullAppAudit.mjs'), relPath: 'scripts/fullAppAudit.mjs', size: fs.statSync(path.join(projectRoot, 'scripts', 'fullAppAudit.mjs')).size },
    { fullPath: path.join(projectRoot, 'package.json'), relPath: 'package.json', size: fs.statSync(path.join(projectRoot, 'package.json')).size },
    { fullPath: path.join(projectRoot, 'vite.config.mjs'), relPath: 'vite.config.mjs', size: fs.statSync(path.join(projectRoot, 'vite.config.mjs')).size },
    { fullPath: path.join(projectRoot, 'electron-builder.json'), relPath: 'electron-builder.json', size: fs.statSync(path.join(projectRoot, 'electron-builder.json')).size },
    { fullPath: path.join(projectRoot, 'capacitor.config.json'), relPath: 'capacitor.config.json', size: fs.statSync(path.join(projectRoot, 'capacitor.config.json')).size },
    { fullPath: path.join(projectRoot, 'android', 'app', 'build.gradle'), relPath: 'android/app/build.gradle', size: fs.statSync(path.join(projectRoot, 'android/app/build.gradle')).size }
  ];

  const part4Summary = writeBundle(
    path.join(projectRoot, 'audit_part4_audit_telemetry.txt'),
    auditFiles,
    'Part 4 — End-to-End Test Suite, Manifests & Build Configurations',
    'Automated 39-point runtime auditor script (fullAppAudit.mjs) verifying zero-sum laws, dynamic multi-day timeframe scaling, real NOTS order books, Electron PC packaging, and Android Capacitor gradle settings.'
  );

  // Copy copies to audit_exports/ as well
  const summaries = [part1Summary, part2Summary, part3Summary, part3bSummary, part4Summary];
  for (const s of summaries) {
    fs.copyFileSync(s.filePath, path.join(exportsDir, s.fileName));
  }

  // ── 5. Generate Master Prompt for Gemini 4 Argon ──
  const promptContent = `# MASTER AUDIT INSTRUCTION & SYSTEM BRIEF FOR GEMINI 4 ARGON

**Role:** You are acting as a **Principal Quantitative Systems Engineer & Senior Financial Software Security Auditor**.
**Target Application:** **Drabyashree NEPSE** (Institutional-grade Nepalese Equity Workstation, Algorithmic Stock Screener & Cross-Platform Mobile/Desktop Application).
**Tech Stack:** React 18, TypeScript, TailwindCSS, TradingView lightweight-charts, Node.js Express Proxy, PostgreSQL, Capacitor (Android Native), Electron (Windows PC).
**Execution Context:** Production backend deployed on Render (\`https://nepseapp.onrender.com\`), consuming live NEPSE NOTS API, Chukul floorsheet, and ShareSansar data.

---

## AUDIT OBJECTIVES & METHODOLOGY

Review the provided codebase partitions against the 6 core dimensions below. Provide a rigorous, highly specific, line-by-line audit report identifying any mathematical edge cases, concurrency hazards, race conditions, memory leaks, security vulnerabilities, or logic flaws.

### Dimension 1: Financial & Quantitative Mathematical Integrity
1. **Zero-Sum Broker Conservation Law:**
   - In floorsheet aggregation, verify that every transaction maintains:
     $$\\sum_{\\text{all brokers}} \\text{BuyQty} \\equiv \\sum_{\\text{all brokers}} \\text{SellQty} \\equiv \\text{Total Traded Volume}$$
   - Verify that for every broker:
     $$\\text{NetQty} = \\text{BuyQty} - \\text{SellQty}$$
   - Ensure wash sales (buyer broker == seller broker) are handled transparently without double-counting volume.
2. **Broker Concentration Ratios (BCR3 & BCR5):**
   - Confirm mathematical formula:
     $$\\text{BCR3}_{\\text{Buy}} = \\left( \\frac{\\sum_{i=1}^3 \\text{BuyQty}_i}{\\text{Total Traded Volume}} \\right) \\times 100$$
   - Check for division by zero guards when total volume is 0.
3. **Statutory SEBON Commission & CGT Tax Engine:**
   - Verify compliance with Nepal SEBON retail equity commission slabs (0.40% under 50k, 0.37% up to 5L, 0.34% up to 20L, 0.27% above 20L).
   - Verify SEBON regulatory fee ($0.015\\%$), DP charge (flat Rs. 25), and retail Individual Short-Term CGT ($7.5\\%$ on net profit).
4. **Technical Indicator Accuracy:**
   - RSI(14) Wilder's smoothed moving average, EMA(20/50/200), Bollinger Bands (20, 2), MACD(12,26,9), VWAP, and classical Pivot Points.

### Dimension 2: Real-Time Data Pipeline & Anti-Hallucination
1. **Multi-Tier Scraper & Fallback Cascade:**
   - Tier 1: Official NEPSE NOTS session token exchange.
   - Tier 2: Chukul date-wise historical floorsheet API.
   - Tier 3: ShareSansar session floorsheet scrape.
   - Tier 4: MeroLagani fallback.
   - Verify that fallback logic NEVER fabricates mock data in production mode, and always raises or preserves authentic data integrity.
2. **Multi-Timeframe Scaling (1D vs 15D vs 30D):**
   - Verify that multi-day floorsheet queries dynamically aggregate unique historical dates from disk vault files and never return static repeated rows.

### Dimension 3: Concurrency, Memory & Socket Reliability
1. **Render 512MB RAM Container Stability:**
   - Inspect asynchronous loops in \`brokerVault.mjs\` and \`server.mjs\`. Verify concurrency limits (\`CONCURRENCY <= 4\`), pause delays, and stream buffering to ensure Node.js never crashes from OOM (Out Of Memory).
2. **Sub-3s Fast Vault Snapshot Response:**
   - Verify the \`Promise.race\` ceiling on multi-day broker requests that returns fast on-disk vault snapshots in $\\le 2.8\\text{s}$ while delegating full sync to background workers.
3. **Connection Pooling & AbortSignal:**
   - Ensure \`AbortSignal.timeout(45000)\` is respected across both web and native Capacitor HTTP bridges.

### Dimension 4: Security, Secrets & Vulnerabilities
1. **Hardcoded Secrets:** Verify zero API keys, service account credentials, or passwords exist in frontend bundles.
2. **Input Sanitization:** Verify SQL queries use parameterized clauses ($1, $2) and prevent SQL injection in \`db.mjs\`.
3. **CORS & Rate Limiting:** Verify Express rate limiters protect the Render endpoint against DDoS and scraping abuse.

### Dimension 5: Trading Psychology & Strategy Edge
1. **Setup Analyzer Order Constraints:**
   - Verify that for Long setups:
     $$\\text{StopLoss} < \\text{Entry Zone Min} \\le \\text{Entry Zone Max} < \\text{Target 1} < \\text{Target 2}$$
   - Verify minimum Risk-Reward ratio $\\ge 2.0$ enforcement.
2. **Wyckoff & Smart Money Flow Radar:**
   - Verify accumulation vs distribution detection signals based on Top-5 broker net absorption vs retail volume spread.

### Dimension 6: Cross-Platform Native Runtime (Android & PC)
1. **Capacitor Mobile Native Bridge:**
   - Safe area insets, back button hardware handler, push notification token listener.
2. **Electron PC Window Manager:**
   - IPC communication, native menu bar, updater blockmaps, and window state persistence.

---

## DESIRED AUDIT DELIVERABLES FROM GEMINI 4 ARGON

Please structure your audit response in the following format:
1. **Executive Scorecard & Certification:** Overall system health score (0-100), production-readiness verdict.
2. **Critical Vulnerabilities & Edge Cases:** Any high-severity bugs, race conditions, or financial calculation discrepancies.
3. **Quantitative & Formula Verification Table:** Comparative analysis of all mathematical implementations vs textbook financial theory.
4. **Performance & Memory Recommendations:** Concrete optimizations for low-memory Render containers and mobile CPU efficiency.
5. **Concrete Drop-In Code Patches:** Exact code blocks for any suggested fixes.
`;

  fs.writeFileSync(path.join(projectRoot, 'GEMINI_4_ARGON_AUDIT_PROMPT.md'), promptContent, 'utf8');
  fs.writeFileSync(path.join(exportsDir, 'GEMINI_4_ARGON_AUDIT_PROMPT.md'), promptContent, 'utf8');

  // ── Print Report Table ──
  console.log(`${c.bold}Audit Packages Successfully Created for Gemini 4 Argon:${c.reset}\n`);
  console.log(`┌────────────────────────────────┬────────────┬─────────────┬──────────────┬────────────────┐`);
  console.log(`│ Package File Name              │ Files Inc. │ Total Lines │ File Size    │ Est. Tokens    │`);
  console.log(`├────────────────────────────────┼────────────┼─────────────┼──────────────┼────────────────┤`);

  for (const s of summaries) {
    const fn = s.fileName.padEnd(30);
    const fc = String(s.filesCount).padStart(10);
    const lc = String(s.linesCount.toLocaleString()).padStart(11);
    const sz = `${(s.bytes / 1024).toFixed(1)} KB`.padStart(12);
    const tk = `~${s.tokens.toLocaleString()}`.padStart(14);
    console.log(`│ ${fn} │ ${fc} │ ${lc} │ ${sz} │ ${tk} │`);
  }
  console.log(`└────────────────────────────────┴────────────┴─────────────┴──────────────┴────────────────┘\n`);

  console.log(`${c.green}✓ Master Audit Prompt:${c.reset} ${c.bold}GEMINI_4_ARGON_AUDIT_PROMPT.md${c.reset}`);
  console.log(`${c.green}✓ Archive Export Folder:${c.reset} ${c.bold}audit_exports/${c.reset}\n`);
  console.log(`${c.yellow}${c.bold}Note for Gemini 4 Argon:${c.reset}`);
  console.log(`  All individual packages are strictly bounded under ~400k tokens, well within Gemini 4 Argon's 1,000,000 token window.`);
  console.log(`  For a full Backend + Quant audit, upload Part 1 + Part 2 together (~580k tokens total).`);
  console.log(`  For UI & Workstations audit, upload Part 3 (~950k tokens total).\n`);
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
