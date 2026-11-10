// tests/testStealthAccumulationAndBreakoutEnhanced.test.mjs
process.env.NODE_ENV = 'test';
process.env.SUPPRESS_TEST_ALERTS = 'true';

import assert from 'assert';
import { 
  getMultiDayBroker58Accumulation,
  scanEmaCrossoverAndSharpBase,
  detectBroker58EarlyIgnition
} from '../proxy/smartAlertEngine.mjs';
import {
  formatBroker58RadarHtml,
  formatBroker58SymbolAuditHtml,
  runBreakoutScannerAndDispatch,
  runBroker58RadarAndDispatch
} from '../proxy/telegramNotifier.mjs';
import { db } from '../proxy/db/ledgerStore.js';

console.log('▶ [SUITE] testStealthAccumulationAndBreakoutEnhanced.test.mjs\n');

let pass = 0;
let fail = 0;

const ok = (cond, msg) => {
  if (cond) {
    pass++;
    console.log(`  ✓ PASS: ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
};

(async () => {
  try {
    // -------------------------------------------------------------------------
    // TEST 1: Multi-Day Broker #58 Stealth Accumulation Query
    // -------------------------------------------------------------------------
    console.log('Test 1: Query multi-day stealth accumulation for GHL...');
    const ghlStealth = await getMultiDayBroker58Accumulation('GHL', { lookbackDays: 5, sessionDate: '2026-11-06' });
    
    ok(ghlStealth !== null, 'getMultiDayBroker58Accumulation returns valid object for GHL');
    ok(ghlStealth.symbol === 'GHL', 'Symbol matches GHL');
    ok(ghlStealth.activeDays >= 3, `GHL active across multiple sessions (got ${ghlStealth.activeDays} days)`);
    ok(ghlStealth.netBuyVol > 50000, `GHL multi-day net buy volume is substantial (got ${ghlStealth.netBuyVol} kitta)`);
    ok(ghlStealth.totalBuyAmtCr > 1.0, `GHL multi-day outlay exceeds 1 Cr (got ${ghlStealth.totalBuyAmtCr} Cr)`);
    ok(ghlStealth.windowBuyRatio >= 60.0, `GHL buy ratio reflects dominance (got ${ghlStealth.windowBuyRatio}%)`);
    ok(ghlStealth.windowVwap > 0, `Window VWAP is computed (got ${ghlStealth.windowVwap})`);
    ok(ghlStealth.ignitionHorizon.includes('1–3 Days') || ghlStealth.ignitionHorizon.includes('1-3'), `Ignition horizon is 1-3 days (got ${ghlStealth.ignitionHorizon})`);

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Day Stealth Radar Formatting (/b58)
    // -------------------------------------------------------------------------
    console.log('\nTest 2: Verifying /b58 HTML formatting includes multi-day stealth data & 1-3 day horizon...');
    const mockSetup = {
      symbol: 'GHL',
      ltp: 323,
      day_pchange: -0.5,
      buy_vol: 42562,
      net_vol: 27343,
      buy_ratio: 73.7,
      mkt_share: 17.9,
      operator_vwap: 331.3,
      // Enhanced multi-day fields:
      multiDayNetVol: 345947,
      multiDayBuyVol: 529543,
      multiDayBuyAmtCr: 17.54,
      multiDayBuyRatio: 74.3,
      multiDayMarketShare: 17.9,
      multiDayVwap: 331.3,
      multiDayActiveDays: 5,
      rangeCompressionPct: 10.4,
      baseLow: 310.7,
      baseHigh: 343.0,
      ignitionHorizon: '1–3 Days (Supply Vacuum Stage 2)'
    };

    const radarHtml = formatBroker58RadarHtml([mockSetup], '2026-11-06');
    ok(radarHtml.includes('Stealth'), 'Radar HTML header highlights Stealth Accumulation');
    ok(radarHtml.includes('1–3 Days') || radarHtml.includes('1-3'), 'Radar HTML mentions 1-3 days breakout ignition horizon');
    ok(radarHtml.includes('345,947') || radarHtml.includes('345947'), 'Radar HTML displays multi-day net kitta');
    ok(radarHtml.includes('17.54') || radarHtml.includes('17.5'), 'Radar HTML displays multi-day capital outlay in Cr');
    ok(radarHtml.includes('74.3%') || radarHtml.includes('74%'), 'Radar HTML displays multi-day buy ratio');

    // -------------------------------------------------------------------------
    // TEST 3: Single Symbol Audit Formatting (/b58 GHL)
    // -------------------------------------------------------------------------
    console.log('\nTest 3: Single symbol /b58 audit includes multi-day accumulation trajectory...');
    const auditHtml = formatBroker58SymbolAuditHtml({
      symbol: 'GHL',
      tradeDate: '2026-11-06',
      ltp: 323,
      dayChangePct: -0.5,
      buyVol: 42562,
      sellVol: 15219,
      netVol: 27343,
      buyAmt: 14000000,
      buyRatioPct: 73.7,
      marketSharePct: 17.9,
      operatorVwap: 331.3,
      companyName: 'Ghalemdi Hydro Limited',
      multiDayNetVol: 345947,
      multiDayBuyVol: 529543,
      multiDayBuyAmtCr: 17.54,
      multiDayBuyRatio: 74.3,
      multiDayMarketShare: 17.9,
      multiDayActiveDays: 5,
      ignitionHorizon: '1–3 Days (Poised for Markup)'
    });
    ok(auditHtml.includes('Multi-Day Stealth Footprint') || auditHtml.includes('5-Day Stealth Footprint') || auditHtml.includes('Multi-Day'), 'Audit includes multi-day stealth footprint section');
    ok(auditHtml.includes('1–3 Days') || auditHtml.includes('1-3'), 'Audit specifies 1-3 days breakout readiness');

    // -------------------------------------------------------------------------
    // TEST 4: 20 EMA Cross + Sharp Tight Accumulation Base Scanner (/breakout)
    // -------------------------------------------------------------------------
    console.log('\nTest 4: Scanning for 1-10 day 20 EMA cross with sharp consolidation base...');
    const emaBreakouts = await scanEmaCrossoverAndSharpBase({
      lookbackSessions: 10,
      maxSurgePct: 7.5,
      maxBaseRangePct: 9.0
    });

    ok(Array.isArray(emaBreakouts), 'scanEmaCrossoverAndSharpBase returns an array');
    ok(emaBreakouts.length > 0, `Found stocks crossing 20 EMA with sharp consolidation (got ${emaBreakouts.length})`);
    
    // Check properties of candidate
    const topEma = emaBreakouts[0];
    ok(topEma.symbol, `Top candidate has symbol (${topEma.symbol})`);
    ok(typeof topEma.ema20 === 'number', `Has numeric 20 EMA (${topEma.ema20})`);
    ok(topEma.daysSinceCross >= 0 && topEma.daysSinceCross <= 10, `Crossover happened within 0 to 10 days (${topEma.daysSinceCross} days ago)`);
    ok(topEma.distFromEmaPct <= 7.5 && topEma.distFromEmaPct >= -2.0, `Has not surged high (${topEma.distFromEmaPct}% from 20 EMA)`);
    ok(topEma.consolidationRangePct <= 9.0, `Base is tightly consolidated (${topEma.consolidationRangePct}% range)`);
    ok(topEma.rvolCross >= 1.2 || topEma.rvolToday >= 1.2 || topEma.todayVolume >= 15000, `Has volume expansion (${topEma.rvolCross}x cross RVOL)`);

    // -------------------------------------------------------------------------
    // TEST 5: Single Stock Breakout / 20 EMA Audit (/breakout SYMBOL)
    // -------------------------------------------------------------------------
    console.log('\nTest 5: Testing single stock breakout audit for CBBL / BPCL...');
    const cbblAudit = await scanEmaCrossoverAndSharpBase({ symbol: 'CBBL', sessionDate: '2026-11-06' });
    ok(Array.isArray(cbblAudit) && cbblAudit.length > 0, 'CBBL found in 20 EMA scan');
    const cbbl = cbblAudit[0];
    ok(cbbl.symbol === 'CBBL', 'Symbol is CBBL');
    ok(cbbl.daysSinceCross <= 5, `CBBL crossed 20 EMA recently (got ${cbbl.daysSinceCross} days ago)`);

    // -------------------------------------------------------------------------
    // TEST 6: Telegram /breakout Command Response Formatting
    // -------------------------------------------------------------------------
    console.log('\nTest 6: Testing runBreakoutScannerAndDispatch integration...');

    const breakoutRes = await runBreakoutScannerAndDispatch({ chatId: '12345' });
    ok(breakoutRes.success, 'runBreakoutScannerAndDispatch succeeded');
    const msgText = breakoutRes.message || '';
    ok(msgText.includes('20 EMA') || msgText.includes('BREAKOUT'), 'Telegram breakout message includes 20 EMA or Breakout details');
    ok(msgText.includes('Base') || msgText.includes('Ignition') || msgText.includes('Pivot'), 'Message highlights accumulation base / poised to ignite');

    // Test single symbol query e.g. /breakout CBBL
    const singleBreakoutRes = await runBreakoutScannerAndDispatch({ symbol: 'CBBL', chatId: '12345' });
    ok(singleBreakoutRes.success, 'runBreakoutScannerAndDispatch with symbol succeeded');
    const singleText = singleBreakoutRes.message || '';
    ok(singleText.includes('CBBL'), 'Message references CBBL');
    ok(singleText.includes('20 EMA') || singleText.includes('20-Period EMA'), 'Message includes 20 EMA audit');

    // Test non-qualifying single symbol query
    const nonQualRes = await runBreakoutScannerAndDispatch({ symbol: 'UNQUALIFIEDSYM', chatId: '12345' });
    ok(nonQualRes.success, 'Non-qualifying symbol returns successful handled response');
    ok(nonQualRes.message.includes('does not currently have an active 20 EMA crossover'), 'Provides clear diagnostic message rather than dumping radar');

    console.log(`\n======================================================`);
    console.log(` RESULTS: ${pass} PASSED, ${fail} FAILED`);
    console.log(`======================================================`);
    if (fail > 0) process.exit(1);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
})();
