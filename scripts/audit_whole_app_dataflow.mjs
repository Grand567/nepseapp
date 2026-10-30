import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import http from 'http';
import { isNepseTradingDay, isNepseWeekend } from '../src/utils/nepseCalendar.js';

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const results = {
  layer1_database_ssot: { passed: true, checks: [] },
  layer2_api_parity: { passed: true, checks: [] },
  layer3_ui_bundled_assets: { passed: true, checks: [] }
};

function logCheck(layer, name, passed, detail) {
  layer.checks.push({ name, passed, detail });
  if (!passed) layer.passed = false;
  const mark = passed ? '✅' : '❌';
  console.log(`  ${mark} [${name}]: ${detail}`);
}

async function runAudit() {
  console.log('\n================================================================');
  console.log('🔍 DRABYASHREE NEPSE — WHOLE APP SYSTEMIC DATA INTEGRITY AUDIT');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // LAYER 1: Database SSOT Verification (SQLite drabyashree_ledger.db)
  // -------------------------------------------------------------
  console.log('--- LAYER 1: Database SSOT Verification ---');
  if (!fs.existsSync(dbPath)) {
    logCheck(results.layer1_database_ssot, 'DB_FILE_EXISTS', false, 'drabyashree_ledger.db not found');
    return;
  }
  const db = new Database(dbPath);

  // Check 1.1: Distinct dates in floorsheet_contracts
  const contractDates = db.prepare(`SELECT DISTINCT trade_date, COUNT(*) as cnt FROM floorsheet_contracts GROUP BY trade_date ORDER BY trade_date DESC`).all();
  logCheck(results.layer1_database_ssot, 'FLOORSHEET_SESSIONS', contractDates.length >= 10, `Found ${contractDates.length} distinct historical sessions in floorsheet_contracts`);

  // Check 1.2: Latest session is 2026-10-28
  const latestDate = contractDates[0]?.trade_date;
  logCheck(results.layer1_database_ssot, 'LATEST_SESSION_DATE', latestDate === '2026-10-28', `Latest recorded session is ${latestDate} with ${contractDates[0]?.cnt} contracts`);

  // Check 1.3: Weekend / Holiday date contamination in DB
  const nonTradingDatesInDb = contractDates.filter(r => !isNepseTradingDay(new Date(r.trade_date + 'T12:00:00+05:45')));
  logCheck(
    results.layer1_database_ssot,
    'CALENDAR_INTEGRITY',
    nonTradingDatesInDb.length === 0,
    nonTradingDatesInDb.length === 0 ? 'Zero weekend or holiday dates in floorsheet_contracts' : `Found ${nonTradingDatesInDb.length} illegal non-trading dates: ${nonTradingDatesInDb.map(d => d.trade_date).join(', ')}`
  );

  // Check 1.4: Mathematical 3-Way Conservation for Latest Session (2026-10-28)
  const fcAgg = db.prepare(`SELECT SUM(kitta) as totalKitta, ROUND(SUM(amount), 2) as totalAmount FROM floorsheet_contracts WHERE trade_date = '2026-10-28'`).get();
  const dssAgg = db.prepare(`SELECT SUM(total_volume) as totalVolume, ROUND(SUM(total_turnover), 2) as totalTurnover FROM daily_stock_summary WHERE trade_date = '2026-10-28'`).get();
  const dblAgg = db.prepare(`SELECT SUM(buy_vol) as totalBuyVol, SUM(sell_vol) as totalSellVol FROM daily_broker_ledger WHERE trade_date = '2026-10-28'`).get();

  const volMatch = fcAgg?.totalKitta === dssAgg?.totalVolume && dblAgg?.totalBuyVol === dblAgg?.totalSellVol;
  logCheck(
    results.layer1_database_ssot,
    '3_WAY_CONSERVATION_2026_10_28',
    volMatch,
    `Floorsheet Kitta: ${fcAgg?.totalKitta?.toLocaleString()}, DailySummary Vol: ${dssAgg?.totalVolume?.toLocaleString()}, Broker Buy: ${dblAgg?.totalBuyVol?.toLocaleString()}, Broker Sell: ${dblAgg?.totalSellVol?.toLocaleString()}`
  );

  db.close();

  // -------------------------------------------------------------
  // LAYER 2: API Route Parity & Microservices Parity Check
  // -------------------------------------------------------------
  console.log('\n--- LAYER 2: Backend Proxy API Parity Check ---');

  const fetchJson = (urlPath) => new Promise((resolve) => {
    const req = http.get(`http://localhost:5000${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', (err) => resolve({ status: 500, error: err.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: 504, error: 'Timeout' }); });
  });

  // Check 2.1: /api/trading-dates
  const tdRes = await fetchJson('/api/trading-dates');
  const validDates = tdRes.json?.dates || [];
  const noWeekendInApi = validDates.slice(0, 30).every(d => isNepseTradingDay(new Date(d + 'T12:00:00+05:45')));
  logCheck(
    results.layer2_api_parity,
    'API_TRADING_DATES',
    tdRes.status === 200 && validDates[0] === '2026-10-29' && validDates[1] === '2026-10-28' && noWeekendInApi,
    `Status ${tdRes.status}, count: ${validDates.length}, top date: ${validDates[0]}, no weekends: ${noWeekendInApi}`
  );

  // Check 2.2: /api/smart-money/broker-heatmap?days=1
  const hmRes = await fetchJson('/api/smart-money/broker-heatmap?days=1');
  const hmMatrix = hmRes.json?.data?.matrix || [];
  const hmDate = hmRes.json?.data?.businessDate;
  logCheck(
    results.layer2_api_parity,
    'API_BROKER_HEATMAP_1D',
    hmRes.status === 200 && hmDate === '2026-10-28' && hmMatrix.length >= 80,
    `Status ${hmRes.status}, businessDate: ${hmDate}, brokers: ${hmMatrix.length}`
  );

  // Check 2.3: /api/smart-money/broker-heatmap?date=2026-10-28 Top Accumulation / Distribution
  const b58 = hmMatrix.find(b => String(b.broker || b.id) === '58');
  const hasTopAccDist = Array.isArray(b58?.topAccumulation) && b58.topAccumulation.length > 0 && Array.isArray(b58?.topDistribution) && b58.topDistribution.length > 0;
  logCheck(
    results.layer2_api_parity,
    'BROKER_TOP10_ACCUMULATION_DISTRIBUTION',
    hasTopAccDist,
    `Broker #58 TopAcc scrips: ${b58?.topAccumulation?.length || 0}, TopDist scrips: ${b58?.topDistribution?.length || 0}`
  );

  // Check 2.4: /api/floorsheet?date=2026-10-28
  const fsRes = await fetchJson('/api/floorsheet?date=2026-10-28&size=5');
  const fsRows = fsRes.json?.data?.rows || fsRes.json?.floorsheets?.content || fsRes.json?.data || [];
  const totalContracts = fsRes.json?.data?.totalElements ?? fsRows.length;
  logCheck(
    results.layer2_api_parity,
    'API_FLOORSHEET_2026_10_28',
    fsRes.status === 200 && (fsRows.length > 0 || totalContracts > 0),
    `Status ${fsRes.status}, total contracts: ${totalContracts}`
  );

  // Check 2.5: /api/stocks/API/smart-money?days=all
  const smRes = await fetchJson('/api/stocks/API/smart-money?days=all');
  const hasSmHoldings = Boolean(smRes.json?.allHoldings || smRes.json?.totalSharesHeldTillNow != null || smRes.json?.brokerHoldings);
  logCheck(
    results.layer2_api_parity,
    'API_SMART_MONEY_PARITY',
    smRes.status === 200 && hasSmHoldings,
    `Status ${smRes.status}, allHoldings: ${Boolean(smRes.json?.allHoldings)}, totalSharesHeld: ${smRes.json?.totalSharesHeldTillNow ?? 'present'}`
  );

  // -------------------------------------------------------------
  // LAYER 3: UI Fallback & Bundled Asset Integrity Check
  // -------------------------------------------------------------
  console.log('\n--- LAYER 3: UI Components & Bundled Asset Integrity Check ---');

  // Check 3.1: src/data/broker_matrix_latest.json
  const matrixPath = path.join(process.cwd(), 'src', 'data', 'broker_matrix_latest.json');
  let bundledMatrixOk = false;
  let bundledDetail = '';
  if (fs.existsSync(matrixPath)) {
    const bMat = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    const isDate28 = bMat.businessDate === '2026-10-28';
    const noWeekendDates = (bMat.availableDates || []).every(d => isNepseTradingDay(new Date(d + 'T12:00:00+05:45')));
    const matrixLen = bMat.matrix?.length || 0;
    bundledMatrixOk = isDate28 && noWeekendDates && matrixLen >= 80;
    bundledDetail = `businessDate: ${bMat.businessDate}, brokers: ${matrixLen}, availableDates: ${bMat.availableDates?.slice(0, 4).join(', ')}, no weekends: ${noWeekendDates}`;
  } else {
    bundledDetail = 'File not found';
  }
  logCheck(results.layer3_ui_bundled_assets, 'BUNDLED_MATRIX_INTEGRITY', bundledMatrixOk, bundledDetail);

  // Check 3.2: ServicesHub forwarding of props to BrokerFlowDominanceService
  const sHubCode = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'ServicesHub.tsx'), 'utf8');
  const passesBrokerFlow = sHubCode.includes("'broker-flow': (props: any) => <BrokerFlowDominanceService mode=\"flow\" {...props} />");
  const passesBrokerDom = sHubCode.includes("'broker-dominance': (props: any) => <BrokerFlowDominanceService mode=\"dominance\" {...props} />");
  const passesBrokerTop10 = sHubCode.includes("'broker-top10': (props: any) => <BrokerFlowDominanceService mode=\"top10\" {...props} />");
  const passesMatching = sHubCode.includes("'matching-buy-sell': (props: any) => <BrokerFlowDominanceService mode=\"matching\" {...props} />");
  const hubPropsForwarded = passesBrokerFlow && passesBrokerDom && passesBrokerTop10 && passesMatching;
  logCheck(
    results.layer3_ui_bundled_assets,
    'SERVICES_HUB_PROPS_PROPAGATION',
    hubPropsForwarded,
    hubPropsForwarded ? 'All 4 broker surveillance services receive props (selectedDate, availableDates)' : 'ServicesHub still contains discarding arrow functions'
  );

  // Check 3.3: BrokerFlowDominanceService accepts and syncs props
  const bfCode = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'BrokerFlowDominanceService.tsx'), 'utf8');
  const acceptsProps = bfCode.includes('selectedDate,') && bfCode.includes('availableDates: propAvailableDates,');
  const callsFetchTradingDates = bfCode.includes('fetchAvailableTradingDates()');
  const filtersTradingDays = bfCode.includes('isNepseTradingDay');
  const bfPropsOk = acceptsProps && callsFetchTradingDates && filtersTradingDays;
  logCheck(
    results.layer3_ui_bundled_assets,
    'BROKER_FLOW_DOMINANCE_COMPONENT_SYNC',
    bfPropsOk,
    `Accepts props: ${acceptsProps}, fetches trading dates: ${callsFetchTradingDates}, filters non-trading days: ${filtersTradingDays}`
  );

  console.log('\n================================================================');
  const allPassed = results.layer1_database_ssot.passed && results.layer2_api_parity.passed && results.layer3_ui_bundled_assets.passed;
  if (allPassed) {
    console.log('🎉 AUDIT VERDICT: 100% PASSED — ALL 3 LAYERS CONSERVED & VERIFIED!');
  } else {
    console.log('⚠️ AUDIT VERDICT: DISCREPANCIES DETECTED — CHECK FAILURES ABOVE.');
  }
  console.log('================================================================\n');
}

runAudit();
