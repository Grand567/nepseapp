const cheerio = require('cheerio');
fetch('https://merolagani.com/LatestMarket.aspx').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  $('table.table-index').each((i, el) => console.log('Index Table:', $(el).text().replace(/\s+/g, ' ')));
});
