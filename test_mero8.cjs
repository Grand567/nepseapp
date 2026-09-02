const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://merolagani.com/CompanyDetail.aspx?symbol=NABIL');
    const $ = cheerio.load(res.data);
    
    console.log('Tabs available:');
    $('.nav-tabs li a').each((i, el) => {
       console.log($(el).text().trim());
    });

    console.log('\nPrice History:');
    $('#ctl00_ContentPlaceHolder1_CompanyDetail1_divDataPriceHistory table tbody tr').slice(0, 3).each((i, el) => {
       console.log($(el).text().replace(/\s+/g, ' ').trim());
    });

    console.log('\nFloorsheet:');
    $('#ctl00_ContentPlaceHolder1_CompanyDetail1_divDataFloorsheet table tbody tr').slice(0, 3).each((i, el) => {
       console.log($(el).text().replace(/\s+/g, ' ').trim());
    });
  } catch(e) {
    console.error(e.message);
  }
}
test();
