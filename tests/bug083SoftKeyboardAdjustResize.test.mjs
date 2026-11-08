import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('BUG-083: Virtual Keyboard Resize Configuration Verification', () => {
  it('AndroidManifest.xml specifies windowSoftInputMode="adjustResize"', () => {
    const manifestPath = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');
    const content = fs.readFileSync(manifestPath, 'utf8');

    assert.ok(
      content.includes('android:windowSoftInputMode="adjustResize"'),
      'MainActivity must have android:windowSoftInputMode="adjustResize"'
    );
  });

  it('index.html viewport meta tag includes interactive-widget=resizes-content', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(
      content.includes('interactive-widget=resizes-content'),
      'Viewport meta tag must contain interactive-widget=resizes-content'
    );
  });
});
