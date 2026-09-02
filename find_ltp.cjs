const cheerio = require('cheerio');
const fs = require('fs');
const $ = cheerio.load(fs.readFileSync('glbsl.html', 'utf-8'));
$('div.row').each((i, el) => {
  const text = $(el).text();
  if (text.includes('1,720.00')) {
     console.log('Found 1720 (LTP):', $(el).html());
  }
});
