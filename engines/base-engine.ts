/**
 * @fileoverview Base audit engine abstract class
 * 
 * Provides the common interface and utilities that all audit engines must implement.
 * Handles error recovery, timing, and standardized result formatting.
 */

import type { 
  Violation, 
  EngineResult, 
  EngineConfig,
  ViolationSource,
  ViolationCategory,
  ViolationSeverity 
} from '../utils/violation-types.js';

/**
 * Abstract base class for all audit engines
 * 
 * Each engine is responsible for:
 * - Analyzing code for specific types of violations
 * - Handling errors gracefully without breaking the orchestrator
 * - Providing consistent violation format
 * - Implementing timeout and cancellation support
 */
export abstract class BaseAuditEngine {
  protected readonly engineName: string;
  protected readonly source: ViolationSource;
  protected config: EngineConfig;
  protected abortController?: AbortController;

  constructor(
    engineName: string, 
    source: ViolationSource, 
    config: EngineConfig
  ) {
    this.engineName = engineName;
    this.source = source;
    this.config = config;
  }

  /**
   * Execute the audit engine analysis
   * 
   * @param targetPath - Directory or file to analyze
   * @param options - Engine-specific options
   * @returns Promise resolving to engine results
   */
  async execute(
    targetPath: string, 
    options: Record<string, unknown> = {}
  ): Promise<EngineResult> {
    const startTime = Date.now();
    this.abortController = new AbortController();

    try {
      // Set up timeout if configured
      let timeoutId: NodeJS.Timeout | undefined;
      if (this.config.timeout) {
        timeoutId = setTimeout(() => {
          this.abortController?.abort();
        }, this.config.timeout);
      }

      // Execute the actual analysis
      const violations = await this.analyze(targetPath, options);

      // Clear timeout if analysis completed
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const executionTime = Date.now() - startTime;

      return {
        engineName: this.engineName,
        violations,
        executionTime,
        success: true,
        metadata: {
          targetPath,
          violationsFound: violations.length,
          config: this.config
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log the error but don't throw if allowFailure is true
      console.warn(`[${this.engineName}] Analysis failed: ${errorMessage}`);

      if (!this.config.allowFailure) {
        throw error;
      }

      return {
        engineName: this.engineName,
        violations: [],
        executionTime,
        success: false,
        error: errorMessage,
        metadata: {
          targetPath,
          failureRecovery: true
        }
      };
    } finally {
      this.abortController = undefined;
    }
  }

  /**
   * Check if the engine can be aborted
   */
  get canAbort(): boolean {
    return this.abortController !== undefined;
  }

  /**
   * Abort the current analysis
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Abstract method that each engine must implement
   * Contains the actual analysis logic
   * 
   * @param targetPath - Path to analyze
   * @param options - Engine-specific options
   * @returns Array of violations found
   */
  protected abstract analyze(
    targetPath: string, 
    options: Record<string, unknown>
  ): Promise<Violation[]>;

  /**
   * Helper method to create standardized violations
   */
  protected createViolation(
    file: string,
    line: number,
    code: string,
    category: ViolationCategory,
    severity: ViolationSeverity,
    rule?: string,
    message?: string,
    column?: number
  ): Violation {
    return {
      file,
      line,
      column,
      code: code.trim(),
      category,
      severity,
      source: this.source,
      rule,
      message,
      fixSuggestion: this.generateFixSuggestion?.(category, rule, code)
    };
  }

  /**
   * Optional method for engines to provide fix suggestions
   * Override in subclasses to provide engine-specific suggestions
   */
  protected generateFixSuggestion?(
    category: ViolationCategory,
    rule?: string,
    code?: string
  ): string | undefined;

  /**
   * Update engine configuration
   */
  updateConfig(newConfig: Partial<EngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current engine configuration
   */
  getConfig(): EngineConfig {
    return { ...this.config };
  }

  /**
   * Get engine metadata
   */
  getMetadata(): Record<string, unknown> {
    return {
      name: this.engineName,
      source: this.source,
      enabled: this.config.enabled,
      priority: this.config.priority,
      allowFailure: this.config.allowFailure,
      timeout: this.config.timeout
    };
  }
}