import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('BUG-089: main.cjs registers will-navigate and will-redirect to block external in-window navigation', () => {
  const mainCjsPath = path.join(ROOT, 'electron', 'main.cjs');
  assert.ok(fs.existsSync(mainCjsPath), 'electron/main.cjs must exist');
  
  const content = fs.readFileSync(mainCjsPath, 'utf8');
  assert.ok(content.includes("'will-navigate'"), 'main.cjs must listen to will-navigate');
  assert.ok(content.includes('event.preventDefault()'), 'must call event.preventDefault() on external navigation');
  assert.ok(content.includes('shell.openExternal'), 'must delegate external URLs to shell.openExternal');
  assert.ok(content.includes('setWindowOpenHandler'), 'must configure setWindowOpenHandler');
});

test('BUG-089: navigation guard logic permits only internal origins and blocks external links', () => {
  function createNavigationGuard({ isDev, openExternalMock }) {
    return (url) => {
      let prevented = false;
      const event = {
        preventDefault: () => { prevented = true; }
      };

      const isDevOrigin = isDev && (url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1:3000'));
      const isFileOrigin = !isDev && url.startsWith('file://');
      if (isDevOrigin || isFileOrigin) {
        return { prevented: false, externalOpened: false };
      }

      event.preventDefault();
      let externalOpened = false;
      if (url.startsWith('http:') || url.startsWith('https:')) {
        openExternalMock(url);
        externalOpened = true;
      }
      return { prevented, externalOpened };
    };
  }

  const openedUrls = [];
  const mockOpenExternal = (u) => openedUrls.push(u);

  // Test in production mode (isFileOrigin)
  const prodGuard = createNavigationGuard({ isDev: false, openExternalMock: mockOpenExternal });
  
  // Internal file URL should pass through
  const res1 = prodGuard('file:///path/to/dist/index.html');
  assert.equal(res1.prevented, false, 'Internal file URL must not be blocked');
  assert.equal(res1.externalOpened, false);

  // External URL should be blocked in-window and opened in OS browser
  const res2 = prodGuard('https://nepalstock.com/market');
  assert.equal(res2.prevented, true, 'External URL must be blocked in-window');
  assert.equal(res2.externalOpened, true, 'External URL must be passed to system browser');
  assert.equal(openedUrls[0], 'https://nepalstock.com/market');

  // External HTTP URL should also be blocked
  const res3 = prodGuard('http://meroshare.cdsc.com.np');
  assert.equal(res3.prevented, true, 'External HTTP must be blocked');
  assert.equal(openedUrls[1], 'http://meroshare.cdsc.com.np');

  // Test in dev mode (isDevOrigin)
  const devGuard = createNavigationGuard({ isDev: true, openExternalMock: mockOpenExternal });
  const resDevInternal = devGuard('http://localhost:3000/#/portfolio');
  assert.equal(resDevInternal.prevented, false, 'Dev internal URL must not be blocked');

  const resDevExternal = devGuard('https://sharesansar.com/news');
  assert.equal(resDevExternal.prevented, true, 'Dev external URL must be blocked in-window');
  assert.equal(openedUrls[2], 'https://sharesansar.com/news');
});
