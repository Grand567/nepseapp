import { db } from '../proxy/db/ledgerStore.js';

const validSymbol = 'SHIVM';
const candleTable = 'daily_stock_summary';
const cols = new Set(db.prepare(`PRAGMA table_info(${candleTable})`).all().map(c => c.name));

const dateCol = cols.has('trade_date') ? 'trade_date' : 'date';
const openCol = cols.has('open_price') ? 'open_price' : 'open';
const highCol = cols.has('high_price') ? 'high_price' : 'high';
const lowCol = cols.has('low_price') ? 'low_price' : 'low';
const closeCol = cols.has('close_price') ? 'close_price' : 'close';
const volCol = cols.has('total_volume') ? 'total_volume' : 'volume';
const toCol = cols.has('total_turnover') ? 'total_turnover' : 'turnover';

const query = `
  SELECT
    ${dateCol} AS date,
    ${openCol} AS open,
    ${highCol} AS high,
    ${lowCol} AS low,
    ${closeCol} AS close,
    ${volCol} AS volume,
    CASE
      WHEN ${volCol} > 0 THEN (${toCol} / ${volCol})
      ELSE ${closeCol}
    END AS vwap
  FROM ${candleTable}
  WHERE UPPER(symbol) = ?
  ORDER BY ${dateCol} DESC
  LIMIT 60
`;

const rows = db.prepare(query).all(validSymbol);
console.log('Successfully fetched candles count:', rows.length);
console.log('Latest 3 candles for SHIVM:', rows.slice(0, 3));
