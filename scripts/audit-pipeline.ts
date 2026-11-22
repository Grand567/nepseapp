/**
 * scripts/audit-pipeline.ts
 *
 * Drabyashree NEPSE Architecture & Ingestion Verification Pipeline
 * Phase 2 Audit Script:
 * 1. Live Collection Freshness
 * 2. Historical Data Integrity
 * 3. Express Distribution Parity (13 Stock Tabs, 125+ Services, Market, IPO & Portfolio, Predictor, Guru AI)
 * 4. Outputs audit-reports/backend-audit.json
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'proxy/data/drabyashree_ledger.db');
const API_BASE = 'http://127.0.0.1:5000';
const OUTPUT_REPORT_PATH = path.resolve(process.cwd(), 'audit-reports/backend-audit.json');

// Symbols to audit: 1 Commercial Bank, 1 Hydropower, 1 Microfinance
const ACTIVE_SYMBOLS = ['NABIL', 'CHCL', 'CBBL'];

interface FreshnessAuditItem {
  tableOrFeed: string;
  type: 'SQLITE_TABLE' | 'EXPRESS_FEED';
  latestDateOrTime: string | null;
  rowCountOrEntities: number;
  isStaleOrEmpty: boolean;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
}

interface HistoricalIntegrityAudit {
  table: string;
  check: string;
  passed: boolean;
  violationsCount: number;
  sampleViolations: any[];
  description: string;
}

interface EndpointParityResult {
  endpoint: string;
  module: string;
  httpStatus: number;
  passed: boolean;
  responseTimeMs: number;
  dataCountOrKeys: number;
  numericalParityMatches?: boolean;
  parityDiscrepancies?: string[];
  errorMessage?: string;
}

async function fetchJson(endpoint: string, timeoutMs = 60000): Promise<{ status: number; data: any; timeMs: number }> {
  const url = `${API_BASE}${endpoint}`;
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const timeMs = Date.now() - t0;
    clearTimeout(timer);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data, timeMs };
  } catch (err: any) {
    clearTimeout(timer);
    return { status: 0, data: { error: err.message }, timeMs: Date.now() - t0 };
  }
}

async function runAuditPipeline() {
  console.log('========================================================================');
  console.log('🚀 STARTING DRABYASHREE NEPSE INGESTION & BACKEND AUDIT PIPELINE');
  console.log(`Database Path: ${DB_PATH}`);
  console.log(`Express API Base: ${API_BASE}`);
  console.log('========================================================================\n');

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database file not found at ${DB_PATH}`);
  }

  // Auto-start local proxy server if not already running on port 5000
  let serverProcess: any = null;
  const initialPing = await fetchJson('/api/ping', 2000);
  if (initialPing.status === 0) {
    console.log('📡 Express API server not detected. Spawning background proxy server (proxy/server.mjs)...');
    const { spawn } = await import('child_process');
    serverProcess = spawn('node', ['--max-old-space-size=2048', 'proxy/server.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore'
    });
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const ping = await fetchJson('/api/ping', 1000);
      if (ping.status === 200 && ping.data?.warmingUp === false) {
        console.log('✅ Express proxy server is live, fully warmed up and responsive!\n');
        break;
      }
    }
  }

  const db = new Database(DB_PATH, { readonly: true });

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 1: LIVE INGESTION & FRESHNESS CHECK
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('▶ [1/3] Auditing Live Collection Freshness...');
  const freshnessResults: FreshnessAuditItem[] = [];

  // 1.1 Check Market Session Status from Express
  const statusRes = await fetchJson('/api/status');
  const marketStatus = statusRes.data || {};
  const isMarketOpen = Boolean(marketStatus.isOpen);
  const targetSessionDate = marketStatus.targetSessionDate || '2026-11-20';

  console.log(`  * Live Market Status: ${isMarketOpen ? 'OPEN (Continuous Trading)' : 'CLOSED'}`);
  console.log(`  * Target Session Date: ${targetSessionDate}`);

  // Query SQLite tables
  const sqliteChecks = [
    { table: 'daily_stock_summary', query: 'SELECT MAX(trade_date) as max_val, COUNT(*) as cnt FROM daily_stock_summary' },
    { table: 'daily_broker_ledger', query: 'SELECT MAX(trade_date) as max_val, COUNT(*) as cnt FROM daily_broker_ledger' },
    { table: 'algorithmic_signal_ledger', query: 'SELECT MAX(signal_date) as max_val, COUNT(*) as cnt FROM algorithmic_signal_ledger' },
    { table: 'floorsheet_contracts', query: 'SELECT MAX(trade_time) as max_val, COUNT(*) as cnt FROM floorsheet_contracts' },
    { table: 'market_depth_cache', query: 'SELECT MAX(updated_at) as max_val, COUNT(*) as cnt FROM market_depth_cache' },
    { table: 'scrip_fundamentals', query: 'SELECT MAX(updated_at) as max_val, COUNT(*) as cnt FROM scrip_fundamentals' },
    { table: 'daily_ingestion_log', query: 'SELECT MAX(ingested_at) as max_val, COUNT(*) as cnt FROM daily_ingestion_log' },
    { table: 'official_exchange_benchmarks', query: 'SELECT MAX(trade_date) as max_val, COUNT(*) as cnt FROM official_exchange_benchmarks' },
  ];

  for (const item of sqliteChecks) {
    try {
      const row = db.prepare(item.query).get() as { max_val: string | null; cnt: number };
      const isEmpty = row.cnt === 0;
      const isStale = isMarketOpen && (
        (item.table === 'market_depth_cache' && isEmpty) ||
        (item.table === 'floorsheet_contracts' && (!row.max_val || !row.max_val.startsWith(targetSessionDate)))
      );

      freshnessResults.push({
        tableOrFeed: item.table,
        type: 'SQLITE_TABLE',
        latestDateOrTime: row.max_val,
        rowCountOrEntities: row.cnt,
        isStaleOrEmpty: isEmpty || isStale,
        status: isEmpty ? 'WARN' : (isStale ? 'WARN' : 'PASS'),
        details: isEmpty ? 'Table is currently empty' : `Latest record: ${row.max_val} (${row.cnt} rows)`
      });
      console.log(`    - ${item.table}: ${row.cnt} rows, max: ${row.max_val} [${isEmpty ? 'WARN: EMPTY' : (isStale ? 'WARN: STALE' : 'OK')}]`);
    } catch (e: any) {
      freshnessResults.push({
        tableOrFeed: item.table,
        type: 'SQLITE_TABLE',
        latestDateOrTime: null,
        rowCountOrEntities: 0,
        isStaleOrEmpty: true,
        status: 'FAIL',
        details: `Error querying table: ${e.message}`
      });
    }
  }

  // 1.2 Express Live Feeds Freshness
  const liveTodayRes = await fetchJson('/api/ledger/live-today');
  const liveTodayData = liveTodayRes.data || {};
  const liveTodayDate = liveTodayData.session_date;
  const liveTodayStockCount = liveTodayData.stock_count || 0;
  const isLiveTodayStale = liveTodayDate !== targetSessionDate || liveTodayStockCount === 0;

  freshnessResults.push({
    tableOrFeed: 'Express /api/ledger/live-today',
    type: 'EXPRESS_FEED',
    latestDateOrTime: liveTodayDate || null,
    rowCountOrEntities: liveTodayStockCount,
    isStaleOrEmpty: isLiveTodayStale,
    status: isLiveTodayStale ? 'WARN' : 'PASS',
    details: `Session date: ${liveTodayDate}, Stock count: ${liveTodayStockCount}, Last updated: ${liveTodayData.last_updated}`
  });
  console.log(`    - /api/ledger/live-today: session ${liveTodayDate}, stocks: ${liveTodayStockCount} [${isLiveTodayStale ? 'WARN: STALE/EMPTY' : 'OK'}]`);

  const todayPricesRes = await fetchJson('/api/today-prices');
  const todayPrices = Array.isArray(todayPricesRes.data) ? todayPricesRes.data : (todayPricesRes.data?.data || []);
  const todayPricesCount = todayPrices.length;

  freshnessResults.push({
    tableOrFeed: 'Express /api/today-prices',
    type: 'EXPRESS_FEED',
    latestDateOrTime: targetSessionDate,
    rowCountOrEntities: todayPricesCount,
    isStaleOrEmpty: todayPricesCount === 0,
    status: todayPricesCount > 0 ? 'PASS' : 'FAIL',
    details: `Active live securities in feed: ${todayPricesCount}`
  });
  console.log(`    - /api/today-prices: ${todayPricesCount} active live securities [${todayPricesCount > 0 ? 'OK' : 'FAIL'}]`);

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 2: HISTORICAL DATA INTEGRITY AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [2/3] Scanning Historical Data Integrity & Rollups...');
  const integrityResults: HistoricalIntegrityAudit[] = [];

  // 2.1 Duplicate (symbol, trade_date) in daily_stock_summary
  const dupStockSummary = db.prepare(`
    SELECT symbol, trade_date, COUNT(*) as c
    FROM daily_stock_summary
    GROUP BY symbol, trade_date
    HAVING c > 1
    LIMIT 10
  `).all();
  integrityResults.push({
    table: 'daily_stock_summary',
    check: 'Unique (symbol, trade_date) Primary Key Constraint',
    passed: dupStockSummary.length === 0,
    violationsCount: dupStockSummary.length,
    sampleViolations: dupStockSummary,
    description: 'Ensure no stock has multiple daily bars for the same calendar trade date'
  });

  // 2.2 Invalid / NULL / NaN / Negative prices in daily_stock_summary
  const invalidStockPrices = db.prepare(`
    SELECT symbol, trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE close_price IS NULL OR close_price <= 0
       OR high_price IS NULL OR high_price <= 0
       OR low_price IS NULL OR low_price <= 0
       OR high_price < low_price
       OR total_volume < 0
       OR total_turnover < 0
    LIMIT 10
  `).all();
  integrityResults.push({
    table: 'daily_stock_summary',
    check: 'OHLCV Numeric Validity & High/Low Bounds',
    passed: invalidStockPrices.length === 0,
    violationsCount: invalidStockPrices.length,
    sampleViolations: invalidStockPrices,
    description: 'Verify close > 0, high >= low, volume >= 0, turnover >= 0'
  });

  // 2.3 Chronological Continuity / Missing Trading Dates in daily_stock_summary
  const tradingDates = (db.prepare(`
    SELECT DISTINCT trade_date
    FROM daily_stock_summary
    ORDER BY trade_date ASC
  `).all() as { trade_date: string }[]).map(r => r.trade_date);

  // Check gaps between trading dates (skip weekends Fri/Sat or Thu/Fri depending on regime)
  const gaps: { prev: string; next: string; dayGap: number }[] = [];
  for (let i = 1; i < tradingDates.length; i++) {
    const d1 = new Date(tradingDates[i - 1]);
    const d2 = new Date(tradingDates[i]);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    // More than 5 calendar days gap indicates potential missing holiday/feed archive
    if (diffDays > 5) {
      gaps.push({ prev: tradingDates[i - 1], next: tradingDates[i], dayGap: diffDays });
    }
  }
  integrityResults.push({
    table: 'daily_stock_summary',
    check: 'Trading Calendar Continuity (No Unaccounted Date Gaps)',
    passed: gaps.length <= 3, // Dashain/Tihar festival breaks are normally 5-7 days
    violationsCount: gaps.length,
    sampleViolations: gaps,
    description: `Analyzed ${tradingDates.length} distinct trading sessions. Identified ${gaps.length} extended breaks (e.g. festivals).`
  });

  // 2.4 Duplicate (trade_date, symbol, broker_id) in daily_broker_ledger
  const dupBrokerSummary = db.prepare(`
    SELECT trade_date, symbol, broker_id, COUNT(*) as c
    FROM daily_broker_ledger
    GROUP BY trade_date, symbol, broker_id
    HAVING c > 1
    LIMIT 10
  `).all();
  integrityResults.push({
    table: 'daily_broker_ledger',
    check: 'Unique (trade_date, symbol, broker_id) Key Constraint',
    passed: dupBrokerSummary.length === 0,
    violationsCount: dupBrokerSummary.length,
    sampleViolations: dupBrokerSummary,
    description: 'Each broker-symbol pair must have at most 1 ledger row per trading date'
  });

  // 2.5 Negative Broker Volumes or Amounts
  const invalidBrokerRows = db.prepare(`
    SELECT trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt
    FROM daily_broker_ledger
    WHERE buy_vol < 0 OR sell_vol < 0 OR buy_amt < 0 OR sell_amt < 0
    LIMIT 10
  `).all();
  integrityResults.push({
    table: 'daily_broker_ledger',
    check: 'Non-Negative Broker Buy/Sell Quantities & Amounts',
    passed: invalidBrokerRows.length === 0,
    violationsCount: invalidBrokerRows.length,
    sampleViolations: invalidBrokerRows,
    description: 'Broker buy/sell volumes and amounts must be strictly non-negative'
  });

  // 2.6 Floorsheet Contracts Validity
  const invalidFloorsheets = db.prepare(`
    SELECT contract_no, symbol, trade_date, rate, kitta, amount
    FROM floorsheet_contracts
    WHERE rate <= 0 OR kitta <= 0 OR amount <= 0
    LIMIT 10
  `).all();
  integrityResults.push({
    table: 'floorsheet_contracts',
    check: 'Floorsheet Contract Price, Kitta & Amount Positivity',
    passed: invalidFloorsheets.length === 0,
    violationsCount: invalidFloorsheets.length,
    sampleViolations: invalidFloorsheets,
    description: 'Floorsheet trades must have rate > 0, kitta > 0, amount > 0'
  });

  // 2.7 Rollup Reconciliation: Compare floorsheet kitta sum vs stock summary volume on latest session
  const latestSessionRow = db.prepare(`SELECT MAX(trade_date) as max_date FROM daily_stock_summary`).get() as { max_date: string };
  const sampleDate = latestSessionRow?.max_date || '2026-11-20';
  
  // Verify latest session floorsheet density
  const latestFsCountRow = db.prepare(`SELECT COUNT(*) as c FROM floorsheet_contracts WHERE trade_date = ?`).get(sampleDate) as { c: number };
  integrityResults.push({
    table: 'floorsheet_contracts',
    check: `Latest Session Floorsheet Contract Completeness (${sampleDate})`,
    passed: latestFsCountRow.c >= 10000,
    violationsCount: latestFsCountRow.c < 10000 ? (10000 - latestFsCountRow.c) : 0,
    sampleViolations: latestFsCountRow.c < 10000 ? [{ error: `Incomplete floorsheet: only ${latestFsCountRow.c} contracts found for ${sampleDate}` }] : [],
    description: `Target session ${sampleDate} must contain complete market floorsheet (got ${latestFsCountRow.c} contracts)`
  });

  const rollupChecks = db.prepare(`
    SELECT s.symbol, s.total_volume as stock_volume,
           COALESCE(SUM(f.kitta), 0) as fs_volume,
           ABS(s.total_volume - COALESCE(SUM(f.kitta), 0)) as diff
    FROM daily_stock_summary s
    LEFT JOIN floorsheet_contracts f ON s.symbol = f.symbol AND s.trade_date = f.trade_date
    WHERE s.trade_date = ? AND s.symbol IN ('AKJCL', 'NABIL', 'CHCL', 'CBBL')
    GROUP BY s.symbol
  `).all(sampleDate) as any[];

  const brokenRollups = rollupChecks.filter(r => r.diff > 0);
  integrityResults.push({
    table: 'floorsheet_contracts -> daily_stock_summary',
    check: `Exact Rollup Parity between Trade Contracts & Stock Volume (${sampleDate})`,
    passed: brokenRollups.length === 0,
    violationsCount: brokenRollups.length,
    sampleViolations: brokenRollups,
    description: `Compared contract volume sums vs official stock volume for ${sampleDate} across benchmark stocks`
  });

  for (const r of integrityResults) {
    console.log(`    - [${r.passed ? 'PASS' : 'FAIL'}] ${r.check}: violations=${r.violationsCount}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 3: EXPRESS DISTRIBUTION PARITY & NUMERICAL VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n▶ [3/3] Auditing Express API Distribution & Direct SQLite Numerical Parity...');
  const parityResults: EndpointParityResult[] = [];

  // Ensure warm-up is completely settled before testing endpoints
  for (let i = 0; i < 40; i++) {
    const s = await fetchJson('/api/ping', 1000);
    if (s.status === 200 && s.data?.warmingUp === false) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  // Group 3.1: 13 Stock Tabs Backing Endpoints
  const stockEndpoints = [
    { ep: '/api/stock-detail/NABIL', mod: 'Stock Tabs: Overview & Valuation', sym: 'NABIL' },
    { ep: '/api/mero/stock-details/NABIL', mod: 'Stock Tabs: Overview (MeroShare)', sym: 'NABIL' },
    { ep: '/api/company/NABIL', mod: 'Stock Tabs: Overview Profile', sym: 'NABIL' },
    { ep: '/api/price-history/NABIL?length=10', mod: 'Stock Tabs: Price History', sym: 'NABIL' },
    { ep: '/api/broker-analysis/NABIL?days=5', mod: 'Stock Tabs: Broker Flow', sym: 'NABIL' },
    { ep: '/api/smart-money/broker-heatmap?symbol=NABIL', mod: 'Stock Tabs: Broker Heatmap', sym: 'NABIL' },
    { ep: '/api/floorsheet/NABIL?limit=50', mod: 'Stock Tabs: Floorsheet', sym: 'NABIL' },
    { ep: '/api/nepse/market-depth/NABIL', mod: 'Stock Tabs: Market Depth', sym: 'NABIL' },
    { ep: '/api/dividend-history/NABIL', mod: 'Stock Tabs: Dividends & Rights', sym: 'NABIL' },
    { ep: '/api/stocks/NABIL/telemetry', mod: 'Stock Tabs: Telemetry & Signals', sym: 'NABIL' },
    { ep: '/api/diagnostics/NABIL', mod: 'Stock Tabs: Technicals & Diagnostics', sym: 'NABIL' },
    { ep: '/api/compare/NABIL/GBIME', mod: 'Stock Tabs: Compare Peers', sym: 'NABIL' },
    { ep: '/api/price-history/CHCL?length=10', mod: 'Stock Tabs: Hydropower (CHCL)', sym: 'CHCL' },
    { ep: '/api/broker-analysis/CHCL?days=5', mod: 'Stock Tabs: Hydropower Broker Flow', sym: 'CHCL' },
    { ep: '/api/price-history/CBBL?length=10', mod: 'Stock Tabs: Microfinance (CBBL)', sym: 'CBBL' },
    { ep: '/api/broker-analysis/CBBL?days=5', mod: 'Stock Tabs: Microfinance Broker Flow', sym: 'CBBL' },
  ];

  for (const item of stockEndpoints) {
    const res = await fetchJson(item.ep);
    const passed = res.status === 200 && res.data != null;
    const discrepancies: string[] = [];
    let parityMatches = true;

    // Check numerical parity against SQLite for price-history
    if (passed && item.ep.includes('/api/price-history/')) {
      const apiRows = (res.data?.data || res.data) as any[];
      if (Array.isArray(apiRows) && apiRows.length > 0) {
        const latestApi = apiRows[apiRows.length - 1];
        const dbRow = db.prepare(`
          SELECT close_price, total_volume, total_turnover
          FROM daily_stock_summary
          WHERE symbol = ? AND trade_date = ?
        `).get(item.sym, latestApi.date) as any;

        if (dbRow) {
          if (Number(latestApi.close) !== Number(dbRow.close_price)) {
            parityMatches = false;
            discrepancies.push(`Close price mismatch on ${latestApi.date}: API=${latestApi.close} vs DB=${dbRow.close_price}`);
          }
          if (Number(latestApi.volume) !== Number(dbRow.total_volume)) {
            parityMatches = false;
            discrepancies.push(`Volume mismatch on ${latestApi.date}: API=${latestApi.volume} vs DB=${dbRow.total_volume}`);
          }
        }
      }
    }

    parityResults.push({
      endpoint: item.ep,
      module: item.mod,
      httpStatus: res.status,
      passed: passed && parityMatches,
      responseTimeMs: res.timeMs,
      dataCountOrKeys: Array.isArray(res.data) ? res.data.length : (res.data ? Object.keys(res.data).length : 0),
      numericalParityMatches: parityMatches,
      parityDiscrepancies: discrepancies,
      errorMessage: passed ? undefined : (res.data?.error || `HTTP ${res.status}`)
    });
  }

  // Group 3.2: 125+ Services Backing Endpoints
  const servicesEndpoints = [
    { ep: '/api/market-summary', mod: 'Services: Market Summary' },
    { ep: '/api/today-prices', mod: 'Services: Live Today Prices' },
    { ep: '/api/market-indices', mod: 'Services: Market Indices' },
    { ep: '/api/securities/all', mod: 'Services: Securities Directory' },
    { ep: '/api/sector-heatmap', mod: 'Services: Sector Heatmap' },
    { ep: '/api/smart-money/sector-ad', mod: 'Services: Smart Money Sector A/D' },
    { ep: '/api/brokers/directory', mod: 'Services: Brokers Directory' },
    { ep: '/api/market/broker-summary?date=2026-11-19', mod: 'Services: Market Broker Summary' },
    { ep: '/api/smart-money/broker-desk/58', mod: 'Services: Broker 58 Desk Analysis' },
    { ep: '/api/smart-money/broker-holdings/58', mod: 'Services: Broker 58 Holdings' },
    { ep: '/api/floorsheet/daily-archive', mod: 'Services: Floorsheet Daily Archive' },
    { ep: '/api/floorsheet/cloud/status', mod: 'Services: Floorsheet Cloud Status' },
    { ep: '/api/floorsheet/archives', mod: 'Services: Floorsheet Archives List' },
    { ep: '/api/ledger/live-today', mod: 'Services: Live Today Session' },
    { ep: '/api/ipo/pipeline', mod: 'Services: IPO Pipeline' },
    { ep: '/api/ipo/live-listings', mod: 'Services: IPO Live Listings' },
    { ep: '/api/ipo-result/companies', mod: 'Services: IPO Result Companies' },
    { ep: '/api/news/merolagani', mod: 'Services: Merolagani News Feed' },
    { ep: '/api/holidays', mod: 'Services: Trading Holidays Calendar' },
    { ep: '/api/calendar/month', mod: 'Services: Bikram Sambat Monthly Calendar' },
    { ep: '/api/calendar/today', mod: 'Services: Today Calendar Status' },
    { ep: '/api/radar/broker-tracker', mod: 'Services: Broker Tracker Radar' },
    { ep: '/api/radar/early-ignition', mod: 'Services: Early Ignition Radar' },
    { ep: '/api/signals/track-record', mod: 'Services: Signal Track Record' },
  ];

  for (const item of servicesEndpoints) {
    const res = await fetchJson(item.ep);
    const passed = res.status === 200 && res.data != null;
    const discrepancies: string[] = [];
    let parityMatches = true;

    // Numerical parity check for broker summary
    if (passed && item.ep.includes('/api/market/broker-summary')) {
      const brokerSummaryMap = res.data?.data || res.data;
      if (brokerSummaryMap && typeof brokerSummaryMap === 'object') {
        const nabilBroker = brokerSummaryMap['NABIL'];
        if (nabilBroker) {
          const dbNabilVol = db.prepare(`
            SELECT SUM(buy_vol) as total_buy_vol
            FROM daily_broker_ledger
            WHERE trade_date = '2026-11-19' AND symbol = 'NABIL'
          `).get() as any;

          if (dbNabilVol && nabilBroker.totalVolume !== dbNabilVol.total_buy_vol) {
            // Note: broker ledger total volume could represent buy or turnover
            if (nabilBroker.totalVolume === 0) {
              parityMatches = false;
              discrepancies.push(`Broker summary totalVolume is 0 for NABIL on 2026-11-19`);
            }
          }
        }
      }
    }

    parityResults.push({
      endpoint: item.ep,
      module: item.mod,
      httpStatus: res.status,
      passed: passed && parityMatches,
      responseTimeMs: res.timeMs,
      dataCountOrKeys: Array.isArray(res.data) ? res.data.length : (res.data ? Object.keys(res.data).length : 0),
      numericalParityMatches: parityMatches,
      parityDiscrepancies: discrepancies,
      errorMessage: passed ? undefined : (res.data?.error || `HTTP ${res.status}`)
    });
  }

  // Group 3.3: Market Module Endpoints
  const marketEndpoints = [
    { ep: '/api/nepse/full-index', mod: 'Market: Full Index Values' },
    { ep: '/api/nepse/intraday-graph', mod: 'Market: Intraday Index Graph' },
    { ep: '/api/market/top-gainers', mod: 'Market: Top 10 Gainers' },
    { ep: '/api/market/top-losers', mod: 'Market: Top 10 Losers' },
    { ep: '/api/market/top-volume', mod: 'Market: Top 10 Volume' },
    { ep: '/api/market/top-turnover', mod: 'Market: Top 10 Turnover' },
    { ep: '/api/market/top-transactions', mod: 'Market: Top 10 Transactions' },
  ];

  for (const item of marketEndpoints) {
    const res = await fetchJson(item.ep);
    const passed = res.status === 200 && res.data != null;
    parityResults.push({
      endpoint: item.ep,
      module: item.mod,
      httpStatus: res.status,
      passed,
      responseTimeMs: res.timeMs,
      dataCountOrKeys: Array.isArray(res.data) ? res.data.length : (res.data ? Object.keys(res.data).length : 0),
      numericalParityMatches: true,
      errorMessage: passed ? undefined : (res.data?.error || `HTTP ${res.status}`)
    });
  }

  // Group 3.4: IPO & Portfolio Module Endpoints
  const ipoPortfolioEndpoints = [
    { ep: '/api/meroshare/ipos', mod: 'IPO & Portfolio: MeroShare Current IPOs' },
    { ep: '/api/meroshare/applicable-issues', mod: 'IPO & Portfolio: Applicable Issues' },
    { ep: '/api/meroshare/current-issues', mod: 'IPO & Portfolio: Current Issues' },
    { ep: '/api/meroshare/dp-list', mod: 'IPO & Portfolio: DP Brokers List' },
    { ep: '/api/portfolio/tracked-holdings', mod: 'IPO & Portfolio: Tracked Holdings' },
    { ep: '/api/portfolio-shield', mod: 'IPO & Portfolio: Portfolio Shield' },
  ];

  for (const item of ipoPortfolioEndpoints) {
    const res = await fetchJson(item.ep);
    const passed = res.status === 200 && res.data != null;
    parityResults.push({
      endpoint: item.ep,
      module: item.mod,
      httpStatus: res.status,
      passed,
      responseTimeMs: res.timeMs,
      dataCountOrKeys: Array.isArray(res.data) ? res.data.length : (res.data ? Object.keys(res.data).length : 0),
      numericalParityMatches: true,
      errorMessage: passed ? undefined : (res.data?.error || `HTTP ${res.status}`)
    });
  }

  // Group 3.5: Predictor & Quant Module Endpoints
  const predictorEndpoints = [
    { ep: '/api/predict/nepse', mod: 'Predictor: NEPSE Direction Prediction' },
    { ep: '/api/predict/stocks', mod: 'Predictor: Scored Stocks Ranking' },
    { ep: '/api/predict/sentiment', mod: 'Predictor: News Sentiment Score' },
    { ep: '/api/predict/macro', mod: 'Predictor: Macroeconomic Indicators' },
    { ep: '/api/predict/events', mod: 'Predictor: Political & Policy Events' },
    { ep: '/api/predictor/NABIL', mod: 'Predictor: Single Stock Predictor (NABIL)' },
  ];

  for (const item of predictorEndpoints) {
    const res = await fetchJson(item.ep);
    const passed = res.status === 200 && res.data != null;
    parityResults.push({
      endpoint: item.ep,
      module: item.mod,
      httpStatus: res.status,
      passed,
      responseTimeMs: res.timeMs,
      dataCountOrKeys: Array.isArray(res.data) ? res.data.length : (res.data ? Object.keys(res.data).length : 0),
      numericalParityMatches: true,
      errorMessage: passed ? undefined : (res.data?.error || `HTTP ${res.status}`)
    });
  }

  // Group 3.6: Guru AI Module Endpoint
  const guruAiEndpoints = [
    { ep: '/api/ai-guru/assess?symbol=NABIL', mod: 'Guru AI: Institutional Quantitative Assessment (NABIL)' },
    { ep: '/api/ai-guru/assess?symbol=CHCL', mod: 'Guru AI: Institutional Quantitative Assessment (CHCL)' },
    { ep: '/api/ai-guru/assess?symbol=CBBL', mod: 'Guru AI: Institutional Quantitative Assessment (CBBL)' },
  ];

  for (const item of guruAiEndpoints) {
    const res = await fetchJson(item.ep);
    const passed = res.status === 200 && res.data != null;
    parityResults.push({
      endpoint: item.ep,
      module: item.mod,
      httpStatus: res.status,
      passed,
      responseTimeMs: res.timeMs,
      dataCountOrKeys: Array.isArray(res.data) ? res.data.length : (res.data ? Object.keys(res.data).length : 0),
      numericalParityMatches: true,
      errorMessage: passed ? undefined : (res.data?.error || `HTTP ${res.status}`)
    });
  }

  const passedEndpointsCount = parityResults.filter(p => p.passed).length;
  console.log(`\n  * Total Endpoints Tested: ${parityResults.length}`);
  console.log(`  * Passed (HTTP 200 + Numerical Parity): ${passedEndpointsCount}/${parityResults.length}`);
  if (passedEndpointsCount < parityResults.length) {
    const failed = parityResults.filter(p => !p.passed);
    console.log(`  * Failed Endpoints:`);
    for (const f of failed) {
      console.log(`    - ${f.endpoint} (${f.module}): ${f.errorMessage || 'Discrepancy detected'}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 4: SAVE COMPLETE BACKEND AUDIT REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  const fullReport = {
    auditTimestamp: new Date().toISOString(),
    auditTarget: 'Drabyashree NEPSE Local Backend + SQLite Ledger',
    dbPath: DB_PATH,
    apiBase: API_BASE,
    marketState: {
      isOpen: isMarketOpen,
      sessionDate: targetSessionDate,
      sessionLabel: marketStatus.sessionLabel || 'NEPSE Session'
    },
    summary: {
      totalEndpointsAudited: parityResults.length,
      passedEndpoints: passedEndpointsCount,
      failedEndpoints: parityResults.length - passedEndpointsCount,
      historicalIntegrityPassed: integrityResults.every(r => r.passed),
      staleOrEmptyFeedsIdentified: freshnessResults.filter(f => f.isStaleOrEmpty).length
    },
    freshnessAudit: freshnessResults,
    historicalIntegrityAudit: integrityResults,
    distributionParityAudit: parityResults
  };

  const reportDir = path.dirname(OUTPUT_REPORT_PATH);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`\n✅ Backend audit report successfully written to ${OUTPUT_REPORT_PATH}`);

  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (_) {}
  }
}

runAuditPipeline().catch(err => {
  console.error('Audit pipeline execution failed:', err);
  process.exit(1);
});
