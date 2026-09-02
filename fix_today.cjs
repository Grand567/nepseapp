const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

const t1 = code.indexOf('const fetchTodayPricesDirect = async () => {');
const t2 = code.indexOf('export const fetchLiveMarketData = async () => {');

if (t1 > -1 && t2 > -1) {
  code = code.substring(0, t1) + `const fetchTodayPricesDirect = async () => {
  const isNative = Capacitor.isNativePlatform();
  const rawUrl = 'https://www.sharesansar.com/today-share-price';
  const targetUrl = isNative ? rawUrl : \`\${CORS_PROXY}\${encodeURIComponent(rawUrl)}\`;
  
  const res = await fetch(targetUrl, { signal: AbortSignal.timeout(16000) });
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const stocks = [];

  doc.querySelectorAll('table tbody tr').forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 7) {
      const symbol  = tds[1]?.textContent.trim();
      const ltp     = parseMoney(tds[6]?.textContent);
      const open    = parseMoney(tds[3]?.textContent);
      const high    = parseMoney(tds[4]?.textContent);
      const low     = parseMoney(tds[5]?.textContent);
      const volume  = parseMoney(tds[8]?.textContent);
      const pChange = parseMoney(tds[7]?.textContent);

      if (symbol && !isNaN(ltp)) {
        stocks.push({ symbol, name: symbol, ltp, change: 0, pChange, open, high, low, volume, turnover: 0, sector: 'Unknown', source: 'today' });
      }
    }
  });
  return stocks;
};\n\n` + code.substring(t2);
}

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Fixed fetchTodayPricesDirect completely');
