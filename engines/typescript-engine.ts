/**
 * @fileoverview TypeScript audit engine
 * 
 * Extracts and refactors the TypeScript violation detection logic from the original
 * audit-unknowns.ts script into a modular, reusable engine.
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
 * Engine for detecting TypeScript unknown/any usage violations
 * 
 * Uses ripgrep for fast file scanning and applies sophisticated filtering
 * to identify legitimate vs problematic unknown usage patterns.
 */
export class TypeScriptAuditEngine extends BaseAuditEngine {
  private readonly baseDir: string;

  constructor(config = {
    enabled: true,
    options: {
      includeAny: true,
      strict: false,
      targetPath: 'app'
    },
    priority: 1,
    timeout: 30000,
    allowFailure: false
  }) {
    super('TypeScript Audit', 'typescript', config);
    this.baseDir = process.cwd();
  }

  /**
   * Analyze TypeScript files for unknown/any type violations
   */
  protected async analyze(
    targetPath: string, 
    options: Record<string, unknown> = {}
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const includeAny = options.includeAny || this.config.options.includeAny;
    const strict = options.strict || this.config.options.strict;
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
        const result = spawnSync("rg", [
          "--no-heading", 
          "--line-number", 
          "--glob", "*.ts",
          "--glob", "*.tsx", 
          "-e", pattern, 
          searchPath
        ], {
          encoding: "utf-8",
          signal: this.abortController?.signal
        });

        if (result.error) {
          console.warn(`[TypeScript Engine] ripgrep error for pattern "${pattern}":`, result.error.message);
          continue;
        }

        // Process results
        result.stdout.split("\n").forEach((line) => {
          if (line.trim()) {
            seen.add(line.trim());
          }
        });

      } catch (error) {
        console.warn(`[TypeScript Engine] Failed to execute ripgrep for pattern "${pattern}":`, error);
        continue;
      }
    }

    // Process found violations
    for (const entry of seen) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      const [filePath, lineStr, ...rest] = entry.split(":");
      const lineNumber = parseInt(lineStr, 10);
      const code = rest.join(":").trim();

      // Skip invalid entries
      if (!filePath || isNaN(lineNumber) || !code) {
        continue;
      }

      // Apply filtering rules
      if (this.shouldSkipViolation(code, filePath, strict as boolean)) {
        continue;
      }

      const { category, severity } = this.categorizeViolation(code);
      const relativePath = path.relative(this.baseDir, filePath);

      violations.push(this.createViolation(
        relativePath,
        lineNumber,
        code,
        category,
        severity,
        undefined, // No specific rule for TypeScript violations
        this.generateViolationMessage(category, code)
      ));
    }

    return violations;
  }

  /**
   * Get search patterns for ripgrep based on configuration
   */
  private getSearchPatterns(includeAny: boolean): string[] {
    const patterns = [
      ":\\s*unknown\\b",
      "=\\s*unknown\\b", 
      "<unknown>",
      "as unknown",
      "Record<string, unknown>"
    ];

    if (includeAny) {
      patterns.push(
        ":\\s*any\\b",
        "=\\s*any\\b",
        "<any>",
        "as any"
      );
    }

    return patterns;
  }

  /**
   * Determine if a violation should be skipped based on filtering rules
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
   * (Extracted from the original isLegitimateUsage function)
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

    // External Library Generic Constraints
    if (/extends\s+any\[\]\s*\?/.test(code) || 
        /BindParameters\s+extends\s+any\[\]/.test(code)) {
      return true;
    }

    // Storybook Addon Integration
    if (filePath.includes('storybook-addon') && 
        (/ThemedStyledFunctionBase<any,\s*any>/.test(code) ||
         /\[key:\s*string\]:\s*any/.test(code))) {
      return true;
    }

    return false;
  }

  /**
   * Categorize TypeScript violations
   */
  private categorizeViolation(code: string): { 
    category: ViolationCategory, 
    severity: ViolationSeverity 
  } {
    // Function return type patterns (explicit-function-return-type equivalent)
    if (/function\s+\w+\s*\([^)]*\)\s*\{/.test(code) && 
        !/function\s+\w+\s*\([^)]*\)\s*:\s*\w/.test(code)) {
      return { category: 'return-type', severity: 'warn' };
    }

    // Arrow functions without return types
    if (/=\s*\([^)]*\)\s*=>\s*\{/.test(code) && 
        !/=\s*\([^)]*\)\s*:\s*\w+\s*=>\s*\{/.test(code)) {
      return { category: 'return-type', severity: 'warn' };
    }

    // Explicit any usage (no-explicit-any equivalent)
    if (/:\s*any\s*([\|&,;=\)\]\}]|$)/.test(code)) {
      return { category: 'no-explicit-any', severity: 'error' };
    }

    // Type alias definitions
    if (/^(export\s+)?type\s+\w+.*=.*unknown/.test(code)) {
      return { category: 'type-alias', severity: 'error' };
    }

    // Type annotations in parameters/variables (unknown)
    if (/:\s*unknown\s*([\|&,;=\)\]\}]|$)/.test(code)) {
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

    // Generic with unknown
    if (/<.*unknown.*>/.test(code) && !/(Record|Array|Promise)</.test(code)) {
      return { category: 'generic-unknown', severity: 'info' };
    }

    // Generic constraints
    if (/extends\s+(unknown|any)/.test(code)) {
      return { category: 'generic-constraint', severity: 'info' };
    }

    // References to unknown in expressions
    if (/\bunknown\b/.test(code)) {
      return { category: 'unknown-reference', severity: 'info' };
    }

    // Default fallback
    return { category: 'other', severity: 'info' };
  }

  /**
   * Generate human-readable violation messages
   */
  private generateViolationMessage(
    category: ViolationCategory, 
    code: string
  ): string {
    switch (category) {
      case 'return-type':
        return 'Function missing explicit return type annotation - add return type for clarity';
      case 'no-explicit-any':
        return 'Explicit any type usage - replace with specific type or branded unknown';
      case 'type-alias':
        return 'Type alias uses unknown/any - consider defining proper interface';
      case 'annotation':
        return 'Parameter/variable uses unknown - consider specific typing or branded unknown';
      case 'cast':
        return 'Type casting to unknown/any - consider type guards or validation';
      case 'record-type':
        return 'Record type uses unknown - consider specific value types or branded unknown';
      case 'generic-unknown':
        return 'Generic parameter uses unknown - consider constraining type';
      case 'generic-constraint':
        return 'Generic constraint uses unknown/any - consider specific bounds';
      case 'unknown-reference':
        return 'Reference to unknown type - verify if proper typing is possible';
      default:
        return 'Type system violation detected - review for proper typing';
    }
  }

  /**
   * Provide fix suggestions for TypeScript violations
   */
  protected generateFixSuggestion(
    category: ViolationCategory,
    rule?: string,
    code?: string
  ): string | undefined {
    switch (category) {
      case 'type-alias':
        return 'Define a proper interface based on the actual data structure';
      case 'annotation':
        return 'Add specific type annotation based on expected value type';
      case 'cast':
        return 'Use Zod validation with schema.parse() instead of type casting';
      case 'record-type':
        return 'Replace Record<string, unknown> with specific property types';
      case 'generic-unknown':
        return 'Constrain generic type parameter (e.g., T extends SomeInterface)';
      default:
        return 'Review if proper TypeScript typing can replace unknown/any usage';
    }
  }
}