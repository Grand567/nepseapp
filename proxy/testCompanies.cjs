const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://www.sharesansar.com/company-list', {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const $ = cheerio.load(res.data);
    const companies = {};
    $('table tbody tr').each((_, row) => {
      const tds = $(row).find('td');
      if (tds.length >= 4) {
        const symbol = $(tds[1]).text().trim();
        const name = $(tds[2]).text().trim();
        const sector = $(tds[3]).text().trim();
        if (symbol && name) {
          companies[symbol] = { name, sector };
        }
      }
    });
    console.log(`Found ${Object.keys(companies).length} companies.`);
    console.log(Object.keys(companies).slice(0, 5).map(k => `${k}: ${companies[k].name}`).join('\n'));
  } catch (err) {
    console.error(err.message);
  }
}
test();
