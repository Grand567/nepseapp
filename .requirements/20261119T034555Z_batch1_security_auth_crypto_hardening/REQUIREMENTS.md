# Requirements: Phase 3 Batch 1 — Security, Auth, Vault Crypto, Paywall & Export Hardening

**Task Folder:** `.requirements/20261119T034555Z_batch1_security_auth_crypto_hardening`
**Bug Scope:** `BUG-046` through `BUG-056`, plus `BUG-098` (`12` vulnerabilities)
**Notes on Tooling:** Serena and Lad MCP servers are absent in this environment; Context7 MCP (`express-rate-limit` verified), Playwright MCP (live UI rendering/console/network verification), and the `code-reviewer` (CodeRabbit) subagent fulfill the verification and review gates mandated by `.agent/rules/architecture-guard.md`.

---

## 1. As Is (Observed Pre-Fix State)

1. **`BUG-046` (Pro Paywall & License Bypass + Blurred DOM Mount):**
   - `src/utils/subscription.js` returns 100-year `isPro: true` (`source: 'unlocked_by_default'`, `voucherCode: 'LIFETIME_PRO'`) from `getFreeSubscription()` and `normalizeSubscription()`.
   - `src/context/SubscriptionContext.jsx` resets `cancelPlan` to `getFreeSubscription()` (`isPro: true`) and churns `useEffect` every 60s via `[subState]` dependency.
   - `src/components/SubscriptionModal.jsx` renders a 1-click free unlock button (`handleDirectActivate`), checks hardcoded client PINs `'8899'` and `'NEPSE2026'`, and invokes client-side `generateLicenseKey()` using `DEFAULT_SECRET_SALT` exposed in `src/utils/licenseEngine.js`. Also `redeemVoucherKey` accepts free hardcoded voucher strings (`PRO1M`, `VIPGURU`, `PRO<N>M`).
   - `src/components/ProGate.jsx` mounts `{children}` inside a blurred overlay (`showPreview`) even when locked.
2. **`BUG-047` (Hardcoded Portfolio Key & Missing User Isolation):**
   - `proxy/middleware/requirePortfolioAuth.mjs` defines and permits `DEFAULT_APP_PORTFOLIO_KEY = 'nepse-secure-portfolio-key-8899'`, accepts query params (`?portfolioKey`, `?adminKey`), and `proxy/smartAlertEngine.mjs` (`getUserTrackedHoldings`, `trackCustomHolding`, `untrackCustomHolding`) shares a single global list without per-user `ownerId` isolation.
   - `src/components/Portfolio.jsx` hardcodes `DEFAULT_APP_PORTFOLIO_KEY = 'nepse-secure-portfolio-key-8899'`, prints it in the sync modal, and falls back to `localStorage.getItem('nepse_admin_key')`.
3. **`BUG-048` (Reversible XOR Vault, Cross-User Profile Harvesting & Sign-Out Leak):**
   - `src/utils/credentialCrypto.js` uses repeating-key XOR (`enc_v1:`) with predictable key `drabyashree_nepse_vault_v1_${userId}_cdsc_guard`, and `encryptProfileCredentialsAsync` still writes `enc_v1:` shadow fields.
   - `src/App.jsx` and `src/components/MeroShareHub.jsx` iterate `localStorage.key(i)` to harvest all other `nepse_hub_*_profiles` keys into the active user's account list and global `nepse_hub_bulk_ipo_accounts`.
   - `src/components/AccountManager.jsx`, `src/components/IPOList.jsx`, and `src/components/PreferencesSettingsService.tsx` omit `userId` in credential encryption/decryption calls.
   - `src/App.jsx` `handleSignOut` does not wipe local vaults/keys on logout.
   - `src/components/LoginScreen.jsx` claims `"No data is sent to any server"` while `registerLocal` / `syncUserDataToCloud` sync to Cloud Sync / Firestore.
4. **`BUG-049` (Weak 32-Bit `hashSimple`, Unauthenticated Cloud `/push`/`/pull` & `sync_vaults_seed.json` Dump):**
   - `src/utils/firebase.js` hashes passwords with non-cryptographic 32-bit `hashSimple` and omits `passwordHash` from `/push` and `/pull`, restores `nepse_credentials_vault` into `localStorage`, and writes `nepse_hub_bulk_ipo_accounts`.
   - `proxy/syncRouter.mjs` allows unauthenticated `POST /push` vault creation, exposes `router.all('/pull')` (permitting `GET`), lacks bearer session tokens matching `(app, email)`, and dumps all user vaults & password hashes into `proxy/data/sync_vaults_seed.json`.
5. **`BUG-050` (Unauthenticated Global Fake-Clock Endpoint):**
   - `proxy/server.mjs` exposes `GET/POST/DELETE /api/test/fake-clock` in production without authentication.
6. **`BUG-051` (Unauthenticated Admin/Radar/Ledger/Telegram/Discord Mutation Routes & SSRF):**
   - `proxy/routes/radarRoutes.js` leaves `/admin/backfill-trigger`, `/radar/backfill`, `/radar/ingest`, `GET/POST /radar/rebuild-cache`, `GET/POST /admin/rebuild-cache`, and `/radar/export-snapshot` unprotected.
   - `proxy/server.mjs` computes unused `hasAdminKey` on `app.all('/api/telegram/config')` without checking it, leaves floorsheet/ledger/today/notification/telegram/discord mutation routes without `requireAdminSecret`, uses `app.all` on mutations, and `proxy/discordNotifier.mjs` only checks `.startsWith('https://discord.com/api/webhooks/')` without strict URL host/path validation.
7. **`BUG-052` (Rate Limiters Mounted After 6 Routers & Spoofable `Host: localhost` Bypass):**
   - `proxy/server.mjs` mounts `syncRouter`, `aiGuruRouter`, `floorsheetHubRouter`, `stockTelemetryRouter`, `signalTrackRecordRouter`, and `radarRouter` before `apiLimiter`/`scrapeLimiter`, and both limiters plus `proxy/middleware/requireAdminSecret.mjs` trust spoofable `req.hostname === 'localhost'`.
8. **`BUG-053` (Telegram Webhook Unsigned Bypass & First-Attacker Chat ID Hijack):**
   - `proxy/telegramNotifier.mjs` returns `true` from `validateWebhookSecretToken` when `expected` is empty and permanently saves incoming `chatId` when `cfg.chatId` is unset. `proxy/server.mjs` skips secret check when `webhookSecret` is empty.
9. **`BUG-054` (CSV Formula Injection CWE-1236, Fake Totals, Wrong Session Volume & O(N²) Loop):**
   - `src/utils/floorsheetExport.js` omits leading-character formula escaping (`=`, `+`, `-`, `@`, `\t`, `\r`), hardcodes `100, 100, 50, 50` in `TOTAL` rows, writes `df.buyVol` under `'Traded Volume'`, and uses `.indexOf` inside `.map()`.
10. **`BUG-055` (MeroShare Creds in Query/Logs, Open `/check-result` & `*` SSE CORS):**
    - `proxy/server.mjs` logs full `response.data`/`response.headers` on failed login and accepts credentials/tokens via `GET /api/meroshare/ipos` and `?token=` on `/api/meroshare/current-issues`.
    - `proxy/meroshare.js` leaves `POST /check-result` unauthenticated and `GET /ipos` exposes server account metadata to non-admins.
    - `proxy/routes/floorsheetHubRoutes.mjs` sets `Access-Control-Allow-Origin: *` on `/stream`.
11. **`BUG-056` (Plaintext `ADMIN_API_KEY` Prompt & `localStorage`, Tab Count Mismatch & CTA Bug):**
    - `src/components/NotificationCenterDrawer.jsx` prompts via `window.prompt()` and persists `nepse_admin_key` to `localStorage`, counts `pro`/`general` tabs inconsistently with filter predicates, labels CTA `'Simulate Live Setup (GHL)'` while triggering `NABIL`, and leaks its diagnostic timeout. `src/utils/pushNotificationService.js` reads `nepse_admin_key`/`nepse_portfolio_key` from `localStorage`.
12. **`BUG-098` (Plaintext `drabyashree_telegram_token` in `localStorage` & Unclamped 10-Share Minimum):**
    - `src/components/Master100ProfitWorkstation.tsx` stores `drabyashree_telegram_token` in `localStorage` and applies `Math.max(10, ...)` floors on position sizing so high-priced stocks (`RBCL` at Rs. `13,999`) exceed 100% of Rs. `100,000` capital.

---

## 2. To Be (Confirmed Design)

- **`BUG-046`:** Free tier defaults to `isPro: false` with empty entitlements; all Pro key generation & redemption runs server-side via HMAC-SHA256 in `proxy/utils/licenseServerEngine.mjs` (`ADMIN` authenticated keygen via `POST /api/admin/license/generate`, public rate-limited redemption/status via `POST /api/license/redeem` & `GET /api/license/status`). Client `SubscriptionModal.jsx` removes 1-click unlock & hardcoded PINs; `ProGate.jsx` unmounts locked `{children}` cleanly.
- **`BUG-047`:** Remove `'nepse-secure-portfolio-key-8899'` completely. `requirePortfolioAuth` accepts env-configured keys (`ADMIN_API_KEY`, `PORTFOLIO_AUTH_KEY`, etc.), Firebase ID tokens, signed Sync Session Tokens (extracting `req.portfolioOwnerId`), or explicit `local_dev` loopback mode. Portfolio tracking isolates holdings per `ownerId`.
- **`BUG-048`:** Local MeroShare credential storage uses seamless WebCrypto `AES-256-GCM` with non-exportable `CryptoKey`s persisted per-`uid` in IndexedDB (`extractable: false`, in-memory fallback for Node tests), stripping plaintext/`enc_v1:` fields while auto-migrating legacy `enc_v1:` entries on read. All cross-user `localStorage` harvesting is removed; `handleSignOut` wipes active session tokens, legacy global account blobs, and cached keys.
- **`BUG-049`:** Cloud sync uses client-side PBKDF2-SHA256 + server-side `scrypt` per-user salted hashing (with transparent one-time upgrade for legacy hashes on login), server-issued HMAC-SHA256 bearer session tokens bound to `(app, email)`, server-side credential stripping on all vaults, POST-only `/pull`, and zero writes to `sync_vaults_seed.json`.
- **`BUG-050`–`BUG-053` & `BUG-055`:** Strict `isLoopbackRequest` using socket remote IP only (zero `req.hostname` trust), `apiLimiter`/`scrapeLimiter` mounted above all routers, `fake-clock` disabled in production and gated by `requireAdminSecret`, all state-changing admin/radar/floorsheet/ledger/telegram/discord/meroshare routes converted to POST + `requireAdminSecret`, strict Discord URL validator with `redirect: 'error'`, fail-closed Telegram webhook secret & disabled chatId auto-bind, redacted MeroShare logs, body/header-only auth, and origin-allowlisted SSE `/stream`.
- **`BUG-054`, `BUG-056`, `BUG-098`:** Full CSV/XML formula-injection neutralization preserving signed pure numbers, accurate filtered Totals & daily volume, O(N) price history diffing; unified tab filter/count predicate + ephemeral admin input + NABIL CTA + clean timer unmount in `NotificationCenterDrawer.jsx`; zero `localStorage` token storage and honest 0-share unaffordability in `Master100ProfitWorkstation.tsx`.

---

## 3. Requirements & 4. Acceptance Criteria

- **FR-01 (`BUG-046`):** Free tier is locked (`isPro: false`), license keys are generated/redeemed/verified on the proxy with HMAC-SHA256, and `ProGate` never mounts locked `{children}`.
  - *AC-01:* `getFreeSubscription().isPro === false`; `normalizeSubscription` rejects `'unlocked_by_default'`/`'LIFETIME_PRO'`; `redeemServerLicenseKey` enforces device lock + HMAC + single-use burn; `ProGate` contains no blurred `{children}` mount when `!isPro`; zero hardcoded PINs or `DEFAULT_SECRET_SALT` on client.
- **FR-02 (`BUG-047`):** Portfolio auth has no shared hardcoded app key and isolates tracked holdings per user.
  - *AC-02:* `'nepse-secure-portfolio-key-8899'` is absent from `requirePortfolioAuth.mjs` and `Portfolio.jsx`; external request with that string receives `401/403`; signed user session tokens isolate `trackCustomHolding` / `getUserTrackedHoldings` / `untrackCustomHolding` by `ownerId`.
- **FR-03 (`BUG-048`):** MeroShare local vault encrypts credentials with WebCrypto AES-256-GCM (`v3_idb_aes256gcm`), removes cross-user harvesting, aligns `userId`, and wipes sensitive caches on sign-out.
  - *AC-03:* `encryptProfileVault` produces `vaultEnvelope.version === 'v3_idb_aes256gcm'` and zero `enc_v1:` shadow fields; `decryptProfileVault` migrates legacy `enc_v1:`; `App.jsx` & `MeroShareHub.jsx` perform zero cross-user `_profiles` harvesting; `AccountManager`, `IPOList`, `PreferencesSettingsService` scope by resolved `userId`; `LoginScreen.jsx` states local + optional encrypted cloud sync accurately; `handleSignOut` calls `clearSensitiveStorageOnSignOut()`.
- **FR-04 (`BUG-049`):** Cloud Sync authenticates `/push` and `/pull` with per-user salted `scrypt` password hashes and HMAC bearer tokens, strips credentials server-side, and never dumps vaults to `sync_vaults_seed.json`.
  - *AC-04:* `POST /register` & `POST /login` return valid signed tokens; `GET /pull` rejected; unauthenticated or wrong-user `POST /push` and `/pull` return `401/403`; `saveVault` never writes `sync_vaults_seed.json`.
- **FR-05 (`BUG-050`):** `/api/test/fake-clock` is disabled (`404`) when `NODE_ENV === 'production'` and gated by `requireAdminSecret`.
  - *AC-05:* Production guard and `requireAdminSecret` middleware present on all `/api/test/fake-clock` routes.
- **FR-06 (`BUG-051`):** All admin, radar backfill/ingest/cache/export, ledger transition, floorsheet write, notification test, Telegram config/dispatch, and Discord test routes require `requireAdminSecret` over `POST`, and Discord webhooks validate URLs strictly.
  - *AC-06:* `radarRoutes.js` rejects unauthenticated calls with `401`; `GET /radar/rebuild-cache` removed; `isValidDiscordWebhookUrl` blocks spoofed hosts/paths and non-HTTPS URLs; `server.mjs` gates every mutating admin/telegram/discord/ledger route.
- **FR-07 (`BUG-052`):** Rate limiters execute before all API/admin routers and loopback detection checks only socket IP.
  - *AC-07:* `requireAdminSecret` rejects external IP even when `Host: localhost`; `apiLimiter`/`scrapeLimiter` sit above all 6 routers and never trust `req.hostname`.
- **FR-08 (`BUG-053`):** Telegram webhook validation fails closed without configured secret and never auto-binds `chatId` from incoming updates.
  - *AC-08:* `validateWebhookSecretToken(undefined, ...)` is `false`; `handleIncomingTelegramUpdate` returns `chat_id_not_configured` without saving attacker `chatId`.
- **FR-09 (`BUG-054`):** CSV and SpreadsheetML exports neutralize formula payloads, compute true totals and traded volume, and transform price history in O(N).
  - *AC-09:* Formula strings starting with `=`, `+`, `-`, `@`, `\t`, `\r` (excluding negative pure numbers) are prefixed with `'`; `TOTAL` row shares & buy/sell % reflect active filtered rows; `Daily Session Summary` uses actual session volume; no `.indexOf` inside `exportStockPriceHistory`.
- **FR-10 (`BUG-055`):** MeroShare endpoints require body/header auth, redact logs, gate `/check-result` via `requireAdminSecret`, and `/stream` SSE enforces origin allowlist.
  - *AC-10:* `/api/meroshare/ipos` rejects query credentials; `/api/meroshare/current-issues` rejects `?token=`; `/api/meroshare/check-result` requires admin auth; SSE `/stream` returns `403` to `https://evil.example` and never sends `*`.
- **FR-11 (`BUG-056`):** `NotificationCenterDrawer` eliminates `window.prompt` & `localStorage` admin key storage, aligns tab badge counts with tab filters, fixes CTA symbol mismatch (`NABIL`), and cleans up timers.
  - *AC-11:* Static and functional checks confirm zero `window.prompt`/`localStorage` admin key reads/writes, shared `matchesNotificationTab`, `'Simulate Live Setup (NABIL)'`, and unmount `clearTimeout`.
- **FR-12 (`BUG-098`):** `Master100ProfitWorkstation` never writes Telegram bot tokens to `localStorage` and enforces 0-share unaffordability when budget/risk < 10 kitta (`RBCL`).
  - *AC-12:* Zero `drabyashree_telegram_token` reads/writes; `maxAffordableShares < 10` returns `allowedShares: 0` with explicit unaffordability notice.

---

## 5. Testing Plan

1. Write failing Red tests first in `tests/apBatch1SecurityHardening.test.mjs` covering FR-01 through FR-12 using `os.tmpdir()` (`NEPSE_DATA_DIR`) so repo files are untouched.
2. Implement fixes sequentially in small verifiable batches, maintaining compatibility with existing security tests (`alBatchPortfolioAuthenticationGuard`, `amBatchNotificationDiagnosticTest`, `mBatchCredentialSecurity`, `afBatchMeroshareKeyMigration`, `testTelegramWebhook`, `testTelegramConfigResilience`).
3. Register `apBatch1SecurityHardening.test.mjs` in `tests/runAll.mjs` and run full `node tests/runAll.mjs`, `node scripts/sentinelStaticAudit.cjs`, `npm run build`, Playwright MCP live preview verification, and `code-reviewer` CodeRabbit audit on uncommitted diffs.

---

## 6. Implementation Plan

1. **Step 1:** Author failing `tests/apBatch1SecurityHardening.test.mjs` and confirm Red baseline.
2. **Step 2:** Create `proxy/utils/corsConfig.mjs` and `proxy/utils/syncSessionToken.mjs`; harden `requireAdminSecret.mjs`, `requirePortfolioAuth.mjs`, and `smartAlertEngine.mjs` per-owner isolation.
3. **Step 3:** Create `proxy/utils/licenseServerEngine.mjs`, add proxy license endpoints, and harden `licenseEngine.js`, `subscription.js`, `SubscriptionContext.jsx`, `SubscriptionModal.jsx`, and `ProGate.jsx`.
4. **Step 4:** Harden `proxy/syncRouter.mjs`, `src/utils/firebase.js`, `src/utils/credentialCrypto.js`, `src/components/LoginScreen.jsx`; create `src/utils/profileVaultStorage.js`; update `App.jsx`, `MeroShareHub.jsx`, `AccountManager.jsx`, `IPOList.jsx`, `PreferencesSettingsService.tsx`, and `Portfolio.jsx`.
5. **Step 5:** Harden `proxy/server.mjs` (rate-limit order, loopback IP, `fake-clock`, route guards, MeroShare log/query redaction, webhook fail-closed), `radarRoutes.js`, `telegramNotifier.mjs`, `discordNotifier.mjs`, `meroshare.js`, `floorsheetHubRoutes.mjs`, and `servicesApi.js`.
6. **Step 6:** Harden `src/utils/floorsheetExport.js`, `src/components/NotificationCenterDrawer.jsx`, `src/utils/pushNotificationService.js`, and `src/components/Master100ProfitWorkstation.tsx`.
7. **Step 7:** Update legacy test expectations where security behavior intentionally tightened (`mBatchCredentialSecurity.test.mjs`, `testTelegramWebhook.test.mjs`), register `apBatch1SecurityHardening.test.mjs` in `tests/runAll.mjs`, run full test suite, static AST audit, `vite build`, Playwright MCP verification, CodeRabbit review, and update `WHOLE_APP_BUG_REGISTRY.md`.
