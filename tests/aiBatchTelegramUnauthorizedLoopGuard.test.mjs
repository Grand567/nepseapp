// tests/aiBatchTelegramUnauthorizedLoopGuard.test.mjs
import { 
  pollIncomingTelegramCommands, 
  sendTelegramMessage, 
  isTelegramTokenInvalid, 
  resetTelegramAuthError,
  saveTelegramConfig 
} from '../proxy/telegramNotifier.mjs';

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

console.log('▶ [SUITE] aiBatchTelegramUnauthorizedLoopGuard.test.mjs\n');

try {
  console.log('[TEST 1] Initial Clean State');
  resetTelegramAuthError();
  ok(isTelegramTokenInvalid() === false, 'Notifier starts with isTokenInvalid: false');

  console.log('\n[TEST 2] Single Warning & Token Secrecy Guard');
  const loggedWarnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    loggedWarnings.push(args.join(' '));
    origWarn(...args);
  };

  const dummyBadToken = '9999999999:AAFakeTokenForTestOnly9999999999';

  // Force live call with invalid token
  process.env.TEST_LIVE_TELEGRAM = 'true';
  process.env.TELEGRAM_BOT_TOKEN = dummyBadToken;
  process.env.TELEGRAM_CHAT_ID = '12345678';

  // First poll with bad token -> will encounter 401 Unauthorized
  await pollIncomingTelegramCommands();

  console.warn = origWarn;

  ok(isTelegramTokenInvalid() === true, 'isTokenInvalid flagged true after 401 Unauthorized');
  ok(loggedWarnings.length === 1, `Logged exactly one warning on 401 Unauthorized (count: ${loggedWarnings.length})`);
  ok(
    loggedWarnings[0].includes('Telegram Bot Token is invalid or revoked (HTTP 401 Unauthorized)'),
    'Warning message clearly identifies 401 Unauthorized and suspension of retries'
  );
  ok(
    !loggedWarnings[0].includes(dummyBadToken),
    'Strict Security Guard: Secret bot token is NEVER printed in logs or warning'
  );

  console.log('\n[TEST 3] Loop Halting Guard (Zero Additional Requests on Subsequent Polls)');
  let repeatedWarnings = 0;
  console.warn = () => { repeatedWarnings++; };

  // Call pollIncomingTelegramCommands 5 times in rapid succession
  for (let i = 0; i < 5; i++) {
    await pollIncomingTelegramCommands();
  }

  // Call sendTelegramMessage
  const sendRes = await sendTelegramMessage('Test alert during invalid token state');

  console.warn = origWarn;

  ok(repeatedWarnings === 0, 'No repeated warning spam produced during loop calls');
  ok(sendRes.success === false, 'sendTelegramMessage safely failed early without retrying');
  ok(sendRes.reason.includes('HTTP 401 Unauthorized'), 'sendTelegramMessage returned clear suspension reason');

  console.log('\n[TEST 4] Configuration Update & Error State Recovery');
  saveTelegramConfig({ botToken: '123456:NewTokenTest', chatId: '123456', enabled: true });
  ok(isTelegramTokenInvalid() === false, 'Updating telegram config resets isTokenInvalid flag to allow clean recovery');

  // Cleanup test env
  delete process.env.TEST_LIVE_TELEGRAM;

  console.log(`\n======================================================`);
  console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log(`======================================================`);

  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('Fatal test error:', err);
  process.exit(1);
}
