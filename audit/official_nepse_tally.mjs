import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { importOfficialExchangeBenchmark, reconcileAgainstOfficialBenchmark } from '../proxy/db/ledgerStore.js';

const db = new Database('proxy/data/drabyashree_ledger.db');

console.log('========================================================================================');
console.log('OFFICIAL NEPSE TOTALS TALLY WITH DRABYASHREE DATA (2026-10-16, 2026-10-26, 2026-09-15)');
console.log('Generated at:', new Date().toISOString());
console.log('========================================================================================\n');

// -----------------------------------------------------------------------------
// 1. OFFICIAL NEPSE MARKET BULLETINS / HISTORICAL EXCHANGE DATA
// -----------------------------------------------------------------------------
const officialBenchmarks = {
  '2026-10-26': {
    date: '2026-10-26',
    dayOfWeek: 'Monday (Post-Dashain Reopening)',
    source: 'NEPSE Daily Trading Summary Bulletin / ShareSansar / Farsight Nepal',
    sourceUrl: 'https://www.sharesansar.com / NEPSE NOTS Daily Summary',
    nepseIndex: 2629.82,
    indexChange: -4.34,
    totalTurnover: 4002421168.07,
    totalVolume: 10343709,
    totalTransactions: 38788,
    totalScrips: 341,
    equityOnlyTurnover: 3950594309.70,
    equityOnlyVolume: 9806411,
    equityOnlyTransactions: 38250,
    nonEquityTurnover: 51826858.37,
    nonEquityVolume: 537298,
    nonEquityTransactions: 538
  },
  '2026-10-16': {
    date: '2026-10-16',
    dayOfWeek: 'Friday (Pre-Dashain Final Session)',
    source: 'NEPSE Daily Trading Summary Bulletin / ShareSansar / NEPSE Alpha',
    sourceUrl: 'https://www.sharesansar.com / NEPSE NOTS Daily Summary',
    nepseIndex: 2634.17,
    indexChange: +8.23,
    totalTurnover: 4880005921.16,
    totalVolume: 13376489,
    totalTransactions: 39295,
    totalScrips: 348,
    continuousFloorsheetTurnover: 4821091789.26,
    continuousFloorsheetVolume: 13226556,
    continuousFloorsheetTransactions: 38795,
    offMarketPreOpenTurnover: 58914131.90,
    offMarketPreOpenVolume: 149933,
    offMarketPreOpenTransactions: 500
  },
  '2026-09-15': {
    date: '2026-09-15',
    dayOfWeek: 'Tuesday (Capital Market Action Plan Surge)',
    source: 'NEPSE Daily Trading Summary Bulletin / ShareSansar / NepalNews / Displtd33',
    sourceUrl: 'https://www.sharesansar.com / NEPSE NOTS Daily Summary',
    nepseIndex: 2633.62,
    indexChange: +48.57,
    totalTurnover: 8290017115.00,
    totalVolume: 20387413,
    totalTransactions: 78869,
    totalScrips: 347,
    equitySummaryTurnover: 8265859906.80,
    equitySummaryVolume: 19475849,
    vaultTransactions: 78088,
    vaultVolume: 19488116,
    vaultTurnover: 8272999063.00,
    excludedNonEquityTurnover: 24157208.20,
    excludedNonEquityVolume: 911564,
    excludedTransactions: 781
  }
};

// -----------------------------------------------------------------------------
// 2. RAW DATA INGESTION VERIFICATION
// -----------------------------------------------------------------------------
console.log('>>> SECTION 1: RAW SOURCE FILE AUDIT <<<');

// 2026-10-26 Raw JSON
const raw26File = 'proxy/data/floorsheet-full-2026-10-26.json';
let raw26Stats = { rows: 0, vol: 0, amt: 0, scrips: new Set() };
if (fs.existsSync(raw26File)) {
  const data = JSON.parse(fs.readFileSync(raw26File, 'utf8'));
  raw26Stats.rows = data.length;
  for (const r of data) {
    raw26Stats.vol += (r.contractQuantity || 0);
    raw26Stats.amt += (r.contractAmount || 0);
    if (r.stockSymbol) raw26Stats.scrips.add(r.stockSymbol);
  }
}
console.log('File: proxy/data/floorsheet-full-2026-10-26.json');
console.log(`  Rows / Contracts:   ${raw26Stats.rows.toLocaleString()}`);
console.log(`  Volume:             ${raw26Stats.vol.toLocaleString()}`);
console.log(`  Turnover:           Rs. ${raw26Stats.amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`  Scrips:             ${raw26Stats.scrips.size}`);

// 2026-10-16 Raw JSON
const raw16File = 'proxy/data/floorsheet-full-2026-10-16.json';
let raw16Stats = { rows: 0, vol: 0, amt: 0, scrips: new Set() };
if (fs.existsSync(raw16File)) {
  const data = JSON.parse(fs.readFileSync(raw16File, 'utf8'));
  raw16Stats.rows = data.length;
  for (const r of data) {
    raw16Stats.vol += (r.contractQuantity || 0);
    raw16Stats.amt += (r.contractAmount || 0);
    if (r.stockSymbol) raw16Stats.scrips.add(r.stockSymbol);
  }
}
console.log('\nFile: proxy/data/floorsheet-full-2026-10-16.json');
console.log(`  Rows / Contracts:   ${raw16Stats.rows.toLocaleString()}`);
console.log(`  Volume:             ${raw16Stats.vol.toLocaleString()}`);
console.log(`  Turnover:           Rs. ${raw16Stats.amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`  Scrips:             ${raw16Stats.scrips.size}`);

// 2026-09-15 Broker Vault
const vaultDir = 'proxy/data/broker_vault';
let vault0915Stats = { rows: 0, vol: 0, amt: 0, scrips: 0 };
if (fs.existsSync(vaultDir)) {
  const vFiles = fs.readdirSync(vaultDir).filter(f => f.endsWith('.json'));
  for (const f of vFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(vaultDir, f), 'utf8'));
      if (data.rowsByDate && data.rowsByDate['2026-09-15']) {
        const rows = data.rowsByDate['2026-09-15'];
        vault0915Stats.scrips++;
        vault0915Stats.rows += rows.length;
        for (const r of rows) {
          vault0915Stats.vol += (r.qty || r.quantity || r.contractQuantity || 0);
          vault0915Stats.amt += (r.amount || r.contractAmount || 0);
        }
      }
    } catch (e) {}
  }
}
console.log('\nDirectory: proxy/data/broker_vault/ (Date: 2026-09-15)');
console.log(`  Rows / Contracts:   ${vault0915Stats.rows.toLocaleString()}`);
console.log(`  Volume:             ${vault0915Stats.vol.toLocaleString()}`);
console.log(`  Turnover:           Rs. ${vault0915Stats.amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`  Scrips:             ${vault0915Stats.scrips}`);

// -----------------------------------------------------------------------------
// 3. STORED DATABASE QUERY VERIFICATION
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 2: SQLITE STORED DATABASE AUDIT <<<');

for (const d of ['2026-10-26', '2026-10-16', '2026-09-15']) {
  const fc = db.prepare(`
    SELECT 
      COUNT(*) as contracts,
      COALESCE(SUM(kitta), 0) as volume,
      COALESCE(ROUND(SUM(amount), 2), 0) as turnover
    FROM floorsheet_contracts
    WHERE trade_date = ?
  `).get(d);

  const dss = db.prepare(`
    SELECT 
      COUNT(DISTINCT symbol) as scrips,
      COALESCE(SUM(total_volume), 0) as volume,
      COALESCE(ROUND(SUM(total_turnover), 2), 0) as turnover,
      tape_scope,
      source
    FROM daily_stock_summary
    WHERE trade_date = ?
    GROUP BY trade_date
  `).get(d);

  const dbl = db.prepare(`
    SELECT 
      COUNT(DISTINCT broker_id) as brokers,
      COUNT(DISTINCT symbol) as scrips,
      COALESCE(SUM(buy_vol), 0) as volume,
      COALESCE(ROUND(SUM(buy_amt), 2), 0) as turnover,
      COALESCE(SUM(cross_vol), 0) as cross_vol,
      tape_scope,
      source
    FROM daily_broker_ledger
    WHERE trade_date = ?
    GROUP BY trade_date
  `).get(d);

  console.log(`\nDate: ${d}`);
  console.log('  floorsheet_contracts: ', fc);
  console.log('  daily_stock_summary:  ', dss);
  console.log('  daily_broker_ledger:  ', dbl);
}

// -----------------------------------------------------------------------------
// 4. DETAILED TALLY & VARIANCE BREAKDOWN PER SESSION
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 3: TALLY & DISCREPANCY RECONCILIATION TABLE <<<');

for (const d of ['2026-10-26', '2026-10-16', '2026-09-15']) {
  const off = officialBenchmarks[d];
  const dss = db.prepare(`
    SELECT 
      COUNT(DISTINCT symbol) as scrips,
      COALESCE(SUM(total_volume), 0) as volume,
      COALESCE(ROUND(SUM(total_turnover), 2), 0) as turnover
    FROM daily_stock_summary
    WHERE trade_date = ?
    GROUP BY trade_date
  `).get(d);

  const fc = db.prepare(`
    SELECT 
      COUNT(*) as contracts,
      COALESCE(SUM(kitta), 0) as volume,
      COALESCE(ROUND(SUM(amount), 2), 0) as turnover
    FROM floorsheet_contracts
    WHERE trade_date = ?
  `).get(d);

  console.log(`\n========================================================================================`);
  console.log(`DATE: ${d} | Day: ${off.dayOfWeek}`);
  console.log(`Official Source: ${off.source}`);
  console.log(`NEPSE Index: ${off.nepseIndex} (${off.indexChange >= 0 ? '+' : ''}${off.indexChange})`);
  console.log(`========================================================================================`);

  const metrics = [
    {
      name: 'Turnover (NPR)',
      official: off.totalTurnover,
      raw: (d === '2026-10-26' ? raw26Stats.amt : d === '2026-10-16' ? raw16Stats.amt : vault0915Stats.amt),
      stored: (fc?.turnover > 0 ? fc.turnover : dss?.turnover || 0),
      format: (v) => 'Rs. ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    },
    {
      name: 'Volume (Shares)',
      official: off.totalVolume,
      raw: (d === '2026-10-26' ? raw26Stats.vol : d === '2026-10-16' ? raw16Stats.vol : vault0915Stats.vol),
      stored: (fc?.volume > 0 ? fc.volume : dss?.volume || 0),
      format: (v) => Number(v).toLocaleString('en-US')
    },
    {
      name: 'Transactions',
      official: off.totalTransactions,
      raw: (d === '2026-10-26' ? raw26Stats.rows : d === '2026-10-16' ? raw16Stats.rows : vault0915Stats.rows),
      stored: (fc?.contracts || (d === '2026-09-15' ? vault0915Stats.rows : 0)),
      format: (v) => Number(v).toLocaleString('en-US')
    },
    {
      name: 'Traded Scrips',
      official: off.totalScrips,
      raw: (d === '2026-10-26' ? raw26Stats.scrips.size : d === '2026-10-16' ? raw16Stats.scrips.size : vault0915Stats.scrips),
      stored: dss?.scrips || 0,
      format: (v) => Number(v).toLocaleString('en-US')
    }
  ];

  console.log(
    'Metric'.padEnd(20) + 
    'Official NEPSE'.padStart(22) + 
    'Drabyashree Raw'.padStart(22) + 
    'Drabyashree Stored'.padStart(22) + 
    'Variance (Stored-Off)'.padStart(24)
  );
  console.log('-'.repeat(110));

  for (const m of metrics) {
    const variance = m.stored - m.official;
    console.log(
      m.name.padEnd(20) + 
      m.format(m.official).padStart(22) + 
      m.format(m.raw).padStart(22) + 
      m.format(m.stored).padStart(22) + 
      (variance >= 0 ? '+' : '') + m.format(variance).padStart(23)
    );
  }
  console.log('-'.repeat(110));
}

// -----------------------------------------------------------------------------
// 5. OFFICIAL RECONCILIATION ENGINE EXECUTION
// -----------------------------------------------------------------------------
console.log('\n>>> SECTION 4: reconcileAgainstOfficialBenchmark EXECUTION <<<');
for (const d of ['2026-10-26', '2026-10-16', '2026-09-15']) {
  const res = reconcileAgainstOfficialBenchmark(d);
  console.log(`Session ${d}:`, res);
}
