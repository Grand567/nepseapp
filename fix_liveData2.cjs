const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

const start1 = code.indexOf('export const fetchLiveTradingDirect');
const end1 = code.indexOf('export const fetchLiveMarketSummary');

if (start1 > -1 && end1 > -1) {
  code = code.substring(0, start1) + `export const fetchLiveTradingDirect = async () => {
  const base = getProxyBase();
  const res = await fetchWithTimeout(\`\${base}/api/market-summary\`, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, timeout: 8000 });
  const json = await res.json();
  if (json.success && json.data && json.data.length > 0) return json.data;
  throw new Error("Failed to fetch live market summary from proxy");
};\n\n` + code.substring(end1);
}

// Now replace fetchMarketIndices as well!
// Wait, fetchMarketIndices currently races the proxy and ShareSansar direct fetch.
// ShareSansar direct fetch will still get stale data.
// So let's replace fetchMarketIndices to ONLY use the proxy!

const start2 = code.indexOf('export const fetchMarketIndices');
const end2 = code.indexOf('export const fetchStockFundamentals');

if (start2 > -1 && end2 > -1) {
  code = code.substring(0, start2) + `export const fetchMarketIndices = async () => {
  const base = getProxyBase();
  const res = await fetchWithTimeout(\`\${base}/api/market-indices\`, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, timeout: 8000 });
  const json = await res.json();
  if (json.success && json.data) return json.data;
  throw new Error("Failed to fetch indices from proxy");
};\n\n` + code.substring(end2);
}

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Successfully updated liveData.js');
