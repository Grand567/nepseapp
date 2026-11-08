import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('BUG-088: index.html defines comprehensive Content-Security-Policy meta tag', () => {
  const indexHtmlPath = path.join(ROOT, 'index.html');
  assert.ok(fs.existsSync(indexHtmlPath), 'index.html must exist');
  
  const content = fs.readFileSync(indexHtmlPath, 'utf8');
  assert.ok(content.includes('http-equiv="Content-Security-Policy"'), 'index.html must declare CSP meta tag');
  
  // Extract CSP content
  const match = content.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(match, 'CSP content attribute must be parsed');
  const csp = match[1];

  // Directives verification
  assert.ok(csp.includes("default-src 'self'"), "must include default-src 'self'");
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline' 'unsafe-eval'"), 'must allow bundled modules and math evaluation');
  assert.ok(csp.includes("https://fonts.googleapis.com"), 'must allow Google Fonts in style-src');
  assert.ok(csp.includes("https://fonts.gstatic.com"), 'must allow Google Fonts binaries in font-src');
  assert.ok(csp.includes("img-src 'self' data: blob:"), 'must allow local, data, and blob images');
  assert.ok(csp.includes("https://nepseapp.onrender.com"), 'must permit production proxy API and SSE alerts');
  assert.ok(csp.includes("http://localhost:*"), 'must permit local development and embedded proxy calls');
  assert.ok(csp.includes("https://*.firebaseio.com"), 'must permit Firebase real-time sync');
  assert.ok(csp.includes("https://api.allorigins.win"), 'must permit allorigins CORS proxy fallback');
  assert.ok(csp.includes("object-src 'none'"), 'must disallow plugins/objects');
});

test('BUG-088: electron/main.cjs maintains webSecurity: true', () => {
  const mainPath = path.join(ROOT, 'electron', 'main.cjs');
  const mainContent = fs.readFileSync(mainPath, 'utf8');
  assert.ok(mainContent.includes('webSecurity: true'), 'webSecurity must remain true');
});
