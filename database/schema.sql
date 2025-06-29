-- Code Quality Orchestrator Database Schema
-- SQLite schema for efficient violation tracking, rule scheduling, and historical analysis

-- Main violations table - stores current state of all violations
CREATE TABLE violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    category TEXT NOT NULL,  -- e.g., 'record-type', 'code-quality', 'type-alias'
    severity TEXT NOT NULL,  -- 'error', 'warn', 'info'
    source TEXT NOT NULL,    -- 'typescript', 'eslint'
    message TEXT NOT NULL,
    line_number INTEGER,
    column_number INTEGER,
    code_snippet TEXT,       -- Optional code context
    hash TEXT NOT NULL UNIQUE, -- SHA-256 hash for deduplication: hash(file_path + line + rule_id + message)
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored'))
);

-- Rule execution tracking - stores each time a rule is checked
CREATE TABLE rule_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL,
    engine TEXT NOT NULL,    -- 'typescript', 'eslint'
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'timeout')),
    violations_found INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    error_message TEXT,      -- If status is 'failed'
    files_checked INTEGER DEFAULT 0,
    files_with_violations INTEGER DEFAULT 0
);

-- Historical tracking for violation deltas over time
CREATE TABLE violation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id INTEGER NOT NULL REFERENCES rule_checks(id) ON DELETE CASCADE,
    violation_hash TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('added', 'removed', 'modified', 'unchanged')),
    previous_line INTEGER,   -- For 'modified' actions
    previous_message TEXT,   -- For 'modified' actions
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rule scheduling and round-robin state management
CREATE TABLE rule_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL,
    engine TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1,          -- Lower number = higher priority
    check_frequency_ms INTEGER DEFAULT 30000, -- How often to check this rule
    last_run_at DATETIME,
    next_run_at DATETIME,
    consecutive_zero_count INTEGER DEFAULT 0, -- For adaptive polling
    avg_execution_time_ms INTEGER DEFAULT 0,
    avg_violations_found REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rule_id, engine)
);

-- Session tracking for watch mode analytics
CREATE TABLE watch_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_end DATETIME,
    total_checks INTEGER DEFAULT 0,
    total_violations_start INTEGER DEFAULT 0,
    total_violations_end INTEGER DEFAULT 0,
    configuration JSON,      -- Store watch mode config as JSON
    user_agent TEXT          -- For future multi-user support
);

-- Performance metrics for optimization
CREATE TABLE performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL, -- 'analysis_time', 'db_query_time', 'memory_usage'
    metric_value REAL NOT NULL,
    metric_unit TEXT NOT NULL, -- 'ms', 'mb', 'count'
    context TEXT,              -- Additional context (rule_id, operation type, etc.)
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES for performance optimization
-- ============================================================================

-- Primary lookup indexes
CREATE INDEX idx_violations_file_path ON violations(file_path);
CREATE INDEX idx_violations_rule_id ON violations(rule_id);
CREATE INDEX idx_violations_hash ON violations(hash);
CREATE INDEX idx_violations_status ON violations(status);
CREATE INDEX idx_violations_last_seen ON violations(last_seen_at);

-- Composite indexes for common queries
CREATE INDEX idx_violations_active_by_category ON violations(category, severity) WHERE status = 'active';
CREATE INDEX idx_violations_active_by_source ON violations(source, category) WHERE status = 'active';
CREATE INDEX idx_violations_file_rule ON violations(file_path, rule_id);

-- Rule check indexes
CREATE INDEX idx_rule_checks_rule_id ON rule_checks(rule_id);
CREATE INDEX idx_rule_checks_started_at ON rule_checks(started_at);
CREATE INDEX idx_rule_checks_status ON rule_checks(status);
CREATE INDEX idx_rule_checks_engine ON rule_checks(engine);

-- History tracking indexes
CREATE INDEX idx_violation_history_check_id ON violation_history(check_id);
CREATE INDEX idx_violation_history_hash ON violation_history(violation_hash);
CREATE INDEX idx_violation_history_action ON violation_history(action);
CREATE INDEX idx_violation_history_recorded_at ON violation_history(recorded_at);

-- Scheduling indexes
CREATE INDEX idx_rule_schedules_next_run ON rule_schedules(next_run_at) WHERE enabled = true;
CREATE INDEX idx_rule_schedules_engine ON rule_schedules(engine);
CREATE INDEX idx_rule_schedules_priority ON rule_schedules(priority, next_run_at);

-- Session tracking indexes
CREATE INDEX idx_watch_sessions_start ON watch_sessions(session_start);
CREATE INDEX idx_performance_metrics_type ON performance_metrics(metric_type, recorded_at);

-- ============================================================================
-- TRIGGERS for automatic maintenance
-- ============================================================================

-- Update last_seen_at when violation is found again
CREATE TRIGGER update_violation_last_seen
    AFTER UPDATE ON violations
    WHEN NEW.status = 'active' AND OLD.status = 'active'
BEGIN
    UPDATE violations 
    SET last_seen_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;

-- Update rule schedule statistics after rule check completion
CREATE TRIGGER update_rule_stats
    AFTER UPDATE ON rule_checks
    WHEN NEW.status = 'completed' AND OLD.status = 'running'
BEGIN
    UPDATE rule_schedules 
    SET 
        last_run_at = NEW.completed_at,
        avg_execution_time_ms = (
            COALESCE(avg_execution_time_ms, 0) * 0.8 + NEW.execution_time_ms * 0.2
        ),
        avg_violations_found = (
            COALESCE(avg_violations_found, 0) * 0.8 + NEW.violations_found * 0.2
        ),
        consecutive_zero_count = CASE 
            WHEN NEW.violations_found = 0 THEN consecutive_zero_count + 1 
            ELSE 0 
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE rule_id = NEW.rule_id AND engine = NEW.engine;
END;

-- Automatically calculate next run time based on adaptive polling
CREATE TRIGGER calculate_next_run
    AFTER UPDATE ON rule_schedules
    WHEN NEW.last_run_at IS NOT NULL
BEGIN
    UPDATE rule_schedules 
    SET next_run_at = datetime(
        NEW.last_run_at, 
        '+' || (
            CASE 
                -- If rule consistently finds violations, check more frequently
                WHEN NEW.avg_violations_found > 5 THEN NEW.check_frequency_ms / 2
                -- If rule has been zero for a while, check less frequently  
                WHEN NEW.consecutive_zero_count > 5 THEN NEW.check_frequency_ms * 3
                -- Standard frequency
                ELSE NEW.check_frequency_ms
            END / 1000
        ) || ' seconds'
    )
    WHERE id = NEW.id;
END;

-- ============================================================================
-- VIEWS for common queries
-- ============================================================================

-- Current violation summary by category
CREATE VIEW violation_summary AS
SELECT 
    category,
    source,
    severity,
    COUNT(*) as count,
    COUNT(DISTINCT file_path) as affected_files,
    MIN(first_seen_at) as first_occurrence,
    MAX(last_seen_at) as last_occurrence
FROM violations 
WHERE status = 'active'
GROUP BY category, source, severity
ORDER BY count DESC;

-- Rule performance overview
CREATE VIEW rule_performance AS
SELECT 
    rs.rule_id,
    rs.engine,
    rs.enabled,
    rs.avg_execution_time_ms,
    rs.avg_violations_found,
    rs.consecutive_zero_count,
    rs.last_run_at,
    rs.next_run_at,
    COUNT(rc.id) as total_runs,
    COUNT(CASE WHEN rc.status = 'completed' THEN 1 END) as successful_runs,
    COUNT(CASE WHEN rc.status = 'failed' THEN 1 END) as failed_runs
FROM rule_schedules rs
LEFT JOIN rule_checks rc ON rs.rule_id = rc.rule_id AND rs.engine = rc.engine
GROUP BY rs.rule_id, rs.engine
ORDER BY rs.priority ASC, rs.avg_violations_found DESC;

-- Watch session analytics
CREATE VIEW session_analytics AS
SELECT 
    DATE(session_start) as session_date,
    COUNT(*) as sessions_count,
    AVG(total_checks) as avg_checks_per_session,
    AVG(total_violations_end - total_violations_start) as avg_violation_delta,
    AVG((julianday(session_end) - julianday(session_start)) * 24 * 60) as avg_duration_minutes
FROM watch_sessions
WHERE session_end IS NOT NULL
GROUP BY DATE(session_start)
ORDER BY session_date DESC;