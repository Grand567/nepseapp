// scripts/testMerolaganiIpo.mjs
import axios from 'axios';
import * as cheerio from 'cheerio';

(async () => {
  try {
    const res = await axios.get('https://merolagani.com/IPO.aspx', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    $('script').each((i, el) => {
      const content = $(el).html() || '';
      if (content.includes('table') || content.includes('ajax') || content.includes('DataTable') || content.includes('fetch')) {
        console.log(`Script ${i}:`);
        console.log(content.slice(0, 1000));
      }
    });
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
