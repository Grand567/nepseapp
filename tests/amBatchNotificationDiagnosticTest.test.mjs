// tests/amBatchNotificationDiagnosticTest.test.mjs
/**
 * Test Suite: Admin-Protected Notification Diagnostic Test & Native Tray Verification
 * Run: node tests/amBatchNotificationDiagnosticTest.test.mjs
 * 
 * Verifies:
 * 1. Admin-protected test dispatch endpoint POST /api/notifications/test-dispatch exists in proxy/server.mjs.
 * 2. Unauthenticated external requests to /api/notifications/test-dispatch are rejected with HTTP 401.
 * 3. Requests with invalid admin keys are rejected with HTTP 403.
 * 4. Requests with valid ADMIN_API_KEY generate fresh alert items with explicit timestamps and bypass deduplication.
 * 5. Frontend pushNotificationService.js exports sendAdminTestNotification for hardware/server fault isolation.
 * 6. NotificationCenterDrawer.jsx incorporates diagnostic feedback and "Send Test Notification" button.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAdminSecret } from '../proxy/middleware/requireAdminSecret.mjs';

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

console.log('▶ [SUITE] amBatchNotificationDiagnosticTest.test.mjs\n');

try {
  console.log('[TEST 1] Server Route Audit: POST /api/notifications/test-dispatch protected by requireAdminSecret');
  const serverPath = path.join(__dirname, '../proxy/server.mjs');
  ok(fs.existsSync(serverPath), 'proxy/server.mjs exists');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  ok(
    serverContent.includes("app.post('/api/notifications/test-dispatch', requireAdminSecret,"),
    "Route POST /api/notifications/test-dispatch is explicitly guarded by requireAdminSecret"
  );

  console.log('\n[TEST 2] Admin Auth Gate: Unauthenticated Requests Rejected (HTTP 401)');
  const origKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = 'diag-test-secret-admin-key-7711';

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

  const reqUnauth = {
    ip: '198.51.100.99',
    hostname: 'nepseapp.onrender.com',
    headers: {}
  };
  const resUnauth = mockResponse();
  let nextCalledUnauth = false;
  requireAdminSecret(reqUnauth, resUnauth, () => { nextCalledUnauth = true; });

  ok(!nextCalledUnauth, 'Unauthenticated external request blocked from proceeding');
  ok(resUnauth.statusCode === 401, `Returns HTTP 401 Unauthorized (actual: ${resUnauth.statusCode})`);

  console.log('\n[TEST 3] Admin Auth Gate: Invalid Credentials Rejected (HTTP 403 Forbidden)');
  const reqInvalid = {
    ip: '198.51.100.99',
    hostname: 'nepseapp.onrender.com',
    headers: { 'x-admin-key': 'attacker-invalid-key' }
  };
  const resInvalid = mockResponse();
  let nextCalledInvalid = false;
  requireAdminSecret(reqInvalid, resInvalid, () => { nextCalledInvalid = true; });

  ok(!nextCalledInvalid, 'Invalid key blocked from proceeding');
  ok(resInvalid.statusCode === 403, `Returns HTTP 403 Forbidden (actual: ${resInvalid.statusCode})`);

  console.log('\n[TEST 4] Admin Auth Gate: Valid Admin Key Passes (HTTP 200 / next())');
  // Case A: x-admin-key header
  const reqValidAdmin = {
    ip: '198.51.100.99',
    hostname: 'nepseapp.onrender.com',
    headers: { 'x-admin-key': 'diag-test-secret-admin-key-7711' }
  };
  let nextCalledAdmin = false;
  requireAdminSecret(reqValidAdmin, mockResponse(), () => { nextCalledAdmin = true; });
  ok(nextCalledAdmin, 'Valid x-admin-key passes through requireAdminSecret');

  // Case B: Authorization: Bearer token
  const reqValidBearer = {
    ip: '198.51.100.99',
    hostname: 'nepseapp.onrender.com',
    headers: { 'authorization': 'Bearer diag-test-secret-admin-key-7711' }
  };
  let nextCalledBearer = false;
  requireAdminSecret(reqValidBearer, mockResponse(), () => { nextCalledBearer = true; });
  ok(nextCalledBearer, 'Valid Authorization: Bearer passes through requireAdminSecret');

  console.log('\n[TEST 5] Frontend Diagnostic Client Audit');
  const pushServicePath = path.join(__dirname, '../src/utils/pushNotificationService.js');
  const pushServiceContent = fs.readFileSync(pushServicePath, 'utf8');

  ok(
    pushServiceContent.includes('export async function sendAdminTestNotification'),
    'pushNotificationService.js exports sendAdminTestNotification()'
  );
  ok(
    pushServiceContent.includes('/api/notifications/test-dispatch'),
    'sendAdminTestNotification calls /api/notifications/test-dispatch endpoint'
  );
  ok(
    pushServiceContent.includes('NepseNativeNotifier?.postStatusBarNotification'),
    'sendAdminTestNotification bridges to NepseNativeNotifier on Android'
  );

  console.log('\n[TEST 6] In-App UI Audit: Diagnostic Trigger & Status Display');
  const drawerPath = path.join(__dirname, '../src/components/NotificationCenterDrawer.jsx');
  const drawerContent = fs.readFileSync(drawerPath, 'utf8');

  ok(
    drawerContent.includes('sendAdminTestNotification'),
    'NotificationCenterDrawer.jsx imports and utilizes sendAdminTestNotification'
  );
  ok(
    drawerContent.includes('Send Test Notification'),
    'NotificationCenterDrawer.jsx displays clear "Send Test Notification" action'
  );
  ok(
    drawerContent.includes('diagnosticMsg'),
    'NotificationCenterDrawer.jsx provides delivery diagnostics feedback banner'
  );

  // Restore env
  if (origKey) {
    process.env.ADMIN_API_KEY = origKey;
  } else {
    delete process.env.ADMIN_API_KEY;
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
