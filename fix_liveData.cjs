const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

// Replace fetchLiveTradingDirect to use the proxy
code = code.replace(/export const fetchLiveTradingDirect = async \(\) => \{[\s\S]*?if \(stocks\.length > 0\) return stocks;[\s\S]*?return fetchLiveMarketSummary\(\);\n\};\n/, `export const fetchLiveTradingDirect = async () => {
  const base = getProxyBase();
  const res = await fetchWithTimeout(\`\${base}/api/market-summary\`, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, timeout: 8000 });
  const json = await res.json();
  if (json.success && json.data && json.data.length > 0) {
    return json.data;
  }
  throw new Error("Failed to fetch live market summary from proxy");
};
`);

fs.writeFileSync('src/utils/liveData.js', code);
