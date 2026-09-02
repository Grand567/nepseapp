const cheerio = require('cheerio');
fetch('https://merolagani.com/LatestMarket.aspx').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  console.log($('table.table-hover tbody tr').first().text().replace(/\s+/g, ' '));
});
