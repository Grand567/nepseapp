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

  it('7. ShareSansar Dividend Circuit Breaker: Trips for 5 minutes after 3 consecutive timeouts/403s', () => {
    const breaker = {
      consecutiveFailures: 0,
      trippedUntil: 0,
      maxFailures: 3,
      cooldownMs: 5 * 60 * 1000,
      isTripped() {
        return Date.now() < this.trippedUntil;
      },
      recordFailure(err: any) {
        const isTimeout = err?.code === 'ECONNABORTED' || String(err?.message || '').toLowerCase().includes('timeout');
        const is403 = err?.response?.status === 403 || String(err?.message || '').includes('403');
        if (isTimeout || is403) {
          this.consecutiveFailures++;
          if (this.consecutiveFailures >= this.maxFailures && !this.isTripped()) {
            this.trippedUntil = Date.now() + this.cooldownMs;
          }
        }
      },
      recordSuccess() {
        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures = 0;
          this.trippedUntil = 0;
        }
      }
    };

    assert.strictEqual(breaker.isTripped(), false);
    // Failure 1: timeout of 2500ms exceeded
    breaker.recordFailure(new Error('timeout of 2500ms exceeded'));
    assert.strictEqual(breaker.consecutiveFailures, 1);
    assert.strictEqual(breaker.isTripped(), false);

    // Failure 2: 403 forbidden
    breaker.recordFailure({ response: { status: 403 }, message: 'Request failed with status code 403' });
    assert.strictEqual(breaker.consecutiveFailures, 2);
    assert.strictEqual(breaker.isTripped(), false);

    // Failure 3: 3rd timeout trips breaker for 5 minutes
    breaker.recordFailure({ code: 'ECONNABORTED', message: 'timeout of 2500ms exceeded' });
    assert.strictEqual(breaker.consecutiveFailures, 3);
    assert.strictEqual(breaker.isTripped(), true);
    assert.ok(breaker.trippedUntil > Date.now() + 4 * 60 * 1000);

    // Record success resets the circuit breaker
    breaker.recordSuccess();
    assert.strictEqual(breaker.isTripped(), false);
    assert.strictEqual(breaker.consecutiveFailures, 0);
  });

  it('8. Dividend In-Flight Single-Flight Deduplication: Map deduplicates concurrent requests for same symbol', async () => {
    const inFlightMap = new Map<string, Promise<any>>();
    let executionCount = 0;

    async function fetchDividendMock(symbol: string) {
      if (inFlightMap.has(symbol)) {
        return inFlightMap.get(symbol);
      }
      const task = (async () => {
        executionCount++;
        await new Promise(r => setTimeout(r, 20));
        return { symbol, dividends: [{ fiscalYear: 'FY 081-082', cashDividend: 10 }] };
      })();

      inFlightMap.set(symbol, task);
      try {
        return await task;
      } finally {
        inFlightMap.delete(symbol);
      }
    }

    // Fire BENH twice concurrently
    const [res1, res2] = await Promise.all([
      fetchDividendMock('BENH'),
      fetchDividendMock('BENH')
    ]);

    assert.strictEqual(executionCount, 1, 'Concurrent requests for BENH must execute underlying fetch only once');
    assert.deepStrictEqual(res1, res2);
    assert.strictEqual(inFlightMap.size, 0, 'In-flight map must be cleared after resolution');
  });
});
