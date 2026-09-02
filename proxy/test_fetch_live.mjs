import axios from 'axios';
import * as cheerio from 'cheerio';

async function fetchNepseLive() {
  console.log('Fetching NEPSE Live Market Data...\n');
  
  // 1. Fetch Market Indices & Summary from ShareSansar
  try {
    const res = await axios.get('https://www.sharesansar.com/market', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    console.log('------------------------------------------------------------');
    console.log('                 NEPSE INDICES & SUB-INDICES                ');
    console.log('------------------------------------------------------------');
    $('table tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 6) {
        const index = $(tds[0]).text().trim();
        const value = $(tds[1]).text().trim();
        const change = $(tds[4]).text().trim();
        const pChange = $(tds[5]).text().trim();
        if (index && value) {
          console.log(`${index.padEnd(28)} : ${value.padStart(10)} | ${change.padStart(8)} (${pChange.padStart(6)}%)`);
        }
      }
    });
  } catch (e) {
    console.error('Error fetching indices:', e.message);
  }

  // 2. Fetch Live Trading / Today Prices from ShareSansar / MeroLagani
  try {
    const res = await axios.get('https://merolagani.com/LatestMarket.aspx', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const stocks = [];
    $('table.table-hover tbody tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 6) {
        const symbol = $(tds[0]).text().trim();
        const ltp = parseFloat($(tds[1]).text().replace(/,/g, '')) || 0;
        const change = parseFloat($(tds[2]).text().replace(/,/g, '')) || 0;
        const high = parseFloat($(tds[3]).text().replace(/,/g, '')) || 0;
        const low = parseFloat($(tds[4]).text().replace(/,/g, '')) || 0;
        const open = parseFloat($(tds[5]).text().replace(/,/g, '')) || 0;
        const qty = parseFloat($(tds[6]).text().replace(/,/g, '')) || 0;
        const turnover = (ltp && qty) ? ltp * qty : 0;
        let pChange = 0;
        if (ltp && change) {
          const prevClose = ltp - change;
          pChange = (change / prevClose) * 100;
        }

        if (symbol && ltp > 0) {
          stocks.push({ symbol, ltp, change, pChange, high, low, open, qty, turnover });
        }
      }
    });

    console.log('\n------------------------------------------------------------');
    console.log(`  LIVE STOCK PRICES (${stocks.length} Traded Companies Found)  `);
    console.log('------------------------------------------------------------');
    
    // Sort by Turnover (Top Traded)
    const topTurnover = [...stocks].sort((a, b) => b.turnover - a.turnover).slice(0, 10);
    console.log('\n🔥 TOP 10 BY TURNOVER:');
    topTurnover.forEach((s, idx) => {
      const chgStr = (s.change >= 0 ? '+' : '') + s.change.toFixed(2);
      const pchgStr = (s.pChange >= 0 ? '+' : '') + s.pChange.toFixed(2) + '%';
      console.log(`${(idx + 1 + '.').padEnd(3)} ${s.symbol.padEnd(10)} | LTP: Rs. ${s.ltp.toFixed(2).padStart(8)} | Chg: ${chgStr.padStart(8)} (${pchgStr.padStart(7)}) | Vol: ${s.qty.toLocaleString()}`);
    });

    // Top Gainers
    const topGainers = [...stocks].sort((a, b) => b.pChange - a.pChange).slice(0, 5);
    console.log('\n🚀 TOP 5 GAINERS:');
    topGainers.forEach((s, idx) => {
      const pchgStr = (s.pChange >= 0 ? '+' : '') + s.pChange.toFixed(2) + '%';
      console.log(`${(idx + 1 + '.').padEnd(3)} ${s.symbol.padEnd(10)} | LTP: Rs. ${s.ltp.toFixed(2).padStart(8)} | +${s.change.toFixed(2)} (${pchgStr})`);
    });

    // Top Losers
    const topLosers = [...stocks].sort((a, b) => a.pChange - b.pChange).slice(0, 5);
    console.log('\n📉 TOP 5 LOSERS:');
    topLosers.forEach((s, idx) => {
      const pchgStr = s.pChange.toFixed(2) + '%';
      console.log(`${(idx + 1 + '.').padEnd(3)} ${s.symbol.padEnd(10)} | LTP: Rs. ${s.ltp.toFixed(2).padStart(8)} | ${s.change.toFixed(2)} (${pchgStr})`);
    });

  } catch (e) {
    console.error('Error fetching stock prices:', e.message);
  }
}

fetchNepseLive();
