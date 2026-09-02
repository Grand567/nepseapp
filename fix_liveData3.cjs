const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

// We just need to replace the bodies of fetchLiveTradingDirect and fetchMarketIndices.
code = code.replace(/export const fetchLiveTradingDirect = async \(\) => \{[\s\S]*?export const fetchLiveMarketSummary/g, `export const fetchLiveTradingDirect = async () => {
  const base = getProxyBase();
  const res = await fetchWithTimeout(\`\${base}/api/market-summary\`, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, timeout: 8000 });
  const json = await res.json();
  if (json.success && json.data && json.data.length > 0) return json.data;
  throw new Error("Failed to fetch live market summary from proxy");
};

export const fetchLiveMarketSummary`);

code = code.replace(/export const fetchMarketIndices = async \(\) => \{[\s\S]*?export const fetchStockFundamentals/g, `export const fetchMarketIndices = async () => {
  const base = getProxyBase();
  const res = await fetchWithTimeout(\`\${base}/api/market-indices\`, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, timeout: 8000 });
  const json = await res.json();
  if (json.success && json.data) return json.data;
  throw new Error("Failed to fetch indices from proxy");
};

export const fetchStockFundamentals`);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed liveData.js');
