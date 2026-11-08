import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openExternalUrl } from '../src/utils/externalLinks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('BUG-084: External Link Handover & allowNavigation Confinement Verification', () => {
  it('capacitor.config.json confines allowNavigation strictly to core backend and auth hosts', () => {
    const configPath = path.resolve(__dirname, '../capacitor.config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    const allowed = config.server?.allowNavigation || [];
    assert.ok(Array.isArray(allowed), 'allowNavigation should be an array');

    // Forbidden domains that previously trapped users in the native WebView container
    const forbidden = [
      'nepalstock.com.np',
      'sharesansar.com',
      'nepalipaisa.com',
      'merolagani.com',
      'chukul.com',
      'allorigins.win',
      'corsproxy.io'
    ];

    for (const domain of forbidden) {
      assert.strictEqual(
        allowed.some(a => a.includes(domain)),
        false,
        `Domain ${domain} must NOT be in allowNavigation`
      );
    }

    // Required domains must be retained
    assert.ok(allowed.some(a => a.includes('nepseapp.onrender.com')), 'Must allow render proxy backend');
    assert.ok(allowed.some(a => a.includes('accounts.google.com')), 'Must allow google auth');
  });

  it('openExternalUrl uses _system target on native Capacitor platform', () => {
    let openedUrl = '';
    let openedTarget = '';

    global.window = {
      open: (url, target) => {
        openedUrl = url;
        openedTarget = target;
      },
      Capacitor: {
        isNativePlatform: () => true
      }
    };

    openExternalUrl('https://nepalstock.com.np/company/detail/NABIL');
    assert.strictEqual(openedUrl, 'https://nepalstock.com.np/company/detail/NABIL');
    assert.strictEqual(openedTarget, '_system', 'Must open in system browser via _system');

    delete global.window;
  });

  it('openExternalUrl uses standard window.open on web and Electron', () => {
    let openedUrl = '';
    let openedTarget = '';
    let openedFeatures = '';

    global.window = {
      open: (url, target, features) => {
        openedUrl = url;
        openedTarget = target;
        openedFeatures = features;
      }
    };

    openExternalUrl('https://sharesansar.com/news', '_blank');
    assert.strictEqual(openedUrl, 'https://sharesansar.com/news');
    assert.strictEqual(openedTarget, '_blank');
    assert.strictEqual(openedFeatures, 'noopener,noreferrer');

    delete global.window;
  });
});
