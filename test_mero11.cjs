const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  try {
    const res = await axios.get('https://merolagani.com/Floorsheet.aspx');
    const $ = cheerio.load(res.data);
    console.log('Floorsheet table found:', $('table').length > 0);
  } catch(e) {
    console.error(e.message);
  }
}
test();
