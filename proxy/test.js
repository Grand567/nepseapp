const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://www.sharesansar.com/market').then(res => {
  const $ = cheerio.load(res.data);
  const results = [];
  $('td, span, div, h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('2742')) {
      results.push($(el).html());
    }
  });
  console.log('Matches for 2742 on /market:', results.length);
  if (results.length > 0) console.log(results.slice(0, 3));
  
  // Also look for "NEPSE"
  $('td').each((_, el) => {
     if($(el).text().trim().toUpperCase() === 'NEPSE' || $(el).text().trim().toUpperCase() === 'NEPSE INDEX') {
         console.log('Found NEPSE row:', $(el).parent().text().replace(/\s+/g, ' '));
     }
  });
}).catch(console.error);
