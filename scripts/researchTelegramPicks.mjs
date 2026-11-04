import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('proxy/data/nepse_market_history.db');

const symbols = ['NMB', 'MHL', 'BPCL', 'KSBBL', 'MLBL', 'KBL', 'RFPL', 'SHEL', 'DORDI', 'SHIVM', 'GHL'];
const placeholders = symbols.map(s => `'${s}'`).join(',');

db.all(`
  SELECT symbol, date, close, prev_close, point_change, pct_change, total_trades, total_volume, total_turnover, vwap, high, low
  FROM daily_stock_summary
  WHERE symbol IN (${placeholders})
  ORDER BY symbol, date DESC
`, [], (err, rows) => {
  if (err) { console.error(err); return; }
  const latestBySym = {};
  rows.forEach(r => {
    if (!latestBySym[r.symbol]) latestBySym[r.symbol] = r;
  });

  // Now check lead broker and net accumulation on latest date (2026-11-02)
  db.all(`
    SELECT symbol, buyer_broker, seller_broker, SUM(contract_quantity) as total_qty, AVG(contract_rate) as avg_price
    FROM broker_floorsheet
    WHERE symbol IN (${placeholders}) AND transaction_date = '2026-11-02'
    GROUP BY symbol, buyer_broker, seller_broker
  `, [], (err2, fRows) => {
    if (err2) { console.error(err2); return; }
    
    // Broker net
    const brokerNet = {};
    fRows.forEach(f => {
      if (!brokerNet[f.symbol]) brokerNet[f.symbol] = {};
      const bb = f.buyer_broker;
      const sb = f.seller_broker;
      if (!brokerNet[f.symbol][bb]) brokerNet[f.symbol][bb] = { bought: 0, sold: 0, buyTurnover: 0, sellTurnover: 0 };
      if (!brokerNet[f.symbol][sb]) brokerNet[f.symbol][sb] = { bought: 0, sold: 0, buyTurnover: 0, sellTurnover: 0 };
      brokerNet[f.symbol][bb].bought += f.total_qty;
      brokerNet[f.symbol][bb].buyTurnover += (f.total_qty * f.avg_price);
      brokerNet[f.symbol][sb].sold += f.total_qty;
      brokerNet[f.symbol][sb].sellTurnover += (f.total_qty * f.avg_price);
    });

    const report = {};
    symbols.forEach(sym => {
      const summary = latestBySym[sym] || {};
      const bMap = brokerNet[sym] || {};
      let topBuyer = null;
      let topSeller = null;
      let maxNetBuy = -Infinity;
      let maxNetSell = -Infinity;

      Object.entries(bMap).forEach(([bId, stats]) => {
        const netQty = stats.bought - stats.sold;
        const buyVwap = stats.bought > 0 ? (stats.buyTurnover / stats.bought) : 0;
        const sellVwap = stats.sold > 0 ? (stats.sellTurnover / stats.sold) : 0;
        if (netQty > maxNetBuy) {
          maxNetBuy = netQty;
          topBuyer = { broker: bId, netQty, bought: stats.bought, sold: stats.sold, vwap: buyVwap, retention: stats.bought > 0 ? ((netQty / stats.bought) * 100).toFixed(1) + '%' : '0%' };
        }
        if (-netQty > maxNetSell) {
          maxNetSell = -netQty;
          topSeller = { broker: bId, netDump: -netQty, bought: stats.bought, sold: stats.sold, vwap: sellVwap };
        }
      });

      report[sym] = {
        date: summary.date,
        ltp: summary.close,
        pct_change: summary.pct_change,
        volume: summary.total_volume,
        turnover: summary.total_turnover,
        vwap: summary.vwap,
        topAccumulator: topBuyer,
        topDistributor: topSeller
      };
    });

    console.log(JSON.stringify(report, null, 2));
    db.close();
  });
});
