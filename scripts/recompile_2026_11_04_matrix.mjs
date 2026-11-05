import fs from 'fs';
import path from 'path';
import { aggregateMarketFloorsheet } from '../proxy/brokerVault.mjs';

console.log('=== RECOMPILING 2026-11-04 BROKER MATRIX & HISTORICAL SEEDS ===');

const floorsheetFile = 'proxy/data/floorsheet-full-2026-11-04.json';
if (!fs.existsSync(floorsheetFile)) {
  console.error(`Floorsheet file ${floorsheetFile} not found!`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(floorsheetFile, 'utf8'));
const trades = Array.isArray(raw) ? raw : (raw.trades || raw.data || []);
console.log(`Loaded ${trades.length} trades for 2026-11-04`);

const matrixData = aggregateMarketFloorsheet(trades, '2026-11-04');
console.log(`Aggregated matrix: businessDate=${matrixData.businessDate}, brokers=${matrixData.matrix?.length}`);

// Set available dates
const availableDates = [
  '2026-11-04',
  '2026-11-03',
  '2026-11-02',
  '2026-10-30',
  '2026-10-29',
  '2026-10-28',
  '2026-10-27',
  '2026-10-26',
  '2026-10-16',
  '2026-10-15',
  '2026-10-14',
  '2026-10-13',
  '2026-10-12',
  '2026-10-09',
  '2026-10-08',
  '2026-10-07',
  '2026-10-06',
  '2026-10-05',
  '2026-10-02',
  '2026-10-01'
];
matrixData.availableDates = availableDates;

// 1. Write src/data/broker_matrix_latest.json
fs.writeFileSync('src/data/broker_matrix_latest.json', JSON.stringify(matrixData, null, 2), 'utf8');
console.log('Updated src/data/broker_matrix_latest.json');

// 2. Write proxy/data/broker_matrix_latest.json
fs.writeFileSync('proxy/data/broker_matrix_latest.json', JSON.stringify(matrixData, null, 2), 'utf8');
console.log('Updated proxy/data/broker_matrix_latest.json');

// 3. Update src/data/broker_matrices_historical.json
let histData = {};
if (fs.existsSync('src/data/broker_matrices_historical.json')) {
  try {
    histData = JSON.parse(fs.readFileSync('src/data/broker_matrices_historical.json', 'utf8'));
  } catch (_) {}
}

const updatedHist = {
  '2026-11-04': matrixData,
  ...histData
};

fs.writeFileSync('src/data/broker_matrices_historical.json', JSON.stringify(updatedHist, null, 2), 'utf8');
console.log(`Updated src/data/broker_matrices_historical.json (Total dates: ${Object.keys(updatedHist).length})`);

// 4. Verify Broker 58
const b58 = matrixData.matrix?.find(b => String(b.broker) === '58' || String(b.id) === '58');
if (b58) {
  console.log('\nBroker 58 Verification on 2026-11-04:');
  console.log('Net Flow:', (b58.netFlow / 1e7).toFixed(2), 'Cr');
  console.log('Top Net Amount:', b58.topAccumulation?.slice(0, 5).map(s => `${s.symbol} (+Rs ${(s.netFlow/1e5).toFixed(1)}L)`));
  console.log('Top Net Volume:', b58.topByNetQty?.slice(0, 5).map(s => `${s.symbol} (+${s.netQty} kitta)`));
}
