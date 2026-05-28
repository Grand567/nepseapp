const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.sharesansar.com/existing-issues',
};

async function test() {
  try {
    const url = 'https://www.sharesansar.com/existing-issues?type=1&draw=1&start=0&length=15';
    const res = await axios.get(url, { headers: HEADERS });
    if (!res.data || !res.data.data) {
      console.log('No data returned:', res.data);
      return;
    }
    const ipos = [];
    for (const item of res.data.data) {
      try {
        const symbol = cheerio.load(item.company.symbol).text().trim();
        const name = cheerio.load(item.company.companyname).text().trim();
        ipos.push({
          id: item.companyid,
          symbol,
          name,
          units: item.total_units,
          price: item.issue_price,
          opening: item.opening_date,
          closing: item.closing_date,
          allotment: item.final_date,
          status: item.status
        });
      } catch (e) {
        console.error('Error parsing item:', e.message);
      }
    }
    console.log(JSON.stringify(ipos, null, 2));
  } catch (err) {
    console.error('Fetch error:', err.message, err.stack);
  }
}

test();
