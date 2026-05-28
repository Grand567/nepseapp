const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const MEROSHARE_BASE = 'https://backend.cdsc.com.np/api/meroShare';

async function test() {
  console.log('=== Testing with tough-cookie session ===');
  
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://meroshare.cdsc.com.np',
      'Referer': 'https://meroshare.cdsc.com.np/',
    }
  }));
  
  // Step 1: Prime session by hitting homepage
  console.log('\n1. Hitting MeroShare homepage...');
  try {
    await client.get('https://meroshare.cdsc.com.np/', {
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 10000,
    });
    console.log('   Homepage OK');
  } catch (e) {
    console.log('   Homepage error (expected):', e.message);
  }
  
  // Step 2: Hit capital endpoint
  console.log('\n2. Hitting /capital/ endpoint...');
  try {
    const capRes = await client.get(`${MEROSHARE_BASE}/capital/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const isHtml = typeof capRes.data === 'string' && capRes.data.includes('Request Rejected');
    console.log('   Capital response type:', typeof capRes.data);
    console.log('   Is WAF blocked:', isHtml);
    if (!isHtml && Array.isArray(capRes.data)) {
      console.log('   DP count:', capRes.data.length);
    }
  } catch (e) {
    console.log('   Capital error:', e.message);
  }
  
  // Print cookies in jar
  const cookies = await jar.getCookies('https://backend.cdsc.com.np');
  console.log('\n3. Cookies in jar:', cookies.map(c => c.key + '=' + c.value.substring(0, 20) + '...'));
  
  // Step 3: Try login with dummy credentials
  console.log('\n4. Attempting login (dummy creds)...');
  try {
    const loginRes = await client.post(`${MEROSHARE_BASE}/auth/`, {
      clientId: 101,
      username: 'testuser',
      password: 'testpass'
    }, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    const isHtml = typeof loginRes.data === 'string' && loginRes.data.includes('Request Rejected');
    console.log('   Login status:', loginRes.status);
    console.log('   Is WAF blocked:', isHtml);
    console.log('   Response data:', JSON.stringify(loginRes.data).substring(0, 200));
    
    // Check auth header
    const authKey = Object.keys(loginRes.headers).find(k => k.toLowerCase() === 'authorization');
    console.log('   Auth header present:', !!authKey);
    
  } catch (e) {
    const isHtml = typeof e.response?.data === 'string' && e.response?.data?.includes('Request Rejected');
    console.log('   Login error status:', e.response?.status);
    console.log('   Is WAF blocked:', isHtml);
    console.log('   Error data:', JSON.stringify(e.response?.data || e.message).substring(0, 200));
  }
  
  console.log('\n=== Test complete ===');
}

test();
