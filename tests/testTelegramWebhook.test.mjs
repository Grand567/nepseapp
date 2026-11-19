import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import {
  handleIncomingTelegramUpdate,
  validateWebhookSecretToken,
  getTelegramWebhookSecretToken,
  setTelegramWebhook,
  deleteTelegramWebhook,
  getTelegramWebhookInfo,
  isTelegramWebhookActive,
  saveTelegramConfig,
  getTelegramStatus
} from '../proxy/telegramNotifier.mjs';

describe('Telegram Webhook Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    saveTelegramConfig({
      botToken: '2202171825:AAF_TpoNTdy0tL0uRFFxLg9iAdB4C35qMNM',
      chatId: '2202431560',
      isTestServer: true,
      enabled: true
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('validates webhook secret token correctly and timing-safely', () => {
    assert.equal(validateWebhookSecretToken('secret_123', 'secret_123'), true);
    assert.equal(validateWebhookSecretToken('secret_123', 'wrong_token'), false);
    assert.equal(validateWebhookSecretToken(undefined, undefined), false);
    assert.equal(validateWebhookSecretToken('secret_123', undefined), false);
    assert.equal(validateWebhookSecretToken('secret_123', ''), false);
  });

  it('retrieves webhook secret token securely without exposing on getTelegramStatus', () => {
    saveTelegramConfig({
      webhookSecretToken: 'my_top_secret_token_123'
    });
    assert.equal(getTelegramWebhookSecretToken(), 'my_top_secret_token_123');
    const status = getTelegramStatus();
    assert.equal(status.hasWebhookSecret, true);
    assert.equal(status.webhookSecretToken, undefined);
  });

  it('preserves enabled state when updating webhook settings', () => {
    saveTelegramConfig({ enabled: false });
    assert.equal(getTelegramStatus().enabled, false);

    saveTelegramConfig({ useWebhook: true, webhookUrl: 'https://test.com' });
    assert.equal(getTelegramStatus().enabled, false); // must remain false!

    saveTelegramConfig({ enabled: true });
    assert.equal(getTelegramStatus().enabled, true);
  });

  it('rejects invalid secret_token format before calling Telegram API', async () => {
    const res = await setTelegramWebhook({
      url: 'https://nepseapp.onrender.com/api/telegram/webhook',
      secretToken: 'invalid secret with spaces!'
    });
    assert.equal(res.success, false);
    assert.match(res.error, /secret token must be 1-256 characters/);
  });

  it('deduplicates identical update_ids', async () => {
    let executedCount = 0;
    const mockOptions = {
      chatId: '2202431560',
      onTrackHolding: () => {},
      onUntrackHolding: () => {},
      onGetTrackedHoldings: () => [],
      getLatestStockPrice: async () => 100,
      onCommandHandled: () => { executedCount++; }
    };

    const update = {
      update_id: 999001,
      message: {
        chat: { id: '2202431560' },
        from: { first_name: 'TestUser' },
        text: '/status'
      }
    };

    const res1 = await handleIncomingTelegramUpdate(update, mockOptions);
    assert.equal(res1.processed, true);

    const res2 = await handleIncomingTelegramUpdate(update, mockOptions);
    assert.equal(res2.processed, false);
    assert.equal(res2.reason, 'duplicate_update_id');
  });

  it('blocks updates from unauthorized chat IDs', async () => {
    const update = {
      update_id: 999002,
      message: {
        chat: { id: '9999999999' }, // unauthorized
        from: { first_name: 'Attacker' },
        text: '/swing'
      }
    };

    const res = await handleIncomingTelegramUpdate(update, {});
    assert.equal(res.processed, false);
    assert.equal(res.reason, 'unauthorized_chat_id');
  });

  it('setTelegramWebhook calls Telegram API with correct endpoint and params', async () => {
    let calledUrl = '';
    let calledBody = null;

    global.fetch = async (url, opts) => {
      calledUrl = String(url);
      calledBody = JSON.parse(opts.body || '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: true, description: 'Webhook was set' })
      };
    };

    const res = await setTelegramWebhook({
      url: 'https://nepseapp.onrender.com/api/telegram/webhook',
      secretToken: 'secure_secret_token_abc'
    });

    assert.equal(res.success, true);
    assert.match(calledUrl, /\/bot.*\/test\/setWebhook/);
    assert.equal(calledBody.url, 'https://nepseapp.onrender.com/api/telegram/webhook');
    assert.equal(calledBody.secret_token, 'secure_secret_token_abc');
  });

  it('deleteTelegramWebhook calls Telegram deleteWebhook API', async () => {
    let calledUrl = '';

    global.fetch = async (url) => {
      calledUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: true, description: 'Webhook was deleted' })
      };
    };

    const res = await deleteTelegramWebhook();
    assert.equal(res.success, true);
    assert.match(calledUrl, /\/bot.*\/test\/deleteWebhook/);
  });

  it('getTelegramWebhookInfo retrieves webhook status', async () => {
    global.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            url: 'https://nepseapp.onrender.com/api/telegram/webhook',
            has_custom_certificate: false,
            pending_update_count: 0
          }
        })
      };
    };

    const info = await getTelegramWebhookInfo();
    assert.equal(info.ok, true);
    assert.equal(info.result.url, 'https://nepseapp.onrender.com/api/telegram/webhook');
  });

  it('rejects incoming webhook updates without auto-binding chatId when chatId is unset', async () => {
    const origTgChat = process.env.TELEGRAM_CHAT_ID;
    const origChat = process.env.CHAT_ID;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.CHAT_ID;
    try {
      saveTelegramConfig({
        botToken: '2202171825:AAF_TpoNTdy0tL0uRFFxLg9iAdB4C35qMNM',
        chatId: '',
        enabled: true,
        isTestServer: true
      });

      const hijackRes = await handleIncomingTelegramUpdate({
        update_id: 999123,
        message: { chat: { id: '8888777766' }, text: '/status' }
      }, {});

      assert.equal(hijackRes.processed, false);
      assert.equal(hijackRes.reason, 'chat_id_not_configured');
      assert.equal(getTelegramStatus().hasChatId, false);
    } finally {
      if (origTgChat !== undefined) process.env.TELEGRAM_CHAT_ID = origTgChat;
      else delete process.env.TELEGRAM_CHAT_ID;
      if (origChat !== undefined) process.env.CHAT_ID = origChat;
      else delete process.env.CHAT_ID;
    }
  });
});
