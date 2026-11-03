import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db');

const totalDbDates = db.prepare('SELECT count(DISTINCT trade_date) as cnt, min(trade_date) as start_date, max(trade_date) as end_date FROM daily_stock_summary').get();
const shelDates = db.prepare('SELECT count(DISTINCT trade_date) as cnt, min(trade_date) as start_date, max(trade_date) as end_date FROM daily_stock_summary WHERE symbol = ?').get('SHEL');
const broker6AllDays = db.prepare('SELECT count(DISTINCT trade_date) as cnt, min(trade_date) as start_date, max(trade_date) as end_date FROM daily_broker_ledger WHERE symbol = ? AND broker_id = 6').get('SHEL');
const broker6BuyDays = db.prepare('SELECT count(DISTINCT trade_date) as cnt, min(trade_date) as start_date, max(trade_date) as end_date FROM daily_broker_ledger WHERE symbol = ? AND broker_id = 6 AND buy_vol > 0').get('SHEL');

console.log('TOTAL DB MARKET SESSIONS:', totalDbDates);
console.log('SHEL TOTAL TRADED SESSIONS:', shelDates);
console.log('BROKER 6 ACTIVE SESSIONS (Buy or Sell):', broker6AllDays);
console.log('BROKER 6 BUY SESSIONS (buy_vol > 0):', broker6BuyDays);

const buyDates = db.prepare('SELECT trade_date, buy_vol, buy_amt, round(buy_amt*1.0/buy_vol, 2) as price FROM daily_broker_ledger WHERE symbol = ? AND broker_id = 6 AND buy_vol > 0 ORDER BY trade_date ASC').all('SHEL');
console.table(buyDates);

// Check floorsheet contracts count for SHEL and Broker 6
const contractsCount = db.prepare(`
  SELECT count(*) as total_contracts,
         sum(kitta) as total_kitta,
         min(trade_date) as start_date,
         max(trade_date) as end_date
  FROM floorsheet_contracts
  WHERE symbol = 'SHEL' AND buyer_broker = 6
`).get();
console.log('RAW FLOORSHEET CONTRACTS COUNT:', contractsCount);

const allContracts = db.prepare(`
  SELECT count(*) as total_contracts
  FROM floorsheet_contracts
  WHERE symbol = 'SHEL'
`).get();
console.log('ALL FLOORSHEET CONTRACTS ON SHEL:', allContracts);
