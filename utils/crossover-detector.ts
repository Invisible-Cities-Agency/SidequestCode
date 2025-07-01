/**
 * @fileoverview Crossover Detection System
 *
 * Detects when ESLint and TypeScript are stepping on each other's toes,
 * violating the separation of concerns principle. Provides warnings and
 * suggestions for optimal tool configuration.
 */

import type {
  Violation,
  CrossoverConfig,
  CrossoverWarning,
  OrchestratorResult,
} from "./violation-types.js";

/**
 * Type-aware ESLint rules that should be handled by TypeScript compiler
 */
const TYPE_AWARE_ESLINT_RULES = new Set([
  "@typescript-eslint/explicit-function-return-type",
  "@typescript-eslint/explicit-module-boundary-types",
  "@typescript-eslint/no-explicit-any",
  "@typescript-eslint/no-implicit-any-catch",
  "@typescript-eslint/strict-boolean-expressions",
  "@typescript-eslint/prefer-includes",
  "@typescript-eslint/prefer-string-starts-ends-with",
  "@typescript-eslint/prefer-readonly",
  "@typescript-eslint/prefer-readonly-parameter-types",
  "@typescript-eslint/require-array-sort-compare",
  "@typescript-eslint/restrict-plus-operands",
  "@typescript-eslint/restrict-template-expressions",
  "@typescript-eslint/unbound-method",
  "@typescript-eslint/prefer-reduce-type-parameter",
  "@typescript-eslint/prefer-return-this-type",
  "@typescript-eslint/promise-function-async",
  "@typescript-eslint/require-await",
  "@typescript-eslint/return-await",
  "@typescript-eslint/no-base-to-string",
  "@typescript-eslint/no-confusing-void-expression",
  "@typescript-eslint/no-meaningless-void-operator",
  "@typescript-eslint/no-unnecessary-boolean-literal-compare",
  "@typescript-eslint/no-unnecessary-condition",
  "@typescript-eslint/no-unnecessary-qualifier",
  "@typescript-eslint/no-unnecessary-type-arguments",
  "@typescript-eslint/no-unnecessary-type-assertion",
  "@typescript-eslint/no-unnecessary-type-constraint",
  "@typescript-eslint/non-nullable-type-assertion-style",
  "@typescript-eslint/prefer-for-of",
  "@typescript-eslint/prefer-function-type",
  "@typescript-eslint/prefer-literal-enum-member",
  "@typescript-eslint/prefer-namespace-keyword",
  "@typescript-eslint/prefer-nullish-coalescing",
  "@typescript-eslint/prefer-optional-chain",
]);

/**
 * Detects crossover violations between ESLint and TypeScript
 */
const DEFAULT_CROSSOVER_CONFIG: CrossoverConfig = {
  enabled: true,
  warnOnTypeAwareRules: true,
  warnOnDuplicateViolations: true,
  failOnCrossover: false,
};

export class CrossoverDetector {
  private config: CrossoverConfig;
  private warnings: CrossoverWarning[] = [];

  constructor(config: CrossoverConfig = DEFAULT_CROSSOVER_CONFIG) {
    this.config = config;
  }

  /**
   * Analyze orchestrator results for crossover issues
   */
  analyze(result: OrchestratorResult): CrossoverWarning[] {
    if (!this.config.enabled) {
      return [];
    }

    this.warnings = [];

    // Check for type-aware ESLint rules
    if (this.config.warnOnTypeAwareRules) {
      this.detectTypeAwareRules(result);
    }

    // Check for duplicate violations
    if (this.config.warnOnDuplicateViolations) {
      this.detectDuplicateViolations(result);
    }

    // Check for configuration conflicts
    this.detectConfigurationConflicts(result);

    return this.warnings;
  }

  /**
   * Detect ESLint rules that duplicate TypeScript compiler functionality
   */
  private detectTypeAwareRules(result: OrchestratorResult): void {
    const eslintViolations = result.violations.filter(
      (v) => v.source === "eslint",
    );
    const typeAwareRules = new Set<string>();

    for (const violation of eslintViolations) {
      if (violation.rule && TYPE_AWARE_ESLINT_RULES.has(violation.rule)) {
        typeAwareRules.add(violation.rule);
      }
    }

    if (typeAwareRules.size > 0) {
      this.warnings.push({
        type: "type-aware-rule",
        message: `Found ${typeAwareRules.size} type-aware ESLint rule(s) that duplicate TypeScript compiler functionality`,
        details: `Type-aware rules detected: ${[...typeAwareRules].join(", ")}. These rules require full type checking and significantly slow down ESLint while duplicating what TypeScript already does.`,
        suggestion:
          "Disable these rules in ESLint and rely on TypeScript compiler with strict settings (noImplicitAny, strictNullChecks, etc.) for type safety.",
        severity: "warn",
        affectedRules: [...typeAwareRules],
      });
    }
  }

  /**
   * Detect violations that appear in both TypeScript and ESLint results
   */
  private detectDuplicateViolations(result: OrchestratorResult): void {
    const tsViolations = result.violations.filter(
      (v) => v.source === "typescript",
    );
    const eslintViolations = result.violations.filter(
      (v) => v.source === "eslint",
    );

    const duplicates = new Map<
      string,
      { ts: Violation[]; eslint: Violation[] }
    >();

    // Group by file:line to find potential duplicates
    for (const tsViolation of tsViolations) {
      const key = `${tsViolation.file}:${tsViolation.line}`;
      if (!duplicates.has(key)) {
        duplicates.set(key, { ts: [], eslint: [] });
      }
      duplicates.get(key)!.ts.push(tsViolation);
    }

    for (const eslintViolation of eslintViolations) {
      const key = `${eslintViolation.file}:${eslintViolation.line}`;
      if (duplicates.has(key)) {
        duplicates.get(key)!.eslint.push(eslintViolation);
      }
    }

    // Find locations with violations from both engines
    const conflictingLocations = [...duplicates.entries()].filter(
      ([, violations]) =>
        violations.ts.length > 0 && violations.eslint.length > 0,
    );

    if (conflictingLocations.length > 0) {
      const affectedFiles = conflictingLocations
        .map(([key]) => key.split(":")[0])
        .filter((file): file is string => file !== undefined);
      const uniqueAffectedFiles = [...new Set(affectedFiles)];

      this.warnings.push({
        type: "duplicate-violation",
        message: `Found ${conflictingLocations.length} location(s) with violations from both TypeScript and ESLint`,
        details:
          "Both engines are reporting issues at the same locations, suggesting overlapping responsibilities. This may indicate type-aware ESLint rules that duplicate TypeScript compiler checks.",
        suggestion:
          "Review ESLint configuration to ensure it focuses on code quality rather than type checking. Consider disabling type-aware rules and letting TypeScript handle all type safety.",
        severity: "warn",
        affectedFiles: uniqueAffectedFiles,
      });
    }
  }

  /**
   * Detect configuration conflicts and suboptimal setups
   */
  private detectConfigurationConflicts(result: OrchestratorResult): void {
    const eslintViolations = result.violations.filter(
      (v) => v.source === "eslint",
    );
    const legacyTypeRules = eslintViolations.filter(
      (v) => v.category === "legacy-type-rule",
    );

    if (legacyTypeRules.length > 0) {
      const rules = [
        ...new Set(
          legacyTypeRules
            .map((v) => v.rule)
            .filter((rule): rule is string => rule !== undefined),
        ),
      ];

      this.warnings.push({
        type: "configuration-conflict",
        message: `Found ${legacyTypeRules.length} violations from legacy type-aware ESLint rules`,
        details: `Rules like ${rules.join(", ")} are categorized as legacy because they duplicate TypeScript compiler functionality and significantly impact ESLint performance.`,
        suggestion:
          "Move these checks to TypeScript compiler configuration (tsconfig.json) with strict settings: noImplicitAny, strictNullChecks, noImplicitReturns, etc.",
        severity: "warn",
        affectedRules: rules,
      });
    }

    // Check for performance indicators
    const eslintExecution =
      result.engineResults.find((r) => r.engineName === "ESLint Audit")
        ?.executionTime || 0;

    if (eslintExecution > 10_000) {
      // > 10 seconds
      this.warnings.push({
        type: "configuration-conflict",
        message: `ESLint execution time is high (${Math.round(eslintExecution / 1000)}s), suggesting type-aware rules`,
        details:
          "ESLint taking more than 10 seconds often indicates type-aware rules that require full TypeScript program analysis.",
        suggestion:
          "Disable type-aware ESLint rules and focus on code quality rules (no-console, prefer-const, etc.) for faster feedback. Let TypeScript handle type checking.",
        severity: "warn",
      });
    }
  }

  /**
   * Check if any critical crossover issues were found
   */
  hasCriticalIssues(): boolean {
    return this.warnings.some((w) => w.severity === "error");
  }

  /**
   * Get suggestions for optimal configuration
   */
  getOptimizationSuggestions(): string[] {
    const suggestions = [
      "🎯 ESLint Focus: code quality, style, architecture rules (no-console, prefer-const, unicorn rules)",
      "🛡️ TypeScript Focus: all type safety (strict: true, noImplicitAny, strictNullChecks)",
      "⚡ Performance: Disable type-aware ESLint rules for 5-10x speedup",
      "🔧 Configuration: Use @typescript-eslint/eslint-plugin for syntax rules only",
      "📊 Monitoring: Regular crossover detection to maintain separation",
    ];

    return suggestions;
  }

  /**
   * Display crossover warnings in console
   */
  displayWarnings(): void {
    if (this.warnings.length === 0) {
      console.log(
        "✅ No crossover issues detected - good separation of concerns!",
      );
      return;
    }

    console.log("\n⚠️  Crossover Detection Report");
    console.log("━".repeat(50));

    for (const warning of this.warnings) {
      const icon = warning.severity === "error" ? "❌" : "⚠️";
      console.log(`\n${icon} ${warning.message}`);
      console.log(`   ${warning.details}`);
      console.log(`   💡 Suggestion: ${warning.suggestion}`);

      if (warning.affectedRules && warning.affectedRules.length > 0) {
        console.log(
          `   📋 Rules: ${warning.affectedRules.slice(0, 3).join(", ")}${warning.affectedRules.length > 3 ? "..." : ""}`,
        );
      }
    }

    console.log("\n🎯 Optimization Suggestions:");
    this.getOptimizationSuggestions().forEach((suggestion) => {
      console.log(`   ${suggestion}`);
    });

    console.log("━".repeat(50));
  }
}

/**
 * Utility function to create a crossover detector with default settings
 */
export function createCrossoverDetector(
  config?: Partial<CrossoverConfig>,
): CrossoverDetector {
  return new CrossoverDetector({
    enabled: true,
    warnOnTypeAwareRules: true,
    warnOnDuplicateViolations: true,
    failOnCrossover: false,
    ...config,
  });
}
