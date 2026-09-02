const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://nepsealpha.com/');
    const $ = cheerio.load(res.data);
    const indices = [];
    $('.index-marquee .item').each((i, el) => {
       console.log('Marquee item:', $(el).text().replace(/\s+/g, ' ').trim());
    });
    
    // Check for tables
    $('table').each((i, el) => {
       const txt = $(el).text().replace(/\s+/g, ' ');
       if (txt.includes('NEPSE')) {
         console.log('Found table:', txt.substring(0, 150));
         $(el).find('tr').each((j, tr) => {
            const tds = $(tr).find('td');
            if (tds.length >= 3) {
               console.log('Row:', $(tds[0]).text().trim(), $(tds[1]).text().trim(), $(tds[2]).text().trim());
            }
         });
       }
    });

  } catch(e) {
    console.error(e.message);
  }
}
test();
