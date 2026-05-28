const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrape() {
  try {
    const res = await axios.get('https://www.sharesansar.com/company-list', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(res.data);
    const list = {};
    $('select[name=company] option').each((i, el) => {
      const text = $(el).text();
      const match = text.match(/^(.*?) \((.*?)\)$/);
      if (match) {
        list[match[2].trim()] = match[1].trim();
      }
    });
    fs.writeFileSync('companies.json', JSON.stringify(list, null, 2));
    console.log('Saved ' + Object.keys(list).length + ' companies.');
  } catch(e) {
    console.error(e.message);
  }
}
scrape();
