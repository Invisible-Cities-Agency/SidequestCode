/**
 * Main Orchestrator Service for Code Quality Orchestrator
 * Coordinates all services and provides unified interface
 */

import { EventEmitter } from 'node:events';
import type {
  IOrchestratorService,
  IStorageService,
  IPollingService,
  IAnalysisService,
  IViolationTracker,
  WatchModeOptions,
  OrchestratorConfig,
  HealthCheckResult,
  SystemStats
} from './interfaces.js';

import type { RuleCheckResult } from './interfaces.js';
import { ConfigManager } from './config-manager.js';
import { getPollingService } from './polling-service.js';
import { getAnalysisService } from './analysis-service.js';
import { getViolationTracker } from './violation-tracker.js';

// ============================================================================
// Main Orchestrator Service Implementation
// ============================================================================

export class OrchestratorService extends EventEmitter implements IOrchestratorService {
  private configManager: ConfigManager;
  private storageService: IStorageService | undefined = undefined;
  private pollingService: IPollingService | undefined = undefined;
  private analysisService: IAnalysisService | undefined = undefined;
  private violationTracker: IViolationTracker | undefined = undefined;

  private initialized = false;
  private watchModeActive = false;
  private watchModeInterval: NodeJS.Timeout | undefined = undefined;
  private silent = false;

  constructor(configManager?: ConfigManager) {
    super();
    this.configManager = configManager || new ConfigManager();
  }

  // ========================================================================
  // Lifecycle Management
  // ========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[OrchestratorService] Already initialized');
      return;
    }

    console.log('[OrchestratorService] Initializing services...');

    try {
      // Initialize all services through config manager
      const { storageService } = await this.configManager.initializeServices();
      this.storageService = storageService;

      // Initialize other services with storage service dependency
      this.pollingService = getPollingService(this.storageService);
      this.analysisService = getAnalysisService(this.storageService);
      this.violationTracker = getViolationTracker(this.storageService);

      // Set up event forwarding from polling service
      this.pollingService.on('ruleStarted', (ruleId, engine) => {
        this.emit('ruleStarted', ruleId, engine);
      });

      this.pollingService.on('ruleCompleted', (result) => {
        this.emit('ruleCompleted', result);
      });

      this.pollingService.on('ruleFailed', (ruleId, engine, error) => {
        this.emit('ruleFailed', ruleId, engine, error);
      });

      this.pollingService.on('cycleCompleted', (results) => {
        this.emit('cycleCompleted', results);
      });

      this.initialized = true;
      console.log('[OrchestratorService] Initialization completed successfully');
      this.emit('initialized');

    } catch (error) {
      console.error('[OrchestratorService] Initialization failed:', error);
      this.emit('initializationFailed', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      console.log('[OrchestratorService] Not initialized, nothing to shutdown');
      return;
    }

    console.log('[OrchestratorService] Shutting down...');

    try {
      // Stop watch mode if active
      if (this.watchModeActive) {
        await this.stopWatchMode();
      }

      // Stop polling service if running
      if (this.pollingService?.isRunning()) {
        await this.pollingService.stop();
      }

      // Shutdown config manager (closes database connections)
      await this.configManager.shutdown();

      this.initialized = false;
      console.log('[OrchestratorService] Shutdown completed');
      this.emit('shutdown');

    } catch (error) {
      console.error('[OrchestratorService] Shutdown error:', error);
      this.emit('shutdownError', error);
      throw error;
    }
  }

  // ========================================================================
  // Service Access
  // ========================================================================

  getStorageService(): IStorageService {
    this.ensureInitialized();
    return this.storageService!;
  }

  getPollingService(): IPollingService {
    this.ensureInitialized();
    return this.pollingService!;
  }

  getAnalysisService(): IAnalysisService {
    this.ensureInitialized();
    return this.analysisService!;
  }

  getViolationTracker(): IViolationTracker {
    this.ensureInitialized();
    return this.violationTracker!;
  }

  setSilentMode(silent: boolean): void {
    this.silent = silent;
    if (this.violationTracker) {
      this.violationTracker.setSilentMode(silent);
    }
  }

  // ========================================================================
  // Watch Mode
  // ========================================================================

  async startWatchMode(options: WatchModeOptions = {}): Promise<void> {
    this.ensureInitialized();

    if (this.watchModeActive) {
      console.log('[OrchestratorService] Watch mode already active');
      return;
    }

    const config = this.configManager.getConfig();
    const watchOptions: WatchModeOptions = {};
    if (options.intervalMs !== undefined) {
      watchOptions.intervalMs = options.intervalMs;
    } else if (config.watch.intervalMs !== undefined) {
      watchOptions.intervalMs = config.watch.intervalMs;
    }
    if (options.debounceMs !== undefined) {
      watchOptions.debounceMs = options.debounceMs;
    } else if (config.watch.debounceMs !== undefined) {
      watchOptions.debounceMs = config.watch.debounceMs;
    }
    if (options.autoCleanup !== undefined) {
      watchOptions.autoCleanup = options.autoCleanup;
    } else if (config.watch.autoCleanup !== undefined) {
      watchOptions.autoCleanup = config.watch.autoCleanup;
    }
    if (options.maxConcurrentChecks !== undefined) {
      watchOptions.maxConcurrentChecks = options.maxConcurrentChecks;
    } else if (config.scheduling.maxConcurrentChecks !== undefined) {
      watchOptions.maxConcurrentChecks = config.scheduling.maxConcurrentChecks;
    }

    console.log('[OrchestratorService] Starting watch mode with options:', watchOptions);

    // Start polling service
    await this.pollingService!.start();

    // Set up watch mode interval
    this.watchModeInterval = setInterval(async() => {
      try {
        await this.executeWatchCycle(watchOptions);
      } catch (error) {
        console.error('[OrchestratorService] Watch cycle error:', error);
        this.emit('watchError', error);
      }
    }, watchOptions.intervalMs);

    this.watchModeActive = true;
    console.log('[OrchestratorService] Watch mode started');
    this.emit('watchModeStarted', watchOptions);
  }

  async stopWatchMode(): Promise<void> {
    if (!this.watchModeActive) {
      console.log('[OrchestratorService] Watch mode not active');
      return;
    }

    console.log('[OrchestratorService] Stopping watch mode...');

    // Stop watch interval
    if (this.watchModeInterval) {
      clearInterval(this.watchModeInterval);
      this.watchModeInterval = undefined;
    }

    // Stop polling service
    if (this.pollingService?.isRunning()) {
      await this.pollingService.stop();
    }

    this.watchModeActive = false;
    console.log('[OrchestratorService] Watch mode stopped');
    this.emit('watchModeStopped');
  }

  isWatchModeActive(): boolean {
    return this.watchModeActive;
  }

  // ========================================================================
  // Manual Operations
  // ========================================================================

  async runSingleCheck(rule: string, engine: 'typescript' | 'eslint'): Promise<RuleCheckResult> {
    this.ensureInitialized();

    console.log(`[OrchestratorService] Running single check: ${rule} (${engine})`);
    const result = await this.pollingService!.executeRule(rule, engine);

    this.emit('singleCheckCompleted', result);
    return result;
  }

  async runAllChecks(): Promise<RuleCheckResult[]> {
    this.ensureInitialized();

    console.log('[OrchestratorService] Running all scheduled checks...');
    const results = await this.pollingService!.executeNextRules(100); // Large number to get all

    console.log(`[OrchestratorService] Completed ${results.length} checks`);
    this.emit('allChecksCompleted', results);
    return results;
  }

  // ========================================================================
  // Configuration
  // ========================================================================

  async updateConfiguration(config: Partial<OrchestratorConfig>): Promise<void> {
    console.log('[OrchestratorService] Updating configuration...');

    // Update config manager
    this.configManager.updateConfig(config);

    // If already initialized, may need to reinitialize services
    if (this.initialized) {
      console.log('[OrchestratorService] Restarting services with new configuration...');
      const wasWatchActive = this.watchModeActive;

      if (wasWatchActive) {
        await this.stopWatchMode();
      }

      await this.shutdown();
      await this.initialize();

      if (wasWatchActive) {
        await this.startWatchMode();
      }
    }

    this.emit('configurationUpdated', config);
  }

  getConfiguration(): OrchestratorConfig {
    const config = this.configManager.getConfig();

    return {
      database: {
        path: config.database.path,
        enableWAL: config.database.enableWAL || false,
        maxHistoryDays: config.database.maxHistoryDays || 30
      },
      polling: {
        defaultFrequencyMs: config.scheduling.defaultFrequencyMs || 30_000,
        maxConcurrentChecks: config.scheduling.maxConcurrentChecks || 3,
        adaptivePolling: config.scheduling.adaptivePolling || true
      },
      watch: {
        intervalMs: config.watch.intervalMs || 3000,
        debounceMs: config.watch.debounceMs || 500,
        autoCleanup: config.watch.autoCleanup || true
      },
      performance: {
        batchSize: config.performance.batchSize || 100,
        enableMetrics: config.monitoring.enablePerformanceMetrics || true
      }
    };
  }

  // ========================================================================
  // Health and Monitoring
  // ========================================================================

  async healthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      overall: false,
      services: {
        storage: false,
        polling: false,
        analysis: false,
        tracker: false
      },
      errors: []
    };

    try {
      // Check config manager health
      const configHealth = await this.configManager.healthCheck();
      result.services.storage = configHealth.storageService;

      if (!configHealth.overall) {
        result.errors.push('Config manager health check failed');
      }

      // Check individual services if initialized
      if (this.initialized) {
        result.services.polling = this.pollingService?.isRunning() || false;
        result.services.analysis = this.analysisService !== undefined;
        result.services.tracker = this.violationTracker !== undefined;

        // Test storage service
        try {
          await this.storageService!.getStorageStats();
          result.services.storage = true;
        } catch (error) {
          result.services.storage = false;
          result.errors.push(`Storage service error: ${error}`);
        }
      } else {
        result.errors.push('Services not initialized');
      }

      // Overall health
      result.overall = Object.values(result.services).every(Boolean) && result.errors.length === 0;

    } catch (error) {
      result.errors.push(`Health check error: ${error}`);
    }

    return result;
  }

  async getSystemStats(): Promise<SystemStats> {
    const configStats = await this.configManager.getSystemStats();

    return {
      uptime: configStats.performance.uptime,
      memoryUsage: configStats.performance.memoryUsage,
      database: configStats.database,
      storage: configStats.storage,
      activeChecks: this.pollingService ? (this.pollingService as any).activeChecks?.size || 0 : 0,
      watchMode: this.watchModeActive
    };
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('OrchestratorService must be initialized before use');
    }
  }

  private async executeWatchCycle(options: WatchModeOptions): Promise<void> {
    const startTime = performance.now();

    // Execute next batch of rules
    const results = await this.pollingService!.executeNextRules(options.maxConcurrentChecks);

    // Perform cleanup if enabled
    if (options.autoCleanup && Math.random() < 0.1) { // 10% chance each cycle
      try {
        const cleanupResult = await this.storageService!.cleanupOldData();
        if (!this.silent) {
          console.log('[OrchestratorService] Auto-cleanup completed:', cleanupResult);
        }
      } catch (error) {
        if (!this.silent) {
          console.error('[OrchestratorService] Auto-cleanup failed:', error);
        }
      }
    }

    const executionTime = performance.now() - startTime;

    // Record watch cycle metrics
    await this.storageService!.recordPerformanceMetric(
      'watch_cycle',
      executionTime,
      'ms',
      `rules: ${results.length}`
    );

    this.emit('watchCycle', {
      executionTime,
      rulesExecuted: results.length,
      results
    });
  }
}

// ============================================================================
// Service Factory and Utilities
// ============================================================================

let orchestratorServiceInstance: OrchestratorService | undefined = undefined;

/**
 * Get or create orchestrator service instance
 */
export function getOrchestratorService(configManager?: ConfigManager): OrchestratorService {
  if (!orchestratorServiceInstance) {
    orchestratorServiceInstance = new OrchestratorService(configManager);
  }
  return orchestratorServiceInstance;
}

/**
 * Reset orchestrator service instance (useful for testing)
 */
export function resetOrchestratorService(): void {
  if (orchestratorServiceInstance) {
    if (orchestratorServiceInstance.isWatchModeActive()) {
      orchestratorServiceInstance.stopWatchMode().catch(console.error);
    }
    orchestratorServiceInstance.shutdown().catch(console.error);
  }
  orchestratorServiceInstance = undefined;
}

/**
 * Create a fully configured orchestrator service for a specific environment
 */
export async function createOrchestratorService(
  environment: 'development' | 'test' | 'production' = 'development',
  customConfig?: Partial<import('./config-manager.js').OrchestratorServiceConfig>
): Promise<OrchestratorService> {
  const configManager = ConfigManager.createEnvironmentConfig(environment);

  // Apply custom configuration if provided
  if (customConfig) {
    configManager.updateConfig(customConfig);
  }

  const orchestrator = new OrchestratorService(configManager);

  await orchestrator.initialize();

  return orchestrator;
}
