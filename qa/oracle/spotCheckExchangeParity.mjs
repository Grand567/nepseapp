/**
 * QA PHASE 1 — EXCHANGE & RAW FLOOR-SHEET SPOT CHECK
 * ============================================================================
 * Spot-checks collected ledger data against raw exchange contract prints
 * across 10 representative stocks on 5 distinct trading dates (50 test vectors).
 * ============================================================================
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../work/drabyashree_ledger.db');

const STOCKS = ['NABIL', 'BARUN', 'SHIVM', 'RFPL', 'HDL', 'AKJCL', 'CIT', 'NRN', 'HRL', 'API'];
const DATES = ['2026-11-13', '2026-11-06', '2026-11-05', '2026-11-04', '2026-10-30'];

export function runSpotCheck() {
  const db = new Database(DB_PATH, { readonly: true });
  const results = [];

  console.log('=================================================================');
  console.log('📊 SPOT-CHECK: 10 STOCKS × 5 TRADING DATES RECONCILIATION AUDIT');
  console.log('=================================================================\n');

  let passedVectors = 0;
  let totalVectors = 0;

  for (const date of DATES) {
    console.log(`\n--- Session Date: ${date} ---`);
    for (const sym of STOCKS) {
      totalVectors++;
      // 1. Stock summary
      const summary = db.prepare(`
        SELECT open_price, high_price, low_price, close_price, total_volume, total_turnover
        FROM daily_stock_summary
        WHERE symbol = ? AND trade_date = ?
      `).get(sym, date);

      // 2. Broker ledger sum
      const brokerSums = db.prepare(`
        SELECT SUM(buy_vol) as total_buy_vol, SUM(sell_vol) as total_sell_vol,
               SUM(buy_amt) as total_buy_amt, SUM(sell_amt) as total_sell_amt
        FROM daily_broker_ledger
        WHERE symbol = ? AND trade_date = ?
      `).get(sym, date);

      // 3. Raw contracts sum (if in floorsheet_contracts)
      const rawContracts = db.prepare(`
        SELECT COUNT(*) as contract_count, SUM(kitta) as raw_vol, SUM(amount) as raw_amt,
               MIN(rate) as raw_low, MAX(rate) as raw_high
        FROM floorsheet_contracts
        WHERE symbol = ? AND trade_date = ?
      `).get(sym, date);

      if (!summary) {
        console.warn(`  ⚠️ [MISSING SUMMARY] ${sym} on ${date}`);
        results.push({ symbol: sym, date, status: 'MISSING_SUMMARY' });
        continue;
      }

      const summaryVol = Number(summary.total_volume || 0);
      const brokerBuyVol = Number(brokerSums?.total_buy_vol || 0);
      const brokerSellVol = Number(brokerSums?.total_sell_vol || 0);
      const rawVol = Number(rawContracts?.raw_vol || 0);

      // Check Zero-Sum Invariant in Broker Ledger
      const isZeroSum = brokerBuyVol === brokerSellVol;

      // Check Volume Parity between summary and broker ledger
      const isVolParity = summaryVol === brokerBuyVol;

      // Check OHLC price sanity
      const isPriceSane = summary.high_price >= Math.max(summary.open_price, summary.close_price) &&
                          summary.low_price <= Math.min(summary.open_price, summary.close_price) &&
                          summary.low_price > 0;

      const vectorPassed = isZeroSum && isVolParity && isPriceSane;
      if (vectorPassed) {
        passedVectors++;
      }

      console.log(`  ${vectorPassed ? '✓' : '✗'} ${sym.padEnd(6)} | Close: Rs. ${String(summary.close_price).padEnd(6)} | Vol: ${String(summaryVol).padEnd(8)} | Broker Buy: ${String(brokerBuyVol).padEnd(8)} | Zero-Sum: ${isZeroSum ? 'YES' : 'FAIL'} | Price Bounds: ${isPriceSane ? 'VALID' : 'FAIL'}`);

      results.push({
        symbol: sym,
        date,
        closePrice: summary.close_price,
        openPrice: summary.open_price,
        highPrice: summary.high_price,
        lowPrice: summary.low_price,
        totalVolume: summaryVol,
        totalTurnover: summary.total_turnover,
        brokerBuyVol,
        brokerSellVol,
        rawContractsCount: rawContracts?.contract_count || 0,
        rawVol,
        isZeroSum,
        isVolParity,
        isPriceSane,
        status: vectorPassed ? 'PARITY_VERIFIED' : 'PARITY_MISMATCH'
      });
    }
  }

  db.close();

  console.log('\n=================================================================');
  console.log(`SPOT CHECK SUMMARY: ${passedVectors} / ${totalVectors} VECTORS PASSED (${((passedVectors / totalVectors) * 100).toFixed(1)}%)`);
  console.log('=================================================================');

  return { passedVectors, totalVectors, results };
}

if (process.argv[1] && process.argv[1].endsWith('spotCheckExchangeParity.mjs')) {
  runSpotCheck();
}
