/**
 * Unified Code Quality Orchestrator
 *
 * Combines the analysis capabilities of CodeQualityOrchestrator with the
 * service management and persistence capabilities of OrchestratorService.
 * This replaces both legacy systems with a single, unified orchestrator.
 */

import { EventEmitter } from "node:events";
import type {
  IOrchestratorService,
  IStorageService,
  IPollingService,
  IAnalysisService,
  IViolationTracker,
  WatchModeOptions,
  OrchestratorConfig,
  HealthCheckResult,
  SystemStats,
  RuleCheckResult,
} from "./interfaces.js";
import { ConfigManager } from "./config-manager.js";
import { getPollingService } from "./polling-service.js";
import { getAnalysisService } from "./analysis-service.js";
import { getViolationTracker } from "./violation-tracker.js";

// Import legacy orchestrator types and utilities
import { BaseAuditEngine } from "../engines/base-engine.js";
import { TypeScriptAuditEngine } from "../engines/typescript-engine.js";
import { ESLintAuditEngine } from "../engines/eslint-engine.js";
import { UnusedExportsEngine } from "../engines/unused-exports-engine.js";
import { ZodDetectionEngine } from "../engines/zod-detection-engine.js";
import { CodeArchaeologyEngine } from "../engines/code-archaeology-engine.js";
import type {
  Violation,
  EngineResult,
  OrchestratorResult,
  ViolationSummary,
  EngineConfig,
  WatchEvent,
  WatchEventData,
  CrossoverConfig,
} from "../utils/violation-types.js";
import { createCrossoverDetector } from "../utils/crossover-detector.js";

/**
 * Unified orchestrator configuration combining both systems
 */
export interface UnifiedOrchestratorConfig {
  // Analysis Configuration (from legacy)
  targetPath: string;
  engines: {
    typescript?: EngineConfig;
    eslint?: EngineConfig;
    unusedExports?: EngineConfig;
    zodDetection?: EngineConfig;
    archaeology?: EngineConfig;
  };
  deduplication?: {
    enabled: boolean;
    strategy: "exact" | "similar" | "location";
  };
  crossover?: CrossoverConfig;
  output?: {
    console: boolean;
    json?: string;
    html?: string;
  };

  // Service Configuration (from enhanced)
  database: {
    path: string;
    enableWAL: boolean;
    maxHistoryDays: number;
  };
  polling: {
    defaultFrequencyMs: number;
    maxConcurrentChecks: number;
    adaptivePolling: boolean;
  };
  watch: {
    intervalMs: number;
    debounceMs: number;
    autoCleanup: boolean;
  };
  performance: {
    batchSize: number;
    enableMetrics: boolean;
  };
}

/**
 * Unified interface combining analysis and service capabilities
 */
export interface IUnifiedOrchestrator extends IOrchestratorService {
  // Core Analysis Capabilities (from legacy orchestrator)
  analyze(_targetPath?: string): Promise<OrchestratorResult>;

  // Engine Management
  addEngine(_name: string, _engine: BaseAuditEngine): void;
  removeEngine(_name: string): void;
  getEngine(_name: string): BaseAuditEngine | undefined;
  getEngineMetadata(): Record<string, unknown>;

  // Configuration Management (unified)
  updateUnifiedConfig(
    _config: Partial<UnifiedOrchestratorConfig>,
  ): Promise<void>;
  getUnifiedConfig(): UnifiedOrchestratorConfig;

  // Event System for watch mode and integrations
  addWatchEventListener(
    _event: WatchEvent,
    _callback: (_data: WatchEventData) => void,
  ): void;
  emit(_event: WatchEvent, _data: any): void;
}

/**
 * Unified Code Quality Orchestrator Implementation
 *
 * This class merges the capabilities of both legacy orchestrators:
 * - Direct analysis execution with multi-engine coordination
 * - Service management with SQLite persistence
 * - Watch mode with real-time monitoring
 * - Configuration management and health monitoring
 */
export class UnifiedOrchestrator
  extends EventEmitter
  implements IUnifiedOrchestrator
{
  // Service Management (from enhanced orchestrator)
  private configManager: ConfigManager;
  private storageService: IStorageService | undefined = undefined;
  private pollingService: IPollingService | undefined = undefined;
  private analysisService: IAnalysisService | undefined = undefined;
  private violationTracker: IViolationTracker | undefined = undefined;

  // Engine Management (from legacy orchestrator)
  private engines: Map<string, BaseAuditEngine> = new Map();
  private unifiedConfig: UnifiedOrchestratorConfig;

  // State Management
  private initialized = false;
  private watchModeActive = false;
  private watchModeInterval: ReturnType<typeof setTimeout> | undefined =
    undefined;
  private silent = false;

  // Event System (from legacy orchestrator)
  private eventListeners: Map<WatchEvent, ((_data: WatchEventData) => void)[]> =
    new Map();

  constructor(
    config: UnifiedOrchestratorConfig,
    configManager?: ConfigManager,
  ) {
    super();
    this.unifiedConfig = config;
    this.configManager = configManager || new ConfigManager();
    this.initializeEngines();
  }

  // ========================================================================
  // Lifecycle Management (from enhanced orchestrator)
  // ========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("[UnifiedOrchestrator] Already initialized");
      return;
    }

    console.log("[UnifiedOrchestrator] Initializing services...");

    try {
      // Initialize all services through config manager
      const { storageService } = await this.configManager.initializeServices();
      this.storageService = storageService;

      // Initialize other services with storage service dependency
      this.pollingService = getPollingService(this.storageService);
      this.analysisService = getAnalysisService(this.storageService);
      this.violationTracker = getViolationTracker(this.storageService);

      // Set up event forwarding from polling service
      this.pollingService.on("ruleStarted", (ruleId, engine) => {
        this.emit("ruleStarted", ruleId, engine);
      });

      this.pollingService.on("ruleCompleted", (result) => {
        this.emit("ruleCompleted", result);
      });

      this.pollingService.on("ruleFailed", (ruleId, engine, error) => {
        this.emit("ruleFailed", ruleId, engine, error);
      });

      this.pollingService.on("cycleCompleted", (results) => {
        this.emit("cycleCompleted", results);
      });

      this.initialized = true;
      console.log(
        "[UnifiedOrchestrator] Initialization completed successfully",
      );
      this.emit("initialized");
    } catch (error) {
      console.error("[UnifiedOrchestrator] Initialization failed:", error);
      this.emit("initializationFailed", error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      console.log("[UnifiedOrchestrator] Not initialized, nothing to shutdown");
      return;
    }

    console.log("[UnifiedOrchestrator] Shutting down...");

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
      console.log("[UnifiedOrchestrator] Shutdown completed");
      this.emit("shutdown");
    } catch (error) {
      console.error("[UnifiedOrchestrator] Shutdown error:", error);
      this.emit("shutdownError", error);
      throw error;
    }
  }

  // ========================================================================
  // Core Analysis Capabilities (from legacy orchestrator)
  // ========================================================================

  /**
   * Execute all enabled engines and return unified results
   * This is the core analysis method from the legacy orchestrator
   */
  async analyze(targetPath?: string): Promise<OrchestratorResult> {
    const analysisPath = targetPath || this.unifiedConfig.targetPath;
    const startTime = Date.now();
    const engineResults: EngineResult[] = [];

    this.emitEvent("analysis-started", { engines: [...this.engines.keys()] });

    // Sort engines by priority
    const sortedEngines = [...this.engines.entries()].sort(
      ([, a], [, b]) => a.getConfig().priority - b.getConfig().priority,
    );

    // Execute engines in parallel (or series based on dependencies)
    const enginePromises = sortedEngines.map(async ([name, engine]) => {
      try {
        console.log(`[UnifiedOrchestrator] Starting ${name} engine...`);
        const result = await engine.execute(analysisPath);
        console.log(
          `[UnifiedOrchestrator] ${name} engine completed: ${result.violations.length} violations found`,
        );
        return result;
      } catch (error) {
        console.error(`[UnifiedOrchestrator] ${name} engine failed:`, error);
        // Return failed result instead of throwing
        return {
          engineName: name,
          violations: [],
          executionTime: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const results = await Promise.all(enginePromises);
    engineResults.push(...results);

    // Merge and deduplicate violations
    const allViolations = this.mergeViolations(results);
    const deduplicatedViolations = this.deduplicateViolations(allViolations);

    // Generate summary
    const summary = this.generateSummary(deduplicatedViolations);

    const totalExecutionTime = Date.now() - startTime;

    const orchestratorResult: OrchestratorResult = {
      violations: deduplicatedViolations,
      engineResults,
      totalExecutionTime,
      summary,
      timestamp: new Date().toISOString(),
    };

    // Crossover detection and warnings
    if (this.unifiedConfig.crossover?.enabled !== false) {
      const crossoverDetector = createCrossoverDetector(
        this.unifiedConfig.crossover,
      );
      const crossoverWarnings = crossoverDetector.analyze(orchestratorResult);

      if (crossoverWarnings.length > 0) {
        // Display warnings if console output is enabled
        if (this.unifiedConfig.output?.console !== false) {
          crossoverDetector.displayWarnings();
        }

        // Add to orchestrator result for programmatic access
        (orchestratorResult as any).crossoverWarnings = crossoverWarnings;

        // Optionally fail on crossover issues
        if (
          this.unifiedConfig.crossover?.failOnCrossover &&
          crossoverDetector.hasCriticalIssues()
        ) {
          throw new Error(
            "Critical crossover issues detected between ESLint and TypeScript engines",
          );
        }
      }
    }

    // Persist results if services are initialized
    if (this.initialized && this.storageService) {
      try {
        await this.persistAnalysisResults(orchestratorResult);
      } catch (error) {
        console.warn("[UnifiedOrchestrator] Failed to persist results:", error);
      }
    }

    this.emitEvent("analysis-completed", {
      violationCount: deduplicatedViolations.length,
      executionTime: totalExecutionTime,
    });

    return orchestratorResult;
  }

  // ========================================================================
  // Engine Management (from legacy orchestrator)
  // ========================================================================

  /**
   * Initialize audit engines based on configuration
   */
  private initializeEngines(): void {
    // Initialize TypeScript engine
    if (this.unifiedConfig.engines.typescript?.enabled !== false) {
      const tsEngine = new TypeScriptAuditEngine(
        this.unifiedConfig.engines.typescript as any,
      );
      this.engines.set("typescript", tsEngine);
    }

    // Initialize ESLint engine
    if (this.unifiedConfig.engines.eslint?.enabled !== false) {
      const eslintEngine = new ESLintAuditEngine(
        this.unifiedConfig.engines.eslint as any,
      );
      this.engines.set("eslint", eslintEngine);
    }

    // Initialize Unused Exports engine
    if (this.unifiedConfig.engines.unusedExports?.enabled !== false) {
      const unusedExportsEngine = new UnusedExportsEngine();
      this.engines.set("unused-exports", unusedExportsEngine);
    }

    // Initialize Zod Detection engine
    if (this.unifiedConfig.engines.zodDetection?.enabled !== false) {
      const zodEngine = new ZodDetectionEngine(
        this.unifiedConfig.engines.zodDetection as any,
      );
      this.engines.set("zod-detection", zodEngine);
    }

    // Initialize Code Archaeology engine
    if (this.unifiedConfig.engines.archaeology?.enabled !== false) {
      const archaeologyEngine = new CodeArchaeologyEngine(
        this.unifiedConfig.engines.archaeology as any,
      );
      this.engines.set("archaeology", archaeologyEngine);
    }
  }

  addEngine(name: string, engine: BaseAuditEngine): void {
    this.engines.set(name, engine);
  }

  removeEngine(name: string): void {
    this.engines.delete(name);
  }

  getEngine(name: string): BaseAuditEngine | undefined {
    return this.engines.get(name);
  }

  getEngineMetadata(): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    for (const [name, engine] of this.engines) {
      metadata[name] = engine.getMetadata();
    }
    return metadata;
  }

  // ========================================================================
  // Watch Mode (unified from both systems)
  // ========================================================================

  async startWatchMode(options: WatchModeOptions = {}): Promise<void> {
    this.ensureInitialized();

    if (this.watchModeActive) {
      console.log("[UnifiedOrchestrator] Watch mode already active");
      return;
    }

    const watchOptions: WatchModeOptions = {
      intervalMs: options.intervalMs || this.unifiedConfig.watch.intervalMs,
      debounceMs: options.debounceMs || this.unifiedConfig.watch.debounceMs,
      autoCleanup:
        options.autoCleanup === undefined
          ? this.unifiedConfig.watch.autoCleanup
          : options.autoCleanup,
      maxConcurrentChecks:
        options.maxConcurrentChecks ||
        this.unifiedConfig.polling.maxConcurrentChecks,
    };

    console.log(
      "[UnifiedOrchestrator] Starting watch mode with options:",
      watchOptions,
    );

    // Start polling service
    await this.pollingService!.start();

    // Initial analysis
    await this.analyze();

    // Set up watch mode interval combining both legacy and enhanced approaches
    this.watchModeInterval = setInterval(async () => {
      try {
        // Execute analysis (legacy approach)
        await this.analyze();

        // Execute service-based watch cycle (enhanced approach)
        await this.executeWatchCycle(watchOptions);
      } catch (error) {
        console.error("[UnifiedOrchestrator] Watch cycle error:", error);
        this.emit("watchError", error);
      }
    }, watchOptions.intervalMs);

    // Handle graceful shutdown (from legacy orchestrator)
    process.on("SIGINT", () => {
      this.stopWatchMode();
      process.stdout.write("\u001B[?25h"); // Show cursor
      console.log("\n\n👋 Unified Code Quality Orchestrator watch stopped.");
      process.exit(0);
    });

    this.watchModeActive = true;
    console.log("[UnifiedOrchestrator] Watch mode started");
    this.emit("watchModeStarted", watchOptions);
  }

  async stopWatchMode(): Promise<void> {
    if (!this.watchModeActive) {
      console.log("[UnifiedOrchestrator] Watch mode not active");
      return;
    }

    console.log("[UnifiedOrchestrator] Stopping watch mode...");

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
    console.log("[UnifiedOrchestrator] Watch mode stopped");
    this.emit("watchModeStopped");
    this.emitEvent("watch-stopped", {});
  }

  isWatchModeActive(): boolean {
    return this.watchModeActive;
  }

  // ========================================================================
  // Service Access (from enhanced orchestrator)
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
  // Manual Operations (from enhanced orchestrator)
  // ========================================================================

  async runSingleCheck(
    rule: string,
    engine: "typescript" | "eslint",
  ): Promise<RuleCheckResult> {
    this.ensureInitialized();

    console.log(
      `[UnifiedOrchestrator] Running single check: ${rule} (${engine})`,
    );
    const result = await this.pollingService!.executeRule(rule, engine);

    this.emit("singleCheckCompleted", result);
    return result;
  }

  async runAllChecks(): Promise<RuleCheckResult[]> {
    this.ensureInitialized();

    console.log("[UnifiedOrchestrator] Running all scheduled checks...");
    const results = await this.pollingService!.executeNextRules(100); // Large number to get all

    console.log(`[UnifiedOrchestrator] Completed ${results.length} checks`);
    this.emit("allChecksCompleted", results);
    return results;
  }

  // ========================================================================
  // Configuration Management (unified)
  // ========================================================================

  async updateConfiguration(
    config: Partial<OrchestratorConfig>,
  ): Promise<void> {
    console.log("[UnifiedOrchestrator] Updating configuration...");

    // Update config manager
    this.configManager.updateConfig(config);

    // If already initialized, may need to reinitialize services
    if (this.initialized) {
      console.log(
        "[UnifiedOrchestrator] Restarting services with new configuration...",
      );
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

    this.emit("configurationUpdated", config);
  }

  async updateUnifiedConfig(
    config: Partial<UnifiedOrchestratorConfig>,
  ): Promise<void> {
    console.log("[UnifiedOrchestrator] Updating unified configuration...");

    this.unifiedConfig = { ...this.unifiedConfig, ...config };

    // Reinitialize engines if engine config changed
    if (config.engines) {
      this.engines.clear();
      this.initializeEngines();
    }

    // Update service configuration if needed
    if (
      config.database ||
      config.polling ||
      config.watch ||
      config.performance
    ) {
      const serviceConfig: Partial<OrchestratorConfig> = {};

      if (config.database) {
        serviceConfig.database = config.database;
      }
      if (config.polling) {
        serviceConfig.polling = config.polling;
      }
      if (config.watch) {
        serviceConfig.watch = config.watch;
      }
      if (config.performance) {
        serviceConfig.performance = config.performance;
      }

      await this.updateConfiguration(serviceConfig);
    }

    this.emit("unifiedConfigurationUpdated", config);
  }

  getConfiguration(): OrchestratorConfig {
    const config = this.configManager.getConfig();

    return {
      database: {
        path: config.database.path,
        enableWAL: config.database.enableWAL || false,
        maxHistoryDays: config.database.maxHistoryDays || 30,
      },
      polling: {
        defaultFrequencyMs: config.scheduling.defaultFrequencyMs || 30_000,
        maxConcurrentChecks: config.scheduling.maxConcurrentChecks || 3,
        adaptivePolling: config.scheduling.adaptivePolling || true,
      },
      watch: {
        intervalMs: config.watch.intervalMs || 3000,
        debounceMs: config.watch.debounceMs || 500,
        autoCleanup: config.watch.autoCleanup || true,
      },
      performance: {
        batchSize: config.performance.batchSize || 100,
        enableMetrics: config.monitoring.enablePerformanceMetrics || true,
      },
    };
  }

  getUnifiedConfig(): UnifiedOrchestratorConfig {
    return { ...this.unifiedConfig };
  }

  // ========================================================================
  // Health and Monitoring (from enhanced orchestrator)
  // ========================================================================

  async healthCheck(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      overall: false,
      services: {
        storage: false,
        polling: false,
        analysis: false,
        tracker: false,
      },
      errors: [],
    };

    try {
      // Check config manager health
      const configHealth = await this.configManager.healthCheck();
      result.services.storage = configHealth.storageService;

      if (!configHealth.overall) {
        result.errors.push("Config manager health check failed");
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
        result.errors.push("Services not initialized");
      }

      // Overall health
      result.overall =
        Object.values(result.services).every(Boolean) &&
        result.errors.length === 0;
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
      activeChecks: this.pollingService
        ? (this.pollingService as any).activeChecks?.size || 0
        : 0,
      watchMode: this.watchModeActive,
    };
  }

  // ========================================================================
  // Event System (from legacy orchestrator)
  // ========================================================================

  addWatchEventListener(
    _event: WatchEvent,
    _callback: (_data: WatchEventData) => void,
  ): void {
    if (!this.eventListeners.has(_event)) {
      this.eventListeners.set(_event, []);
    }
    this.eventListeners.get(_event)!.push(_callback);
  }

  private emitEvent(type: WatchEvent, payload: unknown): void {
    const eventData: WatchEventData = {
      type,
      timestamp: new Date().toISOString(),
      payload,
    };

    const listeners = this.eventListeners.get(type) || [];
    listeners.forEach((callback) => {
      try {
        callback(eventData);
      } catch (error) {
        console.error(
          `[UnifiedOrchestrator] Event listener error for ${type}:`,
          error,
        );
      }
    });
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("UnifiedOrchestrator must be initialized before use");
    }
  }

  private async executeWatchCycle(options: WatchModeOptions): Promise<void> {
    const startTime = performance.now();

    // Execute next batch of rules
    const results = await this.pollingService!.executeNextRules(
      options.maxConcurrentChecks,
    );

    // Perform cleanup if enabled
    if (options.autoCleanup && Math.random() < 0.1) {
      // 10% chance each cycle
      try {
        const cleanupResult = await this.storageService!.cleanupOldData();
        if (!this.silent) {
          console.log(
            "[UnifiedOrchestrator] Auto-cleanup completed:",
            cleanupResult,
          );
        }
      } catch (error) {
        if (!this.silent) {
          console.error("[UnifiedOrchestrator] Auto-cleanup failed:", error);
        }
      }
    }

    const executionTime = performance.now() - startTime;

    // Record watch cycle metrics
    await this.storageService!.recordPerformanceMetric(
      "watch_cycle",
      executionTime,
      "ms",
      `rules: ${results.length}`,
    );

    this.emit("watchCycle", {
      executionTime,
      rulesExecuted: results.length,
      results,
    });
  }

  /**
   * Merge violations from multiple engines (from legacy orchestrator)
   */
  private mergeViolations(results: EngineResult[]): Violation[] {
    const allViolations: Violation[] = [];

    for (const result of results) {
      if (result.success) {
        allViolations.push(...result.violations);
      }
    }

    // Sort violations for consistent output
    return allViolations.sort((a, b) => {
      // Sort by source, then severity, then file, then line
      if (a.source !== b.source) {
        return a.source === "typescript" ? -1 : 1;
      }

      const severityOrder = { error: 0, warn: 1, info: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }

      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }

      return a.line - b.line;
    });
  }

  /**
   * Deduplicate violations based on configuration (from legacy orchestrator)
   */
  private deduplicateViolations(violations: Violation[]): Violation[] {
    if (!this.unifiedConfig.deduplication?.enabled) {
      return violations;
    }

    const strategy = this.unifiedConfig.deduplication.strategy || "exact";
    const seen = new Set<string>();
    const deduplicated: Violation[] = [];

    for (const violation of violations) {
      let key: string;

      switch (strategy) {
        case "exact": {
          key = `${violation.file}:${violation.line}:${violation.code}:${violation.source}`;
          break;
        }
        case "location": {
          key = `${violation.file}:${violation.line}`;
          break;
        }
        case "similar": {
          key = `${violation.file}:${violation.category}:${violation.code.slice(0, 50)}`;
          break;
        }
        default: {
          key = `${violation.file}:${violation.line}:${violation.code}`;
        }
      }

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(violation);
      }
    }

    return deduplicated;
  }

  /**
   * Generate summary statistics (from legacy orchestrator)
   */
  private generateSummary(violations: Violation[]): ViolationSummary {
    const summary: ViolationSummary = {
      total: violations.length,
      bySeverity: { error: 0, warn: 0, info: 0 },
      bySource: {
        typescript: 0,
        eslint: 0,
        "unused-exports": 0,
        "zod-detection": 0,
        parser: 0,
        complexity: 0,
        security: 0,
        performance: 0,
        archaeology: 0,
        custom: 0,
      },
      byCategory: {} as Record<string, number>,
      topFiles: [],
    };

    const fileViolationCount = new Map<string, number>();

    for (const violation of violations) {
      // Count by severity
      summary.bySeverity[violation.severity]++;

      // Count by source
      summary.bySource[violation.source]++;

      // Count by category
      summary.byCategory[violation.category] =
        (summary.byCategory[violation.category] || 0) + 1;

      // Count by file
      fileViolationCount.set(
        violation.file,
        (fileViolationCount.get(violation.file) || 0) + 1,
      );
    }

    // Get top violated files
    summary.topFiles = [...fileViolationCount.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([file, count]) => ({ file, count }));

    return summary;
  }

  /**
   * Persist analysis results to storage service
   */
  private async persistAnalysisResults(
    result: OrchestratorResult,
  ): Promise<void> {
    if (!this.storageService || !this.violationTracker) {
      return;
    }

    try {
      // Track violations through the violation tracker
      await this.violationTracker.processViolations(result.violations);

      // Record performance metrics
      await this.storageService.recordPerformanceMetric(
        "analysis_execution",
        result.totalExecutionTime,
        "ms",
        `violations: ${result.violations.length}, engines: ${result.engineResults.length}`,
      );
    } catch (error) {
      console.warn(
        "[UnifiedOrchestrator] Failed to persist analysis results:",
        error,
      );
    }
  }
}

// ============================================================================
// Service Factory and Utilities
// ============================================================================

let unifiedOrchestratorInstance: UnifiedOrchestrator | undefined;

/**
 * Get or create unified orchestrator service instance
 */
export function getUnifiedOrchestrator(
  config: UnifiedOrchestratorConfig,
  configManager?: ConfigManager,
): UnifiedOrchestrator {
  if (!unifiedOrchestratorInstance) {
    unifiedOrchestratorInstance = new UnifiedOrchestrator(
      config,
      configManager,
    );
  }
  return unifiedOrchestratorInstance;
}

/**
 * Reset unified orchestrator service instance (useful for testing)
 */
export function resetUnifiedOrchestrator(): void {
  if (unifiedOrchestratorInstance) {
    if (unifiedOrchestratorInstance.isWatchModeActive()) {
      unifiedOrchestratorInstance.stopWatchMode().catch(console.error);
    }
    unifiedOrchestratorInstance.shutdown().catch(console.error);
  }
  unifiedOrchestratorInstance = undefined;
}

/**
 * Create a fully configured unified orchestrator for a specific environment
 */
export async function createUnifiedOrchestrator(
  config: UnifiedOrchestratorConfig,
  environment: "development" | "test" | "production" = "development",
): Promise<UnifiedOrchestrator> {
  const configManager = ConfigManager.createEnvironmentConfig(environment);

  const orchestrator = new UnifiedOrchestrator(config, configManager);
  await orchestrator.initialize();

  return orchestrator;
}

/**
 * Create default unified orchestrator configuration
 */
export function createDefaultUnifiedConfig(
  targetPath: string,
): UnifiedOrchestratorConfig {
  return {
    // Analysis Configuration
    targetPath,
    engines: {
      typescript: { enabled: true, priority: 1, options: {} },
      eslint: { enabled: true, priority: 2, options: {} },
      unusedExports: { enabled: true, priority: 3, options: {} },
      zodDetection: { enabled: true, priority: 4, options: {} },
      archaeology: { enabled: false, priority: 5, options: {} }, // Disabled by default
    },
    deduplication: {
      enabled: true,
      strategy: "exact",
    },
    crossover: {
      enabled: true,
      warnOnTypeAwareRules: true,
      warnOnDuplicateViolations: true,
      failOnCrossover: false,
    },
    output: {
      console: true,
    },

    // Service Configuration
    database: {
      path: "./data/violations.db",
      enableWAL: true,
      maxHistoryDays: 30,
    },
    polling: {
      defaultFrequencyMs: 30_000,
      maxConcurrentChecks: 3,
      adaptivePolling: true,
    },
    watch: {
      intervalMs: 3000,
      debounceMs: 500,
      autoCleanup: true,
    },
    performance: {
      batchSize: 100,
      enableMetrics: true,
    },
  };
}
