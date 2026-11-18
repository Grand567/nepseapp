// tests/testTelegramConfigResilience.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('Telegram Config Loading & Fallback Resilience', async (t) => {
  const { getTelegramStatus, saveTelegramConfig } = await import('../proxy/telegramNotifier.mjs');
  const origChatId = process.env.TELEGRAM_CHAT_ID;
  const origIsTest = process.env.TELEGRAM_IS_TEST_SERVER;

  t.after(() => {
    if (origChatId !== undefined) process.env.TELEGRAM_CHAT_ID = origChatId;
    else delete process.env.TELEGRAM_CHAT_ID;

    if (origIsTest !== undefined) process.env.TELEGRAM_IS_TEST_SERVER = origIsTest;
    else delete process.env.TELEGRAM_IS_TEST_SERVER;

    saveTelegramConfig({
      botToken: '2202171825:AAF_TpoNTdy0tL0uRFFxLg9iAdB4C35qMNM',
      chatId: '2202431560',
      enabled: true,
      isTestServer: true
    });
  });

  await t.test('1. Fallback to process.env.TELEGRAM_CHAT_ID when fileConfig.chatId is empty string', async () => {
    process.env.TELEGRAM_CHAT_ID = '999888777';
    saveTelegramConfig({ chatId: '' });

    const status = await getTelegramStatus();
    assert.strictEqual(status.chatId, '999888777', 'chatId must fall back to process.env.TELEGRAM_CHAT_ID when fileConfig.chatId is empty string');
    assert.strictEqual(status.hasChatId, true, 'hasChatId must be true when env fallback provides valid chatId');
  });

  await t.test('2. Recognize TELEGRAM_IS_TEST_SERVER environment flag', async () => {
    process.env.TELEGRAM_IS_TEST_SERVER = 'true';
    saveTelegramConfig({ isTestServer: undefined });

    const status = await getTelegramStatus();
    assert.strictEqual(status.isTestServer, true, 'isTestServer must recognize TELEGRAM_IS_TEST_SERVER=true in env');
  });
});
