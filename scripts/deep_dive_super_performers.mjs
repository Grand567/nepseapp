// scripts/deep_dive_super_performers.mjs
import Database from 'better-sqlite3';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

const studySymbols = ['SHPC', 'GHL', 'MBJC', 'TAMOR', 'ECL', 'SAPIL', 'CFCL', 'AKJCL'];

console.log('Running Deep Microstructure & Flow Diagnostics on Super-Performers...\n');

for (const sym of studySymbols) {
  console.log(`================================================================================`);
  console.log(`🔍 IN-DEPTH DIAGNOSTIC: ${sym}`);
  console.log(`================================================================================`);

  // Get full OHLCV in the 6-month window (2026-05-15 to 2026-11-13)
  const bars = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ? AND trade_date BETWEEN '2026-05-15' AND '2026-11-13'
    ORDER BY trade_date ASC
  `).all(sym);

  if (!bars.length) {
    console.log('No bars found.');
    continue;
  }

  const minLowBar = bars.reduce((min, r) => (r.low_price > 0 && r.low_price < min.low_price ? r : min), bars[0]);
  const minLowIdx = bars.findIndex(r => r.trade_date === minLowBar.trade_date);
  const afterBars = bars.slice(minLowIdx);
  const maxHighBar = afterBars.reduce((max, r) => (r.high_price > max.high_price ? r : max), afterBars[0]);
  const maxHighIdx = bars.findIndex(r => r.trade_date === maxHighBar.trade_date);

  const troughDate = minLowBar.trade_date;
  const peakDate = maxHighBar.trade_date;
  const troughPrice = minLowBar.low_price;
  const peakPrice = maxHighBar.high_price;
  const rallyPct = ((peakPrice - troughPrice) / troughPrice) * 100;
  const daysInRally = maxHighIdx - minLowIdx + 1;

  console.log(`Rally Magnitude: +${rallyPct.toFixed(1)}% | Trough: Rs. ${troughPrice} (${troughDate}) -> Peak: Rs. ${peakPrice} (${peakDate}) | Duration: ${daysInRally} trading sessions`);

  // Inspect the 10 sessions BEFORE the rally trough (Base accumulation phase)
  const preBaseBars = bars.slice(Math.max(0, minLowIdx - 10), minLowIdx + 1);
  if (preBaseBars.length >= 5) {
    const avgPreVol = preBaseBars.reduce((acc, r) => acc + (r.total_volume || 0), 0) / preBaseBars.length;
    const avgRallyVol = afterBars.slice(0, Math.min(10, afterBars.length)).reduce((acc, r) => acc + (r.total_volume || 0), 0) / Math.min(10, afterBars.length);
    const volExpansionRatio = avgRallyVol / Math.max(1, avgPreVol);

    const baseHigh = Math.max(...preBaseBars.map(r => r.high_price));
    const baseLow = Math.min(...preBaseBars.map(r => r.low_price));
    const baseSpreadPct = ((baseHigh - baseLow) / baseLow) * 100;

    console.log(`Pre-Rally Base Spread: ${baseSpreadPct.toFixed(1)}% (Tight coil if < 10%) | Volume Expansion Ratio at Ignition: ${volExpansionRatio.toFixed(1)}x`);
  }

  // Inspect Broker Transactions in database
  const brokerTotals = db.prepare(`
    SELECT broker_id, 
           SUM(buy_vol) as total_buy_vol, 
           SUM(sell_vol) as total_sell_vol,
           SUM(buy_amt) as total_buy_amt,
           SUM(sell_amt) as total_sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ?
    GROUP BY broker_id
    ORDER BY (total_buy_vol - total_sell_vol) DESC
  `).all(sym);

  if (brokerTotals.length > 0) {
    const totalMarketBuy = brokerTotals.reduce((acc, r) => acc + r.total_buy_vol, 0);
    const top3Accum = brokerTotals.slice(0, 3);
    const top3Dump = [...brokerTotals].sort((a, b) => (b.total_sell_vol - b.total_buy_vol) - (a.total_sell_vol - a.total_buy_vol)).slice(0, 3);

    console.log('\nTop 3 Accumulating Brokers (Syndicate Demand):');
    top3Accum.forEach(b => {
      const netKitta = b.total_buy_vol - b.total_sell_vol;
      const bcrPct = totalMarketBuy > 0 ? ((b.total_buy_vol / totalMarketBuy) * 100).toFixed(1) : 0;
      const vwap = b.total_buy_vol > 0 ? (b.total_buy_amt / b.total_buy_vol).toFixed(1) : 0;
      console.log(`  Broker #${b.broker_id}: Buy ${b.total_buy_vol.toLocaleString()} | Sell ${b.total_sell_vol.toLocaleString()} | Net +${netKitta.toLocaleString()} kitta (${bcrPct}% of universe buy) | Buy VWAP: Rs. ${vwap}`);
    });

    console.log('\nTop 3 Distributing Brokers (Supply Source):');
    top3Dump.forEach(b => {
      const netSold = b.total_sell_vol - b.total_buy_vol;
      const vwap = b.total_sell_vol > 0 ? (b.total_sell_amt / b.total_sell_vol).toFixed(1) : 0;
      console.log(`  Broker #${b.broker_id}: Buy ${b.total_buy_vol.toLocaleString()} | Sell ${b.total_sell_vol.toLocaleString()} | Net -${netSold.toLocaleString()} kitta | Sell VWAP: Rs. ${vwap}`);
    });
  } else {
    console.log('No broker ledger entries found in daily_broker_ledger (likely new listing or pre-ledger window).');
  }

  // First 5 sessions of the rally breakdown
  console.log('\nRally Liftoff Sequence (First 5 Sessions from Trough):');
  afterBars.slice(0, 5).forEach(b => {
    const dayGain = b.open_price > 0 ? (((b.close_price - b.open_price) / b.open_price) * 100).toFixed(1) : 0;
    console.log(`  ${b.trade_date}: Open Rs. ${b.open_price} | High Rs. ${b.high_price} | Low Rs. ${b.low_price} | Close Rs. ${b.close_price} (${dayGain >= 0 ? '+' : ''}${dayGain}%) | Vol: ${b.total_volume.toLocaleString()} | Turnover: Rs. ${Math.round(b.total_turnover).toLocaleString()}`);
  });
  console.log('\n');
}
