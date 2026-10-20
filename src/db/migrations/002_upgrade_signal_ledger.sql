-- File: src/db/migrations/002_upgrade_signal_ledger.sql

CREATE TABLE IF NOT EXISTS algorithmic_signal_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id TEXT UNIQUE NOT NULL,           -- e.g., 'NABIL_2026-09-02_STEALTH_ACCUMULATION'
    symbol TEXT NOT NULL,
    sector TEXT NOT NULL DEFAULT 'OTHERS',
    strategy TEXT NOT NULL,                   -- 'EARLY_IGNITION_3D' | 'STEALTH_ACCUMULATION'
    
    -- Day T Trigger Telemetry
    signal_date TEXT NOT NULL,                -- YYYY-MM-DD (Day T)
    trigger_ltp REAL NOT NULL,                -- Day T 3:00 PM Close
    initial_risk_pct REAL NOT NULL,           -- Planned stop distance (%)
    reward_multiple REAL NOT NULL DEFAULT 2.2,-- Planned R-multiple
    
    -- Day T+1 Realistic Execution Telemetry
    entry_date TEXT,                          -- YYYY-MM-DD (Day T+1)
    entry_vwap REAL,                          -- Audited Day T+1 VWAP fill price
    entry_turnover_npr REAL DEFAULT 0,        -- Day T+1 total scrip turnover
    target_price REAL,
    initial_stop_price REAL,
    active_stop_price REAL,                   -- Dynamically ratcheted stop price
    is_ratchet_armed INTEGER DEFAULT 0,       -- 1 once +1.2R MFE is achieved
    
    -- T+2 Settlement & Resolution Telemetry
    settlement_unlock_date TEXT,              -- First date shares are tradable in EDIS/TMS
    status TEXT NOT NULL DEFAULT 'ACTIVE',    -- 'ACTIVE' | 'TARGET_HIT' | 'RATCHET_STOP_WIN' | 'TIME_STOP_STALE' | 'STOP_LOSS' | 'UNFILLABLE_SKIP'
    exit_date TEXT,
    exit_price REAL,
    holding_days INTEGER DEFAULT 0,
    
    -- Excursion & Alpha Metrics
    mfe_pct REAL DEFAULT 0,                   -- Max Favorable Excursion (%) after T+2 unlock
    mae_pct REAL DEFAULT 0,                   -- Max Adverse Excursion (%) from entry
    gross_return_pct REAL DEFAULT 0,
    net_return_pct REAL DEFAULT 0,            -- After SEBON, Broker Tier, DP (Rs 50), and 7.5% CGT
    nepse_index_return_pct REAL DEFAULT 0,    -- Benchmark return over exact same holding window
    nepse_alpha_pct REAL DEFAULT 0,           -- net_return_pct - nepse_index_return_pct
    
    -- Smart Money & Regime Telemetry
    primary_broker_id INTEGER,
    broker_anomaly_score REAL DEFAULT 0,      -- Normalized vs 30D broker market share
    avg_ticket_kitta REAL DEFAULT 0,          -- Buy Volume / Buy Transactions (filters retail herd)
    market_regime TEXT DEFAULT 'SIDEWAYS',    -- 'BULL' | 'SIDEWAYS' | 'BEAR' | 'QUARTER_END_PRESSURE'
    corporate_action_adjusted INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_symbol_date ON algorithmic_signal_ledger(symbol, signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_status_strategy ON algorithmic_signal_ledger(status, strategy);
CREATE INDEX IF NOT EXISTS idx_ledger_broker ON algorithmic_signal_ledger(primary_broker_id);

-- Institutional Strategy Scorecard View
CREATE VIEW IF NOT EXISTS v_strategy_institutional_metrics AS
SELECT
    strategy,
    COUNT(*) FILTER (WHERE status != 'UNFILLABLE_SKIP') AS total_tradable_signals,
    COUNT(*) FILTER (WHERE status = 'UNFILLABLE_SKIP') AS skipped_circuit_traps,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status IN ('TARGET_HIT', 'RATCHET_STOP_WIN', 'WIN_T1', 'WIN_T2', 'WIN_RATCHET_STOP') OR (status != 'UNFILLABLE_SKIP' AND net_return_pct > 0))
        / NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN_ACTIVE', 'UNFILLABLE_SKIP')), 0),
        2
    ) AS verified_win_rate_pct,
    ROUND(AVG(net_return_pct) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN_ACTIVE', 'UNFILLABLE_SKIP')), 2) AS net_expectancy_pct,
    ROUND(AVG(nepse_alpha_pct) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN_ACTIVE', 'UNFILLABLE_SKIP')), 2) AS avg_nepse_alpha_pct,
    ROUND(
        SUM( CASE WHEN net_return_pct > 0 THEN net_return_pct ELSE 0 END )
        / NULLIF(ABS(SUM( CASE WHEN net_return_pct < 0 THEN net_return_pct ELSE 0 END )), 0),
        2
    ) AS profit_factor,
    ROUND(AVG(mfe_pct) FILTER (WHERE status NOT IN ('UNFILLABLE_SKIP')), 2) AS avg_mfe_pct,
    ROUND(AVG(mae_pct) FILTER (WHERE status NOT IN ('UNFILLABLE_SKIP')), 2) AS avg_mae_pct,
    ROUND(AVG(holding_days) FILTER (WHERE status NOT IN ('ACTIVE', 'OPEN_ACTIVE', 'UNFILLABLE_SKIP')), 1) AS avg_holding_days
FROM algorithmic_signal_ledger
GROUP BY strategy;
