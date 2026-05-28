const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Cache-Control': 'no-cache',
};

async function testToday() {
  try {
    const response = await axios.get('https://www.sharesansar.com/today-share-price', {
      headers: HEADERS,
      timeout: 15000
    });
    console.log("Status Code:", response.status);
    const $ = cheerio.load(response.data);
    const tableRows = $('table#headFixed tbody tr, table.table tbody tr, table tbody tr');
    console.log("Rows found:", tableRows.length);
    if(tableRows.length > 0) {
      console.log("First row html:", $(tableRows[0]).html().substring(0, 500));
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

async function testLive() {
  try {
    const response = await axios.get('https://www.sharesansar.com/live-trading', {
      headers: HEADERS,
      timeout: 15000
    });
    console.log("Live Status Code:", response.status);
    const $ = cheerio.load(response.data);
    const tableRows = $('table tbody tr');
    console.log("Live Rows found:", tableRows.length);
  } catch (e) {
    console.error("Live Error:", e.message);
  }
}

testToday().then(testLive);
