/**
 * @fileoverview Code Quality Orchestrator
 *
 * Main coordinator that manages multiple audit engines, handles their execution,
 * merges results, and provides unified reporting and watch mode functionality.
 */

// import * as path from "path";
import { BaseAuditEngine } from '../engines/base-engine.js';
import { TypeScriptAuditEngine } from '../engines/typescript-engine.js';
import { ESLintAuditEngine } from '../engines/eslint-engine.js';
import { UnusedExportsEngine } from '../engines/unused-exports-engine.js';
import { ZodDetectionEngine } from '../engines/zod-detection-engine.js';
import type {
  Violation,
  EngineResult,
  OrchestratorResult,
  ViolationSummary,
  EngineConfig,
  WatchEvent,
  WatchEventData,
  CrossoverConfig
} from '../utils/violation-types.js';
import { createCrossoverDetector } from '../utils/crossover-detector.js';

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  /** Target directory to analyze */
  targetPath: string;
  /** Watch mode configuration */
  watch?: {
    enabled: boolean;
    interval: number; // milliseconds
    debounce: number; // milliseconds
  };
  /** Engine configurations */
  engines: {
    typescript?: EngineConfig;
    eslint?: EngineConfig;
    unusedExports?: EngineConfig;
    zodDetection?: EngineConfig;
  };
  /** Output configuration */
  output?: {
    console: boolean;
    json?: string;
    html?: string;
  };
  /** Deduplication settings */
  deduplication?: {
    enabled: boolean;
    strategy: 'exact' | 'similar' | 'location';
  };
  /** Crossover detection settings */
  crossover?: CrossoverConfig;
}

/**
 * Main orchestrator class that coordinates multiple audit engines
 */
export class CodeQualityOrchestrator {
  private engines: Map<string, BaseAuditEngine> = new Map();
  private config: OrchestratorConfig;
  private watchMode = false;
  private watchInterval?: ReturnType<typeof setTimeout> | undefined;
  private eventListeners: Map<WatchEvent, ((_data: WatchEventData) => void)[]> = new Map();

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.initializeEngines();
  }

  /**
   * Initialize audit engines based on configuration
   */
  private initializeEngines(): void {
    // Initialize TypeScript engine
    if (this.config.engines.typescript?.enabled !== false) {
      const tsEngine = new TypeScriptAuditEngine(this.config.engines.typescript as any);
      this.engines.set('typescript', tsEngine);
    }

    // Initialize ESLint engine
    if (this.config.engines.eslint?.enabled !== false) {
      const eslintEngine = new ESLintAuditEngine(this.config.engines.eslint as any);
      this.engines.set('eslint', eslintEngine);
    }

    // Initialize Unused Exports engine
    if (this.config.engines.unusedExports?.enabled !== false) {
      const unusedExportsEngine = new UnusedExportsEngine();
      this.engines.set('unused-exports', unusedExportsEngine);
    }

    // Initialize Zod Detection engine
    if (this.config.engines.zodDetection?.enabled !== false) {
      const zodEngine = new ZodDetectionEngine(this.config.engines.zodDetection as any);
      this.engines.set('zod-detection', zodEngine);
    }
  }

  /**
   * Execute all enabled engines and return unified results
   */
  async analyze(): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const engineResults: EngineResult[] = [];

    this.emitEvent('analysis-started', { engines: [...this.engines.keys()] });

    // Sort engines by priority
    const sortedEngines = [...this.engines.entries()]
      .sort(([, a], [, b]) => a.getConfig().priority - b.getConfig().priority);

    // Execute engines in parallel (or series based on dependencies)
    const enginePromises = sortedEngines.map(async([name, engine]) => {
      try {
        console.log(`[Orchestrator] Starting ${name} engine...`);
        const result = await engine.execute(this.config.targetPath);
        console.log(`[Orchestrator] ${name} engine completed: ${result.violations.length} violations found`);
        return result;
      } catch (error) {
        console.error(`[Orchestrator] ${name} engine failed:`, error);
        // Return failed result instead of throwing
        return {
          engineName: name,
          violations: [],
          executionTime: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error)
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
      timestamp: new Date().toISOString()
    };

    // Crossover detection and warnings
    if (this.config.crossover?.enabled !== false) {
      const crossoverDetector = createCrossoverDetector(this.config.crossover);
      const crossoverWarnings = crossoverDetector.analyze(orchestratorResult);

      if (crossoverWarnings.length > 0) {
        // Display warnings if console output is enabled
        if (this.config.output?.console !== false) {
          crossoverDetector.displayWarnings();
        }

        // Add to orchestrator result for programmatic access
        (orchestratorResult as any).crossoverWarnings = crossoverWarnings;

        // Optionally fail on crossover issues
        if (this.config.crossover?.failOnCrossover && crossoverDetector.hasCriticalIssues()) {
          throw new Error('Critical crossover issues detected between ESLint and TypeScript engines');
        }
      }
    }

    this.emitEvent('analysis-completed', {
      violationCount: deduplicatedViolations.length,
      executionTime: totalExecutionTime
    });

    return orchestratorResult;
  }

  /**
   * Start watch mode
   */
  async startWatch(): Promise<void> {
    if (this.watchMode) {
      console.warn('[Orchestrator] Watch mode already active');
      return;
    }

    this.watchMode = true;
    const interval = this.config.watch?.interval || 3000;

    console.log(`[Orchestrator] Starting watch mode (interval: ${interval}ms)`);

    // Initial analysis
    await this.analyze();

    // Set up periodic analysis
    this.watchInterval = setInterval(async() => {
      try {
        await this.analyze();
      } catch (error) {
        console.error('[Orchestrator] Watch mode analysis failed:', error);
      }
    }, interval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.stopWatch();
      process.stdout.write('\u001B[?25h'); // Show cursor
      console.log('\n\n👋 Code Quality Orchestrator watch stopped.');
      process.exit(0);
    });
  }

  /**
   * Stop watch mode
   */
  stopWatch(): void {
    if (!this.watchMode) {
      return;
    }

    this.watchMode = false;
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = undefined;
    }

    this.emitEvent('watch-stopped', {});
    console.log('[Orchestrator] Watch mode stopped');
  }

  /**
   * Merge violations from multiple engines
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
        return a.source === 'typescript' ? -1 : 1;
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
   * Deduplicate violations based on configuration
   */
  private deduplicateViolations(violations: Violation[]): Violation[] {
    if (!this.config.deduplication?.enabled) {
      return violations;
    }

    const strategy = this.config.deduplication.strategy || 'exact';
    const seen = new Set<string>();
    const deduplicated: Violation[] = [];

    for (const violation of violations) {
      let key: string;

      switch (strategy) {
      case 'exact': {
        key = `${violation.file}:${violation.line}:${violation.code}:${violation.source}`;
        break;
      }
      case 'location': {
        key = `${violation.file}:${violation.line}`;
        break;
      }
      case 'similar': {
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
   * Generate summary statistics
   */
  private generateSummary(violations: Violation[]): ViolationSummary {
    const summary: ViolationSummary = {
      total: violations.length,
      bySeverity: { error: 0, warn: 0, info: 0 },
      bySource: {
        typescript: 0,
        eslint: 0,
        'unused-exports': 0,
        'zod-detection': 0,
        parser: 0,
        complexity: 0,
        security: 0,
        performance: 0,
        custom: 0
      },
      byCategory: {} as Record<string, number>,
      topFiles: []
    };

    const fileViolationCount = new Map<string, number>();

    for (const violation of violations) {
      // Count by severity
      summary.bySeverity[violation.severity]++;

      // Count by source
      summary.bySource[violation.source]++;

      // Count by category
      summary.byCategory[violation.category] = (summary.byCategory[violation.category] || 0) + 1;

      // Count by file
      fileViolationCount.set(
        violation.file,
        (fileViolationCount.get(violation.file) || 0) + 1
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
   * Event system for watch mode and integrations
   */
  on(event: WatchEvent, callback: (_data: WatchEventData) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Emit events to listeners
   */
  private emitEvent(type: WatchEvent, payload: unknown): void {
    const eventData: WatchEventData = {
      type,
      timestamp: new Date().toISOString(),
      payload
    };

    const listeners = this.eventListeners.get(type) || [];
    listeners.forEach(callback => {
      try {
        callback(eventData);
      } catch (error) {
        console.error(`[Orchestrator] Event listener error for ${type}:`, error);
      }
    });
  }

  /**
   * Get specific engine for advanced operations
   */
  getEngine(name: string): BaseAuditEngine | undefined {
    return this.engines.get(name);
  }

  /**
   * Get all engine metadata
   */
  getEngineMetadata(): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    for (const [name, engine] of this.engines) {
      metadata[name] = engine.getMetadata();
    }
    return metadata;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Reinitialize engines if engine config changed
    if (newConfig.engines) {
      this.engines.clear();
      this.initializeEngines();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }
}
