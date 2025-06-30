/**
 * @fileoverview ESLint audit engine with robust error handling
 *
 * Provides ESLint integration that can handle syntax errors gracefully,
 * continuing to analyze valid files while reporting parsing failures separately.
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { BaseAuditEngine } from './base-engine.js';
import type {
  Violation,
  ViolationCategory,
  ViolationSeverity
} from '../utils/violation-types.js';
import { safeJsonParse, ESLintOutputSchema, type ValidatedESLintOutput } from '../utils/validation-schemas.js';

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

  constructor(config?: {
    enabled?: boolean;
    options?: {
      rules?: string[];
      maxWarnings?: number;
      timeout?: number;
      roundRobin?: boolean;  // Use comprehensive analysis by default
    };
    priority?: number;
    timeout?: number;
    allowFailure?: boolean; // ESLint failures shouldn't break the whole analysis
  }) {
    const defaultConfig = {
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
        timeout: 30_000,
        roundRobin: false  // Use comprehensive analysis by default
      },
      priority: 2,
      timeout: 35_000,
      allowFailure: true // ESLint failures shouldn't break the whole analysis
    };
    const mergedConfig = { ...defaultConfig, ...config };
    super('ESLint Audit', 'eslint', mergedConfig);
    this.baseDir = process.cwd();

    // Extract rules with proper fallback
    // Following separation of concerns: ESLint for code quality, tsc for types
    const rulesFromConfig = mergedConfig.options?.rules;
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
    const roundRobin = options['roundRobin'] ?? this.config.options['roundRobin'];

    // For comprehensive analysis, disable round-robin to get all violations
    return roundRobin ? await this.analyzeWithRoundRobin(targetPath, options) : this.analyzeAllRules(targetPath, options);
  }

  /**
   * Round-robin analysis for better performance and error isolation
   */
  private async analyzeWithRoundRobin(
    targetPath: string,
    _options: Record<string, unknown>
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
  private analyzeAllRules(
    targetPath: string,
    _options: Record<string, unknown>
  ): Promise<Violation[]> {
    // Pass empty array to disable rule filtering and get ALL violations
    return this.runESLintForRules([], targetPath);
  }

  /**
   * Select the next rule for round-robin checking
   */
  private selectNextRule(): string | undefined {
    if (this.eslintRules.length === 0) {
      return undefined;
    }

    let ruleToCheck: string | undefined = undefined;
    let attempts = 0;

    // Find the next rule to check (respecting adaptive intervals)
    while (attempts < this.eslintRules.length && !ruleToCheck) {
      const candidateRule = this.eslintRules[this.currentRuleIndex];
      if (!candidateRule) {
        this.currentRuleIndex = (this.currentRuleIndex + 1) % this.eslintRules.length;
        attempts++;
        continue;
      }
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
      ruleToCheck = this.eslintRules[0] || undefined;
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
   * Run ESLint for specific rules with robust handling
   */
  private runESLintForRules(
    rules: string[],
    targetPath: string
  ): Promise<Violation[]> {
    // For comprehensive analysis (empty rules array), use robust approach
    if (rules.length === 0) {
      return this.runESLintRobustly(targetPath);
    }

    // For round-robin with specific rules, use the original approach
    return Promise.resolve(this.runESLintWithBuffer(rules, targetPath));
  }

  /**
   * Robust ESLint execution with temp file + sequential fallback
   */
  private async runESLintRobustly(targetPath: string): Promise<Violation[]> {
    try {
      // Try temp file approach first (fastest for complete analysis)
      console.log('[ESLint Engine] Running comprehensive analysis with temp file...');
      return await this.runESLintWithTempFile(targetPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('ENOBUFS') || errorMessage.includes('buffer') || errorMessage.includes('too large')) {
        console.warn('[ESLint Engine] Large output detected, falling back to sequential rule processing...');
        return this.runESLintSequentially(targetPath);
      } else {
        console.warn('[ESLint Engine] Temp file approach failed, falling back to sequential:', errorMessage);
        return this.runESLintSequentially(targetPath);
      }
    }
  }

  /**
   * Run ESLint with temp file output (fastest for large results)
   */
  private async runESLintWithTempFile(targetPath: string): Promise<Violation[]> {
    const { mkdtemp, readFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');

    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'sidequest-eslint-'));
    const temporaryFile = path.join(temporaryDirectory, 'results.json');
    const maxWarnings = this.config.options['maxWarnings'] as number || 500;
    const timeout = this.config.options['timeout'] as number || 30_000;

    try {
      const eslintArguments = [
        '--format', 'json',
        '--output-file', temporaryFile,
        '--max-warnings', maxWarnings.toString(),
        '--ext', '.ts',
        targetPath
      ];

      console.log('[ESLint Engine] Running with temp file:', eslintArguments.join(' '));
      const result = spawnSync('npx', ['eslint', ...eslintArguments], {
        encoding: 'utf8',
        cwd: this.baseDir,
        timeout,
        signal: this.abortController?.signal
      });

      console.log('[ESLint Engine] Temp file command exit status:', result.status);
      if (result.stderr) {
        console.log('[ESLint Engine] Temp file stderr:', result.stderr.slice(0, 200));
      }

      // Handle ESLint exit codes
      if (result.status === 2) {
        throw new Error(`ESLint configuration error: ${result.stderr}`);
      }

      // Read results from temp file
      const output = await readFile(temporaryFile, 'utf8');

      console.log('[ESLint Engine] Temp file output length:', output.length);
      if (output.length > 100) {
        console.log('[ESLint Engine] First 200 chars:', output.slice(0, 200));
      }

      if (!output.trim()) {
        console.warn('[ESLint Engine] Temp file is empty');
        return [];
      }

      return this.parseESLintOutput(output, []);

    } finally {
      // Cleanup temp file
      try {
        await unlink(temporaryFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run ESLint sequentially by rule groups (reliable fallback)
   */
  private runESLintSequentially(targetPath: string): Violation[] {
    const allViolations: Violation[] = [];

    // Get all rules from project's ESLint config
    const projectRules = this.getProjectESLintRules();

    // Group rules to avoid too many individual calls
    const ruleGroups = this.chunkRules(projectRules, 10); // Process 10 rules at a time

    console.log(`[ESLint Engine] Processing ${ruleGroups.length} rule groups sequentially...`);

    for (let index = 0; index < ruleGroups.length; index++) {
      const ruleGroup = ruleGroups[index];
      if (!ruleGroup) {
        continue; // Skip undefined groups
      }
      console.log(`[ESLint Engine] Processing group ${index + 1}/${ruleGroups.length}: ${ruleGroup.slice(0, 3).join(', ')}${ruleGroup.length > 3 ? '...' : ''}`);

      try {
        const groupViolations = this.runESLintWithSpecificRules(ruleGroup, targetPath);
        allViolations.push(...groupViolations);
      } catch (error) {
        console.warn(`[ESLint Engine] Failed to process rule group ${index + 1}:`, error);
        // Continue with other groups
      }
    }

    console.log(`[ESLint Engine] Sequential processing complete: ${allViolations.length} violations found`);
    return allViolations;
  }

  /**
   * Get rules from project's ESLint config
   */
  private getProjectESLintRules(): string[] {
    try {
      // Try to get rules from the actual ESLint config using a test file
      const result = spawnSync('npx', ['eslint', '--print-config', 'cli.ts'], {
        encoding: 'utf8',
        cwd: this.baseDir,
        timeout: 10_000
      });

      if (result.status === 0 && result.stdout) {
        const config = JSON.parse(result.stdout);
        const rules = Object.keys(config.rules || {});
        console.log(`[ESLint Engine] Found ${rules.length} rules from project config`);
        if (rules.length > 0) {
          return rules;
        }
      } else {
        console.warn('[ESLint Engine] Failed to get project config:', result.stderr);
      }
    } catch (error) {
      console.warn('[ESLint Engine] Could not parse project rules:', error);
    }

    // Fallback to rules explicitly defined in .eslintrc.cjs
    console.log('[ESLint Engine] Using fallback rules from .eslintrc.cjs');
    return [
      // Core ESLint rules from .eslintrc.cjs
      'no-debugger',
      'no-alert',
      'no-eval',
      'no-implied-eval',
      'no-new-func',
      'no-script-url',
      'no-self-compare',
      'no-sequences',
      'no-throw-literal',
      'no-unmodified-loop-condition',
      'no-unused-expressions',
      'no-useless-call',
      'no-useless-concat',
      'no-useless-return',
      'no-void',
      'prefer-promise-reject-errors',
      'require-await',
      'indent',
      'quotes',
      'semi',
      'comma-dangle',
      'object-curly-spacing',
      'array-bracket-spacing',
      'space-before-function-paren',
      'keyword-spacing',
      'space-infix-ops',
      'eol-last',
      'no-trailing-spaces',
      'no-multiple-empty-lines',
      'curly',
      'eqeqeq',
      'no-var',
      'prefer-const',
      'prefer-arrow-callback',
      'arrow-spacing',
      'no-duplicate-imports',
      'object-shorthand',
      'prefer-template',

      // Unicorn rules that are enabled in .eslintrc.cjs
      'unicorn/prefer-string-slice',
      'unicorn/prefer-array-some',
      'unicorn/prefer-includes',
      'unicorn/prefer-object-from-entries',
      'unicorn/no-useless-undefined',
      'unicorn/prefer-ternary',

      // Additional unicorn rules from plugin:unicorn/recommended
      'unicorn/prevent-abbreviations',
      'unicorn/no-null',
      'unicorn/no-array-reduce',
      'unicorn/prefer-node-protocol',
      'unicorn/prefer-array-flat-map',
      'unicorn/prefer-string-starts-ends-with',
      'unicorn/prefer-number-properties',
      'unicorn/no-array-instanceof',
      'unicorn/prefer-spread',
      'unicorn/explicit-length-check'
    ];
  }

  /**
   * Chunk rules into groups for sequential processing
   */
  private chunkRules(rules: string[], chunkSize: number): string[][] {
    const chunks: string[][] = [];
    for (let index = 0; index < rules.length; index += chunkSize) {
      chunks.push(rules.slice(index, index + chunkSize));
    }
    return chunks;
  }

  /**
   * Run ESLint with specific rules enabled using project config
   */
  private runESLintWithSpecificRules(rules: string[], targetPath: string): Violation[] {
    const maxWarnings = this.config.options['maxWarnings'] as number || 500;
    const timeout = this.config.options['timeout'] as number || 30_000;

    // Use project's ESLint config but filter results to specific rules
    const eslintArguments = [
      '--format', 'json',
      '--max-warnings', maxWarnings.toString(),
      '--ext', '.ts',
      targetPath
    ];

    const result = spawnSync('npx', ['eslint', ...eslintArguments], {
      encoding: 'utf8',
      cwd: this.baseDir,
      maxBuffer: 1024 * 1024 * 2, // Smaller buffer for rule groups
      timeout,
      signal: this.abortController?.signal
    });

    if (result.error) {
      throw new Error(`ESLint execution failed for rules ${rules.join(', ')}: ${result.error.message}`);
    }

    if (result.status === 2) {
      throw new Error(`ESLint configuration error for rules ${rules.join(', ')}: ${result.stderr}`);
    }

    if (!result.stdout) {
      return [];
    }

    // Parse and filter to only the specified rules
    return this.parseESLintOutput(result.stdout, rules);
  }

  /**
   * Original buffer-based approach for round-robin mode
   */
  private runESLintWithBuffer(
    rules: string[],
    targetPath: string
  ): Violation[] {
    const maxWarnings = this.config.options['maxWarnings'] as number || 500;
    const timeout = this.config.options['timeout'] as number || 30_000;

    const eslintArguments = [
      '--format', 'json',
      '--max-warnings', maxWarnings.toString(),
      '--ext', '.ts',
      targetPath
    ];

    try {
      const result = spawnSync('npx', ['eslint', ...eslintArguments], {
        encoding: 'utf8',
        cwd: this.baseDir,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout,
        signal: this.abortController?.signal
      });

      if (result.error) {
        const errorCode = (result.error as any).code;
        if (errorCode === 'ENOBUFS') {
          throw new Error('Buffer overflow - switching to robust mode');
        } else if (errorCode === 'ETIMEDOUT') {
          console.warn('[ESLint Engine] Timeout - skipping ESLint results for this check');
          return [];
        } else {
          console.warn('[ESLint Engine] Execution error:', result.error.message);
          return [];
        }
      }

      if (result.status === 2) {
        console.warn('[ESLint Engine] ESLint configuration error:', result.stderr?.slice(0, 500));
        return [];
      }

      if (result.stderr) {
        console.warn('[ESLint Engine] stderr:', result.stderr.slice(0, 200));
      }

      if (!result.stdout) {
        console.warn('[ESLint Engine] No output received');
        return [];
      }

      return this.parseESLintOutput(result.stdout, rules);

    } catch (error) {
      console.warn('[ESLint Engine] Buffer-based execution failed:', error);
      return [];
    }
  }

  /**
   * Parse ESLint JSON output into violations
   */
  private parseESLintOutput(output: string, filterRules?: string[]): Violation[] {
    let eslintResults: ValidatedESLintOutput;

    try {
      // Use Zod validation for secure JSON parsing
      eslintResults = safeJsonParse(output, ESLintOutputSchema, 'ESLint output');
      console.log('[Security] ESLint output validated successfully');
    } catch (error: any) {
      console.warn('[ESLint Engine] Failed to parse and validate JSON output:', error.message);

      // Try to extract partial JSON if output was truncated
      const lastBracket = output.lastIndexOf(']');
      if (lastBracket > 0) {
        try {
          const partialOutput = output.slice(0, Math.max(0, lastBracket + 1));
          eslintResults = safeJsonParse(partialOutput, ESLintOutputSchema, 'partial ESLint output');
          console.warn('[ESLint Engine] Recovered partial ESLint results with validation');
        } catch {
          console.warn('[ESLint Engine] Could not recover and validate partial JSON');
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
        // If filterRules is empty, include ALL violations (comprehensive mode)
        if (filterRules && filterRules.length > 0 && (!message.ruleId || !filterRules.includes(message.ruleId))) {
          continue;
        }

        const { category, severity } = this.categorizeESLintRule(message.ruleId || 'unknown');

        violations.push(this.createViolation(
          relativePath,
          message.line || 1,
          message.message || 'ESLint violation',
          category,
          severity,
          message.ruleId || undefined,
          message.message,
          message.column
        ));
      }
    }

    return violations;
  }

  /**
   * Dynamically categorize ESLint violations based on rule patterns
   * Uses pattern matching instead of hard-coded lists for maintainability
   */
  private categorizeESLintRule(rule: string): {
    category: ViolationCategory,
    severity: ViolationSeverity
  } {
    // Pattern-based categorization for unused variables
    if (rule.includes('unused-vars') || rule.includes('no-unused')) {
      return { category: 'unused-vars', severity: 'warn' };
    }

    // Pattern-based categorization for modernization (prefer-* and no-legacy patterns)
    if (rule.startsWith('unicorn/prefer-') ||
        rule.startsWith('unicorn/no-') ||
        rule.includes('prefer-') ||
        rule === 'no-var') {
      return { category: 'modernization', severity: 'info' };
    }

    // Pattern-based categorization for style/formatting
    if (rule.includes('consistent') ||
        rule.includes('abbreviations') ||
        rule.includes('destructuring') ||
        rule.includes('spacing') ||
        rule.includes('indent') ||
        rule.includes('quote') ||
        rule.includes('semi') ||
        rule.includes('comma') ||
        rule.includes('import') ||
        rule.includes('duplicate')) {
      return { category: 'style', severity: 'info' };
    }

    // Pattern-based categorization for code quality
    if (rule.includes('undef') ||
        rule.includes('console') ||
        rule.includes('debugger') ||
        rule.includes('await') ||
        rule.includes('async') ||
        rule.includes('quality')) {
      return { category: 'code-quality', severity: 'warn' };
    }

    // Pattern-based categorization for TypeScript best practices
    if (rule.startsWith('@typescript-eslint/') &&
        (rule.includes('explicit') || rule.includes('any') || rule.includes('boundary'))) {
      return { category: 'best-practices', severity: 'warn' };
    }

    // Pattern-based categorization for syntax/parsing errors
    if (rule.includes('parse') || rule.includes('syntax') || rule.includes('error')) {
      return { category: 'syntax-error', severity: 'error' };
    }

    // Default fallback - let the session discovery handle unknown rules
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
    const lastCheckedRule = [...this.ruleLastCheck.entries()]
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
