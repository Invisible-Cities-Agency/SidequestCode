/**
 * Configuration Manager for Code Quality Orchestrator
 * Handles database initialization, service configuration, and environment setup
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, closeDatabase } from '../database/connection.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getStorageService, resetStorageService } from './storage-service.js';
import type {
  DatabaseConfig,
  StorageServiceConfig
} from '../database/types.js';
import type { Kysely } from 'kysely';

// ============================================================================
// Configuration Types
// ============================================================================

export interface OrchestratorServiceConfig {
  // Database configuration
  database: {
    path: string;
    enableWAL?: boolean;
    enableMetrics?: boolean;
    maxHistoryDays?: number;
  };

  // Performance settings
  performance: {
    batchSize?: number;
    maxMemoryMB?: number;
    enableCaching?: boolean;
  };

  // Rule scheduling
  scheduling: {
    defaultFrequencyMs?: number;
    adaptivePolling?: boolean;
    maxConcurrentChecks?: number;
  };

  // Watch mode settings
  watch: {
    enabled?: boolean;
    intervalMs?: number;
    debounceMs?: number;
    autoCleanup?: boolean;
  };

  // Logging and monitoring
  monitoring: {
    enablePerformanceMetrics?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    metricsRetentionDays?: number;
  };
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_CONFIG: OrchestratorServiceConfig = {
  database: {
    path: process.env['CQO_DB_PATH'] || './data/code-quality.db',
    enableWAL: true,
    enableMetrics: true,
    maxHistoryDays: 30
  },
  performance: {
    batchSize: 100,
    maxMemoryMB: 256,
    enableCaching: true
  },
  scheduling: {
    defaultFrequencyMs: 30_000, // 30 seconds
    adaptivePolling: true,
    maxConcurrentChecks: 3
  },
  watch: {
    enabled: true,
    intervalMs: 3000, // 3 seconds
    debounceMs: 500,
    autoCleanup: true
  },
  monitoring: {
    enablePerformanceMetrics: true,
    logLevel: 'info',
    metricsRetentionDays: 7
  }
};

// ============================================================================
// Configuration Manager Class
// ============================================================================

export class ConfigManager {
  private config: OrchestratorServiceConfig;
  private databaseInitialized = false;
  private servicesInitialized = false;

  constructor(config: Partial<OrchestratorServiceConfig> = {}) {
    this.config = this.mergeConfigs(DEFAULT_CONFIG, config);
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfigs(
    defaultConfig: OrchestratorServiceConfig,
    userConfig: Partial<OrchestratorServiceConfig>
  ): OrchestratorServiceConfig {
    const merged = { ...defaultConfig };

    for (const [key, value] of Object.entries(userConfig)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key as keyof OrchestratorServiceConfig] = {
          ...defaultConfig[key as keyof OrchestratorServiceConfig],
          ...value
        } as any;
      } else if (value !== undefined) {
        (merged as any)[key] = value;
      }
    }

    return merged;
  }

  /**
   * Get current configuration
   */
  getConfig(): OrchestratorServiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (will require reinitialization)
   */
  updateConfig(updates: Partial<OrchestratorServiceConfig>): void {
    this.config = this.mergeConfigs(this.config, updates);

    // Mark as needing reinitialization
    this.databaseInitialized = false;
    this.servicesInitialized = false;
  }

  /**
   * Initialize database with current configuration
   */
  async initializeDatabase(): Promise<Kysely<any>> {
    if (this.databaseInitialized) {
      return (await import('../database/connection.js')).getDatabase();
    }

    // Ensure data directory exists
    const databasePath = this.config.database.path;
    const dbDir = path.dirname(databasePath);
    await fs.mkdir(dbDir, { recursive: true });

    // Create database configuration
    const databaseConfig: DatabaseConfig = {
      path: databasePath,
      enableWAL: this.config.database.enableWAL ?? true,
      pragmas: {
        journal_mode: (this.config.database.enableWAL ?? true) ? 'WAL' : 'DELETE',
        synchronous: 'NORMAL',
        cache_size: Math.floor((this.config.performance.maxMemoryMB! * 1024 * 1024) / 1024), // Convert MB to KB
        foreign_keys: 'ON',
        temp_store: 'memory',
        mmap_size: this.config.performance.maxMemoryMB! * 1024 * 1024 // Convert MB to bytes
      },
      migrations: {
        enabled: false, // Use direct schema initialization
        path: path.join(__dirname, '../database/migrations')
      }
    };

    console.log(`[ConfigManager] Initializing database at: ${databasePath}`);
    const database = await initializeDatabase(databaseConfig);

    this.databaseInitialized = true;
    console.log('[ConfigManager] Database initialized successfully');

    return database;
  }

  /**
   * Initialize all services
   */
  async initializeServices(): Promise<{
    storageService: ReturnType<typeof getStorageService>;
  }> {
    if (!this.databaseInitialized) {
      await this.initializeDatabase();
    }

    if (this.servicesInitialized) {
      return {
        storageService: getStorageService()
      };
    }

    console.log('[ConfigManager] Initializing services...');

    // Reset any existing service instances
    resetStorageService();

    // Create storage service configuration
    const storageConfig: StorageServiceConfig = {
      database: {
        path: this.config.database.path,
        enableWAL: this.config.database.enableWAL ?? true,
        pragmas: {},
        migrations: { enabled: false, path: '' }
      },
      batchSize: this.config.performance.batchSize ?? 1000,
      maxHistoryAge: this.config.database.maxHistoryDays ?? 30,
      enablePerformanceMetrics: this.config.monitoring.enablePerformanceMetrics ?? true
    };

    // Initialize storage service
    const storageService = getStorageService(storageConfig);

    this.servicesInitialized = true;
    console.log('[ConfigManager] Services initialized successfully');

    return { storageService };
  }

  /**
   * Perform health checks on all services
   */
  async healthCheck(): Promise<{
    database: boolean;
    storageService: boolean;
    overall: boolean;
  }> {
    const results = {
      database: false,
      storageService: false,
      overall: false
    };

    try {
      // Check database health
      const { DatabaseConnection } = await import('../database/connection.js');
      results.database = await DatabaseConnection.healthCheck();

      // Check storage service
      if (this.servicesInitialized) {
        const storageService = getStorageService();
        const stats = await storageService.getStorageStats();
        results.storageService = typeof stats.totalViolations === 'number';
      }

      results.overall = results.database && results.storageService;
    } catch (error) {
      console.error('[ConfigManager] Health check failed:', error);
    }

    return results;
  }

  /**
   * Get comprehensive system statistics
   */
  async getSystemStats(): Promise<{
    config: OrchestratorServiceConfig;
    database: any;
    storage: any;
    performance: {
      uptime: number;
      memoryUsage: NodeJS.MemoryUsage;
    };
  }> {
    const stats = {
      config: this.config,
      database: null as any,
      storage: null as any,
      performance: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };

    try {
      // Get database stats
      if (this.databaseInitialized) {
        const { DatabaseConnection } = await import('../database/connection.js');
        stats.database = await DatabaseConnection.getStats();
      }

      // Get storage stats
      if (this.servicesInitialized) {
        const storageService = getStorageService();
        stats.storage = await storageService.getStorageStats();
      }
    } catch (error) {
      console.error('[ConfigManager] Failed to get system stats:', error);
    }

    return stats;
  }

  /**
   * Perform maintenance tasks
   */
  async performMaintenance(): Promise<{
    dataCleanup: any;
    databaseOptimization: boolean;
    errors: string[];
  }> {
    const results = {
      dataCleanup: null as any,
      databaseOptimization: false,
      errors: [] as string[]
    };

    try {
      // Clean up old data
      if (this.servicesInitialized) {
        const storageService = getStorageService();
        results.dataCleanup = await storageService.cleanupOldData();
      }

      // Optimize database
      if (this.databaseInitialized) {
        const { DatabaseConnection } = await import('../database/connection.js');
        await DatabaseConnection.analyze();
        results.databaseOptimization = true;
      }

      console.log('[ConfigManager] Maintenance completed successfully');
    } catch (error) {
      const errorMessage = `Maintenance failed: ${error}`;
      results.errors.push(errorMessage);
      console.error('[ConfigManager]', errorMessage);
    }

    return results;
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown(): Promise<void> {
    console.log('[ConfigManager] Shutting down services...');

    try {
      // Close database connection
      if (this.databaseInitialized) {
        await closeDatabase();
        this.databaseInitialized = false;
      }

      // Reset service instances
      resetStorageService();
      this.servicesInitialized = false;

      console.log('[ConfigManager] Shutdown completed successfully');
    } catch (error) {
      console.error('[ConfigManager] Shutdown error:', error);
      throw error;
    }
  }

  /**
   * Load configuration from file
   */
  static async loadFromFile(configPath: string): Promise<ConfigManager> {
    try {
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData) as Partial<OrchestratorServiceConfig>;
      return new ConfigManager(config);
    } catch (error) {
      console.warn(`[ConfigManager] Could not load config from ${configPath}, using defaults:`, error);
      return new ConfigManager();
    }
  }

  /**
   * Save configuration to file
   */
  async saveToFile(configPath: string): Promise<void> {
    try {
      const configDir = path.dirname(configPath);
      await fs.mkdir(configDir, { recursive: true });

      const configData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(configPath, configData, 'utf8');

      console.log(`[ConfigManager] Configuration saved to: ${configPath}`);
    } catch (error) {
      console.error(`[ConfigManager] Failed to save config to ${configPath}:`, error);
      throw error;
    }
  }

  /**
   * Create configuration for different environments
   */
  static createEnvironmentConfig(environment: 'development' | 'test' | 'production'): ConfigManager {
    const baseConfig = { ...DEFAULT_CONFIG };

    switch (environment) {
    case 'development': {
      return new ConfigManager({
        ...baseConfig,
        database: {
          ...baseConfig.database,
          path: './data/dev-code-quality.db'
        },
        monitoring: {
          ...baseConfig.monitoring,
          logLevel: 'debug'
        },
        watch: {
          ...baseConfig.watch,
          intervalMs: 1000 // Faster updates for development
        }
      });
    }

    case 'test': {
      return new ConfigManager({
        ...baseConfig,
        database: {
          ...baseConfig.database,
          path: ':memory:', // In-memory database for tests
          maxHistoryDays: 1
        },
        performance: {
          ...baseConfig.performance,
          batchSize: 10 // Smaller batches for testing
        },
        monitoring: {
          ...baseConfig.monitoring,
          enablePerformanceMetrics: false,
          logLevel: 'warn'
        }
      });
    }

    case 'production': {
      return new ConfigManager({
        ...baseConfig,
        database: {
          ...baseConfig.database,
          path: './data/prod-code-quality.db',
          maxHistoryDays: 90 // Longer retention in production
        },
        performance: {
          ...baseConfig.performance,
          batchSize: 200, // Larger batches for efficiency
          maxMemoryMB: 512
        },
        monitoring: {
          ...baseConfig.monitoring,
          logLevel: 'info',
          metricsRetentionDays: 30
        }
      });
    }

    default: {
      return new ConfigManager(baseConfig);
    }
    }
  }
}

// ============================================================================
// Configuration Utilities
// ============================================================================

/**
 * Validate configuration object
 */
export function validateConfig(config: Partial<OrchestratorServiceConfig>): string[] {
  const errors: string[] = [];

  // Validate database path
  if (config.database?.path && config.database.path !== ':memory:') {
    const databasePath = config.database.path;
    if (!path.isAbsolute(databasePath) && !databasePath.startsWith('./')) {
      errors.push('Database path must be absolute or relative (starting with ./)');
    }
  }

  // Validate performance settings
  if (config.performance?.batchSize && config.performance.batchSize < 1) {
    errors.push('Batch size must be at least 1');
  }

  if (config.performance?.maxMemoryMB && config.performance.maxMemoryMB < 64) {
    errors.push('Max memory must be at least 64MB');
  }

  // Validate scheduling settings
  if (config.scheduling?.defaultFrequencyMs && config.scheduling.defaultFrequencyMs < 1000) {
    errors.push('Default frequency must be at least 1000ms');
  }

  // Validate watch settings
  if (config.watch?.intervalMs && config.watch.intervalMs < 100) {
    errors.push('Watch interval must be at least 100ms');
  }

  return errors;
}

/**
 * Get configuration based on environment
 */
export function getEnvironmentConfig(): ConfigManager {
  const environment = process.env['NODE_ENV'] as 'development' | 'test' | 'production' || 'development';
  return ConfigManager.createEnvironmentConfig(environment);
}
