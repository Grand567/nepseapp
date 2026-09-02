const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://merolagani.com/LatestMarket.aspx');
    const $ = cheerio.load(res.data);
    const rows = $('table.table-hover tbody tr');
    console.log(rows.length, 'stocks found');
    
    if (rows.length > 0) {
      const tds = $(rows[0]).find('td');
      console.log('Sample stock:');
      console.log('Symbol:', $(tds[0]).text().trim());
      console.log('LTP:', $(tds[1]).text().trim());
      console.log('Change:', $(tds[2]).text().trim());
    }

    const indexRes = await axios.get('https://merolagani.com/');
    const $2 = cheerio.load(indexRes.data);
    const indexRows = $2('#ctl00_ContentPlaceHolder1_LiveTrading tr');
    console.log('Indices found:', indexRows.length);
  } catch (e) {
    console.error(e.message);
  }
}
test();
