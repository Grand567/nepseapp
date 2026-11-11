import axios from 'axios';
import * as cheerio from 'cheerio';

async function testAnnDetail() {
  const r = await axios.get('https://merolagani.com/AnnouncementDetail.aspx?id=38198', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 8000
  });
  const $ = cheerio.load(r.data);
  $('table tr').each((i, el) => {
    console.log(`Row ${i}:`, $(el).text().replace(/\s+/g, ' ').trim());
  });
}
testAnnDetail().catch(console.error);
