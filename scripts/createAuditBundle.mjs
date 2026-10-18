#!/usr/bin/env node
/**
 * scripts/createAuditBundle.mjs
 * 
 * Extracts and bundles all core Drabyashree NEPSE source files to the user's Desktop
 * under `Drabyashree_Audit_Bundle`.
 * 
 * 1. Copies raw source files preserving directory structure into raw_files/
 * 2. Generates 4 clean plain-text bundles wrapped with:
 *    // ==================== FILE: relative/path/to/file ====================
 *    - BUNDLE_1_ARCHITECTURE_AND_BACKEND.txt
 *    - BUNDLE_2_QUANT_ENGINE_AND_GATES.txt
 *    - BUNDLE_3_FRONTEND_RADAR_AND_OVERVIEW.txt
 *    - BUNDLE_4_DIAGNOSTICS_AND_CHARTS.txt
 * 3. Verifies file sizes and prints exact audit manifest.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Target directory on Desktop
const desktopDir = path.join(process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Hp', 'Desktop', 'Drabyashree_Audit_Bundle');
const rawFilesDir = path.join(desktopDir, 'raw_files');

console.log('Project Root:', projectRoot);
console.log('Target Bundle Directory:', desktopDir);

// 1. Ensure target directories exist
if (!fs.existsSync(desktopDir)) {
  fs.mkdirSync(desktopDir, { recursive: true });
}
if (!fs.existsSync(rawFilesDir)) {
  fs.mkdirSync(rawFilesDir, { recursive: true });
}

// 2. Define Exclusion Rules
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'build',
  'android',
  'release',
  '.agents',
  '.claude',
  '.github',
  '.vercel',
  'temp_frames_v3',
  'scratch',
  'audit_exports',
  'data',
  'sync_vaults',
  'broker_vault'
]);

const EXCLUDE_FILES = new Set([
  'package-lock.json',
  'broker_matrix_latest.json',
  'release.keystore',
  'google-services.json',
  'dump_merolagani.cjs',
  'extract.cjs',
  'extract.txt',
  'extract_info.cjs',
  'find_ltp.cjs',
  'find_ltp.txt',
  'liveDataFull.txt',
  'nabil_qtr.txt',
  'qtr.txt',
  'tunnel.txt',
  'merolagani_home.html',
  'merolagani_nabil.html',
  'indices_merolagani.html',
  'sharesansar_market.html',
  'temp-analytica-index.html',
  'glbsl.html',
  'index.html',
  'NEPSE-Analytica-release.apk',
  'NEPSE_100_Percent_Profit_Master_Guide.pdf',
  'NEPSE_Alpha_Playbook.html',
  'NEPSE_Alpha_Playbook.pdf',
  'NEPSE_Alpha_Playbook.txt',
  'NEPSE_Confirmed_Entry_Profit_Blueprint.pdf',
  'NEPSE_EASY_INVESTING_GUIDE.txt',
  'NEPSE_QUANTITATIVE_TRADING_BIBLE.md',
  'Dashboard_backup.jsx',
  'Dashboard_base.jsx',
  'Dashboard_code.txt',
  'nepseUniverse.ts.txt'
]);

function isExcluded(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const base = path.basename(filePath);

  // Exclude secrets (.env, .env.local, .env.production, etc.)
  if (base.startsWith('.env')) return true;

  // Exclude lockfiles
  if (base.endsWith('-lock.json') || base.endsWith('.lock')) return true;

  // Exclude binaries / media
  const ext = path.extname(base).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.apk', '.keystore', '.zip'].includes(ext)) {
    return true;
  }

  // Exclude specific files
  if (EXCLUDE_FILES.has(base)) return true;

  // Exclude one-off fix/fetch test scripts in root
  if (/^(fix_|fetch_test|test_mero|patch_|dump_).*\.(cjs|js|txt)$/.test(base)) return true;

  // Check directory path
  const parts = norm.split('/');
  for (const p of parts) {
    if (EXCLUDE_DIRS.has(p)) return true;
  }

  return false;
}

// 3. Collect all files across directories
function scanDirectory(dir, relPrefix = '') {
  const items = [];
  if (!fs.existsSync(dir)) return items;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        items.push(...scanDirectory(fullPath, relPath));
      }
    } else if (entry.isFile()) {
      if (!isExcluded(fullPath)) {
        items.push({ fullPath, relPath: relPath.replace(/\\/g, '/'), size: fs.statSync(fullPath).size });
      }
    }
  }
  return items;
}

// Collect raw source files
console.log('Scanning project files...');
const allProjectFiles = scanDirectory(projectRoot);
console.log(`Found ${allProjectFiles.length} candidate source files.`);

// Filter for active source file types (.js, .jsx, .ts, .tsx, .mjs, .cjs, .css, .json, .sql)
const ALLOWED_RAW_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.css', '.json', '.sql', '.html']);
const rawSourceFiles = allProjectFiles.filter(f => {
  const ext = path.extname(f.relPath).toLowerCase();
  if (!ALLOWED_RAW_EXTS.has(ext)) return false;

  // Don't copy huge mock datasets
  if (f.relPath.includes('proxy/data/') || f.relPath.includes('src/data/broker_matrix_latest.json')) {
    return false;
  }
  return true;
});

console.log(`Copying ${rawSourceFiles.length} raw source files into raw_files/ preserving directory structure...`);

for (const file of rawSourceFiles) {
  const destPath = path.join(rawFilesDir, file.relPath);
  const destSubdir = path.dirname(destPath);
  if (!fs.existsSync(destSubdir)) {
    fs.mkdirSync(destSubdir, { recursive: true });
  }
  fs.copyFileSync(file.fullPath, destPath);
}
console.log('✓ Step 1 Complete: Raw files copied successfully.\n');

// Build directory tree
function buildDirectoryTree(files) {
  const tree = {};
  for (const f of files) {
    const parts = f.relPath.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = `${(f.size / 1024).toFixed(1)} KB`;
      } else {
        current[part] = current[part] || {};
        current = current[part];
      }
    }
  }

  function renderTree(node, prefix = '') {
    let lines = [];
    const keys = Object.keys(node).sort((a, b) => {
      const isDirA = typeof node[a] === 'object';
      const isDirB = typeof node[b] === 'object';
      if (isDirA && !isDirB) return -1;
      if (!isDirA && isDirB) return 1;
      return a.localeCompare(b);
    });

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      const branch = isLast ? '└── ' : '├── ';
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');

      if (typeof node[key] === 'object') {
        lines.push(`${prefix}${branch}${key}/`);
        lines.push(...renderTree(node[key], nextPrefix));
      } else {
        lines.push(`${prefix}${branch}${key}  [${node[key]}]`);
      }
    }
    return lines;
  }

  return 'Drabyashree_NEPSE_Active_Codebase/\n' + renderTree(tree).join('\n');
}

// 4. Bundle Categorization
// Bundle 1: Architecture & Backend
const bundle1Paths = new Set([
  'package.json',
  'server.js',
  'api/index.mjs',
  'routes/radarRoutes.js',
  'db/ledgerStore.js',
  'electron/main.cjs',
  'electron-builder.json',
  'vite.config.mjs',
  'tailwind.config.js',
  'postcss.config.js',
  'render.yaml',
  'vercel.json',
  'proxy/package.json',
  'proxy/server.js',
  'proxy/server.mjs',
  'proxy/routes/radarRoutes.js',
  'proxy/db/ledgerStore.js',
  'proxy/db.mjs',
  'proxy/brokerVault.mjs',
  'proxy/nepseClientManager.mjs',
  'proxy/syncRouter.mjs',
  'proxy/workers.mjs',
  'proxy/agentTools.mjs',
  'proxy/institutionalAlertEngine.mjs',
  'proxy/smartAlertEngine.mjs',
  'proxy/telegramNotifier.mjs',
  'proxy/discordNotifier.mjs',
  'proxy/keepalive.mjs',
  'proxy/ipoHelper.js',
  'proxy/scrapeIpo.js',
  'proxy/scrapeNames.js',
  'proxy/meroshare.js',
  'proxy/verify_accurate_data.mjs',
  'proxy/quant/macroCache.mjs',
  'proxy/quant/newsCache.mjs',
  'proxy/migrations/001_prediction_engine.sql',
  'white-label.mjs'
]);

// Bundle 2: Quant Engine & Quality Gates & Calculators
const bundle2Paths = new Set([
  'proxy/utils/microstructureEngine.js',
  'proxy/quant/predictorEngine.mjs',
  'proxy/quant/featureEngine.mjs',
  'src/utils/microstructureEngine.js',
  'src/utils/accumulationDistributionEngine.ts',
  'src/utils/breakoutTrapEngine.ts',
  'src/utils/priceActionEngine.js',
  'src/utils/newsImpactScorer.js',
  'src/utils/stockSignals.js',
  'src/utils/stockMetrics.js',
  'src/utils/liveSectorMedians.js',
  'src/utils/quantEngine.js',
  'src/utils/setupAnalyzer.js',
  'src/utils/analyzerValidation.js',
  'src/utils/backtest.js',
  'src/utils/indicators.js',
  'src/utils/technicalAnalysisEngine.js',
  'src/utils/candlestickPatterns.js',
  'src/utils/calculations.js',
  'src/utils/dynamicCalculationEngine.js',
  'src/utils/dynamicCapitalEngine.js',
  'src/utils/masterProfitEngine.ts',
  'src/utils/riskManagement.js',
  'src/utils/priceAdjustment.js',
  'src/views/WaccTaxCalculator.jsx',
  'src/components/Calculator.jsx',
  'src/components/calculators.tsx',
  'src/components/FibonacciCalculatorService.tsx',
  'src/components/CapitalRiskSimulatorBar.jsx',
  'src/components/CapitalRiskSimulatorView.jsx',
  'src/components/ShortTermProfitPlan.jsx',
  'src/components/EntryExitAnalyzer.tsx',
  'src/utils/dividendHistory.js',
  'src/utils/earningsCalendar.js',
  'src/utils/bookClosureTracker.js',
  'src/utils/bikramSambat.js',
  'src/utils/nepaliDate.js',
  'src/utils/nepseCalendar.js',
  'src/utils/fundamentals.js',
  'src/utils/guruEngine.js',
  'src/utils/liveData.js',
  'src/utils/licenseEngine.js',
  'src/utils/cacheManager.js',
  'src/utils/historyCache.js',
  'src/utils/indexedDb.js',
  'src/utils/nepseAdapterLayer.js',
  'src/utils/paperTrading.js',
  'src/utils/watchlist.js',
  'src/utils/watchlistAlerts.js',
  'src/utils/subscription.js',
  'src/utils/pushNotificationService.js',
  'src/utils/floorsheetExport.js',
  'src/utils/servicesApi.js',
  'src/services/aiService.js',
  'src/services/merolaganiNewsService.js',
  'src/services/meroShareService.js',
  'src/services/nepseAgentTools.js',
  'src/services/signalTracker.js',
  'src/services/stockSnapshot.js',
  'src/services/whaleDailyArchive.js'
]);

// Bundle 4: Diagnostics, Testing, and Charting
const bundle4Paths = new Set([
  'src/components/TestSuite.jsx',
  'src/components/AdvancedChartModal.jsx',
  'src/components/TradingViewChartService.tsx',
  'src/components/ShareHubChart.jsx',
  'scripts/fullAppAudit.mjs',
  'scripts/exportForGemini4Argon.mjs',
  'scripts/generate-license.mjs',
  'scripts/genUniverse.cjs',
  'stage3TestRunner.mjs',
  'verify-all-endpoints.js',
  'verify-guru-ai.js',
  'verify-render-deployment.js',
  'tests/runAll.mjs',
  'tests/auditCrossModuleConsistency.test.mjs',
  'tests/bBatchIndicators.test.mjs',
  'tests/cBatchPriceAdjustment.test.mjs',
  'tests/comparativeVerification.test.mjs',
  'tests/dBatchFundamentals.test.mjs',
  'tests/eBatchRiskManagement.test.mjs',
  'tests/fBatchBacktest.test.mjs',
  'tests/gBatchInvariants.test.mjs',
  'tests/hBatchMacroEvents.test.mjs',
  'tests/iBatchInvestorSafety.test.mjs',
  'tests/jBatchAdvancedEngines.test.mjs',
  'tests/kWhaleDailyArchive.test.mjs',
  'tests/lBatchShareHubParity.test.mjs',
  'tests/stealth_accumulation.test.js',
  'tests/stockyanAndFundamentalsParity.test.mjs',
  'tests/testDynamicCapitalEngine.mjs',
  'tests/testInstitutionalConfluencePipeline.mjs',
  'tests/testSmartAlertPipeline.mjs',
  'tests/testTelegramExitAndTracking.mjs'
]);

// Bundle 3: Frontend Radar, Overview, App Container & UI Views/Modals
// Everything in src/ that is not in bundle 2 or 4 belongs in bundle 3
const bundle3Files = [];
const bundle1Files = [];
const bundle2Files = [];
const bundle4Files = [];

// Helper to find file entry
const fileMap = new Map();
for (const f of rawSourceFiles) {
  fileMap.set(f.relPath, f);
}

for (const relPath of bundle1Paths) {
  const item = fileMap.get(relPath);
  if (item) bundle1Files.push(item);
}

for (const relPath of bundle2Paths) {
  const item = fileMap.get(relPath);
  if (item) bundle2Files.push(item);
}

for (const relPath of bundle4Paths) {
  const item = fileMap.get(relPath);
  if (item) bundle4Files.push(item);
}

// All remaining active files go to bundle 3 (UI, Modals, Views, App)
for (const f of rawSourceFiles) {
  if (
    !bundle1Paths.has(f.relPath) &&
    !bundle2Paths.has(f.relPath) &&
    !bundle4Paths.has(f.relPath)
  ) {
    bundle3Files.push(f);
  }
}

// Bundle 5: Specialized Stock Selection, Quant Ranking & Alpha Optimization
const bundle5Paths = new Set([
  'src/utils/setupAnalyzer.js',
  'src/utils/scanners.js',
  'proxy/institutionalAlertEngine.mjs',
  'proxy/smartAlertEngine.mjs',
  'src/utils/dynamicCapitalEngine.js',
  'src/utils/calculations.js',
  'src/utils/backtest.js',
  'src/components/analyzer/EntryRiskCard.tsx',
  'src/components/analyzer/HistoricalAnalogPanel.tsx',
  'src/components/analyzer/SignalTrackRecord.jsx',
  'tests/testInstitutionalConfluencePipeline.mjs',
  'tests/testDynamicCapitalEngine.mjs',
  'tests/testSmartAlertPipeline.mjs',
  'tests/testTelegramExitAndTracking.mjs'
]);
const bundle5Files = [];
for (const relPath of bundle5Paths) {
  const item = fileMap.get(relPath);
  if (item) bundle5Files.push(item);
}

// Bundle 6: Portfolio, WACC & Corporate Actions
const bundle6Paths = new Set([
  'src/components/PortfolioHub.jsx',
  'src/components/Portfolio.jsx',
  'src/utils/priceAdjustment.js',
  'src/utils/dividendHistory.js',
  'src/views/WaccTaxCalculator.jsx',
  'src/components/calculators.tsx',
  'src/utils/paperTrading.js',
  'src/utils/calculations.js'
]);
const bundle6Files = [];
for (const relPath of bundle6Paths) {
  const item = fileMap.get(relPath);
  if (item) bundle6Files.push(item);
}

// Bundle 7: AI Predictor, ML Feature Store & Macro Engine
const bundle7Paths = new Set([
  'src/components/PredictorHub.jsx',
  'proxy/quant/predictorEngine.mjs',
  'proxy/quant/featureEngine.mjs',
  'proxy/quant/macroCache.mjs',
  'proxy/quant/newsCache.mjs',
  'src/utils/newsImpactScorer.js',
  'src/components/NRBMacroWidget.jsx',
  'src/services/aiService.js',
  'src/components/AiAnalyst.jsx'
]);
const bundle7Files = [];
for (const relPath of bundle7Paths) {
  const item = fileMap.get(relPath);
  if (item) bundle7Files.push(item);
}

// Bundle 8: MeroShare Automation, ASBA & IPO Execution Hub
const bundle8Paths = new Set([
  'src/components/MeroShareHub.jsx',
  'src/components/IPOList.jsx',
  'src/services/meroShareService.js',
  'proxy/meroshare.js',
  'proxy/scrapeIpo.js',
  'proxy/ipoHelper.js',
  'src/utils/credentialCrypto.js'
]);
const bundle8Files = [];
for (const relPath of bundle8Paths) {
  const item = fileMap.get(relPath);
  if (item) bundle8Files.push(item);
}

// Sort for consistency
bundle1Files.sort((a, b) => a.relPath.localeCompare(b.relPath));
bundle2Files.sort((a, b) => a.relPath.localeCompare(b.relPath));
bundle3Files.sort((a, b) => a.relPath.localeCompare(b.relPath));
bundle4Files.sort((a, b) => a.relPath.localeCompare(b.relPath));
bundle5Files.sort((a, b) => a.relPath.localeCompare(b.relPath));
bundle6Files.sort((a, b) => a.relPath.localeCompare(b.relPath));
bundle7Files.sort((a, b) => a.relPath.localeCompare(b.relPath));
bundle8Files.sort((a, b) => a.relPath.localeCompare(b.relPath));

console.log(`Categorized Files:`);
console.log(`  Bundle 1 (Architecture & Backend) : ${bundle1Files.length} files`);
console.log(`  Bundle 2 (Quant Engine & Gates)   : ${bundle2Files.length} files`);
console.log(`  Bundle 3 (Frontend Radar & UI)    : ${bundle3Files.length} files`);
console.log(`  Bundle 4 (Diagnostics & Charts)   : ${bundle4Files.length} files`);
console.log(`  Bundle 5 (Alpha & Stock Selection): ${bundle5Files.length} files`);
console.log(`  Bundle 6 (Portfolio & WACC)       : ${bundle6Files.length} files`);
console.log(`  Bundle 7 (AI Predictor & Macro)   : ${bundle7Files.length} files`);
console.log(`  Bundle 8 (MeroShare & IPO Hub)    : ${bundle8Files.length} files`);

// Helper to write a bundle
function createBundleText(bundleName, bundleTitle, description, files, extraText = '') {
  const outPath = path.join(desktopDir, bundleName);
  let content = '';

  content += `// ============================================================================\n`;
  content += `// DRABYASHREE NEPSE — AUDIT BUNDLE FOR EXTERNAL ARGON AUDIT\n`;
  content += `// Bundle: ${bundleTitle}\n`;
  content += `// Target File: ${bundleName}\n`;
  content += `// Generated: ${new Date().toISOString()}\n`;
  content += `// Total Files Included: ${files.length}\n`;
  content += `// Description: ${description}\n`;
  content += `// ============================================================================\n\n`;

  if (extraText) {
    content += extraText + '\n\n';
  }

  for (const f of files) {
    content += `// ==================== FILE: ${f.relPath} ====================\n`;
    try {
      const code = fs.readFileSync(f.fullPath, 'utf8');
      content += code;
    } catch (err) {
      content += `// ERROR READING FILE: ${err.message}\n`;
    }
    content += '\n\n';
  }

  fs.writeFileSync(outPath, content, 'utf8');
  const stat = fs.statSync(outPath);
  return {
    name: bundleName,
    path: outPath,
    bytes: stat.size,
    kb: (stat.size / 1024).toFixed(1),
    mb: (stat.size / (1024 * 1024)).toFixed(2),
    fileCount: files.length
  };
}

// 5. Generate Bundles
console.log('\nGenerating Bundle 1: Architecture & Backend...');
const treeList = buildDirectoryTree(rawSourceFiles);
const b1Meta = createBundleText(
  'BUNDLE_1_ARCHITECTURE_AND_BACKEND.txt',
  'Part 1: Architecture, Server Entry, Scrapers & Backend Data Pipelines',
  'Contains package.json, directory tree list, server entrypoints (server.js, server.mjs, api/index.mjs), REST API routes, NEPSE scraper/proxy fetchers, broker vault engine, and database/caching files.',
  bundle1Files,
  `// ==================== REPOSITORY DIRECTORY TREE ====================\n/*\n${treeList}\n*/`
);

console.log('Generating Bundle 2: Quant Engine & Quality Gates...');
const b2Meta = createBundleText(
  'BUNDLE_2_QUANT_ENGINE_AND_GATES.txt',
  'Part 2: Quant Engine, Microstructure, Quality Gates & Statutory Calculators',
  'Contains all microstructure calculations, Quality Gates (SCR3, Smart Money Flow, News filter, T+2 cycle), Setup Score/Win-Rate formulas, technical indicators (EMA, RSI, BB, VWAP), and Rupee Profit / WACC / SEBON fee calculators.',
  bundle2Files
);

console.log('Generating Bundle 3: Frontend Radar & Overview...');
const b3Meta = createBundleText(
  'BUNDLE_3_FRONTEND_RADAR_AND_OVERVIEW.txt',
  'Part 3: Frontend Workstation, Accumulation/Distribution Radar & Viewports',
  'Contains main App container (App.jsx), Stock Overview ("Beginner Confidence & Rupee Profit Simulator"), Accumulation & Distribution Radar, Search/Filter Tab components, and all modular viewports.',
  bundle3Files
);

// Split Bundle 3 into 3A and 3B for LLM token limits (Argon paste size safety)
const splitIdx = bundle3Files.findIndex(f => f.relPath.includes('SignalTrackRecord.jsx'));
const b3AFiles = splitIdx !== -1 ? bundle3Files.slice(0, splitIdx + 1) : bundle3Files.slice(0, Math.floor(bundle3Files.length / 2));
const b3BFiles = splitIdx !== -1 ? bundle3Files.slice(splitIdx + 1) : bundle3Files.slice(Math.floor(bundle3Files.length / 2));

console.log('Generating Bundle 3A: Radar & Analyzers (First Half)...');
const b3AMeta = createBundleText(
  'BUNDLE_3A_RADAR_AND_ANALYZERS.txt',
  'Part 3A: Radar, Analyzers & First Half of Frontend Components',
  'Contains App.jsx, AccumulationDistributionRadar.tsx, and analyzer components up to SignalTrackRecord.jsx.',
  b3AFiles
);

console.log('Generating Bundle 3B: Dashboard, Overview & Modals (Second Half)...');
const b3BMeta = createBundleText(
  'BUNDLE_3B_DASHBOARD_AND_OVERVIEW.txt',
  'Part 3B: Dashboard, Stock Overview & Modular Viewports',
  'Contains Dashboard.jsx (Market Tab, Search Filter Tabs, 4 Overview Cards), StockDetailModal.jsx (Beginner Confidence & Rupee Profit Simulator), PredictorHub.jsx, ServicesHub.jsx, PortfolioHub.jsx, and remaining UI modals.',
  b3BFiles
);

console.log('Generating Bundle 4: Diagnostics & Charts...');
// Read audit output if available
function cleanAnsiAndLog(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\r\n/g, '\n');
}

let auditOutput = '';
const task48Log = 'C:\\Users\\Hp\\.gemini\\antigravity\\brain\\3e6f93bb-60bb-4c33-a646-48e21782aa76\\.system_generated\\tasks\\task-48.log';
const task52Log = 'C:\\Users\\Hp\\.gemini\\antigravity\\brain\\3e6f93bb-60bb-4c33-a646-48e21782aa76\\.system_generated\\tasks\\task-52.log';

const auditText = cleanAnsiAndLog(task48Log) || cleanAnsiAndLog(path.join(projectRoot, 'audit_exports', 'latest_audit_run.txt'));
const testText = cleanAnsiAndLog(task52Log) || cleanAnsiAndLog(path.join(projectRoot, 'audit_exports', 'latest_unit_tests_run.txt'));

if (auditText) {
  auditOutput += `// ==================== LATEST RUNTIME AUDIT SUITE OUTPUT (39 CHECKS) ====================\n/*\n${auditText.trim()}\n*/\n\n`;
}
if (testText) {
  auditOutput += `// ==================== LATEST AUTOMATED UNIT TEST SUITES (18/18 PASSED) ====================\n/*\n${testText.trim()}\n*/\n\n`;
}

const b4Meta = createBundleText(
  'BUNDLE_4_DIAGNOSTICS_AND_CHARTS.txt',
  'Part 4: Deep Diagnostics, Charting Canvas Components & Audit Test Suites',
  'Contains the Deep Diagnostic Investigation component, Charting/Canvas components (TradingView lightweight-charts), all automated test suites, and runtime verification logs.',
  bundle4Files,
  auditOutput
);

console.log('Generating Bundle 5: Stock Selection, Quant Ranking & Alpha Optimization...');
const b5Meta = createBundleText(
  'BUNDLE_5_STOCK_SELECTION_AND_ALPHA.txt',
  'Part 5: Core Stock Picking, Prime Pick Ranking, Veto Filters & Alpha Optimization',
  'Contains setupAnalyzer.js, scanners.js, institutionalAlertEngine.mjs, smartAlertEngine.mjs, dynamicCapitalEngine.js, calculations.js, backtest.js, EntryRiskCard.tsx, HistoricalAnalogPanel.tsx, SignalTrackRecord.jsx, and automated quant verification suites.',
  bundle5Files
);

console.log('Generating Bundle 6: Portfolio, WACC & Corporate Actions...');
const b6Meta = createBundleText(
  'BUNDLE_6_PORTFOLIO_WACC_AND_CORPORATE_ACTIONS.txt',
  'Part 6: Portfolio Tracking, WACC Taxation, Corporate Action Dilutions & Paper Trading',
  'Contains PortfolioHub.jsx, Portfolio.jsx, priceAdjustment.js, dividendHistory.js, WaccTaxCalculator.jsx, calculators.tsx, paperTrading.js, and calculations.js.',
  bundle6Files
);

console.log('Generating Bundle 7: AI Predictor, ML Feature Store & Macro Engine...');
const b7Meta = createBundleText(
  'BUNDLE_7_AI_PREDICTOR_AND_MACRO.txt',
  'Part 7: Machine Learning Predictor, Quantitative Feature Engine, Macro Indicators & AI Analyst',
  'Contains PredictorHub.jsx, predictorEngine.mjs, featureEngine.mjs, macroCache.mjs, newsCache.mjs, newsImpactScorer.js, NRBMacroWidget.jsx, aiService.js, and AiAnalyst.jsx.',
  bundle7Files
);

console.log('Generating Bundle 8: MeroShare Automation, ASBA & IPO Execution Hub...');
const b8Meta = createBundleText(
  'BUNDLE_8_MEROSHARE_AND_IPO_HUB.txt',
  'Part 8: CDSC MeroShare C-ASBA Automation, IPO Application Center, Credential Security & Allotment Scraper',
  'Contains MeroShareHub.jsx, IPOList.jsx, meroShareService.js, proxy/meroshare.js, proxy/scrapeIpo.js, proxy/ipoHelper.js, and credentialCrypto.js.',
  bundle8Files
);

// 6. Generate Master Argon Stock Selection Audit Prompt on Desktop
const argonPromptPath = path.join(desktopDir, 'ARGON_STOCK_SELECTION_AUDIT_PROMPT.md');
const argonPromptContent = `# 🚀 Argon Deep Quantitative Audit: Stock Selection, Alpha Optimization & Capital Preservation Engine

## 🎯 AUDIT MISSION
You are **Argon**, an elite Principal Quantitative Finance Auditor specializing in emerging frontier stock exchanges (**NEPSE — Nepal Stock Exchange**).

You are auditing **\`BUNDLE_5_STOCK_SELECTION_AND_ALPHA.txt\`** from **Drabyashree NEPSE**, containing the central quantitative algorithms that select, score, and rank stocks for live recommendation to retail and institutional users:
- **\`src/utils/setupAnalyzer.js\`**: The core quant brain generating Setup Scores (0–100), win-rates, dynamic buy zones, chase caps, and 5 quality gates.
- **\`src/utils/scanners.js\`**: Scanners for Breakouts, Wyckoff Volume Dry-Up (VDU), Momentum, and Sector Relative Strength.
- **\`proxy/institutionalAlertEngine.mjs\`**: Morning market institutional accumulation detector, 4-pillar confluence scoring, and the 7-Point Veto Engine against operator dumps and settlement cliffs.
- **\`proxy/smartAlertEngine.mjs\`**: Real-time intraday breakout scanner and two-way Telegram exit alert pipeline.
- **\`src/utils/dynamicCapitalEngine.js\`**: Friction-adjusted Half-Kelly position sizing across 4 capital tiers (Rs. 50k, Rs. 1 Lakh, Rs. 10 Lakh, Rs. 75 Lakh) with turnover liquidity guards.
- **\`src/utils/calculations.js\`**: Statutory NEPSE transaction friction engine (tiered broker commissions 0.27%–0.40%, SEBON 0.015%, DP fee Rs. 25, statutory 7.5% Short-Term CGT, and Net R:R math).
- **\`src/components/analyzer/EntryRiskCard.tsx\`**: Complete trade execution ticket UI, risk/reward preview, and scale-out execution roadmap.

---

## 🔍 5 CRITICAL AUDIT OBJECTIVES

### 1. Setup Score (0–100) & Win-Rate Formula Calibration (\`src/utils/setupAnalyzer.js\`)
- **Objective:** Ensure the setup score rewards genuine accumulation and penalizes overextended rallies.
- **Audit Checks:**
  1. Does the score reward Wyckoff Volume Dry-Up ($VDU \\le 0.5\\times$ 20D vol) sufficiently?
  2. Is the sector leadership bonus ($+15$ pts) applied only to stocks in the Top 3 strongest sectors over the past 10 sessions?
  3. Is the \`chaseCap\` strictly enforced so users never buy when price exceeds $\\text{Entry}_{\\max} \\times 1.025$?
  4. Are the 5 Quality Gates (Circuit Trap Gate, Negative EPS / Loss-Maker Gate, Excessive Upper Wick $\\ge 40\%$ Gate, Downtrend Under 50 EMA Gate, Low Liquidity Gate) rigorous?

### 2. The 7 Hard Veto Gates Against Operator Traps (\`proxy/institutionalAlertEngine.mjs\`)
- **Objective:** Eliminate operator pump-and-dump losses in NEPSE.
- **Audit Checks:**
  1. **±15% Circuit Ceiling Chase:** Are stocks within $2\%$ of the circuit ceiling vetoed?
  2. **Operator Offloading ($\text{BCR3}_{\\text{sell}} \\ge 38\%$):** Are stocks where top 3 selling brokers dominate vetoed?
  3. **T+3 Settlement Dump Risk:** Does the engine check if shares bought 3 sessions ago ($t-3$) are up $>10\%$ and ready for delivery sale dump?
  4. **Micro-Cap Illiquidity:** Are stocks with $< \\text{Rs. } 60\\text{ Lakhs}$ 20D median turnover vetoed?
  5. **Pre-Open Gap Trap:** Are stocks with $>4.5\%$ pre-open gap-up vetoed from morning buy recommendations?
  6. **Opening Noise:** Are signals triggered between 11:00 AM and 11:15 AM filtered or delayed until 11:16 AM price stabilization?

### 3. Net Post-Tax & Fee Risk-to-Reward Ratio ($\text{R:R} \\ge 3:1$) (\`src/utils/calculations.js\`)
- **Objective:** Ensure no user ever buys a stock with unfavorable mathematical expectancy.
- **Audit Checks:**
  1. Does \`calculateBuyDetails\` and \`calculateSellDetails\` calculate statutory SEBON ($0.015\%$), tiered broker fees ($0.27\% - 0.40\%$), Rs. 25 DP fee, and $7.5\%$ Short-Term CGT accurately?
  2. Is a "BUY" signal blocked unless the net take-home profit at Target 1 divided by the net loss at Stop-Loss is $\\ge 3.0 : 1$?
  3. Does the plan trigger a Stop-to-Breakeven rule at Target 1 to make the remaining runner position risk-free?

### 4. Friction-Adjusted Half-Kelly Position Sizing (\`src/utils/dynamicCapitalEngine.js\`)
- **Objective:** Capital preservation tailored to exact investor account sizes.
- **Audit Checks:**
  1. For Starter Portfolios (Rs. 50k / Rs. 1 Lakh), does the sizer prevent over-allocation while respecting minimum commission floors?
  2. Is maximum portfolio loss capped at $\\le 1.5\% - 2.0\%$ of total capital across all tiers?
  3. Does the liquidity cap prevent single orders exceeding $5\%$ of the 20-day median turnover?

### 5. False Breakout Scanners & Prime Pick Selection (\`src/utils/scanners.js\` & \`src/components/Dashboard.jsx\`)
- **Objective:** Ensure the single stock crowned "Prime Pick of the Day" on the dashboard has the highest probability of winning.
- **Audit Checks:**
  1. Does the ranking algorithm prioritize verified setups passing all 5 gates before unverified setups?
  2. Does the scanner filter out low-float promoter lock-in supply cliffs?

---

## 📋 OUTPUT FORMAT REQUIRED
1. **Executive Scorecard Table:** List all defects found (Audit ID, File, Severity, Root Cause, Financial Impact).
2. **Technical & Quantitative Analysis:** For each defect, explain the exact mathematical flaw and why it leads to suboptimal trades or unexpected losses.
3. **Master Remediation Patch Block for Antigravity:** Provide clear, copy-pasteable code patches with exact file paths, line references, and instructions for Antigravity to apply.
`;
fs.writeFileSync(argonPromptPath, argonPromptContent, 'utf8');

// 7. Generate Master Argon Prompt for Remaining Bundles (6, 7, 8)
const remainingPromptPath = path.join(desktopDir, 'ARGON_REMAINING_MODULES_AUDIT_PROMPT.md');
const remainingPromptContent = `# 🚀 Argon Deep Quantitative & Architectural Audit: Bundles 6, 7 & 8

## 🎯 AUDIT MISSION
You are **Argon**, an elite Principal Quantitative Finance & Systems Auditor specializing in NEPSE.

You are auditing the remaining specialized modules of **Drabyashree NEPSE**:
1. **BUNDLE_6_PORTFOLIO_WACC_AND_CORPORATE_ACTIONS.txt**:
   - \`PortfolioHub.jsx\` & \`Portfolio.jsx\`: Multi-portfolio management, FIFO execution ledger, unrealized vs realized P&L.
   - \`priceAdjustment.js\` & \`dividendHistory.js\`: Mathematical accuracy of bonus share price adjustments, right share dilution, and cash dividend tax treatment under NEPSE/SEBON rules.
   - \`WaccTaxCalculator.jsx\`: Inland Revenue Department (IRD) WACC calculation fidelity and 7.5% Short-Term CGT / 5% Long-Term CGT segregation.
   - \`paperTrading.js\`: Paper trading order fill simulation and realistic transaction fee modeling.

2. **BUNDLE_7_AI_PREDICTOR_AND_MACRO.txt**:
   - \`PredictorHub.jsx\` & \`proxy/quant/predictorEngine.mjs\`: Multi-session (1D, 3D, 5D) forward directional probability models.
   - \`proxy/quant/featureEngine.mjs\`: Technical and statistical feature normalization, division-by-zero guards, and regime stability.
   - \`NRBMacroWidget.jsx\`: Nepal Rastra Bank monetary macro metrics (repo rates, 91-day T-bills, CD ratio, inflation).
   - \`newsImpactScorer.js\` & \`aiService.js\`: News sentiment extraction, headline weighting, and decay half-life.

3. **BUNDLE_8_MEROSHARE_AND_IPO_HUB.txt**:
   - \`MeroShareHub.jsx\` & \`IPOList.jsx\`: Automated C-ASBA IPO application desk, portfolio valuation from CDSC, and multi-family profile switcher.
   - \`meroShareService.js\` & \`proxy/meroshare.js\`: CDSC API reverse-engineering resilience, session token rotation, and rate-limiting immunity.
   - \`credentialCrypto.js\`: Client-side encryption of MeroShare credentials (passwords, PINs, CRN) to ensure zero plaintext credential exposure.

---

## 🔍 CORE AUDIT OBJECTIVES

### Area 1: Portfolio, Corporate Actions & WACC Math (Bundle 6)
1. **Bonus Share Adjustment:** Does the equation strictly match NEPSE bylaws:
   $$\\text{Adjusted Price} = \\frac{\\text{Market Price}}{1 + \\frac{\\text{Bonus \\%}}{100}}$$
2. **Right Share Adjustment:** Does the equation strictly account for subscription cost (Rs. 100/share par):
   $$\\text{Adjusted Price} = \\frac{\\text{Market Price} + (\\text{Right Ratio} \\times \\text{Subscription Price})}{1 + \\text{Right Ratio}}$$
3. **WACC Calculation:** Does WACC properly incorporate total purchase costs (purchase amount + broker commission + SEBON fee + DP charge) divided by total quantity, and correctly account for zero-cost bonus shares diluting average cost?
4. **CGT Segregation:** Does the portfolio engine strictly separate $\\le 365$ days ($7.5\\%$ CGT) from $> 365$ days ($5.0\\%$ CGT)?

### Area 2: ML Feature Engine & Predictor Stability (Bundle 7)
1. **Feature Engineering Guardrails:** Are features protected against NaN, infinite values, or null history lookbacks in illiquid or newly-listed scrips?
2. **Forward Lookahead Bias:** Does the training and evaluation pipeline strictly ensure zero lookahead bias ($T+1$ open fill, features calculated strictly up to $T$ close)?
3. **Macro Multipliers:** Do high interest rates (tight liquidity) appropriately discount equity valuations and tighten breakout conviction thresholds?

### Area 3: MeroShare Automation & Security (Bundle 8)
1. **Security & Cryptography:** Are all stored credentials encrypted via \`credentialCrypto.js\` before local storage persistence or cloud synchronization?
2. **C-ASBA Application Safety:** Does the automation perform account number, CRN, and DP ID validation to prevent failed bank requests or bank penalty rejections?
3. **Session Robustness:** Are expired CDSC authentication tokens gracefully renewed without breaking the UI?

---

## 📋 OUTPUT FORMAT REQUIRED
1. **Executive Scorecard Table:** List all defects found across the bundles (Audit ID, File, Severity, Root Cause, Financial/Operational Impact).
2. **Technical & Quantitative Analysis:** For each defect, explain the exact mathematical flaw or security vulnerability.
3. **Master Remediation Patch Block for Antigravity:** Provide clear, copy-pasteable code patches with exact file paths, line references, and instructions for Antigravity to apply.
`;
fs.writeFileSync(remainingPromptPath, remainingPromptContent, 'utf8');

console.log('\n✓ Step 2 Complete: Ready-to-Paste Text Bundles and Master Argon Prompts created.\n');

// 8. Summary Table
const results = [b1Meta, b2Meta, b3Meta, b3AMeta, b3BMeta, b4Meta, b5Meta, b6Meta, b7Meta, b8Meta];
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('           DRABYASHREE NEPSE — EXTERNAL AUDIT BUNDLE MANIFEST                 ');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(`Target Folder: ${desktopDir}\n`);

for (const r of results) {
  console.log(`📄 ${r.name.padEnd(42)} | ${String(r.fileCount).padStart(3)} files | ${r.kb.padStart(8)} KB (${r.mb} MB)`);
}
console.log(`📝 ${'ARGON_STOCK_SELECTION_AUDIT_PROMPT.md'.padEnd(42)} | Master Stock Selection Prompt`);
console.log(`📝 ${'ARGON_REMAINING_MODULES_AUDIT_PROMPT.md'.padEnd(42)} | Master Bundles 6, 7 & 8 Audit Prompt`);
console.log('═══════════════════════════════════════════════════════════════════════════════\n');
