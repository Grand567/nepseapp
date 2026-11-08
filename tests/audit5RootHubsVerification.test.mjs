import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test('5 Root Hubs & All Cards/Sub-Cards Verification Audit', async (t) => {
  // ── 1. HUB 1: MARKET DASHBOARD (Dashboard.jsx) ──
  await t.test('Hub 1: Market Dashboard - Hero Index, Macro, Breadth, Alpha Desk, Prime Pick, Movers', () => {
    const dashPath = path.resolve('src/components/Dashboard.jsx');
    const content = fs.readFileSync(dashPath, 'utf8');

    // Cards & Sub-cards presence
    assert.ok(content.includes('NRBMacroWidget'), 'NRB Macro Widget card wired');
    assert.ok(content.includes('DataQualityBanner'), 'Data Quality & Telemetry Banner wired');
    assert.ok(content.includes('primeDailyPick'), "Today's Prime Breakout & Buy-Zone Pick card wired");
    assert.ok(content.includes('watchlist-card-section'), 'Unified Watchlist & Breakout Alerts card section wired');
    assert.ok(content.includes('market-movers-section'), 'Tabbed Market Movers section wired');

    // Sub-cards within Movers
    const moverTabs = ['gainers', 'losers', 'turnover', 'volume', 'breakouts', 'next_breakouts'];
    for (const mt of moverTabs) {
      assert.ok(content.includes(`'${mt}'`) || content.includes(`"${mt}"`), `Movers category '${mt}' present`);
    }
  });

  // ── 2. HUB 2: PREDICTOR & QUANT HUB (PredictorHub.jsx) ──
  await t.test('Hub 2: Predictor & Quant Hub - All 5 Subtabs & Tactical Execution Cards', () => {
    const predPath = path.resolve('src/components/PredictorHub.jsx');
    const content = fs.readFileSync(predPath, 'utf8');

    // 5 Primary Subtabs
    const predSubtabs = ['nepse', 'stocks', 'entry_exit', 'short_term_plan', 'macro_sentiment'];
    for (const st of predSubtabs) {
      assert.ok(
        content.includes(`activeTab === '${st}'`) || content.includes(`activeTab === "${st}"`) || content.includes(`id: '${st}'`),
        `Predictor subtab '${st}' wired`
      );
    }

    // Key quantitative cards & sub-cards
    assert.ok(content.includes('generateEntryExitPlan'), 'Entry/Exit plan generation engine wired');
    assert.ok(content.includes('ShortTermProfitPlan') || content.includes('short_term_plan'), 'Short-term profit plan workstation wired');
    assert.ok(content.includes('EntryExitAnalyzer') || content.includes('entry_exit'), 'Entry/Exit analyzer workstation wired');
    assert.ok(content.includes('macroData'), 'Macro & Remittance Sentiment card data wired');
  });

  // ── 3. HUB 3: SERVICES & TOOLS HUB (ServicesHub.tsx & services.tsx) ──
  await t.test('Hub 3: Services & Tools Hub - 90+ Services, Categories, Quick Carousel, Sub-Tools', () => {
    const svcPath = path.resolve('src/components/ServicesHub.tsx');
    const content = fs.readFileSync(svcPath, 'utf8');

    // Pro services set & quick access
    assert.ok(content.includes('PRO_SERVICE_IDS'), 'PRO service tier registry wired');
    assert.ok(content.includes('services-featured-carousel'), 'Featured services carousel wired');
    assert.ok(content.includes('services-graceful-grid'), 'Services grid layout wired');

    // Core sub-service components wired
    assert.ok(content.includes('FloorsheetServiceTab'), 'Floorsheet Service Tab wired');
    assert.ok(content.includes('BrokerFlowDominanceService'), 'Broker Flow Dominance Service wired');
    assert.ok(content.includes('RegulatoryHub'), 'Regulatory Hub Service wired');
    assert.ok(content.includes('TradingViewChartService'), 'TradingView Chart Service wired');
    assert.ok(content.includes('FibonacciCalculatorService'), 'Fibonacci Calculator Service wired');
    assert.ok(content.includes('SeasonalityAnalyticsService'), 'Seasonality Analytics Service wired');
    assert.ok(content.includes('MultibaggerHunterService'), 'Multibagger Hunter Service wired');
  });

  // ── 4. HUB 4: GURU AI ANALYST (AiAnalyst.jsx) ──
  await t.test('Hub 4: Guru AI Analyst - Single-Stock AI, Chat Stream, Paper Sandbox, Cards', () => {
    const aiPath = path.resolve('src/components/AiAnalyst.jsx');
    const content = fs.readFileSync(aiPath, 'utf8');

    // 3 Sub-tabs
    const aiSubtabs = ['stock', 'chat', 'sandbox'];
    for (const st of aiSubtabs) {
      assert.ok(
        content.includes(`activeTab === '${st}'`) || content.includes(`activeTab === "${st}"`) || content.includes(`'${st}'`),
        `AI Analyst subtab '${st}' present`
      );
    }

    // Cards and Sub-cards
    assert.ok(content.includes('TradeExecutionCards'), 'TradeExecutionCards (Entry, Target 1, Target 2, Stop Loss, R:R) wired');
    assert.ok(content.includes('BacktestTransparencyCard'), 'BacktestTransparencyCard (365-day backtest win rate) wired');
    assert.ok(content.includes('summary.cash'), 'Paper Sandbox: Available cash card wired');
    assert.ok(content.includes('summary.openHoldingsValue'), 'Paper Sandbox: Open holdings value card wired');
    assert.ok(content.includes('summary.winRate'), 'Paper Sandbox: Win rate card wired');
  });

  // ── 5. HUB 5: PORTFOLIO & IPO HUB (PortfolioHub.jsx) ──
  await t.test('Hub 5: Portfolio & IPO Hub - Portfolio, Bulk IPO, Accounts, Capital Simulator', () => {
    const portPath = path.resolve('src/components/PortfolioHub.jsx');
    const content = fs.readFileSync(portPath, 'utf8');

    // 4 Subtabs
    const portSubtabs = ['portfolio', 'bulk_ipo', 'accounts', 'simulator'];
    for (const st of portSubtabs) {
      assert.ok(
        content.includes(`subTab === '${st}'`) || content.includes(`subTab === "${st}"`),
        `Portfolio subtab '${st}' present`
      );
    }

    // Core sub-components wired
    assert.ok(content.includes('<Portfolio'), 'Portfolio component wired');
    assert.ok(content.includes('<CapitalRiskSimulatorView'), 'CapitalRiskSimulatorView component wired');
    assert.ok(content.includes('<MeroShareHub'), 'MeroShareHub (Bulk IPO & Accounts) wired');
  });
});
