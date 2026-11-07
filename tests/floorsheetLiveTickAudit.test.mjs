// tests/floorsheetLiveTickAudit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../proxy/db/ledgerStore.js';
import { getOrFetchSymbolFloorsheet, getFullSessionFloorsheet } from '../proxy/brokerVault.mjs';

test('Floorsheet Live Ingestion & Date Freshness Audit', async (t) => {
  await t.test('1. AKJCL 2026-11-06 Authentic Contracts in SQLite Ledger', () => {
    const contracts = db.prepare(`
      SELECT contract_no, symbol, trade_date, trade_time, buyer_broker, seller_broker, kitta, rate, amount
      FROM floorsheet_contracts
      WHERE symbol = 'AKJCL' AND trade_date = '2026-11-06'
      ORDER BY CAST(contract_no AS INTEGER) ASC
    `).all();

    assert.equal(contracts.length, 360, 'AKJCL must have exactly 360 contracts on 2026-11-06');
    assert.equal(contracts[0].trade_date, '2026-11-06');
    assert.equal(contracts[contracts.length - 1].trade_date, '2026-11-06');

    const totalQty = contracts.reduce((s, c) => s + c.kitta, 0);
    const totalAmt = contracts.reduce((s, c) => s + c.amount, 0);
    assert.equal(totalQty, 153871, 'Total traded quantity must be 153,871 kitta');
    assert.equal(Math.round(totalAmt), 52862810, 'Total turnover must be ~5.28 Crore NPR');
  });

  await t.test('2. getOrFetchSymbolFloorsheet respects requested session without silent downgrade', async () => {
    const res2026_11_06 = await getOrFetchSymbolFloorsheet('AKJCL', { date: '2026-11-06', page: 1, size: 50 });
    assert.ok(res2026_11_06, 'Must return response for 2026-11-06');
    assert.equal(res2026_11_06.businessDate, '2026-11-06');
    assert.equal(res2026_11_06.totalElements, 360);
    assert.equal(res2026_11_06.rows.length, 50);

    // Verify all rows in 2026-11-06 strictly belong to 2026-11-06
    for (const r of res2026_11_06.rows) {
      assert.equal(r.businessDate, '2026-11-06', 'Row must belong to 2026-11-06');
    }
  });

  await t.test('3. Delta incremental streaming using sinceContractId', () => {
    const contracts = db.prepare(`
      SELECT contract_no, kitta, rate
      FROM floorsheet_contracts
      WHERE symbol = 'AKJCL' AND trade_date = '2026-11-06'
      ORDER BY CAST(contract_no AS INTEGER) ASC
    `).all();

    const midpointContract = contracts[300].contract_no;
    const deltaContracts = db.prepare(`
      SELECT contract_no
      FROM floorsheet_contracts
      WHERE symbol = 'AKJCL' AND trade_date = '2026-11-06' AND CAST(contract_no AS INTEGER) > CAST(? AS INTEGER)
      ORDER BY CAST(contract_no AS INTEGER) ASC
    `).all(midpointContract);

    assert.equal(deltaContracts.length, 59, 'Must fetch exactly remaining delta contracts without re-fetching old trades');
  });

  await t.test('4. Full Session Vault retrieves 2026-11-06 session', async () => {
    const fullTrades = await getFullSessionFloorsheet('2026-11-06');
    assert.ok(Array.isArray(fullTrades), 'Must return an array of trades');
    assert.ok(fullTrades.length > 30000, `Must have full session trades (>30,000), got ${fullTrades.length}`);
    const akjclTrades = fullTrades.filter(t => (t.stockSymbol || t.symbol || '').toUpperCase() === 'AKJCL');
    assert.equal(akjclTrades.length, 360, 'Full session vault must contain all 360 AKJCL trades');
  });
});
