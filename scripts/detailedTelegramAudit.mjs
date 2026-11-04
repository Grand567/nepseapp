import fs from 'fs';
import path from 'path';

const alertHistoryPath = path.join(process.cwd(), 'proxy', 'data', 'smart_alert_history.json');
const matrixPath = path.join(process.cwd(), 'proxy', 'data', 'broker_matrix_latest.json');
const paperPath = path.join(process.cwd(), 'proxy', 'data', 'paper_trading_state.json');

const alerts = fs.existsSync(alertHistoryPath) ? JSON.parse(fs.readFileSync(alertHistoryPath, 'utf8')) : [];
const matrix = fs.existsSync(matrixPath) ? JSON.parse(fs.readFileSync(matrixPath, 'utf8')) : {};
const paper = fs.existsSync(paperPath) ? JSON.parse(fs.readFileSync(paperPath, 'utf8')) : {};

console.log('--- RECENT SMART ALERTS DISPATCHED (Total:', alerts.length, ') ---');
alerts.slice(-10).forEach((a, i) => {
  console.log(`[${i+1}] ${a.symbol} | Type: ${a.type} | LTP: ${a.ltp} | SL: ${a.stopLoss} | T1: ${a.target1} | T2: ${a.target2} | Triggered: ${a.triggeredAt || a.timestamp}`);
});

console.log('\n--- BROKER CONCENTRATION & RETENTION METRICS ---');
const auditSyms = ['NMB', 'MHL', 'BPCL', 'KSBBL', 'MLBL', 'KBL', 'RFPL', 'SHEL', 'DORDI', 'SHIVM', 'GHL'];
auditSyms.forEach(sym => {
  const m = matrix[sym];
  if (!m) {
    console.log(`${sym}: No matrix entry`);
    return;
  }
  const topBrokers = Object.entries(m.brokers || {})
    .map(([bId, data]) => ({ broker: bId, net: (data.bought || 0) - (data.sold || 0), bought: data.bought || 0, sold: data.sold || 0, buyVwap: data.buyVwap || 0 }))
    .sort((a, b) => b.net - a.net);

  const topAcc = topBrokers[0];
  const topDist = topBrokers[topBrokers.length - 1];
  console.log(`${sym}: LTP ${m.ltp || 'N/A'} | Lead Acc Broker #${topAcc?.broker} (Net: ${topAcc?.net?.toLocaleString()}, Bought: ${topAcc?.bought?.toLocaleString()}, Sold: ${topAcc?.sold?.toLocaleString()}, VWAP: ${topAcc?.buyVwap?.toFixed(2)}) | Top Dist Broker #${topDist?.broker} (Net: ${topDist?.net?.toLocaleString()})`);
});
