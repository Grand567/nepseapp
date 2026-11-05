import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test('13 Stock Tabs Comprehensive Destined Function Audit', async (t) => {
  const modalPath = path.resolve('src/components/StockDetailModal.jsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  const staticData = JSON.parse(fs.readFileSync('proxy/data/today_static_analytics.json', 'utf8'));
  const scrips = staticData.scrips || {};
  const testSym = scrips['NABIL'] ? 'NABIL' : Object.keys(scrips)[0];
  const scripData = scrips[testSym];

  // 1. Verify all 13 Tab IDs exist in allTabs configuration
  const tabIds = [
    'overview',
    'broker_analysis',
    'ai_calc',
    'technicals',
    'market_depth',
    'floorsheet',
    'volume_profile',
    'fundamentals',
    'dividends',
    'reports',
    'history',
    'compare',
    'seasonality'
  ];

  for (const tid of tabIds) {
    assert.ok(modalContent.includes(`id: '${tid}'`) || modalContent.includes(`id: "${tid}"`), `Tab ID ${tid} defined in allTabs`);
    assert.ok(modalContent.includes(`activeTab === '${tid}'`) || modalContent.includes(`activeTab === "${tid}"`), `Tab ID ${tid} has render branch`);
  }

  // 2. Tab 1: Overview
  await t.test('Tab 1: Overview - Hero Quote, Operator Floor, Range Sliders, Signals Engine', () => {
    assert.ok(modalContent.includes('evaluateOrderFlowVeto'), 'Order flow veto logic wired');
    assert.ok(modalContent.includes('calculateMultiHorizonTargets'), 'Horizon targets and safe entry zone wired');
    assert.ok(scripData.short_term_static.eod_price_reference.circuit_ceiling > 0, 'SEBON 15% circuit limits verified');
    assert.ok(scripData.short_term_static.smart_money_5d_flow.operator_cost_floor > 0, 'Operator floor verified');
  });

  // 3. Tab 2: Broker Analysis
  await t.test('Tab 2: Broker Analysis - Sub-tabs (brokers, acc_dist, zero_sum)', () => {
    const brokerTabContent = fs.readFileSync('src/components/StockBrokerAnalysisTab.jsx', 'utf8');
    assert.ok(brokerTabContent.includes("activeSubTab === 'brokers'"), 'Sub-tab: brokers present');
    assert.ok(brokerTabContent.includes("activeSubTab === 'acc_dist'"), 'Sub-tab: acc_dist present');
    assert.ok(brokerTabContent.includes("activeSubTab === 'zero_sum'"), 'Sub-tab: zero_sum present');
    assert.ok(scripData.short_term_static.smart_money_5d_flow.bcr3_buy_pct > 0, 'BCR3 computed');
  });

  // 4. Tab 3: AI Guru & Targets
  await t.test('Tab 3: AI Guru & Targets - AiGuruQuantitativeCard, Live Report, Statutory Fee Calc', () => {
    assert.ok(modalContent.includes('<AiGuruQuantitativeCard'), 'AiGuruQuantitativeCard component wired');
    assert.ok(modalContent.includes('calcMode'), 'Instant profit simulator mode wired');
    assert.equal(scripData.long_term_static.statutory_regulatory_fees.sebon_fee_pct, 0.015, 'SEBON fee 0.015%');
    assert.equal(scripData.long_term_static.statutory_regulatory_fees.dp_charge_npr, 25, 'DP charge Rs. 25');
  });

  // 5. Tab 4: Technicals
  await t.test('Tab 4: Technicals - Gauge Speedometer, Oscillators, Wyckoff, Pivots, Fibonacci', () => {
    assert.ok(modalContent.includes('<StockTechnicalGaugeCard'), 'StockTechnicalGaugeCard wired');
    assert.ok(scripData.short_term_static.pivot_points.classic.pp > 0, 'Classic pivots verified');
    assert.ok(scripData.short_term_static.pivot_points.camarilla.h4 > 0, 'Camarilla pivots verified');
    assert.ok(scripData.short_term_static.daily_oscillators.bollinger.is_squeeze !== undefined, 'Bollinger squeeze verified');
  });

  // 6. Tab 5: Market Depth
  await t.test('Tab 5: Market Depth - Level 2 5-level Order Book, Reality Check Divergence', () => {
    assert.ok(modalContent.includes('Level-2 Market Depth Order Book'), 'Order book title present');
    assert.ok(modalContent.includes('brokerAccumPeriod'), 'Multi-horizon broker periods wired');
  });

  // 7. Tab 6: Floorsheet
  await t.test('Tab 6: Floorsheet - Sub-tabs (floorsheet, bulk, price_volume), Export Hub', () => {
    assert.ok(modalContent.includes("floorsheetSubTab === 'floorsheet'"), 'Sub-tab floorsheet present');
    assert.ok(modalContent.includes("floorsheetSubTab === 'bulk'"), 'Sub-tab bulk deals present');
    assert.ok(modalContent.includes("floorsheetSubTab === 'price_volume'"), 'Sub-tab price_volume present');
    assert.ok(modalContent.includes('exportStockFloorsheet'), 'Floorsheet CSV export wired');
  });

  // 8. Tab 7: Volume Profile
  await t.test('Tab 7: Volume Profile (POC) - 5D price-volume distribution & POC nodes', () => {
    assert.ok(modalContent.includes('initialTab="VOLUME_PROFILE"'), 'Volume Profile Hub initialTab wired');
    assert.ok(scripData.short_term_static.smart_money_5d_flow.volume_profile_5d.poc_price > 0, 'POC price verified');
  });

  // 9. Tab 8: Fundamentals
  await t.test('Tab 8: Fundamentals - Sub-tabs (overview, reports, industry, compare)', () => {
    const fundContent = fs.readFileSync('src/components/StockFundamentalsTab.jsx', 'utf8');
    assert.ok(fundContent.includes("subTab === 'overview'"), 'Sub-tab overview present');
    assert.ok(fundContent.includes("subTab === 'reports'"), 'Sub-tab reports present');
    assert.ok(fundContent.includes("subTab === 'industry'"), 'Sub-tab industry present');
    assert.ok(fundContent.includes("subTab === 'compare'"), 'Sub-tab compare present');
    assert.ok(scripData.long_term_static.valuation_models.graham_intrinsic_value > 0, 'Graham fair value verified');
  });

  // 10. Tab 9: Dividends & Rights
  await t.test('Tab 9: Dividends & Rights - Breaking Notice, StockRightShareCard, DividendHistoryPanel', () => {
    assert.ok(modalContent.includes('<StockRightShareCard'), 'StockRightShareCard wired');
    assert.ok(modalContent.includes('<DividendHistoryPanel'), 'DividendHistoryPanel wired');
    assert.ok(scripData.long_term_static.dividend_track_record.avg_5y_bonus_pct !== undefined, 'Dividend track record verified');
  });

  // 11. Tab 10: Reports & News
  await t.test('Tab 10: Reports & News - Sub-tabs (reports, news, announcements)', () => {
    const repContent = fs.readFileSync('src/components/StockReportsAnnouncementsCard.jsx', 'utf8');
    assert.ok(repContent.includes("activeTab === 'reports'"), 'Sub-tab reports present');
    assert.ok(repContent.includes("activeTab === 'news'"), 'Sub-tab news present');
    assert.ok(repContent.includes("activeTab === 'announcements'"), 'Sub-tab announcements present');
  });

  // 12. Tab 11: Price History & Charts
  await t.test('Tab 11: Price History & Charts - Latest Close, 1Y Summary, ShareHubChart, OHLCV Table', () => {
    assert.ok(modalContent.includes('Latest / Today Closing Detail'), 'Latest close header present');
    assert.ok(modalContent.includes('<ShareHubChart'), 'ShareHubChart component wired');
    assert.ok(modalContent.includes('exportStockPriceHistory'), 'Price history CSV export wired');
  });

  // 13. Tab 12: Compare Peers
  await t.test('Tab 12: Compare Peers - Peer Autocomplete, Today Rows, Perf Rows, Fund Rows', () => {
    assert.ok(modalContent.includes('todayRows = ['), 'Today metrics table defined');
    assert.ok(modalContent.includes('perfRows = ['), 'Multi-horizon performance table defined');
    assert.ok(modalContent.includes('fundRows = ['), 'Fundamental head-to-head table defined');
  });

  // 14. Tab 13: Seasonality
  await t.test('Tab 13: Seasonality - Bikram Sambat 12-Month Seasonality Heatmap', () => {
    assert.ok(modalContent.includes('<StockSeasonalityCard'), 'StockSeasonalityCard wired');
    assert.equal(scripData.long_term_static.macro_10y_seasonality.seasonality_matrix_12m.length, 12, '12 BS months present');
  });
});
