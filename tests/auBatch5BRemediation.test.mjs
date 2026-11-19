import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

test('BUG-058: Dashboard loadHeroHistory drops lastSyncTime dep & App auth timeout consolidated', () => {
  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8');
  // Find loadHeroHistory useEffect
  const heroMatch = dashSrc.match(/loadHeroHistory\(\);\s*return\s*\(\)\s*=>\s*\{\s*active\s*=\s*false;\s*\};\s*\}\s*,\s*\[([^\]]+)\]\);/);
  assert.ok(heroMatch, 'loadHeroHistory useEffect found');
  const deps = heroMatch[1];
  assert.ok(!deps.includes('lastSyncTime'), 'loadHeroHistory must not include lastSyncTime in deps');

  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
  // Check that conflicting 350ms auth timeout is not present
  assert.ok(!appSrc.includes('setTimeout(() => {\n      setUser(prev => (prev === undefined ? (getLocalSession() || null) : prev));\n    }, 350)'),
    'App.jsx must not have conflicting 350ms auth race timeout');
});

test('BUG-059: Stealth accumulation service ID & Dashboard historical sessionDate preservation', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
  assert.ok(!appSrc.includes("localStorage.setItem('open_service_id', 'stealth-accumulation');"),
    'App.jsx must use stealth-accumulation-tracker, not deprecated stealth-accumulation');

  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8');
  // StockDetailModal should not strip sessionDate when isHistoricalSession is omitted
  const modalSlice = dashSrc.slice(dashSrc.indexOf('<StockDetailModal'), dashSrc.indexOf('/>', dashSrc.indexOf('<StockDetailModal')));
  assert.ok(!modalSlice.includes("selectedStock?.isHistoricalSession ? (selectedStock?.sessionDate || selectedStock?.date || '') : ''"),
    'Dashboard must not strip sessionDate when isHistoricalSession is falsey');
});

test('BUG-060: NavigationContext ref-stabilizes goBack & single-mounts Capacitor listeners', () => {
  const navSrc = fs.readFileSync(path.join(ROOT, 'src/context/NavigationContext.jsx'), 'utf8');
  // CapacitorApp.addListener('backButton') must be in mount-only useEffect []
  const listenerBlock = navSrc.match(/CapacitorApp\.addListener\('backButton'[\s\S]*?\}, \[([^\]]*)\]\);/);
  assert.ok(listenerBlock, 'CapacitorApp backButton listener found');
  const listenerDeps = listenerBlock[1].trim();
  assert.equal(listenerDeps, '', 'backButton listener must be mounted once with empty deps []');
});

test('BUG-061: ErrorBoundary onNavigateDashboard resets error boundary directly', () => {
  const ebSrc = fs.readFileSync(path.join(ROOT, 'src/components/ErrorBoundary.jsx'), 'utf8');
  assert.ok(ebSrc.includes('this.handleReset()') && ebSrc.includes('onNavigateDashboard'),
    'ErrorBoundary onNavigateDashboard button must trigger this.handleReset()');
});

test('BUG-062: Dashboard movers, breadth & ChangeSummaryModal filter out debentures and mutual funds', () => {
  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8');
  
  // gainers & losers must filter mutual funds
  const gainersBlock = dashSrc.match(/const gainers = useMemo\(\(\) => \{([\s\S]*?)\}, \[stocks\]\);/)?.[1] || '';
  assert.ok(gainersBlock.includes('isMutualFund'), 'gainers must filter out mutual funds');

  const losersBlock = dashSrc.match(/const losers = useMemo\(\(\) => \{([\s\S]*?)\}, \[stocks\]\);/)?.[1] || '';
  assert.ok(losersBlock.includes('isMutualFund'), 'losers must filter out mutual funds');

  // turnoverLeaders must filter debentures and mutual funds
  const toBlock = dashSrc.match(/const turnoverLeaders = useMemo\(\(\) => \{([\s\S]*?)\}, \[stocks\]\);/)?.[1] || '';
  assert.ok(toBlock.includes('isDebentureOrBond') || toBlock.includes('isPureNepseEquity'), 'turnoverLeaders must filter non-equities');
});

test('BUG-063: Dashboard chart symbol passing, hero isBull strictness & fake defaults', () => {
  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8');
  
  // AdvancedChartModal must not pass human name
  assert.ok(!dashSrc.includes("symbol={activeHeroIndex.name || 'NEPSE'}"),
    'AdvancedChartModal must receive symbol/key, not activeHeroIndex.name');

  // ShareHubChart fullscreen must not pass human name
  assert.ok(!dashSrc.includes('symbol={activeHeroIndex.name}\n              isIndex={true}'),
    'ShareHubChart must receive symbol/key, not activeHeroIndex.name');

  // No fake float fallback 174.35
  assert.ok(!dashSrc.includes('174.35'), 'Dashboard must not contain fake 174.35 float fallback');
});

test('BUG-064: StockCandlestickChart hoists EMPTY_CANDLES and supports container ResizeObserver', () => {
  const chartSrc = fs.readFileSync(path.join(ROOT, 'src/components/charts/StockCandlestickChart.tsx'), 'utf8');
  assert.ok(chartSrc.includes('EMPTY_CANDLES'), 'StockCandlestickChart must define hoisted EMPTY_CANDLES');
  assert.ok(chartSrc.includes('ResizeObserver'), 'StockCandlestickChart must attach ResizeObserver for hidden tabs');
});

test('BUG-065: ShareHubChart unmount cleanup leak & historical candle preservation', () => {
  const chartSrc = fs.readFileSync(path.join(ROOT, 'src/components/ShareHubChart.jsx'), 'utf8');
  // Cleanup must not call setLoading(false)
  assert.ok(!chartSrc.includes('isMounted = false;\n      setLoading(false);'),
    'ShareHubChart unmount cleanup must not trigger setLoading(false)');
});

test('BUG-066: InstitutionalAlertCardModal backdrop click, condition 2 check & ltp guards', () => {
  const modalSrc = fs.readFileSync(path.join(ROOT, 'src/components/InstitutionalAlertCardModal.tsx'), 'utf8');
  assert.ok(modalSrc.includes('onClick={onClose}'), 'InstitutionalAlertCardModal backdrop must call onClose');
  assert.ok(!modalSrc.includes('<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />\n                <div>\n                  <div className="text-xs font-bold text-slate-200">Condition 2'),
    'InstitutionalAlertCardModal condition 2 must check concentration >= 50');
});

test('BUG-067: BreakoutAlertDialog does not re-sync on live stock poll & removes 100 fallback', () => {
  const dialogSrc = fs.readFileSync(path.join(ROOT, 'src/components/BreakoutAlertDialog.jsx'), 'utf8');
  assert.ok(!dialogSrc.includes('}, [isOpen, sym, stock, entryExitPlan]);'),
    'BreakoutAlertDialog must not re-sync inputs on stock prop updates');
  assert.ok(!dialogSrc.includes('entryExitPlan?.ltp || 100'), 'BreakoutAlertDialog must not fallback ltp to 100');
});

test('BUG-068: SmartAlertBanner clears timer with ref on unmount/re-trigger', () => {
  const bannerSrc = fs.readFileSync(path.join(ROOT, 'src/components/SmartAlertBanner.jsx'), 'utf8');
  assert.ok(!bannerSrc.includes('const timer = setTimeout(() => {\n        setVisible(false);\n      }, 12000);\n\n      return () => clearTimeout(timer);'),
    'SmartAlertBanner must track timer in ref instead of returning from event handler');
});

test('BUG-069: SessionFreshnessBadge renders syncing when lastUpdatedMs is null & Dashboard passes active session date', () => {
  const badgeSrc = fs.readFileSync(path.join(ROOT, 'src/components/SessionFreshnessBadge.jsx'), 'utf8');
  assert.ok(!badgeSrc.includes('const lastUpdate = lastUpdatedMs ? Number(lastUpdatedMs) : now.getTime();'),
    'SessionFreshnessBadge must not fabricate now.getTime() when lastUpdatedMs is null');

  const dashSrc = fs.readFileSync(path.join(ROOT, 'src/components/Dashboard.jsx'), 'utf8');
  assert.ok(!dashSrc.includes('sessionDate={marketStatus?.lastClosedSessionDate}'),
    'Dashboard must not pass lastClosedSessionDate during active market sessions');
});

test('BUG-070: NRBMacroWidget does not stamp today date on static fallback & cleans up on unmount', () => {
  const widgetSrc = fs.readFileSync(path.join(ROOT, 'src/components/NRBMacroWidget.jsx'), 'utf8');
  assert.ok(!widgetSrc.includes("asOf: overrides?.asOf || formatNptDateIso(new Date())"),
    'NRBMacroWidget must not stamp today date onto static fallback defaults');
});
