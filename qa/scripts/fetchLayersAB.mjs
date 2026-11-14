import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';

const SPOT_STOCKS = ['SHIVM', 'NABIL', 'HRL', 'UPPER', 'HDL', 'ACLBSL', 'MKHL', 'AKJCL', 'NICL', 'CBBL'];
const TIMEFRAMES = [1, 5, 15, 30, 'all'];

async function run() {
  console.log('--- 1. Fetching Layer A (Raw Upstream Sources) ---');
  // 1a. Raw ShareSansar Market Table
  let rawIndices = {};
  try {
    const rawMarketRes = await axios.get('https://www.sharesansar.com/market', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const $m = cheerio.load(rawMarketRes.data);
    $m('table').first().find('tbody tr').each((i, el) => {
      const tds = $m(el).find('td');
      if (tds.length >= 8) {
        const name = $m(tds[0]).text().trim();
        rawIndices[name] = {
          name,
          open: parseFloat($m(tds[1]).text().replace(/,/g, '')),
          high: parseFloat($m(tds[2]).text().replace(/,/g, '')),
          low: parseFloat($m(tds[3]).text().replace(/,/g, '')),
          close: parseFloat($m(tds[4]).text().replace(/,/g, '')),
          change: parseFloat($m(tds[5]).text().replace(/,/g, '')),
          pChange: parseFloat($m(tds[6]).text().replace(/,/g, '')),
          turnover: parseFloat($m(tds[7]).text().replace(/,/g, ''))
        };
      }
    });
    console.log('Parsed raw indices:', Object.keys(rawIndices));
  } catch (e) {
    console.warn('ShareSansar market fetch failed:', e.message);
  }

  // 1b. Raw ShareSansar Today Share Price
  let rawStocks = {};
  try {
    const rawTodayRes = await axios.get('https://www.sharesansar.com/today-share-price', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 12000
    });
    const $t = cheerio.load(rawTodayRes.data);
    $t('table tbody tr').each((i, el) => {
      const tds = $t(el).find('td');
      if (tds.length >= 24) {
        const sym = $t(tds[1]).text().trim();
        rawStocks[sym] = {
          symbol: sym,
          open: parseFloat($t(tds[3]).text().replace(/,/g, '')),
          high: parseFloat($t(tds[4]).text().replace(/,/g, '')),
          low: parseFloat($t(tds[5]).text().replace(/,/g, '')),
          close: parseFloat($t(tds[6]).text().replace(/,/g, '')),
          ltp: parseFloat($t(tds[7]).text().replace(/,/g, '')),
          volume: parseFloat($t(tds[11]).text().replace(/,/g, '')),
          prevClose: parseFloat($t(tds[12]).text().replace(/,/g, '')),
          turnover: parseFloat($t(tds[13]).text().replace(/,/g, '')),
          diff: parseFloat($t(tds[15]).text().replace(/,/g, '')),
          diffPct: parseFloat($t(tds[17]).text().replace(/,/g, '')),
          high52w: parseFloat($t(tds[22]).text().replace(/,/g, '')),
          low52w: parseFloat($t(tds[23]).text().replace(/,/g, ''))
        };
      }
    });
    console.log('Parsed raw stocks count:', Object.keys(rawStocks).length);
  } catch (e) {
    console.warn('ShareSansar today-share-price fetch failed:', e.message);
  }

  // 1c. Raw SQLite Ledger Ground Truth for Timeframes
  const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
  const allTradingDates = db.prepare('SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC').all().map(r => r.trade_date);
  console.log(`DB Total trading sessions available: ${allTradingDates.length}, latest: ${allTradingDates[0]}`);

  const rawLedgerByStockTimeframe = {};
  for (const sym of SPOT_STOCKS) {
    rawLedgerByStockTimeframe[sym] = {};
    for (const tf of TIMEFRAMES) {
      const numDays = tf === 'all' ? allTradingDates.length : tf;
      const targetDates = allTradingDates.slice(0, numDays);
      const oldestDate = targetDates[targetDates.length - 1];
      const newestDate = targetDates[0];

      // Query broker aggregated ledger
      const brokerRows = db.prepare(`
        SELECT broker_id,
               SUM(buy_vol) as buy_qty,
               SUM(buy_amt) as buy_amt,
               SUM(sell_vol) as sell_qty,
               SUM(sell_amt) as sell_amt
        FROM daily_broker_ledger
        WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?
        GROUP BY broker_id
      `).all(sym, oldestDate, newestDate);

      let totalBuyQty = 0;
      let totalSellQty = 0;
      let totalBuyAmt = 0;
      let totalSellAmt = 0;
      const accumulators = [];
      const distributors = [];

      for (const r of brokerRows) {
        const bId = String(r.broker_id);
        const bQty = Number(r.buy_qty || 0);
        const sQty = Number(r.sell_qty || 0);
        const bAmt = Number(r.buy_amt || 0);
        const sAmt = Number(r.sell_amt || 0);
        const netQty = bQty - sQty;
        const netAmt = bAmt - sAmt;
        totalBuyQty += bQty;
        totalSellQty += sQty;
        totalBuyAmt += bAmt;
        totalSellAmt += sAmt;

        const item = {
          brokerId: bId,
          buyQty: bQty,
          sellQty: sQty,
          buyAmt: bAmt,
          sellAmt: sAmt,
          netQty,
          netAmt,
          avgBuyRate: bQty > 0 ? +(bAmt / bQty).toFixed(2) : 0,
          avgSellRate: sQty > 0 ? +(sAmt / sQty).toFixed(2) : 0
        };

        if (netQty > 0) accumulators.push(item);
        else if (netQty < 0) distributors.push(item);
      }

      accumulators.sort((a, b) => b.netQty - a.netQty);
      distributors.sort((a, b) => a.netQty - b.netQty);

      const top3Buy = accumulators.slice(0, 3).reduce((s, a) => s + a.netQty, 0);
      const top3Sell = distributors.slice(0, 3).reduce((s, a) => s + Math.abs(a.netQty), 0);
      const bcr3Buy = totalBuyQty > 0 ? +((top3Buy / totalBuyQty) * 100).toFixed(2) : 0;
      const bcr3Sell = totalSellQty > 0 ? +((top3Sell / totalSellQty) * 100).toFixed(2) : 0;

      rawLedgerByStockTimeframe[sym][tf] = {
        symbol: sym,
        timeframe: tf,
        sessionCount: targetDates.length,
        startDate: oldestDate,
        endDate: newestDate,
        totalVolume: totalBuyQty,
        totalTurnover: totalBuyAmt,
        topAccumulator: accumulators[0] || null,
        topDistributor: distributors[0] || null,
        top3Accumulators: accumulators.slice(0, 3),
        top3Distributors: distributors.slice(0, 3),
        bcr3BuyPct: bcr3Buy,
        bcr3SellPct: bcr3Sell
      };
    }
  }

  console.log('--- 2. Fetching Layer B (Proxy Endpoints & Cache Headers) ---');
  const proxyBase = 'http://localhost:5000';
  const proxyEndpointsAudit = {};

  async function fetchWithHeaders(endpoint) {
    const start = Date.now();
    try {
      const res = await axios.get(`${proxyBase}${endpoint}`, { timeout: 3500 });
      const dur = Date.now() - start;
      return {
        status: res.status,
        headers: {
          cacheControl: res.headers['cache-control'] || 'NONE',
          etag: res.headers['etag'] || 'NONE',
          age: res.headers['age'] || 'NONE',
          contentType: res.headers['content-type'] || 'NONE'
        },
        durationMs: dur,
        data: res.data
      };
    } catch (err) {
      return {
        status: err.response?.status || 500,
        headers: {
          cacheControl: err.response?.headers?.['cache-control'] || 'NONE',
          etag: err.response?.headers?.['etag'] || 'NONE'
        },
        durationMs: Date.now() - start,
        error: err.message
      };
    }
  }

  // Key endpoints
  proxyEndpointsAudit['/api/indices'] = await fetchWithHeaders('/api/indices');
  proxyEndpointsAudit['/api/market-summary'] = await fetchWithHeaders('/api/market-summary');
  proxyEndpointsAudit['/api/today-prices'] = await fetchWithHeaders('/api/today-prices');
  proxyEndpointsAudit['/api/smart-money/accumulation'] = await fetchWithHeaders('/api/smart-money/accumulation');
  proxyEndpointsAudit['/api/smart-money/distribution'] = await fetchWithHeaders('/api/smart-money/distribution');
  proxyEndpointsAudit['/api/smart-money/cornering'] = await fetchWithHeaders('/api/smart-money/cornering');
  proxyEndpointsAudit['/api/smart-money/whale-prints'] = await fetchWithHeaders('/api/smart-money/whale-prints');
  proxyEndpointsAudit['/api/smart-money/broker-dominance'] = await fetchWithHeaders('/api/smart-money/broker-dominance');
  proxyEndpointsAudit['/api/smart-money/broker-heatmap'] = await fetchWithHeaders('/api/smart-money/broker-heatmap');

  const proxyStockTimeframes = {};
  for (const sym of SPOT_STOCKS) {
    proxyStockTimeframes[sym] = {};
    for (const tf of TIMEFRAMES) {
      const ep = `/api/diagnostics/${sym}?days=${tf}`;
      const res = await fetchWithHeaders(ep);
      proxyStockTimeframes[sym][tf] = {
        status: res.status,
        headers: res.headers,
        durationMs: res.durationMs,
        data: res.data?.data || null
      };
    }
    proxyStockTimeframes[sym]['depth'] = await fetchWithHeaders(`/api/nepse/market-depth/${sym}`);
    proxyStockTimeframes[sym]['priceHistory'] = await fetchWithHeaders(`/api/price-history/${sym}`);
  }

  // Save intermediate Layer A & B artifacts
  const payload = {
    generatedAt: new Date().toISOString(),
    layerA: {
      indices: rawIndices,
      stocksSpotCheck: SPOT_STOCKS.map(s => rawStocks[s]).filter(Boolean),
      stocksCount: Object.keys(rawStocks).length,
      ledgerByTimeframe: rawLedgerByStockTimeframe
    },
    layerB: {
      endpointsAudit: {
        '/api/indices': { status: proxyEndpointsAudit['/api/indices'].status, headers: proxyEndpointsAudit['/api/indices'].headers, dur: proxyEndpointsAudit['/api/indices'].durationMs },
        '/api/market-summary': { status: proxyEndpointsAudit['/api/market-summary'].status, headers: proxyEndpointsAudit['/api/market-summary'].headers, dur: proxyEndpointsAudit['/api/market-summary'].durationMs },
        '/api/today-prices': { status: proxyEndpointsAudit['/api/today-prices'].status, headers: proxyEndpointsAudit['/api/today-prices'].headers, dur: proxyEndpointsAudit['/api/today-prices'].durationMs },
        '/api/smart-money/accumulation': { status: proxyEndpointsAudit['/api/smart-money/accumulation'].status, headers: proxyEndpointsAudit['/api/smart-money/accumulation'].headers, dur: proxyEndpointsAudit['/api/smart-money/accumulation'].durationMs },
        '/api/smart-money/distribution': { status: proxyEndpointsAudit['/api/smart-money/distribution'].status, headers: proxyEndpointsAudit['/api/smart-money/distribution'].headers, dur: proxyEndpointsAudit['/api/smart-money/distribution'].durationMs },
        '/api/smart-money/cornering': { status: proxyEndpointsAudit['/api/smart-money/cornering'].status, headers: proxyEndpointsAudit['/api/smart-money/cornering'].headers, dur: proxyEndpointsAudit['/api/smart-money/cornering'].durationMs },
        '/api/smart-money/whale-prints': { status: proxyEndpointsAudit['/api/smart-money/whale-prints'].status, headers: proxyEndpointsAudit['/api/smart-money/whale-prints'].headers, dur: proxyEndpointsAudit['/api/smart-money/whale-prints'].durationMs }
      },
      indices: proxyEndpointsAudit['/api/indices'].data,
      todayPricesSpotCheck: (proxyEndpointsAudit['/api/today-prices'].data?.data || proxyEndpointsAudit['/api/today-prices'].data || []).filter(s => SPOT_STOCKS.includes(s.symbol)),
      stockTimeframes: proxyStockTimeframes
    }
  };

  fs.writeFileSync('scratch/layersAB_audit.json', JSON.stringify(payload, null, 2));
  console.log('✅ Successfully collected Layers A and B in scratch/layersAB_audit.json');
}

run().catch(e => {
  console.error('Fatal error in Layer A/B fetch:', e);
  process.exit(1);
});
