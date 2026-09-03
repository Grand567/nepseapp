// verify-guru-ai.js
// Run: node verify-guru-ai.js [local]

const BASE = process.argv[2] === 'local' ? 'http://localhost:5000' : 'https://nepseapp.onrender.com';

async function verifyGuruAI() {
  console.log('='.repeat(60));
  console.log('GURU AI VERIFICATION TEST');
  console.log(`Target: ${BASE}`);
  console.log('='.repeat(60));

  const tests = [
    {
      name: '🤖 Basic Chat',
      endpoint: '/api/guru/analyze',
      body: { 
        prompt: 'What is NEPSE? Answer in 2 sentences.',
        analysisType: 'chat'
      }
    },
    {
      name: '📊 Stock Analysis (NABIL)',
      endpoint: '/api/guru/stock-analysis',
      body: { symbol: 'NABIL', userQuestion: 'Should I buy this stock?' }
    },
    {
      name: '🌐 Market Outlook',
      endpoint: '/api/guru/market-outlook',
      method: 'GET'
    },
    {
      name: '💼 Portfolio Analysis',
      endpoint: '/api/guru/portfolio',
      body: {
        holdings: [
          { symbol: 'NABIL', quantity: 100, avgPrice: 1200 },
          { symbol: 'NICA', quantity: 50, avgPrice: 850 }
        ],
        riskProfile: 'moderate'
      }
    }
  ];

  for (const test of tests) {
    process.stdout.write(`\n${test.name}... `);
    try {
      const opts = {
        method: test.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(60000)
      };
      if (test.body) opts.body = JSON.stringify(test.body);

      const res = await fetch(`${BASE}${test.endpoint}`, opts);
      const data = await res.json();

      if (data.success) {
        console.log(`✅ Working!`);
        console.log(`   Provider: ${data.provider}`);
        console.log(`   Mock Data: ${data.isMockData}`);
        
        // Show snippet of AI response
        const snippet = typeof data.data === 'string' 
          ? data.data.slice(0, 100)
          : JSON.stringify(data.data).slice(0, 100);
        console.log(`   Response: ${snippet}...`);
      } else {
        console.log(`❌ Failed: ${data.error}`);
        
        if (data.error?.includes('not configured')) {
          console.log('   → Add GLM_API_KEY to Render environment');
        }
        if (data.setupInstructions) {
          data.setupInstructions.forEach(i => console.log(`   ${i}`));
        }
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Verify complete. Check results above.');
}

verifyGuruAI().catch(console.error);
