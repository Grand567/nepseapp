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
  assert.ok(resShivm.message.includes('Flowchart v2.0 Track'), 'SHIVM analysis must include Flowchart v2.0 Track');
  assert.ok(resShivm.message.includes('Net Spread:'), 'SHIVM analysis must include BCR3 Net Spread');
  assert.ok(resShivm.message.includes('5D Retention') && resShivm.message.includes('Churn'), 'SHIVM analysis must include 5D & 20D Retention/Churn audit');
  assert.ok(resShivm.message.includes('CLV') && resShivm.message.includes('Upper Wick'), 'SHIVM analysis must include CLV & Upper Wick microstructure');
  assert.ok(resShivm.message.includes('Early Impulse Ratchet'), 'SHIVM analysis must include Flowchart v2.0 Early Impulse Ratchet');
  console.log('✅ SHIVM Deep Analysis validated successfully!');

  // 2. Test runStockDeepAnalysisAndDispatch with real symbol GHL
  const resGhl = await runStockDeepAnalysisAndDispatch('GHL', { chatId: null });
  assert.strictEqual(resGhl.success, true, 'GHL analysis should succeed');
  assert.ok(resGhl.message.includes('DEEP STOCK AUDIT: <code>$GHL</code>'), 'Should contain GHL header');
  assert.ok(resGhl.message.includes('Average Broker Buy Price (Cost Basis)'), 'Should contain Broker Average Price');
  assert.ok(resGhl.message.includes('APPROPRIATE TO INVEST'), 'GHL should qualify for appropriate investment');
  assert.ok(resGhl.message.includes('Flowchart v2.0 Track'), 'GHL analysis must include Flowchart v2.0 Track');
  assert.ok(resGhl.message.includes('Early Impulse Ratchet'), 'GHL analysis must include Early Impulse Ratchet');
  console.log('✅ GHL Deep Analysis validated successfully!');

  // 3. Test Part 1: formatUpgradedStealthAccumulationHtml has Average Broker Price + BCR3 Spread + Wash-Churn + Track Tier
  const mockWinner = {
    symbol: 'SHIVM',
    name: 'Shivam Cements',
    ltp: 676,
    avgBrokerPrice: 686.8,
    bcr3Buy: 55,
    bcr3Sell: 20,
    retention10D: 84,
    rallyTrack: 'TRACK_B_T2_CLEARED_CONTINUATION',
    leadBrokerId: '81',
    leadBrokerName: 'Aakashbhairab',
    score: 95
  };
  const upgradedHtml = formatUpgradedStealthAccumulationHtml(mockWinner);
  assert.ok(upgradedHtml.includes('Average Broker Price (Cost Basis)'), 'formatUpgradedStealthAccumulationHtml must include Average Broker Price');
  assert.ok(upgradedHtml.includes('Net Spread:'), 'formatUpgradedStealthAccumulationHtml must include BCR3 Net Spread');
  assert.ok(upgradedHtml.includes('Wash-Churn Rate:'), 'formatUpgradedStealthAccumulationHtml must include Wash-Churn Rate');
  assert.ok(upgradedHtml.includes('70% Core Post-T+2 Entry'), 'formatUpgradedStealthAccumulationHtml must include Track allocation tier');
  console.log('✅ formatUpgradedStealthAccumulationHtml includes Flowchart v2.0 Track, BCR3 Spread, and Churn!');

  // 4. Test Part 1: formatEodStealthOfTheDayHtml has Average Broker Price + Track + BCR3 + Ratchet
  const eodHtml = formatEodStealthOfTheDayHtml({
    symbol: 'GHL',
    ltp: 324,
    operator_vwap: 329.4,
    buy_vol: 280000,
    net_vol: 160000,
    buy_ratio: 80,
    mkt_share: 22,
    bcr3Buy: 58.2,
    bcr3Sell: 21.4,
    rallyTrack: 'TRACK_A_COILED_2_3D_IGNITION'
  });
  assert.ok(eodHtml.includes('Average Broker Price'), 'formatEodStealthOfTheDayHtml must include Average Broker Price');
  assert.ok(eodHtml.includes('Rally Track:'), 'formatEodStealthOfTheDayHtml must include Rally Track');
  assert.ok(eodHtml.includes('BCR3 Buy'), 'formatEodStealthOfTheDayHtml must include BCR3 Buy vs Sell');
  assert.ok(eodHtml.includes('Early Impulse Ratchet'), 'formatEodStealthOfTheDayHtml must include Early Impulse Ratchet');
  console.log('✅ formatEodStealthOfTheDayHtml includes Track, BCR3, and Ratchet!');

  // 5. Test Part 1: formatEarlyIgnitionAlertHtml has Average Broker Buy Price + Track + BCR3 + Retention + Ratchet
  const ignitionHtml = formatEarlyIgnitionAlertHtml({
    symbol: 'GHL',
    ltp: 324,
    operatorVwap: 329.4,
    buyQty: 50000,
    sellQty: 5000,
    brokerId: 58,
    bcr3Buy: 61.5,
    bcr3Sell: 19.2,
    rallyTrack: 'TRACK_A_COILED_2_3D_IGNITION'
  });
  assert.ok(ignitionHtml.includes('Average Broker Buy Price (Cost Basis)'), 'formatEarlyIgnitionAlertHtml must include Average Broker Buy Price');
  assert.ok(ignitionHtml.includes('Rally Track:'), 'formatEarlyIgnitionAlertHtml must include Rally Track');
  assert.ok(ignitionHtml.includes('BCR3 Buy'), 'formatEarlyIgnitionAlertHtml must include BCR3 metrics');
  assert.ok(ignitionHtml.includes('Churn:'), 'formatEarlyIgnitionAlertHtml must include Retention / Churn');
  assert.ok(ignitionHtml.includes('Early Impulse Ratchet'), 'formatEarlyIgnitionAlertHtml must include Early Impulse Ratchet');
  console.log('✅ formatEarlyIgnitionAlertHtml includes Track, BCR3, Retention/Churn, and Ratchet!');

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

  // 7. Test Part 1: formatInstantExecutionTicketHtml has Average Broker Price + Track + BCR3 Spread + Ratchet
  const instantHtml = formatInstantExecutionTicketHtml({
    symbol: 'SHIVM',
    ltp: 676,
    vwap: 686.8,
    bcr3BuyPct: 68.5,
    bcr3SellPct: 24.0,
    rallyTrack: 'TRACK_B_T2_CLEARED_CONTINUATION'
  });
  assert.ok(instantHtml.includes('Average Broker Price (Cost Basis)'), 'formatInstantExecutionTicketHtml must include Average Broker Price');
  assert.ok(instantHtml.includes('Rally Track:'), 'formatInstantExecutionTicketHtml must include Rally Track');
  assert.ok(instantHtml.includes('BCR3 Buy'), 'formatInstantExecutionTicketHtml must include BCR3 Buy vs Sell');
  assert.ok(instantHtml.includes('Early Impulse Ratchet'), 'formatInstantExecutionTicketHtml must include Early Impulse Ratchet');
  console.log('✅ formatInstantExecutionTicketHtml includes Track, BCR3, and Ratchet!');

  console.log('🎉 All Telegram /analyze and Broker Average Price tests passed 100%!');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
