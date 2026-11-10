// tests/testTelegramCommandDispatch.test.mjs
import { 
  pollIncomingTelegramCommands, 
  sendTelegramMessage, 
  saveTelegramConfig,
  getTelegramStatus,
  resetTelegramAuthError
} from '../proxy/telegramNotifier.mjs';

let pass = 0;
let fail = 0;

const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
};

console.log('▶ [SUITE] testTelegramCommandDispatch.test.mjs\n');

(async () => {
  try {
    // Setup clean config
    saveTelegramConfig({
      botToken: '123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ',
      chatId: '',
      enabled: true,
      isTestServer: false
    });
    resetTelegramAuthError();

    const dispatchedMessages = [];
    const origFetch = global.fetch;

    // Mock Telegram API calls
    global.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/sendMessage')) {
        const body = options.body ? JSON.parse(options.body) : {};
        dispatchedMessages.push(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 8888, chat: { id: body.chat_id } } })
        };
      }
      if (urlStr.includes('/getUpdates')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: [
              {
                update_id: 1001,
                message: {
                  message_id: 1,
                  from: { id: 777666, first_name: 'Investor' },
                  chat: { id: 777666, type: 'private' },
                  text: '/ping'
                }
              },
              {
                update_id: 1002,
                message: {
                  message_id: 2,
                  from: { id: 777666, first_name: 'Investor' },
                  chat: { id: 777666, type: 'private' },
                  text: '/track SHIVM 510 484 100'
                }
              }
            ]
          })
        };
      }
      return origFetch ? origFetch(url, options) : { ok: true, json: async () => ({}) };
    };

    // Run command poller
    const trackedHoldings = [];
    await pollIncomingTelegramCommands({
      onTrackHolding: (h) => trackedHoldings.push(h),
      onUntrackHolding: () => true,
      onGetTrackedHoldings: () => trackedHoldings,
      getLatestStockPrice: async () => 520
    });

    ok(dispatchedMessages.length >= 2, `Dispatched responses for both incoming commands (received ${dispatchedMessages.length})`);
    
    // Check auto-bind
    const status = getTelegramStatus();
    ok(status.chatId === '777666', `Auto-bound incoming chat ID (got ${status.chatId})`);

    // Check message 1: /ping
    const pingResp = dispatchedMessages.find(m => m.text && m.text.includes('Pong'));
    ok(pingResp && String(pingResp.chat_id) === '777666', `Ping responded with Pong to chat 777666`);

    // Check message 2: /track SHIVM
    const trackResp = dispatchedMessages.find(m => m.text && m.text.includes('SHIVM'));
    ok(trackResp && String(trackResp.chat_id) === '777666', `Track command armed SHIVM and replied to chat 777666`);
    ok(trackedHoldings.length === 1 && trackedHoldings[0].symbol === 'SHIVM', `Tracked holding saved in memory for SHIVM`);

    // Restore fetch
    global.fetch = origFetch;

    console.log(`\n======================================================`);
    console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log(`======================================================`);
    if (fail > 0) process.exit(1);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
})();
