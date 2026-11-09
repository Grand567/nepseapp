// scripts/testLocalProxyEndpoints.mjs
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { UnifiedNepseClient } from '../proxy/nepseClientManager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 5055;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runLocalEndpointTests() {
  console.log('🚀 Spawning local proxy server on port', TEST_PORT);

  const proxyProcess = spawn(process.execPath, [path.join(__dirname, '../proxy/server.mjs')], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
      MEROSHARE_ENCRYPTION_KEY: 'test-local-key-32-chars-long-abc'
    },
    stdio: 'pipe'
  });

  proxyProcess.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes('running on') || s.includes('Server running') || s.includes('Proxy Server')) {
      // console.log('[Server Log]', s.trim());
    }
  });

  try {
    // Wait for server to boot up
    let booted = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await axios.get(`${BASE_URL}/api/ping`, { timeout: 1000 });
        if (res.status === 200) {
          booted = true;
          break;
        }
      } catch (_) {
        await sleep(500);
      }
    }

    if (!booted) {
      throw new Error('Proxy server failed to boot within 15 seconds.');
    }
    console.log('✅ Local proxy server is UP on port', TEST_PORT);

    // 1. Test /health
    const healthRes = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    console.log(`\n1. GET /health -> HTTP ${healthRes.status}`);
    console.log(`   Status: ${healthRes.data.status} | NEPSEE Connected: ${healthRes.data.nepseConnected}`);
    console.log(`   Stock Summary Rows: ${healthRes.data.stockSummaryRows} | Ledger Rows: ${healthRes.data.brokerLedgerRows}`);

    // 2. Test Ledger Endpoints
    const ledger5dRes = await axios.get(`${BASE_URL}/api/ledger/5day-history`, { timeout: 5000 });
    console.log(`\n2. GET /api/ledger/5day-history -> HTTP ${ledger5dRes.status}`);
    console.log(`   Scrips count: ${ledger5dRes.data?.data?.length || 0} | Window: ${ledger5dRes.data?.tradingDays?.length || 0} days`);

    const telemetryRes = await axios.get(`${BASE_URL}/api/stocks/NABIL/ledger-telemetry`, { timeout: 5000 });
    console.log(`\n3. GET /api/stocks/NABIL/ledger-telemetry -> HTTP ${telemetryRes.status}`);
    console.log(`   Symbol: ${telemetryRes.data?.symbol || 'NABIL'} | History length: ${telemetryRes.data?.history?.length || 0}`);

    // 3. Test NEPSE Data Fetch
    console.log('\n4. Testing Direct NEPSE NOTS Data Fetch...');
    const client = new UnifiedNepseClient();
    const st = await client.getMarketStatus();
    console.log(`   NEPSE Market Status -> ${JSON.stringify(st)}`);

    console.log('\n🎉 ALL LOCAL ENDPOINT & NEPSE FETCH TESTS COMPLETED SUCCESSFULLY!\n');
  } finally {
    proxyProcess.kill();
  }
}

runLocalEndpointTests().catch(err => {
  console.error('❌ Endpoint test failed:', err);
  process.exit(1);
});
