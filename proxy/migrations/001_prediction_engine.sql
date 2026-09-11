-- Migration: Prediction & Scoring Engine tables for Drabyashree NEPSE
-- Run against the existing PostgreSQL DB used by proxy/db.mjs
-- Safe to run multiple times (IF NOT EXISTS guards included)

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Index direction predictions (NEPSE index: up / down / consolidate)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS index_predictions (
  id                    SERIAL PRIMARY KEY,
  prediction_date       DATE NOT NULL,
  direction             VARCHAR(20) NOT NULL,        -- 'up' | 'down' | 'consolidate'
  confidence            NUMERIC(5,2) NOT NULL,        -- 0-100
  raw_score             NUMERIC(6,3),                 -- underlying weighted score before thresholding
  contributing_factors  JSONB,                        -- e.g. {"technical":0.6,"sentiment":0.3,"macro":0.1}
  model_version         VARCHAR(20) NOT NULL DEFAULT 'rule-v1',
  explanation           TEXT,                         -- AI-waterfall generated plain-language blurb
  actual_close          NUMERIC(10,2),                -- filled in end-of-day next run
  actual_direction      VARCHAR(20),                  -- filled in for backtesting accuracy stats
  is_correct            BOOLEAN,                       -- derived once actual_direction is known
  created_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(prediction_date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_index_predictions_date ON index_predictions(prediction_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. Per-stock daily composite scores (momentum / liquidity screener)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_scores (
  id                    SERIAL PRIMARY KEY,
  symbol                VARCHAR(20) NOT NULL,
  score_date            DATE NOT NULL,
  ltp                   NUMERIC(10,2),
  volume_surge_ratio    NUMERIC(6,3),                 -- today's volume / 20d avg volume
  momentum_5d           NUMERIC(6,3),                 -- % change over 5 sessions
  rsi_14                NUMERIC(5,2),
  macd_signal           VARCHAR(10),                  -- 'bullish' | 'bearish' | 'neutral'
  liquidity_score       NUMERIC(5,2),                 -- 0-100, based on avg turnover + spread
  float_risk_flag       VARCHAR(20),                  -- 'low_float' | 'illiquid' | 'normal'
  obv_trend             VARCHAR(10),                  -- 'rising' | 'falling' | 'flat'
  corporate_action_flag VARCHAR(30),                  -- 'bonus_or_rights_announced' | 'dividend_announced' | null
  composite_score       NUMERIC(5,2) NOT NULL,        -- 0-100 final ranking score
  reasoning             TEXT,                         -- AI-generated short rationale
  created_at            TIMESTAMP DEFAULT NOW(),
  UNIQUE(symbol, score_date)
);

CREATE INDEX IF NOT EXISTS idx_stock_scores_date_score
  ON stock_scores(score_date DESC, composite_score DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. News sentiment (scraped headlines scored via AI waterfall)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_sentiment (
  id                SERIAL PRIMARY KEY,
  source            VARCHAR(50) NOT NULL,             -- 'sharesansar' | 'merolagani' | 'nepalipaisa'
  headline          TEXT NOT NULL,
  url               TEXT,
  published_at      TIMESTAMP,
  sentiment_score   NUMERIC(4,3),                     -- -1.000 (very negative) .. 1.000 (very positive)
  category          VARCHAR(30),                      -- 'nrb_policy' | 'earnings' | 'political' | 'ipo' | 'general'
  related_symbols   TEXT[],                            -- e.g. {'NABIL','NICA'}
  scored_by         VARCHAR(20),                       -- which AI model in the waterfall scored it
  created_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE(source, headline, published_at)
);

CREATE INDEX IF NOT EXISTS idx_news_sentiment_published ON news_sentiment(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_symbols ON news_sentiment USING GIN(related_symbols);

-- ─────────────────────────────────────────────────────────────
-- 4. Macro indicators (NRB releases — monthly/quarterly, not daily)
--    Populate via periodic scrape or a lightweight admin-entry screen.
--    Money supply (M2) has the strongest documented NEPSE correlation
--    per NRB's own analysis; interest rate / inflation are weaker.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS macro_indicators (
  id            SERIAL PRIMARY KEY,
  indicator     VARCHAR(40) NOT NULL,   -- 'm2_growth_pct' | 'interest_rate_pct' | 'cpi_inflation_pct'
                                          -- | 'npr_usd_rate' | 'remittance_growth_pct'
  value         NUMERIC(10,4) NOT NULL,
  as_of_date    DATE NOT NULL,
  source        VARCHAR(50),             -- e.g. 'NRB monthly bulletin'
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(indicator, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_macro_indicators_lookup ON macro_indicators(indicator, as_of_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 5. Political / event flags (unscheduled — court rulings, elections,
--    protests, major regulatory shocks). Intended as a simple admin
--    toggle rather than fully automated detection.
--    Precedent: Jan 2023 court ruling (~4.1% NEPSE drop over days);
--    2025/26 Gen-Z protests + general election (sharp fall + rebound).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS political_event_flags (
  id            SERIAL PRIMARY KEY,
  event_date    DATE NOT NULL,
  severity      SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  description   TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_political_event_flags_date ON political_event_flags(event_date DESC);

-- ─────────────────────────────────────────────────────────────
-- 6. Corporate actions (bonus/rights/dividend announcements) — used
--    by the stock screener's catalyst flag. Populate from the
--    ShareSansar/MeroLagani scrapers already in use for dividend/
--    bonus/right issue histories.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS corporate_actions (
  id              SERIAL PRIMARY KEY,
  symbol          VARCHAR(20) NOT NULL,
  action_type     VARCHAR(20) NOT NULL,  -- 'bonus' | 'rights' | 'dividend' | 'agm' | 'other'
  announced_date  DATE NOT NULL,
  details         JSONB,                  -- e.g. {"ratio": "10:1", "percentage": 10}
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date
  ON corporate_actions(symbol, announced_date DESC);

COMMIT;
