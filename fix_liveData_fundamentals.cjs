const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

const newFundamentals = `
export const fetchStockFundamentals = async (symbol) => {
  try {
    const isNative = Capacitor.isNativePlatform();
    const rawUrl = \`https://www.sharesansar.com/company/\${symbol.toLowerCase()}\`;
    const targetUrl = isNative ? rawUrl : \`\${CORS_PROXY}\${encodeURIComponent(rawUrl)}\`;
    
    let res = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
    
    // If native scraper fails (Cloudflare block), fallback to proxy
    if (!res.ok) {
      console.warn('Native fundamentals failed, falling back to proxy');
      res = await fetch(\`\${getProxyBase()}/api/company/\${symbol}\`, { headers: { 'Bypass-Tunnel-Reminder': 'true' }, signal: AbortSignal.timeout(12000) });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && json.data) return json.data;
      return null;
    }
    
    const html = await res.text();
`;

code = code.replace(
  /export const fetchStockFundamentals = async \(symbol\) => \{[\s\S]*?if \(!res\.ok\) return null;\n    const html = await res\.text\(\);/,
  newFundamentals
);

fs.writeFileSync('src/utils/liveData.js', code);
console.log('Added proxy fallback for fundamentals in liveData.js');
