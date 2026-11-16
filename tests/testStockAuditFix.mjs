import assert from 'node:assert';
import { runStockDeepAnalysisAndDispatch } from '../proxy/telegramNotifier.mjs';

async function testAuditFixes() {
  console.log('🧪 Testing Deep Stock Audit & Telegram Message Fixes...');

  // 1. Audit AKJCL (The problematic case: high churn, 51% upper wick, sellers net dumped -166k)
  const akjclRes = await runStockDeepAnalysisAndDispatch('AKJCL', { chatId: null });
  assert.strictEqual(akjclRes.success, true, 'AKJCL analysis should succeed');
  const akjclMsg = akjclRes.message;

  console.log('--- AKJCL Audit Message Snippet ---');
  console.log(akjclMsg.slice(0, 800));

  // A. Must NOT give a false HIGH CONVICTION APPROPRIATE TO INVEST verdict to AKJCL
  assert.ok(
    !akjclMsg.includes('APPROPRIATE TO INVEST (HIGH CONVICTION SWING ACCUMULATION)'),
    'AKJCL must NOT be marked HIGH CONVICTION SWING ACCUMULATION when suffering from 51% upper wick distribution and 78% churn'
  );

  // B. Must NOT claim 307,743 Kitta was "accumulated" without clarifying it is gross buy
  assert.ok(
    !akjclMsg.includes('accumulated 307,743 Kitta'),
    'Must not mislabel 307,743 gross buy kitta as accumulated kitta'
  );

  // C. Must distinguish net vs gross or show true net accumulation
  assert.ok(
    akjclMsg.includes('Net') || akjclMsg.includes('net'),
    'Must explicitly show net accumulation'
  );

  // D. Must NOT declare "Institutional float cornering (Supply Vacuum)" for AKJCL
  assert.ok(
    !akjclMsg.includes('Institutional float cornering in progress (Supply Vacuum)'),
    'AKJCL must NOT be marked as Supply Vacuum / Float Cornering when churn is 78% and sellers dumped 166k shares'
  );

  // E. Must include Multi-Timeframe VWAPs in Deep Stock Audit
  assert.ok(
    akjclMsg.includes('5D') && akjclMsg.includes('15D') && akjclMsg.includes('VWAP'),
    'Deep Stock Audit must include multi-timeframe VWAPs (5D, 15D, 1M)'
  );

  // F. TMS Execution guidance must NOT blindly recommend buying into the distribution wick
  assert.ok(
    !akjclMsg.includes('Place GTC Limit Buy inside zone. Do NOT chase pre-open') ||
    akjclMsg.includes('STAND ASIDE') ||
    akjclMsg.includes('wait for') ||
    akjclMsg.includes('Existing holders'),
    'TMS guidance must be protective when stock is under distribution pressure'
  );

  console.log('🎉 All AKJCL Stock Audit Fix checks passed successfully!');
}

testAuditFixes().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
