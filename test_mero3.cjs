const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const r = await axios.get('https://merolagani.com/LatestMarket.aspx');
  const $ = cheerio.load(r.data);
  let indexStr = '';
  // Try to find the NEPSE index. Usually in #ctl00_ContentPlaceHolder1_LiveTrading or similar
  $('table').each((i, el) => {
    const text = $(el).text();
    if (text.includes('NEPSE') || text.includes('Index')) {
      console.log('Found table:', text.replace(/\s+/g, ' ').substring(0, 100));
    }
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const match = bodyText.match(/NEPSE.{0,30}2\d{3}\.\d{2}/i);
  if (match) console.log('Regex match:', match[0]);
}
test();
