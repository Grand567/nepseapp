import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

const parseMoney = (str) => {
  if (!str) return NaN;
  const cleaned = str.replace(/[^\d.+\-]/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
};

async function testAccurateParsing() {
  console.log('Testing Accurate NEPSE Data Parsing...\n');

  // 1. Test Market Indices
  const indicesRes = await axios.get('https://www.sharesansar.com/market', { headers: HEADERS, timeout: 10000 });
  const $i = cheerio.load(indicesRes.data);
  const indices = {};
  const subIndices = [];

  $i('table tbody tr').each((i, el) => {
    const tds = $i(el).find('td');
    if (tds.length >= 7) {
      const name = $i(tds[0]).text().trim();
      const open = parseMoney($i(tds[1]).text());
      const high = parseMoney($i(tds[2]).text());
      const low = parseMoney($i(tds[3]).text());
      const value = parseMoney($i(tds[4]).text()); // CURRENT / CLOSE
      const change = parseMoney($i(tds[5]).text()); // POINT CHANGE
      const pChange = parseMoney($i(tds[6]).text()); // % CHANGE
      const turnover = parseMoney($i(tds[7]).text()); // TURNOVER

      if (name && !isNaN(value) && value > 0) {
        const item = { name, open, high, low, value, change, pChange, turnover };
        if (name === 'NEPSE Index') indices.nepse = item;
        else if (name === 'Sensitive Index') indices.sensitive = item;
        else if (name === 'Float Index') indices.float = item;
        else if (name === 'Sensitive Float Index') indices.sensitiveFloat = item;
        else if (tds.length >= 7) {
          subIndices.push({ index: name, ...item });
        }
      }
    }
  });

  console.log('📊 ACCURATE NEPSE INDICES:');
  console.log('NEPSE Index:', indices.nepse);
  console.log('Sensitive Index:', indices.sensitive);
  console.log('Float Index:', indices.float);
  console.log('SubIndices Count:', subIndices.length);

  // 2. Test Today's Prices
  const todayRes = await axios.get('https://www.sharesansar.com/today-share-price', { headers: HEADERS, timeout: 10000 });
  const $t = cheerio.load(todayRes.data);
  const stocks = [];

  $t('table tbody tr').each((i, el) => {
    const tds = $t(el).find('td');
    if (tds.length >= 18) {
      const symbol = $t(tds[1]).text().trim();
      if (!symbol || symbol === 'Symbol' || symbol === 'S.N.') return;

      const open = parseMoney($t(tds[3]).text());
      const high = parseMoney($t(tds[4]).text());
      const low = parseMoney($t(tds[5]).text());
      const close = parseMoney($t(tds[6]).text());
      const ltp = parseMoney($t(tds[7]).text()) || close;
      const volume = parseMoney($t(tds[11]).text());
      const prevClose = parseMoney($t(tds[12]).text());
      const turnover = parseMoney($t(tds[13]).text());
      const change = parseMoney($t(tds[15]).text());
      const pChange = parseMoney($t(tds[17]).text());
      const high52w = tds.length >= 23 ? parseMoney($t(tds[22]).text()) : 0;
      const low52w = tds.length >= 24 ? parseMoney($t(tds[23]).text()) : 0;

      if (symbol && ltp > 0) {
        stocks.push({
          symbol,
          name: symbol,
          ltp,
          open,
          high,
          low,
          close,
          prevClose,
          change,
          pChange,
          volume,
          turnover,
          high52w,
          low52w,
          source: 'closing'
        });
      }
    }
  });

  console.log('\n📈 ACCURATE TODAY PRICES (Total Stocks:', stocks.length, '):');
  const nabil = stocks.find(s => s.symbol === 'NABIL');
  const hdl = stocks.find(s => s.symbol === 'HDL');
  const nifra = stocks.find(s => s.symbol === 'NIFRA');
  console.log('Sample NABIL:', nabil);
  console.log('Sample HDL:', hdl);
  console.log('Sample NIFRA:', nifra);

  // 3. Test MeroLagani Latest Market
  const meroRes = await axios.get('https://merolagani.com/LatestMarket.aspx', { headers: HEADERS, timeout: 10000 });
  const $m = cheerio.load(meroRes.data);
  const meroStocks = [];

  $m('table.table-hover tbody tr').each((i, el) => {
    const tds = $m(el).find('td');
    if (tds.length >= 8) {
      const symbol = $m(tds[0]).text().trim();
      const ltp = parseMoney($m(tds[1]).text());
      const pChange = parseMoney($m(tds[2]).text());
      const open = parseMoney($m(tds[3]).text());
      const high = parseMoney($m(tds[4]).text());
      const low = parseMoney($m(tds[5]).text());
      const volume = parseMoney($m(tds[6]).text());
      const prevClose = parseMoney($m(tds[7]).text());
      const change = parseMoney($m(tds[8]).text()) || (prevClose > 0 ? ltp - prevClose : 0);
      const turnover = (ltp && volume) ? ltp * volume : 0;

      if (symbol && ltp > 0) {
        meroStocks.push({
          symbol,
          ltp,
          open,
          high,
          low,
          prevClose,
          change: Number(change.toFixed(2)),
          pChange: Number(pChange.toFixed(2)),
          volume,
          turnover
        });
      }
    }
  });

  console.log('\n🔥 ACCURATE MEROLAGANI STOCKS (Total:', meroStocks.length, '):');
  console.log('Sample Mero NABIL:', meroStocks.find(s => s.symbol === 'NABIL'));
}

testAccurateParsing();
