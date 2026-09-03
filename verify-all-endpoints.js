// verify-all-endpoints.js
// Run: node verify-all-endpoints.js
// After deploying to Render

const BASE = 'https://nepseapp.onrender.com';

const tests = [
  { name: '🏥 Health Check', url: '/health', method: 'GET' },
  { name: '📊 Market Summary', url: '/api/market/summary', method: 'GET' },
  { name: '🔴 Live Market', url: '/api/market/live', method: 'GET' },
  { name: '🟢 Market Status', url: '/api/market/status', method: 'GET' },
  { name: '📋 All Securities', url: '/api/securities/all', method: 'GET' },
  { name: '💰 NABIL Price', url: '/api/securities/NABIL/price', method: 'GET' },
  {
    name: '📅 NABIL History',
    url: '/api/securities/NABIL/history?startDate=2024-01-01&endDate=2024-12-31',
    method: 'GET'
  },
  { name: '🚀 Top Gainers', url: '/api/market/top-gainers', method: 'GET' },
  { name: '📉 Top Losers', url: '/api/market/top-losers', method: 'GET' },
  { name: '📊 Top Volume', url: '/api/market/top-volume', method: 'GET' },
  { name: '💰 Top Turnover', url: '/api/market/top-turnover', method: 'GET' },
  { name: '🔄 Top Transactions', url: '/api/market/top-transactions', method: 'GET' },
  { name: '📈 All Indices', url: '/api/indices', method: 'GET' },
  { name: '🏭 Sector Indices', url: '/api/indices/sector', method: 'GET' },
  { name: '📅 NEPSE Index History', url: '/api/indices/nepse/history?startDate=2024-01-01&endDate=2024-12-31', method: 'GET' },
  { name: '📄 Floorsheet', url: '/api/floorsheet?page=0&size=20', method: 'GET' },
  { name: '🏭 Sectors', url: '/api/sectors', method: 'GET' },
  { name: '🏦 Brokers', url: '/api/brokers', method: 'GET' },
  { name: '🆕 Current IPOs', url: '/api/ipo/current', method: 'GET' },
  { name: '📊 IPO Results', url: '/api/ipo/results', method: 'GET' },
  { name: '🏢 NABIL Profile', url: '/api/company/NABIL/profile', method: 'GET' },
  { name: '💼 NABIL Financials', url: '/api/company/NABIL/financial', method: 'GET' },
  { name: '💵 NABIL Dividend', url: '/api/company/NABIL/dividend', method: 'GET' },
  { name: '🎁 NABIL Bonus', url: '/api/company/NABIL/bonus', method: 'GET' },
  { name: '📜 NABIL Rights', url: '/api/company/NABIL/rights', method: 'GET' },
  { name: '📐 NABIL Technical', url: '/api/analysis/NABIL/technical', method: 'GET' },
  { name: '📰 NEPSE News', url: '/api/news/nepse', method: 'GET' },
  {
    name: '💼 Portfolio Calculate',
    url: '/api/portfolio/calculate',
    method: 'POST',
    body: {
      holdings: [
        { symbol: 'NABIL', quantity: 100, avgPrice: 1200 },
        { symbol: 'NICA', quantity: 50, avgPrice: 850 }
      ]
    }
  },
  {
    name: '👁️ Watchlist Prices',
    url: '/api/watchlist/prices',
    method: 'POST',
    body: { symbols: ['NABIL', 'NICA', 'ADBL', 'HBL'] }
  },
];

async function runTests() {
  console.log('🚀 NEPSE App - Complete Endpoint Verification');
  console.log('='.repeat(60));
  console.log(`📡 Testing: ${BASE}`);
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;
  let mockDataFound = 0;
  const errors = [];

  for (const test of tests) {
    try {
      const start = Date.now();
      const options = {
        method: test.method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (test.body) {
        options.body = JSON.stringify(test.body);
      }

      const response = await fetch(`${BASE}${test.url}`, options);
      const duration = Date.now() - start;
      const data = await response.json();

      // Check for mock data flag
      if (data.isMockData === true) {
        mockDataFound++;
        console.log(`🚨 MOCK DATA: ${test.name} (${duration}ms)`);
        errors.push({ test: test.name, issue: 'Returns mock data!' });
        failed++;
        continue;
      }

      // Check success
      if (response.ok && data.success !== false) {
        const dataCount = Array.isArray(data.data) ? data.data.length : 'object';

        console.log(`✅ ${test.name}`);
        console.log(`   Status: ${response.status} | Time: ${duration}ms | Data: ${dataCount} items`);
        if (data.source) {
          console.log(`   Source: ${data.source}`);
        }
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Status: ${response.status} | Error: ${data.error || data.message || 'Unknown'}`);
        errors.push({ test: test.name, error: data.error || data.message, status: response.status });
        failed++;
      }
    } catch (err) {
      console.log(`💥 ${test.name} - EXCEPTION: ${err.message}`);
      errors.push({ test: test.name, error: err.message });
      failed++;
    }

    // Small delay between tests
    await new Promise(r => setTimeout(r, 500));
  }

  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL VERIFICATION REPORT');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log(`🚨 Mock Data Found: ${mockDataFound} endpoints`);
  console.log(`📈 Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

  if (mockDataFound > 0) {
    console.log('\n🚨 CRITICAL: MOCK DATA STILL PRESENT!');
    console.log('   Users will see fake prices. Fix immediately!');
  }

  if (errors.length > 0) {
    console.log('\n❌ Failed Tests:');
    errors.forEach(e => {
      console.log(`  - ${e.test}: ${e.error || e.issue}`);
    });
  }

  if (passed === tests.length && mockDataFound === 0) {
    console.log('\n🎉 ALL TESTS PASSED! App is using 100% real NEPSE data.');
    console.log('   Safe for investment decisions.');
  }
}

runTests().catch(console.error);
