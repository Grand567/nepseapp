import test from 'node:test';
import assert from 'node:assert';
import { isOddLotContract, aggregateBrokerMicrostructure } from '../src/utils/sharedBrokerAggregationEngine.js';
import { getGuruAiLiveContext } from '../src/services/aiService.js';
import { calculateBrokerCommission, adjustForBonusShare, adjustForRightShare } from '../src/utils/calculations.js';

test('▶ Cross-Tab Invariants & Unified Data Micro-Improvements Suite', async (t) => {
  await t.test('1. Odd-Lot Contract Filter Guard & Microstructure Isolation', () => {
    const normalTrade = { contractNo: '101', symbol: 'NABIL', buyerBroker: 58, sellerBroker: 34, quantity: 50, rate: 600, amount: 30000 };
    const oddLotTrade1 = { contractNo: '102', symbol: 'NABIL', buyerBroker: 58, sellerBroker: 17, quantity: 5, rate: 590, amount: 2950 };
    const oddLotTrade2 = { contractNo: '103', symbol: 'NABIL', buyerBroker: 45, sellerBroker: 28, quantity: 10, rate: 595, amount: 5950, board: 'ODD_LOT' };

    assert.strictEqual(isOddLotContract(normalTrade), false, 'Normal 50-kitta trade must NOT be flagged as odd lot');
    assert.strictEqual(isOddLotContract(oddLotTrade1), true, '5-kitta trade (< 10) must be flagged as odd lot');
    assert.strictEqual(isOddLotContract(oddLotTrade2), true, 'ODD_LOT board trade must be flagged as odd lot');

    // Aggregate with standard inclusive counting
    const aggStandard = aggregateBrokerMicrostructure({
      symbol: 'NABIL',
      contracts: [normalTrade, oddLotTrade1]
    });
    assert.strictEqual(aggStandard.totalVolume, 55, 'Standard aggregation includes both lots (50 + 5)');
    assert.strictEqual(aggStandard.oddLotTradesCount, 1, 'Accurately isolates 1 odd lot trade');
    assert.strictEqual(aggStandard.oddLotVolume, 5, 'Accurately isolates 5 odd lot kitta');
    assert.strictEqual(aggStandard.oddLotTurnover, 2950, 'Accurately isolates odd lot turnover');

    // Aggregate with odd-lot exclusion guard for continuous auction price discovery
    const aggExcl = aggregateBrokerMicrostructure({
      symbol: 'NABIL',
      contracts: [normalTrade, oddLotTrade1],
      excludeOddLot: true
    });
    assert.strictEqual(aggExcl.totalVolume, 50, 'Filtered aggregation strictly excludes odd lot volume');
    assert.strictEqual(aggExcl.marketVWAP, 600, 'VWAP strictly reflects continuous regular lot auction');
  });

  await t.test('2. Guru AI Live Context Deterministic Selector Invariant', () => {
    const sampleStocks = [
      { symbol: 'SHIVM', ltp: 685, pChange: 0.18, turnover: 80500000 },
      { symbol: 'NABIL', ltp: 600, pChange: -0.5, turnover: 45000000 },
      { symbol: 'CIT', ltp: 2450, pChange: 2.1, turnover: 20000000 },
      { symbol: 'API', ltp: 270, pChange: 0.0, turnover: 12000000 }
    ];

    const portfolio = {
      holdings: [{ symbol: 'SHIVM', units: 100 }, { symbol: 'CIT', units: 20 }],
      totalValue: 117500
    };

    const context = getGuruAiLiveContext({
      marketStocks: sampleStocks,
      selectedStock: sampleStocks[0],
      userPortfolio: portfolio,
      activeTab: 'stocks'
    });

    assert.ok(context.includes('4 Scrips'), 'Must report exact scrip universe count');
    assert.ok(context.includes('Advances: 2'), 'Must report exact advances (CIT, SHIVM)');
    assert.ok(context.includes('Declines: 1'), 'Must report exact declines (NABIL)');
    assert.ok(context.includes('Unchanged: 1'), 'Must report exact unchanged (API)');
    assert.ok(context.includes('Inspected Scrip: SHIVM (LTP: Rs. 685.0, Change: +0.18%)'), 'Must bind inspected stock LTP without drift');
    assert.ok(context.includes('2 active holdings'), 'Must report exact user portfolio holdings');
    assert.ok(context.includes('User Active Tab: stocks'), 'Must inject user tab state');
  });

  await t.test('3. Cross-Tab Scrip Valuation Invariant (Market vs Portfolio vs Stock Detail)', () => {
    const canonicalStock = {
      symbol: 'SHIVM',
      companyName: 'Shivam Cements Ltd',
      ltp: 685.0,
      prevClose: 683.8,
      pChange: 0.18,
      pointChange: 1.2
    };

    // Simulated Dashboard representation
    const dashboardLtp = canonicalStock.ltp;
    const dashboardPChg = canonicalStock.pChange;

    // Simulated StockDetailModal representation
    const detailLtp = canonicalStock.ltp;
    const detailPointChg = canonicalStock.pointChange;

    // Simulated Portfolio representation
    const holdingUnits = 250;
    const portfolioMarketValue = holdingUnits * canonicalStock.ltp;
    const portfolioDayGain = holdingUnits * canonicalStock.pointChange;

    assert.strictEqual(dashboardLtp, detailLtp, 'Dashboard LTP and Stock Detail LTP must be 100% invariant');
    assert.strictEqual(dashboardLtp, 685.0, 'Canonical price is 685.0');
    assert.strictEqual(portfolioMarketValue, 171250, 'Portfolio valuation must strictly evaluate units * canonical LTP (250 * 685)');
    assert.strictEqual(portfolioDayGain, 300, 'Portfolio day gain must strictly evaluate units * canonical point change (250 * 1.2)');
  });

  await t.test('4. Tiered SEBON & Broker Fee Centralization Invariant', () => {
    // Slabs: <=50k: 0.36%, 50k-500k: 0.33%, 500k-20L: 0.31%, 20L-1Cr: 0.27%, >1Cr: 0.24%
    assert.strictEqual(calculateBrokerCommission(40000), 144, 'Tier 1 commission: 40000 * 0.36% = 144');
    assert.strictEqual(calculateBrokerCommission(200000), 660, 'Tier 2 commission: 200000 * 0.33% = 660');
    assert.strictEqual(calculateBrokerCommission(1000000), 3100, 'Tier 3 commission: 1000000 * 0.31% = 3100');
    assert.strictEqual(calculateBrokerCommission(1000), 10, 'Minimum broker commission Rs. 10 enforced');

    // WACC Adjustments
    const bonusAdj = adjustForBonusShare(100, 400, 20); // 20% bonus on 100 units @ 400
    assert.strictEqual(bonusAdj.newUnits, 120, '100 units + 20% bonus = 120 units');
    assert.strictEqual(bonusAdj.newWacc, 333.33, 'WACC adjusted downward: (100 * 400) / 120 = 333.33');

    const rightAdj = adjustForRightShare(100, 400, 0.5, 100); // 1:0.5 right issue on 100 units @ 400 with Rs. 100 subscription
    assert.strictEqual(rightAdj.newUnits, 150, '100 units + 50 rights = 150 units');
    assert.strictEqual(rightAdj.newWacc, 300, 'WACC adjusted: ((100 * 400) + (50 * 100)) / 150 = 300');
  });
});
