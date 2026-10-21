#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DRABYASHREE NEPSE — 3-ACCOUNT SERIAL ARGON AUDIT BUNDLE GENERATOR (V2 EXPANDED)
 * ══════════════════════════════════════════════════════════════════════════════
 * Systematically divides the entire production codebase into 3 self-contained,
 * serial audit packages for Gemini Argon accounts.
 *
 * Each account folder contains:
 *   1. Full text bundles (with Part A / Part B slicing for Account 3 to avoid token truncation)
 *   2. Comprehensive audit prompts detailing all profit-maximization and loss-minimization
 *      invariants, quantitative formulas, and the 5-step institutional stock selection roadmap.
 *
 * Target Output:
 *   C:\Users\Hp\Desktop\Drabyashre1\
 *     ├── ACCOUNT_1_BACKEND_AND_QUANT\
 *     ├── ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO\
 *     ├── ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS\
 *     └── MASTER_3_ACCOUNT_SERIAL_AUDIT_WORKFLOW.md
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const desktopDir = path.join(process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Hp', 'Desktop', 'Drabyashre1');
const acc1Dir = path.join(desktopDir, 'ACCOUNT_1_BACKEND_AND_QUANT');
const acc2Dir = path.join(desktopDir, 'ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO');
const acc3Dir = path.join(desktopDir, 'ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS');
const exportsDir = path.join(projectRoot, 'audit_exports');

for (const d of [desktopDir, acc1Dir, acc2Dir, acc3Dir, exportsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function estimateTokens(text) {
  return Math.ceil(text.length / 3.8);
}

// ── Exclusion Rules ──
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'build', 'android',
  'release', '.agents', '.claude', '.github', '.vercel', 'temp_frames_v3',
  'scratch', 'audit_exports', 'data', 'sync_vaults', 'broker_vault'
]);

const EXCLUDE_FILES = new Set([
  'package-lock.json', 'broker_matrix_latest.json', 'release.keystore',
  'google-services.json', 'dump_merolagani.cjs', 'extract.cjs', 'extract.txt',
  'extract_info.cjs', 'find_ltp.cjs', 'find_ltp.txt', 'liveDataFull.txt',
  'nabil_qtr.txt', 'qtr.txt', 'tunnel.txt', 'merolagani_home.html',
  'merolagani_nabil.html', 'indices_merolagani.html', 'sharesansar_market.html',
  'temp-analytica-index.html', 'glbsl.html', 'index.html', 'NEPSE-Analytica-release.apk',
  'Drabyashree-NEPSE-debug.apk', 'Drabyashree-NEPSE-release.apk', 'Drabyashree-NEPSE.apk',
  'StockYan.apk', 'body_text.txt'
]);

function isExcluded(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const base = path.basename(filePath);
  if (base.startsWith('.env') || base.endsWith('-lock.json') || base.endsWith('.lock')) return true;
  const ext = path.extname(base).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.apk', '.keystore', '.zip', '.gz', '.db', '.sqlite'].includes(ext)) return true;
  if (EXCLUDE_FILES.has(base) || base.startsWith('floorsheet-full-')) return true;
  const parts = norm.split('/');
  for (const p of parts) if (EXCLUDE_DIRS.has(p)) return true;
  return false;
}

function scanDirectory(dir, relPrefix = '') {
  const items = [];
  if (!fs.existsSync(dir)) return items;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) items.push(...scanDirectory(fullPath, relPath));
    } else if (entry.isFile()) {
      if (!isExcluded(fullPath)) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size < 2500 * 1024) items.push({ fullPath, relPath: relPath.replace(/\\/g, '/'), size: stat.size });
        } catch (_) {}
      }
    }
  }
  return items;
}

const allFiles = scanDirectory(projectRoot);
const fileMap = new Map();
for (const f of allFiles) fileMap.set(f.relPath, f);

function resolveList(relPaths) {
  const result = [];
  const seen = new Set();
  for (const p of relPaths) {
    let match = fileMap.get(p);
    if (!match) {
      for (const [key, val] of fileMap.entries()) {
        if (key.endsWith(p)) {
          match = val;
          break;
        }
      }
    }
    if (match && !seen.has(match.relPath)) {
      seen.add(match.relPath);
      result.push(match);
    }
  }
  return result.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function writeBundle(outputPath, files, accountTitle, mission) {
  let content = '';
  content += `╔══════════════════════════════════════════════════════════════════════════════╗\n`;
  content += `║ DRABYASHREE NEPSE — SERIAL AUDIT PACKAGE FOR GEMINI ARGON                    ║\n`;
  content += `║ Account Target: ${accountTitle.padEnd(60)} ║\n`;
  content += `║ Output File   : ${path.basename(outputPath).padEnd(60)} ║\n`;
  content += `║ Generated     : ${new Date().toISOString().padEnd(60)} ║\n`;
  content += `║ Total Files   : ${String(files.length).padEnd(60)} ║\n`;
  content += `╚══════════════════════════════════════════════════════════════════════════════╝\n\n`;
  content += `Mission & Context:\n${mission}\n\n`;
  content += `═`.repeat(80) + `\n\n`;

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

// ══════════════════════════════════════════════════════════════════════════════
// 1. ACCOUNT 1: BACKEND, BROKER VAULT & QUANTITATIVE MICROSTRUCTURE
// ══════════════════════════════════════════════════════════════════════════════
const acc1Paths = [
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
  'proxy/routes/radarRoutes.js',
  'proxy/routes/aiGuruRoutes.mjs',
  'proxy/routes/stockTelemetryRoutes.mjs',
  'proxy/routes/floorsheetHubRoutes.mjs',
  'proxy/routes/signalTrackRecordRoutes.mjs',
  'proxy/workers.mjs',
  'proxy/institutionalAlertEngine.mjs',
  'proxy/smartAlertEngine.mjs',
  'proxy/telegramNotifier.mjs',
  'proxy/discordNotifier.mjs',
  'proxy/keepalive.mjs',
  'proxy/agentTools.mjs',
  'proxy/verify_accurate_data.mjs',
  'proxy/quant/macroCache.mjs',
  'proxy/quant/newsCache.mjs',
  'proxy/scrapeIpo.js',
  'proxy/scrapeNames.js',
  'proxy/ipoHelper.js',
  'proxy/meroshare.js',
  'src/lib/db/drabyashreeDb.ts',
  'migrations/003_upgrade_floorsheet_hub.sql',
  'migrations/004_upgrade_fundamentals_and_lockin.sql',
  'proxy/migrations/001_prediction_engine.sql',
  'render.yaml',
  'vercel.json',
  'white-label.mjs',
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
  'src/utils/masterAlphaPipeline.js',
  'src/utils/floorsheetExport.js',
  'src/utils/nepseAdapterLayer.js',
  'src/utils/licenseEngine.js',
  'src/utils/subscription.js'
];
const acc1Files = resolveList(acc1Paths);

// ══════════════════════════════════════════════════════════════════════════════
// 2. ACCOUNT 2: SERVICE HUB 90+ TABS & 13-TAB STOCK INFORMATION SUITE
// ══════════════════════════════════════════════════════════════════════════════
const acc2Paths = [
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
  'src/components/AlphaCommandCenter.tsx',
  'src/components/BookClosureAlert.jsx',
  'src/components/BreakoutAlertDialog.jsx',
  'src/components/DataQualityBanner.jsx',
  'src/components/InstitutionalAlertCardModal.tsx',
  'src/components/InvestorDecisionGuideModal.jsx',
  'src/components/SmartAlertBanner.jsx',
  'src/components/stock/BrokerSmartMoneyCard.tsx',
  'src/views/FloorSheetTape.jsx',
  'src/views/LiveMarketDashboard.jsx',
  'src/views/OrderExecution.jsx',
  'src/views/PortfolioAnalytics.jsx',
  'src/views/StitchHub.jsx',
  'src/views/StockDetails.jsx',
  'src/views/WatchlistScreener.jsx',
  'src/services/whaleDailyArchive.js',
  'src/services/stockSnapshot.js',
  'src/components/StockDetailModal.jsx',
  'src/components/StockInformationHubModal.tsx',
  'src/components/StockFundamentalsAndLockInTab.tsx',
  'src/components/StockFundamentalsTab.jsx',
  'src/hooks/useUnifiedStockTelemetry.ts',
  'src/components/StockBrokerAnalysisTab.jsx',
  'src/components/StockReportsAnnouncementsCard.jsx',
  'src/components/StockRightShareCard.jsx',
  'src/components/StockSeasonalityCard.jsx',
  'src/components/StockSignalsCard.jsx',
  'src/components/StockTechnicalGaugeCard.jsx',
  'src/components/StockYanAnalyticsCard.jsx',
  'src/components/DividendHistoryPanel.tsx',
  'src/components/SeasonalityAnalyticsService.tsx',
  'src/components/TradingViewChartService.tsx',
  'src/components/AdvancedChartModal.jsx',
  'src/components/ShareHubChart.jsx',
  'src/components/charts/StockCandlestickChart.tsx',
  'src/App.jsx',
  'src/components/Dashboard.jsx',
  'src/utils/liveData.js',
  'src/utils/servicesApi.js',
  'src/utils/cacheManager.js',
  'src/utils/historyCache.js',
  'src/utils/indexedDb.js',
  'src/context/NavigationContext.tsx',
  'src/context/ThemeContext.tsx'
];
const acc2Files = resolveList(acc2Paths);

// ══════════════════════════════════════════════════════════════════════════════
// 3. ACCOUNT 3: TRACK RECORD, PREDICTORS, ANALYZER, CALCULATORS & TESTS
// ══════════════════════════════════════════════════════════════════════════════
const acc3PartAPaths = [
  'src/components/AlgorithmicSignalTrackRecord.tsx',
  'src/components/analyzer/SignalTrackRecord.jsx',
  'src/services/signalTracker.js',
  'src/services/signalTrackRecord/rebuildSignalTrackRecord.ts',
  'proxy/db/signalTrackerStore.js',
  'proxy/routes/signalTrackRecordRoutes.mjs',
  'scripts/verifySignalTrackRecord5D.ts',
  'src/utils/verifySignalTrackRecord.ts',
  'src/components/PredictorHub.jsx',
  'proxy/quant/predictorEngine.mjs',
  'proxy/quant/featureEngine.mjs',
  'proxy/quant/macroCache.mjs',
  'proxy/quant/newsCache.mjs',
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

const acc3PartBPaths = [
  'src/components/calculators.tsx',
  'src/components/Calculator.jsx',
  'src/views/WaccTaxCalculator.jsx',
  'src/components/FibonacciCalculatorService.tsx',
  'src/components/CapitalRiskSimulatorBar.jsx',
  'src/components/CapitalRiskSimulatorView.jsx',
  'src/components/ShortTermProfitPlan.jsx',
  'src/components/EntryExitAnalyzer.tsx',
  'src/components/analyzer/OneClickAlphaButton.jsx',
  'src/components/analyzer/GlobalSignalTrackerModal.jsx',
  'src/components/analyzer/GrahamSafetyCard.tsx',
  'src/components/analyzer/FundamentalValuationCard.jsx',
  'src/components/analyzer/FestivalSeasonalityCard.tsx',
  'src/components/analyzer/BrokerFootprintCard.jsx',
  'src/components/analyzer/BreakoutPanel.tsx',
  'src/components/analyzer/SmartMoneyBrokerFlowCard.tsx',
  'src/components/analyzer/StrategyTrackRecord.tsx',
  'src/components/analyzer/SupportResistancePanel.tsx',
  'src/components/analyzer/TechnicalDashboard.tsx',
  'src/components/analyzer/WhatNextPanel.tsx',
  'src/components/analyzer/EvidencePanel.tsx',
  'src/components/analyzer/SignalAgreement.tsx',
  'src/components/analyzer/SetupScoreCard.tsx',
  'src/components/analyzer/DataQualityPanel.tsx',
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
  'src/utils/paperTrading.js',
  'src/utils/watchlist.js',
  'src/utils/watchlistAlerts.js',
  'src/components/TestSuite.jsx',
  'scripts/fullAppAudit.mjs',
  'scripts/verifyRegulatoryEngine.ts',
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

const acc3AllPaths = [...acc3PartAPaths, ...acc3PartBPaths];
const acc3Files = resolveList(acc3AllPaths);
const acc3PartAFiles = resolveList(acc3PartAPaths);
const acc3PartBFiles = resolveList(acc3PartBPaths);

// ── Generate Bundles ──
console.log('Generating Account 1 Bundle...');
const s1 = writeBundle(
  path.join(acc1Dir, 'BUNDLE_ACCOUNT_1_BACKEND_AND_QUANT.txt'),
  acc1Files,
  'Account 1: Backend Architecture, Broker Vault, SQLite Schemas & Quantitative Theory',
  'Self-contained package covering Express proxy server (server.mjs), BrokerVault (brokerVault.mjs), SQLite tick contracts & 5D profile schemas (ledgerStore.js, migrations), live floorsheet routes (floorsheetHubRoutes.mjs), signal track record routes (signalTrackRecordRoutes.mjs), Wyckoff accumulation/distribution engine, Breakout Trap validator, Master 100% Profit 6-Gate model, indicators (Wilder RSI, EMA, MACD, Bollinger), and statutory SEBON commission / CGT tax engines.'
);

console.log('Generating Account 2 Bundle...');
const s2 = writeBundle(
  path.join(acc2Dir, 'BUNDLE_ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO.txt'),
  acc2Files,
  'Account 2: Service Hub 90+ Tabs, Floorsheet Wiring & 13-Tab Stock Information Suite',
  'Self-contained package covering complete ServicesHub router (ServicesHub.tsx), all 90+ Service Hub tools (services.tsx), Market Floorsheet Hub (FloorsheetServiceTab.tsx), client floorsheet engine (floorsheetHubEngine.ts), Broker Flow Dominance, Accumulation Radar, Master 100 Workstation, Breakout Trap Radar, and the entire 13-Tab Stock Information Suite (StockDetailModal.jsx, StockInformationHubModal.tsx, StockFundamentalsAndLockInTab.tsx, Broker Analysis, Dividends, Seasonality, Charts, and liveData hydration).'
);

console.log('Generating Account 3 Full & Sliced Bundles...');
const s3 = writeBundle(
  path.join(acc3Dir, 'BUNDLE_ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS.txt'),
  acc3Files,
  'Account 3: Algorithmic Signal Track Record, Predictors, AI Guru, Calculators & Tests',
  'Self-contained package covering complete 1,476-line Algorithmic Signal Track Record modal (AlgorithmicSignalTrackRecord.tsx), 5D floorsheet join, T+1 execution VWAP, T+2 settlement lock, NEPSE benchmark return & alpha separation, Predictor Hub (PredictorHub.jsx, predictorEngine.mjs with ±15% circuit limits), NRB macro liquidity (NRBMacroWidget.jsx), AI Guru Quantitative Assessment (runAiQuantitativeAssessment.ts), trading calculators (calculators.tsx, WaccTaxCalculator.jsx), Portfolio Hub, and all 18 automated unit test suites in tests/.'
);

const s3A = writeBundle(
  path.join(acc3Dir, 'BUNDLE_ACCOUNT_3_PART_A_TRACK_RECORD_AND_PREDICTORS.txt'),
  acc3PartAFiles,
  'Account 3 (Part A): Signal Track Record, Predictor Hub, ML Feature Store & AI Guru',
  'Core algorithmic engine covering AlgorithmicSignalTrackRecord.tsx, signalTrackerStore.js, signalTrackRecordRoutes.mjs, predictorEngine.mjs, featureEngine.mjs, macroCache.mjs, NRBMacroWidget.jsx, and AiAnalyst.jsx.'
);

const s3B = writeBundle(
  path.join(acc3Dir, 'BUNDLE_ACCOUNT_3_PART_B_CALCULATORS_ANALYZER_AND_TESTS.txt'),
  acc3PartBFiles,
  'Account 3 (Part B): Calculators, Capital Risk Simulator, Analyzer Suite & 18 Test Suites',
  'Execution, sizing, and verification engines covering calculators.tsx, WaccTaxCalculator.jsx, CapitalRiskSimulatorView.jsx, EntryExitAnalyzer.tsx, full analyzer suite, and all 18 test suites in tests/.'
);

// ══════════════════════════════════════════════════════════════════════════════
// 4. GENERATE STANDALONE PROMPTS WITH 5-STEP INVESTMENT ROADMAP DIRECTIVES
// ══════════════════════════════════════════════════════════════════════════════

const commonRoadmapDirective = `
## 🧭 INSTITUTIONAL ROADMAP DIRECTIVE: SELECTING THE BEST STOCK IN 5 STEPS
As Principal Quantitative Auditor, after completing your mathematical code audit, synthesize a **Battle-Tested 5-Step Institutional Workflow** for a user of this application to select the highest-probability winning stock while eliminating downside risk:
1. **Step 1: Macro & Liquidity Filtering (Top-Down)** — How to read the NRB Macro Regime (EASING vs NEUTRAL vs TIGHTENING) and determine permissible capital exposure and required Margin of Safety.
2. **Step 2: Trend & Stage 2 Screener Funnel (Momentum)** — How to scan via Minervini Trend Template & Wyckoff Phase C/D to ensure the stock is in an institutional markup phase.
3. **Step 3: Floorsheet Smart Money Absorption (Microstructure)** — How to use Floorsheet Hub, Top 3 Accumulation Ratios (BCR3/BCR5), and 5-Day POC Price to confirm smart money buying without institutional distribution.
4. **Step 4: Fundamental & Regulatory Veto Gates (Downside Shield)** — How to apply the Promoter Lock-In < 120-Day cliff check, Bank NPL (< 5%) / CAR (>= 11%) checks, and Hydropower seasonal/capex checks to veto potential traps.
5. **Step 5: Execution Sizing & Trade Management (Profit Maximization)** — How to calculate exact Half-Kelly position sizing ($f^*_{\\text{half}}$) capped at 1% portfolio risk, execute between Day T+1 VWAP and POC support, and manage scale-outs with 1.75x ATR stops and $\\pm 15\\%$ circuit-clamped target ladders.
`;

// Account 1 Prompt
const promptAcc1 = `# 🏛️ GEMINI ARGON AUDIT DIRECTIVE — ACCOUNT 1 OF 3
═══════════════════════════════════════════════════════════════════════════════
**Account Mission:** Audit **Part 1 — Backend Architecture, Broker Vault, SQLite Schemas & Quantitative Microstructure Theory**  
**Target Codebase:** Drabyashree NEPSE (\`nepseapp.onrender.com\` / Express Proxy + SQLite Ledger)  
**Input Bundle File:** \`BUNDLE_ACCOUNT_1_BACKEND_AND_QUANT.txt\`  
═══════════════════════════════════════════════════════════════════════════════

## 🎯 YOUR ROLE & STANDALONE CONTEXT
You are **Argon**, Principal Quantitative Systems Engineer and Financial Market Software Security Auditor.
You are running on **Account 1** of a 3-account serial audit pipeline.
Everything you need to audit the backend and quantitative calculation engines is contained directly in \`BUNDLE_ACCOUNT_1_BACKEND_AND_QUANT.txt\`. You do NOT need to wait for or ask about other accounts.

## 🔬 CRITICAL AUDIT OBJECTIVES (PROFIT MAXIMIZATION & LOSS MINIMIZATION)

### 1. Zero-Sum Broker Conservation & Floorsheet Ingestion
Inspect \`proxy/brokerVault.mjs\` and \`proxy/db/ledgerStore.js\`:
- Verify the Zero-Sum Invariant on tick ingestion:
  $$\\sum_{\\text{all brokers}} \\text{BuyQty} \\equiv \\sum_{\\text{all brokers}} \\text{SellQty} \\equiv \\text{Total Traded Volume}$$
- Verify that wash sales (buyer broker == seller broker) are handled transparently without artificially doubling volume.
- Verify the tick-test direction inference (in \`ingestFloorsheetContractsTransaction\`): confirms whether contracts at upticks are tagged \`BUY\`, downticks tagged \`SELL\`, and same-price trades preserve the previous aggressor.
- Verify the 5-Day Volume Profile view (\`v_scrip_volume_profile_5d\`) and Point of Control (POC) price bucket calculation.

### 2. Multi-Day Timeframe Netting & Caching
- Verify that multi-day queries (1D, 5D, 15D, 30D) dynamically aggregate unique historical trading dates from on-disk vault files and never return static repeated rows.
- Verify the \`Promise.race\` ceiling on multi-day broker requests that returns fast on-disk vault snapshots in $\\le 2.8\\text{s}$ while delegating full synchronization to background workers.
- Concurrency limit verification: Ensure \`CONCURRENCY <= 4\` is respected in asynchronous loops to guarantee the Node.js process stays strictly within Render's 512MB RAM ceiling without OOM crashes.

### 3. Quantitative Theory & Indicators Accuracy
Inspect \`src/utils/microstructureEngine.js\`, \`src/utils/masterProfitEngine.ts\`, \`src/utils/breakoutTrapEngine.ts\`, \`src/utils/setupAnalyzer.js\`, and \`src/utils/indicators.js\`:
- **Wilder's RSI(14):** Verify smoothed moving average calculation and check for division-by-zero guards when all candles are gains or losses.
- **Institutional VWAP:** Verify 30-Day VWAP formula: $VWAP_{30} = \\frac{\\sum Turnover_{30}}{\\sum Volume_{30}}$.
- **Concentration Ratios:** Verify Buyer Concentration ($BCR3, BCR5$) and Seller Concentration ($SCR3$).
- **Wyckoff Phase Classifier:** Stealth ($BCR5 \\ge 18\\%, SCR3 < 14\\%$), Active Markup ($BCR5 \\ge 15\\%, \\Delta P > 4.5\\%$), Bull Trap ($SCR3 \\ge 20\\%, \\Delta P > 2.5\\%$).
- **Master 100% Profit Model:** Gate 5 requires $BCR3 \\ge 40.0\\%$; Anti-Distribution Trap Veto rejects stocks if top brokers net sell into retail price gains.

### 4. Statutory Nepal SEBON & CGT Calculation Engine
Inspect \`src/utils/calculations.js\` and \`src/utils/dynamicCalculationEngine.js\`:
- Statutory retail equity commission tiers:
  - $\\le \\text{Rs. } 50,000 \\implies 0.36\\%$
  - $\\text{Rs. } 50,000 - 500,000 \\implies 0.33\\%$
  - $\\text{Rs. } 500,000 - 2,000,000 \\implies 0.31\\%$
  - $> \\text{Rs. } 2,000,000 \\implies 0.27\\%$
- SEBON regulatory fee: $0.015\\%$ on total turnover.
- DP fee: flat Rs. 25 per settlement.
- Individual Short-Term CGT: $7.5\\%$ on net capital gain.
- Individual Long-Term CGT: $5.0\\%$ on net capital gain (> 365 days).
${commonRoadmapDirective}

## 📋 OUTPUT REQUIREMENTS
Provide:
1. Executive Scorecard (0-100) on Backend & Quant integrity.
2. Table of identified bugs/discrepancies with file path and line numbers.
3. Mathematical verification of formulas.
4. Exact, drop-in replacement code blocks for any fixes.
5. The 5-Step Best Stock Selection Roadmap based on Backend & Quant engines.
`;

// Account 2 Prompt
const promptAcc2 = `# 🏛️ GEMINI ARGON AUDIT DIRECTIVE — ACCOUNT 2 OF 3
═══════════════════════════════════════════════════════════════════════════════
**Account Mission:** Audit **Part 2 — Service Hub 90+ Tabs, Floorsheet Data Wiring & 13-Tab Stock Information Suite**  
**Target Codebase:** Drabyashree NEPSE Frontend Workstation & Views  
**Input Bundle File:** \`BUNDLE_ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO.txt\`  
═══════════════════════════════════════════════════════════════════════════════

## 🎯 YOUR ROLE & STANDALONE CONTEXT
You are **Argon**, Principal React/TypeScript Architect, Financial UI Engineer & Microstructure Auditor.
You are running on **Account 2** of a 3-account serial audit pipeline.
Everything you need to audit the Service Hub tabs, broker floorsheet wiring, and the 13-tab Stock Information Suite is contained in \`BUNDLE_ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO.txt\`.

## 🔬 CRITICAL AUDIT OBJECTIVES (PROFIT MAXIMIZATION & LOSS MINIMIZATION)

### 1. Wiring Broker Floorsheet Data to All Service Hub Tabs
Inspect \`src/components/ServicesHub.tsx\`, \`src/components/services.tsx\`, and dedicated tools:
- **Floorsheet Hub Tab (\`FloorsheetServiceTab.tsx\`):** Verify that \`/api/floorsheet/hub\` properly hydrates the market-wide tape, whale prints (>= Rs. 100k or >= 200 kitta), top buyer/seller broker rankings, and filters.
- **Broker Analysis Service (\`BrokerAnalysisService\` in \`services.tsx\`):** Verify 30-day netting computes Top Accumulators and Top Sellers without double counting.
- **Broker Heatmap Service (\`BrokerHeatmapService\` in \`services.tsx\`):** Verify the $91 \\times 35$ matrix net flow calculation: $\\text{NetFlow}_{b,s} = \\sum_{t=1}^{30} (\\text{BuyAmt} - \\text{SellAmt})$.
- **Accumulation/Distribution Radar (\`AccumulationDistributionRadar.tsx\`):** Verify Wyckoff phase transitions and Safe Buy Zones.
- **Master 100% Profit Workstation (\`Master100ProfitWorkstation.tsx\`):** Verify Gate 5 ($BCR3 \\ge 40.0\\%$) and Anti-Distribution Veto.
- **Breakout Trap Radar (\`BreakoutTrapRadar.tsx\`):** Verify Exit Liquidity Trap detection ($\\ge 38\\%$ seller volume during breakout).
- **Broker Flow & Dominance (\`BrokerFlowDominanceService.tsx\`):** Verify Cornering Index: $\\frac{\\sum \\text{Top5NetBuyVol}}{\\text{FreeFloat}} \\times 100$.

### 2. Comprehensive 13-Tab Stock Information Suite Audit
Inspect \`StockDetailModal.jsx\` and \`StockInformationHubModal.tsx\`:
1. **Overview:** Beginner Confidence & Rupee Profit Simulator (SEBON slabs, DP fee Rs. 25, CGT 7.5% deduction on both buy & sell legs).
2. **Technicals:** RSI(14) gauge, MACD, EMA 20/50/200, Bollinger Bands, classical Pivot Points.
3. **Broker Flow:** StockBrokerAnalysisTab, 1D/5D/15D/30D Top Accumulators/Distributors, BCR3/BCR5 ratios.
4. **Market Depth:** Top 5 Bids/Asks, Order Book Imbalance Ratio (OBIR), synthetic depth fallback from floorsheet VAP.
5. **Floorsheet:** Historical tape, buyer/seller broker filters, whale trade tags.
6. **Volume Profile (POC):** 5-day price-by-volume histogram, Point of Control (POC) price level.
7. **Fundamentals & Lock-In:** EPS, BVPS, ROE, PE, PB; Bank NPL (< 5%) & CAR ($\\ge 11\\%$); Hydro seasonal factor; Promoter share lock-in countdown warning.
8. **Dividends & Rights:** Dividend history, bonus adjustment formula ($P_{adj} = \\frac{P_{close}}{1 + \\text{Bonus}\\%/100}$), right adjustment formula ($P_{adj} = \\frac{P_{close} + (\\text{Right} \\times 100)}{1 + \\text{Right}}$).
9. **Reports & Announcements:** StockReportsAnnouncementsCard, quarterly earnings, book closure dates.
10. **Compare Peers:** Peer comparison table (PE, PB, ROE, 1Y return).
11. **Price History & Charts:** TradingView Lightweight Charts canvas (TradingViewChartService.tsx, AdvancedChartModal.jsx).
12. **Seasonality:** Monthly win-rate %, Bikram Sambat calendar cyclicality (Baisakh to Chaitra).
13. **AI Guru & Tools:** 5-stage price fallback, quantitative assessment card, Graham Intrinsic Value, Risk-Reward Calculator.

### 3. Tab-to-Tab Data & State Synchronization
Compare state and prop flows between \`Dashboard.jsx\`, \`ServicesHub.tsx\`, and \`StockDetailModal.jsx\`:
- Verify LTP, Change %, High, Low, Volume, Turnover parity.
- Confirm reactive updates via \`liveData.js\` without stale conflicting states.
${commonRoadmapDirective}

## 📋 OUTPUT REQUIREMENTS
Provide:
1. Executive Scorecard (0-100) on Service Hub & Stock Information suite.
2. Discrepancy & Bug Log with file paths and line numbers.
3. Wiring verification table.
4. Exact, drop-in replacement code blocks for all fixes.
5. The 5-Step Best Stock Selection Roadmap based on Service Hub & Stock Information Modal.
`;

// Account 3 Master Prompt
const promptAcc3 = `# 🏛️ GEMINI ARGON AUDIT DIRECTIVE — ACCOUNT 3 OF 3
═══════════════════════════════════════════════════════════════════════════════
**Account Mission:** Audit **Part 3 — Algorithmic Signal Track Record, Predictors, AI Guru, Calculators & Test Suites**  
**Target Codebase:** Drabyashree NEPSE Algorithmic Track Record, ML & Quantitative Engines  
**Input Bundle Files:**  
  • Single Upload: \`BUNDLE_ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS.txt\` (~550k tokens)  
  • Sliced Option: \`BUNDLE_ACCOUNT_3_PART_A_TRACK_RECORD_AND_PREDICTORS.txt\` (~250k tokens) + \`BUNDLE_ACCOUNT_3_PART_B_CALCULATORS_ANALYZER_AND_TESTS.txt\` (~280k tokens)  
═══════════════════════════════════════════════════════════════════════════════

## 🎯 YOUR ROLE & STANDALONE CONTEXT
You are **Argon**, Principal Quantitative Systems Engineer, Machine Learning Specialist & Algorithmic Strategy Auditor.
You are running on **Account 3** of a 3-account serial audit pipeline.
Everything you need to audit the Algorithmic Signal Track Record, AI Predictor engine, AI Guru quantitative assessment, statutory calculators, and test suites is contained in the provided bundle(s).

## 🔬 CRITICAL AUDIT OBJECTIVES (PROFIT MAXIMIZATION & LOSS MINIMIZATION)

### 1. Algorithmic Signal Track Record Engine & Full UI
Inspect \`src/components/AlgorithmicSignalTrackRecord.tsx\` (1,476 lines), \`src/services/signalTrackRecord/rebuildSignalTrackRecord.ts\`, and \`proxy/db/signalTrackerStore.js\`:
- **5-Day Floorsheet Join & Dynamic Conviction:**
  - Verify join with \`floorsheet_broker_summary\` over the last 5 distinct trading dates.
  - Verify the 4 Conviction Tiers: \`STRONG_ACCUMULATION\`, \`STEADY_SUPPORT\`, \`NEUTRAL_FLOW\`, \`BROKER_DISTRIBUTION_WARNING\`.
- **Day T+1 Execution VWAP Fill:**
  - Verify that settled signals evaluate returns from the actual Day T+1 VWAP (or typical price $(H+L+C)/3$), NOT the signal bar close.
- **T+2 Settlement Lock Invariant:**
  - Verify that trades with $\\text{holding\\_days} < 2$ cannot be marked as \`CLOSED_WIN\` or \`CLOSED_LOSS\`.
- **NEPSE Benchmark Return & Alpha Separation:**
  - Formula: $\\text{NEPSE Alpha} = \\text{Net Return} - \\text{NEPSE Index Return}$.
  - Verify that NEPSE index return is subtracted rather than conflating alpha with net return.
- **37-Broker Leaderboard:** Verify that all 37 tracked institutional brokers display accumulated scrip holdings without vertical scrolling bugs.
- **Dashboard Quick-Stats Strip Reconciliation:** Verify that the ~63.5% strategy win rate on Dashboard matches the scorecards inside \`AlgorithmicSignalTrackRecord.tsx\`.

### 2. Predictor Hub, ML Feature Engine & Macro Regimes
Inspect \`src/components/PredictorHub.jsx\`, \`proxy/quant/predictorEngine.mjs\`, \`proxy/quant/featureEngine.mjs\`, and \`src/components/NRBMacroWidget.jsx\`:
- **Autoregressive Price Projections:** Verify that projections strictly enforce the Nepal Securities Trading Fourth Amendment 2082 circuit limits: $[-15.0\\%, +15.0\\%]$ anchored to today's close (\`features.latest_close\`).
- **ML Feature Calculations:** Verify RVOL (prior-session baseline \`slice(-21, -1)\`), Hurst exponent, fractal dimension, volatility z-score, and neutral 50 RSI on flat series.
- **NRB Macro Liquidity Regime:**
  - \`EASING\`: Interbank rate $< 3.0\\%$, CD ratio $< 80.0\\%$.
  - \`NEUTRAL\`: Interbank rate $3.0\\% - 6.5\\%$, CD ratio $80.0\\% - 88.0\\%$.
  - \`TIGHTENING\`: Interbank rate $> 6.5\\%$, CD ratio $> 88.0\\%$.
  - \`CRISIS\`: Interbank rate $> 8.5\\%$.
  - Verify deterministic fallback (\`buildBaselineNrbMacroData\`) so the widget never displays "NRB Offline".

### 3. Position Sizing & Capital Risk Management
Inspect \`src/components/CapitalRiskSimulatorView.jsx\`, \`src/components/calculators.tsx\`, and \`src/views/WaccTaxCalculator.jsx\`:
- **Half-Kelly Capital Allocation:** Verify optimal fractional Kelly fraction:
  $$f^*_{\\text{half}} = \\frac{1}{2}\\left(p - \\frac{1 - p}{b}\\right)$$
  bounded by risk budget and tier slot capital.
- **Stop-Loss Inversion Guard:** Ensure \`testStopLoss < testPrice\`; invalid stops must return 0 suggested lots.
- **High-Priced Scrip Lot Ceiling:** Prevent suggested kitta from forcing 10 shares when single-stock slot ceiling affords $< 10$ shares.
- **Multi-Lot WACC Averaging:** Exact statutory per-lot SEBON buy fees, bonus/right dilution, and exact iterative break-even exit price solver.

### 4. Automated Verification Suites
Inspect all 18 test suites in \`tests/\`:
- Verify that invariants (circuit limits, zero-sum, T+2 settlement, commission tiers) hold true across all suites.
${commonRoadmapDirective}

## 📋 OUTPUT REQUIREMENTS
Provide:
1. Executive Scorecard (0-100) on Signal Track Record, Predictors & Calculators.
2. Discrepancy & Bug Log with file paths and line numbers.
3. Mathematical verification of return formulas and alpha metrics.
4. Exact, drop-in replacement code blocks for all fixes.
5. The 5-Step Best Stock Selection Roadmap based on Track Record, Predictor Hub, and Capital Risk Simulator.
`;

fs.writeFileSync(path.join(acc1Dir, 'PROMPT_ACCOUNT_1_BACKEND_AND_QUANT.md'), promptAcc1, 'utf8');
fs.writeFileSync(path.join(acc2Dir, 'PROMPT_ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO.md'), promptAcc2, 'utf8');
fs.writeFileSync(path.join(acc3Dir, 'PROMPT_ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS.md'), promptAcc3, 'utf8');
fs.writeFileSync(path.join(acc3Dir, 'PROMPT_ARGON_PART_A.md'), promptAcc3.replace('BUNDLE_ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS.txt', 'BUNDLE_ACCOUNT_3_PART_A_TRACK_RECORD_AND_PREDICTORS.txt'), 'utf8');
fs.writeFileSync(path.join(acc3Dir, 'PROMPT_ARGON_PART_B.md'), promptAcc3.replace('BUNDLE_ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS.txt', 'BUNDLE_ACCOUNT_3_PART_B_CALCULATORS_ANALYZER_AND_TESTS.txt'), 'utf8');

// Mirror prompts to exportsDir
fs.writeFileSync(path.join(exportsDir, 'PROMPT_ACCOUNT_1_BACKEND_AND_QUANT.md'), promptAcc1, 'utf8');
fs.writeFileSync(path.join(exportsDir, 'PROMPT_ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO.md'), promptAcc2, 'utf8');
fs.writeFileSync(path.join(exportsDir, 'PROMPT_ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS.md'), promptAcc3, 'utf8');

// ── Master 3-Account Workflow Guide ──
const masterWorkflow = `# 🗺️ DRABYASHREE NEPSE — 3-ACCOUNT SERIAL ARGON AUDIT WORKFLOW (V2)
═══════════════════════════════════════════════════════════════════════════════
**Strategy:** Exhaustive Divide-and-Conquer across 3 Gemini Pro Accounts running Argon  
**Target Desktop Folder:** \`C:\\Users\\Hp\\Desktop\\Drabyashre1\`  
═══════════════════════════════════════════════════════════════════════════════

## 💡 HOW THIS 3-ACCOUNT PIPELINE WORKS

Each account has its own **dedicated, self-contained folder** with:
1. Complete text bundles containing all source files for that domain.
2. Self-contained audit prompts with zero cross-account dependencies.
3. Explicit directives for **Profit Maximization, Loss Minimization, and a 5-Step Institutional Stock Selection Roadmap**.

---

## 🚀 SERIAL ACCOUNT DISTRIBUTION INVENTORY

\`\`\`mermaid
flowchart TD
    A["Account 1: Backend & Microstructure Quant Engine\n(Folder: ACCOUNT_1_BACKEND_AND_QUANT)\n69 files | ~595k tokens"] --> B["Account 2: Service Hub 90+ Tabs & 13 Stock Modal Tabs\n(Folder: ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO)\n62 files | ~720k tokens"]
    B --> C["Account 3: Signal Track Record, Predictors & Calculators\n(Folder: ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS)\n89 files | Full ~550k tokens (or Sliced Part A & B)"]
    C --> D["Paste Argon Fixes into Antigravity\n(Immediate Verification: 18/18 Tests Green & 0 Vite Errors)"]
\`\`\`

---

### 🔹 ACCOUNT 1: Backend Architecture, Broker Vault & Quantitative Theory
📁 **Folder:** \`C:\\Users\\Hp\\Desktop\\Drabyashre1\\ACCOUNT_1_BACKEND_AND_QUANT\`
- **Upload File:** \`BUNDLE_ACCOUNT_1_BACKEND_AND_QUANT.txt\`
- **Prompt to Paste:** \`PROMPT_ACCOUNT_1_BACKEND_AND_QUANT.md\`
- **Key Modules Audited:**
  - Express proxy server (\`server.mjs\`), Broker Vault (\`brokerVault.mjs\`), SQLite tick persistence (\`ledgerStore.js\`).
  - Zero-Sum broker conservation law ($\\sum Buy \\equiv \\sum Sell \\equiv TotalVolume$).
  - Wyckoff Accumulation/Distribution formulas, Wilder's RSI, EMA, MACD, Bollinger Bands, Institutional VWAP.
  - SEBON commission slabs (0.36%-0.24%), DP fee (Rs. 25), and retail CGT (7.5%).
  - Concurrency limits (\`CONCURRENCY <= 4\`) ensuring Render 512MB RAM stability.

---

### 🔹 ACCOUNT 2: Service Hub 90+ Tabs & 13-Tab Stock Information Suite
📁 **Folder:** \`C:\\Users\\Hp\\Desktop\\Drabyashre1\\ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO\`
- **Upload File:** \`BUNDLE_ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO.txt\`
- **Prompt to Paste:** \`PROMPT_ACCOUNT_2_SERVICE_HUB_AND_STOCK_INFO.md\`
- **Key Modules Audited:**
  - Floorsheet data wiring to **all 90+ Service Hub tabs** (\`ServicesHub.tsx\`, \`services.tsx\`, \`FloorsheetServiceTab.tsx\`, \`floorsheetHubEngine.ts\`).
  - Workstations: Accumulation Radar, Master 100 Workstation, Breakout Trap Radar, Broker Flow Dominance, Minervini Leaderboard.
  - **All 13 tabs of Stock Information** in \`StockDetailModal.jsx\` and \`StockInformationHubModal.tsx\`:
    1. Overview (Confidence Score & Rupee Profit Simulator)
    2. Technicals (RSI, MACD, EMA 20/50/200, Pivot Points)
    3. Broker Flow (1D-30D Top Accumulators/Distributors, BCR3/BCR5)
    4. Market Depth (Top 5 Bids/Asks, OBIR, synthetic depth fallback from floorsheet VAP)
    5. Floorsheet (Historical contract tape, whale filters)
    6. Volume Profile (5D POC price bucket, aggressor buy/sell kitta)
    7. Fundamentals & Lock-in (EPS, BVPS, ROE, PE, PB, Bank NPL/CAR, Promoter Lock-in Countdown)
    8. Dividends & Rights (Bonus/right adjustments, dividend history)
    9. Reports & News (Quarterly disclosures, corporate notices)
    10. Compare Peers (Peer comparison matrix)
    11. Price History & Charts (TradingView Lightweight Charts)
    12. Seasonality (Monthly win-rates, Bikram Sambat calendar cyclicality)
    13. AI Guru & Tools (Quantitative assessment, Graham Intrinsic Value)

---

### 🔹 ACCOUNT 3: Algorithmic Signal Track Record, Predictors & Calculators
📁 **Folder:** \`C:\\Users\\Hp\\Desktop\\Drabyashre1\\ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS\`
- **Upload Option A (Full):** \`BUNDLE_ACCOUNT_3_TRACK_RECORD_AND_PREDICTORS.txt\`
- **Upload Option B (Sliced for standard windows):**
  - **Part A:** \`BUNDLE_ACCOUNT_3_PART_A_TRACK_RECORD_AND_PREDICTORS.txt\` with \`PROMPT_ARGON_PART_A.md\`
  - **Part B:** \`BUNDLE_ACCOUNT_3_PART_B_CALCULATORS_ANALYZER_AND_TESTS.txt\` with \`PROMPT_ARGON_PART_B.md\`
- **Key Modules Audited:**
  - **Algorithmic Signal Track Record:** 1,476-line modal (\`AlgorithmicSignalTrackRecord.tsx\`), 5D floorsheet join, 4 conviction tiers, Day T+1 VWAP fill, strict T+2 settlement lock, authentic NEPSE Alpha.
  - **Predictor Hub & ML Models:** Autoregressive projections clamped to Nepal Fourth Amendment $\\pm 15\\%$ circuit limits, feature store (\`featureEngine.mjs\`).
  - **NRB Macro Liquidity Regime:** \`NRBMacroWidget.jsx\`, interbank rate, CD ratio, monetary policy stance.
  - **Trading Calculators & Risk Sizing:** Half-Kelly optimal position sizing ($f^*_{\\text{half}}$), Capital Risk Simulator, WACC Tax Calculator with bonus/right dilution, Entry/Exit Analyzer.
  - **Analyzer Suite:** \`OneClickAlphaButton\`, \`GrahamSafetyCard\`, \`BreakoutPanel\`, \`SmartMoneyBrokerFlowCard\`, \`SetupScoreCard\`.
  - **Automated Verification:** All 18 automated unit test suites in \`tests/\`.

---

## 🧭 INSTITUTIONAL 5-STEP STOCK SELECTION ROADMAP
1. **Macro Regime Filter (NRB Macro Widget):** Verify monetary regime is \`EASING\` or \`NEUTRAL\` (Interbank $< 6.5\\%$, CD Ratio $< 88\\%$).
2. **Technical Momentum Scan (Minervini Leaderboard + Accumulation Radar):** Filter stocks in Stage 2 Uptrend (Price > 50 EMA > 200 EMA) and Wyckoff Phase C/D.
3. **Smart Money Footprint (Floorsheet Hub + Broker Analysis):** Confirm Top 3 Accumulation Brokers net buying over 5D/30D; confirm 5-day Point of Control (POC) support.
4. **Downside Vetoes (Stock Info Tab 7 + Graham Card):** Veto promoter lock-in $< 120$ days; veto bank NPL $\\ge 5\\%$; verify Graham Margin of Safety $\\ge 20\\%$.
5. **Execution & Half-Kelly Sizing (Capital Risk Simulator):** Size via Half-Kelly ($f^*_{\\text{half}}$) capped at 1% portfolio risk; buy between T+1 VWAP and POC; stop loss at 1.75x ATR; scale out 50% at T1 (+15-20%) and move stop loss to breakeven.
`;

fs.writeFileSync(path.join(desktopDir, 'MASTER_3_ACCOUNT_SERIAL_AUDIT_WORKFLOW.md'), masterWorkflow, 'utf8');
fs.writeFileSync(path.join(exportsDir, 'MASTER_3_ACCOUNT_SERIAL_AUDIT_WORKFLOW.md'), masterWorkflow, 'utf8');

console.log(`\n════════════════════════════════════════════════════════════════════════`);
console.log(`  3-ACCOUNT SERIAL ARGON AUDIT PACKAGES GENERATED SUCCESSFULLY!         `);
console.log(`════════════════════════════════════════════════════════════════════════\n`);
console.log(`Account 1: ${s1.filesCount} files | ${s1.linesCount.toLocaleString()} lines | ${(s1.bytes / 1024).toFixed(1)} KB | ~${s1.tokens.toLocaleString()} tokens`);
console.log(`Account 2: ${s2.filesCount} files | ${s2.linesCount.toLocaleString()} lines | ${(s2.bytes / 1024).toFixed(1)} KB | ~${s2.tokens.toLocaleString()} tokens`);
console.log(`Account 3 (Full): ${s3.filesCount} files | ${s3.linesCount.toLocaleString()} lines | ${(s3.bytes / 1024).toFixed(1)} KB | ~${s3.tokens.toLocaleString()} tokens`);
console.log(`  Account 3 (Part A): ${s3A.filesCount} files | ${s3A.linesCount.toLocaleString()} lines | ${(s3A.bytes / 1024).toFixed(1)} KB | ~${s3A.tokens.toLocaleString()} tokens`);
console.log(`  Account 3 (Part B): ${s3B.filesCount} files | ${s3B.linesCount.toLocaleString()} lines | ${(s3B.bytes / 1024).toFixed(1)} KB | ~${s3B.tokens.toLocaleString()} tokens`);
console.log(`\n✓ Master Workflow Guide: ${path.join(desktopDir, 'MASTER_3_ACCOUNT_SERIAL_AUDIT_WORKFLOW.md')}\n`);
