const cheerio = require('cheerio');
fetch('https://www.sharesansar.com/live-trading').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  const row = $('table tbody tr').first();
  console.log(row.text().replace(/\s+/g, ' '));
});
