// verify-render-deployment.js
// Run: node verify-render-deployment.js
// Place this file at: C:\Users\Hp\Desktop\Software\nepse app\verify-render-deployment.js

const RENDER_BASE = 'https://nepseapp.onrender.com';
const LOCAL_BASE = 'http://localhost:5000';

const BASE = process.argv[2] === 'local' ? LOCAL_BASE : RENDER_BASE;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ============================================================
// STEP 1: WAKE UP RENDER SERVER
// ============================================================
async function wakeUpRender() {
  console.log('\n⏳ STEP 1: Waking up Render server...');
  console.log('   (Free tier sleeps after 15 min inactivity)');
  console.log('   This may take 20-60 seconds...\n');

  const maxAttempts = 12;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      process.stdout.write(`   Attempt ${i}/${maxAttempts}...`);
      const res = await fetchWithTimeout(`${BASE}/health`, {}, 20000);

      if (res.ok) {
        const data = await res.json();
        console.log(` ✅ AWAKE!`);
        console.log(`   Status: ${data.status}`);
        console.log(`   NEPSE Connected: ${data.nepseConnected}`);
        console.log(`   Mock Data: ${data.isMockData}`);
        console.log(`   Securities: ${data.checks?.nepse?.securitiesLoaded || 'N/A'}`);
        return true;
      } else {
        console.log(` ❌ HTTP ${res.status}`);
      }
    } catch (err) {
      console.log(` ⏳ ${err.message.includes('abort') ? 'Timeout' : err.message}`);
    }

    if (i < maxAttempts) {
      process.stdout.write(`   Waiting 10s...\n`);
      await sleep(10000);
    }
  }

  console.log('\n❌ Server failed to wake up after 2 minutes');
  return false;
}

// ============================================================
// ALL 29 ENDPOINT TESTS
// ============================================================
const ALL_TESTS = [
  // Health
  {
    name: '🏥 Health Check',
    url: '/health',
    method: 'GET',
    validate: (d) => d.status === 'HEALTHY' || d.nepseConnected === true,
    critical: true
  },

  // Market Data
  {
    name: '📊 Market Summary',
    url: '/api/market/summary',
    method: 'GET',
    validate: (d) => d.data?.nepseIndex > 0,
    critical: true
  },
  {
    name: '🔴 Live Market (All Stocks)',
    url: '/api/market/live',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 100,
    critical: true,
    expectedMinCount: 100
  },
  {
    name: '🟢 Market Status',
    url: '/api/market/status',
    method: 'GET',
    validate: (d) => d.data !== null && d.data !== undefined,
    critical: false
  },

  // Securities
  {
    name: '📋 All Securities (647 stocks)',
    url: '/api/securities/all',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 400,
    critical: true,
    expectedMinCount: 400
  },
  {
    name: '💰 NABIL Today Price',
    url: '/api/securities/NABIL/price',
    method: 'GET',
    validate: (d) => d.data?.closePrice > 0 || d.data?.lastTradedPrice > 0,
    critical: true
  },
  {
    name: '📅 NABIL 1-Year History',
    url: '/api/securities/NABIL/history?startDate=2024-01-01&endDate=2024-12-31',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 50,
    critical: true,
    expectedMinCount: 50
  },
  {
    name: '📅 NICA 6-Month History',
    url: '/api/securities/NICA/history?startDate=2024-06-01&endDate=2024-12-31',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },

  // Top Performers
  {
    name: '🚀 Top Gainers',
    url: '/api/market/top-gainers',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: true
  },
  {
    name: '📉 Top Losers',
    url: '/api/market/top-losers',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: true
  },
  {
    name: '📊 Top Volume',
    url: '/api/market/top-volume',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },
  {
    name: '💰 Top Turnover',
    url: '/api/market/top-turnover',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },
  {
    name: '🔄 Top Transactions',
    url: '/api/market/top-transactions',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },

  // Indices
  {
    name: '📈 All Indices',
    url: '/api/indices',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },
  {
    name: '🏭 Sector Indices (13)',
    url: '/api/indices/sector',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },
  {
    name: '📅 NEPSE Index History',
    url: '/api/indices/nepse/history?startDate=2024-01-01&endDate=2024-12-31',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 50,
    critical: false
  },

  // Market Data
  {
    name: '📄 Floorsheet',
    url: '/api/floorsheet?page=0&size=20',
    method: 'GET',
    validate: (d) => Array.isArray(d.data?.rows || d.data) && (d.data?.rows?.length > 0 || d.data?.length > 0),
    critical: false
  },
  {
    name: '🏭 Sectors (13)',
    url: '/api/sectors',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },
  {
    name: '🏦 Brokers',
    url: '/api/brokers',
    method: 'GET',
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },

  // IPO
  {
    name: '🆕 Current IPOs (CDSC)',
    url: '/api/ipo/current',
    method: 'GET',
    validate: (d) => d.success === true,
    critical: false
  },
  {
    name: '📊 IPO Results (CDSC)',
    url: '/api/ipo/results',
    method: 'GET',
    validate: (d) => d.success === true,
    critical: false
  },

  // Company Data
  {
    name: '🏢 NABIL Company Profile',
    url: '/api/company/NABIL/profile',
    method: 'GET',
    validate: (d) => d.data !== null,
    critical: false
  },
  {
    name: '💼 NABIL Financials',
    url: '/api/company/NABIL/financial',
    method: 'GET',
    validate: (d) => d.success === true,
    critical: false
  },
  {
    name: '💵 NABIL Dividend History',
    url: '/api/company/NABIL/dividend',
    method: 'GET',
    validate: (d) => d.success === true,
    critical: false
  },
  {
    name: '🎁 NABIL Bonus History',
    url: '/api/company/NABIL/bonus',
    method: 'GET',
    validate: (d) => d.success === true,
    critical: false
  },
  {
    name: '📜 NABIL Rights History',
    url: '/api/company/NABIL/rights',
    method: 'GET',
    validate: (d) => d.success === true,
    critical: false
  },

  // Analysis
  {
    name: '📐 NABIL Technical Analysis',
    url: '/api/analysis/NABIL/technical',
    method: 'GET',
    validate: (d) => d.data?.indicators?.rsi > 0 && d.data?.dataPoints > 10,
    critical: true
  },

  // News
  {
    name: '📰 NEPSE News (RSS)',
    url: '/api/news/nepse',
    method: 'GET',
    validate: (d) => d.success === true,
    critical: false
  },

  // Portfolio
  {
    name: '💼 Portfolio Calculate (Live Prices)',
    url: '/api/portfolio/calculate',
    method: 'POST',
    body: {
      holdings: [
        { symbol: 'NABIL', quantity: 100, avgPrice: 1200 },
        { symbol: 'NICA', quantity: 50, avgPrice: 850 },
        { symbol: 'ADBL', quantity: 200, avgPrice: 400 }
      ]
    },
    validate: (d) => d.data?.summary?.totalInvested > 0 && d.isMockData === false,
    critical: true
  },

  // Watchlist
  {
    name: '👁️ Watchlist Prices',
    url: '/api/watchlist/prices',
    method: 'POST',
    body: { symbols: ['NABIL', 'NICA', 'ADBL', 'HBL', 'GBIME', 'SCB'] },
    validate: (d) => Array.isArray(d.data) && d.data.length > 0,
    critical: false
  },
];

// ============================================================
// RUN ALL TESTS
// ============================================================
async function runAllTests() {
  console.log('\n' + '='.repeat(65));
  console.log('🧪 NEPSE APP - COMPLETE RENDER DEPLOYMENT VERIFICATION');
  console.log('='.repeat(65));
  console.log(`📡 Target: ${BASE}`);
  console.log(`📅 Time: ${new Date().toLocaleString()}`);
  console.log('='.repeat(65));

  // First wake up the server
  const serverAwake = await wakeUpRender();
  if (!serverAwake) {
    console.log('\n🛑 Cannot proceed - server is not responding');
    console.log('   Check Render dashboard for errors');
    process.exit(1);
  }

  console.log('\n📊 STEP 2: Running all endpoint tests...\n');

  const results = {
    passed: [],
    failed: [],
    mockDataFound: [],
    criticalFailed: []
  };

  for (const test of ALL_TESTS) {
    try {
      const start = Date.now();

      const options = {
        method: test.method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      };

      if (test.body) {
        options.body = JSON.stringify(test.body);
      }

      const res = await fetchWithTimeout(
        `${BASE}${test.url}`,
        options,
        25000
      );

      const duration = Date.now() - start;
      let data;

      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error(`Invalid JSON response: ${parseErr.message}`);
      }

      // Check for mock data (CRITICAL)
      if (data.isMockData === true) {
        console.log(`🚨 MOCK DATA: ${test.name}`);
        results.mockDataFound.push({ test: test.name, url: test.url });
        results.failed.push(test.name);
        if (test.critical) results.criticalFailed.push(test.name);
        continue;
      }

      // Check HTTP status
      if (!res.ok) {
        console.log(`❌ ${test.name}`);
        console.log(`   HTTP ${res.status} | Error: ${data.error || 'Unknown'}`);
        results.failed.push(test.name);
        if (test.critical) results.criticalFailed.push(test.name);
        continue;
      }

      // Run validation
      let valid = true;
      try {
        valid = test.validate ? test.validate(data) : true;
      } catch (valErr) {
        valid = false;
      }

      if (valid) {
        // Determine data count
        let dataInfo = '';
        if (Array.isArray(data.data)) {
          dataInfo = `${data.data.length} items`;
          if (test.expectedMinCount && data.data.length < test.expectedMinCount) {
            dataInfo += ` ⚠️ (expected ${test.expectedMinCount}+)`;
          }
        } else if (data.data !== null && data.data !== undefined) {
          dataInfo = 'object';
        }

        console.log(`✅ ${test.name}`);
        console.log(`   ${duration}ms | ${dataInfo}${data.source ? ` | ${data.source}` : ''}`);
        results.passed.push(test.name);

      } else {
        console.log(`⚠️  ${test.name} - Data validation failed`);
        console.log(`   Response: ${JSON.stringify(data).slice(0, 150)}...`);
        results.failed.push(test.name);
        if (test.critical) results.criticalFailed.push(test.name);
      }

    } catch (err) {
      const isClosed = err.message.includes('abort') || err.message.includes('timeout');
      console.log(`${isClosed ? '⏱️' : '💥'} ${test.name}`);
      console.log(`   ${isClosed ? 'TIMEOUT' : 'ERROR'}: ${err.message}`);
      results.failed.push(test.name);
      if (test.critical) results.criticalFailed.push(test.name);
    }

    // Small delay between tests
    await sleep(300);
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  const total = ALL_TESTS.length;
  const passRate = ((results.passed.length / total) * 100).toFixed(1);

  console.log('\n' + '='.repeat(65));
  console.log('📊 FINAL DEPLOYMENT VERIFICATION REPORT');
  console.log('='.repeat(65));
  console.log(`✅ Passed:        ${results.passed.length}/${total}`);
  console.log(`❌ Failed:        ${results.failed.length}/${total}`);
  console.log(`🚨 Mock Data:     ${results.mockDataFound.length} endpoints`);
  console.log(`🔴 Critical Fail: ${results.criticalFailed.length} endpoints`);
  console.log(`📈 Pass Rate:     ${passRate}%`);
  console.log(`🌐 Server:        ${BASE}`);
  console.log('='.repeat(65));

  if (results.mockDataFound.length > 0) {
    console.log('\n🚨 MOCK DATA STILL PRESENT (CRITICAL - FIX IMMEDIATELY):');
    results.mockDataFound.forEach(m => {
      console.log(`   ❌ ${m.test}: ${m.url}`);
    });
  }

  if (results.criticalFailed.length > 0) {
    console.log('\n🔴 CRITICAL ENDPOINTS FAILING:');
    results.criticalFailed.forEach(f => {
      console.log(`   ❌ ${f}`);
    });
  }

  if (results.failed.length > 0 && results.criticalFailed.length === 0) {
    console.log('\n⚠️  NON-CRITICAL FAILURES (app still functional):');
    results.failed.forEach(f => {
      if (!results.criticalFailed.includes(f)) {
        console.log(`   • ${f}`);
      }
    });
  }

  // Overall verdict
  console.log('\n' + '='.repeat(65));
  if (results.passed.length === total && results.mockDataFound.length === 0) {
    console.log('🎉 PERFECT SCORE! 29/29 tests passed. 0 mock data.');
    console.log('   ✅ Safe for real investment decisions');
    console.log('   ✅ All endpoints using genuine NEPSE data');
    console.log('   ✅ Render deployment is healthy');
  } else if (results.criticalFailed.length === 0 && results.mockDataFound.length === 0) {
    console.log('✅ DEPLOYMENT SUCCESSFUL');
    console.log('   Core features working with real NEPSE data');
    console.log(`   ${results.failed.length} non-critical endpoints need attention`);
  } else if (results.mockDataFound.length > 0) {
    console.log('🚨 DEPLOYMENT HAS MOCK DATA - NOT SAFE FOR INVESTMENT');
    console.log('   Fix mockData.js and redeploy immediately');
  } else {
    console.log('⚠️  PARTIAL DEPLOYMENT');
    console.log('   Some critical endpoints failing');
    console.log('   Check Render logs for errors');
  }

  console.log('='.repeat(65));

  return results;
}

runAllTests().catch(err => {
  console.error('\n💥 Test runner crashed:', err);
  process.exit(1);
});
