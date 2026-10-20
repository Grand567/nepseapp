-- migrations/003_upgrade_floorsheet_hub.sql

-- 1. Raw Floorsheet Contracts Table (Tick-by-Tick Persistence)
CREATE TABLE IF NOT EXISTS floorsheet_contracts (
  contract_no TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  trade_time TEXT,
  buyer_broker INTEGER NOT NULL,
  seller_broker INTEGER NOT NULL,
  kitta INTEGER NOT NULL,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  aggressor_side TEXT DEFAULT 'NEUTRAL', -- 'BUY', 'SELL', 'NEUTRAL'
  is_internal_cross INTEGER DEFAULT 0,   -- 1 when buyer_broker == seller_broker
  is_whale_print INTEGER DEFAULT 0       -- 1 when kitta >= 500 or amount >= 500000
);

CREATE INDEX IF NOT EXISTS idx_fs_contracts_symbol_date
  ON floorsheet_contracts (UPPER(symbol), trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_fs_contracts_date_amount
  ON floorsheet_contracts (trade_date DESC, amount DESC);

-- 2. Live/Cached L2 Market Depth Table (with off-hours persistence)
CREATE TABLE IF NOT EXISTS market_depth_cache (
  symbol TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  total_bid_kitta INTEGER DEFAULT 0,
  total_ask_kitta INTEGER DEFAULT 0,
  bids_json TEXT NOT NULL DEFAULT '[]', -- [{ price, kitta, orders }]
  asks_json TEXT NOT NULL DEFAULT '[]'  -- [{ price, kitta, orders }]
);

-- 3. View: Price-by-Volume (Volume Profile & Synthetic L2 Depth Fallback)
CREATE VIEW IF NOT EXISTS v_scrip_volume_profile_5d AS
SELECT
  UPPER(symbol) AS symbol,
  ROUND(rate, 0) AS price_bucket,
  SUM(kitta) AS total_kitta,
  SUM(CASE WHEN aggressor_side = 'BUY' THEN kitta ELSE 0 END) AS buy_aggressor_kitta,
  SUM(CASE WHEN aggressor_side = 'SELL' THEN kitta ELSE 0 END) AS sell_aggressor_kitta,
  SUM(CASE WHEN is_internal_cross = 1 THEN kitta ELSE 0 END) AS internal_cross_kitta,
  COUNT(*) AS contract_count
FROM floorsheet_contracts
WHERE trade_date IN (
  SELECT DISTINCT trade_date
  FROM floorsheet_contracts
  ORDER BY trade_date DESC
  LIMIT 5
)
GROUP BY UPPER(symbol), ROUND(rate, 0);
