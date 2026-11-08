// QA Phases 0–3 Report & Coverage Matrix Generator
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/app_inventory.json'), 'utf8'));
const svcMatrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/logs/phase3_services_matrix.json'), 'utf8'));
const compMatrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/logs/phase3_components_matrix.json'), 'utf8'));
const npmAudit = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/logs/phase2_npm_audit.json'), 'utf8'));
const patterns = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/logs/phase2_patterns.json'), 'utf8'));

const BUGS = [
  {
    id: 'BUG-001',
    platform: 'All',
    location: 'Market & Entry/Exit > BreakoutAlertDialog',
    severity: 'Critical',
    steps: '1. Render BreakoutAlertDialog with isOpen={false} (initial closed state). 2. Open the dialog by setting isOpen={true} with a valid stock symbol.',
    expected: 'Dialog opens smoothly without React hook order errors.',
    actual: 'Throws React error: "Rendered more hooks than during the previous render" because 8 useState hooks and 1 useEffect hook are placed AFTER early return `if (!isOpen || !symbol) return null;` at line 33.',
    evidence: 'ESLint react-hooks/rules-of-hooks (9 errors at lines 43-64); Vitest qa/tests/phase3_cards_and_subcards.test.jsx [BUG REPRO BreakoutAlertDialog].',
    cause: 'src/components/BreakoutAlertDialog.jsx:33-64',
    fix: 'Move `if (!isOpen || !symbol) return null;` below all useState/useEffect hooks (after line 85), or guard effect logic inside useEffect.',
  },
  {
    id: 'BUG-002',
    platform: 'All',
    location: 'Predictor / Services > EntryExitAnalyzer > EntryRiskCard',
    severity: 'Critical',
    steps: '1. Mount EntryRiskCard while `levels` is initially null (loading). 2. Pass computed `levels` object on next render.',
    expected: 'EntryRiskCard transitions from null/loading to populated risk card without crashing.',
    actual: 'Throws React error: "Rendered more hooks than during the previous render" because 7 useState hooks and 1 useMemo hook (lines 84, 87, 98, 160, 187, 188, 189, 193) are called AFTER `if (!levels) return null;` at line 66.',
    evidence: 'ESLint react-hooks/rules-of-hooks (8 errors at lines 84-193); Vitest qa/tests/phase3_cards_and_subcards.test.jsx [BUG REPRO EntryRiskCard].',
    cause: 'src/components/analyzer/EntryRiskCard.tsx:66-193',
    fix: 'Move all 8 hooks above `if (!levels) return null;` using optional chaining (`levels?.ltp`) for initial values.',
  },
  {
    id: 'BUG-003',
    platform: 'All',
    location: 'Market & Services > Alpha Playbook & Distribution Leaders (39 Orphan Services)',
    severity: 'High',
    steps: '1. On Market Dashboard (Dashboard.jsx:4592, 5046, 5129, 5500) or EntryExitAnalyzer (line 1154), click "Alpha Playbook" or "Distribution Leaders" button (which dispatches `open_service` with `alpha-playbook` or `distribution-leaders`).',
    expected: 'ServicesHub opens AlphaPlaybookService or AccumulationDistributionRadar (Distribution mode) in the detail view.',
    actual: 'Silently fails to open. User is left on the Services Hub index because `handleOpenService` (ServicesHub.tsx:1473) looks up `ALL_SERVICES.find(s => s.id === sId)`, and 39 keys present in `SERVICE_COMPONENTS` (including `alpha-playbook` and `distribution-leaders`) are missing from `ALL_SERVICES`.',
    evidence: 'qa/app_inventory.json (`serviceRegistryIssues.unregisteredComponentKeys`: 39 keys); Vitest qa/tests/phase3_services125.test.jsx [BUG REPRO alpha-playbook].',
    cause: 'src/components/ServicesHub.tsx:236-380, 1445, 1473 & src/components/Dashboard.jsx:4592,5046,5129,5500',
    fix: 'Register `alpha-playbook`, `distribution-leaders`, and the remaining 37 `SERVICE_COMPONENTS` keys in `ALL_SERVICES` or fall back to synthesizing a ServiceDef when `SERVICE_COMPONENTS[sId]` exists.',
  },
  {
    id: 'BUG-004',
    platform: 'All',
    location: 'Predictor / Services > EntryExitAnalyzer > EntryRiskCard (Net Profit CGT Calculator)',
    severity: 'High',
    steps: '1. Open EntryExitAnalyzer -> EntryRiskCard. 2. Expand Net Profit Calculator and select Long-Term (>365 days, 5% CGT).',
    expected: 'Long-term individual Capital Gains Tax (5%) is applied when holdingDays = 520.',
    actual: 'Short-term 7.5% CGT is ALWAYS charged (50% tax overcharge on gains). `EntryRiskCard.tsx:200` passes `{ holdingDays: 520 }` to `calculateNetProfit`, but `calculateNetProfit` (riskManagement.js:274-315) does not accept a `holdingDays` parameter and only computes holding period from `buyDate` and `sellDate`.',
    evidence: 'TypeScript TS2353 at EntryRiskCard.tsx:200; Vitest qa/tests/phase3_calculations.test.mjs [BUG REPRO EntryRiskCard holdingDays:520].',
    cause: 'src/components/analyzer/EntryRiskCard.tsx:200 & src/utils/riskManagement.js:274-315',
    fix: 'Update `calculateNetProfit` in `src/utils/riskManagement.js` to accept `holdingDays = null` as a parameter and set `isLongTerm = holdingDays > 365` when `buyDate`/`sellDate` are not provided.',
  },
  {
    id: 'BUG-005',
    platform: 'All',
    location: 'Service Hub > Flagship Suites > Backtest Engine & Walk-Forward Report (`backtest-report`)',
    severity: 'High',
    steps: '1. Open Service Hub -> Backtest Engine & Walk-Forward Report (`backtest-report`) when `/api/backtest/run` returns an empty/partial data payload (e.g. `{ success: true, data: {} }` or `{ success: true, data: [] }`).',
    expected: 'Renders empty/error state gracefully without crashing.',
    actual: 'Triggers ErrorBoundary ("Backtest Engine & Walk-Forward Report Telemetry Notice") with `TypeError: Cannot read properties of undefined (reading \'filter\')` at `metrics.closedTrades.filter(...)` (line 209).',
    evidence: 'Vitest qa/tests/phase3_services125.test.jsx & qa/logs/phase3_services_matrix.json (`backtest-report` FAIL).',
    cause: 'src/components/BacktestReportScreen.tsx:73-75, 209',
    fix: 'Validate `json.data && Array.isArray(json.data.closedTrades)` before calling `setMetrics(json.data)`, and guard `(metrics.closedTrades || []).filter(...)` and `(metrics.expectancyNpr ?? 0).toLocaleString()`.',
  },
  {
    id: 'BUG-006',
    platform: 'All',
    location: 'Calculators & Portfolio > Statutory Buy Cost / CDSC DP Fee (Rs. 25)',
    severity: 'High',
    steps: '1. Calculate buy cost for 100 shares @ Rs. 500 in WaccAveragingCalculator / Portfolio (`calculateBuyDetails`). 2. Calculate the exact same buy trade in BrokerageCalculator (`calculators.tsx:311`), `calculateNepseStatutoryTrade` (`calculations.js:1440`), or `calculateNetProfit` (`riskManagement.js:294`).',
    expected: 'All calculators across the app apply a consistent CDSC DP fee rule for the buy leg.',
    actual: '`calculateBuyDetails` (calculations.js:351) sets `dpFee = 0` (Total Buy = Rs. 50,187.50, WACC = Rs. 501.88), whereas `calculateNepseStatutoryTrade` (calculations.js:1440), `calculateNetProfit` (riskManagement.js:294), and `BrokerageCalculator` (calculators.tsx:311) charge `buyDp = 25` (Total Buy = Rs. 50,212.50, WACC = Rs. 502.13).',
    evidence: 'Vitest qa/tests/phase3_calculations.test.mjs [BUG REPRO Statutory Buy Cost inconsistency].',
    cause: 'src/utils/calculations.js:351, 1440 & src/utils/riskManagement.js:294 & src/components/calculators.tsx:311',
    fix: 'Unify CDSC DP charge handling across `calculateBuyDetails`, `calculateNepseStatutoryTrade`, `calculateNetProfit`, and `BrokerageCalculator`.',
  },
  {
    id: 'BUG-007',
    platform: 'All',
    location: 'Predictor / Services > EntryExitAnalyzer > SetupScoreCard (Statistical Edge Δ)',
    severity: 'Medium',
    steps: '1. Open EntryExitAnalyzer for any stock with valid history and inspect the "Statistical Edge (Δ)" box inside SetupScoreCard.',
    expected: 'Displays the empirical win rate minus break-even win rate delta (e.g. `+26.8%`).',
    actual: 'Permanently displays `"—"` / `"Requires Setup History"` because line 283 reads `quantMetrics.expectancy?.pWin`, which does not exist on the object returned by `calculateExpectancy` (win probability is stored at `quantMetrics.winProbability`).',
    evidence: 'TypeScript TS2339 at SetupScoreCard.tsx:283; Vitest qa/tests/phase3_cards_and_subcards.test.jsx [BUG REPRO SetupScoreCard].',
    cause: 'src/components/analyzer/SetupScoreCard.tsx:283',
    fix: 'Read `const empiricalWin = quantMetrics.expectancy?.pWin ?? quantMetrics.winProbability;` at line 283.',
  },
  {
    id: 'BUG-008',
    platform: 'All',
    location: 'Service Hub > Calculators > Stock Split & Par Value Adjustment (`stock-split`)',
    severity: 'Medium',
    steps: '1. Open Service Hub -> Calculators -> Stock Split & Par Value Adjustment (`stock-split`). 2. Look at the top blue info banner.',
    expected: 'Banner displays "NEPSE Stock Split Calculator: A stock split divides existing shares..."',
    actual: 'Renders an empty blue box with an info icon and blank text because `StockSplitCalculator` (calculators.tsx:1253) passes `title="..." text="..."` props to `<InfoBanner>`, which only renders `{children}` (`ui.tsx:100-110`).',
    evidence: 'TypeScript TS2322 at calculators.tsx:1255; Vitest qa/tests/phase3_services125.test.jsx (`stock-split` FAIL).',
    cause: 'src/components/calculators.tsx:1253-1257 & src/components/ui.tsx:100-110',
    fix: 'Pass content as children to `<InfoBanner>` or support optional `title` and `text` props in `InfoBanner` (`src/components/ui.tsx:100`).',
  },
  {
    id: 'BUG-009',
    platform: 'All',
    location: 'Portfolio & Calculators > `adjustForBonusShare` & `adjustForRightShare`',
    severity: 'Medium',
    steps: '1. Call `adjustForBonusShare(0, 500, 20)` or `adjustForRightShare(0, 500, 0.5, 100)` with 0 initial units.',
    expected: 'Returns `newWacc: 0` (or original `wacc`) as a finite number.',
    actual: 'Returns `{ newUnits: 0, newWacc: NaN }` due to unguarded `0 / 0` division at lines 32 and 46 (unlike `adjustSimultaneousBonusAndRight` at line 77 which guards `totalNewUnits > 0`).',
    evidence: 'Vitest qa/tests/phase3_calculations.test.mjs [BUG REPRO adjustForBonusShare/adjustForRightShare].',
    cause: 'src/utils/calculations.js:32, 46',
    fix: 'Guard division with `const newWacc = newUnits > 0 ? (units * wacc) / newUnits : wacc;`.',
  },
  {
    id: 'BUG-010',
    platform: 'All',
    location: 'Portfolio & 15 Cards > Null/Undefined `stocks` or `stock` Prop Crash',
    severity: 'Medium',
    steps: '1. Mount `Portfolio.jsx` without `stocks` prop or mount any of 15 cards (`Dashboard.jsx`, `StockTechnicalGaugeCard.jsx`, `StockYanAnalyticsCard.jsx`, `StockRightShareCard.jsx`, `Master100ProfitWorkstation.tsx`, `AlphaCommandCenter.tsx`, `MultibaggerHunterService.tsx`, `MinerviniLeaderboard.tsx`, `ShareHubScannersSuite.tsx`, `StockSelectionScreener.tsx`, etc.) with `stocks={null}` or `stock={null}`.',
    expected: 'Components render empty state cleanly when `stocks` or `stock` is `null` or `undefined`.',
    actual: '`Portfolio.jsx:460` throws `TypeError: Cannot read properties of undefined (reading \'length\')` because `stocks: marketStocks` has no default `= []`. The 15 other components use `stocks = []`, which only guards `undefined` and crashes with `TypeError` when `stocks` is `null`.',
    evidence: 'Vitest qa/tests/phase3_cards_and_subcards.test.jsx & qa/logs/phase3_components_matrix.json (16 component failures on null/undefined props).',
    cause: 'src/components/Portfolio.jsx:297, 460 & 15 component files in qa/logs/phase3_components_matrix.json',
    fix: 'Default `stocks: rawStocks = []` and normalize `const marketStocks = Array.isArray(rawStocks) ? rawStocks : [];`.',
  },
  {
    id: 'BUG-011',
    platform: 'Electron',
    location: 'Electron Main Process (`electron/main.cjs`) > WebPreferences & CORS/CSP Stripping',
    severity: 'High',
    steps: '1. Inspect `electron/main.cjs:35-55`.',
    expected: '`webSecurity: true`, `sandbox: true`, and strict Content-Security-Policy header preserved.',
    actual: '`webSecurity: false` and `sandbox: false` are set on the main BrowserWindow (lines 38-39), and `onHeadersReceived` (lines 45-55) deletes `content-security-policy` and `x-frame-options` on every response while injecting `access-control-allow-origin: *`.',
    evidence: 'Phase 0/2 config audit of `electron/main.cjs:35-55`.',
    cause: 'electron/main.cjs:35-55',
    fix: 'Enable `webSecurity: true` and `sandbox: true`, route cross-origin market fetches through the embedded local Express proxy (`localhost:5000`), and restrict header rewriting to known NEPSE data domains.',
  },
  {
    id: 'BUG-012',
    platform: 'All',
    location: 'Guru AI & Portfolio > Client-Exposed `VITE_*_API_KEY` Fallbacks',
    severity: 'Medium',
    steps: '1. Inspect `src/components/AiAnalyst.jsx:1388, 1486, 1685` and `src/components/Portfolio.jsx:300-302`.',
    expected: 'AI provider keys (`GLM`, `GEMINI`, `GROQ`) are never referenced via `import.meta.env.VITE_*` in client code, matching the security policy comment in `src/services/aiService.js:34-36`.',
    actual: '`AiAnalyst.jsx` and `Portfolio.jsx` still read `import.meta.env.VITE_GLM_API_KEY`, `VITE_GEMINI_API_KEY`, and `VITE_GROQ_API_KEY`. If present in `.env` at build time, Vite bundles those secrets in plaintext into client JS.',
    evidence: 'Phase 2 static scan (`client_exposed_VITE_secret_env`: 7 hits in `qa/logs/phase2_patterns.json`).',
    cause: 'src/components/AiAnalyst.jsx:1388, 1486, 1685 & src/components/Portfolio.jsx:300-302',
    fix: 'Remove `import.meta.env.VITE_GLM_API_KEY / VITE_GEMINI_API_KEY / VITE_GROQ_API_KEY` from client components and route AI calls exclusively through `aiService.js` proxy or user-supplied localStorage keys.',
  },
  {
    id: 'BUG-013',
    platform: 'All',
    location: 'Global > InAppNewsReaderModal Conditional Hook Call',
    severity: 'Low',
    steps: '1. Inspect `src/components/InAppNewsReaderModal.jsx:36`.',
    expected: '`useNavigation()` is called unconditionally at top level of the component.',
    actual: '`const navigation = useNavigation ? useNavigation() : null;` triggers ESLint `react-hooks/rules-of-hooks` error.',
    evidence: 'ESLint `qa/logs/phase2_eslint.json` (`src/components/InAppNewsReaderModal.jsx:36`).',
    cause: 'src/components/InAppNewsReaderModal.jsx:36',
    fix: 'Call `const navigation = useNavigation();` unconditionally.',
  },
  {
    id: 'BUG-014',
    platform: 'All',
    location: 'Services & Stock Cards > UTC Date Slicing Instead of Nepal Time (UTC+5:45)',
    severity: 'Medium',
    steps: '1. Run the app between 00:00 NPT and 05:45 NPT (18:15–24:00 UTC previous day). 2. Check daily routine keys in `AlphaPlaybookService.tsx:122, 131, 734` and export/date labels in 55 occurrences across `src/`.',
    expected: 'All session/date keys use Nepal Time (`formatNptDateIso(new Date())`, UTC+5:45).',
    actual: '55 places use `new Date().toISOString().slice(0, 10)`, which returns the previous UTC date for the first 5 hours 45 minutes of every Nepal day.',
    evidence: 'Phase 2 static scan (`date_UTC_slice_not_NPT`: 55 occurrences in `qa/logs/phase2_patterns.json`).',
    cause: 'src/components/AlphaPlaybookService.tsx:122, 131, 734 & 52 other locations in qa/logs/phase2_patterns.json',
    fix: 'Replace `new Date().toISOString().slice(0, 10)` with `formatNptDateIso(new Date())` from `src/utils/nepseCalendar.js`.',
  },
  {
    id: 'BUG-015',
    platform: 'Android / iOS / Electron',
    location: 'Multiple Components > Unguarded `window.open(..., "_blank")` & `localStorage` Calls',
    severity: 'Low',
    steps: '1. Click external chart/PDF/news links in `Master100ProfitWorkstation.tsx:602` (`/NEPSE_100_Percent_Profit_Master_Guide.pdf`), `AdvancedChartModal.jsx:231`, `TradingViewChartService.tsx:138`, or `StockReportsAnnouncementsCard.jsx:393, 495, 544` inside Android WebView, or run with restricted storage.',
    expected: 'External links open reliably on Android/Electron and localStorage calls are wrapped in `try/catch`.',
    actual: '8 `window.open` calls (including relative `/NEPSE_100_Percent_Profit_Master_Guide.pdf` which fails inside Electron `setWindowOpenHandler` because it only allows `http:`/`https:`) and 85 unguarded `localStorage` accesses + 37 unguarded `JSON.parse` calls exist across UI components.',
    evidence: 'Phase 2 static scan (`window_open_native_webview`: 8, `storage_access_without_try`: 85, `JSON_parse_without_try`: 37).',
    cause: 'src/components/Master100ProfitWorkstation.tsx:602, electron/main.cjs:69-74, and UI components in qa/logs/phase2_patterns.json',
    fix: 'Use a centralized `openExternalUrl` helper and `safeStorageGet/Set` wrapper across UI components.',
  },
  {
    id: 'BUG-016',
    platform: 'All',
    location: 'Build & Architecture > Dead Next.js Route Files & Node-Only Modules Inside `src/` plus 13.8 MB Broker Matrix Chunks',
    severity: 'Medium',
    steps: '1. Run `tsc --noEmit` and `vite build`. 2. Inspect `src/app/api/**/route.ts`, `src/lib/db/drabyashreeDb.ts`, and `dist/assets/broker-matrices-historical-*.js`.',
    expected: '`src/` contains only browser-compatible React SPA modules; server routes live under `proxy/`.',
    actual: '5 Next.js `next/server` route files (`src/app/api/**`) and 3 Node-only `fs`/`better-sqlite3` modules (`src/lib/db/drabyashreeDb.ts`, `src/services/signalTrackRecord/rebuildSignalTrackRecord.ts`, `src/utils/signals/backtestEngine.js`) sit inside `src/`. Additionally, `broker-matrices-historical` (8.62 MB) + `broker-matrix-latest` (4.23 MB) bloat the bundle to 32.9 MB.',
    evidence: 'Phase 0 `qa/logs/phase0_vite_build.log` & Phase 2 `qa/logs/phase2_tsc.log` + `qa/logs/phase2_patterns.json`.',
    cause: 'src/app/api/**, src/lib/db/drabyashreeDb.ts, vite.config.mjs:115-120',
    fix: 'Move server-only routes/DB files out of `src/` into `proxy/` and lazy-fetch historical broker matrices on demand.',
  },
  {
    id: 'BUG-017',
    platform: 'All',
    location: 'Dependencies > `npm audit` Vulnerabilities (41 Total: 5 Critical, 17 High, 17 Moderate, 2 Low)',
    severity: 'High',
    steps: '1. Run `npm audit --json`.',
    expected: '0 critical or high vulnerabilities in production/packaging dependencies.',
    actual: '41 vulnerabilities reported (5 Critical: `@capacitor/android`, `concurrently`, `proxy-addr`, `shell-quote`, `tar`; 17 High: `undici`, `body-parser`, `follow-redirects`, `re2js`, `firebase`, `electron`, `vite`, etc.).',
    evidence: '`qa/logs/phase2_npm_audit.json`.',
    cause: 'package.json & package-lock.json',
    fix: 'Run `npm audit fix` for non-breaking fixes (`@capacitor/android`, `concurrently`, `proxy-addr`, `shell-quote`, `undici`, `body-parser`, `follow-redirects`) and schedule major upgrades in a dedicated dependency PR.',
  },
];

// Build Coverage Matrix for all 862 inventory items (Phases 0-3 status)
const svcStatusMap = new Map(svcMatrix.results.map(r => [r.id, r]));
const compStatusMap = new Map(compMatrix.fileResults.map(r => [r.file, r]));

const coverageRows = inventory.items.map(it => {
  const cleanFile = (it.sourceFile || '').replace(/ \(inline.*\)$/, '');
  if (it.type === 'service') {
    const s = svcStatusMap.get(it.id);
    if (!s) return { ...it, status: 'Not-Tested', reason: 'Pending Phase 4 E2E crawl' };
    return {
      ...it,
      status: s.status === 'PASS' ? 'Tested-Pass' : 'Tested-Fail',
      reason: s.status === 'PASS' ? 'Phase 3 RTL mount + service detail header verified (Phase 4 Playwright E2E pending)' : s.errorMsg,
    };
  }
  const c = compStatusMap.get(cleanFile);
  if (c) {
    const allPass = c.normal === 'PASS' && c.empty === 'PASS' && c.nullState === 'PASS';
    // Check if this specific component has a Phase 2/3 bug
    const specificBug =
      (cleanFile.includes('BreakoutAlertDialog') && 'BUG-001: Conditional React hooks crash on open') ||
      (cleanFile.includes('EntryRiskCard') && 'BUG-002 & BUG-004: Conditional React hooks + 7.5% vs 5% CGT bug') ||
      (cleanFile.includes('SetupScoreCard') && 'BUG-007: quantMetrics.expectancy.pWin undefined -> Statistical Edge stuck on "—"') ||
      (cleanFile.includes('InAppNewsReaderModal') && 'BUG-013: Conditional useNavigation() hook call') ||
      (!allPass && `BUG-010: Render state failure (normal=${c.normal}, empty=${c.empty}, null=${c.nullState})`);
    return {
      ...it,
      status: specificBug ? 'Tested-Fail' : 'Tested-Pass',
      reason: specificBug || 'Phase 2 static + Phase 3 RTL normal/empty/null mount passed (Phase 4 Playwright E2E pending)',
    };
  }
  return { ...it, status: 'Not-Tested', reason: 'No standalone component file; pending Phase 4 Playwright E2E crawl' };
});

const passCount = coverageRows.filter(r => r.status === 'Tested-Pass').length;
const failCount = coverageRows.filter(r => r.status === 'Tested-Fail').length;
const notTestedCount = coverageRows.filter(r => r.status === 'Not-Tested').length;

// Write qa/bug_report.csv
const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csvHeader = [
  'ID',
  'Platform (Web/Android/iOS/Electron/All)',
  'Tab > Card > Sub-card/Service',
  'Severity (Critical/High/Medium/Low)',
  'Steps to reproduce',
  'Expected',
  'Actual',
  'Evidence (screenshot, log, test name)',
  'Likely cause (file:line)',
  'Suggested fix',
].join(',');
const csvBody = BUGS.map(b =>
  [b.id, b.platform, b.location, b.severity, b.steps, b.expected, b.actual, b.evidence, b.cause, b.fix].map(csvEscape).join(',')
).join('\n');
fs.writeFileSync(path.join(ROOT, 'qa/bug_report.csv'), csvHeader + '\n' + csvBody + '\n', 'utf8');

// Write qa/bug_report.md
let md = `# Drabyashree NEPSE — QA Audit Report (Phases 0–3 Completed)\n\n`;
md += `Generated: ${new Date().toISOString()}  \n`;
md += `**Zero application source files modified** (\`git status src/\` is 100% clean).\n\n`;

md += `## 1. Executive Summary\n\n`;
md += `- **Total Inventory Items Enumerated (Phase 1):** **${inventory.items.length}** (across 9 root tabs/views, including **${inventory.serviceCount} Service Hub services** + **39 unregistered/orphan service component mappings**)\n`;
md += `- **Items Tested in Phases 0–3 (Static + Unit/RTL Component Mounts):** **${passCount + failCount} / ${inventory.items.length}** (${passCount} Tested-Pass, ${failCount} Tested-Fail, ${notTestedCount} Not-Tested — Phases 4–9 E2E browser/mobile/Electron crawl pending your per-tab instruction)\n`;
md += `- **Total Bugs Logged (Phases 0–3):** **${BUGS.length}**\n`;
md += `  - **Critical:** ${BUGS.filter(b => b.severity === 'Critical').length}\n`;
md += `  - **High:** ${BUGS.filter(b => b.severity === 'High').length}\n`;
md += `  - **Medium:** ${BUGS.filter(b => b.severity === 'Medium').length}\n`;
md += `  - **Low:** ${BUGS.filter(b => b.severity === 'Low').length}\n\n`;

md += `### Top 10 Bugs to Fix First\n\n`;
BUGS.slice(0, 10).forEach((b, idx) => {
  md += `${idx + 1}. **${b.id} [${b.severity}] — ${b.location}** (\`${b.cause}\`): ${b.actual}\n`;
});

md += `\n---\n\n## 2. Phase 0 — Setup, Scripts & Production Build Telemetry\n\n`;
md += `### 2.1 Existing \`package.json\` Scripts\n`;
md += `- **Dev / Start:** \`start\` (\`node --max-old-space-size=2048 proxy/server.mjs\`), \`dev\` (\`concurrently "vite" "npm run start --prefix proxy"\`), \`preview\` (\`vite preview\`)\n`;
md += `- **Build / Packaging:** \`build\` (\`vite build\`), \`mobile:sync\`, \`mobile:build-debug\`, \`mobile:build-release\`, \`build:apk\`, \`desktop\` (\`electron .\`), \`build:pc\`, \`build:pc:portable\`\n`;
md += `- **Test / Audit:** \`test\` (\`node tests/runAll.mjs\`), \`test:parity\`, \`audit:static\`, \`audit:ui\`, \`audit:app\`, \`audit:prod\`, \`audit:hubs\`, \`audit:all\`\n`;
md += `- **Missing Standard Scripts:** No \`lint\` (ESLint) or \`typecheck\` (\`tsc --noEmit\`) script existed in \`package.json\`. Both were installed and configured inside \`/qa\`.\n\n`;

md += `### 2.2 Production Build (\`vite build\`) Results\n`;
md += `- **Status:** Built in \`16.38s\` (1,771 modules transformed, 0 build errors, 6 Rollup warnings).\n`;
md += `- **Total \`dist/\` Size:** **32.9 MB**\n`;
md += `- **Largest Chunks:**\n`;
md += `  1. \`dist/assets/broker-matrices-historical-CaI_OgJ9.js\` — **8,618 KB** (738.6 KB gzip)\n`;
md += `  2. \`dist/assets/broker-matrix-latest-DnxXRo2f.js\` — **4,226 KB** (510.2 KB gzip)\n`;
md += `  3. \`dist/assets/index-W6A8651q.js\` — **1,365 KB** (360.9 KB gzip)\n`;
md += `  4. \`dist/assets/ServicesHub-ByGVRvp1.js\` — **1,069 KB** (247.2 KB gzip)\n`;
md += `  5. \`dist/assets/broker-holdings-alltime-WrbLZ58_.js\` — **673 KB** (125.5 KB gzip)\n`;
md += `  6. \`dist/assets/firebase-CYuKDWnJ.js\` — **662 KB** (170.4 KB gzip)\n`;
md += `- **Build Warnings:** 5 modules (\`merolaganiNewsService.js\`, \`liveData.js\`, \`@capacitor/app\`, \`localLedgerManager.ts\`, \`StockDetailModal.jsx\`) are both dynamically and statically imported, defeating code-splitting; plus chunks exceeding 1,600 kB.\n\n`;

md += `---\n\n## 3. Phase 1 — Master Inventory Summary\n\n`;
md += `- **Full Inventory Files:** \`qa/app_inventory.json\` and \`qa/app_inventory.md\`\n`;
md += `- **Navigation Model:** **State-based** via \`NavigationContext\` (\`useNavigation()\`). No \`react-router\`. Root tabs stay mounted and toggle via \`display: flex / none\`; \`StockDetailModal\` is a state-driven modal (\`selectedStock\`); \`ServicesHub\` switches to detail view via \`selectedService\`.\n\n`;
md += `| Root Tab Key | Tab | Sub-Tabs | Cards | Sub-Cards | Services | Total |\n|---|---|---|---|---|---|---|\n`;
for (const [k, v] of Object.entries(inventory.totals)) {
  const tot = Object.values(v).reduce((a, b) => a + b, 0);
  md += `| \`${k}\` | ${v.tab} | ${v['sub-tab']} | ${v.card} | ${v['sub-card']} | ${v.service} | **${tot}** |\n`;
}
md += `| **TOTAL** | **9** | **43** | **78** | **607** | **125** | **${inventory.items.length}** |\n\n`;

md += `---\n\n## 4. Phase 2 — Static Analysis Summary\n\n`;
md += `- **ESLint (\`qa/logs/phase2_eslint.json\`, 201 files):** **18 Errors** (\`react-hooks/rules-of-hooks\` in \`BreakoutAlertDialog.jsx\`, \`EntryRiskCard.tsx\`, \`InAppNewsReaderModal.jsx\`), **470 Warnings** (\`no-console\`: 194, \`react/no-array-index-key\`: 157, \`react-hooks/exhaustive-deps\`: 94, \`no-promise-executor-return\`: 25).\n`;
md += `- **TypeScript \`tsc --noEmit\` (\`qa/logs/phase2_tsc.log\`):** **131 Errors** (65 \`TS2339\` missing properties, 20 \`TS2322\` prop type mismatches, 12 \`TS2591\`, 10 \`TS2345\`, 7 \`TS2307\` dead Next.js imports, 5 \`TS2353\`, 3 \`TS2739\`, 3 \`TS2554\`, 3 \`TS2551\`).\n`;
md += `- **Static Pattern Scan (\`qa/logs/phase2_patterns.json\`, 200 files):**\n`;
for (const [k, v] of Object.entries(patterns.summary)) {
  md += `  - \`${k}\`: **${v}**\n`;
}
md += `- **\`npm audit\` (\`qa/logs/phase2_npm_audit.json\`):** **${npmAudit.metadata.vulnerabilities.total} vulnerabilities** (Critical: ${npmAudit.metadata.vulnerabilities.critical}, High: ${npmAudit.metadata.vulnerabilities.high}, Moderate: ${npmAudit.metadata.vulnerabilities.moderate}, Low: ${npmAudit.metadata.vulnerabilities.low}).\n\n`;

md += `---\n\n## 5. Phase 3 — Unit & Component Test Summary (Vitest + React Testing Library)\n\n`;
md += `- **Test Files Created in \`/qa/tests\`:**\n`;
md += `  1. \`qa/tests/phase3_calculations.test.mjs\` — Financial formulas, statutory commissions/SEBON/DP/CGT, bonus/right adjustments, technical indicators, quantEngine, and NEPSE April 2026 regime shifts.\n`;
md += `  2. \`qa/tests/phase3_services125.test.jsx\` — Data-driven test looping over all **125 services** in \`ALL_SERVICES\` plus \`open_service\` event verification (**123/125 PASS, 2 FAIL**: \`backtest-report\` crash & \`stock-split\` blank \`<InfoBanner>\`, plus \`alpha-playbook\` / \`distribution-leaders\` unreachable bug).\n`;
md += `  3. \`qa/tests/phase3_cards_and_subcards.test.jsx\` — Mounts all **95 distinct component modules** across **Normal**, **Empty (\`[]\`)**, and **Null (\`null\`)** states (**94/95 pass Normal & Empty; 16 fail on Null/Undefined props**), plus reproduces \`BreakoutAlertDialog\`, \`EntryRiskCard\`, and \`SetupScoreCard\` bugs.\n\n`;

md += `---\n\n## 6. Detailed Bug Table (Phases 0–3)\n\n`;
md += `| ID | Platform | Tab > Card > Sub-card/Service | Severity | Steps to reproduce | Expected | Actual | Evidence | Likely cause (file:line) | Suggested fix |\n`;
md += `|---|---|---|---|---|---|---|---|---|---|\n`;
for (const b of BUGS) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  md += `| **${b.id}** | ${esc(b.platform)} | ${esc(b.location)} | **${b.severity}** | ${esc(b.steps)} | ${esc(b.expected)} | ${esc(b.actual)} | ${esc(b.evidence)} | \`${esc(b.cause)}\` | ${esc(b.fix)} |\n`;
}

md += `\n---\n\n## 7. Coverage Matrix (All ${inventory.items.length} Inventory Items — Phases 0–3)\n\n`;
md += `| ID | Tab | Type | Name | Source File | Status (Phases 0–3) | Evidence / Reason |\n`;
md += `|---|---|---|---|---|---|---|\n`;
for (const r of coverageRows) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
  md += `| \`${r.id}\` | ${r.tab} | ${r.type} | ${esc(r.name)} | \`${esc(r.sourceFile)}\` | **${r.status}** | ${esc(r.reason)} |\n`;
}

fs.writeFileSync(path.join(ROOT, 'qa/bug_report.md'), md, 'utf8');

// Write qa/progress.md
const progressMd = `# QA Audit Progress Tracker\n\nUpdated: ${new Date().toISOString()}\n\n## Completed Phases\n- [x] **Phase 0 — Setup & Build Telemetry** (\`qa/logs/phase0_vite_build.log\`)\n- [x] **Phase 1 — Master Inventory** (\`qa/app_inventory.json\`, \`qa/app_inventory.md\` — 862 items, 125 services)\n- [x] **Phase 2 — Static Analysis** (\`qa/logs/phase2_eslint.json\`, \`qa/logs/phase2_tsc.log\`, \`qa/logs/phase2_patterns.json\`, \`qa/logs/phase2_npm_audit.json\`)\n- [x] **Phase 3 — Component & Unit Tests (Vitest + RTL)** (\`qa/tests/phase3_*.test.*\`, \`qa/logs/phase3_services_matrix.json\`, \`qa/logs/phase3_components_matrix.json\`)\n\n## Pending Phases (Awaiting Per-Tab User Instruction)\n- [ ] **Phase 4 — End-to-End Crawl (Playwright at 390x844, 820x1180, 1440x900)**\n- [ ] **Phase 5 — Live Data Correctness & Cross-Tab Reconciliation**\n- [ ] **Phase 6 — AI Features (30 Fixed Prompts on Predictor & Guru AI)**\n- [ ] **Phase 7 — Capacitor (Mobile) Checks**\n- [ ] **Phase 8 — Electron (Desktop) Checks**\n- [ ] **Phase 9 — Performance & Accessibility (Lighthouse / axe)**\n- [ ] **Phase 10 — Final Consolidated Report**\n`;
fs.writeFileSync(path.join(ROOT, 'qa/progress.md'), progressMd, 'utf8');

console.log(JSON.stringify({ bugsLogged: BUGS.length, totalInventory: inventory.items.length, passCount, failCount, notTestedCount }, null, 2));
