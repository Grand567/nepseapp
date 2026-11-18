# Requirements: Telegram Webhook on Render for Instant Wake-Up & 2-Way Execution

## 1. As Is
- The Telegram trading assistant relies exclusively on long-polling (`pollIncomingTelegramCommands` called every 4 seconds in `proxy/workers.mjs`).
- When Render enters free-tier hibernation after 15 minutes of inactivity (or outside trading hours 10:45–15:15 NPT when `keepalive.mjs` sleeps), no process polls Telegram.
- Incoming user commands (such as `/swing`, `/top5`, `/track`, `/list`) sit unread in Telegram's cloud queue and do not pop up until an active polling process wakes up or runs locally.

## 2. To Be
- Provide an HTTPS Webhook endpoint `/api/telegram/webhook` in `proxy/server.mjs`.
- Provide webhook lifecycle management methods:
  - `setTelegramWebhook({ url, secretToken, dropPendingUpdates })`
  - `deleteTelegramWebhook({ dropPendingUpdates })`
  - `getTelegramWebhookInfo()`
- When a user sends any command in Telegram (e.g. `/swing`), Telegram immediately fires an HTTPS POST to `https://nepseapp.onrender.com/api/telegram/webhook`.
- Render's edge load balancer receives the incoming HTTPS request and automatically awakens the hibernating container.
- The webhook endpoint verifies the `X-Telegram-Bot-Api-Secret-Token` header (OWASP security guard), returns HTTP 200 `{ ok: true }` to Telegram promptly to prevent retry hammering, and executes `handleIncomingTelegramUpdate(update, options)`.
- If Webhook mode is active (`webhook_enabled: true` or active webhook URL registered), background polling in `workers.mjs` safely skips `getUpdates` to avoid HTTP 409 Conflict.
- Support seamless switching or fallback between Webhook mode and Polling mode.

## 3. Requirements
1. **Webhook Update Handler (`handleIncomingTelegramUpdate`)**:
   - Extract `update_id`, `message`/`edited_message`/`channel_post`, `chat.id`, and `text`.
   - Validate authorization: strictly enforce owner Chat ID match. Reject unauthorized chat IDs with a polite notification.
   - Dispatch to `handleTelegramCommand(text, options)`.
   - Prevent duplicate processing of the same `update_id` via an in-memory sliding cache.
2. **Webhook Endpoint (`POST /api/telegram/webhook`)**:
   - Accept JSON payload containing Telegram `Update`.
   - Validate `X-Telegram-Bot-Api-Secret-Token` header if secret token is configured. Return 401 if mismatch.
   - Return HTTP 200 `{ ok: true }` immediately.
   - Process the update asynchronously without blocking the HTTP response.
3. **Webhook Setup & Teardown Utilities (`setTelegramWebhook`, `deleteTelegramWebhook`, `getTelegramWebhookInfo`)**:
   - Call Telegram Bot API `setWebhook`, `deleteWebhook`, and `getWebhookInfo` honoring `isTestServer` flag.
   - Allow setting custom public base URL (defaulting to `https://nepseapp.onrender.com`).
   - Allow configuration of `secret_token` stored securely in `telegram_config.json` and PostgreSQL.
4. **API Endpoints in `proxy/server.mjs`**:
   - `POST /api/telegram/webhook` — the webhook receiver.
   - `GET /api/telegram/webhook/info` — returns current Telegram webhook registration status.
   - `POST /api/telegram/webhook/setup` — registers `https://nepseapp.onrender.com/api/telegram/webhook` with Telegram Bot API.
   - `POST /api/telegram/webhook/delete` — deletes the webhook from Telegram Bot API and restores polling mode.
5. **Polling Conflict Guard in `workers.mjs`**:
   - Check if webhook is active. If active, suppress polling `getUpdates` to prevent Telegram API 409 Conflict errors.

## 4. Acceptance Criteria
1. `POST /api/telegram/webhook` returns 200 OK for valid updates and processes commands like `/swing`.
2. Unauthorized chat IDs are rejected with 401 or polite denial message and cannot execute commands.
3. If secret token is enabled, requests with mismatched `x-telegram-bot-api-secret-token` receive HTTP 401 Unauthorized.
4. `getTelegramWebhookInfo()` retrieves real-time webhook status from Telegram.
5. Setting up webhook via `/api/telegram/webhook/setup` correctly configures Telegram and records state.
6. Deleting webhook via `/api/telegram/webhook/delete` restores Telegram to polling mode.
7. Automated test suite verifies webhook verification, secret token validation, deduplication, command dispatch, and 409 conflict avoidance.

## 5. Testing Plan
- Create unit/integration test file `tests/testTelegramWebhook.test.mjs` testing:
  1. Secret token authentication check (pass on valid token, 401 on invalid).
  2. Owner Chat ID authorization check (execute on authorized chatId, ignore/block on unauthorized).
  3. Duplicate update_id deduplication.
  4. Webhook setup and teardown API communication logic (mocked Telegram Bot API).
  5. Polling skip when webhook is active.

## 6. Implementation Plan
- Step 1: Create failing test suite `tests/testTelegramWebhook.test.mjs`.
- Step 2: Implement `handleIncomingTelegramUpdate`, `setTelegramWebhook`, `deleteTelegramWebhook`, `getTelegramWebhookInfo` in `proxy/telegramNotifier.mjs`.
- Step 3: Implement `/api/telegram/webhook`, `/api/telegram/webhook/setup`, `/api/telegram/webhook/info`, `/api/telegram/webhook/delete` in `proxy/server.mjs`.
- Step 4: Update `proxy/workers.mjs` to check webhook active status before polling.
- Step 5: Run tests and verify all pass.
- Step 6: Test live webhook setup with Telegram Bot API.
