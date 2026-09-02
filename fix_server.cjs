const fs = require('fs');
let code = fs.readFileSync('proxy/server.mjs', 'utf8');

const startStr = 'const nepseClient = new Nepse();';
const endStr = 'app.get(\'/api/market-indices\'';

const startIdx = code.indexOf(startStr);
const endIdx = code.indexOf(endStr);

if (startIdx > -1 && endIdx > -1) {
  const newSummary = `
const nepseClient = new Nepse();

app.get('/api/market-summary', async (req, res) => {
  const cacheKey = 'market-summary';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, source: 'live', cached: true });

  try {
    const response = await axios.get('https://www.sharesansar.com/live-trading', {
      headers: HEADERS,
      timeout: 8000
    });
    
    const $ = cheerio.load(response.data);
    const stocks = [];
    
    $('table tbody tr').each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 10) {
        const symbol = $(tds[1]).text().trim();
        const ltp = parseMoney($(tds[2]).text());
        const change = parseMoney($(tds[3]).text());
        const pChange = parseMoney($(tds[4]).text());
        const open = parseMoney($(tds[5]).text());
        const high = parseMoney($(tds[6]).text());
        const low = parseMoney($(tds[7]).text());
        const volume = parseMoney($(tds[8]).text());
        const prevClose = parseMoney($(tds[9]).text());
        const turnover = (ltp && volume) ? ltp * volume : 0;
        
        if (symbol && !isNaN(ltp)) {
          stocks.push({
            symbol, name: symbol, ltp, change: change || 0, pChange: pChange || 0,
            open: open || 0, high: high || 0, low: low || 0, volume: volume || 0,
            turnover, sector: 'Unknown', source: 'live'
          });
        }
      }
    });

    if (stocks.length > 0) {
      setCache(cacheKey, stocks, 15000);
      return res.json({ success: true, data: stocks, source: 'live' });
    } else {
      throw new Error('No live trading data found');
    }
  } catch (err) {
    console.error('Scrape Live summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

`;

  code = code.substring(0, startIdx) + newSummary + code.substring(endIdx);
  fs.writeFileSync('proxy/server.mjs', code);
  console.log('Fixed block');
} else {
  console.log('Not found');
}
