import fs from 'fs';
import { aggregateMarketFloorsheet } from '../proxy/brokerVault.mjs';

console.log('=== RECOMPILING 2026-11-03 AND 2026-10-30 TO PURE-EQUITY ===');

const histFile = 'src/data/broker_matrices_historical.json';
let hist = {};
if (fs.existsSync(histFile)) {
  hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
}

const datesToRecompile = ['2026-11-03', '2026-10-30'];
for (const dt of datesToRecompile) {
  const fsPath = `proxy/data/floorsheet-full-${dt}.json`;
  if (fs.existsSync(fsPath)) {
    const raw = JSON.parse(fs.readFileSync(fsPath, 'utf8'));
    const trades = Array.isArray(raw) ? raw : (raw.trades || raw.data || []);
    console.log(`Aggregating ${trades.length} trades for ${dt}...`);
    const matrixData = aggregateMarketFloorsheet(trades, dt);
    hist[dt] = matrixData;
    console.log(`Recompiled ${dt}: ${matrixData.matrix?.length} brokers, totalTrades = ${matrixData.totalTrades}`);
  } else {
    console.warn(`Floorsheet not found for ${dt}`);
  }
}

fs.writeFileSync(histFile, JSON.stringify(hist, null, 2), 'utf8');
console.log('Updated src/data/broker_matrices_historical.json with pure-equity matrices!');
