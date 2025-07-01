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
  | "type-alias"
  | "annotation"
  | "cast"
  | "record-type"
  | "generic-unknown"
  | "unknown-reference"
  | "branded-type"
  | "generic-constraint"
  | "module-resolution" // Import/export issues
  | "unused-code" // Unused variables/imports
  | "null-safety" // Undefined/null safety issues
  | "inheritance" // Override/inheritance issues
  | "index-access" // Index signature access issues
  | "strict-config" // exactOptionalPropertyTypes issues
  // Setup and configuration issues
  | "setup-issue" // Tool configuration or installation problems
  // ESLint code quality categories (separation of concerns)
  | "code-quality" // console.log, debugger statements
  | "style" // prefer-const, no-var
  | "architecture" // import restrictions, module structure
  | "modernization" // prefer nullish coalescing, optional chaining
  | "unused-vars" // unused variables and imports
  | "best-practices" // code patterns and recommendations
  // Legacy type-aware ESLint rules (moving to tsc)
  | "legacy-type-rule" // explicit-function-return-type, etc.
  | "return-type" // function return type annotations
  | "no-explicit-any" // any type usage (handled by tsc now)
  | "other-eslint" // other ESLint rules
  // Custom TypeScript quality categories
  | "type-quality" // General TypeScript quality issues
  | "async-issues" // Floating promises and async/await issues
  | "custom-script-summary" // Summary from custom TypeScript scripts
  // Parsing/syntax categories
  | "syntax-error"
  | "parse-error"
  | "import-error"
  // Code quality categories
  | "complexity"
  | "maintainability"
  | "security"
  | "performance"
  // Code archaeology categories
  | "dead-code" // Unused exports, unreachable code
  | "code-duplication" // Duplicate code blocks
  | "circular-dependency" // Circular import chains (future)
  | "architecture-violation" // Cross-layer imports, rule violations (future)
  // Generic fallback
  | "other";

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
  type: "type-aware-rule" | "duplicate-violation" | "configuration-conflict";
  message: string;
  details: string;
  suggestion: string;
  severity: "warn" | "error";
  affectedRules?: string[];
  affectedFiles?: string[];
}

/**
 * Severity levels for prioritization
 */
export type ViolationSeverity = "error" | "warn" | "info";

/**
 * Source engines that can detect violations
 */
export type ViolationSource =
  | "typescript"
  | "eslint"
  | "unused-exports"
  | "parser"
  | "complexity"
  | "zod-detection"
  | "security"
  | "performance"
  | "archaeology" // Code archaeology analysis
  | "custom";

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
  | "file-changed"
  | "analysis-started"
  | "analysis-completed"
  | "violation-added"
  | "violation-removed"
  | "engine-failed"
  | "watch-stopped";

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

/**
 * Get human-readable label for violation category
 */
export function getCategoryLabel(category: ViolationCategory): string {
  switch (category) {
    // TypeScript categories
    case "type-alias": {
      return "Type Issues";
    }
    case "annotation": {
      return "Missing Types";
    }
    case "cast": {
      return "Type Casting";
    }
    case "module-resolution": {
      return "Import/Export";
    }
    case "unused-code": {
      return "Unused Code";
    }
    case "null-safety": {
      return "Null Safety";
    }
    case "inheritance": {
      return "Class/Override";
    }
    case "index-access": {
      return "Index Access";
    }
    case "strict-config": {
      return "Strict Config";
    }
    case "syntax-error": {
      return "Syntax Error";
    }
    case "setup-issue": {
      return "Setup/Config Issue";
    }

    // ESLint categories
    case "code-quality": {
      return "Code Quality";
    }
    case "style": {
      return "Code Style";
    }
    case "architecture": {
      return "Architecture";
    }
    case "modernization": {
      return "Modernization";
    }
    case "unused-vars": {
      return "Unused Variables";
    }

    // Other categories
    case "complexity": {
      return "Complexity";
    }
    case "maintainability": {
      return "Maintainability";
    }
    case "security": {
      return "Security";
    }
    case "parse-error": {
      return "Parse Error";
    }
    case "import-error": {
      return "Import Error";
    }

    // Legacy/fallback
    default: {
      return category
        .replaceAll("-", " ")
        .replaceAll(/\b\w/g, (l) => l.toUpperCase());
    }
  }
}

// =============================================================================
// ARCHAEOLOGY-SPECIFIC VIOLATION TYPES
// =============================================================================

/**
 * Dead code violation details for unused exports and unreachable code
 */
export interface DeadCodeViolation extends Violation {
  category: "dead-code";
  source: "archaeology";
  /** Type of dead code detected */
  deadCodeType: "unused-export" | "unreachable-code" | "unused-import";
  /** Confidence level of detection (0-1) */
  confidence: number;
  /** Additional metadata for dead code analysis */
  metadata: {
    /** Export name (for unused exports) */
    exportName?: string;
    /** Import source (for unused imports) */
    importSource?: string;
    /** Whether this is re-exported from another module */
    isReExport?: boolean;
    /** Estimated impact of removal (low/medium/high) */
    removalImpact: "low" | "medium" | "high";
  };
}

/**
 * Code duplication violation details for duplicate code blocks
 */
export interface CodeDuplicationViolation extends Violation {
  category: "code-duplication";
  source: "archaeology";
  /** Similarity percentage (0-100) */
  similarity: number;
  /** Number of duplicated tokens */
  tokenCount: number;
  /** Other files containing similar code */
  duplicateFiles: string[];
  /** Additional metadata for duplication analysis */
  metadata: {
    /** Type of duplication detected */
    duplicationType: "exact" | "structural" | "semantic";
    /** Lines range of the duplicate block */
    duplicateLines: { start: number; end: number };
    /** Suggested refactoring approach */
    refactoringApproach:
      | "extract-function"
      | "extract-constant"
      | "extract-module"
      | "pattern-matching";
    /** Estimated effort to fix (low/medium/high) */
    fixEffort: "low" | "medium" | "high";
  };
}

/**
 * Comprehensive archaeology report for code quality analysis
 */
export interface ArchaeologyReport {
  /** Summary of archaeology analysis */
  summary: {
    /** Total violations found */
    totalViolations: number;
    /** Dead code violations */
    deadCodeCount: number;
    /** Code duplication violations */
    duplicationCount: number;
    /** Files analyzed */
    filesAnalyzed: number;
    /** Overall health score (0-100) */
    healthScore: number;
  };
  /** Dead code analysis results */
  deadCode: {
    /** List of unused exports */
    unusedExports: DeadCodeViolation[];
    /** Unreachable code blocks */
    unreachableCode: DeadCodeViolation[];
    /** Unused imports */
    unusedImports: DeadCodeViolation[];
    /** Total lines of dead code */
    totalDeadLines: number;
  };
  /** Code duplication analysis results */
  duplication: {
    /** Exact duplicates */
    exactDuplicates: CodeDuplicationViolation[];
    /** Structural duplicates */
    structuralDuplicates: CodeDuplicationViolation[];
    /** Duplication percentage by file */
    fileMetrics: Record<
      string,
      { duplicatedLines: number; totalLines: number; percentage: number }
    >;
    /** Overall duplication percentage */
    overallDuplication: number;
  };
  /** Actionable recommendations */
  recommendations: {
    /** High-priority fixes */
    highPriority: ArchaeologyRecommendation[];
    /** Medium-priority fixes */
    mediumPriority: ArchaeologyRecommendation[];
    /** Low-priority fixes */
    lowPriority: ArchaeologyRecommendation[];
  };
  /** Technical debt metrics */
  technicalDebt: {
    /** Estimated time to fix all issues (hours) */
    estimatedFixTimeHours: number;
    /** Complexity score (1-10) */
    complexityScore: number;
    /** Maintainability index (0-100) */
    maintainabilityIndex: number;
  };
}

/**
 * Actionable recommendation for archaeology findings
 */
export interface ArchaeologyRecommendation {
  /** Type of recommendation */
  type:
    | "remove-dead-code"
    | "extract-duplicate"
    | "refactor-structure"
    | "improve-imports";
  /** Description of the recommendation */
  description: string;
  /** Files affected by this recommendation */
  affectedFiles: string[];
  /** Estimated effort to implement */
  effort: "low" | "medium" | "high";
  /** Estimated impact on code quality */
  impact: "low" | "medium" | "high";
  /** Specific action steps */
  actionSteps: string[];
  /** Risk level of implementing this change */
  riskLevel: "low" | "medium" | "high";
}

/**
 * JSDoc annotation for archaeology exclusions
 *
 * @example
 * ```typescript
 * /**
 *  * @archaeology-exclude permanent "CLI entry point used by npm scripts"
 *  * @since 0.2.0
 *  *\/
 * export function generatePRD() { ... }
 *
 * /**
 *  * @archaeology-exclude temporary "Used by upcoming feature X"
 *  * @archaeology-recheck-after 0.3.0
 *  * @since 0.2.0
 *  *\/
 * export function experimentalFeature() { ... }
 * ```
 */
export interface ArchaeologyAnnotation {
  /** Type of exclusion */
  type: "permanent" | "temporary";
  /** Human-readable reason for exclusion */
  reason: string;
  /** Version when annotation was added */
  since?: string;
  /** Version after which to recheck (for temporary exclusions) */
  recheckAfter?: string;
  /** Additional metadata */
  metadata?: {
    /** Who added this annotation */
    author?: string;
    /** Related issue or PR */
    issue?: string;
    /** Expected removal date */
    expectedRemoval?: string;
  };
}
