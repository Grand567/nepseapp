// tests/swingTradeSelectorView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateMarketRegimeGate,
  evaluateStockSwingGates,
  screenUniverseForSwingPicks,
  GATE_NAMES
} from '../src/utils/swingGateEvaluator.js';

test('Swing Trade Selector - Backtest Results Data Audit', async (t) => {
  const dataPath = path.join(process.cwd(), 'src', 'data', 'swingBacktestResults.json');
  assert.ok(fs.existsSync(dataPath), 'swingBacktestResults.json must exist');

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  await t.test('enforces official fiduciary verdict: NO EDGE', () => {
    assert.equal(data.verdict, 'NO EDGE: do not trade this system');
    assert.match(data.verdictReason, /NO PROVEN EDGE AFTER COSTS/i);
    assert.match(data.verdictReason, /paper-trading mode/i);
  });

  await t.test('reports negative expectancy and cost drag honestly', () => {
    assert.ok(data.fullSystem.profitFactor < 1.0, 'Profit factor must be < 1.0');
    assert.ok(data.fullSystem.netPnLNpr < 0, 'Net PnL must be negative');
    assert.ok(data.fullSystem.totalFrictionNpr > 50000, 'Total friction must reflect true statutory costs');
    assert.equal(data.fullSystem.totalTrades, 40);
  });

  await t.test('confirms ablation proof: Gate 2 defends against 4x worse losses', () => {
    const fullNetLoss = Math.abs(data.fullSystem.netPnLNpr);
    const noRegimeNetLoss = Math.abs(data.ablations.noRegimeSystem.netPnLNpr);
    assert.ok(
      noRegimeNetLoss > fullNetLoss * 3,
      `Trading without regime filter should multiply losses significantly (${noRegimeNetLoss} vs ${fullNetLoss})`
    );
  });

  await t.test('provides granular per-stock closed trade records for deep-dive inspection', () => {
    assert.ok(Array.isArray(data.closedTrades));
    assert.equal(data.closedTrades.length, 40);

    const firstTrade = data.closedTrades[0];
    assert.ok(firstTrade.symbol, 'Must contain stock symbol');
    assert.ok(firstTrade.signalDate, 'Must have signalDate');
    assert.ok(firstTrade.entryDate, 'Must have entryDate');
    assert.ok(firstTrade.exitDate, 'Must have exitDate');
    assert.ok(firstTrade.entryPrice > 0, 'Must have valid entryPrice');
    assert.ok(firstTrade.exitPrice > 0, 'Must have valid exitPrice');
    assert.ok(firstTrade.exitReason, 'Must have explicit exitReason');
    assert.ok(firstTrade.frictionNpr > 0, 'Must record deducted broker/SEBON/DP fees');
  });
});

test('Swing Trade Selector - UI Gating & Defense Integration', async (t) => {
  await t.test('GATE_NAMES defines exactly 7 canonical gates', () => {
    assert.equal(GATE_NAMES.length, 7);
    assert.equal(GATE_NAMES[1], 'Market Regime (>50 EMA)');
    assert.equal(GATE_NAMES[6], 'Net R:R >= 2:1 After Costs');
  });

  await t.test('evaluates defensive capital protection when market is bearish', () => {
    const stocks = [
      { symbol: 'NABIL', ltp: 580, pChange: -2.5, turnover: 20000000 },
      { symbol: 'SHIVM', ltp: 520, pChange: -3.1, turnover: 15000000 }
    ];
    const bearMarket = {
      nepseIndex: 2400,
      nepseEma20: 2500,
      nepseEma50: 2580,
      advancers: 35,
      decliners: 210,
      dailyChangePct: -1.8
    };

    const res = screenUniverseForSwingPicks(stocks, bearMarket);
    assert.equal(res.isDefensiveCashMode, true);
    assert.equal(res.statusHeadline, 'NO TRADE TODAY — CAPITAL DEFENSE ACTIVE');
    assert.equal(res.shortlist.length, 0);
  });

  await t.test('verifies ServicesHub registration and import integrity', () => {
    const hubContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'ServicesHub.tsx'), 'utf8');
    assert.ok(hubContent.includes('SwingTradeSelectorView'), 'ServicesHub must import SwingTradeSelectorView');
    assert.ok(hubContent.includes('swing-trade-selector'), 'ServicesHub must register swing-trade-selector service ID');
  });
});
