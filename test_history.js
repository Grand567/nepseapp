const fetch = require('node-fetch');
const DOMParser = require('dom-parser');

const fetchPriceHistory = async (symbol) => {
  try {
    const rawUrl = \`https://www.sharesansar.com/company/\${symbol.toLowerCase()}\`;
    
    const pageRes = await fetch(rawUrl);
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // dom-parser doesn't support querySelector like the browser does!
    // I should just use regex to extract token and companyId
    const tokenMatch = html.match(/name="_token"\s+content="([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : null;
    
    const companyMatch = html.match(/<span\s+id="companyid"\s*[^>]*>([^<]+)<\/span>/i) || html.match(/companyid[^>]*>([^<]+)</i);
    const companyId = companyMatch ? companyMatch[1].trim() : null;
    
    if (!token || !companyId) {
      console.log('Missing token or companyId', {token, companyId});
      return null;
    }

    const postData = new URLSearchParams();
    postData.append('company', companyId);
    postData.append('draw', '1');
    postData.append('start', '0');
    postData.append('length', '30');

    const historyUrl = 'https://www.sharesansar.com/company-price-history';

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
       const json = await historyRes.json();
       return json;
    } else {
       console.log('History res not ok', historyRes.status);
    }
  } catch (err) {
    console.error('Failed to fetch price history natively:', err);
  }
  return null;
};

fetchPriceHistory('NABIL').then(console.log);
