const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://merolagani.com/');
    const $ = cheerio.load(res.data);
    let indexHtml = $('#ctl00_ContentPlaceHolder1_LiveTrading').html();
    console.log(indexHtml);
  } catch (e) {
    console.error(e);
  }
}
test();
