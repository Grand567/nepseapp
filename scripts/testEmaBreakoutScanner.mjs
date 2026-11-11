import { db } from '../proxy/db/ledgerStore.js';

function computeEma(prices, period = 20) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  // Initial SMA for first period elements
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  let ema = sum / period;
  const emaArr = new Array(prices.length);
  for (let i = 0; i < period - 1; i++) {
    emaArr[i] = null;
  }
  emaArr[period - 1] = ema;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    emaArr[i] = ema;
  }
  return emaArr;
}

async function scanEmaCrossoverConsolidation() {
  const dates = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 40').all().map(d => d.trade_date).reverse();
  console.log(`Total sessions analyzed: ${dates.length}, from ${dates[0]} to ${dates[dates.length - 1]}`);
  const latestDate = dates[dates.length - 1];

  // Get distinct symbols that traded on the latest date
  const symbols = db.prepare(`
    SELECT DISTINCT symbol FROM daily_stock_summary 
    WHERE trade_date = ? AND total_volume >= 5000 AND close_price >= 100
  `).all(latestDate).map(r => r.symbol);

  console.log(`Scanning ${symbols.length} active symbols on ${latestDate}...`);

  const candidates = [];

  const getHistoryStmt = db.prepare(`
    SELECT trade_date, close_price, high_price, low_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `);

  for (const sym of symbols) {
    const rows = getHistoryStmt.all(sym);
    if (rows.length < 25) continue;

    const closes = rows.map(r => r.close_price);
    const volumes = rows.map(r => r.total_volume);
    const emas = computeEma(closes, 20);
    if (!emas) continue;

    const n = rows.length - 1;
    const currentClose = closes[n];
    const currentEma = emas[n];
    const currentVol = volumes[n];

    // Calculate 20-day average volume prior to latest session
    const prev20Vols = volumes.slice(Math.max(0, n - 20), n);
    const avgVol20 = prev20Vols.reduce((a, b) => a + b, 0) / Math.max(1, prev20Vols.length);

    // Lookback 1 to 10 sessions for a 20 EMA crossover with volume
    let crossIndex = -1;
    let crossDate = null;
    let crossVol = 0;
    let crossAvgVol = 0;

    // Check sessions from n-9 to n
    const minLookback = Math.max(20, n - 9);
    for (let i = minLookback; i <= n; i++) {
      const prevClose = closes[i - 1];
      const prevEma = emas[i - 1];
      const thisClose = closes[i];
      const thisEma = emas[i];
      const thisVol = volumes[i];

      // Was there a bullish cross (prevClose <= prevEma && thisClose > thisEma) or strong thrust above EMA?
      if (prevClose <= prevEma * 1.005 && thisClose > thisEma) {
        // Did it have volume expansion? (Volume >= 1.25x 20-day avg at cross)
        const histVols = volumes.slice(Math.max(0, i - 20), i);
        const histAvg = histVols.reduce((a, b) => a + b, 0) / Math.max(1, histVols.length);
        if (thisVol >= 1.2 * histAvg || thisVol >= 25000) {
          crossIndex = i;
          crossDate = rows[i].trade_date;
          crossVol = thisVol;
          crossAvgVol = histAvg;
          break;
        }
      }
    }

    if (crossIndex === -1) continue;

    const daysSinceCross = n - crossIndex; // 0 = crossed today, 1-9 = crossed 1-9 days ago

    // Now verify post-crossover behavior:
    // 1. Did it surge too high? (User requirement: "does not surge high")
    // Distance from 20 EMA must be within [-1%, +7.5%]
    const distFromEmaPct = ((currentClose - currentEma) / currentEma) * 100;
    if (distFromEmaPct < -1.5 || distFromEmaPct > 7.5) continue;

    // 2. Is it holding above or consolidating tightly near EMA?
    // Check min low and max high since cross
    const postCrossRows = rows.slice(crossIndex);
    const postCloses = postCrossRows.map(r => r.close_price);
    const minPostClose = Math.min(...postCloses);
    const maxPostClose = Math.max(...postCloses);
    const consolidationRangePct = ((maxPostClose - minPostClose) / minPostClose) * 100;

    // Sharp consolidation: tight base (e.g. range <= 8.5% across the consolidation)
    if (consolidationRangePct > 9.0) continue;

    // Check if currentClose is holding above or right at 20 EMA
    if (currentClose < currentEma * 0.985) continue;

    // Calculate relative volume of latest session
    const rvolToday = Number((currentVol / Math.max(1, avgVol20)).toFixed(2));
    const rvolCross = Number((crossVol / Math.max(1, crossAvgVol)).toFixed(2));

    candidates.push({
      symbol: sym,
      ltp: currentClose,
      ema20: Number(currentEma.toFixed(1)),
      distFromEmaPct: Number(distFromEmaPct.toFixed(1)),
      daysSinceCross,
      crossDate,
      rvolCross,
      rvolToday,
      todayVolume: currentVol,
      avgVol20: Math.round(avgVol20),
      consolidationRangePct: Number(consolidationRangePct.toFixed(1)),
      minBasePrice: minPostClose,
      maxBasePrice: maxPostClose
    });
  }

  // Sort by highest accumulation quality (tightest consolidation, near 20 EMA, good volume)
  candidates.sort((a, b) => {
    // Prefer stocks with daysSinceCross between 1 and 8 and tight consolidation
    const scoreA = (a.rvolCross * 1.5) + (a.rvolToday * 1.0) - (a.consolidationRangePct * 0.5) + (a.daysSinceCross > 0 ? 3 : 0);
    const scoreB = (b.rvolCross * 1.5) + (b.rvolToday * 1.0) - (b.consolidationRangePct * 0.5) + (b.daysSinceCross > 0 ? 3 : 0);
    return scoreB - scoreA;
  });

  console.log(`Found ${candidates.length} stocks crossing 20 EMA within 1-10 days and tightly consolidating:`);
  console.dir(candidates.slice(0, 10), { depth: null });
}

scanEmaCrossoverConsolidation().catch(console.error);
