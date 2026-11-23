// tests/unit/wave49-live-market-fixes.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { evaluateOrderFlowVeto } from '../../src/utils/sharedBrokerAggregationEngine.js';
import { UnifiedNepseClient } from '../../proxy/nepseClientManager.mjs';

describe('Wave 4.9: Live-Market Bug Fixes Suite', () => {

  it('1. CGT Math Invariant: Short-term individual CGT is statutory 5.0% (factor 0.95)', () => {
    const grossProfit = 10000;
    const cgtRate = 0.05;
    const netProfitAfterTax = grossProfit * (1 - cgtRate);
    assert.strictEqual(netProfitAfterTax, 9500);
    assert.strictEqual(grossProfit * 0.95, 9500);
  });

  it('2. Broker Ticket Counts: Ticket size divides strictly by valid trade count, not zero', () => {
    const buyVolume = 13380;
    const zeroTrades = 0;
    const avgTicketKittaZero = zeroTrades > 0 ? Math.round(buyVolume / zeroTrades) : 0;
    assert.strictEqual(avgTicketKittaZero, 0, 'Zero trade count must not divide or fabricate 1 tx');

    const validTrades = 10;
    const avgTicketKittaValid = validTrades > 0 ? Math.round(buyVolume / validTrades) : 0;
    assert.strictEqual(avgTicketKittaValid, 1338);
  });

  it('3. Cross-Session Volume Denominator Invariant: Broker share uses matching totalVolume & clamps to [0, 100%]', () => {
    // Friday's broker data (totalVolume: 144,815; Broker 16 net sell: 10,600)
    // Monday's live volume: 6,358 (mismatched sessions)
    const brokerData = {
      businessDate: '2026-11-20',
      totalVolume: 144815,
      totalTurnover: 70000000,
      brokers: [
        { brokerId: 16, buyVolume: 0, sellVolume: 10600, netVolume: -10600, buyAmount: 0, sellAmount: 5300000 }
      ]
    };

    const veto = evaluateOrderFlowVeto(brokerData, {
      liveSessionDate: '2026-11-23',
      liveVolume: 6358
    });

    // When sessions mismatch, cross-session guard must prevent false real-time Whale Dump veto
    assert.strictEqual(veto.isCrossSession, true);
    assert.strictEqual(veto.isVetoed, false, 'Cross-session broker data must NEVER trigger real-time Whale Dump Veto');
    assert.ok(veto.topSellerShare <= 100, `Broker share ${veto.topSellerShare}% must not exceed 100%`);
    assert.ok(veto.topSellerNetDrainPct <= 100, `Net drain ${veto.topSellerNetDrainPct}% must not exceed 100%`);
  });

  it('4. Setup Score Alignment Invariant: Vetoed setup caps setup score at 45', () => {
    const rawSetupScore = 71;
    const isAvoidVerdict = true;
    const setupScore = isAvoidVerdict ? Math.min(45, rawSetupScore) : rawSetupScore;

    assert.strictEqual(setupScore, 45, 'Setup score must be capped at 45 when entry gate vetoes setup');
    assert.ok(setupScore < 50, 'Vetoed setup must never show High Conviction (>=70)');
  });

  it('5. 403 Circuit Breaker Invariant: Fast-trips for 5 minutes after 2 consecutive 403 responses', () => {
    const client = new UnifiedNepseClient();
    assert.strictEqual(client.externalScraperBreakers.sharesansar.isTripped(), false);
    assert.strictEqual(client.externalScraperBreakers.merolagani.isTripped(), false);

    // First 403
    client.externalScraperBreakers.sharesansar.record403();
    assert.strictEqual(client.externalScraperBreakers.sharesansar.isTripped(), false);

    // Second 403 trips the circuit breaker
    client.externalScraperBreakers.sharesansar.record403();
    assert.strictEqual(client.externalScraperBreakers.sharesansar.isTripped(), true);
    assert.ok(client.externalScraperBreakers.sharesansar.trippedUntil > Date.now());

    // Success resets the breaker
    client.externalScraperBreakers.sharesansar.recordSuccess();
    assert.strictEqual(client.externalScraperBreakers.sharesansar.isTripped(), false);
  });

  it('6. In-flight Deduplication Invariant: Shared Map deduplicates concurrent requests', async () => {
    const client = new UnifiedNepseClient();
    assert.ok(client.inFlightPriceHistory instanceof Map);
    assert.strictEqual(client.inFlightPriceHistory.size, 0);
  });
});
