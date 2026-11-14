import assert from 'node:assert';
import {
  runStockDeepAnalysisAndDispatch,
  formatUpgradedStealthAccumulationHtml,
  formatEodStealthOfTheDayHtml,
  formatEarlyIgnitionAlertHtml,
  formatBroker58SymbolAuditHtml,
  formatInstantExecutionTicketHtml
} from '../proxy/telegramNotifier.mjs';

async function runTest() {
  console.log('🧪 Starting Telegram /analyze Command and Broker Average Price Tests...');

  // 1. Test runStockDeepAnalysisAndDispatch with real symbol SHIVM
  const resShivm = await runStockDeepAnalysisAndDispatch('SHIVM', { chatId: null });
  assert.strictEqual(resShivm.success, true, 'SHIVM analysis should succeed');
  assert.ok(resShivm.message.includes('DEEP STOCK AUDIT: <code>$SHIVM</code>'), 'Should contain stock audit header');
  assert.ok(resShivm.message.includes('Average Broker Buy Price (Cost Basis)'), 'Should contain Average Broker Buy Price');
  assert.ok(resShivm.message.includes('INVESTMENT &amp; PROFITABILITY VERDICT'), 'Should contain Investment Verdict section');
  assert.ok(resShivm.message.includes('TACTICAL PROFIT PLAYBOOK'), 'Should contain Tactical Profit Playbook');
  assert.ok(resShivm.message.includes('Limit Buy Zone'), 'Should contain Limit Buy Zone');
  assert.ok(resShivm.message.includes('Invalidation Stop-Loss'), 'Should contain Stop-Loss');
  assert.ok(resShivm.message.includes('Target 1'), 'Should contain Target 1');
  assert.ok(resShivm.message.includes('1% RISK POSITION SIZING'), 'Should contain 1% Position Sizing');
  console.log('✅ SHIVM Deep Analysis validated successfully!');

  // 2. Test runStockDeepAnalysisAndDispatch with real symbol GHL
  const resGhl = await runStockDeepAnalysisAndDispatch('GHL', { chatId: null });
  assert.strictEqual(resGhl.success, true, 'GHL analysis should succeed');
  assert.ok(resGhl.message.includes('DEEP STOCK AUDIT: <code>$GHL</code>'), 'Should contain GHL header');
  assert.ok(resGhl.message.includes('Average Broker Buy Price (Cost Basis)'), 'Should contain Broker Average Price');
  assert.ok(resGhl.message.includes('APPROPRIATE TO INVEST'), 'GHL should qualify for appropriate investment');
  console.log('✅ GHL Deep Analysis validated successfully!');

  // 3. Test Part 1: formatUpgradedStealthAccumulationHtml has Average Broker Price
  const mockWinner = {
    symbol: 'SHIVM',
    name: 'Shivam Cements',
    ltp: 676,
    avgBrokerPrice: 686.8,
    bcr3Buy: 55,
    bcr3Sell: 20,
    leadBrokerId: '81',
    leadBrokerName: 'Aakashbhairab',
    score: 95
  };
  const upgradedHtml = formatUpgradedStealthAccumulationHtml(mockWinner);
  assert.ok(upgradedHtml.includes('Average Broker Price (Cost Basis)'), 'formatUpgradedStealthAccumulationHtml must include Average Broker Price');
  console.log('✅ formatUpgradedStealthAccumulationHtml includes Average Broker Price!');

  // 4. Test Part 1: formatEodStealthOfTheDayHtml has Average Broker Price
  const eodHtml = formatEodStealthOfTheDayHtml({
    symbol: 'GHL',
    ltp: 324,
    operator_vwap: 329.4,
    buy_vol: 280000,
    net_vol: 160000,
    buy_ratio: 80,
    mkt_share: 22
  });
  assert.ok(eodHtml.includes('Average Broker Price'), 'formatEodStealthOfTheDayHtml must include Average Broker Price');
  console.log('✅ formatEodStealthOfTheDayHtml includes Average Broker Price!');

  // 5. Test Part 1: formatEarlyIgnitionAlertHtml has Average Broker Buy Price
  const ignitionHtml = formatEarlyIgnitionAlertHtml({
    symbol: 'GHL',
    ltp: 324,
    operatorVwap: 329.4,
    buyQty: 50000,
    sellQty: 5000,
    brokerId: 58
  });
  assert.ok(ignitionHtml.includes('Average Broker Buy Price (Cost Basis)'), 'formatEarlyIgnitionAlertHtml must include Average Broker Buy Price');
  console.log('✅ formatEarlyIgnitionAlertHtml includes Average Broker Buy Price!');

  // 6. Test Part 1: formatBroker58SymbolAuditHtml has Average Broker Buy Price
  const b58Html = formatBroker58SymbolAuditHtml({
    symbol: 'GHL',
    ltp: 324,
    operatorVwap: 329.4,
    buyVol: 50000,
    sellVol: 5000,
    netVol: 45000,
    buyRatioPct: 90
  });
  assert.ok(b58Html.includes('Average Broker Buy Price (Cost Basis)'), 'formatBroker58SymbolAuditHtml must include Average Broker Buy Price');
  console.log('✅ formatBroker58SymbolAuditHtml includes Average Broker Buy Price!');

  // 7. Test Part 1: formatInstantExecutionTicketHtml has Average Broker Price
  const instantHtml = formatInstantExecutionTicketHtml({
    symbol: 'SHIVM',
    ltp: 676,
    vwap: 686.8
  });
  assert.ok(instantHtml.includes('Average Broker Price (Cost Basis)'), 'formatInstantExecutionTicketHtml must include Average Broker Price');
  console.log('✅ formatInstantExecutionTicketHtml includes Average Broker Price!');

  console.log('🎉 All Telegram /analyze and Broker Average Price tests passed 100%!');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
