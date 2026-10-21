#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DRABYASHREE NEPSE — GEMINI ARGON MASTER AUDIT BUNDLE GENERATOR
 * ══════════════════════════════════════════════════════════════════════════════
 * Bundles the complete Drabyashree NEPSE codebase into organized, token-budgeted
 * audit packages tailored for Gemini Argon (1M-2M context window).
 * 
 * Target Output:
 *   - Desktop Folder: C:\Users\Hp\Desktop\Drabyashre1
 *   - Local Mirror  : audit_exports/
 * 
 * Covers:
 *   1. Floorsheet data & Broker wiring across all Service Hub tabs & services
 *   2. Algorithmic Signal Track Record (5D join, T+1 execution VWAP, T+2 lock, win rate math)
 *   3. Mathematical calculations for Predictors (ML features, macro regimes, news impact)
 *   4. UI, Theory, Calculation & Data Flow Discrepancies across all tabs & modals
 *   5. Microstructure invariants (Zero-Sum conservation, Wyckoff, BCR3/BCR5, SEBON slabs, CGT)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Target directory on Desktop
const desktopDir = path.join(process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Hp', 'Desktop', 'Drabyashre1');
const rawFilesDir = path.join(desktopDir, 'raw_files');
const exportsDir = path.join(projectRoot, 'audit_exports');

// Colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

// Token Estimator (heuristic: ~3.8 chars per token for code)
function estimateTokens(text) {
  return Math.ceil(text.length / 3.8);
}

// Ensure directories exist
for (const dir of [desktopDir, rawFilesDir, exportsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Exclusion Rules ──
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
  'Drabyashree-NEPSE-debug.apk',
  'Drabyashree-NEPSE-release.apk',
  'Drabyashree-NEPSE.apk',
  'StockYan.apk',
  'body_text.txt',
  'audit_part1_backend.txt',
  'audit_part2_engines.txt',
  'audit_part2b_engines.txt',
  'audit_part3_ui_and_views.txt',
  'audit_part3b_ui.txt',
  'audit_part4_audit_telemetry.txt'
]);

function isExcluded(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const base = path.basename(filePath);

  if (base.startsWith('.env')) return true;
  if (base.endsWith('-lock.json') || base.endsWith('.lock')) return true;

  const ext = path.extname(base).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.apk', '.keystore', '.zip', '.gz', '.db', '.sqlite'].includes(ext)) {
    return true;
  }

  if (EXCLUDE_FILES.has(base)) return true;
  if (base.startsWith('floorsheet-full-')) return true;

  const parts = norm.split('/');
  for (const p of parts) {
    if (EXCLUDE_DIRS.has(p)) return true;
  }
  return false;
}

// ── Directory Scanner ──
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
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size < 2000 * 1024) { // Under 2MB
            items.push({
              fullPath,
              relPath: relPath.replace(/\\/g, '/'),
              size: stat.size
            });
          }
        } catch (_) {}
      }
    }
  }
  return items;
}

// ── Build ASCII Directory Tree ──
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

// ── Bundle Writer Helper ──
function writeBundle(outputPath, files, bundleTitle, description, extraPrefix = '') {
  let content = '';
  content += `╔══════════════════════════════════════════════════════════════════════════════╗\n`;
  content += `║ DRABYASHREE NEPSE — CODEBASE AUDIT PACKAGE FOR GEMINI ARGON                 ║\n`;
  content += `║ Bundle: ${bundleTitle.padEnd(67)} ║\n`;
  content += `║ Output: ${path.basename(outputPath).padEnd(67)} ║\n`;
  content += `║ Generated: ${new Date().toISOString().padEnd(64)} ║\n`;
  content += `║ Files Bundled: ${String(files.length).padEnd(60)} ║\n`;
  content += `╚══════════════════════════════════════════════════════════════════════════════╝\n\n`;
  content += `Description:\n${description}\n\n`;
  content += `═`.repeat(80) + `\n\n`;

  if (extraPrefix) {
    content += extraPrefix + `\n\n` + `═`.repeat(80) + `\n\n`;
  }

  let totalLines = 0;
  for (const file of files) {
    try {
      const rawText = fs.readFileSync(file.fullPath, 'utf8');
      const lines = rawText.split('\n').length;
      totalLines += lines;

      content += `// ============================================================================\n`;
      content += `// FILE: ${file.relPath}\n`;
      content += `// Size: ${(file.size / 1024).toFixed(1)} KB | Lines: ${lines} | Path: ${file.relPath}\n`;
      content += `// ============================================================================\n\n`;
      content += rawText;
      content += `\n\n`;
    } catch (err) {
      content += `// === FILE: ${file.relPath} (ERROR: ${err.message}) ===\n\n`;
    }
  }

  fs.writeFileSync(outputPath, content, 'utf8');
  // Mirror to project audit_exports
  fs.writeFileSync(path.join(exportsDir, path.basename(outputPath)), content, 'utf8');

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
  console.log(`${c.cyan}${c.bold}  DRABYASHREE NEPSE — GEMINI ARGON AUDIT BUNDLE EXPORTER                ${c.reset}`);
  console.log(`${c.cyan}${c.bold}════════════════════════════════════════════════════════════════════════${c.reset}\n`);

  console.log(`Source Project: ${c.bold}${projectRoot}${c.reset}`);
  console.log(`Target Desktop: ${c.bold}${desktopDir}${c.reset}`);
  console.log(`Mirror Exports: ${c.bold}${exportsDir}${c.reset}\n`);

  // Step 1: Scan all files
  console.log(`${c.dim}Scanning active project source files...${c.reset}`);
  const allFiles = scanDirectory(projectRoot);
  console.log(`✓ Scanned ${c.bold}${allFiles.length}${c.reset} active source files.\n`);

  // Step 2: Copy raw source files to Desktop/raw_files
  console.log(`${c.dim}Copying raw files to ${desktopDir}/raw_files/ preserving directory structure...${c.reset}`);
  for (const f of allFiles) {
    const dest = path.join(rawFilesDir, f.relPath);
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(f.fullPath, dest);
  }
  console.log(`✓ Copied ${c.bold}${allFiles.length}${c.reset} raw files to Desktop.\n`);

  // Build File Map for quick lookup
  const fileMap = new Map();
  for (const f of allFiles) {
    fileMap.set(f.relPath, f);
  }

  function resolveList(relPaths) {
    const result = [];
    for (const p of relPaths) {
      const match = fileMap.get(p);
      if (match) {
        result.push(match);
      } else {
        // Fallback search
        for (const [key, val] of fileMap.entries()) {
          if (key.endsWith(p)) {
            result.push(val);
            break;
          }
        }
      }
    }
    return result.sort((a, b) => a.relPath.localeCompare(b.relPath));
  }

  const dirTree = buildDirectoryTree(allFiles);

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE 1: Backend Architecture, Broker Vault, SQLite Schemas & APIs
  // ════════════════════════════════════════════════════════════════════════
  const b1Paths = [
    'package.json',
    'server.js',
    'api/index.mjs',
    'proxy/package.json',
    'proxy/server.js',
    'proxy/server.mjs',
    'proxy/brokerVault.mjs',
    'proxy/nepseClientManager.mjs',
    'proxy/syncRouter.mjs',
    'proxy/db.mjs',
    'proxy/db/ledgerStore.js',
    'proxy/db/signalTrackerStore.js',
    'proxy/routes/floorsheetHubRoutes.mjs',
    'proxy/routes/signalTrackRecordRoutes.mjs',
    'proxy/routes/stockTelemetryRoutes.mjs',
    'proxy/routes/radarRoutes.js',
    'proxy/routes/aiGuruRoutes.mjs',
    'proxy/workers.mjs',
    'proxy/institutionalAlertEngine.mjs',
    'proxy/smartAlertEngine.mjs',
    'proxy/telegramNotifier.mjs',
    'proxy/discordNotifier.mjs',
    'proxy/keepalive.mjs',
    'proxy/verify_accurate_data.mjs',
    'proxy/quant/macroCache.mjs',
    'proxy/quant/newsCache.mjs',
    'migrations/003_upgrade_floorsheet_hub.sql',
    'migrations/004_upgrade_fundamentals_and_lockin.sql',
    'proxy/migrations/001_prediction_engine.sql',
    'render.yaml',
    'vercel.json',
    'white-label.mjs'
  ];
  const b1Files = resolveList(b1Paths);

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE 2: Quantitative Calculations, Microstructure & Statutory Math
  // ════════════════════════════════════════════════════════════════════════
  const b2Paths = [
    'src/utils/microstructureEngine.js',
    'proxy/utils/microstructureEngine.js',
    'src/utils/accumulationDistributionEngine.ts',
    'src/utils/breakoutTrapEngine.ts',
    'src/utils/masterProfitEngine.ts',
    'src/utils/setupAnalyzer.js',
    'src/utils/analyzerValidation.js',
    'src/utils/scanners.js',
    'src/utils/priceActionEngine.js',
    'src/utils/stockSignals.js',
    'src/utils/stockMetrics.js',
    'src/utils/liveSectorMedians.js',
    'src/utils/quantEngine.js',
    'src/utils/indicators.js',
    'src/utils/technicalAnalysisEngine.js',
    'src/utils/candlestickPatterns.js',
    'src/utils/calculations.js',
    'src/utils/dynamicCalculationEngine.js',
    'src/utils/dynamicCapitalEngine.js',
    'src/utils/riskManagement.js',
    'src/utils/priceAdjustment.js',
    'src/utils/backtest.js',
    'src/services/fundamentals/nepseRegulatoryEngine.ts',
    'src/utils/fundamentals.js',
    'src/utils/guruEngine.js',
    'src/utils/dividendHistory.js',
    'src/utils/earningsCalendar.js',
    'src/utils/bookClosureTracker.js',
    'src/utils/nepseCalendar.js',
    'src/utils/nepaliDate.js',
    'src/utils/bikramSambat.js',
    'src/utils/masterAlphaPipeline.js'
  ];
  const b2Files = resolveList(b2Paths);

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE 3A: Service Hub Services & Floorsheet Data Wiring
  // ════════════════════════════════════════════════════════════════════════
  const b3aPaths = [
    'src/components/ServicesHub.tsx',
    'src/components/services.tsx',
    'src/components/FloorsheetServiceTab.tsx',
    'src/services/floorsheet/floorsheetHubEngine.ts',
    'src/components/BrokerFlowDominanceService.tsx',
    'src/components/BrokerSmartFlowTracker.tsx',
    'src/components/AccumulationDistributionRadar.tsx',
    'src/components/Master100ProfitWorkstation.tsx',
    'src/components/BreakoutTrapRadar.tsx',
    'src/components/ShareHubScannersSuite.tsx',
    'src/components/MultibaggerHunterService.tsx',
    'src/components/MinerviniLeaderboard.tsx',
    'src/components/StrategyLabService.tsx',
    'src/components/PromoterSharesService.tsx',
    'src/components/RegulatoryHub.tsx',
    'src/components/PreferencesSettingsService.tsx',
    'src/components/GlossaryGuideService.tsx',
    'src/components/AlphaPlaybookService.tsx',
    'src/components/ProGate.tsx',
    'src/views/FloorSheetTape.jsx'
  ];
  const b3aFiles = resolveList(b3aPaths);

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE 3B: Algorithmic Signal Track Record, Dashboard & Stock Modals
  // ════════════════════════════════════════════════════════════════════════
  const b3bPaths = [
    'src/components/AlgorithmicSignalTrackRecord.tsx',
    'src/components/analyzer/SignalTrackRecord.jsx',
    'src/services/signalTracker.js',
    'src/services/signalTrackRecord/rebuildSignalTrackRecord.ts',
    'src/components/Dashboard.jsx',
    'src/components/StockDetailModal.jsx',
    'src/components/StockInformationHubModal.tsx',
    'src/components/StockFundamentalsAndLockInTab.tsx',
    'src/hooks/useUnifiedStockTelemetry.ts',
    'src/components/StockBrokerAnalysisTab.jsx',
    'src/components/StockReportsAnnouncementsCard.jsx',
    'src/components/SeasonalityAnalyticsService.tsx',
    'src/components/DividendHistoryPanel.tsx',
    'src/components/TradingViewChartService.tsx',
    'src/components/AdvancedChartModal.jsx',
    'src/components/ShareHubChart.jsx',
    'src/App.jsx',
    'src/utils/liveData.js',
    'src/utils/servicesApi.js',
    'src/utils/cacheManager.js',
    'src/utils/historyCache.js',
    'src/utils/indexedDb.js',
    'src/context/NavigationContext.tsx',
    'src/context/ThemeContext.tsx'
  ];
  const b3bFiles = resolveList(b3bPaths);

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE 4: Predictors, AI Analyst, ML Feature Engine & Macro Liquidity
  // ════════════════════════════════════════════════════════════════════════
  const b4Paths = [
    'src/components/PredictorHub.jsx',
    'proxy/quant/predictorEngine.mjs',
    'proxy/quant/featureEngine.mjs',
    'src/components/NRBMacroWidget.jsx',
    'src/components/AiAnalyst.jsx',
    'src/services/aiService.js',
    'src/components/AiGuruQuantitativeCard.tsx',
    'src/services/aiGuru/runAiQuantitativeAssessment.ts',
    'src/components/NepseAgentDashboard.jsx',
    'src/services/nepseAgentTools.js',
    'src/utils/newsImpactScorer.js',
    'src/services/merolaganiNewsService.js'
  ];
  const b4Files = resolveList(b4Paths);

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE 5: Calculators, Portfolio Hub, MeroShare & Corporate Actions
  // ════════════════════════════════════════════════════════════════════════
  const b5Paths = [
    'src/components/calculators.tsx',
    'src/components/Calculator.jsx',
    'src/views/WaccTaxCalculator.jsx',
    'src/components/FibonacciCalculatorService.tsx',
    'src/components/CapitalRiskSimulatorBar.jsx',
    'src/components/CapitalRiskSimulatorView.jsx',
    'src/components/ShortTermProfitPlan.jsx',
    'src/components/EntryExitAnalyzer.tsx',
    'src/components/analyzer/EntryRiskCard.tsx',
    'src/components/analyzer/HistoricalAnalogPanel.tsx',
    'src/components/PortfolioHub.jsx',
    'src/components/Portfolio.jsx',
    'src/components/PortfolioBrokerShield.tsx',
    'src/components/MeroShareHub.jsx',
    'src/components/IPOList.jsx',
    'src/services/meroShareService.js',
    'proxy/meroshare.js',
    'proxy/scrapeIpo.js',
    'proxy/scrapeNames.js',
    'proxy/ipoHelper.js',
    'src/utils/credentialCrypto.js',
    'src/components/DividendHistoryPanel.tsx',
    'src/components/SeasonalityAnalyticsService.tsx',
    'src/utils/paperTrading.js',
    'src/utils/watchlist.js',
    'src/utils/watchlistAlerts.js'
  ];
  const b5Files = resolveList(b5Paths);

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE 6: Charts, Diagnostics, Test Suites & Telemetry
  // ════════════════════════════════════════════════════════════════════════
  const b6Paths = [
    'src/components/TradingViewChartService.tsx',
    'src/components/AdvancedChartModal.jsx',
    'src/components/ShareHubChart.jsx',
    'src/components/charts/StockCandlestickChart.tsx',
    'src/components/TestSuite.jsx',
    'scripts/fullAppAudit.mjs',
    'scripts/verifyRegulatoryEngine.ts',
    'scripts/verifySignalTrackRecord5D.ts',
    'src/utils/verifySignalTrackRecord.ts',
    'tests/runAll.mjs',
    'tests/comparativeVerification.test.mjs',
    'tests/auditCrossModuleConsistency.test.mjs',
    'tests/bBatchIndicators.test.mjs',
    'tests/cBatchPriceAdjustment.test.mjs',
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
    'tests/testTelegramExitAndTracking.mjs',
    'vite.config.mjs',
    'electron-builder.json',
    'capacitor.config.json',
    'tailwind.config.js'
  ];
  const b6Files = resolveList(b6Paths);

  // ════════════════════════════════════════════════════════════════════════
  // Generate Bundle Text Files
  // ════════════════════════════════════════════════════════════════════════
  console.log(`${c.dim}Generating Audit Bundles for Gemini Argon...${c.reset}`);

  const s1 = writeBundle(
    path.join(desktopDir, 'BUNDLE_1_BACKEND_AND_BROKER_VAULT.txt'),
    b1Files,
    'Part 1: Backend Architecture, Broker Vault, SQLite Schemas & Scrapers',
    'Covers Express proxy server (server.mjs), BrokerVault engine (brokerVault.mjs), SQLite tick contracts & 5D profile schemas (ledgerStore.js, migrations), live floorsheet hub routes (floorsheetHubRoutes.mjs), signal track record routes (signalTrackRecordRoutes.mjs), unified stock telemetry routes (stockTelemetryRoutes.mjs), alert engines, and scrapers.',
    `// ==================== REPOSITORY DIRECTORY TREE ====================\n/*\n${dirTree}\n*/`
  );

  const s2 = writeBundle(
    path.join(desktopDir, 'BUNDLE_2_QUANT_THEORY_AND_CALCULATIONS.txt'),
    b2Files,
    'Part 2: Quantitative Microstructure, Quality Gates, Indicator Formulas & Statutory Math',
    'Covers Wyckoff Accumulation/Distribution engine, Breakout Trap validator, Master 100% Profit 6-Gate model, Setup Analyzer scoring, technical indicators (Wilder RSI, EMA, MACD, Bollinger, VWAP), Nepal SEBON commission tiers, retail CGT tax engine, NRB regulatory compliance, and backtesting.'
  );

  const s3a = writeBundle(
    path.join(desktopDir, 'BUNDLE_3A_FLOORSHEET_WIRING_AND_SERVICE_HUB.txt'),
    b3aFiles,
    'Part 3A: Floorsheet Data Wiring Across Service Hub Tabs & Services',
    'Covers complete ServicesHub router (ServicesHub.tsx), all 90+ Service Hub tools (services.tsx), dedicated Market Floorsheet Hub (FloorsheetServiceTab.tsx), client-side floorsheet engine (floorsheetHubEngine.ts), Broker Flow & Dominance, Accumulation Radar, Master 100 Workstation, Breakout Trap Radar, and Scanners Suite.'
  );

  const s3b = writeBundle(
    path.join(desktopDir, 'BUNDLE_3B_SIGNAL_TRACK_RECORD_AND_UI_TABS.txt'),
    b3bFiles,
    'Part 3B: Algorithmic Signal Track Record, Dashboard & Stock Modals Data Flow',
    'Covers complete 1,476-line Algorithmic Signal Track Record modal (AlgorithmicSignalTrackRecord.tsx), signal tracker service (signalTracker.js), Dashboard (Dashboard.jsx), Stock Detail Modal (StockDetailModal.jsx), Unified Stock Information Hub Modal (StockInformationHubModal.tsx), Stock Fundamentals & Lock-in Tab, and liveData hydration layer.'
  );

  const s4 = writeBundle(
    path.join(desktopDir, 'BUNDLE_4_PREDICTORS_AND_AI_MACRO_MATH.txt'),
    b4Files,
    'Part 4: Machine Learning Predictor, Quantitative Feature Engine & NRB Macro Regimes',
    'Covers Predictor Hub (PredictorHub.jsx), autoregressive price projection (predictorEngine.mjs), ML feature store (featureEngine.mjs), NRB macro liquidity engine (NRBMacroWidget.jsx), AI Analyst (AiAnalyst.jsx, aiService.js), AI Guru Quantitative Card (AiGuruQuantitativeCard.tsx, runAiQuantitativeAssessment.ts), and news impact scoring.'
  );

  const s5 = writeBundle(
    path.join(desktopDir, 'BUNDLE_5_CALCULATORS_PORTFOLIO_AND_CORPORATE_ACTIONS.txt'),
    b5Files,
    'Part 5: Statutory Calculators, Portfolio WACC, Risk Simulators & MeroShare IPO Hub',
    'Covers SEBON commission and WACC tax calculators (calculators.tsx, WaccTaxCalculator.jsx), Fibonacci calculator, Capital Risk Simulator, Short-Term Profit Plan, Entry/Exit Analyzer, Portfolio Hub (PortfolioHub.jsx, Portfolio.jsx), MeroShare automation (MeroShareHub.jsx, meroShareService.js, meroshare.js), and corporate actions panels.'
  );

  const s6 = writeBundle(
    path.join(desktopDir, 'BUNDLE_6_CHARTS_TEST_SUITES_AND_TELEMETRY.txt'),
    b6Files,
    'Part 6: TradingView Charting Engine, Diagnostics, All 18 Test Suites & Build Manifests',
    'Covers TradingView Lightweight-Charts integration (TradingViewChartService.tsx, AdvancedChartModal.jsx), E2E test suite (TestSuite.jsx), verification scripts (fullAppAudit.mjs, verifyRegulatoryEngine.ts, verifySignalTrackRecord5D.ts), all 18 automated unit test suites, and build configs (vite, electron, capacitor).'
  );

  // ════════════════════════════════════════════════════════════════════════
  // BUNDLE MASTER: Combined Core App for High-Context Gemini Argon
  // ════════════════════════════════════════════════════════════════════════
  const masterCoreFiles = [
    ...b1Files,
    ...b2Files,
    ...b3aFiles,
    ...b3bFiles,
    ...b4Files,
    ...b5Files,
    ...b6Files
  ];
  // Deduplicate
  const uniqueMasterFiles = [];
  const seenPaths = new Set();
  for (const f of masterCoreFiles) {
    if (!seenPaths.has(f.relPath)) {
      seenPaths.add(f.relPath);
      uniqueMasterFiles.push(f);
    }
  }

  const sMaster = writeBundle(
    path.join(desktopDir, 'BUNDLE_MASTER_CORE_APP_LOGIC.txt'),
    uniqueMasterFiles,
    'Master Core: Backend + Quant + Service Hub Floorsheet + Signal Track Record + Predictors',
    'Consolidated master package containing all backend routes, quant calculation engines, Service Hub floorsheet integrations, Algorithmic Signal Track Record, Dashboard, and AI Predictors for a comprehensive single or dual-pass audit in Gemini Argon.'
  );

  // ════════════════════════════════════════════════════════════════════════
  // MASTER PROMPT FOR GEMINI ARGON
  // ════════════════════════════════════════════════════════════════════════
  const masterPrompt = `# 🏛️ GEMINI ARGON MASTER AUDIT PROMPT: DRABYASHREE NEPSE WORKSTATION
═══════════════════════════════════════════════════════════════════════════════
**Role:** Principal Quantitative Systems Engineer, Financial Market Software Security Auditor & Senior Full-Stack Lead.  
**Target Application:** **Drabyashree NEPSE** (Institutional Equity Workstation, Algorithmic Screener, Cross-Platform Desktop/Mobile App).  
**Execution Context:** Production backend deployed on Render (\`https://nepseapp.onrender.com\`), consuming live NEPSE NOTS exchange data, 32+ historical trading session floorsheet vaults, SQLite persistence, and Vite/React/Capacitor/Electron client.  
**Target Bundles Directory:** \`Desktop/Drabyashre1/\`  
═══════════════════════════════════════════════════════════════════════════════

## 🎯 AUDIT MISSION & SCOPE

Conduct an exhaustive, line-by-line, mathematical, architectural, and data-flow audit of the provided codebase bundles to identify, verify, and resolve all bugs, edge cases, formula errors, and tab discrepancies across the entire application.

Pay special and rigorous attention to:
1. **Wiring of all broker floorsheet data** to the services and tabs of the Service Hub.
2. **Algorithmic Signal Track Record** (5-day floorsheet join, dynamic conviction status, T+1 execution VWAP, T+2 settlement lock, NEPSE benchmark return & alpha separation, win rate mathematical calculation).
3. **Mathematical calculations for Predictors** (autoregressive price projections, ML feature store, NRB macro liquidity regime, news impact scoring) and their wiring to Service Hub tabs.
4. **UI, Theory, Calculation & Data Flow Discrepancies** between different tabs (Dashboard vs ServicesHub vs StockDetailModal vs StockInformationHubModal vs PredictorHub vs PortfolioHub).

---

## 🔍 CORE AUDIT DIMENSIONS

### Dimension 1: Floorsheet Data Wiring & Service Hub Tabs Integration
Audit Bundle: \`BUNDLE_1_BACKEND_AND_BROKER_VAULT.txt\` & \`BUNDLE_3A_FLOORSHEET_WIRING_AND_SERVICE_HUB.txt\`

1. **Broker Floorsheet Ingestion & Storage:**
   - Verify tick-by-tick floorsheet ingestion into \`floorsheet_contracts\` in SQLite (\`proxy/db/ledgerStore.js\`).
   - Check the tick-test direction algorithm (inferring BUY aggressor vs SELL aggressor vs INTERNAL_CROSS).
   - Check the 5-Day Volume Profile view (\`v_scrip_volume_profile_5d\`) and Point of Control (POC) calculation.
   - Check synthetic Level-2 Market Depth reconstruction from floorsheet Volume-at-Price (VAP) liquidity clusters during off-market hours.

2. **Wiring to Service Hub Tabs & Services (\`src/components/ServicesHub.tsx\` & \`src/components/services.tsx\`):**
   - **Floorsheet Hub Tab (\`FloorsheetServiceTab.tsx\`):** Verify that \`/api/floorsheet/hub\` properly hydrates the market-wide tape, whale prints (>= Rs. 100k or >= 200 kitta), top buyer/seller broker rankings, and filters.
   - **Broker Analysis Service (\`BrokerAnalysisService\`):** Verify that single-stock 30-day netting calculates Top Net Accumulators and Top Net Sellers without double-counting wash trades.
   - **Broker Heatmap Service (\`BrokerHeatmapService\`):** Verify that the 2D matrix ($91 \\text{ Brokers} \\times 35 \\text{ Scrips}$) sums net cash flow accurately: $\\text{NetFlow}_{b,s} = \\sum_{t=1}^{30} (\\text{BuyAmt} - \\text{SellAmt})$.
   - **Accumulation/Distribution Radar (\`AccumulationDistributionRadar.tsx\`):** Verify 30-Day Institutional VWAP ($VWAP_{30} = \\frac{\\sum \\text{Turnover}_{30}}{\\sum \\text{Volume}_{30}}$), $BCR5_{\\text{Net}}$, $SCR3_{\\text{Net}}$, and Wyckoff Phase transitions.
   - **Master 100% Profit Workstation (\`Master100ProfitWorkstation.tsx\`):** Verify that Gate 5 properly enforces $BCR3 \\ge 40.0\\%$ and the Anti-Distribution Trap Veto rejects stocks where top brokers net dump into rising prices.
   - **Breakout Trap Radar (\`BreakoutTrapRadar.tsx\`):** Verify exit liquidity trap detection (if top 3 sellers over 30 days account for $\\ge 38\\%$ of volume).
   - **Broker Flow & Dominance (\`BrokerFlowDominanceService.tsx\`):** Verify the Cornering Index: $\\text{Cornering} = \\frac{\\sum \\text{Top5NetBuyVol}}{\\text{FreeFloat}} \\times 100$.
   - **Entry/Exit Analyzer & Prime Pick (\`EntryExitAnalyzer.tsx\`):** Verify that post-market scans veto stocks with $brokerAdSignal === 'Distribution'$ or $isInstitutionalDumping === true$.

---

### Dimension 2: Algorithmic Signal Track Record & Verification Engine
Audit Bundle: \`BUNDLE_1_BACKEND_AND_BROKER_VAULT.txt\` & \`BUNDLE_3B_SIGNAL_TRACK_RECORD_AND_UI_TABS.txt\`

1. **5-Day Floorsheet Join & Dynamic Conviction:**
   - Inspect \`proxy/routes/signalTrackRecordRoutes.mjs\` and \`src/services/signalTrackRecord/rebuildSignalTrackRecord.ts\`.
   - Verify how the signal ledger joins with the last 5 trading sessions from \`floorsheet_broker_summary\`.
   - Verify the 4-tier Conviction Status:
     - \`STRONG_ACCUMULATION\`: Top 3 buyers net absorption $> 35\\%$, retail giant selling $> 50\\%$.
     - \`STEADY_SUPPORT\`: Positive institutional retention, price above 5D VWAP.
     - \`BROKER_DISTRIBUTION_WARNING\`: Top accumulator dumping $> 25\\%$ or net sellers $> 40\\%$.
     - \`NEUTRAL_FLOW\`: Balanced retail churn.

2. **Execution Reality & Invariant Guarantees:**
   - **Day T+1 Execution Fill:** Verify that settled signals evaluate returns from the actual Day T+1 VWAP (or typical price $(H+L+C)/3$), NOT the signal bar's close price.
   - **T+2 Settlement Lock:** Verify that open trades with $\\text{holding\\_days} < 2$ cannot be marked as \`CLOSED_WIN\` or \`CLOSED_LOSS\`, strictly respecting NEPSE clearing laws.
   - **NEPSE Benchmark Alpha Separation:** Verify that $\\text{Alpha} = \\text{Net Return} - \\text{NEPSE Index Return}$. Verify that alpha is NOT artificially set equal to net return.
   - **Statutory SEBON & CGT Net Return:** Verify that gross return is deducted by buy commission, sell commission, SEBON regulatory fee (0.015%), DP fee (Rs. 25), and retail individual CGT (7.5%).
   - **Strategy Scorecard & Dashboard Badge Reconciliation:** Verify that the strategy win rate shown on Dashboard (\`Dashboard.jsx\`), the badge on the header, and the scorecards inside \`AlgorithmicSignalTrackRecord.tsx\` all compute consistent weighted averages.

---

### Dimension 3: Predictors, Machine Learning Feature Engine & Macro Liquidity
Audit Bundle: \`BUNDLE_4_PREDICTORS_AND_AI_MACRO_MATH.txt\`

1. **Predictor Hub & Autoregressive Model (\`proxy/quant/predictorEngine.mjs\` & \`src/components/PredictorHub.jsx\`):**
   - Verify that projected returns respect Nepal Securities Trading Fourth Amendment 2082 daily circuit limits strictly: $[-15.0\\%, +15.0\\%]$.
   - Check feature calculations in \`proxy/quant/featureEngine.mjs\` (RVOL, Hurst exponent, fractal dimension, volatility z-score, institutional net flow).
   - Verify that division-by-zero is strictly guarded when standard deviation is zero.

2. **NRB Macro Liquidity Regime (\`src/components/NRBMacroWidget.jsx\` & \`proxy/quant/macroCache.mjs\`):**
   - Check the monetary regime classification:
     - \`EASING\`: Interbank rate $< 3.0\\%$, CD ratio $< 80.0\\%$.
     - \`TIGHTENING\`: Interbank rate $> 6.5\\%$, CD ratio $> 88.0\\%$.
     - \`NEUTRAL\`: Normal operating bandwidth.
   - Verify that during network downtime or scraper fallback, \`NRBMacroWidget\` displays the verified baseline rather than flashing "NRB Offline".

3. **AI Analyst & News Scorer (\`src/services/aiService.js\`, \`src/utils/newsImpactScorer.js\`, \`src/components/AiGuruQuantitativeCard.tsx\`):**
   - Verify that AI sentiment scores are bounded in $[-1.0, +1.0]$.
   - Check that AI Guru quantitative assessment correctly ingests 5-day broker retention, ATR volatility stop, and fundamental score.

---

### Dimension 4: UI, Theory, Calculation & Tab Data Flow Discrepancies
Audit Bundle: \`BUNDLE_2_QUANT_THEORY_AND_CALCULATIONS.txt\` & \`BUNDLE_3B_SIGNAL_TRACK_RECORD_AND_UI_TABS.txt\`

1. **Dashboard vs StockDetailModal vs StockInformationHubModal:**
   - Verify that when a user clicks a stock ticker in Dashboard, ServicesHub, or Signal Track Record, the data passed into \`StockDetailModal\` and \`StockInformationHubModal\` matches identically:
     - LTP, Change %, High, Low, Volume, Turnover.
     - Technical indicators (RSI, MACD, EMA 20/50/200, Bollinger Bands).
     - Broker flow metrics (BCR3, BCR5, Top Accumulator Broker ID).
   - Check for discrepancies between client-calculated values in \`liveData.js\` vs server-calculated values in \`proxy/server.mjs\`.

2. **Beginner Confidence & Rupee Profit Simulator (\`StockDetailModal.jsx\`):**
   - Verify the formula for simulated profit:
     $$\\text{Net Profit (NPR)} = (\\text{Target Price} \\times \\text{Kitta}) - \\text{Total Cost} - \\text{Sell Fees} - \\text{CGT}$$
   - Confirm that statutory fees (commission tiers, SEBON 0.015%, DP flat Rs. 25, CGT 7.5%) are deducted on both buy and sell legs.

3. **Calculators & Portfolio WACC (\`BUNDLE_5_CALCULATORS_PORTFOLIO_AND_CORPORATE_ACTIONS.txt\`):**
   - Verify SEBON Commission Tiers:
     - Tier 1: $\\le \\text{Rs. } 50,000 \\implies 0.36\\%$
     - Tier 2: $\\text{Rs. } 50,000 - 500,000 \\implies 0.33\\%$
     - Tier 3: $\\text{Rs. } 500,000 - 2,000,000 \\implies 0.31\\%$
     - Tier 4: $> \\text{Rs. } 2,000,000 \\implies 0.27\\%$
   - Verify Bonus share price adjustment: $P_{\\text{adj}} = \\frac{P_{\\text{close}}}{1 + \\frac{\\text{Bonus}\\%}{100}}$.
   - Verify Right share price adjustment: $P_{\\text{adj}} = \\frac{P_{\\text{close}} + (\\text{Right Ratio} \\times 100)}{1 + \\text{Right Ratio}}$.

---

### Dimension 5: Concurrency, Memory & Native Runtime Integrity
Audit Bundle: \`BUNDLE_1_BACKEND_AND_BROKER_VAULT.txt\` & \`BUNDLE_6_CHARTS_TEST_SUITES_AND_TELEMETRY.txt\`

1. **Render 512MB RAM Container Stability:**
   - Inspect asynchronous loops in \`brokerVault.mjs\`, \`server.mjs\`, and \`workers.mjs\`.
   - Verify concurrency limits (\`CONCURRENCY <= 4\`), streaming buffers, and memory garbage collection.
2. **Sub-2.8s Fast Vault Snapshot Response:**
   - Verify \`Promise.race\` timeout returning fast on-disk cache snapshots within 2.8s while background workers update disk vaults.
3. **Cross-Platform Android APK & Electron PC Packaging:**
   - Verify Capacitor plugins, safe-area insets, back-button hardware handlers (\`NavigationContext.tsx\`).
   - Verify Electron main process IPC bridge (\`electron/main.cjs\`).

---

## 📋 DESIRED DELIVERABLES IN YOUR AUDIT REPORT

Structure your findings in the following format:
1. **Executive Audit Scorecard:** Overall codebase integrity rating (0-100), production-readiness verdict.
2. **Critical Bugs & Discrepancies Matrix:** A categorized table listing every identified bug, its location (file and line number), severity, and impact.
3. **Data Flow & Wiring Verification Report:** Detailed verification of how floorsheet contracts flow from the exchange tape through SQLite into the Service Hub tabs and Signal Track Record.
4. **Mathematical Formulation Proofs:** Comparative audit of all formulas against standard financial theory and Nepal regulatory statutes.
5. **Exact Drop-In Code Patches:** Complete, copy-pasteable replacement code blocks for every bug identified.
`;

  fs.writeFileSync(path.join(desktopDir, 'GEMINI_ARGON_WHOLE_APP_AUDIT_MASTER_PROMPT.md'), masterPrompt, 'utf8');
  fs.writeFileSync(path.join(exportsDir, 'GEMINI_ARGON_WHOLE_APP_AUDIT_MASTER_PROMPT.md'), masterPrompt, 'utf8');

  // ════════════════════════════════════════════════════════════════════════
  // Print Summary Table
  // ════════════════════════════════════════════════════════════════════════
  const summaries = [s1, s2, s3a, s3b, s4, s5, s6, sMaster];

  console.log(`\n${c.bold}Audit Packages Successfully Exported to Desktop (${desktopDir}):${c.reset}\n`);
  console.log(`┌───────────────────────────────────────────────────┬────────────┬─────────────┬──────────────┬────────────────┐`);
  console.log(`│ Package File Name                                 │ Files Inc. │ Total Lines │ File Size    │ Est. Tokens    │`);
  console.log(`├───────────────────────────────────────────────────┼────────────┼─────────────┼──────────────┼────────────────┤`);

  for (const s of summaries) {
    const fn = s.fileName.padEnd(49);
    const fc = String(s.filesCount).padStart(10);
    const lc = String(s.linesCount.toLocaleString()).padStart(11);
    const sz = `${(s.bytes / 1024).toFixed(1)} KB`.padStart(12);
    const tk = `~${s.tokens.toLocaleString()}`.padStart(14);
    console.log(`│ ${fn} │ ${fc} │ ${lc} │ ${sz} │ ${tk} │`);
  }
  console.log(`└───────────────────────────────────────────────────┴────────────┴─────────────┴──────────────┴────────────────┘\n`);

  console.log(`${c.green}✓ Master Audit Prompt:${c.reset} ${c.bold}${path.join(desktopDir, 'GEMINI_ARGON_WHOLE_APP_AUDIT_MASTER_PROMPT.md')}${c.reset}`);
  console.log(`${c.green}✓ Raw Source Files Directory:${c.reset} ${c.bold}${rawFilesDir}${c.reset}`);
  console.log(`${c.green}✓ Mirror Directory:${c.reset} ${c.bold}${exportsDir}${c.reset}\n`);

  console.log(`${c.yellow}${c.bold}Recommended Gemini Argon Upload Strategy:${c.reset}`);
  console.log(`  • ${c.bold}Audit 1 (Backend & Microstructure):${c.reset} Upload ${c.cyan}BUNDLE_1${c.reset} + ${c.cyan}BUNDLE_2${c.reset} (~650k tokens)`);
  console.log(`  • ${c.bold}Audit 2 (Service Hub & Floorsheet Wiring):${c.reset} Upload ${c.cyan}BUNDLE_3A${c.reset} + ${c.cyan}BUNDLE_3B${c.reset} (~850k tokens)`);
  console.log(`  • ${c.bold}Audit 3 (Predictors, ML & Macro Math):${c.reset} Upload ${c.cyan}BUNDLE_4${c.reset} + ${c.cyan}BUNDLE_5${c.reset} (~450k tokens)`);
  console.log(`  • ${c.bold}Audit 4 (Single Comprehensive Core Pass):${c.reset} Upload ${c.cyan}BUNDLE_MASTER_CORE_APP_LOGIC.txt${c.reset} (~1.2M tokens)\n`);
}

main().catch(err => {
  console.error('Audit bundle preparation failed:', err);
  process.exit(1);
});
