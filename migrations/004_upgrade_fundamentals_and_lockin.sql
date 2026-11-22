-- migrations/004_upgrade_fundamentals_and_lockin.sql

-- 1. Scrip Fundamentals & NRB Prudential Telemetry
CREATE TABLE IF NOT EXISTS scrip_fundamentals (
  symbol TEXT PRIMARY KEY,
  sector TEXT NOT NULL DEFAULT 'Others',
  fiscal_quarter TEXT DEFAULT NULL,
  paid_up_capital REAL DEFAULT NULL,          -- In NPR
  public_float_kitta INTEGER DEFAULT NULL,
  promoter_share_pct REAL DEFAULT NULL,
  public_share_pct REAL DEFAULT NULL,
  eps_ttm REAL DEFAULT NULL,                  -- Annualized / TTM EPS
  book_value_per_share REAL DEFAULT NULL,   -- Net Worth per Share (NWPS)
  roe_pct REAL DEFAULT NULL,                  -- Return on Equity %
  npl_pct REAL DEFAULT NULL,               -- Non-Performing Loan % (BFIs / Microfinance)
  car_pct REAL DEFAULT NULL,               -- Capital Adequacy Ratio % (BFIs)
  distributable_eps REAL DEFAULT NULL,     -- Post-regulatory reserve distributable EPS
  promoter_unlock_date TEXT DEFAULT NULL,  -- ISO Date YYYY-MM-DD for 3-year IPO lock-in expiry
  promoter_locked_kitta INTEGER DEFAULT NULL,
  release_date TEXT DEFAULT NULL,          -- Official quarterly filing publication date (YYYY-MM-DD)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Corporate Actions & Dividend Ledger
CREATE TABLE IF NOT EXISTS scrip_corporate_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,               -- e.g., '2081/82'
  bonus_share_pct REAL DEFAULT 0,
  cash_dividend_pct REAL DEFAULT 0,
  total_dividend_pct REAL DEFAULT 0,
  right_share_ratio TEXT DEFAULT NULL,     -- e.g., '10:3'
  book_close_date TEXT DEFAULT NULL,
  status TEXT DEFAULT 'APPROVED',          -- 'PROPOSED', 'APPROVED', 'DISTRIBUTED'
  UNIQUE (symbol, fiscal_year, book_close_date)
);

CREATE INDEX IF NOT EXISTS idx_corp_actions_symbol
  ON scrip_corporate_actions (UPPER(symbol), book_close_date DESC);

CREATE INDEX IF NOT EXISTS idx_scrip_fundamentals_release
  ON scrip_fundamentals (UPPER(symbol), release_date DESC);
