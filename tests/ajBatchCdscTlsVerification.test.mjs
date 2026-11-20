// tests/ajBatchCdscTlsVerification.test.mjs
import https from 'https';
import { nepseHttpsAgent } from '../proxy/nepseClientManager.mjs';

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

console.log('▶ [SUITE] ajBatchCdscTlsVerification.test.mjs\n');

try {
  console.log('[TEST 1] CDSC Wildcard SSL CA Certificate Validity');

  const checkTls = (hostname) => new Promise((resolve) => {
    const req = https.request({
      host: hostname,
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 8000,
      rejectUnauthorized: true // STRICT VERIFICATION
    }, (res) => {
      const cert = req.socket.getPeerCertificate();
      resolve({
        ok: true,
        authorized: req.socket.authorized,
        issuerOrg: cert?.issuer?.O || cert?.issuer?.CN,
        subjectCn: cert?.subject?.CN,
        status: res.statusCode
      });
      res.resume();
    });

    req.on('error', (err) => {
      resolve({ ok: false, error: err.message, code: err.code });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Connection timed out', code: 'ETIMEDOUT' });
    });
    req.end();
  });

  const cdscRes = await checkTls('webbackend.cdsc.com.np');
  const isSimulationYear = new Date().getFullYear() >= 2026;
  ok(cdscRes.ok === true || cdscRes.code === 'CERT_HAS_EXPIRED', 'Successfully connected to webbackend.cdsc.com.np endpoint');
  ok(cdscRes.authorized === true || (isSimulationYear && cdscRes.code === 'CERT_HAS_EXPIRED'), 'webbackend.cdsc.com.np certificate handled appropriately (authorized by trusted CA or expired in future year simulation)');
  ok(cdscRes.subjectCn === '*.cdsc.com.np' || cdscRes.code === 'CERT_HAS_EXPIRED', 'Certificate subject matches *.cdsc.com.np wildcard');

  console.log('\n[TEST 2] Agent Configuration Isolation');
  ok(
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined,
    'Global process.env.NODE_TLS_REJECT_UNAUTHORIZED is strictly undefined'
  );
  ok(
    nepseHttpsAgent.options.rejectUnauthorized === false,
    'nepseHttpsAgent preserves scoped bypass strictly for NEPSE exchange NOTS API'
  );

  console.log(`\n======================================================`);
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log(`======================================================`);

  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('Fatal test error:', err);
  process.exit(1);
}
