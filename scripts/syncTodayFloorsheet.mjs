// scripts/syncTodayFloorsheet.mjs
// Automated One-Step On-Demand Sync for Today's NEPSE Floorsheet & Broker Matrices

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatNptDateIso, isNepseTradingDay } from '../src/utils/nepseCalendar.js';
import { downloadAndArchiveDailyFloorsheet } from '../proxy/utils/dailyFloorsheetCollector.mjs';
import { getFullSessionFloorsheet, aggregateMarketFloorsheet } from '../proxy/brokerVault.mjs';
import { compileHistoricalSubfiles } from '../proxy/utils/historicalSubfilesEngine.mjs';
import { compileTodayStaticAnalytics } from '../proxy/utils/todayDataEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function syncToday() {
  const targetDate = process.argv[2] ? String(process.argv[2]).trim() : formatNptDateIso(new Date());
  console.log(`\n🚀 [SyncEngine] Starting automated floorsheet & broker sync for: ${targetDate}`);

  // 1. Download and archive into daily_floorsheets and SQLite drabyashree_ledger.db
  const res = await downloadAndArchiveDailyFloorsheet(targetDate, { force: true });
  console.log(`[SyncEngine] Ingested ${res?.tradeCount || 0} trade contracts into SQLite database.`);

  // 2. Aggregate exchange-wide broker matrix
  const trades = await getFullSessionFloorsheet(targetDate);
  if (Array.isArray(trades) && trades.length > 0) {
    const aggData = aggregateMarketFloorsheet(trades, targetDate);

    // 3. Dual-write broker_matrix_latest.json
    const proxyPath = path.join(rootDir, 'proxy', 'data', 'broker_matrix_latest.json');
    const srcPath = path.join(rootDir, 'src', 'data', 'broker_matrix_latest.json');
    fs.writeFileSync(proxyPath, JSON.stringify(aggData, null, 2), 'utf8');
    fs.writeFileSync(srcPath, JSON.stringify(aggData, null, 2), 'utf8');
    console.log(`[SyncEngine] ✅ Dual-written broker_matrix_latest.json to proxy and src`);

    // 4. Update src/data/broker_matrices_historical.json safely (lightweight Top 10 seed)
    const histPath = path.join(rootDir, 'src', 'data', 'broker_matrices_historical.json');
    if (fs.existsSync(histPath)) {
      try {
        const histData = JSON.parse(fs.readFileSync(histPath, 'utf8'));
        const lightMatrix = (aggData.matrix || []).map(({ scrips, ...rest }) => rest);
        histData[targetDate] = { ...aggData, matrix: lightMatrix };
        const recentDates = Object.keys(histData).sort().reverse().slice(0, 5);
        const prunedSeed = {};
        for (const rd of recentDates) prunedSeed[rd] = histData[rd];

        const tmpPath = histPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(prunedSeed), 'utf8');
        try {
          fs.copyFileSync(tmpPath, histPath);
          fs.unlinkSync(tmpPath);
          console.log(`[SyncEngine] ✅ Updated broker_matrices_historical.json with session: ${targetDate}`);
        } catch (_) {
          fs.writeFileSync(histPath, JSON.stringify(prunedSeed), 'utf8');
          console.log(`[SyncEngine] ✅ Updated broker_matrices_historical.json with session: ${targetDate}`);
        }
      } catch (hErr) {
        console.warn(`[SyncEngine] Historical matrix seed notice:`, hErr.message);
      }
    }
  }

  // 5. Recompile 4 Historical Sub-Files
  try {
    const manifest = compileHistoricalSubfiles();
    console.log(`[SyncEngine] ✅ Recompiled 4 historical subfiles. Available:`, manifest?.available_sessions);
  } catch (err) {
    console.warn('[SyncEngine] Subfiles compile warning:', err.message);
  }

  // 6. Recompile Today Static Analytics
  try {
    compileTodayStaticAnalytics();
    console.log(`[SyncEngine] ✅ Recompiled today_static_analytics.json sub-file`);
  } catch (err) {
    console.warn('[SyncEngine] Static analytics compile warning:', err.message);
  }

  console.log(`\n🎉 [SyncEngine] Successfully synced session ${targetDate}! All components and endpoints ready.\n`);
}

syncToday().catch(err => {
  console.error('[SyncEngine] Fatal error during sync:', err);
  process.exit(1);
});
