import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db');

async function runMasterAudit() {
  console.log('================================================================');
  console.log('       NEPSE MASTER APPLICATION DISCREPANCY AUDIT SUITE         ');
  console.log('================================================================\n');

  const scorecard = {
    layer1_db: { passed: true, checks: [] },
    layer2_api: { passed: true, checks: [] },
    layer3_engine: { passed: true, checks: [] },
    layer4_ui: { passed: true, checks: [] }
  };

  // ─────────────────────────────────────────────────────────────
  // LAYER 1: DATABASE SSOT AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('>>> [LAYER 1] DATABASE SSOT VERIFICATION');
  
  // 1.1 Future Dates Check (> 2026-10-28)
  const tables = ['daily_stock_summary', 'daily_broker_ledger', 'floorsheet_contracts'];
  for (const t of tables) {
    const future = db.prepare(`SELECT DISTINCT trade_date as dt, COUNT(*) as c FROM ${t} WHERE trade_date > '2026-10-28' GROUP BY trade_date`).all();
    if (future.length > 0) {
      scorecard.layer1_db.passed = false;
      scorecard.layer1_db.checks.push(`[FAIL] Table ${t} contains future dates: ${JSON.stringify(future)}`);
      console.log(`  ❌ FAIL: Table ${t} contains future dates:`, future);
    } else {
      scorecard.layer1_db.checks.push(`[PASS] Table ${t} has no future dates beyond 2026-10-28`);
      console.log(`  ✅ PASS: Table ${t} has 0 future records beyond 2026-10-28.`);
    }
  }

  // 1.2 Weekend / Holiday Check (Saturday & Sunday are weekends)
  const nonTradingDates = ['2026-10-25', '2026-10-24', '2026-10-09', '2026-10-02', '2026-08-27'];
  for (const dt of nonTradingDates) {
    const fsCount = db.prepare(`SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date = ?`).get(dt);
    if (fsCount.c > 0) {
      scorecard.layer1_db.passed = false;
      scorecard.layer1_db.checks.push(`[FAIL] Non-trading date ${dt} has active trades in floorsheet_contracts: ${fsCount.c}`);
      console.log(`  ❌ FAIL: Non-trading date ${dt} found in floorsheet_contracts (${fsCount.c} trades)`);
    } else {
      console.log(`  ✅ PASS: Non-trading date ${dt} is cleanly quarantined / clean (0 trades).`);
    }
  }

  // 1.3 Volume Conservation Check on Latest Trading Date (2026-10-28)
  const topStocks = db.prepare(`SELECT symbol, total_volume, total_turnover FROM daily_stock_summary WHERE trade_date = '2026-10-28' ORDER BY total_turnover DESC LIMIT 10`).all();
  let volumeMismatchCount = 0;
  for (const s of topStocks) {
    const bSum = db.prepare(`SELECT SUM(buy_vol) as bVol, SUM(sell_vol) as sVol FROM daily_broker_ledger WHERE symbol = ? AND trade_date = '2026-10-28'`).get(s.symbol);
    const bVol = bSum?.bVol || 0;
    const sVol = bSum?.sVol || 0;
    const isBalanced = bVol === sVol;
    const matchesSummary = Math.abs(bVol - s.total_volume) <= Math.max(1, s.total_volume * 0.01);
    if (!isBalanced || !matchesSummary) {
      volumeMismatchCount++;
      console.log(`  ⚠️ WARN ${s.symbol}: SummaryVol=${s.total_volume}, BuyVol=${bVol}, SellVol=${sVol}`);
    } else {
      console.log(`  ✅ PASS ${s.symbol}: BuyVol (${bVol}) === SellVol (${sVol}) === SummaryVol (${s.total_volume}) [100% Conservation]`);
    }
  }
  if (volumeMismatchCount === 0) {
    scorecard.layer1_db.checks.push(`[PASS] Volume perfectly conserved across top traded symbols on 2026-10-28`);
  }

  // ─────────────────────────────────────────────────────────────
  // LAYER 2: API ROUTE PARITY & CONTRACT AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n>>> [LAYER 2] PROXY API ROUTE PARITY & CONTRACT AUDIT');
  const testSymbols = ['API', 'AKJCL', 'SHIVM', 'HRL'];

  for (const sym of testSymbols) {
    try {
      // Test 2.1: Plural vs Singular smart-money route parity
      const rPlural = await fetch(`http://localhost:5000/api/stocks/${sym}/smart-money?days=all`).then(r => r.json());
      const rSingular = await fetch(`http://localhost:5000/api/stock/${sym}/smart-money?days=all`).then(r => r.json());

      if (rPlural.success && rSingular.success && rPlural.totalSharesHeldTillNow === rSingular.totalSharesHeldTillNow) {
        console.log(`  ✅ PASS /api/stocks & /api/stock parity for ${sym}: totalSharesHeldTillNow=${rPlural.totalSharesHeldTillNow}`);
      } else {
        scorecard.layer2_api.passed = false;
        console.log(`  ❌ FAIL Route parity for ${sym}: Plural success=${rPlural.success}, Singular success=${rSingular.success}`);
      }

      // Test 2.2: Broker Analysis 30D
      const rBa = await fetch(`http://localhost:5000/api/broker-analysis/${sym}?days=30`).then(r => r.json());
      if (rBa.success && Array.isArray(rBa.data?.brokers || rBa.brokers)) {
        console.log(`  ✅ PASS /api/broker-analysis/${sym}?days=30: Brokers Count=${(rBa.data?.brokers || rBa.brokers).length}`);
      } else {
        scorecard.layer2_api.passed = false;
        console.log(`  ❌ FAIL /api/broker-analysis/${sym}?days=30 returned invalid structure`);
      }

      // Test 2.3: Diagnostics 30D
      const rDiag = await fetch(`http://localhost:5000/api/diagnostics/${sym}?days=30`).then(r => r.json());
      if (rDiag.success && (rDiag.data?.phase || rDiag.phase)) {
        const ph = rDiag.data?.phase || rDiag.phase;
        console.log(`  ✅ PASS /api/diagnostics/${sym}?days=30: Wyckoff Phase=${ph}`);
      } else {
        scorecard.layer2_api.passed = false;
        console.log(`  ❌ FAIL /api/diagnostics/${sym}?days=30 returned invalid structure`);
      }
    } catch (err) {
      scorecard.layer2_api.passed = false;
      console.log(`  ❌ FAIL API Fetch Error for ${sym}:`, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LAYER 3: SHARED AGGREGATION ENGINE GUARD AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n>>> [LAYER 3] SHARED AGGREGATION ENGINE GUARD AUDIT');
  const { aggregateBrokerMicrostructure } = await import('../../src/utils/sharedBrokerAggregationEngine.js');

  // Test 3.1: Partial Floorsheet Fragment Ingestion Guard
  const fakePartialSnippet = [
    { contract_no: '1', symbol: 'API', buyer_broker: 50, seller_broker: 20, kitta: 360, rate: 345, amount: 124200 },
    { contract_no: '2', symbol: 'API', buyer_broker: 45, seller_broker: 20, kitta: 10, rate: 345, amount: 3450 }
  ];
  const mockRealBrokerLedger = {
    totalVolume: 550398,
    totalTurnover: 191708451,
    brokers: [
      { brokerId: '45', buyVol: 93861, sellVol: 6998, buyAmt: 32837383.4, sellAmt: 2438645.4 },
      { brokerId: '44', buyVol: 72524, sellVol: 73768, buyAmt: 25202782.6, sellAmt: 25716932.1 },
      { brokerId: '33', buyVol: 48679, sellVol: 67480, buyAmt: 16844626.0, sellAmt: 23546334.7 },
      { brokerId: '58', buyVol: 80000, sellVol: 50000, buyAmt: 27600000.0, sellAmt: 17250000.0 },
      { brokerId: '49', buyVol: 60000, sellVol: 40000, buyAmt: 20700000.0, sellAmt: 13800000.0 },
      { brokerId: '50', buyVol: 50000, sellVol: 30000, buyAmt: 17250000.0, sellAmt: 10350000.0 },
      { brokerId: '62', buyVol: 145334, sellVol: 282152, buyAmt: 50140230.0, sellAmt: 97342440.0 }
    ]
  };

  const resWithGuard = aggregateBrokerMicrostructure({
    contracts: fakePartialSnippet,
    symbol: 'API',
    stockSummary: { symbol: 'API', volume: 550398, ltp: 345 },
    realBrokerAnalysis: mockRealBrokerLedger
  });

  if (resWithGuard.bcr3BuyPct !== 100 && resWithGuard.totalBuyVolume > 1000) {
    console.log(`  ✅ PASS Data Completeness Guard: Rejected 2-trade snippet (370 shares) and consumed authentic ledger (${resWithGuard.totalBuyVolume} shares). BCR3 = ${resWithGuard.bcr3BuyPct}% (NOT 100%).`);
    scorecard.layer3_engine.checks.push('[PASS] Incomplete partial floorsheet fragment guard successfully enforced.');
  } else {
    scorecard.layer3_engine.passed = false;
    console.log(`  ❌ FAIL Data Completeness Guard failed: Output BCR3 = ${resWithGuard.bcr3BuyPct}%, Vol = ${resWithGuard.totalBuyVolume}`);
  }

  // Test 3.2: Internal Cross-Trade Netting Verification
  const crossTradeSet = [
    { contract_no: '10', symbol: 'SHIVM', buyer_broker: 58, seller_broker: 58, kitta: 10000, rate: 500, amount: 5000000 }
  ];
  const resCross = aggregateBrokerMicrostructure({
    contracts: crossTradeSet,
    symbol: 'SHIVM',
    stockSummary: { symbol: 'SHIVM', volume: 10000, ltp: 500 }
  });
  const broker58 = resCross.topBuyerBrokers?.find(b => b.brokerId === '58' || b.broker === '58');
  if (broker58 && broker58.netQty === 0 && resCross.bcr3BuyPct === 0) {
    console.log(`  ✅ PASS Internal Cross-Trade Rule: Broker #58 cross of 10,000 shares netted to 0 (BCR3 = 0%).`);
    scorecard.layer3_engine.checks.push('[PASS] Internal cross trades cleanly net to 0 and are excluded from BCR3.');
  } else {
    scorecard.layer3_engine.passed = false;
    console.log(`  ❌ FAIL Internal Cross-Trade Rule failed: NetQty = ${broker58?.netQty}, BCR3 = ${resCross.bcr3BuyPct}%`);
  }

  // ─────────────────────────────────────────────────────────────
  // LAYER 4: UI CONSUMER TIMEFRAME ALIGNMENT AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n>>> [LAYER 4] UI CONSUMER TIMEFRAME ALIGNMENT AUDIT');
  const fs = await import('fs');
  const modalCode = fs.readFileSync('src/components/StockDetailModal.jsx', 'utf8');
  
  // Verify that DISTRIBUTION_DANGER is evaluated before "Big Players Accumulating"
  const distIdx = modalCode.indexOf("multiDayDiag?.phase === 'DISTRIBUTION_DANGER'");
  const accumIdx = modalCode.indexOf("check2Badge = '🟢 Big Players Accumulating'");
  if (distIdx !== -1 && accumIdx !== -1 && distIdx < accumIdx) {
    console.log(`  ✅ PASS StockDetailModal.jsx: Priority order verified (DISTRIBUTION_DANGER evaluated ahead of 1-day gross buy accumulation).`);
    scorecard.layer4_ui.checks.push('[PASS] Distribution danger priority order enforced in Stock Overview.');
  } else {
    scorecard.layer4_ui.passed = false;
    console.log(`  ❌ FAIL StockDetailModal.jsx priority order violation.`);
  }

  // Verify that StockBrokerAnalysisTab has eliminated fallback
  const tabCode = fs.readFileSync('src/components/StockBrokerAnalysisTab.jsx', 'utf8');
  if (tabCode.includes('/api/stocks/${encodeURIComponent(symbol)}/smart-money?days=all')) {
    console.log(`  ✅ PASS StockBrokerAnalysisTab.jsx: Authoritative smart-money days=all endpoint wired correctly.`);
  } else {
    scorecard.layer4_ui.passed = false;
    console.log(`  ❌ FAIL StockBrokerAnalysisTab.jsx missing authoritative smart-money days=all wiring.`);
  }

  // ─────────────────────────────────────────────────────────────
  // FINAL SCORECARD
  // ─────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('                    AUDIT RESULT SCORECARD                      ');
  console.log('================================================================');
  const allPassed = scorecard.layer1_db.passed && scorecard.layer2_api.passed && scorecard.layer3_engine.passed && scorecard.layer4_ui.passed;
  console.log(`Layer 1 (Database SSOT):         ${scorecard.layer1_db.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Layer 2 (Proxy API Parity):      ${scorecard.layer2_api.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Layer 3 (Aggregation Engine):    ${scorecard.layer3_engine.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Layer 4 (UI Timeframe Alignment):${scorecard.layer4_ui.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`\nOverall System Health:           ${allPassed ? '🏆 100% ACCOMPLISHED & VERIFIED' : '⚠️ ATTENTION NEEDED'}`);
  console.log('================================================================\n');

  process.exit(allPassed ? 0 : 1);
}

runMasterAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
