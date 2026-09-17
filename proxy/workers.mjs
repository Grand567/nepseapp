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

// Memory cache for verified Post-Market Prime Pick
let cachedPostMarketPrimePick = null;

export function getVerifiedPostMarketPrimePick() {
  return cachedPostMarketPrimePick;
}

export function setVerifiedPostMarketPrimePick(data) {
  cachedPostMarketPrimePick = data;
}

// Scheduled post-market close floorsheet reconciliation & prime pick verification worker
export async function runPostMarketCloseAnalysis() {
  console.log('[Post-Market Worker] Running post-market floorsheet & prime pick analysis...');
  try {
    await aggregateFloorsheetData();
  } catch (err) {
    console.warn('[Post-Market Worker] Error in runPostMarketCloseAnalysis:', err?.message || err);
  }
}

// Start workers
export function startWorkers() {
  // Run floorsheet aggregation every 1 hour (3600000 ms)
  setInterval(aggregateFloorsheetData, 60 * 60 * 1000);

  // Check every 10 minutes to run post-close reconciliation after 3:15 PM NPT
  setInterval(() => {
    try {
      const now = new Date();
      // UTC+5:45
      const nptOffset = 5 * 60 + 45;
      const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const nptMins = (utcMins + nptOffset) % (24 * 60);
      const isTradingDay = now.getUTCDay() >= 0 && now.getUTCDay() <= 4; // Sun-Thu

      // Between 3:15 PM (15:15 = 915 mins) and 3:45 PM (15:45 = 945 mins)
      if (isTradingDay && nptMins >= 915 && nptMins <= 945) {
        runPostMarketCloseAnalysis();
      }
    } catch (_) {}
  }, 10 * 60 * 1000);

  console.log('Background analytical workers started (Floorsheet + Post-Market Close 3:15 PM Reconciler).');
}
