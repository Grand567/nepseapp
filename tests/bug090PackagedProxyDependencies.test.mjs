import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('BUG-090: electron-builder packages proxy node_modules and package.json into extraResources', () => {
  const builderConfigPath = path.join(ROOT, 'electron-builder.json');
  assert.ok(fs.existsSync(builderConfigPath), 'electron-builder.json must exist');
  
  const config = JSON.parse(fs.readFileSync(builderConfigPath, 'utf8'));
  assert.ok(Array.isArray(config.extraResources), 'extraResources must be an array');
  
  const proxyResource = config.extraResources.find(r => r.from === 'proxy' && r.to === 'proxy');
  assert.ok(proxyResource, 'extraResources must include proxy folder mapping');
  
  // Must NOT exclude node_modules
  const hasExclusion = proxyResource.filter.includes('!node_modules/**/*');
  assert.equal(hasExclusion, false, 'extraResources must not exclude node_modules from proxy');
  
  // Must include node_modules and package.json
  assert.ok(proxyResource.filter.includes('node_modules/**/*'), 'filter must include node_modules/**/*');
  assert.ok(proxyResource.filter.includes('package.json'), 'filter must include package.json');
});

test('BUG-090: proxy runtime dependencies are verified in proxy/node_modules', () => {
  const proxyDir = path.join(ROOT, 'proxy');
  const proxyPkgPath = path.join(proxyDir, 'package.json');
  assert.ok(fs.existsSync(proxyPkgPath), 'proxy/package.json must exist');
  
  const proxyPkg = JSON.parse(fs.readFileSync(proxyPkgPath, 'utf8'));
  const criticalDeps = ['express', 'cors', 'better-sqlite3', 'axios'];
  for (const dep of criticalDeps) {
    assert.ok(proxyPkg.dependencies[dep], `proxy/package.json must declare ${dep}`);
    const depDir = path.join(proxyDir, 'node_modules', dep);
    assert.ok(fs.existsSync(depDir), `proxy/node_modules must contain ${dep}`);
  }
});
