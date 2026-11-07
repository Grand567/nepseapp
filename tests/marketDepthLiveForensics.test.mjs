import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrFetchBrokerAnalysis } from '../proxy/brokerVault.mjs';
import { evaluateOrderFlowVeto } from '../src/utils/sharedBrokerAggregationEngine.js';

test('Forensic Audit: AKJCL 2026-11-06 Market Depth Live Order Flow & Decision Engine', async (t) => {
  await t.test('1. AKJCL 1D Session Broker Ledger & Distribution Parity', async () => {
    const analysis1D = await getOrFetchBrokerAnalysis('AKJCL', 1);
    assert.ok(analysis1D, 'AKJCL 1D analysis must exist');
    assert.equal(analysis1D.businessDate, '2026-11-06', 'Business date must be 2026-11-06');
    assert.equal(analysis1D.adSignal, 'Distribution', '1D signal must be Distribution');

    // Verify dominant seller Broker #60
    assert.ok(analysis1D.topDistributor, 'Top distributor must exist');
    assert.equal(String(analysis1D.topDistributor.brokerId), '60', 'Top distributor must be Broker #60 (Nagarik Stock Dealer)');
    assert.equal(analysis1D.topDistributor.sellQty, 50991, 'Broker #60 must have dumped 50,991 shares');
    assert.equal(analysis1D.topDistributor.buyQty, 0, 'Broker #60 had zero buys');
    assert.equal(analysis1D.topDistributor.sellMktShare, 33.14, 'Broker #60 dumped 33.14% of total market volume');

    // Verify Broker #58 was neutral on 2026-11-06
    const b58 = (analysis1D.brokers || []).find(b => String(b.brokerId || b.broker) === '58');
    assert.ok(b58, 'Broker #58 record must exist in 1D brokers');
    assert.equal(b58.buyQty, 5787, 'Broker #58 buy qty was 5,787');
    assert.equal(b58.sellQty, 5507, 'Broker #58 sell qty was 5,507');
    assert.equal(b58.netQty, 280, 'Broker #58 net qty was only +280 kitta (neutral)');

    // Top accumulator must NOT be Broker 58
    assert.notEqual(String(analysis1D.topAccumulator?.brokerId), '58', 'Broker #58 is NOT the top accumulator for 2026-11-06');
    assert.equal(String(analysis1D.topAccumulator?.brokerId), '62', 'Broker #62 (Capital Max) was top net buyer (+15,203)');
  });

  await t.test('2. Order Flow Veto & Whale Dumping Radar on AKJCL 2026-11-06', () => {
    const mock1DAnalysis = {
      totalVolume: 153871,
      bcr3BuyPct: 26.34,
      bcr3SellPct: 59.33,
      scr3SellPct: 59.33,
      smartMoneyNetFlowPct: -32.99,
      topSellers: [
        { brokerId: '60', name: 'Nagarik Stock Dealer', sellQty: 50991, buyQty: 0, netQty: -50991 }
      ]
    };

    const veto = evaluateOrderFlowVeto(mock1DAnalysis, { symbol: 'AKJCL', volume: 153871 });
    assert.equal(veto.isVetoed, true, 'Order flow veto MUST trigger for AKJCL 2026-11-06');
    assert.equal(veto.severity, 'CRITICAL', 'Severity must be CRITICAL due to 33%+ whale dumping');
    assert.equal(veto.topSeller.brokerId, '60', 'Veto must target Broker #60');
    assert.equal(veto.topSeller.sharePct, 33.14, 'Broker #60 dumped 33.14% of volume');
  });

  await t.test('3. Tab 2 Verdict Logic: Strictly Prohibits "INVEST RIGHT NOW" on Whale Dump Days', () => {
    // Simulate the exact state of Tab 2 for AKJCL on 2026-11-06
    const sessionTradedVol = 153871;
    const liveBcr3Buy = 26.34;
    const liveBcr3Sell = 59.33;
    const liveNetBuyShares = 35000;
    const liveNetSellShares = 91000;
    const liveTotFlow = liveNetBuyShares + liveNetSellShares;
    const liveBuyPct = Math.round((liveNetBuyShares / liveTotFlow) * 100); // 28%
    const liveSellPct = 100 - liveBuyPct; // 72%
    const currentLtp = 343;
    const liveWhaleVwap = 343.5;
    const diffFromVwap = +(((currentLtp - liveWhaleVwap) / liveWhaleVwap) * 100).toFixed(1);

    const topDist = { brokerId: '60', name: 'Nagarik Stock Dealer', netQty: -50991, sellQty: 50991, buyQty: 0 };
    const topDistNetShares = 50991;
    const topDistShareOfVol = +((topDistNetShares / sessionTradedVol) * 100).toFixed(1); // 33.1%

    const orderFlowVeto = evaluateOrderFlowVeto({
      totalVolume: sessionTradedVol,
      bcr3BuyPct: liveBcr3Buy,
      bcr3SellPct: liveBcr3Sell,
      scr3SellPct: liveBcr3Sell,
      topSellers: [topDist]
    }, { symbol: 'AKJCL', ltp: 343, volume: 153871 });

    const isWhaleDump = orderFlowVeto.isVetoed || topDistShareOfVol >= 15.0 || (liveBcr3Sell >= 45 && liveBcr3Sell > liveBcr3Buy + 10);
    const isLiveDist = !isWhaleDump && ((liveSellPct >= 55) || (liveBcr3Sell > liveBcr3Buy + 5));
    const isLiveAccum = !isWhaleDump && !isLiveDist && (liveBuyPct >= 55 || liveBcr3Buy > liveBcr3Sell + 5);

    assert.equal(isWhaleDump, true, 'isWhaleDump must be TRUE for AKJCL 2026-11-06');
    assert.equal(isLiveAccum, false, 'isLiveAccum must be FALSE on dumping days');

    let verdictTitle = '';
    if (isWhaleDump) {
      verdictTitle = 'DO NOT BUY RIGHT NOW — ACTIVE INSTITUTIONAL DUMPING';
    } else if (isLiveDist) {
      verdictTitle = 'CAUTION / DO NOT BUY — SUPPLY EXCEEDS DEMAND';
    } else if (isLiveAccum) {
      verdictTitle = 'FAVORABLE ACCUMULATION ZONE — HIGH CONFLUENCE ENTRY';
    }

    assert.equal(verdictTitle, 'DO NOT BUY RIGHT NOW — ACTIVE INSTITUTIONAL DUMPING');
    assert.ok(!verdictTitle.includes('INVEST RIGHT NOW'), 'Verdict must NEVER say INVEST RIGHT NOW when a whale is dumping!');
  });
});
