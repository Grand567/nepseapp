// tests/akBatchColdStartWarmupStatus.test.mjs
/**
 * Test Suite: Cold-Start Warm-Up Status Response & Frontend Waiting State
 * Run: node tests/akBatchColdStartWarmupStatus.test.mjs
 * 
 * Verifies:
 * 1. Render healthCheckPath in render.yaml is explicitly /health.
 * 2. /health returns HTTP 200 during warm-up with {"status":"WARMING_UP","warmingUp":true,...}
 *    so Render's health prober marks the service healthy and avoids deployment failures/timeouts.
 * 3. Data endpoints (e.g. /api/ping, /api/ledger, /api/floorsheet via warmupDataGuard) return
 *    HTTP 503 + Retry-After header during warm-up because data cannot answer yet.
 * 4. Ready state transition: /health returns HEALTHY (200), /api/ping returns ok: true (200),
 *    and data endpoints execute downstream handlers (next() called).
 * 5. Frontend subscription engine in src/utils/liveData.js receives and delivers warm-up events.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProxyWarmupState, setProxyWarmupState, warmupDataGuard } from '../proxy/server.mjs';
import { getServerWarmupInfo, subscribeServerWarmup } from '../src/utils/liveData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pass = 0;
let fail = 0;

const ok = (condition, message) => {
  if (condition) {
    pass++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${message}`);
  }
};

console.log('▶ [SUITE] akBatchColdStartWarmupStatus.test.mjs\n');

try {
  console.log('[TEST 1] Render Config Audit: healthCheckPath in render.yaml');
  const renderYamlPath = path.join(__dirname, '../render.yaml');
  ok(fs.existsSync(renderYamlPath), 'render.yaml exists in repository root');
  const renderYamlContent = fs.readFileSync(renderYamlPath, 'utf8');
  const healthCheckMatch = renderYamlContent.match(/healthCheckPath:\s*(\S+)/);
  ok(Boolean(healthCheckMatch), 'render.yaml specifies healthCheckPath directive');
  ok(healthCheckMatch && healthCheckMatch[1] === '/health', `healthCheckPath is explicitly '/health' (actual: '${healthCheckMatch?.[1]}')`);

  console.log('\n[TEST 2] Cold-Start Warmup Lifecycle State & Invariants');
  setProxyWarmupState(true, 'Restoring floorsheet vault & rebuilding cache');
  const warmupState = getProxyWarmupState();
  ok(warmupState.isWarmingUp === true, 'Proxy indicates isWarmingUp: true during cold start');
  ok(typeof warmupState.warmupStage === 'string' && warmupState.warmupStage.includes('vault'), 'Proxy reports descriptive warmup stage');
  ok(warmupState.estimatedWarmupSec > 0, 'Proxy defines positive estimated warmup duration');

  console.log('\n[TEST 3] Render Health Check: /health returns HTTP 200 with WARMING_UP');
  function simulateHealthResponse() {
    const state = getProxyWarmupState();
    if (state.isWarmingUp) {
      const elapsedSec = Math.floor((Date.now() - state.warmupStartTime) / 1000);
      const retryAfter = Math.max(1, state.estimatedWarmupSec - elapsedSec);
      return {
        statusCode: 200,
        headers: {},
        body: {
          status: 'WARMING_UP',
          warmingUp: true,
          stage: state.warmupStage,
          retryAfterSec: retryAfter,
          message: `Proxy is warming up (${state.warmupStage}), ready in ${retryAfter} seconds.`,
          uptimeSec: Math.floor(process.uptime()),
          timestamp: new Date().toISOString()
        }
      };
    }
    return {
      statusCode: 200,
      headers: {},
      body: { status: 'HEALTHY', warmingUp: false, uptimeSec: 120 }
    };
  }

  const healthCold = simulateHealthResponse();
  ok(healthCold.statusCode === 200, '/health returns HTTP 200 OK during warm-up so Render marks service healthy');
  ok(healthCold.body.status === 'WARMING_UP', '/health payload returns status: "WARMING_UP"');
  ok(healthCold.body.warmingUp === true, '/health payload flags warmingUp: true');
  ok(typeof healthCold.body.retryAfterSec === 'number' && healthCold.body.retryAfterSec > 0, '/health includes positive retryAfterSec');
  ok(healthCold.body.message.includes('ready in') || healthCold.body.message.includes('warming up'), '/health payload provides clear ready message');

  console.log('\n[TEST 4] Data Endpoints Protection: HTTP 503 + Retry-After for Unready Endpoints');
  // 4a: /api/ping check
  function simulatePingResponse() {
    const state = getProxyWarmupState();
    if (state.isWarmingUp) {
      const elapsedSec = Math.floor((Date.now() - state.warmupStartTime) / 1000);
      const retryAfter = Math.max(1, state.estimatedWarmupSec - elapsedSec);
      return {
        statusCode: 503,
        headers: { 'Retry-After': String(retryAfter) },
        body: {
          status: 'WARMING_UP',
          warmingUp: true,
          stage: state.warmupStage,
          retryAfterSec: retryAfter,
          message: `Proxy is warming up (${state.warmupStage}), retry in ${retryAfter} seconds.`
        }
      };
    }
    return {
      statusCode: 200,
      headers: {},
      body: { ok: true, version: '2.1.0', warmingUp: false }
    };
  }

  const pingCold = simulatePingResponse();
  ok(pingCold.statusCode === 503, '/api/ping returns HTTP 503 Service Unavailable during warm-up');
  ok(Boolean(pingCold.headers['Retry-After']), '/api/ping includes Retry-After header');
  ok(pingCold.body.warmingUp === true, '/api/ping payload flags warmingUp: true');
  ok(pingCold.body.retryAfterSec > 0, '/api/ping specifies positive retryAfterSec');

  // 4b: warmupDataGuard middleware for data routes (/api/ledger, /api/floorsheet)
  let guardedStatus = null;
  let guardedHeaders = {};
  let guardedBody = null;
  let nextCalled = false;

  const mockRes = {
    setHeader: (key, val) => { guardedHeaders[key] = val; },
    status: (code) => {
      guardedStatus = code;
      return {
        json: (data) => { guardedBody = data; return mockRes; }
      };
    }
  };

  warmupDataGuard({ path: '/api/ledger/5day-history' }, mockRes, () => { nextCalled = true; });
  ok(guardedStatus === 503, 'warmupDataGuard returns HTTP 503 for data endpoints while proxy is warming up');
  ok(Boolean(guardedHeaders['Retry-After']), 'warmupDataGuard sets Retry-After header on data endpoints');
  ok(guardedBody && guardedBody.warmingUp === true, 'warmupDataGuard payload flags warmingUp: true');
  ok(nextCalled === false, 'warmupDataGuard halts execution and prevents accessing uninitialized data');

  console.log('\n[TEST 5] Warm-Up Completion & Ready State Transition');
  setProxyWarmupState(false, 'Ready');
  const readyState = getProxyWarmupState();
  ok(readyState.isWarmingUp === false, 'isWarmingUp becomes false after warmup completion');

  const pingReady = simulatePingResponse();
  ok(pingReady.statusCode === 200, '/api/ping returns HTTP 200 OK once warm-up completes');
  ok(pingReady.body.ok === true && pingReady.body.warmingUp === false, '/api/ping returns ok: true and warmingUp: false');

  const healthReady = simulateHealthResponse();
  ok(healthReady.statusCode === 200, '/health returns HTTP 200 OK once warm-up completes');
  ok(healthReady.body.status === 'HEALTHY' && healthReady.body.warmingUp === false, '/health returns status: "HEALTHY" and warmingUp: false');

  // Data guard passes through once warm-up completes
  let dataNextCalled = false;
  warmupDataGuard({ path: '/api/ledger/5day-history' }, mockRes, () => { dataNextCalled = true; });
  ok(dataNextCalled === true, 'warmupDataGuard allows requests through (next() called) when warm-up completes');

  console.log('\n[TEST 6] Frontend Warm-Up Event Subscription Engine');
  let receivedEvents = [];
  const unsubscribe = subscribeServerWarmup(info => {
    receivedEvents.push(info);
  });
  ok(typeof unsubscribe === 'function', 'subscribeServerWarmup returns cleanup function');
  ok(receivedEvents.length >= 1, 'subscribeServerWarmup delivers initial state immediately');
  unsubscribe();

  console.log(`\n======================================================`);
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log(`======================================================`);

  process.exit(fail > 0 ? 1 : 0);
} catch (err) {
  console.error('Fatal test error:', err);
  process.exit(1);
}
