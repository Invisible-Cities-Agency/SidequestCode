/**
 * Database connection and initialization for Code Quality Orchestrator
 * Handles SQLite setup, migrations, and Kysely configuration
 */

import {
  Kysely,
  SqliteDialect,
  FileMigrationProvider,
  Migrator,
  sql,
} from "kysely";
import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DatabaseSchema, DatabaseConfig } from "./types.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Database Connection Management
// ============================================================================

export class DatabaseConnection {
  private static instance: Kysely<DatabaseSchema> | undefined = undefined;
  private static config: DatabaseConfig | undefined = undefined;
  private static sqliteDatabase: Database.Database | undefined = undefined;

  /**
   * Initialize database connection with configuration
   */
  static async initialize(
    config: DatabaseConfig,
  ): Promise<Kysely<DatabaseSchema>> {
    if (this.instance) {
      return this.instance;
    }

    this.config = config;

    // Ensure database directory exists
    const databaseDirectory = path.dirname(config.path);
    await fs.mkdir(databaseDirectory, { recursive: true });

    // Create SQLite database instance
    const database = new Database(config.path);
    this.sqliteDatabase = database;

    // Configure SQLite pragmas for performance
    const defaultPragmas = {
      journal_mode: "WAL", // Write-Ahead Logging for better concurrency
      synchronous: "NORMAL", // Good balance of safety and performance
      cache_size: -64_000, // 64MB cache
      foreign_keys: "ON", // Enable foreign key constraints
      temp_store: "memory", // Store temp tables in memory
      mmap_size: 134_217_728, // 128MB memory map
      ...config.pragmas,
    };

    // Apply pragmas
    for (const [key, value] of Object.entries(defaultPragmas)) {
      database.pragma(`${key} = ${value}`);
    }

    // Create Kysely instance
    this.instance = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({
        database,
      }),
    });

    console.log(`[Database] Connected to SQLite database: ${config.path}`);

    // Run migrations if enabled
    await (config.migrations?.enabled
      ? this.runMigrations()
      : this.initializeSchema());

    return this.instance;
  }

  /**
   * Get existing database connection
   */
  static getInstance(): Kysely<DatabaseSchema> {
    if (!this.instance) {
      throw new Error(
        "Database not initialized. Call DatabaseConnection.initialize() first.",
      );
    }
    return this.instance;
  }

  /**
   * Close database connection
   */
  static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.destroy();
      this.instance = undefined;
      this.config = undefined;
      console.log("[Database] Connection closed");
    }
  }

  /**
   * Run database migrations
   */
  private static async runMigrations(): Promise<void> {
    if (!this.instance || !this.config?.migrations?.path) {
      throw new Error("Database or migration path not configured");
    }

    const migrationProvider = new FileMigrationProvider({
      fs: await import("node:fs/promises"),
      path: await import("node:path"),
      migrationFolder: this.config.migrations.path,
    });

    const migrator = new Migrator({
      db: this.instance,
      provider: migrationProvider,
    });

    const { error, results } = await migrator.migrateToLatest();

    if (error) {
      console.error("[Database] Migration failed:", error);
      throw error;
    }

    if (results) {
      results.forEach((result) => {
        if (result.status === "Success") {
          console.log(
            `[Database] Migration "${result.migrationName}" executed successfully`,
          );
        } else {
          console.error(
            `[Database] Migration "${result.migrationName}" failed with status:`,
            result.status,
          );
        }
      });
    }

    console.log("[Database] All migrations completed");
  }

  /**
   * Initialize schema directly (when migrations are disabled)
   */
  private static async initializeSchema(): Promise<void> {
    if (!this.instance) {
      throw new Error("Database not initialized");
    }

    try {
      if (!this.sqliteDatabase) {
        throw new Error("SQLite database instance not available");
      }

      // Check if schema is already initialized
      const tablesExist = this.sqliteDatabase
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='violations'",
        )
        .get() as { count: number };

      if (tablesExist.count > 0) {
        console.log(
          "[Database] Schema already exists, skipping initialization",
        );
        return;
      }

      console.log("[Database] Creating schema from inline SQL...");

      // Inline schema definition - self-contained, no external files needed
      const schemaSQL = `
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

        -- Client TypeScript configuration cache
        CREATE TABLE typescript_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_path TEXT NOT NULL,
            config_path TEXT NOT NULL UNIQUE,
            strict_mode BOOLEAN DEFAULT FALSE,
            exact_optional_properties BOOLEAN DEFAULT FALSE,
            no_unchecked_indexed_access BOOLEAN DEFAULT FALSE,
            no_implicit_any BOOLEAN DEFAULT FALSE,
            target TEXT DEFAULT 'ES5',
            module_system TEXT DEFAULT 'CommonJS',
            config_hash TEXT NOT NULL,
            first_scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_modified_at DATETIME
        );

        -- Rule scheduling and round-robin state management
        CREATE TABLE rule_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id TEXT NOT NULL,
            engine TEXT NOT NULL,
            enabled BOOLEAN DEFAULT true,
            priority INTEGER DEFAULT 1,
            check_frequency_ms INTEGER DEFAULT 30000,
            last_run_at DATETIME,
            next_run_at DATETIME,
            consecutive_zero_count INTEGER DEFAULT 0,
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
            configuration JSON,
            user_agent TEXT
        );

        -- Performance metrics for optimization
        CREATE TABLE performance_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric_type TEXT NOT NULL,
            metric_value REAL NOT NULL,
            metric_unit TEXT NOT NULL,
            context TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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

        -- Index for fast config lookups
        CREATE INDEX idx_typescript_configs_path ON typescript_configs(project_path, config_path);

        -- Triggers for automatic maintenance
        CREATE TRIGGER update_violation_last_seen
            AFTER UPDATE ON violations
            WHEN NEW.status = 'active' AND OLD.status = 'active'
        BEGIN
            UPDATE violations 
            SET last_seen_at = CURRENT_TIMESTAMP 
            WHERE id = NEW.id;
        END;

        -- Views for common queries
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
      `;

      // Use better-sqlite3's exec method which can handle multiple statements
      this.sqliteDatabase.exec(schemaSQL);

      console.log("[Database] Schema initialized successfully");
    } catch (error) {
      console.error("[Database] Schema initialization failed:", error);
      throw error;
    }
  }

  /**
   * Health check - verify database is accessible and properly initialized
   */
  static async healthCheck(): Promise<boolean> {
    try {
      if (!this.instance) {
        return false;
      }

      // Test basic query
      await this.instance
        .selectFrom("violations")
        .select("id")
        .limit(1)
        .execute();

      return true;
    } catch (error) {
      console.error("[Database] Health check failed:", error);
      return false;
    }
  }

  /**
   * Get database statistics for monitoring
   */
  static async getStats(): Promise<{
    violations_count: number;
    rule_checks_count: number;
    database_size_mb: number;
    wal_size_mb: number;
  }> {
    if (!this.instance || !this.config) {
      throw new Error("Database not initialized");
    }

    const database = this.instance;

    // Get table counts
    const [violationsResult, ruleChecksResult] = await Promise.all([
      database
        .selectFrom("violations")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst(),
      database
        .selectFrom("rule_checks")
        .select((eb) => eb.fn.count("id").as("count"))
        .executeTakeFirst(),
    ]);

    // Get file sizes
    let databaseSizeMb = 0;
    let walSizeMb = 0;

    try {
      const databaseStats = await fs.stat(this.config.path);
      databaseSizeMb = databaseStats.size / (1024 * 1024);

      const walPath = `${this.config.path}-wal`;
      try {
        const walStats = await fs.stat(walPath);
        walSizeMb = walStats.size / (1024 * 1024);
      } catch {
        // WAL file might not exist
      }
    } catch (error) {
      console.warn("[Database] Could not get file size stats:", error);
    }

    return {
      violations_count: Number(violationsResult?.count || 0),
      rule_checks_count: Number(ruleChecksResult?.count || 0),
      database_size_mb: Math.round(databaseSizeMb * 100) / 100,
      wal_size_mb: Math.round(walSizeMb * 100) / 100,
    };
  }

  /**
   * Vacuum database to reclaim space and optimize performance
   */
  static async vacuum(): Promise<void> {
    if (!this.instance) {
      throw new Error("Database not initialized");
    }

    console.log("[Database] Starting VACUUM operation...");
    const startTime = Date.now();

    await sql`VACUUM`.execute(this.instance);

    const duration = Date.now() - startTime;
    console.log(`[Database] VACUUM completed in ${duration}ms`);
  }

  /**
   * Analyze database to update query planner statistics
   */
  static async analyze(): Promise<void> {
    if (!this.instance) {
      throw new Error("Database not initialized");
    }

    console.log("[Database] Running ANALYZE...");
    await sql`ANALYZE`.execute(this.instance);
    console.log("[Database] ANALYZE completed");
  }
}

// ============================================================================
// Database Configuration Helpers
// ============================================================================

/**
 * Create default database configuration
 */
function createDefaultDatabaseConfig(databasePath?: string): DatabaseConfig {
  const defaultPath =
    databasePath || path.join(process.cwd(), "data", "code-quality.db");

  return {
    path: defaultPath,
    enableWAL: true,
    pragmas: {
      journal_mode: "WAL",
      synchronous: "NORMAL",
      cache_size: -64_000,
      foreign_keys: "ON",
      temp_store: "memory",
      mmap_size: 134_217_728,
    },
    migrations: {
      enabled: false, // Use direct schema initialization for now
      path: path.join(__dirname, "migrations"),
    },
  };
}

/**
 * Initialize database with default configuration
 */
export async function initializeDatabase(
  config?: Partial<DatabaseConfig>,
): Promise<Kysely<DatabaseSchema>> {
  const fullConfig = {
    ...createDefaultDatabaseConfig(),
    ...config,
  };

  return await DatabaseConnection.initialize(fullConfig);
}

/**
 * Get database connection instance
 */
export function getDatabase(): Kysely<DatabaseSchema> {
  return DatabaseConnection.getInstance();
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  await DatabaseConnection.close();
}
