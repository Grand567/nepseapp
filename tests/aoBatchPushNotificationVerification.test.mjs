// tests/aoBatchPushNotificationVerification.test.mjs
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUSH NOTIFICATION REGISTRATION & PERSISTENCE VERIFICATION SUITE
 * ───────────────────────────────────────────────────────────────────────────
 * Validates:
 * 1. google-services.json existence, project ID match, and package name parity
 * 2. Capacitor & Android Gradle appId parity
 * 3. Notification channels and monochrome status bar icon resource
 * 4. Token registration, DB/JSON persistence, and re-registration on resume
 * 5. Dead / expired FCM token pruning and test dispatch FCM pathway
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerPushToken,
  deletePushToken,
  pruneDeadPushTokens,
  dispatchFcmNotification
} from '../proxy/smartAlertEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

let pass = 0;
let fail = 0;

function ok(cond, desc) {
  if (cond) {
    pass++;
    console.log(`  ✓ PASS: ${desc}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${desc}`);
  }
}

console.log('======================================================================');
console.log(' PUSH NOTIFICATION REGISTRATION & PERSISTENCE VERIFICATION SUITE');
console.log('======================================================================\n');

try {
  // ─── TEST 1: Google Services & Package Identity Parity ───────────────────────
  console.log('[TEST 1] Google Services, Capacitor & Gradle Package Parity');
  const gsPath = path.join(ROOT_DIR, 'android/app/google-services.json');
  ok(fs.existsSync(gsPath), 'android/app/google-services.json exists');

  const gsJson = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
  const projectId = gsJson.project_info?.project_id;
  ok(projectId === 'drabyashree-nepse-hub-11ef9', `Project ID matches expected: ${projectId}`);

  const clientPackages = (gsJson.client || []).map(c => c.client_info?.android_client_info?.package_name);
  ok(clientPackages.includes('com.smartwealth.nepse'), 'google-services.json registers com.smartwealth.nepse');

  const capConfig = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'capacitor.config.json'), 'utf8'));
  ok(capConfig.appId === 'com.smartwealth.nepse', 'capacitor.config.json appId matches com.smartwealth.nepse');
  ok(capConfig.plugins?.PushNotifications?.presentationOptions?.includes('alert'), 'Capacitor push presentationOptions includes alert');

  const gradleContent = fs.readFileSync(path.join(ROOT_DIR, 'android/app/build.gradle'), 'utf8');
  ok(gradleContent.includes('applicationId "com.smartwealth.nepse"'), 'build.gradle applicationId matches com.smartwealth.nepse');

  // ─── TEST 2: Status Bar Icon & Android Manifest Metadata ──────────────────
  console.log('\n[TEST 2] Status Bar Icon Resource & Notification Channel Declarations');
  const iconPath = path.join(ROOT_DIR, 'android/app/src/main/res/drawable/ic_stat_notification.xml');
  ok(fs.existsSync(iconPath), 'Monochrome status bar icon ic_stat_notification.xml exists');

  const iconXml = fs.readFileSync(iconPath, 'utf8');
  ok(iconXml.includes('<vector') && iconXml.includes('#FFFFFFFF'), 'ic_stat_notification.xml is a white vector silhouette');

  const colorsPath = path.join(ROOT_DIR, 'android/app/src/main/res/values/colors.xml');
  ok(fs.existsSync(colorsPath), 'values/colors.xml exists');

  const manifestXml = fs.readFileSync(path.join(ROOT_DIR, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  ok(manifestXml.includes('com.google.firebase.messaging.default_notification_icon'), 'Manifest registers FCM default_notification_icon');
  ok(manifestXml.includes('com.google.firebase.messaging.default_notification_channel_id'), 'Manifest registers default_notification_channel_id');
  ok(manifestXml.includes('android.permission.POST_NOTIFICATIONS'), 'Manifest declares POST_NOTIFICATIONS permission');

  // ─── TEST 3: Frontend Push Token Lifecycle & Re-Registration on Resume ──────
  console.log('\n[TEST 3] Frontend Push Notification Service & App Resume Lifecycle');
  const pushServiceCode = fs.readFileSync(path.join(ROOT_DIR, 'src/utils/pushNotificationService.js'), 'utf8');
  ok(pushServiceCode.includes('PushNotifications.register()'), 'pushNotificationService calls PushNotifications.register()');
  ok(pushServiceCode.includes('PushNotifications.requestPermissions()'), 'pushNotificationService requests permissions');
  ok(pushServiceCode.includes("addListener('registration'"), 'pushNotificationService listens for registration event');
  ok(pushServiceCode.includes('/api/smart-alerts/register-token'), 'pushNotificationService posts token to backend registration endpoint');
  ok(pushServiceCode.includes('export async function syncDevicePushToken'), 'Exports syncDevicePushToken for resume & refresh synchronization');

  const appCode = fs.readFileSync(path.join(ROOT_DIR, 'src/App.jsx'), 'utf8');
  ok(appCode.includes("import { initPushNotifications, syncDevicePushToken"), 'App.jsx imports syncDevicePushToken');
  ok(appCode.includes("syncDevicePushToken().catch"), 'App.jsx re-synchronizes push token on app resume (appStateChange isActive)');
  ok(pushServiceCode.includes("visibilitychange"), 'pushNotificationService listens for visibilitychange to sync token');
  ok(pushServiceCode.includes("appVersion"), 'pushNotificationService attaches appVersion to token registration payload');

  // ─── TEST 4: Server Push Token Registration & PostgreSQL / JSON Storage ─────
  console.log('\n[TEST 4] Server Token Registration, Persistence & Pruning');
  const testToken1 = `test_fcm_token_${Date.now()}_alpha`;
  const testToken2 = `test_fcm_token_${Date.now()}_beta_dead`;

  const reg1 = await registerPushToken(testToken1, 'android', ['NABIL', 'SHIVM']);
  ok(reg1 === true, 'Successfully registered testToken1');

  const reg2 = await registerPushToken(testToken2, 'android', ['HDL']);
  ok(reg2 === true, 'Successfully registered testToken2');

  const tokensFile = path.join(ROOT_DIR, 'proxy/data/push_tokens.json');
  ok(fs.existsSync(tokensFile), 'proxy/data/push_tokens.json exists on disk');
  const savedTokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
  ok(savedTokens.some(t => t.token === testToken1), 'Saved tokens contains testToken1');
  ok(savedTokens.some(t => t.token === testToken2), 'Saved tokens contains testToken2');

  // Prune dead token
  const prunedCount = await pruneDeadPushTokens([testToken2]);
  ok(prunedCount === 1, 'pruneDeadPushTokens pruned exactly 1 dead token');

  const postPruneTokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
  ok(!postPruneTokens.some(t => t.token === testToken2), 'testToken2 successfully removed from disk');
  ok(postPruneTokens.some(t => t.token === testToken1), 'testToken1 remains active');

  // Clean up test token 1
  await deletePushToken(testToken1);
  const finalTokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
  ok(!finalTokens.some(t => t.token === testToken1), 'testToken1 successfully deleted');

  // ─── TEST 5: FCM Notification Dispatch & Test-Dispatch Route ───────────────
  console.log('\n[TEST 5] FCM Notification Dispatch & Admin Diagnostics Route');
  const serverCode = fs.readFileSync(path.join(ROOT_DIR, 'proxy/server.mjs'), 'utf8');
  ok(serverCode.includes("app.post('/api/notifications/test-dispatch'"), 'server.mjs registers POST /api/notifications/test-dispatch');
  ok(serverCode.includes("dispatchFcmNotification(testAlert)"), 'test-dispatch route explicitly invokes dispatchFcmNotification');
  ok(serverCode.includes("app.post('/api/smart-alerts/unregister-token'"), 'server.mjs registers unregister-token endpoint');

  const dbCode = fs.readFileSync(path.join(ROOT_DIR, 'proxy/db.mjs'), 'utf8');
  ok(dbCode.includes("CREATE TABLE IF NOT EXISTS push_tokens"), 'db.mjs defines PostgreSQL push_tokens table schema');
  ok(dbCode.includes("ensurePushTokensTable"), 'db.mjs exports ensurePushTokensTable startup migration');
  ok(dbCode.includes("app_version"), 'push_tokens schema includes app_version column');
  ok(dbCode.includes("last_seen_at"), 'push_tokens schema includes last_seen_at column');

  const mockAlert = {
    symbol: 'NABIL',
    title: '⚡ Institutional Breakout: NABIL',
    body: 'LTP Rs. 610 broke VWAP support band with institutional buying.',
    category: 'pro',
    type: 'BREAKOUT',
    isTest: true
  };
  const dispatchRes = await dispatchFcmNotification(mockAlert);
  ok(dispatchRes.success === true, 'dispatchFcmNotification executes cleanly with fallback notification payload');

  console.log('\n======================================================================');
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('======================================================================');

  if (fail > 0) process.exit(1);
} catch (e) {
  console.error('Test execution error:', e);
  process.exit(1);
}
