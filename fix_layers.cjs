const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf8');

const oldFetchLive = `export const fetchLiveMarketData = async () => {
  // ⚡ Layer 0: Direct browser fetch (no proxy server required) ⚡
  try {
    const stocks = await fetchLiveTradingDirect();
    console.log(\`[NEPSE] 🟢 Direct live data loaded — \${stocks.length} stocks\`);
    return { data: stocks, source: 'live' };
  } catch (e) {
    console.warn('[NEPSE] Layer 0 live failed:', e.message);
  }

  try {
    const stocks = await fetchTodayPricesDirect();
    console.log(\`[NEPSE] 🟡 Direct closing data loaded — \${stocks.length} stocks\`);
    return { data: stocks, source: 'closing' };
  } catch (e) {
    console.warn('[NEPSE] Layer 0 closing failed:', e.message);
  }

  const base = getProxyBase();

  // 📡 Layer 1: Local proxy – live trading 📡
  try {
    const res  = await fetch(\`\${base}/api/market-summary\`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(\`[NEPSE] 🟢 Proxy live data loaded — \${json.data.length} stocks\`);
      return { data: json.data, source: 'live' };
    }
  } catch (_) { /* proxy not running or timed out */ }

  // 📡 Layer 2: Local proxy – closing prices 📡
  try {
    const res  = await fetch(\`\${base}/api/today-prices\`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(\`[NEPSE] 🟡 Proxy closing data loaded — \${json.data.length} stocks\`);
      return { data: json.data, source: 'closing' };
    }
  } catch (_) {}

  console.warn('[NEPSE] 🔴 All data sources failed, falling back to mock data');
  return { data: [], source: 'offline' };
};`;

const newFetchLive = `export const fetchLiveMarketData = async () => {
  const base = getProxyBase();

  // 📡 Layer 1: Local proxy – live trading (MeroLagani) 📡
  try {
    const res  = await fetch(\`\${base}/api/market-summary\`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(\`[NEPSE] 🟢 Proxy live data loaded — \${json.data.length} stocks\`);
      return { data: json.data, source: 'live' };
    }
  } catch (_) { /* proxy not running or timed out */ }

  // ⚡ Layer 0: Direct browser fetch (no proxy server required) ⚡
  try {
    const stocks = await fetchLiveTradingDirect();
    console.log(\`[NEPSE] 🟢 Direct live data loaded — \${stocks.length} stocks\`);
    return { data: stocks, source: 'live' };
  } catch (e) {
    console.warn('[NEPSE] Layer 0 live failed:', e.message);
  }

  // 📡 Layer 2: Local proxy – closing prices 📡
  try {
    const res  = await fetch(\`\${base}/api/today-prices\`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(\`[NEPSE] 🟡 Proxy closing data loaded — \${json.data.length} stocks\`);
      return { data: json.data, source: 'closing' };
    }
  } catch (_) {}
  
  try {
    const stocks = await fetchTodayPricesDirect();
    console.log(\`[NEPSE] 🟡 Direct closing data loaded — \${stocks.length} stocks\`);
    return { data: stocks, source: 'closing' };
  } catch (e) {
    console.warn('[NEPSE] Layer 0 closing failed:', e.message);
  }

  console.warn('[NEPSE] 🔴 All data sources failed, falling back to mock data');
  return { data: [], source: 'offline' };
};`;

code = code.replace(oldFetchLive, newFetchLive);

// Do the same for fetchMarketIndices
const oldFetchIndices = `export const fetchMarketIndices = async () => {
  try {
    const indices = await fetchMarketIndicesDirect();
    return indices;
  } catch(e) {
    // fallback to proxy
    try {
      const res = await fetch(\`\${getProxyBase()}/api/market-indices\`, { signal: AbortSignal.timeout(8000) });
      const json = await res.json();
      if(json.success) return json.data;
    } catch(err) {}
  }
  return null;
};`;

const newFetchIndices = `export const fetchMarketIndices = async () => {
  try {
    const res = await fetch(\`\${getProxyBase()}/api/market-indices\`, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    if(json.success) return json.data;
  } catch(err) {}

  try {
    const indices = await fetchMarketIndicesDirect();
    return indices;
  } catch(e) {}
  
  return null;
};`;

code = code.replace(oldFetchIndices, newFetchIndices);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Swapped liveData layers for faster loading');
