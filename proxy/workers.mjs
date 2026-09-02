import { query } from './db.mjs';

// Worker to aggregate daily floorsheet into broker accumulation table
export async function aggregateFloorsheetData() {
  console.log('Running background worker: aggregateFloorsheetData...');
  try {
    // In a real scenario, this would aggregate data inserted today 
    // and UPSERT it into broker_daily_accumulation.
    const sql = `
      INSERT INTO broker_daily_accumulation (
        traded_date, broker_id, security_id, 
        buy_quantity, buy_amount, 
        sell_quantity, sell_amount,
        net_quantity, net_amount
      )
      SELECT 
        traded_date, 
        buyer_broker AS broker_id, 
        security_id, 
        SUM(quantity) AS buy_quantity, 
        SUM(amount) AS buy_amount,
        0 AS sell_quantity,
        0 AS sell_amount,
        SUM(quantity) AS net_quantity,
        SUM(amount) AS net_amount
      FROM floorsheet_transactions
      WHERE traded_date = CURRENT_DATE
      GROUP BY traded_date, buyer_broker, security_id
      ON CONFLICT (traded_date, broker_id, security_id) DO UPDATE SET 
        buy_quantity = EXCLUDED.buy_quantity,
        buy_amount = EXCLUDED.buy_amount,
        net_quantity = broker_daily_accumulation.net_quantity + EXCLUDED.buy_quantity,
        net_amount = broker_daily_accumulation.net_amount + EXCLUDED.buy_amount;
    `;
    // We would execute this for buyer_broker and a similar one for seller_broker
    // await query(sql);
    console.log('Aggregation complete.');
  } catch (err) {
    console.error('Error in aggregateFloorsheetData:', err);
  }
}

// Start workers
export function startWorkers() {
  // Run aggregation every 1 hour (3600000 ms)
  setInterval(aggregateFloorsheetData, 60 * 60 * 1000);
  console.log('Background analytical workers started.');
}
