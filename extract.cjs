const cheerio = require('cheerio');
const fs = require('fs');
const $ = cheerio.load(fs.readFileSync('glbsl.html', 'utf-8'));
$('table tr').each((i, el) => {
  const tds = $(el).find('td, th');
  if (tds.length >= 2) {
    console.log($(tds[0]).text().trim() + ' : ' + $(tds[1]).text().trim());
  }
});
