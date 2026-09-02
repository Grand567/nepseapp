import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nepse'
});

export const query = (text, params) => pool.query(text, params);

export async function initDB() {
  const client = await pool.connect();
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

    await client.query('COMMIT');
    console.log('Database initialized successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database schema:', e);
  } finally {
    client.release();
  }
}
