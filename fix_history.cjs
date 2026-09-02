const fs = require('fs');
let code = fs.readFileSync('src/utils/liveData.js', 'utf-8');

const replacement = `\nexport const fetchPriceHistory = async (symbol) => {
  try {
    const isNative = Capacitor.isNativePlatform();
    const rawUrl = \`https://www.sharesansar.com/company/\${symbol.toLowerCase()}\`;
    const targetUrl = isNative ? rawUrl : \`\${CORS_PROXY}\${encodeURIComponent(rawUrl)}\`;
    
    const pageRes = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    let token = doc.querySelector('meta[name="_token"]')?.getAttribute('content') || doc.querySelector('input[name="_token"]')?.value;
    let companyId = doc.querySelector('#companyid')?.textContent.trim();
    
    if (!token || !companyId) return null;

    const postData = new URLSearchParams();
    postData.append('company', companyId);
    postData.append('draw', '1');
    postData.append('start', '0');
    postData.append('length', '30');

    const historyUrl = isNative ? 'https://www.sharesansar.com/company-price-history' : \`\${CORS_PROXY}\${encodeURIComponent('https://www.sharesansar.com/company-price-history')}\`;

    const historyRes = await fetch(historyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-Token': token,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': rawUrl
      },
      body: postData.toString()
    });

    if (historyRes.ok) {
       // Wait, allorigins raw endpoint DOES NOT SUPPORT POST REQUESTS!
       // So if not native, it will fail. But Android is native, so it's fine!
       const json = await historyRes.json();
       if (json.data && Array.isArray(json.data)) {
          const formatted = json.data.map(item => ({
            date: item.published_date,
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            volume: parseFloat(item.traded_quantity)
          }));
          formatted.reverse();
          return formatted;
       }
    }
  } catch (err) {
    console.error('Failed to fetch price history natively:', err);
  }
  return null;
};\n`;

code += replacement;
fs.writeFileSync('src/utils/liveData.js', code);
console.log('Added fetchPriceHistory');
