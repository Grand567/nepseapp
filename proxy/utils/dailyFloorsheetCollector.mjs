// proxy/utils/dailyFloorsheetCollector.mjs
/**
 * Daily Floorsheet Automated Downloader & Local Storage Vault
 * 
 * - Downloads everyday market floorsheet after 3:00 PM NPT (post-market close).
 * - Saves complete raw trade records into dedicated local folder:
 *     proxy/data/daily_floorsheets/floorsheet-YYYY-MM-DD.json
 *     proxy/data/daily_floorsheets/floorsheet-YYYY-MM-DD.json.gz
 * - Ingests contracts into SQLite ledger for instant zero-latency calculations across:
 *     Broker Accumulation View, Floorsheet Hub, A/D Radar, and Telemetry endpoints.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { db } from '../db/ledgerStore.js';
import { getFullSessionFloorsheet, setContractsIngestor, getBrokerName } from '../brokerVault.mjs';
import { uploadDailyFloorsheetToR2, fetchFloorsheetFromR2 } from './cloudFloorsheetVault.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { DAILY_FLOORSHEETS_DIR } from './floorsheetPaths.mjs';

// Index metadata file path
const INDEX_FILE = path.join(DAILY_FLOORSHEETS_DIR, 'archive_index.json');

/**
 * Load or initialize the archive index
 */
export function getArchiveIndex() {
  if (fs.existsSync(INDEX_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return [];
}

/**
 * Save archive index
 */
function saveArchiveIndex(indexList) {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexList, null, 2), 'utf8');
  } catch (err) {
    console.warn('[dailyFloorsheetCollector] Failed to save archive index:', err.message);
  }
}

/**
 * Automatically export cumulative broker ledger to src/data/nepse_cumulative_broker_ledger.json
 * Recomputes multi-session institutional cost basis, net cash breakeven, and top accumulators/distributors.
 */
export function exportCumulativeBrokerLedger(databaseInstance = db) {
  if (!databaseInstance) return null;
  try {
    const dbSymbols = databaseInstance.prepare(
      `SELECT DISTINCT symbol FROM daily_broker_ledger WHERE symbol IS NOT NULL AND symbol != ''`
    ).all().map(r => r.symbol);
    const alltimeDir = path.resolve(process.cwd(), 'proxy', 'data', 'broker_alltime');
    const alltimeFiles = fs.existsSync(alltimeDir)
      ? fs.readdirSync(alltimeDir).filter(f => f.endsWith('.json') && f !== 'crawler_progress.json').map(f => f.replace('.json', ''))
      : [];
    const symbols = Array.from(new Set([...dbSymbols, ...alltimeFiles])).sort();

    const coverageRow = databaseInstance.prepare(`
      SELECT MIN(trade_date) as startDate, MAX(trade_date) as endDate, COUNT(DISTINCT trade_date) as sessionCount
      FROM daily_broker_ledger
    `).get();
    const startDate = coverageRow?.startDate || '2026-08-27';
    const endDate = coverageRow?.endDate || '2026-11-06';
    const sessionCount = coverageRow?.sessionCount || 42;

    const ledgerMap = {};

    const queryBrokersForSymbol = databaseInstance.prepare(`
      SELECT 
        broker_id,
        SUM(buy_vol) as buyVol,
        SUM(sell_vol) as sellVol,
        SUM(buy_amt) as buyAmt,
        SUM(sell_amt) as sellAmt,
        (SUM(buy_vol) - SUM(sell_vol)) as netQty,
        (SUM(buy_amt) - SUM(sell_amt)) as netAmt,
        ROUND(SUM(buy_amt) / NULLIF(SUM(buy_vol), 0), 1) as avgBuyRate,
        ROUND(SUM(sell_amt) / NULLIF(SUM(sell_vol), 0), 1) as avgSellRate
      FROM daily_broker_ledger
      WHERE symbol = ?
      GROUP BY broker_id
    `);

    for (const sym of symbols) {
      let rows = queryBrokersForSymbol ? queryBrokersForSymbol.all(sym) : [];

      let symStartDate = startDate;
      let symEndDate = endDate;
      let symSessionCount = sessionCount;

      const alltimePath = path.resolve(process.cwd(), 'proxy', 'data', 'broker_alltime', `${sym}.json`);
      if (fs.existsSync(alltimePath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(alltimePath, 'utf8'));
          if (parsed && parsed.dailyRollup && Object.keys(parsed.dailyRollup).length > (rows.length > 0 ? sessionCount : 0)) {
            const dates = Object.keys(parsed.dailyRollup).sort();
            symStartDate = dates[0];
            symEndDate = dates[dates.length - 1];
            symSessionCount = dates.length;

            const brokerAggMap = new Map();
            for (const dt of dates) {
              const day = parsed.dailyRollup[dt];
              for (const bId in day) {
                const [bQty, sQty, bAmt, sAmt] = day[bId];
                const cur = brokerAggMap.get(bId) || { buy_vol: 0, sell_vol: 0, buy_amt: 0, sell_amt: 0 };
                cur.buy_vol += bQty;
                cur.sell_vol += sQty;
                cur.buy_amt += bAmt;
                cur.sell_amt += sAmt;
                brokerAggMap.set(bId, cur);
              }
            }

            // Seamlessly incorporate newer settled sessions from SQLite daily_broker_ledger
            if (databaseInstance) {
              try {
                const newerRows = databaseInstance.prepare(`
                  SELECT broker_id, trade_date, buy_vol, sell_vol, buy_amt, sell_amt
                  FROM daily_broker_ledger
                  WHERE symbol = ? AND trade_date > ?
                `).all(sym, dates[dates.length - 1]);
                if (newerRows.length > 0) {
                  const newerDates = new Set();
                  for (const nr of newerRows) {
                    newerDates.add(nr.trade_date);
                    const bId = String(nr.broker_id);
                    const cur = brokerAggMap.get(bId) || { buy_vol: 0, sell_vol: 0, buy_amt: 0, sell_amt: 0 };
                    cur.buy_vol += Number(nr.buy_vol || 0);
                    cur.sell_vol += Number(nr.sell_vol || 0);
                    cur.buy_amt += Number(nr.buy_amt || 0);
                    cur.sell_amt += Number(nr.sell_amt || 0);
                    brokerAggMap.set(bId, cur);
                  }
                  const sortedNewer = Array.from(newerDates).sort();
                  symEndDate = sortedNewer[sortedNewer.length - 1];
                  symSessionCount += sortedNewer.length;
                }
              } catch (_) {}
            }
            rows = Array.from(brokerAggMap.entries()).map(([bId, d]) => ({
              broker_id: parseInt(bId, 10) || bId,
              buyVol: d.buy_vol,
              sellVol: d.sell_vol,
              buyAmt: d.buy_amt,
              sellAmt: d.sell_amt,
              netQty: d.buy_vol - d.sell_vol,
              netAmt: d.buy_amt - d.sell_amt,
              avgBuyRate: d.buy_vol > 0 ? Number((d.buy_amt / d.buy_vol).toFixed(1)) : 0,
              avgSellRate: d.sell_vol > 0 ? Number((d.sell_amt / d.sell_vol).toFixed(1)) : 0
            }));
          }
        } catch (_) {}
      }

      if (!rows || rows.length === 0) continue;

      let totalVol = 0;
      let totalBuyAmtAcc = 0;
      let totalBuyVolAcc = 0;
      let totalNetCashAcc = 0;
      let totalNetQtyAcc = 0;

      const accumulators = [];
      const distributors = [];

      for (const r of rows) {
        totalVol += (r.buyVol + r.sellVol);
        if (r.netQty > 0) {
          accumulators.push({
            broker: String(r.broker_id),
            netQty: r.netQty,
            buyVol: r.buyVol,
            sellVol: r.sellVol,
            avgBuyRate: r.avgBuyRate || 0,
            avgSellRate: r.avgSellRate || 0,
            netAmt: Math.round(r.netAmt || 0)
          });
        } else if (r.netQty < 0) {
          distributors.push({
            broker: String(r.broker_id),
            netQty: r.netQty,
            buyVol: r.buyVol,
            sellVol: r.sellVol,
            avgBuyRate: r.avgBuyRate || 0,
            avgSellRate: r.avgSellRate || 0,
            netAmt: Math.round(r.netAmt || 0)
          });
        }
      }

      accumulators.sort((a, b) => b.netQty - a.netQty);
      distributors.sort((a, b) => a.netQty - b.netQty);

      const topAcc = accumulators.slice(0, 4);
      const topDist = distributors.slice(0, 4);

      for (const a of topAcc) {
        totalBuyAmtAcc += (a.buyVol * a.avgBuyRate);
        totalBuyVolAcc += a.buyVol;
        totalNetCashAcc += a.netAmt;
        totalNetQtyAcc += a.netQty;
      }

      const institutionalCostBasis = totalBuyVolAcc > 0 ? +(totalBuyAmtAcc / totalBuyVolAcc).toFixed(1) : 0;
      const netCashBreakeven = totalNetQtyAcc > 0 ? +(totalNetCashAcc / totalNetQtyAcc).toFixed(1) : institutionalCostBasis;

      const top3BuyVol = accumulators.slice(0, 3).reduce((sum, a) => sum + a.buyVol, 0);
      const top3SellVol = distributors.slice(0, 3).reduce((sum, d) => sum + d.sellVol, 0);
      const totalHalfVol = Math.max(1, totalVol / 2);
      const bcr3Cumulative = +(Math.min(100, (top3BuyVol / totalHalfVol) * 100)).toFixed(1);
      const scr3Cumulative = +(Math.min(100, (top3SellVol / totalHalfVol) * 100)).toFixed(1);
      const smartMoneyNetFlowPct = +(bcr3Cumulative - scr3Cumulative).toFixed(1);

      const totalSharesHeldTillNow = accumulators.reduce((sum, a) => sum + a.netQty, 0);
      const allHoldings = accumulators.map(a => ({
        broker: a.broker,
        id: a.broker,
        brokerId: a.broker,
        netQty: a.netQty,
        holdQty: a.netQty,
        totalHeldQty: a.netQty,
        buyVol: a.buyVol,
        sellVol: a.sellVol,
        avgBuyRate: a.avgBuyRate,
        holdingSharePct: totalSharesHeldTillNow > 0 ? Number(((a.netQty / totalSharesHeldTillNow) * 100).toFixed(2)) : 0
      }));
      const allDistributors = distributors.map(d => ({
        broker: d.broker,
        id: d.broker,
        brokerId: d.broker,
        netQty: d.netQty,
        holdQty: 0,
        totalHeldQty: 0,
        buyVol: d.buyVol,
        sellVol: d.sellVol,
        avgSellRate: d.avgSellRate
      }));

      ledgerMap[sym] = {
        symbol: sym,
        totalVolume: Math.round(totalVol / 2),
        totalSharesHeldTillNow,
        totalHoldQty: totalSharesHeldTillNow,
        bcr3Cumulative,
        scr3Cumulative,
        smartMoneyNetFlowPct,
        institutionalCostBasis,
        netCashBreakeven,
        topAccumulators: topAcc.map(a => ({
          broker: a.broker,
          netQty: a.netQty,
          buyVol: a.buyVol,
          sellVol: a.sellVol,
          avgBuyRate: a.avgBuyRate
        })),
        allHoldings,
        topHoldings: allHoldings.slice(0, 15),
        topDistributors: topDist.map(d => ({
          broker: d.broker,
          netQty: d.netQty,
          buyVol: d.buyVol,
          sellVol: d.sellVol,
          avgSellRate: d.avgSellRate
        })),
        allDistributors,
        coverage: {
          startDate: symStartDate,
          endDate: symEndDate,
          sessionCount: symSessionCount,
          tradingDays: symSessionCount,
          isLifetime: false,
          label: `Since ${symStartDate} (${symSessionCount} sessions)`,
          disclaimer: `Covered from ${symStartDate} to ${symEndDate} (${symSessionCount} sessions). Pre-${symStartDate} baseline unknown. Unadjusted for corporate actions.`,
          isLiveIncomplete: false,
          lastUpdated: new Date().toISOString()
        }
      };
    }

    const outPath = path.resolve(process.cwd(), 'src', 'data', 'nepse_cumulative_broker_ledger.json');
    try {
      fs.writeFileSync(outPath, JSON.stringify(ledgerMap, null, 2), 'utf8');
      console.log(`[dailyFloorsheetCollector] Synced cumulative broker ledger (${Object.keys(ledgerMap).length} symbols) to ${outPath}`);
    } catch (writeErr) {
      console.warn(`[dailyFloorsheetCollector] Failed to write cumulative broker ledger file:`, writeErr.message);
    }

    // Also export src/data/broker_holdings_alltime.json from SQLite daily_broker_ledger so client seed matches live SQLite truth (BUG-005 & BUG-032)
    try {
      exportBrokerHoldingsAllTimeSeed(databaseInstance);
    } catch (seedErr) {
      console.warn(`[dailyFloorsheetCollector] Failed to export broker_holdings_alltime.json:`, seedErr.message);
    }

    return ledgerMap;
  } catch (err) {
    console.error(`[dailyFloorsheetCollector] exportCumulativeBrokerLedger error:`, err.message);
    return null;
  }
}

/**
 * Synchronizes proxy/data/broker_alltime/*.json and proxy/data/broker_vault/*.json with SQLite daily_broker_ledger
 * so every symbol's dailyRollup, rowsByDate/preAggregated, and latestDate stay current through the latest closed session (BUG-005 & BUG-032).
 */
export function syncBrokerAllTimeAndVaultFiles(databaseInstance = db) {
  if (!databaseInstance) return { updatedAlltime: 0, updatedVault: 0 };
  const alltimeDir = path.resolve(process.cwd(), 'proxy', 'data', 'broker_alltime');
  const vaultDir = path.resolve(process.cwd(), 'proxy', 'data', 'broker_vault');
  let updatedAlltime = 0;
  let updatedVault = 0;

  try {
    const dbRows = databaseInstance.prepare(`
      SELECT symbol, trade_date, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
      FROM daily_broker_ledger
      WHERE (is_quarantined = 0 OR is_quarantined IS NULL)
      ORDER BY trade_date ASC
    `).all();

    const bySym = new Map();
    for (const r of dbRows) {
      const sym = String(r.symbol || '').toUpperCase().trim();
      if (!sym || !r.trade_date) continue;
      if (!bySym.has(sym)) bySym.set(sym, new Map());
      const dateMap = bySym.get(sym);
      if (!dateMap.has(r.trade_date)) dateMap.set(r.trade_date, {});
      dateMap.get(r.trade_date)[String(r.broker_id)] = [
        Number(r.buy_vol || 0),
        Number(r.sell_vol || 0),
        Number(r.buy_amt || 0),
        Number(r.sell_amt || 0),
        1
      ];
    }

    if (fs.existsSync(alltimeDir)) {
      for (const [sym, dateMap] of bySym.entries()) {
        if (!/^[A-Z0-9_-]+$/.test(sym)) continue;
        const p = path.join(alltimeDir, `${sym}.json`);
        try {
          let obj = null;
          if (fs.existsSync(p)) {
            try { obj = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
          }
          if (!obj || typeof obj !== 'object') {
            obj = {
              symbol: sym,
              version: 1,
              updatedAt: null,
              isCompleteHistory: false,
              earliestDate: null,
              latestDate: null,
              sessionsCount: 0,
              dailyRollup: {}
            };
          }
          if (!obj.dailyRollup) obj.dailyRollup = {};
          let changed = false;
          for (const [dt, dayBrokers] of dateMap.entries()) {
            if (!obj.dailyRollup[dt] || Object.keys(obj.dailyRollup[dt]).length === 0) {
              obj.dailyRollup[dt] = dayBrokers;
              changed = true;
            }
          }
          const dts = Object.keys(obj.dailyRollup).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort((a, b) => b.localeCompare(a));
          const newest = dts[0] || null;
          const oldest = dts[dts.length - 1] || null;
          if (changed || obj.latestDate !== newest || obj.sessionsCount !== dts.length) {
            obj.latestDate = newest;
            obj.earliestDate = oldest;
            obj.sessionsCount = dts.length;
            obj.updatedAt = new Date().toISOString();
            fs.writeFileSync(p, JSON.stringify(obj), 'utf8');
            updatedAlltime++;
          }
        } catch (_) {}
      }
    }

    if (fs.existsSync(vaultDir)) {
      const files = fs.readdirSync(vaultDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const sym = file.replace(/\.json$/i, '').toUpperCase();
        const p = path.join(vaultDir, file);
        try {
          const vObj = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (!vObj || typeof vObj !== 'object') continue;
          if (!vObj.rowsByDate) vObj.rowsByDate = {};
          const symDates = bySym.get(sym);
          let changed = false;
          if (symDates) {
            for (const [dt, dayBrokers] of symDates.entries()) {
              if (!vObj.rowsByDate[dt] || !Array.isArray(vObj.rowsByDate[dt]) || vObj.rowsByDate[dt].length === 0) {
                const synthRows = [];
                for (const [bId, arr] of Object.entries(dayBrokers)) {
                  const [bVol, sVol, bAmt, sAmt] = arr;
                  if (bVol > 0) {
                    synthRows.push({ buyerBroker: bId, sellerBroker: '', qty: bVol, rate: +(bAmt / bVol).toFixed(2), amount: bAmt, businessDate: dt });
                  }
                  if (sVol > 0) {
                    synthRows.push({ buyerBroker: '', sellerBroker: bId, qty: sVol, rate: +(sAmt / sVol).toFixed(2), amount: sAmt, businessDate: dt });
                  }
                }
                if (synthRows.length > 0) {
                  vObj.rowsByDate[dt] = synthRows;
                  changed = true;
                }
              }
            }
          }
          const dts = Object.keys(vObj.rowsByDate).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort((a, b) => b.localeCompare(a));
          const newest = dts[0] || null;
          if (changed || vObj.latestDate !== newest) {
            vObj.latestDate = newest;
            vObj.updatedAt = new Date().toISOString();
            fs.writeFileSync(p, JSON.stringify(vObj), 'utf8');
            updatedVault++;
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[dailyFloorsheetCollector] syncBrokerAllTimeAndVaultFiles error:', err.message);
  }

  return { updatedAlltime, updatedVault };
}

/**
 * Exports per-broker top net holdings from SQLite daily_broker_ledger into src/data/broker_holdings_alltime.json
 */
export function exportBrokerHoldingsAllTimeSeed(databaseInstance = db) {
  if (!databaseInstance) return null;
  try {
    const brokerRows = databaseInstance.prepare(`
      SELECT DISTINCT broker_id FROM daily_broker_ledger WHERE broker_id IS NOT NULL ORDER BY broker_id ASC
    `).all();
    const queryForBroker = databaseInstance.prepare(`
      SELECT UPPER(symbol) as symbol,
             SUM(buy_vol) as totalBuyVol,
             SUM(sell_vol) as totalSellVol,
             SUM(buy_vol) - SUM(sell_vol) as cumHoldQty,
             SUM(buy_amt) as totalBuyAmt,
             SUM(sell_amt) as totalSellAmt,
             COUNT(DISTINCT trade_date) as activeSessions
      FROM daily_broker_ledger
      WHERE broker_id = ?
      GROUP BY UPPER(symbol)
      HAVING cumHoldQty > 0
      ORDER BY cumHoldQty DESC
      LIMIT 25
    `);

    const seedMap = {};
    for (const br of brokerRows) {
      const bNum = Number(br.broker_id);
      if (!bNum) continue;
      const bId = String(bNum);
      const brokerName = getBrokerName(bId);
      const rows = queryForBroker.all(bNum);
      let totalSharesHeld = 0;
      const topHoldings = rows.map((r, idx) => {
        const buyVol = Number(r.totalBuyVol || 0);
        const sellVol = Number(r.totalSellVol || 0);
        const holdQty = Number(r.cumHoldQty || 0);
        const buyAmt = Number(r.totalBuyAmt || 0);
        const sellAmt = Number(r.totalSellAmt || 0);
        const avgBuyRate = buyVol > 0 ? +(buyAmt / buyVol).toFixed(2) : 0;
        const avgSellRate = sellVol > 0 ? +(sellAmt / sellVol).toFixed(2) : 0;
        const retentionPct = buyVol > 0 ? +((holdQty / buyVol) * 100).toFixed(1) : 100;
        const netAmt = Math.round(holdQty * avgBuyRate);
        totalSharesHeld += holdQty;
        return {
          rank: idx + 1,
          symbol: r.symbol,
          brokerId: bId,
          brokerName,
          cumHoldQty: holdQty,
          netQty: holdQty,
          totalBuyVol: buyVol,
          totalSellVol: sellVol,
          avgBuyRate,
          avgSellRate,
          retentionPct,
          totalBuyAmt: buyAmt,
          totalSellAmt: sellAmt,
          netAmt,
          activeSessions: r.activeSessions
        };
      });

      seedMap[bId] = {
        brokerId: bId,
        brokerName,
        totalHoldingsCount: topHoldings.length,
        totalSharesHeld,
        topHoldings
      };
    }

    const seedPath = path.resolve(process.cwd(), 'src', 'data', 'broker_holdings_alltime.json');
    fs.writeFileSync(seedPath, JSON.stringify(seedMap, null, 2), 'utf8');
    return seedMap;
  } catch (err) {
    console.warn('[dailyFloorsheetCollector] exportBrokerHoldingsAllTimeSeed error:', err.message);
    return null;
  }
}

/**
 * Ingest contracts into SQLite ledger tables:
 * - floorsheet_contracts
 * - daily_broker_ledger
 * - daily_stock_summary
 */
export function ingestContractsToLedger(tradeDate, trades = []) {
  if (!db || !Array.isArray(trades) || trades.length === 0) return 0;
  
  const cleanDate = String(tradeDate || '').trim();
  if (!cleanDate) return 0;

  const hasValidBrokers = trades.some((t) => {
    const b = parseInt(String(t?.buyerMemberId || t?.buyerBroker || t?.buyer_broker || t?.buyer || 0).replace(/^0+/, ''), 10) || 0;
    const s = parseInt(String(t?.sellerMemberId || t?.sellerBroker || t?.seller_broker || t?.seller || 0).replace(/^0+/, ''), 10) || 0;
    return b > 0 && s > 0;
  });
  if (!hasValidBrokers) {
    console.warn(`[dailyFloorsheetCollector] Rejecting masked intraday batch (${trades.length} contracts with 0 valid brokers) for ${cleanDate} from EOD SQLite ledger.`);
    return 0;
  }

  try {
    const deletePartialContracts = db.prepare(`DELETE FROM floorsheet_contracts WHERE trade_date = ? AND (buyer_broker <= 0 OR seller_broker <= 0 OR COALESCE(is_quarantined, 0) = 1)`);
    const insertContract = db.prepare(`
      INSERT INTO floorsheet_contracts (
        contract_no, symbol, trade_date, trade_time,
        buyer_broker, seller_broker, kitta, rate, amount,
        aggressor_side, is_internal_cross, is_whale_print,
        is_quarantined, calendar_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'VALID')
      ON CONFLICT(contract_no) DO UPDATE SET
        symbol = excluded.symbol,
        trade_date = excluded.trade_date,
        trade_time = excluded.trade_time,
        buyer_broker = excluded.buyer_broker,
        seller_broker = excluded.seller_broker,
        kitta = excluded.kitta,
        rate = excluded.rate,
        amount = excluded.amount,
        aggressor_side = excluded.aggressor_side,
        is_internal_cross = excluded.is_internal_cross,
        is_whale_print = excluded.is_whale_print,
        is_quarantined = 0,
        calendar_status = 'VALID'
    `);

    const brokerSummaryMap = new Map(); // key: symbol:brokerId -> { buyVol, sellVol, buyAmt, sellAmt, crossVol }
    const stockSummaryMap = new Map();  // key: symbol -> { open, high, low, close, volume, turnover, trades }

    const tx = db.transaction((rows) => {
      let inserted = 0;
      deletePartialContracts.run(cleanDate);
      // Sort chronologically (earliest to latest) so open_price and close_price (LTP) are accurately established
      const sortedRows = [...rows].sort((a, b) => {
        const timeA = String(a.tradeTime || a.trade_time || a.contractId || a.contract_no || '');
        const timeB = String(b.tradeTime || b.trade_time || b.contractId || b.contract_no || '');
        return timeA.localeCompare(timeB);
      });

      const lastRateBySym = new Map();
      const lastAggBySym = new Map();

      for (const t of sortedRows) {
        const cNo = String(t.contractId || t.contractNo || t.id || `${cleanDate.replace(/-/g, '')}-${inserted}`);
        const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
        if (!sym) continue;

        const bBroker = parseInt(String(t.buyerMemberId || t.buyerBroker || t.buyer_broker || t.buyer || 0).replace(/^0+/, ''), 10) || 0;
        const sBroker = parseInt(String(t.sellerMemberId || t.sellerBroker || t.seller_broker || t.seller || 0).replace(/^0+/, ''), 10) || 0;
        if (bBroker <= 0 || sBroker <= 0) continue;
        const kitta = Math.round(Number(t.contractQuantity ?? t.qty ?? t.quantity ?? t.kitta ?? t.shares ?? 0));
        const rate = Number(t.contractRate ?? t.rate ?? t.price ?? t.executionRate ?? 0);
        const amount = Number(t.contractAmount ?? t.amount ?? (kitta * rate) ?? 0);
        const tTime = String(t.tradeTime || t.businessDate || `${cleanDate} 15:00:00`);
        const isCross = bBroker > 0 && bBroker === sBroker ? 1 : 0;
        const isWhale = kitta >= 500 ? 1 : 0;
        
        // Accurate side classification using Tick Rule instead of broker number comparison
        const prevRate = lastRateBySym.get(sym);
        let agg = t.aggressor || 'UNKNOWN';
        if (!t.aggressor && prevRate !== undefined) {
          if (rate > prevRate) agg = 'BUY';
          else if (rate < prevRate) agg = 'SELL';
          else agg = lastAggBySym.get(sym) || 'UNKNOWN';
        }
        lastRateBySym.set(sym, rate);
        lastAggBySym.set(sym, agg);

        insertContract.run(
          cNo, sym, cleanDate, tTime,
          bBroker, sBroker, kitta, rate, amount,
          agg, isCross, isWhale
        );
        inserted++;

        // Aggregate per-broker
        if (bBroker > 0) {
          const keyB = `${sym}:${bBroker}`;
          const cur = brokerSummaryMap.get(keyB) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
          cur.buyVol += kitta;
          cur.buyAmt += amount;
          if (isCross) cur.crossVol += kitta;
          brokerSummaryMap.set(keyB, cur);
        }
        if (sBroker > 0) {
          const keyS = `${sym}:${sBroker}`;
          const cur = brokerSummaryMap.get(keyS) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
          cur.sellVol += kitta;
          cur.sellAmt += amount;
          brokerSummaryMap.set(keyS, cur);
        }

        // Aggregate per-stock
        const stockAgg = stockSummaryMap.get(sym) || {
          open: rate, high: rate, low: rate, close: rate,
          volume: 0, turnover: 0, trades: 0
        };
        stockAgg.high = Math.max(stockAgg.high, rate);
        stockAgg.low = Math.min(stockAgg.low, rate);
        stockAgg.close = rate;
        stockAgg.volume += kitta;
        stockAgg.turnover += amount;
        stockAgg.trades += 1;
        stockSummaryMap.set(sym, stockAgg);
      }
      return inserted;
    });

    const totalInserted = tx(trades);

    // Ingest aggregated broker ledger (Idempotent: wipe prior records for session before inserting)
    if (brokerSummaryMap.size > 0) {
      const deleteBroker = db.prepare(`DELETE FROM daily_broker_ledger WHERE trade_date = ?`);
      const insertBroker = db.prepare(`
        INSERT INTO daily_broker_ledger (
          trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt, cross_vol,
          is_quarantined, calendar_status, tape_scope, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'VALID', 'FULL_TAPE', 'DAILY_COLLECTOR')
      `);
      const brokerTx = db.transaction(() => {
        deleteBroker.run(cleanDate);
        for (const [key, data] of brokerSummaryMap.entries()) {
          const [sym, bIdStr] = key.split(':');
          insertBroker.run(cleanDate, sym, parseInt(bIdStr, 10), data.buyVol, data.sellVol, data.buyAmt, data.sellAmt, data.crossVol);
        }
      });
      brokerTx();
    }

    // Ingest aggregated stock summary (Idempotent: wipe prior records for session before inserting)
    if (stockSummaryMap.size > 0) {
      const deleteStock = db.prepare(`DELETE FROM daily_stock_summary WHERE trade_date = ?`);
      const insertStock = db.prepare(`
        INSERT INTO daily_stock_summary (
          trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover,
          is_quarantined, calendar_status, tape_scope, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'VALID', 'FULL_TAPE', 'DAILY_COLLECTOR')
      `);
      const stockTx = db.transaction(() => {
        deleteStock.run(cleanDate);
        for (const [sym, s] of stockSummaryMap.entries()) {
          insertStock.run(cleanDate, sym, s.open, s.high, s.low, s.close, s.volume, s.turnover);
        }
      });
      stockTx();
    }

    console.log(`[dailyFloorsheetCollector] Ingested ${totalInserted} contracts into drabyashree_ledger.db for ${cleanDate}.`);

    // Automatically recalculate and sync cumulative broker ledger JSON for frontend / offline APK
    if (process.env.NEPSE_SKIP_STATIC_EXPORTS !== '1') {
      try {
        syncBrokerAllTimeAndVaultFiles(db);
        exportCumulativeBrokerLedger(db);
      } catch (exportErr) {
        console.warn('[dailyFloorsheetCollector] Auto-export cumulative ledger warning:', exportErr.message);
      }
    }

    return totalInserted;
  } catch (err) {
    console.error(`[dailyFloorsheetCollector] Ingestion error for ${cleanDate}:`, err.message);
    return 0;
  }
}

try {
  setContractsIngestor(ingestContractsToLedger);
} catch (_) {}

/**
 * Downloads and archives the floorsheet locally into DAILY_FLOORSHEETS_DIR
 * @param {string} dateStr - Target date (YYYY-MM-DD). If omitted, defaults to current NPT session date.
 * @param {object} options - Options { force?: boolean }
 */
export async function downloadAndArchiveDailyFloorsheet(dateStr = '', options = {}) {
  const nowNpt = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
  const targetDate = String(dateStr || nowNpt.toISOString().split('T')[0]).trim();

  const jsonFilePath = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${targetDate}.json`);
  const gzFilePath = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${targetDate}.json.gz`);

  console.log(`[dailyFloorsheetCollector] Initiating local floorsheet download for session: ${targetDate}...`);

  // Check if already archived locally and not forced
  if (!options?.force && fs.existsSync(jsonFilePath)) {
    try {
      const stat = fs.statSync(jsonFilePath);
      if (stat.size > 1000) {
        console.log(`[dailyFloorsheetCollector] Already downloaded locally: ${jsonFilePath} (${(stat.size / 1024).toFixed(1)} KB)`);
        const cachedTrades = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

        // ── Date Mislabeling Guard ──
        // Validate that the cached file actually contains data for targetDate.
        // Cross-check by sampling the first trade's businessDate.
        const sampleTrade = cachedTrades[0];
        const embeddedDate = String(
          sampleTrade?.businessDate || sampleTrade?.trade_date || sampleTrade?.tradeDate || ''
        ).split('T')[0].trim();
        if (embeddedDate && embeddedDate !== targetDate) {
          console.warn(`[dailyFloorsheetCollector] ⚠️ Date mislabeling detected! File ${jsonFilePath} contains data for ${embeddedDate} but was labeled ${targetDate}. Deleting stale file and re-fetching.`);
          try { fs.unlinkSync(jsonFilePath); } catch (_) {}
          try { if (fs.existsSync(gzFilePath)) fs.unlinkSync(gzFilePath); } catch (_) {}
          // Fall through to re-fetch below
        } else {
          const fileHasValidBrokers = cachedTrades.some((t) => {
            const b = parseInt(String(t?.buyerMemberId || t?.buyerBroker || t?.buyer_broker || t?.buyer || 0).replace(/^0+/, ''), 10) || 0;
            const s = parseInt(String(t?.sellerMemberId || t?.sellerBroker || t?.seller_broker || t?.seller || 0).replace(/^0+/, ''), 10) || 0;
            return b > 0 && s > 0;
          });
          if (!fileHasValidBrokers || cachedTrades.length < 1000) {
            console.warn(`[dailyFloorsheetCollector] Ignoring partial/masked cached archive (${cachedTrades.length} rows, validBrokers=${fileHasValidBrokers}) for ${targetDate} — re-fetching full EOD.`);
            try { fs.unlinkSync(jsonFilePath); } catch (_) {}
            try { if (fs.existsSync(gzFilePath)) fs.unlinkSync(gzFilePath); } catch (_) {}
          } else {
            // ── Ensure floorsheet_contracts and daily_stock_summary are populated and in parity ──
            if (db && cachedTrades.length > 0) {
              const existingContracts = db.prepare(
                'SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date = ? AND COALESCE(is_quarantined, 0) = 0 AND buyer_broker > 0 AND seller_broker > 0'
              ).get(targetDate);
              const existingSummary = db.prepare(
                'SELECT COUNT(*) as c FROM daily_stock_summary WHERE trade_date = ? AND COALESCE(is_quarantined, 0) = 0'
              ).get(targetDate);

              if (!existingContracts || existingContracts.c === 0 || existingContracts.c !== cachedTrades.length || !existingSummary || existingSummary.c === 0) {
                console.log(`[dailyFloorsheetCollector] Ledger parity check failed (Contracts: ${existingContracts?.c}/${cachedTrades.length}, Summaries: ${existingSummary?.c}) for ${targetDate} — re-ingesting ${cachedTrades.length} cached contracts to reconcile ground truth...`);
                ingestContractsToLedger(targetDate, cachedTrades);
              }
            }
            return {
              success: true,
              date: targetDate,
              tradeCount: cachedTrades.length,
              filePath: jsonFilePath,
              gzFilePath,
              cached: true
            };
          }
        }
      }
    } catch (_) {}
  }

  // Fetch full floorsheet trades for this session
  let trades = [];
  try {
    trades = await getFullSessionFloorsheet(targetDate);
  } catch (err) {
    console.warn(`[dailyFloorsheetCollector] Fetch warning for ${targetDate}:`, err.message);
  }

  // ── Date Mislabeling Guard for freshly fetched data ──
  // If exchange API returns data for a different session (e.g., yesterday's data labeled today),
  // abort rather than storing incorrect data.
  if (trades && trades.length > 0) {
    const sampleFreshDate = String(
      trades[0]?.businessDate || trades[0]?.trade_date || trades[0]?.tradeDate || ''
    ).split('T')[0].trim();
    if (sampleFreshDate && sampleFreshDate !== targetDate) {
      console.warn(`[dailyFloorsheetCollector] ⚠️ Date mislabeling: Exchange returned ${sampleFreshDate}, requested ${targetDate}. Aborting save — today's market may not be closed yet.`);
      return {
        success: false,
        date: targetDate,
        error: `Exchange returned data for ${sampleFreshDate}, not ${targetDate}. Market may still be open or data not yet available.`
      };
    }
  }

  // If external fetch returned empty, try extracting from SQLite ledger
  if ((!trades || trades.length === 0) && db) {
    try {
      const ledgerRows = db.prepare(`
        SELECT
          contract_no AS contractId,
          symbol AS stockSymbol,
          trade_date AS businessDate,
          trade_time AS tradeTime,
          buyer_broker AS buyerBroker,
          seller_broker AS sellerBroker,
          kitta AS qty,
          rate,
          amount,
          aggressor_side AS aggressor,
          is_internal_cross AS isInternalCross,
          is_whale_print AS isWhalePrint
        FROM floorsheet_contracts
        WHERE trade_date = ? AND COALESCE(is_quarantined, 0) = 0 AND buyer_broker > 0 AND seller_broker > 0
        ORDER BY contract_no ASC
      `).all(targetDate);

      if (ledgerRows.length >= 1000) {
        trades = ledgerRows;
        console.log(`[dailyFloorsheetCollector] Retrieved ${trades.length} trades from drabyashree_ledger.db for ${targetDate}.`);
      }
    } catch (e) {
      console.warn(`[dailyFloorsheetCollector] SQLite extraction error:`, e.message);
    }
  }

  if (!trades || trades.length === 0) {
    console.warn(`[dailyFloorsheetCollector] No floorsheet trades found for session ${targetDate}.`);
    return {
      success: false,
      date: targetDate,
      error: `No floorsheet trades available for session ${targetDate}`
    };
  }

  const hasValidBrokers = trades.some((t) => {
    const b = parseInt(String(t?.buyerMemberId || t?.buyerBroker || t?.buyer_broker || t?.buyer || 0).replace(/^0+/, ''), 10) || 0;
    const s = parseInt(String(t?.sellerMemberId || t?.sellerBroker || t?.seller_broker || t?.seller || 0).replace(/^0+/, ''), 10) || 0;
    return b > 0 && s > 0;
  });
  if (!hasValidBrokers) {
    console.warn(`[dailyFloorsheetCollector] Refusing to persist/ingest masked partial batch (${trades.length} rows, 0 valid brokers) for ${targetDate}.`);
    return {
      success: false,
      date: targetDate,
      tradeCount: trades.length,
      partialMasked: true,
      error: `Masked intraday/partial batch (${trades.length} contracts with 0 valid brokers)`
    };
  }

  // 1. Write clean uncompressed JSON file
  const jsonContent = JSON.stringify(trades);
  fs.writeFileSync(jsonFilePath, jsonContent, 'utf8');

  // 2. Write compressed .gz file for efficient long-term archiving
  const gzipped = zlib.gzipSync(Buffer.from(jsonContent, 'utf8'));
  fs.writeFileSync(gzFilePath, gzipped);

  // 3. Ingest into SQLite database so all services have live calculated data
  const ingestedCount = ingestContractsToLedger(targetDate, trades);

  // 4. Update the archive index
  const index = getArchiveIndex();
  const existingIdx = index.findIndex(item => item.date === targetDate);
  const totalVolume = trades.reduce((sum, t) => sum + Number(t.contractQuantity ?? t.qty ?? t.quantity ?? t.kitta ?? 0), 0);
  const totalTurnover = trades.reduce((sum, t) => sum + Number(t.contractAmount ?? t.amount ?? (Number(t.contractQuantity ?? t.qty ?? 0) * Number(t.contractRate ?? t.rate ?? 0)) ?? 0), 0);

  const meta = {
    date: targetDate,
    tradeCount: trades.length,
    ingestedCount,
    totalVolume,
    totalTurnover: Math.round(totalTurnover),
    jsonFileSizeKb: +(fs.statSync(jsonFilePath).size / 1024).toFixed(1),
    gzFileSizeKb: +(gzipped.length / 1024).toFixed(1),
    savedAt: new Date().toISOString(),
    status: 'COMPLETE'
  };

  if (existingIdx >= 0) {
    index[existingIdx] = meta;
  } else {
    index.unshift(meta);
  }
  saveArchiveIndex(index);

  console.log(`[dailyFloorsheetCollector] Successfully saved ${trades.length} trades for ${targetDate} into ${jsonFilePath} and ${gzFilePath}.`);

  // Cloud Archive: Upload compressed .json.gz to Cloudflare R2 asynchronously
  try {
    uploadDailyFloorsheetToR2(targetDate, gzFilePath).catch(uploadErr => {
      console.warn(`[dailyFloorsheetCollector] Background R2 upload warning for ${targetDate}:`, uploadErr.message);
    });
  } catch (_) {}

  return {
    success: true,
    date: targetDate,
    tradeCount: trades.length,
    ingestedCount,
    totalVolume,
    totalTurnover: Math.round(totalTurnover),
    filePath: jsonFilePath,
    gzFilePath
  };
}

/**
 * Fast local retrieval: reads from daily_floorsheets/ or drabyashree_ledger.db
 */
export function getLocalDailyFloorsheet(dateStr) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) return null;

  const jsonFile = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json`);
  if (fs.existsSync(jsonFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }

  const gzFile = path.join(DAILY_FLOORSHEETS_DIR, `floorsheet-${cleanDate}.json.gz`);
  if (fs.existsSync(gzFile)) {
    try {
      const unzipped = zlib.gunzipSync(fs.readFileSync(gzFile));
      const data = JSON.parse(unzipped.toString('utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (_) {}
  }

  return null;
}

/**
 * Comprehensive retrieval: checks local disk first, then streams from Cloudflare R2 cloud archive
 */
export async function getDailyFloorsheet(dateStr) {
  const local = getLocalDailyFloorsheet(dateStr);
  if (local) return local;

  // Fallback to Cloudflare R2
  return await fetchFloorsheetFromR2(dateStr);
}
