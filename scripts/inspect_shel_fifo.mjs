import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db');

const rows = db.prepare(`
  SELECT trade_date, buy_vol, buy_amt, sell_vol, sell_amt
  FROM daily_broker_ledger
  WHERE symbol = 'SHEL' AND broker_id = 6
  ORDER BY trade_date ASC
`).all();

// FIFO calculation:
// Total sold: 22,354 kitta.
// The oldest 22,354 kitta bought are consumed by the sales.
// The remaining 104,859 kitta come from the most recent purchases!
let soldToConsume = rows.reduce((s, r) => s + r.sell_vol, 0);
console.log('Total sales to offset via FIFO:', soldToConsume);

let remainingInventory = [];
for (const r of rows) {
  let availableBuy = r.buy_vol;
  let unitCost = r.buy_vol > 0 ? (r.buy_amt / r.buy_vol) : 0;
  
  if (soldToConsume > 0) {
    if (availableBuy <= soldToConsume) {
      soldToConsume -= availableBuy;
      availableBuy = 0;
    } else {
      availableBuy -= soldToConsume;
      soldToConsume = 0;
    }
  }
  
  if (availableBuy > 0) {
    remainingInventory.push({
      date: r.trade_date,
      kitta: availableBuy,
      rate: unitCost,
      amount: availableBuy * unitCost
    });
  }
}

const fifoTotalKitta = remainingInventory.reduce((s, r) => s + r.kitta, 0);
const fifoTotalAmount = remainingInventory.reduce((s, r) => s + r.amount, 0);
const fifoAvgCost = fifoTotalAmount / fifoTotalKitta;

console.log('FIFO Remaining Inventory Kitta:', fifoTotalKitta);
console.log('FIFO Total Amount:', fifoTotalAmount);
console.log('FIFO Average Cost Basis per Share:', fifoAvgCost.toFixed(2));
console.table(remainingInventory);
