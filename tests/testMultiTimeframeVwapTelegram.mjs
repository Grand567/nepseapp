import assert from 'assert';
import Database from 'better-sqlite3';
import path from 'path';
import {
  computeMultiTimeframeVwap,
  formatInstantExecutionTicketHtml,
  formatUpgradedStealthAccumulationHtml,
  formatEarlyIgnitionAlertHtml,
  formatEodStealthOfTheDayHtml,
} from '../proxy/telegramNotifier.mjs';

console.log('🧪 Starting Automated Suite: Multi-Timeframe VWAP & Flowchart v2.0 Telegram Templates...\n');

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Test 1: computeMultiTimeframeVwap on verified targets
console.log('Test 1: Testing computeMultiTimeframeVwap on RFPL, AKJCL, and SHEL...');
{
  const rfplVwap = computeMultiTimeframeVwap('RFPL', db);
  assert.ok(rfplVwap.vwap5D > 350, 'RFPL 5D VWAP should be > 350');
  assert.ok(rfplVwap.vwap15D > 350, 'RFPL 15D VWAP should be > 350');
  assert.ok(rfplVwap.vwap1M > 350, 'RFPL 1M VWAP should be > 350');

  const akjclVwap = computeMultiTimeframeVwap('AKJCL', db);
  assert.ok(akjclVwap.vwap5D > 300, 'AKJCL 5D VWAP should be > 300');
  assert.ok(akjclVwap.vwap15D > 300, 'AKJCL 15D VWAP should be > 300');

  // Case insensitivity test
  const lowerCaseVwap = computeMultiTimeframeVwap('shel', db);
  assert.strictEqual(lowerCaseVwap.vwap5D, computeMultiTimeframeVwap('SHEL', db).vwap5D);

  console.log(`✅ Test 1 Passed: RFPL (5D: Rs. ${rfplVwap.vwap5D}, 15D: Rs. ${rfplVwap.vwap15D}, 1M: Rs. ${rfplVwap.vwap1M}), AKJCL (5D: Rs. ${akjclVwap.vwap5D}), SHEL verified.`);
}

// Test 2: formatInstantExecutionTicketHtml contains Multi-Timeframe VWAP & Actionable Ratchet
console.log('\nTest 2: Testing formatInstantExecutionTicketHtml generation & HTML entity validity...');
{
  const ticket = formatInstantExecutionTicketHtml({
    symbol: 'RFPL',
    ltp: 374.0,
    vwap: 376.8,
    limitPrice: 374.0,
    chaseCap: 380.7,
    stopLoss: 354.0,
    target1: 410.0,
    target2: 450.0,
    bcr3BuyPct: 40.5,
    bcr3SellPct: 27.7,
    freeFloatCorneredPct: 1.57,
    dominantBrokersText: 'Broker #58 (Naasa)',
    db
  });

  assert.ok(ticket.includes('MULTI-TIMEFRAME VWAP'), 'Ticket must display Multi-Timeframe VWAP header');
  assert.ok(ticket.includes('5-Day:'), 'Ticket must display 5-Day VWAP');
  assert.ok(ticket.includes('15-Day:'), 'Ticket must display 15-Day VWAP');
  assert.ok(ticket.includes('1-Month (22D):'), 'Ticket must display 1-Month VWAP');
  assert.ok(ticket.includes('WHAT YOU DO IN TMS:'), 'Ticket must display step-by-step TMS action for ratchet');
  assert.ok(ticket.includes('Cancel old SL'), 'Ticket must guide canceling old SL');
  assert.ok(ticket.includes('Free-Float Cornered %:'), 'Ticket must display free-float cornered percentage');

  // Verify no unescaped raw '< ' or '<='
  assert.ok(!ticket.match(/<\s+\d/), 'Ticket must not contain raw unescaped < followed by numbers');
  console.log('✅ Test 2 Passed: Instant Execution Ticket rendered with multi-timeframe VWAP and clean HTML.');
}

// Test 3: formatUpgradedStealthAccumulationHtml
console.log('\nTest 3: Testing formatUpgradedStealthAccumulationHtml with Multi-Timeframe VWAP...');
{
  const primeAlert = formatUpgradedStealthAccumulationHtml({
    symbol: 'RFPL',
    name: 'River Falls Power',
    ltp: 374.0,
    freeFloatCorneredPct: 1.57,
    db
  });

  assert.ok(primeAlert.includes('Multi-Timeframe VWAP'), 'Prime alert must display Multi-Timeframe VWAP');
  assert.ok(primeAlert.includes('WHAT YOU DO IN TMS:'), 'Prime alert must display clear TMS ratchet action');
  assert.ok(primeAlert.includes('Free-Float Cornered:'), 'Prime alert must display float cornering');
  assert.ok(!primeAlert.includes('<= 14.0%'), 'Prime alert must escape <= to &lt;=');
  assert.ok(primeAlert.includes('&lt;= 14.0%'), 'Prime alert must contain &lt;= 14.0%');
  console.log('✅ Test 3 Passed: Prime Pick alert rendered safely with multi-timeframe VWAP.');
}

// Test 4: Defensive empty input handling
console.log('\nTest 4: Testing defensive handling on empty / missing objects...');
{
  const emptyTicket = formatInstantExecutionTicketHtml();
  assert.ok(emptyTicket.includes('STOCK'), 'Empty ticket must safely default to STOCK');

  const emptyStealth = formatUpgradedStealthAccumulationHtml();
  assert.ok(emptyStealth.includes('STOCK'), 'Empty stealth must safely default to STOCK');

  const emptyEarly = formatEarlyIgnitionAlertHtml();
  assert.ok(emptyEarly.includes('STOCK'), 'Empty early ignition must safely default to STOCK');

  const emptyEod = formatEodStealthOfTheDayHtml();
  assert.ok(emptyEod.includes('Zero stocks met the strict 5-Gate'), 'Empty EOD must display safe fallback');

  console.log('✅ Test 4 Passed: All formatting functions gracefully handle empty/undefined parameters without throwing.');
}

console.log('\n🎉 All 4/4 Verification Tests Passed for Multi-Timeframe VWAP & Flowchart v2.0 Telegram Templates!');
try { db.close(); } catch (_) {}
