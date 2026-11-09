// tests/alBatchPortfolioAuthenticationGuard.test.mjs
/**
 * Test Suite: Portfolio Authentication Guard & Untrusted CORS Origin Elimination
 * Run: node tests/alBatchPortfolioAuthenticationGuard.test.mjs
 * 
 * Verifies:
 * 1. Stranger's origin ('https://nepse-app.vercel.app') is completely purged from CORS_DEFAULTS.
 * 2. Authentic Vercel production domains ('drabyashree-nepse-hub6936.vercel.app', 'nepse-hub.vercel.app')
 *    are present in CORS_DEFAULTS.
 * 3. Unauthenticated public internet requests to portfolio endpoints are strictly rejected with HTTP 401.
 * 4. Requests with invalid or fraudulent keys are rejected with HTTP 403.
 * 5. Requests with valid x-portfolio-key, x-admin-key, or Authorization: Bearer tokens succeed (next() invoked).
 * 6. All four portfolio routes in proxy/server.mjs are explicitly guarded by requirePortfolioAuth middleware.
 * 7. Frontend Portfolio.jsx and firebase.js provide auth token / key injection headers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requirePortfolioAuth } from '../proxy/middleware/requirePortfolioAuth.mjs';

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

console.log('▶ [SUITE] alBatchPortfolioAuthenticationGuard.test.mjs\n');

try {
  console.log('[TEST 1] CORS Origin Audit: Stranger Origin Purge & Authentic Domain Verification');
  const serverPath = path.join(__dirname, '../proxy/server.mjs');
  ok(fs.existsSync(serverPath), 'proxy/server.mjs exists');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  // Verify stranger's domain is removed
  const containsStranger = serverContent.includes('nepse-app.vercel.app');
  ok(!containsStranger, "Stranger's domain 'nepse-app.vercel.app' is completely absent from server.mjs");

  // Verify authentic domains are present
  ok(
    serverContent.includes('drabyashree-nepse-hub6936.vercel.app'),
    "Authentic domain 'drabyashree-nepse-hub6936.vercel.app' is configured in CORS defaults"
  );
  ok(
    serverContent.includes('nepse-hub.vercel.app'),
    "Authentic domain 'nepse-hub.vercel.app' is configured in CORS defaults"
  );

  console.log('\n[TEST 2] Route Protection Audit: requirePortfolioAuth on all 4 endpoints');
  ok(
    serverContent.includes("app.get('/api/portfolio/tracked-holdings', requirePortfolioAuth,"),
    "GET /api/portfolio/tracked-holdings is guarded by requirePortfolioAuth"
  );
  ok(
    serverContent.includes("app.post('/api/portfolio/track-holding', requirePortfolioAuth,"),
    "POST /api/portfolio/track-holding is guarded by requirePortfolioAuth"
  );
  ok(
    serverContent.includes("app.post('/api/portfolio/untrack-holding', requirePortfolioAuth,"),
    "POST /api/portfolio/untrack-holding is guarded by requirePortfolioAuth"
  );
  ok(
    serverContent.includes("app.post('/api/portfolio/sync-holdings', requirePortfolioAuth,"),
    "POST /api/portfolio/sync-holdings is guarded by requirePortfolioAuth"
  );

  console.log('\n[TEST 3] Middleware Security: Unauthenticated External Request (HTTP 401)');
  const originalKey = process.env.PORTFOLIO_AUTH_KEY;
  process.env.PORTFOLIO_AUTH_KEY = 'nepse-secure-portfolio-key-8899';

  function mockResponse() {
    return {
      statusCode: 200,
      jsonBody: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonBody = data;
        return this;
      }
    };
  }

  // Case A: Unauthenticated public request (non-localhost IP)
  const reqUnauth = {
    ip: '198.51.100.24',
    hostname: 'drabyashree-nepse-hub6936.vercel.app',
    headers: {}
  };
  const resUnauth = mockResponse();
  let nextCalledUnauth = false;
  requirePortfolioAuth(reqUnauth, resUnauth, () => { nextCalledUnauth = true; });

  ok(!nextCalledUnauth, 'Unauthenticated public request blocked from proceeding to next()');
  ok(resUnauth.statusCode === 401, `Unauthenticated request returns HTTP 401 (actual: ${resUnauth.statusCode})`);
  ok(resUnauth.jsonBody?.success === false, 'Returns JSON error body with success: false');

  console.log('\n[TEST 4] Middleware Security: Invalid Credentials (HTTP 403 Forbidden)');
  const reqInvalid = {
    ip: '198.51.100.24',
    hostname: 'drabyashree-nepse-hub6936.vercel.app',
    headers: { 'x-portfolio-key': 'attacker-wrong-secret-key' }
  };
  const resInvalid = mockResponse();
  let nextCalledInvalid = false;
  requirePortfolioAuth(reqInvalid, resInvalid, () => { nextCalledInvalid = true; });

  ok(!nextCalledInvalid, 'Invalid key request blocked from proceeding to next()');
  ok(resInvalid.statusCode === 403, `Invalid key request returns HTTP 403 (actual: ${resInvalid.statusCode})`);

  console.log('\n[TEST 5] Middleware Security: Valid Authentication Passes (HTTP 200 / next())');
  // Subcase A: Valid x-portfolio-key
  const reqValidCustom = {
    ip: '198.51.100.24',
    hostname: 'drabyashree-nepse-hub6936.vercel.app',
    headers: { 'x-portfolio-key': 'nepse-secure-portfolio-key-8899' }
  };
  let nextCalledCustom = false;
  requirePortfolioAuth(reqValidCustom, mockResponse(), () => { nextCalledCustom = true; });
  ok(nextCalledCustom, 'Valid x-portfolio-key allows request through to handler');

  // Subcase B: Valid Authorization: Bearer token
  const reqValidBearer = {
    ip: '198.51.100.24',
    hostname: 'drabyashree-nepse-hub6936.vercel.app',
    headers: { 'authorization': 'Bearer nepse-secure-portfolio-key-8899' }
  };
  let nextCalledBearer = false;
  requirePortfolioAuth(reqValidBearer, mockResponse(), () => { nextCalledBearer = true; });
  ok(nextCalledBearer, 'Valid Authorization: Bearer token allows request through to handler');

  // Subcase C: Valid x-admin-key
  const reqValidAdmin = {
    ip: '198.51.100.24',
    hostname: 'drabyashree-nepse-hub6936.vercel.app',
    headers: { 'x-admin-key': 'nepse-secure-portfolio-key-8899' }
  };
  let nextCalledAdmin = false;
  requirePortfolioAuth(reqValidAdmin, mockResponse(), () => { nextCalledAdmin = true; });
  ok(nextCalledAdmin, 'Valid x-admin-key allows request through to handler');

  console.log('\n[TEST 6] Frontend Authentication Headers Attachment Audit');
  const portfolioJsxPath = path.join(__dirname, '../src/components/Portfolio.jsx');
  const portfolioJsx = fs.readFileSync(portfolioJsxPath, 'utf8');
  ok(portfolioJsx.includes('getPortfolioAuthHeaders'), 'Portfolio.jsx defines getPortfolioAuthHeaders helper');
  ok(portfolioJsx.includes('getCurrentAuthToken'), 'Portfolio.jsx imports getCurrentAuthToken from firebase.js');
  ok(portfolioJsx.includes('tracked-holdings'), 'Portfolio.jsx connects to tracked-holdings with auth headers');

  const firebaseJsPath = path.join(__dirname, '../src/utils/firebase.js');
  const firebaseJs = fs.readFileSync(firebaseJsPath, 'utf8');
  ok(firebaseJs.includes('export const getCurrentAuthToken'), 'firebase.js exports getCurrentAuthToken() helper');

  // Restore env
  if (originalKey) {
    process.env.PORTFOLIO_AUTH_KEY = originalKey;
  } else {
    delete process.env.PORTFOLIO_AUTH_KEY;
  }

  console.log('\n======================================================================');
  console.log(` RESULTS: ${pass} passed, ${fail} failed`);
  console.log('======================================================================\n');

  if (fail > 0) {
    process.exit(1);
  }
} catch (err) {
  console.error('Unhandled test error:', err);
  process.exit(1);
}
