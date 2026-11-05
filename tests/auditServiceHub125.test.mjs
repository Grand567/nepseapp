// tests/auditServiceHub125.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Comprehensive Audit of 125 Services, Sub-Tabs, Cards, and Sub-File Wiring', async (t) => {
  const servicesHubPath = path.resolve('src/components/ServicesHub.tsx');
  assert.ok(fs.existsSync(servicesHubPath), 'ServicesHub.tsx must exist');

  const content = fs.readFileSync(servicesHubPath, 'utf8');

  // 1. Verify ALL_SERVICES definition
  await t.test('1. ALL_SERVICES Registry Audit', () => {
    const allServicesMatch = content.match(/const ALL_SERVICES:\s*ServiceDef\[\]\s*=\s*\[([\s\S]*?)\n\];/);
    assert.ok(allServicesMatch, 'ALL_SERVICES must be defined');

    const serviceBlocks = allServicesMatch[1].split(/\{\s*id:/).filter(Boolean);
    const serviceIds = [];
    for (const block of serviceBlocks) {
      const idMatch = block.match(/^\s*['"]([^'"]+)['"]/);
      if (idMatch) serviceIds.push(idMatch[1]);
    }

    console.log(`[Audit] Total Services in ALL_SERVICES: ${serviceIds.length}`);
    assert.strictEqual(serviceIds.length, 125, `Expected exactly 125 services in registry, found ${serviceIds.length}`);

    // Verify key flagship services exist
    const essentialKeys = [
      'broker-smart-flow',
      'short-term-profit-plan',
      'entry-exit-analyzer',
      'stock-momentum',
      'decision-probability',
      'minervini-leaderboard',
      'multibagger-hunter',
      'master-100-profit',
      'broker-top10',
      'market-depth',
      'fibonacci-levels',
      'graham-intrinsic',
      'calculator'
    ];

    for (const key of essentialKeys) {
      assert.ok(serviceIds.includes(key), `Essential service '${key}' must be in ALL_SERVICES`);
    }
  });

  // 2. Verify SERVICE_COMPONENTS mappings
  await t.test('2. SERVICE_COMPONENTS Mapping & Handler Audit', () => {
    const compMatch = content.match(/const SERVICE_COMPONENTS:\s*Record<string,\s*ComponentType>\s*=\s*\{([\s\S]*?)\n\};/);
    assert.ok(compMatch, 'SERVICE_COMPONENTS must be defined');

    // Extract all mapped keys in SERVICE_COMPONENTS
    const mappedKeys = Array.from(compMatch[1].matchAll(/['"]([^'"]+)['"]\s*:/g)).map(m => m[1]);
    console.log(`[Audit] Total Mapped Component Handlers in SERVICE_COMPONENTS: ${mappedKeys.length}`);
    assert.ok(mappedKeys.length >= 70, `Expected >= 70 mapped components in SERVICE_COMPONENTS, found ${mappedKeys.length}`);

    // Verify modal renderer logic exists
    assert.ok(content.includes('SERVICE_COMPONENTS[s.id]'), 'Modal renderer must check SERVICE_COMPONENTS[s.id]');
  });

  // 3. Verify Sub-Files Fast-Path Integration in ServicesHub
  await t.test('3. Sub-Files Fast Path & Date Selector Integration', () => {
    assert.ok(content.includes('/api/ledger/subfiles/index'), 'Must fetch available trading sessions from subfiles index');
    assert.ok(content.includes('/api/ledger/subfiles/date/'), 'Must fetch dedicated subfile for selectedSessionDate');
    assert.ok(content.includes('setDateSubfile(subfile)'), 'Must store active subfile in dateSubfile state');
    assert.ok(content.includes('card_1_quote'), 'Must map card_1_quote from subfile');
    assert.ok(content.includes('card_2_pivot_points'), 'Must map card_2_pivot_points from subfile');
    assert.ok(content.includes('card_3_oscillators_risk'), 'Must map card_3_oscillators_risk from subfile');
    assert.ok(content.includes('card_4_broker_smart_flow'), 'Must map card_4_broker_smart_flow from subfile');
    assert.ok(content.includes('card_5_wyckoff_and_dump_guard'), 'Must map card_5_wyckoff_and_dump_guard from subfile');
    assert.ok(content.includes('card_6_tactical_execution'), 'Must map card_6_tactical_execution from subfile');
  });

  // 4. Verify StockInformationHubModal 5-Session Switcher & 6 Cards
  await t.test('4. StockInformationHubModal 5-Session Switcher & 6-Card Audit', () => {
    const hubPath = path.resolve('src/components/StockInformationHubModal.tsx');
    assert.ok(fs.existsSync(hubPath), 'StockInformationHubModal.tsx must exist');
    const hubContent = fs.readFileSync(hubPath, 'utf8');

    // 5-Session switcher
    assert.ok(hubContent.includes('5-Session Ledger Switcher'), 'Must contain 5-Session Ledger Switcher');
    assert.ok(hubContent.includes('T-0 Live (Forming)'), 'Must contain T-0 Live (Forming) button');
    assert.ok(hubContent.includes('[1, 2, 3, 4].map'), 'Must dynamically map Days 1 to 4');

    // Card 1 Quote & Interpretation
    assert.ok(hubContent.includes('Card 1: Session Quote &amp; Price Action'), 'Must render Card 1');
    assert.ok(hubContent.includes('activeQuote?.interpretation'), 'Must display Card 1 interpretation');

    // Card 2 Pivots & Camarilla Breakout
    assert.ok(hubContent.includes('Classical Floor &amp; Camarilla Pivot Points'), 'Must render Card 2');
    assert.ok(hubContent.includes('activePivots?.interpretation'), 'Must display Card 2 interpretation');
    assert.ok(hubContent.includes('Camarilla H4'), 'Must display Camarilla breakout levels');

    // Card 3 Oscillators & ATR-14 Volatility
    assert.ok(hubContent.includes('Card 3: ATR-14 Volatility Risk'), 'Must render Card 3');
    assert.ok(hubContent.includes('activeOscillators?.interpretation'), 'Must display Card 3 interpretation');
    assert.ok(hubContent.includes('min_stop_loss_distance'), 'Must display safe stop distance');

    // Card 4 Broker Smart Flow & BCR3
    assert.ok(hubContent.includes('Card 4: Sub-File Broker Smart Flow'), 'Must render Card 4');
    assert.ok(hubContent.includes('activeSmartMoney?.interpretation'), 'Must display Card 4 interpretation');
    assert.ok(hubContent.includes('bcr3_buy_pct'), 'Must display BCR3 buy concentration');

    // Card 5 Wyckoff & Dump Guard Trap Audit
    assert.ok(hubContent.includes('Card 5: Wyckoff &amp; Dump Guard'), 'Must render Card 5');
    assert.ok(hubContent.includes('activeWyckoff?.interpretation'), 'Must display Card 5 interpretation');
    assert.ok(hubContent.includes('is_trap'), 'Must check is_trap status');

    // Card 6 Tactical Execution Plan
    assert.ok(hubContent.includes('Card 6: Tactical Execution Plan'), 'Must render Card 6');
    assert.ok(hubContent.includes('activeTactical?.interpretation'), 'Must display Card 6 interpretation');
    assert.ok(hubContent.includes('limit_buy_min'), 'Must display Limit Buy Zone');
    assert.ok(hubContent.includes('hard_stop'), 'Must display Hard Stop Loss');
    assert.ok(hubContent.includes('target_1'), 'Must display Target 1');
    assert.ok(hubContent.includes('target_2'), 'Must display Target 2');

    // 4-Day Chronological Trajectory
    assert.ok(hubContent.includes('4-Day Chronological Trajectory (T-4 to T-1 Progression)'), 'Must render 4-day trajectory');
  });

  // 5. Verify Background Pre-Warming & EOD Rollover Workers
  await t.test('5. Background Pre-Warming & EOD Worker Audit', () => {
    const managerPath = path.resolve('src/utils/localLedgerManager.ts');
    const managerContent = fs.readFileSync(managerPath, 'utf8');
    assert.ok(managerContent.includes('export async function prewarmHistoricalSubfiles'), 'Must export prewarmHistoricalSubfiles');
    assert.ok(managerContent.includes('prewarmHistoricalSubfiles().catch'), 'Must invoke prewarmHistoricalSubfiles on init');

    const workersPath = path.resolve('proxy/workers.mjs');
    const workersContent = fs.readFileSync(workersPath, 'utf8');
    assert.ok(workersContent.includes('compileHistoricalSubfiles()'), 'Workers must call compileHistoricalSubfiles()');
    assert.ok(workersContent.includes('SUBFILES_ROTATED'), 'Workers must emit SUBFILES_ROTATED event');

    const serverPath = path.resolve('proxy/server.mjs');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    assert.ok(serverContent.includes('Content-Encoding\', \'gzip\''), 'Server must stream pre-compressed gzip directly');
    assert.ok(serverContent.includes('Cache-Control\', \'public, max-age=86400'), 'Server must set immutable cache for historical dates');
  });
});
