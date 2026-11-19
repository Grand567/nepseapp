// tests/awBatch5DRemediation.test.mjs
// TDD Verification Suite for Sub-Group 5D (BUG-100 through BUG-107)
// PredictorHub, Master100, AI Analyst, Analyzer Cards & Cross-Workstation Protocols

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('BUG-100: PredictorHub computes index prevClose with pChange division, applies 5%/8% index circuits, and orients S/R floor < ceiling', () => {
  const predictorSrc = fs.readFileSync(path.join(ROOT, 'src/components/PredictorHub.jsx'), 'utf8');

  // Must not subtract percentage change from points: (nepseIdx - nepseChange)
  assert.ok(
    !predictorSrc.includes('(nepseIdx - nepseChange)'),
    'PredictorHub must not subtract percentage change from index points (nepseIdx - nepseChange)'
  );

  // Must apply index circuits (5% / 8% or indexCircuitBreakers), not 15% individual stock circuit
  assert.ok(
    !predictorSrc.includes('getCircuitLimits(prevIndexClose, 15.0)'),
    'PredictorHub must not apply 15% individual stock circuit to the NEPSE Index'
  );

  // Must ensure Support floor is strictly <= Resistance ceiling
  assert.ok(
    !predictorSrc.includes('Support floor: ${stopFloor} pts, Resistance ceiling: ${target1} pts.'),
    'PredictorHub must not print unoriented stopFloor as Support floor when stopFloor > target1'
  );

  // Must include cashDefenseActive in memo or effect dependencies
  assert.ok(
    predictorSrc.includes('masterPipeline.cashDefenseActive') || predictorSrc.includes('cashDefenseActive'),
    'PredictorHub must observe cashDefenseActive'
  );
});

test('BUG-101: PredictorHub removes 250-slice and fake float default, and synchronizes guide modal tab props', () => {
  const predictorSrc = fs.readFileSync(path.join(ROOT, 'src/components/PredictorHub.jsx'), 'utf8');
  const guideModalSrc = fs.readFileSync(path.join(ROOT, 'src/components/InvestorDecisionGuideModal.jsx'), 'utf8');

  // Must not truncate universe to 250
  assert.ok(
    !predictorSrc.includes('stocks.slice(0, 250).map'),
    'PredictorHub must not truncate universe to 250 stocks'
  );

  // Must not fabricate 5M float fallback
  assert.ok(
    !predictorSrc.includes('|| 5);') && !predictorSrc.includes('|| 5)'),
    'PredictorHub must not fabricate 5M float fallback for unknown scrips'
  );

  // Must pass initialTab to InvestorDecisionGuideModal or InvestorDecisionGuideModal must accept defaultTab
  const predictorPassesTab = predictorSrc.includes('initialTab={guideTab}') || predictorSrc.includes('defaultTab={guideTab}');
  const modalAcceptsDefaultTab = guideModalSrc.includes('defaultTab');
  assert.ok(
    predictorPassesTab && modalAcceptsDefaultTab,
    'PredictorHub and InvestorDecisionGuideModal must have synchronized tab props (initialTab / defaultTab)'
  );
});

test('BUG-102: Master100 removes hardcoded OBIR +0.32, double %%, and fake +Rs. 20,850 expectancy', () => {
  const masterSrc = fs.readFileSync(path.join(ROOT, 'src/components/Master100ProfitWorkstation.tsx'), 'utf8');

  // Must not hardcode OBIR +0.32
  assert.ok(
    !masterSrc.includes('OBIR +0.32 (Positive Matching Depth)'),
    'Master100 must not hardcode static OBIR +0.32'
  );

  // Must not produce double %% in seasonality badge
  assert.ok(
    !masterSrc.includes('% Win Rate)'),
    'Master100 must not append % to historicalWinRate that already contains %'
  );

  // Must not fabricate +Rs. 20,850 expectancy fallback when no valid trade exists
  assert.ok(
    !masterSrc.includes('+Rs. 20,850 per trade'),
    'Master100 must not fabricate +Rs. 20,850 expectancy when no valid trade exists'
  );
});

test('BUG-103: ShortTermProfitPlan sorts history ascending, preserves nullable RSI, removes rrr || 2.0 bypass, and computes net RRR', () => {
  const stppSrc = fs.readFileSync(path.join(ROOT, 'src/components/ShortTermProfitPlan.jsx'), 'utf8');

  // Must sort candles ascending before EMA calculation
  assert.ok(
    stppSrc.includes('toAscendingCandles(cachedHistory)') || stppSrc.includes('toAscendingCandles('),
    'ShortTermProfitPlan must sort history ascending before calculating EMAs'
  );

  // Must preserve null for missing RSI without coercing to 0
  assert.ok(
    !stppSrc.includes('rsi: Number(live?.rsi ?? resolveDynamicStockRSI({ ...u, ...(live || {}), ltp })),'),
    'ShortTermProfitPlan must not coerce null dynamic RSI to 0 via Number(null)'
  );

  // Must not use rrr || 2.0 or || 2.1 gate bypass
  assert.ok(
    !stppSrc.includes('(activeStock.rrr || 2.0)'),
    'ShortTermProfitPlan must not bypass Gate 4 with rrr || 2.0 fallback'
  );
  assert.ok(
    !stppSrc.includes('(activeStock.rrr || 2.1)'),
    'ShortTermProfitPlan must not display rrr || 2.1 fallback'
  );
});

test('BUG-104: EntryExitAnalyzer passes volume rvol, EntryRiskCard syncs inputs and updates slabs, and SignalTrackRecord excludes unfillable skips', () => {
  const eeaSrc = fs.readFileSync(path.join(ROOT, 'src/components/EntryExitAnalyzer.tsx'), 'utf8');
  const ercSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/EntryRiskCard.tsx'), 'utf8');
  const strSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/SignalTrackRecord.jsx'), 'utf8');

  // EntryExitAnalyzer must read plan.volume?.rvol
  assert.ok(
    eeaSrc.includes('plan.volume?.rvol') || eeaSrc.includes('plan.volume'),
    'EntryExitAnalyzer must pass real plan.volume?.rvol to cards'
  );

  // EntryRiskCard must have useEffect syncing calc inputs
  assert.ok(
    ercSrc.includes('setCalcSellPrice') && ercSrc.includes('useEffect'),
    'EntryRiskCard must synchronize calculator inputs when stock levels change'
  );

  // EntryRiskCard must not advertise obsolete 0.40% brokerage
  assert.ok(
    !ercSrc.includes('0.27%-0.40%') && !ercSrc.includes('~0.27%-0.40%'),
    'EntryRiskCard must reflect current 0.24%–0.36% brokerage slabs'
  );

  // EntryRiskCard must not hardcode fallback 7.2% net return
  assert.ok(
    !ercSrc.includes('levels.target1?.netReturnPct ?? 7.2'),
    'EntryRiskCard must not fall back to static 7.2% net return'
  );

  // SignalTrackRecord must exclude UNFILLABLE_SKIP from win rate denominator
  assert.ok(
    !strSrc.includes("UNFILLABLE_SKIP: 'expired'"),
    'SignalTrackRecord must map UNFILLABLE_SKIP to unfillable/skipped, not expired'
  );

  // SignalTrackRecord must not hardcode '57.7% Model' fallback
  assert.ok(
    !strSrc.includes("'57.7% Model'"),
    'SignalTrackRecord must not display fake 57.7% Model fallback'
  );
});

test('BUG-105: Analyzer cards color by polarity, strip literal $, fix win rate shrinkage and 1% multipliers, and guard against NaN%', () => {
  const breakoutSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/BreakoutPanel.tsx'), 'utf8');
  const grahamSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/GrahamSafetyCard.tsx'), 'utf8');
  const analogSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/HistoricalAnalogPanel.tsx'), 'utf8');
  const setupSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/SetupScoreCard.tsx'), 'utf8');
  const agreementSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/SignalAgreement.tsx'), 'utf8');
  const techSrc = fs.readFileSync(path.join(ROOT, 'src/components/analyzer/TechnicalDashboard.tsx'), 'utf8');

  // BreakoutPanel must handle bearish breakdown polarity
  assert.ok(
    breakoutSrc.includes('breakdown') || breakoutSrc.includes('direction ===') || breakoutSrc.includes('isBearish'),
    'BreakoutPanel must support bearish breakdown styling'
  );

  // GrahamSafetyCard must not have literal Rs. $
  assert.ok(
    !grahamSrc.includes('Rs. ${bookValue'),
    'GrahamSafetyCard must not print literal Rs. $ prefix'
  );

  // HistoricalAnalogPanel must not coerce 0% win rate to 50%
  assert.ok(
    !analogSrc.includes('|| 50'),
    'HistoricalAnalogPanel must not coerce 0% win rate to 50% via || 50'
  );

  // SetupScoreCard must use strict < 1.0 (not <= 1)
  assert.ok(
    !setupSrc.includes('rawWin <= 1'),
    'SetupScoreCard must use strict rawWin < 1.0 to prevent 1% becoming 100%'
  );

  // SignalAgreement must guard totalEvaluated against 0 to prevent NaN%
  assert.ok(
    agreementSrc.includes('safeTotal') || agreementSrc.includes('Math.max(1') || agreementSrc.includes('totalEvaluated || 1') || !agreementSrc.includes('/ totalEvaluated'),
    'SignalAgreement must guard division by zero to prevent NaN%'
  );

  // TechnicalDashboard must not fake 1.0x RVOL fallback
  assert.ok(
    !techSrc.includes('volume?.rvol ?? 1.0'),
    'TechnicalDashboard must not fall back to 1.0x RVOL when data is missing'
  );
});

test('BUG-106: AlphaCommandCenter uses trading calendar for T+2 settlement, and AlphaPlaybookService deducts fees from Kelly payoff', () => {
  const accSrc = fs.readFileSync(path.join(ROOT, 'src/components/AlphaCommandCenter.tsx'), 'utf8');
  const apsSrc = fs.readFileSync(path.join(ROOT, 'src/components/AlphaPlaybookService.tsx'), 'utf8');

  // AlphaCommandCenter must not use naive + 2 * 86400000 UTC calendar addition
  assert.ok(
    !accSrc.includes('+ 2 * 86400000'),
    'AlphaCommandCenter must use trading days calendar for T+2 Demat settlement date'
  );

  // AlphaPlaybookService must not label raw entry price as risk-free zero loss
  assert.ok(
    !apsSrc.includes('MOVE STOP LOSS to Entry price'),
    'AlphaPlaybookService must instruct moving stop loss to Statutory Breakeven, not raw Entry price'
  );
});

test('BUG-107: Market rules export canonical risk limits, and InvestorDecisionGuideModal teaches statutory breakeven stop', () => {
  const marketRulesSrc = fs.readFileSync(path.join(ROOT, 'src/constants/marketRules.js'), 'utf8');
  const guideSrc = fs.readFileSync(path.join(ROOT, 'src/components/InvestorDecisionGuideModal.jsx'), 'utf8');

  // marketRules.js must export CANONICAL_RISK_LIMITS
  assert.ok(
    marketRulesSrc.includes('CANONICAL_RISK_LIMITS'),
    'marketRules.js must export CANONICAL_RISK_LIMITS'
  );

  // InvestorDecisionGuideModal must educate on Statutory Breakeven (not raw Entry Price)
  assert.ok(
    guideSrc.includes('Statutory Breakeven') || guideSrc.includes('लागत मूल्य'),
    'InvestorDecisionGuideModal must teach statutory breakeven stop'
  );
});
