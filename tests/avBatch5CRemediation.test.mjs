import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 1. BUG-009: Sector Champions Liquidity Floor & Order Flow Veto Text
test('BUG-009: Sector Accumulation Champions require liquidity floor and StockDetailModal does not falsely attribute general avoid to order flow veto', async () => {
  const { calculateSectorAccumulationChampions } = await import('../src/utils/accumulationDistributionEngine.ts');
  
  // Stock with micro volume (277 shares, 50k turnover) should be disqualified from sector champion
  const microVolumeStock = {
    symbol: 'MICRO',
    name: 'Micro Liquidity Stock',
    sector: 'Commercial Banks',
    ltp: 200,
    volume: 277,
    turnover: 55400,
    bcr3Buy: 80,
    wyckoff: { cmf: 0.25 }
  };
  const normalStock = {
    symbol: 'NABIL',
    name: 'Nabil Bank',
    sector: 'Commercial Banks',
    ltp: 500,
    volume: 15000,
    turnover: 7500000,
    bcr3Buy: 45,
    wyckoff: { cmf: 0.08 }
  };

  const champions = calculateSectorAccumulationChampions([microVolumeStock, normalStock]);
  const bankChamp = champions.find(c => c.sector === 'Commercial Banks');
  assert.ok(bankChamp, 'Should find bank champion');
  assert.equal(bankChamp.symbol, 'NABIL', 'Normal liquid stock should be champion, not micro volume stock');

  // Verify in StockDetailModal that isVetoed does not claim Order Flow Veto unless orderFlowVeto?.isVetoed is true
  const modalSrc = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  assert.ok(!modalSrc.includes("isVetoed ? `Order Flow Veto Law Active"), 'Should not attribute general modalIsAvoid to Order Flow Veto');
});

// 2. BUG-015: Unify Stop-Loss, win-rate & RVOL '—' fallback
test('BUG-015: StockDetailModal unifies stop-loss and renders — for missing RVOL', () => {
  const modalSrc = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  // Stop-loss unification in overview
  assert.ok(modalSrc.includes('entryExitPlan?.levels?.stopLoss || horizonTargets?.stopLoss'), 'Overview should prioritize entryExitPlan stop-loss');
  // RVOL missing fallback should not be '1.00x'
  assert.ok(!modalSrc.includes(": '1.00x'"), "Should not fallback missing RVOL to '1.00x'");
});

// 3. BUG-016: Promoter Shares null -> Unverified & fundamentals.js fixed float format
test('BUG-016: Missing promoter data marked unverified and fundamentals.js formats median floats with fixed decimals', async () => {
  const modalSrc = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  // Should not default rawPromoterPct to 0 when null/undefined
  assert.ok(!modalSrc.includes('promoterPercentage = (rawPromoterPct !== undefined && rawPromoterPct !== null && !isNaN(Number(rawPromoterPct)))\n      ? Number(rawPromoterPct)\n      : 0'), 'promoterPercentage should distinguish null from 0');

  // In fundamentals.js, check reasons do not have unrounded median float interpolations
  const fundSrc = fs.readFileSync('src/utils/fundamentals.js', 'utf8');
  assert.ok(!fundSrc.includes('(${bench.medianPBV}x)'), 'fundamentals.js should format bench.medianPBV with toFixed');
  assert.ok(!fundSrc.includes('(${bench.medianPE}x)'), 'fundamentals.js should format bench.medianPE with toFixed');
});

// 4. BUG-080: BeginnerConfidenceCard uses buyCalc.costPerShare as buyWacc
test('BUG-080: BeginnerConfidenceCard passes statutory buy cost per share (WACC) to calculateSellDetails', () => {
  const modalSrc = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  // Look around calculateSellDetails in BeginnerConfidenceCard
  const beginnerSection = modalSrc.slice(modalSrc.indexOf('// Rupee Investment Simulator calculations'), modalSrc.indexOf('// Bottom Action Plan Banner'));
  assert.ok(beginnerSection.includes('buyCalc.costPerShare') || beginnerSection.includes('buyWacc'), 'Simulator must calculate sell details using WACC with buy-leg costs');
});

// 5. BUG-081: StockDetailModal removes fake 14.8% return, 10/9 Piotroski, 35% Public, 22x PE, relative API
test('BUG-081: Removes hardcoded 14.8% return, 10/9 Piotroski overflow, 35% Public, 22x peer PE, and prefixes API', () => {
  const modalSrc = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  assert.ok(!modalSrc.includes("'+14.8%'"), 'Must not have fake 14.8% 1Y return fallback');
  assert.ok(!modalSrc.includes("val: '35% Public'"), 'Must not have hardcoded 35% Public float');
  assert.ok(!modalSrc.includes("p.pe || 22"), 'Must not have peer P/E fallback to 22');
  assert.ok(!modalSrc.includes("fetch(`/api/stocks/${encodeURIComponent(sym)}/ledger-telemetry`"), 'Must prepend getProxyBase() to ledger telemetry fetch');
  assert.ok(!modalSrc.includes("`${piotroskiScore.score} / 9`"), 'Piotroski scorecard should use totalCriteria or clamp to 9');
});

// 6. BUG-082: Floorsheet Bulk Deal threshold is unified with floorsheetExport.js
test('BUG-082: Bulk deal filter thresholds are unified between StockDetailModal and floorsheetExport.js', () => {
  const modalSrc = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  const exportSrc = fs.readFileSync('src/utils/floorsheetExport.js', 'utf8');
  
  // Both should use the same canonical bulk thresholds (>= 500 kitta or >= Rs 250,000)
  assert.ok((modalSrc.includes('BULK_DEAL_MIN_QTY') || modalSrc.includes('500')) && (modalSrc.includes('BULK_DEAL_MIN_AMOUNT') || modalSrc.includes('250000')), 'StockDetailModal should use canonical bulk threshold');
  assert.ok(exportSrc.includes('500') && exportSrc.includes('250000'), 'floorsheetExport.js should use 500 / 250k bulk threshold');
  assert.ok(!exportSrc.includes('r.quantity || 0) >= 200 || Number(r.amount || 0) >= 100000'), 'floorsheetExport.js must not use contradictory 200 / 100k threshold');
});

// 7. BUG-083: StockBrokerAnalysisTab avoids / 420 synthetic trades and gross-as-net fallback
test('BUG-083: StockBrokerAnalysisTab eliminates / 420 trade estimation, gross buy fallback, and formats All-Time', () => {
  const tabSrc = fs.readFileSync('src/components/StockBrokerAnalysisTab.jsx', 'utf8');
  assert.ok(!tabSrc.includes('/ 420'), 'Must not estimate trade count using vol / 420');
  assert.ok(!tabSrc.includes('b.totalHeldQty || b.buyQty || 0'), 'Must not fall back to gross buyQty when net holding is requested');
  assert.ok(!tabSrc.includes('`${effectiveDays}D`') || tabSrc.includes("effectiveDays === 'all'"), 'Should handle effectiveDays === all properly');
});

// 8. BUG-084: BrokerSmartMoneyCard computes retentionRatePct and drops / 80 trades
test('BUG-084: BrokerSmartMoneyCard computes authentic retentionRatePct, removes / 80 trades, and resets cache on symbol change', () => {
  const cardSrc = fs.readFileSync('src/components/stock/BrokerSmartMoneyCard.tsx', 'utf8');
  assert.ok(!cardSrc.includes('/ 80'), 'Must not estimate trades using vol / 80');
  assert.ok(cardSrc.includes('retentionRatePct =') || cardSrc.includes('retentionRatePct:'), 'Must explicitly compute retentionRatePct on broker holder item');
  assert.ok(cardSrc.includes('setCached1DPayload(null)'), 'Must clear cached 1D payload on cleanSymbol change');
});

// 9. BUG-085: StockSeasonalityCard & StockInformationHubModal reconcile BS seasonality
test('BUG-085: Seasonality patterns are reconciled and card marks data as macro baseline when multi-year history unavailable', () => {
  const cardSrc = fs.readFileSync('src/components/StockSeasonalityCard.jsx', 'utf8');
  const hubSrc = fs.readFileSync('src/components/StockInformationHubModal.tsx', 'utf8');
  
  // Card should indicate NEPSE Macro Baseline when symbol history is absent
  assert.ok(cardSrc.includes('Macro Baseline') || cardSrc.includes('Market Baseline'), 'Seasonality card should indicate baseline rather than claiming 10-year stock distribution');
  // Poush should not be contradictory (+4.0% bullish in one vs -1.25% bearish in another)
  assert.ok(!hubSrc.includes('monthNp: "Poush (Dec–Jan)", regime: "Book-Closure & Q2 Interest Settlement", winRatePct: 62, avgReturnPct: 4.0, bias: "BULLISH"'), 'Hub modal Poush should not contradict canonical historical data');
});

// 10. BUG-086: StockInformationHubModal does not substitute target LTP for peer LTP and checks trading calendar
test('BUG-086: StockInformationHubModal does not substitute own LTP for missing peer LTP and uses trading calendar for market open', () => {
  const hubSrc = fs.readFileSync('src/components/StockInformationHubModal.tsx', 'utf8');
  assert.ok(!hubSrc.includes('(p.ltp ?? ltp).toLocaleString()'), 'Must not substitute main stock ltp when peer p.ltp is missing');
  assert.ok(!hubSrc.includes('const open = isMarketOpen();') || hubSrc.includes('nepseCalendar') || hubSrc.includes('getDay()'), 'isMarketOpen must check day of week/calendar, not only UTC minutes');
});

// 11. BUG-087: StockYanAnalyticsCard guards ltp > 0, requires >= 5 bars, and aligns header/body resistance state
test('BUG-087: StockYanAnalyticsCard handles < 5 bars, guards ltp > 0, and reconciles resistance title', () => {
  const yanSrc = fs.readFileSync('src/components/StockYanAnalyticsCard.jsx', 'utf8');
  assert.ok(!yanSrc.includes('+(p * 0.95)') && !yanSrc.includes('+(p * 1.05)'), 'Must not fabricate ±5% S/R when bars < 5');
  assert.ok(!yanSrc.includes('<div style={{ fontSize: 11, color: \'#f87171\', fontWeight: 700 }}>🔓 Breakable Resistance</div>'), 'Resistance box title must dynamically reflect resistance state rather than hardcoding Breakable Resistance');
});

// 12. BUG-088: StockDetailModal syncs calculator with [d?.symbol, d?.ltp] and removes 350 / Nov 6 defaults
test('BUG-088: StockDetailModal calculator synchronizes on ltp updates and removes static 350 / Nov 6 defaults', () => {
  const modalSrc = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  assert.ok(!modalSrc.includes("useState(String(d.ltp || 350))"), 'Must not have hardcoded 350 priceInput default');
  assert.ok(!modalSrc.includes(": 'Nov 6'"), "Must not have hardcoded 'Nov 6' fallback for settled date");
  assert.ok(modalSrc.includes('[d?.symbol, d?.ltp]'), 'Calculator sync useEffect must include d?.ltp in dependency array');
});

// 13. BUG-089: calculateTechnicalSpeedometer computes oscillators from history when precomputed fields missing
test('BUG-089: calculateTechnicalSpeedometer computes RSI, MACD, RVOL, etc. from history candles', async () => {
  const { calculateTechnicalSpeedometer } = await import('../src/utils/candlestickPatterns.js');
  
  // Stock without precomputed rsi/macd/adx/cci/rvol
  const bareStock = { symbol: 'NABIL', ltp: 500, pChange: 1.5 };
  // Generate 50 realistic candles
  const history = [];
  let price = 480;
  for (let i = 0; i < 50; i++) {
    price += (i % 2 === 0 ? 2 : -1);
    history.push({
      date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      open: price - 1,
      high: price + 3,
      low: price - 2,
      close: price,
      volume: 10000 + i * 200
    });
  }

  const result = calculateTechnicalSpeedometer(bareStock, history);
  assert.ok(result, 'Result should exist');
  assert.ok(result.oscItems, 'Oscillator items should exist');
  
  const rsiItem = result.oscItems.find(o => o.label.includes('RSI'));
  assert.ok(rsiItem, 'RSI item should exist');
  assert.notEqual(rsiItem.value, '—', 'RSI should be computed from history instead of being —');

  const macdItem = result.oscItems.find(o => o.label.includes('MACD'));
  assert.ok(macdItem, 'MACD item should exist');
  assert.notEqual(macdItem.value, '—', 'MACD should be computed from history instead of being —');
});
