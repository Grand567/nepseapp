const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const urls = [
    'https://merolagani.com/',
    'https://merolagani.com/Index.aspx',
    'https://merolagani.com/MarketSummary.aspx'
  ];

  for (const url of urls) {
    try {
      const r = await axios.get(url);
      const $ = cheerio.load(r.data);
      const txt = $('body').text().replace(/\s+/g, ' ');
      const match = txt.match(/NEPSE[\s:]+(\d{4}\.\d{2})/i) || txt.match(/2\d{3}\.\d{2}/i);
      console.log(url, '=>', match ? match[0] : 'Not found');
    } catch (e) {
      console.log(url, '=>', e.message);
    }
  }
}
test();
