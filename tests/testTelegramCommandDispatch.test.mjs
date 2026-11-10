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

    const updatesQueue = [
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
      },
      {
        update_id: 1003,
        message: {
          message_id: 3,
          from: { id: 777666, first_name: 'Investor' },
          chat: { id: 777666, type: 'private' },
          text: '/track@drabya_trade_alert_bot'
        }
      },
      {
        update_id: 1004,
        message: {
          message_id: 4,
          from: { id: 777666, first_name: 'Investor' },
          chat: { id: 777666, type: 'private' },
          text: '/list@drabya_trade_alert_bot'
        }
      },
      {
        update_id: 1005,
        message: {
          message_id: 5,
          from: { id: 777666, first_name: 'Investor' },
          chat: { id: 777666, type: 'private' },
          text: '/sl'
        }
      },
      {
        update_id: 1006,
        message: {
          message_id: 6,
          from: { id: 777666, first_name: 'Investor' },
          chat: { id: 777666, type: 'private' },
          text: 'namaste'
        }
      },
      {
        update_id: 1007,
        message: {
          message_id: 7,
          from: { id: 777666, first_name: 'Investor' },
          chat: { id: 777666, type: 'private' },
          text: '/breakout'
        }
      }
    ];

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
            result: updatesQueue
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

    ok(dispatchedMessages.length === updatesQueue.length, `Dispatched responses for all ${updatesQueue.length} incoming commands (received ${dispatchedMessages.length})`);
    
    // Check auto-bind
    const status = getTelegramStatus();
    ok(status.chatId === '777666', `Auto-bound incoming chat ID (got ${status.chatId})`);

    // Check message 1: /ping
    const pingResp = dispatchedMessages[0];
    ok(pingResp && pingResp.text.includes('Pong'), `Ping responded with Pong to chat 777666`);

    // Check message 2: /track SHIVM
    const trackResp = dispatchedMessages[1];
    ok(trackResp && trackResp.text.includes('EXIT GUARD ARMED: <code>SHIVM</code>'), `Track command armed SHIVM and replied with entry & PnL`);
    ok(trackResp && trackResp.text.includes('Your Entry (Buy Price):</b> Rs. 510.00'), `Track response correctly preserves entry price 510.00`);
    ok(trackedHoldings.length === 1 && trackedHoldings[0].symbol === 'SHIVM', `Tracked holding saved in memory for SHIVM`);

    // Check message 3: /track@drabya_trade_alert_bot (empty track guide)
    const emptyTrackResp = dispatchedMessages[2];
    ok(emptyTrackResp && emptyTrackResp.text.includes('HOW TO TRACK A STOCK'), `Empty /track@drabya_trade_alert_bot stripped username and replied with tracking syntax guide`);

    // Check message 4: /list@drabya_trade_alert_bot
    const listResp = dispatchedMessages[3];
    ok(listResp && listResp.text.includes('Actively Monitored Holdings') && listResp.text.includes('Entry:</b> Rs. 510.00'), `List command stripped username and rendered accurate holding card with Entry 510.00`);

    // Check message 5: /sl
    const slResp = dispatchedMessages[4];
    ok(slResp && slResp.text.includes('HOLDING RISK') && slResp.text.includes('Stop Floor:</b> Rs. 484.00'), `/sl returned active stop loss defense card for SHIVM`);

    // Check message 6: 'namaste' greeting
    const greetResp = dispatchedMessages[5];
    ok(greetResp && greetResp.text.includes('Namaste! Welcome to Dravyashree'), `Plaintext 'namaste' greeted investor and listed quick action commands`);

    // Check message 7: /breakout
    const breakoutResp = dispatchedMessages[6];
    ok(breakoutResp && breakoutResp.text.includes('BREAKOUT'), `/breakout triggered 20-day resistance breakout radar`);

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
