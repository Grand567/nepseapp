const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://merolagani.com/');
    const $ = cheerio.load(res.data);
    
    // Look for NEPSE index
    console.log('MeroLagani Home page indices:');
    $('.media-body').each((i, el) => {
        console.log($(el).text().replace(/\s+/g, ' ').trim());
    });

    console.log('MeroLagani Tickers:');
    $('#ctl00_ContentPlaceHolder1_LiveTrading tr').each((i, el) => {
      console.log($(el).text().replace(/\s+/g, ' ').trim());
    });
  } catch(e) {
    console.error(e.message);
  }
}
test();
