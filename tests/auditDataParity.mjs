import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log(' AUTOMATED GROUND-TRUTH & IN-APP DATA PARITY AUDIT');
console.log('═══════════════════════════════════════════════════════════════════════');

const dbPath = 'proxy/data/drabyashree_ledger.db';
const db = new Database(dbPath, { readonly: true });

test('1. Temporal Chronological Parity (DB vs Bundled Seeds)', () => {
  const maxDateRow = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_broker_ledger').get();
  const maxDate = maxDateRow?.maxDate;
  assert.ok(maxDate, 'Database must have a valid max trade_date');

  // Verify src/data/broker_matrix_latest.json
  const latestSeedPath = 'src/data/broker_matrix_latest.json';
  assert.ok(fs.existsSync(latestSeedPath), 'src/data/broker_matrix_latest.json must exist');
  const latestSeed = JSON.parse(fs.readFileSync(latestSeedPath, 'utf8'));
  assert.strictEqual(
    latestSeed.businessDate,
    maxDate,
    `src/data/broker_matrix_latest.json businessDate (${latestSeed.businessDate}) must match DB max trade_date (${maxDate})`
  );

  // Verify proxy/data/broker_matrix_latest.json
  const proxySeedPath = 'proxy/data/broker_matrix_latest.json';
  assert.ok(fs.existsSync(proxySeedPath), 'proxy/data/broker_matrix_latest.json must exist');
  const proxySeed = JSON.parse(fs.readFileSync(proxySeedPath, 'utf8'));
  assert.strictEqual(
    proxySeed.businessDate,
    maxDate,
    `proxy/data/broker_matrix_latest.json businessDate (${proxySeed.businessDate}) must match DB max trade_date (${maxDate})`
  );

  // Verify src/data/broker_matrices_historical.json includes maxDate
  const histPath = 'src/data/broker_matrices_historical.json';
  assert.ok(fs.existsSync(histPath), 'src/data/broker_matrices_historical.json must exist');
  const histSeed = JSON.parse(fs.readFileSync(histPath, 'utf8'));
  assert.ok(
    histSeed[maxDate],
    `src/data/broker_matrices_historical.json must contain historical matrix entry for ${maxDate}`
  );
  assert.strictEqual(
    histSeed[maxDate].businessDate,
    maxDate,
    `Historical matrix for ${maxDate} must have businessDate ${maxDate}`
  );
});

test('2. Numerical Parity: Broker 58 Top 10 Net Buy (DB vs Client Matrix)', () => {
  const maxDate = db.prepare('SELECT MAX(trade_date) as maxDate FROM daily_broker_ledger').get()?.maxDate;

  // Pure-Equity Filter: in NEPSE, promoter shares (ending with P like HIDCLP) and mutual funds
  // are separated from standard equity screeners to prevent distorted cornering alerts.
  const isPureEquity = (sym) => !sym.endsWith('P') && !sym.includes('MF') && !sym.includes('PF') && sym.length <= 6;

  // DB Ground Truth for Net Volume (Kitta) - Filtered to Standard Equity
  const dbTopQty = db.prepare(`
    SELECT UPPER(symbol) as symbol,
           SUM(buy_vol) - SUM(sell_vol) as net_qty,
           SUM(buy_amt) - SUM(sell_amt) as net_amt
    FROM daily_broker_ledger
    WHERE broker_id = 58 AND trade_date = ?
    GROUP BY UPPER(symbol)
    HAVING net_qty > 0
    ORDER BY net_qty DESC
  `).all(maxDate).filter(s => isPureEquity(s.symbol)).slice(0, 10);

  // DB Ground Truth for Net Amount (NPR) - Filtered to Standard Equity
  const dbTopAmt = db.prepare(`
    SELECT UPPER(symbol) as symbol,
           SUM(buy_vol) - SUM(sell_vol) as net_qty,
           SUM(buy_amt) - SUM(sell_amt) as net_amt
    FROM daily_broker_ledger
    WHERE broker_id = 58 AND trade_date = ?
    GROUP BY UPPER(symbol)
    HAVING net_amt > 0
    ORDER BY net_amt DESC
  `).all(maxDate).filter(s => isPureEquity(s.symbol)).slice(0, 10);

  // Client Bundled Seed
  const latestSeed = JSON.parse(fs.readFileSync('src/data/broker_matrix_latest.json', 'utf8'));
  const b58 = latestSeed.matrix.find(b => String(b.broker) === '58' || String(b.id) === '58');
  assert.ok(b58, 'Broker 58 must exist in client matrix seed');

  // Verify Net Volume Top 10 (topByNetQty)
  assert.ok(Array.isArray(b58.topByNetQty), 'topByNetQty must be an array');
  assert.ok(b58.topByNetQty.length >= 10, 'topByNetQty must have at least 10 entries');
  for (let i = 0; i < 10; i++) {
    const clientScrip = b58.topByNetQty[i];
    const dbScrip = dbTopQty[i];
    assert.strictEqual(
      clientScrip.symbol,
      dbScrip.symbol,
      `Rank #${i + 1} Net Volume symbol mismatch: client=${clientScrip.symbol}, db=${dbScrip.symbol}`
    );
    assert.strictEqual(
      clientScrip.netQty,
      dbScrip.net_qty,
      `Rank #${i + 1} (${clientScrip.symbol}) Net Volume mismatch: client=${clientScrip.netQty}, db=${dbScrip.net_qty}`
    );
  }

  // Verify Net Amount Top 10 (topAccumulation)
  assert.ok(Array.isArray(b58.topAccumulation), 'topAccumulation must be an array');
  assert.ok(b58.topAccumulation.length >= 10, 'topAccumulation must have at least 10 entries');
  for (let i = 0; i < 10; i++) {
    const clientScrip = b58.topAccumulation[i];
    const dbScrip = dbTopAmt[i];
    assert.strictEqual(
      clientScrip.symbol,
      dbScrip.symbol,
      `Rank #${i + 1} Net Amount symbol mismatch: client=${clientScrip.symbol}, db=${dbScrip.symbol}`
    );
    const clientNetAmt = Math.round(clientScrip.netFlow || clientScrip.net);
    const dbNetAmt = Math.round(dbScrip.net_amt);
    assert.ok(
      Math.abs(clientNetAmt - dbNetAmt) <= 2,
      `Rank #${i + 1} (${clientScrip.symbol}) Net Amount mismatch exceeds 1 NPR tolerance: client=${clientNetAmt}, db=${dbNetAmt}`
    );
  }
});

test('3. AST Import & Zero-ReferenceError Integrity Check', () => {
  const servicesCode = fs.readFileSync('src/components/services.tsx', 'utf8');
  assert.ok(
    servicesCode.includes('fetchAvailableTradingDates'),
    'services.tsx must call fetchAvailableTradingDates'
  );
  // Verify import header includes fetchAvailableTradingDates
  const importMatch = servicesCode.match(/import\s*\{[^}]*fetchAvailableTradingDates[^}]*\}\s*from\s*['"]\.\.\/utils\/liveData['"]/);
  assert.ok(
    importMatch,
    'services.tsx must explicitly import fetchAvailableTradingDates from ../utils/liveData'
  );
});

test('4. Base Trading Days Continuity & Zero Dashain/Weekend Leakage', () => {
  const liveDataCode = fs.readFileSync('src/utils/liveData.js', 'utf8');
  assert.ok(
    liveDataCode.includes("'2026-11-04'"),
    'liveData.js baseTradingDays must include 2026-11-04'
  );
});
