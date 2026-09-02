const cheerio = require('cheerio');
fetch('https://www.sharesansar.com/market').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  console.log($('table tbody tr').first().text().replace(/\s+/g, ' '));
});
