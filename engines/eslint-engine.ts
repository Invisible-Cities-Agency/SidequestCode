/**
 * @fileoverview ESLint audit engine with robust error handling
 * 
 * Provides ESLint integration that can handle syntax errors gracefully,
 * continuing to analyze valid files while reporting parsing failures separately.
 */

import { spawnSync } from "child_process";
import * as path from "path";
import { BaseAuditEngine } from './base-engine.js';
import type { 
  Violation, 
  ViolationCategory, 
  ViolationSeverity 
} from '../utils/violation-types.js';

/**
 * Engine for ESLint-based code quality analysis
 * 
 * Key features:
 * - Graceful handling of syntax errors
 * - Round-robin rule checking for performance
 * - Buffer overflow protection
 * - Configurable rule sets
 */
export class ESLintAuditEngine extends BaseAuditEngine {
  private readonly baseDir: string;
  private currentRuleIndex = 0;
  private eslintRules: string[];
  private violationCache = new Map<string, Violation[]>();
  private ruleZeroCount = new Map<string, number>();
  private ruleLastCheck = new Map<string, number>();
  private checksCount = 0;

  // Adaptive polling constants
  private readonly ZERO_THRESHOLD = 5;
  private readonly REDUCED_INTERVAL = 5;

  constructor(config = {
    enabled: true,
    options: {
      rules: [
        '@typescript-eslint/explicit-function-return-type',
        '@typescript-eslint/no-unused-vars',
        '@typescript-eslint/no-explicit-any',
        '@typescript-eslint/explicit-module-boundary-types',
        '@typescript-eslint/no-deprecated',
        '@typescript-eslint/no-non-null-assertion',
        '@typescript-eslint/ban-ts-comment'
      ],
      maxWarnings: 500,
      timeout: 30000,
      roundRobin: true
    },
    priority: 2,
    timeout: 35000,
    allowFailure: true // ESLint failures shouldn't break the whole analysis
  }) {
    super('ESLint Audit', 'eslint', config);
    this.baseDir = process.cwd();
    
    // Extract rules with proper fallback
    // Following separation of concerns: ESLint for code quality, tsc for types
    const rulesFromConfig = config.options?.rules;
    this.eslintRules = Array.isArray(rulesFromConfig) ? rulesFromConfig : [
      // Code Quality & Style (non-type-aware)
      'no-console',
      'no-debugger', 
      'prefer-const',
      'no-var',
      'no-unused-vars',
      
      // Performance & Architecture
      'no-floating-promises',
      'no-restricted-imports',
      
      // TypeScript-specific but performance-focused
      '@typescript-eslint/no-unused-vars',
      '@typescript-eslint/prefer-nullish-coalescing',
      '@typescript-eslint/prefer-optional-chain',
      
      // Comprehensive Unicorn rules (matching actual ESLint config)
      'unicorn/prefer-node-protocol',
      'unicorn/prefer-module',
      'unicorn/prefer-array-flat-map',
      'unicorn/prefer-string-starts-ends-with',
      'unicorn/prefer-number-properties',
      'unicorn/no-array-instanceof',
      'unicorn/prefer-spread',
      'unicorn/explicit-length-check',
      'unicorn/no-useless-undefined'
    ];
    
  }

  /**
   * Analyze files with ESLint
   */
  protected async analyze(
    targetPath: string, 
    options: Record<string, unknown> = {}
  ): Promise<Violation[]> {
    const roundRobin = options.roundRobin ?? this.config.options.roundRobin;
    
    if (roundRobin) {
      return this.analyzeWithRoundRobin(targetPath, options);
    } else {
      return this.analyzeAllRules(targetPath, options);
    }
  }

  /**
   * Round-robin analysis for better performance and error isolation
   */
  private async analyzeWithRoundRobin(
    targetPath: string, 
    options: Record<string, unknown>
  ): Promise<Violation[]> {
    this.checksCount++;
    
    // Determine which rule to check this cycle
    const ruleToCheck = this.selectNextRule();
    
    if (!ruleToCheck) {
      // Return cached violations if no rule selected
      return this.getAllCachedViolations();
    }

    // Run ESLint for the selected rule
    const ruleViolations = await this.runESLintForRules([ruleToCheck], targetPath);
    
    // Update cache
    this.violationCache.set(ruleToCheck, ruleViolations);
    this.ruleLastCheck.set(ruleToCheck, this.checksCount);
    
    // Update zero count tracking
    if (ruleViolations.length === 0) {
      this.ruleZeroCount.set(ruleToCheck, (this.ruleZeroCount.get(ruleToCheck) || 0) + 1);
    } else {
      this.ruleZeroCount.set(ruleToCheck, 0);
    }

    // Return all cached violations
    return this.getAllCachedViolations();
  }

  /**
   * Analyze with all rules at once (traditional approach)
   */
  private async analyzeAllRules(
    targetPath: string, 
    options: Record<string, unknown>
  ): Promise<Violation[]> {
    return this.runESLintForRules(this.eslintRules, targetPath);
  }

  /**
   * Select the next rule for round-robin checking
   */
  private selectNextRule(): string | null {
    if (this.eslintRules.length === 0) {
      return null;
    }

    let ruleToCheck: string | null = null;
    let attempts = 0;
    
    // Find the next rule to check (respecting adaptive intervals)
    while (attempts < this.eslintRules.length && !ruleToCheck) {
      const candidateRule = this.eslintRules[this.currentRuleIndex];
      const zeroCount = this.ruleZeroCount.get(candidateRule) || 0;
      const lastCheck = this.ruleLastCheck.get(candidateRule) || 0;
      
      // First run or normal frequency checking
      if (this.checksCount <= 1 || zeroCount < this.ZERO_THRESHOLD) {
        ruleToCheck = candidateRule;
      } else {
        // If rule has been zero for >= ZERO_THRESHOLD times, check less frequently
        const cyclesSinceLastCheck = this.checksCount - lastCheck;
        if (cyclesSinceLastCheck >= this.REDUCED_INTERVAL) {
          ruleToCheck = candidateRule;
        }
      }
      
      // Move to next rule regardless
      this.currentRuleIndex = (this.currentRuleIndex + 1) % this.eslintRules.length;
      attempts++;
    }
    
    // Fallback: if no rule was selected, force check the first rule
    if (!ruleToCheck) {
      ruleToCheck = this.eslintRules[0];
      this.currentRuleIndex = 1 % this.eslintRules.length;
    }
    
    return ruleToCheck;
  }

  /**
   * Get all violations from the cache
   */
  private getAllCachedViolations(): Violation[] {
    const allViolations: Violation[] = [];
    for (const violations of this.violationCache.values()) {
      allViolations.push(...violations);
    }
    return allViolations;
  }

  /**
   * Run ESLint for specific rules
   */
  private async runESLintForRules(
    rules: string[], 
    targetPath: string
  ): Promise<Violation[]> {
    const maxWarnings = this.config.options.maxWarnings as number || 500;
    const timeout = this.config.options.timeout as number || 30000;
    
    // For round-robin mode, we'll run ESLint normally and filter results
    // Rather than trying to override rules via command line which requires plugin configuration
    const eslintArgs = [
      '--format', 'json',
      '--max-warnings', maxWarnings.toString(),
      `${targetPath}/**/*.ts`,
      `${targetPath}/**/*.tsx`
    ];

    try {
      const result = spawnSync("npx", ["eslint", ...eslintArgs], {
        encoding: "utf-8",
        cwd: this.baseDir,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout,
        signal: this.abortController?.signal
      });


      // Handle various error conditions gracefully
      if (result.error) {
        if (result.error.code === 'ENOBUFS') {
          console.warn(`[ESLint Engine] Output buffer overflow - results may be incomplete`);
        } else if (result.error.code === 'ETIMEDOUT') {
          console.warn(`[ESLint Engine] Timeout - skipping ESLint results for this check`);
          return [];
        } else {
          console.warn(`[ESLint Engine] Execution error:`, result.error.message);
          return [];
        }
      }

      // Handle ESLint exit codes:
      // 0 = no linting errors
      // 1 = linting errors found
      // 2 = configuration error
      if (result.status === 2) {
        console.warn(`[ESLint Engine] ESLint configuration error:`);
        if (result.stderr) {
          console.warn(`[ESLint Engine] stderr:`, result.stderr.substring(0, 500));
        }
        return [];
      }

      // Log stderr for debugging (but don't fail on it for status 0 or 1)
      if (result.stderr) {
        console.warn(`[ESLint Engine] stderr:`, result.stderr.substring(0, 200));
      }

      if (!result.stdout) {
        console.warn(`[ESLint Engine] No output received`);
        return [];
      }

      return this.parseESLintOutput(result.stdout, rules);

    } catch (error) {
      console.warn(`[ESLint Engine] Failed to execute ESLint:`, error);
      return [];
    }
  }

  /**
   * Parse ESLint JSON output into violations
   */
  private parseESLintOutput(output: string, filterRules?: string[]): Violation[] {
    let eslintResults;
    
    try {
      eslintResults = JSON.parse(output);
    } catch (parseError) {
      console.warn(`[ESLint Engine] Failed to parse JSON output, trying to extract partial results`);
      // Try to extract partial JSON if output was truncated
      const lastBracket = output.lastIndexOf(']');
      if (lastBracket > 0) {
        try {
          eslintResults = JSON.parse(output.substring(0, lastBracket + 1));
        } catch {
          console.warn(`[ESLint Engine] Could not recover partial JSON`);
          return [];
        }
      } else {
        return [];
      }
    }

    const violations: Violation[] = [];

    for (const fileResult of eslintResults) {
      const relativePath = path.relative(this.baseDir, fileResult.filePath);
      
      for (const message of fileResult.messages) {
        // Filter by specific rules if provided (for round-robin mode)
        if (filterRules && filterRules.length > 0 && filterRules.length < this.eslintRules.length) {
          if (!message.ruleId || !filterRules.includes(message.ruleId)) {
            continue;
          }
        }

        const { category, severity } = this.categorizeESLintRule(message.ruleId || 'unknown');
        
        violations.push(this.createViolation(
          relativePath,
          message.line || 1,
          message.message || 'ESLint violation',
          category,
          severity,
          message.ruleId,
          message.message,
          message.column
        ));
      }
    }

    return violations;
  }

  /**
   * Categorize ESLint violations based on rule names
   * Following separation of concerns: ESLint for code quality, tsc for types
   */
  private categorizeESLintRule(rule: string): { 
    category: ViolationCategory, 
    severity: ViolationSeverity 
  } {
    // Code Quality & Style
    if (rule === 'no-console') {
      return { category: 'code-quality', severity: 'warn' };
    }
    if (rule === 'no-debugger') {
      return { category: 'code-quality', severity: 'error' };
    }
    if (rule === 'prefer-const' || rule === 'no-var') {
      return { category: 'style', severity: 'warn' };
    }
    
    // Performance & Architecture
    if (rule === 'no-floating-promises') {
      return { category: 'performance', severity: 'error' };
    }
    if (rule === 'no-restricted-imports') {
      return { category: 'architecture', severity: 'warn' };
    }
    
    // Variables and Usage
    if (rule === '@typescript-eslint/no-unused-vars' || rule === 'no-unused-vars') {
      return { category: 'unused-vars', severity: 'warn' };
    }
    
    // Modern JavaScript/TypeScript patterns
    if (rule === '@typescript-eslint/prefer-nullish-coalescing' || 
        rule === '@typescript-eslint/prefer-optional-chain') {
      return { category: 'modernization', severity: 'info' };
    }
    
    // Unicorn modernization rules
    if (rule.startsWith('unicorn/prefer-') || 
        rule === 'unicorn/no-array-instanceof' ||
        rule === 'unicorn/explicit-length-check' ||
        rule === 'unicorn/no-useless-undefined') {
      return { category: 'modernization', severity: 'info' };
    }
    
    // Syntax and parsing errors
    if (rule.includes('parse') || rule.includes('syntax')) {
      return { category: 'syntax-error', severity: 'error' };
    }
    
    // Legacy type-aware rules (should be moved to tsc)
    if (rule === '@typescript-eslint/explicit-function-return-type' ||
        rule === '@typescript-eslint/no-explicit-any' ||
        rule === '@typescript-eslint/explicit-module-boundary-types') {
      return { category: 'legacy-type-rule', severity: 'info' };
    }
    
    return { category: 'other-eslint', severity: 'info' };
  }

  /**
   * Get round-robin status for reporting
   */
  getRoundRobinStatus(): {
    lastCheckedRule: string;
    progress: string;
    adaptiveRules: number;
    totalChecks: number;
  } {
    const lastCheckedRule = Array.from(this.ruleLastCheck.entries())
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';
    
    const progress = `${this.currentRuleIndex}/${this.eslintRules.length}`;
    
    const adaptiveRules = this.eslintRules.filter(rule => 
      (this.ruleZeroCount.get(rule) || 0) >= this.ZERO_THRESHOLD
    ).length;

    return {
      lastCheckedRule,
      progress,
      adaptiveRules,
      totalChecks: this.checksCount
    };
  }

  /**
   * Reset round-robin state (useful for testing or cache clearing)
   */
  resetRoundRobinState(): void {
    this.currentRuleIndex = 0;
    this.violationCache.clear();
    this.ruleZeroCount.clear();
    this.ruleLastCheck.clear();
    this.checksCount = 0;
  }

  /**
   * Update ESLint rules
   */
  updateRules(newRules: string[]): void {
    this.eslintRules = newRules;
    this.resetRoundRobinState(); // Reset state when rules change
  }

  /**
   * Get current ESLint rules
   */
  getRules(): string[] {
    return [...this.eslintRules];
  }
}