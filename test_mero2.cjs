const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const r = await axios.get('https://merolagani.com/');
  const $ = cheerio.load(r.data);
  const idValue = $('#ctl00_ContentPlaceHolder1_LiveTrading').html() || '';
  console.log('LiveTrading div HTML:', idValue.substring(0, 200));

  console.log('Finding elements with id *market-index* or similar:');
  $('table').each((i, el) => {
     if ($(el).text().includes('NEPSE')) {
        console.log('Table', i, $(el).text().trim().substring(0, 100).replace(/\s+/g, ' '));
     }
  });
}
test();
