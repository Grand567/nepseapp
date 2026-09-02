const fs = require('fs');
let code = fs.readFileSync('proxy/server.mjs', 'utf8');

const meroScrapers = `
// ==========================================
// MERO LAGANI APIs
// ==========================================

// 1. Live Market Summary (replaces ShareSansar)
app.get('/api/mero/market-summary', async (req, res) => {
  try {
    const response = await axios.get('https://merolagani.com/LatestMarket.aspx', { timeout: 10000 });
    const $ = cheerio.load(response.data);
    const stocks = [];
    $('table.table-hover tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 6) {
        const symbol = $(tds[0]).text().trim();
        const ltp = parseFloat($(tds[1]).text().replace(/,/g, '')) || 0;
        const change = parseFloat($(tds[2]).text().replace(/,/g, '')) || 0;
        const open = parseFloat($(tds[3]).text().replace(/,/g, '')) || 0;
        const high = parseFloat($(tds[4]).text().replace(/,/g, '')) || 0;
        const low = parseFloat($(tds[5]).text().replace(/,/g, '')) || 0;
        const qty = parseFloat($(tds[6]).text().replace(/,/g, '')) || 0;
        
        let pChange = 0;
        if (ltp && change) {
          const prevClose = ltp - change;
          pChange = (change / prevClose) * 100;
        }

        stocks.push({ symbol, name: symbol, ltp, change, pChange: parseFloat(pChange.toFixed(2)), open, high, low, volume: qty });
      }
    });
    res.json({ success: true, data: stocks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Fundamentals & Technicals
app.get('/api/mero/stock-details/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const response = await axios.get(\`https://merolagani.com/CompanyDetail.aspx?symbol=\${symbol}\`, { timeout: 10000 });
    const $ = cheerio.load(response.data);
    
    const details = {
      sector: '', sharesOutstanding: 0, marketCap: 0,
      eps: 0, pe: 0, bookValue: 0, pbv: 0, divYield: 0,
      high52w: 0, low52w: 0, avg120: 0
    };

    $('table tr').each((i, el) => {
      const tds = $(el).find('td, th');
      if (tds.length >= 2) {
        const label = $(tds[0]).text().trim().toLowerCase();
        const valStr = $(tds[1]).text().trim();
        const valNum = parseFloat(valStr.replace(/,/g, '')) || 0;

        if (label.includes('sector')) details.sector = valStr;
        if (label.includes('shares outstanding')) details.sharesOutstanding = valNum;
        if (label.includes('market capitalization')) details.marketCap = valNum;
        if (label.includes('eps')) details.eps = valNum;
        if (label.includes('p/e ratio')) details.pe = valNum;
        if (label.includes('book value')) details.bookValue = valNum;
        if (label.includes('pbv')) details.pbv = valNum;
        if (label.includes('dividend yield')) details.divYield = valNum;
        if (label.includes('52 weeks high - low')) {
          const parts = valStr.split('-');
          if (parts.length === 2) {
             details.high52w = parseFloat(parts[0].replace(/,/g, '')) || 0;
             details.low52w = parseFloat(parts[1].replace(/,/g, '')) || 0;
          }
        }
        if (label.includes('120 day average')) details.avg120 = valNum;
      }
    });
    res.json({ success: true, data: details });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Floorsheet (Latest 50 transactions)
app.get('/api/mero/floorsheet/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    // MeroLagani Floorsheet page takes a search param, but it's hard to scrape without form submission.
    // NepseAlpha has an open API for floorsheet! We'll use NepseAlpha for Floorsheet for speed.
    const response = await axios.get(\`https://nepsealpha.com/api/smx9156/live_floorsheet?symbol=\${symbol}\`, { timeout: 10000 });
    // Convert to our format
    const floorsheet = (response.data.data || []).slice(0, 50).map(t => ({
      id: t.id,
      buyer: t.buyer_broker,
      seller: t.seller_broker,
      qty: t.quantity,
      rate: t.rate,
      amount: t.amount,
      time: t.time
    }));
    res.json({ success: true, data: floorsheet });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Price History
app.get('/api/mero/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    // NepseAlpha chart API is fastest and easiest for history
    const end = Math.floor(Date.now() / 1000);
    const start = end - (90 * 24 * 60 * 60); // 90 days
    const response = await axios.get(\`https://nepsealpha.com/trading/1/history?symbol=\${symbol}&resolution=1D&from=\${start}&to=\${end}\`, { timeout: 10000 });
    
    const d = response.data;
    const history = [];
    if (d.s === 'ok' && d.t) {
      for (let i = 0; i < d.t.length; i++) {
        history.push({
          time: d.t[i],
          date: new Date(d.t[i]*1000).toISOString().split('T')[0],
          open: d.o[i],
          high: d.h[i],
          low: d.l[i],
          close: d.c[i],
          volume: d.v[i]
        });
      }
    }
    // Return latest first
    res.json({ success: true, data: history.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
`;

if (!code.includes('/api/mero/market-summary')) {
  // Inject before proxy server start
  code = code.replace(/app\.listen\(/, meroScrapers + '\napp.listen(');
}

// Replace /api/market-summary to use MeroLagani instead of ShareSansar
const oldMarketSummary = `app.get('/api/market-summary', async (req, res) => {
  const cacheKey = 'market-summary';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const response = await axios.get('https://www.sharesansar.com/live-trading', {
      headers: HEADERS,
      timeout: 8000
    });`;

const newMarketSummary = `app.get('/api/market-summary', async (req, res) => {
  const cacheKey = 'market-summary';
  const cached = getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  try {
    const response = await axios.get('https://merolagani.com/LatestMarket.aspx', { timeout: 10000 });`;

if (code.includes(oldMarketSummary)) {
  code = code.replace(oldMarketSummary, newMarketSummary);
  
  // Replace the parsing logic for ShareSansar with MeroLagani parsing inside the existing market-summary
  const oldParsing = `    const $ = cheerio.load(response.data);
    const stocks = [];
    $('table#headFixed tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 10) {
        const symbol = $(tds[1]).text().trim();
        const open = parseFloat($(tds[2]).text().replace(/,/g, '')) || 0;
        const high = parseFloat($(tds[3]).text().replace(/,/g, '')) || 0;
        const low = parseFloat($(tds[4]).text().replace(/,/g, '')) || 0;
        const ltp = parseFloat($(tds[5]).text().replace(/,/g, '')) || 0;
        const pChange = parseFloat($(tds[6]).text().replace(/,/g, '')) || 0;
        const change = parseFloat($(tds[7]).text().replace(/,/g, '')) || 0;
        const volume = parseFloat($(tds[8]).text().replace(/,/g, '')) || 0;
        stocks.push({ symbol, name: symbol, open, high, low, ltp, pChange, change, volume });
      }
    });`;

  const newParsing = `    const $ = cheerio.load(response.data);
    const stocks = [];
    $('table.table-hover tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 6) {
        const symbol = $(tds[0]).text().trim();
        const ltp = parseFloat($(tds[1]).text().replace(/,/g, '')) || 0;
        const change = parseFloat($(tds[2]).text().replace(/,/g, '')) || 0;
        const open = parseFloat($(tds[3]).text().replace(/,/g, '')) || 0;
        const high = parseFloat($(tds[4]).text().replace(/,/g, '')) || 0;
        const low = parseFloat($(tds[5]).text().replace(/,/g, '')) || 0;
        const qty = parseFloat($(tds[6]).text().replace(/,/g, '')) || 0;
        
        let pChange = 0;
        if (ltp && change) {
          const prevClose = ltp - change;
          pChange = (change / prevClose) * 100;
        }

        stocks.push({ symbol, name: symbol, ltp, change, pChange: parseFloat(pChange.toFixed(2)), open, high, low, volume: qty });
      }
    });`;

  code = code.replace(oldParsing, newParsing);
}

fs.writeFileSync('proxy/server.mjs', code);
console.log('MeroLagani APIs added to proxy');
