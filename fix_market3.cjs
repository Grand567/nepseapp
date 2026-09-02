const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

const s1 = code.indexOf(`export const fetchMarketIndices = async () => {`);
const s2 = code.indexOf(`export const mergeWithMockData`);

if (s1 > -1 && s2 > -1) {
  code = code.substring(0, s1) + `export const fetchMarketIndices = async () => {
  try {
    const html = await fetchWithCorsProxy('https://www.sharesansar.com/market', 12000);
    if (html) {
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
};\n\n` + code.substring(s2);
}

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed fetchMarketIndices completely');
