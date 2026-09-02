const cheerio = require('cheerio');
fetch('https://www.sharesansar.com/').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  const text = $('.market-summary').text().replace(/\s+/g, ' ');
  console.log(text.substring(0, 500));
});
