import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db');

const symbols = ['SHEL', 'AKJCL', 'RFPL'];

for (const sym of symbols) {
  // Get latest 5 trade dates
  const dates = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date DESC LIMIT 5').all(sym).map(r => r.trade_date);
  
  // Also get 20 dates for RVOL calculation
  const hist20 = db.prepare('SELECT trade_date, close_price, total_volume, total_turnover FROM daily_stock_summary WHERE symbol = ? ORDER BY trade_date DESC LIMIT 20').all(sym);
  const ltp = hist20[0].close_price;
  const volLatest = hist20[0].total_volume;
  const avgVol20 = hist20.slice(1).reduce((s, r) => s + r.total_volume, 0) / (hist20.length - 1);
  const rvol = volLatest / avgVol20;
  
  // 5-Day broker analysis
  const placeholders = dates.map(() => '?').join(',');
  const brokerRows = db.prepare(`
    SELECT broker_id, 
           SUM(buy_vol) as total_buy, 
           SUM(sell_vol) as total_sell,
           SUM(buy_amt) as total_buy_amt,
           SUM(sell_amt) as total_sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${placeholders})
    GROUP BY broker_id
  `).all(sym, ...dates);
  
  const totalMarketBuy = brokerRows.reduce((s, r) => s + r.total_buy, 0);
  const totalMarketSell = brokerRows.reduce((s, r) => s + r.total_sell, 0);
  
  const sortedBuyers = [...brokerRows].sort((a, b) => b.total_buy - a.total_buy);
  const sortedSellers = [...brokerRows].sort((a, b) => b.total_sell - a.total_sell);
  
  const top3BuyKitta = sortedBuyers.slice(0, 3).reduce((s, r) => s + r.total_buy, 0);
  const top3SellKitta = sortedSellers.slice(0, 3).reduce((s, r) => s + r.total_sell, 0);
  
  const bcr3Buy = totalMarketBuy > 0 ? (top3BuyKitta / totalMarketBuy) * 100 : 0;
  const bcr3Sell = totalMarketSell > 0 ? (top3SellKitta / totalMarketSell) * 100 : 0;
  const bcr3Spread = bcr3Buy - bcr3Sell;
  
  // Top 3 individual broker breakdown
  const top3BuyersList = sortedBuyers.slice(0, 3).map(b => ({
    broker: b.broker_id,
    buy: b.total_buy,
    sell: b.total_sell,
    net: b.total_buy - b.total_sell,
    buyPct: totalMarketBuy > 0 ? ((b.total_buy / totalMarketBuy) * 100).toFixed(1) : 0,
    vwap: b.total_buy > 0 ? (b.total_buy_amt / b.total_buy).toFixed(1) : 0
  }));

  const top3SellersList = sortedSellers.slice(0, 3).map(s => ({
    broker: s.broker_id,
    sell: s.total_sell,
    buy: s.total_buy,
    net: s.total_buy - s.total_sell,
    sellPct: totalMarketSell > 0 ? ((s.total_sell / totalMarketSell) * 100).toFixed(1) : 0,
    vwap: s.total_sell > 0 ? (s.total_sell_amt / s.total_sell).toFixed(1) : 0
  }));
  
  // Lead broker
  const leadBroker = sortedBuyers[0];
  const leadBuySharePct = totalMarketBuy > 0 ? (leadBroker.total_buy / totalMarketBuy) * 100 : 0;
  const leadNetKitta = leadBroker.total_buy - leadBroker.total_sell;
  const leadRetention = leadBroker.total_buy > 0 ? (leadNetKitta / leadBroker.total_buy) * 100 : 0;
  
  // Est float
  let estFloat = 6000000;
  if (sym === 'SHEL') estFloat = 30450000;
  if (sym === 'AKJCL') estFloat = 8000000;
  if (sym === 'RFPL') estFloat = 7000000;
  
  const leadFloatCorneredPct = (Math.max(0, leadNetKitta) / estFloat) * 100;
  
  console.log(`\n================== ${sym} ==================`);
  console.log(`LTP: Rs. ${ltp} | Latest Vol: ${volLatest.toLocaleString()} kitta | 20D Avg Vol: ${avgVol20.toFixed(0).toLocaleString()} kitta`);
  console.log(`RVOL (Relative Volume): ${rvol.toFixed(2)}x (Volume is ${((1 - rvol) * 100).toFixed(1)}% below normal average!)`);
  console.log(`Total 5-Day Market Turnover: ${totalMarketBuy.toLocaleString()} kitta`);
  console.log(`BCR3 Buy: ${bcr3Buy.toFixed(1)}% | BCR3 Sell: ${bcr3Sell.toFixed(1)}% | BCR3 Spread: ${bcr3Spread > 0 ? '+' : ''}${bcr3Spread.toFixed(1)}%`);
  console.log('Top 3 Buyers:', top3BuyersList);
  console.log('Top 3 Sellers:', top3SellersList);
  console.log(`Lead Broker: #${leadBroker.broker_number}`);
  console.log(`  - Buy Volume: ${leadBroker.total_buy.toLocaleString()} kitta (${leadBuySharePct.toFixed(1)}% of all market buys)`);
  console.log(`  - Sell Volume: ${leadBroker.total_sell.toLocaleString()} kitta`);
  console.log(`  - Net Absorbed: ${leadNetKitta.toLocaleString()} kitta (${leadRetention.toFixed(1)}% retention)`);
  console.log(`  - Net as % of Free Float (${(estFloat/1e6).toFixed(1)}M): ${leadFloatCorneredPct.toFixed(2)}%`);
}
