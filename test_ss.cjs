const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://www.sharesansar.com/market');
    const $ = cheerio.load(res.data);
    const indices = [];
    $('table tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 7) {
        const index = $(tds[0]).text().trim();
        const value = parseFloat($(tds[1]).text().replace(/,/g, '')) || 0;
        const change = parseFloat($(tds[6]).text().replace(/,/g, '')) || 0;
        const pChange = parseFloat($(tds[7]).text().replace(/,/g, '')) || 0;
        if (index && value) indices.push({ index, value, change, pChange });
      }
    });
    console.log(indices.slice(0, 10));
  } catch (e) {
    console.error(e.message);
  }
}
test();
