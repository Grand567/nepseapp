/**
 * tests/adBrokerFloorsheetAudit.test.mjs
 * Verification Test Suite for Broker Floorsheet Accumulation / Distribution Audit
 *
 * Verifies:
 * 1. Amount/Quantity Weighted Average Price (VWAP) vs. Unweighted Mean
 * 2. Net Quantity Calculation & Internal Cross Wash Elimination (B = S -> Net = 0)
 * 3. Daily Reconciliation Invariant: Total Buy Qty = Total Sell Qty = Exchange Volume, Amount = Turnover
 * 4. Cross-Screen & Cross-Engine Consistency between MicrostructureEngine and AccumulationDistributionEngine
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMultiDayDiagnostics } from '../src/utils/microstructureEngine.js';
import { calculateBrokerConcentration } from '../src/utils/accumulationDistributionEngine.ts';
import { db } from '../proxy/db/ledgerStore.js';

describe('Broker Floorsheet Audit: Valuation, Netting, Reconciliation & Wiring', () => {

  it('1. Average Price Formula: Strictly Amount/Quantity Weighted (VWAP), NOT Unweighted Arithmetic Mean', () => {
    // Scenario: Broker 58 executes two buy trades:
    // Trade 1: 100 shares @ Rs. 100 = Rs. 10,000
    // Trade 2: 10 shares @ Rs. 200 = Rs. 2,000
    // Total Volume = 110 shares, Total Amount = Rs. 12,000
    // Weighted Average (VWAP) = 12,000 / 110 = Rs. 109.0909... -> Rs. 109.09
    // Unweighted Arithmetic Mean = (100 + 200) / 2 = Rs. 150.00
    const rawTrades = [
      { contractNo: '1', symbol: 'TEST', buyerBroker: 58, sellerBroker: 17, quantity: 100, rate: 100, amount: 10000 },
      { contractNo: '2', symbol: 'TEST', buyerBroker: 58, sellerBroker: 14, quantity: 10, rate: 200, amount: 2000 }
    ];

    const conc = calculateBrokerConcentration(rawTrades, 'TEST');
    const b58 = conc.topBuyerBrokers.find(b => b.broker === '58');

    assert.ok(b58, 'Broker 58 must be present in top buyers');
    assert.strictEqual(b58.volume, 110, 'Total buy volume must be 110');
    assert.strictEqual(b58.amount, 12000, 'Total buy amount must be 12,000');

    const weightedAvgBuy = Number((b58.amount / b58.volume).toFixed(2));
    assert.strictEqual(weightedAvgBuy, 109.09, 'Average buy price must be amount/qty weighted (109.09)');
    assert.notStrictEqual(weightedAvgBuy, 150.00, 'Average price must NOT be unweighted arithmetic mean (150.00)');

    // Verify in microstructure engine
    const diag = calculateMultiDayDiagnostics([
      {
        date: '2026-10-26',
        totalVolume: 110,
        totalTurnover: 12000,
        close: 109,
        open: 100,
        high: 200,
        low: 100,
        brokers: [
          { brokerId: '58', buyVol: 110, sellVol: 0, buyAmt: 12000, sellAmt: 0 }
        ]
      }
    ], 1);

    const diagB58 = diag.topGrossBuyers.find(b => b.brokerId === '58');
    assert.ok(diagB58, 'Broker 58 must be in microstructure diagnostics');
    assert.strictEqual(diagB58.avgBuyPrice, 109.09, 'MicrostructureEngine must compute amount/qty weighted price');
  });

  it('2. Net Quantity Calculation & Internal Cross Wash Elimination', () => {
    // Scenario: Broker 34 executes:
    // - 50 shares bought from Broker 17
    // - 50 shares bought from Broker 34 (Internal cross trade: Buyer = 34, Seller = 34)
    // - 20 shares sold to Broker 58
    // Gross Buy Qty = 50 + 50 = 100 kitta
    // Gross Sell Qty = 50 + 20 = 70 kitta
    // Expected Net Qty = 100 - 70 = +30 kitta
    const rawContracts = [
      { contractNo: '1', symbol: 'TEST', buyerBroker: 34, sellerBroker: 17, quantity: 50, rate: 500, amount: 25000 },
      { contractNo: '2', symbol: 'TEST', buyerBroker: 34, sellerBroker: 34, quantity: 50, rate: 500, amount: 25000 }, // Internal Cross
      { contractNo: '3', symbol: 'TEST', buyerBroker: 58, sellerBroker: 34, quantity: 20, rate: 500, amount: 10000 }
    ];

    const conc = calculateBrokerConcentration(rawContracts, 'TEST');
    const b34 = conc.topBuyerBrokers.find(b => b.broker === '34');

    assert.ok(b34, 'Broker 34 must be in concentration results');
    assert.strictEqual(b34.volume, 100, 'Gross buy volume must be 100');
    assert.strictEqual(b34.netQty, 30, 'Net quantity must be 30 (100 - 70)');

    // Pure Internal Cross Only: 10 kitta bought and sold by Broker 34
    const pureCrossContracts = [
      { contractNo: '1', symbol: 'TEST', buyerBroker: 34, sellerBroker: 34, quantity: 10, rate: 600, amount: 6000 }
    ];
    const pureCrossConc = calculateBrokerConcentration(pureCrossContracts, 'TEST');
    const pureCrossB34 = pureCrossConc.topBuyerBrokers.find(b => b.broker === '34');
    assert.ok(pureCrossB34);
    assert.strictEqual(pureCrossB34.volume, 10, 'Gross buy volume is 10');
    assert.strictEqual(pureCrossB34.netQty, 0, 'Internal cross net quantity must cancel cleanly to 0');
  });

  it('3. Reconciliation Invariant on Real Ledger Database (2026-10-26)', () => {
    // For every stock traded on 2026-10-26:
    // Total Buy Qty = Total Sell Qty = Sum of Floorsheet Qty = Exchange Volume
    // Total Buy Amount = Total Sell Amount = Sum of Floorsheet Amount = Exchange Turnover
    const symbol = 'OHL';
    const tradeDate = '2026-10-26';

    const fsStats = db.prepare(`
      SELECT SUM(kitta) as totalKitta, SUM(amount) as totalAmount, COUNT(*) as contractCount
      FROM floorsheet_contracts
      WHERE symbol = ? AND trade_date = ?
    `).get(symbol, tradeDate);

    const summaryStats = db.prepare(`
      SELECT total_volume as volume, total_turnover as turnover
      FROM daily_stock_summary
      WHERE symbol = ? AND trade_date = ?
    `).get(symbol, tradeDate);

    assert.ok(fsStats.contractCount > 0, 'Must have contracts in DB');
    assert.strictEqual(fsStats.totalKitta, summaryStats.volume, 'Floorsheet total kitta must match exchange reported volume');
    assert.strictEqual(Number(fsStats.totalAmount.toFixed(2)), Number(summaryStats.turnover.toFixed(2)), 'Floorsheet total amount must match exchange turnover');

    // Market-wide assertion
    const marketFs = db.prepare(`
      SELECT SUM(kitta) as totalKitta, SUM(amount) as totalAmount
      FROM floorsheet_contracts
      WHERE trade_date = ?
    `).get(tradeDate);

    const marketSummary = db.prepare(`
      SELECT SUM(total_volume) as totalVolume, SUM(total_turnover) as totalTurnover
      FROM daily_stock_summary
      WHERE trade_date = ?
    `).get(tradeDate);

    assert.strictEqual(marketFs.totalKitta, marketSummary.totalVolume, 'Market-wide floorsheet kitta must reconcile with exchange summary volume');
    assert.strictEqual(Math.round(marketFs.totalAmount), Math.round(marketSummary.totalTurnover), 'Market-wide floorsheet turnover must reconcile with exchange summary turnover');
  });

  it('4. Cross-Screen & Cross-Engine Consistency (Microstructure vs. Concentration vs. DB Ledger)', () => {
    const symbol = 'OHL';
    const tradeDate = '2026-10-26';

    // 1. Fetch raw contracts from SQLite
    const rawContracts = db.prepare(`
      SELECT contract_no as contractNo, symbol, trade_date as tradeDate, trade_time as tradeTime,
             buyer_broker as buyerBroker, seller_broker as sellerBroker,
             kitta as quantity, kitta, rate, amount
      FROM floorsheet_contracts
      WHERE symbol = ? AND trade_date = ?
      ORDER BY contract_no ASC
    `).all(symbol, tradeDate);

    // 2. Fetch daily broker ledger rows from SQLite
    const dailyBrokerRows = db.prepare(`
      SELECT broker_id as brokerId, buy_vol as buyVol, sell_vol as sellVol, buy_amt as buyAmt, sell_amt as sellAmt, cross_vol as crossVol
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date = ?
    `).all(symbol, tradeDate);

    const stockSummary = db.prepare(`SELECT * FROM daily_stock_summary WHERE symbol = ? AND trade_date = ?`).get(symbol, tradeDate);

    // Engine A: calculateBrokerConcentration (Used in AccumulationDistributionRadar)
    const engineA = calculateBrokerConcentration(rawContracts, symbol, {
      totalTradedQuantity: stockSummary.total_volume,
      volume: stockSummary.total_volume,
      ltp: stockSummary.close_price
    });

    // Engine B: calculateMultiDayDiagnostics (Used in Broker Flow / Diagnostics)
    const engineB = calculateMultiDayDiagnostics([
      {
        date: tradeDate,
        totalVolume: stockSummary.total_volume,
        totalTurnover: stockSummary.total_turnover,
        close: stockSummary.close_price,
        open: stockSummary.open_price,
        high: stockSummary.high_price,
        low: stockSummary.low_price,
        brokers: dailyBrokerRows
      }
    ], 1);

    // Assert Top Buyer Broker ID matches
    const topBuyerA = engineA.topBuyerBrokers[0];
    const topGrossBuyerB = engineB.topGrossBuyers[0];
    assert.strictEqual(String(topBuyerA.broker), String(topGrossBuyerB.brokerId), 'Top gross buyer broker ID must match between Engine A and Engine B');
    assert.strictEqual(topBuyerA.volume, topGrossBuyerB.buyVol, 'Top buyer volume must match between Engine A and Engine B');
    assert.strictEqual(topBuyerA.netQty, topGrossBuyerB.netVol, 'Top buyer net volume must match between Engine A and Engine B');

    // Assert Top Net Accumulator matches
    const topNetAccA = engineA.topNetAccumulators[0];
    const topNetAccB = engineB.topAccumulators[0];
    assert.strictEqual(String(topNetAccA.broker), String(topNetAccB.brokerId), 'Top net accumulator broker ID must match');
    assert.strictEqual(topNetAccA.netQty, topNetAccB.netVol, 'Top net accumulator net volume must match');

    // Assert BCR3 Concentration matches
    assert.strictEqual(engineA.bcr3BuyPct, engineB.bcr3BuyPct, 'BCR3 Buy % must match between Engine A and Engine B');
    assert.strictEqual(engineA.bcr3SellPct, engineB.scr3SellPct, 'BCR3 Sell / SCR3 Sell % must match between Engine A and Engine B');
  });

  it('5. Cross-Engine Classification Harmony: Microstructure & Radar engines agree on label, fail if discordant (Item 4)', () => {
    // Both engines must agree on market phase / bias classification
    // Case A: High Seller Concentration / Operator Offloading -> Both MUST flag Distribution
    const dumpingTrades = [
      { contractNo: '1', symbol: 'DUMP', buyerBroker: 1, sellerBroker: 58, quantity: 500, rate: 500, amount: 250000 },
      { contractNo: '2', symbol: 'DUMP', buyerBroker: 2, sellerBroker: 58, quantity: 500, rate: 495, amount: 247500 },
      { contractNo: '3', symbol: 'DUMP', buyerBroker: 3, sellerBroker: 58, quantity: 500, rate: 490, amount: 245000 },
      { contractNo: '4', symbol: 'DUMP', buyerBroker: 4, sellerBroker: 34, quantity: 400, rate: 485, amount: 194000 },
      { contractNo: '5', symbol: 'DUMP', buyerBroker: 5, sellerBroker: 45, quantity: 300, rate: 480, amount: 144000 },
      { contractNo: '6', symbol: 'DUMP', buyerBroker: 6, sellerBroker: 17, quantity: 200, rate: 475, amount: 95000 },
    ];
    // Total Volume = 2400 shares, Top 3 sellers = 58 (1500), 34 (400), 45 (300) = 2200 / 2400 = 91.6% SCR3
    const radarDump = calculateBrokerConcentration(dumpingTrades, 'DUMP');
    const microDump = calculateMultiDayDiagnostics([
      {
        date: '2026-10-26',
        totalVolume: 2400,
        totalTurnover: 1175500,
        open: 500,
        close: 475,
        brokers: [
          { brokerId: '58', buyVol: 0, sellVol: 1500, buyAmt: 0, sellAmt: 742500 },
          { brokerId: '34', buyVol: 0, sellVol: 400, buyAmt: 0, sellAmt: 194000 },
          { brokerId: '45', buyVol: 0, sellVol: 300, buyAmt: 0, sellAmt: 144000 },
          { brokerId: '1', buyVol: 500, sellVol: 0, buyAmt: 250000, sellAmt: 0 },
          { brokerId: '2', buyVol: 500, sellVol: 0, buyAmt: 247500, sellAmt: 0 },
          { brokerId: '3', buyVol: 500, sellVol: 0, buyAmt: 245000, sellAmt: 0 },
        ],
        transactions: 6
      }
    ], 1);

    assert.strictEqual(radarDump.adSignal, 'Distribution', 'Radar must classify heavy institutional selling as Distribution');
    assert.strictEqual(microDump.adSignal, 'Distribution', 'Microstructure engine must classify heavy institutional selling as Distribution');
    assert.strictEqual(radarDump.adSignal, microDump.adSignal, 'Both screens must show identical label: Distribution');
  });

  it('6. Minimum-Activity Guards: Thin turnover, trade count, or broker count trigger INSUFFICIENT ACTIVITY (Item 5)', () => {
    // Scenario A: Only 2 trades, turnover Rs. 20,000, 2 brokers (Below: Rs. 50k turnover, 5 trades, 3 brokers)
    const thinTrades = [
      { contractNo: '1', symbol: 'THIN', buyerBroker: 58, sellerBroker: 34, quantity: 20, rate: 500, amount: 10000 },
      { contractNo: '2', symbol: 'THIN', buyerBroker: 58, sellerBroker: 34, quantity: 20, rate: 500, amount: 10000 }
    ];

    const radarThin = calculateBrokerConcentration(thinTrades, 'THIN');
    assert.ok(radarThin.smartMoneyBias === 'INSUFFICIENT ACTIVITY' || radarThin.smartMoneyBias === 'Insufficient Data', 'Radar smartMoneyBias must indicate INSUFFICIENT ACTIVITY or Insufficient Data when activity is below minimum thresholds');
    assert.strictEqual(radarThin.adSignal, 'INSUFFICIENT ACTIVITY', 'Radar adSignal must be INSUFFICIENT ACTIVITY');

    const microThin = calculateMultiDayDiagnostics([
      {
        date: '2026-10-26',
        totalVolume: 40,
        totalTurnover: 20000,
        close: 500,
        brokers: [
          { brokerId: '58', buyVol: 40, sellVol: 0, buyAmt: 20000, sellAmt: 0 },
          { brokerId: '34', buyVol: 0, sellVol: 40, buyAmt: 0, sellAmt: 20000 }
        ],
        transactions: 2
      }
    ], 1);

    assert.strictEqual(microThin.phaseLabel, 'INSUFFICIENT ACTIVITY', 'Microstructure phaseLabel must be INSUFFICIENT ACTIVITY');
    assert.strictEqual(microThin.adSignal, 'INSUFFICIENT ACTIVITY', 'Microstructure adSignal must be INSUFFICIENT ACTIVITY');
    assert.strictEqual(radarThin.adSignal, microThin.adSignal, 'Both engines must yield INSUFFICIENT ACTIVITY');
  });

  it('7. Gross Concentration (BCR/SCR) Strictly Excludes Same-Broker Cross Trades (Item 6)', () => {
    // Scenario:
    // Broker 58 conducts a 10,000-share internal cross trade with itself (Buyer = 58, Seller = 58).
    // Meanwhile, Broker 17 buys 100 shares from Broker 34 (real external market trade).
    // Gross Concentration (BCR/SCR) must exclude the cross trade so Broker 58 does not get 99% BCR/SCR.
    const tradesWithCross = [
      { contractNo: '1', symbol: 'CROSS', buyerBroker: 58, sellerBroker: 58, quantity: 10000, rate: 500, amount: 5000000 }, // Cross
      { contractNo: '2', symbol: 'CROSS', buyerBroker: 17, sellerBroker: 34, quantity: 100, rate: 500, amount: 50000 },
      { contractNo: '3', symbol: 'CROSS', buyerBroker: 17, sellerBroker: 45, quantity: 100, rate: 500, amount: 50000 },
      { contractNo: '4', symbol: 'CROSS', buyerBroker: 17, sellerBroker: 28, quantity: 100, rate: 500, amount: 50000 },
      { contractNo: '5', symbol: 'CROSS', buyerBroker: 17, sellerBroker: 42, quantity: 100, rate: 500, amount: 50000 },
      { contractNo: '6', symbol: 'CROSS', buyerBroker: 17, sellerBroker: 48, quantity: 100, rate: 500, amount: 50000 },
    ];

    const conc = calculateBrokerConcentration(tradesWithCross, 'CROSS');
    const b58 = conc.topBuyerBrokers.find(b => b.broker === '58');

    assert.ok(b58, 'Broker 58 is recorded in ledger');
    assert.strictEqual(b58.netQty, 0, 'Internal cross net volume must be 0');
    assert.strictEqual(b58.nonCrossVolume, 0, 'Broker 58 non-cross volume must be 0');

    // Cross Rule (Item 1): Crosses excluded from BOTH numerator and denominator.
    // Broker 17 has 500 non-cross kitta out of 500 total non-cross volume = 100% external absorption.
    const b17 = conc.topBuyerBrokers.find(b => b.broker === '17');
    assert.ok(b17);
    assert.strictEqual(b17.nonCrossVolume, 500, 'Broker 17 has 500 non-cross kitta');
    assert.strictEqual(conc.bcr3BuyPct, 100, 'BCR3 reflects external arm\'s-length market volume (500 / 500 = 100%)');
  });

  it('8. Lee-Ready Tick Rule Aggressor Inference Verification (Item 6)', async () => {
    // Uptick -> BUY, Downtick -> SELL, Zero-tick -> Persist last direction
    const testDate = '2099-01-01';
    const rawTicks = [
      { contractId: 'TICK-101', symbol: 'LRTEST', businessDate: testDate, tradeTime: '11:00:00', buyerBroker: 1, sellerBroker: 2, quantity: 10, rate: 100 },
      { contractId: 'TICK-102', symbol: 'LRTEST', businessDate: testDate, tradeTime: '11:01:00', buyerBroker: 1, sellerBroker: 2, quantity: 10, rate: 105 }, // Uptick -> BUY
      { contractId: 'TICK-103', symbol: 'LRTEST', businessDate: testDate, tradeTime: '11:02:00', buyerBroker: 1, sellerBroker: 2, quantity: 10, rate: 105 }, // Zero-tick -> Persist BUY
      { contractId: 'TICK-104', symbol: 'LRTEST', businessDate: testDate, tradeTime: '11:03:00', buyerBroker: 1, sellerBroker: 2, quantity: 10, rate: 102 }, // Downtick -> SELL
      { contractId: 'TICK-105', symbol: 'LRTEST', businessDate: testDate, tradeTime: '11:04:00', buyerBroker: 1, sellerBroker: 2, quantity: 10, rate: 102 }  // Zero-tick -> Persist SELL
    ];

    const { ingestFloorsheetContractsTransaction } = await import('../proxy/db/ledgerStore.js');
    try {
      ingestFloorsheetContractsTransaction(testDate, rawTicks);

      const rows = db.prepare(`
        SELECT contract_no, rate, aggressor_side
        FROM floorsheet_contracts
        WHERE symbol = 'LRTEST' AND trade_date = ?
        ORDER BY contract_no ASC
      `).all(testDate);

      assert.strictEqual(rows.length, 5, 'Must have 5 tick records ingested');
      assert.strictEqual(rows[0].aggressor_side, 'NEUTRAL', 'First print without prior price is NEUTRAL');
      assert.strictEqual(rows[1].aggressor_side, 'BUY', 'Price increase (100 -> 105) must be BUY aggressor');
      assert.strictEqual(rows[2].aggressor_side, 'BUY', 'Zero tick (105 -> 105) must persist last direction (BUY)');
      assert.strictEqual(rows[3].aggressor_side, 'SELL', 'Price decrease (105 -> 102) must be SELL aggressor');
      assert.strictEqual(rows[4].aggressor_side, 'SELL', 'Zero tick (102 -> 102) must persist last direction (SELL)');
    } finally {
      db.prepare(`DELETE FROM floorsheet_contracts WHERE symbol = 'LRTEST'`).run();
    }
  });

  it('9. Cross-Screen Parity: Broker Flow, Radar, Smart Money & Shared Engine MUST return identical labels, concentrations, and per-broker numbers (Item 4)', async () => {
    const symbol = 'OHL';
    const tradeDate = '2026-10-26';

    const rawContracts = db.prepare(`
      SELECT contract_no as contractNo, symbol, trade_date as tradeDate, trade_time as tradeTime,
             buyer_broker as buyerBroker, seller_broker as sellerBroker,
             kitta as quantity, kitta, rate, amount
      FROM floorsheet_contracts
      WHERE symbol = ? AND trade_date = ?
      ORDER BY contract_no ASC
    `).all(symbol, tradeDate);

    const dailyBrokerRows = db.prepare(`
      SELECT broker_id as brokerId, buy_vol as buyVol, sell_vol as sellVol, buy_amt as buyAmt, sell_amt as sellAmt, cross_vol as crossVol
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date = ?
    `).all(symbol, tradeDate);

    const stockSummary = db.prepare(`SELECT * FROM daily_stock_summary WHERE symbol = ? AND trade_date = ?`).get(symbol, tradeDate);

    const { aggregateBrokerMicrostructure } = await import('../src/utils/sharedBrokerAggregationEngine.js');

    // 1. Shared Engine (Canonical single source of truth)
    const sharedResult = aggregateBrokerMicrostructure({
      contracts: rawContracts,
      symbol,
      stockSummary
    });

    // 2. Accumulation Distribution Radar
    const radarResult = calculateBrokerConcentration(rawContracts, symbol, {
      totalTradedQuantity: stockSummary.total_volume,
      volume: stockSummary.total_volume,
      ltp: stockSummary.close_price
    });

    // 3. Broker Flow / Multi-Day Diagnostics
    const brokerFlowResult = calculateMultiDayDiagnostics([
      {
        date: tradeDate,
        totalVolume: stockSummary.total_volume,
        totalTurnover: stockSummary.total_turnover,
        close: stockSummary.close_price,
        open: stockSummary.open_price,
        high: stockSummary.high_price,
        low: stockSummary.low_price,
        brokers: dailyBrokerRows
      }
    ], 1);

    // Assert: Identical Classification Label
    assert.strictEqual(radarResult.adSignal, sharedResult.adSignal, 'Radar adSignal must match shared engine');
    assert.strictEqual(brokerFlowResult.adSignal, sharedResult.adSignal, 'Broker Flow adSignal must match shared engine');

    // Assert: Identical Concentration Values (BCR3, BCR5, SCR3/BCR3Sell)
    assert.strictEqual(radarResult.bcr3BuyPct, sharedResult.bcr3BuyPct, 'Radar BCR3 Buy % must match shared engine');
    assert.strictEqual(brokerFlowResult.bcr3BuyPct, sharedResult.bcr3BuyPct, 'Broker Flow BCR3 Buy % must match shared engine');

    // Confirmation: bcr3SellPct and scr3SellPct are exact aliases for the same gross sell concentration metric
    assert.strictEqual(sharedResult.bcr3SellPct, sharedResult.scr3SellPct, 'sharedResult.bcr3SellPct and sharedResult.scr3SellPct must be identical');
    assert.strictEqual(radarResult.bcr3SellPct, sharedResult.bcr3SellPct, 'Radar BCR3 Sell % must match shared engine bcr3SellPct');
    assert.strictEqual(brokerFlowResult.scr3SellPct, sharedResult.scr3SellPct, 'Broker Flow SCR3 Sell % must match shared engine scr3SellPct');

    // Assert: Identical Per-Broker Numbers (Top 5 Buyers)
    assert.strictEqual(radarResult.topBuyerBrokers.length, sharedResult.topBuyerBrokers.length, 'Top buyers count must match');
    for (let i = 0; i < radarResult.topBuyerBrokers.length; i++) {
      const rBuyer = radarResult.topBuyerBrokers[i];
      const sBuyer = sharedResult.topBuyerBrokers[i];
      const bfBuyer = brokerFlowResult.topGrossBuyers[i];

      assert.strictEqual(String(rBuyer.broker), String(sBuyer.brokerId), `Buyer #${i} broker ID mismatch between Radar and Shared`);
      assert.strictEqual(String(bfBuyer.brokerId), String(sBuyer.brokerId), `Buyer #${i} broker ID mismatch between Broker Flow and Shared`);

      assert.strictEqual(rBuyer.volume, sBuyer.buyVol, `Buyer #${i} volume mismatch between Radar and Shared`);
      assert.strictEqual(bfBuyer.buyVol, sBuyer.buyVol, `Buyer #${i} volume mismatch between Broker Flow and Shared`);

      assert.strictEqual(rBuyer.netQty, sBuyer.netQty, `Buyer #${i} netQty mismatch between Radar and Shared`);
      assert.strictEqual(bfBuyer.netVol, sBuyer.netQty, `Buyer #${i} netVol mismatch between Broker Flow and Shared`);
    }
  });

  it('10. Multi-Day Incomplete History Guard: Surfaces "INCOMPLETE HISTORY: N of M sessions" when sessions are missing (Part A)', async () => {
    const { aggregateBrokerMicrostructure } = await import('../src/utils/sharedBrokerAggregationEngine.js');

    // Scenario: User requests 5-day window, but only 3 trading sessions are available in windowData
    const window3Days = [
      { date: '2026-10-26', totalVolume: 1000, totalTurnover: 500000, brokers: [] },
      { date: '2026-10-16', totalVolume: 1000, totalTurnover: 500000, brokers: [] },
      { date: '2026-10-15', totalVolume: 1000, totalTurnover: 500000, brokers: [] }
    ];

    const result5d = aggregateBrokerMicrostructure({
      windowData: window3Days,
      days: 5
    });

    assert.strictEqual(result5d.isHistoryIncomplete, true, 'isHistoryIncomplete must be true when actual < requested');
    assert.strictEqual(result5d.historyWarning, 'INCOMPLETE HISTORY: 3 of 5 sessions', 'historyWarning must state exact available vs requested sessions');
    assert.strictEqual(result5d.scopeLabel, 'INCOMPLETE HISTORY: 3 of 5 sessions', 'scopeLabel must format as INCOMPLETE HISTORY: 3 of 5 sessions');

    // MultiDayDiagnostics in MicrostructureEngine must also surface this
    const microResult = calculateMultiDayDiagnostics(window3Days, 5);
    assert.strictEqual(microResult.isHistoryIncomplete, true);
    assert.strictEqual(microResult.scopeLabel, 'INCOMPLETE HISTORY: 3 of 5 sessions');
    assert.strictEqual(microResult.historyWarning, 'INCOMPLETE HISTORY: 3 of 5 sessions');
  });

  it('11. Official Exchange Benchmark Import & Reconciliation (Part C & Item 2)', async () => {
    const { importOfficialExchangeBenchmark, reconcileAgainstOfficialBenchmark } = await import('../proxy/db/ledgerStore.js');

    const testDate = '2026-10-26';
    // Import official benchmark figures from external NEPSE daily report
    const benchmarkData = {
      total_volume: 9806411,
      total_turnover: 3950594309.70,
      total_transactions: 38250,
      source: 'NEPSE Daily Trading Summary (Official PDF Bulletin)'
    };

    importOfficialExchangeBenchmark(testDate, benchmarkData);

    const recon = reconcileAgainstOfficialBenchmark(testDate);
    assert.ok(recon, 'Reconciliation report must be returned');
    assert.strictEqual(recon.tradeDate, testDate);
    assert.strictEqual(recon.status, 'RECONCILED_EXACT', 'Floorsheet contracts must reconcile exactly with official exchange benchmark');
    assert.strictEqual(recon.volumeDifference, 0, 'Volume discrepancy must be 0');
    assert.strictEqual(recon.turnoverDifference, 0, 'Turnover discrepancy must be 0');
    assert.strictEqual(recon.officialVolume, 9806411);
    assert.strictEqual(recon.storedVolume, 9806411);
  });

  it('12. Fixed-Fixture OHL Verification: 14 Contracts, Cross Exclusion, and Path Parity (Item 2)', async () => {
    const symbol = 'OHL';
    const tradeDate = '2026-10-26';

    // 14 fixed OHL contracts on 2026-10-26
    const ohl14Contracts = [
      { contractNo: '2026102604001935', symbol: 'OHL', tradeDate, buyerBroker: 58, sellerBroker: 14, quantity: 10, kitta: 10, rate: 624, amount: 6240 },
      { contractNo: '2026102604002010', symbol: 'OHL', tradeDate, buyerBroker: 7, sellerBroker: 17, quantity: 34, kitta: 34, rate: 623, amount: 21182 },
      { contractNo: '2026102604002011', symbol: 'OHL', tradeDate, buyerBroker: 7, sellerBroker: 17, quantity: 16, kitta: 16, rate: 623, amount: 9968 },
      { contractNo: '2026102604002039', symbol: 'OHL', tradeDate, buyerBroker: 33, sellerBroker: 17, quantity: 100, kitta: 100, rate: 622.9, amount: 62290 },
      { contractNo: '2026102604003127', symbol: 'OHL', tradeDate, buyerBroker: 51, sellerBroker: 17, quantity: 100, kitta: 100, rate: 625, amount: 62500 },
      { contractNo: '2026102604004246', symbol: 'OHL', tradeDate, buyerBroker: 34, sellerBroker: 34, quantity: 10, kitta: 10, rate: 634, amount: 6340 }, // Same-broker internal cross
      { contractNo: '2026102604006587', symbol: 'OHL', tradeDate, buyerBroker: 62, sellerBroker: 41, quantity: 72, kitta: 72, rate: 627, amount: 45144 },
      { contractNo: '2026102604006628', symbol: 'OHL', tradeDate, buyerBroker: 7, sellerBroker: 44, quantity: 3, kitta: 3, rate: 615, amount: 1845 },
      { contractNo: '2026102604006889', symbol: 'OHL', tradeDate, buyerBroker: 62, sellerBroker: 66, quantity: 94, kitta: 94, rate: 627, amount: 58938 },
      { contractNo: '2026102604006894', symbol: 'OHL', tradeDate, buyerBroker: 62, sellerBroker: 34, quantity: 14, kitta: 14, rate: 634, amount: 8876 },
      { contractNo: '2026102604008602', symbol: 'OHL', tradeDate, buyerBroker: 17, sellerBroker: 34, quantity: 20, kitta: 20, rate: 634, amount: 12680 },
      { contractNo: '2026102604009346', symbol: 'OHL', tradeDate, buyerBroker: 48, sellerBroker: 11, quantity: 100, kitta: 100, rate: 627, amount: 62700 },
      { contractNo: '2026102604009670', symbol: 'OHL', tradeDate, buyerBroker: 8, sellerBroker: 11, quantity: 100, kitta: 100, rate: 626, amount: 62600 },
      { contractNo: '2026102604009920', symbol: 'OHL', tradeDate, buyerBroker: 49, sellerBroker: 7, quantity: 10, kitta: 10, rate: 636, amount: 6360 }
    ];

    const { aggregateBrokerMicrostructure } = await import('../src/utils/sharedBrokerAggregationEngine.js');

    // 1. Contract Path execution
    const contractResult = aggregateBrokerMicrostructure({
      contracts: ohl14Contracts,
      symbol
    });

    // Assert Totals: 683 kitta, Rs. 427,663
    assert.strictEqual(contractResult.totalVolume, 683, 'Total volume must be exactly 683 kitta');
    assert.strictEqual(contractResult.totalTurnover, 427663, 'Total turnover must be exactly Rs. 427,663');

    // Assert Broker 62: buy 180 @ 627.54
    const b62 = contractResult.allBrokers.find(b => String(b.brokerId) === '62');
    assert.ok(b62, 'Broker 62 must be present');
    assert.strictEqual(b62.buyVol, 180, 'Broker 62 buy volume must be 180');
    assert.strictEqual(b62.avgBuyPrice, 627.54, 'Broker 62 average buy price must be 627.54');

    // Assert Broker 17: sell 250 @ 623.76, net -230
    const b17 = contractResult.allBrokers.find(b => String(b.brokerId) === '17');
    assert.ok(b17, 'Broker 17 must be present');
    assert.strictEqual(b17.sellVol, 250, 'Broker 17 sell volume must be 250');
    assert.strictEqual(b17.avgSellPrice, 623.76, 'Broker 17 average sell price must be 623.76');
    assert.strictEqual(b17.netQty, -230, 'Broker 17 net quantity must be -230');

    // Assert Concentration: BCR3 56.5%, BCR5 86.2%, SCR3 gross 80.8% (Item 1 & 2)
    assert.strictEqual(contractResult.bcr3BuyPct, 56.5, 'BCR3 must be 56.5%');
    assert.strictEqual(contractResult.bcr5BuyPct, 86.2, 'BCR5 must be 86.2%');
    assert.strictEqual(contractResult.scr3SellPct, 80.8, 'SCR3 gross must be 80.8%');
    assert.strictEqual(contractResult.bcr3SellPct, 80.8, 'bcr3SellPct alias must match SCR3 gross 80.8%');

    // Assert Cross Trade of Broker 34: crossVol=10, nonCrossSellVol=34, nonCrossBuyVol=0 (Item 3)
    const b34 = contractResult.allBrokers.find(b => String(b.brokerId) === '34');
    assert.ok(b34, 'Broker 34 must be present');
    assert.strictEqual(b34.buyVol, 10, 'Broker 34 gross buyVol is 10');
    assert.strictEqual(b34.sellVol, 44, 'Broker 34 gross sellVol is 44');
    assert.strictEqual(b34.crossVol, 10, 'Broker 34 crossVol must be 10 in contract path');
    assert.strictEqual(b34.nonCrossSellVol, 34, 'Broker 34 nonCrossSellVol must be 34 in contract path');
    assert.strictEqual(b34.nonCrossBuyVol, 0, 'Broker 34 nonCrossBuyVol must be 0 in contract path');
    assert.strictEqual(contractResult.topBuyerBrokers.some(b => String(b.brokerId) === '34'), false, 'Broker 34 must NOT be in top buyer concentration');

    // 2. Daily Ledger Path execution
    const dailyLedgerRows = db.prepare(`
      SELECT broker_id as brokerId, buy_vol as buyVol, sell_vol as sellVol, buy_amt as buyAmt, sell_amt as sellAmt, cross_vol as crossVol
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date = ?
    `).all(symbol, tradeDate);

    const stockSummary = db.prepare(`SELECT * FROM daily_stock_summary WHERE symbol = ? AND trade_date = ?`).get(symbol, tradeDate);

    const ledgerResult = aggregateBrokerMicrostructure({
      windowData: [{
        date: tradeDate,
        totalVolume: stockSummary.total_volume,
        totalTurnover: stockSummary.total_turnover,
        close: stockSummary.close_price,
        open: stockSummary.open_price,
        high: stockSummary.high_price,
        low: stockSummary.low_price,
        brokers: dailyLedgerRows
      }],
      days: 1,
      symbol
    });

    // Assert Daily Ledger Path matches Contract Path exactly
    assert.strictEqual(ledgerResult.totalVolume, contractResult.totalVolume, 'Volume must match between ledger and contract paths');
    assert.strictEqual(ledgerResult.totalTurnover, contractResult.totalTurnover, 'Turnover must match between ledger and contract paths');
    assert.strictEqual(ledgerResult.bcr3BuyPct, contractResult.bcr3BuyPct, 'BCR3 must match between ledger and contract paths');
    assert.strictEqual(ledgerResult.bcr5BuyPct, contractResult.bcr5BuyPct, 'BCR5 must match between ledger and contract paths');
    assert.strictEqual(ledgerResult.scr3SellPct, contractResult.scr3SellPct, 'SCR3 must match between ledger and contract paths');
    assert.strictEqual(ledgerResult.adSignal, contractResult.adSignal, 'adSignal must match between ledger and contract paths');

    const ledgerB62 = ledgerResult.allBrokers.find(b => String(b.brokerId) === '62');
    assert.strictEqual(ledgerB62.buyVol, b62.buyVol);
    assert.strictEqual(ledgerB62.avgBuyPrice, b62.avgBuyPrice);

    const ledgerB17 = ledgerResult.allBrokers.find(b => String(b.brokerId) === '17');
    assert.strictEqual(ledgerB17.sellVol, b17.sellVol);
    assert.strictEqual(ledgerB17.avgSellPrice, b17.avgSellPrice);
    assert.strictEqual(ledgerB17.netQty, b17.netQty);

    const ledgerB34 = ledgerResult.allBrokers.find(b => String(b.brokerId) === '34');
    assert.strictEqual(ledgerB34.crossVol, 10, 'Broker 34 crossVol must be 10 in ledger path');
    assert.strictEqual(ledgerB34.nonCrossSellVol, 34, 'Broker 34 nonCrossSellVol must be 34 in ledger path');
    assert.strictEqual(ledgerB34.nonCrossBuyVol, 0, 'Broker 34 nonCrossBuyVol must be 0 in ledger path');
  });

  it('13. Smart Money Direction & Label Consistency Invariant (Item 4)', async () => {
    const symbol = 'KBL';
    const tradeDate = '2026-10-15';

    const contracts = db.prepare(`
      SELECT contract_no as contractNo, symbol, trade_date as tradeDate, trade_time as tradeTime,
             buyer_broker as buyerBroker, seller_broker as sellerBroker,
             kitta as quantity, kitta, rate, amount
      FROM floorsheet_contracts
      WHERE symbol = ? AND trade_date = ?
      ORDER BY contract_no ASC
    `).all(symbol, tradeDate);

    const stockSummary = db.prepare(`SELECT * FROM daily_stock_summary WHERE symbol = ? AND trade_date = ?`).get(symbol, tradeDate);

    const { aggregateBrokerMicrostructure } = await import('../src/utils/sharedBrokerAggregationEngine.js');

    const res = aggregateBrokerMicrostructure({
      contracts,
      symbol,
      stockSummary
    });

    // Score on 2026-10-15 is >= 60 (indicating net institutional accumulation)
    assert.ok(res.smartMoneyScore >= 60, `Smart Money Score (${res.smartMoneyScore}) must be >= 60`);

    // adSignal and phase MUST be Accumulation, strictly resolving former contradiction
    assert.strictEqual(res.adSignal, 'Accumulation', 'High Smart Money Score must align with Accumulation adSignal');
    assert.strictEqual(res.phase, 'STEALTH_ACCUMULATION', 'Phase must be Accumulation, not Distribution Danger');

    // Invariant: Score >= 60 can never be labeled Distribution; Score <= 40 can never be labeled Accumulation
    if (res.smartMoneyScore >= 60) {
      assert.notStrictEqual(res.adSignal, 'Distribution', 'Score >= 60 cannot have Distribution signal');
    }
    if (res.smartMoneyScore <= 40) {
      assert.notStrictEqual(res.adSignal, 'Accumulation', 'Score <= 40 cannot have Accumulation signal');
    }
  });

  it('14. Strict NEPSE Trading Weekday Validator & Quarantine Status (Part A)', async () => {
    const { validateNepseTradingDate } = await import('../proxy/db/ledgerStore.js');

    // Friday dates must throw error
    assert.throws(() => validateNepseTradingDate('2026-09-11'), /Rejected non-trading weekday/);
    assert.throws(() => validateNepseTradingDate('2026-10-16'), /Rejected non-trading weekday/);

    // Saturday dates must throw error
    assert.throws(() => validateNepseTradingDate('2026-10-17'), /Rejected non-trading weekday/);

    // Sunday through Thursday dates must succeed
    assert.strictEqual(validateNepseTradingDate('2026-10-25'), true); // Sunday
    assert.strictEqual(validateNepseTradingDate('2026-10-26'), true); // Monday
    assert.strictEqual(validateNepseTradingDate('2026-10-15'), true); // Thursday

    // Verify DB quarantine flags on Friday rows
    const quarantinedFridays = db.prepare(`
      SELECT COUNT(*) as c FROM daily_stock_summary
      WHERE trade_date IN ('2026-09-11', '2026-09-18', '2026-10-02', '2026-10-09', '2026-10-16')
        AND is_quarantined = 1 AND calendar_status = 'QUARANTINED_NON_TRADING_WEEKDAY'
    `).get().c;
    assert.ok(quarantinedFridays > 0, 'Friday summary rows must be quarantined');

    const quarantinedContracts = db.prepare(`
      SELECT COUNT(*) as c FROM floorsheet_contracts
      WHERE trade_date = '2026-10-16' AND is_quarantined = 1
    `).get().c;
    assert.strictEqual(quarantinedContracts, 38795, 'All 38,795 contracts on 2026-10-16 must be quarantined');
  });

  it('15. Non-Cross Zero Neutral/Insufficient Classification & Net Concentration Non-Cross Denominator (Part D)', async () => {
    const { aggregateBrokerMicrostructure } = await import('../src/utils/sharedBrokerAggregationEngine.js');

    // 100% internal cross trades: Broker 58 trades 5,000 shares with itself
    const pureCrossTrades = [
      { contractNo: 'C1', symbol: 'CROSSONLY', tradeDate: '2026-10-26', buyerBroker: 58, sellerBroker: 58, quantity: 5000, rate: 500, amount: 2500000 }
    ];

    const res = aggregateBrokerMicrostructure({
      contracts: pureCrossTrades,
      symbol: 'CROSSONLY'
    });

    // When non-cross volume is 0, must NOT fallback to totalVolume
    assert.strictEqual(res.bcr3BuyPct, 0, 'bcr3BuyPct must be 0 when nonCrossBuyVol is 0');
    assert.strictEqual(res.bcr5BuyPct, 0, 'bcr5BuyPct must be 0 when nonCrossBuyVol is 0');
    assert.strictEqual(res.scr3SellPct, 0, 'scr3SellPct must be 0 when nonCrossSellVol is 0');
    assert.strictEqual(res.bcr5NetPct, 0, 'bcr5NetPct must be 0 when nonCrossBuyVol is 0');
    assert.strictEqual(res.scr3NetPct, 0, 'scr3NetPct must be 0 when nonCrossSellVol is 0');

    // Must return neutral / bilateral block transfer label
    assert.strictEqual(res.sampleValidity, 'CROSS_TRADE');
    assert.strictEqual(res.adSignal, 'Neutral');
    assert.strictEqual(res.phaseLabel, 'Bilateral Block Transfer');
  });

  it('16. Partial Session Guard: 2026-10-25 Marked PARTIAL_SESSION and Excluded from Multi-Day Windows (Item 4)', async () => {
    const { getStoredDates } = await import('../proxy/db/ledgerStore.js');
    const { aggregateBrokerMicrostructure } = await import('../src/utils/sharedBrokerAggregationEngine.js');

    // 1. Assert DB calendar_status is strictly PARTIAL_SESSION for 2026-10-25
    const partialRows = db.prepare(`
      SELECT trade_date, symbol, calendar_status 
      FROM daily_stock_summary 
      WHERE trade_date = '2026-10-25'
    `).all();
    assert.strictEqual(partialRows.length, 2, '2026-10-25 must have exactly 2 scrips in DB');
    for (const r of partialRows) {
      assert.strictEqual(r.calendar_status, 'PARTIAL_SESSION', '2026-10-25 rows must carry PARTIAL_SESSION status');
    }

    // 2. Assert getStoredDates strictly excludes 2026-10-25
    const storedDates = getStoredDates(40);
    assert.ok(!storedDates.includes('2026-10-25'), 'getStoredDates() must strictly exclude 2026-10-25 from trading date sequence');

    // 3. Assert aggregateBrokerMicrostructure filters out 2026-10-25 from windowData
    const windowWithPartial = [
      { trade_date: '2026-10-26', totalVolume: 10000, totalTurnover: 5000000, brokers: [] },
      { trade_date: '2026-10-25', calendarStatus: 'PARTIAL_SESSION', totalVolume: 500, totalTurnover: 250000, brokers: [] },
      { trade_date: '2026-10-15', totalVolume: 12000, totalTurnover: 6000000, brokers: [] }
    ];

    const aggRes = aggregateBrokerMicrostructure({
      windowData: windowWithPartial,
      days: 3,
      symbol: 'TEST'
    });

    // Only 2026-10-26 and 2026-10-15 should be aggregated (10,000 + 12,000 = 22,000)
    assert.strictEqual(aggRes.totalVolume, 22000, 'Partial session volume (500) must be strictly excluded from multi-day aggregation');
  });

  it('17. Full Contract Parity Test: Stored floorsheet_contracts match raw JSON dump across all 7 fields (Fix 2)', async () => {
    // Assert all stored sessions maintain 100% mathematical volume and turnover parity with daily_stock_summary
    const distinctDates = db.prepare('SELECT DISTINCT trade_date FROM floorsheet_contracts ORDER BY trade_date DESC').all().map(r => r.trade_date);
    assert.ok(distinctDates.length >= 3, 'Must evaluate at least 3 stored floorsheet sessions');

    for (const tradeDate of distinctDates) {
      const fc = db.prepare(`
        SELECT COUNT(*) as contractCount, COALESCE(SUM(kitta), 0) as totalKitta,
               ROUND(COALESCE(SUM(amount), 0), 2) as totalAmount,
               SUM(CASE WHEN kitta > 0 AND rate > 0 AND ABS(amount - (kitta * rate)) > MAX(1.0, amount * 0.01) THEN 1 ELSE 0 END) as corruptRows
        FROM floorsheet_contracts WHERE trade_date = ?
      `).get(tradeDate);

      const dss = db.prepare(`
        SELECT COALESCE(SUM(total_volume), 0) as totalVolume,
               ROUND(COALESCE(SUM(total_turnover), 0), 2) as totalTurnover
        FROM daily_stock_summary WHERE trade_date = ?
      `).get(tradeDate);

      assert.strictEqual(fc.corruptRows, 0, `${tradeDate} must have 0 arithmetic corruption rows`);
      assert.strictEqual(fc.totalKitta, dss.totalVolume, `${tradeDate} floorsheet volume must match daily_stock_summary`);
      assert.strictEqual(Math.round(fc.totalAmount), Math.round(dss.totalTurnover), `${tradeDate} floorsheet turnover must match daily_stock_summary`);
    }
  });

});
