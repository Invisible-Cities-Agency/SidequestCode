/**
 * @fileoverview Common types and interfaces for the Code Quality Orchestrator
 * 
 * Defines the core data structures used across all audit engines and components
 * for consistent violation reporting and categorization.
 */

/**
 * Standard violation object used across all audit engines
 */
export interface Violation {
  /** Relative file path from project root */
  file: string;
  /** Line number where violation occurs */
  line: number;
  /** Column number (optional, for precise location) */
  column?: number;
  /** The actual code that violates the rule */
  code: string;
  /** Violation category for grouping and reporting */
  category: ViolationCategory;
  /** Severity level for prioritization */
  severity: ViolationSeverity;
  /** Source engine that detected this violation */
  source: ViolationSource;
  /** Specific rule that was violated (optional) */
  rule?: string;
  /** Human-readable description of the violation */
  message?: string;
  /** Suggested fix or action to resolve */
  fixSuggestion?: string;
}

/**
 * Violation categories for semantic grouping
 */
export type ViolationCategory = 
  // TypeScript-related categories (tsc responsibility)
  | 'type-alias'
  | 'annotation' 
  | 'cast'
  | 'record-type'
  | 'generic-unknown'
  | 'unknown-reference'
  | 'branded-type'
  | 'generic-constraint'
  // ESLint code quality categories (separation of concerns)
  | 'code-quality'      // console.log, debugger statements
  | 'style'             // prefer-const, no-var
  | 'architecture'      // import restrictions, module structure
  | 'modernization'     // prefer nullish coalescing, optional chaining
  | 'unused-vars'       // unused variables and imports
  // Legacy type-aware ESLint rules (moving to tsc)
  | 'legacy-type-rule'  // explicit-function-return-type, etc.
  | 'return-type'       // function return type annotations
  | 'no-explicit-any'   // any type usage (handled by tsc now)
  | 'other-eslint'      // other ESLint rules
  // Parsing/syntax categories
  | 'syntax-error'
  | 'parse-error'
  | 'import-error'
  // Code quality categories
  | 'complexity'
  | 'maintainability'
  | 'security'
  | 'performance'
  // Generic fallback
  | 'other';

/**
 * Configuration for crossover detection between ESLint and TypeScript
 */
export interface CrossoverConfig {
  /** Enable crossover detection and warnings */
  enabled: boolean;
  /** Warn when ESLint rules duplicate TypeScript compiler checks */
  warnOnTypeAwareRules: boolean;
  /** Warn when similar violations are found by both engines */
  warnOnDuplicateViolations: boolean;
  /** Exit with error code if crossover is detected */
  failOnCrossover: boolean;
}

/**
 * Crossover warning data
 */
export interface CrossoverWarning {
  type: 'type-aware-rule' | 'duplicate-violation' | 'configuration-conflict';
  message: string;
  details: string;
  suggestion: string;
  severity: 'warn' | 'error';
  affectedRules?: string[];
  affectedFiles?: string[];
}

/**
 * Severity levels for prioritization
 */
export type ViolationSeverity = 'error' | 'warn' | 'info';

/**
 * Source engines that can detect violations
 */
export type ViolationSource = 
  | 'typescript'
  | 'eslint' 
  | 'parser'
  | 'complexity'
  | 'security'
  | 'performance'
  | 'custom';

/**
 * Configuration for audit engines
 */
export interface EngineConfig {
  /** Whether this engine is enabled */
  enabled: boolean;
  /** Engine-specific configuration options */
  options: Record<string, unknown>;
  /** Priority for execution order (lower = higher priority) */
  priority: number;
  /** Maximum time allowed for this engine to run (ms) */
  timeout?: number;
  /** Whether to continue analysis if this engine fails */
  allowFailure?: boolean;
}

/**
 * Results from an audit engine execution
 */
export interface EngineResult {
  /** Name of the engine that produced this result */
  engineName: string;
  /** Violations found by this engine */
  violations: Violation[];
  /** Execution time in milliseconds */
  executionTime: number;
  /** Whether the engine completed successfully */
  success: boolean;
  /** Error message if engine failed */
  error?: string;
  /** Additional metadata from the engine */
  metadata?: Record<string, unknown>;
}

/**
 * Overall orchestrator results
 */
export interface OrchestratorResult {
  /** All violations from all engines, deduplicated */
  violations: Violation[];
  /** Individual engine results */
  engineResults: EngineResult[];
  /** Total execution time */
  totalExecutionTime: number;
  /** Summary statistics */
  summary: ViolationSummary;
  /** Analysis timestamp */
  timestamp: string;
}

/**
 * Summary statistics for violations
 */
export interface ViolationSummary {
  /** Total number of violations */
  total: number;
  /** Breakdown by severity */
  bySeverity: Record<ViolationSeverity, number>;
  /** Breakdown by source engine */
  bySource: Record<ViolationSource, number>;
  /** Breakdown by category */
  byCategory: Record<ViolationCategory, number>;
  /** Top violated files */
  topFiles: Array<{ file: string; count: number }>;
}

/**
 * Watch mode event types
 */
export type WatchEvent = 
  | 'file-changed'
  | 'analysis-started'
  | 'analysis-completed'
  | 'violation-added'
  | 'violation-removed'
  | 'engine-failed'
  | 'watch-stopped';

/**
 * Watch mode event data
 */
export interface WatchEventData {
  /** Type of event */
  type: WatchEvent;
  /** Timestamp of the event */
  timestamp: string;
  /** Event-specific payload */
  payload: unknown;
}