const fs = require('fs');
let code = fs.readFileSync('proxy/server.mjs', 'utf-8');

const newEndpoint = `
app.get('/api/company/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toLowerCase();
  const cacheKey = \`company-\${symbol}\`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));
    const pageRes = await client.get(\`https://www.sharesansar.com/company/\${symbol}\`, {
      headers: HEADERS,
      timeout: 10000
    });
    
    const $ = cheerio.load(pageRes.data);
    const detail = {
      eps: 0, pe: 0, bookValue: 0, pbv: 0, dividend: 0, bonus: 0,
      marketCap: 0, sharesOutstanding: 0, listedShares: 0, paidUpCapital: 0,
      high52w: 0, low52w: 0, sector: 'Unknown'
    };

    const parseMoney = (str) => {
      if (!str || str === 'N/A' || str === '-') return 0;
      return parseFloat(str.replace(/,/g, '')) || 0;
    };

    $('table tr').each((i, el) => {
      const tds = $(el).find('td, th');
      if (tds.length >= 2) {
        const label = $(tds[0]).text().trim().toLowerCase();
        const valueStr = $(tds[1]).text().trim();
        const val = parseMoney(valueStr);
        
        if (label.includes('sector')) detail.sector = valueStr;
        if (label.includes('shares outstanding') || label.includes('outstanding shares')) detail.sharesOutstanding = val;
        if (label.includes('market price') || label === 'ltp' || label.includes('last traded')) detail.marketPrice = val;
        if (label.includes('52') && label.includes('high')) {
           const parts = valueStr.split(/[-/]/);
           detail.high52w = parseMoney(parts[0]);
           if (parts.length > 1) detail.low52w = parseMoney(parts[1]);
        }
        if (label.includes('eps') || label.includes('earning per share')) detail.eps = val;
        if (label.includes('p/e') || label.includes('pe ratio') || label.includes('price earning')) detail.pe = val;
        if (label.includes('book value')) detail.bookValue = val;
        if (label === 'pbv' || label.includes('p/b') || label.includes('price to book')) detail.pbv = val;
        if (label.includes('% dividend') || (label.includes('dividend') && label.includes('%'))) detail.dividend = parseMoney(valueStr.replace('%',''));
        if (label.includes('% bonus') || (label.includes('bonus') && label.includes('%'))) detail.bonus = parseMoney(valueStr.replace('%',''));
        if (label.includes('paid up') || label.includes('paid-up')) detail.paidUpCapital = val;
        if (label.includes('market capitalization')) detail.marketCap = val;
      }
    });

    setCache(cacheKey, detail, 120000); // 2 mins cache
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
`;

code = code.replace("app.get('/api/price-history/:symbol'", newEndpoint + "\napp.get('/api/price-history/:symbol'");
fs.writeFileSync('proxy/server.mjs', code);
console.log('Added /api/company/:symbol to proxy');
