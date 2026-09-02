const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

// Insert Capacitor import if missing
if (!code.includes("import { Capacitor }")) {
  code = code.replace("import { initializeMarket", "import { Capacitor } from '@capacitor/core';\nimport { initializeMarket");
}

// Rewrite fetchLiveTradingDirect
const p1 = code.indexOf('const fetchLiveTradingDirect = async () => {');
const p2 = code.indexOf('const fetchTodayPricesDirect = async () => {');
if (p1 > -1 && p2 > -1) {
  code = code.substring(0, p1) + `const fetchLiveTradingDirect = async () => {
  const isNative = Capacitor.isNativePlatform();
  const rawUrl = 'https://www.sharesansar.com/live-trading';
  const targetUrl = isNative ? rawUrl : \`\${CORS_PROXY}\${encodeURIComponent(rawUrl)}\`;
  
  const res = await fetch(targetUrl, { signal: AbortSignal.timeout(14000) });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const stocks = [];

  doc.querySelectorAll('table tbody tr').forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 10) {
      const symbol  = tds[1]?.textContent.trim();
      const ltp     = parseMoney(tds[2]?.textContent);
      const pChange = parseMoney(tds[4]?.textContent);
      const open    = parseMoney(tds[5]?.textContent);
      const high    = parseMoney(tds[6]?.textContent);
      const low     = parseMoney(tds[7]?.textContent);
      const volume  = parseMoney(tds[8]?.textContent);
      const turn    = parseMoney(tds[9]?.textContent);

      if (symbol && !isNaN(ltp)) {
        stocks.push({ symbol, name: symbol, ltp, change: 0, pChange, open, high, low, volume, turnover: turn, sector: 'Unknown', source: 'live' });
      }
    }
  });

  return stocks;
};\n\n` + code.substring(p2);
}

// Rewrite fetchMarketIndices
const m1 = code.indexOf('export const fetchMarketIndices = async () => {');
const m2 = code.indexOf('export const mergeWithMockData');
if (m1 > -1 && m2 > -1) {
  code = code.substring(0, m1) + `export const fetchMarketIndices = async () => {
  try {
    const isNative = Capacitor.isNativePlatform();
    const rawUrl = 'https://www.sharesansar.com/market';
    const targetUrl = isNative ? rawUrl : \`\${CORS_PROXY}\${encodeURIComponent(rawUrl)}\`;
    
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const indices = {};

      doc.querySelectorAll('table tbody tr').forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length >= 7) {
          const name    = tds[0]?.textContent.trim().toUpperCase();
          const value   = parseMoney(tds[4]?.textContent);
          const change  = parseMoney(tds[5]?.textContent);
          const pChange = parseMoney(tds[6]?.textContent);
          if (!isNaN(value)) {
            if (name === 'NEPSE INDEX')     indices.nepse     = { value, change, pChange };
            if (name === 'FLOAT INDEX')     indices.float     = { value, change, pChange };
            if (name === 'SENSITIVE INDEX') indices.sensitive = { value, change, pChange };
          }
        }
      });

      if (Object.keys(indices).length > 0) return indices;
    }
  } catch (_) {}

  // Fall back to local proxy
  const base = getProxyBase();
  try {
    const res  = await fetch(\`\${base}/api/market-indices\`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.success && json.data) return json.data;
  } catch (_) {}
  return null;
};\n\n` + code.substring(m2);
}

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Successfully rewrote liveData.js to use Capacitor native fetch');
