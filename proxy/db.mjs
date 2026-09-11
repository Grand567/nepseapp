import pg from 'pg';
const { Pool } = pg;

let pool = null;
if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    pool.on('error', (err) => {
      console.warn('[db] PostgreSQL pool error (non-fatal):', err.message);
    });
  } catch (err) {
    console.warn('[db] Failed to create PostgreSQL pool:', err.message);
    pool = null;
  }
}

export { pool };

export const query = (text, params) => {
  if (!pool) return Promise.resolve({ rows: [] });
  return pool.query(text, params);
};

export async function initDB() {
  if (!pool) {
    console.log('[db] PostgreSQL disabled (no DATABASE_URL configured). Running proxy in lightweight memory mode.');
    return;
  }
  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    console.warn('[db] Could not connect to PostgreSQL:', connErr.message);
    return;
  }
  try {
    await client.query('BEGIN');
    
    // Security Master Directory
    await client.query(`
      CREATE TABLE IF NOT EXISTS securities (
          security_id INT PRIMARY KEY,
          symbol VARCHAR(20) UNIQUE NOT NULL,
          company_name VARCHAR(255) NOT NULL,
          sector_name VARCHAR(100) NOT NULL,
          total_listed_shares NUMERIC(18, 2),
          paid_up_value NUMERIC(10, 2) DEFAULT 100.00,
          promoter_lockin_expiry DATE,
          is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // Time-Series Daily Market Summary & OHLCV
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_price_history (
          id BIGSERIAL PRIMARY KEY,
          security_id INT REFERENCES securities(security_id),
          traded_date DATE NOT NULL,
          open_price NUMERIC(12, 2),
          high_price NUMERIC(12, 2),
          low_price NUMERIC(12, 2),
          close_price NUMERIC(12, 2),
          total_volume NUMERIC(18, 2),
          total_turnover NUMERIC(20, 2),
          total_transactions INT,
          rsi_14 NUMERIC(6, 2),
          ema_20 NUMERIC(12, 2),
          ema_50 NUMERIC(12, 2),
          ema_200 NUMERIC(12, 2),
          CONSTRAINT unique_sec_date UNIQUE(security_id, traded_date)
      );
    `);

    // Floorsheet Execution Contracts
    await client.query(`
      CREATE TABLE IF NOT EXISTS floorsheet_transactions (
          contract_id BIGINT PRIMARY KEY,
          traded_date DATE NOT NULL,
          security_id INT REFERENCES securities(security_id),
          buyer_broker INT NOT NULL,
          seller_broker INT NOT NULL,
          quantity NUMERIC(12, 2) NOT NULL,
          rate NUMERIC(12, 2) NOT NULL,
          amount NUMERIC(18, 2) NOT NULL
      );
    `);

    // Daily Broker Accumulation Aggregates
    await client.query(`
      CREATE TABLE IF NOT EXISTS broker_daily_accumulation (
          id BIGSERIAL PRIMARY KEY,
          traded_date DATE NOT NULL,
          broker_id INT NOT NULL,
          security_id INT REFERENCES securities(security_id),
          buy_quantity NUMERIC(18, 2) DEFAULT 0,
          sell_quantity NUMERIC(18, 2) DEFAULT 0,
          net_quantity NUMERIC(18, 2) DEFAULT 0,
          buy_amount NUMERIC(20, 2) DEFAULT 0,
          sell_amount NUMERIC(20, 2) DEFAULT 0,
          net_amount NUMERIC(20, 2) DEFAULT 0,
          CONSTRAINT unique_broker_sec_date UNIQUE(traded_date, broker_id, security_id)
      );
    `);

    // Primary Market & IPO Pipeline Directory
    await client.query(`
      CREATE TABLE IF NOT EXISTS ipo_pipeline (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(20),
          company_name VARCHAR(255) NOT NULL,
          sector_name VARCHAR(100) NOT NULL,
          kitta_units NUMERIC(18, 2) NOT NULL,
          total_amount_npr NUMERIC(20, 2) NOT NULL,
          application_date DATE,
          sebon_approval_date DATE,
          issue_manager VARCHAR(255) NOT NULL,
          issue_type VARCHAR(50) DEFAULT 'IPO',
          status VARCHAR(50) DEFAULT 'Under Review'
      );
    `);

    // Corporate Actions & Dividend Register
    await client.query(`
      CREATE TABLE IF NOT EXISTS corporate_dividends (
          id SERIAL PRIMARY KEY,
          security_id INT REFERENCES securities(security_id),
          fiscal_year VARCHAR(20) NOT NULL,
          bonus_share_percent NUMERIC(8, 4) DEFAULT 0.0000,
          cash_dividend_percent NUMERIC(8, 4) DEFAULT 0.0000,
          book_close_date DATE,
          announcement_date DATE
      );
    `);

    // ─────────────────────────────────────────────────────────────
    // Prediction & Scoring Engine Tables
    // ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS index_predictions (
        id                    SERIAL PRIMARY KEY,
        prediction_date       DATE NOT NULL,
        direction             VARCHAR(20) NOT NULL,
        confidence            NUMERIC(5,2) NOT NULL,
        raw_score             NUMERIC(6,3),
        contributing_factors  JSONB,
        model_version         VARCHAR(20) NOT NULL DEFAULT 'rule-v1',
        explanation           TEXT,
        actual_close          NUMERIC(10,2),
        actual_direction      VARCHAR(20),
        is_correct            BOOLEAN,
        created_at            TIMESTAMP DEFAULT NOW(),
        UNIQUE(prediction_date, model_version)
      );
      CREATE INDEX IF NOT EXISTS idx_index_predictions_date ON index_predictions(prediction_date DESC);

      CREATE TABLE IF NOT EXISTS stock_scores (
        id                    SERIAL PRIMARY KEY,
        symbol                VARCHAR(20) NOT NULL,
        score_date            DATE NOT NULL,
        ltp                   NUMERIC(10,2),
        volume_surge_ratio    NUMERIC(6,3),
        momentum_5d           NUMERIC(6,3),
        rsi_14                NUMERIC(5,2),
        macd_signal           VARCHAR(10),
        liquidity_score       NUMERIC(5,2),
        float_risk_flag       VARCHAR(20),
        obv_trend             VARCHAR(10),
        corporate_action_flag VARCHAR(30),
        composite_score       NUMERIC(5,2) NOT NULL,
        reasoning             TEXT,
        created_at            TIMESTAMP DEFAULT NOW(),
        UNIQUE(symbol, score_date)
      );
      CREATE INDEX IF NOT EXISTS idx_stock_scores_date_score ON stock_scores(score_date DESC, composite_score DESC);

      CREATE TABLE IF NOT EXISTS news_sentiment (
        id                SERIAL PRIMARY KEY,
        source            VARCHAR(50) NOT NULL,
        headline          TEXT NOT NULL,
        url               TEXT,
        published_at      TIMESTAMP,
        sentiment_score   NUMERIC(4,3),
        category          VARCHAR(30),
        related_symbols   TEXT[],
        scored_by         VARCHAR(20),
        created_at        TIMESTAMP DEFAULT NOW(),
        UNIQUE(source, headline, published_at)
      );
      CREATE INDEX IF NOT EXISTS idx_news_sentiment_published ON news_sentiment(published_at DESC);

      CREATE TABLE IF NOT EXISTS macro_indicators (
        id            SERIAL PRIMARY KEY,
        indicator     VARCHAR(40) NOT NULL,
        value         NUMERIC(10,4) NOT NULL,
        as_of_date    DATE NOT NULL,
        source        VARCHAR(50),
        created_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(indicator, as_of_date)
      );
      CREATE INDEX IF NOT EXISTS idx_macro_indicators_lookup ON macro_indicators(indicator, as_of_date DESC);

      CREATE TABLE IF NOT EXISTS political_event_flags (
        id            SERIAL PRIMARY KEY,
        event_date    DATE NOT NULL,
        severity      SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
        description   TEXT,
        created_at    TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_political_event_flags_date ON political_event_flags(event_date DESC);

      CREATE TABLE IF NOT EXISTS corporate_actions (
        id              SERIAL PRIMARY KEY,
        symbol          VARCHAR(20) NOT NULL,
        action_type     VARCHAR(20) NOT NULL,
        announced_date  DATE NOT NULL,
        details         JSONB,
        created_at      TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date ON corporate_actions(symbol, announced_date DESC);
    `);

    // Seed initial macro baseline if none exists
    await client.query(`
      INSERT INTO macro_indicators (indicator, value, as_of_date, source)
      VALUES
        ('m2_growth_pct', 12.80, CURRENT_DATE, 'NRB Monthly Bulletin'),
        ('interest_rate_pct', 5.50, CURRENT_DATE, 'NRB Policy Rate'),
        ('cpi_inflation_pct', 4.25, CURRENT_DATE, 'NRB CPI Index'),
        ('npr_usd_rate', 134.80, CURRENT_DATE, 'NRB Forex Rate'),
        ('remittance_growth_pct', 16.40, CURRENT_DATE, 'NRB External Sector Report')
      ON CONFLICT (indicator, as_of_date) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Database initialized successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database schema:', e);
  } finally {
    client.release();
  }
}
