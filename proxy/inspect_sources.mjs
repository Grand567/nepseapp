import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  console.log('=== 1. SHARESANSAR LIVE TRADING (https://www.sharesansar.com/live-trading) ===');
  try {
    const res = await axios.get('https://www.sharesansar.com/live-trading', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const headers = [];
    $('table thead th').each((i, el) => headers.push($(el).text().trim()));
    console.log('Headers:', headers);
    $('table tbody tr').slice(0, 3).each((i, el) => {
      const row = [];
      $(el).find('td').each((j, td) => row.push($(td).text().trim()));
      console.log(`Row ${i}:`, row);
    });
  } catch(e) { console.log('Err SS Live:', e.message); }

  console.log('\n=== 2. SHARESANSAR TODAY SHARE PRICE (https://www.sharesansar.com/today-share-price) ===');
  try {
    const res = await axios.get('https://www.sharesansar.com/today-share-price', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const headers = [];
    $('table thead th').each((i, el) => headers.push($(el).text().trim()));
    console.log('Headers:', headers);
    $('table tbody tr').slice(0, 3).each((i, el) => {
      const row = [];
      $(el).find('td').each((j, td) => row.push($(td).text().trim()));
      console.log(`Row ${i}:`, row);
    });
  } catch(e) { console.log('Err SS Today:', e.message); }

  console.log('\n=== 3. MEROLAGANI LATEST MARKET (https://merolagani.com/LatestMarket.aspx) ===');
  try {
    const res = await axios.get('https://merolagani.com/LatestMarket.aspx', {
      headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const headers = [];
    $('table thead th, table.table-hover thead th').each((i, el) => headers.push($(el).text().trim()));
    console.log('Headers:', headers);
    $('table.table-hover tbody tr').slice(0, 3).each((i, el) => {
      const row = [];
      $(el).find('td').each((j, td) => row.push($(td).text().trim()));
      console.log(`Row ${i}:`, row);
    });
  } catch(e) { console.log('Err Mero:', e.message); }

  console.log('\n=== 4. SHARESANSAR MARKET INDICES (https://www.sharesansar.com/market) ===');
  try {
    const res = await axios.get('https://www.sharesansar.com/market', {
      headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const headers = [];
    $('table thead th').each((i, el) => headers.push($(el).text().trim()));
    console.log('Headers:', headers);
    $('table tbody tr').slice(0, 5).each((i, el) => {
      const row = [];
      $(el).find('td').each((j, td) => row.push($(td).text().trim()));
      console.log(`Row ${i}:`, row);
    });
  } catch(e) { console.log('Err SS Market:', e.message); }
}

run();
