const cheerio = require('cheerio');
fetch('https://nepsealpha.com/').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  console.log($('.stock-ticker').text().replace(/\s+/g, ' '));
});
