import assert from 'assert';
import { auditAntiDematDumpGuard, db } from '../proxy/db/ledgerStore.js';
import {
  formatInstantExecutionTicketHtml,
  sendTelegramExecutableBuyTrigger,
  auditMultiSessionTrapRisk
} from '../proxy/telegramNotifier.mjs';
import { evaluateStockAlertConditions } from '../proxy/smartAlertEngine.mjs';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎯 OPTION 1: 10-SECOND SNIPER INSTANT BUY TRIGGER TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Test 1: DORDI Anti-Demat Dump Guard Test
console.log('Test 1: Testing DORDI (2026-11-04) against Anti-Demat Dump Guard...');
const dordiAudit = auditAntiDematDumpGuard('DORDI');
console.log('DORDI Audit Result:', dordiAudit);

assert.strictEqual(dordiAudit.isTrap, true, 'DORDI must be flagged as a Demat Dump Trap');
assert.strictEqual(dordiAudit.code, 'VETO_PAST_ACCUMULATOR_DUMPING');
assert.strictEqual(dordiAudit.dumpingBroker, 84, 'Broker #84 must be identified as the dumper');
assert.strictEqual(dordiAudit.soldToday, 19806, 'DORDI sold kitta must match 19,806');
console.log('✅ Test 1 Passed: DORDI was successfully caught and VETOED (Broker #84 dumped 19,806 kitta).\n');

// Test 2: AKJCL Anti-Demat Dump Guard Test
console.log('Test 2: Testing AKJCL (2026-11-04) against Anti-Demat Dump Guard...');
const akjclAudit = auditAntiDematDumpGuard('AKJCL');
console.log('AKJCL Audit Result:', akjclAudit);

assert.strictEqual(akjclAudit.isTrap, true, 'AKJCL must be flagged as a Demat Dump Trap');
assert.strictEqual(akjclAudit.code, 'VETO_PAST_ACCUMULATOR_DUMPING');
console.log(`✅ Test 2 Passed: AKJCL was successfully caught and VETOED (Broker #${akjclAudit.dumpingBroker} dumped ${akjclAudit.soldToday} kitta).\n`);

// Test 3: Multi-Session Trap Risk in Telegram Notifier
console.log('Test 3: Testing auditMultiSessionTrapRisk integration in Telegram Notifier...');
const trapAudit = auditMultiSessionTrapRisk(db, 'DORDI');
console.log('Telegram Trap Audit for DORDI:', trapAudit);
assert.strictEqual(trapAudit.isTrap, true, 'Telegram Notifier must veto DORDI');
console.log('✅ Test 3 Passed: Telegram auditMultiSessionTrapRisk vetoes DORDI with full justification.\n');

// Test 4: Format Instant Execution Ticket (Option 1 Sniper)
console.log('Test 4: Testing formatInstantExecutionTicketHtml for Clean Setup...');
const cleanTicketData = {
  symbol: 'KBL',
  ltp: 214.0,
  vwap: 213.8,
  limitPrice: 214.0,
  chaseCap: 215.5,
  stopLoss: 204.0,
  slPct: 4.7,
  target1: 232.0,
  t1Pct: 8.4,
  target2: 248.0,
  t2Pct: 15.9,
  netRRR: 3.4,
  bcr3BuyPct: 82,
  dominantBrokersText: 'Broker #45 & Broker #58'
};

const ticketHtml = formatInstantExecutionTicketHtml(cleanTicketData);
console.log('Preview of Generated 10-Second Sniper Ticket:\n───────────────────────────────────────────────────────────────────');
console.log(ticketHtml);
console.log('───────────────────────────────────────────────────────────────────');

assert(ticketHtml.includes('[INSTANT BUY TRIGGER — 10-SEC SNIPER]'), 'Must have correct header');
assert(ticketHtml.includes('ORDER TYPE: LIMIT ORDER ONLY'), 'Must enforce Limit Order Only');
assert(ticketHtml.includes('LIMIT BUY PRICE:</b> <code>Rs. 214.0</code>'), 'Must specify exact Limit Buy Price');
assert(ticketHtml.includes('HARD STOP-LOSS:</b> <code>Rs. 204.0</code>'), 'Must specify Hard Stop-Loss');
assert(ticketHtml.includes('Rs. 1 Lakh:</b> Buy <code>100</code> Kitta'), 'Must calculate 1 Lakh sizing');
assert(ticketHtml.includes('Rs. 5 Lakh:</b> Buy <code>500</code> Kitta'), 'Must calculate 5 Lakh sizing');
assert(ticketHtml.includes('ORDER EXPIRY:</b> 10 Minutes Only'), 'Must include 10-minute validity limit');
console.log('✅ Test 4 Passed: 10-Second Sniper Execution Ticket formatted with absolute precision.\n');

// Test 5: Verify sendTelegramExecutableBuyTrigger blocks trap scrip
console.log('Test 5: Testing sendTelegramExecutableBuyTrigger auto-veto on DORDI...');
const dispatchResult = await sendTelegramExecutableBuyTrigger({
  symbol: 'DORDI',
  ltp: 285.0,
  vwap: 279.0
});
console.log('Dispatch Result for DORDI:', dispatchResult);
assert.strictEqual(dispatchResult.success, false, 'DORDI dispatch must fail');
assert.strictEqual(dispatchResult.isVetoed, true, 'DORDI must be marked isVetoed');
console.log('✅ Test 5 Passed: sendTelegramExecutableBuyTrigger blocked DORDI from being sent to Telegram!\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎉 ALL OPTION 1 EXECUTION TESTS PASSED (5/5)! ZERO-TRAP CONFIRMED!');
console.log('═══════════════════════════════════════════════════════════════════');
