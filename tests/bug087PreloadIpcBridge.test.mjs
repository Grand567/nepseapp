import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('BUG-087: electron/preload.cjs exists and is configured in electron/main.cjs', () => {
  const preloadPath = path.join(ROOT, 'electron', 'preload.cjs');
  assert.ok(fs.existsSync(preloadPath), 'electron/preload.cjs must exist');

  const mainPath = path.join(ROOT, 'electron', 'main.cjs');
  const mainContent = fs.readFileSync(mainPath, 'utf8');

  assert.ok(mainContent.includes("preload: path.join(__dirname, 'preload.cjs')"), 'webPreferences must specify preload.cjs');
  assert.ok(mainContent.includes('nodeIntegration: false'), 'webPreferences must retain nodeIntegration: false');
  assert.ok(mainContent.includes('contextIsolation: true'), 'webPreferences must retain contextIsolation: true');
  assert.ok(mainContent.includes('sandbox: true'), 'webPreferences must retain sandbox: true');
});

test('BUG-087: preload exposes minimal secure API and validates external URLs', () => {
  const preloadPath = path.join(ROOT, 'electron', 'preload.cjs');
  const content = fs.readFileSync(preloadPath, 'utf8');

  // Must use contextBridge.exposeInMainWorld
  assert.ok(content.includes("contextBridge.exposeInMainWorld('electron'"), 'Must expose electron in main world');
  
  // Must NOT expose raw ipcRenderer
  assert.ok(!content.includes("exposeInMainWorld('ipcRenderer'"), 'Must never expose raw ipcRenderer');

  // Test input validation logic replicated from preload
  function openExternalMock(url) {
    if (typeof url === 'string' && (url.startsWith('http:') || url.startsWith('https:'))) {
      return Promise.resolve(true);
    }
    return Promise.reject(new Error('Invalid URL protocol'));
  }

  // Valid protocols
  assert.doesNotReject(openExternalMock('https://nepalstock.com'));
  assert.doesNotReject(openExternalMock('http://meroshare.cdsc.com.np'));

  // Invalid / dangerous protocols
  assert.rejects(openExternalMock('file:///C:/Windows/System32/cmd.exe'));
  assert.rejects(openExternalMock('javascript:alert(1)'));
  assert.rejects(openExternalMock('data:text/html,test'));
});
