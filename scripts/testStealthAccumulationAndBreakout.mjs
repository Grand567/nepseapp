import { db } from '../proxy/db/ledgerStore.js';

async function main() {
  const dates = db.prepare('SELECT DISTINCT trade_date FROM daily_broker_ledger ORDER BY trade_date DESC LIMIT 5').all().map(d => d.trade_date);
  console.log('5 recent sessions:', dates);
  const minDate = dates[dates.length - 1];
  const maxDate = dates[0];
  
  const query = `
    WITH b58_window AS (
      SELECT 
        symbol,
        COUNT(DISTINCT trade_date) as active_days,
        SUM(buy_vol) as total_buy_vol,
        SUM(sell_vol) as total_sell_vol,
        SUM(buy_vol - sell_vol) as net_buy_vol,
        SUM(buy_amt) as total_buy_amt,
        ROUND(CAST(SUM(buy_vol) AS REAL) / MAX(1, SUM(buy_vol + sell_vol)) * 100, 1) as window_buy_ratio,
        ROUND(SUM(buy_amt) / MAX(1, SUM(buy_vol)), 1) as window_vwap
      FROM daily_broker_ledger
      WHERE broker_id = 58 AND trade_date >= ? AND trade_date <= ?
      GROUP BY symbol
      HAVING active_days >= 2 AND net_buy_vol >= 10000 AND window_buy_ratio >= 60
    ),
    mkt_window AS (
      SELECT 
        symbol,
        SUM(total_volume) as mkt_total_vol,
        MIN(low_price) as min_low,
        MAX(high_price) as max_high,
        (SELECT close_price FROM daily_stock_summary s2 WHERE s2.symbol = daily_stock_summary.symbol AND s2.trade_date = ? LIMIT 1) as ltp,
        (SELECT open_price FROM daily_stock_summary s3 WHERE s3.symbol = daily_stock_summary.symbol AND s3.trade_date = ? LIMIT 1) as open_p
      FROM daily_stock_summary
      WHERE trade_date >= ? AND trade_date <= ?
      GROUP BY symbol
    ),
    b58_today AS (
      SELECT symbol, buy_vol as today_buy_vol, sell_vol as today_sell_vol, 
             (buy_vol - sell_vol) as today_net_vol,
             buy_amt as today_buy_amt,
             ROUND(CAST(buy_vol AS REAL) / MAX(1, buy_vol + sell_vol) * 100, 1) as today_buy_ratio
      FROM daily_broker_ledger
      WHERE broker_id = 58 AND trade_date = ?
    )
    SELECT 
      b.symbol, b.active_days, b.total_buy_vol, b.net_buy_vol, b.total_buy_amt, b.window_buy_ratio, b.window_vwap,
      m.mkt_total_vol,
      ROUND(CAST(b.total_buy_vol AS REAL) / MAX(1, m.mkt_total_vol) * 100, 1) as mkt_share_pct,
      m.min_low, m.max_high, m.ltp,
      ROUND((m.max_high - m.min_low) / MAX(1, m.min_low) * 100, 1) as range_volatility_pct,
      ROUND((m.ltp - b.window_vwap) / MAX(1, b.window_vwap) * 100, 1) as dist_from_vwap_pct,
      t.today_buy_vol, t.today_net_vol, t.today_buy_ratio
    FROM b58_window b
    JOIN mkt_window m ON b.symbol = m.symbol
    LEFT JOIN b58_today t ON b.symbol = t.symbol
    WHERE m.ltp > 0
      AND b.window_buy_ratio >= 65
      AND (CAST(b.total_buy_vol AS REAL) / MAX(1, m.mkt_total_vol) >= 0.12 OR b.net_buy_vol >= 30000)
      AND (m.ltp - b.window_vwap) / b.window_vwap BETWEEN -0.05 AND 0.08
    ORDER BY b.net_buy_vol DESC
    LIMIT 10;
  `;

  const results = db.prepare(query).all(minDate, maxDate, maxDate, maxDate, minDate, maxDate, maxDate);
  console.log('Top multi-day b58 stealth setups:');
  console.dir(results, { depth: null });
}

main().catch(console.error);
