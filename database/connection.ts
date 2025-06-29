/**
 * Database connection and initialization for Code Quality Orchestrator
 * Handles SQLite setup, migrations, and Kysely configuration
 */

import { Kysely, SqliteDialect, FileMigrationProvider, Migrator } from 'kysely';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import type { DatabaseSchema, DatabaseConfig } from './types.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Database Connection Management
// ============================================================================

export class DatabaseConnection {
  private static instance: Kysely<DatabaseSchema> | null = null;
  private static config: DatabaseConfig | null = null;
  private static sqliteDatabase: Database | null = null;

  /**
   * Initialize database connection with configuration
   */
  static async initialize(config: DatabaseConfig): Promise<Kysely<DatabaseSchema>> {
    if (this.instance) {
      return this.instance;
    }

    this.config = config;

    // Ensure database directory exists
    const dbDir = path.dirname(config.path);
    await fs.mkdir(dbDir, { recursive: true });

    // Create SQLite database instance
    const database = new Database(config.path);
    this.sqliteDatabase = database;

    // Configure SQLite pragmas for performance
    const defaultPragmas = {
      journal_mode: 'WAL',      // Write-Ahead Logging for better concurrency
      synchronous: 'NORMAL',    // Good balance of safety and performance
      cache_size: -64000,       // 64MB cache
      foreign_keys: 'ON',       // Enable foreign key constraints
      temp_store: 'memory',     // Store temp tables in memory
      mmap_size: 134217728,     // 128MB memory map
      ...config.pragmas
    };

    // Apply pragmas
    for (const [key, value] of Object.entries(defaultPragmas)) {
      database.pragma(`${key} = ${value}`);
    }

    // Create Kysely instance
    this.instance = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({
        database
      })
    });

    console.log(`[Database] Connected to SQLite database: ${config.path}`);

    // Run migrations if enabled
    if (config.migrations?.enabled) {
      await this.runMigrations();
    } else {
      // Initialize schema directly if migrations are disabled
      await this.initializeSchema();
    }

    return this.instance;
  }

  /**
   * Get existing database connection
   */
  static getInstance(): Kysely<DatabaseSchema> {
    if (!this.instance) {
      throw new Error('Database not initialized. Call DatabaseConnection.initialize() first.');
    }
    return this.instance;
  }

  /**
   * Close database connection
   */
  static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.destroy();
      this.instance = null;
      this.config = null;
      console.log('[Database] Connection closed');
    }
  }

  /**
   * Run database migrations
   */
  private static async runMigrations(): Promise<void> {
    if (!this.instance || !this.config?.migrations?.path) {
      throw new Error('Database or migration path not configured');
    }

    const migrationProvider = new FileMigrationProvider({
      fs: await import('fs/promises'),
      path: await import('path'),
      migrationFolder: this.config.migrations.path
    });

    const migrator = new Migrator({
      db: this.instance,
      provider: migrationProvider
    });

    const { error, results } = await migrator.migrateToLatest();

    if (error) {
      console.error('[Database] Migration failed:', error);
      throw error;
    }

    if (results) {
      results.forEach((result) => {
        if (result.status === 'Success') {
          console.log(`[Database] Migration "${result.migrationName}" executed successfully`);
        } else if (result.status === 'Error') {
          console.error(`[Database] Migration "${result.migrationName}" failed:`, result.errorMessage);
        }
      });
    }

    console.log('[Database] All migrations completed');
  }

  /**
   * Initialize schema directly (when migrations are disabled)
   */
  private static async initializeSchema(): Promise<void> {
    if (!this.instance) {
      throw new Error('Database not initialized');
    }

    try {
      if (!this.sqliteDatabase) {
        throw new Error('SQLite database instance not available');
      }

      // Check if schema is already initialized
      const tablesExist = this.sqliteDatabase
        .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='violations'")
        .get() as { count: number };

      if (tablesExist.count > 0) {
        console.log('[Database] Schema already exists, skipping initialization');
        return;
      }

      // Read schema.sql
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSQL = await fs.readFile(schemaPath, 'utf-8');
      
      console.log('[Database] Initializing schema...');
      
      // Use better-sqlite3's exec method which can handle multiple statements
      this.sqliteDatabase.exec(schemaSQL);

      console.log('[Database] Schema initialized successfully');
    } catch (error) {
      console.error('[Database] Schema initialization failed:', error);
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
        .selectFrom('violations')
        .select('id')
        .limit(1)
        .execute();

      return true;
    } catch (error) {
      console.error('[Database] Health check failed:', error);
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
      throw new Error('Database not initialized');
    }

    const db = this.instance;

    // Get table counts
    const [violationsResult, ruleChecksResult] = await Promise.all([
      db.selectFrom('violations').select((eb) => eb.fn.count('id').as('count')).executeTakeFirst(),
      db.selectFrom('rule_checks').select((eb) => eb.fn.count('id').as('count')).executeTakeFirst()
    ]);

    // Get file sizes
    let databaseSizeMb = 0;
    let walSizeMb = 0;

    try {
      const dbStats = await fs.stat(this.config.path);
      databaseSizeMb = dbStats.size / (1024 * 1024);

      const walPath = this.config.path + '-wal';
      try {
        const walStats = await fs.stat(walPath);
        walSizeMb = walStats.size / (1024 * 1024);
      } catch {
        // WAL file might not exist
      }
    } catch (error) {
      console.warn('[Database] Could not get file size stats:', error);
    }

    return {
      violations_count: Number(violationsResult?.count || 0),
      rule_checks_count: Number(ruleChecksResult?.count || 0),
      database_size_mb: Math.round(databaseSizeMb * 100) / 100,
      wal_size_mb: Math.round(walSizeMb * 100) / 100
    };
  }

  /**
   * Vacuum database to reclaim space and optimize performance
   */
  static async vacuum(): Promise<void> {
    if (!this.instance) {
      throw new Error('Database not initialized');
    }

    console.log('[Database] Starting VACUUM operation...');
    const startTime = Date.now();

    await this.instance.executeQuery({
      sql: 'VACUUM',
      parameters: []
    });

    const duration = Date.now() - startTime;
    console.log(`[Database] VACUUM completed in ${duration}ms`);
  }

  /**
   * Analyze database to update query planner statistics
   */
  static async analyze(): Promise<void> {
    if (!this.instance) {
      throw new Error('Database not initialized');
    }

    console.log('[Database] Running ANALYZE...');
    await this.instance.executeQuery({
      sql: 'ANALYZE',
      parameters: []
    });
    console.log('[Database] ANALYZE completed');
  }
}

// ============================================================================
// Database Configuration Helpers
// ============================================================================

/**
 * Create default database configuration
 */
export function createDefaultDatabaseConfig(databasePath?: string): DatabaseConfig {
  const defaultPath = databasePath || path.join(process.cwd(), 'data', 'code-quality.db');
  
  return {
    path: defaultPath,
    enableWAL: true,
    pragmas: {
      journal_mode: 'WAL',
      synchronous: 'NORMAL',
      cache_size: -64000,
      foreign_keys: 'ON',
      temp_store: 'memory',
      mmap_size: 134217728
    },
    migrations: {
      enabled: false, // Use direct schema initialization for now
      path: path.join(__dirname, 'migrations')
    }
  };
}

/**
 * Initialize database with default configuration
 */
export async function initializeDatabase(config?: Partial<DatabaseConfig>): Promise<Kysely<DatabaseSchema>> {
  const fullConfig = {
    ...createDefaultDatabaseConfig(),
    ...config
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