/**
 * @fileoverview TypeScript Compilation Engine
 *
 * Runs the client's TypeScript compiler configuration without imposing opinions.
 * Reports compilation errors exactly as TypeScript reports them.
 * Respects the client's tsconfig.json and compiler options.
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BaseAuditEngine } from './base-engine.js';
import type {
  Violation,
  ViolationCategory,
  ViolationSeverity
} from '../utils/violation-types.js';

/**
 * Engine for TypeScript compilation validation
 *
 * Runs `tsc --noEmit` using the client's tsconfig.json without modification.
 * Reports TypeScript compiler errors without categorization or opinion.
 * Optional: Includes pattern-based checks for unknown/any usage.
 */
export class TypeScriptAuditEngine extends BaseAuditEngine {
  private readonly baseDir: string;

  constructor(config = {
    enabled: true,
    options: {
      includeAny: false, // Optional pattern checking
      strict: false,     // For pattern checks only
      targetPath: 'app',
      checkCompilation: true // Primary function: run tsc --noEmit
    },
    priority: 1,
    timeout: 30_000,
    allowFailure: false
  }) {
    super('TypeScript Compiler', 'typescript', config);
    this.baseDir = process.cwd();
  }

  /**
   * Analyze TypeScript files for compilation errors and optional pattern violations
   */
  protected async analyze(
    targetPath: string,
    options: Record<string, unknown> = {}
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const checkCompilation = options['checkCompilation'] ?? this.config.options['checkCompilation'] ?? true;
    const includeAny = options['includeAny'] ?? this.config.options['includeAny'] ?? false;
    const searchPath = path.join(this.baseDir, targetPath);

    // FIRST: Run TypeScript compiler to catch actual compilation errors
    if (checkCompilation) {
      const compilationViolations = await this.checkTypeScriptCompilation(searchPath);
      violations.push(...compilationViolations);
    }

    // OPTIONAL: Run pattern-based checks for unknown/any usage
    if (includeAny) {
      const patternViolations = await this.checkPatternViolations(targetPath, options);
      violations.push(...patternViolations);
    }

    return violations;
  }

  /**
   * Run TypeScript compiler to detect compilation errors
   */
  private async checkTypeScriptCompilation(searchPath: string): Promise<Violation[]> {
    const violations: Violation[] = [];

    // Find tsconfig.json
    const tsConfigPath = this.findTsConfig(searchPath);
    if (!tsConfigPath) {
      // If no tsconfig, try to run tsc on the directory directly
      return await this.runTscOnDirectory(searchPath);
    }

    // Store client's TypeScript configuration in database for fast access
    await this.cacheTypeScriptConfig(tsConfigPath);

    try {
      // Run tsc --noEmit with the found tsconfig (respecting their exact configuration)
      const result = spawnSync('npx', ['tsc', '--noEmit', '--project', tsConfigPath], {
        encoding: 'utf-8',
        cwd: this.baseDir,
        signal: this.abortController?.signal
      });

      if (result.error) {
        console.warn('[TypeScript Engine] Failed to run tsc:', result.error.message);
        return violations;
      }

      // Parse TypeScript compiler output
      if (result.stderr) {
        const compilationViolations = await this.parseTypeScriptErrors(result.stderr, tsConfigPath);
        violations.push(...compilationViolations);
      }

      // Some errors might be in stdout
      if (result.stdout && result.stdout.includes('error TS')) {
        const compilationViolations = await this.parseTypeScriptErrors(result.stdout, tsConfigPath);
        violations.push(...compilationViolations);
      }

    } catch (error) {
      console.warn('[TypeScript Engine] TypeScript compilation check failed:', error);
    }

    return violations;
  }

  /**
   * Find tsconfig.json starting from search path and moving up
   */
  private findTsConfig(searchPath: string): string | null {
    let currentDir = searchPath;

    while (currentDir !== path.dirname(currentDir)) {
      const tsConfigPath = path.join(currentDir, 'tsconfig.json');
      if (fs.existsSync(tsConfigPath)) {
        return tsConfigPath;
      }
      currentDir = path.dirname(currentDir);
    }

    // Check project root
    const rootTsConfig = path.join(this.baseDir, 'tsconfig.json');
    if (fs.existsSync(rootTsConfig)) {
      return rootTsConfig;
    }

    return null;
  }

  /**
   * Run tsc directly on directory when no tsconfig found
   */
  private async runTscOnDirectory(searchPath: string): Promise<Violation[]> {
    const violations: Violation[] = [];

    try {
      const result = spawnSync('npx', ['tsc', '--noEmit', '--target', 'ES2020', '--module', 'ESNext', '--strict', `${searchPath  }/**/*.ts`], {
        encoding: 'utf-8',
        cwd: this.baseDir,
        signal: this.abortController?.signal
      });

      if (result.stderr) {
        const compilationViolations = await this.parseTypeScriptErrors(result.stderr);
        violations.push(...compilationViolations);
      }

    } catch (error) {
      console.warn('[TypeScript Engine] Direct tsc compilation failed:', error);
    }

    return violations;
  }

  /**
   * Parse TypeScript compiler error output into violations
   */
  private async parseTypeScriptErrors(errorOutput: string, _tsConfigPath?: string): Promise<Violation[]> {
    const violations: Violation[] = [];
    const lines = errorOutput.split('\n');

    for (const line of lines) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      // Match TypeScript error format: file(line,col): error TSxxxx: message
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/);
      if (match) {
        const [, filePath, lineString, , severityString, ruleCode, message] = match;
        if (!filePath || !lineString || !message) {continue;}

        const line = Number.parseInt(lineString, 10);
        // const _column = parseInt(colStr || '0', 10);

        // Make path relative to base directory
        const relativePath = path.relative(this.baseDir, filePath);

        // Use TypeScript's own severity determination
        const severity: ViolationSeverity = severityString === 'error' ? 'error' : 'warn';

        // Get category from database mapping or use default
        const category: ViolationCategory = await this.getCategoryForRule(ruleCode || 'TS0000');

        violations.push(this.createViolation(
          relativePath,
          line,
          message.trim(),
          category,
          severity,
          ruleCode || 'TS0000',
          message.trim()
        ));
      }
    }

    return violations;
  }

  /**
   * Cache TypeScript configuration in database for fast access during watch mode
   */
  private async cacheTypeScriptConfig(tsConfigPath: string): Promise<void> {
    try {
      const configContent = fs.readFileSync(tsConfigPath, 'utf8');
      const config = JSON.parse(configContent);

      // Store in database (pseudo-code - would need actual DB connection)
      // This ensures watch mode and reports can access client configuration quickly
      const configSummary = {
        path: tsConfigPath,
        strict: config.compilerOptions?.strict ?? false,
        exactOptionalPropertyTypes: config.compilerOptions?.exactOptionalPropertyTypes ?? false,
        noUncheckedIndexedAccess: config.compilerOptions?.noUncheckedIndexedAccess ?? false,
        noImplicitAny: config.compilerOptions?.noImplicitAny ?? false,
        target: config.compilerOptions?.target ?? 'ES5',
        module: config.compilerOptions?.module ?? 'CommonJS',
        lastScanned: new Date().toISOString()
      };

      // Log configuration discovery (without imposing opinion)
      console.log(`[TypeScript Engine] Client configuration loaded: ${tsConfigPath}`);
      console.log(`[TypeScript Engine] Strict mode: ${configSummary.strict}`);
      console.log(`[TypeScript Engine] Target: ${configSummary.target}`);

      // TODO: Store configSummary in database for watch mode access

    } catch (error) {
      console.warn('[TypeScript Engine] Could not cache TypeScript config:', error);
    }
  }

  /**
   * Get category for rule from database mapping or create new mapping
   * Uses dynamic database-driven approach instead of hard-coded mappings
   */
  private async getCategoryForRule(ruleCode: string): Promise<ViolationCategory> {
    // TODO: Implement database lookup for rule category mapping
    // For now, use pattern-based fallback until database service is connected
    return this.getDefaultCategoryFromPattern(ruleCode);
  }

  /**
   * Pattern-based fallback for rule categorization until database is integrated
   */
  private getDefaultCategoryFromPattern(ruleCode: string): ViolationCategory {
    const numericCode = ruleCode.replace('TS', '');

    // Type annotation issues (7xxx codes)
    if (/^7\d{3}$/.test(numericCode)) {
      return 'annotation';
    }

    // Module resolution issues
    if (['2307', '2305', '2306', '1016', '1259', '1192', '1149', '2451', '2393', '2440', '2300', '1038'].includes(numericCode)) {
      return 'module-resolution';
    }

    // Unused code issues (6xxx codes)
    if (/^6\d{3}$/.test(numericCode)) {
      return 'unused-code';
    }

    // Null safety issues
    if (['2532', '2533', '2531', '18048', '18047', '2454', '2722', '2721'].includes(numericCode)) {
      return 'null-safety';
    }

    // Class/inheritance issues
    if (['4114', '2515', '2564', '2334', '2335', '2336', '2337', '2510', '2511', '2512', '2513'].includes(numericCode)) {
      return 'inheritance';
    }

    // Index access issues
    if (numericCode === '4111') {
      return 'index-access';
    }

    // Strict config issues
    if (['2375', '2379', '2412'].includes(numericCode)) {
      return 'strict-config';
    }

    // Modernization (decorators, async/await)
    if (['1206', '1207', '1208', '1219', '1308', '1353', '2794'].includes(numericCode)) {
      return 'modernization';
    }

    // Generic/template issues
    if (['2313', '2314', '2430'].includes(numericCode)) {
      return 'generic-constraint';
    }

    // Syntax/parsing errors (1xxx codes)
    if (/^1\d{3}$/.test(numericCode)) {
      return 'syntax-error';
    }

    // Everything else is type-alias (type system issues)
    return 'type-alias';
  }

  /**
   * Run pattern-based checks for unknown/any usage (legacy functionality)
   */
  private async checkPatternViolations(
    targetPath: string,
    options: Record<string, unknown>
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const includeAny = options['includeAny'] || this.config.options['includeAny'];
    const strict = options['strict'] || this.config.options['strict'];
    const searchPath = path.join(this.baseDir, targetPath);

    // Get search patterns based on configuration
    const patterns = this.getSearchPatterns(includeAny as boolean);
    const seen = new Set<string>();

    // Run ripgrep for each pattern
    for (const pattern of patterns) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      try {
        const result = spawnSync('rg', [
          '--no-heading',
          '--line-number',
          '--glob', '*.ts',
          '--glob', '*.tsx',
          '-e', pattern,
          searchPath
        ], {
          encoding: 'utf-8',
          signal: this.abortController?.signal
        });

        if (result.error) {
          continue; // Skip pattern if ripgrep fails
        }

        // Process results
        result.stdout.split('\n').forEach((line) => {
          if (line.trim()) {
            seen.add(line.trim());
          }
        });

      } catch {
        continue; // Skip pattern if ripgrep fails
      }
    }

    // Process found pattern violations
    for (const entry of seen) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      const [filePath, lineString, ...rest] = entry.split(':');
      const lineNumber = Number.parseInt(lineString || '0', 10);
      const code = rest.join(':').trim();

      // Skip invalid entries
      if (!filePath || isNaN(lineNumber) || !code) {
        continue;
      }

      // Apply filtering rules
      if (this.shouldSkipViolation(code, filePath, strict as boolean)) {
        continue;
      }

      const { category, severity } = this.categorizePatternViolation(code);
      const relativePath = path.relative(this.baseDir, filePath);

      violations.push(this.createViolation(
        relativePath,
        lineNumber,
        code,
        category,
        severity,
        'pattern-check',
        this.generatePatternViolationMessage(category, code)
      ));
    }

    return violations;
  }

  /**
   * Get search patterns for ripgrep based on configuration
   */
  private getSearchPatterns(includeAny: boolean): string[] {
    const patterns = [
      ':\\s*unknown\\b',
      '=\\s*unknown\\b',
      '<unknown>',
      'as unknown',
      'Record<string, unknown>'
    ];

    if (includeAny) {
      patterns.push(
        ':\\s*any\\b',
        '=\\s*any\\b',
        '<any>',
        'as any'
      );
    }

    return patterns;
  }

  /**
   * Determine if a pattern violation should be skipped based on filtering rules
   */
  private shouldSkipViolation(
    code: string,
    filePath: string,
    strict: boolean
  ): boolean {
    // Skip if already using BrandedUnknown
    if (/BrandedUnknown/.test(code)) {
      return true;
    }

    // Skip comments
    if (/^\s*(\/\/|\*|\/\*)/.test(code)) {
      return true;
    }

    // In non-strict mode, skip legitimate usage patterns
    if (!strict && this.isLegitimateUsage(code, filePath)) {
      return true;
    }

    return false;
  }

  /**
   * Check if unknown/any usage is legitimate based on established patterns
   */
  private isLegitimateUsage(code: string, filePath: string): boolean {
    // TypeScript Declaration Files (.d.ts)
    if (filePath.endsWith('.d.ts')) {
      return true;
    }

    // Type Guard Functions
    if (/function\s+\w*(is|validate)\w*\s*\([^)]*value\s*:\s*unknown\s*\)/.test(code)) {
      return true;
    }

    // Error Handling Patterns
    if (/catch\s*\([^)]*error\s*:\s*unknown\s*\)/.test(code) ||
        /error\s*instanceof\s+Error\s*\?/.test(code)) {
      return true;
    }

    // API Boundary Validation with Zod
    if (/\.parse\(.*unknown.*\)/.test(code) ||
        /schema\.parse\(/.test(code) ||
        /validateSchema\(/.test(code)) {
      return true;
    }

    return false;
  }

  /**
   * Categorize pattern-based violations (legacy functionality)
   */
  private categorizePatternViolation(code: string): {
    category: ViolationCategory,
    severity: ViolationSeverity
  } {
    // Explicit any usage (no-explicit-any equivalent)
    if (/:\s*any\s*([&),;=\]|}]|$)/.test(code)) {
      return { category: 'no-explicit-any', severity: 'error' };
    }

    // Type alias definitions
    if (/^(export\s+)?type\s+\w+.*=.*unknown/.test(code)) {
      return { category: 'type-alias', severity: 'error' };
    }

    // Type annotations in parameters/variables (unknown)
    if (/:\s*unknown\s*([&),;=\]|}]|$)/.test(code)) {
      return { category: 'annotation', severity: 'warn' };
    }

    // Type casting
    if (/(as\s+(unknown|any)|<(unknown|any)>)/.test(code)) {
      return { category: 'cast', severity: 'warn' };
    }

    // Record types
    if (/Record<.*,\s*(unknown|any)>/.test(code)) {
      return { category: 'record-type', severity: 'info' };
    }

    // References to unknown in expressions
    if (/\bunknown\b/.test(code)) {
      return { category: 'unknown-reference', severity: 'info' };
    }

    // Default fallback
    return { category: 'other', severity: 'info' };
  }

  /**
   * Generate human-readable violation messages for pattern violations
   */
  private generatePatternViolationMessage(
    category: ViolationCategory,
    _code: string
  ): string {
    switch (category) {
    case 'no-explicit-any': {
      return 'Explicit any type usage - replace with specific type or branded unknown';
    }
    case 'type-alias': {
      return 'Type alias uses unknown/any - consider defining proper interface';
    }
    case 'annotation': {
      return 'Parameter/variable uses unknown - consider specific typing or branded unknown';
    }
    case 'cast': {
      return 'Type casting to unknown/any - consider type guards or validation';
    }
    case 'record-type': {
      return 'Record type uses unknown - consider specific value types or branded unknown';
    }
    case 'unknown-reference': {
      return 'Reference to unknown type - verify if proper typing is possible';
    }
    default: {
      return 'Type system violation detected - review for proper typing';
    }
    }
  }

  /**
   * Provide fix suggestions for TypeScript violations
   */
  protected override generateFixSuggestion(
    category: ViolationCategory,
    rule?: string,
    _code?: string
  ): string | undefined {
    // For TypeScript compiler errors, let the compiler message speak for itself
    if (rule?.startsWith('TS')) {
      return 'Refer to TypeScript error message for specific fix guidance';
    }

    // For pattern violations (legacy functionality)
    switch (category) {
    case 'type-alias': {
      return 'Define a proper interface based on the actual data structure';
    }
    case 'annotation': {
      return 'Add specific type annotation based on expected value type';
    }
    case 'cast': {
      return 'Use Zod validation with schema.parse() instead of type casting';
    }
    case 'record-type': {
      return 'Replace Record<string, unknown> with specific property types';
    }
    default: {
      return 'Review TypeScript configuration and error message for guidance';
    }
    }
  }
}
