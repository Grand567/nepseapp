const fs = require('fs');
let code = fs.readFileSync('proxy/server.mjs', 'utf8');

const newMarketIndices = `// Market Indices (ShareSansar)
app.get('/api/market-indices', async (req, res) => {
  const cacheKey = 'market-indices';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const response = await axios.get('https://www.sharesansar.com/market', {
      headers: HEADERS,
      timeout: 10000
    });
    const $ = cheerio.load(response.data);
    const indices = {};
    const subIndices = [];
    
    $('table tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 6) {
        const index = $(tds[0]).text().trim();
        const value = parseFloat($(tds[1]).text().replace(/,/g, '')) || 0;
        const change = parseFloat($(tds[4]).text().replace(/,/g, '')) || 0;
        const pChange = parseFloat($(tds[5]).text().replace(/,/g, '')) || 0;
        
        if (index && value) {
          const val = { value, change, pChange };
          if (index === 'NEPSE Index') indices.nepse = val;
          else if (index === 'Float Index') indices.float = val;
          else if (index === 'Sensitive Index') indices.sensitive = val;
          else if (index === 'Sensitive Float Index') indices.sensitiveFloat = val;
          else {
            subIndices.push({ index, value, change, pChange });
          }
        }
      }
    });
    
    indices.subIndices = subIndices;
    setCache(cacheKey, indices, 15000);
    res.json({ success: true, data: indices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});`;

// Replace existing /api/market-indices
const regex = /app\.get\('\/api\/market-indices', async \(req, res\) => \{[\s\S]*?\}\);/;
if (code.match(regex)) {
  code = code.replace(regex, newMarketIndices);
  fs.writeFileSync('proxy/server.mjs', code);
  console.log('Replaced /api/market-indices');
} else {
  console.log('Could not find /api/market-indices in server.mjs');
}
